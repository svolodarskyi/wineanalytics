-- Lets a line item be flagged as never meant to become inventory (a non-wine
-- item like a beer/mixer, a duplicate, a fee OCR misread as a line, etc.) -
-- see src/pages/InvoiceReviewPage.tsx's "Don't post" toggle. Excluded lines
-- skip the wine-SKU-match requirement on approval and are left out of
-- purchased-quantity totals (src/services/supabase/balances.ts,
-- src/services/supabase/wineService.ts#getPurchaseHistory).
alter table wine_invoice_line_items add column if not exists excluded boolean not null default false;
