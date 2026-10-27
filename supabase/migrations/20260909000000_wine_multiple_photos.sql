-- Wines can now have up to 3 photos instead of just one.
alter table wine_wines add column if not exists image_urls text[] not null default '{}';
update wine_wines set image_urls = array[image_url] where image_url is not null and image_urls = '{}';
alter table wine_wines drop column if exists image_url;
--alter table wine_wines add constraint wine_wines_image_urls_max3 check (cardinality(image_urls) <= 3);
