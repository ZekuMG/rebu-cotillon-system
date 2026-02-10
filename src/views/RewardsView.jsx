import React, { useState } from 'react';
import {
  Gift,
  Plus,
  Search,
  Edit2,
  Trash2,
  Tag,
  Package,
  X,
  Save,
  AlertCircle
} from 'lucide-react';

export default function RewardsView({
  rewards,
  onAddReward,
  onUpdateReward,
  onDeleteReward
}) {
  // --- ESTADOS LOCALES ---
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' | 'edit'
  
  // Estado del Formulario
  const [formData, setFormData] = useState({
    id: null,
    title: '',
    description: '',
    pointsCost: '',
    type: 'product', // 'product' | 'discount'
    discountAmount: '', // Solo si type === 'discount'
    stock: '' // Solo si type === 'product' (stock del premio específico)
  });

  // Estado para eliminar
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [rewardToDelete, setRewardToDelete] = useState(null);

  // --- FILTRADO ---
  const filteredRewards = rewards.filter((r) =>
    r.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // --- HANDLERS ---
  const openCreateModal = () => {
    setModalMode('create');
    setFormData({
      id: null,
      title: '',
      description: '',
      pointsCost: '',
      type: 'product',
      discountAmount: '',
      stock: ''
    });
    setIsModalOpen(true);
  };

  const openEditModal = (reward) => {
    setModalMode('edit');
    setFormData({
      id: reward.id,
      title: reward.title,
      description: reward.description || '',
      pointsCost: reward.pointsCost,
      type: reward.type,
      discountAmount: reward.discountAmount || '',
      stock: reward.stock || ''
    });
    setIsModalOpen(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Validaciones básicas
    if (!formData.title || !formData.pointsCost) return;

    const payload = {
      ...formData,
      pointsCost: Number(formData.pointsCost),
      discountAmount: formData.type === 'discount' ? Number(formData.discountAmount) : 0,
      stock: formData.type === 'product' ? Number(formData.stock) : 0
    };

    if (modalMode === 'create') {
      onAddReward(payload);
    } else {
      onUpdateReward(payload.id, payload);
    }
    setIsModalOpen(false);
  };

  const handleDeleteRequest = (reward) => {
    setRewardToDelete(reward);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = () => {
    if (rewardToDelete) {
      onDeleteReward(rewardToDelete.id);
      setIsDeleteModalOpen(false);
      setRewardToDelete(null);
    }
  };

  return (
    <div className="h-full flex flex-col relative bg-slate-50 p-6">
      
      {/* HEADER */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
           <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
             <Gift className="text-fuchsia-600" /> Gestión de Premios
           </h1>
           <p className="text-sm text-gray-500 mt-1">Configura el catálogo de canjes y recompensas.</p>
        </div>
        
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-80">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar premio..."
              className="w-full rounded-xl border border-gray-200 pl-10 p-2.5 bg-white focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-100 outline-none shadow-sm transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button
            onClick={openCreateModal}
            className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 font-bold shadow-lg transition-all active:scale-95"
          >
            <Plus size={20} />
            <span className="hidden sm:inline">Nuevo Premio</span>
          </button>
        </div>
      </div>

      {/* GRID DE PREMIOS */}
      <div className="flex-1 overflow-y-auto">
        {filteredRewards.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredRewards.map((reward) => (
              <div key={reward.id} className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all flex flex-col group overflow-hidden">
                {/* Header Tarjeta */}
                <div className="h-24 bg-slate-50 border-b border-gray-100 flex items-center justify-center relative">
                  {reward.type === 'product' ? (
                    <Package size={32} className="text-blue-400" />
                  ) : (
                    <Tag size={32} className="text-emerald-400" />
                  )}
                  <div className={`absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide ${
                    reward.type === 'product' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {reward.type === 'product' ? 'Producto' : 'Descuento'}
                  </div>
                </div>

                {/* Body Tarjeta */}
                <div className="p-4 flex-1 flex flex-col">
                  <h3 className="font-bold text-gray-800 mb-1">{reward.title}</h3>
                  <p className="text-xs text-gray-500 line-clamp-2 mb-3 flex-1">
                    {reward.description || 'Sin descripción'}
                  </p>
                  
                  <div className="space-y-2 mt-auto">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-400 font-medium">Costo:</span>
                      <span className="font-bold text-fuchsia-600">{reward.pointsCost} pts</span>
                    </div>
                    
                    <div className="flex justify-between items-center text-sm">
                      {reward.type === 'product' ? (
                        <>
                          <span className="text-gray-400 font-medium">Stock:</span>
                          <span className="font-bold text-gray-700">{reward.stock} u.</span>
                        </>
                      ) : (
                        <>
                          <span className="text-gray-400 font-medium">Valor:</span>
                          <span className="font-bold text-emerald-600">${reward.discountAmount}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer Acciones */}
                <div className="p-3 border-t border-gray-100 bg-gray-50 flex gap-2 justify-end opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => openEditModal(reward)} 
                    className="p-2 text-gray-500 hover:text-blue-600 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-gray-200"
                    title="Editar"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button 
                    onClick={() => handleDeleteRequest(reward)} 
                    className="p-2 text-gray-500 hover:text-red-600 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-gray-200"
                    title="Eliminar"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-gray-400">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <Gift size={32} className="text-slate-300" />
            </div>
            <p className="font-medium">No hay premios configurados</p>
            <p className="text-sm">Agrega uno nuevo para comenzar.</p>
          </div>
        )}
      </div>

      {/* --- MODAL CREAR / EDITAR PREMIO --- */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-lg text-gray-800">
                {modalMode === 'create' ? 'Nuevo Premio' : 'Editar Premio'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Título */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nombre del Premio *</label>
                <input 
                  type="text" 
                  required 
                  className="w-full rounded-lg border border-gray-300 p-2.5 focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-100 outline-none font-medium" 
                  placeholder="Ej: Voucher $500, Coca Cola, etc." 
                  value={formData.title} 
                  onChange={(e) => setFormData({...formData, title: e.target.value})} 
                  autoFocus 
                />
              </div>

              {/* Tipo de Premio */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tipo de Recompensa</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData({...formData, type: 'product'})}
                    className={`py-2 px-3 rounded-lg border flex items-center justify-center gap-2 text-sm font-bold transition-all ${
                      formData.type === 'product' 
                        ? 'bg-blue-50 border-blue-200 text-blue-700 ring-1 ring-blue-300' 
                        : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    <Package size={16} /> Producto Físico
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({...formData, type: 'discount'})}
                    className={`py-2 px-3 rounded-lg border flex items-center justify-center gap-2 text-sm font-bold transition-all ${
                      formData.type === 'discount' 
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700 ring-1 ring-emerald-300' 
                        : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    <Tag size={16} /> Descuento ($)
                  </button>
                </div>
              </div>

              {/* Campos dinámicos según tipo */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Costo en Puntos *</label>
                  <input 
                    type="number" 
                    min="1" 
                    required 
                    className="w-full rounded-lg border border-gray-300 p-2.5 focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-100 outline-none font-bold text-fuchsia-600" 
                    placeholder="0" 
                    value={formData.pointsCost} 
                    onChange={(e) => setFormData({...formData, pointsCost: e.target.value})} 
                  />
                </div>

                {formData.type === 'product' ? (
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Stock Disponible</label>
                    <input 
                      type="number" 
                      min="0" 
                      className="w-full rounded-lg border border-gray-300 p-2.5 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" 
                      placeholder="Cantidad" 
                      value={formData.stock} 
                      onChange={(e) => setFormData({...formData, stock: e.target.value})} 
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Monto Descuento ($)</label>
                    <input 
                      type="number" 
                      min="1" 
                      className="w-full rounded-lg border border-gray-300 p-2.5 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none font-bold text-emerald-600" 
                      placeholder="$ 0.00" 
                      value={formData.discountAmount} 
                      onChange={(e) => setFormData({...formData, discountAmount: e.target.value})} 
                    />
                  </div>
                )}
              </div>

              {/* Descripción */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Descripción / Notas</label>
                <textarea 
                  rows="2" 
                  className="w-full rounded-lg border border-gray-300 p-2.5 focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-100 outline-none text-sm resize-none" 
                  placeholder="Detalles adicionales..." 
                  value={formData.description} 
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                ></textarea>
              </div>

              {/* Botones */}
              <div className="pt-2 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)} 
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-bold transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="flex-1 px-4 py-2.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 font-bold shadow-md transition-colors flex justify-center items-center gap-2"
                >
                  <Save size={18} />
                  {modalMode === 'create' ? 'Crear Premio' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL CONFIRMAR ELIMINACIÓN --- */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle size={32} className="text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">¿Eliminar Premio?</h3>
              <p className="text-gray-500 text-sm mb-6">
                Estás a punto de eliminar <span className="font-bold text-gray-800">"{rewardToDelete?.title}"</span>.<br/>
                Esta acción no se puede deshacer.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setIsDeleteModalOpen(false)} 
                  className="flex-1 py-2.5 border border-gray-300 rounded-lg font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={confirmDelete} 
                  className="flex-1 py-2.5 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 shadow-md transition-colors"
                >
                  Sí, Eliminar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}