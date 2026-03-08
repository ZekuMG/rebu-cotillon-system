// src/components/dashboard/TopRanking.jsx
import React from 'react';
import { TrendingUp, Package, Layers, Scale, DollarSign, Hash } from 'lucide-react';
import { formatNumber } from '../../utils/helpers'; 
import { FancyPrice } from '../FancyPrice';

export const TopRanking = ({ 
  rankingStats, 
  rankingMode, 
  setRankingMode, 
  rankingCriteria, 
  setRankingCriteria, 
  getEmptyStateMessage 
}) => {
  return (
    // 1. Contenedor Principal (alineado a los otros widgets: p-5)
    <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 h-full flex flex-col min-h-0">
      
      {/* 2. Header */}
      <div className="flex justify-between items-center mb-4 gap-2 shrink-0">
        <h3 className="font-bold text-slate-800 flex items-center gap-1.5 whitespace-nowrap text-sm">
          {rankingMode === 'categories' ? <Layers size={16} className="text-indigo-500" /> :
           rankingMode === 'weight' ? <Scale size={16} className="text-emerald-500" /> :
           <TrendingUp size={16} className="text-amber-500" />
          }
          Top Ventas
        </h3>

        {/* Contenedor de Switches */}
        <div className="flex items-center gap-2 shrink-0">
          
          {/* Switch 1: Agrupación */}
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 overflow-hidden">
            <button
              onClick={() => setRankingMode('products')}
              className={`px-2 py-1 text-[9px] rounded font-bold transition-all ${rankingMode === 'products' ? 'bg-white shadow text-amber-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Unidad
            </button>
            <button
              onClick={() => setRankingMode('weight')}
              className={`px-2 py-1 text-[9px] rounded font-bold transition-all ${rankingMode === 'weight' ? 'bg-white shadow text-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Peso
            </button>
            <button
              onClick={() => setRankingMode('categories')}
              className={`px-2 py-1 text-[9px] rounded font-bold transition-all ${rankingMode === 'categories' ? 'bg-white shadow text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Categoría
            </button>
          </div>

          {/* Switch 2: Criterio */}
          <div className="flex bg-slate-50 p-0.5 rounded-lg border border-slate-100 overflow-hidden">
            <button
              onClick={() => setRankingCriteria('qty')}
              className={`flex items-center gap-1 px-3 py-1 text-[9px] rounded font-bold transition-all ${rankingCriteria === 'qty' ? 'bg-white shadow text-blue-600 border border-slate-200' : 'text-slate-400'}`}
            >
              <Hash size={10} /> Cantidad
            </button>
            <button
              onClick={() => setRankingCriteria('revenue')}
              className={`flex items-center gap-1 px-3 py-1 text-[9px] rounded font-bold transition-all ${rankingCriteria === 'revenue' ? 'bg-white shadow text-fuchsia-600 border border-slate-200' : 'text-slate-400'}`}
            >
              <DollarSign size={10} /> Dinero
            </button>
          </div>
          
        </div>
      </div>

      {/* 3. Contenedor Relativo con min-h-[280px] */}
      <div className="relative flex-1 min-h-[280px]">
        {/* 4. Scroll absoluto */}
        <div className="absolute inset-0 overflow-y-auto custom-scrollbar pr-1">
          {rankingStats && rankingStats.length > 0 ? (
            // 5. Wrapper de Lista (space-y-2)
            <div className="space-y-2">
              {rankingStats.map((item, idx) => (
                // 6. Tarjeta (p-2.5)
                <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-100 hover:border-slate-200 transition-colors">
                  <div className="flex items-center gap-2 overflow-hidden pr-2">
                    <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      idx === 0 ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                      idx === 1 ? 'bg-slate-200 text-slate-600 border border-slate-300' :
                      idx === 2 ? 'bg-orange-100 text-orange-700 border border-orange-200' : 'bg-white text-slate-400 border border-slate-200'
                    }`}>
                      #{idx + 1}
                    </span>
                    <span className="text-xs font-bold text-slate-700 truncate" title={item.name}>{item.name}</span>
                  </div>
                  
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm border ${rankingCriteria === 'qty' ? 'bg-blue-50 text-blue-600 border-blue-100 scale-105' : 'bg-white text-slate-500 border-slate-200'}`}>
                      {rankingMode === 'weight' 
                        ? (item.qty >= 1000 ? `${formatNumber(item.qty / 1000, 2)} kg` : `${formatNumber(item.qty)} g`) 
                        : rankingMode === 'categories'
                          ? (
                              [
                                item.weightQty > 0 ? (item.weightQty >= 1000 ? `${formatNumber(item.weightQty / 1000, 2)} kg` : `${formatNumber(item.weightQty)} g`) : null,
                                item.unitQty > 0 ? `${formatNumber(item.unitQty)} unidades` : null
                              ].filter(Boolean).join(' + ') || '0 unidades'
                            )
                          : `${formatNumber(item.qty)} unidades`
                      }
                    </span>

                    <span className={`text-xs font-black w-[70px] text-right transition-all ${rankingCriteria === 'revenue' ? 'text-fuchsia-600 scale-105' : 'text-slate-400'}`}>
                      <FancyPrice amount={item.revenue} />
                    </span>
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

    </div>
  );
};