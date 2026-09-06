import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { clientsApi, invoicesApi } from "@/api/endpoints";
import {
  DOCUMENT_TYPES,
  SUPPLY_TYPES,
  type DispatchDetails,
  type DocumentType,
  type InvoiceCreateRequest,
  type InvoiceUpdateRequest,
  type LineItemInput,
  type ShipToDetails,
  type SupplyType,
} from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { StateCodeSelect } from "@/components/StateCodeSelect";
import { Card, Checkbox, ErrorBanner, Field, InfoBanner, Input, PageHeader, Select, Spinner, Textarea } from "@/components/ui";
import { addDaysIso, money, todayIso } from "@/lib/format";
import { EXPORT_SUPPLY_TYPES, GST_RATE_OPTIONS, UQC_OPTIONS, isValidHsn } from "@/lib/gst";
import { computeTotals, isIntraState } from "@/lib/invoiceMath";

type LineDraft = LineItemInput & { key: string };

const newLine = (): LineDraft => ({
  key: Math.random().toString(36).slice(2),
  description: "",
  hsn_code: "",
  is_service: false,
  unit: "NOS",
  quantity: 1,
  unit_price: 0,
  discount: 0,
  gst_rate: null,
});

interface FormState {
  client_id: number | "";
  document_type: DocumentType;
  supply_type: SupplyType;
  reverse_charge: boolean;
  igst_on_intra: boolean;
  place_of_supply: string;
  issue_date: string;
  due_date: string;
  preceding_invoice_number: string;
  preceding_invoice_date: string;
  tax_rate: number;
  discount: number;
  notes: string;
  terms: string;
  line_items: LineDraft[];
  ship_to: ShipToDetails | null;
  dispatch_from: DispatchDetails | null;
  /** Carried over from an OCR draft: number printed on the scanned document. */
  source_reference: string;
  /** Carried over from an OCR draft: the stored upload this invoice comes from. */
  document_id: number | null;
}

const EMPTY_FORM: FormState = {
  client_id: "",
  document_type: "INV",
  supply_type: "B2B",
  reverse_charge: false,
  igst_on_intra: false,
  place_of_supply: "",
  issue_date: todayIso(),
  due_date: addDaysIso(todayIso(), 30),
  preceding_invoice_number: "",
  preceding_invoice_date: "",
  tax_rate: 18,
  discount: 0,
  notes: "",
  source_reference: "",
  document_id: null,
  terms: "Payment due within 30 days.",
  line_items: [newLine()],
  ship_to: null,
  dispatch_from: null,
};

const EMPTY_SHIP: ShipToDetails = { gstin: "", legal_name: "", trade_name: "", address1: "", address2: "", location: "", pincode: "", state_code: "" };
const EMPTY_DISPATCH: DispatchDetails = { name: "", address1: "", address2: "", location: "", pincode: "", state_code: "" };

const orNull = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

function toLineItems(lines: LineDraft[]): LineItemInput[] {
  return lines.map(({ key: _key, ...line }) => ({
    description: line.description.trim(),
    hsn_code: orNull(line.hsn_code),
    is_service: Boolean(line.is_service),
    unit: orNull(line.unit),
    quantity: Number(line.quantity),
    unit_price: Number(line.unit_price),
    discount: Number(line.discount) || 0,
    gst_rate: line.gst_rate === null || line.gst_rate === undefined || (line.gst_rate as unknown) === "" ? null : Number(line.gst_rate),
  }));
}

function toCreateBody(form: FormState): InvoiceCreateRequest {
  return {
    client_id: Number(form.client_id),
    document_type: form.document_type,
    supply_type: form.supply_type,
    reverse_charge: form.reverse_charge,
    igst_on_intra: form.igst_on_intra,
    place_of_supply: orNull(form.place_of_supply),
    issue_date: form.issue_date,
    due_date: form.due_date,
    preceding_invoice_number: orNull(form.preceding_invoice_number),
    preceding_invoice_date: orNull(form.preceding_invoice_date),
    dispatch_from: form.dispatch_from ? { ...form.dispatch_from, address2: orNull(form.dispatch_from.address2) } : null,
    ship_to: form.ship_to
      ? { ...form.ship_to, gstin: orNull(form.ship_to.gstin), trade_name: orNull(form.ship_to.trade_name), address2: orNull(form.ship_to.address2) }
      : null,
    tax_rate: Number(form.tax_rate),
    discount: Number(form.discount) || 0,
    notes: orNull(form.notes),
    terms: orNull(form.terms),
    source_reference: orNull(form.source_reference),
    document_id: form.document_id,
    line_items: toLineItems(form.line_items),
  };
}

export function InvoiceFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { user, seller } = useAuth();

  // "New invoice for this client" links arrive as /invoices/new?client=<id>.
  const preselectedClient = Number(searchParams.get("client")) || "";

  // OCR page hands over a draft through router state.
  const prefill = (location.state as { draft?: Partial<InvoiceCreateRequest>; notes?: string[]; buyerGstins?: string[] } | null) ?? null;

  const [form, setForm] = useState<FormState>(() => {
    if (!prefill?.draft) return { ...EMPTY_FORM, client_id: preselectedClient };
    const d = prefill.draft;
    return {
      ...EMPTY_FORM,
      client_id: preselectedClient,
      issue_date: d.issue_date ?? EMPTY_FORM.issue_date,
      due_date: d.due_date ?? EMPTY_FORM.due_date,
      place_of_supply: d.place_of_supply ?? "",
      reverse_charge: d.reverse_charge ?? false,
      tax_rate: d.tax_rate ?? EMPTY_FORM.tax_rate,
      notes: d.notes ?? "",
      source_reference: d.source_reference ?? "",
      document_id: d.document_id ?? null,
      line_items: d.line_items?.length ? d.line_items.map((li) => ({ ...newLine(), ...li, hsn_code: li.hsn_code ?? "", unit: li.unit ?? "NOS" })) : [newLine()],
    };
  });

  const clients = useQuery({ queryKey: ["clients"], queryFn: clientsApi.list });
  const existing = useQuery({ queryKey: ["invoices", Number(id)], queryFn: () => invoicesApi.get(Number(id)), enabled: editing });

  useEffect(() => {
    if (!existing.data) return;
    const inv = existing.data;
    setForm({
      client_id: inv.client_id,
      document_type: inv.document_type,
      supply_type: inv.supply_type,
      reverse_charge: inv.reverse_charge,
      igst_on_intra: inv.igst_on_intra,
      place_of_supply: inv.place_of_supply ?? "",
      source_reference: inv.source_reference ?? "",
      document_id: inv.document_id,
      issue_date: inv.issue_date,
      due_date: inv.due_date,
      preceding_invoice_number: inv.preceding_invoice_number ?? "",
      preceding_invoice_date: inv.preceding_invoice_date ?? "",
      tax_rate: inv.tax_rate,
      discount: inv.discount,
      notes: inv.notes ?? "",
      terms: inv.terms ?? "",
      line_items: inv.line_items.map((li) => ({
        key: String(li.id),
        description: li.description,
        hsn_code: li.hsn_code ?? "",
        is_service: li.is_service,
        unit: li.unit ?? "",
        quantity: li.quantity,
        unit_price: li.unit_price,
        discount: li.discount,
        gst_rate: li.gst_rate,
      })),
      ship_to: inv.ship_to,
      dispatch_from: inv.dispatch_from,
    });
  }, [existing.data]);

  // Pre-select a client whose GSTIN matched the OCR result.
  useEffect(() => {
    if (!prefill?.buyerGstins?.length || !clients.data || form.client_id) return;
    const match = clients.data.find((c) => c.gstin && prefill.buyerGstins!.includes(c.gstin));
    if (match) setForm((f) => ({ ...f, client_id: match.id }));
  }, [clients.data, prefill, form.client_id]);

  const save = useMutation({
    mutationFn: (body: InvoiceCreateRequest) => {
      if (!editing) return invoicesApi.create(body);
      const { client_id: _c, issue_date: _i, document_id: _d, ...rest } = body;
      return invoicesApi.update(Number(id), rest as InvoiceUpdateRequest);
    },
    onSuccess: (inv) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      navigate(`/invoices/${inv.id}`);
    },
  });

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setLine = (key: string, patch: Partial<LineDraft>) =>
    setForm((f) => ({ ...f, line_items: f.line_items.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));

  const client = clients.data?.find((c) => c.id === form.client_id) ?? null;
  const effectivePos = EXPORT_SUPPLY_TYPES.has(form.supply_type) ? "96" : form.place_of_supply || client?.place_of_supply || client?.state_code || "";
  const intra = isIntraState({ supplyType: form.supply_type, igstOnIntra: form.igst_on_intra, sellerStateCode: seller?.state_code, placeOfSupply: effectivePos });
  const totals = useMemo(() => computeTotals(toLineItems(form.line_items), Number(form.tax_rate), Number(form.discount), intra), [form.line_items, form.tax_rate, form.discount, intra]);

  const isNote = form.document_type !== "INV";
  const errors: string[] = [];
  if (!form.client_id) errors.push("Choose a client.");
  if (form.due_date < form.issue_date) errors.push("Due date must be on or after the issue date.");
  if (isNote && (!form.preceding_invoice_number || !form.preceding_invoice_date)) errors.push("Credit and debit notes need the preceding invoice number and date.");
  form.line_items.forEach((l, i) => {
    if (!l.description.trim()) errors.push(`Line ${i + 1}: description is required.`);
    if (!(Number(l.quantity) > 0)) errors.push(`Line ${i + 1}: quantity must be positive.`);
    if (l.hsn_code && !isValidHsn(l.hsn_code)) errors.push(`Line ${i + 1}: HSN/SAC must be 4–8 digits.`);
    if (Number(l.discount) > Number(l.quantity) * Number(l.unit_price)) errors.push(`Line ${i + 1}: discount exceeds the line amount.`);
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (errors.length) return;
    save.mutate(toCreateBody(form));
  }

  if (editing && existing.isPending) return <Spinner />;
  if (editing && existing.data?.irn) {
    return (
      <>
        <PageHeader title={existing.data.invoice_number} />
        <InfoBanner tone="warn">
          This invoice is registered with IRN <code>{existing.data.irn}</code>; its financial fields are locked. Change status or notes from the{" "}
          <Link to={`/invoices/${id}`}>invoice page</Link>, or cancel it and issue a new document.
        </InfoBanner>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={editing ? `Edit ${existing.data?.invoice_number ?? "invoice"}` : "New invoice"}
        subtitle={`Tax is computed per line. ${intra ? "Seller and place of supply are in the same state → CGST + SGST." : "Inter-state, SEZ or export → IGST."}`}
      />
      <ErrorBanner error={save.error} onDismiss={() => save.reset()} />
      {prefill?.notes?.length ? (
        <InfoBanner tone="info">
          <div>
            <strong>Pre-filled from a scanned document.</strong> Review every value before saving.
            <ul style={{ margin: "0.4rem 0 0 1rem" }}>
              {prefill.notes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          </div>
        </InfoBanner>
      ) : null}

      <form onSubmit={onSubmit}>
        <div className="grid two">
          <Card title="Parties">
            <div className="stack">
              <Field
                label="Client (buyer)"
                required
                hint={
                  client
                    ? `${client.gstin ?? "unregistered"} · state ${client.state_code ?? "—"}`
                    : clients.data && clients.data.length === 0
                      ? <>No clients yet — <Link to="/clients/new">add one first</Link>.</>
                      : "Pick the buyer this invoice is for."
                }
              >
                <Select value={form.client_id} onChange={(e) => set("client_id", e.target.value ? Number(e.target.value) : "")} disabled={editing} required>
                  <option value="">— select client —</option>
                  {clients.data?.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.gstin ? ` (${c.gstin})` : ""}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Place of supply" hint={`Pos — effective: ${effectivePos || "not set"}${EXPORT_SUPPLY_TYPES.has(form.supply_type) ? " (exports use 96)" : ""}`}>
                <StateCodeSelect value={form.place_of_supply} onChange={(e) => set("place_of_supply", e.target.value)} disabled={EXPORT_SUPPLY_TYPES.has(form.supply_type)} />
              </Field>
              <div className="muted small">Seller: {seller?.legal_name ?? seller?.full_name ?? user?.full_name} · GSTIN {seller?.gstin ?? "not set"} · state {seller?.state_code ?? "not set"}</div>
            </div>
          </Card>

          <Card title="Document">
            <div className="grid two">
              <Field label="Document type" required>
                <Select value={form.document_type} onChange={(e) => set("document_type", e.target.value as DocumentType)}>
                  {DOCUMENT_TYPES.map((d) => <option key={d.value} value={d.value}>{d.value} — {d.label}</option>)}
                </Select>
              </Field>
              <Field label="Supply type" required>
                <Select value={form.supply_type} onChange={(e) => set("supply_type", e.target.value as SupplyType)}>
                  {SUPPLY_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </Select>
              </Field>
              <Field label="Issue date" required>
                <Input type="date" value={form.issue_date} onChange={(e) => set("issue_date", e.target.value)} disabled={editing} required />
              </Field>
              <Field label="Due date" required>
                <Input type="date" value={form.due_date} min={form.issue_date} onChange={(e) => set("due_date", e.target.value)} required />
              </Field>
              {isNote && (
                <>
                  <Field label="Preceding invoice number" required>
                    <Input value={form.preceding_invoice_number} maxLength={16} onChange={(e) => set("preceding_invoice_number", e.target.value)} />
                  </Field>
                  <Field label="Preceding invoice date" required>
                    <Input type="date" value={form.preceding_invoice_date} onChange={(e) => set("preceding_invoice_date", e.target.value)} />
                  </Field>
                </>
              )}
            </div>
            <div className="row" style={{ marginTop: "0.75rem" }}>
              <Checkbox label="Reverse charge (RegRev)" checked={form.reverse_charge} onChange={(e) => set("reverse_charge", e.target.checked)} />
              <Checkbox label="IGST on intra-state supply" checked={form.igst_on_intra} onChange={(e) => set("igst_on_intra", e.target.checked)} />
            </div>
          </Card>
        </div>

        <Card
          title="Line items"
          actions={<button type="button" className="btn small" onClick={() => set("line_items", [...form.line_items, newLine()])}>Add line</button>}
        >
          <div className="table-wrap">
            <table className="table-compact">
              <thead>
                <tr>
                  <th style={{ minWidth: 220 }}>Description</th>
                  <th>HSN/SAC</th>
                  <th>Service</th>
                  <th>Unit</th>
                  <th className="num">Qty</th>
                  <th className="num">Unit price</th>
                  <th className="num">Discount</th>
                  <th>GST %</th>
                  <th className="num">Taxable</th>
                  <th className="num">Tax</th>
                  <th className="num">Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {form.line_items.map((line, index) => {
                  const priced = totals.items[index];
                  return (
                    <tr key={line.key}>
                      <td><Input value={line.description} maxLength={300} placeholder="What was sold" onChange={(e) => setLine(line.key, { description: e.target.value })} /></td>
                      <td><Input value={line.hsn_code ?? ""} maxLength={8} inputMode="numeric" placeholder="998311" style={{ width: 100 }} onChange={(e) => setLine(line.key, { hsn_code: e.target.value.replace(/\D/g, "") })} /></td>
                      <td style={{ textAlign: "center" }}><input type="checkbox" checked={Boolean(line.is_service)} onChange={(e) => setLine(line.key, { is_service: e.target.checked, unit: e.target.checked ? "OTH" : "NOS" })} /></td>
                      <td>
                        <Select value={line.unit ?? ""} style={{ width: 80 }} onChange={(e) => setLine(line.key, { unit: e.target.value })}>
                          {UQC_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                        </Select>
                      </td>
                      <td><Input type="number" min={0.001} step="any" value={line.quantity} style={{ width: 80 }} onChange={(e) => setLine(line.key, { quantity: Number(e.target.value) })} /></td>
                      <td><Input type="number" min={0} step="0.01" value={line.unit_price} style={{ width: 110 }} onChange={(e) => setLine(line.key, { unit_price: Number(e.target.value) })} /></td>
                      <td><Input type="number" min={0} step="0.01" value={line.discount ?? 0} style={{ width: 90 }} onChange={(e) => setLine(line.key, { discount: Number(e.target.value) })} /></td>
                      <td>
                        <Select value={line.gst_rate === null || line.gst_rate === undefined ? "" : String(line.gst_rate)} style={{ width: 95 }} onChange={(e) => setLine(line.key, { gst_rate: e.target.value === "" ? null : Number(e.target.value) })}>
                          <option value="">default ({form.tax_rate}%)</option>
                          {GST_RATE_OPTIONS.map((r) => <option key={r} value={r}>{r}%</option>)}
                        </Select>
                      </td>
                      <td className="num">{money(priced?.taxable_value)}</td>
                      <td className="num">{money((priced?.igst_amount ?? 0) + (priced?.cgst_amount ?? 0) + (priced?.sgst_amount ?? 0))}</td>
                      <td className="num">{money(priced?.total_amount)}</td>
                      <td>
                        <button type="button" className="btn ghost small" aria-label="Remove line" disabled={form.line_items.length === 1} onClick={() => set("line_items", form.line_items.filter((l) => l.key !== line.key))}>×</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid two" style={{ marginTop: "1rem", alignItems: "start" }}>
            <div className="grid two">
              <Field label="Default GST rate %" hint="Used by lines without their own rate.">
                <Select value={String(form.tax_rate)} onChange={(e) => set("tax_rate", Number(e.target.value))}>
                  {GST_RATE_OPTIONS.map((r) => <option key={r} value={r}>{r}%</option>)}
                </Select>
              </Field>
              <Field label="Invoice-level discount" hint="ValDtls.Discount — deducted after tax.">
                <Input type="number" min={0} step="0.01" value={form.discount} onChange={(e) => set("discount", Number(e.target.value))} />
              </Field>
            </div>
            <div className="totals">
              <span className="muted">Gross</span><span>{money(totals.subtotal)}</span>
              <span className="muted">Taxable value</span><span>{money(totals.taxable)}</span>
              {totals.intra_state ? (
                <>
                  <span className="muted">CGST</span><span>{money(totals.cgst_amount)}</span>
                  <span className="muted">SGST</span><span>{money(totals.sgst_amount)}</span>
                </>
              ) : (
                <><span className="muted">IGST</span><span>{money(totals.igst_amount)}</span></>
              )}
              <span className="muted">Discount</span><span>− {money(form.discount)}</span>
              <span className="grand">Total</span><span className="grand">{money(totals.total)}</span>
            </div>
          </div>
        </Card>

        <div className="grid two">
          <Card title="Ship to (optional)" actions={<button type="button" className="btn small" onClick={() => set("ship_to", form.ship_to ? null : EMPTY_SHIP)}>{form.ship_to ? "Remove" : "Add"}</button>}>
            {form.ship_to ? (
              <div className="grid two">
                <Field label="Legal name" required><Input value={form.ship_to.legal_name} onChange={(e) => set("ship_to", { ...form.ship_to!, legal_name: e.target.value })} /></Field>
                <Field label="GSTIN"><Input value={form.ship_to.gstin ?? ""} maxLength={15} onChange={(e) => set("ship_to", { ...form.ship_to!, gstin: e.target.value.toUpperCase() })} /></Field>
                <Field label="Address line 1" required><Input value={form.ship_to.address1} onChange={(e) => set("ship_to", { ...form.ship_to!, address1: e.target.value })} /></Field>
                <Field label="Address line 2"><Input value={form.ship_to.address2 ?? ""} onChange={(e) => set("ship_to", { ...form.ship_to!, address2: e.target.value })} /></Field>
                <Field label="Place" required><Input value={form.ship_to.location} onChange={(e) => set("ship_to", { ...form.ship_to!, location: e.target.value })} /></Field>
                <Field label="Pincode" required><Input value={form.ship_to.pincode} maxLength={6} onChange={(e) => set("ship_to", { ...form.ship_to!, pincode: e.target.value })} /></Field>
                <Field label="State code" required><StateCodeSelect value={form.ship_to.state_code} onChange={(e) => set("ship_to", { ...form.ship_to!, state_code: e.target.value })} /></Field>
              </div>
            ) : (
              <p className="muted small">Only needed when goods ship somewhere other than the buyer's address (ShipDtls).</p>
            )}
          </Card>

          <Card title="Dispatch from (optional)" actions={<button type="button" className="btn small" onClick={() => set("dispatch_from", form.dispatch_from ? null : EMPTY_DISPATCH)}>{form.dispatch_from ? "Remove" : "Add"}</button>}>
            {form.dispatch_from ? (
              <div className="grid two">
                <Field label="Name" required><Input value={form.dispatch_from.name} onChange={(e) => set("dispatch_from", { ...form.dispatch_from!, name: e.target.value })} /></Field>
                <Field label="Address line 1" required><Input value={form.dispatch_from.address1} onChange={(e) => set("dispatch_from", { ...form.dispatch_from!, address1: e.target.value })} /></Field>
                <Field label="Address line 2"><Input value={form.dispatch_from.address2 ?? ""} onChange={(e) => set("dispatch_from", { ...form.dispatch_from!, address2: e.target.value })} /></Field>
                <Field label="Place" required><Input value={form.dispatch_from.location} onChange={(e) => set("dispatch_from", { ...form.dispatch_from!, location: e.target.value })} /></Field>
                <Field label="Pincode" required><Input value={form.dispatch_from.pincode} maxLength={6} onChange={(e) => set("dispatch_from", { ...form.dispatch_from!, pincode: e.target.value })} /></Field>
                <Field label="State code" required><StateCodeSelect value={form.dispatch_from.state_code} onChange={(e) => set("dispatch_from", { ...form.dispatch_from!, state_code: e.target.value })} /></Field>
              </div>
            ) : (
              <p className="muted small">Only needed when goods leave from a place other than the seller's registered address (DispDtls).</p>
            )}
          </Card>
        </div>

        <Card title="Notes and terms">
          <div className="grid two">
            <Field label="Notes"><Textarea value={form.notes} maxLength={2000} onChange={(e) => set("notes", e.target.value)} /></Field>
            <Field label="Terms"><Textarea value={form.terms} maxLength={2000} onChange={(e) => set("terms", e.target.value)} /></Field>
          </div>
        </Card>

        {errors.length > 0 && (
          <InfoBanner tone="warn">
            <ul style={{ margin: 0, paddingLeft: "1rem" }}>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
          </InfoBanner>
        )}

        <div className="row">
          <button className="btn primary" type="submit" disabled={save.isPending || errors.length > 0}>
            {save.isPending ? "Saving…" : editing ? "Save changes" : "Create invoice"}
          </button>
          <Link to={editing ? `/invoices/${id}` : "/invoices"} className="btn">Cancel</Link>
        </div>
      </form>
    </>
  );
}
