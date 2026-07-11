use sqlx::SqlitePool;
use smeazy_common::ApiError;
use super::models::*;

pub struct AnalyticsService { pub db: SqlitePool }

impl AnalyticsService {
    pub fn new(db: SqlitePool) -> Self { Self { db } }

    fn date_range(q: &AnalyticsQuery) -> (String, String) {
        let end = q.end_date.clone().unwrap_or_else(|| chrono::Utc::now().format("%Y-%m-%d").to_string());
        let start = q.start_date.clone().unwrap_or_else(|| {
            (chrono::Utc::now() - chrono::Duration::days(30)).format("%Y-%m-%d").to_string()
        });
        (start, end)
    }

    pub async fn revenue_report(&self, business_id: &str, q: &AnalyticsQuery) -> Result<RevenueReport, ApiError> {
        let (start, end) = Self::date_range(q);
        let summary = sqlx::query_as::<_, RevenueSummary>(
            "SELECT DATE(opened_at) as period,
             COALESCE(SUM(total_amount + discount), 0) as gross_sales,
             COALESCE(SUM(total_amount), 0) as net_sales,
             COUNT(*) as orders_count, 0.0 as refunds,
             COALESCE(SUM(discount), 0) as discounts
             FROM pos_orders WHERE business_id=? AND status='paid'
             AND DATE(opened_at) BETWEEN ? AND ?
             GROUP BY DATE(opened_at) ORDER BY period")
            .bind(business_id).bind(&start).bind(&end)
            .fetch_all(&self.db).await.map_err(ApiError::from)?;

        let totals_row: (f64, f64, i64, f64) = sqlx::query_as(
            "SELECT COALESCE(SUM(total_amount+discount),0), COALESCE(SUM(total_amount),0), COUNT(*), COALESCE(SUM(discount),0)
             FROM pos_orders WHERE business_id=? AND status='paid' AND DATE(opened_at) BETWEEN ? AND ?")
            .bind(business_id).bind(&start).bind(&end)
            .fetch_one(&self.db).await.map_err(ApiError::from)?;

        let total_orders = totals_row.2;
        let totals = RevenueTotals {
            gross_sales: totals_row.0, net_sales: totals_row.1,
            total_orders, total_discounts: totals_row.3,
            average_order_value: if total_orders > 0 { totals_row.1 / total_orders as f64 } else { 0.0 },
            period_start: start.clone(), period_end: end.clone(),
        };

        let comparison = if let Some(ref mode) = q.compare_period {
            let (cstart, cend) = if mode == "previous_year" {
                (format!("{}-{}", start[..4].parse::<i32>().unwrap_or(2025)-1, &start[5..]),
                 format!("{}-{}", end[..4].parse::<i32>().unwrap_or(2026)-1, &end[5..]))
            } else {
                let days = (chrono::NaiveDate::parse_from_str(&end, "%Y-%m-%d").unwrap_or_default()
                    - chrono::NaiveDate::parse_from_str(&start, "%Y-%m-%d").unwrap_or_default()).num_days();
                let cs = chrono::NaiveDate::parse_from_str(&start, "%Y-%m-%d")
                    .map(|d| d - chrono::Duration::days(days+1)).unwrap_or_default();
                let ce = chrono::NaiveDate::parse_from_str(&start, "%Y-%m-%d")
                    .map(|d| d - chrono::Duration::days(1)).unwrap_or_default();
                (cs.format("%Y-%m-%d").to_string(), ce.format("%Y-%m-%d").to_string())
            };
            Some(sqlx::query_as::<_, RevenueSummary>(
                "SELECT DATE(opened_at) as period, COALESCE(SUM(total_amount+discount),0) as gross_sales, COALESCE(SUM(total_amount),0) as net_sales, COUNT(*) as orders_count, 0.0 as refunds, COALESCE(SUM(discount),0) as discounts FROM pos_orders WHERE business_id=? AND status='paid' AND DATE(opened_at) BETWEEN ? AND ? GROUP BY DATE(opened_at) ORDER BY period")
                .bind(business_id).bind(&cstart).bind(&cend)
                .fetch_all(&self.db).await.map_err(ApiError::from)?)
        } else { None };

        Ok(RevenueReport { summary, totals, comparison })
    }

    pub async fn product_report(&self, business_id: &str, q: &AnalyticsQuery) -> Result<ProductReport, ApiError> {
        let (start, end) = Self::date_range(q);
        let items = sqlx::query_as::<_, ProductPerformance>(
            "SELECT oi.item_id, oi.name, COALESCE(oi.sku,'') as sku,
             c.name as category_name,
             CAST(SUM(oi.quantity) AS INTEGER) as items_sold,
             COALESCE(SUM(oi.quantity * oi.unit_price - oi.discount), 0) as net_sales,
             COUNT(DISTINCT oi.order_id) as orders_count
             FROM pos_order_items oi
             JOIN pos_orders o ON o.id = oi.order_id
             LEFT JOIN inventory_items inv ON inv.id = oi.item_id
             LEFT JOIN product_categories c ON c.id = inv.category_id
             WHERE o.business_id=? AND o.status='paid'
             AND DATE(o.opened_at) BETWEEN ? AND ?
             GROUP BY oi.name ORDER BY items_sold DESC LIMIT ? OFFSET ?")
            .bind(business_id).bind(&start).bind(&end)
            .bind(q.limit.unwrap_or(100)).bind(q.offset.unwrap_or(0))
            .fetch_all(&self.db).await.map_err(ApiError::from)?;

        let (total_sold, total_sales, total_orders): (i64, f64, i64) = sqlx::query_as(
            "SELECT CAST(COALESCE(SUM(oi.quantity),0) AS INTEGER), COALESCE(SUM(oi.quantity*oi.unit_price-oi.discount),0), COUNT(DISTINCT oi.order_id) FROM pos_order_items oi JOIN pos_orders o ON o.id=oi.order_id WHERE o.business_id=? AND o.status='paid' AND DATE(o.opened_at) BETWEEN ? AND ?")
            .bind(business_id).bind(&start).bind(&end)
            .fetch_one(&self.db).await.map_err(ApiError::from)?;

        Ok(ProductReport { items, total_items_sold: total_sold, total_net_sales: total_sales, total_orders })
    }

    pub async fn category_report(&self, business_id: &str, q: &AnalyticsQuery) -> Result<CategoryReport, ApiError> {
        let (start, end) = Self::date_range(q);
        let rows = sqlx::query_as::<_, (Option<String>, String, i64, f64, i64)>(
            "SELECT inv.category_id, COALESCE(c.name,'Uncategorized'),
             CAST(SUM(oi.quantity) AS INTEGER),
             COALESCE(SUM(oi.quantity*oi.unit_price-oi.discount),0),
             COUNT(DISTINCT oi.order_id)
             FROM pos_order_items oi
             JOIN pos_orders o ON o.id=oi.order_id
             LEFT JOIN inventory_items inv ON inv.id=oi.item_id
             LEFT JOIN product_categories c ON c.id=inv.category_id
             WHERE o.business_id=? AND o.status='paid' AND DATE(o.opened_at) BETWEEN ? AND ?
             GROUP BY inv.category_id ORDER BY 4 DESC")
            .bind(business_id).bind(&start).bind(&end)
            .fetch_all(&self.db).await.map_err(ApiError::from)?;

        let cats: Vec<CategoryPerformance> = rows.into_iter().map(|(id, name, sold, sales, orders)| CategoryPerformance {
            category_id: id, category_name: name, items_sold: sold, net_sales: sales, orders_count: orders,
        }).collect();
        let total_sales = cats.iter().map(|c| c.net_sales).sum();
        let total_sold = cats.iter().map(|c| c.items_sold).sum();
        Ok(CategoryReport { categories: cats, total_net_sales: total_sales, total_items_sold: total_sold })
    }

    /// Staff performance — sales attributed to assigned waitstaff
    pub async fn staff_report(&self, business_id: &str, q: &AnalyticsQuery) -> Result<StaffReport, ApiError> {
        let (start, end) = Self::date_range(q);
        let staff = sqlx::query_as::<_, StaffPerformance>(
            "SELECT COALESCE(o.waitstaff_name,'Unassigned') as staff_name,
             COUNT(DISTINCT o.id) as orders_count,
             COALESCE(SUM(o.total_amount),0) as net_sales,
             COALESCE(AVG(o.total_amount),0) as avg_order_value,
             CAST(COALESCE((SELECT SUM(oi.quantity) FROM pos_order_items oi WHERE oi.order_id IN
               (SELECT id FROM pos_orders o2 WHERE o2.business_id=o.business_id AND COALESCE(o2.waitstaff_name,'Unassigned')=COALESCE(o.waitstaff_name,'Unassigned') AND o2.status='paid' AND DATE(o2.opened_at) BETWEEN ? AND ?)
             ),0) AS INTEGER) as items_sold,
             CAST(COALESCE(SUM(o.guest_count),0) AS INTEGER) as total_guests
             FROM pos_orders o
             WHERE o.business_id=? AND o.status='paid' AND DATE(o.opened_at) BETWEEN ? AND ?
             GROUP BY COALESCE(o.waitstaff_name,'Unassigned')
             ORDER BY net_sales DESC")
            .bind(&start).bind(&end)
            .bind(business_id).bind(&start).bind(&end)
            .fetch_all(&self.db).await.map_err(ApiError::from)?;

        let total_net_sales = staff.iter().map(|s| s.net_sales).sum();
        let total_orders = staff.iter().map(|s| s.orders_count).sum();
        Ok(StaffReport { staff, total_net_sales, total_orders })
    }

    // ── CSV exports ─────────────────────────────────────────────────────────
    pub async fn export_revenue_csv(&self, business_id: &str, q: &AnalyticsQuery) -> Result<String, ApiError> {
        let report = self.revenue_report(business_id, q).await?;
        let mut wtr = csv::Writer::from_writer(Vec::new());
        wtr.write_record(&["date","gross_sales","net_sales","orders","discounts"]).ok();
        for row in &report.summary {
            let r: Vec<String> = vec![row.period.clone(), row.gross_sales.to_string(), row.net_sales.to_string(), row.orders_count.to_string(), row.discounts.to_string()];
            wtr.write_record(&r).ok();
        }
        String::from_utf8(wtr.into_inner().unwrap_or_default()).map_err(|e| ApiError::internal(e.to_string()))
    }

    pub async fn export_products_csv(&self, business_id: &str, q: &AnalyticsQuery) -> Result<String, ApiError> {
        let report = self.product_report(business_id, q).await?;
        let mut wtr = csv::Writer::from_writer(Vec::new());
        wtr.write_record(&["product","sku","category","items_sold","net_sales_kes","orders"]).ok();
        for p in &report.items {
            let r: Vec<String> = vec![p.name.clone(), p.sku.clone(), p.category_name.clone().unwrap_or_default(), p.items_sold.to_string(), p.net_sales.to_string(), p.orders_count.to_string()];
            wtr.write_record(&r).ok();
        }
        String::from_utf8(wtr.into_inner().unwrap_or_default()).map_err(|e| ApiError::internal(e.to_string()))
    }

    pub async fn export_categories_csv(&self, business_id: &str, q: &AnalyticsQuery) -> Result<String, ApiError> {
        let report = self.category_report(business_id, q).await?;
        let mut wtr = csv::Writer::from_writer(Vec::new());
        wtr.write_record(&["category","items_sold","net_sales_kes","orders"]).ok();
        for c in &report.categories {
            let r: Vec<String> = vec![c.category_name.clone(), c.items_sold.to_string(), c.net_sales.to_string(), c.orders_count.to_string()];
            wtr.write_record(&r).ok();
        }
        String::from_utf8(wtr.into_inner().unwrap_or_default()).map_err(|e| ApiError::internal(e.to_string()))
    }

    pub async fn export_staff_csv(&self, business_id: &str, q: &AnalyticsQuery) -> Result<String, ApiError> {
        let report = self.staff_report(business_id, q).await?;
        let mut wtr = csv::Writer::from_writer(Vec::new());
        wtr.write_record(&["staff","orders","net_sales_kes","avg_order_kes","items_sold","guests_served"]).ok();
        for s in &report.staff {
            let r: Vec<String> = vec![s.staff_name.clone(), s.orders_count.to_string(), s.net_sales.to_string(), format!("{:.2}", s.avg_order_value), s.items_sold.to_string(), s.total_guests.to_string()];
            wtr.write_record(&r).ok();
        }
        String::from_utf8(wtr.into_inner().unwrap_or_default()).map_err(|e| ApiError::internal(e.to_string()))
    }
}
