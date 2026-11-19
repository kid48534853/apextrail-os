mod offline_tiles;

use tauri::http::{header::CONTENT_TYPE, Response, StatusCode};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .register_uri_scheme_protocol("offline-tile", |ctx, request| {
            let path = request.uri().path();
            let parts: Vec<&str> = path.trim_start_matches('/').split('/').collect();
            if parts.len() == 4 {
                if let (Ok(z), Ok(x), Ok(y)) = (
                    parts[1].parse::<u32>(),
                    parts[2].parse::<u32>(),
                    parts[3].trim_end_matches(".png").parse::<u32>(),
                ) {
                    if let Some(bytes) =
                        offline_tiles::read_cached_tile(ctx.app_handle(), parts[0], z, x, y)
                    {
                        return Response::builder()
                            .status(StatusCode::OK)
                            .header(CONTENT_TYPE, "image/png")
                            .header("Access-Control-Allow-Origin", "*")
                            .body(bytes)
                            .unwrap();
                    }
                }
            }
            Response::builder()
                .status(StatusCode::NOT_FOUND)
                .header("Access-Control-Allow-Origin", "*")
                .header(CONTENT_TYPE, "text/plain; charset=utf-8")
                .body(b"Tile not cached".to_vec())
                .unwrap()
        })
        .invoke_handler(tauri::generate_handler![
            offline_tiles::download_offline_region
        ])
        .run(tauri::generate_context!())
        .expect("啟動 ApexTrail OS 失敗");
}
