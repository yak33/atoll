/**
 * 番茄钟状态机单测:启动/暂停/重置/阶段切换/时长配置/格式化。
 *
 * @author ZHANGCHAO 2026/10/01
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WORK_MS,
  applyDurations,
  durationOf,
  formatClock,
  initialState,
  pause,
  remainOf,
  reset,
  start,
  tick,
} from './pomodoro'

const T0 = 1_700_000_000_000
const MIN = 60_000

describe('pomodoro 状态机', () => {
  it('初始为工作阶段满时长,未运行(默认 25 分)', () => {
    const state = initialState()
    expect(state.phase).toBe('work')
    expect(state.running).toBe(false)
    expect(remainOf(state, T0)).toBe(DEFAULT_WORK_MS)
  })

  it('自定义时长初始化', () => {
    const state = initialState(50 * MIN, 10 * MIN)
    expect(remainOf(state, T0)).toBe(50 * MIN)
    expect(durationOf({ ...state, phase: 'break' })).toBe(10 * MIN)
  })

  it('start 设定结束时刻,重复 start 无副作用', () => {
    const started = start(initialState(), T0)
    expect(started.running).toBe(true)
    expect(remainOf(started, T0)).toBe(DEFAULT_WORK_MS)
    expect(remainOf(started, T0 + MIN)).toBe(DEFAULT_WORK_MS - MIN)
    expect(start(started, T0)).toBe(started)
  })

  it('pause 冻结剩余时长,暂停后可从剩余处继续', () => {
    const started = start(initialState(), T0)
    const paused = pause(started, T0 + 5 * MIN)
    expect(paused.running).toBe(false)
    expect(paused.remainMs).toBe(20 * MIN)
    const resumed = start(paused, T0 + 100 * MIN)
    expect(resumed.endAt).toBe(T0 + 100 * MIN + 20 * MIN)
  })

  it('tick 未到点无事发生', () => {
    const started = start(initialState(), T0)
    const result = tick(started, T0 + 1000)
    expect(result.completed).toBeNull()
    expect(result.state).toBe(started)
  })

  it('工作到点:自动进入休息并按配置时长开始,回报 completed=work', () => {
    const state = initialState(30 * MIN, 10 * MIN)
    const started = start(state, T0)
    const result = tick(started, T0 + 30 * MIN + 500)
    expect(result.completed).toBe('work')
    expect(result.state.phase).toBe('break')
    expect(result.state.running).toBe(true)
    expect(result.state.endAt).toBe(T0 + 30 * MIN + 500 + 10 * MIN)
  })

  it('休息到点:自动回到工作阶段', () => {
    let state = start(initialState(), T0)
    state = tick(state, T0 + DEFAULT_WORK_MS).state
    const result = tick(state, state.endAt + 1)
    expect(result.completed).toBe('break')
    expect(result.state.phase).toBe('work')
  })

  it('reset 回到当前阶段满时长并停止', () => {
    const started = start(initialState(), T0)
    const paused = pause(started, T0 + 3 * MIN)
    expect(reset(paused).remainMs).toBe(DEFAULT_WORK_MS)
    let state = tick(start(initialState(50 * MIN, 10 * MIN), T0), T0 + 50 * MIN).state
    expect(reset(state).remainMs).toBe(10 * MIN)
  })
})

describe('applyDurations 时长配置', () => {
  it('未运行:当前阶段立即回满新时长', () => {
    const updated = applyDurations(initialState(), 50 * MIN, 10 * MIN)
    expect(updated.workMs).toBe(50 * MIN)
    expect(updated.remainMs).toBe(50 * MIN)
  })

  it('未运行且当前是休息:休息回满新时长', () => {
    let state = tick(start(initialState(), T0), T0 + DEFAULT_WORK_MS).state
    state = pause(state, state.endAt) // 冻结在休息开始
    const updated = applyDurations(state, 50 * MIN, 15 * MIN)
    expect(updated.remainMs).toBe(15 * MIN)
  })

  it('运行中:不打断当前阶段,仅影响下一阶段', () => {
    const started = start(initialState(), T0) // endAt = T0 + 25min
    const updated = applyDurations(started, 50 * MIN, 10 * MIN)
    expect(updated.endAt).toBe(started.endAt)
    expect(remainOf(updated, T0)).toBe(DEFAULT_WORK_MS)
    // 走完后进入的休息阶段用新时长 10 分钟
    const result = tick(updated, updated.endAt + 1)
    expect(result.state.phase).toBe('break')
    expect(result.state.endAt).toBe(updated.endAt + 1 + 10 * MIN)
  })
})

describe('formatClock', () => {
  it('满时长显示 25:00(向上取整)', () => {
    expect(formatClock(DEFAULT_WORK_MS)).toBe('25:00')
  })

  it('秒数补零', () => {
    expect(formatClock(59_000)).toBe('00:59')
    expect(formatClock(60_000 + 5_000)).toBe('01:05')
  })

  it('归零显示 00:00', () => {
    expect(formatClock(0)).toBe('00:00')
  })
})
