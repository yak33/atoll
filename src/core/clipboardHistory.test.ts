/**
 * 剪贴板历史单测:去重置顶/上限淘汰/置顶排序/搜索/摘要。
 *
 * @author ZHANGCHAO 2026/10/06
 */
import { describe, expect, it } from 'vitest'
import {
  MAX_ITEMS,
  MAX_TEXT_LENGTH,
  addClipboardImageItem,
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

  it('新复制内容不会挤下已置顶条目;置顶项恒排在最前', () => {
    let items = seed(2)
    items = togglePin(items, items[1].id) // text-0 置顶
    expect(items[0].text).toBe('text-0')
    expect(items[0].pinned).toBe(true)

    // 新复制一段内容
    items = addClipboardItem(items, 'new-text', T0 + 9999)
    // 置顶项仍在第 0 位,新文本排在其后
    expect(items[0].text).toBe('text-0')
    expect(items[0].pinned).toBe(true)
    expect(items[1].text).toBe('new-text')
    expect(items[1].pinned).toBe(false)

    // 重新复制未置顶条目 text-1
    items = addClipboardItem(items, 'text-1', T0 + 10000)
    expect(items[0].text).toBe('text-0')
    expect(items[1].text).toBe('text-1')
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

describe('addClipboardImageItem', () => {
  it('支持插入图片条目,保留宽高等元信息', () => {
    const items = addClipboardImageItem(
      [],
      {
        path: 'C:\\path\\clip_1.png',
        dataUrl: 'data:image/png;base64,abc',
        width: 1920,
        height: 1080,
      },
      T0,
    )
    expect(items).toHaveLength(1)
    expect(items[0].kind).toBe('image')
    expect(items[0].imagePath).toBe('C:\\path\\clip_1.png')
    expect(items[0].width).toBe(1920)
    expect(items[0].height).toBe(1080)
    expect(items[0].text).toBe('[图片] 1920×1080')
  })

  it('相同图片路径去重并更新时间', () => {
    let items = addClipboardImageItem(
      [],
      {
        path: 'C:\\path\\clip_1.png',
        dataUrl: 'data:image/png;base64,abc',
        width: 800,
        height: 600,
      },
      T0,
    )
    items = addClipboardImageItem(
      items,
      {
        path: 'C:\\path\\clip_1.png',
        dataUrl: 'data:image/png;base64,abc',
        width: 800,
        height: 600,
      },
      T0 + 5000,
    )
    expect(items).toHaveLength(1)
    expect(items[0].copiedAt).toBe(T0 + 5000)
  })
})
