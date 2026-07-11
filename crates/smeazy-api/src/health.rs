use axum::Json;
use serde_json::{json, Value};

pub async fn root() -> Json<Value> {
    Json(json!({ "name": "SMEazy API", "version": "2.0.0", "status": "running", "mode": "offline-sqlite" }))
}
pub async fn health_check() -> Json<Value> {
    Json(json!({
        "status": "healthy", "version": "2.0.0",
        "db": "sqlite (offline-first)",
        "modules": ["iam","pos","inventory","tables","kitchen","analytics"],
        "features": ["floor_plan","split_payments","kitchen_screen","csv_import_export","product_categories"]
    }))
}
