/**
 * atoll 落地页交互脚本。
 * 四件事：配色切换、首屏药丸展开、药丸偶发光效、滚动进场。
 * 光效调度逻辑移植自 src/composables/useGlowEffects.ts，参数保持一致。
 *
 * @author ZHANGCHAO 2026/10/01
 */
(function () {
  'use strict'

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // ===== 配色：auto → light → dark 循环，选择记在 localStorage =====
  var THEME_KEY = 'atoll-site-theme'
  var THEME_LABELS = { auto: '跟随系统', light: '浅色', dark: '深色' }
  var themeOrder = ['auto', 'light', 'dark']
  var themeBtn = document.getElementById('theme-btn')
  var themeLabel = themeBtn ? themeBtn.querySelector('.theme-label') : null

  function applyTheme(mode) {
    if (mode === 'auto') {
      document.documentElement.removeAttribute('data-theme')
    } else {
      document.documentElement.setAttribute('data-theme', mode)
    }
    if (themeLabel !== null) {
      themeLabel.textContent = THEME_LABELS[mode]
    }
    if (themeBtn !== null) {
      themeBtn.setAttribute('aria-label', '配色模式：' + THEME_LABELS[mode] + '，点击切换')
    }
  }

  var storedTheme = 'auto'
  try {
    var saved = localStorage.getItem(THEME_KEY)
    if (themeOrder.indexOf(saved) !== -1) storedTheme = saved
  } catch (err) {
    // 隐私模式下 localStorage 不可用，保持跟随系统
  }
  applyTheme(storedTheme)

  if (themeBtn !== null) {
    themeBtn.addEventListener('click', function () {
      var current = document.documentElement.getAttribute('data-theme') || 'auto'
      var next = themeOrder[(themeOrder.indexOf(current) + 1) % themeOrder.length]
      applyTheme(next)
      try {
        localStorage.setItem(THEME_KEY, next)
      } catch (err) {
        // 存不下不影响本次会话
      }
    })
  }

  // ===== 首屏药丸展开：结构变化模仿真实产品（窗口硬切 + 面板 200ms 入场） =====
  var desk = document.querySelector('[data-desk]')
  var pill = document.getElementById('demo-pill')
  var panel = document.getElementById('demo-panel')
  var COLLAPSE_DELAY_MS = 500
  var collapseTimer = 0

  function openDemo() {
    window.clearTimeout(collapseTimer)
    desk.classList.add('open')
    pill.setAttribute('aria-expanded', 'true')
  }

  function closeDemo() {
    desk.classList.remove('open')
    pill.setAttribute('aria-expanded', 'false')
  }

  /** 离开药丸后延迟收回，与产品里防误触抖动的 500ms 一致 */
  function scheduleClose() {
    window.clearTimeout(collapseTimer)
    collapseTimer = window.setTimeout(closeDemo, COLLAPSE_DELAY_MS)
  }

  if (desk !== null && pill !== null && panel !== null) {
    pill.addEventListener('mouseenter', openDemo)
    desk.addEventListener('mouseleave', scheduleClose)
    // 触屏没有 hover，点击与键盘走展开/收起
    pill.addEventListener('click', function () {
      if (desk.classList.contains('open')) {
        closeDemo()
      } else {
        openDemo()
      }
    })
    pill.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        pill.click()
      }
    })
  }

  // ===== 偶发光效：每 8~18s 从池子随机播一种，不连续重复 =====
  var GLOW_EFFECTS = [
    'flow',
    'comet',
    'dual',
    'clash',
    'ripple',
    'sonar',
    'twin',
    'aurora',
    'eclipse',
    'sweep',
    'sparkle',
  ]

  function startGlow(target) {
    var lastEffect = ''
    var clearTimer = 0
    var nextTimer = 0

    function play() {
      var candidates = GLOW_EFFECTS
      if (lastEffect !== '' && candidates.length > 1) {
        candidates = candidates.filter(function (effect) {
          return effect !== lastEffect
        })
      }
      var next = candidates[Math.floor(Math.random() * candidates.length)]
      lastEffect = next
      target.classList.add('do-' + next)
      // 2300ms 大于最长动画时长(flow/dual 2.2s)，到点摘 class 复位
      window.clearTimeout(clearTimer)
      clearTimer = window.setTimeout(function () {
        target.classList.remove('do-' + next)
      }, 2300)
    }

    function schedule(delayMs) {
      nextTimer = window.setTimeout(function () {
        play()
        schedule(8000 + Math.random() * 10000)
      }, delayMs)
    }

    schedule(6000 + Math.random() * 6000)
  }

  if (pill !== null && !reduceMotion) {
    startGlow(pill)
  }

  // ===== 倒计时：演示「纯本地计算」，格式与 src/composables/nowTick.ts 的 formatReset 一致 =====
  var countdownNodes = document.querySelectorAll('[data-countdown]')

  if (countdownNodes.length > 0) {
    var remainSeconds = 2 * 3600 + 15 * 60
    var lastText = ''

    function formatRemain(totalSeconds) {
      if (totalSeconds < 3600) return Math.floor(totalSeconds / 60) + 'm'
      return Math.floor(totalSeconds / 3600) + 'h ' + Math.floor((totalSeconds % 3600) / 60) + 'm'
    }

    window.setInterval(function () {
      remainSeconds -= 1
      if (remainSeconds <= 0) remainSeconds = 2 * 3600 + 15 * 60
      var text = formatRemain(remainSeconds)
      if (text === lastText) return
      lastText = text
      for (var i = 0; i < countdownNodes.length; i++) {
        countdownNodes[i].textContent = text
      }
    }, 1000)
  }

  // ===== 滚动进场 =====
  var revealNodes = document.querySelectorAll('.reveal')

  if (revealNodes.length > 0) {
    if (reduceMotion || typeof IntersectionObserver === 'undefined') {
      for (var r = 0; r < revealNodes.length; r++) {
        revealNodes[r].classList.add('in')
      }
    } else {
      var observer = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return
            entry.target.classList.add('in')
            observer.unobserve(entry.target)
          })
        },
        { rootMargin: '0px 0px -12% 0px', threshold: 0.12 },
      )
      for (var i = 0; i < revealNodes.length; i++) {
        observer.observe(revealNodes[i])
      }

      // 兜底：万一观察器没回调（个别内嵌 WebView 实现不全），内容不能永远看不见。
      // 代价只是晚到的那段淡入没了，不会丢信息。
      window.setTimeout(function () {
        for (var k = 0; k < revealNodes.length; k++) {
          revealNodes[k].classList.add('in')
        }
      }, 5000)
    }
  }
})()
