<script setup>
import { computed, onMounted, ref } from 'vue';
import { Bot, Loader2, Save } from 'lucide-vue-next';
import api from '../api.js';
import { toast } from '../toast.js';

const MODES = [
  { value: 'disallow-all', label: '禁止全站抓取', hint: 'User-agent: *  /  Disallow: /', recommended: true },
  { value: 'allow-all', label: '允许全站抓取', hint: 'User-agent: *  /  Allow: /' },
  { value: 'disallow-download', label: '仅禁止下载目录', hint: 'User-agent: *  /  Disallow: /d/' },
  { value: 'custom', label: '自定义规则', hint: '自行编写 robots.txt 内容' },
];

const loading = ref(true);
const saving = ref(false);
const enabled = ref(true);
const mode = ref('disallow-all');
const custom = ref('');
const preview = ref(null);

const error = computed(() =>
  mode.value === 'custom' && custom.value.trim() === '' ? '选择「自定义」时必须填写规则内容' : ''
);

const PRESET_TEXT = {
  'allow-all': 'User-agent: *\nAllow: /\n',
  'disallow-all': 'User-agent: *\nDisallow: /\n',
  'disallow-download': 'User-agent: *\nDisallow: /d/\n',
};

const previewText = computed(() => {
  if (!enabled.value) return '（已关闭，不会提供 /robots.txt）';
  if (error.value) return '（规则不完整，请先补全）';
  if (mode.value === 'custom') return `${custom.value.trim()}\n`;
  return PRESET_TEXT[mode.value] ?? PRESET_TEXT['disallow-all'];
});

const canSave = computed(() => !error.value && !saving.value);

async function load() {
  loading.value = true;
  try {
    const data = await api.siteFiles();
    enabled.value = data.robots?.enabled !== false;
    mode.value = data.robots?.mode ?? 'disallow-all';
    custom.value = data.robots?.custom ?? '';
    preview.value = data.previews?.robots ?? null;
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
    const data = await api.saveRobots({ enabled: enabled.value, mode: mode.value, custom: custom.value });
    preview.value = data.preview;
    toast.success(enabled.value ? 'robots.txt 已更新并立即生效' : 'robots.txt 已关闭，该路径不再提供文件');
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
        <span class="flex size-11 items-center justify-center rounded-xl bg-warn/12 text-warn">
          <Bot class="size-5" />
        </span>
        <div>
          <h3 class="text-sm font-semibold text-fg">robots.txt</h3>
          <p class="mt-1 text-[12px] text-fg-dim">
            控制搜索引擎与爬虫对本站的抓取范围，内容对外公开可访问。
          </p>
        </div>
      </div>
      <label class="flex shrink-0 cursor-pointer items-center gap-2">
        <input v-model="enabled" type="checkbox" class="size-4 cursor-pointer accent-brand-500" />
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
      <div class="mt-5 grid gap-2 sm:grid-cols-2">
        <label
          v-for="item in MODES"
          :key="item.value"
          class="flex cursor-pointer items-start gap-2.5 rounded-xl border px-3.5 py-2.5 transition"
          :class="
            mode === item.value
              ? 'border-brand-500/45 bg-brand-500/10'
              : 'border-line bg-white/2 hover:border-white/15 hover:bg-white/5'
          "
        >
          <input v-model="mode" type="radio" :value="item.value" class="mt-0.5 cursor-pointer accent-brand-500" />
          <span class="min-w-0">
            <span class="flex items-center gap-2 text-[13px] font-medium text-fg">
              {{ item.label }}
              <span v-if="item.recommended" class="badge border border-ok/30 bg-ok/10 text-ok">推荐</span>
            </span>
            <span class="mt-0.5 block truncate font-mono text-[11px] text-fg-dim">{{ item.hint }}</span>
          </span>
        </label>
      </div>

      <div v-if="mode === 'custom'" class="mt-4">
        <label class="mb-2 block text-[13px] font-medium text-fg-muted" for="robots-custom">自定义规则</label>
        <textarea
          id="robots-custom"
          v-model="custom"
          class="field min-h-[110px] resize-y font-mono text-[12px] leading-relaxed"
          spellcheck="false"
          placeholder="User-agent: *&#10;Disallow: /private/&#10;Sitemap: https://example.com/sitemap.xml"
        ></textarea>
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
        <p class="text-[11px] text-fg-dim">
          对外地址 <span class="font-mono text-fg-muted">/robots.txt</span>
        </p>
        <button class="btn-primary min-w-[120px]" type="button" :disabled="!canSave" @click="save">
          <Loader2 v-if="saving" class="size-4 animate-spin" />
          <Save v-else class="size-4" />
          保存配置
        </button>
      </div>
    </template>
  </div>
</template>
