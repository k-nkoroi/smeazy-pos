use sqlx::SqlitePool;
use uuid::Uuid;
use smeazy_common::ApiError;
use super::models::*;

pub struct TablesService { pub db: SqlitePool }

impl TablesService {
    pub fn new(db: SqlitePool) -> Self { Self { db } }

    pub async fn list_tables_with_status(&self, business_id: &str) -> Result<Vec<TableWithStatus>, ApiError> {
        let tables = sqlx::query_as::<_, FloorTable>(
            "SELECT * FROM floor_tables WHERE business_id=? AND is_active=1 ORDER BY area_name, table_name")
            .bind(business_id).fetch_all(&self.db).await.map_err(ApiError::from)?;
        
        let mut result = Vec::new();
        for table in tables {
            let order_row = sqlx::query_as::<_, (String, f64, Option<String>, i64, String)>(
                "SELECT id, total_amount, waitstaff_name, guest_count, opened_at FROM pos_orders WHERE table_id=? AND status='open' ORDER BY opened_at DESC LIMIT 1")
                .bind(&table.id).fetch_optional(&self.db).await.map_err(ApiError::from)?;
            let (status, order_id, order_total, waitstaff_name, guest_count, opened_at) = if let Some((oid, total, wname, guests, oat)) = order_row {
                ("occupied".into(), Some(oid), Some(total), wname, Some(guests), Some(oat))
            } else { ("available".into(), None, None, None, None, None) };
            result.push(TableWithStatus { table, status, order_id, order_total, waitstaff_name, guest_count, opened_at });
        }
        Ok(result)
    }

    pub async fn create_table(&self, business_id: &str, req: CreateTableReq) -> Result<FloorTable, ApiError> {
        let id = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO floor_tables (id,business_id,area_name,table_name,capacity,pos_x,pos_y,shape,is_active) VALUES (?,?,?,?,?,?,?,?,1)")
            .bind(&id).bind(business_id)
            .bind(req.area_name.as_deref().unwrap_or("Main Hall"))
            .bind(&req.table_name).bind(req.capacity.unwrap_or(4))
            .bind(req.pos_x.unwrap_or(0)).bind(req.pos_y.unwrap_or(0))
            .bind(req.shape.as_deref().unwrap_or("rect"))
            .execute(&self.db).await.map_err(ApiError::from)?;
        sqlx::query_as::<_, FloorTable>("SELECT * FROM floor_tables WHERE id=?")
            .bind(&id).fetch_one(&self.db).await.map_err(ApiError::from)
    }

    pub async fn update_table(&self, id: &str, business_id: &str, req: UpdateTableReq) -> Result<FloorTable, ApiError> {
        sqlx::query("UPDATE floor_tables SET table_name=COALESCE(?,table_name), area_name=COALESCE(?,area_name), capacity=COALESCE(?,capacity), pos_x=COALESCE(?,pos_x), pos_y=COALESCE(?,pos_y) WHERE id=? AND business_id=?")
            .bind(&req.table_name).bind(&req.area_name).bind(req.capacity).bind(req.pos_x).bind(req.pos_y)
            .bind(id).bind(business_id).execute(&self.db).await.map_err(ApiError::from)?;
        sqlx::query_as::<_, FloorTable>("SELECT * FROM floor_tables WHERE id=?")
            .bind(id).fetch_one(&self.db).await.map_err(ApiError::from)
    }

    pub async fn delete_table(&self, id: &str, business_id: &str) -> Result<(), ApiError> {
        sqlx::query("UPDATE floor_tables SET is_active=0 WHERE id=? AND business_id=?")
            .bind(id).bind(business_id).execute(&self.db).await.map_err(ApiError::from)?;
        Ok(())
    }

    pub async fn transfer_table(&self, _business_id: &str, req: TransferTableReq) -> Result<(), ApiError> {
        // Move open order from one table to another
        sqlx::query("UPDATE pos_orders SET table_id=?, table_name=(SELECT table_name FROM floor_tables WHERE id=?) WHERE table_id=? AND status='open'")
            .bind(&req.to_table_id).bind(&req.to_table_id).bind(&req.from_table_id)
            .execute(&self.db).await.map_err(ApiError::from)?;
        Ok(())
    }

    pub async fn merge_tables(&self, _business_id: &str, req: MergeTablesReq) -> Result<(), ApiError> {
        // Move all items from source order to target order, then close source
        let source_order = sqlx::query_as::<_, (String,)>(
            "SELECT id FROM pos_orders WHERE table_id=? AND status='open' LIMIT 1")
            .bind(&req.source_table_id).fetch_optional(&self.db).await.map_err(ApiError::from)?;
        let target_order = sqlx::query_as::<_, (String, f64)>(
            "SELECT id, total_amount FROM pos_orders WHERE table_id=? AND status='open' LIMIT 1")
            .bind(&req.target_table_id).fetch_optional(&self.db).await.map_err(ApiError::from)?;
        
        if let (Some((src_id,)), Some((tgt_id, _tgt_total))) = (source_order, target_order) {
            let src_total: f64 = sqlx::query_scalar("SELECT COALESCE(SUM((quantity * unit_price) - discount), 0) FROM pos_order_items WHERE order_id=?")
                .bind(&src_id).fetch_one(&self.db).await.map_err(ApiError::from)?;
            // Move items
            sqlx::query("UPDATE pos_order_items SET order_id=? WHERE order_id=?")
                .bind(&tgt_id).bind(&src_id).execute(&self.db).await.map_err(ApiError::from)?;
            // Update target total
            sqlx::query("UPDATE pos_orders SET total_amount = total_amount + ? WHERE id=?")
                .bind(src_total).bind(&tgt_id).execute(&self.db).await.map_err(ApiError::from)?;
            // Close source order
            sqlx::query("UPDATE pos_orders SET status='merged', closed_at=datetime('now') WHERE id=?")
                .bind(&src_id).execute(&self.db).await.map_err(ApiError::from)?;
        }
        Ok(())
    }

    /// Seed default tables for a new business
    pub async fn seed_default_tables(&self, business_id: &str) -> Result<(), ApiError> {
        let areas = vec![
            ("Main Hall", vec!["T1","T2","T3","T4","T5","T6","T7","T8"]),
            ("Terrace",   vec!["P1","P2","P3","P4"]),
        ];
        let mut x = 0i64;
        for (area, names) in areas {
            for (i, name) in names.iter().enumerate() {
                let id = Uuid::new_v4().to_string();
                sqlx::query("INSERT OR IGNORE INTO floor_tables (id,business_id,area_name,table_name,capacity,pos_x,pos_y,shape,is_active) VALUES (?,?,?,?,4,?,?,?,1)")
                    .bind(&id).bind(business_id).bind(area).bind(name)
                    .bind((i as i64) * 140).bind(x)
                    .bind("rect")
                    .execute(&self.db).await.map_err(ApiError::from)?;
            }
            x += 160;
        }
        Ok(())
    }
}
