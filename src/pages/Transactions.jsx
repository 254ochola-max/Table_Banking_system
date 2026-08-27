import React, { useState, useEffect } from "react";
import { api, supabase } from "@/api/supabaseClient";
import { Banknote, Search } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import EmptyState from "@/components/shared/EmptyState";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import moment from "moment";

const TYPE_COLORS = {
  "Contribution": "bg-emerald-50 text-emerald-700",
  "Loan Disbursement": "bg-amber-50 text-amber-700",
  "Loan Repayment": "bg-blue-50 text-blue-700",
  "Fine": "bg-red-50 text-red-700",
  "Withdrawal": "bg-purple-50 text-purple-700",
  "Dividend": "bg-sky-50 text-sky-700",
};

export default function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");

  useEffect(() => {
    async function load() {
      const data = await api.entities.Transaction.list("-date", 200);
      setTransactions(data);
      setLoading(false);
    }
    load();
  }, []);

  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const years = [...new Set(transactions.map(t => t.date ? new Date(t.date).getFullYear() : null).filter(Boolean))].sort((a,b) => b - a);

  const filtered = transactions.filter(t => {
    const matchSearch = t.member_name?.toLowerCase().includes(search.toLowerCase()) || t.description?.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === "all" || t.type === typeFilter;
    const tDate = t.date ? new Date(t.date) : null;
    const matchMonth = monthFilter === "all" || (tDate && tDate.getMonth() === parseInt(monthFilter));
    const matchYear = yearFilter === "all" || (tDate && tDate.getFullYear() === parseInt(yearFilter));
    return matchSearch && matchType && matchMonth && matchYear;
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
      <PageHeader title="Transactions" subtitle={`${transactions.length} total transactions`} />

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input placeholder="Search transactions..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="Contribution">Contribution</SelectItem>
            <SelectItem value="Loan Disbursement">Loan Disbursement</SelectItem>
            <SelectItem value="Loan Repayment">Loan Repayment</SelectItem>
            <SelectItem value="Fine">Fine</SelectItem>
            <SelectItem value="Withdrawal">Withdrawal</SelectItem>
            <SelectItem value="Dividend">Dividend</SelectItem>
          </SelectContent>
        </Select>
        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Month" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Months</SelectItem>
            {MONTHS.map((m, i) => <SelectItem key={m} value={String(i)}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="w-28"><SelectValue placeholder="Year" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Years</SelectItem>
            {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Banknote} title="No transactions found" description="Transactions will appear here as you record activities" />
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Member</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Description</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Amount</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => (
                  <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-3 px-4 text-gray-600">{moment(t.date).format("MMM D, YYYY")}</td>
                    <td className="py-3 px-4 font-medium text-gray-800">{t.member_name}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[t.type] || "bg-gray-100 text-gray-700"}`}>{t.type}</span>
                    </td>
                    <td className="py-3 px-4 text-gray-500 hidden sm:table-cell max-w-xs truncate">{t.description}</td>
                    <td className="py-3 px-4 text-right font-semibold">KES {(t.amount || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}