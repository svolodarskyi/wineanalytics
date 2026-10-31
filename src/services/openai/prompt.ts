/**
 * Kept in its own file so the wording can be iterated on without touching
 * the call/parsing code in client.ts.
 */
export const INVOICE_EXTRACTION_PROMPT = `You are extracting structured data from a photo or scan of a beverage distributor invoice - wine, beer, spirits, cider, or non-alcoholic drinks.

Read the image carefully and return a single JSON object with exactly this shape:

{
  "vendorName": string,
  "invoiceDate": string | null,   // ISO 8601 date (YYYY-MM-DD) if visible, else null
  "totalAmount": number,          // the invoice's total amount due, 0 if not visible
  "lineItems": [
    {
      "itemName": string,        // the product name as printed, do not normalize or translate it - do NOT include the bottle/can size or pack size here, those go in "volumeMl" and "packSize"
      "volumeMl": number | null, // bottle/can size in milliliters - convert whatever unit is printed (750ml -> 750, 1.5L -> 1500, 375ml -> 375, a 25.4oz bottle -> 750, a 12oz can -> 355) - null if not shown
      "category": "red" | "white" | "rose" | "sparkling" | "dessert" | "fortified" | "beer" | "spirits" | "cider" | "non_alcoholic" | "other" | null,
      "quantity": number,        // how many of what's printed on this line - a pack/case count if the line is sold as packs (see packSize), not the total number of individual bottles/cans
      "unitPrice": number,       // price for one "quantity" unit as printed - a pack's price if this line is a pack, not a single bottle/can's price
      "lineTotal": number,
      "packSize": number         // units (bottles/cans) per pack/case as printed, e.g. a "6-PACK" or "CASE/24" line is 6 or 24 - 1 if the line is sold individually or no pack size is shown
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
- If a field cannot be determined from the image, use null for strings/dates, 0 for numbers, 1 for packSize, and [] for lineItems/additionalCharges.
- Preserve item names exactly as printed on the invoice, including vintage years if shown, but leave the
  bottle/can size and pack size out of itemName - put them in "volumeMl" and "packSize" instead.
- Infer "category" from the product name and any label details visible (e.g. "Cabernet Sauvignon" is red,
  "Sauvignon Blanc" is white, "Champagne"/"Prosecco"/"Brut" is sparkling, "IPA"/"Lager"/"Ale" is beer,
  "Vodka"/"Whiskey"/"Tequila" is spirits, sodas/juices/mixers with no alcohol are non_alcoholic). Use null
  only if you genuinely cannot tell - do not guess "other" as a default.
- lineItems is for every beverage product being purchased, not just wine - beer, spirits, cider, mixers,
  and non-alcoholic drinks all belong here too. Put every other charge or adjustment on the invoice - tax,
  GST/VAT, bottle/case deposits, shipping, fuel surcharges, fees, discounts, credits - into
  additionalCharges instead, never into lineItems. Use a negative amount for discounts/credits.
- Numbers must be plain JSON numbers (no currency symbols, no thousands separators).`

export const WINE_SCAN_PROMPT = `You are extracting structured data from 1-3 photos of a single wine bottle (front label, back label, and/or the bottle overall).

Read every image together as one wine, not separate items, and return a single JSON object with exactly this shape:

{
  "name": string | null,      // the wine's own name as printed, e.g. "Cabernet Sauvignon" or a proprietary name like "Insignia" - do NOT include the producer/winery name here
  "volumeMl": number | null,  // bottle size in milliliters - convert whatever unit is printed (750ml -> 750, 1.5L -> 1500, a 25.4oz bottle -> 750) - if no size is visible, default to 750 (the standard bottle size) rather than null
  "category": "red" | "white" | "rose" | "sparkling" | "dessert" | "fortified" | "beer" | "spirits" | "cider" | "non_alcoholic" | "other" | null
}

Rules:
- Output ONLY the JSON object. No markdown fences, no commentary, no explanation.
- If a field genuinely cannot be determined from the images, use null - do not guess a value you can't support from what's visible.
- Infer "category" from the grape variety, label wording, and bottle appearance (e.g. "Cabernet Sauvignon" is red, "Sauvignon Blanc" is white, "Champagne"/"Prosecco"/"Brut" is sparkling, "Port"/"Sherry" is fortified, "IPA"/"Lager"/"Ale" is beer, "Vodka"/"Whiskey"/"Tequila" is spirits). Use null only if you genuinely cannot tell - do not default to "other".`
