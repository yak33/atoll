<script setup lang="ts">
/**
 * 设置面板(M1 最小实现)。
 * 点药丸弹出:智谱凭据表单 + 手动刷新 + 当前状态。
 * 窗口尺寸切换(340x460)由 App.vue 负责,本组件只管表单本身。
 *
 * @author ZHANGCHAO 2026/10/01
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart'
import {
  loadAppearance,
  loadTheme,
  saveAppearance,
  saveTheme,
  DEFAULT_APPEARANCE,
  type AppearanceSettings,
  type GlowEffect,
  type ThemeMode,
} from '../core/appSettings'
import { setThemeMode } from '../core/theme'
import type { ZhipuCredential } from '../adapters/zhipu'

const props = defineProps<{
  initial: ZhipuCredential | null
}>()

const emit = defineEmits<{
  save: [credential: ZhipuCredential]
  appearance: [settings: AppearanceSettings]
  resetPosition: []
  dragstart: []
  close: []
}>()

// ===== 整面板拖动(与展开面板同款):按钮/输入框/标签上按下不参与,
// 避免选中文本、点控件被误判成拖窗 =====
const DRAG_THRESHOLD_PX = 4
let armed = false
let downX = 0
let downY = 0

function onPanelMouseDown(event: MouseEvent): void {
  if (event.button !== 0) return
  if ((event.target as HTMLElement).closest('button, input, textarea, label') !== null) return
  armed = true
  downX = event.clientX
  downY = event.clientY
}

function onPanelMouseMove(event: MouseEvent): void {
  if (!armed) return
  const moved = Math.abs(event.clientX - downX) + Math.abs(event.clientY - downY)
  if (moved > DRAG_THRESHOLD_PX) {
    armed = false
    emit('dragstart')
  }
}

function onPanelMouseUp(): void {
  armed = false
}

const DEFAULT_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4'

const apiKey = ref(props.initial?.apiKey ?? '')
const baseUrl = ref(props.initial?.baseUrl ?? DEFAULT_BASE_URL)
const organizationId = ref(props.initial?.organizationId ?? '')
const projectId = ref(props.initial?.projectId ?? '')
// 自动保存状态文案:空串 = 无事发生,「API Key 为空…」= 阻断提示,「已自动保存」= 成功
const savedAtText = ref('')

// 开机自启:独立于表单保存,切换即生效
const autostartOn = ref(false)

// 主题模式:三选一,切换即时生效并落盘
const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'auto', label: '自动' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
]
const themeMode = ref<ThemeMode>('auto')

// 外观自定义:拖动实时预览(emit 给 App),松手落盘
const appearance = ref<AppearanceSettings>({ ...DEFAULT_APPEARANCE })

// 光效种类:多选按钮组文案(顺序即展示顺序)
const GLOW_LABELS: { value: GlowEffect; label: string }[] = [
  { value: 'flow', label: '边框流光' },
  { value: 'ripple', label: '波纹' },
  { value: 'sweep', label: '扫光' },
]

function applyAppearance(): void {
  // 不透明度直接在这里写 CSS 变量:单跳直达,不依赖跨组件事件链的完整性
  document.documentElement.style.setProperty('--bg-alpha', String(appearance.value.opacity))
  // 光效强度同理;种类由 App 传给药丸组件,收回药丸后生效
  document.documentElement.style.setProperty('--glow-strength', String(appearance.value.glowStrength))
  emit('appearance', { ...appearance.value })
}

/** 切换一种光效:选中则加入池子,取消则移出(全部取消 = 关闭偶发光效) */
function toggleGlow(effect: GlowEffect): void {
  const pool = appearance.value.glowEffects
  appearance.value.glowEffects = pool.includes(effect)
    ? pool.filter((item) => item !== effect)
    : [...pool, effect]
  applyAppearance()
  commitAppearance()
}

async function commitAppearance(): Promise<void> {
  try {
    await saveAppearance(appearance.value)
  } catch {
    // 持久化失败不影响本次会话生效
  }
}

onMounted(async () => {
  themeMode.value = await loadTheme()
  appearance.value = await loadAppearance()
  try {
    autostartOn.value = await isEnabled()
  } catch {
    // 查询失败保持默认不勾选
  }
})

async function handleTheme(mode: ThemeMode): Promise<void> {
  themeMode.value = mode
  setThemeMode(mode)
  try {
    await saveTheme(mode)
  } catch {
    // 持久化失败不影响本次会话生效
  }
}

async function handleAutostartToggle(): Promise<void> {
  try {
    if (autostartOn.value) {
      await enable()
    } else {
      await disable()
    }
  } catch {
    // 失败回滚勾选状态
    autostartOn.value = !autostartOn.value
  }
}

// ===== 凭据表单:防抖自动保存(800ms 无输入后落盘),无保存按钮 =====

const AUTOSAVE_DELAY_MS = 800
let saveTimer: number | null = null
let dirty = false
// 与「上次已提交」比较,改回原值时不触发无谓的保存与轮询重启
let lastSavedJson = JSON.stringify(props.initial ?? null)

watch([apiKey, baseUrl, organizationId, projectId], () => {
  dirty = true
  if (saveTimer !== null) clearTimeout(saveTimer)
  saveTimer = window.setTimeout(commitCredential, AUTOSAVE_DELAY_MS)
})

function commitCredential(): void {
  saveTimer = null
  if (!dirty) return
  dirty = false

  if (apiKey.value.trim() === '') {
    savedAtText.value = 'API Key 为空,当前输入未保存'
    return
  }
  const credential: ZhipuCredential = {
    apiKey: apiKey.value.trim(),
    baseUrl: baseUrl.value.trim() || DEFAULT_BASE_URL,
  }
  // 团队版字段:非空才写入,空串不入库,保证 organizationId 非空 == 团队版语义
  const org = organizationId.value.trim()
  if (org !== '') credential.organizationId = org
  const project = projectId.value.trim()
  if (project !== '') credential.projectId = project

  const json = JSON.stringify(credential)
  if (json === lastSavedJson) {
    savedAtText.value = ''
    return
  }
  lastSavedJson = json
  emit('save', credential)
  savedAtText.value = '已自动保存'
}

// 关闭面板时冲刷未落盘的输入,防抖窗口内的改动不丢
onBeforeUnmount(() => {
  if (saveTimer !== null) {
    clearTimeout(saveTimer)
    commitCredential()
  }
})
</script>

<template>
  <div
    class="panel"
    @mousedown="onPanelMouseDown"
    @mousemove="onPanelMouseMove"
    @mouseup="onPanelMouseUp"
  >
    <div class="header">
      <span class="title">atoll 设置</span>
      <button class="close-btn" type="button" @click="emit('close')">✕</button>
    </div>

    <div class="form">
      <label class="field">
        <span class="field-label">API Key *</span>
        <input v-model="apiKey" type="password" class="input" placeholder="智谱开放平台 API Key" autocomplete="off" />
      </label>

      <label class="field">
        <span class="field-label">base_url</span>
        <input v-model="baseUrl" type="text" class="input" placeholder="https://open.bigmodel.cn/api/paas/v4" />
        <span class="field-hint">含 bigmodel.cn / z.ai 自动匹配额度主机,其他域名回落国内站</span>
      </label>

      <div class="section-title">团队版(个人版留空)</div>
      <label class="field">
        <span class="field-label">组织 ID</span>
        <input v-model="organizationId" type="text" class="input" placeholder="bigmodel-organization" autocomplete="off" />
      </label>
      <label class="field">
        <span class="field-label">项目 ID(可选)</span>
        <input v-model="projectId" type="text" class="input" placeholder="bigmodel-project" autocomplete="off" />
      </label>
      <span class="field-hint">团队版必填组织 ID,否则官方返回「当前用户不存在coding plan」</span>

      <div class="section-title">外观</div>
      <div class="theme-row">
        <button
          v-for="option in THEME_OPTIONS"
          :key="option.value"
          :class="['theme-btn', themeMode === option.value ? 'theme-btn-active' : '']"
          type="button"
          @click="handleTheme(option.value)"
        >
          {{ option.label }}
        </button>
      </div>

      <div class="slider-field">
        <div class="slider-head">
          <span class="field-label">不透明度</span>
          <span class="slider-value">{{ Math.round(appearance.opacity * 100) }}%</span>
        </div>
        <input
          v-model.number="appearance.opacity"
          type="range"
          class="slider"
          min="0.5"
          max="1"
          step="0.05"
          @input="applyAppearance"
          @change="commitAppearance"
        />
      </div>

      <div class="section-title">胶囊</div>
      <div class="slider-field">
        <div class="slider-head">
          <span class="field-label">长度</span>
          <span class="slider-value">{{ appearance.pillWidth }}px</span>
        </div>
        <input
          v-model.number="appearance.pillWidth"
          type="range"
          class="slider"
          min="180"
          max="420"
          step="10"
          @input="applyAppearance"
          @change="commitAppearance"
        />
      </div>
      <span class="field-hint">长度在收回药丸后生效;拖动展开面板标题行可移动位置</span>

      <div class="slider-head">
        <span class="field-label">偶发光效</span>
        <span class="slider-value">{{ appearance.glowEffects.length === 0 ? '关闭' : `${appearance.glowEffects.length} 种` }}</span>
      </div>
      <div class="theme-row">
        <button
          v-for="option in GLOW_LABELS"
          :key="option.value"
          :class="['theme-btn', appearance.glowEffects.includes(option.value) ? 'theme-btn-active' : '']"
          type="button"
          @click="toggleGlow(option.value)"
        >
          {{ option.label }}
        </button>
      </div>

      <div class="slider-field">
        <div class="slider-head">
          <span class="field-label">光效强度</span>
          <span class="slider-value">{{ Math.round(appearance.glowStrength * 100) }}%</span>
        </div>
        <input
          v-model.number="appearance.glowStrength"
          type="range"
          class="slider"
          min="0.2"
          max="1"
          step="0.05"
          @input="applyAppearance"
          @change="commitAppearance"
        />
      </div>
      <span class="field-hint">种类与强度在收回药丸后生效;每次随机间隔 8~18 秒播放一种</span>

      <button class="reset-pos-btn" type="button" @click="emit('resetPosition')">重置窗口位置(回到顶部居中)</button>

      <div class="section-title">系统</div>
      <label class="toggle-row">
        <input v-model="autostartOn" type="checkbox" class="checkbox" @change="handleAutostartToggle" />
        <span class="field-label">开机自动启动</span>
      </label>

      <div class="autosave-status">{{ savedAtText || '更改即时保存' }}</div>
    </div>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  /* 100vh 而非 100%:根组件的父级是 body(无高度),百分比会退化成内容高度,
     内容一超出窗口就被窗口矩形裁掉圆角 */
  height: 100vh;
  box-sizing: border-box;
  border-radius: 16px;
  background: var(--bg-panel);
  border: 1px solid var(--pill-border);
  color: var(--text-primary);
  font-family: 'Segoe UI', system-ui, sans-serif;
  font-size: 12px;
  padding: 14px 16px 16px;
  user-select: none;
  overflow-y: auto;
  cursor: grab;
}

.panel:active {
  cursor: grabbing;
}

/* 可交互元素保持自己的光标语义 */
.input {
  cursor: text;
}

/* 细窄暗色滚动条,替代 WebView 默认的白色粗滚动条;浅色主题下改为深色 thumb */
.panel::-webkit-scrollbar {
  width: 6px;
}

.panel::-webkit-scrollbar-thumb {
  background: var(--border-soft);
  border-radius: 3px;
}

.panel::-webkit-scrollbar-track {
  background: transparent;
}

/* 主题三选一分段控件 */
.theme-row {
  display: flex;
  gap: 6px;
}

.theme-btn {
  flex: 1;
  height: 26px;
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
}

.theme-btn:hover {
  color: var(--text-primary);
}

.theme-btn-active {
  background: rgba(34, 197, 94, 0.16);
  border-color: rgba(34, 197, 94, 0.4);
  color: #4ade80;
}

/* 滑杆字段:标签 + 当前值 + range */
.slider-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.slider-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.slider-value {
  font-size: 11px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.slider {
  width: 100%;
  height: 18px;
  accent-color: #22c55e;
  cursor: pointer;
}

.reset-pos-btn {
  align-self: flex-start;
  height: 24px;
  padding: 0 10px;
  border: 1px solid var(--border-soft);
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 10px;
  font-family: inherit;
  cursor: pointer;
}

.reset-pos-btn:hover {
  color: var(--text-primary);
}

.toggle-row {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.checkbox {
  accent-color: #22c55e;
  width: 14px;
  height: 14px;
  cursor: pointer;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.title {
  font-size: 13px;
  font-weight: 600;
}

.close-btn {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 6px;
}

.close-btn:hover {
  background: var(--surface-overlay);
  color: var(--text-primary);
}

.form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-label {
  font-size: 11px;
  color: var(--text-secondary);
}

.field-hint {
  font-size: 10px;
  color: var(--text-muted);
  line-height: 1.4;
}

.input {
  box-sizing: border-box;
  width: 100%;
  height: 30px;
  padding: 0 8px;
  border-radius: 8px;
  border: 1px solid var(--border-soft);
  background: var(--surface-overlay);
  color: var(--text-primary);
  font-size: 12px;
  font-family: inherit;
  outline: none;
}

.input:focus {
  border-color: #22c55e;
}

.section-title {
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-muted);
  border-top: 1px solid var(--divider);
  padding-top: 10px;
}

/* 自动保存状态行:固定最小高度避免出现/消失时布局抖动 */
.autosave-status {
  min-height: 16px;
  margin-top: 8px;
  font-size: 10px;
  color: var(--text-muted);
  text-align: right;
}
</style>
