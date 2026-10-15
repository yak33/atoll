/**
 * 岛内气泡通知队列(core 层,纯函数)。
 * 消息依次展示:展示中的出列后,队列头的下一条接上;
 * 过期消息(TTL)出列时直接丢弃——展开面板期间积压的旧消息,收起后不再打扰。
 *
 * @author ZHANGCHAO 2026/10/15
 */

export type NoticeKind = 'waiting' | 'completed' | 'error' | 'reset' | 'info'

export interface IslandNotice {
  id: number
  kind: NoticeKind
  title: string
  detail: string
  at: number
}

/** 队列上限:突发消息挤掉最旧的,避免长时间连环弹出 */
const MAX_QUEUE = 5

/** 同一标题的去重窗口:短时间重复推送(如 hook 重试)只弹一次 */
const DEDUPE_MS = 2000

/** 消息保质期:超过该时长的积压消息出列时直接丢弃 */
export const NOTICE_TTL_MS = 15_000

let nextId = 1

/** 入队:去重 + 上限淘汰(丢最旧),返回新队列 */
export function enqueueNotice(
  queue: IslandNotice[],
  kind: NoticeKind,
  title: string,
  detail: string,
  now: number = Date.now(),
): IslandNotice[] {
  const duplicated = queue.some(
    (item) => item.kind === kind && item.title === title && now - item.at < DEDUPE_MS,
  )
  if (duplicated) return queue

  const next = [...queue, { id: nextId++, kind, title, detail, at: now }]
  return next.length > MAX_QUEUE ? next.slice(next.length - MAX_QUEUE) : next
}

/**
 * 出队:返回剩余队列与应展示的消息。
 * 队头的过期消息静默丢弃并继续尝试下一条,全部过期则返回 null。
 */
export function dequeueNotice(
  queue: IslandNotice[],
  now: number = Date.now(),
): { queue: IslandNotice[]; notice: IslandNotice | null } {
  const next = [...queue]
  while (next.length > 0) {
    const candidate = next.shift() as IslandNotice
    if (now - candidate.at <= NOTICE_TTL_MS) {
      return { queue: next, notice: candidate }
    }
  }
  return { queue: next, notice: null }
}
