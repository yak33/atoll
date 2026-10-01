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
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { getCurrentWindow, LogicalSize, PhysicalPosition } from '@tauri-apps/api/window'
import { listen } from '@tauri-apps/api/event'
import { QuotaPoller } from './core/QuotaPoller'
import {
  loadAppearance,
  loadActiveModule,
  loadCredential,
  loadPillPosition,
  loadPomodoro,
  loadTheme,
  saveActiveModule,
  saveCredential,
  savePillPosition,
  type AppearanceSettings,
  type IslandModule,
  type PillPosition,
  type PomodoroSettings,
  DEFAULT_APPEARANCE,
} from './core/appSettings'
import { initTheme } from './core/theme'
import { applyInitialLayout, resizeInPlace } from './core/windowLayout'
import { detectResetNotifications } from './core/resetNotify'
import { sendToast } from './core/notify'
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
import type { ZhipuCredential } from './adapters/zhipu'
import type { QuotaError, QuotaErrorKind, UsageWindow, ZhipuQuotaSnapshot } from './types'
import IslandPill from './components/IslandPill.vue'
import ExpandedPanel from './components/ExpandedPanel.vue'
import PomodoroPill from './components/PomodoroPill.vue'
import PomodoroPanel from './components/PomodoroPanel.vue'
import SettingsPanel from './components/SettingsPanel.vue'

/** 药丸高度固定 44px(试过做成可调,收益低且和文字排版耦合),宽度跟随用户自定义 */
const PILL_HEIGHT = 44
const SETTINGS_SIZE = new LogicalSize(340, 700)

function pillSize(): LogicalSize {
  return new LogicalSize(appearance.value.pillWidth, PILL_HEIGHT)
}

/** 展开态尺寸按模块:用量面板宽度至少 400 且跟随药丸,番茄面板内容少用固定小尺寸 */
function expandedSize(): LogicalSize {
  if (activeModule.value === 'pomodoro') return new LogicalSize(280, 250)
  return new LogicalSize(Math.max(400, appearance.value.pillWidth), 215)
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

// ===== 模块层:用量监控 / 番茄钟,收起态滚轮切换,选择持久化 =====
const activeModule = ref<IslandModule>('usage')

async function handleSwitchModule(next: IslandModule): Promise<void> {
  if (next === activeModule.value) return
  activeModule.value = next
  try {
    await saveActiveModule(next)
  } catch {
    // 持久化失败不影响本次会话生效
  }
  // 展开态下两个面板尺寸不同,就地伸缩
  if (mode.value === 'expanded') {
    await resizeInPlace(expandedSize())
  }
}

// 滚轮一次滚动会连发多个 wheel 事件,400ms 节流防止来回抖
let lastWheelSwitch = 0
// 滚轮切换滑屏方向: 'down' | 'up'
const wheelDirection = ref<'down' | 'up'>('down')

function handlePillWheel(event?: WheelEvent): void {
  const now = Date.now()
  if (now - lastWheelSwitch < 400) return
  lastWheelSwitch = now
  if (event && event.deltaY < 0) {
    wheelDirection.value = 'up'
  } else {
    wheelDirection.value = 'down'
  }
  void handleSwitchModule(activeModule.value === 'usage' ? 'pomodoro' : 'usage')
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

const poller = new QuotaPoller({
  onData: (data) => {
    const messages = detectResetNotifications(lastSnapshot, data, Date.now())
    lastSnapshot = data
    snapshot.value = data
    quotaError.value = null
    // 窗口重置提醒(toast);不 await,通知失败不影响主流程
    messages.forEach((message) => {
      void sendToast(message)
    })
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
    }
  }, 1000)
})

onBeforeUnmount(() => {
  cancelCollapse()
  cancelBlurClose()
  poller.stop()
  unlistenTray?.()
  stopFullscreenWatch?.()
  disposeTheme?.()
  unlistenFocus?.()
  window.clearInterval(pomoTimer)
})

// ===== 三态切换 =====

/** 状态切换:就地按目标尺寸伸缩;位置有变化才写盘(悬停收展不刷 store) */
async function enterMode(target: IslandMode): Promise<void> {
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

async function handlePillHover(): Promise<void> {
  if (mode.value !== 'pill') return
  cancelCollapse()
  await enterMode('expanded')
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
</script>

<template>
  <!-- 收起态:按模块渲染药丸;滚轮切换模块(带推拉滑屏微动效),悬停展开,点击设置 -->
  <Transition v-if="mode === 'pill'" :name="'pill-slide-' + wheelDirection" mode="out-in">
    <IslandPill
      v-if="activeModule === 'usage'"
      key="usage"
      :win="primary"
      :text="pillText"
      :has-error="quotaError !== null"
      :tooltip="tooltipText"
      :glow-effects="appearance.glowEffects"
      @click="openSettings"
      @mouseenter="handlePillHover"
      @wheel="handlePillWheel"
    />
    <PomodoroPill
      v-else
      key="pomodoro"
      :pomo="pomoView"
      :tooltip="'🍅 番茄钟 · 滚轮切回用量'"
      :glow-effects="appearance.glowEffects"
      @click="openSettings"
      @mouseenter="handlePillHover"
      @wheel="handlePillWheel"
    />
  </Transition>

  <!-- 展开态:按模块渲染面板,顶部 Tab 切换 -->
  <ExpandedPanel
    v-else-if="mode === 'expanded' && activeModule === 'usage'"
    :windows="snapshot?.windows ?? []"
    :plan-level="snapshot?.planLevel ?? ''"
    :source="snapshot?.source ?? 'tokens_limit'"
    :fetched-ago="fetchedAgoText"
    :error="quotaError"
    :refreshing="refreshing"
    :active-module="activeModule"
    @refresh="handleRefresh"
    @settings="openSettings"
    @mouseenter="cancelCollapse"
    @mouseleave="scheduleCollapse"
    @dragstart="handleDragStart"
    @switch-module="handleSwitchModule"
  />
  <PomodoroPanel
    v-else-if="mode === 'expanded'"
    :pomo="pomoView"
    :active-module="activeModule"
    @mouseenter="cancelCollapse"
    @mouseleave="scheduleCollapse"
    @dragstart="handleDragStart"
    @pomo-toggle="handlePomoToggle"
    @pomo-reset="handlePomoReset"
    @switch-module="handleSwitchModule"
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
    @reset-position="handleResetPosition"
    @dragstart="handleDragStart"
  />
</template>

<style>
/* ===== 主题变量:默认深色,html[data-theme='light'] 覆盖为浅色 ===== */
:root {
  --bg-alpha: 1; /* 背景 alpha(0.5-1),由设置面板实时写入;文字不受影响 */
  --surface-rgb: 24 24 27; /* 深色主题背景基色 */
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
  background: rgba(34, 197, 94, 0.16);
  border-color: rgba(34, 197, 94, 0.4);
  color: #4ade80;
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
