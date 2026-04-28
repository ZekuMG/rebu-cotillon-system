// src/views/InventoryView.jsx
import React, { useState, useEffect } from 'react';
import {
  Search,
  Plus,
  Filter,
  Package,
  X,
  DollarSign,
  BarChart3,
  ScanBarcode,
  Edit,
  Trash2,
  AlertTriangle,
  SlidersHorizontal,
  LayoutGrid,
  List,
  Scale,
  PackageX,
  CalendarClock,
  CalendarX, // ✨ NUEVO ICONO
  ArrowDownUp // ✨ AÑADIDO PARA ORDENAR
} from 'lucide-react';
// ♻️ FIX: Importamos FancyPrice junto con helpers
import { formatStock, formatNumber } from '../utils/helpers';
import { hasPermission } from '../utils/userPermissions';
import { FancyPrice } from '../components/FancyPrice';

const INVENTORY_BATCH_SIZE = 50;

// ✨ HELPER: Verifica si la fecha es menor a 14 días o ya pasó
const getExpirationInfo = (dateString) => {
  if (!dateString) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [year, month, day] = dateString.split('-');
  const expDate = new Date(year, month - 1, day);
  expDate.setHours(0, 0, 0, 0);
  const diffTime = expDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const isExpired = diffDays < 0;
  const isExpiringSoon = diffDays >= 0 && diffDays <= 14;

  if (isExpired) {
    return { daysUntil: diffDays, isExpired: true, isExpiringSoon: false, isAlert: true, label: 'Vencido' };
  }

  if (isExpiringSoon) {
    const label = diffDays === 0
      ? 'Vence hoy'
      : `Por vencer en ${diffDays} d\u00eda${diffDays === 1 ? '' : 's'}`;
    return { daysUntil: diffDays, isExpired: false, isExpiringSoon: true, isAlert: true, label };
  }

  return { daysUntil: diffDays, isExpired: false, isExpiringSoon: false, isAlert: false, label: null };
};

const isExpiringSoon = (dateString) => {
  const expirationInfo = getExpirationInfo(dateString);
  return Boolean(expirationInfo?.isAlert);
};

export default function InventoryView({
  inventory, categories, inventorySearch, setInventorySearch,
  inventoryCategoryFilter, setInventoryCategoryFilter,
  setIsModalOpen, setEditingProduct, handleDeleteProduct,
  inventoryViewMode, setInventoryViewMode, gridColumns, setGridColumns,
  currentUser,
  closeDetailsToken,
  navigationRequest,
}) {
  const [selectedProduct, setSelectedProduct] = useState(null); 
  const [showGridMenu, setShowGridMenu] = useState(false);
  const canCreateProducts = hasPermission(currentUser, 'inventory.create');
  const canEditProducts = hasPermission(currentUser, 'inventory.edit');
  const canDeleteProducts = hasPermission(currentUser, 'inventory.delete');
  const hasInventoryWriteAccess = canEditProducts || canDeleteProducts;
  
  // ✨ ESTADOS DE FILTROS RÁPIDOS
  const [showOnlyOutOfStock, setShowOnlyOutOfStock] = useState(false);
  const [showOnlyExpirations, setShowOnlyExpirations] = useState(false);
  
  const [sortBy, setSortBy] = useState('title-asc'); // ✨ ESTADO PARA EL ORDEN

  const [visibleCount, setVisibleCount] = useState(INVENTORY_BATCH_SIZE);

  // ✨ EFECTO "PUENTE": Atrapa la orden del Dashboard y activa los botones
  useEffect(() => {
    if (inventorySearch === 'AGOTADOS' || inventorySearch === 'SIN STOCK') {
      setShowOnlyOutOfStock(true);
      setShowOnlyExpirations(false);
      setInventorySearch(''); // Borramos la palabra del buscador
    } else if (inventorySearch === 'VENCIMIENTOS') {
      setShowOnlyExpirations(true);
      setShowOnlyOutOfStock(false);
      setInventorySearch(''); // Borramos la palabra del buscador
    } else {
      // Si el usuario busca algo normal, reseteamos la carga visible al primer lote
      setVisibleCount(INVENTORY_BATCH_SIZE);
    }
  }, [inventorySearch, setInventorySearch]);

  useEffect(() => {
    if (closeDetailsToken > 0) {
      setSelectedProduct(null);
    }
  }, [closeDetailsToken]);

  useEffect(() => {
    if (!navigationRequest?.token) return;

    if (navigationRequest.mode === 'out_of_stock') {
      setShowOnlyOutOfStock(true);
      setShowOnlyExpirations(false);
    } else if (navigationRequest.mode === 'expirations') {
      setShowOnlyExpirations(true);
      setShowOnlyOutOfStock(false);
    } else {
      setShowOnlyOutOfStock(false);
      setShowOnlyExpirations(false);
    }

    if (navigationRequest.productId !== undefined && navigationRequest.productId !== null) {
      const matchedProduct = (inventory || []).find((product) => String(product.id) === String(navigationRequest.productId));
      setSelectedProduct(matchedProduct || null);
    } else if (navigationRequest.searchQuery) {
      const normalizedQuery = String(navigationRequest.searchQuery).trim().toLowerCase();
      const matchedProduct = (inventory || []).find((product) => String(product.title || '').trim().toLowerCase() === normalizedQuery);
      setSelectedProduct(matchedProduct || null);
    } else {
      setSelectedProduct(null);
    }

    setVisibleCount(INVENTORY_BATCH_SIZE);
  }, [navigationRequest, inventory]);

  const filteredInventory = (inventory || []).filter((item) => {
    const searchString = (inventorySearch || '').toLowerCase().trim();
    const searchWords = searchString ? searchString.split(/\s+/) : [];

    const matchesSearch = searchWords.length === 0 || searchWords.every(word =>
      (item.title || '').toLowerCase().includes(word) ||
      String(item.id).toLowerCase().includes(word) ||
      (item.barcode && String(item.barcode).toLowerCase().includes(word))
    );

    const matchesCategory =
      inventoryCategoryFilter === 'Todas' ||
      (Array.isArray(item.categories)
        ? item.categories.includes(inventoryCategoryFilter)
        : item.category === inventoryCategoryFilter);
    
    // ✨ APLICAMOS LOS FILTROS DE BOTONES
    const matchesStock = showOnlyOutOfStock ? (Number(item.stock) <= 0) : true;
    const matchesExpiration = showOnlyExpirations ? isExpiringSoon(item.expiration_date) : true;
        
    return matchesSearch && matchesCategory && matchesStock && matchesExpiration;
  });

  // ✨ LÓGICA DE ORDENAMIENTO APLICADA SOBRE LOS FILTRADOS
  const sortedInventory = [...filteredInventory].sort((a, b) => {
    switch (sortBy) {
      case 'recent': {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA; // Ordena de más nuevo a más viejo
      }
      case 'price-desc':
        return (Number(b.price) || 0) - (Number(a.price) || 0);
      case 'price-asc':
        return (Number(a.price) || 0) - (Number(b.price) || 0);
      case 'stock-desc':
        return (Number(b.stock) || 0) - (Number(a.stock) || 0);
      case 'title-asc':
      default:
        return (a.title || '').localeCompare(b.title || '');
    }
  });

  const handleScroll = (e) => {
    const { scrollTop, clientHeight, scrollHeight } = e.target;
    if (scrollHeight - scrollTop <= clientHeight + 400) {
      if (visibleCount < sortedInventory.length) {
        setVisibleCount((prev) => prev + INVENTORY_BATCH_SIZE);
      }
    }
  };

  const displayedInventory = sortedInventory.slice(0, visibleCount);
  const totalInventoryCount = (inventory || []).length;
  const visibleInventoryCount = filteredInventory.length;

  const handleCardClick = (product) => {
    if (selectedProduct && selectedProduct.id === product.id) {
        setSelectedProduct(null);
    } else {
        setSelectedProduct(product);
    }
  };

  const getStockColorClass = (product) => {
    const stock = Number(product.stock) || 0;
    const isWeight = product.product_type === 'weight';
    if (stock <= 0) return 'text-slate-400';
    if (isWeight) {
      if (stock <= 100) return 'text-red-600';
      if (stock <= 500) return 'text-amber-600';
      return 'text-green-600';
    }
    if (stock <= 5) return 'text-red-600';
    if (stock <= 10) return 'text-amber-600';
    return 'text-green-600';
  };

  const isOutOfStock = (product) => Number(product.stock) <= 0;

  return (
    <div className="flex h-full overflow-hidden bg-slate-100">
      
      {/* COLUMNA IZQUIERDA */}
      <div className="flex-1 flex flex-col min-w-0 transition-all duration-300">
        
        {/* Header */}
        <div className="p-4 bg-white border-b shrink-0 flex flex-wrap gap-3 justify-between items-center z-30 relative">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input type="text" placeholder="Buscar producto..." className="w-full pl-10 pr-4 py-2 border rounded-lg bg-slate-50 focus:bg-white focus:ring-2 focus:ring-fuchsia-500 outline-none transition-all" value={inventorySearch} onChange={(e) => setInventorySearch(e.target.value)} />
            </div>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <select className="pl-9 pr-8 py-2 border rounded-lg bg-slate-50 text-sm focus:ring-2 focus:ring-fuchsia-500 outline-none appearance-none cursor-pointer" value={inventoryCategoryFilter} onChange={(e) => setInventoryCategoryFilter(e.target.value)}>
                <option value="Todas">Todas</option>
                {categories.map((cat) => (<option key={cat} value={cat}>{cat}</option>))}
              </select>
            </div>

            {/* ✨ DROPDOWN: ORDENAR POR */}
            <div className="relative hidden md:block">
              <ArrowDownUp className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <select 
                className="pl-9 pr-8 py-2 border rounded-lg bg-slate-50 text-sm font-bold text-slate-600 focus:ring-2 focus:ring-fuchsia-500 outline-none appearance-none cursor-pointer" 
                value={sortBy} 
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="title-asc">A-Z (Alfabético)</option>
                <option value="recent">⭐ Más Recientes</option>
                <option value="price-desc">Mayor Precio</option>
                <option value="price-asc">Menor Precio</option>
                <option value="stock-desc">Mayor Stock</option>
              </select>
            </div>

            {/* ✨ BOTÓN: SIN STOCK */}
            <button
              onClick={() => { setShowOnlyOutOfStock(!showOnlyOutOfStock); setShowOnlyExpirations(false); }}
              title="Mostrar solo productos agotados"
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-bold transition-all ${
                showOnlyOutOfStock 
                  ? 'bg-red-50 border-red-200 text-red-600 shadow-inner' 
                  : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`}
            >
              <PackageX size={16} className={showOnlyOutOfStock ? 'text-red-500' : 'text-slate-400'} />
              <span className="hidden sm:inline">Sin Stock</span>
            </button>

            {/* ✨ BOTÓN: VENCIMIENTOS */}
            <button
              onClick={() => { setShowOnlyExpirations(!showOnlyExpirations); setShowOnlyOutOfStock(false); }}
              title="Mostrar próximos a vencer y vencidos"
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-bold transition-all ${
                showOnlyExpirations 
                  ? 'bg-orange-50 border-orange-200 text-orange-600 shadow-inner' 
                  : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`}
            >
              <CalendarX size={16} className={showOnlyExpirations ? 'text-orange-500' : 'text-slate-400'} />
              <span className="hidden sm:inline">Vencimientos</span>
            </button>

          </div>

          <div className="flex items-center gap-3">
            {inventoryViewMode === 'grid' && (
              <div className="relative">
                <button onClick={() => setShowGridMenu(!showGridMenu)} className={`p-2 rounded-lg border transition-all ${showGridMenu ? 'bg-slate-100 ring-2 ring-slate-200' : 'bg-white hover:bg-slate-50'}`} title="Ajustar tamaño"><SlidersHorizontal size={20} className="text-slate-600" /></button>
                {showGridMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowGridMenu(false)}></div>
                    <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200 p-4 z-50 animate-in fade-in zoom-in-95">
                      <div className="flex justify-between items-center mb-3"><span className="text-xs font-bold text-slate-500 uppercase">Tamaño</span><span className="text-xs font-bold text-fuchsia-600 bg-fuchsia-50 px-2 py-0.5 rounded-full border border-fuchsia-100">{gridColumns} columnas</span></div>
                      <div className="relative h-6 flex items-center"><input type="range" min="4" max="10" step="1" value={gridColumns} onChange={(e) => setGridColumns(Number(e.target.value))} className="custom-range w-full" /></div>
                      <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono"><span>Grande (4x)</span><span>Pequeño (10x)</span></div>
                    </div>
                  </>
                )}
              </div>
            )}
            <div className="flex bg-slate-100 p-1 rounded-lg border">
              <button onClick={() => setInventoryViewMode('grid')} className={`p-1.5 rounded-md transition-all ${inventoryViewMode === 'grid' ? 'bg-white text-fuchsia-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`} title="Vista Cuadrícula"><LayoutGrid size={18} /></button>
              <button onClick={() => setInventoryViewMode('list')} className={`p-1.5 rounded-md transition-all ${inventoryViewMode === 'list' ? 'bg-white text-fuchsia-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`} title="Vista Lista"><List size={18} /></button>
            </div>
            <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg border bg-slate-50 text-slate-600 shrink-0">
              <Package size={16} className="text-fuchsia-500" />
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Productos</span>
              <span className="text-sm font-extrabold text-slate-800">{formatNumber(visibleInventoryCount)}</span>
              {visibleInventoryCount !== totalInventoryCount && (
                <span className="text-[10px] font-semibold text-slate-400">de {formatNumber(totalInventoryCount)}</span>
              )}
            </div>
            {canCreateProducts && (
              <button onClick={() => setIsModalOpen(true)} className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors shadow-lg shadow-slate-900/20"><Plus size={18} /> <span className="hidden sm:inline">Nuevo</span></button>
            )}
          </div>
        </div>

        {/* Contenedor con onScroll */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar" onScroll={handleScroll}>
          {filteredInventory.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
              {showOnlyOutOfStock || showOnlyExpirations ? (
                <>
                  <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mb-4">
                    <CalendarX size={32} className="text-green-500" />
                  </div>
                  <p className="text-lg font-bold text-slate-600">¡Todo en orden!</p>
                  <p className="text-sm">No tienes productos en esta categoría de alerta.</p>
                </>
              ) : (
                <>
                  <Package size={64} className="mb-4 text-slate-300" />
                  <p className="text-lg font-medium">No se encontraron productos</p>
                  <p className="text-sm">Intenta con otra búsqueda o categoría</p>
                </>
              )}
            </div>
          ) : (
            <>
              {/* VISTA GRID */}
              {inventoryViewMode === 'grid' ? (
                <div className="grid gap-3 transition-all duration-300" style={{ gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))` }}>
                  {displayedInventory.map((product) => {
                    const isSelected = selectedProduct?.id === product.id;
                    const stockColor = getStockColorClass(product);
                    const outOfStock = isOutOfStock(product);
                    const isWeight = product.product_type === 'weight';
                    const expirationInfo = getExpirationInfo(product.expiration_date);
                    const hasExpirationAlert = Boolean(expirationInfo?.isAlert);
                    const isExpired = Boolean(expirationInfo?.isExpired);
                    const productImage = product.imageThumb || product.image_thumb || product.image;

                    return (
                      <div key={product.id} onClick={() => handleCardClick(product)} className={`bg-white rounded-xl border overflow-hidden flex flex-col cursor-pointer transition-all hover:shadow-lg group relative ${isSelected ? 'ring-2 ring-fuchsia-500 border-fuchsia-500 transform scale-[0.98]' : 'hover:border-fuchsia-200'} ${outOfStock ? 'grayscale opacity-75' : ''} ${hasExpirationAlert && !outOfStock ? (isExpired ? 'border-red-300 bg-red-50/30' : 'border-amber-200 bg-amber-50/30') : ''}`}>
                        <div className="aspect-square bg-slate-50 relative overflow-hidden">
                          {productImage ? (
                            <img src={productImage} alt={product.title} loading="lazy" decoding="async" fetchpriority="low" className="w-full h-full object-cover transition-transform group-hover:scale-110 duration-500" />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-200/50 p-2 text-center group-hover:bg-slate-200 transition-colors">
                              <span className={`font-bold text-slate-500 uppercase leading-tight ${gridColumns > 6 ? 'text-[10px]' : 'text-xs'}`}>{product.title}</span>
                            </div>
                          )}
                          
                          {hasExpirationAlert && !outOfStock && (
                            <div className={`absolute top-1 right-1 max-w-[calc(100%-0.5rem)] rounded-md border px-1.5 py-0.5 text-[9px] font-black shadow-sm flex items-center gap-1 z-20 truncate ${isExpired ? 'bg-red-100 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`} title={expirationInfo.label}>
                              {isExpired ? <CalendarX size={9} /> : <CalendarClock size={9} />}
                              <span className="truncate">{expirationInfo.label}</span>
                            </div>
                          )}

                          {outOfStock && (
                            <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center z-10">
                                <span className="bg-slate-800 text-white text-[10px] font-bold px-2 py-1 rounded shadow-sm border border-slate-600">AGOTADO</span>
                            </div>
                          )}
                          
                          {!outOfStock && !hasExpirationAlert && ((isWeight && product.stock <= 200) || (!isWeight && product.stock <= 5)) && (
                            <div className={`absolute top-1 right-1 bg-red-500 text-white font-bold rounded-full shadow-sm flex items-center justify-center z-20 ${gridColumns > 6 ? 'w-3 h-3 p-0' : 'px-2 py-0.5 text-[10px] gap-1'}`}>
                              {gridColumns > 6 ? '' : <AlertTriangle size={10} />}
                              {gridColumns > 6 ? '' : 'BAJO'}
                            </div>
                          )}
                          
                          {isWeight && (
                            <div className={`absolute top-1 left-1 bg-amber-500 text-white font-bold rounded shadow-sm flex items-center gap-0.5 z-20 ${gridColumns > 7 ? 'px-1 py-0.5' : 'px-1.5 py-0.5 text-[9px]'}`}>
                              <Scale size={gridColumns > 7 ? 7 : 9} />
                              {gridColumns <= 7 && 'PESO'}
                            </div>
                          )}
                        </div>
                        
                        <div className={`flex-1 flex flex-col z-20 bg-white ${gridColumns > 7 ? 'p-1.5' : 'p-3'}`}>
                          {gridColumns <= 7 && (
                            <div className="mb-1">
                              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider truncate block">
                                {Array.isArray(product.categories) ? product.categories[0] : product.category || 'Gral'}
                              </span>
                            </div>
                          )}
                          <h3 className={`font-bold leading-tight mb-1 flex-1 ${gridColumns > 7 ? 'text-[10px] line-clamp-1' : 'text-sm line-clamp-2'} ${isExpired ? 'text-red-700' : 'text-slate-800'}`}>{product.title}</h3>
                          <div className={`flex justify-between items-end mt-auto ${gridColumns > 7 ? 'pt-1' : 'pt-2 border-t border-slate-100'}`}>
                            <div>
                              {gridColumns <= 6 && <p className="text-[10px] text-slate-400">Precio</p>}
                              <p className={`font-bold text-slate-900 ${gridColumns > 7 ? 'text-xs' : 'text-lg'}`}>
                                <FancyPrice amount={isWeight ? product.price * 1000 : product.price} />
                                {isWeight && <span className="text-[9px] font-medium text-slate-400">/kg</span>}
                              </p>
                            </div>
                            {gridColumns <= 8 && (
                              <div className="text-right">
                                {gridColumns <= 6 && <p className="text-[10px] text-slate-400">Stock</p>}
                                <p className={`font-bold ${stockColor} ${gridColumns > 7 ? 'text-xs' : 'text-sm'}`}>
                                  {formatStock(product)}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* VISTA LISTA */
                <div className="flex flex-col gap-2">
                  {displayedInventory.map((product) => {
                    const isSelected = selectedProduct?.id === product.id;
                    const stockColor = getStockColorClass(product);
                    const outOfStock = isOutOfStock(product);
                    const isWeight = product.product_type === 'weight';
                    const expirationInfo = getExpirationInfo(product.expiration_date);
                    const hasExpirationAlert = Boolean(expirationInfo?.isAlert);
                    const isExpired = Boolean(expirationInfo?.isExpired);
                    const productImage = product.imageThumb || product.image_thumb || product.image;

                    return (
                      <div key={product.id} onClick={() => handleCardClick(product)} className={`bg-white rounded-lg border p-3 flex items-center gap-4 cursor-pointer transition-all hover:shadow-md relative ${isSelected ? 'ring-2 ring-fuchsia-500 border-fuchsia-500 bg-fuchsia-50' : 'hover:border-fuchsia-200'} ${outOfStock ? 'grayscale opacity-75' : ''} ${hasExpirationAlert && !outOfStock ? (isExpired ? 'bg-red-50/40 border-red-200' : 'bg-amber-50/50 border-amber-200') : ''}`}>
                        {hasExpirationAlert && !outOfStock && (
                          <div className={`absolute -top-2 right-3 max-w-[180px] rounded-md border px-1.5 py-0.5 text-[9px] font-black shadow-sm flex items-center gap-1 z-20 truncate ${isExpired ? 'bg-red-100 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`} title={expirationInfo.label}>
                            {isExpired ? <CalendarX size={9} /> : <CalendarClock size={9} />}
                            <span className="truncate">{expirationInfo.label}</span>
                          </div>
                        )}
                        <div className="w-12 h-12 rounded-md bg-slate-100 flex items-center justify-center overflow-hidden shrink-0 border relative">
                          {productImage ? (
                            <img src={productImage} alt="" loading="lazy" decoding="async" fetchpriority="low" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-slate-200 text-[8px] font-bold text-center text-slate-500 leading-none p-1">{product.title.slice(0,10)}...</div>
                          )}
                          {outOfStock && (<div className="absolute inset-0 bg-white/60 flex items-center justify-center z-10"><X size={16} className="text-red-500"/></div>)}
                          {isExpired && !outOfStock && (
                            <div className="absolute inset-0 bg-red-600/15 flex items-center justify-center backdrop-blur-[1px] z-10 pointer-events-none">
                               <CalendarX size={16} className="text-red-600 drop-shadow-md" />
                            </div>
                          )}
                          {isWeight && !outOfStock && (<div className="absolute bottom-0 right-0 bg-amber-500 rounded-tl px-0.5 py-0.5 z-20"><Scale size={7} className="text-white" /></div>)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className={`font-bold truncate ${hasExpirationAlert ? 'pr-28' : ''} ${isExpired ? 'text-red-700' : 'text-slate-800'}`}>
                             {product.title}
                          </h4>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-500 font-bold border border-slate-200">
                                {Array.isArray(product.categories) ? product.categories[0] : product.category}
                            </span>
                            {isWeight && (
                              <span className="text-[10px] bg-amber-100 px-2 py-0.5 rounded text-amber-600 font-bold border border-amber-200 flex items-center gap-0.5">
                                <Scale size={8} /> Peso
                              </span>
                            )}
                            <span className="text-xs text-slate-400 flex items-center gap-1"><ScanBarcode size={10} /> {product.barcode || '-'}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-6 mr-2">
                            <div className="text-right">
                                <p className="text-[10px] text-slate-400 uppercase font-bold">Stock</p>
                                <p className={`font-bold ${stockColor}`}>
                                    {outOfStock ? 'AGOTADO' : formatStock(product)}
                                </p>
                            </div>
                            <div className="text-right w-24">
                                <p className="text-[10px] text-slate-400 uppercase font-bold">Precio</p>
                                <p className="font-bold text-lg text-fuchsia-600">
                                  <FancyPrice amount={isWeight ? product.price * 1000 : product.price} />
                                  {isWeight && <span className="text-[10px] font-medium">/kg</span>}
                                </p>
                            </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* PANEL LATERAL */}
      {selectedProduct && (() => {
        const isWeight = selectedProduct.product_type === 'weight';
        const expirationInfo = getExpirationInfo(selectedProduct.expiration_date);
        const hasExpirationAlert = Boolean(expirationInfo?.isAlert);
        const isExpired = Boolean(expirationInfo?.isExpired);

        return (
        <div className="w-[356px] bg-white border-l shadow-2xl flex flex-col shrink-0 animate-in slide-in-from-right duration-300 relative z-20">
          <div className="px-4 py-3 border-b flex justify-between items-start bg-slate-50">
            <div>
              <h3 className="font-bold text-slate-800 text-base">Gesti{"\u00f3"}n de Stock</h3>
              <p className="text-[11px] text-slate-500">ID: {String(selectedProduct.id).padStart(6, '0')}</p>
            </div>
            <button onClick={() => setSelectedProduct(null)} className="text-slate-400 hover:text-slate-700 hover:bg-slate-200 p-1 rounded-full transition"><X size={18} /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            
            {/* Preview */}
            <div className="text-center">
              <div className={`w-48 h-48 bg-slate-100 rounded-xl mx-auto overflow-hidden border shadow-sm relative group ${hasExpirationAlert ? (isExpired ? 'ring-2 ring-red-400' : 'ring-2 ring-amber-300') : ''}`}>
                {selectedProduct.image ? (
                  <img src={selectedProduct.image} alt="" decoding="async" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-slate-200 text-slate-500 font-bold p-2 text-sm">{selectedProduct.title}</div>
                )}
                {canEditProducts && (
                  <button onClick={() => setEditingProduct(selectedProduct)} className="absolute inset-0 bg-black/40 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity font-bold text-xs"><Edit size={16} className="mr-1" /> Cambiar</button>
                )}
              </div>
              <div className="mt-2">
                <h2 className="font-bold text-base text-slate-800 leading-tight mb-2 break-words">{selectedProduct.title}</h2>
              <div className="flex justify-center gap-1.5 flex-wrap mb-1">
                {(selectedProduct.categories || []).map(cat => (
                  <span key={cat} className="px-2 py-0.5 bg-fuchsia-100 text-fuchsia-700 text-[9px] font-bold rounded-full border border-fuchsia-200">{cat}</span>
                ))}
                {isWeight && (
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[9px] font-bold rounded-full border border-amber-200 flex items-center gap-1">
                    <Scale size={9} /> Peso
                  </span>
                )}
                {hasExpirationAlert && (
                  <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full border flex items-center gap-1 ${isExpired ? 'bg-red-100 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                    {isExpired ? <CalendarX size={9} /> : <CalendarClock size={9} />} {expirationInfo.label}
                  </span>
                )}
              </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-2.5 bg-blue-50 rounded-xl border border-blue-100">
                <div className="flex items-center gap-1.5 text-blue-600 mb-1">
                  {isWeight ? <Scale size={14} /> : <Package size={14} />}
                  <span className="text-[11px] font-bold uppercase">Stock</span>
                </div>
                <p className={`text-xl font-bold ${getStockColorClass(selectedProduct)}`}>
                  {formatStock(selectedProduct)}
                </p>
              </div>
              <div className="p-2.5 bg-green-50 rounded-xl border border-green-100">
                <div className="flex items-center gap-1.5 text-green-600 mb-1">
                  <DollarSign size={14} />
                  <span className="text-[11px] font-bold uppercase">Precio</span>
                </div>
                <p className="text-xl font-bold text-green-900">
                  <FancyPrice amount={isWeight ? selectedProduct.price * 1000 : selectedProduct.price} />
                  {isWeight && <span className="text-[11px] font-medium">/kg</span>}
                </p>
              </div>
            </div>

            {/* Equivalencias peso */}
            {isWeight && (
              <div className="bg-amber-50 rounded-xl p-2.5 border border-amber-100 space-y-2">
                <p className="text-[11px] font-bold text-amber-700 flex items-center gap-1"><Scale size={11} /> Equivalencias</p>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="bg-white rounded-lg p-2 text-center border">
                    <p className="text-[10px] text-slate-400">Precio/g</p>
                    <p className="font-bold text-amber-700"><FancyPrice amount={selectedProduct.price} /></p>
                  </div>
                  <div className="bg-white rounded-lg p-2 text-center border">
                    <p className="text-[10px] text-slate-400">Stock en kg</p>
                    <p className="font-bold text-amber-700">{formatNumber(Number(selectedProduct.stock) / 1000, 2)} kg</p>
                  </div>
                </div>
              </div>
            )}

            {/* Datos */}
            <div className="bg-slate-50 rounded-xl p-3.5 space-y-2.5 border">
              <div className="flex justify-between items-center text-[13px] border-b border-slate-200 pb-2">
                <span className="text-slate-500 flex items-center gap-2"><ScanBarcode size={13} /> C{"\u00f3"}digo</span>
                <span className="font-mono font-bold text-slate-700">{selectedProduct.barcode || '-'}</span>
              </div>
              {selectedProduct.expiration_date && (
                <div className="flex justify-between items-center text-[13px] border-b border-slate-200 pb-2">
                  <span className="text-slate-500 flex items-center gap-2"><CalendarX size={13} /> Vencimiento</span>
                  <span className={`font-bold ${isExpired ? 'text-red-600' : 'text-slate-700'}`}>
                    {new Date(selectedProduct.expiration_date).toLocaleDateString('es-AR')}
                  </span>
                </div>
              )}
              {canEditProducts && (
                <>
                  <div className="flex justify-between items-center text-[13px] border-b border-slate-200 pb-2">
                    <span className="text-slate-500 flex items-center gap-2"><DollarSign size={13} /> Costo</span>
                    <span className="font-bold text-slate-700">
                      <FancyPrice amount={isWeight ? (selectedProduct.purchasePrice * 1000) : (selectedProduct.purchasePrice || 0)} />
                      {isWeight && <span className="text-[11px] text-slate-400">/kg</span>}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[13px]">
                    <span className="text-slate-500 flex items-center gap-2"><BarChart3 size={13} /> Margen</span>
                    <span className="font-bold text-green-600">
                      {selectedProduct.price && selectedProduct.purchasePrice 
                        ? `${Math.round(((selectedProduct.price - selectedProduct.purchasePrice) / selectedProduct.purchasePrice) * 100)}%`
                        : '0%'}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Acciones */}
            {hasInventoryWriteAccess && (
              <div className="space-y-3 pt-2">
                {canEditProducts && <button onClick={() => setEditingProduct(selectedProduct)} className="w-full py-2.5 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition flex items-center justify-center gap-2 shadow-lg"><Edit size={17} /> Editar Detalles</button>}
                {canDeleteProducts && <button onClick={() => { handleDeleteProduct(selectedProduct.id); setSelectedProduct(null); }} className="w-full py-2.5 bg-white text-red-600 border border-red-200 rounded-xl font-bold hover:bg-red-50 transition flex items-center justify-center gap-2"><Trash2 size={17} /> Eliminar Producto</button>}
              </div>
            )}
          </div>
        </div>
        );
      })()}
    </div>
  );
}
