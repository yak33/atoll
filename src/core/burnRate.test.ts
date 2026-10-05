/**
 * 消耗速率预测单测:斜率计算、边界丢弃、文案格式化。
 *
 * @author ZHANGCHAO 2026/10/05
 */
import { describe, expect, it } from 'vitest'
import { estimateHoursToLimit, formatBurnEstimate } from './burnRate'

const MIN = 60_000

describe('estimateHoursToLimit', () => {
  it('30 分钟从 40% 涨到 50%:剩 50 点,预计 2.5 小时', () => {
    const h = estimateHoursToLimit({ at: 0, usedPercent: 40 }, { at: 30 * MIN, usedPercent: 50 })
    expect(h).toBeCloseTo(2.5, 5)
  })

  it('斜率为负(窗口重置回退)返回 null', () => {
    expect(estimateHoursToLimit({ at: 0, usedPercent: 80 }, { at: 5 * MIN, usedPercent: 20 })).toBeNull()
  })

  it('消耗停滞(斜率 0)返回 null', () => {
    expect(estimateHoursToLimit({ at: 0, usedPercent: 40 }, { at: 5 * MIN, usedPercent: 40 })).toBeNull()
  })

  it('时间倒流或相同返回 null', () => {
    expect(estimateHoursToLimit({ at: 100, usedPercent: 40 }, { at: 100, usedPercent: 50 })).toBeNull()
    expect(estimateHoursToLimit({ at: 200, usedPercent: 40 }, { at: 100, usedPercent: 50 })).toBeNull()
  })

  it('已到 100% 返回 null', () => {
    expect(estimateHoursToLimit({ at: 0, usedPercent: 95 }, { at: 5 * MIN, usedPercent: 100 })).toBeNull()
  })
})

describe('formatBurnEstimate', () => {
  it('不足 1 小时显示分钟,最少 1 分钟', () => {
    expect(formatBurnEstimate(0.5)).toBe('按当前速度预计 30 分钟后耗尽')
    expect(formatBurnEstimate(0.005)).toBe('按当前速度预计 1 分钟后耗尽')
  })

  it('1~10 小时保留一位小数,以上取整', () => {
    expect(formatBurnEstimate(2.5)).toBe('按当前速度预计 2.5 小时后耗尽')
    expect(formatBurnEstimate(12.4)).toBe('按当前速度预计 12 小时后耗尽')
  })

  it('null 或超过 48 小时返回空串', () => {
    expect(formatBurnEstimate(null)).toBe('')
    expect(formatBurnEstimate(100)).toBe('')
  })
})
