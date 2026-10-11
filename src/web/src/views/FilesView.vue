<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  FileArchive,
  HardDrive,
  Inbox,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-vue-next';
import api, { fetchDownloadUrl } from '../api.js';
import { copyText } from '../clipboard.js';
import { toast } from '../toast.js';
import { fileBaseName, formatSize, formatTime, shortHash } from '../format.js';
import AddFileDialog from '../components/AddFileDialog.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';

const SORTS = [
  { value: 'added_at', label: '添加时间' },
  { value: 'size', label: '文件大小' },
  { value: 'name', label: '文件名' },
  { value: 'download_count', label: '下载次数' },
];

const files = ref([]);
const stats = ref({ fileCount: 0, linkCount: 0, downloadCount: 0 });
const pagination = ref({ page: 1, pageSize: 20, total: 0, totalPages: 1, pageSizes: [10, 20, 50, 100] });
const missingCount = ref(0);

const loading = ref(true);
const refreshing = ref(false);
const cleaning = ref(false);
const dialogOpen = ref(false);
const copyingSha = ref('');
const confirming = ref(null);
const confirmLoading = ref(false);
const expandedSha = ref('');

const filters = reactive({ q: '', sort: 'added_at', order: 'desc', page: 1, pageSize: 20 });

const cards = computed(() => [
  { label: '已登记文件', value: stats.value.fileCount, hint: '按 sha256 唯一', icon: FileArchive, tone: 'text-brand-300' },
  { label: '有效下载链接', value: stats.value.linkCount, hint: '一个文件一条短码', icon: Link2, tone: 'text-accent-400' },
  { label: '累计下载次数', value: stats.value.downloadCount, hint: '仅统计完整响应', icon: Download, tone: 'text-ok' },
]);

function buildParams() {
  const params = {
    page: filters.page,
    pageSize: filters.pageSize,
    sort: filters.sort,
    order: filters.order,
  };
  const keyword = filters.q.trim();
  if (keyword) params.q = keyword;
  return params;
}

async function load(silent = false) {
  if (silent) refreshing.value = true;
  else loading.value = true;
  try {
    const [fileData, statData] = await Promise.all([api.files(buildParams()), api.stats()]);
    files.value = fileData.files ?? [];
    pagination.value = fileData.pagination ?? pagination.value;
    missingCount.value = fileData.missingCount ?? 0;
    stats.value = statData;
  } catch (error) {
    toast.error(error.message);
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

function toggleSort(key) {
  if (filters.sort === key) {
    filters.order = filters.order === 'asc' ? 'desc' : 'asc';
  } else {
    filters.sort = key;
    filters.order = 'desc';
  }
  filters.page = 1;
}

function sortIcon(key) {
  if (filters.sort !== key) return null;
  return filters.order === 'asc' ? ChevronUp : ChevronDown;
}

function askCleanup() {
  confirming.value = {
    title: '清理失效映射',
    message: `将移除 ${missingCount.value} 条指向已不存在文件的记录，磁盘上的文件不会被删除。`,
    confirmText: '确认清理',
    danger: true,
    run: async () => {
      const result = await api.cleanupMissingFiles();
      toast.success(`已清理 ${result.removed} 条失效映射`);
      filters.page = 1;
      await load(true);
    },
  };
}

async function copyLink(file) {
  if (copyingSha.value) return;
  copyingSha.value = file.sha256;
  try {
    const url = await fetchDownloadUrl(file.sha256);
    const ok = await copyText(url);
    if (ok) toast.success(`链接已复制：${url}`);
    else toast.error('浏览器拒绝了剪贴板写入，请手动复制');
  } catch (error) {
    toast.error(error.message);
  } finally {
    copyingSha.value = '';
  }
}

function askRefresh(file) {
  confirming.value = {
    title: '重新生成下载链接',
    message: `将立即作废旧短码并生成新的下载链接，下载次数统计会保留。文件：${fileBaseName(file.filePath)}`,
    confirmText: '重新生成',
    danger: false,
    run: async () => {
      const result = await api.refreshLink(file.sha256);
      toast.success(`新短码已生成：${result.code}`);
      await load(true);
    },
  };
}

function askDelete(file) {
  confirming.value = {
    title: '移除文件映射',
    message: `仅从数据库中移除该记录，磁盘上的文件不会被删除。文件：${file.filePath}`,
    confirmText: '确认移除',
    danger: true,
    run: async () => {
      await api.deleteFile(file.sha256);
      toast.success('文件映射已移除');
      await load(true);
    },
  };
}

async function runConfirm() {
  if (!confirming.value) return;
  confirmLoading.value = true;
  try {
    await confirming.value.run();
    confirming.value = null;
  } catch (error) {
    toast.error(error.message);
  } finally {
    confirmLoading.value = false;
  }
}

async function copyHash(hash) {
  const ok = await copyText(hash);
  toast[ok ? 'success' : 'error'](ok ? 'sha256 已复制' : '复制失败，请手动选择');
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
  () => [filters.sort, filters.order, filters.pageSize],
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
    <div class="grid gap-4 sm:grid-cols-3">
      <div v-for="card in cards" :key="card.label" class="glass-card p-5">
        <div class="flex items-center justify-between">
          <p class="text-[13px] text-fg-muted">{{ card.label }}</p>
          <component :is="card.icon" class="size-4.5" :class="card.tone" />
        </div>
        <p class="mt-3 font-mono text-[26px] leading-none font-semibold text-fg">{{ card.value ?? 0 }}</p>
        <p class="mt-2 text-[11px] text-fg-dim">{{ card.hint }}</p>
      </div>
    </div>

    <!-- 失效映射提示：源文件被移走或改名后，下载会直接断连 -->
    <div
      v-if="missingCount > 0"
      class="glass-card flex flex-wrap items-center justify-between gap-3 border-warn/25 bg-warn/8 p-4"
    >
      <div class="flex items-start gap-3">
        <AlertTriangle class="mt-0.5 size-4.5 shrink-0 text-warn" />
        <div>
          <p class="text-[13px] font-medium text-fg">
            发现 {{ missingCount }} 条失效映射
          </p>
          <p class="mt-1 text-[12px] text-fg-dim">
            这些记录指向的文件在磁盘上已不存在，访问对应短码会直接断开连接
          </p>
        </div>
      </div>
      <button class="btn-ghost px-3.5 py-2" type="button" :disabled="cleaning" @click="askCleanup">
        <Loader2 v-if="cleaning" class="size-4 animate-spin" />
        <Trash2 v-else class="size-4" />
        清理失效映射
      </button>
    </div>

    <div class="glass-card overflow-hidden">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-white/6 px-5 py-4">
        <div>
          <h3 class="text-sm font-semibold text-fg">文件列表</h3>
          <p class="mt-0.5 text-[12px] text-fg-dim">共 {{ pagination.total }} 条记录</p>
        </div>
        <div class="flex items-center gap-2">
          <button class="btn-ghost px-3 py-2" type="button" :disabled="refreshing" @click="load(true)">
            <RefreshCw class="size-4" :class="refreshing ? 'animate-spin' : ''" />
            <span class="max-sm:hidden">刷新</span>
          </button>
          <button class="btn-primary px-3.5 py-2" type="button" @click="dialogOpen = true">
            <Plus class="size-4" />
            添加文件
          </button>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2.5 border-b border-white/6 px-5 py-3.5">
        <div class="relative min-w-[220px] flex-1">
          <Search class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-dim" />
          <input
            v-model="filters.q"
            class="field pl-9"
            type="text"
            autocomplete="off"
            placeholder="搜索文件名、路径、sha256 或短码"
          />
        </div>
        <select v-model="filters.sort" class="field w-auto min-w-[130px] cursor-pointer">
          <option v-for="item in SORTS" :key="item.value" :value="item.value">{{ item.label }}</option>
        </select>
        <select v-model="filters.order" class="field w-auto min-w-[96px] cursor-pointer">
          <option value="desc">降序</option>
          <option value="asc">升序</option>
        </select>
      </div>

      <div v-if="loading" class="flex items-center justify-center gap-3 py-16 text-sm text-fg-muted">
        <Loader2 class="size-4 animate-spin" />
        正在加载文件列表…
      </div>

      <div v-else-if="files.length === 0" class="flex flex-col items-center gap-3 py-16 text-center">
        <span class="flex size-12 items-center justify-center rounded-2xl bg-white/4 text-fg-dim">
          <Inbox class="size-5" />
        </span>
        <p class="text-sm text-fg-muted">{{ filters.q ? '没有匹配的文件' : '还没有登记任何文件' }}</p>
        <p class="max-w-[320px] text-[12px] text-fg-dim">
          {{ filters.q ? '换个关键词试试' : '点击右上角「添加文件」，填入服务器上文件的绝对路径即可生成下载链接' }}
        </p>
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr class="border-b border-white/6 text-[12px] text-fg-dim">
              <th class="px-5 py-3 font-medium">
                <button class="flex cursor-pointer items-center gap-1 transition hover:text-fg" type="button" @click="toggleSort('name')">
                  文件名
                  <component :is="sortIcon('name')" v-if="sortIcon('name')" class="size-3" />
                </button>
              </th>
              <th class="px-4 py-3 font-medium">sha256</th>
              <th class="px-4 py-3 font-medium">服务器路径</th>
              <th class="px-4 py-3 font-medium">
                <button class="flex cursor-pointer items-center gap-1 transition hover:text-fg" type="button" @click="toggleSort('size')">
                  大小
                  <component :is="sortIcon('size')" v-if="sortIcon('size')" class="size-3" />
                </button>
              </th>
              <th class="px-4 py-3 font-medium">
                <button class="flex cursor-pointer items-center gap-1 transition hover:text-fg" type="button" @click="toggleSort('added_at')">
                  添加时间
                  <component :is="sortIcon('added_at')" v-if="sortIcon('added_at')" class="size-3" />
                </button>
              </th>
              <th class="px-4 py-3 font-medium">
                <button
                  class="flex cursor-pointer items-center gap-1 transition hover:text-fg"
                  type="button"
                  @click="toggleSort('download_count')"
                >
                  下载
                  <component :is="sortIcon('download_count')" v-if="sortIcon('download_count')" class="size-3" />
                </button>
              </th>
              <th class="px-5 py-3 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="file in files"
              :key="file.sha256"
              class="border-b border-white/4 transition last:border-0"
              :class="file.missing ? 'bg-danger/6 hover:bg-danger/10' : 'hover:bg-white/3'"
            >
              <td class="max-w-[220px] px-5 py-3.5">
                <div class="flex items-center gap-2.5">
                  <span
                    class="flex size-8 shrink-0 items-center justify-center rounded-lg"
                    :class="file.missing ? 'bg-danger/12 text-danger' : 'bg-brand-500/12 text-brand-300'"
                  >
                    <AlertTriangle v-if="file.missing" class="size-4" />
                    <HardDrive v-else class="size-4" />
                  </span>
                  <span class="min-w-0">
                    <span class="block truncate font-medium text-fg">{{ fileBaseName(file.filePath) }}</span>
                    <span v-if="file.missing" class="mt-0.5 block text-[11px] text-danger">磁盘上已不存在</span>
                  </span>
                </div>
              </td>
              <td class="px-4 py-3.5">
                <button
                  class="hash cursor-pointer transition hover:text-brand-300"
                  type="button"
                  :title="file.sha256"
                  @click="expandedSha = expandedSha === file.sha256 ? '' : file.sha256"
                >
                  {{ expandedSha === file.sha256 ? file.sha256 : shortHash(file.sha256, 14) }}
                </button>
                <button class="ml-1.5 cursor-pointer text-fg-dim transition hover:text-brand-300" type="button" @click="copyHash(file.sha256)">
                  <Copy class="size-3.5" />
                </button>
              </td>
              <td class="max-w-[240px] px-4 py-3.5">
                <span class="block truncate font-mono text-[12px] text-fg-muted" :title="file.filePath">{{ file.filePath }}</span>
              </td>
              <td class="px-4 py-3.5 text-fg-muted">{{ formatSize(file.size) }}</td>
              <td class="px-4 py-3.5 text-fg-muted">{{ formatTime(file.addedAt) }}</td>
              <td class="px-4 py-3.5">
                <span class="badge border border-line bg-white/3 text-fg-muted">
                  {{ file.downloadCount ?? 0 }} 次
                </span>
              </td>
              <td class="px-5 py-3.5">
                <div class="flex items-center justify-end gap-1.5">
                  <button
                    class="icon-btn"
                    type="button"
                    title="复制下载链接（点击时获取最新）"
                    :disabled="Boolean(copyingSha) || file.missing"
                    @click="copyLink(file)"
                  >
                    <Loader2 v-if="copyingSha === file.sha256" class="size-4 animate-spin" />
                    <Copy v-else class="size-4" />
                  </button>
                  <button class="icon-btn" type="button" title="重新生成链接" @click="askRefresh(file)">
                    <RefreshCw class="size-4" />
                  </button>
                  <button
                    class="icon-btn hover:border-danger/30 hover:bg-danger/12 hover:text-danger"
                    type="button"
                    title="移除映射"
                    @click="askDelete(file)"
                  >
                    <Trash2 class="size-4" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="!loading && pagination.total > 0" class="flex flex-wrap items-center justify-between gap-3 border-t border-white/6 px-5 py-4">
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

    <AddFileDialog :open="dialogOpen" @close="dialogOpen = false" @added="load" />

    <ConfirmDialog
      :open="Boolean(confirming)"
      :title="confirming?.title ?? ''"
      :message="confirming?.message ?? ''"
      :confirm-text="confirming?.confirmText ?? '确认'"
      :danger="confirming?.danger ?? true"
      :loading="confirmLoading"
      @cancel="confirming = null"
      @confirm="runConfirm"
    />
  </div>
</template>
