import { describe, expect, it } from 'vitest'
import {
  COMPLETED_REMOVE_MS,
  ERROR_REMOVE_MS,
  normalizeState,
  priorityOf,
  resolvePrimaryAgent,
  STALE_REMOVE_MS,
  sweepAgents,
  upsertAgent,
  removeAgent,
  WAITING_FUSE_MS,
  WORKING_STALE_MS,
  type AgentItem,
} from './agentHub'

describe('agentHub core logic', () => {
  it('normalizes various state strings', () => {
    expect(normalizeState('WORKING')).toBe('working')
    expect(normalizeState('running')).toBe('working')
    expect(normalizeState('thinking')).toBe('working')
    expect(normalizeState('wait')).toBe('waiting')
    expect(normalizeState('ask')).toBe('waiting')
    expect(normalizeState('prompt')).toBe('waiting')
    expect(normalizeState('done')).toBe('completed')
    expect(normalizeState('finish')).toBe('completed')
    expect(normalizeState('failed')).toBe('error')
    expect(normalizeState('unknown')).toBe('idle')
  })

  it('orders states by priority (waiting > working > error > completed > idle)', () => {
    expect(priorityOf('waiting')).toBeGreaterThan(priorityOf('working'))
    expect(priorityOf('working')).toBeGreaterThan(priorityOf('error'))
    // error 排在 completed 之前:异常比「好消息」更需要用户看到
    expect(priorityOf('error')).toBeGreaterThan(priorityOf('completed'))
    expect(priorityOf('completed')).toBeGreaterThan(priorityOf('idle'))
    expect(priorityOf('stale')).toBe(priorityOf('idle'))
  })

  it('upserts and sorts agents properly', () => {
    let list: AgentItem[] = []

    // 1. ZCode 处于 working
    list = upsertAgent(list, { id: 'zcode', name: 'ZCode', state: 'working', task: '分析代码' }, 1000)
    expect(list.length).toBe(1)
    expect(resolvePrimaryAgent(list)?.id).toBe('zcode')

    // 2. Claude 处于 waiting (更高优先级，排到第 0 位)
    list = upsertAgent(list, { id: 'claude', name: 'Claude Code', state: 'waiting', task: '等待批准命令' }, 1010)
    expect(list.length).toBe(2)
    expect(resolvePrimaryAgent(list)?.id).toBe('claude')
    expect(resolvePrimaryAgent(list)?.state).toBe('waiting')

    // 3. Claude 完成了任务 -> completed (优先级降至低于 working 的 ZCode)
    list = upsertAgent(list, { id: 'claude', state: 'completed', task: '执行完毕' }, 1020)
    expect(resolvePrimaryAgent(list)?.id).toBe('zcode')
    expect(resolvePrimaryAgent(list)?.state).toBe('working')

    // 4. 移除 ZCode
    list = removeAgent(list, 'zcode')
    expect(list.length).toBe(1)
    expect(resolvePrimaryAgent(list)?.id).toBe('claude')
  })

  it('sweeps agents by lifecycle: downgrade, remove, and keep fresh items', () => {
    const now = 1_000_000
    const list: AgentItem[] = [
      { id: 'fresh', name: 'fresh', state: 'working', task: '', updatedAt: now - 60_000 },
      { id: 'lost', name: 'lost', state: 'working', task: '', updatedAt: now - WORKING_STALE_MS - 1 },
      { id: 'done-old', name: 'done-old', state: 'completed', task: '', updatedAt: now - COMPLETED_REMOVE_MS - 1 },
      { id: 'done-new', name: 'done-new', state: 'completed', task: '', updatedAt: now - 60_000 },
      { id: 'wait-recent', name: 'wait-recent', state: 'waiting', task: '', updatedAt: now - 60_000 },
      { id: 'wait-fuse', name: 'wait-fuse', state: 'waiting', task: '', updatedAt: now - WAITING_FUSE_MS - 1 },
      { id: 'stale-old', name: 'stale-old', state: 'stale', task: '', updatedAt: now - STALE_REMOVE_MS - 1 },
      { id: 'error-old', name: 'error-old', state: 'error', task: '', updatedAt: now - ERROR_REMOVE_MS - 1 },
      { id: 'idle-any', name: 'idle-any', state: 'idle', task: '', updatedAt: now },
    ]

    const swept = sweepAgents(list, now)
    const byId = (id: string) => swept.find((item) => item.id === id)

    // working 断流 → 降级 stale;新鲜的不动
    expect(byId('lost')?.state).toBe('stale')
    expect(byId('fresh')?.state).toBe('working')
    // completed 到期移除;未到期保留
    expect(byId('done-old')).toBeUndefined()
    expect(byId('done-new')?.state).toBe('completed')
    // waiting 未到期保留;超过保险丝降级 stale(未决事项不直接删)
    expect(byId('wait-recent')?.state).toBe('waiting')
    expect(byId('wait-fuse')?.state).toBe('stale')
    // stale / error 到期移除;idle 无信息量一律清除
    expect(byId('stale-old')).toBeUndefined()
    expect(byId('error-old')).toBeUndefined()
    expect(byId('idle-any')).toBeUndefined()
  })

  it('returns the same reference when the sweep changes nothing', () => {
    const now = 1_000_000
    const list: AgentItem[] = [
      { id: 'fresh', name: 'fresh', state: 'working', task: '', updatedAt: now - 60_000 },
    ]
    expect(sweepAgents(list, now)).toBe(list)
  })
})
