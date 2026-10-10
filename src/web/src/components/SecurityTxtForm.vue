<script setup>
import { computed, onMounted, ref } from 'vue';
import { Loader2, Save, ShieldAlert } from 'lucide-vue-next';
import api from '../api.js';
import { toast } from '../toast.js';

/** RFC 9116 要求 Expires 为未来的 ISO 8601 时间，默认给一年后 */
function defaultExpires() {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return date.toISOString().slice(0, 10);
}

const loading = ref(true);
const saving = ref(false);

const enabled = ref(false);
const contact = ref('');
const expires = ref(defaultExpires());
const encryption = ref('');
const policy = ref('');
const canonical = ref('');
const languages = ref('');
const acknowledgments = ref('');
const preview = ref(null);

const error = computed(() => {
  if (!enabled.value) return '';
  if (contact.value.trim() === '') return '启用时必须填写 Contact';
  if (!/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.value.trim()) && !/^https?:\/\/\S+$/.test(contact.value.trim())) {
    return 'Contact 需为 mailto:邮箱 或 http(s) 链接';
  }
  if (expires.value.trim() === '') return '启用时必须填写 Expires（RFC 9116 要求）';
  return '';
});

const previewText = computed(() => {
  if (!enabled.value) return '（已关闭，不会提供 /.well-known/security.txt）';
  if (error.value) return '（配置不完整，请先补全）';
  const lines = [
    ['Contact', contact.value],
    ['Expires', expires.value],
    ['Encryption', encryption.value],
    ['Acknowledgments', acknowledgments.value],
    ['Policy', policy.value],
    ['Canonical', canonical.value],
    ['Preferred-Languages', languages.value],
  ]
    .filter(([, value]) => String(value).trim() !== '')
    .map(([key, value]) => `${key}: ${String(value).trim()}`);
  return `${lines.join('\n')}\n`;
});

const canSave = computed(() => !error.value && !saving.value);

function fillDefaults() {
  if (canonical.value.trim() === '' && typeof window !== 'undefined') {
    canonical.value = `${window.location.origin}/.well-known/security.txt`;
  }
  if (languages.value.trim() === '') languages.value = 'zh-CN, en';
}

async function load() {
  loading.value = true;
  try {
    const data = await api.siteFiles();
    const config = data.securityTxt ?? {};
    enabled.value = config.enabled === true;
    contact.value = config.contact ?? '';
    expires.value = config.expires ?? defaultExpires();
    encryption.value = config.encryption ?? '';
    policy.value = config.policy ?? '';
    canonical.value = config.canonical ?? '';
    languages.value = config.languages ?? '';
    acknowledgments.value = config.acknowledgments ?? '';
    preview.value = data.previews?.securityTxt ?? null;
  } catch (error) {
    toast.error(error.message);
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!canSave.value) return;
  saving.value = true;
  try {
    const data = await api.saveSecurityTxt({
      enabled: enabled.value,
      contact: contact.value,
      expires: expires.value,
      encryption: encryption.value,
      policy: policy.value,
      canonical: canonical.value,
      languages: languages.value,
      acknowledgments: acknowledgments.value,
    });
    preview.value = data.preview;
    toast.success(
      enabled.value ? 'security.txt 已更新并立即生效' : 'security.txt 已关闭，该路径不再提供文件'
    );
  } catch (err) {
    toast.error(err.message);
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="glass-card p-5">
    <div class="flex items-start justify-between gap-4">
      <div class="flex items-start gap-3.5">
        <span class="flex size-11 items-center justify-center rounded-xl bg-danger/12 text-danger">
          <ShieldAlert class="size-5" />
        </span>
        <div>
          <h3 class="text-sm font-semibold text-fg">security.txt</h3>
          <p class="mt-1 text-[12px] text-fg-dim">
            按 RFC 9116 向安全研究者声明漏洞报告方式，对外地址为
            <span class="font-mono">/.well-known/security.txt</span>。
          </p>
        </div>
      </div>
      <label class="flex shrink-0 cursor-pointer items-center gap-2">
        <input v-model="enabled" type="checkbox" class="size-4 cursor-pointer accent-brand-500" @change="enabled && fillDefaults()" />
        <span class="text-[12px]" :class="enabled ? 'text-ok' : 'text-fg-dim'">
          {{ enabled ? '已启用' : '已关闭' }}
        </span>
      </label>
    </div>

    <div v-if="loading" class="flex items-center gap-2 py-6 text-[12px] text-fg-dim">
      <Loader2 class="size-3.5 animate-spin" />
      正在加载…
    </div>

    <template v-else>
      <div class="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label class="mb-2 block text-[13px] font-medium text-fg-muted" for="sec-contact">
            Contact <span class="text-danger">*</span>
          </label>
          <input
            id="sec-contact"
            v-model="contact"
            class="field font-mono text-[12.5px]"
            type="text"
            autocomplete="off"
            spellcheck="false"
            placeholder="mailto:security@example.com"
          />
        </div>

        <div>
          <label class="mb-2 block text-[13px] font-medium text-fg-muted" for="sec-expires">
            Expires <span class="text-danger">*</span>
          </label>
          <input id="sec-expires" v-model="expires" class="field" type="date" />
        </div>

        <div>
          <label class="mb-2 block text-[13px] font-medium text-fg-muted" for="sec-encryption">Encryption</label>
          <input
            id="sec-encryption"
            v-model="encryption"
            class="field font-mono text-[12.5px]"
            type="text"
            autocomplete="off"
            spellcheck="false"
            placeholder="https://example.com/pgp-key.txt"
          />
        </div>

        <div>
          <label class="mb-2 block text-[13px] font-medium text-fg-muted" for="sec-policy">Policy</label>
          <input
            id="sec-policy"
            v-model="policy"
            class="field font-mono text-[12.5px]"
            type="text"
            autocomplete="off"
            spellcheck="false"
            placeholder="https://example.com/security-policy"
          />
        </div>

        <div>
          <label class="mb-2 block text-[13px] font-medium text-fg-muted" for="sec-canonical">Canonical</label>
          <input
            id="sec-canonical"
            v-model="canonical"
            class="field font-mono text-[12.5px]"
            type="text"
            autocomplete="off"
            spellcheck="false"
            placeholder="https://example.com/.well-known/security.txt"
          />
        </div>

        <div>
          <label class="mb-2 block text-[13px] font-medium text-fg-muted" for="sec-languages">
            Preferred-Languages
          </label>
          <input
            id="sec-languages"
            v-model="languages"
            class="field font-mono text-[12.5px]"
            type="text"
            autocomplete="off"
            spellcheck="false"
            placeholder="zh-CN, en"
          />
        </div>

        <div class="sm:col-span-2">
          <label class="mb-2 block text-[13px] font-medium text-fg-muted" for="sec-ack">
            Acknowledgments
          </label>
          <input
            id="sec-ack"
            v-model="acknowledgments"
            class="field font-mono text-[12.5px]"
            type="text"
            autocomplete="off"
            spellcheck="false"
            placeholder="https://example.com/hall-of-fame"
          />
        </div>
      </div>

      <p v-if="error" class="mt-3 text-[12px] text-warn">{{ error }}</p>

      <div class="mt-4">
        <p class="mb-2 text-[12px] text-fg-dim">预览</p>
        <pre
          class="overflow-x-auto rounded-xl border border-line bg-ink-950/70 p-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-fg-muted"
          >{{ previewText }}</pre
        >
      </div>

      <div class="mt-4 flex items-center justify-between gap-3">
        <p class="text-[11px] text-fg-dim">未填写的字段不会出现在文件中</p>
        <button class="btn-primary min-w-[120px]" type="button" :disabled="!canSave" @click="save">
          <Loader2 v-if="saving" class="size-4 animate-spin" />
          <Save v-else class="size-4" />
          保存配置
        </button>
      </div>
    </template>
  </div>
</template>
