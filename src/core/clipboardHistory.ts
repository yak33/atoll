/**
 * 剪贴板历史(core 层,纯函数)。
 * 只录纯文本(Rust 侧已过滤图像/文件);去重置顶、总量上限、超长截断存储。
 * 红线:不做标签/分类/自动粘贴模拟,保持「列表 + 搜索 + 点击复制」的克制形态。
 *
 * @author ZHANGCHAO 2026/10/06
 */

/** 剪贴板条目类型:文本或图像 */
export type ClipboardKind = 'text' | 'image'

/** 一条剪贴板历史(文本或图像) */
export interface ClipboardItem {
  id: string
  kind?: ClipboardKind // 默认 'text',向下兼容
  text: string         // 文本内容;图像时存标题摘要(如"[图片] 1920×1080")
  imagePath?: string   // 图片本地缓存完整路径(用于写回系统剪贴板)
  dataUrl?: string     // 缩略图 Data URL (轻量用于前端快速展示)
  width?: number
  height?: number
  pinned: boolean
  copiedAt: number // epoch ms
}

/** 图像载荷参数 */
export interface ClipboardImagePayload {
  path: string
  dataUrl: string
  width: number
  height: number
}

/** 存储的单条文本上限(超长截断,防止巨文本撑爆 store) */
export const MAX_TEXT_LENGTH = 2000
/** 总量上限(置顶豁免淘汰) */
export const MAX_ITEMS = 200

function truncate(text: string): string {
  return text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) : text
}

let idCounter = 0

/** 生成足够短且递增的本地 id;持久化后以存储内容为准 */
function nextId(): string {
  idCounter += 1
  return `${Date.now().toString(36)}-${idCounter.toString(36)}`
}

/**
 * 记录一条文本:
 * - 空白忽略;与现有条目同文本 → 该条置顶并刷新时间(去重,不产生冗余)
 * - 新条目插到最前(pinned 条目始终排在非 pinned 之前)
 * - 超过总量上限时从「未置顶的末尾」淘汰
 */
export function addClipboardItem(items: ClipboardItem[], rawText: string, now = Date.now()): ClipboardItem[] {
  const text = truncate(rawText.trim())
  if (text === '') return items

  const existing = items.find((item) => (item.kind ?? 'text') === 'text' && item.text === text)
  const pinned = items.filter((item) => item.pinned)
  const normal = items.filter((item) => !item.pinned)

  let nextPinned = pinned
  let nextNormal = normal

  if (existing !== undefined) {
    const updated: ClipboardItem = { ...existing, copiedAt: now }
    if (existing.pinned) {
      nextPinned = [updated, ...pinned.filter((item) => item.id !== existing.id)]
    } else {
      nextNormal = [updated, ...normal.filter((item) => item.id !== existing.id)]
    }
  } else {
    const next: ClipboardItem = { id: nextId(), kind: 'text', text, pinned: false, copiedAt: now }
    nextNormal = [next, ...normal]
  }

  // 淘汰:置顶项始终在最前且豁免淘汰,从未置顶末尾删
  const keepNormal = Math.max(0, MAX_ITEMS - nextPinned.length)
  return [...nextPinned.slice(0, MAX_ITEMS), ...nextNormal.slice(0, keepNormal)]
}

/**
 * 记录一条图像:
 * - 同文件路径去重置顶刷新时间
 * - 超过总量上限淘汰未置顶末尾
 */
export function addClipboardImageItem(items: ClipboardItem[], payload: ClipboardImagePayload, now = Date.now()): ClipboardItem[] {
  const existing = items.find((item) => item.kind === 'image' && item.imagePath === payload.path)
  const pinned = items.filter((item) => item.pinned)
  const normal = items.filter((item) => !item.pinned)

  let nextPinned = pinned
  let nextNormal = normal

  if (existing !== undefined) {
    const updated: ClipboardItem = { ...existing, copiedAt: now }
    if (existing.pinned) {
      nextPinned = [updated, ...pinned.filter((item) => item.id !== existing.id)]
    } else {
      nextNormal = [updated, ...normal.filter((item) => item.id !== existing.id)]
    }
  } else {
    const next: ClipboardItem = {
      id: nextId(),
      kind: 'image',
      text: `[图片] ${payload.width}×${payload.height}`,
      imagePath: payload.path,
      dataUrl: payload.dataUrl,
      width: payload.width,
      height: payload.height,
      pinned: false,
      copiedAt: now,
    }
    nextNormal = [next, ...normal]
  }

  const keepNormal = Math.max(0, MAX_ITEMS - nextPinned.length)
  return [...nextPinned.slice(0, MAX_ITEMS), ...nextNormal.slice(0, keepNormal)]
}

export function removeClipboardItem(items: ClipboardItem[], id: string): ClipboardItem[] {
  return items.filter((item) => item.id !== id)
}

/** 置顶/取消置顶:置顶项恒排最前 */
export function togglePin(items: ClipboardItem[], id: string): ClipboardItem[] {
  const toggled = items.map((item) => (item.id === id ? { ...item, pinned: !item.pinned } : item))
  return [
    ...toggled.filter((item) => item.pinned),
    ...toggled.filter((item) => !item.pinned),
  ]
}

/** 清空未置顶条目(隐私急停;置顶是用户明确保留的) */
export function clearUnpinned(items: ClipboardItem[]): ClipboardItem[] {
  return items.filter((item) => item.pinned)
}

/** 搜索:子串匹配(大小写不敏感),空关键词返回全部 */
export function searchClipboard(items: ClipboardItem[], keyword: string): ClipboardItem[] {
  const key = keyword.trim().toLowerCase()
  if (key === '') return items
  return items.filter((item) => item.text.toLowerCase().includes(key))
}

/** 展示用单行摘要:压平换行 + 截断 */
export function summarize(text: string, max = 80): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}
