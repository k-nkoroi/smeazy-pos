use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Category {
    pub id: String, pub business_id: String, pub name: String,
    pub color: String, pub icon: Option<String>,
    pub sort_order: i64, pub is_active: i64,
    pub department: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct InventoryItem {
    pub id: String, pub business_id: String,
    pub category_id: Option<String>, pub category_name: Option<String>,
    pub category_department: Option<String>,
    pub sku: String, pub name: String, pub description: Option<String>,
    pub item_type: String, pub quantity_on_hand: f64, pub reorder_level: f64,
    pub unit_of_measure: String, pub cost_price: Option<f64>,
    pub sale_price: Option<f64>, pub image_url: Option<String>,
    pub tags: Option<String>, pub track_inventory: i64, pub is_active: i64,
    pub legacy_pos_id: Option<String>,
    pub is_assembled: i64,
}

#[derive(Debug, Deserialize)]
pub struct CreateCategoryReq { pub name: String, pub color: Option<String>, pub icon: Option<String>, pub sort_order: Option<i64>, pub department: Option<String> }

#[derive(Debug, Deserialize)]
pub struct CreateItemReq {
    pub sku: Option<String>, pub name: String, pub category_id: Option<String>,
    pub description: Option<String>, pub item_type: Option<String>,
    pub quantity: Option<f64>, pub reorder_level: Option<f64>,
    pub unit_of_measure: Option<String>, pub cost_price: Option<f64>,
    pub sale_price: Option<f64>, pub image_url: Option<String>,
    pub tags: Option<String>, pub track_inventory: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateItemReq {
    pub name: Option<String>, pub category_id: Option<String>,
    pub description: Option<String>, pub cost_price: Option<f64>,
    pub sale_price: Option<f64>, pub reorder_level: Option<f64>,
    pub is_active: Option<bool>, pub image_url: Option<String>, pub tags: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AdjustStockReq { pub delta: f64, pub reason: Option<String> }

#[derive(Debug, serde::Deserialize)]
pub struct SpoilReq { pub quantity: f64, pub reason: Option<String> }

#[derive(Debug, serde::Deserialize)]
pub struct UpdateCategoryReq {
    pub name: Option<String>, pub color: Option<String>,
    pub department: Option<String>, pub sort_order: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct LowStockAlert {
    pub item_id: String, pub sku: String, pub name: String,
    pub on_hand: f64, pub reorder: f64, pub category_name: Option<String>,
    pub unit_of_measure: String, pub cost_price: Option<f64>,
}

#[derive(Debug, Serialize)]
pub struct ImportResult { pub imported: usize, pub skipped: usize, pub errors: Vec<String> }

// ── Stock take ────────────────────────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct StockTake {
    pub id: String, pub business_id: String, pub performed_by: String,
    pub performer_name: Option<String>, pub status: String,
    pub notes: Option<String>, pub started_at: String, pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct StockTakeLine {
    pub id: String, pub stock_take_id: String,
    pub item_id: String, pub item_name: String, pub item_sku: String,
    pub category_name: Option<String>,
    pub expected_qty: f64, pub counted_qty: Option<f64>,
    pub variance: Option<f64>, pub unit_of_measure: String,
    pub reorder_level: f64, pub sale_price: Option<f64>,
}

#[derive(Debug, Serialize)]
pub struct StockTakeWithLines { #[serde(flatten)] pub take: StockTake, pub lines: Vec<StockTakeLine> }

#[derive(Debug, Deserialize)]
pub struct StartStockTakeReq { pub notes: Option<String> }
#[derive(Debug, Deserialize)]
pub struct CountLineReq { pub counted_qty: f64 }

// ── Suppliers ─────────────────────────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Supplier {
    pub id: String, pub business_id: String, pub name: String,
    pub contact_name: Option<String>, pub phone: Option<String>,
    pub email: Option<String>, pub address: Option<String>,
    pub notes: Option<String>, pub is_active: i64, pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateSupplierReq {
    pub name: String, pub contact_name: Option<String>, pub phone: Option<String>,
    pub email: Option<String>, pub address: Option<String>, pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSupplierReq {
    pub name: Option<String>, pub contact_name: Option<String>, pub phone: Option<String>,
    pub email: Option<String>, pub address: Option<String>, pub notes: Option<String>,
    pub is_active: Option<bool>,
}

// ── Requisitions (Purchase Orders) ────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Requisition {
    pub id: String, pub business_id: String, pub ref_number: String,
    pub raised_by: String, pub raiser_name: Option<String>,
    pub supplier_id: Option<String>, pub supplier_name: Option<String>,
    pub status: String, pub notes: Option<String>,
    pub created_at: String, pub submitted_at: Option<String>, pub received_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct RequisitionLine {
    pub id: String, pub requisition_id: String,
    pub item_id: Option<String>, pub item_name: String, pub item_sku: Option<String>,
    pub unit_of_measure: String, pub requested_qty: f64,
    pub received_qty: f64, pub unit_cost: Option<f64>,
    pub notes: Option<String>, pub received_at: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct RequisitionWithLines { #[serde(flatten)] pub req: Requisition, pub lines: Vec<RequisitionLine> }

#[derive(Debug, Deserialize)]
pub struct CreateRequisitionReq {
    pub supplier_id: Option<String>,
    pub notes: Option<String>,
    pub lines: Vec<CreateRequisitionLine>,
}
#[derive(Debug, Deserialize)]
pub struct CreateRequisitionLine {
    pub item_id: Option<String>, pub item_name: String, pub item_sku: Option<String>,
    pub unit_of_measure: Option<String>, pub requested_qty: f64,
    pub unit_cost: Option<f64>, pub notes: Option<String>,
}
#[derive(Debug, Deserialize)]
pub struct ReceiveLineReq { pub received_qty: f64 }

// ── Recipes / Bill of Materials ───────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct RecipeComponentRow {
    pub id: String, pub product_id: String, pub ingredient_id: String, pub quantity: f64,
}

#[derive(Debug, Serialize, Clone)]
pub struct RecipeComponent {
    pub id: String, pub ingredient_id: String, pub ingredient_name: String,
    pub ingredient_unit: String, pub quantity: f64,
    pub ingredient_on_hand: f64,
}

#[derive(Debug, Serialize, Clone)]
pub struct ProductRecipe {
    pub product_id: String, pub product_name: String,
    pub is_assembled: bool,
    pub components: Vec<RecipeComponent>,
    /// How many finished units can be made from current ingredient stock.
    pub buildable_qty: f64,
}

#[derive(Debug, Deserialize)]
pub struct SetRecipeReq {
    pub is_assembled: bool,
    pub components: Vec<RecipeComponentInput>,
}
#[derive(Debug, Deserialize)]
pub struct RecipeComponentInput { pub ingredient_id: String, pub quantity: f64 }
