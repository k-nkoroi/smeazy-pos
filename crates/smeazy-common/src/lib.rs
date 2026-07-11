//! Shared HTTP helpers V2

use axum::{http::StatusCode, response::{IntoResponse, Response}, Json};
use serde::Serialize;
use serde_json::json;
use std::fmt;
use uuid::Uuid;

pub mod middleware;
pub mod audit;

#[derive(Serialize)]
pub struct ApiResponse<T: Serialize> {
    pub success: bool, pub data: Option<T>,
    pub message: Option<String>, pub request_id: String,
}
impl<T: Serialize> ApiResponse<T> {
    pub fn ok(data: T) -> (StatusCode, Json<Self>) {
        (StatusCode::OK, Json(Self { success: true, data: Some(data), message: None,
            request_id: Uuid::new_v4().to_string() }))
    }
    pub fn created(data: T) -> (StatusCode, Json<Self>) {
        (StatusCode::CREATED, Json(Self { success: true, data: Some(data), message: None,
            request_id: Uuid::new_v4().to_string() }))
    }
}

#[derive(Debug)]
pub struct ApiError { pub status: StatusCode, pub code: &'static str, pub message: String }

impl fmt::Display for ApiError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}
impl std::error::Error for ApiError {}

impl ApiError {
    pub fn bad_request(msg: impl Into<String>) -> Self { Self { status: StatusCode::BAD_REQUEST,           code: "BAD_REQUEST",    message: msg.into() } }
    pub fn unauthorized(msg: impl Into<String>) -> Self { Self { status: StatusCode::UNAUTHORIZED,         code: "UNAUTHORIZED",   message: msg.into() } }
    pub fn forbidden(msg: impl Into<String>) -> Self { Self { status: StatusCode::FORBIDDEN,               code: "FORBIDDEN",      message: msg.into() } }
    pub fn not_found(msg: impl Into<String>) -> Self { Self { status: StatusCode::NOT_FOUND,               code: "NOT_FOUND",      message: msg.into() } }
    pub fn conflict(msg: impl Into<String>) -> Self { Self { status: StatusCode::CONFLICT,                 code: "CONFLICT",       message: msg.into() } }
    pub fn internal(msg: impl Into<String>) -> Self { Self { status: StatusCode::INTERNAL_SERVER_ERROR,    code: "INTERNAL_ERROR", message: msg.into() } }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let body = json!({ "success": false, "error": { "code": self.code, "message": self.message }, "request_id": Uuid::new_v4().to_string() });
        (self.status, Json(body)).into_response()
    }
}

impl From<smeazy_domain::DomainError> for ApiError {
    fn from(e: smeazy_domain::DomainError) -> Self {
        match e {
            smeazy_domain::DomainError::NotFound { entity, id } => Self::not_found(format!("{} {} not found", entity, id)),
            smeazy_domain::DomainError::Unauthorized { .. }     => Self::forbidden(e.to_string()),
            smeazy_domain::DomainError::Validation(msg)         => Self::bad_request(msg),
            smeazy_domain::DomainError::Conflict(msg)           => Self::conflict(msg),
        }
    }
}

impl From<sqlx::Error> for ApiError {
    fn from(e: sqlx::Error) -> Self {
        tracing::error!(error = ?e, "Database error");
        match e {
            sqlx::Error::RowNotFound => Self::not_found("Resource not found"),
            _ => Self::internal("Database error"),
        }
    }
}

/// Role-tier helpers for authorization. The JWT primary role is seniority-ordered,
/// so checking the primary role is sufficient to gate admin/manager features.
pub mod roles {
    use smeazy_domain::{TenantContext, UserRoleType};

    /// Owner or admin staff — full administrative control (Logs, settings, etc.)
    pub fn is_admin(ctx: &TenantContext) -> bool {
        matches!(ctx.role, UserRoleType::Entrepreneur | UserRoleType::AdminStaff | UserRoleType::Solopreneur)
    }
    /// Admin OR executive/manager — can edit inventory, view staff analytics.
    pub fn is_manager_or_admin(ctx: &TenantContext) -> bool {
        is_admin(ctx) || matches!(ctx.role, UserRoleType::ExecutiveStaff)
    }
}
