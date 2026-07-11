-- SMEazy V2 Migration 002 — Staff management, Stock takes, Requisitions

PRAGMA foreign_keys=ON;

-- ── STAFF PIN AUTH ──────────────────────────────────────────────────────────
-- Extend staff_records with PIN and role_type
ALTER TABLE staff_records ADD COLUMN role_type TEXT NOT NULL DEFAULT 'operational_staff';
ALTER TABLE staff_records ADD COLUMN pos_pin   TEXT;
ALTER TABLE staff_records ADD COLUMN full_name TEXT;
ALTER TABLE staff_records ADD COLUMN phone     TEXT;
ALTER TABLE staff_records ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;

-- ── USER PROFILE ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name    TEXT,
  phone        TEXT,
  avatar_url   TEXT,
  bio          TEXT,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── STOCK TAKES ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_takes (
  id           TEXT PRIMARY KEY,
  business_id  TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  performed_by TEXT NOT NULL REFERENCES users(id),
  performer_name TEXT,
  status       TEXT NOT NULL DEFAULT 'draft',  -- draft | completed
  notes        TEXT,
  started_at   TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_stocktake_business ON stock_takes(business_id, started_at);

CREATE TABLE IF NOT EXISTS stock_take_lines (
  id              TEXT PRIMARY KEY,
  stock_take_id   TEXT NOT NULL REFERENCES stock_takes(id) ON DELETE CASCADE,
  item_id         TEXT NOT NULL REFERENCES inventory_items(id),
  item_name       TEXT NOT NULL,
  item_sku        TEXT NOT NULL,
  category_name   TEXT,
  expected_qty    REAL NOT NULL DEFAULT 0,
  counted_qty     REAL,
  variance        REAL,
  unit_of_measure TEXT NOT NULL DEFAULT 'unit',
  reorder_level   REAL NOT NULL DEFAULT 5,
  sale_price      REAL
);
CREATE INDEX IF NOT EXISTS idx_stocktake_lines ON stock_take_lines(stock_take_id);

-- ── PURCHASE REQUISITIONS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS requisitions (
  id              TEXT PRIMARY KEY,
  business_id     TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  ref_number      TEXT NOT NULL,
  raised_by       TEXT NOT NULL REFERENCES users(id),
  raiser_name     TEXT,
  status          TEXT NOT NULL DEFAULT 'draft', -- draft | submitted | partially_received | received | cancelled
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at    TEXT,
  received_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_req_business ON requisitions(business_id, created_at);

CREATE TABLE IF NOT EXISTS requisition_lines (
  id              TEXT PRIMARY KEY,
  requisition_id  TEXT NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
  item_id         TEXT REFERENCES inventory_items(id),
  item_name       TEXT NOT NULL,
  item_sku        TEXT,
  unit_of_measure TEXT NOT NULL DEFAULT 'unit',
  requested_qty   REAL NOT NULL DEFAULT 0,
  received_qty    REAL NOT NULL DEFAULT 0,
  unit_cost       REAL,
  notes           TEXT,
  received_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_req_lines ON requisition_lines(requisition_id);
