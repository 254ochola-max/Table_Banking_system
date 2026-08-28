import React, { useState, useEffect } from "react";
import { api, supabase } from "@/api/supabaseClient";
import { Trash2, MailOpen, Mail, Search,
  ChevronDown, ChevronUp, Loader2, CheckCircle2, Inbox,
} from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import moment from "moment";

const STATUS_BADGE = {
  Unread: "bg-fuchsia-100 text-fuchsia-800 border border-fuchsia-300 font-bold",
  Read: "bg-gray-100 text-gray-500 border border-gray-200",
};

export default function Messages() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all"); // "all" | "Unread" | "Read"
  const { toast } = useToast();

  /* ─── Load ─────────────────────────────────────────────────────────── */
  const load = async () => {
    setLoading(true);
    try {
      let rows = [];
      if (supabase) {
        const { data, error } = await supabase
          .from("contact_messages")
          .select("*")
          .order("created_at", { ascending: false });
        if (!error) rows = data || [];
      } else {
        rows = await api.entities.ContactMessage.list("-created_at", 200);
      }
      setMessages(rows);
    } catch (e) {
      console.error(e);
      toast({ title: "Failed to load messages", variant: "destructive" });
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  /* ─── Mark as Read ──────────────────────────────────────────────────── */
  const markRead = async (msg) => {
    if (msg.status === "Read") return;
    try {
      if (supabase) {
        await supabase.from("contact_messages").update({ status: "Read" }).eq("id", msg.id);
      } else {
        await api.entities.ContactMessage.update(msg.id, { status: "Read" });
      }
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: "Read" } : m));
    } catch (e) {
      toast({ title: "Could not mark as read", variant: "destructive" });
    }
  };

  /* ─── Mark as Unread ────────────────────────────────────────────────── */
  const markUnread = async (msg) => {
    if (msg.status === "Unread") return;
    try {
      if (supabase) {
        await supabase.from("contact_messages").update({ status: "Unread" }).eq("id", msg.id);
      } else {
        await api.entities.ContactMessage.update(msg.id, { status: "Unread" });
      }
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: "Unread" } : m));
    } catch (e) {
      toast({ title: "Could not update status", variant: "destructive" });
    }
  };

  /* ─── Delete ────────────────────────────────────────────────────────── */
  const deleteMsg = async (msg) => {
    try {
      if (supabase) {
        await supabase.from("contact_messages").delete().eq("id", msg.id);
      } else {
        await api.entities.ContactMessage.delete(msg.id);
      }
      setMessages(prev => prev.filter(m => m.id !== msg.id));
      if (expandedId === msg.id) setExpandedId(null);
      toast({ title: "Message deleted" });
    } catch (e) {
      toast({ title: "Could not delete message", variant: "destructive" });
    }
  };

  /* ─── Expand + auto-mark read ───────────────────────────────────────── */
  const handleExpand = (msg) => {
    if (expandedId === msg.id) {
      setExpandedId(null);
    } else {
      setExpandedId(msg.id);
      if (msg.status === "Unread") markRead(msg);
    }
  };

  /* ─── Derived ───────────────────────────────────────────────────────── */
  const unreadCount = messages.filter(m => m.status === "Unread").length;

  const filtered = messages.filter(m => {
    const matchStatus = filterStatus === "all" || m.status === filterStatus;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      (m.sender_name || "").toLowerCase().includes(q) ||
      (m.sender_email || "").toLowerCase().includes(q) ||
      (m.subject || "").toLowerCase().includes(q) ||
      (m.message || "").toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  /* ─── Bulk mark all read ────────────────────────────────────────────── */
  const markAllRead = async () => {
    const unread = messages.filter(m => m.status === "Unread");
    if (unread.length === 0) return;
    try {
      await Promise.all(unread.map(m => {
        if (supabase) {
          return supabase.from("contact_messages").update({ status: "Read" }).eq("id", m.id);
        }
        return api.entities.ContactMessage.update(m.id, { status: "Read" });
      }));
      setMessages(prev => prev.map(m => ({ ...m, status: "Read" })));
      toast({ title: `${unread.length} message${unread.length !== 1 ? "s" : ""} marked as read` });
    } catch {
      toast({ title: "Failed to mark all read", variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 text-fuchsia-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto min-h-full">
      <PageHeader
        title="Messages"
        subtitle={
          unreadCount > 0
            ? `${unreadCount} unread message${unreadCount !== 1 ? "s" : ""} · ${messages.length} total`
            : `${messages.length} message${messages.length !== 1 ? "s" : ""} total`
        }
        action={
          unreadCount > 0 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={markAllRead}
              className="text-xs text-fuchsia-600 border-fuchsia-200 hover:bg-fuchsia-50"
            >
              <CheckCircle2 size={14} className="mr-1.5" /> Mark All Read
            </Button>
          ) : null
        }
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            id="messages-search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email, subject or message…"
            className="pl-8 h-9 text-xs"
          />
        </div>
        <div className="flex gap-1.5">
          {["all", "Unread", "Read"].map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filterStatus === s
                  ? "bg-fuchsia-600 text-white shadow-sm"
                  : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {s === "all" ? "All" : s}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-xs">
          <div className="w-14 h-14 bg-fuchsia-50 border border-fuchsia-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Inbox size={26} className="text-fuchsia-400" />
          </div>
          <p className="text-gray-900 font-bold text-base">
            {search || filterStatus !== "all" ? "No messages match your filter" : "No messages yet"}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {search || filterStatus !== "all"
              ? "Try adjusting your search or filter."
              : "Messages submitted via the Contact page will appear here."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(msg => {
            const isExpanded = expandedId === msg.id;
            const isUnread = msg.status === "Unread";
            return (
              <div
                key={msg.id}
                className={`bg-white rounded-2xl border transition-all shadow-xs overflow-hidden ${
                  isUnread
                    ? "border-fuchsia-200 ring-1 ring-fuchsia-100"
                    : "border-gray-100"
                }`}
              >
                {/* Row header */}
                <button
                  className="w-full text-left px-4 py-3.5 flex items-start gap-3 hover:bg-gray-50/70 transition-colors"
                  onClick={() => handleExpand(msg)}
                >
                  {/* Icon */}
                  <div className={`mt-0.5 flex-shrink-0 p-1.5 rounded-lg ${isUnread ? "bg-fuchsia-100" : "bg-gray-100"}`}>
                    {isUnread
                      ? <Mail size={14} className="text-fuchsia-600" />
                      : <MailOpen size={14} className="text-gray-400" />}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-bold truncate ${isUnread ? "text-gray-900" : "text-gray-700"}`}>
                        {msg.sender_name || "Anonymous"}
                      </span>
                      {msg.sender_email && (
                        <span className="text-xs text-gray-400 truncate hidden sm:inline">
                          &lt;{msg.sender_email}&gt;
                        </span>
                      )}
                      <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full ${STATUS_BADGE[msg.status] || STATUS_BADGE.Unread}`}>
                        {msg.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className={`text-xs truncate ${isUnread ? "text-gray-700 font-semibold" : "text-gray-500"}`}>
                        {msg.subject || "General Inquiry"}
                      </p>
                      <span className="text-gray-300 text-xs">·</span>
                      <span className="text-[11px] text-gray-400 flex-shrink-0">
                        {moment(msg.created_at).fromNow()}
                      </span>
                    </div>
                    {!isExpanded && (
                      <p className="text-xs text-gray-400 mt-1 truncate">
                        {msg.message}
                      </p>
                    )}
                  </div>

                  {/* Chevron */}
                  <div className="flex-shrink-0 mt-0.5 text-gray-400">
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </button>

                {/* Expanded body */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-100 bg-gray-50/50">
                    {/* Meta */}
                    {msg.sender_email && (
                      <div className="pt-3 pb-2 flex items-center gap-2">
                        <span className="text-xs text-gray-500 font-medium">Reply to:</span>
                        <a
                          href={`mailto:${msg.sender_email}`}
                          className="text-xs text-fuchsia-600 hover:underline font-medium"
                          onClick={e => e.stopPropagation()}
                        >
                          {msg.sender_email}
                        </a>
                      </div>
                    )}

                    {/* Full message */}
                    <div className="bg-white rounded-xl border border-gray-100 p-4 mt-2 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                      {msg.message}
                    </div>

                    <p className="text-[11px] text-gray-400 mt-2">
                      Received: {moment(msg.created_at).format("ddd, D MMM YYYY [at] h:mm A")}
                    </p>

                    {/* Actions */}
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      {msg.sender_email && (
                        <a
                          href={`mailto:${msg.sender_email}?subject=Re: ${encodeURIComponent(msg.subject || "Your message")}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-fuchsia-600 hover:bg-fuchsia-700 text-white transition-colors shadow-xs"
                          onClick={e => e.stopPropagation()}
                        >
                          <Mail size={12} /> Reply via Email
                        </a>
                      )}
                      {msg.status === "Read" ? (
                        <button
                          onClick={e => { e.stopPropagation(); markUnread(msg); }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-fuchsia-200 text-fuchsia-700 hover:bg-fuchsia-50 transition-colors"
                        >
                          <Mail size={12} /> Mark Unread
                        </button>
                      ) : (
                        <button
                          onClick={e => { e.stopPropagation(); markRead(msg); }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors"
                        >
                          <MailOpen size={12} /> Mark Read
                        </button>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); deleteMsg(msg); }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-100 text-red-600 hover:bg-red-50 transition-colors ml-auto"
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
