import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import type { MfaChallenge } from "@/api/types";
import { RupeeIcon } from "@/components/icons";
import { Card, ErrorBanner, Field, InfoBanner, Input } from "@/components/ui";

export function LoginPage() {
  const { user, login, completeMfa } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [challenge, setChallenge] = useState<MfaChallenge | null>(null);
  const [code, setCode] = useState("");

  if (user) return <Navigate to="/" replace />;

  const state = location.state as { from?: string; notice?: string } | null;
  const from = state?.from ?? "/";

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (challenge) {
        await completeMfa(challenge, code);
      } else {
        const next = await login(email, password);
        if (next) {
          setChallenge(next); // password accepted; ask for the code
          return;
        }
      }
      navigate(from, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-panel">
        <div className="auth-brand">
          <span className="rail-brand"><RupeeIcon size={22} /></span>
          <span className="auth-brand-text"><strong>E-Invoice</strong><span className="muted">GST invoicing, e-invoice JSON and OCR intake</span></span>
        </div>
      <Card className="auth-card" title="Sign in to E-Invoice">
        <form onSubmit={onSubmit} className="stack">
          {state?.notice && <InfoBanner tone="success">{state.notice}</InfoBanner>}
          <ErrorBanner error={error} onDismiss={() => setError(null)} />
          {challenge ? (
            <>
              <InfoBanner tone="info">Password accepted. Enter the 6-digit code from your authenticator app, or one of your recovery codes.</InfoBanner>
              <Field label="Verification code" required>
                <Input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required autoFocus />
              </Field>
              <button className="btn primary" type="submit" disabled={busy || code.trim().length < 6}>
                {busy ? "Verifying…" : "Verify"}
              </button>
              <button type="button" className="btn" onClick={() => { setChallenge(null); setCode(""); setError(null); }}>Back</button>
            </>
          ) : (
            <>
              <Field label="Email" required>
                <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
              </Field>
              <Field label="Password" required>
                <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </Field>
              <p className="small" style={{ margin: "-0.25rem 0 0", textAlign: "right" }}>
                <Link to="/forgot-password">Forgot password?</Link>
              </p>
              <button className="btn primary" type="submit" disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
              </button>
            </>
          )}
          <p className="muted small">
            No account? <Link to="/register">Create one</Link>
          </p>
        </form>
      </Card>
      </div>
    </div>
  );
}
