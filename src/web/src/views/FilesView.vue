<script setup>
import { computed, onMounted, ref } from 'vue';
import {
  Copy,
  Download,
  FileArchive,
  HardDrive,
  Inbox,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-vue-next';
import api, { fetchDownloadUrl } from '../api.js';
import { copyText } from '../clipboard.js';
import { toast } from '../toast.js';
import { fileBaseName, formatSize, formatTime, shortHash } from '../format.js';
import AddFileDialog from '../components/AddFileDialog.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';

const files = ref([]);
const stats = ref({ fileCount: 0, linkCount: 0, downloadCount: 0 });
const loading = ref(true);
const dialogOpen = ref(false);
const copyingSha = ref('');
const confirming = ref(null);
const confirmLoading = ref(false);
const expandedSha = ref('');

const cards = computed(() => [
  { label: '已登记文件', value: stats.value.fileCount, hint: '按 sha256 唯一', icon: FileArchive, tone: 'text-brand-300' },
  { label: '有效下载链接', value: stats.value.linkCount, hint: '一个文件一条短码', icon: Link2, tone: 'text-accent-400' },
  { label: '累计下载次数', value: stats.value.downloadCount, hint: '仅统计完整响应', icon: Download, tone: 'text-ok' },
]);

async function load() {
  loading.value = true;
  try {
    const [fileData, statData] = await Promise.all([api.files(), api.stats()]);
    files.value = fileData.files ?? [];
    stats.value = statData;
  } catch (error) {
    toast.error(error.message);
  } finally {
    loading.value = false;
  }
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
      await load();
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
      await load();
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

    <div class="glass-card overflow-hidden">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-white/6 px-5 py-4">
        <div>
          <h3 class="text-sm font-semibold text-fg">文件列表</h3>
          <p class="mt-0.5 text-[12px] text-fg-dim">共 {{ files.length }} 条记录</p>
        </div>
        <div class="flex items-center gap-2">
          <button class="btn-ghost px-3 py-2" type="button" :disabled="loading" @click="load">
            <RefreshCw class="size-4" :class="loading ? 'animate-spin' : ''" />
            <span class="max-sm:hidden">刷新</span>
          </button>
          <button class="btn-primary px-3.5 py-2" type="button" @click="dialogOpen = true">
            <Plus class="size-4" />
            添加文件
          </button>
        </div>
      </div>

      <div v-if="loading" class="flex items-center justify-center gap-3 py-16 text-sm text-fg-muted">
        <Loader2 class="size-4 animate-spin" />
        正在加载文件列表…
      </div>

      <div v-else-if="files.length === 0" class="flex flex-col items-center gap-3 py-16 text-center">
        <span class="flex size-12 items-center justify-center rounded-2xl bg-white/4 text-fg-dim">
          <Inbox class="size-5" />
        </span>
        <p class="text-sm text-fg-muted">还没有登记任何文件</p>
        <p class="max-w-[320px] text-[12px] text-fg-dim">
          点击右上角「添加文件」，填入服务器上文件的绝对路径即可生成下载链接
        </p>
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr class="border-b border-white/6 text-[12px] text-fg-dim">
              <th class="px-5 py-3 font-medium">文件名</th>
              <th class="px-4 py-3 font-medium">sha256</th>
              <th class="px-4 py-3 font-medium">服务器路径</th>
              <th class="px-4 py-3 font-medium">大小</th>
              <th class="px-4 py-3 font-medium">添加时间</th>
              <th class="px-4 py-3 font-medium">下载</th>
              <th class="px-5 py-3 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="file in files"
              :key="file.sha256"
              class="border-b border-white/4 transition hover:bg-white/3 last:border-0"
            >
              <td class="max-w-[200px] px-5 py-3.5">
                <div class="flex items-center gap-2.5">
                  <span class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/12 text-brand-300">
                    <HardDrive class="size-4" />
                  </span>
                  <span class="truncate font-medium text-fg">{{ fileBaseName(file.filePath) }}</span>
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
                    :disabled="Boolean(copyingSha)"
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
