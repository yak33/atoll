/**
 * 剪贴板历史(core 层,纯函数)。
 * 只录纯文本(Rust 侧已过滤图像/文件);去重置顶、总量上限、超长截断存储。
 * 红线:不做标签/分类/自动粘贴模拟,保持「列表 + 搜索 + 点击复制」的克制形态。
 *
 * @author ZHANGCHAO 2026/10/06
 */

/** 一条剪贴板历史 */
export interface ClipboardItem {
  id: string
  text: string
  pinned: boolean
  copiedAt: number // epoch ms
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

  const existing = items.find((item) => item.text === text)
  if (existing !== undefined) {
    const updated: ClipboardItem = { ...existing, copiedAt: now }
    return [updated, ...items.filter((item) => item.id !== existing.id)]
  }

  const next: ClipboardItem = { id: nextId(), text, pinned: false, copiedAt: now }
  const merged = [next, ...items]
  if (merged.length <= MAX_ITEMS) return merged

  // 淘汰:保持置顶在前、未置顶按新旧排序,从未置顶末尾删
  const pinnedItems = merged.filter((item) => item.pinned)
  const normal = merged.filter((item) => !item.pinned)
  const keep = MAX_ITEMS - pinnedItems.length
  return [...pinnedItems.slice(0, Math.max(0, keep)), ...normal.slice(0, Math.max(0, keep))]
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
