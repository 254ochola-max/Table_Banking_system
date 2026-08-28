import React, { useState, useEffect } from "react";
import { Link, useOutletContext, Navigate } from "react-router-dom";
import { api, supabase } from "@/api/supabaseClient";
import { useAuth } from "@/lib/AuthContext";
import { Users, Wallet, HandCoins, AlertTriangle, Trash2, Loader2, UserCircle } from "lucide-react";
import StatCard from "@/components/shared/StatCard";
import BrandLogo from "@/components/shared/BrandLogo";
import MemberAvatar from "@/components/shared/MemberAvatar";
import SavingsTargetChart from "@/components/dashboard/SavingsTargetChart";
import GroupSummaryTableWidget from "@/components/dashboard/GroupSummaryTableWidget";
import { Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import moment from "moment";

const COLORS = ["#D946EF", "#22C55E", "#F59E0B", "#dc2626", "#7c3aed"];

export default function Dashboard() {
  const outletContext = useOutletContext();
  const outletAdmin = Boolean(outletContext?.role === "admin" || outletContext?.isAdmin);
  const { user } = useAuth();
  const [members, setMembers] = useState([]);
  const [contributions, setContributions] = useState([]);
  const [loans, setLoans] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [summaryRows, setSummaryRows] = useState([]);
  const [fines, setFines] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [checkingFines, setCheckingFines] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetSelections, setResetSelections] = useState({
    contributions: true,
    loans: true,
    repayments: true,
    fines: true,
    transactions: true,
    summaryTable: true,
    profileRequests: true,
    resetMemberSavings: true,
  });
  const [currentMember, setCurrentMember] = useState(null);
  const { toast } = useToast();

  const toggleSelectAllReset = (val) => {
    setResetSelections({
      contributions: val,
      loans: val,
      repayments: val,
      fines: val,
      transactions: val,
      summaryTable: val,
      profileRequests: val,
      resetMemberSavings: val,
    });
  };

  const loadDashboard = async () => {
    try {
      const [m, c, l, t, s, me, sr, f] = await Promise.all([
        api.entities.Member.list(),
        api.entities.Contribution.list("-date_paid", 200),
        api.entities.Loan.list(),
        api.entities.Transaction.list("-date", 500),
        api.entities.GroupSettings.list(),
        api.auth.me(),
        api.entities.GroupSummaryTable.list("row_order", 50),
        api.entities.Fine.list(),
      ]);
      setMembers(m);
      setContributions(c);
      setLoans(l);
      setTransactions(t);
      setSummaryRows(sr.sort((a, b) => a.row_order - b.row_order));
      setFines(f);
      setSettings(s[0] || null);
      setIsAdmin(Boolean(me?.role === "admin" || outletAdmin));
      if (me?.email) {
        const linked = m.find(
          mem => mem.user_email?.toLowerCase() === me.email?.toLowerCase() ||
                 mem.email?.toLowerCase() === me.email?.toLowerCase()
        );
        setCurrentMember(linked || null);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => { loadDashboard(); }, []);

  const isEffectiveAdmin = Boolean(isAdmin || outletAdmin);

  const handleOpenResetDialog = () => {
    if (!isEffectiveAdmin) {
      toast({
        title: "Access Denied",
        description: "Only administrators can reset data.",
        variant: "destructive",
      });
      return;
    }
    setShowResetDialog(true);
  };

  const handleReset = async () => {
    if (!isEffectiveAdmin) {
      toast({
        title: "Access Denied",
        description: "Only administrators can reset data.",
        variant: "destructive",
      });
      return;
    }
    const ops = [];
    if (resetSelections.contributions) {
      ops.push(api.entities.Contribution.deleteMany({}));
      localStorage.removeItem("deborahs_local_Contribution");
    }
    if (resetSelections.loans) {
      ops.push(api.entities.Loan.deleteMany({}));
      localStorage.removeItem("deborahs_local_Loan");
    }
    if (resetSelections.repayments) {
      ops.push(api.entities.Repayment.deleteMany({}));
      localStorage.removeItem("deborahs_local_Repayment");
    }
    if (resetSelections.fines) {
      ops.push(api.entities.Fine.deleteMany({}));
      localStorage.removeItem("deborahs_local_Fine");
    }
    if (resetSelections.transactions) {
      ops.push(api.entities.Transaction.deleteMany({}));
      localStorage.removeItem("deborahs_local_Transaction");
    }
    if (resetSelections.summaryTable) {
      ops.push(api.entities.GroupSummaryTable.deleteMany({}));
      localStorage.removeItem("deborahs_local_GroupSummaryTable");
    }
    if (resetSelections.profileRequests) {
      ops.push(api.entities.ProfileChangeRequest.deleteMany({}));
      localStorage.removeItem("deborahs_local_ProfileChangeRequest");
    }

    if (ops.length === 0 && !resetSelections.resetMemberSavings) return;
    setResetting(true);

    try {
      if (ops.length > 0) {
        await Promise.all(ops);
      }

      // Reset member savings & shares totals to zero when selected
      if ((resetSelections.resetMemberSavings || resetSelections.contributions) && members.length > 0) {
        await api.entities.Member.bulkUpdate(
          members.map(m => ({ id: m.id, total_savings: 0, total_shares: 0 }))
        );
      }

      setShowResetDialog(false);
      toast({ title: "Selected data cleared and dashboard reset to 0." });
      await loadDashboard();
    } catch (e) {
      console.error(e);
      toast({ title: "Reset failed", description: e.message, variant: "destructive" });
    }
    setResetting(false);
  };

  const handleFineCheck = async () => {
    setCheckingFines(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const now = new Date();
      const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
      const currentMonth = MONTHS[now.getMonth()];
      const currentYear = now.getFullYear();

      const [activeMembers, allContribs, activeLoans, allFines, settings] = await Promise.all([
        api.entities.Member.filter({ status: "Active" }),
        api.entities.Contribution.list(),
        api.entities.Loan.filter({ status: "Active" }),
        api.entities.Fine.list(),
        api.entities.GroupSettings.list(),
      ]);

      const fineAmount = settings[0]?.late_payment_fine || 200;
      const newFines = [];

      // 1. Late contribution fine — missing monthly contribution
      for (const m of activeMembers) {
        const hasContrib = allContribs.some(c =>
          c.member_id === m.id && c.month === currentMonth && c.year === currentYear && c.status !== "Rejected"
        );
        if (!hasContrib) {
          const reason = `Late contribution fine - ${currentMonth} ${currentYear}`;
          const alreadyFined = allFines.some(f => f.member_id === m.id && f.reason === reason);
          if (!alreadyFined) {
            newFines.push({ member_id: m.id, member_name: m.full_name, reason, amount: fineAmount, status: "Unpaid", date_issued: today });
          }
        }
      }

      // 2. Late loan repayment fine — past due next_payment_date
      for (const loan of activeLoans) {
        if (loan.next_payment_date && loan.next_payment_date < today && (loan.balance || 0) > 0) {
          const reason = `Late loan repayment fine - due ${loan.next_payment_date}`;
          const alreadyFined = allFines.some(f => f.member_id === loan.member_id && f.reason === reason);
          if (!alreadyFined) {
            newFines.push({ member_id: loan.member_id, member_name: loan.member_name, reason, amount: fineAmount, status: "Unpaid", date_issued: today });
          }
        }
      }

      if (newFines.length > 0) {
        await api.entities.Fine.bulkCreate(newFines);
      }
      toast({ title: newFines.length > 0 ? `${newFines.length} fines applied` : "No overdue items found" });
    } catch (e) {
      toast({ title: "Fine check failed", variant: "destructive" });
    }
    setCheckingFines(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-fuchsia-200 border-t-fuchsia-500 rounded-full animate-spin" />
      </div>
    );
  }

  // Derive totals from the Group Summary Table (admin/leader edited values)
  const sumRowTotal = (label) => {
    const row = summaryRows.find(r => r.row_label === label);
    if (!row || !row.values) return 0;
    return Object.values(row.values).reduce((s, v) => s + (typeof v === "number" ? v : 0), 0);
  };
  const summarySavings = sumRowTotal("Table Banking") + sumRowTotal("Shares");
  const summaryLoanAmount = sumRowTotal("Loan Amount");
  const summaryInterest = sumRowTotal("Interest");
  const hasSummaryData = summarySavings > 0 || summaryLoanAmount > 0;

  const totalSavings = hasSummaryData ? summarySavings : contributions.reduce((s, c) => s + (c.amount || 0), 0);

  // Fines & penalties collected (paid fines only).
  // Also includes "Fine Payment" transactions to capture fines that were
  // marked paid before the status-update fix (they were deleted and logged
  // only as transactions). We deduplicate by taking the max of the two sources.
  const finesFromRecords = fines.filter(f => f.status === "Paid").reduce((s, f) => s + (f.amount || 0), 0);
  const finesFromTransactions = transactions.filter(t => t.type === "Fine Payment").reduce((s, t) => s + (t.amount || 0), 0);
  const finesCollected = Math.max(finesFromRecords, finesFromTransactions);

  // Loans disbursed (principal) and their processing fees (interest), excluding pending/rejected
  const disbursedLoans = loans.filter(l => l.status !== "Pending" && l.status !== "Rejected");
  const actualLoanPrincipal = disbursedLoans.reduce((s, l) => s + (l.amount || 0), 0);
  const actualProcessingFees = disbursedLoans.reduce((s, l) => s + (l.interest_amount || 0), 0);

  const loanPrincipal = hasSummaryData ? summaryLoanAmount : actualLoanPrincipal;
  const processingFees = hasSummaryData ? summaryInterest : actualProcessingFees;

  // Total Savings Balance = contributions + shares + fines collected - loan principal disbursed
  // (interest is excluded: it's owed on top of the principal, not cash that left the pool)
  const totalSavingsBalance = totalSavings + finesCollected - loanPrincipal;

  const activeLoans = loans.filter(l => (l.status === "Active" || l.status === "Approved") && (l.balance === undefined || l.balance > 0) && l.status !== "Fully Paid");
  const activeLoansBalance = activeLoans.reduce((s, l) => s + (l.balance !== undefined ? (l.balance || 0) : (l.total_amount || 0)), 0);
  const totalRepaid = activeLoans.reduce((s, l) => s + (l.amount_repaid || 0), 0);
  const pendingLoans = loans.filter(l => l.status === "Pending").length;
  const activeMembers = members.filter(m => m.status === "Active").length;

  if (!loading && !isEffectiveAdmin) {
    if (!currentMember || currentMember.status !== "Active") {
      return <Navigate to="/portal" replace />;
    }
  }

  const monthlyTarget = settings?.monthly_savings_target || (members.filter(m => m.status === "Active").length * (settings?.monthly_contribution || 1000));

  // Build monthly savings vs target chart data
  const MONTH_ORDER = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const monthlyData = {};
  contributions.forEach(c => {
    const key = `${c.month?.slice(0, 3)} ${c.year}`;
    if (!monthlyData[key]) monthlyData[key] = { name: key, actual: 0, month: c.month, year: c.year };
    monthlyData[key].actual += (c.amount || 0);
  });
  // Sort chronologically
  const sortedMonths = Object.values(monthlyData).sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return MONTH_ORDER.indexOf(a.month) - MONTH_ORDER.indexOf(b.month);
  });
  let cumulative = 0;
  const chartData = sortedMonths.slice(-6).map(d => {
    cumulative += d.actual;
    return { ...d, target: monthlyTarget, cumulative };
  });

  // Loan status pie
  const statusCounts = {};
  loans.forEach(l => {
    statusCounts[l.status] = (statusCounts[l.status] || 0) + 1;
  });
  const pieData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));

  const allResetSelected = Object.values(resetSelections).every(Boolean);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto min-h-full">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <BrandLogo size={56} />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 font-heading">Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">Overview of your table banking group</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {(currentMember || !isAdmin) && (
            <Link to="/portal">
              <button className="flex items-center gap-3 p-2 pl-2.5 pr-5 rounded-2xl bg-white border-2 border-fuchsia-200 hover:border-fuchsia-500 hover:bg-fuchsia-50/50 text-fuchsia-900 shadow-md hover:shadow-lg transition-all group cursor-pointer">
                <MemberAvatar
                  photoUrl={currentMember?.photo_url}
                  name={currentMember?.full_name}
                  size="md"
                  ring
                />
                <div className="flex flex-col text-left">
                  <span className="text-[10px] font-black tracking-widest text-fuchsia-600 uppercase">
                    My Account
                  </span>
                  <span className="text-xs font-bold text-gray-900 group-hover:text-fuchsia-700 transition-colors max-w-[120px] truncate">
                    {currentMember?.full_name || "View Profile"}
                  </span>
                </div>
              </button>
            </Link>
          )}
          {isEffectiveAdmin && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleFineCheck} disabled={checkingFines} className="text-amber-600 border-amber-200 hover:bg-amber-50 hover:text-amber-700">
                {checkingFines ? <Loader2 size={15} className="mr-1.5 animate-spin" /> : <AlertTriangle size={15} className="mr-1.5" />} Run Fine Check
              </Button>
              <Button variant="outline" onClick={handleOpenResetDialog} className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700">
                <Trash2 size={15} className="mr-1.5" /> Reset Data
              </Button>
            </div>
          )}
        </div>
      </div>

      {isEffectiveAdmin && (
        <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle size={18} /> Reset Dashboard & Financial Data
              </DialogTitle>
              <DialogDescription className="pt-2 text-xs">
                Choose specifically which data categories to permanently delete. Member account profiles will be preserved.
              </DialogDescription>

              <div className="flex items-center justify-between pt-2 pb-1 border-b border-gray-100">
                <span className="text-xs font-bold text-gray-700">Select Categories to Clear:</span>
                <button
                  type="button"
                  onClick={() => toggleSelectAllReset(!allResetSelected)}
                  className="text-xs text-red-600 font-bold hover:underline cursor-pointer"
                >
                  {allResetSelected ? "Deselect All" : "Select All"}
                </button>
              </div>

              <div className="mt-2 space-y-2 max-h-60 overflow-y-auto pr-1">
                {[
                  { key: "contributions", label: "Contributions" },
                  { key: "loans", label: "Loans (Active, Pending & Rejected)" },
                  { key: "repayments", label: "Loan Repayments" },
                  { key: "fines", label: "Fines & Penalties" },
                  { key: "transactions", label: "Financial Transactions Audit Logs" },
                  { key: "summaryTable", label: "Group Summary Table Rows" },
                  { key: "profileRequests", label: "Profile Audit Change Requests" },
                  { key: "resetMemberSavings", label: "Reset Member Savings & Shares to KES 0" },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2.5 text-xs text-gray-700 hover:bg-red-50/50 p-1.5 rounded-lg cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={Boolean(resetSelections[key])}
                      onChange={e => setResetSelections(prev => ({ ...prev, [key]: e.target.checked }))}
                      className="w-4 h-4 accent-red-600 rounded"
                    />
                    <span className="font-medium">{label}</span>
                  </label>
                ))}
              </div>
              <p className="mt-3 text-xs font-semibold text-red-600">⚠️ Selected items will be deleted permanently. This cannot be undone.</p>
            </DialogHeader>
            <DialogFooter className="mt-2">
              <Button variant="outline" onClick={() => setShowResetDialog(false)} disabled={resetting}>Cancel</Button>
              <Button onClick={handleReset} disabled={resetting || !Object.values(resetSelections).some(Boolean)} className="bg-red-600 hover:bg-red-700 text-white">
                {resetting ? "Clearing..." : "Delete Selected Data"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
        <StatCard title="Active Members" value={activeMembers} icon={Users} color="emerald" subtitle={`${members.length} total`} />
        <StatCard title="Total Savings Balance" value={`KES ${totalSavingsBalance.toLocaleString()}`} icon={Wallet} color="blue" subtitle="Contributions + Fines - Loans" />
        <StatCard title="Active Loans" value={`KES ${activeLoansBalance.toLocaleString()}`} icon={HandCoins} color="amber" subtitle={`${activeLoans.length} active loans`} />
        <StatCard title="Pending Approvals" value={pendingLoans} icon={AlertTriangle} color="rose" />
      </div>

      {/* Savings vs Target Chart — full width */}
      <div className="mb-6">
        <SavingsTargetChart
          chartData={chartData}
          monthlyTarget={monthlyTarget}
          cumulativeTarget={chartData.length * monthlyTarget}
          totalSavedOverride={hasSummaryData ? summarySavings : null}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Loan Status Distribution</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-400 text-center py-12">No loan data yet</p>
          )}
        </div>
      </div>

      {/* Group Summary Table */}
      <div className="mb-6">
        <GroupSummaryTableWidget isAdmin={isAdmin} onDataChange={loadDashboard} />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Recent Transactions</h3>
        {transactions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Member</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-gray-500 uppercase">Amount</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(t => {
                  const m = members.find(x => x.id === t.member_id || x.full_name === t.member_name);
                  return (
                    <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2.5 px-3 text-gray-600">{moment(t.date).format("MMM D, YYYY")}</td>
                      <td className="py-2.5 px-3 font-medium text-gray-800">
                        <div className="flex items-center gap-2">
                          <MemberAvatar photoUrl={m?.photo_url} name={t.member_name} size="xs" />
                          <span>{t.member_name}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          t.type === "Contribution" ? "bg-emerald-50 text-emerald-700" :
                          t.type === "Loan Repayment" ? "bg-blue-50 text-blue-700" :
                          t.type === "Fine" ? "bg-red-50 text-red-700" :
                          "bg-gray-100 text-gray-700"
                        }`}>
                          {t.type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium">KES {(t.amount || 0).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-8">No transactions recorded yet</p>
        )}
      </div>
    </div>
  );
}
