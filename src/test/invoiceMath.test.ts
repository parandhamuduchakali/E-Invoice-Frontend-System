import { describe, expect, it } from "vitest";
import { computeTotals, isIntraState, priceItem } from "@/lib/invoiceMath";

const items = [
  { description: "Consulting", quantity: 2, unit_price: 100, gst_rate: null },
  { description: "Widget", quantity: 1, unit_price: 50, gst_rate: null },
];

describe("invoice totals preview (mirrors backend invoice_service)", () => {
  it("splits tax into CGST + SGST for intra-state supplies", () => {
    const t = computeTotals(items, 10, 0, true);
    expect(t.subtotal).toBe(250);
    expect(t.cgst_amount).toBe(12.5);
    expect(t.sgst_amount).toBe(12.5);
    expect(t.igst_amount).toBe(0);
    expect(t.tax_amount).toBe(25);
    expect(t.total).toBe(275);
    expect(t.items[0]).toMatchObject({ taxable_value: 200, cgst_amount: 10, sgst_amount: 10, total_amount: 220 });
  });

  it("uses IGST for inter-state supplies", () => {
    const t = computeTotals(items, 10, 0, false);
    expect(t.igst_amount).toBe(25);
    expect(t.cgst_amount).toBe(0);
    expect(t.total).toBe(275);
  });

  it("applies item rate, item discount, and invoice discount", () => {
    const t = computeTotals(
      [
        { description: "18%", quantity: 1, unit_price: 100, gst_rate: 18 },
        { description: "default, discounted", quantity: 1, unit_price: 100, discount: 10 },
      ],
      10,
      5,
      false,
    );
    expect(t.items[0]).toMatchObject({ igst_amount: 18, total_amount: 118 });
    expect(t.items[1]).toMatchObject({ taxable_value: 90, igst_amount: 9, total_amount: 99 });
    expect(t.tax_amount).toBe(27);
    expect(t.total).toBe(190 + 27 - 5);
  });

  it("rounds like the backend", () => {
    expect(priceItem({ description: "x", quantity: 3, unit_price: 33.335 }, 18, true).amount).toBe(100.01);
  });

  it("decides intra vs inter state including SEZ/export overrides", () => {
    const base = { sellerStateCode: "27", placeOfSupply: "27", igstOnIntra: false } as const;
    expect(isIntraState({ ...base, supplyType: "B2B" })).toBe(true);
    expect(isIntraState({ ...base, supplyType: "B2B", igstOnIntra: true })).toBe(false);
    expect(isIntraState({ ...base, supplyType: "SEZWP" })).toBe(false);
    expect(isIntraState({ ...base, supplyType: "EXPWOP" })).toBe(false);
    expect(isIntraState({ ...base, supplyType: "B2B", placeOfSupply: "07" })).toBe(false);
    expect(isIntraState({ ...base, supplyType: "B2B", sellerStateCode: null })).toBe(false);
  });
});
