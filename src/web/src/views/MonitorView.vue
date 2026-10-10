<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  Info,
  Loader2,
  Network,
  RefreshCw,
} from 'lucide-vue-next';
import api from '../api.js';
import { toast } from '../toast.js';
import { formatSize } from '../format.js';
import NetworkChart from '../components/NetworkChart.vue';

const REFRESH_MS = 5000;

const loading = ref(true);
const refreshing = ref(false);
const data = ref(null);
let timer = null;

const points = computed(() => data.value?.points ?? []);
const current = computed(() => data.value?.current ?? { rx: 0, tx: 0 });
const peak = computed(() => data.value?.peak ?? { rx: 0, tx: 0 });
const counters = computed(() => data.value?.counters ?? { rx: 0, tx: 0 });
const supported = computed(() => data.value?.supported !== false);
const interfaceName = computed(() => data.value?.interface || '全部网卡（不含 lo）');

function formatRate(bytesPerSecond) {
  return `${formatSize(bytesPerSecond)}/s`;
}

async function load(silent = false) {
  if (silent) refreshing.value = true;
  try {
    data.value = await api.networkMonitor();
  } catch (error) {
    if (!silent) toast.error(error.message);
  } finally {
    if (!silent) loading.value = false;
    refreshing.value = false;
  }
}

onMounted(() => {
  load();
  timer = setInterval(() => load(true), REFRESH_MS);
});

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <div class="space-y-6">
    <div v-if="loading" class="glass-card flex items-center justify-center gap-3 py-16 text-sm text-fg-muted">
      <Loader2 class="size-4 animate-spin" />
      正在读取网络流量…
    </div>

    <div v-else-if="!supported" class="glass-card flex items-start gap-3 p-5">
      <Info class="mt-0.5 size-4.5 shrink-0 text-warn" />
      <div>
        <h3 class="text-sm font-semibold text-fg">当前平台不支持网络流量监控</h3>
        <p class="mt-1 text-[12px] leading-relaxed text-fg-dim">
          该功能依赖 Linux 的 <span class="font-mono">/proc/net/dev</span> 统计。在容器中运行时，
          统计的是容器网络命名空间的网卡流量。
        </p>
      </div>
    </div>

    <template v-else>
      <div class="grid gap-4 sm:grid-cols-2">
        <div class="glass-card p-5">
          <div class="flex items-center justify-between">
            <p class="text-[13px] text-fg-muted">下行（接收）</p>
            <ArrowDownToLine class="size-4.5 text-accent-400" />
          </div>
          <p class="mt-3 font-mono text-[26px] leading-none font-semibold text-fg">
            {{ formatRate(current.rx) }}
          </p>
          <p class="mt-2 text-[11px] text-fg-dim">峰值 {{ formatRate(peak.rx) }}</p>
        </div>

        <div class="glass-card p-5">
          <div class="flex items-center justify-between">
            <p class="text-[13px] text-fg-muted">上行（发送）</p>
            <ArrowUpFromLine class="size-4.5 text-brand-400" />
          </div>
          <p class="mt-3 font-mono text-[26px] leading-none font-semibold text-fg">
            {{ formatRate(current.tx) }}
          </p>
          <p class="mt-2 text-[11px] text-fg-dim">峰值 {{ formatRate(peak.tx) }}</p>
        </div>
      </div>

      <div class="glass-card p-5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="text-sm font-semibold text-fg">网络流量</h3>
            <p class="mt-0.5 text-[12px] text-fg-dim">
              接口 <span class="font-mono text-fg-muted">{{ interfaceName }}</span>
              · 每 {{ Math.round((data?.intervalMs ?? 5000) / 1000) }} 秒采样
            </p>
          </div>
          <button class="btn-ghost px-3 py-2" type="button" :disabled="refreshing" @click="load(true)">
            <RefreshCw class="size-4" :class="refreshing ? 'animate-spin' : ''" />
            <span class="max-sm:hidden">刷新</span>
          </button>
        </div>

        <div class="mt-4">
          <NetworkChart :points="points" :interval-ms="data?.intervalMs ?? 5000" />
        </div>

        <div class="mt-4 grid gap-3 border-t border-white/6 pt-4 sm:grid-cols-3">
          <div class="flex items-center gap-2.5">
            <Network class="size-4 shrink-0 text-fg-dim" />
            <div>
              <p class="text-[11px] text-fg-dim">网卡累计接收</p>
              <p class="font-mono text-[13px] text-fg-muted">{{ formatSize(counters.rx) }}</p>
            </div>
          </div>
          <div class="flex items-center gap-2.5">
            <Network class="size-4 shrink-0 text-fg-dim" />
            <div>
              <p class="text-[11px] text-fg-dim">网卡累计发送</p>
              <p class="font-mono text-[13px] text-fg-muted">{{ formatSize(counters.tx) }}</p>
            </div>
          </div>
          <div class="flex items-center gap-2.5">
            <Activity class="size-4 shrink-0 text-fg-dim" />
            <div>
              <p class="text-[11px] text-fg-dim">已采集样本</p>
              <p class="font-mono text-[13px] text-fg-muted">{{ points.length }} 个</p>
            </div>
          </div>
        </div>
      </div>

      <div class="flex items-start gap-2.5 px-1 text-[12px] text-fg-dim">
        <Info class="mt-0.5 size-3.5 shrink-0" />
        <span>
          速率由网卡累计计数器的差值计算，保留最近 30 分钟（每 5 秒一个采样点，最多 360 个）。
          数据仅存于进程内存，服务重启后重新累积。累计值含该网卡上所有进程的流量。
        </span>
      </div>
    </template>
  </div>
</template>
