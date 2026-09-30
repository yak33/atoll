/**
 * 智谱额度响应解析单测。
 * 用例对应 docs/03-智谱额度接口.md 的解析规则;接口字段变更时先改这里再改实现。
 *
 * @author ZHANGCHAO 2026/10/01
 */
import { describe, expect, it } from 'vitest'
import { buildZhipuQuotaHeaders, buildZhipuQuotaUrl, parseZhipuQuotaResponse } from './zhipu'
import { QuotaError } from '../types'

const NOW = new Date('2026-10-01T08:00:00Z')

function limitsEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { type: 'TOKENS_LIMIT', unit: 3, percentage: 40, ...overrides }
}

function responseBody(data: unknown): unknown {
  return { success: true, data }
}

describe('parseZhipuQuotaResponse 窗口归类', () => {
  it('unit=3 归 5h,unit=6 归 weekly', () => {
    const json = responseBody({
      level: 'GLM_CODING_PLAN_MAX',
      limits: [
        limitsEntry({ unit: 3, percentage: 43.5, nextResetTime: 1759308000000 }),
        limitsEntry({ unit: 6, percentage: 12.1, nextResetTime: '2026-10-03T00:00:00Z' }),
      ],
    })
    const snapshot = parseZhipuQuotaResponse(json, NOW)

    expect(snapshot.planLevel).toBe('GLM_CODING_PLAN_MAX')
    expect(snapshot.source).toBe('tokens_limit')
    expect(snapshot.windows).toHaveLength(2)
    expect(snapshot.windows[0]).toMatchObject({ key: '5h', usedPercent: 43.5 })
    expect(snapshot.windows[1]).toMatchObject({ key: 'weekly', usedPercent: 12.1 })
    // 毫秒时间戳与 ISO 字符串都归一化为 ISO 字符串
    expect(snapshot.windows[0].resetAt).toBe('2025-10-01T08:40:00.000Z')
    expect(snapshot.windows[1].resetAt).toBe('2026-10-03T00:00:00.000Z')
  })

  it('unit 缺失时:无 reset 的条目归 5h,其余按 reset 升序填 weekly', () => {
    const json = responseBody({
      limits: [
        limitsEntry({ unit: undefined, percentage: 80, nextResetTime: 4102444800000 }), // 2100 年,更晚
        limitsEntry({ unit: undefined, percentage: 10, nextResetTime: undefined }), // 无 reset → 5h
      ],
    })
    const snapshot = parseZhipuQuotaResponse(json, NOW)

    expect(snapshot.windows[0]).toMatchObject({ key: '5h', usedPercent: 10, resetAt: null })
    expect(snapshot.windows[1]).toMatchObject({ key: 'weekly', usedPercent: 80 })
  })

  it('只有 weekly(unit=6)时返回单窗口', () => {
    const json = responseBody({ limits: [limitsEntry({ unit: 6, percentage: 5 })] })
    const snapshot = parseZhipuQuotaResponse(json, NOW)

    expect(snapshot.windows).toHaveLength(1)
    expect(snapshot.windows[0].key).toBe('weekly')
  })

  it('TOKENS_LIMIT 与 CREDIT_LIMIT 并存时,信用额度不参与归类', () => {
    const json = responseBody({
      limits: [
        limitsEntry({ unit: 3, percentage: 30 }),
        { type: 'CREDIT_LIMIT', percentage: 99, nextResetTime: 1759308000000 },
      ],
    })
    const snapshot = parseZhipuQuotaResponse(json, NOW)

    expect(snapshot.source).toBe('tokens_limit')
    expect(snapshot.windows).toHaveLength(1)
    expect(snapshot.windows[0].usedPercent).toBe(30)
  })

  it('仅 CREDIT_LIMIT 时降级展示并标记来源', () => {
    const json = responseBody({
      limits: [{ type: 'CREDIT_LIMIT', percentage: 55, nextResetTime: 1759308000000 }],
    })
    const snapshot = parseZhipuQuotaResponse(json, NOW)

    expect(snapshot.source).toBe('credit_limit')
    expect(snapshot.windows[0]).toMatchObject({ key: '5h', usedPercent: 55 })
  })

  it('未知 type 的条目被忽略;一条已知条目都没有时返回空窗口', () => {
    const json = responseBody({ limits: [{ type: 'SOMETHING_ELSE', percentage: 50 }] })
    const snapshot = parseZhipuQuotaResponse(json, NOW)

    expect(snapshot.windows).toHaveLength(0)
  })
})

describe('parseZhipuQuotaResponse 字段归一化', () => {
  it('percentage 兼容数字字符串', () => {
    const json = responseBody({ limits: [limitsEntry({ percentage: '43.5' })] })
    expect(parseZhipuQuotaResponse(json, NOW).windows[0].usedPercent).toBe(43.5)
  })

  it('nextResetTime 为 0 或非法值时视为无重置时间', () => {
    const json = responseBody({ limits: [limitsEntry({ nextResetTime: 0 })] })
    expect(parseZhipuQuotaResponse(json, NOW).windows[0].resetAt).toBeNull()
  })

  it('秒级时间戳(<1e12)按秒换算', () => {
    const json = responseBody({ limits: [limitsEntry({ nextResetTime: 1759308000 })] })
    expect(parseZhipuQuotaResponse(json, NOW).windows[0].resetAt).toBe('2025-10-01T08:40:00.000Z')
  })
})

describe('parseZhipuQuotaResponse 错误语义', () => {
  it('success=false(HTTP 200 内的业务错误)抛 upstreamError', () => {
    const json = { success: false, msg: '当前用户不存在coding plan' }

    expect(() => parseZhipuQuotaResponse(json, NOW)).toThrow(QuotaError)
    try {
      parseZhipuQuotaResponse(json, NOW)
    } catch (error) {
      expect((error as QuotaError).kind).toBe('upstreamError')
      expect((error as QuotaError).message).toBe('当前用户不存在coding plan')
    }
  })

  it('结构对不上抛 parseError', () => {
    expect(() => parseZhipuQuotaResponse(null, NOW)).toThrow(QuotaError)
    expect(() => parseZhipuQuotaResponse({ success: true }, NOW)).toThrow(QuotaError)
    expect(() => parseZhipuQuotaResponse({ success: true, data: { level: 'x' } }, NOW)).toThrow(QuotaError)

    try {
      parseZhipuQuotaResponse({ success: true, data: {} }, NOW)
    } catch (error) {
      expect((error as QuotaError).kind).toBe('parseError')
    }
  })
})

describe('请求构造', () => {
  const personalCred = { apiKey: 'test-key', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' }

  it('个人版:URL 不带 type=2,Authorization 为裸 Key', () => {
    expect(buildZhipuQuotaUrl(personalCred)).toBe('https://open.bigmodel.cn/api/monitor/usage/quota/limit')

    const headers = buildZhipuQuotaHeaders(personalCred)
    expect(headers.Authorization).toBe('test-key')
    expect(headers['bigmodel-organization']).toBeUndefined()
  })

  it('团队版:URL 带 type=2,附组织/项目头', () => {
    const teamCred = {
      apiKey: 'test-key',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      organizationId: 'org-1',
      projectId: 'proj-1',
    }
    expect(buildZhipuQuotaUrl(teamCred)).toContain('?type=2')

    const headers = buildZhipuQuotaHeaders(teamCred)
    expect(headers['bigmodel-organization']).toBe('org-1')
    expect(headers['bigmodel-project']).toBe('proj-1')
  })

  it('z.ai 域名切换到国际站主机', () => {
    expect(buildZhipuQuotaUrl({ apiKey: 'k', baseUrl: 'https://api.z.ai/api/paas/v4' })).toBe(
      'https://api.z.ai/api/monitor/usage/quota/limit',
    )
  })
})
