use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct RevenueSummary {
    pub period: String, pub gross_sales: f64, pub net_sales: f64,
    pub orders_count: i64, pub refunds: f64, pub discounts: f64,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ProductPerformance {
    pub item_id: Option<String>, pub name: String, pub sku: String,
    pub category_name: Option<String>,
    pub items_sold: i64, pub net_sales: f64, pub orders_count: i64,
}

#[derive(Debug, Serialize)]
pub struct CategoryPerformance {
    pub category_id: Option<String>, pub category_name: String,
    pub items_sold: i64, pub net_sales: f64, pub orders_count: i64,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct StaffPerformance {
    pub staff_name: String,
    pub orders_count: i64,
    pub net_sales: f64,
    pub avg_order_value: f64,
    pub items_sold: i64,
    pub total_guests: i64,
}

#[derive(Debug, Deserialize)]
pub struct AnalyticsQuery {
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub compare_period: Option<String>,
    pub category_id: Option<String>,
    pub product_id: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct RevenueReport {
    pub summary: Vec<RevenueSummary>,
    pub totals: RevenueTotals,
    pub comparison: Option<Vec<RevenueSummary>>,
}

#[derive(Debug, Serialize)]
pub struct RevenueTotals {
    pub gross_sales: f64, pub net_sales: f64, pub total_orders: i64,
    pub average_order_value: f64, pub total_discounts: f64,
    pub period_start: String, pub period_end: String,
}

#[derive(Debug, Serialize)]
pub struct ProductReport {
    pub items: Vec<ProductPerformance>,
    pub total_items_sold: i64, pub total_net_sales: f64, pub total_orders: i64,
}

#[derive(Debug, Serialize)]
pub struct CategoryReport {
    pub categories: Vec<CategoryPerformance>,
    pub total_net_sales: f64, pub total_items_sold: i64,
}

#[derive(Debug, Serialize)]
pub struct StaffReport {
    pub staff: Vec<StaffPerformance>,
    pub total_net_sales: f64, pub total_orders: i64,
}
