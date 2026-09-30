import { createApp } from 'vue'
import App from './App.vue'

createApp(App).mount('#app')

// 禁用 WebView 默认右键菜单(浏览器样式,与桌面应用气质不符);
// 输入框保留原生菜单,不牺牲粘贴便利性
document.addEventListener('contextmenu', (event) => {
  const target = event.target as HTMLElement | null
  if (target === null) return
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
  event.preventDefault()
})
