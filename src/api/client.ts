/**
 * Thin fetch wrapper for the E-Invoice API.
 *
 * - Prefixes every path with the configured base URL (empty in dev → Vite proxy).
 * - Attaches the in-memory access token as a Bearer token.
 * - Sends `X-Workspace-Id` when an admin has switched to another workspace.
 * - On 401, asks the server for a new access token once (single-flight) and
 *   retries the request; if that fails it clears the session and emits
 *   `auth:expired` so the auth context logs out.
 * - Normalises the backend's `{error, detail}` bodies (and FastAPI 422 bodies)
 *   into an {@link ApiError} so pages can show one consistent message.
 *
 * ## Where the tokens live
 *
 * The access token is held in a module variable and **never** written to
 * `localStorage`. The refresh token is not held here at all: the backend sets
 * it as an `HttpOnly` cookie scoped to `/api/v1/auth`, so this file — and any
 * script injected into the page — cannot read it. That is the point. An XSS
 * bug that can read a seven-day refresh token is an account takeover; the same
 * bug against an access token buys a thirty-minute window and nothing that
 * survives a reload.
 *
 * The cost is that a page reload starts with no token, so
 * {@link refreshSession} runs once on boot to trade the cookie for a fresh
 * access token (see `src/auth/AuthContext.tsx`).
 */

const WORKSPACE_KEY = "einvoice.workspace";
const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, "") ?? "";

/** Backend header an admin uses to act on another owner's workspace. */
export const WORKSPACE_HEADER = "X-Workspace-Id";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** Seconds to wait, from a 429's `Retry-After` header. */
  readonly retryAfter: number | null;

  constructor(status: number, code: string, message: string, retryAfter: number | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode) — session-only state */
  }
}

/**
 * The access token, in memory for the lifetime of the page.
 *
 * Deliberately not persisted: a reload restores the session from the refresh
 * cookie instead, which keeps the long-lived credential out of reach of page
 * scripts entirely.
 */
let accessToken: string | null = null;

export const tokenStore = {
  get(): string | null {
    return accessToken;
  },
  set(token: string | null): void {
    accessToken = token;
  },
  clear(): void {
    accessToken = null;
  },
};

/** The workspace an admin is currently viewing (null = their own). */
export const workspaceStore = {
  get(): number | null {
    const raw = read(WORKSPACE_KEY);
    const id = raw ? Number(raw) : NaN;
    return Number.isInteger(id) && id > 0 ? id : null;
  },
  set(id: number | null): void {
    write(WORKSPACE_KEY, id === null ? null : String(id));
  },
};

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** Multipart upload — `body` must be a FormData and no JSON header is set. */
  form?: FormData;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Return the raw body as a Blob (file downloads). */
  blob?: boolean;
  /** Internal: set after one refresh-and-retry so we never loop. */
  retried?: boolean;
}

function buildQuery(query?: RequestOptions["query"]): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** Turns a FastAPI 422 validation body into one readable sentence. */
function describeValidationErrors(detail: unknown): string {
  if (!Array.isArray(detail)) return typeof detail === "string" ? detail : "Validation failed.";
  return detail
    .map((item) => {
      const loc = Array.isArray(item?.loc) ? item.loc.filter((p: unknown) => p !== "body").join(".") : "";
      const msg = typeof item?.msg === "string" ? item.msg.replace(/^Value error, /, "") : "invalid";
      return loc ? `${loc}: ${msg}` : msg;
    })
    .join(" ");
}

// ── Refresh (single-flight) ────────────────────────────────────────────────

let refreshing: Promise<boolean> | null = null;

/**
 * Trades the refresh cookie for a new access token.
 *
 * Sends no body: the token is in the `HttpOnly` cookie the browser attaches to
 * `/api/v1/auth`. Resolves false when there is no usable session, which is the
 * normal answer for a first-time visitor.
 */
export function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = fetch(`${BASE_URL}/api/v1/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) return false;
        const tokens = (await response.json()) as { access_token: string };
        tokenStore.set(tokens.access_token);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

function expireSession(): void {
  tokenStore.clear();
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("auth:expired"));
}

// A 401 from these means "those credentials are wrong", not "your session
// expired". Refreshing would be pointless — during sign-in there is no session
// yet — and the failed refresh would fire auth:expired, logging the user out of
// a session they are in the middle of establishing.
const NO_REFRESH_PATHS = [
  "/api/v1/auth/login",
  "/api/v1/auth/refresh",
  "/api/v1/auth/logout",
  "/api/v1/auth/register",
  "/api/v1/auth/mfa/verify",
  "/api/v1/auth/forgot-password",
  "/api/v1/auth/reset-password",
];

// ── Core request ───────────────────────────────────────────────────────────

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: options.blob ? "*/*" : "application/json" };
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  const workspace = workspaceStore.get();
  if (workspace !== null) headers[WORKSPACE_HEADER] = String(workspace);

  let body: BodyInit | undefined;
  if (options.form) {
    body = options.form;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const response = await fetch(`${BASE_URL}${path}${buildQuery(options.query)}`, {
    method: options.method ?? (body ? "POST" : "GET"),
    headers,
    body,
    // The refresh cookie is path-scoped to /api/v1/auth, so this only actually
    // sends anything on the auth routes; it has to be set here because that is
    // where login, refresh and logout are issued from.
    credentials: "include",
  });

  if (response.status === 401 && !options.retried && !NO_REFRESH_PATHS.includes(path)) {
    // Attempted even with no access token in hand: after a reload there is
    // none, and the refresh cookie may still be perfectly valid.
    if (await refreshSession()) return request<T>(path, { ...options, retried: true });
    expireSession();
  }

  if (response.status === 204) return undefined as T;
  if (response.ok && options.blob) return (await response.blob()) as T;

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const payload = (data ?? {}) as Partial<{ error: string; detail: unknown }>;
    const code = payload.error ?? (response.status === 422 ? "VALIDATION_ERROR" : `HTTP_${response.status}`);
    const message =
      typeof payload.detail === "string"
        ? payload.detail
        : payload.detail !== undefined
          ? describeValidationErrors(payload.detail)
          : response.statusText || "Request failed.";
    const retryAfter = Number(response.headers.get("Retry-After"));
    throw new ApiError(response.status, code, message, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null);
  }

  return data as T;
}

export const api = {
  get: <T>(path: string, query?: RequestOptions["query"]) => request<T>(path, { method: "GET", query }),
  post: <T>(path: string, body?: unknown, query?: RequestOptions["query"]) =>
    request<T>(path, { method: "POST", body, query }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body }),
  delete: <T = void>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, form: FormData, query?: RequestOptions["query"]) =>
    request<T>(path, { method: "POST", form, query }),
  blob: (path: string) => request<Blob>(path, { method: "GET", blob: true }),
};
