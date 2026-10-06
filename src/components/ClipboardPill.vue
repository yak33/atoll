<script setup lang="ts">
/**
 * 剪贴板药丸(收起态)。
 * 纯展示:最新一条文本摘要;记录关闭时空态提示。
 * 交互信号与另两个药丸一致:click(设置)、mouseenter(展开)、wheel(容器切模块)。
 *
 * @author ZHANGCHAO 2026/10/06
 */
import type { GlowEffect } from '../core/appSettings'
import { useGlowEffects } from '../composables/useGlowEffects'
import { summarize, type ClipboardItem } from '../core/clipboardHistory'

const props = defineProps<{
  /** 最新若干条(第一条为最新);空数组显示空态 */
  latest: ClipboardItem[]
  /** 记录开关(设置可关,隐私急停) */
  enabled: boolean
  tooltip: string
  glowEffects: GlowEffect[]
}>()

const emit = defineEmits<{ click: []; mouseenter: []; mouseleave: []; wheel: [event?: WheelEvent] }>()

const { actionName } = useGlowEffects(() => props.glowEffects)
</script>

<template>
  <div
    :class="['island', actionName !== '' ? 'do-' + actionName : '']"
    :title="tooltip"
    @click="emit('click')"
    @mouseenter="emit('mouseenter')"
    @mouseleave="emit('mouseleave')"
    @wheel.prevent="emit('wheel', $event)"
  >
    <span class="clip-icon">{{ latest[0]?.kind === 'image' ? '🖼️' : '📋' }}</span>
    <span v-if="latest.length > 0" class="clip-latest">
      {{ latest[0].kind === 'image' ? (latest[0].width && latest[0].height ? `图片 ${latest[0].width}×${latest[0].height}` : '图片') : summarize(latest[0].text, 46) }}
    </span>
    <span v-else-if="enabled" class="clip-empty">复制点什么试试</span>
    <span v-else class="clip-empty">记录已关闭</span>
    <span v-if="latest.length > 1" class="clip-count">{{ latest.length }}</span>
  </div>
</template>

<style scoped>
.clip-icon {
  font-size: 14px;
}

/* 最新一条摘要:占满剩余宽度,超出省略 */
.clip-latest {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.clip-empty {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.clip-count {
  font-size: 10px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  background: var(--surface-overlay);
  border-radius: 8px;
  padding: 1px 6px;
}
</style>
