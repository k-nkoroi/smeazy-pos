//! SMEazy POS API — Offline-First, SQLite-powered

use std::sync::Arc;
use axum::{routing::get, Router};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use tower_http::cors::{Any, CorsLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

mod health;

use smeazy_common::middleware::AuthState;
use smeazy_iam::{routes::iam_routes, service::IamService};
use smeazy_pos::{routes::pos_routes, service::PosService};
use smeazy_inventory::{routes::inventory_routes, service::InventoryService};
use smeazy_tables::{routes::tables_routes, service::TablesService};
use smeazy_kitchen::{routes::kitchen_routes, service::KitchenService};
use smeazy_analytics::{routes::analytics_routes, service::AnalyticsService};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| "smeazy_api=info,tower_http=warn".parse().unwrap()))
        .with(tracing_subscriber::fmt::layer().compact())
        .init();

    tracing::info!("🚀 SMEazy POS starting (offline-first, SQLite)...");

    let db_path    = std::env::var("DATABASE_PATH").unwrap_or_else(|_| "smeazy.db".into());
    let jwt_secret = std::env::var("JWT_SECRET").unwrap_or_else(|_| "smeazy-pos-dev-secret-change-in-production!!".into());
    let port       = std::env::var("PORT").unwrap_or_else(|_| "8000".into());

    let opts = SqliteConnectOptions::new()
        .filename(&db_path).create_if_missing(true)
        .pragma("journal_mode", "WAL").pragma("foreign_keys", "ON");

    let db = SqlitePoolOptions::new().max_connections(10)
        .connect_with(opts).await.expect("Failed to open SQLite database");
    tracing::info!("✅ SQLite database ready at: {}", db_path);

    sqlx::migrate!("../../migrations").run(&db).await.expect("Failed to run migrations");
    tracing::info!("✅ Migrations applied");

    let auth_state = AuthState { jwt_secret: Arc::new(jwt_secret.clone()) };

    let inventory_svc = Arc::new(InventoryService::new(db.clone()));
    let iam_svc       = Arc::new(IamService::new(db.clone(), jwt_secret.clone()));
    let pos_svc       = Arc::new(PosService::new(db.clone(), inventory_svc.clone()));
    let tables_svc    = Arc::new(TablesService::new(db.clone()));
    let kitchen_svc   = Arc::new(KitchenService::new(db.clone()));
    let analytics_svc = Arc::new(AnalyticsService::new(db.clone()));

    // Permissive CORS — offline desktop app (Tauri webview origin + localhost dev)
    let cors = CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any);

    let app = Router::new()
        .route("/",       get(health::root))
        .route("/health", get(health::health_check))
        .merge(iam_routes(iam_svc, auth_state.clone()))
        .merge(pos_routes(pos_svc, auth_state.clone()))
        .merge(inventory_routes(inventory_svc, auth_state.clone()))
        .merge(tables_routes(tables_svc, auth_state.clone()))
        .merge(kitchen_routes(kitchen_svc, auth_state.clone()))
        .merge(analytics_routes(analytics_svc, auth_state))
        .layer(cors)
        .layer(tower_http::trace::TraceLayer::new_for_http());

    let addr = format!("127.0.0.1:{}", port);
    tracing::info!("🌍 SMEazy POS API listening on http://{}", addr);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
