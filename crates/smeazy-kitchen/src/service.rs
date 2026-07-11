use sqlx::SqlitePool;
use smeazy_common::ApiError;
use super::models::*;

pub struct KitchenService { pub db: SqlitePool }

impl KitchenService {
    pub fn new(db: SqlitePool) -> Self { Self { db } }

    pub async fn list_active_orders(&self, business_id: &str) -> Result<Vec<KitchenOrderWithItems>, ApiError> {
        let orders = sqlx::query_as::<_, KitchenOrder>(
            "SELECT * FROM kitchen_orders WHERE business_id=? AND status NOT IN ('completed','cancelled') ORDER BY sent_at ASC")
            .bind(business_id).fetch_all(&self.db).await.map_err(ApiError::from)?;
        let mut result = Vec::new();
        for order in orders {
            let items = sqlx::query_as::<_, KitchenItem>(
                "SELECT * FROM kitchen_order_items WHERE kitchen_order_id=? ORDER BY id")
                .bind(&order.id).fetch_all(&self.db).await.map_err(ApiError::from)?;
            result.push(KitchenOrderWithItems { order, items });
        }
        Ok(result)
    }

    pub async fn acknowledge_order(&self, kitchen_order_id: &str) -> Result<KitchenOrder, ApiError> {
        sqlx::query("UPDATE kitchen_orders SET status='in_progress', acknowledged_at=datetime('now') WHERE id=?")
            .bind(kitchen_order_id).execute(&self.db).await.map_err(ApiError::from)?;
        sqlx::query("UPDATE kitchen_order_items SET status='processing' WHERE kitchen_order_id=? AND status='new'")
            .bind(kitchen_order_id).execute(&self.db).await.map_err(ApiError::from)?;
        sqlx::query_as::<_, KitchenOrder>("SELECT * FROM kitchen_orders WHERE id=?")
            .bind(kitchen_order_id).fetch_one(&self.db).await.map_err(ApiError::from)
    }

    pub async fn dispatch_item(&self, item_id: &str) -> Result<KitchenItem, ApiError> {
        sqlx::query("UPDATE kitchen_order_items SET status='dispatched', dispatched_at=datetime('now') WHERE id=?")
            .bind(item_id).execute(&self.db).await.map_err(ApiError::from)?;

        // Also update the corresponding pos_order_item if linked
        let linked: Option<String> = sqlx::query_scalar(
            "SELECT order_item_id FROM kitchen_order_items WHERE id=?")
            .bind(item_id).fetch_optional(&self.db).await.map_err(ApiError::from)?
            .flatten();

        if let Some(order_item_id) = linked {
            sqlx::query("UPDATE pos_order_items SET status='dispatched', dispatched_at=datetime('now') WHERE id=?")
                .bind(&order_item_id).execute(&self.db).await.map_err(ApiError::from)?;
        }

        sqlx::query_as::<_, KitchenItem>("SELECT * FROM kitchen_order_items WHERE id=?")
            .bind(item_id).fetch_one(&self.db).await.map_err(ApiError::from)
    }
}
