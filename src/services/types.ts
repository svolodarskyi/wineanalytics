import type {
  AdditionalCharge,
  AuthUser,
  DataQualityAlert,
  Invoice,
  InventoryAlert,
  InvoiceStatus,
  OpenAiRequestLog,
  PurchaseHistoryEntry,
  Vendor,
  Wine,
  WineAlertThreshold,
  WineBalance,
  WineCategory,
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
    country?: string | null
    volumeMl?: number | null
    category?: WineCategory | null
    imageDataUrl?: string | null
  }): Promise<Wine>
  update(
    id: string,
    input: {
      name: string
      invoiceName?: string | null
      country?: string | null
      volumeMl?: number | null
      category?: WineCategory | null
      imageDataUrl?: string | null
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
  /** Corrects the extracted invoice date by hand, e.g. when OCR missed or misread it. */
  updateInvoiceDate(invoiceId: string, invoiceDate: string | null): Promise<Invoice>
  /** Approves the invoice, folding its line items into wine balances. */
  approve(invoiceId: string): Promise<Invoice>
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
  /** Creates or updates the one threshold a wine can have. */
  setThreshold(wineId: string, minBottles: number): Promise<WineAlertThreshold>
  deleteThreshold(wineId: string): Promise<void>
}

export interface OpenAiExtractedLine {
  itemNameRaw: string
  volumeMlRaw: number | null
  categoryRaw: WineCategory | null
  quantity: number
  unitPrice: number
  lineTotal: number
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
  listLogs(): Promise<OpenAiRequestLog[]>
}

export interface Services {
  auth: AuthService
  wines: WineService
  vendors: VendorService
  invoices: InvoiceService
  openai: OpenAiService
  alerts: AlertService
}
