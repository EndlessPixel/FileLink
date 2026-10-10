<script setup>
import { computed, onMounted, ref } from 'vue';
import { Check, Eye, EyeOff, Info, KeyRound, Loader2, Route, Save, ShieldCheck, X } from 'lucide-vue-next';
import api from '../api.js';
import { toast } from '../toast.js';

const loading = ref(true);
const currentPath = ref('');
const customAdminPath = ref(false);
const customPassword = ref(false);

const pathInput = ref('');
const savingPath = ref(false);

const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const reveal = ref(false);
const savingPassword = ref(false);

const pathError = computed(() => {
  const value = pathInput.value.trim();
  if (value === '') return '';
  if (!value.startsWith('/')) return '必须以 / 开头';
  if (value.length < 4 || value.length > 64) return '长度需在 4 到 64 个字符之间';
  if (!/^\/[A-Za-z0-9._~-]{3,63}$/.test(value)) {
    return '仅允许字母、数字、点、下划线、连字符、波浪线，且不能有额外斜杠';
  }
  return '';
});

const canSavePath = computed(
  () => pathInput.value.trim() !== '' && pathInput.value.trim() !== currentPath.value && !pathError.value && !savingPath.value
);

const checks = computed(() => [
  { label: '至少 8 位', ok: newPassword.value.length >= 8 },
  { label: '大写字母', ok: /[A-Z]/.test(newPassword.value) },
  { label: '小写字母', ok: /[a-z]/.test(newPassword.value) },
  { label: '数字', ok: /[0-9]/.test(newPassword.value) },
  { label: '特殊符号', ok: /[^A-Za-z0-9]/.test(newPassword.value) && !/\s/.test(newPassword.value) },
]);

const passwordValid = computed(() => checks.value.every((item) => item.ok));
const passwordMatch = computed(() => newPassword.value !== '' && newPassword.value === confirmPassword.value);
const canSavePassword = computed(
  () => currentPassword.value !== '' && passwordValid.value && passwordMatch.value && !savingPassword.value
);

async function load() {
  loading.value = true;
  try {
    const data = await api.security();
    currentPath.value = data.currentPath ?? data.adminPath ?? '';
    pathInput.value = currentPath.value;
    customAdminPath.value = data.customAdminPath === true;
    customPassword.value = data.customPassword === true;
  } catch (error) {
    toast.error(error.message);
  } finally {
    loading.value = false;
  }
}

async function savePath() {
  if (!canSavePath.value) return;
  savingPath.value = true;
  try {
    const data = await api.updateAdminPath(pathInput.value.trim());
    currentPath.value = data.adminPath;
    customAdminPath.value = true;
    toast.success(`安全入口已更新为 ${data.adminPath}，即将跳转…`);
    setTimeout(() => window.location.replace(`${data.adminPath}/`), 1200);
  } catch (error) {
    toast.error(error.message);
  } finally {
    savingPath.value = false;
  }
}

async function savePassword() {
  if (!canSavePassword.value) return;
  savingPassword.value = true;
  try {
    await api.updatePassword({
      currentPassword: currentPassword.value,
      newPassword: newPassword.value,
      confirmPassword: confirmPassword.value,
    });
    customPassword.value = true;
    currentPassword.value = '';
    newPassword.value = '';
    confirmPassword.value = '';
    toast.success('登录密码已更新，下次登录请使用新密码');
  } catch (error) {
    toast.error(error.message);
  } finally {
    savingPassword.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <div v-if="loading" class="glass-card flex items-center justify-center gap-3 py-16 text-sm text-fg-muted">
      <Loader2 class="size-4 animate-spin" />
      正在加载安全设置…
    </div>

    <template v-else>
      <div class="glass-card p-5">
        <div class="flex items-start justify-between gap-4">
          <div class="flex items-start gap-3.5">
            <span class="flex size-11 items-center justify-center rounded-xl bg-brand-500/12 text-brand-300">
              <Route class="size-5" />
            </span>
            <div>
              <h3 class="text-sm font-semibold text-fg">安全入口</h3>
              <p class="mt-1 text-[12px] text-fg-dim">
                管理后台的访问路径。未自定义时每次启动随机生成；自定义后固定使用，不再随机。
              </p>
            </div>
          </div>
          <span
            class="badge shrink-0 border"
            :class="customAdminPath ? 'border-ok/30 bg-ok/10 text-ok' : 'border-line bg-white/3 text-fg-muted'"
          >
            {{ customAdminPath ? '已自定义' : '启动随机' }}
          </span>
        </div>

        <div class="mt-5">
          <p class="mb-2 text-[12px] text-fg-dim">
            当前生效：<span class="font-mono text-fg">{{ currentPath }}</span>
          </p>
          <div class="flex flex-wrap gap-2">
            <input
              v-model="pathInput"
              class="field flex-1 min-w-[220px] font-mono text-[13px]"
              type="text"
              spellcheck="false"
              placeholder="/my-secret-panel"
            />
            <button class="btn-primary min-w-[132px]" type="button" :disabled="!canSavePath" @click="savePath">
              <Loader2 v-if="savingPath" class="size-4 animate-spin" />
              <Save v-else class="size-4" />
              保存入口
            </button>
          </div>
          <p v-if="pathError" class="mt-2 text-[12px] text-warn">{{ pathError }}</p>
          <p v-else class="mt-2 text-[12px] text-fg-dim">
            立即可用：保存后本页会自动跳转到新入口，旧入口立刻失效（访问会直接断开连接）。
          </p>
        </div>
      </div>

      <div class="glass-card p-5">
        <div class="flex items-start justify-between gap-4">
          <div class="flex items-start gap-3.5">
            <span class="flex size-11 items-center justify-center rounded-xl bg-info/12 text-info">
              <KeyRound class="size-5" />
            </span>
            <div>
              <h3 class="text-sm font-semibold text-fg">登录密码</h3>
              <p class="mt-1 text-[12px] text-fg-dim">
                未自定义时使用启动时随机生成的密码；设置后固定使用此密码。
              </p>
            </div>
          </div>
          <span
            class="badge shrink-0 border"
            :class="customPassword ? 'border-ok/30 bg-ok/10 text-ok' : 'border-line bg-white/3 text-fg-muted'"
          >
            {{ customPassword ? '已自定义' : '启动随机' }}
          </span>
        </div>

        <div class="mt-5 space-y-4">
          <div>
            <label class="mb-2 block text-[13px] font-medium text-fg-muted" for="current-password">当前密码</label>
            <input
              id="current-password"
              v-model="currentPassword"
              class="field"
              type="password"
              autocomplete="current-password"
              placeholder="用于确认是本人操作"
            />
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="mb-2 block text-[13px] font-medium text-fg-muted" for="new-password">新密码</label>
              <div class="relative">
                <input
                  id="new-password"
                  v-model="newPassword"
                  class="field pr-10"
                  :type="reveal ? 'text' : 'password'"
                  autocomplete="new-password"
                  placeholder="设置新的登录密码"
                />
                <button
                  class="absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer text-fg-dim transition hover:text-fg"
                  type="button"
                  :title="reveal ? '隐藏' : '显示'"
                  @click="reveal = !reveal"
                >
                  <component :is="reveal ? EyeOff : Eye" class="size-4" />
                </button>
              </div>
            </div>

            <div>
              <label class="mb-2 block text-[13px] font-medium text-fg-muted" for="confirm-password">确认新密码</label>
              <input
                id="confirm-password"
                v-model="confirmPassword"
                class="field"
                :type="reveal ? 'text' : 'password'"
                autocomplete="new-password"
                placeholder="再次输入新密码"
              />
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <span
              v-for="item in checks"
              :key="item.label"
              class="badge border"
              :class="
                newPassword === ''
                  ? 'border-line bg-white/3 text-fg-dim'
                  : item.ok
                    ? 'border-ok/30 bg-ok/10 text-ok'
                    : 'border-warn/25 bg-warn/10 text-warn'
              "
            >
              <Check v-if="newPassword !== '' && item.ok" class="size-3" />
              <X v-else-if="newPassword !== ''" class="size-3" />
              {{ item.label }}
            </span>
          </div>

          <p v-if="confirmPassword !== '' && !passwordMatch" class="text-[12px] text-warn">两次输入的新密码不一致</p>

          <div class="flex justify-end">
            <button class="btn-primary min-w-[148px]" type="button" :disabled="!canSavePassword" @click="savePassword">
              <Loader2 v-if="savingPassword" class="size-4 animate-spin" />
              <ShieldCheck v-else class="size-4" />
              更新密码
            </button>
          </div>
        </div>
      </div>

      <div class="flex items-start gap-2.5 px-1 text-[12px] text-fg-dim">
        <Info class="mt-0.5 size-3.5 shrink-0" />
        <span>
          密码以 scrypt 加盐哈希存储，服务端不保存明文；安全入口与密码保存在数据库中，重启后依然生效。
          若需要恢复成随机凭据，清空数据库 config 表中的 admin_path 与 admin_password_hash 两行即可。
        </span>
      </div>
    </template>
  </div>
</template>
