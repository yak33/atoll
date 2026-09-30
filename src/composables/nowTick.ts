/**
 * 应用级单例时钟(60 秒一跳)。
 * 倒计时与「X 分钟前」统一从这里取时间,纯本地计算,不产生网络请求。
 * 模块级 setInterval 随应用生命周期存在,组件无需各自起定时器。
 *
 * @author ZHANGCHAO 2026/10/01
 */
import { ref } from 'vue'

export const nowTick = ref(Date.now())

window.setInterval(() => {
  nowTick.value = Date.now()
}, 60_000)

/** 倒计时格式化:14m / 2h 15m / 3d 9h;resetAt 已过期但仍有用量 →「待刷新」 */
export function formatReset(iso: string): string {
  const diffMs = Date.parse(iso) - nowTick.value
  if (diffMs <= 0) return '待刷新'
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ${minutes % 60}m`
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}

/** 剩余不足 5 分钟 → 倒计时高亮(PRD §4.3) */
export function resetUrgent(iso: string): boolean {
  const diffMs = Date.parse(iso) - nowTick.value
  return diffMs > 0 && diffMs < 5 * 60 * 1000
}
