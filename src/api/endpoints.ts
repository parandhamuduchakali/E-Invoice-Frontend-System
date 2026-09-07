/** One function per backend route, grouped by resource. */

import { api, request } from "./client";
import type {
  AuditEvent,
  Client,
  ClientInput,
  DashboardStats,
  EInvoicePayload,
  EInvoiceReadiness,
  GstStateCode,
  GstinValidation,
  Invoice,
  InvoiceCreateRequest,
  InvoiceStatus,
  InvoiceUpdateRequest,
  IrnCancelRequest,
  IrnRecordRequest,
  IrpCredentials,
  IrpCredentialsInput,
  IrpStatus,
  MfaChallenge,
  MfaEnabled,
  MfaSetup,
  IrpSubmissionResult,
  PasswordChangeRequest,
  OcrDocument,
  OcrExtractOptions,
  OcrStatus,
  PaginatedAuditEvents,
  PaginatedInvoices,
  StoredDocument,
  StoredDocumentSummary,
  TokenResponse,
  User,
  UserAdminUpdateRequest,
  UserCreateRequest,
  UserUpdateRequest,
} from "./types";

const V1 = "/api/v1";

export const authApi = {
  register: (email: string, full_name: string, password: string) =>
    api.post<User>(`${V1}/auth/register`, { email, full_name, password }),
  /** A session, or — for an account with a second factor — a challenge to complete first. */
  login: (email: string, password: string) =>
    api.post<TokenResponse | MfaChallenge>(`${V1}/auth/login`, { email, password }),
  mfaVerify: (mfa_token: string, code: string) => api.post<TokenResponse>(`${V1}/auth/mfa/verify`, { mfa_token, code }),
  mfaSetup: () => api.post<MfaSetup>(`${V1}/auth/mfa/setup`),
  mfaEnable: (code: string) => api.post<MfaEnabled>(`${V1}/auth/mfa/enable`, { code }),
  mfaDisable: (code: string) => api.post<void>(`${V1}/auth/mfa/disable`, { code }),
  me: () => api.get<User>(`${V1}/auth/me`),
  /**
   * Renews the session. Sends no body: the refresh token is in the HttpOnly
   * cookie the browser attaches to `/api/v1/auth`. Prefer `refreshSession()`
   * from the client module, which is single-flighted.
   */
  refresh: () => api.post<TokenResponse>(`${V1}/auth/refresh`),
  /** Clears the refresh cookie server-side. Always succeeds. */
  logout: () => api.post<void>(`${V1}/auth/logout`),
  /** Always resolves (202) — the server never reveals whether the email exists. */
  forgotPassword: (email: string) => api.post<void>(`${V1}/auth/forgot-password`, { email }),
  /** 400 when the token is unknown, used, or expired. */
  resetPassword: (token: string, new_password: string) => api.post<void>(`${V1}/auth/reset-password`, { token, new_password }),
};

export const usersApi = {
  updateMe: (body: UserUpdateRequest) => api.patch<User>(`${V1}/users/me`, body),
  list: () => api.get<User[]>(`${V1}/users/`),
  create: (body: UserCreateRequest) => api.post<User>(`${V1}/users/`, body),
  update: (id: number, body: UserAdminUpdateRequest) => api.patch<User>(`${V1}/users/${id}`, body),
  roles: () => api.get<Record<string, string[]>>(`${V1}/users/roles`),
  /** Profile of the workspace owner — the seller whose GST details go on every invoice. */
  workspace: () => api.get<User>(`${V1}/users/workspace`),
  /** Revokes every other session; returns a fresh pair so this device stays signed in. */
  changePassword: (body: PasswordChangeRequest) => api.post<TokenResponse>(`${V1}/users/me/password`, body),
};

export const clientsApi = {
  list: () => api.get<Client[]>(`${V1}/clients/`),
  get: (id: number) => api.get<Client>(`${V1}/clients/${id}`),
  create: (body: ClientInput) => api.post<Client>(`${V1}/clients/`, body),
  update: (id: number, body: Partial<ClientInput>) => api.patch<Client>(`${V1}/clients/${id}`, body),
  remove: (id: number) => api.delete(`${V1}/clients/${id}`),
};

// Type alias (not interface) so it is assignable to the client's query record.
export type InvoiceListParams = {
  page?: number;
  size?: number;
  status?: InvoiceStatus | "";
  search?: string;
  /** Client-wise view: only this client's invoices. */
  client_id?: number | "";
};

export const invoicesApi = {
  stats: (clientId?: number | "") => api.get<DashboardStats>(`${V1}/invoices/stats`, { client_id: clientId }),
  list: (params: InvoiceListParams) => api.get<PaginatedInvoices>(`${V1}/invoices/`, params),
  get: (id: number) => api.get<Invoice>(`${V1}/invoices/${id}`),
  create: (body: InvoiceCreateRequest) => api.post<Invoice>(`${V1}/invoices/`, body),
  update: (id: number, body: InvoiceUpdateRequest) => api.patch<Invoice>(`${V1}/invoices/${id}`, body),
  remove: (id: number) => api.delete(`${V1}/invoices/${id}`),
  readiness: (id: number) => api.get<EInvoiceReadiness>(`${V1}/invoices/${id}/einvoice/readiness`),
  einvoice: (id: number) => api.get<EInvoicePayload>(`${V1}/invoices/${id}/einvoice`),
  recordIrn: (id: number, body: IrnRecordRequest) => api.post<Invoice>(`${V1}/invoices/${id}/irn`, body),
  /** Files the invoice with the IRP and stores the IRN it returns. */
  submitEinvoice: (id: number) => api.post<IrpSubmissionResult>(`${V1}/invoices/${id}/einvoice/submit`),
  /** Cancels the IRN at the portal — only within its 24-hour window. */
  cancelIrn: (id: number, body: IrnCancelRequest) => api.post<Invoice>(`${V1}/invoices/${id}/einvoice/cancel`, body),
  /** Which IRP backend this deployment files with, and whether it is live. */
  irpStatus: () => api.get<IrpStatus>(`${V1}/invoices/irp/status`),
  /** The INV-01 exactly as filed — frozen at registration, unlike `einvoice`. */
  filedEinvoice: (id: number) => api.get<EInvoicePayload>(`${V1}/invoices/${id}/einvoice/filed`),
  irpCredentials: () => api.get<IrpCredentials>(`${V1}/invoices/irp/credentials`),
  setIrpCredentials: (body: IrpCredentialsInput) => request<IrpCredentials>(`${V1}/invoices/irp/credentials`, { method: "PUT", body }),
  removeIrpCredentials: () => api.delete(`${V1}/invoices/irp/credentials`),
};

export const gstApi = {
  stateCodes: () => api.get<GstStateCode[]>(`${V1}/gst/state-codes`),
  validateGstin: (gstin: string) => api.get<GstinValidation>(`${V1}/gst/validate-gstin`, { gstin }),
};

export const documentsApi = {
  /**
   * Uploads a document and returns at once (202) with `status: "pending"`.
   * OCR runs on the server afterwards — poll `get(id)` until the status is
   * `processed` or `failed`. Prefer this over `ocrApi.extract`, which holds
   * the connection open for the whole parse (~40s for one page).
   */
  upload: (file: File, options: OcrExtractOptions = {}) => {
    const form = new FormData();
    form.append("file", file, file.name);
    return api.upload<StoredDocument>(`${V1}/documents/`, form, options);
  },
  list: () => api.get<StoredDocumentSummary[]>(`${V1}/documents/`),
  get: (id: number) => api.get<StoredDocument>(`${V1}/documents/${id}`),
  /** Original upload as a Blob (needs the auth header, so not a plain link). */
  file: (id: number) => api.blob(`${V1}/documents/${id}/file`),
  retry: (id: number) => api.post<OcrDocument>(`${V1}/documents/${id}/retry`),
  remove: (id: number) => api.delete(`${V1}/documents/${id}`),
};

export const ocrApi = {
  status: () => api.get<OcrStatus>(`${V1}/ocr/status`),
  /** Synchronous parse — blocks until the engine finishes. Prefer documentsApi.upload. */
  extract: (file: File, options: OcrExtractOptions = {}) => {
    const form = new FormData();
    form.append("file", file, file.name);
    return api.upload<OcrDocument>(`${V1}/ocr/extract`, form, options);
  },
};

// Type alias (not interface) so it is assignable to the client's query record.
export type AuditListParams = {
  page?: number;
  size?: number;
  action?: string;
  entity_type?: string;
  entity_id?: string;
  actor_id?: number | "";
  date_from?: string;
  date_to?: string;
  /** Admins only: "all" reads every workspace instead of the current one. */
  scope?: "workspace" | "all";
};

export const auditApi = {
  list: (params: AuditListParams) => api.get<PaginatedAuditEvents>(`${V1}/audit/`, params),
  /** The catalogue of action values, for the filter menu. */
  actions: () => api.get<string[]>(`${V1}/audit/actions`),
  /** CSV of the current filter; a Blob because the request needs the auth header. */
  exportCsv: (params: AuditListParams) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
    }
    const suffix = query.toString();
    return api.blob(`${V1}/audit/export.csv${suffix ? `?${suffix}` : ""}`);
  },
};

export type { AuditEvent };
