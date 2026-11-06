use std::env;
use std::fs;
use std::path::{Path, PathBuf};

fn collect_files(base: &Path, current: &Path, out: &mut Vec<(String, PathBuf)>) {
    if let Ok(entries) = fs::read_dir(current) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                collect_files(base, &path, out);
            } else if path.is_file() {
                if let Ok(rel) = path.strip_prefix(base) {
                    let web_path = format!(
                        "/{}",
                        rel.to_string_lossy().replace('\\', "/")
                    );
                    out.push((web_path, path));
                }
            }
        }
    }
}

fn guess_mime(path: &str) -> &'static str {
    if path.ends_with(".html") {
        "text/html; charset=utf-8"
    } else if path.ends_with(".css") {
        "text/css; charset=utf-8"
    } else if path.ends_with(".js") || path.ends_with(".mjs") {
        "application/javascript; charset=utf-8"
    } else if path.ends_with(".json") {
        "application/json; charset=utf-8"
    } else if path.ends_with(".svg") {
        "image/svg+xml"
    } else if path.ends_with(".png") {
        "image/png"
    } else if path.ends_with(".ico") {
        "image/x-icon"
    } else {
        "application/octet-stream"
    }
}

fn main() {
    if env::var("CARGO_CFG_TARGET_OS").unwrap_or_default() == "windows" {
        for lib in [
            "advapi32",
            "user32",
            "shell32",
            "ole32",
            "oleaut32",
            "shlwapi",
            "version",
            "gdi32",
        ] {
            println!("cargo:rustc-link-lib={}", lib);
        }
    }

    let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap();
    let dist_dir = Path::new(&manifest_dir).join("../dist");
    println!("cargo:rerun-if-changed=../dist");

    let out_dir = env::var("OUT_DIR").unwrap();
    let dest_path = Path::new(&out_dir).join("embedded_assets.rs");

    let mut files = Vec::new();
    if dist_dir.exists() {
        collect_files(&dist_dir, &dist_dir, &mut files);
    }

    let mut code = String::from("pub static EMBEDDED_ASSETS: &[(&str, &str, &[u8])] = &[\n");
    for (web_path, fs_path) in files {
        let abs = fs::canonicalize(&fs_path).unwrap_or(fs_path);
        let abs_str = abs.to_string_lossy().replace('\\', "/");
        let mime = guess_mime(&web_path);
        code.push_str(&format!(
            "    ({:?}, {:?}, include_bytes!({:?})),\n",
            web_path, mime, abs_str
        ));
    }
    code.push_str("];\n");

    fs::write(dest_path, code).unwrap();
}
