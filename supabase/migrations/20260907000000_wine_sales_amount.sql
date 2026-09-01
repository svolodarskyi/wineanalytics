-- Total dollar amount for a sale entry (not per-unit) - optional, since a
-- manual demo entry (or early POS data) may not always carry a price.
alter table wine_sales add column if not exists amount numeric check (amount >= 0);
