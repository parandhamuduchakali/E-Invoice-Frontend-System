import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { clientsApi, invoicesApi } from "@/api/endpoints";
import { INVOICE_STATUSES, type InvoiceStatus } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { Card, EmptyState, ErrorBanner, Input, PageHeader, Select, Spinner, StatusBadge } from "@/components/ui";
import { PlusIcon } from "@/components/icons";
import { can } from "@/lib/permissions";
import { displayDate, money, shortIrn, titleCase } from "@/lib/format";

export function InvoicesPage() {
  const { user } = useAuth();
  const canWrite = can(user, "invoices:write");
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page") ?? 1));
  const status = (params.get("status") ?? "") as InvoiceStatus | "";
  const search = params.get("search") ?? "";
  const clientParam = params.get("client") ?? "";
  const clientId = clientParam ? Number(clientParam) : "";
  const size = 15;

  const invoices = useQuery({
    queryKey: ["invoices", "list", { page, size, status, search, clientId }],
    queryFn: () => invoicesApi.list({ page, size, status, search, client_id: clientId }),
    placeholderData: keepPreviousData,
  });
  const clients = useQuery({ queryKey: ["clients"], queryFn: clientsApi.list });
  const clientName = (id: number) => clients.data?.find((c) => c.id === id)?.name ?? `#${id}`;
  const selectedClient = clients.data?.find((c) => c.id === clientId);

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!("page" in patch)) next.delete("page");
    setParams(next);
  };

  return (
    <>
      <PageHeader
        title={selectedClient ? `Invoices — ${selectedClient.name}` : "Invoices"}
        subtitle={
          selectedClient
            ? <>Client-wise view. <Link to="/invoices">Show all clients</Link></>
            : "Tax invoices, credit notes and debit notes. Open one to check e-invoice readiness or record its IRN."
        }
        actions={
          canWrite && (
            <Link to={clientId ? `/invoices/new?client=${clientId}` : "/invoices/new"} className="btn primary">
              <PlusIcon size={18} /> {selectedClient ? `New invoice for ${selectedClient.name}` : "New invoice"}
            </Link>
          )
        }
      />
      <ErrorBanner error={invoices.error} />

      <Card
        actions={
          <div className="row">
            <Select value={clientParam} onChange={(e) => update({ client: e.target.value })} style={{ width: 220 }} aria-label="Filter by client">
              <option value="">All clients</option>
              {clients.data?.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
            <Input placeholder="Search invoice number…" value={search} onChange={(e) => update({ search: e.target.value })} style={{ width: 240 }} />
            <Select value={status} onChange={(e) => update({ status: e.target.value })} style={{ width: 160 }} aria-label="Filter by status">
              <option value="">All statuses</option>
              {INVOICE_STATUSES.map((s) => (
                <option key={s} value={s}>{titleCase(s)}</option>
              ))}
            </Select>
          </div>
        }
      >
        {invoices.isPending ? (
          <Spinner />
        ) : !invoices.data?.items.length ? (
          <EmptyState title={selectedClient ? `No invoices for ${selectedClient.name} yet.` : "No invoices found."}>
            {!canWrite ? null : clients.data && clients.data.length === 0 ? (
              <p className="muted">Add a client first, then create an invoice for them. <Link to="/clients/new" className="btn primary">Add a client</Link></p>
            ) : (
              <Link to={clientId ? `/invoices/new?client=${clientId}` : "/invoices/new"} className="btn primary">Create an invoice</Link>
            )}
          </EmptyState>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>Client</th>
                    <th>Type</th>
                    <th>Supply</th>
                    <th>Issued</th>
                    <th>Due</th>
                    <th>Status</th>
                    <th>IRN</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.data.items.map((inv) => (
                    <tr key={inv.id}>
                      <td><Link to={`/invoices/${inv.id}`}>{inv.invoice_number}</Link></td>
                      <td>{clientName(inv.client_id)}</td>
                      <td>{inv.document_type}</td>
                      <td>{inv.supply_type}</td>
                      <td>{displayDate(inv.issue_date)}</td>
                      <td>{displayDate(inv.due_date)}</td>
                      <td><StatusBadge status={inv.status} /></td>
                      <td className="mono small" title={inv.irn ?? undefined}>{inv.irn ? <span className="pill good">{shortIrn(inv.irn)}</span> : <span className="muted">—</span>}</td>
                      <td className="num">{money(inv.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row" style={{ justifyContent: "space-between", marginTop: "1rem" }}>
              <span className="muted small">
                {invoices.data.total} invoice{invoices.data.total === 1 ? "" : "s"} · page {invoices.data.page} of {invoices.data.pages}
              </span>
              <div className="row">
                <button className="btn small" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>Previous</button>
                <button className="btn small" disabled={page >= invoices.data.pages} onClick={() => update({ page: String(page + 1) })}>Next</button>
              </div>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
