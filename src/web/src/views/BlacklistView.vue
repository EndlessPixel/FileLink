<script setup>
import { computed, onMounted, ref } from 'vue';
import { Ban, Loader2, Plus, RefreshCw, ShieldBan, Trash2 } from 'lucide-vue-next';
import api from '../api.js';
import { toast } from '../toast.js';
import { formatTime } from '../format.js';
import ConfirmDialog from '../components/ConfirmDialog.vue';

const entries = ref([]);
const loading = ref(true);
const submitting = ref(false);
const ip = ref('');
const reason = ref('');
const confirming = ref(null);
const confirmLoading = ref(false);

/** 支持单个地址或 CIDR 网段，与后端 isIpRule 保持一致 */
const ipError = computed(() => {
  const value = ip.value.trim();
  if (value === '') return '';

  if (value.includes('/')) {
    const [address, prefix] = value.split('/');
    const maxBits = address.includes(':') ? 128 : 32;
    const isAddress = /^(\d{1,3}\.){3}\d{1,3}$/.test(address) || address.includes(':');
    if (!isAddress) return 'CIDR 网段格式不正确，例如 198.51.100.0/24';
    if (!/^\d{1,3}$/.test(prefix) || Number(prefix) > maxBits) {
      return `前缀长度需在 0 到 ${maxBits} 之间`;
    }
    return '';
  }

  const isV4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(value);
  return isV4 || value.includes(':') ? '' : '请输入合法的 IP 或 CIDR 网段';
});

const canSubmit = computed(() => ip.value.trim() !== '' && !ipError.value && !submitting.value);

async function load() {
  loading.value = true;
  try {
    const data = await api.blacklist();
    entries.value = data.entries ?? [];
  } catch (error) {
    toast.error(error.message);
  } finally {
    loading.value = false;
  }
}

async function submit() {
  if (!canSubmit.value) return;
  submitting.value = true;
  try {
    await api.addBlacklist(ip.value.trim(), reason.value.trim());
    toast.success(`已拉黑 ${ip.value.trim()}，该 IP 访问下载路径将直接返回 403`);
    ip.value = '';
    reason.value = '';
    await load();
  } catch (error) {
    toast.error(error.message);
  } finally {
    submitting.value = false;
  }
}

function askRemove(entry) {
  confirming.value = {
    title: '移出黑名单',
    message: `移除后 IP ${entry.ip} 将恢复对下载路径的访问。`,
    confirmText: '确认移除',
    danger: true,
    run: async () => {
      await api.removeBlacklist(entry.ip);
      toast.success(`已移除 ${entry.ip}`);
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

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <div class="glass-card flex items-center justify-between p-5">
      <div class="flex items-center gap-3.5">
        <span class="flex size-11 items-center justify-center rounded-xl bg-danger/12 text-danger">
          <ShieldBan class="size-5" />
        </span>
        <div>
          <p class="text-[13px] text-fg-muted">当前黑名单条目</p>
          <p class="mt-1 font-mono text-[24px] leading-none font-semibold text-fg">{{ entries.length }}</p>
        </div>
      </div>
      <button class="btn-ghost px-3 py-2" type="button" :disabled="loading" @click="load">
        <RefreshCw class="size-4" :class="loading ? 'animate-spin' : ''" />
        <span class="max-sm:hidden">刷新</span>
      </button>
    </div>

    <form class="glass-card p-5" @submit.prevent="submit">
      <h3 class="text-sm font-semibold text-fg">添加黑名单</h3>
      <p class="mt-1 text-[12px] text-fg-dim">
        命中黑名单的 IP 访问下载路径时直接返回 403，不再校验短码；支持单个地址或 CIDR 网段
      </p>

      <div class="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-start">
        <div>
          <label class="mb-2 block text-[13px] font-medium text-fg-muted" for="blacklist-ip">IP 或网段</label>
          <input
            id="blacklist-ip"
            v-model="ip"
            class="field font-mono text-[13px]"
            type="text"
            autocomplete="off"
            spellcheck="false"
            placeholder="203.0.113.45 或 198.51.100.0/24"
            :disabled="submitting"
          />
          <p v-if="ipError" class="mt-2 text-[12px] text-warn">{{ ipError }}</p>
        </div>

        <div>
          <label class="mb-2 block text-[13px] font-medium text-fg-muted" for="blacklist-reason">备注原因</label>
          <input
            id="blacklist-reason"
            v-model="reason"
            class="field"
            type="text"
            autocomplete="off"
            maxlength="200"
            placeholder="例如：盗链抓取、异常高频请求"
            :disabled="submitting"
          />
        </div>

        <div class="sm:pt-[30px]">
          <button class="btn-primary w-full px-5 py-2.5 sm:w-auto" type="submit" :disabled="!canSubmit">
            <Loader2 v-if="submitting" class="size-4 animate-spin" />
            <Plus v-else class="size-4" />
            拉黑
          </button>
        </div>
      </div>
    </form>

    <div class="glass-card overflow-hidden">
      <div class="border-b border-white/6 px-5 py-4">
        <h3 class="text-sm font-semibold text-fg">黑名单列表</h3>
      </div>

      <div v-if="loading" class="flex items-center justify-center gap-3 py-14 text-sm text-fg-muted">
        <Loader2 class="size-4 animate-spin" />
        正在加载…
      </div>

      <div v-else-if="entries.length === 0" class="flex flex-col items-center gap-3 py-14 text-center">
        <span class="flex size-12 items-center justify-center rounded-2xl bg-white/4 text-fg-dim">
          <Ban class="size-5" />
        </span>
        <p class="text-sm text-fg-muted">黑名单为空</p>
        <p class="text-[12px] text-fg-dim">所有 IP 目前均可正常访问下载路径</p>
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full min-w-[620px] text-left text-sm">
          <thead>
            <tr class="border-b border-white/6 text-[12px] text-fg-dim">
              <th class="px-5 py-3 font-medium">IP 地址</th>
              <th class="px-4 py-3 font-medium">原因</th>
              <th class="px-4 py-3 font-medium">加入时间</th>
              <th class="px-5 py-3 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="entry in entries"
              :key="entry.ip"
              class="border-b border-white/4 transition hover:bg-white/3 last:border-0"
            >
              <td class="max-w-[240px] px-5 py-3.5">
                <span class="badge max-w-full border border-danger/25 bg-danger/10 font-mono text-danger">
                  <span class="min-w-0 truncate" :title="entry.ip">{{ entry.ip }}</span>
                </span>
              </td>
              <td class="px-4 py-3.5 text-fg-muted">{{ entry.reason || '—' }}</td>
              <td class="px-4 py-3.5 text-fg-muted">{{ formatTime(entry.addedAt) }}</td>
              <td class="px-5 py-3.5 text-right">
                <button
                  class="icon-btn hover:border-danger/30 hover:bg-danger/12 hover:text-danger"
                  type="button"
                  title="移出黑名单"
                  @click="askRemove(entry)"
                >
                  <Trash2 class="size-4" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <ConfirmDialog
      :open="Boolean(confirming)"
      :title="confirming?.title ?? ''"
      :message="confirming?.message ?? ''"
      :confirm-text="confirming?.confirmText ?? '确认'"
      :loading="confirmLoading"
      @cancel="confirming = null"
      @confirm="runConfirm"
    />
  </div>
</template>
