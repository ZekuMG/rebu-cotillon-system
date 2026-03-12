import React, { useState, useMemo, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Tag,
  AlertCircle,
  Pencil,
  X,
  Package,
  Save,
  Search,
  Check,
  CheckCircle,
  PlusCircle,
  MinusCircle,
  List,
  TicketPercent,
  Settings2,
  ChevronDown,
  Gift,
  Edit2
} from 'lucide-react';
import { FancyPrice } from '../components/FancyPrice';
import { formatNumber, isTestRecord } from '../utils/helpers';

export default function ExtrasView({
  categories = [],
  inventory = [],
  offers = [],
  rewards = [],
  onAddCategory,
  onDeleteCategory,
  onEditCategory,
  onBatchUpdateProductCategory,
  onAddOffer,
  onUpdateOffer,
  onDeleteOffer,
  onAddReward,
  onUpdateReward,
  onDeleteReward
}) {
  // --- SISTEMA DE PESTAÑAS PRINCIPAL ---
  const [activeTab, setActiveTab] = useState('categories'); // 'categories' | 'offers' | 'rewards'

  // ==========================================
  // 1. ESTADOS DE CATEGORÍAS
  // ==========================================
  const [newCategory, setNewCategory] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [editedName, setEditedName] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [showAddProducts, setShowAddProducts] = useState(false);
  const [pendingChanges, setPendingChanges] = useState([]);
  const [batchReport, setBatchReport] = useState(null);

  // ==========================================
  // 2. ESTADOS DE OFERTAS
  // ==========================================
  const [offersSearch, setOffersSearch] = useState('');
  const [isOfferModalOpen, setIsOfferModalOpen] = useState(false);
  const [editingOfferId, setEditingOfferId] = useState(null);
  
  const defaultOfferForm = {
    name: '',
    type: '2x1',
    applyTo: 'Items',
    productsIncluded: [],
    itemsCount: '',
    discountValue: '',
    offerPrice: '',
    profitMargin: ''
  };
  const [offerForm, setOfferForm] = useState(defaultOfferForm);
  const [offerProductSearch, setOfferProductSearch] = useState('');

  // ==========================================
  // 3. ESTADOS DE PREMIOS
  // ==========================================
  const [rewardsSearch, setRewardsSearch] = useState('');
  const [isRewardModalOpen, setIsRewardModalOpen] = useState(false);
  const [rewardModalMode, setRewardModalMode] = useState('create'); 
  const [rewardForm, setRewardForm] = useState({
    id: null,
    title: '',
    description: '',
    pointsCost: '',
    type: 'product', 
    discountAmount: '', 
    stock: '' 
  });
  const [isDeleteRewardModalOpen, setIsDeleteRewardModalOpen] = useState(false);
  const [rewardToDelete, setRewardToDelete] = useState(null);


  // ============================================================================
  // LÓGICA DE CATEGORÍAS
  // ============================================================================
  const handleCloseCategoryModal = () => {
    setSelectedCategory(null);
    setEditedName('');
    setShowAddProducts(false);
    setProductSearch('');
    setPendingChanges([]);
  };

  const productHasCategory = (product, catName) => {
    const originalCats = Array.isArray(product.categories)
      ? product.categories
      : product.category
      ? [product.category]
      : [];
    let hasCat = originalCats.includes(catName);

    const changes = pendingChanges.filter((c) => c.productId === product.id);
    changes.forEach((change) => {
      if (change.categoryName === catName) {
        if (change.action === 'add') hasCat = true;
        if (change.action === 'remove') hasCat = false;
      }
    });

    return hasCat;
  };

  const productsByCategory = useMemo(() => {
    const result = {};
    categories.forEach((cat) => {
      if (selectedCategory === cat && inventory) {
        result[cat] = inventory.filter((p) => productHasCategory(p, cat));
      } else {
        result[cat] = inventory
          ? inventory.filter((p) => {
              if (Array.isArray(p.categories)) {
                return p.categories.includes(cat);
              }
              return p.category === cat;
            })
          : [];
      }
    });
    return result;
  }, [categories, inventory, pendingChanges, selectedCategory]);

  const availableProducts = useMemo(() => {
    if (!selectedCategory || !inventory) return [];
    return inventory.filter((p) => !productHasCategory(p, selectedCategory));
  }, [selectedCategory, inventory, pendingChanges]);

  const filteredAvailableProducts = useMemo(() => {
    if (!productSearch.trim()) return availableProducts;
    return availableProducts.filter((p) =>
      p.title.toLowerCase().includes(productSearch.toLowerCase())
    );
  }, [availableProducts, productSearch]);

  const handleSubmitCategory = (e) => {
    e.preventDefault();
    if (newCategory.trim()) {
      onAddCategory(newCategory.trim());
      setNewCategory('');
    }
  };

  const handleSelectCategory = (cat) => {
    if (isEditMode) {
      setSelectedCategory(cat);
      setEditedName(cat);
      setShowAddProducts(false);
      setProductSearch('');
      setPendingChanges([]);
    }
  };

  const handleSaveCategoryEdit = () => {
    try {
      let reportData = null;
      if (pendingChanges.length > 0) {
        const addedItems = [];
        const removedItems = [];
        pendingChanges.forEach((change) => {
          const prod = inventory.find((p) => p.id === change.productId);
          if (prod) {
            if (change.action === 'add') addedItems.push(prod.title);
            else if (change.action === 'remove') removedItems.push(prod.title);
          }
        });
        reportData = {
          categoryName: editedName || selectedCategory,
          added: addedItems,
          removed: removedItems,
          count: pendingChanges.length,
        };
      }
      if (pendingChanges.length > 0 && onBatchUpdateProductCategory) {
        const sanitizedChanges = pendingChanges.map((c) => ({
          ...c,
          categoryName: selectedCategory,
        }));
        onBatchUpdateProductCategory(sanitizedChanges);
      }
      if (editedName.trim() && editedName !== selectedCategory) {
        onEditCategory(selectedCategory, editedName.trim());
        if (reportData) reportData.categoryName = editedName.trim();
      }
      if (reportData) {
        setBatchReport(reportData);
      }
    } catch (err) {
      console.error('Error guardando categoría:', err);
    }
    handleCloseCategoryModal();
    setIsEditMode(false);
  };

  const handleAddProductToCategory = (product) => {
    const existingChangeIndex = pendingChanges.findIndex(
      (c) => c.productId === product.id && c.categoryName === selectedCategory
    );

    if (existingChangeIndex >= 0) {
      const newChanges = [...pendingChanges];
      newChanges.splice(existingChangeIndex, 1);
      setPendingChanges(newChanges);
    } else {
      setPendingChanges([
        ...pendingChanges,
        {
          productId: product.id,
          categoryName: selectedCategory,
          action: 'add',
        },
      ]);
    }
  };

  const handleRemoveProductFromCategory = (product) => {
    const existingChangeIndex = pendingChanges.findIndex(
      (c) => c.productId === product.id && c.categoryName === selectedCategory
    );

    if (existingChangeIndex >= 0) {
      const newChanges = [...pendingChanges];
      newChanges.splice(existingChangeIndex, 1);
      setPendingChanges(newChanges);
    } else {
      setPendingChanges([
        ...pendingChanges,
        {
          productId: product.id,
          categoryName: selectedCategory,
          action: 'remove',
        },
      ]);
    }
  };

  const hasUnsavedCategoryChanges =
    pendingChanges.length > 0 ||
    (editedName.trim() !== '' && editedName !== selectedCategory);

  // ============================================================================
  // LÓGICA DE OFERTAS
  // ============================================================================
  const filteredOffers = useMemo(() => {
    if (!offersSearch.trim()) return offers;
    return offers.filter(o => 
      o.name.toLowerCase().includes(offersSearch.toLowerCase()) || 
      o.type.toLowerCase().includes(offersSearch.toLowerCase())
    );
  }, [offers, offersSearch]);

  const availableProductsForOffer = useMemo(() => {
    if (!inventory) return [];
    const currentIds = offerForm.productsIncluded.map(p => p.id);
    let available = inventory.filter(p => !currentIds.includes(p.id));
    
    if (offerProductSearch.trim()) {
      available = available.filter(p => p.title.toLowerCase().includes(offerProductSearch.toLowerCase()));
    }
    return available;
  }, [inventory, offerForm.productsIncluded, offerProductSearch]);

  const openNewOfferModal = () => {
    setOfferForm(defaultOfferForm);
    setEditingOfferId(null);
    setOfferProductSearch('');
    setIsOfferModalOpen(true);
  };

  const openEditOfferModal = (offer) => {
    setOfferForm({
      name: offer.name || '',
      type: offer.type || '2x1',
      applyTo: offer.applyTo || 'Items',
      productsIncluded: offer.productsIncluded || [],
      itemsCount: offer.itemsCount || '',
      discountValue: offer.discountValue || '',
      offerPrice: offer.offerPrice || '',
      profitMargin: offer.profitMargin || ''
    });
    setEditingOfferId(offer.id);
    setOfferProductSearch('');
    setIsOfferModalOpen(true);
  };

  const closeOfferModal = () => {
    setIsOfferModalOpen(false);
    setOfferForm(defaultOfferForm);
    setEditingOfferId(null);
  };

  const handleAddProductToOffer = (product) => {
    setOfferForm(prev => ({
      ...prev,
      productsIncluded: [...prev.productsIncluded, { 
        id: product.id, 
        title: product.title, 
        price: product.price, 
        image: product.image 
      }]
    }));
  };

  const handleRemoveProductFromOffer = (productId) => {
    setOfferForm(prev => ({
      ...prev,
      productsIncluded: prev.productsIncluded.filter(p => p.id !== productId)
    }));
  };

  const handleSaveOffer = () => {
    if (!offerForm.name.trim()) return alert("Debe ingresar un nombre para la oferta.");
    if (offerForm.productsIncluded.length === 0 && offerForm.applyTo !== 'Seleccion') {
       if(!window.confirm("No has agregado ningún producto a esta oferta. ¿Deseas continuar?")) return;
    }

    if (editingOfferId) {
      if (onUpdateOffer) onUpdateOffer(editingOfferId, offerForm);
    } else {
      if (onAddOffer) onAddOffer(offerForm);
    }
    closeOfferModal();
  };

  const handleDeleteOfferClick = (id, name, e) => {
    e.stopPropagation(); 
    if (window.confirm(`¿Estás seguro de eliminar la oferta "${name}"?\nSe quitará de todos los productos aplicados.`)) {
      if (onDeleteOffer) onDeleteOffer(id);
    }
  };

  const isComboOrPack = ['Combo', 'Kit', 'Pack'].includes(offerForm.type);
  const suggestedOriginalPrice = offerForm.productsIncluded.reduce((acc, p) => acc + Number(p.price || 0), 0);


  // ============================================================================
  // LÓGICA DE PREMIOS
  // ============================================================================
  const isSearchTest = rewardsSearch.toLowerCase().includes('test');
  
  const filteredRewards = rewards.filter((r) => {
    if (isTestRecord(r) && !isSearchTest) return false;
    return r.title.toLowerCase().includes(rewardsSearch.toLowerCase());
  });

  const openCreateRewardModal = () => {
    setRewardModalMode('create');
    setRewardForm({
      id: null,
      title: '',
      description: '',
      pointsCost: '',
      type: 'product',
      discountAmount: '',
      stock: ''
    });
    setIsRewardModalOpen(true);
  };

  const openEditRewardModal = (reward) => {
    setRewardModalMode('edit');
    setRewardForm({
      id: reward.id,
      title: reward.title,
      description: reward.description || '',
      pointsCost: reward.pointsCost,
      type: reward.type,
      discountAmount: reward.discountAmount || '',
      stock: reward.stock || ''
    });
    setIsRewardModalOpen(true);
  };

  const handleSaveReward = (e) => {
    e.preventDefault();
    if (!rewardForm.title || !rewardForm.pointsCost) return;

    const payload = {
      ...rewardForm,
      pointsCost: Number(rewardForm.pointsCost),
      discountAmount: rewardForm.type === 'discount' ? Number(rewardForm.discountAmount) : 0,
      stock: rewardForm.type === 'product' ? Number(rewardForm.stock) : 0
    };

    if (rewardModalMode === 'create') {
      onAddReward(payload);
    } else {
      onUpdateReward(payload.id, payload);
    }
    setIsRewardModalOpen(false);
  };

  const handleDeleteRewardRequest = (reward) => {
    setRewardToDelete(reward);
    setIsDeleteRewardModalOpen(true);
  };

  const confirmDeleteReward = () => {
    if (rewardToDelete) {
      onDeleteReward(rewardToDelete.id);
      setIsDeleteRewardModalOpen(false);
      setRewardToDelete(null);
    }
  };


// ============================================================================
  // RENDERIZADO PRINCIPAL
  // ============================================================================
  return (
    <div className="w-full max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-8 flex flex-col h-full animate-in fade-in duration-300">
      
      {/* ========================================= */}
      {/* HEADER Y TABS ESTILO CARPETA (AFUERA) */}
      {/* ========================================= */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 relative z-10">
        
        {/* Título (Izquierda) */}
        <div className="flex items-center gap-4 pb-2 px-2">
          <div className="p-3 bg-slate-900 text-white rounded-xl shadow-md">
            <Gift size={28} />
          </div>
          <div>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight">Marketing y Extras</h2>
            <p className="text-sm font-medium text-slate-500">Gestiona catálogos, promociones y el sistema de premios.</p>
          </div>
        </div>

        {/* Tabs Estilo Carpeta (Derecha) */}
        <div className="flex gap-1 overflow-x-auto px-2 sm:px-0 items-end [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
          <button 
            onClick={() => setActiveTab('categories')}
            className={`px-6 py-3.5 rounded-t-xl font-bold text-sm transition-all border-t border-l border-r whitespace-nowrap ${
              activeTab === 'categories' 
                ? 'bg-white text-fuchsia-600 border-slate-200 relative top-[1px] z-20 pb-[15px]' 
                : 'bg-transparent text-slate-500 border-transparent hover:bg-slate-200/60 hover:text-slate-700 pb-3.5'
            }`}
          >
            Categorías
          </button>
          <button 
            onClick={() => setActiveTab('offers')}
            className={`px-6 py-3.5 rounded-t-xl font-bold text-sm transition-all border-t border-l border-r whitespace-nowrap ${
              activeTab === 'offers' 
                ? 'bg-white text-violet-600 border-slate-200 relative top-[1px] z-20 pb-[15px]' 
                : 'bg-transparent text-slate-500 border-transparent hover:bg-slate-200/60 hover:text-slate-700 pb-3.5'
            }`}
          >
            Ofertas y Combos
          </button>
          <button 
            onClick={() => setActiveTab('rewards')}
            className={`px-6 py-3.5 rounded-t-xl font-bold text-sm transition-all border-t border-l border-r whitespace-nowrap ${
              activeTab === 'rewards' 
                ? 'bg-white text-emerald-600 border-slate-200 relative top-[1px] z-20 pb-[15px]' 
                : 'bg-transparent text-slate-500 border-transparent hover:bg-slate-200/60 hover:text-slate-700 pb-3.5'
            }`}
          >
            Sistema de Premios
          </button>
        </div>
      </div>

      {/* ========================================= */}
      {/* CONTENEDOR BLANCO PRINCIPAL (LA CARPETA) */}
      {/* ========================================= */}
      <div className="bg-white border border-slate-200 rounded-xl sm:rounded-tr-none shadow-sm relative z-0 flex-1 flex flex-col p-4 sm:p-6 lg:p-8 min-h-[500px]">
        
        {/* VISTA DE CATEGORÍAS */}
        {activeTab === 'categories' && (
          <div className="animate-in fade-in slide-in-from-left-2 duration-300">
            <div className="flex gap-2 mb-6">
              <form onSubmit={handleSubmitCategory} className="flex-1 flex gap-2">
                <input
                  type="text"
                  placeholder="Nombre de la nueva categoría..."
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-fuchsia-500 outline-none font-medium text-sm transition-all bg-slate-50 focus:bg-white"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                />
                <button
                  type="submit"
                  className="bg-fuchsia-600 text-white px-5 py-2.5 rounded-lg font-bold hover:bg-fuchsia-700 flex items-center gap-2 shadow-sm transition-colors"
                >
                  <Plus size={18} strokeWidth={3} /> Agregar
                </button>
              </form>
              <button
                onClick={() => setIsEditMode(!isEditMode)}
                className={`px-4 py-2.5 rounded-lg font-bold flex items-center gap-2 transition-colors shadow-sm ${
                  isEditMode
                    ? 'bg-amber-500 text-white hover:bg-amber-600'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
                title={isEditMode ? 'Salir del modo edición' : 'Editar categorías'}
              >
                <Pencil size={16} strokeWidth={isEditMode ? 3 : 2} />
                {isEditMode ? 'Listo' : 'Editar Masivo'}
              </button>
            </div>

            {isEditMode && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-amber-700 text-sm font-medium">
                <Pencil size={16} className="shrink-0" />
                <span>
                  Modo edición activo. Haz clic en una categoría para renombrarla o ajustar sus productos.
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {categories.map((cat) => {
                const productCount = productsByCategory[cat]?.length || 0;

                return (
                  <div
                    key={cat}
                    onClick={() => handleSelectCategory(cat)}
                    className={`flex justify-between items-center p-4 border rounded-xl group transition-all ${
                      isEditMode
                        ? 'bg-amber-50/50 border-amber-200 cursor-pointer hover:bg-amber-100 hover:shadow-sm'
                        : 'bg-slate-50 hover:bg-white hover:shadow-sm border-slate-200'
                    }`}
                  >
                    <div className="flex flex-col gap-0.5 min-w-0 pr-2">
                      <span className="font-bold text-slate-800 text-base truncate">{cat}</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        {productCount} productos
                      </span>
                    </div>
                    {!isEditMode && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteCategory(cat);
                        }}
                        className="text-slate-300 hover:text-red-500 p-2 rounded-lg hover:bg-red-50 transition-colors shrink-0"
                        title="Eliminar categoría"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                    {isEditMode && <Pencil size={18} className="text-amber-500 shrink-0" />}
                  </div>
                );
              })}
            </div>

            {categories.length === 0 && (
              <div className="text-center py-16 flex flex-col items-center bg-slate-50 rounded-xl border border-dashed border-slate-200 mt-2">
                <Tag size={48} className="mb-4 text-slate-300" />
                <p className="font-bold text-slate-500 text-lg">No hay categorías registradas.</p>
                <p className="text-sm mt-1 text-slate-400">Crea una para empezar a organizar tu inventario.</p>
              </div>
            )}
          </div>
        )}

        {/* VISTA DE OFERTAS Y COMBOS */}
        {activeTab === 'offers' && (
          <div className="animate-in fade-in slide-in-from-right-2 duration-300">
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3 w-full">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input
                    type="text"
                    placeholder="Buscar oferta, combo o kit..."
                    className="w-full rounded-xl border border-gray-200 pl-10 p-2.5 bg-white focus:border-violet-500 focus:ring-2 focus:ring-violet-100 outline-none shadow-sm transition-all text-sm font-medium"
                    value={offersSearch}
                    onChange={(e) => setOffersSearch(e.target.value)}
                  />
                </div>
                <button
                  onClick={openNewOfferModal}
                  className="bg-violet-600 hover:bg-violet-700 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 font-bold shadow-lg transition-all active:scale-95 shrink-0"
                >
                  <Plus size={20} strokeWidth={3} />
                  <span className="hidden sm:inline">Nueva Oferta</span>
                </button>
              </div>
            </div>

            {filteredOffers.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredOffers.map((offer) => (
                  <div 
                    key={offer.id} 
                    className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all flex flex-col group overflow-hidden"
                  >
                    <div className="h-24 bg-slate-50 border-b border-gray-100 flex items-center justify-center relative">
                      <TicketPercent size={32} className="text-violet-400" />
                      <div className="absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide bg-violet-100 text-violet-700 border border-violet-200">
                        {offer.type}
                      </div>
                      {offer.applyTo === 'Seleccion' && (
                        <div className="absolute top-2 left-2 text-[9px] font-black px-1.5 py-0.5 rounded uppercase bg-amber-100 text-amber-700 border border-amber-200 shadow-sm">
                          Botón POS
                        </div>
                      )}
                    </div>
                    <div className="p-4 flex-1 flex flex-col">
                      <h3 className="font-bold text-gray-800 mb-1 truncate" title={offer.name}>{offer.name}</h3>
                      <div className="text-xs text-gray-500 mb-3 flex items-center gap-1.5">
                        <Package size={14} className="text-slate-400" />
                        {offer.productsIncluded.length} productos vinculados
                      </div>
                      <div className="space-y-2 mt-auto">
                        {offer.offerPrice > 0 && (
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-400 font-medium">Precio Final:</span>
                            <span className="font-bold text-emerald-600">${Number(offer.offerPrice).toLocaleString('es-AR')}</span>
                          </div>
                        )}
                        {offer.discountValue > 0 && (
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-400 font-medium">Descuento:</span>
                            <span className="font-bold text-emerald-600">-${Number(offer.discountValue).toLocaleString('es-AR')}</span>
                          </div>
                        )}
                        {(!offer.offerPrice && !offer.discountValue) && (
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-400 font-medium">Beneficio:</span>
                            <span className="font-bold text-violet-600">Promo Automática</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="p-3 border-t border-gray-100 bg-gray-50 flex gap-2 justify-end opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => openEditOfferModal(offer)}
                        className="p-2 text-gray-500 hover:text-violet-600 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-gray-200"
                        title="Editar"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={(e) => handleDeleteOfferClick(offer.id, offer.name, e)}
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
              <div className="text-center py-16 flex flex-col items-center bg-slate-50 rounded-xl border border-dashed border-gray-200 mt-2">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm border border-gray-100">
                  <TicketPercent size={32} className="text-slate-300" />
                </div>
                <p className="font-medium text-slate-500">No hay ofertas configuradas</p>
                <p className="text-sm mt-1 text-slate-400">Crea tu primer 2x1, Combo o descuento especial.</p>
              </div>
            )}
          </div>
        )}

        {/* VISTA DE PREMIOS */}
        {activeTab === 'rewards' && (
          <div className="animate-in fade-in slide-in-from-right-2 duration-300 relative">
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3 w-full">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input
                    type="text"
                    placeholder="Buscar premio..."
                    className="w-full rounded-xl border border-gray-200 pl-10 p-2.5 bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none shadow-sm transition-all text-sm font-medium"
                    value={rewardsSearch}
                    onChange={(e) => setRewardsSearch(e.target.value)}
                  />
                </div>
                <button
                  onClick={openCreateRewardModal}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 font-bold shadow-lg transition-all active:scale-95 shrink-0"
                >
                  <Plus size={20} strokeWidth={3} />
                  <span className="hidden sm:inline">Nuevo Premio</span>
                </button>
              </div>
            </div>

            {filteredRewards.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredRewards.map((reward) => (
                  <div key={reward.id} className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all flex flex-col group overflow-hidden">
                    <div className="h-24 bg-slate-50 border-b border-gray-100 flex items-center justify-center relative">
                      {reward.type === 'product' ? (
                        <Package size={32} className="text-blue-400" />
                      ) : (
                        <Tag size={32} className="text-emerald-400" />
                      )}
                      <div className={`absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide border ${
                        reward.type === 'product' ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200'
                      }`}>
                        {reward.type === 'product' ? 'Producto' : 'Descuento'}
                      </div>
                    </div>
                    <div className="p-4 flex-1 flex flex-col">
                      <h3 className="font-bold text-gray-800 mb-1 truncate" title={reward.title}>{reward.title}</h3>
                      <p className="text-xs text-gray-500 line-clamp-2 mb-3 flex-1" title={reward.description}>
                        {reward.description || 'Sin descripción'}
                      </p>
                      <div className="space-y-2 mt-auto">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-400 font-medium">Costo:</span>
                          <span className="font-bold text-emerald-600">{formatNumber(reward.pointsCost)} pts</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          {reward.type === 'product' ? (
                            <>
                              <span className="text-gray-400 font-medium">Stock:</span>
                              <span className="font-bold text-gray-700">{formatNumber(reward.stock)} u.</span>
                            </>
                          ) : (
                            <>
                              <span className="text-gray-400 font-medium">Valor:</span>
                              <span className="font-bold text-emerald-600">
                                <FancyPrice amount={reward.discountAmount} />
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="p-3 border-t border-gray-100 bg-gray-50 flex gap-2 justify-end opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => openEditRewardModal(reward)} 
                        className="p-2 text-gray-500 hover:text-blue-600 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-gray-200"
                        title="Editar"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={() => handleDeleteRewardRequest(reward)} 
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
              <div className="text-center py-16 flex flex-col items-center bg-slate-50 rounded-xl border border-dashed border-gray-200 mt-2">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm border border-gray-100">
                  <Gift size={32} className="text-slate-300" />
                </div>
                <p className="font-bold text-slate-500 text-lg">No hay premios configurados</p>
                <p className="text-sm mt-1 text-slate-400">Agrega uno nuevo para comenzar el catálogo de canjes.</p>
              </div>
            )}
          </div>
        )}

      </div>

      {/* ==================================================================================== */}
      {/* MODALES FLOTANTES GLOBALES */}
      {/* ==================================================================================== */}
      
      {/* 1. Modal Categoría (Edit) */}
      {selectedCategory && (
        <div
          className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[70] p-4 backdrop-blur-sm"
          onClick={handleCloseCategoryModal}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 bg-amber-50 border-b border-amber-100 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-lg text-amber-600">
                  <Tag size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Editando Categoría</h3>
                  <p className="text-[10px] font-medium text-amber-700/70 uppercase tracking-wider">{selectedCategory}</p>
                </div>
              </div>
              <button
                onClick={handleCloseCategoryModal}
                className="text-amber-400 hover:text-amber-700 bg-amber-100/50 hover:bg-amber-100 p-2 rounded-lg transition-colors"
              >
                <X size={18} strokeWidth={3} />
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
              <div>
                <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider block mb-2">
                  Nombre de la Categoría
                </label>
                <input
                  type="text"
                  className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 outline-none text-base font-bold text-slate-800 transition-all"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  autoFocus
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                  <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Package size={14} className="text-slate-400" />
                    Inventario Asignado
                    <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-[10px]">
                      {productsByCategory[selectedCategory]?.length || 0}
                    </span>
                  </label>
                  <button
                    onClick={() => setShowAddProducts(!showAddProducts)}
                    className={`text-[10px] font-black px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all uppercase tracking-wider ${
                      showAddProducts
                        ? 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200 shadow-sm'
                    }`}
                  >
                    {showAddProducts ? (
                      <><X size={12} strokeWidth={3} /> Cancelar</>
                    ) : (
                      <><Plus size={12} strokeWidth={3} /> Añadir Productos</>
                    )}
                  </button>
                </div>

                {showAddProducts && (
                  <div className="mb-4 p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl animate-in fade-in slide-in-from-top-2">
                    <div className="relative mb-3">
                      <Search
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400"
                      />
                      <input
                        type="text"
                        placeholder="Buscar producto en el catálogo..."
                        className="w-full pl-9 pr-3 py-2 text-xs font-medium border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
                      {filteredAvailableProducts.length > 0 ? (
                        filteredAvailableProducts
                          .slice(0, 20)
                          .map((product) => (
                            <div
                              key={product.id}
                              className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-slate-100 shadow-sm hover:border-indigo-300 hover:shadow transition-all group"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-[11px] font-bold text-slate-700 truncate">
                                  {product.title}
                                </span>
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider shrink-0 bg-slate-100 px-1.5 rounded">
                                  {Array.isArray(product.categories)
                                    ? product.categories[0]
                                    : product.category || 'Sin cat.'}
                                </span>
                              </div>
                              <button
                                onClick={() => handleAddProductToCategory(product)}
                                className="text-indigo-600 bg-indigo-50 hover:bg-indigo-600 hover:text-white p-1.5 rounded-md shrink-0 transition-colors"
                                title="Agregar a esta categoría"
                              >
                                <Plus size={14} strokeWidth={3} />
                              </button>
                            </div>
                          ))
                      ) : (
                        <p className="text-xs font-medium text-slate-400 text-center py-4">
                          {productSearch
                            ? 'No se encontraron productos'
                            : 'Todos los productos ya están en esta categoría'}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <div className="max-h-60 overflow-y-auto custom-scrollbar border border-slate-200 rounded-xl bg-slate-50/50">
                  {productsByCategory[selectedCategory]?.length > 0 ? (
                    <div className="divide-y divide-slate-100">
                      {productsByCategory[selectedCategory].map((product) => {
                        const isPendingAdd = pendingChanges.some(
                          (c) =>
                            c.productId === product.id &&
                            c.categoryName === selectedCategory &&
                            c.action === 'add'
                        );

                        return (
                          <div
                            key={product.id}
                            className={`flex items-center justify-between p-3 group transition-colors ${
                              isPendingAdd ? 'bg-emerald-50' : 'bg-white hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {product.image ? (
                                <img
                                  src={product.image}
                                  alt={product.title}
                                  className="w-9 h-9 rounded-md object-cover border border-slate-200 shadow-sm"
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                  }}
                                />
                              ) : (
                                <div className="w-9 h-9 bg-slate-100 border border-slate-200 rounded-md flex items-center justify-center shrink-0">
                                  <Package size={14} className="text-slate-400" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-800 truncate">
                                  {product.title}
                                </p>
                                <p className="text-[10px] font-medium text-slate-500">
                                  Stock físico: <span className="font-bold">{product.stock}</span>
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 pl-2">
                              {isPendingAdd && (
                                <span className="text-[9px] font-black uppercase tracking-wider text-emerald-600 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded">
                                  Añadido
                                </span>
                              )}
                              <button
                                onClick={() => handleRemoveProductFromCategory(product)}
                                className="text-slate-300 hover:text-red-600 bg-white hover:bg-red-50 border border-transparent hover:border-red-200 p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-all shadow-sm"
                                title="Quitar de la categoría"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-slate-400 text-xs font-medium">
                      Categoría vacía. Añade productos desde el botón superior.
                    </div>
                  )}
                </div>
              </div>

              {hasUnsavedCatChanges && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs font-bold text-amber-700 flex items-center gap-2 animate-pulse">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>
                    Falta guardar. {pendingChanges.length > 0 && `(${pendingChanges.length} productos modificados).`}
                  </span>
                </div>
              )}
            </div>

            <div className="p-5 border-t border-slate-200 bg-slate-50 flex gap-3 justify-end shrink-0">
              <button
                onClick={handleCloseCategoryModal}
                className="px-5 py-2.5 rounded-xl font-bold text-xs text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Descartar
              </button>
              <button
                onClick={handleSaveCategoryEdit}
                disabled={!hasUnsavedCatChanges}
                className="px-6 py-2.5 rounded-xl font-black text-xs bg-amber-500 text-white hover:bg-amber-600 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-amber-200 transition-all"
              >
                <Save size={16} strokeWidth={3} />
                Guardar Cambios
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Reporte de Edición de Categoría */}
      {batchReport && (
        <div
          className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[80] p-4 backdrop-blur-sm"
          onClick={() => setBatchReport(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-emerald-600 p-5 flex items-center gap-3 text-white">
              <div className="bg-white/20 p-2 rounded-xl">
                <CheckCircle size={24} strokeWidth={3} />
              </div>
              <div>
                <h3 className="font-black tracking-tight text-lg">Actualizado</h3>
                <p className="text-emerald-100 text-xs font-medium">
                  Se aplicaron los cambios masivos
                </p>
              </div>
            </div>

            <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
              <div className="mb-5">
                <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black mb-1.5">
                  Categoría Afectada
                </p>
                <p className="text-base font-black text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  {batchReport.categoryName}
                </p>
              </div>

              {batchReport.added.length > 0 && (
                <div className="mb-5">
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <PlusCircle size={14} strokeWidth={3} /> Productos Añadidos ({batchReport.added.length})
                  </p>
                  <ul className="text-xs font-bold space-y-1.5 bg-emerald-50 p-3 rounded-xl border border-emerald-100 text-emerald-900">
                    {batchReport.added.map((name, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-emerald-500 mt-0.5">•</span> {name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {batchReport.removed.length > 0 && (
                <div className="mb-2">
                  <p className="text-[10px] font-black text-red-600 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <MinusCircle size={14} strokeWidth={3} /> Productos Retirados ({batchReport.removed.length})
                  </p>
                  <ul className="text-xs font-bold space-y-1.5 bg-red-50 p-3 rounded-xl border border-red-100 text-red-900">
                    {batchReport.removed.map((name, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-red-500 mt-0.5">•</span> {name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50">
              <button
                onClick={() => setBatchReport(null)}
                className="w-full bg-slate-800 text-white py-3 rounded-xl font-black text-xs hover:bg-slate-900 transition-colors shadow-md shadow-slate-200"
              >
                Cerrar Resumen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Modal de Crear/Editar Ofertas */}
      {isOfferModalOpen && (
        <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center z-[70] p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[95vh] flex flex-col animate-in zoom-in-95 duration-200">
            
            {/* Header Modal Oferta */}
            <div className="p-5 bg-violet-700 border-b border-violet-800 flex justify-between items-center shrink-0 text-white">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-violet-600 rounded-lg shadow-inner">
                  <TicketPercent size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-base">{editingOfferId ? 'Editar Oferta/Combo' : 'Nueva Oferta Especial'}</h3>
                  <p className="text-[11px] font-medium text-violet-200">Configura reglas automáticas para el Punto de Venta.</p>
                </div>
              </div>
              <button
                onClick={closeOfferModal}
                className="text-violet-200 hover:text-white bg-violet-800/50 hover:bg-violet-800 p-2 rounded-lg transition-colors"
              >
                <X size={18} strokeWidth={3} />
              </button>
            </div>

            {/* Body Scrolleable */}
            <div className="p-6 space-y-6 overflow-y-auto flex-1 custom-scrollbar bg-slate-50/30">
              
              {/* Sección 1: Configuración Básica */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider block mb-1.5">Nombre Identificativo</label>
                  <input
                    type="text"
                    placeholder="Ej: Promo Finde, Combo Básico..."
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-violet-500 outline-none text-sm font-bold text-slate-800 bg-white"
                    value={offerForm.name}
                    onChange={(e) => setOfferForm({...offerForm, name: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider block mb-1.5">Tipo de Regla</label>
                  <select
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-violet-500 outline-none text-sm font-bold text-slate-800 bg-white cursor-pointer"
                    value={offerForm.type}
                    onChange={(e) => setOfferForm({...offerForm, type: e.target.value, applyTo: ['Combo','Kit','Pack'].includes(e.target.value) ? 'Seleccion' : 'Items'})}
                  >
                    <optgroup label="Promociones Automáticas">
                      <option value="2x1">2x1 (Lleva 2 paga 1)</option>
                      <option value="3x2">3x2 (Lleva 3 paga 2)</option>
                      <option value="4x3">4x3 (Lleva 4 paga 3)</option>
                    </optgroup>
                    <optgroup label="Armados Especiales (Botón POS)">
                      <option value="Combo">Combo Fijo</option>
                      <option value="Kit">Kit / Set</option>
                      <option value="Pack">Pack Armado</option>
                    </optgroup>
                    <optgroup label="Descuentos Directos">
                      <option value="Mayorista">Precio Mayorista (Requiere X cantidad)</option>
                      <option value="Descuento Unidad">Descuento por Unidad ($)</option>
                      <option value="Descuento Total">Descuento Total del Ticket ($)</option>
                    </optgroup>
                  </select>
                </div>
              </div>

              {/* Dependiendo del tipo, mostramos unos inputs u otros */}
              {isComboOrPack && (
                <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-black text-amber-800 uppercase tracking-wider block mb-1.5">Precio Final del Combo</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-600 font-bold">$</span>
                      <input
                        type="number"
                        placeholder="Ej: 1500"
                        className="w-full pl-8 pr-3 py-2 border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none text-sm font-black text-amber-900 bg-white"
                        value={offerForm.offerPrice}
                        onChange={(e) => setOfferForm({...offerForm, offerPrice: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col justify-center">
                    <p className="text-[10px] font-bold text-amber-700/70 uppercase">Precio Regular (Suma de Items):</p>
                    <p className="text-lg font-black text-amber-900 line-through decoration-red-500/50 decoration-2">${suggestedOriginalPrice.toLocaleString('es-AR')}</p>
                    {offerForm.offerPrice && Number(offerForm.offerPrice) < suggestedOriginalPrice && (
                       <p className="text-xs font-bold text-emerald-600 mt-0.5">Ahorro: ${(suggestedOriginalPrice - Number(offerForm.offerPrice)).toLocaleString('es-AR')}</p>
                    )}
                  </div>
                </div>
              )}

              {offerForm.type === 'Mayorista' && (
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-black text-blue-800 uppercase tracking-wider block mb-1.5">Cantidad Mínima</label>
                    <input
                      type="number"
                      placeholder="Ej: 10"
                      className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-black text-blue-900 bg-white"
                      value={offerForm.itemsCount}
                      onChange={(e) => setOfferForm({...offerForm, itemsCount: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-black text-blue-800 uppercase tracking-wider block mb-1.5">Precio Unitario Mayorista</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-600 font-bold">$</span>
                      <input
                        type="number"
                        placeholder="Ej: 800"
                        className="w-full pl-8 pr-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-black text-blue-900 bg-white"
                        value={offerForm.offerPrice}
                        onChange={(e) => setOfferForm({...offerForm, offerPrice: e.target.value})}
                      />
                    </div>
                  </div>
                </div>
              )}

              {(offerForm.type === 'Descuento Unidad' || offerForm.type === 'Descuento Total') && (
                <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200">
                  <label className="text-[11px] font-black text-emerald-800 uppercase tracking-wider block mb-1.5">Monto a descontar</label>
                  <div className="relative w-1/2">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-600 font-bold">$</span>
                    <input
                      type="number"
                      placeholder="Ej: 500"
                      className="w-full pl-8 pr-3 py-2 border border-emerald-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm font-black text-emerald-900 bg-white"
                      value={offerForm.discountValue}
                      onChange={(e) => setOfferForm({...offerForm, discountValue: e.target.value})}
                    />
                  </div>
                </div>
              )}


              {/* Sección 2: Productos Vinculados */}
              <div>
                <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-3 gap-2 border-b border-slate-200 pb-2">
                  <div>
                    <label className="text-[11px] font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <List size={14} className="text-violet-500" />
                      Productos Aplicables a la Regla
                    </label>
                    <p className="text-[10px] font-medium text-slate-500 mt-0.5">
                      {isComboOrPack ? 'Agrega los productos que componen este paquete exacto.' : 'Agrega los productos a los que se les aplicará esta promoción.'}
                    </p>
                  </div>
                  <span className="bg-violet-100 text-violet-700 px-2 py-1 rounded-lg text-xs font-black self-start sm:self-auto shrink-0">
                    {offerForm.productsIncluded.length} Seleccionados
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-64">
                  
                  {/* Buscador de Catálogo */}
                  <div className="flex flex-col border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm">
                    <div className="p-2 border-b border-slate-100 bg-slate-50">
                      <div className="relative">
                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Buscar en catálogo..."
                          className="w-full pl-8 pr-2 py-1.5 text-xs font-medium border border-slate-200 rounded-lg focus:border-violet-500 outline-none"
                          value={offerProductSearch}
                          onChange={(e) => setOfferProductSearch(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                      {availableProductsForOffer.length > 0 ? (
                        availableProductsForOffer.slice(0, 30).map(p => (
                          <div key={p.id} className="flex justify-between items-center p-2 rounded-lg hover:bg-violet-50 border border-transparent hover:border-violet-100 transition-colors group cursor-pointer" onClick={() => handleAddProductToOffer(p)}>
                            <div className="min-w-0 pr-2">
                              <p className="text-xs font-bold text-slate-700 truncate">{p.title}</p>
                              <p className="text-[9px] text-slate-400 font-medium">${p.price}</p>
                            </div>
                            <PlusCircle size={16} className="text-violet-400 group-hover:text-violet-600 shrink-0" />
                          </div>
                        ))
                      ) : (
                        <div className="h-full flex items-center justify-center text-xs text-slate-400 font-medium">Sin resultados</div>
                      )}
                    </div>
                  </div>

                  {/* Lista de Seleccionados */}
                  <div className="flex flex-col border-2 border-dashed border-violet-200 rounded-xl bg-violet-50/30 overflow-hidden">
                    <div className="p-2 border-b border-violet-100 bg-violet-50 flex items-center justify-center">
                      <span className="text-[10px] font-black text-violet-700 uppercase tracking-widest">Incluidos en la Oferta</span>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1.5">
                      {offerForm.productsIncluded.length > 0 ? (
                        offerForm.productsIncluded.map(p => (
                          <div key={p.id} className="flex justify-between items-center p-2 rounded-lg bg-white border border-slate-200 shadow-sm group">
                            <div className="min-w-0 pr-2">
                              <p className="text-xs font-bold text-slate-800 truncate">{p.title}</p>
                              {isComboOrPack && <p className="text-[9px] text-slate-400 font-bold">${p.price} (Precio Base)</p>}
                            </div>
                            <button 
                              onClick={() => handleRemoveProductFromOffer(p.id)}
                              className="text-slate-300 hover:text-red-500 p-1 bg-slate-50 hover:bg-red-50 rounded shrink-0 transition-colors"
                            >
                              <MinusCircle size={14} />
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-xs text-violet-400/60 font-medium p-4 text-center">
                          <Package size={24} className="mb-2 opacity-50" />
                          Haz clic en los productos de la izquierda para agregarlos a esta regla.
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              </div>
            </div>

            {/* Footer Modal Oferta */}
            <div className="p-5 border-t border-slate-200 bg-white flex justify-between items-center shrink-0">
              <span className="text-[10px] font-bold text-slate-400 uppercase">
                {editingOfferId ? 'Editando Registro Existente' : 'Creando Nuevo Registro'}
              </span>
              <div className="flex gap-3">
                <button
                  onClick={closeOfferModal}
                  className="px-5 py-2.5 rounded-xl font-bold text-xs text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveOffer}
                  className="px-6 py-2.5 rounded-xl font-black text-xs bg-violet-600 text-white hover:bg-violet-700 flex items-center gap-2 shadow-lg shadow-violet-200 transition-all"
                >
                  <Save size={16} strokeWidth={3} />
                  Guardar Oferta
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Modal de Crear/Editar Premio */}
      {isRewardModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-lg text-gray-800">
                {rewardModalMode === 'create' ? 'Nuevo Premio' : 'Editar Premio'}
              </h3>
              <button onClick={() => setIsRewardModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSaveReward} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nombre del Premio *</label>
                <input 
                  type="text" 
                  required 
                  className="w-full rounded-lg border border-gray-300 p-2.5 focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-100 outline-none font-medium" 
                  placeholder="Ej: Voucher $500, Coca Cola, etc." 
                  value={rewardForm.title} 
                  onChange={(e) => setRewardForm({...rewardForm, title: e.target.value})} 
                  autoFocus 
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tipo de Recompensa</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setRewardForm({...rewardForm, type: 'product'})}
                    className={`py-2 px-3 rounded-lg border flex items-center justify-center gap-2 text-sm font-bold transition-all ${
                      rewardForm.type === 'product' 
                        ? 'bg-blue-50 border-blue-200 text-blue-700 ring-1 ring-blue-300' 
                        : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    <Package size={16} /> Producto Físico
                  </button>
                  <button
                    type="button"
                    onClick={() => setRewardForm({...rewardForm, type: 'discount'})}
                    className={`py-2 px-3 rounded-lg border flex items-center justify-center gap-2 text-sm font-bold transition-all ${
                      rewardForm.type === 'discount' 
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700 ring-1 ring-emerald-300' 
                        : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    <Tag size={16} /> Descuento ($)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Costo en Puntos *</label>
                  <input 
                    type="number" 
                    min="1" 
                    required 
                    className="w-full rounded-lg border border-gray-300 p-2.5 focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-100 outline-none font-bold text-fuchsia-600" 
                    placeholder="0" 
                    value={rewardForm.pointsCost} 
                    onChange={(e) => setRewardForm({...rewardForm, pointsCost: e.target.value})} 
                  />
                </div>

                {rewardForm.type === 'product' ? (
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Stock Disponible</label>
                    <input 
                      type="number" 
                      min="0" 
                      className="w-full rounded-lg border border-gray-300 p-2.5 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" 
                      placeholder="Cantidad" 
                      value={rewardForm.stock} 
                      onChange={(e) => setRewardForm({...rewardForm, stock: e.target.value})} 
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
                      value={rewardForm.discountAmount} 
                      onChange={(e) => setRewardForm({...rewardForm, discountAmount: e.target.value})} 
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Descripción / Notas</label>
                <textarea 
                  rows="2" 
                  className="w-full rounded-lg border border-gray-300 p-2.5 focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-100 outline-none text-sm resize-none" 
                  placeholder="Detalles adicionales..." 
                  value={rewardForm.description} 
                  onChange={(e) => setRewardForm({...rewardForm, description: e.target.value})}
                ></textarea>
              </div>

              <div className="pt-2 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsRewardModalOpen(false)} 
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-bold transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="flex-1 px-4 py-2.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 font-bold shadow-md transition-colors flex justify-center items-center gap-2"
                >
                  <Save size={18} />
                  {rewardModalMode === 'create' ? 'Crear Premio' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Modal Confirmar Eliminación de Premio */}
      {isDeleteRewardModalOpen && (
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
                  onClick={() => setIsDeleteRewardModalOpen(false)} 
                  className="flex-1 py-2.5 border border-gray-300 rounded-lg font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={confirmDeleteReward} 
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