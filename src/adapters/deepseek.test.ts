/**
 * DeepSeek 余额响应解析单测。
 * 覆盖正常/多币种/空列表/字段容错/错误语义;接口字段变更时先改这里再改实现。
 *
 * @author ZHANGCHAO 2026/10/18
 */
import { describe, expect, it } from 'vitest'
import { buildDeepSeekBalanceHeaders, DEEPSEEK_BALANCE_URL, parseDeepSeekBalanceResponse } from './deepseek'
import { QuotaError } from '../types'

const NOW = new Date('2026-10-18T00:00:00Z')

function response(overrides: Record<string, unknown> = {}): unknown {
  return {
    is_available: true,
    balance_infos: [
      { currency: 'CNY', total_balance: '128.50', granted_balance: '28.50', topped_up_balance: '100.00' },
    ],
    ...overrides,
  }
}

describe('parseDeepSeekBalanceResponse 正常响应', () => {
  it('解析总可用/充值/未过期赠金,并保留原始十进制字符串', () => {
    const snapshot = parseDeepSeekBalanceResponse(response(), NOW)

    expect(snapshot.isAvailable).toBe(true)
    expect(snapshot.balances).toHaveLength(1)
    expect(snapshot.balances[0]).toEqual({
      currency: 'CNY',
      totalBalance: '128.50',
      grantedBalance: '28.50',
      toppedUpBalance: '100.00',
    })
    expect(snapshot.fetchedAt).toBe('2026-10-18T00:00:00.000Z')
  })

  it('多币种逐条保留,不做跨币种合并', () => {
    const snapshot = parseDeepSeekBalanceResponse(
      response({
        balance_infos: [
          { currency: 'CNY', total_balance: '128.50', granted_balance: '28.50', topped_up_balance: '100.00' },
          { currency: 'USD', total_balance: '12.00', granted_balance: '0.00', topped_up_balance: '12.00' },
        ],
      }),
      NOW,
    )

    expect(snapshot.balances.map((item) => item.currency)).toEqual(['CNY', 'USD'])
  })

  it('账号没有任何余额时 balance_infos 为空数组,视为合法响应', () => {
    const snapshot = parseDeepSeekBalanceResponse(response({ is_available: false, balance_infos: [] }), NOW)

    expect(snapshot.balances).toHaveLength(0)
    expect(snapshot.isAvailable).toBe(false)
  })

  it('is_available=false 原样保留,供 UI 提示「余额不足」', () => {
    expect(parseDeepSeekBalanceResponse(response({ is_available: false }), NOW).isAvailable).toBe(false)
  })
})

describe('parseDeepSeekBalanceResponse 字段容错', () => {
  it('金额为数字形态时转成字符串保留', () => {
    const snapshot = parseDeepSeekBalanceResponse(
      response({
        balance_infos: [
          { currency: 'CNY', total_balance: 128.5, granted_balance: 28.5, topped_up_balance: 100 },
        ],
      }),
      NOW,
    )

    expect(snapshot.balances[0].totalBalance).toBe('128.5')
  })

  it('币种大小写归一化', () => {
    const snapshot = parseDeepSeekBalanceResponse(
      response({
        balance_infos: [
          { currency: 'cny', total_balance: '1.00', granted_balance: '0.00', topped_up_balance: '1.00' },
        ],
      }),
      NOW,
    )

    expect(snapshot.balances[0].currency).toBe('CNY')
  })

  it('额外字段被忽略', () => {
    const snapshot = parseDeepSeekBalanceResponse(
      response({
        balance_infos: [
          { currency: 'CNY', total_balance: '1.00', granted_balance: '0.00', topped_up_balance: '1.00', extra: 'x' },
        ],
      }),
      NOW,
    )

    expect(snapshot.balances[0].totalBalance).toBe('1.00')
  })
})

describe('parseDeepSeekBalanceResponse 错误语义', () => {
  function expectParseError(json: unknown): void {
    expect(() => parseDeepSeekBalanceResponse(json, NOW)).toThrow(QuotaError)
    try {
      parseDeepSeekBalanceResponse(json, NOW)
    } catch (error) {
      expect((error as QuotaError).kind).toBe('parseError')
    }
  }

  it('响应不是对象', () => {
    expectParseError(null)
    expectParseError('not-json')
  })

  it('缺少 is_available 或类型不对', () => {
    expectParseError({ balance_infos: [] })
    expectParseError(response({ is_available: 'yes' }))
  })

  it('缺少 balance_infos 或不是数组', () => {
    expectParseError({ is_available: true })
    expectParseError(response({ balance_infos: {} }))
  })

  it('条目缺 currency 或金额非法', () => {
    expectParseError(
      response({
        balance_infos: [{ total_balance: '1.00', granted_balance: '0.00', topped_up_balance: '1.00' }],
      }),
    )
    expectParseError(
      response({
        balance_infos: [{ currency: 'CNY', total_balance: 'NaN', granted_balance: '0.00', topped_up_balance: '1.00' }],
      }),
    )
    expectParseError(
      response({
        balance_infos: [{ currency: 'CNY', total_balance: '', granted_balance: '0.00', topped_up_balance: '1.00' }],
      }),
    )
  })
})

describe('请求构造', () => {
  it('URL 固定为官方余额接口', () => {
    expect(DEEPSEEK_BALANCE_URL).toBe('https://api.deepseek.com/user/balance')
  })

  it('Authorization 为 Bearer + API Key(与智谱裸 Key 不同)', () => {
    const headers = buildDeepSeekBalanceHeaders({ apiKey: 'sk-test' })

    expect(headers.Authorization).toBe('Bearer sk-test')
    expect(headers.Accept).toBe('application/json')
  })
})
