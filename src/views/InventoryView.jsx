// src/views/InventoryView.jsx
import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Plus,
  Filter,
  ChevronDown,
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
  CalendarX, // âœ¨ NUEVO ICONO
  ArrowDownUp // âœ¨ AÃ‘ADIDO PARA ORDENAR
} from 'lucide-react';
// â™»ï¸ FIX: Importamos FancyPrice junto con helpers
import { formatStock, formatNumber } from '../utils/helpers';
import { hasPermission } from '../utils/userPermissions';
import { FancyPrice } from '../components/FancyPrice';
import { getProductImageUrl } from '../utils/productImages';
import { getDeletedItemInfo, getProductActiveState, isDeletedProductRecord } from '../utils/productLifecycle';

const INVENTORY_BATCH_SIZE = 50;
const REBU_WIDE_QUERY = '(min-width: 1920px)';

const isWideResolution = () =>
  typeof window !== 'undefined' && window.matchMedia(REBU_WIDE_QUERY).matches;

// âœ¨ HELPER: Verifica si la fecha es menor a 14 dÃ­as o ya pasÃ³
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

const FILTER_MODE = {
  normal: 'normal',
  only: 'only',
  exclude: 'exclude',
};

const getNextFilterMode = (currentMode) => {
  if (currentMode === FILTER_MODE.normal) return FILTER_MODE.only;
  if (currentMode === FILTER_MODE.only) return FILTER_MODE.exclude;
  return FILTER_MODE.normal;
};

export default function InventoryView({
  inventory, categories, inventorySearch, setInventorySearch,
  inventoryCategoryFilter, setInventoryCategoryFilter,
  setIsModalOpen, setEditingProduct, handleDeleteProduct,
  inventoryViewMode, setInventoryViewMode, gridColumns, setGridColumns,
  currentUser,
  closeDetailsToken,
  navigationRequest,
  onProductDetailRequest,
  onSearchInactiveProducts,
}) {
  const [selectedProduct, setSelectedProduct] = useState(null); 
  const lastNavigationTokenRef = useRef(null);
  const [showGridMenu, setShowGridMenu] = useState(false);
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [categoryFilterSearch, setCategoryFilterSearch] = useState('');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [sortFilterSearch, setSortFilterSearch] = useState('');
  const [expandedCategoryProductId, setExpandedCategoryProductId] = useState(null);
  const [isWideLayout, setIsWideLayout] = useState(isWideResolution);
  const [inactiveSearchResults, setInactiveSearchResults] = useState([]);
  const [inactiveSearchLoading, setInactiveSearchLoading] = useState(false);
  const [showInactiveOnly, setShowInactiveOnly] = useState(false);
  const inactiveSearchHandlerRef = useRef(onSearchInactiveProducts);
  const maxGridColumns = isWideLayout ? 10 : 8;
  const canCreateProducts = hasPermission(currentUser, 'inventory.create');
  const canEditProducts = hasPermission(currentUser, 'inventory.edit');
  const canDeleteProducts = hasPermission(currentUser, 'inventory.delete');
  const hasInventoryWriteAccess = canEditProducts || canDeleteProducts;
  
  // âœ¨ ESTADOS DE FILTROS RÃPIDOS
  const [stockFilterMode, setStockFilterMode] = useState(FILTER_MODE.normal);
  const [expirationFilterMode, setExpirationFilterMode] = useState(FILTER_MODE.normal);
  
  const [sortBy, setSortBy] = useState('title-asc'); // âœ¨ ESTADO PARA EL ORDEN

  const [visibleCount, setVisibleCount] = useState(INVENTORY_BATCH_SIZE);

  useEffect(() => {
    inactiveSearchHandlerRef.current = onSearchInactiveProducts;
  }, [onSearchInactiveProducts]);

  // âœ¨ EFECTO "PUENTE": Atrapa la orden del Dashboard y activa los botones
  useEffect(() => {
    setVisibleCount(INVENTORY_BATCH_SIZE);
  }, [inventorySearch]);

  useEffect(() => {
    setVisibleCount(INVENTORY_BATCH_SIZE);
  }, [stockFilterMode, expirationFilterMode, showInactiveOnly]);

  useEffect(() => {
    const query = String(inventorySearch || '').trim();
    const searchInactive = inactiveSearchHandlerRef.current;
    const shouldFetchInactive = showInactiveOnly || query.length >= 2;
    if (!searchInactive || !shouldFetchInactive) {
      setInactiveSearchResults([]);
      setInactiveSearchLoading(false);
      return undefined;
    }

    let cancelled = false;
    setInactiveSearchLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const results = await searchInactive(query);
        if (!cancelled) setInactiveSearchResults(Array.isArray(results) ? results : []);
      } catch (error) {
        console.warn('No se pudieron buscar productos inhabilitados:', error);
        if (!cancelled) setInactiveSearchResults([]);
      } finally {
        if (!cancelled) setInactiveSearchLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [inventorySearch, showInactiveOnly]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mediaQuery = window.matchMedia(REBU_WIDE_QUERY);
    const handleChange = () => setIsWideLayout(mediaQuery.matches);
    handleChange();
    mediaQuery.addEventListener?.('change', handleChange);
    return () => mediaQuery.removeEventListener?.('change', handleChange);
  }, []);

  useEffect(() => {
    if (gridColumns <= maxGridColumns) return;
    setGridColumns(maxGridColumns);
  }, [gridColumns, maxGridColumns, setGridColumns]);

  useEffect(() => {
    setVisibleCount(INVENTORY_BATCH_SIZE);
  }, [stockFilterMode, expirationFilterMode]);

  useEffect(() => {
    if (closeDetailsToken > 0) {
      setSelectedProduct(null);
    }
  }, [closeDetailsToken]);

  useEffect(() => {
    if (!navigationRequest?.token) return;
    if (lastNavigationTokenRef.current === navigationRequest.token) return;

    if (navigationRequest.mode === 'out_of_stock') {
      setStockFilterMode(FILTER_MODE.only);
      setExpirationFilterMode(FILTER_MODE.normal);
    } else if (navigationRequest.mode === 'expirations') {
      setExpirationFilterMode(FILTER_MODE.only);
      setStockFilterMode(FILTER_MODE.normal);
    } else {
      setStockFilterMode(FILTER_MODE.normal);
      setExpirationFilterMode(FILTER_MODE.normal);
    }

    if (navigationRequest.productId !== undefined && navigationRequest.productId !== null) {
      const matchedProduct = (inventory || []).find((product) => String(product.id) === String(navigationRequest.productId));
      if (!matchedProduct && (inventory || []).length === 0) return;
      setSelectedProduct(matchedProduct || null);
    } else if (navigationRequest.searchQuery) {
      const normalizedQuery = String(navigationRequest.searchQuery).trim().toLowerCase();
      const matchedProduct = (inventory || []).find((product) => String(product.title || '').trim().toLowerCase() === normalizedQuery);
      if (!matchedProduct && (inventory || []).length === 0) return;
      setSelectedProduct(matchedProduct || null);
    } else {
      setSelectedProduct(null);
    }

    setVisibleCount(INVENTORY_BATCH_SIZE);
    lastNavigationTokenRef.current = navigationRequest.token;
  }, [navigationRequest, inventory]);

  const searchString = (inventorySearch || '').toLowerCase().trim();
  const searchWords = searchString ? searchString.split(/\s+/) : [];
  const activeInventory = (inventory || []).filter((item) => getProductActiveState(item));
  const inactiveSearchInventory = (showInactiveOnly || searchWords.length > 0)
    ? (inactiveSearchResults || []).filter((item) => !getProductActiveState(item))
    : [];
  const inactiveSearchResultIds = new Set(inactiveSearchInventory.map((item) => String(item.id)));
  const inactiveIds = new Set(activeInventory.map((item) => String(item.id)));
  const inventoryForSearch = showInactiveOnly
    ? inactiveSearchInventory
    : [
        ...activeInventory,
        ...inactiveSearchInventory.filter((item) => !inactiveIds.has(String(item.id))),
      ];

  const filteredInventory = inventoryForSearch.filter((item) => {
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
    
    // âœ¨ APLICAMOS LOS FILTROS DE BOTONES
    const isStockEmpty = Number(item.stock) <= 0;
    const hasExpirationAlert = isExpiringSoon(item.expiration_date);
    const matchesStock = showInactiveOnly
      ? true
      :
      stockFilterMode === FILTER_MODE.only
        ? isStockEmpty
        : stockFilterMode === FILTER_MODE.exclude
          ? !isStockEmpty
          : true;
    const matchesExpiration = showInactiveOnly
      ? true
      :
      expirationFilterMode === FILTER_MODE.only
        ? hasExpirationAlert
        : expirationFilterMode === FILTER_MODE.exclude
          ? !hasExpirationAlert
          : true;
        
    return matchesSearch && matchesCategory && matchesStock && matchesExpiration;
  });

  // âœ¨ LÃ“GICA DE ORDENAMIENTO APLICADA SOBRE LOS FILTRADOS
  const sortedInventory = [...filteredInventory].sort((a, b) => {
    switch (sortBy) {
      case 'recent': {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA; // Ordena de mÃ¡s nuevo a mÃ¡s viejo
      }
      case 'price-desc':
        return (Number(b.price) || 0) - (Number(a.price) || 0);
      case 'price-asc':
        return (Number(a.price) || 0) - (Number(b.price) || 0);
      case 'stock-desc':
        return (Number(b.stock) || 0) - (Number(a.stock) || 0);
      case 'stock-asc':
        return (Number(a.stock) || 0) - (Number(b.stock) || 0);
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
  const totalInventoryCount = activeInventory.length;
  const visibleInventoryCount = filteredInventory.length;
  const inactiveButtonMeta = showInactiveOnly
    ? {
        label: inactiveSearchLoading ? 'Cargando...' : 'Inhabilitados',
        title: 'Mostrando solo productos inhabilitados. Click para volver al catalogo normal.',
        buttonClass: 'bg-slate-800 border-slate-700 text-white shadow-inner hover:bg-slate-700',
        iconClass: 'text-amber-300',
      }
    : {
        label: 'Inhabilitados',
        title: 'Ver productos inhabilitados.',
        buttonClass: 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700',
        iconClass: 'text-slate-400',
      };
  const sortOptions = [
    { value: 'title-asc', label: 'A-Z (Alfabetico)' },
    { value: 'recent', label: 'Mas Recientes' },
    { value: 'price-desc', label: 'Mayor Precio' },
    { value: 'price-asc', label: 'Menor Precio' },
    { value: 'stock-desc', label: 'Mayor Stock' },
    { value: 'stock-asc', label: 'Menos Stock' },
  ];
  const selectedSortOption = sortOptions.find((option) => option.value === sortBy) || sortOptions[0];
  const visibleSortOptions = sortOptions.filter((option) =>
    option.label.toLowerCase().includes(sortFilterSearch.trim().toLowerCase())
  );
  const visibleCategoryOptions = (categories || []).filter((category) =>
    String(category || '').toLowerCase().includes(categoryFilterSearch.trim().toLowerCase())
  );
  const stockModeMeta = {
    [FILTER_MODE.normal]: {
      label: 'Agotados',
      title: 'Sin Stock: normal. Click para mostrar solo agotados.',
      buttonClass: 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700',
      iconClass: 'text-slate-400',
    },
    [FILTER_MODE.only]: {
      label: 'Solo Agotados',
      title: 'Sin Stock: mostrando solo agotados. Click para ocultarlos.',
      buttonClass: 'bg-red-50 border-red-200 text-red-600 shadow-inner',
      iconClass: 'text-red-500',
    },
    [FILTER_MODE.exclude]: {
      label: 'Sin Agotados',
      title: 'Sin Stock: anulados, no aparecen agotados. Click para volver a normal.',
      buttonClass: 'bg-slate-100 border-slate-300 text-slate-400 shadow-inner',
      iconClass: 'text-slate-400',
    },
  }[stockFilterMode];
  const expirationModeMeta = {
    [FILTER_MODE.normal]: {
      label: 'Vencidos',
      title: 'Vencimientos: normal. Click para mostrar solo vencidos o por vencer.',
      buttonClass: 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700',
      iconClass: 'text-slate-400',
    },
    [FILTER_MODE.only]: {
      label: 'Solo Vencidos',
      title: 'Vencimientos: mostrando solo vencidos o por vencer. Click para ocultarlos.',
      buttonClass: 'bg-orange-50 border-orange-200 text-orange-600 shadow-inner',
      iconClass: 'text-orange-500',
    },
    [FILTER_MODE.exclude]: {
      label: 'Sin Vencidos',
      title: 'Vencimientos: anulados, no aparecen vencidos ni por vencer. Click para volver a normal.',
      buttonClass: 'bg-slate-100 border-slate-300 text-slate-400 shadow-inner',
      iconClass: 'text-slate-400',
    },
  }[expirationFilterMode];

  const handleCardClick = (product) => {
    if (selectedProduct && selectedProduct.id === product.id) {
        setSelectedProduct(null);
    } else {
        setSelectedProduct(product);
        if (onProductDetailRequest) {
          void onProductDetailRequest(product).then((hydratedProduct) => {
            if (!hydratedProduct) return;
            setSelectedProduct((currentProduct) =>
              currentProduct && String(currentProduct.id) === String(product.id)
                ? { ...currentProduct, ...hydratedProduct }
                : currentProduct
            );
          });
        }
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
    <div className="inventory-view flex h-full overflow-hidden bg-slate-100">
      
      {/* COLUMNA IZQUIERDA */}
      <div className="flex-1 flex flex-col min-w-0 transition-all duration-300">
        
        {/* Header */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 p-2 min-[1920px]:gap-3 min-[1920px]:p-2.5 bg-white border-b shrink-0 z-30 relative">
          <div className="grid min-w-0 grid-cols-[132px_108px_minmax(136px,168px)_118px_118px_132px] min-[1920px]:grid-cols-[180px_136px_208px_124px_128px_150px] items-center gap-1.5 min-[1920px]:gap-2">
            <div className="relative min-w-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input type="text" placeholder="Buscar..." className="h-8 min-[1920px]:h-9 w-full pl-8 pr-2 min-[1920px]:pr-3 border border-slate-200 rounded-lg bg-slate-50 text-xs min-[1920px]:text-sm font-semibold text-slate-700 focus:bg-white focus:ring-2 focus:ring-fuchsia-500 outline-none transition-all" value={inventorySearch} onChange={(e) => setInventorySearch(e.target.value)} />
            </div>
            <div className="relative min-w-0">
              <button
                type="button"
                onClick={() => setShowCategoryMenu((prev) => !prev)}
                className={`flex h-8 min-[1920px]:h-9 w-full items-center gap-1.5 rounded-lg border px-2 text-left text-xs font-semibold transition-all min-[1920px]:text-sm ${
                  showCategoryMenu || inventoryCategoryFilter !== 'Todas'
                    ? 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 shadow-sm'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
                }`}
                title="Filtrar por categoria"
              >
                <Filter size={14} className={inventoryCategoryFilter !== 'Todas' ? 'text-fuchsia-500' : 'text-slate-400'} />
                <span className="min-w-0 flex-1 truncate">{inventoryCategoryFilter}</span>
                <ChevronDown size={13} className={`shrink-0 text-slate-400 transition-transform ${showCategoryMenu ? 'rotate-180' : ''}`} />
              </button>

              {showCategoryMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowCategoryMenu(false)} />
                  <div className="absolute left-0 top-full z-50 mt-1.5 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                    <div className="relative mb-2">
                      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        value={categoryFilterSearch}
                        onChange={(event) => setCategoryFilterSearch(event.target.value)}
                        placeholder="Buscar filtro..."
                        className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-2 text-xs font-semibold text-slate-700 outline-none transition focus:border-fuchsia-300 focus:bg-white focus:ring-2 focus:ring-fuchsia-100"
                        autoFocus
                      />
                    </div>
                    <div className="custom-scrollbar max-h-64 overflow-y-auto pr-1">
                      <button
                        type="button"
                        onClick={() => {
                          setInventoryCategoryFilter('Todas');
                          setShowCategoryMenu(false);
                          setCategoryFilterSearch('');
                        }}
                        className={`mb-1 flex h-8 w-full items-center rounded-lg px-2 text-left text-xs font-bold transition ${
                          inventoryCategoryFilter === 'Todas'
                            ? 'bg-fuchsia-50 text-fuchsia-700'
                            : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        Todas
                      </button>
                      {visibleCategoryOptions.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => {
                            setInventoryCategoryFilter(cat);
                            setShowCategoryMenu(false);
                            setCategoryFilterSearch('');
                          }}
                          className={`flex h-8 w-full items-center rounded-lg px-2 text-left text-xs font-bold transition ${
                            inventoryCategoryFilter === cat
                              ? 'bg-fuchsia-50 text-fuchsia-700'
                              : 'text-slate-600 hover:bg-slate-50'
                          }`}
                          title={cat}
                        >
                          <span className="truncate">{cat}</span>
                        </button>
                      ))}
                      {visibleCategoryOptions.length === 0 && (
                        <p className="px-2 py-3 text-center text-xs font-semibold text-slate-400">Sin filtros</p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* âœ¨ DROPDOWN: ORDENAR POR */}
            <div className="relative min-w-0">
              <button
                type="button"
                onClick={() => setShowSortMenu((prev) => !prev)}
                className={`flex h-8 min-[1920px]:h-9 w-full items-center gap-1.5 rounded-lg border px-2 text-left text-xs font-semibold transition-all min-[1920px]:text-sm ${
                  showSortMenu || sortBy !== 'title-asc'
                    ? 'border-sky-200 bg-sky-50 text-sky-700 shadow-sm'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
                }`}
                title="Organizar productos"
              >
                <ArrowDownUp size={14} className={sortBy !== 'title-asc' ? 'text-sky-500' : 'text-slate-400'} />
                <span className="min-w-0 flex-1 truncate">{selectedSortOption.label}</span>
                <ChevronDown size={13} className={`shrink-0 text-slate-400 transition-transform ${showSortMenu ? 'rotate-180' : ''}`} />
              </button>

              {showSortMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowSortMenu(false)} />
                  <div className="absolute left-0 top-full z-50 mt-1.5 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                    <div className="relative mb-2">
                      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        value={sortFilterSearch}
                        onChange={(event) => setSortFilterSearch(event.target.value)}
                        placeholder="Buscar orden..."
                        className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-2 text-xs font-semibold text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white focus:ring-2 focus:ring-sky-100"
                        autoFocus
                      />
                    </div>
                    <div className="custom-scrollbar max-h-64 overflow-y-auto pr-1">
                      {visibleSortOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setSortBy(option.value);
                            setShowSortMenu(false);
                            setSortFilterSearch('');
                          }}
                          className={`flex h-8 w-full items-center rounded-lg px-2 text-left text-xs font-bold transition ${
                            sortBy === option.value
                              ? 'bg-sky-50 text-sky-700'
                              : 'text-slate-600 hover:bg-slate-50'
                          }`}
                          title={option.label}
                        >
                          <span className="truncate">{option.label}</span>
                        </button>
                      ))}
                      {visibleSortOptions.length === 0 && (
                        <p className="px-2 py-3 text-center text-xs font-semibold text-slate-400">Sin opciones</p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Boton: Sin stock */}
            <button
              onClick={() => setStockFilterMode((currentMode) => getNextFilterMode(currentMode))}
              title={stockModeMeta.title}
              className={`flex h-8 min-[1920px]:h-9 min-w-0 items-center justify-center gap-1.5 rounded-lg border px-1.5 text-xs font-semibold transition-all ${stockModeMeta.buttonClass}`}
            >
              <PackageX size={14} className={stockModeMeta.iconClass} />
              <span className="inline truncate">{stockModeMeta.label}</span>
            </button>

            {/* âœ¨ BOTÃ“N: VENCIMIENTOS */}
            <button
              onClick={() => setExpirationFilterMode((currentMode) => getNextFilterMode(currentMode))}
              title="Mostrar próximos a vencer y vencidos"
              className={`flex h-8 min-[1920px]:h-9 min-w-0 items-center justify-center gap-1.5 rounded-lg border px-1.5 text-xs font-semibold transition-all ${expirationModeMeta.buttonClass}`}
            >
              <CalendarX size={14} className={expirationModeMeta.iconClass} />
              <span className="inline truncate">{expirationModeMeta.label}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setShowInactiveOnly((current) => {
                  const next = !current;
                  if (next) {
                    setStockFilterMode(FILTER_MODE.normal);
                    setExpirationFilterMode(FILTER_MODE.normal);
                  }
                  return next;
                });
              }}
              title={inactiveButtonMeta.title}
              className={`flex h-8 min-[1920px]:h-9 min-w-0 items-center justify-center gap-1.5 rounded-lg border px-1.5 text-xs font-semibold transition-all ${inactiveButtonMeta.buttonClass}`}
            >
              <PackageX size={14} className={inactiveButtonMeta.iconClass} />
              <span className="inline truncate">{inactiveButtonMeta.label}</span>
            </button>

          </div>

          <div className="flex shrink-0 items-center gap-1.5 self-center">
            {inventoryViewMode === 'grid' && (
              <div className="relative">
                <button onClick={() => setShowGridMenu(!showGridMenu)} className={`p-2 rounded-lg border transition-all ${showGridMenu ? 'bg-slate-100 ring-2 ring-slate-200' : 'bg-white hover:bg-slate-50'}`} title="Ajustar tamaño"><SlidersHorizontal size={20} className="text-slate-600" /></button>
                {showGridMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowGridMenu(false)}></div>
                    <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200 p-4 z-50 animate-in fade-in zoom-in-95">
                      <div className="flex justify-between items-center mb-3"><span className="text-xs font-bold text-slate-500 uppercase">Tamaño</span><span className="text-xs font-bold text-fuchsia-600 bg-fuchsia-50 px-2 py-0.5 rounded-full border border-fuchsia-100">{Math.min(gridColumns, maxGridColumns)} columnas</span></div>
                      <div className="relative h-6 flex items-center"><input type="range" min="4" max={maxGridColumns} step="1" value={Math.min(gridColumns, maxGridColumns)} onChange={(e) => setGridColumns(Number(e.target.value))} className="custom-range w-full" /></div>
                      <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono"><span>Grande (4x)</span><span>Chico ({maxGridColumns}x)</span></div>
                    </div>
                  </>
                )}
              </div>
            )}
            <div className="flex h-8 min-[1920px]:h-9 bg-slate-100 p-0.5 rounded-lg border">
              <button onClick={() => setInventoryViewMode('grid')} className={`p-1.5 rounded-md transition-all ${inventoryViewMode === 'grid' ? 'bg-white text-fuchsia-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`} title="Vista CuadrÃ­cula"><LayoutGrid size={18} /></button>
              <button onClick={() => setInventoryViewMode('list')} className={`p-1.5 rounded-md transition-all ${inventoryViewMode === 'list' ? 'bg-white text-fuchsia-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`} title="Vista Lista"><List size={18} /></button>
            </div>
            <div className="hidden sm:flex h-8 min-[1920px]:h-9 items-center gap-1.5 px-2 min-[1920px]:px-2.5 rounded-lg border bg-slate-50 text-slate-600 shrink-0">
              <Package size={13} className="text-fuchsia-500" />
              <span className="hidden text-[10px] font-bold uppercase tracking-wide text-slate-500 min-[1920px]:inline">Productos</span>
              <span className="text-xs font-extrabold text-slate-800">{formatNumber(visibleInventoryCount)}</span>
              {visibleInventoryCount !== totalInventoryCount && (
                <span className="text-[10px] font-semibold text-slate-400">de {formatNumber(totalInventoryCount)}</span>
              )}
            </div>
            {canCreateProducts && (
              <button onClick={() => setIsModalOpen(true)} className="h-8 min-[1920px]:h-9 bg-slate-900 hover:bg-slate-800 text-white px-2.5 min-[1920px]:px-3 rounded-lg font-bold flex items-center gap-1.5 transition-colors shadow-lg shadow-slate-900/20"><Plus size={15} /> <span className="hidden min-[1920px]:inline">Nuevo</span></button>
            )}
          </div>
        </div>

        {/* Contenedor con onScroll */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar" onScroll={handleScroll}>
          {filteredInventory.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
              {showInactiveOnly ? (
                <>
                  <PackageX size={64} className="mb-4 text-slate-300" />
                  <p className="text-lg font-bold text-slate-600">Sin inhabilitados</p>
                  <p className="text-sm">No hay productos inhabilitados para esta busqueda.</p>
                </>
              ) : stockFilterMode !== FILTER_MODE.normal || expirationFilterMode !== FILTER_MODE.normal ? (
                <>
                  <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mb-4">
                    <CalendarX size={32} className="text-green-500" />
                  </div>
                  <p className="text-lg font-bold text-slate-600">Â¡Todo en orden!</p>
                  <p className="text-sm">No tienes productos en esta categorÃ­a de alerta.</p>
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
                <div className="grid gap-2.5 transition-all duration-300" style={{ gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))` }}>
                  {displayedInventory.map((product) => {
                    const isSelected = selectedProduct?.id === product.id;
                    const stockColor = getStockColorClass(product);
                    const outOfStock = isOutOfStock(product);
                    const isInactive = !getProductActiveState(product);
                    const showInactiveBadge = isInactive && inactiveSearchResultIds.has(String(product.id));
                    const isDeletedProduct = isDeletedProductRecord(product);
                    const deletedInfo = getDeletedItemInfo(product);
                    const inactiveLabel = isDeletedProduct ? 'ELIMINADO' : 'INHABILITADO';
                    const inactiveTitle = isDeletedProduct
                      ? `Item eliminado${deletedInfo.reason ? `: ${deletedInfo.reason}` : ''}`
                      : 'Producto inhabilitado';
                    const isWeight = product.product_type === 'weight';
                    const expirationInfo = getExpirationInfo(product.expiration_date);
                    const hasExpirationAlert = Boolean(expirationInfo?.isAlert);
                    const isExpired = Boolean(expirationInfo?.isExpired);
                    const productImage = getProductImageUrl(product);

                    return (
                      <div key={product.id} onClick={() => handleCardClick(product)} className={`rounded-lg border overflow-hidden flex flex-col cursor-pointer transition-all hover:shadow-md group relative ${isSelected ? 'ring-2 ring-fuchsia-500 border-fuchsia-500 transform scale-[0.98]' : 'hover:border-fuchsia-200'} ${outOfStock ? 'border-slate-300 bg-slate-100 ring-1 ring-inset ring-slate-200' : 'bg-white'} ${hasExpirationAlert && !outOfStock ? (isExpired ? 'border-red-300 bg-red-50/30' : 'border-amber-200 bg-amber-50/30') : ''}`}>
                        <div className="aspect-[4/3] bg-slate-50 relative overflow-hidden">
                          {productImage ? (
                            <img src={productImage} alt={product.title} loading="lazy" decoding="async" fetchpriority="low" className={`w-full h-full object-cover transition-transform group-hover:scale-110 duration-500 ${outOfStock ? 'opacity-75 saturate-50' : ''}`} />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-200/50 p-2 text-center group-hover:bg-slate-200 transition-colors">
                              <span className={`font-bold text-slate-500 uppercase leading-tight ${gridColumns > 6 ? 'text-[10px]' : 'text-xs'}`}>{product.title}</span>
                            </div>
                          )}
                          
                          {hasExpirationAlert && !outOfStock && !isInactive && (
                            <div className={`absolute top-1 right-1 max-w-[calc(100%-0.5rem)] rounded-md border px-1.5 py-0.5 text-[9px] font-black shadow-sm flex items-center gap-1 z-20 truncate ${isExpired ? 'bg-red-100 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`} title={expirationInfo.label}>
                              {isExpired ? <CalendarX size={9} /> : <CalendarClock size={9} />}
                              <span className="truncate">{expirationInfo.label}</span>
                            </div>
                          )}

                          {(outOfStock || showInactiveBadge) && (
                            <div
                              className={`absolute right-1 top-1 z-20 rounded-md border px-1.5 py-0.5 text-[9px] font-black text-white shadow-sm ${showInactiveBadge && isDeletedProduct ? 'border-red-500 bg-red-700' : 'border-slate-500 bg-slate-900'}`}
                              title={showInactiveBadge ? inactiveTitle : 'Producto agotado'}
                            >
                              {showInactiveBadge ? inactiveLabel : 'AGOTADO'}
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
                        
                        <div className={`flex-1 flex flex-col z-20 ${outOfStock ? 'bg-slate-100' : 'bg-white'} ${gridColumns > 7 ? 'p-1.5' : 'p-2'}`}>
                          {gridColumns <= 7 && (
                            <div className="mb-0.5">
                              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider truncate block">
                                {Array.isArray(product.categories) ? product.categories[0] : product.category || 'Gral'}
                              </span>
                            </div>
                          )}
                          <h3 className={`font-bold leading-tight mb-1 flex-1 ${gridColumns > 7 ? 'text-[10px] line-clamp-1' : 'text-[12px] line-clamp-2'} ${isExpired ? 'text-red-700' : outOfStock ? 'text-slate-600' : 'text-slate-800'}`}>{product.title}</h3>
                          <div className={`flex justify-between items-end mt-auto ${gridColumns > 7 ? 'pt-1' : 'pt-1.5 border-t border-slate-100'}`}>
                            <div>
                              {gridColumns <= 6 && <p className="text-[9px] text-slate-400 leading-none">Precio</p>}
                              <p className={`font-bold text-slate-900 leading-tight ${gridColumns > 7 ? 'text-xs' : 'text-base'}`}>
                                <FancyPrice amount={isWeight ? product.price * 1000 : product.price} />
                                {isWeight && <span className="text-[9px] font-medium text-slate-400">/kg</span>}
                              </p>
                            </div>
                            {gridColumns <= 8 && (
                              <div className="text-right">
                                {gridColumns <= 6 && <p className="text-[9px] text-slate-400 leading-none">Stock</p>}
                                <p className={`font-bold leading-tight ${stockColor} ${gridColumns > 7 ? 'text-xs' : 'text-[13px]'}`}>
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
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="sticky top-0 z-10 grid grid-cols-[46px_120px_minmax(180px,1.65fr)_minmax(120px,1fr)_76px_88px] items-center gap-2 border-b border-slate-200 bg-slate-100/95 px-3 py-2 text-[10px] font-black uppercase text-slate-500 backdrop-blur min-[1920px]:grid-cols-[52px_132px_minmax(0,2.25fr)_126px_104px_118px]">
                    <span className="truncate">Foto</span>
                    <span className="truncate">Codigo</span>
                    <span className="truncate">Titulo</span>
                    <span className="truncate">Categoria</span>
                    <span className="text-right">Stock</span>
                    <span className="text-right">Precio</span>
                  </div>
                  {displayedInventory.map((product) => {
                    const isSelected = selectedProduct?.id === product.id;
                    const stockColor = getStockColorClass(product);
                    const outOfStock = isOutOfStock(product);
                    const isInactive = !getProductActiveState(product);
                    const showInactiveBadge = isInactive && inactiveSearchResultIds.has(String(product.id));
                    const isDeletedProduct = isDeletedProductRecord(product);
                    const deletedInfo = getDeletedItemInfo(product);
                    const inactiveLabel = isDeletedProduct ? 'Eliminado' : 'Inhabilitado';
                    const inactiveTitle = isDeletedProduct
                      ? `Item eliminado${deletedInfo.reason ? `: ${deletedInfo.reason}` : ''}`
                      : 'Producto inhabilitado';
                    const isWeight = product.product_type === 'weight';
                    const expirationInfo = getExpirationInfo(product.expiration_date);
                    const hasExpirationAlert = Boolean(expirationInfo?.isAlert);
                    const isExpired = Boolean(expirationInfo?.isExpired);
                    const productCategories = (Array.isArray(product.categories) ? product.categories : [product.category])
                      .map((category) => String(category || '').trim())
                      .filter(Boolean);
                    const productImage = getProductImageUrl(product);
                    const visibleCategories = productCategories.length > 0 ? productCategories : ['Gral'];
                    const hasMultipleCategories = visibleCategories.length > 1;
                    const isCategoriesExpanded = String(expandedCategoryProductId) === String(product.id);
                    const categoriesToRender = isCategoriesExpanded ? visibleCategories : visibleCategories.slice(0, 1);
                    const categoryTitle = visibleCategories.join(', ');

                    return (
                      <div
                        key={product.id}
                        onClick={() => handleCardClick(product)}
                        className={`grid grid-cols-[46px_120px_minmax(180px,1.65fr)_minmax(120px,1fr)_76px_88px] items-center gap-2 border-b border-l-4 border-b-slate-100 px-3 py-1.5 text-[13px] cursor-pointer transition-all last:border-b-0 hover:bg-fuchsia-50/40 min-[1920px]:grid-cols-[52px_132px_minmax(0,2.25fr)_126px_104px_118px] ${isSelected ? 'border-l-fuchsia-500 bg-fuchsia-50 ring-1 ring-inset ring-fuchsia-200' : isInactive ? 'border-l-slate-600 bg-slate-200 text-slate-500 shadow-[inset_0_0_0_1px_rgba(71,85,105,0.2)]' : outOfStock ? 'border-l-slate-500 bg-slate-100 text-slate-500 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.22)]' : 'border-l-transparent bg-white'} ${hasExpirationAlert && !outOfStock && !isInactive ? (isExpired ? 'border-l-red-500 bg-red-50/40' : 'border-l-amber-400 bg-amber-50/45') : ''}`}
                      >
                        <span className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                          {productImage ? (
                            <img
                              src={productImage}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              fetchpriority="low"
                              className={`h-full w-full object-cover ${outOfStock ? 'opacity-75 saturate-50' : ''}`}
                            />
                          ) : (
                            <Package size={14} className="text-slate-300" />
                          )}
                          {(outOfStock || showInactiveBadge) && (
                            <span
                              className={`absolute bottom-0 right-0 rounded-tl px-1 text-[7px] font-black leading-3 text-white ${showInactiveBadge && isDeletedProduct ? 'bg-red-700' : 'bg-slate-900/85'}`}
                              title={showInactiveBadge ? inactiveTitle : 'Producto agotado'}
                            >
                              {showInactiveBadge ? (isDeletedProduct ? 'DEL' : 'OFF') : '0'}
                            </span>
                          )}
                        </span>
                        <span className="min-w-0 truncate text-[11px] font-semibold leading-tight text-slate-400" title={product.barcode || 'Sin codigo'}>
                          <ScanBarcode size={11} className="mr-1 inline text-slate-300" />
                          {product.barcode || '-'}
                        </span>
                        <h4 className={`min-w-0 truncate text-[13px] font-semibold leading-tight ${isInactive ? 'text-slate-500' : isExpired ? 'text-red-700' : outOfStock ? 'text-slate-600' : 'text-slate-800'}`} title={product.title}>
                          {product.title || 'Sin titulo'}
                          {showInactiveBadge && (
                            <span
                              className={`ml-2 rounded px-1.5 py-0.5 text-[8px] font-black uppercase text-white ${isDeletedProduct ? 'bg-red-700' : 'bg-slate-700'}`}
                              title={inactiveTitle}
                            >
                              {inactiveLabel}
                            </span>
                          )}
                        </h4>
                        <div className={`flex min-w-0 items-center gap-1 overflow-hidden ${isCategoriesExpanded ? 'flex-wrap whitespace-normal' : 'whitespace-nowrap'}`} title={categoryTitle}>
                          {categoriesToRender.map((category) => (
                            <span key={category} className="inline-flex max-w-full min-w-0 w-fit shrink-0 truncate rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold leading-tight text-slate-500">
                              {category}
                            </span>
                          ))}
                          {hasMultipleCategories && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setExpandedCategoryProductId((currentId) =>
                                  String(currentId) === String(product.id) ? null : product.id
                                );
                              }}
                              className="shrink-0 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-black leading-tight text-slate-500 transition hover:border-fuchsia-200 hover:text-fuchsia-600"
                              title={isCategoriesExpanded ? 'Ocultar categorias' : categoryTitle}
                            >
                              {isCategoriesExpanded ? '-' : `+${visibleCategories.length - 1}`}
                            </button>
                          )}
                        </div>
                        <p className={`truncate text-right font-bold leading-tight ${stockColor}`}>
                          {outOfStock ? 'Agotado' : formatStock(product)}
                        </p>
                        <p className="truncate text-right font-extrabold leading-tight text-slate-900">
                          <FancyPrice amount={isWeight ? product.price * 1000 : product.price} />
                          {isWeight && <span className="text-[10px] font-medium text-slate-400">/kg</span>}
                        </p>
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
        const selectedProductPreviewImage = getProductImageUrl(selectedProduct, { preferOriginal: true });

        return (
        <div className="rebu-side-panel bg-white border-l shadow-2xl flex flex-col shrink-0 animate-in slide-in-from-right duration-300 relative z-20">
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
                {selectedProductPreviewImage ? (
                  <img src={selectedProductPreviewImage} alt="" decoding="async" className="w-full h-full object-cover" />
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
