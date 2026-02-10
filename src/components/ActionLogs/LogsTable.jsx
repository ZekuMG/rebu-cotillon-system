import React from 'react';
import {
  Calendar,
  ChevronsUpDown,
  ChevronUp,
  ChevronDown,
  Eye,
  Search,
  TrendingDown,
  UserCog,
  UserPlus,
  UserMinus,
  Trophy,
  ShoppingCart,
  XCircle,
  CreditCard,
  Edit,
  ArrowRight,
  Package,
  PlusCircle,
  MinusCircle,
  DollarSign,
  Clock,
  Power,
  Trash2,
  Tag,
  List,
  CheckCircle
} from 'lucide-react';
import { formatPrice } from '../../utils/helpers';

// Helper local para extraer ID de transacción
const getTransactionId = (details) => {
  if (!details || typeof details === 'string') return null;
  const id = details.transactionId || details.id;
  if (!id) return null;
  if (typeof id === 'string' && id.includes('TRX-')) {
    return id.replace('TRX-', '');
  }
  return id;
};

// Componente para el Icono de Ordenamiento
const SortIcon = ({ column, sortColumn, sortDirection }) => {
  if (sortColumn !== column)
    return <ChevronsUpDown size={14} className="text-slate-300" />;
  return sortDirection === 'asc' ? (
    <ChevronUp size={14} className="text-amber-600" />
  ) : (
    <ChevronDown size={14} className="text-amber-600" />
  );
};

export default function LogsTable({
  sortedLogs,
  sortColumn,
  sortDirection,
  onSort,
  onViewDetails
}) {

  // --- LÓGICA DE RESUMEN VISUAL (Badges en la tabla) ---
  const getSummary = (log) => {
    const action = log.action;
    const details = log.details;
    const reason = log.reason;

    if (!details) return <span className="text-slate-400 italic">Sin detalles</span>;
    if (typeof details === 'string') return <span className="text-slate-600 text-[10px]">{details}</span>;

    switch (action) {
      // --- GASTOS ---
      case 'Nuevo Gasto':
        return (
            <div className="flex items-center gap-2 flex-wrap">
                <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1">
                    <TrendingDown size={10} /> -${formatPrice(details.amount)}
                </span>
                <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-medium border border-slate-200">
                    {details.category}
                </span>
                {details.paymentMethod && (
                    <span className="text-slate-500 text-[10px]">
                        {details.paymentMethod}
                    </span>
                )}
            </div>
        );

      // --- SOCIOS ---
      case 'Nuevo Socio':
      case 'Edición de Puntos':
      case 'Edición de Socio':
      case 'Baja de Socio':
        const isNew = action === 'Nuevo Socio';
        const isDelete = action === 'Baja de Socio';
        
        const pointsDiff = details.pointsChange ? details.pointsChange.diff : details.diff;
        const changesCount = details.changes ? details.changes.length : (details.updates || []).length;

        let badgeClass = 'bg-blue-100 text-blue-700';
        let Icon = UserCog;
        let label = 'Edición';

        if (isNew) { badgeClass = 'bg-green-100 text-green-700'; Icon = UserPlus; label = 'Alta'; } 
        else if (isDelete) { badgeClass = 'bg-red-100 text-red-700'; Icon = UserMinus; label = 'Baja'; } 
        else if (action === 'Edición de Puntos') { label = 'Puntos'; Icon = Trophy; badgeClass = 'bg-purple-100 text-purple-700'; }

        return (
           <div className="flex items-center gap-2 flex-wrap">
             <span className={`${badgeClass} px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1`}>
               <Icon size={10} /> {label}
             </span>
             <span className={`text-[10px] font-bold ${isDelete ? 'text-slate-500 line-through' : 'text-slate-700'}`}>
               {details.name || details.member}
             </span>
             {details.number && (
               <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-[10px] font-mono border border-slate-200">
                 #{String(details.number).padStart(4, '0')}
               </span>
             )}
             {pointsDiff !== undefined && (
                <span className={`ml-auto px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${pointsDiff > 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                {pointsDiff > 0 ? '+' : ''}{pointsDiff} pts
                </span>
             )}
             {action === 'Edición de Socio' && changesCount > 0 && (
                <span className="ml-auto text-slate-400 text-[10px] italic">({changesCount} cambios)</span>
             )}
           </div>
        );

      // --- VENTAS ---
      case 'Venta Realizada': {
        const txId = getTransactionId(details);
        const items = details.items || [];
        const totalQty = items.reduce((sum, i) => sum + (i.qty || i.quantity || 0), 0);
        const total = details.total || 0;
        return (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1">
              <ShoppingCart size={10} /> #{txId}
            </span>
            <span className="bg-fuchsia-100 text-fuchsia-700 px-2 py-0.5 rounded text-[10px] font-bold">
              ${formatPrice(total)}
            </span>
            <span className="text-slate-500 text-[10px]">
              {totalQty} uds ({items.length} items)
            </span>
            <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px]">
              {details.payment || 'N/A'}
            </span>
          </div>
        );
      }

      case 'Venta Anulada': {
        const txId = getTransactionId(details);
        return (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1">
              <XCircle size={10} /> #{txId}
            </span>
            <span className="text-red-500 text-[10px] line-through">
              ${formatPrice(details.originalTotal || details.total || 0)}
            </span>
            {reason && (
              <span className="text-amber-600 text-[10px] italic truncate max-w-[150px]">"{reason}"</span>
            )}
          </div>
        );
      }

      case 'Modificación Pedido': {
        const txId = getTransactionId(details);
        const changes = details.changes || {};
        return (
          <div className="flex items-center gap-2 flex-wrap">
            {txId && (<span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1"><Edit size={10} /> #{txId}</span>)}
            {changes.total && (
              <span className="text-[10px] flex items-center gap-1">
                <span className="text-red-400 line-through">${formatPrice(changes.total.old)}</span>
                <ArrowRight size={10} className="text-slate-400" />
                <span className="text-green-600 font-bold">${formatPrice(changes.total.new)}</span>
              </span>
            )}
            {!txId && !changes.total && (<span className="text-slate-400 text-[10px] italic">Sin cambios registrados</span>)}
          </div>
        );
      }

      // --- PRODUCTOS / CAJA ---
      case 'Edición Producto': 
      case 'Alta de Producto':
      case 'Baja Producto':
        const productName = details.product || details.title || details.name || 'Producto';
        const prodIcon = action === 'Baja Producto' ? <MinusCircle size={10}/> : action === 'Alta de Producto' ? <PlusCircle size={10}/> : <Package size={10}/>;
        const prodColor = action === 'Baja Producto' ? 'bg-red-100 text-red-700' : action === 'Alta de Producto' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700';
        return (
            <div className="flex items-center gap-2 flex-wrap">
                <span className={`${prodColor} px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1`}>
                    {prodIcon} {productName}
                </span>
            </div>
        );

      case 'Apertura de Caja':
      case 'Cierre de Caja':
      case 'Cierre Automático':
        const isClose = action.includes('Cierre');
        return (
            <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 ${isClose ? 'bg-slate-800 text-white' : 'bg-green-100 text-green-700'}`}>
                    <DollarSign size={10} /> {isClose ? 'Cierre' : 'Apertura'}
                </span>
                <span className={`text-[10px] font-bold ${isClose ? 'text-slate-700' : 'text-green-700'}`}>
                    ${formatPrice(isClose ? details.finalBalance : details.amount)}
                </span>
            </div>
        );

      case 'Edición Masiva Categorías': {
        return (
          <div className="flex items-center gap-2 flex-wrap">
             <span className="bg-fuchsia-100 text-fuchsia-700 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1">
              <Tag size={10} /> Edición Masiva
            </span>
            <span className="text-slate-600 text-[10px] font-medium">
              {details.count} productos actualizados
            </span>
          </div>
        );
      }

      default:
        const txIdDefault = getTransactionId(details);
        if (txIdDefault) return <span className="text-slate-500 text-[10px]">Transacción #{txIdDefault}</span>;
        if (details.title || details.name) return <span className="text-slate-500 text-[10px]">{details.title || details.name}</span>;
        return <span className="text-slate-400 text-[10px]">Ver detalles...</span>;
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <table className="w-full text-xs text-left border-collapse">
        <thead className="bg-slate-50 text-slate-500 font-medium sticky top-0 shadow-sm z-10 border-b border-slate-200">
          <tr>
            <th
              className="px-4 py-3 w-36 cursor-pointer hover:bg-slate-100 transition-colors select-none"
              onClick={() => onSort('datetime')}
            >
              <div className="flex items-center gap-1">
                <Calendar size={12} className="text-slate-400" />
                Fecha / Hora
                <SortIcon column="datetime" sortColumn={sortColumn} sortDirection={sortDirection} />
              </div>
            </th>
            <th
              className="px-4 py-3 w-28 cursor-pointer hover:bg-slate-100 transition-colors select-none"
              onClick={() => onSort('user')}
            >
              <div className="flex items-center gap-1">
                Usuario
                <SortIcon column="user" sortColumn={sortColumn} sortDirection={sortDirection} />
              </div>
            </th>
            <th
              className="px-4 py-3 w-40 cursor-pointer hover:bg-slate-100 transition-colors select-none"
              onClick={() => onSort('action')}
            >
              <div className="flex items-center gap-1">
                Acción
                <SortIcon column="action" sortColumn={sortColumn} sortDirection={sortDirection} />
              </div>
            </th>
            <th className="px-4 py-3">Resumen</th>
            <th className="px-4 py-3 w-12 text-center">Info</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sortedLogs.map((log) => (
            <tr key={log.id} className="hover:bg-amber-50/60 transition-colors group">
              <td className="px-4 py-3">
                <div className="flex flex-col">
                  <span className="text-slate-700 font-bold">
                    {log.date || '-'}
                  </span>
                  <span className="text-slate-400 font-mono text-[10px]">
                    {log.timestamp}
                  </span>
                </div>
              </td>
              <td className="px-4 py-3">
                <span
                  className={`px-2 py-1 rounded-md font-bold text-[10px] border shadow-sm ${
                    log.user === 'Dueño'
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-100'
                      : log.user === 'Sistema'
                      ? 'bg-slate-100 text-slate-600 border-slate-200'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                  }`}
                >
                  {log.user}
                </span>
              </td>
              <td className="px-4 py-3 font-bold text-slate-700 text-[11px]">
                {log.action}
              </td>
              <td className="px-4 py-3">{getSummary(log)}</td>
              <td className="px-4 py-3 text-center">
                <button
                  onClick={() => onViewDetails(log)}
                  className="text-slate-300 hover:text-amber-600 hover:bg-amber-100 p-2 rounded-lg transition-all transform hover:scale-110"
                >
                  <Eye size={16} />
                </button>
              </td>
            </tr>
          ))}
          {sortedLogs.length === 0 && (
            <tr>
              <td colSpan={5} className="text-center py-12 text-slate-400">
                <div className="flex flex-col items-center gap-2">
                  <Search size={32} className="text-slate-200" />
                  <p>No se encontraron registros que coincidan.</p>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}