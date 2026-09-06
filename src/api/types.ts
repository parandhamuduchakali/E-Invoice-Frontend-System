/**
 * TypeScript mirrors of the backend's Pydantic schemas.
 * Keep field names identical to the API (snake_case) so payloads pass straight through.
 */

// ── Auth / users ───────────────────────────────────────────────────────────

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  /** Long-lived token for POST /auth/refresh. */
  refresh_token: string;
  refresh_expires_in: number;
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
  key_values: Record<string, string[]>;
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
