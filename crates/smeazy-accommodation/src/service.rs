use chrono::{DateTime, Local, NaiveTime, TimeZone};
use sqlx::SqlitePool;
use uuid::Uuid;
use smeazy_common::ApiError;
use smeazy_domain::TenantContext;
use super::models::*;

pub struct AccommodationService {
    pub db: SqlitePool,
}

impl AccommodationService {
    pub fn new(db: SqlitePool) -> Self {
        Self { db }
    }

    /// The next 11:00 local time strictly after `from`. If `from` is already before
    /// today's 11am, that's the threshold; otherwise it's tomorrow's 11am.
    fn next_11am_after(from: DateTime<Local>) -> DateTime<Local> {
        let today_11 = Local
            .from_local_datetime(&from.date_naive().and_time(NaiveTime::from_hms_opt(11, 0, 0).unwrap()))
            .single()
            .unwrap_or(from);
        if today_11 > from { today_11 } else { today_11 + chrono::Duration::days(1) }
    }

    /// List every Accommodation-department item as a "Room", lazily creating a
    /// status row (defaulting to Ready) for any that don't have one yet.
    pub async fn list_rooms(&self, business_id: &str) -> Result<Vec<RoomPublic>, ApiError> {
        // Ensure every accommodation item has a room row.
        let item_ids = sqlx::query_scalar::<_, String>(
            "SELECT i.id FROM inventory_items i JOIN product_categories c ON c.id = i.category_id
             WHERE i.business_id=? AND i.is_active=1 AND c.department='Accommodation'")
            .bind(business_id).fetch_all(&self.db).await.map_err(ApiError::from)?;
        for item_id in &item_ids {
            sqlx::query("INSERT OR IGNORE INTO accommodation_rooms (id,business_id,item_id,status) VALUES (?,?,?,'ready')")
                .bind(Uuid::new_v4().to_string()).bind(business_id).bind(item_id)
                .execute(&self.db).await.map_err(ApiError::from)?;
        }

        let rows = sqlx::query_as::<_, RoomRow>(
            "SELECT r.id, r.business_id, r.item_id, r.status, r.current_order_id, r.occupied_at, r.updated_at,
                    i.name as item_name, i.sku as item_sku
             FROM accommodation_rooms r JOIN inventory_items i ON i.id = r.item_id
             WHERE r.business_id=? ORDER BY i.name")
            .bind(business_id).fetch_all(&self.db).await.map_err(ApiError::from)?;

        Ok(rows.into_iter().map(|r| {
            let next_readying_at = if r.status == STATUS_OCCUPIED {
                r.occupied_at.as_deref()
                    .and_then(|s| chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S").ok())
                    .and_then(|naive| Local.from_local_datetime(&naive).single())
                    .map(|dt| Self::next_11am_after(dt).to_rfc3339())
            } else { None };
            RoomPublic {
                item_id: r.item_id, room_name: r.item_name, sku: r.item_sku,
                status: r.status, current_order_id: r.current_order_id,
                occupied_at: r.occupied_at, next_readying_at,
            }
        }).collect())
    }

    /// Manual override — Storekeeper and above confirm the key is back at
    /// reception. Always allowed regardless of current status.
    pub async fn set_ready(&self, ctx: &TenantContext, item_id: &str, notes: Option<&str>) -> Result<RoomPublic, ApiError> {
        let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
        sqlx::query("INSERT OR IGNORE INTO accommodation_rooms (id,business_id,item_id,status) VALUES (?,?,?,'ready')")
            .bind(Uuid::new_v4().to_string()).bind(&bid).bind(item_id)
            .execute(&self.db).await.map_err(ApiError::from)?;
        sqlx::query("UPDATE accommodation_rooms SET status='ready', current_order_id=NULL, occupied_at=NULL, updated_at=datetime('now') WHERE item_id=? AND business_id=?")
            .bind(item_id).bind(&bid).execute(&self.db).await.map_err(ApiError::from)?;

        let name: String = sqlx::query_scalar("SELECT name FROM inventory_items WHERE id=?")
            .bind(item_id).fetch_one(&self.db).await.map_err(ApiError::from)?;
        smeazy_common::audit::audit(&self.db, smeazy_common::audit::AuditEntry::new(&bid, "accommodation.set_ready", "room", format!("{} marked Ready (key at reception){}", name, notes.map(|n| format!(" — {n}")).unwrap_or_default()))
            .actor(ctx.user_id.to_string()).entity(item_id, name.clone())).await;

        let rooms = self.list_rooms(&bid).await?;
        rooms.into_iter().find(|r| r.item_id == item_id).ok_or_else(|| ApiError::not_found("Room not found"))
    }

    /// Autonomous check-in trigger — called whenever an item is added to a POS
    /// order. No-op if the item isn't an Accommodation-department item.
    pub async fn mark_occupied_if_room(&self, business_id: &str, item_id: &str, order_id: &str) -> Result<(), ApiError> {
        let is_room: Option<String> = sqlx::query_scalar(
            "SELECT i.id FROM inventory_items i JOIN product_categories c ON c.id=i.category_id
             WHERE i.id=? AND i.business_id=? AND c.department='Accommodation'")
            .bind(item_id).bind(business_id).fetch_optional(&self.db).await.map_err(ApiError::from)?;
        if is_room.is_none() { return Ok(()); }

        sqlx::query("INSERT OR IGNORE INTO accommodation_rooms (id,business_id,item_id,status) VALUES (?,?,?,'ready')")
            .bind(Uuid::new_v4().to_string()).bind(business_id).bind(item_id)
            .execute(&self.db).await.map_err(ApiError::from)?;
        sqlx::query("UPDATE accommodation_rooms SET status='occupied', current_order_id=?, occupied_at=datetime('now'), updated_at=datetime('now') WHERE item_id=? AND business_id=?")
            .bind(order_id).bind(item_id).bind(business_id)
            .execute(&self.db).await.map_err(ApiError::from)?;

        let name: String = sqlx::query_scalar("SELECT name FROM inventory_items WHERE id=?")
            .bind(item_id).fetch_one(&self.db).await.map_err(ApiError::from)?;
        smeazy_common::audit::audit(&self.db, smeazy_common::audit::AuditEntry::new(business_id, "accommodation.check_in", "room", format!("{} checked in (added to order)", name))
            .entity(item_id, name).meta(&serde_json::json!({ "order_id": order_id }))).await;
        Ok(())
    }

    /// Autonomous revert trigger — called when an order is voided before payment.
    /// Any rooms tied to that order (which was never sold) go back to Ready.
    pub async fn revert_rooms_for_voided_order(&self, business_id: &str, order_id: &str) -> Result<(), ApiError> {
        let room_items = sqlx::query_as::<_, (String, String)>(
            "SELECT r.item_id, i.name FROM accommodation_rooms r JOIN inventory_items i ON i.id=r.item_id
             WHERE r.business_id=? AND r.current_order_id=?")
            .bind(business_id).bind(order_id).fetch_all(&self.db).await.map_err(ApiError::from)?;
        if room_items.is_empty() { return Ok(()); }

        sqlx::query("UPDATE accommodation_rooms SET status='ready', current_order_id=NULL, occupied_at=NULL, updated_at=datetime('now') WHERE business_id=? AND current_order_id=?")
            .bind(business_id).bind(order_id).execute(&self.db).await.map_err(ApiError::from)?;

        for (item_id, name) in room_items {
            smeazy_common::audit::audit(&self.db, smeazy_common::audit::AuditEntry::new(business_id, "accommodation.revert_ready", "room", format!("{} reverted to Ready — order cleared before payment", name))
                .entity(&item_id, name).meta(&serde_json::json!({ "order_id": order_id }))).await;
        }
        Ok(())
    }

    /// Background scheduler tick — flips any Occupied room past its "next 11am
    /// after check-in" threshold into Readying. Call this periodically.
    pub async fn run_readying_sweep(&self) -> Result<usize, ApiError> {
        let occupied = sqlx::query_as::<_, (String, String, String, String)>(
            "SELECT r.item_id, r.business_id, r.occupied_at, i.name
             FROM accommodation_rooms r JOIN inventory_items i ON i.id=r.item_id
             WHERE r.status='occupied' AND r.occupied_at IS NOT NULL")
            .fetch_all(&self.db).await.map_err(ApiError::from)?;

        let now = Local::now();
        let mut flipped = 0usize;
        for (item_id, business_id, occupied_at, name) in occupied {
            let Some(naive) = chrono::NaiveDateTime::parse_from_str(&occupied_at, "%Y-%m-%d %H:%M:%S").ok() else { continue };
            let Some(occupied_dt) = Local.from_local_datetime(&naive).single() else { continue };
            let threshold = Self::next_11am_after(occupied_dt);
            if now >= threshold {
                sqlx::query("UPDATE accommodation_rooms SET status='readying', updated_at=datetime('now') WHERE item_id=? AND business_id=?")
                    .bind(&item_id).bind(&business_id).execute(&self.db).await.map_err(ApiError::from)?;
                smeazy_common::audit::audit(&self.db, smeazy_common::audit::AuditEntry::new(&business_id, "accommodation.auto_readying", "room", format!("{} moved to Readying (past checkout time)", name))
                    .entity(&item_id, name)).await;
                flipped += 1;
            }
        }
        Ok(flipped)
    }
}
