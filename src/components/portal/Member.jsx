import React, { useState, useEffect } from "react";
import { api } from "@/api/supabaseClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Wallet, HandCoins, AlertTriangle } from "lucide-react";
import moment from "moment";

export default function MemberDetailDialog({ member, onClose }) {
  const [data, setData] = useState({ contributions: [], loans: [], fines: [], repayments: [] });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!member) return;
    setLoading(true);
    async function load() {
      const [c, l, f, r] = await Promise.all([
        api.entities.Contribution.filter({ member_id: member.id }, "-date_paid", 50),
        api.entities.Loan.filter({ member_id: member.id }),
        api.entities.Fine.filter({ member_id: member.id }, "-date_issued", 20),
        api.entities.Repayment.filter({ member_id: member.id }, "-payment_date", 20),
      ]);
      setData({ contributions: c, loans: l, fines: f, repayments: r });
      setLoading(false);
    }
    load();
  }, [member]);

  const totalSavings = data.contributions.filter(c => c.status === "Verified").reduce((s, c) => s + (c.amount || 0), 0);
  const loanBalance = data.loans.filter(l => l.status === "Active").reduce((s, l) => s + (l.balance || 0), 0);
  const unpaidFines = data.fines.filter(f => f.status === "Unpaid").reduce((s, f) => s + (f.amount || 0), 0);

  return (
    <Dialog open={!!member} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        {member && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-fuchsia-100 border-2 border-fuchsia-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {member.photo_url ? (
                    <img src={member.photo_url} alt={member.full_name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-sm font-bold text-fuchsia-600">{member.full_name?.charAt(0)}</span>
                  )}
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-900">{member.full_name}</p>
                  <p className="text-xs text-gray-500">{member.role} · {member.status}</p>
                </div>
              </DialogTitle>
            </DialogHeader>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-4 border-fuchsia-200 border-t-fuchsia-500 rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-emerald-50 rounded-xl p-3 text-center">
                    <Wallet size={16} className="mx-auto text-emerald-600 mb-1" />
                    <p className="text-xs text-gray-500">Savings</p>
                    <p className="text-sm font-bold text-emerald-700">KES {totalSavings.toLocaleString()}</p>
                  </div>
                  <div className="bg-amber-50 rounded-xl p-3 text-center">
                    <HandCoins size={16} className="mx-auto text-amber-600 mb-1" />
                    <p className="text-xs text-gray-500">Loan Balance</p>
                    <p className="text-sm font-bold text-amber-700">KES {loanBalance.toLocaleString()}</p>
                  </div>
                  <div className="bg-rose-50 rounded-xl p-3 text-center">
                    <AlertTriangle size={16} className="mx-auto text-rose-600 mb-1" />
                    <p className="text-xs text-gray-500">Unpaid Fines</p>
                    <p className="text-sm font-bold text-rose-700">KES {unpaidFines.toLocaleString()}</p>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Contributions</h4>
                  {data.contributions.length > 0 ? (
                    <div className="space-y-1">
                      {data.contributions.slice(0, 10).map(c => (
                        <div key={c.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50">
                          <span className="text-gray-700">{c.month} {c.year}</span>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${c.status === "Verified" ? "bg-emerald-50 text-emerald-700" : c.status === "Rejected" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{c.status || "Pending"}</span>
                            <span className="font-semibold text-emerald-600">KES {(c.amount || 0).toLocaleString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-sm text-gray-400">No contributions</p>}
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Loans</h4>
                  {data.loans.length > 0 ? (
                    <div className="space-y-1">
                      {data.loans.map(l => (
                        <div key={l.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50">
                          <div>
                            <span className="text-gray-700">KES {(l.amount || 0).toLocaleString()}</span>
                            <span className="text-xs text-gray-400 ml-2">{l.duration_months}mo</span>
                          </div>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${l.status === "Active" ? "bg-amber-50 text-amber-700" : l.status === "Fully Paid" ? "bg-emerald-50 text-emerald-700" : l.status === "Pending" ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-600"}`}>{l.status}</span>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-sm text-gray-400">No loans</p>}
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Fines</h4>
                  {data.fines.length > 0 ? (
                    <div className="space-y-1">
                      {data.fines.map(f => (
                        <div key={f.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50">
                          <div>
                            <span className="text-gray-700">{f.reason}</span>
                            <span className="text-xs text-gray-400 ml-2">{moment(f.date_issued).format("MMM D, YYYY")}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${f.status === "Paid" ? "bg-emerald-50 text-emerald-700" : f.status === "Waived" ? "bg-gray-100 text-gray-600" : "bg-rose-50 text-rose-700"}`}>{f.status}</span>
                            <span className="font-semibold text-rose-600">KES {(f.amount || 0).toLocaleString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-sm text-gray-400">No fines</p>}
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}