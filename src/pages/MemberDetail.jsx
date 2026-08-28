import React, { useState, useEffect } from "react";
import { useParams, Link, useLocation } from "react-router-dom";
import { api } from "@/api/supabaseClient";
import { ArrowLeft, Wallet, HandCoins, AlertTriangle } from "lucide-react";
import StatCard from "@/components/shared/StatCard";
import MemberAvatar from "@/components/shared/MemberAvatar";
import moment from "moment";

export default function MemberDetail() {
  const { id } = useParams();
  const location = useLocation();
  const initialMember = location.state?.member || null;
  const [member, setMember] = useState(initialMember);
  const [contributions, setContributions] = useState([]);
  const [loans, setLoans] = useState([]);
  const [fines, setFines] = useState([]);
  const [loading, setLoading] = useState(!initialMember);

  useEffect(() => {
    async function load() {
      const [m, c, l, f] = await Promise.all([
        api.entities.Member.get(id),
        api.entities.Contribution.filter({ member_id: id }, "-date_paid", 50),
        api.entities.Loan.filter({ member_id: id }),
        api.entities.Fine.filter({ member_id: id }),
      ]);
      let loadedMember = m;
      if (loadedMember && !loadedMember.photo_url) {
        try {
          const stored = localStorage.getItem(`deborahs_photo_${id}`) ||
                         (loadedMember.user_email ? localStorage.getItem(`deborahs_photo_${loadedMember.user_email.toLowerCase()}`) : null) ||
                         (loadedMember.email ? localStorage.getItem(`deborahs_photo_${loadedMember.email.toLowerCase()}`) : null) ||
                         (loadedMember.full_name ? localStorage.getItem(`deborahs_photo_${loadedMember.full_name.toLowerCase().trim().replace(/\s+/g, '_')}`) : null);
          if (stored) {
            loadedMember = { ...loadedMember, photo_url: stored };
          }
        } catch {}
      }
      setMember(loadedMember);
      setContributions(c);
      setLoans(l);
      setFines(f);
      setLoading(false);
    }
    load();

    const onMemberUpdated = (evt) => {
      if (evt.detail?.id === id && evt.detail?.photo_url) {
        setMember(prev => prev ? { ...prev, photo_url: evt.detail.photo_url } : prev);
      }
    };
    window.addEventListener("deborahs-member-updated", onMemberUpdated);
    return () => window.removeEventListener("deborahs-member-updated", onMemberUpdated);
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

      <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 justify-between">
          <div className="flex items-center gap-4">
            <MemberAvatar photoUrl={member.photo_url} name={member.full_name} size="xl" ring />
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{member.full_name}</h1>
              <p className="text-xs sm:text-sm text-gray-500">{member.phone} · ID: {member.id_number} {member.email ? `· ${member.email}` : ""}</p>
              <div className="flex flex-wrap gap-2 mt-2">
                <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  member.status === "Active" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                  member.status === "Pending" ? "bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200" :
                  "bg-gray-100 text-gray-600 border border-gray-200"
                }`}>{member.status}</span>
                <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-fuchsia-50 text-fuchsia-700 border border-fuchsia-200">{member.role}</span>
                {member.date_joined && (
                  <span className="text-xs text-gray-400 self-center">Joined {moment(member.date_joined).format("MMM D, YYYY")}</span>
                )}
              </div>
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