# 进度记录

> 记录 V1 实现过程中的阶段进度、当前结果和待观察事项。可复用的 bad case / 修复方案统一沉淀到 `docs/lessons.md`；技术决策的最终版仍以 `docs/tech.md` 为准。

---

## 2026-04-29 — 三气泡 hover 展开 / 收起动效

### 当前结果

- ✅ hover 展开三条输入 pill 时加入短动效，从靠近桌宠一侧滑出并展开
- ✅ 三条 pill 按 research / Chat / cowork 自上而下错峰出现，整体节奏约 250ms
- ✅ 鼠标移出后保留短暂收起中状态，播放关闭动效后再回到三个小圆点
- ✅ 收起态三个小圆点也加入出现 / 消失动效，并与对应 hover pill 共用错峰节奏同步切换

---

## 2026-04-29 — 对话记录放大显示框

### 当前结果

- ✅ research / Chat / cowork 三种浮窗右上角都支持放大 / 还原按钮
- ✅ 放大 / 还原按钮使用简洁矩形 icon：小浮窗 `□` / 放大态 `▣`
- ✅ 放大后浮窗扩展为约 640×560 的大尺寸显示框，保留当前 session tabs、消息流和运行中输出
- ✅ 记录框展开 / 收起 / 放大 / 还原使用 360ms 动效，与输入 pill 的 hover / 激活位移动效保持同等级速度
- ✅ 收起记录框时会冻结当前浮窗位置并立即触发 hover / 输入栏归位，两个动效并行播放
- ✅ 激活态布局调整为“记录框在上、hover 输入栏在下”，输入栏固定到 cowork 原本的最下方高度，底部输入栏 / 文件 chip 区继续作为交互区高度基准
- ✅ 修复点击 Chat / Cowork 输入时的弹跳：激活态不再移动整个 stack 容器，只移动 / 固定输入 pill 到底部行
- ✅ 任务输出中的生成过程展开 / 收起箭头方向已调整：展开态显示向上收起，收起态显示向下展开
- ✅ 放大浮窗改为以右下角为锚点向左上扩展，Hermes 桌宠本体不再移动
- ✅ 修复大框拖动跟随时 y 轴被 viewport clamp 卡住的问题；现在纵向跟随气泡移动，只保留顶部最小边距
- ✅ Tauri hit region 跟随放大尺寸更新，透明窗口穿透状态下仍可点击浮窗内容

### 后续观察

- 需要在 `npm run tauri dev` 下肉眼验证工作模式右上角位置时，放大框和桌宠 / 气泡之间的相对位置是否舒服。

---

## 2026-04-29 — 文件拖放到工作气泡

### 当前结果

- ✅ 前端接入 Tauri webview drag/drop event，可从 Finder 拖入文件并拿到绝对路径
- ✅ 拖到 research / 对话 / cowork 区域时，对应气泡高亮
- ✅ 松开后不自动提交，文件会在目标气泡输入框下方显示为 chip，可点击移除
- ✅ 提交时再把文件路径按 `@<绝对路径>` 形式附加到 Hermes query
- ✅ 拖到桌宠头部但未指定气泡时，默认填入对话气泡
- ✅ `npm run build` 通过

### 后续观察

- 需要在 `npm run tauri dev` 下肉眼验证 macOS 透明窗口 + 鼠标穿透状态下的 Finder 文件拖入事件是否稳定到达。
- 当前只处理文件路径；选中文本 / URL 拖入不做。
- 多文件会显示为多个 chip，并在提交时按多行 `@<绝对路径>` 附加，Hermes 对多路径读取的实际表现还需验证。

---

## 2026-04-29 — 生成过程收起 / 展开

### 当前结果

- ✅ 任务运行中，对应 hover 输入 pill 右侧提供收起 / 展开 icon
- ✅ 收起只隐藏浮窗 / 生成过程，不取消 Hermes 子进程
- ✅ 收起后回到三条 hover 输入态；同一个 hover pill 右侧保留展开 icon，可恢复查看
- ✅ 收起后桌宠继续红脸；任务完成后仍通过未读红点提示

---

## 2026-04-29 — 气泡 session tabs 与未读红点

### 当前结果

- ✅ research / 对话 / cowork 各自维护本地 session tabs，可新建、切换、删除
- ✅ 任务完成时，如果对应浮窗 / tab 未打开，会显示未读红点
- ✅ 用户打开气泡或切到对应 session tab 后，未读红点清除
- ✅ V1 删除 tab 只删除桌宠内存里的展示记录，不删除 Hermes 底层 session store

---

## 2026-04-29 — 桌宠占位圆缩小一半

### 当前结果

- ✅ `PetCircle` 尺寸从 200×200 调整为 100×100
- ✅ hit region、圆形命中和 `PET_SIZE` 跟随使用同一尺寸常量
- ✅ SVG 五官、腮红、嘴和描边按 0.5 比例缩放，保持原有视觉比例

---

## 2026-04-29 — 选中气泡后单入口布局

### 当前结果

- ✅ hover 桌宠时仍显示 research / 对话 / cowork 三个输入入口
- ✅ 点击或 focus 某个输入后，其它两个入口收起，只保留当前气泡
- ✅ 当前气泡移动到三入口区域顶部，结果 / 对话浮窗改为显示在气泡下方
- ✅ 下方浮窗宽度与上方选中输入 pill 保持一致

---

## 2026-04-29 — 等待输出时桌宠脸红

### 当前结果

- ✅ 三个气泡的 Hermes task 状态会上报到根组件汇总
- ✅ 任一任务处于 `starting` / `streaming` 时，占位桌宠显示两侧粉色腮红
- ✅ 任务结束、报错或取消后，对应气泡取消上报；所有任务都结束后红脸消退

---

## 2026-04-29 — 对话浮窗改为 session 消息流

### 当前结果

- ✅ 对话气泡提交后，浮窗保留当前 session 的完整 UI 消息列表
- ✅ 用户问题显示在右侧，Hermes 回复显示在左侧；最新回复随 stdout chunk 实时增长
- ✅ 上下文仍只依赖 Hermes `session_id`，桌宠内存里的消息列表只用于展示，不参与 prompt 重放
- ✅ `npm run build` 通过

---

## 2026-04-29 — 三气泡提交后无可见输出

### 当前结果

- ✅ 三个任务气泡（research / 对话 / cowork）提交后都会自动打开对应结果浮窗
- ✅ `useHermesTask` 改为前端预生成 `task_id`，再调用 `hermes_start_chat`，避免早到事件被过滤
- ✅ `npm run build` 通过
- ✅ Rust runner 日志预览支持中文 system prompt，不再因 UTF-8 截断 panic；`cargo check` 通过

---

## 2026-04-29 — 透明窗口鼠标穿透修复

### 当前结果

- ✅ `pet` 窗口启动时默认 `set_ignore_cursor_events(true)`，透明区域不再拦截桌面和其它 app 点击
- ✅ 前端将可交互 DOM 区域同步给后端：占位宠物圆、临时 `ChatPanel`
- ✅ macOS 后端 30Hz 轮询 `NSEvent.mouseLocation`，鼠标进入可交互区域时切回可点击，离开后恢复穿透
- ✅ 鼠标左键按下后保持捕获，拖动宠物时不会因为光标离开矩形而丢事件

### 后续观察

- 目前 hit region 是矩形，圆角/透明角落会参与命中；V1 可接受，后续角色 SVG 落地后再做精确 mask 或多矩形拆分。
- 多屏仍按 V1 决策暂不支持；当前窗口和坐标换算仍围绕主屏铺满场景。

---

## 2026-04-29 — 流 B Hermes Runner 端到端排障

### 当前结果

- ✅ React 临时对话面板可以调用 Tauri command：`hermes_discover` / `hermes_start_chat` / `hermes_cancel`
- ✅ Rust 后端可以 spawn 本机 Hermes：`hermes chat -Q --accept-hooks -q "<text>"`
- ✅ 后端能从 Hermes 子进程拿到输出，并通过 Tauri event 发回 `pet` 窗口
- ✅ 前端 listener capability 修复后，可以进入 `events: ok`

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
