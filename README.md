<div align="center">

<img src="./site/assets/og.png" alt="atoll banner" width="100%" style="border-radius: 12px; margin-bottom: 16px;" />

<img src="./site/assets/icon.svg" alt="atoll logo" width="80" height="80" />

# atoll · 环礁

**钉在 Windows 屏幕顶部的现代化灵动岛悬浮组件**

智谱 GLM Coding Plan 用量监控 · DeepSeek 钱包余额 · 极简番茄钟 · 剪贴板历史 · AI Agent 伴生监控

[![Version](https://img.shields.io/badge/version-v0.4.0-emerald?style=flat-square)](https://github.com/yak33/atoll/releases)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-blue?style=flat-square)](https://github.com/yak33/atoll/releases)
[![Tauri](https://img.shields.io/badge/Tauri-2.x-24C8D8?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app/)
[![Vue](https://img.shields.io/badge/Vue-3.5-4FC08D?style=flat-square&logo=vue.js&logoColor=white)](https://vuejs.org/)
[![Tests](https://img.shields.io/badge/tests-137%20passing-brightgreen?style=flat-square)](https://github.com/yak33/atoll)
[![Size](https://img.shields.io/badge/installer-~3.08%20MiB-orange?style=flat-square)](https://github.com/yak33/atoll/releases/latest)
[![License](https://img.shields.io/badge/license-MIT-zinc?style=flat-square)](LICENSE)

[🌐 访问官网](https://atoll-site-swart.vercel.app/) &nbsp;|&nbsp; [⬇️ 下载安装包 (v0.4.0)](https://github.com/yak33/atoll/releases/latest) &nbsp;|&nbsp; [📝 版本更新日志](https://github.com/yak33/atoll/releases) &nbsp;|&nbsp; [English Document](./README_EN.md)

</div>

---

## 🌊 30 秒了解 atoll

> **环礁 (Atoll)**：海洋中由一圈珊瑚岛礁环抱中央泻湖而成的地形。  
> 主程序是坚实的**底座礁盘**，每个独立能力是礁盘上生长出的**小岛**。模块自由插拔，环礁随心而定。

**atoll** 专为 Windows 10/11 桌面打造，平时以一颗 **260 × 44 像素** 的极简毛玻璃胶囊静悬于屏幕顶端，带来无感又随手可得的体验：

- 👁️ **额度还剩多少，余光一瞟便知**：告别频繁切网页查额度，5h / 7d 滚动窗口、消耗速率折线与告警呼吸灯尽收眼底。
- 🤖 **Agent 干活实时盯防**：ZCode、Claude Code、Antigravity、Qoder、Trae 等 IDE AI 在执行、等待确认还是已完成，药丸状态涟漪与岛内悬挂气泡实时反馈。
- 🫥 **极致克制，绝不打扰**：不抢焦点、无任务栏图标侵占、全屏看片游戏**毫秒级自隐**、贴顶静止 3 秒化为 **3px 霓虹流光线**。
- 🪶 **纯净绿色与原生开销**：基于 **Tauri 2 + Vue 3** 构建，安装包仅 **~3.08 MiB**，Tauri 核心进程内存仅约 **30 MB**，绝无后台外链。

---

## 🧩 核心功能矩阵

atoll 采用**多模块容器架构**，所有模块均支持在设置中自定义显示/隐藏与上下拖拽排序，收起态通过鼠标滚轮即可平滑切屏切换。

| 模块 | 核心能力与特性 | 药丸收起态预览 | 展开面板特有能力 |
| :--- | :--- | :--- | :--- |
| **🧠 智谱 GLM 用量** | • 5h 与 7d 双滚动窗口用量百分比<br>• 本地精准时钟推算重置倒计时<br>• 个人版 / 团队版全适配（Token / 信用额度） | 当前最紧张窗口进度条<br>+ 百分比 + 倒计时<br>+ Agent 状态指示点 | • 24 小时双线 Sparkline 趋势图<br>• 消耗速率粗估（预计耗尽时间）<br>• 三档感知呼吸告警（绿 / 琥珀 / 红）<br>• 窗口重置 Windows Toast 提醒 |
| **🐋 DeepSeek 余额** | • 接入官方 `GET /user/balance` 接口<br>• 多币种（CNY / USD）独立分列展示<br>• 纯只读查询，零 Token 损耗 | 实时总可用余额<br>+ 币种标识<br>+ 低余额色温告警 | • 充值余额与未过期赠金细分明细<br>• 24h 余额消耗走势与耗尽预测<br>• 充值自动校准消耗基线<br>• 10 分钟随机抖动防封轮询 |
| **🤖 Agent 伴生监控**<br>*(并入用量岛)* | • 跨 6 大 IDE 宿主状态实时感知<br>• 优先仲裁：等待确认 > 执行中 > 错误<br>• 断流与崩溃 10 分钟自愈超时 | 右端声呐涟漪（执行中）<br>琥珀跳动（待确认）<br>红色常亮（异常） | • 顶部 Agent 活跃条目列表（5min 自清）<br>• 岛内悬垂流光气泡通知（微剧场动效）<br>• 气泡支持长驻、排队与防误触悬停<br>• 支持无感回退 Windows 系统通知 |
| **🍅 极简番茄钟** | • 专注（5~60m）与休息自由调节<br>• 基于绝对时间戳驱动，防休眠漂移<br>• 极轻微心跳呼吸律动 | 阶段标识 🍅<br>+ 当前阶段剩余倒计时<br>+ 状态律动点 | • 快捷开始 / 暂停 / 重置流转控制<br>• 阶段切换桌面 Toast 提醒<br>• Web Audio 纯代码合成双音水滴声 |
| **📋 智能剪贴板** | • Win32 原生事件驱动，零轮询零占用<br>• 纯文本与图像（截图/复制）自动捕获<br>• 本地明文存储，绝不上云 | 当前收录条目总数<br>+ 剪贴板状态图标 | • 文本即时子串高亮搜索<br>• 图像缩略图悬停大图预览<br>• 重复内容自动置顶去重<br>• 一键复制回剪贴板 / 置顶防淘汰 |

---

## 🎨 视觉工艺与交互哲学

<div align="center">

```
  [ 收起态 Pill (260×44) ] ──────( 滚轮滚动 )──────> 模块平滑切换 (用量 / 余额 / 番茄 / 剪贴)
             │
             ├──( 鼠标悬停 / 单击 )──────> [ 展开态 Panel (280~400 × 265~380) ]
             │                                   │ (点击右上角 ⚙)
             │                                   ▼
             └──( 贴顶静止 3 秒 )───────> [ 设置态 Settings (340 × 700) ]
                  [ 3px 霓虹流光折叠态 ]
```

</div>

- **三态无缝变形**：收起态极简吸顶，悬停即展，展开态提供深度控制与趋势可视化，设置态提供统一分模块配置。
- **6 款精心调配的质感皮肤**：黑曜石（经典翠绿）、深海蓝（科技冰蓝）、极光紫（暗夜霓虹）、赤焰橙（暖意落日）、薄荷绿（清爽森系）、钛金金（哑黑钛金），全 UI 氛围联动。
- **11 种偶发物理流光系统**：边框流光、彗星拖尾、粒子对撞、声呐涟漪、月食金边等 11 款基于物理律动的偶发光效，点缀桌面灵气。
- **贴顶折叠为 3px 霓虹线**：当药丸贴近屏幕上沿并静止 3 秒后，自动收敛为一条细腻的霓虹流光线；鼠标触碰即瞬间唤醒。
- **全屏智能避让**：内置 Win32 前台窗口探测，检测到全屏游戏、PPT 演示或全屏视频播放时，**毫秒级自动隐身**，退出全屏原位回归。
- **物理防丢失边界**：无论如何拖拽甩动窗口，松手时自动吸附回屏幕可视区域内部，配合高分屏 DPI 自适应演算，永不掉出视界。

---

## 🔌 AI Agent 伴生插件支持

atoll 桌面端在本地回环地址 `127.0.0.1:41799` 启动了专用桥接服务（仅本机可达、无 CORS 风险），通过本地极简 Hook 实时感知 AI 助手工作状态：

| 宿主 IDE / 工具 | 伴生插件目录 | 集成原理与特点 | 安装与配置方式 |
| :--- | :--- | :--- | :--- |
| **ZCode** | `plugins/zcode-bridge` | Process 型 hook 调本地 `curl.exe` | 设置 → 插件管理 → 从本地目录添加 `plugins/` |
| **Claude Code** | `plugins/claude-bridge` | 宿主原生 HTTP hook 直发，零 shell 依赖 | `/plugin marketplace add <path>/plugins`<br>`/plugin install atoll-claude-bridge@atoll-bridges` |
| **Google Antigravity** | `plugins/antigravity-bridge` | 官方 hooks 命令安全调桥 | 将配置写入 `~/.gemini/config/hooks.json` |
| **Qoder** (含 Qoder CN) | `plugins/qoder-bridge` | 官方 hooks，精确捕获确认工具 | 根目录下执行：`node scripts/install-qoder-bridge.mjs`，重启 IDE |
| **Trae** (含 Trae CN) | `plugins/trae-bridge` | 全局 hooks，Notification 事件联动 | 根目录下执行：`node scripts/install-trae-bridge.mjs`，重启 IDE |
| **DeepSeek Harness** | `plugins/deepseek-bridge` | Cordis 插件，进程内 `fetch` 上报 | `dsh plugin --profile desktop add file:<path>/plugins/deepseek-bridge` |

> 详细配置与故障排查说明请参阅 [plugins/README.md](plugins/README.md)。

---

## 🚀 快速开始

### 方式一：下载 Windows 预编译安装包（推荐）

1. 前往 [Releases 页面](https://github.com/yak33/atoll/releases/latest) 下载最新版 `atoll_0.4.0_x64-setup.exe`；
2. 双击安装（安装在用户本地目录，**无需管理员权限**）；
3. 悬停展开顶部药丸，点击右上角 ⚙ 进入设置：
   - 在「智谱」页输入您的 API Key（团队版可填写组织与项目 ID）；
   - 在「余额」页输入 DeepSeek 开放平台 API Key（两套 Key 独立分开保存）。

> 🔒 **隐私与安全承诺**：atoll 是**零后端、无上传**的开源纯桌面程序。您的 API 凭据以明文 JSON 仅保存在本机应用数据目录。除了向智谱官方额度接口与 DeepSeek 官方余额接口发起只读查询外，绝不向任何第三方服务上传一行数据。

---

### 方式二：从源码本地构建与运行

#### 环境要求
- [Node.js](https://nodejs.org/) ≥ 20
- [Rust](https://www.rust-lang.org/) stable (推荐 rustc ≥ 1.80)
- Visual Studio 生成工具（勾选「C++ 桌面开发」工作负载）
- Windows 10 / 11（系统自带 WebView2）

#### 构建命令

```bash
# 1. 克隆仓库
git clone https://github.com/yak33/atoll.git
cd atoll

# 2. 安装前端依赖
npm install

# 3. 启动开发环境 (同时启动 Vite 与 Tauri 透明置顶窗口)
npm run tauri dev

# 4. 运行全套单元测试 (137 个核心单测自动化覆盖)
npm test

# 5. 构建桌面生产安装包 (生成产物于 src-tauri/target/release/bundle/nsis/)
npm run tauri build
```

---

## 🏗️ 架构与可扩展设计

atoll 采用 **「纯函数业务内核 + 注册表驱动容器 + 系统原生壳层」** 的解耦架构：

```
atoll/
├── src/
│   ├── adapters/        # 数据源适配器: zhipu.ts(接口解析与集中容错) / deepseek.ts(官方余额解析)
│   ├── core/            # 核心领域逻辑 (全部纯函数 + 配套 .test.ts 单测)
│   │   ├── QuotaPoller.ts       # 智谱轮询调度器 (5m + 随机抖动 + 指数退避)
│   │   ├── BalancePoller.ts     # DeepSeek 轮询调度器 (10m + 抖动退避)
│   │   ├── agentHub.ts          # Agent 状态机 (仲裁、保活与生命周期清扫)
│   │   ├── notifyQueue.ts       # 岛内悬垂通知队列 (纯函数)
│   │   ├── pomodoro.ts          # 番茄钟状态机 (时间戳防漂移)
│   │   ├── clipboardHistory.ts  # 剪贴板历史 (去重、排序与搜索)
│   │   ├── moduleLayout.ts      # 模块布局编排 (可见性与自定义排序)
│   │   └── theme.ts / sound.ts  # 皮肤主题响应与 Web Audio 离线音效
│   ├── components/      # 视图层: 各模块收起态 XxxPill.vue 与展开态 XxxPanel.vue 组件对
│   ├── islandModules.ts # 模块注册表 (挂载、尺寸映射、显示配置)
│   └── App.vue          # 三态状态机、拖拽物理边界、流光容器
├── src-tauri/           # Rust 壳层: 窗口穿透 / 托盘 / 全屏探测 / 剪贴板监听 / 本地 HTTP 桥
├── plugins/             # 伴生 Agent 插件市场 (ZCode / Claude / Qoder / Trae / DSH)
└── site/                # 官方纯静态落地页 (HTML/CSS/JS 零构建)
```

### 🧩 5 步为 atoll 扩展新模块

任何新模块的扩展都符合规范化的插件体系（可参考番茄钟 `pomodoro` 的实现）：
1. **编写核心逻辑**：在 `src/core/` 实现纯函数逻辑或状态机，并编写 `.test.ts` 单测；
2. **构建组件对**：在 `src/components/` 实现 `XxxPill.vue`（收起态）与 `XxxPanel.vue`（展开态）；
3. **注册模块**：在 `src/islandModules.ts` 登记模块 ID、标题、组件对及展开态高宽；
4. **组装数据流**：在 `src/App.vue` 中的 `pillProps` / `panelProps` 传入业务数据；
5. **完成！** 滚轮切换、展开动画、拖拽吸顶与设置项编排自动就绪。

---

## 📜 开源协议

本项目基于 [MIT License](LICENSE) 协议开源。欢迎提交 Issue 或 Pull Request 为 atoll 增添更多精彩模块！
