fn main() {
    // Debug: print OUT_DIR to understand the path
    let out_dir = std::env::var("OUT_DIR").unwrap_or_default();
    println!("cargo:warning=OUT_DIR={}", out_dir);

    // Tauri reads $OUT_DIR/app-manifest/__app__-permission-files before writing
    // it on a fresh build, causing "failed to parse JSON" (0-byte file).
    // Pre-seed it with an empty JSON array so the read always succeeds.
    if !out_dir.is_empty() {
        let perm_file = std::path::Path::new(&out_dir)
            .join("app-manifest")
            .join("__app__-permission-files");
        println!("cargo:warning=perm_file={}", perm_file.display());
        if let Some(parent) = perm_file.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if !perm_file.exists() || std::fs::metadata(&perm_file).map(|m| m.len()).unwrap_or(1) == 0 {
            let _ = std::fs::write(&perm_file, b"[]");
            println!("cargo:warning=wrote [] to perm_file");
        } else {
            println!("cargo:warning=perm_file already has {} bytes", std::fs::metadata(&perm_file).map(|m| m.len()).unwrap_or(0));
        }
    }
    tauri_build::build()
}
