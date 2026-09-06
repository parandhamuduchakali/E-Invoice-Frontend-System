/**
 * Role → permission matrix, mirroring the backend's `app/core/permissions.py`.
 *
 * The UI uses this only to show or hide controls; the backend always enforces
 * the same matrix, so a stale frontend can never grant extra access.
 */

import type { User, UserRole } from "@/api/types";

export type Permission =
  | "clients:read"
  | "clients:write"
  | "clients:delete"
  | "invoices:read"
  | "invoices:write"
  | "invoices:delete"
  | "einvoice:generate"
  | "irn:record"
  | "seller_profile:write"
  | "ocr:run"
  | "users:manage"
  | "dashboard:view";

const ALL: Permission[] = [
  "clients:read", "clients:write", "clients:delete", "invoices:read", "invoices:write", "invoices:delete",
  "einvoice:generate", "irn:record", "seller_profile:write", "ocr:run", "users:manage", "dashboard:view",
];

export const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<Permission>> = {
  admin: new Set(ALL),
  manager: new Set(ALL),
  engineer: new Set(["clients:read", "clients:write", "invoices:read", "invoices:write", "einvoice:generate", "ocr:run", "dashboard:view"]),
  client: new Set(["clients:read", "invoices:read", "dashboard:view"]),
};

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  manager: "Manager",
  engineer: "Engineer",
  client: "Client",
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin: "Full rights in their own workspace, plus user management across every workspace.",
  manager: "Owns the workspace: clients, invoices, seller profile, IRN recording and members.",
  engineer: "Creates and edits clients and invoices, runs OCR and builds e-invoice JSON. Cannot delete or record IRNs.",
  client: "Read-only portal for one client: sees only invoices addressed to it.",
};

/** Roles a given role may assign when adding or editing members (mirrors backend). */
export const ASSIGNABLE_ROLES: Record<UserRole, UserRole[]> = {
  admin: ["admin", "manager", "engineer", "client"],
  manager: ["manager", "engineer", "client"],
  engineer: [],
  client: [],
};

export function can(user: User | null | undefined, permission: Permission): boolean {
  if (!user) return false;
  return ROLE_PERMISSIONS[user.role]?.has(permission) ?? false;
}

/** True for admins/managers acting on their own account (owners of a workspace). */
export function isWorkspaceOwner(user: User | null | undefined): boolean {
  return Boolean(user) && user!.organization_id === null;
}
