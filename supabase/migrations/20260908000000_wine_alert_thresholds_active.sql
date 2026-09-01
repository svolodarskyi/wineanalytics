-- Inventory alert thresholds can now be paused without losing the
-- configured level, instead of only delete-and-recreate.
alter table wine_alert_thresholds add column if not exists active boolean not null default true;
