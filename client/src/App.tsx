import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "@/store/auth";
import AppLayout from "@/components/layout/AppLayout";

// Auth
import LoginPage from "@/pages/auth/LoginPage";
import ChangePasswordPage from "@/pages/auth/ChangePasswordPage";

// Protected pages (lazy-loaded placeholders — implemented in later steps)
import DashboardPage from "@/pages/dashboard/DashboardPage";
import InventoryPage from "@/pages/inventory/InventoryPage";
import BOMPage from "@/pages/bom/BOMPage";
import CustomersPage from "@/pages/customers/CustomersPage";
import QuotesPage from "@/pages/quotes/QuotesPage";
import OrdersPage from "@/pages/orders/OrdersPage";
import ProductionPage from "@/pages/production/ProductionPage";
import InvoicesPage from "@/pages/invoices/InvoicesPage";
import PurchasingPage from "@/pages/purchasing/PurchasingPage";
import ReportsPage from "@/pages/reports/ReportsPage";
import SettingsPage from "@/pages/settings/SettingsPage";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuthStore();
  if (!token) return <Navigate to="/login" replace />;
  if (user?.mustChangePassword) return <Navigate to="/change-password" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/change-password" element={<ChangePasswordPage />} />

        <Route
          path="/"
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="inventory/*" element={<InventoryPage />} />
          <Route path="bom/*" element={<BOMPage />} />
          <Route path="customers/*" element={<CustomersPage />} />
          <Route path="quotes/*" element={<QuotesPage />} />
          <Route path="orders/*" element={<OrdersPage />} />
          <Route path="production/*" element={<ProductionPage />} />
          <Route path="invoices/*" element={<InvoicesPage />} />
          <Route path="purchasing/*" element={<PurchasingPage />} />
          <Route path="reports/*" element={<ReportsPage />} />
          <Route path="settings/*" element={<SettingsPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
