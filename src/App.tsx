import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Spinner } from "@/components/ui";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage";
import { DashboardPage } from "@/pages/DashboardPage";

// The auth screens and the dashboard are what a cold visit lands on, so they
// stay in the entry bundle. Everything else is split out: the invoice form and
// the OCR review page are the two heaviest screens and most sessions never
// open them, so shipping them up front only slows down first paint.
const ClientsPage = lazy(() => import("@/pages/ClientsPage").then((m) => ({ default: m.ClientsPage })));
const ClientFormPage = lazy(() => import("@/pages/ClientFormPage").then((m) => ({ default: m.ClientFormPage })));
const InvoicesPage = lazy(() => import("@/pages/InvoicesPage").then((m) => ({ default: m.InvoicesPage })));
const InvoiceFormPage = lazy(() => import("@/pages/InvoiceFormPage").then((m) => ({ default: m.InvoiceFormPage })));
const InvoiceDetailPage = lazy(() => import("@/pages/InvoiceDetailPage").then((m) => ({ default: m.InvoiceDetailPage })));
const SellerProfilePage = lazy(() => import("@/pages/SellerProfilePage").then((m) => ({ default: m.SellerProfilePage })));
const OcrPage = lazy(() => import("@/pages/OcrPage").then((m) => ({ default: m.OcrPage })));
const DocumentsPage = lazy(() => import("@/pages/DocumentsPage").then((m) => ({ default: m.DocumentsPage })));
const UsersPage = lazy(() => import("@/pages/UsersPage").then((m) => ({ default: m.UsersPage })));
const AuditLogPage = lazy(() => import("@/pages/AuditLogPage").then((m) => ({ default: m.AuditLogPage })));

export default function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<div className="centered"><Spinner label="Loading…" /></div>}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route index element={<DashboardPage />} />
              <Route path="clients" element={<ClientsPage />} />
              <Route path="invoices" element={<InvoicesPage />} />
              <Route path="invoices/:id" element={<InvoiceDetailPage />} />
              <Route path="profile" element={<SellerProfilePage />} />

              <Route element={<ProtectedRoute permission="clients:write" />}>
                <Route path="clients/new" element={<ClientFormPage />} />
                <Route path="clients/:id/edit" element={<ClientFormPage />} />
              </Route>
              <Route element={<ProtectedRoute permission="invoices:write" />}>
                <Route path="invoices/new" element={<InvoiceFormPage />} />
                <Route path="invoices/:id/edit" element={<InvoiceFormPage />} />
              </Route>
              <Route element={<ProtectedRoute permission="ocr:run" />}>
                <Route path="ocr" element={<OcrPage />} />
                <Route path="documents" element={<DocumentsPage />} />
              </Route>
              <Route element={<ProtectedRoute permission="users:manage" />}>
                <Route path="users" element={<UsersPage />} />
              </Route>
              <Route element={<ProtectedRoute permission="audit:read" />}>
                <Route path="audit" element={<AuditLogPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
