<script setup lang="ts">
/**
 * 灵动岛药丸(收起态)。
 * 纯展示:最紧张窗口的进度条 + 倒计时 + 告警配色/脉冲。
 * 交互只有两个信号:click(打开设置)、mouseenter(请求展开)。
 *
 * @author ZHANGCHAO 2026/10/01
 */
import { computed } from 'vue'
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
</script>

<template>
  <div :class="['island', alertClass]" :title="tooltip" @click="emit('click')" @mouseenter="emit('mouseenter')">
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
  display: flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 14px;
  box-sizing: border-box;
  border-radius: 22px;
  background: var(--bg-surface);
  border: 1px solid var(--pill-border);
  color: var(--text-primary);
  font-family: 'Segoe UI', system-ui, sans-serif;
  font-size: 12px;
  user-select: none;
  cursor: pointer;
  transition: background 0.3s ease, border-color 0.3s ease;
}

/* 告警态:深色调底色两套主题通用,文字强制浅色保证对比度 */
.island-amber {
  background: rgba(69, 45, 11, 0.92);
  border-color: rgba(245, 158, 11, 0.45);
  color: #e4e4e7;
}

.island-red {
  background: rgba(69, 15, 15, 0.92);
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
