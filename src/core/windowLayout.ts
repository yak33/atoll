/**
 * 窗口布局(M2):顶部居中定位 + 三态尺寸切换。
 * 纯计算部分(topCenterPosition)独立导出,可单测。
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

/** 应用目标尺寸并保持顶部居中(尺寸切换与定位永远成对出现) */
export async function applyTopCenteredLayout(size: LogicalSize): Promise<void> {
  const win = getCurrentWindow()
  await win.setSize(size)
  const monitor = await currentMonitor()
  if (monitor === null) return
  await win.setPosition(topCenterPosition(monitor, size.width))
}
