use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct KitchenOrder {
    pub id: String, pub order_id: String, pub business_id: String,
    pub table_name: String, pub waitstaff_name: Option<String>,
    pub status: String, pub priority: i64, pub notes: Option<String>,
    pub sent_at: String, pub acknowledged_at: Option<String>, pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct KitchenItem {
    pub id: String, pub kitchen_order_id: String,
    pub order_item_id: Option<String>, pub name: String,
    pub quantity: i64, pub notes: Option<String>,
    pub status: String, pub dispatched_at: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct KitchenOrderWithItems {
    #[serde(flatten)] pub order: KitchenOrder,
    pub items: Vec<KitchenItem>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateKitchenItemReq { pub status: String }
#[derive(Debug, Deserialize)]
pub struct AcknowledgeReq { pub kitchen_order_id: String }
