import React from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from "recharts";
import { TrendingUp, Target } from "lucide-react";

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-gray-700 mb-1.5">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
          {p.name}: <span className="font-semibold">KES {(p.value || 0).toLocaleString()}</span>
        </p>
      ))}
    </div>
  );
};

export default function SavingsTargetChart({ chartData, monthlyTarget, cumulativeTarget, totalSavedOverride }) {
  const maxVal = Math.max(
    ...chartData.map(d => Math.max(d.actual || 0, d.target || 0, d.cumulative || 0)),
    cumulativeTarget || 0,
    totalSavedOverride || 0
  ) * 1.15;

  const chartCumulative = chartData.length > 0 ? chartData[chartData.length - 1]?.cumulative || 0 : 0;
  const latestCumulative = totalSavedOverride != null ? totalSavedOverride : chartCumulative;
  const overallTarget = cumulativeTarget || (chartData.length * monthlyTarget) || monthlyTarget;
  const progressPct = overallTarget > 0 ? Math.min(100, Math.round((latestCumulative / overallTarget) * 100)) : 0;
  const onTrack = latestCumulative >= (chartData.length > 0 ? chartData[chartData.length - 1]?.target || 0 : 0);

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-emerald-50 rounded-lg">
            <TrendingUp size={18} className="text-emerald-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Group Savings vs Monthly Target</h3>
            <p className="text-xs text-gray-500">Tracking cumulative savings growth</p>
          </div>
        </div>
        <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
          onTrack ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
        }`}>
          <Target size={12} />
          {onTrack ? "On Track" : "Below Target"}
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-gray-500">Overall Progress</span>
          <span className="text-xs font-semibold text-gray-700">{progressPct}% of target</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${onTrack ? "bg-emerald-500" : "bg-amber-400"}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-gray-400">KES {latestCumulative.toLocaleString()} saved</span>
          <span className="text-xs text-gray-400">Target: KES {overallTarget.toLocaleString()}</span>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11, fill: "#6b7280" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={v => `${(v / 1000).toFixed(0)}k`}
              domain={[0, maxVal]}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: "11px", paddingTop: "12px" }}
              formatter={v => <span style={{ color: "#6b7280" }}>{v}</span>}
            />
            <Bar dataKey="actual" name="Monthly Collected" fill="#22C55E" radius={[4, 4, 0, 0]} opacity={0.85} />
            <Bar dataKey="target" name="Monthly Target" fill="#FCD34D" radius={[4, 4, 0, 0]} />
            <Line
              type="monotone"
              dataKey="cumulative"
              name="Cumulative Savings"
              stroke="#2563eb"
              strokeWidth={2.5}
              dot={{ r: 4, fill: "#2563eb", strokeWidth: 0 }}
              activeDot={{ r: 6 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex flex-col items-center justify-center h-48 text-gray-400">
          <Target size={32} className="mb-2 opacity-40" />
          <p className="text-sm">No contribution data yet</p>
        </div>
      )}

      {/* Legend summary */}
      <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-gray-50">
        <div className="text-center">
          <p className="text-xs text-gray-500">Monthly Target</p>
          <p className="text-sm font-semibold text-gray-800">KES {monthlyTarget.toLocaleString()}</p>
        </div>
        <div className="text-center border-x border-gray-100">
          <p className="text-xs text-gray-500">Total Saved</p>
          <p className="text-sm font-semibold text-emerald-600">KES {latestCumulative.toLocaleString()}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-500">Gap</p>
          <p className={`text-sm font-semibold ${onTrack ? "text-emerald-600" : "text-amber-600"}`}>
            {onTrack ? "+" : "-"}KES {Math.abs(latestCumulative - overallTarget).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}