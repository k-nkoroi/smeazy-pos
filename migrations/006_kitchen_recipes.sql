-- Migration 006 — Kitchen dual-inventory: recipes / bill-of-materials
PRAGMA foreign_keys=ON;

-- Recipes link a finished PRODUCT (item_type='product') to the ASSEMBLY items
-- (ingredients, item_type='assembly') that make it up. When the product sells or
-- spoils, each ingredient is depleted by (component quantity × units moved).
CREATE TABLE IF NOT EXISTS recipe_components (
  id              TEXT PRIMARY KEY,
  business_id     TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id      TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  ingredient_id   TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  quantity        REAL NOT NULL DEFAULT 1,   -- ingredient units consumed per 1 product unit
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(product_id, ingredient_id)
);
CREATE INDEX IF NOT EXISTS idx_recipe_product ON recipe_components(product_id);
CREATE INDEX IF NOT EXISTS idx_recipe_business ON recipe_components(business_id);

-- A product can be marked as "assembled" — its stock is not tracked directly;
-- availability is derived from ingredient stock. Bar products keep track_inventory=1
-- and item_type='product' with no recipe (sold directly from their own stock).
ALTER TABLE inventory_items ADD COLUMN is_assembled INTEGER NOT NULL DEFAULT 0;

-- Normalise item_type vocabulary going forward:
--   'assembly' = ingredient (kitchen raw stock)
--   'product'  = finished good sold on POS (bar item OR assembled kitchen dish)
-- Existing rows default to 'finished_good'; migrate them to 'product' so the POS
-- keeps showing them.
UPDATE inventory_items SET item_type='product' WHERE item_type='finished_good';
