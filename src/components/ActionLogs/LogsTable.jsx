// src/components/ActionLogs/LogsTable.jsx
import React from 'react';
import {
  ChevronsUpDown,
  ChevronUp,
  ChevronDown,
  Eye,
  Search
} from 'lucide-react';
import { formatNumber } from '../../utils/helpers';
import { FancyPrice } from '../FancyPrice';
import { extractRealNote } from './logHelpers'; // ✨ NUEVA IMPORTACIÓN

const getTransactionId = (details) => {
  if (!details || typeof details === 'string') return null;
  const id = details.transactionId || details.id || details.oldTransactionId;
  if (!id) return null;
  if (typeof id === 'string' && id.includes('TRX-')) {
    return id.replace('TRX-', '');
  }
  return id;
};

const getFormattedPayment = (payStr, instNum) => {
  if (typeof payStr !== 'string') return 'Efectivo';
  let extractedInst = 0;
  const match = payStr.match(/\((\d+)c\)/i);
  if (match) extractedInst = Number(match[1]);

  let clean = payStr.replace(/\s*\(\d+c\)/i, '').trim();
  let i = Number(instNum) || extractedInst || 0;
  
  if (i > 0 || clean.toLowerCase() === 'credito' || clean.toLowerCase() === 'crédito') {
    return i > 0 ? `Crédito (${i} ${i === 1 ? 'cuota' : 'cuotas'})` : 'Crédito';
  }
  return clean;
};

const formatDisplayDate = (dateStr) => {
  if (!dateStr) return '-';
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    let year = parts[2];
    if (year.length === 2) year = '20' + year;
    return `${parts[0]}/${parts[1]}/${year}`;
  }
  return dateStr;
};

const SortIcon = ({ column, sortColumn, sortDirection }) => {
  if (sortColumn !== column) return <ChevronsUpDown size={14} className="text-slate-300" />;
  return sortDirection === 'asc' ? <ChevronUp size={14} className="text-amber-600" /> : <ChevronDown size={14} className="text-amber-600" />;
};

const s = {
  table: "w-full border-collapse bg-white rounded-xl overflow-hidden border border-[#e2e8f0] shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
  th: "text-left p-[10px_14px] text-[9px] font-bold uppercase tracking-[0.5px] text-[#94a3b8] border-b border-[#e2e8f0] bg-[#f8fafc] cursor-pointer hover:bg-slate-100 select-none transition-colors whitespace-nowrap",
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
  bb: "bg-[#dbeafe] text-[#2563eb]",
  bv: "bg-[#ede9fe] text-[#6d28d9]",
  ba: "bg-[#fef3c7] text-[#b45309]",
  bs: "bg-[#f1f5f9] text-[#475569] border border-[#e2e8f0]",
  bk: "bg-[#1e293b] text-white",
};

export default function LogsTable({ sortedLogs, sortColumn, sortDirection, onSort, onViewDetails, selectedLogId }) {

  const getLogReasonUI = (log) => {
    const note = extractRealNote(log);
    if (!note) return null;
    return (
        <>
          <div className={s.ss}></div>
          <span className={s.se} style={{ fontStyle: 'italic', maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#d97706', fontWeight: 600 }}>
            💬 "{note}"
          </span>
        </>
    );
  };

  const getSummary = (log) => {
    const action = log.action;
    let d = log.details;

    if (!d) return <span className="text-slate-400 italic text-[10px]">Sin detalles</span>;
    if (typeof d === 'string') {
      try { d = JSON.parse(d); } catch { return <span className="text-slate-600 text-[10px]">{d}</span>; }
    }

    switch (action) {

      case 'Oferta Creada':
      case 'Oferta Editada': {
        const isEdit = action === 'Oferta Editada';
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${c.bv}`}>🎫 {isEdit ? 'Editada' : 'Creada'}</span>
            <div className={s.ss}></div>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#334155' }}>{d.name}</span>
            <div className={s.ss}></div>
            <span className={`${s.b} ${c.bs}`}>{d.type}</span>
            {d.offerPrice > 0 && <><div className={s.ss}></div><span className={s.se}>$<FancyPrice amount={d.offerPrice} /></span></>}
            {getLogReasonUI(log)}
          </div>
        );
      }

      case 'Oferta Eliminada': {
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${c.br}`}>🎫 Eliminada</span>
            <div className={s.ss}></div>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textDecoration: 'line-through' }}>{d.name}</span>
            <div className={s.ss}></div>
            <span className={`${s.b} ${c.bs}`}>{d.type}</span>
            {getLogReasonUI(log)}
          </div>
        );
      }

      case 'Exportación PDF': {
        const snap = d.snapshot || {};
        const config = snap.config || {};
        
        const isClient = config.isForClient;
        const itemsCount = d.itemCount || (snap.items ? snap.items.length : 0);
        const displayTitle = (config.documentTitle || 'PRESUPUESTO').toUpperCase();
        
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${c.br}`}>📄 PDF</span>
            <div className={s.ss}></div>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#1e293b' }}>{displayTitle}</span>
            <div className={s.ss}></div>
            {isClient && config.clientName && (
               <><span className={s.se}>👤 {config.clientName}</span><div className={s.ss}></div></>
            )}
            {isClient && config.clientEvent && (
               <><span className={s.se}>🎉 {config.clientEvent}</span><div className={s.ss}></div></>
            )}
            <span className={`${s.b} ${c.bs}`}>{itemsCount} ítems</span>
            {getLogReasonUI(log)}
          </div>
        );
      }

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
        if (totalUnits > 0) parts.push(`${formatNumber(totalUnits)} uds`);
        if (totalGrams > 0) parts.push(`${formatNumber(totalGrams)}g`);

        let clientDisplay = null;
        let memberNum = d.client?.memberNumber || d.memberNumber;
        if (d.client && typeof d.client === 'object') { clientDisplay = d.client.name; } 
        else if (typeof d.client === 'string') { clientDisplay = d.client; } 
        else if (d.memberName) { clientDisplay = d.memberName; }
        
        if (clientDisplay === 'No asociado') { clientDisplay = null; memberNum = null; }
        if (clientDisplay && memberNum && memberNum !== '---') clientDisplay += ` #${String(memberNum).padStart(4, '0')}`;

        return (
          <div className={s.sr}>
            <span className={`${s.b} ${c.bg}`}>🛒 #{txId}</span>
            <div className={s.ss}></div>
            <span className={`${s.b} ${c.bg}`}><FancyPrice amount={d.total || 0} /></span>
            <div className={s.ss}></div>
            <span className={s.se}>{parts.join(' + ')} ({items.length} items)</span>
            <div className={s.ss}></div>
            <span className={`${s.b} ${c.bs}`}>{getFormattedPayment(d.payment, d.installments)}</span>
            {clientDisplay && <><div className={s.ss}></div><span className={s.se}>👤 {clientDisplay}</span></>}
            {getLogReasonUI(log)}
          </div>
        );
      }

      case 'Apertura de Caja':
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${c.bg}`}>$ Apertura</span>
            <div className={s.ss}></div>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#15803d' }}><FancyPrice amount={d.amount || 0} /></span>
            {getLogReasonUI(log)}
          </div>
        );

      case 'Venta Anulada': {
        const txId = getTransactionId(d);
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${c.br}`}>❌ #{txId}</span>
            <div className={s.ss}></div>
            <span style={{ fontSize: '10px', color: '#dc2626', textDecoration: 'line-through' }}><FancyPrice amount={d.originalTotal || d.total || 0} /></span>
            {(d.pointsEarned > 0 || d.pointsSpent > 0) && <><div className={s.ss}></div><span className={s.se}>👤 Puntos devueltos</span></>}
            {getLogReasonUI(log)}
          </div>
        );
      }

      case 'Venta Restaurada': {
        const txId = getTransactionId(d);
        const oldId = d.oldTransactionId ? ` (Era #${d.oldTransactionId})` : '';
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${c.bg}`}>♻️ #{txId}</span>
            <div className={s.ss}></div>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#15803d' }}><FancyPrice amount={d.total || 0} /></span>
            <div className={s.ss}></div>
            <span className={s.se} style={{ fontStyle: 'italic' }}>Restaurada{oldId}</span>
            {(d.pointsEarned > 0 || d.pointsSpent > 0) && <><div className={s.ss}></div><span className={s.se}>👤 Puntos reasignados</span></>}
            {getLogReasonUI(log)}
          </div>
        );
      }

      case 'Venta Eliminada': {
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${c.bk}`}>🗑️ Eliminada</span>
            <div className={s.ss}></div>
            <span className={s.se}>{typeof d === 'string' ? d : `Ticket #${getTransactionId(d)}`}</span>
            {getLogReasonUI(log)}
          </div>
        );
      }

      case 'Nuevo Gasto':
      case 'Gasto':
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${c.br}`}>📉 -<FancyPrice amount={d.amount || 0} /></span>
            <div className={s.ss}></div>
            <span className={`${s.b} ${c.bs}`}>{d.category || 'Varios'}</span>
            <div className={s.ss}></div>
            <span className={s.se}>{d.paymentMethod || 'Efectivo'}</span>
            {getLogReasonUI(log)}
          </div>
        );

      case 'Baja de Socio':
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${c.br}`}>👤 Baja</span>
            <div className={s.ss}></div>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textDecoration: 'line-through' }}>{d.name || 'Desconocido'}</span>
            {d.number && <><div className={s.ss}></div><span className={`${s.b} ${c.bs}`}>#{String(d.number).padStart(4, '0')}</span></>}
            {getLogReasonUI(log)}
          </div>
        );

      case 'Alta de Producto': {
        const title = d.title || d.name || 'Producto';
        return (
          <div className={s.sr}>
            {d.id && <><span className={`${s.b} ${c.bb}`}>#{d.id}</span><div className={s.ss}></div></>}
            <span className={`${s.b} ${c.bb}`}>⊕ {title}</span>
            {d.price !== undefined && (
              <><div className={s.ss}></div><span className={s.se}><FancyPrice amount={d.price} /> · {formatNumber(d.stock)} {d.product_type === 'weight' ? 'g' : 'uds'}</span></>
            )}
            {d.category && <><div className={s.ss}></div><span className={`${s.b} ${c.bs}`}>{d.category}</span></>}
            {getLogReasonUI(log)}
          </div>
        );
      }

      case 'Edición Producto': {
        return (
          <div className={s.sr}>
            {d.id && <><span className={`${s.b} ${c.bb}`}>#{d.id}</span><div className={s.ss}></div></>}
            <span className={`${s.b} ${c.bb}`}>📦 {d.product || d.title || d.name || 'Producto'}</span>
            {d.price !== undefined && <><div className={s.ss}></div><span className={s.se}><FancyPrice amount={d.price} /></span></>}
            {getLogReasonUI(log)}
          </div>
        );
      }

      case 'Baja Producto': {
        return (
          <div className={s.sr}>
            {d.id && <><span className={`${s.b} ${c.bb}`}>#{d.id}</span><div className={s.ss}></div></>}
            <span className={`${s.b} ${c.bb}`}>⊖ {d.title || d.name || 'Producto'}</span>
            <div className={s.ss}></div>
            <span className={s.se} style={{ color: '#dc2626' }}>Stock: {formatNumber(d.stock || 0)}</span>
            {getLogReasonUI(log)}
          </div>
        );
      }

      case 'Producto Duplicado': {
        const originalName = d.originalTitle || 'Producto Original';
        const newName = d.newTitle || d.title || d.name || 'Copia';
        return (
          <div className={s.sr}>
            {d.originalId && <><span className={`${s.b} ${c.bb}`}>#{d.originalId}</span><div className={s.ss}></div></>}
            <span className={`${s.b} ${c.bb}`}>📋 Duplicado</span>
            <div className={s.ss}></div>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#334155' }}>
              <span style={{ color: '#94a3b8', fontWeight: 600 }}>({originalName})</span>
              <span style={{ color: '#cbd5e1', margin: '0 4px' }}>→</span>({newName})
            </span>
            {getLogReasonUI(log)}
          </div>
        );
      }

      case 'Nuevo Socio':
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${c.bb}`}>👤 Alta</span>
            <div className={s.ss}></div>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#334155' }}>{d.name}</span>
            {d.number && <><div className={s.ss}></div><span className={`${s.b} ${c.bs}`}>#{String(d.number).padStart(4, '0')}</span></>}
            {getLogReasonUI(log)}
          </div>
        );

      case 'Edición de Socio':
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${c.bb}`}>👤 Edición</span>
            <div className={s.ss}></div>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#334155' }}>{d.name || d.member}</span>
            <div className={s.ss}></div>
            <span className={s.se}>{(d.changes ? d.changes.length : 0)} cambios</span>
            {getLogReasonUI(log)}
          </div>
        );

      case 'Edición de Puntos': {
        const pts = d.pointsChange || d;
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${c.bv}`}>🏆 Puntos</span>
            <div className={s.ss}></div>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#334155' }}>{d.name || d.member}</span>
            {pts.diff !== undefined && <><div className={s.ss}></div><span className={`${s.b} ${pts.diff > 0 ? c.bg : c.br}`} style={{ fontFamily: 'monospace' }}>{pts.diff > 0 ? '+' : ''}{formatNumber(pts.diff)} pts</span></>}
            {getLogReasonUI(log)}
          </div>
        );
      }

      case 'Nuevo Premio':
      case 'Editar Premio':
      case 'Eliminar Premio': {
        const isDelete = action === 'Eliminar Premio';
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${isDelete ? c.br : c.bv}`}>🎁 {isDelete ? 'Eliminado' : action === 'Nuevo Premio' ? 'Nuevo' : 'Editado'}</span>
            <div className={s.ss}></div>
            <span style={{ fontSize: '10px', fontWeight: 700, color: isDelete ? '#94a3b8' : '#334155', textDecoration: isDelete ? 'line-through' : 'none' }}>{d.title || d.name}</span>
            {d.pointsCost && <><div className={s.ss}></div><span className={`${s.b} ${c.bv}`} style={{ fontFamily: 'monospace' }}>{formatNumber(d.pointsCost)} pts</span></>}
            {getLogReasonUI(log)}
          </div>
        );
      }

      case 'Modificación Pedido':
      case 'Venta Modificada': {
        const txId = getTransactionId(d);
        const isLegacy = !d.changes && !d.productChanges && !d.itemsSnapshot;

        if (isLegacy) {
          return (
            <div className={s.sr}>
              <span className={`${s.b} ${c.ba}`}>📝 #{txId || 'S/N'}</span>
              <div className={s.ss}></div>
              <span className={s.se} style={{ fontStyle: 'italic' }}>Ajuste de pedido antiguo</span>
              {getLogReasonUI(log)}
            </div>
          );
        }

        const changes = d.changes || {};
        const isTotalChanged = changes.total && (changes.total.old !== changes.total.new);
        const isPaymentChanged = changes.payment && (changes.payment.old !== changes.payment.new);
        const hasProductChanges = d.productChanges && d.productChanges.length > 0;

        return (
          <div className={s.sr}>
            <span className={`${s.b} ${c.ba}`}>📝 #{txId}</span>
            {hasProductChanges && <><div className={s.ss}></div><span className={s.se} style={{ color: '#0ea5e9', fontWeight: 600 }}>Ajuste Stock ({d.productChanges.length} items)</span></>}
            {(isTotalChanged || isPaymentChanged) && <><div className={s.ss}></div><span className={s.se} style={{ color: '#b45309', fontWeight: 600 }}>Ajuste Financiero</span></>}
            {isTotalChanged && (
               <><div className={s.ss}></div>
                 <span className={`${s.b} ${c.bg}`}>
                   <span style={{ textDecoration: 'line-through', opacity: 0.65, marginRight: '3px' }}><FancyPrice amount={changes.total.old} /></span>
                   → <FancyPrice amount={changes.total.new} />
                 </span>
               </>
            )}
            {isPaymentChanged && <><div className={s.ss}></div><span className={`${s.b} ${c.bs}`}>{changes.payment.old} → {changes.payment.new}</span></>}
            {getLogReasonUI(log)}
          </div>
        );
      }

      case 'Categoría': {
        const isCreate = d.type === 'create';
        const isDelete = d.type === 'delete';
        return (
          <div className={s.sr}>
            {d.id && <><span className={`${s.b} ${c.ba}`}>#{d.id}</span><div className={s.ss}></div></>}
            <span className={`${s.b} ${c.ba}`}>🏷️ {isCreate ? 'Creada' : isDelete ? 'Eliminada' : 'Editada'}</span>
            <div className={s.ss}></div>
            <span style={{ fontSize: '10px', fontWeight: 700, color: isDelete ? '#94a3b8' : '#334155', textDecoration: isDelete ? 'line-through' : 'none' }}>{d.name}</span>
            {getLogReasonUI(log)}
          </div>
        );
      }

      case 'Actualización Masiva':
      case 'Edición Masiva Categorías': {
        const affectedCount = d.count || (d.details && d.details.length) || (d.changes && d.changes.length) || 0;
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${c.ba}`}>🏷️ Edición Masiva</span>
            <div className={s.ss}></div>
            <span className={s.se}>{affectedCount} productos actualizados</span>
            {getLogReasonUI(log)}
          </div>
        );
      }

      case 'Horario Modificado':
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${c.ba}`}>🕐 Horario</span>
            <div className={s.ss}></div>
            <span className={s.se}>{typeof d === 'string' ? d : 'Modificado'}</span>
            {getLogReasonUI(log)}
          </div>
        );

      case 'Cierre de Caja':
      case 'Cierre Automático':
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${c.bk}`}>{action === 'Cierre Automático' ? '⏰ Auto' : '🔒 Cierre'}</span>
            <div className={s.ss}></div>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#1e293b' }}><FancyPrice amount={d.finalBalance || d.netProfit || d.totalSales || 0} /></span>
            {d.salesCount !== undefined && <><div className={s.ss}></div><span className={s.se}>{formatNumber(d.salesCount)} ventas</span></>}
            {getLogReasonUI(log)}
          </div>
        );

      case 'Login':
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${c.bs}`}>🔑 Ingreso</span>
            <div className={s.ss}></div>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#334155' }}>{d.name || d.role}</span>
            {getLogReasonUI(log)}
          </div>
        );

      default: {
        const txIdDefault = getTransactionId(d);
        if (txIdDefault) return <div className={s.sr}><span className="text-slate-500 text-[10px]">Transacción #{txIdDefault}</span>{getLogReasonUI(log)}</div>;
        const defaultName = d.title || d.name || d.product;
        if (defaultName) return <div className={s.sr}><span className="text-slate-500 text-[10px]">{defaultName}</span>{getLogReasonUI(log)}</div>;
        return <div className={s.sr}><span className="text-slate-400 text-[10px]">Ver detalles...</span>{getLogReasonUI(log)}</div>;
      }
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-[20px] pb-[20px] pt-2">
      <table className={s.table}>
        <thead className="sticky top-0 z-10">
          <tr>
            <th className={s.th} style={{ width: '130px' }} onClick={() => onSort('datetime')}>
              <div className="flex items-center gap-1">Fecha / Hora <SortIcon column="datetime" sortColumn={sortColumn} sortDirection={sortDirection} /></div>
            </th>
            <th className={s.th} style={{ width: '100px' }} onClick={() => onSort('user')}>
              <div className="flex items-center gap-1">Usuario <SortIcon column="user" sortColumn={sortColumn} sortDirection={sortDirection} /></div>
            </th>
            <th className={s.th} style={{ width: '150px' }} onClick={() => onSort('action')}>
              <div className="flex items-center gap-1">Acción <SortIcon column="action" sortColumn={sortColumn} sortDirection={sortDirection} /></div>
            </th>
            <th className={s.th}>Resumen</th>
            <th className={s.th} style={{ width: '44px', textAlign: 'center' }}>Info</th>
          </tr>
        </thead>
        <tbody>
          {(sortedLogs || []).map((log) => {
            const userClass = log.user === 'Dueño' || log.user === 'admin' ? s.ubAdm : log.user === 'Vendedor' || log.user === 'seller' ? s.ubSel : s.ubSys;
            const displayAction = (log.action === 'Modificación Pedido' || log.action === 'Venta Modificada') ? 'Venta Modificada' : log.action;

            return (
              <tr key={log.id} className={`${s.tr} ${selectedLogId === log.id ? s.trSelected : ''}`} onClick={() => onViewDetails(log)}>
                <td className={s.td}>
                  <div className={s.date}>{formatDisplayDate(log.date)}</div>
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
