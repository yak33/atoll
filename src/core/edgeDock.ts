/**
 * 贴边折叠(F1):方向判定与折叠矩形计算,纯函数可单测。
 * 全部使用物理像素(与 Tauri 的 outerPosition/currentMonitor 同单位),
 * 逻辑像素换算由调用方(App)按 scaleFactor 处理。
 *
 * 用户拍板交互原则:
 * 1. 始终保持胶囊形态,坚决不要方形小徽章;
 * 2. 仅贴近屏幕顶部且静止时,才折叠为上方 3px 霓虹横条;
 * 3. 左右两侧与底部无论拖入多少,松手/离开后均自动弹回屏内完整呈现胶囊。
 *
 * @author ZHANGCHAO 2026/10/06
 */

export type DockEdge = 'top' | 'bottom' | 'left' | 'right'

/** 是否属于允许折叠的方向:仅贴顶允许折叠为横条 */
export function isDockableEdge(edge: DockEdge): boolean {
  return edge === 'top'
}

/** 统一矩形(物理像素) */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** 上/下折叠的窗口高:3px 可见霓虹线 + 5px 命中缓冲(鼠标划过屏幕边缘即可唤回) */
export const DOCK_LINE_HEIGHT = 8
/** 左/右折叠的迷你岛边长(逻辑像素,与药丸高度一致) */
export const DOCK_MINI_SIZE = 44

/** 窗口中心离工作区哪条边最近;平局按 上>下>左>右(顶部是默认位) */
export function nearestEdge(win: Rect, work: Rect): DockEdge {
  const cx = win.x + win.width / 2
  const cy = win.y + win.height / 2
  const distTop = cy - work.y
  const distBottom = work.y + work.height - cy
  const distLeft = cx - work.x
  const distRight = work.x + work.width - cx
  const min = Math.min(distTop, distBottom, distLeft, distRight)
  if (min === distTop) return 'top'
  if (min === distBottom) return 'bottom'
  if (min === distLeft) return 'left'
  return 'right'
}

/**
 * 折叠态的目标窗口矩形:
 * top/bottom 保持横向位置与宽度,只缩高度并贴边(霓虹线必须贴屏幕边缘);
 * left/right 就地收缩成 44×44 徽章——跳到屏幕左/右缘会远离用户拖动的位置
 * (实测反馈「消失」感),就地收缩符合最小惊讶原则。
 * 所有形态都会钳制进工作区:拖一半出屏时折叠,徽章/线也必须在屏内可见。
 */
export function dockedRect(edge: DockEdge, win: Rect, work: Rect, scaleFactor = 1): Rect {
  const clampX = (x: number, w: number) => Math.min(Math.max(x, work.x), work.x + work.width - w)
  const clampY = (y: number, h: number) => Math.min(Math.max(y, work.y), work.y + work.height - h)

  const lineHeightPhysical = Math.round(DOCK_LINE_HEIGHT * scaleFactor)
  const miniSizePhysical = Math.round(DOCK_MINI_SIZE * scaleFactor)

  if (edge === 'top') {
    return { x: clampX(win.x, win.width), y: work.y, width: win.width, height: lineHeightPhysical }
  }
  if (edge === 'bottom') {
    return {
      x: clampX(win.x, win.width),
      y: work.y + work.height - lineHeightPhysical,
      width: win.width,
      height: lineHeightPhysical,
    }
  }
  return {
    x: clampX(win.x, miniSizePhysical),
    y: clampY(win.y, miniSizePhysical),
    width: miniSizePhysical,
    height: miniSizePhysical,
  }
}
