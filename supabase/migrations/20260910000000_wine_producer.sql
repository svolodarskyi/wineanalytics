-- Wines can now record a producer/winery, distinct from the wine's own name.
alter table wine_wines add column if not exists producer text;
