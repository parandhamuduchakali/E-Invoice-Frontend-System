import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { documentsApi } from "@/api/endpoints";
import type { StoredDocument, StoredDocumentSummary } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { Card, ConfirmButton, EmptyState, ErrorBanner, InfoBanner, KeyValue, PageHeader, Spinner } from "@/components/ui";
import { displayDateTime, money } from "@/lib/format";
import { ocrToInvoiceDraft } from "@/lib/ocrToInvoice";
import { can } from "@/lib/permissions";

const STATUS_TONE: Record<StoredDocumentSummary["status"], string> = {
  pending: "pill",
  processed: "pill good",
  failed: "pill warn",
};

function kb(bytes: number): string {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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

  function select(id: number | null) {
    setParams(id === null ? {} : { id: String(id) }, { replace: true });
  }

  async function download(doc: StoredDocumentSummary) {
    try {
      const blob = await documentsApi.file(doc.id);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      setDownloadError(error);
    }
  }

  function createInvoice(doc: StoredDocument) {
    if (!doc.extracted_fields) return;
    const draft = ocrToInvoiceDraft(doc.extracted_fields, seller, doc.id);
    navigate("/invoices/new", { state: { draft: draft.invoice, notes: draft.notes, buyerGstins: draft.buyerGstinCandidates } });
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
                {canWriteInvoices && selected.data.status === "processed" && !selected.data.invoice_id && (
                  <button type="button" className="btn primary" onClick={() => createInvoice(selected.data!)}>Create invoice from this</button>
                )}
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
