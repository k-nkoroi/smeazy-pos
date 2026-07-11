use axum::{middleware, routing::{delete, get, post, put}, Router};
use smeazy_common::middleware::{require_auth, AuthState};
use super::{handlers::*, service::PosService};
use std::sync::Arc;
pub fn pos_routes(svc: Arc<PosService>, auth: AuthState) -> Router {
    Router::new()
        .route("/pos/orders",                             get(list_orders).post(create_order))
        .route("/pos/orders/:id",                         get(get_order))
        .route("/pos/orders/:id/items",                   post(add_item))
        .route("/pos/orders/:id/items/:item_id",          delete(remove_item))
        .route("/pos/orders/:id/void",                    post(void_order))
        .route("/pos/orders/:id/discount",                post(apply_discount))
        .route("/pos/orders/:id/waitstaff",               put(update_waitstaff))
        .route("/pos/orders/:id/kitchen",                 post(send_to_kitchen))
        .route("/pos/orders/:id/checkout",                post(checkout))
        .route("/pos/items/:item_id/status",              put(update_item_status))
        .route("/pos/summary",                            get(daily_summary))
        .route_layer(middleware::from_fn_with_state(auth, require_auth))
        .with_state(svc)
}
