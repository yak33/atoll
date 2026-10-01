<script setup lang="ts">
/**
 * 灵动岛展开面板(悬停态)。
 * 展示全部窗口(5h + 7d)、套餐、最后更新时间、错误详情,提供刷新/设置入口。
 * 悬停在本面板内则保持展开,离开由父组件延时收回。
 *
 * @author ZHANGCHAO 2026/10/01
 */
import type { QuotaError } from '../types'
import { formatReset, resetUrgent } from '../composables/nowTick'

defineProps<{
  windows: { key: '5h' | 'weekly'; usedPercent: number; resetAt: string | null }[]
  planLevel: string
  source: 'tokens_limit' | 'credit_limit'
  fetchedAgo: string
  error: QuotaError | null
  refreshing: boolean
  /** 当前模块:用量面板恒收 'usage',用于 Tab 高亮 */
  activeModule: 'usage' | 'pomodoro'
}>()

const emit = defineEmits<{
  refresh: []
  settings: []
  mouseenter: []
  mouseleave: []
  dragstart: []
  switchModule: [module: 'usage' | 'pomodoro']
}>()

// ===== 整面板拖动移动窗口:位移超过阈值才算拖动;按钮上按下不参与 =====
const DRAG_THRESHOLD_PX = 4
let armed = false
let downX = 0
let downY = 0

function onPanelMouseDown(event: MouseEvent): void {
  if (event.button !== 0) return
  // 刷新/设置按钮自身的按下留给点击,不进入拖动判定
  if ((event.target as HTMLElement).closest('button') !== null) return
  armed = true
  downX = event.clientX
  downY = event.clientY
}

function onPanelMouseMove(event: MouseEvent): void {
  if (!armed) return
  const moved = Math.abs(event.clientX - downX) + Math.abs(event.clientY - downY)
  if (moved > DRAG_THRESHOLD_PX) {
    armed = false
    emit('dragstart')
  }
}

function onPanelMouseUp(): void {
  armed = false
}

function barClass(percent: number): string {
  if (percent >= 90) return 'bar-red'
  if (percent >= 75) return 'bar-amber'
  return 'bar-green'
}

function labelOf(key: '5h' | 'weekly'): string {
  return key === 'weekly' ? '7d' : '5h'
}

function resetTextOf(iso: string | null): string {
  if (iso === null) return ''
  return formatReset(iso)
}

function urgentOf(iso: string | null): boolean {
  if (iso === null) return false
  return resetUrgent(iso)
}
</script>

<template>
  <div
    class="panel"
    @mouseenter="emit('mouseenter')"
    @mouseleave="emit('mouseleave')"
    @mousedown="onPanelMouseDown"
    @mousemove="onPanelMouseMove"
    @mouseup="onPanelMouseUp"
  >
    <div class="module-tabs">
      <button :class="['tab-btn', activeModule === 'usage' ? 'tab-btn-active' : '']" type="button" @click="emit('switchModule', 'usage')">用量</button>
      <button :class="['tab-btn', activeModule === 'pomodoro' ? 'tab-btn-active' : '']" type="button" @click="emit('switchModule', 'pomodoro')">番茄</button>
    </div>

    <div class="panel-header" title="按住任意位置拖动">
      <span class="plan">{{ planLevel || '未知套餐' }}</span>
      <span v-if="source === 'credit_limit'" class="credit-badge" title="该套餐仅上报信用额度,与 token 窗口度量不同">信用额度</span>
    </div>

    <div v-if="windows.length === 0" class="no-data">暂无窗口数据</div>

    <div v-for="win in windows" :key="win.key" class="win-row">
      <span class="win-label">{{ labelOf(win.key) }}</span>
      <div class="win-track">
        <div :class="['win-fill', barClass(win.usedPercent)]" :style="{ width: Math.min(win.usedPercent, 100) + '%' }"></div>
      </div>
      <span class="win-percent">{{ Math.round(win.usedPercent) }}%</span>
      <span :class="['win-reset', urgentOf(win.resetAt) ? 'win-reset-urgent' : '']">{{ resetTextOf(win.resetAt) || '-' }}</span>
    </div>

    <div v-if="error" class="error-line" :title="error.message">{{ error.message }}</div>

    <div class="panel-footer">
      <span class="fetched">更新于 {{ fetchedAgo || '--' }}</span>
      <div class="footer-actions">
        <button class="action-btn" type="button" :disabled="refreshing" @click="emit('refresh')">
          {{ refreshing ? '刷新中…' : '刷新' }}
        </button>
        <button class="action-btn" type="button" @click="emit('settings')">设置</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-sizing: border-box;
  /* 高度由内容决定:内容恒小于窗口高度,不会被窗口裁切;
     窗口多出的部分是透明区不可见。若改为 100vh 会在内容与底栏之间
     露出一段面板背景空白 */
  height: auto;
  padding: 14px 16px 12px;
  border-radius: 16px;
  background: var(--bg-panel);
  border: 1px solid var(--pill-border);
  color: var(--text-primary);
  font-family: 'Segoe UI', system-ui, sans-serif;
  font-size: 12px;
  user-select: none;
  cursor: grab;
  animation: panel-in 0.2s ease;
}

.panel:active {
  cursor: grabbing;
}

@keyframes panel-in {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.plan {
  font-size: 12px;
  font-weight: 600;
}

.credit-badge {
  font-size: 10px;
  color: #fbbf24;
  border: 1px solid rgba(251, 191, 36, 0.4);
  border-radius: 6px;
  padding: 1px 6px;
}

.no-data {
  color: var(--text-muted);
  text-align: center;
  padding: 16px 0;
}

.win-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.win-label {
  width: 24px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}

.win-track {
  flex: 1;
  height: 8px;
  border-radius: 4px;
  background: var(--track-bg);
  overflow: hidden;
}

.win-fill {
  height: 100%;
  border-radius: 4px;
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

.win-percent {
  min-width: 40px;
  text-align: right;
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.win-reset {
  min-width: 52px;
  text-align: right;
  font-size: 10px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.win-reset-urgent {
  color: #f59e0b;
  font-weight: 700;
}

/* 模块 Tab:用量 | 番茄,当前项绿色高亮 */
.module-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: -2px;
}

.tab-btn {
  height: 20px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
}

.tab-btn:hover {
  color: var(--text-secondary);
}

.tab-btn-active {
  background: rgba(34, 197, 94, 0.16);
  border-color: rgba(34, 197, 94, 0.4);
  color: #4ade80;
}

.error-line {
  font-size: 11px;
  color: #fbbf24;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel-footer {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid var(--divider);
  padding-top: 8px;
}

.fetched {
  font-size: 10px;
  color: var(--text-muted);
}

.footer-actions {
  display: flex;
  gap: 6px;
}

.action-btn {
  height: 24px;
  padding: 0 12px;
  border: none;
  border-radius: 6px;
  background: var(--btn-bg);
  color: var(--text-primary);
  font-size: 11px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
}

.action-btn:hover {
  background: var(--border-soft);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
