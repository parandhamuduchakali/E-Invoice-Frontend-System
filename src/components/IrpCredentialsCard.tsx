/**
 * A workspace's own Invoice Registration Portal login.
 *
 * Without one the workspace files through whatever the deployment was
 * configured with — right for a single company, wrong for a workspace that
 * belongs to a different GSTIN. Secrets are write-only from here: the server
 * stores them encrypted and shows back only the last few characters.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { invoicesApi } from "@/api/endpoints";
import type { IrpCredentialsInput } from "@/api/types";
import { Card, ConfirmButton, ErrorBanner, Field, InfoBanner, Input, KeyValue, Textarea } from "@/components/ui";
import { displayDateTime } from "@/lib/format";

const EMPTY: IrpCredentialsInput = {
  base_url: "https://einv-apisandbox.nic.in",
  client_id: "",
  client_secret: "",
  username: "",
  password: "",
  gstin: "",
  public_key_pem: "",
};

export function IrpCredentialsCard({ sellerGstin }: { sellerGstin: string | null }) {
  const queryClient = useQueryClient();
  const current = useQuery({ queryKey: ["irp", "credentials"], queryFn: invoicesApi.irpCredentials });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<IrpCredentialsInput>({ ...EMPTY, gstin: sellerGstin ?? "" });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["irp"] });
  };
  const save = useMutation({
    mutationFn: (body: IrpCredentialsInput) => invoicesApi.setIrpCredentials(body),
    onSuccess: () => { invalidate(); setEditing(false); setForm({ ...EMPTY, gstin: sellerGstin ?? "" }); },
  });
  const remove = useMutation({ mutationFn: invoicesApi.removeIrpCredentials, onSuccess: invalidate });

  const set = <K extends keyof IrpCredentialsInput>(key: K, value: IrpCredentialsInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  function submit(event: FormEvent) {
    event.preventDefault();
    save.mutate({ ...form, gstin: form.gstin.trim().toUpperCase() });
  }

  const gstinMismatch = Boolean(sellerGstin && form.gstin && form.gstin.trim().toUpperCase() !== sellerGstin.toUpperCase());
  const data = current.data;

  return (
    <Card title="IRP credentials" className="irp-credentials-card">
      <ErrorBanner error={save.error ?? remove.error} onDismiss={() => { save.reset(); remove.reset(); }} />
      <p className="muted small" style={{ marginTop: 0 }}>
        The portal login this workspace files e-invoices with. Leave it unset to use the deployment&apos;s
        configuration; set it when this workspace files under its own GSTIN through its own GSP.
      </p>

      {data?.configured && !editing && (
        <>
          {!data.decryptable && (
            <InfoBanner tone="warn">The server&apos;s secret key changed since these were saved; they can no longer be read. Enter them again.</InfoBanner>
          )}
          <KeyValue
            items={[
              ["Portal", data.base_url ?? "—"],
              ["GSTIN", data.gstin ?? "—"],
              ["Client ID", data.client_id ?? "—"],
              ["Client secret", data.client_secret_masked ?? "—"],
              ["Username", data.username ?? "—"],
              ["Password", data.password_masked ?? "—"],
              ["Public key", data.public_key_present ? "stored" : "missing"],
              ["Updated", displayDateTime(data.updated_at)],
            ]}
          />
          <div className="row" style={{ marginTop: "0.75rem" }}>
            <button type="button" className="btn" onClick={() => setEditing(true)}>Replace</button>
            <ConfirmButton
              className="btn danger"
              message="Remove this workspace's IRP credentials? It will file through the deployment's configuration instead."
              onConfirm={() => remove.mutate()}
            >
              Remove
            </ConfirmButton>
          </div>
        </>
      )}

      {(editing || (data && !data.configured)) && (
        <form onSubmit={submit} className="stack">
          <div className="grid two">
            <Field label="Portal URL" required hint="Sandbox by default. Production is a deliberate change.">
              <Input value={form.base_url} onChange={(e) => set("base_url", e.target.value)} required />
            </Field>
            <Field label="GSTIN these credentials act for" required error={gstinMismatch ? `Differs from the seller profile's ${sellerGstin}.` : null}>
              <Input value={form.gstin} onChange={(e) => set("gstin", e.target.value)} maxLength={15} required spellCheck={false} />
            </Field>
            <Field label="Client ID" required>
              <Input value={form.client_id} onChange={(e) => set("client_id", e.target.value)} required autoComplete="off" />
            </Field>
            <Field label="Client secret" required>
              <Input type="password" value={form.client_secret} onChange={(e) => set("client_secret", e.target.value)} required autoComplete="new-password" />
            </Field>
            <Field label="Portal username" required>
              <Input value={form.username} onChange={(e) => set("username", e.target.value)} required autoComplete="off" />
            </Field>
            <Field label="Portal password" required>
              <Input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} required autoComplete="new-password" />
            </Field>
          </div>
          <Field label="NIC public key (PEM)" required hint="Paste the certificate or public key NIC issued. It is checked before anything is saved.">
            <Textarea rows={5} value={form.public_key_pem} onChange={(e) => set("public_key_pem", e.target.value)} required spellCheck={false} />
          </Field>
          <div className="row">
            <button className="btn primary" type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save credentials"}
            </button>
            {data?.configured && <button type="button" className="btn" onClick={() => setEditing(false)}>Cancel</button>}
          </div>
        </form>
      )}
    </Card>
  );
}
