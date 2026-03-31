// src/components/dashboard/ExpirationAlert.jsx
import React from 'react';
import { CalendarX, AlertTriangle, Info } from 'lucide-react';

export const ExpirationAlert = ({ expiringProducts = [] }) => {
  return (
    <div className="bg-white p-5 rounded-xl shadow-sm border border-orange-100 h-full min-h-0 flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <CalendarX size={18} className="text-orange-500" />
          Control de Vencimientos
        </h3>
        <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2 py-0.5 rounded-full">
          {expiringProducts.length} alertas
        </span>
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto pr-1">
        {expiringProducts.length > 0 ? (
          <div className="space-y-2">
            {expiringProducts.map((product) => {
              const isExpired = product.daysUntil <= 0;
              
              return (
                <div 
                  key={product.id} 
                  className={`flex justify-between items-center p-3 rounded-lg border ${
                    isExpired ? 'bg-red-50 border-red-100' : 'bg-orange-50 border-orange-100'
                  }`}
                >
                  <div className="flex-1 min-w-0 pr-3">
                    <p className={`font-bold text-sm truncate ${isExpired ? 'text-red-800' : 'text-orange-800'}`}>
                      {product.title}
                    </p>
                    <p className={`text-xs flex items-center gap-1 ${isExpired ? 'text-red-600' : 'text-orange-600'}`}>
                      <AlertTriangle size={12} />
                      {isExpired ? '¡VENCIDO!' : `Vence en ${product.daysUntil} días`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] uppercase font-bold text-slate-400">Fecha</p>
                    <p className={`font-bold text-sm ${isExpired ? 'text-red-700' : 'text-orange-700'}`}>
                      {new Date(product.expiration_date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full opacity-60">
            <Info size={32} className="text-slate-300 mb-2" />
            <p className="text-sm font-medium text-slate-500 text-center">Todo en orden</p>
            <p className="text-xs text-slate-400 text-center">No hay vencimientos próximos (14 días).</p>
          </div>
        )}
      </div>
    </div>
  );
};
