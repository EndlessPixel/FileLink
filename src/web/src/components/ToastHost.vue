<script setup>
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-vue-next';
import { dismissToast, toasts } from '../toast.js';

const styles = {
  success: { wrap: 'border-ok/30 bg-ok/10 text-ok', icon: CheckCircle2 },
  error: { wrap: 'border-danger/30 bg-danger/10 text-danger', icon: AlertCircle },
  info: { wrap: 'border-brand-500/30 bg-brand-500/10 text-brand-300', icon: Info },
};
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 top-5 z-[60] flex flex-col items-center gap-2.5 px-4">
    <TransitionGroup
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="translate-y-[-12px] opacity-0"
      leave-active-class="transition duration-200 ease-in"
      leave-to-class="translate-y-[-8px] opacity-0"
    >
      <div
        v-for="item in toasts"
        :key="item.id"
        class="pointer-events-auto flex w-full max-w-[440px] items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-[0_18px_40px_-20px_rgba(0,0,0,0.95)] backdrop-blur-xl"
        :class="(styles[item.type] ?? styles.info).wrap"
      >
        <component :is="(styles[item.type] ?? styles.info).icon" class="size-4 shrink-0" />
        <span class="flex-1 leading-relaxed">{{ item.message }}</span>
        <button class="icon-btn size-6" type="button" @click="dismissToast(item.id)">
          <X class="size-3.5" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>
