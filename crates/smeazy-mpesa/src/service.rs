use rust_decimal::Decimal;
use sqlx::PgPool;
use uuid::Uuid;
use smeazy_common::ApiError;
use smeazy_domain::TenantContext;
use super::models::*;

#[derive(Debug, Clone)]
pub struct SettlementEvent {
    pub checkout_request_id: String,
    pub mpesa_receipt:       String,
    pub amount:              Decimal,
}

pub struct MpesaService {
    pub db:        PgPool,
    pub tx:        tokio::sync::broadcast::Sender<SettlementEvent>,
    pub mock_mode: bool,
}

impl MpesaService {
    pub fn new(db: PgPool, mock_mode: bool) -> Self {
        let (tx, _) = tokio::sync::broadcast::channel(256);
        Self { db, tx, mock_mode }
    }

    pub async fn initiate_stk(&self, ctx: &TenantContext, req: StkPushReq) -> Result<String, ApiError> {
        let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?;
        let checkout_id = if self.mock_mode {
            format!("MOCK-{}", Uuid::new_v4())
        } else {
            return Err(ApiError::internal("Live Daraja not configured"));
        };

        let msisdn_hash = hex::encode(
            ring::digest::digest(&ring::digest::SHA256, req.phone.as_bytes())
        );

        sqlx::query(
            "INSERT INTO mpesa_transactions
             (id,tenant_id,business_id,order_id,checkout_request_id,amount,msisdn,status)
             VALUES($1,$2,$3,$4,$5,$6,$7,'pending')"
        )
        .bind(Uuid::new_v4())
        .bind(ctx.tenant_id)
        .bind(bid)
        .bind(req.order_id)
        .bind(&checkout_id)
        .bind(req.amount)
        .bind(&msisdn_hash)
        .execute(&self.db).await.map_err(ApiError::from)?;

        Ok(checkout_id)
    }

    pub async fn process_callback(&self, payload: DarajaCallback) -> Result<(), ApiError> {
        let cb = &payload.body.stk_callback;
        let status = if cb.result_code == 0 { "success" } else { "failed" };

        sqlx::query(
            "UPDATE mpesa_transactions
             SET result_code=$1, status=$2,
                 settled_at = CASE WHEN $3 THEN NOW() ELSE NULL END
             WHERE checkout_request_id=$4"
        )
        .bind(&cb.result_code.to_string())
        .bind(status)
        .bind(cb.result_code == 0)
        .bind(&cb.checkout_request_id)
        .execute(&self.db).await.map_err(ApiError::from)?;

        if cb.result_code != 0 { return Ok(()); }

        let meta = cb.callback_metadata.as_ref()
            .ok_or_else(|| ApiError::internal("Missing callback metadata"))?;

        let receipt = meta.get("MpesaReceiptNumber")
            .and_then(|v| v.as_str()).unwrap_or("").to_string();
        let amount = meta.get("Amount")
            .and_then(|v| v.as_f64()).unwrap_or(0.0);

        sqlx::query(
            "UPDATE mpesa_transactions SET mpesa_receipt_no=$1 WHERE checkout_request_id=$2"
        )
        .bind(&receipt)
        .bind(&cb.checkout_request_id)
        .execute(&self.db).await.map_err(ApiError::from)?;

        sqlx::query(
            "UPDATE pos_orders SET status='paid', closed_at=NOW()
             WHERE id = (SELECT order_id FROM mpesa_transactions WHERE checkout_request_id=$1)"
        )
        .bind(&cb.checkout_request_id)
        .execute(&self.db).await.map_err(ApiError::from)?;

        let _ = self.tx.send(SettlementEvent {
            checkout_request_id: cb.checkout_request_id.clone(),
            mpesa_receipt: receipt,
            amount: Decimal::try_from(amount).unwrap_or_default(),
        });
        Ok(())
    }

    pub async fn mock_settle(&self, ctx: &TenantContext, order_id: Uuid) -> Result<(), ApiError> {
        if !self.mock_mode {
            return Err(ApiError::bad_request("Mock mode not enabled"));
        }
        sqlx::query(
            "UPDATE pos_orders SET status='paid', closed_at=NOW() WHERE id=$1 AND tenant_id=$2"
        )
        .bind(order_id)
        .bind(ctx.tenant_id)
        .execute(&self.db).await.map_err(ApiError::from)?;
        Ok(())
    }
}
