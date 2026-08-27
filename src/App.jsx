import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';

// ── Eager imports (tiny, needed immediately or on the login path) ─────────────
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import AppLayout from '@/components/layout/AppLayout';

// ── Lazy imports (loaded only when the user first navigates to the page) ──────
// This means the initial JS bundle is much smaller and the app starts faster.
const Dashboard      = lazy(() => import('@/pages/Dashboard'));
const Members        = lazy(() => import('@/pages/Members'));
const MemberDetail   = lazy(() => import('@/pages/MemberDetail'));
const Contributions  = lazy(() => import('@/pages/Contributions'));
const Loans          = lazy(() => import('@/pages/Loans'));
const Repayments     = lazy(() => import('@/pages/Repayments'));
const Fines          = lazy(() => import('@/pages/Fines'));
const Transactions   = lazy(() => import('@/pages/Transactions'));
const Reports        = lazy(() => import('@/pages/Reports'));
const SettingsPage   = lazy(() => import('@/pages/SettingsPage'));
const LoanReminders  = lazy(() => import('@/pages/LoanReminders'));
const MemberPortal   = lazy(() => import('@/pages/MemberPortal'));
const About          = lazy(() => import('@/pages/About'));
const Contact        = lazy(() => import('@/pages/Contact'));
const Messages       = lazy(() => import('@/pages/Messages'));

// Minimal inline spinner shown while a lazy page chunk is downloading
function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full min-h-[40vh]">
      <div className="w-8 h-8 border-4 border-fuchsia-200 border-t-fuchsia-500 rounded-full animate-spin" />
    </div>
  );
}

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-fuchsia-200 border-t-fuchsia-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route element={<ProtectedRoute requireRole="admin" allowLeader unauthenticatedElement={<Navigate to="/login" replace />} />}>
          <Route element={<AppLayout />}>
            <Route path="/members" element={<Members />} />
            <Route path="/members/:id" element={<MemberDetail />} />
            <Route path="/contributions" element={<Contributions />} />
            <Route path="/loans" element={<Loans />} />
            <Route path="/repayments" element={<Repayments />} />
            <Route path="/fines" element={<Fines />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/reminders" element={<LoanReminders />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/messages" element={<Messages />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute requireRole="admin" unauthenticatedElement={<Navigate to="/login" replace />} />}>
          <Route element={<AppLayout />}>
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/portal" element={<MemberPortal />} />
          </Route>
        </Route>
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </Suspense>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App