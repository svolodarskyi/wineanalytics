const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * A Postgres `date` column (e.g. `invoice_date`) comes back as a bare
 * "YYYY-MM-DD" string with no time or zone. `new Date("2026-09-01")` parses
 * that as UTC midnight, which in any timezone west of UTC lands on the
 * *previous* local day - e.g. an invoice dated the 1st of the month would
 * wrongly fall into the prior month in any date-bucketed aggregation. Parse
 * date-only strings as local calendar dates instead; a full timestamptz
 * (e.g. `approvedAt`, `soldAt`) parses correctly as-is.
 */
export function parseFlexibleDate(raw: string): Date | null {
  const dateOnly = DATE_ONLY.exec(raw)
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}
