import React, { createContext, useContext, useEffect, useState } from "react";
import { api, isSupabaseConfigured, supabase } from "@/api/supabaseClient";
import { LEADER_ROLES } from "@/components/layout/AppLayout";

async function withLeaderInfo(profile) {
  if (!profile?.email) return { ...profile, isLeader: false };
  try {
    const members = await api.entities.Member.list();
    const linked = members.find(
      m => m.user_email?.toLowerCase() === profile.email?.toLowerCase() ||
           m.email?.toLowerCase() === profile.email?.toLowerCase()
    );
    if (linked) {
      return {
        ...profile,
        memberRole: linked.role,
        memberName: linked.full_name,
        memberStatus: linked.status,
        memberId: linked.id,
        memberPhoto: linked.photo_url || null,
        isLeader: LEADER_ROLES.includes(linked.role),
      };
    }
  } catch (e) {
    console.error("Failed to load leader info:", e);
  }
  return { ...profile, isLeader: false };
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const checkUserAuth = async () => {
    setIsLoadingAuth(true);
    setAuthError(null);

    if (!isSupabaseConfigured || !supabase) {
      setIsAuthenticated(false);
      setUser(null);
      setAuthError({
        type: "configuration",
        message:
          "Supabase is not configured. Replace SUPABASE_ANON_KEY in src/api/supabaseClient.js.",
      });
      setIsLoadingAuth(false);
      setAuthChecked(true);
      return;
    }

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setUser(null);
        setIsAuthenticated(false);
      } else {
        const profile = await api.auth.me();
                setUser(await withLeaderInfo(profile));
        setIsAuthenticated(true);
      }
    } catch (error) {
      console.error("Authentication check failed:", error);
      setUser(null);
      setIsAuthenticated(false);
      setAuthError({
        type: "auth",
        message: error.message || "Unable to check authentication.",
      });
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  };

  useEffect(() => {
    checkUserAuth();

    if (!supabase) return undefined;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) {
        setUser(null);
        setIsAuthenticated(false);
        return;
      }

      try {
        const profile = await api.auth.me();
                setUser(await withLeaderInfo(profile));
        setIsAuthenticated(true);
        setAuthError(null);
      } catch (error) {
        console.error("Unable to load user profile:", error);
        setUser(null);
        setIsAuthenticated(false);
      }
    });

    const handleMemberUpdate = async (e) => {
      try {
        const updatedMember = e?.detail;
        setUser((prev) => {
          if (!prev) return prev;
          const match =
            (updatedMember?.user_email && updatedMember.user_email.toLowerCase() === prev.email?.toLowerCase()) ||
            (updatedMember?.email && updatedMember.email.toLowerCase() === prev.email?.toLowerCase()) ||
            (updatedMember?.id && updatedMember.id === prev.memberId);
          if (match && updatedMember) {
            return {
              ...prev,
              memberPhoto: updatedMember.photo_url || prev.memberPhoto,
              memberName: updatedMember.full_name || prev.memberName,
              memberRole: updatedMember.role || prev.memberRole,
              memberStatus: updatedMember.status || prev.memberStatus,
              isLeader: LEADER_ROLES.includes(updatedMember.role || prev.memberRole),
            };
          }
          return prev;
        });
      } catch (err) {
        console.error("Failed to update user context with member photo:", err);
      }
    };

    window.addEventListener("deborahs-member-updated", handleMemberUpdate);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("deborahs-member-updated", handleMemberUpdate);
    };
  }, []);

  const logout = async (shouldRedirect = true) => {
    try {
      await api.auth.logout();
    } finally {
      setUser(null);
      setIsAuthenticated(false);
      if (shouldRedirect) window.location.href = "/login";
    }
  };

  const navigateToLogin = () => {
    window.location.href = "/login";
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoadingAuth,
        isLoadingPublicSettings,
        authError,
        appPublicSettings: { id: "deborahs-app", public_settings: {} },
        authChecked,
        logout,
        navigateToLogin,
        checkUserAuth,
        checkAppState: checkUserAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
