export type Confidence = 'high' | 'medium' | 'low'

export type MatchStatus = 'suggested' | 'confirmed' | 'changed' | 'unresolved'

export type InvoiceStatus = 'processing' | 'not_approved' | 'approved'

export type WineCategory = 'red' | 'white' | 'rose' | 'sparkling' | 'dessert' | 'fortified' | 'other'

export interface Wine {
  id: string
  name: string
  /** Name as it typically appears on vendor invoices, if different from the display name. Falls back to `name` for matching when unset. */
  invoiceName: string | null
  country: string | null
  /** Bottle size in milliliters, e.g. 750, 1500. The standard unit for inventory/volume math - never a formatted string. */
  volumeMl: number | null
  category: WineCategory | null
  /** Data URL of an uploaded label/bottle photo, if any. */
  imageDataUrl: string | null
  active: boolean
  createdAt: string
}

export interface Vendor {
  id: string
  name: string
  /** Name as it typically appears on invoices, if different from the display name. Falls back to `name` for matching when unset. */
  invoiceName: string | null
  active: boolean
  createdAt: string
}

export interface VendorMatch {
  vendorNameRaw: string
  vendorId: string | null
  confidence: Confidence | null
  status: MatchStatus
}

export interface SkuMatch {
  wineId: string | null
  confidence: Confidence | null
  status: MatchStatus
}

export interface InvoiceLineItem {
  id: string
  itemNameRaw: string
  /** Bottle size in milliliters, normalized from whatever unit the invoice printed - kept separate from itemNameRaw so it can pre-fill a new wine's `volumeMl` field. */
  volumeMlRaw: number | null
  /** Best-effort category guess from the item name, e.g. "red"/"white" - pre-fills a new wine's `category` field. */
  categoryRaw: WineCategory | null
  quantity: number
  unitPrice: number
  lineTotal: number
  skuMatch: SkuMatch
}

/** A charge on the invoice that isn't a wine/product line item - tax, deposits, GST, shipping, fees, etc. */
export interface AdditionalCharge {
  description: string
  amount: number
}

export interface ExtractedInvoiceData {
  invoiceDate: string | null
  totalAmount: number | null
  vendorMatch: VendorMatch
  additionalCharges: AdditionalCharge[]
}

export interface Invoice {
  id: string
  fileName: string
  fileType: 'image' | 'pdf'
  /** Data URL of the uploaded document, used to render the original in the review screen. */
  fileDataUrl: string
  uploadedAt: string
  status: InvoiceStatus
  approvedAt: string | null
  extracted: ExtractedInvoiceData
  lineItems: InvoiceLineItem[]
}

export interface WineBalance {
  wine: Wine
  balanceInBottles: number
}

export interface PurchaseHistoryEntry {
  invoiceId: string
  date: string | null
  vendorName: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

export interface AuthUser {
  id: string
  email: string
}

export interface OpenAiUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

/** One logged call to OpenAI for invoice image parsing, kept for the Settings debug page. */
export interface OpenAiRequestLog {
  id: string
  createdAt: string
  model: string
  fileName: string
  imageDataUrl: string
  /** Parsed JSON the model returned, or null if the call failed before a response was parsed. */
  responseJson: unknown
  usage: OpenAiUsage | null
  costUsd: number
  error: string | null
}
