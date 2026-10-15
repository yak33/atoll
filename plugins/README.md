# atoll 伴生插件(Agent 状态桥)

把 ZCode / Claude Code / DeepSeek Harness 的会话状态(执行中 / 等待确认 / 已完成)实时上报给 atoll 灵动岛的「智能体」模块。

## 原理

atoll 桌面端在 `127.0.0.1:41799` 提供两个本地接收端点(仅回环地址,无 CORS):

| 端点 | 用途 |
|---|---|
| `POST /api/agent/status` | 完整 JSON 上报:`{"id","name","state","task","timestamp"}` |
| `GET/POST /api/agent/bridge?agent=xxx&state=working` | 轻量桥接:状态全在查询参数里,供 hook 直调 |

两个插件的 hook 都指向 bridge 端点,调用方不需要构造 JSON,也完全绕开 Windows shell 引号转义问题:

- **atoll-zcode-bridge**:ZCode 的 `process` 型 hook(参数向量、无 shell)直接调 `curl.exe`(Windows 10+ 系统自带)。
- **atoll-claude-bridge**:Claude Code 的 `http` 型 hook 由宿主直接发 HTTP 请求,不依赖 curl、不经过任何 shell。
- **atoll-dsh-bridge**:DeepSeek Harness 的 Cordis 插件(bundle),在宿主 Node 进程内直接 `fetch()` 上报,同样零 shell 参与。dsh 侧有精确的 `approval/asked` / `approval/decided` 事件,waiting 态比另外两个宿主更准;事件自带 `session.id`,多会话并发时按「任一 waiting > 任一 working > 最近静止态」聚合,后续按会话分卡零成本。

## 事件 → 状态映射

| 宿主事件 | ZCode | Claude Code | DeepSeek Harness | atoll 状态 |
|---|:-:|:-:|:-:|---|
| 会话启动 | `SessionStart` | `SessionStart` | `session/created` | idle 待命 |
| 用户提交请求 | `UserPromptSubmit` | `UserPromptSubmit` | `user/message` / `turn/start` | working 执行中 |
| 工具调用完成(刷新心跳) | `PostToolUse` | `PostToolUse` | `step/start` / `tool/call` / `tool/result` | working 执行中 |
| 请求确认 / 通知 | `PermissionRequest` | `Notification` | `approval/asked` | waiting 等待确认 |
| 确认通过(恢复执行) | — | — | `approval/decided` | working 执行中 |
| 任务完成 | `Stop` | `Stop` | `turn/end` | completed 已完成 |

注:Claude Code 的 `Notification` 同时覆盖「请求授权」和「闲置 60 秒提醒」两种情况,都可能显示为等待确认。

## 安装

### ZCode

1. 先启动 atoll 桌面端。
2. ZCode → 设置 → 插件管理 → Discover → `+` → 从**本地目录**添加,选择本目录(`atoll/plugins`)。
3. 在市场里安装 `atoll-zcode-bridge` 并启用。插件自带 hooks,安装后 hook runner 自动启用,无需改任何配置文件。

### Claude Code

```bash
# 在 Claude Code 会话中执行(路径换成你的 atoll 仓库实际位置)
/plugin marketplace add D:\NenniuProjects\atoll\plugins
/plugin install atoll-claude-bridge@atoll-bridges
```

### DeepSeek Harness

```bash
# 在终端执行(路径换成你的 atoll 仓库实际位置)
# file: 依赖是复制不是链接,改了插件源码要重新 add 同步
dsh plugin --profile desktop add file:D:/NenniuProjects/atoll/plugins/deepseek-bridge
```

`dsh` 命令在桌面版安装目录的 `resources\runtime\cli\bin\dsh.cmd`(可加入 PATH)。安装后**重启 DeepSeek Harness 桌面版**生效;`--dump-config` 可验证 profile 组合(desktop profile 被桌面版独占管理,CLI 只能对自建 profile dump)。

## 注意事项

- **atoll 必须在运行**。未运行时:ZCode 侧 hook 日志会出现 curl 连接失败记录(不影响会话,atoll 启动后自动恢复);Claude Code 侧已配置 `onFailure: continue`,静默跳过。
- 同一宿主的多个并发会话共用一张卡片(v1 按工具聚合);ZCode hook 环境里有 `${CLAUDE_SESSION_ID}` 可用于后续按会话分卡。
- 任务摘要(task 字段)v1 不上报,只报状态;bridge 端点支持 `&task=...` 参数(URL 编码),需要时可在 hooks.json 里加。
- hook 修改后需要重启宿主或重新启用插件才生效。

## 排查

- 状态没上报:先确认 atoll 智能体面板没有「接收服务未启动」警示,再用 `curl "http://127.0.0.1:41799/api/agent/bridge?agent=test&state=working"` 手动验证端点。
- ZCode 侧 hook 是否触发看 ZCode 日志(hook 执行记录含 outcome 与错误流预览);插件是否启用看 设置 → 插件管理。
- DeepSeek Harness 侧:确认 profile 的 bundles 里有 `atoll-dsh-bridge`(`~/.dsh/profiles/desktop/package.json`),且装包后重启过桌面版。

---

作者 ZHANGCHAO · 2026/10/14
