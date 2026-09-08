use axum::{middleware, routing::{get, post, put}, Router};
use smeazy_common::middleware::{require_auth, AuthState};
use super::{handlers::*, service::InventoryService};
use std::sync::Arc;

pub fn inventory_routes(svc: Arc<InventoryService>, auth: AuthState) -> Router {
    Router::new()
        .route("/inventory/categories",                get(list_categories).post(create_category))
        .route("/inventory/categories/:id",            put(update_category))
        .route("/inventory/items",                     get(list_items).post(create_item))
        .route("/inventory/items/:id",                 put(update_item))
        .route("/inventory/items/:id/adjust",          post(adjust_stock))
        .route("/inventory/items/:id/spoil",           post(record_spoil))
        .route("/inventory/items/:id/recipe",          get(get_recipe).put(set_recipe))
        .route("/inventory/items/bulk-delete",         post(bulk_delete_items))
        .route("/inventory/alerts",                    get(low_stock_alerts))
        .route("/inventory/import",                    post(import_csv))
        .route("/inventory/export",                    get(export_csv))
        .route("/inventory/stocktakes",                get(list_stock_takes).post(start_stock_take))
        .route("/inventory/stocktakes/:id",            get(get_stock_take))
        .route("/inventory/stocktakes/:id/complete",   post(complete_stock_take))
        .route("/inventory/stocktake-lines/:id/count", put(count_line))
        .route("/inventory/suppliers",                 get(list_suppliers).post(create_supplier))
        .route("/inventory/suppliers/:id",             put(update_supplier))
        .route("/inventory/requisitions",              get(list_requisitions).post(create_requisition))
        .route("/inventory/requisitions/:id",          get(get_requisition))
        .route("/inventory/requisitions/:id/submit",   post(submit_requisition))
        .route("/inventory/requisition-lines/:id/receive", put(receive_line))
        .route("/inventory/items/:id/batches",         get(list_batches).post(create_batch))
        .route("/inventory/batches/:id",               put(update_batch))
        .route("/inventory/batches/expiring",          get(expiring_batches))
        .route("/inventory/items/:id/process",         post(process_batch))
        .route("/inventory/items/:id/complete-processing", post(complete_processing))
        .route_layer(middleware::from_fn_with_state(auth, require_auth))
        .with_state(svc)
}
