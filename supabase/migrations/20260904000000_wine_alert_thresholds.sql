-- Inventory alert thresholds: at most one per wine ("select wine and alert
-- level"). Data-quality alerts don't need a table - they're computed live
-- from wine_wines' existing columns (see src/utils/dataQuality.ts).

create table wine_alert_thresholds (
  id uuid primary key default gen_random_uuid(),
  wine_id uuid not null unique references wine_wines(id) on delete cascade,
  min_bottles integer not null check (min_bottles >= 0),
  created_at timestamptz not null default now()
);

alter table wine_alert_thresholds enable row level security;
create policy "authenticated full access" on wine_alert_thresholds
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
