/**
 * 用量历史单测:追加/替换/裁剪/截断与折线坐标映射。
 *
 * @author ZHANGCHAO 2026/10/06
 */
import { describe, expect, it } from 'vitest'
import {
  HISTORY_RETENTION_MS,
  MAX_POINTS,
  MIN_SAMPLE_GAP_MS,
  appendHistory,
  sparklinePoints,
  type UsageHistoryPoint,
} from './usageHistory'

const T0 = 1_700_000_000_000
const MIN = 60_000

function point(at: number, p5h: number, p7d = p5h): UsageHistoryPoint {
  return { at, p5h, p7d }
}

describe('appendHistory', () => {
  it('正常追加并保留顺序', () => {
    const result = appendHistory([point(T0, 10)], point(T0 + 5 * MIN, 20))
    expect(result).toHaveLength(2)
    expect(result[1].p5h).toBe(20)
  })

  it('与上一点间隔小于 2 分钟则替换(手动刷新连点不堆点)', () => {
    const result = appendHistory([point(T0, 10), point(T0 + 5 * MIN, 20)], point(T0 + 5 * MIN + 30_000, 25))
    expect(result).toHaveLength(2)
    expect(result[1].p5h).toBe(25)
  })

  it('恰好 2 分钟算新样本(追加)', () => {
    const result = appendHistory([point(T0, 10)], point(T0 + MIN_SAMPLE_GAP_MS, 20))
    expect(result).toHaveLength(2)
  })

  it('裁掉超出 24h 保留窗口的老点', () => {
    // cutoff = 新点时间 - 24h = T0+2min:T0 的点被裁,T0+5min 的点保留
    const result = appendHistory(
      [point(T0, 10), point(T0 + 5 * MIN, 20)],
      point(T0 + HISTORY_RETENTION_MS + 2 * MIN, 30),
    )
    expect(result).toHaveLength(2)
    expect(result[0].p5h).toBe(20)
  })

  it('总点数超过上限时截断到 MAX_POINTS', () => {
    let points: UsageHistoryPoint[] = []
    for (let i = 0; i < MAX_POINTS + 50; i++) {
      points = appendHistory(points, point(T0 + i * 5 * MIN, i))
    }
    expect(points.length).toBeLessThanOrEqual(MAX_POINTS)
    // 保留的是最新的
    expect(points[points.length - 1].p5h).toBe(MAX_POINTS + 49)
  })
})

describe('sparklinePoints', () => {
  it('空历史返回空串', () => {
    expect(sparklinePoints([], '5h', T0, 360, 44)).toBe('')
  })

  it('百分比映射:100% 贴顶(pad),0% 贴底', () => {
    const pts = sparklinePoints([point(T0, 100)], '5h', T0, 100, 44, 2)
    const [, y] = pts.split(',').map(Number)
    expect(y).toBeCloseTo(2, 5)

    const pts0 = sparklinePoints([point(T0, 0)], '5h', T0, 100, 44, 2)
    const [, y0] = pts0.split(',').map(Number)
    expect(y0).toBeCloseTo(42, 5)
  })

  it('时间映射:24h 窗口铺满宽度,最新点接近右缘', () => {
    const now = T0 + HISTORY_RETENTION_MS
    const pts = sparklinePoints([point(T0, 50), point(now, 50)], '5h', now, 100, 44, 2)
    const [x1] = pts.split(' ')[0].split(',').map(Number)
    const [x2] = pts.split(' ')[1].split(',').map(Number)
    expect(x1).toBeCloseTo(0, 1)
    expect(x2).toBeCloseTo(100, 1)
  })

  it('按窗口取值:5h 与 7d 取各自字段', () => {
    const p = point(T0, 30, 60)
    const a = sparklinePoints([p], '5h', T0, 100, 44, 2).split(',').map(Number)
    const b = sparklinePoints([p], '7d', T0, 100, 44, 2).split(',').map(Number)
    expect(a[1]).toBeGreaterThan(b[1]) // 30% 比 60% 更靠下(y 更大)
  })
})
