/**
 * TypeScript mirrors of the backend's Pydantic schemas.
 * Keep field names identical to the API (snake_case) so payloads pass straight through.
 */

// ── Auth / users ───────────────────────────────────────────────────────────

/** Returned by POST /auth/login for an account with a second factor: no session yet. */
export interface MfaChallenge {
  mfa_required: true;
  /** Short-lived proof the password step passed; opens nothing but /auth/mfa/verify. */
  mfa_token: string;
  expires_in: number;
}

export interface MfaSetup {
  secret: string;
  /** Render as a QR code for the authenticator app. */
  otpauth_url: string;
}

export interface MfaEnabled {
  /** Shown once; stored only as hashes. */
  recovery_codes: string[];
}

/** A workspace's own IRP login (secrets masked on read). */
export interface IrpCredentials {
  configured: boolean;
  decryptable: boolean;
  base_url: string | null;
  client_id: string | null;
  client_secret_masked: string | null;
  username: string | null;
  password_masked: string | null;
  gstin: string | null;
  public_key_present: boolean;
  updated_at: string | null;
}

export interface IrpCredentialsInput {
  base_url: string;
  client_id: string;
  client_secret: string;
  username: string;
  password: string;
  gstin: string;
  public_key_pem: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  /**
   * Null in the default backend configuration: the refresh token is delivered
   * as an HttpOnly cookie so page scripts cannot read it. Only populated when
   * the server runs with `REFRESH_TOKEN_IN_BODY=true` for API clients.
   */
  refresh_token: string | null;
  refresh_expires_in: number;
}

/** One row of the append-only audit trail (`GET /api/v1/audit/`). */
export interface AuditEvent {
  id: number;
  occurred_at: string;
  workspace_id: number | null;
  actor_id: number | null;
  actor_email: string | null;
  actor_role: string | null;
  /** Namespaced action, e.g. `invoice.irn_recorded`. */
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  /**
   * `{field: {from, to}}` for updates, or free-form context for other actions.
   * Secrets are stripped and long values abbreviated server-side.
   */
  changes: Record<string, unknown> | null;
  request_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
}

export interface PaginatedAuditEvents {
  items: AuditEvent[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export type UserRole = "admin" | "manager" | "engineer" | "client";
export const USER_ROLES: UserRole[] = ["admin", "manager", "engineer", "client"];

export interface User {
  id: number;
  email: string;
  full_name: string;
  is_active: boolean;
  is_admin: boolean;
  role: UserRole;
  /** Workspace owner id for members (engineer/client); null for owners (admin/manager). */
  organization_id: number | null;
  /** For client-portal users: the client record they represent. */
  client_id: number | null;
  created_at: string;
  mfa_enabled: boolean;
  // GST seller profile (SellerDtls)
  legal_name: string | null;
  trade_name: string | null;
  gstin: string | null;
  address1: string | null;
  address2: string | null;
  location: string | null;
  pincode: string | null;
  state_code: string | null;
  phone: string | null;
}

export interface UserCreateRequest {
  email: string;
  full_name: string;
  password: string;
  role: UserRole;
  client_id?: number | null;
}

export interface UserAdminUpdateRequest {
  role?: UserRole;
  client_id?: number | null;
  is_active?: boolean;
  full_name?: string;
  /** Reset the member's password (manager/admin). */
  password?: string;
}

export interface PasswordChangeRequest {
  current_password: string;
  new_password: string;
}

export interface UserUpdateRequest {
  full_name?: string;
  email?: string;
  legal_name?: string | null;
  trade_name?: string | null;
  gstin?: string | null;
  address1?: string | null;
  address2?: string | null;
  location?: string | null;
  pincode?: string | null;
  state_code?: string | null;
  phone?: string | null;
}

// ── Clients (BuyerDtls) ────────────────────────────────────────────────────

export interface Client {
  id: number;
  owner_id: number;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  country: string | null;
  tax_id: string | null;
  gstin: string | null;
  legal_name: string | null;
  trade_name: string | null;
  state_code: string | null;
  place_of_supply: string | null;
  created_at: string;
}

export type ClientInput = Omit<Client, "id" | "owner_id" | "created_at">;

// ── Invoices ───────────────────────────────────────────────────────────────

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";
export type DocumentType = "INV" | "CRN" | "DBN";
export type SupplyType = "B2B" | "B2C" | "SEZWP" | "SEZWOP" | "EXPWP" | "EXPWOP" | "DEXP";

export const INVOICE_STATUSES: InvoiceStatus[] = ["draft", "sent", "paid", "overdue", "cancelled"];
export const DOCUMENT_TYPES: { value: DocumentType; label: string }[] = [
  { value: "INV", label: "Tax Invoice" },
  { value: "CRN", label: "Credit Note" },
  { value: "DBN", label: "Debit Note" },
];
export const SUPPLY_TYPES: { value: SupplyType; label: string }[] = [
  { value: "B2B", label: "B2B — registered business" },
  { value: "B2C", label: "B2C — consumer" },
  { value: "SEZWP", label: "SEZ with payment of tax" },
  { value: "SEZWOP", label: "SEZ without payment of tax" },
  { value: "EXPWP", label: "Export with payment of tax" },
  { value: "EXPWOP", label: "Export without payment of tax" },
  { value: "DEXP", label: "Deemed export" },
];

export interface LineItemInput {
  description: string;
  hsn_code?: string | null;
  is_service?: boolean;
  unit?: string | null;
  quantity: number;
  unit_price: number;
  discount?: number;
  gst_rate?: number | null;
}

export interface LineItem extends Required<Omit<LineItemInput, "hsn_code" | "unit" | "gst_rate">> {
  id: number;
  hsn_code: string | null;
  unit: string | null;
  gst_rate: number | null;
  amount: number;
  taxable_value: number;
  igst_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  total_amount: number;
}

export interface DispatchDetails {
  name: string;
  address1: string;
  address2?: string | null;
  location: string;
  pincode: string;
  state_code: string;
}

export interface ShipToDetails {
  gstin?: string | null;
  legal_name: string;
  trade_name?: string | null;
  address1: string;
  address2?: string | null;
  location: string;
  pincode: string;
  state_code: string;
}

export interface InvoiceCreateRequest {
  client_id: number;
  document_type: DocumentType;
  supply_type: SupplyType;
  reverse_charge: boolean;
  igst_on_intra: boolean;
  place_of_supply?: string | null;
  /** Number printed on an imported/scanned document; unique per owner (409 on repeat). */
  source_reference?: string | null;
  /** Stored document (see /documents) this invoice is created from. */
  document_id?: number | null;
  issue_date: string;
  due_date: string;
  preceding_invoice_number?: string | null;
  preceding_invoice_date?: string | null;
  dispatch_from?: DispatchDetails | null;
  ship_to?: ShipToDetails | null;
  tax_rate: number;
  discount: number;
  notes?: string | null;
  terms?: string | null;
  line_items: LineItemInput[];
}

export type InvoiceUpdateRequest = Partial<Omit<InvoiceCreateRequest, "client_id" | "issue_date">> & {
  status?: InvoiceStatus;
};

export interface Invoice {
  id: number;
  invoice_number: string;
  owner_id: number;
  client_id: number;
  status: InvoiceStatus;
  /** Statuses this invoice may move to next (empty when paid/cancelled). */
  allowed_status_transitions: InvoiceStatus[];
  document_type: DocumentType;
  supply_type: SupplyType;
  reverse_charge: boolean;
  igst_on_intra: boolean;
  place_of_supply: string | null;
  source_reference: string | null;
  document_id: number | null;
  issue_date: string;
  due_date: string;
  preceding_invoice_number: string | null;
  preceding_invoice_date: string | null;
  dispatch_from: DispatchDetails | null;
  ship_to: ShipToDetails | null;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  igst_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  discount: number;
  total: number;
  irn: string | null;
  ack_no: string | null;
  ack_date: string | null;
  signed_qr_code: string | null;
  signed_invoice: string | null;
  /** Which backend registered it: `nic` (filed) or `mock` (simulated locally). */
  irp_backend: string | null;
  irp_submitted_at: string | null;
  irn_cancelled_at: string | null;
  irn_cancel_reason: string | null;
  irn_cancel_remarks: string | null;
  notes: string | null;
  terms: string | null;
  created_at: string;
  updated_at: string | null;
  line_items: LineItem[];
}

export interface InvoiceListItem {
  id: number;
  invoice_number: string;
  client_id: number;
  status: InvoiceStatus;
  document_type: DocumentType;
  supply_type: SupplyType;
  issue_date: string;
  due_date: string;
  total: number;
  irn: string | null;
  source_reference?: string | null;
  created_at: string;
}

export interface PaginatedInvoices {
  items: InvoiceListItem[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

export interface DashboardStats {
  total_invoices: number;
  total_paid: number;
  total_pending: number;
  overdue_count: number;
  /** Client filter that was applied, or null for all clients. */
  client_id: number | null;
  /** Invoice count per status — always all five keys. */
  by_status: Record<InvoiceStatus, number>;
  amount_by_status: Record<InvoiceStatus, number>;
  total_amount: number;
}

// ── GST e-invoice ──────────────────────────────────────────────────────────

export interface EInvoiceReadiness {
  ready: boolean;
  errors: string[];
}

export type EInvoicePayload = Record<string, unknown>;

export interface IrnRecordRequest {
  irn: string;
  ack_no: string;
  ack_date: string;
  signed_qr_code?: string | null;
}

export interface GstStateCode {
  code: string;
  name: string;
}

export interface GstinValidation {
  gstin: string;
  valid: boolean;
  state_code: string | null;
  state_name: string | null;
  error: string | null;
}

// ── OCR ────────────────────────────────────────────────────────────────────

export interface OcrLine {
  text: string;
  confidence: number;
  box: number[][];
}

export interface OcrPage {
  page_number: number;
  width: number;
  height: number;
  skew_degrees: number;
  lines: OcrLine[];
  text: string;
}

/** One row of the scanned invoice's item table, recovered from the OCR layout. */
export interface ExtractedLineItem {
  description: string;
  hsn_code: string | null;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  discount: number | null;
  gst_rate: number | null;
  /** Row amount as printed — the taxable value where the table prints one. */
  amount: number | null;
  /** Mean OCR confidence of the cells this row was built from. */
  confidence: number;
  /** Why the row should not be trusted as-is; empty means it reconciles. */
  warnings: string[];
}

/** One party named on a scanned document. Every field is null when unread. */
export interface ExtractedParty {
  legal_name: string | null;
  trade_name: string | null;
  gstin: string | null;
  address: string | null;
  place: string | null;
  state: string | null;
  state_code: string | null;
  pincode: string | null;
}

export interface ExtractedDocumentDetails {
  document_type: string | null;
  document_type_label: string | null;
  document_number: string | null;
  document_date: string | null;
  preceding_invoice_number: string | null;
  preceding_invoice_date: string | null;
  irn: string | null;
  ack_no: string | null;
  ack_date: string | null;
  supply_type: string | null;
  is_service: boolean | null;
  place_of_supply: string | null;
  place_of_supply_code: string | null;
  reverse_charge: boolean | null;
  currency: string | null;
}

export interface ExtractedTaxTotals {
  assessable_value: number | null;
  igst_value: number | null;
  cgst_value: number | null;
  sgst_value: number | null;
  total_invoice_value: number | null;
  round_off: number | null;
}

/** Why a field holds the value it does — shown beside it so a reviewer can rank what to check. */
export interface ExtractedFieldEvidence {
  field_name: string;
  value: unknown;
  matched_label: string | null;
  /** How it was found: label / layout / pattern / fuzzy / derived / context. */
  method: string;
  /** 0-1, ordinal rather than calibrated. Not a probability. */
  confidence: number;
  section: string;
}

/**
 * The scanned document with every value attributed to its role.
 *
 * `ExtractedInvoiceFields` below says *what* is on the page — every GSTIN,
 * every date. This says *whose*: which GSTIN is the supplier's and which the
 * buyer's. Fields with no evidence are null rather than guessed.
 */
export interface StructuredInvoice {
  document: ExtractedDocumentDetails;
  supplier: ExtractedParty;
  recipient: ExtractedParty;
  shipping: ExtractedParty;
  dispatch: ExtractedParty;
  totals: ExtractedTaxTotals;
  /** Cross-field checks that did not hold. */
  warnings: string[];
  evidence: ExtractedFieldEvidence[];
}

export interface ExtractedInvoiceFields {
  gstins: string[];
  invalid_gstins: string[];
  invoice_numbers: string[];
  dates: string[];
  amounts: number[];
  total_amount: number | null;
  hsn_codes: string[];
  gst_rates: number[];
  irn: string | null;
  place_of_supply: string | null;
  place_of_supply_code: string | null;
  state_codes: string[];
  reverse_charge: boolean | null;
  currency: string | null;
  /** Item table rows; empty when the engine returned no box positions. */
  line_items: ExtractedLineItem[];
  key_values: Record<string, string[]>;
  /** Role-assigned view of the same document; prefer this when building an invoice. */
  structured: StructuredInvoice;
}

export interface OcrDocument {
  /** Stored document record for this upload; pass as `document_id` when creating the invoice. */
  document_id: number | null;
  /** The same file had been uploaded before; the stored record was reused. */
  duplicate: boolean;
  filename: string;
  source_type: "pdf" | "image";
  engine: string;
  page_count: number;
  pages: OcrPage[];
  full_text: string;
  extracted_fields: ExtractedInvoiceFields;
}

/** What `GET /invoices/irp/status` reports about this deployment. */
export interface IrpStatus {
  backend: string;
  /** False = submissions are simulated in-process; nothing reaches the government. */
  live: boolean;
  base_url: string;
  gstin: string;
  /** True when this workspace files through its own stored credentials. */
  workspace_credentials: boolean;
  cancel_window_hours: number;
  /** Reason code to label, for the cancellation form. */
  cancel_reasons: Record<string, string>;
}

export interface IrpSubmissionResult {
  invoice: Invoice;
  /** The portal already held this document; the existing registration was adopted. */
  duplicate: boolean;
  backend: string;
  live: boolean;
}

export interface IrnCancelRequest {
  reason_code: "1" | "2" | "3" | "4";
  remarks: string;
}

export interface OcrStatus {
  available: boolean;
  engine: string;
  profile: string;
  lang: string;
  dpi: number;
  max_file_mb: number;
  max_pages: number;
}

// Type alias (not interface) so it is assignable to the client's query record.
export type OcrExtractOptions = {
  preprocess?: boolean;
  deskew?: boolean;
  denoise?: boolean;
  binarize?: boolean;
  use_text_layer?: boolean;
  dpi?: number;
};


// ── Stored documents ───────────────────────────────────────────────────────

export type StoredDocumentStatus = "pending" | "processed" | "failed";

export interface StoredDocumentSummary {
  id: number;
  filename: string;
  content_type: string | null;
  size_bytes: number;
  status: StoredDocumentStatus;
  engine: string | null;
  page_count: number;
  error: string | null;
  invoice_id: number | null;
  uploaded_by_id: number;
  created_at: string;
  processed_at: string | null;
}

export interface StoredDocument extends StoredDocumentSummary {
  sha256: string;
  full_text: string | null;
  extracted_fields: ExtractedInvoiceFields | null;
  duplicate: boolean;
}
