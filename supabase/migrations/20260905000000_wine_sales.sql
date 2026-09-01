-- Sales side of purchases-minus-sales inventory. Pour sizes are global
-- (shared across every wine) for now - see _docs/supabase-plan.md /
-- src/types/index.ts PourSize doc comment if this needs to become
-- per-wine later.

create table wine_pour_sizes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  volume_ml integer not null check (volume_ml > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table wine_pour_sizes enable row level security;
create policy "authenticated full access" on wine_pour_sizes
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- One recorded sale, in canonical milliliters regardless of how it was
-- entered (a named pour size, a full bottle, or a raw ml override).
-- volume_ml is the per-unit volume (one glass, one bottle); quantity is how
-- many of that unit were sold in this one record (e.g. "3 glasses" is a
-- single row with volume_ml: 150, quantity: 3, not three separate rows).
create table wine_sales (
  id uuid primary key default gen_random_uuid(),
  wine_id uuid not null references wine_wines(id) on delete cascade,
  pour_size_id uuid references wine_pour_sizes(id) on delete set null,
  volume_ml integer not null check (volume_ml > 0),
  quantity integer not null default 1 check (quantity > 0),
  sold_at timestamptz not null,
  source text not null default 'manual' check (source in ('manual', 'pos')),
  created_at timestamptz not null default now()
);
create index wine_sales_wine_idx on wine_sales (wine_id);

alter table wine_sales enable row level security;
create policy "authenticated full access" on wine_sales
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Single global row: flags any sale whose volume falls outside these
-- bounds. Null bound = unbounded on that side. Application code always
-- reads/writes the single most-recently-created row.
create table wine_sales_alert_settings (
  id uuid primary key default gen_random_uuid(),
  min_volume_ml integer check (min_volume_ml >= 0),
  max_volume_ml integer check (max_volume_ml >= 0),
  created_at timestamptz not null default now()
);

alter table wine_sales_alert_settings enable row level security;
create policy "authenticated full access" on wine_sales_alert_settings
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
