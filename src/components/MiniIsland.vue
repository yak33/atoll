<script setup lang="ts">
/**
 * 贴顶微折叠态的迷你岛(上方霓虹横条)。
 * 8px 高透明命中窗口,贴顶居中 3px 霓虹线(强调色渐变 + 流动光带);
 * 交互:mouseenter = 唤回完整胶囊;click = 打开设置。
 * 用户拍板:始终保持胶囊形态,不要方形小徽章;仅贴顶折叠为横条。
 *
 * @author ZHANGCHAO 2026/10/06
 */
import type { DockEdge } from '../core/edgeDock'

defineProps<{
  edge?: DockEdge
}>()

const emit = defineEmits<{ mouseenter: []; click: [] }>()
</script>

<template>
  <div
    class="dock-line dock-line-top"
    title="atoll · 移入恢复"
    @mouseenter="emit('mouseenter')"
    @click="emit('click')"
  >
    <div class="dock-line-glow"></div>
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
  top: 0;
  height: 3px;
  background: linear-gradient(90deg, transparent, var(--accent-color, #4ade80), var(--accent-color, #4ade80), transparent);
  box-shadow: 0 0 6px rgb(var(--accent-rgb, 34 197 94) / 0.6);
  animation: dock-glow-slide 2.4s linear infinite;
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

@media (prefers-reduced-motion: reduce) {
  .dock-line-glow {
    animation: none;
  }
}
</style>

