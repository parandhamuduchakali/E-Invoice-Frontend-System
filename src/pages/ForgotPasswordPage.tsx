import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { authApi } from "@/api/endpoints";
import { useAuth } from "@/auth/AuthContext";
import { RupeeIcon } from "@/components/icons";
import { Card, ErrorBanner, Field, InfoBanner, Input } from "@/components/ui";

export function ForgotPasswordPage() {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await authApi.forgotPassword(email.trim());
      setSent(true);
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
        <Card className="auth-card" title="Forgot your password?">
          {sent ? (
            <div className="stack">
              <InfoBanner tone="success">
                <div>
                  If an account exists for <strong>{email}</strong>, a reset link is on its way. It works for 30 minutes and can be used once.
                </div>
              </InfoBanner>
              <p className="muted small">
                Nothing arrived? Check your spam folder, make sure the address is the one you signed up with, or ask your workspace manager to reset it from <em>Users &amp; roles</em>.
              </p>
              <Link to="/login" className="btn">Back to sign in</Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="stack">
              <p className="muted">Enter the email you sign in with and we will send you a link to choose a new password.</p>
              <ErrorBanner error={error} onDismiss={() => setError(null)} />
              <Field label="Email" required>
                <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
              </Field>
              <button className="btn primary" type="submit" disabled={busy || !email}>
                {busy ? "Sending…" : "Send reset link"}
              </button>
              <p className="muted small">
                Remembered it? <Link to="/login">Sign in</Link>
              </p>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
