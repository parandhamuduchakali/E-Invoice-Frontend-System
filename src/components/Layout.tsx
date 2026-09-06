/**
 * Application shell: a teal icon rail on the left, a top bar with the brand,
 * the current page name, the admin workspace switcher and the user menu, and
 * the routed page underneath.
 */

import { useQuery } from "@tanstack/react-query";
import type { ComponentType } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { usersApi } from "@/api/endpoints";
import { useAuth } from "@/auth/AuthContext";
import { can, isWorkspaceOwner, ROLE_LABELS, type Permission } from "@/lib/permissions";
import { AlertIcon, Avatar, ChevronDownIcon, FolderIcon, HistoryIcon, HomeIcon, LogoutIcon, ReceiptIcon, RupeeIcon, ScanIcon, ShieldIcon, UserIcon, UsersIcon } from "./icons";
import { Select } from "./ui";

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  end?: boolean;
  permission?: Permission;
}

const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: HomeIcon, end: true },
  { to: "/invoices", label: "Invoices", icon: ReceiptIcon, permission: "invoices:read" },
  { to: "/clients", label: "Clients", icon: UsersIcon, permission: "clients:read" },
  { to: "/ocr", label: "Scan invoice", icon: ScanIcon, permission: "ocr:run" },
  { to: "/documents", label: "Documents", icon: FolderIcon, permission: "ocr:run" },
  { to: "/users", label: "Users & roles", icon: ShieldIcon, permission: "users:manage" },
  { to: "/audit", label: "Audit trail", icon: HistoryIcon, permission: "audit:read" },
  { to: "/profile", label: "Profile", icon: UserIcon },
];

/** Human page name for the top bar, derived from the current route. */
function pageName(pathname: string): string {
  if (pathname === "/") return "Dashboard";
  const match = NAV.filter((n) => n.to !== "/" && pathname.startsWith(n.to)).sort((a, b) => b.to.length - a.to.length)[0];
  return match?.label ?? "E-Invoice";
}

export function Layout() {
  const { user, logout, workspace, setWorkspace } = useAuth();
  const location = useLocation();
  const owner = isWorkspaceOwner(user);
  const isAdmin = user?.role === "admin";
  const gstReady = Boolean(user?.gstin && user?.state_code && user?.legal_name);

  // Admins can act on any workspace: list the other owners for the switcher.
  const users = useQuery({ queryKey: ["users"], queryFn: usersApi.list, enabled: isAdmin, staleTime: 60_000 });
  const owners = (users.data ?? []).filter((u) => u.organization_id === null && u.id !== user?.id);

  return (
    <div className="shell">
      <aside className="rail no-print" aria-label="Main navigation">
        <Link to="/" className="rail-brand" title="E-Invoice">
          <RupeeIcon size={22} />
        </Link>
        <nav>
          {NAV.filter((item) => !item.permission || can(user, item.permission)).map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `rail-link ${isActive ? "active" : ""}`} title={item.label} aria-label={item.label}>
              <item.icon size={22} />
              <span className="rail-tip">{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <button type="button" className="rail-link rail-logout" onClick={logout} title="Sign out" aria-label="Sign out">
          <LogoutIcon size={22} />
          <span className="rail-tip">Sign out</span>
        </button>
      </aside>

      <div className="main">
        <header className="topbar no-print">
          <div className="topbar-title">
            <span className="brand-word">E-Invoice</span>
            <span className="page-name">{pageName(location.pathname)}</span>
          </div>

          <div className="topbar-right">
            {isAdmin && owners.length > 0 && (
              <label className="workspace-switch" title="Admins can work inside another owner's workspace">
                <span className="muted small">Workspace</span>
                <Select value={workspace?.id ?? ""} aria-label="Switch workspace" onChange={(e) => setWorkspace(owners.find((o) => o.id === Number(e.target.value)) ?? null)}>
                  <option value="">My workspace</option>
                  {owners.map((o) => (
                    <option key={o.id} value={o.id}>{o.legal_name ?? o.full_name} ({o.email})</option>
                  ))}
                </Select>
              </label>
            )}

            {owner && !gstReady && can(user, "seller_profile:write") && (
              <Link to="/profile" className="pill warn topbar-alert" title="Your GST seller profile is incomplete">
                <AlertIcon size={14} /> Complete seller profile
              </Link>
            )}

            {user && (
              <details className="user-menu">
                <summary aria-label="Account menu">
                  <Avatar name={user.full_name} />
                  <span className="user-menu-text">
                    <strong>{user.full_name}</strong>
                    <span className={`badge role-${user.role}`}>{ROLE_LABELS[user.role]}</span>
                  </span>
                  <ChevronDownIcon size={16} />
                </summary>
                <div className="menu">
                  <div className="menu-head">
                    <strong>{user.full_name}</strong>
                    <span className="muted small">{user.email}</span>
                    {owner ? <span className="muted small">{user.gstin ?? "No GSTIN set"}</span> : user.organization_id && <span className="muted small">Workspace #{user.organization_id}</span>}
                  </div>
                  <Link to="/profile" className="menu-item"><UserIcon size={18} /> Profile & password</Link>
                  <button type="button" className="menu-item" onClick={logout}><LogoutIcon size={18} /> Sign out</button>
                </div>
              </details>
            )}
          </div>
        </header>

        <main className="content">
          {workspace && (
            <div className="banner info workspace-banner no-print">
              Viewing <strong>{workspace.legal_name ?? workspace.full_name}</strong>'s workspace as admin. Everything you see and change here belongs to them.{" "}
              <button type="button" className="btn small" onClick={() => setWorkspace(null)}>Back to mine</button>
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
