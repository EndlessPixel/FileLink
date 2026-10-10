import { Transform } from 'node:stream';
import { getNumber } from '../config/store.js';
import { STREAM_CHUNK_SIZE, THROTTLE_TICK_MS } from '../config/constants.js';

/**
 * 单 IP 聚合带宽令牌桶：同一 IP 的所有下载流共享一个桶与一条 FIFO 等待队列，
 * 因此天然实现"该 IP 所有下载线程合计带宽上限"。
 */
class TokenBucket {
  constructor(ip) {
    this.ip = ip;
    this.tokens = 0;
    this.lastRefill = Date.now();
    this.rate = 0; // bytes / second
    this.capacity = STREAM_CHUNK_SIZE * 2;
    this.queue = [];
    this.timer = null;
    this.active = 0;
  }

  /** 速率取自配置，每次取桶时调用，保证配置热更新立即生效 */
  configure(bitPerSecond) {
    this.rate = Math.max(Number(bitPerSecond) || 0, 0) / 8;
    this.capacity = Math.max(this.rate * 0.5, STREAM_CHUNK_SIZE * 2);
    if (this.tokens > this.capacity) this.tokens = this.capacity;
  }

  plusTokens() {
    const now = Date.now();
    const elapsed = Math.max(now - this.lastRefill, 0) / 1000;
    this.lastRefill = now;
    if (this.rate > 0) this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.rate);
  }

  refill() {
    this.plusTokens();
    this.drain();
  }

  drain() {
    while (this.queue.length > 0) {
      const head = this.queue[0];
      if (head.cancelled) {
        this.queue.shift();
        continue;
      }
      if (this.tokens >= head.need) {
        this.tokens -= head.need;
        this.queue.shift();
        head.resolve();
      } else {
        break;
      }
    }
    this.settle();
  }

  settle() {
    if (this.queue.length === 0 && this.active === 0) {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
      if (buckets.get(this.ip) === this) buckets.delete(this.ip);
    }
  }

  ensureTimer() {
    if (this.timer) return;
    this.timer = setInterval(() => this.refill(), THROTTLE_TICK_MS);
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  /** 申请 bytes 字节的令牌，返回带 _item 引用的 Promise（便于取消） */
  request(bytes) {
    if (this.rate <= 0) return Promise.resolve();
    if (bytes > this.capacity) this.capacity = bytes * 2; // 安全阀，避免死锁

    if (this.queue.length === 0) {
      this.plusTokens();
      if (this.tokens >= bytes) {
        this.tokens -= bytes;
        return Promise.resolve();
      }
    }

    const self = this;
    let item = null;
    const promise = new Promise((resolve, reject) => {
      item = { need: bytes, resolve, reject, cancelled: false };
      self.queue.push(item);
      self.ensureTimer();
    });
    promise._item = item;
    return promise;
  }

  cancel(item) {
    if (item) item.cancelled = true;
  }
}

const buckets = new Map();

function getBucket(ip) {
  let bucket = buckets.get(ip);
  if (!bucket) {
    bucket = new TokenBucket(ip);
    buckets.set(ip, bucket);
  }
  bucket.configure(getNumber('max_speed_bps'));
  return bucket;
}

/**
 * 创建限速 Transform 流：输出前按 IP 聚合速率申请令牌。
 * 流被销毁时自动归还桶的活跃计数并取消挂起的令牌申请。
 */
export function createThrottleStream(ip) {
  const bucket = getBucket(ip);
  bucket.active += 1;
  let pending = null;

  return new Transform({
    highWaterMark: STREAM_CHUNK_SIZE,
    transform(chunk, _encoding, callback) {
      if (bucket.rate <= 0) {
        callback(null, chunk);
        return;
      }
      pending = bucket.request(chunk.length);
      pending.then(
        () => {
          pending = null;
          callback(null, chunk);
        },
        (err) => {
          pending = null;
          callback(err);
        }
      );
    },
    destroy(err, callback) {
      if (pending && pending._item) {
        bucket.cancel(pending._item);
        pending = null;
      }
      bucket.active = Math.max(bucket.active - 1, 0);
      bucket.settle();
      callback(err);
    },
  });
}

/** 测试辅助 */
export function resetBuckets() {
  for (const bucket of buckets.values()) {
    if (bucket.timer) clearInterval(bucket.timer);
  }
  buckets.clear();
}

export { TokenBucket };
