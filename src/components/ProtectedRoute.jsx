import { useEffect } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";

const DefaultFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
  </div>
);

export default function ProtectedRoute({
  fallback = <DefaultFallback />,
  unauthenticatedElement = <Navigate to="/login" replace />,
  requireRole,
  allowLeader = false,
}) {
  const { isAuthenticated, isLoadingAuth, authChecked, authError, checkUserAuth, user } = useAuth();

  useEffect(() => {
    if (!authChecked && !isLoadingAuth) checkUserAuth();
  }, [authChecked, isLoadingAuth, checkUserAuth]);

  if (isLoadingAuth || !authChecked) return fallback;
  if (authError && authError.type !== "configuration") return unauthenticatedElement;
  if (!isAuthenticated) return unauthenticatedElement;

  // Block unverified/pending members from system pages until admin verifies and assigns role
  if (user?.role !== "admin" && user?.memberStatus === "Pending") {
    if (window.location.pathname !== "/portal") {
      return <Navigate to="/portal" replace />;
    }
  }

  if (requireRole) {
    const hasRequiredRole = user?.role === requireRole;
    const hasLeaderAccess = allowLeader && user?.isLeader;
    if (!hasRequiredRole && !hasLeaderAccess) {
      return <Navigate to="/portal" replace />;
    }
  }

  return <Outlet />;
}