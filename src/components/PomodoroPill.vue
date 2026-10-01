<script setup lang="ts">
/**
 * 番茄钟药丸(收起态)。
 * 纯展示:阶段 + 剩余时间 + 运行状态;控制按钮在展开面板里。
 * 交互信号与用量药丸一致:click(设置)、mouseenter(展开)、wheel(容器切模块)。
 * 药丸基座样式与偶发光效在 App.vue 全局(.island)。
 *
 * @author ZHANGCHAO 2026/10/01
 */
import type { GlowEffect } from '../core/appSettings'
import { useGlowEffects } from '../composables/useGlowEffects'

const props = defineProps<{
  /** 阶段/剩余文本由 App 按秒算好传入;stateText:未开始/已暂停/空串(运行中) */
  pomo: { phase: 'work' | 'break'; running: boolean; remainText: string; stateText: string }
  tooltip: string
  glowEffects: GlowEffect[]
}>()

const emit = defineEmits<{ click: []; mouseenter: []; wheel: [] }>()

const { actionName } = useGlowEffects(() => props.glowEffects)
</script>

<template>
  <div
    :class="['island', 'pomo-island', actionName !== '' ? 'do-' + actionName : '']"
    :title="tooltip"
    @click="emit('click')"
    @mouseenter="emit('mouseenter')"
    @wheel.prevent="emit('wheel')"
  >
    <span class="pomo-tomato">🍅</span>
    <span :class="['pomo-phase', pomo.phase]">{{ pomo.phase === 'work' ? '专注' : '休息' }}</span>
    <span :class="['pomo-clock', pomo.running ? pomo.phase : '']">{{ pomo.remainText }}</span>
    <span v-if="pomo.stateText !== ''" class="pomo-state">{{ pomo.stateText }}</span>
  </div>
</template>

<style scoped>
.pomo-tomato {
  font-size: 15px;
}

.pomo-phase {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}

/* 倒计时:专注番茄橙 / 休息绿,未运行灰色(非活数据) */
.pomo-clock {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.pomo-clock.work {
  color: #fb923c;
}

.pomo-clock.break {
  color: #4ade80;
}

.pomo-state {
  font-size: 10px;
  color: var(--text-muted);
}
</style>
