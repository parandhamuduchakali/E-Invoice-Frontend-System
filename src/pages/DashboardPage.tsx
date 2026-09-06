import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { clientsApi, invoicesApi } from "@/api/endpoints";
import { INVOICE_STATUSES, type InvoiceStatus } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { InvoicePreview } from "@/components/InvoicePreview";
import { ExternalIcon, PlusIcon, PrintIcon, ScanIcon } from "@/components/icons";
import { Card, EmptyState, ErrorBanner, InfoBanner, PageHeader, Select, Spinner, Stat } from "@/components/ui";
import { displayDate, money, titleCase } from "@/lib/format";
import { can, isWorkspaceOwner } from "@/lib/permissions";

export function DashboardPage() {
  const { user, seller } = useAuth();
  const [params, setParams] = useSearchParams();
  // Client-wise dashboard: ?client=<id>. Client-portal users are pinned server-side anyway.
  const clientParam = params.get("client") ?? "";
  const clientFilter = clientParam ? Number(clientParam) : "";
  const status = (params.get("status") ?? "") as InvoiceStatus | "";
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const stats = useQuery({ queryKey: ["invoices", "stats", { clientFilter }], queryFn: () => invoicesApi.stats(clientFilter) });
  const recent = useQuery({
    queryKey: ["invoices", "list", { page: 1, size: 12, clientFilter, status }],
    queryFn: () => invoicesApi.list({ page: 1, size: 12, client_id: clientFilter, status }),
  });
  const clients = useQuery({ queryKey: ["clients"], queryFn: clientsApi.list });
  const selectedClient = clients.data?.find((c) => c.id === clientFilter);

  // Preview the first invoice in the list until the user picks another one.
  const items = recent.data?.items ?? [];
  useEffect(() => {
    if (!items.length) {
      setSelectedId(null);
      return;
    }
    if (selectedId === null || !items.some((i) => i.id === selectedId)) setSelectedId(items[0]!.id);
  }, [items, selectedId]);

  const selected = useQuery({ queryKey: ["invoices", selectedId], queryFn: () => invoicesApi.get(selectedId!), enabled: selectedId !== null });
  const selectedBuyer = clients.data?.find((c) => c.id === selected.data?.client_id) ?? null;

  const gstReady = Boolean(user?.gstin && user?.state_code && user?.legal_name && user?.address1 && user?.pincode && user?.location);
  const clientCount = clients.data?.length ?? 0;
  const invoiceCount = stats.data?.total_invoices ?? 0;
  const loaded = !stats.isPending && !clients.isPending;
  const canWrite = can(user, "invoices:write");
  const canOcr = can(user, "ocr:run");
  const owner = isWorkspaceOwner(user);
  const showOnboarding = loaded && canWrite && (invoiceCount === 0 || clientCount === 0 || (owner && !gstReady));

  const clientName = (id: number) => clients.data?.find((c) => c.id === id)?.name ?? `Client #${id}`;
  const setFilter = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
    setParams(next);
  };

  return (
    <>
      <PageHeader
        title={`Hello, ${user?.full_name ?? ""}`}
        subtitle={selectedClient ? <>Showing <strong>{selectedClient.name}</strong> only. <Link to="/">All clients</Link></> : "Overview of your invoicing and GST e-invoice status."}
        actions={
          <>
            {user?.role !== "client" && clientCount > 0 && (
              <Select value={clientParam} aria-label="Dashboard client filter" style={{ width: 220 }} onChange={(e) => setFilter({ client: e.target.value })}>
                <option value="">All clients</option>
                {clients.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            )}
            {canOcr && <Link to="/ocr" className="btn"><ScanIcon size={18} /> Scan</Link>}
          </>
        }
      />

      <ErrorBanner error={stats.error ?? recent.error ?? clients.error} />

      {showOnboarding && (
        <Card title="Get set up" className="onboarding">
          <ol className="steps">
            {owner && <li className={gstReady ? "done" : ""}>
              <strong>Seller profile</strong> — your GSTIN, legal name and registered address go into every e-invoice.{" "}
              {gstReady ? <span className="pill good">Done</span> : <Link to="/profile" className="btn small primary">Complete profile</Link>}
            </li>}
            <li className={clientCount ? "done" : ""}>
              <strong>Clients</strong> — add each buyer once with GSTIN and state code; invoices are created client by client.{" "}
              {clientCount ? <span className="pill good">{clientCount} client{clientCount === 1 ? "" : "s"}</span> : <Link to="/clients/new" className="btn small primary">Add a client</Link>}
            </li>
            <li className={invoiceCount ? "done" : ""}>
              <strong>Invoices</strong> — pick a client, add line items with HSN codes, and the CGST/SGST or IGST split is computed for you.{" "}
              {invoiceCount ? <span className="pill good">{invoiceCount} invoice{invoiceCount === 1 ? "" : "s"}</span> : clientCount ? <Link to="/invoices/new" className="btn small primary">Create an invoice</Link> : <span className="muted small">needs a client first</span>}
            </li>
            {canOcr && <li>
              <strong>Scan instead of typing</strong> — upload a PDF or photo of an invoice and let OCR pre-fill the form.{" "}
              <Link to="/ocr" className="btn small">Scan an invoice</Link>
            </li>}
          </ol>
        </Card>
      )}

      {!showOnboarding && owner && !gstReady && can(user, "seller_profile:write") && (
        <InfoBanner tone="warn">
          Your GST seller profile is incomplete, so invoices cannot be registered with the IRP yet.{" "}
          <Link to="/profile">Complete it now</Link>.
        </InfoBanner>
      )}

      <div className="grid four stats-row">
        <Stat label="Total invoices" value={stats.isPending ? "…" : invoiceCount} hint={stats.data ? money(stats.data.total_amount) : undefined} />
        <Stat label="Paid" value={stats.isPending ? "…" : money(stats.data?.total_paid)} tone="good" hint={stats.data ? `${stats.data.by_status.paid ?? 0} invoices` : undefined} />
        <Stat label="Pending (sent)" value={stats.isPending ? "…" : money(stats.data?.total_pending)} tone="warn" hint={stats.data ? `${stats.data.by_status.sent ?? 0} invoices` : undefined} />
        <Stat label="Overdue" value={stats.isPending ? "…" : stats.data?.overdue_count ?? 0} tone={stats.data?.overdue_count ? "bad" : undefined} hint={stats.data ? money(stats.data.amount_by_status.overdue) : undefined} />
      </div>

      <div className="master-detail">
        <section className="master">
          <div className="master-toolbar">
            <label className="field">
              <span className="field-label">Invoice</span>
              <Select value={status} aria-label="Filter by status" onChange={(e) => setFilter({ status: e.target.value })}>
                <option value="">All</option>
                {INVOICE_STATUSES.map((s) => (
                  <option key={s} value={s}>{titleCase(s)}{stats.data ? ` (${stats.data.by_status[s] ?? 0})` : ""}</option>
                ))}
              </Select>
            </label>
            {canWrite && (
              <Link to={clientCount ? (clientFilter ? `/invoices/new?client=${clientFilter}` : "/invoices/new") : "/clients/new"} className="btn primary new-btn">
                {clientCount ? "New" : "Add client"} <PlusIcon size={18} />
              </Link>
            )}
          </div>

          {recent.isPending ? (
            <Spinner />
          ) : items.length === 0 ? (
            <EmptyState title={status ? `No ${status} invoices.` : "No invoices yet."}>
              {!canWrite ? null : clientCount ? <Link to="/invoices/new">Create the first one</Link> : <Link to="/clients/new">Add a client to get started</Link>}
            </EmptyState>
          ) : (
            <ul className="inv-list">
              {items.map((inv) => (
                <li key={inv.id}>
                  <button type="button" className={`inv-card ${inv.id === selectedId ? "selected" : ""}`} onClick={() => setSelectedId(inv.id)} aria-pressed={inv.id === selectedId}>
                    <span className="inv-card-main">
                      <strong>{clientName(inv.client_id)}</strong>
                      <span className="inv-card-meta"><span className="accent">{inv.invoice_number}</span> | {displayDate(inv.issue_date)}</span>
                    </span>
                    <span className="inv-card-side">
                      <strong>{money(inv.total)}</strong>
                      <span className={`status-text-${inv.status} small`}>{inv.status.toUpperCase()}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {recent.data && recent.data.total > items.length && (
            <Link to={clientFilter ? `/invoices?client=${clientFilter}` : "/invoices"} className="btn ghost master-more">View all {recent.data.total} invoices</Link>
          )}
        </section>

        <section className="detail">
          {selectedId === null ? (
            <div className="paper paper-empty">
              <EmptyState title="Select an invoice">Pick an invoice on the left to preview it here.</EmptyState>
            </div>
          ) : selected.isPending ? (
            <div className="paper"><Spinner /></div>
          ) : selected.error ? (
            <ErrorBanner error={selected.error} />
          ) : (
            <InvoicePreview
              invoice={selected.data!}
              client={selectedBuyer}
              seller={seller}
              actions={
                <>
                  <button type="button" className="btn" onClick={() => window.print()}><PrintIcon size={18} /> Print</button>
                  <Link to={`/invoices/${selected.data!.id}`} className="btn primary">Open <ExternalIcon size={16} /></Link>
                </>
              }
            />
          )}
        </section>
      </div>
    </>
  );
}
