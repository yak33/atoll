import { describe, expect, it } from 'vitest'
import { dequeueNotice, enqueueNotice, NOTICE_TTL_MS, type IslandNotice } from './notifyQueue'

describe('notifyQueue core logic', () => {
  it('enqueues notices with cap and keeps dropping the oldest', () => {
    const now = 1_000_000
    let queue: IslandNotice[] = []
    for (let i = 1; i <= 7; i++) {
      queue = enqueueNotice(queue, 'info', `消息${i}`, '', now + i)
    }
    // 上限 5:最旧的两条被挤掉,队头是消息 3
    expect(queue.length).toBe(5)
    expect(queue[0]?.title).toBe('消息3')
    expect(queue[4]?.title).toBe('消息7')
  })

  it('deduplicates identical notices inside the window', () => {
    const now = 1_000_000
    let queue: IslandNotice[] = []
    queue = enqueueNotice(queue, 'waiting', 'ZCode 等待确认', 'git commit', now)
    queue = enqueueNotice(queue, 'waiting', 'ZCode 等待确认', 'git commit', now + 500)
    expect(queue.length).toBe(1)

    // 超出去重窗口的重复推送正常入队
    queue = enqueueNotice(queue, 'waiting', 'ZCode 等待确认', 'git commit', now + 3000)
    expect(queue.length).toBe(2)
  })

  it('dequeues fresh notices and silently drops expired ones', () => {
    const now = 1_000_000
    const queue: IslandNotice[] = [
      { id: 1, kind: 'completed', title: '旧消息', detail: '', at: now - NOTICE_TTL_MS - 1 },
      { id: 2, kind: 'completed', title: '更旧的消息', detail: '', at: now - NOTICE_TTL_MS * 5 },
      { id: 3, kind: 'waiting', title: '新消息', detail: '等确认', at: now - 1000 },
    ]

    const first = dequeueNotice(queue, now)
    // 两条过期消息被静默丢弃,直接展示最新的那条
    expect(first.queue.length).toBe(0)
    expect(first.notice?.title).toBe('新消息')

    const empty = dequeueNotice([], now)
    expect(empty.notice).toBeNull()
  })
})
