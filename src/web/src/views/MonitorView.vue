<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  Cpu,
  Database,
  HardDrive,
  Info,
  Loader2,
  MemoryStick,
  Network,
  RefreshCw,
} from 'lucide-vue-next';
import api from '../api.js';
import { toast } from '../toast.js';
import { formatSize } from '../format.js';
import NetworkChart from '../components/NetworkChart.vue';

const REFRESH_MS = 5000;

const DISK_SERIES = [
  { key: 'read', color: '#22d3ee', label: '读取' },
  { key: 'write', color: '#f472b6', label: '写入' },
];

const loading = ref(true);
const refreshing = ref(false);
const data = ref(null);
const system = ref(null);
let timer = null;

const points = computed(() => data.value?.points ?? []);
const current = computed(() => data.value?.current ?? { rx: 0, tx: 0 });
const peak = computed(() => data.value?.peak ?? { rx: 0, tx: 0 });
const counters = computed(() => data.value?.counters ?? { rx: 0, tx: 0 });
const supported = computed(() => data.value?.supported !== false);
const interfaceName = computed(() => data.value?.interface || '全部网卡（不含 lo）');

const disks = computed(() => system.value?.disks ?? []);
const ioPoints = computed(() => system.value?.io?.points ?? []);
const ioCurrent = computed(() => system.value?.io?.current ?? { read: 0, write: 0 });
const ioPeak = computed(() => system.value?.io?.peak ?? { read: 0, write: 0 });
const ioSupported = computed(() => system.value?.io?.supported === true);
const ioDevices = computed(() => system.value?.io?.devices || '自动选择');
const memory = computed(() => system.value?.memory ?? { total: 0, used: 0, usedPercent: 0, peakUsed: 0 });
const loadInfo = computed(() => system.value?.load ?? { avg1: 0, avg5: 0, avg15: 0, cores: 1, cpuPercent: 0 });
const alertPercent = computed(() => Number(system.value?.alertPercent) || 90);

function formatRate(bytesPerSecond) {
  return `${formatSize(bytesPerSecond)}/s`;
}

function barTone(percent) {
  if (percent >= alertPercent.value) return 'bg-danger';
  if (percent >= alertPercent.value - 10) return 'bg-warn';
  return 'bg-brand-500';
}

function textTone(percent) {
  if (percent >= alertPercent.value) return 'text-danger';
  if (percent >= alertPercent.value - 10) return 'text-warn';
  return 'text-fg';
}

async function load(silent = false) {
  if (silent) refreshing.value = true;
  try {
    const [network, systemData] = await Promise.all([api.networkMonitor(), api.systemMonitor()]);
    data.value = network;
    system.value = systemData;
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
      正在读取系统状态…
    </div>

    <template v-else>
      <!-- 磁盘容量：文件分发服务最关键的资源 -->
      <div class="glass-card p-5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-start gap-3.5">
            <span class="flex size-11 items-center justify-center rounded-xl bg-brand-500/12 text-brand-300">
              <HardDrive class="size-5" />
            </span>
            <div>
              <h3 class="text-sm font-semibold text-fg">磁盘容量</h3>
              <p class="mt-1 text-[12px] text-fg-dim">
                超过 {{ alertPercent }}% 时告警；容器环境中读到的是容器文件系统
              </p>
            </div>
          </div>
          <button class="btn-ghost px-3 py-2" type="button" :disabled="refreshing" @click="load(true)">
            <RefreshCw class="size-4" :class="refreshing ? 'animate-spin' : ''" />
            <span class="max-sm:hidden">刷新</span>
          </button>
        </div>

        <div v-if="disks.length === 0" class="mt-4 text-[12px] text-fg-dim">
          未能读取磁盘容量信息{{ system?.error ? `：${system.error}` : '' }}
        </div>

        <div v-else class="mt-5 space-y-5">
          <div v-for="disk in disks" :key="disk.mount">
            <div class="flex items-baseline justify-between gap-3">
              <span class="font-mono text-[13px] text-fg-muted">{{ disk.mount }}</span>
              <span class="text-[13px]" :class="textTone(disk.usedPercent)">
                {{ disk.usedPercent }}%
                <span class="ml-2 text-[11px] text-fg-dim">
                  {{ formatSize(disk.used) }} / {{ formatSize(disk.total) }}
                </span>
              </span>
            </div>
            <div class="mt-2 h-2 overflow-hidden rounded-full bg-white/6">
              <div
                class="h-full rounded-full transition-all duration-500"
                :class="barTone(disk.usedPercent)"
                :style="{ width: `${Math.min(disk.usedPercent, 100)}%` }"
              ></div>
            </div>
            <p class="mt-1.5 text-[11px] text-fg-dim">剩余可用 {{ formatSize(disk.free) }}</p>
          </div>
        </div>
      </div>

      <!-- 磁盘 IO -->
      <div class="glass-card p-5">
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <div class="flex items-center justify-between">
              <p class="text-[13px] text-fg-muted">磁盘读取</p>
              <ArrowDownToLine class="size-4.5 text-accent-400" />
            </div>
            <p class="mt-3 font-mono text-[26px] leading-none font-semibold text-fg">
              {{ formatRate(ioCurrent.read) }}
            </p>
            <p class="mt-2 text-[11px] text-fg-dim">峰值 {{ formatRate(ioPeak.read) }}</p>
          </div>
          <div>
            <div class="flex items-center justify-between">
              <p class="text-[13px] text-fg-muted">磁盘写入</p>
              <ArrowUpFromLine class="size-4.5 text-[#f472b6]" />
            </div>
            <p class="mt-3 font-mono text-[26px] leading-none font-semibold text-fg">
              {{ formatRate(ioCurrent.write) }}
            </p>
            <p class="mt-2 text-[11px] text-fg-dim">峰值 {{ formatRate(ioPeak.write) }}</p>
          </div>
        </div>

        <div v-if="!ioSupported" class="mt-4 flex items-start gap-2.5 text-[12px] text-fg-dim">
          <Info class="mt-0.5 size-3.5 shrink-0" />
          <span>当前环境无法读取 <span class="font-mono">/proc/diskstats</span>，磁盘 IO 速率不可用。</span>
        </div>

        <template v-else>
          <p class="mt-4 text-[12px] text-fg-dim">
            设备 <span class="font-mono text-fg-muted">{{ ioDevices }}</span>
          </p>
          <div class="mt-2">
            <NetworkChart :points="ioPoints" :series="DISK_SERIES" :interval-ms="system?.intervalMs ?? 5000" />
          </div>
        </template>
      </div>

      <!-- 内存与负载 -->
      <div class="grid gap-4 sm:grid-cols-2">
        <div class="glass-card p-5">
          <div class="flex items-center justify-between">
            <p class="text-[13px] text-fg-muted">内存占用</p>
            <MemoryStick class="size-4.5 text-brand-400" />
          </div>
          <p class="mt-3 font-mono text-[26px] leading-none font-semibold text-fg">
            {{ memory.usedPercent }}%
          </p>
          <div class="mt-3 h-2 overflow-hidden rounded-full bg-white/6">
            <div
              class="h-full rounded-full transition-all duration-500"
              :class="memory.usedPercent >= 90 ? 'bg-danger' : 'bg-brand-500'"
              :style="{ width: `${Math.min(memory.usedPercent, 100)}%` }"
            ></div>
          </div>
          <p class="mt-2 text-[11px] text-fg-dim">
            {{ formatSize(memory.used) }} / {{ formatSize(memory.total) }} · 峰值 {{ formatSize(memory.peakUsed) }}
          </p>
        </div>

        <div class="glass-card p-5">
          <div class="flex items-center justify-between">
            <p class="text-[13px] text-fg-muted">CPU 与负载</p>
            <Cpu class="size-4.5 text-accent-400" />
          </div>
          <p class="mt-3 font-mono text-[26px] leading-none font-semibold text-fg">
            {{ loadInfo.cpuPercent }}%
          </p>
          <p class="mt-3 text-[11px] text-fg-dim">
            {{ loadInfo.cores }} 核 · 负载 1/5/15 分钟
          </p>
          <p class="mt-1 font-mono text-[13px] text-fg-muted">
            {{ loadInfo.avg1 }} / {{ loadInfo.avg5 }} / {{ loadInfo.avg15 }}
          </p>
        </div>
      </div>

      <!-- 网络流量 -->
      <div v-if="!supported" class="glass-card flex items-start gap-3 p-5">
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
      </template>

      <div class="flex items-start gap-2.5 px-1 text-[12px] text-fg-dim">
        <Database class="mt-0.5 size-3.5 shrink-0" />
        <span>
          速率由累计计数器的差值计算，保留最近 30 分钟（每 5 秒一个采样点，最多 360 个）。
          数据仅存于进程内存，服务重启后重新累积。
        </span>
      </div>
    </template>
  </div>
</template>
