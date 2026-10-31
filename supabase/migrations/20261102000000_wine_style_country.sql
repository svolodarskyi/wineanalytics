-- Wines in the 'wine' category can now also record a style (red/white/
-- sparkling/other) and a country of origin - both null/unused for any
-- other category.
alter table wine_wines add column if not exists style text;
alter table wine_wines add column if not exists country text;
