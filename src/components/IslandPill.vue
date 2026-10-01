<script setup lang="ts">
/**
 * 灵动岛药丸(收起态)。
 * 纯展示:最紧张窗口的进度条 + 倒计时 + 告警配色/脉冲。
 * 交互只有两个信号:click(打开设置)、mouseenter(请求展开)。
 * 附带偶发光效:每 8~18s 随机播放一次边框流光/波纹/扫光,定时器在本组件。
 *
 * @author ZHANGCHAO 2026/10/01
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { UsageWindow } from '../types'
import { formatReset, resetUrgent } from '../composables/nowTick'

const props = defineProps<{
  win: UsageWindow | null
  /** 无数据时的占位文案(加载中/错误短文案/点此设置) */
  text: string
  hasError: boolean
  tooltip: string
}>()

const emit = defineEmits<{ click: []; mouseenter: [] }>()

// 告警等级决定药丸本身的配色(PRD §4.3):>=90 红色脉冲,>=75 琥珀
const alertClass = computed<string>(() => {
  if (props.win === null) return ''
  if (props.win.usedPercent >= 90) return 'island-red'
  if (props.win.usedPercent >= 75) return 'island-amber'
  return ''
})

// 进度条配色:>=90 红,>=75 琥珀,否则绿
const barClass = computed<string>(() => {
  if (props.win === null) return 'bar-green'
  if (props.win.usedPercent >= 90) return 'bar-red'
  if (props.win.usedPercent >= 75) return 'bar-amber'
  return 'bar-green'
})

const resetText = computed<string>(() => {
  if (props.win?.resetAt == null) return ''
  return formatReset(props.win.resetAt)
})

const resetHighlight = computed<boolean>(() => {
  if (props.win?.resetAt == null) return false
  return resetUrgent(props.win.resetAt)
})

// ===== 偶发随机光效 =====
// 动作池:边框流光 / 波纹 / 扫光;随机间隔 8~18s 触发一次,不连续重复同一个。
// 光效全部绘制在药丸内部(::before/::after + inset:0),窗口与药丸等大零余量,任何越界位移/缩放都会被裁掉。

const ACTIONS = ['flow', 'ripple', 'sweep'] as const
const actionName = ref<'' | (typeof ACTIONS)[number]>('')
let nextActionTimer = 0
let clearActionTimer = 0
let lastAction = ''

function playRandomAction(): void {
  let next = ACTIONS[Math.floor(Math.random() * ACTIONS.length)]
  while (next === lastAction) {
    next = ACTIONS[Math.floor(Math.random() * ACTIONS.length)]
  }
  lastAction = next
  actionName.value = next
  // 1500ms 大于最长动画时长(flow 1.4s),到点摘 class 复位
  clearActionTimer = window.setTimeout(() => {
    actionName.value = ''
  }, 1500)
}

function scheduleNextAction(delayMs: number): void {
  nextActionTimer = window.setTimeout(() => {
    playRandomAction()
    scheduleNextAction(8000 + Math.random() * 10000)
  }, delayMs)
}

onMounted(() => {
  // 系统开启「减少动态效果」时不启动触发器,偶发光效一并静默
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!reduceMotion) {
    scheduleNextAction(6000 + Math.random() * 6000)
  }
})

onBeforeUnmount(() => {
  window.clearTimeout(nextActionTimer)
  window.clearTimeout(clearActionTimer)
})
</script>

<template>
  <div
    :class="['island', alertClass, actionName !== '' ? 'do-' + actionName : '']"
    :title="tooltip"
    @click="emit('click')"
    @mouseenter="emit('mouseenter')"
  >
    <template v-if="win">
      <span class="label">{{ win.key === 'weekly' ? '7d' : '5h' }}</span>
      <div class="track">
        <div :class="['fill', barClass]" :style="{ width: Math.min(win.usedPercent, 100) + '%' }"></div>
      </div>
      <span class="percent">{{ Math.round(win.usedPercent) }}%</span>
      <span v-if="resetText" :class="['reset', resetHighlight ? 'reset-urgent' : '']">{{ resetText }}</span>
      <!-- 有数据但最近一次轮询失败:保留旧数据,角标提示 -->
      <span v-if="hasError" class="warn-dot">!</span>
    </template>
    <span v-else class="empty">{{ text || '--' }}</span>
  </div>
</template>

<style scoped>
.island {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  /* 100vh 而非 100%:根组件父级是 body(无高度),百分比会退化成内容高度,
     药丸会缩成一行字高;窗口高度就是药丸高度,用视口高度撑满 */
  height: 100vh;
  padding: 0 14px;
  box-sizing: border-box;
  border-radius: 9999px;
  background: var(--bg-surface);
  border: 1px solid var(--pill-border);
  color: var(--text-primary);
  font-family: 'Segoe UI', system-ui, sans-serif;
  font-size: 12px;
  user-select: none;
  cursor: pointer;
  transition: background 0.3s ease, border-color 0.3s ease;
}

/* 告警态:深色调底色两套主题通用,文字强制浅色保证对比度;
   背景同样跟随 --bg-alpha,与普通态透明度一致 */
.island-amber {
  background: rgb(69 45 11 / var(--bg-alpha));
  border-color: rgba(245, 158, 11, 0.45);
  color: #e4e4e7;
}

.island-red {
  background: rgb(69 15 15 / var(--bg-alpha));
  border-color: rgba(239, 68, 68, 0.55);
  color: #e4e4e7;
  animation: island-pulse 2s ease-in-out infinite;
}

.island-amber .label,
.island-red .label {
  color: rgba(228, 228, 231, 0.75);
}

/* >=90% 红色脉冲:呼吸式外发光 */
@keyframes island-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.45);
  }
  50% {
    box-shadow: 0 0 14px 3px rgba(239, 68, 68, 0.25);
  }
}

/* ===== 偶发随机光效(JS 每 8~18s 挂一次 do-* class,播放完摘除)=====
   两个伪元素常驻透明:flow 用 ::before(边框环),ripple/sweep 共用 ::after */

.island::before,
.island::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  opacity: 0;
}

/* 边框流动发光:一段高光沿圆角边缘扫一圈。
   mask 挖掉 content-box,只留 1.5px 的边框环;--flow-angle 由 @property 注册后可参与动画 */
.island::before {
  padding: 1.5px;
  background: conic-gradient(
    from var(--flow-angle),
    transparent 0deg 240deg,
    var(--island-sheen-strong) 305deg,
    transparent 360deg
  );
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#fff 0 0) content-box exclude, linear-gradient(#fff 0 0);
}

.island.do-flow::before {
  opacity: 1;
  animation: island-flow 1.4s linear;
}

@property --flow-angle {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}

@keyframes island-flow {
  to {
    --flow-angle: 360deg;
  }
}

/* 波纹:从左端圆头扩散一层柔光后消散(background-size 在盒内缩放,不越界) */
.island.do-ripple::after {
  background: radial-gradient(circle at 12% 50%, var(--island-sheen) 0%, transparent 55%);
  background-repeat: no-repeat;
  background-size: 0% 100%;
  animation: island-ripple 1.1s ease-out;
}

@keyframes island-ripple {
  0% {
    background-size: 0% 100%;
    opacity: 0.9;
  }
  100% {
    background-size: 300% 100%;
    opacity: 0;
  }
}

/* 扫光:一道斜向高光从右向左横扫 */
.island.do-sweep::after {
  background: linear-gradient(105deg, transparent 40%, var(--island-sheen) 50%, transparent 60%);
  background-repeat: no-repeat;
  background-size: 260% 100%;
  animation: island-sweep 1s ease-in-out;
}

@keyframes island-sweep {
  0% {
    background-position: 120% 0;
    opacity: 1;
  }
  100% {
    background-position: -60% 0;
    opacity: 1;
  }
}

/* 尊重系统「减少动态效果」:只保留静态呈现 */
@media (prefers-reduced-motion: reduce) {
  .island::before,
  .island::after {
    animation: none;
    opacity: 0;
  }
}

.label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}

.track {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: var(--track-bg);
  overflow: hidden;
}

.fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;
}

.bar-green {
  background: #22c55e;
}

.bar-amber {
  background: #f59e0b;
}

.bar-red {
  background: #ef4444;
}

.percent {
  min-width: 34px;
  text-align: right;
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.reset {
  font-size: 10px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.reset-urgent {
  color: #f59e0b;
  font-weight: 700;
}

.warn-dot {
  font-size: 10px;
  font-weight: 700;
  color: #f59e0b;
}

.empty {
  color: var(--text-secondary);
}
</style>
