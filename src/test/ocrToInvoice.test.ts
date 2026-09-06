import { describe, expect, it } from "vitest";
import type { ExtractedInvoiceFields, ExtractedLineItem, User } from "@/api/types";
import { emptyStructured } from "./fixtures";
import { ocrToInvoiceDraft } from "@/lib/ocrToInvoice";

// Shaped like the backend's response for s_data/sample_invoice.pdf, with GSTINs
// ADDED so this test can exercise buyer-candidate filtering.
//
// The real document returns `gstins: []` — all three GSTINs on it are redacted
// (grey boxes), which eval/golden/sample_invoice.json records as the correct
// answer. Do not read these values as recorded output.
const FIELDS: ExtractedInvoiceFields = {
  gstins: ["27AAPFU0939F1ZV", "07AAGFF2194N1Z1"],
  invalid_gstins: ["27AAPFU0939F1ZX"],
  invoice_numbers: ["234694KF48"],
  dates: ["2020-07-02"],
  amounts: [6400, 10000],
  total_amount: 10000,
  hsn_codes: ["9401"],
  gst_rates: [6, 0],
  irn: "def8077c6256c7742085a71875aad0d79207b2e260581875307d2cd519a7e57f",
  place_of_supply: "Karnataka",
  place_of_supply_code: "29",
  state_codes: ["07", "29"],
  reverse_charge: false,
  currency: "INR",
  // The sample is a PDF text layer, so no box positions and no table grid.
  line_items: [],
  key_values: { "invoice serial number": ["234694KF48"] },
  structured: emptyStructured(),
};

const row = (over: Partial<ExtractedLineItem>): ExtractedLineItem => ({
  description: "", hsn_code: null, quantity: null, unit: null,
  unit_price: null, discount: null, gst_rate: null, amount: null,
  confidence: 0.99, warnings: [], ...over,
});

const seller = { gstin: "27AAPFU0939F1ZV", state_code: "27" } as unknown as User;

describe("ocrToInvoiceDraft", () => {
  it("maps dates, place of supply, rate, HSN lines and notes", () => {
    const { invoice, buyerGstinCandidates, notes, sourceInvoiceNumber } = ocrToInvoiceDraft(FIELDS, seller);
    expect(invoice.issue_date).toBe("2020-07-02");
    expect(invoice.due_date).toBe("2020-08-01");
    expect(invoice.place_of_supply).toBe("29");
    expect(invoice.reverse_charge).toBe(false);
    expect(invoice.tax_rate).toBe(6);
    expect(invoice.line_items).toHaveLength(1);
    expect(invoice.line_items![0]).toMatchObject({ hsn_code: "9401", is_service: false, quantity: 1 });
    // 10,000 total backed out of 6% tax → 9433.96 net
    expect(invoice.line_items![0].unit_price).toBeCloseTo(9433.96, 2);
    expect(invoice.source_reference).toBe("234694KF48");
    expect(invoice.notes).toContain(FIELDS.irn!);
    expect(sourceInvoiceNumber).toBe("234694KF48");
    // Seller's own GSTIN is excluded from buyer candidates.
    expect(buyerGstinCandidates).toEqual(["07AAGFF2194N1Z1"]);
    expect(notes.some((n) => n.includes("check digit failed"))).toBe(true);
  });

  it("uses the item table's own rows when the backend recovered them", () => {
    const fields: ExtractedInvoiceFields = {
      ...FIELDS,
      total_amount: 37000.5,
      line_items: [
        row({ description: "Consulting services", hsn_code: "998314", quantity: 10, unit: "NOS", unit_price: 1500, gst_rate: 18, amount: 15000 }),
        row({ description: "Annual maintenance", hsn_code: "998719", quantity: 1, unit_price: 22000.5, gst_rate: 18, amount: 22000.5 }),
      ],
    };
    const { invoice, notes } = ocrToInvoiceDraft(fields, seller);

    expect(invoice.line_items).toHaveLength(2);
    expect(invoice.line_items![0]).toMatchObject({
      description: "Consulting services", hsn_code: "998314", is_service: true,
      unit: "NOS", quantity: 10, unit_price: 1500, gst_rate: 18,
    });
    expect(invoice.line_items![1].unit_price).toBe(22000.5);
    expect(notes.some((n) => n.includes("2 line item(s) read"))).toBe(true);
    // The rows reconcile with the printed total, so no warning.
    expect(notes.some((n) => n.includes("add up to"))).toBe(false);
  });

  it("derives a missing unit price from the row amount", () => {
    const fields: ExtractedInvoiceFields = {
      ...FIELDS,
      line_items: [row({ description: "Freight", quantity: 4, amount: 500 })],
    };
    const { invoice } = ocrToInvoiceDraft(fields, seller);
    expect(invoice.line_items![0].unit_price).toBe(125);
  });

  it("warns when the rows do not add up to the printed total", () => {
    const fields: ExtractedInvoiceFields = {
      ...FIELDS,
      total_amount: 99999,
      line_items: [row({ description: "Consulting", quantity: 1, unit_price: 100, amount: 100 })],
    };
    const { notes } = ocrToInvoiceDraft(fields, seller);
    expect(notes.some((n) => n.includes("add up to 100") && n.includes("99999"))).toBe(true);
  });

  it("falls back to today when no date was read and flags services by SAC prefix", () => {
    const { invoice } = ocrToInvoiceDraft({ ...FIELDS, dates: [], hsn_codes: ["998311"], total_amount: null, gst_rates: [], line_items: [] }, null);
    expect(invoice.issue_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(invoice.line_items![0]).toMatchObject({ hsn_code: "998311", is_service: true, unit_price: 0 });
    expect(invoice.tax_rate).toBeUndefined();
  });
});
