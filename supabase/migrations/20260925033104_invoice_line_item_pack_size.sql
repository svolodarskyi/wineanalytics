-- Lets a line item record "units per pack" (a printed "6-pack" or "case of
-- 24") separately from quantity, so quantity keeps meaning "how many of what
-- the invoice printed" (pack count) while purchased-quantity math elsewhere
-- (src/services/supabase/balances.ts, wineService.ts#getPurchaseHistory) can
-- multiply by pack_size to get real bottle/can counts. Defaults to 1 - an
-- item sold individually has one unit per "pack".
alter table wine_invoice_line_items add column if not exists pack_size integer not null default 1;

-- Pack size is also hand-correctable from the invoice review page, alongside
-- quantity/unit price/volume/invoice date - extend the corrections log's
-- allowed field names to match.
alter table wine_invoice_corrections drop constraint wine_invoice_corrections_field_name_check;
alter table wine_invoice_corrections add constraint wine_invoice_corrections_field_name_check
  check (field_name in ('invoice_date', 'quantity', 'unit_price', 'volume_ml', 'pack_size'));
