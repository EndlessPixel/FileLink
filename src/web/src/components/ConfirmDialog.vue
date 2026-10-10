<script setup>
import { AlertTriangle } from 'lucide-vue-next';

defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '确认操作' },
  message: { type: String, default: '' },
  confirmText: { type: String, default: '确认' },
  danger: { type: Boolean, default: true },
  loading: { type: Boolean, default: false },
});

const emit = defineEmits(['confirm', 'cancel']);
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
      @click.self="emit('cancel')"
    >
      <div class="glass-card w-full max-w-[420px] p-6 animate-fade-up">
        <div class="flex items-start gap-3.5">
          <span
            class="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl"
            :class="danger ? 'bg-danger/12 text-danger' : 'bg-warn/12 text-warn'"
          >
            <AlertTriangle class="size-4.5" />
          </span>
          <div class="flex-1">
            <h3 class="text-[15px] font-semibold text-fg">{{ title }}</h3>
            <p class="mt-1.5 text-sm leading-relaxed text-fg-muted">{{ message }}</p>
          </div>
        </div>

        <div class="mt-6 flex justify-end gap-2.5">
          <button class="btn-ghost" type="button" :disabled="loading" @click="emit('cancel')">取消</button>
          <button
            class="min-w-[88px]"
            :class="danger ? 'btn-danger' : 'btn-primary'"
            type="button"
            :disabled="loading"
            @click="emit('confirm')"
          >
            {{ loading ? '处理中…' : confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>
