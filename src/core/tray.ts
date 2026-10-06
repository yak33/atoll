/**
 * Windows 系统托盘 Tooltip 同步。
 * 错误一律静默,绝不影响主流程。
 *
 * @author ZHANGCHAO 2026/10/02
 */
import { invoke } from '@tauri-apps/api/core'

let lastTooltip = ''

export async function updateTrayTooltip(tooltip: string): Promise<void> {
  const text = tooltip.trim()
  if (text === '' || text === lastTooltip) return
  lastTooltip = text
  try {
    await invoke('set_tray_tooltip', { tooltip: text })
  } catch {
    // 托盘更新失败不影响主流程
  }
}

/** 显示/隐藏托盘图标(设置面板「显示托盘图标」开关用);失败静默 */
export async function setTrayVisible(visible: boolean): Promise<void> {
  try {
    await invoke('set_tray_visible', { visible })
  } catch {
    // 托盘操作失败不影响主流程
  }
}

/** 退出应用(托盘被隐藏后的兜底退出入口);失败静默 */
export async function quitApp(): Promise<void> {
  try {
    await invoke('quit_app')
  } catch {
    // 退出失败无后续动作可言
  }
}
