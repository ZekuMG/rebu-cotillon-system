// src/components/ActionLogs/LogDetailRenderer.jsx
import React from 'react';
import { ArrowRight, CheckCircle } from 'lucide-react';
// ♻️ FIX: Importamos formatCurrency para textos crudos, y FancyPrice para la interfaz visual
import { formatCurrency } from '../../utils/helpers';
import { FancyPrice } from '../FancyPrice';

// ════════════════════════════════════════════
//  HELPERS EXPORTABLES
// ════════════════════════════════════════════

const getTransactionId = (details) => {
  if (!details || typeof details === 'string') return null;
  const id = details.transactionId || details.id;
  if (!id) return null;
  return typeof id === 'string' && id.includes('TRX-') ? id.replace('TRX-', '') : id;
};

export const getDetailTitle = (action) => {
  const titles = {
    'Apertura de Caja': 'Reporte de Apertura',
    'Cierre de Caja': 'Reporte de Cierre',
    'Cierre Automático': 'Reporte Automático',
    'Venta Realizada': 'Detalle de Transacción',
    'Venta Anulada': 'Anulación de Venta',
    'Modificación Pedido': 'Ajuste de Pedido',
    'Venta Modificada': 'Ajuste de Pedido',
    'Nuevo Gasto': 'Comprobante de Gasto',
    'Gasto': 'Comprobante de Gasto',
    'Alta de Producto': 'Ingreso de Producto',
    'Edición Producto': 'Modificación de Inventario',
    'Baja Producto': 'Egreso de Producto',
    'Producto Duplicado': 'Producto Duplicado',
    'Nuevo Socio': 'Ficha de Nuevo Socio',
    'Edición de Socio': 'Actualización de Perfil',
    'Edición de Puntos': 'Movimiento de Puntos',
    'Baja de Socio': 'Eliminación de Registro',
    'Nuevo Premio': 'Alta de Premio',
    'Editar Premio': 'Edición de Premio',
    'Eliminar Premio': 'Baja de Premio',
    'Categoría': 'Gestión de Categorías',
    'Actualización Masiva': 'Reporte de Cambios Masivos',
    'Edición Masiva Categorías': 'Reporte de Cambios Masivos',
    'Horario Modificado': 'Cambio de Horario',
    'Sistema Iniciado': 'Información del Sistema',
    'Borrado Permanente': 'Registro Eliminado',
    'Login': 'Inicio de Sesión'
  };
  return titles[action] || 'Detalles del Registro';
};

export const getDetailIcon = (action) => {
  const icons = {
    'Venta Realizada': '🛒', 'Venta Anulada': '❌',
    'Modificación Pedido': '📝', 'Venta Modificada': '📝',
    'Apertura de Caja': '💰', 'Cierre de Caja': '🔒', 'Cierre Automático': '⏰',
    'Edición Producto': '✏️', 'Alta de Producto': '📦', 'Baja Producto': '🗑️',
    'Producto Duplicado': '📋',
    'Categoría': '🏷️', 'Edición Masiva Categorías': '🏷️', 'Actualización Masiva': '🏷️',
    'Nuevo Socio': '👤', 'Edición de Socio': '👤', 'Edición de Puntos': '🏆', 'Baja de Socio': '👤',
    'Nuevo Gasto': '📉', 'Gasto': '📉',
    'Nuevo Premio': '🎁', 'Editar Premio': '🎁', 'Eliminar Premio': '🎁',
    'Login': '🔑', 'Horario Modificado': '🕐', 'Sistema Iniciado': '⚡',
    'Borrado Permanente': '🗑️'
  };
  return icons[action] || '📄';
};

// 🎨 NUEVO ESQUEMA SEMÁNTICO EN EL MODAL (Coincide con la Tabla)
export const getDetailColor = (action) => {
  const colors = {
    // Verde (Dinero)
    'Venta Realizada': 'green', 'Apertura de Caja': 'green',
    // Rojo (Destructivo/Salidas)
    'Venta Anulada': 'red', 'Baja Producto': 'red', 'Baja de Socio': 'red', 'Eliminar Premio': 'red', 'Borrado Permanente': 'red', 'Nuevo Gasto': 'red', 'Gasto': 'red',
    // Azul (Inventario y Socios base)
    'Alta de Producto': 'blue', 'Edición Producto': 'blue', 'Producto Duplicado': 'blue',
    'Nuevo Socio': 'blue', 'Edición de Socio': 'blue', 
    // Violeta (Comunidad/Fidelización)
    'Edición de Puntos': 'violet', 'Nuevo Premio': 'violet', 'Editar Premio': 'violet',
    // Ámbar (Ajustes/Alertas)
    'Modificación Pedido': 'amber', 'Venta Modificada': 'amber', 'Categoría': 'amber', 'Actualización Masiva': 'amber', 'Edición Masiva Categorías': 'amber', 'Horario Modificado': 'amber',
    // Pizarra (Sistema)
    'Cierre de Caja': 'slate', 'Cierre Automático': 'slate', 'Login': 'slate', 'Sistema Iniciado': 'slate'
  };
  return colors[action] || 'slate';
};

export const ACTION_GROUPS = [
  { label: '💰 Caja', actions: ['Apertura de Caja', 'Cierre de Caja', 'Cierre Automático'] },
  { label: '🛒 Ventas', actions: ['Venta Realizada', 'Venta Anulada', 'Venta Modificada'] },
  { label: '📉 Gastos', actions: ['Nuevo Gasto'] },
  { label: '📦 Productos', actions: ['Alta de Producto', 'Edición Producto', 'Baja Producto', 'Producto Duplicado'] },
  { label: '👤 Socios', actions: ['Nuevo Socio', 'Edición de Socio', 'Edición de Puntos', 'Baja de Socio'] },
  { label: '🎁 Premios', actions: ['Nuevo Premio', 'Editar Premio', 'Eliminar Premio'] },
  { label: '🏷️ Categorías', actions: ['Categoría', 'Actualización Masiva', 'Edición Masiva Categorías'] },
  { label: '⚙️ Sistema', actions: ['Login', 'Horario Modificado', 'Sistema Iniciado', 'Borrado Permanente'] }
];

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
    slate: 'bg-slate-100 text-slate-600 border-slate-200'
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold border ${classes[color] || classes.slate}`}>
      {children}
    </span>
  );
};

const ReasonCard = ({ note }) => (
  <div className="bg-[#fffbeb] border border-[#fde68a] rounded-[14px] p-4">
    <div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600 mb-2 flex items-center gap-1.5">
      💬 Motivo / Nota
    </div>
    <p className="text-[11px] text-amber-800 italic leading-relaxed">"{note}"</p>
  </div>
);

const WarnCard = ({ children }) => (
  <div className="bg-[#fef2f2] border border-[#fecaca] rounded-[14px] p-3.5 text-[11px] text-red-800 text-center font-semibold">
    {children}
  </div>
);

const HighlightCard = ({ label, amount, sub }) => (
  <div className="bg-slate-800 rounded-[14px] p-4 text-white">
    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</div>
    <div className="text-[28px] font-extrabold font-mono mt-1 leading-none">
      <FancyPrice amount={amount} />
    </div>
    {sub && <div className="text-[11px] text-slate-500 mt-1.5">{sub}</div>}
  </div>
);

// ════════════════════════════════════════════
//  COMPONENTE PRINCIPAL DE RENDERIZADO
// ════════════════════════════════════════════

export default function LogDetailRenderer({ log }) {
  const action = log.action;
  const details = log.details;

  if (!details) return <p className="text-slate-400 italic text-sm text-center py-4">Sin detalles registrados.</p>;
  if (typeof details === 'string') {
    return (
      <div className="space-y-4">
        <Card icon="📄" title="Información">
          <Item label="Detalle" value={details} />
        </Card>
      </div>
    );
  }

  // 👇 LIMPIADOR UNIVERSAL
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

    // ══════════════════════════════════════
    //  CAJA
    // ══════════════════════════════════════

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
        </div>
      );

    // ══════════════════════════════════════
    //  VENTAS
    // ══════════════════════════════════════

    case 'Venta Realizada': {
      const items = details.items || [];
      let clientDisplay = null;
      if (details.client && typeof details.client === 'object') {
        clientDisplay = `${details.client.name || 'Desconocido'} ${details.client.memberNumber && details.client.memberNumber !== '---' ? `#${String(details.client.memberNumber).padStart(4, '0')}` : ''}`.trim();
      } else if (details.client && typeof details.client === 'string') {
        clientDisplay = details.client;
        if (details.memberNumber && details.memberNumber !== '---') {
          clientDisplay += ` #${String(details.memberNumber).padStart(4, '0')}`;
        }
      } else if (details.memberName) {
        clientDisplay = `${details.memberName} ${details.memberNumber ? `#${String(details.memberNumber).padStart(4, '0')}` : ''}`.trim();
      }
      if (clientDisplay === 'No asociado') clientDisplay = null; 

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
            {clientDisplay && <Item label="Cliente" value={clientDisplay} />}
            {details.pointsEarned > 0 && (
              <Item label="Puntos ganados">
                <span className="text-[#059669] font-bold">+{details.pointsEarned} pts</span>
              </Item>
            )}
          </Card>
        </div>
      );
    }

    case 'Venta Anulada': {
      const items = details.itemsReturned || details.items || [];
      return (
        <div className="space-y-4">
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
          <div className="bg-[#fffbeb] border border-[#fde68a] rounded-[14px] p-3.5 text-[11px] text-[#b45309] font-medium">
            ⚠ <strong>Nota:</strong> El stock fue restaurado automáticamente.
          </div>
          {(details.reason || log.reason) && <ReasonCard note={details.reason || log.reason} />}
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
             {(details.reason || log.reason) && <ReasonCard note={details.reason || log.reason} />}
             <WarnCard>Este es un registro antiguo. No contiene el desglose de productos modificados.</WarnCard>
           </div>
         );
      }

      let clientDisplay = null;
      if (details.client) {
        clientDisplay = `${details.client} ${details.memberNumber && details.memberNumber !== '---' ? `#${String(details.memberNumber).padStart(4, '0')}` : ''}`.trim();
      }

      // 👇 CÁLCULO ESTRICTO DE PAGOS Y CUOTAS EN EL MODAL
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
                <ChangeRow
                  field="Monto Total"
                  oldVal={changes.total.old}
                  newVal={changes.total.new}
                  isPrice={true}
                />
             )}
             
             {isPaymentActuallyChanged && (
                <ChangeRow
                  field="Método de Pago"
                  oldVal={oldPayText}
                  newVal={newPayText}
                />
             )}

             {!isTotalActuallyChanged && !isPaymentActuallyChanged && (
                <Item label="Monto y Pago" value="Sin modificaciones" />
             )}
          </Card>

          {(clientDisplay || details.pointsChange) && (
            <Card icon="👤" title="Impacto en el Socio">
              {clientDisplay && <Item label="Socio vinculado" value={clientDisplay} />}
              {details.pointsChange && (
                 <ChangeRow 
                   field="Puntos de la venta" 
                   oldVal={`${details.pointsChange.previous} pts`} 
                   newVal={`${details.pointsChange.new} pts`} 
                 />
              )}
            </Card>
          )}

          {(details.reason || log.reason) && <ReasonCard note={details.reason || log.reason} />}
        </div>
      );
    }

    // ══════════════════════════════════════
    //  GASTOS
    // ══════════════════════════════════════

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
            {details.description && <Item label="Descripción" value={details.description} />}
          </Card>
          <Card icon="📋" title="Información">
            <Item label="Categoría" value={details.category || 'Sin categoría'} />
            <Item label="Método de Pago" value={details.paymentMethod || 'No especificado'} />
          </Card>
          {(details.note || log.reason) && <ReasonCard note={details.note || log.reason} />}
        </div>
      );

    // ══════════════════════════════════════
    //  PRODUCTOS
    // ══════════════════════════════════════

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
              <Badge color="blue">{details.stock || 0} {details.product_type === 'weight' ? 'g' : 'uds'}</Badge>
            </Item>
            {details.barcode && details.barcode !== '' && (
              <Item label="Código de Barras" value={details.barcode} />
            )}
            {details.product_type && (
              <Item label="Tipo" value={details.product_type === 'weight' ? 'Por peso (kg/g)' : 'Por unidad'} />
            )}
          </Card>
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
            {(details.reason || log.reason) && <ReasonCard note={details.reason || log.reason} />}
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
              <Badge color="blue">{details.stock} {details.product_type === 'weight' ? 'g' : 'uds'}</Badge>
            </Item>
            {details.product_type && (
              <Item label="Tipo" value={details.product_type === 'weight' ? 'Por peso (kg/g)' : 'Por unidad'} />
            )}
          </Card>
          {(details.reason || log.reason) && <ReasonCard note={details.reason || log.reason} />}
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
              <span className="text-[#dc2626] font-bold">{details.stock || 0} {details.product_type === 'weight' ? 'g' : 'unidades'}</span>
            </Item>
          </Card>
          {(details.reason || log.reason) && <ReasonCard note={details.reason || log.reason} />}
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
        </div>
      );

    // ══════════════════════════════════════
    //  SOCIOS
    // ══════════════════════════════════════

    case 'Nuevo Socio':
    case 'Edición de Puntos':
    case 'Edición de Socio':
    case 'Baja de Socio': {
      const isNew = action === 'Nuevo Socio';
      const isDelete = action === 'Baja de Socio';
      const pointsData = details.pointsChange || (action === 'Edición de Puntos' ? details : null);
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
                  <span className="text-[#dc2626] font-bold">{details.points} pts</span>
               </Item>
            )}
            {isDelete && details.salesCount !== undefined && (
               <Item label="Compras Históricas" value={`${details.salesCount} operaciones`} />
            )}

            {isNew && details.initialPoints !== undefined && (
              <Item label="Puntos Iniciales">
                <span className="text-[#059669] font-bold">{details.initialPoints || 0} pts</span>
              </Item>
            )}
          </Card>

          {pointsData && pointsData.previous !== undefined && (
            <Card icon="🏆" title="Movimiento de Puntos">
              <div className="flex items-center gap-[6px] px-[11px] py-[9px] bg-[#f4f6f9] rounded-[9px] border border-[#eaecf1]">
                <div className="flex-1 text-center">
                  <div className="text-[9px] text-[#64748b] font-bold uppercase">Anterior</div>
                  <div className="text-[14px] font-mono text-[#64748b]">{pointsData.previous} pts</div>
                </div>
                <div className="flex flex-col items-center text-[#cbd5e1]">
                  <ArrowRight size={16} />
                  <span className={`text-[10px] font-bold mt-[2px] ${pointsData.diff > 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
                    {pointsData.diff > 0 ? '+' : ''}{pointsData.diff}
                  </span>
                </div>
                <div className="flex-1 text-center">
                  <div className="text-[9px] text-[#a21caf] font-bold uppercase">Actual</div>
                  <div className="text-[14px] font-mono text-[#1e293b] font-bold">{pointsData.new} pts</div>
                </div>
              </div>
            </Card>
          )}

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

          {isDelete && <WarnCard>⚠ El registro del socio fue eliminado permanentemente del sistema.</WarnCard>}
        </div>
      );
    }

    // ══════════════════════════════════════
    //  PREMIOS
    // ══════════════════════════════════════

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
                <Badge color="violet">{details.pointsCost} pts</Badge>
              </Item>
            )}
            <Item label="Tipo" value={rewardType} />
            {details.stock !== undefined && (
              <Item label="Stock Límite" value={`${details.stock} disponibles`} />
            )}
          </Card>
          {isDelete && <WarnCard>⚠ El premio fue retirado permanentemente del catálogo.</WarnCard>}
        </div>
      );
    }

    // ══════════════════════════════════════
    //  CATEGORÍAS
    // ══════════════════════════════════════

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
        </div>
      );
    }

    // ══════════════════════════════════════
    //  SISTEMA
    // ══════════════════════════════════════

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
        </div>
      );
    }

    case 'Horario Modificado':
      return (
        <div className="space-y-4">
          <Card icon="🕐" title="Configuración de Sistema">
            <Item label="Nuevo Horario de Cierre" value={typeof details === 'string' ? details : (details.time || 'Actualizado')} />
          </Card>
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

    case 'Borrado Permanente':
      return (
        <div className="space-y-4">
          <Card icon="🗑️" title="Registro Eliminado">
            <Item label="Elemento" value={typeof details === 'string' ? details : `ID: ${getTransactionId(details) || 'N/A'}`} />
          </Card>
          <WarnCard>⚠ Este registro fue eliminado permanentemente.</WarnCard>
        </div>
      );

    // ══════════════════════════════════════
    //  DEFAULT
    // ══════════════════════════════════════

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
        </div>
      );
    }
  }
}