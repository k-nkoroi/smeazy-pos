use axum::{extract::{Path, State}, Extension, Json, http::StatusCode};
use std::sync::Arc;
use smeazy_common::{ApiError, ApiResponse};
use smeazy_domain::TenantContext;
use super::{models::*, service::AccommodationService};
pub type AccommodationState = Arc<AccommodationService>;

pub async fn list_rooms(State(s): State<AccommodationState>, Extension(ctx): Extension<TenantContext>) -> Result<(StatusCode, Json<ApiResponse<Vec<RoomPublic>>>), ApiError> {
    let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
    Ok(ApiResponse::ok(s.list_rooms(&bid).await?))
}

pub async fn set_ready(State(s): State<AccommodationState>, Extension(ctx): Extension<TenantContext>, Path(item_id): Path<String>, Json(req): Json<SetReadyReq>) -> Result<(StatusCode, Json<ApiResponse<RoomPublic>>), ApiError> {
    if !smeazy_common::roles::is_storekeeper_or_above(&ctx) {
        return Err(ApiError::forbidden("Only Storekeeper role and above can confirm a room's key is at reception"));
    }
    Ok(ApiResponse::ok(s.set_ready(&ctx, &item_id, req.notes.as_deref()).await?))
}
