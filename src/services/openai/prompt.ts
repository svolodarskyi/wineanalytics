/**
 * Kept in its own file so the wording can be iterated on without touching
 * the call/parsing code in client.ts.
 */
export const INVOICE_EXTRACTION_PROMPT = `You are extracting structured data from a photo or scan of a wine/liquor distributor invoice.

Read the image carefully and return a single JSON object with exactly this shape:

{
  "vendorName": string,
  "invoiceDate": string | null,   // ISO 8601 date (YYYY-MM-DD) if visible, else null
  "totalAmount": number,          // the invoice's total amount due, 0 if not visible
  "lineItems": [
    {
      "itemName": string,        // the wine/product name as printed, do not normalize or translate it
      "quantity": number,
      "unitPrice": number,
      "lineTotal": number
    }
  ],
  "additionalCharges": [
    {
      "description": string,    // e.g. "Sales Tax", "Bottle Deposit", "GST", "Shipping", "Fuel Surcharge", "Discount"
      "amount": number
    }
  ]
}

Rules:
- Output ONLY the JSON object. No markdown fences, no commentary, no explanation.
- If a field cannot be determined from the image, use null for strings/dates, 0 for numbers, and [] for lineItems/additionalCharges.
- Preserve item names exactly as printed on the invoice, including vintage years and bottle sizes if shown.
- lineItems is ONLY for wine/liquor products being purchased. Put every other charge or adjustment on the
  invoice - tax, GST/VAT, bottle/case deposits, shipping, fuel surcharges, fees, discounts, credits - into
  additionalCharges instead, never into lineItems. Use a negative amount for discounts/credits.
- Numbers must be plain JSON numbers (no currency symbols, no thousands separators).`
