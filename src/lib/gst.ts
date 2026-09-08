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

/** Words suppliers print for a unit, mapped to the code the portal accepts. */
const UQC_SYNONYMS: Record<string, string> = {
  NO: "NOS", NOS: "NOS", NUMBER: "NOS", NUMBERS: "NOS", UNIT: "NOS", UNITS: "NOS", EA: "NOS", EACH: "NOS",
  PC: "PCS", PCS: "PCS", PIECE: "PCS", PIECES: "PCS",
  KG: "KGS", KGS: "KGS", KILOGRAM: "KGS", KILOGRAMS: "KGS",
  GM: "GMS", GMS: "GMS", GRAM: "GMS", GRAMS: "GMS", G: "GMS",
  L: "LTR", LT: "LTR", LTR: "LTR", LITRE: "LTR", LITRES: "LTR", LITER: "LTR", LITERS: "LTR",
  M: "MTR", MTR: "MTR", METRE: "MTR", METRES: "MTR", METER: "MTR", METERS: "MTR",
  SQM: "SQM", SQMTR: "SQM", SQFT: "OTH",
  BOX: "BOX", BOXES: "BOX", BX: "BOX",
  SET: "SET", SETS: "SET",
  HR: "HRS", HRS: "HRS", HOUR: "HRS", HOURS: "HRS",
};

/**
 * A unit code the invoice form's list actually contains.
 *
 * OCR reads whatever the supplier printed ("Pieces", "Nos.", "kg"). Feeding
 * that straight into a `<select>` shows the first option while the form holds
 * the raw string, so the invoice is saved with a unit nobody chose. Anything
 * unrecognised becomes OTH, which is what the portal expects for it.
 */
export function toUqc(value: string | null | undefined): string {
  if (!value) return "NOS";
  const key = value.toUpperCase().replace(/[^A-Z]/g, "");
  if (UQC_OPTIONS.includes(key)) return key;
  return UQC_SYNONYMS[key] ?? "OTH";
}

/**
 * A GST percentage the form offers, or null when it is not one.
 *
 * Rates are snapped to the nearest slab within a small tolerance so an OCR
 * misread of "18.00" survives, but an arbitrary number does not silently
 * become a rate the government does not levy.
 */
export function toGstRate(value: number | null | undefined): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const match = GST_RATE_OPTIONS.find((slab) => Math.abs(slab - value) <= 0.05);
  return match ?? null;
}

export const EXPORT_SUPPLY_TYPES = new Set(["EXPWP", "EXPWOP"]);
export const IGST_ONLY_SUPPLY_TYPES = new Set(["SEZWP", "SEZWOP", "EXPWP", "EXPWOP"]);
