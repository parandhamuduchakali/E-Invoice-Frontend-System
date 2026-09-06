# E-Invoice Frontend

React + TypeScript single-page app for the [E-Invoice Backend](../E-Invoice-Backend-system): clients, GST
invoices with live CGST/SGST vs IGST preview, IRP readiness and INV-01 JSON, IRN recording, and
scanned-invoice intake through the backend's OCR pipeline.

## Stack

| Concern | Choice |
|---|---|
| Build / dev server | Vite 7 |
| UI | React 19, plain CSS (`src/styles.css`) |
| Routing | React Router 7 |
| Server state | TanStack Query 5 |
| API client | `fetch` wrapper (`src/api/client.ts`): JWT bearer, `{error, detail}` → `ApiError` |
| Tests | Vitest + Testing Library; live API integration test (opt-in) |

---

## Connecting to the backend

The backend repo is expected as a sibling folder: `../E-Invoice-Backend-system`.

### Development — Vite proxy (no CORS setup)

```
browser ──► Vite :5173 ──/api──► FastAPI :8000
```

```bash
# terminal 1 — backend
cd ../E-Invoice-Backend-system && uvicorn app.main:app --reload

# terminal 2 — frontend
npm install
npm run dev            # http://localhost:5173
```

`vite.config.ts` proxies `/api` and `/health` to `http://127.0.0.1:8000`, so the app and the API share one
origin in the browser. Override the target with `VITE_PROXY_TARGET=http://127.0.0.1:8001 npm run dev`.

**One command for both:**

```bash
npm run dev:all        # Windows PowerShell → scripts/dev-all.ps1
npm run dev:all:sh     # macOS / Linux / Git Bash → scripts/dev-all.sh
```

The scripts start uvicorn from the sibling backend folder (using `C:\venvs\einvoice` or the backend's
`venv/` when present) and then Vite with the proxy pointed at it. Ports: `-BackendPort` / `-FrontendPort`
(PowerShell) or `BACKEND_PORT` / `FRONTEND_PORT` (bash). If 5173 is taken, pass another port.

### Production — served by the backend

```bash
npm run build          # → dist/
```

Then in the backend's `.env` set `FRONTEND_DIST=../E-Invoice-Frontend-System/dist` and run uvicorn. The
API serves `index.html` at `/` with history fallback, `dist/assets` under `/assets`, and keeps `/api`,
`/docs` and `/health`. One process, one origin, no CORS.

To host `dist/` elsewhere (S3, nginx, Netlify …) instead, build with the API origin baked in and add that
host to the backend's `ALLOWED_ORIGINS`:

```bash
VITE_API_BASE_URL=https://api.example.com npm run build
```

### Contract

`src/api/types.ts` mirrors the backend's Pydantic schemas with identical snake_case names, and
`src/lib/invoiceMath.ts` duplicates the backend's rounding so the live totals match what gets saved.
Change both together when the API changes.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with `/api` proxy |
| `npm run dev:all` / `dev:all:sh` | Backend + frontend together |
| `npm run build` | Type-check + production bundle to `dist/` |
| `npm run preview` | Serve `dist/` locally |
| `npm test` | Unit tests (GST checksum, invoice math, OCR→invoice mapping, API client) |
| `npm run lint` | TypeScript type-check |

**Live integration test** — runs the real `src/api/endpoints.ts` against a running backend (register →
seller profile → client → invoice → readiness → INV-01 payload → IRN → lock; optional OCR upload):

```bash
E2E_BASE_URL=http://127.0.0.1:5173 VITE_API_BASE_URL=http://127.0.0.1:5173 npx vitest run e2e
# add E2E_OCR_FILE=path/to/invoice.pdf to include the OCR upload (~1 min)
```

---

## Roles

The backend assigns every account a role — `admin`, `manager`, `engineer` or `client` — and enforces a permission
matrix (see the backend README). The frontend mirrors that matrix in `src/lib/permissions.ts` purely to show or hide
controls: `can(user, "invoices:delete")` decides whether a Delete button renders, `ProtectedRoute permission="…"`
guards whole routes, and the sidebar only lists pages the role can open.

| Role | What they see in the UI |
|---|---|
| admin | Everything a manager has, plus a **workspace switcher** in the sidebar: pick another owner and every page shows and edits *their* data (the API client sends `X-Workspace-Id`); a banner shows whose workspace is open |
| manager | Everything in their own workspace, plus **Users & roles** (`/users`) to add engineers, client users and managers |
| engineer | Dashboard, invoices, clients, OCR. No delete buttons, no IRN form, no seller-profile fields |
| client | Dashboard and invoices for their own client only; the Clients page shows just their record; no OCR, no create/edit |

Self-registration creates a manager (the very first account becomes admin; the backend can turn self-registration
off with `ALLOW_SELF_REGISTRATION=false`). Engineers and client users are created from **Users & roles**; the manager
sets an initial password and shares it, and can reset it later from the same page. Everyone can change their own
password on **Profile**. Members see their manager's GST seller details (via `GET /users/workspace`) so the live tax
split on the invoice form matches what the backend computes.

## Pages

| Route | What it does | Backend endpoints |
|---|---|---|
| `/login`, `/register`, `/forgot-password`, `/reset-password` | JWT auth; access + refresh tokens in `localStorage`. A 401 triggers one silent `POST /auth/refresh` and retries the call; if that fails the session is cleared | `POST /auth/login`, `POST /auth/register`, `POST /auth/refresh`, `POST /auth/forgot-password`, `POST /auth/reset-password`, `GET /auth/me` |
| `/` Dashboard | Stat cards, then a master-detail view: invoice cards on the left (status filter, **New +**), a printable invoice preview on the right (seller block, client, total / paid / balance due, items, totals) with **Print** and **Open** | `GET /invoices/stats`, `GET /invoices/`, `GET /invoices/:id` |
| `/profile` | Seller profile (`SellerDtls`) with live GSTIN check-digit validation and a "still needed for IRP" list | `PATCH /users/me`, `GET /gst/validate-gstin`, `GET /gst/state-codes` |
| `/clients` | Buyers with GSTIN / state / place of supply; create, edit, delete | `/clients` CRUD |
| `/invoices` | Paginated list, status filter, number search, IRN badge | `GET /invoices/` |
| `/invoices/new`, `/invoices/:id/edit` | Full GST form: document type, supply type, reverse charge, IGST-on-intra, place of supply, preceding document for notes, ship-to / dispatch-from, line items with HSN/SAC, unit, discount and rate; **live totals with the tax split** | `POST /invoices/`, `PATCH /invoices/:id` |
| `/invoices/:id` | Detail, status change (dropdown offers only the backend's `allowed_status_transitions`), link to the scanned source document, delete; **e-invoice panel**: readiness checklist with fix links, INV-01 JSON (copy / download), record IRN + ack + signed QR; locked after IRN | `/einvoice/readiness`, `/einvoice`, `/irn` |
| `/ocr` | Drag-and-drop PDF / image, OpenCV options, recognised lines with confidence, extracted GST fields, **Create invoice from this** (pre-fills the form incl. `document_id` and `source_reference`, pre-selects a client by GSTIN); shows the stored document id and whether the file was a duplicate | `GET /ocr/status`, `POST /ocr/extract` |
| `/documents` | Every stored upload with status (processed / failed), engine, pages and the invoice it produced; open the file, re-run OCR, create an invoice from a processed scan, delete (blocked while linked) | `/documents` CRUD, `POST /documents/:id/retry`, `GET /documents/:id/file` |

---

## Look and feel

The UI follows a teal invoice-management template: a floating icon rail on the left (tooltips on hover, collapses
to a top strip under 900 px), a top bar with the brand, the current page name, the admin workspace switcher and an
avatar menu, and rounded white cards on a light grey ground. `src/components/InvoicePreview.tsx` renders the
"paper" invoice used on the dashboard and the detail page; `@media print` hides everything else, so **Print** on
either page produces a clean invoice printout / PDF. Icons are inline SVGs in `src/components/icons.tsx`
(no icon library); the font is Inter from Google Fonts with a system fallback.

## Structure

```
src/
├── api/
│   ├── client.ts        fetch wrapper: base URL, bearer token, ApiError, auth:expired event
│   ├── endpoints.ts     authApi, usersApi, clientsApi, invoicesApi, gstApi, ocrApi
│   └── types.ts         TS mirrors of the backend schemas
├── auth/AuthContext.tsx JWT session + current user
├── lib/
│   ├── gst.ts           GSTIN mod-36 check digit, pincode/HSN formats, rate & UQC options
│   ├── invoiceMath.ts   live totals preview (mirrors backend rounding)
│   ├── ocrToInvoice.ts  OCR fields → invoice draft
│   └── format.ts        INR money, DD/MM/YYYY dates, IRN shortening
├── components/          Layout, ProtectedRoute, ui primitives, StateCodeSelect, GstinInput
├── pages/               one file per route
└── test/                unit tests + e2e.api.test.ts (opt-in live test)
scripts/dev-all.ps1|sh   start backend + frontend together
```

Validation happens twice on purpose: instantly in the browser (GSTIN check digit, HSN length, due-date
ordering, credit-note prerequisites, line discounts) and authoritatively on the server, whose `422`
bodies the API client flattens into a readable sentence.

## Notes

- **OneDrive**: `node_modules/` inside a synced folder is slow and can develop cloud-placeholder files.
  Clone outside OneDrive for day-to-day development if you can.
- OCR runs on the backend at roughly a minute per page on CPU; the page shows a progress state.
- If port 5173 is busy, run `npx vite --port 5180` (the proxy still targets the backend).
- Opening a stored document uses `fetch` with the auth header and an object URL, because a plain `<a href>` cannot carry the Bearer token.
