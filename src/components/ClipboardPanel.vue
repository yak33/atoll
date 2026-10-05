<script setup lang="ts">
/**
 * 剪贴板展开面板(悬停态)。
 * 列表 + 搜索 + 点击复制(经 Rust 命令写回剪贴板)+ 置顶/删除/清空。
 *
 * @author ZHANGCHAO 2026/10/06
 */
import { computed, ref } from 'vue'
import ModuleTabs from './ModuleTabs.vue'
import type { IslandModule } from '../core/appSettings'
import { searchClipboard, summarize, type ClipboardItem } from '../core/clipboardHistory'

const props = defineProps<{
  items: ClipboardItem[]
  /** 记录开关:关闭时列表只读展示存量 */
  enabled: boolean
  activeModule: IslandModule
}>()

const emit = defineEmits<{
  mouseenter: []
  mouseleave: []
  dragstart: []
  copy: [text: string]
  remove: [id: string]
  pin: [id: string]
  clear: []
  switchModule: [module: IslandModule]
}>()

const keyword = ref('')
const filtered = computed(() => searchClipboard(props.items, keyword.value))

function timeOf(copiedAt: number): string {
  const diffMin = Math.floor((Date.now() - copiedAt) / 60_000)
  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin} 分钟前`
  const hours = Math.floor(diffMin / 60)
  if (hours < 24) return `${hours} 小时前`
  return `${Math.floor(hours / 24)} 天前`
}

// ===== 整面板拖动移动窗口:位移超过阈值才算拖动;输入框/按钮上按下不参与 =====
const DRAG_THRESHOLD_PX = 4
let armed = false
let downX = 0
let downY = 0

function onPanelMouseDown(event: MouseEvent): void {
  if (event.button !== 0) return
  if ((event.target as HTMLElement).closest('button, input') !== null) return
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

    <input v-model="keyword" type="text" class="search" placeholder="搜索剪贴板历史…" />

    <div class="list">
      <div v-if="filtered.length === 0" class="empty">
        {{ items.length === 0 ? (enabled ? '复制点文本,这里就会出现' : '记录已关闭,可在设置中开启') : '没有匹配的条目' }}
      </div>
      <div
        v-for="item in filtered"
        :key="item.id"
        class="row"
        :title="`${timeOf(item.copiedAt)} · 点击复制`"
        @click="emit('copy', item.text)"
      >
        <span class="row-text">{{ summarize(item.text, 120) }}</span>
        <span class="row-time">{{ timeOf(item.copiedAt) }}</span>
        <button class="row-btn" type="button" title="置顶/取消置顶" @click.stop="emit('pin', item.id)">
          {{ item.pinned ? '📌' : '📍' }}
        </button>
        <button class="row-btn row-btn-danger" type="button" title="删除" @click.stop="emit('remove', item.id)">✕</button>
      </div>
    </div>

    <div class="footer">
      <span class="hint">点击条目复制 · 仅记录文本 · 数据只在本机</span>
      <button class="clear-btn" type="button" :disabled="items.length === 0" @click="emit('clear')">清空</button>
    </div>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-sizing: border-box;
  height: 100vh;
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

.search {
  box-sizing: border-box;
  width: 100%;
  height: 26px;
  padding: 0 8px;
  border-radius: 8px;
  border: 1px solid var(--border-soft);
  background: var(--surface-overlay);
  color: var(--text-primary);
  font-size: 11px;
  font-family: inherit;
  outline: none;
  cursor: text;
}

.search:focus {
  border-color: var(--accent-color, #4ade80);
}

.list {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
}

.list::-webkit-scrollbar {
  width: 6px;
}

.list::-webkit-scrollbar-thumb {
  background: var(--border-soft);
  border-radius: 3px;
}

.empty {
  color: var(--text-muted);
  text-align: center;
  padding: 24px 0;
}

.row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
}

.row:hover {
  background: var(--surface-overlay);
}

.row-text {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-time {
  font-size: 10px;
  color: var(--text-muted);
  white-space: nowrap;
}

.row-btn {
  border: none;
  background: transparent;
  font-size: 11px;
  padding: 2px 4px;
  border-radius: 4px;
  cursor: pointer;
  opacity: 0.6;
}

.row-btn:hover {
  opacity: 1;
  background: var(--border-soft);
}

.row-btn-danger:hover {
  color: #ef4444;
}

.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid var(--divider);
  padding-top: 8px;
}

.hint {
  font-size: 10px;
  color: var(--text-muted);
}

.clear-btn {
  height: 20px;
  padding: 0 8px;
  border: 1px solid var(--border-soft);
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  font-size: 10px;
  font-family: inherit;
  cursor: pointer;
}

.clear-btn:hover:not(:disabled) {
  color: #ef4444;
  border-color: rgba(239, 68, 68, 0.4);
}

.clear-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
