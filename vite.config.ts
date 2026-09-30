import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Tauri 开发模式下 Vite 作为内嵌资源服务器:
// strictPort 保证 tauri.conf.json 里 devUrl 端口永远命中;
// clearScreen=false 保留 Rust 侧编译输出;
// watch.ignored 排除 src-tauri(cargo 编译 target/ 时文件加锁,会触发 EBUSY 崩掉 dev server)。
export default defineConfig({
  plugins: [vue()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    // WebView2(Chromium 内核)目标,无需兼容旧浏览器
    target: 'chrome105',
  },
})
