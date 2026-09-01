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
      "itemName": string,        // the wine/product name as printed, do not normalize or translate it - do NOT include the bottle size here, it goes in "volume"
      "volume": string | null,   // bottle size as printed, e.g. "750ml", "1.5L", "375ml" - null if not shown
      "category": "red" | "white" | "rose" | "sparkling" | "dessert" | "fortified" | "other" | null,
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
- Preserve item names exactly as printed on the invoice, including vintage years if shown, but leave the
  bottle size out of itemName - put it in "volume" instead.
- Infer "category" from the wine/product name and any label details visible (e.g. "Cabernet Sauvignon" is
  red, "Sauvignon Blanc" is white, "Champagne"/"Prosecco"/"Brut" is sparkling). Use null only if you
  genuinely cannot tell - do not guess "other" as a default.
- lineItems is ONLY for wine/liquor products being purchased. Put every other charge or adjustment on the
  invoice - tax, GST/VAT, bottle/case deposits, shipping, fuel surcharges, fees, discounts, credits - into
  additionalCharges instead, never into lineItems. Use a negative amount for discounts/credits.
- Numbers must be plain JSON numbers (no currency symbols, no thousands separators).`
