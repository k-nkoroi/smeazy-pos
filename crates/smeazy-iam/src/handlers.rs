use axum::{extract::{Path, State}, Extension, Json, http::StatusCode};
use std::sync::Arc;
use smeazy_common::{ApiError, ApiResponse};
use smeazy_domain::TenantContext;
use super::{models::*, service::IamService};
pub type IamState = Arc<IamService>;

pub async fn register(State(s): State<IamState>, Json(req): Json<RegisterRequest>) -> Result<(StatusCode, Json<ApiResponse<AuthResponse>>), ApiError> {
    Ok(ApiResponse::created(s.register(req).await?))
}
pub async fn login(State(s): State<IamState>, Json(req): Json<LoginRequest>) -> Result<(StatusCode, Json<ApiResponse<AuthResponse>>), ApiError> {
    Ok(ApiResponse::ok(s.login(req).await?))
}

#[derive(serde::Deserialize)]
pub struct PinLoginBody { pub business_id: String, pub pin: String }
pub async fn pin_login(State(s): State<IamState>, Json(req): Json<PinLoginBody>) -> Result<(StatusCode, Json<ApiResponse<AuthResponse>>), ApiError> {
    Ok(ApiResponse::ok(s.pin_login(&req.business_id, &req.pin).await?))
}

#[derive(serde::Deserialize)]
pub struct VerifyPinBody { pub pin: String }
pub async fn verify_pin(State(s): State<IamState>, Extension(ctx): Extension<TenantContext>, Json(req): Json<VerifyPinBody>) -> Result<(StatusCode, Json<ApiResponse<serde_json::Value>>), ApiError> {
    let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
    let ok = s.verify_pin(&bid, &req.pin).await?;
    if !ok { return Err(ApiError::unauthorized("Invalid PIN")); }
    Ok(ApiResponse::ok(serde_json::json!({ "valid": true })))
}

pub async fn me(Extension(ctx): Extension<TenantContext>) -> Json<serde_json::Value> {
    Json(serde_json::json!({ "user_id": ctx.user_id, "tenant_id": ctx.tenant_id, "business_id": ctx.business_id, "role": ctx.role }))
}
pub async fn update_business(State(s): State<IamState>, Extension(ctx): Extension<TenantContext>, Json(req): Json<UpdateBusinessRequest>) -> Result<(StatusCode, Json<ApiResponse<BusinessPublic>>), ApiError> {
    let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
    Ok(ApiResponse::ok(s.update_business(&bid, req).await?))
}

// ── Staff ──────────────────────────────────────────────────────────────────
pub async fn create_staff(State(s): State<IamState>, Extension(ctx): Extension<TenantContext>, Json(req): Json<CreateStaffRequest>) -> Result<(StatusCode, Json<ApiResponse<StaffMemberPublic>>), ApiError> {
    let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
    let member = s.create_staff(&bid, &ctx.tenant_id.to_string(), req).await?;
    smeazy_common::audit::audit(&s.db, smeazy_common::audit::AuditEntry::new(&bid, "staff.create", "staff", format!("Added staff {} ({})", member.full_name.clone().unwrap_or_else(|| member.username.clone()), member.roles.join(", "))).actor(ctx.user_id.to_string()).entity(&member.user_id, member.username.clone())).await;
    Ok(ApiResponse::created(member))
}
pub async fn list_staff(State(s): State<IamState>, Extension(ctx): Extension<TenantContext>) -> Result<(StatusCode, Json<ApiResponse<Vec<StaffMemberPublic>>>), ApiError> {
    let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
    Ok(ApiResponse::ok(s.list_staff(&bid).await?))
}
pub async fn update_staff(State(s): State<IamState>, Extension(ctx): Extension<TenantContext>, Path(uid): Path<String>, Json(req): Json<UpdateStaffRequest>) -> Result<(StatusCode, Json<ApiResponse<StaffMemberPublic>>), ApiError> {
    let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
    let member = s.update_staff(&uid, &bid, req).await?;
    smeazy_common::audit::audit(&s.db, smeazy_common::audit::AuditEntry::new(&bid, "staff.update", "staff", format!("Updated staff {} (roles: {})", member.username, member.roles.join(", "))).actor(ctx.user_id.to_string()).entity(&member.user_id, member.username.clone())).await;
    Ok(ApiResponse::ok(member))
}
pub async fn reset_pin(State(s): State<IamState>, Extension(ctx): Extension<TenantContext>, Path(uid): Path<String>) -> Result<(StatusCode, Json<ApiResponse<serde_json::Value>>), ApiError> {
    let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
    let pin = s.reset_pin(&uid, &bid).await?;
    smeazy_common::audit::audit(&s.db, smeazy_common::audit::AuditEntry::new(&bid, "staff.reset_pin", "staff", "Reset a staff member's POS PIN").actor(ctx.user_id.to_string()).entity(&uid, "staff")).await;
    Ok(ApiResponse::ok(serde_json::json!({ "pos_pin": pin })))
}
pub async fn list_staff_pos(State(s): State<IamState>, Extension(ctx): Extension<TenantContext>) -> Result<(StatusCode, Json<ApiResponse<Vec<UserPublic>>>), ApiError> {
    let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
    Ok(ApiResponse::ok(s.list_staff_for_pos(&bid).await?))
}

// ── Profile ────────────────────────────────────────────────────────────────
pub async fn get_profile(State(s): State<IamState>, Extension(ctx): Extension<TenantContext>) -> Result<(StatusCode, Json<ApiResponse<UserProfile>>), ApiError> {
    Ok(ApiResponse::ok(s.get_profile(&ctx.user_id.to_string()).await?))
}
pub async fn update_profile(State(s): State<IamState>, Extension(ctx): Extension<TenantContext>, Json(req): Json<UpdateProfileRequest>) -> Result<(StatusCode, Json<ApiResponse<UserProfile>>), ApiError> {
    Ok(ApiResponse::ok(s.update_profile(&ctx.user_id.to_string(), req).await?))
}

// ── Registers ──────────────────────────────────────────────────────────────
pub async fn list_registers(State(s): State<IamState>, Extension(ctx): Extension<TenantContext>) -> Result<(StatusCode, Json<ApiResponse<Vec<RegisterPublic>>>), ApiError> {
    let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
    Ok(ApiResponse::ok(s.list_registers(&bid).await?))
}
pub async fn create_register(State(s): State<IamState>, Extension(ctx): Extension<TenantContext>, Json(req): Json<CreateRegisterRequest>) -> Result<(StatusCode, Json<ApiResponse<RegisterPublic>>), ApiError> {
    let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
    let reg = s.create_register(&bid, req).await?;
    smeazy_common::audit::audit(&s.db, smeazy_common::audit::AuditEntry::new(&bid, "register.create", "register", format!("Created register {} ({})", reg.name, reg.departments.join(", "))).actor(ctx.user_id.to_string()).entity(&reg.id, reg.name.clone())).await;
    Ok(ApiResponse::created(reg))
}
pub async fn update_register(State(s): State<IamState>, Extension(ctx): Extension<TenantContext>, Path(id): Path<String>, Json(req): Json<UpdateRegisterRequest>) -> Result<(StatusCode, Json<ApiResponse<RegisterPublic>>), ApiError> {
    let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
    Ok(ApiResponse::ok(s.update_register(&id, &bid, req).await?))
}

// ── Audit logs (admin-only) ──────────────────────────────────────────────────
#[derive(serde::Deserialize)]
pub struct AuditQuery {
    pub action: Option<String>, pub entity: Option<String>, pub actor: Option<String>,
    pub limit: Option<i64>, pub offset: Option<i64>,
}
pub async fn list_audit(State(s): State<IamState>, Extension(ctx): Extension<TenantContext>, axum::extract::Query(q): axum::extract::Query<AuditQuery>) -> Result<(StatusCode, Json<ApiResponse<serde_json::Value>>), ApiError> {
    if !smeazy_common::roles::is_admin(&ctx) { return Err(ApiError::forbidden("Only admins can view logs")); }
    let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
    let logs = s.list_audit_logs(&bid, q.action.as_deref(), q.entity.as_deref(), q.actor.as_deref(), q.limit.unwrap_or(100), q.offset.unwrap_or(0)).await?;
    let total = s.count_audit_logs(&bid).await?;
    let (actions, entities) = s.audit_facets(&bid).await?;
    Ok(ApiResponse::ok(serde_json::json!({ "logs": logs, "total": total, "actions": actions, "entities": entities })))
}

// ── Business settings ────────────────────────────────────────────────────────
pub async fn payment_config(State(s): State<IamState>, Extension(ctx): Extension<TenantContext>) -> Result<(StatusCode, Json<ApiResponse<serde_json::Value>>), ApiError> {
    let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
    Ok(ApiResponse::ok(s.payment_config(&bid).await?))
}
pub async fn get_settings(State(s): State<IamState>, Extension(ctx): Extension<TenantContext>) -> Result<(StatusCode, Json<ApiResponse<std::collections::HashMap<String,String>>>), ApiError> {
    if !smeazy_common::roles::is_admin(&ctx) { return Err(ApiError::forbidden("Only admins can view full settings")); }
    let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
    Ok(ApiResponse::ok(s.get_settings(&bid).await?))
}
#[derive(serde::Deserialize)]
pub struct SettingUpdate { pub settings: std::collections::HashMap<String, String> }
pub async fn update_settings(State(s): State<IamState>, Extension(ctx): Extension<TenantContext>, Json(req): Json<SettingUpdate>) -> Result<(StatusCode, Json<ApiResponse<std::collections::HashMap<String,String>>>), ApiError> {
    if !smeazy_common::roles::is_admin(&ctx) { return Err(ApiError::forbidden("Only admins can change settings")); }
    let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
    for (k, v) in &req.settings { s.set_setting(&bid, k, v).await?; }
    smeazy_common::audit::audit(&s.db, smeazy_common::audit::AuditEntry::new(&bid, "settings.update", "settings", "Updated business settings").actor(ctx.user_id.to_string()).meta(&req.settings)).await;
    Ok(ApiResponse::ok(s.get_settings(&bid).await?))
}
