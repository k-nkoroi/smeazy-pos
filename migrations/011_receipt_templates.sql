-- Migration 011 — Customizable receipt templates + Order Note
PRAGMA foreign_keys=ON;

-- A business can define several named print templates: the regular customer
-- receipt ('receipt') and an internal kitchen/floor control ticket
-- ('order_note'). Exactly one template per (business_id, template_type) is
-- flagged is_default — that's the one the POS actually prints with; the rest
-- are kept around so staff can switch between saved styles. Formatting is
-- deliberately coarse (a handful of named choices, not free CSS) so it stays
-- safe to render and easy to edit from Settings.
CREATE TABLE IF NOT EXISTS receipt_templates (
  id            TEXT PRIMARY KEY,
  business_id   TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  template_type TEXT NOT NULL DEFAULT 'receipt', -- 'receipt' | 'order_note'
  is_default    INTEGER NOT NULL DEFAULT 0,
  font_family   TEXT NOT NULL DEFAULT 'mono',    -- 'mono' | 'sans' | 'serif'
  font_weight   TEXT NOT NULL DEFAULT 'normal',  -- 'normal' | 'medium' | 'bold'
  font_size     TEXT NOT NULL DEFAULT 'sm',      -- 'xs' | 'sm' | 'base'
  header_text   TEXT,                            -- shown under the business name/logo
  footer_text   TEXT,                            -- shown at the bottom of the ticket
  show_logo     INTEGER NOT NULL DEFAULT 1,
  show_vat_note INTEGER NOT NULL DEFAULT 1,       -- "Price inclusive of X% VAT" line (receipt only)
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_receipt_templates_business ON receipt_templates(business_id, template_type);
