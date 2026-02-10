// src/components/dashboard/LowStockAlert.jsx
// ♻️ REFACTOR: Extraído de DashboardView.jsx — renderWidget('lowStock')

import React from 'react';
import { Package } from 'lucide-react';

export const LowStockAlert = ({ lowStockProducts }) => {
  return (
    <div className="bg-white p-5 rounded-xl shadow-sm border h-full">
      <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
        <Package size={18} className="text-red-500" />
        Alerta de Stock
        {lowStockProducts.length > 0 && (
          <span className="bg-red-100 text-red-700 text-[10px] px-2 py-0.5 rounded-full font-bold ml-auto">
            {lowStockProducts.length}
          </span>
        )}
      </h3>
      {lowStockProducts.length > 0 ? (
        <div className="space-y-2">
          {lowStockProducts.map((product) => {
            const isOutOfStock = product.stock === 0;
            return (
              <div
                key={product.id}
                className={`flex items-center justify-between p-2 rounded-lg border ${isOutOfStock ? 'bg-red-50 border-red-100' : 'bg-orange-50 border-orange-100'}`}
              >
                <span className="text-xs font-bold text-slate-700 truncate max-w-[180px]">{product.title}</span>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${isOutOfStock ? 'bg-red-200 text-red-800' : 'bg-orange-200 text-orange-800'}`}>
                  {isOutOfStock ? 'AGOTADO' : `${product.stock} un.`}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-2">
            <Package size={20} className="text-green-600" />
          </div>
          <p className="text-xs font-bold text-green-700">Stock Saludable</p>
          <p className="text-[10px] text-green-600">No hay productos críticos</p>
        </div>
      )}
    </div>
  );
};
