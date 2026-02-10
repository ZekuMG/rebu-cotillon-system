import React from 'react';
import {
  FileText,
  FilterX,
  Wand2,
  Trash2,
  Calendar,
  User,
  ChevronDown,
  Search
} from 'lucide-react';

export default function LogsControls({
  // Datos
  totalLogs,
  uniqueActions,
  hasActiveFilters,
  // Actions
  onClearFilters,
  onShowGenerator,
  onShowDelete,
  // Estados de Filtros (Binding bidireccional)
  filterDateStart, setFilterDateStart,
  filterDateEnd, setFilterDateEnd,
  filterUser, setFilterUser,
  filterAction, setFilterAction,
  filterSearch, setFilterSearch,
  // Permisos (opcional, por si quieres ocultar botones)
  canEdit = true
}) {
  return (
    <div className="p-3 border-b border-slate-200 bg-slate-50 shrink-0">
      {/* Header Superior */}
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
          <div className="bg-amber-100 p-1.5 rounded-lg text-amber-600">
            <FileText size={16} />
          </div> 
           Registro de Acciones
        </h3>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <button
              onClick={onClearFilters}
              className="flex items-center gap-1 px-2 py-1 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors border border-red-100"
            >
              <FilterX size={12} /> Limpiar
            </button>
          )}
          <span className="text-xs bg-white border border-slate-200 px-2 py-0.5 rounded-lg text-slate-600 font-bold shadow-sm">
            {totalLogs} reg
          </span>
        </div>
      </div>

      {/* Botones de Acción Globales */}
      {canEdit && (
        <div className="flex gap-2 mb-3">
          <button
            onClick={onShowGenerator}
            className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600 transition shadow-sm hover:shadow-md"
          >
            <Wand2 size={14} /> Generar Acciones de Prueba
          </button>
          <button
            onClick={onShowDelete}
            className="flex items-center gap-2 px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-bold hover:bg-red-600 transition shadow-sm hover:shadow-md"
          >
            <Trash2 size={14} /> Limpiar Registro
          </button>
        </div>
      )}

      {/* Grilla de Filtros */}
      <div className="flex flex-wrap gap-2 items-end">
        {/* Fecha Desde */}
        <div className="min-w-[120px]">
          <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">
            Desde
          </label>
          <div className="relative">
            <Calendar
              size={12}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="date"
              className="w-full pl-7 pr-1 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white transition-all"
              value={filterDateStart}
              onChange={(e) => setFilterDateStart(e.target.value)}
            />
          </div>
        </div>

        {/* Fecha Hasta */}
        <div className="min-w-[120px]">
          <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">
            Hasta
          </label>
          <div className="relative">
            <Calendar
              size={12}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="date"
              className="w-full pl-7 pr-1 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white transition-all"
              value={filterDateEnd}
              onChange={(e) => setFilterDateEnd(e.target.value)}
            />
          </div>
        </div>

        {/* Usuario */}
        <div className="min-w-[100px]">
          <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">
            Usuario
          </label>
          <div className="relative">
            <User
              size={12}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <select
              className="w-full pl-7 pr-6 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white appearance-none cursor-pointer transition-all"
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
            >
              <option value="">Todos</option>
              <option value="Dueño">Dueño</option>
              <option value="Vendedor">Vendedor</option>
              <option value="Sistema">Sistema</option>
            </select>
            <ChevronDown
              size={12}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
          </div>
        </div>

        {/* Acción */}
        <div className="min-w-[130px]">
          <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">
            Acción
          </label>
          <div className="relative">
            <FileText
              size={12}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <select
              className="w-full pl-7 pr-6 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white appearance-none cursor-pointer transition-all"
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
            >
              <option value="">Todas</option>
              {uniqueActions.map((act) => (
                <option key={act} value={act}>
                  {act}
                </option>
              ))}
            </select>
            <ChevronDown
              size={12}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
          </div>
        </div>

        {/* Buscar */}
        <div className="flex-1 min-w-[150px]">
          <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">
            Buscar
          </label>
          <div className="relative">
            <Search
              size={12}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="text"
              placeholder="Producto, ID, monto..."
              className="w-full pl-7 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white transition-all"
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}