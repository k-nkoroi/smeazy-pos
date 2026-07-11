use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use argon2::password_hash::SaltString;
use rand::rngs::OsRng;
use chrono::{Duration, Utc};
use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use uuid::Uuid;
use smeazy_common::ApiError;
use super::models::*;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String, pub tenant_id: String,
    pub business_id: Option<String>, pub role: String,
    pub exp: i64, pub iat: i64,
}

pub struct IamService { pub db: SqlitePool, pub jwt_secret: String }

const VALID_ROLES: [&str; 6] = [
    "admin_staff", "executive_staff", "operational_staff",
    "cashier", "storekeeper", "guest_contractor",
];

impl IamService {
    pub fn new(db: SqlitePool, jwt_secret: String) -> Self { Self { db, jwt_secret } }

    pub fn hash_password(pw: &str) -> Result<String, ApiError> {
        let salt = SaltString::generate(&mut OsRng);
        Argon2::default().hash_password(pw.as_bytes(), &salt)
            .map(|h| h.to_string())
            .map_err(|e| ApiError::internal(format!("Hash error: {e}")))
    }
    pub fn verify_password(pw: &str, hash: &str) -> Result<(), ApiError> {
        let parsed = PasswordHash::new(hash).map_err(|_| ApiError::unauthorized("Invalid credentials"))?;
        Argon2::default().verify_password(pw.as_bytes(), &parsed)
            .map_err(|_| ApiError::unauthorized("Invalid credentials"))
    }
    pub fn issue_jwt(&self, user_id: &str, tenant_id: &str, business_id: Option<&str>, role: &str) -> Result<String, ApiError> {
        let now = Utc::now();
        let claims = Claims { sub: user_id.to_string(), tenant_id: tenant_id.to_string(),
            business_id: business_id.map(|s| s.to_string()), role: role.to_string(),
            iat: now.timestamp(), exp: (now + Duration::hours(24)).timestamp() };
        encode(&Header::new(Algorithm::HS256), &claims, &EncodingKey::from_secret(self.jwt_secret.as_bytes()))
            .map_err(|e| ApiError::internal(format!("JWT error: {e}")))
    }
    pub fn generate_pin() -> String {
        use rand::Rng;
        format!("{:04}", rand::thread_rng().gen_range(1000..9999))
    }

    /// Fetch all role_types a staff user holds in a business (ordered by seniority).
    async fn roles_for(&self, user_id: &str, business_id: &str) -> Result<Vec<String>, ApiError> {
        let rows = sqlx::query_scalar::<_, String>(
            "SELECT role_type FROM staff_roles WHERE staff_user_id=? AND business_id=?")
            .bind(user_id).bind(business_id).fetch_all(&self.db).await.map_err(ApiError::from)?;
        Ok(Self::order_roles(rows))
    }

    /// Order roles by seniority so the first element is the "primary" role.
    fn order_roles(mut roles: Vec<String>) -> Vec<String> {
        let rank = |r: &str| match r {
            "admin_staff" => 0, "executive_staff" => 1, "cashier" => 2,
            "storekeeper" => 3, "operational_staff" => 4, "guest_contractor" => 5, _ => 9,
        };
        roles.sort_by_key(|r| rank(r));
        roles.dedup();
        roles
    }

    pub async fn register(&self, req: RegisterRequest) -> Result<AuthResponse, ApiError> {
        if req.username.trim().len() < 3 { return Err(ApiError::bad_request("Username must be at least 3 characters")); }
        if req.password.len() < 8 { return Err(ApiError::bad_request("Password must be at least 8 characters")); }
        if req.business_name.trim().is_empty() { return Err(ApiError::bad_request("Business name is required")); }

        let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM users WHERE email=?)")
            .bind(&req.email).fetch_one(&self.db).await.map_err(ApiError::from)?;
        if exists { return Err(ApiError::conflict("Email already registered")); }

        let password_hash = Self::hash_password(&req.password)?;
        let user_id   = Uuid::new_v4().to_string();
        let tenant_id = Uuid::new_v4().to_string();
        let biz_id    = Uuid::new_v4().to_string();
        let slug = format!("{}-{}", req.username.to_lowercase().replace(' ', "-"), &user_id[..8]);

        sqlx::query("INSERT INTO users (id,username,email,password_hash,sys_admin,business_staff) VALUES (?,?,?,?,0,1)")
            .bind(&user_id).bind(&req.username).bind(&req.email).bind(&password_hash)
            .execute(&self.db).await.map_err(ApiError::from)?;
        sqlx::query("INSERT INTO tenants (id,slug,name,plan_tier,is_active) VALUES (?,?,?,'free',1)")
            .bind(&tenant_id).bind(&slug).bind(format!("{} Workspace", req.business_name))
            .execute(&self.db).await.map_err(ApiError::from)?;
        sqlx::query("INSERT INTO user_roles (id,user_id,tenant_id,role_type,scope) VALUES (?,?,?,'entrepreneur','{}')")
            .bind(Uuid::new_v4().to_string()).bind(&user_id).bind(&tenant_id)
            .execute(&self.db).await.map_err(ApiError::from)?;
        sqlx::query("INSERT INTO businesses (id,tenant_id,primary_user_id,name,registration_no,industry_package,is_archived,logo_url) VALUES (?,?,?,?,?,'hospitality',0,?)")
            .bind(&biz_id).bind(&tenant_id).bind(&user_id).bind(&req.business_name)
            .bind(&req.registration_no).bind(&req.logo_url)
            .execute(&self.db).await.map_err(ApiError::from)?;

        // Seed default business settings (Kenya standard VAT, prices inclusive).
        for (k, v) in [("vat_rate", "16"), ("vat_inclusive", "true"), ("daraja_enabled", "false")] {
            let _ = sqlx::query("INSERT OR IGNORE INTO business_settings (business_id,key,value) VALUES (?,?,?)")
                .bind(&biz_id).bind(k).bind(v).execute(&self.db).await;
        }

        let token = self.issue_jwt(&user_id, &tenant_id, Some(&biz_id), "entrepreneur")?;
        Ok(AuthResponse {
            token, onboarding_complete: true,
            user: UserPublic { id: user_id, username: req.username.clone(), email: req.email, role: "entrepreneur".into(), roles: vec!["entrepreneur".into()], display_name: None },
            tenant: TenantPublic { id: tenant_id, slug, name: format!("{} Workspace", req.business_name), plan_tier: "free".into() },
            business: Some(BusinessPublic { id: biz_id, name: req.business_name, industry_package: "hospitality".into(), logo_url: req.logo_url }),
        })
    }

    pub async fn login(&self, req: LoginRequest) -> Result<AuthResponse, ApiError> {
        let row = sqlx::query_as::<_, UserRow>("SELECT * FROM users WHERE email=?")
            .bind(&req.email).fetch_optional(&self.db).await.map_err(ApiError::from)?
            .ok_or_else(|| ApiError::unauthorized("Invalid credentials"))?;
        Self::verify_password(&req.password, &row.password_hash)?;

        let role_row = sqlx::query_as::<_, (String, String)>(
            "SELECT role_type, tenant_id FROM user_roles WHERE user_id=? AND revoked_at IS NULL ORDER BY granted_at DESC LIMIT 1")
            .bind(&row.id).fetch_optional(&self.db).await.map_err(ApiError::from)?;
        let (primary_role, tenant_id) = role_row.unwrap_or_else(|| ("customer".into(), Uuid::new_v4().to_string()));

        let tenant = sqlx::query_as::<_, TenantRow>("SELECT * FROM tenants WHERE id=?")
            .bind(&tenant_id).fetch_one(&self.db).await.map_err(ApiError::from)?;

        let business = sqlx::query_as::<_, BusinessRow>(
            "SELECT DISTINCT b.id, b.tenant_id, b.primary_user_id, b.name, b.industry_package, b.logo_url
             FROM businesses b
             LEFT JOIN staff_records sr ON sr.business_id = b.id AND sr.user_id = ?
             WHERE (b.primary_user_id=? OR sr.user_id=?) AND b.is_archived=0
             LIMIT 1")
            .bind(&row.id).bind(&row.id).bind(&row.id)
            .fetch_optional(&self.db).await.map_err(ApiError::from)?
            .map(|b| BusinessPublic { id: b.id, name: b.name, industry_package: b.industry_package, logo_url: b.logo_url });

        let biz_id = business.as_ref().map(|b| b.id.clone());

        // Assemble full role set: entrepreneur (owner) OR staff_roles.
        let roles = if primary_role == "entrepreneur" {
            vec!["entrepreneur".to_string()]
        } else if let Some(ref bid) = biz_id {
            let mut r = self.roles_for(&row.id, bid).await?;
            if r.is_empty() { r.push(primary_role.clone()); }
            r
        } else { vec![primary_role.clone()] };
        let effective_primary = roles.first().cloned().unwrap_or(primary_role);

        let token = self.issue_jwt(&row.id, &tenant_id, biz_id.as_deref(), &effective_primary)?;
        Ok(AuthResponse {
            token, onboarding_complete: true,
            user: UserPublic { id: row.id, username: row.username.clone(), email: row.email, role: effective_primary, roles, display_name: row.display_name },
            tenant: TenantPublic { id: tenant.id, slug: tenant.slug, name: tenant.name, plan_tier: tenant.plan_tier },
            business,
        })
    }

    /// POS PIN login — matches a staff member's pos_pin, returns a POS-scoped session.
    pub async fn pin_login(&self, business_id: &str, pin: &str) -> Result<AuthResponse, ApiError> {
        if pin.trim().len() != 4 { return Err(ApiError::bad_request("PIN must be 4 digits")); }
        let staff = sqlx::query_as::<_, StaffRow>(
            "SELECT u.id as user_id, u.username, u.email, sr.full_name, sr.phone,
             sr.role_type, sr.department, sr.pos_pin, sr.is_active, sr.hire_date
             FROM staff_records sr JOIN users u ON u.id = sr.user_id
             WHERE sr.business_id=? AND sr.pos_pin=? AND sr.is_active=1 LIMIT 1")
            .bind(business_id).bind(pin).fetch_optional(&self.db).await.map_err(ApiError::from)?
            .ok_or_else(|| ApiError::unauthorized("Invalid PIN"))?;

        let biz = sqlx::query_as::<_, BusinessRow>(
            "SELECT id, tenant_id, primary_user_id, name, industry_package, logo_url FROM businesses WHERE id=?")
            .bind(business_id).fetch_one(&self.db).await.map_err(ApiError::from)?;

        let mut roles = self.roles_for(&staff.user_id, business_id).await?;
        if roles.is_empty() { roles.push(staff.role_type.clone()); }
        let primary = roles.first().cloned().unwrap_or_else(|| "operational_staff".into());

        let token = self.issue_jwt(&staff.user_id, &biz.tenant_id, Some(business_id), &primary)?;
        let tenant = sqlx::query_as::<_, TenantRow>("SELECT * FROM tenants WHERE id=?")
            .bind(&biz.tenant_id).fetch_one(&self.db).await.map_err(ApiError::from)?;
        Ok(AuthResponse {
            token, onboarding_complete: true,
            user: UserPublic { id: staff.user_id, username: staff.username.clone(), email: staff.email,
                role: primary, roles, display_name: staff.full_name.or(Some(staff.username)) },
            tenant: TenantPublic { id: tenant.id, slug: tenant.slug, name: tenant.name, plan_tier: tenant.plan_tier },
            business: Some(BusinessPublic { id: biz.id, name: biz.name, industry_package: biz.industry_package, logo_url: biz.logo_url }),
        })
    }

    /// Verify a PIN belongs to an active staff member of the business (for unlock).
    pub async fn verify_pin(&self, business_id: &str, pin: &str) -> Result<bool, ApiError> {
        let ok: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM staff_records WHERE business_id=? AND pos_pin=? AND is_active=1)")
            .bind(business_id).bind(pin).fetch_one(&self.db).await.map_err(ApiError::from)?;
        Ok(ok)
    }

    pub async fn update_business(&self, business_id: &str, req: UpdateBusinessRequest) -> Result<BusinessPublic, ApiError> {
        sqlx::query("UPDATE businesses SET name=COALESCE(?,name), logo_url=COALESCE(?,logo_url), updated_at=datetime('now') WHERE id=?")
            .bind(&req.name).bind(&req.logo_url).bind(business_id)
            .execute(&self.db).await.map_err(ApiError::from)?;
        let b = sqlx::query_as::<_, BusinessRow>(
            "SELECT id, tenant_id, primary_user_id, name, industry_package, logo_url FROM businesses WHERE id=?")
            .bind(business_id).fetch_one(&self.db).await.map_err(ApiError::from)?;
        Ok(BusinessPublic { id: b.id, name: b.name, industry_package: b.industry_package, logo_url: b.logo_url })
    }

    // ── Staff management (multi-role) ─────────────────────────────────────────
    pub async fn create_staff(&self, business_id: &str, tenant_id: &str, req: CreateStaffRequest) -> Result<StaffMemberPublic, ApiError> {
        let roles = Self::order_roles(req.roles.clone());
        if roles.is_empty() { return Err(ApiError::bad_request("At least one role is required")); }
        for r in &roles {
            if !VALID_ROLES.contains(&r.as_str()) {
                return Err(ApiError::bad_request(format!("Invalid role '{}'. Valid: {}", r, VALID_ROLES.join(", "))));
            }
        }
        let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM users WHERE email=? OR username=?)")
            .bind(&req.email).bind(&req.username).fetch_one(&self.db).await.map_err(ApiError::from)?;
        if exists { return Err(ApiError::conflict("Username or email already taken")); }

        let password_hash = Self::hash_password(&req.password)?;
        let user_id = Uuid::new_v4().to_string();
        // PIN needed if any POS-facing role present.
        let pos_facing = roles.iter().any(|r| matches!(r.as_str(), "operational_staff" | "cashier"));
        let pin = if pos_facing { Some(req.pos_pin.clone().unwrap_or_else(Self::generate_pin)) } else { req.pos_pin.clone() };
        let primary = roles.first().cloned().unwrap();

        sqlx::query("INSERT INTO users (id,username,email,password_hash,sys_admin,business_staff) VALUES (?,?,?,?,0,1)")
            .bind(&user_id).bind(&req.username).bind(&req.email).bind(&password_hash)
            .execute(&self.db).await.map_err(ApiError::from)?;
        sqlx::query("INSERT INTO user_roles (id,user_id,tenant_id,role_type,scope) VALUES (?,?,?,?,'{}')")
            .bind(Uuid::new_v4().to_string()).bind(&user_id).bind(tenant_id).bind(&primary)
            .execute(&self.db).await.map_err(ApiError::from)?;

        let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
        sqlx::query("INSERT INTO staff_records (id,user_id,business_id,department,employment_type,hire_date,role_type,pos_pin,full_name,phone,is_active) VALUES (?,?,?,?,?,?,?,?,?,?,1)")
            .bind(Uuid::new_v4().to_string()).bind(&user_id).bind(business_id)
            .bind(&req.department).bind(req.employment_type.as_deref().unwrap_or("permanent"))
            .bind(&today).bind(&primary).bind(&pin).bind(&req.full_name).bind(&req.phone)
            .execute(&self.db).await.map_err(ApiError::from)?;

        // Insert all roles into staff_roles
        for r in &roles {
            sqlx::query("INSERT OR IGNORE INTO staff_roles (id,staff_user_id,business_id,role_type) VALUES (?,?,?,?)")
                .bind(Uuid::new_v4().to_string()).bind(&user_id).bind(business_id).bind(r)
                .execute(&self.db).await.map_err(ApiError::from)?;
        }

        Ok(StaffMemberPublic {
            user_id, username: req.username, email: req.email,
            full_name: req.full_name, phone: req.phone, roles: roles.clone(), role_type: primary,
            department: req.department, pos_pin: pin, is_active: true, hire_date: today,
        })
    }

    pub async fn list_staff(&self, business_id: &str) -> Result<Vec<StaffMemberPublic>, ApiError> {
        let rows = sqlx::query_as::<_, StaffRow>(
            "SELECT u.id as user_id, u.username, u.email, sr.full_name, sr.phone,
             sr.role_type, sr.department, sr.pos_pin, sr.is_active, sr.hire_date
             FROM staff_records sr JOIN users u ON u.id = sr.user_id
             WHERE sr.business_id=? ORDER BY sr.role_type, u.username")
            .bind(business_id).fetch_all(&self.db).await.map_err(ApiError::from)?;
        let mut out = Vec::new();
        for r in rows {
            let mut roles = self.roles_for(&r.user_id, business_id).await?;
            if roles.is_empty() { roles.push(r.role_type.clone()); }
            let primary = roles.first().cloned().unwrap_or(r.role_type.clone());
            out.push(StaffMemberPublic {
                user_id: r.user_id, username: r.username, email: r.email,
                full_name: r.full_name, phone: r.phone, roles, role_type: primary,
                department: r.department, pos_pin: r.pos_pin, is_active: r.is_active != 0, hire_date: r.hire_date,
            });
        }
        Ok(out)
    }

    pub async fn update_staff(&self, user_id: &str, business_id: &str, req: UpdateStaffRequest) -> Result<StaffMemberPublic, ApiError> {
        if let Some(ref pass) = req.password {
            let hash = Self::hash_password(pass)?;
            sqlx::query("UPDATE users SET password_hash=? WHERE id=?")
                .bind(&hash).bind(user_id).execute(&self.db).await.map_err(ApiError::from)?;
        }
        // Role replacement
        if let Some(ref new_roles) = req.roles {
            let roles = Self::order_roles(new_roles.clone());
            if roles.is_empty() { return Err(ApiError::bad_request("At least one role is required")); }
            for r in &roles {
                if !VALID_ROLES.contains(&r.as_str()) {
                    return Err(ApiError::bad_request(format!("Invalid role '{}'", r)));
                }
            }
            sqlx::query("DELETE FROM staff_roles WHERE staff_user_id=? AND business_id=?")
                .bind(user_id).bind(business_id).execute(&self.db).await.map_err(ApiError::from)?;
            for r in &roles {
                sqlx::query("INSERT OR IGNORE INTO staff_roles (id,staff_user_id,business_id,role_type) VALUES (?,?,?,?)")
                    .bind(Uuid::new_v4().to_string()).bind(user_id).bind(business_id).bind(r)
                    .execute(&self.db).await.map_err(ApiError::from)?;
            }
            let primary = roles.first().cloned().unwrap();
            // Ensure a PIN exists if now POS-facing
            let pos_facing = roles.iter().any(|r| matches!(r.as_str(), "operational_staff" | "cashier"));
            if pos_facing {
                let has_pin: Option<String> = sqlx::query_scalar("SELECT pos_pin FROM staff_records WHERE user_id=? AND business_id=?")
                    .bind(user_id).bind(business_id).fetch_optional(&self.db).await.map_err(ApiError::from)?.flatten();
                if has_pin.is_none() {
                    let pin = Self::generate_pin();
                    sqlx::query("UPDATE staff_records SET pos_pin=? WHERE user_id=? AND business_id=?")
                        .bind(&pin).bind(user_id).bind(business_id).execute(&self.db).await.map_err(ApiError::from)?;
                }
            }
            sqlx::query("UPDATE staff_records SET role_type=? WHERE user_id=? AND business_id=?")
                .bind(&primary).bind(user_id).bind(business_id).execute(&self.db).await.map_err(ApiError::from)?;
        }
        sqlx::query("UPDATE staff_records SET full_name=COALESCE(?,full_name), phone=COALESCE(?,phone), department=COALESCE(?,department), is_active=COALESCE(?,is_active) WHERE user_id=? AND business_id=?")
            .bind(&req.full_name).bind(&req.phone).bind(&req.department)
            .bind(req.is_active.map(|b| if b { 1i64 } else { 0i64 }))
            .bind(user_id).bind(business_id)
            .execute(&self.db).await.map_err(ApiError::from)?;
        self.list_staff(business_id).await?.into_iter().find(|s| s.user_id == user_id)
            .ok_or_else(|| ApiError::not_found("Staff member not found"))
    }

    pub async fn reset_pin(&self, user_id: &str, business_id: &str) -> Result<String, ApiError> {
        let pin = Self::generate_pin();
        sqlx::query("UPDATE staff_records SET pos_pin=? WHERE user_id=? AND business_id=?")
            .bind(&pin).bind(user_id).bind(business_id)
            .execute(&self.db).await.map_err(ApiError::from)?;
        Ok(pin)
    }

    pub async fn get_profile(&self, user_id: &str) -> Result<UserProfile, ApiError> {
        let user = sqlx::query_as::<_, UserRow>("SELECT * FROM users WHERE id=?")
            .bind(user_id).fetch_one(&self.db).await.map_err(ApiError::from)?;
        let profile = sqlx::query_as::<_, (Option<String>, Option<String>, Option<String>, Option<String>)>(
            "SELECT full_name, phone, avatar_url, bio FROM user_profiles WHERE user_id=?")
            .bind(user_id).fetch_optional(&self.db).await.map_err(ApiError::from)?;
        Ok(UserProfile {
            user_id: user.id, username: user.username, email: user.email,
            full_name: profile.as_ref().and_then(|p| p.0.clone()),
            phone: profile.as_ref().and_then(|p| p.1.clone()),
            avatar_url: profile.as_ref().and_then(|p| p.2.clone()),
            bio: profile.as_ref().and_then(|p| p.3.clone()),
        })
    }

    pub async fn update_profile(&self, user_id: &str, req: UpdateProfileRequest) -> Result<UserProfile, ApiError> {
        sqlx::query("INSERT INTO user_profiles (user_id,full_name,phone,avatar_url,bio,updated_at) VALUES (?,?,?,?,?,datetime('now')) ON CONFLICT(user_id) DO UPDATE SET full_name=COALESCE(excluded.full_name,full_name), phone=COALESCE(excluded.phone,phone), avatar_url=COALESCE(excluded.avatar_url,avatar_url), bio=COALESCE(excluded.bio,bio), updated_at=datetime('now')")
            .bind(user_id).bind(&req.full_name).bind(&req.phone).bind(&req.avatar_url).bind(&req.bio)
            .execute(&self.db).await.map_err(ApiError::from)?;
        if let Some(ref uname) = req.username {
            sqlx::query("UPDATE users SET username=? WHERE id=?")
                .bind(uname).bind(user_id).execute(&self.db).await.map_err(ApiError::from)?;
        }
        self.get_profile(user_id).await
    }

    /// Staff usable as waitstaff on the POS (operational_staff or cashier roles).
    pub async fn list_staff_for_pos(&self, business_id: &str) -> Result<Vec<UserPublic>, ApiError> {
        let rows = sqlx::query_as::<_, StaffRow>(
            "SELECT u.id as user_id, u.username, u.email, sr.full_name, sr.phone,
             sr.role_type, sr.department, sr.pos_pin, sr.is_active, sr.hire_date
             FROM staff_records sr JOIN users u ON u.id = sr.user_id
             WHERE sr.business_id=? AND sr.is_active=1 ORDER BY u.username")
            .bind(business_id).fetch_all(&self.db).await.map_err(ApiError::from)?;
        let mut out = Vec::new();
        for r in rows {
            let mut roles = self.roles_for(&r.user_id, business_id).await?;
            if roles.is_empty() { roles.push(r.role_type.clone()); }
            out.push(UserPublic {
                id: r.user_id, username: r.username.clone(), email: r.email,
                role: roles.first().cloned().unwrap_or(r.role_type.clone()),
                roles, display_name: r.full_name.or(Some(r.username)),
            });
        }
        Ok(out)
    }

    // ── Registers ─────────────────────────────────────────────────────────────
    async fn register_departments(&self, register_id: &str) -> Result<Vec<String>, ApiError> {
        sqlx::query_scalar::<_, String>("SELECT department FROM register_categories WHERE register_id=? ORDER BY department")
            .bind(register_id).fetch_all(&self.db).await.map_err(ApiError::from)
    }

    pub async fn list_registers(&self, business_id: &str) -> Result<Vec<RegisterPublic>, ApiError> {
        let rows = sqlx::query_as::<_, RegisterRow>(
            "SELECT * FROM registers WHERE business_id=? AND is_active=1 ORDER BY name")
            .bind(business_id).fetch_all(&self.db).await.map_err(ApiError::from)?;
        let mut out = Vec::new();
        for r in rows {
            let departments = self.register_departments(&r.id).await?;
            out.push(RegisterPublic { id: r.id, name: r.name, description: r.description, is_active: r.is_active != 0, departments });
        }
        Ok(out)
    }

    pub async fn create_register(&self, business_id: &str, req: CreateRegisterRequest) -> Result<RegisterPublic, ApiError> {
        if req.name.trim().is_empty() { return Err(ApiError::bad_request("Register name required")); }
        let id = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO registers (id,business_id,name,description,is_active) VALUES (?,?,?,?,1)")
            .bind(&id).bind(business_id).bind(&req.name).bind(&req.description)
            .execute(&self.db).await.map_err(ApiError::from)?;
        for dept in &req.departments {
            sqlx::query("INSERT OR IGNORE INTO register_categories (id,register_id,department) VALUES (?,?,?)")
                .bind(Uuid::new_v4().to_string()).bind(&id).bind(dept)
                .execute(&self.db).await.map_err(ApiError::from)?;
        }
        let departments = self.register_departments(&id).await?;
        Ok(RegisterPublic { id, name: req.name, description: req.description, is_active: true, departments })
    }

    pub async fn update_register(&self, id: &str, business_id: &str, req: UpdateRegisterRequest) -> Result<RegisterPublic, ApiError> {
        sqlx::query("UPDATE registers SET name=COALESCE(?,name), description=COALESCE(?,description), is_active=COALESCE(?,is_active) WHERE id=? AND business_id=?")
            .bind(&req.name).bind(&req.description)
            .bind(req.is_active.map(|b| if b {1i64} else {0i64}))
            .bind(id).bind(business_id).execute(&self.db).await.map_err(ApiError::from)?;
        if let Some(ref depts) = req.departments {
            sqlx::query("DELETE FROM register_categories WHERE register_id=?")
                .bind(id).execute(&self.db).await.map_err(ApiError::from)?;
            for dept in depts {
                sqlx::query("INSERT OR IGNORE INTO register_categories (id,register_id,department) VALUES (?,?,?)")
                    .bind(Uuid::new_v4().to_string()).bind(id).bind(dept)
                    .execute(&self.db).await.map_err(ApiError::from)?;
            }
        }
        let r = sqlx::query_as::<_, RegisterRow>("SELECT * FROM registers WHERE id=?")
            .bind(id).fetch_one(&self.db).await.map_err(ApiError::from)?;
        let departments = self.register_departments(id).await?;
        Ok(RegisterPublic { id: r.id, name: r.name, description: r.description, is_active: r.is_active != 0, departments })
    }
}

impl IamService {
    // ── Audit logs (admin-only) ───────────────────────────────────────────────
    pub async fn list_audit_logs(&self, business_id: &str, action_filter: Option<&str>, entity_filter: Option<&str>, actor_filter: Option<&str>, limit: i64, offset: i64) -> Result<Vec<AuditLogRow>, ApiError> {
        let lim = limit.clamp(1, 500);
        let action_like = action_filter.map(|a| format!("{}%", a));
        let rows = sqlx::query_as::<_, AuditLogRow>(
            "SELECT id, actor_id, actor_name, actor_role, action, entity_type, entity_id, entity_label, summary, metadata, created_at
             FROM audit_logs
             WHERE business_id = ?
               AND (? IS NULL OR action LIKE ?)
               AND (? IS NULL OR entity_type = ?)
               AND (? IS NULL OR actor_id = ?)
             ORDER BY created_at DESC
             LIMIT ? OFFSET ?")
            .bind(business_id)
            .bind(&action_like).bind(&action_like)
            .bind(entity_filter).bind(entity_filter)
            .bind(actor_filter).bind(actor_filter)
            .bind(lim).bind(offset.max(0))
            .fetch_all(&self.db).await.map_err(ApiError::from)?;
        Ok(rows)
    }

    pub async fn count_audit_logs(&self, business_id: &str) -> Result<i64, ApiError> {
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM audit_logs WHERE business_id=?")
            .bind(business_id).fetch_one(&self.db).await.map_err(ApiError::from)
    }

    /// Distinct action + entity types for the Logs view filter dropdowns.
    pub async fn audit_facets(&self, business_id: &str) -> Result<(Vec<String>, Vec<String>), ApiError> {
        let actions = sqlx::query_scalar::<_, String>("SELECT DISTINCT action FROM audit_logs WHERE business_id=? ORDER BY action")
            .bind(business_id).fetch_all(&self.db).await.map_err(ApiError::from)?;
        let entities = sqlx::query_scalar::<_, String>("SELECT DISTINCT entity_type FROM audit_logs WHERE business_id=? ORDER BY entity_type")
            .bind(business_id).fetch_all(&self.db).await.map_err(ApiError::from)?;
        Ok((actions, entities))
    }

    // ── Business settings (VAT, later Daraja) ─────────────────────────────────
    pub async fn get_settings(&self, business_id: &str) -> Result<std::collections::HashMap<String, String>, ApiError> {
        let rows = sqlx::query_as::<_, (String, Option<String>)>(
            "SELECT key, value FROM business_settings WHERE business_id=?")
            .bind(business_id).fetch_all(&self.db).await.map_err(ApiError::from)?;
        Ok(rows.into_iter().map(|(k, v)| (k, v.unwrap_or_default())).collect())
    }

    pub async fn set_setting(&self, business_id: &str, key: &str, value: &str) -> Result<(), ApiError> {
        sqlx::query("INSERT INTO business_settings (business_id,key,value,updated_at) VALUES (?,?,?,datetime('now'))
                     ON CONFLICT(business_id,key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')")
            .bind(business_id).bind(key).bind(value)
            .execute(&self.db).await.map_err(ApiError::from)?;
        Ok(())
    }

    /// Non-secret payment config for the POS checkout screen — safe for any staff.
    /// Returns whether Daraja STK push is enabled and the VAT rate; never exposes keys.
    pub async fn payment_config(&self, business_id: &str) -> Result<serde_json::Value, ApiError> {
        let settings = self.get_settings(business_id).await?;
        Ok(serde_json::json!({
            "daraja_enabled": settings.get("daraja_enabled").map(|v| v == "true").unwrap_or(false),
            "daraja_shortcode": settings.get("daraja_shortcode").cloned().unwrap_or_default(),
            "vat_rate": settings.get("vat_rate").and_then(|v| v.parse::<f64>().ok()).unwrap_or(16.0),
            "vat_inclusive": settings.get("vat_inclusive").map(|v| v == "true").unwrap_or(true),
        }))
    }
}
