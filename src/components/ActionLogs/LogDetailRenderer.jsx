/* eslint-disable react-refresh/only-export-components */
// src/components/ActionLogs/LogDetailRenderer.jsx
import React, { useState } from 'react';
import { ArrowRight, CheckCircle, Edit3, Plus, Save, AlertTriangle, FileText, Download } from 'lucide-react';
import { formatNumber } from '../../utils/helpers';
import { FancyPrice } from '../FancyPrice';
import { extractRealNote } from './logHelpers';

// ════════════════════════════════════════════
//  HELPERS EXPORTABLES
// ════════════════════════════════════════════

const getTransactionId = (details) => {
  if (!details || typeof details === 'string') {
    if (typeof details === 'string') {
      const match = details.match(/#([a-zA-Z0-9-]+)/);
      return match ? match[1] : details;
    }
    return null;
  }
  const id = details.transactionId || details.id || details.oldTransactionId;
  if (!id) return null;
  return typeof id === 'string' && id.includes('TRX-') ? id.replace('TRX-', '') : id;
};

const getClientDisplay = (details) => {
  let cName = null;
  let cNum = null;

  if (details.client && typeof details.client === 'object') {
    cName = details.client.name;
    cNum = details.client.memberNumber;
  } else if (details.client && typeof details.client === 'string') {
    cName = details.client;
    cNum = details.memberNumber;
  } else if (details.memberName) {
    cName = details.memberName;
    cNum = details.memberNumber;
  }

  if (!cName || cName === 'No asociado' || cName === 'Consumidor Final') return null;
  return `${cName} ${cNum && cNum !== '---' ? '#' + String(cNum).padStart(4, '0') : ''}`.trim();
};

// ════════════════════════════════════════════
//  SUB-COMPONENTES REUTILIZABLES
// ════════════════════════════════════════════

const Card = ({ icon, title, children }) => (
  <div className="bg-white border border-[#d4d9e3] rounded-[14px] p-4 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
    <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
      <span className="text-sm">{icon}</span> {title}
    </div>
    <div className="space-y-1.5">
      {children}
    </div>
  </div>
);

const Item = ({ label, value, children, className = '' }) => (
  <div className={`flex justify-between items-center px-3 py-2 bg-[#f4f6f9] rounded-[9px] text-[11px] border border-[#eaecf1] ${className}`}>
    <span className="text-slate-500 font-medium">{label}</span>
    <span className="font-bold text-slate-800 text-right">{children || value}</span>
  </div>
);

const ProductItem = ({ qty, name, totalAmount, isWeight }) => (
  <div className="flex justify-between items-center px-3 py-2 bg-[#f4f6f9] rounded-[9px] text-[11px] border border-[#eaecf1]">
    <span className="text-slate-500 font-medium flex items-center truncate flex-1 mr-2">
      <span className="font-mono text-[9px] font-bold bg-[#e0e4eb] text-slate-600 px-1.5 py-0.5 rounded mr-2 whitespace-nowrap">
        {isWeight ? `${qty}g` : `${qty}x`}
      </span>
      <span className="truncate">{name}</span>
    </span>
    <span className="font-bold text-slate-800 whitespace-nowrap">
      {totalAmount === 'GRATIS' ? 'GRATIS' : <FancyPrice amount={totalAmount} />}
    </span>
  </div>
);

const ChangeRow = ({ field, oldVal, newVal, isPrice = false }) => (
  <div className="flex items-center justify-between px-3 py-2 bg-[#f4f6f9] rounded-[9px] text-[11px] border border-[#eaecf1]">
    <span className="font-bold text-slate-800 flex-1 truncate">{field}</span>
    <div className="flex items-center gap-2 justify-end shrink-0">
      <span className="text-red-500 line-through text-[10px] font-medium">
        {isPrice ? <FancyPrice amount={oldVal} /> : oldVal}
      </span>
      <span className="text-slate-400 text-[10px] mx-0.5">→</span>
      <span className="text-green-600 font-bold">
        {isPrice ? <FancyPrice amount={newVal} /> : newVal}
      </span>
    </div>
  </div>
);

const Badge = ({ color, children }) => {
  const classes = {
    green: 'bg-green-100 text-green-700 border-green-200',
    red: 'bg-red-100 text-red-700 border-red-200',
    blue: 'bg-blue-100 text-blue-700 border-blue-200',
    fuchsia: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200',
    violet: 'bg-violet-100 text-violet-700 border-violet-200',
    amber: 'bg-amber-100 text-amber-700 border-amber-200',
    slate: 'bg-slate-100 text-slate-600 border-slate-200',
    indigo: 'bg-indigo-100 text-indigo-700 border-indigo-200' 
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold border ${classes[color] || classes.slate}`}>
      {children}
    </span>
  );
};

const WarnCard = ({ children, isSuccess = false }) => (
  <div className={`${isSuccess ? 'bg-[#ecfdf5] border-[#a7f3d0] text-[#047857]' : 'bg-[#fef2f2] border-[#fecaca] text-red-800'} border rounded-[14px] p-3.5 text-[11px] text-center font-semibold flex items-center justify-center gap-2`}>
    {children}
  </div>
);

const HighlightCard = ({ label, amount, sub }) => (
  <div className="bg-slate-800 rounded-[14px] p-4 text-white shadow-md">
    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</div>
    <div className="text-[28px] font-extrabold font-mono mt-1 leading-none">
      <FancyPrice amount={amount} />
    </div>
    {sub && <div className="text-[11px] text-slate-500 mt-1.5 font-medium">{sub}</div>}
  </div>
);

const MemberImpactCard = ({ clientDisplay, pointsChange, pointsEarned, pointsSpent }) => {
  if (!clientDisplay && !pointsChange && !(pointsEarned > 0) && !(pointsSpent > 0)) return null;

  return (
    <Card icon="👤" title="Impacto en el Socio">
      {clientDisplay && <Item label="Socio vinculado" value={clientDisplay} />}
      
      {pointsChange ? (
        <div className={clientDisplay ? "mt-3" : ""}>
          <div className="text-[10px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Movimiento de Puntos</div>
          <div className="flex items-center gap-[6px] px-[11px] py-[9px] bg-[#f4f6f9] rounded-[9px] border border-[#eaecf1]">
            <div className="flex-1 text-center">
              <div className="text-[9px] text-[#64748b] font-bold uppercase">Anterior</div>
              <div className="text-[14px] font-mono text-[#64748b]">{formatNumber(pointsChange.previous)} pts</div>
            </div>
            <div className="flex flex-col items-center text-[#cbd5e1]">
              <ArrowRight size={16} />
              <span className={`text-[10px] font-bold mt-[2px] ${pointsChange.diff > 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
                {pointsChange.diff > 0 ? '+' : ''}{formatNumber(pointsChange.diff)}
              </span>
            </div>
            <div className="flex-1 text-center">
              <div className="text-[9px] text-[#a21caf] font-bold uppercase">Actual</div>
              <div className="text-[14px] font-mono text-[#1e293b] font-bold">{formatNumber(pointsChange.new)} pts</div>
            </div>
          </div>
        </div>
      ) : (pointsEarned > 0 || pointsSpent > 0) ? (
        <div className="flex items-center justify-between px-3 py-2 bg-[#f4f6f9] rounded-[9px] text-[11px] border border-[#eaecf1] mt-1.5">
          <span className="font-bold text-slate-600">Ajuste de Puntos</span>
          <div className="flex items-center gap-2">
            {pointsEarned > 0 && <span className="text-emerald-600 font-bold">+{formatNumber(pointsEarned)} ganados</span>}
            {pointsSpent > 0 && <span className="text-red-600 font-bold">-{formatNumber(pointsSpent)} gastados</span>}
          </div>
        </div>
      ) : null}
    </Card>
  );
};

const EditableReasonCard = ({ note, logId, onUpdateNote }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(note || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (editValue.trim() === (note || '')) {
      setIsEditing(false);
      return;
    }
    setIsSaving(true);
    await onUpdateNote(logId, editValue.trim());
    setIsSaving(false);
    setIsEditing(false);
  };

  if (!note && !isEditing) {
    return (
      <button 
        onClick={() => { setEditValue(''); setIsEditing(true); }}
        className="w-full flex items-center justify-center gap-2 py-3 bg-white border border-dashed border-[#cbd5e1] rounded-[14px] text-[11px] font-bold text-[#64748b] hover:bg-[#f8fafc] hover:border-[#94a3b8] hover:text-[#475569] transition-all cursor-pointer"
      >
        <Plus size={14} /> Añadir una nota a este registro
      </button>
    );
  }

  if (isEditing) {
    return (
      <div className="bg-[#fffbeb] border border-[#fde68a] rounded-[14px] p-3 shadow-sm flex flex-col gap-2">
        <textarea
          autoFocus
          className="w-full bg-white border border-[#fcd34d] rounded-lg p-2 text-[12px] text-slate-800 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 resize-none min-h-[60px] custom-scrollbar"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          placeholder="Escribe el motivo o nota aclaratoria..."
        />
        <div className="flex justify-end gap-2 mt-1">
          <button 
            onClick={() => { setIsEditing(false); setEditValue(note || ''); }}
            className="px-3 py-1.5 rounded-lg text-[10px] font-bold text-slate-500 hover:bg-slate-100"
            disabled={isSaving}
          >
            Cancelar
          </button>
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
          >
            {isSaving ? 'Guardando...' : <><Save size={12} /> Guardar Nota</>}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#fffbeb] border border-[#fde68a] rounded-[14px] p-4 shadow-sm group relative">
      <div className="flex justify-between items-center mb-2">
        <div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600 flex items-center gap-1.5">
          💬 Motivo / Nota Adjunta
        </div>
        <button 
          onClick={() => { setEditValue(note || ''); setIsEditing(true); }}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-amber-500 hover:text-amber-700 bg-amber-100 p-1 rounded-md"
          title="Editar nota"
        >
          <Edit3 size={12} />
        </button>
      </div>
      <p className="text-[12px] text-amber-900 font-medium leading-relaxed italic pr-6 whitespace-pre-wrap">"{note}"</p>
    </div>
  );
};

export default function LogDetailRenderer({ log, onUpdateNote, onReprintPdf }) {
  const action = log.action;
  const details = log.details;

  if (!details) return <p className="text-slate-400 italic text-sm text-center py-4">Sin detalles registrados.</p>;
  
  if (typeof details === 'string' && !['Horario Modificado', 'Sistema Iniciado', 'Venta Eliminada'].includes(action)) {
    return (
      <div className="space-y-4">
        <Card icon="📄" title="Información">
          <Item label="Detalle" value={details} />
        </Card>
        <EditableReasonCard note={extractRealNote(log)} logId={log.id} onUpdateNote={onUpdateNote} />
      </div>
    );
  }

  const validNote = extractRealNote(log);
  const clientDisplay = getClientDisplay(details);

  const getFormattedPayment = (payStr, instNum) => {
    if (typeof payStr !== 'string') return 'Efectivo';
    
    let extractedInst = 0;
    const match = payStr.match(/\((\d+)c\)/i);
    if (match) {
      extractedInst = Number(match[1]);
    }

    let clean = payStr.replace(/\s*\(\d+c\)/i, '').trim();
    let i = Number(instNum) || extractedInst || 0;
    
    if (i > 0 || clean.toLowerCase() === 'credito' || clean.toLowerCase() === 'crédito') {
      return i > 0 ? `Crédito (${i} ${i === 1 ? 'cuota' : 'cuotas'})` : 'Crédito';
    }
    return clean;
  };

  switch (action) {

    // ==============================================
    // CASOS: OFERTAS Y COMBOS
    // ==============================================
    case 'Oferta Creada': {
      return (
        <div className="space-y-4">
          <Card icon="🎫" title="Datos de la Oferta">
            <Item label="Nombre" value={details.name} />
            <Item label="Tipo">
              <Badge color="violet">{details.type}</Badge>
            </Item>
            <Item label="Aplicación" value={details.applyTo === 'Seleccion' ? 'Botón POS (Armado)' : 'Automático'} />
            
            {details.itemsCount > 0 && <Item label="Cantidad Mínima Requerida" value={details.itemsCount} />}
            {details.offerPrice > 0 && (
              <Item label="Precio de Oferta">
                <span className="text-[#059669] font-bold"><FancyPrice amount={details.offerPrice} /></span>
              </Item>
            )}
            {details.discountValue > 0 && (
              <Item label="Descuento Directo">
                <span className="text-red-500 font-bold">-$<FancyPrice amount={details.discountValue} /></span>
              </Item>
            )}
          </Card>
          
          {details.productsIncluded && details.productsIncluded.length > 0 && (
            <Card icon="📦" title="Productos Incluidos">
              <div className="max-h-40 overflow-y-auto space-y-1.5 custom-scrollbar">
                {details.productsIncluded.map((pName, idx) => (
                  <div key={idx} className="px-3 py-2 bg-[#f4f6f9] rounded-[9px] text-[11px] border border-[#eaecf1] text-slate-700 font-medium">
                    <span className="text-violet-500 mr-2">•</span>{pName}
                  </div>
                ))}
              </div>
            </Card>
          )}
          
          <EditableReasonCard note={validNote} logId={log.id} onUpdateNote={onUpdateNote} />
        </div>
      );
    }

    case 'Oferta Editada': {
      return (
        <div className="space-y-4">
          <Card icon="🎫" title="Datos de la Oferta">
            <Item label="Nombre" value={details.name} />
            <Item label="Tipo">
              <Badge color="violet">{details.type}</Badge>
            </Item>
          </Card>

          <Card icon="🔄" title="Modificaciones Principales">
            {details.oldPrice !== details.newPrice ? (
              <ChangeRow field="Precio / Descuento" oldVal={details.oldPrice || 0} newVal={details.newPrice || 0} isPrice={true} />
            ) : (
              <Item label="Precios" value="Sin cambios" />
            )}
            
            {details.changedCount && (
               <div className="mt-2.5 px-3 py-2 bg-[#e0e7ff] text-[#4338ca] rounded-[9px] text-[11px] border border-[#c7d2fe] font-bold flex items-center justify-between">
                 <div className="flex items-center gap-1.5"><AlertTriangle size={14}/> Listado de Productos</div>
                 <span>Modificado</span>
               </div>
            )}
          </Card>

          {details.productsIncluded && details.productsIncluded.length > 0 && (
            <Card icon="📦" title="Nueva Lista de Productos">
              <div className="max-h-40 overflow-y-auto space-y-1.5 custom-scrollbar">
                {details.productsIncluded.map((pName, idx) => (
                  <div key={idx} className="px-3 py-2 bg-[#f4f6f9] rounded-[9px] text-[11px] border border-[#eaecf1] text-slate-700 font-medium">
                    <span className="text-violet-500 mr-2">•</span>{pName}
                  </div>
                ))}
              </div>
            </Card>
          )}

          <EditableReasonCard note={validNote} logId={log.id} onUpdateNote={onUpdateNote} />
        </div>
      );
    }

    case 'Oferta Eliminada': {
      return (
        <div className="space-y-4">
          <Card icon="🗑️" title="Datos de la Oferta Eliminada">
            <Item label="Nombre" value={details.name} />
            <Item label="Tipo">
              <Badge color="red">{details.type}</Badge>
            </Item>
            {details.offerPrice > 0 && (
              <Item label="Precio Final que tenía">
                <FancyPrice amount={details.offerPrice} />
              </Item>
            )}
          </Card>
          
          <Card icon="🔗" title="Impacto en el Catálogo">
             <Item label="Productos desvinculados" className="!bg-[#fef2f2] !border-[#fecaca]">
               <span className="text-[#dc2626] font-bold">{details.affectedProductsCount || 0} productos</span>
             </Item>
          </Card>

          <EditableReasonCard note={validNote} logId={log.id} onUpdateNote={onUpdateNote} />
          <WarnCard>⚠ La oferta fue purgada y retirada automáticamente de todos los productos que la tenían asignada.</WarnCard>
        </div>
      );
    }
    
    // ==============================================
    // CASO: EXPORTACIÓN PDF
    // ==============================================
    case 'Exportación PDF': {
      // Leemos el config que está ADENTRO del snapshot
      const snap = details.snapshot || {};
      const config = snap.config || {};
      
      const isClient = config.isForClient;
      const itemsCount = details.itemCount || (snap.items ? snap.items.length : 0);
      const displayTitle = (config.documentTitle || 'PRESUPUESTO').toUpperCase();
      
      return (
        <div className="space-y-4">
          
          <button 
            onClick={() => onReprintPdf && onReprintPdf(details)}
            className="w-full flex flex-col items-center justify-center gap-2 p-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[14px] shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 border border-indigo-500 group"
          >
            <Download size={28} className="group-hover:scale-110 transition-transform duration-300" />
            <div className="text-center">
              <span className="block font-black text-sm uppercase tracking-wider mb-1">Volver a Descargar PDF</span>
              <span className="text-[10px] text-indigo-200 font-medium">Recrea el documento exactamente como fue generado</span>
            </div>
          </button>

          <Card icon="📄" title="Datos del Documento Generado">
            <Item label="Tipo de Documento">
              <Badge color={isClient ? 'indigo' : 'slate'}>
                {isClient ? 'Presupuesto a Cliente' : 'Reporte Interno'}
              </Badge>
            </Item>
            
            {isClient && (
              <>
                <Item label="Título" value={displayTitle} />
                <Item label="Cliente" value={config.clientName || 'Sin especificar'} />
                <Item label="Evento" value={config.clientEvent || 'Sin especificar'} />
              </>
            )}
            
            <Item label="Cantidad de Ítems">
              <span className="font-bold text-slate-800">{itemsCount} productos</span>
            </Item>
          </Card>

          <EditableReasonCard note={validNote} logId={log.id} onUpdateNote={onUpdateNote} />
        </div>
      );
    }

    // ==============================================

    case 'Apertura de Caja':
      return (
        <div className="space-y-4">
          <Card icon="💰" title="Información de Apertura">
            <Item label="Monto Inicial">
              <span className="text-[#059669] text-[14px] font-bold">
                <FancyPrice amount={details.amount} />
              </span>
            </Item>
            {details.scheduledClosingTime && (
              <Item label="Cierre Programado" value={details.scheduledClosingTime} />
            )}
            <Item label="Hora de Apertura" value={log.timestamp || '--:--'} />
          </Card>
          <EditableReasonCard note={validNote} logId={log.id} onUpdateNote={onUpdateNote} />
        </div>
      );

    case 'Cierre de Caja':
    case 'Cierre Automático':
      return (
        <div className="space-y-4">
          {action === 'Cierre Automático' && (
            <div className="bg-[#fff7ed] border border-[#ffedd5] rounded-[14px] p-3.5 text-[11px] text-[#c2410c] font-bold flex items-center gap-2">
              ⚠ Cierre automático ejecutado por el sistema
            </div>
          )}
          <Card icon="💰" title="Balance del Día">
            <Item label="Caja Inicial">
              <span className="font-bold"><FancyPrice amount={details.openingBalance || 0} /></span>
            </Item>
            <Item label="Ventas del Día">
              <span className="text-[#059669] font-bold">+<FancyPrice amount={details.totalSales || 0} /></span>
            </Item>
            {details.totalExpenses !== undefined && (
              <Item label="Gastos">
                <span className="text-[#dc2626] font-bold">-<FancyPrice amount={details.totalExpenses || 0} /></span>
              </Item>
            )}
          </Card>
          <HighlightCard
            label="Total al Cierre (Neto)"
            amount={details.finalBalance || details.netProfit || details.totalSales || 0}
            sub={`${details.closingTime || log.timestamp} · ${details.salesCount || 0} operaciones`}
          />
          <Card icon="📊" title="Estadísticas de Operación">
            <Item label="Ventas Registradas">
              <Badge color="blue">{details.salesCount || 0} operaciones</Badge>
            </Item>
            {details.scheduledClosingTime && (
              <Item label="Cierre Programado" value={details.scheduledClosingTime} />
            )}
            {details.closingTime && (
              <Item label="Hora Real de Cierre" value={details.closingTime} />
            )}
          </Card>
          <EditableReasonCard note={validNote} logId={log.id} onUpdateNote={onUpdateNote} />
        </div>
      );

    case 'Venta Realizada': {
      const items = details.items || [];
      return (
        <div className="space-y-4">
          <Card icon="🛒" title="Productos">
            {items.map((item, idx) => {
              const q = item.quantity || item.qty || 0;
              const isWeight = item.product_type === 'weight' || item.isWeight || (q >= 20 && item.price < 50);
              const totalMonto = item.isReward ? 'GRATIS' : (item.price || 0) * q;
              
              return (
                <ProductItem
                  key={idx}
                  qty={q}
                  name={item.title || item.name || 'Producto'}
                  totalAmount={totalMonto}
                  isWeight={isWeight}
                />
              );
            })}
          </Card>

          <Card icon="💳" title="Pago">
            <Item label="Método de pago" value={getFormattedPayment(details.payment, details.installments)} />
          </Card>

          <MemberImpactCard 
            clientDisplay={clientDisplay} 
            pointsChange={details.pointsChange} 
            pointsEarned={details.pointsEarned} 
            pointsSpent={details.pointsSpent} 
          />

          <EditableReasonCard note={validNote} logId={log.id} onUpdateNote={onUpdateNote} />
        </div>
      );
    }

    case 'Venta Anulada': {
      const items = details.itemsReturned || details.items || [];
      const paymentMethod = details.payment && details.payment !== 'N/A' ? getFormattedPayment(details.payment, details.installments) : null;
      
      return (
        <div className="space-y-4">
          
          <Card icon="💰" title="Ajuste Financiero">
             <ChangeRow field="Monto Anulado" oldVal={details.originalTotal || details.total} newVal={0} isPrice={true} />
             {paymentMethod && <Item label="Método de Pago devuelto" value={paymentMethod} />}
          </Card>

          <Card icon="📦" title="Productos Devueltos al Stock">
            {items.map((item, idx) => (
              <div key={idx} className="flex justify-between items-center px-3 py-2 bg-[#dcfce7] rounded-[9px] text-[11px] border border-[#bbf7d0]">
                <span className="text-[#15803d] font-medium flex items-center">
                  <span className="font-mono text-[9px] font-bold bg-[#16a34a] text-white px-1.5 py-[2px] rounded-[4px] mr-2">
                    +{item.quantity || item.qty}
                  </span>
                  {item.title || item.name || 'Producto'}
                </span>
                <span className="text-[#15803d] font-bold text-[10px] uppercase tracking-wider">Restaurado</span>
              </div>
            ))}
          </Card>

          <MemberImpactCard 
            clientDisplay={clientDisplay} 
            pointsChange={details.pointsChange} 
            pointsEarned={details.pointsEarned} 
            pointsSpent={details.pointsSpent} 
          />

          <EditableReasonCard note={validNote} logId={log.id} onUpdateNote={onUpdateNote} />
          <WarnCard>⚠ Se restó el dinero de caja y se devolvieron los productos al inventario.</WarnCard>
        </div>
      );
    }

    case 'Venta Restaurada': {
      const items = details.itemsRestored || details.items || [];
      const paymentMethod = details.payment && details.payment !== 'N/A' ? getFormattedPayment(details.payment, details.installments) : null;

      return (
        <div className="space-y-4">
          <Card icon="♻️" title="Transacción Restaurada">
            <Item label="Venta Original">
              <Badge color="slate">#{details.oldTransactionId || 'S/N'}</Badge>
            </Item>
            <Item label="Nuevo ID de Ticket">
              <Badge color="green">#{details.transactionId || 'S/N'}</Badge>
            </Item>
          </Card>

          <Card icon="💰" title="Reingreso Financiero">
             <ChangeRow field="Monto Recuperado" oldVal={0} newVal={details.total} isPrice={true} />
             {paymentMethod && <Item label="Ingresado a caja como" value={paymentMethod} />}
          </Card>

          <Card icon="📦" title="Productos Vueltos a Vender">
            {items.map((item, idx) => (
              <div key={idx} className="flex justify-between items-center px-3 py-2 bg-[#fee2e2] rounded-[9px] text-[11px] border border-[#fecaca]">
                <span className="text-[#dc2626] font-medium flex items-center">
                  <span className="font-mono text-[9px] font-bold bg-[#dc2626] text-white px-1.5 py-[2px] rounded-[4px] mr-2">
                    -{item.quantity || item.qty}
                  </span>
                  {item.title || item.name || 'Producto'}
                </span>
                <span className="text-[#dc2626] font-bold text-[10px] uppercase tracking-wider">Descontado</span>
              </div>
            ))}
          </Card>

          <MemberImpactCard 
            clientDisplay={clientDisplay} 
            pointsChange={details.pointsChange} 
            pointsEarned={details.pointsEarned} 
            pointsSpent={details.pointsSpent} 
          />

          <EditableReasonCard note={validNote} logId={log.id} onUpdateNote={onUpdateNote} />
          <WarnCard isSuccess={true}>✓ La venta volvió a ser activada. El dinero y el stock ya fueron ajustados.</WarnCard>
        </div>
      );
    }

    case 'Modificación Pedido':
    case 'Venta Modificada': {
      const changes = details.changes || {};
      const productChanges = details.productChanges || [];
      const itemsSnapshot = details.itemsSnapshot || [];

      const isLegacy = !details.changes && !details.productChanges && !details.itemsSnapshot;
      
      if (isLegacy) {
         return (
           <div className="space-y-4">
             <Card icon="📝" title="Detalle de Edición">
               <Item label="Transacción afectada" value={`#${getTransactionId(details) || 'Desconocida'}`} />
             </Card>
             <EditableReasonCard note={validNote} logId={log.id} onUpdateNote={onUpdateNote} />
             <WarnCard>Este es un registro antiguo. No contiene el desglose de productos modificados.</WarnCard>
           </div>
         );
      }

      const basePayment = typeof details.payment === 'string' ? details.payment : 'Efectivo';
      
      const oldPayText = getFormattedPayment(
        changes.payment ? changes.payment.old : basePayment,
        changes.installments ? changes.installments.old : (details.installments || 0)
      );
      
      const newPayText = getFormattedPayment(
        changes.payment ? changes.payment.new : basePayment,
        changes.installments ? changes.installments.new : (details.installments || 0)
      );

      const isTotalActuallyChanged = changes.total && (changes.total.old !== changes.total.new);
      const isPaymentActuallyChanged = oldPayText !== newPayText;

      return (
        <div className="space-y-4"> 
          
          {itemsSnapshot.length > 0 && (
            <Card icon="🛒" title="Venta Resultante">
              {itemsSnapshot.map((item, idx) => {
                 const q = item.qty || item.quantity || 0;
                 const isWeight = item.product_type === 'weight' || item.isWeight || (q >= 20 && item.price < 50);
                 const totalMonto = item.isReward ? 'GRATIS' : (item.price || 0) * q;
                 return (
                  <ProductItem
                    key={idx}
                    qty={q}
                    name={item.title || item.name}
                    totalAmount={totalMonto}
                    isWeight={isWeight}
                  />
                );
              })}
            </Card>
          )}

          {productChanges.length > 0 && (
            <Card icon="📦" title="Diferencias de Stock">
              {productChanges.map((change, idx) => (
                <div key={idx} className="flex justify-between items-center px-3 py-2 bg-[#f4f6f9] rounded-[9px] text-[11px] border border-[#eaecf1]">
                  <span className="font-bold text-[#1e293b] truncate mr-2 flex-1">{change.title}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[#dc2626] line-through text-[10px] font-medium">{change.oldQty}x</span>
                    <span className="text-[#94a3b8] text-[10px]">→</span>
                    <span className="text-[#16a34a] font-bold">
                      {change.newQty === 0 ? 'Eliminado' : `${change.newQty}x`}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded-[4px] text-[9px] font-bold ml-1 ${
                      change.diff > 0 ? 'bg-[#dcfce7] text-[#15803d]' : 'bg-[#fee2e2] text-[#dc2626]'
                    }`}>
                      {change.diff > 0 ? `+${change.diff}` : change.diff}
                    </span>
                  </div>
                </div>
              ))}
            </Card>
          )}

          <Card icon="💰" title="Ajuste Financiero">
             {isTotalActuallyChanged && (
                <ChangeRow field="Monto Total" oldVal={changes.total.old} newVal={changes.total.new} isPrice={true} />
             )}
             {isPaymentActuallyChanged && (
                <ChangeRow field="Método de Pago" oldVal={oldPayText} newVal={newPayText} />
             )}
             {!isTotalActuallyChanged && !isPaymentActuallyChanged && (
                <Item label="Monto y Pago" value="Sin modificaciones" />
             )}
          </Card>

          <MemberImpactCard 
            clientDisplay={clientDisplay} 
            pointsChange={details.pointsChange} 
          />

          <EditableReasonCard note={validNote} logId={log.id} onUpdateNote={onUpdateNote} />
        </div>
      );
    }

    case 'Edición de Puntos': {
      const pointsData = details.pointsChange || details;
      
      return (
        <div className="space-y-4">
          <MemberImpactCard 
            clientDisplay={clientDisplay} 
            pointsChange={pointsData} 
          />
          <EditableReasonCard note={validNote} logId={log.id} onUpdateNote={onUpdateNote} />
        </div>
      );
    }

    case 'Nuevo Socio':
    case 'Edición de Socio':
    case 'Baja de Socio': {
      const isNew = action === 'Nuevo Socio';
      const isDelete = action === 'Baja de Socio';
      const memberName = details.name || details.member || null;
      const memberNumber = details.number ? String(details.number).padStart(4, '0') : null;

      return (
        <div className="space-y-4">
          <Card icon="👤" title={isNew ? 'Ficha del Nuevo Socio' : isDelete ? 'Datos del Socio Eliminado' : 'Datos del Socio'}>
            {memberName && (
              <Item label="Nombre">
                <span className={isDelete ? 'line-through text-[#94a3b8]' : ''}>{memberName}</span>
              </Item>
            )}
            {memberNumber && (
              <Item label="Número">
                <Badge color="slate">#{memberNumber}</Badge>
              </Item>
            )}
            {details.dni && <Item label="DNI" value={details.dni} />}
            {details.email && <Item label="Email" value={details.email} />}
            {details.phone && <Item label="Teléfono" value={details.phone} />}
            
            {isDelete && details.points !== undefined && (
               <Item label="Puntos Perdidos">
                  <span className="text-[#dc2626] font-bold">{formatNumber(details.points)} pts</span>
               </Item>
            )}
            {isDelete && details.salesCount !== undefined && (
               <Item label="Compras Históricas" value={`${details.salesCount} operations`} />
            )}

            {isNew && details.initialPoints !== undefined && (
              <Item label="Puntos Iniciales">
                <span className="text-[#059669] font-bold">{formatNumber(details.initialPoints || 0)} pts</span>
              </Item>
            )}

            {isNew && (
              <Item label="Fecha de Registro">
                 <span className="font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">
                    {log.date} · {log.timestamp} hs
                 </span>
              </Item>
            )}
          </Card>

          {details.changes && Array.isArray(details.changes) && details.changes.length > 0 && (
            <Card icon="🔄" title="Modificaciones Realizadas">
              {details.changes.map((change, idx) => (
                <ChangeRow
                  key={idx}
                  field={change.field}
                  oldVal={change.old || '—'}
                  newVal={change.new || '—'}
                />
              ))}
            </Card>
          )}

          <EditableReasonCard note={validNote} logId={log.id} onUpdateNote={onUpdateNote} />
          {isDelete && <WarnCard>⚠ El registro del socio fue eliminado permanentemente del sistema.</WarnCard>}
        </div>
      );
    }

    case 'Nuevo Gasto':
    case 'Gasto':
      return (
        <div className="space-y-4">
          <Card icon="💸" title="Detalle del Gasto">
            <Item label="Monto">
              <span className="text-[#dc2626] text-[14px] font-bold">
                -<FancyPrice amount={details.amount} />
              </span>
            </Item>
            <Item label="Categoría" value={details.category || 'Sin categoría'} />
            <Item label="Método de Pago" value={details.paymentMethod || 'No especificado'} />
          </Card>
          <EditableReasonCard note={validNote} logId={log.id} onUpdateNote={onUpdateNote} />
        </div>
      );

    case 'Alta de Producto':
      return (
        <div className="space-y-4">
          <Card icon="📋" title="Datos del Producto">
            <Item label="Nombre" value={details.title || details.name || details.product || '-'} />
            {details.brand && details.brand !== '' && <Item label="Marca" value={details.brand} />}
            <Item label="Categoría">
              <Badge color="fuchsia">{details.category || 'Sin categoría'}</Badge>
            </Item>
            {details.purchasePrice !== undefined && details.purchasePrice !== null && (
              <Item label="Precio Costo">
                <FancyPrice amount={details.purchasePrice} />
              </Item>
            )}
            <Item label="Precio Venta">
              <span className="text-[#059669] font-bold"><FancyPrice amount={details.price} /></span>
            </Item>
            <Item label="Stock Inicial">
              <Badge color="blue">{formatNumber(details.stock || 0)} {details.product_type === 'weight' ? 'g' : 'uds'}</Badge>
            </Item>
            {details.barcode && details.barcode !== '' && (
              <Item label="Código de Barras" value={details.barcode} />
            )}
            {details.product_type && (
              <Item label="Tipo" value={details.product_type === 'weight' ? 'Por peso (kg/g)' : 'Por unidad'} />
            )}
          </Card>
          <EditableReasonCard note={validNote} logId={log.id} onUpdateNote={onUpdateNote} />
        </div>
      );

    case 'Edición Producto': {
      const productName = details.product || details.title || details.name || 'Producto';

      if (details.changes && typeof details.changes === 'object' && !Array.isArray(details.changes) && Object.keys(details.changes).length > 0) {
        const fieldNames = {
          title: 'Nombre', purchasePrice: 'Costo', price: 'Precio',
          stock: 'Stock', category: 'Categoría', brand: 'Marca',
          barcode: 'Código', weight: 'Peso', product: 'Nombre'
        };
        return (
          <div className="space-y-4">
            <Card icon="📦" title="Producto Modificado">
              <Item label="Producto" value={productName} />
            </Card>
            <Card icon="🔄" title="Cambios Realizados">
              {Object.entries(details.changes).map(([key, val]) => (
                <ChangeRow
                  key={key}
                  field={fieldNames[key] || key}
                  oldVal={val.old}
                  newVal={val.new}
                  isPrice={key.toLowerCase().includes('price')}
                />
              ))}
            </Card>
            <EditableReasonCard note={validNote} logId={log.id} onUpdateNote={onUpdateNote} />
          </div>
        );
      }

      return (
        <div className="space-y-4">
          <Card icon="📦" title="Estado Actual del Producto">
            <Item label="Producto" value={productName} />
            <Item label="Categoría">
              <Badge color="fuchsia">{details.category || '-'}</Badge>
            </Item>
            <Item label="Precio">
              <span className="text-[#059669] font-bold"><FancyPrice amount={details.price} /></span>
            </Item>
            <Item label="Stock">
              <Badge color="blue">{formatNumber(details.stock)} {details.product_type === 'weight' ? 'g' : 'uds'}</Badge>
            </Item>
            {details.product_type && (
              <Item label="Tipo" value={details.product_type === 'weight' ? 'Por peso (kg/g)' : 'Por unidad'} />
            )}
          </Card>
          <EditableReasonCard note={validNote} logId={log.id} onUpdateNote={onUpdateNote} />
        </div>
      );
    }

    case 'Baja Producto':
      return (
        <div className="space-y-4">
          <Card icon="📋" title="Producto Eliminado">
            <Item label="Nombre" value={details.title || details.name || details.product || '-'} />
            {details.brand && details.brand !== '' && details.brand !== 'Generico' && (
              <Item label="Marca" value={details.brand} />
            )}
            <Item label="Categoría" value={details.category || '-'} />
            {details.price !== undefined && (
              <Item label="Precio al momento de baja">
                <FancyPrice amount={details.price} />
              </Item>
            )}
            <Item label="Stock descartado" className="!bg-[#fef2f2] !border-[#fecaca]">
              <span className="text-[#dc2626] font-bold">{formatNumber(details.stock || 0)} {details.product_type === 'weight' ? 'g' : 'unidades'}</span>
            </Item>
          </Card>
          <EditableReasonCard note={validNote} logId={log.id} onUpdateNote={onUpdateNote} />
          <WarnCard>⚠ El producto fue eliminado permanentemente del inventario.</WarnCard>
        </div>
      );

    case 'Producto Duplicado':
      return (
        <div className="space-y-4">
          <Card icon="📋" title="Producto Duplicado">
            {details.originalTitle && <Item label="Origen" value={details.originalTitle} />}
            <Item label="Nuevo Nombre" value={details.newTitle || details.title || details.name || '-'} />
          </Card>
          <Card icon="📦" title="Datos Copiados">
            {details.category && (
              <Item label="Categoría">
                <Badge color="fuchsia">{details.category}</Badge>
              </Item>
            )}
            {details.purchasePrice !== undefined && (
              <Item label="Precio Costo">
                <FancyPrice amount={details.purchasePrice} />
              </Item>
            )}
            {details.price !== undefined && (
              <Item label="Precio Venta">
                <span className="text-[#059669] font-bold"><FancyPrice amount={details.price} /></span>
              </Item>
            )}
            <Item label="Stock Inicial">
              <Badge color="blue">0 unidades</Badge>
            </Item>
          </Card>
          <EditableReasonCard note={validNote} logId={log.id} onUpdateNote={onUpdateNote} />
        </div>
      );

    case 'Nuevo Premio':
    case 'Editar Premio':
    case 'Eliminar Premio': {
      const rewardType = details.type === 'discount' ? 'Descuento' : details.type === 'product' ? 'Producto' : details.type || 'General';
      const isDelete = action === 'Eliminar Premio';
      return (
        <div className="space-y-4">
          <Card icon="🎁" title="Datos del Premio">
            <Item label="Nombre">
              <span className={isDelete ? 'line-through text-[#94a3b8]' : ''}>{details.title || details.name || '-'}</span>
            </Item>
            {details.description && <Item label="Descripción" value={details.description} />}
            {details.pointsCost !== undefined && (
              <Item label="Costo en Puntos">
                <Badge color="violet">{formatNumber(details.pointsCost)} pts</Badge>
              </Item>
            )}
            <Item label="Tipo" value={rewardType} />
            {details.stock !== undefined && (
              <Item label="Stock Límite" value={`${formatNumber(details.stock)} disponibles`} />
            )}
          </Card>
          <EditableReasonCard note={validNote} logId={log.id} onUpdateNote={onUpdateNote} />
          {isDelete && <WarnCard>⚠ El premio fue retirado permanentemente del catálogo.</WarnCard>}
        </div>
      );
    }

    case 'Actualización Masiva':
    case 'Edición Masiva Categorías': {
      const changeList = details.changes || details.details || [];
      return (
        <div className="space-y-4">
          <Card icon="🏷️" title="Resumen de Operación">
            <Item label="Productos Afectados">
              <Badge color="fuchsia">{details.count || changeList.length || 0}</Badge>
            </Item>
            {details.category && (
               <Item label="Categoría Objetivo" value={details.category} />
            )}
          </Card>
          {changeList.length > 0 && (
            <Card icon="📋" title="Detalle de Operaciones">
              <div className="max-h-60 overflow-y-auto space-y-[5px] pr-1 custom-scrollbar">
                {changeList.map((item, idx) => {
                  let isAdd = true;
                  let text = '';
                  
                  if (typeof item === 'string') {
                    isAdd = item.includes('✅') || item.includes('Agregado') || !item.includes('❌');
                    text = item;
                  } else {
                    isAdd = item.action === 'add';
                    text = `${isAdd ? '✅ Agregado' : '❌ Removido'} "${item.title || 'Producto'}" ${isAdd ? 'a' : 'de'} ${item.categoryName || 'categoría'}`;
                  }

                  return (
                    <div
                      key={idx}
                      className={`flex items-center gap-[6px] px-[11px] py-[9px] rounded-[9px] text-[10px] border ${
                        isAdd
                          ? 'bg-[#f4f6f9] border-[#eaecf1] text-[#15803d]'
                          : 'bg-[#fef2f2] border-[#fecaca] text-[#dc2626]'
                      }`}
                    >
                      <CheckCircle size={12} className={isAdd ? 'text-green-500' : 'text-red-500'} />
                      <span>{text}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
          <EditableReasonCard note={validNote} logId={log.id} onUpdateNote={onUpdateNote} />
        </div>
      );
    }

    case 'Categoría': {
      const isCreate = details.type === 'create';
      const isDelete = details.type === 'delete';
      const isEdit = details.type === 'edit';

      return (
        <div className="space-y-4">
          <Card icon="🏷️" title="Gestión de Categoría">
            <Item label="Operación">
              <Badge color={isCreate ? 'green' : isDelete ? 'red' : 'amber'}>
                {isCreate ? 'Creación' : isDelete ? 'Eliminación' : 'Renombrada'}
              </Badge>
            </Item>
            {isEdit && details.oldName ? (
              <ChangeRow field="Nombre" oldVal={details.oldName} newVal={details.name} />
            ) : (
              <Item label="Nombre">
                <span className={isDelete ? 'line-through text-[#94a3b8]' : ''}>{details.name}</span>
              </Item>
            )}
          </Card>
          <EditableReasonCard note={validNote} logId={log.id} onUpdateNote={onUpdateNote} />
        </div>
      );
    }

    case 'Login': {
      const roleName = details.name || details.role;
      const isAdmin = details.role === 'admin' || roleName === 'Dueño';
      return (
        <div className="space-y-4">
          <Card icon="🔑" title="Sesión Iniciada">
            <Item label="Usuario" value={roleName} />
            <Item label="Nivel de Acceso">
              <Badge color={isAdmin ? 'indigo' : 'green'}>
                {isAdmin ? 'Administrador' : 'Vendedor'}
              </Badge>
            </Item>
          </Card>
          <EditableReasonCard note={validNote} logId={log.id} onUpdateNote={onUpdateNote} />
        </div>
      );
    }

    case 'Horario Modificado':
      return (
        <div className="space-y-4">
          <Card icon="🕐" title="Configuración de Sistema">
            <Item label="Nuevo Horario de Cierre" value={typeof details === 'string' ? details : (details.time || 'Actualizado')} />
          </Card>
          <EditableReasonCard note={validNote} logId={log.id} onUpdateNote={onUpdateNote} />
        </div>
      );

    case 'Sistema Iniciado':
      return (
        <div className="space-y-4">
          <Card icon="⚡" title="Estado del Sistema">
            <Item label="Estado" value="Sistema inicializado correctamente" />
          </Card>
        </div>
      );

    case 'Venta Eliminada': {
      const txId = typeof details === 'string' ? getTransactionId(details) : details.transactionId;
      const isTestDel = typeof details === 'object' ? details.isTest : false;
      const items = typeof details === 'object' && details.items ? details.items : [];
      const paymentMethod = typeof details === 'object' && details.payment && details.payment !== 'N/A' ? getFormattedPayment(details.payment, details.installments) : null;
      
      return (
        <div className="space-y-4">
          <Card icon="🗑️" title="Registro Eliminado Permanentemente">
            <Item label="ID de Transacción">
              <span className="font-mono text-slate-800 font-bold">#{txId || 'N/A'}</span>
            </Item>
            {typeof details === 'object' && details.total !== undefined && (
               <ChangeRow field="Monto Anulado" oldVal={details.total} newVal={0} isPrice={true} />
            )}
            {paymentMethod && <Item label="Método de Pago" value={paymentMethod} />}
          </Card>

          {items.length > 0 && (
            <Card icon="📦" title="Productos Purgados">
              {items.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center px-3 py-2 bg-[#f8fafc] rounded-[9px] text-[11px] border border-[#e2e8f0]">
                  <span className="text-[#64748b] font-medium flex items-center">
                    <span className="font-mono text-[9px] font-bold bg-[#cbd5e1] text-white px-1.5 py-[2px] rounded-[4px] mr-2">
                      {item.quantity || item.qty}
                    </span>
                    {item.title || item.name || 'Producto'}
                  </span>
                  <span className="text-[#94a3b8] font-bold text-[10px] uppercase tracking-wider">Eliminado</span>
                </div>
              ))}
            </Card>
          )}

          <MemberImpactCard 
            clientDisplay={clientDisplay} 
            pointsEarned={typeof details === 'object' ? details.pointsEarned : 0} 
            pointsSpent={typeof details === 'object' ? details.pointsSpent : 0} 
          />
          
          {isTestDel && (
             <div className="bg-orange-100 border border-orange-200 rounded-[14px] p-3 text-[11px] text-orange-800 text-center font-bold flex justify-center items-center gap-2">
                <AlertTriangle size={14} /> Eliminación de Venta de Prueba
             </div>
          )}
          
          <EditableReasonCard note={validNote} logId={log.id} onUpdateNote={onUpdateNote} />
          <WarnCard>⚠ Este registro y todos sus rastros fueron purgados de la base de datos permanentemente.</WarnCard>
        </div>
      );
    }

    default: {
      return (
        <div className="space-y-4">
          <Card icon="📄" title="Datos del Registro">
            <div className="bg-[#1e293b] rounded-[9px] p-3 overflow-x-auto">
              <pre className="text-[10px] text-[#4ade80] font-mono whitespace-pre-wrap">
                {JSON.stringify(details, null, 2)}
              </pre>
            </div>
          </Card>
          <EditableReasonCard note={validNote} logId={log.id} onUpdateNote={onUpdateNote} />
        </div>
      );
    }
  }
}