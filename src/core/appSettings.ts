/**
 * 应用设置持久化(core 层):智谱凭据 + 主题模式。
 * tauri-plugin-store 落盘到 %APPDATA%/com.atoll.app/,与 WebView 的
 * localStorage 解耦,换打包方式不丢数据。
 *
 * @author ZHANGCHAO 2026/10/01
 */
import { load } from '@tauri-apps/plugin-store'
import type { ZhipuCredential } from '../adapters/zhipu'
import type { UsageHistoryPoint } from './usageHistory'
import type { ClipboardItem } from './clipboardHistory'

const STORE_FILE = 'settings.json'
const CREDENTIAL_KEY = 'zhipu_credential'
const THEME_KEY = 'theme'
const ACTIVE_MODULE_KEY = 'active_module'

/** 当前激活的灵动岛模块:用量监控 / 番茄钟 / 剪贴板 */
export type IslandModule = 'usage' | 'pomodoro' | 'clipboard'

export async function loadActiveModule(): Promise<IslandModule> {
  try {
    const store = await getStore()
    const value = await store.get<IslandModule>(ACTIVE_MODULE_KEY)
    if (value === 'usage' || value === 'pomodoro' || value === 'clipboard') return value
  } catch {
    // 读取失败回落用量监控
  }
  return 'usage'
}

export async function saveActiveModule(module: IslandModule): Promise<void> {
  const store = await getStore()
  await store.set(ACTIVE_MODULE_KEY, module)
  await store.save()
}

/** 主题模式:auto = 跟随 Windows 系统深浅色 */
export type ThemeMode = 'auto' | 'light' | 'dark'

/** 药丸偶发光效种类(全不选 = 关闭) */
export type GlowEffect =
  | 'flow'
  | 'comet'
  | 'dual'
  | 'clash'
  | 'ripple'
  | 'sonar'
  | 'twin'
  | 'aurora'
  | 'eclipse'
  | 'sweep'
  | 'sparkle'

export const GLOW_EFFECTS: GlowEffect[] = [
  'flow',
  'comet',
  'dual',
  'clash',
  'ripple',
  'sonar',
  'twin',
  'aurora',
  'eclipse',
  'sweep',
  'sparkle',
]

/** 皮肤主题种类(胶囊底壳色与强调色预设) */
export type SkinTheme =
  | 'obsidian'
  | 'midnight'
  | 'aurora'
  | 'sunset'
  | 'forest'
  | 'cyber'

export const SKIN_THEMES: SkinTheme[] = [
  'obsidian',
  'midnight',
  'aurora',
  'sunset',
  'forest',
  'cyber',
]

/** 外观自定义:胶囊长度、整体不透明度、偶发光效、皮肤主题(读写都会做范围钳制);高度固定不走配置 */
export interface AppearanceSettings {
  pillWidth: number // 180-420,逻辑像素
  opacity: number // 0.5-1
  glowEffects: GlowEffect[] // 偶发光效种类子集
  glowStrength: number // 0.2-1,光效强度系数
  skin: SkinTheme // 皮肤主题预设
}

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  pillWidth: 260,
  opacity: 1,
  glowEffects: [...GLOW_EFFECTS],
  glowStrength: 1,
  skin: 'obsidian',
}

// 模块级单例:多处 load 同一文件会报资源占用
let storePromise: Promise<Awaited<ReturnType<typeof load>>> | null = null

function getStore() {
  if (storePromise === null) {
    storePromise = load(STORE_FILE, { autoSave: true })
  }
  return storePromise
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(max, Math.max(min, value))
  }
  return fallback
}

export async function loadCredential(): Promise<ZhipuCredential | null> {
  try {
    const store = await getStore()
    const value = await store.get<ZhipuCredential>(CREDENTIAL_KEY)
    if (value === null || value === undefined) return null
    // 兼容脏数据:apiKey 缺失或为空视为未配置
    if (typeof value.apiKey !== 'string' || value.apiKey.trim() === '') return null
    return value
  } catch {
    // store 本身打不开(极少见)按未配置处理,不阻塞 UI
    return null
  }
}

export async function saveCredential(credential: ZhipuCredential): Promise<void> {
  const store = await getStore()
  await store.set(CREDENTIAL_KEY, credential)
  await store.save()
}

export async function loadTheme(): Promise<ThemeMode> {
  try {
    const store = await getStore()
    const value = await store.get<ThemeMode>(THEME_KEY)
    if (value === 'light' || value === 'dark' || value === 'auto') return value
  } catch {
    // 读取失败回落 auto
  }
  return 'auto'
}

export async function saveTheme(mode: ThemeMode): Promise<void> {
  const store = await getStore()
  await store.set(THEME_KEY, mode)
  await store.save()
}

const APPEARANCE_KEY = 'appearance'

/** 番茄钟模块设置:时长以分钟存储(人类单位),core 层再换算毫秒 */
export interface PomodoroSettings {
  workMin: number // 5-60
  breakMin: number // 1-30
}

export const DEFAULT_POMODORO: PomodoroSettings = { workMin: 25, breakMin: 5 }

/** 读取番茄钟设置;缺字段或越界时逐项钳制/回落默认 */
export async function loadPomodoro(): Promise<PomodoroSettings> {
  try {
    const store = await getStore()
    const raw = await store.get<Partial<PomodoroSettings>>('pomodoro')
    if (raw !== null && typeof raw === 'object') {
      return {
        workMin: clampNumber(raw.workMin, 5, 60, DEFAULT_POMODORO.workMin),
        breakMin: clampNumber(raw.breakMin, 1, 30, DEFAULT_POMODORO.breakMin),
      }
    }
  } catch {
    // 读取失败回落默认
  }
  return { ...DEFAULT_POMODORO }
}

export async function savePomodoro(settings: PomodoroSettings): Promise<void> {
  const store = await getStore()
  await store.set('pomodoro', settings)
  await store.save()
}

/** 用量告警阈值(百分点);warnAt 必须 < criticalAt,读取时做交叉钳制 */
export interface UsageAlerts {
  warnAt: number // 50-97,琥珀留意
  criticalAt: number // 51-99,红色告警
}

export const DEFAULT_USAGE_ALERTS: UsageAlerts = { warnAt: 75, criticalAt: 90 }

/** 钳制到合法范围并保证 warn < critical(设置面板拖动联动也复用此函数) */
export function normalizeUsageAlerts(warnAt: number, criticalAt: number): UsageAlerts {
  const warn = Math.round(Math.min(97, Math.max(50, warnAt)))
  const critical = Math.round(Math.min(99, Math.max(51, criticalAt)))
  if (warn >= critical) {
    // 谁越界改谁:warn 顶到上限就压 critical 上移,反之压 warn 下移
    if (warn >= 97) return { warnAt: 97, criticalAt: 98 }
    return { warnAt: warn, criticalAt: warn + 1 }
  }
  return { warnAt: warn, criticalAt: critical }
}

export async function loadUsageAlerts(): Promise<UsageAlerts> {
  try {
    const store = await getStore()
    const raw = await store.get<Partial<UsageAlerts>>('usage_alerts')
    if (raw !== null && typeof raw === 'object') {
      return normalizeUsageAlerts(
        clampNumber(raw.warnAt, 50, 97, DEFAULT_USAGE_ALERTS.warnAt),
        clampNumber(raw.criticalAt, 51, 99, DEFAULT_USAGE_ALERTS.criticalAt),
      )
    }
  } catch {
    // 读取失败回落默认
  }
  return { ...DEFAULT_USAGE_ALERTS }
}

export async function saveUsageAlerts(alerts: UsageAlerts): Promise<void> {
  const store = await getStore()
  await store.set('usage_alerts', normalizeUsageAlerts(alerts.warnAt, alerts.criticalAt))
  await store.save()
}

/** 用量历史(trend 折线数据):结构与裁剪规则见 core/usageHistory.ts */
export async function loadUsageHistory(): Promise<UsageHistoryPoint[]> {
  try {
    const store = await getStore()
    const value = await store.get<UsageHistoryPoint[]>('usage_history')
    if (Array.isArray(value)) {
      // 逐条过滤脏数据:字段齐全且时间戳有限才保留
      return value.filter(
        (p) =>
          p !== null &&
          typeof p === 'object' &&
          Number.isFinite(p.at) &&
          Number.isFinite(p.p5h) &&
          Number.isFinite(p.p7d),
      )
    }
  } catch {
    // 读取失败按无历史处理
  }
  return []
}

export async function saveUsageHistory(points: UsageHistoryPoint[]): Promise<void> {
  const store = await getStore()
  await store.set('usage_history', points)
  await store.save()
}

/** 剪贴板记录开关:关闭时监听事件仍到达但前端不落盘(隐私急停) */
export async function loadClipboardEnabled(): Promise<boolean> {
  try {
    const store = await getStore()
    const value = await store.get<boolean>('clipboard_enabled')
    if (typeof value === 'boolean') return value
  } catch {
    // 读取失败回落默认开
  }
  return true
}

export async function saveClipboardEnabled(enabled: boolean): Promise<void> {
  const store = await getStore()
  await store.set('clipboard_enabled', enabled)
  await store.save()
}

/** 剪贴板历史读写:结构与淘汰规则见 core/clipboardHistory.ts */
export async function loadClipboardHistory(): Promise<ClipboardItem[]> {
  try {
    const store = await getStore()
    const value = await store.get<ClipboardItem[]>('clipboard_history')
    if (Array.isArray(value)) {
      return value.filter(
        (item) =>
          item !== null &&
          typeof item === 'object' &&
          typeof item.id === 'string' &&
          typeof item.text === 'string' &&
          typeof item.pinned === 'boolean' &&
          Number.isFinite(item.copiedAt),
      )
    }
  } catch {
    // 读取失败按无历史处理
  }
  return []
}

export async function saveClipboardHistory(items: ClipboardItem[]): Promise<void> {
  const store = await getStore()
  await store.set('clipboard_history', items)
  await store.save()
}

/** 读取外观设置;存储缺字段或越界时逐项钳制/回落默认 */
export async function loadAppearance(): Promise<AppearanceSettings> {
  try {
    const store = await getStore()
    const raw = await store.get<Partial<AppearanceSettings>>(APPEARANCE_KEY)
    if (raw !== null && typeof raw === 'object') {
      // 光效种类:只保留合法值;若老配置为全开(原6种都在),自动将新增光效纳入池子
      let glowEffects: GlowEffect[]
      if (Array.isArray(raw.glowEffects)) {
        const hadAllOld = ['flow', 'ripple', 'sweep', 'dual', 'twin', 'sparkle'].every((e) =>
          raw.glowEffects!.includes(e as GlowEffect),
        )
        const baseSet = new Set(raw.glowEffects)
        if (hadAllOld) {
          GLOW_EFFECTS.forEach((e) => baseSet.add(e))
        }
        glowEffects = GLOW_EFFECTS.filter((e) => baseSet.has(e))
      } else {
        glowEffects = [...GLOW_EFFECTS]
      }
      const skin: SkinTheme =
        typeof raw.skin === 'string' && (SKIN_THEMES as string[]).includes(raw.skin)
          ? (raw.skin as SkinTheme)
          : DEFAULT_APPEARANCE.skin
      return {
        pillWidth: clampNumber(raw.pillWidth, 180, 420, DEFAULT_APPEARANCE.pillWidth),
        opacity: clampNumber(raw.opacity, 0.5, 1, DEFAULT_APPEARANCE.opacity),
        glowEffects,
        glowStrength: clampNumber(raw.glowStrength, 0.2, 1, DEFAULT_APPEARANCE.glowStrength),
        skin,
      }
    }
  } catch {
    // 读取失败回落默认
  }
  return { ...DEFAULT_APPEARANCE }
}

export async function saveAppearance(settings: AppearanceSettings): Promise<void> {
  const store = await getStore()
  await store.set(APPEARANCE_KEY, settings)
  await store.save()
}

/** 用户拖动后的窗口位置(物理像素);null = 未自定义,使用顶部居中 */
export interface PillPosition {
  x: number
  y: number
}

const PILL_POSITION_KEY = 'pill_position'

export async function loadPillPosition(): Promise<PillPosition | null> {
  try {
    const store = await getStore()
    const value = await store.get<PillPosition>(PILL_POSITION_KEY)
    if (
      value !== null &&
      typeof value === 'object' &&
      Number.isFinite(value.x) &&
      Number.isFinite(value.y)
    ) {
      return { x: value.x, y: value.y }
    }
  } catch {
    // 读取失败按未自定义处理
  }
  return null
}

export async function savePillPosition(position: PillPosition | null): Promise<void> {
  const store = await getStore()
  if (position === null) {
    await store.delete(PILL_POSITION_KEY)
  } else {
    await store.set(PILL_POSITION_KEY, position)
  }
  await store.save()
}
