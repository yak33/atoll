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
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window'
import { listen } from '@tauri-apps/api/event'
import { QuotaPoller } from './core/QuotaPoller'
import {
  loadAppearance,
  loadCredential,
  loadTheme,
  saveCredential,
  type AppearanceSettings,
  DEFAULT_APPEARANCE,
} from './core/appSettings'
import { initTheme } from './core/theme'
import { applyTopCenteredLayout } from './core/windowLayout'
import { detectResetNotifications } from './core/resetNotify'
import { sendToast } from './core/notify'
import { startFullscreenWatch } from './core/fullscreenWatch'
import { nowTick } from './composables/nowTick'
import type { ZhipuCredential } from './adapters/zhipu'
import type { QuotaError, QuotaErrorKind, UsageWindow, ZhipuQuotaSnapshot } from './types'
import IslandPill from './components/IslandPill.vue'
import ExpandedPanel from './components/ExpandedPanel.vue'
import SettingsPanel from './components/SettingsPanel.vue'

/** 药丸态窗口尺寸跟随用户自定义的胶囊大小 */
const SETTINGS_SIZE = new LogicalSize(340, 700)

function pillSize(): LogicalSize {
  return new LogicalSize(appearance.value.pillWidth, appearance.value.pillHeight)
}

/** 展开态宽度至少 400,胶囊更长时跟随胶囊,避免展开反而比药丸窄 */
function expandedSize(): LogicalSize {
  return new LogicalSize(Math.max(400, appearance.value.pillWidth), 185)
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

function applyOpacityVar(): void {
  document.documentElement.style.setProperty('--widget-opacity', String(appearance.value.opacity))
}

async function handleAppearance(next: AppearanceSettings): Promise<void> {
  appearance.value = next
  applyOpacityVar()
  if (mode.value === 'pill') {
    await applyTopCenteredLayout(pillSize())
  }
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
  applyOpacityVar()
  await applyTopCenteredLayout(pillSize())
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
})

onBeforeUnmount(() => {
  cancelCollapse()
  cancelBlurClose()
  poller.stop()
  unlistenTray?.()
  stopFullscreenWatch?.()
  disposeTheme?.()
  unlistenFocus?.()
})

// ===== 三态切换 =====

async function enterMode(target: IslandMode): Promise<void> {
  mode.value = target
  const size = target === 'settings' ? SETTINGS_SIZE : target === 'expanded' ? expandedSize() : pillSize()
  await applyTopCenteredLayout(size)
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
  <!-- 收起态:悬停展开,点击设置 -->
  <IslandPill
    v-if="mode === 'pill'"
    :win="primary"
    :text="pillText"
    :has-error="quotaError !== null"
    :tooltip="tooltipText"
    @click="openSettings"
    @mouseenter="handlePillHover"
  />

  <!-- 展开态:悬停保持,离开 500ms 收回 -->
  <ExpandedPanel
    v-else-if="mode === 'expanded'"
    :windows="snapshot?.windows ?? []"
    :plan-level="snapshot?.planLevel ?? ''"
    :source="snapshot?.source ?? 'tokens_limit'"
    :fetched-ago="fetchedAgoText"
    :error="quotaError"
    :refreshing="refreshing"
    @refresh="handleRefresh"
    @settings="openSettings"
    @mouseenter="cancelCollapse"
    @mouseleave="scheduleCollapse"
  />

  <!-- 设置态:数据查看与手动刷新都在悬停展开面板里,这里只管设置 -->
  <SettingsPanel v-else :initial="credential" @save="handleSave" @close="closeSettings" @appearance="handleAppearance" />
</template>

<style>
/* ===== 主题变量:默认深色,html[data-theme='light'] 覆盖为浅色 ===== */
:root {
  --widget-opacity: 1; /* 整体不透明度,由设置面板实时写入 */
  --bg-surface: rgba(24, 24, 27, 0.92); /* 药丸 */
  --bg-panel: rgba(24, 24, 27, 0.96); /* 展开面板/设置面板 */
  --pill-border: transparent;
  --text-primary: #e4e4e7;
  --text-secondary: #a1a1aa;
  --text-muted: #71717a;
  --track-bg: rgba(255, 255, 255, 0.12); /* 进度条底槽 */
  --border-soft: rgba(255, 255, 255, 0.14); /* 输入框描边 */
  --divider: rgba(255, 255, 255, 0.08); /* 分隔线 */
  --surface-overlay: rgba(255, 255, 255, 0.06); /* 状态条/输入框底 */
  --btn-bg: rgba(255, 255, 255, 0.08); /* 次级按钮 */
}

html[data-theme='light'] {
  --bg-surface: rgba(255, 255, 255, 0.94);
  --bg-panel: rgba(255, 255, 255, 0.98);
  --pill-border: rgba(9, 9, 11, 0.08); /* 浅色背景上给药丸一点描边防止融入壁纸 */
  --text-primary: #27272a;
  --text-secondary: #52525b;
  --text-muted: #71717a;
  --track-bg: rgba(9, 9, 11, 0.1);
  --border-soft: rgba(9, 9, 11, 0.16);
  --divider: rgba(9, 9, 11, 0.08);
  --surface-overlay: rgba(9, 9, 11, 0.05);
  --btn-bg: rgba(9, 9, 11, 0.06);
}

/* 窗口透明,页面本体不能有背景色,否则整个矩形会显形 */
html,
body {
  margin: 0;
  background: transparent;
  overflow: hidden;
}
</style>
