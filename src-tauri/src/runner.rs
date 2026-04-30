// Hermes Runner —— spawn 本地 Hermes Agent CLI 子进程（PTY 模式）
//
// 为什么用 PTY（伪终端）：
//   Hermes CLI 在无 TTY 环境下检测到非 interactive，会对危险命令
//   直接自动 deny，不等待用户输入。PTY 让 Hermes 以为自己在真实
//   终端里运行，从而正常显示审批提示并等待 stdin。
//
// 架构要点：
//   1. portable-pty 是同步 API，读循环跑在 spawn_blocking 线程里。
//   2. 读循环通过 tokio mpsc channel 把"事件消息"发给异步侧；
//      异步侧负责 emit_to Tauri 事件（必须在 async 上下文里）。
//   3. PTY master writer 存入全局 STDIN_MAP，供 hermes_send_input
//      command 向子进程写入审批选择。
//   4. PTY 输出含 ANSI escape 序列，emit 前用正则 strip 干净。
//   5. session_id 行、审批提示行、普通 chunk 行 —— 三类分开处理。
//   6. 审批上下文缓冲最近 20 行，检测到 "Choice [" 时组装 payload。
//
// 对外 Tauri commands（与原版保持同名，前端无需改动）：
//   - hermes_discover()
//   - hermes_start_chat({ text, session_id?, system_prompt? }) -> task_id
//   - hermes_cancel(task_id)
//   - hermes_send_input(task_id, input)
//
// emit 事件（kebab-case，前端 useHermesTask.ts 订阅）：
//   - hermes-chunk     { task_id, line }
//   - hermes-session   { task_id, session_id }
//   - hermes-done      { task_id, exit_code }
//   - hermes-error     { task_id, message }
//   - hermes-approval  { task_id, command_preview, risk_description }

use once_cell::sync::Lazy;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

// ====== 事件名 ======
const EV_CHUNK: &str = "hermes-chunk";
const EV_SESSION: &str = "hermes-session";
const EV_DONE: &str = "hermes-done";
const EV_ERROR: &str = "hermes-error";
const EV_APPROVAL: &str = "hermes-approval";
const PET_WINDOW_LABEL: &str = "pet";

// ====== 全局 stdin 写入端：task_id -> PTY master writer ======
// portable-pty 的 writer 是 Box<dyn Write + Send>，包在 Arc<Mutex<>> 里。
static STDIN_MAP: Lazy<Arc<Mutex<HashMap<String, Box<dyn Write + Send>>>>> =
    Lazy::new(|| Arc::new(Mutex::new(HashMap::new())));

// ====== session_id 解析正则 ======
static SESSION_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^session_id:\s*(\S+)\s*$").expect("session_id regex"));

// ====== ANSI escape 脱色正则 ======
// 覆盖：CSI 序列（颜色/光标）、OSC 序列、单字符控制（\r 等保留换行处理）
static ANSI_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\x07]*\x07)").expect("ansi regex")
});

// ====== payload 类型 ======
#[derive(Debug, Clone, Serialize)]
pub struct ChunkPayload {
    pub task_id: String,
    pub line: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SessionPayload {
    pub task_id: String,
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct DonePayload {
    pub task_id: String,
    pub exit_code: i32,
}

#[derive(Debug, Clone, Serialize)]
pub struct ErrorPayload {
    pub task_id: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ApprovalPayload {
    pub task_id: String,
    /// 要显示给用户的命令预览（通常是缩进行，去掉空格）
    pub command_preview: String,
    /// 风险等级描述（含 Security scan / [HIGH] / [MEDIUM] 的行）
    pub risk_description: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct DiscoverResult {
    pub ok: bool,
    pub path: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct StartChatArgs {
    pub text: String,
    pub task_id: Option<String>,
    pub session_id: Option<String>,
    pub system_prompt: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct StartChatResult {
    pub task_id: String,
}

// ====== 读循环发给异步侧的内部消息 ======
#[derive(Debug)]
enum PtyMsg {
    Chunk(String),
    Session(String),
    Approval { command_preview: String, risk_description: String },
    Done(i32),
    Error(String),
}

// ====== 二进制发现 ======
fn discover_hermes_path() -> Option<PathBuf> {
    if let Ok(path) = which_in_path("hermes") {
        return Some(path);
    }
    if let Some(home) = dirs::home_dir() {
        let p = home.join(".local").join("bin").join("hermes");
        if is_executable(&p) {
            return Some(p);
        }
    }
    for cand in [
        "/opt/homebrew/bin/hermes",
        "/usr/local/bin/hermes",
        "/opt/local/bin/hermes",
    ] {
        let p = PathBuf::from(cand);
        if is_executable(&p) {
            return Some(p);
        }
    }
    None
}

fn which_in_path(name: &str) -> Result<PathBuf, ()> {
    let path_env = std::env::var_os("PATH").ok_or(())?;
    for dir in std::env::split_paths(&path_env) {
        let candidate = dir.join(name);
        if is_executable(&candidate) {
            return Ok(candidate);
        }
    }
    Err(())
}

fn is_executable(p: &std::path::Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    match std::fs::metadata(p) {
        Ok(m) => m.is_file() && (m.permissions().mode() & 0o111 != 0),
        Err(_) => false,
    }
}

#[tauri::command]
pub fn hermes_discover() -> DiscoverResult {
    match discover_hermes_path() {
        Some(p) => DiscoverResult {
            ok: true,
            path: Some(p.to_string_lossy().to_string()),
        },
        None => DiscoverResult {
            ok: false,
            path: None,
        },
    }
}

// ====== strip ANSI + \r ======
fn strip_ansi(s: &str) -> String {
    let stripped = ANSI_RE.replace_all(s, "");
    // \r 单独去掉（PTY 行结尾是 \r\n，BufRead 已按 \n split，\r 残留在行尾）
    stripped.trim_end_matches('\r').to_string()
}

// ====== PTY 同步读循环（跑在 spawn_blocking 里）======
//
// 职责：
//   - 按字节积累成"行"（遇到 \n 或 "Choice [" 特殊触发）
//   - 识别 session_id / 审批提示 / 普通 chunk
//   - 通过 tx channel 发消息给异步侧
fn pty_read_loop(
    mut reader: Box<dyn Read + Send>,
    tx: tokio::sync::mpsc::UnboundedSender<PtyMsg>,
) {
    let mut line_buf = Vec::<u8>::new();
    // 最近 N 行，用于审批上下文提取
    let mut context_window: Vec<String> = Vec::new();
    let mut session_emitted = false;
    let mut byte_buf = [0u8; 256];

    loop {
        let n = match reader.read(&mut byte_buf) {
            Ok(0) => break,
            Ok(n) => n,
            Err(_) => break,
        };

        for &b in &byte_buf[..n] {
            if b == b'\n' {
                // 行完成
                let raw = String::from_utf8_lossy(&line_buf).to_string();
                line_buf.clear();
                let line = strip_ansi(&raw);
                if line.is_empty() {
                    continue;
                }

                // 1. session_id
                if !session_emitted {
                    if let Some(cap) = SESSION_RE.captures(&line) {
                        let sid = cap.get(1).unwrap().as_str().to_string();
                        eprintln!("[hermes-runner/pty] session detected: {sid}");
                        let _ = tx.send(PtyMsg::Session(sid));
                        session_emitted = true;
                        continue;
                    }
                }

                // 2. 审批提示：检测 "Choice [" 或 "[o]nce"
                if line.contains("[o]nce") || line.contains("Choice [") {
                    let command_preview = context_window
                        .iter()
                        .rfind(|l| l.starts_with("    ") || l.starts_with('\t'))
                        .map(|l| l.trim().to_string())
                        .unwrap_or_default();
                    let risk_description = context_window
                        .iter()
                        .filter(|l| {
                            l.contains("Security scan")
                                || l.contains("DANGEROUS")
                                || l.contains("[HIGH]")
                                || l.contains("[MEDIUM]")
                                || l.contains("[LOW]")
                        })
                        .cloned()
                        .collect::<Vec<_>>()
                        .join("\n");
                    eprintln!(
                        "[hermes-runner/pty] approval prompt detected, preview={:?}",
                        command_preview
                    );
                    let _ = tx.send(PtyMsg::Approval { command_preview, risk_description });
                    // 审批行本身不进 chunk
                    continue;
                }

                // 3. 已获得审批回应行（"✓ Allowed" / "✗ Denied"）—— 不发给前端
                if line.contains("✓ Allowed") || line.contains("✗ Denied") {
                    continue;
                }

                // 4. 续接提示行
                if line.starts_with("↻ Resumed session") {
                    continue;
                }

                // 5. 普通 chunk
                eprintln!("[hermes-runner/pty] chunk: {}", &line[..line.len().min(80)]);
                let _ = tx.send(PtyMsg::Chunk(line.clone()));

                // 维护上下文窗口（仅保留最近 20 行）
                context_window.push(line);
                if context_window.len() > 20 {
                    context_window.remove(0);
                }
            } else if b != b'\r' {
                line_buf.push(b);

                // 检测未换行的审批提示（有时 "Choice [o/s/D]: " 后面没有换行，
                // 直接等待键盘输入）
                let peek = String::from_utf8_lossy(&line_buf);
                let peek_stripped = strip_ansi(&peek);
                if peek_stripped.contains("Choice [") && peek_stripped.ends_with(": ") {
                    let command_preview = context_window
                        .iter()
                        .rfind(|l| l.starts_with("    ") || l.starts_with('\t'))
                        .map(|l| l.trim().to_string())
                        .unwrap_or_default();
                    let risk_description = context_window
                        .iter()
                        .filter(|l| {
                            l.contains("Security scan")
                                || l.contains("DANGEROUS")
                                || l.contains("[HIGH]")
                                || l.contains("[MEDIUM]")
                                || l.contains("[LOW]")
                        })
                        .cloned()
                        .collect::<Vec<_>>()
                        .join("\n");
                    eprintln!(
                        "[hermes-runner/pty] approval prompt (no-newline), preview={:?}",
                        command_preview
                    );
                    let _ = tx.send(PtyMsg::Approval { command_preview, risk_description });
                    line_buf.clear();
                }
            }
        }
    }
    eprintln!("[hermes-runner/pty] read loop ended");
}

// ====== 启动一次 PTY 对话 ======
#[tauri::command]
pub async fn hermes_start_chat(
    app: AppHandle,
    args: StartChatArgs,
) -> Result<StartChatResult, String> {
    let bin = discover_hermes_path()
        .ok_or_else(|| "Hermes binary not found. Please install Hermes Agent first.".to_string())?;

    let task_id = args
        .task_id
        .as_deref()
        .filter(|id| !id.trim().is_empty())
        .map(ToString::to_string)
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    // 拼最终 -q 文本
    let full_text = match args.system_prompt.as_deref() {
        Some(sp) if !sp.trim().is_empty() => format!("{sp}\n\n---\n\n{}", args.text),
        _ => args.text.clone(),
    };

    // 拼参数
    let mut cmd_args: Vec<String> = vec!["chat".into(), "-Q".into(), "--accept-hooks".into()];
    if let Some(sid) = args.session_id.as_deref() {
        if !sid.is_empty() {
            cmd_args.push("-r".into());
            cmd_args.push(sid.into());
        }
    }
    cmd_args.push("-q".into());
    cmd_args.push(full_text);

    // 调试日志
    let preview_text: String = cmd_args.last().map(|t| {
        let chars: String = t.chars().take(60).collect();
        if t.chars().count() > 60 {
            format!("\"{}…[{}chars]\"", chars.replace('\n', "\\n"), t.chars().count())
        } else {
            format!("\"{chars}\"")
        }
    }).unwrap_or_default();
    eprintln!(
        "[hermes-runner] task={} spawn PTY: {} chat -Q --accept-hooks ... -q {}",
        task_id,
        bin.display(),
        preview_text
    );

    // 开 PTY
    let pty_system = native_pty_system();
    let pty_pair = pty_system
        .openpty(PtySize { rows: 50, cols: 220, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| format!("openpty failed: {e}"))?;

    // 构造 CommandBuilder
    let mut cmd = CommandBuilder::new(&bin);
    for a in &cmd_args {
        cmd.arg(a);
    }

    // 继承当前环境（含 PATH / HOME 等）
    // portable-pty CommandBuilder 默认继承环境，无需额外操作

    let child = pty_pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("spawn_command failed: {e}"))?;
    drop(pty_pair.slave); // slave 端 fd 给 child 用，parent 不需要

    // 取出 reader / writer
    let reader = pty_pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("clone_reader failed: {e}"))?;
    let writer = pty_pair
        .master
        .take_writer()
        .map_err(|e| format!("take_writer failed: {e}"))?;

    // 存 writer 到 STDIN_MAP
    {
        let mut map = STDIN_MAP.lock().await;
        map.insert(task_id.clone(), writer);
    }

    // 建 channel：读循环 → 异步侧
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<PtyMsg>();

    // spawn_blocking 跑同步读循环
    let tid_read = task_id.clone();
    let tx_read = tx.clone();
    let child_arc = Arc::new(std::sync::Mutex::new(child));
    let child_arc_wait = child_arc.clone();

    let read_handle = tokio::task::spawn_blocking(move || {
        eprintln!("[hermes-runner/pty] read thread started task={}", tid_read);
        pty_read_loop(reader, tx_read);
        eprintln!("[hermes-runner/pty] read thread done task={}", tid_read);
    });

    // wait child（spawn_blocking，等 read 先结束）
    let tid_wait = task_id.clone();
    let tx_wait = tx.clone();
    tokio::task::spawn_blocking(move || {
        // 等读循环先退出（read EOF 后才 wait，避免先 wait 锁住读）
        // 这里简单用 sleep 轮询，因为 read 退出后 tx drop 会让 rx 关闭
        // 实际等 child 退出就够了
        let exit_code = match child_arc_wait.lock().unwrap().wait() {
            Ok(status) => status.exit_code() as i32,
            Err(_) => -1,
        };
        eprintln!("[hermes-runner/pty] child exited task={} exit={}", tid_wait, exit_code);
        let _ = tx_wait.send(PtyMsg::Done(exit_code));
    });

    // 异步侧：从 rx 收消息，emit Tauri 事件
    let app_emit = app.clone();
    let tid_emit = task_id.clone();
    tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            match msg {
                PtyMsg::Chunk(line) => {
                    let _ = app_emit.emit_to(
                        PET_WINDOW_LABEL,
                        EV_CHUNK,
                        ChunkPayload { task_id: tid_emit.clone(), line },
                    );
                }
                PtyMsg::Session(sid) => {
                    let _ = app_emit.emit_to(
                        PET_WINDOW_LABEL,
                        EV_SESSION,
                        SessionPayload { task_id: tid_emit.clone(), session_id: sid },
                    );
                }
                PtyMsg::Approval { command_preview, risk_description } => {
                    let _ = app_emit.emit_to(
                        PET_WINDOW_LABEL,
                        EV_APPROVAL,
                        ApprovalPayload {
                            task_id: tid_emit.clone(),
                            command_preview,
                            risk_description,
                        },
                    );
                }
                PtyMsg::Done(exit_code) => {
                    // 清理 STDIN_MAP
                    {
                        let mut map = STDIN_MAP.lock().await;
                        map.remove(&tid_emit);
                    }
                    let _ = app_emit.emit_to(
                        PET_WINDOW_LABEL,
                        EV_DONE,
                        DonePayload { task_id: tid_emit.clone(), exit_code },
                    );
                    eprintln!("[hermes-runner/pty] EMIT done task={} exit={}", tid_emit, exit_code);
                    break;
                }
                PtyMsg::Error(msg) => {
                    let _ = app_emit.emit_to(
                        PET_WINDOW_LABEL,
                        EV_ERROR,
                        ErrorPayload { task_id: tid_emit.clone(), message: msg },
                    );
                }
            }
        }
        eprintln!("[hermes-runner/pty] emit loop done task={}", tid_emit);
    });

    // read_handle 等待（detach，不阻塞 command 返回）
    drop(read_handle);

    Ok(StartChatResult { task_id })
}

// ====== 取消（PTY 版：向子进程发 SIGKILL 通过 kill writer 一侧）======
//
// portable-pty 的 Child 没有 .kill()，只能通过 kill(pid, SIGKILL)。
// 这里清理 STDIN_MAP（关掉写端 fd 会触发 SIGHUP 让 Hermes 退出）。
#[tauri::command]
pub async fn hermes_cancel(task_id: String) -> Result<(), String> {
    eprintln!("[hermes-runner] cancel task={}", task_id);
    // 关掉 stdin writer → 子进程收到 SIGHUP/EIO 会退出
    let mut map = STDIN_MAP.lock().await;
    map.remove(&task_id);
    Ok(())
}

// ====== 向子进程 stdin 写入审批选择 ======
#[tauri::command]
pub async fn hermes_send_input(task_id: String, input: String) -> Result<(), String> {
    eprintln!(
        "[hermes-runner] send_input task={} input={:?}",
        task_id, input
    );
    let mut map = STDIN_MAP.lock().await;
    if let Some(writer) = map.get_mut(&task_id) {
        let line = format!("{}\n", input.trim());
        writer
            .write_all(line.as_bytes())
            .map_err(|e| format!("Failed to write stdin: {e}"))?;
        writer
            .flush()
            .map_err(|e| format!("Failed to flush stdin: {e}"))?;
        eprintln!("[hermes-runner] send_input ok task={}", task_id);
        Ok(())
    } else {
        Err(format!("No stdin writer for task {task_id}"))
    }
}
