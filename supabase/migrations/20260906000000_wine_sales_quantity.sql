-- wine_sales originally recorded one unit per row. Sales now support a
-- quantity of that unit sold in one entry (e.g. "3 glasses" as a single row
-- with volume_ml: 150, quantity: 3) instead of one row per glass/bottle.
--
-- Nullable, no default: existing rows created before this column existed
-- have no quantity to backfill. The app treats a null quantity as 1 when
-- reading (see fromRow() in the sale/alert services) rather than assuming
-- a default here.
alter table wine_sales add column if not exists quantity integer null check (quantity > 0);
