import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { documentsApi, ocrApi } from "@/api/endpoints";
import type { OcrDocument, OcrExtractOptions, PipelineInfo, StoredDocument } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { Card, Checkbox, ErrorBanner, errorMessage, Field, InfoBanner, Input, KeyValue, PageHeader, Spinner } from "@/components/ui";
import { money } from "@/lib/format";
import { ocrToInvoiceDraft } from "@/lib/ocrToInvoice";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.tif,.tiff,.bmp,.webp,application/pdf,image/*";

/**
 * A stored document as the synchronous endpoint would have returned it.
 *
 * The page renders one shape whether the result arrived from the upload itself
 * (a duplicate, already processed) or from polling; keeping the mapping in one
 * place is what makes those two paths agree.
 */
function toOcrDocument(document: StoredDocument, duplicate: boolean): OcrDocument | null {
  if (document.status !== "processed" || !document.extracted_fields) return null;
  return {
    document_id: document.id,
    duplicate,
    filename: document.filename,
    source_type: document.content_type === "application/pdf" ? "pdf" : "image",
    engine: document.engine ?? "",
    page_count: document.page_count,
    pages: [],
    full_text: document.full_text ?? "",
    extracted_fields: document.extracted_fields,
  } as OcrDocument;
}

export function OcrPage() {
  // `seller` is the workspace profile; `user` is whoever is signed in. The
  // draft mapper uses it to tell the seller's own GSTIN from the buyer's, and
  // a member account carries no GSTIN of its own — so passing `user` here made
  // the workspace's own GSTIN look like a buyer candidate.
  const { user, seller } = useAuth();
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [options, setOptions] = useState<OcrExtractOptions>({ preprocess: true, deskew: true, denoise: false, binarize: false, use_text_layer: false, dpi: 200 });
  const [result, setResult] = useState<OcrDocument | null>(null);
  const [showLines, setShowLines] = useState(false);

  const status = useQuery({ queryKey: ["ocr", "status"], queryFn: ocrApi.status, staleTime: 60_000 });

  // The upload returns a job id straight away; OCR runs on the server. Polling
  // the document is what tells us it finished — a synchronous call would hold
  // the connection open for the whole parse (~40s for a single page), which
  // browsers and proxies time out.
  const [jobId, setJobId] = useState<number | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const queryClient = useQueryClient();

  const job = useQuery({
    queryKey: ["documents", jobId],
    queryFn: () => documentsApi.get(jobId!),
    enabled: jobId !== null,
    refetchInterval: (query) => {
      // A failed poll leaves `data` undefined. Stopping there would look exactly
      // like a finished job: no spinner, no result, no message. Keep asking, a
      // little more slowly, until the document answers or the user leaves.
      if (query.state.error) return 5000;
      return query.state.data?.status === "pending" ? 2000 : false;
    },
  });

  const extract = useMutation({
    mutationFn: (f: File) => documentsApi.upload(f, options),
    onSuccess: (document) => {
      setDuplicate(document.duplicate);
      // Re-uploading bytes we already scanned returns that record, processed,
      // with the same id. Waiting for the poll to notice would mean waiting for
      // a change that never comes, so a finished document is shown at once and
      // only a pending one is handed to the poller.
      queryClient.setQueryData(["documents", document.id], document);
      setJobId(document.id);
      setResult(toOcrDocument(document, document.duplicate));
    },
  });

  // A finished job carries the same fields the synchronous endpoint returned.
  useEffect(() => {
    const document = job.data;
    if (!document || document.status === "pending") return;
    setResult(toOcrDocument(document, duplicate));
  }, [job.data, duplicate]);

  const working =
    extract.isPending || job.data?.status === "pending" || (jobId !== null && job.isPending && !job.error);
  const failed = job.data?.status === "failed" ? job.data.error : null;

  function pick(files: FileList | null) {
    const f = files?.[0] ?? null;
    setFile(f);
    setResult(null);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    pick(event.dataTransfer.files);
  }

  const fields = result?.extracted_fields;
  const pipelines: PipelineInfo[] = status.data?.pipelines ?? [];
  const pipelineName = options.pipeline ?? status.data?.default_pipeline ?? "rules";
  const pipeline = pipelines.find((p) => p.name === pipelineName) ?? null;
  // OpenCV clean-up only applies when a page is rasterised here; Azure Vision reads the file as-is.
  const localOcr = pipeline ? pipeline.ocr !== "azure-vision" && pipeline.ocr !== "llamaparse" : true;
  const draft = fields ? ocrToInvoiceDraft(fields, seller ?? user, result?.document_id ?? null) : null;
  const tooBig = file && status.data && file.size > status.data.max_file_mb * 1024 * 1024;

  return (
    <>
      <PageHeader
        title="Scan an invoice"
        subtitle="Two ways to read a document: rule-based (OCR on this server, label vocabularies and the table grid) or AI (Azure Vision + Azure OpenAI). Either way the fields are checked and can pre-fill a new invoice."
      />

      {status.data && !status.data.available && (
        <InfoBanner tone="warn">The OCR engine is not installed on the server. Run <code>pip install -r requirements.txt</code> on the backend to enable this page.</InfoBanner>
      )}

      <div className="grid two" style={{ alignItems: "start" }}>
        <Card title="Document">
          <div
            className={`dropzone ${dragging ? "active" : ""}`}
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInput.current?.click(); }}
          >
            <input ref={fileInput} type="file" accept={ACCEPT} hidden onChange={(e) => pick(e.target.files)} />
            {file ? (
              <>
                <strong>{file.name}</strong>
                <div className="muted small">{(file.size / 1024).toFixed(0)} KB · {file.type || "unknown type"}</div>
              </>
            ) : (
              <>
                <strong>Drop a PDF or image here</strong>
                <div className="muted small">or click to choose · PDF, PNG, JPEG, TIFF, BMP, WebP{status.data ? ` · up to ${status.data.max_file_mb} MB, ${status.data.max_pages} pages` : ""}</div>
              </>
            )}
          </div>
          {tooBig && <InfoBanner tone="warn">This file exceeds the server limit of {status.data!.max_file_mb} MB.</InfoBanner>}

          {pipelines.length > 0 && (
            <fieldset style={{ marginTop: "1rem" }}>
              <legend>Extraction method</legend>
              <div className="grid two" style={{ gap: "0.75rem" }}>
                {pipelines.map((p) => (
                  <label
                    key={p.name}
                    className="card"
                    style={{ padding: "0.75rem", cursor: p.available ? "pointer" : "not-allowed", opacity: p.available ? 1 : 0.6, outline: pipelineName === p.name ? "2px solid var(--accent, #2563eb)" : "none" }}
                  >
                    <div className="row" style={{ alignItems: "center" }}>
                      <input type="radio" name="pipeline" value={p.name} checked={pipelineName === p.name} disabled={!p.available} onChange={() => setOptions({ ...options, pipeline: p.name })} />
                      <strong>{p.label}</strong>
                      <span className="pill">{p.ocr} → {p.extractor}</span>
                    </div>
                    <div className="muted small" style={{ marginTop: "0.35rem" }}>{p.description}</div>
                    {p.data_leaves_server && <div className="small" style={{ marginTop: "0.35rem", color: "var(--warn-fg, #92400e)" }}>The document is sent to a third-party service.</div>}
                    {!p.available && <div className="small" style={{ marginTop: "0.35rem" }}>Not available: {p.reason}</div>}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {localOcr && (
          <fieldset style={{ marginTop: "1rem" }}>
            <legend>OpenCV clean-up</legend>
            <div className="row">
              <Checkbox label="Preprocess" checked={options.preprocess ?? true} onChange={(e) => setOptions({ ...options, preprocess: e.target.checked })} />
              <Checkbox label="Deskew" checked={options.deskew ?? true} disabled={!options.preprocess} onChange={(e) => setOptions({ ...options, deskew: e.target.checked })} />
              <Checkbox label="Denoise (noisy scans)" checked={options.denoise ?? false} disabled={!options.preprocess} onChange={(e) => setOptions({ ...options, denoise: e.target.checked })} />
              <Checkbox label="Binarize (faded paper)" checked={options.binarize ?? false} disabled={!options.preprocess} onChange={(e) => setOptions({ ...options, binarize: e.target.checked })} />
            </div>
            <div className="row" style={{ marginTop: "0.75rem" }}>
              <Checkbox label="Use PDF text layer when present" checked={options.use_text_layer ?? false} onChange={(e) => setOptions({ ...options, use_text_layer: e.target.checked })} />
              <Field label="PDF render DPI" className="small">
                <Input type="number" min={72} max={600} step={10} value={options.dpi ?? 200} style={{ width: 100 }} onChange={(e) => setOptions({ ...options, dpi: Number(e.target.value) })} />
              </Field>
            </div>
            <p className="muted small" style={{ margin: "0.5rem 0 0" }}>
              Defaults were tuned on a real GST invoice: denoise off (it smears small table text), deskew on, small images upscaled automatically.
            </p>
          </fieldset>
          )}

          <div className="row">
            <button
              type="button"
              className="btn primary"
              disabled={!file || working || Boolean(tooBig) || (pipeline ? !pipeline.available : status.data?.available === false)}
              onClick={() => file && extract.mutate(file)}
            >
              {working
                ? pipelineName === "ai" ? "Reading with Azure…" : "Recognising… (about a minute per page on CPU)"
                : pipelineName === "ai" ? "Extract with AI" : "Extract fields"}
            </button>
            {file && <button type="button" className="btn" onClick={() => pick(null)}>Clear</button>}
            {status.data && (
              <span className="muted small">
                {pipeline ? `${pipeline.ocr} → ${pipeline.extractor}` : `Engine: ${status.data.engine} · ${status.data.profile} · ${status.data.lang}`}
              </span>
            )}
          </div>
          <ErrorBanner error={extract.error} onDismiss={() => extract.reset()} />
          {job.error && (
            <InfoBanner tone="warn">
              Could not read the job’s progress: {errorMessage(job.error)} Still trying — the document is
              safe either way and can be opened from the Documents page.
            </InfoBanner>
          )}
          {failed && <InfoBanner tone="warn">OCR failed: {failed} You can retry it from the Documents page.</InfoBanner>}
          {result?.document_id && (
            <InfoBanner tone={result.duplicate ? "warn" : "success"}>
              <div>
                {result.duplicate
                  ? "This exact file was uploaded before, so the stored copy was reused rather than scanned again. Re-run it from the Documents page if you want a fresh read. "
                  : "Stored as "}
                <Link to={`/documents?id=${result.document_id}`}>document #{result.document_id}</Link>; it can be reviewed or re-run from the Documents page.
              </div>
            </InfoBanner>
          )}
        </Card>

        <Card title="Extracted GST fields" actions={result && <span className="muted small">{result.page_count} page{result.page_count === 1 ? "" : "s"} · {result.pages.reduce((n, p) => n + p.lines.length, 0)} lines</span>}>
          {working ? (
            <Spinner label="Running OCR…" />
          ) : !fields ? (
            <p className="muted">Upload a document to see invoice number, dates, GSTINs, HSN codes, totals and place of supply.</p>
          ) : (
            <>
              {(fields.extraction_notes?.length ?? 0) > 0 && (
                <InfoBanner tone={fields.extraction_notes.some((n) => /failed|Dropped/.test(n)) ? "warn" : "info"}>
                  <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                    {fields.extraction_notes.map((note) => <li key={note}>{note}</li>)}
                  </ul>
                </InfoBanner>
              )}
              <KeyValue
                items={[
                  ["Extracted by", fields.extraction_method === "ai" ? "AI (Azure OpenAI), grounded against the OCR text" : "Rule-based (labels, layout, table grid)"],
                  ["Invoice number", fields.invoice_numbers.join(", ") || "—"],
                  ["Dates", fields.dates.join(", ") || "—"],
                  ["GSTINs (valid)", fields.gstins.length ? fields.gstins.map((g) => <code key={g} style={{ marginRight: 6 }}>{g}</code>) : "—"],
                  ["GSTIN-like (check digit failed)", fields.invalid_gstins.join(", ") || "—"],
                  ["IRN", fields.irn ? <code className="qr">{fields.irn}</code> : "—"],
                  ["HSN / SAC", fields.hsn_codes.join(", ") || "—"],
                  ["GST rates", fields.gst_rates.map((r) => `${r}%`).join(", ") || "—"],
                  ["Total", fields.total_amount !== null ? money(fields.total_amount) : "—"],
                  ["Place of supply", fields.place_of_supply ? `${fields.place_of_supply}${fields.place_of_supply_code ? ` (${fields.place_of_supply_code})` : ""}` : "—"],
                  ["State codes", fields.state_codes.join(", ") || "—"],
                  ["Reverse charge", fields.reverse_charge === null ? "—" : fields.reverse_charge ? "Yes" : "No"],
                  ["Currency", fields.currency ?? "—"],
                ]}
              />

              {fields.line_items.length > 0 && (
                <div style={{ marginTop: "1rem" }}>
                  <h4 style={{ margin: "0 0 0.5rem" }}>Item table ({fields.line_items.length} rows)</h4>
                  <p className="muted small" style={{ marginTop: 0 }}>
                    Read from the document's own table layout. These become the invoice's line items — check them.
                  </p>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Description</th><th>HSN / SAC</th><th className="num">Qty</th>
                          <th>Unit</th><th className="num">Rate</th><th className="num">GST</th><th className="num">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fields.line_items.map((row, index) => (
                          <tr key={`${row.description}-${index}`}>
                            <td>
                              {row.description || "—"}
                              {row.warnings.length > 0 && (
                                <div className="muted small" style={{ color: "var(--warn-fg, #92400e)" }}>
                                  {row.warnings.map((w) => (
                                    <div key={w}>⚠ {w}</div>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td>{row.hsn_code ?? "—"}</td>
                            <td className="num">{row.quantity ?? "—"}</td>
                            <td>{row.unit ?? "—"}</td>
                            <td className="num">{row.unit_price !== null ? money(row.unit_price) : "—"}</td>
                            <td className="num">{row.gst_rate !== null ? `${row.gst_rate}%` : "—"}</td>
                            <td className="num">{row.amount !== null ? money(row.amount) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {draft && (
                <div style={{ marginTop: "1rem" }}>
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => navigate("/invoices/new", { state: { draft: draft.invoice, notes: draft.notes, buyerGstins: draft.buyerGstinCandidates } })}
                  >
                    Create invoice from this
                  </button>
                  {draft.buyerGstinCandidates.length > 0 && (
                    <p className="muted small" style={{ marginTop: "0.5rem" }}>
                      Buyer GSTIN {draft.buyerGstinCandidates.join(", ")} — if no client has it yet, <Link to="/clients/new">add the client</Link> first.
                    </p>
                  )}
                </div>
              )}

              {Object.keys(fields.key_values).length > 0 && (
                <details style={{ marginTop: "1rem" }}>
                  <summary>All label / value pairs ({Object.keys(fields.key_values).length})</summary>
                  <KeyValue items={Object.entries(fields.key_values).map(([k, v]) => [k, v.join(" | ")])} />
                </details>
              )}
            </>
          )}
        </Card>
      </div>

      {result && (
        <Card title="Recognised text" actions={<button type="button" className="btn small" onClick={() => setShowLines((s) => !s)}>{showLines ? "Show plain text" : "Show lines with confidence"}</button>}>
          {result.pages.map((page) => (
            <div key={page.page_number} style={{ marginBottom: "1rem" }}>
              <div className="muted small">Page {page.page_number} · {page.width}×{page.height}px · skew corrected {page.skew_degrees}°</div>
              {showLines ? (
                <div className="ocr-lines">
                  <table className="table-compact">
                    <tbody>
                      {page.lines.map((line, i) => (
                        <tr key={i} className={line.confidence < 0.8 ? "low" : ""}>
                          <td className="num muted small" style={{ width: 60 }}>{(line.confidence * 100).toFixed(0)}%</td>
                          <td>{line.text}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <pre className="json" style={{ background: "var(--surface-2)", color: "inherit" }}>{page.text}</pre>
              )}
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
