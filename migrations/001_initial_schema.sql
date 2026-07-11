-- SMEazy V2 — SQLite Schema (Offline-first)
-- Runs automatically at startup via sqlx::migrate!

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- ── TENANTS ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id          TEXT PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  plan_tier   TEXT NOT NULL DEFAULT 'free',
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── USERS ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  username       TEXT NOT NULL UNIQUE,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  sys_admin      INTEGER NOT NULL DEFAULT 0,
  business_staff INTEGER NOT NULL DEFAULT 0,
  display_name   TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── USER ROLES ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_roles (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role_type  TEXT NOT NULL,
  scope      TEXT NOT NULL DEFAULT '{}',
  granted_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_user_roles_user   ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_tenant ON user_roles(tenant_id);

-- ── BUSINESSES ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS businesses (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  primary_user_id   TEXT NOT NULL REFERENCES users(id),
  name              TEXT NOT NULL,
  registration_no   TEXT,
  industry_package  TEXT NOT NULL DEFAULT 'hospitality',
  is_archived       INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_businesses_tenant ON businesses(tenant_id);

-- ── PRODUCT CATEGORIES ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_categories (
  id          TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#6366f1',
  icon        TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(business_id, name)
);
CREATE INDEX IF NOT EXISTS idx_cat_business ON product_categories(business_id);

-- ── INVENTORY ITEMS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_items (
  id                TEXT PRIMARY KEY,
  business_id       TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category_id       TEXT REFERENCES product_categories(id) ON DELETE SET NULL,
  sku               TEXT NOT NULL,
  name              TEXT NOT NULL,
  description       TEXT,
  item_type         TEXT NOT NULL DEFAULT 'finished_good',
  quantity_on_hand  REAL NOT NULL DEFAULT 0,
  reorder_level     REAL NOT NULL DEFAULT 5,
  unit_of_measure   TEXT NOT NULL DEFAULT 'unit',
  cost_price        REAL,
  sale_price        REAL,
  image_url         TEXT,
  tags              TEXT,
  track_inventory   INTEGER NOT NULL DEFAULT 1,
  is_active         INTEGER NOT NULL DEFAULT 1,
  legacy_pos_id     TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(business_id, sku)
);
CREATE INDEX IF NOT EXISTS idx_inventory_business  ON inventory_items(business_id, is_active);
CREATE INDEX IF NOT EXISTS idx_inventory_category  ON inventory_items(category_id);

-- ── INVENTORY MOVEMENTS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_movements (
  id            TEXT PRIMARY KEY,
  item_id       TEXT NOT NULL REFERENCES inventory_items(id),
  order_id      TEXT,
  movement_type TEXT NOT NULL DEFAULT 'adjustment',
  delta_qty     REAL NOT NULL,
  moved_by      TEXT REFERENCES users(id),
  moved_at      TEXT NOT NULL DEFAULT (datetime('now')),
  notes         TEXT
);
CREATE INDEX IF NOT EXISTS idx_movements_item ON inventory_movements(item_id, moved_at);

-- ── TABLES (FLOOR PLAN) ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS floor_tables (
  id          TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  area_name   TEXT NOT NULL DEFAULT 'Main Hall',
  table_name  TEXT NOT NULL,
  capacity    INTEGER NOT NULL DEFAULT 4,
  pos_x       INTEGER NOT NULL DEFAULT 0,
  pos_y       INTEGER NOT NULL DEFAULT 0,
  shape       TEXT NOT NULL DEFAULT 'rect',
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(business_id, table_name)
);
CREATE INDEX IF NOT EXISTS idx_tables_business ON floor_tables(business_id);

-- ── POS ORDERS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pos_orders (
  id              TEXT PRIMARY KEY,
  business_id     TEXT NOT NULL REFERENCES businesses(id),
  table_id        TEXT REFERENCES floor_tables(id),
  table_name      TEXT,
  guest_count     INTEGER NOT NULL DEFAULT 1,
  cashier_id      TEXT NOT NULL REFERENCES users(id),
  waitstaff_id    TEXT REFERENCES users(id),
  waitstaff_name  TEXT,
  customer_name   TEXT,
  customer_phone  TEXT,
  status          TEXT NOT NULL DEFAULT 'open',
  total_amount    REAL NOT NULL DEFAULT 0,
  discount        REAL NOT NULL DEFAULT 0,
  notes           TEXT,
  opened_at       TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at       TEXT,
  kitchen_sent_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_business ON pos_orders(business_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_table    ON pos_orders(table_id, status);

-- ── POS ORDER ITEMS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pos_order_items (
  id            TEXT PRIMARY KEY,
  order_id      TEXT NOT NULL REFERENCES pos_orders(id) ON DELETE CASCADE,
  item_id       TEXT REFERENCES inventory_items(id),
  name          TEXT NOT NULL,
  sku           TEXT,
  quantity      INTEGER NOT NULL DEFAULT 1,
  unit_price    REAL NOT NULL DEFAULT 0,
  discount      REAL NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'new',
  notes         TEXT,
  added_at      TEXT NOT NULL DEFAULT (datetime('now')),
  dispatched_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON pos_order_items(order_id);

-- ── PAYMENT RECORDS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_records (
  id             TEXT PRIMARY KEY,
  order_id       TEXT NOT NULL REFERENCES pos_orders(id),
  method         TEXT NOT NULL,
  amount         REAL NOT NULL,
  reference      TEXT,
  confirmed_by   TEXT REFERENCES users(id),
  confirmed_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payment_records(order_id);

-- ── KITCHEN ORDERS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kitchen_orders (
  id            TEXT PRIMARY KEY,
  order_id      TEXT NOT NULL REFERENCES pos_orders(id),
  business_id   TEXT NOT NULL REFERENCES businesses(id),
  table_name    TEXT NOT NULL,
  waitstaff_name TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',
  priority      INTEGER NOT NULL DEFAULT 0,
  notes         TEXT,
  sent_at       TEXT NOT NULL DEFAULT (datetime('now')),
  acknowledged_at TEXT,
  completed_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_kitchen_business ON kitchen_orders(business_id, status);
CREATE INDEX IF NOT EXISTS idx_kitchen_order    ON kitchen_orders(order_id);

-- ── KITCHEN ORDER ITEMS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kitchen_order_items (
  id               TEXT PRIMARY KEY,
  kitchen_order_id TEXT NOT NULL REFERENCES kitchen_orders(id) ON DELETE CASCADE,
  order_item_id    TEXT REFERENCES pos_order_items(id),
  name             TEXT NOT NULL,
  quantity         INTEGER NOT NULL DEFAULT 1,
  notes            TEXT,
  status           TEXT NOT NULL DEFAULT 'new',
  dispatched_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_kitchen_items_order ON kitchen_order_items(kitchen_order_id);

-- ── STAFF RECORDS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_records (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id      TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  department       TEXT,
  employment_type  TEXT NOT NULL DEFAULT 'permanent',
  base_salary      REAL,
  hire_date        TEXT NOT NULL,
  UNIQUE(user_id, business_id)
);
CREATE INDEX IF NOT EXISTS idx_staff_business ON staff_records(business_id);

-- ── WALLET LEDGER ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallet_ledger (
  id          TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id),
  dc          TEXT NOT NULL CHECK(dc IN ('debit','credit')),
  amount      REAL NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'KES',
  description TEXT,
  source_ref  TEXT,
  status      TEXT NOT NULL DEFAULT 'settled',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ledger_business ON wallet_ledger(business_id, created_at);
