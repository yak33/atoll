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
