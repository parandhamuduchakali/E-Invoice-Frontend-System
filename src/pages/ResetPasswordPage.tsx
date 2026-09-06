import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError } from "@/api/client";
import { authApi } from "@/api/endpoints";
import { useAuth } from "@/auth/AuthContext";
import { RupeeIcon } from "@/components/icons";
import { Card, ErrorBanner, Field, InfoBanner, Input } from "@/components/ui";

export function ResetPasswordPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const mismatch = confirm.length > 0 && confirm !== password;
  const tooShort = password.length > 0 && password.length < 8;
  const expired = error instanceof ApiError && error.status === 400;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (mismatch || tooShort) return;
    setBusy(true);
    setError(null);
    try {
      await authApi.resetPassword(token, password);
      navigate("/login", { replace: true, state: { notice: "Your password has been changed. Sign in with the new one." } });
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
        <Card className="auth-card" title="Choose a new password">
          {!token ? (
            <div className="stack">
              <InfoBanner tone="warn">This link is missing its token. Open the link from the email exactly as it was sent, or request a new one.</InfoBanner>
              <Link to="/forgot-password" className="btn primary">Request a new link</Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="stack">
              <ErrorBanner error={error} onDismiss={() => setError(null)} />
              {expired && (
                <p className="muted small">
                  Reset links work once and expire after 30 minutes. <Link to="/forgot-password">Request a new one</Link>.
                </p>
              )}
              <Field label="New password" required hint="At least 8 characters." error={tooShort ? "At least 8 characters." : null}>
                <Input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
              </Field>
              <Field label="Confirm new password" required error={mismatch ? "Passwords do not match." : null}>
                <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
              </Field>
              <button className="btn primary" type="submit" disabled={busy || !password || mismatch || tooShort}>
                {busy ? "Saving…" : "Set new password"}
              </button>
              <p className="muted small">Every device that was signed in will be signed out.</p>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
