<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { Activity, Clock, Files, Link2, LogOut, ShieldBan, Sliders } from 'lucide-vue-next';
import api, { setUnauthorizedHandler } from './api.js';
import { formatDuration } from './format.js';
import { toast } from './toast.js';
import ToastHost from './components/ToastHost.vue';
import LoginView from './views/LoginView.vue';
import FilesView from './views/FilesView.vue';
import BlacklistView from './views/BlacklistView.vue';
import SettingsView from './views/SettingsView.vue';

const tabs = [
  { id: 'files', label: '文件管理', hint: '登记与分发', icon: Files, view: FilesView },
  { id: 'blacklist', label: 'IP 黑名单', hint: '访问拦截', icon: ShieldBan, view: BlacklistView },
  { id: 'settings', label: '限速与设置', hint: '带宽控制', icon: Sliders, view: SettingsView },
];

const authenticated = ref(false);
const checking = ref(true);
const activeTab = ref('files');
const expiresAt = ref(null);
const nowTick = ref(Date.now());

let clockTimer = null;

const currentTab = computed(() => tabs.find((tab) => tab.id === activeTab.value) ?? tabs[0]);
const currentView = computed(() => currentTab.value.view);
const sessionLeft = computed(() => {
  if (!expiresAt.value) return '本次会话';
  const left = Math.floor((expiresAt.value - nowTick.value) / 1000);
  return left > 0 ? `会话剩余 ${formatDuration(left)}` : '会话即将过期';
});

setUnauthorizedHandler(() => {
  if (!authenticated.value) return;
  authenticated.value = false;
  expiresAt.value = null;
  toast.error('会话已失效，请重新登录');
});

async function loadSession() {
  try {
    const data = await api.session();
    authenticated.value = data.authenticated === true;
    expiresAt.value = data.expiresAt ?? null;
  } catch {
    authenticated.value = false;
  } finally {
    checking.value = false;
  }
}

async function handleAuthenticated() {
  await loadSession();
  toast.success('登录成功，欢迎回到 FileLink 控制台');
}

async function logout() {
  try {
    await api.logout();
  } catch {
    // 忽略登出异常，直接回到登录页
  }
  authenticated.value = false;
  expiresAt.value = null;
}

onMounted(() => {
  loadSession();
  clockTimer = setInterval(() => {
    nowTick.value = Date.now();
  }, 1000);
});

onBeforeUnmount(() => {
  if (clockTimer) clearInterval(clockTimer);
});
</script>

<template>
  <div v-if="checking" class="flex min-h-full items-center justify-center">
    <div class="flex items-center gap-3 text-sm text-fg-muted">
      <Activity class="size-4 animate-pulse text-brand-400" />
      正在校验会话…
    </div>
  </div>

  <LoginView v-else-if="!authenticated" @authenticated="handleAuthenticated" />

  <div v-else class="min-h-full">
    <aside
      class="fixed inset-y-0 left-0 z-30 flex w-[236px] flex-col border-r border-white/6 bg-ink-950/80 backdrop-blur-xl max-lg:w-[76px]"
    >
      <div class="flex h-[68px] items-center gap-3 border-b border-white/6 px-5 max-lg:justify-center max-lg:px-0">
        <span
          class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-brand-600 to-accent-400 shadow-[0_10px_24px_-12px_rgba(99,102,241,0.95)]"
        >
          <Link2 class="size-4.5 text-white" />
        </span>
        <div class="min-w-0 max-lg:hidden">
          <p class="text-[15px] font-semibold tracking-tight text-fg">FileLink</p>
          <p class="text-[11px] text-fg-dim">直链分发控制台</p>
        </div>
      </div>

      <nav class="flex-1 space-y-1.5 p-3">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="group flex w-full cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition max-lg:justify-center max-lg:px-0"
          :class="
            activeTab === tab.id
              ? 'border-brand-500/35 bg-brand-500/12 text-fg'
              : 'border-transparent text-fg-muted hover:border-white/8 hover:bg-white/4 hover:text-fg'
          "
          type="button"
          @click="activeTab = tab.id"
        >
          <component :is="tab.icon" class="size-4.5 shrink-0" />
          <span class="min-w-0 flex-1 max-lg:hidden">
            <span class="block truncate text-sm font-medium">{{ tab.label }}</span>
            <span class="block truncate text-[11px] text-fg-dim">{{ tab.hint }}</span>
          </span>
        </button>
      </nav>

      <div class="border-t border-white/6 p-3 max-lg:hidden">
        <p class="px-2 text-[11px] leading-relaxed text-fg-dim">
          短码链接无有效期，重新生成后旧链接立即失效
        </p>
      </div>
    </aside>

    <div class="flex min-h-full flex-col pl-[236px] max-lg:pl-[76px]">
      <header
        class="fixed top-0 right-0 left-[236px] z-20 flex h-[68px] items-center justify-between border-b border-white/6 bg-ink-900/70 px-6 backdrop-blur-xl max-lg:left-[76px]"
      >
        <div class="min-w-0">
          <h2 class="truncate text-[15px] font-semibold text-fg">{{ currentTab.label }}</h2>
          <p class="truncate text-[12px] text-fg-dim">{{ currentTab.hint }}</p>
        </div>

        <div class="flex items-center gap-3">
          <span class="badge border border-line bg-white/3 text-fg-muted max-sm:hidden">
            <Clock class="size-3" />
            {{ sessionLeft }}
          </span>
          <button class="btn-ghost px-3 py-2" type="button" @click="logout">
            <LogOut class="size-4" />
            <span class="max-sm:hidden">退出</span>
          </button>
        </div>
      </header>

      <main class="w-full flex-1 px-6 pt-[92px] pb-10">
        <div class="mx-auto w-full max-w-[1180px]">
          <component :is="currentView" />
        </div>
      </main>
    </div>
  </div>

  <ToastHost />
</template>
