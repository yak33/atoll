/**
 * 贴边折叠纯函数单测:方向判定与折叠矩形。
 *
 * @author ZHANGCHAO 2026/10/06
 */
import { describe, expect, it } from 'vitest'
import { DOCK_LINE_HEIGHT, DOCK_MINI_SIZE, dockedRect, nearestEdge, type Rect } from './edgeDock'

// 工作区:1920×1080 @ (0,0)
const WORK: Rect = { x: 0, y: 0, width: 1920, height: 1080 }
// 药丸:260×44 顶部居中
const PILL: Rect = { x: 830, y: 6, width: 260, height: 44 }

describe('nearestEdge', () => {
  it('顶部居中的药丸判为 top', () => {
    expect(nearestEdge(PILL, WORK)).toBe('top')
  })

  it('靠近底边判为 bottom', () => {
    expect(nearestEdge({ ...PILL, y: 1030 }, WORK)).toBe('bottom')
  })

  it('靠左/靠右分别判为 left/right', () => {
    expect(nearestEdge({ x: 5, y: 500, width: 260, height: 44 }, WORK)).toBe('left')
    expect(nearestEdge({ x: 1650, y: 500, width: 260, height: 44 }, WORK)).toBe('right')
  })

  it('平局按 上>下>左>右', () => {
    // 精确构造四边等距:工作区 1000×1000,窗口 260×44 中心 (500,500)
    const work: Rect = { x: 0, y: 0, width: 1000, height: 1000 }
    const win: Rect = { x: 370, y: 478, width: 260, height: 44 }
    expect(nearestEdge(win, work)).toBe('top')
  })
})

describe('dockedRect', () => {
  it('top:宽度不变,贴工作区顶,高 8', () => {
    const r = dockedRect('top', PILL, WORK)
    expect(r).toEqual({ x: 830, y: 0, width: 260, height: DOCK_LINE_HEIGHT })
  })

  it('bottom:贴工作区底', () => {
    const r = dockedRect('bottom', PILL, WORK)
    expect(r.y).toBe(1080 - DOCK_LINE_HEIGHT)
    expect(r.width).toBe(260)
  })

  it('left/right:缩成 44×44 贴边,纵向位置保留', () => {
    expect(dockedRect('left', PILL, WORK)).toEqual({ x: 0, y: 6, width: DOCK_MINI_SIZE, height: DOCK_MINI_SIZE })
    expect(dockedRect('right', PILL, WORK)).toEqual({
      x: 1920 - DOCK_MINI_SIZE,
      y: 6,
      width: DOCK_MINI_SIZE,
      height: DOCK_MINI_SIZE,
    })
  })

  it('带偏移的多显示器工作区同样正确', () => {
    const work: Rect = { x: -1920, y: 0, width: 1920, height: 1080 }
    const r = dockedRect('right', { x: -1700, y: 100, width: 260, height: 44 }, work)
    expect(r.x).toBe(-44)
    expect(r.y).toBe(100)
  })
})
