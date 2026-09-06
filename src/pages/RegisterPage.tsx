import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { RupeeIcon } from "@/components/icons";
import { Card, ErrorBanner, Field, Input } from "@/components/ui";

export function RegisterPage() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register(email, fullName, password);
      navigate("/profile", { replace: true });
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
      <Card className="auth-card" title="Create your account">
        <form onSubmit={onSubmit} className="stack">
          <ErrorBanner error={error} onDismiss={() => setError(null)} />
          <Field label="Full name" required>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required autoFocus />
          </Field>
          <Field label="Email" required>
            <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Password" required hint="At least 8 characters.">
            <Input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create account"}
          </button>
          <p className="muted small">
            Already registered? <Link to="/login">Sign in</Link>
          </p>
        </form>
      </Card>
      </div>
    </div>
  );
}
