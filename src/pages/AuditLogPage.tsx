/**
 * The audit trail: who changed what, when, and from what to what.
 *
 * Read-only by construction — the backend exposes no write, update or delete
 * route for these rows (`app/models/audit.py`), and this page has no controls
 * that would want one. Filters map one-to-one onto the API's query parameters
 * so the CSV export always covers exactly what is on screen.
 */

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { auditApi, type AuditListParams } from "@/api/endpoints";
import type { AuditEvent } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { Card, EmptyState, ErrorBanner, Field, Input, PageHeader, Select, Spinner } from "@/components/ui";
import { DownloadIcon } from "@/components/icons";
import { displayDateTime } from "@/lib/format";

const PAGE_SIZE = 25;

const ENTITY_LABELS: Record<string, string> = {
  invoice: "Invoice",
  client: "Client",
  user: "User",
  document: "Document",
  auth: "Sign-in",
};

/** `invoice.irn_recorded` → `Irn recorded`, without a lookup table per action. */
function actionLabel(action: string): string {
  const verb = action.includes(".") ? action.slice(action.indexOf(".") + 1) : action;
  const words = verb.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function tone(action: string): string {
  if (action.endsWith("_failed")) return "pill warn";
  if (action.includes("deleted")) return "pill warn";
  if (action.includes("irn_recorded") || action.includes("einvoice")) return "pill good";
  return "pill";
}

/** Renders one `changes` entry: a `{from, to}` pair, or a plain recorded value. */
function ChangeRow({ field, value }: { field: string; value: unknown }) {
  const pair = value as { from?: unknown; to?: unknown } | null;
  const isDiff = pair !== null && typeof pair === "object" && "to" in pair;
  const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

  return (
    <div className="audit-change">
      <span className="muted small">{field.replace(/_/g, " ")}</span>{" "}
      {isDiff ? (
        <>
          <del>{show(pair.from)}</del> → <strong>{show(pair.to)}</strong>
        </>
      ) : (
        <strong>{show(value)}</strong>
      )}
    </div>
  );
}

function EventRow({ event }: { event: AuditEvent }) {
  const [open, setOpen] = useState(false);
  const changes = Object.entries(event.changes ?? {});

  return (
    <>
      <tr>
        <td className="nowrap">{displayDateTime(event.occurred_at)}</td>
        <td>
          <span className={tone(event.action)}>{actionLabel(event.action)}</span>
        </td>
        <td>
          {ENTITY_LABELS[event.entity_type] ?? event.entity_type}
          {event.entity_id ? <span className="muted small"> #{event.entity_id}</span> : null}
        </td>
        <td>
          {event.actor_email ?? <span className="muted">system</span>}
          {event.actor_role ? <span className="muted small"> ({event.actor_role})</span> : null}
        </td>
        <td>{event.summary}</td>
        <td className="num">
          {changes.length > 0 && (
            <button type="button" className="btn small" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
              {open ? "Hide" : `${changes.length} field${changes.length === 1 ? "" : "s"}`}
            </button>
          )}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} className="audit-detail">
            {changes.map(([field, value]) => (
              <ChangeRow key={field} field={field} value={value} />
            ))}
            <div className="muted small">
              {event.ip_address ? `from ${event.ip_address}` : "address not recorded"}
              {event.request_id ? ` · request ${event.request_id}` : ""}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function AuditLogPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [filters, setFilters] = useState<AuditListParams>({ page: 1, size: PAGE_SIZE });
  const [downloadError, setDownloadError] = useState<unknown>(null);

  const actions = useQuery({ queryKey: ["audit", "actions"], queryFn: auditApi.actions, staleTime: 300_000 });
  const events = useQuery({ queryKey: ["audit", filters], queryFn: () => auditApi.list(filters) });

  /** Any filter change returns to page 1: page 4 of the old result is meaningless. */
  function setFilter(patch: Partial<AuditListParams>) {
    setFilters((current) => ({ ...current, ...patch, page: 1 }));
  }

  async function exportCsv() {
    try {
      const blob = await auditApi.exportCsv({ ...filters, page: undefined, size: undefined });
      const url = URL.createObjectURL(new Blob([blob], { type: "text/csv" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      setDownloadError(error);
    }
  }

  const page = events.data;

  return (
    <>
      <PageHeader
        title="Audit trail"
        subtitle="Every change to invoices, clients, users and sign-ins, kept append-only. Rows cannot be edited or removed — including by this page."
        actions={
          <button type="button" className="btn" onClick={exportCsv}>
            <DownloadIcon size={16} /> Export CSV
          </button>
        }
      />
      <ErrorBanner error={downloadError} onDismiss={() => setDownloadError(null)} />

      <Card>
        <div className="grid four">
          <Field label="Action">
            <Select value={filters.action ?? ""} onChange={(e) => setFilter({ action: e.target.value })}>
              <option value="">Any action</option>
              {(actions.data ?? []).map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Record type">
            <Select value={filters.entity_type ?? ""} onChange={(e) => setFilter({ entity_type: e.target.value })}>
              <option value="">Any record</option>
              {Object.entries(ENTITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="From">
            <Input type="date" value={filters.date_from ?? ""} onChange={(e) => setFilter({ date_from: e.target.value })} />
          </Field>
          <Field label="To">
            <Input type="date" value={filters.date_to ?? ""} onChange={(e) => setFilter({ date_to: e.target.value })} />
          </Field>
          {isAdmin && (
            <Field label="Scope" hint="Admins can read every workspace at once.">
              <Select value={filters.scope ?? "workspace"} onChange={(e) => setFilter({ scope: e.target.value as "workspace" | "all" })}>
                <option value="workspace">This workspace</option>
                <option value="all">All workspaces</option>
              </Select>
            </Field>
          )}
        </div>
      </Card>

      {events.isPending ? (
        <Spinner />
      ) : events.error ? (
        <ErrorBanner error={events.error} />
      ) : page!.items.length === 0 ? (
        <EmptyState title="No events match these filters">
          Widen the date range or clear the action filter. The trail starts from the first change recorded after this feature was deployed.
        </EmptyState>
      ) : (
        <Card>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Action</th>
                  <th>Record</th>
                  <th>Who</th>
                  <th>What happened</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {page!.items.map((event) => (
                  <EventRow key={event.id} event={event} />
                ))}
              </tbody>
            </table>
          </div>

          <div className="row" style={{ justifyContent: "space-between", marginTop: "1rem" }}>
            <span className="muted small">
              {page!.total} event{page!.total === 1 ? "" : "s"} · page {page!.page} of {Math.max(page!.pages, 1)}
            </span>
            <div className="row">
              <button type="button" className="btn small" disabled={page!.page <= 1} onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}>
                Previous
              </button>
              <button type="button" className="btn small" disabled={page!.page >= page!.pages} onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}>
                Next
              </button>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
