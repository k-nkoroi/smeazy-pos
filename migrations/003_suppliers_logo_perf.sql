-- SMEazy POS Migration 003 — Suppliers, business logo, PO-supplier link
PRAGMA foreign_keys=ON;

ALTER TABLE businesses ADD COLUMN logo_url TEXT;

CREATE TABLE IF NOT EXISTS suppliers (
  id           TEXT PRIMARY KEY,
  business_id  TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  contact_name TEXT,
  phone        TEXT,
  email        TEXT,
  address      TEXT,
  notes        TEXT,
  is_active    INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_suppliers_business ON suppliers(business_id);

ALTER TABLE requisitions ADD COLUMN supplier_id   TEXT REFERENCES suppliers(id);
ALTER TABLE requisitions ADD COLUMN supplier_name TEXT;
