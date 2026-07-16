use sqlx::SqlitePool;
use uuid::Uuid;
use smeazy_common::ApiError;
use smeazy_domain::TenantContext;
use super::models::*;

pub struct InventoryService { pub db: SqlitePool }

impl InventoryService {
    pub fn new(db: SqlitePool) -> Self { Self { db } }

    // ── Categories ──────────────────────────────────────────────────────────
    pub async fn list_categories(&self, business_id: &str) -> Result<Vec<Category>, ApiError> {
        sqlx::query_as::<_, Category>(
            "SELECT * FROM product_categories WHERE business_id=? AND is_active=1 ORDER BY sort_order, name")
            .bind(business_id).fetch_all(&self.db).await.map_err(ApiError::from)
    }

    pub async fn update_category(&self, id: &str, business_id: &str, req: UpdateCategoryReq) -> Result<Category, ApiError> {
        sqlx::query("UPDATE product_categories SET name=COALESCE(?,name), color=COALESCE(?,color), department=COALESCE(?,department), sort_order=COALESCE(?,sort_order) WHERE id=? AND business_id=?")
            .bind(&req.name).bind(&req.color).bind(&req.department).bind(req.sort_order)
            .bind(id).bind(business_id)
            .execute(&self.db).await.map_err(ApiError::from)?;
        sqlx::query_as::<_, Category>("SELECT * FROM product_categories WHERE id=?")
            .bind(id).fetch_one(&self.db).await.map_err(ApiError::from)
    }

    pub async fn create_category(&self, business_id: &str, req: CreateCategoryReq) -> Result<Category, ApiError> {
        let id = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO product_categories (id,business_id,name,color,icon,sort_order,is_active,department) VALUES (?,?,?,?,?,?,1,?)")
            .bind(&id).bind(business_id).bind(&req.name)
            .bind(req.color.as_deref().unwrap_or("#6366f1"))
            .bind(&req.icon).bind(req.sort_order.unwrap_or(0))
            .bind(&req.department)
            .execute(&self.db).await.map_err(ApiError::from)?;
        sqlx::query_as::<_, Category>("SELECT * FROM product_categories WHERE id=?")
            .bind(&id).fetch_one(&self.db).await.map_err(ApiError::from)
    }

    // ── Items ───────────────────────────────────────────────────────────────
    pub async fn list_items(&self, business_id: &str, category_id: Option<&str>) -> Result<Vec<InventoryItem>, ApiError> {
        self.list_items_filtered(business_id, category_id, None).await
    }

    /// List items, optionally filtered by category and/or item_type ('assembly' | 'product').
    pub async fn list_items_filtered(&self, business_id: &str, category_id: Option<&str>, item_type: Option<&str>) -> Result<Vec<InventoryItem>, ApiError> {
        let type_like = item_type; // exact match when provided
        sqlx::query_as::<_, InventoryItem>(
            "SELECT i.*, c.name as category_name, c.department as category_department
             FROM inventory_items i LEFT JOIN product_categories c ON c.id=i.category_id
             WHERE i.business_id=? AND i.is_active=1
               AND (? IS NULL OR i.category_id = ?)
               AND (? IS NULL OR i.item_type = ?)
             ORDER BY c.sort_order, i.name")
            .bind(business_id)
            .bind(category_id).bind(category_id)
            .bind(type_like).bind(type_like)
            .fetch_all(&self.db).await.map_err(ApiError::from)
    }

    pub async fn get_item(&self, id: &str) -> Result<InventoryItem, ApiError> {
        sqlx::query_as::<_, InventoryItem>(
            "SELECT i.*, c.name as category_name, c.department as category_department FROM inventory_items i LEFT JOIN product_categories c ON c.id=i.category_id WHERE i.id=?")
            .bind(id).fetch_one(&self.db).await.map_err(ApiError::from)
    }

    pub async fn create_item(&self, business_id: &str, req: CreateItemReq) -> Result<InventoryItem, ApiError> {
        let id = Uuid::new_v4().to_string();
        let sku = req.sku.unwrap_or_else(|| format!("SKU-{}", &id[..8].to_uppercase()));
        sqlx::query("INSERT INTO inventory_items (id,business_id,category_id,sku,name,description,item_type,quantity_on_hand,reorder_level,unit_of_measure,cost_price,sale_price,image_url,tags,track_inventory,is_active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)")
            .bind(&id).bind(business_id).bind(&req.category_id).bind(&sku).bind(&req.name)
            .bind(&req.description).bind(req.item_type.as_deref().unwrap_or("product"))
            .bind(req.quantity.unwrap_or(0.0)).bind(req.reorder_level.unwrap_or(5.0))
            .bind(req.unit_of_measure.as_deref().unwrap_or("unit"))
            .bind(req.cost_price).bind(req.sale_price).bind(&req.image_url).bind(&req.tags)
            .bind(if req.track_inventory.unwrap_or(true) { 1 } else { 0 })
            .execute(&self.db).await.map_err(ApiError::from)?;
        self.get_item(&id).await
    }

    pub async fn update_item(&self, id: &str, business_id: &str, req: UpdateItemReq) -> Result<InventoryItem, ApiError> {
        sqlx::query("UPDATE inventory_items SET name=COALESCE(?,name), category_id=COALESCE(?,category_id), description=COALESCE(?,description), cost_price=COALESCE(?,cost_price), sale_price=COALESCE(?,sale_price), reorder_level=COALESCE(?,reorder_level), is_active=COALESCE(?,is_active), image_url=COALESCE(?,image_url), tags=COALESCE(?,tags), updated_at=datetime('now') WHERE id=? AND business_id=?")
            .bind(&req.name).bind(&req.category_id).bind(&req.description)
            .bind(req.cost_price).bind(req.sale_price).bind(req.reorder_level)
            .bind(req.is_active.map(|b| if b { 1i64 } else { 0i64 }))
            .bind(&req.image_url).bind(&req.tags).bind(id).bind(business_id)
            .execute(&self.db).await.map_err(ApiError::from)?;
        self.get_item(id).await
    }

    pub async fn adjust_stock(&self, ctx: &TenantContext, item_id: &str, req: AdjustStockReq) -> Result<InventoryItem, ApiError> {
        let bid = ctx.business_id.map(|b| b.to_string()).unwrap_or_default();
        sqlx::query("UPDATE inventory_items SET quantity_on_hand = quantity_on_hand + ?, updated_at=datetime('now') WHERE id=? AND business_id=?")
            .bind(req.delta).bind(item_id).bind(&bid)
            .execute(&self.db).await.map_err(ApiError::from)?;
        sqlx::query("INSERT INTO inventory_movements (id,item_id,movement_type,delta_qty,moved_by,notes) VALUES (?,?,'adjustment',?,?,?)")
            .bind(Uuid::new_v4().to_string()).bind(item_id).bind(req.delta)
            .bind(ctx.user_id.to_string()).bind(&req.reason)
            .execute(&self.db).await.map_err(ApiError::from)?;
        let item = self.get_item(item_id).await?;
        smeazy_common::audit::audit(&self.db, smeazy_common::audit::AuditEntry::new(&bid, "stock.adjustment", "inventory_item", format!("Manual stock adjustment {:+} on {}", req.delta, item.name))
            .actor(ctx.user_id.to_string()).entity(item_id, item.name.clone())
            .meta(&serde_json::json!({ "delta": req.delta, "reason": req.reason, "new_qty": item.quantity_on_hand }))).await;
        Ok(item)
    }

    /// Record spoilage — reduces stock and logs a 'spoil' movement + audit.
    /// Cashiers are permitted to record spoils. For assembled products the
    /// underlying ingredients are depleted instead of the product's own stock.
    pub async fn record_spoil(&self, ctx: &TenantContext, item_id: &str, quantity: f64, reason: Option<&str>) -> Result<InventoryItem, ApiError> {
        if quantity <= 0.0 { return Err(ApiError::bad_request("Spoil quantity must be positive")); }
        let bid = ctx.business_id.map(|b| b.to_string()).unwrap_or_default();

        // Assembled product spoilage depletes ingredients; direct products deplete own stock.
        let depleted = self.deplete_ingredients(&bid, item_id, quantity, "spoil", None).await?;
        if !depleted {
            sqlx::query("UPDATE inventory_items SET quantity_on_hand = quantity_on_hand - ?, updated_at=datetime('now') WHERE id=? AND business_id=?")
                .bind(quantity).bind(item_id).bind(&bid)
                .execute(&self.db).await.map_err(ApiError::from)?;
            sqlx::query("INSERT INTO inventory_movements (id,item_id,movement_type,delta_qty,moved_by,notes) VALUES (?,?,'spoil',?,?,?)")
                .bind(Uuid::new_v4().to_string()).bind(item_id).bind(-quantity)
                .bind(ctx.user_id.to_string()).bind(reason)
                .execute(&self.db).await.map_err(ApiError::from)?;
        }
        let item = self.get_item(item_id).await?;
        smeazy_common::audit::audit(&self.db, smeazy_common::audit::AuditEntry::new(&bid, "stock.spoil", "inventory_item", format!("Spoilage of {} × {}{}", quantity, item.name, if depleted { " (ingredients depleted)" } else { "" }))
            .actor(ctx.user_id.to_string()).entity(item_id, item.name.clone())
            .meta(&serde_json::json!({ "quantity": quantity, "reason": reason, "assembled": depleted, "new_qty": item.quantity_on_hand }))).await;
        Ok(item)
    }

    pub async fn low_stock_alerts(&self, business_id: &str) -> Result<Vec<LowStockAlert>, ApiError> {
        let rows = sqlx::query_as::<_, InventoryItem>(
            "SELECT i.*, c.name as category_name, c.department as category_department FROM inventory_items i LEFT JOIN product_categories c ON c.id=i.category_id WHERE i.business_id=? AND i.is_active=1 AND i.track_inventory=1 AND i.is_assembled=0 AND i.quantity_on_hand <= i.reorder_level ORDER BY i.quantity_on_hand ASC")
            .bind(business_id).fetch_all(&self.db).await.map_err(ApiError::from)?;
        Ok(rows.into_iter().map(|r| LowStockAlert {
            item_id: r.id, sku: r.sku, name: r.name,
            on_hand: r.quantity_on_hand, reorder: r.reorder_level,
            category_name: r.category_name, unit_of_measure: r.unit_of_measure,
            cost_price: r.cost_price,
        }).collect())
    }

    pub async fn deduct_stock_on_sale(&self, item_id: &str, quantity: f64, order_id: &str) -> Result<(), ApiError> {
        // Resolve the business for this item so we can check for a recipe.
        let bid: Option<String> = sqlx::query_scalar("SELECT business_id FROM inventory_items WHERE id=?")
            .bind(item_id).fetch_optional(&self.db).await.map_err(ApiError::from)?;
        if let Some(ref bid) = bid {
            // If the product is assembled, deplete its ingredients instead of its own stock.
            let depleted = self.deplete_ingredients(bid, item_id, quantity, "sale", Some(order_id)).await?;
            if depleted { return Ok(()); }
        }
        // Direct-stock product (e.g. bar item): deduct its own stock.
        sqlx::query("UPDATE inventory_items SET quantity_on_hand = quantity_on_hand - ?, updated_at=datetime('now') WHERE id=? AND track_inventory=1")
            .bind(quantity).bind(item_id).execute(&self.db).await.map_err(ApiError::from)?;
        sqlx::query("INSERT INTO inventory_movements (id,item_id,order_id,movement_type,delta_qty) VALUES (?,?,?,'sale',?)")
            .bind(Uuid::new_v4().to_string()).bind(item_id).bind(order_id).bind(-quantity)
            .execute(&self.db).await.map_err(ApiError::from)?;
        Ok(())
    }

    // ── CSV import/export ───────────────────────────────────────────────────
    pub async fn import_csv(&self, business_id: &str, csv_content: &str) -> Result<ImportResult, ApiError> {
        let mut rdr = csv::Reader::from_reader(csv_content.as_bytes());
        let headers = rdr.headers().map_err(|e| ApiError::bad_request(format!("Invalid CSV: {e}")))?.clone();
        let is_woocommerce = headers.iter().any(|h| h == "Regular price" || h == "Categories");
        let mut imported = 0usize; let mut updated = 0usize; let mut skipped = 0usize; let mut errors: Vec<String> = Vec::new();

        for (idx, result) in rdr.records().enumerate() {
            let record = match result { Ok(r) => r, Err(e) => { errors.push(format!("Row {}: {}", idx+2, e)); skipped += 1; continue; } };
            let get = |field: &str| -> Option<String> {
                headers.iter().position(|h| h == field).and_then(|i| record.get(i)).filter(|s| !s.is_empty()).map(|s| s.to_string())
            };
            let (name, category_name, sale_price, cost_price, stock_qty, reorder_level, image_url, tags, legacy_id, sku_hint, item_type_hint) = if is_woocommerce {
                let name = match get("Name") { Some(n) => n, None => { skipped += 1; continue; } };
                (name, get("Categories"),
                 get("Regular price").and_then(|s| s.parse::<f64>().ok()),
                 get("Cost").and_then(|s| s.parse::<f64>().ok()),
                 get("Stock").and_then(|s| s.parse::<f64>().ok()),
                 get("Low stock amount").and_then(|s| s.parse::<f64>().ok()),
                 get("Images"), get("Tags"), get("ID"), get("SKU"), None)
            } else {
                let name = match get("name") { Some(n) => n, None => { skipped += 1; continue; } };
                (name, get("category"),
                 get("sale_price").and_then(|s| s.parse::<f64>().ok()),
                 get("cost_price").and_then(|s| s.parse::<f64>().ok()),
                 get("stock_qty").and_then(|s| s.parse::<f64>().ok()),
                 get("reorder_level").and_then(|s| s.parse::<f64>().ok()),
                 get("image_url"), get("tags"), get("legacy_id"), get("sku"), get("item_type"))
            };
            if name.trim().is_empty() { skipped += 1; continue; }

            let category_id = if let Some(cat_name) = &category_name {
                if !cat_name.is_empty() {
                    let existing = sqlx::query_scalar::<_, String>(
                        "SELECT id FROM product_categories WHERE business_id=? AND name=?")
                        .bind(business_id).bind(cat_name).fetch_optional(&self.db).await.map_err(ApiError::from)?;
                    if let Some(cid) = existing { Some(cid) } else {
                        let cid = Uuid::new_v4().to_string();
                        sqlx::query("INSERT OR IGNORE INTO product_categories (id,business_id,name,color,sort_order,is_active) VALUES (?,?,?,'#6366f1',0,1)")
                            .bind(&cid).bind(business_id).bind(cat_name)
                            .execute(&self.db).await.map_err(ApiError::from)?;
                        Some(cid)
                    }
                } else { None }
            } else { None };

            let sku = match sku_hint {
                Some(s) if !s.trim().is_empty() => s.trim().to_string(),
                _ => {
                    let words: Vec<&str> = name.split_whitespace().collect();
                    let prefix: String = words.iter().take(3).map(|w| &w[..w.len().min(3)]).collect::<Vec<_>>().join("").to_uppercase();
                    format!("{}-{}", prefix, &Uuid::new_v4().to_string()[..6].to_uppercase())
                }
            };
            // Products are the default for CSV import; a row can opt into 'assembly'
            // (ingredient) via an optional item_type column.
            let item_type = match item_type_hint.as_deref() {
                Some("assembly") => "assembly",
                _ => "product",
            };

            // Match existing items by SKU (not name) so re-importing the same
            // catalogue updates prices/stock instead of silently skipping or duplicating.
            let existing = sqlx::query_as::<_, (String, f64)>(
                "SELECT id, quantity_on_hand FROM inventory_items WHERE business_id=? AND sku=?")
                .bind(business_id).bind(&sku).fetch_optional(&self.db).await.map_err(ApiError::from)?;

            if let Some((item_id, old_qty)) = existing {
                // ── UPDATE existing item (prices, stock levels, category, etc.) ──
                let new_qty = stock_qty.unwrap_or(old_qty);
                match sqlx::query(
                    "UPDATE inventory_items SET name=?, category_id=COALESCE(?,category_id), quantity_on_hand=?,
                     reorder_level=COALESCE(?,reorder_level), cost_price=COALESCE(?,cost_price), sale_price=COALESCE(?,sale_price),
                     image_url=COALESCE(?,image_url), tags=COALESCE(?,tags), legacy_pos_id=COALESCE(?,legacy_pos_id),
                     updated_at=datetime('now') WHERE id=?")
                    .bind(&name).bind(&category_id).bind(new_qty)
                    .bind(reorder_level).bind(cost_price).bind(sale_price)
                    .bind(&image_url).bind(&tags).bind(&legacy_id)
                    .bind(&item_id)
                    .execute(&self.db).await
                {
                    Ok(_) => {
                        updated += 1;
                        // Preserve the transaction-driven stock audit trail: log the
                        // net stock-level change from this import as a movement.
                        let delta = new_qty - old_qty;
                        if delta.abs() > 0.0001 {
                            let _ = sqlx::query("INSERT INTO inventory_movements (id,item_id,movement_type,delta_qty,notes) VALUES (?,?,'adjustment',?,?)")
                                .bind(Uuid::new_v4().to_string()).bind(&item_id).bind(delta).bind("CSV import stock sync")
                                .execute(&self.db).await;
                        }
                    }
                    Err(e) => { errors.push(format!("'{}': {}", name, e)); skipped += 1; }
                }
            } else {
                // ── INSERT new item ──
                let item_id = Uuid::new_v4().to_string();
                match sqlx::query("INSERT INTO inventory_items (id,business_id,category_id,sku,name,item_type,quantity_on_hand,reorder_level,cost_price,sale_price,image_url,tags,track_inventory,is_active,legacy_pos_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,1,?)")
                    .bind(&item_id).bind(business_id).bind(&category_id).bind(&sku).bind(&name).bind(item_type)
                    .bind(stock_qty.unwrap_or(0.0)).bind(reorder_level.unwrap_or(5.0))
                    .bind(cost_price).bind(sale_price).bind(&image_url).bind(&tags).bind(&legacy_id)
                    .execute(&self.db).await {
                    Ok(_) => imported += 1,
                    Err(e) => { errors.push(format!("'{}': {}", name, e)); skipped += 1; }
                }
            }
        }
        Ok(ImportResult { imported, updated, skipped, errors })
    }

    pub async fn export_csv(&self, business_id: &str) -> Result<String, ApiError> {
        let items = self.list_items(business_id, None).await?;
        let mut wtr = csv::Writer::from_writer(Vec::new());
        wtr.write_record(&["id","sku","name","category","sale_price","cost_price","stock_qty","reorder_level","unit","image_url","tags","is_active"]).ok();
        for item in &items {
            let row: Vec<String> = vec![
                item.id.clone(), item.sku.clone(), item.name.clone(),
                item.category_name.clone().unwrap_or_default(),
                item.sale_price.map(|p| p.to_string()).unwrap_or_default(),
                item.cost_price.map(|p| p.to_string()).unwrap_or_default(),
                item.quantity_on_hand.to_string(),
                item.reorder_level.to_string(),
                item.unit_of_measure.clone(),
                item.image_url.clone().unwrap_or_default(),
                item.tags.clone().unwrap_or_default(),
                if item.is_active == 1 { "1".into() } else { "0".into() },
            ];
            wtr.write_record(&row).ok();
        }
        let data = wtr.into_inner().map_err(|e| ApiError::internal(format!("CSV write error: {e}")))?;
        String::from_utf8(data).map_err(|e| ApiError::internal(format!("UTF-8 error: {e}")))
    }

    // ── Stock takes ─────────────────────────────────────────────────────────
    pub async fn start_stock_take(&self, business_id: &str, user_id: &str, performer_name: &str, notes: Option<String>) -> Result<StockTakeWithLines, ApiError> {
        let st_id = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO stock_takes (id,business_id,performed_by,performer_name,status,notes) VALUES (?,?,?,?,'draft',?)")
            .bind(&st_id).bind(business_id).bind(user_id).bind(performer_name).bind(&notes)
            .execute(&self.db).await.map_err(ApiError::from)?;
        let items = self.list_items(business_id, None).await?;
        for item in &items {
            sqlx::query("INSERT INTO stock_take_lines (id,stock_take_id,item_id,item_name,item_sku,category_name,expected_qty,unit_of_measure,reorder_level,sale_price) VALUES (?,?,?,?,?,?,?,?,?,?)")
                .bind(Uuid::new_v4().to_string()).bind(&st_id).bind(&item.id).bind(&item.name).bind(&item.sku)
                .bind(&item.category_name).bind(item.quantity_on_hand)
                .bind(&item.unit_of_measure).bind(item.reorder_level).bind(item.sale_price)
                .execute(&self.db).await.map_err(ApiError::from)?;
        }
        self.get_stock_take(&st_id).await
    }

    pub async fn update_count_line(&self, line_id: &str, counted: f64) -> Result<StockTakeLine, ApiError> {
        let expected: f64 = sqlx::query_scalar("SELECT expected_qty FROM stock_take_lines WHERE id=?")
            .bind(line_id).fetch_one(&self.db).await.map_err(ApiError::from)?;
        sqlx::query("UPDATE stock_take_lines SET counted_qty=?, variance=? WHERE id=?")
            .bind(counted).bind(counted - expected).bind(line_id)
            .execute(&self.db).await.map_err(ApiError::from)?;
        sqlx::query_as::<_, StockTakeLine>("SELECT * FROM stock_take_lines WHERE id=?")
            .bind(line_id).fetch_one(&self.db).await.map_err(ApiError::from)
    }

    pub async fn complete_stock_take(&self, st_id: &str, business_id: &str) -> Result<StockTakeWithLines, ApiError> {
        let lines = sqlx::query_as::<_, StockTakeLine>("SELECT * FROM stock_take_lines WHERE stock_take_id=?")
            .bind(st_id).fetch_all(&self.db).await.map_err(ApiError::from)?;
        for line in &lines {
            if let Some(counted) = line.counted_qty {
                sqlx::query("UPDATE inventory_items SET quantity_on_hand=?, updated_at=datetime('now') WHERE id=? AND business_id=?")
                    .bind(counted).bind(&line.item_id).bind(business_id)
                    .execute(&self.db).await.map_err(ApiError::from)?;
                sqlx::query("INSERT INTO inventory_movements (id,item_id,movement_type,delta_qty,notes) VALUES (?,?,'stock_take',?,?)")
                    .bind(Uuid::new_v4().to_string()).bind(&line.item_id).bind(line.variance.unwrap_or(0.0))
                    .bind(format!("Stock take {}", st_id)).execute(&self.db).await.map_err(ApiError::from)?;
            }
        }
        sqlx::query("UPDATE stock_takes SET status='completed', completed_at=datetime('now') WHERE id=?")
            .bind(st_id).execute(&self.db).await.map_err(ApiError::from)?;
        self.get_stock_take(st_id).await
    }

    pub async fn get_stock_take(&self, st_id: &str) -> Result<StockTakeWithLines, ApiError> {
        let take = sqlx::query_as::<_, StockTake>("SELECT * FROM stock_takes WHERE id=?")
            .bind(st_id).fetch_one(&self.db).await.map_err(ApiError::from)?;
        let lines = sqlx::query_as::<_, StockTakeLine>("SELECT * FROM stock_take_lines WHERE stock_take_id=? ORDER BY item_name")
            .bind(st_id).fetch_all(&self.db).await.map_err(ApiError::from)?;
        Ok(StockTakeWithLines { take, lines })
    }

    pub async fn list_stock_takes(&self, business_id: &str) -> Result<Vec<StockTake>, ApiError> {
        sqlx::query_as::<_, StockTake>("SELECT * FROM stock_takes WHERE business_id=? ORDER BY started_at DESC")
            .bind(business_id).fetch_all(&self.db).await.map_err(ApiError::from)
    }

    // ── Suppliers ───────────────────────────────────────────────────────────
    pub async fn list_suppliers(&self, business_id: &str) -> Result<Vec<Supplier>, ApiError> {
        sqlx::query_as::<_, Supplier>("SELECT * FROM suppliers WHERE business_id=? AND is_active=1 ORDER BY name")
            .bind(business_id).fetch_all(&self.db).await.map_err(ApiError::from)
    }

    pub async fn create_supplier(&self, business_id: &str, req: CreateSupplierReq) -> Result<Supplier, ApiError> {
        let id = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO suppliers (id,business_id,name,contact_name,phone,email,address,notes,is_active) VALUES (?,?,?,?,?,?,?,?,1)")
            .bind(&id).bind(business_id).bind(&req.name).bind(&req.contact_name)
            .bind(&req.phone).bind(&req.email).bind(&req.address).bind(&req.notes)
            .execute(&self.db).await.map_err(ApiError::from)?;
        sqlx::query_as::<_, Supplier>("SELECT * FROM suppliers WHERE id=?")
            .bind(&id).fetch_one(&self.db).await.map_err(ApiError::from)
    }

    pub async fn update_supplier(&self, id: &str, business_id: &str, req: UpdateSupplierReq) -> Result<Supplier, ApiError> {
        sqlx::query("UPDATE suppliers SET name=COALESCE(?,name), contact_name=COALESCE(?,contact_name), phone=COALESCE(?,phone), email=COALESCE(?,email), address=COALESCE(?,address), notes=COALESCE(?,notes), is_active=COALESCE(?,is_active) WHERE id=? AND business_id=?")
            .bind(&req.name).bind(&req.contact_name).bind(&req.phone).bind(&req.email)
            .bind(&req.address).bind(&req.notes)
            .bind(req.is_active.map(|b| if b { 1i64 } else { 0i64 }))
            .bind(id).bind(business_id)
            .execute(&self.db).await.map_err(ApiError::from)?;
        sqlx::query_as::<_, Supplier>("SELECT * FROM suppliers WHERE id=?")
            .bind(id).fetch_one(&self.db).await.map_err(ApiError::from)
    }

    // ── Requisitions ────────────────────────────────────────────────────────
    pub async fn create_requisition(&self, business_id: &str, user_id: &str, raiser_name: &str, req: CreateRequisitionReq) -> Result<RequisitionWithLines, ApiError> {
        let req_id = Uuid::new_v4().to_string();
        let ref_num = format!("PO-{}-{}", chrono::Utc::now().format("%Y%m%d"), &req_id[..4].to_uppercase());
        // Resolve supplier name if supplier_id given
        let supplier_name: Option<String> = if let Some(ref sid) = req.supplier_id {
            sqlx::query_scalar("SELECT name FROM suppliers WHERE id=?")
                .bind(sid).fetch_optional(&self.db).await.map_err(ApiError::from)?
        } else { None };
        sqlx::query("INSERT INTO requisitions (id,business_id,ref_number,raised_by,raiser_name,supplier_id,supplier_name,status,notes) VALUES (?,?,?,?,?,?,?,'draft',?)")
            .bind(&req_id).bind(business_id).bind(&ref_num)
            .bind(user_id).bind(raiser_name).bind(&req.supplier_id).bind(&supplier_name).bind(&req.notes)
            .execute(&self.db).await.map_err(ApiError::from)?;
        for line in &req.lines {
            sqlx::query("INSERT INTO requisition_lines (id,requisition_id,item_id,item_name,item_sku,unit_of_measure,requested_qty,received_qty,unit_cost,notes) VALUES (?,?,?,?,?,?,?,0,?,?)")
                .bind(Uuid::new_v4().to_string()).bind(&req_id).bind(&line.item_id).bind(&line.item_name)
                .bind(&line.item_sku).bind(line.unit_of_measure.as_deref().unwrap_or("unit"))
                .bind(line.requested_qty).bind(line.unit_cost).bind(&line.notes)
                .execute(&self.db).await.map_err(ApiError::from)?;
        }
        self.get_requisition(&req_id).await
    }

    pub async fn get_requisition(&self, req_id: &str) -> Result<RequisitionWithLines, ApiError> {
        let req = sqlx::query_as::<_, Requisition>("SELECT * FROM requisitions WHERE id=?")
            .bind(req_id).fetch_one(&self.db).await.map_err(ApiError::from)?;
        let lines = sqlx::query_as::<_, RequisitionLine>("SELECT * FROM requisition_lines WHERE requisition_id=?")
            .bind(req_id).fetch_all(&self.db).await.map_err(ApiError::from)?;
        Ok(RequisitionWithLines { req, lines })
    }

    pub async fn list_requisitions(&self, business_id: &str) -> Result<Vec<Requisition>, ApiError> {
        sqlx::query_as::<_, Requisition>("SELECT * FROM requisitions WHERE business_id=? ORDER BY created_at DESC")
            .bind(business_id).fetch_all(&self.db).await.map_err(ApiError::from)
    }

    pub async fn submit_requisition(&self, req_id: &str) -> Result<Requisition, ApiError> {
        sqlx::query("UPDATE requisitions SET status='submitted', submitted_at=datetime('now') WHERE id=? AND status='draft'")
            .bind(req_id).execute(&self.db).await.map_err(ApiError::from)?;
        sqlx::query_as::<_, Requisition>("SELECT * FROM requisitions WHERE id=?")
            .bind(req_id).fetch_one(&self.db).await.map_err(ApiError::from)
    }

    pub async fn receive_line(&self, line_id: &str, qty: f64) -> Result<RequisitionLine, ApiError> {
        sqlx::query("UPDATE requisition_lines SET received_qty=?, received_at=datetime('now') WHERE id=?")
            .bind(qty).bind(line_id).execute(&self.db).await.map_err(ApiError::from)?;
        let line = sqlx::query_as::<_, RequisitionLine>("SELECT * FROM requisition_lines WHERE id=?")
            .bind(line_id).fetch_one(&self.db).await.map_err(ApiError::from)?;
        if let Some(ref iid) = line.item_id {
            sqlx::query("UPDATE inventory_items SET quantity_on_hand = quantity_on_hand + ?, updated_at=datetime('now') WHERE id=?")
                .bind(qty).bind(iid).execute(&self.db).await.map_err(ApiError::from)?;
            sqlx::query("INSERT INTO inventory_movements (id,item_id,movement_type,delta_qty,notes) VALUES (?,?,'purchase',?,?)")
                .bind(Uuid::new_v4().to_string()).bind(iid).bind(qty).bind(format!("Requisition line {}", line_id))
                .execute(&self.db).await.map_err(ApiError::from)?;
            let (total, received): (i64, i64) = sqlx::query_as(
                "SELECT COUNT(*), COUNT(received_at) FROM requisition_lines WHERE requisition_id=?")
                .bind(&line.requisition_id).fetch_one(&self.db).await.map_err(ApiError::from)?;
            let new_status = if received == total { "received" } else { "partially_received" };
            sqlx::query("UPDATE requisitions SET status=?, received_at=CASE WHEN ?='received' THEN datetime('now') ELSE received_at END WHERE id=?")
                .bind(new_status).bind(new_status).bind(&line.requisition_id)
                .execute(&self.db).await.map_err(ApiError::from)?;
        }
        Ok(line)
    }
}

impl InventoryService {
    // ── Recipes / Bill of Materials ───────────────────────────────────────────
    pub async fn get_recipe(&self, business_id: &str, product_id: &str) -> Result<ProductRecipe, ApiError> {
        let product = sqlx::query_as::<_, (String, i64)>(
            "SELECT name, is_assembled FROM inventory_items WHERE id=? AND business_id=?")
            .bind(product_id).bind(business_id).fetch_optional(&self.db).await.map_err(ApiError::from)?
            .ok_or_else(|| ApiError::not_found("Product not found"))?;

        let rows = sqlx::query_as::<_, (String, String, String, String, f64, f64)>(
            "SELECT rc.id, rc.ingredient_id, i.name, i.unit_of_measure, rc.quantity, i.quantity_on_hand
             FROM recipe_components rc JOIN inventory_items i ON i.id = rc.ingredient_id
             WHERE rc.product_id=? AND rc.business_id=? ORDER BY i.name")
            .bind(product_id).bind(business_id).fetch_all(&self.db).await.map_err(ApiError::from)?;

        let components: Vec<RecipeComponent> = rows.into_iter().map(|(id, ing_id, name, unit, qty, on_hand)| RecipeComponent {
            id, ingredient_id: ing_id, ingredient_name: name, ingredient_unit: unit, quantity: qty, ingredient_on_hand: on_hand,
        }).collect();

        // Buildable = min over components of floor(on_hand / per-unit qty)
        let buildable_qty = components.iter()
            .filter(|c| c.quantity > 0.0)
            .map(|c| (c.ingredient_on_hand / c.quantity).floor())
            .fold(f64::INFINITY, f64::min);
        let buildable_qty = if buildable_qty.is_finite() { buildable_qty } else { 0.0 };

        Ok(ProductRecipe {
            product_id: product_id.to_string(), product_name: product.0,
            is_assembled: product.1 != 0, components, buildable_qty,
        })
    }

    pub async fn set_recipe(&self, ctx: &TenantContext, product_id: &str, req: SetRecipeReq) -> Result<ProductRecipe, ApiError> {
        let bid = ctx.business_id.map(|b| b.to_string()).unwrap_or_default();
        // Validate all ingredients exist and are assembly items in this business.
        for c in &req.components {
            let ok: Option<String> = sqlx::query_scalar("SELECT item_type FROM inventory_items WHERE id=? AND business_id=?")
                .bind(&c.ingredient_id).bind(&bid).fetch_optional(&self.db).await.map_err(ApiError::from)?;
            match ok.as_deref() {
                Some("assembly") => {}
                Some(_) => return Err(ApiError::bad_request("Recipe components must be assembly (ingredient) items")),
                None => return Err(ApiError::bad_request("Ingredient not found")),
            }
            if c.quantity <= 0.0 { return Err(ApiError::bad_request("Component quantity must be positive")); }
        }
        // Mark the product assembled or not.
        sqlx::query("UPDATE inventory_items SET is_assembled=?, updated_at=datetime('now') WHERE id=? AND business_id=?")
            .bind(if req.is_assembled { 1i64 } else { 0 }).bind(product_id).bind(&bid)
            .execute(&self.db).await.map_err(ApiError::from)?;
        // Replace components.
        sqlx::query("DELETE FROM recipe_components WHERE product_id=? AND business_id=?")
            .bind(product_id).bind(&bid).execute(&self.db).await.map_err(ApiError::from)?;
        for c in &req.components {
            sqlx::query("INSERT OR IGNORE INTO recipe_components (id,business_id,product_id,ingredient_id,quantity) VALUES (?,?,?,?,?)")
                .bind(Uuid::new_v4().to_string()).bind(&bid).bind(product_id).bind(&c.ingredient_id).bind(c.quantity)
                .execute(&self.db).await.map_err(ApiError::from)?;
        }
        let recipe = self.get_recipe(&bid, product_id).await?;
        smeazy_common::audit::audit(&self.db, smeazy_common::audit::AuditEntry::new(&bid, "recipe.update", "recipe", format!("Set recipe for {} ({} ingredients)", recipe.product_name, recipe.components.len()))
            .actor(ctx.user_id.to_string()).entity(product_id, recipe.product_name.clone())).await;
        Ok(recipe)
    }

    /// Bulk "delete" — safe soft-delete (deactivate). Items with sales, stock-take,
    /// or requisition history can't be hard-deleted without corrupting the audit
    /// trail, so this deactivates them instead: they drop out of the active list,
    /// the POS, and low-stock alerts, but historical records stay intact.
    pub async fn bulk_deactivate_items(&self, ctx: &TenantContext, ids: &[String]) -> Result<BulkDeleteResult, ApiError> {
        if ids.is_empty() { return Err(ApiError::bad_request("No items selected")); }
        let bid = ctx.business_id.map(|b| b.to_string()).unwrap_or_default();
        let mut deactivated = Vec::new();
        for id in ids {
            let res = sqlx::query("UPDATE inventory_items SET is_active=0, updated_at=datetime('now') WHERE id=? AND business_id=?")
                .bind(id).bind(&bid).execute(&self.db).await.map_err(ApiError::from)?;
            if res.rows_affected() > 0 { deactivated.push(id.clone()); }
        }
        smeazy_common::audit::audit(&self.db, smeazy_common::audit::AuditEntry::new(&bid, "inventory.bulk_delete", "inventory_item", format!("Deleted {} item(s)", deactivated.len()))
            .actor(ctx.user_id.to_string())
            .meta(&serde_json::json!({ "ids": deactivated }))).await;
        Ok(BulkDeleteResult { deactivated: deactivated.len(), ids: deactivated })
    }

    /// Deplete ingredient stock for an assembled product being sold or spoiled.
    /// Returns true if the product was assembled (ingredients depleted), false if
    /// it's a direct-stock product (caller should deduct the product's own stock).
    pub async fn deplete_ingredients(&self, business_id: &str, product_id: &str, units: f64, movement: &str, order_id: Option<&str>) -> Result<bool, ApiError> {
        let is_assembled: Option<i64> = sqlx::query_scalar("SELECT is_assembled FROM inventory_items WHERE id=? AND business_id=?")
            .bind(product_id).bind(business_id).fetch_optional(&self.db).await.map_err(ApiError::from)?;
        if is_assembled != Some(1) { return Ok(false); }

        let components = sqlx::query_as::<_, (String, f64)>(
            "SELECT ingredient_id, quantity FROM recipe_components WHERE product_id=? AND business_id=?")
            .bind(product_id).bind(business_id).fetch_all(&self.db).await.map_err(ApiError::from)?;
        for (ing_id, per_unit) in components {
            let consumed = per_unit * units;
            sqlx::query("UPDATE inventory_items SET quantity_on_hand = quantity_on_hand - ?, updated_at=datetime('now') WHERE id=? AND track_inventory=1")
                .bind(consumed).bind(&ing_id).execute(&self.db).await.map_err(ApiError::from)?;
            sqlx::query("INSERT INTO inventory_movements (id,item_id,order_id,movement_type,delta_qty,notes) VALUES (?,?,?,?,?,?)")
                .bind(Uuid::new_v4().to_string()).bind(&ing_id).bind(order_id).bind(movement).bind(-consumed)
                .bind(format!("Ingredient depletion for assembled product ({} units)", units))
                .execute(&self.db).await.map_err(ApiError::from)?;
        }
        Ok(true)
    }
}
