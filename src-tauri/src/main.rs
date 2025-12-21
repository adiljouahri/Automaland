
// @ts-nocheck
// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, RunEvent};
use rusqlite::{params, Connection as DbConnection};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::{CommandEvent, CommandChild};
use std::env;
use std::sync::Mutex;

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
    ownerId: Option<i64>
}

// State to hold the child process handle
struct SidecarState {
    child: Mutex<Option<CommandChild>>,
}

// Initialize the SQLite database
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
            ownerId INTEGER
        )",
        [],
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}

// Save a flow to SQLite
#[tauri::command]
fn save_local_flow(app_handle: tauri::AppHandle, flow: String) -> Result<String, String> {
    let f: Flow = serde_json::from_str(&flow).map_err(|e| e.to_string())?;
    
    let app_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_dir.join("flows.db");
    let save_conn = DbConnection::open(db_path).map_err(|e| e.to_string())?;

    save_conn.execute(
        "INSERT OR REPLACE INTO flows (flowId, id, name, uiSchema, nodeCode, adobeCode, targetApp, chatHistory, createdAt, isPublic, ownerId)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
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
            f.ownerId
        ],
    ).map_err(|e| e.to_string())?;

    Ok("Saved".to_string())
}

// Retrieve all local flows
#[tauri::command]
fn get_local_flows(app_handle: tauri::AppHandle) -> Result<String, String> {
    let app_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_dir.join("flows.db");
    
    if !db_path.exists() {
        return Ok("[]".to_string());
    }
    
    let read_conn = DbConnection::open(db_path).map_err(|e| e.to_string())?;
    let mut stmt = read_conn.prepare("SELECT flowId, id, name, uiSchema, nodeCode, adobeCode, targetApp, chatHistory, createdAt, isPublic, ownerId FROM flows").map_err(|e| e.to_string())?;
    
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
        })
    }).map_err(|e| e.to_string())?;

    let flows: Vec<Flow> = flow_iter.filter_map(|f| f.ok()).collect();
    
    serde_json::to_string(&flows).map_err(|e| e.to_string())
}

// Delete a local flow
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

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Initialize State to hold the sidecar process
            app.manage(SidecarState {
                child: Mutex::new(None),
            });

            // Locate the resource directory
            let resource_path = app.path().resource_dir().expect("Failed to find resource dir");
            
            // Resolve the location of the current executable (target/debug/app or target/release/app)
            let exe_path = env::current_exe().ok();
            let exe_dir = exe_path.as_ref().and_then(|p| p.parent());

            // Check potential locations for the bundled server file (.cjs extension)
            let possible_paths = vec![
                // 1. Next to the executable (This is where we copy it for Dev mode)
                exe_dir.map(|p| p.join("server-sidecar.cjs")).unwrap_or(PathBuf::from("non_existent")),
                
                // 2. In the resources directory (Standard Tauri bundling)
                resource_path.join("server-sidecar.cjs"),
                
                // 3. Fallback structures
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
            
            println!("[Main] Launching Node Sidecar...");

            if found {
                 let server_script_str = server_script.to_string_lossy().to_string();
                 println!("[Main] Found bundled script at: {}", server_script_str);
                 
                 // Spawn 'node' with the script path as an argument
                 match app.shell().command("node").args(&[server_script_str]).spawn() {
                    Ok((mut rx, child)) => {
                        // Store the child process handle
                        let state = app.state::<SidecarState>();
                        *state.child.lock().unwrap() = Some(child);

                        tauri::async_runtime::spawn(async move {
                            while let Some(event) = rx.recv().await {
                                match event {
                                    CommandEvent::Stdout(line) => {
                                        println!("[Node Sidecar] {}", String::from_utf8_lossy(&line));
                                    }
                                    CommandEvent::Stderr(line) => {
                                        eprintln!("[Node Sidecar Error] {}", String::from_utf8_lossy(&line));
                                    }
                                    _ => {
                                        // Ignore other events
                                    }
                                }
                            }
                        });
                        println!("[Main] Node.js sidecar started successfully.");
                    }
                    Err(e) => {
                        eprintln!("[Main Error] Failed to spawn node process: {}", e);
                    }
                }
            } else {
                // Last resort dev mode fallback: look in the source directory
                println!("[Main] Bundled script not found. Attempting Source Mode path...");
                if let Ok(cwd) = env::current_dir() {
                     let dev_path = cwd.join("server").join("index.js");
                     if dev_path.exists() {
                          let dev_path_str = dev_path.to_string_lossy().to_string();
                          println!("[Main] Found source script at: {}", dev_path_str);
                          
                          // Also store child for dev mode if possible
                          match app.shell().command("node").args(&[dev_path_str]).spawn() {
                             Ok((_rx, child)) => {
                                 let state = app.state::<SidecarState>();
                                 *state.child.lock().unwrap() = Some(child);
                                 println!("[Main] Source mode sidecar started.");
                             }
                             Err(e) => eprintln!("[Main Error] Failed to spawn source node: {}", e),
                          }
                     } else {
                        eprintln!("[Main Error] Could not find server script in resources, target dir, or source path.");
                     }
                }
            }
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![init_db, save_local_flow, get_local_flows, delete_local_flow])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        match event {
            RunEvent::Exit => {
                // When the app exits, kill the sidecar process
                let state = app_handle.state::<SidecarState>();
                let mut child_guard = state.child.lock().unwrap();
                if let Some(child) = child_guard.take() {
                    println!("[Main] Killing Node.js sidecar...");
                    if let Err(e) = child.kill() {
                        eprintln!("[Main] Failed to kill sidecar: {}", e);
                    } else {
                        println!("[Main] Sidecar killed.");
                    }
                }
            }
            _ => {}
        }
    });
}
