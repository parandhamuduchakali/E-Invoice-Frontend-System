import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Catches render errors so one broken component does not blank the whole app.
 *
 * React unmounts the entire tree when a render throws and nothing catches it,
 * which shows the user an empty page with no explanation and no way back.
 * This keeps the shell, explains what happened, and offers a way out.
 *
 * It only catches errors thrown while *rendering*. Failures inside event
 * handlers and queries are surfaced by `ErrorBanner` where they happen.
 */
interface Props {
  children: ReactNode;
  /** Shown instead of the default panel. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep the component stack: without it a minified production stack rarely
    // says which component failed.
    console.error("Unhandled render error:", error, info.componentStack);
  }

  reset = (): void => this.setState({ error: null });

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <div className="centered" style={{ padding: "2rem" }}>
        <div className="card" style={{ maxWidth: 560 }}>
          <h2 style={{ marginTop: 0 }}>Something went wrong on this page</h2>
          <p className="muted">
            The rest of the app is still running. Try again, or go back to the dashboard.
          </p>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              overflowX: "auto",
              fontSize: "0.8rem",
              background: "var(--surface-2, #f5f5f5)",
              padding: "0.75rem",
              borderRadius: 6,
            }}
          >
            {error.message}
          </pre>
          <div className="row">
            <button type="button" className="btn primary" onClick={this.reset}>
              Try again
            </button>
            <a className="btn" href="/">
              Back to dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }
}
