/**
 * 用量历史(core 层,纯函数)。
 * 每次轮询快照记一条(5h/7d 两个窗口的百分比),保留 24 小时,
 * 供展开面板的 sparkline 趋势折线使用。
 *
 * @author ZHANGCHAO 2026/10/06
 */

/** 一条历史样本:时间戳 + 各窗口已用百分比 */
export interface UsageHistoryPoint {
  at: number // epoch ms
  p5h: number
  p7d: number
}

/** 保留窗口:24 小时 */
export const HISTORY_RETENTION_MS = 24 * 60 * 60 * 1000
/** 最小采样间隔:更近的样本替换上一点而非追加(手动刷新连点不会挤花曲线) */
export const MIN_SAMPLE_GAP_MS = 2 * 60 * 1000
/** 点数硬上限(288 + 余量),防御异常膨胀 */
export const MAX_POINTS = 320

/**
 * 追加一条样本:与上一点间隔小于 2 分钟则原地替换;
 * 顺手裁掉超出保留窗口的老点,并兜底截断总点数。
 */
export function appendHistory(points: UsageHistoryPoint[], next: UsageHistoryPoint): UsageHistoryPoint[] {
  const result = [...points]
  const last = result[result.length - 1]
  if (last !== undefined && next.at - last.at < MIN_SAMPLE_GAP_MS) {
    result[result.length - 1] = next
  } else {
    result.push(next)
  }
  const cutoff = next.at - HISTORY_RETENTION_MS
  const kept = result.filter((p) => p.at >= cutoff)
  return kept.length > MAX_POINTS ? kept.slice(kept.length - MAX_POINTS) : kept
}

/** 取某窗口的百分比字段 */
export function valueOf(point: UsageHistoryPoint, key: '5h' | '7d'): number {
  return key === '5h' ? point.p5h : point.p7d
}

/**
 * sparkline 折线的 SVG points 属性值。
 * x 轴:固定 24 小时窗口铺满画布宽(曲线随时间左移,直观);
 * y 轴:0-100% 映射到画布高(留 pad 上下边距)。
 */
export function sparklinePoints(
  points: UsageHistoryPoint[],
  key: '5h' | '7d',
  now: number,
  width: number,
  height: number,
  pad = 2,
): string {
  if (points.length === 0) return ''
  const earliest = now - HISTORY_RETENTION_MS
  const usable = height - pad * 2
  return points
    .map((p) => {
      const x = ((p.at - earliest) / HISTORY_RETENTION_MS) * width
      const y = pad + (1 - Math.min(100, Math.max(0, valueOf(p, key))) / 100) * usable
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}
