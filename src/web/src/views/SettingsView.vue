<script setup>
import { computed, onMounted, ref } from 'vue';
import { Gauge, Info, Loader2, Minus, PlugZap, Plus, Save, Server, ShieldAlert, ShieldCheck } from 'lucide-vue-next';
import api from '../api.js';
import { toast } from '../toast.js';
import { bpsToMbps, formatSize, mbpsToBps } from '../format.js';

const loading = ref(true);
const saving = ref(false);
const speedMbps = ref(1);
const concurrency = ref(16);
const apiLimit = ref(30);
const diskAlert = ref(90);

const speedBytes = computed(() => mbpsToBps(speedMbps.value));
const speedReadable = computed(() => `${formatSize(speedBytes.value)} / 秒`);
const unlimited = computed(() => Number(speedMbps.value) === 0);

async function load() {
  loading.value = true;
  try {
    const config = await api.config();
    speedMbps.value = bpsToMbps(config.max_speed_bps);
    concurrency.value = Number(config.max_concurrent_downloads) || 16;
    apiLimit.value = Number(config.api_rate_limit_per_min) || 30;
    diskAlert.value = Number(config.disk_alert_percent) || 90;
  } catch (error) {
    toast.error(error.message);
  } finally {
    loading.value = false;
  }
}

function stepConcurrency(delta) {
  const next = Number(concurrency.value) + delta;
  concurrency.value = Math.min(Math.max(next, 1), 512);
}

function stepDiskAlert(delta) {
  const next = Number(diskAlert.value) + delta;
  diskAlert.value = Math.min(Math.max(next, 50), 100);
}

async function save() {
  saving.value = true;
  try {
    const data = await api.saveConfig({
      max_speed_bps: mbpsToBps(speedMbps.value),
      max_concurrent_downloads: Number(concurrency.value),
      disk_alert_percent: Number(diskAlert.value),
    });
    speedMbps.value = bpsToMbps(data.config.max_speed_bps);
    concurrency.value = Number(data.config.max_concurrent_downloads);
    diskAlert.value = Number(data.config.disk_alert_percent);
    toast.success('配置已保存并立即生效，无需重启服务');
  } catch (error) {
    toast.error(error.message);
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <div v-if="loading" class="glass-card flex items-center justify-center gap-3 py-16 text-sm text-fg-muted">
      <Loader2 class="size-4 animate-spin" />
      正在加载当前配置…
    </div>

    <template v-else>
      <div class="glass-card p-5">
        <div class="flex items-start justify-between gap-4">
          <div class="flex items-start gap-3.5">
            <span class="flex size-11 items-center justify-center rounded-xl bg-brand-500/12 text-brand-300">
              <Gauge class="size-5" />
            </span>
            <div>
              <h3 class="text-sm font-semibold text-fg">单 IP 最高下载速度</h3>
              <p class="mt-1 text-[12px] text-fg-dim">
                该 IP 的所有下载连接共享同一带宽额度，由服务端令牌桶聚合限速
              </p>
            </div>
          </div>
          <span class="badge border border-line bg-white/3 text-fg-muted">{{ unlimited ? '不限速' : speedReadable }}</span>
        </div>

        <div class="mt-6 flex flex-wrap items-center gap-5">
          <input
            v-model.number="speedMbps"
            class="h-1.5 flex-1 min-w-[220px] cursor-pointer appearance-none rounded-full bg-ink-600 accent-brand-500"
            type="range"
            min="0"
            max="100"
            step="0.5"
          />
          <div class="flex items-center gap-2">
            <input
              v-model.number="speedMbps"
              class="field w-[110px] text-center font-mono"
              type="number"
              min="0"
              max="100"
              step="0.5"
            />
            <span class="text-[13px] text-fg-muted">Mbps</span>
          </div>
        </div>
        <p class="mt-3 text-[12px] text-fg-dim">设为 0 表示不限制带宽；默认 1 Mbps ≈ {{ formatSize(125000) }} / 秒</p>
      </div>

      <div class="glass-card p-5">
        <div class="flex items-start gap-3.5">
          <span class="flex size-11 items-center justify-center rounded-xl bg-info/12 text-info">
            <Server class="size-5" />
          </span>
          <div class="flex-1">
            <h3 class="text-sm font-semibold text-fg">单 IP 最大并发下载连接数</h3>
            <p class="mt-1 text-[12px] text-fg-dim">超出上限的新连接将直接返回 503</p>
          </div>
        </div>

        <div class="mt-6 flex items-center gap-3">
          <button class="icon-btn size-9 border-line bg-white/3" type="button" @click="stepConcurrency(-1)">
            <Minus class="size-4" />
          </button>
          <input
            v-model.number="concurrency"
            class="field w-[110px] text-center font-mono"
            type="number"
            min="1"
            max="512"
            step="1"
          />
          <button class="icon-btn size-9 border-line bg-white/3" type="button" @click="stepConcurrency(1)">
            <Plus class="size-4" />
          </button>
          <span class="text-[13px] text-fg-muted">条（默认 16，范围 1 – 512）</span>
        </div>
      </div>

      <div class="glass-card p-5">
        <div class="flex items-start gap-3.5">
          <span class="flex size-11 items-center justify-center rounded-xl bg-warn/12 text-warn">
            <ShieldAlert class="size-5" />
          </span>
          <div class="flex-1">
            <div class="flex items-center justify-between gap-3">
              <h3 class="text-sm font-semibold text-fg">磁盘告警阈值</h3>
              <span class="badge border border-line bg-white/3 font-mono text-fg-muted">{{ diskAlert }}%</span>
            </div>
            <p class="mt-1 text-[12px] text-fg-dim">
              系统监控页在磁盘使用率超过该值时标红提示，范围 50 – 100
            </p>
          </div>
        </div>

        <div class="mt-6 flex items-center gap-3">
          <button class="icon-btn size-9 border-line bg-white/3" type="button" @click="stepDiskAlert(-5)">
            <Minus class="size-4" />
          </button>
          <input
            v-model.number="diskAlert"
            class="field w-[110px] text-center font-mono"
            type="number"
            min="50"
            max="100"
            step="1"
          />
          <button class="icon-btn size-9 border-line bg-white/3" type="button" @click="stepDiskAlert(5)">
            <Plus class="size-4" />
          </button>
          <span class="text-[13px] text-fg-muted">%（默认 90）</span>
        </div>
      </div>

      <div class="glass-card p-5">
        <div class="flex items-start gap-3.5">
          <span class="flex size-11 items-center justify-center rounded-xl bg-ok/12 text-ok">
            <PlugZap class="size-5" />
          </span>
          <div class="flex-1">
            <div class="flex items-center justify-between gap-3">
              <h3 class="text-sm font-semibold text-fg">公开 API 频率限制</h3>
              <span class="badge border border-line bg-white/3 font-mono text-fg-muted">{{ apiLimit }} 次 / 分钟</span>
            </div>
            <p class="mt-1 text-[12px] text-fg-dim">
              作用于 /api/filelink、/api/refresh、/api/info，按客户端 IP 计数，超出返回 429
            </p>
          </div>
        </div>
      </div>

      <div class="glass-card flex flex-wrap items-center justify-between gap-4 p-5">
        <div class="flex items-start gap-3">
          <ShieldCheck class="mt-0.5 size-4.5 text-ok" />
          <p class="text-[12px] leading-relaxed text-fg-dim">
            配置写入 SQLite，重启后依然生效；保存后无需重启服务，正在进行的下载也按新额度计算。
          </p>
        </div>
        <button class="btn-primary min-w-[152px]" type="button" :disabled="saving" @click="save">
          <Loader2 v-if="saving" class="size-4 animate-spin" />
          <Save v-else class="size-4" />
          {{ saving ? '正在保存…' : '保存并立即生效' }}
        </button>
      </div>

      <div class="flex items-start gap-2.5 px-1 text-[12px] text-fg-dim">
        <Info class="mt-0.5 size-3.5 shrink-0" />
        <span>修改限速后，已建立的连接会在下一次读取数据块时套用新的令牌桶速率。</span>
      </div>
    </template>
  </div>
</template>
