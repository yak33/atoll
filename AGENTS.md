# atoll 项目规则

## 这个项目是什么

Windows 桌面灵动岛悬浮组件(Tauri 2 + Vue 3 + TS)。首个模块:智谱 GLM Coding Plan 用量窗口监控。定位是长期扩展的灵动岛容器,新功能以「模块」为单位追加。

## 模块地图

- `src/adapters/zhipu.ts` —— 智谱额度接口的 URL/请求头构造与响应解析,纯函数,不碰 UI
- `src/adapters/zhipu.test.ts` —— 解析规则单测,接口字段变更时先改这里再改实现
- `src/types.ts` —— 统一数据模型(UsageWindow / ZhipuQuotaSnapshot / QuotaError)
- `src/core/QuotaPoller.ts` —— 轮询调度:5 分钟 + 抖动,退避,单飞,凭据无效自动停
- `src/core/pomodoro.ts` —— 番茄钟状态机(纯函数,基于结束时间戳;单测在 pomodoro.test.ts)
- `src/core/appSettings.ts` —— 设置持久化:智谱凭据 + 主题模式 + 外观 + 当前模块
- `src/core/theme.ts` —— 主题应用:浅/深/自动,auto 跟随系统并实时监听变化
- `src/core/windowLayout.ts` —— 顶部居中定位与三态尺寸切换(scaleFactor 换算有单测)
- `src/core/resetNotify.ts` —— 窗口重置事件检测(纯函数,单测在 core.test.ts)
- `src/core/fullscreenWatch.ts` —— 全屏自动隐藏(前端轮询 Rust 命令,托盘手动隐藏优先)
- `src/core/notify.ts` —— Windows toast 封装(权限被拒静默跳过)
- `src/composables/nowTick.ts` —— 应用级 60s 时钟 + 倒计时格式化
- `src/composables/useGlowEffects.ts` —— 药丸偶发光效触发器(两种药丸共用)
- `src/components/IslandPill.vue` —— 用量模块收起态药丸(告警配色/脉冲)
- `src/components/ExpandedPanel.vue` —— 用量模块展开数据面板
- `src/components/PomodoroPill.vue` —— 番茄钟模块收起态药丸
- `src/components/PomodoroPanel.vue` —— 番茄钟模块展开面板(开始/暂停/重置)
- `src/components/SettingsPanel.vue` —— 设置表单(API Key / base_url / 团队版字段)
- `src/App.vue` —— 三态状态机 + 模块层(usage/pomodoro 切换)与数据接线;药丸基座与偶发光效 CSS 在此全局层
- `src-tauri/tauri.conf.json` —— 窗口形态(透明/置顶/无边框)唯一配置点
- `src-tauri/capabilities/default.json` —— http 域名白名单、store、通知、窗口尺寸/定位权限
- `site/` —— 对外落地页,纯静态 HTML/CSS/JS 零构建,经 Vercel 部署。与 `src/` 不共享代码:药丸与面板样式是从 App.vue / components 手工移植的副本,改产品外观时记得同步这里
- `docs/03-智谱额度接口.md` —— 接口行为与解析规则的唯一事实来源,改 adapter 前先读

模块约定:每个功能模块 = 独立 core 逻辑 + 独立药丸/面板组件对;容器层(App.vue)持有 `activeModule` 并负责切换(收起态滚轮、展开面板 Tab)与持久化;新模块照番茄钟的模式追加。

## 命令

```bash
npm run dev           # 仅前端(Vite,浏览器预览,无窗口行为)
npm run tauri dev     # 完整开发模式(真实窗口)
npm run build         # 前端类型检查 + 构建(交付前最低验证)
npm test              # vitest 单测(adapter 解析规则)
npm run tauri build   # 打包(需图标,见路线图 M4)
```

## 项目特有约定

- 解析逻辑只写在 adapter 内,返回统一模型;UI 不出现任何平台专有字段名
- 智谱接口是非公开文档接口,字段可能变:所有解析容错集中在 adapter,禁止在 UI 层兜底
- 智谱鉴权头是裸 API Key(不加 Bearer 前缀),这是官方行为不是 bug,别"修复"它
- 窗口行为(穿透/全屏隐藏/自启)统一走 Tauri 配置或官方插件,不引入第三方窗口库
- 轮询频率下限 3 分钟 + 随机抖动,任何代码不得绕过 core 层直接调上游
