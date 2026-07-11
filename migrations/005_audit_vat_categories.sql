-- Migration 005 — Audit trail, VAT config, editable categories
PRAGMA foreign_keys=ON;

-- ── AUDIT LOG ────────────────────────────────────────────────────────────────
-- Append-only industry-standard audit trail. Every state-changing action in the
-- system writes one row here. Visible only to admins/owners via the Logs view.
CREATE TABLE IF NOT EXISTS audit_logs (
  id           TEXT PRIMARY KEY,
  business_id  TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  actor_id     TEXT REFERENCES users(id),          -- who did it (NULL for system)
  actor_name   TEXT,                               -- denormalised for durable display
  actor_role   TEXT,                               -- primary role at time of action
  action       TEXT NOT NULL,                      -- e.g. 'sale.checkout', 'stock.spoil'
  entity_type  TEXT NOT NULL,                      -- e.g. 'order', 'inventory_item', 'staff'
  entity_id    TEXT,                               -- affected record id
  entity_label TEXT,                               -- human-readable name of the entity
  summary      TEXT NOT NULL,                      -- one-line description
  metadata     TEXT,                               -- JSON blob with structured details
  ip_address   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_business_time ON audit_logs(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);

-- ── VAT + BUSINESS SETTINGS ──────────────────────────────────────────────────
-- Key-value settings store per business (VAT rate, Daraja config later, etc.)
CREATE TABLE IF NOT EXISTS business_settings (
  business_id  TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  key          TEXT NOT NULL,
  value        TEXT,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (business_id, key)
);

-- Default VAT rate of 16% for every existing business (Kenya standard rate).
INSERT OR IGNORE INTO business_settings (business_id, key, value)
SELECT id, 'vat_rate', '16' FROM businesses;
INSERT OR IGNORE INTO business_settings (business_id, key, value)
SELECT id, 'vat_inclusive', 'true' FROM businesses;

-- ── ORDER VAT BREAKDOWN ──────────────────────────────────────────────────────
-- Store the VAT split so receipts can show net + VAT reliably after the fact.
ALTER TABLE pos_orders ADD COLUMN vat_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE pos_orders ADD COLUMN net_amount REAL NOT NULL DEFAULT 0;
-- Discount type for director's promotion / discount tracking on an order.
ALTER TABLE pos_orders ADD COLUMN discount_type TEXT;   -- NULL | 'directors_promo' | 'directors_discount' | 'manual'
ALTER TABLE pos_orders ADD COLUMN authorized_by TEXT;   -- user id who authorised a director rate

-- ── SPOILAGE ─────────────────────────────────────────────────────────────────
-- Movement types already supported in inventory_movements via movement_type text.
-- We just standardise the vocabulary: 'sale', 'spoil', 'restock', 'stocktake',
-- 'adjustment', 'directors_consumption'. No schema change needed.
