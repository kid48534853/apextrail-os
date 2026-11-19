mod offline_tiles;

use tauri::http::{header::CONTENT_TYPE, Response, StatusCode};

fn parse_zxy_from_uri(uri: &tauri::http::Uri) -> Option<(String, u32, u32, u32)> {
    let host = uri.host().unwrap_or("");
    let raw_path = uri.path().trim_start_matches('/');
    let segments: Vec<&str> = raw_path.split('/').filter(|s| !s.is_empty()).collect();

    if host.is_empty() || host == "localhost" {
        if segments.len() >= 4 {
            let source_id = segments[0].to_string();
            let z = segments[1].parse::<u32>().ok()?;
            let x = segments[2].parse::<u32>().ok()?;
            let y_clean = segments[3].split('?').next()?.trim_end_matches(".png");
            let y = y_clean.parse::<u32>().ok()?;
            return Some((source_id, z, x, y));
        }
    } else if segments.len() >= 3 {
        let source_id = host.to_string();
        let z = segments[0].parse::<u32>().ok()?;
        let x = segments[1].parse::<u32>().ok()?;
        let y_clean = segments[2].split('?').next()?.trim_end_matches(".png");
        let y = y_clean.parse::<u32>().ok()?;
        return Some((source_id, z, x, y));
    }
    None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .register_uri_scheme_protocol("offline-tile", |ctx, request| {
            if let Some((source_id, z, x, y)) = parse_zxy_from_uri(request.uri()) {
                if let Some(bytes) =
                    offline_tiles::read_cached_tile(ctx.app_handle(), &source_id, z, x, y)
                {
                    return Response::builder()
                        .status(StatusCode::OK)
                        .header(CONTENT_TYPE, "image/png")
                        .header("Access-Control-Allow-Origin", "*")
                        .header("Cache-Control", "public, max-age=86400")
                        .body(bytes)
                        .unwrap();
                }

                if let Some(fetched_bytes) =
                    offline_tiles::fetch_and_cache_tile(ctx.app_handle(), &source_id, z, x, y)
                {
                    return Response::builder()
                        .status(StatusCode::OK)
                        .header(CONTENT_TYPE, "image/png")
                        .header("Access-Control-Allow-Origin", "*")
                        .header("Cache-Control", "public, max-age=86400")
                        .body(fetched_bytes)
                        .unwrap();
                }
            }

            Response::builder()
                .status(StatusCode::OK)
                .header(CONTENT_TYPE, "image/png")
                .header("Access-Control-Allow-Origin", "*")
                .body(offline_tiles::TRANSPARENT_PNG_1X1.to_vec())
                .unwrap()
        })
        .invoke_handler(tauri::generate_handler![
            offline_tiles::download_offline_region
        ])
        .run(tauri::generate_context!())
        .expect("啟動 ApexTrail OS 失敗");
}
