<script setup lang="ts">
/**
 * 用量监控药丸(收起态)。
 * 纯展示:最紧张窗口的进度条 + 倒计时 + 告警配色/脉冲。
 * 交互信号:click(打开设置)、mouseenter(请求展开)、wheel(容器切模块)。
 * 药丸基座样式与偶发光效在 App.vue 全局(.island),本组件只有用量特有部分。
 *
 * @author ZHANGCHAO 2026/10/01
 */
import { computed } from 'vue'
import type { UsageWindow } from '../types'
import type { GlowEffect } from '../core/appSettings'
import { useGlowEffects } from '../composables/useGlowEffects'
import { formatReset, resetUrgent } from '../composables/nowTick'

const props = defineProps<{
  win: UsageWindow | null
  /** 无数据时的占位文案(加载中/错误短文案/点此设置) */
  text: string
  hasError: boolean
  tooltip: string
  /** 告警阈值(百分点,设置面板可配):>=criticalAt 红色脉冲,>=warnAt 琥珀 */
  warnAt: number
  criticalAt: number
  /** Agent 活跃指示:working/waiting/error 在药丸右端显示状态点,null 不显示 */
  agentState: 'working' | 'waiting' | 'error' | null
  /** 偶发光效种类(设置面板可配);空数组 = 不播放 */
  glowEffects: GlowEffect[]
}>()

const emit = defineEmits<{ click: []; mouseenter: []; mouseleave: []; wheel: [event?: WheelEvent] }>()

const { actionName } = useGlowEffects(() => props.glowEffects)

// 告警等级决定药丸本身的配色:阈值由设置传入(默认 75/90)
const alertClass = computed<string>(() => {
  if (props.win === null) return ''
  if (props.win.usedPercent >= props.criticalAt) return 'island-red'
  if (props.win.usedPercent >= props.warnAt) return 'island-amber'
  return ''
})

// 进度条配色跟随同一组阈值
const barClass = computed<string>(() => {
  if (props.win === null) return 'bar-green'
  if (props.win.usedPercent >= props.criticalAt) return 'bar-red'
  if (props.win.usedPercent >= props.warnAt) return 'bar-amber'
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
</script>

<template>
  <div
    :class="['island', alertClass, actionName !== '' ? 'do-' + actionName : '']"
    :title="tooltip"
    @click="emit('click')"
    @mouseenter="emit('mouseenter')"
    @mouseleave="emit('mouseleave')"
    @wheel.prevent="emit('wheel', $event)"
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
    <!-- Agent 状态点:无活跃 Agent 时不渲染,用量内容不受影响 -->
    <span v-if="agentState" :class="['agent-dot', `agent-dot-${agentState}`]"></span>
  </div>
</template>

<style scoped>
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

/* >=90% 红色脉冲:呼吸式内发光,避免外发光被透明窗口边缘硬裁切 */
@keyframes island-pulse {
  0%,
  100% {
    box-shadow:
      inset 0 1px 0.5px rgba(255, 255, 255, 0.25),
      inset 0 0 10px rgba(239, 68, 68, 0.35);
  }
  50% {
    box-shadow:
      inset 0 1px 0.5px rgba(255, 255, 255, 0.45),
      inset 0 0 18px 2px rgba(239, 68, 68, 0.75);
  }
}

.label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}

.track {
  position: relative;
  flex: 1;
  height: 6px;
  border-radius: 9999px;
  background: var(--track-bg);
  box-shadow: inset 0 1px 1.5px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.fill {
  position: relative;
  height: 100%;
  border-radius: 9999px;
  transition: width 0.4s var(--ease-spring-soft, cubic-bezier(0.16, 1, 0.3, 1));
}

/* 进度条端点发光游标(Glow Thumb):在进度条右侧加入微小高光线和光晕 */
.fill::after {
  content: '';
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 2.5px;
  border-radius: 9999px;
  background: #ffffff;
  box-shadow: 0 0 4px 1px currentColor;
  opacity: 0.9;
}

.bar-green {
  background: var(--accent-gradient, linear-gradient(90deg, #15803d, #22c55e));
  color: var(--accent-color, #4ade80);
}

.bar-amber {
  background: linear-gradient(90deg, #b45309, #f59e0b);
  color: #fbbf24;
}

.bar-red {
  background: linear-gradient(90deg, #b91c1c, #ef4444);
  color: #f87171;
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

/* ===== Agent 状态指示点(药丸右端) =====
   working 青蓝呼吸 / waiting 琥珀跳动 / error 红色常亮;
   动效克制,不与用量告警配色抢注意力 */
.agent-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-left: 2px;
}

.agent-dot-working {
  position: relative;
  background: #38bdf8;
  /* 登场先弹跳一次(元素出现时播放),随后进入声呐呼吸循环 */
  animation:
    agent-dot-pop 0.35s var(--ease-spring, cubic-bezier(0.34, 1.4, 0.64, 1)),
    agent-dot-breathe 2.4s ease-in-out 0.35s infinite;
}

/* 声呐涟漪:光点外一圈持续扩散的青蓝环,执行中的存在感主要来自它 */
.agent-dot-working::after {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: 50%;
  border: 1px solid rgba(56, 189, 248, 0.8);
  animation: agent-dot-ping 2.4s ease-out infinite;
}

.agent-dot-waiting {
  background: #f59e0b;
  animation: agent-dot-hop 1.1s ease-in-out infinite;
}

.agent-dot-error {
  background: #ef4444;
  box-shadow: 0 0 4px rgba(239, 68, 68, 0.6);
}

@keyframes agent-dot-breathe {
  0%,
  100% {
    opacity: 0.45;
    box-shadow: 0 0 2px rgba(56, 189, 248, 0.4);
  }
  50% {
    opacity: 1;
    box-shadow: 0 0 5px rgba(56, 189, 248, 0.9);
  }
}

@keyframes agent-dot-ping {
  0% {
    transform: scale(1);
    opacity: 0.8;
  }
  70%,
  100% {
    transform: scale(2.6);
    opacity: 0;
  }
}

@keyframes agent-dot-pop {
  0% {
    transform: scale(0);
  }
  60% {
    transform: scale(1.6);
  }
  100% {
    transform: scale(1);
  }
}

@keyframes agent-dot-hop {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.6;
  }
  50% {
    transform: scale(1.5);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .agent-dot-working,
  .agent-dot-waiting {
    animation: none;
  }
  /* 减少动态效果时涟漪环直接隐藏,避免静止的圆环挂在药丸上 */
  .agent-dot-working::after {
    display: none;
  }
}

.empty {
  color: var(--text-secondary);
}
</style>
