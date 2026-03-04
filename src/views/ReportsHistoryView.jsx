// src/views/ReportsHistoryView.jsx

import React, { useState, useMemo } from 'react';
import {
  FileText,
  Search,
  Calendar,
  Clock,
  DollarSign,
  ChevronRight,
  TrendingUp,
  User,
  Filter
} from 'lucide-react';
// ♻️ FIX: Importamos normalizeDate de helpers y FancyPrice para la UI
import { normalizeDate } from '../utils/helpers';
import { FancyPrice } from '../components/FancyPrice';
import { DailyReportModal } from '../components/modals/DailyReportModal';

export default function ReportsHistoryView({ pastClosures, members }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedReport, setSelectedReport] = useState(null);
  const [typeFilter, setTypeFilter] = useState('Todas');

  // --- ORDENAMIENTO Y FILTRADO ---
  const sortedAndFilteredClosures = useMemo(() => {
    const safeClosures = Array.isArray(pastClosures) ? pastClosures : [];

    // 1. Ordenar: Más reciente primero
    const sorted = [...safeClosures].sort((a, b) => {
      const dateA = normalizeDate(a.date) || new Date(0);
      const dateB = normalizeDate(b.date) || new Date(0);
      
      if (dateA.getTime() !== dateB.getTime()) {
        return dateB.getTime() - dateA.getTime();
      }
      
      const timeB = parseInt(String(b.id).replace(/\D/g, '')) || 0;
      const timeA = parseInt(String(a.id).replace(/\D/g, '')) || 0;
      return timeB - timeA;
    });

    // 2. Filtrar
    return sorted.filter(report => {
      const term = searchTerm.toLowerCase();
      const matchesSearch = 
        (report.date?.toLowerCase().includes(term)) ||
        (report.user?.toLowerCase().includes(term)) ||
        (String(report.id).toLowerCase().includes(term));
      
      const matchesType = 
        typeFilter === 'Todas' || 
        report.type === typeFilter;

      return matchesSearch && matchesType;
    });
  }, [pastClosures, searchTerm, typeFilter]);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-100">
      
      {/* HEADER (ESTILO INVENTARIO) */}
      <div className="p-4 bg-white border-b shrink-0 flex flex-wrap gap-3 justify-between items-center z-30 relative shadow-sm">
        <div className="flex items-center gap-2 flex-1 min-w-[300px]">
          {/* Buscador */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Buscar por fecha, ID o usuario..." 
              className="w-full pl-10 pr-4 py-2 border rounded-lg bg-slate-50 focus:bg-white focus:ring-2 focus:ring-fuchsia-500 outline-none transition-all text-sm" 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
            />
          </div>
          {/* Filtro de Tipo (Símil Categoría) */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <select 
              className="pl-9 pr-8 py-2 border rounded-lg bg-slate-50 text-sm focus:ring-2 focus:ring-fuchsia-500 outline-none appearance-none cursor-pointer"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="Todas">Todos los tipos</option>
              <option value="Manual">Manual</option>
              <option value="Automático">Automático</option>
            </select>
          </div>
        </div>

        {/* Título de Vista */}
        <div className="hidden md:flex items-center gap-3 px-4 py-2 bg-fuchsia-50 rounded-lg border border-fuchsia-100">
           <FileText className="text-fuchsia-600" size={18} />
           <span className="text-sm font-bold text-fuchsia-900 uppercase tracking-tight">Registro de Cierres</span>
        </div>
      </div>

      {/* CUERPO / GRID DE REPORTES */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {sortedAndFilteredClosures.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400">
            <FileText size={64} className="mb-4 text-slate-300" />
            <p className="text-lg font-medium">No se encontraron reportes</p>
            <p className="text-sm">Intenta ajustar los filtros de búsqueda</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-8">
            {sortedAndFilteredClosures.map((report) => (
              <button
                key={report.id}
                onClick={() => setSelectedReport(report)}
                className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col cursor-pointer transition-all hover:shadow-xl hover:border-fuchsia-300 group relative"
              >
                {/* Tipo de Cierre Badge */}
                <div className={`absolute top-0 right-0 px-2 py-1 rounded-bl-lg text-[10px] font-bold text-white shadow-sm
                  ${report.type === 'Automático' ? 'bg-amber-500' : 'bg-slate-700'}`}>
                    {report.type === 'Automático' ? 'AUTO' : 'MANUAL'}
                </div>

                {/* Header Card */}
                <div className="p-4 border-b border-slate-50 bg-slate-50/50 flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-1.5 text-fuchsia-700 font-bold mb-1 text-sm">
                      <Calendar size={16} />
                      <span>{report.date}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Clock size={12} />
                      <span>{report.closeTime || '??:??'}</span>
                    </div>
                  </div>
                  <div className="bg-white text-slate-400 p-1.5 rounded-lg border shadow-sm group-hover:text-fuchsia-500 transition-colors">
                    <FileText size={18} />
                  </div>
                </div>

                {/* Body Card */}
                <div className="p-4 space-y-4 flex-1 w-full text-left">
                  <div className="flex justify-between items-end">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Ventas</span>
                    {/* ♻️ FIX: Aplicamos FancyPrice al Total Ventas */}
                    <span className="text-2xl font-black text-slate-800 leading-none">
                      <FancyPrice amount={report.totalSales} />
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 pt-3 border-t border-dashed border-slate-100">
                    <div>
                      <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Operaciones</p>
                      <div className="flex items-center gap-1 text-sm font-bold text-slate-700">
                        <TrendingUp size={14} className="text-blue-500" /> {report.salesCount}
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Ganancia Neta</p>
                      <div className={`flex items-center gap-1 text-sm font-bold ${report.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {/* ♻️ FIX: Aplicamos FancyPrice a la Ganancia Neta */}
                        <DollarSign size={14} className="shrink-0" />
                        <FancyPrice amount={report.netProfit} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer Card */}
                <div className="px-4 py-3 w-full bg-slate-50 border-t border-slate-100 flex justify-between items-center text-xs">
                  <div className="flex items-center gap-1.5 text-slate-500 font-bold">
                    <User size={12} className="text-slate-400" />
                    {report.user || 'Sistema'}
                  </div>
                  <span className="text-fuchsia-600 font-bold flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                    Ver Detalle <ChevronRight size={14} />
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* MODAL DETALLE */}
      <DailyReportModal 
        isOpen={!!selectedReport} 
        onClose={() => setSelectedReport(null)} 
        report={selectedReport} 
        members={members} 
      />

    </div>
  );
}