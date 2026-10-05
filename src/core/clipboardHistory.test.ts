/**
 * 剪贴板历史单测:去重置顶/上限淘汰/置顶排序/搜索/摘要。
 *
 * @author ZHANGCHAO 2026/10/06
 */
import { describe, expect, it } from 'vitest'
import {
  MAX_ITEMS,
  MAX_TEXT_LENGTH,
  addClipboardItem,
  clearUnpinned,
  removeClipboardItem,
  searchClipboard,
  summarize,
  togglePin,
  type ClipboardItem,
} from './clipboardHistory'

const T0 = 1_700_000_000_000

function seed(count: number, prefix = 'text-'): ClipboardItem[] {
  let items: ClipboardItem[] = []
  for (let i = 0; i < count; i++) {
    items = addClipboardItem(items, `${prefix}${i}`, T0 + i * 1000)
  }
  return items
}

describe('addClipboardItem', () => {
  it('新文本插入最前;空白忽略', () => {
    const items = addClipboardItem(addClipboardItem([], 'a', T0), 'b', T0 + 1)
    expect(items.map((i) => i.text)).toEqual(['b', 'a'])
    expect(addClipboardItem(items, '   ', T0 + 2)).toBe(items)
  })

  it('重复文本:置顶并刷新时间,不产生冗余', () => {
    let items = seed(3)
    items = addClipboardItem(items, 'text-0', T0 + 999_999)
    expect(items).toHaveLength(3)
    expect(items[0].text).toBe('text-0')
    expect(items[0].copiedAt).toBe(T0 + 999_999)
  })

  it('超长文本截断到存储上限', () => {
    const items = addClipboardItem([], 'x'.repeat(MAX_TEXT_LENGTH + 500), T0)
    expect(items[0].text.length).toBe(MAX_TEXT_LENGTH)
  })

  it('超过总量上限从未置顶末尾淘汰', () => {
    const items = seed(MAX_ITEMS + 10)
    expect(items.length).toBeLessThanOrEqual(MAX_ITEMS)
    // 最新的保留,最早的被淘汰
    expect(items[0].text).toBe(`text-${MAX_ITEMS + 9}`)
    expect(items.some((i) => i.text === 'text-0')).toBe(false)
  })

  it('置顶条目豁免淘汰', () => {
    let items = seed(2)
    items = togglePin(items, items[1].id) // text-0 置顶
    for (let i = 2; i < MAX_ITEMS + 10; i++) {
      items = addClipboardItem(items, `text-${i}`, T0 + i * 1000)
    }
    expect(items.length).toBeLessThanOrEqual(MAX_ITEMS)
    expect(items.some((i) => i.text === 'text-0')).toBe(true)
  })
})

describe('增删与置顶', () => {
  it('removeItem 按 id 删除', () => {
    let items = seed(2)
    items = removeClipboardItem(items, items[0].id)
    expect(items).toHaveLength(1)
  })

  it('置顶项恒排最前', () => {
    let items = seed(3)
    items = togglePin(items, items[2].id)
    expect(items[0].text).toBe('text-0') // items[2] 原是 text-0
    expect(items[0].pinned).toBe(true)
  })

  it('clearUnpinned 只保留置顶', () => {
    let items = seed(3)
    items = togglePin(items, items[1].id)
    expect(clearUnpinned(items)).toHaveLength(1)
  })
})

describe('searchClipboard / summarize', () => {
  it('子串搜索大小写不敏感,空关键词返回全部', () => {
    const items = addClipboardItem(addClipboardItem([], 'Hello World', T0), 'git status', T0 + 1)
    expect(searchClipboard(items, 'hello')).toHaveLength(1)
    expect(searchClipboard(items, '')).toHaveLength(2)
  })

  it('摘要压平换行并截断加省略号', () => {
    expect(summarize('a\n  b\tc')).toBe('a b c')
    expect(summarize('x'.repeat(100), 80)).toBe(`${'x'.repeat(80)}…`)
  })
})
