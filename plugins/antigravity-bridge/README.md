# atoll-antigravity-bridge

把 Google Antigravity 的执行循环状态(执行中 / 等待你 / 完成)实时上报给 atoll 灵动岛。

## 原理

利用 [Antigravity 官方 Hooks](https://antigravity.google/docs/hooks)(自定义脚本在执行循环特定节点触发),用 `curl.exe` 打 atoll 的本地桥接端点(状态全在 URL 查询参数里,无 JSON 转义、跨 shell 安全)。

## 事件 → 状态映射

| Antigravity 事件 | atoll 状态 |
|---|---|
| `SessionStart` | idle 待命 |
| `PreInvocation` / `PostInvocation`(每次模型调用前后) | working 执行中(天然心跳) |
| `PostToolUse`(全部工具) | working 心跳 |
| `PreToolUse` 匹配 `ask_question\|ask_permission` | waiting 等待确认 |
| `Stop` | completed 已完成 |

## 安装

1. 先启动 atoll 桌面端。
2. 把本目录的 `hooks.json` 复制到全局定制目录:

   ```
   %USERPROFILE%\.gemini\config\hooks.json
   ```

   (工作区级则放 `<repo>/.agents/hooks.json`;也可在 Antigravity 设置 → Customizations → Hooks 界面核对是否加载。)
3. 重启 Antigravity 或开个新会话,hook 生效。

## 验证

在 Antigravity 里随便发个任务,atoll 灵动岛药丸右端应出现青蓝声呐点、气泡「Antigravity 正在努力干活中...」;Agent 向你提问时变琥珀等待。

手动验证端点:

```bash
curl "http://127.0.0.1:41799/api/agent/bridge?agent=antigravity&name=Antigravity&state=working"
```

## 已知边界

- atoll 未运行时 curl 静默失败,不影响 Antigravity 会话(超时 5 秒上限)。
- `Stop` 事件的 `terminationReason=error` 无法用固定命令区分,一律按已完成上报(v1 取舍)。
- 若 Antigravity 的权限审批不走 `ask_permission` 工具调用,审批等待不会触发 waiting 信号(提问 `ask_question` 是可靠的);实际表现以实测为准。
- hook 每次模型调用/工具调用各发一次本机回环请求,毫秒级,无感。

---

作者 ZHANGCHAO · 2026/10/16
