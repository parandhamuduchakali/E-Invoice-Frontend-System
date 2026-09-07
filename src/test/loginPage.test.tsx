/**
 * The sign-in form's second step: when the password is accepted for an
 * account with a second factor, the page must ask for the code instead of
 * navigating, and must complete sign-in only with it.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MfaChallenge } from "@/api/types";

const login = vi.fn();
const completeMfa = vi.fn();
const navigate = vi.fn();

vi.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ user: null, login, completeMfa }) }));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});

const { LoginPage } = await import("@/pages/LoginPage");

const CHALLENGE: MfaChallenge = { mfa_required: true, mfa_token: "challenge-token", expires_in: 300 };

async function signIn() {
  await userEvent.type(screen.getByLabelText(/Email/), "a@x.com");
  await userEvent.type(screen.getByLabelText(/^Password/), "a-strong-enough-phrase");
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("login page", () => {
  beforeEach(() => {
    login.mockReset();
    completeMfa.mockReset();
    navigate.mockReset();
  });

  it("navigates straight in when the account has no second factor", async () => {
    login.mockResolvedValue(null);
    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    await signIn();
    expect(login).toHaveBeenCalledWith("a@x.com", "a-strong-enough-phrase");
    expect(navigate).toHaveBeenCalledWith("/", { replace: true });
    expect(completeMfa).not.toHaveBeenCalled();
  });

  it("asks for the code when the server returns a challenge, and only then signs in", async () => {
    login.mockResolvedValue(CHALLENGE);
    completeMfa.mockResolvedValue(undefined);
    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    await signIn();

    // No navigation yet; the password alone is not a session.
    expect(navigate).not.toHaveBeenCalled();
    const codeField = screen.getByLabelText(/Verification code/);
    expect(codeField).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Password/)).not.toBeInTheDocument();

    await userEvent.type(codeField, "123456");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect(completeMfa).toHaveBeenCalledWith(CHALLENGE, "123456");
    expect(navigate).toHaveBeenCalledWith("/", { replace: true });
  });

  it("shows the server's rejection and stays on the code step", async () => {
    login.mockResolvedValue(CHALLENGE);
    completeMfa.mockRejectedValue(new Error("That code is not valid."));
    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    await signIn();
    await userEvent.type(screen.getByLabelText(/Verification code/), "000000");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));

    expect(await screen.findByText(/That code is not valid/)).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Verification code/)).toBeInTheDocument();
  });
});
