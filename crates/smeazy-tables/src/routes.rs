use axum::{middleware, routing::{delete, get, post, put}, Router};
use smeazy_common::middleware::{require_auth, AuthState};
use super::{handlers::*, service::TablesService};
use std::sync::Arc;
pub fn tables_routes(svc: Arc<TablesService>, auth: AuthState) -> Router {
    Router::new()
        .route("/tables",              get(list_tables).post(create_table))
        .route("/tables/:id",          put(update_table).delete(delete_table))
        .route("/tables/transfer",     post(transfer_table))
        .route("/tables/merge",        post(merge_tables))
        .route_layer(middleware::from_fn_with_state(auth, require_auth))
        .with_state(svc)
}
