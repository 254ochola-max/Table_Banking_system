import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api, supabase } from "@/api/supabaseClient";
import {
  Wallet, HandCoins, AlertTriangle, User, LogOut, CreditCard, Plus,
  LayoutDashboard, UserCircle, TrendingUp, Shield, Calendar, Edit3, Lock,
  Clock, CheckCircle2, Phone, Mail, MapPin, Briefcase, Camera, HeartHandshake, Upload, XCircle
} from "lucide-react";
import GroupSummaryTableWidget from "@/components/dashboard/GroupSummaryTableWidget";
import MemberDetailDialog from "@/components/portal/Member";
import BrandLogo from "@/components/shared/BrandLogo";
import moment from "moment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addRepaymentToSummary } from "@/lib/syncSummary";

// 10% compounded monthly
function calcLoanTotals(principal, months) {
  const n = Math.max(1, months);
  const total = Math.round(principal * Math.pow(1.1, n));
  const interest = total - principal;
  const monthly = Math.ceil(total / n);
  return { total, interest, monthly };
}

function StatCard({ title, value, icon: Icon, color, subtitle }) {
  const colors = {
    emerald: "bg-emerald-50 text-emerald-600",
    blue: "bg-blue-50 text-blue-600",
    amber: "bg-amber-50 text-amber-600",
    rose: "bg-rose-50 text-rose-600",
  };
  return (
    <div className={`rounded-2xl p-5 bg-white border border-gray-200 hover:shadow-md transition-shadow`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        {Icon && (
          <div className={`p-2.5 rounded-xl ${colors[color] || colors.emerald}`}>
            <Icon size={20} />
          </div>
        )}
      </div>
    </div>
  );
}

const LEADER_ROLES = ["Chairperson","Assistant Chairperson","Secretary","Assistant Secretary","Organizing Secretary","Treasurer"];

export default function MemberPortal() {
  const [user, setUser] = useState(null);
  const [member, setMember] = useState(null);
  const [contributions, setContributions] = useState([]);
  const [loans, setLoans] = useState([]);
  const [repayments, setRepayments] = useState([]);
  const [fines, setFines] = useState([]);
  const [groupSettings, setGroupSettings] = useState(null);
  const [allMembers, setAllMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isUnlinkedUser, setIsUnlinkedUser] = useState(false);
  const [submittingReg, setSubmittingReg] = useState(false);
  const [regForm, setRegForm] = useState({ full_name: "", phone: "", id_number: "", gender: "Female", address: "" });
  const [activePage, setActivePage] = useState("account");

  const [showLoanForm, setShowLoanForm] = useState(false);
  const [detailMember, setDetailMember] = useState(null);
  const [loanForm, setLoanForm] = useState({ amount: "", duration_months: 3, purpose: "", guarantor: "" });
  const [applying, setApplying] = useState(false);

  const [showRepayDialog, setShowRepayDialog] = useState(false);
  const [repayLoan, setRepayLoan] = useState(null);
  const [repayForm, setRepayForm] = useState({ amount: "", payment_method: "M-Pesa", transaction_ref: "", bank_name: "", bank_account: "", bank_branch: "", notes: "" });
  const [submittingRepay, setSubmittingRepay] = useState(false);

  const [showContribDialog, setShowContribDialog] = useState(false);
  const [contribForm, setContribForm] = useState({ amount: "", payment_method: "M-Pesa", month: moment().format("MMMM"), year: moment().year(), transaction_ref: "", bank_name: "", bank_account: "", bank_branch: "", evidence_notes: "" });
  const [submittingContrib, setSubmittingContrib] = useState(false);

  const [profileRequests, setProfileRequests] = useState([]);
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [submittingProfileRequest, setSubmittingProfileRequest] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const fileInputRef = React.useRef(null);

  const { toast } = useToast();

  useEffect(() => {
    async function load() {
      try {
        const me = await api.auth.me();
        setUser(me);
        setRegForm(prev => ({ ...prev, full_name: "" }));

        const members = await api.entities.Member.list();
        const linked = members.find(
          m => m.user_email?.toLowerCase() === me.email?.toLowerCase() ||
               m.email?.toLowerCase() === me.email?.toLowerCase()
        );
        if (!linked) {
          setIsUnlinkedUser(true);
          setLoading(false);
          return;
        }

        // Auto-link email & auth_user_id if missing in member record
        if (!linked.user_email || !linked.auth_user_id) {
          try {
            await api.entities.Member.update(linked.id, {
              user_email: me.email,
              email: linked.email || me.email,
              auth_user_id: me.id,
            });
          } catch (e) {
            console.error("Failed to auto-link member email:", e);
          }
        }

        setMember(linked);
        setAllMembers(members);

        setRegForm({
          full_name: (linked.full_name && linked.full_name !== me.email?.split("@")[0]) ? linked.full_name : "",
          phone: (linked.phone && linked.phone !== "N/A") ? linked.phone : "",
          id_number: (linked.id_number && linked.id_number !== "PENDING" && linked.id_number !== "ADMIN") ? linked.id_number : "",
          gender: linked.gender || "Female",
          address: linked.address || "",
        });

        // Prompt profile completion if phone, ID number, or full name are incomplete/placeholders
        const isPlaceholderPhone = !linked.phone || linked.phone === "N/A";
        const isPlaceholderID = !linked.id_number || linked.id_number === "PENDING";
        const isPlaceholderName = !linked.full_name || linked.full_name === me.email?.split("@")[0];
        if (linked.status === "Pending" && (isPlaceholderPhone || isPlaceholderID || isPlaceholderName)) {
          setIsUnlinkedUser(true);
          setLoading(false);
          return;
        }

        if (linked.status !== "Active") {
          setLoading(false);
          return;
        }

        const [c, l, r, gs, pr, f] = await Promise.all([
          api.entities.Contribution.filter({ member_id: linked.id }, "-date_paid", 50),
          api.entities.Loan.filter({ member_id: linked.id }),
          api.entities.Repayment.filter({ member_id: linked.id }, "-payment_date", 20),
          api.entities.GroupSettings.list(),
          api.entities.ProfileChangeRequest.filter({ member_id: linked.id }, "-request_date", 50),
          api.entities.Fine.filter({ member_id: linked.id }),
        ]);
        setContributions(c);
        setLoans(l);
        setRepayments(r);
        setGroupSettings(gs[0] || null);
        setProfileRequests(pr);
        setFines(f);
      } catch (e) { console.error(e); }
      setLoading(false);
    }
    load();
  }, []);

  const handleSelfRegister = async (e) => {
    e.preventDefault();
    if (!regForm.full_name || !regForm.phone || !regForm.id_number) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }
    setSubmittingReg(true);
    try {
      let savedMember;
      if (member?.id) {
        savedMember = await api.entities.Member.update(member.id, {
          full_name: regForm.full_name,
          email: user?.email,
          user_email: user?.email,
          auth_user_id: user?.id,
          phone: regForm.phone,
          id_number: regForm.id_number,
          gender: regForm.gender,
          address: regForm.address,
          status: "Pending",
        });
      } else {
        savedMember = await api.entities.Member.create({
          full_name: regForm.full_name,
          email: user?.email,
          user_email: user?.email,
          auth_user_id: user?.id,
          phone: regForm.phone,
          id_number: regForm.id_number,
          gender: regForm.gender,
          address: regForm.address,
          role: "Member",
          status: "Pending",
          date_joined: new Date().toISOString().split("T")[0],
          total_savings: 0,
          total_shares: 0,
        });
      }
      setMember(savedMember);
      setIsUnlinkedUser(false);
      toast({
        title: "Profile Submitted!",
        description: "Your registration is now pending administrator review and approval.",
      });
    } catch (e) {
      toast({ title: "Registration failed", description: e.message, variant: "destructive" });
    }
    setSubmittingReg(false);
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-fuchsia-200 border-t-fuchsia-500 rounded-full animate-spin" />
    </div>
  );

  if (isUnlinkedUser) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-100 p-6 sm:p-8 max-w-lg w-full shadow-lg">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
          <div className="w-12 h-12 bg-fuchsia-100 rounded-xl flex items-center justify-center text-fuchsia-600">
            <UserCircle size={28} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Complete Your Profile</h2>
            <p className="text-xs text-gray-500">Provide your contact and identification details for administrator review.</p>
          </div>
        </div>

        <form onSubmit={handleSelfRegister} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Full Name *</label>
            <Input
              value={regForm.full_name}
              onChange={e => setRegForm(prev => ({ ...prev, full_name: e.target.value }))}
              placeholder="e.g. Samuel Odhiambo"
              required
            />
            <p className="text-[11px] text-gray-400 mt-0.5">Please enter your official full name as it appears on your National ID.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Login Email</label>
            <Input value={user?.email || ""} disabled className="bg-gray-100 text-gray-600 cursor-not-allowed" />
            <p className="text-[11px] text-gray-400 mt-0.5">Connected account email. Cannot be changed here.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Phone Number *</label>
              <Input
                value={regForm.phone}
                onChange={e => setRegForm(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="0712345678"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">ID Number *</label>
              <Input
                value={regForm.id_number}
                onChange={e => setRegForm(prev => ({ ...prev, id_number: e.target.value }))}
                placeholder="12345678"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Gender</label>
              <Select value={regForm.gender} onValueChange={val => setRegForm(prev => ({ ...prev, gender: val }))}>
                <SelectTrigger><SelectValue placeholder="Select Gender" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Female">Female</SelectItem>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Address / Location</label>
              <Input
                value={regForm.address}
                onChange={e => setRegForm(prev => ({ ...prev, address: e.target.value }))}
                placeholder="Town or Area (e.g. Kisumu)"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => api.auth.logout("/")}
              className="text-xs text-gray-500 hover:text-gray-700 font-medium"
            >
              Cancel / Sign out
            </button>
            <Button type="submit" disabled={submittingReg} className="bg-fuchsia-600 hover:bg-fuchsia-700 text-white font-semibold">
              {submittingReg ? "Submitting..." : "Submit Profile Details"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );

  if (member && member.status === "Pending") return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-100 p-8 max-w-md w-full text-center shadow-lg space-y-5">
        <div className="w-16 h-16 bg-amber-50 border border-amber-200 rounded-full flex items-center justify-center mx-auto text-amber-600 shadow-sm">
          <Clock size={32} className="animate-pulse" />
        </div>
        <div>
          <span className="inline-block bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold px-3 py-1 rounded-full mb-2">
            Pending Verification & Role Assignment
          </span>
          <h2 className="text-xl font-bold text-gray-900">Registration Under Review</h2>
          <p className="text-xs text-gray-600 mt-2 leading-relaxed">
            Welcome <strong>{member.full_name}</strong>! Your registration details have been submitted. An administrator must verify your application and assign your system role to grant access.
          </p>
        </div>

        <div className="bg-gray-50 rounded-xl p-4 text-left text-xs space-y-2 border border-gray-100 shadow-xs">
          <div className="flex justify-between"><span className="text-gray-500">Applicant:</span><span className="font-semibold text-gray-900">{member.full_name}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Email:</span><span className="font-semibold text-gray-900">{member.email || user?.email}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Phone:</span><span className="font-semibold text-gray-900">{member.phone}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">National ID:</span><span className="font-semibold text-gray-900">{member.id_number}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Submitted On:</span><span className="font-semibold text-gray-900">{moment(member.date_joined || member.created_at).format("D MMM YYYY")}</span></div>
        </div>

        <div className="pt-2 flex flex-col gap-2">
          <Button
            onClick={async () => {
              setLoading(true);
              const members = await api.entities.Member.list();
              const linked = members.find(
                m => m.user_email?.toLowerCase() === user?.email?.toLowerCase() ||
                     m.email?.toLowerCase() === user?.email?.toLowerCase()
              );
              if (linked) {
                setMember(linked);
                if (linked.status === "Active") {
                  toast({ title: "Verification Complete!", description: `Your account has been verified as ${linked.role}. Access granted.` });
                } else {
                  toast({ title: "Status Updated", description: `Current status: ${linked.status}` });
                }
              }
              setLoading(false);
            }}
            className="w-full bg-fuchsia-600 hover:bg-fuchsia-700 text-white font-semibold h-10 text-xs shadow-sm"
          >
            Check / Refresh Approval Status
          </Button>

          <Button
            variant="outline"
            onClick={() => setIsUnlinkedUser(true)}
            className="w-full border-gray-300 text-gray-700 hover:bg-gray-50 text-xs h-9 font-medium"
          >
            Edit / Update Profile Details
          </Button>

          <button
            onClick={() => api.auth.logout("/")}
            className="w-full py-2 px-4 rounded-xl border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );

  if (member && (member.status === "Inactive" || member.status === "Rejected")) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-100 p-8 max-w-sm w-full text-center shadow-md space-y-4">
        <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto text-red-500">
          <XCircle size={28} />
        </div>
        <h2 className="text-lg font-bold text-gray-800">Account Access Restricted</h2>
        <p className="text-sm text-gray-500">
          Your member account status is <strong>{member.status}</strong>. Please contact your group administrator for assistance.
        </p>
        <button onClick={() => api.auth.logout("/")} className="text-sm text-fuchsia-600 hover:text-fuchsia-700 font-medium">Sign out</button>
      </div>
    </div>
  );

  const handleLoanApply = async () => {
    if (unpaidFines.length > 0) {
      toast({
        title: "Unpaid Fine Block",
        description: `You have KES ${totalUnpaidFineAmount.toLocaleString()} in unpaid fines (${unpaidFines.map(f => f.reason).join(", ")}). Please pay your fines before applying for a loan.`,
        variant: "destructive",
      });
      return;
    }
    if (!loanForm.amount || parseFloat(loanForm.amount) <= 0) {
      toast({ title: "Enter a valid loan amount", variant: "destructive" }); return;
    }
    const now = moment();
    const blocked = loans.some(l => {
      if (l.status !== "Active" || !l.due_date) return false;
      return now.diff(moment(l.due_date), "months") >= 3 && now.year() === moment(l.due_date).year();
    });
    if (blocked) { toast({ title: "You cannot borrow this year", description: "Overdue loan exceeds 3 months.", variant: "destructive" }); return; }
    if (loans.some(l => l.status === "Active") || loans.some(l => l.status === "Pending")) {
      toast({ title: "Existing loan in progress", variant: "destructive" }); return;
    }
    setApplying(true);
    const amt = parseFloat(loanForm.amount);
    const months = parseInt(loanForm.duration_months) || 1;
    const { total, interest, monthly } = calcLoanTotals(amt, months);
    const disbursementDate = moment().date() >= 11
      ? moment().add(1, "month").date(11).format("YYYY-MM-DD")
      : moment().date(11).format("YYYY-MM-DD");
    await api.entities.Loan.create({
      member_id: member.id, member_name: member.full_name, amount: amt,
      interest_rate: 10, interest_amount: interest, total_amount: total,
      monthly_repayment: monthly, balance: total, duration_months: months,
      purpose: loanForm.purpose, guarantor: loanForm.guarantor,
      application_date: new Date().toISOString().split("T")[0],
      next_payment_date: moment(disbursementDate).add(1, "month").date(10).format("YYYY-MM-DD"),
      due_date: moment(disbursementDate).add(months, "months").date(10).format("YYYY-MM-DD"),
      status: "Pending",
    });
    // Notify leaders about the new loan application
    const leaders = allMembers.filter(m => LEADER_ROLES.includes(m.role) && m.id !== member.id);
    for (const leader of leaders) {
      const email = leader.user_email || leader.email;
      if (email) {
        try {
          await api.integrations.Core.SendEmail({
            to: email,
            subject: `New Loan Application: ${member.full_name}`,
            body: `${member.full_name} has applied for a loan of KES ${amt.toLocaleString()} for ${months} months.\n\nPurpose: ${loanForm.purpose || "Not specified"}\nGuarantor: ${loanForm.guarantor || "Not specified"}\n\nReview and approve at: ${window.location.origin}/loans`,
          });
        } catch (e) { /* leader may not be a registered user */ }
      }
    }
    toast({ title: "Loan application submitted!", description: "Leaders have been notified." });
    setApplying(false); setShowLoanForm(false);
    setLoanForm({ amount: "", duration_months: 3, purpose: "", guarantor: "" });
    const updated = await api.entities.Loan.filter({ member_id: member.id });
    setLoans(updated);
  };

  const handleRepaySubmit = async () => {
    if (unpaidFines.length > 0) {
      toast({
        title: "Unpaid Fine Block",
        description: `You have KES ${totalUnpaidFineAmount.toLocaleString()} in unpaid fines (${unpaidFines.map(f => f.reason).join(", ")}). Please clear your unpaid fines before making loan repayments.`,
        variant: "destructive",
      });
      return;
    }
    if (!repayForm.amount || parseFloat(repayForm.amount) <= 0) { toast({ title: "Enter a valid repayment amount", variant: "destructive" }); return; }
    if (repayForm.payment_method === "M-Pesa" && !repayForm.transaction_ref) { toast({ title: "M-Pesa transaction code required", variant: "destructive" }); return; }
    if (repayForm.payment_method === "Bank Transfer" && (!repayForm.bank_name || !repayForm.bank_account)) { toast({ title: "Bank details required", variant: "destructive" }); return; }
    setSubmittingRepay(true);
    const amt = parseFloat(repayForm.amount);
    const isDigital = repayForm.payment_method === "M-Pesa" || repayForm.payment_method === "Bank Transfer";
    const status = isDigital ? "Verified" : "Pending Verification";
    const newBalance = isDigital ? Math.max(0, (repayLoan.balance || 0) - amt) : (repayLoan.balance || 0);

    await api.entities.Repayment.create({
      loan_id: repayLoan.id, member_id: member.id, member_name: member.full_name,
      amount: amt, payment_date: new Date().toISOString().split("T")[0],
      payment_method: repayForm.payment_method, balance_after: newBalance,
      status: status,
      notes: [repayForm.transaction_ref && `Ref: ${repayForm.transaction_ref}`, repayForm.bank_name && `Bank: ${repayForm.bank_name}`, repayForm.notes].filter(Boolean).join(" | "),
    });

    if (isDigital) {
      await api.entities.Loan.update(repayLoan.id, { balance: newBalance, amount_repaid: (repayLoan.amount_repaid || 0) + amt, status: newBalance === 0 ? "Fully Paid" : "Active" });
      await addRepaymentToSummary(member.id, amt);
      toast({ title: "Repayment submitted & verified!", description: "Updated loan balance and group summary table." });
    } else {
      toast({ title: "Cash Repayment submitted!", description: "Pending leader approval before applying to loan balance." });
    }

    setSubmittingRepay(false); setShowRepayDialog(false);
    setRepayForm({ amount: "", payment_method: "M-Pesa", transaction_ref: "", bank_name: "", bank_account: "", bank_branch: "", notes: "" });
    const [ul, ur] = await Promise.all([api.entities.Loan.filter({ member_id: member.id }), api.entities.Repayment.filter({ member_id: member.id }, "-payment_date", 20)]);
    setLoans(ul); setRepayments(ur);
  };

  const handleContribSubmit = async () => {
    if (unpaidFines.length > 0) {
      toast({
        title: "Unpaid Fine Block",
        description: `You have KES ${totalUnpaidFineAmount.toLocaleString()} in unpaid fines (${unpaidFines.map(f => f.reason).join(", ")}). Please clear your unpaid fines before making new contributions.`,
        variant: "destructive",
      });
      return;
    }
    if (!contribForm.amount || parseFloat(contribForm.amount) <= 0) { toast({ title: "Enter a valid amount", variant: "destructive" }); return; }
    if (contribForm.payment_method === "M-Pesa" && !contribForm.transaction_ref) { toast({ title: "M-Pesa transaction code required", variant: "destructive" }); return; }
    if (contribForm.payment_method === "Bank Transfer" && (!contribForm.bank_name || !contribForm.bank_account)) { toast({ title: "Bank details required", variant: "destructive" }); return; }
    setSubmittingContrib(true);
    await api.entities.Contribution.create({
      member_id: member.id, member_name: member.full_name,
      amount: parseFloat(contribForm.amount), payment_method: contribForm.payment_method,
      month: contribForm.month, year: parseInt(contribForm.year),
      date_paid: new Date().toISOString().split("T")[0],
      transaction_ref: contribForm.transaction_ref, bank_name: contribForm.bank_name,
      bank_account: contribForm.bank_account, bank_branch: contribForm.bank_branch,
      evidence_notes: contribForm.evidence_notes, status: "Pending Verification",
    });
    toast({ title: "Contribution submitted!", description: "Pending admin verification." });
    setSubmittingContrib(false); setShowContribDialog(false);
    setContribForm({ amount: "", payment_method: "M-Pesa", month: moment().format("MMMM"), year: moment().year(), transaction_ref: "", bank_name: "", bank_account: "", bank_branch: "", evidence_notes: "" });
    const uc = await api.entities.Contribution.filter({ member_id: member.id }, "-date_paid", 50);
    setContributions(uc);
  };

  const totalContributions = contributions.reduce((s, c) => s + (c.amount || 0), 0);
  const activeLoans = loans.filter(l => l.status === "Active" && (l.balance === undefined || l.balance > 0) && l.status !== "Fully Paid");
  const pendingLoans = loans.filter(l => l.status === "Pending");
  const rejectedLoans = loans.filter(l => l.status === "Rejected");
  const completedLoans = loans.filter(l => l.status === "Fully Paid" || (l.balance !== undefined && l.balance <= 0 && l.status !== "Pending"));
  const totalLoanBalance = activeLoans.reduce((s, l) => s + (l.balance || 0), 0);
  const totalRepaid = repayments.reduce((s, r) => s + (r.amount || 0), 0);
  const now = moment();
  const memberJoinDate = member?.date_joined ? moment(member.date_joined) : null;

  // Unpaid fines issued on or after member joining date (fines issued before member joined do NOT block)
  const unpaidFines = fines.filter(f => {
    if (f.status !== "Unpaid") return false;
    if (!memberJoinDate || !memberJoinDate.isValid()) return true;
    const fineDate = f.date_issued ? moment(f.date_issued) : null;
    if (!fineDate || !fineDate.isValid()) return true;
    return fineDate.isSameOrAfter(memberJoinDate, "day");
  });
  const totalUnpaidFineAmount = unpaidFines.reduce((sum, f) => sum + (f.amount || 0), 0);

  const isBlocked = loans.some(l => l.status === "Active" && (l.balance === undefined || l.balance > 0) && l.status !== "Fully Paid" && l.due_date && now.diff(moment(l.due_date), "months") >= 3 && now.year() === moment(l.due_date).year());
  const canApply = !isBlocked && !activeLoans.length && !pendingLoans.length && unpaidFines.length === 0;
  const isLeader = LEADER_ROLES.includes(member?.role);

  const groupName = groupSettings?.group_name || "THE DEBORAH'S";
  const monthlyTarget = groupSettings?.monthly_savings_target || 0;
  const totalGroupSavings = allMembers.reduce((s, m) => s + (m.total_savings || 0), 0);
  const activeMembers = allMembers.filter(m => m.status === "Active").length;

  // Contribution streak (consecutive months paid)
  const sortedContribs = [...contributions].filter(c => c.status === "Verified").sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year;
    const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    return MONTHS.indexOf(b.month) - MONTHS.indexOf(a.month);
  });

  const handleProfileChangeSubmit = async () => {
    if (!editValue || editValue.trim() === "") {
      toast({ title: "Please enter a value", variant: "destructive" });
      return;
    }
    setSubmittingProfileRequest(true);

    // Profile photo update is instant and does NOT require admin approval
    if (editingField === "photo_url") {
      try {
        await api.entities.Member.update(member.id, { photo_url: editValue.trim() });
        setMember(prev => ({ ...prev, photo_url: editValue.trim() }));
        toast({ title: "Profile picture updated!", description: "Your profile photo has been saved." });
      } catch (err) {
        console.error(err);
        toast({ title: "Failed to update profile picture", variant: "destructive" });
      }
      setSubmittingProfileRequest(false);
      setEditingField(null);
      setEditValue("");
      return;
    }

    const fieldMap = {
      phone: { label: "Phone Number", oldVal: member.phone || "" },
      email: { label: "Email Address", oldVal: member.email || member.user_email || "" },
      address: { label: "Postal / Residential Address", oldVal: member.address || "" },
      next_of_kin: { label: "Next of Kin / Contact Details", oldVal: member.next_of_kin || "" },
      occupation: { label: "Occupation / Business Info", oldVal: member.occupation || "" },
    };
    const target = fieldMap[editingField];
    await api.entities.ProfileChangeRequest.create({
      member_id: member.id,
      member_name: member.full_name,
      field_key: editingField,
      field_label: target ? target.label : editingField,
      old_value: target ? target.oldVal : "",
      new_value: editValue.trim(),
      status: "Pending",
      request_date: new Date().toISOString(),
    });
    toast({
      title: "Profile change request submitted!",
      description: "Status: 🟡 Pending verification by an administrator."
    });
    setSubmittingProfileRequest(false);
    setEditingField(null);
    setEditValue("");
    const pr = await api.entities.ProfileChangeRequest.filter({ member_id: member.id }, "-request_date", 50);
    setProfileRequests(pr);
  };

  const handlePhotoFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Please select an image smaller than 5MB.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result;
      if (!dataUrl || !member?.id) return;
      try {
        await api.entities.Member.update(member.id, { photo_url: dataUrl });
        setMember(prev => ({ ...prev, photo_url: dataUrl }));
        toast({ title: "Profile picture updated!", description: "Your new profile photo has been saved." });
      } catch (err) {
        console.error(err);
        toast({ title: "Failed to update profile picture", variant: "destructive" });
      }
    };
    reader.readAsDataURL(file);
  };

  const pendingForField = (fieldKey) => {
    return profileRequests.find(r => r.field_key === fieldKey && r.status === "Pending");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Styled Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-center gap-3">
          <BrandLogo size={42} className="shadow-xs" />
          <div className="text-left">
            <h1
              className="text-xl sm:text-2xl font-black tracking-wider uppercase select-none text-fuchsia-950 leading-tight"
              style={{
                fontFamily: "'Georgia', 'Times New Roman', serif",
                letterSpacing: "0.12em",
              }}
            >
              THE DEBORAH'S
            </h1>
            <p className="text-fuchsia-700 text-[10px] tracking-[0.25em] uppercase font-semibold">
              Table Banking Group
            </p>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">

        {/* Safaricom MySafaricom App-style Profile Greeting Card */}
        {(() => {
          const hour = new Date().getHours();
          let greeting = "Good evening";
          let timeEmoji = "🌙";
          if (hour >= 5 && hour < 12) { greeting = "Good morning"; timeEmoji = "☀️"; }
          else if (hour >= 12 && hour < 17) { greeting = "Good afternoon"; timeEmoji = "☀️"; }

          return (
            <div className="bg-gradient-to-r from-fuchsia-700 via-fuchsia-600 to-pink-600 rounded-3xl p-5 sm:p-6 text-white shadow-xl flex flex-col sm:flex-row items-center justify-between gap-5 border border-fuchsia-400/20 relative overflow-hidden">
              {/* Background subtle ambient glow */}
              <div className="absolute -right-10 -bottom-10 w-44 h-44 bg-white/10 rounded-full blur-2xl pointer-events-none" />

              <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left z-10">
                {/* Safaricom Style Profile Picture Circle with Ring */}
                <div className="relative group flex-shrink-0">
                  <div className="w-20 h-20 sm:w-22 sm:h-22 rounded-full p-1 bg-gradient-to-tr from-amber-300 via-white to-pink-300 shadow-lg">
                    <div className="w-full h-full rounded-full bg-fuchsia-900 border-2 border-white/90 flex items-center justify-center overflow-hidden">
                      {member?.photo_url ? (
                        <img src={member.photo_url} alt={member.full_name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-3xl font-black text-white">{member?.full_name?.charAt(0)}</span>
                      )}
                    </div>
                  </div>
                  {/* Camera upload badge */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute bottom-0 right-0 bg-white text-fuchsia-700 p-2 rounded-full shadow-md hover:bg-fuchsia-50 transition-all hover:scale-110 cursor-pointer border border-fuchsia-200"
                    title="Upload Photo from Device"
                  >
                    <Camera size={13} />
                  </button>
                </div>

                <div className="space-y-1">
                  {/* Safaricom style greeting */}
                  <p className="text-xs sm:text-sm font-semibold text-fuchsia-200 flex items-center justify-center sm:justify-start gap-1.5 uppercase tracking-wider">
                    <span>{greeting},</span>
                    <span>{timeEmoji}</span>
                  </p>

                  <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                    {member?.full_name}
                  </h2>

                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                    <span className="text-xs bg-white/15 backdrop-blur-md px-3 py-0.5 rounded-full font-mono text-white border border-white/20">
                      ID: {member?.id_number || member?.id?.slice(0, 8) || "TB-MEMBER"}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-400/20 text-emerald-100 border border-emerald-300/40 backdrop-blur-sm">
                      <CheckCircle2 size={12} /> {member?.status || "Active"}
                    </span>
                    {isLeader && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-400/20 text-amber-100 border border-amber-300/40 backdrop-blur-sm">
                        <Shield size={12} /> {member?.role}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Edit Profile Action Pill */}
              <div className="z-10 flex-shrink-0">
                <Button
                  onClick={() => setShowProfileModal(true)}
                  className="bg-white text-fuchsia-800 hover:bg-fuchsia-50 text-xs font-bold rounded-full px-5 py-2.5 flex items-center gap-2 shadow-lg transition-all hover:scale-105"
                >
                  <Edit3 size={14} className="text-fuchsia-600" /> Edit Profile
                </Button>
              </div>
            </div>
          );
        })()}

        {/* Unpaid Fine Notice Banner */}
        {unpaidFines.length > 0 && (
          <div className="bg-gradient-to-r from-rose-500 via-rose-600 to-red-600 rounded-3xl p-5 text-white shadow-xl border border-rose-300/40 space-y-3 relative overflow-hidden">
            <div className="flex items-start gap-3.5 z-10 relative">
              <div className="p-2.5 bg-white/20 backdrop-blur-md text-white rounded-2xl shrink-0 mt-0.5 border border-white/30">
                <AlertTriangle size={24} />
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-black tracking-wide text-white flex items-center gap-2">
                    <span>Unpaid Fine Notice</span>
                    <span className="bg-white text-rose-700 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider shadow-xs">Payment Required</span>
                  </h3>
                  <span className="text-xs font-mono font-bold bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-white border border-white/20">
                    Total: KES {totalUnpaidFineAmount.toLocaleString()}
                  </span>
                </div>
                <p className="text-xs text-rose-100 leading-relaxed pt-0.5">
                  You have <strong>{unpaidFines.length}</strong> unpaid fine{unpaidFines.length > 1 ? "s" : ""} issued on or after your joining date ({moment(member?.date_joined).format("MMM D, YYYY")}).
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1.5">
                  {unpaidFines.map(f => (
                    <span key={f.id} className="text-[11px] bg-white/15 backdrop-blur-sm text-white px-2.5 py-1 rounded-lg border border-white/20 font-medium">
                      {f.reason}: <strong>KES {(f.amount || 0).toLocaleString()}</strong> ({moment(f.date_issued).format("MMM D, YYYY")})
                    </span>
                  ))}
                </div>
                <div className="pt-2 text-xs font-bold text-amber-200 flex items-center gap-1.5">
                  <XCircle size={15} className="text-amber-300 shrink-0" />
                  <span>Notice: You are restricted from making contributions or loan repayments until all applicable fines are paid.</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Account stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard title="My Savings" value={`KES ${totalContributions.toLocaleString()}`} icon={Wallet} color="emerald" />
          <StatCard title="Loan Balance" value={`KES ${totalLoanBalance.toLocaleString()}`} icon={HandCoins} color="amber" subtitle={`${activeLoans.length} active`} />
          <StatCard title="Unpaid Fines" value={`KES ${totalUnpaidFineAmount.toLocaleString()}`} icon={AlertTriangle} color="rose" subtitle={`${unpaidFines.length} pending`} />
          <StatCard title="Total Repaid" value={`KES ${totalRepaid.toLocaleString()}`} icon={CreditCard} color="blue" />
        </div>

        {/* Progress bar vs target */}
            {monthlyTarget > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-900 font-medium">My Savings Progress</span>
                  <span className="text-xs text-emerald-600">{Math.min(100, Math.round((totalContributions / monthlyTarget) * 100))}% of target</span>
                </div>
                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all"
                    style={{ width: `${Math.min(100, (totalContributions / monthlyTarget) * 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-1.5">
                  <span>KES {totalContributions.toLocaleString()} saved</span>
                  <span>Target: KES {monthlyTarget.toLocaleString()}</span>
                </div>
              </div>
            )}

            {/* Active Loans */}
            {activeLoans.length > 0 && (
              <div className="bg-white rounded-2xl overflow-hidden shadow-xl">
                <div className="bg-amber-500 px-5 py-3">
                  <h3 className="text-white font-semibold text-sm flex items-center gap-2"><HandCoins size={15} /> Active Loans</h3>
                </div>
                <div className="p-4 space-y-3">
                  {activeLoans.map(loan => {
                    const pct = loan.total_amount > 0 ? Math.round((loan.amount_repaid / loan.total_amount) * 100) : 0;
                    return (
                      <div key={loan.id} className="border border-gray-100 rounded-xl p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="text-sm font-bold text-gray-800">KES {(loan.amount || 0).toLocaleString()}</p>
                            {loan.purpose && <p className="text-xs text-gray-500 mt-0.5">{loan.purpose}</p>}
                          </div>
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">Active</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                          <div><span className="text-gray-500">Total</span><p className="font-semibold">KES {(loan.total_amount || 0).toLocaleString()}</p></div>
                          <div><span className="text-gray-500">Paid</span><p className="font-semibold text-emerald-600">KES {(loan.amount_repaid || 0).toLocaleString()}</p></div>
                          <div><span className="text-gray-500">Balance</span><p className="font-semibold text-amber-600">KES {(loan.balance || 0).toLocaleString()}</p></div>
                        </div>
                        <div className="mb-3">
                          <div className="flex justify-between text-xs text-gray-500 mb-1"><span>Progress</span><span>{pct}%</span></div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        {loan.next_payment_date && (
                          <p className="text-xs text-gray-500 mb-3">Next: <span className="font-medium text-gray-700">{moment(loan.next_payment_date).format("MMM D, YYYY")}</span> · Monthly: KES {(loan.monthly_repayment || 0).toLocaleString()}</p>
                        )}
                        <Button size="sm" className="bg-fuchsia-500 hover:bg-fuchsia-600 text-white text-xs" onClick={() => { setRepayLoan(loan); setRepayForm(f => ({ ...f, amount: loan.monthly_repayment || "" })); setShowRepayDialog(true); }}>
                          <CreditCard size={13} className="mr-1" /> Make Repayment
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Loan Application */}
            <div className="bg-white rounded-2xl overflow-hidden shadow-xl">
              <div className="bg-emerald-500 px-5 py-3 flex items-center justify-between">
                <h3 className="text-white font-semibold text-sm">Apply for a Loan</h3>
                <Button onClick={() => setShowLoanForm(true)} disabled={!canApply} size="sm" className="bg-white/20 hover:bg-white/30 text-white border-0 text-xs disabled:opacity-40">
                  <Plus size={13} className="mr-1" /> Apply
                </Button>
              </div>
              <div className="p-4">
                {isBlocked ? (
                  <p className="text-sm text-red-500">Blocked — overdue loan exceeds 3 months.</p>
                ) : activeLoans.length || pendingLoans.length ? (
                  <p className="text-sm text-gray-500">Clear your current loan before applying for a new one.</p>
                ) : (
                  <p className="text-sm text-gray-500">10% compounded monthly · Repayments due 10th · Disbursed on 11th</p>
                )}
              </div>
            </div>

            {/* Pending Loans */}
            {pendingLoans.length > 0 && (
              <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
                <div className="bg-blue-500 px-5 py-3">
                  <h3 className="text-white font-semibold text-sm">Pending Applications</h3>
                </div>
                <div className="divide-y divide-gray-50">
                  {pendingLoans.map(loan => (
                    <div key={loan.id} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-700">KES {(loan.amount || 0).toLocaleString()}</p>
                        <p className="text-xs text-gray-400">Applied {moment(loan.application_date).format("MMM D, YYYY")} · {loan.duration_months} months</p>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">Pending</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Rejected Loans */}
            {rejectedLoans.length > 0 && (
              <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-red-100">
                <div className="bg-red-500 px-5 py-3">
                  <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                    <XCircle size={16} /> Rejected Loan Applications
                  </h3>
                </div>
                <div className="divide-y divide-red-50 p-4 space-y-3">
                  {rejectedLoans.map(loan => (
                    <div key={loan.id} className="p-3 bg-red-50/60 rounded-xl border border-red-100">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-bold text-gray-800">KES {(loan.amount || 0).toLocaleString()}</p>
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">Rejected</span>
                      </div>
                      <p className="text-xs text-gray-500 mb-2">Applied {moment(loan.application_date).format("MMM D, YYYY")} · {loan.duration_months} months</p>
                      {loan.rejection_reason && (
                        <div className="p-2.5 bg-white rounded-lg border border-red-200 text-xs">
                          <p className="font-semibold text-red-800">Reason for Rejection:</p>
                          <p className="text-red-700 italic mt-0.5">"{loan.rejection_reason}"</p>
                          {loan.rejected_by && <p className="text-[10px] text-gray-400 mt-1">Reviewed by {loan.rejected_by} on {loan.rejection_date}</p>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Contribution History */}
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
              <div className="bg-emerald-500 px-5 py-3 flex items-center justify-between">
                <h3 className="text-white font-semibold text-sm flex items-center gap-2"><Wallet size={15} /> Contribution History</h3>
                <Button size="sm" className="bg-white/20 hover:bg-white/30 text-white border-0 text-xs" onClick={() => setShowContribDialog(true)}>
                  <Plus size={13} className="mr-1" /> Contribute
                </Button>
              </div>
              {contributions.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500">Period</th>
                        <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500 hidden sm:table-cell">Date</th>
                        <th className="text-left py-2.5 px-4 text-xs font-medium text-gray-500">Status</th>
                        <th className="text-right py-2.5 px-4 text-xs font-medium text-gray-500">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contributions.map(c => (
                        <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="py-2.5 px-4 font-medium text-gray-700">{c.month} {c.year}</td>
                          <td className="py-2.5 px-4 text-gray-500 hidden sm:table-cell">{moment(c.date_paid).format("MMM D, YYYY")}</td>
                          <td className="py-2.5 px-4">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${c.status === "Verified" ? "bg-emerald-50 text-emerald-700" : c.status === "Rejected" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
                              {c.status || "Pending"}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-right font-semibold text-emerald-600">KES {(c.amount || 0).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-emerald-50">
                        <td colSpan={3} className="py-2 px-4 text-xs font-semibold text-emerald-800">Total</td>
                        <td className="py-2 px-4 text-right font-bold text-emerald-700">KES {totalContributions.toLocaleString()}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-8">No contributions yet</p>
              )}
            </div>

            {/* Fines & Penalties */}
            {fines.length > 0 && (
              <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-rose-100">
                <div className="bg-rose-600 px-5 py-3 flex items-center justify-between">
                  <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                    <AlertTriangle size={16} /> My Fines & Penalties
                  </h3>
                  <span className="text-xs bg-white/20 text-white px-2.5 py-0.5 rounded-full font-mono font-bold">
                    Unpaid: KES {totalUnpaidFineAmount.toLocaleString()}
                  </span>
                </div>
                <div className="divide-y divide-rose-50">
                  {fines.map(f => {
                    const isExemptPreJoin = memberJoinDate && f.date_issued && moment(f.date_issued).isBefore(memberJoinDate, "day");
                    return (
                      <div key={f.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-rose-50/30 transition-colors gap-2">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-gray-900">{f.reason}</p>
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold ${
                              f.status === "Paid" ? "bg-emerald-100 text-emerald-800" :
                              f.status === "Waived" ? "bg-gray-100 text-gray-600" :
                              isExemptPreJoin ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-800 border border-rose-200"
                            }`}>
                              {isExemptPreJoin && f.status === "Unpaid" ? "Exempt (Pre-Join)" : f.status}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500">
                            Issued: {moment(f.date_issued).format("MMM D, YYYY")}
                            {isExemptPreJoin && f.status === "Unpaid" && (
                              <span className="text-amber-700 italic font-medium ml-1">· Fine predates joining date ({moment(member.date_joined).format("MMM D, YYYY")})</span>
                            )}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold font-mono text-rose-700">KES {(f.amount || 0).toLocaleString()}</p>
                          {f.status === "Unpaid" && !isExemptPreJoin && (
                            <p className="text-[10px] text-rose-600 font-bold uppercase tracking-wider">Blocks Contributions & Repayments</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recent Repayments */}
            {repayments.length > 0 && (
              <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
                <div className="bg-blue-500 px-5 py-3">
                  <h3 className="text-white font-semibold text-sm flex items-center gap-2"><CreditCard size={15} /> Recent Repayments</h3>
                </div>
                <div className="divide-y divide-gray-50">
                  {repayments.slice(0, 10).map(r => (
                    <div key={r.id} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <p className="text-xs text-gray-500">{moment(r.payment_date).format("MMM D, YYYY")} · {r.payment_method}</p>
                        {r.balance_after !== undefined && <p className="text-xs text-gray-400">Balance after: KES {(r.balance_after || 0).toLocaleString()}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
        </div>

      {/* Loan Repayment Dialog */}
      <Dialog open={showRepayDialog} onOpenChange={setShowRepayDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Make Loan Repayment</DialogTitle></DialogHeader>
          {repayLoan && (
            <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-800 mb-1 space-y-0.5">
              <p>Balance: <strong>KES {(repayLoan.balance || 0).toLocaleString()}</strong></p>
              <p>Monthly installment: <strong>KES {(repayLoan.monthly_repayment || 0).toLocaleString()}</strong></p>
              {repayLoan.next_payment_date && <p>Next due: <strong>{moment(repayLoan.next_payment_date).format("MMM D, YYYY")}</strong></p>}
            </div>
          )}
          <div className="space-y-3">
            <div><label className="text-xs font-medium text-gray-600">Amount (KES) *</label><Input type="number" value={repayForm.amount} onChange={e => setRepayForm({ ...repayForm, amount: e.target.value })} /></div>
            <div>
              <label className="text-xs font-medium text-gray-600">Payment Method *</label>
              <Select value={repayForm.payment_method} onValueChange={v => setRepayForm({ ...repayForm, payment_method: v, transaction_ref: "", bank_name: "", bank_account: "", bank_branch: "" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="M-Pesa">M-Pesa</SelectItem>
                  <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                  <SelectItem value="Cash">Cash</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {repayForm.payment_method === "M-Pesa" && <div><label className="text-xs font-medium text-gray-600">M-Pesa Code *</label><Input placeholder="e.g. QJK8X7ABCD" value={repayForm.transaction_ref} onChange={e => setRepayForm({ ...repayForm, transaction_ref: e.target.value })} /></div>}
            {repayForm.payment_method === "Bank Transfer" && <>
              <div><label className="text-xs font-medium text-gray-600">Bank Name *</label><Input value={repayForm.bank_name} onChange={e => setRepayForm({ ...repayForm, bank_name: e.target.value })} /></div>
              <div><label className="text-xs font-medium text-gray-600">Account Number *</label><Input value={repayForm.bank_account} onChange={e => setRepayForm({ ...repayForm, bank_account: e.target.value })} /></div>
              <div><label className="text-xs font-medium text-gray-600">Branch</label><Input value={repayForm.bank_branch} onChange={e => setRepayForm({ ...repayForm, bank_branch: e.target.value })} /></div>
            </>}
            <div><label className="text-xs font-medium text-gray-600">Notes</label><Textarea rows={2} value={repayForm.notes} onChange={e => setRepayForm({ ...repayForm, notes: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowRepayDialog(false)}>Cancel</Button>
            <Button onClick={handleRepaySubmit} disabled={submittingRepay} className="bg-fuchsia-500 hover:bg-fuchsia-600">{submittingRepay ? "Submitting..." : "Submit Payment"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Contribution Dialog */}
      <Dialog open={showContribDialog} onOpenChange={setShowContribDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Make a Contribution</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Month *</label>
                <Select value={contribForm.month} onValueChange={v => setContribForm({ ...contribForm, month: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["January","February","March","April","May","June","July","August","September","October","November","December"].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><label className="text-xs font-medium text-gray-600">Year *</label><Input type="number" value={contribForm.year} onChange={e => setContribForm({ ...contribForm, year: e.target.value })} /></div>
            </div>
            <div><label className="text-xs font-medium text-gray-600">Amount (KES) *</label><Input type="number" value={contribForm.amount} onChange={e => setContribForm({ ...contribForm, amount: e.target.value })} /></div>
            <div>
              <label className="text-xs font-medium text-gray-600">Payment Method *</label>
              <Select value={contribForm.payment_method} onValueChange={v => setContribForm({ ...contribForm, payment_method: v, transaction_ref: "", bank_name: "", bank_account: "", bank_branch: "" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="M-Pesa">M-Pesa</SelectItem>
                  <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                  <SelectItem value="Cash">Cash</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {contribForm.payment_method === "M-Pesa" && <div><label className="text-xs font-medium text-gray-600">M-Pesa Code *</label><Input placeholder="e.g. QJK8X7ABCD" value={contribForm.transaction_ref} onChange={e => setContribForm({ ...contribForm, transaction_ref: e.target.value })} /></div>}
            {contribForm.payment_method === "Bank Transfer" && <>
              <div><label className="text-xs font-medium text-gray-600">Bank Name *</label><Input value={contribForm.bank_name} onChange={e => setContribForm({ ...contribForm, bank_name: e.target.value })} /></div>
              <div><label className="text-xs font-medium text-gray-600">Account Number *</label><Input value={contribForm.bank_account} onChange={e => setContribForm({ ...contribForm, bank_account: e.target.value })} /></div>
              <div><label className="text-xs font-medium text-gray-600">Branch</label><Input value={contribForm.bank_branch} onChange={e => setContribForm({ ...contribForm, bank_branch: e.target.value })} /></div>
            </>}
            <div><label className="text-xs font-medium text-gray-600">Evidence / Notes</label><Textarea rows={2} value={contribForm.evidence_notes} onChange={e => setContribForm({ ...contribForm, evidence_notes: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowContribDialog(false)}>Cancel</Button>
            <Button onClick={handleContribSubmit} disabled={submittingContrib} className="bg-fuchsia-500 hover:bg-fuchsia-600">{submittingContrib ? "Submitting..." : "Submit"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Loan Application Dialog */}
      <Dialog open={showLoanForm} onOpenChange={setShowLoanForm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Apply for a Loan</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div><label className="text-xs font-medium text-gray-600">Loan Amount (KES) *</label><Input type="number" placeholder="e.g. 10000" value={loanForm.amount} onChange={e => setLoanForm({ ...loanForm, amount: e.target.value })} /></div>
            <div><label className="text-xs font-medium text-gray-600">Duration (months)</label><Input type="number" min={1} value={loanForm.duration_months} onChange={e => setLoanForm({ ...loanForm, duration_months: parseInt(e.target.value) || 1 })} /></div>
            {loanForm.amount && parseFloat(loanForm.amount) > 0 && (() => {
              const { total, interest, monthly } = calcLoanTotals(parseFloat(loanForm.amount), loanForm.duration_months);
              return (
                <div className="bg-emerald-50 rounded-lg p-3 text-sm space-y-1">
                  <p className="text-xs text-emerald-700 font-medium">10% compounded monthly</p>
                  <p className="text-gray-600">Interest: <span className="font-semibold">KES {interest.toLocaleString()}</span></p>
                  <p className="text-gray-600">Total to repay: <span className="font-semibold">KES {total.toLocaleString()}</span></p>
                  <p className="text-gray-600">Monthly: <span className="font-semibold">KES {monthly.toLocaleString()}</span></p>
                </div>
              );
            })()}
            <div><label className="text-xs font-medium text-gray-600">Purpose</label><Textarea rows={2} value={loanForm.purpose} onChange={e => setLoanForm({ ...loanForm, purpose: e.target.value })} /></div>
            <div><label className="text-xs font-medium text-gray-600">Guarantor</label><Input value={loanForm.guarantor} onChange={e => setLoanForm({ ...loanForm, guarantor: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowLoanForm(false)}>Cancel</Button>
            <Button onClick={handleLoanApply} disabled={applying} className="bg-fuchsia-500 hover:bg-fuchsia-600">{applying ? "Submitting..." : "Submit Application"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Profile Change Request Confirmation Dialog */}
      <Dialog open={!!editingField} onOpenChange={open => { if (!open) setEditingField(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-fuchsia-700">
              <Edit3 size={18} />
              Request Profile Update
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="bg-amber-50 rounded-xl p-3 text-xs text-amber-800 border border-amber-200">
              <p className="font-semibold flex items-center gap-1"><Clock size={13} /> Requires Admin Verification</p>
              <p className="mt-1 text-amber-700">For financial security, your change request will be submitted as 🟡 <strong>Pending Verification</strong> until reviewed by an administrator.</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 uppercase">
                {editingField === "phone" && "Phone Number"}
                {editingField === "email" && "Email Address"}
                {editingField === "address" && "Postal / Residential Address"}
                {editingField === "next_of_kin" && "Next of Kin / Contact Details"}
                {editingField === "occupation" && "Occupation / Business Info"}
                {editingField === "photo_url" && "Profile Photo"}
              </label>

              {editingField === "photo_url" ? (
                <div className="mt-2 text-center space-y-3">
                  <div className="w-24 h-24 mx-auto rounded-2xl border-2 border-fuchsia-300 overflow-hidden shadow-md bg-fuchsia-50">
                    <img src={editValue} alt="Selected Profile" className="w-full h-full object-cover" />
                  </div>
                  <p className="text-xs text-gray-500">Selected photo preview. Click submit to request admin verification.</p>
                </div>
              ) : (
                <Input
                  className="mt-1.5"
                  placeholder="Enter new value"
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                />
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setEditingField(null)}>Cancel</Button>
            <Button onClick={handleProfileChangeSubmit} disabled={submittingProfileRequest} className="bg-fuchsia-600 hover:bg-fuchsia-700">
              {submittingProfileRequest ? "Submitting..." : "Submit Change Request"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── MY PROFILE MODAL DIALOG (Triggered by Top Right Avatar Button) ─── */}
      <Dialog open={showProfileModal} onOpenChange={setShowProfileModal}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0 rounded-2xl">
          {/* Hidden File Input for Device Photo Selection */}
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            onChange={handlePhotoFileUpload}
            className="hidden"
          />

          <div className="bg-gradient-to-r from-fuchsia-600 to-pink-600 px-6 py-4 flex items-center justify-between text-white sticky top-0 z-10">
            <div className="flex items-center gap-2">
              <UserCircle size={22} />
              <h2 className="text-base font-bold tracking-wide uppercase">MY PROFILE</h2>
            </div>
            <span className="text-xs bg-white/20 px-3 py-1 rounded-full backdrop-blur-sm font-medium">
              Member Self-Service
            </span>
          </div>

          <div className="p-6 space-y-6">
            {/* Profile Photo & Device Upload Header */}
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 pb-6 border-b border-gray-100">
              <div className="relative group">
                <div className="w-24 h-24 rounded-2xl bg-fuchsia-100 border-2 border-fuchsia-300 flex items-center justify-center overflow-hidden shadow-md">
                  {member?.photo_url ? (
                    <img src={member.photo_url} alt={member.full_name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-4xl font-black text-fuchsia-600">{member?.full_name?.charAt(0)}</span>
                  )}
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-2 -right-2 bg-fuchsia-600 text-white p-2 rounded-full shadow-lg hover:bg-fuchsia-700 transition-transform hover:scale-110 cursor-pointer"
                  title="Upload New Photo from Device"
                >
                  <Camera size={15} />
                </button>
              </div>

              <div className="flex-1 text-center sm:text-left space-y-2">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <h3 className="text-xl font-bold text-gray-900">{member?.full_name}</h3>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 size={12} /> {member?.status || "Active"}
                  </span>
                  {isLeader && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                      <Shield size={12} /> {member?.role}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  Member ID: <span className="font-mono font-semibold text-gray-700">{member?.id_number || member?.id?.slice(0, 8) || "TB-MEMBER"}</span> · Joined {member?.date_joined ? moment(member.date_joined).format("MMM D, YYYY") : "N/A"}
                </p>

                {/* Direct Upload Button from Device */}
                <div className="pt-1 flex justify-center sm:justify-start">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="border-fuchsia-200 text-fuchsia-700 hover:bg-fuchsia-50 text-xs font-semibold rounded-lg flex items-center gap-1.5"
                  >
                    <Upload size={14} /> Upload Photo from Device
                  </Button>
                </div>
              </div>
            </div>

            {/* Controlled Fields Grid */}
            <div>
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                Account Information & Controlled Fields
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* NON-EDITABLE FIELDS (Controlled by Admin/Treasurer) */}
                <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-200/80 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-400 font-medium">Member ID / No.</p>
                    <p className="text-sm font-semibold text-gray-800 font-mono mt-0.5">{member?.id_number || member?.id?.slice(0, 8) || "TB-MEMBER"}</p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-400 bg-gray-200/60 px-2 py-0.5 rounded-md">
                    <Lock size={12} /> Read-only
                  </div>
                </div>

                <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-200/80 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-400 font-medium">Full Name</p>
                    <p className="text-sm font-semibold text-gray-800 mt-0.5">{member?.full_name}</p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-400 bg-gray-200/60 px-2 py-0.5 rounded-md">
                    <Lock size={12} /> Admin only
                  </div>
                </div>

                <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-200/80 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-400 font-medium">Date Joined</p>
                    <p className="text-sm font-semibold text-gray-800 mt-0.5">{member?.date_joined ? moment(member.date_joined).format("MMMM D, YYYY") : "N/A"}</p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-400 bg-gray-200/60 px-2 py-0.5 rounded-md">
                    <Lock size={12} /> Fixed
                  </div>
                </div>

                <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-200/80 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-400 font-medium">Membership Status</p>
                    <p className="text-sm font-semibold text-emerald-600 mt-0.5">{member?.status || "Active"}</p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-400 bg-gray-200/60 px-2 py-0.5 rounded-md">
                    <Lock size={12} /> Admin status
                  </div>
                </div>

                {/* EDITABLE FIELDS (Requires Approval Workflow) */}
                {/* Phone Number */}
                <div className="bg-white rounded-xl p-3.5 border border-gray-200 hover:border-fuchsia-300 transition-colors flex items-start justify-between shadow-sm">
                  <div className="flex items-start gap-2.5">
                    <div className="p-2 bg-fuchsia-50 rounded-lg text-fuchsia-600 mt-0.5"><Phone size={15} /></div>
                    <div>
                      <p className="text-xs text-gray-400 font-medium">Phone Number</p>
                      <p className="text-sm font-semibold text-gray-900 mt-0.5">{member?.phone || "Not set"}</p>
                      {pendingForField("phone") && (
                        <div className="mt-1.5 flex items-center gap-1 bg-amber-50 text-amber-700 text-xs px-2 py-0.5 rounded-full border border-amber-200 font-medium">
                          <Clock size={11} className="animate-spin text-amber-500" />
                          <span>🟡 Pending verification: {pendingForField("phone").new_value}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => { setEditingField("phone"); setEditValue(member?.phone || ""); }}
                    className="text-fuchsia-600 hover:bg-fuchsia-50 p-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs font-semibold cursor-pointer"
                    title="Edit Phone Number"
                  >
                    <Edit3 size={14} /> Edit
                  </button>
                </div>

                {/* Email Address */}
                <div className="bg-white rounded-xl p-3.5 border border-gray-200 hover:border-fuchsia-300 transition-colors flex items-start justify-between shadow-sm">
                  <div className="flex items-start gap-2.5">
                    <div className="p-2 bg-blue-50 rounded-lg text-blue-600 mt-0.5"><Mail size={15} /></div>
                    <div>
                      <p className="text-xs text-gray-400 font-medium">Email Address</p>
                      <p className="text-sm font-semibold text-gray-900 mt-0.5">{member?.email || member?.user_email || "Not set"}</p>
                      {pendingForField("email") && (
                        <div className="mt-1.5 flex items-center gap-1 bg-amber-50 text-amber-700 text-xs px-2 py-0.5 rounded-full border border-amber-200 font-medium">
                          <Clock size={11} className="animate-spin text-amber-500" />
                          <span>🟡 Pending verification: {pendingForField("email").new_value}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => { setEditingField("email"); setEditValue(member?.email || member?.user_email || ""); }}
                    className="text-fuchsia-600 hover:bg-fuchsia-50 p-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs font-semibold cursor-pointer"
                    title="Edit Email Address"
                  >
                    <Edit3 size={14} /> Edit
                  </button>
                </div>

                {/* Postal / Residential Address */}
                <div className="bg-white rounded-xl p-3.5 border border-gray-200 hover:border-fuchsia-300 transition-colors flex items-start justify-between shadow-sm">
                  <div className="flex items-start gap-2.5">
                    <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600 mt-0.5"><MapPin size={15} /></div>
                    <div>
                      <p className="text-xs text-gray-400 font-medium">Postal / Residential Address</p>
                      <p className="text-sm font-semibold text-gray-900 mt-0.5">{member?.address || "Not set"}</p>
                      {pendingForField("address") && (
                        <div className="mt-1.5 flex items-center gap-1 bg-amber-50 text-amber-700 text-xs px-2 py-0.5 rounded-full border border-amber-200 font-medium">
                          <Clock size={11} className="animate-spin text-amber-500" />
                          <span>🟡 Pending verification: {pendingForField("address").new_value}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => { setEditingField("address"); setEditValue(member?.address || ""); }}
                    className="text-fuchsia-600 hover:bg-fuchsia-50 p-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs font-semibold cursor-pointer"
                    title="Edit Address"
                  >
                    <Edit3 size={14} /> Edit
                  </button>
                </div>

                {/* Next of Kin / Contact Details */}
                <div className="bg-white rounded-xl p-3.5 border border-gray-200 hover:border-fuchsia-300 transition-colors flex items-start justify-between shadow-sm">
                  <div className="flex items-start gap-2.5">
                    <div className="p-2 bg-rose-50 rounded-lg text-rose-600 mt-0.5"><HeartHandshake size={15} /></div>
                    <div>
                      <p className="text-xs text-gray-400 font-medium">Next of Kin / Contact Details</p>
                      <p className="text-sm font-semibold text-gray-900 mt-0.5">{member?.next_of_kin || "Not set"}</p>
                      {pendingForField("next_of_kin") && (
                        <div className="mt-1.5 flex items-center gap-1 bg-amber-50 text-amber-700 text-xs px-2 py-0.5 rounded-full border border-amber-200 font-medium">
                          <Clock size={11} className="animate-spin text-amber-500" />
                          <span>🟡 Pending verification: {pendingForField("next_of_kin").new_value}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => { setEditingField("next_of_kin"); setEditValue(member?.next_of_kin || ""); }}
                    className="text-fuchsia-600 hover:bg-fuchsia-50 p-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs font-semibold cursor-pointer"
                    title="Edit Next of Kin"
                  >
                    <Edit3 size={14} /> Edit
                  </button>
                </div>

                {/* Occupation / Business Info */}
                <div className="bg-white rounded-xl p-3.5 border border-gray-200 hover:border-fuchsia-300 transition-colors flex items-start justify-between shadow-sm md:col-span-2">
                  <div className="flex items-start gap-2.5">
                    <div className="p-2 bg-amber-50 rounded-lg text-amber-600 mt-0.5"><Briefcase size={15} /></div>
                    <div>
                      <p className="text-xs text-gray-400 font-medium">Occupation / Business Info</p>
                      <p className="text-sm font-semibold text-gray-900 mt-0.5">{member?.occupation || "Not set"}</p>
                      {pendingForField("occupation") && (
                        <div className="mt-1.5 flex items-center gap-1 bg-amber-50 text-amber-700 text-xs px-2 py-0.5 rounded-full border border-amber-200 font-medium">
                          <Clock size={11} className="animate-spin text-amber-500" />
                          <span>🟡 Pending verification: {pendingForField("occupation").new_value}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => { setEditingField("occupation"); setEditValue(member?.occupation || ""); }}
                    className="text-fuchsia-600 hover:bg-fuchsia-50 p-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs font-semibold cursor-pointer"
                    title="Edit Occupation"
                  >
                    <Edit3 size={14} /> Edit
                  </button>
                </div>
              </div>
            </div>

            {/* Profile Change Request Audit Log */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
              <div className="bg-gray-800 px-5 py-3 flex items-center justify-between text-white">
                <h3 className="font-semibold text-xs uppercase tracking-wider flex items-center gap-2">
                  <Clock size={14} className="text-amber-400" /> Profile Change Audit Log & Requests
                </h3>
                <span className="text-[10px] text-gray-400 font-mono">Security Audit Trail</span>
              </div>
              {profileRequests.length > 0 ? (
                <div className="divide-y divide-gray-100 text-xs">
                  {profileRequests.map(req => (
                    <div key={req.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-gray-50">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-800">{req.field_label || req.field_key}</span>
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            req.status === "Approved" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                            req.status === "Rejected" ? "bg-red-50 text-red-700 border border-red-200" :
                            "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}>
                            {req.status === "Pending" ? "🟡 Pending Verification" : req.status === "Approved" ? "🟢 Approved" : "🔴 Rejected"}
                          </span>
                        </div>
                        <div className="mt-1 text-gray-500 space-y-0.5">
                          <p>
                            Old: <span className="font-mono text-gray-400 line-through mr-2">{req.old_value ? (req.old_value.length > 30 ? req.old_value.slice(0, 30) + '...' : req.old_value) : "(empty)"}</span>
                            New: <span className="font-mono font-bold text-fuchsia-700">{req.new_value ? (req.new_value.length > 30 ? req.new_value.slice(0, 30) + '...' : req.new_value) : ""}</span>
                          </p>
                          <p className="text-[10px] text-gray-400">Requested: {moment(req.request_date).format("D MMM YYYY, h:mm A")}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 text-center py-5">No profile change requests recorded.</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Member Detail Dialog — transparency: view any member's financials */}
      <MemberDetailDialog member={detailMember} onClose={() => setDetailMember(null)} />
    </div>
  );
}
