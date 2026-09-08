/**
 * The Scan page: choosing a pipeline, and the two ways waiting used to go wrong.
 *
 * Both failures looked identical to the user — an idle page with no result and
 * no message — which is why they went unnoticed: re-scanning a file already in
 * the library, and a poll that failed once.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OcrStatus, StoredDocument, User } from "@/api/types";
import { emptyStructured, invoiceClassification } from "./fixtures";

const documentsUpload = vi.fn();
const documentsGet = vi.fn();
const ocrStatus = vi.fn();

vi.mock("@/api/endpoints", () => ({
  documentsApi: {
    upload: (file: File, options: unknown) => documentsUpload(file, options),
    get: (id: number) => documentsGet(id),
  },
  ocrApi: { status: () => ocrStatus() },
}));

const seller = { id: 1, role: "manager", gstin: "27AAPFU0939F1ZV" } as unknown as User;
vi.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ user: seller, seller }) }));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

const { OcrPage } = await import("@/pages/OcrPage");

const STATUS: OcrStatus = {
  available: true, engine: "paddleocr", profile: "fast", lang: "en", dpi: 200, max_file_mb: 20, max_pages: 20,
  default_pipeline: "rules",
  pipelines: [
    { name: "rules", label: "Rule-based", available: true, reason: "", ocr: "paddleocr", extractor: "rules", data_leaves_server: false, description: "Local and deterministic." },
    { name: "ai", label: "AI (Azure)", available: true, reason: "", ocr: "azure-vision", extractor: "azure-openai:gpt-4.1", data_leaves_server: true, description: "Azure reads the page." },
  ],
};

function processed(over: Partial<StoredDocument> = {}): StoredDocument {
  return {
    id: 1, filename: "invoice.png", content_type: "image/png", size_bytes: 1000, status: "processed",
    engine: "paddleocr", page_count: 1, error: null, invoice_id: null, uploaded_by_id: 1,
    created_at: "2026-09-08T10:00:00Z", processed_at: "2026-09-08T10:01:00Z", sha256: "a".repeat(64),
    full_text: "TAX INVOICE", duplicate: false,
    extracted_fields: {
      gstins: [], invalid_gstins: [], invoice_numbers: ["INV-9"], dates: ["2026-09-01"], amounts: [],
      total_amount: 1180, hsn_codes: [], gst_rates: [18], irn: null, place_of_supply: null,
      place_of_supply_code: null, state_codes: [], reverse_charge: null, currency: "INR",
      line_items: [], key_values: {}, structured: emptyStructured(),
      classification: invoiceClassification(), extraction_method: "rules", extraction_notes: [],
    },
    ...over,
  } as StoredDocument;
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter><OcrPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

async function pickAndExtract(name = "Extract fields") {
  const file = new File(["x"], "invoice.png", { type: "image/png" });
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await userEvent.upload(input, file);
  await userEvent.click(await screen.findByRole("button", { name }));
}

describe("scan page", () => {
  beforeEach(() => {
    ocrStatus.mockResolvedValue(STATUS);
    documentsUpload.mockReset();
    documentsGet.mockReset();
  });

  it("offers both pipelines and sends the one that was chosen", async () => {
    documentsUpload.mockResolvedValue(processed());
    documentsGet.mockResolvedValue(processed());
    renderPage();

    expect(await screen.findByText("Rule-based")).toBeInTheDocument();
    expect(screen.getByText("AI (Azure)")).toBeInTheDocument();
    expect(screen.getByText(/document is sent to a third-party service/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: /AI \(Azure\)/ }));
    await pickAndExtract("Extract with AI");

    expect(documentsUpload).toHaveBeenCalledTimes(1);
    expect(documentsUpload.mock.calls[0][1]).toMatchObject({ pipeline: "ai" });
  });

  it("shows the result again when the same file is scanned twice", async () => {
    // The second upload returns the record already on screen, so the job id
    // does not change; nothing refetched and the page stayed blank for ever.
    documentsUpload.mockImplementation(async () => processed({ duplicate: true }));
    documentsGet.mockImplementation(async () => processed({ duplicate: true }));
    renderPage();

    await pickAndExtract();
    expect(await screen.findByText("INV-9")).toBeInTheDocument();

    await pickAndExtract();
    await waitFor(() => expect(documentsUpload).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("INV-9")).toBeInTheDocument();
    expect(screen.getByText(/uploaded before/)).toBeInTheDocument();
  });

  it("says so when it cannot read the job's progress, instead of going quiet", async () => {
    documentsUpload.mockResolvedValue(processed({ status: "pending" }));
    documentsGet.mockRejectedValue(new Error("Network request failed"));
    renderPage();

    await pickAndExtract();
    expect(await screen.findByText(/Could not read the job/)).toBeInTheDocument();
    expect(screen.getByText(/Network request failed/)).toBeInTheDocument();
  });

  it("names the pipeline that produced the fields", async () => {
    const ai = processed();
    ai.extracted_fields!.extraction_method = "ai";
    ai.extracted_fields!.extraction_notes = ["Dropped recipient gstin '29AAACR5055K1Z3': not found in the recognised text."];
    documentsUpload.mockResolvedValue(ai);
    documentsGet.mockResolvedValue(ai);
    renderPage();

    await pickAndExtract();
    expect(await screen.findByText(/AI \(Azure OpenAI\), grounded against the OCR text/)).toBeInTheDocument();
    expect(screen.getByText(/Dropped recipient gstin/)).toBeInTheDocument();
  });
});
