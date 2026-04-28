// src/components/ActionLogs/LogsControls.jsx
import React, { useState, useRef, useEffect } from 'react';
import {
  FilterX,
  Calendar,
  ChevronDown,
  Search,
  Activity
} from 'lucide-react';

// ════════════════════════════════════════════
//  CONSTANTES DE AGRUPACIÓN (Categorías)
// ════════════════════════════════════════════

import { ACTION_GROUPS } from './logHelpers';

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
  userFilterOptions = [],
  filterAction, setFilterAction,
  filterSearch, setFilterSearch,
  uniqueActions = []
}) {
  const [isUserFilterOpen, setIsUserFilterOpen] = useState(false);
  const userFilterRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userFilterRef.current && !userFilterRef.current.contains(event.target)) {
        setIsUserFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedUserFilter = userFilterOptions.find((option) => option.key === filterUser) || null;

  return (
    <div className="px-2.5 py-1.5 border-b border-slate-200 bg-slate-50 shrink-0 flex flex-wrap items-center gap-1.5 relative z-20">
      
      {/* Botón Limpiar */}
      {hasActiveFilters && (
        <button
          onClick={onClearFilters}
          className="flex items-center gap-1 px-2 h-[28px] text-[11px] font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors border border-red-100 shrink-0"
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
          className="w-full pl-8 pr-2 py-1 text-[11px] border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white transition-all h-[28px] shadow-sm"
          value={filterSearch}
          onChange={(e) => setFilterSearch(e.target.value)}
        />
      </div>

      {/* Acción Dropdown */}
      <div className="w-[190px] relative shrink-0">
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

      {/* Usuario */}
      <div className="w-[180px] relative shrink-0" ref={userFilterRef}>
        <button
          type="button"
          onClick={() => setIsUserFilterOpen((prev) => !prev)}
          className="w-full px-2.5 text-[11px] border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white cursor-pointer transition-all h-[28px] shadow-sm flex items-center justify-between gap-2"
        >
          {selectedUserFilter ? (
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/80 shadow-sm"
                style={{ backgroundColor: selectedUserFilter.color }}
              />
              <span className="truncate font-medium text-slate-700">{selectedUserFilter.displayName}</span>
            </span>
          ) : (
            <span className="truncate font-medium text-slate-700">Todos los Usuarios</span>
          )}
          <ChevronDown
            size={12}
            className={`text-slate-400 transition-transform duration-200 ${isUserFilterOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {isUserFilterOpen && (
          <div className="absolute top-full left-0 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-[260px] overflow-y-auto py-1 custom-scrollbar">
            <button
              type="button"
              onClick={() => {
                setFilterUser('');
                setIsUserFilterOpen(false);
              }}
              className={`w-full text-left px-3 py-1.5 text-[10px] transition ${
                !selectedUserFilter ? 'bg-slate-100 text-slate-800 font-semibold' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              Todos los Usuarios
            </button>

            {userFilterOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => {
                  setFilterUser(option.key);
                  setIsUserFilterOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[10px] transition ${
                  selectedUserFilter?.key === option.key ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
                }`}
                style={{
                  boxShadow: selectedUserFilter?.key === option.key ? `inset 3px 0 0 ${option.color}` : undefined,
                }}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/80 shadow-sm"
                  style={{ backgroundColor: option.color }}
                />
                <span className="truncate font-medium">{option.displayName}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Fechas: Desde - Hasta */}
      <div className="flex items-center gap-1 shrink-0 bg-white border border-slate-200 rounded-lg px-1 py-0.5 shadow-sm">
        <div className="relative w-[106px]">
          <Calendar size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="date"
            className="w-full pl-6 pr-1 py-1 text-[10px] border-none rounded-md outline-none bg-transparent h-[22px] cursor-pointer"
            value={filterDateStart}
            onChange={(e) => setFilterDateStart(e.target.value)}
            title="Fecha Desde"
          />
        </div>
        <span className="text-slate-300 text-[9px] px-1">-</span>
        <div className="relative w-[106px]">
          <input
            type="date"
            className="w-full px-2 py-1 text-[10px] border-none rounded-md outline-none bg-transparent h-[22px] cursor-pointer"
            value={filterDateEnd}
            onChange={(e) => setFilterDateEnd(e.target.value)}
            title="Fecha Hasta"
          />
        </div>
      </div>

    </div>
  );
}
