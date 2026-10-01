# atoll · 环礁

Windows 桌面「灵动岛」悬浮组件。当前模块:**智谱 GLM Coding Plan 用量窗口监控**(5h / 7d 滚动窗口用量与重置倒计时)+ **番茄钟**(可配时长,阶段自动切换)。项目定位为可扩展的灵动岛容器,收起态滚轮切换模块,后续模块在此骨架上追加。

> 命名:环礁(atoll)是一片礁盘上长出的一圈小岛——主程序是礁盘,每个功能模块是其中一座小岛,模块越挂越多,环礁逐渐成形。

## 技术栈

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 壳 | Tauri 2 | 透明置顶无边框窗口，渲染走系统 WebView2;常驻内存约 140MB(WebView2 多进程底噪为主,实测口径见路线图 M4) |
| UI | Vue 3 + TypeScript + Vite | Composition API + `<script setup>` |
| 数据 | 直连智谱官方额度接口 | 非公开文档接口，解析逻辑独立在 adapter 内 |

## 目录结构

```
atoll/
├── docs/                # 产品 / 架构 / 接口 / 路线图文档(先读这里)
├── src/                 # 前端(Vue)
│   ├── adapters/        #   各数据源适配器(zhipu.ts + 单测,纯函数)
│   ├── core/            #   轮询(QuotaPoller)/ 番茄钟状态机(pomodoro)/ 设置存储 / 窗口布局 / 通知
│   ├── composables/     #   60s 应用时钟 + 药丸偶发光效触发器
│   ├── components/      #   IslandPill + ExpandedPanel(用量)/ PomodoroPill + PomodoroPanel(番茄)/ SettingsPanel(设置)
│   ├── types.ts         #   统一数据模型
│   ├── App.vue          #   三态状态机 + 模块层(usage/pomodoro 切换),药丸基座与光效 CSS
│   └── main.ts
└── src-tauri/           # Rust 壳(窗口配置 + http/store/notification 插件)
```

## 环境要求

- Node.js ≥ 20,npm ≥ 10
- Rust stable(本机已验证:rustc 1.97.1)
- Visual Studio 生成工具(C++ 桌面开发负载,Rust MSVC 目标需要)
- WebView2 运行时(Windows 10/11 一般自带)

## 常用命令

```bash
npm install          # 安装前端依赖
npm run tauri dev    # 开发模式:启动 Vite + Tauri 窗口
npm run build        # 仅构建前端(vue-tsc 类型检查 + vite 产物)
npm run tauri build  # 打包 Windows 安装包(图标已就绪,产物在 src-tauri/target/release/bundle/nsis/)
```

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [docs/01-产品需求.md](docs/01-产品需求.md) | 功能定义、三态 UI 状态机、阈值与倒计时规则 |
| [docs/02-架构设计.md](docs/02-架构设计.md) | 分层结构、数据模型、网络层与窗口行为设计 |
| [docs/03-智谱额度接口.md](docs/03-智谱额度接口.md) | 官方额度接口调用与解析规则(逆向所得,重点) |
| [docs/04-路线图.md](docs/04-路线图.md) | M0~M5 里程碑、技术债与后续扩展方向 |
