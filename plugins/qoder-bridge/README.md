# atoll-qoder-bridge

把 Qoder（含国内版 Qoder CN）的 Agent 执行状态（执行中 / 等待你 / 完成）实时上报给 atoll 灵动岛。

## 原理

利用 [Qoder 官方 Hooks](https://docs.qoder.com/zh/extensions/hooks)（IDE / JetBrains 插件 / CLI 三端共享同一份用户级配置），用 `curl.exe` 打 atoll 的本地桥接端点。状态全在 URL 查询参数里，无 JSON 转义、跨 shell 安全。

## 事件 → 状态映射

| Qoder 事件 | atoll 状态 |
|---|---|
| `UserPromptSubmit`（用户提交请求） | working 执行中 |
| `PreToolUse` 匹配 `ask_user_question` | waiting 等待确认 |
| `PostToolUse`（全部工具，含提问被回答后的返回） | working 心跳 / 恢复执行 |
| `PostToolUseFailure`（工具失败，Agent 会继续重试） | working 心跳 |
| `Stop`（Agent 完成响应） | completed 已完成 |

说明：Qoder 工具名映射表中 `ask_user_question`（向用户提问）是原生名、无兼容别名，所以 waiting 信号精确匹配它即可。用户回答后该工具成功返回，`PostToolUse` 自动把状态拉回 working。

## 安装

1. 先启动 atoll 桌面端。
2. 把本目录 `hooks.json` 的内容**合并**进用户级配置的 `hooks` 键（不能整文件覆盖，配置里还有 providers / 插件等其他设置）：

   - 国际版：`%USERPROFILE%\.qoder\settings.json`
   - 国内版：`%USERPROFILE%\.qoder-cn\settings.json`（两边都装了就都合并，同一张卡片）

3. **重启 Qoder**（官方文档明确：hooks 配置无热加载，必须重启 IDE 生效）。

## 验证

atoll 收起态下发一个请求给 Qoder 的 Agent，药丸右侧状态点亮起青色呼吸即 working；让 Agent 调用「向用户提问」类交互，状态点变琥珀色即 waiting。也可手动验证端点：

```
curl "http://127.0.0.1:41799/api/agent/bridge?agent=qoder&name=Qoder&state=working"
```

## 注意

- 权限审批弹窗（文件写入确认等）不一定经过 `ask_user_question` 工具调用，这类等待 v1 暂不捕捉；实测有漏再补 matcher。
- 同一宿主多会话共用一张卡片（v1 按工具聚合）；hook stdin 里有 `session_id`，后续可按会话分卡。
- atoll 未运行时 curl 连接失败会被 Qoder 静默记录在 hook 日志里，不影响会话；atoll 启动后自动恢复。

---

作者 ZHANGCHAO · 2026/10/15
