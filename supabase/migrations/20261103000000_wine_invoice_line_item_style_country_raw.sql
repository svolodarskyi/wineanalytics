-- OCR-extracted style/country go on the line item too (like category_raw),
-- only meaningful when category_raw is 'wine' - pre-fills a new wine's
-- style/country fields in the invoice-review "create new wine" flow.
alter table wine_invoice_line_items add column if not exists style_raw text;
alter table wine_invoice_line_items add column if not exists country_raw text;
