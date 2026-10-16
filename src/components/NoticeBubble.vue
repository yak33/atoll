<script setup lang="ts">
/**
 * 岛内气泡通知(从药丸下方垂落的窄条)。
 * 展示:图标 + 标题 + 详情 + 关闭;自动收回倒计时(悬停暂停)与点击跳转由容器层管理。
 * 定位由容器的 .notice-stack 负责(绝对定位 + 纵向堆叠),本组件是普通流式元素。
 * 胶囊较窄、文案超宽时标题/详情循环滚动(跑马灯):复制两份内容整体平移 -50% 实现无缝衔接。
 *
 * 视觉动效:
 * 1. working 状态展示趣味内联火柴人,支持 4 种随机动效:
 *    - runner (活力快跑:身体起伏、前后摆臂与双腿蹬踏)
 *    - typer  (极客编程:快速交替敲击键盘、屏幕光标跳动、点头专注)
 *    - jumper (欢快蹦跳:蓄力起跳、腾空雀跃、高举双臂)
 *    - builder(工匠搬砖:手持铁锤有节奏挥打、火星迸发)
 * 2. 主题色与动效完全随机解耦 Agent:每条气泡随机抽取一套色板(青/紫/橙/绿/粉/靛/黄/碧)
 *    与一种动效,同一条气泡生命周期内保持稳定(不闪烁),下次触发重新抽取。
 * 3. 流光溢彩:主题色高光带定期从左往右扫过胶囊表面,颜色跟随当条气泡的主题色。
 *
 * @author ZHANGCHAO 2026/10/16
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { IslandNotice } from '../core/notifyQueue'

const props = defineProps<{ notice: IslandNotice }>()

const emit = defineEmits<{
  mouseenter: []
  mouseleave: []
  click: []
  close: []
}>()

// 非 working 状态采用标准字型图标
const KIND_ICONS: Record<Exclude<IslandNotice['kind'], 'working'>, string> = {
  waiting: '✋',
  completed: '✅',
  error: '⚠️',
  reset: '🔄',
  info: '🔔',
}

// ===== Agent 主题色板系统 =====
interface AgentTheme {
  id: string
  name: string
  color: string
  border: string
  glow: string
  bgTint: string
}

/** 8 套高品质、高对比度且与深浅色岛体完美融合的 Agent 色板 */
const AGENT_THEMES: AgentTheme[] = [
  {
    id: 'cyan',
    name: '天青蓝',
    color: 'rgb(56 189 248)',
    border: 'rgba(56, 189, 248, 0.45)',
    glow: 'rgba(56, 189, 248, 0.22)',
    bgTint: 'rgba(56, 189, 248, 0.08)',
  },
  {
    id: 'purple',
    name: '极光紫',
    color: 'rgb(192 132 252)',
    border: 'rgba(192, 132, 252, 0.45)',
    glow: 'rgba(192, 132, 252, 0.22)',
    bgTint: 'rgba(192, 132, 252, 0.08)',
  },
  {
    id: 'amber',
    name: '暖阳橙',
    color: 'rgb(251 146 60)',
    border: 'rgba(251, 146, 60, 0.45)',
    glow: 'rgba(251, 146, 60, 0.22)',
    bgTint: 'rgba(251, 146, 60, 0.08)',
  },
  {
    id: 'emerald',
    name: '薄荷绿',
    color: 'rgb(52 211 153)',
    border: 'rgba(52, 211, 153, 0.45)',
    glow: 'rgba(52, 211, 153, 0.22)',
    bgTint: 'rgba(52, 211, 153, 0.08)',
  },
  {
    id: 'rose',
    name: '幻彩粉',
    color: 'rgb(251 113 133)',
    border: 'rgba(251, 113, 133, 0.45)',
    glow: 'rgba(251, 113, 133, 0.22)',
    bgTint: 'rgba(251, 113, 133, 0.08)',
  },
  {
    id: 'indigo',
    name: '深邃靛',
    color: 'rgb(129 140 248)',
    border: 'rgba(129, 140, 248, 0.45)',
    glow: 'rgba(129, 140, 248, 0.22)',
    bgTint: 'rgba(129, 140, 248, 0.08)',
  },
  {
    id: 'yellow',
    name: '钛金黄',
    color: 'rgb(250 204 21)',
    border: 'rgba(250, 204, 21, 0.45)',
    glow: 'rgba(250, 204, 21, 0.22)',
    bgTint: 'rgba(250, 204, 21, 0.08)',
  },
  {
    id: 'teal',
    name: '松石碧',
    color: 'rgb(45 212 191)',
    border: 'rgba(45, 212, 191, 0.45)',
    glow: 'rgba(45, 212, 191, 0.22)',
    bgTint: 'rgba(45, 212, 191, 0.08)',
  },
]

/** 会话随机盐:保证每次应用会话或重启都有全新随机探索体验 */
const SESSION_SALT = Math.floor(Math.random() * 65536)

function getPseudoRandomHash(id: number, salt: number): number {
  let h = ((id + salt + SESSION_SALT) * 2654435761) | 0
  h ^= h >>> 16
  return Math.abs(h)
}

/**
 * 主题色完全解耦 Agent:
 * 不限定任何具体 Agent,任意 Agent 每次触发均随机抽取一套色板。
 */
function resolveRandomTheme(noticeId: number): AgentTheme {
  const hash = getPseudoRandomHash(noticeId, 101)
  return AGENT_THEMES[hash % AGENT_THEMES.length]
}

const theme = computed(() => resolveRandomTheme(props.notice.id))

// ===== 动效种类与完全随机调度 =====
type MotionType = 'runner' | 'typer' | 'jumper' | 'builder'
const MOTIONS: MotionType[] = ['runner', 'typer', 'jumper', 'builder']

/**
 * 动效完全解耦 Agent:
 * 任意 Agent 每次触发均随机抽取一套生动的火柴人动效(快跑/敲代码/蹦跳/搬砖)。
 */
function resolveRandomMotion(noticeId: number): MotionType {
  const hash = getPseudoRandomHash(noticeId, 2027)
  return MOTIONS[hash % MOTIONS.length]
}

const motionType = computed<MotionType>(() => resolveRandomMotion(props.notice.id))

// ===== 跑马灯:一行文案的溢出测量与恒速滚动参数 =====
function useMarquee() {
  const wrap = ref<HTMLElement | null>(null)
  const copy = ref<HTMLElement | null>(null)
  /** 文案超宽才滚动;否则静态展示,不复制第二份 */
  const scrolls = ref(false)
  /** 滚动一圈时长:按文案宽度换算,保持约 40px/s 恒速,最快 6s */
  const durationSec = ref('8s')

  function measure(): void {
    const wrapEl = wrap.value
    const copyEl = copy.value
    if (wrapEl === null || copyEl === null) return
    scrolls.value = wrapEl.scrollWidth > wrapEl.clientWidth + 1
    const seconds = Math.max(6, copyEl.offsetWidth / 40)
    durationSec.value = `${seconds.toFixed(1)}s`
  }

  return { wrap, copy, scrolls, durationSec, measure }
}

const { wrap: titleWrap, copy: titleCopy, scrolls: titleScrolls, durationSec: titleDuration, measure: measureTitle } =
  useMarquee()
const {
  wrap: detailWrap,
  copy: detailCopy,
  scrolls: detailScrolls,
  durationSec: detailDuration,
  measure: measureDetail,
} = useMarquee()

function measureAll(): void {
  measureTitle()
  measureDetail()
}

onMounted(measureAll)

watch(
  () => props.notice,
  async () => {
    titleScrolls.value = false
    detailScrolls.value = false
    await nextTick()
    measureAll()
  },
)
</script>

<template>
  <div
    :class="['notice-bubble', `bubble-${notice.kind}`]"
    :style="{
      '--theme-color': theme.color,
      '--theme-border': theme.border,
      '--theme-glow': theme.glow,
      '--theme-bg': theme.bgTint,
    }"
    @mouseenter="emit('mouseenter')"
    @mouseleave="emit('mouseleave')"
    @click="emit('click')"
  >
    <!-- working 动效小人:4 种随机动效(快跑/敲代码/蹦跳/搬砖敲击),朝气生动 -->
    <span
      v-if="notice.kind === 'working'"
      :class="['bubble-icon', 'bubble-stickman', `motion-${motionType}`]"
      aria-hidden="true"
    >
      <!-- 1. 奔跑小人:头与躯干上下颠簸,前后手臂前后轮番摆动,前后腿交替蹬踏大步奔跑 -->
      <svg
        v-if="motionType === 'runner'"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <g class="runner-body-bob">
          <circle cx="14" cy="4.2" r="2" />
          <line x1="13" y1="6.8" x2="11" y2="13" />
        </g>
        <g class="runner-arm-b"><path d="M13 8 L10.5 10.5 L8 9.5" /></g>
        <g class="runner-leg-b"><path d="M11 13 L8 16 L6.5 19.5" /></g>
        <g class="runner-leg-f"><path d="M11 13 L14 16.5 L17 19.5" /></g>
        <g class="runner-arm-f"><path d="M13 8 L15.5 10.5 L18 9" /></g>
      </svg>

      <!-- 2. 疯狂敲键盘小人:专注俯身,双臂高频交替敲击笔记本,屏幕光点闪动 -->
      <svg
        v-else-if="motionType === 'typer'"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <line x1="12" y1="18" x2="20" y2="18" stroke-width="1.8" />
        <line x1="18.5" y1="18" x2="19.8" y2="12" stroke-width="1.8" />
        <circle class="typer-spark" cx="17" cy="14" r="1.1" fill="currentColor" />
        <circle class="typer-head" cx="7.5" cy="7" r="2" />
        <path d="M7.5 9.2 L8.5 15" />
        <path d="M8.5 15 L5.5 17.5 L4 21" />
        <g class="typer-arm-1"><path d="M8 11.5 L11.5 14.5 L14.5 17.5" /></g>
        <g class="typer-arm-2"><path d="M8 11.5 L12.5 13.5 L16.5 17.5" /></g>
      </svg>

      <!-- 3. 欢快蹦跳小人:下蹲蓄力、腾空雀跃、高举双臂欢呼 -->
      <svg
        v-else-if="motionType === 'jumper'"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <g class="jumper-root">
          <circle cx="12" cy="6" r="2.1" />
          <line x1="12" y1="8.3" x2="12" y2="14.5" />
          <g class="jumper-arm-l"><path d="M12 10 L8 7 L6 4.5" /></g>
          <g class="jumper-arm-r"><path d="M12 10 L16 7 L18 4.5" /></g>
          <path d="M12 14.5 L9 18 L7.5 21" />
          <path d="M12 14.5 L15 18 L16.5 21" />
        </g>
      </svg>

      <!-- 4. 工匠搬砖/敲打小人:手握铁锤有节奏击打砧台,火星迸发 -->
      <svg
        v-else-if="motionType === 'builder'"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <rect x="15" y="16.5" width="6" height="4.5" rx="1" stroke-width="1.6" fill="currentColor" fill-opacity="0.2" />
        <circle class="builder-spark" cx="16" cy="16" r="1.2" fill="currentColor" />
        <circle cx="8" cy="6" r="2.1" />
        <line x1="8" y1="8.3" x2="9" y2="14.5" />
        <path d="M9 14.5 L7 18 L6 21.5" />
        <path d="M9 14.5 L12 18 L13.5 21.5" />
        <path d="M8.5 10 L6 13 L7.5 16" />
        <g class="builder-arm">
          <path d="M8.5 10 L13 10 L16 8" />
          <line x1="14.5" y1="5.5" x2="17.5" y2="10.5" stroke-width="3" stroke-linecap="square" />
        </g>
      </svg>
    </span>
    <span v-else class="bubble-icon">{{ KIND_ICONS[notice.kind] }}</span>

    <div class="bubble-body">
      <div
        ref="titleWrap"
        :class="['bubble-title', titleScrolls ? 'bubble-line-scrolling' : '']"
        :style="{ '--marquee-duration': titleDuration }"
      >
        <span ref="titleCopy" class="bubble-copy">{{ notice.title }}</span>
        <span v-if="titleScrolls" class="bubble-copy" aria-hidden="true">{{ notice.title }}</span>
      </div>
      <div
        v-if="notice.detail"
        ref="detailWrap"
        :class="['bubble-detail', detailScrolls ? 'bubble-line-scrolling' : '']"
        :style="{ '--marquee-duration': detailDuration }"
      >
        <span ref="detailCopy" class="bubble-copy">{{ notice.detail }}</span>
        <span v-if="detailScrolls" class="bubble-copy" aria-hidden="true">{{ notice.detail }}</span>
      </div>
    </div>
    <button class="bubble-close" type="button" title="关闭" @click.stop="emit('close')">✕</button>
  </div>
</template>

<style scoped>
/* 胶囊基座:复用 .island 的同一组变量,跟随主题皮肤与不透明度联动 */
.notice-bubble {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  min-height: 44px;
  padding: 6px 18px;
  border-radius: 9999px;
  background: var(--bg-surface);
  border: 1px solid var(--pill-border);
  box-shadow: var(--pill-shadow);
  color: var(--text-primary);
  font-size: 11px;
  cursor: pointer;
  animation: bubble-in 0.4s var(--ease-spring) both;
  transition: border-color 0.25s ease, box-shadow 0.25s ease, background 0.25s ease;
}

.notice-bubble:hover {
  border-color: var(--pill-border-hover);
}

@keyframes bubble-in {
  from {
    opacity: 0;
    transform: translateY(-12px) scale(0.85, 0.55);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1, 1);
  }
}

/* 流光溢彩:当条气泡主题色的斜向高光带从左往右扫过胶囊表面,扫完停一拍再来。
   颜色用 color-mix 从 --theme-color 派生(每条气泡随机主题色各流各的);
   裁在胶囊圆角内不出界,内容层抬到流光之上避免糊文字 */
.notice-bubble::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background: linear-gradient(
    115deg,
    transparent 30%,
    color-mix(in srgb, var(--theme-color, rgb(56 189 248)) 45%, transparent) 42%,
    rgba(255, 255, 255, 0.5) 50%,
    color-mix(in srgb, var(--theme-color, rgb(56 189 248)) 45%, transparent) 58%,
    transparent 78%
  );
  background-size: 250% 100%;
  background-repeat: no-repeat;
  opacity: 0;
  animation: bubble-sheen 3.6s ease-in-out 0.5s infinite;
}

/* 内容抬到流光之上:图标/文字/关闭钮不被高光带糊到 */
.bubble-icon,
.bubble-body,
.bubble-close {
  position: relative;
  z-index: 1;
}

@keyframes bubble-sheen {
  0% {
    background-position: -130% 0;
    opacity: 0;
  }
  8% {
    opacity: 1;
  }
  48% {
    opacity: 1;
  }
  55% {
    background-position: 130% 0;
    opacity: 0;
  }
  100% {
    background-position: 130% 0;
    opacity: 0;
  }
}

.bubble-icon {
  font-size: 14px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

/* 火柴人容器:继承当前 Agent 的主题色 */
.bubble-stickman {
  color: var(--theme-color, rgb(56 189 248));
}

.bubble-stickman svg {
  width: 17px;
  height: 17px;
}

/* ================= 1. RUNNER 快跑动效 ================= */
.runner-body-bob {
  animation: runner-bob 0.5s ease-in-out infinite;
}
.runner-arm-f {
  transform-origin: 13px 8px;
  animation: runner-arm-front 0.5s ease-in-out infinite;
}
.runner-arm-b {
  transform-origin: 13px 8px;
  animation: runner-arm-back 0.5s ease-in-out infinite;
}
.runner-leg-f {
  transform-origin: 11px 13px;
  animation: runner-leg-front 0.5s ease-in-out infinite;
}
.runner-leg-b {
  transform-origin: 11px 13px;
  animation: runner-leg-back 0.5s ease-in-out infinite;
}
@keyframes runner-bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-1.4px); }
}
@keyframes runner-arm-front {
  0%, 100% { transform: rotate(32deg); }
  50% { transform: rotate(-32deg); }
}
@keyframes runner-arm-back {
  0%, 100% { transform: rotate(-32deg); }
  50% { transform: rotate(32deg); }
}
@keyframes runner-leg-front {
  0%, 100% { transform: rotate(-30deg); }
  50% { transform: rotate(30deg); }
}
@keyframes runner-leg-back {
  0%, 100% { transform: rotate(30deg); }
  50% { transform: rotate(-30deg); }
}

/* ================= 2. TYPER 敲键盘动效 ================= */
.typer-arm-1 {
  transform-origin: 8px 11.5px;
  animation: typer-tap-1 0.2s ease-in-out infinite alternate;
}
.typer-arm-2 {
  transform-origin: 8px 11.5px;
  animation: typer-tap-2 0.2s ease-in-out 0.1s infinite alternate;
}
.typer-head {
  transform-origin: 7.5px 7px;
  animation: typer-nod 0.4s ease-in-out infinite;
}
.typer-spark {
  transform-origin: 17px 14px;
  animation: typer-blink 0.3s steps(2, start) infinite;
}
@keyframes typer-tap-1 {
  0% { transform: rotate(-7deg); }
  100% { transform: rotate(8deg); }
}
@keyframes typer-tap-2 {
  0% { transform: rotate(8deg); }
  100% { transform: rotate(-7deg); }
}
@keyframes typer-nod {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(0.8px); }
}
@keyframes typer-blink {
  0% { opacity: 0.2; transform: scale(0.6); }
  100% { opacity: 1; transform: scale(1.3); }
}

/* ================= 3. JUMPER 欢快跳跃动效 ================= */
.jumper-root {
  transform-origin: 12px 22px;
  animation: jumper-bounce 0.75s cubic-bezier(0.28, 0.84, 0.42, 1) infinite;
}
.jumper-arm-l {
  transform-origin: 12px 10px;
  animation: jumper-wave-l 0.75s ease-in-out infinite;
}
.jumper-arm-r {
  transform-origin: 12px 10px;
  animation: jumper-wave-r 0.75s ease-in-out infinite;
}
@keyframes jumper-bounce {
  0%, 100% { transform: translateY(0) scale(1, 1); }
  18% { transform: translateY(1.8px) scale(1.14, 0.86); }
  45% { transform: translateY(-4px) scale(0.9, 1.14); }
  70% { transform: translateY(-1.2px) scale(0.96, 1.04); }
  85% { transform: translateY(0.8px) scale(1.06, 0.94); }
}
@keyframes jumper-wave-l {
  0%, 100% { transform: rotate(0deg); }
  45% { transform: rotate(-18deg); }
}
@keyframes jumper-wave-r {
  0%, 100% { transform: rotate(0deg); }
  45% { transform: rotate(18deg); }
}

/* ================= 4. BUILDER 挥锤工匠动效 ================= */
.builder-arm {
  transform-origin: 8.5px 10px;
  animation: hammer-swing 0.65s cubic-bezier(0.25, 0.1, 0.25, 1) infinite;
}
.builder-spark {
  transform-origin: 16px 16px;
  animation: hammer-spark 0.65s cubic-bezier(0.25, 0.1, 0.25, 1) infinite;
}
@keyframes hammer-swing {
  0% { transform: rotate(-45deg); }
  34% { transform: rotate(18deg); }
  45% { transform: rotate(8deg); }
  60% { transform: rotate(10deg); }
  100% { transform: rotate(-45deg); }
}
@keyframes hammer-spark {
  0%, 30% { opacity: 0; transform: scale(0); }
  34% { opacity: 1; transform: scale(1.5); }
  50% { opacity: 0; transform: scale(0.3); }
  100% { opacity: 0; }
}

.bubble-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

/* 文案行:溢出隐藏;超宽时由 bubble-line-scrolling 启动跑马灯 */
.bubble-title {
  display: flex;
  overflow: hidden;
  min-width: 0;
  font-weight: 700;
  white-space: nowrap;
}

.bubble-detail {
  display: flex;
  overflow: hidden;
  min-width: 0;
  font-size: 10px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.bubble-copy {
  flex-shrink: 0;
  padding-right: 28px;
}

.bubble-line-scrolling > .bubble-copy {
  animation: bubble-marquee var(--marquee-duration, 8s) linear infinite;
}

@keyframes bubble-marquee {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(-50%);
  }
}

.notice-bubble:hover .bubble-copy {
  animation-play-state: paused;
}

.bubble-close {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 10px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 9999px;
  flex-shrink: 0;
}

.bubble-close:hover {
  color: var(--text-primary);
  background: var(--surface-overlay);
}

/* ===== 状态色与呼吸发光 ===== */
/* working:采用当前 Agent 的专属边框色、温和微光内阴影与细微背景渐变 */
.bubble-working {
  border-color: var(--theme-border, rgba(56, 189, 248, 0.45));
  background: linear-gradient(135deg, var(--bg-surface) 60%, var(--theme-bg, rgba(56, 189, 248, 0.08)) 100%);
  animation:
    bubble-in 0.4s var(--ease-spring) both,
    bubble-glow-working 2.4s ease-in-out 0.45s infinite;
}

.bubble-waiting {
  border-color: rgba(245, 158, 11, 0.6);
  animation:
    bubble-in 0.4s var(--ease-spring) both,
    bubble-glow-waiting 1.6s ease-in-out 0.45s infinite;
}

.bubble-completed {
  border-color: rgba(34, 197, 94, 0.5);
  box-shadow: var(--pill-shadow), inset 0 0 12px rgba(34, 197, 94, 0.14);
}

.bubble-error {
  border-color: rgba(239, 68, 68, 0.55);
  box-shadow: var(--pill-shadow), inset 0 0 12px rgba(239, 68, 68, 0.16);
}

.bubble-reset {
  border-color: rgba(56, 189, 248, 0.5);
  box-shadow: var(--pill-shadow), inset 0 0 12px rgba(56, 189, 248, 0.12);
}

@keyframes bubble-glow-working {
  0%,
  100% {
    box-shadow: var(--pill-shadow), inset 0 0 6px var(--theme-glow, rgba(56, 189, 248, 0.12));
  }
  50% {
    box-shadow: var(--pill-shadow), inset 0 0 16px var(--theme-glow, rgba(56, 189, 248, 0.28));
  }
}

@keyframes bubble-glow-waiting {
  0%,
  100% {
    box-shadow: var(--pill-shadow), inset 0 0 6px rgba(245, 158, 11, 0.12);
  }
  50% {
    box-shadow: var(--pill-shadow), inset 0 0 16px rgba(245, 158, 11, 0.38);
  }
}

@media (prefers-reduced-motion: reduce) {
  .notice-bubble,
  .bubble-working,
  .bubble-waiting,
  .bubble-stickman *,
  .bubble-line-scrolling > .bubble-copy {
    animation: none !important;
  }

  .notice-bubble::before {
    animation: none !important;
    opacity: 0;
  }
}
</style>
