/**
 * 主题应用(M3 迭代):浅色 / 深色 / 自动。
 *
 * 实现方式:在 <html> 上维护 data-theme 属性,配色全部走 CSS 变量
 * (变量定义在 App.vue 的全局样式块)。auto 模式监听系统深浅色变化,
 * Windows 切换深浅色时灵动岛实时跟随。
 *
 * @author ZHANGCHAO 2026/10/01
 */
import type { ThemeMode } from './appSettings'

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
