<script setup lang="ts">
/**
 * 岛内气泡通知(从药丸下方垂落的窄条)。
 * 纯展示:图标 + 标题 + 详情 + 关闭;自动收回倒计时(悬停暂停)与点击跳转由容器层管理。
 * 定位为绝对布局(top 52px = 药丸 44 + 间隙 8),由窗口临时加高腾出空间。
 *
 * @author ZHANGCHAO 2026/10/15
 */
import type { IslandNotice } from '../core/notifyQueue'

defineProps<{ notice: IslandNotice }>()

const emit = defineEmits<{
  mouseenter: []
  mouseleave: []
  click: []
  close: []
}>()

const KIND_ICONS: Record<IslandNotice['kind'], string> = {
  waiting: '✋',
  completed: '✅',
  error: '⚠️',
  reset: '🔄',
  info: '🔔',
}
</script>

<template>
  <div
    :class="['notice-bubble', `bubble-${notice.kind}`]"
    @mouseenter="emit('mouseenter')"
    @mouseleave="emit('mouseleave')"
    @click="emit('click')"
  >
    <span class="bubble-icon">{{ KIND_ICONS[notice.kind] }}</span>
    <div class="bubble-body">
      <div class="bubble-title">{{ notice.title }}</div>
      <div v-if="notice.detail" class="bubble-detail">{{ notice.detail }}</div>
    </div>
    <button class="bubble-close" type="button" title="关闭" @click.stop="emit('close')">✕</button>
  </div>
</template>

<style scoped>
/* 不加外发光:窗口矩形与气泡同宽,外部阴影会被透明窗口边缘硬裁切 */
.notice-bubble {
  position: absolute;
  top: 52px;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  padding: 8px 12px;
  border-radius: 12px;
  background: var(--bg-panel);
  border: 1px solid var(--pill-border);
  color: var(--text-primary);
  font-size: 11px;
  cursor: pointer;
  z-index: 10;
  animation: bubble-in 0.24s var(--ease-spring-soft, cubic-bezier(0.16, 1, 0.3, 1));
}

@keyframes bubble-in {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.bubble-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.bubble-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.bubble-title {
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bubble-detail {
  font-size: 10px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bubble-close {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 10px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  flex-shrink: 0;
}

.bubble-close:hover {
  color: var(--text-primary);
  background: var(--surface-overlay);
}

/* 状态色边框:与药丸状态点/Agent 卡片的配色体系一致 */
.bubble-waiting {
  border-color: rgba(245, 158, 11, 0.55);
}

.bubble-completed {
  border-color: rgba(34, 197, 94, 0.5);
}

.bubble-error {
  border-color: rgba(239, 68, 68, 0.55);
}

.bubble-reset {
  border-color: rgba(56, 189, 248, 0.5);
}

@media (prefers-reduced-motion: reduce) {
  .notice-bubble {
    animation: none;
  }
}
</style>
