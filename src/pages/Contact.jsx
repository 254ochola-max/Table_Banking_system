import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Send, Loader2, CheckCircle2, MessageSquare } from "lucide-react";
import { api, supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

function makeId() {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function Contact() {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) {
      const detectedName = user.memberName || user.full_name || user.name || "";
      const detectedEmail = user.email || "";
      if (detectedName) setName(detectedName);
      if (detectedEmail) setEmail(detectedEmail);
    }
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;
    setError("");
    setSending(true);

    try {
      const payload = {
        id: makeId(),
        sender_name: name.trim() || "Anonymous",
        sender_email: email.trim() || null,
        subject: subject.trim() || "General Inquiry",
        message: message.trim(),
        status: "Unread",
      };

      // Try saving via Supabase directly first (works even when unauthenticated
      // because the contact_messages RLS allows anon inserts).
      let saved = false;
      if (supabase) {
        const { error: sbError } = await supabase
          .from("contact_messages")
          .insert([payload]);
        if (!sbError) saved = true;
      }

      // Fall back to the generic entity handler (writes to local storage when
      // Supabase is unavailable) so the app still works offline / in dev mode.
      if (!saved) {
        await api.entities.ContactMessage.create(payload);
      }

      setSent(true);
      setSubject("");
      setMessage("");
      if (!user) {
        setName("");
        setEmail("");
      }
    } catch (err) {
      console.error("Contact form error:", err);
      setError("Something went wrong. Please try again or email us directly.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-fuchsia-50 via-white to-amber-50">
      <div className="max-w-2xl mx-auto px-5 py-12 sm:py-20">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-fuchsia-700 mb-10 transition-colors group"
        >
          <ArrowRight size={16} className="rotate-180 group-hover:-translate-x-0.5 transition-transform" />
          Back to Dashboard
        </Link>

        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="p-3.5 rounded-2xl bg-fuchsia-100 border border-fuchsia-200 shadow-sm">
            <MessageSquare size={26} className="text-fuchsia-600" />
          </div>
          <div>
            <h1
              className="text-3xl sm:text-4xl font-black tracking-widest uppercase text-fuchsia-700"
              style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}
            >
              Contact Us
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              We'll get back to you as soon as possible.
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-lg p-6 sm:p-8">
          {sent ? (
            <div className="flex flex-col items-center text-center py-8 gap-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center">
                <CheckCircle2 size={34} className="text-emerald-600" />
              </div>
              <div>
                <p className="text-gray-900 font-bold text-lg">Message Sent!</p>
                <p className="text-gray-500 text-sm mt-1 max-w-xs mx-auto">
                  Your message has been delivered to the leaders' inbox. We'll respond shortly.
                </p>
              </div>
              <button
                onClick={() => setSent(false)}
                className="mt-2 text-sm text-fuchsia-600 hover:underline font-medium"
              >
                Send another message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-gray-700 text-xs font-semibold">Your Name</Label>
                  <Input
                    id="contact-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Doe"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-gray-700 text-xs font-semibold">Your Email</Label>
                  <Input
                    id="contact-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-gray-700 text-xs font-semibold">Subject</Label>
                <Input
                  id="contact-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Contribution query, Loan enquiry…"
                  className="h-9 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-gray-700 text-xs font-semibold">
                  Message <span className="text-fuchsia-500">*</span>
                </Label>
                <Textarea
                  id="contact-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                  rows={5}
                  placeholder="How can we help you?"
                  className="text-sm resize-none"
                />
              </div>

              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                id="contact-submit"
                type="submit"
                disabled={sending || !message.trim()}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold bg-fuchsia-600 hover:bg-fuchsia-700 active:bg-fuchsia-800 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md"
              >
                {sending ? (
                  <><Loader2 size={16} className="animate-spin" /> Sending…</>
                ) : (
                  <><Send size={16} /> Send Message</>
                )}
              </button>
            </form>
          )}
        </div>

        <div className="mt-6 flex gap-4">
          <Link to="/about" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">About Us</Link>
          <Link to="/" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Dashboard</Link>
        </div>
      </div>
    </div>
  );
}