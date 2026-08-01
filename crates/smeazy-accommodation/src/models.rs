use serde::{Deserialize, Serialize};

/// Room status lifecycle:
///   ready     — key is at reception, room can be booked
///   occupied  — room item is on an order (check-in)
///   readying  — checkout time (next 11am after check-in) has passed; housekeeping needed
pub const STATUS_READY: &str = "ready";
pub const STATUS_OCCUPIED: &str = "occupied";
pub const STATUS_READYING: &str = "readying";

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct RoomRow {
    pub id: String,
    pub business_id: String,
    pub item_id: String,
    pub status: String,
    pub current_order_id: Option<String>,
    pub occupied_at: Option<String>,
    pub updated_at: String,
    // joined from inventory_items
    pub item_name: String,
    pub item_sku: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct RoomPublic {
    pub item_id: String,
    pub room_name: String,
    pub sku: Option<String>,
    pub status: String,
    pub current_order_id: Option<String>,
    pub occupied_at: Option<String>,
    /// When this room is expected to move from occupied -> readying (for display only).
    pub next_readying_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SetReadyReq {
    /// Optional note, e.g. "Key returned to reception by Jane"
    pub notes: Option<String>,
}
