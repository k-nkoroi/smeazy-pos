-- Migration 008 — Customers, partial payments (tabs)
PRAGMA foreign_keys=ON;

-- ── CUSTOMERS ────────────────────────────────────────────────────────────────
-- Created on demand: when a waiter types a customer's name into the search bar
-- on an order, matching customers are suggested (search by name/phone); if none
-- match, a new customer record is created automatically the moment it's attached
-- to an order. Business-scoped so the same phone number can exist per tenant.
CREATE TABLE IF NOT EXISTS customers (
  id          TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  phone       TEXT,
  email       TEXT,
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_customers_business ON customers(business_id, name);
-- A given phone number identifies one customer per business (when provided).
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_business_phone ON customers(business_id, phone) WHERE phone IS NOT NULL;

-- ── ORDER ↔ CUSTOMER LINK + TAB BALANCE ──────────────────────────────────────
-- customer_name/customer_phone already exist on pos_orders (denormalised free
-- text); customer_id links the order to the actual Customer record so tabs and
-- purchase history can be looked up. balance_due tracks what's still owed when
-- an order is only partially paid (status='tab') — settled via further payments
-- until it reaches zero, at which point the order becomes 'paid'.
ALTER TABLE pos_orders ADD COLUMN customer_id TEXT REFERENCES customers(id);
ALTER TABLE pos_orders ADD COLUMN balance_due REAL NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_orders_customer ON pos_orders(customer_id, status);

-- Order status vocabulary now includes 'tab' alongside 'open' | 'paid' | 'voided':
-- a 'tab' order has been served and closed for editing (inventory already
-- deducted, kitchen already completed) but still carries an outstanding
-- balance_due against a customer, to be settled later via additional payments.
