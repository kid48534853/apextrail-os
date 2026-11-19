use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::f64::consts::PI;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

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
}

#[derive(Debug, Serialize)]
pub struct DownloadResult {
    pub total_tiles: usize,
    pub downloaded: usize,
    pub skipped_cached: usize,
    pub failed: usize,
}

fn get_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let mut dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    dir.push("apextrail_offline.db");
    Ok(dir)
}

fn lon_lat_to_tile(lon: f64, lat: f64, zoom: u8) -> (u32, u32) {
    let n = 2_f64.powi(zoom as i32);
    let x = ((lon + 180.0) / 360.0 * n).floor() as u32;
    let lat_rad = lat.clamp(-85.0511, 85.0511).to_radians();
    let y = ((1.0 - (lat_rad.tan() + 1.0 / lat_rad.cos()).ln() / PI) / 2.0 * n).floor() as u32;
    (x, y)
}

#[tauri::command]
pub async fn download_offline_region(
    app: AppHandle,
    payload: DownloadRegionPayload,
) -> Result<DownloadResult, String> {
    if payload.max_zoom > 16 || payload.min_zoom > payload.max_zoom {
        return Err("縮放層級無效（限制 Z1~Z16）".to_string());
    }
    let db_path = get_db_path(&app)?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS offline_tiles (
            source_id TEXT NOT NULL, z INTEGER NOT NULL, x INTEGER NOT NULL, y INTEGER NOT NULL,
            tile_data BLOB NOT NULL, PRIMARY KEY (source_id, z, x, y)
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    let mut coords = Vec::new();
    for z in payload.min_zoom..=payload.max_zoom {
        let (x_min, y_max) = lon_lat_to_tile(payload.min_lon, payload.min_lat, z);
        let (x_max, y_min) = lon_lat_to_tile(payload.max_lon, payload.max_lat, z);
        for x in x_min..=x_max {
            for y in y_min..=y_max {
                coords.push((z, x, y));
            }
        }
    }
    if coords.len() > 3000 {
        return Err(format!("區域過大（{} 張，上限 3000）", coords.len()));
    }

    let client = reqwest::Client::builder()
        .user_agent("ApexTrailOS/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let (mut downloaded, mut skipped_cached, mut failed) = (0, 0, 0);
    for (z, x, y) in &coords {
        let exists: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM offline_tiles WHERE source_id=?1 AND z=?2 AND x=?3 AND y=?4)",
                params![&payload.source_id, *z as i64, *x as i64, *y as i64],
                |r| r.get(0),
            )
            .unwrap_or(false);
        if exists {
            skipped_cached += 1;
            continue;
        }
        let url = payload
            .tile_url_template
            .replace("{z}", &z.to_string())
            .replace("{x}", &x.to_string())
            .replace("{y}", &y.to_string());
        match client.get(&url).send().await {
            Ok(resp) if resp.status().is_success() => {
                if let Ok(bytes) = resp.bytes().await {
                    let _ = conn.execute(
                        "INSERT OR REPLACE INTO offline_tiles (source_id,z,x,y,tile_data) VALUES (?1,?2,?3,?4,?5)",
                        params![&payload.source_id, *z as i64, *x as i64, *y as i64, bytes.as_ref()],
                    );
                    downloaded += 1;
                } else {
                    failed += 1;
                }
            }
            _ => failed += 1,
        }
    }
    Ok(DownloadResult { total_tiles: coords.len(), downloaded, skipped_cached, failed })
}

pub fn read_cached_tile(app: &AppHandle, source_id: &str, z: u32, x: u32, y: u32) -> Option<Vec<u8>> {
    let conn = Connection::open(get_db_path(app).ok()?).ok()?;
    conn.query_row(
        "SELECT tile_data FROM offline_tiles WHERE source_id=?1 AND z=?2 AND x=?3 AND y=?4",
        params![source_id, z as i64, x as i64, y as i64],
        |r| r.get::<_, Vec<u8>>(0),
    )
    .ok()
}
