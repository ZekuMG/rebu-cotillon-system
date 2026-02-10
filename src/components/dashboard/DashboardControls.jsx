// src/components/dashboard/DashboardControls.jsx
// ♻️ REFACTOR: Extraído de DashboardView.jsx — GlobalTimeSwitch + LayoutManagerControls

import React from 'react';
import {
  Calendar,
  CalendarRange,
  Clock,
  Save,
  RotateCcw,
} from 'lucide-react';

export const GlobalTimeSwitch = ({ globalFilter, setGlobalFilter }) => (
  <div className="flex gap-1 bg-white border border-slate-200 p-0.5 rounded-lg">
    {[
      { id: 'day', label: 'Diario', Icon: Clock },
      { id: 'week', label: 'Semanal', Icon: Calendar },
      { id: 'month', label: 'Mensual', Icon: CalendarRange },
    ].map((opt) => (
      <button
        key={opt.id}
        onClick={() => setGlobalFilter(opt.id)}
        className={`text-xs px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 ${
          globalFilter === opt.id
            ? 'bg-slate-800 text-white font-bold shadow-md'
            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
        }`}
      >
        <opt.Icon size={12} />
        {opt.label}
      </button>
    ))}
  </div>
);

export const LayoutManagerControls = ({ isAdmin, hasUnsavedChanges, onSave, onRestore }) => {
  if (!isAdmin || !hasUnsavedChanges) return null;

  return (
    <div className="flex gap-2 animate-in fade-in slide-in-from-right-2 duration-200">
      <button
        onClick={onRestore}
        className="p-2 rounded-lg bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 shadow-sm transition-all"
        title="Deshacer cambios (Restaurar)"
      >
        <RotateCcw size={16} />
      </button>
      <button
        onClick={onSave}
        className="p-2 rounded-lg bg-blue-600 text-white border border-blue-600 shadow-md hover:bg-blue-700 transition-all"
        title="Guardar nueva distribución"
      >
        <Save size={16} />
      </button>
    </div>
  );
};
