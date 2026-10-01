/**
 * 药丸偶发光效触发器(composable)。
 * 每 8~18s 从动作池随机播一种光效(CSS 类 do-*),不连续重复;
 * 动作池通过 getter 传入,设置面板改动光效种类后无需重建定时器。
 * 两种药丸(用量/番茄钟)共用,池子为空或系统开「减少动态效果」时不启动。
 *
 * @author ZHANGCHAO 2026/10/01
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { Ref } from 'vue'
import type { GlowEffect } from '../core/appSettings'

export function useGlowEffects(pool: () => GlowEffect[]): { actionName: Ref<GlowEffect | ''> } {
  const actionName = ref<GlowEffect | ''>('')
  let nextActionTimer = 0
  let clearActionTimer = 0
  let lastAction: GlowEffect | '' = ''

  function playRandomAction(): void {
    const current = pool()
    if (current.length === 0) return
    // 先过滤掉上一次的动作再随机取:不依赖上游对池子去重的保证
    const candidates = current.length > 1 ? current.filter((effect) => effect !== lastAction) : current
    const next = candidates[Math.floor(Math.random() * candidates.length)]
    lastAction = next
    actionName.value = next
    // 2300ms 大于最长动画时长(flow/dual 2.2s),到点摘 class 复位
    clearActionTimer = window.setTimeout(() => {
      actionName.value = ''
    }, 2300)
  }

  function scheduleNextAction(delayMs: number): void {
    nextActionTimer = window.setTimeout(() => {
      playRandomAction()
      scheduleNextAction(8000 + Math.random() * 10000)
    }, delayMs)
  }

  onMounted(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (pool().length > 0 && !reduceMotion) {
      scheduleNextAction(6000 + Math.random() * 6000)
    }
  })

  onBeforeUnmount(() => {
    window.clearTimeout(nextActionTimer)
    window.clearTimeout(clearActionTimer)
  })

  return { actionName }
}
