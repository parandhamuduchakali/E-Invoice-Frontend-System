import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "@/api/client";
import { clientsApi, invoicesApi } from "@/api/endpoints";
import type { InvoiceStatus, IrnRecordRequest } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { InvoicePreview } from "@/components/InvoicePreview";
import { DownloadIcon, PrintIcon } from "@/components/icons";
import { useStateName } from "@/components/StateCodeSelect";
import { Card, ConfirmButton, ErrorBanner, Field, InfoBanner, Input, KeyValue, PageHeader, Select, Spinner, StatusBadge, Textarea } from "@/components/ui";
import { displayDate, displayDateTime, titleCase } from "@/lib/format";
import { can } from "@/lib/permissions";

export function InvoiceDetailPage() {
  const { user, seller } = useAuth();
  const canWrite = can(user, "invoices:write");
  const canDelete = can(user, "invoices:delete");
  const canEinvoice = can(user, "einvoice:generate");
  const canIrn = can(user, "irn:record");
  const { id } = useParams();
  const invoiceId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const invoice = useQuery({ queryKey: ["invoices", invoiceId], queryFn: () => invoicesApi.get(invoiceId) });
  const client = useQuery({ queryKey: ["clients", invoice.data?.client_id], queryFn: () => clientsApi.get(invoice.data!.client_id), enabled: Boolean(invoice.data) });
  const readiness = useQuery({ queryKey: ["invoices", invoiceId, "readiness"], queryFn: () => invoicesApi.readiness(invoiceId), enabled: canEinvoice && Boolean(invoice.data) && !invoice.data?.irn });
  const posName = useStateName(invoice.data?.place_of_supply);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["invoices"] });

  const setStatus = useMutation({ mutationFn: (status: InvoiceStatus) => invoicesApi.update(invoiceId, { status }), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: () => invoicesApi.remove(invoiceId), onSuccess: () => { invalidate(); navigate("/invoices"); } });

  const [payload, setPayload] = useState<string | null>(null);
  const generate = useMutation({ mutationFn: () => invoicesApi.einvoice(invoiceId), onSuccess: (doc) => setPayload(JSON.stringify(doc, null, 2)) });

  const [irnForm, setIrnForm] = useState<IrnRecordRequest>({ irn: "", ack_no: "", ack_date: "", signed_qr_code: "" });
  const recordIrn = useMutation({ mutationFn: (body: IrnRecordRequest) => invoicesApi.recordIrn(invoiceId, body), onSuccess: () => { invalidate(); setPayload(null); } });

  if (invoice.isPending) return <Spinner />;
  if (invoice.error) return <ErrorBanner error={invoice.error} />;
  const inv = invoice.data!;
  const locked = inv.allowed_status_transitions.length === 0; // paid / cancelled are terminal

  function copyPayload() {
    if (payload) void navigator.clipboard?.writeText(payload);
  }

  function downloadPayload() {
    if (!payload) return;
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${inv.invoice_number}-einvoice.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function submitIrn(event: FormEvent) {
    event.preventDefault();
    recordIrn.mutate({ ...irnForm, irn: irnForm.irn.trim().toLowerCase(), signed_qr_code: irnForm.signed_qr_code?.trim() || null });
  }

  return (
    <>
      <div className="no-print">
        <PageHeader
          title={inv.invoice_number}
          subtitle={<><StatusBadge status={inv.status} /> &nbsp; {inv.document_type} · {inv.supply_type} · issued {displayDate(inv.issue_date)} · due {displayDate(inv.due_date)} · <Link to="/invoices">All invoices</Link></>}
          actions={
            <>
              {canWrite && !inv.irn && !locked && <Link to={`/invoices/${inv.id}/edit`} className="btn">Edit</Link>}
              {canWrite && !locked && (
                <Select value={inv.status} onChange={(e) => setStatus.mutate(e.target.value as InvoiceStatus)} disabled={setStatus.isPending} style={{ width: 170 }} aria-label="Change status" title="Only the next allowed statuses are offered">
                  <option value={inv.status}>{titleCase(inv.status)}</option>
                  {inv.allowed_status_transitions.map((s) => <option key={s} value={s}>→ {titleCase(s)}</option>)}
                </Select>
              )}
              {canDelete && inv.status !== "paid" && !inv.irn && (
                <ConfirmButton message={`Delete ${inv.invoice_number}? This cannot be undone.`} onConfirm={() => remove.mutate()}>Delete</ConfirmButton>
              )}
            </>
          }
        />
        <ErrorBanner error={setStatus.error ?? remove.error} onDismiss={() => { setStatus.reset(); remove.reset(); }} />

        {inv.irn && (
          <InfoBanner tone="success">
            <div>
              <strong>Registered with the IRP.</strong> IRN <code className="qr">{inv.irn}</code> · Ack {inv.ack_no} on {inv.ack_date}. Financial fields are locked; only status, notes and terms can change.
            </div>
          </InfoBanner>
        )}
        {locked && !inv.irn && <InfoBanner tone="info">This invoice is {inv.status} and can no longer be edited.</InfoBanner>}
      </div>

      <div className="detail-layout">
        <InvoicePreview
          invoice={inv}
          client={client.data ?? null}
          seller={seller}
          actions={
            <>
              <button type="button" className="btn" onClick={() => window.print()}><PrintIcon size={18} /> Print</button>
              {canEinvoice && !inv.irn && (
                <button type="button" className="btn primary" onClick={() => generate.mutate()} disabled={generate.isPending || readiness.data?.ready === false} title={readiness.data?.ready === false ? "Fix the readiness checklist first" : "Build the INV-01 JSON for the IRP"}>
                  <DownloadIcon size={18} /> {generate.isPending ? "Generating…" : "Export INV-01"}
                </button>
              )}
            </>
          }
        />

        <aside className="detail-side no-print">
          <Card title="Buyer">
            {client.data ? (
              <KeyValue
                items={[
                  ["Name", <Link key="n" to={`/clients/${client.data.id}/edit`}>{client.data.legal_name ?? client.data.name}</Link>],
                  ["GSTIN", client.data.gstin ? <code key="g">{client.data.gstin}</code> : <span key="g" className="pill warn">URP / unregistered</span>],
                  ["State code", client.data.state_code],
                  ["Place of supply", inv.place_of_supply ? `${inv.place_of_supply} — ${posName}` : "—"],
                  ["Contact", [client.data.email, client.data.phone].filter(Boolean).join(" · ") || "—"],
                ]}
              />
            ) : <Spinner />}
          </Card>
          <Card title="Document details">
            <KeyValue
              items={[
                ["Reverse charge", inv.reverse_charge ? "Yes" : "No"],
                ["IGST on intra", inv.igst_on_intra ? "Yes" : "No"],
                ["Preceding doc.", inv.preceding_invoice_number ? `${inv.preceding_invoice_number} (${displayDate(inv.preceding_invoice_date)})` : "—"],
                ["Ship to", inv.ship_to ? `${inv.ship_to.legal_name}, ${inv.ship_to.location} ${inv.ship_to.pincode}` : "—"],
                ["Dispatch from", inv.dispatch_from ? `${inv.dispatch_from.name}, ${inv.dispatch_from.location} ${inv.dispatch_from.pincode}` : "—"],
                ["Source", inv.document_id ? <Link key="d" to={`/documents?id=${inv.document_id}`}>Scanned document #{inv.document_id}</Link> : inv.source_reference ? `Ref. ${inv.source_reference}` : "Entered manually"],
                ["Created", displayDateTime(inv.created_at)],
                ["Updated", displayDateTime(inv.updated_at)],
              ]}
            />
          </Card>
        </aside>
      </div>

      {canEinvoice && !inv.irn && (
        <Card
          className="no-print"
          title="GST e-invoice (IRP)"
          actions={
            <div className="row">
              <button type="button" className="btn" onClick={() => readiness.refetch()} disabled={readiness.isFetching}>Re-check</button>
            </div>
          }
        >
          {readiness.isPending ? (
            <Spinner label="Checking mandatory fields…" />
          ) : readiness.data?.ready ? (
            <InfoBanner tone="success">All mandatory fields are present. Export the INV-01 JSON above, submit it to the IRP through your GSP, then record the response below.</InfoBanner>
          ) : (
            <InfoBanner tone="warn">
              <div>
                <strong>Not ready for the IRP.</strong> Fix these first:
                <ul className="readiness" style={{ margin: "0.4rem 0 0 1rem" }}>
                  {readiness.data?.errors.map((e) => <li key={e}>{e}</li>)}
                </ul>
                <div className="small" style={{ marginTop: "0.5rem" }}>
                  Seller fields → <Link to="/profile">Seller profile</Link>. Buyer fields → <Link to={`/clients/${inv.client_id}/edit`}>edit client</Link>. HSN codes → <Link to={`/invoices/${inv.id}/edit`}>edit invoice</Link>.
                </div>
              </div>
            </InfoBanner>
          )}
          <ErrorBanner error={generate.error} onDismiss={() => generate.reset()} />

          {payload && (
            <>
              <div className="row" style={{ marginBottom: "0.5rem" }}>
                <button type="button" className="btn small" onClick={copyPayload}>Copy JSON</button>
                <button type="button" className="btn small" onClick={downloadPayload}><DownloadIcon size={16} /> Download JSON</button>
              </div>
              <pre className="json">{payload}</pre>
            </>
          )}

          {!canIrn && (
            <InfoBanner tone="info">Recording the IRN is reserved for managers and admins. Hand the generated JSON and the IRP response to your workspace manager.</InfoBanner>
          )}
          {canIrn && (
            <form onSubmit={submitIrn} style={{ marginTop: "1.25rem" }}>
              <h3>Record IRP response</h3>
              <ErrorBanner error={recordIrn.error} onDismiss={() => recordIrn.reset()} />
              <div className="grid two">
                <Field label="IRN" required hint="64 hexadecimal characters." error={irnForm.irn && !/^[0-9a-fA-F]{64}$/.test(irnForm.irn.trim()) ? "Must be exactly 64 hex characters." : null}>
                  <Input value={irnForm.irn} onChange={(e) => setIrnForm({ ...irnForm, irn: e.target.value })} spellCheck={false} />
                </Field>
                <Field label="Acknowledgement number" required>
                  <Input value={irnForm.ack_no} onChange={(e) => setIrnForm({ ...irnForm, ack_no: e.target.value })} />
                </Field>
                <Field label="Acknowledgement date" required hint="As returned by the IRP, e.g. 2026-01-15 10:30:00">
                  <Input value={irnForm.ack_date} onChange={(e) => setIrnForm({ ...irnForm, ack_date: e.target.value })} />
                </Field>
                <Field label="Signed QR code" hint="Optional JWT string from the IRP response.">
                  <Textarea rows={2} value={irnForm.signed_qr_code ?? ""} onChange={(e) => setIrnForm({ ...irnForm, signed_qr_code: e.target.value })} />
                </Field>
              </div>
              <button className="btn primary" type="submit" disabled={recordIrn.isPending || readiness.data?.ready === false || !/^[0-9a-fA-F]{64}$/.test(irnForm.irn.trim()) || !irnForm.ack_no || !irnForm.ack_date}>
                {recordIrn.isPending ? "Saving…" : "Record IRN"}
              </button>
              {recordIrn.error instanceof ApiError && recordIrn.error.status === 409 && (
                <p className="muted small">That IRN is already recorded on another invoice.</p>
              )}
            </form>
          )}
        </Card>
      )}

      {inv.irn && inv.signed_qr_code && (
        <Card title="Signed QR code" className="no-print">
          <code className="qr small">{inv.signed_qr_code}</code>
        </Card>
      )}
    </>
  );
}
