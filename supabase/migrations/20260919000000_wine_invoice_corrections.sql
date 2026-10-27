-- Logs every manual correction made to an OCR-extracted invoice field
-- (invoice date, line item quantity/unit price) - lets us see how often the
-- AI extraction needs fixing, per invoice or over time. Only user-initiated
-- edits are logged here; the OCR pipeline's own initial writes are not.
create table wine_invoice_corrections (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references wine_invoices(id) on delete cascade,
  line_item_id uuid references wine_invoice_line_items(id) on delete cascade,
  field_name text not null check (field_name in ('invoice_date', 'quantity', 'unit_price')),
  old_value text,
  new_value text,
  changed_at timestamptz not null default now()
);
create index wine_invoice_corrections_invoice_idx on wine_invoice_corrections (invoice_id);

alter table wine_invoice_corrections enable row level security;
create policy "authenticated full access" on wine_invoice_corrections
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
