use axum::{extract::{Query, State}, http::{header, StatusCode}, Extension, Json, response::Response};
use std::sync::Arc;
use smeazy_common::{ApiError, ApiResponse};
use smeazy_domain::TenantContext;
use super::{models::*, service::AnalyticsService};
pub type AnalyticsState = Arc<AnalyticsService>;

fn bid_of(ctx: &TenantContext) -> Result<String, ApiError> {
    ctx.business_id.map(|b| b.to_string()).ok_or_else(|| ApiError::forbidden("No business context"))
}
fn csv_response(csv: String, filename: String) -> Response {
    Response::builder().status(200)
        .header(header::CONTENT_TYPE, "text/csv; charset=utf-8")
        .header(header::CONTENT_DISPOSITION, format!("attachment; filename=\"{}\"", filename))
        .body(axum::body::Body::from(csv)).unwrap()
}

pub async fn revenue(State(s): State<AnalyticsState>, Extension(ctx): Extension<TenantContext>, Query(q): Query<AnalyticsQuery>) -> Result<(StatusCode, Json<ApiResponse<RevenueReport>>), ApiError> {
    Ok(ApiResponse::ok(s.revenue_report(&bid_of(&ctx)?, &q).await?))
}
pub async fn products(State(s): State<AnalyticsState>, Extension(ctx): Extension<TenantContext>, Query(q): Query<AnalyticsQuery>) -> Result<(StatusCode, Json<ApiResponse<ProductReport>>), ApiError> {
    Ok(ApiResponse::ok(s.product_report(&bid_of(&ctx)?, &q).await?))
}
pub async fn categories(State(s): State<AnalyticsState>, Extension(ctx): Extension<TenantContext>, Query(q): Query<AnalyticsQuery>) -> Result<(StatusCode, Json<ApiResponse<CategoryReport>>), ApiError> {
    Ok(ApiResponse::ok(s.category_report(&bid_of(&ctx)?, &q).await?))
}
pub async fn staff(State(s): State<AnalyticsState>, Extension(ctx): Extension<TenantContext>, Query(q): Query<AnalyticsQuery>) -> Result<(StatusCode, Json<ApiResponse<StaffReport>>), ApiError> {
    if !smeazy_common::roles::is_manager_or_admin(&ctx) { return Err(ApiError::forbidden("Only admins and managers can view staff analytics")); }
    Ok(ApiResponse::ok(s.staff_report(&bid_of(&ctx)?, &q).await?))
}
pub async fn export_revenue(State(s): State<AnalyticsState>, Extension(ctx): Extension<TenantContext>, Query(q): Query<AnalyticsQuery>) -> Result<Response, ApiError> {
    let csv = s.export_revenue_csv(&bid_of(&ctx)?, &q).await?;
    Ok(csv_response(csv, format!("revenue_{}_{}.csv", q.start_date.as_deref().unwrap_or("all"), q.end_date.as_deref().unwrap_or("today"))))
}
pub async fn export_products(State(s): State<AnalyticsState>, Extension(ctx): Extension<TenantContext>, Query(q): Query<AnalyticsQuery>) -> Result<Response, ApiError> {
    let csv = s.export_products_csv(&bid_of(&ctx)?, &q).await?;
    Ok(csv_response(csv, format!("products_{}_{}.csv", q.start_date.as_deref().unwrap_or("all"), q.end_date.as_deref().unwrap_or("today"))))
}
pub async fn export_categories(State(s): State<AnalyticsState>, Extension(ctx): Extension<TenantContext>, Query(q): Query<AnalyticsQuery>) -> Result<Response, ApiError> {
    let csv = s.export_categories_csv(&bid_of(&ctx)?, &q).await?;
    Ok(csv_response(csv, format!("categories_{}_{}.csv", q.start_date.as_deref().unwrap_or("all"), q.end_date.as_deref().unwrap_or("today"))))
}
pub async fn export_staff(State(s): State<AnalyticsState>, Extension(ctx): Extension<TenantContext>, Query(q): Query<AnalyticsQuery>) -> Result<Response, ApiError> {
    if !smeazy_common::roles::is_manager_or_admin(&ctx) { return Err(ApiError::forbidden("Only admins and managers can export staff analytics")); }
    let csv = s.export_staff_csv(&bid_of(&ctx)?, &q).await?;
    Ok(csv_response(csv, format!("staff_{}_{}.csv", q.start_date.as_deref().unwrap_or("all"), q.end_date.as_deref().unwrap_or("today"))))
}
