use base64::{engine::general_purpose::STANDARD, Engine as _};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

/// 1x1 透明 PNG 位元組（供自訂協定或 fallback 讀取）
pub const TRANSPARENT_PNG_1X1: &[u8] = &[
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8,
    6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 11, 73, 68, 65, 84, 120, 156, 99, 96, 0, 2, 0, 0,
    5, 0, 1, 13, 10, 45, 180, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
];

#[derive(Debug, Deserialize)]
pub struct DownloadRegionPayload {
    pub source_id: String,
    pub tile_url_template: String,
    pub min_lat: f64,
    pub max_lat: f64,
    pub min_lon: f64,
    pub max_lon: f64,
    pub min_zoom: u8,
    pub max_zoom: u8,
    /// 0 代表無上限（一次載完）
    pub max_tiles: usize,
}

#[derive(Debug, Serialize)]
pub struct DownloadRegionResult {
    pub total_tiles: usize,
    pub downloaded: usize,
    pub skipped_cached: usize,
    pub failed: usize,
    pub remaining_in_bounds: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct DownloadProgressPayload {
    pub total: usize,
    pub completed: usize,
    pub downloaded: usize,
    pub skipped: usize,
    pub failed: usize,
    pub percent: f64,
}

fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("offline_tiles.sqlite3"))
}

fn open_db(app: &AppHandle) -> Result<Connection, String> {
    let conn = Connection::open(db_path(app)?).map_err(|e| e.to_string())?;
    conn.execute_batch(
        "PRAGMA journal_mode=WAL;
         PRAGMA synchronous=NORMAL;
         CREATE TABLE IF NOT EXISTS tiles (
             source_id TEXT NOT NULL,
             z INTEGER NOT NULL,
             x INTEGER NOT NULL,
             y INTEGER NOT NULL,
             data BLOB NOT NULL,
             PRIMARY KEY (source_id, z, x, y)
         );",
    )
    .map_err(|e| e.to_string())?;
    Ok(conn)
}

fn lat_lon_to_tile(lat: f64, lon: f64, z: u8) -> (u32, u32) {
    let n = (1u64 << z) as f64;
    let clamped = lat.clamp(-85.05112878, 85.05112878).to_radians();
    let x = (((lon + 180.0) / 360.0) * n).floor().clamp(0.0, n - 1.0) as u32;
    let y = (((1.0 - (clamped.tan() + 1.0 / clamped.cos()).ln() / std::f64::consts::PI) / 2.0) * n)
        .floor()
        .clamp(0.0, n - 1.0) as u32;
    (x, y)
}

fn default_template_for_source(source_id: &str) -> &'static str {
    match source_id {
        "osm" => "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        "terrain-topo" => "https://tile.opentopomap.org/{z}/{x}/{y}.png",
        _ => "https://tile.happyman.idv.tw/map/rudy/{z}/{x}/{y}.png",
    }
}

fn build_tile_url(tpl: &str, z: u8, x: u32, y: u32) -> String {
    tpl.replace("{z}", &z.to_string())
        .replace("{x}", &x.to_string())
        .replace("{y}", &y.to_string())
}

/// 讀取 SQLite 快取圖磚（若不存在回傳 Ok(None)）
pub fn read_cached_tile(
    app: &AppHandle,
    source_id: &str,
    z: u8,
    x: u32,
    y: u32,
) -> Result<Option<Vec<u8>>, String> {
    let conn = open_db(app)?;
    match conn.query_row(
        "SELECT data FROM tiles WHERE source_id=?1 AND z=?2 AND x=?3 AND y=?4",
        params![source_id, z, x, y],
        |row| row.get::<_, Vec<u8>>(0),
    ) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// 從遠端抓取單張圖磚並寫入 SQLite 快取
pub fn fetch_and_cache_tile(
    app: &AppHandle,
    source_id: &str,
    z: u8,
    x: u32,
    y: u32,
) -> Result<Vec<u8>, String> {
    let url = build_tile_url(default_template_for_source(source_id), z, x, y);
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(12))
        .user_agent("ApexTrailOS/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client.get(&url).send().map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    let bytes = resp.bytes().map_err(|e| e.to_string())?.to_vec();
    let conn = open_db(app)?;
    let _ = conn.execute(
        "INSERT OR REPLACE INTO tiles (source_id, z, x, y, data) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![source_id, z, x, y, bytes],
    );
    Ok(bytes)
}

#[tauri::command]
pub fn get_tile_data_url(
    app: AppHandle,
    source_id: String,
    z: u8,
    x: u32,
    y: u32,
    tile_url_template: Option<String>,
) -> Result<String, String> {
    if let Some(cached) = read_cached_tile(&app, &source_id, z, x, y)? {
        return Ok(format!("data:image/png;base64,{}", STANDARD.encode(cached)));
    }

    let tpl = tile_url_template.unwrap_or_else(|| default_template_for_source(&source_id).to_string());
    let url = build_tile_url(&tpl, z, x, y);
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(12))
        .user_agent("ApexTrailOS/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client.get(&url).send().map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    let bytes = resp.bytes().map_err(|e| e.to_string())?.to_vec();
    let conn = open_db(&app)?;
    let _ = conn.execute(
        "INSERT OR REPLACE INTO tiles (source_id, z, x, y, data) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![source_id, z, x, y, bytes],
    );
    Ok(format!("data:image/png;base64,{}", STANDARD.encode(bytes)))
}

#[tauri::command]
pub fn download_offline_region(
    app: AppHandle,
    payload: DownloadRegionPayload,
) -> Result<DownloadRegionResult, String> {
    let mut conn = open_db(&app)?;
    let safe_min_z = payload.min_zoom.min(18);
    let safe_max_z = payload.max_zoom.min(18).max(safe_min_z);

    let mut all_coords: Vec<(u8, u32, u32)> = Vec::new();
    for z in safe_min_z..=safe_max_z {
        let (x1, y1) = lat_lon_to_tile(payload.max_lat, payload.min_lon, z);
        let (x2, y2) = lat_lon_to_tile(payload.min_lat, payload.max_lon, z);
        let (min_x, max_x) = (x1.min(x2), x1.max(x2));
        let (min_y, max_y) = (y1.min(y2), y1.max(y2));
        for x in min_x..=max_x {
            for y in min_y..=max_y {
                all_coords.push((z, x, y));
            }
        }
    }

    let mut cached_set: HashSet<(u8, u32, u32)> = HashSet::new();
    {
        let mut stmt = conn
            .prepare("SELECT z, x, y FROM tiles WHERE source_id=?1 AND z BETWEEN ?2 AND ?3")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(
                params![payload.source_id, safe_min_z, safe_max_z],
                |r| Ok((r.get::<_, u8>(0)?, r.get::<_, u32>(1)?, r.get::<_, u32>(2)?)),
            )
            .map_err(|e| e.to_string())?;
        for r in rows.flatten() {
            cached_set.insert(r);
        }
    }

    let mut missing: Vec<(u8, u32, u32)> = Vec::new();
    let mut skipped_cached = 0usize;
    for c in &all_coords {
        if cached_set.contains(c) {
            skipped_cached += 1;
        } else {
            missing.push(*c);
        }
    }

    let (to_download, remaining_in_bounds) =
        if payload.max_tiles > 0 && missing.len() > payload.max_tiles {
            let rem = missing.len() - payload.max_tiles;
            missing.truncate(payload.max_tiles);
            (missing, rem)
        } else {
            (missing, 0)
        };

    let total_tiles = skipped_cached + to_download.len();
    let _ = app.emit(
        "offline-download-progress",
        DownloadProgressPayload {
            total: total_tiles,
            completed: skipped_cached,
            downloaded: 0,
            skipped: skipped_cached,
            failed: 0,
            percent: if total_tiles == 0 {
                100.0
            } else {
                (skipped_cached as f64 / total_tiles as f64) * 100.0
            },
        },
    );

    if to_download.is_empty() {
        return Ok(DownloadRegionResult {
            total_tiles,
            downloaded: 0,
            skipped_cached,
            failed: 0,
            remaining_in_bounds,
        });
    }

    let worker_count = 10usize.min(to_download.len());
    let queue = Arc::new(Mutex::new(to_download));
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(12))
        .pool_max_idle_per_host(worker_count)
        .user_agent("ApexTrailOS/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let (tx, rx) = mpsc::channel::<(u8, u32, u32, Option<Vec<u8>>)>();
    let mut handles = Vec::with_capacity(worker_count);

    for _ in 0..worker_count {
        let q = Arc::clone(&queue);
        let c = client.clone();
        let tpl = payload.tile_url_template.clone();
        let tx_clone = tx.clone();

        handles.push(thread::spawn(move || loop {
            let task = { q.lock().ok().and_then(|mut guard| guard.pop()) };
            let Some((z, x, y)) = task else { break };
            let url = build_tile_url(&tpl, z, x, y);
            let data = c
                .get(&url)
                .send()
                .ok()
                .filter(|r| r.status().is_success())
                .and_then(|r| r.bytes().ok())
                .map(|b| b.to_vec());
            let _ = tx_clone.send((z, x, y, data));
        }));
    }
    drop(tx);

    let mut downloaded = 0usize;
    let mut failed = 0usize;
    let mut batch: Vec<(u8, u32, u32, Vec<u8>)> = Vec::with_capacity(50);
    let mut last_emit = Instant::now();

    for (z, x, y, opt_bytes) in rx {
        match opt_bytes {
            Some(bytes) => {
                downloaded += 1;
                batch.push((z, x, y, bytes));
            }
            None => failed += 1,
        }

        if batch.len() >= 50 {
            if let Ok(tx_db) = conn.transaction() {
                for (bz, bx, by, bdata) in batch.drain(..) {
                    let _ = tx_db.execute(
                        "INSERT OR REPLACE INTO tiles (source_id, z, x, y, data) VALUES (?1, ?2, ?3, ?4, ?5)",
                        params![payload.source_id, bz, bx, by, bdata],
                    );
                }
                let _ = tx_db.commit();
            }
        }

        let completed = skipped_cached + downloaded + failed;
        if last_emit.elapsed() >= Duration::from_millis(200) || completed == total_tiles {
            last_emit = Instant::now();
            let percent = ((completed as f64 / total_tiles.max(1) as f64) * 100.0).min(100.0);
            let _ = app.emit(
                "offline-download-progress",
                DownloadProgressPayload {
                    total: total_tiles,
                    completed,
                    downloaded,
                    skipped: skipped_cached,
                    failed,
                    percent: (percent * 10.0).round() / 10.0,
                },
            );
        }
    }

    if !batch.is_empty() {
        if let Ok(tx_db) = conn.transaction() {
            for (bz, bx, by, bdata) in batch.drain(..) {
                let _ = tx_db.execute(
                    "INSERT OR REPLACE INTO tiles (source_id, z, x, y, data) VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![payload.source_id, bz, bx, by, bdata],
                );
            }
            let _ = tx_db.commit();
        }
    }

    for h in handles {
        let _ = h.join();
    }

    Ok(DownloadRegionResult {
        total_tiles,
        downloaded,
        skipped_cached,
        failed,
        remaining_in_bounds,
    })
}
