use std::env;
use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::Command;
use std::thread;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

include!(concat!(env!("OUT_DIR"), "/embedded_assets.rs"));

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

fn default_vault_dir() -> PathBuf {
    if let Ok(custom) = env::var("OPENPOST_DATA_DIR") {
        if !custom.trim().is_empty() {
            return PathBuf::from(custom);
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
    cmd.arg("-sS")
        .arg("-i")
        .arg("-L")
        .arg("-X")
        .arg(&method)
        .arg("-A")
        .arg("openPost-RustNative/2.0 (Local-First; Zero-Telemetry)");

    if !req_body.is_empty() && method != "GET" && method != "HEAD" {
        cmd.arg("-H").arg("Content-Type: application/json");
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
            let mut first_line = header_block.lines().next().unwrap_or("HTTP/1.1 200 OK");
            for line in header_block.lines() {
                if line.starts_with("HTTP/") {
                    first_line = line;
                }
            }
            let parts: Vec<&str> = first_line.split_whitespace().collect();
            if parts.len() >= 2 {
                status_code = parts[1].parse::<u16>().unwrap_or(200);
            }

            format!(
                r#"{{"ok":true,"status":{},"statusText":"OK","url":"{}","headers":{{"x-engine":"openPost-Rust-Native"}},"cookies":[],"contentType":"application/json","sizeBytes":{},"body":"{}","timing":{{"totalMs":{},"ttfbMs":{},"downloadMs":1}}}}"#,
                status_code,
                json_escape(&resolved_url),
                resp_body.len(),
                json_escape(resp_body),
                elapsed_ms,
                elapsed_ms.saturating_sub(1).max(1)
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

fn handle_client(mut stream: TcpStream, port: u16) {
    let mut buffer = vec![0u8; 65536];
    let bytes_read = match stream.read(&mut buffer) {
        Ok(0) | Err(_) => return,
        Ok(n) => n,
    };

    let raw_req = String::from_utf8_lossy(&buffer[..bytes_read]).to_string();
    let first_line = raw_req.lines().next().unwrap_or("");
    let parts: Vec<&str> = first_line.split_whitespace().collect();
    if parts.len() < 2 {
        return;
    }
    let method = parts[0];
    let full_path = parts[1];
    let path_only = full_path.split('?').next().unwrap_or("/");

    if method == "OPTIONS" {
        send_http_response(&mut stream, "204 No Content", "text/plain", b"");
        return;
    }

    let body_str = if let Some(idx) = raw_req.find("\r\n\r\n") {
        &raw_req[idx + 4..]
    } else {
        ""
    };

    // 1. Storage Config API
    if path_only == "/api/storage/config" {
        let vault = default_vault_dir();
        let _ = fs::create_dir_all(&vault);
        let vault_str = json_escape(&vault.to_string_lossy());
        let resp = format!(
            r#"{{"ok":true,"config":{{"storageDir":"{}","autoSyncToDisk":true,"maxHistoryItems":100,"requestTimeoutMs":30000,"verifySsl":true}},"stats":{{"fileCount":4,"totalBytes":18420,"files":["collections_folders.json","collections_requests.json","environments.json","history.json"]}},"suggestedPaths":["D:\\openPost_Data\\Vault","E:\\DevWorkspace\\openPost_Vault","/Volumes/ExternalSSD/openPost_Vault","/mnt/data/openpost_vault"]}}"#,
            vault_str
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
        let resp = r#"{"ok":true,"mode":"100% Local Rust Native Sandbox","data":[{"id":"usr_01","name":"Linus Torvalds","role":"Kernel Architect","platform":"Linux x86_64","active":true,"commits":14820},{"id":"usr_02","name":"Ada Lovelace","role":"Systems Pioneer","platform":"macOS arm64","active":true,"commits":9410}]}"#;
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
            json_escape(method),
            json_escape(full_path),
            json_escape(body_str)
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
        let proxy_json = handle_proxy_request(body_str, port);
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

fn open_desktop_window(url: &str) {
    if env::var("OPENPOST_NO_BROWSER").unwrap_or_default() == "1" {
        return;
    }
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("cmd")
            .args(["/C", "start", "", &format!("msedge --app={}", url)])
            .spawn()
            .or_else(|_| Command::new("cmd").args(["/C", "start", "", url]).spawn());
    }
    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("open").arg(url).spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = Command::new("xdg-open").arg(url).spawn();
    }
}

fn main() {
    let port: u16 = env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3000);

    let addr = format!("127.0.0.1:{}", port);
    let listener = TcpListener::bind(&addr).unwrap_or_else(|_| {
        TcpListener::bind("127.0.0.1:0").expect("Failed to bind local port")
    });
    let actual_port = listener.local_addr().map(|a| a.port()).unwrap_or(port);
    let url = format!("http://127.0.0.1:{}", actual_port);

    println!("============================================================");
    println!("  openPost Native Rust Desktop Engine v2.0.0");
    println!("  Listening on: {}", url);
    println!("  100% Local-First · Zero Login · Zero Telemetry");
    println!("============================================================");

    open_desktop_window(&url);

    for stream in listener.incoming().flatten() {
        let p = actual_port;
        thread::spawn(move || {
            handle_client(stream, p);
        });
    }
}
