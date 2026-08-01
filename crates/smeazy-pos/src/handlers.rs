use axum::{extract::{Path, Query, State}, Extension, Json, http::StatusCode};
use std::{collections::HashMap, sync::Arc};
use smeazy_common::{ApiError, ApiResponse};
use smeazy_domain::TenantContext;
use super::{models::*, service::PosService};
pub type PosState = Arc<PosService>;

pub async fn create_order(State(s): State<PosState>, Extension(ctx): Extension<TenantContext>, Json(req): Json<CreateOrderReq>) -> Result<(StatusCode, Json<ApiResponse<PosOrder>>), ApiError> {
    Ok(ApiResponse::created(s.create_order(&ctx, req).await?))
}
pub async fn get_order(State(s): State<PosState>, Path(id): Path<String>) -> Result<(StatusCode, Json<ApiResponse<OrderWithItems>>), ApiError> {
    Ok(ApiResponse::ok(s.get_order_with_items(&id).await?))
}
pub async fn list_orders(State(s): State<PosState>, Extension(ctx): Extension<TenantContext>) -> Result<(StatusCode, Json<ApiResponse<Vec<PosOrder>>>), ApiError> {
    let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
    Ok(ApiResponse::ok(s.list_open_orders(&bid).await?))
}
pub async fn add_item(State(s): State<PosState>, Extension(ctx): Extension<TenantContext>, Path(order_id): Path<String>, Json(req): Json<AddItemReq>) -> Result<(StatusCode, Json<ApiResponse<OrderItem>>), ApiError> {
    Ok(ApiResponse::created(s.add_item(&ctx, &order_id, req).await?))
}
pub async fn remove_item(State(s): State<PosState>, Path((order_id, item_id)): Path<(String, String)>) -> Result<(StatusCode, Json<ApiResponse<serde_json::Value>>), ApiError> {
    s.remove_item(&order_id, &item_id).await?;
    Ok(ApiResponse::ok(serde_json::json!({"removed": true})))
}
pub async fn update_item_quantity(State(s): State<PosState>, Path((order_id, item_id)): Path<(String, String)>, Json(req): Json<UpdateItemQuantityReq>) -> Result<(StatusCode, Json<ApiResponse<serde_json::Value>>), ApiError> {
    let updated = s.update_item_quantity(&order_id, &item_id, req.quantity).await?;
    match updated {
        Some(item) => Ok(ApiResponse::ok(serde_json::json!(item))),
        None => Ok(ApiResponse::ok(serde_json::json!({"removed": true}))),
    }
}
pub async fn update_item_status(State(s): State<PosState>, Path(item_id): Path<String>, Json(req): Json<UpdateItemStatusReq>) -> Result<(StatusCode, Json<ApiResponse<OrderItem>>), ApiError> {
    Ok(ApiResponse::ok(s.update_item_status(&item_id, req).await?))
}
pub async fn apply_discount(State(s): State<PosState>, Path(order_id): Path<String>, Json(req): Json<ApplyDiscountReq>) -> Result<(StatusCode, Json<ApiResponse<PosOrder>>), ApiError> {
    Ok(ApiResponse::ok(s.apply_discount(&order_id, req).await?))
}
pub async fn update_waitstaff(State(s): State<PosState>, Path(order_id): Path<String>, Json(req): Json<UpdateWaitstaffReq>) -> Result<(StatusCode, Json<ApiResponse<PosOrder>>), ApiError> {
    Ok(ApiResponse::ok(s.update_waitstaff(&order_id, req).await?))
}
pub async fn send_to_kitchen(State(s): State<PosState>, Extension(ctx): Extension<TenantContext>, Path(order_id): Path<String>, Json(req): Json<SendToKitchenReq>) -> Result<(StatusCode, Json<ApiResponse<serde_json::Value>>), ApiError> {
    Ok(ApiResponse::ok(s.send_to_kitchen(&ctx, &order_id, req).await?))
}
pub async fn checkout(State(s): State<PosState>, Extension(ctx): Extension<TenantContext>, Path(order_id): Path<String>, Json(req): Json<CheckoutReq>) -> Result<(StatusCode, Json<ApiResponse<CheckoutResult>>), ApiError> {
    Ok(ApiResponse::ok(s.checkout(&ctx, &order_id, req).await?))
}
pub async fn void_order(State(s): State<PosState>, Extension(ctx): Extension<TenantContext>, Path(order_id): Path<String>) -> Result<(StatusCode, Json<ApiResponse<serde_json::Value>>), ApiError> {
    s.void_order(&ctx, &order_id).await?;
    Ok(ApiResponse::ok(serde_json::json!({"voided": true})))
}
pub async fn daily_summary(State(s): State<PosState>, Extension(ctx): Extension<TenantContext>, Query(params): Query<HashMap<String,String>>) -> Result<(StatusCode, Json<ApiResponse<serde_json::Value>>), ApiError> {
    let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
    let date = params.get("date").cloned().unwrap_or_else(|| chrono::Utc::now().format("%Y-%m-%d").to_string());
    Ok(ApiResponse::ok(s.daily_summary(&bid, &date).await?))
}
