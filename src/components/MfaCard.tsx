/**
 * Enrol, confirm and disable the second sign-in factor.
 *
 * Three states: off (offer to set up), enrolling (show the QR and ask for the
 * first code), on (offer to disable, which needs a code too). Recovery codes
 * are shown exactly once, after enrolment confirms — the server keeps only
 * their hashes, so this card has to make the user save them before it moves on.
 */

import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { tokenStore } from "@/api/client";
import { authApi } from "@/api/endpoints";
import type { MfaSetup } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { QrCode } from "@/components/QrCode";
import { Card, ErrorBanner, Field, InfoBanner, Input } from "@/components/ui";

export function MfaCard() {
  const { user, refreshUser } = useAuth();
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  const begin = useMutation({ mutationFn: authApi.mfaSetup, onSuccess: (s) => { setSetup(s); setCode(""); } });
  const enable = useMutation({
    mutationFn: (c: string) => authApi.mfaEnable(c),
    onSuccess: async (r) => {
      // Turning the second factor on revokes every session opened before it,
      // this one included. The server issues a replacement pair; without
      // adopting the access token here the very next request would 401.
      tokenStore.set(r.access_token);
      setRecoveryCodes(r.recovery_codes);
      setSetup(null);
      setCode("");
      await refreshUser();
    },
  });
  const disable = useMutation({
    mutationFn: (c: string) => authApi.mfaDisable(c),
    onSuccess: async () => { setCode(""); await refreshUser(); },
  });

  const error = begin.error ?? enable.error ?? disable.error;
  const reset = () => { begin.reset(); enable.reset(); disable.reset(); };

  function submit(event: FormEvent) {
    event.preventDefault();
    if (setup) enable.mutate(code);
    else if (user?.mfa_enabled) disable.mutate(code);
  }

  if (recoveryCodes) {
    return (
      <Card title="Two-factor authentication is on" className="mfa-card">
        <InfoBanner tone="warn">
          <div>
            <strong>Save these recovery codes now.</strong> Each works once if you lose your device. They are not
            stored anywhere readable and will not be shown again.
          </div>
        </InfoBanner>
        <pre className="json recovery-codes">{recoveryCodes.join("\n")}</pre>
        <button type="button" className="btn primary" onClick={() => setRecoveryCodes(null)}>I have saved them</button>
      </Card>
    );
  }

  return (
    <Card title="Two-factor authentication" className="mfa-card">
      <ErrorBanner error={error} onDismiss={reset} />
      {user?.mfa_enabled ? (
        <form onSubmit={submit} className="stack">
          <InfoBanner tone="success">Enabled. Signing in asks for a code from your authenticator app.</InfoBanner>
          <Field label="Code from your app (or a recovery code)" hint="Required to turn it off, so a stolen session alone cannot.">
            <Input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <button className="btn danger" type="submit" disabled={disable.isPending || code.trim().length < 6}>
            {disable.isPending ? "Turning off…" : "Turn off two-factor authentication"}
          </button>
        </form>
      ) : setup ? (
        <form onSubmit={submit} className="stack">
          <p className="muted small" style={{ marginTop: 0 }}>
            Scan this with Google Authenticator, Authy, 1Password or any TOTP app, then enter the code it shows.
          </p>
          <div className="row" style={{ alignItems: "flex-start", gap: "1.25rem" }}>
            <QrCode value={setup.otpauth_url} size={176} alt="Authenticator enrolment QR code" />
            <div className="small">
              <div className="muted">Can&apos;t scan? Enter this key manually:</div>
              <code className="qr">{setup.secret}</code>
            </div>
          </div>
          <Field label="First code from the app" required>
            <Input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required autoFocus />
          </Field>
          <div className="row">
            <button className="btn primary" type="submit" disabled={enable.isPending || code.trim().length !== 6}>
              {enable.isPending ? "Confirming…" : "Confirm and enable"}
            </button>
            <button type="button" className="btn" onClick={() => { setSetup(null); setCode(""); reset(); }}>Cancel</button>
          </div>
        </form>
      ) : (
        <div className="stack">
          <p className="muted small" style={{ marginTop: 0 }}>
            Adds a six-digit code from your phone to every sign-in. A stolen password alone then opens nothing — and
            for an account that files tax documents, that is the difference that matters.
          </p>
          <button type="button" className="btn primary" onClick={() => begin.mutate()} disabled={begin.isPending}>
            {begin.isPending ? "Preparing…" : "Set up two-factor authentication"}
          </button>
        </div>
      )}
    </Card>
  );
}
