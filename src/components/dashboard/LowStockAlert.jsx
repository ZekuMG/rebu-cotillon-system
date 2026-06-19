// src/components/dashboard/LowStockAlert.jsx
import React, { useState } from 'react';
import { AlertTriangle, Package, CalendarX, Info } from 'lucide-react';
import { formatNumber } from '../../utils/helpers';
import { getProductImageUrl } from '../../utils/productImages';
import useIncrementalFeed from '../../hooks/useIncrementalFeed';

// ✨ NUEVO: Agregamos la prop onAlertClick
export const LowStockAlert = ({ lowStockProducts = [], expiringProducts = [], onAlertClick }) => {
  const outOfStockProducts = lowStockProducts.filter(p => p.stock <= 0);
  const hasAlerts = outOfStockProducts.length > 0 || expiringProducts.length > 0;
  
  const [activeTab, setActiveTab] = useState('stock');
  const stockFeed = useIncrementalFeed(outOfStockProducts, {
    resetKey: `${activeTab}-stock-${outOfStockProducts.length}`,
  });
  const expirationFeed = useIncrementalFeed(expiringProducts, {
    resetKey: `${activeTab}-exp-${expiringProducts.length}`,
  });

  return (
    <div className="bg-white p-3.5 rounded-lg shadow-sm border border-red-100 h-full min-h-0 flex flex-col">
      
      {/* HEADER COMPACTO Y ALINEADO */}
      <div className="flex justify-between items-start mb-2.5 gap-2 shrink-0">
        
        <div className="flex min-w-0 items-start gap-2">
          <h3 className="flex h-[24px] items-center gap-1.5 whitespace-nowrap text-[13px] font-bold text-slate-800">
            <AlertTriangle size={15} className={activeTab === 'stock' ? 'text-red-500' : 'text-orange-500'} />
            Alertas
          </h3>
          <div className="flex min-h-[24px] min-w-0 flex-wrap items-center gap-1">
            {outOfStockProducts.length > 0 && (
               // ✨ NUEVO: Convertido a botón clickeable
              <button 
                onClick={() => onAlertClick && onAlertClick('out_of_stock')}
                className="bg-red-100 text-red-700 text-[9px] font-bold px-2 py-1 rounded uppercase leading-none tracking-wider hover:bg-red-200 transition-colors cursor-pointer"
              >
                {outOfStockProducts.length} Agotados
              </button>
            )}
            {expiringProducts.length > 0 && (
              // ✨ NUEVO: Convertido a botón clickeable
              <button 
                onClick={() => onAlertClick && onAlertClick('expirations')}
                className="bg-orange-100 text-orange-700 text-[9px] font-bold px-2 py-1 rounded uppercase leading-none tracking-wider hover:bg-orange-200 transition-colors cursor-pointer"
              >
                {expiringProducts.length} Vencidos
              </button>
            )}
          </div>
        </div>

        {/* SELECTOR DE MODO COMPACTO */}
        <div className="flex h-[28px] shrink-0 items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100 p-0.5">
          <button
            onClick={() => setActiveTab('stock')}
            className={`h-[22px] px-2.5 text-[10px] rounded-md font-bold leading-none transition-all ${
              activeTab === 'stock' ? 'bg-white shadow text-red-600' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            Agotados
          </button>
          <button
            onClick={() => setActiveTab('expirations')}
            className={`h-[22px] px-2.5 text-[10px] rounded-md font-bold leading-none transition-all ${
              activeTab === 'expirations' ? 'bg-white shadow text-orange-600' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            Vencidos
          </button>
        </div>
      </div>

      {/* BODY */}
      {!hasAlerts ? (
        <div className="flex-1 flex flex-col items-center justify-center opacity-60 min-h-0">
          <Info size={28} className="text-slate-300 mb-2" />
          <p className="text-xs font-medium text-slate-500 text-center">Todo en orden</p>
          <p className="text-xs text-slate-400 text-center">Sin productos agotados ni próximos a vencer.</p>
        </div>
      ) : (
        <div
          className="custom-scrollbar flex-1 min-h-0 overflow-y-auto pr-1"
          onScroll={activeTab === 'stock' ? stockFeed.handleScroll : expirationFeed.handleScroll}
        >
              
            {/* VISTA: AGOTADOS */}
            {activeTab === 'stock' && (
              <div className="space-y-1">
                {stockFeed.visibleItems.length > 0 ? stockFeed.visibleItems.map((product) => {
                  const isWeight = product.product_type === 'weight';
                  const productImage = getProductImageUrl(product);
                  return (
                    <button key={`stk-${product.id}`} type="button" onClick={() => onAlertClick && onAlertClick({ type: 'product', product, alertType: 'out_of_stock' })} className="flex w-full justify-between items-center px-2 py-1.5 rounded-md border bg-slate-50 border-slate-200 hover:border-red-300 hover:bg-white transition-colors text-left">
                      <div className="flex-1 min-w-0 pr-2 flex items-center gap-1.5">
                        {productImage ? (
                          <img
                            src={productImage}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            fetchPriority="low"
                            className="h-8 w-8 shrink-0 rounded-md border border-slate-200 bg-white object-cover shadow-sm"
                          />
                        ) : (
                          <div className="shrink-0 w-8 h-8 rounded-md flex items-center justify-center shadow-sm border bg-red-50 text-red-600 border-red-200">
                            <Package size={13} />
                          </div>
                        )}
                        <div className="flex min-w-0 flex-col">
                          <p className="font-bold text-[11px] text-slate-700 truncate leading-tight">{product.title}</p>
                          <p className="text-[8px] font-medium text-slate-400 truncate leading-tight">Sin stock disponible</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-[11px] text-red-600 bg-red-100 px-1.5 py-0.5 rounded">
                          {formatNumber(product.stock)} {isWeight ? 'g' : 'u'}
                        </p>
                      </div>
                    </button>
                  );
                }) : (
                  <p className="text-center text-xs text-slate-400 mt-6 italic">No hay productos agotados.</p>
                )}
                {outOfStockProducts.length > 0 && (
                  <p className="text-center text-[10px] font-bold text-slate-400 py-2">
                    Mostrando {stockFeed.visibleCount} de {outOfStockProducts.length} productos
                  </p>
                )}
              </div>
            )}

            {/* VISTA: VENCIMIENTOS */}
            {activeTab === 'expirations' && (
              <div className="space-y-1">
                {expirationFeed.visibleItems.length > 0 ? expirationFeed.visibleItems.map((product) => {
                  const isExpired = product.daysUntil <= 0;
                  return (
                    <button key={`exp-${product.id}`} type="button" onClick={() => onAlertClick && onAlertClick({ type: 'product', product, alertType: 'expirations' })} className={`flex w-full justify-between items-center px-2 py-1.5 rounded-md border transition-colors text-left ${isExpired ? 'bg-red-50 border-red-200 hover:border-red-300' : 'bg-orange-50 border-orange-200 hover:border-orange-300'}`}>
                      <div className="flex-1 min-w-0 pr-2 flex items-center gap-1.5">
                        <div className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center shadow-sm border ${isExpired ? 'bg-red-50 text-red-600 border-red-200' : 'bg-orange-50 text-orange-600 border-orange-200'}`}>
                          <CalendarX size={11} />
                        </div>
                        <div className="flex min-w-0 flex-col">
                        <p className={`font-bold text-[11px] truncate leading-tight ${isExpired ? 'text-red-800' : 'text-orange-800'}`}>{product.title}</p>
                        <p className={`text-[8px] flex items-center gap-1 font-medium leading-tight ${isExpired ? 'text-red-600' : 'text-orange-600'}`}>
                          {isExpired ? '¡VENCIDO!' : `Vence en ${product.daysUntil} días`}
                        </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`font-bold text-[11px] bg-white px-1.5 py-0.5 rounded border ${isExpired ? 'text-red-700 border-red-200' : 'text-orange-700 border-orange-200'}`}>
                          {new Date(product.expiration_date).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                        </p>
                      </div>
                    </button>
                  );
                }) : (
                  <p className="text-center text-xs text-slate-400 mt-6 italic">No hay productos próximos a vencer.</p>
                )}
                {expiringProducts.length > 0 && (
                  <p className="text-center text-[10px] font-bold text-slate-400 py-2">
                    Mostrando {expirationFeed.visibleCount} de {expiringProducts.length} productos
                  </p>
                )}
              </div>
            )}
        </div>
      )}
    </div>
  );
};
