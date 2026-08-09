import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/AuthContext';
import AdminWaitlistPage from './pages/AdminWaitlistPage';
import DashboardPage from './pages/DashboardPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import LoginPage from './pages/LoginPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import SignupPage from './pages/SignupPage';
import StatusScreen from './pages/StatusScreen';

function LoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white text-slate-500">
      <p>Loading…</p>
    </main>
  );
}

function HomeRoute() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.status === 'pending') return <StatusScreen status="pending" />;
  if (user.status === 'rejected') return <StatusScreen status="rejected" />;
  return <DashboardPage />;
}

function AdminRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  // Client-side gating is UX only -- every admin request is re-checked
  // server-side (403 for a non-admin caller) regardless of this check.
  if (!user || user.status !== 'approved' || user.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route
            path="/admin/waitlist"
            element={
              <AdminRoute>
                <AdminWaitlistPage />
              </AdminRoute>
            }
          />
          <Route path="/" element={<HomeRoute />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
