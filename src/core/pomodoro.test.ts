/**
 * 番茄钟状态机单测:启动/暂停/重置/阶段切换/格式化。
 *
 * @author ZHANGCHAO 2026/10/01
 */
import { describe, expect, it } from 'vitest'
import {
  BREAK_MS,
  WORK_MS,
  formatClock,
  initialState,
  pause,
  remainOf,
  reset,
  start,
  tick,
} from './pomodoro'

const T0 = 1_700_000_000_000

describe('pomodoro 状态机', () => {
  it('初始为工作阶段 25 分钟,未运行', () => {
    const state = initialState()
    expect(state.phase).toBe('work')
    expect(state.running).toBe(false)
    expect(remainOf(state, T0)).toBe(WORK_MS)
  })

  it('start 设定结束时刻,重复 start 无副作用', () => {
    const started = start(initialState(), T0)
    expect(started.running).toBe(true)
    expect(remainOf(started, T0)).toBe(WORK_MS)
    expect(remainOf(started, T0 + 60_000)).toBe(WORK_MS - 60_000)
    expect(start(started, T0)).toBe(started)
  })

  it('pause 冻结剩余时长,暂停后可从剩余处继续', () => {
    const started = start(initialState(), T0)
    const paused = pause(started, T0 + 5 * 60_000)
    expect(paused.running).toBe(false)
    expect(paused.remainMs).toBe(20 * 60_000)
    const resumed = start(paused, T0 + 100 * 60_000)
    expect(resumed.endAt).toBe(T0 + 100 * 60_000 + 20 * 60_000)
  })

  it('tick 未到点无事发生', () => {
    const started = start(initialState(), T0)
    const result = tick(started, T0 + 1000)
    expect(result.completed).toBeNull()
    expect(result.state).toBe(started)
  })

  it('工作到点:自动进入休息 5 分钟并回报 completed=work', () => {
    const started = start(initialState(), T0)
    const result = tick(started, T0 + WORK_MS + 500)
    expect(result.completed).toBe('work')
    expect(result.state.phase).toBe('break')
    expect(result.state.running).toBe(true)
    expect(result.state.endAt).toBe(T0 + WORK_MS + 500 + BREAK_MS)
  })

  it('休息到点:自动回到工作阶段', () => {
    let state = start(initialState(), T0)
    state = tick(state, T0 + WORK_MS).state
    const result = tick(state, state.endAt + 1)
    expect(result.completed).toBe('break')
    expect(result.state.phase).toBe('work')
  })

  it('reset 回到当前阶段满时长并停止', () => {
    const started = start(initialState(), T0)
    const paused = pause(started, T0 + 3 * 60_000)
    const cleared = reset(paused)
    expect(cleared.running).toBe(false)
    expect(cleared.remainMs).toBe(WORK_MS)
    // 休息阶段重置回休息时长
    let state = tick(start(initialState(), T0), T0 + WORK_MS).state
    expect(reset(state).remainMs).toBe(BREAK_MS)
  })
})

describe('formatClock', () => {
  it('满时长显示 25:00(向上取整)', () => {
    expect(formatClock(WORK_MS)).toBe('25:00')
  })

  it('秒数补零', () => {
    expect(formatClock(59_000)).toBe('00:59')
    expect(formatClock(60_000 + 5_000)).toBe('01:05')
  })

  it('归零显示 00:00', () => {
    expect(formatClock(0)).toBe('00:00')
  })
})
