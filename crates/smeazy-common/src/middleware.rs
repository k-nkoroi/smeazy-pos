use axum::{extract::Request, middleware::Next, response::Response, http::header::AUTHORIZATION};
use smeazy_domain::{TenantContext, UserRoleType};
use std::sync::Arc;
use uuid::Uuid;

#[derive(Clone)]
pub struct AuthState { pub jwt_secret: Arc<String> }

#[derive(Debug, serde::Deserialize, serde::Serialize)]
pub struct Claims {
    pub sub: String, pub tenant_id: String,
    pub business_id: Option<String>, pub role: String,
    pub exp: i64, pub iat: i64,
}

pub async fn require_auth(
    axum::extract::State(auth): axum::extract::State<AuthState>,
    mut req: Request, next: Next,
) -> Response {
    use crate::ApiError;
    use axum::response::IntoResponse;
    let token = req.headers().get(AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(|s| s.to_string());
    let token = match token { Some(t) => t, None => return ApiError::unauthorized("Missing Authorization header").into_response() };
    let claims = match verify_jwt(&token, &auth.jwt_secret) { Ok(c) => c, Err(_) => return ApiError::unauthorized("Invalid or expired token").into_response() };
    let ctx = TenantContext {
        user_id:     Uuid::parse_str(&claims.sub).unwrap_or_default(),
        tenant_id:   Uuid::parse_str(&claims.tenant_id).unwrap_or_default(),
        business_id: claims.business_id.and_then(|s| Uuid::parse_str(&s).ok()),
        role:        UserRoleType::from_str(&claims.role),
    };
    req.extensions_mut().insert(ctx);
    next.run(req).await
}

fn verify_jwt(token: &str, secret: &str) -> Result<Claims, ()> {
    use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
    decode::<Claims>(token, &DecodingKey::from_secret(secret.as_bytes()), &Validation::new(Algorithm::HS256))
        .map(|d| d.claims).map_err(|_| ())
}
