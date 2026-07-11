use axum::{extract::State, http::StatusCode, Extension, Json};
use std::sync::Arc;
use uuid::Uuid;
use smeazy_common::{ApiError, ApiResponse};
use smeazy_domain::TenantContext;
use super::{models::*, service::MpesaService};

pub type MpesaState = Arc<MpesaService>;

pub async fn stk_push(
    State(s): State<MpesaState>,
    Extension(ctx): Extension<TenantContext>,
    Json(req): Json<StkPushReq>,
) -> Result<(StatusCode, Json<ApiResponse<serde_json::Value>>), ApiError> {
    let cid = s.initiate_stk(&ctx, req).await?;
    Ok(ApiResponse::ok(serde_json::json!({ "checkout_request_id": cid })))
}

/// Daraja webhook — must always return 200 OK regardless of processing result
pub async fn stk_callback(
    State(s): State<MpesaState>,
    Json(payload): Json<DarajaCallback>,
) -> StatusCode {
    if let Err(e) = s.process_callback(payload).await {
        // Use ?e (Debug) — does NOT require Display trait
        tracing::error!(error = ?e, "M-Pesa callback processing error");
    }
    StatusCode::OK
}

pub async fn mock_settle(
    State(s): State<MpesaState>,
    Extension(ctx): Extension<TenantContext>,
    Json(body): Json<serde_json::Value>,
) -> Result<(StatusCode, Json<ApiResponse<serde_json::Value>>), ApiError> {
    let order_id = body["order_id"].as_str()
        .and_then(|s| Uuid::parse_str(s).ok())
        .ok_or_else(|| ApiError::bad_request("Invalid order_id"))?;
    s.mock_settle(&ctx, order_id).await?;
    Ok(ApiResponse::ok(serde_json::json!({ "settled": true })))
}
