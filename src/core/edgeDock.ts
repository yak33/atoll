/**
 * 贴边折叠(F1):方向判定与折叠矩形计算,纯函数可单测。
 * 全部使用物理像素(与 Tauri 的 outerPosition/currentMonitor 同单位),
 * 逻辑像素换算由调用方(App)按 scaleFactor 处理。
 *
 * 分边策略:上下边「隐入留 3px 霓虹线」;左右边「收缩成 44×44 迷你岛」
 * ——横向药丸向左右隐入只剩 3px×44 竖线,信号太弱,故改收缩当徽章。
 *
 * @author ZHANGCHAO 2026/10/06
 */

export type DockEdge = 'top' | 'bottom' | 'left' | 'right'

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
 * left/right 就地收缩成 44×44 徽章,位置完全保留——跳到屏幕左/右缘会远离
 * 用户拖动的位置,产生「消失」感(实测反馈),就地收缩符合最小惊讶原则。
 */
export function dockedRect(edge: DockEdge, win: Rect, work: Rect): Rect {
  if (edge === 'top') {
    return { x: win.x, y: work.y, width: win.width, height: DOCK_LINE_HEIGHT }
  }
  if (edge === 'bottom') {
    return { x: win.x, y: work.y + work.height - DOCK_LINE_HEIGHT, width: win.width, height: DOCK_LINE_HEIGHT }
  }
  return { x: win.x, y: win.y, width: DOCK_MINI_SIZE, height: DOCK_MINI_SIZE }
}
