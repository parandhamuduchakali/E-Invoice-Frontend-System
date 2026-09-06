import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { clientsApi } from "@/api/endpoints";
import type { ClientInput } from "@/api/types";
import { GstinInput } from "@/components/GstinInput";
import { StateCodeSelect } from "@/components/StateCodeSelect";
import { Card, ErrorBanner, Field, Input, PageHeader, Spinner } from "@/components/ui";
import { isValidPincode } from "@/lib/gst";

const EMPTY: ClientInput = {
  name: "",
  email: "",
  phone: null,
  address: null,
  city: null,
  state: null,
  zip_code: null,
  country: "India",
  tax_id: null,
  gstin: null,
  legal_name: null,
  trade_name: null,
  state_code: null,
  place_of_supply: null,
};

/** Empty strings become null so PATCH clears a field instead of storing "". */
function clean(input: ClientInput): ClientInput {
  const out = { ...input };
  for (const key of Object.keys(out) as (keyof ClientInput)[]) {
    const value = out[key];
    if (typeof value === "string" && value.trim() === "" && key !== "name" && key !== "email") {
      (out as Record<string, unknown>)[key] = null;
    }
  }
  return out;
}

export function ClientFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ClientInput>(EMPTY);

  const existing = useQuery({
    queryKey: ["clients", Number(id)],
    queryFn: () => clientsApi.get(Number(id)),
    enabled: editing,
  });

  useEffect(() => {
    if (existing.data) {
      const { id: _id, owner_id: _o, created_at: _c, ...rest } = existing.data;
      setForm(rest);
    }
  }, [existing.data]);

  const save = useMutation({
    mutationFn: (body: ClientInput) => (editing ? clientsApi.update(Number(id), body) : clientsApi.create(body)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      navigate("/clients");
    },
  });

  const set = <K extends keyof ClientInput>(key: K, value: ClientInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const pinError = form.zip_code && !isValidPincode(form.zip_code) ? "Indian pincode must be 6 digits (999999 for exports)." : null;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    save.mutate(clean(form));
  }

  if (editing && existing.isPending) return <Spinner />;

  return (
    <>
      <PageHeader title={editing ? `Edit ${existing.data?.name ?? "client"}` : "New client"} subtitle="Buyer details map to BuyerDtls in the GST e-invoice." />
      <ErrorBanner error={existing.error ?? save.error} onDismiss={() => save.reset()} />

      <form onSubmit={onSubmit}>
        <Card title="Contact">
          <div className="grid two">
            <Field label="Display name" required>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} required />
            </Field>
            <Field label="Email" required>
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required />
            </Field>
            <Field label="Phone">
              <Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
            </Field>
            <Field label="Other tax ID" hint="Non-GST identifier (VAT, EIN…) for foreign buyers.">
              <Input value={form.tax_id ?? ""} onChange={(e) => set("tax_id", e.target.value)} />
            </Field>
          </div>
        </Card>

        <Card title="GST registration">
          <div className="grid two">
            <GstinInput
              value={form.gstin ?? ""}
              expectedStateCode={form.state_code}
              onChange={(value, stateCode) => {
                set("gstin", value);
                if (stateCode && !form.state_code) set("state_code", stateCode);
              }}
            />
            <Field label="Legal name" hint="As registered against the PAN. Falls back to the display name.">
              <Input value={form.legal_name ?? ""} onChange={(e) => set("legal_name", e.target.value)} maxLength={100} />
            </Field>
            <Field label="Trade name">
              <Input value={form.trade_name ?? ""} onChange={(e) => set("trade_name", e.target.value)} maxLength={100} />
            </Field>
            <Field label="State code" hint="Recipient's GST state (Stcd).">
              <StateCodeSelect value={form.state_code ?? ""} onChange={(e) => set("state_code", e.target.value || null)} />
            </Field>
            <Field label="Place of supply" hint="Pos — defaults to the state code when left blank.">
              <StateCodeSelect value={form.place_of_supply ?? ""} onChange={(e) => set("place_of_supply", e.target.value || null)} />
            </Field>
          </div>
        </Card>

        <Card title="Address">
          <div className="grid two">
            <Field label="Street address" hint="Addr1 — max 100 characters for the e-invoice.">
              <Input value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} maxLength={500} />
            </Field>
            <Field label="City / place" hint="Loc">
              <Input value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} />
            </Field>
            <Field label="State name" hint="Display only; the state code above drives GST.">
              <Input value={form.state ?? ""} onChange={(e) => set("state", e.target.value)} />
            </Field>
            <Field label="Pincode" hint="Pin — 6 digits." error={pinError}>
              <Input value={form.zip_code ?? ""} onChange={(e) => set("zip_code", e.target.value)} maxLength={20} inputMode="numeric" />
            </Field>
            <Field label="Country">
              <Input value={form.country ?? ""} onChange={(e) => set("country", e.target.value)} />
            </Field>
          </div>
        </Card>

        <div className="row">
          <button className="btn primary" type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : editing ? "Save changes" : "Create client"}
          </button>
          <Link to="/clients" className="btn">Cancel</Link>
        </div>
      </form>
    </>
  );
}
