-- Wine Analytics schema. See _docs/supabase-plan.md for the full writeup.
-- All tables are wine_-prefixed: this project also hosts an unrelated
-- job-search app (job/application_status/fetch_run/profile), so the prefix
-- is load-bearing, not decoration.
--
-- Single-tenant RLS (per _docs/specs.md: one restaurant, no roles) -
-- every table just requires an authenticated session, full access.

-- Wines ----------------------------------------------------------------
create table wine_wines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invoice_name text,
  country text,
  image_url text,               -- Storage object path, not a data URL
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index wine_wines_name_idx on wine_wines using gin (to_tsvector('simple', name));

alter table wine_wines enable row level security;
create policy "authenticated full access" on wine_wines
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Vendors ----------------------------------------------------------------
create table wine_vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invoice_name text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index wine_vendors_name_idx on wine_vendors using gin (to_tsvector('simple', name));

alter table wine_vendors enable row level security;
create policy "authenticated full access" on wine_vendors
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Invoices ----------------------------------------------------------------
create table wine_invoices (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_type text not null check (file_type in ('image', 'pdf')),
  file_path text not null,      -- Storage object path (wine-invoices bucket)
  uploaded_at timestamptz not null default now(),
  status text not null default 'processing'
    check (status in ('processing', 'not_approved', 'approved')),
  approved_at timestamptz,

  invoice_date date,
  total_amount numeric(12, 2),

  vendor_name_raw text not null default '',
  vendor_id uuid references wine_vendors(id),
  vendor_confidence text check (vendor_confidence in ('high', 'medium', 'low')),
  vendor_match_status text not null default 'unresolved'
    check (vendor_match_status in ('suggested', 'confirmed', 'changed', 'unresolved'))
);
create index wine_invoices_status_idx on wine_invoices (status);
create index wine_invoices_vendor_idx on wine_invoices (vendor_id);

alter table wine_invoices enable row level security;
create policy "authenticated full access" on wine_invoices
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Invoice line items -------------------------------------------------------
create table wine_invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references wine_invoices(id) on delete cascade,
  item_name_raw text not null,
  quantity numeric(12, 3) not null,
  unit_price numeric(12, 2) not null,
  line_total numeric(12, 2) not null,
  wine_id uuid references wine_wines(id),
  sku_confidence text check (sku_confidence in ('high', 'medium', 'low')),
  sku_match_status text not null default 'unresolved'
    check (sku_match_status in ('suggested', 'confirmed', 'changed', 'unresolved'))
);
create index wine_invoice_line_items_invoice_idx on wine_invoice_line_items (invoice_id);
create index wine_invoice_line_items_wine_idx on wine_invoice_line_items (wine_id);

alter table wine_invoice_line_items enable row level security;
create policy "authenticated full access" on wine_invoice_line_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Non-line-item charges (tax, GST, deposits, shipping, fees, discounts...) --
create table wine_invoice_additional_charges (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references wine_invoices(id) on delete cascade,
  description text not null,
  amount numeric(12, 2) not null
);
create index wine_invoice_additional_charges_invoice_idx on wine_invoice_additional_charges (invoice_id);

alter table wine_invoice_additional_charges enable row level security;
create policy "authenticated full access" on wine_invoice_additional_charges
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- OpenAI request log (Settings: AI Requests page) ---------------------------
create table wine_openai_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  invoice_id uuid references wine_invoices(id) on delete set null,
  model text not null,
  file_name text not null,
  response_json jsonb,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  cost_usd numeric(10, 6) not null default 0,
  error text
);
create index wine_openai_logs_invoice_idx on wine_openai_logs (invoice_id);

alter table wine_openai_logs enable row level security;
create policy "authenticated full access" on wine_openai_logs
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Storage buckets -----------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('wine-invoices', 'wine-invoices', false),
       ('wine-photos', 'wine-photos', false)
on conflict (id) do nothing;

create policy "authenticated full access to wine-invoices"
  on storage.objects for all
  using (bucket_id = 'wine-invoices' and auth.role() = 'authenticated')
  with check (bucket_id = 'wine-invoices' and auth.role() = 'authenticated');

create policy "authenticated full access to wine-photos"
  on storage.objects for all
  using (bucket_id = 'wine-photos' and auth.role() = 'authenticated')
  with check (bucket_id = 'wine-photos' and auth.role() = 'authenticated');
