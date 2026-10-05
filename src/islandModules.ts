/**
 * 灵动岛模块注册表(容器层)。
 * 新模块在此登记一条:显示名、药丸/面板组件、展开态尺寸;
 * App.vue 的动态挂载、滚轮环形切换、设置面板 Tab 全部由这张表驱动。
 * 各模块的 props 接线仍集中在 App.vue(pillProps/panelProps computed)——
 * 那是数据映射不是结构分支,新模块在注册表加一条 + 接线处加一个分支即可。
 *
 * @author ZHANGCHAO 2026/10/06
 */
import type { Component } from 'vue'
import { LogicalSize } from '@tauri-apps/api/window'
import type { IslandModule } from './core/appSettings'
import IslandPill from './components/IslandPill.vue'
import ExpandedPanel from './components/ExpandedPanel.vue'
import PomodoroPill from './components/PomodoroPill.vue'
import PomodoroPanel from './components/PomodoroPanel.vue'

export interface IslandModuleDefinition {
  id: IslandModule
  /** Tab 显示名 */
  label: string
  /** 收起态药丸组件(事件契约:click / mouseenter / wheel) */
  pill: Component
  /** 展开态面板组件(事件契约:mouseenter / mouseleave / dragstart / switchModule) */
  panel: Component
  /** 展开态窗口尺寸;pillWidth 为用户配置的药丸宽度(逻辑像素) */
  expandedSize: (pillWidth: number) => LogicalSize
}

/** 数组顺序即滚轮切换的环形顺序 */
export const ISLAND_MODULES: IslandModuleDefinition[] = [
  {
    id: 'usage',
    label: '用量',
    pill: IslandPill,
    panel: ExpandedPanel,
    // 宽度至少 400 且跟随药丸,避免展开反而比药丸窄;高度含 24h 趋势图
    expandedSize: (pillWidth) => new LogicalSize(Math.max(400, pillWidth), 265),
  },
  {
    id: 'pomodoro',
    label: '番茄',
    pill: PomodoroPill,
    panel: PomodoroPanel,
    // 内容少,固定小尺寸
    expandedSize: () => new LogicalSize(280, 250),
  },
]
