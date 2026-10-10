<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { KeyRound, Link2, Loader2, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-vue-next';
import api from '../api.js';
import { formatDuration } from '../format.js';

const emit = defineEmits(['authenticated']);

const password = ref('');
const captcha = ref('');
const captchaRequired = ref(false);
const captchaUrl = ref('');
const errorMessage = ref('');
const remainingAttempts = ref(null);
const bannedSeconds = ref(0);
const loading = ref(false);

let banTimer = null;

const banned = computed(() => bannedSeconds.value > 0);

function refreshCaptcha() {
  captchaUrl.value = api.captchaUrl();
}

function startBanCountdown(seconds) {
  bannedSeconds.value = Math.max(Number(seconds) || 0, 0);
  if (banTimer) clearInterval(banTimer);
  banTimer = setInterval(() => {
    bannedSeconds.value -= 1;
    if (bannedSeconds.value <= 0) {
      clearInterval(banTimer);
      banTimer = null;
      bannedSeconds.value = 0;
      errorMessage.value = '';
    }
  }, 1000);
}

async function submit() {
  if (loading.value || banned.value) return;
  loading.value = true;
  errorMessage.value = '';
  try {
    await api.login({ password: password.value, captcha: captcha.value });
    emit('authenticated');
  } catch (error) {
    const payload = error.payload ?? {};
    if (payload.error === 'banned') {
      startBanCountdown(payload.retryAfterSeconds);
      errorMessage.value = payload.message || '该 IP 已被临时封禁';
    } else {
      errorMessage.value = payload.message || error.message;
      remainingAttempts.value = payload.remainingAttempts ?? null;
      if (payload.captchaRequired) {
        captchaRequired.value = true;
        captcha.value = '';
        refreshCaptcha();
      }
      password.value = '';
    }
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  refreshCaptcha();
});
onBeforeUnmount(() => {
  if (banTimer) clearInterval(banTimer);
});
</script>

<template>
  <div class="relative flex min-h-full items-center justify-center px-4 py-10">
    <div class="pointer-events-none absolute inset-x-0 top-0 h-[420px] animate-glow bg-[radial-gradient(600px_240px_at_50%_0%,rgba(99,102,241,0.28),transparent_70%)]" />

    <div class="relative w-full max-w-[420px] animate-fade-up">
      <div class="mb-8 text-center">
        <div
          class="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-linear-to-br from-brand-600 to-accent-400 shadow-[0_16px_40px_-16px_rgba(99,102,241,0.95)]"
        >
          <Link2 class="size-6.5 text-white" />
        </div>
        <h1 class="text-2xl font-semibold tracking-tight text-fg">FileLink 控制台</h1>
        <p class="mt-2 text-sm text-fg-muted">输入启动时控制台打印的管理员密码以继续</p>
      </div>

      <form class="glass-card p-6" @submit.prevent="submit">
        <label class="mb-2 block text-[13px] font-medium text-fg-muted" for="password">管理员密码</label>
        <div class="relative">
          <KeyRound class="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-fg-dim" />
          <input
            id="password"
            v-model="password"
            class="field pl-10"
            type="password"
            autocomplete="current-password"
            placeholder="请输入管理员密码"
            :disabled="loading || banned"
          />
        </div>

        <div v-if="captchaRequired && !banned" class="mt-5">
          <label class="mb-2 block text-[13px] font-medium text-fg-muted" for="captcha">图形验证码</label>
          <div class="flex items-center gap-3">
            <input
              id="captcha"
              v-model="captcha"
              class="field flex-1"
              type="text"
              autocomplete="off"
              placeholder="输入图中字符"
              :disabled="loading"
            />
            <button
              class="h-[42px] shrink-0 cursor-pointer overflow-hidden rounded-xl border border-line bg-ink-950/70 transition hover:border-brand-500/50"
              type="button"
              title="点击刷新验证码"
              @click="refreshCaptcha"
            >
              <img v-if="captchaUrl" :src="captchaUrl" alt="验证码" class="h-full w-[132px] object-cover" />
            </button>
            <span class="icon-btn" title="刷新验证码" @click="refreshCaptcha">
              <RefreshCw class="size-4" />
            </span>
          </div>
        </div>

        <div
          v-if="errorMessage"
          class="mt-5 flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[13px] leading-relaxed"
          :class="banned ? 'border-danger/30 bg-danger/10 text-danger' : 'border-warn/30 bg-warn/10 text-warn'"
        >
          <ShieldAlert class="mt-0.5 size-4 shrink-0" />
          <span>
            {{ errorMessage }}
            <template v-if="banned">，剩余 {{ formatDuration(bannedSeconds) }}</template>
            <template v-else-if="remainingAttempts !== null && remainingAttempts > 0">
              ，还可尝试 {{ remainingAttempts }} 次
            </template>
          </span>
        </div>

        <button class="btn-primary mt-6 w-full" type="submit" :disabled="loading || banned">
          <Loader2 v-if="loading" class="size-4 animate-spin" />
          <ShieldCheck v-else class="size-4" />
          {{ banned ? '已临时封禁' : loading ? '正在校验…' : '进入控制台' }}
        </button>

        <p class="mt-4 text-center text-[12px] leading-relaxed text-fg-dim">
          密码错误一次后需填写图形验证码，连续 3 次失败将封禁该 IP 5 分钟
        </p>
      </form>
    </div>
  </div>
</template>
