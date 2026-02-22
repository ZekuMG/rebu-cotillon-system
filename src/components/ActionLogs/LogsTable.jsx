import React from 'react';
import {
  ChevronsUpDown,
  ChevronUp,
  ChevronDown,
  Eye,
  Search
} from 'lucide-react';
import { formatPrice } from '../../utils/helpers';

const getTransactionId = (details) => {
  if (!details || typeof details === 'string') return null;
  const id = details.transactionId || details.id;
  if (!id) return null;
  if (typeof id === 'string' && id.includes('TRX-')) {
    return id.replace('TRX-', '');
  }
  return id;
};

const SortIcon = ({ column, sortColumn, sortDirection }) => {
  if (sortColumn !== column)
    return <ChevronsUpDown size={14} className="text-slate-300 ml-1 inline" />;
  return sortDirection === 'asc' ? (
    <ChevronUp size={14} className="text-amber-600 ml-1 inline" />
  ) : (
    <ChevronDown size={14} className="text-amber-600 ml-1 inline" />
  );
};

const s = {
  table: "w-full border-collapse bg-white rounded-xl overflow-hidden border border-[#e2e8f0] shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
  th: "text-left p-[10px_14px] text-[9px] font-bold uppercase tracking-[0.5px] text-[#94a3b8] border-b border-[#e2e8f0] bg-[#f8fafc] cursor-pointer hover:bg-slate-100 select-none transition-colors",
  td: "p-[11px_14px] text-[11px] border-b border-[#f1f5f9] align-middle",
  tr: "cursor-pointer transition-colors duration-150 hover:bg-[#fef3c7]",
  trSelected: "bg-[#fef9c3]",
  date: "font-bold text-[#1e293b] text-[11px]",
  time: "font-mono text-[9px] text-[#94a3b8]",
  al: "font-bold text-[10px] text-[#1e293b]", 
  ubAdm: "inline-flex px-[7px] py-[2px] rounded-[5px] text-[9px] font-bold bg-[#eef2ff] text-[#4f46e5] border border-[#e0e7ff]",
  ubSel: "inline-flex px-[7px] py-[2px] rounded-[5px] text-[9px] font-bold bg-[#ecfdf5] text-[#059669] border border-[#d1fae5]",
  ubSys: "inline-flex px-[7px] py-[2px] rounded-[5px] text-[9px] font-bold bg-[#f1f5f9] text-[#64748b] border border-[#e2e8f0]",
  sr: "flex items-center gap-[5px] flex-wrap",
  se: "text-[9px] text-[#64748b]", 
  ss: "w-[1px] h-[11px] bg-[#e2e8f0]", 
  ib: "w-[26px] h-[26px] rounded-[6px] text-[#94a3b8] flex items-center justify-center transition-all duration-150 hover:bg-[#fef3c7] hover:text-[#d97706] hover:scale-110 mx-auto",
  b: "inline-flex items-center gap-[3px] px-[7px] py-[2px] rounded-[4px] text-[9px] font-bold",
};

const c = {
  bg: "bg-[#dcfce7] text-[#15803d]", 
  br: "bg-[#fee2e2] text-[#dc2626]", 
  bf: "bg-[#fae8ff] text-[#a21caf]", 
  bv: "bg-[#ede9fe] text-[#6d28d9]", 
  bs: "bg-[#f1f5f9] text-[#475569] border border-[#e2e8f0]", 
  bb: "bg-[#dbeafe] text-[#2563eb]", 
  bo: "bg-[#fff7ed] text-[#c2410c]", 
  bk: "bg-[#1e293b] text-white",     
  bi: "bg-[#eef2ff] text-[#4338ca]", 
  ba: "bg-[#fef3c7] text-[#b45309]", 
  bp: "bg-[#fae8ff] text-[#a21caf]"  
};

export default function LogsTable({
  sortedLogs,
  sortColumn,
  sortDirection,
  onSort,
  onViewDetails,
  selectedLogId
}) {

  const getSummary = (log) => {
    const action = log.action;
    const d = log.details;
    const reason = log.reason;

    if (!d) return <span className="text-slate-400 italic text-[10px]">Sin detalles</span>;
    if (typeof d === 'string') return <span className="text-slate-600 text-[10px]">{d}</span>;

    switch (action) {
      case 'Venta Realizada': {
        const txId = getTransactionId(d);
        const items = d.items || [];
        let totalUnits = 0; let totalGrams = 0;
        
        items.forEach(i => {
           const q = i.quantity || i.qty || 0;
           const isWeight = i.product_type === 'weight' || i.isWeight || (q >= 20 && i.price < 50);
           if (isWeight) totalGrams += q;
           else totalUnits += q;
        });

        const parts = [];
        if (totalUnits > 0) parts.push(`${totalUnits} uds`);
        if (totalGrams > 0) parts.push(`${totalGrams}g`);

        let clientName = null; let memberNum = null;
        if (d.client && typeof d.client === 'object') { clientName = d.client.name; memberNum = d.client.memberNumber; } 
        else if (d.client && typeof d.client === 'string') { clientName = d.client; memberNum = d.memberNumber; } 
        else if (d.memberName) { clientName = d.memberName; memberNum = d.memberNumber; }
        
        if (clientName === 'No asociado') { clientName = null; memberNum = null; }
        let clientDisplay = clientName;
        if (clientDisplay && memberNum && memberNum !== '---') clientDisplay += ` #${String(memberNum).padStart(4, '0')}`;

        return (
          <div className={s.sr}>
            <span className={`${s.b} ${c.bg}`}>🛒 #{txId}</span>
            <span className={`${s.b} ${c.bf}`}>${formatPrice(d.total || 0)}</span>
            <span className={s.se}>{parts.join(' + ')} ({items.length} items)</span>
            <div className={s.ss}></div>
            <span className={`${s.b} ${c.bs}`}>{d.payment || 'Efectivo'}</span>
            {clientDisplay && <><div className={s.ss}></div><span className={s.se}>👤 {clientDisplay}</span></>}
          </div>
        );
      }

      case 'Venta Anulada': {
        const txId = getTransactionId(d);
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${c.br}`}>❌ #{txId}</span>
            <span style={{ fontSize: '10px', color: '#dc2626', textDecoration: 'line-through' }}>${formatPrice(d.originalTotal || d.total || 0)}</span>
            {reason && <span className={s.se} style={{ color: '#b45309', fontStyle: 'italic', maxWidth: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>"{reason}"</span>}
          </div>
        );
      }

      // 🔧 FIX: Doble case para cubrir tanto "Modificación Pedido" (BD) como "Venta Modificada" (registros erróneos)
      case 'Modificación Pedido':
      case 'Venta Modificada': {
        const txId = getTransactionId(d);
        
        // 🌟 LÓGICA RETROCOMPATIBLE: Detecta registro legacy vs nuevo
        const isLegacy = !d.changes && !d.productChanges && !d.itemsSnapshot;

        if (isLegacy) {
          return (
            <div className={s.sr}>
              <span className={`${s.b} ${c.bb}`}>📝 #{txId || 'S/N'}</span>
              <span className={s.se} style={{ fontStyle: 'italic' }}>Ajuste de pedido antiguo</span>
            </div>
          );
        }

        const changes = d.changes || {};
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${c.bb}`}>📝 #{txId}</span>
            {changes.total ? (
              <>
                <div className={s.ss}></div>
                <span style={{ fontSize: '10px', color: '#dc2626', textDecoration: 'line-through' }}>${formatPrice(changes.total.old)}</span>
                <span style={{ fontSize: '10px', color: '#94a3b8' }}>→</span>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#16a34a' }}>${formatPrice(changes.total.new)}</span>
              </>
            ) : (
              <span className={s.se} style={{ fontStyle: 'italic' }}>Ajuste de stock</span>
            )}
            {d.productChanges && d.productChanges.length > 0 && (
               <>
                 <div className={s.ss}></div>
                 <span className={s.se}>{d.productChanges.length} prod. modif.</span>
               </>
            )}
          </div>
        );
      }

      case 'Alta de Producto': {
        const title = d.title || d.name || 'Producto';
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${c.bg}`}>⊕ {title}</span>
            {d.price !== undefined && <><div className={s.ss}></div><span className={s.se}>${formatPrice(d.price)} · {d.stock} {d.product_type === 'weight' ? 'g' : 'uds'}</span></>}
            {d.category && <><div className={s.ss}></div><span className={`${s.b} ${c.bs}`}>{d.category}</span></>}
          </div>
        );
      }

      case 'Baja Producto': {
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${c.br}`}>⊖ {d.title || d.name || 'Producto'}</span>
            <div className={s.ss}></div>
            <span className={s.se} style={{ color: '#dc2626' }}>Stock: {d.stock || 0}</span>
          </div>
        );
      }

      case 'Edición Producto': {
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${c.bb}`}>📦 {d.product || d.title || d.name || 'Producto'}</span>
            {d.price !== undefined && <><div className={s.ss}></div><span className={s.se}>${formatPrice(d.price)}</span></>}
          </div>
        );
      }

      case 'Producto Duplicado': {
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${c.bb}`}>📋 Duplicado</span>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#334155' }}>{d.newTitle || d.title || d.name || 'Copia'}</span>
          </div>
        );
      }

      case 'Apertura de Caja':
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${c.bg}`}>$ Apertura</span>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#15803d' }}>${formatPrice(d.amount || 0)}</span>
          </div>
        );

      case 'Cierre de Caja':
      case 'Cierre Automático':
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${action === 'Cierre Automático' ? c.bo : c.bk}`}>{action === 'Cierre Automático' ? '⏰ Auto' : '🔒 Cierre'}</span>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#1e293b' }}>${formatPrice(d.finalBalance || d.netProfit || d.totalSales || 0)}</span>
            {d.salesCount !== undefined && <><div className={s.ss}></div><span className={s.se}>{d.salesCount} ventas</span></>}
          </div>
        );

      case 'Nuevo Gasto':
      case 'Gasto':
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${c.br}`}>📉 -${formatPrice(d.amount || 0)}</span>
            <span className={`${s.b} ${c.bs}`}>{d.category || 'Varios'}</span>
            <span className={s.se}>{d.paymentMethod || 'Efectivo'}</span>
          </div>
        );

      case 'Nuevo Socio':
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${c.bg}`}>👤 Alta</span>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#334155' }}>{d.name}</span>
            {d.number && <span className={`${s.b} ${c.bs}`}>#{String(d.number).padStart(4, '0')}</span>}
          </div>
        );

      case 'Baja de Socio':
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${c.br}`}>👤 Baja</span>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textDecoration: 'line-through' }}>{d.name || 'Desconocido'}</span>
            {d.number && <span className={`${s.b} ${c.bs}`}>#{String(d.number).padStart(4, '0')}</span>}
          </div>
        );

      case 'Edición de Socio':
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${c.bb}`}>👤 Edición</span>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#334155' }}>{d.name || d.member}</span>
            <span className={s.se}>{(d.changes ? d.changes.length : 0)} cambios</span>
          </div>
        );

      case 'Edición de Puntos': {
        const pts = d.pointsChange || d;
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${c.bp}`}>🏆 Puntos</span>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#334155' }}>{d.name || d.member}</span>
            {pts.diff !== undefined && <span className={`${s.b} ${pts.diff > 0 ? c.bg : c.br}`} style={{ fontFamily: 'monospace' }}>{pts.diff > 0 ? '+' : ''}{pts.diff} pts</span>}
          </div>
        );
      }

      case 'Categoría': {
        const isCreate = d.type === 'create';
        const isDelete = d.type === 'delete';
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${isCreate ? c.bg : isDelete ? c.br : c.bo}`}>🏷️ {isCreate ? 'Creada' : isDelete ? 'Eliminada' : 'Editada'}</span>
            <span style={{ fontSize: '10px', fontWeight: 700, color: isDelete ? '#94a3b8' : '#334155', textDecoration: isDelete ? 'line-through' : 'none' }}>{d.name}</span>
          </div>
        );
      }

      case 'Actualización Masiva':
      case 'Edición Masiva Categorías':
        const affectedCount = d.count || (d.details && d.details.length) || (d.changes && d.changes.length) || 0;
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${c.bf}`}>🏷️ Edición Masiva</span>
            <span className={s.se}>{affectedCount} productos actualizados</span>
          </div>
        );

      case 'Nuevo Premio':
      case 'Editar Premio':
      case 'Eliminar Premio': {
        const isDelete = action === 'Eliminar Premio';
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${isDelete ? c.br : c.bv}`}>🎁 {isDelete ? 'Eliminado' : action === 'Nuevo Premio' ? 'Nuevo' : 'Editado'}</span>
            <span style={{ fontSize: '10px', fontWeight: 700, color: isDelete ? '#94a3b8' : '#334155', textDecoration: isDelete ? 'line-through' : 'none' }}>{d.title || d.name}</span>
            {d.pointsCost && <span className={`${s.b} ${c.bv}`} style={{ fontFamily: 'monospace' }}>{d.pointsCost} pts</span>}
          </div>
        );
      }

      case 'Login':
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${c.bi}`}>🔑 Ingreso</span>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#334155' }}>{d.name || d.role}</span>
          </div>
        );

      case 'Horario Modificado':
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${c.ba}`}>🕐 Horario</span>
            <span className={s.se}>{typeof d === 'string' ? d : 'Modificado'}</span>
          </div>
        );

      default: {
        const txIdDefault = getTransactionId(d);
        if (txIdDefault) return <span className="text-slate-500 text-[10px]">Transacción #{txIdDefault}</span>;
        const defaultName = d.title || d.name || d.product;
        if (defaultName) return <span className="text-slate-500 text-[10px]">{defaultName}</span>;
        return <span className="text-slate-400 text-[10px]">Ver detalles...</span>;
      }
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-[20px] pb-[20px] pt-2">
      <table className={s.table}>
        <thead className="sticky top-0 z-10">
          <tr>
            <th className={s.th} style={{ width: '130px' }} onClick={() => onSort('datetime')}>
              Fecha / Hora <SortIcon column="datetime" sortColumn={sortColumn} sortDirection={sortDirection} />
            </th>
            <th className={s.th} style={{ width: '80px' }} onClick={() => onSort('user')}>
              Usuario <SortIcon column="user" sortColumn={sortColumn} sortDirection={sortDirection} />
            </th>
            <th className={s.th} style={{ width: '150px' }} onClick={() => onSort('action')}>
              Acción <SortIcon column="action" sortColumn={sortColumn} sortDirection={sortDirection} />
            </th>
            <th className={s.th}>
              Resumen
            </th>
            <th className={s.th} style={{ width: '44px', textAlign: 'center' }}>
              Info
            </th>
          </tr>
        </thead>
        <tbody>
          {/* 🛡️ ESCUDO: Protege a React de crashear si sortedLogs es undefined */}
          {(sortedLogs || []).map((log) => {
            const userClass = log.user === 'Dueño' || log.user === 'admin' ? s.ubAdm : log.user === 'Vendedor' || log.user === 'seller' ? s.ubSel : s.ubSys;
            
            // 🎨 FIX MAQUILLAJE VISUAL: Cubre ambos nombres de la BD → siempre muestra "Venta Modificada"
            const displayAction = (log.action === 'Modificación Pedido' || log.action === 'Venta Modificada')
              ? 'Venta Modificada' 
              : log.action;

            return (
              <tr
                key={log.id}
                className={`${s.tr} ${selectedLogId === log.id ? s.trSelected : ''}`}
                onClick={() => onViewDetails(log)}
              >
                <td className={s.td}>
                  <div className={s.date}>{log.date || '-'}</div>
                  <div className={s.time}>{log.timestamp || '--:--'}</div>
                </td>
                <td className={s.td}><span className={userClass}>{log.user}</span></td>
                <td className={s.td}><span className={s.al}>{displayAction}</span></td>
                <td className={s.td}>{getSummary(log)}</td>
                <td className={s.td} style={{ textAlign: 'center' }}>
                  <button className={s.ib} onClick={(e) => { e.stopPropagation(); onViewDetails(log); }} title="Ver detalles"><Eye size={14} /></button>
                </td>
              </tr>
            );
          })}
          
          {(!sortedLogs || sortedLogs.length === 0) && (
            <tr>
              <td colSpan={5} className="text-center py-12 text-[#94a3b8] border-b border-[#f1f5f9]">
                <div className="flex flex-col items-center gap-2">
                  <Search size={28} className="text-[#e2e8f0]" />
                  <p className="text-[11px] font-medium">No se encontraron registros que coincidan.</p>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}