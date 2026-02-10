// src/components/dashboard/TopRanking.jsx
// ♻️ REFACTOR: Extraído de DashboardView.jsx — renderWidget('topProducts')

import React from 'react';
import { TrendingUp, Package, Layers } from 'lucide-react';

export const TopRanking = ({ rankingStats, rankingMode, setRankingMode, getEmptyStateMessage }) => {
  return (
    <div className="bg-white p-5 rounded-xl shadow-sm border h-full">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          {rankingMode === 'products'
            ? <TrendingUp size={18} className="text-amber-500" />
            : <Layers size={18} className="text-indigo-500" />
          }
          Más Vendidos
        </h3>

        <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
          <button
            onClick={() => setRankingMode('products')}
            className={`px-2 py-1 text-[10px] rounded font-bold transition-all ${rankingMode === 'products' ? 'bg-white shadow text-amber-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Productos
          </button>
          <button
            onClick={() => setRankingMode('categories')}
            className={`px-2 py-1 text-[10px] rounded font-bold transition-all ${rankingMode === 'categories' ? 'bg-white shadow text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Categorias
          </button>
        </div>
      </div>

      {rankingStats.length > 0 ? (
        <div className="space-y-2">
          {rankingStats.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-100">
              <div className="flex items-center gap-3 overflow-hidden">
                <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  idx === 0 ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                  idx === 1 ? 'bg-slate-200 text-slate-600' :
                  idx === 2 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-400'
                }`}>
                  #{idx + 1}
                </span>
                <span className="text-xs font-bold text-slate-700 truncate">{item.name}</span>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-bold text-slate-800">{item.qty} un.</p>
                <p className="text-[9px] text-slate-400">${item.revenue.toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 opacity-50">
          <Package size={32} className="text-slate-300 mb-2" />
          <p className="text-xs font-bold text-slate-400">{getEmptyStateMessage()}</p>
        </div>
      )}
    </div>
  );
};
