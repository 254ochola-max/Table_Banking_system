import React, { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import { Menu } from "lucide-react";
import { api, supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import BrandLogo from "@/components/shared/BrandLogo";

export const LEADER_ROLES = [
  "Chairperson", "Assistant Chairperson", "Secretary",
  "Assistant Secretary", "Organizing Secretary", "Treasurer"
];

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);

  // ── Reuse the auth context rather than making a second Member.list() fetch.
  // AuthContext already resolved the user's role and member info at app start.
  const { user, isLoadingAuth } = useAuth();

  const role = user?.role || "user";
  const memberRole = user?.memberRole || null;
  const memberName = user?.memberName || null;
  const memberPhoto = user?.memberPhoto || null;
  const isAdmin = role === "admin";
  const isLeader = LEADER_ROLES.includes(memberRole);
  const hasAdminNav = isAdmin || isLeader;

  // Fetch unread message count for the sidebar badge (admins/leaders only).
  useEffect(() => {
    if (isLoadingAuth) return;
    if (!isAdmin && !isLeader) return;

    async function fetchUnread() {
      try {
        if (supabase) {
          const { count } = await supabase
            .from("contact_messages")
            .select("id", { count: "exact", head: true })
            .eq("status", "Unread");
          setUnreadMessages(count || 0);
        } else {
          const all = await api.entities.ContactMessage.list("-created_at", 200);
          setUnreadMessages((all || []).filter(m => m.status === "Unread").length);
        }
      } catch {
        // Silently fail — badge simply won't show
      }
    }

    fetchUnread();
    const interval = setInterval(fetchUnread, 60_000);
    return () => clearInterval(interval);
  }, [isLoadingAuth, isAdmin, isLeader]);

  // While auth is still resolving show a minimal inline spinner, not a full-screen block.
  // This means the sidebar is already rendered (no layout flash) and only the
  // <main> content area shows a spinner.
  if (isLoadingAuth) {
    return (
      <div className="flex h-screen overflow-hidden bg-gray-50">
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-fuchsia-200 border-t-fuchsia-500 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        role={role}
        hasAdminNav={hasAdminNav}
        isLeader={isLeader}
        memberName={memberName}
        memberPhoto={memberPhoto}
        unreadMessages={unreadMessages}
      />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="lg:hidden px-4 py-3 flex items-center gap-3 border-b border-gray-200 bg-white">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-gray-700 hover:text-gray-900 p-2.5 rounded-lg hover:bg-gray-100 min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors"
            aria-label="Open menu"
          >
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2">
            <BrandLogo size={32} />
            <h2
              className="text-sm font-bold tracking-wider uppercase text-gray-900 select-none"
              style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}
            >
              THE DEBORAH'S
            </h2>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <Outlet context={{ role, isAdmin, isLeader, memberRole, memberName, hasAdminNav }} />
        </main>
      </div>
    </div>
  );
}