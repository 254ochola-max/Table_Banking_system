import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { Suspense } from 'react';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import ErrorBoundary from '@/components/ErrorBoundary';
import { lazyWithRetry } from '@/lib/lazyWithRetry';
import PWAInstallPrompt from '@/components/shared/PWAInstallPrompt';

// ── Eager imports (tiny, needed immediately or on the login path) ─────────────
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import AppLayout from '@/components/layout/AppLayout';
import Members from '@/pages/Members';
import MemberDetail from '@/pages/MemberDetail';

// ── Lazy imports with auto-reload retry on chunk load / deployment changes ─────
// This means the initial JS bundle is much smaller, and if a deployment updates
// chunk hashes, the browser automatically reloads cleanly instead of throwing MIME errors.
const Dashboard      = lazyWithRetry(() => import('@/pages/Dashboard'));
const Contributions  = lazyWithRetry(() => import('@/pages/Contributions'));
const Loans          = lazyWithRetry(() => import('@/pages/Loans'));
const Repayments     = lazyWithRetry(() => import('@/pages/Repayments'));
const Fines          = lazyWithRetry(() => import('@/pages/Fines'));
const Transactions   = lazyWithRetry(() => import('@/pages/Transactions'));
const Reports        = lazyWithRetry(() => import('@/pages/Reports'));
const SettingsPage   = lazyWithRetry(() => import('@/pages/SettingsPage'));
const LoanReminders  = lazyWithRetry(() => import('@/pages/LoanReminders'));
const MemberPortal   = lazyWithRetry(() => import('@/pages/MemberPortal'));
const About          = lazyWithRetry(() => import('@/pages/About'));
const Contact        = lazyWithRetry(() => import('@/pages/Contact'));
const Messages       = lazyWithRetry(() => import('@/pages/Messages'));

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
    <ErrorBoundary>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <ScrollToTop />
            <AuthenticatedApp />
            <PWAInstallPrompt />
          </Router>
          <Toaster />
        </QueryClientProvider>
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default App