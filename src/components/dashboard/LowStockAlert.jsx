// src/components/dashboard/LowStockAlert.jsx
import React, { useState } from 'react';
import { AlertTriangle, Package, CalendarX, Info } from 'lucide-react';
import { formatNumber } from '../../utils/helpers';

// ✨ NUEVO: Agregamos la prop onAlertClick
export const LowStockAlert = ({ lowStockProducts = [], expiringProducts = [], onAlertClick }) => {
  const outOfStockProducts = lowStockProducts.filter(p => p.stock <= 0);
  const hasAlerts = outOfStockProducts.length > 0 || expiringProducts.length > 0;
  
  const [activeTab, setActiveTab] = useState('stock');

  const visibleStock = outOfStockProducts.slice(0, 20);
  const visibleExpirations = expiringProducts.slice(0, 20);

  return (
    <div className="bg-white p-5 rounded-xl shadow-sm border border-red-100 h-full flex flex-col">
      
      {/* HEADER COMPACTO Y ALINEADO */}
      <div className="flex justify-between items-center mb-4 gap-2 shrink-0">
        
        <div className="flex items-center gap-3">
          <h3 className="font-bold text-slate-800 flex items-center gap-1.5 whitespace-nowrap text-sm">
            <AlertTriangle size={16} className={activeTab === 'stock' ? 'text-red-500' : 'text-orange-500'} />
            Alertas
          </h3>
          <div className="flex items-center gap-1.5">
            {expiringProducts.length > 0 && (
              // ✨ NUEVO: Convertido a botón clickeable
              <button 
                onClick={() => onAlertClick && onAlertClick('expirations')}
                className="bg-orange-100 text-orange-700 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider hover:bg-orange-200 transition-colors cursor-pointer"
              >
                {expiringProducts.length} Vencidos
              </button>
            )}
            {outOfStockProducts.length > 0 && (
               // ✨ NUEVO: Convertido a botón clickeable
              <button 
                onClick={() => onAlertClick && onAlertClick('out_of_stock')}
                className="bg-red-100 text-red-700 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider hover:bg-red-200 transition-colors cursor-pointer"
              >
                {outOfStockProducts.length} Agotados
              </button>
            )}
          </div>
        </div>

        {/* SELECTOR DE MODO COMPACTO */}
        <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 overflow-hidden shrink-0">
          <button
            onClick={() => setActiveTab('stock')}
            className={`px-2 py-1 text-[10px] rounded font-bold transition-all ${
              activeTab === 'stock' ? 'bg-white shadow text-red-600' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            Agotados
          </button>
          <button
            onClick={() => setActiveTab('expirations')}
            className={`px-2 py-1 text-[10px] rounded font-bold transition-all ${
              activeTab === 'expirations' ? 'bg-white shadow text-orange-600' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            Vencim.
          </button>
        </div>
      </div>

      {/* BODY */}
      {!hasAlerts ? (
        <div className="flex-1 flex flex-col items-center justify-center opacity-60 min-h-[250px]">
          <Info size={32} className="text-slate-300 mb-2" />
          <p className="text-sm font-medium text-slate-500 text-center">Todo en orden</p>
          <p className="text-xs text-slate-400 text-center">Sin productos agotados ni próximos a vencer.</p>
        </div>
      ) : (
        <div className="relative flex-1 min-h-[280px]">
          <div className="absolute inset-0 overflow-y-auto custom-scrollbar pr-1">
              
            {/* VISTA: AGOTADOS */}
            {activeTab === 'stock' && (
              <div className="space-y-2">
                {visibleStock.length > 0 ? visibleStock.map((product) => {
                  const isWeight = product.product_type === 'weight';
                  return (
                    <div key={`stk-${product.id}`} className="flex justify-between items-center p-2.5 rounded-lg border bg-slate-50 border-slate-200 hover:border-red-200 transition-colors">
                      <div className="flex-1 min-w-0 pr-3 flex items-center gap-2">
                        <Package size={14} className="text-slate-400 shrink-0" />
                        <p className="font-bold text-xs text-slate-700 truncate">{product.title}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-xs text-red-600 bg-red-100 px-2 py-0.5 rounded">
                          {formatNumber(product.stock)} {isWeight ? 'g' : 'u'}
                        </p>
                      </div>
                    </div>
                  );
                }) : (
                  <p className="text-center text-xs text-slate-400 mt-6 italic">No hay productos agotados.</p>
                )}
                {outOfStockProducts.length > 20 && (
                  <p className="text-center text-[10px] font-bold text-slate-400 py-2">
                    + {outOfStockProducts.length - 20} productos más ocultos
                  </p>
                )}
              </div>
            )}

            {/* VISTA: VENCIMIENTOS */}
            {activeTab === 'expirations' && (
              <div className="space-y-2">
                {visibleExpirations.length > 0 ? visibleExpirations.map((product) => {
                  const isExpired = product.daysUntil <= 0;
                  return (
                    <div key={`exp-${product.id}`} className={`flex justify-between items-center p-2.5 rounded-lg border transition-colors ${isExpired ? 'bg-red-50 border-red-200 hover:border-red-300' : 'bg-orange-50 border-orange-200 hover:border-orange-300'}`}>
                      <div className="flex-1 min-w-0 pr-3">
                        <p className={`font-bold text-xs truncate ${isExpired ? 'text-red-800' : 'text-orange-800'}`}>{product.title}</p>
                        <p className={`text-[10px] flex items-center gap-1 mt-0.5 font-medium ${isExpired ? 'text-red-600' : 'text-orange-600'}`}>
                          <CalendarX size={12} />
                          {isExpired ? '¡VENCIDO!' : `Vence en ${product.daysUntil} días`}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`font-bold text-xs bg-white px-2 py-0.5 rounded border ${isExpired ? 'text-red-700 border-red-200' : 'text-orange-700 border-orange-200'}`}>
                          {new Date(product.expiration_date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  );
                }) : (
                  <p className="text-center text-xs text-slate-400 mt-6 italic">No hay productos próximos a vencer.</p>
                )}
                {expiringProducts.length > 20 && (
                  <p className="text-center text-[10px] font-bold text-slate-400 py-2">
                    + {expiringProducts.length - 20} productos más ocultos
                  </p>
                )}
              </div>
            )}
            
          </div>
        </div>
      )}
    </div>
  );
};