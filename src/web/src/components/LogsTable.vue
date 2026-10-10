<script setup>
import { Inbox, Loader2 } from 'lucide-vue-next';
import { formatDateTime, formatSize } from '../format.js';

defineProps({
  logs: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
});

const ERROR_FREE = new Set([200, 206]);

function codeBadge(code) {
  if (ERROR_FREE.has(code)) return 'border-ok/30 bg-ok/10 text-ok';
  if (code === 416) return 'border-warn/30 bg-warn/10 text-warn';
  if (code === 444 || code === 403) return 'border-danger/30 bg-danger/10 text-danger';
  if (code === 503) return 'border-info/30 bg-info/10 text-info';
  return 'border-line bg-white/3 text-fg-muted';
}

function codeHint(code) {
  if (code === 444) return '直接断开连接，未返回状态码';
  if (code === 403) return '命中 IP 黑名单';
  if (code === 503) return '单 IP 并发超限';
  if (code === 416) return 'Range 区间非法';
  if (code === 206) return '断点续传';
  return '';
}

function uaLabel(ua) {
  if (!ua) return '—';
  const match = /(curl|wget|aria2|Mozilla|Chrome|Safari|Firefox|IDM|Thunder|okhttp|python)/i.exec(ua);
  return match ? match[1] : ua.slice(0, 24);
}
</script>

<template>
  <div v-if="loading" class="flex items-center justify-center gap-3 py-16 text-sm text-fg-muted">
    <Loader2 class="size-4 animate-spin" />
    正在加载日志…
  </div>

  <div v-else-if="logs.length === 0" class="flex flex-col items-center gap-3 py-16 text-center">
    <span class="flex size-12 items-center justify-center rounded-2xl bg-white/4 text-fg-dim">
      <Inbox class="size-5" />
    </span>
    <p class="text-sm text-fg-muted">没有符合条件的下载记录</p>
    <p class="max-w-[320px] text-[12px] text-fg-dim">
      调整筛选条件试试，或先通过短码链接下载一次文件
    </p>
  </div>

  <div v-else class="overflow-x-auto">
    <table class="w-full min-w-[980px] text-left text-sm">
      <thead>
        <tr class="border-b border-white/6 text-[12px] text-fg-dim">
          <th class="px-5 py-3 font-medium">时间</th>
          <th class="px-4 py-3 font-medium">IP</th>
          <th class="px-4 py-3 font-medium">方法</th>
          <th class="px-4 py-3 font-medium">路径</th>
          <th class="px-4 py-3 font-medium">状态</th>
          <th class="px-4 py-3 font-medium">耗时</th>
          <th class="px-4 py-3 font-medium">流量</th>
          <th class="px-5 py-3 font-medium">客户端</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="log in logs"
          :key="log.id"
          class="border-b border-white/4 transition hover:bg-white/3 last:border-0"
        >
          <td class="px-5 py-3 font-mono text-[12px] whitespace-nowrap text-fg-muted">
            {{ formatDateTime(log.createdAt) }}
          </td>
          <td class="px-4 py-3 font-mono text-[12px] whitespace-nowrap text-fg">{{ log.ip }}</td>
          <td class="px-4 py-3">
            <span class="badge border border-line bg-white/3 font-mono text-fg-muted">{{ log.method }}</span>
          </td>
          <td class="max-w-[240px] px-4 py-3">
            <span class="block truncate font-mono text-[12px] text-fg-muted" :title="log.path">{{ log.path }}</span>
          </td>
          <td class="px-4 py-3">
            <span class="badge border font-mono" :class="codeBadge(log.code)" :title="codeHint(log.code)">
              {{ log.code }}
            </span>
          </td>
          <td class="px-4 py-3 font-mono text-[12px] text-fg-muted">{{ log.durationMs }} ms</td>
          <td class="px-4 py-3 font-mono text-[12px] text-fg-muted">
            {{ log.bytesSent > 0 ? formatSize(log.bytesSent) : '—' }}
          </td>
          <td class="max-w-[180px] px-5 py-3">
            <span class="block truncate text-[12px] text-fg-dim" :title="log.ua">{{ uaLabel(log.ua) }}</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
