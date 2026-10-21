import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppShell from './layouts/AppShell';

import Login from './pages/Login';
import RegisterOrganization from './pages/RegisterOrganization';
import Dashboard from './pages/Dashboard';
import Medicines from './pages/Medicines';
import Sales from './pages/Sales';
import Suppliers from './pages/Suppliers';
import Customers from './pages/Customers';
import Patients from './pages/Patients';
import Appointments from './pages/Appointments';
import Doctors from './pages/Doctors';
import Expenses from './pages/Expenses';
import DayClose from './pages/DayClose';
import WhatsAppOrders from './pages/WhatsAppOrders';
import InventoryAutomation from './pages/InventoryAutomation';
import ExpiryDashboard from './pages/ExpiryDashboard';
import BusinessAnalytics from './pages/BusinessAnalytics';
import Alerts from './pages/Alerts';
import StockCount from './pages/StockCount';
import ProfitAnalytics from './pages/ProfitAnalytics';
import CrmAnalytics from './pages/CrmAnalytics';
import StockMovement from './pages/StockMovement';
import PaymentReconciliation from './pages/PaymentReconciliation';
import Backups from './pages/Backups';
import SalesReturns from './pages/SalesReturns';
import HoldBills from './pages/HoldBills';
import Accounting from './pages/Accounting';
import Consultations from './pages/Consultations';
// Phase 11
import GstReturns from './pages/GstReturns';
import SyncCenter from './pages/SyncCenter';
import InvoicePrint from './pages/InvoicePrint';
import BusinessSettings from './pages/BusinessSettings';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<RegisterOrganization />} />

          <Route
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Dashboard />} />
            <Route path="/medicines" element={<Medicines />} />
            <Route path="/sales" element={<Sales />} />
            <Route path="/suppliers" element={<Suppliers />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/patients" element={<Patients />} />
            <Route path="/appointments" element={<Appointments />} />
            <Route path="/doctors" element={<Doctors />} />
            <Route path="/expenses" element={<Expenses />} />
            <Route path="/day-close" element={<DayClose />} />
            <Route path="/whatsapp-orders" element={<WhatsAppOrders />} />
            <Route path="/inventory-automation" element={<InventoryAutomation />} />
            <Route path="/expiry" element={<ExpiryDashboard />} />
            <Route path="/analytics" element={<BusinessAnalytics />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/stock-count" element={<StockCount />} />
            <Route path="/profit-analytics" element={<ProfitAnalytics />} />
            <Route path="/crm-analytics" element={<CrmAnalytics />} />
            <Route path="/stock-movement" element={<StockMovement />} />
            <Route path="/payment-reconciliation" element={<PaymentReconciliation />} />
            <Route path="/backups" element={<Backups />} />
            <Route path="/sales-returns" element={<SalesReturns />} />
            <Route path="/hold-bills" element={<HoldBills />} />
            <Route path="/accounting" element={<Accounting />} />
            <Route path="/consultations" element={<Consultations />} />
            {/* Phase 11 */}
            <Route path="/gst-returns" element={<GstReturns />} />
            <Route path="/sync-center" element={<SyncCenter />} />
            <Route path="/invoices/:saleId" element={<InvoicePrint />} />
            <Route path="/business-settings" element={<BusinessSettings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
