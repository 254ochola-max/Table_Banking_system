import React, { useState, useEffect } from "react";
import { api } from "@/api/supabaseClient";
import { HandCoins, Plus, Check, X, Clock, AlertCircle, Info, Calendar, ShieldAlert, CheckCircle2, DollarSign } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import EmptyState from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { useOutletContext } from "react-router-dom";
import moment from "moment";

const OTHER_LEADER_ROLES = [
  "Assistant Chairperson", "Secretary", "Assistant Secretary", "Organizing Secretary"
];

function calcLoanTotals(principal, months, rate = 10) {
  const n = Math.max(1, parseInt(months) || 1);
  const r = (parseFloat(rate) || 10) / 100;
  const total = Math.round(principal * Math.pow(1 + r, n));
  const interest = total - principal;
  const monthly = Math.ceil(total / n);
  return { total, interest, monthly };
}

export default function Loans() {
  const [loans, setLoans] = useState([]);
  const [members, setMembers] = useState([]);
  const [contributions, setContributions] = useState([]);
  const [fines, setFines] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    member_id: "", amount: "", duration_months: 3,
    purpose: "", guarantor: "",
    application_date: new Date().toISOString().split("T")[0],
  });
  const { toast } = useToast();
  const { memberRole, memberName, isLeader, isAdmin } = useOutletContext();

  const getApprovalStatus = (loan) => {
    const approvals = loan.approvals || [];
    const rolesApproved = approvals.map(a => a.leader_role);
    const hasChair = rolesApproved.includes("Chairperson");
    const hasTreasurer = rolesApproved.includes("Treasurer");
    const hasOther = approvals.some(a => OTHER_LEADER_ROLES.includes(a.leader_role));
    return { approvals, hasChair, hasTreasurer, hasOther, fullyApproved: hasChair && hasTreasurer && hasOther };
  };

  const load = async () => {
    setLoading(true);
    const [l, m, s, c, f] = await Promise.all([
      api.entities.Loan.list("-application_date", 200),
      api.entities.Member.filter({ status: "Active" }),
      api.entities.GroupSettings.list(),
      api.entities.Contribution.list(),
      api.entities.Fine.list(),
    ]);
    setLoans(l || []);
    setMembers(m || []);
    setSettings(s[0] || null);
    setContributions(c || []);
    setFines(f || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const interestRate = settings?.interest_rate ?? settings?.loan_interest_rate ?? 10;
  const maxMultiplier = settings?.max_loan_multiplier ?? 3;

  // Selected member metrics for loan terms
  const selectedMemberSavings = form.member_id
    ? contributions
        .filter(c => c.member_id === form.member_id && c.status !== "Rejected")
        .reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0)
    : 0;

  const maxLoanAllowed = selectedMemberSavings > 0 ? selectedMemberSavings * maxMultiplier : 0;

  const selectedMemberActiveLoan = form.member_id
    ? loans.find(l => l.member_id === form.member_id && l.status === "Active")
    : null;

  const selectedMemberPendingLoan = form.member_id
    ? loans.find(l => l.member_id === form.member_id && l.status === "Pending")
    : null;

  const selectedMemberUnpaidFines = form.member_id
    ? fines.filter(f => f.member_id === form.member_id && (f.status === "Pending" || f.status === "Unpaid" || f.status === "Open" || !f.status))
    : [];

  const totalUnpaidFines = selectedMemberUnpaidFines.reduce((sum, f) => sum + (parseFloat(f.amount) || 0), 0);

  const selectedMemberOverdueBlocked = form.member_id
    ? loans.some(l => {
        if (l.member_id !== form.member_id || l.status !== "Active" || !l.due_date) return false;
        return moment().diff(moment(l.due_date), "months") >= 3 && moment().year() === moment(l.due_date).year();
      })
    : false;

  const handleSave = async () => {
    if (!form.member_id || !form.amount) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }

    const amt = parseFloat(form.amount);
    if (isNaN(amt) || amt <= 0) {
      toast({ title: "Enter a valid loan amount", variant: "destructive" });
      return;
    }

    // System Loan Terms Validations
    if (selectedMemberUnpaidFines.length > 0) {
      toast({
        title: "Unpaid Fines Block",
        description: `Member has KES ${totalUnpaidFines.toLocaleString()} in unpaid fines. Outstanding fines must be cleared before taking a loan.`,
        variant: "destructive",
      });
      return;
    }

    if (selectedMemberOverdueBlocked) {
      toast({
        title: "Borrowing Ineligible This Year",
        description: "Member has an active loan overdue by 3 or more months in the current year.",
        variant: "destructive",
      });
      return;
    }

    if (selectedMemberActiveLoan || selectedMemberPendingLoan) {
      toast({
        title: "Existing Loan in Progress",
        description: `Member already has a ${selectedMemberActiveLoan ? "active" : "pending"} loan in progress. Only one loan at a time is permitted under group terms.`,
        variant: "destructive",
      });
      return;
    }

    if (maxLoanAllowed > 0 && amt > maxLoanAllowed) {
      toast({
        title: "Loan Limit Exceeded",
        description: `Requested loan (KES ${amt.toLocaleString()}) exceeds the maximum allowable limit of ${maxMultiplier}x savings (KES ${maxLoanAllowed.toLocaleString()}).`,
        variant: "destructive",
      });
      return;
    }

    const member = members.find(m => m.id === form.member_id);
    const months = parseInt(form.duration_months) || 1;
    const { total, interest, monthly } = calcLoanTotals(amt, months, interestRate);

    // Standard schedule: Disbursed on 11th, next payment due on 10th of following month
    const disbursementDate = moment().date() >= 11
      ? moment().add(1, "month").date(11).format("YYYY-MM-DD")
      : moment().date(11).format("YYYY-MM-DD");
    const nextPayment = moment(disbursementDate).add(1, "month").date(10).format("YYYY-MM-DD");
    const dueDate = moment(disbursementDate).add(months, "months").date(10).format("YYYY-MM-DD");

    setSaving(true);
    await api.entities.Loan.create({
      member_id: form.member_id,
      member_name: member?.full_name || "",
      amount: amt,
      interest_rate: interestRate,
      interest_amount: interest,
      total_amount: total,
      monthly_repayment: monthly,
      balance: total,
      amount_paid: 0,
      duration_months: months,
      purpose: form.purpose,
      guarantor: form.guarantor,
      application_date: form.application_date || new Date().toISOString().split("T")[0],
      next_payment_date: nextPayment,
      due_date: dueDate,
      status: "Pending",
      approvals: [],
    });

    toast({
      title: "Loan application submitted!",
      description: `Loan of KES ${amt.toLocaleString()} submitted with ${interestRate}% monthly compounded terms. Pending leadership approval.`,
    });

    setSaving(false);
    setShowForm(false);
    setForm({ member_id: "", amount: "", duration_months: 3, purpose: "", guarantor: "", application_date: new Date().toISOString().split("T")[0] });
    load();
  };

  const handleLeaderApprove = async (loan) => {
    const effectiveRole = memberRole || (isAdmin ? "Chairperson" : "Leader");
    const effectiveName = memberName || (isAdmin ? "Admin" : "Leader");
    const existingApprovals = loan.approvals || [];
    if (existingApprovals.some(a => a.leader_role === effectiveRole)) {
      toast({ title: `You have already approved as ${effectiveRole}`, variant: "destructive" });
      return;
    }
    const today = new Date().toISOString().split("T")[0];
    const newApproval = { leader_role: effectiveRole, leader_name: effectiveName, date: today };
    const updatedApprovals = [...existingApprovals, newApproval];
    const rolesApproved = updatedApprovals.map(a => a.leader_role);

    const nowFull =
      rolesApproved.includes("Chairperson") &&
      rolesApproved.includes("Treasurer") &&
      updatedApprovals.some(a => OTHER_LEADER_ROLES.includes(a.leader_role));

    if (nowFull) {
      const disbursementDate = moment().date() >= 11
        ? moment().add(1, "month").date(11).format("YYYY-MM-DD")
        : moment().date(11).format("YYYY-MM-DD");
      const nextPayment = moment(disbursementDate).add(1, "month").date(10).format("YYYY-MM-DD");
      const dueDate = moment(disbursementDate).add(loan.duration_months, "months").date(10).format("YYYY-MM-DD");

      await api.entities.Loan.update(loan.id, {
        approvals: updatedApprovals,
        status: "Active",
        approval_date: today,
        next_payment_date: nextPayment,
        due_date: dueDate,
      });
      await api.entities.Transaction.create({
        member_id: loan.member_id,
        member_name: loan.member_name,
        type: "Loan Disbursement",
        amount: loan.amount,
        description: `Loan of KES ${loan.amount.toLocaleString()} disbursed`,
        date: today,
      });
      toast({ title: "Loan fully approved and activated" });
    } else {
      await api.entities.Loan.update(loan.id, { approvals: updatedApprovals });
      const remaining = [];
      if (!rolesApproved.includes("Chairperson")) remaining.push("Chairperson");
      if (!rolesApproved.includes("Treasurer")) remaining.push("Treasurer");
      if (!updatedApprovals.some(a => OTHER_LEADER_ROLES.includes(a.leader_role))) remaining.push("another leader");
      toast({ title: `Approval recorded (${memberRole})`, description: `Still need: ${remaining.join(", ")}` });
    }
    load();
  };

  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [selectedLoanForReject, setSelectedLoanForReject] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const openRejectModal = (loan) => {
    setSelectedLoanForReject(loan);
    setRejectionReason("");
    setRejectModalOpen(true);
  };

  const confirmReject = async () => {
    if (!rejectionReason.trim()) {
      toast({
        title: "Rejection reason required",
        description: "Please specify why this loan application is being rejected.",
        variant: "destructive",
      });
      return;
    }
    setRejecting(true);
    const effectiveRole = memberRole || (isAdmin ? "Chairperson" : "Leader");
    const effectiveName = memberName || (isAdmin ? "Admin" : "Leader");
    const today = new Date().toISOString().split("T")[0];

    await api.entities.Loan.update(selectedLoanForReject.id, {
      status: "Rejected",
      rejection_reason: rejectionReason.trim(),
      rejected_by: `${effectiveName} (${effectiveRole})`,
      rejection_date: today,
    });

    toast({
      title: "Loan rejected",
      description: `Reason recorded: "${rejectionReason.trim()}"`,
    });
    setRejecting(false);
    setRejectModalOpen(false);
    setSelectedLoanForReject(null);
    load();
  };

  const pending = loans.filter(l => l.status === "Pending");
  const active = loans.filter(l => l.status === "Active" && (l.balance === undefined || l.balance > 0) && l.status !== "Fully Paid");
  const completed = loans.filter(l => l.status === "Fully Paid" || l.status === "Completed" || l.status === "Rejected" || (l.balance !== undefined && l.balance <= 0 && l.status !== "Pending"));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-fuchsia-200 border-t-fuchsia-500 rounded-full animate-spin" />
      </div>
    );
  }

  const ApprovalBadge = ({ met, label }) => (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
      met ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-400"
    }`}>
      {met ? <Check size={9} /> : <X size={9} />} {label}
    </span>
  );

  const LoanRow = ({ loan, showActions }) => {
    const effectiveRole = memberRole || (isAdmin ? "Chairperson" : "Leader");
    const approval = getApprovalStatus(loan);
    const alreadyApproved = approval.approvals.some(a => a.leader_role === effectiveRole);
    const canApprove = (isLeader || isAdmin) && showActions && !alreadyApproved && !approval.fullyApproved;
    return (
      <tr className="border-b border-gray-50 hover:bg-gray-50">
        <td className="py-3 px-4 font-medium text-gray-800">
          {loan.member_name}
          {showActions && (
            <div className="flex flex-wrap gap-1 mt-1">
              <ApprovalBadge met={approval.hasChair} label="Chair" />
              <ApprovalBadge met={approval.hasTreasurer} label="Treasurer" />
              <ApprovalBadge met={approval.hasOther} label="Other" />
            </div>
          )}
          {loan.status === "Rejected" && loan.rejection_reason && (
            <div className="mt-1.5 p-2 bg-red-50 border border-red-100 rounded-lg text-xs text-red-700 max-w-md">
              <p className="font-semibold text-[11px] text-red-800">Rejection Reason:</p>
              <p className="text-[11px] italic mt-0.5">"{loan.rejection_reason}"</p>
              {loan.rejected_by && <p className="text-[10px] text-red-500 mt-1">By {loan.rejected_by} on {loan.rejection_date}</p>}
            </div>
          )}
        </td>
        <td className="py-3 px-4 text-gray-700">KES {(loan.amount || 0).toLocaleString()}</td>
        <td className="py-3 px-4 text-gray-600 hidden sm:table-cell">KES {(loan.total_amount || 0).toLocaleString()}</td>
        <td className="py-3 px-4 text-gray-600 hidden md:table-cell">{loan.duration_months} months</td>
        <td className="py-3 px-4 hidden lg:table-cell">
          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
            loan.status === "Active" ? "bg-amber-50 text-amber-700" :
            loan.status === "Pending" ? "bg-blue-50 text-blue-700" :
            loan.status === "Fully Paid" ? "bg-emerald-50 text-emerald-700" :
            loan.status === "Rejected" ? "bg-red-50 text-red-700" :
            "bg-gray-100 text-gray-600"
          }`}>{loan.status}</span>
        </td>
        <td className="py-3 px-4 text-right">
          {showActions ? (
            <div className="flex items-center justify-end gap-1">
              {canApprove ? (
                <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-200 hover:bg-emerald-50 h-7 text-xs" onClick={() => handleLeaderApprove(loan)}>
                  <Check size={12} className="mr-1" /> Approve
                </Button>
              ) : alreadyApproved ? (
                <span className="text-[10px] text-emerald-600 mr-1">You approved ✓</span>
              ) : null}
              <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 h-7 text-xs" onClick={() => openRejectModal(loan)}>
                <X size={12} className="mr-1" /> Reject
              </Button>
            </div>
          ) : (
            loan.status === "Active" ? (
              <span className="text-xs text-gray-500">Balance: KES {(loan.balance || 0).toLocaleString()}</span>
            ) : loan.status === "Rejected" ? (
              <span className="text-xs font-semibold text-red-600">Rejected</span>
            ) : null
          )}
        </td>
      </tr>
    );
  };

  const LoanTable = ({ items, showActions = false }) => (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Member</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Total (+ Interest)</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Duration</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">Status</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map(l => <LoanRow key={l.id} loan={l} showActions={showActions} />)}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto min-h-full">
      <PageHeader
        title="Loans"
        subtitle={`Interest rate: ${interestRate}%`}
        action={<Button onClick={() => setShowForm(true)} className="bg-fuchsia-500 hover:bg-fuchsia-600"><Plus size={16} className="mr-1" /> Apply for Loan</Button>}
      />

      {loans.length === 0 ? (
        <EmptyState
          icon={HandCoins}
          title="No loans yet"
          description="Apply for the first loan"
          action={<Button onClick={() => setShowForm(true)} className="bg-fuchsia-500 hover:bg-fuchsia-600">Apply for Loan</Button>}
        />
      ) : (
        <Tabs defaultValue="pending">
          <TabsList className="mb-4">
            <TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger>
            <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
            <TabsTrigger value="completed">Completed ({completed.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="pending">
            {pending.length > 0 ? <LoanTable items={pending} showActions /> : <p className="text-sm text-gray-400 text-center py-8">No pending loans</p>}
          </TabsContent>
          <TabsContent value="active">
            {active.length > 0 ? <LoanTable items={active} /> : <p className="text-sm text-gray-400 text-center py-8">No active loans</p>}
          </TabsContent>
          <TabsContent value="completed">
            {completed.length > 0 ? <LoanTable items={completed} /> : <p className="text-sm text-gray-400 text-center py-8">No completed loans</p>}
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-fuchsia-950 font-bold flex items-center gap-2">
              <HandCoins className="text-fuchsia-600" size={20} />
              Apply for Member Loan
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {/* Member Selection */}
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">Select Member *</label>
              <Select value={form.member_id} onValueChange={v => setForm({...form, member_id: v, guarantor: form.guarantor === members.find(m => m.id === v)?.full_name ? "" : form.guarantor})}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Choose a member to apply for..." />
                </SelectTrigger>
                <SelectContent>
                  {members.map(m => (
                    <SelectItem key={m.id} value={m.id} className="text-xs">
                      {m.full_name} ({m.phone || m.id_number || "Active"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Member Eligibility & Savings Card */}
            {form.member_id && (
              <div className="bg-gradient-to-r from-fuchsia-50/70 via-purple-50/40 to-fuchsia-50/70 border border-fuchsia-200/80 rounded-xl p-3.5 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600 font-medium">Accumulated Savings:</span>
                  <span className="font-bold text-gray-900">KES {selectedMemberSavings.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600 font-medium">Max Borrowing Limit ({maxMultiplier}x Savings):</span>
                  <span className="font-bold text-fuchsia-700">
                    {selectedMemberSavings > 0 ? `KES ${maxLoanAllowed.toLocaleString()}` : "No savings recorded"}
                  </span>
                </div>

                {/* Status Warnings */}
                {selectedMemberUnpaidFines.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-red-800 flex items-center gap-2 mt-2">
                    <ShieldAlert size={14} className="text-red-600 flex-shrink-0" />
                    <span>Unpaid Fines: <strong>KES {totalUnpaidFines.toLocaleString()}</strong> ({selectedMemberUnpaidFines.length} fine(s)). Fines must be cleared.</span>
                  </div>
                )}

                {selectedMemberOverdueBlocked && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-red-800 flex items-center gap-2 mt-2">
                    <ShieldAlert size={14} className="text-red-600 flex-shrink-0" />
                    <span>Ineligible: Member has had an overdue loan &gt; 3 months in the current year.</span>
                  </div>
                )}

                {(selectedMemberActiveLoan || selectedMemberPendingLoan) && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-amber-900 flex items-center gap-2 mt-2">
                    <AlertCircle size={14} className="text-amber-600 flex-shrink-0" />
                    <span>Existing {selectedMemberActiveLoan ? "Active" : "Pending"} loan exists (Balance: KES {(selectedMemberActiveLoan?.balance || 0).toLocaleString()}).</span>
                  </div>
                )}
              </div>
            )}

            {/* Loan Amount & Duration */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Loan Amount (KES) *</label>
                <Input
                  type="number"
                  value={form.amount}
                  onChange={e => setForm({...form, amount: e.target.value})}
                  placeholder="e.g. 10000"
                  className="h-9 text-xs"
                />
                {maxLoanAllowed > 0 && parseFloat(form.amount) > maxLoanAllowed && (
                  <p className="text-[11px] text-red-500 mt-1">Exceeds {maxMultiplier}x savings limit!</p>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Duration (Months) *</label>
                <Select value={String(form.duration_months)} onValueChange={v => setForm({...form, duration_months: parseInt(v)})}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 6, 10, 12, 18, 24].map(m => (
                      <SelectItem key={m} value={String(m)} className="text-xs">{m} Month{m > 1 ? "s" : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Live System Terms Calculation Card */}
            {form.amount && parseFloat(form.amount) > 0 && (() => {
              const amt = parseFloat(form.amount);
              const months = parseInt(form.duration_months) || 1;
              const { total, interest, monthly } = calcLoanTotals(amt, months, interestRate);
              const disbursementDate = moment().date() >= 11
                ? moment().add(1, "month").date(11).format("YYYY-MM-DD")
                : moment().date(11).format("YYYY-MM-DD");
              const nextPayment = moment(disbursementDate).add(1, "month").date(10).format("D MMM YYYY");
              const dueDate = moment(disbursementDate).add(months, "months").date(10).format("D MMM YYYY");

              return (
                <div className="bg-gradient-to-br from-fuchsia-50 via-purple-50/40 to-fuchsia-50/80 border border-fuchsia-200 rounded-xl p-4 text-xs space-y-2 shadow-2xs">
                  <div className="flex items-center justify-between border-b border-fuchsia-200/60 pb-2">
                    <span className="font-bold text-fuchsia-950 flex items-center gap-1.5">
                      <Clock size={14} className="text-fuchsia-600" />
                      System Loan Terms & Calculation
                    </span>
                    <span className="bg-fuchsia-200 text-fuchsia-900 font-bold px-2 py-0.5 rounded-full text-[11px]">
                      {interestRate}% / month compounded
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-gray-600 pt-1">
                    <div>
                      <p className="text-[11px] text-gray-500">Principal Amount:</p>
                      <p className="font-bold text-gray-900 text-sm">KES {amt.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-gray-500">Total Interest ({months} mo):</p>
                      <p className="font-bold text-fuchsia-700 text-sm">KES {interest.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-gray-500">Total Repayable:</p>
                      <p className="font-bold text-gray-900 text-sm">KES {total.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-gray-500">Monthly Installment:</p>
                      <p className="font-bold text-emerald-700 text-sm">KES {monthly.toLocaleString()} / mo</p>
                    </div>
                  </div>

                  <div className="border-t border-fuchsia-200/60 pt-2 text-[11px] text-gray-600 flex flex-wrap justify-between gap-1">
                    <span>1st Payment Due: <strong className="text-gray-900">{nextPayment}</strong></span>
                    <span>Final Maturity: <strong className="text-gray-900">{dueDate}</strong></span>
                  </div>
                </div>
              );
            })()}

            {/* Purpose */}
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">Purpose of Loan</label>
              <Input
                value={form.purpose}
                onChange={e => setForm({...form, purpose: e.target.value})}
                placeholder="e.g. Business expansion, Agriculture, School fees"
                className="h-9 text-xs"
              />
            </div>

            {/* Guarantor */}
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">Guarantor (Optional)</label>
              <Select value={form.guarantor} onValueChange={v => setForm({...form, guarantor: v})}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select a guarantor from members" />
                </SelectTrigger>
                <SelectContent>
                  {members
                    .filter(m => m.id !== form.member_id)
                    .map(m => (
                      <SelectItem key={m.id} value={m.full_name} className="text-xs">
                        {m.full_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="mt-5 gap-2">
            <Button variant="outline" onClick={() => setShowForm(false)} className="text-xs h-9">
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-fuchsia-600 hover:bg-fuchsia-700 font-semibold text-xs h-9 shadow-xs"
            >
              {saving ? "Submitting..." : "Apply for Loan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rejection Reason Modal */}
      <Dialog open={rejectModalOpen} onOpenChange={setRejectModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <X className="h-5 w-5" /> Reject Loan Application
            </DialogTitle>
          </DialogHeader>
          {selectedLoanForReject && (
            <div className="space-y-4 mt-2">
              <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs space-y-1 text-red-900">
                <p><strong>Member:</strong> {selectedLoanForReject.member_name}</p>
                <p><strong>Loan Amount:</strong> KES {(selectedLoanForReject.amount || 0).toLocaleString()}</p>
                <p><strong>Applied Date:</strong> {selectedLoanForReject.application_date}</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">
                  Reason for Rejection <span className="text-red-500">*</span>
                </label>
                <Textarea
                  rows={3}
                  placeholder="e.g. Insufficient savings balance, incomplete documentation, or active loan limit reached..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="text-xs focus-visible:ring-red-500"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  This reason will be recorded in audit logs and visible to the applicant.
                </p>
              </div>
            </div>
          )}
          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setRejectModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={confirmReject}
              disabled={rejecting || !rejectionReason.trim()}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {rejecting ? "Rejecting..." : "Confirm Rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}