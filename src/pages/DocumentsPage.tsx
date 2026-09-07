import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { clientsApi, documentsApi } from "@/api/endpoints";
import type { ExtractedLineItem, ExtractedParty, StoredDocument, StoredDocumentSummary } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { Card, ConfirmButton, EmptyState, ErrorBanner, Field, InfoBanner, Input, KeyValue, PageHeader, Select, Spinner } from "@/components/ui";
import { displayDateTime, money } from "@/lib/format";
import { round2 } from "@/lib/invoiceMath";
import { ocrToInvoiceDraft } from "@/lib/ocrToInvoice";
import { can } from "@/lib/permissions";

const STATUS_TONE: Record<StoredDocumentSummary["status"], string> = {
  pending: "pill",
  processed: "pill good",
  failed: "pill warn",
};

/** Types a browser may safely render inline — mirrors the backend's upload sniffer. */
const PREVIEWABLE = new Set(["application/pdf", "image/png", "image/jpeg", "image/bmp", "image/tiff", "image/webp"]);

function kb(bytes: number): string {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** An empty row, for "Add row" when OCR missed a line entirely. */
function blankRow(): ExtractedLineItem {
  return {
    description: "",
    hsn_code: null,
    quantity: 1,
    unit: null,
    unit_price: null,
    discount: null,
    gst_rate: null,
    amount: null,
    confidence: 1,
    warnings: [],
  };
}

/** Parses a numeric cell, treating a cleared field as "not known" rather than 0. */
function num(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Blank cells mean "unknown", so they round-trip as null rather than "". */
function text(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Re-checks a row's arithmetic after an edit.
 *
 * The backend attaches this warning when it reads the table; once a human
 * starts correcting the numbers the original warning is about values that are
 * no longer on screen, so it is recomputed rather than left to go stale.
 */
function rowWarnings(row: ExtractedLineItem): string[] {
  const kept = row.warnings.filter((w) => !w.includes("but the row reads"));
  if (row.quantity !== null && row.unit_price !== null && row.amount !== null) {
    const computed = round2(row.quantity * row.unit_price - (row.discount ?? 0));
    if (Math.abs(computed - row.amount) > 0.01) {
      kept.push(`${row.quantity} x ${row.unit_price} = ${computed}, but the row reads ${row.amount}.`);
    }
  }
  if (!row.description.trim()) kept.push("Description is empty.");
  return kept;
}

/** One party as the extractor read it, or a single line saying it read nothing. */
function PartyCard({ title, party }: { title: string; party: ExtractedParty }) {
  const filled = Object.values(party).some((v) => v !== null);
  return (
    <div>
      <h4 style={{ margin: "0 0 0.35rem" }}>{title}</h4>
      {!filled ? (
        <p className="muted small" style={{ margin: 0 }}>Nothing read for this party.</p>
      ) : (
        <KeyValue
          items={[
            ["Name", party.legal_name ?? "—"],
            ["GSTIN", party.gstin ? <code key="g">{party.gstin}</code> : "—"],
            ["Address", party.address ?? "—"],
            ["Place", party.place ?? "—"],
            ["State", party.state_code ? `${party.state ?? ""} (${party.state_code})`.trim() : (party.state ?? "—")],
            ["PIN", party.pincode ?? "—"],
          ]}
        />
      )}
    </div>
  );
}

export function DocumentsPage() {
  const { user, seller } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const selectedId = Number(params.get("id")) || null;
  const canWriteInvoices = can(user, "invoices:write");
  const canDelete = can(user, "invoices:delete");

  const docs = useQuery({ queryKey: ["documents"], queryFn: documentsApi.list });
  const selected = useQuery({ queryKey: ["documents", selectedId], queryFn: () => documentsApi.get(selectedId!), enabled: selectedId !== null });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["documents"] });
  const retry = useMutation({ mutationFn: (id: number) => documentsApi.retry(id), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: (id: number) => documentsApi.remove(id), onSuccess: () => { invalidate(); select(null); } });
  const [downloadError, setDownloadError] = useState<unknown>(null);

  // The extracted rows, as the user has corrected them. Seeded from the
  // document and reset whenever a different one is opened; null until then.
  const [rows, setRows] = useState<ExtractedLineItem[] | null>(null);
  const [clientId, setClientId] = useState<number | "">("");

  // Only fetched when a document is open, and only for roles that can act on
  // it — a reviewer who cannot create invoices has no use for the list.
  const clients = useQuery({
    queryKey: ["clients"],
    queryFn: clientsApi.list,
    enabled: selectedId !== null && canWriteInvoices,
    staleTime: 60_000,
  });

  const document_ = selected.data ?? null;

  useEffect(() => {
    setRows(document_?.extracted_fields?.line_items ?? null);
    setClientId("");
  }, [document_?.id, document_?.processed_at]);

  // Pre-select the client whose GSTIN appears on the scan; the user can
  // override it, which is the whole point of showing the field here.
  const buyerGstins = (document_?.extracted_fields?.gstins ?? []).filter(
    (g) => g.toUpperCase() !== (seller?.gstin?.toUpperCase() ?? null),
  );
  useEffect(() => {
    if (clientId !== "" || !clients.data || buyerGstins.length === 0) return;
    const match = clients.data.find((c) => c.gstin && buyerGstins.includes(c.gstin));
    if (match) setClientId(match.id);
  }, [clients.data, clientId, buyerGstins.join(",")]);

  function editRow(index: number, patch: Partial<ExtractedLineItem>) {
    setRows((current) =>
      (current ?? []).map((row, i) => {
        if (i !== index) return row;
        const next = { ...row, ...patch };
        return { ...next, warnings: rowWarnings(next) };
      }),
    );
  }

  function select(id: number | null) {
    setParams(id === null ? {} : { id: String(id) }, { replace: true });
  }

  async function download(doc: StoredDocumentSummary) {
    try {
      const blob = await documentsApi.file(doc.id);
      // A blob: URL runs in *this* origin, where the session token lives, so the
      // type it is opened with decides whether the tab renders a document or
      // executes a payload. Only the handful of types the OCR pipeline accepts
      // are previewed; anything else is handed to the browser as a download.
      const type = PREVIEWABLE.has(doc.content_type ?? "") ? doc.content_type! : "application/octet-stream";
      const url = URL.createObjectURL(new Blob([blob], { type }));
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      setDownloadError(error);
    }
  }

  function createInvoice(doc: StoredDocument) {
    if (!doc.extracted_fields) return;
    // Whatever the user corrected here is what the invoice is built from; the
    // scanned values are only the starting point.
    const fields = { ...doc.extracted_fields, line_items: rows ?? doc.extracted_fields.line_items };
    const draft = ocrToInvoiceDraft(fields, seller, doc.id);
    navigate(clientId === "" ? "/invoices/new" : `/invoices/new?client=${clientId}`, {
      state: { draft: draft.invoice, notes: draft.notes, buyerGstins: draft.buyerGstinCandidates },
    });
  }

  return (
    <>
      <PageHeader
        title="Documents"
        subtitle="Every file sent to OCR is kept here so a scan can be reviewed, re-run, or traced from the invoice it produced."
        actions={<Link to="/ocr" className="btn primary">Scan a new document</Link>}
      />
      <ErrorBanner error={retry.error ?? remove.error ?? downloadError} onDismiss={() => { retry.reset(); remove.reset(); setDownloadError(null); }} />

      {docs.isPending ? (
        <Spinner />
      ) : docs.error ? (
        <ErrorBanner error={docs.error} />
      ) : docs.data!.length === 0 ? (
        <EmptyState title="No documents yet">Upload a PDF or image on the <Link to="/ocr">Scan invoice</Link> page. It will appear here with its OCR result.</EmptyState>
      ) : (
        <Card>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>File</th><th>Status</th><th>Engine</th><th className="num">Pages</th><th>Invoice</th><th>Uploaded</th><th></th>
                </tr>
              </thead>
              <tbody>
                {docs.data!.map((doc) => (
                  <tr key={doc.id} className={doc.id === selectedId ? "selected" : ""}>
                    <td>
                      <button type="button" className="link" onClick={() => select(doc.id === selectedId ? null : doc.id)}>{doc.filename}</button>
                      <div className="muted small">{kb(doc.size_bytes)} · {doc.content_type ?? "unknown type"}</div>
                    </td>
                    <td>
                      <span className={STATUS_TONE[doc.status]}>{doc.status}</span>
                      {doc.error && <div className="muted small" title={doc.error}>{doc.error.slice(0, 80)}{doc.error.length > 80 ? "…" : ""}</div>}
                    </td>
                    <td>{doc.engine ?? "—"}</td>
                    <td className="num">{doc.page_count}</td>
                    <td>{doc.invoice_id ? <Link to={`/invoices/${doc.invoice_id}`}>#{doc.invoice_id}</Link> : <span className="muted">—</span>}</td>
                    <td className="muted small">{displayDateTime(doc.created_at)}</td>
                    <td className="row" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                      <button type="button" className="btn small" onClick={() => download(doc)}>Open file</button>
                      <button type="button" className="btn small" onClick={() => retry.mutate(doc.id)} disabled={retry.isPending}>
                        {retry.isPending && retry.variables === doc.id ? "Running…" : "Re-run OCR"}
                      </button>
                      {canDelete && (
                        <ConfirmButton className="btn small danger" message={`Delete ${doc.filename}?`} onConfirm={() => remove.mutate(doc.id)}>Delete</ConfirmButton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {selectedId !== null && (
        <Card
          title={selected.data ? selected.data.filename : `Document #${selectedId}`}
          actions={
            selected.data && (
              <div className="row">
                <button type="button" className="btn" onClick={() => select(null)}>Close</button>
              </div>
            )
          }
        >
          {selected.isPending ? (
            <Spinner />
          ) : selected.error ? (
            <ErrorBanner error={selected.error} />
          ) : (
            <>
              {selected.data!.invoice_id && (
                <InfoBanner tone="success">This document produced invoice <Link to={`/invoices/${selected.data!.invoice_id}`}>#{selected.data!.invoice_id}</Link>. It cannot be deleted while linked.</InfoBanner>
              )}
              {selected.data!.status === "failed" && (
                <InfoBanner tone="warn"><div><strong>OCR failed.</strong> {selected.data!.error} — the file is kept; use “Re-run OCR”.</div></InfoBanner>
              )}
              <div className="grid two">
                <KeyValue
                  items={[
                    ["Status", selected.data!.status],
                    ["Engine", selected.data!.engine ?? "—"],
                    ["Pages", String(selected.data!.page_count)],
                    ["Uploaded by", `user #${selected.data!.uploaded_by_id}`],
                    ["Processed", displayDateTime(selected.data!.processed_at)],
                    ["SHA-256", <code key="sha" className="small">{selected.data!.sha256.slice(0, 16)}…</code>],
                  ]}
                />
                {selected.data!.extracted_fields && (
                  <KeyValue
                    items={[
                      ["Invoice number", selected.data!.extracted_fields.invoice_numbers.join(", ") || "—"],
                      ["Dates", selected.data!.extracted_fields.dates.join(", ") || "—"],
                      ["GSTINs", selected.data!.extracted_fields.gstins.join(", ") || "—"],
                      ["HSN / SAC", selected.data!.extracted_fields.hsn_codes.join(", ") || "—"],
                      ["Total", selected.data!.extracted_fields.total_amount !== null ? money(selected.data!.extracted_fields.total_amount) : "—"],
                      ["Place of supply", selected.data!.extracted_fields.place_of_supply_code ?? "—"],
                    ]}
                  />
                )}
              </div>
              {rows !== null && (
                <div style={{ marginTop: "1rem" }}>
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
                    <div>
                      <h4 style={{ margin: "0 0 0.25rem" }}>Item table ({rows.length} row{rows.length === 1 ? "" : "s"})</h4>
                      <p className="muted small" style={{ margin: 0 }}>
                        Read from the document&apos;s own table layout. Correct anything OCR got wrong — these
                        values, not the scanned ones, become the invoice&apos;s line items.
                      </p>
                    </div>
                    {canWriteInvoices && (
                      <div className="row">
                        <button type="button" className="btn small" onClick={() => setRows([...(rows ?? []), blankRow()])}>Add row</button>
                        <button
                          type="button"
                          className="btn small"
                          onClick={() => setRows(selected.data!.extracted_fields?.line_items ?? [])}
                          disabled={JSON.stringify(rows) === JSON.stringify(selected.data!.extracted_fields?.line_items ?? [])}
                        >
                          Reset to scanned
                        </button>
                      </div>
                    )}
                  </div>

                  {rows.length === 0 ? (
                    <InfoBanner tone="warn">
                      No item table could be read from this scan — the engine returned no row positions.
                      {canWriteInvoices ? " Use “Add row” to enter the lines by hand." : ""}
                    </InfoBanner>
                  ) : (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Description</th><th>HSN / SAC</th><th className="num">Qty</th>
                            <th>Unit</th><th className="num">Rate</th><th className="num">GST %</th>
                            <th className="num">Amount</th>{canWriteInvoices && <th></th>}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row, index) => (
                            <tr key={index}>
                              <td style={{ minWidth: "14rem" }}>
                                {canWriteInvoices ? (
                                  <Input
                                    aria-label={`Description, row ${index + 1}`}
                                    value={row.description}
                                    onChange={(e) => editRow(index, { description: e.target.value })}
                                  />
                                ) : (
                                  row.description || "—"
                                )}
                                {row.warnings.length > 0 && (
                                  <div className="muted small" style={{ color: "var(--warn-fg, #92400e)" }}>
                                    {row.warnings.map((w) => (
                                      <div key={w}>⚠ {w}</div>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td>
                                {canWriteInvoices ? (
                                  <Input aria-label={`HSN, row ${index + 1}`} value={row.hsn_code ?? ""} onChange={(e) => editRow(index, { hsn_code: text(e.target.value) })} />
                                ) : (row.hsn_code ?? "—")}
                              </td>
                              <td className="num">
                                {canWriteInvoices ? (
                                  <Input aria-label={`Quantity, row ${index + 1}`} type="number" step="any" value={row.quantity ?? ""} onChange={(e) => editRow(index, { quantity: num(e.target.value) })} />
                                ) : (row.quantity ?? "—")}
                              </td>
                              <td>
                                {canWriteInvoices ? (
                                  <Input aria-label={`Unit, row ${index + 1}`} value={row.unit ?? ""} onChange={(e) => editRow(index, { unit: text(e.target.value) })} />
                                ) : (row.unit ?? "—")}
                              </td>
                              <td className="num">
                                {canWriteInvoices ? (
                                  <Input aria-label={`Rate, row ${index + 1}`} type="number" step="any" value={row.unit_price ?? ""} onChange={(e) => editRow(index, { unit_price: num(e.target.value) })} />
                                ) : (row.unit_price !== null ? money(row.unit_price) : "—")}
                              </td>
                              <td className="num">
                                {canWriteInvoices ? (
                                  <Input aria-label={`GST rate, row ${index + 1}`} type="number" step="any" value={row.gst_rate ?? ""} onChange={(e) => editRow(index, { gst_rate: num(e.target.value) })} />
                                ) : (row.gst_rate !== null ? `${row.gst_rate}%` : "—")}
                              </td>
                              <td className="num">
                                {canWriteInvoices ? (
                                  <Input aria-label={`Amount, row ${index + 1}`} type="number" step="any" value={row.amount ?? ""} onChange={(e) => editRow(index, { amount: num(e.target.value) })} />
                                ) : (row.amount !== null ? money(row.amount) : "—")}
                              </td>
                              {canWriteInvoices && (
                                <td className="num">
                                  <button type="button" className="btn small danger" aria-label={`Remove row ${index + 1}`} onClick={() => setRows(rows.filter((_, i) => i !== index))}>Remove</button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {canWriteInvoices && selected.data!.status === "processed" && !selected.data!.invoice_id && (
                    <div className="row" style={{ marginTop: "1rem", alignItems: "flex-end" }}>
                      <Field
                        label="Customer"
                        className="grow"
                        hint={
                          buyerGstins.length
                            ? `GSTIN on the scan: ${buyerGstins.join(", ")}`
                            : "No buyer GSTIN was read from the scan — pick the customer yourself."
                        }
                      >
                        <Select value={clientId} onChange={(e) => setClientId(e.target.value ? Number(e.target.value) : "")}>
                          <option value="">Choose on the invoice form</option>
                          {(clients.data ?? []).map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}{c.gstin ? ` (${c.gstin})` : ""}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <button type="button" className="btn primary" onClick={() => createInvoice(selected.data!)}>
                        Create invoice from this
                      </button>
                    </div>
                  )}
                  {canWriteInvoices && buyerGstins.length > 0 && clientId === "" && (clients.data ?? []).length > 0 && (
                    <p className="muted small">
                      No client carries {buyerGstins.join(" or ")} yet — <Link to="/clients/new">add the client</Link> to link it automatically next time.
                    </p>
                  )}
                </div>
              )}

              {selected.data!.extracted_fields?.structured && (() => {
                const s = selected.data!.extracted_fields!.structured;
                return (
                  <div style={{ marginTop: "1.25rem" }}>
                    <h4 style={{ margin: "0 0 0.25rem" }}>Who is who on this document</h4>
                    <p className="muted small" style={{ marginTop: 0 }}>
                      Each value is attributed to a party from where it sits on the page. A GSTIN in the
                      wrong column files the invoice against the wrong taxpayer, so check these before creating one.
                    </p>
                    {s.warnings.length > 0 && (
                      <InfoBanner tone="warn">
                        <div>
                          {s.warnings.map((w) => (
                            <div key={w}>⚠ {w}</div>
                          ))}
                        </div>
                      </InfoBanner>
                    )}
                    <div className="grid three">
                      <PartyCard title="Supplier" party={s.supplier} />
                      <PartyCard title="Bill to" party={s.recipient} />
                      <PartyCard title="Ship to" party={s.shipping} />
                    </div>
                    <div className="grid two" style={{ marginTop: "0.75rem" }}>
                      <KeyValue
                        items={[
                          ["Document", s.document.document_type_label ?? s.document.document_type ?? "—"],
                          ["Number", s.document.document_number ?? "—"],
                          ["Date", s.document.document_date ?? "—"],
                          ["Supply type", s.document.supply_type ?? "—"],
                          ["Place of supply", s.document.place_of_supply_code ? `${s.document.place_of_supply ?? ""} (${s.document.place_of_supply_code})`.trim() : "—"],
                          ["IRN", s.document.irn ? <code key="irn" className="small">{s.document.irn.slice(0, 16)}…</code> : "—"],
                        ]}
                      />
                      <KeyValue
                        items={[
                          ["Taxable value", s.totals.assessable_value !== null ? money(s.totals.assessable_value) : "—"],
                          ["IGST", s.totals.igst_value !== null ? money(s.totals.igst_value) : "—"],
                          ["CGST", s.totals.cgst_value !== null ? money(s.totals.cgst_value) : "—"],
                          ["SGST", s.totals.sgst_value !== null ? money(s.totals.sgst_value) : "—"],
                          ["Invoice total", s.totals.total_invoice_value !== null ? money(s.totals.total_invoice_value) : "—"],
                        ]}
                      />
                    </div>
                    {s.evidence.length > 0 && (
                      <details style={{ marginTop: "0.75rem" }}>
                        <summary>How each value was found ({s.evidence.length})</summary>
                        <div className="table-wrap">
                          <table>
                            <thead>
                              <tr><th>Field</th><th>Value</th><th>Matched label</th><th>Method</th><th className="num">Confidence</th></tr>
                            </thead>
                            <tbody>
                              {s.evidence.map((e) => (
                                <tr key={`${e.section}-${e.field_name}`}>
                                  <td><span className="muted small">{e.section} · </span>{e.field_name.replace(/_/g, " ")}</td>
                                  <td>{String(e.value)}</td>
                                  <td>{e.matched_label ?? <span className="muted">—</span>}</td>
                                  <td><span className="pill">{e.method}</span></td>
                                  <td className="num">{e.confidence.toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p className="muted small">
                          Confidence ranks how the value was found — read off a label, inferred from position, or a
                          fuzzy match — so you know where to look first. It is not a probability of being right.
                        </p>
                      </details>
                    )}
                  </div>
                );
              })()}

              {selected.data!.full_text && (
                <details style={{ marginTop: "1rem" }}>
                  <summary>Recognised text</summary>
                  <pre className="json" style={{ background: "var(--surface-2)", color: "inherit" }}>{selected.data!.full_text}</pre>
                </details>
              )}
            </>
          )}
        </Card>
      )}
    </>
  );
}
