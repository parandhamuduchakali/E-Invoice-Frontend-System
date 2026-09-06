/**
 * Turns the backend's OCR `extracted_fields` into a partial invoice draft the
 * invoice form can be pre-filled with.  Everything is a hint; the user
 * reviews before saving.
 */

import type { ExtractedInvoiceFields, InvoiceCreateRequest, LineItemInput, User } from "@/api/types";
import { addDaysIso, todayIso } from "./format";

export interface OcrInvoiceDraft {
  invoice: Partial<InvoiceCreateRequest>;
  /** GSTINs found on the document that are not the seller's own — likely the buyer. */
  buyerGstinCandidates: string[];
  /** Human-readable notes about what was and was not mapped. */
  notes: string[];
  /** Document number printed on the scanned invoice (ours are generated, so it goes to notes). */
  sourceInvoiceNumber: string | null;
}

export function ocrToInvoiceDraft(fields: ExtractedInvoiceFields, seller: User | null, documentId: number | null = null): OcrInvoiceDraft {
  const notes: string[] = [];
  const invoice: Partial<InvoiceCreateRequest> = {};

  if (documentId) {
    // Links the invoice to the stored upload so the scan can be traced later.
    invoice.document_id = documentId;
    notes.push(`Linked to stored document #${documentId}.`);
  }

  // Dates: first date is usually the issue date; due date defaults to +30 days.
  const issue = fields.dates[0];
  if (issue) {
    invoice.issue_date = issue;
    invoice.due_date = fields.dates[1] && fields.dates[1] > issue ? fields.dates[1] : addDaysIso(issue, 30);
    notes.push(`Issue date ${issue} taken from the document.`);
  } else {
    invoice.issue_date = todayIso();
    invoice.due_date = addDaysIso(invoice.issue_date, 30);
  }

  if (fields.place_of_supply_code) {
    invoice.place_of_supply = fields.place_of_supply_code;
    notes.push(`Place of supply ${fields.place_of_supply_code} (${fields.place_of_supply ?? ""}).`);
  }

  if (fields.reverse_charge !== null) {
    invoice.reverse_charge = fields.reverse_charge;
  }

  // Default GST rate: the highest non-zero rate seen (item rates override per line).
  const rates = fields.gst_rates.filter((r) => r > 0);
  if (rates.length) {
    invoice.tax_rate = Math.max(...rates);
    notes.push(`GST rate ${invoice.tax_rate}% detected.`);
  }

  // One line item per HSN code; amounts cannot be attributed per line from a
  // flat text stream, so quantity 1 and the document total spread evenly.
  const hsnCodes = fields.hsn_codes.length ? fields.hsn_codes : [null];
  const perLine = fields.total_amount && hsnCodes.length ? fields.total_amount / hsnCodes.length : 0;
  const rate = invoice.tax_rate ?? 0;
  // Back out tax so the total after tax approximates the document total.
  const perLineNet = rate ? perLine / (1 + rate / 100) : perLine;
  invoice.line_items = hsnCodes.map<LineItemInput>((hsn, index) => ({
    description: hsn ? `Item ${index + 1} (HSN ${hsn})` : `Item ${index + 1}`,
    hsn_code: hsn,
    is_service: hsn ? hsn.startsWith("99") : false,
    quantity: 1,
    unit_price: Math.round(perLineNet * 100) / 100,
    discount: 0,
    gst_rate: null,
  }));
  if (fields.total_amount) {
    notes.push(`Document total ${fields.total_amount} spread across ${hsnCodes.length} line(s); adjust quantities and prices.`);
  }

  const sellerGstin = seller?.gstin?.toUpperCase() ?? null;
  const buyerGstinCandidates = fields.gstins.filter((g) => g.toUpperCase() !== sellerGstin);
  if (buyerGstinCandidates.length) {
    notes.push(`Buyer GSTIN candidate(s): ${buyerGstinCandidates.join(", ")}. Pick or create the matching client.`);
  }
  if (fields.invalid_gstins.length) {
    notes.push(`Unreadable GSTIN-like text (check digit failed): ${fields.invalid_gstins.join(", ")}.`);
  }

  const sourceInvoiceNumber = fields.invoice_numbers[0] ?? null;
  if (sourceInvoiceNumber) {
    // Stored on the invoice so the backend rejects a second import of the same document (409).
    invoice.source_reference = sourceInvoiceNumber;
    notes.push(`Source document number ${sourceInvoiceNumber} recorded; importing it again will be blocked.`);
  }
  if (fields.irn) invoice.notes = `Source IRN: ${fields.irn}`;

  return { invoice, buyerGstinCandidates, notes, sourceInvoiceNumber };
}
