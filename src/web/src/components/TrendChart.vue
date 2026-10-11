<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { formatSize } from '../format.js';

const props = defineProps({
  points: { type: Array, default: () => [] },
  height: { type: Number, default: 240 },
});

const wrapper = ref(null);
const width = ref(880);
let observer = null;

const padTop = 14;
const padBottom = 26;
const usableHeight = computed(() => props.height - padTop - padBottom);
const baseY = computed(() => props.height - padBottom);

/** Y 轴上限取整到 1/2/5 × 10ⁿ，留 15% 余量 */
const chartMax = computed(() => {
  const values = props.points.map((point) => Math.max(point.requests, point.downloads));
  const raw = Math.max(...values, 1) * 1.15;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
});

const gridLines = computed(() =>
  [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    ratio,
    y: padTop + usableHeight.value * (1 - ratio),
    label: String(Math.round(chartMax.value * ratio)),
  }))
);

const slotWidth = computed(() => (props.points.length > 0 ? width.value / props.points.length : width.value));
const barWidth = computed(() => Math.max(slotWidth.value * 0.48, 2));

const bars = computed(() =>
  props.points.map((point, index) => {
    const x = index * slotWidth.value + (slotWidth.value - barWidth.value) / 2;
    const ratio = Math.min(point.requests / chartMax.value, 1);
    const barHeight = Math.max(usableHeight.value * ratio, point.requests > 0 ? 1.5 : 0);
    return {
      key: point.day,
      x,
      y: baseY.value - barHeight,
      width: barWidth.value,
      height: barHeight,
      day: point.day,
      requests: point.requests,
      downloads: point.downloads,
      bytes: point.bytes,
    };
  })
);

const downloadLine = computed(() => {
  const list = props.points;
  if (list.length < 2) return '';
  return list
    .map((point, index) => {
      const x = index * slotWidth.value + slotWidth.value / 2;
      const ratio = Math.min(point.downloads / chartMax.value, 1);
      const y = padTop + usableHeight.value * (1 - ratio);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
});

const axisLabels = computed(() => {
  const list = props.points;
  if (list.length === 0) return [];
  const maxLabels = Math.min(list.length, 7);
  const stepIndex = Math.max(Math.floor((list.length - 1) / Math.max(maxLabels - 1, 1)), 1);
  const result = [];
  for (let i = 0; i < list.length; i += stepIndex) {
    result.push({ key: list[i].day, index: i, label: list[i].day.slice(5), x: i * slotWidth.value + slotWidth.value / 2 });
  }
  return result;
});

const hover = ref(null);

function showTip(bar) {
  hover.value = bar;
}

function hideTip() {
  hover.value = null;
}

onMounted(() => {
  const element = wrapper.value;
  if (!element || typeof ResizeObserver === 'undefined') return;
  observer = new ResizeObserver((entries) => {
    const next = Math.round(entries[0]?.contentRect.width ?? 0);
    if (next > 0) width.value = next;
  });
  observer.observe(element);
});

onBeforeUnmount(() => {
  if (observer) observer.disconnect();
});
</script>

<template>
  <div ref="wrapper" class="relative w-full">
    <svg :viewBox="`0 0 ${width} ${height}`" :height="height" class="w-full" role="img">
      <defs>
        <linearGradient id="trend-bar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#818cf8" stop-opacity="0.85" />
          <stop offset="100%" stop-color="#818cf8" stop-opacity="0.18" />
        </linearGradient>
      </defs>

      <line
        v-for="line in gridLines"
        :key="`grid-${line.ratio}`"
        x1="0"
        :y1="line.y"
        :x2="width"
        :y2="line.y"
        stroke="rgba(255,255,255,0.06)"
        stroke-width="1"
      />

      <rect
        v-for="bar in bars"
        :key="bar.key"
        :x="bar.x"
        :y="bar.y"
        :width="bar.width"
        :height="bar.height"
        rx="2"
        fill="url(#trend-bar)"
        @mouseenter="showTip(bar)"
        @mouseleave="hideTip"
      />

      <path
        v-if="downloadLine"
        :d="downloadLine"
        fill="none"
        stroke="#22d3ee"
        stroke-width="1.8"
        stroke-linejoin="round"
        stroke-linecap="round"
      />

      <line
        x1="0"
        :y1="baseY"
        :x2="width"
        :y2="baseY"
        stroke="rgba(255,255,255,0.12)"
        stroke-width="1"
      />
    </svg>

    <!-- Y 轴刻度与 X 轴日期用 HTML 叠加，避免 SVG 缩放导致文字变形 -->
    <div class="pointer-events-none absolute inset-0">
      <span
        v-for="line in gridLines"
        :key="`y-${line.ratio}`"
        class="absolute left-0 -translate-y-1/2 rounded bg-ink-950/70 px-1 font-mono text-[10px] text-fg-dim"
        :style="{ top: `${line.y}px` }"
      >
        {{ line.label }}
      </span>
      <span
        v-for="item in axisLabels"
        :key="`x-${item.key}`"
        class="absolute -translate-x-1/2 font-mono text-[10px] text-fg-dim"
        :style="{ left: `${item.x}px`, top: `${baseY + 6}px` }"
      >
        {{ item.label }}
      </span>
    </div>

    <div
      v-if="hover"
      class="pointer-events-none absolute top-0 right-0 rounded-lg border border-line bg-ink-950/95 px-3 py-2 text-[11px] text-fg-muted shadow-lg"
    >
      <p class="font-mono text-fg">{{ hover.day }}</p>
      <p class="mt-1">请求 {{ hover.requests }} 次 · 下载 {{ hover.downloads }} 次</p>
      <p>流量 {{ formatSize(hover.bytes) }}</p>
    </div>

    <div class="mt-1 flex items-center justify-end gap-3 text-[11px] text-fg-dim">
      <span class="flex items-center gap-1.5">
        <span class="size-2 rounded-sm bg-brand-400"></span>请求数
      </span>
      <span class="flex items-center gap-1.5">
        <span class="size-2 rounded-full bg-accent-400"></span>完成下载
      </span>
    </div>

    <div
      v-if="points.length === 0"
      class="absolute inset-0 flex items-center justify-center text-[12px] text-fg-dim"
    >
      暂无趋势数据
    </div>
  </div>
</template>
