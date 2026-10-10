<script setup>
import { computed, ref, watch } from 'vue';
import { FolderOpen, FolderTree, Loader2, X } from 'lucide-vue-next';
import api from '../api.js';
import { toast } from '../toast.js';
import FileTreePicker from './FileTreePicker.vue';

const props = defineProps({
  open: { type: Boolean, default: false },
});
const emit = defineEmits(['close', 'added']);

const filePath = ref('');
const submitting = ref(false);

const pathError = computed(() => {
  const value = filePath.value.trim();
  if (value === '') return '';
  if (!value.startsWith('/')) return '请填写服务器上的绝对路径（以 / 开头）';
  return '';
});

const canSubmit = computed(() => filePath.value.trim().startsWith('/') && !submitting.value);

watch(
  () => props.open,
  (open) => {
    if (open) filePath.value = '';
  }
);

/** 文件选择器选中后填入路径输入框 */
function handlePickerSelect(path) {
  filePath.value = path;
}

async function submit() {
  if (!canSubmit.value) return;
  submitting.value = true;
  try {
    const result = await api.addFile(filePath.value.trim());
    toast.success(
      result.isNew
        ? `已添加：${result.filePath}（${(result.sha256 || '').slice(0, 12)}…）`
        : `该文件已存在，已刷新路径映射`
    );
    emit('added');
    emit('close');
  } catch (error) {
    toast.error(error.message);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <Transition
    enter-active-class="transition duration-200"
    enter-from-class="opacity-0"
    leave-active-class="transition duration-150"
    leave-to-class="opacity-0"
  >
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/80 px-4 backdrop-blur-sm"
      @click.self="emit('close')"
    >
      <form
        class="glass-card max-h-[86vh] w-full max-w-[560px] overflow-y-auto p-6 animate-fade-up"
        @submit.prevent="submit"
      >
        <div class="flex items-start justify-between gap-4">
          <div>
            <h3 class="text-[15px] font-semibold text-fg">添加文件</h3>
            <p class="mt-1 text-[12px] text-fg-dim">输入服务器上已存在文件的绝对路径，系统将流式计算 sha256</p>
          </div>
          <button class="icon-btn" type="button" @click="emit('close')">
            <X class="size-4" />
          </button>
        </div>

        <div class="mt-5">
          <label class="mb-2 block text-[13px] font-medium text-fg-muted" for="file-real-path">文件绝对路径</label>
          <div class="relative">
            <FolderOpen class="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-fg-dim" />
            <input
              id="file-real-path"
              v-model="filePath"
              class="field pl-10 font-mono text-[13px]"
              type="text"
              autocomplete="off"
              spellcheck="false"
              placeholder="/var/data/releases/app-v3.2.1.tar.gz"
              :disabled="submitting"
            />
          </div>
          <p v-if="pathError" class="mt-2 text-[12px] text-warn">{{ pathError }}</p>
          <p v-else class="mt-2 text-[12px] text-fg-dim">仅建立数据库映射，不会复制或修改磁盘上的原文件</p>
        </div>

        <div class="mt-4">
          <p class="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-fg-muted">
            <FolderTree class="size-3.5 text-brand-400" />
            从服务器浏览选择
          </p>
          <FileTreePicker @select="handlePickerSelect" />
        </div>

        <div class="mt-6 flex justify-end gap-2.5">
          <button class="btn-ghost" type="button" :disabled="submitting" @click="emit('close')">取消</button>
          <button class="btn-primary min-w-[104px]" type="submit" :disabled="!canSubmit">
            <Loader2 v-if="submitting" class="size-4 animate-spin" />
            {{ submitting ? '正在计算 sha256…' : '确认添加' }}
          </button>
        </div>
      </form>
    </div>
  </Transition>
</template>
