use axum::{middleware, routing::get, Router};
use smeazy_common::middleware::{require_auth, AuthState};
use super::{handlers::*, service::AnalyticsService};
use std::sync::Arc;
pub fn analytics_routes(svc: Arc<AnalyticsService>, auth: AuthState) -> Router {
    Router::new()
        .route("/analytics/revenue",            get(revenue))
        .route("/analytics/products",           get(products))
        .route("/analytics/categories",         get(categories))
        .route("/analytics/staff",              get(staff))
        .route("/analytics/revenue/export",     get(export_revenue))
        .route("/analytics/products/export",    get(export_products))
        .route("/analytics/categories/export",  get(export_categories))
        .route("/analytics/staff/export",       get(export_staff))
        .route_layer(middleware::from_fn_with_state(auth, require_auth))
        .with_state(svc)
}
