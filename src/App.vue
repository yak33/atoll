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
import { LogicalSize } from '@tauri-apps/api/window'
import { QuotaPoller } from './core/QuotaPoller'
import { loadCredential, saveCredential } from './core/credentialStore'
import { applyTopCenteredLayout } from './core/windowLayout'
import { detectResetNotifications } from './core/resetNotify'
import { sendToast } from './core/notify'
import { nowTick } from './composables/nowTick'
import type { ZhipuCredential } from './adapters/zhipu'
import type { QuotaError, QuotaErrorKind, UsageWindow, ZhipuQuotaSnapshot } from './types'
import IslandPill from './components/IslandPill.vue'
import ExpandedPanel from './components/ExpandedPanel.vue'
import SettingsPanel from './components/SettingsPanel.vue'

const PILL_SIZE = new LogicalSize(260, 44)
const EXPANDED_SIZE = new LogicalSize(400, 210)
const SETTINGS_SIZE = new LogicalSize(340, 470)
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

let collapseTimer: number | null = null

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
  await applyTopCenteredLayout(PILL_SIZE)
  credential.value = await loadCredential()
  booting.value = false
  if (credential.value !== null) {
    poller.start(credential.value)
  }
})

onBeforeUnmount(() => {
  cancelCollapse()
  poller.stop()
})

// ===== 三态切换 =====

async function enterMode(target: IslandMode): Promise<void> {
  mode.value = target
  const size = target === 'settings' ? SETTINGS_SIZE : target === 'expanded' ? EXPANDED_SIZE : PILL_SIZE
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
  await enterMode('pill')
}

// ===== 数据操作 =====

async function handleSave(next: ZhipuCredential): Promise<void> {
  await saveCredential(next)
  credential.value = next
  snapshot.value = null
  lastSnapshot = null
  quotaError.value = null
  await closeSettings()
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

  <!-- 设置态 -->
  <div v-else class="settings-wrap">
    <SettingsPanel :initial="credential" @save="handleSave" @close="closeSettings" />
    <div class="status-bar">
      <span v-if="credential === null" class="status-text">未配置凭据,填入 API Key 后保存</span>
      <template v-else>
        <span class="status-text">
          <template v-if="quotaError">{{ ERROR_SHORT[quotaError.kind] }} · {{ quotaError.message }}</template>
          <template v-else-if="snapshot">{{ snapshot.planLevel || '未知套餐' }} · 更新于 {{ fetchedAgoText }}</template>
          <template v-else>加载中…</template>
        </span>
        <button class="refresh-btn" type="button" :disabled="refreshing" @click="handleRefresh">
          {{ refreshing ? '刷新中…' : '刷新' }}
        </button>
      </template>
    </div>
  </div>
</template>

<style>
/* 窗口透明,页面本体不能有背景色,否则整个矩形会显形 */
html,
body {
  margin: 0;
  background: transparent;
  overflow: hidden;
}
</style>

<style scoped>
.settings-wrap {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.settings-wrap > :first-child {
  flex: 1;
  min-height: 0;
}

.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  box-sizing: border-box;
  margin: 0 10px 10px;
  padding: 6px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
}

.status-text {
  font-size: 11px;
  color: #a1a1aa;
  font-family: 'Segoe UI', system-ui, sans-serif;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.refresh-btn {
  flex-shrink: 0;
  height: 24px;
  padding: 0 12px;
  border: none;
  border-radius: 6px;
  background: rgba(34, 197, 94, 0.16);
  color: #4ade80;
  font-size: 11px;
  font-weight: 600;
  font-family: 'Segoe UI', system-ui, sans-serif;
  cursor: pointer;
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
