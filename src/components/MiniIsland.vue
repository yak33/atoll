<script setup lang="ts">
/**
 * 贴边折叠态的迷你岛(F1)。
 * 上/下折叠:8px 高窗口,3px 霓虹线(强调色渐变 + 流动光带);
 * 左/右折叠:44×44 迷你方块,按当前模块显示极简状态(用量百分比/番茄倒计时/📋)。
 * 交互:mouseenter = 唤回完整药丸;click = 打开设置(与药丸一致)。
 *
 * @author ZHANGCHAO 2026/10/06
 */
defineProps<{
  edge: 'top' | 'bottom' | 'left' | 'right'
  /** 迷你方块内容:按当前模块由 App 组装(线形态不显示) */
  badge: string
}>()

const emit = defineEmits<{ mouseenter: []; click: [] }>()
</script>

<template>
  <!-- 线形态:上下贴边 -->
  <div
    v-if="edge === 'top' || edge === 'bottom'"
    :class="['dock-line', edge === 'top' ? 'dock-line-top' : 'dock-line-bottom']"
    title="atoll · 移入恢复"
    @mouseenter="emit('mouseenter')"
    @click="emit('click')"
  >
    <div class="dock-line-glow"></div>
  </div>

  <!-- 迷你方块:左右贴边 -->
  <div v-else class="dock-mini" title="atoll · 移入恢复" @mouseenter="emit('mouseenter')" @click="emit('click')">
    <span class="dock-mini-badge">{{ badge }}</span>
  </div>
</template>

<style scoped>
/* 8px 窗口:可见线只占 3px,其余是透明命中缓冲 */
.dock-line {
  position: relative;
  width: 100%;
  height: 100vh;
  cursor: pointer;
}

.dock-line-glow {
  position: absolute;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, transparent, var(--accent-color, #4ade80), var(--accent-color, #4ade80), transparent);
  box-shadow: 0 0 6px rgb(var(--accent-rgb, 34 197 94) / 0.6);
  animation: dock-glow-slide 2.4s linear infinite;
}

.dock-line-top .dock-line-glow {
  top: 0;
}

.dock-line-bottom .dock-line-glow {
  bottom: 0;
}

@keyframes dock-glow-slide {
  0% {
    transform: translateX(-30%);
    opacity: 0.4;
  }
  50% {
    transform: translateX(30%);
    opacity: 1;
  }
  100% {
    transform: translateX(-30%);
    opacity: 0.4;
  }
}

/* 迷你方块:44×44 徽章,强调色描边呼吸 */
.dock-mini {
  width: 100%;
  height: 100vh;
  box-sizing: border-box;
  border-radius: 12px;
  border: 1.5px solid rgb(var(--accent-rgb, 34 197 94) / 0.55);
  background: var(--bg-surface);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  user-select: none;
  animation: mini-breathe 3.2s ease-in-out infinite;
}

.dock-mini-badge {
  font-family: 'Segoe UI', system-ui, sans-serif;
  font-size: 12px;
  font-weight: 700;
  color: var(--accent-color, #4ade80);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

@keyframes mini-breathe {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgb(var(--accent-rgb, 34 197 94) / 0.35);
  }
  50% {
    box-shadow: 0 0 10px 1px rgb(var(--accent-rgb, 34 197 94) / 0.25);
  }
}

@media (prefers-reduced-motion: reduce) {
  .dock-line-glow,
  .dock-mini {
    animation: none;
  }
}
</style>
