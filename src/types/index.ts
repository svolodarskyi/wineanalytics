export type Confidence = 'high' | 'medium' | 'low'

export type MatchStatus = 'suggested' | 'confirmed' | 'changed' | 'unresolved'

export type InvoiceStatus = 'processing' | 'not_approved' | 'approved'

export interface Wine {
  id: string
  name: string
  country: string | null
  /** Data URL of an uploaded label/bottle photo, if any. */
  imageDataUrl: string | null
  active: boolean
  createdAt: string
}

export interface Vendor {
  id: string
  name: string
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
  quantity: number
  unitPrice: number
  lineTotal: number
  skuMatch: SkuMatch
}

export interface ExtractedInvoiceData {
  invoiceDate: string | null
  totalAmount: number | null
  vendorMatch: VendorMatch
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
