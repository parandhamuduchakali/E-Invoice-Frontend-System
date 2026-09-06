import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { can, type Permission } from "@/lib/permissions";
import { InfoBanner, Spinner } from "./ui";

/**
 * Renders child routes only for an authenticated user; otherwise redirects to /login.
 * With `permission`, additionally requires that the user's role grants it.
 */
export function ProtectedRoute({ permission }: { permission?: Permission }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="centered">
        <Spinner label="Checking session…" />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (permission && !can(user, permission)) {
    return (
      <InfoBanner tone="warn">
        Your role (<strong>{user.role}</strong>) does not have access to this page.
      </InfoBanner>
    );
  }
  return <Outlet />;
}
