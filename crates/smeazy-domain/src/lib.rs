//! SMEazy Domain V2 — pure types, zero I/O

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Money { pub amount: Decimal, pub currency: Currency }
impl Money {
    pub fn kes(amount: Decimal) -> Self { Self { amount, currency: Currency::Kes } }
    pub fn zero_kes() -> Self { Self::kes(Decimal::ZERO) }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum Currency { Kes, Usd }

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UserRoleType {
    SysAdminIt, SysAdminFinance, Customer, Solopreneur,
    Entrepreneur, AdminStaff, ExecutiveStaff, OperationalStaff, GuestContractor,
}
impl UserRoleType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::SysAdminIt       => "sys_admin_it",
            Self::SysAdminFinance  => "sys_admin_finance",
            Self::Customer         => "customer",
            Self::Solopreneur      => "solopreneur",
            Self::Entrepreneur     => "entrepreneur",
            Self::AdminStaff       => "admin_staff",
            Self::ExecutiveStaff   => "executive_staff",
            Self::OperationalStaff => "operational_staff",
            Self::GuestContractor  => "guest_contractor",
        }
    }
    pub fn from_str(s: &str) -> Self {
        match s {
            "sys_admin_it"      => Self::SysAdminIt,
            "sys_admin_finance" => Self::SysAdminFinance,
            "solopreneur"       => Self::Solopreneur,
            "entrepreneur"      => Self::Entrepreneur,
            "admin_staff"       => Self::AdminStaff,
            "executive_staff"   => Self::ExecutiveStaff,
            "operational_staff" => Self::OperationalStaff,
            "guest_contractor"  => Self::GuestContractor,
            _                   => Self::Customer,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TenantContext {
    pub tenant_id:   Uuid,
    pub business_id: Option<Uuid>,
    pub user_id:     Uuid,
    pub role:        UserRoleType,
}

#[derive(Debug, thiserror::Error)]
pub enum DomainError {
    #[error("Not found: {entity} {id}")] NotFound { entity: &'static str, id: Uuid },
    #[error("Unauthorized: {role:?} cannot {action}")] Unauthorized { role: UserRoleType, action: String },
    #[error("Validation error: {0}")] Validation(String),
    #[error("Conflict: {0}")] Conflict(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Page { pub offset: i64, pub limit: i64 }
impl Default for Page { fn default() -> Self { Self { offset: 0, limit: 50 } } }

/// Order item status in the kitchen flow
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ItemStatus { New, Processing, Dispatched, Paid }
impl ItemStatus {
    pub fn as_str(&self) -> &'static str {
        match self { Self::New => "new", Self::Processing => "processing",
                     Self::Dispatched => "dispatched", Self::Paid => "paid" }
    }
}

/// Payment method — manual confirmation only (no external APIs)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PaymentMethod { Cash, Mpesa, Card }
impl PaymentMethod {
    pub fn as_str(&self) -> &'static str {
        match self { Self::Cash => "cash", Self::Mpesa => "mpesa", Self::Card => "card" }
    }
}
