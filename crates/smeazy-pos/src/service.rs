use sqlx::SqlitePool;
use std::sync::Arc;
use uuid::Uuid;
use smeazy_common::ApiError;
use smeazy_domain::TenantContext;
use chrono;
use super::models::*;
use smeazy_inventory::service::InventoryService;
use smeazy_accommodation::service::AccommodationService;

pub struct PosService {
    pub db: SqlitePool,
    pub inventory: Arc<InventoryService>,
    pub accommodation: Arc<AccommodationService>,
    /// Broadcast channel for kitchen screen updates
    pub kitchen_tx: tokio::sync::broadcast::Sender<String>,
}

impl PosService {
    pub fn new(db: SqlitePool, inventory: Arc<InventoryService>, accommodation: Arc<AccommodationService>) -> Self {
        let (kitchen_tx, _) = tokio::sync::broadcast::channel(256);
        Self { db, inventory, accommodation, kitchen_tx }
    }

    pub async fn create_order(&self, ctx: &TenantContext, req: CreateOrderReq) -> Result<PosOrder, ApiError> {
        let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
        let id = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO pos_orders (id,business_id,table_id,table_name,guest_count,cashier_id,waitstaff_id,waitstaff_name,customer_name,customer_phone,status,total_amount,discount,notes) VALUES (?,?,?,?,?,?,?,?,?,?,'open',0,0,?)")
            .bind(&id).bind(&bid).bind(&req.table_id).bind(&req.table_name)
            .bind(req.guest_count.unwrap_or(1)).bind(ctx.user_id.to_string())
            .bind(&req.waitstaff_id).bind(&req.waitstaff_name)
            .bind(&req.customer_name).bind(&req.customer_phone).bind(&req.notes)
            .execute(&self.db).await.map_err(ApiError::from)?;
        self.get_order(&id).await
    }

    pub async fn get_order(&self, id: &str) -> Result<PosOrder, ApiError> {
        sqlx::query_as::<_, PosOrder>("SELECT * FROM pos_orders WHERE id=?")
            .bind(id).fetch_one(&self.db).await.map_err(ApiError::from)
    }

    pub async fn get_order_with_items(&self, id: &str) -> Result<OrderWithItems, ApiError> {
        let order = self.get_order(id).await?;
        let items = sqlx::query_as::<_, OrderItem>("SELECT * FROM pos_order_items WHERE order_id=? ORDER BY added_at")
            .bind(id).fetch_all(&self.db).await.map_err(ApiError::from)?;
        let payments = sqlx::query_as::<_, PaymentRecord>("SELECT * FROM payment_records WHERE order_id=?")
            .bind(id).fetch_all(&self.db).await.map_err(ApiError::from)?;
        Ok(OrderWithItems { order, items, payments })
    }

    pub async fn list_open_orders(&self, business_id: &str) -> Result<Vec<PosOrder>, ApiError> {
        sqlx::query_as::<_, PosOrder>(
            "SELECT * FROM pos_orders WHERE business_id=? AND status='open' ORDER BY opened_at DESC")
            .bind(business_id).fetch_all(&self.db).await.map_err(ApiError::from)
    }

    pub async fn add_item(&self, ctx: &TenantContext, order_id: &str, req: AddItemReq) -> Result<OrderItem, ApiError> {
        // Verify order belongs to this business
        let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
        let _order = sqlx::query_as::<_, PosOrder>("SELECT * FROM pos_orders WHERE id=? AND business_id=? AND status='open'")
            .bind(order_id).bind(&bid).fetch_one(&self.db).await
            .map_err(|_| ApiError::not_found("Order not found or already closed"))?;

        let item_id = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO pos_order_items (id,order_id,item_id,name,sku,quantity,unit_price,discount,status,notes) VALUES (?,?,?,?,?,?,?,0,'new',?)")
            .bind(&item_id).bind(order_id).bind(&req.item_id).bind(&req.name).bind(&req.sku)
            .bind(req.quantity).bind(req.unit_price).bind(&req.notes)
            .execute(&self.db).await.map_err(ApiError::from)?;

        // Update order total
        let line_total = req.unit_price * req.quantity as f64;
        sqlx::query("UPDATE pos_orders SET total_amount = total_amount + ? WHERE id=?")
            .bind(line_total).bind(order_id).execute(&self.db).await.map_err(ApiError::from)?;

        // Autonomous check-in: if this item is an Accommodation-department Room,
        // mark it Occupied. No-op for any other item.
        if let Some(ref iid) = req.item_id {
            let _ = self.accommodation.mark_occupied_if_room(&bid, iid, order_id).await;
        }

        sqlx::query_as::<_, OrderItem>("SELECT * FROM pos_order_items WHERE id=?")
            .bind(&item_id).fetch_one(&self.db).await.map_err(ApiError::from)
    }

    pub async fn remove_item(&self, order_id: &str, item_id: &str) -> Result<(), ApiError> {
        let item = sqlx::query_as::<_, OrderItem>("SELECT * FROM pos_order_items WHERE id=? AND order_id=?")
            .bind(item_id).bind(order_id).fetch_one(&self.db).await.map_err(ApiError::from)?;
        let line_total = item.unit_price * item.quantity as f64 - item.discount;
        sqlx::query("DELETE FROM pos_order_items WHERE id=?").bind(item_id).execute(&self.db).await.map_err(ApiError::from)?;
        sqlx::query("UPDATE pos_orders SET total_amount = total_amount - ? WHERE id=?")
            .bind(line_total).bind(order_id).execute(&self.db).await.map_err(ApiError::from)?;
        Ok(())
    }

    /// Directly set a line item's quantity (click-to-edit on the bill), instead of
    /// re-adding the product repeatedly. Setting quantity to 0 or less removes the line.
    pub async fn update_item_quantity(&self, order_id: &str, item_id: &str, new_qty: i64) -> Result<Option<OrderItem>, ApiError> {
        let item = sqlx::query_as::<_, OrderItem>("SELECT * FROM pos_order_items WHERE id=? AND order_id=?")
            .bind(item_id).bind(order_id).fetch_one(&self.db).await
            .map_err(|_| ApiError::not_found("Order item not found"))?;

        let order = sqlx::query_as::<_, PosOrder>("SELECT * FROM pos_orders WHERE id=?")
            .bind(order_id).fetch_one(&self.db).await.map_err(ApiError::from)?;
        if order.status != "open" {
            return Err(ApiError::bad_request("Cannot edit items on a closed order"));
        }

        if new_qty <= 0 {
            self.remove_item(order_id, item_id).await?;
            return Ok(None);
        }

        let old_line_total = item.unit_price * item.quantity as f64 - item.discount;
        let new_line_total = item.unit_price * new_qty as f64 - item.discount;
        let delta = new_line_total - old_line_total;

        sqlx::query("UPDATE pos_order_items SET quantity=? WHERE id=?")
            .bind(new_qty).bind(item_id).execute(&self.db).await.map_err(ApiError::from)?;
        sqlx::query("UPDATE pos_orders SET total_amount = total_amount + ? WHERE id=?")
            .bind(delta).bind(order_id).execute(&self.db).await.map_err(ApiError::from)?;

        let updated = sqlx::query_as::<_, OrderItem>("SELECT * FROM pos_order_items WHERE id=?")
            .bind(item_id).fetch_one(&self.db).await.map_err(ApiError::from)?;
        Ok(Some(updated))
    }

    pub async fn update_item_status(&self, item_id: &str, req: UpdateItemStatusReq) -> Result<OrderItem, ApiError> {
        let dispatched_at = if req.status == "dispatched" { "datetime('now')" } else { "NULL" };
        sqlx::query(&format!("UPDATE pos_order_items SET status=?, dispatched_at={} WHERE id=?", dispatched_at))
            .bind(&req.status).bind(item_id).execute(&self.db).await.map_err(ApiError::from)?;
        sqlx::query_as::<_, OrderItem>("SELECT * FROM pos_order_items WHERE id=?")
            .bind(item_id).fetch_one(&self.db).await.map_err(ApiError::from)
    }

    pub async fn apply_discount(&self, order_id: &str, req: ApplyDiscountReq) -> Result<PosOrder, ApiError> {
        sqlx::query("UPDATE pos_orders SET discount=? WHERE id=?")
            .bind(req.discount).bind(order_id).execute(&self.db).await.map_err(ApiError::from)?;
        self.get_order(order_id).await
    }

    pub async fn update_waitstaff(&self, order_id: &str, req: UpdateWaitstaffReq) -> Result<PosOrder, ApiError> {
        sqlx::query("UPDATE pos_orders SET waitstaff_id=?, waitstaff_name=? WHERE id=?")
            .bind(&req.waitstaff_id).bind(&req.waitstaff_name).bind(order_id)
            .execute(&self.db).await.map_err(ApiError::from)?;
        self.get_order(order_id).await
    }

    pub async fn send_to_kitchen(&self, ctx: &TenantContext, order_id: &str, req: SendToKitchenReq) -> Result<serde_json::Value, ApiError> {
        let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
        let order = self.get_order_with_items(order_id).await?;
        
        // Create kitchen order
        let kitchen_id = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO kitchen_orders (id,order_id,business_id,table_name,waitstaff_name,status,notes) VALUES (?,?,?,?,?,'pending',?)")
            .bind(&kitchen_id).bind(order_id).bind(&bid)
            .bind(order.order.table_name.as_deref().unwrap_or("Takeaway"))
            .bind(&order.order.waitstaff_name).bind(&req.notes)
            .execute(&self.db).await.map_err(ApiError::from)?;

        // Add kitchen items for items that are 'new' status
        for item in order.items.iter().filter(|i| i.status == "new") {
            let kid = Uuid::new_v4().to_string();
            sqlx::query("INSERT INTO kitchen_order_items (id,kitchen_order_id,order_item_id,name,quantity,notes,status) VALUES (?,?,?,?,?,?,'new')")
                .bind(&kid).bind(&kitchen_id).bind(&item.id).bind(&item.name)
                .bind(item.quantity).bind(&item.notes)
                .execute(&self.db).await.map_err(ApiError::from)?;
        }

        // Mark order as sent to kitchen and update items to processing
        sqlx::query("UPDATE pos_orders SET kitchen_sent_at=datetime('now') WHERE id=?")
            .bind(order_id).execute(&self.db).await.map_err(ApiError::from)?;
        sqlx::query("UPDATE pos_order_items SET status='processing' WHERE order_id=? AND status='new'")
            .bind(order_id).execute(&self.db).await.map_err(ApiError::from)?;

        // Broadcast to kitchen screen
        let _ = self.kitchen_tx.send(kitchen_id.clone());

        Ok(serde_json::json!({ "kitchen_order_id": kitchen_id, "sent": true }))
    }

    /// Process checkout with split payments (manual confirmation, no external APIs).
    /// Computes VAT-inclusive breakdown and supports director subsidised rates.
    pub async fn checkout(&self, ctx: &TenantContext, order_id: &str, req: CheckoutReq) -> Result<CheckoutResult, ApiError> {
        let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
        let order = self.get_order(order_id).await?;

        if order.status != "open" {
            return Err(ApiError::bad_request("Order is not open"));
        }

        // ── Director subsidised rates ──────────────────────────────────────────
        // directors_promo    → 100% discount (consumed free, still tracked)
        // directors_discount → sold at cost price (purchase price), no margin
        let gross = order.total_amount;
        let dtype = req.discount_type.as_deref();
        let total = match dtype {
            Some("directors_promo") => 0.0,
            Some("directors_discount") => {
                // Sum cost price of all order items with a linked inventory item.
                let items = sqlx::query_as::<_, OrderItem>("SELECT * FROM pos_order_items WHERE order_id=?")
                    .bind(order_id).fetch_all(&self.db).await.map_err(ApiError::from)?;
                let mut cost_total = 0.0;
                for it in &items {
                    if let Some(ref iid) = it.item_id {
                        let cost: Option<f64> = sqlx::query_scalar("SELECT cost_price FROM inventory_items WHERE id=?")
                            .bind(iid).fetch_optional(&self.db).await.ok().flatten();
                        cost_total += cost.unwrap_or(0.0) * it.quantity as f64;
                    } else {
                        // No linked inventory (e.g. bar item without cost) — fall back to sale line.
                        cost_total += it.unit_price * it.quantity as f64;
                    }
                }
                cost_total
            }
            _ => gross - order.discount - req.discount.unwrap_or(0.0),
        };

        let total_paid: f64 = req.payments.iter().map(|p| p.amount).sum();

        // Director promo needs no payment; otherwise a shortfall is either rejected
        // or, if the caller opted in and a customer is attached, opened as a tab.
        let is_shortfall = dtype != Some("directors_promo") && total_paid < total - 0.01;
        let allow_partial = req.allow_partial.unwrap_or(false);
        if is_shortfall && !allow_partial {
            return Err(ApiError::bad_request(format!("Insufficient payment. Total: {:.2}, Paid: {:.2}", total, total_paid)));
        }
        if is_shortfall && order.customer_id.is_none() {
            return Err(ApiError::bad_request("Attach a customer to this order before opening a partial-payment tab"));
        }
        let change_due = if is_shortfall { 0.0 } else { (total_paid - total).max(0.0) };
        let balance_due = if is_shortfall { (total - total_paid).max(0.0) } else { 0.0 };
        let order_status = if is_shortfall { "tab" } else { "paid" };

        // ── VAT-inclusive breakdown ────────────────────────────────────────────
        // Displayed prices already include VAT. Per business config (default 16%),
        // net = total * (1 - rate), vat = total * rate.
        let vat_rate: f64 = sqlx::query_scalar::<_, Option<String>>(
            "SELECT value FROM business_settings WHERE business_id=? AND key='vat_rate'")
            .bind(&bid).fetch_optional(&self.db).await.ok().flatten().flatten()
            .and_then(|v| v.parse::<f64>().ok()).unwrap_or(16.0) / 100.0;
        let vat_amount = (total * vat_rate * 100.0).round() / 100.0;
        let net_amount = (total - vat_amount).max(0.0);

        // Record each payment
        let mut payment_records = Vec::new();
        for payment in &req.payments {
            let pid = Uuid::new_v4().to_string();
            sqlx::query("INSERT INTO payment_records (id,order_id,method,amount,reference,confirmed_by) VALUES (?,?,?,?,?,?)")
                .bind(&pid).bind(order_id).bind(&payment.method)
                .bind(payment.amount).bind(&payment.reference).bind(ctx.user_id.to_string())
                .execute(&self.db).await.map_err(ApiError::from)?;
            payment_records.push(PaymentRecord {
                id: pid, order_id: order_id.to_string(), method: payment.method.clone(),
                amount: payment.amount, reference: payment.reference.clone(),
                confirmed_at: chrono::Utc::now().to_rfc3339(),
            });
        }

        // Close order with VAT breakdown + discount type. A shortfall order is
        // served and closed for editing just like a fully paid one, but keeps
        // status='tab' and records the outstanding balance_due against the
        // attached customer until it's settled via pay_tab().
        sqlx::query("UPDATE pos_orders SET status=?, closed_at=CASE WHEN ?='paid' THEN datetime('now') ELSE closed_at END, total_amount=?, net_amount=?, vat_amount=?, discount_type=?, authorized_by=?, balance_due=? WHERE id=?")
            .bind(order_status).bind(order_status).bind(total).bind(net_amount).bind(vat_amount)
            .bind(&req.discount_type).bind(&req.authorized_by).bind(balance_due)
            .bind(order_id).execute(&self.db).await.map_err(ApiError::from)?;

        sqlx::query("UPDATE pos_order_items SET status='paid' WHERE order_id=?")
            .bind(order_id).execute(&self.db).await.map_err(ApiError::from)?;
        sqlx::query("UPDATE kitchen_orders SET status='completed', completed_at=datetime('now') WHERE order_id=?")
            .bind(order_id).execute(&self.db).await.map_err(ApiError::from)?;

        // Deduct inventory stock for linked items (sale movement) — goods are
        // served whether the balance is settled in full or carried as a tab.
        let items = sqlx::query_as::<_, OrderItem>("SELECT * FROM pos_order_items WHERE order_id=?")
            .bind(order_id).fetch_all(&self.db).await.map_err(ApiError::from)?;
        for item in &items {
            if let Some(ref iid) = item.item_id {
                let _ = self.inventory.deduct_stock_on_sale(iid, item.quantity as f64, order_id).await;
            }
        }

        // Revenue ledger entry (net of VAT is the business revenue; VAT is a liability)
        let ledger_id = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO wallet_ledger (id,business_id,dc,amount,description,source_ref) VALUES (?,?,'credit',?,'POS Sale',?)")
            .bind(&ledger_id).bind(&bid).bind(total).bind(order_id)
            .execute(&self.db).await.map_err(ApiError::from)?;

        // ── Audit trail ────────────────────────────────────────────────────────
        let action = match dtype {
            Some("directors_promo") => "sale.directors_promo",
            Some("directors_discount") => "sale.directors_discount",
            _ if is_shortfall => "sale.tab_opened",
            _ => "sale.checkout",
        };
        let summary = match dtype {
            Some("directors_promo") => format!("Director's promotion (100% off) — {} settled free", order.table_name.clone().unwrap_or_else(|| "order".into())),
            Some("directors_discount") => format!("Director's discount (at cost KES {:.2}) — {}", total, order.table_name.clone().unwrap_or_else(|| "order".into())),
            _ if is_shortfall => format!("Tab opened for {} — KES {:.2} of {:.2} paid, KES {:.2} outstanding",
                order.customer_name.clone().unwrap_or_else(|| "customer".into()), total_paid, total, balance_due),
            _ => format!("Checkout KES {:.2} (net {:.2} + VAT {:.2})", total, net_amount, vat_amount),
        };
        smeazy_common::audit::audit(&self.db, smeazy_common::audit::AuditEntry::new(&bid, action, "order", summary)
            .actor(ctx.user_id.to_string())
            .entity(order_id, order.table_name.clone().unwrap_or_else(|| order_id.to_string()))
            .meta(&serde_json::json!({ "gross": gross, "total": total, "net": net_amount, "vat": vat_amount, "discount_type": dtype, "authorized_by": req.authorized_by, "balance_due": balance_due, "customer_id": order.customer_id, "payments": req.payments.iter().map(|p| serde_json::json!({"method": p.method, "amount": p.amount})).collect::<Vec<_>>() }))).await;

        Ok(CheckoutResult { order_id: order_id.to_string(), total, net_amount, vat_amount, paid: total_paid, change_due, balance_due, status: order_status.to_string(), payments: payment_records })
    }

    /// Record a further payment against an order that was left as an open
    /// 'tab' (partially paid) — used to settle a customer's outstanding
    /// balance over time. Closes the order once the balance reaches zero.
    pub async fn pay_tab(&self, ctx: &TenantContext, order_id: &str, req: PayTabReq) -> Result<CheckoutResult, ApiError> {
        let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
        let order = sqlx::query_as::<_, PosOrder>("SELECT * FROM pos_orders WHERE id=? AND business_id=?")
            .bind(order_id).bind(&bid).fetch_one(&self.db).await
            .map_err(|_| ApiError::not_found("Order not found"))?;
        if order.status != "tab" { return Err(ApiError::bad_request("This order does not have an open tab")); }
        let payments: Vec<&ConfirmPaymentReq> = req.payments.iter().filter(|p| p.amount > 0.0).collect();
        if payments.is_empty() { return Err(ApiError::bad_request("Enter at least one payment amount")); }

        let mut payment_records = Vec::new();
        let mut paid_now = 0.0;
        for payment in &payments {
            let pid = Uuid::new_v4().to_string();
            sqlx::query("INSERT INTO payment_records (id,order_id,method,amount,reference,confirmed_by) VALUES (?,?,?,?,?,?)")
                .bind(&pid).bind(order_id).bind(&payment.method).bind(payment.amount).bind(&payment.reference).bind(ctx.user_id.to_string())
                .execute(&self.db).await.map_err(ApiError::from)?;
            paid_now += payment.amount;
            payment_records.push(PaymentRecord { id: pid, order_id: order_id.to_string(), method: payment.method.clone(), amount: payment.amount, reference: payment.reference.clone(), confirmed_at: chrono::Utc::now().to_rfc3339() });
        }

        let new_balance = (order.balance_due - paid_now).max(0.0);
        let new_status = if new_balance <= 0.01 { "paid" } else { "tab" };
        sqlx::query("UPDATE pos_orders SET balance_due=?, status=?, closed_at=CASE WHEN ?='paid' THEN datetime('now') ELSE closed_at END WHERE id=?")
            .bind(new_balance).bind(new_status).bind(new_status).bind(order_id)
            .execute(&self.db).await.map_err(ApiError::from)?;

        let (net_amount, vat_amount): (f64, f64) = sqlx::query_as("SELECT net_amount, vat_amount FROM pos_orders WHERE id=?")
            .bind(order_id).fetch_one(&self.db).await.map_err(ApiError::from)?;

        smeazy_common::audit::audit(&self.db, smeazy_common::audit::AuditEntry::new(&bid,
            if new_status == "paid" { "sale.tab_settled" } else { "sale.tab_payment" }, "order",
            format!("Tab payment of KES {:.2} for {}{}", paid_now,
                order.customer_name.clone().unwrap_or_else(|| "customer".into()),
                if new_status == "paid" { " — tab fully settled".to_string() } else { format!(" — KES {:.2} still outstanding", new_balance) }))
            .actor(ctx.user_id.to_string())
            .entity(order_id, order.table_name.clone().unwrap_or_else(|| order_id.to_string()))
            .meta(&serde_json::json!({ "paid_now": paid_now, "new_balance": new_balance, "customer_id": order.customer_id }))).await;

        Ok(CheckoutResult {
            order_id: order_id.to_string(), total: order.total_amount, net_amount, vat_amount,
            paid: paid_now, change_due: 0.0, balance_due: new_balance, status: new_status.to_string(),
            payments: payment_records,
        })
    }

    // ── Customers / tabs ────────────────────────────────────────────────────
    async fn with_balances(&self, customers: Vec<Customer>) -> Result<Vec<CustomerWithBalance>, ApiError> {
        let mut out = Vec::with_capacity(customers.len());
        for c in customers {
            let (balance, open_tabs): (Option<f64>, i64) = sqlx::query_as(
                "SELECT SUM(balance_due), COUNT(*) FROM pos_orders WHERE customer_id=? AND status='tab'")
                .bind(&c.id).fetch_one(&self.db).await.map_err(ApiError::from)?;
            out.push(CustomerWithBalance { customer: c, balance_due: balance.unwrap_or(0.0), open_tabs });
        }
        Ok(out)
    }

    pub async fn search_customers(&self, business_id: &str, query: &str) -> Result<Vec<CustomerWithBalance>, ApiError> {
        let like = format!("%{}%", query.trim());
        let customers = sqlx::query_as::<_, Customer>(
            "SELECT * FROM customers WHERE business_id=? AND (name LIKE ? OR phone LIKE ?) ORDER BY name LIMIT 10")
            .bind(business_id).bind(&like).bind(&like)
            .fetch_all(&self.db).await.map_err(ApiError::from)?;
        self.with_balances(customers).await
    }

    pub async fn list_customers(&self, business_id: &str) -> Result<Vec<CustomerWithBalance>, ApiError> {
        let customers = sqlx::query_as::<_, Customer>("SELECT * FROM customers WHERE business_id=? ORDER BY name")
            .bind(business_id).fetch_all(&self.db).await.map_err(ApiError::from)?;
        self.with_balances(customers).await
    }

    pub async fn get_customer(&self, business_id: &str, id: &str) -> Result<CustomerDetail, ApiError> {
        let customer = sqlx::query_as::<_, Customer>("SELECT * FROM customers WHERE id=? AND business_id=?")
            .bind(id).bind(business_id).fetch_one(&self.db).await.map_err(ApiError::from)?;
        let orders = sqlx::query_as::<_, PosOrder>("SELECT * FROM pos_orders WHERE customer_id=? ORDER BY opened_at DESC LIMIT 100")
            .bind(id).fetch_all(&self.db).await.map_err(ApiError::from)?;
        let balance: Option<f64> = sqlx::query_scalar("SELECT SUM(balance_due) FROM pos_orders WHERE customer_id=? AND status='tab'")
            .bind(id).fetch_one(&self.db).await.map_err(ApiError::from)?;
        Ok(CustomerDetail { customer, balance_due: balance.unwrap_or(0.0), orders })
    }

    pub async fn create_customer(&self, business_id: &str, req: CreateCustomerReq) -> Result<Customer, ApiError> {
        if req.name.trim().is_empty() { return Err(ApiError::bad_request("Customer name is required")); }
        let id = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO customers (id,business_id,name,phone,email,notes) VALUES (?,?,?,?,?,?)")
            .bind(&id).bind(business_id).bind(req.name.trim()).bind(&req.phone).bind(&req.email).bind(&req.notes)
            .execute(&self.db).await.map_err(ApiError::from)?;
        sqlx::query_as::<_, Customer>("SELECT * FROM customers WHERE id=?")
            .bind(&id).fetch_one(&self.db).await.map_err(ApiError::from)
    }

    /// Resolve a customer for an order: by explicit id, else by phone match,
    /// else by exact case-insensitive name match, else create a brand new one.
    /// This is what lets a waiter just type a name — if it doesn't match
    /// anyone, the customer is created transparently; if it does, that
    /// existing record (and their running tab) is reused.
    async fn resolve_or_create_customer(&self, business_id: &str, customer_id: Option<&str>, name: &str, phone: Option<&str>) -> Result<Customer, ApiError> {
        if let Some(cid) = customer_id {
            if let Some(c) = sqlx::query_as::<_, Customer>("SELECT * FROM customers WHERE id=? AND business_id=?")
                .bind(cid).bind(business_id).fetch_optional(&self.db).await.map_err(ApiError::from)? {
                return Ok(c);
            }
        }
        if let Some(p) = phone.map(|p| p.trim()).filter(|p| !p.is_empty()) {
            if let Some(c) = sqlx::query_as::<_, Customer>("SELECT * FROM customers WHERE business_id=? AND phone=?")
                .bind(business_id).bind(p).fetch_optional(&self.db).await.map_err(ApiError::from)? {
                if !name.is_empty() && c.name != name {
                    sqlx::query("UPDATE customers SET name=?, updated_at=datetime('now') WHERE id=?")
                        .bind(name).bind(&c.id).execute(&self.db).await.map_err(ApiError::from)?;
                    return sqlx::query_as::<_, Customer>("SELECT * FROM customers WHERE id=?").bind(&c.id).fetch_one(&self.db).await.map_err(ApiError::from);
                }
                return Ok(c);
            }
        }
        if let Some(c) = sqlx::query_as::<_, Customer>("SELECT * FROM customers WHERE business_id=? AND lower(name)=lower(?)")
            .bind(business_id).bind(name).fetch_optional(&self.db).await.map_err(ApiError::from)? {
            if let Some(p) = phone.map(|p| p.trim()).filter(|p| !p.is_empty()) {
                if c.phone.is_none() {
                    sqlx::query("UPDATE customers SET phone=?, updated_at=datetime('now') WHERE id=?")
                        .bind(p).bind(&c.id).execute(&self.db).await.map_err(ApiError::from)?;
                }
            }
            return Ok(c);
        }
        self.create_customer(business_id, CreateCustomerReq { name: name.to_string(), phone: phone.map(|s| s.to_string()), email: None, notes: None }).await
    }

    /// Attach a customer to an order — creating them on the fly if this is a
    /// new name. Called when the waiter confirms a name from the search-bar
    /// suggestions (or just finishes typing a new one).
    pub async fn attach_customer(&self, ctx: &TenantContext, order_id: &str, req: AttachCustomerReq) -> Result<PosOrder, ApiError> {
        let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
        if req.name.trim().is_empty() { return Err(ApiError::bad_request("Customer name is required")); }
        let customer = self.resolve_or_create_customer(&bid, req.customer_id.as_deref(), req.name.trim(), req.phone.as_deref()).await?;
        sqlx::query("UPDATE pos_orders SET customer_id=?, customer_name=?, customer_phone=? WHERE id=? AND business_id=?")
            .bind(&customer.id).bind(&customer.name).bind(&customer.phone).bind(order_id).bind(&bid)
            .execute(&self.db).await.map_err(ApiError::from)?;
        self.get_order(order_id).await
    }

    pub async fn void_order(&self, ctx: &TenantContext, order_id: &str) -> Result<(), ApiError> {
        let bid = ctx.business_id.ok_or_else(|| ApiError::forbidden("No business context"))?.to_string();
        let result = sqlx::query("UPDATE pos_orders SET status='voided', closed_at=datetime('now') WHERE id=? AND business_id=? AND status='open'")
            .bind(order_id).bind(&bid).execute(&self.db).await.map_err(ApiError::from)?;
        if result.rows_affected() > 0 {
            // The order was cleared before payment — any Rooms tied to it were
            // never actually sold, so revert them to Ready.
            let _ = self.accommodation.revert_rooms_for_voided_order(&bid, order_id).await;
        }
        Ok(())
    }
    
    pub async fn daily_summary(&self, business_id: &str, date: &str) -> Result<serde_json::Value, ApiError> {
        let row = sqlx::query_as::<_, (f64, i64, i64, i64)>(
            "SELECT COALESCE(SUM(total_amount),0), COUNT(*), COUNT(*) FILTER(WHERE status='paid'), COUNT(*) FILTER(WHERE status='voided')
             FROM pos_orders WHERE business_id=? AND DATE(opened_at)=?")
            .bind(business_id).bind(date).fetch_one(&self.db).await.map_err(ApiError::from)?;
        Ok(serde_json::json!({ "date": date, "total_revenue": row.0, "orders_total": row.1, "paid": row.2, "voided": row.3 }))
    }
}
