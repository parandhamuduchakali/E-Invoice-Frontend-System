/**
 * The documents detail panel: it must show the extracted item table, let a
 * user correct it, and let them name the customer before the invoice is built.
 *
 * The table row here is the one really stored for document #1 in the dev
 * database — including the arithmetic warning, which is the case that has to
 * stay visible rather than being hidden by a tidy-looking UI.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Client, ExtractedLineItem, StoredDocument, User } from "@/api/types";
import { emptyStructured } from "./fixtures";

const documentsGet = vi.fn();
const documentsList = vi.fn();
const clientsList = vi.fn();
const navigate = vi.fn();

vi.mock("@/api/endpoints", () => ({
  documentsApi: {
    list: () => documentsList(),
    get: (id: number) => documentsGet(id),
    retry: vi.fn(),
    remove: vi.fn(),
    file: vi.fn(),
  },
  clientsApi: { list: () => clientsList() },
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigate,
    useSearchParams: () => [new URLSearchParams("id=1"), vi.fn()],
  };
});

const seller = { id: 1, role: "manager", gstin: "27AAPFU0939F1ZV", organization_id: null } as unknown as User;
vi.mock("@/auth/AuthContext", () => ({ useAuth: () => ({ user: seller, seller }) }));

const { DocumentsPage } = await import("@/pages/DocumentsPage");

const SCANNED_ROW: ExtractedLineItem = {
  description: "item15",
  hsn_code: "9401",
  quantity: 0,
  unit: null,
  unit_price: 19,
  discount: null,
  gst_rate: null,
  amount: 6400,
  confidence: 0.9891,
  warnings: ["0.0 x 19.0 = 0.0, but the row reads 6400.0."],
};

function storedDocument(rows: ExtractedLineItem[] = [SCANNED_ROW]): StoredDocument {
  return {
    id: 1,
    filename: "sample_invoice.png",
    content_type: "image/png",
    size_bytes: 120_000,
    status: "processed",
    engine: "paddleocr",
    page_count: 1,
    error: null,
    invoice_id: null,
    uploaded_by_id: 1,
    created_at: "2026-09-07T10:00:00Z",
    processed_at: "2026-09-07T10:01:00Z",
    sha256: "a".repeat(64),
    full_text: "INVOICE item15 9401 6400",
    duplicate: false,
    extracted_fields: {
      gstins: ["27AAACR5055K1Z7"],
      invalid_gstins: [],
      invoice_numbers: ["INV-77"],
      dates: ["2026-09-01"],
      amounts: [6400],
      total_amount: 6400,
      hsn_codes: ["9401"],
      gst_rates: [18],
      irn: null,
      place_of_supply: "Maharashtra",
      place_of_supply_code: "27",
      state_codes: ["27"],
      reverse_charge: null,
      currency: "INR",
      line_items: rows,
      key_values: {},
      structured: emptyStructured(),
    },
  };
}

const CLIENTS: Client[] = [
  { id: 7, name: "Acme Ltd", gstin: "27AAACR5055K1Z7" } as unknown as Client,
  { id: 8, name: "Other Buyer", gstin: null } as unknown as Client,
];

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DocumentsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("documents detail panel", () => {
  beforeEach(() => {
    navigate.mockReset();
    documentsList.mockResolvedValue([]);
    clientsList.mockResolvedValue(CLIENTS);
    documentsGet.mockResolvedValue(storedDocument());
  });

  it("shows the extracted item table and its warning", async () => {
    renderPage();

    expect(await screen.findByText(/Item table \(1 row\)/)).toBeInTheDocument();
    expect(screen.getByDisplayValue("item15")).toBeInTheDocument();
    expect(screen.getByDisplayValue("9401")).toBeInTheDocument();
    expect(screen.getByDisplayValue("6400")).toBeInTheDocument();
    expect(screen.getByText(/but the row reads 6400/)).toBeInTheDocument();
  });

  it("lets the user correct a row, and re-checks the arithmetic as they do", async () => {
    renderPage();
    const quantity = await screen.findByLabelText("Quantity, row 1");

    // The scan read qty 0 against an amount of 6400. Correcting both so the
    // row reconciles (1 x 19 = 19) must clear the warning.
    await userEvent.clear(quantity);
    await userEvent.type(quantity, "1");
    await userEvent.clear(screen.getByLabelText("Amount, row 1"));
    await userEvent.type(screen.getByLabelText("Amount, row 1"), "19");
    expect(screen.queryByText(/but the row reads/)).not.toBeInTheDocument();

    // ...and breaking it again must bring the warning back, computed from what
    // is on screen rather than from what the scan originally said.
    await userEvent.clear(quantity);
    await userEvent.type(quantity, "2");
    expect(screen.getByText(/2 x 19 = 38, but the row reads 19/)).toBeInTheDocument();
  });

  it("adds and removes rows by hand", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Add row" }));
    expect(screen.getByText(/Item table \(2 rows\)/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Remove row 2" }));
    expect(screen.getByText(/Item table \(1 row\)/)).toBeInTheDocument();
  });

  it("preselects the customer whose GSTIN is on the scan, and lets it be changed", async () => {
    renderPage();
    const picker = (await screen.findByLabelText(/Customer/)) as HTMLSelectElement;
    expect(picker.value).toBe("7"); // matched on 27AAACR5055K1Z7

    await userEvent.selectOptions(picker, "8");
    await userEvent.click(screen.getByRole("button", { name: "Create invoice from this" }));

    const [path, options] = navigate.mock.calls[0];
    expect(path).toBe("/invoices/new?client=8");
    // The corrected rows travel with it, not the scanned ones.
    expect(options.state.draft.line_items).toHaveLength(1);
    expect(options.state.draft.line_items[0].hsn_code).toBe("9401");
  });

  it("carries a hand-edited row into the invoice draft", async () => {
    renderPage();
    const description = await screen.findByLabelText("Description, row 1");
    await userEvent.clear(description);
    await userEvent.type(description, "Office chair");

    await userEvent.click(screen.getByRole("button", { name: "Create invoice from this" }));
    const [, options] = navigate.mock.calls[0];
    expect(options.state.draft.line_items[0].description).toBe("Office chair");
  });

  it("shows who is who, and the cross-field warnings, from the structured extraction", async () => {
    const doc = storedDocument();
    doc.extracted_fields!.structured = {
      ...emptyStructured(),
      supplier: { ...emptyStructured().supplier, legal_name: "Acme Supplies", gstin: "27AAPFU0939F1ZV", state_code: "27", pincode: "400001" },
      recipient: { ...emptyStructured().recipient, legal_name: "Bharat Traders LLP", gstin: "29AAACR5055K1Z3", state_code: "29" },
      document: { ...emptyStructured().document, document_number: "INV-77", document_date: "2026-09-01", supply_type: "B2B" },
      warnings: ["Taxable value plus tax comes to 1180.0, but the invoice total reads 5000.0."],
      evidence: [
        { field_name: "document_number", value: "INV-77", matched_label: "Invoice No", method: "label", confidence: 0.95, section: "document" },
      ],
    };
    documentsGet.mockResolvedValue(doc);
    renderPage();

    expect(await screen.findByText("Acme Supplies")).toBeInTheDocument();
    expect(screen.getByText("27AAPFU0939F1ZV")).toBeInTheDocument();
    expect(screen.getByText("Bharat Traders LLP")).toBeInTheDocument();
    // A party the extractor read nothing for says so rather than showing dashes.
    expect(screen.getByText("Nothing read for this party.")).toBeInTheDocument();
    // The arithmetic warning is surfaced, not buried.
    expect(screen.getByText(/invoice total reads 5000/)).toBeInTheDocument();

    // Evidence is there on demand, with the label that matched.
    await userEvent.click(screen.getByText(/How each value was found/));
    expect(screen.getByText("Invoice No")).toBeInTheDocument();
  });

  it("offers a hand-entered table when OCR found no rows at all", async () => {
    documentsGet.mockResolvedValue(storedDocument([]));
    renderPage();

    expect(await screen.findByText(/No item table could be read/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add row" }));
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(2); // header + one row
  });
});
