// src/views/CatalogManagerView.jsx
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
  ChevronDown
} from 'lucide-react';
import { FancyPrice } from '../components/FancyPrice'; // Asumo que tienes esto, si no, se mostrará el número crudo o usamos toLocaleString

export default function CatalogManagerView({
  categories,
  inventory,
  offers = [], // ✨ NUEVO: Array de ofertas
  onAddCategory,
  onDeleteCategory,
  onEditCategory,
  onBatchUpdateProductCategory,
  onAddOffer, // ✨ NUEVO: Handlers de ofertas
  onUpdateOffer,
  onDeleteOffer
}) {
  // --- SISTEMA DE PESTAÑAS ---
  const [activeTab, setActiveTab] = useState('categories'); // 'categories' | 'offers'

  // --- ESTADOS DE CATEGORÍAS ---
  const [newCategory, setNewCategory] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [editedName, setEditedName] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [showAddProducts, setShowAddProducts] = useState(false);

  const [pendingChanges, setPendingChanges] = useState([]);
  const [batchReport, setBatchReport] = useState(null);

  // --- ESTADOS DE OFERTAS ---
  const [offersSearch, setOffersSearch] = useState('');
  const [isOfferModalOpen, setIsOfferModalOpen] = useState(false);
  const [editingOfferId, setEditingOfferId] = useState(null);
  
  // Estado base para crear/editar una oferta
  const defaultOfferForm = {
    name: '',
    type: '2x1', // 2x1, 3x1, 3x2, 4x2, 4x3, Combo, Kit, Pack, Mayorista, Descuento Unidad, Descuento Total, Dia de X
    applyTo: 'Items', // Items, Cantidad, Seleccion
    productsIncluded: [], // [{ id, title, price, ... }]
    itemsCount: '',
    discountValue: '',
    offerPrice: '',
    profitMargin: ''
  };
  const [offerForm, setOfferForm] = useState(defaultOfferForm);
  const [offerProductSearch, setOfferProductSearch] = useState('');

  // --- LÓGICA DE CATEGORÍAS ---
  const handleCloseModal = () => {
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

  const handleSaveEdit = () => {
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
    handleCloseModal();
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

  const hasUnsavedChanges =
    pendingChanges.length > 0 ||
    (editedName.trim() !== '' && editedName !== selectedCategory);

  // --- LÓGICA DE OFERTAS ---

  const filteredOffers = useMemo(() => {
    if (!offersSearch.trim()) return offers;
    return offers.filter(o => 
      o.name.toLowerCase().includes(offersSearch.toLowerCase()) || 
      o.type.toLowerCase().includes(offersSearch.toLowerCase())
    );
  }, [offers, offersSearch]);

  const availableProductsForOffer = useMemo(() => {
    if (!inventory) return [];
    // Filtramos para no mostrar los que ya están en el form
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
    // Validaciones básicas
    if (!offerForm.name.trim()) return alert("Debe ingresar un nombre para la oferta.");
    if (offerForm.productsIncluded.length === 0 && offerForm.applyTo !== 'Seleccion') {
       // Si es un combo suelto que se vende desde el POS (Seleccion), puede que definamos los productos luego, 
       // pero por ahora exijamos al menos 1 producto para la mayoría de los casos.
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
    e.stopPropagation(); // Evita abrir el modal de edición
    if (window.confirm(`¿Estás seguro de eliminar la oferta "${name}"?\nSe quitará de todos los productos aplicados.`)) {
      if (onDeleteOffer) onDeleteOffer(id);
    }
  };

  // Determinar qué campos del formulario mostrar según el Tipo de Oferta
  const isComboOrPack = ['Combo', 'Kit', 'Pack'].includes(offerForm.type);
  const isMultiOffer = ['2x1', '3x1', '3x2', '4x2', '4x3'].includes(offerForm.type);
  const isDiscount = ['Descuento Unidad', 'Descuento Total', 'Mayorista'].includes(offerForm.type);

  // Calcular precio original sugerido para Combos basados en los productos incluidos
  const suggestedOriginalPrice = offerForm.productsIncluded.reduce((acc, p) => acc + Number(p.price || 0), 0);

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-xl shadow-sm border mt-6">
      
      {/* HEADER DUAL */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b pb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl transition-colors ${activeTab === 'categories' ? 'bg-fuchsia-100 text-fuchsia-600' : 'bg-violet-100 text-violet-600'}`}>
            {activeTab === 'categories' ? <Tag size={26} /> : <TicketPercent size={26} />}
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800 tracking-tight">
              Catálogo y Reglas
            </h2>
            <p className="text-sm font-medium text-slate-500">
              Gestiona agrupaciones y promociones especiales.
            </p>
          </div>
        </div>

        {/* SELECTOR DE PESTAÑAS */}
        <div className="flex p-1 bg-slate-100 rounded-lg shadow-inner shrink-0">
          <button 
            onClick={() => setActiveTab('categories')}
            className={`px-5 py-2 rounded-md font-bold text-sm transition-all ${activeTab === 'categories' ? 'bg-white text-fuchsia-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Categorías
          </button>
          <button 
            onClick={() => setActiveTab('offers')}
            className={`px-5 py-2 rounded-md font-bold text-sm transition-all ${activeTab === 'offers' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Ofertas y Combos
          </button>
        </div>
      </div>

      {/* ========================================= */}
      {/* VISTA DE CATEGORÍAS */}
      {/* ========================================= */}
      {activeTab === 'categories' && (
        <div className="animate-in fade-in slide-in-from-left-2 duration-300">
          <div className="flex gap-2 mb-4">
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
              <Pencil size={16} />
              <span>
                Modo edición activo. Haz clic en una categoría para renombrarla o ajustar sus productos.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {categories.map((cat) => {
              const productCount = productsByCategory[cat]?.length || 0;

              return (
                <div
                  key={cat}
                  onClick={() => handleSelectCategory(cat)}
                  className={`flex justify-between items-center p-3.5 border rounded-xl group transition-all ${
                    isEditMode
                      ? 'bg-amber-50/50 border-amber-200 cursor-pointer hover:bg-amber-100 hover:shadow-sm'
                      : 'bg-slate-50 hover:bg-white hover:shadow-sm border-slate-200'
                  }`}
                >
                  <div className="flex flex-col gap-0.5 min-w-0 pr-2">
                    <span className="font-bold text-slate-700 truncate">{cat}</span>
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
                      <Trash2 size={16} />
                    </button>
                  )}
                  {isEditMode && <Pencil size={16} className="text-amber-500 shrink-0" />}
                </div>
              );
            })}
          </div>

          {categories.length === 0 && (
            <div className="text-center py-12 text-slate-400 flex flex-col items-center bg-slate-50 rounded-xl border border-dashed border-slate-200 mt-2">
              <Tag size={40} className="mb-3 text-slate-300" />
              <p className="font-bold">No hay categorías registradas.</p>
              <p className="text-xs mt-1">Crea una para empezar a organizar tu inventario.</p>
            </div>
          )}
        </div>
      )}

      {/* ========================================= */}
      {/* VISTA DE OFERTAS Y COMBOS */}
      {/* ========================================= */}
      {activeTab === 'offers' && (
        <div className="animate-in fade-in slide-in-from-right-2 duration-300">
          <div className="flex gap-2 mb-4">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar oferta, combo o kit..."
                className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-violet-500 outline-none font-medium text-sm transition-all bg-slate-50 focus:bg-white"
                value={offersSearch}
                onChange={(e) => setOffersSearch(e.target.value)}
              />
            </div>
            <button
              onClick={openNewOfferModal}
              className="bg-violet-600 text-white px-5 py-2.5 rounded-lg font-bold hover:bg-violet-700 flex items-center gap-2 shadow-sm transition-colors"
            >
              <Plus size={18} strokeWidth={3} /> Nueva Oferta
            </button>
          </div>

          {filteredOffers.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredOffers.map((offer) => (
                <div 
                  key={offer.id} 
                  onClick={() => openEditOfferModal(offer)}
                  className="bg-white border border-slate-200 rounded-xl p-4 hover:border-violet-300 hover:shadow-md transition-all cursor-pointer group flex flex-col gap-3 relative overflow-hidden"
                >
                  <div className="absolute top-0 left-0 w-1 h-full bg-violet-400 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  
                  <div className="flex justify-between items-start">
                    <div className="min-w-0 pr-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="bg-violet-100 text-violet-700 text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider">
                          {offer.type}
                        </span>
                        {offer.applyTo === 'Seleccion' && (
                          <span className="bg-amber-100 text-amber-700 text-[9px] font-black px-1.5 py-0.5 rounded uppercase">Botón POS</span>
                        )}
                      </div>
                      <h3 className="font-bold text-slate-800 text-base truncate">{offer.name}</h3>
                    </div>
                    <button 
                      onClick={(e) => handleDeleteOfferClick(offer.id, offer.name, e)}
                      className="text-slate-300 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors shrink-0"
                      title="Eliminar Oferta"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div className="flex justify-between items-end mt-auto pt-2 border-t border-slate-100">
                    <div className="text-[11px] font-medium text-slate-500 flex items-center gap-1.5">
                      <Package size={12} />
                      {offer.productsIncluded.length} productos vinculados
                    </div>
                    
                    {offer.offerPrice > 0 && (
                      <div className="text-right">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block leading-none">Precio Final</span>
                        <span className="text-sm font-black text-emerald-600">${Number(offer.offerPrice).toLocaleString('es-AR')}</span>
                      </div>
                    )}
                    {offer.discountValue > 0 && (
                      <div className="text-right">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block leading-none">Descuento</span>
                        <span className="text-sm font-black text-emerald-600">-${Number(offer.discountValue).toLocaleString('es-AR')}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 flex flex-col items-center bg-violet-50/50 rounded-xl border border-dashed border-violet-200 mt-2">
              <TicketPercent size={48} className="mb-4 text-violet-300" />
              <h3 className="font-black text-violet-800 text-lg mb-1">Módulo de Ofertas Vacío</h3>
              <p className="text-sm font-medium text-violet-600/70 max-w-md">
                No tienes ninguna oferta configurada. Crea tu primer 2x1, Combo o descuento especial para aplicarlo en el Punto de Venta.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ========================================= */}
      {/* MODALES DE CATEGORÍA (Mantenidos) */}
      {/* ========================================= */}
      
      {selectedCategory && (
        <div
          className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[70] p-4 backdrop-blur-sm"
          onClick={handleCloseModal}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
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
                onClick={handleCloseModal}
                className="text-amber-400 hover:text-amber-700 bg-amber-100/50 hover:bg-amber-100 p-2 rounded-lg transition-colors"
              >
                <X size={18} strokeWidth={3} />
              </button>
            </div>

            {/* Contenido scrolleable */}
            <div className="p-6 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
              {/* Nombre de la categoría */}
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

              {/* Productos en esta categoría */}
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

                {/* Panel para agregar productos */}
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
                                onClick={() =>
                                  handleAddProductToCategory(product)
                                }
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

                {/* Lista de productos actuales */}
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
                                  <Package
                                    size={14}
                                    className="text-slate-400"
                                  />
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
                                onClick={() =>
                                  handleRemoveProductFromCategory(product)
                                }
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

              {/* Aviso si hay cambios pendientes */}
              {hasUnsavedChanges && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs font-bold text-amber-700 flex items-center gap-2 animate-pulse">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>
                    Falta guardar. {pendingChanges.length > 0 && `(${pendingChanges.length} productos modificados).`}
                  </span>
                </div>
              )}
            </div>

            {/* Footer con botones */}
            <div className="p-5 border-t border-slate-200 bg-slate-50 flex gap-3 justify-end shrink-0">
              <button
                onClick={handleCloseModal}
                className="px-5 py-2.5 rounded-xl font-bold text-xs text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Descartar
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={!hasUnsavedChanges}
                className="px-6 py-2.5 rounded-xl font-black text-xs bg-amber-500 text-white hover:bg-amber-600 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-amber-200 transition-all"
              >
                <Save size={16} strokeWidth={3} />
                Guardar Cambios
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================= */}
      {/* MODAL DE CREACIÓN/EDICIÓN DE OFERTAS (NUEVO) */}
      {/* ========================================= */}
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

      {/* Modal de Reporte de Resultados Categorías */}
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
    </div>
  );
}