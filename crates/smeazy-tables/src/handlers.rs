use axum::{extract::{Path, State}, Extension, Json, http::StatusCode};
use std::sync::Arc;
use smeazy_common::{ApiError, ApiResponse};
use smeazy_domain::TenantContext;
use super::{models::*, service::TablesService};
pub type TablesState = Arc<TablesService>;

pub async fn list_tables(State(s): State<TablesState>, Extension(ctx): Extension<TenantContext>) -> Result<(StatusCode, Json<ApiResponse<Vec<TableWithStatus>>>), ApiError> {
    let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
    Ok(ApiResponse::ok(s.list_tables_with_status(&bid).await?))
}
pub async fn create_table(State(s): State<TablesState>, Extension(ctx): Extension<TenantContext>, Json(req): Json<CreateTableReq>) -> Result<(StatusCode, Json<ApiResponse<FloorTable>>), ApiError> {
    let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
    Ok(ApiResponse::created(s.create_table(&bid, req).await?))
}
pub async fn update_table(State(s): State<TablesState>, Extension(ctx): Extension<TenantContext>, Path(id): Path<String>, Json(req): Json<UpdateTableReq>) -> Result<(StatusCode, Json<ApiResponse<FloorTable>>), ApiError> {
    let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
    Ok(ApiResponse::ok(s.update_table(&id, &bid, req).await?))
}
pub async fn delete_table(State(s): State<TablesState>, Extension(ctx): Extension<TenantContext>, Path(id): Path<String>) -> Result<(StatusCode, Json<ApiResponse<serde_json::Value>>), ApiError> {
    let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
    s.delete_table(&id, &bid).await?;
    Ok(ApiResponse::ok(serde_json::json!({"deleted": true})))
}
pub async fn transfer_table(State(s): State<TablesState>, Extension(ctx): Extension<TenantContext>, Json(req): Json<TransferTableReq>) -> Result<(StatusCode, Json<ApiResponse<serde_json::Value>>), ApiError> {
    let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
    s.transfer_table(&bid, req).await?;
    Ok(ApiResponse::ok(serde_json::json!({"transferred": true})))
}
pub async fn merge_tables(State(s): State<TablesState>, Extension(ctx): Extension<TenantContext>, Json(req): Json<MergeTablesReq>) -> Result<(StatusCode, Json<ApiResponse<serde_json::Value>>), ApiError> {
    let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
    s.merge_tables(&bid, req).await?;
    Ok(ApiResponse::ok(serde_json::json!({"merged": true})))
}
