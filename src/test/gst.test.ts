import { describe, expect, it } from "vitest";
import { checkGstin, gstinCheckCharacter, isValidHsn, isValidPincode } from "@/lib/gst";

describe("GSTIN validation (mirrors backend app/core/gst.py)", () => {
  it.each(["27AAPFU0939F1ZV", "07AAGFF2194N1Z1", "27AAACR5055K1Z7"])("accepts real GSTIN %s", (gstin) => {
    const result = checkGstin(gstin.toLowerCase());
    expect(result.valid).toBe(true);
    expect(result.normalised).toBe(gstin);
    expect(result.stateCode).toBe(gstin.slice(0, 2));
  });

  it("rejects a wrong check character", () => {
    const result = checkGstin("27AAPFU0939F1ZX");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/check character/i);
  });

  it("rejects malformed input and stays quiet on empty", () => {
    expect(checkGstin("ABC").valid).toBe(false);
    expect(checkGstin("").error).toBeNull();
  });

  it("computes the mod-36 check character", () => {
    expect(gstinCheckCharacter("27AAPFU0939F1Z")).toBe("V");
  });

  it("validates pincode and HSN formats", () => {
    expect(isValidPincode("400001")).toBe(true);
    expect(isValidPincode("040001")).toBe(false);
    expect(isValidHsn("9401")).toBe(true);
    expect(isValidHsn("84719000")).toBe(true);
    expect(isValidHsn("123")).toBe(false);
  });
});
