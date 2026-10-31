import type {
  AdditionalCharge,
  AuthUser,
  DataQualityAlert,
  Invoice,
  InventoryAlert,
  InvoiceStatus,
  OpenAiRequestLog,
  PourSize,
  PurchaseHistoryEntry,
  SalesAlertThreshold,
  SalesQualityAlert,
  Vendor,
  Wine,
  WineAlertThreshold,
  WineBalance,
  WineCategory,
  WineCountry,
  WineSale,
  WineStyle,
} from '../types'

/**
 * Every network/backend interaction in the app goes through one of these
 * interfaces. Components and hooks never talk to fetch/Supabase/OpenAI
 * directly - they call `services.wines`, `services.vendors`, etc.
 *
 * This keeps the UI backend-agnostic: `src/services/mock` implements these
 * interfaces entirely in memory so the app runs with no server, and a real
 * implementation (Supabase + OpenAI) can be dropped in later behind the same
 * contract without touching a single component.
 */

export interface ListOptions {
  query?: string
  includeInactive?: boolean
}

export type WineListOptions = ListOptions

export interface WineService {
  list(options?: WineListOptions): Promise<Wine[]>
  get(id: string): Promise<Wine | null>
  create(input: {
    name: string
    invoiceName?: string | null
    volumeMl?: number | null
    category?: WineCategory | null
    /** Only meaningful when category is 'wine'. */
    style?: WineStyle | null
    /** Only meaningful when category is 'wine'. */
    country?: WineCountry | null
    /** Undefined leaves photos untouched; an array (0-3 entries) replaces the whole set. */
    imageDataUrls?: string[]
  }): Promise<Wine>
  update(
    id: string,
    input: {
      name: string
      invoiceName?: string | null
      volumeMl?: number | null
      category?: WineCategory | null
      /** Only meaningful when category is 'wine'. */
      style?: WineStyle | null
      /** Only meaningful when category is 'wine'. */
      country?: WineCountry | null
      /** Undefined leaves photos untouched; an array (0-3 entries) replaces the whole set. */
    imageDataUrls?: string[]
    },
  ): Promise<Wine>
  setActive(id: string, active: boolean): Promise<Wine>
  /** Permanently removes a wine that has never appeared on any invoice. Throws if it has purchase history - deactivate instead. */
  delete(id: string): Promise<void>
  getBalances(): Promise<WineBalance[]>
  getPurchaseHistory(id: string): Promise<PurchaseHistoryEntry[]>
}

export interface VendorService {
  list(options?: ListOptions): Promise<Vendor[]>
  get(id: string): Promise<Vendor | null>
  create(input: { name: string; invoiceName?: string | null }): Promise<Vendor>
  update(id: string, input: { name: string; invoiceName?: string | null }): Promise<Vendor>
  setActive(id: string, active: boolean): Promise<Vendor>
  /** Permanently removes a vendor that has never appeared on any invoice. Throws if it has invoice history - deactivate instead. */
  delete(id: string): Promise<void>
}

export interface InvoiceService {
  list(options?: { status?: InvoiceStatus | 'all' }): Promise<Invoice[]>
  get(id: string): Promise<Invoice | null>
  /** Uploads a document and kicks off OCR + vendor/SKU matching in the background. */
  upload(input: { fileName: string; fileType: 'image' | 'pdf'; fileDataUrl: string }): Promise<Invoice>
  /** Accepts the currently suggested vendor as-is. */
  confirmVendorMatch(invoiceId: string): Promise<Invoice>
  /** Overrides the vendor match with a user-selected vendor. */
  selectVendorMatch(invoiceId: string, vendorId: string): Promise<Invoice>
  /** Accepts the currently suggested SKU for a line item as-is. */
  confirmSkuMatch(invoiceId: string, lineItemId: string): Promise<Invoice>
  /** Overrides a line item's SKU match with a user-selected wine. */
  selectSkuMatch(invoiceId: string, lineItemId: string, wineId: string): Promise<Invoice>
  /** Corrects OCR-extracted volume/quantity/unit price/pack size by hand; lineTotal is always recomputed as quantity * unitPrice, never taken from the caller. */
  updateLineItem(
    invoiceId: string,
    lineItemId: string,
    fields: { volumeMl: number | null; quantity: number; unitPrice: number; packSize: number },
  ): Promise<Invoice>
  /** Marks (or unmarks) a line item as never meant to become inventory - skips the wine-SKU-match requirement on approval and purchased-quantity totals for that line. */
  setLineItemExcluded(invoiceId: string, lineItemId: string, excluded: boolean): Promise<Invoice>
  /** Corrects the extracted invoice date by hand, e.g. when OCR missed or misread it. */
  updateInvoiceDate(invoiceId: string, invoiceDate: string | null): Promise<Invoice>
  /** Approves the invoice, folding its line items into wine balances. */
  approve(invoiceId: string): Promise<Invoice>
  /** Permanently removes an invoice that was never approved - a bad or unwanted upload. Throws if the invoice is already approved; unapprove isn't supported since that would silently change wine balances. */
  discard(invoiceId: string): Promise<void>
}

export interface AuthService {
  getCurrentUser(): Promise<AuthUser | null>
  login(email: string, password: string): Promise<AuthUser>
  logout(): Promise<void>
}

export interface AlertService {
  /** Wines whose current balance has fallen below their configured threshold. */
  listInventoryAlerts(): Promise<InventoryAlert[]>
  /** One entry per (wine, missing field) - see src/utils/dataQuality.ts for the tracked-fields list. */
  listDataQualityAlerts(): Promise<DataQualityAlert[]>
  listThresholds(): Promise<WineAlertThreshold[]>
  /** Creates or updates the one threshold a wine can have, reactivating it if it was deactivated. */
  setThreshold(wineId: string, minBottles: number): Promise<WineAlertThreshold>
  /** Pauses or resumes an existing threshold without losing its configured level - inactive thresholds are excluded from listInventoryAlerts(). */
  setThresholdActive(wineId: string, active: boolean): Promise<WineAlertThreshold>
  deleteThreshold(wineId: string): Promise<void>
  /** Sales whose volume falls outside the single global min/max configured via setSalesAlertThreshold. */
  listSalesQualityAlerts(): Promise<SalesQualityAlert[]>
  getSalesAlertThreshold(): Promise<SalesAlertThreshold>
  setSalesAlertThreshold(input: SalesAlertThreshold): Promise<SalesAlertThreshold>
}

export interface PourSizeService {
  list(options?: ListOptions): Promise<PourSize[]>
  get(id: string): Promise<PourSize | null>
  create(input: { name: string; volumeMl: number }): Promise<PourSize>
  update(id: string, input: { name: string; volumeMl: number }): Promise<PourSize>
  setActive(id: string, active: boolean): Promise<PourSize>
  /** Permanently removes a pour size that has never been used in a sale. Throws if it has sale history - deactivate instead. */
  delete(id: string): Promise<void>
}

export interface SaleService {
  list(wineId: string): Promise<WineSale[]>
  /**
   * Records a manual sale. Exactly one of pourSizeId or volumeMl is expected:
   * a named pour size resolves its own per-unit ml, otherwise volumeMl is used
   * directly (a full-bottle or custom-ml entry). `quantity` is how many of
   * that unit were sold - e.g. 3 glasses in one entry - and defaults to 1.
   */
  create(input: {
    wineId: string
    soldAt: string
    pourSizeId?: string | null
    volumeMl?: number
    quantity?: number
    /** Total dollar amount for this entry (not per-unit). Optional - null when not tracked. */
    amount?: number | null
  }): Promise<WineSale>
  /** Corrects a manually-entered sale after the fact. Same shape/semantics as create - the wine a sale belongs to can't be changed, only re-entered (delete + create). */
  update(
    id: string,
    input: { soldAt: string; pourSizeId?: string | null; volumeMl?: number; quantity?: number; amount?: number | null },
  ): Promise<WineSale>
  delete(id: string): Promise<void>
}

export interface OpenAiExtractedLine {
  itemNameRaw: string
  volumeMlRaw: number | null
  categoryRaw: WineCategory | null
  /** Only meaningful when categoryRaw is 'wine'. */
  styleRaw: WineStyle | null
  /** Only meaningful when categoryRaw is 'wine'. */
  countryRaw: WineCountry | null
  quantity: number
  unitPrice: number
  lineTotal: number
  packSize: number
}

export interface OpenAiService {
  /** Sends an image to OpenAI for invoice-field extraction, logging the request/response/cost for the Settings debug page. */
  extractInvoice(input: { fileName: string; imageDataUrl: string; invoiceId?: string }): Promise<{
    vendorNameRaw: string
    invoiceDate: string | null
    totalAmount: number
    lines: OpenAiExtractedLine[]
    additionalCharges: AdditionalCharge[]
  }>
  /** Sends 1-3 photos of a single bottle to OpenAI for label extraction, logging the request/response/cost the same way extractInvoice does. */
  extractWine(input: { imageDataUrls: string[] }): Promise<{
    name: string | null
    volumeMl: number | null
    category: WineCategory | null
  }>
  listLogs(): Promise<OpenAiRequestLog[]>
}

export interface Services {
  auth: AuthService
  wines: WineService
  vendors: VendorService
  invoices: InvoiceService
  openai: OpenAiService
  alerts: AlertService
  pourSizes: PourSizeService
  sales: SaleService
}
