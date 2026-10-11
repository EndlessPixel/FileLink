<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { FileClock, Loader2, RefreshCw, Search, ShieldCheck } from 'lucide-vue-next';
import api from '../api.js';
import { toast } from '../toast.js';
import { formatDateTime } from '../format.js';

/** 操作类型到中文说明与色调的映射；未登记的 action 原样展示 */
const ACTION_META = {
  'auth.login': { label: '登录成功', tone: 'text-ok border-ok/25 bg-ok/10' },
  'auth.login_failed': { label: '登录失败', tone: 'text-danger border-danger/25 bg-danger/10' },
  'auth.logout': { label: '退出登录', tone: 'text-fg-muted border-line bg-white/3' },
  'file.add': { label: '登记文件', tone: 'text-brand-300 border-brand-500/25 bg-brand-500/10' },
  'file.remove': { label: '移除映射', tone: 'text-danger border-danger/25 bg-danger/10' },
  'file.refresh_link': { label: '重新生成链接', tone: 'text-accent-400 border-accent-400/25 bg-accent-400/10' },
  'file.cleanup_missing': { label: '清理失效映射', tone: 'text-warn border-warn/25 bg-warn/10' },
  'blacklist.add': { label: '拉黑 IP', tone: 'text-danger border-danger/25 bg-danger/10' },
  'blacklist.remove': { label: '移出黑名单', tone: 'text-fg-muted border-line bg-white/3' },
  'whitelist.add': { label: '加入白名单', tone: 'text-ok border-ok/25 bg-ok/10' },
  'whitelist.remove': { label: '移出白名单', tone: 'text-fg-muted border-line bg-white/3' },
  'config.update': { label: '修改配置', tone: 'text-warn border-warn/25 bg-warn/10' },
  'security.path': { label: '修改安全入口', tone: 'text-warn border-warn/25 bg-warn/10' },
  'security.password': { label: '修改密码', tone: 'text-warn border-warn/25 bg-warn/10' },
  'sitefiles.robots': { label: '配置 robots.txt', tone: 'text-fg-muted border-line bg-white/3' },
  'sitefiles.security_txt': { label: '配置 security.txt', tone: 'text-fg-muted border-line bg-white/3' },
};

const logs = ref([]);
const pagination = ref({ page: 1, pageSize: 20, total: 0, totalPages: 1, pageSizes: [10, 20, 50, 100] });
const actions = ref([]);
const loading = ref(true);
const refreshing = ref(false);

const filters = reactive({ q: '', action: '', page: 1, pageSize: 20 });

function metaOf(action) {
  return ACTION_META[action] ?? { label: action, tone: 'text-fg-muted border-line bg-white/3' };
}

function buildParams() {
  const params = { page: filters.page, pageSize: filters.pageSize };
  const keyword = filters.q.trim();
  if (keyword) params.q = keyword;
  if (filters.action) params.action = filters.action;
  return params;
}

async function load(silent = false) {
  if (silent) refreshing.value = true;
  else loading.value = true;
  try {
    const data = await api.audit(buildParams());
    logs.value = data.logs ?? [];
    pagination.value = data.pagination ?? pagination.value;
    actions.value = data.actions ?? [];
  } catch (error) {
    toast.error(error.message);
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

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
  () => [filters.action, filters.pageSize],
  () => {
    filters.page = 1;
    load(true);
  }
);

watch(
  () => filters.page,
  () => load(true)
);

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <div class="glass-card flex flex-wrap items-center justify-between gap-3 p-5">
      <div class="flex items-start gap-3.5">
        <span class="flex size-11 items-center justify-center rounded-xl bg-brand-500/12 text-brand-300">
          <FileClock class="size-5" />
        </span>
        <div>
          <p class="text-[13px] text-fg-muted">管理操作审计</p>
          <p class="mt-1 text-[12px] text-fg-dim">
            记录后台的每一次写操作，保留 {{ pagination.total }} 条；密码类操作仅记录「已修改」
          </p>
        </div>
      </div>
      <button class="btn-ghost px-3 py-2" type="button" :disabled="refreshing" @click="load(true)">
        <RefreshCw class="size-4" :class="refreshing ? 'animate-spin' : ''" />
        <span class="max-sm:hidden">刷新</span>
      </button>
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
            placeholder="搜索操作对象或说明"
          />
        </div>
        <select v-model="filters.action" class="field w-auto min-w-[160px] cursor-pointer">
          <option value="">全部操作</option>
          <option v-for="item in actions" :key="item" :value="item">{{ metaOf(item).label }}</option>
        </select>
      </div>
    </div>

    <div class="glass-card overflow-hidden">
      <div v-if="loading" class="flex items-center justify-center gap-3 py-16 text-sm text-fg-muted">
        <Loader2 class="size-4 animate-spin" />
        正在加载审计记录…
      </div>

      <div v-else-if="logs.length === 0" class="flex flex-col items-center gap-3 py-16 text-center">
        <span class="flex size-12 items-center justify-center rounded-2xl bg-white/4 text-fg-dim">
          <ShieldCheck class="size-5" />
        </span>
        <p class="text-sm text-fg-muted">暂无审计记录</p>
        <p class="text-[12px] text-fg-dim">后台的登录、文件、IP 规则与配置变更都会记录在这里</p>
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full min-w-[820px] text-left text-sm">
          <thead>
            <tr class="border-b border-white/6 text-[12px] text-fg-dim">
              <th class="px-5 py-3 font-medium">时间</th>
              <th class="px-4 py-3 font-medium">操作</th>
              <th class="px-4 py-3 font-medium">对象</th>
              <th class="px-4 py-3 font-medium">说明</th>
              <th class="px-5 py-3 font-medium">来源 IP</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="log in logs"
              :key="log.id"
              class="border-b border-white/4 transition hover:bg-white/3 last:border-0"
            >
              <td class="px-5 py-3.5 font-mono text-[12px] text-fg-muted">{{ formatDateTime(log.createdAt) }}</td>
              <td class="px-4 py-3.5">
                <span class="badge border" :class="metaOf(log.action).tone">{{ metaOf(log.action).label }}</span>
              </td>
              <td class="max-w-[220px] px-4 py-3.5">
                <span class="block truncate font-mono text-[12px] text-fg-muted" :title="log.target">
                  {{ log.target || '—' }}
                </span>
              </td>
              <td class="max-w-[320px] px-4 py-3.5 text-fg-muted">
                <span class="block truncate" :title="log.detail">{{ log.detail || '—' }}</span>
              </td>
              <td class="px-5 py-3.5 font-mono text-[12px] text-fg-muted">{{ log.ip || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div
        v-if="!loading && pagination.total > 0"
        class="flex flex-wrap items-center justify-between gap-3 border-t border-white/6 px-5 py-4"
      >
        <p class="text-[12px] text-fg-dim">
          共 {{ pagination.total }} 条 · 第 {{ pagination.page }} / {{ pagination.totalPages }} 页
        </p>
        <div class="flex items-center gap-2.5">
          <select v-model.number="filters.pageSize" class="field w-auto cursor-pointer text-[13px]">
            <option v-for="size in pagination.pageSizes" :key="size" :value="size">每页 {{ size }} 条</option>
          </select>
          <button class="btn-ghost px-3 py-2" type="button" :disabled="pagination.page <= 1" @click="filters.page -= 1">
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
