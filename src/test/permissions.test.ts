import { describe, expect, it } from "vitest";
import type { User, UserRole } from "@/api/types";
import { ASSIGNABLE_ROLES, can, isWorkspaceOwner, ROLE_PERMISSIONS } from "@/lib/permissions";

const userOf = (role: UserRole, organization_id: number | null = null): User =>
  ({ id: 1, role, organization_id, client_id: role === "client" ? 7 : null } as unknown as User);

describe("role → permission matrix (mirrors backend app/core/permissions.py)", () => {
  it("managers and admins hold every permission", () => {
    for (const role of ["admin", "manager"] as UserRole[]) {
      expect(can(userOf(role), "irn:record")).toBe(true);
      expect(can(userOf(role), "users:manage")).toBe(true);
      expect(can(userOf(role), "invoices:delete")).toBe(true);
      expect(can(userOf(role), "audit:read")).toBe(true);
    }
  });

  it("engineers can work but not destroy, register or manage", () => {
    const eng = userOf("engineer", 1);
    expect(can(eng, "invoices:write")).toBe(true);
    expect(can(eng, "clients:write")).toBe(true);
    expect(can(eng, "ocr:run")).toBe(true);
    expect(can(eng, "einvoice:generate")).toBe(true);
    expect(can(eng, "invoices:delete")).toBe(false);
    expect(can(eng, "irn:record")).toBe(false);
    expect(can(eng, "seller_profile:write")).toBe(false);
    expect(can(eng, "users:manage")).toBe(false);
    // The trail names other members and carries before/after values an
    // engineer cannot otherwise see.
    expect(can(eng, "audit:read")).toBe(false);
  });

  it("client users are read-only", () => {
    const portal = userOf("client", 1);
    expect([...ROLE_PERMISSIONS.client].sort()).toEqual(["clients:read", "dashboard:view", "invoices:read"]);
    expect(can(portal, "invoices:write")).toBe(false);
    expect(can(portal, "ocr:run")).toBe(false);
  });

  it("only owners (no organization_id) count as workspace owners", () => {
    expect(isWorkspaceOwner(userOf("manager"))).toBe(true);
    expect(isWorkspaceOwner(userOf("engineer", 3))).toBe(false);
    expect(isWorkspaceOwner(null)).toBe(false);
  });

  it("managers cannot assign the admin role", () => {
    expect(ASSIGNABLE_ROLES.manager).not.toContain("admin");
    expect(ASSIGNABLE_ROLES.admin).toContain("admin");
    expect(ASSIGNABLE_ROLES.engineer).toEqual([]);
  });

  it("an unknown user has no permissions", () => {
    expect(can(null, "invoices:read")).toBe(false);
  });
});
