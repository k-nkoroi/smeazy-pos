//! Append-only audit trail writer, usable from any service crate.
//! Every state-changing action should call `audit(...)` so admins can review a
//! complete, industry-standard activity log.

use serde::Serialize;
use sqlx::SqlitePool;
use uuid::Uuid;

/// A single audit entry to record. Construct with the builder helpers.
#[derive(Debug, Clone)]
pub struct AuditEntry {
    pub business_id: String,
    pub actor_id: Option<String>,
    pub action: String,
    pub entity_type: String,
    pub entity_id: Option<String>,
    pub entity_label: Option<String>,
    pub summary: String,
    pub metadata: Option<String>,
}

impl AuditEntry {
    pub fn new(business_id: impl Into<String>, action: impl Into<String>, entity_type: impl Into<String>, summary: impl Into<String>) -> Self {
        Self {
            business_id: business_id.into(), actor_id: None,
            action: action.into(), entity_type: entity_type.into(),
            entity_id: None, entity_label: None, summary: summary.into(), metadata: None,
        }
    }
    pub fn actor(mut self, id: impl Into<String>) -> Self { self.actor_id = Some(id.into()); self }
    pub fn entity(mut self, id: impl Into<String>, label: impl Into<String>) -> Self {
        self.entity_id = Some(id.into()); self.entity_label = Some(label.into()); self
    }
    pub fn meta<T: Serialize>(mut self, value: &T) -> Self {
        self.metadata = serde_json::to_string(value).ok(); self
    }
}

/// Write an audit entry. Resolves the actor's display name + role at write time
/// so the log stays readable even if the user is later renamed or removed.
/// Never fails the caller — logging errors are swallowed (best-effort) after a warn.
pub async fn audit(db: &SqlitePool, entry: AuditEntry) {
    let (actor_name, actor_role): (Option<String>, Option<String>) = if let Some(ref aid) = entry.actor_id {
        let name = sqlx::query_scalar::<_, Option<String>>(
            "SELECT COALESCE(sr.full_name, u.username) FROM users u
             LEFT JOIN staff_records sr ON sr.user_id = u.id
             WHERE u.id=? LIMIT 1")
            .bind(aid).fetch_optional(db).await.ok().flatten().flatten();
        let role = sqlx::query_scalar::<_, String>(
            "SELECT role_type FROM staff_records WHERE user_id=? AND business_id=? LIMIT 1")
            .bind(aid).bind(&entry.business_id).fetch_optional(db).await.ok().flatten()
            .or(Some("owner".to_string()));
        (name, role)
    } else { (Some("System".to_string()), Some("system".to_string())) };

    let res = sqlx::query(
        "INSERT INTO audit_logs
         (id,business_id,actor_id,actor_name,actor_role,action,entity_type,entity_id,entity_label,summary,metadata)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)")
        .bind(Uuid::new_v4().to_string())
        .bind(&entry.business_id)
        .bind(&entry.actor_id)
        .bind(&actor_name)
        .bind(&actor_role)
        .bind(&entry.action)
        .bind(&entry.entity_type)
        .bind(&entry.entity_id)
        .bind(&entry.entity_label)
        .bind(&entry.summary)
        .bind(&entry.metadata)
        .execute(db).await;
    if let Err(e) = res {
        tracing::warn!(error = ?e, "audit log write failed");
    }
}
