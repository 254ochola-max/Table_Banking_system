import React from "react";

export default function StatCard({ title, value, icon: Icon, color = "fuchsia", subtitle }) {
  const colorMap = {
    fuchsia: "bg-fuchsia-50 text-fuchsia-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    blue: "bg-blue-50 text-blue-600",
    rose: "bg-rose-50 text-rose-600",
    purple: "bg-purple-50 text-purple-600",
    sky: "bg-sky-50 text-sky-600",
  };

  return (
    <div className="rounded-2xl p-5 bg-white border border-gray-200 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
        </div>
        {Icon && (
          <div className={`p-2.5 rounded-xl ${colorMap[color] || colorMap.fuchsia}`}>
            <Icon size={20} />
          </div>
        )}
      </div>
    </div>
  );
}