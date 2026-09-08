use serde::{Deserialize, Serialize};

#[derive(Debug, sqlx::FromRow)]
pub struct UserRow {
    pub id: String, pub username: String, pub email: String,
    pub password_hash: String, pub display_name: Option<String>,
    pub sys_admin: i64, pub business_staff: i64,
}

#[derive(Debug, sqlx::FromRow)]
pub struct TenantRow { pub id: String, pub slug: String, pub name: String, pub plan_tier: String }

#[derive(Debug, sqlx::FromRow)]
pub struct BusinessRow {
    pub id: String, pub tenant_id: String, pub primary_user_id: String,
    pub name: String, pub industry_package: String, pub logo_url: Option<String>,
}

#[derive(Debug, sqlx::FromRow)]
pub struct StaffRow {
    pub user_id: String, pub username: String, pub email: String,
    pub full_name: Option<String>, pub phone: Option<String>,
    pub role_type: String, pub department: Option<String>,
    pub pos_pin: Option<String>, pub is_active: i64, pub hire_date: String,
}

/// SMEazy POS — enterprise-only registration (hospitality)
#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub username: String, pub email: String, pub password: String,
    pub business_name: String,
    pub registration_no: Option<String>,
    pub logo_url: Option<String>,
    pub account_type: Option<String>,
    pub industry_package: Option<String>,
    pub activate_solopreneur: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest { pub email: String, pub password: String }

/// POS PIN login — waitstaff/cashier sign in with just their 4-digit PIN
#[derive(Debug, Deserialize)]
pub struct PinLoginRequest { pub pin: String }

#[derive(Debug, Deserialize)]
pub struct CreateStaffRequest {
    pub username: String, pub email: String, pub password: String,
    pub full_name: Option<String>, pub phone: Option<String>,
    /// One or more roles held simultaneously.
    pub roles: Vec<String>,
    pub department: Option<String>, pub employment_type: Option<String>,
    pub pos_pin: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateStaffRequest {
    pub full_name: Option<String>, pub phone: Option<String>,
    pub department: Option<String>,
    /// If present, replaces the full set of roles.
    pub roles: Option<Vec<String>>,
    pub is_active: Option<bool>, pub password: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateProfileRequest {
    pub username: Option<String>, pub full_name: Option<String>,
    pub phone: Option<String>, pub avatar_url: Option<String>, pub bio: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateBusinessRequest {
    pub name: Option<String>, pub logo_url: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct StaffMemberPublic {
    pub user_id: String, pub username: String, pub email: String,
    pub full_name: Option<String>, pub phone: Option<String>,
    /// All roles this member holds.
    pub roles: Vec<String>,
    /// Primary role (first of roles) — kept for compatibility with older callers.
    pub role_type: String,
    pub department: Option<String>,
    pub pos_pin: Option<String>,
    pub is_active: bool, pub hire_date: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct UserProfile {
    pub user_id: String, pub username: String, pub email: String,
    pub full_name: Option<String>, pub phone: Option<String>,
    pub avatar_url: Option<String>, pub bio: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct AuthResponse {
    pub token: String, pub user: UserPublic,
    pub tenant: TenantPublic, pub business: Option<BusinessPublic>,
    pub onboarding_complete: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserPublic {
    pub id: String, pub username: String, pub email: String,
    /// Primary role.
    pub role: String,
    /// All roles this user holds (for permission gating in the UI).
    pub roles: Vec<String>,
    pub display_name: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct TenantPublic { pub id: String, pub slug: String, pub name: String, pub plan_tier: String }

#[derive(Debug, Serialize, Clone)]
pub struct BusinessPublic { pub id: String, pub name: String, pub industry_package: String, pub logo_url: Option<String> }

// ── Registers ─────────────────────────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct RegisterRow {
    pub id: String, pub business_id: String, pub name: String,
    pub description: Option<String>, pub is_active: i64, pub created_at: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct RegisterPublic {
    pub id: String, pub name: String, pub description: Option<String>,
    pub is_active: bool, pub departments: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateRegisterRequest {
    pub name: String, pub description: Option<String>,
    /// Departments this register may sell from: Kitchen, Bar, Accommodation, Pool, Games, Toys
    pub departments: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateRegisterRequest {
    pub name: Option<String>, pub description: Option<String>,
    pub departments: Option<Vec<String>>, pub is_active: Option<bool>,
}

// ── Audit log (admin Logs view) ──────────────────────────────────────────────
#[derive(Debug, Serialize, Clone, sqlx::FromRow)]
pub struct AuditLogRow {
    pub id: String, pub actor_id: Option<String>,
    pub actor_name: Option<String>, pub actor_role: Option<String>,
    pub action: String, pub entity_type: String,
    pub entity_id: Option<String>, pub entity_label: Option<String>,
    pub summary: String, pub metadata: Option<String>,
    pub created_at: String,
}

// ── Receipt templates (customizable receipt / Order Note printing) ──────────
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct ReceiptTemplate {
    pub id: String, pub business_id: String, pub name: String,
    /// 'receipt' | 'order_note'
    pub template_type: String,
    pub is_default: i64,
    /// 'mono' | 'sans' | 'serif'
    pub font_family: String,
    /// 'normal' | 'medium' | 'bold'
    pub font_weight: String,
    /// 'xs' | 'sm' | 'base'
    pub font_size: String,
    pub header_text: Option<String>,
    pub footer_text: Option<String>,
    pub show_logo: i64,
    pub show_vat_note: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateReceiptTemplateReq {
    pub name: String,
    pub template_type: String,
    pub font_family: Option<String>,
    pub font_weight: Option<String>,
    pub font_size: Option<String>,
    pub header_text: Option<String>,
    pub footer_text: Option<String>,
    pub show_logo: Option<bool>,
    pub show_vat_note: Option<bool>,
    pub is_default: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateReceiptTemplateReq {
    pub name: Option<String>,
    pub font_family: Option<String>,
    pub font_weight: Option<String>,
    pub font_size: Option<String>,
    pub header_text: Option<String>,
    pub footer_text: Option<String>,
    pub show_logo: Option<bool>,
    pub show_vat_note: Option<bool>,
    pub is_default: Option<bool>,
}
