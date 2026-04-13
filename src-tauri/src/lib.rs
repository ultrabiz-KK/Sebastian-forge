use std::path::Path;

use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Key, Nonce,
};
use aws_config::BehaviorVersion;
use aws_sdk_s3::{
    config::{Credentials, Region},
    primitives::ByteStream,
    Client as S3Client,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use pbkdf2::pbkdf2_hmac;
use rand::RngCore;
use serde::Deserialize;
use sha2::Sha256;

fn validate_path(path: &str) -> Result<(), String> {
    let p = Path::new(path);
    for component in p.components() {
        if matches!(component, std::path::Component::ParentDir) {
            return Err("Access denied".to_string());
        }
    }
    Ok(())
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    validate_path(&path)?;
    use std::fs;
    use std::path::Path;
    let p = Path::new(&path);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(p, content.as_bytes()).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    validate_path(&path)?;
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_db_path(app: tauri::AppHandle) -> Result<String, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.join("sebastian.db").to_string_lossy().into_owned())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn copy_file(src: String, dest: String) -> Result<(), String> {
    validate_path(&src)?;
    validate_path(&dest)?;
    use std::fs;
    let dest_path = Path::new(&dest);
    if let Some(parent) = dest_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::copy(&src, dest_path)
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn file_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

#[tauri::command]
fn hash_password(password: String) -> Result<String, String> {
    // コスト係数12はセキュリティと速度のバランスとして推奨値
    bcrypt::hash(&password, 12).map_err(|e| e.to_string())
}

#[tauri::command]
fn verify_password(password: String, hash: String) -> Result<bool, String> {
    bcrypt::verify(&password, &hash).map_err(|e| e.to_string())
}

#[tauri::command]
fn encrypt_value(plaintext: String, password: String) -> Result<String, String> {
    let mut salt = [0u8; 16];
    let mut iv = [0u8; 12];
    // 毎回ランダムなソルト・IVを生成することで同じ入力でも異なる暗号文になる
    rand::thread_rng().fill_bytes(&mut salt);
    rand::thread_rng().fill_bytes(&mut iv);

    let mut key_bytes = [0u8; 32];
    // OWASP 2023推奨: PBKDF2-SHA256は最低210,000回
    pbkdf2_hmac::<Sha256>(password.as_bytes(), &salt, 210_000, &mut key_bytes);

    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);
    let nonce = Nonce::from_slice(&iv);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| e.to_string())?;

    // フォーマット: salt(16) || iv(12) || ciphertext → Base64
    let mut combined = Vec::with_capacity(16 + 12 + ciphertext.len());
    combined.extend_from_slice(&salt);
    combined.extend_from_slice(&iv);
    combined.extend_from_slice(&ciphertext);

    Ok(STANDARD.encode(&combined))
}

#[tauri::command]
fn decrypt_value(ciphertext: String, password: String) -> Result<String, String> {
    let combined = STANDARD.decode(&ciphertext).map_err(|e| e.to_string())?;

    if combined.len() < 16 + 12 + 1 {
        return Err("暗号文のフォーマットが不正です".to_string());
    }

    let salt = &combined[..16];
    let iv = &combined[16..28];
    let enc_bytes = &combined[28..];

    let mut key_bytes = [0u8; 32];
    // OWASP 2023推奨: PBKDF2-SHA256は最低210,000回
    pbkdf2_hmac::<Sha256>(password.as_bytes(), salt, 210_000, &mut key_bytes);

    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);
    let nonce = Nonce::from_slice(iv);

    // 認証タグ検証失敗（パスワード誤り含む）は詳細を漏らさないメッセージにする
    let plaintext_bytes = cipher
        .decrypt(nonce, enc_bytes)
        .map_err(|_| "復号に失敗しました".to_string())?;

    String::from_utf8(plaintext_bytes).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_file_mtime(path: String) -> Option<u64> {
    use std::time::UNIX_EPOCH;
    std::fs::metadata(&path)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
}

#[derive(Deserialize)]
struct S3Config {
    endpoint: String,
    region: String,
    bucket: String,
    access_key: String,
    secret_key: String,
    prefix: String,
}

async fn build_s3_client(config: &S3Config) -> S3Client {
    let creds = Credentials::new(
        &config.access_key,
        &config.secret_key,
        None,
        None,
        "sebastian",
    );
    let aws_cfg = aws_config::defaults(BehaviorVersion::latest())
        .endpoint_url(&config.endpoint)
        .region(Region::new(config.region.clone()))
        .credentials_provider(creds)
        .load()
        .await;
    S3Client::new(&aws_cfg)
}

#[tauri::command]
async fn s3_upload_file(config: S3Config, local_path: String, s3_key: String) -> Result<(), String> {
    validate_path(&local_path)?;
    let client = build_s3_client(&config).await;
    let body = ByteStream::from_path(&local_path).await.map_err(|e| e.to_string())?;
    let key = format!("{}{}", config.prefix, s3_key);
    client
        .put_object()
        .bucket(&config.bucket)
        .key(&key)
        .body(body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn s3_download_file(config: S3Config, s3_key: String, local_path: String) -> Result<(), String> {
    validate_path(&local_path)?;
    let client = build_s3_client(&config).await;
    let key = format!("{}{}", config.prefix, s3_key);
    let output = client
        .get_object()
        .bucket(&config.bucket)
        .key(&key)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let bytes = output.body.collect().await.map_err(|e| e.to_string())?.into_bytes();
    let dest = Path::new(&local_path);
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(dest, bytes).map_err(|e| e.to_string())
}

#[tauri::command]
async fn s3_get_object_mtime(config: S3Config, s3_key: String) -> Result<i64, String> {
    let client = build_s3_client(&config).await;
    let key = format!("{}{}", config.prefix, s3_key);
    let output = client
        .head_object()
        .bucket(&config.bucket)
        .key(&key)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let last_modified = output
        .last_modified()
        .ok_or_else(|| "LastModified not available".to_string())?;
    Ok(last_modified.secs())
}

#[tauri::command]
async fn s3_test_connection(config: S3Config) -> Result<(), String> {
    let client = build_s3_client(&config).await;
    client
        .list_objects_v2()
        .bucket(&config.bucket)
        .max_keys(1)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_initial_tables",
            sql: "
            CREATE TABLE IF NOT EXISTS daily_memos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL UNIQUE,
                content TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT,
                status TEXT NOT NULL DEFAULT 'todo',
                priority TEXT DEFAULT 'none',
                due_date TEXT,
                category TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS task_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER NOT NULL,
                action_type TEXT NOT NULL,
                before_json TEXT,
                after_json TEXT,
                actor_type TEXT NOT NULL,
                source_type TEXT,
                source_id TEXT,
                suggestion_group_id TEXT,
                applied_by TEXT,
                note TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS reports_daily (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL UNIQUE,
                content TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS reports_weekly (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                week_start_date TEXT NOT NULL UNIQUE,
                content TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add_archived_to_tasks",
            sql: "ALTER TABLE tasks ADD COLUMN archived INTEGER DEFAULT 0;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add_pinned_to_tasks",
            sql: "ALTER TABLE tasks ADD COLUMN pinned INTEGER DEFAULT 0;",
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:sebastian.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            setup_tray(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            write_text_file,
            read_text_file,
            get_db_path,
            copy_file,
            file_exists,
            get_file_mtime,
            hash_password,
            verify_password,
            encrypt_value,
            decrypt_value,
            s3_upload_file,
            s3_download_file,
            s3_get_object_mtime,
            s3_test_connection
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn setup_tray(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

    let show_item = MenuItem::with_id(app, "show", "Sebastianを開く", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "終了", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

    TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .tooltip("Sebastian - AI Work Supporter")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}
