import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { clientsApi } from "@/api/endpoints";
import { useAuth } from "@/auth/AuthContext";
import { Card, ConfirmButton, EmptyState, ErrorBanner, Input, PageHeader, Spinner } from "@/components/ui";
import { can } from "@/lib/permissions";

export function ClientsPage() {
  const { user } = useAuth();
  const canWrite = can(user, "clients:write");
  const canDelete = can(user, "clients:delete");
  const canInvoice = can(user, "invoices:write");
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("");
  const clients = useQuery({ queryKey: ["clients"], queryFn: clientsApi.list });
  const remove = useMutation({
    mutationFn: clientsApi.remove,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["clients"] }),
  });

  const needle = filter.trim().toLowerCase();
  const rows = (clients.data ?? []).filter(
    (c) => !needle || [c.name, c.email, c.gstin, c.legal_name, c.city].some((v) => v?.toLowerCase().includes(needle)),
  );

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle={user?.role === "client" ? "Your client record as held by the seller." : "Buyers your invoices are addressed to. GSTIN and state code are required for B2B e-invoices."}
        actions={canWrite && <Link to="/clients/new" className="btn primary">New client</Link>}
      />
      <ErrorBanner error={clients.error ?? remove.error} onDismiss={() => remove.reset()} />

      <Card
        actions={<Input placeholder="Filter by name, email, GSTIN, city…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ maxWidth: 320 }} />}
      >
        {clients.isPending ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState title={needle ? "No clients match your filter." : "No clients yet."}>
            {!needle && canWrite && (
              <>
                <p className="muted">Clients are the buyers on your invoices. Add one with its GSTIN and state code, then create invoices client by client.</p>
                <Link to="/clients/new" className="btn primary">Add your first client</Link>
              </>
            )}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>GSTIN</th>
                  <th>State</th>
                  <th>Place of supply</th>
                  <th>Contact</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.name}</strong>
                      {c.legal_name && c.legal_name !== c.name && <div className="muted small">{c.legal_name}</div>}
                    </td>
                    <td className="mono">{c.gstin ?? <span className="pill warn">Unregistered</span>}</td>
                    <td>{c.state_code ?? "—"} {c.city ? <span className="muted small">· {c.city}</span> : null}</td>
                    <td>{c.place_of_supply ?? c.state_code ?? "—"}</td>
                    <td>
                      <div>{c.email}</div>
                      {c.phone && <div className="muted small">{c.phone}</div>}
                    </td>
                    <td className="right nowrap">
                      {canInvoice && <><Link to={`/invoices/new?client=${c.id}`} className="btn small primary" title={`Create an invoice for ${c.name}`}>New invoice</Link>{" "}</>}
                      <Link to={`/invoices?client=${c.id}`} className="btn small" title={`All invoices for ${c.name}`}>Invoices</Link>{" "}
                      {canWrite && <><Link to={`/clients/${c.id}/edit`} className="btn small">Edit</Link>{" "}</>}
                      {canDelete && (
                        <ConfirmButton className="btn small danger" message={`Delete client "${c.name}"?`} onConfirm={() => remove.mutate(c.id)}>
                          Delete
                        </ConfirmButton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
