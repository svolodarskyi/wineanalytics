-- Moves invoice OCR processing off the browser tab: a trigger on wine_invoices
-- fires the process-invoice Edge Function directly from Postgres via pg_net,
-- so processing survives the upload tab closing/backgrounding mid-request.
-- See src/services/supabase/invoiceService.ts for what upload() does now
-- (just insert the row and return) vs. before (fire-and-forget client call).

create extension if not exists pg_net with schema extensions;

alter table wine_invoices add column if not exists processing_started_at timestamptz;

-- The webhook secret is stored in Vault (not this file) via:
--   select vault.create_secret('<random-value>', 'invoice_webhook_secret');
-- run once, out of band, so the real value never lands in git history.
create or replace function notify_process_invoice() returns trigger as $$
declare
  webhook_secret text;
begin
  select decrypted_secret into webhook_secret
  from vault.decrypted_secrets
  where name = 'invoice_webhook_secret';

  perform net.http_post(
    url := 'https://ufnofpnshvniyvpudylt.functions.supabase.co/process-invoice',
    body := jsonb_build_object('type', 'INSERT', 'table', 'wine_invoices', 'schema', 'public', 'record', to_jsonb(new)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', webhook_secret),
    timeout_milliseconds := 10000
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public, extensions;

drop trigger if exists wine_invoices_process_after_insert on wine_invoices;
create trigger wine_invoices_process_after_insert
  after insert on wine_invoices
  for each row
  when (new.status = 'processing')
  execute function notify_process_invoice();
