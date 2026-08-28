import React, { useState, useEffect } from "react";
import { api } from "@/api/supabaseClient";
import { CreditCard, Plus, CheckCircle, XCircle, ShieldAlert } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import EmptyState from "@/components/shared/EmptyState";
import MemberAvatar from "@/components/shared/MemberAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { useOutletContext } from "react-router-dom";
import { addRepaymentToSummary } from "@/lib/syncSummary";
import moment from "moment";

const StatusBadge = ({ status }) => {
  const cfg = {
    "Verified": "bg-emerald-50 text-emerald-700 border border-emerald-200",
    "Rejected": "bg-red-50 text-red-700 border border-red-200",
    "Pending Verification": "bg-amber-50 text-amber-700 border border-amber-200",
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cfg[status] || cfg["Pending Verification"]}`}>
      {status || "Pending Verification"}
    </span>
  );
};

export default function Repayments() {
  const context = useOutletContext() || {};
  const { role, isAdmin, isLeader, memberRole, memberName } = context;
  const [repayments, setRepayments] = useState([]);
  const [activeLoans, setActiveLoans] = useState([]);
  const [members, setMembers] = useState([]);
  const [currentMember, setCurrentMember] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [form, setForm] = useState({
    loan_id: "", amount: "", payment_method: "Cash",
    payment_date: new Date().toISOString().split("T")[0], notes: "",
  });
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const [r, l, me, m] = await Promise.all([
      api.entities.Repayment.list("-payment_date", 200),
      api.entities.Loan.filter({ status: "Active" }),
      api.auth.me(),
      api.entities.Member.list(),
    ]);
    setRepayments(r);
    setActiveLoans(l.filter(loan => (loan.balance === undefined || loan.balance > 0) && loan.status !== "Fully Paid"));
    setMembers(m);
    if (me?.email) {
      const linked = m.find(mem =>
        mem.user_email?.toLowerCase() === me.email?.toLowerCase() ||
        mem.email?.toLowerCase() === me.email?.toLowerCase()
      );
      setCurrentMember(linked || null);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const selectedLoan = activeLoans.find(l => l.id === form.loan_id);

  const handleSave = async () => {
    if (!form.loan_id || !form.amount) {
      toast({ title: "Select a loan and enter amount", variant: "destructive" });
      return;
    }
    const loan = activeLoans.find(l => l.id === form.loan_id);
    if (!loan) return;

    setSaving(true);
    const amt = parseFloat(form.amount);
    const isDigital = form.payment_method === "M-Pesa" || form.payment_method === "Bank Transfer";
    
    // Non-digital/Cash repayments MUST be verified by a leader before being applied to the balance
    const status = isDigital ? "Verified" : "Pending Verification";
    const newBalance = isDigital ? Math.max(0, (loan.balance || 0) - amt) : (loan.balance || 0);

    const effectiveRole = memberRole || (isAdmin ? "Chairperson" : "Leader");
    const effectiveName = memberName || (isAdmin ? "Admin" : "Leader");

    await api.entities.Repayment.create({
      ...form,
      amount: amt,
      member_id: loan.member_id,
      member_name: loan.member_name,
      balance_after: isDigital ? newBalance : loan.balance,
      status: status,
      created_by: `${effectiveName} (${effectiveRole})`,
      ...(isDigital ? { verified_by: `${effectiveName} (${effectiveRole})`, verification_date: form.payment_date } : {})
    });

    if (isDigital) {
      const loanUpdate = { amount_repaid: (loan.amount_repaid || 0) + amt, balance: newBalance };
      if (newBalance <= 0) loanUpdate.status = "Fully Paid";
      await api.entities.Loan.update(loan.id, loanUpdate);

      await api.entities.Transaction.create({
        member_id: loan.member_id,
        member_name: loan.member_name,
        type: "Loan Repayment",
        amount: amt,
        description: `Loan repayment (${form.payment_method}) — balance: KES ${newBalance.toLocaleString()}`,
        date: form.payment_date,
      });
      await addRepaymentToSummary(loan.member_id, amt);
      toast({ title: newBalance <= 0 ? "Loan fully paid!" : "Repayment recorded & verified" });
    } else {
      toast({
        title: "Cash Repayment Recorded — Pending Leader Approval",
        description: "Cash repayments require verification by another leader before applying to the loan balance.",
      });
    }

    setSaving(false);
    setShowForm(false);
    setForm({ loan_id: "", amount: "", payment_method: "Cash", payment_date: new Date().toISOString().split("T")[0], notes: "" });
    load();
  };

  const handleVerify = async (r, newStatus) => {
    const effectiveRole = memberRole || (isAdmin ? "Chairperson" : "Leader");
    const effectiveName = memberName || (isAdmin ? "Admin" : "Leader");
    
    // Check for self-approval on cash/non-digital repayments
    const isCashOrNonDigital = r.payment_method !== "M-Pesa" && r.payment_method !== "Bank Transfer";
    const isSelfPayment = currentMember && (r.member_id === currentMember.id || r.member_name === currentMember.full_name);

    if (newStatus === "Verified" && isCashOrNonDigital && isSelfPayment) {
      toast({
        title: "Self-Approval Not Allowed",
        description: "A leader cannot approve their own cash loan repayment. Another leader must verify and approve this payment.",
        variant: "destructive",
      });
      return;
    }

    setVerifying(r.id + newStatus);
    const today = new Date().toISOString().split("T")[0];

    await api.entities.Repayment.update(r.id, {
      status: newStatus,
      verified_by: `${effectiveName} (${effectiveRole})`,
      verification_date: today,
    });

    if (newStatus === "Verified") {
      const loans = await api.entities.Loan.filter({ status: "Active" });
      const loan = loans.find(l => l.id === r.loan_id);
      if (loan) {
        const newBalance = Math.max(0, (loan.balance || 0) - (r.amount || 0));
        const loanUpdate = { amount_repaid: (loan.amount_repaid || 0) + (r.amount || 0), balance: newBalance };
        if (newBalance <= 0) loanUpdate.status = "Fully Paid";
        await api.entities.Loan.update(loan.id, loanUpdate);

        await api.entities.Transaction.create({
          member_id: r.member_id,
          member_name: r.member_name,
          type: "Loan Repayment",
          amount: r.amount,
          description: `Cash loan repayment verified by ${effectiveName} (${effectiveRole}) — balance: KES ${newBalance.toLocaleString()}`,
          date: r.payment_date || today,
        });
      }
      await addRepaymentToSummary(r.member_id, r.amount);
    } else if (newStatus === "Rejected") {
      await api.entities.Transaction.create({
        member_id: r.member_id,
        member_name: r.member_name,
        type: "Repayment Rejected",
        amount: r.amount,
        description: `${r.payment_method || 'Cash'} loan repayment rejected by ${effectiveName} (${effectiveRole})`,
        date: today,
      });
    }

    toast({
      title: newStatus === "Verified" ? "Repayment Verified ✓" : "Repayment Rejected",
      description: `Approved by ${effectiveName} (${effectiveRole})`,
    });
    setVerifying(null);
    load();
  };

  const filtered = filterStatus === "all" ? repayments : repayments.filter(r => (r.status || "Pending Verification") === filterStatus);
  const pendingCount = repayments.filter(r => !r.status || r.status === "Pending Verification").length;

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
        title="Loan Repayments"
        subtitle={`${activeLoans.length} active loans${pendingCount > 0 ? ` · ${pendingCount} pending leader approval` : ""}`}
        action={
          activeLoans.length > 0 && (
            <Button onClick={() => setShowForm(true)} className="bg-fuchsia-500 hover:bg-fuchsia-600">
              <Plus size={16} className="mr-1" /> Record Repayment
            </Button>
          )
        }
      />

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {[["all","All"],["Pending Verification","Pending Approval"],["Verified","Verified"],["Rejected","Rejected"]].map(([val, label]) => (
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
          icon={CreditCard}
          title="No repayments"
          description={filterStatus === "all" ? "Record loan repayments as members pay back their loans" : `No ${filterStatus.toLowerCase()} repayments`}
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Member</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Method / Ref</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Balance After</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const isCash = r.payment_method !== "M-Pesa" && r.payment_method !== "Bank Transfer";
                  const isOwnPayment = currentMember && (r.member_id === currentMember.id || r.member_name === currentMember.full_name);
                  const isPending = r.status === "Pending Verification" || !r.status;

                  return (
                    <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-3 px-4 text-gray-600">{moment(r.payment_date).format("MMM D, YYYY")}</td>
                      <td className="py-3 px-4 font-medium text-gray-800">
                        <div className="flex items-center gap-2">
                          <MemberAvatar photoUrl={members?.find(m => m.id === r.member_id)?.photo_url} name={r.member_name} size="xs" />
                          <div>
                            <span>{r.member_name}</span>
                            {r.verified_by && (
                              <span className="block text-[10px] text-gray-400 font-normal">Approved by {r.verified_by}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-gray-600 hidden sm:table-cell">
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[11px] font-semibold ${isCash ? "bg-amber-50 text-amber-800 border border-amber-200" : "bg-blue-50 text-blue-800"}`}>
                          {r.payment_method || "Cash"}
                        </span>
                        {r.transaction_ref && <span className="block text-xs text-gray-400">Ref: {r.transaction_ref}</span>}
                        {r.bank_name && <span className="block text-xs text-gray-400">{r.bank_name}{r.bank_account ? ` · ${r.bank_account}` : ""}</span>}
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge status={r.status} />
                        {isPending && isCash && isOwnPayment && (
                          <span className="flex items-center gap-1 text-[10px] text-amber-700 mt-1 font-semibold">
                            <ShieldAlert size={11} /> Requires another leader's approval
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-blue-600">KES {(r.amount || 0).toLocaleString()}</td>
                      <td className="py-3 px-4 text-right text-gray-500 hidden md:table-cell">KES {(r.balance_after || 0).toLocaleString()}</td>
                      <td className="py-3 px-4 text-right">
                        {isPending ? (
                          <div className="flex justify-end gap-1 items-center">
                            {isCash && isOwnPayment ? (
                              <span
                                className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-md cursor-not-allowed font-medium"
                                title="A leader cannot approve their own cash loan repayment. Another leader must approve this payment."
                              >
                                Cannot Self-Approve
                              </span>
                            ) : (
                              <button
                                onClick={() => handleVerify(r, "Verified")}
                                disabled={!!verifying}
                                className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 disabled:opacity-40"
                                title="Approve Repayment"
                              >
                                <CheckCircle size={16} />
                              </button>
                            )}
                            <button
                              onClick={() => handleVerify(r, "Rejected")}
                              disabled={!!verifying}
                              className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-40"
                              title="Reject Repayment"
                            >
                              <XCircle size={16} />
                            </button>
                          </div>
                        ) : r.status === "Verified" ? (
                          <div className="flex items-center justify-end gap-1 text-emerald-600 text-xs font-medium">
                            <CheckCircle size={16} />
                          </div>
                        ) : (
                          <XCircle size={16} className="ml-auto text-red-400" />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Repayment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-xs font-medium text-gray-600">Select Loan *</label>
              <Select value={form.loan_id} onValueChange={v => setForm({...form, loan_id: v})}>
                <SelectTrigger><SelectValue placeholder="Select active loan" /></SelectTrigger>
                <SelectContent>
                  {activeLoans.map(l => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.member_name} — KES {(l.balance || 0).toLocaleString()} remaining
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedLoan && (
              <div className="bg-amber-50 rounded-lg p-3 text-sm space-y-1">
                <p className="text-gray-600">Total Loan: <span className="font-semibold">KES {(selectedLoan.total_amount || 0).toLocaleString()}</span></p>
                <p className="text-gray-600">Already Paid: <span className="font-semibold">KES {(selectedLoan.amount_repaid || 0).toLocaleString()}</span></p>
                <p className="text-gray-600">Balance: <span className="font-semibold text-amber-700">KES {(selectedLoan.balance || 0).toLocaleString()}</span></p>
                <p className="text-gray-600">Monthly: <span className="font-semibold">KES {(selectedLoan.monthly_repayment || 0).toLocaleString()}</span></p>
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-gray-600">Amount (KES) *</label>
              <Input type="number" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Payment Method</label>
              <Select value={form.payment_method} onValueChange={v => setForm({...form, payment_method: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="M-Pesa">M-Pesa</SelectItem>
                  <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Payment Date</label>
              <Input type="date" value={form.payment_date} onChange={e => setForm({...form, payment_date: e.target.value})} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-fuchsia-500 hover:bg-fuchsia-600">
              {saving ? "Recording..." : "Record Repayment"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}