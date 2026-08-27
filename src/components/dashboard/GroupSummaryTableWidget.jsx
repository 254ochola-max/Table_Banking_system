import React, { useState, useEffect, useCallback } from "react";
import { api } from "@/api/supabaseClient";
import { Pencil, Check, X, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { syncSummaryToEntities } from "@/lib/syncSummary";

const DEFAULT_ROWS = [
  { row_label: "Table Banking", row_order: 1, highlight: false },
  { row_label: "Shares", row_order: 2, highlight: false },
  { row_label: "Loan Amount", row_order: 3, highlight: false },
  { row_label: "Interest", row_order: 4, highlight: false },
  { row_label: "TB Charges", row_order: 5, highlight: false },
  { row_label: "Loan Transaction Charges", row_order: 6, highlight: false },
  { row_label: "Penalties", row_order: 7, highlight: false },
  { row_label: "Repayment", row_order: 8, highlight: true },
];

export default function GroupSummaryTableWidget({ isAdmin, onDataChange }) {
  const [members, setMembers] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [newRowLabel, setNewRowLabel] = useState("");
  const [addingRow, setAddingRow] = useState(false);
  const [interestRate, setInterestRate] = useState(10);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const [m, r, gs, repayments] = await Promise.all([
      api.entities.Member.filter({ status: "Active" }),
      api.entities.GroupSummaryTable.list("row_order", 50),
      api.entities.GroupSettings.list(),
      api.entities.Repayment.list(),
    ]);

    // Calculate live verified repayment totals per member
    const repaymentMap = {};
    (repayments || []).forEach(rep => {
      if (rep.status === "Verified" || !rep.status) {
        const amt = parseFloat(rep.amount) || 0;
        repaymentMap[rep.member_id] = (repaymentMap[rep.member_id] || 0) + amt;
      }
    });

    const sortedRows = r.sort((a, b) => a.row_order - b.row_order);

    // Auto-update 'Repayment' row with aggregated repayment totals
    const repaymentRow = sortedRows.find(row => row.row_label === "Repayment");
    if (repaymentRow) {
      const currentVals = repaymentRow.values || {};
      const updatedVals = { ...currentVals };
      let changed = false;

      m.forEach(mem => {
        const liveTotal = repaymentMap[mem.id] || 0;
        if (liveTotal > 0 && currentVals[mem.id] !== liveTotal) {
          updatedVals[mem.id] = liveTotal;
          changed = true;
        }
      });

      if (changed) {
        repaymentRow.values = updatedVals;
        api.entities.GroupSummaryTable.update(repaymentRow.id, { values: updatedVals }).catch(console.error);
      }
    }

    setMembers(m);
    setRows(sortedRows);
    setInterestRate(gs[0]?.interest_rate || 10);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const initializeDefaults = async () => {
    setSaving(true);
    for (const row of DEFAULT_ROWS) {
      await api.entities.GroupSummaryTable.create({ ...row, values: {} });
    }
    toast({ title: "Table initialized with default rows" });
    setSaving(false);
    load();
    if (onDataChange) onDataChange();
  };

  const startEdit = () => {
    // Build editValues from rows
    const vals = {};
    rows.forEach(row => {
      vals[row.id] = { ...(row.values || {}) };
    });
    setEditValues(vals);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditValues({});
    setNewRowLabel("");
    setAddingRow(false);
  };

  const handleCellChange = (rowId, memberId, value) => {
    setEditValues(prev => {
      const newValues = { ...prev, [rowId]: { ...prev[rowId], [memberId]: value === "" ? "" : value } };
      // Auto-calculate interest when loan amount changes
      const loanAmountRow = rows.find(r => r.row_label === "Loan Amount");
      const interestRow = rows.find(r => r.row_label === "Interest");
      if (loanAmountRow && interestRow && rowId === loanAmountRow.id) {
        const loanAmount = parseFloat(value) || 0;
        const interest = Math.round(loanAmount * (interestRate / 100));
        newValues[interestRow.id] = {
          ...prev[interestRow.id],
          [memberId]: loanAmount > 0 ? String(interest) : "",
        };
      }
      return newValues;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    // Save each row and build the updated rows snapshot for syncing
    const savedRows = [];
    for (const row of rows) {
      const vals = editValues[row.id] || {};
      const numericVals = {};
      Object.entries(vals).forEach(([k, v]) => {
        numericVals[k] = v === "" || v === "-" ? null : parseFloat(v) || 0;
      });
      await api.entities.GroupSummaryTable.update(row.id, { values: numericVals });
      savedRows.push({ ...row, values: numericVals });
    }

    // Propagate to Contributions and Loans so every page stays in sync
    try {
      await syncSummaryToEntities(savedRows, members, interestRate);
      toast({ title: "Table saved" });
    } catch (e) {
      console.error("Summary sync failed", e);
      toast({
        title: "Table saved, but sync to Loans/Contributions failed",
        description: e.message,
        variant: "destructive",
      });
    }

    setSaving(false);
    setEditing(false);
    load();
    if (onDataChange) onDataChange();
  };

  const handleAddRow = async () => {
    if (!newRowLabel.trim()) return;
    setSaving(true);
    const maxOrder = rows.length > 0 ? Math.max(...rows.map(r => r.row_order)) : 0;
    await api.entities.GroupSummaryTable.create({ row_label: newRowLabel.trim(), row_order: maxOrder + 1, values: {}, highlight: false });
    setNewRowLabel("");
    setAddingRow(false);
    setSaving(false);
    load();
    if (onDataChange) onDataChange();
  };

  const handleDeleteRow = async (rowId) => {
    if (!confirm("Delete this row?")) return;
    await api.entities.GroupSummaryTable.delete(rowId);
    load();
    if (onDataChange) onDataChange();
  };

  const getRowTotal = (row) => {
    const vals = editing ? (editValues[row.id] || {}) : (row.values || {});
    return members.reduce((sum, m) => {
      const v = vals[m.id];
      return sum + (v === "" || v === null || v === undefined || v === "-" ? 0 : parseFloat(v) || 0);
    }, 0);
  };

  if (loading) return <div className="h-24 flex items-center justify-center"><div className="w-6 h-6 border-4 border-fuchsia-200 border-t-fuchsia-500 rounded-full animate-spin" /></div>;

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">Group Summary Table</h3>
          <p className="text-xs text-gray-400 mt-0.5">Financial breakdown per member</p>
        </div>
        {isAdmin && !editing && (
          <Button size="sm" variant="outline" onClick={startEdit} className="gap-1">
            <Pencil size={14} /> Edit
          </Button>
        )}
        {isAdmin && editing && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={cancelEdit} className="gap-1"><X size={14} /> Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="bg-fuchsia-500 hover:bg-fuchsia-600 gap-1">
              <Check size={14} /> {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-sm text-gray-400 mb-3">No table data yet.</p>
          {isAdmin && (
            <Button size="sm" onClick={initializeDefaults} disabled={saving} className="bg-fuchsia-500 hover:bg-fuchsia-600">
              {saving ? "Initializing..." : "Initialize Default Rows"}
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left py-2.5 px-3 font-semibold text-gray-600 min-w-[160px] sticky left-0 bg-gray-50 z-10">Category</th>
                {members.map(m => (
                  <th key={m.id} className="text-right py-2.5 px-2 font-medium text-gray-500 min-w-[85px] whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      <div className="w-5 h-5 rounded-full bg-fuchsia-100 border border-fuchsia-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {m.photo_url ? (
                          <img src={m.photo_url} alt={m.full_name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[10px] font-bold text-fuchsia-700">{m.full_name?.charAt(0)}</span>
                        )}
                      </div>
                      <span>{m.full_name.split(" ")[0]}</span>
                    </div>
                  </th>
                ))}
                <th className="text-right py-2.5 px-3 font-semibold text-gray-700 min-w-[90px]">Totals</th>
                {isAdmin && editing && <th className="py-2.5 px-2 w-8"></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const vals = editing ? (editValues[row.id] || {}) : (row.values || {});
                const total = getRowTotal(row);
                return (
                  <tr
                    key={row.id}
                    className={`border-b border-gray-50 ${row.highlight ? "bg-yellow-50 font-semibold" : "hover:bg-gray-50"}`}
                  >
                    <td className={`py-2 px-3 text-gray-700 sticky left-0 z-10 ${row.highlight ? "bg-yellow-50 font-semibold" : "bg-white"}`}>
                      {row.row_label}
                    </td>
                    {members.map(m => (
                      <td key={m.id} className="py-1.5 px-2 text-right">
                        {editing ? (
                          <input
                            type="text"
                            value={vals[m.id] ?? ""}
                            onChange={e => handleCellChange(row.id, m.id, e.target.value)}
                            className="w-16 text-right border border-gray-200 rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400"
                            placeholder="-"
                          />
                        ) : (
                          <span className={vals[m.id] !== null && vals[m.id] !== undefined && vals[m.id] !== "" ? "text-gray-800" : "text-gray-300"}>
                            {vals[m.id] !== null && vals[m.id] !== undefined && vals[m.id] !== ""
                              ? Number(vals[m.id]).toLocaleString()
                              : "-"}
                          </span>
                        )}
                      </td>
                    ))}
                    <td className={`py-2 px-3 text-right font-semibold ${row.highlight ? "text-emerald-700" : "text-gray-700"}`}>
                      {total > 0 ? total.toLocaleString() : "-"}
                    </td>
                    {isAdmin && editing && (
                      <td className="py-2 px-2">
                        <button onClick={() => handleDeleteRow(row.id)} className="text-red-400 hover:text-red-600">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Row */}
      {isAdmin && editing && (
        <div className="p-3 border-t border-gray-100">
          {addingRow ? (
            <div className="flex gap-2 items-center">
              <Input
                value={newRowLabel}
                onChange={e => setNewRowLabel(e.target.value)}
                placeholder="Row label (e.g. June Repayment)"
                className="text-xs h-7"
                onKeyDown={e => e.key === "Enter" && handleAddRow()}
              />
              <Button size="sm" onClick={handleAddRow} disabled={saving || !newRowLabel.trim()} className="bg-fuchsia-500 hover:bg-fuchsia-600 h-7 text-xs">Add</Button>
              <Button size="sm" variant="outline" onClick={() => { setAddingRow(false); setNewRowLabel(""); }} className="h-7 text-xs">Cancel</Button>
            </div>
          ) : (
            <button onClick={() => setAddingRow(true)} className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium">
              <Plus size={13} /> Add Row
            </button>
          )}
        </div>
      )}
    </div>
  );
}
