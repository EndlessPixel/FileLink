<script setup>
import { computed, ref } from 'vue';
import { ArrowRight, ChevronRight, RefreshCw } from 'lucide-vue-next';
import api from '../api.js';
import { toast } from '../toast.js';
import TreeNode from './TreeNode.vue';

const emit = defineEmits(['select']);

const currentPath = ref('/');
const pathInput = ref('/');
const treeKey = ref(0);
const refreshing = ref(false);

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

function go(raw) {
  const value = String(raw ?? '').trim();
  if (!value.startsWith('/')) {
    toast.error('路径必须以 / 开头');
    return;
  }
  currentPath.value = value.replace(/\/+$/, '') || '/';
  pathInput.value = currentPath.value;
  treeKey.value += 1;
}

async function refreshCurrent() {
  if (refreshing.value) return;
  refreshing.value = true;
  try {
    await api.invalidateDirectoryCache(currentPath.value);
    treeKey.value += 1;
  } catch (err) {
    toast.error(err.message);
  } finally {
    refreshing.value = false;
  }
}

function handleSelect(path) {
  emit('select', path);
}

function handleEnter(path) {
  go(path);
}
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
      <TreeNode
        :key="`${currentPath}:${treeKey}`"
        :path="currentPath"
        @select="handleSelect"
        @enter="handleEnter"
      />
    </div>
  </div>
</template>
