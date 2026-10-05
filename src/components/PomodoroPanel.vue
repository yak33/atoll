<script setup lang="ts">
/**
 * 番茄钟展开面板(悬停态)。
 * 大号倒计时 + 开始/暂停/重置;阶段切换由 App 层 tick 驱动并 toast。
 * 顶部模块 Tab 与用量面板同款,切换由 App 统一处理。
 *
 * @author ZHANGCHAO 2026/10/01
 */
import ModuleTabs from './ModuleTabs.vue'
import type { IslandModule } from '../core/appSettings'

defineProps<{
  /** 阶段/剩余文本由 App 按秒算好传入;workMin/breakMin 供提示文案插值 */
  pomo: {
    phase: 'work' | 'break'
    running: boolean
    remainText: string
    stateText: string
    workMin: number
    breakMin: number
  }
  activeModule: IslandModule
}>()

const emit = defineEmits<{
  mouseenter: []
  mouseleave: []
  dragstart: []
  pomoToggle: []
  pomoReset: []
  switchModule: [module: IslandModule]
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
    <ModuleTabs :current="activeModule" @switch-module="(m) => emit('switchModule', m)" />

    <div class="pomo-title" title="按住任意位置拖动">🍅 番茄钟</div>

    <div class="pomo-stage">
      <span :class="['stage-label', pomo.phase]">{{ pomo.phase === 'work' ? '专注' : '休息' }}</span>
      <span :class="['stage-clock', pomo.running ? pomo.phase : '']">{{ pomo.remainText }}</span>
      <span v-if="pomo.stateText !== ''" class="stage-state">{{ pomo.stateText }}</span>
    </div>

    <div class="pomo-actions">
      <button class="pomo-btn-primary" type="button" @click="emit('pomoToggle')">{{ pomo.running ? '暂停' : '开始' }}</button>
      <button class="pomo-btn" type="button" @click="emit('pomoReset')">重置</button>
    </div>

    <div class="pomo-hint">工作 {{ pomo.workMin }} 分钟 · 休息 {{ pomo.breakMin }} 分钟,阶段结束自动切换并通知</div>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-sizing: border-box;
  /* 高度由内容决定:内容恒小于窗口高度,不会被窗口裁切(同用量面板) */
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

.pomo-title {
  font-size: 12px;
  font-weight: 600;
}

/* 阶段展示:居中大号倒计时 */
.pomo-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 0;
}

.stage-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}

.stage-label.work {
  color: #fb923c;
}

.stage-label.break {
  color: #4ade80;
}

.stage-clock {
  font-size: 34px;
  font-weight: 700;
  line-height: 1.2;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.stage-clock.work {
  color: #fb923c;
}

.stage-clock.break {
  color: #4ade80;
}

.stage-state {
  font-size: 10px;
  color: var(--text-muted);
}

.pomo-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
}

.pomo-btn-primary {
  height: 28px;
  padding: 0 22px;
  border: 1px solid rgba(251, 146, 60, 0.45);
  border-radius: 8px;
  background: rgba(251, 146, 60, 0.16);
  color: #fb923c;
  font-size: 12px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
}

.pomo-btn-primary:hover {
  background: rgba(251, 146, 60, 0.26);
}

.pomo-btn {
  height: 28px;
  padding: 0 18px;
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
}

.pomo-btn:hover {
  color: var(--text-primary);
  background: var(--surface-overlay);
}

.pomo-hint {
  font-size: 10px;
  color: var(--text-muted);
  text-align: center;
}
</style>
