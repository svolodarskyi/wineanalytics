# Wine Purchasing MVP

## 1. Objective

Build a simple wine purchasing system for **one restaurant**.

The MVP proves one core workflow:

**Upload invoice → OCR → Match → Confirm/Change → Approve → View wine balance and purchase history**

The goal is to validate the workflow before adding more advanced functionality.

---

# 2. Application Structure

The application has three main areas:

1. **Wine Inventory**
2. **Invoices**
3. **Settings**

Settings contains:

- Wine SKUs
- Vendors

Authentication uses **Supabase Auth**.

---

# 3. Invoices

## Upload

Users can upload:

- Image
- PDF

For the MVP, invoices are uploaded **one at a time**.

Processing starts automatically after upload.

---

## OCR

OpenAI is used for OCR/extraction.

The system extracts:

### Invoice

- Invoice/receipt date
- Vendor
- Total amount
- Other useful invoice metadata when available

### Line items

- Item name
- Quantity
- Unit price
- Line total

The original uploaded document is stored.

---

## Vendor Matching

The extracted vendor is matched against the vendor master using OpenAI.

The user can:

- Confirm the suggested vendor
- Change the vendor

Matching confidence is displayed as:

- High
- Medium
- Low

If the vendor does not exist, the invoice can remain unresolved and the vendor can be created later from **Settings → Vendors**.

---

## Wine SKU Matching

Each invoice line is matched against the existing wine SKU master.

The MVP SKU contains only:

- Item name
- Active/inactive status

OpenAI suggests a matching SKU.

The user sees:

- Suggested SKU
- Confidence: High / Medium / Low
- Confirm
- Change

If the match is incorrect, the user can search or browse the wine master and select another SKU.

If no SKU exists, the invoice can remain unresolved. The user creates the wine from **Settings → Wine** and then returns to the invoice.

---

# 4. Invoice Review

After OCR and matching, the user reviews the invoice.

The screen shows:

- Original invoice/receipt
- Extracted information
- Vendor match
- Wine line items
- Suggested SKU matches

The user can confirm or change vendor/SKU matches.

The MVP keeps the review process simple.

---

# 5. Invoice Status

Invoices are separated into:

- **Not Approved**
- **Approved**

If the user leaves an invoice before approving it, it remains **Not Approved**.

The invoice can be returned to later for review.

Once approved, its purchases are included in Wine Inventory.

---

# 6. Wine Inventory

Wine Inventory is the main page.

The main list contains:

| Wine   | Balance in Bottles |
| ------ | -----------------: |
| Wine A |                 24 |
| Wine B |                 12 |

### Balance

**Balance in bottles = total quantity purchased from approved invoices.**

There are no POS deductions or physical inventory counts in the MVP.

If there are unapproved invoices, the page can show a simple notification that invoices are waiting for approval.

---

# 7. Wine Purchase History

Clicking a wine opens its details.

Show:

### Current balance

- Balance in bottles

### Purchase history

Each purchase contains:

- Date
- Vendor
- Quantity
- Unit price
- Invoice reference

The invoice reference allows the user to access the associated invoice/document.

---

# 8. Settings

## Wine SKUs

Users can:

- Search wines
- Create wine
- Edit wine
- Activate/deactivate wine

Wine SKU for MVP:

```text
Item name
Active / Inactive
```

Wines are **not deleted**.

Deactivated wines remain available in historical purchase records.

---

## Vendors

Users can:

- Search vendors
- Create vendor
- Edit vendor
- Activate/deactivate vendor

Vendor for MVP:

```text
Vendor name
Active / Inactive
```

Vendors are **not deleted**.

Deactivated vendors remain available in historical records.

---

# 9. MVP User Flow

```text
User
  │
  ▼
Invoices
  │
  ├── Upload image/PDF
  │
  ▼
Automatic OCR
  │
  ▼
Vendor + Wine SKU matching
  │
  ▼
Review
  │
  ├── Confirm match
  └── Change match
  │
  ▼
Approve
  │
  ▼
Wine Inventory updated
  │
  ▼
Wine
  │
  ├── Current bottle balance
  └── Purchase history
```

---

# 10. Explicitly Out of Scope

The following are **not part of the MVP**:

- POS integration
- Sales data
- COGS
- Margins
- Advanced analytics
- Dashboard
- Physical inventory counts
- Inventory depletion from sales
- Complex permissions/roles
- Audit history
- Advanced wine attributes
- Batch upload
- Advanced OCR correction
- Average purchase price
- Weighted-average costing

---

# 11. MVP Success Criteria

The MVP should prove that a restaurant can:

1. Upload a real wine invoice.
2. Automatically extract the invoice information.
3. Automatically match vendors and wines.
4. Quickly confirm or correct the matches.
5. Approve the invoice.
6. See the resulting wine balance.
7. Open a wine and see its purchase history.

**Core value proposition:**

> **Turn a wine invoice into usable purchasing and inventory history with minimal manual entry.**
