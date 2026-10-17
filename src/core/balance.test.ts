/**
 * DeepSeek 余额 core 层单测:格式化/分级/设置归一化/趋势采样/消耗速率粗估。
 *
 * @author ZHANGCHAO 2026/10/18
 */
import { describe, expect, it } from 'vitest'
import {
  BALANCE_MAX_POINTS,
  BALANCE_RETENTION_MS,
  appendBalancePoint,
  balanceLevel,
  balanceSparklinePoints,
  estimateBalanceDays,
  formatBalanceAmount,
  formatBalanceEstimate,
  normalizeDeepSeekSettings,
  pickBalance,
  type BalancePoint,
} from './balance'
import type { DeepSeekBalanceInfo } from '../types'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const NOW = Date.parse('2026-10-18T12:00:00Z')

function info(overrides: Partial<DeepSeekBalanceInfo> = {}): DeepSeekBalanceInfo {
  return {
    currency: 'CNY',
    totalBalance: '128.50',
    grantedBalance: '28.50',
    toppedUpBalance: '100.00',
    ...overrides,
  }
}

function point(at: number, total: number): BalancePoint {
  return { at, total }
}

describe('formatBalanceAmount', () => {
  it('人民币/美元加符号与千分位,固定两位小数', () => {
    expect(formatBalanceAmount('1234.5', 'CNY')).toBe('¥1,234.50')
    expect(formatBalanceAmount('12', 'USD')).toBe('$12.00')
  })

  it('未知币种用「金额 + 币种码」展示', () => {
    expect(formatBalanceAmount('12.34', 'EUR')).toBe('12.34 EUR')
  })

  it('无法解析的金额原样返回,不让脏数据崩 UI', () => {
    expect(formatBalanceAmount('N/A', 'CNY')).toBe('N/A')
  })
})

describe('pickBalance', () => {
  const balances = [info({ currency: 'USD', totalBalance: '12.00' }), info()]

  it('按配置币种精确匹配(大小写不敏感)', () => {
    expect(pickBalance(balances, 'cny')?.totalBalance).toBe('128.50')
  })

  it('配置币种不存在时回落第一条', () => {
    expect(pickBalance(balances, 'USD')?.currency).toBe('USD')
  })

  it('空列表返回 null', () => {
    expect(pickBalance([], 'CNY')).toBeNull()
  })
})

describe('balanceLevel', () => {
  const alerts = { warnBelow: 20, criticalBelow: 5 }

  it('按金额分级,临界值算到更差的一档', () => {
    expect(balanceLevel(100, alerts)).toBe('normal')
    expect(balanceLevel(21, alerts)).toBe('normal')
    expect(balanceLevel(20, alerts)).toBe('warn')
    expect(balanceLevel(5, alerts)).toBe('critical')
    expect(balanceLevel(4.99, alerts)).toBe('critical')
    expect(balanceLevel(0, alerts)).toBe('critical')
  })

  it('非法数值不误报', () => {
    expect(balanceLevel(Number.NaN, alerts)).toBe('normal')
  })
})

describe('normalizeDeepSeekSettings', () => {
  it('缺字段回落默认,币种只认 CNY/USD', () => {
    expect(normalizeDeepSeekSettings({})).toEqual({ currency: 'CNY', warnBelow: 20, criticalBelow: 5 })
    expect(normalizeDeepSeekSettings({ currency: 'EUR' as never }).currency).toBe('CNY')
    expect(normalizeDeepSeekSettings({ currency: 'USD' }).currency).toBe('USD')
  })

  it('阈值钳制进 [0, 1e6],critical 不得高于 warn', () => {
    expect(normalizeDeepSeekSettings({ warnBelow: -5, criticalBelow: 999999999 }).warnBelow).toBe(0)
    expect(normalizeDeepSeekSettings({ warnBelow: 10, criticalBelow: 50 })).toEqual({
      currency: 'CNY',
      warnBelow: 10,
      criticalBelow: 10,
    })
  })
})

describe('appendBalancePoint', () => {
  it('正常追加并裁掉 24h 外的老点', () => {
    const old = point(NOW - BALANCE_RETENTION_MS - HOUR, 100)
    const points = appendBalancePoint([old, point(NOW - HOUR, 90)], point(NOW, 80))

    expect(points.map((item) => item.total)).toEqual([90, 80])
  })

  it('间隔小于 5 分钟时替换上一点(手动刷新不挤花曲线)', () => {
    const points = appendBalancePoint([point(NOW - DAY, 100), point(NOW - 60_000, 90)], point(NOW, 80))

    expect(points).toHaveLength(2)
    expect(points[1].total).toBe(80)
  })

  it('点数超过硬上限时保留最新的一段', () => {
    const many: BalancePoint[] = Array.from({ length: BALANCE_MAX_POINTS + 10 }, (_, index) =>
      point(NOW - (BALANCE_MAX_POINTS + 10 - index) * 5 * 60_000, 100 + index),
    )
    const points = appendBalancePoint(many, point(NOW, 999))

    expect(points.length).toBeLessThanOrEqual(BALANCE_MAX_POINTS)
    expect(points[points.length - 1].total).toBe(999)
  })

  it('非法采样点被忽略', () => {
    const current = [point(NOW - HOUR, 100)]
    expect(appendBalancePoint(current, point(Number.NaN, 90))).toBe(current)
  })
})

describe('estimateBalanceDays', () => {
  it('24h 下降 10 元、剩余 90 元 → 约 9 天', () => {
    const days = estimateBalanceDays([point(NOW - DAY, 100), point(NOW, 90)], NOW)

    expect(days).toBeCloseTo(9, 5)
  })

  it('中途充值/赠金到账时以那次为新基线', () => {
    const points = [
      point(NOW - DAY - 2 * HOUR, 100),
      point(NOW - DAY, 80),
      point(NOW - HOUR, 130), // 充值 50
      point(NOW, 120), // 从 130 消耗 10
    ]

    // 基线 = NOW-HOUR 的 130;1 小时内下降 10 → 日耗 240,120/240 = 0.5 天
    expect(estimateBalanceDays(points, NOW)).toBeCloseTo(0.5, 5)
  })

  it('余额未下降/只有单点/跨度太短 → null', () => {
    expect(estimateBalanceDays([point(NOW - DAY, 100), point(NOW, 120)], NOW)).toBeNull()
    expect(estimateBalanceDays([point(NOW, 100)], NOW)).toBeNull()
    expect(estimateBalanceDays([point(NOW - 10 * 60_000, 100), point(NOW, 90)], NOW)).toBeNull()
  })

  it('余额已归零 → null', () => {
    expect(estimateBalanceDays([point(NOW - DAY, 10), point(NOW, 0)], NOW)).toBeNull()
  })

  it('超过一年才耗尽视为「没在消耗」→ null', () => {
    expect(estimateBalanceDays([point(NOW - DAY, 10_000), point(NOW, 9_999)], NOW)).toBeNull()
  })
})

describe('formatBalanceEstimate', () => {
  it('小时/天两档文案', () => {
    expect(formatBalanceEstimate(0.5)).toContain('12 小时')
    expect(formatBalanceEstimate(3.26)).toContain('3.3 天')
  })

  it('不可信返回空串', () => {
    expect(formatBalanceEstimate(null)).toBe('')
    expect(formatBalanceEstimate(Number.POSITIVE_INFINITY)).toBe('')
  })
})

describe('balanceSparklinePoints', () => {
  it('生成与样本数一致的坐标点,y 落在画布范围内', () => {
    const points = [point(NOW - 2 * HOUR, 100), point(NOW - HOUR, 50), point(NOW, 80)]
    const text = balanceSparklinePoints(points, NOW, 360, 44)
    const coords = text.split(' ').map((pair) => pair.split(',').map(Number))

    expect(coords).toHaveLength(3)
    for (const [, y] of coords) {
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(44)
    }
  })

  it('单点与空数组不抛错', () => {
    expect(balanceSparklinePoints([point(NOW, 100)], NOW, 360, 44)).not.toBe('')
    expect(balanceSparklinePoints([], NOW, 360, 44)).toBe('')
  })
})
