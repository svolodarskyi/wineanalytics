# Wine Analytics

A wine purchasing MVP for a single restaurant: upload an invoice, let OCR and
AI matching suggest the vendor and wine SKUs, review and correct the
suggestions, approve, and see the resulting wine balance and purchase
history.

See [`_docs/specs.md`](_docs/specs.md) for the full product spec.

## Stack

- React + TypeScript + Vite
- React Router, TanStack Query
- Vitest + React Testing Library

## Backend

There is no real backend yet. Every data operation goes through the service
interfaces in `src/services/types.ts` (`WineService`, `VendorService`,
`InvoiceService`, `AuthService`), composed into a single `services` object in
`src/services/index.ts`. The only implementation right now is the in-memory
mock in `src/services/mock`, which simulates OCR/matching latency and
confidence-scored vendor/SKU matching against the seeded wine and vendor
master data - so the app runs end-to-end with no server. A real backend can
be dropped in later by implementing the same interfaces and swapping the
composition in `src/services/index.ts`; no component would need to change.

## Getting started

```bash
npm install
npm run dev      # start the app
npm test         # run the test suite
npm run build    # type-check and produce a production build
npm run lint     # oxlint
```

Sign in with any email/password - auth is mocked and any non-empty
credentials work.
