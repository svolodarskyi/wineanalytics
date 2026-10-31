-- Wine categories are simplified from the color/style breakdown
-- (red/white/rose/sparkling/dessert/fortified/spirits/cider/non_alcoholic)
-- down to five buckets: wine, hard_liquor, beer, sake, other.
update wine_wines set category = 'wine' where category in ('red', 'white', 'sparkling', 'fortified', 'rose', 'dessert');
update wine_wines set category = 'hard_liquor' where category = 'spirits';
update wine_wines set category = 'other' where category = 'non_alcoholic';
