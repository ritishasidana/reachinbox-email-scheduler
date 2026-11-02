import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { EmptyState } from './components/ui';
import { DashboardLayout } from './layouts/DashboardLayout';
import { ComposePage } from './pages/ComposePage';
import { EmailDetailPage } from './pages/EmailDetailPage';
import { EmailListPage } from './pages/EmailListPage';
import { LoginPage } from './pages/LoginPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          <Route path="/scheduled" element={<EmailListPage view="scheduled" />} />
          <Route path="/sent" element={<EmailListPage view="sent" />} />
        </Route>
        {/* Full-width screens (no sidebar), as in the Figma design */}
        <Route path="/compose" element={<ComposePage />} />
        <Route path="/emails/:id" element={<EmailDetailPage />} />
      </Route>
      <Route path="/" element={<Navigate to="/scheduled" replace />} />
      <Route
        path="*"
        element={
          <EmptyState
            title="Page not found"
            action={
              <Link to="/scheduled" className="btn-outline">
                Go to dashboard
              </Link>
            }
          />
        }
      />
    </Routes>
  );
}
