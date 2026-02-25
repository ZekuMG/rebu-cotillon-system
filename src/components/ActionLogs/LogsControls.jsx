// src/components/ActionLogs/LogsControls.jsx
import React, { useState, useRef, useEffect } from 'react';
import {
  FilterX,
  Calendar,
  User,
  ChevronDown,
  Search,
  Activity
} from 'lucide-react';

// ════════════════════════════════════════════
//  CONSTANTES DE AGRUPACIÓN (Categorías)
// ════════════════════════════════════════════
const ACTION_GROUPS = [
  { label: '🛒 Ventas', actions: ['Venta Realizada', 'Venta Anulada', 'Venta Modificada'] },
  { label: '📦 Productos', actions: ['Alta de Producto', 'Edición Producto', 'Baja Producto', 'Producto Duplicado', 'Categoría', 'Actualización Masiva', 'Edición Masiva Categorías'] },
  { label: '👥 Socios', actions: ['Nuevo Socio', 'Edición de Socio', 'Edición de Puntos', 'Baja de Socio'] },
  { label: '💰 Caja / Finanzas', actions: ['Apertura de Caja', 'Cierre de Caja', 'Cierre Automático', 'Nuevo Gasto', 'Gasto', 'Nuevo Premio', 'Editar Premio', 'Eliminar Premio'] },
  { label: '⚙️ Sistema', actions: ['Login', 'Horario Modificado', 'Sistema Iniciado', 'Borrado Permanente'] }
];

// ════════════════════════════════════════════
//  COMPONENTE DROPDOWN CUSTOM
// ════════════════════════════════════════════
const CustomActionDropdown = ({ value, onChange, uniqueActions }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const normalizedUniqueActions = [...new Set(
    (uniqueActions || []).map(a => a === 'Modificación Pedido' ? 'Venta Modificada' : a)
  )];

  const availableGroups = ACTION_GROUPS.map(group => ({
    ...group,
    actions: group.actions.filter(action => normalizedUniqueActions.includes(action))
  })).filter(group => group.actions.length > 0);

  const mappedActions = ACTION_GROUPS.flatMap(g => g.actions);
  const unmappedActions = normalizedUniqueActions.filter(a => !mappedActions.includes(a) && a !== '' && a !== 'Todas');
  
  if (unmappedActions.length > 0) {
    availableGroups.push({ label: '📌 Otros', actions: unmappedActions });
  }

  const displayValue = !value || value === '' || value === 'Todas' 
    ? 'Todas las acciones' 
    : (value === 'Modificación Pedido' ? 'Venta Modificada' : value);

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full text-left pl-8 pr-7 text-xs border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all truncate shadow-sm flex items-center h-[30px]"
      >
        <span className="truncate flex-1 font-medium text-slate-700">
          {displayValue}
        </span>
        <ChevronDown
          size={12}
          className={`absolute right-2 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-[350px] overflow-y-auto py-1 custom-scrollbar animate-in fade-in zoom-in-95 duration-100">
          <button
            onClick={() => { onChange(''); setIsOpen(false); }}
            className={`w-full text-left px-4 py-2.5 text-xs transition-colors duration-150 border-b border-slate-100 ${
              !value || value === ''
                ? 'bg-blue-600 text-white font-bold' 
                : 'text-slate-700 hover:bg-slate-100 font-medium'
            }`}
          >
            Todas las acciones
          </button>

          {availableGroups.map((group, idx) => (
            <div key={idx} className="pb-1 pt-2">
              <div className="px-4 pb-1 pt-1 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-default select-none flex items-center gap-1.5 border-t border-slate-50 mt-1">
                {group.label}
              </div>
              {group.actions.map((action) => (
                <button
                  key={action}
                  onClick={() => { onChange(action); setIsOpen(false); }}
                  className={`w-full text-left pl-8 pr-4 py-2 text-xs transition-colors duration-150 flex items-center ${
                    value === action 
                      ? 'bg-blue-50 text-blue-700 font-bold border-l-2 border-blue-600' 
                      : 'text-slate-700 hover:bg-slate-100 font-medium border-l-2 border-transparent'
                  }`}
                >
                  {action}
                </button>
              ))}             
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ════════════════════════════════════════════
//  CONTENEDOR PRINCIPAL
// ════════════════════════════════════════════
export default function LogsControls({
  hasActiveFilters,
  onClearFilters,
  filterDateStart, setFilterDateStart,
  filterDateEnd, setFilterDateEnd,
  filterUser, setFilterUser,
  filterAction, setFilterAction,
  filterSearch, setFilterSearch,
  uniqueActions = []
}) {
  return (
    <div className="p-2 border-b border-slate-200 bg-slate-50 shrink-0 flex flex-wrap items-center gap-2 relative z-20">
      
      {/* Botón Limpiar */}
      {hasActiveFilters && (
        <button
          onClick={onClearFilters}
          className="flex items-center gap-1 px-2 h-[30px] text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors border border-red-100 shrink-0"
          title="Limpiar filtros"
        >
          <FilterX size={14} />
        </button>
      )}

      {/* Buscar */}
      <div className="flex-1 min-w-[180px] relative">
        <Search
          size={12}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        />
        <input
          type="text"
          placeholder="Buscar ID, monto, producto..."
          className="w-full pl-8 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white transition-all h-[30px] shadow-sm"
          value={filterSearch}
          onChange={(e) => setFilterSearch(e.target.value)}
        />
      </div>

      {/* Acción Dropdown */}
      <div className="w-[200px] relative shrink-0">
        <Activity
          size={12}
          className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none z-10"
        />
        <CustomActionDropdown 
          value={filterAction} 
          onChange={setFilterAction} 
          uniqueActions={uniqueActions} 
        />
      </div>

      {/* Usuario - FIX: Se quitó el py-1.5 para que el texto no se aplaste verticalmente */}
      <div className="w-[180px] relative shrink-0">
        <User
          size={12}
          className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        />
        <select
          className="w-full pl-7 pr-6 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white appearance-none cursor-pointer transition-all h-[30px] shadow-sm"
          value={filterUser}
          onChange={(e) => setFilterUser(e.target.value)}
        >
          <option value="">Todos los Usuarios</option>
          <option value="Dueño">Dueño</option>
          <option value="Vendedor">Vendedor</option>
          <option value="Sistema">Sistema</option>
        </select>
        <ChevronDown
          size={12}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        />
      </div>

      {/* Fechas: Desde - Hasta */}
      <div className="flex items-center gap-1 shrink-0 bg-white border border-slate-200 rounded-lg p-0.5 shadow-sm">
        <div className="relative w-[110px]">
          <Calendar size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="date"
            className="w-full pl-6 pr-1 py-1 text-[11px] border-none rounded-md outline-none bg-transparent h-[24px] cursor-pointer"
            value={filterDateStart}
            onChange={(e) => setFilterDateStart(e.target.value)}
            title="Fecha Desde"
          />
        </div>
        <span className="text-slate-300 text-[10px] px-1">-</span>
        <div className="relative w-[110px]">
          <input
            type="date"
            className="w-full px-2 py-1 text-[11px] border-none rounded-md outline-none bg-transparent h-[24px] cursor-pointer"
            value={filterDateEnd}
            onChange={(e) => setFilterDateEnd(e.target.value)}
            title="Fecha Hasta"
          />
        </div>
      </div>

    </div>
  );
}