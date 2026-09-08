use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct PosOrder {
    pub id: String, pub business_id: String,
    pub table_id: Option<String>, pub table_name: Option<String>,
    pub guest_count: i64, pub cashier_id: String,
    pub waitstaff_id: Option<String>, pub waitstaff_name: Option<String>,
    pub customer_name: Option<String>, pub customer_phone: Option<String>,
    pub customer_id: Option<String>,
    pub status: String, pub total_amount: f64, pub discount: f64,
    pub balance_due: f64,
    pub notes: Option<String>, pub opened_at: String,
    pub closed_at: Option<String>, pub kitchen_sent_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct OrderItem {
    pub id: String, pub order_id: String,
    pub item_id: Option<String>, pub name: String,
    pub sku: Option<String>, pub quantity: i64,
    pub unit_price: f64, pub discount: f64,
    pub status: String, pub notes: Option<String>,
    pub added_at: String, pub dispatched_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct PaymentRecord {
    pub id: String, pub order_id: String,
    pub method: String, pub amount: f64,
    pub reference: Option<String>, pub confirmed_at: String,
}

#[derive(Debug, Serialize)]
pub struct OrderWithItems {
    #[serde(flatten)] pub order: PosOrder,
    pub items: Vec<OrderItem>,
    pub payments: Vec<PaymentRecord>,
}

#[derive(Debug, Deserialize)]
pub struct CreateOrderReq {
    pub table_id: Option<String>,
    pub table_name: Option<String>,
    pub guest_count: Option<i64>,
    pub waitstaff_id: Option<String>,
    pub waitstaff_name: Option<String>,
    pub customer_name: Option<String>,
    pub customer_phone: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AddItemReq {
    pub item_id: Option<String>,
    pub name: String,
    pub sku: Option<String>,
    pub quantity: i64,
    pub unit_price: f64,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateItemQuantityReq { pub quantity: i64 }

#[derive(Debug, Deserialize)]
pub struct UpdateItemStatusReq {
    pub status: String,   // "new" | "processing" | "dispatched"
}

#[derive(Debug, Deserialize)]
pub struct ConfirmPaymentReq {
    pub method: String,      // "cash" | "mpesa" | "card"
    pub amount: f64,
    pub reference: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CheckoutReq {
    pub payments: Vec<ConfirmPaymentReq>,
    pub discount: Option<f64>,
    /// Director rate: None | "directors_promo" (100% off) | "directors_discount" (at cost)
    pub discount_type: Option<String>,
    /// User id of the admin/manager authorising a director rate.
    pub authorized_by: Option<String>,
    /// If true and the payments don't cover the total, the shortfall is opened
    /// as a customer tab (order status='tab') instead of being rejected. The
    /// order must already have a customer attached (see AttachCustomerReq).
    pub allow_partial: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct CheckoutResult {
    pub order_id: String,
    pub total: f64,
    pub net_amount: f64,
    pub vat_amount: f64,
    pub paid: f64,
    pub change_due: f64,
    pub balance_due: f64,
    pub status: String,
    pub payments: Vec<PaymentRecord>,
}

// ── Customers / tabs ──────────────────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Customer {
    pub id: String, pub business_id: String, pub name: String,
    pub phone: Option<String>, pub email: Option<String>, pub notes: Option<String>,
    pub created_at: String, pub updated_at: String,
}

#[derive(Debug, Serialize)]
pub struct CustomerWithBalance {
    #[serde(flatten)] pub customer: Customer,
    pub balance_due: f64,
    pub open_tabs: i64,
}

#[derive(Debug, Serialize)]
pub struct CustomerDetail {
    #[serde(flatten)] pub customer: Customer,
    pub balance_due: f64,
    pub orders: Vec<PosOrder>,
}

#[derive(Debug, Deserialize)]
pub struct CreateCustomerReq {
    pub name: String, pub phone: Option<String>, pub email: Option<String>, pub notes: Option<String>,
}

/// Attach a (possibly new) customer to an order. As the waiter types a name into
/// the search bar, the frontend calls the search endpoint for live suggestions;
/// picking one sends its id here, otherwise just the typed name/phone is sent
/// and a new customer is created on demand.
#[derive(Debug, Deserialize)]
pub struct AttachCustomerReq {
    pub customer_id: Option<String>,
    pub name: String,
    pub phone: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PayTabReq { pub payments: Vec<ConfirmPaymentReq> }

#[derive(Debug, Deserialize)]
pub struct ApplyDiscountReq { pub discount: f64 }
#[derive(Debug, Deserialize)]
pub struct UpdateWaitstaffReq { pub waitstaff_id: String, pub waitstaff_name: String }
#[derive(Debug, Deserialize)]
pub struct SendToKitchenReq { pub notes: Option<String> }
