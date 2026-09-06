import { describe, expect, it } from "vitest";
import type { ExtractedInvoiceFields, User } from "@/api/types";
import { ocrToInvoiceDraft } from "@/lib/ocrToInvoice";

// Exactly what the backend returned for the real sample_invoice.pdf.
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
  key_values: { "invoice serial number": ["234694KF48"] },
};

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

  it("falls back to today when no date was read and flags services by SAC prefix", () => {
    const { invoice } = ocrToInvoiceDraft({ ...FIELDS, dates: [], hsn_codes: ["998311"], total_amount: null, gst_rates: [] }, null);
    expect(invoice.issue_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(invoice.line_items![0]).toMatchObject({ hsn_code: "998311", is_service: true, unit_price: 0 });
    expect(invoice.tax_rate).toBeUndefined();
  });
});
