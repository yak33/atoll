/**
 * 离线微音效(F2):Web Audio 合成,零音频文件、零依赖。
 * AudioContext 受浏览器自动播放策略约束,创建/恢复失败一律静默——
 * 音效是增强反馈,绝不影响任何主流程(同 notify.ts 的容错哲学)。
 *
 * @author ZHANGCHAO 2026/10/06
 */

let audioCtx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (audioCtx === null) {
    try {
      audioCtx = new AudioContext()
    } catch {
      return null
    }
  }
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume().catch(() => {
      // 无用户手势时恢复被拒:本次静默跳过
    })
  }
  // Web Audio 规范允许向 suspended 状态调度音频节点,resume 异步完成后会自动发声;仅 closed 判空
  return audioCtx.state !== 'closed' ? audioCtx : null
}

/** 合成一个短促的双音水滴声:高频轻落 + 低频余韵 */
function playChime(frequency: number, durationMs: number): void {
  const ctx = getCtx()
  if (ctx === null) return
  const now = ctx.currentTime
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000)
  gain.connect(ctx.destination)

  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(frequency, now)
  osc.frequency.exponentialRampToValueAtTime(frequency * 0.6, now + durationMs / 1000)
  osc.connect(gain)
  osc.start(now)
  osc.stop(now + durationMs / 1000)
}

/** 音效语义:phase=番茄阶段切换,reset=额度窗口重置,copy=复制成功 */
export function playSound(kind: 'phase' | 'reset' | 'copy'): void {
  if (kind === 'phase') playChime(880, 220)
  else if (kind === 'reset') playChime(660, 300)
  else playChime(1100, 150)
}
