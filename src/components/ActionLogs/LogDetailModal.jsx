// src/components/ActionLogs/LogDetailModal.jsx
import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import LogDetailRenderer from './LogDetailRenderer';
import { getDetailTitle, getDetailIcon, getDetailColor } from './logHelpers';
import { formatNumber } from '../../utils/helpers';
import { FancyPrice } from '../FancyPrice';

// Helper local para extraer ID
const getTransactionId = (details) => {
  if (!details || typeof details === 'string') return null;
  const id = details.transactionId || details.id;
  if (!id) return null;
  return typeof id === 'string' && id.includes('TRX-') ? id.replace('TRX-', '') : id;
};

// ✨ Recibimos onReprintPdf desde LogsView
export default function LogDetailModal({ selectedLog, onClose, onUpdateNote, onReprintPdf }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (selectedLog) {
      setTimeout(() => setIsVisible(true), 10);
    } else {
      setIsVisible(false);
    }
  }, [selectedLog]);

  if (!selectedLog) return null;

  const action = selectedLog.action;
  const d = selectedLog.details || {};
  const icon = getDetailIcon(action);
  const color = getDetailColor(action);

  // ── Mapeo de Colores del HTML ──
  const colorMap = {
    green: 'bg-[#dcfce7] text-[#15803d]',
    red: 'bg-[#fee2e2] text-[#dc2626]',
    blue: 'bg-[#dbeafe] text-[#2563eb]',
    violet: 'bg-[#ede9fe] text-[#6d28d9]',
    fuchsia: 'bg-[#fae8ff] text-[#a21caf]',
    amber: 'bg-[#fef3c7] text-[#b45309]',
    slate: 'bg-[#f1f5f9] text-[#475569]',
    indigo: 'bg-[#e0e7ff] text-[#4338ca]',
    purple: 'bg-[#fae8ff] text-[#a21caf]' 
  };

  // ── Monto principal según tipo de acción (Header Gigante) ──
  const getDisplayAmount = () => {
    if (typeof d === 'string') return '';

    switch (action) {
      // CAJA
      case 'Apertura de Caja': return d.amount != null ? <FancyPrice amount={d.amount} /> : '';
      case 'Cierre de Caja':
      case 'Cierre Automático': return d.finalBalance != null ? <FancyPrice amount={d.finalBalance} /> : (d.totalSales != null ? <FancyPrice amount={d.totalSales} /> : '');
      // VENTAS
      case 'Venta Realizada': return d.total != null ? <FancyPrice amount={d.total} /> : '';
      case 'Venta Anulada': return (d.originalTotal || d.total) != null ? <FancyPrice amount={d.originalTotal || d.total} /> : '';
      // GASTOS
      case 'Nuevo Gasto':
      case 'Gasto': return d.amount != null ? <><span className="text-red-500 mr-1">-</span><FancyPrice amount={d.amount} /></> : '';
      // PRODUCTOS 
      case 'Alta de Producto':
      case 'Baja Producto':
      case 'Producto Duplicado':
      case 'Edición Producto': return d.price != null ? <FancyPrice amount={d.price} /> : '';
      // SOCIOS 
      case 'Nuevo Socio': return d.number ? `#${String(d.number).padStart(4, '0')}` : '';
      case 'Baja de Socio': return d.number ? `#${String(d.number).padStart(4, '0')}` : (d.id ? `ID: ${d.id}` : '');
      case 'Edición de Socio': return d.number ? `#${String(d.number).padStart(4, '0')}` : '';
      case 'Edición de Puntos': {
        const pts = d.pointsChange || d;
        return pts.diff !== undefined ? `${pts.diff > 0 ? '+' : ''}${formatNumber(pts.diff)} pts` : '';
      }
      // PREMIOS
      case 'Nuevo Premio':
      case 'Editar Premio':
      case 'Eliminar Premio': return d.pointsCost ? `${formatNumber(d.pointsCost)} pts` : '';
      // CATEGORÍAS 
      case 'Categoría': return d.type === 'create' ? 'Creada' : d.type === 'delete' ? 'Eliminada' : 'Renombrada';
      case 'Edición Masiva Categorías':
      case 'Actualización Masiva': return (d.count || (d.details && d.details.length) || (d.changes && d.changes.length) || 0) + ' cambios';
      case 'Modificación Pedido': 
      case 'Venta Modificada': return d.changes?.total ? <FancyPrice amount={d.changes.total.new} /> : 'Editado';
      // EXPORTACIÓN PDF
      case 'Exportación PDF': {
        const isClient = d.snapshot?.config?.isForClient;
        const clientName = d.snapshot?.config?.clientName;
        return isClient ? (clientName || 'Presupuesto Cliente') : 'Reporte Interno';
      }
      // OFERTAS
      case 'Oferta Creada':
      case 'Oferta Editada':
      case 'Oferta Eliminada': return d.type ? d.type : 'Oferta';
      default: return '';
    }
  };

  // ── Subtítulo según tipo de acción (Debajo del Monto) ──
  const getDisplaySubTitle = () => {
    if (typeof d === 'string') return d || '';

    switch (action) {
      // VENTAS
      case 'Venta Realizada':
      case 'Venta Anulada': {
        const txId = getTransactionId(d);
        return txId ? `Transacción #${txId}` : 'Sin ID';
      }
      // PRODUCTOS
      case 'Alta de Producto':
      case 'Baja Producto':
      case 'Edición Producto': return d.product || d.title || d.name || 'Producto';
      case 'Producto Duplicado': return d.newTitle || d.title || 'Producto Copiado';
      // GASTOS
      case 'Nuevo Gasto':
      case 'Gasto': return d.description || 'Gasto registrado';
      // SOCIOS
      case 'Nuevo Socio':
      case 'Edición de Socio':
      case 'Edición de Puntos': return d.name || d.member || 'Socio';
      case 'Baja de Socio': return d.name || d.member || (d.id ? `Socio ID: ${d.id}` : 'Socio eliminado');
      // PREMIOS
      case 'Nuevo Premio':
      case 'Editar Premio':
      case 'Eliminar Premio': return d.title || d.name || 'Premio';
      // CATEGORÍAS 
      case 'Categoría': return d.name || 'Categoría';
      case 'Edición Masiva Categorías':
      case 'Actualización Masiva': return 'Actualización en Lote';
      // CAJA
      case 'Apertura de Caja': return 'Inicio de operaciones';
      case 'Cierre de Caja': return 'Cierre del día';
      case 'Cierre Automático': return 'Cierre automático del sistema';
      case 'Modificación Pedido': 
      case 'Venta Modificada': return `Ajuste en Transacción #${getTransactionId(d) || 'S/N'}`;
      // EXPORTACIÓN PDF
      case 'Exportación PDF': return d.config?.isForClient ? (d.config?.clientName || 'Presupuesto Cliente') : 'Reporte Interno';
      // OFERTAS
      case 'Oferta Creada':
      case 'Oferta Editada':
      case 'Oferta Eliminada': return d.name || 'Registro de Oferta';
      default: return d.title || d.name || d.product || action;
    }
  };

  return (
    <>
      <div 
        className={`fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[200] transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      <div 
        className={`fixed top-0 right-0 w-full max-w-[480px] h-[100vh] z-[201] flex flex-col bg-[#eef1f6] border-l border-[#d4d9e3] shadow-[-8px_0_35px_rgba(0,0,0,0.1)] transition-transform duration-350 ease-[cubic-bezier(0.4,0,0.2,1)] ${isVisible ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="absolute -top-[80px] -right-[80px] w-[350px] h-[350px] bg-[radial-gradient(circle,rgba(192,38,211,0.1)_0%,transparent_70%)] rounded-full pointer-events-none z-0" />
        <div className="absolute -bottom-[80px] -left-[80px] w-[350px] h-[350px] bg-[radial-gradient(circle,rgba(37,99,235,0.08)_0%,transparent_70%)] rounded-full pointer-events-none z-0" />

        <button 
          onClick={onClose}
          className="absolute top-[14px] right-[14px] w-[30px] h-[30px] rounded-full flex items-center justify-center z-10 transition-colors bg-white text-[#a1a1aa] shadow-[0_1px_4px_rgba(0,0,0,0.06)] hover:text-[#1e293b]"
        >
          <X size={14} />
        </button>

        <div className="p-[28px_20px_22px] text-center border-b border-[#d4d9e3] bg-[rgba(255,255,255,0.45)] relative z-[1]">
          <style>{`
            @keyframes floatAnim {
              0%, 100% { transform: translateY(0); }
              50% { transform: translateY(-6px); }
            }
            .animate-float { animation: floatAnim 3s ease-in-out infinite; }
          `}</style>
          
          <span className="text-[42px] block mb-3 animate-float">{icon}</span>
            <span className={`inline-flex px-[16px] py-[5px] rounded-[20px] text-[10px] font-extrabold tracking-[0.5px] ${colorMap[color] || colorMap.slate}`}>
              {action === 'Modificación Pedido' ? 'Venta Modificada' : action}
            </span>          
            <div className="text-[34px] flex justify-center items-center font-extrabold text-[#1e293b] mt-2.5 tracking-[-1px] leading-none" style={{ fontFamily: "'Outfit', sans-serif" }}>
            {getDisplayAmount()}
          </div>
          <div className="text-[13px] font-semibold text-[#64748b] mt-[3px] px-4 truncate">
            {getDisplaySubTitle()}
          </div>
          <div className="text-[10px] text-[#94a3b8] mt-[6px] font-mono">
            {selectedLog.date} · {selectedLog.timestamp} · {selectedLog.user} · ID: {selectedLog.id}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-[16px_18px] relative z-[1] custom-scrollbar">
          {/* ✨ PASAMOS LA FUNCIÓN AL RENDERER */}
          <LogDetailRenderer 
            log={selectedLog} 
            onUpdateNote={onUpdateNote} 
            onReprintPdf={onReprintPdf} 
          />
        </div>

        <div className="p-[14px_18px] border-t border-[#d4d9e3] flex justify-end bg-[rgba(255,255,255,0.4)] relative z-[1]">
          <button 
            onClick={onClose}
            className="px-[24px] py-[9px] rounded-[10px] bg-[#1e293b] text-white text-[11px] font-bold hover:bg-[#334155] transition-colors"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            Cerrar Detalle
          </button>
        </div>
      </div>
    </>
  );
}