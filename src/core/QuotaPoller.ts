/**
 * 智谱额度轮询器(core 层)。
 *
 * 职责:按「基础间隔 + 随机抖动」轮询官方额度接口;可重试错误指数退避;
 * 凭据无效时彻底停止;手动刷新与定时拉取共用单飞(同一时刻最多一个上游请求)。
 * 网络走 tauri-plugin-http(经 Rust 侧发出,绕开 WebView CORS)。
 *
 * 纪律:对上游的请求间隔下限 3 分钟,本实现基础间隔 5 分钟。
 *
 * @author ZHANGCHAO 2026/10/01
 */
import { fetch } from '@tauri-apps/plugin-http'
import { buildZhipuQuotaHeaders, buildZhipuQuotaUrl, parseZhipuQuotaResponse, type ZhipuCredential } from '../adapters/zhipu'
import { QuotaError, type ZhipuQuotaSnapshot } from '../types'

const BASE_INTERVAL_MS = 5 * 60 * 1000
const MAX_JITTER_MS = 800
const BACKOFF_INITIAL_MS = 60 * 1000
const BACKOFF_MAX_MS = 10 * 60 * 1000
const REQUEST_TIMEOUT_MS = 15 * 1000

export interface PollerHandlers {
  onData: (snapshot: ZhipuQuotaSnapshot) => void
  onError: (error: QuotaError) => void
}

export class QuotaPoller {
  private credential: ZhipuCredential | null = null
  private readonly handlers: PollerHandlers
  private timerId: number | null = null
  private inFlight: Promise<void> | null = null
  private backoffMs = 0
  private active = false
  // 代数计数:stop/start 自增,使旧 setTimeout 回调能识别自己已被废弃
  private generation = 0

  constructor(handlers: PollerHandlers) {
    this.handlers = handlers
  }

  /** 启动(或凭据变更后重启):清退避,立即拉一次,然后按周期调度 */
  start(credential: ZhipuCredential): void {
    this.stop()
    this.credential = credential
    this.backoffMs = 0
    this.active = true
    this.schedule(0)
  }

  stop(): void {
    this.active = false
    this.generation += 1
    if (this.timerId !== null) {
      clearTimeout(this.timerId)
      this.timerId = null
    }
  }

  /**
   * 手动刷新:退避清零并立即拉取。
   * 轮询链已断(如凭据无效被停)时等价于 start:拉一次并恢复周期调度。
   */
  async refresh(): Promise<void> {
    if (this.credential === null) return
    if (!this.active) {
      this.start(this.credential)
      return
    }
    this.backoffMs = 0
    await this.runFetch()
  }

  /** 调度下一次拉取;delayMs 为 0 表示立即(仍加抖动) */
  private schedule(delayMs: number): void {
    const gen = this.generation
    const jitter = Math.floor(Math.random() * MAX_JITTER_MS)
    this.timerId = window.setTimeout(() => {
      if (gen !== this.generation) return
      void this.runFetch().then(() => {
        if (gen !== this.generation) return
        const nextDelay = this.backoffMs > 0 ? this.backoffMs : BASE_INTERVAL_MS
        this.schedule(nextDelay)
      })
    }, delayMs + jitter)
  }

  /** 单飞:并发调用共享同一个进行中的请求,结束后才允许下一次 */
  private runFetch(): Promise<void> {
    if (this.inFlight !== null) return this.inFlight
    const exec = (async () => {
      try {
        const snapshot = await this.requestUpstream()
        this.backoffMs = 0
        this.handlers.onData(snapshot)
      } catch (err) {
        if (!(err instanceof QuotaError)) {
          // 防御:任何未知异常按网络错误处理,绝不让轮询线程死掉
          this.applyError(new QuotaError('networkError', String(err)))
          return
        }
        this.applyError(err)
      }
    })()
    this.inFlight = exec.then(
      () => {
        this.inFlight = null
      },
      () => {
        this.inFlight = null
      },
    )
    return this.inFlight
  }

  /** 错误分流:凭据无效停止一切;可重试错误按 1→2→4→…分钟退避(上限 10 分钟) */
  private applyError(error: QuotaError): void {
    this.handlers.onError(error)
    if (error.kind === 'credentialInvalid') {
      this.stop()
      return
    }
    this.backoffMs = this.backoffMs === 0 ? BACKOFF_INITIAL_MS : Math.min(this.backoffMs * 2, BACKOFF_MAX_MS)
  }

  /** 发请求并解析;所有失败都转成 QuotaError,错误文案不包含 API Key */
  private async requestUpstream(): Promise<ZhipuQuotaSnapshot> {
    if (this.credential === null) {
      throw new QuotaError('networkError', '未配置凭据')
    }
    const url = buildZhipuQuotaUrl(this.credential)
    const headers = buildZhipuQuotaHeaders(this.credential)

    let resp: Response
    try {
      resp = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch {
      throw new QuotaError('networkError', '网络请求失败或超时')
    }

    if (resp.status === 401 || resp.status === 403) {
      throw new QuotaError('credentialInvalid', `鉴权失败(HTTP ${resp.status}),请检查 API Key`)
    }
    if (resp.status === 429) {
      throw new QuotaError('upstreamError', '请求过于频繁(HTTP 429)')
    }
    if (resp.status < 200 || resp.status >= 300) {
      throw new QuotaError('upstreamError', `服务异常(HTTP ${resp.status})`)
    }

    let json: unknown
    try {
      json = await resp.json()
    } catch {
      throw new QuotaError('parseError', '响应不是合法 JSON')
    }
    // 业务错误(success=false → upstreamError)与结构异常(parseError)在 adapter 内判定
    return parseZhipuQuotaResponse(json)
  }
}
