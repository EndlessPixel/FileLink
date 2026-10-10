<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ChevronDown, ChevronRight, File, Folder, Loader2, RefreshCw } from 'lucide-vue-next';
import api from '../api.js';
import { formatSize } from '../format.js';
import { toast } from '../toast.js';

const props = defineProps({
  path: { type: String, required: true },
  depth: { type: Number, default: 0 },
});
const emit = defineEmits(['select', 'enter']);

const loading = ref(true);
const error = ref('');
const directories = ref([]);
const files = ref([]);
const expandedSet = reactive(new Set());
const refreshBusy = reactive(new Set());
const refreshKeys = reactive({});

async function fetchData() {
  loading.value = true;
  error.value = '';
  try {
    const data = await api.directories(props.path);
    directories.value = data.directories ?? [];
    files.value = data.files ?? [];
  } catch (err) {
    error.value = err.message || '加载失败';
  } finally {
    loading.value = false;
  }
}

function toggleDir(dir) {
  if (expandedSet.has(dir.path)) expandedSet.delete(dir.path);
  else expandedSet.add(dir.path);
}

/** 目录旁刷新：先清服务端缓存，再通过改 key 强制子节点重新挂载拉取 */
async function refreshDir(dir) {
  if (refreshBusy.has(dir.path)) return;
  refreshBusy.add(dir.path);
  try {
    await api.invalidateDirectoryCache(dir.path);
    refreshKeys[dir.path] = (refreshKeys[dir.path] ?? 0) + 1;
  } catch (err) {
    toast.error(err.message);
  } finally {
    refreshBusy.delete(dir.path);
  }
}

function enterDir(dir) {
  emit('enter', dir.path);
}

function selectFile(file) {
  emit('select', file.path);
}

onMounted(fetchData);
</script>

<template>
  <div>
    <div v-if="loading" class="flex items-center gap-2 px-2 py-1.5 text-[12px] text-fg-dim">
      <Loader2 class="size-3.5 animate-spin" />
      加载中…
    </div>

    <div v-else-if="error" class="px-2 py-1.5 text-[12px] leading-relaxed text-warn">{{ error }}</div>

    <template v-else>
      <div v-for="dir in directories" :key="dir.path">
        <div
          class="group flex items-center gap-1 rounded-lg py-1 pr-1 transition hover:bg-white/5"
          :style="{ paddingLeft: `${depth * 14 + 6}px` }"
        >
          <button
            class="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-fg-dim transition hover:text-fg"
            type="button"
            :title="expandedSet.has(dir.path) ? '收起' : '展开'"
            @click="toggleDir(dir)"
          >
            <component :is="expandedSet.has(dir.path) ? ChevronDown : ChevronRight" class="size-3.5" />
          </button>

          <button
            class="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left"
            type="button"
            :title="`${dir.path}（双击进入）`"
            @click="toggleDir(dir)"
            @dblclick="enterDir(dir)"
          >
            <Folder class="size-3.5 shrink-0 text-brand-400" />
            <span class="truncate text-[12.5px] text-fg">{{ dir.name }}</span>
          </button>

          <button
            class="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-fg-dim opacity-0 transition group-hover:opacity-100 hover:text-accent-400"
            type="button"
            title="刷新该目录（清除缓存后重拉）"
            @click.stop="refreshDir(dir)"
          >
            <RefreshCw class="size-3" :class="refreshBusy.has(dir.path) ? 'animate-spin' : ''" />
          </button>
        </div>

        <TreeNode
          v-if="expandedSet.has(dir.path)"
          :key="`${dir.path}:${refreshKeys[dir.path] ?? 0}`"
          :path="dir.path"
          :depth="depth + 1"
          @select="(p) => emit('select', p)"
          @enter="(p) => emit('enter', p)"
        />
      </div>

      <div
        v-for="file in files"
        :key="file.path"
        class="group flex cursor-pointer items-center gap-1.5 rounded-lg py-1 pr-1 transition hover:bg-brand-500/12"
        :style="{ paddingLeft: `${depth * 14 + 26}px` }"
        :title="file.path"
        @click="selectFile(file)"
      >
        <File class="size-3.5 shrink-0 text-fg-dim transition group-hover:text-brand-300" />
        <span class="min-w-0 flex-1 truncate text-[12.5px] text-fg-muted transition group-hover:text-fg">
          {{ file.name }}
        </span>
        <span class="shrink-0 font-mono text-[11px] text-fg-dim">{{ formatSize(file.size) }}</span>
      </div>

      <div v-if="directories.length === 0 && files.length === 0" class="px-2 py-1.5 text-[12px] text-fg-dim">
        （空目录）
      </div>
    </template>
  </div>
</template>
