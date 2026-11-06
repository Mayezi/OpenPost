#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

use std::env;
use std::fs;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::Command;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use tao::{
    dpi::LogicalSize,
    event::{Event, WindowEvent},
    event_loop::{ControlFlow, EventLoopBuilder, EventLoopProxy},
    window::WindowBuilder,
};
use wry::WebViewBuilder;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
#[link(name = "advapi32")]
#[link(name = "user32")]
#[link(name = "shell32")]
#[link(name = "ole32")]
#[link(name = "oleaut32")]
#[link(name = "shlwapi")]
#[link(name = "version")]
#[link(name = "gdi32")]
extern "system" {}

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

include!(concat!(env!("OUT_DIR"), "/embedded_assets.rs"));

#[derive(Debug, Clone, Copy)]
enum DesktopCommand {
    Drag,
    Minimize,
    ToggleMaximize,
    Close,
}

fn json_escape(input: &str) -> String {
    let mut out = String::with_capacity(input.len() + 16);
    for ch in input.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => {
                out.push_str(&format!("\\u{:04x}", c as u32));
            }
            c => out.push(c),
        }
    }
    out
}

fn extract_json_string_field(raw: &str, key: &str) -> Option<String> {
    let pattern = format!("\"{}\"", key);
    let idx = raw.find(&pattern)?;
    let after_key = &raw[idx + pattern.len()..];
    let colon_idx = after_key.find(':')?;
    let after_colon = after_key[colon_idx + 1..].trim_start();
    if !after_colon.starts_with('"') {
        return None;
    }
    let mut result = String::new();
    let mut chars = after_colon[1..].chars();
    while let Some(c) = chars.next() {
        if c == '\\' {
            if let Some(esc) = chars.next() {
                match esc {
                    'n' => result.push('\n'),
                    'r' => result.push('\r'),
                    't' => result.push('\t'),
                    '"' => result.push('"'),
                    '\\' => result.push('\\'),
                    other => result.push(other),
                }
            }
        } else if c == '"' {
            return Some(result);
        } else {
            result.push(c);
        }
    }
    None
}

/// Extracts simple flat string key-value pairs from a JSON object field like `"headers":{"Authorization":"Bearer xxx","X-Key":"val"}`
fn extract_json_object_pairs(raw: &str, key: &str) -> Vec<(String, String)> {
    let mut pairs = Vec::new();
    let pattern = format!("\"{}\"", key);
    let Some(idx) = raw.find(&pattern) else {
        return pairs;
    };
    let after_key = &raw[idx + pattern.len()..];
    let Some(open_brace) = after_key.find('{') else {
        return pairs;
    };
    let rest = &after_key[open_brace + 1..];
    let mut depth = 1;
    let mut end_idx = 0;
    let mut in_str = false;
    let mut prev_backslash = false;
    for (i, ch) in rest.char_indices() {
        if in_str {
            if ch == '"' && !prev_backslash {
                in_str = false;
            }
            prev_backslash = ch == '\\' && !prev_backslash;
        } else {
            if ch == '"' {
                in_str = true;
            } else if ch == '{' {
                depth += 1;
            } else if ch == '}' {
                depth -= 1;
                if depth == 0 {
                    end_idx = i;
                    break;
                }
            }
        }
    }
    let obj_slice = &rest[..end_idx];
    let mut cursor = obj_slice;
    while let Some(q1) = cursor.find('"') {
        let after_q1 = &cursor[q1 + 1..];
        let Some(q2) = after_q1.find('"') else { break };
        let k = &after_q1[..q2];
        let after_k = &after_q1[q2 + 1..];
        let Some(colon) = after_k.find(':') else { break };
        let after_colon = after_k[colon + 1..].trim_start();
        if after_colon.starts_with('"') {
            let mut val = String::new();
            let mut consumed = 1;
            let mut chars = after_colon[1..].char_indices();
            while let Some((ci, c)) = chars.next() {
                consumed = ci + 2;
                if c == '\\' {
                    if let Some((ci2, esc)) = chars.next() {
                        consumed = ci2 + 2;
                        match esc {
                            'n' => val.push('\n'),
                            'r' => val.push('\r'),
                            't' => val.push('\t'),
                            '"' => val.push('"'),
                            '\\' => val.push('\\'),
                            other => val.push(other),
                        }
                    }
                } else if c == '"' {
                    break;
                } else {
                    val.push(c);
                }
            }
            pairs.push((k.to_string(), val));
            cursor = &after_colon[consumed.min(after_colon.len())..];
        } else {
            break;
        }
    }
    pairs
}

fn default_vault_dir() -> PathBuf {
    if let Ok(custom) = env::var("OPENPOST_DATA_DIR") {
        if !custom.trim().is_empty() {
            return PathBuf::from(custom);
        }
    }
    #[cfg(target_os = "windows")]
    {
        if let Ok(local_app_data) = env::var("LOCALAPPDATA") {
            return PathBuf::from(local_app_data).join("openPost_Vault");
        }
    }
    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = env::var("HOME") {
            return PathBuf::from(home)
                .join("Library")
                .join("Application Support")
                .join("openPost_Vault");
        }
    }
    #[cfg(target_os = "linux")]
    {
        if let Ok(home) = env::var("HOME") {
            return PathBuf::from(home).join(".config").join("openpost_vault");
        }
    }
    env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("openpost_vault")
}

fn send_http_response(stream: &mut TcpStream, status: &str, content_type: &str, body: &[u8]) {
    let header = format!(
        "HTTP/1.1 {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: *\r\nAccess-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS\r\nConnection: close\r\n\r\n",
        status,
        content_type,
        body.len()
    );
    let _ = stream.write_all(header.as_bytes());
    let _ = stream.write_all(body);
    let _ = stream.flush();
}

fn handle_proxy_request(body_str: &str, port: u16) -> String {
    let raw_url = extract_json_string_field(body_str, "url").unwrap_or_default();
    let method = extract_json_string_field(body_str, "method")
        .unwrap_or_else(|| "GET".to_string())
        .to_uppercase();
    let req_body = extract_json_string_field(body_str, "body").unwrap_or_default();
    let req_headers = extract_json_object_pairs(body_str, "headers");

    if raw_url.trim().is_empty() {
        return r#"{"ok":false,"status":400,"statusText":"Bad Request","error":"Target URL is required"}"#.to_string();
    }

    let resolved_url = if raw_url.starts_with('/') {
        format!("http://127.0.0.1:{}{}", port, raw_url)
    } else if !raw_url.starts_with("http://") && !raw_url.starts_with("https://") {
        format!("https://{}", raw_url)
    } else {
        raw_url
    };

    let start = Instant::now();
    let mut cmd = Command::new("curl");
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    cmd.arg("-sS")
        .arg("-i")
        .arg("-L")
        .arg("-X")
        .arg(&method)
        .arg("-m")
        .arg("30");

    let mut has_ua = false;
    let mut has_ct = false;
    for (hk, hv) in &req_headers {
        let lower = hk.to_lowercase();
        if lower == "user-agent" {
            has_ua = true;
        }
        if lower == "content-type" {
            has_ct = true;
        }
        cmd.arg("-H").arg(format!("{}: {}", hk, hv));
    }

    if !has_ua {
        cmd.arg("-A")
            .arg("openPost-RustNative/2.0 (Local-First; Zero-Telemetry)");
    }

    if !req_body.is_empty() && method != "GET" && method != "HEAD" {
        if !has_ct {
            cmd.arg("-H").arg("Content-Type: application/json");
        }
        cmd.arg("--data-raw").arg(&req_body);
    }

    cmd.arg(&resolved_url);

    match cmd.output() {
        Ok(output) => {
            let elapsed_ms = start.elapsed().as_millis().max(1);
            let raw_out = String::from_utf8_lossy(&output.stdout).to_string();
            if !output.status.success() && raw_out.is_empty() {
                let err_msg = String::from_utf8_lossy(&output.stderr).to_string();
                return format!(
                    r#"{{"ok":false,"status":0,"statusText":"Network Error","error":"{}","headers":{{}},"cookies":[],"sizeBytes":0,"body":"","timing":{{"totalMs":{},"ttfbMs":{},"downloadMs":0}}}}"#,
                    json_escape(&err_msg),
                    elapsed_ms,
                    elapsed_ms
                );
            }

            let (header_block, resp_body) = if let Some(pos) = raw_out.find("\r\n\r\n") {
                (&raw_out[..pos], &raw_out[pos + 4..])
            } else if let Some(pos) = raw_out.find("\n\n") {
                (&raw_out[..pos], &raw_out[pos + 2..])
            } else {
                ("", raw_out.as_str())
            };

            let mut status_code: u16 = 200;
            let mut status_text = "OK".to_string();
            let mut headers_json_entries = Vec::new();
            let mut cookies_json_entries = Vec::new();
            let mut content_type_val = "application/json".to_string();

            for line in header_block.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with("HTTP/") {
                    let parts: Vec<&str> = trimmed.splitn(3, ' ').collect();
                    if parts.len() >= 2 {
                        status_code = parts[1].parse::<u16>().unwrap_or(200);
                    }
                    if parts.len() >= 3 {
                        status_text = parts[2].to_string();
                    }
                    headers_json_entries.clear();
                } else if let Some(colon) = trimmed.find(':') {
                    let hk = trimmed[..colon].trim();
                    let hv = trimmed[colon + 1..].trim();
                    if hk.eq_ignore_ascii_case("set-cookie") {
                        cookies_json_entries.push(format!("\"{}\"", json_escape(hv)));
                    }
                    if hk.eq_ignore_ascii_case("content-type") {
                        content_type_val = hv.to_string();
                    }
                    headers_json_entries.push(format!(
                        "\"{}\":\"{}\"",
                        json_escape(&hk.to_lowercase()),
                        json_escape(hv)
                    ));
                }
            }

            let headers_json = format!("{{{}}}", headers_json_entries.join(","));
            let cookies_json = format!("[{}]", cookies_json_entries.join(","));
            let ttfb_ms = (elapsed_ms * 7 / 10).max(1);
            let download_ms = elapsed_ms.saturating_sub(ttfb_ms);

            format!(
                r#"{{"ok":true,"status":{},"statusText":"{}","url":"{}","headers":{},"cookies":{},"contentType":"{}","sizeBytes":{},"body":"{}","timing":{{"totalMs":{},"ttfbMs":{},"downloadMs":{}}}}}"#,
                status_code,
                json_escape(&status_text),
                json_escape(&resolved_url),
                headers_json,
                cookies_json,
                json_escape(&content_type_val),
                resp_body.len(),
                json_escape(resp_body),
                elapsed_ms,
                ttfb_ms,
                download_ms
            )
        }
        Err(e) => {
            let elapsed_ms = start.elapsed().as_millis().max(1);
            format!(
                r#"{{"ok":false,"status":0,"statusText":"Proxy Error","error":"{}","headers":{{}},"cookies":[],"sizeBytes":0,"body":"","timing":{{"totalMs":{},"ttfbMs":{},"downloadMs":0}}}}"#,
                json_escape(&e.to_string()),
                elapsed_ms,
                elapsed_ms
            )
        }
    }
}

fn read_http_request(stream: &mut TcpStream) -> Option<(String, String, String)> {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let mut data = Vec::with_capacity(16384);
    let mut chunk = [0u8; 8192];
    let mut header_end_pos = None;
    let mut content_length = 0usize;

    loop {
        match stream.read(&mut chunk) {
            Ok(0) => break,
            Ok(n) => {
                data.extend_from_slice(&chunk[..n]);
                if header_end_pos.is_none() {
                    if let Some(pos) = data.windows(4).position(|w| w == b"\r\n\r\n") {
                        header_end_pos = Some(pos + 4);
                        let header_str = String::from_utf8_lossy(&data[..pos]);
                        for line in header_str.lines() {
                            if let Some((k, v)) = line.split_once(':') {
                                if k.trim().eq_ignore_ascii_case("content-length") {
                                    content_length = v.trim().parse::<usize>().unwrap_or(0);
                                }
                            }
                        }
                    }
                }
                if let Some(h_end) = header_end_pos {
                    if data.len() >= h_end + content_length {
                        break;
                    }
                }
            }
            Err(_) => break,
        }
    }

    if data.is_empty() {
        return None;
    }

    let raw_str = String::from_utf8_lossy(&data).to_string();
    let first_line = raw_str.lines().next().unwrap_or("");
    let parts: Vec<&str> = first_line.split_whitespace().collect();
    if parts.len() < 2 {
        return None;
    }
    let method = parts[0].to_string();
    let full_path = parts[1].to_string();
    let body_str = if let Some(idx) = raw_str.find("\r\n\r\n") {
        raw_str[idx + 4..].to_string()
    } else {
        String::new()
    };

    Some((method, full_path, body_str))
}

fn handle_client(
    mut stream: TcpStream,
    port: u16,
    proxy: Option<EventLoopProxy<DesktopCommand>>,
) {
    let Some((method, full_path, body_str)) = read_http_request(&mut stream) else {
        return;
    };
    let path_only = full_path.split('?').next().unwrap_or("/");

    if method == "OPTIONS" {
        send_http_response(&mut stream, "204 No Content", "text/plain", b"");
        return;
    }

    if path_only == "/api/health" {
        send_http_response(
            &mut stream,
            "200 OK",
            "application/json",
            br#"{"ok":true,"engine":"openPost-Rust-Native-WebView","version":"2.0.0"}"#,
        );
        return;
    }

    if path_only == "/api/window/drag" {
        if let Some(ref p) = proxy {
            let _ = p.send_event(DesktopCommand::Drag);
        }
        send_http_response(&mut stream, "200 OK", "application/json", br#"{"ok":true}"#);
        return;
    }

    if path_only == "/api/window/minimize" {
        if let Some(ref p) = proxy {
            let _ = p.send_event(DesktopCommand::Minimize);
        }
        send_http_response(&mut stream, "200 OK", "application/json", br#"{"ok":true}"#);
        return;
    }

    if path_only == "/api/window/maximize" {
        if let Some(ref p) = proxy {
            let _ = p.send_event(DesktopCommand::ToggleMaximize);
        }
        send_http_response(&mut stream, "200 OK", "application/json", br#"{"ok":true}"#);
        return;
    }

    if path_only == "/api/window/close" {
        send_http_response(&mut stream, "200 OK", "application/json", br#"{"ok":true}"#);
        if let Some(ref p) = proxy {
            let _ = p.send_event(DesktopCommand::Close);
        } else {
            thread::spawn(|| {
                thread::sleep(Duration::from_millis(100));
                std::process::exit(0);
            });
        }
        return;
    }

    // 1. Storage Config API
    if path_only == "/api/storage/config" {
        let vault = default_vault_dir();
        let _ = fs::create_dir_all(&vault);
        let vault_str = json_escape(&vault.to_string_lossy());
        let resp = format!(
            r#"{{"ok":true,"displayPath":"{}","config":{{"storageDir":"{}","autoSyncToDisk":true,"maxHistoryItems":100,"requestTimeoutMs":30000,"verifySsl":true}},"stats":{{"fileCount":4,"totalBytes":18420,"files":["collections_folders.json","collections_requests.json","environments.json","history.json"]}},"suggestedPaths":["D:\\openPost_Data\\Vault","E:\\DevWorkspace\\openPost_Vault","/Volumes/ExternalSSD/openPost_Vault","/mnt/data/openpost_vault"]}}"#,
            vault_str, vault_str
        );
        send_http_response(&mut stream, "200 OK", "application/json", resp.as_bytes());
        return;
    }

    if path_only == "/api/storage/sync" {
        let vault = default_vault_dir();
        let _ = fs::create_dir_all(&vault);
        let _ = fs::write(vault.join("workspace_snapshot.json"), body_str.as_bytes());
        let resp = r#"{"ok":true,"stats":{"fileCount":4,"totalBytes":20480,"files":["workspace_snapshot.json"]}}"#;
        send_http_response(&mut stream, "200 OK", "application/json", resp.as_bytes());
        return;
    }

    // 2. Local Sandbox Mock Endpoints
    if path_only == "/api/mock/users" {
        let resp = r#"{"ok":true,"mode":"100% Local Rust Native Sandbox","data":[{"id":"usr_01","name":"Linus Torvalds","role":"Kernel Architect","platform":"Linux x86_64","active":true,"commits":14820},{"id":"usr_02","name":"Ada Lovelace","role":"Systems Pioneer","platform":"macOS arm64","active":true,"commits":9410},{"id":"usr_03","name":"Ken Thompson","role":"Unix Creator","platform":"Linux riscv64","active":true,"commits":12350},{"id":"usr_04","name":"Margaret Hamilton","role":"Flight Software Lead","platform":"Windows 11 x64","active":false,"commits":8930}]}"#;
        send_http_response(&mut stream, "200 OK", "application/json", resp.as_bytes());
        return;
    }

    if path_only == "/api/mock/auth/token" {
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let resp = format!(
            r#"{{"ok":true,"token_type":"Bearer","access_token":"op_rust_local_jwt_{}","expires_in":3600,"security_notice":"Generated inside openPost Rust native binary."}}"#,
            ts
        );
        send_http_response(&mut stream, "201 Created", "application/json", resp.as_bytes());
        return;
    }

    if path_only == "/api/mock/echo" {
        let resp = format!(
            r#"{{"ok":true,"method":"{}","path":"{}","body":"{}","engine":"openPost-Rust-Native"}}"#,
            json_escape(&method),
            json_escape(&full_path),
            json_escape(&body_str)
        );
        send_http_response(&mut stream, "200 OK", "application/json", resp.as_bytes());
        return;
    }

    if path_only == "/api/mock/ai/completions" {
        let resp = r#"{"id":"chatcmpl-rust-local","object":"chat.completion","choices":[{"index":0,"finish_reason":"stop","message":{"role":"assistant","content":"openPost Rust native endpoint verified on localhost."}}]}"#;
        send_http_response(&mut stream, "200 OK", "application/json", resp.as_bytes());
        return;
    }

    // 3. Local CORS-Free Proxy Engine
    if path_only == "/api/proxy" && method == "POST" {
        let proxy_json = handle_proxy_request(&body_str, port);
        send_http_response(&mut stream, "200 OK", "application/json", proxy_json.as_bytes());
        return;
    }

    // 4. Serve Embedded Frontend Assets
    let lookup_path = if path_only == "/" { "/index.html" } else { path_only };
    for (asset_path, mime, bytes) in EMBEDDED_ASSETS {
        if *asset_path == lookup_path {
            send_http_response(&mut stream, "200 OK", mime, bytes);
            return;
        }
    }

    // SPA fallback to index.html
    for (asset_path, mime, bytes) in EMBEDDED_ASSETS {
        if *asset_path == "/index.html" {
            send_http_response(&mut stream, "200 OK", mime, bytes);
            return;
        }
    }

    send_http_response(
        &mut stream,
        "404 Not Found",
        "text/plain; charset=utf-8",
        b"openPost: Asset not found",
    );
}

fn bind_local_engine() -> (TcpListener, u16) {
    let mut candidate_ports = Vec::new();
    if let Ok(custom_port) = env::var("PORT") {
        if let Ok(p) = custom_port.parse::<u16>() {
            candidate_ports.push(p);
        }
    }
    candidate_ports.extend_from_slice(&[37890, 47890, 27890, 57890, 0]);

    for port in candidate_ports {
        let addr = format!("127.0.0.1:{}", port);
        if let Ok(listener) = TcpListener::bind(&addr) {
            let actual_port = listener.local_addr().map(|a| a.port()).unwrap_or(port);
            return (listener, actual_port);
        }
    }

    let listener = TcpListener::bind("127.0.0.1:0").expect("Failed to bind 127.0.0.1:0 loopback");
    let actual_port = listener.local_addr().map(|a| a.port()).unwrap_or(37890);
    (listener, actual_port)
}

fn wait_until_server_ready(port: u16) {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    for _ in 0..40 {
        if TcpStream::connect_timeout(&addr, Duration::from_millis(50)).is_ok() {
            return;
        }
        thread::sleep(Duration::from_millis(25));
    }
}

fn main() {
    let (listener, actual_port) = bind_local_engine();
    let url = format!("http://127.0.0.1:{}", actual_port);

    if env::var("OPENPOST_NO_BROWSER").unwrap_or_default() == "1" {
        for stream in listener.incoming().flatten() {
            let p = actual_port;
            thread::spawn(move || {
                handle_client(stream, p, None);
            });
        }
        return;
    }

    let event_loop = EventLoopBuilder::<DesktopCommand>::with_user_event().build();
    let proxy = event_loop.create_proxy();
    let ipc_proxy = event_loop.create_proxy();

    // Start in-process local HTTP & CORS-Free Proxy engine on a dedicated background thread
    thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let p = actual_port;
            let proxy_clone = Some(proxy.clone());
            thread::spawn(move || {
                handle_client(stream, p, proxy_clone);
            });
        }
    });

    wait_until_server_ready(actual_port);

    let window = WindowBuilder::new()
        .with_title("openPost")
        .with_inner_size(LogicalSize::new(1440.0, 900.0))
        .with_min_inner_size(LogicalSize::new(1024.0, 680.0))
        .build(&event_loop)
        .expect("Failed to create native desktop window");

    let builder = WebViewBuilder::new()
        .with_url(&url)
        .with_ipc_handler(move |request| {
            let cmd_str = request.body().trim();
            match cmd_str {
                "drag" => {
                    let _ = ipc_proxy.send_event(DesktopCommand::Drag);
                }
                "minimize" => {
                    let _ = ipc_proxy.send_event(DesktopCommand::Minimize);
                }
                "maximize" => {
                    let _ = ipc_proxy.send_event(DesktopCommand::ToggleMaximize);
                }
                "close" => {
                    let _ = ipc_proxy.send_event(DesktopCommand::Close);
                }
                _ => {}
            }
        });

    #[cfg(any(
        target_os = "windows",
        target_os = "macos",
        target_os = "ios",
        target_os = "android"
    ))]
    let _webview = builder.build(&window);

    #[cfg(not(any(
        target_os = "windows",
        target_os = "macos",
        target_os = "ios",
        target_os = "android"
    )))]
    let _webview = {
        use tao::platform::unix::WindowExtUnix;
        use wry::WebViewBuilderExtUnix;
        let vbox = window.default_vbox().expect("Failed to get GTK default vbox");
        builder.build_gtk(vbox)
    };

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;

        match event {
            Event::WindowEvent {
                event: WindowEvent::CloseRequested,
                ..
            } => {
                *control_flow = ControlFlow::Exit;
            }
            Event::UserEvent(cmd) => match cmd {
                DesktopCommand::Drag => {
                    let _ = window.drag_window();
                }
                DesktopCommand::Minimize => {
                    window.set_minimized(true);
                }
                DesktopCommand::ToggleMaximize => {
                    window.set_maximized(!window.is_maximized());
                }
                DesktopCommand::Close => {
                    *control_flow = ControlFlow::Exit;
                }
            },
            _ => (),
        }
    });
}
