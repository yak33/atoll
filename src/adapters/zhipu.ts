/**
 * 智谱 GLM Coding Plan 额度接口 adapter。
 *
 * 只做三件事:构造请求 URL / 构造请求头 / 解析响应为统一快照。
 * 纯函数、不碰 UI、不发请求(网络层由 core 调度)。
 * 严格遵循智谱官方接口规范与逆向解析规则。
 *
 * @author ZHANGCHAO 2026/09/30
 */
import { QuotaError, type QuotaSource, type UsageWindow, type ZhipuQuotaSnapshot } from '../types'

/** 用户在设置界面填写的智谱凭据与接入信息 */
export interface ZhipuCredential {
  apiKey: string
  /** 用户配置的推理 base_url(如 https://open.bigmodel.cn/api/paas/v4),额度主机由它推导 */
  baseUrl: string
  /** 团队版组织 ID。非空即视为团队版请求(加 ?type=2 与组织头) */
  organizationId?: string
  /** 团队版项目 ID,可选 */
  projectId?: string
}

/** 额度主机按 base_url 推导;未知域名回落国内站(与用户主场景一致) */
function zhipuQuotaHost(baseUrl: string): string {
  const lower = baseUrl.toLowerCase()
  if (lower.includes('bigmodel.cn')) return 'https://open.bigmodel.cn'
  if (lower.includes('z.ai')) return 'https://api.z.ai'
  return 'https://open.bigmodel.cn'
}

export function buildZhipuQuotaUrl(cred: ZhipuCredential): string {
  let url = zhipuQuotaHost(cred.baseUrl) + '/api/monitor/usage/quota/limit'
  // 团队版必须带 type=2,否则官方回「当前用户不存在coding plan」
  if (cred.organizationId && cred.organizationId.trim() !== '') {
    url += '?type=2'
  }
  return url
}

export function buildZhipuQuotaHeaders(cred: ZhipuCredential): Record<string, string> {
  const headers: Record<string, string> = {
    // 官方怪癖:裸 Key,不加 Bearer 前缀,加了会 401
    Authorization: cred.apiKey,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'Accept-Language': 'en-US,en',
  }
  const org = cred.organizationId?.trim()
  if (org) {
    headers['bigmodel-organization'] = org
    const project = cred.projectId?.trim()
    if (project) {
      headers['bigmodel-project'] = project
    }
  }
  return headers
}

/** 上游 limits[] 条目的宽松形状(非公开接口,字段全部可缺失) */
interface RawLimitEntry {
  type?: unknown
  unit?: unknown
  percentage?: unknown
  nextResetTime?: unknown
}

/**
 * 解析响应 JSON 为统一快照。now 参数仅为可测试性注入,生产传 new Date()。
 *
 * 抛 QuotaError:
 *   upstreamError = success:false 业务错误(HTTP 可能是 200)
 *   parseError    = 结构与预期不符(接口变更信号)
 */
export function parseZhipuQuotaResponse(json: unknown, now: Date = new Date()): ZhipuQuotaSnapshot {
  if (typeof json !== 'object' || json === null) {
    throw new QuotaError('parseError', '响应不是 JSON 对象')
  }
  const root = json as Record<string, unknown>

  // 业务错误藏在 HTTP 200 里,必须先看 success 字段
  if (root.success === false) {
    const msg = typeof root.msg === 'string' && root.msg !== '' ? root.msg : '未知业务错误'
    throw new QuotaError('upstreamError', msg)
  }

  const data = root.data
  if (typeof data !== 'object' || data === null) {
    throw new QuotaError('parseError', '响应缺少 data 字段')
  }
  const dataObj = data as Record<string, unknown>
  const rawLimits = dataObj.limits
  if (!Array.isArray(rawLimits)) {
    throw new QuotaError('parseError', '响应缺少 data.limits 数组')
  }

  const planLevel = typeof dataObj.level === 'string' ? dataObj.level : ''

  // 第一遍:只保留两种已知 type,TOKENS_LIMIT 参与窗口归类,CREDIT_LIMIT 仅作降级备用。
  // 两者度量不同(token 窗口 vs 信用额度),混用会污染窗口用量。
  const tokensEntries: RawLimitEntry[] = []
  const creditEntries: RawLimitEntry[] = []
  for (const item of rawLimits) {
    if (typeof item !== 'object' || item === null) continue
    const entry = item as RawLimitEntry
    const type = typeof entry.type === 'string' ? entry.type.trim().toUpperCase() : ''
    if (type === 'TOKENS_LIMIT') tokensEntries.push(entry)
    else if (type === 'CREDIT_LIMIT') creditEntries.push(entry)
  }

  let source: QuotaSource
  let candidates: RawLimitEntry[]
  if (tokensEntries.length > 0) {
    source = 'tokens_limit'
    candidates = tokensEntries
  } else if (creditEntries.length > 0) {
    // 部分套餐只报信用额度:降级展示并标记来源
    source = 'credit_limit'
    candidates = creditEntries
  } else {
    // 一个已知条目都没有:按空快照处理,UI 显示无数据,而不是报错吓用户
    return { planLevel, windows: [], source: 'tokens_limit', fetchedAt: now.toISOString() }
  }

  const windows = classifyIntoWindows(candidates)
  return { planLevel, windows, source, fetchedAt: now.toISOString() }
}

/** 归一化单个窗口条目,unit 缺失时 reset 置 null 参与兜底排序 */
interface WindowCandidate {
  usedPercent: number
  resetAt: string | null
  resetMs: number
  hasReset: boolean
}

function toWindowCandidate(entry: RawLimitEntry): WindowCandidate {
  const usedPercent = coerceFiniteNumber(entry.percentage) ?? 0
  const resetAt = normalizeResetTime(entry.nextResetTime)
  return {
    usedPercent,
    resetAt,
    resetMs: resetAt !== null ? Date.parse(resetAt) : Number.NaN,
    hasReset: resetAt !== null,
  }
}

/**
 * 窗口归类(顺序敏感):
 * 1. unit 显式分类:3 → 5h,6 → weekly,同槽位先到先得
 * 2. unit 缺失/未识别的兜底:无 reset 的优先归 5h(0% 状态下 5h 桶可能没有
 *    nextResetTime),其余按 reset 升序填入空缺槽位
 *
 * 不能用 reset 时间排序代替 unit 判断:周期末尾周窗口比 5h 更早重置,必然标反。
 */
function classifyIntoWindows(entries: RawLimitEntry[]): UsageWindow[] {
  let fiveHour: WindowCandidate | null = null
  let weekly: WindowCandidate | null = null
  const unclassified: WindowCandidate[] = []

  for (const entry of entries) {
    const candidate = toWindowCandidate(entry)
    const unit = coerceFiniteNumber(entry.unit)
    if (unit === 3) {
      if (fiveHour === null) fiveHour = candidate
      else unclassified.push(candidate)
    } else if (unit === 6) {
      if (weekly === null) weekly = candidate
      else unclassified.push(candidate)
    } else {
      unclassified.push(candidate)
    }
  }

  // 稳定排序:无 reset 的排前,其余按重置时间升序
  unclassified.sort((a, b) => {
    if (a.hasReset !== b.hasReset) return a.hasReset ? 1 : -1
    return a.resetMs - b.resetMs
  })
  for (const candidate of unclassified) {
    if (fiveHour === null) fiveHour = candidate
    else if (weekly === null) weekly = candidate
  }

  const windows: UsageWindow[] = []
  if (fiveHour !== null) {
    windows.push({ key: '5h', usedPercent: fiveHour.usedPercent, resetAt: fiveHour.resetAt })
  }
  if (weekly !== null) {
    windows.push({ key: 'weekly', usedPercent: weekly.usedPercent, resetAt: weekly.resetAt })
  }
  return windows
}

/**
 * 重置时间归一化:毫秒/秒级时间戳或 ISO 字符串 → RFC3339;无法识别返回 null。
 * 阈值 1e12 区分秒(< 2001 年的毫秒值,现实不会出现)与毫秒。
 */
function normalizeResetTime(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value <= 0) return null
    const ms = value < 1_000_000_000_000 ? value * 1000 : value
    return new Date(ms).toISOString()
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') return null
    const parsed = Date.parse(trimmed)
    if (Number.isNaN(parsed)) return null
    return new Date(parsed).toISOString()
  }
  return null
}

/** JSON 数值或数字字符串 → number,兼容上游 43.5 与 "43.5" 两种形态 */
function coerceFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}
