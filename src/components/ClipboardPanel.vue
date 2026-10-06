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
import { nowTick } from '../composables/nowTick'

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
  copy: [item: ClipboardItem]
  remove: [id: string]
  pin: [id: string]
  clear: []
  switchModule: [module: IslandModule]
}>()

const keyword = ref('')
const filtered = computed(() => searchClipboard(props.items, keyword.value))
const searchInputRef = ref<HTMLInputElement | null>(null)
const isInputFocused = ref(false)
const isComposing = ref(false)
const isMouseOverPanel = ref(false)

function onPanelMouseEnter(): void {
  isMouseOverPanel.value = true
  emit('mouseenter')
}

function onPanelMouseLeave(): void {
  isMouseOverPanel.value = false
  // 输入聚焦保护:若输入框处于聚焦打字或中文拼音候选状态,拦截外部收回
  if (isInputFocused.value || isComposing.value) {
    return
  }
  emit('mouseleave')
}

function onInputFocus(): void {
  isInputFocused.value = true
  emit('mouseenter')
}

function onInputBlur(): void {
  // 延迟检查:抹平中文输入法候选浮窗选词瞬间的瞬态失焦抖动
  window.setTimeout(() => {
    if (document.activeElement === searchInputRef.value || isComposing.value) {
      return
    }
    isInputFocused.value = false
    // 若失焦时鼠标已经离开面板,触发延时收回
    if (!isMouseOverPanel.value) {
      emit('mouseleave')
    }
  }, 220)
}

function onCompositionStart(): void {
  isComposing.value = true
}

function onCompositionEnd(): void {
  isComposing.value = false
}

function onInputEsc(event: KeyboardEvent): void {
  if (keyword.value !== '') {
    keyword.value = ''
  } else {
    ;(event.target as HTMLInputElement)?.blur()
  }
}

// ===== 悬停长文本 / 图片毛玻璃预览卡片 (方案 B) =====
const previewItem = ref<ClipboardItem | null>(null)
let previewTimer: number | null = null

function onRowMouseEnter(item: ClipboardItem): void {
  cancelPreview()
  previewTimer = window.setTimeout(() => {
    previewTimer = null
    previewItem.value = item
  }, 220)
}

function onRowMouseLeave(): void {
  cancelPreview()
  previewTimer = window.setTimeout(() => {
    previewTimer = null
    previewItem.value = null
  }, 120)
}

function cancelPreview(): void {
  if (previewTimer !== null) {
    clearTimeout(previewTimer)
    previewTimer = null
  }
}

function onCardMouseEnter(): void {
  cancelPreview()
}

function onCardMouseLeave(): void {
  previewItem.value = null
}

function timeOf(copiedAt: number): string {
  const diffMin = Math.floor((nowTick.value - copiedAt) / 60_000)
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
  if ((event.target as HTMLElement).closest('button, input, .preview-card') !== null) return
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
    @mouseenter="onPanelMouseEnter"
    @mouseleave="onPanelMouseLeave"
    @mousedown="onPanelMouseDown"
    @mousemove="onPanelMouseMove"
    @mouseup="onPanelMouseUp"
  >
    <ModuleTabs :current="activeModule" @switch-module="(m) => emit('switchModule', m)" />

    <div class="search-box">
      <input
        ref="searchInputRef"
        v-model="keyword"
        type="text"
        class="search"
        placeholder="搜索剪贴板历史…"
        @focus="onInputFocus"
        @blur="onInputBlur"
        @compositionstart="onCompositionStart"
        @compositionend="onCompositionEnd"
        @keydown.esc="onInputEsc"
      />
      <button v-if="keyword !== ''" class="search-clear" type="button" title="清空搜索" @click="keyword = ''">✕</button>
    </div>

    <div class="list" @wheel.stop>
      <div v-if="filtered.length === 0" class="empty">
        {{ items.length === 0 ? (enabled ? '复制点文本或截图,这里就会出现' : '记录已关闭,可在设置中开启') : '没有匹配的条目' }}
      </div>
      <div
        v-for="item in filtered"
        :key="item.id"
        class="row"
        :title="item.kind === 'image' ? (item.width && item.height ? `图片 ${item.width}×${item.height}` : '图片') : item.text"
        @mouseenter="onRowMouseEnter(item)"
        @mouseleave="onRowMouseLeave"
        @click="emit('copy', item)"
      >
        <template v-if="item.kind === 'image'">
          <img v-if="item.dataUrl" :src="item.dataUrl" class="row-thumb" alt="thumb" />
          <span v-else class="row-thumb-placeholder">🖼️</span>
          <span class="row-text row-image-title">
            图片
            <span v-if="item.width && item.height" class="row-dim">{{ item.width }}×{{ item.height }}</span>
          </span>
        </template>
        <template v-else>
          <span class="row-text">{{ summarize(item.text, 120) }}</span>
        </template>
        <span class="row-time">{{ timeOf(item.copiedAt) }}</span>
        <button class="row-btn" type="button" :title="item.pinned ? '取消置顶' : '置顶'" @click.stop="emit('pin', item.id)">
          {{ item.pinned ? '📌' : '📍' }}
        </button>
        <button class="row-btn row-btn-danger" type="button" title="删除" @click.stop="emit('remove', item.id)">✕</button>
      </div>
    </div>

    <!-- 悬停长文本 / 图片毛玻璃预览浮层 (方案 B) -->
    <Transition name="preview-fade">
      <div
        v-if="previewItem"
        class="preview-card"
        :title="previewItem.kind === 'image' ? '点击复制图片' : '点击复制完整文本'"
        @mouseenter="onCardMouseEnter"
        @mouseleave="onCardMouseLeave"
        @wheel.stop
        @click.stop="emit('copy', previewItem)"
      >
        <div class="preview-header">
          <div class="preview-meta">
            <span class="preview-badge">{{ previewItem.kind === 'image' ? '图片预览' : '完整预览' }}</span>
            <span v-if="previewItem.kind === 'image' && previewItem.width && previewItem.height" class="preview-count">
              {{ previewItem.width }} × {{ previewItem.height }} px
            </span>
            <span v-else-if="previewItem.kind !== 'image'" class="preview-count">
              {{ previewItem.text.length }} 字符
            </span>
            <span class="preview-time">{{ timeOf(previewItem.copiedAt) }}</span>
          </div>
          <span class="preview-hint">{{ previewItem.kind === 'image' ? '点击复制 🖼️' : '点击复制 📋' }}</span>
        </div>
        <div v-if="previewItem.kind === 'image'" class="preview-image-box">
          <img v-if="previewItem.dataUrl" :src="previewItem.dataUrl" class="preview-img" alt="preview" />
          <div v-else class="preview-img-fallback">暂无缩略图</div>
        </div>
        <div v-else class="preview-body">{{ previewItem.text }}</div>
      </div>
    </Transition>

    <div class="footer">
      <span class="hint">点击条目复制 · 悬停查看全部 · 数据只在本机</span>
      <button class="clear-btn" type="button" :disabled="items.length === 0" @click="emit('clear')">清空</button>
    </div>
  </div>
</template>

<style scoped>
.panel {
  position: relative;
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

.search-box {
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
}

.search {
  box-sizing: border-box;
  width: 100%;
  height: 26px;
  padding: 0 24px 0 8px;
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

.search-clear {
  position: absolute;
  right: 6px;
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 50%;
}

.search-clear:hover {
  color: var(--text-primary);
  background: var(--border-soft);
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

.row-thumb {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  object-fit: cover;
  flex-shrink: 0;
  border: 1px solid var(--border-soft);
  background: rgba(0, 0, 0, 0.2);
}

.row-thumb-placeholder {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  background: var(--surface-overlay);
  flex-shrink: 0;
}

.row-image-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

.row-dim {
  font-size: 10px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
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

/* ===== 方案 B: 悬停毛玻璃完整预览浮层 ===== */
.preview-card {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 42px;
  max-height: 220px;
  display: flex;
  flex-direction: column;
  background: var(--bg-surface);
  border: 1px solid var(--accent-color, #4ade80);
  box-shadow: 0 12px 30px -4px rgba(0, 0, 0, 0.55), 0 0 16px rgb(var(--accent-rgb, 34 197 94) / 0.25);
  border-radius: 12px;
  padding: 10px 12px;
  box-sizing: border-box;
  z-index: 20;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  cursor: pointer;
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--divider);
}

.preview-meta {
  display: flex;
  align-items: center;
  gap: 6px;
}

.preview-badge {
  font-size: 9px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(var(--accent-rgb, 34 197 94) / 0.2);
  color: var(--accent-color, #4ade80);
}

.preview-count,
.preview-time {
  font-size: 10px;
  color: var(--text-muted);
}

.preview-hint {
  font-size: 10px;
  color: var(--accent-color, #4ade80);
  font-weight: 600;
}

.preview-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text-primary);
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace, sans-serif;
  user-select: text;
  cursor: text;
}

.preview-body::-webkit-scrollbar {
  width: 4px;
}

.preview-body::-webkit-scrollbar-thumb {
  background: var(--border-soft);
  border-radius: 2px;
}

.preview-image-box {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 8px;
  padding: 8px;
  overflow: hidden;
}

.preview-img {
  max-width: 100%;
  max-height: 140px;
  object-fit: contain;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
}

.preview-img-fallback {
  font-size: 11px;
  color: var(--text-muted);
}

.preview-fade-enter-active,
.preview-fade-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.preview-fade-enter-from,
.preview-fade-leave-to {
  opacity: 0;
  transform: translateY(6px) scale(0.98);
}
</style>
