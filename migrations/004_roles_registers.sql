-- SMEazy POS Migration 004 — Multi-role staff, Registers, Register-category binding
PRAGMA foreign_keys=ON;

-- ── MULTI-ROLE STAFF ──────────────────────────────────────────────────────────
-- staff_roles: a staff member can hold multiple roles simultaneously.
-- Roles: admin_staff, executive_staff, operational_staff (Waitstaff),
--        cashier, storekeeper, guest_contractor
CREATE TABLE IF NOT EXISTS staff_roles (
  id           TEXT PRIMARY KEY,
  staff_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id  TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  role_type    TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(staff_user_id, business_id, role_type)
);
CREATE INDEX IF NOT EXISTS idx_staff_roles ON staff_roles(business_id, staff_user_id);

-- Backfill: migrate every existing single role_type into staff_roles
INSERT OR IGNORE INTO staff_roles (id, staff_user_id, business_id, role_type, created_at)
SELECT
  lower(hex(randomblob(16))),
  sr.user_id, sr.business_id, sr.role_type, datetime('now')
FROM staff_records sr
WHERE sr.role_type IS NOT NULL;

-- ── REGISTERS ─────────────────────────────────────────────────────────────────
-- A register (till) scopes the POS to specific product categories.
CREATE TABLE IF NOT EXISTS registers (
  id           TEXT PRIMARY KEY,
  business_id  TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  is_active    INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_registers_business ON registers(business_id);

-- Category department tags a register is allowed to sell from.
-- Uses free-text department labels: Kitchen, Bar, Accommodation, Pool, Games, Toys
CREATE TABLE IF NOT EXISTS register_categories (
  id           TEXT PRIMARY KEY,
  register_id  TEXT NOT NULL REFERENCES registers(id) ON DELETE CASCADE,
  department   TEXT NOT NULL,
  UNIQUE(register_id, department)
);
CREATE INDEX IF NOT EXISTS idx_register_categories ON register_categories(register_id);

-- Tag inventory categories with a department so registers can filter by it.
ALTER TABLE product_categories ADD COLUMN department TEXT;
