use axum::{middleware, routing::{get, post, put}, Router};
use smeazy_common::middleware::{require_auth, AuthState};
use super::{handlers::*, service::KitchenService};
use std::sync::Arc;
pub fn kitchen_routes(svc: Arc<KitchenService>, auth: AuthState) -> Router {
    Router::new()
        .route("/kitchen/orders",              get(list_active))
        .route("/kitchen/orders/:id/ack",      post(acknowledge))
        .route("/kitchen/items/:id/dispatch",  put(dispatch_item))
        .route_layer(middleware::from_fn_with_state(auth, require_auth))
        .with_state(svc)
}
