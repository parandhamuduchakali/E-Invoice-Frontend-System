// @vitest-environment node
/**
 * Live integration test: drives the real API layer (src/api/endpoints.ts)
 * against a running backend, exactly as the pages do.
 *
 * Skipped unless E2E_BASE_URL is set, e.g.
 *   E2E_BASE_URL=http://127.0.0.1:5180 VITE_API_BASE_URL=http://127.0.0.1:5180 npx vitest run e2e
 * (pointing at the Vite dev server exercises the /api proxy too).
 * Set E2E_OCR_FILE to a PDF/PNG path to also run the OCR upload (slow, ~1 min).
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { tokenStore, workspaceStore } from "@/api/client";
import { authApi, clientsApi, documentsApi, gstApi, invoicesApi, ocrApi, usersApi } from "@/api/endpoints";

const BASE = process.env.E2E_BASE_URL;
const OCR_FILE = process.env.E2E_OCR_FILE;

// Node has no localStorage; give tokenStore a tiny in-memory one.
const memory = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
};

const SELLER_GSTIN = "27AAPFU0939F1ZV"; // Maharashtra
const BUYER_GSTIN = "27AAACR5055K1Z7"; // Maharashtra → intra-state → CGST + SGST

describe.skipIf(!BASE)("frontend API layer against live backend", () => {
  const stamp = Date.now();
  const email = `fe-e2e-${stamp}@example.com`;
  let clientId = 0;
  let invoiceId = 0;

  beforeAll(async () => {
    expect(import.meta.env.VITE_API_BASE_URL, "VITE_API_BASE_URL must point at the same server").toBe(BASE);
    // On an empty database the very first account becomes admin. Register a
    // throwaway one first so the account under test is a regular manager.
    await authApi.register(`bootstrap-${stamp}@example.com`, "Bootstrap", "password123").catch(() => undefined);
    await authApi.register(email, "Frontend E2E", "password123");
    const token = await authApi.login(email, "password123");
    tokenStore.set(token.access_token, token.refresh_token);
  });

  it("refreshes the session with the refresh token", async () => {
    const refreshToken = tokenStore.getRefresh();
    expect(refreshToken).toBeTruthy();
    const renewed = await authApi.refresh(refreshToken!);
    expect(renewed.access_token).toBeTruthy();
    expect(renewed.refresh_expires_in).toBeGreaterThan(renewed.expires_in);
    tokenStore.set(renewed.access_token, renewed.refresh_token);
    expect((await authApi.me()).email).toBe(email);

    // A dead access token is transparently refreshed and the call retried.
    tokenStore.set("expired.access.token");
    expect((await authApi.me()).email).toBe(email);
    expect(tokenStore.get()).not.toBe("expired.access.token");

    await expect(authApi.refresh(tokenStore.get()!)).rejects.toMatchObject({ status: 401 }); // access token is not a refresh token
  });

  it("loads the current user and GST reference data", async () => {
    const me = await authApi.me();
    expect(me.email).toBe(email);
    expect(me.gstin).toBeNull();

    const states = await gstApi.stateCodes();
    expect(states.find((s) => s.code === "27")?.name).toBe("Maharashtra");

    const check = await gstApi.validateGstin(SELLER_GSTIN.toLowerCase());
    expect(check).toMatchObject({ valid: true, state_code: "27", state_name: "Maharashtra" });
  });

  it("saves the seller profile (PATCH /users/me)", async () => {
    const updated = await usersApi.updateMe({
      legal_name: "Frontend E2E Private Limited",
      trade_name: "FE E2E",
      gstin: SELLER_GSTIN,
      address1: "12 Industrial Estate",
      location: "Mumbai",
      pincode: "400001",
      state_code: "27",
      phone: "9820012345",
    });
    expect(updated.gstin).toBe(SELLER_GSTIN);
    expect(updated.state_code).toBe("27");
  });

  it("rejects a GSTIN with a bad check digit with a readable error", async () => {
    await expect(usersApi.updateMe({ gstin: "27AAPFU0939F1ZX" })).rejects.toMatchObject({
      status: 422,
      message: expect.stringMatching(/check character/i),
    });
  });

  it("creates a GST-complete client", async () => {
    const client = await clientsApi.create({
      name: "Buyer Ltd",
      email: `buyer-${stamp}@example.com`,
      phone: "9800000000",
      address: "5 Market Road",
      city: "Pune",
      state: "Maharashtra",
      zip_code: "411001",
      country: "India",
      tax_id: null,
      gstin: BUYER_GSTIN,
      legal_name: "Buyer Limited",
      trade_name: null,
      state_code: "27",
      place_of_supply: null,
    });
    clientId = client.id;
    expect(client.gstin).toBe(BUYER_GSTIN);
    const list = await clientsApi.list();
    expect(list.some((c) => c.id === clientId)).toBe(true);
  });

  it("creates an invoice and gets the intra-state tax split back", async () => {
    const invoice = await invoicesApi.create({
      client_id: clientId,
      document_type: "INV",
      supply_type: "B2B",
      reverse_charge: false,
      igst_on_intra: false,
      place_of_supply: null,
      issue_date: "2026-01-15",
      due_date: "2099-02-15", // far future: 'sent' invoices past due are auto-marked overdue
      tax_rate: 10,
      discount: 0,
      notes: null,
      terms: "Net 30",
      line_items: [
        { description: "Consulting", hsn_code: "998311", is_service: true, unit: "OTH", quantity: 2, unit_price: 100, discount: 0, gst_rate: null },
        { description: "Widget", hsn_code: "84719000", is_service: false, unit: "NOS", quantity: 1, unit_price: 50, discount: 0, gst_rate: null },
      ],
    });
    invoiceId = invoice.id;
    expect(invoice.invoice_number).toMatch(/^INV-\d{4}-0001$/);
    expect(invoice.place_of_supply).toBe("27");
    expect(invoice).toMatchObject({ subtotal: 250, cgst_amount: 12.5, sgst_amount: 12.5, igst_amount: 0, tax_amount: 25, total: 275 });
    expect(invoice.line_items[0]).toMatchObject({ taxable_value: 200, cgst_amount: 10, sgst_amount: 10, total_amount: 220 });
  });

  it("recomputes totals on PATCH and lists with filters", async () => {
    const updated = await invoicesApi.update(invoiceId, { tax_rate: 18, status: "sent" });
    expect(updated.tax_amount).toBe(45);
    expect(updated.total).toBe(295);

    const page = await invoicesApi.list({ page: 1, size: 10, status: "sent", search: "0001" });
    expect(page.total).toBe(1);
    expect(page.items[0].id).toBe(invoiceId);

    // Status state machine: only forward moves are allowed.
    expect(updated.allowed_status_transitions).toEqual(["cancelled", "overdue", "paid"]);
    await expect(invoicesApi.update(invoiceId, { status: "draft" })).rejects.toMatchObject({ status: 422, code: "BUSINESS_RULE_VIOLATION" });

    const stats = await invoicesApi.stats();
    expect(stats.total_pending).toBe(295);
  });

  it("is ready for the IRP and produces the INV-01 payload", async () => {
    const readiness = await invoicesApi.readiness(invoiceId);
    expect(readiness).toEqual({ ready: true, errors: [] });

    const doc = (await invoicesApi.einvoice(invoiceId)) as Record<string, any>;
    expect(doc.Version).toBe("1.1");
    expect(doc.TranDtls).toEqual({ TaxSch: "GST", SupTyp: "B2B", RegRev: "N", IgstOnIntra: "N" });
    expect(doc.DocDtls.Dt).toBe("15/01/2026");
    expect(doc.SellerDtls.Gstin).toBe(SELLER_GSTIN);
    expect(doc.BuyerDtls).toMatchObject({ Gstin: BUYER_GSTIN, Pos: "27", Pin: 411001 });
    expect(doc.ItemList).toHaveLength(2);
    expect(doc.ValDtls.TotInvVal).toBe(295);
  });

  it("records the IRN, which then locks financial fields", async () => {
    // Unique per run: the backend enforces IRN uniqueness across invoices.
    const irn = (stamp.toString(16) + "a".repeat(64)).slice(0, 64);
    const registered = await invoicesApi.recordIrn(invoiceId, { irn, ack_no: "112010036563322", ack_date: "2026-01-15 10:30:00", signed_qr_code: null });
    expect(registered.irn).toBe(irn);

    await expect(invoicesApi.update(invoiceId, { tax_rate: 5 })).rejects.toMatchObject({ status: 422, code: "BUSINESS_RULE_VIOLATION" });
    await expect(invoicesApi.remove(invoiceId)).rejects.toMatchObject({ status: 422 });
    const notes = await invoicesApi.update(invoiceId, { notes: "Thanks" });
    expect(notes.notes).toBe("Thanks");
  });

  it("client-wise stats reconcile and members are role-limited (RBAC)", async () => {
    // Second client + one invoice for it → per-client stats must add up to the total.
    const second = await clientsApi.create({
      name: "Second Buyer", email: `second-${stamp}@example.com`, phone: null, address: "1 Lane", city: "Pune", state: null,
      zip_code: "411002", country: "India", tax_id: null, gstin: null, legal_name: null, trade_name: null, state_code: "27", place_of_supply: null,
    });
    await invoicesApi.create({
      client_id: second.id, document_type: "INV", supply_type: "B2C", reverse_charge: false, igst_on_intra: false, place_of_supply: null,
      issue_date: "2026-01-20", due_date: "2026-02-20", tax_rate: 5, discount: 0, notes: null, terms: null,
      line_items: [{ description: "Retail item", hsn_code: "9401", is_service: false, unit: "NOS", quantity: 1, unit_price: 200, discount: 0, gst_rate: null }],
    });
    const all = await invoicesApi.stats();
    const first = await invoicesApi.stats(clientId);
    const other = await invoicesApi.stats(second.id);
    expect(first.total_invoices + other.total_invoices).toBe(all.total_invoices);
    expect(first.total_amount + other.total_amount).toBeCloseTo(all.total_amount, 2);
    expect(Object.values(all.by_status).reduce((a, b) => a + b, 0)).toBe(all.total_invoices);
    const perClient = await invoicesApi.list({ client_id: second.id });
    expect(perClient.total).toBe(1);

    // Manager creates an engineer and a client-portal user in this workspace.
    const managerToken = tokenStore.get()!;
    const managerRefresh = tokenStore.getRefresh();
    const eng = await usersApi.create({ email: `eng-${stamp}@example.com`, full_name: "Eng", password: "password123", role: "engineer" });
    expect(eng.role).toBe("engineer");
    const portal = await usersApi.create({ email: `portal-${stamp}@example.com`, full_name: "Portal", password: "password123", role: "client", client_id: second.id });
    expect(portal.client_id).toBe(second.id);
    await expect(usersApi.create({ email: `x-${stamp}@example.com`, full_name: "X", password: "password123", role: "admin" })).rejects.toMatchObject({ status: 403 });

    // Engineer: sees the manager's data and seller profile, cannot delete or record IRN.
    const engTokens = await authApi.login(eng.email, "password123");
    tokenStore.set(engTokens.access_token, engTokens.refresh_token);
    expect((await clientsApi.list()).length).toBe(2);
    expect((await usersApi.workspace()).gstin).toBe(SELLER_GSTIN); // manager's seller profile, for tax previews
    await expect(invoicesApi.remove(invoiceId)).rejects.toMatchObject({ status: 403, code: "PERMISSION_DENIED" });
    await expect(usersApi.list()).rejects.toMatchObject({ status: 403 });
    // Own password change, then the old password stops working.
    await usersApi.changePassword({ current_password: "password123", new_password: "engineer-new-pw1" });
    await expect(authApi.login(eng.email, "password123")).rejects.toMatchObject({ status: 401 });
    await authApi.login(eng.email, "engineer-new-pw1");

    // Deleting a client that has invoices is a conflict, not a crash.
    tokenStore.set(managerToken, managerRefresh);
    await expect(clientsApi.remove(clientId)).rejects.toMatchObject({ status: 409, code: "CONFLICT" });

    // Client-portal user: only its own client and invoices, read-only.
    const portalTokens = await authApi.login(portal.email, "password123");
    tokenStore.set(portalTokens.access_token, portalTokens.refresh_token);
    expect((await clientsApi.list()).map((c) => c.id)).toEqual([second.id]);
    const mine = await invoicesApi.list({});
    expect(mine.total).toBe(1);
    expect(mine.items[0].client_id).toBe(second.id);
    await expect(invoicesApi.get(invoiceId)).rejects.toMatchObject({ status: 403 });
    await expect(invoicesApi.list({ client_id: clientId })).rejects.toMatchObject({ status: 403 });
    const scoped = await invoicesApi.stats();
    expect(scoped.client_id).toBe(second.id);
    await expect(ocrApi.status()).rejects.toMatchObject({ status: 403 });

    tokenStore.set(managerToken, managerRefresh);
  }, 60_000);

  it("admins may act on another workspace with X-Workspace-Id; managers may not", async () => {
    const me = await authApi.me();
    // A manager sending the header for someone else's workspace is refused.
    workspaceStore.set(me.id + 1000);
    await expect(invoicesApi.list({ page: 1, size: 5 })).rejects.toMatchObject({ status: 403 });
    workspaceStore.set(null);

    // The bootstrap account is the platform admin on a fresh database.
    const mine = tokenStore.get()!;
    const adminTokens = await authApi.login(`bootstrap-${stamp}@example.com`, "password123");
    tokenStore.set(adminTokens.access_token, adminTokens.refresh_token);
    try {
      const admin = await authApi.me();
      if (admin.role === "admin") {
        workspaceStore.set(me.id);
        const theirs = await invoicesApi.list({ page: 1, size: 5 });
        expect(theirs.items.some((i) => i.id === invoiceId)).toBe(true);
        expect((await clientsApi.list()).some((c) => c.id === clientId)).toBe(true);
        await expect(documentsApi.list()).resolves.toBeInstanceOf(Array);
        workspaceStore.set(99_999_999);
        await expect(invoicesApi.list({ page: 1, size: 5 })).rejects.toMatchObject({ status: 404 });
      } else {
        // Not a fresh database: bootstrap became a manager, so the header must be refused.
        workspaceStore.set(me.id);
        await expect(invoicesApi.list({ page: 1, size: 5 })).rejects.toMatchObject({ status: 403 });
      }
    } finally {
      workspaceStore.set(null);
      tokenStore.set(mine);
    }
  }, 60_000);

  it("forgot-password answers 202 without revealing accounts; bad reset tokens are 400", async () => {
    await expect(authApi.forgotPassword(`nobody-${stamp}@example.com`)).resolves.toBeUndefined();
    await expect(authApi.forgotPassword(email)).resolves.toBeUndefined(); // link goes to the server log (console mailer)
    await expect(authApi.resetPassword("definitely-not-a-real-token-value", "another-password-1")).rejects.toMatchObject({ status: 400, code: "BAD_REQUEST" });
  });

  it("reports OCR availability", async () => {
    const status = await ocrApi.status();
    expect(status.engine).toBe("paddleocr");
    expect(typeof status.available).toBe("boolean");
  });

  it.skipIf(!OCR_FILE)(
    "uploads a document through /ocr/extract and gets GST fields",
    async () => {
      const bytes = readFileSync(OCR_FILE!);
      const type = OCR_FILE!.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/png";
      const file = new File([bytes], basename(OCR_FILE!), { type });
      const result = await ocrApi.extract(file, { dpi: 300 });
      expect(result.page_count).toBeGreaterThan(0);
      expect(result.document_id).toBeGreaterThan(0);
      expect(result.duplicate).toBe(false);

      // Stored, listed, downloadable, and re-runnable.
      const stored = await documentsApi.get(result.document_id!);
      expect(stored.status).toBe("processed");
      expect(stored.extracted_fields?.invoice_numbers).toContain("234694KF48");
      expect((await documentsApi.list()).some((d) => d.id === result.document_id)).toBe(true);
      const blob = await documentsApi.file(result.document_id!);
      expect(blob.size).toBe(bytes.length);

      // Same bytes again → the existing record is reused.
      const again = await ocrApi.extract(file, { dpi: 300 });
      expect(again.document_id).toBe(result.document_id);
      expect(again.duplicate).toBe(true);
      expect(result.extracted_fields.invoice_numbers).toContain("234694KF48");
      expect(result.extracted_fields.hsn_codes).toContain("9401");
      expect(result.extracted_fields.place_of_supply_code).toBe("29");
      expect(result.extracted_fields.total_amount).toBe(10000);
    },
    600_000,
  );
});
