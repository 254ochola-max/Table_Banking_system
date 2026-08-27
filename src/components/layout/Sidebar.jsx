import React from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, Wallet, HandCoins, CreditCard,
  AlertTriangle, FileText, Settings, LogOut, X, Banknote,
  Bell, Info, Mail, UserCircle, MessageSquare,
} from "lucide-react";
import { api } from "@/api/supabaseClient";
import BrandLogo from "@/components/shared/BrandLogo";

const adminNavItems = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  { label: "Members", path: "/members", icon: Users },
  { label: "Contributions", path: "/contributions", icon: Wallet },
  { label: "Loans", path: "/loans", icon: HandCoins },
  { label: "Repayments", path: "/repayments", icon: CreditCard },
  { label: "Fines", path: "/fines", icon: AlertTriangle },
  { label: "Transactions", path: "/transactions", icon: Banknote },
  { label: "Reminders", path: "/reminders", icon: Bell },
  { label: "Reports", path: "/reports", icon: FileText },
  { label: "Messages", path: "/messages", icon: MessageSquare },
  { label: "Settings", path: "/settings", icon: Settings },
];

const leaderNavItems = adminNavItems.filter(i => i.path !== "/settings");

const memberNavItems = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  { label: "My Account", path: "/portal", icon: UserCircle },
];

export default function Sidebar({ open, onClose, role, hasAdminNav, isLeader, memberName, memberPhoto, unreadMessages = 0 }) {
  const location = useLocation();
  const isAdmin = role === "admin";

  const navItems = isAdmin
    ? adminNavItems
    : hasAdminNav
      ? leaderNavItems
      : memberNavItems;

  const panelSubtitle = isAdmin
    ? "Admin Panel"
    : hasAdminNav
      ? "Leaders Panel"
      : (memberName || "Member Portal");

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={`
          fixed top-0 left-0 z-50 h-full w-64 bg-white flex flex-col
          transform transition-transform duration-200 ease-in-out
          lg:translate-x-0 lg:static lg:z-auto
          ${open ? "translate-x-0" : "-translate-x-full"}
          border-r border-gray-200
        `}
      >
        <div className="flex items-center justify-between px-5 py-5 border-b border-gray-200">
          <div className="flex items-center gap-3 min-w-0">
            <BrandLogo size={40} className="flex-shrink-0" />
            <div className="min-w-0">
              <h1
                className="text-sm font-bold tracking-wider uppercase text-gray-900 select-none truncate"
                style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}
              >
                THE DEBORAH'S
              </h1>
              <p
                className="text-gray-500 text-xs mt-0.5 tracking-wide uppercase font-medium truncate max-w-[150px]"
                title={panelSubtitle}
              >
                {panelSubtitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden text-gray-500 hover:text-gray-900 p-2.5 rounded-lg hover:bg-gray-100 min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors"
            aria-label="Close menu"
          >
            <X size={22} />
          </button>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const showBadge = item.path === "/messages" && unreadMessages > 0;

            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={`
                  flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all
                  ${isActive
                    ? "bg-fuchsia-500 text-white shadow-sm"
                    : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                  }
                `}
              >
                {item.label === "My Account" && memberPhoto ? (
                  <div className="w-7 h-7 rounded-full overflow-hidden border-2 border-fuchsia-300 shadow-sm flex-shrink-0">
                    <img src={memberPhoto} alt="My Account" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <item.icon size={18} />
                )}
                <span className="flex-1">{item.label}</span>

                {/* Unread messages badge */}
                {showBadge && (
                  <span
                    className={`flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-black flex items-center justify-center
                      ${isActive ? "bg-white text-fuchsia-700" : "bg-fuchsia-600 text-white"}
                    `}
                  >
                    {unreadMessages > 99 ? "99+" : unreadMessages}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 space-y-1 border-t border-gray-200">
          <Link
            to="/about"
            onClick={onClose}
            className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-all"
          >
            <Info size={18} /> About
          </Link>
          <Link
            to="/contact"
            onClick={onClose}
            className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-all"
          >
            <Mail size={18} /> Contact
          </Link>
          <button
            onClick={() => api.auth.logout("/")}
            className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 w-full transition-all"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}