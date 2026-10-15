<script setup lang="ts">
/**
 * 灵动岛展开面板(悬停态)。
 * 展示全部窗口(5h + 7d)、套餐、最后更新时间、错误详情,提供刷新/设置入口;
 * 顶部有条件渲染的 Agent 活跃区(智能体模块合并进用量后的展示位)。
 * 悬停在本面板内则保持展开,离开由父组件延时收回。
 *
 * @author ZHANGCHAO 2026/10/01
 */
import { computed } from 'vue'
import type { QuotaError } from '../types'
import { formatReset, resetUrgent, nowTick } from '../composables/nowTick'
import { sparklinePoints, type UsageHistoryPoint } from '../core/usageHistory'
import { stateIcon, stateLabel, type AgentItem } from '../core/agentHub'
import ModuleTabs from './ModuleTabs.vue'
import type { IslandModule } from '../core/appSettings'

const props = defineProps<{
  windows: { key: '5h' | 'weekly'; usedPercent: number; resetAt: string | null }[]
  planLevel: string
  source: 'tokens_limit' | 'credit_limit'
  fetchedAgo: string
  error: QuotaError | null
  refreshing: boolean
  /** 当前模块:用量面板恒收 'usage',用于 Tab 高亮 */
  activeModule: IslandModule
  /** 告警阈值(百分点,设置面板可配) */
  warnAt: number
  criticalAt: number
  /** 5h 窗口消耗速率预测文案;空串 = 样本不足/不可信,不渲染 */
  burnEstimate: string
  /** 24h 用量历史,双线趋势图;空数组不渲染 */
  history: UsageHistoryPoint[]
  /** 活跃 Agent 列表(已按优先级排序,空数组不渲染该区) */
  agents: AgentItem[]
}>()

const emit = defineEmits<{
  refresh: []
  settings: []
  mouseenter: []
  mouseleave: []
  dragstart: []
  switchModule: [module: IslandModule]
  removeAgent: [id: string]
  clearAgents: []
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

// 趋势图坐标:x 轴按 60s 应用时钟对齐(与倒计时同源),避免每次渲染都跳
const TREND_W = 360
const TREND_H = 44
const points5h = computed(() => sparklinePoints(props.history, '5h', nowTick.value, TREND_W, TREND_H))
const points7d = computed(() => sparklinePoints(props.history, '7d', nowTick.value, TREND_W, TREND_H))

function barClass(percent: number): string {
  if (percent >= props.criticalAt) return 'bar-red'
  if (percent >= props.warnAt) return 'bar-amber'
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

// Agent 行的相对时间:渲染时计算,列表更新或清扫时随之刷新
function agentTimeAgo(timestamp: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (diffSec < 5) return '刚刚'
  if (diffSec < 60) return `${diffSec}秒前`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}分钟前`
  return `${Math.floor(diffMin / 60)}小时前`
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
    <div class="tabs-row">
      <ModuleTabs :current="activeModule" @switch-module="(m) => emit('switchModule', m)" />
      <button class="gear-btn" type="button" title="设置" @click="emit('settings')">⚙</button>
    </div>

    <!-- Agent 活跃区:合并进用量模块的展示位;列表已按优先级排序,waiting 排最前 -->
    <div v-if="agents.length > 0" class="agent-strip">
      <div class="agent-strip-head">
        <span class="agent-strip-title">Agent</span>
        <button class="agent-strip-clear" type="button" title="清空全部 Agent 状态" @click="emit('clearAgents')">清空</button>
      </div>
      <!-- 多于可视行时内部滚动;data-scrollable 让滚轮滚动列表而不是切模块 -->
      <div class="agent-strip-list" data-scrollable>
        <div v-for="item in agents" :key="item.id" class="agent-row">
          <span class="agent-row-icon">{{ stateIcon(item.state) }}</span>
          <span class="agent-row-name" :title="item.task || item.name">{{ item.name }}</span>
          <span :class="['agent-row-state', `agent-state-${item.state}`]">{{ stateLabel(item.state) }}</span>
          <span class="agent-row-time">{{ agentTimeAgo(item.updatedAt) }}</span>
          <button class="agent-row-close" type="button" title="移除此项" @click.stop="emit('removeAgent', item.id)">✕</button>
        </div>
      </div>
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

    <!-- 24h 趋势:5h 强调线 + 7d 弱化线;重置断点保留(物理事实,不人工平滑) -->
    <div v-if="history.length > 0" class="trend-block" title="近 24 小时用量走势(左端 = 24 小时前)">
      <div class="trend-head">
        <span class="trend-label">24h 趋势</span>
        <span class="trend-legend"><i class="dot dot-5h"></i>5h<i class="dot dot-7d"></i>7d</span>
      </div>
      <svg class="trend-svg" :viewBox="`0 0 ${TREND_W} ${TREND_H}`" preserveAspectRatio="none">
        <polyline class="line-7d" :points="points7d" />
        <polyline class="line-5h" :points="points5h" />
      </svg>
    </div>

    <div v-if="burnEstimate !== ''" class="burn-line" title="基于最近两次轮询的粗略估算">{{ burnEstimate }}</div>

    <div v-if="error" class="error-line" :title="error.message">{{ error.message }}</div>

    <div class="panel-footer">
      <span class="fetched">更新于 {{ fetchedAgo || '--' }}</span>
      <div class="footer-actions">
        <button class="action-btn" type="button" :disabled="refreshing" @click="emit('refresh')">
          {{ refreshing ? '刷新中…' : '刷新' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ===== Agent 活跃区(条件渲染):无活跃 Agent 时不占任何空间 ===== */
.agent-strip {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px;
  border: 1px solid var(--pill-border);
  border-radius: 8px;
  background: var(--surface-overlay);
  cursor: default;
}

.agent-strip-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.agent-strip-title {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-muted);
  letter-spacing: 0.06em;
}

.agent-strip-clear {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 10px;
  cursor: pointer;
  padding: 0 4px;
  border-radius: 4px;
}

.agent-strip-clear:hover {
  color: #f87171;
}

.agent-strip-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  /* 上限保护:Agent 多时区内滚动,不把面板内容顶出窗口 */
  max-height: 96px;
  overflow-y: auto;
}

.agent-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  min-width: 0;
}

.agent-row-icon {
  font-size: 11px;
  flex-shrink: 0;
}

.agent-row-name {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-row-state {
  flex-shrink: 0;
  font-size: 10px;
}

.agent-row-time {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.agent-row-close {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 10px;
  cursor: pointer;
  padding: 0 3px;
  border-radius: 3px;
  flex-shrink: 0;
}

.agent-row-close:hover {
  color: var(--text-primary);
}

.agent-state-working {
  color: #38bdf8;
}

.agent-state-waiting {
  color: #f59e0b;
  font-weight: 600;
  animation: agent-wait-blink 1.5s ease-in-out infinite;
}

.agent-state-error {
  color: #ef4444;
}

.agent-state-completed {
  color: #4ade80;
}

.agent-state-stale,
.agent-state-idle {
  color: var(--text-muted);
}

@keyframes agent-wait-blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.55;
  }
}

@media (prefers-reduced-motion: reduce) {
  .agent-state-waiting {
    animation: none;
  }
}

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
  background: var(--accent-gradient, var(--accent-color, #22c55e));
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

/* 24h 趋势图 */
.trend-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.trend-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.trend-label {
  font-size: 10px;
  color: var(--text-muted);
}

.trend-legend {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: var(--text-muted);
}

.dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-left: 6px;
}

.dot-5h {
  background: var(--accent-color, #4ade80);
}

.dot-7d {
  background: var(--text-muted);
}

.trend-svg {
  width: 100%;
  height: 44px;
  display: block;
}

.line-5h {
  fill: none;
  stroke: var(--accent-color, #4ade80);
  stroke-width: 1.5;
}

.line-7d {
  fill: none;
  stroke: var(--text-muted);
  stroke-width: 1;
  opacity: 0.55;
}

/* 5h 消耗速率预测行:弱化展示,粗估语义 */
.burn-line {
  font-size: 10px;
  color: var(--text-muted);
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

/* 尊重系统「减少动态效果」:面板弹簧入场退化为直接显示 */
@media (prefers-reduced-motion: reduce) {
  .panel,
  .panel > * {
    animation: none !important;
  }
}
/* Tab 行 + 设置按钮(与其他模块面板一致) */
.tabs-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.gear-btn {
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  padding: 2px 6px;
  border-radius: 6px;
  cursor: pointer;
}

.gear-btn:hover {
  color: var(--text-primary);
  background: var(--surface-overlay);
}
</style>