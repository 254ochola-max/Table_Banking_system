import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { api, supabase } from "@/api/supabaseClient";
import { ArrowLeft, User, Wallet, HandCoins, AlertTriangle } from "lucide-react";
import StatCard from "@/components/shared/StatCard";
import moment from "moment";

export default function MemberDetail() {
  const { id } = useParams();
  const [member, setMember] = useState(null);
  const [contributions, setContributions] = useState([]);
  const [loans, setLoans] = useState([]);
  const [fines, setFines] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [m, c, l, f] = await Promise.all([
        api.entities.Member.get(id),
        api.entities.Contribution.filter({ member_id: id }, "-date_paid", 50),
        api.entities.Loan.filter({ member_id: id }),
        api.entities.Fine.filter({ member_id: id }),
      ]);
      setMember(m);
      setContributions(c);
      setLoans(l);
      setFines(f);
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-fuchsia-200 border-t-fuchsia-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!member) {
    return <div className="p-8 text-center text-gray-500">Member not found</div>;
  }

  const totalContributions = contributions.reduce((s, c) => s + (c.amount || 0), 0);
  const activeLoans = loans.filter(l => l.status === "Active" || l.status === "Approved");
  const totalLoanBalance = activeLoans.reduce((s, l) => s + (l.balance || 0), 0);
  const unpaidFines = fines.filter(f => f.status === "Unpaid").reduce((s, f) => s + (f.amount || 0), 0);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto min-h-full">
      <Link to="/members" className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-4">
        <ArrowLeft size={16} /> Back to Members
      </Link>

      <div className="bg-white rounded-xl border border-gray-100 p-6 mb-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
            <User size={24} className="text-emerald-600" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">{member.full_name}</h1>
            <p className="text-sm text-gray-500">{member.phone} · {member.id_number}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                member.status === "Active" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"
              }`}>{member.status}</span>
              <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">{member.role}</span>
              {member.date_joined && (
                <span className="text-xs text-gray-400">Joined {moment(member.date_joined).format("MMM D, YYYY")}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard title="Total Contributions" value={`KES ${totalContributions.toLocaleString()}`} icon={Wallet} color="emerald" />
        <StatCard title="Loan Balance" value={`KES ${totalLoanBalance.toLocaleString()}`} icon={HandCoins} color="amber" />
        <StatCard title="Unpaid Fines" value={`KES ${unpaidFines.toLocaleString()}`} icon={AlertTriangle} color="rose" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Contribution History</h3>
          {contributions.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {contributions.map(c => (
                <div key={c.id} className="flex items-center justify-between py-2 border-b border-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-700">{c.month} {c.year}</p>
                    <p className="text-xs text-gray-400">{moment(c.date_paid).format("MMM D, YYYY")}</p>
                  </div>
                  <p className="text-sm font-semibold text-emerald-600">KES {(c.amount || 0).toLocaleString()}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-6">No contributions yet</p>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Loans</h3>
          {loans.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {loans.map(l => (
                <div key={l.id} className="flex items-center justify-between py-2 border-b border-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-700">KES {(l.amount || 0).toLocaleString()}</p>
                    <p className="text-xs text-gray-400">{l.status} · {moment(l.application_date).format("MMM D, YYYY")}</p>
                  </div>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                    l.status === "Active" ? "bg-amber-50 text-amber-700" :
                    l.status === "Fully Paid" ? "bg-emerald-50 text-emerald-700" :
                    l.status === "Pending" ? "bg-blue-50 text-blue-700" :
                    "bg-gray-100 text-gray-600"
                  }`}>{l.status}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-6">No loans yet</p>
          )}
        </div>
      </div>
    </div>
  );
}