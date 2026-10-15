/**
 * 智能体监控模块(core 层):状态模型、优先级仲裁与事件映射。
 *
 * 状态优先级:
 *   waiting(等待确认) > working(思考/执行) > error(异常) > completed(已完成) > idle/stale(待命/状态不明)
 *   error 排在 completed 之前:异常比「好消息」更需要用户看到。
 *
 * 收起态药丸始终展示优先级最高的一个 Agent;
 * 展开态面板展示所有已知 Agent 列表与实时步骤。
 * stale 是内部状态:hook 断流导致 working 长时间无事件、或 waiting 超过保险丝时
 * 由清扫函数降级产生,外部上报的同义词不会映射到它。
 *
 * @author ZHANGCHAO 2026/10/14
 */

export type AgentState = 'working' | 'waiting' | 'completed' | 'idle' | 'error' | 'stale'

export interface AgentItem {
  id: string
  name: string
  state: AgentState
  task: string
  updatedAt: number
}

export interface AgentStatusPayload {
  id: string
  name?: string
  state: AgentState | string
  task?: string
  timestamp?: number
}

/** working 超过该时长没有新事件 → 降级为 stale(LLM 长思考可能数分钟无事件,取 10 分钟降低误判) */
export const WORKING_STALE_MS = 10 * 60 * 1000

/** completed 停留该时长后直接移除条目(完成提示已被消费,不产生驻留幽灵) */
export const COMPLETED_REMOVE_MS = 5 * 60 * 1000

/** stale/error 停留该时长后移除:断流/异常提示半小时没人管,就是没人需要它了 */
export const STALE_REMOVE_MS = 30 * 60 * 1000
export const ERROR_REMOVE_MS = 30 * 60 * 1000

/** waiting 保险丝:超时未处理降级为 stale,避免 hook 挂掉后永久琥珀跳动 */
export const WAITING_FUSE_MS = 60 * 60 * 1000

/** 状态优先级:数值越高越需要用户注意力 */
export function priorityOf(state: AgentState): number {
  switch (state) {
    case 'waiting':
      return 4
    case 'working':
      return 3
    case 'error':
      return 2
    case 'completed':
      return 1
    case 'idle':
    case 'stale':
    default:
      return 0
  }
}

/** 规范化外部传入的状态字符串 */
export function normalizeState(rawState: string): AgentState {
  const s = rawState.trim().toLowerCase()
  if (s === 'waiting' || s === 'wait' || s === 'ask' || s === 'prompt') return 'waiting'
  if (s === 'working' || s === 'running' || s === 'thinking' || s === 'busy') return 'working'
  if (s === 'completed' || s === 'done' || s === 'success' || s === 'finish') return 'completed'
  if (s === 'error' || s === 'failed') return 'error'
  return 'idle'
}

/** 插入或更新 Agent 状态,并按优先级由高到低重排 */
export function upsertAgent(
  list: AgentItem[],
  payload: AgentStatusPayload,
  now: number = Date.now(),
): AgentItem[] {
  if (!payload.id || payload.id.trim() === '') return list

  const id = payload.id.trim()
  const name = payload.name && payload.name.trim() !== '' ? payload.name.trim() : id
  const state = normalizeState(payload.state)
  const task = payload.task ? payload.task.trim() : ''
  const updatedAt = payload.timestamp && payload.timestamp > 0 ? payload.timestamp : now

  const next = [...list]
  const existingIdx = next.findIndex((item) => item.id === id)

  const updatedItem: AgentItem = {
    id,
    name,
    state,
    task,
    updatedAt,
  }

  if (existingIdx >= 0) {
    next[existingIdx] = updatedItem
  } else {
    next.push(updatedItem)
  }

  return sortAgents(next)
}

/** 排序:优先级高的在前;优先级相同时,最新更新的在前 */
function sortAgents(list: AgentItem[]): AgentItem[] {
  return [...list].sort((a, b) => {
    const diffPriority = priorityOf(b.state) - priorityOf(a.state)
    if (diffPriority !== 0) return diffPriority
    return b.updatedAt - a.updatedAt
  })
}

/**
 * 定期清扫(挂 60s 时钟),让条目无需手动清空也能走完生命周期:
 *   - working 超时无事件 → 降级 stale(hook 可能断流,不能永远显示「正在执行」)
 *   - waiting 超过保险丝 → 降级 stale(未决事项不删除,只是不再永久跳动)
 *   - completed / stale / error 到期 → 移除条目
 *   - idle 一律移除(待命无信息量,SessionStart 上报的也不例外)
 */
export function sweepAgents(list: AgentItem[], now: number = Date.now()): AgentItem[] {
  let changed = false
  const next: AgentItem[] = []
  for (const item of list) {
    const age = now - item.updatedAt
    // 到期移除的三类 + 无信息量的 idle
    if (item.state === 'idle') {
      changed = true
      continue
    }
    if (item.state === 'completed' && age > COMPLETED_REMOVE_MS) {
      changed = true
      continue
    }
    if (item.state === 'stale' && age > STALE_REMOVE_MS) {
      changed = true
      continue
    }
    if (item.state === 'error' && age > ERROR_REMOVE_MS) {
      changed = true
      continue
    }
    // 降级保留的两类:断流 working 与保险丝 waiting
    if ((item.state === 'working' && age > WORKING_STALE_MS) || (item.state === 'waiting' && age > WAITING_FUSE_MS)) {
      changed = true
      next.push({ ...item, state: 'stale' })
      continue
    }
    next.push(item)
  }
  // 状态变化会改变优先级,重排以维持「list[0] = 最高优先级」的约定;无变化时返回原引用
  return changed ? sortAgents(next) : list
}

/** 移除指定 Agent */
export function removeAgent(list: AgentItem[], id: string): AgentItem[] {
  return list.filter((item) => item.id !== id)
}

/** 获取优先级最高的 Agent 作为药丸默认展示项 */
export function resolvePrimaryAgent(list: AgentItem[]): AgentItem | null {
  return list.length > 0 ? list[0] : null
}

/** 中文状态名映射 */
export function stateLabel(state: AgentState): string {
  switch (state) {
    case 'waiting':
      return '等待确认'
    case 'working':
      return '正在执行'
    case 'completed':
      return '已完成'
    case 'error':
      return '异常中断'
    case 'stale':
      return '状态不明'
    case 'idle':
    default:
      return '待命就绪'
  }
}

/** 状态图标映射 */
export function stateIcon(state: AgentState): string {
  switch (state) {
    case 'waiting':
      return '✋'
    case 'working':
      return '⚡'
    case 'completed':
      return '✅'
    case 'error':
      return '⚠️'
    case 'stale':
      return '❓'
    case 'idle':
    default:
      return '🤖'
  }
}
