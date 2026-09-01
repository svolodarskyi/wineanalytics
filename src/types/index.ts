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
  /** purchased (approved invoices) minus sold-bottle-equivalent (Σ sale volume_ml * quantity / wine.volumeMl). Can be fractional, and can be negative if oversold. */
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

/** A configured "alert me when this wine's balance falls below N bottles" rule. One per wine at most. Deactivating pauses it without losing the configured level - use delete to remove it entirely. */
export interface WineAlertThreshold {
  id: string
  wineId: string
  minBottles: number
  active: boolean
  createdAt: string
}

/** A wine whose current balance has fallen below its configured threshold. */
export interface InventoryAlert {
  wine: Wine
  balanceInBottles: number
  minBottles: number
}

/** Wine fields checked for completeness - see src/utils/dataQuality.ts for the tracked-fields list. */
export type DataQualityField = 'country' | 'volumeMl' | 'category'

/** One missing field on one wine - each gets its own alert row, not grouped by wine. */
export interface DataQualityAlert {
  wine: Wine
  field: DataQualityField
}

/**
 * Global, shared across every wine for now - "glass" and "taste" mean the
 * same ml regardless of which wine is poured. Revisit if some wines
 * genuinely need their own pour sizes later.
 */
export interface PourSize {
  id: string
  name: string
  volumeMl: number
  active: boolean
  createdAt: string
}

export type SaleSource = 'manual' | 'pos'

/**
 * One recorded sale, in canonical milliliters regardless of how it was
 * entered (a pour size, a full bottle, or a raw ml override) - so ending
 * balance math never has to branch on unit. `source` distinguishes manual
 * demo entries from a future real POS feed once that exists.
 *
 * `volumeMl` is the per-unit volume (one glass, one bottle, one custom pour);
 * `quantity` is how many of that unit were sold in this one record - e.g.
 * "3 glasses" is a single WineSale with volumeMl: 150, quantity: 3, not three
 * separate rows. Total volume sold by this record is volumeMl * quantity.
 */
export interface WineSale {
  id: string
  wineId: string
  /** Null when volumeMl was entered directly (full bottle or custom ml) rather than via a named pour size. */
  pourSizeId: string | null
  volumeMl: number
  quantity: number
  /** Total dollar amount for this entry (not per-unit) - null when not entered, e.g. a manual demo sale where the price wasn't tracked. */
  amount: number | null
  soldAt: string
  source: SaleSource
  createdAt: string
}

/** Single global config, not per-wine - flags any sale whose volume falls outside these bounds. Null bound = unbounded on that side. */
export interface SalesAlertThreshold {
  minVolumeMl: number | null
  maxVolumeMl: number | null
}

export type SalesQualityReason = 'below_minimum' | 'above_maximum'

/** One sale flagged by the configured min/max volume threshold. */
export interface SalesQualityAlert {
  sale: WineSale
  wine: Wine
  reason: SalesQualityReason
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
