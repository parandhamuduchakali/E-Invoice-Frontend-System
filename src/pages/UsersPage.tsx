import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { clientsApi, usersApi } from "@/api/endpoints";
import type { User, UserCreateRequest, UserRole } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { Card, ErrorBanner, Field, InfoBanner, Input, PageHeader, Select, Spinner } from "@/components/ui";
import { displayDateTime } from "@/lib/format";
import { ASSIGNABLE_ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/permissions";

const EMPTY: UserCreateRequest = { email: "", full_name: "", password: "", role: "engineer", client_id: null };

export function UsersPage() {
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const users = useQuery({ queryKey: ["users"], queryFn: usersApi.list });
  const clients = useQuery({ queryKey: ["clients"], queryFn: clientsApi.list });
  const [form, setForm] = useState<UserCreateRequest>(EMPTY);
  const [created, setCreated] = useState<User | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["users"] });
  const create = useMutation({
    mutationFn: (body: UserCreateRequest) => usersApi.create(body),
    onSuccess: (u) => { invalidate(); setCreated(u); setForm(EMPTY); },
  });
  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: number; role?: UserRole; client_id?: number | null; is_active?: boolean; password?: string }) =>
      usersApi.update(id, body),
    onSuccess: invalidate,
  });
  // Switching a member to the client role needs a client record in the same
  // request, so the row shows a client picker first instead of failing with 422.
  const [pendingClientRole, setPendingClientRole] = useState<number | null>(null);

  function changeRole(u: User, role: UserRole) {
    if (role === "client" && !u.client_id) {
      setPendingClientRole(u.id);
      return;
    }
    setPendingClientRole(null);
    update.mutate({ id: u.id, role, client_id: role === "client" ? u.client_id : null });
  }

  function resetPassword(u: User) {
    const next = window.prompt(`New password for ${u.full_name} (at least 8 characters):`);
    if (next === null) return;
    if (next.length < 8) {
      window.alert("Password must be at least 8 characters.");
      return;
    }
    update.mutate({ id: u.id, password: next });
  }

  const assignable = me ? ASSIGNABLE_ROLES[me.role] : [];
  const clientName = (id: number | null) => (id ? clients.data?.find((c) => c.id === id)?.name ?? `#${id}` : "—");

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    create.mutate({ ...form, client_id: form.role === "client" ? form.client_id : null });
  }

  return (
    <>
      <PageHeader
        title="Users & roles"
        subtitle={me?.role === "admin" ? "All accounts on this server." : "Members of your workspace. They work on your clients and invoices with the rights of their role."}
      />
      <ErrorBanner error={users.error ?? create.error ?? update.error} onDismiss={() => { create.reset(); update.reset(); }} />

      <div className="grid two" style={{ alignItems: "start" }}>
        <Card title="Add a member">
          {created && (
            <InfoBanner tone="success">
              Created <strong>{created.full_name}</strong> ({ROLE_LABELS[created.role]}). Share the password you set with them; they can change their name and email after signing in.
            </InfoBanner>
          )}
          <form onSubmit={onSubmit} className="stack">
            <Field label="Full name" required>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
            </Field>
            <Field label="Email" required>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </Field>
            <Field label="Initial password" required hint="At least 8 characters.">
              <Input type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required autoComplete="new-password" />
            </Field>
            <Field label="Role" required hint={ROLE_DESCRIPTIONS[form.role]}>
              <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole, client_id: null })}>
                {assignable.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </Select>
            </Field>
            {form.role === "client" && (
              <Field label="Client record" required hint="The client this portal user represents; they will only see its invoices.">
                <Select value={form.client_id ?? ""} onChange={(e) => setForm({ ...form, client_id: e.target.value ? Number(e.target.value) : null })} required>
                  <option value="">— select client —</option>
                  {clients.data?.map((c) => <option key={c.id} value={c.id}>{c.name}{c.gstin ? ` (${c.gstin})` : ""}</option>)}
                </Select>
              </Field>
            )}
            <button className="btn primary" type="submit" disabled={create.isPending || (form.role === "client" && !form.client_id)}>
              {create.isPending ? "Creating…" : "Create member"}
            </button>
          </form>
        </Card>

        <Card title="Roles">
          <dl className="kv">
            {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
              <div key={r}>
                <dt><span className={`badge role-${r}`}>{ROLE_LABELS[r]}</span></dt>
                <dd>{ROLE_DESCRIPTIONS[r]}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <Card title="Members">
        {users.isPending ? (
          <Spinner />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th><th>Email</th><th>Role</th><th>Client record</th><th>Workspace</th><th>Status</th><th>Created</th><th />
                </tr>
              </thead>
              <tbody>
                {users.data?.map((u) => {
                  const isMe = u.id === me?.id;
                  const canEdit = !isMe && assignable.includes(u.role);
                  return (
                    <tr key={u.id}>
                      <td><strong>{u.full_name}</strong>{isMe && <span className="pill" style={{ marginLeft: 6 }}>you</span>}</td>
                      <td>{u.email}</td>
                      <td>
                        {canEdit ? (
                          <Select value={pendingClientRole === u.id ? "client" : u.role} style={{ width: 130 }} aria-label={`Role of ${u.full_name}`} onChange={(e) => changeRole(u, e.target.value as UserRole)}>
                            {assignable.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                          </Select>
                        ) : (
                          <span className={`badge role-${u.role}`}>{ROLE_LABELS[u.role]}</span>
                        )}
                      </td>
                      <td>
                        {pendingClientRole === u.id ? (
                          <Select
                            autoFocus
                            defaultValue=""
                            style={{ width: 180 }}
                            aria-label={`Choose the client for ${u.full_name}`}
                            onChange={(e) => {
                              if (!e.target.value) return;
                              setPendingClientRole(null);
                              update.mutate({ id: u.id, role: "client", client_id: Number(e.target.value) });
                            }}
                          >
                            <option value="">— pick client to apply —</option>
                            {clients.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </Select>
                        ) : u.role === "client" ? (
                          canEdit ? (
                            <Select value={u.client_id ?? ""} style={{ width: 160 }} aria-label={`Client of ${u.full_name}`} onChange={(e) => update.mutate({ id: u.id, client_id: e.target.value ? Number(e.target.value) : null })}>
                              <option value="">— select —</option>
                              {clients.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </Select>
                          ) : clientName(u.client_id)
                        ) : "—"}
                      </td>
                      <td className="muted small">{u.organization_id === null ? "owner" : `member of #${u.organization_id}`}</td>
                      <td>{u.is_active ? <span className="pill good">active</span> : <span className="pill warn">disabled</span>}</td>
                      <td className="muted small">{displayDateTime(u.created_at)}</td>
                      <td className="right nowrap">
                        {canEdit && (
                          <>
                            <button type="button" className="btn small" onClick={() => resetPassword(u)} title="Set a new password for this member">
                              Reset password
                            </button>{" "}
                            <button type="button" className={`btn small ${u.is_active ? "danger" : ""}`} onClick={() => update.mutate({ id: u.id, is_active: !u.is_active })}>
                              {u.is_active ? "Disable" : "Enable"}
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
