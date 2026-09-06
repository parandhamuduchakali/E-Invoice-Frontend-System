/**
 * Renders the audit trail page against a stubbed API.
 *
 * The page's job is to make a `changes` payload readable, so that is what is
 * asserted: a `{from, to}` pair shown as a before/after, a plain recorded value
 * shown as-is, and neither of them visible until the row is expanded.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditEvent, PaginatedAuditEvents, User } from "@/api/types";

const list = vi.fn();
const actions = vi.fn();

vi.mock("@/api/endpoints", () => ({
  auditApi: {
    list: (...args: unknown[]) => list(...args),
    actions: () => actions(),
    exportCsv: vi.fn(),
  },
}));

let currentUser: Partial<User> = { id: 1, role: "manager" };
vi.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ user: currentUser }) }));

const { AuditLogPage } = await import("@/pages/AuditLogPage");

function event(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: 1,
    occurred_at: "2026-09-07T10:15:00Z",
    workspace_id: 1,
    actor_id: 1,
    actor_email: "manager@example.com",
    actor_role: "manager",
    action: "invoice.updated",
    entity_type: "invoice",
    entity_id: "42",
    summary: "Updated invoice INV-0001.",
    changes: { notes: { from: null, to: "Net 30" } },
    request_id: "abc123",
    ip_address: "203.0.113.9",
    user_agent: null,
    ...overrides,
  };
}

function page(items: AuditEvent[]): PaginatedAuditEvents {
  return { items, total: items.length, page: 1, size: 25, pages: 1 };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuditLogPage />
    </QueryClientProvider>,
  );
}

describe("audit trail page", () => {
  beforeEach(() => {
    currentUser = { id: 1, role: "manager" };
    actions.mockResolvedValue(["invoice.updated", "invoice.irn_recorded"]);
    list.mockReset();
  });

  it("shows an event and reveals its before/after values on demand", async () => {
    list.mockResolvedValue(page([event()]));
    renderPage();

    expect(await screen.findByText("Updated invoice INV-0001.")).toBeInTheDocument();
    expect(screen.getByText("Updated")).toBeInTheDocument(); // action label
    expect(screen.getByText("manager@example.com")).toBeInTheDocument();
    // The diff stays collapsed until asked for, so a long list stays scannable.
    expect(screen.queryByText("Net 30")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "1 field" }));
    expect(screen.getByText("Net 30")).toBeInTheDocument();
    expect(screen.getByText("notes")).toBeInTheDocument();
    expect(screen.getByText(/203\.0\.113\.9/)).toBeInTheDocument();
  });

  it("renders a recorded value that is not a from/to pair", async () => {
    list.mockResolvedValue(
      page([event({ action: "invoice.irn_recorded", summary: "Recorded IRN.", changes: { ack_no: "112010036356" } })]),
    );
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "1 field" }));
    expect(screen.getByText("112010036356")).toBeInTheDocument();
  });

  it("offers the cross-workspace scope to admins only", async () => {
    list.mockResolvedValue(page([]));
    const { unmount } = renderPage();
    expect(await screen.findByText(/No events match/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Scope/)).not.toBeInTheDocument();
    unmount();

    currentUser = { id: 1, role: "admin" };
    renderPage();
    expect(await screen.findByText("All workspaces")).toBeInTheDocument();
  });

  it("returns to page 1 whenever a filter changes", async () => {
    list.mockResolvedValue(page([event()]));
    renderPage();
    await screen.findByText("Updated invoice INV-0001.");

    await userEvent.selectOptions(screen.getByDisplayValue("Any record"), "client");

    // Page 4 of the previous result set says nothing about the new one.
    const lastCall = list.mock.calls.at(-1)![0] as { page: number; entity_type: string };
    expect(lastCall).toMatchObject({ page: 1, entity_type: "client" });
  });
});
