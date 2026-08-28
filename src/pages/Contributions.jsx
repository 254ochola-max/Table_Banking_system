import React, { useState, useEffect } from "react";
import { api } from "@/api/supabaseClient";
import { Wallet, Plus, CheckCircle, XCircle, Trash2, AlertTriangle } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import EmptyState from "@/components/shared/EmptyState";
import MemberAvatar from "@/components/shared/MemberAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { addContributionToSummary, subtractContributionFromSummary } from "@/lib/syncSummary";
import moment from "moment";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const StatusBadge = ({ status }) => {
  const cfg = {
    "Verified": "bg-emerald-50 text-emerald-700",
    "Rejected": "bg-red-50 text-red-700",
    "Pending Verification": "bg-amber-50 text-amber-700",
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cfg[status] || cfg["Pending Verification"]}`}>
      {status || "Pending Verification"}
    </span>
  );
};

export default function Contributions() {
  const [contributions, setContributions] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterMonth, setFilterMonth] = useState("all");
  const [filterYear, setFilterYear] = useState("all");
  const [form, setForm] = useState({
    member_id: "", amount: "", payment_method: "Cash",
    month: MONTHS[new Date().getMonth()], year: new Date().getFullYear(),
    date_paid: new Date().toISOString().split("T")[0], notes: "",
  });
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const [c, m] = await Promise.all([
      api.entities.Contribution.list("-date_paid", 200),
      api.entities.Member.filter({ status: "Active" }),
    ]);
    setContributions(c);
    setMembers(m);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!form.member_id || !form.amount) {
      toast({ title: "Please fill required fields", variant: "destructive" });
      return;
    }
    const member = members.find(m => m.id === form.member_id);
    setSaving(true);
    const created = await api.entities.Contribution.create({
      ...form,
      member_name: member?.full_name || "",
      amount: parseFloat(form.amount),
      year: parseInt(form.year),
      status: "Pending Verification",
    });
    if (member) {
      await api.entities.Member.update(member.id, {
        total_savings: (member.total_savings || 0) + parseFloat(form.amount),
      });
    }
    await addContributionToSummary(form.member_id, parseFloat(form.amount));
    toast({ title: "Contribution recorded" });
    setSaving(false);
    setShowForm(false);
    setForm({ member_id: "", amount: "", payment_method: "Cash", month: MONTHS[new Date().getMonth()], year: new Date().getFullYear(), date_paid: new Date().toISOString().split("T")[0], notes: "" });
    load();
  };

  const handleVerify = async (c, newStatus) => {
    setVerifying(c.id + newStatus);
    await api.entities.Contribution.update(c.id, { status: newStatus });

    if (newStatus === "Verified") {
      await api.entities.Transaction.create({
        member_id: c.member_id,
        member_name: c.member_name,
        type: "Contribution",
        amount: c.amount,
        description: `${c.month} ${c.year} contribution (verified)`,
        date: c.date_paid,
      });
      const member = members.find(m => m.id === c.member_id);
      if (member) {
        await api.entities.Member.update(member.id, {
          total_savings: (member.total_savings || 0) + (c.amount || 0),
        });
      }
      await addContributionToSummary(c.member_id, c.amount || 0);
    }

    toast({ title: newStatus === "Verified" ? "Contribution verified ✓" : "Contribution rejected" });
    setVerifying(null);
    load();
  };

  const handleDelete = async (c) => {
    setDeleting(true);
    await api.entities.Contribution.delete(c.id);
    if (c.status === "Verified") {
      const member = members.find(m => m.id === c.member_id);
      if (member) {
        await api.entities.Member.update(member.id, {
          total_savings: Math.max(0, (member.total_savings || 0) - (c.amount || 0)),
        });
      }
      await subtractContributionFromSummary(c.member_id, c.amount || 0);
    }
    toast({ title: "Contribution deleted" });
    setDeleting(false);
    setDeleteTarget(null);
    load();
  };

  const availableYears = [...new Set(contributions.map(c => c.year).filter(Boolean))].sort((a,b) => b - a);
  const filtered = contributions.filter(c => {
    const matchStatus = filterStatus === "all" || (c.status || "Pending Verification") === filterStatus;
    const matchMonth = filterMonth === "all" || c.month === filterMonth;
    const matchYear = filterYear === "all" || String(c.year) === filterYear;
    return matchStatus && matchMonth && matchYear;
  });
  const pendingCount = contributions.filter(c => !c.status || c.status === "Pending Verification").length;
  const totalAmount = contributions.filter(c => c.status === "Verified").reduce((s, c) => s + (c.amount || 0), 0);

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
        title="Contributions"
        subtitle={`KES ${totalAmount.toLocaleString()} verified${pendingCount > 0 ? ` · ${pendingCount} pending` : ""}`}
        action={<Button onClick={() => setShowForm(true)} className="bg-fuchsia-500 hover:bg-fuchsia-600"><Plus size={16} className="mr-1" /> Record Contribution</Button>}
      />

      <div className="flex flex-wrap gap-3 mb-3">
        <Select value={filterMonth} onValueChange={setFilterMonth}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Month" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Months</SelectItem>
            {MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterYear} onValueChange={setFilterYear}>
          <SelectTrigger className="w-28"><SelectValue placeholder="Year" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Years</SelectItem>
            {availableYears.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2 mb-4">
        {[["all","All"],["Pending Verification","Pending"],["Verified","Verified"],["Rejected","Rejected"]].map(([val, label]) => (
          <button
            key={val}
            onClick={() => setFilterStatus(val)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterStatus === val ? "bg-fuchsia-500 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}
          >
            {label}
            {val === "Pending Verification" && pendingCount > 0 && (
              <span className="ml-1.5 bg-amber-500 text-white rounded-full px-1.5 py-0.5 text-xs">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No contributions"
          description={filterStatus === "all" ? "Record your first contribution to start tracking savings" : `No ${filterStatus.toLowerCase()} contributions`}
          action={filterStatus === "all" && <Button onClick={() => setShowForm(true)} className="bg-fuchsia-500 hover:bg-fuchsia-600">Record Contribution</Button>}
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Member</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Period</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Method / Ref</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-3 px-4 text-gray-600">{moment(c.date_paid).format("MMM D, YYYY")}</td>
                    <td className="py-3 px-4 font-medium text-gray-800">
                      <div className="flex items-center gap-2">
                        <MemberAvatar photoUrl={members.find(m => m.id === c.member_id)?.photo_url} name={c.member_name} size="xs" />
                        <span>{c.member_name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-600 hidden sm:table-cell">{c.month} {c.year}</td>
                    <td className="py-3 px-4 text-gray-600 hidden md:table-cell">
                      <span>{c.payment_method}</span>
                      {c.transaction_ref && <span className="block text-xs text-gray-400">Ref: {c.transaction_ref}</span>}
                      {c.bank_name && <span className="block text-xs text-gray-400">{c.bank_name}{c.bank_account ? ` · ${c.bank_account}` : ""}</span>}
                      {c.evidence_notes && <span className="block text-xs text-gray-400 italic">{c.evidence_notes}</span>}
                    </td>
                    <td className="py-3 px-4"><StatusBadge status={c.status} /></td>
                    <td className="py-3 px-4 text-right font-semibold text-emerald-600">KES {(c.amount || 0).toLocaleString()}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex justify-end items-center gap-1">
                        {(c.status === "Pending Verification" || !c.status) && (
                          <>
                            <button
                              onClick={() => handleVerify(c, "Verified")}
                              disabled={!!verifying}
                              className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 disabled:opacity-40"
                              title="Verify"
                            >
                              <CheckCircle size={16} />
                            </button>
                            <button
                              onClick={() => handleVerify(c, "Rejected")}
                              disabled={!!verifying}
                              className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-40"
                              title="Reject"
                            >
                              <XCircle size={16} />
                            </button>
                          </>
                        )}
                        {c.status === "Verified" && <CheckCircle size={16} className="text-emerald-500" />}
                        {c.status === "Rejected" && <XCircle size={16} className="text-red-400" />}
                        <button
                          onClick={() => setDeleteTarget(c)}
                          disabled={!!deleting}
                          className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Contribution</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-xs font-medium text-gray-600">Member *</label>
              <Select value={form.member_id} onValueChange={v => setForm({...form, member_id: v})}>
                <SelectTrigger><SelectValue placeholder="Select member" /></SelectTrigger>
                <SelectContent>
                  {members.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Amount (KES) *</label>
              <Input type="number" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} placeholder="e.g. 1000" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Month</label>
                <Select value={form.month} onValueChange={v => setForm({...form, month: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Year</label>
                <Input type="number" value={form.year} onChange={e => setForm({...form, year: e.target.value})} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Payment Method</label>
              <Select value={form.payment_method} onValueChange={v => setForm({...form, payment_method: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="M-Pesa">M-Pesa</SelectItem>
                  <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                  <SelectItem value="Cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Date Paid</label>
              <Input type="date" value={form.date_paid} onChange={e => setForm({...form, date_paid: e.target.value})} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Notes</label>
              <Input value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Optional notes" />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-fuchsia-500 hover:bg-fuchsia-600">
              {saving ? "Saving..." : "Record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle size={18} /> Delete Contribution
            </DialogTitle>
            <DialogDescription className="pt-2">
              Are you sure you want to delete the <strong>{deleteTarget?.month} {deleteTarget?.year}</strong> contribution of <strong>KES {deleteTarget?.amount?.toLocaleString()}</strong> for <strong>{deleteTarget?.member_name}</strong>?
              {deleteTarget?.status === "Verified" && (
                <p className="mt-2 text-amber-700 text-xs bg-amber-50 p-2 rounded border border-amber-200">
                  ⚠️ This contribution is verified. Deleting it will reverse the member's total savings by KES {deleteTarget?.amount?.toLocaleString()}.
                </p>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button onClick={() => handleDelete(deleteTarget)} disabled={deleting} className="bg-red-600 hover:bg-red-700 text-white font-semibold">
              {deleting ? "Deleting..." : "Delete Contribution"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}