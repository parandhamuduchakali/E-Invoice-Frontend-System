/**
 * Client-side GST helpers that mirror the backend's `app/core/gst.py`.
 *
 * The backend is the source of truth; these exist so forms can give instant
 * feedback (check digit, state match) before a round trip.
 */

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PINCODE_RE = /^[1-9][0-9]{5}$/;
const HSN_RE = /^[0-9]{4,8}$/;
const BASE36 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Mod-36 check character for the first 14 characters of a GSTIN. */
export function gstinCheckCharacter(firstFourteen: string): string {
  let total = 0;
  let factor = 1;
  for (const char of firstFourteen) {
    const code = BASE36.indexOf(char);
    const product = code * factor;
    total += Math.floor(product / 36) + (product % 36);
    factor = factor === 1 ? 2 : 1;
  }
  return BASE36[(36 - (total % 36)) % 36];
}

export interface GstinCheck {
  valid: boolean;
  normalised: string;
  stateCode: string | null;
  error: string | null;
}

export function checkGstin(raw: string): GstinCheck {
  const gstin = raw.trim().toUpperCase();
  if (!gstin) return { valid: false, normalised: gstin, stateCode: null, error: null };
  if (!GSTIN_RE.test(gstin)) {
    return {
      valid: false,
      normalised: gstin,
      stateCode: null,
      error: "GSTIN must be 15 characters: state code, PAN, entity number, 'Z', check character.",
    };
  }
  if (gstinCheckCharacter(gstin.slice(0, 14)) !== gstin[14]) {
    return { valid: false, normalised: gstin, stateCode: gstin.slice(0, 2), error: "Check character is invalid." };
  }
  return { valid: true, normalised: gstin, stateCode: gstin.slice(0, 2), error: null };
}

export function isValidPincode(value: string): boolean {
  return PINCODE_RE.test(value.trim());
}

export function isValidHsn(value: string): boolean {
  return HSN_RE.test(value.trim());
}

/** Common GST slabs offered in dropdowns; any 0–100 value is still accepted. */
export const GST_RATE_OPTIONS = [0, 0.1, 0.25, 1, 1.5, 3, 5, 7.5, 12, 18, 28];

/** Frequently used Unit Quantity Codes for the item `unit` field. */
export const UQC_OPTIONS = ["NOS", "PCS", "KGS", "GMS", "LTR", "MTR", "SQM", "BOX", "SET", "HRS", "OTH"];

export const EXPORT_SUPPLY_TYPES = new Set(["EXPWP", "EXPWOP"]);
export const IGST_ONLY_SUPPLY_TYPES = new Set(["SEZWP", "SEZWOP", "EXPWP", "EXPWOP"]);
