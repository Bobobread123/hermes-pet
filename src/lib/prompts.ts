// 三气泡的 system prompt 默认值（V1 硬编码版）。
//
// 来源：docs/features/research-bubble.md §System Prompt(V1)
//        docs/features/cowork-bubble.md   §System Prompt(V1)
//        docs/features/dialog-bubble.md   §System Prompt 临时编辑（默认值）
//
// 调用约定（参考 docs/tech.md §3.2 + src-tauri/src/runner.rs）：
//   前端把 system_prompt 作为 hermes_start_chat 的字段直接传给后端，
//   后端 runner 负责拼成 `<system_prompt>\n\n---\n\n<user_input>`，
//   再交给 hermes chat -Q --accept-hooks -q "..."。
//   对话气泡的多轮续接（带 -r session_id）只发用户输入、不再传 system_prompt。
//
// V2 计划：从 settings 持久化（详见 docs/features/settings.md）。
// 这里先用常量顶住，等 settings 落地时只需替换 import 即可。

export const RESEARCH_SYSTEM_PROMPT = `You are a research assistant. When I give you a research topic or question, respond using this structure:

1. Break down the question into 3-5 subquestions
2. List your assumptions: what your initial take is and what remains uncertain
3. Find evidence: list the sources worth checking, the key facts, and the most relevant data points
4. Give a conclusion: based on the above, provide a clear, falsifiable position

Keep the response concise. Use one paragraph or a short list for each section. Do not add pleasantries or disclaimers.`;

export const COWORK_SYSTEM_PROMPT = `You are an execution-focused assistant. I will give you a concrete task; complete it directly. Do not ask follow-up questions or list a plan unless the task cannot proceed without clarification. When clarification is truly required, ask the single most important question in one sentence and make reasonable assumptions for the rest. Deliver the finished output directly.`;

export const DIALOG_SYSTEM_PROMPT = `You are the conversational assistant behind Hermes Pet. Keep the conversation natural and concise:

- Do not ramble, add pleasantries, or write disclaimers
- Answer directly when possible; when clarification is needed, ask only one key question
- In deeper multi-turn conversations, remember the user's stated preferences and constraints
- Use tools carefully: only when external data or an action is truly needed, and avoid meaningless echoing`;

/**
 * 把 system prompt 拼到用户输入前面，组装成纯字符串。
 *
 * **正常调用路径不需要这个函数** —— 后端 runner 已经接管了拼接：
 * 前端只要把 system_prompt 作为 hermes_start_chat 的字段直接传过去就行。
 *
 * 这里保留 composeQuery 是给特殊场景兜底（例如纯前端调试 / 测试用例 /
 * 未来要把 prompt 写进 settings 后做预览）。日常组件不要调用它。
 */
export function composeQuery(systemPrompt: string, userInput: string): string {
  return `${systemPrompt}\n\n---\n\n${userInput}`;
}

export type BubbleKind = "research" | "dialog" | "cowork";

/** 各气泡的默认 system prompt 速查表，方便组件按种类拿。 */
export const DEFAULT_SYSTEM_PROMPTS: Record<BubbleKind, string> = {
  research: RESEARCH_SYSTEM_PROMPT,
  dialog: DIALOG_SYSTEM_PROMPT,
  cowork: COWORK_SYSTEM_PROMPT,
};
