<script setup lang="ts">
/**
 * 灵动岛主容器 —— M2:三态状态机。
 *
 *   pill(默认药丸)
 *     ├─ 鼠标悬停 → expanded(数据面板,离开 500ms 收回)
 *     └─ 点击     → settings(设置面板)
 *   settings 关闭 → pill
 *
 * 窗口尺寸/位置随状态切换,永远锚定主显示器顶部居中。
 * 鼠标穿透/全屏隐藏是 M3。
 *
 * @author ZHANGCHAO 2026/09/30
 */
import { computed, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { getCurrentWindow, currentMonitor, availableMonitors, primaryMonitor, LogicalSize, PhysicalPosition } from '@tauri-apps/api/window'
import { listen } from '@tauri-apps/api/event'
import { QuotaPoller } from './core/QuotaPoller'
import {
  loadAppearance,
  loadActiveModule,
  loadClipboardEnabled,
  loadClipboardHistory,
  loadCredential,
  loadPillPosition,
  loadPomodoro,
  loadTheme,
  loadUsageAlerts,
  loadUsageHistory,
  saveActiveModule,
  saveClipboardEnabled,
  saveClipboardHistory,
  saveCredential,
  savePillPosition,
  saveUsageHistory,
  type AppearanceSettings,
  type IslandModule,
  type PillPosition,
  type PomodoroSettings,
  type UsageAlerts,
  DEFAULT_APPEARANCE,
  DEFAULT_USAGE_ALERTS,
} from './core/appSettings'
import { estimateHoursToLimit, formatBurnEstimate, type BurnSample } from './core/burnRate'
import {
  appendHistory,
  type UsageHistoryPoint,
} from './core/usageHistory'
import {
  addClipboardItem,
  clearUnpinned,
  removeClipboardItem,
  togglePin,
  type ClipboardItem,
} from './core/clipboardHistory'
import { invoke } from '@tauri-apps/api/core'
import { initTheme } from './core/theme'
import { applyInitialLayout, resizeInPlace, clampIntoWorkArea } from './core/windowLayout'
import { detectResetNotifications } from './core/resetNotify'
import { sendToast } from './core/notify'
import { updateTrayTooltip } from './core/tray'
import { startFullscreenWatch } from './core/fullscreenWatch'
import {
  applyDurations,
  durationOf,
  formatClock,
  initialState as initialPomodoro,
  pause,
  remainOf,
  reset as resetPomodoro,
  start as startPomodoro,
  tick as tickPomodoro,
} from './core/pomodoro'
import { nowTick } from './composables/nowTick'
import {
  dockedRect,
  nearestEdge,
  type DockEdge,
  type Rect,
} from './core/edgeDock'
import { playSound } from './core/sound'
import MiniIsland from './components/MiniIsland.vue'
import type { ZhipuCredential } from './adapters/zhipu'
import type { QuotaError, QuotaErrorKind, UsageWindow, ZhipuQuotaSnapshot } from './types'
import SettingsPanel from './components/SettingsPanel.vue'
import { ISLAND_MODULES } from './islandModules'

/** 药丸高度固定 44px(试过做成可调,收益低且和文字排版耦合),宽度跟随用户自定义 */
const PILL_HEIGHT = 44
const SETTINGS_SIZE = new LogicalSize(340, 700)

function pillSize(): LogicalSize {
  return new LogicalSize(appearance.value.pillWidth, PILL_HEIGHT)
}

/** 展开态尺寸来自当前模块的注册表定义 */
function expandedSize(): LogicalSize {
  return moduleDef.value.expandedSize(appearance.value.pillWidth)
}
/** 鼠标离开面板后延迟收回,防止误触抖动(PRD §4.2) */
const COLLAPSE_DELAY_MS = 500

type IslandMode = 'pill' | 'expanded' | 'settings'

const mode = ref<IslandMode>('pill')
const booting = ref(true)
const credential = ref<ZhipuCredential | null>(null)
const snapshot = ref<ZhipuQuotaSnapshot | null>(null)
const quotaError = ref<QuotaError | null>(null)
const refreshing = ref(false)

// 重置检测需要上一份快照
let lastSnapshot: ZhipuQuotaSnapshot | null = null

// 外观自定义:不透明度实时生效,胶囊尺寸在药丸态立即应用
const appearance = ref<AppearanceSettings>({ ...DEFAULT_APPEARANCE })

// ===== 模块层:注册表驱动,收起态滚轮环形切换,选择持久化 =====
const activeModule = ref<IslandModule>('usage')

/** 当前模块的注册表定义;存储里的非法值兜底到第一个模块 */
const moduleDef = computed(
  () => ISLAND_MODULES.find((m) => m.id === activeModule.value) ?? ISLAND_MODULES[0],
)

async function handleSwitchModule(next: IslandModule): Promise<void> {
  if (next === activeModule.value) return
  activeModule.value = next
  try {
    await saveActiveModule(next)
  } catch {
    // 持久化失败不影响本次会话生效
  }
  // 展开态下各模块面板尺寸不同,就地伸缩
  if (mode.value === 'expanded') {
    await resizeInPlace(expandedSize())
  }
}

// 滚轮一次滚动会连发多个 wheel 事件,400ms 节流防止来回抖
let lastWheelSwitch = 0
// 滚轮切换滑屏方向: 'down' | 'up'
const wheelDirection = ref<'down' | 'up'>('down')

/** 环形切换:注册表顺序即环形顺序,向下滚取下一个,向上滚取上一个 */
function handlePillWheel(event?: WheelEvent): void {
  // 滚动滚轮时取消展开定时器,让滚轮顺畅连续切模块而不被突然展开打断
  cancelExpand()
  const now = Date.now()
  if (now - lastWheelSwitch < 400) return
  lastWheelSwitch = now
  if (event && event.deltaY < 0) {
    wheelDirection.value = 'up'
  } else {
    wheelDirection.value = 'down'
  }
  const len = ISLAND_MODULES.length
  const idx = ISLAND_MODULES.findIndex((m) => m.id === activeModule.value)
  if (idx === -1 || len < 2) return
  const nextIdx = wheelDirection.value === 'down' ? (idx + 1) % len : (idx - 1 + len) % len
  void handleSwitchModule(ISLAND_MODULES[nextIdx].id)
}

// ===== 番茄钟 =====
// 计时基于结束时间戳(见 core/pomodoro.ts 头注释):1s interval 只做显示刷新,
// 窗口被隐藏导致节流也不影响剩余时间与阶段切换的正确性。
const pomo = ref(initialPomodoro())
const pomoNow = ref(Date.now())

const pomoClockText = computed(() => formatClock(remainOf(pomo.value, pomoNow.value)))

/** 面板/药丸共用的番茄视图:stateText 区分未开始/已暂停/运行中(空串) */
const pomoView = computed(() => ({
  phase: pomo.value.phase,
  running: pomo.value.running,
  remainText: pomoClockText.value,
  stateText: pomo.value.running
    ? ''
    : pomo.value.remainMs === durationOf(pomo.value)
      ? '未开始'
      : '已暂停',
  workMin: Math.round(pomo.value.workMs / 60_000),
  breakMin: Math.round(pomo.value.breakMs / 60_000),
}))

let pomoTimer = 0
/** 上次番茄 tick 时刻:供睡眠跳变检测;start/重置时归零防误判 */
let lastPomoTickAt = 0

function handlePomoToggle(): void {
  const now = Date.now()
  pomo.value = pomo.value.running ? pause(pomo.value, now) : startPomodoro(pomo.value, now)
  pomoNow.value = now
  // 重新开始计时:基点重置,避免暂停间隔被误判为系统休眠
  lastPomoTickAt = now
}

function handlePomoReset(): void {
  pomo.value = resetPomodoro(pomo.value)
}

/** 设置面板改时长:进行中的阶段按原时长走完,下一阶段生效(语义见 applyDurations) */
function handlePomoDurations(next: PomodoroSettings): void {
  pomo.value = applyDurations(pomo.value, next.workMin * 60_000, next.breakMin * 60_000)
}

// 已持久化的窗口锚点(物理像素);null = 从未自定义,初始落位用顶部居中。
// 拖动结束时机在模态循环里探测不可靠,改为在每次状态切换时读窗口真实位置。
let lastPersistedPos: PillPosition | null = null

function applyOpacityVar(): void {
  document.documentElement.style.setProperty('--bg-alpha', String(appearance.value.opacity))
  // 光效强度同样走 CSS 变量,组件里按 calc 乘出最终透明度
  document.documentElement.style.setProperty('--glow-strength', String(appearance.value.glowStrength))
  document.documentElement.dataset.skin = appearance.value.skin
}

async function handleAppearance(next: AppearanceSettings): Promise<void> {
  appearance.value = next
  applyOpacityVar()
  if (mode.value === 'pill') {
    await resizeInPlace(pillSize())
  }
}

/** 展开面板拖动:交给系统移动窗口。新位置不在此处读取——
 *  收回/切换状态时统一读窗口真实位置并持久化(见 enterMode)。 */
async function handleDragStart(): Promise<void> {
  cancelCollapse()
  await getCurrentWindow().startDragging()
}

/** 设置面板「重置位置」:清锚点并立即回到顶部居中(设置态下移动设置窗口本身) */
async function handleResetPosition(): Promise<void> {
  lastPersistedPos = null
  try {
    await savePillPosition(null)
  } catch {
    // 清理失败不影响本次会话回落
  }
  const size = mode.value === 'settings' ? SETTINGS_SIZE : pillSize()
  await applyInitialLayout(size, null)
}

let collapseTimer: number | null = null

// ===== 系统集成(M3)=====
// 托盘手动隐藏标志:全屏自动恢复不越过用户意愿
const manualHidden = ref(false)
let unlistenTray: (() => void) | null = null
let stopFullscreenWatch: (() => void) | null = null
let disposeTheme: (() => void) | null = null
let unlistenFocus: (() => void) | null = null

// ===== 用量告警阈值 + 消耗速率预测 + 趋势历史 =====
const usageAlerts = ref<UsageAlerts>({ ...DEFAULT_USAGE_ALERTS })
let lastBurnSample: BurnSample | null = null
const burnEstimateText = ref('')
const history = ref<UsageHistoryPoint[]>([])

function handleUsageAlerts(next: UsageAlerts): void {
  usageAlerts.value = next
}

// ===== 剪贴板模块 =====
// Rust 侧 watcher 事件驱动推文本过来;开关关闭时事件仍到达但不落盘(隐私急停)。
const clipboardItems = ref<ClipboardItem[]>([])
const clipboardEnabled = ref(true)
let unlistenClipboard: (() => void) | null = null
let clipboardSaveTimer: number | null = null

/** 连续复制 400ms 防抖落盘,避免频繁刷写整个 store */
function scheduleSaveClipboard(): void {
  if (clipboardSaveTimer !== null) clearTimeout(clipboardSaveTimer)
  clipboardSaveTimer = window.setTimeout(() => {
    clipboardSaveTimer = null
    void saveClipboardHistory(clipboardItems.value)
  }, 400)
}

function flushSaveClipboard(): void {
  if (clipboardSaveTimer !== null) {
    clearTimeout(clipboardSaveTimer)
    clipboardSaveTimer = null
  }
  void saveClipboardHistory(clipboardItems.value)
}

/** 复制历史条目回剪贴板(Rust 命令);失败弹 toast 而非静默——用户有明确意图 */
async function handleClipboardCopy(text: string): Promise<void> {
  try {
    await invoke('write_clipboard_text', { text })
    void sendToast('已复制到剪贴板')
    if (soundEnabled.value) playSound('copy')
  } catch {
    void sendToast('复制失败,请重试')
  }
}

function handleClipboardRemove(id: string): void {
  clipboardItems.value = removeClipboardItem(clipboardItems.value, id)
  flushSaveClipboard()
}

function handleClipboardPin(id: string): void {
  clipboardItems.value = togglePin(clipboardItems.value, id)
  flushSaveClipboard()
}

function handleClipboardClear(): void {
  clipboardItems.value = clearUnpinned(clipboardItems.value)
  flushSaveClipboard()
}

async function handleClipboardEnabled(next: boolean): Promise<void> {
  clipboardEnabled.value = next
  try {
    await saveClipboardEnabled(next)
  } catch {
    // 持久化失败不影响本次会话生效
  }
}

/** 设置面板「清空全部」:含置顶条目(用户明确操作) */
function handleClipboardClearAll(): void {
  clipboardItems.value = []
  flushSaveClipboard()
}

const poller = new QuotaPoller({
  onData: (data) => {
    const messages = detectResetNotifications(lastSnapshot, data, Date.now())
    // 5h 窗口消耗速率采样:相邻两次快照算斜率,供展开面板「预计耗尽」粗估
    // (负斜率=窗口重置,estimateHoursToLimit 判不可信返回 null)
    const window5h = data.windows.find((w) => w.key === '5h')
    if (window5h !== undefined) {
      const sample = { at: Date.now(), usedPercent: window5h.usedPercent }
      if (lastBurnSample !== null) {
        burnEstimateText.value = formatBurnEstimate(estimateHoursToLimit(lastBurnSample, sample))
      }
      lastBurnSample = sample
    }
    // 趋势历史:两个窗口各记一条;轮询 5 分钟一次,落盘频率同量级,开销可忽略
    const window7d = data.windows.find((w) => w.key === 'weekly')
    if (window5h !== undefined && window7d !== undefined) {
      history.value = appendHistory(history.value, {
        at: Date.now(),
        p5h: window5h.usedPercent,
        p7d: window7d.usedPercent,
      })
      void saveUsageHistory(history.value)
    }
    lastSnapshot = data
    snapshot.value = data
    quotaError.value = null
    // 窗口重置提醒(toast);不 await,通知失败不影响主流程
    messages.forEach((message) => {
      void sendToast(message)
    })
    if (messages.length > 0 && soundEnabled.value) playSound('reset')
  },
  onError: (error) => {
    quotaError.value = error
  },
})

onMounted(async () => {
  // 主题与外观先行:避免首帧配色/尺寸跳变(index.html 默认 data-theme="dark")
  disposeTheme = initTheme(await loadTheme())
  appearance.value = await loadAppearance()
  activeModule.value = await loadActiveModule()
  // 番茄钟时长从持久化配置初始化
  const pomoCfg = await loadPomodoro()
  pomo.value = initialPomodoro(pomoCfg.workMin * 60_000, pomoCfg.breakMin * 60_000)
  usageAlerts.value = await loadUsageAlerts()
  history.value = await loadUsageHistory()
  clipboardItems.value = await loadClipboardHistory()
  clipboardEnabled.value = await loadClipboardEnabled()
  const savedPos = await loadPillPosition()
  lastPersistedPos = savedPos
  applyOpacityVar()
  await applyInitialLayout(pillSize(), savedPos !== null ? new PhysicalPosition(savedPos.x, savedPos.y) : null)
  credential.value = await loadCredential()
  booting.value = false
  if (credential.value !== null) {
    poller.start(credential.value)
  }

  // 托盘「显示/隐藏」:可见性统一由前端管理,与全屏自动隐藏互不打架
  unlistenTray = await listen('tray:toggle-visibility', () => {
    void toggleManualVisibility()
  })

  // 剪贴板文本变化(Rust watcher 事件驱动);防抖落盘
  unlistenClipboard = await listen<string>('clipboard:text-changed', (event) => {
    if (!clipboardEnabled.value) return
    clipboardItems.value = addClipboardItem(clipboardItems.value, event.payload)
    scheduleSaveClipboard()
  })

  // 出屏守卫:2 秒轮询,静止且完全出屏时拉回主屏
  guardTimer = window.setInterval(() => {
    void guardOffscreen()
  }, 2000)
  stopFullscreenWatch = startFullscreenWatch({
    isManuallyHidden: () => manualHidden.value,
  })

  // 设置态失焦自动关闭:置顶面板不该在用户切走后一直挡屏幕
  unlistenFocus = await getCurrentWindow().onFocusChanged(({ payload: focused }) => {
    if (focused) {
      cancelBlurClose()
      return
    }
    if (mode.value === 'settings') {
      scheduleBlurClose()
    }
  })

  // 番茄钟:常驻 1s 刷新,未运行时早退;阶段切换在此检测并发 toast。
  // 睡眠/休眠检测:tick 间隔跳变超过 2 分钟判定系统中断,冻结在断点前剩余并暂停
  // (普通窗口隐藏的 WebView 节流 ≤60s,不会误判);恢复后用户手动继续。
  pomoTimer = window.setInterval(() => {
    if (!pomo.value.running) return
    const now = Date.now()
    if (lastPomoTickAt !== 0 && now - lastPomoTickAt > 120_000) {
      pomo.value = pause(pomo.value, lastPomoTickAt)
      void sendToast('⏸️ 检测到系统休眠,番茄钟已暂停,回来后点开始继续')
      lastPomoTickAt = now
      return
    }
    lastPomoTickAt = now
    pomoNow.value = now
    const result = tickPomodoro(pomo.value, pomoNow.value)
    if (result.completed !== null) {
      pomo.value = result.state
      const workMin = Math.round(result.state.workMs / 60_000)
      const breakMin = Math.round(result.state.breakMs / 60_000)
      void sendToast(result.completed === 'work' ? `🍅 专注完成,休息 ${breakMin} 分钟` : `☕ 休息结束,开始专注 ${workMin} 分钟`)
      if (soundEnabled.value) playSound('phase')
    }
  }, 1000)
})

onBeforeUnmount(() => {
  cancelExpand()
  cancelCollapse()
  cancelDock()
  cancelBlurClose()
  flushSaveClipboard()
  poller.stop()
  unlistenTray?.()
  unlistenClipboard?.()
  window.clearInterval(guardTimer)
  stopFullscreenWatch?.()
  disposeTheme?.()
  unlistenFocus?.()
  window.clearInterval(pomoTimer)
})

// ===== 三态切换 =====

/** 状态切换:就地按目标尺寸伸缩;位置有变化才写盘(悬停收展不刷 store) */
async function enterMode(target: IslandMode): Promise<void> {
  // 折叠态先恢复窗口原形态,否则 resizeInPlace 会以折叠矩形为锚点伸缩
  if (dockEdge.value !== null) {
    suppressHoverUntil = Date.now() + 1200
    await undock()
  }
  mode.value = target
  const size = target === 'settings' ? SETTINGS_SIZE : target === 'expanded' ? expandedSize() : pillSize()
  const anchor = await resizeInPlace(size)
  if (anchor === null) return
  const pos = { x: anchor.x, y: anchor.y }
  if (lastPersistedPos === null || pos.x !== lastPersistedPos.x || pos.y !== lastPersistedPos.y) {
    lastPersistedPos = pos
    try {
      await savePillPosition(pos)
    } catch {
      // 持久化失败仅影响下次启动落位
    }
  }
}

/** 鼠标在药丸上停留超过该延迟才展开,防止轻划掠过或滚轮切模块时误触展开 */
const EXPAND_DELAY_MS = 250
let expandTimer: number | null = null

function scheduleExpand(): void {
  cancelExpand()
  cancelCollapse()
  expandTimer = window.setTimeout(() => {
    expandTimer = null
    void enterMode('expanded')
  }, EXPAND_DELAY_MS)
}

function cancelExpand(): void {
  if (expandTimer !== null) {
    clearTimeout(expandTimer)
    expandTimer = null
  }
}

function handlePillHover(): void {
  if (mode.value !== 'pill') return
  // 刚从折叠态唤回时鼠标就在岛上,这不是浏览意图,短抑制 hover 展开
  if (Date.now() < suppressHoverUntil) return
  cancelDock()
  scheduleExpand()
}

function handlePillLeave(): void {
  cancelExpand()
  scheduleDock()
}

// ===== 贴边微折叠(F1) =====
// 触发:收起态鼠标离开药丸 3 秒;方向跟随最近屏幕边缘;
// 上下边隐入留 3px 霓虹线,左右边收缩成 44×44 迷你岛(分边策略见 core/edgeDock.ts)。
// 优先级:托盘手动隐藏 / 全屏隐藏 > 折叠;任何状态切换先解除折叠。

const DOCK_DELAY_MS = 3000
const dockEdge = ref<DockEdge | null>(null)
const dockFoldEnabled = ref(true)
const soundEnabled = ref(true)
/** 折叠前形态,唤回时恢复 */
let dockOrigin: { pos: PhysicalPosition; size: LogicalSize } | null = null
let dockTimer = 0
/** 折叠唤回后的 hover 展开抑制截止时刻 */
let suppressHoverUntil = 0

function cancelDock(): void {
  if (dockTimer !== 0) {
    window.clearTimeout(dockTimer)
    dockTimer = 0
  }
}

function scheduleDock(): void {
  cancelDock()
  // 折叠只在:开关开 + 收起态 + 未折叠 + 未被手动隐藏
  if (!dockFoldEnabled.value || mode.value !== 'pill' || dockEdge.value !== null || manualHidden.value) return
  dockTimer = window.setTimeout(() => {
    dockTimer = 0
    void dockNow()
  }, DOCK_DELAY_MS)
}

async function dockNow(): Promise<void> {
  if (mode.value !== 'pill' || dockEdge.value !== null) return
  const win = getCurrentWindow()
  try {
    const [pos, size, monitor] = await Promise.all([win.outerPosition(), win.innerSize(), currentMonitor()])
    if (monitor === null) return
    const scaleFactor = monitor.scaleFactor
    // 均为物理像素:窗口矩形与工作区矩形同单位参与判定
    const winRect: Rect = {
      x: pos.x,
      y: pos.y,
      width: Math.round(size.width),
      height: Math.round(size.height),
    }
    const workRect: Rect = {
      x: monitor.workArea.position.x,
      y: monitor.workArea.position.y,
      width: monitor.workArea.size.width,
      height: monitor.workArea.size.height,
    }
    const edge = nearestEdge(winRect, workRect)
    const target = dockedRect(edge, winRect, workRect, scaleFactor)
    dockOrigin = {
      pos,
      size: new LogicalSize(Math.round(size.width / scaleFactor), Math.round(size.height / scaleFactor)),
    }
    dockEdge.value = edge
    await win.setSize(new LogicalSize(Math.round(target.width / scaleFactor), Math.round(target.height / scaleFactor)))
    await win.setPosition(new PhysicalPosition(target.x, target.y))
  } catch {
    // 窗口操作失败不影响主流程,折叠放弃
    dockEdge.value = null
    dockOrigin = null
  }
}

async function undock(): Promise<void> {
  if (dockEdge.value === null) return
  dockEdge.value = null
  const origin = dockOrigin
  dockOrigin = null
  if (origin === null) return
  const win = getCurrentWindow()
  try {
    // 恢复位置钳进工作区:拖一半出屏后折叠,唤回必须完整可见(否则又是「消失」)
    const monitor = await currentMonitor()
    let restore = origin.pos
    if (monitor !== null) {
      restore = clampIntoWorkArea(origin.pos, origin.size.width * monitor.scaleFactor, origin.size.height * monitor.scaleFactor, monitor.workArea)
    }
    await win.setSize(origin.size)
    await win.setPosition(restore)
  } catch {
    // 恢复失败:折叠标记已解除,尺寸异常由下次状态切换修正
  }
}

/** 折叠态迷你岛的唤回手势 */
async function handleDockRestore(): Promise<void> {
  suppressHoverUntil = Date.now() + 1200
  await undock()
}

// ===== 窗口出屏守卫(轮询版) =====
// onMoved 对窗口移动的触发不可靠(实测外部移动不触发),改为 2 秒轮询。
// 规则:位置静止(不打断拖动中)+ 没被任何一块屏完整装下 → 钳回完整可见
// (用户拍板:拖多少出屏都自动弹回展示全样);跨两屏驻留是合法可见状态,不打扰。
// 优化:guardSettled 状态记录,静止无位移时跳过每 2s 的 monitors 系统 IPC。
let guardTimer = 0
let lastGuardX = Number.NaN
let lastGuardY = Number.NaN
let guardSettled = false

async function guardOffscreen(): Promise<void> {
  // 折叠态位置由 dockedRect 钳制过,不重复处理
  if (dockEdge.value !== null) return
  const win = getCurrentWindow()
  try {
    const pos = await win.outerPosition()
    // 位置仍在变化(拖动中):记录后等待下一轮
    if (pos.x !== lastGuardX || pos.y !== lastGuardY) {
      lastGuardX = pos.x
      lastGuardY = pos.y
      guardSettled = false
      return
    }
    // 已经静止且已完成出屏检查:无新位移无需重复调用系统 API 查询 monitors
    if (guardSettled) return
    guardSettled = true

    const [size, monitors] = await Promise.all([win.innerSize(), availableMonitors()])
    const w = Math.round(size.width)
    const h = Math.round(size.height)
    const intersects = (work: { position: { x: number; y: number }; size: { width: number; height: number } }) =>
      pos.x < work.position.x + work.size.width &&
      pos.x + w > work.position.x &&
      pos.y < work.position.y + work.size.height &&
      pos.y + h > work.position.y
    const fullyInside = (work: { position: { x: number; y: number }; size: { width: number; height: number } }) =>
      pos.x >= work.position.x &&
      pos.y >= work.position.y &&
      pos.x + w <= work.position.x + work.size.width &&
      pos.y + h <= work.position.y + work.size.height
    const hitMonitors = monitors.filter((m) => intersects(m.workArea))
    // 完整在某屏内,或横跨两屏(合法驻留):不打扰
    if (hitMonitors.some((m) => fullyInside(m.workArea)) || hitMonitors.length >= 2) return
    // 部分出屏:钳回所在屏;完全出屏:拉回主屏
    const target = hitMonitors[0] ?? (await primaryMonitor())
    if (target === null || target === undefined) return
    const clamped = clampIntoWorkArea(pos, w, h, target.workArea)
    if (clamped.x !== pos.x || clamped.y !== pos.y) {
      lastGuardX = clamped.x
      lastGuardY = clamped.y
      await win.setPosition(clamped)
    }
  } catch {
    // 守卫失败静默:不影响任何主流程
  }
}

function scheduleCollapse(): void {
  cancelCollapse()
  collapseTimer = window.setTimeout(() => {
    void enterMode('pill')
  }, COLLAPSE_DELAY_MS)
}

function cancelCollapse(): void {
  if (collapseTimer !== null) {
    clearTimeout(collapseTimer)
    collapseTimer = null
  }
}

async function openSettings(): Promise<void> {
  cancelExpand()
  cancelCollapse()
  await enterMode('settings')
}

async function closeSettings(): Promise<void> {
  cancelBlurClose()
  await enterMode('pill')
}

// ===== 设置面板失焦自动关闭 =====

/** 失焦超过该时长自动收回药丸;期间焦点回来则取消 */
const SETTINGS_BLUR_CLOSE_MS = 3000
let blurCloseTimer: number | null = null

function cancelBlurClose(): void {
  if (blurCloseTimer !== null) {
    clearTimeout(blurCloseTimer)
    blurCloseTimer = null
  }
}

function scheduleBlurClose(): void {
  cancelBlurClose()
  blurCloseTimer = window.setTimeout(() => {
    blurCloseTimer = null
    // 计时期间可能已手动关闭/切模式,二次确认仍是设置态才收
    if (mode.value === 'settings') {
      void closeSettings()
    }
  }, SETTINGS_BLUR_CLOSE_MS)
}

/** 托盘显示/隐藏切换;隐藏前先收回药丸态,保证恢复时布局正确 */
async function toggleManualVisibility(): Promise<void> {
  const win = getCurrentWindow()
  if (!manualHidden.value) {
    manualHidden.value = true
    cancelCollapse()
    await enterMode('pill')
    await win.hide()
  } else {
    manualHidden.value = false
    await enterMode('pill')
    await win.show()
  }
}

// ===== 数据操作 =====

/** 设置面板自动保存回调:落盘 + 重启轮询(不关面板,保存是即时的) */
async function handleSave(next: ZhipuCredential): Promise<void> {
  await saveCredential(next)
  credential.value = next
  snapshot.value = null
  lastSnapshot = null
  quotaError.value = null
  poller.start(next)
}

async function handleRefresh(): Promise<void> {
  if (credential.value === null || refreshing.value) return
  refreshing.value = true
  try {
    await poller.refresh()
  } finally {
    refreshing.value = false
  }
}

// ===== 展示派生 =====

const ERROR_SHORT: Record<QuotaErrorKind, string> = {
  credentialInvalid: 'Key 无效',
  upstreamError: '服务异常',
  networkError: '网络异常',
  parseError: '数据异常',
}

// 收起态只显示最紧张的一档(usedPercent 最大)
const primary = computed<UsageWindow | null>(() => {
  const windows = snapshot.value?.windows ?? []
  if (windows.length === 0) return null
  return windows.reduce((worst, current) => (current.usedPercent > worst.usedPercent ? current : worst))
})

// 无数据/出错时的占位文案
const pillText = computed<string>(() => {
  if (booting.value) return '…'
  if (credential.value === null) return '点此设置'
  if (snapshot.value === null && quotaError.value !== null) return ERROR_SHORT[quotaError.value.kind]
  if (snapshot.value === null) return '加载中…'
  return ''
})

const fetchedAgoText = computed<string>(() => {
  if (snapshot.value === null) return ''
  const minutes = Math.floor((nowTick.value - Date.parse(snapshot.value.fetchedAt)) / 60000)
  return minutes < 1 ? '刚刚' : `${minutes} 分钟前`
})

const tooltipText = computed<string>(() => {
  const parts: string[] = []
  if (snapshot.value !== null) {
    parts.push(snapshot.value.planLevel || '未知套餐')
    parts.push(`更新于 ${fetchedAgoText.value}`)
    if (snapshot.value.source === 'credit_limit') parts.push('信用额度模式')
  }
  if (quotaError.value !== null) {
    parts.push(`${ERROR_SHORT[quotaError.value.kind]}:${quotaError.value.message}`)
  }
  return parts.join('\n') || '点击打开设置'
})

// 托盘 Tooltip:根据当前模块及状态实时同步(全屏/隐藏时悬停托盘也能看清实时状态)
watchEffect(() => {
  if (activeModule.value === 'usage') {
    if (credential.value === null) {
      void updateTrayTooltip('atoll · 点此配置 API Key')
    } else if (snapshot.value !== null) {
      const winSummary = (snapshot.value.windows ?? [])
        .map((w) => `${w.key === 'weekly' ? '7d' : '5h'}: ${Math.round(w.usedPercent)}%`)
        .join(' | ')
      void updateTrayTooltip(`atoll · ${winSummary || '已连接'}`)
    } else if (quotaError.value !== null) {
      void updateTrayTooltip(`atoll · 智谱额度 [${ERROR_SHORT[quotaError.value.kind] || '异常'}]`)
    } else {
      void updateTrayTooltip('atoll · 正在加载额度…')
    }
  } else {
    const p = pomoView.value
    if (p.running) {
      void updateTrayTooltip(`atoll · ${p.phase === 'work' ? '🍅 专注' : '☕ 休息'} ${p.remainText}`)
    } else {
      void updateTrayTooltip(`atoll · 🍅 番茄钟 (${p.stateText || '就绪'})`)
    }
  }
})

/** 折叠态迷你方块的徽章内容:按模块显示最简状态(线形态不显示) */
const dockBadge = computed(() => {
  if (activeModule.value === 'pomodoro') return pomoClockText.value
  if (activeModule.value === 'clipboard') return '📋'
  return primary.value !== null ? `${Math.round(primary.value.usedPercent)}%` : '--'
})

// ===== 动态挂载接线:各模块的 props/events 在此集中组装 =====
// 这是新模块唯一的「接线点」:注册表加一条 + 这里加一个分支,模板与切换逻辑零改动。

const pillProps = computed<Record<string, unknown>>(() => {
  if (activeModule.value === 'pomodoro') {
    return {
      pomo: pomoView.value,
      tooltip: '🍅 番茄钟 · 滚轮切换模块',
      glowEffects: appearance.value.glowEffects,
    }
  }
  if (activeModule.value === 'clipboard') {
    return {
      latest: clipboardItems.value.slice(0, 3),
      enabled: clipboardEnabled.value,
      tooltip: '📋 剪贴板 · 滚轮切换模块',
      glowEffects: appearance.value.glowEffects,
    }
  }
  return {
    win: primary.value,
    text: pillText.value,
    hasError: quotaError.value !== null,
    tooltip: tooltipText.value,
    warnAt: usageAlerts.value.warnAt,
    criticalAt: usageAlerts.value.criticalAt,
    glowEffects: appearance.value.glowEffects,
  }
})

const panelProps = computed<Record<string, unknown>>(() => {
  if (activeModule.value === 'pomodoro') {
    return { activeModule: activeModule.value, pomo: pomoView.value }
  }
  if (activeModule.value === 'clipboard') {
    return { activeModule: activeModule.value, items: clipboardItems.value, enabled: clipboardEnabled.value }
  }
  return {
    activeModule: activeModule.value,
    windows: snapshot.value?.windows ?? [],
    planLevel: snapshot.value?.planLevel ?? '',
    source: snapshot.value?.source ?? 'tokens_limit',
    fetchedAgo: fetchedAgoText.value,
    error: quotaError.value,
    refreshing: refreshing.value,
    warnAt: usageAlerts.value.warnAt,
    criticalAt: usageAlerts.value.criticalAt,
    burnEstimate: burnEstimateText.value,
    history: history.value,
  }
})

/** 模块特有事件;mouseenter/mouseleave/dragstart/switchModule 四个契约事件静态绑在模板上 */
const panelEvents = computed<Record<string, unknown>>(() => {
  if (activeModule.value === 'pomodoro') {
    return { pomoToggle: handlePomoToggle, pomoReset: handlePomoReset }
  }
  if (activeModule.value === 'clipboard') {
    return {
      copy: handleClipboardCopy,
      remove: handleClipboardRemove,
      pin: handleClipboardPin,
      clear: handleClipboardClear,
    }
  }
  return { refresh: handleRefresh, settings: openSettings }
})
</script>

<template>
  <!-- 收起态:优先渲染贴边折叠态的迷你岛;否则注册表动态挂载药丸 -->
  <Transition v-if="mode === 'pill'" :name="'pill-slide-' + wheelDirection" mode="out-in">
    <MiniIsland
      v-if="dockEdge !== null"
      key="docked"
      :edge="dockEdge"
      :badge="dockBadge"
      @mouseenter="handleDockRestore"
      @click="openSettings"
    />
    <component
      :is="moduleDef.pill"
      v-else
      :key="moduleDef.id"
      v-bind="pillProps"
      @click="openSettings"
      @mouseenter="handlePillHover"
      @mouseleave="handlePillLeave"
      @wheel="handlePillWheel"
    />
  </Transition>

  <!-- 展开态:注册表动态挂载面板;Tab 切换,滚轮切模块,模块特有事件由 panelEvents 组装 -->
  <component
    v-else-if="mode === 'expanded'"
    :is="moduleDef.panel"
    v-bind="panelProps"
    v-on="panelEvents"
    @mouseenter="cancelCollapse"
    @mouseleave="scheduleCollapse"
    @dragstart="handleDragStart"
    @switch-module="handleSwitchModule"
    @wheel.prevent="handlePillWheel"
  />

  <!-- 设置态:数据查看与手动刷新都在悬停展开面板里,这里只管设置 -->
  <SettingsPanel
    v-else
    :initial="credential"
    :active-module="activeModule"
    @save="handleSave"
    @close="closeSettings"
    @appearance="handleAppearance"
    @pomo-durations="handlePomoDurations"
    @usage-alerts="handleUsageAlerts"
    @clipboard-enabled="handleClipboardEnabled"
    @clipboard-clear="handleClipboardClearAll"
    @reset-position="handleResetPosition"
    @dragstart="handleDragStart"
  />
</template>

<style>
/* ===== 主题变量:默认深色,html[data-theme='light'] 覆盖为浅色 ===== */
:root {
  --bg-alpha: 1; /* 背景 alpha(0.5-1),由设置面板实时写入;文字不受影响 */
  --surface-rgb: 24 24 27; /* 深色主题背景基色(黑曜石) */
  --bg-surface: rgb(var(--surface-rgb) / var(--bg-alpha)); /* 药丸 */
  --bg-panel: rgb(var(--surface-rgb) / var(--bg-alpha)); /* 展开面板/设置面板 */
  --pill-border: rgba(255, 255, 255, 0.08);
  --pill-border-hover: rgba(255, 255, 255, 0.2);
  --pill-shadow: inset 0 1px 0.5px rgba(255, 255, 255, 0.16), inset 0 -1px 0.5px rgba(0, 0, 0, 0.35);
  --pill-shadow-hover: inset 0 1px 1px rgba(255, 255, 255, 0.28), inset 0 -1px 0.5px rgba(0, 0, 0, 0.35);
  --ease-spring: cubic-bezier(0.34, 1.4, 0.64, 1);
  --ease-spring-soft: cubic-bezier(0.16, 1, 0.3, 1);
  --text-primary: #e4e4e7;
  --text-secondary: #a1a1aa;
  --text-muted: #71717a;
  --track-bg: rgba(255, 255, 255, 0.12); /* 进度条底槽 */
  --border-soft: rgba(255, 255, 255, 0.14); /* 输入框描边 */
  --divider: rgba(255, 255, 255, 0.08); /* 分隔线 */
  --surface-overlay: rgba(255, 255, 255, 0.06); /* 状态条/输入框底 */
  --btn-bg: rgba(255, 255, 255, 0.08); /* 次级按钮 */
  --sheen-rgb: 255 255 255; /* 药丸偶发光效基色(深色主题用白光) */
  --sheen-base: 0.55; /* 满强度时的流光 alpha;波纹/扫光在此基础上 ×0.4,再乘用户强度 --glow-strength */
  --glow-strength: 1; /* 由设置面板实时写入 */

  /* 主题强调色:默认黑曜石翡翠绿 */
  --accent-rgb: 34 197 94;
  --accent-color: #4ade80;
  --accent-gradient: linear-gradient(90deg, #15803d, #22c55e);
}

html[data-theme='light'] {
  --surface-rgb: 255 255 255;
  --pill-border: rgba(9, 9, 11, 0.08); /* 浅色背景上给药丸一点描边防止融入壁纸 */
  --pill-border-hover: rgba(9, 9, 11, 0.18);
  --pill-shadow: inset 0 1px 0.5px rgba(255, 255, 255, 0.9), inset 0 -1px 0.5px rgba(0, 0, 0, 0.08);
  --pill-shadow-hover: inset 0 1px 1px rgba(255, 255, 255, 1), inset 0 -1px 0.5px rgba(0, 0, 0, 0.12);
  --text-primary: #27272a;
  --text-secondary: #52525b;
  --text-muted: #71717a;
  --track-bg: rgba(9, 9, 11, 0.1);
  --border-soft: rgba(9, 9, 11, 0.16);
  --divider: rgba(9, 9, 11, 0.08);
  --surface-overlay: rgba(9, 9, 11, 0.05);
  --btn-bg: rgba(9, 9, 11, 0.06);
  --sheen-rgb: 9 9 11;
  --sheen-base: 0.4;

  --accent-rgb: 22 163 74;
  --accent-color: #16a34a;
  --accent-gradient: linear-gradient(90deg, #16a34a, #4ade80);
}

/* ===== 皮肤主题:深色 (默认) ===== */
html[data-skin='midnight'] {
  --surface-rgb: 15 23 42; /* Slate-900 深海蓝灰 */
  --accent-rgb: 14 165 233;
  --accent-color: #38bdf8;
  --accent-gradient: linear-gradient(90deg, #0284c7, #38bdf8);
  --sheen-rgb: 186 230 253;
  --pill-border: rgba(56, 189, 248, 0.14);
  --pill-border-hover: rgba(56, 189, 248, 0.32);
}

html[data-skin='aurora'] {
  --surface-rgb: 26 16 38; /* 暗夜幽紫 */
  --accent-rgb: 168 85 247;
  --accent-color: #c084fc;
  --accent-gradient: linear-gradient(90deg, #9333ea, #c084fc);
  --sheen-rgb: 233 213 255;
  --pill-border: rgba(192, 132, 252, 0.15);
  --pill-border-hover: rgba(192, 132, 252, 0.34);
}

html[data-skin='sunset'] {
  --surface-rgb: 31 20 18; /* 暖碳暗褐 */
  --accent-rgb: 249 115 22;
  --accent-color: #fb923c;
  --accent-gradient: linear-gradient(90deg, #ea580c, #fb923c);
  --sheen-rgb: 254 215 170;
  --pill-border: rgba(251, 146, 60, 0.15);
  --pill-border-hover: rgba(251, 146, 60, 0.34);
}

html[data-skin='forest'] {
  --surface-rgb: 12 28 22; /* 幽绿暗丛 */
  --accent-rgb: 16 185 129;
  --accent-color: #34d399;
  --accent-gradient: linear-gradient(90deg, #059669, #34d399);
  --sheen-rgb: 167 243 208;
  --pill-border: rgba(52, 211, 153, 0.15);
  --pill-border-hover: rgba(52, 211, 153, 0.34);
}

html[data-skin='cyber'] {
  --surface-rgb: 22 22 24; /* 哑光黑钛 */
  --accent-rgb: 234 179 8;
  --accent-color: #facc15;
  --accent-gradient: linear-gradient(90deg, #ca8a04, #facc15);
  --sheen-rgb: 254 240 138;
  --pill-border: rgba(250, 204, 21, 0.15);
  --pill-border-hover: rgba(250, 204, 21, 0.34);
}

/* ===== 皮肤主题:浅色 ===== */
html[data-theme='light'][data-skin='midnight'] {
  --surface-rgb: 240 249 255;
  --accent-rgb: 2 132 199;
  --accent-color: #0284c7;
  --accent-gradient: linear-gradient(90deg, #0284c7, #38bdf8);
  --sheen-rgb: 14 165 233;
  --pill-border: rgba(14, 165, 233, 0.15);
  --pill-border-hover: rgba(14, 165, 233, 0.32);
}

html[data-theme='light'][data-skin='aurora'] {
  --surface-rgb: 250 245 255;
  --accent-rgb: 147 51 234;
  --accent-color: #9333ea;
  --accent-gradient: linear-gradient(90deg, #9333ea, #c084fc);
  --sheen-rgb: 168 85 247;
  --pill-border: rgba(168, 85, 247, 0.15);
  --pill-border-hover: rgba(168, 85, 247, 0.32);
}

html[data-theme='light'][data-skin='sunset'] {
  --surface-rgb: 255 247 237;
  --accent-rgb: 234 88 12;
  --accent-color: #ea580c;
  --accent-gradient: linear-gradient(90deg, #ea580c, #fb923c);
  --sheen-rgb: 249 115 22;
  --pill-border: rgba(249, 115, 22, 0.15);
  --pill-border-hover: rgba(249, 115, 22, 0.32);
}

html[data-theme='light'][data-skin='forest'] {
  --surface-rgb: 240 253 244;
  --accent-rgb: 5 150 105;
  --accent-color: #059669;
  --accent-gradient: linear-gradient(90deg, #059669, #34d399);
  --sheen-rgb: 16 185 129;
  --pill-border: rgba(16, 185, 129, 0.15);
  --pill-border-hover: rgba(16, 185, 129, 0.32);
}

html[data-theme='light'][data-skin='cyber'] {
  --surface-rgb: 254 252 232;
  --accent-rgb: 202 138 4;
  --accent-color: #ca8a04;
  --accent-gradient: linear-gradient(90deg, #ca8a04, #facc15);
  --sheen-rgb: 234 179 8;
  --pill-border: rgba(234, 179, 8, 0.15);
  --pill-border-hover: rgba(234, 179, 8, 0.32);
}

/* ===== 模块 Tab(全局):展开面板/设置面板顶部共用的「用量 | 番茄」切换 ===== */
.module-tabs {
  display: flex;
  gap: 4px;
}

.tab-btn {
  height: 20px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
}

.tab-btn:hover {
  color: var(--text-secondary);
}

.tab-btn-active {
  background: rgba(var(--accent-rgb) / 0.16);
  border-color: rgba(var(--accent-rgb) / 0.4);
  color: var(--accent-color);
}

/* ===== 药丸基座(全局):用量/番茄两种药丸共用的容器外观 ===== */
.island {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  /* 100vh 而非 100%:根组件父级是 body(无高度),百分比会退化成内容高度,
     药丸会缩成一行字高;窗口高度就是药丸高度,用视口高度撑满 */
  height: 100vh;
  padding: 0 14px;
  box-sizing: border-box;
  border-radius: 9999px;
  background: var(--bg-surface);
  border: 1px solid var(--pill-border);
  box-shadow: var(--pill-shadow);
  color: var(--text-primary);
  font-family: 'Segoe UI', system-ui, sans-serif;
  font-size: 12px;
  user-select: none;
  cursor: pointer;
  transition:
    background 0.3s var(--ease-spring-soft),
    border-color 0.25s ease,
    transform 0.18s var(--ease-spring),
    box-shadow 0.25s ease;
}

.island:hover {
  border-color: var(--pill-border-hover);
  box-shadow: var(--pill-shadow-hover);
}

.island:active {
  transform: scale(0.975);
}

/* ===== 偶发随机光效(全局):触发器在 useGlowEffects,种类在设置面板可配 =====
   两个伪元素常驻透明:flow/dual 用 ::before(边框环),其余用 ::after(面光) */
.island::before,
.island::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  opacity: 0;
}

/* 边框环:mask 挖掉 content-box 只留 1.5px;--flow-angle 由 @property 注册后可参与动画。
   颜色 = 主题基色 × 满强度 alpha × 用户强度(--glow-strength 由设置面板实时写入) */
.island::before {
  padding: 1.5px;
  background: conic-gradient(
    from var(--flow-angle),
    transparent 0deg 240deg,
    rgb(var(--sheen-rgb) / calc(var(--sheen-base) * var(--glow-strength))) 305deg,
    transparent 360deg
  );
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#fff 0 0) content-box exclude, linear-gradient(#fff 0 0);
}

.island.do-flow::before {
  opacity: 1;
  animation: island-flow 2.2s linear;
}

/* 这里使用 @property 注册 CSS 自定义属性,是因为 conic-gradient 的角度变量需要参与动画 */
@property --flow-angle {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}

@keyframes island-flow {
  to {
    --flow-angle: 360deg;
  }
}

/* 波纹:从左端圆头扩散一层柔光后消散(background-size 在盒内缩放,不越界);
   波纹/扫光比流光淡一档(×0.4) */
.island.do-ripple::after {
  background: radial-gradient(
    circle at 12% 50%,
    rgb(var(--sheen-rgb) / calc(var(--sheen-base) * 0.4 * var(--glow-strength))) 0%,
    transparent 55%
  );
  background-repeat: no-repeat;
  background-size: 0% 100%;
  animation: island-ripple 1.7s ease-out;
}

@keyframes island-ripple {
  0% {
    background-size: 0% 100%;
    opacity: 0.9;
  }
  100% {
    background-size: 300% 100%;
    opacity: 0;
  }
}

/* 扫光:一道斜向高光从右向左横扫 */
.island.do-sweep::after {
  background: linear-gradient(
    105deg,
    transparent 40%,
    rgb(var(--sheen-rgb) / calc(var(--sheen-base) * 0.4 * var(--glow-strength))) 50%,
    transparent 60%
  );
  background-repeat: no-repeat;
  background-size: 260% 100%;
  animation: island-sweep 1.6s ease-in-out;
}

@keyframes island-sweep {
  0% {
    background-position: 120% 0;
    opacity: 1;
  }
  100% {
    background-position: -60% 0;
    opacity: 1;
  }
}

/* 双流光:两段高光相隔 180°,共用 --flow-angle 旋转动画同时绕行 */
.island.do-dual::before {
  opacity: 1;
  background: conic-gradient(
    from var(--flow-angle),
    rgb(var(--sheen-rgb) / calc(var(--sheen-base) * var(--glow-strength))) 0deg 30deg,
    transparent 60deg 180deg,
    rgb(var(--sheen-rgb) / calc(var(--sheen-base) * var(--glow-strength))) 210deg 240deg,
    transparent 270deg
  );
  animation: island-flow 2.2s linear;
}

/* 双波汇流:两端圆头同时泛光,向中间汇合;复用波纹的扩散 keyframes */
.island.do-twin::after {
  background:
    radial-gradient(circle at 6% 50%, rgb(var(--sheen-rgb) / calc(var(--sheen-base) * 0.4 * var(--glow-strength))) 0%, transparent 50%),
    radial-gradient(circle at 94% 50%, rgb(var(--sheen-rgb) / calc(var(--sheen-base) * 0.4 * var(--glow-strength))) 0%, transparent 50%);
  background-repeat: no-repeat;
  background-size: 0% 100%;
  animation: island-ripple 1.9s ease-out;
}

/* 星火:三个小光点分布在不同位置,整体透明度分段跳闪 */
.island.do-sparkle::after {
  background:
    radial-gradient(circle 5px at 30% 38%, rgb(var(--sheen-rgb) / calc(var(--sheen-base) * var(--glow-strength))) 0%, transparent 100%),
    radial-gradient(circle 3px at 55% 62%, rgb(var(--sheen-rgb) / calc(var(--sheen-base) * var(--glow-strength))) 0%, transparent 100%),
    radial-gradient(circle 4px at 76% 34%, rgb(var(--sheen-rgb) / calc(var(--sheen-base) * var(--glow-strength))) 0%, transparent 100%);
  background-repeat: no-repeat;
  animation: island-sparkle 2s ease-in-out;
}

@keyframes island-sparkle {
  0%,
  100% {
    opacity: 0;
  }
  15% {
    opacity: 0.9;
  }
  30% {
    opacity: 0.1;
  }
  45% {
    opacity: 0.7;
  }
  62% {
    opacity: 0;
  }
}

/* 彗星拖尾:高亮白核+长渐变衰减尾迹,加速度掠行 */
.island.do-comet::before {
  opacity: 1;
  background: conic-gradient(
    from var(--flow-angle),
    transparent 0deg 200deg,
    rgb(var(--sheen-rgb) / calc(var(--sheen-base) * 0.15 * var(--glow-strength))) 240deg,
    rgb(var(--sheen-rgb) / calc(var(--sheen-base) * 0.5 * var(--glow-strength))) 290deg,
    #ffffff 325deg,
    transparent 328deg
  );
  animation: island-flow 1.8s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 粒子对撞:两段光束从顶部同时向两侧流动并在底部汇合爆光 */
.island.do-clash::before {
  opacity: 1;
  background: conic-gradient(
    from var(--flow-angle),
    rgb(var(--sheen-rgb) / calc(var(--sheen-base) * var(--glow-strength))) 0deg 25deg,
    transparent 50deg 180deg,
    rgb(var(--sheen-rgb) / calc(var(--sheen-base) * var(--glow-strength))) 180deg 205deg,
    transparent 230deg 360deg
  );
  animation: island-flow 1.6s ease-in-out;
}

.island.do-clash::after {
  background: radial-gradient(
    circle at 50% 95%,
    rgb(var(--sheen-rgb) / calc(var(--sheen-base) * 0.5 * var(--glow-strength))) 0%,
    transparent 65%
  );
  background-repeat: no-repeat;
  animation: island-clash-burst 1.6s ease-out;
}

@keyframes island-clash-burst {
  0%,
  65% {
    opacity: 0;
    transform: scale(0.5);
  }
  80% {
    opacity: 1;
    transform: scale(1.2);
  }
  100% {
    opacity: 0;
    transform: scale(1.6);
  }
}

/* 极光色散:青蓝/薄荷绿/淡紫在上边缘轻拂流动 */
.island.do-aurora::after {
  background: linear-gradient(
    100deg,
    transparent 15%,
    rgba(56, 189, 248, calc(0.35 * var(--glow-strength))) 35%,
    rgba(52, 211, 153, calc(0.4 * var(--glow-strength))) 50%,
    rgba(167, 139, 250, calc(0.35 * var(--glow-strength))) 65%,
    transparent 85%
  );
  background-repeat: no-repeat;
  background-size: 240% 100%;
  animation: island-aurora 2.2s ease-in-out;
}

@keyframes island-aurora {
  0% {
    background-position: 130% 0;
    opacity: 0;
  }
  20% {
    opacity: 1;
  }
  80% {
    opacity: 1;
  }
  100% {
    background-position: -40% 0;
    opacity: 0;
  }
}

/* 声呐涟漪:从药丸几何中心向外等比发散的椭圆环波 */
.island.do-sonar::after {
  background: radial-gradient(
    ellipse at 50% 50%,
    transparent 30%,
    rgb(var(--sheen-rgb) / calc(var(--sheen-base) * 0.45 * var(--glow-strength))) 48%,
    transparent 65%
  );
  background-repeat: no-repeat;
  background-position: center;
  animation: island-sonar 1.8s ease-out;
}

@keyframes island-sonar {
  0% {
    background-size: 10% 20%;
    opacity: 0;
  }
  25% {
    opacity: 0.9;
  }
  100% {
    background-size: 160% 240%;
    opacity: 0;
  }
}

/* 月食金边:顶边局部高光拉扯延展的日冕冷光 */
.island.do-eclipse::after {
  background: radial-gradient(
    ellipse at 50% 0%,
    rgb(var(--sheen-rgb) / calc(var(--sheen-base) * 0.65 * var(--glow-strength))) 0%,
    transparent 70%
  );
  background-repeat: no-repeat;
  animation: island-eclipse 1.7s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes island-eclipse {
  0% {
    background-size: 10% 80%;
    background-position: 50% 0%;
    opacity: 0;
  }
  25% {
    opacity: 1;
  }
  100% {
    background-size: 95% 140%;
    background-position: 50% 0%;
    opacity: 0;
  }
}

/* ===== 药丸滚轮切换推拉动效 ===== */
.pill-slide-down-enter-active,
.pill-slide-down-leave-active,
.pill-slide-up-enter-active,
.pill-slide-up-leave-active {
  transition: opacity 0.2s var(--ease-spring-soft), transform 0.22s var(--ease-spring);
}

.pill-slide-down-enter-from {
  opacity: 0;
  transform: translateY(-8px) scale(0.98);
}
.pill-slide-down-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}

.pill-slide-up-enter-from {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}
.pill-slide-up-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.98);
}

/* 尊重系统「减少动态效果」:偶发光效与物理动效静止 */
@media (prefers-reduced-motion: reduce) {
  .island::before,
  .island::after {
    animation: none;
    opacity: 0;
  }
  .island,
  .pill-slide-down-enter-active,
  .pill-slide-down-leave-active,
  .pill-slide-up-enter-active,
  .pill-slide-up-leave-active {
    transition: none;
  }
}

/* 窗口透明,页面本体不能有背景色,否则整个矩形会显形 */
html,
body {
  margin: 0;
  background: transparent;
  overflow: hidden;
}
</style>
