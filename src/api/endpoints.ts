/** One function per backend route, grouped by resource. */

import { api } from "./client";
import type {
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
  IrnRecordRequest,
  PasswordChangeRequest,
  OcrDocument,
  OcrExtractOptions,
  OcrStatus,
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
  login: (email: string, password: string) =>
    api.post<TokenResponse>(`${V1}/auth/login`, { email, password }),
  me: () => api.get<User>(`${V1}/auth/me`),
  refresh: (refresh_token: string) => api.post<TokenResponse>(`${V1}/auth/refresh`, { refresh_token }),
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
  changePassword: (body: PasswordChangeRequest) => api.post<void>(`${V1}/users/me/password`, body),
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
};

export const gstApi = {
  stateCodes: () => api.get<GstStateCode[]>(`${V1}/gst/state-codes`),
  validateGstin: (gstin: string) => api.get<GstinValidation>(`${V1}/gst/validate-gstin`, { gstin }),
};

export const documentsApi = {
  list: () => api.get<StoredDocumentSummary[]>(`${V1}/documents/`),
  get: (id: number) => api.get<StoredDocument>(`${V1}/documents/${id}`),
  /** Original upload as a Blob (needs the auth header, so not a plain link). */
  file: (id: number) => api.blob(`${V1}/documents/${id}/file`),
  retry: (id: number) => api.post<OcrDocument>(`${V1}/documents/${id}/retry`),
  remove: (id: number) => api.delete(`${V1}/documents/${id}`),
};

export const ocrApi = {
  status: () => api.get<OcrStatus>(`${V1}/ocr/status`),
  extract: (file: File, options: OcrExtractOptions = {}) => {
    const form = new FormData();
    form.append("file", file, file.name);
    return api.upload<OcrDocument>(`${V1}/ocr/extract`, form, options);
  },
};
