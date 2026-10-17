/**
 * 模块布局纯函数单测:规整/可见序列/显隐切换/排序移动的边界行为。
 *
 * @author ZHANGCHAO 2026/10/18
 */
import { describe, expect, it } from 'vitest'
import {
  moveModule,
  normalizeModuleLayout,
  toggleModuleHidden,
  visibleModules,
  type ModuleLayout,
} from './moduleLayout'

const KNOWN = ['usage', 'pomodoro', 'clipboard', 'deepseek'] as const

describe('normalizeModuleLayout', () => {
  it('空/非法数据回落为注册表顺序全可见', () => {
    expect(normalizeModuleLayout(null, KNOWN)).toEqual({ order: [...KNOWN], hidden: [] })
    expect(normalizeModuleLayout({}, KNOWN)).toEqual({ order: [...KNOWN], hidden: [] })
  })

  it('未知模块剔除、缺失模块按注册表顺序补尾', () => {
    const layout = normalizeModuleLayout({ order: ['deepseek', 'ghost', 'usage'] }, KNOWN)
    expect(layout.order).toEqual(['deepseek', 'usage', 'pomodoro', 'clipboard'])
  })

  it('order 内重复项只保留第一次出现', () => {
    const layout = normalizeModuleLayout({ order: ['usage', 'pomodoro', 'usage'] }, KNOWN)
    expect(layout.order).toEqual(['usage', 'pomodoro', 'clipboard', 'deepseek'])
  })

  it('hidden 只保留 order 里存在的模块', () => {
    const layout = normalizeModuleLayout({ order: ['usage'], hidden: ['usage', 'ghost'] }, KNOWN)
    expect(layout.hidden).toEqual(['usage'])
    // usage 被隐藏但 order 补齐后仍有其他可见模块
    expect(visibleModules(layout)).toEqual(['pomodoro', 'clipboard', 'deepseek'])
  })

  it('全部模块被隐藏时重置为全可见', () => {
    const layout = normalizeModuleLayout({ hidden: [...KNOWN] }, KNOWN)
    expect(layout.hidden).toEqual([])
    expect(visibleModules(layout)).toHaveLength(KNOWN.length)
  })
})

describe('visibleModules', () => {
  it('order 剔除 hidden,保持 order 顺序', () => {
    const layout = { order: ['deepseek', 'usage', 'pomodoro', 'clipboard'] as string[], hidden: ['usage'] }
    expect(visibleModules(layout as never)).toEqual(['deepseek', 'pomodoro', 'clipboard'])
  })
})

describe('toggleModuleHidden', () => {
  it('隐藏后重新显示,位置恢复到 order 原位', () => {
    let layout = normalizeModuleLayout({ hidden: ['pomodoro'] }, KNOWN)
    layout = toggleModuleHidden(layout, 'pomodoro')
    expect(layout.hidden).toEqual([])
    expect(layout.order).toEqual([...KNOWN])
  })

  it('隐藏最后一个可见模块被拒绝(原样返回)', () => {
    // 手构单模块布局:normalize 会把缺失模块补齐,测不了「仅剩一个」
    const layout: ModuleLayout = { order: ['usage'], hidden: [] }
    const next = toggleModuleHidden(layout, 'usage')
    expect(next).toBe(layout)
    expect(visibleModules(next)).toEqual(['usage'])
  })

  it('未知模块原样返回', () => {
    const layout = normalizeModuleLayout(null, KNOWN)
    expect(toggleModuleHidden(layout, 'ghost' as never)).toBe(layout)
  })
})

describe('moveModule', () => {
  it('上移/下移交换相邻位置,hidden 跟随不动', () => {
    let layout = normalizeModuleLayout({ hidden: ['pomodoro'] }, KNOWN)
    layout = moveModule(layout, 'clipboard', -1)
    expect(layout.order).toEqual(['usage', 'clipboard', 'pomodoro', 'deepseek'])
    expect(layout.hidden).toEqual(['pomodoro'])
    layout = moveModule(layout, 'deepseek', 1)
    expect(layout.order).toEqual(['usage', 'clipboard', 'pomodoro', 'deepseek'])
  })

  it('边界移动原样返回', () => {
    const layout = normalizeModuleLayout(null, KNOWN)
    expect(moveModule(layout, 'usage', -1)).toBe(layout)
    expect(moveModule(layout, 'deepseek', 1)).toBe(layout)
  })
})
