/**
 * 主题应用(M3 迭代):浅色 / 深色 / 自动。
 *
 * 实现方式:在 <html> 上维护 data-theme 属性,配色全部走 CSS 变量
 * (变量定义在 App.vue 的全局样式块)。auto 模式监听系统深浅色变化,
 * Windows 切换深浅色时灵动岛实时跟随。
 *
 * @author ZHANGCHAO 2026/10/01
 */
import type { ThemeMode, SkinTheme } from './appSettings'

/** 皮肤主题选项定义(设置面板与样式层共用) */
export interface SkinOption {
  value: SkinTheme
  label: string
  previewColor: string
}

export const SKIN_OPTIONS: SkinOption[] = [
  { value: 'obsidian', label: '黑曜石', previewColor: '#22c55e' },
  { value: 'midnight', label: '深海蓝', previewColor: '#0ea5e9' },
  { value: 'aurora', label: '极光紫', previewColor: '#a855f7' },
  { value: 'sunset', label: '赤焰橙', previewColor: '#f97316' },
  { value: 'forest', label: '薄荷绿', previewColor: '#10b981' },
  { value: 'cyber', label: '钛金金', previewColor: '#eab308' },
]

/** 切换胶囊皮肤主题(设置面板即时生效,持久化由外观配置负责) */
export function setSkin(skin: SkinTheme): void {
  document.documentElement.dataset.skin = skin
}

let currentMode: ThemeMode = 'auto'
let mediaQuery: MediaQueryList | null = null

function resolveAndApply(): void {
  // matchMedia 拿不到时按深色处理(保持项目默认观感)
  const prefersDark = mediaQuery?.matches ?? true
  const effective = currentMode === 'auto' ? (prefersDark ? 'dark' : 'light') : currentMode
  document.documentElement.dataset.theme = effective
}

/**
 * 应用主题并开始监听系统深浅变化。
 * 返回清理函数(组件卸载时移除监听)。
 */
export function initTheme(mode: ThemeMode): () => void {
  currentMode = mode
  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const listener = () => resolveAndApply()
  mediaQuery.addEventListener('change', listener)
  resolveAndApply()
  return () => {
    mediaQuery?.removeEventListener('change', listener)
  }
}

/** 切换主题模式(设置面板即时生效,持久化由调用方负责) */
export function setThemeMode(mode: ThemeMode): void {
  currentMode = mode
  resolveAndApply()
}
