/**
 * 窗口布局(M2/M3 迭代):初始落位 + 就地尺寸切换。
 * 纯计算部分(topCenterPosition)独立导出,可单测。
 *
 * 布局规则:应用启动时按「保存的锚点 > 顶部居中」落位;之后所有尺寸切换
 * 一律锚定窗口当前位置就地伸缩(用户拖到哪,就在哪收展),窗口永不回弹。
 * 位置读取放在切换时刻——拖动的模态循环早已结束,读到的永远准确。
 *
 * @author ZHANGCHAO 2026/10/01
 */
import { currentMonitor, getCurrentWindow, LogicalSize, PhysicalPosition } from '@tauri-apps/api/window'

/** 距屏幕顶部的逻辑像素间距 */
const TOP_OFFSET_LOGICAL = 6

/** currentMonitor() 返回结构的宽松形状(单测用假对象填充) */
export interface MonitorLike {
  size: { width: number; height: number }
  position: { x: number; y: number }
  scaleFactor: number
}

/**
 * 计算窗口在主显示器顶部居中时的物理坐标。
 * 注意:monitor 的 size/position 是物理像素,窗口声明的 width 是逻辑像素,
 * 必须乘 scaleFactor 换算,否则在高分屏(125%/150% 缩放)上会偏。
 */
export function topCenterPosition(
  monitor: MonitorLike,
  logicalWidth: number,
  logicalTopOffset: number = TOP_OFFSET_LOGICAL,
): PhysicalPosition {
  const physicalWidth = Math.round(logicalWidth * monitor.scaleFactor)
  const x = monitor.position.x + Math.round((monitor.size.width - physicalWidth) / 2)
  const y = monitor.position.y + Math.round(logicalTopOffset * monitor.scaleFactor)
  return new PhysicalPosition(x, y)
}

/** 就地改尺寸:先读当前窗口位置,再按该锚点伸缩;返回锚点(读取失败返回 null) */
export async function resizeInPlace(size: LogicalSize): Promise<PhysicalPosition | null> {
  const win = getCurrentWindow()
  let anchor: PhysicalPosition
  try {
    anchor = await win.outerPosition()
  } catch {
    // 位置读取失败(极少见)退回只改尺寸,不移动
    await win.setSize(size)
    return null
  }
  await win.setSize(size)
  await win.setPosition(anchor)
  return anchor
}

/** 初始落位:有保存的锚点用锚点,否则主显示器顶部居中 */
export async function applyInitialLayout(size: LogicalSize, saved: PhysicalPosition | null): Promise<void> {
  const win = getCurrentWindow()
  await win.setSize(size)
  if (saved !== null) {
    await win.setPosition(saved)
    return
  }
  const monitor = await currentMonitor()
  if (monitor === null) return
  await win.setPosition(topCenterPosition(monitor, size.width))
}
