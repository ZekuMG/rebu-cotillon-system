import React from 'react';
import {
  ChevronsUpDown,
  ChevronUp,
  ChevronDown,
  Eye,
  Search
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
    return <ChevronsUpDown size={14} className="text-slate-300 ml-1 inline" />;
  return sortDirection === 'asc' ? (
    <ChevronUp size={14} className="text-amber-600 ml-1 inline" />
  ) : (
    <ChevronDown size={14} className="text-amber-600 ml-1 inline" />
  );
};

// ── SISTEMA DE ESTILOS BASADO EN TU HTML ──
const s = {
  table: "w-full border-collapse bg-white rounded-xl overflow-hidden border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
  th: "text-left p-[10px_14px] text-[9px] font-bold uppercase tracking-[0.5px] text-slate-400 border-b border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100 select-none transition-colors",
  td: "p-[11px_14px] text-[11px] border-b border-[#f1f5f9] align-middle",
  tr: "cursor-pointer transition-colors duration-150 hover:bg-[#fef3c7]",
  trSelected: "bg-[#fef9c3]",
  
  // Textos y badges básicos
  date: "font-bold text-slate-800 text-[11px]",
  time: "font-mono text-[9px] text-slate-400",
  al: "font-bold text-[10px] text-slate-800", // Action Label
  
  // Usuarios
  ubAdm: "inline-flex px-[7px] py-[2px] rounded-[5px] text-[9px] font-bold bg-[#eef2ff] text-indigo-600 border border-indigo-100",
  ubSel: "inline-flex px-[7px] py-[2px] rounded-[5px] text-[9px] font-bold bg-[#ecfdf5] text-[#059669] border border-[#d1fae5]",
  ubSys: "inline-flex px-[7px] py-[2px] rounded-[5px] text-[9px] font-bold bg-slate-100 text-slate-600 border border-slate-200",
  
  // Resumen (Summary Row)
  sr: "flex items-center gap-[5px] flex-wrap",
  se: "text-[9px] text-slate-400", // Summary Extra
  ss: "w-[1px] h-[11px] bg-[#e2e8f0]", // Summary Separator
  
  // Botón Eye
  ib: "w-[26px] h-[26px] rounded-[6px] text-slate-400 flex items-center justify-center transition-all duration-150 hover:bg-[#fef3c7] hover:text-amber-600 hover:scale-110 mx-auto",
  
  // Badges de colores (.b .bg, etc)
  b: "inline-flex items-center gap-[3px] px-[7px] py-[2px] rounded-[4px] text-[9px] font-bold",
};

const c = {
  bg: "bg-[#dcfce7] text-[#15803d]", // Green
  br: "bg-[#fee2e2] text-[#dc2626]", // Red
  bf: "bg-[#fae8ff] text-[#a21caf]", // Fuchsia
  bv: "bg-[#ede9fe] text-[#6d28d9]", // Violet
  bs: "bg-[#f1f5f9] text-[#475569] border border-[#e2e8f0]", // Slate
  bb: "bg-[#dbeafe] text-[#2563eb]", // Blue
  bo: "bg-[#fff7ed] text-[#c2410c]", // Orange
  bk: "bg-[#1e293b] text-white",     // Black/Dark
  bi: "bg-[#eef2ff] text-[#4338ca]", // Indigo
  ba: "bg-[#fef3c7] text-[#b45309]", // Amber
  bp: "bg-[#fae8ff] text-[#a21caf]"  // Purple (Reusing fuchsia style for points)
};

export default function LogsTable({
  sortedLogs,
  sortColumn,
  sortDirection,
  onSort,
  onViewDetails,
  selectedLogId
}) {

  // --- GENERADOR DE RESUMEN VISUAL EXACTO AL HTML ---
  const getSummary = (log) => {
    const action = log.action;
    const d = log.details;
    const reason = log.reason;

    if (!d) return <span className="text-slate-400 italic text-[10px]">Sin detalles</span>;
    if (typeof d === 'string') return <span className="text-slate-600 text-[10px]">{d}</span>;

    switch (action) {
// --- VENTAS ---
      case 'Venta Realizada': {
        const txId = getTransactionId(d);
        const items = d.items || [];
        // Lógica de gramos vs uds en la tabla
        let totalUnits = 0;
        let totalGrams = 0;
        
        items.forEach(i => {
           const q = i.quantity || i.qty || 0;
           const isWeight = i.product_type === 'weight' || (q >= 20 && i.price < 50);
           if (isWeight) totalGrams += q;
           else totalUnits += q;
        });

        const total = d.total || 0;
        
        const parts = [];
        if (totalUnits > 0) parts.push(`${totalUnits} uds`);
        if (totalGrams > 0) parts.push(`${totalGrams}g`);

        // Extraer nombre y número de socio (soportando versiones viejas y nuevas del log)
        let clientName = null;
        let memberNum = null;

        if (d.client && typeof d.client === 'object') {
          clientName = d.client.name;
          memberNum = d.client.memberNumber;
        } else if (d.client && typeof d.client === 'string') {
          clientName = d.client;
          memberNum = d.memberNumber;
        } else if (d.memberName) {
          clientName = d.memberName;
          memberNum = d.memberNumber;
        }
        
        if (clientName === 'No asociado') {
          clientName = null;
          memberNum = null;
        }

        let clientDisplay = clientName;
        if (clientDisplay && memberNum && memberNum !== '---') {
          clientDisplay += ` #${String(memberNum).padStart(4, '0')}`;
        }

        return (
          <div className={s.sr}>
            <span className={`${s.b} ${c.bg}`}>🛒 #{txId}</span>
            <span className={`${s.b} ${c.bf}`}>${formatPrice(total)}</span>
            <span className={s.se}>
              {parts.join(' + ')} ({items.length} items)
            </span>
            <div className={s.ss}></div>
            <span className={`${s.b} ${c.bs}`}>{d.payment || 'Efectivo'}</span>
            {clientDisplay && (
              <>
                <div className={s.ss}></div>
                <span className={s.se}>👤 {clientDisplay}</span>
              </>
            )}
          </div>
        );
      }

      
      case 'Venta Anulada': {
        const txId = getTransactionId(d);
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${c.br}`}>❌ #{txId}</span>
            <span style={{ fontSize: '10px', color: '#dc2626', textDecoration: 'line-through' }}>
              ${formatPrice(d.originalTotal || d.total || 0)}
            </span>
            {reason && (
              <span className={s.se} style={{ color: '#b45309', fontStyle: 'italic', maxWidth: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                "{reason}"
              </span>
            )}
          </div>
        );
      }

      case 'Modificación Pedido': {
        const txId = getTransactionId(d);
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
              <span className={s.se} style={{ fontStyle: 'italic' }}>Sin cambios financieros</span>
            )}
          </div>
        );
      }

      // 2. PRODUCTOS
      case 'Alta de Producto': {
        const title = d.title || d.name || 'Producto';
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${c.bg}`}>⊕ {title}</span>
            {d.price !== undefined && (
              <>
                <div className={s.ss}></div>
                <span className={s.se}>${formatPrice(d.price)} · {d.stock} {d.product_type === 'weight' ? 'g' : 'uds'}</span>
              </>
            )}
            {d.category && (
              <>
                <div className={s.ss}></div>
                <span className={`${s.b} ${c.bs}`}>{d.category}</span>
              </>
            )}
          </div>
        );
      }

      case 'Baja Producto': {
        const title = d.title || d.name || 'Producto';
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${c.br}`}>⊖ {title}</span>
            <div className={s.ss}></div>
            <span className={s.se} style={{ color: '#dc2626' }}>Stock descartado: {d.stock || 0}</span>
          </div>
        );
      }

      case 'Edición Producto': {
        const title = d.product || d.title || d.name || 'Producto';
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${c.bb}`}>📦 {title}</span>
            {d.price !== undefined && (
              <>
                <div className={s.ss}></div>
                <span className={s.se}>${formatPrice(d.price)}</span>
              </>
            )}
          </div>
        );
      }

      case 'Producto Duplicado': {
        const title = d.newTitle || d.title || d.name || 'Copia';
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${c.bb}`}>📋 Duplicado</span>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#334155' }}>{title}</span>
          </div>
        );
      }

      // 3. CAJA
      case 'Apertura de Caja':
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${c.bg}`}>$ Apertura</span>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#15803d' }}>
              ${formatPrice(d.amount || 0)}
            </span>
          </div>
        );

      case 'Cierre de Caja':
      case 'Cierre Automático':
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${action === 'Cierre Automático' ? c.bo : c.bk}`}>
              {action === 'Cierre Automático' ? '⏰ Auto' : '🔒 Cierre'}
            </span>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#1e293b' }}>
              ${formatPrice(d.finalBalance || d.totalSales || 0)}
            </span>
            <div className={s.ss}></div>
            <span className={s.se}>{d.salesCount || 0} ventas</span>
          </div>
        );

      // 4. GASTOS
      case 'Nuevo Gasto':
      case 'Gasto':
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${c.br}`}>📉 -${formatPrice(d.amount || 0)}</span>
            <span className={`${s.b} ${c.bs}`}>{d.category || 'Varios'}</span>
            <span className={s.se}>{d.paymentMethod || 'Efectivo'}</span>
          </div>
        );

      // 5. SOCIOS
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
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textDecoration: 'line-through' }}>
              {d.name || 'Desconocido'}
            </span>
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
            <span className={`${s.b} ${pts.diff > 0 ? c.bg : c.br}`} style={{ fontFamily: 'monospace' }}>
              {pts.diff > 0 ? '+' : ''}{pts.diff} pts
            </span>
          </div>
        );
      }

      // 6. CATEGORÍAS
      case 'Categoría': {
        const isCreate = d.type === 'create';
        const isDelete = d.type === 'delete';
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${isCreate ? c.bg : isDelete ? c.br : c.bo}`}>
              🏷️ {isCreate ? 'Creada' : isDelete ? 'Eliminada' : 'Editada'}
            </span>
            <span style={{ fontSize: '10px', fontWeight: 700, color: isDelete ? '#94a3b8' : '#334155', textDecoration: isDelete ? 'line-through' : 'none' }}>
              {d.name}
            </span>
          </div>
        );
      }

      case 'Actualización Masiva':
      case 'Edición Masiva Categorías':
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${c.bf}`}>🏷️ Edición Masiva</span>
            <span className={s.se}>{d.count || (d.details && d.details.length) || 0} productos actualizados</span>
          </div>
        );

      // 7. PREMIOS
      case 'Nuevo Premio':
      case 'Editar Premio':
      case 'Eliminar Premio': {
        const isDelete = action === 'Eliminar Premio';
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${isDelete ? c.br : c.bv}`}>
              🎁 {isDelete ? 'Eliminado' : action === 'Nuevo Premio' ? 'Nuevo' : 'Editado'}
            </span>
            <span style={{ fontSize: '10px', fontWeight: 700, color: isDelete ? '#94a3b8' : '#334155', textDecoration: isDelete ? 'line-through' : 'none' }}>
              {d.title || d.name}
            </span>
            {d.pointsCost && (
              <span className={`${s.b} ${c.bv}`} style={{ fontFamily: 'monospace' }}>
                {d.pointsCost} pts
              </span>
            )}
          </div>
        );
      }

      // 8. SISTEMA
      case 'Login':
        return (
          <div className={s.sr}>
            <span className={`${s.b} ${c.bi}`}>🔑 Ingreso</span>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#334155' }}>
              {d.name || d.role}
            </span>
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
    <div className="flex-1 overflow-y-auto px-4 pb-4">
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
          {sortedLogs.map((log) => {
            // Asignar clase de usuario
            const userClass = 
              log.user === 'Dueño' || log.user === 'admin' ? s.ubAdm :
              log.user === 'Vendedor' || log.user === 'seller' ? s.ubSel : s.ubSys;

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
                <td className={s.td}>
                  <span className={userClass}>{log.user}</span>
                </td>
                <td className={s.td}>
                  <span className={s.al}>{log.action}</span>
                </td>
                <td className={s.td}>
                  {getSummary(log)}
                </td>
                <td className={s.td} style={{ textAlign: 'center' }}>
                  <button
                    className={s.ib}
                    onClick={(e) => { e.stopPropagation(); onViewDetails(log); }}
                    title="Ver detalles"
                  >
                    <Eye size={14} />
                  </button>
                </td>
              </tr>
            );
          })}
          
          {sortedLogs.length === 0 && (
            <tr>
              <td colSpan={5} className="text-center py-12 text-slate-400 border-b border-slate-100">
                <div className="flex flex-col items-center gap-2">
                  <Search size={28} className="text-slate-200" />
                  <p className="text-xs font-medium">No se encontraron registros que coincidan.</p>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}