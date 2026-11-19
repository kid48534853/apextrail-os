use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};

#[derive(Debug, Deserialize)]
pub struct DownloadRegionPayload {
    pub source_id: String,
    pub tile_url_template: String,
    pub min_lat: f64,
    pub max_lat: f64,
    pub min_lon: f64,
    pub max_lon: f64,
    pub min_zoom: u32,
    pub max_zoom: u32,
    pub max_tiles: Option<usize>,
}

#[derive(Debug, Serialize)]
pub struct DownloadResult {
    pub total_tiles: usize,
    pub downloaded: usize,
    pub skipped_cached: usize,
    pub failed: usize,
    pub remaining_in_bounds: usize,
}

pub const TRANSPARENT_PNG_1X1: &[u8] = &[
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
    0x0D, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
    0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
];

fn get_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("無法取得 AppData 目錄: {e}"))?;
    std::fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("建立 AppData 目錄失敗: {e}"))?;
    Ok(app_data_dir.join("offline_map_tiles.sqlite"))
}

fn open_db(app: &AppHandle) -> Result<Connection, String> {
    let db_path = get_db_path(app)?;
    let conn = Connection::open(db_path).map_err(|e| format!("開啟 SQLite 失敗: {e}"))?;
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         CREATE TABLE IF NOT EXISTS offline_tiles (
             source_id TEXT NOT NULL,
             z INTEGER NOT NULL,
             x INTEGER NOT NULL,
             y INTEGER NOT NULL,
             tile_data BLOB NOT NULL,
             updated_at INTEGER NOT NULL,
             PRIMARY KEY (source_id, z, x, y)
         );",
    )
    .map_err(|e| format!("初始化資料表失敗: {e}"))?;
    Ok(conn)
}

fn lat_lon_to_tile_xy(lat: f64, lon: f64, z: u32) -> (u32, u32) {
    let n = (1_u32 << z.min(18)) as f64;
    let clamped_lat = lat.clamp(-85.05112878, 85.05112878);
    let clamped_lon = lon.clamp(-180.0, 179.999999);
    let lat_rad = clamped_lat.to_radians();
    let x = (((clamped_lon + 180.0) / 360.0) * n)
        .floor()
        .max(0.0)
        .min(n - 1.0) as u32;
    let y = (((1.0 - (lat_rad.tan() + 1.0 / lat_rad.cos()).ln() / std::f64::consts::PI) / 2.0) * n)
        .floor()
        .max(0.0)
        .min(n - 1.0) as u32;
    (x, y)
}

fn resolve_tile_url(template: &str, source_id: &str, z: u32, x: u32, y: u32) -> String {
    if !template.trim().is_empty() {
        return template
            .replace("{z}", &z.to_string())
            .replace("{x}", &x.to_string())
            .replace("{y}", &y.to_string());
    }
    if source_id.contains("rudy") {
        format!("https://tile.happyman.idv.tw/map/rudy/{z}/{x}/{y}.png")
    } else {
        format!("https://tile.openstreetmap.org/{z}/{x}/{y}.png")
    }
}

pub fn read_cached_tile(app: &AppHandle, source_id: &str, z: u32, x: u32, y: u32) -> Option<Vec<u8>> {
    let conn = open_db(app).ok()?;
    let mut stmt = conn
        .prepare("SELECT tile_data FROM offline_tiles WHERE source_id = ?1 AND z = ?2 AND x = ?3 AND y = ?4")
        .ok()?;
    stmt.query_row(params![source_id, z as i64, x as i64, y as i64], |row| {
        row.get::<_, Vec<u8>>(0)
    })
    .ok()
}

pub fn fetch_and_cache_tile(app: &AppHandle, source_id: &str, z: u32, x: u32, y: u32) -> Option<Vec<u8>> {
    let url = resolve_tile_url("", source_id, z, x, y);
    let bytes_opt = tauri::async_runtime::block_on(async move {
        let client = reqwest::Client::builder()
            .user_agent("ApexTrailOS/1.0 (Offline-First Trail Companion)")
            .timeout(std::time::Duration::from_secs(6))
            .build()
            .ok()?;
        let resp = client.get(&url).send().await.ok()?;
        if !resp.status().is_success() {
            return None;
        }
        let bytes = resp.bytes().await.ok()?.to_vec();
        if bytes.is_empty() {
            return None;
        }
        Some(bytes)
    });

    let bytes = bytes_opt?;
    if let Ok(conn) = open_db(app) {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        let _ = conn.execute(
            "INSERT OR REPLACE INTO offline_tiles (source_id, z, x, y, tile_data, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![source_id, z as i64, x as i64, y as i64, &bytes, now],
        );
    }
    Some(bytes)
}

#[tauri::command]
pub async fn get_tile_data_url(
    app: AppHandle,
    source_id: String,
    z: u32,
    x: u32,
    y: u32,
    tile_url_template: Option<String>,
) -> Result<String, String> {
    if let Some(cached) = read_cached_tile(&app, &source_id, z, x, y) {
        return Ok(format!("data:image/png;base64,{}", BASE64.encode(&cached)));
    }

    let tpl = tile_url_template.unwrap_or_default();
    let url = resolve_tile_url(&tpl, &source_id, z, x, y);

    let client = reqwest::Client::builder()
        .user_agent("ApexTrailOS/1.0 (Offline-First Trail Companion)")
        .timeout(std::time::Duration::from_secs(7))
        .build()
        .map_err(|e| format!("建立 HTTP 用戶端失敗: {e}"))?;

    if let Ok(resp) = client.get(&url).send().await {
        if resp.status().is_success() {
            if let Ok(bytes) = resp.bytes().await {
                if !bytes.is_empty() {
                    if let Ok(conn) = open_db(&app) {
                        let now = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .map(|d| d.as_secs() as i64)
                            .unwrap_or(0);
                        let _ = conn.execute(
                            "INSERT OR REPLACE INTO offline_tiles (source_id, z, x, y, tile_data, updated_at)
                             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                            params![source_id, z as i64, x as i64, y as i64, bytes.as_ref(), now],
                        );
                    }
                    return Ok(format!("data:image/png;base64,{}", BASE64.encode(bytes.as_ref())));
                }
            }
        }
    }

    Ok(format!(
        "data:image/png;base64,{}",
        BASE64.encode(TRANSPARENT_PNG_1X1)
    ))
}

// 透過標準庫原子計數器控制最大併發數，避免直接依賴外部 tokio crate
fn acquire_concurrency_slot(active: &Arc<Mutex<usize>>, max_concurrent: usize) {
    loop {
        {
            let mut guard = active.lock().unwrap_or_else(|e| e.into_inner());
            if *guard < max_concurrent {
                *guard += 1;
                return;
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(15));
    }
}

fn release_concurrency_slot(active: &Arc<Mutex<usize>>) {
    let mut guard = active.lock().unwrap_or_else(|e| e.into_inner());
    if *guard > 0 {
        *guard -= 1;
    }
}

#[tauri::command]
pub async fn download_offline_region(
    app: AppHandle,
    payload: DownloadRegionPayload,
) -> Result<DownloadResult, String> {
    let min_z = payload.min_zoom.min(payload.max_zoom).min(16);
    let max_z = payload.min_zoom.max(payload.max_zoom).min(16);
    let south = payload.min_lat.min(payload.max_lat);
    let north = payload.min_lat.max(payload.max_lat);
    let west = payload.min_lon.min(payload.max_lon);
    let east = payload.min_lon.max(payload.max_lon);
    let batch_cap = payload.max_tiles.unwrap_or(1500).clamp(50, 5000);

    let mut all_coords: Vec<(u32, u32, u32)> = Vec::new();
    for z in min_z..=max_z {
        let (x_min, y_min) = lat_lon_to_tile_xy(north, west, z);
        let (x_max, y_max) = lat_lon_to_tile_xy(south, east, z);
        for x in x_min.min(x_max)..=x_min.max(x_max) {
            for y in y_min.min(y_max)..=y_min.max(y_max) {
                all_coords.push((z, x, y));
            }
        }
    }

    let conn = open_db(&app)?;
    let mut skipped_cached = 0_usize;
    let mut pending_coords: Vec<(u32, u32, u32)> = Vec::new();

    for (z, x, y) in all_coords {
        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(1) FROM offline_tiles WHERE source_id = ?1 AND z = ?2 AND x = ?3 AND y = ?4",
                params![payload.source_id, z as i64, x as i64, y as i64],
                |row| row.get(0),
            )
            .unwrap_or(0);
        if exists > 0 {
            skipped_cached += 1;
        } else {
            pending_coords.push((z, x, y));
        }
    }

    let total_pending_before_batch = pending_coords.len();
    let batch_coords: Vec<(u32, u32, u32)> = pending_coords.into_iter().take(batch_cap).collect();
    let batch_len = batch_coords.len();

    let client = reqwest::Client::builder()
        .user_agent("ApexTrailOS/1.0 (Offline-First Trail Companion)")
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("建立 HTTP 用戶端失敗: {e}"))?;

    let active_slots = Arc::new(Mutex::new(0_usize));
    let mut handles = Vec::with_capacity(batch_len);

    for (z, x, y) in batch_coords {
        acquire_concurrency_slot(&active_slots, 6);
        let slots_for_task = active_slots.clone();
        let client_ref = client.clone();
        let url = resolve_tile_url(&payload.tile_url_template, &payload.source_id, z, x, y);
        handles.push(tauri::async_runtime::spawn(async move {
            let result = match client_ref.get(&url).send().await {
                Ok(resp) if resp.status().is_success() => match resp.bytes().await {
                    Ok(bytes) if !bytes.is_empty() => Some((z, x, y, bytes.to_vec())),
                    _ => None,
                },
                _ => None,
            };
            release_concurrency_slot(&slots_for_task);
            result
        }));
    }

    let mut downloaded = 0_usize;
    let mut failed = 0_usize;

    for h in handles {
        match h.await {
            Ok(Some((z, x, y, bytes))) => {
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs() as i64)
                    .unwrap_or(0);
                let res = conn.execute(
                    "INSERT OR REPLACE INTO offline_tiles (source_id, z, x, y, tile_data, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![payload.source_id, z as i64, x as i64, y as i64, &bytes, now],
                );
                if res.is_ok() {
                    downloaded += 1;
                } else {
                    failed += 1;
                }
            }
            _ => failed += 1,
        }
    }

    let remaining_in_bounds = total_pending_before_batch.saturating_sub(downloaded);

    Ok(DownloadResult {
        total_tiles: batch_len + skipped_cached,
        downloaded,
        skipped_cached,
        failed,
        remaining_in_bounds,
    })
}
