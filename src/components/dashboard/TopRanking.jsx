// src/components/dashboard/TopRanking.jsx
import React from 'react';
import { TrendingUp, Package, Layers, Scale } from 'lucide-react';
// ♻️ FIX: Importamos formatCurrency y formatNumber
import { formatCurrency, formatNumber } from '../../utils/helpers'; 

export const TopRanking = ({ rankingStats, rankingMode, setRankingMode, getEmptyStateMessage }) => {
  return (
    <div className="bg-white p-5 rounded-xl shadow-sm border h-full flex flex-col">
      <div className="flex justify-between items-center mb-4 gap-2">
        <h3 className="font-bold text-slate-800 flex items-center gap-1.5 whitespace-nowrap text-sm">
          {rankingMode === 'categories' ? <Layers size={16} className="text-indigo-500" /> :
           rankingMode === 'weight' ? <Scale size={16} className="text-emerald-500" /> :
           <TrendingUp size={16} className="text-amber-500" />
          }
          Top Ventas
        </h3>

        {/* SELECTOR DE MODO COMPACTO */}
        <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 overflow-hidden shrink-0">
          <button
            onClick={() => setRankingMode('products')}
            className={`px-2 py-1 text-[10px] rounded font-bold transition-all ${rankingMode === 'products' ? 'bg-white shadow text-amber-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Unidad
          </button>
          <button
            onClick={() => setRankingMode('weight')}
            className={`px-2 py-1 text-[10px] rounded font-bold transition-all ${rankingMode === 'weight' ? 'bg-white shadow text-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Peso
          </button>
          <button
            onClick={() => setRankingMode('categories')}
            className={`px-2 py-1 text-[10px] rounded font-bold transition-all ${rankingMode === 'categories' ? 'bg-white shadow text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Categoría
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {rankingStats && rankingStats.length > 0 ? (
          <div className="space-y-2">
            {rankingStats.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-100">
                <div className="flex items-center gap-2 overflow-hidden">
                  <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${
                    idx === 0 ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                    idx === 1 ? 'bg-slate-200 text-slate-600' :
                    idx === 2 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-400'
                  }`}>
                    #{idx + 1}
                  </span>
                  <span className="text-xs font-bold text-slate-700 truncate" title={item.name}>{item.name}</span>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <p className={`text-[11px] font-black ${rankingMode === 'weight' ? 'text-emerald-700' : 'text-slate-800'}`}>
                    {/* LÓGICA DE TEXTO INTELIGENTE (Ahora con formatNumber) */}
                    {rankingMode === 'weight' 
                      ? (item.qty >= 1000 ? `${formatNumber(item.qty / 1000, 2)} kg` : `${formatNumber(item.qty)} g`) 
                      : rankingMode === 'categories'
                        ? (
                            [
                              item.weightQty > 0 ? (item.weightQty >= 1000 ? `${formatNumber(item.weightQty / 1000, 2)} kg` : `${formatNumber(item.weightQty)} g`) : null,
                              item.unitQty > 0 ? `${formatNumber(item.unitQty)} un.` : null
                            ].filter(Boolean).join(' y ') || '0 un.'
                          )
                        : `${formatNumber(item.qty)} un.`
                    }
                  </p>
                  {/* ♻️ FIX: formatCurrency al Total Facturado */}
                  <p className="text-[9px] font-bold text-slate-400">{formatCurrency(item.revenue)}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 opacity-50 h-full">
            <Package size={32} className="text-slate-300 mb-2" />
            <p className="text-xs font-bold text-slate-400 text-center">{getEmptyStateMessage ? getEmptyStateMessage() : 'Sin ventas aún'}</p>
          </div>
        )}
      </div>
    </div>
  );
};