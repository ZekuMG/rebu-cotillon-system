import React from 'react';
import {
  ArrowRight,
  Package,
  List,
  DollarSign,
  Trash2,
  XCircle,
  Tag,
  ShoppingCart,
  Edit,
  PlusCircle,
  MinusCircle,
  Clock,
  Power,
  AlertTriangle,
  CheckCircle,
  UserPlus,
  UserMinus,
  UserCog,
  Trophy,
  CreditCard,
  Hash,
  TrendingDown,
  User,
  FileText,
  LogIn,
  Gift
} from 'lucide-react';
import { formatPrice } from '../../utils/helpers';

// Helper local para obtener IDs de transacciones
const getTransactionId = (details) => {
  if (!details || typeof details === 'string') return null;
  const id = details.transactionId || details.id;
  if (!id) return null;
  if (typeof id === 'string' && id.includes('TRX-')) {
    return id.replace('TRX-', '');
  }
  return id;
};

// Helper para obtener el título del modal según la acción
export const getDetailTitle = (action) => {
    const titles = {
      'Venta Realizada': 'Detalle de Transacción',
      'Venta Anulada': 'Anulación de Venta',
      'Apertura de Caja': 'Reporte de Apertura',
      'Cierre de Caja': 'Reporte de Cierre',
      'Cierre Automático': 'Reporte Automático',
      'Edición Producto': 'Modificación de Inventario',
      'Modificación Pedido': 'Ajuste de Pedido',
      'Alta de Producto': 'Ingreso de Producto',
      'Baja Producto': 'Egreso de Producto',
      'Categoría': 'Gestión de Categorías',
      'Horario Modificado': 'Cambio de Horario',
      'Sistema Iniciado': 'Información del Sistema',
      'Borrado Permanente': 'Registro Eliminado',
      'Edición Masiva Categorías': 'Reporte de Cambios Masivos',
      'Nuevo Socio': 'Ficha de Nuevo Socio',
      'Edición de Puntos': 'Movimiento de Puntos',
      'Edición de Socio': 'Actualización de Perfil',
      'Baja de Socio': 'Eliminación de Registro',
      'Nuevo Gasto': 'Comprobante de Gasto',
      'Gasto': 'Comprobante de Gasto',
      'Nuevo Premio': 'Alta de Premio',
      'Editar Premio': 'Edición de Premio',
      'Eliminar Premio': 'Baja de Premio',
      'Login': 'Inicio de Sesión'
    };
    return titles[action] || 'Detalles del Registro';
};

// Componente Principal
export default function LogDetailRenderer({ log }) {
    const action = log.action;
    const details = log.details;

    if (!details)
      return <p className="text-slate-400 italic">Sin detalles registrados.</p>;
    if (typeof details === 'string') {
      return (
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
          <p className="text-sm text-slate-700 font-medium">{details}</p>
        </div>
      );
    }

    switch (action) {
      // --- NUEVO: COMPROBANTE DE GASTO ---
      case 'Nuevo Gasto':
      case 'Gasto':
        return (
            <div className="space-y-4">
                {/* Cabecera Roja */}
                <div className="bg-red-50 p-4 rounded-xl border border-red-100 shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center text-white shadow-md">
                            <TrendingDown size={24} />
                        </div>
                        <div>
                            <p className="text-xs font-bold text-red-400 uppercase tracking-wide">Monto del Gasto</p>
                            <h3 className="text-3xl font-bold text-red-600">-${formatPrice(details.amount)}</h3>
                        </div>
                    </div>
                </div>

                {/* Descripción */}
                {details.description && (
                    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Descripción</p>
                        <p className="text-sm font-medium text-slate-700">{details.description}</p>
                    </div>
                )}

                {/* Info Grid */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Categoría</p>
                        <div className="flex items-center gap-2">
                            <Tag size={14} className="text-slate-500" />
                            <span className="text-sm font-bold text-slate-700">{details.category || 'Sin categoría'}</span>
                        </div>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Método de Pago</p>
                        <div className="flex items-center gap-2">
                            <CreditCard size={14} className="text-slate-500" />
                            <span className="text-sm font-bold text-slate-700">
                                {details.paymentMethod || 'No especificado'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Nota Extra */}
                {(details.note || log.reason) && (
                    <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 text-amber-800 text-sm italic">
                         <span className="font-bold not-italic text-xs block text-amber-600 mb-1 uppercase">Nota Adjunta:</span>
                        "{details.note || log.reason}"
                    </div>
                )}
            </div>
        );

      // --- DETALLES DE SOCIOS (UNIFICADO) ---
      case 'Nuevo Socio':
      case 'Edición de Puntos':
      case 'Edición de Socio':
      case 'Baja de Socio':
        const isNew = action === 'Nuevo Socio';
        const isDelete = action === 'Baja de Socio';
        
        const pointsData = details.pointsChange || (action === 'Edición de Puntos' ? details : null);
        
        const memberName = details.name || details.member || 'Socio Desconocido';
        const memberNumber = details.number ? String(details.number).padStart(4, '0') : '????';

        return (
          <div className="space-y-4">
            {/* CABECERA UNIFICADA DE SOCIO */}
            <div className={`rounded-xl border border-slate-200 overflow-hidden ${isDelete ? 'bg-red-50' : 'bg-white'}`}>
                <div className="p-4 flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center text-white shadow-sm shrink-0
                        ${isNew ? 'bg-green-500' : isDelete ? 'bg-red-500' : pointsData ? 'bg-purple-500' : 'bg-blue-500'}`}>
                        {isNew ? <UserPlus size={24} /> : isDelete ? <UserMinus size={24} /> : pointsData && !details.changes ? <Trophy size={24} /> : <UserCog size={24} />}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <span className={`text-[10px] font-bold uppercase tracking-wide
                                ${isNew ? 'text-green-600' : isDelete ? 'text-red-600' : pointsData ? 'text-purple-600' : 'text-blue-600'}`}>
                                {isNew ? 'Alta de Cliente' : isDelete ? 'Cliente Eliminado' : (pointsData && details.changes) ? 'Edición Completa' : pointsData ? 'Ajuste de Puntos' : 'Datos Actualizados'}
                            </span>
                        </div>
                        <h4 className={`text-lg font-bold truncate ${isDelete ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
                            {memberName}
                        </h4>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded text-[11px] font-mono">
                                <Hash size={10} /> {memberNumber}
                            </span>
                            {details.dni && (
                                <span className="inline-flex items-center gap-1 text-slate-400 text-[11px]">
                                    DNI: {details.dni}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* VISUALIZACIÓN DE CAMBIOS */}
                <div className="border-t border-slate-100 bg-slate-50/50 p-4 space-y-4">
                    
                    {/* BLOQUE: CAMBIO DE PUNTOS */}
                    {pointsData && (
                        <div className="flex items-center justify-between gap-4">
                           <div className="flex-1 bg-white border border-slate-200 rounded-lg p-3 text-center shadow-sm">
                               <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Anterior</p>
                               <p className="text-xl font-mono text-slate-500">{pointsData.previous} pts</p>
                           </div>
                           <div className="flex flex-col items-center justify-center text-slate-300">
                               <ArrowRight size={20} />
                               <span className={`text-[10px] font-bold mt-1 ${pointsData.diff > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                   {pointsData.diff > 0 ? '+' : ''}{pointsData.diff}
                               </span>
                           </div>
                           <div className="flex-1 bg-white border border-slate-200 rounded-lg p-3 text-center shadow-sm ring-1 ring-purple-100">
                               <p className="text-[10px] text-purple-600 font-bold uppercase mb-1">Actual</p>
                               <p className="text-xl font-mono text-slate-800 font-bold">{pointsData.new} pts</p>
                           </div>
                        </div>
                    )}

                    {/* BLOQUE: EDICIÓN DE DATOS */}
                    {(details.changes || (isNew && details.initialPoints)) && (
                        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
                             <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 flex justify-between items-center">
                                 <span className="text-[11px] font-bold text-slate-500 uppercase flex items-center gap-1">
                                    <List size={12}/> {isNew ? 'Datos Iniciales' : 'Modificaciones Realizadas'}
                                 </span>
                             </div>

                             {details.changes && Array.isArray(details.changes) ? (
                                 <table className="w-full text-xs">
                                     <thead className="bg-slate-50 text-slate-400 font-medium">
                                          <tr>
                                              <th className="px-4 py-2 text-left font-bold w-1/3">Campo</th>
                                              <th className="px-4 py-2 text-center text-red-400">Antes</th>
                                              <th className="px-2 py-2 w-8"></th>
                                              <th className="px-4 py-2 text-center text-green-600">Ahora</th>
                                          </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                          {details.changes.map((change, idx) => (
                                              <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                                  <td className="px-4 py-2.5 font-bold text-slate-700 capitalize">{change.field}</td>
                                                  <td className="px-4 py-2.5 text-center text-red-400 line-through decoration-red-200 decoration-2 bg-red-50/30">
                                                      {change.old || <span className="text-slate-300 italic">-</span>}
                                                  </td>
                                                  <td className="px-2 py-2.5 text-center text-slate-300">
                                                      <ArrowRight size={12} />
                                                  </td>
                                                  <td className="px-4 py-2.5 text-center text-slate-800 font-bold bg-green-50/30">
                                                      {change.new || <span className="text-slate-300 italic">-</span>}
                                                  </td>
                                              </tr>
                                          ))}
                                      </tbody>
                                 </table>
                             ) : (
                                 <div className="p-4">
                                     {isNew ? (
                                         <div className="grid grid-cols-2 gap-4">
                                             <div>
                                                 <p className="text-[10px] text-slate-400 uppercase">Email</p>
                                                 <p className="text-sm font-medium">{details.email || '-'}</p>
                                             </div>
                                             <div>
                                                 <p className="text-[10px] text-slate-400 uppercase">Puntos Iniciales</p>
                                                 <p className="text-sm font-bold text-green-600">{details.initialPoints || 0}</p>
                                             </div>
                                          </div>
                                     ) : (
                                         <ul className="space-y-2">
                                             {(details.updates || []).map((field, idx) => (
                                                 <li key={idx} className="flex items-center gap-2 text-xs text-slate-600">
                                                     <CheckCircle size={14} className="text-blue-500"/>
                                                     Se actualizó el campo <span className="font-bold capitalize text-slate-800">{field}</span>
                                                 </li>
                                             ))}
                                             {(!details.updates || details.updates.length === 0) && (
                                                 <p className="text-xs text-slate-400 italic text-center">Sin detalles específicos registrados.</p>
                                             )}
                                         </ul>
                                     )}
                                 </div>
                             )}
                        </div>
                    )}
                    
                    {isDelete && (
                        <div className="bg-red-100 text-red-800 p-3 rounded-lg text-xs text-center font-medium border border-red-200">
                            ⚠ El registro del socio fue eliminado permanentemente del sistema.
                        </div>
                    )}
                </div>
            </div>
          </div>
        );

      case 'Venta Realizada': {
        const txId = getTransactionId(details);
        const items = details.items || [];
        const total = details.total || 0;
        const payment = details.payment || 'N/A';

        return (
          <div className="space-y-3">
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="bg-green-50 px-4 py-3 flex justify-between items-center border-b border-green-100">
                <span className="font-bold text-green-800 text-sm flex items-center gap-2">
                  <ShoppingCart size={16} /> Venta #{txId}
                </span>
                <span className="bg-green-600 text-white px-3 py-1 rounded-full text-sm font-bold shadow-sm">
                  ${formatPrice(total)}
                </span>
              </div>
              <div className="p-4 bg-white">
                <div className="flex items-center gap-6 mb-4 pb-3 border-b border-slate-100">
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                      Método de Pago
                    </p>
                    <p className="text-sm font-bold text-slate-700 flex items-center gap-1">
                      <CreditCard size={14} className="text-slate-400"/> {payment}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                      Productos
                    </p>
                    <p className="text-sm font-bold text-slate-700">
                      {items.length} items
                    </p>
                  </div>
                </div>
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">
                  Detalle de productos
                </p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {items.map((item, idx) => (
                    <div
                      key={idx}
                      className="text-xs flex justify-between items-center text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100"
                    >
                      <span className="flex items-center gap-2">
                        <span className="bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded text-[10px] font-bold">
                          {item.qty || item.quantity}x
                        </span>
                        <span className="font-medium">{item.title || item.name || 'Producto'}</span>
                      </span>
                      <span className="font-bold text-slate-800">
                        ${formatPrice((item.price || 0) * (item.qty || item.quantity || 0))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      }

      case 'Venta Anulada': {
        const txId = getTransactionId(details);
        const itemsToShow = details.itemsReturned || details.items || [];
        const total = details.originalTotal || details.total || 0;

        return (
          <div className="space-y-3">
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="bg-red-50 px-4 py-3 flex justify-between items-center border-b border-red-100">
                <span className="font-bold text-red-800 text-sm flex items-center gap-2">
                  <XCircle size={16} /> Venta Anulada #{txId}
                </span>
                <span className="bg-red-100 px-3 py-1 rounded-full text-sm font-bold text-red-700 line-through shadow-sm">
                  ${formatPrice(total)}
                </span>
              </div>
              <div className="p-4 bg-white">
                <p className="text-[10px] font-bold text-green-600 uppercase mb-2 flex items-center gap-1">
                  <Package size={12} /> Productos devueltos al stock
                </p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {itemsToShow.map((item, idx) => (
                    <div
                      key={idx}
                      className="text-xs flex justify-between items-center text-slate-600 bg-green-50 p-2.5 rounded-lg border border-green-100"
                    >
                      <span className="flex items-center gap-2">
                        <span className="bg-green-500 text-white px-2 py-0.5 rounded text-[10px] font-bold">
                          +{item.qty || item.quantity}
                        </span>
                        <span className="font-medium">{item.title || item.name || 'Producto'}</span>
                      </span>
                      <span className="text-green-600 font-bold text-[10px] uppercase tracking-wide">
                        Restaurado
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 text-xs text-amber-700 flex items-center gap-2">
              <AlertTriangle size={14} className="shrink-0" />
              <span><span className="font-bold">Nota:</span> El stock fue restaurado automáticamente.</span>
            </div>
          </div>
        );
      }

      case 'Modificación Pedido': {
        const txId = getTransactionId(details);
        const changes = details.changes || {};
        const productChanges = details.productChanges || [];
        const itemsSnapshot = details.itemsSnapshot || [];

        return (
          <div className="space-y-4">
            <div className="bg-blue-50 p-3 rounded-xl border border-blue-200 flex items-center justify-between shadow-sm">
              <span className="text-xs font-bold text-blue-700 uppercase tracking-wide">
                Pedido Modificado
              </span>
              <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-bold shadow-sm">
                #{txId}
              </span>
            </div>

            {Object.keys(changes).length > 0 && (
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="bg-amber-50 px-4 py-2.5 text-[10px] font-bold text-amber-700 uppercase border-b border-amber-100">
                  Cambios Financieros
                </div>
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-slate-100">
                    {Object.entries(changes).map(([key, val]) => (
                      <tr key={key}>
                        <td className="px-4 py-3 font-bold text-slate-600 capitalize w-1/3">
                          {key === 'total'
                            ? 'Monto Total'
                            : key === 'payment'
                            ? 'Método de Pago'
                            : key}
                        </td>
                        <td className="px-4 py-3 text-red-500 line-through text-center bg-red-50/50">
                          {key === 'total'
                            ? `$${formatPrice(val.old)}`
                            : val.old}
                        </td>
                        <td className="px-2 py-3 text-center w-8 text-slate-300">
                          →
                        </td>
                        <td className="px-4 py-3 text-green-600 font-bold text-center bg-green-50/50">
                          {key === 'total'
                            ? `$${formatPrice(val.new)}`
                            : val.new}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {productChanges.filter((c) => c.diff !== 0).length > 0 && (
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="bg-purple-50 px-4 py-2.5 text-[10px] font-bold text-purple-700 uppercase border-b border-purple-100 flex items-center gap-1">
                  <Package size={12} /> Cambios en Productos
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100">
                      <th className="px-4 py-2 text-left">Producto</th>
                      <th className="px-2 py-2 text-center w-16">Antes</th>
                      <th className="px-1 py-2 text-center w-6"></th>
                      <th className="px-2 py-2 text-center w-16">Después</th>
                      <th className="px-2 py-2 text-center w-16">Cambio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {productChanges
                      .filter((c) => c.diff !== 0)
                      .map((change, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-2.5 font-bold text-slate-700">
                            {change.title}
                          </td>
                          <td className="px-2 py-2.5 text-center text-red-500 bg-red-50/30">
                            {change.oldQty === 0 ? (
                              <span className="text-slate-400 italic text-[10px]">
                                —
                              </span>
                            ) : (
                              <span className="line-through">
                                {change.oldQty}x
                              </span>
                            )}
                          </td>
                          <td className="px-1 py-2.5 text-center text-slate-300">
                            <ArrowRight size={12} />
                          </td>
                          <td className="px-2 py-2.5 text-center text-green-600 bg-green-50/30 font-bold">
                            {change.newQty === 0 ? (
                              <span className="text-red-500 text-[10px]">
                                Eliminado
                              </span>
                            ) : (
                              `${change.newQty}x`
                            )}
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                change.diff > 0
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-red-100 text-red-700'
                              }`}
                            >
                              {change.diff > 0
                                ? `+${change.diff}`
                                : change.diff}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

            {itemsSnapshot.length > 0 && (
              <div className="border border-slate-200 rounded-xl bg-slate-50 p-4 shadow-sm">
                <p className="text-[10px] font-bold text-slate-500 uppercase mb-2 flex items-center gap-1">
                  <List size={12} /> Estado Final del Pedido
                </p>
                <div className="space-y-1.5">
                  {itemsSnapshot.map((item, idx) => (
                    <div
                      key={idx}
                      className="text-xs flex justify-between bg-white p-2.5 border border-slate-200 rounded-lg shadow-sm"
                    >
                      <span className="font-bold text-slate-700">
                        {item.qty}x {item.title || item.name}
                      </span>
                      <span className="text-slate-500 font-mono">
                        ${formatPrice(
                          (Number(item.price) || 0) * (Number(item.qty) || 0)
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      }

      case 'Edición Producto': {
        const changes = details.changes || {};
        const productName = details.product || details.title || details.name || 'Producto';

        return (
          <div className="space-y-3">
            <div className="bg-blue-50 p-3 rounded-xl border border-blue-200 flex items-center gap-3 shadow-sm">
              <div className="bg-blue-200 p-1.5 rounded-full text-blue-700"><Package size={16} /></div>
              <span className="font-bold text-blue-800 text-sm">
                {productName}
              </span>
            </div>
            {Object.keys(changes).length > 0 ? (
              <table className="w-full text-xs border-collapse border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                    <th className="px-4 py-2 text-left w-1/3">Campo</th>
                    <th className="px-4 py-2 text-center">Antes</th>
                    <th className="px-2 py-2 text-center w-8"></th>
                    <th className="px-4 py-2 text-center">Después</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Object.entries(changes).map(([key, val]) => (
                    <tr key={key}>
                      <td className="px-4 py-3 font-bold capitalize text-slate-700">
                        {key === 'title'
                          ? 'Nombre'
                          : key === 'purchasePrice'
                          ? 'Costo'
                          : key === 'price'
                          ? 'Precio'
                          : key === 'stock'
                          ? 'Stock'
                          : key === 'category'
                          ? 'Categoría'
                          : key}
                      </td>
                      <td className="px-4 py-3 text-center text-red-500 bg-red-50/50 line-through decoration-red-200">
                        {key.toLowerCase().includes('price')
                          ? `$${formatPrice(val.old)}`
                          : val.old}
                      </td>
                      <td className="px-2 py-3 text-center text-slate-300">
                        <ArrowRight size={14} />
                      </td>
                      <td className="px-4 py-3 text-center text-green-600 bg-green-50/50 font-bold">
                        {key.toLowerCase().includes('price')
                          ? `$${formatPrice(val.new)}`
                          : val.new}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center p-4 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                 <p className="text-slate-400 italic text-sm">Sin cambios detallados registrados.</p>
              </div>
            )}
          </div>
        );
      }

      case 'Cierre de Caja':
      case 'Cierre Automático': {
        return (
          <div className="space-y-3">
            {action === 'Cierre Automático' && (
              <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-600" />
                <span className="text-xs font-bold text-amber-700">
                  Cierre automático por el sistema
                </span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">
                  Caja Inicial
                </p>
                <p className="text-lg font-bold text-slate-700">
                  ${formatPrice(details.openingBalance)}
                </p>
              </div>
              <div className="bg-green-50 p-3 rounded-xl border border-green-200 shadow-sm">
                <p className="text-[10px] font-bold text-green-600 uppercase mb-1">
                  Ventas del Día
                </p>
                <p className="text-lg font-bold text-green-700">
                  +${formatPrice(details.totalSales)}
                </p>
              </div>
            </div>
            <div className="bg-slate-800 p-5 rounded-xl text-white shadow-lg">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Total al Cierre
                  </p>
                  <p className="text-3xl font-bold mt-1">
                    ${formatPrice(details.finalBalance)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">
                    Hora
                  </p>
                  <p className="text-xl font-mono text-white">
                    {details.closingTime || '-'}
                  </p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-blue-50 p-3 rounded-xl border border-blue-200 flex items-center justify-between shadow-sm">
                <span className="text-xs font-bold text-blue-700 uppercase">
                  Operaciones
                </span>
                <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-bold shadow-sm">
                  {details.salesCount || 0}
                </span>
              </div>
              {details.scheduledClosingTime && (
                <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 flex items-center justify-between shadow-sm">
                  <span className="text-xs font-bold text-amber-700 uppercase">
                    Programado
                  </span>
                  <span className="bg-amber-600 text-white px-3 py-1 rounded-full text-sm font-bold shadow-sm">
                    {details.scheduledClosingTime}
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      }

      case 'Apertura de Caja': {
        return (
          <div className="space-y-3">
            <div className="bg-green-50 p-5 rounded-xl border border-green-200 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center text-white shadow-sm">
                  <DollarSign size={24} />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-green-600 uppercase tracking-wider">
                    Monto Inicial en Caja
                  </p>
                  <p className="text-3xl font-bold text-green-800">
                    ${formatPrice(details.amount)}
                  </p>
                </div>
              </div>
            </div>
            {details.scheduledClosingTime && (
              <div className="bg-blue-50 p-3 rounded-xl border border-blue-200 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-blue-600" />
                  <span className="text-xs font-bold text-blue-700 uppercase">
                    Cierre Programado
                  </span>
                </div>
                <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-bold shadow-sm">
                  {details.scheduledClosingTime}
                </span>
              </div>
            )}
          </div>
        );
      }

      case 'Categoría': {
        const isCreate = details.type === 'create';
        const isDelete = details.type === 'delete';
        const isEdit = details.type === 'edit';

        return (
          <div className="space-y-3">
            <div
              className={`p-5 rounded-xl border flex items-center gap-4 shadow-sm ${
                isCreate
                  ? 'bg-green-50 border-green-200'
                  : isDelete
                  ? 'bg-red-50 border-red-200'
                  : 'bg-blue-50 border-blue-200'
              }`}
            >
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center text-white shadow-sm ${
                  isCreate
                    ? 'bg-green-500'
                    : isDelete
                    ? 'bg-red-500'
                    : 'bg-blue-500'
                }`}
              >
                <Tag size={24} />
              </div>
              <div className="flex-1">
                <p
                  className={`text-[10px] font-bold uppercase tracking-wide ${
                    isCreate
                      ? 'text-green-600'
                      : isDelete
                      ? 'text-red-600'
                      : 'text-blue-600'
                  }`}
                >
                  {isCreate
                    ? 'Categoría Creada'
                    : isDelete
                    ? 'Categoría Eliminada'
                    : 'Categoría Renombrada'}
                </p>
                {isEdit && details.oldName ? (
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-lg text-red-400 line-through decoration-2">
                      {details.oldName}
                    </span>
                    <ArrowRight size={20} className="text-slate-400" />
                    <span className="text-xl font-bold text-slate-800">
                      {details.name}
                    </span>
                  </div>
                ) : (
                  <p className="text-xl font-bold text-slate-800 mt-1">
                    {details.name}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      }

      case 'Alta de Producto': {
        return (
          <div className="space-y-3">
            <div className="bg-green-50 p-3 rounded-xl border border-green-200 flex items-center gap-3 shadow-sm">
              <div className="bg-green-200 p-1.5 rounded-full text-green-700"><Package size={16} /></div>
              <span className="font-bold text-green-800 text-sm">
                Nuevo Producto Registrado
              </span>
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-xs">
                <tbody className="divide-y divide-slate-100">
                  <tr className="bg-slate-50">
                    <td className="px-4 py-3 font-bold text-slate-500 w-1/3 uppercase text-[10px]">
                      Nombre
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-800 text-sm">
                      {details.title || details.name || '-'}
                    </td>
                  </tr>
                  {details.brand && (
                    <tr>
                      <td className="px-4 py-3 font-bold text-slate-500 uppercase text-[10px]">
                        Marca
                      </td>
                      <td className="px-4 py-3 text-slate-700 font-medium">
                        {details.brand}
                      </td>
                    </tr>
                  )}
                  <tr className="bg-slate-50">
                    <td className="px-4 py-3 font-bold text-slate-500 uppercase text-[10px]">
                      Categoría
                    </td>
                    <td className="px-4 py-3">
                      <span className="bg-fuchsia-100 text-fuchsia-700 px-2 py-0.5 rounded-md text-[10px] font-bold border border-fuchsia-200">
                        {details.category || 'Sin categoría'}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-bold text-slate-500 uppercase text-[10px]">
                      Precio Costo
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-mono">
                      ${formatPrice(details.purchasePrice)}
                    </td>
                  </tr>
                  <tr className="bg-slate-50">
                    <td className="px-4 py-3 font-bold text-slate-500 uppercase text-[10px]">
                      Precio Venta
                    </td>
                    <td className="px-4 py-3 font-bold text-green-600 font-mono text-sm">
                      ${formatPrice(details.price)}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-bold text-slate-500 uppercase text-[10px]">
                      Stock Inicial
                    </td>
                    <td className="px-4 py-3">
                      <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md font-bold text-xs border border-blue-200">
                        {details.stock || 0} unidades
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      }

      case 'Baja Producto': {
        return (
          <div className="space-y-3">
            <div className="bg-red-50 p-3 rounded-xl border border-red-200 flex items-center gap-3 shadow-sm">
              <div className="bg-red-200 p-1.5 rounded-full text-red-700"><Trash2 size={16} /></div>
              <span className="font-bold text-red-800 text-sm">
                Producto Eliminado
              </span>
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-xs">
                <tbody className="divide-y divide-slate-100">
                  <tr className="bg-slate-50">
                    <td className="px-4 py-3 font-bold text-slate-500 w-1/3 uppercase text-[10px]">
                      Nombre
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-800 text-sm">
                      {details.title || details.name || '-'}
                    </td>
                  </tr>
                  {details.brand && (
                    <tr>
                      <td className="px-4 py-3 font-bold text-slate-500 uppercase text-[10px]">
                        Marca
                      </td>
                      <td className="px-4 py-3 text-slate-700 font-medium">
                        {details.brand}
                      </td>
                    </tr>
                  )}
                  <tr className="bg-slate-50">
                    <td className="px-4 py-3 font-bold text-slate-500 uppercase text-[10px]">
                      Categoría
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-medium">
                      {details.category || '-'}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-bold text-slate-500 uppercase text-[10px]">
                      Precio
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-mono">
                      ${formatPrice(details.price)}
                    </td>
                  </tr>
                  <tr className="bg-red-50">
                    <td className="px-4 py-3 font-bold text-red-500 uppercase text-[10px]">
                      Stock al eliminar
                    </td>
                    <td className="px-4 py-3 font-bold text-red-600 text-sm">
                      {details.stock || 0} unidades
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      }

      // --- PREMIOS (VIOLETA) ---
      case 'Nuevo Premio': {
        const rewardType = details.type === 'discount' ? 'Descuento' : details.type === 'product' ? 'Producto' : details.type || 'General';
        return (
          <div className="space-y-3">
            <div className="bg-violet-50 p-4 rounded-xl border border-violet-200 flex items-center gap-4 shadow-sm">
              <div className="w-12 h-12 bg-violet-500 rounded-full flex items-center justify-center text-white shadow-sm">
                <Gift size={24} />
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-bold text-violet-600 uppercase tracking-wide">Nuevo Premio Registrado</p>
                <p className="text-lg font-bold text-slate-800 mt-0.5">{details.title}</p>
              </div>
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-xs">
                <tbody className="divide-y divide-slate-100">
                  {details.description && (
                    <tr className="bg-slate-50">
                      <td className="px-4 py-3 font-bold text-slate-500 w-1/3 uppercase text-[10px]">Descripción</td>
                      <td className="px-4 py-3 text-slate-700 font-medium">{details.description}</td>
                    </tr>
                  )}
                  <tr>
                    <td className="px-4 py-3 font-bold text-slate-500 uppercase text-[10px]">Costo en Puntos</td>
                    <td className="px-4 py-3">
                      <span className="bg-violet-100 text-violet-700 px-2 py-0.5 rounded-md font-bold text-xs border border-violet-200">
                        {details.pointsCost || 0} pts
                      </span>
                    </td>
                  </tr>
                  <tr className="bg-slate-50">
                    <td className="px-4 py-3 font-bold text-slate-500 uppercase text-[10px]">Tipo</td>
                    <td className="px-4 py-3 font-medium text-slate-700">{rewardType}</td>
                  </tr>
                  {details.stock !== undefined && (
                    <tr>
                      <td className="px-4 py-3 font-bold text-slate-500 uppercase text-[10px]">Stock</td>
                      <td className="px-4 py-3">
                        <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md font-bold text-xs border border-blue-200">
                          {details.stock} unidades
                        </span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      }

      case 'Editar Premio': {
        const editRewardType = details.type === 'discount' ? 'Descuento' : details.type === 'product' ? 'Producto' : details.type || 'General';
        return (
          <div className="space-y-3">
            <div className="bg-violet-50 p-4 rounded-xl border border-violet-200 flex items-center gap-4 shadow-sm">
              <div className="w-12 h-12 bg-violet-500 rounded-full flex items-center justify-center text-white shadow-sm">
                <Edit size={24} />
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-bold text-violet-600 uppercase tracking-wide">Premio Modificado</p>
                <p className="text-lg font-bold text-slate-800 mt-0.5">{details.title}</p>
              </div>
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-xs">
                <tbody className="divide-y divide-slate-100">
                  {details.pointsCost !== undefined && (
                    <tr>
                      <td className="px-4 py-3 font-bold text-slate-500 w-1/3 uppercase text-[10px]">Costo en Puntos</td>
                      <td className="px-4 py-3">
                        <span className="bg-violet-100 text-violet-700 px-2 py-0.5 rounded-md font-bold text-xs border border-violet-200">
                          {details.pointsCost} pts
                        </span>
                      </td>
                    </tr>
                  )}
                  <tr className="bg-slate-50">
                    <td className="px-4 py-3 font-bold text-slate-500 uppercase text-[10px]">Tipo</td>
                    <td className="px-4 py-3 font-medium text-slate-700">{editRewardType}</td>
                  </tr>
                  {details.stock !== undefined && (
                    <tr>
                      <td className="px-4 py-3 font-bold text-slate-500 uppercase text-[10px]">Stock</td>
                      <td className="px-4 py-3">
                        <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md font-bold text-xs border border-blue-200">
                          {details.stock} unidades
                        </span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      }

      case 'Eliminar Premio': {
        return (
          <div className="space-y-3">
            <div className="bg-red-50 p-4 rounded-xl border border-red-200 flex items-center gap-4 shadow-sm">
              <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center text-white shadow-sm">
                <Gift size={24} />
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-bold text-red-600 uppercase tracking-wide">Premio Eliminado del Catálogo</p>
                <p className="text-lg font-bold text-slate-500 mt-0.5 line-through">{details.title || `ID: ${details.id}`}</p>
              </div>
            </div>
            <div className="bg-red-100 text-red-800 p-3 rounded-lg text-xs text-center font-medium border border-red-200">
              ⚠ El premio fue eliminado permanentemente del catálogo de recompensas.
            </div>
          </div>
        );
      }

      // --- LOGIN ---
      case 'Login': {
        const roleName = details.name || details.role;
        const isAdmin = details.role === 'admin';
        return (
          <div className="space-y-3">
            <div className="bg-indigo-50 p-5 rounded-xl border border-indigo-200 flex items-center gap-4 shadow-sm">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white shadow-sm ${isAdmin ? 'bg-indigo-600' : 'bg-emerald-500'}`}>
                <LogIn size={24} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wide">
                  Sesión Iniciada
                </p>
                <p className="text-lg font-bold text-slate-800">{roleName}</p>
              </div>
            </div>
            <div className={`p-3 rounded-xl border flex items-center justify-between shadow-sm ${isAdmin ? 'bg-indigo-50 border-indigo-200' : 'bg-emerald-50 border-emerald-200'}`}>
              <span className={`text-xs font-bold uppercase ${isAdmin ? 'text-indigo-700' : 'text-emerald-700'}`}>
                Nivel de Acceso
              </span>
              <span className={`px-3 py-1 rounded-full text-sm font-bold text-white shadow-sm ${isAdmin ? 'bg-indigo-600' : 'bg-emerald-500'}`}>
                {isAdmin ? 'Administrador' : 'Vendedor'}
              </span>
            </div>
          </div>
        );
      }

      case 'Horario Modificado': {
        return (
          <div className="bg-amber-50 p-5 rounded-xl border border-amber-200 flex items-center gap-4 shadow-sm">
            <div className="w-12 h-12 bg-amber-500 rounded-full flex items-center justify-center text-white shadow-sm">
              <Clock size={24} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wide">
                Nuevo Horario Establecido
              </p>
              <p className="text-lg font-bold text-slate-800">
                {typeof details === 'string' ? details : 'Horario actualizado'}
              </p>
            </div>
          </div>
        );
      }

      case 'Sistema Iniciado': {
        return (
          <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 flex items-center gap-4 shadow-sm">
            <div className="w-12 h-12 bg-slate-600 rounded-full flex items-center justify-center text-white shadow-sm">
              <Power size={24} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                Estado del Sistema
              </p>
              <p className="text-lg font-bold text-slate-800">
                Sistema inicializado correctamente
              </p>
            </div>
          </div>
        );
      }

      case 'Borrado Permanente': {
        return (
          <div className="bg-red-50 p-5 rounded-xl border border-red-200 flex items-center gap-4 shadow-sm">
            <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center text-white shadow-sm">
              <Trash2 size={24} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-red-600 uppercase tracking-wide">
                Registro Eliminado
              </p>
              <p className="text-lg font-bold text-slate-800">
                {typeof details === 'string'
                  ? details
                  : `ID: ${getTransactionId(details) || 'N/A'}`}
              </p>
            </div>
          </div>
        );
      }

      case 'Edición Masiva Categorías': {
        const changeList = details.details || [];
        
        return (
          <div className="space-y-3">
            <div className="bg-fuchsia-50 p-5 rounded-xl border border-fuchsia-200 flex items-center gap-4 shadow-sm">
              <div className="w-12 h-12 bg-fuchsia-600 rounded-full flex items-center justify-center text-white shadow-sm">
                <Tag size={24} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-fuchsia-600 uppercase tracking-wide">
                  Actualización en Lote
                </p>
                <p className="text-lg font-bold text-slate-800">
                  {details.count} cambios aplicados
                </p>
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
               <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
                 <p className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                   <List size={14}/> Detalle de operaciones
                 </p>
               </div>
               <ul className="divide-y divide-slate-100 bg-white max-h-60 overflow-y-auto">
                 {changeList.map((item, idx) => {
                   const isAdd = item.includes('Agregado');
                   return (
                     <li key={idx} className="px-4 py-2.5 text-xs flex items-center gap-2">
                        <CheckCircle size={14} className={isAdd ? "text-green-500" : "text-red-500"} />
                        <span className="text-slate-700">{item}</span>
                     </li>
                   )
                 })}
               </ul>
            </div>
          </div>
        );
      }

      default: {
        // Intentar detectar por estructura antes de mostrar JSON
        if (details.items && details.total) {
          // Parece una venta
          const txId = getTransactionId(details);
          const items = details.items || [];
          return (
            <div className="space-y-3">
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="bg-green-50 px-4 py-3 flex justify-between items-center border-b border-green-100">
                  <span className="font-bold text-green-800 text-sm">
                    Venta #{txId}
                  </span>
                  <span className="bg-green-600 text-white px-3 py-1 rounded-full text-sm font-bold shadow-sm">
                    ${formatPrice(details.total)}
                  </span>
                </div>
                <div className="p-4 bg-white">
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {items.map((item, idx) => (
                      <div
                        key={idx}
                        className="text-xs flex justify-between items-center text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100"
                      >
                        <span className="font-medium">
                          {item.qty || item.quantity}x {item.title || item.name}
                        </span>
                        <span className="font-bold text-slate-800">
                          ${formatPrice(
                            (item.price || 0) * (item.qty || item.quantity || 0)
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        }

        if (details.changes || details.productChanges) {
          // Parece una modificación
          const txId = getTransactionId(details);
          return (
            <div className="space-y-4">
              <div className="bg-blue-50 p-3 rounded-xl border border-blue-200 flex items-center justify-between shadow-sm">
                <span className="text-xs font-bold text-blue-700 uppercase">
                  Pedido Modificado
                </span>
                <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-bold shadow-sm">
                  #{txId}
                </span>
              </div>
              {details.itemsSnapshot && details.itemsSnapshot.length > 0 && (
                <div className="border border-slate-200 rounded-xl bg-slate-50 p-4 shadow-sm">
                  <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">
                    Estado Final
                  </p>
                  <div className="space-y-1.5">
                    {details.itemsSnapshot.map((item, idx) => (
                      <div
                        key={idx}
                        className="text-xs flex justify-between bg-white p-2.5 border border-slate-200 rounded-lg shadow-sm"
                      >
                        <span className="font-medium">
                          {item.qty}x {item.title || item.name}
                        </span>
                        <span className="font-mono text-slate-600">
                          ${formatPrice(
                            (Number(item.price) || 0) * (Number(item.qty) || 0)
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        }

        // Último recurso: mostrar JSON
        return (
          <div className="bg-slate-900 rounded-xl p-4 overflow-x-auto border border-slate-700 shadow-inner">
            <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">
              {JSON.stringify(details, null, 2)}
            </pre>
          </div>
        );
      }
    }
}