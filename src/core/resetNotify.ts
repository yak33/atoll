/**
 * 窗口重置事件检测(M2)。
 * 比较前后两份快照,识别「滚动窗口已重置」并产出 toast 文案。
 * 纯函数,可单测。
 *
 * @author ZHANGCHAO 2026/10/01
 */
import type { ZhipuQuotaSnapshot } from '../types'

/** 重置探测分界:固定 75,刻意不跟随用户可配的告警阈值(warnAt)——
 *  「从高位骤降」是物理事实,与「用户想被提醒的分寸」是两回事,解耦最稳 */
const ALERT_THRESHOLD = 75

function windowLabel(key: string): string {
  return key === 'weekly' ? '7d' : '5h'
}

/**
 * 判定条件(满足其一即认为该窗口发生了重置):
 * 1. 原告警档(>=75%)回落到低位 —— 典型的 5h 窗口滚动清零
 * 2. 旧快照的重置时间已过 且 用量下降 —— 周窗口跨过 resetAt 的场景
 */
export function detectResetNotifications(
  oldSnap: ZhipuQuotaSnapshot | null,
  newSnap: ZhipuQuotaSnapshot,
  nowMs: number,
): string[] {
  if (oldSnap === null) return []

  const messages: string[] = []
  for (const win of newSnap.windows) {
    const prev = oldSnap.windows.find((item) => item.key === win.key)
    if (prev === undefined) continue

    const droppedFromAlert = prev.usedPercent >= ALERT_THRESHOLD && win.usedPercent < ALERT_THRESHOLD
    const resetPassed = prev.resetAt !== null && Date.parse(prev.resetAt) <= nowMs
    if (droppedFromAlert || (resetPassed && win.usedPercent < prev.usedPercent)) {
      messages.push(`${windowLabel(win.key)} 窗口已重置,当前 ${Math.round(win.usedPercent)}%`)
    }
  }
  return messages
}
