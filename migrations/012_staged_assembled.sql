-- Migration 012 — staged items are assembled
-- A "staged" production item is by definition assembled: it's built from a recipe
-- and has a processing stage. Builds before 2.7 let production_type be set to
-- 'staged' without also flipping is_assembled, so those items never showed on the
-- Processing board (and couldn't be processed). Heal any existing data so items
-- that were already converted to Staged appear and work without being re-saved.
UPDATE inventory_items SET is_assembled = 1
 WHERE production_type = 'staged' AND is_assembled = 0;
