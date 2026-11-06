#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

use std::collections::HashMap;
use std::env;
use std::fs;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tao::{
    dpi::LogicalSize,
    event::{Event, WindowEvent},
    event_loop::{ControlFlow, EventLoopBuilder, EventLoopProxy},
    window::WindowBuilder,
};
use wry::WebViewBuilder;

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

include!(concat!(env!("OUT_DIR"), "/embedded_assets.rs"));

#[derive(Debug, Clone, Copy)]
enum DesktopCommand {
    Drag,
    Minimize,
    ToggleMaximize,
    Close,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StorageConfig {
    storage_dir: String,
    auto_sync_to_disk: bool,
    max_history_items: usize,
    request_timeout_ms: u64,
    verify_ssl: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DirStats {
    file_count: usize,
    total_bytes: u64,
    files: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateStorageConfigPayload {
    storage_dir: Option<String>,
    auto_sync_to_disk: Option<bool>,
    max_history_items: Option<usize>,
    request_timeout_ms: Option<u64>,
    verify_ssl: Option<bool>,
    migrate_existing: Option<bool>,
    clean_old_dir: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProxyRequestPayload {
    url: String,
    method: Option<String>,
    headers: Option<HashMap<String, String>>,
    body: Option<Value>,
    timeout_ms: Option<u64>,
}

fn app_config_file_path() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        if let Ok(appdata) = env::var("LOCALAPPDATA") {
            let dir = PathBuf::from(appdata).join("openPost");
            let _ = fs::create_dir_all(&dir);
            return dir.join("storage-config.json");
        }
    }
    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = env::var("HOME") {
            let dir = PathBuf::from(home)
                .join("Library")
                .join("Application Support")
                .join("openPost");
            let _ = fs::create_dir_all(&dir);
            return dir.join("storage-config.json");
        }
    }
    #[cfg(target_os = "linux")]
    {
        if let Ok(home) = env::var("HOME") {
            let dir = PathBuf::from(home).join(".config").join("openpost");
            let _ = fs::create_dir_all(&dir);
            return dir.join("storage-config.json");
        }
    }
    env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(".openpost-storage-config.json")
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

fn load_storage_config() -> StorageConfig {
    let cfg_file = app_config_file_path();
    if let Ok(raw) = fs::read_to_string(&cfg_file) {
        if let Ok(parsed) = serde_json::from_str::<StorageConfig>(&raw) {
            if !parsed.storage_dir.trim().is_empty() {
                let _ = fs::create_dir_all(&parsed.storage_dir);
                return parsed;
            }
        }
    }
    let vault = default_vault_dir();
    let _ = fs::create_dir_all(&vault);
    let cfg = StorageConfig {
        storage_dir: vault.to_string_lossy().to_string(),
        auto_sync_to_disk: true,
        max_history_items: 100,
        request_timeout_ms: 30000,
        verify_ssl: true,
    };
    save_storage_config(&cfg);
    cfg
}

fn save_storage_config(cfg: &StorageConfig) {
    let cfg_file = app_config_file_path();
    if let Ok(json_str) = serde_json::to_string_pretty(cfg) {
        let _ = fs::write(cfg_file, json_str);
    }
}

fn ensure_dir_writable(dir_path: &Path) -> Result<PathBuf, String> {
    fs::create_dir_all(dir_path).map_err(|e| e.to_string())?;
    let probe = dir_path.join(".openpost_write_probe");
    fs::write(&probe, b"ok").map_err(|e| e.to_string())?;
    let _ = fs::remove_file(&probe);
    Ok(fs::canonicalize(dir_path).unwrap_or_else(|_| dir_path.to_path_buf()))
}

fn compute_dir_stats(dir_path: &Path) -> DirStats {
    let mut total_bytes = 0u64;
    let mut files = Vec::new();
    if let Ok(entries) = fs::read_dir(dir_path) {
        for entry in entries.flatten() {
            if let Ok(meta) = entry.metadata() {
                if meta.is_file() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if !name.starts_with('.') {
                        total_bytes += meta.len();
                        files.push(name);
                    }
                }
            }
        }
    }
    files.sort();
    DirStats {
        file_count: files.len(),
        total_bytes,
        files,
    }
}

fn suggested_os_paths() -> Vec<String> {
    let mut list = vec![default_vault_dir().to_string_lossy().to_string()];
    #[cfg(target_os = "windows")]
    {
        list.push("D:\\openPost_Data\\Vault".to_string());
        list.push("E:\\openPost_Data\\Vault".to_string());
    }
    #[cfg(target_os = "macos")]
    {
        list.push("/Volumes/ExternalSSD/openPost_Vault".to_string());
    }
    #[cfg(target_os = "linux")]
    {
        list.push("/mnt/data/openpost_vault".to_string());
    }
    list
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

fn send_json_response(stream: &mut TcpStream, status: &str, val: &Value) {
    let bytes = serde_json::to_vec(val).unwrap_or_else(|_| b"{}".to_vec());
    send_http_response(stream, status, "application/json; charset=utf-8", &bytes);
}

/// Real Pure-Rust HTTP/HTTPS Execution Engine (`ureq` + `rustls`)
fn execute_rust_http_proxy(body_str: &str, port: u16, default_timeout_ms: u64) -> Value {
    let payload: ProxyRequestPayload = match serde_json::from_str(body_str) {
        Ok(p) => p,
        Err(e) => {
            return json!({
                "ok": false,
                "status": 400,
                "statusText": "Bad Request",
                "error": format!("Invalid JSON request payload: {}", e),
                "headers": {},
                "cookies": [],
                "sizeBytes": 0,
                "body": "",
                "timing": { "totalMs": 0, "ttfbMs": 0, "downloadMs": 0 }
            });
        }
    };

    let raw_url = payload.url.trim();
    if raw_url.is_empty() {
        return json!({
            "ok": false,
            "status": 400,
            "statusText": "Bad Request",
            "error": "Target URL is required",
            "headers": {},
            "cookies": [],
            "sizeBytes": 0,
            "body": "",
            "timing": { "totalMs": 0, "ttfbMs": 0, "downloadMs": 0 }
        });
    }

    let resolved_url = if raw_url.starts_with('/') {
        format!("http://127.0.0.1:{}{}", port, raw_url)
    } else if !raw_url.starts_with("http://") && !raw_url.starts_with("https://") {
        format!("https://{}", raw_url)
    } else {
        raw_url.to_string()
    };

    let method = payload
        .method
        .unwrap_or_else(|| "GET".to_string())
        .to_uppercase();
    let timeout_ms = payload
        .timeout_ms
        .unwrap_or(default_timeout_ms)
        .clamp(1000, 120_000);

    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_millis(timeout_ms))
        .redirects(5)
        .build();

    let mut req = agent.request(&method, &resolved_url);

    let mut has_ua = false;
    if let Some(headers) = &payload.headers {
        for (k, v) in headers {
            let trimmed_k = k.trim();
            if trimmed_k.is_empty() {
                continue;
            }
            if trimmed_k.eq_ignore_ascii_case("user-agent") {
                has_ua = true;
            }
            req = req.set(trimmed_k, v);
        }
    }
    if !has_ua {
        req = req.set("User-Agent", "openPost-RustCore/2.0 (Native-Desktop)");
    }

    let body_text = match payload.body {
        Some(Value::String(s)) => s,
        Some(Value::Null) | None => String::new(),
        Some(other) => serde_json::to_string(&other).unwrap_or_default(),
    };

    let start_total = Instant::now();
    let response_result = if !body_text.is_empty() && method != "GET" && method != "HEAD" {
        req.send_string(&body_text)
    } else {
        req.call()
    };

    let ttfb_ms = start_total.elapsed().as_millis().max(1) as u64;

    // In ureq, 4xx and 5xx responses return Err(ureq::Error::Status(code, response)),
    // which is still a valid HTTP response from the target server!
    let response = match response_result {
        Ok(resp) => resp,
        Err(ureq::Error::Status(_code, resp)) => resp,
        Err(ureq::Error::Transport(transport_err)) => {
            let elapsed_ms = start_total.elapsed().as_millis().max(1) as u64;
            return json!({
                "ok": false,
                "status": 0,
                "statusText": "Transport / Network Error",
                "url": resolved_url,
                "error": transport_err.to_string(),
                "headers": {},
                "cookies": [],
                "contentType": "text/plain",
                "sizeBytes": 0,
                "body": "",
                "timing": {
                    "totalMs": elapsed_ms,
                    "ttfbMs": elapsed_ms,
                    "downloadMs": 0
                }
            });
        }
    };

    let status_code = response.status();
    let status_text = response.status_text().to_string();
    let final_url = response.get_url().to_string();
    let content_type = response.content_type().to_string();

    let mut headers_map = serde_json::Map::new();
    let mut cookies_vec = Vec::new();
    for name in response.headers_names() {
        let all_vals = response.all(&name);
        if name.eq_ignore_ascii_case("set-cookie") {
            for c in &all_vals {
                cookies_vec.push(Value::String((*c).to_string()));
            }
        }
        if let Some(first_val) = all_vals.first() {
            headers_map.insert(name.to_lowercase(), Value::String((*first_val).to_string()));
        }
    }

    let mut raw_bytes = Vec::new();
    let _ = response
        .into_reader()
        .take(50 * 1024 * 1024)
        .read_to_end(&mut raw_bytes);

    let total_ms = start_total.elapsed().as_millis().max(1) as u64;
    let download_ms = total_ms.saturating_sub(ttfb_ms);
    let size_bytes = raw_bytes.len();
    let resp_body = String::from_utf8_lossy(&raw_bytes).to_string();

    json!({
        "ok": true,
        "status": status_code,
        "statusText": status_text,
        "url": final_url,
        "headers": headers_map,
        "cookies": cookies_vec,
        "contentType": content_type,
        "sizeBytes": size_bytes,
        "body": resp_body,
        "timing": {
            "totalMs": total_ms,
            "ttfbMs": ttfb_ms,
            "downloadMs": download_ms
        }
    })
}

fn read_http_request(stream: &mut TcpStream) -> Option<(String, String, String)> {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));
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
    state: Arc<Mutex<StorageConfig>>,
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
        send_json_response(
            &mut stream,
            "200 OK",
            &json!({
                "ok": true,
                "engine": "openPost-Rust-Native-Core",
                "version": "2.0.2"
            }),
        );
        return;
    }

    // Native Window Control Endpoints (Frameless Titlebar Integration)
    if path_only == "/api/window/drag" {
        if let Some(ref p) = proxy {
            let _ = p.send_event(DesktopCommand::Drag);
        }
        send_json_response(&mut stream, "200 OK", &json!({ "ok": true }));
        return;
    }

    if path_only == "/api/window/minimize" {
        if let Some(ref p) = proxy {
            let _ = p.send_event(DesktopCommand::Minimize);
        }
        send_json_response(&mut stream, "200 OK", &json!({ "ok": true }));
        return;
    }

    if path_only == "/api/window/maximize" {
        if let Some(ref p) = proxy {
            let _ = p.send_event(DesktopCommand::ToggleMaximize);
        }
        send_json_response(&mut stream, "200 OK", &json!({ "ok": true }));
        return;
    }

    if path_only == "/api/window/close" {
        send_json_response(&mut stream, "200 OK", &json!({ "ok": true }));
        if let Some(ref p) = proxy {
            let _ = p.send_event(DesktopCommand::Close);
        } else {
            thread::spawn(|| {
                thread::sleep(Duration::from_millis(80));
                std::process::exit(0);
            });
        }
        return;
    }

    // 1. Real Storage Configuration & Migration API
    if path_only == "/api/storage/config" && method == "GET" {
        let cfg = state.lock().unwrap().clone();
        let dir_path = PathBuf::from(&cfg.storage_dir);
        let _ = fs::create_dir_all(&dir_path);
        let stats = compute_dir_stats(&dir_path);
        send_json_response(
            &mut stream,
            "200 OK",
            &json!({
                "ok": true,
                "displayPath": cfg.storage_dir,
                "config": cfg,
                "stats": stats,
                "suggestedPaths": suggested_os_paths()
            }),
        );
        return;
    }

    if path_only == "/api/storage/config" && method == "POST" {
        let payload: UpdateStorageConfigPayload = match serde_json::from_str(&body_str) {
            Ok(p) => p,
            Err(e) => {
                send_json_response(
                    &mut stream,
                    "400 Bad Request",
                    &json!({ "ok": false, "error": format!("Invalid JSON: {}", e) }),
                );
                return;
            }
        };

        let mut cfg = state.lock().unwrap().clone();
        let old_dir = PathBuf::from(&cfg.storage_dir);
        let target_dir_str = payload
            .storage_dir
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or(&cfg.storage_dir);
        let target_dir = PathBuf::from(target_dir_str);

        let resolved_dir = match ensure_dir_writable(&target_dir) {
            Ok(d) => d,
            Err(err) => {
                send_json_response(
                    &mut stream,
                    "400 Bad Request",
                    &json!({
                        "ok": false,
                        "error": format!("无法创建或写入目标目录 ({})，请检查磁盘权限或盘符。", err)
                    }),
                );
                return;
            }
        };

        let migrate = payload.migrate_existing.unwrap_or(true);
        let clean_old = payload.clean_old_dir.unwrap_or(false);
        let mut migrated_files = 0usize;

        if migrate && resolved_dir != old_dir && old_dir.exists() {
            if let Ok(entries) = fs::read_dir(&old_dir) {
                for entry in entries.flatten() {
                    let src_path = entry.path();
                    if src_path.is_file()
                        && src_path.extension().and_then(|e| e.to_str()) == Some("json")
                    {
                        let dest_path = resolved_dir.join(entry.file_name());
                        if fs::copy(&src_path, &dest_path).is_ok() {
                            migrated_files += 1;
                            if clean_old {
                                let _ = fs::remove_file(&src_path);
                            }
                        }
                    }
                }
            }
        }

        cfg.storage_dir = resolved_dir.to_string_lossy().to_string();
        if let Some(v) = payload.auto_sync_to_disk {
            cfg.auto_sync_to_disk = v;
        }
        if let Some(v) = payload.max_history_items {
            cfg.max_history_items = v.max(10);
        }
        if let Some(v) = payload.request_timeout_ms {
            cfg.request_timeout_ms = v.clamp(1000, 120_000);
        }
        if let Some(v) = payload.verify_ssl {
            cfg.verify_ssl = v;
        }

        save_storage_config(&cfg);
        *state.lock().unwrap() = cfg.clone();

        let stats = compute_dir_stats(&resolved_dir);
        send_json_response(
            &mut stream,
            "200 OK",
            &json!({
                "ok": true,
                "displayPath": cfg.storage_dir,
                "config": cfg,
                "migratedFiles": migrated_files,
                "stats": stats
            }),
        );
        return;
    }

    // 2. Real Disk Workspace Load (`GET /api/storage/workspace`) & Save (`POST /api/storage/sync`)
    if path_only == "/api/storage/workspace" && method == "GET" {
        let cfg = state.lock().unwrap().clone();
        let dir = PathBuf::from(&cfg.storage_dir);
        let read_json_file = |filename: &str| -> Option<Value> {
            let p = dir.join(filename);
            let raw = fs::read_to_string(p).ok()?;
            serde_json::from_str::<Value>(&raw).ok()
        };

        let folders = read_json_file("collections_folders.json");
        let requests = read_json_file("collections_requests.json");
        let environments = read_json_file("environments.json");
        let history = read_json_file("history.json");
        let stats = compute_dir_stats(&dir);

        send_json_response(
            &mut stream,
            "200 OK",
            &json!({
                "ok": true,
                "storageDir": cfg.storage_dir,
                "folders": folders,
                "requests": requests,
                "environments": environments,
                "history": history,
                "stats": stats
            }),
        );
        return;
    }

    if path_only == "/api/storage/sync" && method == "POST" {
        let cfg = state.lock().unwrap().clone();
        let dir = PathBuf::from(&cfg.storage_dir);
        let _ = fs::create_dir_all(&dir);

        if let Ok(val) = serde_json::from_str::<Value>(&body_str) {
            if let Some(folders) = val.get("folders") {
                if let Ok(s) = serde_json::to_string_pretty(folders) {
                    let _ = fs::write(dir.join("collections_folders.json"), s);
                }
            }
            if let Some(requests) = val.get("requests") {
                if let Ok(s) = serde_json::to_string_pretty(requests) {
                    let _ = fs::write(dir.join("collections_requests.json"), s);
                }
            }
            if let Some(environments) = val.get("environments") {
                if let Ok(s) = serde_json::to_string_pretty(environments) {
                    let _ = fs::write(dir.join("environments.json"), s);
                }
            }
            if let Some(history) = val.get("history") {
                if let Ok(s) = serde_json::to_string_pretty(history) {
                    let _ = fs::write(dir.join("history.json"), s);
                }
            }
        }

        let stats = compute_dir_stats(&dir);
        send_json_response(
            &mut stream,
            "200 OK",
            &json!({
                "ok": true,
                "storageDir": cfg.storage_dir,
                "stats": stats
            }),
        );
        return;
    }

    // 3. Real Rust HTTP/HTTPS Proxy Engine (`POST /api/proxy`)
    if path_only == "/api/proxy" && method == "POST" {
        let timeout_ms = state.lock().unwrap().request_timeout_ms;
        let result = execute_rust_http_proxy(&body_str, port, timeout_ms);
        send_json_response(&mut stream, "200 OK", &result);
        return;
    }

    // 4. Serve Embedded Frontend Assets
    let lookup_path = if path_only == "/" {
        "/index.html"
    } else {
        path_only
    };
    for (asset_path, mime, bytes) in EMBEDDED_ASSETS {
        if *asset_path == lookup_path {
            send_http_response(&mut stream, "200 OK", mime, bytes);
            return;
        }
    }

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
    let initial_config = Arc::new(Mutex::new(load_storage_config()));
    let (listener, actual_port) = bind_local_engine();
    let url = format!("http://127.0.0.1:{}", actual_port);

    if env::var("OPENPOST_NO_BROWSER").unwrap_or_default() == "1" {
        for stream in listener.incoming().flatten() {
            let p = actual_port;
            let st = Arc::clone(&initial_config);
            thread::spawn(move || {
                handle_client(stream, p, st, None);
            });
        }
        return;
    }

    let event_loop = EventLoopBuilder::<DesktopCommand>::with_user_event().build();
    let proxy = event_loop.create_proxy();
    let ipc_proxy = event_loop.create_proxy();

    let server_state = Arc::clone(&initial_config);
    thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let p = actual_port;
            let st = Arc::clone(&server_state);
            let proxy_clone = Some(proxy.clone());
            thread::spawn(move || {
                handle_client(stream, p, st, proxy_clone);
            });
        }
    });

    wait_until_server_ready(actual_port);

    // Frameless window (`with_decorations(false)`) just like DBX:
    // No system OS titlebar/status bar at the top; the custom top bar controls drag/minimize/maximize/close directly.
    let window = WindowBuilder::new()
        .with_title("openPost")
        .with_decorations(false)
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
