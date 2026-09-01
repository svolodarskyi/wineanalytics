import type {
  AuthUser,
  Invoice,
  InvoiceStatus,
  PurchaseHistoryEntry,
  Vendor,
  Wine,
  WineBalance,
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
  create(input: { name: string; country?: string | null; imageDataUrl?: string | null }): Promise<Wine>
  update(id: string, input: { name: string; country?: string | null; imageDataUrl?: string | null }): Promise<Wine>
  setActive(id: string, active: boolean): Promise<Wine>
  /** Permanently removes a wine that has never appeared on any invoice. Throws if it has purchase history - deactivate instead. */
  delete(id: string): Promise<void>
  getBalances(): Promise<WineBalance[]>
  getPurchaseHistory(id: string): Promise<PurchaseHistoryEntry[]>
}

export interface VendorService {
  list(options?: ListOptions): Promise<Vendor[]>
  get(id: string): Promise<Vendor | null>
  create(input: { name: string }): Promise<Vendor>
  update(id: string, input: { name: string }): Promise<Vendor>
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
  /** Approves the invoice, folding its line items into wine balances. */
  approve(invoiceId: string): Promise<Invoice>
}

export interface AuthService {
  getCurrentUser(): Promise<AuthUser | null>
  login(email: string, password: string): Promise<AuthUser>
  logout(): Promise<void>
}

export interface Services {
  auth: AuthService
  wines: WineService
  vendors: VendorService
  invoices: InvoiceService
}
