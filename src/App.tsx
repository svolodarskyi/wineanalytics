import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { RequireAuth } from './components/RequireAuth'
import { InvoiceReviewPage } from './pages/InvoiceReviewPage'
import { InvoicesPage } from './pages/InvoicesPage'
import { LoginPage } from './pages/LoginPage'
import { SettingsOpenAiPage } from './pages/SettingsOpenAiPage'
import { SettingsPage } from './pages/SettingsPage'
import { SettingsVendorsPage } from './pages/SettingsVendorsPage'
import { SettingsWinesPage } from './pages/SettingsWinesPage'
import { WineDetailPage } from './pages/WineDetailPage'
import { WineInventoryPage } from './pages/WineInventoryPage'

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
        <Route path="wines/:wineId" element={<WineDetailPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="invoices/:invoiceId" element={<InvoiceReviewPage />} />
        <Route path="settings" element={<SettingsPage />}>
          <Route index element={<Navigate to="wines" replace />} />
          <Route path="wines" element={<SettingsWinesPage />} />
          <Route path="vendors" element={<SettingsVendorsPage />} />
          <Route path="ai-requests" element={<SettingsOpenAiPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
