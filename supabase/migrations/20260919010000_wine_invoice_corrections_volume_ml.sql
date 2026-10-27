-- Volume (ml) is now also hand-correctable from the invoice review page,
-- alongside quantity/unit price/invoice date.
alter table wine_invoice_corrections drop constraint wine_invoice_corrections_field_name_check;
alter table wine_invoice_corrections add constraint wine_invoice_corrections_field_name_check
  check (field_name in ('invoice_date', 'quantity', 'unit_price', 'volume_ml'));
