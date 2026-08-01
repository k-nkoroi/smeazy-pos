-- Migration 007 — Accommodation room status tracking
PRAGMA foreign_keys=ON;

-- One row per Accommodation-department inventory item (a "Room"). Rows are
-- lazily provisioned the first time a room is listed, so admins never need a
-- separate "create room" step — the room list always mirrors the product catalog.
CREATE TABLE IF NOT EXISTS accommodation_rooms (
  id               TEXT PRIMARY KEY,
  business_id      TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  item_id          TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'ready',   -- 'ready' | 'occupied' | 'readying'
  current_order_id TEXT REFERENCES pos_orders(id),
  occupied_at      TEXT,                            -- when the room became occupied (check-in)
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(item_id)
);
CREATE INDEX IF NOT EXISTS idx_accommodation_rooms_business ON accommodation_rooms(business_id, status);
CREATE INDEX IF NOT EXISTS idx_accommodation_rooms_order ON accommodation_rooms(current_order_id);
