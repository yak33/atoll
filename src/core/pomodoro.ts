/**
 * 番茄钟(core 层,纯逻辑)。
 * 状态基于「结束时间戳」而非累加 tick:窗口被托盘/全屏隐藏时 WebView 会节流
 * 定时器,时间戳方案在恢复显示的瞬间依然准确。
 * 阶段结束自动进入下一阶段(工作→休息→工作),toast 提醒由 App 层负责。
 *
 * @author ZHANGCHAO 2026/10/01
 */

export type PomodoroPhase = 'work' | 'break'

/** 工作 25 分钟 / 休息 5 分钟,经典配比;时长可配置等有真实需求再加 */
export const WORK_MS = 25 * 60 * 1000
export const BREAK_MS = 5 * 60 * 1000

export function phaseDuration(phase: PomodoroPhase): number {
  return phase === 'work' ? WORK_MS : BREAK_MS
}

export interface PomodoroState {
  phase: PomodoroPhase
  /** true = 计时中;false = 未开始或已暂停 */
  running: boolean
  /** 剩余毫秒:非运行态的真实剩余;运行态以 remainOf(state, now) 计算为准 */
  remainMs: number
  /** 结束时刻(epoch ms),仅 running 时有意义 */
  endAt: number
}

export function initialState(): PomodoroState {
  return { phase: 'work', running: false, remainMs: WORK_MS, endAt: 0 }
}

export function start(state: PomodoroState, now: number): PomodoroState {
  if (state.running) return state
  const remain = Math.max(0, state.remainMs)
  return { ...state, running: true, remainMs: remain, endAt: now + remain }
}

export function pause(state: PomodoroState, now: number): PomodoroState {
  if (!state.running) return state
  return { ...state, running: false, remainMs: remainOf(state, now) }
}

/** 重置:当前阶段回满时长并停止 */
export function reset(state: PomodoroState): PomodoroState {
  return { phase: state.phase, running: false, remainMs: phaseDuration(state.phase), endAt: 0 }
}

/** 真实剩余毫秒 */
export function remainOf(state: PomodoroState, now: number): number {
  if (!state.running) return Math.max(0, state.remainMs)
  return Math.max(0, state.endAt - now)
}

/** 每秒调用:到点则切换阶段并自动开始下一个;completed = 刚结束的阶段,null = 未发生切换 */
export function tick(state: PomodoroState, now: number): { state: PomodoroState; completed: PomodoroPhase | null } {
  if (!state.running || state.endAt > now) return { state, completed: null }
  const nextPhase: PomodoroPhase = state.phase === 'work' ? 'break' : 'work'
  const duration = phaseDuration(nextPhase)
  return {
    state: { phase: nextPhase, running: true, remainMs: duration, endAt: now + duration },
    completed: state.phase,
  }
}

/** mm:ss 倒计时文本;向上取整让首屏显示 25:00 而非 24:59 */
export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
