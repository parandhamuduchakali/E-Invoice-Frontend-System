import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage";
import { ResetPasswordPage } from "@/pages/ResetPasswordPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { ClientsPage } from "@/pages/ClientsPage";
import { ClientFormPage } from "@/pages/ClientFormPage";
import { InvoicesPage } from "@/pages/InvoicesPage";
import { InvoiceFormPage } from "@/pages/InvoiceFormPage";
import { InvoiceDetailPage } from "@/pages/InvoiceDetailPage";
import { SellerProfilePage } from "@/pages/SellerProfilePage";
import { OcrPage } from "@/pages/OcrPage";
import { DocumentsPage } from "@/pages/DocumentsPage";
import { UsersPage } from "@/pages/UsersPage";

export default function App() {
  return (
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
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
