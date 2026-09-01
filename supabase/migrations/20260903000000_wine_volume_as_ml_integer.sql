-- Volume becomes a proper measurement instead of free text: milliliters,
-- stored as an integer, so inventory math (bottles * volume_ml) is trivial
-- and doesn't require parsing "750ml" / "1.5L" strings.

alter table wine_wines drop column if exists volume;
alter table wine_wines add column volume_ml integer;

alter table wine_invoice_line_items drop column if exists volume_raw;
alter table wine_invoice_line_items add column volume_ml_raw integer;
