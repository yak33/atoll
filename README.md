# atoll · 环礁

Windows 桌面「灵动岛」悬浮组件。首个功能模块：**智谱 GLM Coding Plan 用量窗口监控**(5h / 7d 滚动窗口用量与重置倒计时)。项目定位为可扩展的灵动岛容器，后续模块(通知、快捷工具等)在此骨架上追加。

> 命名:环礁(atoll)是一片礁盘上长出的一圈小岛——主程序是礁盘,每个功能模块是其中一座小岛,模块越挂越多,环礁逐渐成形。

## 技术栈

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 壳 | Tauri 2 | 透明置顶无边框窗口，渲染走系统 WebView2,常驻内存 30~60MB |
| UI | Vue 3 + TypeScript + Vite | Composition API + `<script setup>` |
| 数据 | 直连智谱官方额度接口 | 非公开文档接口，解析逻辑独立在 adapter 内 |

## 目录结构

```
atoll/
├── docs/                # 产品 / 架构 / 接口 / 路线图文档(先读这里)
├── src/                 # 前端(Vue)
│   ├── adapters/        #   各数据源适配器(zhipu.ts + 单测,纯函数)
│   ├── core/            #   轮询(QuotaPoller)/ 凭据存储 / 窗口布局 / 重置检测 / 通知
│   ├── composables/     #   应用级 60s 时钟与倒计时格式化
│   ├── components/      #   IslandPill(药丸)/ ExpandedPanel(展开)/ SettingsPanel(设置)
│   ├── types.ts         #   统一数据模型
│   ├── App.vue          #   三态状态机(pill/expanded/settings)
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
npm run tauri build  # 打包 Windows 安装包(需先补图标,见路线图 M4)
```

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [docs/01-产品需求.md](docs/01-产品需求.md) | 功能定义、三态 UI 状态机、阈值与倒计时规则 |
| [docs/02-架构设计.md](docs/02-架构设计.md) | 分层结构、数据模型、网络层与窗口行为设计 |
| [docs/03-智谱额度接口.md](docs/03-智谱额度接口.md) | 官方额度接口调用与解析规则(逆向所得,重点) |
| [docs/04-路线图.md](docs/04-路线图.md) | M0~M4 里程碑与后续扩展方向 |
