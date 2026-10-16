# atoll-trae-bridge

把 Trae(含国内版 Trae CN)的会话状态实时上报给 atoll 灵动岛的「智能体」模块:提交请求→执行中小人闪动,需要确认→举手等待,任务完成→✅ 气泡。

## 原理

Trae 官方 hooks(命令型)在每个会话事件触发时执行 `curl.exe`(Windows 10+ 系统自带),调用 atoll 的本地桥接端点:

```
curl.exe -s -m 3 -o NUL "http://127.0.0.1:41799/api/agent/bridge?agent=trae&name=Trae&state=working"
```

- URL 加双引号,跨 shell 安全;`-o NUL` 丢弃响应,避免 stdout 被事件解析
- 端点仅绑 127.0.0.1 回环,不经过网络
- atoll 未运行时 curl 静默失败(退出码 7,非阻断),不影响 Trae 会话

## 安装

### 全局(推荐,对所有项目生效)

```bash
# 在 atoll 仓库根目录执行:合并 hooks 到 ~/.trae-cn/hooks.json 与 ~/.trae/hooks.json
node scripts/install-trae-bridge.mjs
```

脚本只替换 `atoll-*` 命名的条目,手工或设置界面添加的其他 hook 原样保留;已有文件先备份为 `hooks.json.bak-atoll`。

### 项目级(仅单个项目)

把本目录 `hooks.json` 复制为 `$PROJECT/.trae/hooks.json`(与全局同键的设置以项目级优先)。

装完**重启 Trae**。可在 Trae 设置的 Agent Hooks 页面确认全局配置路径已被识别、`atoll-*` 条目已启用。

## 事件 → 状态映射

| Trae 事件 | atoll 状态 |
|---|---|
| `SessionStart` | idle 待命(清除残留态) |
| `UserPromptSubmit` | working 执行中 |
| `PostToolUse`(matcher `.*`) | working 执行中(心跳刷新) |
| `Notification`(matcher `*`) | waiting 等待确认 |
| `Stop` | completed 已完成 |

用户确认后由下一个 `PostToolUse` 心跳自动恢复 working。hooks 条目格式(`name`/`enabled`/`matcher`/`command`)参照 [Trae 官方 Hook 配置参考](https://docs.trae.ai/ide/hook-configuration-reference?_lang=zh);matcher 语义(正则/通配)以官方文档为准。

## 验证

1. 启动 atoll,智能体面板无「接收服务未启动」警示。
2. 终端手动验证端点:`curl "http://127.0.0.1:41799/api/agent/bridge?agent=test&state=working"` 应返回 `{"ok":true}`。
3. 重启 Trae 后向 Agent 发起任意请求,岛内应出现 Trae 的 working 气泡;请求完毕变 completed。

## 注意事项

- hooks 配置无热加载,改完需重启 Trae。
- `Notification` 与 Claude Code 同族,可能同时覆盖「请求授权」和「闲置提醒」,两者都显示为等待确认。
- 每个气泡的主题色与动效由 atoll 随机分配,与宿主无关。

---
作者 ZHANGCHAO · 2026/10/16
