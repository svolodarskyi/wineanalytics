# Supabase Backend Plan

Plan only — nothing below has been executed against the live project yet.
No tables, buckets, or policies have been created. This is the proposal to
review before I run anything.

## 0. What I checked first

Read-only introspection of the Supabase project in `.env`
(`SUPABASE_URL` / `SUPABASE_SERVICE_KEY`), no writes:

- The project is **shared with an unrelated job-search tool** — existing
  tables are `job`, `application_status`, `fetch_run`, `profile`, plus an
  RPC `rls_auto_enable`. Nothing wine-related exists yet, and nothing named
  `wine_*` collides with anything there.
- That project already uses `id uuid primary key default gen_random_uuid()`
  on every table (`pgcrypto`/`gen_random_uuid()` is available, no extension
  work needed). The plan below follows the same convention for consistency.

This confirms the `wine_` prefix isn't optional cosmetics here — it's the
only thing keeping this app's schema from colliding with the other one in
the same project.

## 1. Scope

Per `_docs/specs.md`: single restaurant, Supabase Auth, no roles/multi-tenancy.
So RLS can stay simple — authenticated-only access to every `wine_*` table,
no per-user row partitioning. If multi-restaurant ever becomes real scope,
that's a schema change (an `org_id` column + policy rework), not a small
tweak — worth flagging now so it's a conscious decision later, not a surprise.

The existing services-layer architecture is designed for exactly this swap:
`src/services/index.ts` picks one backend behind the `Services` interface;
nothing else in the app should need to change. Plan follows that shape.

## 2. Schema

Six tables, all prefixed `wine_`, mirroring `src/types/index.ts` closely
enough that the Supabase service implementations stay mostly mechanical.

```sql
-- Wines --------------------------------------------------------------------
create table wine_wines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invoice_name text,
  country text,
  image_url text,               -- Storage object path, not a data URL
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index wine_wines_name_idx on wine_wines using gin (to_tsvector('simple', name));

-- Vendors --------------------------------------------------------------------
create table wine_vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invoice_name text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index wine_vendors_name_idx on wine_vendors using gin (to_tsvector('simple', name));

-- Invoices -------------------------------------------------------------------
create table wine_invoices (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_type text not null check (file_type in ('image', 'pdf')),
  file_path text not null,      -- Storage object path (wine-invoices bucket)
  uploaded_at timestamptz not null default now(),
  status text not null default 'processing'
    check (status in ('processing', 'not_approved', 'approved')),
  approved_at timestamptz,

  invoice_date date,
  total_amount numeric(12, 2),

  vendor_name_raw text not null default '',
  vendor_id uuid references wine_vendors(id),
  vendor_confidence text check (vendor_confidence in ('high', 'medium', 'low')),
  vendor_match_status text not null default 'unresolved'
    check (vendor_match_status in ('suggested', 'confirmed', 'changed', 'unresolved'))
);
create index wine_invoices_status_idx on wine_invoices (status);
create index wine_invoices_vendor_idx on wine_invoices (vendor_id);

-- Invoice line items -----------------------------------------------------
create table wine_invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references wine_invoices(id) on delete cascade,
  item_name_raw text not null,
  quantity numeric(12, 3) not null,
  unit_price numeric(12, 2) not null,
  line_total numeric(12, 2) not null,
  wine_id uuid references wine_wines(id),
  sku_confidence text check (sku_confidence in ('high', 'medium', 'low')),
  sku_match_status text not null default 'unresolved'
    check (sku_match_status in ('suggested', 'confirmed', 'changed', 'unresolved'))
);
create index wine_invoice_line_items_invoice_idx on wine_invoice_line_items (invoice_id);
create index wine_invoice_line_items_wine_idx on wine_invoice_line_items (wine_id);

-- Non-line-item charges (tax, GST, deposits, shipping, fees, discounts...) --
create table wine_invoice_additional_charges (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references wine_invoices(id) on delete cascade,
  description text not null,
  amount numeric(12, 2) not null
);
create index wine_invoice_additional_charges_invoice_idx on wine_invoice_additional_charges (invoice_id);

-- OpenAI request log (Settings: AI Requests page) ---------------------------
create table wine_openai_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  invoice_id uuid references wine_invoices(id) on delete set null,
  model text not null,
  file_name text not null,
  response_json jsonb,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  cost_usd numeric(10, 6) not null default 0,
  error text
);
create index wine_openai_logs_invoice_idx on wine_openai_logs (invoice_id);
```

Notes on deliberate departures from the mock's in-memory shape:

- **No `wine_wine_balances` / purchase-history tables.** Both are pure
  derivations of `wine_invoice_line_items` joined to approved invoices —
  computed with a query (or a Postgres view) at read time, same as the mock
  does today. Storing them would just be a cache to keep in sync for no
  real benefit at this data volume.
- **Files move to Storage, not `bytea`/`text` blobs.** The mock keeps the
  whole invoice as a base64 `fileDataUrl` string in memory, which is fine
  in RAM but would bloat every row and every query result in Postgres.
  `wine_invoices.file_path` and `wine_wines.image_url` point at Storage
  objects instead (see §3).
- **`wine_openai_logs` doesn't store the image again.** Every logged call
  corresponds 1:1 with an invoice upload (the Settings page only shows
  history, it doesn't run ad-hoc test calls), so it references
  `invoice_id` and the review page's existing image is reused for display
  rather than duplicating another copy of the file.
- **Match sub-objects are flattened onto columns**, not stored as JSON —
  `VendorMatch`/`SkuMatch` become plain columns on the parent row. Keeps
  them queryable/indexable (e.g. "count invoices with an unresolved
  vendor") without JSON path expressions.

## 3. Storage

Two buckets:

- `wine-invoices` — uploaded invoice files (PDF/image), private.
- `wine-photos` — wine label/bottle photos, private (or public-read if you'd
  rather skip signed URLs for something this low-stakes — worth a quick
  call, not a big decision either way).

Bucket names use hyphens (Storage's convention), not the `wine_` underscore
prefix used for tables — buckets already live in their own namespace so
there's no collision risk with the job-search project either way.

## 4. RLS

Single-tenant, so the policy is the same shape on every `wine_*` table:

```sql
alter table wine_wines enable row level security;
create policy "authenticated full access" on wine_wines
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
-- repeat per table
```

Storage buckets get an equivalent authenticated-only policy.

## 5. Auth — built, not yet wired in

`src/services/supabase/client.ts` (lazy Supabase client, reads
`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`) and
`src/services/supabase/authService.ts` (wraps
`signInWithPassword`/`getSession`/`signOut`, satisfies the existing
`AuthService` interface) exist now, with tests (`@supabase/supabase-js`
added as a dependency). `AuthUser` in `src/types/index.ts` (`{id, email}`)
already matched what Supabase Auth returns, so no type changes were needed.

**Not yet wired into the running app** — `src/services/index.ts` still
composes `createMockServices()`. Flipping it over waits on the rest of
§6 (wines/vendors/invoices), since `Services` needs every sub-interface
implemented together; a half-real composition isn't a real state to run
the app in. The code is inert until then (confirmed: adding the dependency
didn't move the production bundle size, since nothing imports it yet).

You'll still need to create the demo user (or whichever real users) in
Supabase Auth directly — that's a dashboard/CLI action, not something this
plan scripts, since it's user/credential setup rather than schema.

## 6. Service layer

New `src/services/supabase/` folder, one file per interface
(`wineService.ts`, `vendorService.ts`, `invoiceService.ts`,
`authService.ts`), each implementing the existing `Services` sub-interfaces
from `src/services/types.ts` — the same contract the mock already satisfies,
so no other file in the app changes. `src/services/index.ts` picks between
`createMockServices()` and a new `createSupabaseServices()` based on whether
`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are set.

`src/services/openai/client.ts` (the extraction call) and the matching logic
in `src/services/mock/similarity.ts` are backend-agnostic already — they
don't touch the store directly, so they carry over largely as-is; only the
thin service wrapper around them changes what it reads/writes against.

## 7. OpenAI call: staying client-side (decided)

`VITE_OPENAI_API_KEY` stays as-is, set in Vercel's env vars at deploy time.
Known, explicit tradeoff: the key ships in the browser bundle and is
extractable by anyone visiting the deployed site. A Supabase Edge Function
or Vercel API route would fix this (holds `OPENAI_API_KEY` server-side,
client calls that instead of `api.openai.com` directly) — skipped for now,
not part of this migration.

## 8. Environment variables

Already in `.env` (server-only, keep it that way):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY` — **never expose this to the client.** It bypasses
  RLS entirely. Server-side/Edge Function/admin-script use only.

Still needed, not yet in `.env`:
- `VITE_SUPABASE_URL` — same value as `SUPABASE_URL`, just re-exposed under
  the `VITE_` prefix Vite requires for client code (same pattern already
  used for `VITE_OPENAI_API_KEY`).
- `VITE_SUPABASE_ANON_KEY` — the **anon/public** key, not the service key.
  This is what the browser should actually authenticate with; RLS is what
  keeps it safe. Grab it from Supabase dashboard → Project Settings → API.

## 9. Rollout order

1. Get the anon key into `.env` as `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
2. Run the schema + RLS SQL above (as a Supabase migration file, so it's
   tracked and repeatable, not a one-off dashboard edit).
3. Create the two Storage buckets + their policies.
4. Add `@supabase/supabase-js` and build `src/services/supabase/client.ts`.
5. Implement `wineService.ts` → `vendorService.ts` → `invoiceService.ts` →
   `authService.ts`, in that order (wines/vendors are simplest CRUD, good
   for validating the plumbing before invoices' nested writes).
6. Port `src/services/mock/seedData.ts`'s six wines / three vendors into the
   real tables (a one-time seed script), so the app isn't empty on first
   real run.
7. Switch `src/services/index.ts` to the real implementation.
8. (Recommended, §7) Move OpenAI extraction into an Edge Function.
9. Manual smoke test of the full flow against the real backend: upload →
   extract → match → approve → balance updates.

Existing mock-backed tests (68 of them) keep running unchanged throughout —
they test against `MockStore`, not Supabase, so this migration doesn't put
them at risk. A handful of new tests would make sense once the Supabase
services exist, but they'd need a real (or locally-run) Supabase instance to
run against, which is a bigger call about CI setup worth its own decision
rather than bundling here.

## Decisions made

- **Storage buckets: private, signed URLs.** Not public-read.
- **OpenAI key: stays client-side** (`VITE_OPENAI_API_KEY`, set in Vercel's
  env vars at deploy time). §7's Edge Function / API-route proxy is
  explicitly skipped for now — known tradeoff, not revisited here.

## 10. Open questions before I touch anything

- Confirm the `wine_` prefix and table names above read right, or adjust.
- Where should the anon key come from — will you paste it in, or should I
  walk through fetching it another way?
