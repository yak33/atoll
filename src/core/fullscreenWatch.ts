/**
 * 全屏应用自动隐藏(M3)。
 * 每 3 秒询问 Rust 侧前台窗口是否全屏;全屏则隐藏灵动岛,退出全屏恢复。
 * 用户经托盘手动隐藏时不参与恢复,避免两边打架。
 *
 * @author ZHANGCHAO 2026/10/01
 */
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'

const win = getCurrentWindow()
const POLL_INTERVAL_MS = 3000

export interface FullscreenWatchOptions {
  /** 托盘手动隐藏时返回 true;此时全屏恢复逻辑不展示窗口 */
  isManuallyHidden: () => boolean
}

export function startFullscreenWatch(options: FullscreenWatchOptions): () => void {
  let hiddenByFullscreen = false
  let stopped = false

  async function poll(): Promise<void> {
    let fullscreen = false
    try {
      fullscreen = await invoke<boolean>('is_foreground_fullscreen')
    } catch {
      // 查询失败(如命令未注册)保持现状
      return
    }
    if (stopped) return

    const manuallyHidden = options.isManuallyHidden()
    if (fullscreen && !hiddenByFullscreen && !manuallyHidden) {
      hiddenByFullscreen = true
      await win.hide()
    } else if (!fullscreen && hiddenByFullscreen && !manuallyHidden) {
      hiddenByFullscreen = false
      await win.show()
    }
  }

  const timer = window.setInterval(() => {
    void poll()
  }, POLL_INTERVAL_MS)

  return () => {
    stopped = true
    window.clearInterval(timer)
  }
}
