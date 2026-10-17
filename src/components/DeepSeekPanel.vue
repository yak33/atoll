<script setup lang="ts">
/**
 * DeepSeek 余额展开面板(悬停态)。
 * 展示主币种总可用余额、充值余额与未过期赠金明细、24h 余额趋势与消耗速率粗估。
 * 顶部模块 Tab 与其它面板同款,切换/拖窗由 App 统一处理。
 *
 * @author ZHANGCHAO 2026/10/18
 */
import { computed } from 'vue'
import type { QuotaError } from '../types'
import type { DeepSeekBalanceInfo } from '../types'
import type { BalanceLevel, BalancePoint } from '../core/balance'
import { balanceSparklinePoints, formatBalanceAmount } from '../core/balance'
import { nowTick } from '../composables/nowTick'
import ModuleTabs from './ModuleTabs.vue'
import type { IslandModule } from '../core/appSettings'

const props = defineProps<{
  activeModule: IslandModule
  /** 主币种余额;null = 未配置/加载中/无数据,此时展示 placeholder */
  balance: DeepSeekBalanceInfo | null
  level: BalanceLevel
  /** 上游 is_available:false 表示余额不足以继续调用 API */
  available: boolean
  error: QuotaError | null
  fetchedAgo: string
  refreshing: boolean
  /** 余额消耗速率预测文案;空串 = 样本不足/不可信,不渲染 */
  burnEstimate: string
  /** 24h 余额历史(当前主币种);少于两个点不画趋势 */
  history: BalancePoint[]
  placeholder: string
}>()

const emit = defineEmits<{
  mouseenter: []
  mouseleave: []
  dragstart: []
  switchModule: [module: IslandModule]
  refresh: []
  settings: []
}>()

// ===== 整面板拖动移动窗口:位移超过阈值才算拖动;按钮上按下不参与 =====
const DRAG_THRESHOLD_PX = 4
let armed = false
let downX = 0
let downY = 0

function onPanelMouseDown(event: MouseEvent): void {
  if (event.button !== 0) return
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

const TREND_W = 320
const TREND_H = 32

const totalText = computed<string>(() =>
  props.balance === null ? '' : formatBalanceAmount(props.balance.totalBalance, props.balance.currency),
)
const toppedUpText = computed<string>(() =>
  props.balance === null ? '' : formatBalanceAmount(props.balance.toppedUpBalance, props.balance.currency),
)
const grantedText = computed<string>(() =>
  props.balance === null ? '' : formatBalanceAmount(props.balance.grantedBalance, props.balance.currency),
)
const levelText = computed<string>(() => {
  if (props.level === 'critical') return '余额偏低'
  if (props.level === 'warn') return '留意余额'
  return '正常'
})
const trendPoints = computed<string>(() => balanceSparklinePoints(props.history, nowTick.value, TREND_W, TREND_H))
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

    <template v-if="balance !== null">
      <div class="total-block" title="按住任意位置拖动">
        <div class="total-head">
          <span class="total-label">🐳 DeepSeek 总可用余额</span>
          <span :class="['level-chip', level]">{{ levelText }}</span>
        </div>
        <span :class="['total-amount', level]">{{ totalText }}</span>
        <span v-if="!available" class="unavailable">余额不足,API 调用可能失败</span>
      </div>

      <div class="breakdown">
        <div class="ds-row">
          <span class="row-label">充值余额</span>
          <span class="row-value">{{ toppedUpText }}</span>
        </div>
        <div class="ds-row">
          <span class="row-label">未过期赠金</span>
          <span class="row-value">{{ grantedText }}</span>
        </div>
      </div>

      <div v-if="history.length > 1" class="trend-block" title="近 24 小时余额走势(左端 = 24 小时前)">
        <div class="trend-head">
          <span class="trend-label">24h 余额趋势</span>
        </div>
        <svg class="trend-svg" :viewBox="`0 0 ${TREND_W} ${TREND_H}`" preserveAspectRatio="none">
          <polyline class="line-balance" :points="trendPoints" />
        </svg>
      </div>

      <div v-if="burnEstimate !== ''" class="burn-line" title="基于余额下降速度的粗略估算">{{ burnEstimate }}</div>
    </template>

    <div v-else class="no-data">{{ placeholder }}</div>

    <div v-if="error" class="error-line" :title="error.message">{{ error.message }}</div>

    <div class="panel-footer">
      <span class="fetched">更新于 {{ fetchedAgo || '--' }}</span>
      <button class="action-btn" type="button" :disabled="refreshing" @click="emit('refresh')">
        {{ refreshing ? '刷新中…' : '刷新' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-sizing: border-box;
  /* 高度由内容决定:内容恒小于窗口高度,不会被窗口裁切 */
  height: auto;
  padding: 12px 16px 10px;
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

.total-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.total-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.total-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-secondary);
}

/* 等级 chip:正常不出现抢眼颜色,低余额时提示 */
.level-chip {
  font-size: 9px;
  padding: 1px 6px;
  border-radius: 9999px;
  color: var(--text-muted);
  background: var(--surface-overlay);
}

.level-chip.warn {
  color: #fbbf24;
  background: rgba(251, 191, 36, 0.12);
}

.level-chip.critical {
  color: #f87171;
  background: rgba(248, 113, 113, 0.12);
}

/* 余额数字:面板主角,等宽数字 */
.total-amount {
  font-size: 30px;
  font-weight: 700;
  line-height: 1.15;
  color: var(--accent-color);
  font-variant-numeric: tabular-nums;
}

.total-amount.warn {
  color: #fbbf24;
}

.total-amount.critical {
  color: #f87171;
}

.unavailable {
  font-size: 10px;
  color: #f87171;
}

.breakdown {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 7px 10px;
  border-radius: 8px;
  background: var(--surface-overlay);
  border: 1px solid var(--border-soft);
}

.ds-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.row-label {
  font-size: 11px;
  color: var(--text-secondary);
}

.row-value {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

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

.trend-svg {
  width: 100%;
  height: 32px;
  display: block;
}

.line-balance {
  fill: none;
  stroke: var(--accent-color);
  stroke-width: 1.5;
  stroke-linejoin: round;
  stroke-linecap: round;
}

.burn-line {
  font-size: 10px;
  color: var(--text-secondary);
}

.no-data {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 120px;
  font-size: 11px;
  color: var(--text-muted);
}

.error-line {
  font-size: 10px;
  color: #f87171;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.panel-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 2px;
}

.fetched {
  font-size: 10px;
  color: var(--text-muted);
}

.action-btn {
  height: 22px;
  padding: 0 10px;
  border: 1px solid var(--border-soft);
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 10px;
  font-family: inherit;
  cursor: pointer;
}

.action-btn:hover:not(:disabled) {
  color: var(--text-primary);
  background: var(--surface-overlay);
}

.action-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

@media (prefers-reduced-motion: reduce) {
  .panel,
  .panel > * {
    animation: none !important;
  }
}
</style>
