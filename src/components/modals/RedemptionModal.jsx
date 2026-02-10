import React, { useState } from 'react';
import {
  X,
  Gift,
  Tag,
  Package,
  Search,
  AlertCircle
} from 'lucide-react';
import { formatPrice } from '../../utils/helpers';

export const RedemptionModal = ({ 
  isOpen, 
  onClose, 
  client, 
  rewards, 
  onRedeem 
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) return null;

  // Filtrado de recompensas
  const filteredRewards = rewards.filter(r => 
    r.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden">
        
        {/* HEADER: Info del Socio y Puntos */}
        <div className="bg-slate-900 text-white p-6 shrink-0">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Gift className="text-fuchsia-400" /> Zona de Canje
              </h2>
              <p className="text-slate-400 text-sm mt-1">Selecciona una recompensa para agregar al carrito</p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
              <X size={24} />
            </button>
          </div>

          {/* Tarjeta de Puntos del Socio */}
          <div className="mt-6 bg-slate-800/50 border border-slate-700 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-fuchsia-600 flex items-center justify-center text-xl font-bold">
                {client?.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-lg">{client?.name}</p>
                <p className="text-xs text-slate-400">Socio #{String(client?.memberNumber).padStart(4,'0')}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400 uppercase font-bold tracking-wider">Puntos Disponibles</p>
              <p className="text-3xl font-black text-fuchsia-400">{client?.points}</p>
            </div>
          </div>
        </div>

        {/* BARRA DE BÚSQUEDA */}
        <div className="p-4 border-b bg-slate-50 flex gap-4 shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Buscar premio..." 
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* GRID DE RECOMPENSAS */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-100">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRewards.map((reward) => {
              const canAfford = (client?.points || 0) >= reward.pointsCost;
              const hasStock = reward.type === 'product' ? (reward.stock > 0) : true;
              const isDisabled = !canAfford || !hasStock;

              return (
                <div 
                  key={reward.id} 
                  className={`bg-white rounded-xl border-2 transition-all flex flex-col overflow-hidden relative group ${
                    isDisabled 
                      ? 'border-slate-100 opacity-60 grayscale' 
                      : 'border-white hover:border-fuchsia-400 shadow-sm hover:shadow-lg'
                  }`}
                >
                  {/* Badge de Tipo */}
                  <div className={`absolute top-3 right-3 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wide z-10 ${
                    reward.type === 'product' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {reward.type === 'product' ? 'Producto' : 'Descuento'}
                  </div>

                  {/* Imagen / Icono */}
                  <div className="h-32 bg-slate-50 flex items-center justify-center border-b border-slate-100 relative overflow-hidden">
                    {reward.image ? (
                      <img src={reward.image} alt={reward.title} className="w-full h-full object-cover" />
                    ) : (
                      reward.type === 'product' ? (
                        <Package size={48} className="text-slate-300" />
                      ) : (
                        <Tag size={48} className="text-emerald-300" />
                      )
                    )}
                    
                    {/* Costo en Puntos (Overlay) */}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3 pt-8 flex items-end">
                      <p className="text-white font-black text-xl flex items-baseline gap-1">
                        {reward.pointsCost} <span className="text-xs font-normal opacity-80">pts</span>
                      </p>
                    </div>
                  </div>

                  {/* Contenido */}
                  <div className="p-4 flex-1 flex flex-col">
                    <h3 className="font-bold text-slate-800 mb-1 leading-tight">{reward.title}</h3>
                    
                    {reward.description && (
                      <p className="text-xs text-slate-500 mb-3 line-clamp-2">{reward.description}</p>
                    )}

                    <div className="mt-auto space-y-2">
                      {/* Info Extra: Stock o Valor */}
                      {reward.type === 'product' ? (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <Package size={14} />
                          <span>Stock: {reward.stock} unid.</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-bold">
                          <Tag size={14} />
                          <span>Valor: ${formatPrice(reward.discountAmount)}</span>
                        </div>
                      )}

                      {/* Botón Canjear */}
                      <button
                        onClick={() => !isDisabled && onRedeem(reward)}
                        disabled={isDisabled}
                        className={`w-full py-2.5 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all ${
                          isDisabled 
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            : 'bg-slate-900 text-white hover:bg-fuchsia-600 active:scale-95'
                        }`}
                      >
                        {!canAfford ? (
                          <>Faltan {reward.pointsCost - client.points} pts</>
                        ) : !hasStock ? (
                          'Sin Stock'
                        ) : (
                          <>Canjear</>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredRewards.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 opacity-60">
              <Gift size={64} className="mb-4" />
              <p>No se encontraron recompensas</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};