/**
 * Live invoice totals for the form, mirroring `app/services/invoice_service.py`.
 *
 * The backend recomputes everything on save; this preview exists so the user
 * sees the tax split (CGST+SGST vs IGST) change as they edit.
 */

import type { LineItemInput, SupplyType } from "@/api/types";
import { IGST_ONLY_SUPPLY_TYPES } from "./gst";

export interface PricedItem {
  amount: number;
  taxable_value: number;
  gst_rate: number;
  igst_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  total_amount: number;
}

export interface InvoiceTotals {
  items: PricedItem[];
  subtotal: number;
  taxable: number;
  igst_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  tax_amount: number;
  total: number;
  intra_state: boolean;
}

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export function isIntraState(args: {
  supplyType: SupplyType;
  igstOnIntra: boolean;
  sellerStateCode: string | null | undefined;
  placeOfSupply: string | null | undefined;
}): boolean {
  if (IGST_ONLY_SUPPLY_TYPES.has(args.supplyType)) return false;
  if (args.igstOnIntra) return false;
  if (!args.sellerStateCode || !args.placeOfSupply) return false;
  return args.sellerStateCode === args.placeOfSupply;
}

export function priceItem(item: LineItemInput, defaultRate: number, intraState: boolean): PricedItem {
  const rate = item.gst_rate ?? defaultRate;
  const quantity = Number(item.quantity) || 0;
  const unitPrice = Number(item.unit_price) || 0;
  const discount = Number(item.discount) || 0;
  const amount = round2(quantity * unitPrice);
  const taxable = round2(amount - discount);
  const tax = round2((taxable * rate) / 100);
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  if (intraState) {
    cgst = round2(tax / 2);
    sgst = round2(tax - cgst);
  } else {
    igst = tax;
  }
  return {
    amount,
    taxable_value: taxable,
    gst_rate: rate,
    igst_amount: igst,
    cgst_amount: cgst,
    sgst_amount: sgst,
    total_amount: round2(taxable + tax),
  };
}

export function computeTotals(
  items: LineItemInput[],
  defaultRate: number,
  discount: number,
  intraState: boolean,
): InvoiceTotals {
  const priced = items.map((item) => priceItem(item, defaultRate, intraState));
  const sum = (key: keyof PricedItem) => round2(priced.reduce((acc, p) => acc + p[key], 0));
  const subtotal = sum("amount");
  const taxable = sum("taxable_value");
  const igst = sum("igst_amount");
  const cgst = sum("cgst_amount");
  const sgst = sum("sgst_amount");
  const tax = round2(igst + cgst + sgst);
  return {
    items: priced,
    subtotal,
    taxable,
    igst_amount: igst,
    cgst_amount: cgst,
    sgst_amount: sgst,
    tax_amount: tax,
    total: round2(taxable + tax - (Number(discount) || 0)),
    intra_state: intraState,
  };
}
