/**
 * 顶部居中定位与重置事件检测单测(M2)。
 *
 * @author ZHANGCHAO 2026/10/01
 */
import { describe, expect, it } from 'vitest'
import { topCenterPosition, type MonitorLike } from '../core/windowLayout'
import { detectResetNotifications } from '../core/resetNotify'
import type { ZhipuQuotaSnapshot } from '../types'

describe('topCenterPosition 高分屏换算', () => {
  const baseMonitor: MonitorLike = {
    size: { width: 1920, height: 1080 },
    position: { x: 0, y: 0 },
    scaleFactor: 1,
  }

  it('100% 缩放:逻辑宽即物理宽', () => {
    const pos = topCenterPosition(baseMonitor, 260)
    expect(pos.x).toBe(830) // (1920-260)/2
    expect(pos.y).toBe(6)
  })

  it('150% 缩放:窗口宽按 scale 放大后居中', () => {
    const monitor: MonitorLike = { ...baseMonitor, scaleFactor: 1.5 }
    const pos = topCenterPosition(monitor, 260)
    // 物理宽 390,(1920-390)/2 = 765
    expect(pos.x).toBe(765)
    expect(pos.y).toBe(9) // 6 * 1.5
  })

  it('负坐标多显示器:主屏在左侧屏右边时 x 基于主屏原点', () => {
    const monitor: MonitorLike = { ...baseMonitor, position: { x: -1920, y: 0 } }
    const pos = topCenterPosition(monitor, 260)
    expect(pos.x).toBe(-1920 + 830)
  })
})

function snapshotWith(fiveHour: number, weekly: number, fiveHourReset: string | null = null): ZhipuQuotaSnapshot {
  return {
    planLevel: 'TEST',
    source: 'tokens_limit',
    fetchedAt: '2026-10-01T08:00:00Z',
    windows: [
      { key: '5h', usedPercent: fiveHour, resetAt: fiveHourReset },
      { key: 'weekly', usedPercent: weekly, resetAt: null },
    ],
  }
}

describe('detectResetNotifications', () => {
  const NOW = Date.parse('2026-10-01T08:00:00Z')

  it('原告警档(>=75)回落到低位 → 提示 5h 重置', () => {
    const old = snapshotWith(91, 30)
    const fresh = snapshotWith(3, 30)
    const messages = detectResetNotifications(old, fresh, NOW)

    expect(messages).toEqual(['5h 窗口已重置,当前 3%'])
  })

  it('重置时间已过且用量下降 → 提示(周窗口跨 resetAt 场景)', () => {
    const past = '2026-10-01T07:00:00Z'
    const old = snapshotWith(60, 40, past)
    const fresh = snapshotWith(10, 22, past)
    const messages = detectResetNotifications(old, fresh, NOW)

    expect(messages).toEqual(['5h 窗口已重置,当前 10%'])
  })

  it('用量未越阈值且未到重置时间 → 无提示', () => {
    const future = '2026-10-01T12:00:00Z'
    const old = snapshotWith(50, 20, future)
    const fresh = snapshotWith(60, 25, future)

    expect(detectResetNotifications(old, fresh, NOW)).toEqual([])
  })

  it('首份快照(无旧数据)不提示,避免启动噪音', () => {
    const fresh = snapshotWith(3, 30)
    expect(detectResetNotifications(null, fresh, NOW)).toEqual([])
  })

  it('用量上升不提示(只有回落才是重置)', () => {
    const old = snapshotWith(70, 20)
    const fresh = snapshotWith(80, 25)

    expect(detectResetNotifications(old, fresh, NOW)).toEqual([])
  })
})
