use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::path::PathBuf;
use tauri::Manager;
mod dashboard;
mod security;

fn database_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("souk-al-dannyeh.sqlite3"))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredState {
    revision: i64,
    state_json: String,
}

#[tauri::command]
fn initialize_database(app: tauri::AppHandle) -> Result<String, String> {
    let path = database_path(&app)?;
    let connection = Connection::open(&path).map_err(|e| e.to_string())?;
    connection
        .execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA trusted_schema = OFF; PRAGMA secure_delete = ON;")
        .map_err(|e| e.to_string())?;
    connection
        .execute_batch(include_str!("../migrations/001_initial.sql"))
        .map_err(|e| e.to_string())?;
    connection.execute_batch("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);").map_err(|e| e.to_string())?;
    let batch_migration_applied = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = 2)",
            [],
            |row| row.get::<_, bool>(0),
        )
        .map_err(|e| e.to_string())?;
    if !batch_migration_applied {
        connection
            .execute_batch(include_str!("../migrations/002_batches_and_expiry.sql"))
            .map_err(|e| e.to_string())?;
    }
    let batch_operations_applied = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = 3)",
            [],
            |row| row.get::<_, bool>(0),
        )
        .map_err(|e| e.to_string())?;
    if !batch_operations_applied {
        connection
            .execute_batch(include_str!("../migrations/003_batch_operations.sql"))
            .map_err(|e| e.to_string())?;
    }
    let batch_receipts_applied = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = 4)",
            [],
            |row| row.get::<_, bool>(0),
        )
        .map_err(|e| e.to_string())?;
    if !batch_receipts_applied {
        connection
            .execute_batch(include_str!("../migrations/004_batch_receipts.sql"))
            .map_err(|e| e.to_string())?;
    }
    let local_state_applied = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = 5)",
            [],
            |row| row.get::<_, bool>(0),
        )
        .map_err(|e| e.to_string())?;
    if !local_state_applied {
        connection
            .execute_batch(include_str!("../migrations/005_local_state.sql"))
            .map_err(|e| e.to_string())?;
    }
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
fn load_app_state(app: tauri::AppHandle) -> Result<Option<StoredState>, String> {
    let connection = Connection::open(database_path(&app)?).map_err(|e| e.to_string())?;
    connection
        .query_row(
            "SELECT revision, state_json FROM app_state WHERE id = 1",
            [],
            |row| {
                Ok(StoredState {
                    revision: row.get(0)?,
                    state_json: row.get(1)?,
                })
            },
        )
        .optional()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn save_app_state(
    app: tauri::AppHandle,
    session: tauri::State<dashboard::DashboardSession>,
    expected_revision: i64,
    revision: i64,
    state_json: String,
) -> Result<(), String> {
    if expected_revision < -1 || revision <= expected_revision {
        return Err("invalid state revision".into());
    }
    let next_state = security::parse_and_validate_state(&state_json)?;
    let mut connection = Connection::open(database_path(&app)?).map_err(|e| e.to_string())?;
    connection
        .execute_batch(
            "PRAGMA foreign_keys = ON; PRAGMA trusted_schema = OFF; PRAGMA secure_delete = ON;",
        )
        .map_err(|e| e.to_string())?;
    let transaction = connection.transaction().map_err(|e| e.to_string())?;
    let current = transaction
        .query_row(
            "SELECT revision, state_json FROM app_state WHERE id = 1",
            [],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    if current.as_ref().map(|row| row.0).unwrap_or(-1) != expected_revision {
        return Err("state revision conflict".into());
    }
    if let Some((_, current_json)) = current {
        let current_state = security::parse_and_validate_state(&current_json)?;
        if current_state["users"]
            .as_array()
            .is_some_and(|users| users.is_empty())
        {
            security::authorize_first_admin(&current_state, &next_state)?;
        } else {
            let identity = dashboard::current_identity(&current_state, &session)?;
            security::authorize_transition(&current_state, &next_state, &identity)?;
        }
    } else {
        let users = next_state["users"]
            .as_array()
            .ok_or("بيانات المستخدمين غير صالحة")?;
        if users.is_empty() || !next_state["setupComplete"].as_bool().unwrap_or(false) {
            return Err("يجب إنشاء حساب مدير وإكمال الإعداد قبل الحفظ".into());
        }
    }
    transaction.execute(
        "INSERT INTO app_state(id, revision, state_json, updated_at) VALUES(1, ?1, ?2, datetime('now')) ON CONFLICT(id) DO UPDATE SET revision = excluded.revision, state_json = excluded.state_json, updated_at = excluded.updated_at",
        params![revision, state_json],
    ).map_err(|e| e.to_string())?;
    transaction.commit().map_err(|e| e.to_string())
}

#[tauri::command]
fn local_database_location(app: tauri::AppHandle) -> Result<String, String> {
    Ok(database_path(&app)?.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(dashboard::DashboardSession::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            initialize_database,
            local_database_location,
            load_app_state,
            save_app_state,
            dashboard::dashboard_login,
            dashboard::dashboard_logout,
            dashboard::dashboard_snapshot
        ])
        .setup(|app| {
            initialize_database(app.handle().clone())
                .map(|_| ())
                .map_err(|e| std::io::Error::other(e).into())
        })
        .run(tauri::generate_context!())
        .expect("error while running Souk Al Dannyeh");
}

#[cfg(test)]
mod migration_tests {
    use super::*;
    #[test]
    fn existing_migrations_preserve_snapshot_and_can_be_reopened() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(include_str!("../migrations/001_initial.sql"))
            .unwrap();
        connection.execute_batch("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);").unwrap();
        let migrations = [
            include_str!("../migrations/002_batches_and_expiry.sql"),
            include_str!("../migrations/003_batch_operations.sql"),
            include_str!("../migrations/004_batch_receipts.sql"),
            include_str!("../migrations/005_local_state.sql"),
        ];
        for migration in migrations {
            connection.execute_batch(migration).unwrap();
        }
        let original =
            r#"{"sales":[{"id":"historic","total":1234567}],"batches":[],"fiscalYears":[]}"#;
        connection
            .execute(
                "INSERT INTO app_state VALUES(1, 42, ?1, '2026-01-01')",
                [original],
            )
            .unwrap();
        // Simulate startup against an already migrated database.
        connection
            .execute_batch(include_str!("../migrations/001_initial.sql"))
            .unwrap();
        for (index, migration) in migrations.iter().enumerate() {
            let applied: bool = connection
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version=?1)",
                    [(index + 2) as i64],
                    |r| r.get(0),
                )
                .unwrap();
            if !applied {
                connection.execute_batch(migration).unwrap();
            }
        }
        let (revision, json): (i64, String) = connection
            .query_row(
                "SELECT revision,state_json FROM app_state WHERE id=1",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(revision, 42);
        assert_eq!(json, original);
    }
}
