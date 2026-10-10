<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { ArrowRight, ArrowUp, ChevronRight, File, Folder, Loader2, RefreshCw } from 'lucide-vue-next';
import api from '../api.js';
import { formatSize } from '../format.js';
import { toast } from '../toast.js';

const emit = defineEmits(['select']);

const currentPath = ref('/');
const pathInput = ref('/');
const directories = ref([]);
const files = ref([]);
const loading = ref(true);
const error = ref('');
const refreshing = ref(false);
const busyDirs = reactive(new Set());

const breadcrumbs = computed(() => {
  const parts = currentPath.value.split('/').filter(Boolean);
  const crumbs = [{ label: '根目录', path: '/' }];
  let acc = '';
  for (const part of parts) {
    acc += `/${part}`;
    crumbs.push({ label: part, path: acc });
  }
  return crumbs;
});

const parentPath = computed(() => {
  const parts = currentPath.value.split('/').filter(Boolean);
  if (parts.length === 0) return '/';
  parts.pop();
  return parts.length === 0 ? '/' : `/${parts.join('/')}`;
});

async function load(path) {
  loading.value = true;
  error.value = '';
  try {
    const data = await api.directories(path);
    currentPath.value = data.path;
    pathInput.value = data.path;
    directories.value = data.directories ?? [];
    files.value = data.files ?? [];
  } catch (err) {
    error.value = err.message || '无法打开该目录';
    directories.value = [];
    files.value = [];
  } finally {
    loading.value = false;
  }
}

function go(raw) {
  const value = String(raw ?? '').trim();
  if (!value.startsWith('/')) {
    toast.error('路径必须以 / 开头');
    return;
  }
  load(value);
}

function enterDir(dir) {
  load(dir.path);
}

function goParent() {
  if (currentPath.value === '/') return;
  load(parentPath.value);
}

async function refreshCurrent() {
  if (refreshing.value) return;
  refreshing.value = true;
  try {
    await api.invalidateDirectoryCache(currentPath.value);
    await load(currentPath.value);
  } catch (err) {
    toast.error(err.message);
  } finally {
    refreshing.value = false;
  }
}

/** 目录旁的刷新：清除该目录缓存，下次进入时必然重新扫描 */
async function refreshDir(dir) {
  if (busyDirs.has(dir.path)) return;
  busyDirs.add(dir.path);
  try {
    await api.invalidateDirectoryCache(dir.path);
    toast.success(`已清除 ${dir.path} 的缓存`);
  } catch (err) {
    toast.error(err.message);
  } finally {
    busyDirs.delete(dir.path);
  }
}

onMounted(() => load('/'));
</script>

<template>
  <div class="overflow-hidden rounded-xl border border-line bg-ink-950/60">
    <div class="space-y-2.5 border-b border-white/6 p-3">
      <div class="flex gap-2">
        <input
          v-model="pathInput"
          class="field flex-1 px-3 py-1.5 font-mono text-[12px]"
          type="text"
          spellcheck="false"
          placeholder="/"
          @keydown.enter="go(pathInput)"
        />
        <button class="btn-ghost px-3 py-1.5 text-[12px]" type="button" @click="go(pathInput)">
          <ArrowRight class="size-3.5" />
          跳转
        </button>
        <button
          class="icon-btn size-8 border border-line bg-white/3"
          type="button"
          title="刷新当前目录"
          @click="refreshCurrent"
        >
          <RefreshCw class="size-3.5" :class="refreshing ? 'animate-spin' : ''" />
        </button>
      </div>

      <nav class="flex flex-wrap items-center gap-1 text-[12px]">
        <template v-for="(crumb, index) in breadcrumbs" :key="crumb.path">
          <button
            class="cursor-pointer rounded px-1.5 py-0.5 font-mono transition"
            :class="
              index === breadcrumbs.length - 1
                ? 'bg-brand-500/15 text-brand-300'
                : 'text-fg-dim hover:bg-white/6 hover:text-fg'
            "
            type="button"
            :title="crumb.path"
            @click="go(crumb.path)"
          >
            {{ crumb.label }}
          </button>
          <ChevronRight v-if="index < breadcrumbs.length - 1" class="size-3 text-fg-dim" />
        </template>
      </nav>
    </div>

    <div class="max-h-[300px] overflow-y-auto p-1.5">
      <div v-if="loading" class="flex items-center gap-2 px-2 py-2 text-[12px] text-fg-dim">
        <Loader2 class="size-3.5 animate-spin" />
        正在读取目录…
      </div>

      <div v-else-if="error" class="space-y-2 px-2 py-2">
        <p class="text-[12px] leading-relaxed text-warn">{{ error }}</p>
        <button class="btn-ghost px-2.5 py-1 text-[12px]" type="button" @click="goParent">
          <ArrowUp class="size-3.5" />
          返回上级
        </button>
      </div>

      <template v-else>
        <button
          v-if="currentPath !== '/'"
          class="group flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/5"
          type="button"
          :title="parentPath"
          @click="goParent"
        >
          <ArrowUp class="size-3.5 shrink-0 text-fg-dim group-hover:text-fg" />
          <span class="text-[12.5px] text-fg-dim group-hover:text-fg">返回上级目录</span>
        </button>

        <div
          v-for="dir in directories"
          :key="dir.path"
          class="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-white/5"
        >
          <button
            class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
            type="button"
            :title="`进入 ${dir.path}`"
            @click="enterDir(dir)"
          >
            <Folder class="size-4 shrink-0 text-brand-400" />
            <span class="truncate text-[12.5px] text-fg">{{ dir.name }}</span>
          </button>

          <button
            class="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-fg-dim opacity-0 transition group-hover:opacity-100 hover:text-accent-400"
            type="button"
            title="清除该目录缓存"
            @click.stop="refreshDir(dir)"
          >
            <RefreshCw class="size-3" :class="busyDirs.has(dir.path) ? 'animate-spin' : ''" />
          </button>

          <ChevronRight class="size-3.5 shrink-0 text-fg-dim transition group-hover:text-brand-300" />
        </div>

        <button
          v-for="file in files"
          :key="file.path"
          class="group flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-brand-500/12"
          type="button"
          :title="`选择 ${file.path}`"
          @click="emit('select', file.path)"
        >
          <File class="size-4 shrink-0 text-fg-dim transition group-hover:text-brand-300" />
          <span class="min-w-0 flex-1 truncate text-[12.5px] text-fg-muted transition group-hover:text-fg">
            {{ file.name }}
          </span>
          <span class="shrink-0 font-mono text-[11px] text-fg-dim">{{ formatSize(file.size) }}</span>
        </button>

        <div
          v-if="directories.length === 0 && files.length === 0"
          class="px-2 py-2 text-[12px] text-fg-dim"
        >
          （空目录）
        </div>
      </template>
    </div>
  </div>
</template>
