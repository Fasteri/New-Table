use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;
use std::process::Command;

fn db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  let dir = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("APP_DATA_DIR_FAILED: {e}"))?;
  Ok(dir.join("data").join("db.json"))
}

fn ensure_parent_dir(file_path: &PathBuf) -> Result<(), String> {
  if let Some(parent) = file_path.parent() {
    fs::create_dir_all(parent).map_err(|e| format!("DB_DIR_CREATE_FAILED: {e}"))?;
  }
  Ok(())
}

fn default_db() -> Value {
  json!({ "people": [], "tasks": [] })
}

fn is_valid_db_shape(db: &Value) -> bool {
  db.get("people").map(|v| v.is_array()).unwrap_or(false)
    && db.get("tasks").map(|v| v.is_array()).unwrap_or(false)
}

fn read_db(app: &tauri::AppHandle) -> Result<Value, String> {
  let file_path = db_path(app)?;
  if !file_path.exists() {
    return Ok(default_db());
  }
  let mut raw =
    fs::read_to_string(&file_path).map_err(|e| format!("DB_READ_FAILED: {e}"))?;
  if raw.trim().is_empty() {
    return Ok(default_db());
  }
  if let Some(stripped) = raw.strip_prefix('\u{feff}') {
    raw = stripped.to_string();
  }
  serde_json::from_str(&raw).map_err(|e| format!("DB_PARSE_FAILED: {e}"))
}

fn write_db(app: &tauri::AppHandle, db: &Value) -> Result<(), String> {
  if !is_valid_db_shape(db) {
    return Err("DB_INVALID_SHAPE".to_string());
  }
  let file_path = db_path(app)?;
  ensure_parent_dir(&file_path)?;
  let body = serde_json::to_string_pretty(db).map_err(|e| format!("DB_SERIALIZE_FAILED: {e}"))?;
  fs::write(&file_path, body).map_err(|e| format!("DB_WRITE_FAILED: {e}"))
}

#[tauri::command]
fn open_data_dir(app: tauri::AppHandle) -> Result<Value, String> {
  let dir = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("APP_DATA_DIR_FAILED: {e}"))?;
  fs::create_dir_all(&dir).map_err(|e| format!("DB_DIR_CREATE_FAILED: {e}"))?;
  let dir_str = dir.to_string_lossy().to_string();

  let output = if cfg!(target_os = "windows") {
    Command::new("explorer").arg(&dir_str).output()
  } else if cfg!(target_os = "macos") {
    Command::new("open")
      .arg("-a")
      .arg("Finder")
      .arg(&dir_str)
      .output()
  } else {
    Command::new("xdg-open").arg(&dir_str).output()
  }
  .map_err(|e| format!("OPEN_DIR_FAILED: {e}"))?;

  if !output.status.success() {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let code = output.status.code().unwrap_or(-1);
    return Err(format!(
      "OPEN_DIR_FAILED: exit {code} {stderr}"
    ));
  }
  Ok(json!({ "ok": true, "path": dir.to_string_lossy() }))
}

fn normalize_name(s: &str) -> String {
  s.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn extract_person_number(id: &str) -> Option<u32> {
  let rest = id.strip_prefix("p_")?;
  rest.parse::<u32>().ok()
}

fn next_person_id(people: &[Value]) -> String {
  let mut max = 0_u32;
  for p in people {
    if let Some(id) = p.get("id").and_then(|v| v.as_str()) {
      if let Some(n) = extract_person_number(id) {
        if n > max {
          max = n;
        }
      }
    }
  }
  format!("p_{:03}", max + 1)
}

#[tauri::command]
fn get_db(app: tauri::AppHandle) -> Result<Value, String> {
  let db = read_db(&app)?;
  if !is_valid_db_shape(&db) {
    return Err("DB_INVALID_SHAPE".to_string());
  }
  Ok(db)
}

#[tauri::command]
fn put_db(app: tauri::AppHandle, db: Value) -> Result<Value, String> {
  write_db(&app, &db)?;
  Ok(json!({ "ok": true }))
}

#[tauri::command]
fn create_person(app: tauri::AppHandle, person: Value) -> Result<Value, String> {
  let name_raw = person
    .get("name")
    .and_then(|v| v.as_str())
    .unwrap_or("");
  let name = normalize_name(name_raw);
  if name.is_empty() {
    return Err("NAME_REQUIRED".to_string());
  }

  let mut db = read_db(&app)?;
  if !is_valid_db_shape(&db) {
    return Err("DB_INVALID_SHAPE".to_string());
  }

  let people = db
    .get_mut("people")
    .and_then(|v| v.as_array_mut())
    .ok_or_else(|| "DB_INVALID_SHAPE".to_string())?;

  let exists = people.iter().any(|p| {
    p.get("name")
      .and_then(|v| v.as_str())
      .map(|n| normalize_name(n).to_lowercase() == name.to_lowercase())
      .unwrap_or(false)
  });
  if exists {
    return Err("DUPLICATE_NAME".to_string());
  }

  let gender = match person.get("gender").and_then(|v| v.as_str()) {
    Some("Ж") => "Ж",
    _ => "М",
  };
  let group_number = person
    .get("groupNumber")
    .and_then(|v| v.as_u64())
    .unwrap_or(1);
  let study_status = match person.get("studyStatus").and_then(|v| v.as_str()) {
    Some("Да") => "Да",
    _ => "Нет",
  };
  let impromptu_status =
    match person.get("impromptuStatus").and_then(|v| v.as_str()) {
      Some("Да") => "Да",
      _ => "Нет",
    };
  let limitations_status =
    match person.get("limitationsStatus").and_then(|v| v.as_str()) {
      Some("Да") => "Да",
      _ => "Нет",
    };
  let participation_status =
    match person.get("participationStatus").and_then(|v| v.as_str()) {
      Some("Да") => "Да",
      _ => "Нет",
    };
  let notes = person
    .get("notes")
    .and_then(|v| v.as_str())
    .unwrap_or("");

  let new_person = json!({
    "id": next_person_id(people),
    "name": name,
    "gender": gender,
    "groupNumber": group_number,
    "studyStatus": study_status,
    "impromptuStatus": impromptu_status,
    "limitationsStatus": limitations_status,
    "participationStatus": participation_status,
    "notes": notes,
  });

  people.push(new_person.clone());
  write_db(&app, &db)?;

  Ok(new_person)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .plugin(tauri_plugin_shell::init())
    .invoke_handler(tauri::generate_handler![
      get_db,
      put_db,
      create_person,
      open_data_dir
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
