-- Producer and country are no longer tracked on wines - drop the columns.
alter table wine_wines drop column if exists producer;
alter table wine_wines drop column if exists country;
