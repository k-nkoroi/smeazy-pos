// SMEazy POS — Tauri 2 desktop shell
// Spawns the embedded smeazy-api backend as a sidecar, then opens the window.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_updater::UpdaterExt;

#[derive(serde::Serialize)]
struct UpdateInfo {
    available: bool,
    current_version: String,
    latest_version: Option<String>,
    notes: Option<String>,
}

/// Builds a GitHub Releases update-manifest URL from an admin-supplied owner/repo,
/// with strict character validation — this is the only place a runtime value is
/// allowed to influence the (otherwise build-time-fixed) update endpoint, and the
/// cryptographic signature check still applies regardless of which repo is checked.
fn build_endpoint(owner: &str, repo: &str) -> Result<url::Url, String> {
    let valid = |s: &str| !s.is_empty() && s.len() <= 100
        && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.');
    if !valid(owner) || !valid(repo) {
        return Err("Repository owner/name may only contain letters, numbers, '-', '_', '.'".into());
    }
    format!("https://github.com/{owner}/{repo}/releases/latest/download/latest.json")
        .parse()
        .map_err(|_| "Could not build a valid update URL".to_string())
}

/// Check whether a newer signed release exists for the configured repo.
/// Does not download or install anything.
#[tauri::command]
async fn check_for_update(app: tauri::AppHandle, owner: String, repo: String) -> Result<UpdateInfo, String> {
    let endpoint = build_endpoint(&owner, &repo)?;
    let current_version = app.package_info().version.to_string();
    let updater = app.updater_builder().endpoints(vec![endpoint]).map_err(|e| e.to_string())?
        .build().map_err(|e| e.to_string())?;
    match updater.check().await {
        Ok(Some(update)) => Ok(UpdateInfo {
            available: true, current_version,
            latest_version: Some(update.version.clone()),
            notes: update.body.clone(),
        }),
        Ok(None) => Ok(UpdateInfo { available: false, current_version, latest_version: None, notes: None }),
        Err(e) => Err(e.to_string()),
    }
}

/// Download and install the update, then the caller (frontend) triggers a relaunch.
/// The local SQLite database lives in the OS app-data directory, entirely outside
/// the install directory this replaces, so it is untouched by an update.
#[tauri::command]
async fn install_update(app: tauri::AppHandle, owner: String, repo: String) -> Result<(), String> {
    let endpoint = build_endpoint(&owner, &repo)?;
    let updater = app.updater_builder().endpoints(vec![endpoint]).map_err(|e| e.to_string())?
        .build().map_err(|e| e.to_string())?;
    let Some(update) = updater.check().await.map_err(|e| e.to_string())? else {
        return Err("No update available".to_string());
    };
    update.download_and_install(|_chunk_len, _total| {}, || {}).await.map_err(|e| e.to_string())?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![check_for_update, install_update])
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
