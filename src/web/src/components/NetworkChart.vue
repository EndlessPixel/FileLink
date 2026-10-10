<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { formatSize } from '../format.js';

const props = defineProps({
  points: { type: Array, default: () => [] },
  height: { type: Number, default: 260 },
  intervalMs: { type: Number, default: 5000 },
});

const wrapper = ref(null);
const width = ref(880);
let observer = null;

/** Y 轴刻度取整到 1/2/5 × 10ⁿ，并留出 12% 余量 */
const chartMax = computed(() => {
  const values = props.points.flatMap((point) => [point.rx, point.tx]);
  const raw = Math.max(...values, 1) * 1.12;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
});

const padTop = 14;
const padBottom = 26;
const usableHeight = computed(() => props.height - padTop - padBottom);
const baseY = computed(() => props.height - padBottom);

const gridLines = computed(() =>
  [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    ratio,
    y: padTop + usableHeight.value * (1 - ratio),
    label: formatSize(chartMax.value * ratio),
  }))
);

function pointAt(point, key, index, stepX) {
  const x = index * stepX;
  const ratio = Math.min(point[key] / chartMax.value, 1);
  return { x, y: padTop + usableHeight.value * (1 - ratio) };
}

function buildLine(key) {
  const list = props.points;
  if (list.length < 2) return '';
  const stepX = width.value / (list.length - 1);
  return list
    .map((point, index) => {
      const { x, y } = pointAt(point, key, index, stepX);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

function buildArea(key) {
  const line = buildLine(key);
  if (!line) return '';
  return `${line} L${width.value},${baseY.value} L0,${baseY.value} Z`;
}

const rxLine = computed(() => buildLine('rx'));
const txLine = computed(() => buildLine('tx'));
const rxArea = computed(() => buildArea('rx'));
const txArea = computed(() => buildArea('tx'));

const spanLabel = computed(() => {
  const seconds = Math.round((props.points.length * props.intervalMs) / 1000);
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} 分钟` : `${(minutes / 60).toFixed(1)} 小时`;
});

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
        <linearGradient id="rx-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#22d3ee" stop-opacity="0.32" />
          <stop offset="100%" stop-color="#22d3ee" stop-opacity="0" />
        </linearGradient>
        <linearGradient id="tx-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#818cf8" stop-opacity="0.28" />
          <stop offset="100%" stop-color="#818cf8" stop-opacity="0" />
        </linearGradient>
      </defs>

      <g>
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
      </g>

      <path v-if="rxArea" :d="rxArea" fill="url(#rx-fill)" />
      <path v-if="txArea" :d="txArea" fill="url(#tx-fill)" />

      <path
        v-if="rxLine"
        :d="rxLine"
        fill="none"
        stroke="#22d3ee"
        stroke-width="1.8"
        stroke-linejoin="round"
        stroke-linecap="round"
      />
      <path
        v-if="txLine"
        :d="txLine"
        fill="none"
        stroke="#818cf8"
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

    <!-- Y 轴刻度用 HTML 叠加，避免 SVG 缩放导致文字变形 -->
    <div class="pointer-events-none absolute inset-0">
      <span
        v-for="line in gridLines"
        :key="`y-${line.ratio}`"
        class="absolute left-0 -translate-y-1/2 rounded bg-ink-950/70 px-1 font-mono text-[10px] text-fg-dim"
        :style="{ top: `${line.y}px` }"
      >
        {{ line.label }}/s
      </span>
    </div>

    <div class="mt-2 flex items-center justify-between px-0.5 text-[11px] text-fg-dim">
      <span>最近 {{ spanLabel }}</span>
      <span class="flex items-center gap-3">
        <span class="flex items-center gap-1.5">
          <span class="size-2 rounded-full bg-accent-400"></span>下行（接收）
        </span>
        <span class="flex items-center gap-1.5">
          <span class="size-2 rounded-full bg-brand-400"></span>上行（发送）
        </span>
      </span>
    </div>

    <div
      v-if="points.length < 2"
      class="absolute inset-0 flex items-center justify-center text-[12px] text-fg-dim"
    >
      正在采集数据…
    </div>
  </div>
</template>
