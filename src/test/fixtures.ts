/** Shared builders for test fixtures that mirror backend response shapes. */

import type { ExtractedParty, StructuredInvoice } from "@/api/types";

const emptyParty = (): ExtractedParty => ({
  legal_name: null,
  trade_name: null,
  gstin: null,
  address: null,
  place: null,
  state: null,
  state_code: null,
  pincode: null,
});

/**
 * A structured block with nothing read from the document.
 *
 * The backend always returns this object, so the type requires it; tests that
 * are about something else (the item table, the draft mapping) say so by
 * handing over an empty one rather than by omitting the field.
 */
export const emptyStructured = (): StructuredInvoice => ({
  document: {
    document_type: null,
    document_type_label: null,
    document_number: null,
    document_date: null,
    preceding_invoice_number: null,
    preceding_invoice_date: null,
    irn: null,
    ack_no: null,
    ack_date: null,
    supply_type: null,
    is_service: null,
    place_of_supply: null,
    place_of_supply_code: null,
    reverse_charge: null,
    currency: null,
  },
  supplier: emptyParty(),
  recipient: emptyParty(),
  shipping: emptyParty(),
  dispatch: emptyParty(),
  totals: {
    assessable_value: null,
    igst_value: null,
    cgst_value: null,
    sgst_value: null,
    total_invoice_value: null,
    round_off: null,
  },
  warnings: [],
  evidence: [],
});
