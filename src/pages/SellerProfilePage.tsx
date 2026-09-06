import { useMutation } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { usersApi } from "@/api/endpoints";
import type { User, UserUpdateRequest } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { GstinInput } from "@/components/GstinInput";
import { StateCodeSelect } from "@/components/StateCodeSelect";
import { Card, ErrorBanner, Field, InfoBanner, Input, PageHeader } from "@/components/ui";
import { isValidPincode } from "@/lib/gst";
import { can, isWorkspaceOwner, ROLE_LABELS } from "@/lib/permissions";

type Form = Required<Omit<UserUpdateRequest, "email" | "full_name">> & { full_name: string; email: string };

function fromUser(user: User): Form {
  return {
    full_name: user.full_name,
    email: user.email,
    legal_name: user.legal_name ?? "",
    trade_name: user.trade_name ?? "",
    gstin: user.gstin ?? "",
    address1: user.address1 ?? "",
    address2: user.address2 ?? "",
    location: user.location ?? "",
    pincode: user.pincode ?? "",
    state_code: user.state_code ?? "",
    phone: user.phone ?? "",
  };
}

const REQUIRED_FOR_IRP: (keyof Form)[] = ["gstin", "legal_name", "address1", "location", "pincode", "state_code"];

export function SellerProfilePage() {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState<Form | null>(user ? fromUser(user) : null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (user) setForm(fromUser(user));
  }, [user]);

  const save = useMutation({
    mutationFn: (body: UserUpdateRequest) => usersApi.updateMe(body),
    onSuccess: (updated) => {
      setUser(updated);
      setSaved(true);
    },
  });

  if (!form) return null;

  const sellerEditable = can(user, "seller_profile:write") && isWorkspaceOwner(user);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setSaved(false);
    setForm((f) => (f ? { ...f, [key]: value } : f));
  };

  const missing = REQUIRED_FOR_IRP.filter((k) => !String(form[k] ?? "").trim());
  const pinError = form.pincode && !isValidPincode(form.pincode) ? "Pincode must be 6 digits." : null;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const body: UserUpdateRequest = {};
    (Object.keys(form!) as (keyof Form)[]).forEach((key) => {
      const value = String(form![key] ?? "").trim();
      if (key === "full_name" || key === "email") {
        if (value) (body as Record<string, unknown>)[key] = value;
      } else if (sellerEditable) {
        (body as Record<string, unknown>)[key] = value || null;
      }
    });
    save.mutate(body);
  }

  return (
    <>
      <PageHeader
        title={sellerEditable ? "Seller profile" : "Profile"}
        subtitle={sellerEditable ? "These details fill SellerDtls in every GST e-invoice you generate." : `You are signed in as ${user ? ROLE_LABELS[user.role] : ""}. The GST seller profile belongs to your workspace manager.`}
      />
      <ErrorBanner error={save.error} onDismiss={() => save.reset()} />
      {saved && <InfoBanner tone="success">Profile saved.</InfoBanner>}
      {!sellerEditable ? null : missing.length > 0 ? (
        <InfoBanner tone="warn">
          Still needed for IRP submission: <strong>{missing.join(", ")}</strong>.
        </InfoBanner>
      ) : (
        <InfoBanner tone="success">Seller profile is complete for e-invoicing.</InfoBanner>
      )}

      <form onSubmit={onSubmit}>
        <Card title="Account">
          <div className="grid two">
            <Field label="Full name" required>
              <Input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} required />
            </Field>
            <Field label="Email" required>
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required />
            </Field>
          </div>
        </Card>

        {sellerEditable && (<>
        <Card title="GST registration (SellerDtls)">
          <div className="grid two">
            <GstinInput
              required
              value={form.gstin ?? ""}
              expectedStateCode={form.state_code || null}
              onChange={(value, stateCode) => {
                set("gstin", value);
                if (stateCode && !form.state_code) set("state_code", stateCode);
              }}
            />
            <Field label="State code" required hint="Stcd — must match the first two digits of the GSTIN.">
              <StateCodeSelect value={form.state_code ?? ""} onChange={(e) => set("state_code", e.target.value)} />
            </Field>
            <Field label="Legal name" required hint="LglNm — as per PAN, max 100 characters.">
              <Input value={form.legal_name ?? ""} onChange={(e) => set("legal_name", e.target.value)} maxLength={100} />
            </Field>
            <Field label="Trade name" hint="TrdNm">
              <Input value={form.trade_name ?? ""} onChange={(e) => set("trade_name", e.target.value)} maxLength={100} />
            </Field>
          </div>
        </Card>

        <Card title="Registered address">
          <div className="grid two">
            <Field label="Address line 1" required hint="Addr1 — building / street, max 100 characters.">
              <Input value={form.address1 ?? ""} onChange={(e) => set("address1", e.target.value)} maxLength={100} />
            </Field>
            <Field label="Address line 2" hint="Addr2">
              <Input value={form.address2 ?? ""} onChange={(e) => set("address2", e.target.value)} maxLength={100} />
            </Field>
            <Field label="City / place" required hint="Loc — max 50 characters.">
              <Input value={form.location ?? ""} onChange={(e) => set("location", e.target.value)} maxLength={50} />
            </Field>
            <Field label="Pincode" required hint="Pin — 6 digits." error={pinError}>
              <Input value={form.pincode ?? ""} onChange={(e) => set("pincode", e.target.value)} maxLength={6} inputMode="numeric" />
            </Field>
            <Field label="Phone" hint="Ph — 6 to 12 digits.">
              <Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value.replace(/\D/g, ""))} maxLength={12} inputMode="numeric" />
            </Field>
          </div>
        </Card>

        </>)}

        <button className="btn primary" type="submit" disabled={save.isPending || Boolean(pinError)}>
          {save.isPending ? "Saving…" : "Save profile"}
        </button>
      </form>

      <PasswordCard />
    </>
  );
}

/** Change-own-password form; available to every role. */
function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const change = useMutation({
    mutationFn: () => usersApi.changePassword({ current_password: current, new_password: next }),
    onSuccess: () => {
      setCurrent("");
      setNext("");
      setConfirm("");
    },
  });
  const mismatch = confirm.length > 0 && next !== confirm;
  const same = next.length > 0 && next === current;

  return (
    <Card title="Change password" className="password-card">
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (!mismatch && !same) change.mutate();
        }}
      >
        <ErrorBanner error={change.error} onDismiss={() => change.reset()} />
        {change.isSuccess && <InfoBanner tone="success">Password changed. Use the new one next time you sign in.</InfoBanner>}
        <div className="grid three">
          <Field label="Current password" required>
            <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          </Field>
          <Field label="New password" required hint="At least 8 characters." error={same ? "Must differ from the current password." : null}>
            <Input type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required />
          </Field>
          <Field label="Confirm new password" required error={mismatch ? "Passwords do not match." : null}>
            <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </Field>
        </div>
        <button className="btn" type="submit" disabled={change.isPending || mismatch || same || next.length < 8}>
          {change.isPending ? "Changing…" : "Change password"}
        </button>
      </form>
    </Card>
  );
}
