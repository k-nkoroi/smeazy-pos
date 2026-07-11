use axum::{middleware, routing::post, Router};
use smeazy_common::middleware::{require_auth, AuthState};
use super::{handlers::*, service::MpesaService};
use std::sync::Arc;

pub fn mpesa_routes(svc: Arc<MpesaService>, auth: AuthState) -> Router {
    let protected = Router::new()
        .route("/mpesa/stk-push",    post(stk_push))
        .route("/mpesa/mock-settle", post(mock_settle))
        .route_layer(middleware::from_fn_with_state(auth, require_auth))
        .with_state(svc.clone());

    // Webhook is public (Daraja calls it)
    let webhook = Router::new()
        .route("/webhooks/mpesa/stk-callback", post(stk_callback))
        .with_state(svc);

    Router::new().merge(protected).merge(webhook)
}
