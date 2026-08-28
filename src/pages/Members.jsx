import React, { useState, useEffect, useCallback, useRef } from "react";
import { api, supabase } from "@/api/supabaseClient";
import { useOutletContext } from "react-router-dom";
import { Users, Plus, Search, Edit2, Trash2, Eye, ShieldOff, AlertTriangle, Clock, CheckCircle2, XCircle, Shield, UserCircle, RefreshCw, Database, Upload, Camera } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import EmptyState from "@/components/shared/EmptyState";
import MemberAvatar from "@/components/shared/MemberAvatar";
import { compressImage } from "@/lib/imageUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Link } from "react-router-dom";
import moment from "moment";

const ROLE_ORDER = [
  "Chairperson", "Assistant Chairperson", "Secretary",
  "Assistant Secretary", "Organizing Secretary", "Treasurer", "Member"
];

const emptyMember = {
  full_name: "", phone: "", email: "", user_email: "", id_number: "",
  gender: "Female", address: "", role: "Member", photo_url: "",
  status: "Active", date_joined: new Date().toISOString().split("T")[0],
};

export default function Members() {
  // ── Auth comes from the layout context — no extra api.auth.me() round-trip
  const { isAdmin, isLeader, memberRole } = useOutletContext() || {};
  const canManageMembers = isAdmin || isLeader;
  const currentMemberRole = memberRole;

  const [members, setMembers] = useState([]);
  const [profileRequests, setProfileRequests] = useState([]);
  const [pendingRoles, setPendingRoles] = useState({});
  const [activeTab, setActiveTab] = useState("all"); // "all", "pending", "requests"
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyMember);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();
  const fileInputRef = useRef(null);

  // Initial load — only runs once on mount. Subsequent mutations use
  // optimistic local state updates so the page never re-fetches from Supabase
  // just because an action happened.
  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    const [data, pr] = await Promise.all([
      api.entities.Member.list("-created_at", 200),
      api.entities.ProfileChangeRequest.list("-request_date", 200),
    ]);
    setMembers(data);
    setProfileRequests(pr);
    setLoading(false);
  }, []);

  useEffect(() => { load(true); }, [load]);

  const openNew = () => { setEditing(null); setForm(emptyMember); setShowForm(true); };
  const openEdit = (m) => { setEditing(m); setForm({ ...emptyMember, ...m, photo_url: m.photo_url || "" }); setShowForm(true); };

  const handleModalPhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Please select an image smaller than 10MB.", variant: "destructive" });
      return;
    }
    try {
      toast({ title: "Optimizing photo...", description: "Processing selected image." });
      const compressed = await compressImage(file, 400, 400, 0.85);
      if (compressed) {
        setForm(prev => ({ ...prev, photo_url: compressed }));
        toast({ title: "Photo selected", description: "Click Save/Update to apply changes." });
      }
    } catch (err) {
      toast({ title: "Failed to process photo", description: err.message, variant: "destructive" });
    }
  };

  const handleSave = async () => {
    if (!form.full_name || !form.phone || !form.id_number) {
      toast({ title: "Please fill required fields", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const email = form.email || form.user_email;
      const payload = {
        ...form,
        email: email || null,
        user_email: email || null,
        photo_url: form.photo_url || null,
      };

      if (editing) {
        await api.entities.Member.update(editing.id, payload);
        if (supabase) {
          await supabase.from("members").upsert({
            id: editing.id,
            full_name: payload.full_name,
            phone: payload.phone,
            email: payload.email,
            user_email: payload.user_email,
            id_number: payload.id_number,
            gender: payload.gender || "Female",
            address: payload.address || null,
            photo_url: payload.photo_url || null,
            status: payload.status || "Active",
            role: payload.role || "Member",
            date_joined: payload.date_joined || new Date().toISOString().split("T")[0],
          }, { onConflict: "id" });
        }
        // Optimistic update — no full refetch needed
        setMembers(prev => prev.map(m => m.id === editing.id ? { ...m, ...payload } : m));
        toast({ title: "Member updated" });
      } else {
        const created = await api.entities.Member.create(payload);
        if (supabase) {
          const memId = created.id || (`mem-${Date.now()}`);
          await supabase.from("members").upsert({
            id: memId,
            full_name: payload.full_name,
            phone: payload.phone,
            email: payload.email,
            user_email: payload.user_email,
            id_number: payload.id_number,
            gender: payload.gender || "Female",
            address: payload.address || null,
            photo_url: payload.photo_url || null,
            status: payload.status || "Active",
            role: payload.role || "Member",
            date_joined: payload.date_joined || new Date().toISOString().split("T")[0],
            total_savings: 0,
            total_shares: 0,
          }, { onConflict: "id" });
        }
        // Optimistic add — prepend new member to local list
        setMembers(prev => [{ ...payload, id: created.id }, ...prev]);
        toast({ title: "Member registered!" });
      }
    } catch (e) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
    setSaving(false);
    setShowForm(false);
    // No load() call — local state already updated optimistically above
  };

  const handleSyncDatabase = async () => {
    if (!isAdmin) {
      toast({ title: "Access Denied", description: "Only administrators can synchronize the database.", variant: "destructive" });
      return;
    }
    if (!supabase) {
      toast({ title: "Supabase not connected", variant: "destructive" });
      return;
    }
    setSyncing(true);
    try {
      let count = 0;
      for (const m of members) {
        const memId = m.id || (`mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
        const { error } = await supabase.from("members").upsert({
          id: memId,
          full_name: m.full_name,
          phone: m.phone || "N/A",
          email: m.email || m.user_email || null,
          user_email: m.user_email || m.email || null,
          id_number: m.id_number || "N/A",
          gender: m.gender || "Female",
          address: m.address || null,
          photo_url: m.photo_url || null,
          status: m.status || "Active",
          role: m.role || "Member",
          date_joined: m.date_joined || new Date().toISOString().split("T")[0],
          total_savings: m.total_savings || 0,
          total_shares: m.total_shares || 0,
        }, { onConflict: "id" });
        if (!error) count++;
      }
      toast({
        title: "Database Synced!",
        description: `Successfully synced ${count} member(s) directly into your Supabase database ('public.members').`,
      });
      await load();
    } catch (e) {
      toast({ title: "Sync failed", description: e.message, variant: "destructive" });
    }
    setSyncing(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const id = deleteTarget.id;
    await Promise.all([
      api.entities.Contribution.deleteMany({ member_id: id }),
      api.entities.Loan.deleteMany({ member_id: id }),
      api.entities.Repayment.deleteMany({ member_id: id }),
      api.entities.Fine.deleteMany({ member_id: id }),
      api.entities.Transaction.deleteMany({ member_id: id }),
      api.entities.ProfileChangeRequest.deleteMany({ member_id: id }),
    ]);
    await api.entities.Member.delete(id);
    if (supabase) {
      await supabase.from("members").delete().eq("id", id);
    }
    toast({ title: `${deleteTarget.full_name} permanently deleted.` });
    // Optimistic remove — no full refetch
    setMembers(prev => prev.filter(m => m.id !== id));
    setDeleting(false);
    setDeleteTarget(null);
  };

  const handleApproveMemberRegistration = async (memberId, name) => {
    const selectedRole = pendingRoles[memberId] || "Member";
    await api.entities.Member.update(memberId, {
      status: "Active",
      role: selectedRole,
    });

    if (supabase) {
      await supabase.from("members").update({
        status: "Active",
        role: selectedRole,
      }).eq("id", memberId);
    }

    const targetMember = members.find(m => m.id === memberId);
    const targetEmail = targetMember?.user_email || targetMember?.email;
    if (supabase && targetEmail) {
      try {
        const { data: prof } = await supabase
          .from("profiles")
          .select("id")
          .eq("email", targetEmail)
          .maybeSingle();
        if (prof?.id) {
          const sysRole = ["Chairperson", "Secretary", "Treasurer"].includes(selectedRole) ? "admin" : "user";
          await supabase.from("profiles").update({ role: sysRole, status: "Active" }).eq("id", prof.id);
        }
      } catch (e) {
        console.warn("Could not sync profile role:", e);
      }
    }

    toast({
      title: "Member Verified & Approved!",
      description: `${name} has been verified and assigned the role "${selectedRole}". System access enabled.`,
    });
    // Optimistic update
    setMembers(prev => prev.map(m =>
      m.id === memberId ? { ...m, status: "Active", role: selectedRole } : m
    ));
  };

  const handleRejectMemberRegistration = async (memberId, name) => {
    await api.entities.Member.update(memberId, {
      status: "Rejected",
    });
    if (supabase) {
      await supabase.from("members").update({ status: "Rejected" }).eq("id", memberId);
    }
    toast({
      title: "Registration Declined",
      description: `Registration for ${name} has been rejected.`,
      variant: "destructive",
    });
    // Optimistic update
    setMembers(prev => prev.map(m =>
      m.id === memberId ? { ...m, status: "Rejected" } : m
    ));
  };

  const handleApproveProfileChange = async (req) => {
    if (req.member_id && req.field_key) {
      const updateData = {};
      updateData[req.field_key] = req.new_value;
      if (req.field_key === "email") {
        updateData.user_email = req.new_value;
      }
      await api.entities.Member.update(req.member_id, updateData);
      if (supabase) {
        await supabase.from("members").update(updateData).eq("id", req.member_id);
      }
    }
    await api.entities.ProfileChangeRequest.update(req.id, {
      status: "Approved",
      reviewed_by: currentUser?.email || "Admin",
      reviewed_at: new Date().toISOString(),
    });
    toast({ title: "Profile change approved!", description: `${req.member_name}'s ${req.field_label} updated.` });
    // Optimistic update for both lists
    setProfileRequests(prev => prev.map(r =>
      r.id === req.id ? { ...r, status: "Approved" } : r
    ));
  };

  const handleRejectProfileChange = async (req) => {
    await api.entities.ProfileChangeRequest.update(req.id, {
      status: "Rejected",
      reviewed_by: currentUser?.email || "Admin",
      reviewed_at: new Date().toISOString(),
    });
    toast({ title: "Profile change rejected", description: `Request for ${req.member_name} declined.` });
    // Optimistic update
    setProfileRequests(prev => prev.map(r =>
      r.id === req.id ? { ...r, status: "Rejected" } : r
    ));
  };

  const pendingMembers = members.filter(m => m.status === "Pending");
  const pendingRequests = profileRequests.filter(r => r.status === "Pending");

  const filtered = members
    .filter(m => {
      if (activeTab === "pending") return m.status === "Pending";
      return true;
    })
    .filter(m =>
      m.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      m.phone?.includes(search) ||
      m.id_number?.includes(search) ||
      m.user_email?.toLowerCase().includes(search.toLowerCase()) ||
      m.email?.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const ai = ROLE_ORDER.indexOf(a.role ?? "Member");
      const bi = ROLE_ORDER.indexOf(b.role ?? "Member");
      if (ai !== bi) return ai - bi;
      return (a.full_name || "").localeCompare(b.full_name || "");
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-fuchsia-200 border-t-fuchsia-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto min-h-full">
      <PageHeader
        title="Members"
        subtitle={`${members.length} registered members · ${pendingMembers.length} pending verification`}
        action={
          canManageMembers && (
            <div className="flex items-center gap-2">
              {isAdmin && (
                <Button
                  variant="outline"
                  onClick={handleSyncDatabase}
                  disabled={syncing}
                  className="border-fuchsia-200 text-fuchsia-700 hover:bg-fuchsia-50 text-xs font-semibold"
                >
                  <RefreshCw size={14} className={`mr-1.5 ${syncing ? "animate-spin" : ""}`} />
                  Sync Database
                </Button>
              )}
              <Button onClick={openNew} className="bg-fuchsia-500 hover:bg-fuchsia-600">
                <Plus size={16} className="mr-1" /> Add Member
              </Button>
            </div>
          )
        }
      />

      {/* Tabs Header */}
      <div className="flex items-center gap-2 border-b border-gray-200 mb-6 overflow-x-auto pb-1">
        <button
          onClick={() => setActiveTab("all")}
          className={`flex items-center gap-2 px-4 py-2.5 font-medium text-sm border-b-2 transition-all whitespace-nowrap ${
            activeTab === "all"
              ? "border-fuchsia-600 text-fuchsia-700 bg-fuchsia-50/60 rounded-t-lg font-bold"
              : "border-transparent text-gray-500 hover:text-gray-800"
          }`}
        >
          <Users size={16} />
          <span>All Members</span>
          <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-gray-100 font-semibold text-gray-700">
            {members.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("pending")}
          className={`flex items-center gap-2 px-4 py-2.5 font-medium text-sm border-b-2 transition-all whitespace-nowrap relative ${
            activeTab === "pending"
              ? "border-fuchsia-600 text-fuchsia-900 bg-fuchsia-50/60 rounded-t-lg font-bold"
              : "border-transparent text-gray-500 hover:text-fuchsia-800"
          }`}
        >
          <UserCircle size={16} className={pendingMembers.length > 0 ? "text-fuchsia-600 animate-pulse" : ""} />
          <span>Pending Verifications</span>
          {pendingMembers.length > 0 ? (
            <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-fuchsia-600 text-white font-bold animate-pulse">
              {pendingMembers.length}
            </span>
          ) : (
            <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-gray-100 font-medium text-gray-500">
              0
            </span>
          )}
        </button>

        {canManageMembers && (
          <button
            onClick={() => setActiveTab("requests")}
            className={`flex items-center gap-2 px-4 py-2.5 font-medium text-sm border-b-2 transition-all whitespace-nowrap ${
              activeTab === "requests"
                ? "border-fuchsia-600 text-fuchsia-900 bg-fuchsia-50/60 rounded-t-lg font-bold"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            <Clock size={16} />
            <span>Profile Change Requests</span>
            {pendingRequests.length > 0 && (
              <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-fuchsia-600 text-white font-bold">
                {pendingRequests.length}
              </span>
            )}
          </button>
        )}
      </div>

      {/* TAB 1: Pending Verifications Tab */}
      {activeTab === "pending" && (
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-fuchsia-50 via-purple-50/50 to-fuchsia-50 border border-fuchsia-200/80 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-fuchsia-200/60 pb-3">
              <div>
                <div className="flex items-center gap-2 text-fuchsia-950 font-bold text-base">
                  <UserCircle size={20} className="text-fuchsia-600 animate-pulse" />
                  <span>Pending Verifications & Role Assignment ({pendingMembers.length})</span>
                </div>
                <p className="text-xs text-fuchsia-800 mt-0.5">
                  Assign a role (e.g. Member, Secretary, Treasurer) and verify the registration to grant system access.
                </p>
              </div>
              <span className="text-xs font-bold text-fuchsia-900 bg-fuchsia-200/80 px-3 py-1 rounded-full self-start sm:self-auto border border-fuchsia-300">
                Action Required
              </span>
            </div>

            {pendingMembers.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-xl border border-fuchsia-100 text-gray-500 text-sm">
                <CheckCircle2 size={32} className="mx-auto text-emerald-500 mb-2" />
                <p className="font-bold text-gray-900 text-base">No Pending Verifications</p>
                <p className="text-xs text-gray-500 mt-1">All member registrations have been verified and assigned system roles.</p>
              </div>
            ) : (
              <div className="divide-y divide-fuchsia-100 bg-white rounded-xl border border-fuchsia-100 overflow-hidden text-sm shadow-xs">
                {pendingMembers.map(m => (
                  <div key={m.id} className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-fuchsia-50/40 transition-colors">
                    <div className="flex items-center gap-3.5 flex-1 min-w-0">
                      <MemberAvatar photoUrl={m.photo_url} name={m.full_name} size="lg" ring />
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-gray-900 text-base">{m.full_name}</span>
                          <span className="text-xs bg-fuchsia-100 text-fuchsia-900 px-2.5 py-0.5 rounded-full font-bold border border-fuchsia-300 flex items-center gap-1">
                            <Clock size={12} className="text-fuchsia-600" /> Pending Verification
                          </span>
                        </div>
                        <div className="text-xs text-gray-600 flex flex-wrap items-center gap-3">
                          <span>Login Email: <strong className="text-gray-900 font-semibold">{m.email || m.user_email}</strong></span>
                          <span>·</span>
                          <span>Phone: <strong className="text-gray-900 font-semibold">{m.phone}</strong></span>
                          <span>·</span>
                          <span>National ID: <strong className="text-gray-900 font-semibold">{m.id_number}</strong></span>
                          {m.address && <><span>·</span><span>Location: <strong className="text-gray-900 font-semibold">{m.address}</strong></span></>}
                          <span>·</span>
                          <span>Submitted: <strong className="text-gray-700">{moment(m.date_joined || m.created_at).format("D MMM YYYY")}</strong></span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 flex-wrap self-end lg:self-auto pt-2 lg:pt-0 border-t lg:border-t-0 border-gray-100">
                      <div className="w-48">
                        <label className="text-[11px] font-semibold text-gray-500 block mb-0.5">Assign System Role</label>
                        <Select
                          value={pendingRoles[m.id] || "Member"}
                          onValueChange={val => setPendingRoles(prev => ({ ...prev, [m.id]: val }))}
                        >
                          <SelectTrigger className="h-9 text-xs bg-gray-50 border-gray-300 font-medium">
                            <SelectValue placeholder="Assign Role" />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLE_ORDER.map(r => (
                              <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex items-center gap-2 self-end">
                        <Button
                          size="sm"
                          onClick={() => handleApproveMemberRegistration(m.id, m.full_name)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold h-9 px-3.5 shadow-sm"
                        >
                          <CheckCircle2 size={14} className="mr-1.5" /> Verify & Assign Role
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRejectMemberRegistration(m.id, m.full_name)}
                          className="text-red-600 border-red-200 hover:bg-red-50 text-xs font-semibold h-9 px-3"
                        >
                          <XCircle size={14} className="mr-1" /> Reject
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: Profile Change Requests Tab */}
      {activeTab === "requests" && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2 text-gray-900 font-bold text-base">
                <Clock size={20} className="text-fuchsia-600" />
                <span>Profile Change Requests ({pendingRequests.length})</span>
              </div>
              {pendingRequests.length > 0 && (
                <span className="text-xs font-bold text-fuchsia-900 bg-fuchsia-100 px-3 py-1 rounded-full border border-fuchsia-200">
                  Action Required
                </span>
              )}
            </div>

            {pendingRequests.length === 0 ? (
              <div className="p-12 text-center bg-fuchsia-50/30 rounded-xl border border-fuchsia-100">
                <CheckCircle2 size={36} className="mx-auto text-emerald-500 mb-3" />
                <h3 className="text-base font-bold text-gray-900">No Profile Change Requests</h3>
                <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                  There are currently no pending profile change requests submitted by group members.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 bg-white rounded-xl border border-gray-100 overflow-hidden text-sm">
                {pendingRequests.map(req => {
                  const reqMember = members.find(x => x.id === req.member_id);
                  return (
                    <div key={req.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-fuchsia-50/30 transition-colors">
                      <div className="flex items-center gap-3 space-y-1">
                        <MemberAvatar photoUrl={reqMember?.photo_url} name={req.member_name} size="md" />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-900 text-base">{req.member_name}</span>
                            <span className="text-xs bg-fuchsia-100 text-fuchsia-800 px-2.5 py-0.5 rounded-md font-bold">{req.field_label || req.field_key}</span>
                          </div>
                          <div className="text-xs text-gray-600 flex flex-wrap items-center gap-2 mt-0.5">
                            <span>Old Value: <span className="font-mono text-gray-500 line-through">{req.old_value || "(empty)"}</span></span>
                            <span>➔</span>
                            <span>New Value: <span className="font-mono font-bold text-emerald-700">{req.new_value}</span></span>
                            <span className="text-gray-400">· Requested {moment(req.request_date).format("D MMM YYYY, h:mm A")}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end md:self-auto">
                        <Button size="sm" onClick={() => handleApproveProfileChange(req)} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold h-9 px-3.5 shadow-xs">
                          <CheckCircle2 size={14} className="mr-1.5" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleRejectProfileChange(req)} className="text-red-600 border-red-200 hover:bg-red-50 text-xs font-semibold h-9 px-3">
                          <XCircle size={14} className="mr-1" /> Reject
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: All Members Tab */}
      {activeTab === "all" && (
        <>
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input placeholder="Search by name, phone, ID, or location..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Filter Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Inactive">Inactive</SelectItem>
                <SelectItem value="Exited">Exited</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterRole} onValueChange={setFilterRole}>
              <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Filter Role" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                {ROLE_ORDER.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {!canManageMembers && (
            <div className="mb-4 flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-lg px-4 py-2.5 text-sm text-amber-700">
              <ShieldOff size={15} className="flex-shrink-0" />
              You have view-only access. Only leaders and admins can add, edit, or delete members.
            </div>
          )}

          {filtered.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No members found"
              description="Register your first member to get started"
              action={canManageMembers && <Button onClick={openNew} className="bg-fuchsia-500 hover:bg-fuchsia-600">Add Member</Button>}
            />
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Name</th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Phone</th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">ID Number</th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">Role</th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(m => {
                      const cacheMemberPhoto = () => {
                        if (m.photo_url) {
                          try {
                            localStorage.setItem(`deborahs_photo_${m.id}`, m.photo_url);
                            if (m.user_email) localStorage.setItem(`deborahs_photo_${m.user_email.toLowerCase()}`, m.photo_url);
                            if (m.email) localStorage.setItem(`deborahs_photo_${m.email.toLowerCase()}`, m.photo_url);
                            if (m.full_name) localStorage.setItem(`deborahs_photo_${m.full_name.toLowerCase().trim().replace(/\s+/g, '_')}`, m.photo_url);
                          } catch {}
                        }
                      };
                      return (
                        <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="py-3 px-4 font-medium text-gray-800">
                            <a href={`/members/${m.id}`} onClick={cacheMemberPhoto} className="inline-flex items-center gap-2.5 hover:text-fuchsia-700 group transition-colors">
                              <MemberAvatar photoUrl={m.photo_url} name={m.full_name} size="sm" ring />
                              <span className="group-hover:underline">{m.full_name}</span>
                            </a>
                          </td>
                          <td className="py-3 px-4 text-gray-600 hidden sm:table-cell">{m.phone}</td>
                          <td className="py-3 px-4 text-gray-600 hidden md:table-cell">{m.id_number}</td>
                          <td className="py-3 px-4 text-gray-600 hidden lg:table-cell">{m.role}</td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                              m.status === "Active" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                              m.status === "Pending" ? "bg-fuchsia-100 text-fuchsia-900 border border-fuchsia-300" :
                              m.status === "Inactive" ? "bg-gray-100 text-gray-600 border border-gray-200" :
                              "bg-red-50 text-red-700 border border-red-200"
                            }`}>
                              {m.status === "Pending" && <Clock size={11} className="text-fuchsia-600 animate-pulse" />}
                              {m.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {canManageMembers && m.status === "Pending" && (
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setActiveTab("pending");
                                    setPendingRoles(prev => ({ ...prev, [m.id]: m.role || "Member" }));
                                  }}
                                  className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white text-xs font-semibold h-7 px-2"
                                >
                                  <UserCircle size={13} className="mr-1" /> Assign Role
                                </Button>
                              )}
                              <a href={`/members/${m.id}`} onClick={cacheMemberPhoto} title="View Details">
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-600 hover:text-fuchsia-600"><Eye size={14} /></Button>
                              </a>
                              {canManageMembers && (
                                <>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-600 hover:text-fuchsia-600" onClick={() => openEdit(m)}><Edit2 size={14} /></Button>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-700" onClick={() => setDeleteTarget(m)}><Trash2 size={14} /></Button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Member" : "Add New Member"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            {/* Profile Photo Uploader */}
            <div className="flex items-center gap-4 p-3 bg-fuchsia-50/60 rounded-xl border border-fuchsia-100">
              <MemberAvatar photoUrl={form.photo_url} name={form.full_name} size="lg" ring />
              <div className="flex-1">
                <label className="text-xs font-semibold text-gray-700 block mb-1">Profile Photo</label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-8 text-xs border-fuchsia-200 text-fuchsia-700 hover:bg-fuchsia-50"
                  >
                    <Upload size={13} className="mr-1" /> {form.photo_url ? "Change Photo" : "Upload Photo"}
                  </Button>
                  {form.photo_url && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setForm(f => ({ ...f, photo_url: "" }))}
                      className="h-8 text-xs text-red-500 hover:bg-red-50"
                    >
                      Remove
                    </Button>
                  )}
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handleModalPhotoUpload}
                  className="hidden"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600">Full Name *</label>
              <Input value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} placeholder="e.g. Jane Doe" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Phone Number *</label>
                <Input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="e.g. 0712345678" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">ID Number *</label>
                <Input value={form.id_number} onChange={e => setForm({...form, id_number: e.target.value})} placeholder="e.g. 12345678" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Login Email (Linked to Account)</label>
              <Input value={form.user_email || ""} onChange={e => setForm({...form, user_email: e.target.value, email: e.target.value})} placeholder="member@email.com" />
              <p className="text-[11px] text-gray-400 mt-0.5">This email allows the member to view their dashboard upon login.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Gender</label>
                <Select value={form.gender} onValueChange={v => setForm({...form, gender: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Group Role</label>
                <Select value={form.role} onValueChange={v => setForm({...form, role: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLE_ORDER.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Address / Location</label>
              <Input value={form.address || ""} onChange={e => setForm({...form, address: e.target.value})} placeholder="Town / Area" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Status</label>
                <Select value={form.status} onValueChange={v => setForm({...form, status: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Dormant">Dormant</SelectItem>
                    <SelectItem value="Exited">Exited</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Date Joined</label>
                <Input type="date" value={form.date_joined} onChange={e => setForm({...form, date_joined: e.target.value})} />
              </div>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-fuchsia-500 hover:bg-fuchsia-600">
              {saving ? "Saving..." : editing ? "Update Member" : "Register Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle size={18} /> Permanently Delete Member
            </DialogTitle>
            <DialogDescription className="pt-2">
              You are about to permanently delete <strong>{deleteTarget?.full_name}</strong> and all their associated records, including:
              <ul className="list-disc list-inside mt-2 text-sm space-y-0.5 text-gray-600">
                <li>All contribution history</li>
                <li>All loan applications & repayment history</li>
                <li>All fine records & transactions</li>
                <li>All profile change requests</li>
              </ul>
              <p className="mt-3 text-red-600 font-semibold text-xs bg-red-50 p-2.5 rounded-lg border border-red-200">
                ⚠️ This action cannot be undone.
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button onClick={handleDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700 text-white font-semibold">
              {deleting ? "Deleting..." : "Permanently Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}