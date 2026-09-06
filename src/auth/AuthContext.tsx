/**
 * Authentication state: JWT in storage, current user loaded from /auth/me.
 *
 * Any API call that returns 401 dispatches `auth:expired`, which clears the
 * session so the router redirects to the login page.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { authApi, usersApi } from "@/api/endpoints";
import { tokenStore, workspaceStore } from "@/api/client";
import type { User } from "@/api/types";

interface AuthState {
  user: User | null;
  /**
   * The workspace owner whose GST seller profile applies to this user's
   * invoices: the user themselves for managers/admins, their manager for
   * engineers and client users.
   */
  seller: User | null;
  /** True until the stored token has been checked against /auth/me. */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, fullName: string, password: string) => Promise<void>;
  logout: () => void;
  /** Re-fetch the current user (after profile edits). */
  refreshUser: () => Promise<void>;
  setUser: (user: User) => void;
  /** Admin only: the other workspace owner being viewed (null = own workspace). */
  workspace: User | null;
  setWorkspace: (owner: User | null) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [seller, setSeller] = useState<User | null>(null);
  const [workspace, setWorkspaceState] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(tokenStore.get()));
  const queryClient = useQueryClient();

  const logout = useCallback(() => {
    tokenStore.clear();
    workspaceStore.set(null);
    setUser(null);
    setSeller(null);
    setWorkspaceState(null);
    queryClient.clear();
  }, [queryClient]);

  const loadSeller = useCallback(async (me: User) => {
    // An admin who switched workspaces keeps that owner as the seller.
    const wanted = workspaceStore.get();
    if (me.role === "admin" && wanted !== null && wanted !== me.id) {
      try {
        const owner = (await usersApi.list()).find((u) => u.id === wanted && u.organization_id === null) ?? null;
        if (owner) {
          setWorkspaceState(owner);
          setSeller(owner);
          return;
        }
      } catch {
        /* fall through to own workspace */
      }
      workspaceStore.set(null);
    }
    if (me.organization_id === null) {
      setSeller(me);
      return;
    }
    try {
      setSeller(await usersApi.workspace());
    } catch {
      setSeller(null);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const me = await authApi.me();
    setUser(me);
    await loadSeller(me);
  }, [loadSeller]);

  // Validate a stored token on first load.
  useEffect(() => {
    if (!tokenStore.get()) {
      setLoading(false);
      return;
    }
    authApi
      .me()
      .then(async (me) => {
        setUser(me);
        await loadSeller(me);
      })
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, [loadSeller]);

  // Central 401 handling.
  useEffect(() => {
    const handler = () => logout();
    window.addEventListener("auth:expired", handler);
    return () => window.removeEventListener("auth:expired", handler);
  }, [logout]);

  const login = useCallback(
    async (email: string, password: string) => {
      const token = await authApi.login(email, password);
      tokenStore.set(token.access_token, token.refresh_token);
      await refreshUser();
    },
    [refreshUser],
  );

  const register = useCallback(
    async (email: string, fullName: string, password: string) => {
      await authApi.register(email, fullName, password);
      await login(email, password);
    },
    [login],
  );

  const setUserAndSeller = useCallback(
    (u: User) => {
      setUser(u);
      if (u.organization_id === null && !workspace) setSeller(u);
    },
    [workspace],
  );

  const setWorkspace = useCallback(
    (owner: User | null) => {
      const target = owner && user && owner.id !== user.id ? owner : null;
      workspaceStore.set(target ? target.id : null);
      setWorkspaceState(target);
      setSeller(target ?? user);
      queryClient.clear(); // every list/stat belongs to the other workspace now
    },
    [queryClient, user],
  );

  const value = useMemo<AuthState>(
    () => ({ user, seller, loading, login, register, logout, refreshUser, setUser: setUserAndSeller, workspace, setWorkspace }),
    [user, seller, loading, login, register, logout, refreshUser, setUserAndSeller, workspace, setWorkspace],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>.");
  return ctx;
}
