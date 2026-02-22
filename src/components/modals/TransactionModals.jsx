import React, { useEffect, useRef } from 'react';
import {
  X,
  Search,
  Trash2,
  AlertTriangle,
  FileText,
  Barcode,
  Package,
  ShoppingCart,
  AlertCircle
} from 'lucide-react';
import { PAYMENT_METHODS } from '../../data';
import { formatPrice } from '../../utils/helpers';

export const EditTransactionModal = ({
  transaction, onClose, inventory, setEditingTransaction,
  transactionSearch, setTransactionSearch,
  editReason, setEditReason, onSave
}) => {
  const searchInputRef = useRef(null);

  // Auto-focus en el buscador para que la pistola láser funcione directo
  useEffect(() => {
    if (transaction) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [transaction]);

  // Lector de Código de Barras Global para el Modal
  useEffect(() => {
    let buffer = '';
    let lastTime = 0;

    const handleKeyDown = (e) => {
      if (!transaction) return;
      
      if (e.key === 'Enter' && buffer.length > 3) {
        e.preventDefault();
        const scanned = buffer;
        buffer = '';
        const product = inventory.find(p => String(p.barcode) === scanned);
        if (product) handleAddLocalItem(product);
      } else if (e.key.length === 1) {
        const now = Date.now();
        if (now - lastTime > 50) buffer = ''; 
        buffer += e.key;
        lastTime = now;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [transaction, inventory]);

  if (!transaction) return null;

  // ── LÓGICA LOCAL DEL MODAL (Evita errores del padre) ──
  const recalculateTotal = (items, payment) => {
    const subtotal = items.reduce((acc, i) => acc + (Number(i.price || 0) * Number(i.qty || 0)), 0);
    return payment === 'Credito' ? subtotal * 1.1 : subtotal;
  };

  const handleAddLocalItem = (product) => {
    const newItems = [...transaction.items];
    const existingIdx = newItems.findIndex(i => (i.id || i.productId) === product.id);
    
    if (existingIdx >= 0) {
      newItems[existingIdx].qty = Number(newItems[existingIdx].qty) + 1;
    } else {
      newItems.push({
        id: product.id,
        productId: product.id,
        title: product.title,
        price: Number(product.price) || 0,
        qty: 1,
        product_type: product.product_type || 'quantity'
      });
    }
    setEditingTransaction({ ...transaction, items: newItems, total: recalculateTotal(newItems, transaction.payment) });
    setTransactionSearch('');
  };

  const handleUpdateItem = (index, field, value) => {
    const newItems = [...transaction.items];
    const numValue = value === '' ? '' : Number(value);
    newItems[index] = { ...newItems[index], [field]: numValue };
    setEditingTransaction({ ...transaction, items: newItems, total: recalculateTotal(newItems, transaction.payment) });
  };

  const handleRemoveLocalItem = (index) => {
    const newItems = transaction.items.filter((_, i) => i !== index);
    setEditingTransaction({ ...transaction, items: newItems, total: recalculateTotal(newItems, transaction.payment) });
  };

  const handlePaymentChangeLocal = (payment) => {
    setEditingTransaction({ ...transaction, payment, installments: payment === 'Credito' ? 1 : 0, total: recalculateTotal(transaction.items, payment) });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[200] p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-[16px] shadow-2xl w-full max-w-2xl flex flex-col max-h-[95vh] border border-slate-200">
        
        {/* HEADER */}
        <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50/50 rounded-t-[16px]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shadow-sm">
              <ShoppingCart size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">Modificar Venta #{transaction.id}</h3>
              <p className="text-xs text-slate-500">Agrega, quita o edita precios y cantidades</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 bg-white border border-slate-200 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar bg-[#f8fafc]">
          
          {/* Buscador */}
          <div className="mb-4 relative">
            <div className="flex items-center border border-slate-200 rounded-xl px-3 bg-white shadow-sm focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all">
              <Search size={16} className="text-slate-400" />
              <input 
                ref={searchInputRef}
                type="text" 
                placeholder="Buscar por nombre o escanear código de barras..." 
                className="w-full p-2.5 bg-transparent text-sm outline-none text-slate-700" 
                value={transactionSearch} 
                onChange={(e) => setTransactionSearch(e.target.value)} 
              />
              <Barcode size={18} className="text-slate-300" />
            </div>
            
            {transactionSearch && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 shadow-xl rounded-xl max-h-48 overflow-y-auto z-20 p-1 animate-in fade-in slide-in-from-top-2">
                {inventory.filter((p) => p.title.toLowerCase().includes(transactionSearch.toLowerCase())).map((p) => (
                  <button key={p.id} onClick={() => handleAddLocalItem(p)} className="w-full text-left p-2.5 hover:bg-blue-50 text-sm flex justify-between items-center rounded-lg transition-colors group">
                    <span className="font-medium text-slate-700 group-hover:text-blue-700 flex items-center gap-2">
                      <Package size={14} className="text-slate-400" /> {p.title}
                    </span>
                    <span className="font-bold text-slate-800">${formatPrice(p.price)}</span>
                  </button>
                ))}
                {inventory.filter((p) => p.title.toLowerCase().includes(transactionSearch.toLowerCase())).length === 0 && (
                   <div className="p-3 text-center text-sm text-slate-500">No se encontraron productos.</div>
                )}
              </div>
            )}
          </div>

          {/* Lista de Productos Modificables */}
          <div className="space-y-2">
            {transaction.items.map((item, index) => {
              const isWeight = item.product_type === 'weight' || item.isWeight || (item.qty > 20 && item.price < 50);
              const rowTotal = (Number(item.price) || 0) * (Number(item.qty) || 0);

              return (
                <div key={`item-${index}`} className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm transition-all hover:border-blue-300">
                  
                  {/* Nombre */}
                  <div className="flex-1 min-w-[120px]">
                    <p className="text-xs font-bold text-slate-800 truncate" title={item.title}>{item.title}</p>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{isWeight ? 'Venta por Peso' : 'Unidades'}</span>
                  </div>

                  {/* Precio Unitario */}
                  <div className="w-[90px]">
                    <label className="text-[9px] font-bold text-slate-400 uppercase mb-0.5 block">Precio Unit.</label>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">$</span>
                      <input 
                        type="number" 
                        className="w-full pl-5 pr-2 py-1.5 text-xs font-bold border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" 
                        value={item.price} 
                        onChange={(e) => handleUpdateItem(index, 'price', e.target.value)} 
                      />
                    </div>
                  </div>

                  {/* Cantidad */}
                  <div className="w-[90px]">
                    <label className="text-[9px] font-bold text-slate-400 uppercase mb-0.5 block">Cantidad</label>
                    <div className="relative">
                      <input 
                        type="number" 
                        min="1"
                        step={isWeight ? "10" : "1"}
                        className="w-full pr-6 pl-2 py-1.5 text-xs font-bold border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500" 
                        value={item.qty} 
                        onChange={(e) => handleUpdateItem(index, 'qty', e.target.value)} 
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[10px]">{isWeight ? 'g' : 'u'}</span>
                    </div>
                  </div>

                  {/* Total Fila */}
                  <div className="w-[70px] text-right">
                    <label className="text-[9px] font-bold text-slate-400 uppercase mb-0.5 block">Total</label>
                    <p className="text-sm font-black text-slate-800">${formatPrice(rowTotal)}</p>
                  </div>

                  {/* Eliminar */}
                  <button type="button" onClick={() => handleRemoveLocalItem(index)} className="w-8 h-8 flex items-center justify-center bg-red-50 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-colors mt-3">
                    <Trash2 size={14} />
                  </button>

                </div>
              );
            })}
            {transaction.items.length === 0 && (
               <div className="p-6 text-center border-2 border-dashed border-slate-300 rounded-xl bg-slate-50">
                 <p className="text-sm font-bold text-slate-500">La venta está vacía</p>
               </div>
            )}
          </div>
        </div>

        {/* FOOTER (Opciones de Pago y Guardado) */}
        <form onSubmit={onSave} className="p-5 border-t border-slate-200 bg-white rounded-b-[16px]">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Método de Pago</label>
              <select className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500" value={transaction.payment} onChange={(e) => handlePaymentChangeLocal(e.target.value)}>
                {PAYMENT_METHODS.map((m) => (<option key={m.id} value={m.id}>{m.label}</option>))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Total a Cobrar</label>
              <div className="w-full px-3 py-1.5 border border-green-200 rounded-lg bg-green-50 text-green-700 text-lg font-black text-right">
                ${formatPrice(transaction.total)}
              </div>
            </div>
          </div>
          
          {transaction.payment === 'Credito' && (
            <div className="flex items-center justify-between bg-blue-50 p-3 rounded-xl border border-blue-100 mb-4">
              <span className="text-xs font-bold text-blue-800 flex items-center gap-1"><AlertTriangle size={14}/> 10% recargo aplicado</span>
              <select className="text-xs p-1.5 font-bold rounded-lg border border-blue-200 bg-white text-blue-800 outline-none focus:ring-2 focus:ring-blue-500" value={transaction.installments || 1} onChange={(e) => setEditingTransaction({ ...transaction, installments: Number(e.target.value) })}>
                <option value={1}>1 pago</option><option value={3}>3 cuotas</option><option value={6}>6 cuotas</option><option value={12}>12 cuotas</option>
              </select>
            </div>
          )}

          <div className="mb-4">
            <label className="text-[10px] font-bold text-amber-600 uppercase tracking-wide block mb-1 flex items-center gap-1"><FileText size={12} /> Motivo / Nota de la modificación (Opcional)</label>
            <textarea className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm bg-amber-50 focus:ring-2 focus:ring-amber-500 outline-none text-amber-900" rows="2" placeholder="Ej: Me equivoqué en el precio, el cliente sumó un producto..." value={editReason} onChange={(e) => setEditReason(e.target.value)}></textarea>
          </div>

          <button type="submit" disabled={transaction.items.length === 0} className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-md disabled:bg-slate-300 disabled:cursor-not-allowed">
            Guardar y Aplicar Cambios
          </button>
        </form>
      </div>
    </div>
  );
};

export const RefundModal = ({ transaction, onClose, refundReason, setRefundReason, onConfirm }) => {
  if (!transaction) return null;
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="p-4 bg-red-50 border-b border-red-100 flex justify-between items-center">
          <h3 className="font-bold text-red-800 flex items-center gap-2"><AlertTriangle size={18} /> {transaction.status === 'voided' ? 'Eliminar Registro' : 'Anular Venta'}</h3>
          <button onClick={onClose}><X size={18} className="text-red-400 hover:text-red-600" /></button>
        </div>
        <form onSubmit={onConfirm} className="p-5">
          <p className="text-sm text-slate-600 mb-4">{transaction.status === 'voided' ? 'Esta acción borrará definitivamente el registro del historial. No se puede deshacer.' : `Se marcará la venta #${transaction.id} como anulada y se devolverá el stock al inventario.`}</p>
          <div className="mb-4">
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Motivo (Opcional)</label>
            <textarea className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-red-500 outline-none resize-none" rows="3" placeholder="Ej: Cliente devolvió los productos..." value={refundReason} onChange={(e) => setRefundReason(e.target.value)} autoFocus></textarea>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-lg">Cancelar</button>
            <button type="submit" className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg">{transaction.status === 'voided' ? 'Borrar Definitivamente' : 'Confirmar Anulación'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};