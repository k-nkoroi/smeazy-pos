use axum::{extract::{Path, State}, Extension, Json, http::StatusCode};
use std::sync::Arc;
use smeazy_common::{ApiError, ApiResponse};
use smeazy_domain::TenantContext;
use super::{models::*, service::KitchenService};
pub type KitchenState = Arc<KitchenService>;

pub async fn list_active(State(s): State<KitchenState>, Extension(ctx): Extension<TenantContext>) -> Result<(StatusCode, Json<ApiResponse<Vec<KitchenOrderWithItems>>>), ApiError> {
    let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
    Ok(ApiResponse::ok(s.list_active_orders(&bid).await?))
}
pub async fn acknowledge(State(s): State<KitchenState>, Path(id): Path<String>) -> Result<(StatusCode, Json<ApiResponse<KitchenOrder>>), ApiError> {
    Ok(ApiResponse::ok(s.acknowledge_order(&id).await?))
}
pub async fn dispatch_item(State(s): State<KitchenState>, Path(item_id): Path<String>) -> Result<(StatusCode, Json<ApiResponse<KitchenItem>>), ApiError> {
    Ok(ApiResponse::ok(s.dispatch_item(&item_id).await?))
}
