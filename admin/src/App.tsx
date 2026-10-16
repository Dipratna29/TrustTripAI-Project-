import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { AdminLayout } from './components/layout/AdminLayout';

// Pages
import { LoginPage } from './pages/auth/LoginPage';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { UsersPage } from './pages/users/UsersPage';
import { UserDetailPage } from './pages/users/UserDetailPage';
import { InventoryPage } from './pages/inventory/InventoryPage';
import { LowStockPage } from './pages/inventory/LowStockPage';
import { InventoryHistoryPage } from './pages/inventory/InventoryHistoryPage';
import { ComplaintsPage } from './pages/complaints/ComplaintsPage';
import { SOSPage } from './pages/sos/SOSPage';
import { NotificationsPage } from './pages/notifications/NotificationsPage';
import { GuidesPage } from './pages/guides/GuidesPage';
import { FacilitiesPage } from './pages/facilities/FacilitiesPage';
import { OffersPage } from './pages/offers/OffersPage';
import { PricingPage } from './pages/pricing/PricingPage';
import { PaymentsPage } from './pages/payments/PaymentsPage';
import { AdminsPage } from './pages/admins/AdminsPage';
import { AuditLogsPage } from './pages/audit/AuditLogsPage';
import { SettingsPage } from './pages/settings/SettingsPage';
import { NotificationCenterPage } from './pages/alerts/NotificationCenterPage';
import { OrdersPage, OrderDetailPage } from './pages/orders/OrdersPage';
import { AdminRole } from './types';

// Route Guards
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-400 font-medium">Authenticating Admin Session...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

const RoleRoute: React.FC<{ roles: AdminRole[]; children: React.ReactNode }> = ({ roles, children }) => {
  const { user } = useAuth();
  if (!user || (!roles.includes(user.role) && user.role !== 'SUPER_ADMIN')) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public Login Route */}
            <Route path="/login" element={<LoginPage />} />

            {/* Protected Admin Routes */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="dashboard" element={<DashboardPage />} />
              
              {/* Users */}
              <Route path="users" element={<UsersPage />} />
              <Route path="users/:id" element={<UserDetailPage />} />

              {/* Inventory */}
              <Route path="inventory" element={<InventoryPage />} />
              <Route path="inventory/low-stock" element={<LowStockPage />} />
              <Route path="inventory/history" element={<InventoryHistoryPage />} />

              {/* Complaints & Emergencies */}
              <Route path="complaints" element={<ComplaintsPage />} />
              <Route path="sos" element={<SOSPage />} />

              {/* Operations */}
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="guides" element={<GuidesPage />} />
              <Route path="facilities" element={<FacilitiesPage />} />
              <Route path="offers" element={<OffersPage />} />
              <Route path="pricing" element={<PricingPage />} />
              <Route path="payments" element={<PaymentsPage />} />
              <Route path="orders" element={<OrdersPage />} />
              <Route path="orders/:id" element={<OrderDetailPage />} />
              <Route path="notification-center" element={<NotificationCenterPage />} />

              {/* Administration & Security */}
              <Route
                path="admins"
                element={
                  <RoleRoute roles={['SUPER_ADMIN']}>
                    <AdminsPage />
                  </RoleRoute>
                }
              />
              <Route path="audit-logs" element={<AuditLogsPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
