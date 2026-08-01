use axum::{middleware, routing::{get, put}, Router};
use smeazy_common::middleware::{require_auth, AuthState};
use super::{handlers::*, service::AccommodationService};
use std::sync::Arc;

pub fn accommodation_routes(svc: Arc<AccommodationService>, auth: AuthState) -> Router {
    Router::new()
        .route("/accommodation/rooms",            get(list_rooms))
        .route("/accommodation/rooms/:item_id/ready", put(set_ready))
        .route_layer(middleware::from_fn_with_state(auth, require_auth))
        .with_state(svc)
}
