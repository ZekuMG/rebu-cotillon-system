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
  getEmptyStateMessage,
  onSelectEntry,
}) => {
  const getQtyLabel = (item) => (
    rankingMode === 'weight'
      ? (item.qty >= 1000 ? `${formatNumber(item.qty / 1000, 2)} kg` : `${formatNumber(item.qty)} g`)
      : rankingMode === 'categories'
        ? (
            [
              item.weightQty > 0 ? (item.weightQty >= 1000 ? `${formatNumber(item.weightQty / 1000, 2)} kg` : `${formatNumber(item.weightQty)} g`) : null,
              item.unitQty > 0 ? `${formatNumber(item.unitQty)} unidades` : null
            ].filter(Boolean).join(' + ') || '0 unidades'
          )
        : `${formatNumber(item.qty)} unidades`
  );

  return (
    <div className="bg-white p-3.5 rounded-lg shadow-sm border border-slate-200 h-full min-h-0 flex flex-col">
      
      {/* 2. Header */}
      <div className="flex justify-between items-start mb-2.5 gap-2 shrink-0">
        <h3 className="flex h-[24px] items-center gap-1.5 whitespace-nowrap text-[13px] font-bold text-slate-800">
          {rankingMode === 'categories' ? <Layers size={15} className="text-indigo-500" /> :
           rankingMode === 'weight' ? <Scale size={15} className="text-emerald-500" /> :
           <TrendingUp size={15} className="text-amber-500" />
          }
          Top Ventas
        </h3>

        {/* Contenedor de Switches */}
        <div className="flex min-h-[28px] shrink-0 items-center gap-2">
          
          {/* Switch 1: Agrupación */}
          <div className="flex h-[28px] items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100 p-0.5">
            <button
              onClick={() => setRankingMode('products')}
              className={`h-[22px] px-2.5 text-[10px] rounded-md font-bold leading-none transition-all ${rankingMode === 'products' ? 'bg-white shadow text-amber-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Unidad
            </button>
            <button
              onClick={() => setRankingMode('weight')}
              className={`h-[22px] px-2.5 text-[10px] rounded-md font-bold leading-none transition-all ${rankingMode === 'weight' ? 'bg-white shadow text-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Peso
            </button>
            <button
              onClick={() => setRankingMode('categories')}
              className={`h-[22px] px-2.5 text-[10px] rounded-md font-bold leading-none transition-all ${rankingMode === 'categories' ? 'bg-white shadow text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
              Categoría
            </button>
          </div>

          {/* Switch 2: Criterio */}
          <div className="flex h-[28px] items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100 p-0.5">
            <button
              onClick={() => setRankingCriteria('qty')}
              className={`flex h-[22px] items-center gap-1 px-2.5 text-[10px] rounded-md font-bold leading-none transition-all ${rankingCriteria === 'qty' ? 'bg-white shadow text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <Hash size={10} /> Cantidad
            </button>
            <button
              onClick={() => setRankingCriteria('revenue')}
              className={`flex h-[22px] items-center gap-1 px-2.5 text-[10px] rounded-md font-bold leading-none transition-all ${rankingCriteria === 'revenue' ? 'bg-white shadow text-fuchsia-600' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <DollarSign size={10} /> Dinero
            </button>
          </div>
          
        </div>
      </div>

      <div className="custom-scrollbar flex-1 min-h-0 overflow-y-auto pr-1">
          {rankingStats && rankingStats.length > 0 ? (
            <div className="space-y-1">
              {rankingStats.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onSelectEntry && onSelectEntry(item, rankingMode)}
                  className="flex w-full items-center justify-between px-2 py-1.5 bg-slate-50 rounded-md border border-slate-200 hover:border-blue-300 hover:bg-white transition-colors text-left"
                >
                  <div className="flex items-center gap-1.5 overflow-hidden pr-2">
                    <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${
                      idx === 0 ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                      idx === 1 ? 'bg-slate-200 text-slate-600 border border-slate-300' :
                      idx === 2 ? 'bg-orange-100 text-orange-700 border border-orange-200' : 'bg-white text-slate-400 border border-slate-200'
                    }`}>
                      #{idx + 1}
                    </span>
                    <span className="text-[11px] font-bold text-slate-700 truncate" title={item.name}>{item.name}</span>
                  </div>
                  
                  <div className="flex items-center gap-1.5 shrink-0 pl-2">
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm border ${
                        rankingCriteria === 'qty'
                          ? 'bg-blue-50 text-blue-600 border-blue-100 scale-105'
                          : 'bg-white text-slate-500 border-slate-200'
                      } ${rankingMode === 'categories' && rankingCriteria === 'qty' ? 'max-w-none whitespace-nowrap' : 'max-w-[120px] truncate'}`}
                      title={getQtyLabel(item)}
                    >
                      {getQtyLabel(item)}
                    </span>

                    <span className={`min-w-[100px] text-[11px] font-black text-right tabular-nums whitespace-nowrap transition-all ${rankingCriteria === 'revenue' ? 'text-fuchsia-600 scale-105' : 'text-slate-400'}`}>
                      <FancyPrice amount={item.revenue} className="whitespace-nowrap" />
                    </span>
                  </div>
                </button>
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
