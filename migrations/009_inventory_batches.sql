-- Migration 009 — Inventory batch tracking with expiry dates
PRAGMA foreign_keys=ON;

-- Every inventory item (ingredient or product) can have one or more batches.
-- A batch is created either automatically when a purchase order line is
-- received (source='restock'), or manually from the Inventory list
-- (source='manual'). The batch_number is always system-generated so batches
-- stay uniquely traceable; the expiry_date can be supplied at either of those
-- two moments, or left blank and filled in / edited later.
CREATE TABLE IF NOT EXISTS inventory_batches (
  id                  TEXT PRIMARY KEY,
  business_id         TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  item_id             TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  batch_number        TEXT NOT NULL,
  quantity            REAL NOT NULL DEFAULT 0,
  expiry_date         TEXT,                          -- ISO date (YYYY-MM-DD), nullable until assigned
  source              TEXT NOT NULL DEFAULT 'manual', -- 'restock' | 'manual' | 'initial'
  requisition_line_id TEXT REFERENCES requisition_lines(id),
  notes               TEXT,
  received_at         TEXT NOT NULL DEFAULT (datetime('now')),
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(business_id, batch_number)
);
CREATE INDEX IF NOT EXISTS idx_batches_item     ON inventory_batches(item_id, expiry_date);
CREATE INDEX IF NOT EXISTS idx_batches_business ON inventory_batches(business_id, expiry_date);
