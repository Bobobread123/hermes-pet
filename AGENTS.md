# AGENTS.md

给在此目录下工作的 AI agent / 协作者看的项目地图。

## 项目是什么

Hermes 桌宠 —— 一个常驻在 macOS 桌面的小机器人形象，背后挂的是用户本地的 Hermes agent（CLI 形态）。桌宠不是新造一个 agent，而是给已有 Hermes agent 套了一层"有翅膀的脸 + 三个交互入口 + 陪伴感"。

## 当前阶段

**设计定稿，进入文档化与技术骨架讨论阶段。** 还没开始写代码。技术栈未选。

## 文件结构

```
Hermes Workspace/
├── CLAUDE.md            # 给 Claude 的工作约定
├── AGENTS.md            # 本文件 - 项目地图
├── PRD.md               # 产品愿景与需求
├── UI-UX-Style.md       # 视觉与交互风格
├── tech.md              # 技术骨架（占位）
└── features/            # 单功能详述
    ├── normal-mode.md
    ├── work-mode.md
    ├── mode-switching.md
    ├── research-bubble.md
    ├── dialog-bubble.md
    ├── cowork-bubble.md
    ├── drag-and-drop.md
    └── settings.md
```

## 阅读顺序建议

1. PRD.md —— 先理解我们在造什么
2. UI-UX-Style.md —— 看到角色长什么样、交互的克制度
3. features/ —— 按需查特定功能的详细行为
4. tech.md —— 等技术骨架定下来后再展开

## 工作约定

- 所有讨论结果都要更新到本目录的 markdown 里（来自 CLAUDE.md 的指示）。
- **不要修改 Hermes Workspace 之外的文件。**
- 文档语言：中文为主，技术术语和英文 API 名保持英文。
- 文档里出现"待定"或"TBD"的地方，意味着设计阶段还没拍板，写代码前应该回头跟用户对一次。

## 角色

| 名称 | 角色 |
|---|---|
| Wayne | 产品负责人 / 用户本人 |
| Hermes Agent (CLI) | 后端 —— 桌宠所有"思考"与"输出"的真正来源 |
| 桌宠 | 前端 —— Hermes Agent 的脸和手 |

## 已经定下来的核心决策（速查）

- 形象：戴 Hermes 翅膀头盔的小机器人，大头小身
- 模式：普通 / 工作 两种，手动切换
- 模式指示：头盔左翅亮金色 = 普通；右翅亮蓝色 = 工作
- 工作模式：藏在屏幕右上角，露半个头 + 单侧翅膀，hover 浮出三个气泡（research / 对话 / cowork）
- 普通模式：全身可见，原地转圈扭头，每分钟 idle，无操作久了 zzz 睡，可摸头
- 后端：本地 Hermes agent CLI
- 不做：多屏支持（V1）

## 待定项（写代码前要回收的）

- 前端技术栈（Electron / Tauri / native）
- CLI 子进程协议（每个气泡映射到的子命令/参数）
- 三个气泡是不同入口还是同一入口换 system prompt
- 流式输出与"涨红脸"动画的同步机制
- 对话上下文是否跨会话持久化
- 工作模式下露出的"单侧翅膀"具体指哪一侧（参见 features/mode-switching.md 的设计取舍）
