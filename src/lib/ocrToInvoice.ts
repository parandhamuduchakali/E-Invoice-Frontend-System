/**
 * Turns the backend's OCR `extracted_fields` into a partial invoice draft the
 * invoice form can be pre-filled with.  Everything is a hint; the user
 * reviews before saving.
 */

import type { ExtractedInvoiceFields, InvoiceCreateRequest, LineItemInput, User } from "@/api/types";
import { addDaysIso, todayIso } from "./format";
import { toGstRate, toUqc } from "./gst";
import { round2 } from "./invoiceMath";

export interface OcrInvoiceDraft {
  invoice: Partial<InvoiceCreateRequest>;
  /** GSTINs found on the document that are not the seller's own — likely the buyer. */
  buyerGstinCandidates: string[];
  /** Human-readable notes about what was and was not mapped. */
  notes: string[];
  /** Document number printed on the scanned invoice (ours are generated, so it goes to notes). */
  sourceInvoiceNumber: string | null;
}

/**
 * The rate for the invoice as a whole, and how it was arrived at.
 *
 * Preference order: the printed totals, which state the tax and the value it
 * was charged on; then the item rates, doubling a half where the document
 * clearly split CGST and SGST; then nothing. Only real GST slabs are returned —
 * a number that is not one is reported for the user to set by hand rather than
 * put into the form, where it would be shown as something else entirely.
 */
function documentGstRate(fields: ExtractedInvoiceFields): { value: number | null; note: string } {
  const totals = fields.structured?.totals;
  const base = totals?.assessable_value ?? null;
  if (base && base > 0) {
    const tax = (totals?.igst_value ?? 0) + (totals?.cgst_value ?? 0) + (totals?.sgst_value ?? 0);
    if (tax > 0) {
      const snapped = toGstRate(round2((tax / base) * 100));
      if (snapped !== null) {
        return { value: snapped, note: `GST rate ${snapped}% derived from the printed tax and taxable value.` };
      }
    }
  }

  const rates = (fields.gst_rates ?? []).filter((r) => r > 0);
  if (!rates.length) return { value: null, note: "" };
  const highest = Math.max(...rates);

  // Two equal halves, or a half that is not itself a slab while twice it is:
  // both mean the document printed CGST and SGST separately.
  const splitPrinted = (totals?.cgst_value ?? 0) > 0 && (totals?.sgst_value ?? 0) > 0;
  const doubled = toGstRate(round2(highest * 2));
  if ((splitPrinted || toGstRate(highest) === null) && doubled !== null) {
    return {
      value: doubled,
      note: `GST rate ${doubled}% (the document prints it as two halves of ${highest}%).`,
    };
  }

  const snapped = toGstRate(highest);
  if (snapped !== null) return { value: snapped, note: `GST rate ${snapped}% detected.` };
  return { value: null, note: "" };
}

export function ocrToInvoiceDraft(fields: ExtractedInvoiceFields, seller: User | null, documentId: number | null = null): OcrInvoiceDraft {
  const notes: string[] = [];
  const invoice: Partial<InvoiceCreateRequest> = {};

  if (documentId) {
    // Links the invoice to the stored upload so the scan can be traced later.
    invoice.document_id = documentId;
    notes.push(`Linked to stored document #${documentId}.`);
  }

  // What the document *is* decides what to make of it. Credit and debit notes
  // go down the CRN/DBN path, which needs the invoice they refer to; anything
  // that is not an invoice at all still gets a draft — the fields were read —
  // but the first note says so, and the Documents page will have warned.
  const kind = fields.classification;
  if (kind && kind.document_type && kind.document_type !== "INV") {
    invoice.document_type = kind.document_type;
    const preceding = fields.structured.document.preceding_invoice_number;
    const precedingDate = fields.structured.document.preceding_invoice_date;
    if (preceding) invoice.preceding_invoice_number = preceding;
    if (precedingDate) invoice.preceding_invoice_date = precedingDate;
    notes.push(
      `Recognised as a ${kind.label.toLowerCase()} (${kind.document_type}). ` +
        (preceding
          ? `It refers to invoice ${preceding}${precedingDate ? ` of ${precedingDate}` : ""}.`
          : "Enter the invoice it refers to — a note cannot be filed without it."),
    );
  } else if (kind && !kind.invoice_like) {
    notes.unshift(
      `This was recognised as a ${kind.label.toLowerCase()}, not a tax invoice. ` +
        "The values below were still read from it, but they do not describe a supply you made — do not save this unless you are sure.",
    );
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

  // Default GST rate. An intra-state invoice prints the tax as two halves —
  // "CGST 9% / SGST 9%" — and the invoice's rate is their sum, not the larger
  // half. Taking the maximum would file every such invoice at half the tax.
  const rate = documentGstRate(fields);
  if (rate.value !== null) {
    invoice.tax_rate = rate.value;
    notes.push(rate.note);
  }

  // Line items, best source first.
  //
  // When the OCR engine returned box positions, the backend rebuilds the item
  // table's grid and reads each row's own quantity, rate and HSN — so the draft
  // is the document's actual lines. Without positions (a PDF text layer, or
  // LlamaParse) there is nothing to attribute amounts to, and the old estimate
  // stands in: one line per HSN code with the total spread evenly.
  if (fields.line_items.length) {
    invoice.line_items = fields.line_items.map<LineItemInput>((row, index) => ({
      description: row.description || `Item ${index + 1}`,
      hsn_code: row.hsn_code,
      is_service: row.hsn_code ? row.hsn_code.startsWith("99") : false,
      unit: toUqc(row.unit),
      quantity: row.quantity ?? 1,
      // Some invoices print only a row total; derive the rate from it.
      unit_price: row.unit_price ?? (row.amount !== null && row.quantity ? row.amount / row.quantity : (row.amount ?? 0)),
      discount: row.discount ?? 0,
      gst_rate: toGstRate(row.gst_rate),
    }));
    notes.push(`${fields.line_items.length} line item(s) read from the document's item table. Check the quantities and rates.`);

    const printed = fields.line_items.reduce((sum, row) => sum + (row.amount ?? 0), 0);
    if (printed > 0 && fields.total_amount && Math.abs(printed - fields.total_amount) > 1) {
      notes.push(
        `Line amounts add up to ${round2(printed)} but the document total reads ${fields.total_amount}. ` +
          "Taxes or a discount may not have been picked up — review before saving.",
      );
    }
  } else {
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
      unit_price: round2(perLineNet),
      discount: 0,
      gst_rate: null,
    }));
    if (fields.total_amount) {
      notes.push(`No item table could be read, so the document total ${fields.total_amount} was spread across ${hsnCodes.length} line(s); adjust quantities and prices.`);
    }
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
