import React, { useState, useEffect } from "react";
import { api, supabase } from "@/api/supabaseClient";
import { Plus, Check, Trash2, CheckCircle2 } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import MemberAvatar from "@/components/shared/MemberAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import moment from "moment";

export default function Fines() {
  const [fines, setFines] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    member_id: "", reason: "", amount: "",
    date_issued: new Date().toISOString().split("T")[0],
  });
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const [f, m] = await Promise.all([
      api.entities.Fine.list("-created_at", 100),
      api.entities.Member.filter({ status: "Active" }),
    ]);
    // Fines that are already paid are removed from active list
    const activeFines = (f || []).filter(item => item.status !== "Paid");
    setFines(activeFines);
    setMembers(m || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!form.member_id || !form.reason || !form.amount) {
      toast({ title: "Fill all required fields", variant: "destructive" });
      return;
    }
    const amt = parseFloat(form.amount);
    if (isNaN(amt) || amt <= 0) {
      toast({ title: "Enter a valid fine amount", variant: "destructive" });
      return;
    }

    setSaving(true);
    const member = members.find(m => m.id === form.member_id);
    const fineData = {
      ...form,
      amount: amt,
      member_name: member?.full_name || "",
      status: "Unpaid",
    };

    const created = await api.entities.Fine.create(fineData);
    if (supabase && created?.id) {
      try {
        await supabase.from("fines").upsert({ id: created.id, ...fineData });
      } catch (e) {
        console.warn("Could not sync fine to Supabase:", e);
      }
    }

    await api.entities.Transaction.create({
      member_id: form.member_id,
      member_name: member?.full_name || "",
      type: "Fine",
      amount: amt,
      description: `Fine: ${form.reason}`,
      date: form.date_issued,
    });

    toast({ title: "Fine issued", description: `Fine of KES ${amt.toLocaleString()} recorded for ${member?.full_name}.` });
    setSaving(false);
    setShowForm(false);
    setForm({ member_id: "", reason: "", amount: "", date_issued: new Date().toISOString().split("T")[0] });
    load();
  };

  const markPaid = async (fine) => {
    try {
      const datePaid = new Date().toISOString().split("T")[0];

      // Update the fine status to "Paid" so it is preserved in the ledger
      // and reflected correctly in the dashboard's finesCollected calculation.
      // The load() function already filters out status === "Paid" from the
      // active fines list, so the Fines page UI will remain clean.
      await api.entities.Fine.update(fine.id, {
        status: "Paid",
        date_paid: datePaid,
      });
      if (supabase) {
        await supabase
          .from("fines")
          .update({ status: "Paid", date_paid: datePaid })
          .eq("id", fine.id);
      }

      // Record a permanent fine settlement transaction in financial ledger
      await api.entities.Transaction.create({
        member_id: fine.member_id,
        member_name: fine.member_name,
        type: "Fine Payment",
        amount: fine.amount,
        description: `Fine settled & cleared: ${fine.reason}`,
        date: datePaid,
      });

      // Instantly remove from active (unpaid) list in UI
      setFines(prev => prev.filter(item => item.id !== fine.id));

      toast({
        title: "Fine Settled & Cleared",
        description: `${fine.member_name}'s fine of KES ${(fine.amount || 0).toLocaleString()} has been marked as paid. The dashboard has been updated.`,
      });
    } catch (e) {
      console.error(e);
      toast({ title: "Error clearing fine", description: e.message, variant: "destructive" });
    }
  };

  const deleteFine = async (fine) => {
    try {
      await api.entities.Fine.delete(fine.id);
      if (supabase) {
        await supabase.from("fines").delete().eq("id", fine.id);
      }
      setFines(prev => prev.filter(item => item.id !== fine.id));
      toast({ title: "Fine deleted", description: `Fine for ${fine.member_name} removed.` });
    } catch (e) {
      toast({ title: "Error deleting fine", description: e.message, variant: "destructive" });
    }
  };

  const unpaidTotal = fines.reduce((s, f) => s + (f.amount || 0), 0);

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
        title="Fines"
        subtitle={`Outstanding Fines: KES ${unpaidTotal.toLocaleString()} · ${fines.length} pending`}
        action={
          <Button onClick={() => setShowForm(true)} className="bg-fuchsia-600 hover:bg-fuchsia-700 font-semibold shadow-xs">
            <Plus size={16} className="mr-1" /> Issue Fine
          </Button>
        }
      />

      {fines.length === 0 ? (
        <div className="bg-white rounded-2xl border border-fuchsia-100 p-12 text-center shadow-2xs">
          <div className="w-14 h-14 bg-fuchsia-50 border border-fuchsia-100 rounded-full flex items-center justify-center mx-auto text-fuchsia-600 mb-3">
            <CheckCircle2 size={28} />
          </div>
          <p className="text-gray-900 font-bold text-base">No Outstanding Fines</p>
          <p className="text-xs text-gray-500 mt-1">All fines have been settled and cleared. Good standing across all members!</p>
          <Button onClick={() => setShowForm(true)} className="mt-4 bg-fuchsia-600 hover:bg-fuchsia-700 text-xs font-semibold">
            <Plus size={14} className="mr-1" /> Issue Fine
          </Button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-100">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Date Issued</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Member</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase hidden sm:table-cell">Reason</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Amount</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody>
                {fines.map(f => (
                  <tr key={f.id} className="border-b border-gray-50 hover:bg-fuchsia-50/20 transition-colors">
                    <td className="py-3.5 px-4 text-gray-600 text-xs">{moment(f.date_issued).format("MMM D, YYYY")}</td>
                    <td className="py-3.5 px-4 font-bold text-gray-900">
                      <div className="flex items-center gap-2">
                        <MemberAvatar photoUrl={members.find(m => m.id === f.member_id)?.photo_url} name={f.member_name} size="xs" />
                        <span>{f.member_name}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-gray-600 hidden sm:table-cell text-xs">{f.reason}</td>
                    <td className="py-3.5 px-4 text-right font-bold text-fuchsia-800">KES {(f.amount || 0).toLocaleString()}</td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold bg-fuchsia-100 text-fuchsia-900 border border-fuchsia-300">
                        {f.status || "Unpaid"}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          className="h-7.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-2.5 shadow-2xs"
                          onClick={() => markPaid(f)}
                        >
                          <Check size={13} className="mr-1" /> Mark Paid
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7.5 w-7.5 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => deleteFine(f)}
                          title="Delete fine"
                        >
                          <Trash2 size={13} />
                        </Button>
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
            <DialogTitle className="text-fuchsia-950 font-bold">Issue Fine</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2 text-xs">
            <div>
              <label className="font-semibold text-gray-700 block mb-1">Member *</label>
              <Select value={form.member_id} onValueChange={v => setForm({...form, member_id: v})}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select member" /></SelectTrigger>
                <SelectContent>
                  {members.map(m => (
                    <SelectItem key={m.id} value={m.id} className="text-xs">{m.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="font-semibold text-gray-700 block mb-1">Reason *</label>
              <Input
                value={form.reason}
                onChange={e => setForm({...form, reason: e.target.value})}
                placeholder="e.g. Late contribution, Absence without notice"
                className="h-9 text-xs"
              />
            </div>
            <div>
              <label className="font-semibold text-gray-700 block mb-1">Amount (KES) *</label>
              <Input
                type="number"
                value={form.amount}
                onChange={e => setForm({...form, amount: e.target.value})}
                placeholder="e.g. 200"
                className="h-9 text-xs"
              />
            </div>
            <div>
              <label className="font-semibold text-gray-700 block mb-1">Date</label>
              <Input
                type="date"
                value={form.date_issued}
                onChange={e => setForm({...form, date_issued: e.target.value})}
                className="h-9 text-xs"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowForm(false)} className="text-xs h-9">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="bg-fuchsia-600 hover:bg-fuchsia-700 font-semibold text-xs h-9 shadow-xs">
              {saving ? "Saving..." : "Issue Fine"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}