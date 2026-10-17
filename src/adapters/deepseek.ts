/**
 * DeepSeek 开放平台余额 adapter。
 *
 * 只做三件事:构造请求 URL / 构造请求头 / 解析余额响应为统一快照。
 * 接口是官方公开文档接口(GET /user/balance),没有智谱那样的滚动窗口字段:
 * 返回的是账号钱包余额(总可用 / 充值 / 未过期赠金),按币种分条。
 * 解析容错集中在此处,UI 只消费 types.ts 里的 DeepSeekBalanceSnapshot。
 *
 * @author ZHANGCHAO 2026/10/18
 */
import { QuotaError, type DeepSeekBalanceInfo, type DeepSeekBalanceSnapshot } from '../types'

/** 用户在设置面板填写的 DeepSeek 凭据(官方无个人版/团队版差异,只有 API Key) */
export interface DeepSeekCredential {
  apiKey: string
}

/** 官方余额接口:只读、不产生调用费用、一次返回账号下所有币种余额 */
export const DEEPSEEK_BALANCE_URL = 'https://api.deepseek.com/user/balance'

/**
 * 请求头:DeepSeek 开放平台统一 Bearer 认证(Chat API 同一把 API Key)。
 * 注意与智谱的「裸 Key」不同,这里必须带 Bearer 前缀。
 */
export function buildDeepSeekBalanceHeaders(cred: DeepSeekCredential): Record<string, string> {
  return {
    Authorization: `Bearer ${cred.apiKey}`,
    Accept: 'application/json',
  }
}

/** 读取金额字段:官方是十进制字符串;数字形态也容忍(上游若改类型不至于整块失败) */
function readAmountField(value: unknown, field: string): string {
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value.trim()))) {
    return value.trim()
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }
  throw new QuotaError('parseError', `余额字段 ${field} 不是合法金额`)
}

/**
 * 解析余额响应为统一快照。
 * now 参数仅为可测试性注入,生产传 new Date()。
 *
 * 抛 QuotaError:
 *   parseError = 结构与官方文档对不上(接口变更的第一信号)
 */
export function parseDeepSeekBalanceResponse(json: unknown, now: Date = new Date()): DeepSeekBalanceSnapshot {
  if (typeof json !== 'object' || json === null) {
    throw new QuotaError('parseError', '余额响应不是 JSON 对象')
  }
  const root = json as Record<string, unknown>

  const isAvailable = root.is_available
  if (typeof isAvailable !== 'boolean') {
    throw new QuotaError('parseError', '余额响应缺少 is_available')
  }
  if (!Array.isArray(root.balance_infos)) {
    throw new QuotaError('parseError', '余额响应缺少 balance_infos 数组')
  }

  const balances: DeepSeekBalanceInfo[] = []
  for (const item of root.balance_infos) {
    if (typeof item !== 'object' || item === null) {
      throw new QuotaError('parseError', 'balance_infos 条目不是对象')
    }
    const entry = item as Record<string, unknown>
    const currency = typeof entry.currency === 'string' ? entry.currency.trim().toUpperCase() : ''
    if (currency === '') {
      throw new QuotaError('parseError', 'balance_infos 条目缺少 currency')
    }
    balances.push({
      currency,
      totalBalance: readAmountField(entry.total_balance, 'total_balance'),
      grantedBalance: readAmountField(entry.granted_balance, 'granted_balance'),
      toppedUpBalance: readAmountField(entry.topped_up_balance, 'topped_up_balance'),
    })
  }

  return { isAvailable, balances, fetchedAt: now.toISOString() }
}
