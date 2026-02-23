// src/components/modals/HistoryModals.jsx
// ♻️ REFACTOR: Modal de detalle con búsqueda de Puntos Totales en tiempo real

import React from 'react';
import {
  Edit2, XCircle, X, FileText, Calendar, User,
  CreditCard, ShoppingCart, Trash2, UserCheck, ArrowRight 
} from 'lucide-react';

// ==========================================
// MODAL: DETALLE DE TRANSACCIÓN
// ==========================================

export const TransactionDetailModal = ({
  transaction,
  onClose,
  currentUser,
  members = [], // 👈 Recibimos la lista de socios
  onEditTransaction,
  onDeleteTransaction,
  onViewTicket,
}) => {
  if (!transaction) return null;

  const isVoided = transaction.status === 'voided';

  // Lógica para parsear al Cliente/Socio
  let clientName = null;
  let memberNum = null;

  if (transaction.client && typeof transaction.client === 'object') {
    clientName = transaction.client.name;
    memberNum = transaction.client.memberNumber || transaction.client.number;
  } else if (transaction.client && typeof transaction.client === 'string') {
    clientName = transaction.client;
    memberNum = transaction.memberNumber;
  } else if (transaction.memberName) {
    clientName = transaction.memberName;
    memberNum = transaction.memberNumber;
  }
  if (clientName === 'No asociado' || clientName === 'Consumidor Final') {
    clientName = null;
  }

  // 👇 LÓGICA NUEVA: Buscar el total real actualizado en la lista de socios
  let currentTotal = null;
  if (memberNum && memberNum !== '---') {
    const socio = members.find(m => 
      String(m.memberNumber) === String(memberNum) || String(m.number) === String(memberNum)
    );
    if (socio && socio.points !== undefined) {
      currentTotal = socio.points;
    }
  }

  // Rescatar puntos (soporte para transacciones activas e históricas)
  const ptsEarned = transaction.pointsEarned || transaction.client?.pointsEarned || 0;
  const ptsSpent = transaction.pointsSpent || transaction.client?.pointsSpent || 0;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
      <div className="bg-[#f8fafc] rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
        
        {/* HEADER */}
        <div className={`p-4 border-b flex justify-between items-center ${isVoided ? 'bg-red-50 border-red-100' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center gap-3">
            <h4 className={`font-black text-lg tracking-tight ${isVoided ? 'text-red-700' : 'text-slate-800'}`}>
              Venta #{String(transaction.id).padStart(6, '0')}
            </h4>
            {isVoided && (
              <span className="bg-red-200 text-red-800 text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-widest border border-red-300">
                Anulada
              </span>
            )}
            {transaction.isHistoric && !isVoided && (
              <span className="bg-slate-200 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider border border-slate-300">
                Histórica
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors bg-white hover:bg-slate-100 rounded-full p-1.5 shadow-sm border border-slate-200">
            <X size={18} />
          </button>
        </div>

        {/* BODY */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          
          {/* BLOQUE SUPERIOR */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center">
              <p className="text-slate-400 text-[9px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5"><Calendar size={12}/> Fecha</p>
              <p className="font-bold text-slate-700 text-xs">{transaction.date}</p>
              <p className="text-slate-400 font-medium text-[10px] mt-0.5">{transaction.timestamp || transaction.time || '--:--'} hs</p>
            </div>
            
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center items-start">
              <p className="text-slate-400 text-[9px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5"><User size={12}/> Cajero</p>
              <span className="inline-flex items-center justify-center bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md text-slate-700 text-[10px] font-bold mt-0.5">
                {transaction.user}
              </span>
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-center">
              <p className="text-slate-400 text-[9px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5"><CreditCard size={12}/> Pago</p>
              <span className="font-bold text-slate-700 text-xs truncate">{transaction.payment}</span>
              {transaction.payment === 'Credito' && transaction.installments > 0 && (
                <span className="text-blue-600 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded text-[9px] font-bold mt-1 w-max">
                  {transaction.installments} Cuotas
                </span>
              )}
            </div>
          </div>

          {/* TARJETA SOCIO */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex flex-col">
            <p className="text-slate-400 text-[9px] font-bold uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <UserCheck size={12}/> Cliente / Socio
            </p>
            
            {clientName ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-sm shadow-inner ${isVoided ? 'bg-red-100 text-red-500' : 'bg-indigo-100 text-indigo-600'}`}>
                    {clientName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex flex-col">
                    <span className={`font-bold text-sm truncate max-w-[160px] ${isVoided ? 'line-through text-red-800' : 'text-slate-800'}`} title={clientName}>
                      {clientName}
                    </span>
                    {memberNum && memberNum !== '---' && (
                      <span className="font-mono text-[10px] font-bold text-indigo-500">
                        N° #{String(memberNum).padStart(4, '0')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Flujo de Puntos */}
                {(ptsEarned > 0 || ptsSpent > 0 || currentTotal !== null) && (
                  <div className={`flex items-center bg-slate-50 border border-slate-100 rounded-lg p-2 ${isVoided ? 'opacity-50 grayscale' : ''}`}>
                    <div className="flex flex-col items-end pr-2 border-r border-slate-200">
                      <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">En esta venta</span>
                      {ptsEarned > 0 && <span className="text-[11px] font-black text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded">+{ptsEarned} pts</span>}
                      {ptsSpent > 0 && <span className="text-[11px] font-black text-rose-600 bg-rose-100 px-1.5 py-0.5 rounded">-{ptsSpent} pts</span>}
                      {ptsEarned === 0 && ptsSpent === 0 && <span className="text-[11px] font-bold text-slate-400">0 pts</span>}
                    </div>
                    <div className="px-2 text-slate-300">
                      <ArrowRight size={14} />
                    </div>
                    <div className="flex flex-col items-start pl-1 min-w-[50px]">
                      <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Total Actual</span>
                      <span className="text-[12px] font-black text-indigo-600">
                        {currentTotal !== null ? `${currentTotal} pts` : '--'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2.5 text-slate-400 bg-slate-50 p-2 rounded-lg border border-slate-100">
                <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm">
                  <User size={14} className="text-slate-400"/>
                </div>
                <span className="text-xs font-medium italic">Venta a consumidor final (no asociado)</span>
              </div>
            )}
          </div>

          {/* Lista de Productos */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex justify-between items-center">
              <p className="text-slate-600 text-[10px] font-black uppercase tracking-wider flex items-center gap-2">
                <ShoppingCart size={14}/> Detalles del Pedido
              </p>
              <span className="text-[10px] font-bold text-slate-500 bg-white px-2.5 py-0.5 rounded-md border border-slate-200 shadow-sm">
                {(transaction.items || []).length} ítems
              </span>
            </div>
            
            <div className="divide-y divide-slate-100 max-h-[200px] overflow-y-auto custom-scrollbar">
              {(transaction.items || []).map((item, idx) => {
                const qty = item.qty || item.quantity || 0;
                const isWeight = item.product_type === 'weight' || item.isWeight || (qty >= 20 && item.price < 50);

                return (
                  <div key={idx} className={`p-3.5 flex justify-between items-center transition-colors hover:bg-slate-50 ${isVoided ? 'opacity-50' : ''}`}>
                    <div className="flex-1 pr-4">
                      <p className={`font-bold text-xs mb-1 ${isVoided ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                        {item.title}
                      </p>
                      <p className="text-[10px] text-slate-400 font-medium flex items-center gap-1.5">
                        <span className="font-bold text-slate-600 bg-white border border-slate-200 shadow-sm px-1.5 py-0.5 rounded">
                          {qty}{isWeight ? 'g' : ' u.'}
                        </span>
                        x ${Number(item.price)?.toLocaleString()} c/u
                      </p>
                    </div>
                    <p className={`font-black text-sm ${isVoided ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                      ${(qty * item.price).toLocaleString()}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className={`p-4 border-t flex justify-between items-center ${isVoided ? 'bg-red-50 border-red-100' : 'bg-blue-50/50 border-blue-100'}`}>
              <span className={`text-xs font-black uppercase tracking-widest ${isVoided ? 'text-red-700' : 'text-blue-800'}`}>
                Total Final
              </span>
              <span className={`text-2xl font-black tracking-tight ${isVoided ? 'text-red-700 line-through' : 'text-blue-600'}`}>
                ${(Number(transaction.total) || 0).toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* FOOTER ACCIONES */}
        <div className="p-4 border-t bg-white flex flex-wrap gap-2 justify-end items-center">
          <button onClick={() => onViewTicket(transaction)} className="px-4 py-2.5 text-[11px] font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-800 rounded-lg transition-all flex items-center gap-1.5 shadow-sm">
            <FileText size={14} /> Ver Ticket
          </button>
          {currentUser?.role === 'admin' && (
            <>
              {!isVoided && !transaction.isHistoric && (
                <>
                  <button onClick={() => { onClose(); onEditTransaction(transaction); }} className="px-4 py-2.5 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-lg transition-all flex items-center gap-1.5 shadow-sm">
                    <Edit2 size={14} /> Editar
                  </button>
                  <button onClick={() => { onClose(); onDeleteTransaction(transaction); }} className="px-4 py-2.5 text-[11px] font-bold text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 rounded-lg transition-all flex items-center gap-1.5 shadow-sm">
                    <XCircle size={14} /> Anular Venta
                  </button>
                </>
              )}
              {isVoided && (
                <button onClick={() => { onClose(); onDeleteTransaction(transaction); }} className="px-4 py-2.5 text-[11px] font-bold text-slate-600 bg-slate-100 border border-slate-300 hover:bg-red-50 hover:text-red-700 hover:border-red-200 rounded-lg transition-all flex items-center gap-1.5 shadow-sm">
                  <Trash2 size={14} /> Eliminar Registro
                </button>
              )}
            </>
          )}
          <div className="flex-1"></div>
          <button onClick={onClose} className="px-6 py-2.5 text-[11px] font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-lg transition-all shadow-md">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};