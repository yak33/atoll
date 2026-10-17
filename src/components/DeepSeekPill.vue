<script setup lang="ts">
/**
 * DeepSeek 余额药丸(收起态)。
 * 纯展示:主币种总可用余额;低余额或上游标记不可用时升级配色。
 * 交互信号与其他药丸一致:click(展开)、mouseenter(悬停展开)、wheel(容器切模块)。
 * 药丸基座样式与偶发光效在 App.vue 全局(.island)。
 *
 * @author ZHANGCHAO 2026/10/18
 */
import { computed } from 'vue'
import type { GlowEffect } from '../core/appSettings'
import type { BalanceLevel } from '../core/balance'
import { formatBalanceAmount } from '../core/balance'
import type { DeepSeekBalanceInfo } from '../types'
import { useGlowEffects } from '../composables/useGlowEffects'

const props = defineProps<{
  /** 主币种余额;null = 未配置/加载中/无数据,此时展示 text */
  balance: DeepSeekBalanceInfo | null
  /** 无数据时的占位文案(点此设置 / 加载中… / Key 无效) */
  text: string
  /** 上游 is_available:false 表示余额不足以继续调用 API */
  available: boolean
  level: BalanceLevel
  hasError: boolean
  tooltip: string
  glowEffects: GlowEffect[]
}>()

const emit = defineEmits<{ click: []; mouseenter: []; mouseleave: []; wheel: [event?: WheelEvent] }>()

const { actionName } = useGlowEffects(() => props.glowEffects)

const amountText = computed<string>(() => {
  if (props.balance === null) return ''
  return formatBalanceAmount(props.balance.totalBalance, props.balance.currency)
})

const levelClass = computed<string>(() => {
  // 无数据时走占位文案,不做低余额配色(否则未配置/加载中会误亮红灯)
  if (props.balance === null) return ''
  if (props.level === 'critical' || !props.available) return 'ds-critical'
  if (props.level === 'warn') return 'ds-warn'
  return ''
})
</script>

<template>
  <div
    :class="['island', 'ds-island', levelClass, actionName !== '' ? 'do-' + actionName : '']"
    :title="tooltip"
    @click="emit('click')"
    @mouseenter="emit('mouseenter')"
    @mouseleave="emit('mouseleave')"
    @wheel.prevent="emit('wheel', $event)"
  >
    <span class="ds-icon">🐳</span>
    <template v-if="balance !== null">
      <span class="ds-currency">{{ balance.currency }}</span>
      <span class="ds-amount">{{ amountText }}</span>
    </template>
    <span v-else class="ds-placeholder">{{ text }}</span>
    <span v-if="hasError" class="ds-warn-dot" title="最近一次刷新失败">!</span>
  </div>
</template>

<style scoped>
.ds-island {
  gap: 6px;
}

.ds-icon {
  font-size: 15px;
  display: inline-block;
}

.ds-currency {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.04em;
}

/* 金额是药丸的主角:等宽数字避免轮询跳动 */
.ds-amount {
  font-size: 15px;
  font-weight: 700;
  color: var(--accent-color);
  font-variant-numeric: tabular-nums;
}

.ds-placeholder {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 低余额 / 不可用:告警底色沿用用量药丸的做法——深色调底色 × --bg-alpha,
   保证与普通态一样跟随设置面板的不透明度(这里不能用固定 alpha 的红色/琥珀底,
   否则药丸会比其它模块更实,看起来像没吃透明度设置) */
.ds-island.ds-warn {
  background: rgb(69 45 11 / var(--bg-alpha));
  border-color: rgba(245, 158, 11, 0.45);
  color: #e4e4e7;
}

.ds-island.ds-warn .ds-currency,
.ds-island.ds-critical .ds-currency {
  color: rgba(228, 228, 231, 0.75);
}

.ds-island.ds-warn .ds-amount {
  color: #fbbf24;
}

.ds-island.ds-critical {
  background: rgb(69 15 15 / var(--bg-alpha));
  border-color: rgba(239, 68, 68, 0.55);
  color: #e4e4e7;
  animation: ds-critical-glow 2s ease-in-out infinite;
}

.ds-island.ds-critical .ds-amount {
  color: #f87171;
}

/* 呼吸式内发光:与用量药丸 >=90% 的红色脉冲一致,避免外发光被透明窗口边缘硬裁切 */
@keyframes ds-critical-glow {
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

.ds-warn-dot {
  color: #fbbf24;
  font-size: 10px;
  font-weight: 700;
}

@media (prefers-reduced-motion: reduce) {
  .ds-island.ds-critical {
    animation: none;
  }
}
</style>
