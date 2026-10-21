# atoll-workbuddy-bridge

把 WorkBuddy(腾讯 CodeBuddy)的会话状态实时上报给 atoll 灵动岛的「智能体」模块:提交请求→执行中小人闪动,权限确认→举手等待,任务完成→✅ 气泡。

## 原理

WorkBuddy 的 Hooks **完全兼容 Claude Code Hooks 规范**(官方文档),事件为 `command` 型;每个事件触发时执行 `curl.exe`(Windows 10+ 系统自带)调用 atoll 的本地桥接端点:

```
curl.exe -s -m 3 -o NUL "http://127.0.0.1:41799/api/agent/bridge?agent=workbuddy&name=WorkBuddy&state=working"
```

- URL 加双引号,跨 shell 安全;`-o NUL` 丢弃响应,stdout 不参与事件语义
- 端点仅绑 127.0.0.1 回环,不经过网络
- atoll 未运行时 curl 静默失败(非零非 2 退出码,按非阻塞错误处理),不影响会话

## 安装

```bash
# 在 atoll 仓库根目录执行:追加合并 hooks 到 ~/.workbuddy 与 ~/.codebuddy 的 settings.json
node scripts/install-workbuddy-bridge.mjs
```

脚本只替换 URL 含 `agent=workbuddy` 的 atoll 条目,**其他工具(如 orca)已配置的 hooks 与全部其他设置键原样保留**;已有文件先备份为 `settings.json.bak-atoll`。

装完**重启 WorkBuddy**。hooks 配置在用户级 `~/.codebuddy/settings.json`(对全部项目生效);仅单个项目用时,可把 `hooks.json` 里的条目合并进 `<workspace>/.codebuddy/settings.json`(项目级优先)。

## 事件 → 状态映射

| WorkBuddy 事件 | atoll 状态 |
|---|---|
| `SessionStart` | idle 待命(清除残留态) |
| `UserPromptSubmit` | working 执行中 |
| `PostToolUse` | working 执行中(心跳刷新) |
| `PermissionRequest` | waiting 等待确认 |
| `Stop` | completed 已完成 |

`PermissionRequest` 与 `Notification` 均不在官方文档七事件清单里,但解包确认桌面端内置 CLI 引擎两者都已实现(官方文档滞后);双保险接等待信号,任一触发即可。

## 验证

1. 启动 atoll,智能体面板无「接收服务未启动」警示。
2. 终端手动验证端点:`curl "http://127.0.0.1:41799/api/agent/bridge?agent=test&state=working"` 应返回 `{"ok":true}`。
3. 重启 WorkBuddy 后向 Agent 发起任意请求,岛内应出现 WorkBuddy 的 working 气泡;请求完毕变 completed。

## 注意事项

- hooks 无热加载,改完需重启 WorkBuddy。
- 每个气泡的主题色与动效由 atoll 随机分配,与宿主无关。
- 换回干净配置:`~/.codebuddy/settings.json.bak-atoll` 是安装前备份。

---
作者 ZHANGCHAO · 2026/10/21
