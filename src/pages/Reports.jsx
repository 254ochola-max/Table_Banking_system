import React, { useState, useEffect } from "react";
import { api } from "@/api/supabaseClient";
import { Download, Users, Wallet, HandCoins, History, Search, Clock, XCircle, ShieldAlert, AlertTriangle, UserX } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import StatCard from "@/components/shared/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import moment from "moment";

export default function Reports() {
  const [members, setMembers] = useState([]);
  const [contributions, setContributions] = useState([]);
  const [loans, setLoans] = useState([]);
  const [repayments, setRepayments] = useState([]);
  const [fines, setFines] = useState([]);
  const [profileRequests, setProfileRequests] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [auditSearch, setAuditSearch] = useState("");
  const [auditFilter, setAuditFilter] = useState("all");
  const [delinquentSearch, setDelinquentSearch] = useState("");

  useEffect(() => {
    async function load() {
      const [m, c, l, r, f, pr, t] = await Promise.all([
        api.entities.Member.list(),
        api.entities.Contribution.list("-date_paid", 200),
        api.entities.Loan.list("-application_date", 200),
        api.entities.Repayment.list("-payment_date", 200),
        api.entities.Fine.list(),
        api.entities.ProfileChangeRequest.list("-request_date", 200),
        api.entities.Transaction.list("-date", 200),
      ]);
      setMembers(m);
      setContributions(c);
      setLoans(l);
      setRepayments(r);
      setFines(f);
      setProfileRequests(pr);
      setTransactions(t);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-fuchsia-200 border-t-fuchsia-500 rounded-full animate-spin" />
      </div>
    );
  }

  const totalContributions = contributions.reduce((s, c) => s + (c.amount || 0), 0);
  const totalLoaned = loans.filter(l => l.status !== "Pending" && l.status !== "Rejected").reduce((s, l) => s + (l.amount || 0), 0);
  const totalRepaid = repayments.reduce((s, r) => s + (r.amount || 0), 0);
  const totalInterest = loans.filter(l => l.status !== "Pending" && l.status !== "Rejected").reduce((s, l) => s + (l.interest_amount || 0), 0);
  const totalFines = fines.reduce((s, f) => s + (f.amount || 0), 0);
  const outstandingLoans = loans.filter(l => l.status === "Active").reduce((s, l) => s + (l.balance || 0), 0);

  // Monthly contribution trend
  const monthlyContrib = {};
  contributions.forEach(c => {
    const key = `${c.month?.slice(0, 3)} ${c.year}`;
    monthlyContrib[key] = (monthlyContrib[key] || 0) + (c.amount || 0);
  });
  const contribChart = Object.entries(monthlyContrib).slice(-12).map(([name, amount]) => ({ name, amount }));

  // Member contributions ranking
  const memberContrib = {};
  contributions.forEach(c => {
    memberContrib[c.member_name] = (memberContrib[c.member_name] || 0) + (c.amount || 0);
  });
  const memberRanking = Object.entries(memberContrib)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, total]) => ({ name, total }));

  // Build Unified Audit Trail
  const auditTrail = [];
  const today = moment();

  // 1. Profile Change Requests Audit Logs
  profileRequests.forEach(req => {
    auditTrail.push({
      id: `profile-${req.id}`,
      type: "Profile Audit",
      timestamp: req.request_date || req.created_at,
      actor: req.member_name || "Member",
      action: `Profile change request (${req.field_label || req.field_key})`,
      details: `Changed ${req.field_label || req.field_key}: "${req.old_value || 'empty'}" ➔ "${req.new_value}"`,
      status: req.status || "Pending",
      reviewer: req.reviewed_by ? `Reviewed by ${req.reviewed_by}` : null,
      raw: req,
    });
  });

  // 2. Financial Transactions Audit Logs
  transactions.forEach(t => {
    auditTrail.push({
      id: `tx-${t.id}`,
      type: "Financial Audit",
      timestamp: t.date || t.created_at,
      actor: t.member_name || "System",
      action: `${t.type} recorded`,
      details: `${t.description || t.type} — KES ${(t.amount || 0).toLocaleString()}`,
      status: "Completed",
      reviewer: "System Verified",
      raw: t,
    });
  });

  // 3. Loan Governance Approval Audit Logs
  loans.forEach(loan => {
    if (loan.approvals && loan.approvals.length > 0) {
      loan.approvals.forEach((app, idx) => {
        auditTrail.push({
          id: `loan-app-${loan.id}-${idx}`,
          type: "Loan Governance",
          timestamp: app.date || loan.application_date,
          actor: `${app.leader_name || 'Leader'} (${app.leader_role})`,
          action: `Loan Approval Step`,
          details: `Approved KES ${(loan.amount || 0).toLocaleString()} loan for ${loan.member_name}`,
          status: loan.status === "Active" ? "Approved" : "In Progress",
          reviewer: app.leader_role,
          raw: loan,
        });
      });
    }
  });

  // 4. Loan Repayment Verification Audit Logs
  repayments.forEach(r => {
    if (r.status === "Verified" || r.status === "Rejected") {
      auditTrail.push({
        id: `repayment-audit-${r.id}`,
        type: "Financial Audit",
        timestamp: r.verification_date || r.payment_date || r.created_at,
        actor: r.verified_by || "Leader",
        action: `${r.payment_method || 'Cash'} Repayment ${r.status}`,
        details: `${r.status} ${r.payment_method || 'Cash'} loan repayment of KES ${(r.amount || 0).toLocaleString()} for ${r.member_name}`,
        status: r.status,
        reviewer: r.verified_by || "System Verified",
        raw: r,
      });
    }
  });

  // 5. Delinquency & Bad Repayment Behavior Audit Logs
  // 5a. Overdue & Defaulted Active Loans
  loans.filter(l => (l.status === "Active" || l.status === "Approved") && (l.balance || 0) > 0).forEach(loan => {
    const dueDate = loan.next_payment_date || loan.due_date;
    if (dueDate) {
      const diffDays = today.diff(moment(dueDate), "days");
      if (diffDays > 0) {
        const isDisqualified = diffDays > 90;
        auditTrail.push({
          id: `delinquent-loan-${loan.id}`,
          type: "Delinquency & Bad Behavior",
          timestamp: dueDate,
          actor: loan.member_name,
          action: `Overdue Loan Repayment (${diffDays} day${diffDays > 1 ? 's' : ''} late)`,
          details: `Loan of KES ${(loan.amount || 0).toLocaleString()} (Balance: KES ${(loan.balance || 0).toLocaleString()}) is overdue by ${diffDays} days. ${isDisqualified ? '⛔ Overdue by >3 months (90 days) — Disqualified from borrowing for remainder of year.' : '⚠️ Repayment overdue.'}`,
          status: isDisqualified ? "Disqualified" : "Overdue",
          reviewer: "System Risk Monitor",
          raw: loan,
        });
      }
    }
  });

  // 5b. Rejected Repayment Attempts (Flagging unverified / rejected payments)
  repayments.filter(r => r.status === "Rejected").forEach(r => {
    auditTrail.push({
      id: `repayment-rejected-audit-${r.id}`,
      type: "Delinquency & Bad Behavior",
      timestamp: r.verification_date || r.payment_date || r.created_at,
      actor: r.member_name,
      action: `Rejected Repayment Submission (${r.payment_method || 'Cash'})`,
      details: `Repayment attempt of KES ${(r.amount || 0).toLocaleString()} submitted by ${r.member_name} was REJECTED by ${r.verified_by || 'Leader'}. Ref: ${r.transaction_ref || 'N/A'}.${r.notes ? ' Reason: ' + r.notes : ''}`,
      status: "Rejected",
      reviewer: r.verified_by || "Leader",
      raw: r,
    });
  });

  // 5c. Late Payment Fines / Default Penalties
  fines.forEach(f => {
    const reasonLower = (f.reason || "").toLowerCase();
    if (reasonLower.includes("late") || reasonLower.includes("overdue") || reasonLower.includes("default") || reasonLower.includes("repayment")) {
      auditTrail.push({
        id: `fine-delinquency-${f.id}`,
        type: "Delinquency & Bad Behavior",
        timestamp: f.date_issued || f.created_at,
        actor: f.member_name,
        action: `Late Payment Penalty Issued`,
        details: `Fine of KES ${(f.amount || 0).toLocaleString()} issued to ${f.member_name} for "${f.reason}". Status: ${f.status}`,
        status: f.status === "Paid" ? "Penalty Settled" : "Penalty Unpaid",
        reviewer: "System Penalty",
        raw: f,
      });
    }
  });

  // Sort audit trail descending by timestamp
  auditTrail.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

  // Filter audit logs
  const filteredAudit = auditTrail.filter(item => {
    const matchSearch =
      item.actor?.toLowerCase().includes(auditSearch.toLowerCase()) ||
      item.details?.toLowerCase().includes(auditSearch.toLowerCase()) ||
      item.action?.toLowerCase().includes(auditSearch.toLowerCase()) ||
      item.status?.toLowerCase().includes(auditSearch.toLowerCase());

    const matchType =
      auditFilter === "all" ||
      (auditFilter === "profile" && item.type === "Profile Audit") ||
      (auditFilter === "financial" && item.type === "Financial Audit") ||
      (auditFilter === "loan" && item.type === "Loan Governance") ||
      (auditFilter === "delinquency" && item.type === "Delinquency & Bad Behavior");

    return matchSearch && matchType;
  });

  // Compile Bad Repayment Behavior Member Risk Profiles
  const memberRiskMap = {};

  // Process active loans for overdue status
  loans.filter(l => (l.status === "Active" || l.status === "Approved") && (l.balance || 0) > 0).forEach(loan => {
    const dueDate = loan.next_payment_date || loan.due_date;
    const diffDays = dueDate ? today.diff(moment(dueDate), "days") : 0;
    if (diffDays > 0) {
      if (!memberRiskMap[loan.member_id]) {
        memberRiskMap[loan.member_id] = {
          member_id: loan.member_id,
          member_name: loan.member_name,
          overdueLoansCount: 0,
          maxDaysOverdue: 0,
          totalOverdueBalance: 0,
          rejectedCount: 0,
          lateFinesCount: 0,
          unpaidFinesAmount: 0,
        };
      }
      memberRiskMap[loan.member_id].overdueLoansCount += 1;
      memberRiskMap[loan.member_id].totalOverdueBalance += (loan.balance || 0);
      if (diffDays > memberRiskMap[loan.member_id].maxDaysOverdue) {
        memberRiskMap[loan.member_id].maxDaysOverdue = diffDays;
      }
    }
  });

  // Process rejected repayment attempts
  repayments.filter(r => r.status === "Rejected").forEach(r => {
    if (!memberRiskMap[r.member_id]) {
      memberRiskMap[r.member_id] = {
        member_id: r.member_id,
        member_name: r.member_name,
        overdueLoansCount: 0,
        maxDaysOverdue: 0,
        totalOverdueBalance: 0,
        rejectedCount: 0,
        lateFinesCount: 0,
        unpaidFinesAmount: 0,
      };
    }
    memberRiskMap[r.member_id].rejectedCount += 1;
  });

  // Process late fines
  fines.forEach(f => {
    const reasonLower = (f.reason || "").toLowerCase();
    if (reasonLower.includes("late") || reasonLower.includes("overdue") || reasonLower.includes("default") || reasonLower.includes("repayment")) {
      if (!memberRiskMap[f.member_id]) {
        memberRiskMap[f.member_id] = {
          member_id: f.member_id,
          member_name: f.member_name,
          overdueLoansCount: 0,
          maxDaysOverdue: 0,
          totalOverdueBalance: 0,
          rejectedCount: 0,
          lateFinesCount: 0,
          unpaidFinesAmount: 0,
        };
      }
      memberRiskMap[f.member_id].lateFinesCount += 1;
      if (f.status === "Unpaid") {
        memberRiskMap[f.member_id].unpaidFinesAmount += (f.amount || 0);
      }
    }
  });

  const delinquentMembersList = Object.values(memberRiskMap).map(m => {
    let riskRating = "Low Risk";
    let riskBadgeClass = "bg-gray-100 text-gray-700 border-gray-200";

    if (m.maxDaysOverdue > 90) {
      riskRating = "Critical (Disqualified)";
      riskBadgeClass = "bg-rose-100 text-rose-800 border border-rose-300 font-bold";
    } else if (m.maxDaysOverdue > 0 || m.rejectedCount > 1) {
      riskRating = "High Risk (Overdue)";
      riskBadgeClass = "bg-amber-100 text-amber-800 border border-amber-300 font-semibold";
    } else if (m.rejectedCount === 1 || m.lateFinesCount > 0) {
      riskRating = "Moderate Risk";
      riskBadgeClass = "bg-yellow-100 text-yellow-800 border border-yellow-300";
    }

    return {
      ...m,
      riskRating,
      riskBadgeClass,
    };
  }).sort((a, b) => b.maxDaysOverdue - a.maxDaysOverdue || b.totalOverdueBalance - a.totalOverdueBalance);

  const filteredDelinquentList = delinquentMembersList.filter(m =>
    m.member_name?.toLowerCase().includes(delinquentSearch.toLowerCase()) ||
    m.riskRating?.toLowerCase().includes(delinquentSearch.toLowerCase())
  );

  const totalOverdueBorrowersCount = delinquentMembersList.filter(m => m.maxDaysOverdue > 0).length;
  const totalOverdueBalanceSum = delinquentMembersList.reduce((sum, m) => sum + m.totalOverdueBalance, 0);
  const totalRejectedAttemptsSum = repayments.filter(r => r.status === "Rejected").length;
  const totalDisqualifiedMembersCount = delinquentMembersList.filter(m => m.maxDaysOverdue > 90).length;

  const downloadCSV = (data, filename) => {
    if (!data || data.length === 0) return;
    const keys = Object.keys(data[0]).filter(k => k !== "id" && k !== "raw" && !k.startsWith("created_by") && !k.endsWith("Class"));
    const csv = [keys.join(","), ...data.map(row => keys.map(k => `"${row[k] || ""}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto min-h-full space-y-8">
      <PageHeader title="Reports & Audit Log" subtitle="Financial summary, system analytics, and governance audit history" />

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard title="Total Contributions" value={`KES ${totalContributions.toLocaleString()}`} icon={Wallet} color="emerald" />
        <StatCard title="Total Loaned" value={`KES ${totalLoaned.toLocaleString()}`} icon={HandCoins} color="amber" />
        <StatCard title="Total Repaid" value={`KES ${totalRepaid.toLocaleString()}`} icon={Wallet} color="blue" />
        <StatCard title="Interest Earned" value={`KES ${totalInterest.toLocaleString()}`} icon={Wallet} color="purple" />
        <StatCard title="Outstanding Loans" value={`KES ${outstandingLoans.toLocaleString()}`} icon={HandCoins} color="rose" />
        <StatCard title="Fines Collected" value={`KES ${totalFines.toLocaleString()}`} icon={Users} color="sky" />
      </div>

      {/* Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-xs">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Contribution Trend</h3>
          {contribChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={contribChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={v => `KES ${v.toLocaleString()}`} />
                <Line type="monotone" dataKey="amount" stroke="#22C55E" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-400 text-center py-12">No data yet</p>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-xs">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Top Contributors</h3>
          {memberRanking.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={memberRanking} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={100} />
                <Tooltip formatter={v => `KES ${v.toLocaleString()}`} />
                <Bar dataKey="total" fill="#2563eb" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-400 text-center py-12">No data yet</p>
          )}
        </div>
      </div>

      {/* Loan Repayment Behavior & Risk Audit Panel */}
      <div className="bg-gradient-to-br from-rose-50/50 via-white to-amber-50/30 rounded-2xl border border-rose-200/80 p-5 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-rose-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rose-100 text-rose-800 rounded-xl">
              <ShieldAlert size={22} />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                Loan Repayment Behavior & Risk Audit
                <span className="bg-rose-100 text-rose-800 text-[11px] px-2 py-0.5 rounded-full font-bold">Risk Tracker</span>
              </h3>
              <p className="text-xs text-gray-500">Track members with bad repayment habits, overdue loans, rejected payments, and borrowing disqualifications</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[200px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search delinquent member..."
                value={delinquentSearch}
                onChange={e => setDelinquentSearch(e.target.value)}
                className="pl-8 text-xs h-9 rounded-xl border-rose-200 bg-white"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadCSV(delinquentMembersList, "bad_repayment_behavior_audit.csv")}
              className="h-9 rounded-xl text-xs font-semibold border-rose-200 text-rose-800 hover:bg-rose-50"
            >
              <Download size={14} className="mr-1.5" /> Export Bad Repayment CSV
            </Button>
          </div>
        </div>

        {/* Risk Metrics Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white/80 backdrop-blur-xs p-3.5 rounded-xl border border-rose-100 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">Overdue Borrowers</span>
              <AlertTriangle size={16} className="text-amber-500" />
            </div>
            <p className="text-lg font-bold text-gray-900 mt-1">{totalOverdueBorrowersCount} Member{totalOverdueBorrowersCount !== 1 ? 's' : ''}</p>
            <p className="text-[11px] text-amber-600 mt-0.5">Active loans past due date</p>
          </div>

          <div className="bg-white/80 backdrop-blur-xs p-3.5 rounded-xl border border-rose-100 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">Total Overdue Amount</span>
              <HandCoins size={16} className="text-rose-500" />
            </div>
            <p className="text-lg font-bold text-rose-700 mt-1">KES {totalOverdueBalanceSum.toLocaleString()}</p>
            <p className="text-[11px] text-rose-600 mt-0.5">Outstanding overdue principal & interest</p>
          </div>

          <div className="bg-white/80 backdrop-blur-xs p-3.5 rounded-xl border border-rose-100 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">Rejected Payments</span>
              <XCircle size={16} className="text-red-500" />
            </div>
            <p className="text-lg font-bold text-gray-900 mt-1">{totalRejectedAttemptsSum} Submission{totalRejectedAttemptsSum !== 1 ? 's' : ''}</p>
            <p className="text-[11px] text-red-600 mt-0.5">Failed verification or fake ref codes</p>
          </div>

          <div className="bg-white/80 backdrop-blur-xs p-3.5 rounded-xl border border-rose-100 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">Disqualified Borrowers</span>
              <UserX size={16} className="text-rose-700" />
            </div>
            <p className="text-lg font-bold text-rose-800 mt-1">{totalDisqualifiedMembersCount} Member{totalDisqualifiedMembersCount !== 1 ? 's' : ''}</p>
            <p className="text-[11px] text-rose-700 mt-0.5">Overdue &gt; 90 days (Barred from borrowing)</p>
          </div>
        </div>

        {/* Bad Repayment Behavior Member Table */}
        {filteredDelinquentList.length === 0 ? (
          <div className="text-center py-8 bg-white/60 rounded-xl border border-rose-100 text-gray-500 text-xs">
            {delinquentMembersList.length === 0
              ? "🎉 Excellent repayment history! No members currently flagged with overdue loans or bad repayment behavior."
              : "No delinquent members match your search criteria."}
          </div>
        ) : (
          <div className="overflow-x-auto bg-white rounded-xl border border-rose-100">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-rose-50/60 border-b border-rose-100 text-[11px] text-rose-900 uppercase font-semibold">
                  <th className="py-3 px-4 text-left">Member Name</th>
                  <th className="py-3 px-4 text-left">Overdue Status</th>
                  <th className="py-3 px-4 text-left">Overdue Balance</th>
                  <th className="py-3 px-4 text-left">Rejected Submissions</th>
                  <th className="py-3 px-4 text-left">Late Penalties</th>
                  <th className="py-3 px-4 text-left">Repayment Risk Rating</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rose-50 text-xs">
                {filteredDelinquentList.map(m => (
                  <tr key={m.member_id} className="hover:bg-rose-50/30 transition-colors">
                    <td className="py-3 px-4 font-bold text-gray-900">
                      {m.member_name}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {m.maxDaysOverdue > 0 ? (
                        <span className="text-rose-700 font-semibold flex items-center gap-1">
                          <Clock size={13} className="text-rose-500" /> {m.maxDaysOverdue} days late ({m.overdueLoansCount} loan{m.overdueLoansCount > 1 ? 's' : ''})
                        </span>
                      ) : (
                        <span className="text-gray-400 italic">Current on schedule</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-rose-800 whitespace-nowrap">
                      KES {m.totalOverdueBalance.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 font-semibold text-gray-700 whitespace-nowrap">
                      {m.rejectedCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-red-700 font-bold bg-red-50 px-2 py-0.5 rounded-md border border-red-100">
                          <XCircle size={13} /> {m.rejectedCount} rejected
                        </span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                    <td className="py-3 px-4 space-y-0.5 whitespace-nowrap">
                      <p className="font-semibold text-amber-800">{m.lateFinesCount} penalty fine{m.lateFinesCount !== 1 ? 's' : ''}</p>
                      {m.unpaidFinesAmount > 0 && (
                        <p className="text-[10px] text-rose-600 font-bold">Unpaid: KES {m.unpaidFinesAmount.toLocaleString()}</p>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] ${m.riskBadgeClass}`}>
                        {m.riskRating}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Audit History & Activity Trail Section */}
      <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-fuchsia-100 text-fuchsia-800 rounded-xl">
              <History size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Audit History & Activity Trail</h3>
              <p className="text-xs text-gray-500">Comprehensive logs of system transactions, profile changes, loan governance, and repayment delinquency</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[200px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search audit logs..."
                value={auditSearch}
                onChange={e => setAuditSearch(e.target.value)}
                className="pl-8 text-xs h-9 rounded-xl"
              />
            </div>
            <Select value={auditFilter} onValueChange={setAuditFilter}>
              <SelectTrigger className="w-52 text-xs h-9 rounded-xl"><SelectValue placeholder="All Categories" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="delinquency">🚨 Delinquency & Bad Behavior</SelectItem>
                <SelectItem value="financial">Financial Audits</SelectItem>
                <SelectItem value="profile">Profile Audits</SelectItem>
                <SelectItem value="loan">Loan Governance</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadCSV(auditTrail.map(({ raw, ...rest }) => rest), "audit_history_full.csv")}
              className="h-9 rounded-xl text-xs font-semibold"
            >
              <Download size={14} className="mr-1.5" /> Export Audit CSV
            </Button>
          </div>
        </div>

        {filteredAudit.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">
            No audit logs found matching your filter criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 uppercase font-medium">
                  <th className="py-3 px-4 text-left">Timestamp</th>
                  <th className="py-3 px-4 text-left">Category</th>
                  <th className="py-3 px-4 text-left">Actor / User</th>
                  <th className="py-3 px-4 text-left">Action & Details</th>
                  <th className="py-3 px-4 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {filteredAudit.map(log => (
                  <tr key={log.id} className={`hover:bg-gray-50/80 transition-colors ${
                    log.type === "Delinquency & Bad Behavior" ? "bg-rose-50/20" : ""
                  }`}>
                    <td className="py-3.5 px-4 text-gray-500 font-mono whitespace-nowrap">
                      {moment(log.timestamp).format("D MMM YYYY, h:mm A")}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-gray-700 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        log.type === "Delinquency & Bad Behavior" ? "bg-rose-100 text-rose-800 border border-rose-200" :
                        log.type === "Profile Audit" ? "bg-amber-100 text-amber-800" :
                        log.type === "Financial Audit" ? "bg-emerald-100 text-emerald-800" :
                        "bg-fuchsia-100 text-fuchsia-800"
                      }`}>
                        {log.type === "Delinquency & Bad Behavior" && <AlertTriangle size={12} className="text-rose-600" />}
                        {log.type}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-bold text-gray-900 whitespace-nowrap">
                      {log.actor}
                    </td>
                    <td className="py-3.5 px-4 space-y-0.5">
                      <p className="font-semibold text-gray-800">{log.action}</p>
                      <p className="text-gray-500 text-[11px]">{log.details}</p>
                      {log.reviewer && (
                        <p className="text-[10px] text-fuchsia-700 font-medium italic">{log.reviewer}</p>
                      )}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        log.status === "Approved" || log.status === "Completed" || log.status === "Verified" || log.status === "Penalty Settled"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : log.status === "Rejected" || log.status === "Disqualified"
                          ? "bg-rose-50 text-rose-700 border border-rose-300"
                          : log.status === "Overdue" || log.status === "Penalty Unpaid"
                          ? "bg-amber-50 text-amber-800 border border-amber-300"
                          : "bg-amber-50 text-amber-800 border border-amber-200"
                      }`}>
                        {log.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Export Reports Card */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-xs">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Export Reports & Audit Data</h3>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" size="sm" onClick={() => downloadCSV(delinquentMembersList, "bad_repayment_behavior_audit.csv")}>
            <Download size={14} className="mr-1.5" /> Bad Repayment Audit CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadCSV(members, "members.csv")}>
            <Download size={14} className="mr-1.5" /> Members CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadCSV(contributions, "contributions.csv")}>
            <Download size={14} className="mr-1.5" /> Contributions CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadCSV(loans, "loans.csv")}>
            <Download size={14} className="mr-1.5" /> Loans CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadCSV(repayments, "repayments.csv")}>
            <Download size={14} className="mr-1.5" /> Repayments CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadCSV(fines, "fines.csv")}>
            <Download size={14} className="mr-1.5" /> Fines CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadCSV(profileRequests, "profile_change_audit.csv")}>
            <Download size={14} className="mr-1.5" /> Profile Audit CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadCSV(transactions, "system_transactions_audit.csv")}>
            <Download size={14} className="mr-1.5" /> Financial Audit CSV
          </Button>
        </div>
      </div>
    </div>
  );
}