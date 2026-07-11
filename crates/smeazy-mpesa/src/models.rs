use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Exact Daraja STK Push callback shape
#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct DarajaCallback {
    #[serde(rename = "Body")]
    pub body: CallbackBody,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct CallbackBody {
    #[serde(rename = "stkCallback")]
    pub stk_callback: StkCallback,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct StkCallback {
    pub merchant_request_id:  String,
    pub checkout_request_id:  String,
    pub result_code:          i32,
    pub result_desc:          String,
    pub callback_metadata:    Option<CallbackMetadata>,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct CallbackMetadata {
    #[serde(rename = "Item")]
    pub item: Vec<MetaItem>,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct MetaItem {
    pub name:  String,
    pub value: Option<serde_json::Value>,
}
impl CallbackMetadata {
    pub fn get(&self, name: &str) -> Option<&serde_json::Value> {
        self.item.iter().find(|i| i.name == name)?.value.as_ref()
    }
}

/// STK Push initiation request (outgoing to Daraja)
#[derive(Debug, Serialize, Deserialize)]
pub struct StkPushReq {
    pub order_id:    Uuid,
    pub phone:       String,
    pub amount:      Decimal,
    pub description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct MpesaTx {
    pub id:                   Uuid,
    pub tenant_id:            Uuid,
    pub business_id:          Uuid,
    pub order_id:             Option<Uuid>,
    pub checkout_request_id:  Option<String>,
    pub merchant_request_id:  Option<String>,
    pub result_code:          Option<String>,
    pub mpesa_receipt_no:     Option<String>,
    pub amount:               Decimal,
    pub msisdn:               String,
    pub status:               String,
    pub created_at:           DateTime<Utc>,
    pub settled_at:           Option<DateTime<Utc>>,
}
