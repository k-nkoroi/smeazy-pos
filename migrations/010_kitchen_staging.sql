-- Migration 010 — Kitchen dual-inventory: staged production
PRAGMA foreign_keys=ON;

-- Every Kitchen item with a recipe (is_assembled=1) fits one of two production
-- types, settable from the Inventory list when creating/editing the item:
--
--   'one_step' (default) — ingredients move straight from raw stock to sold/
--   consumed the moment the item is added to an order (e.g. beef in Nyama
--   Choma). No intermediate state; behaves exactly as recipes already did.
--
--   'staged' — the item has a real "processing" stage (e.g. beef formed into
--   raw samosas). Ingredients are deducted up front when a batch is put into
--   production (quantity_on_hand of the ingredients drops), and the produced
--   units sit in wip_quantity ("processing" status) until a separate
--   "complete processing" step marks them ready-to-eat, at which point they
--   move into quantity_on_hand (the "processed" status — what the POS sells).
--
-- This lets stock levels reflect reality in real time: raw beef still in the
-- fridge is "pre-processing" (tracked on the ingredient's own quantity_on_hand,
-- item_type='assembly'); beef already formed into samosas but not yet fried is
-- "processing" (wip_quantity on the samosa item); fried, ready-to-eat samosas
-- in the warmer are "processed" (quantity_on_hand on the samosa item).
ALTER TABLE inventory_items ADD COLUMN production_type TEXT NOT NULL DEFAULT 'one_step';
ALTER TABLE inventory_items ADD COLUMN wip_quantity     REAL NOT NULL DEFAULT 0;
