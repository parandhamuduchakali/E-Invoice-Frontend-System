/**
 * Compile-time proof that the hand-written types in ./types.ts still describe
 * the backend's API.
 *
 * ./schema.d.ts is generated from the backend's OpenAPI document
 * (`npm run gen:api`). The hand-written types stay because they carry the
 * documentation and the narrower unions the pages rely on — but every one of
 * them is asserted here to have exactly the same keys as the generated schema
 * it mirrors. Rename a field on the server and `tsc` fails on this file,
 * naming the field, instead of a page rendering `undefined`.
 *
 * This file exports nothing and is never imported at runtime; it exists to be
 * type-checked.
 */

import type { components } from "./schema";
import type {
  AuditEvent,
  Client,
  ExtractedDocumentDetails,
  DocumentClassification,
  ExtractedFieldEvidence,
  ExtractedInvoiceFields,
  ExtractedLineItem,
  ExtractedParty,
  ExtractedTaxTotals,
  Invoice,
  IrnCancelRequest,
  IrnRecordRequest,
  IrpCredentials,
  IrpCredentialsInput,
  IrpStatus,
  MfaChallenge,
  MfaEnabled,
  MfaSetup,
  IrpSubmissionResult,
  LineItem,
  PaginatedAuditEvents,
  PaginatedInvoices,
  StoredDocument,
  OcrStatus,
  PipelineInfo,
  StructuredInvoice,
  TokenResponse,
  User,
} from "./types";

type Schemas = components["schemas"];

/**
 * `true` when A and B have the same keys; otherwise an object type naming the
 * keys each side is missing — which is what appears in the compiler error.
 */
type SameKeys<A, B> = [Exclude<keyof A, keyof B>, Exclude<keyof B, keyof A>] extends [never, never]
  ? true
  : { missingFromHandWrittenType: Exclude<keyof B, keyof A>; notInBackendSchema: Exclude<keyof A, keyof B> };

// Assigning `true` only compiles when SameKeys resolved to `true`.
const invoice: SameKeys<Invoice, Schemas["InvoiceResponse"]> = true;
const lineItem: SameKeys<LineItem, Schemas["LineItemResponse"]> = true;
const paginatedInvoices: SameKeys<PaginatedInvoices, Schemas["PaginatedInvoicesResponse"]> = true;
const client: SameKeys<Client, Schemas["ClientResponse"]> = true;
const user: SameKeys<User, Schemas["UserResponse"]> = true;
const token: SameKeys<TokenResponse, Schemas["TokenResponse"]> = true;
const storedDocument: SameKeys<StoredDocument, Schemas["DocumentResponse"]> = true;
const extractedFields: SameKeys<ExtractedInvoiceFields, Schemas["ExtractedInvoiceFieldsResponse"]> = true;
const extractedLineItem: SameKeys<ExtractedLineItem, Schemas["ExtractedLineItemResponse"]> = true;
const structured: SameKeys<StructuredInvoice, Schemas["StructuredInvoiceResponse"]> = true;
const party: SameKeys<ExtractedParty, Schemas["PartyDetailsResponse"]> = true;
const documentDetails: SameKeys<ExtractedDocumentDetails, Schemas["DocumentDetailsResponse"]> = true;
const totals: SameKeys<ExtractedTaxTotals, Schemas["TaxTotalsResponse"]> = true;
const evidence: SameKeys<ExtractedFieldEvidence, Schemas["FieldEvidenceResponse"]> = true;
const classification: SameKeys<DocumentClassification, Schemas["DocumentClassificationResponse"]> = true;
const ocrStatus: SameKeys<OcrStatus, Schemas["OcrStatusResponse"]> = true;
const pipelineInfo: SameKeys<PipelineInfo, Schemas["PipelineInfoResponse"]> = true;
const auditEvent: SameKeys<AuditEvent, Schemas["AuditEventResponse"]> = true;
const paginatedAudit: SameKeys<PaginatedAuditEvents, Schemas["PaginatedAuditEvents"]> = true;
const irpStatus: SameKeys<IrpStatus, Schemas["IrpStatusResponse"]> = true;
const irpSubmission: SameKeys<IrpSubmissionResult, Schemas["IrpSubmissionResponse"]> = true;
const irnRecord: SameKeys<IrnRecordRequest, Schemas["IrnRecordRequest"]> = true;
const irnCancel: SameKeys<IrnCancelRequest, Schemas["IrnCancelRequest"]> = true;
const mfaChallenge: SameKeys<MfaChallenge, Schemas["MfaChallengeResponse"]> = true;
const mfaSetup: SameKeys<MfaSetup, Schemas["MfaSetupResponse"]> = true;
const mfaEnabled: SameKeys<MfaEnabled, Schemas["MfaEnabledResponse"]> = true;
const irpCredentials: SameKeys<IrpCredentials, Schemas["IrpCredentialsResponse"]> = true;
const irpCredentialsInput: SameKeys<IrpCredentialsInput, Schemas["IrpCredentialsRequest"]> = true;

// Referenced so the compiler does not report them as unused.
export const CONTRACT_CHECKS = [
  invoice, lineItem, paginatedInvoices, client, user, token, storedDocument, extractedFields,
  extractedLineItem, structured, party, documentDetails, totals, evidence, classification, ocrStatus, pipelineInfo,
  auditEvent, paginatedAudit,
  irpStatus, irpSubmission, irnRecord, irnCancel, mfaChallenge, mfaSetup, mfaEnabled, irpCredentials, irpCredentialsInput,
] as const;
