<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { Ban, Database, Download, FileClock, Loader2, RefreshCw, Search, Users } from 'lucide-vue-next';
import api, { downloadLogsCsv } from '../api.js';
import { toast } from '../toast.js';
import { formatSize } from '../format.js';
import LogsTable from '../components/LogsTable.vue';
import TrendChart from '../components/TrendChart.vue';

const RANGES = [
  { value: 'all', label: '全部时间' },
  { value: 'today', label: '今天' },
  { value: 'week', label: '本周' },
  { value: 'month', label: '本月' },
  { value: 'year', label: '本年' },
  { value: 'custom', label: '自定义' },
];

const TREND_RANGES = [
  { value: 7, label: '最近 7 天' },
  { value: 14, label: '最近 14 天' },
  { value: 30, label: '最近 30 天' },
];

const CODES = [
  { value: 'all', label: '全部状态' },
  { value: '200', label: '200 完整下载' },
  { value: '206', label: '206 断点续传' },
  { value: '416', label: '416 区间非法' },
  { value: '403', label: '403 黑名单拦截' },
  { value: '444', label: '444 断连' },
  { value: '503', label: '503 并发超限' },
];

const SORTS = [
  { value: 'created_at', label: '按时间' },
  { value: 'duration_ms', label: '按耗时' },
  { value: 'bytes_sent', label: '按字节数' },
];

const loading = ref(true);
const refreshing = ref(false);
const exporting = ref(false);
const data = ref(null);
const trendDays = ref(14);
const trend = ref(null);

const filters = reactive({
  q: '',
  range: 'all',
  from: '',
  to: '',
  code: 'all',
  sort: 'created_at',
  order: 'desc',
  page: 1,
  pageSize: 20,
});

const logs = computed(() => data.value?.logs ?? []);
const pagination = computed(
  () => data.value?.pagination ?? { page: 1, pageSize: 20, total: 0, totalPages: 1, pageSizes: [10, 20, 50, 100] }
);
const stats = computed(() => data.value?.stats ?? { total: 0, bytes: 0, disconnects: 0, topIps: [] });

const cards = computed(() => [
  { label: '下载请求', value: String(stats.value.total), hint: '当前筛选条件下', icon: FileClock, tone: 'text-brand-300' },
  { label: '累计流量', value: formatSize(stats.value.bytes), hint: '已发送字节数', icon: Database, tone: 'text-accent-400' },
  { label: '444 断连', value: String(stats.value.disconnects), hint: '非法或不存在的短码', icon: Ban, tone: 'text-danger' },
  {
    label: 'Top IP',
    value: stats.value.topIps[0] ? stats.value.topIps[0].ip : '—',
    hint: stats.value.topIps[0] ? `${stats.value.topIps[0].count} 次请求` : '暂无数据',
    icon: Users,
    tone: 'text-warn',
    mono: true,
  },
]);

/** 时间范围按浏览器本地时区换算成时间戳，避免服务器时区造成的偏差 */
function resolveRange() {
  if (filters.range === 'all') return { from: null, to: null };
  if (filters.range === 'custom') {
    return {
      from: filters.from ? new Date(filters.from).getTime() : null,
      to: filters.to ? new Date(filters.to).getTime() : null,
    };
  }
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const end = Date.now();
  if (filters.range === 'today') return { from: startOfToday, to: end };
  if (filters.range === 'week') {
    const offset = (now.getDay() + 6) % 7; // 以周一为一周起点
    return { from: startOfToday - offset * 86400000, to: end };
  }
  if (filters.range === 'month') {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), to: end };
  }
  if (filters.range === 'year') {
    return { from: new Date(now.getFullYear(), 0, 1).getTime(), to: end };
  }
  return { from: null, to: null };
}

function buildParams() {
  const params = {
    page: filters.page,
    pageSize: filters.pageSize,
    sort: filters.sort,
    order: filters.order,
  };
  const keyword = filters.q.trim();
  if (keyword) params.q = keyword;
  if (filters.code !== 'all') params.code = filters.code;
  const { from, to } = resolveRange();
  if (from) params.from = from;
  if (to) params.to = to;
  return params;
}

async function load(silent = false) {
  if (silent) refreshing.value = true;
  else loading.value = true;
  try {
    data.value = await api.logs(buildParams());
  } catch (error) {
    toast.error(error.message);
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

async function exportCsv() {
  exporting.value = true;
  try {
    const blob = await downloadLogsCsv(buildParams());
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    link.href = url;
    link.download = `filelink-logs-${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('已导出当前筛选条件下的日志');
  } catch (error) {
    toast.error(error.message);
  } finally {
    exporting.value = false;
  }
}

async function loadTrend() {
  try {
    trend.value = await api.logsTrend(trendDays.value);
  } catch (error) {
    toast.error(error.message);
  }
}

watch(trendDays, loadTrend);

let debounce = null;
watch(
  () => filters.q,
  () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      filters.page = 1;
      load(true);
    }, 350);
  }
);

watch(
  () => [filters.range, filters.from, filters.to, filters.code, filters.sort, filters.order, filters.pageSize],
  () => {
    filters.page = 1;
    load(true);
  }
);

watch(
  () => filters.page,
  () => load(true)
);

onMounted(() => {
  load();
  loadTrend();
});
onBeforeUnmount(() => clearTimeout(debounce));
</script>

<template>
  <div class="space-y-6">
    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div v-for="card in cards" :key="card.label" class="glass-card p-5">
        <div class="flex items-center justify-between">
          <p class="text-[13px] text-fg-muted">{{ card.label }}</p>
          <component :is="card.icon" class="size-4.5" :class="card.tone" />
        </div>
        <p
          class="mt-3 text-[24px] leading-none font-semibold text-fg"
          :class="card.mono ? 'font-mono text-[18px]' : 'font-mono'"
        >
          {{ card.value }}
        </p>
        <p class="mt-2 truncate text-[11px] text-fg-dim">{{ card.hint }}</p>
      </div>
    </div>

    <div class="glass-card p-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="text-sm font-semibold text-fg">下载趋势</h3>
          <p class="mt-0.5 text-[12px] text-fg-dim">
            近 {{ trend?.days ?? trendDays }} 天共 {{ trend?.totals?.requests ?? 0 }} 次请求 ·
            {{ trend?.totals?.downloads ?? 0 }} 次完成下载 · {{ formatSize(trend?.totals?.bytes ?? 0) }} 流量
          </p>
        </div>
        <select v-model.number="trendDays" class="field w-auto min-w-[130px] cursor-pointer">
          <option v-for="item in TREND_RANGES" :key="item.value" :value="item.value">{{ item.label }}</option>
        </select>
      </div>
      <div class="mt-4">
        <TrendChart :points="trend?.points ?? []" />
      </div>
    </div>

    <div class="glass-card p-4">
      <div class="flex flex-wrap items-center gap-2.5">
        <div class="relative min-w-[220px] flex-1">
          <Search class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-dim" />
          <input
            v-model="filters.q"
            class="field pl-9"
            type="text"
            autocomplete="off"
            placeholder="搜索路径 / IP / 请求方法"
          />
        </div>

        <select v-model="filters.range" class="field w-auto min-w-[120px] cursor-pointer">
          <option v-for="item in RANGES" :key="item.value" :value="item.value">{{ item.label }}</option>
        </select>

        <select v-model="filters.code" class="field w-auto min-w-[140px] cursor-pointer">
          <option v-for="item in CODES" :key="item.value" :value="item.value">{{ item.label }}</option>
        </select>

        <select v-model="filters.sort" class="field w-auto min-w-[120px] cursor-pointer">
          <option v-for="item in SORTS" :key="item.value" :value="item.value">{{ item.label }}</option>
        </select>

        <select v-model="filters.order" class="field w-auto min-w-[96px] cursor-pointer">
          <option value="desc">降序</option>
          <option value="asc">升序</option>
        </select>

        <button class="btn-ghost px-3 py-2" type="button" :disabled="refreshing" @click="load(true)">
          <RefreshCw class="size-4" :class="refreshing ? 'animate-spin' : ''" />
          <span class="max-lg:hidden">刷新</span>
        </button>

        <button class="btn-primary px-3.5 py-2" type="button" :disabled="exporting" @click="exportCsv">
          <Loader2 v-if="exporting" class="size-4 animate-spin" />
          <Download v-else class="size-4" />
          导出 CSV
        </button>
      </div>

      <div v-if="filters.range === 'custom'" class="mt-3 flex flex-wrap items-center gap-2.5">
        <input v-model="filters.from" class="field w-auto" type="datetime-local" />
        <span class="text-[13px] text-fg-dim">至</span>
        <input v-model="filters.to" class="field w-auto" type="datetime-local" />
      </div>
    </div>

    <div class="glass-card overflow-hidden">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-white/6 px-5 py-4">
        <div>
          <h3 class="text-sm font-semibold text-fg">下载请求日志</h3>
          <p class="mt-0.5 text-[12px] text-fg-dim">
            仅记录下载路径 <span class="font-mono">/d/*</span> 的请求；444 表示直接断开连接、未返回状态码
          </p>
        </div>
      </div>

      <LogsTable :logs="logs" :loading="loading" />

      <div class="flex flex-wrap items-center justify-between gap-3 border-t border-white/6 px-5 py-4">
        <p class="text-[12px] text-fg-dim">
          共 {{ pagination.total }} 条 · 第 {{ pagination.page }} / {{ pagination.totalPages }} 页
        </p>

        <div class="flex items-center gap-2.5">
          <select v-model.number="filters.pageSize" class="field w-auto cursor-pointer text-[13px]">
            <option v-for="size in pagination.pageSizes" :key="size" :value="size">每页 {{ size }} 条</option>
          </select>
          <button
            class="btn-ghost px-3 py-2"
            type="button"
            :disabled="pagination.page <= 1"
            @click="filters.page -= 1"
          >
            上一页
          </button>
          <button
            class="btn-ghost px-3 py-2"
            type="button"
            :disabled="pagination.page >= pagination.totalPages"
            @click="filters.page += 1"
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
