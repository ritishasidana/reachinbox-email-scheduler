import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ErrorState, LoadingState } from './ui';

export function ProtectedRoute() {
  const { user, loading, error, refresh } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingState label="Checking your session…" />;
  if (error) return <ErrorState message={error} onRetry={() => void refresh()} />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
