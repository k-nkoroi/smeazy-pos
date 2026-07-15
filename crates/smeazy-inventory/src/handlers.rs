use axum::{body::Bytes, extract::{Path, Query, State}, http::{header, StatusCode}, Extension, Json, response::Response};
use std::{collections::HashMap, sync::Arc};
use smeazy_common::{ApiError, ApiResponse};
use smeazy_domain::TenantContext;
use super::{models::*, service::InventoryService};
pub type InvState = Arc<InventoryService>;

pub async fn list_categories(State(s): State<InvState>, Extension(ctx): Extension<TenantContext>) -> Result<(StatusCode, Json<ApiResponse<Vec<Category>>>), ApiError> {
    let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
    Ok(ApiResponse::ok(s.list_categories(&bid).await?))
}
pub async fn create_category(State(s): State<InvState>, Extension(ctx): Extension<TenantContext>, Json(req): Json<CreateCategoryReq>) -> Result<(StatusCode, Json<ApiResponse<Category>>), ApiError> {
    if !smeazy_common::roles::is_manager_or_admin(&ctx) { return Err(ApiError::forbidden("Only admins and managers can manage categories")); }
    let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
    Ok(ApiResponse::created(s.create_category(&bid, req).await?))
}
pub async fn update_category(State(s): State<InvState>, Extension(ctx): Extension<TenantContext>, Path(id): Path<String>, Json(req): Json<UpdateCategoryReq>) -> Result<(StatusCode, Json<ApiResponse<Category>>), ApiError> {
    if !smeazy_common::roles::is_manager_or_admin(&ctx) { return Err(ApiError::forbidden("Only admins and managers can manage categories")); }
    let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
    let cat = s.update_category(&id, &bid, req).await?;
    smeazy_common::audit::audit(&s.db, smeazy_common::audit::AuditEntry::new(&bid, "inventory.category_update", "category", format!("Updated category {}", cat.name)).actor(ctx.user_id.to_string()).entity(&cat.id, cat.name.clone())).await;
    Ok(ApiResponse::ok(cat))
}
pub async fn list_items(State(s): State<InvState>, Extension(ctx): Extension<TenantContext>, Query(params): Query<HashMap<String,String>>) -> Result<(StatusCode, Json<ApiResponse<Vec<InventoryItem>>>), ApiError> {
    let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
    Ok(ApiResponse::ok(s.list_items_filtered(&bid, params.get("category_id").map(|s| s.as_str()), params.get("item_type").map(|s| s.as_str())).await?))
}
pub async fn create_item(State(s): State<InvState>, Extension(ctx): Extension<TenantContext>, Json(req): Json<CreateItemReq>) -> Result<(StatusCode, Json<ApiResponse<InventoryItem>>), ApiError> {
    if !smeazy_common::roles::is_manager_or_admin(&ctx) { return Err(ApiError::forbidden("Only admins and managers can add inventory items")); }
    let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
    let item = s.create_item(&bid, req).await?;
    smeazy_common::audit::audit(&s.db, smeazy_common::audit::AuditEntry::new(&bid, "inventory.item_create", "inventory_item", format!("Created item {}", item.name)).actor(ctx.user_id.to_string()).entity(&item.id, item.name.clone())).await;
    Ok(ApiResponse::created(item))
}
pub async fn update_item(State(s): State<InvState>, Extension(ctx): Extension<TenantContext>, Path(id): Path<String>, Json(req): Json<UpdateItemReq>) -> Result<(StatusCode, Json<ApiResponse<InventoryItem>>), ApiError> {
    if !smeazy_common::roles::is_manager_or_admin(&ctx) { return Err(ApiError::forbidden("Only admins and managers can edit inventory items")); }
    let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
    let item = s.update_item(&id, &bid, req).await?;
    smeazy_common::audit::audit(&s.db, smeazy_common::audit::AuditEntry::new(&bid, "inventory.item_update", "inventory_item", format!("Edited item {}", item.name)).actor(ctx.user_id.to_string()).entity(&item.id, item.name.clone())).await;
    Ok(ApiResponse::ok(item))
}
pub async fn adjust_stock(State(s): State<InvState>, Extension(ctx): Extension<TenantContext>, Path(id): Path<String>, Json(req): Json<AdjustStockReq>) -> Result<(StatusCode, Json<ApiResponse<InventoryItem>>), ApiError> {
    // Direct stock adjustment is an admin/manager action (cashiers use spoil/sales which self-adjust).
    if !smeazy_common::roles::is_manager_or_admin(&ctx) { return Err(ApiError::forbidden("Only admins and managers can directly adjust stock. Cashiers record spoils or sales instead.")); }
    Ok(ApiResponse::ok(s.adjust_stock(&ctx, &id, req).await?))
}
pub async fn record_spoil(State(s): State<InvState>, Extension(ctx): Extension<TenantContext>, Path(id): Path<String>, Json(req): Json<SpoilReq>) -> Result<(StatusCode, Json<ApiResponse<InventoryItem>>), ApiError> {
    // Cashiers, managers and admins may record spoilage.
    Ok(ApiResponse::ok(s.record_spoil(&ctx, &id, req.quantity, req.reason.as_deref()).await?))
}
pub async fn low_stock_alerts(State(s): State<InvState>, Extension(ctx): Extension<TenantContext>) -> Result<(StatusCode, Json<ApiResponse<Vec<LowStockAlert>>>), ApiError> {
    let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
    Ok(ApiResponse::ok(s.low_stock_alerts(&bid).await?))
}
pub async fn import_csv(State(s): State<InvState>, Extension(ctx): Extension<TenantContext>, body: Bytes) -> Result<(StatusCode, Json<ApiResponse<ImportResult>>), ApiError> {
    if !smeazy_common::roles::is_manager_or_admin(&ctx) { return Err(ApiError::forbidden("Only admins and managers can import inventory")); }
    let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
    let csv_str = String::from_utf8(body.to_vec()).map_err(|_| ApiError::bad_request("Invalid UTF-8 in CSV"))?;
    let result = s.import_csv(&bid, &csv_str).await?;
    smeazy_common::audit::audit(&s.db, smeazy_common::audit::AuditEntry::new(&bid, "inventory.import", "inventory_item", format!("Imported {} items from CSV", result.imported)).actor(ctx.user_id.to_string()).meta(&result)).await;
    Ok(ApiResponse::ok(result))
}
pub async fn export_csv(State(s): State<InvState>, Extension(ctx): Extension<TenantContext>) -> Result<Response, ApiError> {
    if !smeazy_common::roles::is_manager_or_admin(&ctx) { return Err(ApiError::forbidden("Only admins and managers can export inventory")); }
    let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
    let csv = s.export_csv(&bid).await?;
    Ok(Response::builder().status(200)
        .header(header::CONTENT_TYPE, "text/csv")
        .header(header::CONTENT_DISPOSITION, "attachment; filename=\"smeazy_inventory.csv\"")
        .body(axum::body::Body::from(csv)).unwrap())
}

// ── Stock takes ───────────────────────────────────────────────────────────────
pub async fn start_stock_take(State(s): State<InvState>, Extension(ctx): Extension<TenantContext>, Json(req): Json<StartStockTakeReq>) -> Result<(StatusCode, Json<ApiResponse<StockTakeWithLines>>), ApiError> {
    let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
    Ok(ApiResponse::created(s.start_stock_take(&bid, &ctx.user_id.to_string(), "Staff", req.notes).await?))
}
pub async fn list_stock_takes(State(s): State<InvState>, Extension(ctx): Extension<TenantContext>) -> Result<(StatusCode, Json<ApiResponse<Vec<StockTake>>>), ApiError> {
    let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
    Ok(ApiResponse::ok(s.list_stock_takes(&bid).await?))
}
pub async fn get_stock_take(State(s): State<InvState>, Path(id): Path<String>) -> Result<(StatusCode, Json<ApiResponse<StockTakeWithLines>>), ApiError> {
    Ok(ApiResponse::ok(s.get_stock_take(&id).await?))
}
pub async fn count_line(State(s): State<InvState>, Path(line_id): Path<String>, Json(req): Json<CountLineReq>) -> Result<(StatusCode, Json<ApiResponse<StockTakeLine>>), ApiError> {
    Ok(ApiResponse::ok(s.update_count_line(&line_id, req.counted_qty).await?))
}
pub async fn complete_stock_take(State(s): State<InvState>, Extension(ctx): Extension<TenantContext>, Path(id): Path<String>) -> Result<(StatusCode, Json<ApiResponse<StockTakeWithLines>>), ApiError> {
    if !smeazy_common::roles::is_manager_or_admin(&ctx) { return Err(ApiError::forbidden("Only admins and managers can finalise a stock take")); }
    let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
    let result = s.complete_stock_take(&id, &bid).await?;
    smeazy_common::audit::audit(&s.db, smeazy_common::audit::AuditEntry::new(&bid, "stock.stocktake_complete", "stock_take", format!("Completed stock take with {} lines", result.lines.len())).actor(ctx.user_id.to_string()).entity(&id, "Stock take")).await;
    Ok(ApiResponse::ok(result))
}

// ── Suppliers ─────────────────────────────────────────────────────────────────
pub async fn list_suppliers(State(s): State<InvState>, Extension(ctx): Extension<TenantContext>) -> Result<(StatusCode, Json<ApiResponse<Vec<Supplier>>>), ApiError> {
    let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
    Ok(ApiResponse::ok(s.list_suppliers(&bid).await?))
}
pub async fn create_supplier(State(s): State<InvState>, Extension(ctx): Extension<TenantContext>, Json(req): Json<CreateSupplierReq>) -> Result<(StatusCode, Json<ApiResponse<Supplier>>), ApiError> {
    let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
    Ok(ApiResponse::created(s.create_supplier(&bid, req).await?))
}
pub async fn update_supplier(State(s): State<InvState>, Extension(ctx): Extension<TenantContext>, Path(id): Path<String>, Json(req): Json<UpdateSupplierReq>) -> Result<(StatusCode, Json<ApiResponse<Supplier>>), ApiError> {
    let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
    Ok(ApiResponse::ok(s.update_supplier(&id, &bid, req).await?))
}

// ── Requisitions ──────────────────────────────────────────────────────────────
pub async fn create_requisition(State(s): State<InvState>, Extension(ctx): Extension<TenantContext>, Json(req): Json<CreateRequisitionReq>) -> Result<(StatusCode, Json<ApiResponse<RequisitionWithLines>>), ApiError> {
    let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
    Ok(ApiResponse::created(s.create_requisition(&bid, &ctx.user_id.to_string(), "Staff", req).await?))
}
pub async fn list_requisitions(State(s): State<InvState>, Extension(ctx): Extension<TenantContext>) -> Result<(StatusCode, Json<ApiResponse<Vec<Requisition>>>), ApiError> {
    let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
    Ok(ApiResponse::ok(s.list_requisitions(&bid).await?))
}
pub async fn get_requisition(State(s): State<InvState>, Path(id): Path<String>) -> Result<(StatusCode, Json<ApiResponse<RequisitionWithLines>>), ApiError> {
    Ok(ApiResponse::ok(s.get_requisition(&id).await?))
}
pub async fn submit_requisition(State(s): State<InvState>, Path(id): Path<String>) -> Result<(StatusCode, Json<ApiResponse<Requisition>>), ApiError> {
    Ok(ApiResponse::ok(s.submit_requisition(&id).await?))
}
pub async fn receive_line(State(s): State<InvState>, Path(line_id): Path<String>, Json(req): Json<ReceiveLineReq>) -> Result<(StatusCode, Json<ApiResponse<RequisitionLine>>), ApiError> {
    Ok(ApiResponse::ok(s.receive_line(&line_id, req.received_qty).await?))
}

// ── Recipes ──────────────────────────────────────────────────────────────────
pub async fn get_recipe(State(s): State<InvState>, Extension(ctx): Extension<TenantContext>, Path(product_id): Path<String>) -> Result<(StatusCode, Json<ApiResponse<ProductRecipe>>), ApiError> {
    let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
    Ok(ApiResponse::ok(s.get_recipe(&bid, &product_id).await?))
}
pub async fn set_recipe(State(s): State<InvState>, Extension(ctx): Extension<TenantContext>, Path(product_id): Path<String>, Json(req): Json<SetRecipeReq>) -> Result<(StatusCode, Json<ApiResponse<ProductRecipe>>), ApiError> {
    if !smeazy_common::roles::is_manager_or_admin(&ctx) { return Err(ApiError::forbidden("Only admins and managers can edit recipes")); }
    Ok(ApiResponse::ok(s.set_recipe(&ctx, &product_id, req).await?))
}

// ── Bulk delete (soft) ────────────────────────────────────────────────────────
pub async fn bulk_delete_items(State(s): State<InvState>, Extension(ctx): Extension<TenantContext>, Json(req): Json<BulkDeleteReq>) -> Result<(StatusCode, Json<ApiResponse<BulkDeleteResult>>), ApiError> {
    if !smeazy_common::roles::is_manager_or_admin(&ctx) { return Err(ApiError::forbidden("Only admins and managers can delete inventory items")); }
    Ok(ApiResponse::ok(s.bulk_deactivate_items(&ctx, &req.ids).await?))
}
