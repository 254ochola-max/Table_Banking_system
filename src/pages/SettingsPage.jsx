import React, { useState, useEffect } from "react";
import { api, supabase } from "@/api/supabaseClient";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Settings } from "lucide-react";

export default function SettingsPage() {
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState({
    group_name: "Table Banking Group",
    monthly_contribution: 1000,
    monthly_savings_target: 50000,
    interest_rate: 10,
    max_loan_multiplier: 3,
    late_payment_fine: 200,
    reminder_days_before: 3,
    currency: "KES",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    async function load() {
      const list = await api.entities.GroupSettings.list();
      if (list.length > 0) {
        setSettings(list[0]);
        setForm(list[0]);
      }
      setLoading(false);
    }
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const data = {
      group_name: form.group_name,
      monthly_contribution: parseFloat(form.monthly_contribution),
      monthly_savings_target: parseFloat(form.monthly_savings_target),
      interest_rate: parseFloat(form.interest_rate),
      max_loan_multiplier: parseFloat(form.max_loan_multiplier),
      late_payment_fine: parseFloat(form.late_payment_fine),
      reminder_days_before: parseInt(form.reminder_days_before),
      currency: form.currency,
    };

    try {
      if (settings) {
        await api.entities.GroupSettings.update(settings.id, data);
      } else {
        await api.entities.GroupSettings.create(data);
      }
      toast({ title: "Settings saved" });
    } catch (error) {
      console.error(error);
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-fuchsia-200 border-t-fuchsia-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto min-h-full">
      <PageHeader title="Settings" subtitle="Configure your group's financial parameters" />

      <div className="bg-white rounded-xl border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-100">
          <div className="p-2 bg-emerald-50 rounded-lg">
            <Settings size={20} className="text-emerald-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-800">Group Configuration</h3>
            <p className="text-xs text-gray-500">These settings apply to all members</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Group Name</label>
            <Input value={form.group_name} onChange={e => setForm({...form, group_name: e.target.value})} className="mt-1" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Monthly Contribution (KES)</label>
              <Input type="number" value={form.monthly_contribution} onChange={e => setForm({...form, monthly_contribution: e.target.value})} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Monthly Savings Target (KES)</label>
              <Input type="number" value={form.monthly_savings_target} onChange={e => setForm({...form, monthly_savings_target: e.target.value})} className="mt-1" />
              <p className="text-xs text-gray-400 mt-1">Used in dashboard savings vs target chart</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Loan Interest Rate (%)</label>
              <Input type="number" value={form.interest_rate} onChange={e => setForm({...form, interest_rate: e.target.value})} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Loan Reminder Days Before Due</label>
              <Input type="number" value={form.reminder_days_before} onChange={e => setForm({...form, reminder_days_before: e.target.value})} className="mt-1" />
              <p className="text-xs text-gray-400 mt-1">Send reminders this many days before payment is due</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Max Loan Multiplier</label>
              <Input type="number" value={form.max_loan_multiplier} onChange={e => setForm({...form, max_loan_multiplier: e.target.value})} className="mt-1" />
              <p className="text-xs text-gray-400 mt-1">Members can borrow up to this times their savings</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Late Payment Fine (KES)</label>
              <Input type="number" value={form.late_payment_fine} onChange={e => setForm({...form, late_payment_fine: e.target.value})} className="mt-1" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Currency</label>
            <Input value={form.currency} onChange={e => setForm({...form, currency: e.target.value})} className="mt-1" />
          </div>
        </div>

        <div className="flex justify-end mt-6 pt-4 border-t border-gray-100">
          <Button onClick={handleSave} disabled={saving} className="bg-fuchsia-500 hover:bg-fuchsia-600">
            {saving ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </div>
    </div>
  );
}
