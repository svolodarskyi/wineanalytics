import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { RequireAuth } from './components/RequireAuth'
import { AlertsDataQualityPage } from './pages/AlertsDataQualityPage'
import { AlertsInventoryPage } from './pages/AlertsInventoryPage'
import { AlertsPage } from './pages/AlertsPage'
import { AlertsSalesQualityPage } from './pages/AlertsSalesQualityPage'
import { InvoiceReviewPage } from './pages/InvoiceReviewPage'
import { InvoicesPage } from './pages/InvoicesPage'
import { LoginPage } from './pages/LoginPage'
import { SettingsOpenAiPage } from './pages/SettingsOpenAiPage'
import { SettingsPage } from './pages/SettingsPage'
import { SettingsPourSizesPage } from './pages/SettingsPourSizesPage'
import { SettingsVendorsPage } from './pages/SettingsVendorsPage'
import { SettingsWinesPage } from './pages/SettingsWinesPage'
import { WineDataQualityPage } from './pages/WineDataQualityPage'
import { WineDetailPage } from './pages/WineDetailPage'
import { WineInventoryPage } from './pages/WineInventoryPage'
import { WinePurchasesPage } from './pages/WinePurchasesPage'
import { WineSalesPage } from './pages/WineSalesPage'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<WineInventoryPage />} />
        <Route path="wines/:wineId" element={<WineDetailPage />}>
          <Route index element={<Navigate to="purchases" replace />} />
          <Route path="purchases" element={<WinePurchasesPage />} />
          <Route path="sales" element={<WineSalesPage />} />
          <Route path="data-quality" element={<WineDataQualityPage />} />
        </Route>
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="invoices/:invoiceId" element={<InvoiceReviewPage />} />
        <Route path="alerts" element={<AlertsPage />}>
          <Route index element={<Navigate to="inventory" replace />} />
          <Route path="inventory" element={<AlertsInventoryPage />} />
          <Route path="data-quality" element={<AlertsDataQualityPage />} />
          <Route path="sales-quality" element={<AlertsSalesQualityPage />} />
        </Route>
        <Route path="settings" element={<SettingsPage />}>
          <Route index element={<Navigate to="wines" replace />} />
          <Route path="wines" element={<SettingsWinesPage />} />
          <Route path="vendors" element={<SettingsVendorsPage />} />
          <Route path="pour-sizes" element={<SettingsPourSizesPage />} />
          <Route path="ai-requests" element={<SettingsOpenAiPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
