# 进度记录

> 记录 V1 实现过程中的实测结论、踩坑和修复。技术决策的最终版仍以 `docs/tech.md` 为准；本文件保留过程上下文。

---

## 2026-04-29 — 流 B Hermes Runner 端到端排障

### 当前结果

- ✅ React 临时对话面板可以调用 Tauri command：`hermes_discover` / `hermes_start_chat` / `hermes_cancel`
- ✅ Rust 后端可以 spawn 本机 Hermes：`hermes chat -Q --accept-hooks -q "<text>"`
- ✅ 后端能从 Hermes 子进程拿到输出，并通过 Tauri event 发回 `pet` 窗口
- ✅ 前端 listener capability 修复后，可以进入 `events: ok`

### 本次踩坑与修复

| 问题 | 现象 | 根因 | 修复 |
|---|---|---|---|
| 前端对话框拿不到 Hermes 回复 | 后端日志显示 `EMIT chunk -> Ok("ok")`，UI 仍停在等待 | `src-tauri/capabilities/default.json` 授权窗口是 `main`，实际窗口 label 是 `pet`，前端 event listen 没有正确 capability | 将 capability `windows` 改为 `["pet"]` |
| 事件可能在前端进入 busy 前到达 | Hermes 快速输出时，listener 用 `busyTaskIdRef.current` 过滤掉早到事件 | 后端生成 `task_id` 并在 `invoke()` 返回前已开始 emit | 前端先生成 `task_id`，立即写入 state/ref，再传给后端使用 |
| 全局 event 投递不够明确 | 后端 `app.emit(...)` 返回 ok，但前端收不到时很难判断目标窗口 | 单窗口阶段也应明确事件目标，避免后续多窗口误投 | 后端改为 `emit_to("pet", ...)` |
| `hermes://chunk` 风格事件名不可用 | 后端 emit 成功，前端 `listen()` 回调不触发 | Tauri 2 event name 不适合 URL 风格 `//` | 事件名统一为 kebab-case：`hermes-chunk` / `hermes-session` / `hermes-done` / `hermes-error` |
| `session_id` 不在 stdout | 前端拿不到多轮 session id，或者 stdout 只有正文 | Hermes 将 `session_id: ...` 当 meta 信息写到 stderr | stdout 和 stderr 两边都实时逐行扫描 `session_id:` |
| 不实时读取 stderr 会拖慢/卡住 | 简单 `hi` 从约 10s 拉长到 30s+ | 子进程 stderr pipe buffer 可能阻塞 Hermes 写入 | stdout/stderr 两个 reader 同时跑，stderr 非 session 行只在 exit 非 0 时上报 |
| `--source tool` 明显变慢 | `hi` 耗时从约 10s 飙到约 44s | Hermes CLI 当前版本下 `-Q` + `--source tool` 组合性能异常 | V1 runner 暂不带 `--source tool`，等 Hermes 侧确认后再恢复 |

### 当前事件协议

前端调用：

```ts
invoke("hermes_start_chat", {
  args: {
    text,
    task_id,
    session_id,
    system_prompt: null,
  },
});
```

后端事件：

| Event | Payload |
|---|---|
| `hermes-session` | `{ task_id, session_id }` |
| `hermes-chunk` | `{ task_id, line }` |
| `hermes-done` | `{ task_id, exit_code }` |
| `hermes-error` | `{ task_id, message }` |

### 后续待办

- 将临时 `ChatPanel` 的调试信息迁移为三气泡统一 runtime wrapper。
- 补一个最小端到端测试脚本：spawn 假 Hermes 输出 session/chunk/done，验证前端累积逻辑。
- 继续跟进 Hermes CLI：确认 `--source tool` 性能异常是否为 bug，以及未来是否恢复会话隔离标签。
