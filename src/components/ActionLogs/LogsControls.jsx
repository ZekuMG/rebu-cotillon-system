import React, { useState, useRef, useEffect } from 'react';
import {
  FileText,
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
  // 🔧 FIX: Solo "Venta Modificada" — "Modificación Pedido" se normaliza abajo en el filtro
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

  // Cerrar el menú al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 🔧 FIX: Normalizar uniqueActions para que "Modificación Pedido" de la BD
  // cuente como "Venta Modificada" → así aparece una sola vez en el dropdown
  const normalizedUniqueActions = [...new Set(
    uniqueActions.map(a => a === 'Modificación Pedido' ? 'Venta Modificada' : a)
  )];

  // Filtrar grupos para mostrar solo acciones que existen en la BD
  const availableGroups = ACTION_GROUPS.map(group => ({
    ...group,
    actions: group.actions.filter(action => normalizedUniqueActions.includes(action))
  })).filter(group => group.actions.length > 0);

  // Mapear acciones huérfanas
  const mappedActions = ACTION_GROUPS.flatMap(g => g.actions);
  const unmappedActions = normalizedUniqueActions.filter(a => !mappedActions.includes(a) && a !== '' && a !== 'Todas');
  
  if (unmappedActions.length > 0) {
    availableGroups.push({ label: '📌 Otros', actions: unmappedActions });
  }

  // Helper para saber qué mostrar en el botón
  const displayValue = !value || value === '' || value === 'Todas' 
    ? 'Todas las acciones' 
    : (value === 'Modificación Pedido' ? 'Venta Modificada' : value);

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full text-left pl-8 pr-8 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all truncate shadow-sm flex items-center h-[30px]"
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
        <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-[350px] overflow-y-auto py-1 custom-scrollbar animate-in fade-in zoom-in-95 duration-100">
          {/* Opción "Todas" */}
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

          {/* Renderizado de Grupos */}
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
  // Datos
  totalLogs,
  uniqueActions,
  hasActiveFilters,
  // Actions
  onClearFilters,
  // Estados de Filtros (Binding bidireccional)
  filterDateStart, setFilterDateStart,
  filterDateEnd, setFilterDateEnd,
  filterUser, setFilterUser,
  filterAction, setFilterAction,
  filterSearch, setFilterSearch,
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
            Acciones registradas: {totalLogs}
          </span>
        </div>
      </div>

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
              className="w-full pl-7 pr-1 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white transition-all h-[30px]"
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
              className="w-full pl-7 pr-1 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white transition-all h-[30px]"
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
              className="w-full pl-7 pr-6 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white appearance-none cursor-pointer transition-all h-[30px]"
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

        {/* Acción (AHORA CON CUSTOM DROPDOWN) */}
        <div className="flex-1 min-w-[150px] max-w-[220px]">
          <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">
            Acción
          </label>
          <div className="relative">
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
              className="w-full pl-7 pr-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white transition-all h-[30px]"
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}