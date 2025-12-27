
// @ts-nocheck
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, RunEvent, State};
use rusqlite::{params, Connection as DbConnection};
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::path::PathBuf;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::{CommandEvent, CommandChild};
use std::env;
use std::sync::Mutex;
use std::io::Write;

#[derive(Serialize, Deserialize, Debug)]
struct Flow {
    id: String,
    flowId: String,
    name: String,
    uiSchema: String,
    nodeCode: String,
    adobeCode: String,
    targetApp: String,
    chatHistory: String,
    createdAt: i64,
    isPublic: bool,
    ownerId: Option<i64>,
    savedFormData: Option<String>,
    history: Option<String>
}

struct SidecarState {
    child: Mutex<Option<CommandChild>>,
}

// Helper to append to tauri specific log
fn log_to_file(app_handle: &tauri::AppHandle, message: &str) {
    if let Ok(app_dir) = app_handle.path().app_data_dir() {
        let log_dir = app_dir.join("logs");
        if !log_dir.exists() {
             let _ = fs::create_dir_all(&log_dir);
        }
        let log_path = log_dir.join("tauri.log");
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(log_path) {
            let _ = writeln!(file, "[{}] {}", chrono::Local::now().format("%Y-%m-%d %H:%M:%S"), message);
        }
    }
}

#[tauri::command]
fn init_db(app_handle: tauri::AppHandle) -> Result<(), String> {
    let app_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    }
    
    let db_path = app_dir.join("flows.db");
    let db_conn = DbConnection::open(db_path).map_err(|e| e.to_string())?;
    
    db_conn.execute(
        "CREATE TABLE IF NOT EXISTS flows (
            flowId TEXT PRIMARY KEY,
            id TEXT,
            name TEXT,
            uiSchema TEXT,
            nodeCode TEXT,
            adobeCode TEXT,
            targetApp TEXT,
            chatHistory TEXT,
            createdAt INTEGER,
            isPublic INTEGER,
            ownerId INTEGER,
            savedFormData TEXT,
            history TEXT
        )",
        [],
    ).map_err(|e| e.to_string())?;

    // Migration: Attempt to add columns if they don't exist (safe to run multiple times)
    let _ = db_conn.execute("ALTER TABLE flows ADD COLUMN savedFormData TEXT", []);
    let _ = db_conn.execute("ALTER TABLE flows ADD COLUMN history TEXT", []);
    
    Ok(())
}

#[tauri::command]
fn save_local_flow(app_handle: tauri::AppHandle, flow: String) -> Result<String, String> {
    let f: Flow = serde_json::from_str(&flow).map_err(|e| e.to_string())?;
    
    let app_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_dir.join("flows.db");
    let save_conn = DbConnection::open(db_path).map_err(|e| e.to_string())?;

    save_conn.execute(
        "INSERT OR REPLACE INTO flows (flowId, id, name, uiSchema, nodeCode, adobeCode, targetApp, chatHistory, createdAt, isPublic, ownerId, savedFormData, history)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        params![
            f.flowId, 
            f.id, 
            f.name, 
            f.uiSchema, 
            f.nodeCode, 
            f.adobeCode, 
            f.targetApp, 
            f.chatHistory, 
            f.createdAt, 
            if f.isPublic { 1 } else { 0 },
            f.ownerId,
            f.savedFormData,
            f.history
        ],
    ).map_err(|e| e.to_string())?;

    Ok("Saved".to_string())
}

#[tauri::command]
fn get_local_flows(app_handle: tauri::AppHandle) -> Result<String, String> {
    let app_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_dir.join("flows.db");
    
    if !db_path.exists() {
        return Ok("[]".to_string());
    }
    
    let read_conn = DbConnection::open(db_path).map_err(|e| e.to_string())?;
    
    let mut stmt = read_conn.prepare("SELECT flowId, id, name, uiSchema, nodeCode, adobeCode, targetApp, chatHistory, createdAt, isPublic, ownerId, savedFormData, history FROM flows").map_err(|e| e.to_string())?;
    
    let flow_iter = stmt.query_map([], |row| {
        Ok(Flow {
            flowId: row.get(0)?,
            id: row.get(1)?,
            name: row.get(2)?,
            uiSchema: row.get(3)?,
            nodeCode: row.get(4)?,
            adobeCode: row.get(5)?,
            targetApp: row.get(6)?,
            chatHistory: row.get(7)?,
            createdAt: row.get(8)?,
            isPublic: row.get::<_, i32>(9)? == 1,
            ownerId: row.get(10)?,
            savedFormData: row.get(11).ok(),
            history: row.get(12).ok()
        })
    }).map_err(|e| e.to_string())?;

    let flows: Vec<Flow> = flow_iter.filter_map(|f| f.ok()).collect();
    
    serde_json::to_string(&flows).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_local_flow(app_handle: tauri::AppHandle, flow_id: String) -> Result<(), String> {
    let app_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_dir.join("flows.db");
    let delete_conn = DbConnection::open(db_path).map_err(|e| e.to_string())?;
    
    delete_conn.execute(
        "DELETE FROM flows WHERE flowId = ?1",
        params![flow_id],
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
fn get_server_config(app_handle: tauri::AppHandle) -> Result<String, String> {
    let home_dir = app_handle.path().home_dir().map_err(|e| e.to_string())?;
    let config_path = home_dir.join(".tripanel").join("server.json");
    
    if config_path.exists() {
        let content = fs::read_to_string(config_path).map_err(|e| e.to_string())?;
        return Ok(content);
    }
    Ok("{}".to_string())
}

#[tauri::command]
fn save_text_file(path: String, content: String) -> Result<(), String> {
    fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_log_paths(app_handle: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let home_dir = app_handle.path().home_dir().map_err(|e| e.to_string())?;
    let server_log = home_dir.join(".tripanel").join("logs").join("server.log");
    
    // Adobe scripts usually log to My Documents/{app_name}/log.log based on our logger.jsx
    let docs_dir = app_handle.path().document_dir().map_err(|e| e.to_string())?;
    let adobe_log = docs_dir.join("triPaneltApp").join("log.log");
    
    // Tauri log
    let app_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let tauri_log = app_dir.join("logs").join("tauri.log");

    Ok(serde_json::json!({
        "serverLog": server_log.to_string_lossy(),
        "adobeLog": adobe_log.to_string_lossy(),
        "tauriLog": tauri_log.to_string_lossy()
    }))
}

// Spawns the sidecar and updates state
fn spawn_sidecar_process(app: &tauri::AppHandle) {
    let resource_path = app.path().resource_dir().expect("Failed to find resource dir");
    let exe_path = env::current_exe().ok();
    let exe_dir = exe_path.as_ref().and_then(|p| p.parent());

    let possible_paths = vec![
        exe_dir.map(|p| p.join("server-sidecar.cjs")).unwrap_or(PathBuf::from("non_existent")),
        resource_path.join("server-sidecar.cjs"),
        resource_path.join("dist").join("server-sidecar.cjs"),
        resource_path.join("server").join("dist").join("server-sidecar.cjs")
    ];
    
    let mut server_script = PathBuf::new();
    let mut found = false;

    for p in possible_paths {
        if p.exists() {
            server_script = p;
            found = true;
            break;
        }
    }
    
    let shell = app.shell();
    let command = if found {
        let server_script_str = server_script.to_string_lossy().to_string();
        log_to_file(app, &format!("Spawning production sidecar: {}", server_script_str));
        shell.command("node").args(&[server_script_str])
    } else {
        // Dev fallback
        if let Ok(cwd) = env::current_dir() {
             let dev_path = cwd.join("server").join("index.js");
             if dev_path.exists() {
                  let dev_path_str = dev_path.to_string_lossy().to_string();
                  log_to_file(app, &format!("Spawning dev sidecar: {}", dev_path_str));
                  shell.command("node").args(&[dev_path_str])
             } else {
                 log_to_file(app, "Could not find server script.");
                 return;
             }
        } else {
            return;
        }
    };

    match command.spawn() {
        Ok((mut rx, child)) => {
            log_to_file(app, "Sidecar spawned successfully.");
            let state = app.state::<SidecarState>();
            *state.child.lock().unwrap() = Some(child);
            
            let app_clone = app.clone();
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                             // Optional: Only log startup messages to tauri log to avoid spam
                             let msg = String::from_utf8_lossy(&line);
                             if msg.contains("Sidecar running") {
                                log_to_file(&app_clone, &format!("[Sidecar] {}", msg));
                             }
                             println!("[Node Sidecar] {}", msg);
                        }
                        CommandEvent::Stderr(line) => {
                             let msg = String::from_utf8_lossy(&line);
                             log_to_file(&app_clone, &format!("[Sidecar Error] {}", msg));
                             eprintln!("[Node Sidecar Error] {}", msg);
                        }
                        _ => {}
                    }
                }
            });
        }
        Err(e) => {
            log_to_file(app, &format!("Failed to spawn sidecar: {}", e));
            eprintln!("[Main Error] Failed to spawn node process: {}", e)
        },
    }
}

#[tauri::command]
fn restart_sidecar(app_handle: tauri::AppHandle, state: State<SidecarState>) -> Result<(), String> {
    log_to_file(&app_handle, "Restarting sidecar requested...");
    
    let mut child_guard = state.child.lock().unwrap();
    if let Some(child) = child_guard.take() {
        let _ = child.kill();
        log_to_file(&app_handle, "Killed existing sidecar.");
    }
    
    // Release lock before spawning to avoid deadlock if spawn needs it (it generally doesn't, but safe practice)
    drop(child_guard);
    
    spawn_sidecar_process(&app_handle);
    Ok(())
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            app.manage(SidecarState {
                child: Mutex::new(None),
            });
            
            spawn_sidecar_process(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            init_db, 
            save_local_flow, 
            get_local_flows, 
            delete_local_flow, 
            get_server_config,
            save_text_file,
            restart_sidecar,
            get_log_paths
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        match event {
            RunEvent::Exit => {
                let state = app_handle.state::<SidecarState>();
                let mut child_guard = state.child.lock().unwrap();
                if let Some(child) = child_guard.take() {
                    let _ = child.kill();
                }
            }
            _ => {}
        }
    });
}
