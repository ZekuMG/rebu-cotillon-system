import React from 'react';
import { ArrowRight, CheckCircle } from 'lucide-react';
import { formatPrice } from '../../utils/helpers';

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
    'Apertura de Caja': '💰', 'Cierre de Caja': '🔒', 'Cierre Automático': '⏰',
    'Edición Producto': '✏️', 'Alta de Producto': '📦', 'Baja Producto': '🗑️',
    'Producto Duplicado': '📋',
    'Categoría': '🏷️', 'Edición Masiva Categorías': '🏷️', 'Actualización Masiva': '🏷️',
    'Nuevo Socio': '👤', 'Edición de Socio': '👤', 'Edición de Puntos': '🏆', 'Baja de Socio': '👤',
    'Nuevo Gasto': '📉', 'Gasto': '📉',
    'Nuevo Premio': '🎁', 'Editar Premio': '🎁', 'Eliminar Premio': '🎁',
    'Login': '🔑', 'Horario Modificado': '🕐', 'Sistema Iniciado': '⚡',
    'Borrado Permanente': '🗑️', 'Modificación Pedido': '📝'
  };
  return icons[action] || '📄';
};

export const getDetailColor = (action) => {
  const colors = {
    'Venta Realizada': 'green', 'Venta Anulada': 'red',
    'Apertura de Caja': 'green', 'Cierre de Caja': 'slate', 'Cierre Automático': 'amber',
    'Edición Producto': 'blue', 'Alta de Producto': 'green', 'Baja Producto': 'red',
    'Producto Duplicado': 'blue',
    'Categoría': 'amber', 'Edición Masiva Categorías': 'fuchsia', 'Actualización Masiva': 'fuchsia',
    'Nuevo Socio': 'green', 'Edición de Socio': 'blue', 'Edición de Puntos': 'purple', 'Baja de Socio': 'red',
    'Nuevo Gasto': 'red', 'Gasto': 'red',
    'Nuevo Premio': 'violet', 'Editar Premio': 'violet', 'Eliminar Premio': 'red',
    'Login': 'indigo', 'Horario Modificado': 'amber', 'Sistema Iniciado': 'slate',
    'Borrado Permanente': 'red', 'Modificación Pedido': 'blue'
  };
  return colors[action] || 'slate';
};

export const ACTION_GROUPS = [
  { label: '💰 Caja', actions: ['Apertura de Caja', 'Cierre de Caja', 'Cierre Automático'] },
  { label: '🛒 Ventas', actions: ['Venta Realizada', 'Venta Anulada', 'Modificación Pedido'] },
  { label: '📉 Gastos', actions: ['Nuevo Gasto'] },
  { label: '📦 Productos', actions: ['Alta de Producto', 'Edición Producto', 'Baja Producto', 'Producto Duplicado'] },
  { label: '👤 Socios', actions: ['Nuevo Socio', 'Edición de Socio', 'Edición de Puntos', 'Baja de Socio'] },
  { label: '🎁 Premios', actions: ['Nuevo Premio', 'Editar Premio', 'Eliminar Premio'] },
  { label: '🏷️ Categorías', actions: ['Categoría', 'Actualización Masiva', 'Edición Masiva Categorías'] },
  { label: '⚙️ Sistema', actions: ['Login', 'Horario Modificado', 'Sistema Iniciado', 'Borrado Permanente'] }
];

// ════════════════════════════════════════════
//  SUB-COMPONENTES REUTILIZABLES (CSS EXACTO)
// ════════════════════════════════════════════

const Card = ({ icon, title, children }) => (
  <div className="bg-white border border-[#d4d9e3] rounded-[14px] p-3.5 mb-2.5 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
    <div className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400 mb-2.5 flex items-center gap-1.5">
      {icon} {title}
    </div>
    {children}
  </div>
);

const Item = ({ label, value, children, className = '' }) => (
  <div className={`flex justify-between items-center px-2.5 py-1.5 bg-[#f4f6f9] rounded-[9px] mb-1 last:mb-0 text-[11px] border border-[#eaecf1] ${className}`}>
    <span className="text-slate-500 font-medium">{label}</span>
    <span className="font-bold text-slate-800 text-right">{children || value}</span>
  </div>
);

const ProductItem = ({ qty, name, total, isWeight }) => (
  <div className="flex justify-between items-center px-2.5 py-1.5 bg-[#f4f6f9] rounded-[9px] mb-1 last:mb-0 text-[11px] border border-[#eaecf1]">
    <span className="text-slate-500 font-medium flex items-center truncate flex-1 mr-2">
      <span className="font-mono text-[9px] font-bold bg-[#e0e4eb] text-slate-500 px-1.5 py-0.5 rounded mr-1.5 whitespace-nowrap">
        {isWeight ? `${qty}g` : `${qty}x`}
      </span>
      <span className="truncate">{name}</span>
    </span>
    <span className="font-bold text-slate-800 whitespace-nowrap">{total}</span>
  </div>
);

const ChangeRow = ({ field, oldVal, newVal }) => (
  <div className="flex items-center gap-2 px-2.5 py-1.5 bg-[#f4f6f9] rounded-[9px] mb-1 last:mb-0 text-[11px] border border-[#eaecf1]">
    <span className="font-bold text-slate-800 min-w-[70px]">{field}</span>
    <span className="text-red-500 line-through text-[10px]">{oldVal}</span>
    <span className="text-slate-400 text-[10px]">→</span>
    <span className="text-green-600 font-bold">{newVal}</span>
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
  <div className="bg-[#fffbeb] border border-[#fde68a] rounded-[14px] p-3.5 mb-2.5">
    <div className="text-[9px] font-extrabold uppercase tracking-wider text-amber-600 mb-2 flex items-center gap-1.5">
      💬 Motivo / Nota
    </div>
    <p className="text-[11px] text-amber-800 italic">"{note}"</p>
  </div>
);

const WarnCard = ({ children }) => (
  <div className="bg-[#fef2f2] border border-[#fecaca] rounded-[14px] p-3 mb-2.5 text-[11px] text-red-800 text-center font-semibold">
    {children}
  </div>
);

const HighlightCard = ({ label, value, sub }) => (
  <div className="bg-slate-800 rounded-[14px] p-4 mb-2.5 text-white">
    <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{label}</div>
    <div className="text-[26px] font-extrabold font-mono mt-0.5 leading-none">{value}</div>
    {sub && <div className="text-[10px] text-slate-500 mt-1">{sub}</div>}
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
      <Card icon="📄" title="Información">
        <Item label="Detalle" value={details} />
      </Card>
    );
  }

  switch (action) {

    // ══════════════════════════════════════
    //  CAJA
    // ══════════════════════════════════════

    case 'Apertura de Caja':
      return (
        <div className="space-y-0">
          <Card icon="💰" title="Información de Apertura">
            <Item label="Monto Inicial">
              <span className="text-[#059669] text-[14px] font-bold">${formatPrice(details.amount)}</span>
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
        <div className="space-y-0">
          {action === 'Cierre Automático' && (
            <div className="bg-[#fff7ed] border border-[#ffedd5] rounded-[14px] p-3 mb-[10px] text-[11px] text-[#c2410c] font-bold flex items-center gap-2">
              ⚠ Cierre automático ejecutado por el sistema
            </div>
          )}
          <Card icon="💰" title="Balance del Día">
            <Item label="Caja Inicial" value={`$${formatPrice(details.openingBalance || 0)}`} />
            <Item label="Ventas del Día">
              <span className="text-[#059669] font-bold">+${formatPrice(details.totalSales || 0)}</span>
            </Item>
            {details.totalExpenses !== undefined && (
              <Item label="Gastos">
                <span className="text-[#dc2626] font-bold">-${formatPrice(details.totalExpenses || 0)}</span>
              </Item>
            )}
          </Card>
          <HighlightCard
            label="Total al Cierre (Neto)"
            value={`$${formatPrice(details.finalBalance || details.netProfit || details.totalSales || 0)}`}
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
        <div className="space-y-0">
          <Card icon="🛒" title="Productos">
            {items.map((item, idx) => {
              const q = item.quantity || item.qty || 0;
              const isWeight = item.product_type === 'weight' || item.isWeight || (q >= 20 && item.price < 50);
              
              return (
                <ProductItem
                  key={idx}
                  qty={q}
                  name={item.title || item.name || 'Producto'}
                  total={`$${formatPrice((item.price || 0) * q)}`}
                  isWeight={isWeight}
                />
              );
            })}
          </Card>

          <Card icon="💳" title="Pago">
            <Item label="Método de pago" value={details.payment || 'Efectivo'} />
            
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
        <div className="space-y-0">
          <Card icon="📦" title="Productos Devueltos al Stock">
            {items.map((item, idx) => (
              <div key={idx} className="flex justify-between items-center px-[11px] py-[9px] bg-[#dcfce7] rounded-[9px] mb-[5px] last:mb-0 text-[11px] border border-[#bbf7d0]">
                <span className="text-[#15803d] font-medium">
                  <span className="font-mono text-[9px] font-bold bg-[#16a34a] text-white px-1.5 py-[2px] rounded-[4px] mr-[6px]">
                    +{item.quantity || item.qty}
                  </span>
                  {item.title || item.name || 'Producto'}
                </span>
                <span className="text-[#15803d] font-bold text-[10px] uppercase">Restaurado</span>
              </div>
            ))}
          </Card>
          <div className="bg-[#fffbeb] border border-[#fde68a] rounded-[14px] p-[14px] mb-[10px] text-[11px] text-[#b45309] font-medium">
            ⚠ <strong>Nota:</strong> El stock fue restaurado automáticamente.
          </div>
          {(details.reason || log.reason) && <ReasonCard note={details.reason || log.reason} />}
        </div>
      );
    }

    case 'Modificación Pedido': {
      const changes = details.changes || {};
      const productChanges = details.productChanges || [];
      const itemsSnapshot = details.itemsSnapshot || [];

      return (
        <div className="space-y-0">
          {Object.keys(changes).length > 0 && (
            <Card icon="💰" title="Cambios Financieros">
              {Object.entries(changes).map(([key, val]) => (
                <ChangeRow
                  key={key}
                  field={key === 'total' ? 'Monto Total' : key === 'payment' ? 'Método de Pago' : key}
                  oldVal={key === 'total' ? `$${formatPrice(val.old)}` : val.old}
                  newVal={key === 'total' ? `$${formatPrice(val.new)}` : val.new}
                />
              ))}
            </Card>
          )}
          {productChanges.filter(c => c.diff !== 0).length > 0 && (
            <Card icon="📦" title="Cambios en Productos">
              {productChanges.filter(c => c.diff !== 0).map((change, idx) => (
                <div key={idx} className="flex justify-between items-center px-[11px] py-[9px] bg-[#f4f6f9] rounded-[9px] mb-[5px] last:mb-0 text-[11px] border border-[#eaecf1]">
                  <span className="font-bold text-[#1e293b]">{change.title}</span>
                  <div className="flex items-center gap-[6px]">
                    <span className="text-[#dc2626] line-through text-[10px]">{change.oldQty}x</span>
                    <span className="text-[#94a3b8] text-[10px]">→</span>
                    <span className="text-[#16a34a] font-bold">
                      {change.newQty === 0 ? 'Eliminado' : `${change.newQty}x`}
                    </span>
                    <span className={`px-2 py-[2px] rounded-[4px] text-[9px] font-bold ${
                      change.diff > 0 ? 'bg-[#dcfce7] text-[#15803d]' : 'bg-[#fee2e2] text-[#dc2626]'
                    }`}>
                      {change.diff > 0 ? `+${change.diff}` : change.diff}
                    </span>
                  </div>
                </div>
              ))}
            </Card>
          )}
          {itemsSnapshot.length > 0 && (
            <Card icon="📋" title="Estado Final del Pedido">
              {itemsSnapshot.map((item, idx) => {
                 const q = item.qty || item.quantity || 0;
                 const isWeight = item.product_type === 'weight' || (q >= 20 && item.price < 50);
                 return (
                  <ProductItem
                    key={idx}
                    qty={q}
                    name={item.title || item.name}
                    total={`$${formatPrice((Number(item.price) || 0) * q)}`}
                    isWeight={isWeight}
                  />
                );
              })}
            </Card>
          )}
        </div>
      );
    }

    // ══════════════════════════════════════
    //  GASTOS
    // ══════════════════════════════════════

    case 'Nuevo Gasto':
    case 'Gasto':
      return (
        <div className="space-y-0">
          <Card icon="💸" title="Detalle del Gasto">
            <Item label="Monto">
              <span className="text-[#dc2626] text-[14px] font-bold">-${formatPrice(details.amount)}</span>
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
        <div className="space-y-0">
          <Card icon="📋" title="Datos del Producto">
            <Item label="Nombre" value={details.title || details.name || details.product || '-'} />
            {details.brand && details.brand !== '' && <Item label="Marca" value={details.brand} />}
            <Item label="Categoría">
              <Badge color="fuchsia">{details.category || 'Sin categoría'}</Badge>
            </Item>
            {details.purchasePrice !== undefined && details.purchasePrice !== null && (
              <Item label="Precio Costo" value={`$${formatPrice(details.purchasePrice)}`} />
            )}
            <Item label="Precio Venta">
              <span className="text-[#059669] font-bold">${formatPrice(details.price)}</span>
            </Item>
            <Item label="Stock Inicial">
              <Badge color="blue">{details.stock || 0} {details.product_type === 'weight' ? 'gramos' : 'unidades'}</Badge>
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
          <div className="space-y-0">
            <Card icon="📦" title="Producto Modificado">
              <Item label="Producto" value={productName} />
            </Card>
            <Card icon="🔄" title="Cambios Realizados">
              {Object.entries(details.changes).map(([key, val]) => (
                <ChangeRow
                  key={key}
                  field={fieldNames[key] || key}
                  oldVal={key.toLowerCase().includes('price') ? `$${formatPrice(val.old)}` : String(val.old)}
                  newVal={key.toLowerCase().includes('price') ? `$${formatPrice(val.new)}` : String(val.new)}
                />
              ))}
            </Card>
            {(details.reason || log.reason) && <ReasonCard note={details.reason || log.reason} />}
          </div>
        );
      }

      return (
        <div className="space-y-0">
          <Card icon="📦" title="Estado Actual del Producto">
            <Item label="Producto" value={productName} />
            <Item label="Categoría">
              <Badge color="fuchsia">{details.category || '-'}</Badge>
            </Item>
            <Item label="Precio">
              <span className="text-[#059669] font-bold">${formatPrice(details.price)}</span>
            </Item>
            <Item label="Stock">
              <Badge color="blue">{details.stock} {details.product_type === 'weight' ? 'g' : 'uds'}</Badge>
            </Item>
            {details.product_type && (
              <Item label="Tipo" value={details.product_type === 'weight' ? 'Por peso (kg)' : 'Por unidad'} />
            )}
          </Card>
          {(details.reason || log.reason) && <ReasonCard note={details.reason || log.reason} />}
        </div>
      );
    }

    case 'Baja Producto':
      return (
        <div className="space-y-0">
          <Card icon="📋" title="Producto Eliminado">
            <Item label="Nombre" value={details.title || details.name || details.product || '-'} />
            {details.brand && details.brand !== '' && details.brand !== 'Generico' && (
              <Item label="Marca" value={details.brand} />
            )}
            <Item label="Categoría" value={details.category || '-'} />
            {details.price !== undefined && (
              <Item label="Precio al momento de baja" value={`$${formatPrice(details.price)}`} />
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
        <div className="space-y-0">
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
              <Item label="Precio Costo" value={`$${formatPrice(details.purchasePrice)}`} />
            )}
            {details.price !== undefined && (
              <Item label="Precio Venta">
                <span className="text-[#059669] font-bold">${formatPrice(details.price)}</span>
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
        <div className="space-y-0">
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
            
            {/* Info específica de Baja */}
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
              <div className="flex items-center gap-[6px] px-[11px] py-[9px] bg-[#f4f6f9] rounded-[9px] mb-[5px] border border-[#eaecf1]">
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
        <div className="space-y-0">
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
        <div className="space-y-0">
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
                  
                  // Soporta arrays de strings antiguos o arrays de objetos nuevos
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
        <div className="space-y-0">
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
        <div className="space-y-0">
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
        <div className="space-y-0">
          <Card icon="🕐" title="Configuración de Sistema">
            <Item label="Nuevo Horario de Cierre" value={typeof details === 'string' ? details : (details.time || 'Actualizado')} />
          </Card>
        </div>
      );

    case 'Sistema Iniciado':
      return (
        <div className="space-y-0">
          <Card icon="⚡" title="Estado del Sistema">
            <Item label="Estado" value="Sistema inicializado correctamente" />
          </Card>
        </div>
      );

    case 'Borrado Permanente':
      return (
        <div className="space-y-0">
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
        <Card icon="📄" title="Datos del Registro">
          <div className="bg-[#1e293b] rounded-[9px] p-3 overflow-x-auto">
            <pre className="text-[10px] text-[#4ade80] font-mono whitespace-pre-wrap">
              {JSON.stringify(details, null, 2)}
            </pre>
          </div>
        </Card>
      );
    }
  }
}