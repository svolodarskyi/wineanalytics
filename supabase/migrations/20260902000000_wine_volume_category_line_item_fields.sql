-- Adds wine volume/category, and the matching raw-extraction fields on
-- invoice line items so a quick-create from the picker can pre-fill them.
-- See _docs/supabase-plan.md.

alter table wine_wines add column volume text;
alter table wine_wines add column category text
  --check (category in ('red', 'white', 'rose', 'sparkling', 'dessert', 'fortified', 'other'));

alter table wine_invoice_line_items add column volume_raw text;
alter table wine_invoice_line_items add column category_raw text
  --check (category_raw in ('red', 'white', 'rose', 'sparkling', 'dessert', 'fortified', 'other'));
