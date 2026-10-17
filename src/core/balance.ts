/**
 * DeepSeek 余额模块 core 层(纯函数)。
 *
 * DeepSeek 只有钱包余额(总可用 / 充值 / 未过期赠金),没有智谱那样的滚动窗口;
 * 因此这里围绕「金额」做展示格式化、低余额分级、余额趋势与消耗速率粗估。
 * 金额在持久化与组件间传递时一律保留字符串,只有计算趋势/速率时才转 Number。
 *
 * @author ZHANGCHAO 2026/10/18
 */
import type { DeepSeekBalanceInfo } from '../types'

/** 主币种:DeepSeek 官方余额接口目前只返回 CNY / USD */
export type BalanceCurrency = 'CNY' | 'USD'

/** 低余额阈值(主币种金额,达到/低于即升级配色) */
export interface BalanceAlerts {
  /** 低于该金额转琥珀 */
  warnBelow: number
  /** 低于该金额转红色 */
  criticalBelow: number
}

export const DEFAULT_BALANCE_ALERTS: BalanceAlerts = { warnBelow: 20, criticalBelow: 5 }

/** DeepSeek 余额模块设置:显示币种 + 低余额阈值 */
export interface DeepSeekSettings extends BalanceAlerts {
  currency: BalanceCurrency
}

export const DEFAULT_DEEPSEEK_SETTINGS: DeepSeekSettings = {
  currency: 'CNY',
  ...DEFAULT_BALANCE_ALERTS,
}

/** 余额告警等级:normal = 健康,warn = 琥珀,critical = 红色 */
export type BalanceLevel = 'normal' | 'warn' | 'critical'

const CURRENCY_SYMBOLS: Record<string, string> = { CNY: '¥', USD: '$' }

const MIN_THRESHOLD = 0
const MAX_THRESHOLD = 1_000_000

function clampThreshold(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const clamped = Math.min(MAX_THRESHOLD, Math.max(MIN_THRESHOLD, value))
  return Math.round(clamped * 100) / 100
}

/**
 * 读取/保存设置时统一走这里:币种只认 CNY/USD,阈值钳制进合理区间;
 * 余额是「越低越糟」,critical 必须不大于 warn(用户把 critical 拖高时压回 warn)。
 */
export function normalizeDeepSeekSettings(raw: Partial<DeepSeekSettings> | null | undefined): DeepSeekSettings {
  const currency: BalanceCurrency = raw?.currency === 'USD' ? 'USD' : 'CNY'
  const warnBelow = clampThreshold(raw?.warnBelow, DEFAULT_DEEPSEEK_SETTINGS.warnBelow)
  const criticalBelow = clampThreshold(raw?.criticalBelow, DEFAULT_DEEPSEEK_SETTINGS.criticalBelow)
  return { currency, warnBelow, criticalBelow: Math.min(criticalBelow, warnBelow) }
}

/** 从多币种余额里取主币种;配置币种不存在时回落第一条(账号只有一种币种是常态) */
export function pickBalance(balances: DeepSeekBalanceInfo[], currency: string): DeepSeekBalanceInfo | null {
  const wanted = currency.trim().toUpperCase()
  return balances.find((item) => item.currency.toUpperCase() === wanted) ?? balances[0] ?? null
}

/** 金额格式化:千分位 + 两位小数 + 币种符号;无法解析时原样展示(不让脏数据把 UI 弄崩) */
export function formatBalanceAmount(amount: string, currency: string): string {
  const value = Number(amount)
  if (!Number.isFinite(value)) return amount

  const [integerPart, decimalPart] = Math.abs(value).toFixed(2).split('.')
  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const sign = value < 0 ? '-' : ''
  const text = `${sign}${grouped}.${decimalPart}`
  const symbol = CURRENCY_SYMBOLS[currency.trim().toUpperCase()]
  return symbol !== undefined ? `${symbol}${text}` : `${text} ${currency.trim().toUpperCase()}`
}

/** 余额分级:<= critical 红,<= warn 琥珀,其余正常 */
export function balanceLevel(total: number, alerts: BalanceAlerts): BalanceLevel {
  if (!Number.isFinite(total)) return 'normal'
  if (total <= alerts.criticalBelow) return 'critical'
  if (total <= alerts.warnBelow) return 'warn'
  return 'normal'
}

// ===== 余额趋势(24h,按币种各自一条序列) =====

/** 一条余额采样:时刻 + 该币种总可用余额 */
export interface BalancePoint {
  at: number // epoch ms
  total: number
}

/** 保留窗口:24 小时(与用量趋势一致) */
export const BALANCE_RETENTION_MS = 24 * 60 * 60 * 1000
/** 最小采样间隔:更近的样本替换上一点(手动刷新连点不会挤花曲线) */
export const BALANCE_MIN_SAMPLE_GAP_MS = 5 * 60 * 1000
/** 点数硬上限(10 分钟轮询一天 144 点 + 手动刷新余量) */
export const BALANCE_MAX_POINTS = 200

/**
 * 追加一条余额采样:
 * - 与上一点间隔小于 5 分钟则原地替换;
 * - 裁掉超出 24h 保留窗口与非法数值的点;
 * - 兜底截断总点数。
 */
export function appendBalancePoint(points: BalancePoint[], next: BalancePoint): BalancePoint[] {
  if (!Number.isFinite(next.at) || !Number.isFinite(next.total)) return points

  const result = [...points]
  const last = result[result.length - 1]
  if (last !== undefined && next.at - last.at < BALANCE_MIN_SAMPLE_GAP_MS) {
    result[result.length - 1] = next
  } else {
    result.push(next)
  }
  const cutoff = next.at - BALANCE_RETENTION_MS
  const kept = result.filter((point) => point.at >= cutoff && Number.isFinite(point.total))
  return kept.length > BALANCE_MAX_POINTS ? kept.slice(kept.length - BALANCE_MAX_POINTS) : kept
}

/** 相邻样本的最小可信跨度:低于该跨度时余额差值太小,斜率没意义 */
const MIN_BURN_SPAN_MS = 30 * 60 * 1000
/** 超过一年才耗尽等于「没在消耗」,不展示,避免天文数字 */
const MAX_ESTIMATE_DAYS = 365

/**
 * 按余额下降速度粗估「还能用多少天」,不可信时返回 null:
 * - 余额中途上升(充值/赠金到账)时以那次为新基线,不和消耗混在一起算;
 * - 样本跨度太短、余额未下降、已经没有余额、结果超过一年 → null。
 *
 * 注意:赠金过期也会让余额下降,和真实消耗无法从余额接口区分;
 * 展示文案是「按当前速度预计」,只作粗估参考。
 */
export function estimateBalanceDays(points: BalancePoint[], now: number): number | null {
  const cutoff = now - BALANCE_RETENTION_MS
  const recent = points
    .filter((point) => point.at >= cutoff && Number.isFinite(point.at) && Number.isFinite(point.total))
    .sort((a, b) => a.at - b.at)
  if (recent.length < 2) return null

  // 正向扫描:余额一旦上升(充值/赠金到账),后续消耗从新基线算起
  let baseline = recent[0]
  for (const point of recent.slice(1)) {
    if (point.total > baseline.total) baseline = point
  }

  const last = recent[recent.length - 1]
  const elapsedMs = last.at - baseline.at
  if (elapsedMs < MIN_BURN_SPAN_MS) return null

  const spent = baseline.total - last.total
  if (spent <= 0 || last.total <= 0) return null

  const dailyBurn = (spent / elapsedMs) * 24 * 60 * 60 * 1000
  const days = last.total / dailyBurn
  if (!Number.isFinite(days) || days <= 0 || days > MAX_ESTIMATE_DAYS) return null
  return days
}

/** 预估文案:小时/天两档;不可信返回空串(UI 不渲染) */
export function formatBalanceEstimate(days: number | null): string {
  if (days === null || !Number.isFinite(days)) return ''
  if (days < 1) {
    const hours = Math.max(1, Math.round(days * 24))
    return `按当前速度预计 ${hours} 小时后余额耗尽`
  }
  const rounded = days < 10 ? Math.round(days * 10) / 10 : Math.round(days)
  return `按当前速度预计 ${rounded} 天后余额耗尽`
}

/**
 * 余额 sparkline 的 SVG points 属性值。
 * x 轴:固定 24 小时窗口铺满画布宽(曲线随时间左移);
 * y 轴:按样本自身 min/max 自适应(余额不像百分比有固定 0~100 标尺),
 *      单点或全平等数据画中线,避免除零。
 */
export function balanceSparklinePoints(
  points: BalancePoint[],
  now: number,
  width: number,
  height: number,
  pad = 2,
): string {
  const cutoff = now - BALANCE_RETENTION_MS
  const recent = points
    .filter((point) => point.at >= cutoff && Number.isFinite(point.at) && Number.isFinite(point.total))
    .sort((a, b) => a.at - b.at)
  if (recent.length === 0) return ''

  const totals = recent.map((point) => point.total)
  const min = Math.min(...totals)
  const max = Math.max(...totals)
  const range = max - min
  const usable = height - pad * 2

  return recent
    .map((point) => {
      const x = ((point.at - cutoff) / BALANCE_RETENTION_MS) * width
      const ratio = range === 0 ? 0.5 : (point.total - min) / range
      const y = pad + (1 - ratio) * usable
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}
