// SMEazy POS — Tauri 2 desktop shell
// Spawns the embedded smeazy-api backend as a sidecar, then opens the window.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // Database lives in the OS app-data dir so it survives updates
            let data_dir = app.path().app_data_dir().expect("no app data dir");
            std::fs::create_dir_all(&data_dir).ok();
            let db_path = data_dir.join("smeazy.db");

            let sidecar = app
                .shell()
                .sidecar("smeazy-api")
                .expect("smeazy-api sidecar not found — did you copy it into src-tauri/binaries?")
                .env("DATABASE_PATH", db_path.to_string_lossy().to_string())
                .env("PORT", "8000")
                .env("JWT_SECRET", "smeazy-pos-embedded-2a8f4c1e9b7d3f6a5c2e8b4d7f1a3c6e");

            let (mut rx, _child) = sidecar.spawn().expect("failed to start backend");

            // Log backend output into the Tauri console (visible with `tauri dev`)
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    if let CommandEvent::Stdout(line) | CommandEvent::Stderr(line) = event {
                        print!("{}", String::from_utf8_lossy(&line));
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running SMEazy POS");
}
