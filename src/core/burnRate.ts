/**
 * 用量消耗速率预测(core 层,纯函数)。
 * 基于相邻两次轮询快照的百分点差计算斜率,粗估「按当前速度多久耗尽」。
 * 5 分钟轮询粒度 + 编码活动非线性,结果天然是粗估——展示文案必须带「预计」。
 *
 * @author ZHANGCHAO 2026/10/05
 */

/** 一次可参与计算的样本:时间戳 + 某窗口的已用百分比 */
export interface BurnSample {
  at: number
  usedPercent: number
}

/**
 * 估算到 100% 的小时数;不可信时返回 null:
 * 时间倒流/相同、斜率 ≤ 0(消耗停滞或窗口重置回退)、已达 100%。
 */
export function estimateHoursToLimit(prev: BurnSample, curr: BurnSample): number | null {
  if (curr.at <= prev.at) return null
  const elapsedMs = curr.at - prev.at
  const slope = (curr.usedPercent - prev.usedPercent) / elapsedMs // 百分点 / ms
  if (slope <= 0) return null
  const remainPercent = 100 - curr.usedPercent
  if (remainPercent <= 0) return null
  return remainPercent / slope / 3_600_000
}

/** 预测文案:小时/分钟两档;不可信返回空串(UI 不渲染) */
export function formatBurnEstimate(hours: number | null): string {
  if (hours === null || !Number.isFinite(hours)) return ''
  if (hours < 1) {
    const minutes = Math.max(1, Math.round(hours * 60))
    return `按当前速度预计 ${minutes} 分钟后耗尽`
  }
  // 超过 48h 的粗估已无参考意义,同样不显示
  if (hours > 48) return ''
  const rounded = hours < 10 ? Math.round(hours * 10) / 10 : Math.round(hours)
  return `按当前速度预计 ${rounded} 小时后耗尽`
}
