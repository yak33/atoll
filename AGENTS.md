# atoll 项目规则

## 这个项目是什么

Windows 桌面灵动岛悬浮组件(Tauri 2 + Vue 3 + TS)。首个模块:智谱 GLM Coding Plan 用量窗口监控。定位是长期扩展的灵动岛容器,新功能以「模块」为单位追加。

## 模块地图

- `src/adapters/zhipu.ts` —— 智谱额度接口的 URL/请求头构造与响应解析,纯函数,不碰 UI
- `src/adapters/zhipu.test.ts` —— 解析规则单测,接口字段变更时先改这里再改实现
- `src/adapters/deepseek.ts` —— DeepSeek 官方余额接口(GET /user/balance)的 URL/请求头构造与响应解析;金额保留十进制字符串,多币种(CNY/USD)分条
- `src/adapters/deepseek.test.ts` —— 余额解析规则单测(字段容错/错误语义)
- `src/types.ts` —— 统一数据模型(UsageWindow / ZhipuQuotaSnapshot / DeepSeekBalanceSnapshot / QuotaError)
- `src/core/QuotaPoller.ts` —— 智谱轮询调度:5 分钟 + 抖动,退避,单飞,凭据无效自动停
- `src/core/BalancePoller.ts` —— DeepSeek 余额轮询:10 分钟 + 抖动,退避,单飞,凭据无效自动停
- `src/core/pomodoro.ts` —— 番茄钟状态机(纯函数,基于结束时间戳;单测在 pomodoro.test.ts)
- `src/core/appSettings.ts` —— 设置持久化:智谱凭据 + DeepSeek 凭据/币种/阈值/余额趋势 + 主题模式 + 外观 + 当前模块 + 通知方式
- `src/core/theme.ts` —— 主题应用:浅/深/自动,auto 跟随系统并实时监听变化
- `src/core/windowLayout.ts` —— 顶部居中定位与三态尺寸切换(scaleFactor 换算有单测)
- `src/core/resetNotify.ts` —— 窗口重置事件检测(纯函数,单测在 core.test.ts)
- `src/core/fullscreenWatch.ts` —— 全屏自动隐藏(前端轮询 Rust 命令,托盘手动隐藏优先)
- `src/core/notify.ts` —— Windows toast 封装(权限被拒静默跳过);上层统一入口是 App.vue 的 notifyUser
- `src/core/agentHub.ts` —— Agent 状态模型:优先级仲裁(waiting>working>error>completed)、生命周期清扫、事件归一化(单测在 agentHub.test.ts)
- `src/core/notifyQueue.ts` —— 岛内气泡消息队列:去重/上限/保质期(纯函数,单测在 notifyQueue.test.ts)
- `src/core/moduleLayout.ts` —— 模块布局:显示/隐藏与排序纯函数(规整/至少一个可见/上下移;单测在 moduleLayout.test.ts)
- `src/core/balance.ts` —— DeepSeek 余额:金额格式化/低余额分级/多币种选取/24h 趋势/余额消耗速率粗估(纯函数,单测在 balance.test.ts)
- `src/composables/nowTick.ts` —— 应用级 60s 时钟 + 倒计时格式化(agentHub 清扫也挂它)
- `src/composables/useGlowEffects.ts` —— 药丸偶发光效触发器(两种药丸共用)
- `src/components/IslandPill.vue` —— 用量模块收起态药丸(告警配色/脉冲/Agent 状态点)
- `src/components/ExpandedPanel.vue` —— 用量模块展开数据面板(顶部条件 Agent 活跃区)
- `src/components/NoticeBubble.vue` —— 岛内气泡通知(药丸下方垂落,容器层管倒计时与跳转)
- `src/components/PomodoroPill.vue` —— 番茄钟模块收起态药丸
- `src/components/PomodoroPanel.vue` —— 番茄钟模块展开面板(开始/暂停/重置)
- `src/components/DeepSeekPill.vue` —— DeepSeek 余额模块收起态药丸(总余额/低余额配色)
- `src/components/DeepSeekPanel.vue` —— DeepSeek 余额模块展开面板(总余额/充值/赠金/24h 趋势/刷新)
- `src/components/SettingsPanel.vue` —— 设置表单(智谱 API Key / base_url / 团队版字段 / DeepSeek Key / 币种 / 低余额阈值 / 通知方式);公共区含模块显示/隐藏与排序管理
- `src/App.vue` —— 三态状态机 + 模块层与数据接线;气泡通知路由(notifyUser)、Agent 药丸点/面板区/托盘摘要;药丸基座与偶发光效 CSS 在此全局层
- `src/islandModules.ts` —— 模块注册表(默认序:usage/deepseek/pomodoro/clipboard);实际展示顺序与可见性由 moduleLayout 用户配置决定
- `src-tauri/src/lib.rs` —— Rust 壳层:托盘/全屏探测/剪贴板监听 + `agent_server` 模块(127.0.0.1:41799 回环 HTTP 接收端,两端点:`POST /api/agent/status` 完整 JSON、`GET/POST /api/agent/bridge?agent=&state=` 轻量桥;`agent_server_status` 命令查端口绑定)
- `src-tauri/tauri.conf.json` —— 窗口形态(透明/置顶/无边框)唯一配置点
- `src-tauri/capabilities/default.json` —— http 域名白名单(智谱额度 / DeepSeek 余额)、store、通知、窗口尺寸/定位权限
- `plugins/` —— Agent 伴生插件市场(本地目录市场):`zcode-bridge`(ZCode process 型 hook 调 curl.exe)、`claude-bridge`(Claude Code http 型 hook 宿主直发)、`antigravity-bridge`(官方 hooks.json,全局装在 ~/.gemini/config/hooks.json)、`qoder-bridge`(官方 hooks 合并进 ~/.qoder(-cn)/settings.json 的 hooks 键,重启 IDE 生效;一键安装脚本 scripts/install-qoder-bridge.mjs)、`trae-bridge`(官方 hooks 合并进 ~/.trae(-cn)/hooks.json 全局文件,重启生效;一键安装脚本 scripts/install-trae-bridge.mjs)、`deepseek-bridge`(dsh Cordis 插件);安装说明在 plugins/README.md
- `site/` —— 对外落地页,纯静态 HTML/CSS/JS 零构建,经 Vercel 部署。与 `src/` 不共享代码:药丸与面板样式是从 App.vue / components 手工移植的副本,改产品外观时记得同步这里

模块约定:每个功能模块 = 独立 core 逻辑 + 独立药丸/面板组件对;容器层(App.vue)持有 `activeModule` 并负责切换(收起态滚轮、展开面板 Tab)与持久化;新模块照番茄钟的模式追加。**例外:Agent 监控没有独立模块位**——它并入了用量模块(药丸状态点 + 面板活跃区 + 气泡通知),core 层(agentHub/notifyQueue)仍独立。

## 命令

```bash
npm run dev           # 仅前端(Vite,浏览器预览,无窗口行为)
npm run tauri dev     # 完整开发模式(真实窗口)
npm run build         # 前端类型检查 + 构建(交付前最低验证)
npm test              # vitest 单测(adapter 解析/agentHub/notifyQueue/pomodoro 等 core 层)
cargo test --lib      # Rust 侧单测(在 src-tauri 下;agent_server 解码函数)
npm run tauri build   # 桌面安装包打包
```

## 项目特有约定

- 解析逻辑只写在 adapter 内,返回统一模型;UI 不出现任何平台专有字段名
- 智谱接口是非公开文档接口,字段可能变:所有解析容错集中在 adapter,禁止在 UI 层兜底
- 智谱鉴权头是裸 API Key(不加 Bearer 前缀),这是官方行为不是 bug,别"修复"它
- 窗口行为(穿透/全屏隐藏/自启)统一走 Tauri 配置或官方插件,不引入第三方窗口库
- 轮询频率下限 3 分钟 + 随机抖动,任何代码不得绕过 core 层直接调上游
- Agent 接收端只绑 127.0.0.1 回环、不返回 CORS 头(调用方是 hook/curl 不是浏览器,别"补"这个);通知一律走 App.vue 的 notifyUser 统一路由,禁止直调 sendToast
- 改 Agent 相关交互时记得 plugins/ 里的伴生插件与 README/官网可能要同步
- 智谱是「窗口百分比」模型(5h/7d + resetAt),DeepSeek 是「钱包余额」模型(总可用/充值/未过期赠金,多币种);两套快照、轮询、UI 各自独立,不要互相套用,多币种金额永不合并
- DeepSeek 金额从 adapter 到持久化一律保留字符串,只有趋势/消耗速率计算时才转数字;余额上升(充值/赠金到账)要重置消耗基线
- DeepSeek 鉴权是 `Authorization: Bearer <API Key>`(官方公开余额接口);注意与智谱的「裸 Key」相反,别改错
