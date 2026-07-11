use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct FloorTable {
    pub id: String, pub business_id: String, pub area_name: String,
    pub table_name: String, pub capacity: i64,
    pub pos_x: i64, pub pos_y: i64, pub shape: String, pub is_active: i64,
}

#[derive(Debug, Serialize)]
pub struct TableWithStatus {
    #[serde(flatten)] pub table: FloorTable,
    pub status: String,           // "available" | "occupied"
    pub order_id: Option<String>,
    pub order_total: Option<f64>,
    pub waitstaff_name: Option<String>,
    pub guest_count: Option<i64>,
    pub opened_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateTableReq {
    pub table_name: String, pub area_name: Option<String>,
    pub capacity: Option<i64>, pub pos_x: Option<i64>, pub pos_y: Option<i64>,
    pub shape: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTableReq {
    pub table_name: Option<String>, pub area_name: Option<String>,
    pub capacity: Option<i64>, pub pos_x: Option<i64>, pub pos_y: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct TransferTableReq { pub from_table_id: String, pub to_table_id: String }
#[derive(Debug, Deserialize)]
pub struct MergeTablesReq { pub source_table_id: String, pub target_table_id: String }
