use axum::{middleware, routing::{delete, get, post, put}, Router};
use smeazy_common::middleware::{require_auth, AuthState};
use super::{handlers::*, service::IamService};
use std::sync::Arc;

pub fn iam_routes(svc: Arc<IamService>, auth: AuthState) -> Router {
    let public = Router::new()
        .route("/auth/register",  post(register))
        .route("/auth/login",     post(login))
        .route("/auth/pin-login", post(pin_login))
        .with_state(svc.clone());
    let protected = Router::new()
        .route("/auth/me",              get(me))
        .route("/auth/verify-pin",      post(verify_pin))
        .route("/auth/staff",           get(list_staff_pos))
        .route("/auth/profile",         get(get_profile).put(update_profile))
        .route("/auth/business",        put(update_business))
        .route("/staff",                get(list_staff).post(create_staff))
        .route("/staff/:uid",           put(update_staff))
        .route("/staff/:uid/reset-pin", post(reset_pin))
        .route("/registers",            get(list_registers).post(create_register))
        .route("/registers/:id",        put(update_register))
        .route("/audit-logs",           get(list_audit))
        .route("/settings",             get(get_settings).put(update_settings))
        .route("/payment-config",       get(payment_config))
        .route("/settings/receipt-templates",     get(list_receipt_templates).post(create_receipt_template))
        .route("/settings/receipt-templates/:id", put(update_receipt_template).delete(delete_receipt_template))
        .route_layer(middleware::from_fn_with_state(auth, require_auth))
        .with_state(svc);
    Router::new().merge(public).merge(protected)
}
