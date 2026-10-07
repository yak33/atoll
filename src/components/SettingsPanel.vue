<script setup lang="ts">
/**
 * 设置面板。
 * 顶部模块 Tab(用量/番茄)分区:模块各自的设置项 + 底部公共区(外观/胶囊/系统)。
 * 窗口尺寸切换(340x700)由 App.vue 负责,本组件只管表单本身。
 *
 * @author ZHANGCHAO 2026/10/01
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart'
import {
  loadAppearance,
  loadDockFoldEnabled,
  loadTrayVisible,
  loadClipboardEnabled,
  loadPomodoro,
  loadTheme,
  loadUsageAlerts,
  saveAppearance,
  savePomodoro,
  saveTheme,
  saveUsageAlerts,
  normalizeUsageAlerts,
  DEFAULT_APPEARANCE,
  DEFAULT_POMODORO,
  DEFAULT_USAGE_ALERTS,
  GLOW_EFFECTS,
  type AppearanceSettings,
  type GlowEffect,
  type IslandModule,
  type PomodoroSettings,
  type SkinTheme,
  type ThemeMode,
  type UsageAlerts,
} from '../core/appSettings'
import { setThemeMode, setSkin, SKIN_OPTIONS } from '../core/theme'
import type { ZhipuCredential } from '../adapters/zhipu'

const props = defineProps<{
  initial: ZhipuCredential | null
  /** 当前激活模块:决定设置面板初始落在哪个 Tab(仅初始,切换不影响药丸模块) */
  activeModule: IslandModule
}>()

const emit = defineEmits<{
  save: [credential: ZhipuCredential]
  appearance: [settings: AppearanceSettings]
  pomoDurations: [settings: PomodoroSettings]
  usageAlerts: [settings: UsageAlerts]
  clipboardEnabled: [enabled: boolean]
  clipboardClear: []
  dockFoldEnabled: [enabled: boolean]
  trayVisible: [visible: boolean]
  quit: []
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

// 光效种类分组(解决设置面板平铺 11 种按钮导致的臃肿)
const GLOW_GROUPS: {
  title: string
  items: { value: GlowEffect; label: string }[]
}[] = [
  {
    title: '轮廓流光',
    items: [
      { value: 'flow', label: '边框流光' },
      { value: 'comet', label: '彗星' },
      { value: 'dual', label: '双流光' },
      { value: 'clash', label: '粒子对撞' },
    ],
  },
  {
    title: '波纹声呐',
    items: [
      { value: 'ripple', label: '波纹' },
      { value: 'sonar', label: '声呐' },
      { value: 'twin', label: '双波汇流' },
    ],
  },
  {
    title: '微光氛围',
    items: [
      { value: 'aurora', label: '极光' },
      { value: 'eclipse', label: '月食' },
      { value: 'sweep', label: '扫光' },
      { value: 'sparkle', label: '星火' },
    ],
  },
]

// 细项是否展开(默认折叠,设置面板保持精简清爽)
const glowExpanded = ref(false)

function toggleAllGlow(enable: boolean): void {
  appearance.value.glowEffects = enable ? [...GLOW_EFFECTS] : []
  applyAppearance()
  commitAppearance()
}

function applyAppearance(): void {
  // 不透明度直接在这里写 CSS 变量:单跳直达,不依赖跨组件事件链的完整性
  document.documentElement.style.setProperty('--bg-alpha', String(appearance.value.opacity))
  // 光效强度同理;种类由 App 传给药丸组件,收回药丸后生效
  document.documentElement.style.setProperty('--glow-strength', String(appearance.value.glowStrength))
  document.documentElement.dataset.skin = appearance.value.skin
  emit('appearance', { ...appearance.value })
}

function handleSkin(skin: SkinTheme): void {
  appearance.value.skin = skin
  setSkin(skin)
  applyAppearance()
  commitAppearance()
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

// 模块设置 Tab:初始跟随当前激活模块,面板内切换不影响药丸
const settingsTab = ref<IslandModule>('usage')

// 番茄钟时长(分钟):拖动实时 emit(未运行时药丸立即变化),松手落盘
const pomoCfg = ref<PomodoroSettings>({ ...DEFAULT_POMODORO })

function applyPomoDurations(): void {
  emit('pomoDurations', { ...pomoCfg.value })
}

async function commitPomoDurations(): Promise<void> {
  try {
    await savePomodoro(pomoCfg.value)
  } catch {
    // 持久化失败不影响本次会话生效
  }
}

// 用量告警阈值:拖动实时 emit(药丸即时变色),松手落盘;normalize 保证 warn < critical
const alerts = ref<UsageAlerts>({ ...DEFAULT_USAGE_ALERTS })

// 剪贴板记录开关:切换即生效并落盘(隐私急停)
const clipboardOn = ref(true)
// 托盘图标显示开关(默认显示;托盘菜单「隐藏托盘图标」也会写入该状态)
const trayVisibleOn = ref(true)
// 贴顶自动折叠开关(默认开;关闭 = 永远保持完整胶囊)
const dockFoldOn = ref(true)

function handleClipboardToggle(enabled: boolean): void {
  clipboardOn.value = enabled
  emit('clipboardEnabled', enabled)
}

function applyAlerts(): void {
  alerts.value = normalizeUsageAlerts(alerts.value.warnAt, alerts.value.criticalAt)
  emit('usageAlerts', { ...alerts.value })
}

async function commitAlerts(): Promise<void> {
  try {
    await saveUsageAlerts(alerts.value)
  } catch {
    // 持久化失败不影响本次会话生效
  }
}

onMounted(async () => {
  settingsTab.value = props.activeModule
  themeMode.value = await loadTheme()
  appearance.value = await loadAppearance()
  pomoCfg.value = await loadPomodoro()
  alerts.value = await loadUsageAlerts()
  clipboardOn.value = await loadClipboardEnabled()
  dockFoldOn.value = await loadDockFoldEnabled()
  trayVisibleOn.value = await loadTrayVisible()
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

    <div class="module-tabs">
      <button :class="['tab-btn', settingsTab === 'usage' ? 'tab-btn-active' : '']" type="button" @click="settingsTab = 'usage'">用量</button>
      <button :class="['tab-btn', settingsTab === 'pomodoro' ? 'tab-btn-active' : '']" type="button" @click="settingsTab = 'pomodoro'">番茄</button>
      <button :class="['tab-btn', settingsTab === 'clipboard' ? 'tab-btn-active' : '']" type="button" @click="settingsTab = 'clipboard'">剪贴</button>
    </div>

    <!-- ===== 用量模块设置 ===== -->
    <template v-if="settingsTab === 'usage'">
      <label class="field">
        <span class="field-label">API Key *</span>
        <input v-model="apiKey" type="password" class="input" placeholder="智谱开放平台 API Key" autocomplete="off" />
      </label>

      <label class="field">
        <span class="field-label">base_url</span>
        <input v-model="baseUrl" type="text" class="input" placeholder="https://open.bigmodel.cn/api/paas/v4" />
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

      <div class="section-title">告警阈值</div>
      <div class="slider-field">
        <div class="slider-head">
          <span class="field-label">琥珀留意</span>
          <span class="slider-value">≥ {{ alerts.warnAt }}%</span>
        </div>
        <input
          v-model.number="alerts.warnAt"
          type="range"
          class="slider"
          min="50"
          max="97"
          step="1"
          @input="applyAlerts"
          @change="commitAlerts"
        />
      </div>
      <div class="slider-field">
        <div class="slider-head">
          <span class="field-label">红色告警</span>
          <span class="slider-value">≥ {{ alerts.criticalAt }}%</span>
        </div>
        <input
          v-model.number="alerts.criticalAt"
          type="range"
          class="slider"
          min="51"
          max="99"
          step="1"
          @input="applyAlerts"
          @change="commitAlerts"
        />
      </div>
    </template>

    <!-- ===== 番茄钟模块设置 ===== -->
    <template v-else-if="settingsTab === 'pomodoro'">
      <div class="slider-field">
        <div class="slider-head">
          <span class="field-label">工作时长</span>
          <span class="slider-value">{{ pomoCfg.workMin }} 分钟</span>
        </div>
        <input
          v-model.number="pomoCfg.workMin"
          type="range"
          class="slider"
          min="5"
          max="60"
          step="5"
          @input="applyPomoDurations"
          @change="commitPomoDurations"
        />
      </div>
      <div class="slider-field">
        <div class="slider-head">
          <span class="field-label">休息时长</span>
          <span class="slider-value">{{ pomoCfg.breakMin }} 分钟</span>
        </div>
        <input
          v-model.number="pomoCfg.breakMin"
          type="range"
          class="slider"
          min="1"
          max="30"
          step="1"
          @input="applyPomoDurations"
          @change="commitPomoDurations"
        />
      </div>
      <span class="field-hint">进行中的阶段按原时长走完,下一阶段生效;重置立即应用当前配置</span>
    </template>

    <!-- ===== 剪贴板模块设置 ===== -->
    <template v-else-if="settingsTab === 'clipboard'">
      <label class="toggle-row">
        <input
          :checked="clipboardOn"
          type="checkbox"
          class="checkbox"
          @change="handleClipboardToggle(($event.target as HTMLInputElement).checked)"
        />
        <span class="field-label">记录剪贴板历史</span>
      </label>
      <span class="field-hint">
        仅记录纯文本(图像/文件忽略),重复复制自动去重置顶;上限 200 条,置顶条目豁免淘汰。
        数据只保存在本机,不联网不上传。敏感内容建议及时删除或关闭记录。
      </span>
      <button class="reset-pos-btn" type="button" @click="emit('clipboardClear')">清空全部历史(含置顶)</button>
    </template>

    <!-- ===== 公共区:外观 / 胶囊 / 系统 ===== -->
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

    <div class="field-label" style="margin-top: 2px">皮肤预设</div>
    <div class="skin-grid">
      <button
        v-for="skin in SKIN_OPTIONS"
        :key="skin.value"
        :class="['skin-btn', appearance.skin === skin.value ? 'skin-btn-active' : '']"
        type="button"
        @click="handleSkin(skin.value)"
      >
        <span class="skin-dot" :style="{ background: skin.previewColor }"></span>
        <span class="skin-name">{{ skin.label }}</span>
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

    <div class="glow-header">
      <div class="slider-head" style="flex: 1">
        <span class="field-label">偶发光效</span>
        <span class="slider-value">
          {{ appearance.glowEffects.length === 0 ? '已关闭' : `${appearance.glowEffects.length}/${GLOW_EFFECTS.length} 种` }}
        </span>
      </div>
      <div class="glow-actions">
        <button
          class="glow-action-btn"
          type="button"
          @click="toggleAllGlow(appearance.glowEffects.length < GLOW_EFFECTS.length)"
        >
          {{ appearance.glowEffects.length === GLOW_EFFECTS.length ? '全部关闭' : '全部开启' }}
        </button>
        <button
          :class="['glow-action-btn', glowExpanded ? 'glow-action-btn-active' : '']"
          type="button"
          @click="glowExpanded = !glowExpanded"
        >
          {{ glowExpanded ? '收起 ▴' : '自定义 ▾' }}
        </button>
      </div>
    </div>

    <!-- 折叠区域:仅当点击「自定义 ▾」时展开,平时不占高度,告别臃肿 -->
    <div v-if="glowExpanded" class="glow-groups-box">
      <div v-for="group in GLOW_GROUPS" :key="group.title" class="glow-group">
        <div class="glow-group-title">{{ group.title }}</div>
        <div class="glow-group-tags">
          <button
            v-for="item in group.items"
            :key="item.value"
            :class="['tag-btn', appearance.glowEffects.includes(item.value) ? 'tag-btn-active' : '']"
            type="button"
            @click="toggleGlow(item.value)"
          >
            {{ item.label }}
          </button>
        </div>
      </div>
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

    <button class="reset-pos-btn" type="button" @click="emit('resetPosition')">重置窗口位置(回到顶部居中)</button>

    <div class="section-title">系统</div>
    <label class="toggle-row">
      <input v-model="autostartOn" type="checkbox" class="checkbox" @change="handleAutostartToggle" />
      <span class="field-label">开机自动启动</span>
    </label>

    <label class="toggle-row">
      <input
        :checked="dockFoldOn"
        type="checkbox"
        class="checkbox"
        @change="dockFoldOn = ($event.target as HTMLInputElement).checked; emit('dockFoldEnabled', dockFoldOn)"
      />
      <span class="field-label">贴顶自动折叠</span>
    </label>
    <span class="field-hint">贴顶静止 3 秒后折叠为 3px 霓虹横条,移入即恢复;关闭后永远保持完整胶囊</span>

    <label class="toggle-row">
      <input
        :checked="trayVisibleOn"
        type="checkbox"
        class="checkbox"
        @change="trayVisibleOn = ($event.target as HTMLInputElement).checked; emit('trayVisible', trayVisibleOn)"
      />
      <span class="field-label">显示托盘图标</span>
    </label>
    <span class="field-hint">关闭后托盘图标隐藏,在此处随时恢复</span>

    <button class="reset-pos-btn" type="button" @click="emit('quit')">退出 atoll</button>

    <!-- 状态反馈:仅在有事发生时出现(自动保存成功/凭据为空阻断),平时不占视觉 -->
    <div v-if="savedAtText !== ''" class="autosave-status">{{ savedAtText }}</div>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
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
  transform-origin: top center;
  animation: panel-spring-in 0.32s var(--ease-spring);
}

.panel:active {
  cursor: grabbing;
}

@keyframes panel-spring-in {
  0% {
    opacity: 0.15;
    transform: translateY(-16px) scale(0.92, 0.4);
    filter: blur(4px);
  }
  65% {
    opacity: 1;
    transform: translateY(2px) scale(1.015, 1.02);
    filter: blur(0);
  }
  85% {
    transform: translateY(-0.5px) scale(0.998, 0.998);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1, 1);
    filter: blur(0);
  }
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

/* 分段控件/多选按钮组:可换行,每行最多三个 */
.theme-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.theme-btn {
  flex: 1 0 30%;
  height: 26px;
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
}

.theme-btn:hover {
  color: var(--text-primary);
}

.theme-btn-active {
  background: rgba(var(--accent-rgb) / 0.16);
  border-color: rgba(var(--accent-rgb) / 0.4);
  color: var(--accent-color);
}

/* 皮肤预设选择网格:两行三列 */
.skin-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.skin-btn {
  flex: 1 0 30%;
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.15s ease;
}

.skin-btn:hover {
  color: var(--text-primary);
  border-color: rgba(255, 255, 255, 0.25);
}

.skin-btn-active {
  background: rgba(var(--accent-rgb) / 0.16);
  border-color: rgba(var(--accent-rgb) / 0.4);
  color: var(--accent-color);
  font-weight: 600;
}

.skin-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 4px currentColor;
}

.skin-name {
  font-size: 11px;
}

/* 偶发光效:紧凑折叠栏与快捷按钮 */
.glow-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.glow-actions {
  display: flex;
  gap: 6px;
}

.glow-action-btn {
  height: 20px;
  padding: 0 7px;
  border: 1px solid var(--border-soft);
  border-radius: 6px;
  background: var(--surface-overlay);
  color: var(--text-secondary);
  font-size: 10px;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
}

.glow-action-btn:hover {
  color: var(--text-primary);
  border-color: rgba(255, 255, 255, 0.25);
}

.glow-action-btn-active {
  background: rgba(var(--accent-rgb) / 0.16);
  border-color: rgba(var(--accent-rgb) / 0.4);
  color: var(--accent-color);
}

.glow-groups-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--surface-overlay);
  border: 1px solid var(--border-soft);
}

.glow-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.glow-group-title {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
}

.glow-group-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tag-btn {
  height: 22px;
  padding: 0 8px;
  border: 1px solid var(--border-soft);
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 10px;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
}

.tag-btn:hover {
  color: var(--text-primary);
}

.tag-btn-active {
  background: rgba(var(--accent-rgb) / 0.16);
  border-color: rgba(var(--accent-rgb) / 0.4);
  color: var(--accent-color);
  font-weight: 600;
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
  accent-color: var(--accent-color, #22c55e);
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
  accent-color: var(--accent-color, #22c55e);
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
  border-color: var(--accent-color, #22c55e);
}

.section-title {
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-muted);
  border-top: 1px solid var(--divider);
  padding-top: 10px;
}

/* 自动保存状态行:仅在有事发生时渲染 */
.autosave-status {
  margin-top: 8px;
  font-size: 10px;
  color: var(--text-muted);
  text-align: right;
}

/* 尊重系统「减少动态效果」:面板弹簧入场退化为直接显示 */
@media (prefers-reduced-motion: reduce) {
  .panel,
  .panel > * {
    animation: none !important;
  }
}
</style>