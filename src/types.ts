/**
 * 统一数据模型:所有 adapter 输出这套结构,UI 只消费这套结构。
 * 平台专有字段(如智谱的 unit/CREDIT_LIMIT)不允许越过 adapter 边界。
 * @author ZHANGCHAO 2026/09/30
 */

/** 滚动窗口档位。'weekly' 在 UI 上显示为 7d。 */
export type WindowKey = '5h' | 'weekly'

export interface UsageWindow {
  key: WindowKey
  /** 已用百分比,0~100+,上游超卖不裁剪,由 UI 决定封顶显示策略 */
  usedPercent: number
  /** 重置时间(RFC3339)。null = 上游未下发,该窗口不显示倒计时 */
  resetAt: string | null
}

/**
 * 快照数据来源:
 * tokens_limit = 正常 token 窗口额度;credit_limit = 套餐只报信用额度时的降级展示,
 * 度量与 token 窗口不同,UI 需标注「信用额度」以免误读。
 */
export type QuotaSource = 'tokens_limit' | 'credit_limit'

export interface ZhipuQuotaSnapshot {
  /** 套餐档位,来自接口 data.level,原样展示 */
  planLevel: string
  windows: UsageWindow[]
  source: QuotaSource
  /** 快照落地时刻(RFC3339),UI 用它计算「数据过期 X 分钟」 */
  fetchedAt: string
}

/** 语义化错误类型,UI 按类型渲染提示,不做字符串匹配 */
export type QuotaErrorKind =
  | 'credentialInvalid' // HTTP 401/403,Key 无效,停止轮询
  | 'upstreamError'     // HTTP 5xx 或 success=false 业务错误
  | 'networkError'      // 超时/断网/DNS
  | 'parseError'        // 字段结构对不上 —— 非公开接口变更的第一信号

export class QuotaError extends Error {
  constructor(
    public readonly kind: QuotaErrorKind,
    message: string,
  ) {
    super(message)
    this.name = 'QuotaError'
  }
}

/**
 * DeepSeek 开放平台余额(GET /user/balance)。
 * 金额保留上游十进制字符串:展示与格式化在 core/balance 里做,避免浮点误差进入持久化数据。
 */
export interface DeepSeekBalanceInfo {
  /** 币种。官方当前为 CNY / USD,这里不硬编码成联合类型:上游新增币种时仍能展示,不至于整块解析失败 */
  currency: string
  /** 总的可用余额,包括赠金和充值余额 */
  totalBalance: string
  /** 未过期的赠金余额 */
  grantedBalance: string
  /** 充值余额 */
  toppedUpBalance: string
}

/** DeepSeek 余额快照:一次接口调用返回账号下所有币种的钱包余额 */
export interface DeepSeekBalanceSnapshot {
  /** 当前账户是否有余额可供 API 调用(上游字段语义) */
  isAvailable: boolean
  /** 按币种分条;账号没有任何余额时为空数组 */
  balances: DeepSeekBalanceInfo[]
  /** 快照落地时刻(RFC3339),UI 用它计算「数据过期 X 分钟」 */
  fetchedAt: string
}
