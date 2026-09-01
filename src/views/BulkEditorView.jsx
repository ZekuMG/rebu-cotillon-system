import React, { lazy, Suspense, useRef, useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search, Save, CheckSquare, Square, 
  Package, ArrowRight, Loader2, RotateCcw,
  FileText, X, User, Edit3, ChevronDown, Plus, Minus, Trash2, PackageX,
  Camera, Image as ImageIcon, LogIn, LogOut, CheckCircle, AlertTriangle, ExternalLink,
  Pause, Play, StopCircle, Crosshair, RefreshCw, Link2,
  Eye, Undo2, Bell, Check, Wand2, Tags
} from 'lucide-react';
import AsyncActionButton from '../components/AsyncActionButton';
import { FancyPrice } from '../components/FancyPrice';
import BulkExcelImportView from '../components/BulkExcelImportView';
import {
  PricingFormulaControls,
  PricingFormulaTrace,
} from '../components/pricing/PricingFormulaControls';
import { ImageModal } from '../components/modals/SaleModals';
import Swal from 'sweetalert2';
import usePendingAction from '../hooks/usePendingAction';
import { getProductImageUrl, hasProductImage } from '../utils/productImages';
import {
  buildCasaAlbertoGroupKey,
  buildCasaAlbertoEstimatedCost,
  buildSuggestedSalePriceFromMargin,
  getCasaAlbertoLink,
  getCasaAlbertoPriceTracking,
  getProductActiveState,
  productHasCasaAlbertoLink,
} from '../utils/productLifecycle';
import { evaluateSupplierReadResult } from '../utils/casaAlbertoMatch.js';
import { resolveUnitDivisor } from '../utils/casaAlbertoUnits.js';
import { SUPPLIER_PRICE_REPORT_PERIODS } from '../utils/supplierPriceReport';
import {
  calculateGrossMarginPricing,
  DEFAULT_GROSS_MARGIN_PERCENT,
  DEFAULT_VAT_PERCENT,
  GROSS_MARGIN_FORMULA_VERSION,
  loadGrossMarginPreferences,
  normalizeGrossMarginPercent,
  saveGrossMarginPreferences,
} from '../utils/grossMarginPricing';
import {
  getStoredProductSalePrice,
  getVisibleProductSalePrice,
  normalizeFinalSalePrice,
} from '../utils/finalSalePrice';
import {
  getStoredProductPurchaseCost,
  getVisibleProductPurchaseCost,
  normalizeFinalPurchaseCost,
} from '../utils/finalPurchaseCost';

const BULK_EDITOR_TOOL_MODE_STORAGE_KEY = 'rebu_bulk_editor_tool_mode_v1';
const ImageCleanupWorkspace = lazy(() => import('../components/ImageCleanupWorkspace'));
const WhatsAppCatalogExportView = lazy(() => import('../components/WhatsAppCatalogExportView'));

function ToolLoadingFallback() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white text-center shadow-sm">
      <div>
        <Loader2 className="mx-auto mb-3 animate-spin text-slate-500" size={26} />
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Cargando herramienta</p>
      </div>
    </div>
  );
}
const IMAGE_IMPORT_LIMIT_OPTIONS = [
  { value: '1', label: '1 foto' },
  { value: '5', label: '5 fotos' },
  { value: '10', label: '10 fotos' },
  { value: 'all', label: 'Todas' },
];

const normalizeToolMode = (mode) => (
  mode === 'excel' || mode === 'supplier' || mode === 'image-cleanup' || mode === 'whatsapp-catalog' ? mode : 'bulk'
);
const getInitialPricingPreferences = () => {
  if (typeof window === 'undefined') return loadGrossMarginPreferences(null);
  return loadGrossMarginPreferences(window.localStorage);
};

const parseSupplierNumber = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = String(value ?? '').trim();
  if (!text) return 0;
  const normalized = text
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');
  const numberValue = Number(normalized);
  return Number.isFinite(numberValue) ? numberValue : 0;
};

const normalizeSupplierSearchValue = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const normalizeSupplierDivisor = (value, fallback = 1) => {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return fallback;
  return Math.max(1, Math.round(numberValue));
};

const getInitialToolMode = () => {
  try {
    if (typeof window === 'undefined') return 'bulk';
    return normalizeToolMode(window.localStorage.getItem(BULK_EDITOR_TOOL_MODE_STORAGE_KEY));
  } catch {
    return 'bulk';
  }
};

export default function BulkEditorView({ 
  currentUser,
  inventory: realInventory, 
  categories, 
  onSaveSingle, 
  onSaveBulk, 
  onExportProducts,
  // ✨ PROPS DE PERSISTENCIA INYECTADAS DESDE APP.JSX
  exportItems = [],
  setExportItems,
  exportConfig,
  setExportConfig,
  onCreateFixedProduct,
  onApplyExcelImport,
  onUndoExcelImport,
  onCreateExcelProducts,
  onApplyProductImageImports,
  onRestoreProductImage,
  onImageImportTaskChange,
  imageImportOpenRequest = 0,
  onSaveSupplierPriceChecks,
  onExportSupplierPriceReport,
  onApplySupplierPriceUpdates,
  onUndoSupplierPriceUpdates,
  onUpdateCasaAlbertoLinks,
  isOfflineReadOnly = false,
  canCreateInventory = false,
  canEditInventory = false,
  supplierOpenRequest = 0,
}) {
  const buildEditStateFromInventory = (inventory) => {
    const nextEdits = {};
    (inventory || []).forEach((p) => {
      nextEdits[p.id] = {
        price: getVisibleProductSalePrice(p.price, p.product_type),
        purchasePrice: getVisibleProductPurchaseCost(p.purchasePrice, p.product_type),
        stock: Number(p.stock) || 0,
      };
    });
    return nextEdits;
  };

  // --- SANDBOX (Inventario Clonado) ---
  const [sandboxInventory, setSandboxInventory] = useState([]);
  const [activeToolMode, setActiveToolMode] = useState(getInitialToolMode);

  // --- Filtros ---
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [showOnlyOutOfStock, setShowOnlyOutOfStock] = useState(false);
  
  // --- Estado de Edición Local ---
  const [edits, setEdits] = useState({});
  const [selectedIds, setSelectedIds] = useState([]);
  
  // --- Herramienta de Ajuste Masivo ---
  const [bulkAction, setBulkAction] = useState({ field: 'price', percentage: '' });
  const [pricingPreferences, setPricingPreferences] = useState(getInitialPricingPreferences);
  const [isSaving, setIsSaving] = useState(false);
  const { isPending, runAction } = usePendingAction();

  // --- Estado de Vista Previa de Exportación ---
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isImageImportModalOpen, setIsImageImportModalOpen] = useState(false);
  const [imageImportRows, setImageImportRows] = useState([]);
  const [isSearchingImages, setIsSearchingImages] = useState(false);
  const [isApplyingImages, setIsApplyingImages] = useState(false);
  const [isImageImportPaused, setIsImageImportPaused] = useState(false);
  const [hasImageImportSearchStarted, setHasImageImportSearchStarted] = useState(false);
  const [showImageImportPendingRows, setShowImageImportPendingRows] = useState(false);
  const [imageImportReviewSearchTerm, setImageImportReviewSearchTerm] = useState('');
  const [imageImportSearchLimit, setImageImportSearchLimit] = useState('10');
  const [isImageImportLimitMenuOpen, setIsImageImportLimitMenuOpen] = useState(false);
  const [imageCandidatePickerRowId, setImageCandidatePickerRowId] = useState(null);
  const [replaceExistingProductImages, setReplaceExistingProductImages] = useState(false);
  const [productImagePreview, setProductImagePreview] = useState('');
  const imageImportPausedRef = useRef(false);
  const imageImportStopRef = useRef(false);
  const [supplierPriceFilter, setSupplierPriceFilter] = useState('all');
  const [supplierPriceSearchTerm, setSupplierPriceSearchTerm] = useState('');
  const [supplierPriceRows, setSupplierPriceRows] = useState({});
  const [supplierPriceOverrides, setSupplierPriceOverrides] = useState({});
  const [isCheckingSupplierPrices, setIsCheckingSupplierPrices] = useState(false);
  const [checkingSupplierGroupKey, setCheckingSupplierGroupKey] = useState('');
  const [isSupplierPriceCheckPaused, setIsSupplierPriceCheckPaused] = useState(false);
  const [selectedSupplierGroupKeys, setSelectedSupplierGroupKeys] = useState([]);
  const [supplierDetailGroupKey, setSupplierDetailGroupKey] = useState('');
  const [supplierLinkEditKey, setSupplierLinkEditKey] = useState('');
  const [supplierLinkDrafts, setSupplierLinkDrafts] = useState({});
  const [supplierLinkSuggestions, setSupplierLinkSuggestions] = useState([]);
  const [supplierProductSelectionByGroup, setSupplierProductSelectionByGroup] = useState({});
  const [isDetectingSupplierLinks, setIsDetectingSupplierLinks] = useState(false);
  const [supplierLinkDetectionLimit, setSupplierLinkDetectionLimit] = useState('10');
  const [supplierLinkDetectionProgress, setSupplierLinkDetectionProgress] = useState({
    total: 0,
    processed: 0,
    found: 0,
    errors: 0,
  });
  const [isSupplierReportMenuOpen, setIsSupplierReportMenuOpen] = useState(false);
  const [isExportingSupplierReport, setIsExportingSupplierReport] = useState(false);
  const [supplierSessionState, setSupplierSessionState] = useState({
    status: 'idle',
    isLikelyLoggedIn: false,
    manualLoginRequired: false,
    hasWindow: false,
    error: '',
  });
  const [isSupplierSessionBusy, setIsSupplierSessionBusy] = useState(false);
  const supplierLinkDetectionStopRef = useRef(false);
  const supplierPriceCheckStopRef = useRef(false);
  const supplierPriceCheckPausedRef = useRef(false);

  const updatePricingMargin = useCallback((value) => {
    setPricingPreferences((current) => ({
      ...current,
      marginPercent: normalizeGrossMarginPercent(value, current.marginPercent),
    }));
  }, []);

  const updateBulkCostIncludesVat = useCallback((value) => {
    setPricingPreferences((current) => ({
      ...current,
      bulkCostIncludesVat: value !== false,
    }));
  }, []);

  // --- Estado para el autocompletado de productos extra ---
  const [focusedTempId, setFocusedTempId] = useState(null);

  // --- LÍMITES DE CARGA DIFERIDA ---
  const ITEMS_PER_CHUNK = 30;
  const [mainLimit, setMainLimit] = useState(ITEMS_PER_CHUNK);
  const [previewLimit, setPreviewLimit] = useState(ITEMS_PER_CHUNK);

  useEffect(() => {
    const clonedData = JSON.parse(JSON.stringify(realInventory || []));
    setSandboxInventory(clonedData);
    setEdits(buildEditStateFromInventory(clonedData));
  }, [realInventory]);

  useEffect(() => {
    try {
      window.localStorage.setItem(BULK_EDITOR_TOOL_MODE_STORAGE_KEY, normalizeToolMode(activeToolMode));
    } catch {
      // La preferencia es solo comodidad local; si falla, la vista sigue funcionando.
    }
  }, [activeToolMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    saveGrossMarginPreferences(window.localStorage, pricingPreferences);
  }, [pricingPreferences]);

  useEffect(() => {
    if (!imageImportOpenRequest || imageImportRows.length === 0) return;
    setActiveToolMode('bulk');
    setIsImageImportModalOpen(true);
  }, [imageImportOpenRequest, imageImportRows.length]);

  useEffect(() => {
    setMainLimit(ITEMS_PER_CHUNK);
  }, [searchTerm, selectedCategory, showOnlyOutOfStock]);

  const filteredProducts = sandboxInventory.filter((product) => {
    const searchString = searchTerm.toLowerCase().trim();
    const isSearchingTest = searchString === 'test';
    
    const titleLower = (product.title || '').toLowerCase();
    const catLower = (product.category || '').toLowerCase();
    const isTestProduct = titleLower.includes('test') || catLower.includes('test');

    if (isTestProduct && !isSearchingTest) return false;
    if (!isTestProduct && isSearchingTest) return false;

    const searchWords = searchString && !isSearchingTest ? searchString.split(/\s+/) : [];
    const matchesSearch = searchWords.length === 0 || searchWords.every(word =>
      titleLower.includes(word) ||
      String(product.id).toLowerCase().includes(word) ||
      (product.barcode && String(product.barcode).toLowerCase().includes(word))
    );
    
    const matchesCategory = selectedCategory === 'Todas' || 
      (Array.isArray(product.categories) ? product.categories.includes(selectedCategory) : product.category === selectedCategory);
    const matchesOutOfStock = showOnlyOutOfStock ? Number(product.stock) <= 0 : true;
      
    return matchesSearch && matchesCategory && matchesOutOfStock;
  });

  const hasSearchableProductTitle = (product) => Boolean(String(product?.title || '').trim());
  const canImportImageForProduct = (product) => hasSearchableProductTitle(product) && !hasProductImage(product);
  const imageImportCandidates = sandboxInventory.filter(canImportImageForProduct);
  const selectedImageCorrectionCandidates = sandboxInventory.filter((product) =>
    selectedIds.includes(product.id) && hasSearchableProductTitle(product) && hasProductImage(product)
  );

  const filteredProductIds = filteredProducts.map((product) => product.id);
  const visibleOutOfStockIds = filteredProducts
    .filter((product) => Number(product.stock) <= 0)
    .map((product) => product.id);
  const areAllFilteredSelected =
    filteredProductIds.length > 0 && filteredProductIds.every((id) => selectedIds.includes(id));
  const areAllVisibleOutOfStockSelected =
    visibleOutOfStockIds.length > 0 && visibleOutOfStockIds.every((id) => selectedIds.includes(id));

  const handleMainScroll = (e) => {
    const { scrollTop, clientHeight, scrollHeight } = e.target;
    if (scrollHeight - scrollTop <= clientHeight + 100) {
      if (mainLimit < filteredProducts.length) {
        setMainLimit(prev => prev + ITEMS_PER_CHUNK);
      }
    }
  };

  const handlePreviewScroll = (e) => {
    const { scrollTop, clientHeight, scrollHeight } = e.target;
    if (scrollHeight - scrollTop <= clientHeight + 100) {
      if (previewLimit < exportItems.length) {
        setPreviewLimit(prev => prev + ITEMS_PER_CHUNK);
      }
    }
  };

  const handleEditChange = (id, field, value) => {
    const nextValue = field === 'purchasePrice' && String(value ?? '').trim() !== ''
      ? normalizeFinalPurchaseCost(value)
      : value;
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: nextValue } }));
  };

  const toggleSelectAll = () => {
    if (areAllFilteredSelected) {
      setSelectedIds((prev) => prev.filter((id) => !filteredProductIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...filteredProductIds])));
    }
  };

  const handleSelectOutOfStock = () => {
    if (visibleOutOfStockIds.length === 0) return;
    setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleOutOfStockIds])));
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const applyBulkPercentage = () => {
    if (bulkAction.field === 'grossMarginPrice') {
      if (selectedIds.length === 0) return;
      const nextEdits = { ...edits };
      let invalidCount = 0;

      selectedIds.forEach((id) => {
        const currentEdit = edits[id] || {};
        const pricing = calculateGrossMarginPricing({
          cost: Number(currentEdit.purchasePrice),
          costIncludesVat: pricingPreferences.bulkCostIncludesVat,
          marginPercent: pricingPreferences.marginPercent,
        });

        if (!pricing.isValid) {
          invalidCount += 1;
          return;
        }

        nextEdits[id] = {
          ...currentEdit,
          ...(!pricingPreferences.bulkCostIncludesVat
            ? { purchasePrice: pricing.realCost }
            : {}),
          price: pricing.salePrice,
        };
      });

      setEdits(nextEdits);
      if (invalidCount > 0) {
        void Swal.fire({
          icon: 'warning',
          title: 'Algunos productos no se calcularon',
          text: `${invalidCount} producto(s) no tienen un costo mayor que cero.`,
          confirmButtonText: 'Entendido',
        });
      }
      return;
    }

    const percentage = Number(bulkAction.percentage);
    if (isNaN(percentage) || percentage === 0 || selectedIds.length === 0) return;

    const multiplier = 1 + (percentage / 100);
    const newEdits = { ...edits };

    selectedIds.forEach(id => {
      const currentEdit = edits[id] || {};
      const currentVal = Number(currentEdit[bulkAction.field]) || 0;
      newEdits[id] = {
        ...currentEdit,
        [bulkAction.field]: bulkAction.field === 'purchasePrice'
          ? normalizeFinalPurchaseCost(currentVal * multiplier)
          : Math.round(currentVal * multiplier),
      };
    });

    setEdits(newEdits);
  };

  const handleResetRow = (p) => {
    setEdits(prev => ({
      ...prev,
      [p.id]: {
        price: getVisibleProductSalePrice(p.price, p.product_type),
        purchasePrice: getVisibleProductPurchaseCost(p.purchasePrice, p.product_type),
        stock: Number(p.stock) || 0,
      }
    }));
  };

  const handleResetAllEdits = async () => {
    if (!sandboxInventory.some((p) => hasChanges(p)) && selectedIds.length === 0 && bulkAction.percentage === '') return;

    const result = await Swal.fire({
      title: '¿Deshacer todos los cambios?',
      text: 'Se van a restaurar todos los cambios masivos no guardados.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#0f172a',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Sí, deshacer todo',
      cancelButtonText: 'Cancelar',
      reverseButtons: true
    });

    if (!result.isConfirmed) return;

    setEdits(buildEditStateFromInventory(sandboxInventory));
    setSelectedIds([]);
    setBulkAction((prev) => ({ ...prev, percentage: '' }));

    Swal.fire({
      title: 'Cambios revertidos',
      text: 'El editor volvió al último estado guardado.',
      icon: 'success',
      timer: 1400,
      showConfirmButton: false
    });
  };

  const handleSaveSingle = async (product) => {
    await runAction(`bulk-save-single:${product.id}`, async () => {
      setIsSaving(true);
      try {
        const editData = edits[product.id];
        
        if (onSaveSingle) {
          await onSaveSingle(product, editData);
        }
        
        const finalPrice = getStoredProductSalePrice(editData.price, product.product_type);
        const finalCost = getStoredProductPurchaseCost(editData.purchasePrice, product.product_type);
        const finalStock = Number(editData.stock);

        setSandboxInventory(sandboxInventory.map(p => 
          p.id === product.id ? { ...p, price: finalPrice, purchasePrice: finalCost, stock: finalStock } : p
        ));
      } finally {
        setIsSaving(false);
      }
    });
  };

  const handleSaveBulk = async () => {
    if (selectedIds.length === 0) return;
    setIsSaving(true);
    try {
      if (onSaveBulk) {
        const bulkData = selectedIds.map(id => ({
          product: sandboxInventory.find(p => p.id === id),
          edits: edits[id]
        }));
        await onSaveBulk(bulkData);
      }

      setSandboxInventory(prev => prev.map(p => {
        if (selectedIds.includes(p.id)) {
          const editData = edits[p.id];
          return {
            ...p,
            price: getStoredProductSalePrice(editData.price, p.product_type),
            purchasePrice: getStoredProductPurchaseCost(editData.purchasePrice, p.product_type),
            stock: Number(editData.stock)
          };
        }
        return p;
      }));
      
      setSelectedIds([]);
    } finally {
      setIsSaving(false);
    }
  };

  // ✨ AHORA EL PDF FUNCIONA COMO UN "CARRITO" ACUMULATIVO
  const openExportPreview = () => {
    if (selectedIds.length === 0) {
      setPreviewLimit(ITEMS_PER_CHUNK);
      setIsExportModalOpen(true);
      return;
    }

    // Filtrar IDs que no estén duplicados en el PDF actual
    const newIdsToAdd = selectedIds.filter(id => !exportItems.some(ex => ex.id === id));
    
    const newRegularItems = sandboxInventory
      .filter(p => newIdsToAdd.includes(p.id))
      .map(p => {
         let cat = 'Otros';
         if (Array.isArray(p.categories) && p.categories.length > 0) {
           cat = p.categories[0];
         } else if (p.category) {
           cat = p.category.split(',')[0].trim();
         }

         return {
           id: p.id,
           title: p.title,
           category: cat, 
           cost: getOriginalVal(p, 'purchasePrice'),
           price: getOriginalVal(p, 'price'),
           newPrice: Number(edits[p.id]?.price) || getOriginalVal(p, 'price'),
           stock: edits[p.id]?.stock !== '' && Number.isFinite(Number(edits[p.id]?.stock))
             ? Number(edits[p.id].stock)
             : getOriginalVal(p, 'stock'),
           qty: p.product_type === 'weight' ? 1000 : 1, 
           product_type: p.product_type,
           isTemporary: false
         };
      });
    
    setExportItems(prev => [...prev, ...newRegularItems]);
    setSelectedIds([]); // Vaciamos la selección tras añadir al carrito del PDF
    setPreviewLimit(ITEMS_PER_CHUNK);
    setIsExportModalOpen(true);
  };

  const handleAddTemporaryItem = () => {
    const newItem = {
      id: `temp-${Date.now()}`,
      title: '',
      category: 'Adicionales',
      cost: 0,
      price: 0,
      newPrice: 0,
      stock: 0,
      qty: 1,
      product_type: 'quantity',
      isTemporary: true,
      isTitleLocked: false 
    };
    setExportItems(prev => [newItem, ...prev]);
  };

  const handleSelectProductForTemp = (tempId, product) => {
    setExportItems(prev => prev.map(item => {
      if (item.id === tempId) {
         let cat = 'Otros';
         if (Array.isArray(product.categories) && product.categories.length > 0) {
           cat = product.categories[0];
         } else if (product.category) {
           cat = product.category.split(',')[0].trim();
         }

         return {
           id: `${product.id}-${Date.now()}`, 
           title: product.title,
           category: cat,
           cost: getOriginalVal(product, 'purchasePrice'),
           price: getOriginalVal(product, 'price'),
           newPrice: Number(edits[product.id]?.price) || getOriginalVal(product, 'price'),
           stock: edits[product.id]?.stock !== '' && Number.isFinite(Number(edits[product.id]?.stock))
             ? Number(edits[product.id].stock)
             : getOriginalVal(product, 'stock'),
           qty: product.product_type === 'weight' ? 1000 : 1,
           product_type: product.product_type,
           isTemporary: false 
         };
      }
      return item;
    }));
    setFocusedTempId(null);
  };

  // ✨ NUEVO: CREADOR DE PRODUCTO DESDE EL PRESUPUESTO
  const handleSetAsCustomProduct = async (tempId) => {
    const targetItem = exportItems.find(i => i.id === tempId);
    if (!targetItem) return;

    if (onCreateFixedProduct) {
       const newRealProduct = await onCreateFixedProduct(targetItem.title, targetItem.newPrice);
       if (newRealProduct) {
          setExportItems(prev => prev.map(item => {
             if (item.id === tempId) {
                return {
                  ...item,
                  id: newRealProduct.id,
                  title: newRealProduct.title,
                  category: newRealProduct.categories?.[0] || 'Depósito',
                  cost: newRealProduct.purchasePrice || 0,
                  price: newRealProduct.price || 0,
                  isTemporary: false,
                  isTitleLocked: true
                };
             }
             return item;
          }));
       }
    }
    setFocusedTempId(null);
  };

  const updateExportItemField = (id, field, value) => {
    setExportItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const removeExportItem = (id) => {
    setExportItems(prev => prev.filter(item => item.id !== id));
  };

  const updateExportItemQty = (id, newQty) => {
    const qty = parseInt(newQty);
    if (isNaN(qty) || qty < 1) return;
    setExportItems(prev => prev.map(item => item.id === id ? { ...item, qty } : item));
  };

  const handleConfirmExport = async () => {
    const cleanItems = exportItems.filter(item => item.title && item.title.trim() !== '');
    if (cleanItems.length === 0 || !onExportProducts || isExportingPdf) return;

    setIsExportingPdf(true);
    try {
      const wasExported = await onExportProducts(exportConfig, cleanItems);
      if (!wasExported) return;
      setExportItems([]);
      setSelectedIds([]);
      setIsExportModalOpen(false);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const buildImageImportRows = () => {
    const selectedEligible = sandboxInventory.filter((product) =>
      selectedIds.includes(product.id) &&
      hasSearchableProductTitle(product) &&
      (replaceExistingProductImages ? hasProductImage(product) : !hasProductImage(product))
    );
    const sourceProducts = replaceExistingProductImages
      ? selectedEligible
      : selectedEligible.length > 0
        ? selectedEligible
        : imageImportCandidates;

    return sourceProducts.map((product) => ({
      rowId: `${product.id}-${product.barcode || 'title-only'}`,
      productId: product.id,
      title: product.title || 'Producto sin nombre',
      barcode: String(product.barcode || '').trim(),
      category: Array.isArray(product.categories) ? product.categories.join(', ') : product.category || '',
      status: 'pending',
      approved: false,
      foundTitle: '',
      imageUrl: '',
      imageDataUrl: '',
      replaceExistingImage: hasProductImage(product),
      previousImageUrl: product.image || '',
      previousImageThumbUrl: product.imageThumb || product.image_thumb || '',
      message: hasProductImage(product)
        ? 'Lista para corregir la foto actual'
        : product.barcode
          ? 'Listo para buscar por codigo y nombre'
          : 'Sin codigo: se buscara por nombre',
    }));
  };

  const openImageImportModal = () => {
    if (replaceExistingProductImages && selectedImageCorrectionCandidates.length === 0) {
      Swal.fire({
        title: 'Selecciona los productos',
        text: 'Marca en la lista los articulos con foto incorrecta que queres volver a buscar.',
        icon: 'info',
        confirmButtonColor: '#0f172a',
      });
      return;
    }

    const rows = buildImageImportRows();
    if (rows.length === 0) {
      Swal.fire({
        title: 'Sin productos para buscar',
        text: 'No hay productos sin foto y con un nombre valido en este lote.',
        icon: 'info',
        confirmButtonColor: '#0f172a',
      });
      return;
    }

    setImageImportRows(rows);
    setHasImageImportSearchStarted(false);
    setShowImageImportPendingRows(false);
    setImageImportReviewSearchTerm('');
    setImageImportSearchLimit('10');
    setIsImageImportLimitMenuOpen(false);
    imageImportPausedRef.current = false;
    imageImportStopRef.current = false;
    setIsImageImportPaused(false);
    setImageCandidatePickerRowId(null);
    setIsImageImportModalOpen(true);
  };

  const applySupplierSessionResult = useCallback((result, fallbackStatus = 'disconnected') => {
    const loginState = result?.loginState || result || {};
    const isLikelyLoggedIn = Boolean(loginState.isLikelyLoggedIn);
    const manualLoginRequired = Boolean(
      result?.manualLoginRequired || loginState.hasVisiblePasswordInput || loginState.isLoginText
    );
    setSupplierSessionState({
      status: isLikelyLoggedIn ? 'connected' : manualLoginRequired ? 'manual_required' : fallbackStatus,
      isLikelyLoggedIn,
      manualLoginRequired,
      hasWindow: Boolean(loginState.hasWindow),
      error: result?.success === false ? (result.error || 'No se pudo comprobar la sesion.') : '',
    });
  }, []);

  const markSupplierSessionRequired = useCallback(() => {
    setSupplierSessionState((current) => ({
      ...current,
      status: 'manual_required',
      isLikelyLoggedIn: false,
      manualLoginRequired: true,
      error: '',
    }));
  }, []);

  const requestSupplierCredentials = async ({ rejected = false } = {}) => {
    if (!window.electronAPI?.supplierCredentialsSave) {
      return { success: false, error: 'La versión de escritorio no permite guardar el acceso de Casa Alberto.' };
    }

    const promptResult = await Swal.fire({
      title: rejected ? 'Actualizar acceso de Casa Alberto' : 'Configurar acceso de Casa Alberto',
      html: `
        <p style="margin:0 0 16px;color:#64748b;font-size:14px;line-height:1.45;text-align:left">
          ${rejected
            ? 'Casa Alberto rechazó los datos guardados. Ingresá los datos actuales.'
            : 'Ingresalos una sola vez. Rebu los guardará cifrados en este equipo para iniciar sesión automáticamente.'}
        </p>
        <label for="supplier-login-username" style="display:block;margin-bottom:6px;color:#334155;font-size:12px;font-weight:800;text-align:left">Usuario</label>
        <input id="supplier-login-username" class="swal2-input" autocomplete="username" style="width:100%;margin:0 0 14px" />
        <label for="supplier-login-password" style="display:block;margin-bottom:6px;color:#334155;font-size:12px;font-weight:800;text-align:left">Contraseña</label>
        <input id="supplier-login-password" class="swal2-input" type="password" autocomplete="current-password" style="width:100%;margin:0" />
      `,
      showCancelButton: true,
      confirmButtonText: 'Guardar e iniciar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#059669',
      focusConfirm: false,
      didOpen: () => document.getElementById('supplier-login-username')?.focus(),
      preConfirm: () => {
        const username = String(document.getElementById('supplier-login-username')?.value || '').trim();
        const password = String(document.getElementById('supplier-login-password')?.value || '');
        if (!username || !password) {
          Swal.showValidationMessage('Completá el usuario y la contraseña.');
          return false;
        }
        return { username, password };
      },
    });

    if (!promptResult.isConfirmed || !promptResult.value) return { success: false, canceled: true };
    const saveResult = await window.electronAPI.supplierCredentialsSave(promptResult.value);
    promptResult.value.password = '';
    if (!saveResult?.success) {
      await Swal.fire(
        'No se pudo proteger el acceso',
        saveResult?.error || 'Rebu no pudo guardar los datos cifrados en este equipo.',
        'error',
      );
    }
    return saveResult;
  };

  const handleConnectSupplierSession = async () => {
    if (!window.electronAPI?.supplierSessionConnect) {
      setSupplierSessionState((current) => ({ ...current, status: 'unsupported', error: '' }));
      Swal.fire('Electron requerido', 'La sesion automatica funciona desde la app de escritorio.', 'info');
      return;
    }

    setIsSupplierSessionBusy(true);
    setSupplierSessionState((current) => ({ ...current, status: 'checking', error: '' }));
    try {
      let result = await window.electronAPI.supplierSessionConnect();
      if (result?.credentialsRequired) {
        const saveResult = await requestSupplierCredentials({ rejected: Boolean(result.credentialsRejected) });
        if (!saveResult?.success) {
          applySupplierSessionResult(result, 'manual_required');
          return;
        }
        result = await window.electronAPI.supplierSessionConnect();
      }
      applySupplierSessionResult(result, result?.success === false ? 'error' : 'disconnected');
      if (result?.success === false) {
        await Swal.fire(
          result?.credentialsRejected ? 'Acceso rechazado' : 'No se pudo iniciar la sesión',
          result?.error || 'Volvé a intentar o usá el acceso manual.',
          'error',
        );
      }
    } catch (error) {
      setSupplierSessionState((current) => ({
        ...current,
        status: 'error',
        isLikelyLoggedIn: false,
        error: error?.message || 'No se pudo comprobar la sesion.',
      }));
    } finally {
      setIsSupplierSessionBusy(false);
    }
  };

  const handleOpenSupplierLogin = async () => {
    if (!window.electronAPI?.supplierImageOpenLogin) {
      Swal.fire('Electron requerido', 'Esta accion necesita ejecutarse desde la app de escritorio.', 'info');
      return;
    }

    setIsSupplierSessionBusy(true);
    try {
      const result = await window.electronAPI.supplierImageOpenLogin();
      applySupplierSessionResult(result, result?.success === false ? 'error' : 'manual_required');
      if (!result?.success) {
        Swal.fire('No se pudo abrir el proveedor', result?.error || 'Reinicia Electron y volve a intentar.', 'error');
      }
    } finally {
      setIsSupplierSessionBusy(false);
    }
  };

  const handleLogoutSupplierSession = async () => {
    if (!window.electronAPI?.supplierSessionLogout) return;
    setIsSupplierSessionBusy(true);
    try {
      const result = await window.electronAPI.supplierSessionLogout();
      applySupplierSessionResult(result, result?.success === false ? 'error' : 'disconnected');
      if (!result?.success) {
        Swal.fire('No se pudo cerrar la sesion', result?.error || 'Volvé a intentar.', 'error');
      }
    } finally {
      setIsSupplierSessionBusy(false);
    }
  };

  useEffect(() => {
    const shouldMonitorSession = activeToolMode === 'supplier' || isImageImportModalOpen;
    if (!shouldMonitorSession) return undefined;
    if (!window.electronAPI?.supplierSessionConnect || !window.electronAPI?.supplierImageLoginState) {
      setSupplierSessionState((current) => ({ ...current, status: 'unsupported', error: '' }));
      return undefined;
    }

    let cancelled = false;
    const restoreSession = async () => {
      setSupplierSessionState((current) => ({ ...current, status: 'checking', error: '' }));
      try {
        const result = await window.electronAPI.supplierSessionConnect();
        if (!cancelled) applySupplierSessionResult(result, result?.success === false ? 'error' : 'disconnected');
      } catch (error) {
        if (!cancelled) {
          setSupplierSessionState((current) => ({
            ...current,
            status: 'error',
            isLikelyLoggedIn: false,
            error: error?.message || 'No se pudo comprobar la sesion.',
          }));
        }
      }
    };
    const pollSession = async () => {
      try {
        const loginState = await window.electronAPI.supplierImageLoginState();
        if (!cancelled) applySupplierSessionResult(loginState, 'disconnected');
      } catch {
        // La restauracion inicial ya muestra errores; un sondeo aislado no debe interrumpir el trabajo.
      }
    };

    restoreSession();
    const intervalId = window.setInterval(pollSession, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeToolMode, isImageImportModalOpen, applySupplierSessionResult]);

  const updateImageImportRow = (rowId, patch) => {
    setImageImportRows((prev) => prev.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row)));
  };

  const waitForImageImportResume = async () => {
    while (imageImportPausedRef.current && !imageImportStopRef.current) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  };

  const handleToggleImageImportPause = () => {
    const nextPaused = !imageImportPausedRef.current;
    imageImportPausedRef.current = nextPaused;
    setIsImageImportPaused(nextPaused);
  };

  const handleStopImageImportSearch = () => {
    imageImportStopRef.current = true;
    imageImportPausedRef.current = false;
    setIsImageImportPaused(false);
  };

  const handleSearchSupplierImages = async (limit = null) => {
    if (!window.electronAPI?.supplierImageSearch) {
      Swal.fire('Electron requerido', 'Esta busqueda necesita ejecutarse desde la app de escritorio.', 'info');
      return;
    }

    const rowsToSearch = imageImportRows
      .filter((row) => ['pending', 'error', 'login_required'].includes(row.status))
      .slice(0, limit || imageImportRows.length);

    if (rowsToSearch.length === 0) return;

    if (!limit && rowsToSearch.length > 80) {
      const result = await Swal.fire({
        title: 'Buscar en todo el lote',
        text: `Se van a consultar ${rowsToSearch.length} productos. Puede tardar varios minutos.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#0f172a',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Buscar todo',
        cancelButtonText: 'Cancelar',
        reverseButtons: true,
      });
      if (!result.isConfirmed) return;
    }

    setHasImageImportSearchStarted(true);
    setIsSearchingImages(true);
    setIsImageImportLimitMenuOpen(false);
    setIsImageImportPaused(false);
    imageImportPausedRef.current = false;
    imageImportStopRef.current = false;
    try {
      for (const row of rowsToSearch) {
        await waitForImageImportResume();
        if (imageImportStopRef.current) break;

        updateImageImportRow(row.rowId, { status: 'searching', message: 'Buscando en proveedor...' });
        const result = await window.electronAPI.supplierImageSearch({
          barcode: row.barcode,
            title: row.title,
            searchMode: row.barcode ? 'barcode_then_title' : 'title_only',
        });

        if (result?.status === 'login_required') {
          markSupplierSessionRequired();
          updateImageImportRow(row.rowId, {
            status: 'login_required',
            approved: false,
            message: result.message || 'Necesita login del proveedor.',
          });
          break;
        }

        if (result?.status === 'found') {
          const rawCandidates = Array.isArray(result.candidates) && result.candidates.length > 0
            ? result.candidates
            : [{
                foundTitle: result.foundTitle || row.title,
                imageUrl: result.imageUrl || '',
                productUrl: result.productUrl || result.sourceUrl || '',
                casaAlbertoId: result.casaAlbertoId || result.externalProductId || '',
                supplierCode: result.supplierCode || '',
                imageDataUrl: result.imageDataUrl || '',
                width: result.width || 0,
                height: result.height || 0,
                score: result.score || 0,
                matchQuality: result.matchQuality || '',
                titleSimilarity: result.titleSimilarity || 0,
              }];
          const candidates = rawCandidates.map((candidate) => ({
            ...candidate,
            originalImageDataUrl: candidate.originalImageDataUrl || candidate.imageDataUrl || '',
          }));
          const selectedCandidate = candidates[0] || {};
          const isTitleSimilarityMatch = selectedCandidate.matchQuality === 'title_similarity' || result.matchQuality === 'title_similarity';
          const isTrimmedBarcodeMatch = result.fallbackSearch === 'trimmed_barcode';
          updateImageImportRow(row.rowId, {
            status: 'found',
            approved: false,
            candidates,
            selectedCandidateIndex: 0,
            foundTitle: selectedCandidate.foundTitle || result.foundTitle || row.title,
                imageUrl: selectedCandidate.imageUrl || result.imageUrl || '',
            productUrl: selectedCandidate.productUrl || result.productUrl || result.url || '',
            casaAlbertoId: selectedCandidate.casaAlbertoId || selectedCandidate.externalProductId || result.casaAlbertoId || result.externalProductId || '',
            supplierCode: selectedCandidate.supplierCode || result.supplierCode || '',
            imageDataUrl: selectedCandidate.imageDataUrl || result.imageDataUrl || '',
            sourceUrl: result.url || '',
            score: result.score || 0,
            matchQuality: selectedCandidate.matchQuality || result.matchQuality || '',
            fallbackSearch: result.fallbackSearch || '',
            searchedQuery: result.searchedQuery || '',
            searchedBarcode: result.searchedBarcode || '',
            titleSimilarity: selectedCandidate.titleSimilarity || result.titleSimilarity || 0,
            message: isTitleSimilarityMatch
              ? `Coincidencia por nombre${selectedCandidate.titleSimilarity ? ` (${selectedCandidate.titleSimilarity}%)` : ''}`
              : isTrimmedBarcodeMatch
                ? 'Codigo corregido: sin ultimo digito'
              : (candidates.length > 1 ? `${candidates.length} opciones para elegir` : 'Foto encontrada'),
          });
        } else {
          updateImageImportRow(row.rowId, {
            status: result?.status || 'error',
            approved: false,
            message: result?.message || 'No se encontro foto.',
            imageUrl: result?.imageUrl || '',
            sourceUrl: result?.url || '',
          });
        }

        if (imageImportStopRef.current) break;
        await waitForImageImportResume();
        if (imageImportStopRef.current) break;
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
    } finally {
      setIsSearchingImages(false);
      setIsImageImportPaused(false);
      imageImportPausedRef.current = false;
      imageImportStopRef.current = false;
    }
  };

  const toggleImageImportApproval = (rowId) => {
    setImageImportRows((prev) => prev.map((row) => (
      row.rowId === rowId && ['found', 'apply_error'].includes(row.status)
        ? { ...row, approved: !row.approved }
        : row
    )));
  };

  const handleSelectImageCandidate = (rowId, candidateIndex) => {
    setImageImportRows((prev) => prev.map((row) => {
      if (row.rowId !== rowId || !['found', 'apply_error'].includes(row.status)) return row;
      const candidate = row.candidates?.[candidateIndex];
      if (!candidate) return row;
      return {
        ...row,
        selectedCandidateIndex: candidateIndex,
        approved: true,
        foundTitle: candidate.foundTitle || row.foundTitle,
        imageUrl: candidate.imageUrl || row.imageUrl,
        productUrl: candidate.productUrl || row.productUrl || row.sourceUrl,
        casaAlbertoId: candidate.casaAlbertoId || candidate.externalProductId || row.casaAlbertoId || row.externalProductId || '',
        supplierCode: candidate.supplierCode || row.supplierCode || '',
        imageDataUrl: candidate.imageDataUrl || row.imageDataUrl,
        score: candidate.score || row.score,
        matchQuality: candidate.matchQuality || row.matchQuality || '',
        titleSimilarity: candidate.titleSimilarity || row.titleSimilarity || 0,
        message: candidate.matchQuality === 'title_similarity'
          ? `Coincidencia por nombre${candidate.titleSimilarity ? ` (${candidate.titleSimilarity}%)` : ''}`
          : `Opcion ${candidateIndex + 1} seleccionada`,
      };
    }));
  };

  const handleApplyImageImports = async () => {
    const rowsToApply = imageImportRows.filter((row) => (
      ['found', 'apply_error'].includes(row.status) && row.approved && row.imageDataUrl
    ));
    if (rowsToApply.length === 0 || !onApplyProductImageImports) return;

    setIsApplyingImages(true);
    try {
      const result = await onApplyProductImageImports(rowsToApply);
      const appliedIds = new Set((result?.appliedIds || []).map((id) => String(id)));
      const failedById = new Map((result?.failedRows || []).map((row) => [String(row.productId), row.error || 'No aplicado']));
      const updatedById = new Map((result?.products || []).map((product) => [String(product.id), product]));

      if (updatedById.size > 0) {
        setSandboxInventory((prev) => prev.map((product) => updatedById.get(String(product.id)) || product));
      }

      setImageImportRows((prev) => prev.map((row) => {
        if (appliedIds.has(String(row.productId))) {
          return { ...row, status: 'applied', approved: false, message: 'Foto aplicada en Rebu' };
        }
        if (failedById.has(String(row.productId))) {
          return {
            ...row,
            status: row.imageDataUrl ? 'apply_error' : 'error',
            approved: Boolean(row.imageDataUrl),
            message: `No se aplico: ${failedById.get(String(row.productId))}`,
          };
        }
        return row;
      }));

      if (failedById.size > 0) {
        const firstError = [...failedById.values()][0];
        await Swal.fire({
          icon: appliedIds.size > 0 ? 'warning' : 'error',
          title: appliedIds.size > 0 ? 'Algunas fotos quedaron pendientes' : 'No se pudieron guardar las fotos',
          text: appliedIds.size > 0
            ? `${appliedIds.size} foto(s) aplicadas y ${failedById.size} pendiente(s). ${firstError}`
            : `${firstError}. Las fotos elegidas quedaron listas para reintentar.`,
          confirmButtonText: 'Entendido',
          confirmButtonColor: '#0f172a',
        });
      }
    } finally {
      setIsApplyingImages(false);
    }
  };

  const handleOpenImageSource = async (url) => {
    const targetUrl = String(url || '').trim();
    if (!targetUrl) return;
    if (window.electronAPI?.supplierOpenUrl && /cotilloncasaalberto\.com\.ar/i.test(targetUrl)) {
      const result = await window.electronAPI.supplierOpenUrl(targetUrl);
      if (!result?.success) {
        await Swal.fire({
          icon: 'warning',
          title: 'No se pudo abrir Casa Alberto',
          text: result?.error || 'Revisa la sesion del proveedor y volve a intentar.',
          confirmButtonText: 'Entendido',
        });
      }
      return;
    }
    if (window.electronAPI?.openExternalUrl) {
      await window.electronAPI.openExternalUrl(targetUrl);
      return;
    }
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  };

  const centerProductImageDataUrl = (dataUrl) => new Promise((resolve, reject) => {
    if (!dataUrl) {
      reject(new Error('No hay imagen para centrar.'));
      return;
    }

    const image = new Image();
    image.onload = () => {
      const sourceWidth = image.naturalWidth || image.width;
      const sourceHeight = image.naturalHeight || image.height;
      if (!sourceWidth || !sourceHeight) {
        reject(new Error('La imagen no tiene dimensiones validas.'));
        return;
      }

      const probe = document.createElement('canvas');
      probe.width = sourceWidth;
      probe.height = sourceHeight;
      const probeContext = probe.getContext('2d', { willReadFrequently: true });
      probeContext.drawImage(image, 0, 0);

      const pixels = probeContext.getImageData(0, 0, sourceWidth, sourceHeight).data;
      const cornerSamples = [
        [0, 0],
        [sourceWidth - 1, 0],
        [0, sourceHeight - 1],
        [sourceWidth - 1, sourceHeight - 1],
      ].map(([x, y]) => {
        const index = (y * sourceWidth + x) * 4;
        return [pixels[index], pixels[index + 1], pixels[index + 2]];
      });
      const background = cornerSamples.reduce((acc, sample) => (
        [acc[0] + sample[0], acc[1] + sample[1], acc[2] + sample[2]]
      ), [0, 0, 0]).map((value) => Math.round(value / cornerSamples.length));

      let minX = sourceWidth;
      let minY = sourceHeight;
      let maxX = 0;
      let maxY = 0;
      let foundContent = false;
      const step = Math.max(1, Math.floor(Math.max(sourceWidth, sourceHeight) / 700));

      for (let y = 0; y < sourceHeight; y += step) {
        for (let x = 0; x < sourceWidth; x += step) {
          const index = (y * sourceWidth + x) * 4;
          const alpha = pixels[index + 3];
          const diff = Math.abs(pixels[index] - background[0])
            + Math.abs(pixels[index + 1] - background[1])
            + Math.abs(pixels[index + 2] - background[2]);
          if (alpha > 20 && diff > 42) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
            foundContent = true;
          }
        }
      }

      if (!foundContent || maxX <= minX || maxY <= minY) {
        resolve(dataUrl);
        return;
      }

      const contentWidth = maxX - minX + step;
      const contentHeight = maxY - minY + step;
      const targetSize = Math.max(720, Math.min(1200, Math.max(sourceWidth, sourceHeight)));
      const scale = Math.min((targetSize * 0.74) / contentWidth, (targetSize * 0.74) / contentHeight);
      const drawWidth = sourceWidth * scale;
      const drawHeight = sourceHeight * scale;
      const contentCenterX = (minX + contentWidth / 2) * scale;
      const contentCenterY = (minY + contentHeight / 2) * scale;

      const output = document.createElement('canvas');
      output.width = targetSize;
      output.height = targetSize;
      const outputContext = output.getContext('2d');
      outputContext.fillStyle = `rgb(${background[0]}, ${background[1]}, ${background[2]})`;
      outputContext.fillRect(0, 0, targetSize, targetSize);
      outputContext.drawImage(
        image,
        targetSize / 2 - contentCenterX,
        targetSize / 2 - contentCenterY,
        drawWidth,
        drawHeight
      );
      resolve(output.toDataURL('image/jpeg', 0.92));
    };
    image.onerror = () => reject(new Error('No se pudo cargar la imagen para centrar.'));
    image.src = dataUrl;
  });

  const handleCenterImageCandidate = async (rowId, candidateIndex) => {
    const row = imageImportRows.find((item) => item.rowId === rowId);
    const candidate = row?.candidates?.[candidateIndex];
    const originalDataUrl = candidate?.originalImageDataUrl || candidate?.imageDataUrl || row?.imageDataUrl;
    const sourceDataUrl = candidate?.imageDataUrl || originalDataUrl;
    if (!row || !candidate || !sourceDataUrl) return;

    try {
      if (candidate.centered && originalDataUrl) {
        setImageImportRows((prev) => prev.map((item) => {
          if (item.rowId !== rowId) return item;
          const nextCandidates = (item.candidates || []).map((nextCandidate, index) => (
            index === candidateIndex
              ? {
                  ...nextCandidate,
                  imageDataUrl: originalDataUrl,
                  originalImageDataUrl: originalDataUrl,
                  centered: false,
                }
              : nextCandidate
          ));
          const isSelected = Number(item.selectedCandidateIndex || 0) === candidateIndex;
          return {
            ...item,
            candidates: nextCandidates,
            imageDataUrl: isSelected ? originalDataUrl : item.imageDataUrl,
            message: isSelected ? 'Foto original restaurada' : item.message,
          };
        }));
        return;
      }

      const centeredDataUrl = await centerProductImageDataUrl(originalDataUrl);
      setImageImportRows((prev) => prev.map((item) => {
        if (item.rowId !== rowId) return item;
        const nextCandidates = (item.candidates || []).map((nextCandidate, index) => (
          index === candidateIndex
            ? {
                ...nextCandidate,
                imageDataUrl: centeredDataUrl,
                originalImageDataUrl: originalDataUrl,
                centered: true,
              }
            : nextCandidate
        ));
        const isSelected = Number(item.selectedCandidateIndex || 0) === candidateIndex;
        return {
          ...item,
          candidates: nextCandidates,
          imageDataUrl: isSelected ? centeredDataUrl : item.imageDataUrl,
          message: isSelected ? 'Foto centrada' : item.message,
        };
      }));
    } catch (error) {
      Swal.fire({
        icon: 'error',
        title: 'No se pudo centrar',
        text: error?.message || 'La imagen no pudo ajustarse.',
        confirmButtonColor: '#0f172a',
      });
    }
  };

  const handleClearPreview = async () => {
    const totalItems = exportItems.length;

    if (totalItems === 0) return;

    const result = await Swal.fire({
      title: '¿Querés limpiar el presupuesto?',
      text: `Hay ${totalItems} ítem(s) en la lista. Se borrarán para empezar desde cero.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Sí, limpiar todo',
      cancelButtonText: 'No, cancelar',
      reverseButtons: true
    });

    if (result.isConfirmed) {
      setExportItems([]); 
      setSelectedIds([]); 
      
      Swal.fire({
        title: '¡Limpieza exitosa!',
        text: 'El presupuesto quedó en cero.',
        icon: 'success',
        timer: 1500,
        showConfirmButton: false
      });
    }
  };

  const getOriginalVal = (p, field) => {
    const isWeight = p.product_type === 'weight';
    if (field === 'stock') return Number(p[field]) || 0;
    if (field === 'purchasePrice') {
      return getVisibleProductPurchaseCost(p[field], p.product_type);
    }
    return isWeight ? Math.round((Number(p[field]) || 0) * 1000) : (Number(p[field]) || 0);
  };

  const hasChanges = (p) => {
    if (!edits[p.id]) return false;
    return Number(edits[p.id].price) !== getOriginalVal(p, 'price') || 
           Number(edits[p.id].purchasePrice) !== getOriginalVal(p, 'purchasePrice') || 
           Number(edits[p.id].stock) !== getOriginalVal(p, 'stock');
  };

  const hasPendingBulkChanges = sandboxInventory.some((p) => hasChanges(p));
  const bulkPricingPreview = useMemo(() => {
    const selectedId = selectedIds.find((id) => Number(edits[id]?.purchasePrice) > 0);
    if (!selectedId) return null;
    return calculateGrossMarginPricing({
      cost: Number(edits[selectedId]?.purchasePrice),
      costIncludesVat: pricingPreferences.bulkCostIncludesVat,
      marginPercent: pricingPreferences.marginPercent,
    });
  }, [edits, pricingPreferences.bulkCostIncludesVat, pricingPreferences.marginPercent, selectedIds]);

  const calculateDiffPercent = (oldVal, newVal) => {
    if (oldVal === 0) return newVal > 0 ? '+100%' : null;
    const diff = ((newVal - oldVal) / oldVal) * 100;
    if (diff === 0) return null;
    return diff > 0 ? `+${diff.toFixed(1)}%` : `${diff.toFixed(1)}%`;
  };

  const formatSupplierMoney = (value) => {
    const numberValue = Number(value || 0);
    if (!Number.isFinite(numberValue)) return '$0';
    return numberValue.toLocaleString('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: numberValue % 1 === 0 ? 0 : 2,
    });
  };

  const formatSupplierDate = (value) => {
    if (!value) return 'Sin chequear';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Sin chequear';
    return date.toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getSupplierPreviewImage = (group) => (
    group?.supplierImageUrl ||
    group?.products?.map((product) => getProductImageUrl(product)).find(Boolean) ||
    ''
  );

  const getSupplierSelectedCount = (group) => getSelectedProductsForGroup(group).length;
  const supplierPriceRules = useMemo(() => ({
    vatPercent: DEFAULT_VAT_PERCENT,
    vatRate: DEFAULT_VAT_PERCENT / 100,
    grossMarginPercent: pricingPreferences.marginPercent,
    grossMarginRate: pricingPreferences.marginPercent / 100,
  }), [pricingPreferences.marginPercent]);
  const supplierPriceRulePayload = {
    vatPercent: supplierPriceRules.vatPercent,
    vatRate: supplierPriceRules.vatRate,
    grossMarginPercent: supplierPriceRules.grossMarginPercent,
    grossMarginRate: supplierPriceRules.grossMarginRate,
    formulaVersion: GROSS_MARGIN_FORMULA_VERSION,
  };
  const getSupplierEstimatedCost = useCallback((supplierPrice) =>
    buildCasaAlbertoEstimatedCost(supplierPrice, supplierPriceRules), [supplierPriceRules]);
  const getSupplierSuggestedSale = useCallback((product, supplierPrice) =>
    buildSuggestedSalePriceFromMargin(product, supplierPrice, supplierPriceRules), [supplierPriceRules]);

  const getSupplierPriceInfo = useCallback((group = {}, nextPatch = {}) => {
    const tracking = group.tracking || {};
    const override = supplierPriceOverrides[group.key] || {};
    const rawSource = Object.prototype.hasOwnProperty.call(nextPatch, 'supplierPrice')
      ? nextPatch.supplierPrice
      : Object.prototype.hasOwnProperty.call(override, 'supplierPrice')
        ? override.supplierPrice
        : group.rawSupplierPrice ?? tracking.rawSupplierPrice ?? group.supplierPrice ?? tracking.lastSupplierPrice ?? 0;
    // El divisor es el cociente entre el pack de Casa Alberto y el de Rebu.
    // Si las dos puntas traen pack, `divisor` viene en null: no se adivina.
    const deteccionUnidades = resolveUnitDivisor({
      supplierTitle: group.supplierTitle,
      rebuTitle: Array.isArray(group.products) ? (group.products[0]?.title || '') : '',
    });
    const divisorAmbiguo = deteccionUnidades.divisor === null;
    const detectedDivisor = deteccionUnidades.divisor ?? 1;
    const divisorSource = Object.prototype.hasOwnProperty.call(nextPatch, 'unitDivisor')
      ? nextPatch.unitDivisor
      : Object.prototype.hasOwnProperty.call(override, 'unitDivisor')
        ? override.unitDivisor
        : group.unitDivisor ?? tracking.unitDivisor ?? detectedDivisor;
    const rawSupplierPrice = parseSupplierNumber(rawSource);
    const unitDivisor = normalizeSupplierDivisor(divisorSource, detectedDivisor || 1);
    const unitSupplierPrice = rawSupplierPrice > 0 ? Number((rawSupplierPrice / unitDivisor).toFixed(2)) : 0;

    return {
      rawSupplierPrice,
      supplierPrice: rawSupplierPrice,
      unitDivisor,
      detectedDivisor,
      divisorAmbiguo,
      divisorReason: deteccionUnidades.reason,
      unitSupplierPrice,
      hasSupplierPrice: Number.isFinite(rawSupplierPrice) && rawSupplierPrice > 0,
      hasManualSupplierPrice: Object.prototype.hasOwnProperty.call(override, 'supplierPrice'),
      hasManualDivisor: Object.prototype.hasOwnProperty.call(override, 'unitDivisor'),
    };
  }, [supplierPriceOverrides]);

  const updateSupplierPriceOverride = (groupKey, patch = {}) => {
    setSupplierPriceOverrides((prev) => ({
      ...prev,
      [groupKey]: {
        ...(prev[groupKey] || {}),
        ...patch,
      },
    }));
  };

  const clearSupplierPriceOverrides = (groupKeys = []) => {
    const keysToClear = new Set((Array.isArray(groupKeys) ? groupKeys : [groupKeys]).filter(Boolean).map(String));
    if (keysToClear.size === 0) return;
    setSupplierPriceOverrides((prev) => {
      let changed = false;
      const next = { ...prev };
      keysToClear.forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(next, key)) {
          delete next[key];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  };

  const clearSupplierPriceOverride = (groupKey, fields = []) => {
    if (!fields || fields.length === 0) {
      clearSupplierPriceOverrides([groupKey]);
      return;
    }
    setSupplierPriceOverrides((prev) => {
      const current = prev[groupKey] || {};
      const next = { ...current };
      fields.forEach((field) => {
        delete next[field];
      });
      if (Object.keys(next).length === 0) {
        const { [groupKey]: _removed, ...rest } = prev;
        return rest;
      }
      return {
        ...prev,
        [groupKey]: next,
      };
    });
  };

  const getSupplierStoredFinalSaleValue = (groupKey, productId) => {
    const finalSalePrices = supplierPriceOverrides[groupKey]?.finalSalePrices || {};
    const productKey = String(productId);
    return Object.prototype.hasOwnProperty.call(finalSalePrices, productKey)
      ? finalSalePrices[productKey]
      : undefined;
  };

  const updateSupplierFinalSaleOverride = (groupKey, productId, value) => {
    const productKey = String(productId);
    setSupplierPriceOverrides((prev) => {
      const groupOverrides = prev[groupKey] || {};
      return {
        ...prev,
        [groupKey]: {
          ...groupOverrides,
          finalSalePrices: {
            ...(groupOverrides.finalSalePrices || {}),
            [productKey]: value,
          },
        },
      };
    });
  };

  const getSupplierFinalSaleInputValue = (group, product, suggestedSale = 0) => {
    const storedValue = getSupplierStoredFinalSaleValue(group.key, product.id);
    if (storedValue !== undefined) return storedValue;
    const currentSale = Number(product.price || 0);
    if (Number.isFinite(currentSale) && currentSale > 0) return currentSale;
    return suggestedSale || '';
  };

  const getSupplierFinalSalePrice = (group, product, suggestedSale = 0) => {
    const inputValue = getSupplierFinalSaleInputValue(group, product, suggestedSale);
    const parsedValue = parseSupplierNumber(inputValue);
    if (Number.isFinite(parsedValue) && parsedValue > 0) return parsedValue;
    return Number(suggestedSale || 0);
  };

  const stepSupplierFinalSaleOverride = (group, product, suggestedSale = 0, delta = 0) => {
    const currentValue = getSupplierFinalSalePrice(group, product, suggestedSale);
    const nextValue = Math.max(0, Math.round(currentValue + delta));
    updateSupplierFinalSaleOverride(group.key, product.id, nextValue);
  };

  const hasSupplierFinalSaleOverrides = (group) => {
    const finalSalePrices = supplierPriceOverrides[group.key]?.finalSalePrices;
    return Boolean(finalSalePrices && Object.keys(finalSalePrices).length > 0);
  };

  const getSupplierCardMath = (group) => {
    const priceInfo = getSupplierPriceInfo(group);
    const supplierPrice = priceInfo.rawSupplierPrice;
    const unitSupplierPrice = priceInfo.unitSupplierPrice;
    const hasSupplierPrice = priceInfo.hasSupplierPrice;
    const estimatedCost = hasSupplierPrice
      ? getSupplierEstimatedCost(unitSupplierPrice)
      : 0;
    const firstProduct = group?.products?.[0] || {};
    const suggestedSale = hasSupplierPrice
      ? getSupplierSuggestedSale(firstProduct, unitSupplierPrice)
      : 0;
    const costValues = group?.products?.length
      ? group.products.map((product) => Number(product.purchasePrice || 0)).filter((value) => Number.isFinite(value))
      : [];
    const saleValues = group?.products?.length
      ? group.products.map((product) => Number(product.price || 0)).filter((value) => Number.isFinite(value))
      : [];
    const currentCost = costValues.length ? Math.min(...costValues) : 0;
    const currentSale = saleValues.length ? Math.min(...saleValues) : 0;
    const currentCostMax = costValues.length ? Math.max(...costValues) : 0;
    const currentSaleMax = saleValues.length ? Math.max(...saleValues) : 0;

    return {
      supplierPrice,
      rawSupplierPrice: priceInfo.rawSupplierPrice,
      unitSupplierPrice,
      unitDivisor: priceInfo.unitDivisor,
      detectedDivisor: priceInfo.detectedDivisor,
      divisorAmbiguo: priceInfo.divisorAmbiguo,
      divisorReason: priceInfo.divisorReason,
      hasManualSupplierPrice: priceInfo.hasManualSupplierPrice,
      hasManualDivisor: priceInfo.hasManualDivisor,
      hasManualOverride: priceInfo.hasManualSupplierPrice || priceInfo.hasManualDivisor,
      hasSupplierPrice,
      estimatedCost,
      suggestedSale,
      currentCost: Number.isFinite(currentCost) ? currentCost : 0,
      currentSale: Number.isFinite(currentSale) ? currentSale : 0,
      currentCostMax: Number.isFinite(currentCostMax) ? currentCostMax : 0,
      currentSaleMax: Number.isFinite(currentSaleMax) ? currentSaleMax : 0,
    };
  };

  const getSupplierPriceStatusMeta = (status) => {
    if (status === 'changed') {
      return {
        label: 'Con cambio',
        className: 'border-amber-400/40 bg-amber-400/12 text-amber-200',
        railClassName: 'bg-amber-400',
      };
    }
    if (status === 'price_down') {
      return {
        label: 'Bajo precio',
        className: 'border-sky-400/35 bg-sky-400/12 text-sky-200',
        railClassName: 'bg-sky-400',
      };
    }
    if (status === 'review_required' || status === 'suggested_link' || status === 'dubious_link') {
      return {
        label: status === 'dubious_link' ? 'Enlace dudoso' : 'Requiere revision',
        className: 'border-amber-300/35 bg-amber-300/12 text-amber-100',
        railClassName: 'bg-amber-300',
      };
    }
    if (status === 'reviewed') {
      return {
        label: 'Revisado',
        className: 'border-emerald-400/35 bg-emerald-400/12 text-emerald-200',
        railClassName: 'bg-emerald-400',
      };
    }
    if (status === 'approved' || status === 'ignored') {
      return {
        label: status === 'ignored' ? 'Ignorado' : 'Revisado',
        className: 'border-cyan-400/35 bg-cyan-400/12 text-cyan-200',
        railClassName: 'bg-cyan-400',
      };
    }
    if (status === 'error' || status === 'login_required') {
      return {
        label: status === 'login_required' ? 'Login requerido' : 'Error',
        className: 'border-rose-400/35 bg-rose-400/12 text-rose-200',
        railClassName: 'bg-rose-400',
      };
    }
    return {
      label: 'Sin revisar',
      className: 'border-slate-500/40 bg-slate-800/70 text-slate-300',
      railClassName: 'bg-slate-500',
    };
  };

  const getSupplierGroupComputedStatus = useCallback((group) => {
    const localStatus = supplierPriceRows[group.key]?.status;
    if (localStatus === 'error' || localStatus === 'login_required') return localStatus;
    if (localStatus === 'ignored') return 'ignored';

    const priceInfo = getSupplierPriceInfo(group);
    const hasSupplierPrice = priceInfo.hasSupplierPrice;
    const estimatedCost = getSupplierEstimatedCost(priceInfo.unitSupplierPrice);
    const reviewedStatus = localStatus || group.tracking.reviewStatus;

    if (reviewedStatus === 'ignored') return 'ignored';
    if (reviewedStatus === 'approved') return 'reviewed';

    const hasCostIncrease = hasSupplierPrice && group.products.some((product) =>
      estimatedCost - Number(product.purchasePrice || 0) >= 0.01
    );
    const hasCostDecrease = hasSupplierPrice && !hasCostIncrease && group.products.some((product) =>
      Number(product.purchasePrice || 0) - estimatedCost >= 0.01
    );

    if (hasCostIncrease) return 'changed';
    if (hasCostDecrease) return 'price_down';
    if (group.tracking.lastCheckedAt || localStatus === 'reviewed') return 'reviewed';
    return 'unchecked';
  }, [supplierPriceRows, getSupplierEstimatedCost, getSupplierPriceInfo]);

  const casaAlbertoGroups = useMemo(() => {
    const groups = new Map();

    sandboxInventory
      .filter(productHasCasaAlbertoLink)
      .filter(getProductActiveState)
      .forEach((product) => {
        const key = buildCasaAlbertoGroupKey(product);
        const link = getCasaAlbertoLink(product);
        const tracking = getCasaAlbertoPriceTracking(product);
        const localRow = supplierPriceRows[key] || {};
        const existing = groups.get(key);
        const base = existing || {
          key,
          products: [],
          link,
          tracking,
          supplierTitle: localRow.foundTitle || link.foundTitle || product.title || 'Producto Casa Alberto',
          supplierCode: localRow.supplierCode || link.providerCode || '',
          casaAlbertoId: localRow.casaAlbertoId || link.casaAlbertoId || '',
          productUrl: localRow.productUrl || link.productUrl || '',
          supplierPrice: localRow.supplierPrice ?? tracking.lastSupplierPrice ?? null,
          rawSupplierPrice: localRow.rawSupplierPrice ?? tracking.rawSupplierPrice ?? localRow.supplierPrice ?? tracking.lastSupplierPrice ?? null,
          unitSupplierPrice: localRow.unitSupplierPrice ?? tracking.unitSupplierPrice ?? null,
          unitDivisor: localRow.unitDivisor ?? tracking.unitDivisor ?? null,
          previousSupplierPrice: localRow.previousSupplierPrice ?? tracking.previousSupplierPrice ?? null,
          lastCheckedAt: localRow.lastCheckedAt || tracking.lastCheckedAt || '',
          message: localRow.message || tracking.message || '',
          sourceUrl: localRow.sourceUrl || tracking.sourceUrl || link.productUrl || '',
          priceText: localRow.priceText || tracking.priceText || '',
          supplierImageUrl: localRow.imageUrl || link.imageUrl || tracking.imageUrl || '',
        };

        base.products.push(product);
        groups.set(key, base);
      });

    return Array.from(groups.values())
      .map((group) => {
        const status = getSupplierGroupComputedStatus(group);
        const priceInfo = getSupplierPriceInfo(group);
        const supplierPrice = priceInfo.rawSupplierPrice;
        const estimatedCost = getSupplierEstimatedCost(priceInfo.unitSupplierPrice);
        return {
          ...group,
          status,
          estimatedCost,
          suggestedSalePrice: supplierPrice > 0
            ? getSupplierSuggestedSale(group.products[0], priceInfo.unitSupplierPrice)
            : 0,
          rawSupplierPrice: priceInfo.rawSupplierPrice,
          unitSupplierPrice: priceInfo.unitSupplierPrice,
          unitDivisor: priceInfo.unitDivisor,
        };
      })
      .sort((a, b) => {
        const statusWeight = { changed: 0, login_required: 1, error: 2, review_required: 3, dubious_link: 4, price_down: 5, unchecked: 6, reviewed: 7, approved: 8, ignored: 9 };
        return (statusWeight[a.status] ?? 9) - (statusWeight[b.status] ?? 9) ||
          String(a.supplierTitle || '').localeCompare(String(b.supplierTitle || ''));
      });
  }, [sandboxInventory, supplierPriceRows, getSupplierGroupComputedStatus, getSupplierEstimatedCost, getSupplierPriceInfo, getSupplierSuggestedSale]);

  const supplierPricePendingCount = casaAlbertoGroups.filter((group) => group.status === 'changed').length;
  const supplierPriceErrorCount = casaAlbertoGroups.filter((group) => group.status === 'error' || group.status === 'login_required').length;
  const supplierPriceNoticeCount = casaAlbertoGroups.filter((group) => group.status === 'price_down' || group.status === 'dubious_link' || group.status === 'review_required').length;
  const supplierPriceBadgeCount =
    supplierPricePendingCount + supplierPriceErrorCount + supplierPriceNoticeCount + supplierLinkSuggestions.length;
  const supplierPriceSearchWords = normalizeSupplierSearchValue(supplierPriceSearchTerm)
    .split(/\s+/)
    .filter(Boolean);
  const selectedSupplierGroupKeySet = new Set(selectedSupplierGroupKeys.map(String));
  const visibleCasaAlbertoGroups = casaAlbertoGroups.filter((group) => {
    let matchesFilter = supplierPriceFilter === 'all';
    if (supplierPriceFilter === 'selected') matchesFilter = selectedSupplierGroupKeySet.has(String(group.key));
    else if (supplierPriceFilter === 'error') matchesFilter = group.status === 'error' || group.status === 'login_required';
    else if (supplierPriceFilter === 'reviewed') matchesFilter = group.status === 'reviewed' || group.status === 'approved' || group.status === 'ignored';
    else if (supplierPriceFilter === 'notice') matchesFilter = group.status === 'price_down' || group.status === 'dubious_link' || group.status === 'review_required';
    else if (!matchesFilter) matchesFilter = group.status === supplierPriceFilter;
    if (!matchesFilter) return false;
    if (supplierPriceSearchWords.length === 0) return true;

    const searchableText = normalizeSupplierSearchValue([
      group.supplierTitle,
      group.supplierCode,
      group.casaAlbertoId,
      group.productUrl,
      group.sourceUrl,
      group.products.map((product) => [
        product.id,
        product.title,
        product.barcode,
        product.category,
      ].filter(Boolean).join(' ')).join(' '),
    ].filter(Boolean).join(' '));

    return supplierPriceSearchWords.every((word) => searchableText.includes(word));
  });
  const casaAlbertoLinkCandidates = useMemo(() => (
    sandboxInventory
      .filter((product) => !productHasCasaAlbertoLink(product) && String(product.title || '').trim())
      .filter(getProductActiveState)
      .sort((a, b) => {
        const aHasCode = String(a.barcode || '').trim() ? 0 : 1;
        const bHasCode = String(b.barcode || '').trim() ? 0 : 1;
        return aHasCode - bHasCode || String(a.title || '').localeCompare(String(b.title || ''));
      })
  ), [sandboxInventory]);

  const selectedSupplierGroups = useMemo(() => {
    const selected = new Set(selectedSupplierGroupKeys.map(String));
    return casaAlbertoGroups.filter((group) => selected.has(String(group.key)));
  }, [casaAlbertoGroups, selectedSupplierGroupKeys]);
  const visibleSupplierGroupKeys = visibleCasaAlbertoGroups.map((group) => String(group.key));
  const selectedVisibleSupplierGroupsCount = visibleSupplierGroupKeys.filter((key) => selectedSupplierGroupKeySet.has(key)).length;
  const areAllVisibleSupplierGroupsSelected =
    visibleSupplierGroupKeys.length > 0 && visibleSupplierGroupKeys.every((key) => selectedSupplierGroupKeySet.has(key));

  const supplierDetailGroup = useMemo(
    () => casaAlbertoGroups.find((group) => group.key === supplierDetailGroupKey) || null,
    [casaAlbertoGroups, supplierDetailGroupKey],
  );

  const normalizeSupplierDigits = (value) => {
    const digits = String(value || '').replace(/\D/g, '');
    return digits.replace(/^0+/, '') || digits;
  };

  const getDetectedSupplierMatchMode = (product, result) => {
    const productCode = normalizeSupplierDigits(product?.barcode);
    const supplierCode = normalizeSupplierDigits(result?.supplierCode);
    if (productCode && supplierCode) {
      if (productCode === supplierCode) return 'barcode_exact';
      if (productCode.slice(0, -1) === supplierCode || supplierCode.slice(0, -1) === productCode) {
        return 'trimmed_barcode';
      }
    }
    return 'title_search';
  };

  const getCasaAlbertoIdFromUrl = (url) => {
    try {
      return new URL(String(url || '')).searchParams.get('idp') || '';
    } catch {
      return '';
    }
  };

  const updateSandboxProducts = (products = []) => {
    const safeProducts = Array.isArray(products) ? products.filter(Boolean) : [];
    if (safeProducts.length === 0) return;
    const updatedById = new Map(safeProducts.map((product) => [String(product.id), product]));
    setSandboxInventory((prev) => prev.map((product) => updatedById.get(String(product.id)) || product));
  };

  const getSupplierStatusForPrice = (products = [], supplierPrice = 0, fallback = 'reviewed') => {
    const estimatedCost = getSupplierEstimatedCost(supplierPrice);
    if (!estimatedCost) return fallback;
    const hasIncrease = products.some((product) => estimatedCost - Number(product.purchasePrice || 0) >= 0.01);
    if (hasIncrease) return 'changed';
    const hasDecrease = products.some((product) => Number(product.purchasePrice || 0) - estimatedCost >= 0.01);
    if (hasDecrease) return 'price_down';
    return 'reviewed';
  };

  const buildSupplierPricePayload = (group, product, overrides = {}) => {
    const priceInfo = getSupplierPriceInfo(group, overrides);
    const estimatedCost = getSupplierEstimatedCost(priceInfo.unitSupplierPrice);
    const suggestedSalePrice = getSupplierSuggestedSale(product, priceInfo.unitSupplierPrice);
    const finalSalePrice = Object.prototype.hasOwnProperty.call(overrides, 'finalSalePrice')
      ? parseSupplierNumber(overrides.finalSalePrice)
      : getSupplierFinalSalePrice(group, product, suggestedSalePrice);
    return {
      supplierPrice: priceInfo.rawSupplierPrice,
      rawSupplierPrice: priceInfo.rawSupplierPrice,
      unitSupplierPrice: priceInfo.unitSupplierPrice,
      unitDivisor: priceInfo.unitDivisor,
      approvedCost: estimatedCost,
      estimatedCost,
      suggestedSalePrice,
      finalSalePrice: finalSalePrice > 0 ? finalSalePrice : suggestedSalePrice,
      ...supplierPriceRulePayload,
    };
  };

  const getSelectedProductsForGroup = (group) => {
    const storedIds = supplierProductSelectionByGroup[group.key];
    if (!Array.isArray(storedIds) || storedIds.length === 0) return group.products;
    const selected = new Set(storedIds.map(String));
    return group.products.filter((product) => selected.has(String(product.id)));
  };

  const toggleSupplierGroupSelection = (groupKey) => {
    setSelectedSupplierGroupKeys((prev) => (
      prev.includes(groupKey)
        ? prev.filter((key) => key !== groupKey)
        : [...prev, groupKey]
    ));
  };

  const toggleVisibleSupplierGroupsSelection = () => {
    if (visibleSupplierGroupKeys.length === 0) return;
    setSelectedSupplierGroupKeys((prev) => {
      const current = new Set(prev.map(String));
      if (visibleSupplierGroupKeys.every((key) => current.has(key))) {
        return prev.filter((key) => !visibleSupplierGroupKeys.includes(String(key)));
      }
      visibleSupplierGroupKeys.forEach((key) => current.add(key));
      return Array.from(current);
    });
  };

  const toggleSupplierProductSelection = (group, productId) => {
    if (!group || group.products.length <= 1) return;
    setSupplierProductSelectionByGroup((prev) => {
      const current = Array.isArray(prev[group.key])
        ? prev[group.key].map(String)
        : group.products.map((product) => String(product.id));
      const productKey = String(productId);
      const next = current.includes(productKey)
        ? current.filter((id) => id !== productKey)
        : [...current, productKey];
      return {
        ...prev,
        [group.key]: next.length > 0 ? next : current,
      };
    });
  };

  const waitIfSupplierPricePaused = async () => {
    while (supplierPriceCheckPausedRef.current && !supplierPriceCheckStopRef.current) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  };

  const showSupplierOfflineNotice = () => {
    Swal.fire('Modo sin conexion', 'Reconecta la nube antes de chequear o aprobar costos de Casa Alberto.', 'info');
  };

  const showSupplierActionFailure = (message) => {
    Swal.fire({
      icon: 'error',
      title: 'No se pudo guardar el control de costos',
      text: message || 'Reintenta en unos segundos.',
      confirmButtonText: 'Entendido',
      confirmButtonColor: '#0f172a',
    });
  };

  const requireSupplierMutationProducts = (result, expectedCount, fallbackMessage) => {
    const products = Array.isArray(result?.products) ? result.products.filter(Boolean) : [];
    if (products.length !== expectedCount) {
      throw new Error(result?.error || fallbackMessage || 'La base no confirmó todos los cambios solicitados.');
    }
    return products;
  };

  const handleCheckSupplierPriceGroup = async (group, { rethrowErrors = false } = {}) => {
    if (isOfflineReadOnly) {
      showSupplierOfflineNotice();
      return null;
    }
    if (!window.electronAPI?.supplierPriceSearch) {
      Swal.fire('Electron requerido', 'El chequeo de Casa Alberto necesita la app de escritorio.', 'info');
      return null;
    }

    setCheckingSupplierGroupKey(group.key);
    try {
      const result = await window.electronAPI.supplierPriceSearch({
        productUrl: group.productUrl,
        casaAlbertoId: group.casaAlbertoId,
        supplierCode: group.supplierCode,
        title: group.supplierTitle || group.products[0]?.title || '',
      });
      const checkedAt = new Date().toISOString();

      // Piso de confianza: el lector puede devolver 'found' habiendo leido una
      // pagina que no es la ficha de este producto (el carrito, otro articulo).
      // Guardar ese precio es peor que no guardar nada.
      const confianzaLectura = evaluateSupplierReadResult({
        expected: { casaAlbertoId: group.casaAlbertoId, supplierCode: group.supplierCode },
        result,
      });

      if (result?.status === 'found' && !confianzaLectura.accepted) {
        const rowState = {
          status: 'dubious_link',
          foundTitle: result.foundTitle || '',
          productUrl: result.productUrl || result.sourceUrl || group.productUrl || '',
          sourceUrl: result.sourceUrl || result.productUrl || group.productUrl || '',
          casaAlbertoId: group.casaAlbertoId,
          supplierCode: group.supplierCode,
          previousSupplierPrice: Number(group.tracking?.lastSupplierPrice || 0) || null,
          lastCheckedAt: checkedAt,
          brokenReason: confianzaLectura.reason,
          message: confianzaLectura.reason === 'url_no_es_ficha'
            ? 'La pagina leida no es la ficha del producto. Revisar el enlace.'
            : 'La ficha leida es de otro producto. Revisar el enlace.',
        };
        setSupplierPriceRows((prev) => ({ ...prev, [group.key]: rowState }));
        // Se guarda sin precio a proposito: sin precio, la app no calcula un
        // costo estimado y el estado 'dubious_link' queda a la vista.
        const saveResult = await onSaveSupplierPriceChecks?.(group.products.map((product) => ({
          productId: product.id,
          reviewStatus: 'dubious_link',
          brokenReason: rowState.brokenReason,
          previousSupplierPrice: rowState.previousSupplierPrice,
          lastCheckedAt: checkedAt,
          foundTitle: rowState.foundTitle,
          productUrl: rowState.productUrl,
          sourceUrl: rowState.sourceUrl,
          casaAlbertoId: rowState.casaAlbertoId,
          supplierCode: rowState.supplierCode,
          message: rowState.message,
        })));
        updateSandboxProducts(saveResult?.products);
        return { ...rowState, groupKey: group.key };
      }

      if (result?.status === 'found' && Number(result.supplierPrice) > 0) {
        const supplierPrice = Number(result.supplierPrice);
        const previousSupplierPrice = Number(group.supplierPrice || group.previousSupplierPrice || 0) || null;
        const nextGroup = {
          ...group,
          supplierPrice,
          rawSupplierPrice: supplierPrice,
          supplierTitle: result.foundTitle || group.supplierTitle,
          supplierCode: result.supplierCode || group.supplierCode,
          priceText: result.priceText || '',
        };
        const pricePayload = buildSupplierPricePayload(nextGroup, group.products[0] || {}, { supplierPrice });
        const estimatedCost = pricePayload.estimatedCost;
        const status = getSupplierStatusForPrice(group.products, pricePayload.unitSupplierPrice);
        const hasCostDelta = status === 'changed' || status === 'price_down';
        const rowState = {
          status,
          supplierPrice,
          rawSupplierPrice: pricePayload.rawSupplierPrice,
          unitSupplierPrice: pricePayload.unitSupplierPrice,
          unitDivisor: pricePayload.unitDivisor,
          estimatedCost,
          previousSupplierPrice,
          foundTitle: result.foundTitle || group.supplierTitle,
          supplierCode: result.supplierCode || group.supplierCode,
          casaAlbertoId: result.casaAlbertoId || group.casaAlbertoId,
          productUrl: result.productUrl || group.productUrl,
          sourceUrl: result.sourceUrl || result.productUrl || group.productUrl,
          imageUrl: result.imageUrl || group.supplierImageUrl || '',
          priceText: result.priceText || '',
          lastCheckedAt: checkedAt,
          lastChangedAt: hasCostDelta ? checkedAt : group.tracking.lastChangedAt || null,
          message: status === 'changed'
            ? 'Costo estimado distinto al costo Rebu.'
            : status === 'price_down'
              ? 'Casa Alberto bajo el costo estimado. Revisar sin urgencia.'
              : 'Costo Rebu alineado con Casa Alberto.',
        };

        setSupplierPriceRows((prev) => ({ ...prev, [group.key]: rowState }));
        const saveResult = await onSaveSupplierPriceChecks?.(group.products.map((product) => ({
          productId: product.id,
          ...buildSupplierPricePayload(nextGroup, product, { supplierPrice, unitDivisor: pricePayload.unitDivisor }),
          previousSupplierPrice,
          reviewStatus: status,
          lastCheckedAt: checkedAt,
          lastChangedAt: hasCostDelta ? checkedAt : group.tracking.lastChangedAt || null,
          supplierCode: rowState.supplierCode,
          casaAlbertoId: rowState.casaAlbertoId,
          productUrl: rowState.productUrl,
          foundTitle: rowState.foundTitle,
          sourceUrl: rowState.sourceUrl,
          imageUrl: rowState.imageUrl,
          priceText: rowState.priceText,
          message: rowState.message,
        })));
        updateSandboxProducts(saveResult?.products);
        return { ...rowState, groupKey: group.key };
      }

      const status = result?.status === 'login_required' ? 'login_required' : 'error';
      if (status === 'login_required') markSupplierSessionRequired();
      const rowState = {
        status,
        message: result?.message || 'No se pudo chequear el precio.',
        lastCheckedAt: checkedAt,
      };
      setSupplierPriceRows((prev) => ({ ...prev, [group.key]: rowState }));
      return { ...rowState, groupKey: group.key };
    } catch (error) {
      const message = error?.message || 'No se pudo guardar el control de costos.';
      console.error('Error chequeando costo de proveedor:', error);
      setSupplierPriceRows((prev) => ({
        ...prev,
        [group.key]: {
          status: 'error',
          message,
          lastCheckedAt: new Date().toISOString(),
        },
      }));
      if (rethrowErrors) throw error;
      showSupplierActionFailure(message);
      return { status: 'error', message, groupKey: group.key };
    } finally {
      setCheckingSupplierGroupKey('');
    }
  };

  const handleCheckAllSupplierPrices = async (scope = 'visible') => {
    if (isOfflineReadOnly) {
      showSupplierOfflineNotice();
      return;
    }
    if (isCheckingSupplierPrices) return;
    const groupsToCheck = scope === 'all'
      ? casaAlbertoGroups
      : scope === 'selected'
        ? selectedSupplierGroups
        : visibleCasaAlbertoGroups;
    if (groupsToCheck.length === 0) return;

    supplierPriceCheckStopRef.current = false;
    supplierPriceCheckPausedRef.current = false;
    setIsSupplierPriceCheckPaused(false);
    setIsCheckingSupplierPrices(true);
    const summary = { changed: 0, reviewed: 0, price_down: 0, error: 0, login_required: 0, stopped: false };
    try {
      for (const group of groupsToCheck) {
        if (supplierPriceCheckStopRef.current) {
          summary.stopped = true;
          break;
        }
        await waitIfSupplierPricePaused();
        if (supplierPriceCheckStopRef.current) {
          summary.stopped = true;
          break;
        }
        const result = await handleCheckSupplierPriceGroup(group, { rethrowErrors: true });
        if (result?.status === 'changed') summary.changed += 1;
        else if (result?.status === 'price_down') summary.price_down += 1;
        else if (result?.status === 'reviewed') summary.reviewed += 1;
        else if (result?.status === 'login_required') {
          summary.login_required += 1;
          summary.stopped = true;
          break;
        } else if (result?.status) {
          summary.error += 1;
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      Swal.fire({
        title: summary.stopped ? 'Chequeo detenido' : 'Chequeo terminado',
        text: `${summary.changed} subas, ${summary.price_down} bajas, ${summary.reviewed} sin cambio, ${summary.error + summary.login_required} avisos.`,
        icon: summary.changed > 0 ? 'warning' : 'success',
        confirmButtonColor: '#0f172a',
      });
    } catch (error) {
      console.error('Error en el chequeo masivo de costos:', error);
      showSupplierActionFailure(error?.message || 'El chequeo se detuvo antes de guardar todos los resultados.');
    } finally {
      setIsCheckingSupplierPrices(false);
      supplierPriceCheckStopRef.current = false;
    }
  };

  const pauseSupplierPriceCheck = () => {
    supplierPriceCheckPausedRef.current = true;
    setIsSupplierPriceCheckPaused(true);
  };

  const resumeSupplierPriceCheck = () => {
    supplierPriceCheckPausedRef.current = false;
    setIsSupplierPriceCheckPaused(false);
  };

  const stopSupplierPriceCheck = () => {
    supplierPriceCheckStopRef.current = true;
    supplierPriceCheckPausedRef.current = false;
    setIsSupplierPriceCheckPaused(false);
  };

  const handleApproveSupplierGroup = async (group) => {
    if (isOfflineReadOnly) {
      showSupplierOfflineNotice();
      return;
    }
    const priceInfo = getSupplierPriceInfo(group);
    const supplierPrice = priceInfo.rawSupplierPrice;
    if (!Number.isFinite(supplierPrice) || supplierPrice <= 0) {
      Swal.fire('Falta precio', 'Chequea el proveedor antes de aprobar el costo.', 'info');
      return;
    }

    const productsToApply = getSelectedProductsForGroup(group);
    if (productsToApply.length === 0) {
      Swal.fire('Sin productos', 'Selecciona al menos un producto Rebu asociado.', 'info');
      return;
    }

    try {
      const approvedCost = getSupplierEstimatedCost(priceInfo.unitSupplierPrice);
      const result = await onApplySupplierPriceUpdates?.(productsToApply.map((product) => ({
        productId: product.id,
        ...buildSupplierPricePayload(group, product),
        previousSupplierPrice: Number(product.purchasePrice || 0),
        supplierCode: group.supplierCode,
        casaAlbertoId: group.casaAlbertoId,
        productUrl: group.productUrl,
        foundTitle: group.supplierTitle,
        sourceUrl: group.sourceUrl || group.productUrl,
        imageUrl: group.supplierImageUrl || '',
        priceText: group.priceText || '',
      })));
      const updatedProducts = requireSupplierMutationProducts(
        result,
        productsToApply.length,
        'No se pudo confirmar la aprobación de todos los productos.',
      );

      updateSandboxProducts(updatedProducts);
      clearSupplierPriceOverride(group.key);
      setSupplierPriceRows((prev) => ({
        ...prev,
        [group.key]: {
          ...(prev[group.key] || {}),
          status: 'approved',
          supplierPrice,
          rawSupplierPrice: priceInfo.rawSupplierPrice,
          unitSupplierPrice: priceInfo.unitSupplierPrice,
          unitDivisor: priceInfo.unitDivisor,
          estimatedCost: approvedCost,
          lastCheckedAt: new Date().toISOString(),
        },
      }));
      return true;
    } catch (error) {
      console.error('Error aprobando costo de proveedor:', error);
      showSupplierActionFailure(error?.message || 'No se pudo aprobar el costo.');
      return false;
    }
  };

  const handleIgnoreSupplierGroup = async (group) => {
    if (isOfflineReadOnly) {
      showSupplierOfflineNotice();
      return;
    }
    const priceInfo = getSupplierPriceInfo(group);
    const supplierPrice = priceInfo.rawSupplierPrice;
    if (!Number.isFinite(supplierPrice) || supplierPrice <= 0) return;
    try {
      const productsToSave = getSelectedProductsForGroup(group);
      if (productsToSave.length === 0) {
        Swal.fire('Sin productos', 'Selecciona al menos un producto Rebu asociado.', 'info');
        return false;
      }
      const estimatedCost = getSupplierEstimatedCost(priceInfo.unitSupplierPrice);
      const result = await onSaveSupplierPriceChecks?.(productsToSave.map((product) => ({
        productId: product.id,
        ...buildSupplierPricePayload(group, product),
        previousSupplierPrice: Number(product.purchasePrice || 0),
        supplierCode: group.supplierCode,
        casaAlbertoId: group.casaAlbertoId,
        productUrl: group.productUrl,
        foundTitle: group.supplierTitle,
        sourceUrl: group.sourceUrl || group.productUrl,
        imageUrl: group.supplierImageUrl || '',
        priceText: group.priceText || '',
        reviewStatus: 'ignored',
        lastCheckedAt: new Date().toISOString(),
        message: 'Cambio revisado e ignorado manualmente.',
      })));
      const updatedProducts = requireSupplierMutationProducts(
        result,
        productsToSave.length,
        'No se pudo confirmar el descarte de todos los productos.',
      );
      updateSandboxProducts(updatedProducts);
      clearSupplierPriceOverride(group.key);
      setSupplierPriceRows((prev) => ({
        ...prev,
        [group.key]: {
          ...(prev[group.key] || {}),
          status: 'ignored',
          supplierPrice,
          rawSupplierPrice: priceInfo.rawSupplierPrice,
          unitSupplierPrice: priceInfo.unitSupplierPrice,
          unitDivisor: priceInfo.unitDivisor,
          estimatedCost,
          lastCheckedAt: new Date().toISOString(),
          message: 'Cambio revisado e ignorado manualmente.',
        },
      }));
      return true;
    } catch (error) {
      console.error('Error ignorando costo de proveedor:', error);
      showSupplierActionFailure(error?.message || 'No se pudo guardar el descarte.');
      return false;
    }
  };

  const handleUndoSupplierGroup = async (group) => {
    if (isOfflineReadOnly) {
      showSupplierOfflineNotice();
      return;
    }
    try {
      const productsToUndo = getSelectedProductsForGroup(group);
      const result = await onUndoSupplierPriceUpdates?.(productsToUndo.map((product) => {
        const tracking = getCasaAlbertoPriceTracking(product);
        const priceInfo = getSupplierPriceInfo(group);
        const previousPurchasePrice = Number(
          tracking.previousPurchasePrice ??
          tracking.previousSupplierPrice ??
          group.previousPurchasePrice ??
          group.previousSupplierPrice ??
          0
        );
        return {
          productId: product.id,
          previousPurchasePrice,
          supplierPrice: priceInfo.rawSupplierPrice || Number(tracking.lastSupplierPrice || 0),
          rawSupplierPrice: priceInfo.rawSupplierPrice || Number(tracking.rawSupplierPrice || tracking.lastSupplierPrice || 0),
          unitSupplierPrice: priceInfo.unitSupplierPrice || Number(tracking.unitSupplierPrice || tracking.lastSupplierPrice || 0),
          unitDivisor: priceInfo.unitDivisor || Number(tracking.unitDivisor || 1),
          supplierCode: group.supplierCode,
          casaAlbertoId: group.casaAlbertoId,
          productUrl: group.productUrl,
          foundTitle: group.supplierTitle,
          sourceUrl: group.sourceUrl || group.productUrl,
        };
      }));
      const updatedProducts = requireSupplierMutationProducts(
        result,
        productsToUndo.length,
        'No se pudo confirmar la restauración de todos los productos.',
      );
      updateSandboxProducts(updatedProducts);
      clearSupplierPriceOverride(group.key);
      setSupplierPriceRows((prev) => ({
        ...prev,
        [group.key]: {
          ...(prev[group.key] || {}),
          status: 'changed',
          lastCheckedAt: new Date().toISOString(),
          message: 'Aprobacion deshecha. Revisa nuevamente antes de aprobar.',
        },
      }));
      return true;
    } catch (error) {
      console.error('Error deshaciendo costo de proveedor:', error);
      showSupplierActionFailure(error?.message || 'No se pudo deshacer la aprobación.');
      return false;
    }
  };

  const handleApproveSelectedSupplierGroups = async () => {
    const targetGroups = selectedSupplierGroups.filter((group) => getSupplierPriceInfo(group).hasSupplierPrice);
    const completedKeys = new Set();
    for (const group of targetGroups) {
      if (await handleApproveSupplierGroup(group)) completedKeys.add(String(group.key));
    }
    clearSupplierPriceOverrides(Array.from(completedKeys));
    setSelectedSupplierGroupKeys((current) => current.filter((key) => !completedKeys.has(String(key))));
  };

  const handleIgnoreSelectedSupplierGroups = async () => {
    const targetGroups = selectedSupplierGroups.filter((group) => getSupplierPriceInfo(group).hasSupplierPrice);
    const completedKeys = new Set();
    for (const group of targetGroups) {
      if (await handleIgnoreSupplierGroup(group)) completedKeys.add(String(group.key));
    }
    setSelectedSupplierGroupKeys((current) => current.filter((key) => !completedKeys.has(String(key))));
  };

  const handleDetectCasaAlbertoLinks = async () => {
    if (!window.electronAPI?.supplierPriceSearch) {
      Swal.fire('Electron requerido', 'La deteccion de enlaces necesita la app de escritorio.', 'info');
      return;
    }

    const limit = supplierLinkDetectionLimit === 'all'
      ? casaAlbertoLinkCandidates.length
      : Number(supplierLinkDetectionLimit || 10);
    const productsToDetect = casaAlbertoLinkCandidates.slice(0, Math.max(limit, 0));
    if (productsToDetect.length === 0) return;

    if (supplierLinkDetectionLimit === 'all' && productsToDetect.length > 80) {
      const result = await Swal.fire({
        title: 'Detectar todo el lote',
        text: `Se van a consultar ${productsToDetect.length} productos. Puede tardar varios minutos.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Detectar todo',
        cancelButtonText: 'Cancelar',
        reverseButtons: true,
        confirmButtonColor: '#0f172a',
      });
      if (!result.isConfirmed) return;
    }

    supplierLinkDetectionStopRef.current = false;
    setIsDetectingSupplierLinks(true);
    setSupplierLinkDetectionProgress({
      total: productsToDetect.length,
      processed: 0,
      found: 0,
      errors: 0,
    });

    const summary = {
      found: 0,
      reviewed: 0,
      changed: 0,
      errors: 0,
      login_required: 0,
      not_found: 0,
    };

    try {
      for (const [index, product] of productsToDetect.entries()) {
        if (supplierLinkDetectionStopRef.current) break;

        const result = await window.electronAPI.supplierPriceSearch({
          supplierCode: product.barcode || '',
          title: product.title || '',
        });

        if (result?.status === 'login_required') {
          markSupplierSessionRequired();
          summary.login_required += 1;
          setSupplierLinkDetectionProgress((current) => ({
            ...current,
            processed: index + 1,
            errors: current.errors + 1,
          }));
          break;
        }

        const detectedProductUrl = result?.productUrl || result?.sourceUrl || '';
        const detectedCasaAlbertoId = result?.casaAlbertoId || getCasaAlbertoIdFromUrl(detectedProductUrl);

        if (result?.status === 'found' && detectedProductUrl && detectedCasaAlbertoId) {
          const supplierPrice = Number(result.supplierPrice || 0);
          const nextGroup = {
            key: `detect:${product.id}:${detectedCasaAlbertoId}`,
            products: [product],
            supplierTitle: result.foundTitle || product.title || '',
            supplierCode: result.supplierCode || product.barcode || '',
            priceText: result.priceText || '',
            supplierPrice,
            rawSupplierPrice: supplierPrice,
            tracking: {},
          };
          const pricePayload = buildSupplierPricePayload(nextGroup, product, { supplierPrice });
          const estimatedCost = pricePayload.estimatedCost;
          const detectedStatus = getSupplierStatusForPrice([product], pricePayload.unitSupplierPrice);
          const hasCostDelta = detectedStatus === 'changed' || detectedStatus === 'price_down';
          const matchedBy = getDetectedSupplierMatchMode(product, result);
          const suggestion = {
            product,
            result: {
              ...result,
              productUrl: detectedProductUrl,
              casaAlbertoId: detectedCasaAlbertoId,
              supplierPrice,
              rawSupplierPrice: pricePayload.rawSupplierPrice,
              unitSupplierPrice: pricePayload.unitSupplierPrice,
              unitDivisor: pricePayload.unitDivisor,
              estimatedCost,
            },
            matchedBy,
            createdAt: Date.now(),
          };

          if (matchedBy !== 'barcode_exact') {
            setSupplierLinkSuggestions((prev) => {
              const key = `${product.id}-${detectedCasaAlbertoId}`;
              const withoutDuplicate = prev.filter((entry) => `${entry.product.id}-${entry.result.casaAlbertoId}` !== key);
              return [suggestion, ...withoutDuplicate].slice(0, 20);
            });
            summary.errors += 1;
            setSupplierLinkDetectionProgress((current) => ({
              ...current,
              processed: index + 1,
              found: summary.found,
              errors: summary.errors + summary.login_required,
            }));
            await new Promise((resolve) => setTimeout(resolve, 320));
            continue;
          }

          try {
            const saveResult = await onSaveSupplierPriceChecks?.([{
              productId: product.id,
              ...pricePayload,
              previousSupplierPrice: Number(product.purchasePrice || 0),
              reviewStatus: detectedStatus,
              lastCheckedAt: new Date().toISOString(),
              lastChangedAt: hasCostDelta ? new Date().toISOString() : null,
              supplierCode: result.supplierCode || '',
              casaAlbertoId: detectedCasaAlbertoId,
              productUrl: detectedProductUrl,
              foundTitle: result.foundTitle || '',
              sourceUrl: result.sourceUrl || detectedProductUrl,
              imageUrl: result.imageUrl || '',
              priceText: result.priceText || '',
              matchedBy,
              inventoryBarcode: product.barcode || '',
              searchedQuery: result.searchedQuery || product.barcode || product.title || '',
              message: matchedBy === 'title_search'
                ? 'Enlace detectado por nombre.'
                : matchedBy === 'trimmed_barcode'
                  ? 'Enlace detectado con codigo corregido.'
                  : 'Enlace detectado por codigo.',
            }]);
            const updatedProducts = requireSupplierMutationProducts(
              saveResult,
              1,
              'No se pudo confirmar el enlace detectado.',
            );
            updateSandboxProducts(updatedProducts);
            summary.found += 1;
            if (detectedStatus === 'changed') summary.changed += 1;
            else summary.reviewed += 1;
          } catch (saveError) {
            console.error('Error guardando enlace de Casa Alberto detectado:', saveError);
            summary.errors += 1;
          }
        } else if (result?.status === 'not_found') {
          summary.not_found += 1;
        } else {
          summary.errors += 1;
        }

        setSupplierLinkDetectionProgress((current) => ({
          ...current,
          processed: index + 1,
          found: summary.found,
          errors: summary.errors + summary.login_required,
        }));

        await new Promise((resolve) => setTimeout(resolve, 320));
      }

      Swal.fire({
        title: supplierLinkDetectionStopRef.current ? 'Deteccion detenida' : 'Deteccion terminada',
        text: `${summary.found} enlazados, ${summary.changed} con cambio de costo, ${summary.not_found} sin resultado, ${summary.errors + summary.login_required} con aviso.`,
        icon: summary.found > 0 ? 'success' : 'info',
        confirmButtonColor: '#0f172a',
      });
    } catch (detectError) {
      console.error('Error general en detección de enlaces:', detectError);
      Swal.fire('Atención', detectError?.message || 'Hubo un inconveniente durante la detección de enlaces.', 'warning');
    } finally {
      setIsDetectingSupplierLinks(false);
      supplierLinkDetectionStopRef.current = false;
    }
  };

  const stopCasaAlbertoLinkDetection = () => {
    supplierLinkDetectionStopRef.current = true;
  };

  const openSupplierLinkEditor = (group) => {
    setSupplierLinkEditKey((current) => (current === group.key ? '' : group.key));
    setSupplierLinkDrafts((prev) => ({
      ...prev,
      [group.key]: prev[group.key] || {
        foundTitle: group.supplierTitle || '',
        supplierCode: group.supplierCode || '',
        casaAlbertoId: group.casaAlbertoId || '',
        productUrl: group.productUrl || '',
      },
    }));
  };

  const updateSupplierLinkDraft = (groupKey, field, value) => {
    setSupplierLinkDrafts((prev) => ({
      ...prev,
      [groupKey]: {
        ...(prev[groupKey] || {}),
        [field]: value,
      },
    }));
  };

  const handleSaveSupplierLink = async (group) => {
    if (isOfflineReadOnly) {
      showSupplierOfflineNotice();
      return;
    }
    try {
      const draft = supplierLinkDrafts[group.key] || {};
      const cleanLink = {
        foundTitle: String(draft.foundTitle || '').trim(),
        providerCode: String(draft.supplierCode || '').trim(),
        casaAlbertoId: String(draft.casaAlbertoId || '').trim(),
        productUrl: String(draft.productUrl || '').trim(),
        matchedBy: 'manual_price_tracking',
      };
      if (!cleanLink.providerCode && !cleanLink.casaAlbertoId && !cleanLink.productUrl) {
        Swal.fire('Falta referencia', 'Agrega ID Casa Alberto, codigo proveedor o URL del producto antes de guardar.', 'info');
        return;
      }
      const productsToUpdate = getSelectedProductsForGroup(group);
      const result = await onUpdateCasaAlbertoLinks?.({
        productIds: productsToUpdate.map((product) => product.id),
        link: cleanLink,
      });
      const updatedProducts = requireSupplierMutationProducts(
        result,
        productsToUpdate.length,
        'No se pudo confirmar la vinculación de todos los productos.',
      );
      updateSandboxProducts(updatedProducts);
      setSupplierLinkEditKey('');
    } catch (error) {
      console.error('Error guardando enlace de proveedor:', error);
      showSupplierActionFailure(error?.message || 'No se pudo guardar la vinculación.');
    }
  };

  const handleUnlinkSupplierGroup = async (group) => {
    if (isOfflineReadOnly) {
      showSupplierOfflineNotice();
      return;
    }
    try {
      const result = await Swal.fire({
        title: 'Desvincular Casa Alberto',
        text: 'El producto queda en Rebu, pero deja de seguir este proveedor.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Desvincular',
        cancelButtonText: 'Cancelar',
        reverseButtons: true,
        confirmButtonColor: '#be123c',
      });
      if (!result.isConfirmed) return;

      const productsToUnlink = getSelectedProductsForGroup(group);
      const updateResult = await onUpdateCasaAlbertoLinks?.({
        productIds: productsToUnlink.map((product) => product.id),
        link: { unlink: true },
      });
      const updatedProducts = requireSupplierMutationProducts(
        updateResult,
        productsToUnlink.length,
        'No se pudo confirmar la desvinculación de todos los productos.',
      );
      updateSandboxProducts(updatedProducts);
      setSupplierDetailGroupKey('');
      setSupplierLinkEditKey('');
    } catch (error) {
      console.error('Error desvinculando de Casa Alberto:', error);
      showSupplierActionFailure(error?.message || 'No se pudo desvincular el producto.');
    }
  };

  const handleApproveSupplierLinkSuggestion = async (suggestion) => {
    if (!suggestion?.product || !suggestion?.result) return;
    if (isOfflineReadOnly) {
      showSupplierOfflineNotice();
      return;
    }
    try {
      const { product, result, matchedBy } = suggestion;
      const supplierPrice = Number(result.supplierPrice || 0);
      const nextGroup = {
        key: `suggestion:${product.id}:${result.casaAlbertoId || result.productUrl || result.supplierCode || Date.now()}`,
        products: [product],
        supplierTitle: result.foundTitle || product.title || '',
        supplierCode: result.supplierCode || product.barcode || '',
        priceText: result.priceText || '',
        supplierPrice,
        rawSupplierPrice: supplierPrice,
        tracking: {},
      };
      const pricePayload = buildSupplierPricePayload(nextGroup, product, {
        supplierPrice,
        unitDivisor: result.unitDivisor,
      });
      const status = getSupplierStatusForPrice([product], pricePayload.unitSupplierPrice);
      const saveResult = await onSaveSupplierPriceChecks?.([{
        productId: product.id,
        ...pricePayload,
        previousSupplierPrice: Number(product.purchasePrice || 0),
        reviewStatus: status,
        lastCheckedAt: new Date().toISOString(),
        lastChangedAt: status === 'changed' || status === 'price_down' ? new Date().toISOString() : null,
        supplierCode: result.supplierCode || '',
        casaAlbertoId: result.casaAlbertoId || '',
        productUrl: result.productUrl || result.sourceUrl || '',
        foundTitle: result.foundTitle || '',
        sourceUrl: result.sourceUrl || result.productUrl || '',
        imageUrl: result.imageUrl || '',
        priceText: result.priceText || '',
        matchedBy,
        inventoryBarcode: product.barcode || '',
        searchedQuery: result.searchedQuery || product.title || product.barcode || '',
        message: matchedBy === 'trimmed_barcode'
          ? 'Enlace revisado con codigo corregido.'
          : 'Enlace revisado por nombre.',
      }]);
      const updatedProducts = requireSupplierMutationProducts(
        saveResult,
        1,
        'No se pudo confirmar el enlace sugerido.',
      );
      updateSandboxProducts(updatedProducts);
      setSupplierLinkSuggestions((prev) => prev.filter((entry) => entry !== suggestion));
    } catch (error) {
      console.error('Error aprobando sugerencia de enlace:', error);
      showSupplierActionFailure(error?.message || 'No se pudo guardar el enlace sugerido.');
    }
  };

  const dismissSupplierLinkSuggestion = (suggestion) => {
    setSupplierLinkSuggestions((prev) => prev.filter((entry) => entry !== suggestion));
  };

  const openSupplierExternalUrl = async (url) => {
    const targetUrl = String(url || '').trim();
    if (!targetUrl) return;
    if (window.electronAPI?.supplierOpenUrl) {
      const result = await window.electronAPI.supplierOpenUrl(targetUrl);
      if (!result?.success) {
        await Swal.fire({
          icon: 'warning',
          title: 'No se pudo abrir Casa Alberto',
          text: result?.error || 'Revisa la sesion del proveedor y volve a intentar.',
          confirmButtonText: 'Entendido',
        });
      }
      return;
    }
    if (window.electronAPI?.openExternalUrl) {
      await window.electronAPI.openExternalUrl(targetUrl);
      return;
    }
    window.open(targetUrl, '_blank', 'noopener,noreferrer');
  };

  const openSupplierPriceMode = useCallback(() => {
    setActiveToolMode('supplier');
  }, []);

  useEffect(() => {
    if (!supplierOpenRequest) return;
    openSupplierPriceMode();
  }, [openSupplierPriceMode, supplierOpenRequest]);

  const imageImportStats = imageImportRows.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    if (row.status === 'found' || row.status === 'apply_error') {
      if (row.status === 'apply_error') acc.found += 1;
      if (row.approved) acc.approved += 1;
      if (row.matchQuality === 'title_similarity') {
        acc.foundByName += 1;
      } else {
        acc.foundByCode += 1;
      }
    }
    return acc;
  }, {
    pending: 0,
    searching: 0,
    found: 0,
    applied: 0,
    error: 0,
    apply_error: 0,
    not_found: 0,
    login_required: 0,
    approved: 0,
    foundByCode: 0,
    foundByName: 0,
  });
  const imageImportProcessedCount = imageImportRows.length - imageImportStats.pending;
  const imageImportProgressPercent = imageImportRows.length > 0
    ? Math.round((imageImportProcessedCount / imageImportRows.length) * 100)
    : 0;
  const normalizedImageImportSearchTerm = imageImportReviewSearchTerm.trim().toLowerCase();
  const imageImportVisibleRows = imageImportRows.filter((row) => (
    showImageImportPendingRows ||
    normalizedImageImportSearchTerm ||
    row.status !== 'pending' ||
    row.approved
  )).filter((row) => {
    if (!normalizedImageImportSearchTerm) return true;
    return [
      row.title,
      row.barcode,
      row.category,
      row.foundTitle,
      row.message,
      {
        found: 'Encontrada',
        applied: 'Aplicada',
        searching: 'Buscando',
        not_found: 'Sin foto',
        login_required: 'Login',
        error: 'Error',
        apply_error: 'Reintentar',
        pending: 'Pendiente',
      }[row.status],
    ].some((value) => String(value || '').toLowerCase().includes(normalizedImageImportSearchTerm));
  });
  const imageCandidatePickerRow = imageImportRows.find((row) => row.rowId === imageCandidatePickerRowId) || null;

  useEffect(() => {
    if (!onImageImportTaskChange) return;
    if (imageImportRows.length === 0) {
      onImageImportTaskChange(null);
      return;
    }

    const phase = isApplyingImages
      ? 'applying'
      : isSearchingImages && isImageImportPaused
        ? 'paused'
        : isSearchingImages
          ? 'searching'
          : imageImportStats.applied > 0
            ? 'completed'
            : 'ready';

    onImageImportTaskChange({
      phase,
      total: imageImportRows.length,
      processed: imageImportProcessedCount,
      found: imageImportStats.found,
      approved: imageImportStats.approved,
      applied: imageImportStats.applied,
      errors: imageImportStats.error + imageImportStats.apply_error + imageImportStats.login_required,
      modalOpen: isImageImportModalOpen,
      updatedAt: Date.now(),
    });
  }, [
    imageImportRows.length,
    imageImportProcessedCount,
    imageImportStats.found,
    imageImportStats.approved,
    imageImportStats.applied,
    imageImportStats.error,
    imageImportStats.apply_error,
    imageImportStats.login_required,
    isApplyingImages,
    isSearchingImages,
    isImageImportPaused,
    isImageImportModalOpen,
    onImageImportTaskChange,
  ]);

  const getImageImportStatusMeta = (status) => {
    if (status === 'found') return { label: 'Encontrada', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' };
    if (status === 'applied') return { label: 'Aplicada', className: 'border-blue-200 bg-blue-50 text-blue-700' };
    if (status === 'searching') return { label: 'Buscando', className: 'border-amber-200 bg-amber-50 text-amber-700' };
    if (status === 'not_found') return { label: 'Sin foto', className: 'border-slate-200 bg-slate-50 text-slate-500' };
    if (status === 'login_required') return { label: 'Login', className: 'border-amber-200 bg-amber-50 text-amber-700' };
    if (status === 'apply_error') return { label: 'Reintentar', className: 'border-amber-200 bg-amber-50 text-amber-700' };
    if (status === 'error') return { label: 'Error', className: 'border-red-200 bg-red-50 text-red-700' };
    return { label: 'Pendiente', className: 'border-slate-200 bg-white text-slate-500' };
  };

  const renderSupplierSessionControl = ({ variant = 'light', className = '' } = {}) => {
    const isDark = variant === 'dark';
    const isConnected = supplierSessionState.status === 'connected';
    const isChecking = supplierSessionState.status === 'checking' || isSupplierSessionBusy;
    const needsManualAccess = supplierSessionState.status === 'manual_required';
    const isUnsupported = supplierSessionState.status === 'unsupported';
    const statusLabel = isConnected
      ? 'Sesion activa'
      : isChecking
        ? 'Comprobando sesion'
        : needsManualAccess
          ? 'Acceso requerido'
          : supplierSessionState.status === 'error'
            ? 'No se pudo comprobar'
            : isUnsupported
              ? 'Solo disponible en Electron'
              : 'Sesion sin conectar';
    const statusDescription = isConnected
      ? 'Rebu puede consultar Casa Alberto con la sesion guardada en este equipo.'
      : needsManualAccess
        ? 'Usa Iniciar sesion. La primera vez Rebu te pedira los datos y los guardara cifrados en este equipo.'
        : supplierSessionState.status === 'error'
          ? (supplierSessionState.error || 'Reintenta la conexion o usa el acceso manual.')
          : isUnsupported
            ? 'Abri la app de escritorio para usar la sesion del proveedor.'
            : 'Inicia la sesion guardada sin abrir la ventana del proveedor.';
    const statusTone = isConnected
      ? (isDark ? 'border-emerald-400/35 bg-emerald-400/10 text-emerald-100' : 'border-emerald-200 bg-emerald-50 text-emerald-700')
      : needsManualAccess
        ? (isDark ? 'border-amber-400/35 bg-amber-400/10 text-amber-100' : 'border-amber-200 bg-amber-50 text-amber-700')
        : supplierSessionState.status === 'error'
          ? (isDark ? 'border-rose-400/35 bg-rose-400/10 text-rose-100' : 'border-rose-200 bg-rose-50 text-rose-700')
          : (isDark ? 'border-slate-600 bg-slate-950/25 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-600');

    return (
      <div className={`mt-3 rounded-lg border p-2.5 ${isDark ? 'border-slate-700/80 bg-slate-950/20' : 'border-slate-200 bg-slate-50'} ${className}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className={`text-[9px] font-black uppercase tracking-[0.12em] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              Sesion proveedor
            </p>
            <p aria-live="polite" className={`mt-1 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-black ${statusTone}`}>
              {isChecking ? <Loader2 size={11} className="animate-spin" /> : isConnected ? <CheckCircle size={11} /> : <AlertTriangle size={11} />}
              {statusLabel}
            </p>
          </div>
        </div>
        <p className={`mt-2 text-[10px] font-bold leading-snug ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
          {statusDescription}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {isConnected ? (
            <button
              type="button"
              onClick={handleLogoutSupplierSession}
              disabled={isChecking || isUnsupported}
              className={`flex h-9 items-center justify-center gap-1.5 rounded-md border px-2 text-[11px] font-black transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                isDark
                  ? 'border-rose-400/30 bg-rose-400/10 text-rose-100 hover:bg-rose-400/15'
                  : 'border-rose-200 bg-white text-rose-700 hover:bg-rose-50'
              }`}
            >
              <LogOut size={13} />
              Cerrar sesion
            </button>
          ) : (
            <button
              type="button"
              onClick={handleConnectSupplierSession}
              disabled={isChecking || isUnsupported}
              className={`flex h-9 items-center justify-center gap-1.5 rounded-md border px-2 text-[11px] font-black transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                isDark
                  ? 'border-emerald-400/35 bg-emerald-400/15 text-emerald-100 hover:bg-emerald-400/20'
                  : 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700'
              }`}
            >
              {isChecking ? <Loader2 size={13} className="animate-spin" /> : <LogIn size={13} />}
              Iniciar sesion
            </button>
          )}
          <button
            type="button"
            onClick={handleOpenSupplierLogin}
            disabled={isChecking || isUnsupported}
            className={`flex h-9 items-center justify-center gap-1.5 rounded-md border px-2 text-[11px] font-black transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
              isDark
                ? 'border-slate-600 bg-slate-900/60 text-slate-200 hover:bg-slate-800'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            <ExternalLink size={13} />
            {isConnected ? 'Abrir proveedor' : 'Acceso manual'}
          </button>
        </div>
      </div>
    );
  };

  const handleSupplierPriceReportExport = async (days) => {
    if (!onExportSupplierPriceReport || isExportingSupplierReport) return;
    setIsSupplierReportMenuOpen(false);
    setIsExportingSupplierReport(true);
    try {
      await onExportSupplierPriceReport(days);
    } finally {
      setIsExportingSupplierReport(false);
    }
  };

  const renderCasaAlbertoPanel = () => {
    const filterOptions = [
      { value: 'all', label: 'Todos', count: casaAlbertoGroups.length },
      { value: 'selected', label: 'Seleccionados', count: selectedSupplierGroups.length },
      { value: 'changed', label: 'Con cambio', count: supplierPricePendingCount },
      { value: 'price_down', label: 'Bajo precio', count: casaAlbertoGroups.filter((group) => group.status === 'price_down').length },
      { value: 'unchecked', label: 'Sin revisar', count: casaAlbertoGroups.filter((group) => group.status === 'unchecked').length },
      { value: 'reviewed', label: 'Revisados', count: casaAlbertoGroups.filter((group) => group.status === 'reviewed' || group.status === 'approved' || group.status === 'ignored').length },
      { value: 'notice', label: 'Avisos', count: supplierPriceNoticeCount },
      { value: 'error', label: 'Errores', count: supplierPriceErrorCount },
    ];
    const supplierExtraPercent = DEFAULT_VAT_PERCENT;
    const supplierMarkupPercent = pricingPreferences.marginPercent;
    const hasSupplierSelection = selectedSupplierGroups.length > 0;
    const supplierCheckTargetCount = hasSupplierSelection ? selectedSupplierGroups.length : visibleCasaAlbertoGroups.length;
    const supplierCheckTargetLabel = hasSupplierSelection
      ? `Chequear seleccionados (${selectedSupplierGroups.length})`
      : 'Chequear visibles';
    const renderSupplierImage = (group, className = 'h-16 w-16') => {
      const imageUrl = getSupplierPreviewImage(group);
      return (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            if (imageUrl) setProductImagePreview(imageUrl);
          }}
          disabled={!imageUrl}
          className={`${className} shrink-0 overflow-hidden rounded-lg border border-slate-700 bg-slate-950/35 text-slate-500 transition-colors ${imageUrl ? 'hover:border-sky-400/60' : ''}`}
          title={imageUrl ? 'Ver imagen grande' : 'Sin imagen'}
        >
          {imageUrl ? (
            <img src={imageUrl} alt={group.supplierTitle} className="h-full w-full object-cover" />
          ) : (
            <ImageIcon size={18} className="mx-auto" />
          )}
        </button>
      );
    };

    const renderSupplierStepperInput = ({
      label,
      value,
      onChange,
      onStep,
      suffix = '',
      helper = '',
      manual = false,
      inputMode = 'decimal',
      tone = 'slate',
      className = '',
    }) => {
      const accentClass = tone === 'emerald'
        ? 'focus-within:border-emerald-400/70'
        : tone === 'sky'
          ? 'focus-within:border-sky-400/70'
          : 'focus-within:border-slate-400/70';
      return (
        <div className={`min-w-0 ${className}`}>
          <span className="mb-1 flex items-center justify-between gap-2 text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">
            <span>{label}</span>
            {manual ? <span className="text-sky-200">Manual</span> : null}
          </span>
          <span className={`flex h-8 overflow-hidden rounded-md border border-slate-700 bg-[#07111f] transition-colors ${accentClass}`}>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onStep?.(-1);
              }}
              className="flex h-full w-7 shrink-0 items-center justify-center border-r border-slate-700 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
              aria-label={`Bajar ${label}`}
            >
              <Minus size={12} />
            </button>
            <input
              type="text"
              inputMode={inputMode}
              value={value}
              onChange={(event) => onChange?.(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              className="min-w-0 flex-1 bg-transparent px-2 text-right text-xs font-black text-white outline-none"
              placeholder="0"
            />
            {suffix ? (
              <span className="flex h-full items-center border-l border-slate-700 px-2 text-[10px] font-black text-slate-400">
                {suffix}
              </span>
            ) : null}
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onStep?.(1);
              }}
              className="flex h-full w-7 shrink-0 items-center justify-center border-l border-slate-700 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
              aria-label={`Subir ${label}`}
            >
              <Plus size={12} />
            </button>
          </span>
          {helper ? <span className="mt-1 block text-[10px] font-bold leading-tight text-slate-500">{helper}</span> : null}
        </div>
      );
    };

    const renderSupplierActions = (group, { compact = false } = {}) => {
      const { hasSupplierPrice, hasManualOverride } = getSupplierCardMath(group);
      const hasManualChange = hasManualOverride || hasSupplierFinalSaleOverrides(group);
      const isReviewedWithoutManualChange =
        (group.status === 'reviewed' || group.status === 'approved') && !hasManualChange;
      const canUndo = group.products.some((product) => {
        const tracking = getCasaAlbertoPriceTracking(product);
        const previousPurchasePrice = Number(tracking.previousPurchasePrice ?? tracking.previousSupplierPrice ?? 0);
        return previousPurchasePrice > 0 && tracking.approvedAt;
      });
      const buttonClass = compact
        ? 'h-8 px-2 text-[10px]'
        : 'h-9 px-3 text-xs';
      return (
        <div className={`flex ${compact ? 'flex-row flex-wrap' : 'flex-col'} gap-2`}>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              handleCheckSupplierPriceGroup(group);
            }}
            disabled={isOfflineReadOnly || checkingSupplierGroupKey === group.key || isCheckingSupplierPrices}
            className={`flex items-center justify-center gap-2 rounded-md border border-sky-400/35 bg-sky-400/12 font-black text-sky-100 transition-colors hover:bg-sky-400/20 disabled:cursor-not-allowed disabled:opacity-45 ${buttonClass}`}
          >
            {checkingSupplierGroupKey === group.key ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Chequear
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              handleApproveSupplierGroup(group);
            }}
            disabled={isOfflineReadOnly || !hasSupplierPrice || isReviewedWithoutManualChange}
            className={`flex items-center justify-center gap-2 rounded-md border border-emerald-400/35 bg-emerald-400/14 font-black text-emerald-100 transition-colors hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-45 ${buttonClass}`}
          >
            <CheckCircle size={14} />
            {compact ? 'Aprobar' : 'Aprobar costo y venta'}
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              handleIgnoreSupplierGroup(group);
            }}
            disabled={isOfflineReadOnly || !hasSupplierPrice}
            className={`flex items-center justify-center gap-2 rounded-md border border-slate-600 bg-slate-900/70 font-black text-slate-200 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45 ${buttonClass}`}
          >
            <Check size={14} />
            Ignorar
          </button>
          {canUndo ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handleUndoSupplierGroup(group);
              }}
              disabled={isOfflineReadOnly}
              className={`flex items-center justify-center gap-2 rounded-md border border-amber-400/35 bg-amber-400/12 font-black text-amber-100 transition-colors hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-45 ${buttonClass}`}
            >
              <Undo2 size={14} />
              Deshacer
            </button>
          ) : null}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              openSupplierLinkEditor(group);
            }}
            className={`flex items-center justify-center gap-2 rounded-md border border-slate-600 bg-slate-900/60 font-black text-slate-200 transition-colors hover:bg-slate-800 ${buttonClass}`}
          >
            <Edit3 size={14} />
            Revisar enlace
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              handleUnlinkSupplierGroup(group);
            }}
            disabled={isOfflineReadOnly}
            className={`flex items-center justify-center gap-2 rounded-md border border-rose-400/30 bg-rose-400/10 font-black text-rose-100 transition-colors hover:bg-rose-400/18 disabled:cursor-not-allowed disabled:opacity-45 ${buttonClass}`}
          >
            <X size={14} />
            Desvincular
          </button>
          {group.productUrl || group.sourceUrl ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                openSupplierExternalUrl(group.productUrl || group.sourceUrl);
              }}
              className={`flex items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-950/30 font-black text-slate-300 transition-colors hover:border-slate-500 ${buttonClass}`}
            >
              <ExternalLink size={14} />
              Fuente
            </button>
          ) : null}
        </div>
      );
    };

    const renderSupplierProducts = (group, { compact = false } = {}) => {
      const math = getSupplierCardMath(group);
      const selectedProductIds = new Set(getSelectedProductsForGroup(group).map((entry) => String(entry.id)));
      return (
        <div className={compact ? 'space-y-1' : 'space-y-1.5'}>
          {group.products.map((product) => {
            const productImage = getProductImageUrl(product);
            const productKey = String(product.id);
            const isSelected = selectedProductIds.has(productKey);
            const suggestedSale = math.hasSupplierPrice
              ? getSupplierSuggestedSale(product, math.unitSupplierPrice)
              : 0;
            const finalSaleValue = getSupplierFinalSaleInputValue(group, product, suggestedSale);
            const hasFinalSaleOverride = getSupplierStoredFinalSaleValue(group.key, product.id) !== undefined;
            return (
              <div
                key={product.id}
                className={`grid w-full min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors ${
                  compact
                    ? 'grid-cols-[20px_34px_minmax(0,1fr)_82px]'
                    : 'grid-cols-[22px_38px_minmax(0,1fr)_76px_82px_minmax(132px,0.8fr)]'
                } ${
                  isSelected
                    ? 'border-emerald-400/45 bg-emerald-400/10'
                    : 'border-slate-700/60 bg-[#0b1728] hover:border-slate-500'
                }`}
              >
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleSupplierProductSelection(group, product.id);
                  }}
                  className={`flex h-5 w-5 items-center justify-center rounded border ${
                    isSelected
                      ? 'border-emerald-300 bg-emerald-400/20 text-emerald-100'
                      : 'border-slate-600 text-slate-500'
                  }`}
                  title={isSelected ? 'No actualizar este producto' : 'Actualizar este producto'}
                >
                  {isSelected ? <Check size={12} /> : null}
                </button>
                <span className="h-9 w-9 overflow-hidden rounded-md border border-slate-700 bg-slate-950/30">
                  {productImage ? (
                    <img src={productImage} alt={product.title} className="h-full w-full object-cover" />
                  ) : (
                    <ImageIcon size={14} className="mx-auto mt-2.5 text-slate-500" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-black text-white" title={product.title}>{product.title}</span>
                  <span className="mt-0.5 block truncate text-[10px] font-bold text-slate-500">
                    {product.barcode || 'Sin codigo'} - Venta actual {formatSupplierMoney(product.price)}
                  </span>
                </span>
                <span className="text-[11px] font-black text-slate-200">
                  <span className="block text-[8px] uppercase tracking-[0.12em] text-slate-500">Costo</span>
                  {formatSupplierMoney(product.purchasePrice)}
                </span>
                {!compact ? (
                  <>
                    <span className="text-[11px] font-black text-emerald-200">
                      <span className="block text-[8px] uppercase tracking-[0.12em] text-slate-500">Sugerida</span>
                      {suggestedSale ? formatSupplierMoney(suggestedSale) : '-'}
                    </span>
                    <div className="min-w-0" onClick={(event) => event.stopPropagation()}>
                      {renderSupplierStepperInput({
                        label: 'Venta final',
                        value: finalSaleValue,
                        onChange: (value) => updateSupplierFinalSaleOverride(group.key, product.id, value),
                        onStep: (direction) => stepSupplierFinalSaleOverride(group, product, suggestedSale, direction * 50),
                        manual: hasFinalSaleOverride,
                        tone: 'emerald',
                      })}
                    </div>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      );
    };

    const renderSupplierPriceSummary = (group) => {
      const math = getSupplierCardMath(group);
      const formatRange = (minValue, maxValue) => {
        if (!minValue) return '-';
        if (maxValue && Math.abs(Number(maxValue) - Number(minValue)) >= 0.01) {
          return `${formatSupplierMoney(minValue)} - ${formatSupplierMoney(maxValue)}`;
        }
        return formatSupplierMoney(minValue);
      };
      const costDelta = math.hasSupplierPrice && math.currentCost
        ? calculateDiffPercent(math.currentCost, math.estimatedCost)
        : null;
      const summaryItems = [
        {
          label: 'Proveedor',
          value: math.hasSupplierPrice ? formatSupplierMoney(math.supplierPrice) : '-',
          helper: math.unitDivisor > 1 ? `pack dividido en ${math.unitDivisor}` : 'precio unitario',
        },
        {
          label: 'Costo por unidad',
          value: math.hasSupplierPrice ? formatSupplierMoney(math.unitSupplierPrice) : '-',
          helper: 'base antes del recargo',
        },
        {
          label: 'Costo Rebu calculado',
          value: math.hasSupplierPrice ? formatSupplierMoney(math.estimatedCost) : '-',
          helper: costDelta ? `cambia ${costDelta}` : 'sin diferencia visible',
        },
        {
          label: 'Costo actual Rebu',
          value: formatRange(math.currentCost, math.currentCostMax),
          helper: math.hasManualOverride ? 'datos editados manualmente' : 'guardado hoy',
        },
        {
          label: 'Venta sugerida',
          value: math.hasSupplierPrice ? formatSupplierMoney(math.suggestedSale) : '-',
          helper: 'la venta final se ajusta por producto',
        },
      ];
      return (
        <div className="grid gap-x-3 gap-y-1.5 border-y border-slate-700/65 py-2 min-[1500px]:grid-cols-5">
          {summaryItems.map((item) => (
            <div key={item.label} className="min-w-0 border-l border-slate-700/70 pl-2">
              <p className="truncate text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">{item.label}</p>
              <p className="mt-0.5 truncate text-[12px] font-black text-slate-100">{item.value}</p>
              <p className="mt-0.5 truncate text-[10px] font-bold text-slate-500">{item.helper}</p>
            </div>
          ))}
        </div>
      );
    };

    const renderSupplierPriceControls = (group, { compact = false } = {}) => {
      const math = getSupplierCardMath(group);
      const hasManualOverride = math.hasManualOverride;
      const stepSupplierOverride = (field, fallbackValue, direction, step, minValue = 0) => {
        const storedValue = supplierPriceOverrides[group.key]?.[field];
        const currentValue = field === 'unitDivisor'
          ? normalizeSupplierDivisor(storedValue ?? fallbackValue, fallbackValue)
          : parseSupplierNumber(storedValue ?? fallbackValue);
        const nextValue = Math.max(minValue, Math.round(currentValue + (direction * step)));
        updateSupplierPriceOverride(group.key, { [field]: nextValue });
      };
      return (
        <div
          className={`rounded-lg border border-slate-700/70 bg-slate-950/20 p-2 ${hasManualOverride ? 'ring-1 ring-sky-400/25' : ''}`}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">Calculo del costo</p>
              <p className="mt-0.5 text-[10px] font-bold leading-snug text-slate-400">
                Precio proveedor / unidades = costo por unidad. Al aprobar se suma el recargo de costo.
              </p>
            </div>
            {hasManualOverride ? (
              <button
                type="button"
                onClick={() => clearSupplierPriceOverride(group.key)}
                className="h-7 shrink-0 rounded-md border border-slate-600 bg-slate-900/70 px-2 text-[10px] font-black text-slate-200 transition-colors hover:bg-slate-800"
                title="Volver al precio detectado"
              >
                Restaurar
              </button>
            ) : null}
          </div>
          <div className={`grid gap-2 ${compact ? 'grid-cols-2' : 'grid-cols-[minmax(132px,1fr)_104px_minmax(120px,0.9fr)]'}`}>
            {renderSupplierStepperInput({
              label: 'Precio proveedor',
              value: supplierPriceOverrides[group.key]?.supplierPrice ?? (math.rawSupplierPrice || ''),
              onChange: (value) => updateSupplierPriceOverride(group.key, { supplierPrice: value }),
              onStep: (direction) => stepSupplierOverride('supplierPrice', math.rawSupplierPrice || 0, direction, 50, 0),
              helper: math.unitDivisor > 1 ? 'total del pack' : 'detectado',
              manual: math.hasManualSupplierPrice,
              tone: 'sky',
            })}
            {renderSupplierStepperInput({
              label: 'Unidades',
              value: supplierPriceOverrides[group.key]?.unitDivisor ?? math.unitDivisor,
              onChange: (value) => updateSupplierPriceOverride(group.key, { unitDivisor: value }),
              onStep: (direction) => stepSupplierOverride('unitDivisor', math.unitDivisor || 1, direction, 1, 1),
              helper: math.divisorAmbiguo
                ? 'revisar unidades'
                : math.detectedDivisor > 1 ? `sugerido ${math.detectedDivisor}` : 'por producto',
              manual: math.hasManualDivisor,
              inputMode: 'numeric',
              tone: 'sky',
            })}
            <div className={compact ? 'col-span-2' : ''}>
              <span className="mb-1 block text-[9px] font-black uppercase tracking-[0.12em] text-sky-200/80">Costo por unidad</span>
              <div className="flex h-8 items-center justify-end rounded-md border border-sky-400/25 bg-sky-400/10 px-2 text-xs font-black text-sky-100">
                {math.hasSupplierPrice ? formatSupplierMoney(math.unitSupplierPrice) : '-'}
              </div>
              <span className="mt-1 block text-[10px] font-bold leading-tight text-slate-500">se usa para calcular el costo Rebu</span>
            </div>
          </div>
        </div>
      );
    };

    return (
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-700/70 bg-[#07111f] text-slate-100">
        <aside className="flex w-[292px] shrink-0 flex-col border-r border-slate-700/70 bg-[#0b1728]">
          <div className="border-b border-slate-700/70 p-4">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-400/30 bg-emerald-400/12 text-emerald-200">
                <Link2 size={16} />
              </span>
              <div>
                <h2 className="text-base font-black leading-tight text-white">Casa Alberto</h2>
                <p className="mt-0.5 text-[11px] font-bold text-slate-400">Costos del proveedor enlazado</p>
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 custom-scrollbar">
            {isOfflineReadOnly ? (
              <section className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-[11px] font-bold leading-relaxed text-amber-100">
                Modo sin conexion: podes revisar datos guardados, pero no chequear ni aprobar costos.
              </section>
            ) : null}
            <section className="rounded-lg border border-slate-700/80 bg-slate-900/35 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Resumen</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-slate-700/80 bg-[#0f1e33] p-2">
                  <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">Enlaces</p>
                  <p className="mt-1 text-xl font-black text-white">{casaAlbertoGroups.length}</p>
                </div>
                <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-2">
                  <p className="text-[9px] font-black uppercase tracking-[0.12em] text-amber-200/80">Pendientes</p>
                  <p className="mt-1 text-xl font-black text-amber-100">{supplierPricePendingCount}</p>
                </div>
                <div className="rounded-lg border border-rose-400/30 bg-rose-400/10 p-2">
                  <p className="text-[9px] font-black uppercase tracking-[0.12em] text-rose-200/80">Errores</p>
                  <p className="mt-1 text-xl font-black text-rose-100">{supplierPriceErrorCount}</p>
                </div>
                <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-2">
                  <p className="text-[9px] font-black uppercase tracking-[0.12em] text-emerald-200/80">Revisados</p>
                  <p className="mt-1 text-xl font-black text-emerald-100">
                    {filterOptions.find((option) => option.value === 'reviewed')?.count || 0}
                  </p>
                </div>
              </div>
              {renderSupplierSessionControl({ variant: 'dark' })}
            </section>

            <section className="rounded-lg border border-sky-400/25 bg-sky-400/10 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.12em] text-sky-100">Ajuste de precios</p>
                  <p className="mt-1 text-[10px] font-bold leading-snug text-sky-100/70">
                    Define como se calcula el costo Rebu y la venta sugerida antes de aprobar.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => updatePricingMargin(DEFAULT_GROSS_MARGIN_PERCENT)}
                  className="h-7 rounded-md border border-slate-600 bg-slate-950/25 px-2 text-[10px] font-black text-slate-300 hover:bg-slate-800"
                >
                  Reset
                </button>
              </div>
              <div className="mt-3">
                <PricingFormulaControls
                  marginPercent={pricingPreferences.marginPercent}
                  onMarginChange={updatePricingMargin}
                  dark
                  compact
                />
              </div>
              <p className="mt-2 rounded-md border border-slate-700/60 bg-slate-950/20 px-2 py-1.5 text-[10px] font-bold leading-snug text-slate-400">
                Proveedor / unidades = costo base. Se incorpora IVA {supplierExtraPercent}% y la venta se calcula dividiendo por (1 - {supplierMarkupPercent}% de margen).
              </p>
            </section>

            <section className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-200">Detectar enlaces</p>
                <span className="rounded-md border border-emerald-400/25 bg-slate-950/25 px-2 py-0.5 text-[10px] font-black text-emerald-100">
                  {casaAlbertoLinkCandidates.length}
                </span>
              </div>
              <p className="mt-1.5 text-[10px] font-bold leading-snug text-emerald-100/70">
                Exactos se guardan. Codigo corregido o nombre queda para revisar.
              </p>

              <div className="mt-3 grid grid-cols-3 gap-1.5 rounded-md border border-emerald-400/20 bg-slate-950/20 p-1">
                {[
                  { value: '10', label: '10' },
                  { value: '50', label: '50' },
                  { value: 'all', label: 'Todo' },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSupplierLinkDetectionLimit(option.value)}
                    disabled={isDetectingSupplierLinks}
                    className={`h-7 rounded text-[10px] font-black transition-colors ${
                      supplierLinkDetectionLimit === option.value
                        ? 'bg-emerald-400 text-slate-950'
                        : 'text-emerald-100/70 hover:bg-emerald-400/12'
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={handleDetectCasaAlbertoLinks}
                  disabled={isOfflineReadOnly || isDetectingSupplierLinks || casaAlbertoLinkCandidates.length === 0}
                  className="flex h-9 min-w-0 flex-1 items-center justify-center gap-2 rounded-md border border-emerald-400/30 bg-emerald-500/70 text-xs font-black text-white transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {isDetectingSupplierLinks ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                  {isDetectingSupplierLinks ? 'Detectando...' : 'Detectar'}
                </button>
                {isDetectingSupplierLinks ? (
                  <button
                    type="button"
                    onClick={stopCasaAlbertoLinkDetection}
                    className="flex h-9 w-10 items-center justify-center rounded-md border border-rose-400/30 bg-rose-400/12 text-rose-100 transition-colors hover:bg-rose-400/20"
                    title="Detener deteccion"
                  >
                    <StopCircle size={15} />
                  </button>
                ) : null}
              </div>

              {(isDetectingSupplierLinks || supplierLinkDetectionProgress.total > 0) ? (
                <div className="mt-2 rounded-md border border-emerald-400/20 bg-slate-950/20 px-2 py-1.5 text-[10px] font-black text-emerald-100/80">
                  {supplierLinkDetectionProgress.processed}/{supplierLinkDetectionProgress.total} revisados · {supplierLinkDetectionProgress.found} enlazados · {supplierLinkDetectionProgress.errors} avisos
                </div>
              ) : null}
            </section>

            {supplierLinkSuggestions.length > 0 && supplierPriceFilter === 'suggested_link' ? (
              <section className="rounded-lg border border-amber-400/25 bg-amber-400/10 p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-amber-100">Enlaces para revisar</p>
                <div className="mt-2 space-y-2">
                  {supplierLinkSuggestions.length > 5 ? (
                    <p className="rounded-md border border-amber-400/15 bg-slate-950/20 px-2 py-1 text-[10px] font-black text-amber-100/75">
                      {supplierLinkSuggestions.length} enlaces pendientes de revision.
                    </p>
                  ) : null}
                  <div className="max-h-64 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                  {supplierLinkSuggestions.map((suggestion) => (
                    <div key={`${suggestion.product.id}-${suggestion.result.casaAlbertoId}`} className="rounded-md border border-amber-400/20 bg-slate-950/20 p-2">
                      <p className="truncate text-[11px] font-black text-white">{suggestion.product.title}</p>
                      <p className="mt-0.5 truncate text-[10px] font-bold text-amber-100/75">
                        {suggestion.result.foundTitle || 'Casa Alberto'} · ID {suggestion.result.casaAlbertoId || '-'}
                      </p>
                      <div className="mt-2 flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleApproveSupplierLinkSuggestion(suggestion)}
                          className="h-7 flex-1 rounded-md border border-emerald-400/30 bg-emerald-400/14 text-[10px] font-black text-emerald-100"
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          onClick={() => dismissSupplierLinkSuggestion(suggestion)}
                          className="h-7 w-8 rounded-md border border-slate-600 bg-slate-900 text-slate-300"
                        >
                          <X size={12} className="mx-auto" />
                        </button>
                      </div>
                    </div>
                  ))}
                  </div>
                </div>
              </section>
            ) : null}

            <section className="rounded-lg border border-slate-700/80 bg-slate-900/35 p-3">
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Mostrar</p>
              <div className="space-y-1.5">
                {filterOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSupplierPriceFilter(option.value)}
                    aria-pressed={supplierPriceFilter === option.value}
                    className={`flex h-8 w-full items-center justify-between rounded-md border px-2.5 text-[11px] font-black transition-colors ${
                      supplierPriceFilter === option.value
                        ? 'border-sky-400/50 bg-sky-400/14 text-sky-100'
                        : 'border-slate-700/70 bg-[#0f1e33] text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    <span>{option.label}</span>
                    <span className="rounded bg-slate-950/40 px-1.5 py-0.5 text-[9px]">{option.count}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-slate-700/80 bg-slate-900/35 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Lote</p>
                {selectedSupplierGroups.length > 0 ? (
                  <span className="rounded-md border border-emerald-400/30 bg-emerald-400/12 px-2 py-0.5 text-[10px] font-black text-emerald-100">
                    {selectedSupplierGroups.length} sel.
                  </span>
                ) : null}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleCheckAllSupplierPrices(hasSupplierSelection ? 'selected' : 'visible')}
                  disabled={isOfflineReadOnly || isCheckingSupplierPrices || supplierCheckTargetCount === 0}
                  className="h-8 rounded-md border border-sky-400/30 bg-sky-400/12 text-[10px] font-black text-sky-100 disabled:opacity-45"
                >
                  {hasSupplierSelection ? 'Chequear sel.' : 'Chequear visibles'}
                </button>
                <button
                  type="button"
                  onClick={() => handleCheckAllSupplierPrices('all')}
                  disabled={isOfflineReadOnly || isCheckingSupplierPrices || casaAlbertoGroups.length === 0}
                  className="h-8 rounded-md border border-sky-400/30 bg-sky-400/12 text-[10px] font-black text-sky-100 disabled:opacity-45"
                >
                  Chequear todos
                </button>
                <button
                  type="button"
                  onClick={toggleVisibleSupplierGroupsSelection}
                  disabled={visibleCasaAlbertoGroups.length === 0 || isCheckingSupplierPrices}
                  className="h-8 rounded-md border border-slate-600 bg-slate-900/70 text-[10px] font-black text-slate-200 disabled:opacity-45"
                >
                  {areAllVisibleSupplierGroupsSelected ? `Quitar visibles (${selectedVisibleSupplierGroupsCount})` : 'Seleccionar visibles'}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedSupplierGroupKeys([])}
                  disabled={selectedSupplierGroups.length === 0 || isCheckingSupplierPrices}
                  className="h-8 rounded-md border border-slate-600 bg-slate-950/20 text-[10px] font-black text-slate-300 disabled:opacity-45"
                >
                  Limpiar sel.
                </button>
                {isCheckingSupplierPrices ? (
                  <button
                    type="button"
                    onClick={isSupplierPriceCheckPaused ? resumeSupplierPriceCheck : pauseSupplierPriceCheck}
                    className="h-8 rounded-md border border-amber-400/30 bg-amber-400/12 text-[10px] font-black text-amber-100"
                  >
                    {isSupplierPriceCheckPaused ? 'Continuar' : 'Pausar'}
                  </button>
                ) : (
                  <button type="button" disabled className="h-8 rounded-md border border-slate-700 bg-slate-950/20 text-[10px] font-black text-slate-600">
                    Pausar
                  </button>
                )}
                <button
                  type="button"
                  onClick={stopSupplierPriceCheck}
                  disabled={!isCheckingSupplierPrices}
                  className="h-8 rounded-md border border-rose-400/30 bg-rose-400/12 text-[10px] font-black text-rose-100 disabled:opacity-45"
                >
                  Detener
                </button>
                <button
                  type="button"
                  onClick={handleApproveSelectedSupplierGroups}
                  disabled={isOfflineReadOnly || selectedSupplierGroups.length === 0}
                  className="h-8 rounded-md border border-emerald-400/30 bg-emerald-400/14 text-[10px] font-black text-emerald-100 disabled:opacity-45"
                >
                  Aprobar sel.
                </button>
                <button
                  type="button"
                  onClick={handleIgnoreSelectedSupplierGroups}
                  disabled={isOfflineReadOnly || selectedSupplierGroups.length === 0}
                  className="h-8 rounded-md border border-slate-600 bg-slate-900/70 text-[10px] font-black text-slate-200 disabled:opacity-45"
                >
                  Ignorar sel.
                </button>
              </div>
            </section>

            <p className="rounded-lg border border-slate-700/80 bg-[#0f1e33] p-3 text-[11px] font-bold leading-relaxed text-slate-400">
              Proveedor / unidades = costo base unitario. Costo Rebu incorpora IVA {supplierExtraPercent}%. La venta sugerida usa {supplierMarkupPercent}% de margen bruto real y se puede ajustar por producto.
            </p>
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-700/70 bg-[#0f1e33] px-4 py-3">
            <div className="min-w-[220px]">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Seguimiento de precios</p>
              <p className="mt-1 text-xs font-bold text-slate-300">
                {visibleCasaAlbertoGroups.length} grupo(s) visibles. Chequeo manual, sin cambios automáticos.
              </p>
            </div>
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
              <div className="relative h-10 min-w-[230px] max-w-[360px] flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={supplierPriceSearchTerm}
                  onChange={(event) => setSupplierPriceSearchTerm(event.target.value)}
                  placeholder="Buscar producto, codigo o ID..."
                  className="h-10 w-full rounded-md border border-slate-700 bg-slate-950/25 py-2 pl-9 pr-9 text-xs font-bold text-slate-100 outline-none transition-colors placeholder:text-slate-500 focus:border-sky-400"
                />
                {supplierPriceSearchTerm ? (
                  <button
                    type="button"
                    onClick={() => setSupplierPriceSearchTerm('')}
                    className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-100"
                    title="Limpiar busqueda"
                  >
                    <X size={13} />
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                onClick={toggleVisibleSupplierGroupsSelection}
                disabled={visibleCasaAlbertoGroups.length === 0 || isCheckingSupplierPrices}
                className="flex h-10 items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-950/25 px-3 text-[10px] font-black uppercase tracking-[0.08em] text-slate-300 transition-colors hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                {areAllVisibleSupplierGroupsSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                {areAllVisibleSupplierGroupsSelected ? `Quitar visibles (${selectedVisibleSupplierGroupsCount})` : `Seleccionar visibles${visibleCasaAlbertoGroups.length ? ` (${visibleCasaAlbertoGroups.length})` : ''}`}
              </button>
              <div
                className="relative"
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) setIsSupplierReportMenuOpen(false);
                }}
              >
                <button
                  type="button"
                  onClick={() => setIsSupplierReportMenuOpen((open) => !open)}
                  disabled={isOfflineReadOnly || isExportingSupplierReport || !onExportSupplierPriceReport}
                  aria-expanded={isSupplierReportMenuOpen}
                  aria-haspopup="menu"
                  className="flex h-10 items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-950/25 px-3 text-[10px] font-black uppercase tracking-[0.08em] text-slate-200 transition-colors hover:border-sky-400/50 hover:bg-sky-400/10 hover:text-sky-100 disabled:cursor-not-allowed disabled:opacity-45"
                  title="Crear un PDF con las aprobaciones y reversiones registradas"
                >
                  {isExportingSupplierReport ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                  {isExportingSupplierReport ? 'Generando...' : 'Historial PDF'}
                  {!isExportingSupplierReport ? <ChevronDown size={12} /> : null}
                </button>
                {isSupplierReportMenuOpen ? (
                  <div
                    role="menu"
                    className="absolute right-0 top-full z-40 mt-1 w-64 overflow-hidden rounded-lg border border-slate-600/90 bg-[#12233a] shadow-2xl shadow-black/35"
                  >
                    <div className="border-b border-slate-700/80 px-3 py-2.5">
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-200">Cambios registrados</p>
                      <p className="mt-1 text-[10px] font-bold leading-snug text-slate-400">
                        Incluye costo y venta anterior/nueva, fecha y usuario.
                      </p>
                    </div>
                    <div className="p-1.5">
                      {SUPPLIER_PRICE_REPORT_PERIODS.map((period) => (
                        <button
                          key={period.days}
                          type="button"
                          role="menuitem"
                          onClick={() => handleSupplierPriceReportExport(period.days)}
                          className="flex h-9 w-full items-center justify-between rounded-md px-2.5 text-left text-[11px] font-black text-slate-200 transition-colors hover:bg-sky-400/12 hover:text-sky-100"
                        >
                          <span>{period.label}</span>
                          <span className="rounded border border-slate-600/80 bg-slate-950/25 px-1.5 py-0.5 text-[9px] text-slate-400">
                            {period.shortLabel}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => handleCheckAllSupplierPrices(hasSupplierSelection ? 'selected' : 'visible')}
                disabled={isOfflineReadOnly || isCheckingSupplierPrices || supplierCheckTargetCount === 0}
                className="flex h-10 items-center justify-center gap-2 rounded-md border border-emerald-400/35 bg-emerald-400/14 px-4 text-xs font-black text-emerald-100 transition-colors hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {isCheckingSupplierPrices ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                {isCheckingSupplierPrices ? 'Chequeando...' : supplierCheckTargetLabel}
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 custom-scrollbar">
            {supplierLinkSuggestions.length > 0 ? (
              <section className="mb-4 overflow-hidden rounded-lg border border-slate-700/70 bg-[#0b1728]">
                <div className="h-0.5 bg-amber-400/80" />
                <div className="flex items-center justify-between gap-4 border-b border-slate-700/60 bg-[#0d1b2e] px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                      <p className="text-xs font-black tracking-tight text-slate-100">Enlaces por confirmar</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold text-slate-400">
                      Son coincidencias por codigo corregido o nombre parecido. Confirmalas antes de seguir costos.
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-2 text-[10px] font-black tabular-nums text-amber-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    {supplierLinkSuggestions.length} por revisar
                  </span>
                </div>
                <div className="max-h-[340px] divide-y divide-slate-700/55 overflow-y-auto custom-scrollbar">
                  {supplierLinkSuggestions.map((suggestion) => {
                    const productImage = getProductImageUrl(suggestion.product);
                    const sourceUrl = suggestion.result.productUrl || suggestion.result.sourceUrl || '';
                    const suggestionDivisor = normalizeSupplierDivisor(
                      suggestion.result.unitDivisor,
                      resolveUnitDivisor({
                        supplierTitle: suggestion.result.foundTitle,
                        rebuTitle: suggestion.product.title,
                      }).divisor ?? 1,
                    );
                    const suggestionUnitPrice = Number(suggestion.result.supplierPrice || 0) > 0
                      ? Number((Number(suggestion.result.supplierPrice || 0) / suggestionDivisor).toFixed(2))
                      : 0;
                    const suggestionEstimatedCost = getSupplierEstimatedCost(suggestionUnitPrice);
                    const matchLabel = suggestion.matchedBy === 'trimmed_barcode'
                      ? 'Codigo corregido'
                      : suggestion.matchedBy === 'title_search'
                        ? 'Nombre parecido'
                        : 'Coincidencia manual';
                    return (
                      <div
                        key={`${suggestion.product.id}-${suggestion.result.casaAlbertoId}`}
                        className="group grid items-center gap-x-5 gap-y-3 px-4 py-3 transition-colors hover:bg-white/[0.025] min-[1180px]:grid-cols-[minmax(240px,0.95fr)_minmax(310px,1.2fr)_220px_auto]"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-slate-700/70 bg-slate-950/35 text-slate-500">
                            {productImage ? (
                              <img src={productImage} alt={suggestion.product.title} className="h-full w-full object-cover" />
                            ) : (
                              <ImageIcon size={15} className="m-auto" />
                            )}
                          </span>
                          <div className="min-w-0">
                            <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">Producto Rebu</p>
                            <p className="mt-1 truncate text-xs font-black text-slate-100" title={suggestion.product.title}>
                              {suggestion.product.title}
                            </p>
                            <p className="mt-0.5 truncate text-[10px] font-semibold tabular-nums text-slate-500">
                              {suggestion.product.barcode || 'Sin codigo'}
                            </p>
                          </div>
                        </div>

                        <div className="flex min-w-0 items-center gap-3">
                          <ArrowRight size={16} className="shrink-0 text-slate-600 transition-colors group-hover:text-amber-300" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.08em] text-amber-200">
                                <span className="h-1 w-1 rounded-full bg-amber-400" />
                                {matchLabel}
                              </span>
                              {suggestion.result.casaAlbertoId ? (
                                <span className="text-[10px] font-bold tabular-nums text-slate-500">ID {suggestion.result.casaAlbertoId}</span>
                              ) : null}
                            </div>
                            <p className="mt-1 truncate text-xs font-black text-slate-100" title={suggestion.result.foundTitle}>
                              {suggestion.result.foundTitle || 'Producto Casa Alberto'}
                            </p>
                            <p className="mt-0.5 truncate text-[10px] font-semibold tabular-nums text-slate-500">
                              Codigo proveedor {suggestion.result.supplierCode || '-'}
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 min-[1180px]:border-l min-[1180px]:border-slate-700/60 min-[1180px]:pl-4">
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">Proveedor</p>
                            <p className="mt-1 text-xs font-black tabular-nums text-slate-100">
                              {Number(suggestion.result.supplierPrice || 0) > 0 ? formatSupplierMoney(suggestion.result.supplierPrice) : '-'}
                            </p>
                            {suggestionDivisor > 1 ? (
                              <p className="mt-0.5 text-[9px] font-black tabular-nums text-amber-200">
                                x{suggestionDivisor} = {formatSupplierMoney(suggestionUnitPrice)}
                              </p>
                            ) : null}
                          </div>
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">Costo Rebu calc.</p>
                            <p className="mt-1 text-xs font-black tabular-nums text-slate-100">
                              {suggestionEstimatedCost > 0 ? formatSupplierMoney(suggestionEstimatedCost) : '-'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-1.5">
                          {sourceUrl ? (
                            <button
                              type="button"
                              onClick={() => openSupplierExternalUrl(sourceUrl)}
                              className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[10px] font-black text-slate-400 transition-colors hover:bg-slate-800/80 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
                            >
                              <ExternalLink size={13} />
                              Fuente
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => handleApproveSupplierLinkSuggestion(suggestion)}
                            className="flex h-8 items-center gap-1.5 rounded-md bg-emerald-400 px-3 text-[10px] font-black text-emerald-950 transition-colors hover:bg-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70"
                          >
                            <Check size={13} />
                            Guardar enlace
                          </button>
                          <button
                            type="button"
                            onClick={() => dismissSupplierLinkSuggestion(suggestion)}
                            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-rose-400/10 hover:text-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/60"
                            title="Descartar"
                            aria-label={`Descartar enlace sugerido para ${suggestion.product.title}`}
                          >
                            <X size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {casaAlbertoGroups.length === 0 ? (
              <div className="flex h-full min-h-[320px] items-center justify-center rounded-xl border border-dashed border-slate-700/80 bg-[#0f1e33]/70">
                <div className="max-w-md text-center">
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-slate-600 bg-slate-900/70 text-slate-300">
                    <Package size={20} />
                  </span>
                  <h3 className="mt-3 text-base font-black">Todavia no hay enlaces Casa Alberto</h3>
                  <p className="mt-1 text-sm font-bold text-slate-400">
                    Usa Detectar enlaces para buscar por codigo o nombre y guardar la referencia del proveedor.
                  </p>
                </div>
              </div>
            ) : visibleCasaAlbertoGroups.length === 0 ? (
              <div className="flex h-full min-h-[320px] items-center justify-center rounded-xl border border-dashed border-slate-700/80 bg-[#0f1e33]/70">
                <p className="text-sm font-black text-slate-400">No hay enlaces en este filtro.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {visibleCasaAlbertoGroups.map((group) => {
                  const meta = getSupplierPriceStatusMeta(group.status);
                  const draft = supplierLinkDrafts[group.key] || {};
                  const isEditingLink = supplierLinkEditKey === group.key;
                  const math = getSupplierCardMath(group);
                  const supplierPrice = math.supplierPrice;
                  const hasSupplierPrice = math.hasSupplierPrice;
                  const priceDeltaLabel = hasSupplierPrice && group.previousSupplierPrice
                    ? calculateDiffPercent(Number(group.previousSupplierPrice), supplierPrice)
                    : null;
                  const isGroupSelected = selectedSupplierGroupKeySet.has(String(group.key));

                  return (
                    <article
                      key={group.key}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSupplierDetailGroupKey(group.key)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') setSupplierDetailGroupKey(group.key);
                      }}
                      className="supplier-price-virtual-item overflow-hidden rounded-xl border border-slate-700/80 bg-[#0f1e33] transition-colors hover:border-sky-400/35 hover:bg-[#12243c]"
                    >
                      <div className={`h-1 ${meta.railClassName}`} />
                      <div className="grid gap-2.5 p-2.5 min-[1500px]:grid-cols-[minmax(280px,0.95fr)_minmax(460px,1.35fr)_220px]">
                        <div className="min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex min-w-0 items-start gap-3">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleSupplierGroupSelection(group.key);
                                }}
                                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${
                                  isGroupSelected ? 'border-emerald-300 bg-emerald-400/20 text-emerald-100' : 'border-slate-600 text-slate-500'
                                }`}
                                title="Seleccionar grupo"
                              >
                                {isGroupSelected ? <Check size={14} /> : null}
                              </button>
                              {renderSupplierImage(group, 'h-12 w-12')}
                              <div className="min-w-0">
                              <p className="truncate text-sm font-black text-white" title={group.supplierTitle}>
                                {group.supplierTitle}
                              </p>
                              <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">
                                {group.casaAlbertoId && <span>ID Casa Alberto {group.casaAlbertoId}</span>}
                                {group.supplierCode && <span>Codigo {group.supplierCode}</span>}
                              </div>
                              </div>
                            </div>
                            <span className="inline-flex shrink-0 items-center gap-1.5 pt-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-300">
                              <span className={`h-2 w-2 rounded-full ${meta.railClassName}`} />
                              {meta.label}
                            </span>
                          </div>

                          <div className="mt-2">
                            {renderSupplierPriceSummary(group)}
                          </div>
                          <div className="mt-2">
                            {renderSupplierPriceControls(group)}
                          </div>
                          <p className="mt-1.5 text-[10px] font-bold text-slate-500">
                            Ultimo chequeo: {formatSupplierDate(group.lastCheckedAt)}
                          </p>

                          {group.message ? (
                            <p className="mt-2 text-[11px] font-bold text-slate-400">{group.message}</p>
                          ) : null}
                        </div>

                        <div className="min-w-0 rounded-lg border border-slate-700/75 bg-slate-950/20 p-2">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                              Productos Rebu asociados
                            </p>
                            <span className="rounded-md border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] font-black text-slate-300">
                              {group.products.length}
                            </span>
                          </div>
                          {renderSupplierProducts(group)}
                        </div>

                        <div onClick={(event) => event.stopPropagation()}>
                          {renderSupplierActions(group)}
                          {priceDeltaLabel ? (
                            <span className="rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-1.5 text-center text-[10px] font-black text-amber-100">
                              Proveedor {priceDeltaLabel}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {isEditingLink ? (
                        <div className="border-t border-slate-700/70 bg-slate-950/20 p-3">
                          <div className="grid gap-2 min-[1500px]:grid-cols-[minmax(180px,1fr)_140px_140px_minmax(260px,1.3fr)_auto]">
                            <input
                              value={draft.foundTitle || ''}
                              onChange={(event) => updateSupplierLinkDraft(group.key, 'foundTitle', event.target.value)}
                              placeholder="Nombre Casa Alberto"
                              className="h-9 rounded-md border border-slate-700 bg-[#07111f] px-3 text-xs font-bold text-slate-100 outline-none focus:border-sky-400"
                            />
                            <input
                              value={draft.supplierCode || ''}
                              onChange={(event) => updateSupplierLinkDraft(group.key, 'supplierCode', event.target.value)}
                              placeholder="Codigo proveedor"
                              className="h-9 rounded-md border border-slate-700 bg-[#07111f] px-3 text-xs font-bold text-slate-100 outline-none focus:border-sky-400"
                            />
                            <input
                              value={draft.casaAlbertoId || ''}
                              onChange={(event) => updateSupplierLinkDraft(group.key, 'casaAlbertoId', event.target.value)}
                              placeholder="ID Casa Alberto"
                              className="h-9 rounded-md border border-slate-700 bg-[#07111f] px-3 text-xs font-bold text-slate-100 outline-none focus:border-sky-400"
                            />
                            <input
                              value={draft.productUrl || ''}
                              onChange={(event) => updateSupplierLinkDraft(group.key, 'productUrl', event.target.value)}
                              placeholder="URL del producto"
                              className="h-9 rounded-md border border-slate-700 bg-[#07111f] px-3 text-xs font-bold text-slate-100 outline-none focus:border-sky-400"
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveSupplierLink(group)}
                              className="h-9 rounded-md border border-emerald-400/35 bg-emerald-400/14 px-4 text-xs font-black text-emerald-100 transition-colors hover:bg-emerald-400/20"
                            >
                              Guardar
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>
        {supplierDetailGroup ? (() => {
          const group = supplierDetailGroup;
          const meta = getSupplierPriceStatusMeta(group.status);
          const math = getSupplierCardMath(group);
          return (
            <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-6 backdrop-blur-sm" onClick={() => setSupplierDetailGroupKey('')}>
              <div
                className="flex max-h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-[#0f1e33] text-slate-100 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4 border-b border-slate-700/80 px-4 py-3">
                  <div className="flex min-w-0 gap-3">
                    {renderSupplierImage(group, 'h-20 w-20')}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-md border px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${meta.className}`}>
                          {meta.label}
                        </span>
                        {group.casaAlbertoId ? (
                          <span className="rounded-md border border-slate-700 bg-slate-950/30 px-2 py-1 text-[10px] font-black text-slate-300">
                            ID Casa Alberto {group.casaAlbertoId}
                          </span>
                        ) : null}
                      </div>
                      <h3 className="mt-2 truncate text-lg font-black text-white" title={group.supplierTitle}>{group.supplierTitle}</h3>
                      <p className="mt-1 text-xs font-bold text-slate-400">
                        Codigo proveedor: {group.supplierCode || 'Sin codigo'} - Ultimo chequeo: {formatSupplierDate(group.lastCheckedAt)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSupplierDetailGroupKey('')}
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 bg-slate-950/30 text-slate-300 hover:bg-slate-800"
                    title="Cerrar"
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-4 custom-scrollbar">
                  <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
                    <section className="rounded-lg border border-slate-700/80 bg-slate-950/20 p-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Datos del proveedor</p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-4">
                        <div className="rounded-lg border border-slate-700 bg-[#0b1728] p-2.5">
                          <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">Proveedor</p>
                          <p className="mt-1 text-sm font-black">{math.hasSupplierPrice ? formatSupplierMoney(math.supplierPrice) : '-'}</p>
                        </div>
                        <div className="rounded-lg border border-sky-400/25 bg-sky-400/10 p-2.5">
                          <p className="text-[9px] font-black uppercase tracking-[0.12em] text-sky-200/80">Costo Rebu calculado</p>
                          <p className="mt-1 text-sm font-black text-sky-100">{math.hasSupplierPrice ? formatSupplierMoney(math.estimatedCost) : '-'}</p>
                        </div>
                        <div className="rounded-lg border border-slate-700 bg-[#0b1728] p-2.5">
                          <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">Anterior proveedor</p>
                          <p className="mt-1 text-sm font-black">{group.previousSupplierPrice ? formatSupplierMoney(group.previousSupplierPrice) : '-'}</p>
                        </div>
                        <div className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 p-2.5">
                          <p className="text-[9px] font-black uppercase tracking-[0.12em] text-emerald-200/80">Venta sugerida</p>
                          <p className="mt-1 text-sm font-black text-emerald-100">{math.hasSupplierPrice ? formatSupplierMoney(math.suggestedSale) : '-'}</p>
                        </div>
                      </div>
                      <div className="mt-3">
                        {renderSupplierPriceControls(group)}
                      </div>
                      {group.message ? (
                        <p className="mt-3 rounded-lg border border-slate-700 bg-[#0b1728] p-2 text-xs font-bold text-slate-300">{group.message}</p>
                      ) : null}
                      <div className="mt-4">
                        <p className="mb-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Productos Rebu asociados</p>
                        {renderSupplierProducts(group)}
                      </div>
                    </section>
                    <aside className="space-y-3">
                      <section className="rounded-lg border border-slate-700/80 bg-slate-950/20 p-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Revision</p>
                        <div className="mt-3">
                          {renderSupplierActions(group)}
                        </div>
                      </section>
                      <section className="rounded-lg border border-slate-700/80 bg-slate-950/20 p-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Tracking</p>
                        <div className="mt-2 space-y-1.5 text-xs font-bold text-slate-300">
                          <p>Estado: <span className="text-white">{getCasaAlbertoPriceTracking(group.products[0] || {}).reviewStatus || group.status}</span></p>
                          <p>Fuente: <span className="text-white">{group.productUrl || group.sourceUrl ? 'Disponible' : 'Sin URL'}</span></p>
                          <p>Seleccionados: <span className="text-white">{getSupplierSelectedCount(group)}/{group.products.length}</span></p>
                        </div>
                      </section>
                    </aside>
                  </div>
                </div>
              </div>
            </div>
          );
        })() : null}
      </div>
    );
  };

  const renderEditorMasivo = () => (
    <div className="flex flex-col flex-1 min-h-0 gap-3 overflow-hidden">
      
      <style>{`
        .no-spinners::-webkit-outer-spin-button,
        .no-spinners::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .no-spinners { -moz-appearance: textfield; }
      `}</style>

      <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
        {/* PANEL DE CONTROL */}
        <aside className="relative z-10 flex w-[300px] shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm min-[1600px]:w-[320px]">
        <div className="h-1 shrink-0 bg-amber-400" />
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 custom-scrollbar">
        
        <section className="rounded-lg border border-slate-200 bg-slate-50/80 p-2.5">
          <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Ajuste masivo</span>
          <select 
            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-800 outline-none transition-all focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
            value={bulkAction.field}
            onChange={(e) => setBulkAction({...bulkAction, field: e.target.value})}
          >
            <option value="price">Aumentar Precio</option>
            <option value="purchasePrice">Aumentar Costo</option>
            <option value="grossMarginPrice">Calcular venta por margen real</option>
          </select>
          {bulkAction.field === 'grossMarginPrice' ? (
            <div className="mt-2 space-y-2">
              <PricingFormulaControls
                marginPercent={pricingPreferences.marginPercent}
                onMarginChange={updatePricingMargin}
                costIncludesVat={pricingPreferences.bulkCostIncludesVat}
                onCostIncludesVatChange={updateBulkCostIncludesVat}
                showVatMode
                compact
              />
              {bulkPricingPreview?.isValid ? (
                <PricingFormulaTrace
                  baseCost={bulkPricingPreview.baseCost}
                  realCost={bulkPricingPreview.realCost}
                  salePrice={bulkPricingPreview.salePrice}
                  marginPercent={bulkPricingPreview.marginPercent}
                />
              ) : (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[9px] font-bold text-amber-800">
                  Selecciona un producto con costo mayor que cero para ver la traza.
                </p>
              )}
            </div>
          ) : (
            <div className="relative mt-2">
              <input
                type="number"
                placeholder="Ej: 15"
                className="no-spinners w-full rounded-md border border-slate-200 bg-white py-1.5 pl-2 pr-7 text-center text-xs font-black text-slate-900 outline-none transition-all focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
                value={bulkAction.percentage}
                onChange={(e) => setBulkAction({...bulkAction, percentage: e.target.value})}
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">%</span>
            </div>
          )}
          <button 
            onClick={applyBulkPercentage}
            disabled={selectedIds.length === 0 || (bulkAction.field !== 'grossMarginPrice' && !bulkAction.percentage)}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-xs font-black text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <ArrowRight size={14} /> Aplicar a {selectedIds.length}
          </button>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-2.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Filtros</span>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-black text-slate-600">{filteredProducts.length}</span>
          </div>
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input 
              type="text" 
              placeholder="Buscar producto..." 
              className="w-full rounded-md border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-xs font-bold outline-none transition-all focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-200"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select 
            className="mb-2 w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-2 text-xs font-bold text-slate-800 outline-none transition-all focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-200"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            <option value="Todas">Todos</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button
            type="button"
            onClick={() => setShowOnlyOutOfStock((prev) => !prev)}
            className={`mb-2 flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs font-black transition-all ${
              showOnlyOutOfStock
                ? 'bg-red-50 border-red-200 text-red-700'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-white'
            }`}
            title="Filtrar sólo productos agotados"
          >
            <span className="flex items-center gap-1.5">
              <PackageX size={14} />
              Agotados
            </span>
            <span className="text-[10px] opacity-70">{visibleOutOfStockIds.length}</span>
          </button>
          <button
            type="button"
            onClick={handleSelectOutOfStock}
            disabled={visibleOutOfStockIds.length === 0}
            className={`flex w-full items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-black transition-all ${
              areAllVisibleOutOfStockSelected
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-white border-amber-200 text-amber-700 hover:bg-amber-50'
            } disabled:cursor-not-allowed disabled:opacity-45`}
            title="Seleccionar todos los agotados visibles para exportación o reposición"
          >
            <CheckSquare size={14} />
            {areAllVisibleOutOfStockSelected ? 'Agotados listos' : `Seleccionar agotados${visibleOutOfStockIds.length > 0 ? ` (${visibleOutOfStockIds.length})` : ''}`}
          </button>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-2.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Fotos de productos</span>
            <span className={`rounded-md border px-2 py-1 text-[10px] font-black ${
              replaceExistingProductImages
                ? 'border-amber-200 bg-amber-50 text-amber-700'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700'
            }`}>
              {replaceExistingProductImages ? selectedImageCorrectionCandidates.length : imageImportCandidates.length}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setReplaceExistingProductImages((current) => !current)}
            className={`mb-2 flex w-full items-center justify-between rounded-md border px-2.5 py-2 text-left transition-colors ${
              replaceExistingProductImages
                ? 'border-amber-300 bg-amber-50 text-amber-900'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span>
              <span className="block text-[11px] font-black">Corregir fotos seleccionadas</span>
              <span className="mt-0.5 block text-[9px] font-bold opacity-70">Permite reemplazar una foto existente</span>
            </span>
            <span className={`h-4 w-7 rounded-full p-0.5 transition-colors ${
              replaceExistingProductImages ? 'bg-amber-500' : 'bg-slate-300'
            }`}>
              <span className={`block h-3 w-3 rounded-full bg-white transition-transform ${
                replaceExistingProductImages ? 'translate-x-3' : ''
              }`} />
            </span>
          </button>
          <button
            type="button"
            onClick={openImageImportModal}
            disabled={replaceExistingProductImages
              ? selectedImageCorrectionCandidates.length === 0
              : imageImportCandidates.length === 0}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-45"
            title={replaceExistingProductImages
              ? 'Buscar nuevamente la foto de los productos seleccionados'
              : 'Buscar fotos en Cotillon Casa Alberto por codigo o nombre'}
          >
            <Camera size={14} />
            {replaceExistingProductImages ? 'Buscar reemplazos' : 'Buscar fotos'}
          </button>
          <p className="mt-2 text-[10px] font-bold leading-snug text-slate-500">
            Usa productos seleccionados o todos los que no tienen foto. Sin codigo, busca por nombre.
          </p>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-2.5">
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Salida</p>
          <button 
            onClick={openExportPreview}
            className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-700 transition-colors hover:bg-white"
          >
            <FileText size={14} />
            {selectedIds.length > 0 ? `Añadir al PDF (${selectedIds.length})` : `Ver Presupuesto ${exportItems.length > 0 ? `(${exportItems.length})` : ''}`}
          </button>

          {showOnlyOutOfStock && (
            <span className="mb-2 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] font-bold leading-snug text-amber-800">
              <PackageX size={12} />
              Exporta agotados y podés sumar otros para reponer
            </span>
          )}

          <button 
            onClick={handleResetAllEdits}
            disabled={(!hasPendingBulkChanges && selectedIds.length === 0 && bulkAction.percentage === '') || isSaving}
            className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <RotateCcw size={14} />
            Deshacer todo
          </button>

          <AsyncActionButton 
            onAction={handleSaveBulk}
            pending={isSaving}
            disabled={selectedIds.length === 0 || isSaving}
            loadingLabel="Guardando..."
            className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-xs font-black text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Guardar cambios ({selectedIds.length})
          </AsyncActionButton>
        </section>
        </div>
        </aside>

      {/* TABLA PRINCIPAL CON SCROLL LAZY LOAD */}
      <div className="relative z-0 flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-y-auto custom-scrollbar flex-1 relative" onScroll={handleMainScroll}>
          <table className="relative w-full table-fixed border-collapse text-left">
            <thead className="bulk-editor-table-header sticky top-0 z-20 text-white">
              <tr className="h-10">
                <th className="w-10 px-2 text-center">
                  <button onClick={toggleSelectAll} className="transition-colors hover:text-emerald-200">
                    {areAllFilteredSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                  </button>
                </th>
                <th className="w-16 px-1 text-left text-[10px] font-black uppercase tracking-wider">Foto</th>
                <th className="min-w-[220px] px-2 text-[10px] font-black uppercase tracking-wider">Producto</th>
                <th className="w-28 px-2 text-[10px] font-black uppercase tracking-wider">Costo</th>
                <th className="w-28 px-2 text-[10px] font-black uppercase tracking-wider">Precio</th>
                <th className="w-20 px-2 text-center text-[10px] font-black uppercase tracking-wider">Stock</th>
                <th className="w-[76px] px-2 text-center text-[10px] font-black uppercase tracking-wider">Acción</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.slice(0, mainLimit).map(p => {
                const isSelected = selectedIds.includes(p.id);
                const isWeight = p.product_type === 'weight';
                const rowChanged = hasChanges(p);
                const editVals = edits[p.id] || {};

                const origCost = getOriginalVal(p, 'purchasePrice');
                const origPrice = getOriginalVal(p, 'price');
                const newCost = Number(editVals.purchasePrice) || 0;
                const newPrice = Number(editVals.price) || 0;
                
                const costDiff = calculateDiffPercent(origCost, newCost);
                const priceDiff = calculateDiffPercent(origPrice, newPrice);
                const stockChanged = Number(editVals.stock) !== getOriginalVal(p, 'stock');

                return (
                  <tr
                    key={p.id}
                    className={`bulk-editor-product-row h-14 border-b border-slate-100 transition-colors last:border-b-0 ${
                      isSelected ? 'is-selected' : ''
                    }`}
                  >
                    <td className="p-0 text-center align-middle">
                      <div className="flex h-14 items-center justify-center px-2">
                        <button onClick={() => toggleSelect(p.id)} className={`transition-colors ${isSelected ? 'text-emerald-600' : 'text-slate-300 hover:text-slate-500'}`}>
                          {isSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                        </button>
                      </div>
                    </td>
                    <td className="w-16 p-0 align-middle">
                      <div className="flex h-14 items-center px-1">
                        {getProductImageUrl(p) ? (
                          <button
                            type="button"
                            onClick={() => setProductImagePreview(getProductImageUrl(p))}
                            className="group relative h-10 w-10 overflow-hidden rounded-md border border-slate-200 bg-white outline-none transition-colors hover:border-blue-400 focus-visible:ring-2 focus-visible:ring-blue-400"
                            title={`Ampliar imagen de ${p.title}`}
                          >
                            <img
                              src={getProductImageUrl(p)}
                              alt={p.title}
                              className="h-full w-full cursor-zoom-in object-cover object-center transition-transform duration-150 group-hover:scale-105"
                            />
                          </button>
                        ) : (
                          <span className="flex h-10 w-10 items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50 text-slate-300">
                            <ImageIcon size={14} />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="min-w-0 p-0 align-middle">
                      <div className="flex h-14 min-w-0 flex-col justify-center gap-1 px-2">
                        <p className="truncate text-xs font-black leading-none text-slate-800" title={p.title}>{p.title}</p>
                        <div className="flex min-w-0 items-center gap-1.5 text-[8px] font-bold uppercase leading-none text-slate-400">
                          {p.category && <span className="max-w-[150px] truncate">{p.category}</span>}
                          {p.category && <span className="text-slate-300">/</span>}
                          <span>{isWeight ? 'Por peso' : 'Por unidad'}</span>
                        </div>
                      </div>
                    </td>
                    
                    <td className="p-0 align-middle">
                      <div className="relative flex h-14 items-center px-2">
                        {costDiff ? (
                          <div className="absolute inset-x-3 top-1 flex items-center justify-between text-[9px] font-medium text-slate-400">
                            <span className="line-through"><FancyPrice amount={origCost} /></span>
                            <span className={`font-black ${costDiff.includes('+') ? 'text-red-500' : 'text-emerald-500'}`}>
                              ({costDiff})
                            </span>
                          </div>
                        ) : null}
                        <div className={`bulk-editor-number-field flex h-8 w-full overflow-hidden rounded-md border bg-white transition-colors focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 ${
                          costDiff ? 'border-l-2 border-blue-500' : 'border-slate-200'
                        }`}>
                          <span className="flex w-6 shrink-0 items-center justify-center border-r border-slate-200 bg-slate-50 text-[11px] font-black text-slate-500">$</span>
                          <input 
                            type="number" 
                            value={editVals.purchasePrice ?? ''} 
                            onChange={(e) => handleEditChange(p.id, 'purchasePrice', e.target.value)}
                            className={`no-spinners min-w-0 flex-1 bg-transparent px-2 text-right text-[13px] font-black tabular-nums outline-none ${
                              costDiff ? 'text-blue-900' : 'text-slate-800'
                            }`}
                          />
                        </div>
                      </div>
                    </td>

                    <td className="p-0 align-middle">
                      <div className="relative flex h-14 items-center px-2">
                        {priceDiff ? (
                          <div className="absolute inset-x-3 top-1 flex items-center justify-between text-[9px] font-medium text-slate-400">
                            <span className="line-through"><FancyPrice amount={origPrice} /></span>
                            <span className={`font-black ${priceDiff.includes('+') ? 'text-emerald-500' : 'text-red-500'}`}>
                              ({priceDiff})
                            </span>
                          </div>
                        ) : null}
                        <div className={`bulk-editor-number-field flex h-8 w-full overflow-hidden rounded-md border bg-white transition-colors focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 ${
                          priceDiff ? 'border-l-2 border-blue-500' : 'border-slate-200'
                        }`}>
                          <span className="flex w-6 shrink-0 items-center justify-center border-r border-slate-200 bg-slate-50 text-[11px] font-black text-slate-500">$</span>
                          <input 
                            type="number" 
                            step="1"
                            value={editVals.price ?? ''} 
                            onChange={(e) => handleEditChange(p.id, 'price', e.target.value)}
                            onBlur={(e) => handleEditChange(p.id, 'price', String(normalizeFinalSalePrice(e.target.value)))}
                            className={`no-spinners min-w-0 flex-1 bg-transparent px-2 text-right text-[13px] font-black tabular-nums outline-none ${
                              priceDiff ? 'text-blue-900' : 'text-slate-900'
                            }`}
                          />
                        </div>
                      </div>
                    </td>

                    <td className="p-0 align-middle">
                      <div className="flex h-14 items-center px-2">
                        <div className={`bulk-editor-number-field flex h-8 w-full overflow-hidden rounded-md border bg-white transition-colors focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 ${
                          stockChanged ? 'border-l-2 border-blue-500' : 'border-slate-200'
                        }`}>
                          <input
                            type="number"
                            value={editVals.stock ?? ''}
                            onChange={(e) => handleEditChange(p.id, 'stock', e.target.value)}
                            className={`no-spinners min-w-0 flex-1 bg-transparent px-1 text-right text-[13px] font-black tabular-nums outline-none ${
                              stockChanged ? 'text-blue-900' : 'text-slate-800'
                            }`}
                          />
                          <span className="flex min-w-6 shrink-0 items-center justify-center border-l border-slate-200 bg-slate-50 px-1 text-[9px] font-black uppercase text-slate-500">
                            {isWeight ? 'g' : 'u'}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="p-0 align-middle">
                      <div className="flex h-14 w-full items-center justify-center gap-1.5 px-2">
                        {rowChanged ? (
                          <>
                            <AsyncActionButton 
                              onAction={() => handleSaveSingle(p)}
                              pending={isPending(`bulk-save-single:${p.id}`)}
                              loadingContent={<Loader2 size={12} className="animate-spin" />}
                              disabled={isSaving}
                              title="Guardar Cambio"
                              className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                            >
                              <Save size={14} />
                            </AsyncActionButton>
                            <button 
                              onClick={() => handleResetRow(p)}
                              disabled={isSaving}
                              title="Deshacer"
                              className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
                            >
                              <RotateCcw size={14} />
                            </button>
                          </>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">--</span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              
              {mainLimit < filteredProducts.length && (
                <tr>
                  <td colSpan="7" className="p-3 text-center text-slate-400 text-[10px] font-bold bg-slate-50 flex items-center justify-center gap-2">
                    <ChevronDown size={14} className="animate-bounce" /> Sigue bajando para cargar más...
                  </td>
                </tr>
              )}
              
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-slate-400 font-bold text-xs">No hay productos que coincidan con la búsqueda.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>

      {/* ✨ HUD COMPACTO: VISTA PREVIA Y EDICIÓN DE CANTIDADES */}
      {isExportModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-[#0b1728] rounded-xl shadow-2xl w-full max-w-6xl h-full max-h-[95vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-700">
            
            {/* Modal Header */}
            <div className="bg-[#0f1e33] border-b border-slate-700 px-4 py-2.5 flex justify-between items-center text-white shrink-0">
              <div>
                <h3 className="font-bold text-base flex items-center gap-2">
                  <FileText size={18} /> Preview de PDF
                </h3>
              </div>
              <button onClick={() => setIsExportModalOpen(false)} className="text-slate-400 hover:text-white transition-colors bg-slate-900/60 p-1.5 rounded-lg">
                <X size={18} />
              </button>
            </div>
            
            {/* Modal Body */}
            <div className="flex flex-1 overflow-hidden">
              
              {/* COLUMNA IZQUIERDA: Configuración (Miniaturizada) */}
              <div className="w-1/3 bg-[#0b1728] border-r border-slate-700 p-4 flex flex-col overflow-y-auto custom-scrollbar">
                
                <h4 className="font-black text-slate-100 uppercase tracking-wider text-[11px] mb-3 flex items-center gap-1.5">
                  <User size={14} className="text-sky-300"/> Tipo de Documento
                </h4>
                
                <div className="flex items-center justify-between p-3 bg-[#0f1e33] border border-slate-700 rounded-xl mb-4">
                  <div>
                    <p className="font-bold text-xs text-slate-100">Presupuesto a Cliente</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={exportConfig.isForClient} onChange={(e) => setExportConfig({...exportConfig, isForClient: e.target.checked})} />
                    <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>

                {exportConfig.isForClient ? (
                  <div className="space-y-3 animate-in fade-in duration-300">
                    <div className="bg-sky-500/10 border border-sky-400/25 rounded-xl p-3 space-y-3">
                      
                      <div>
                        <label className="block text-[9px] font-bold text-sky-200 mb-1 uppercase tracking-wider">
                          Título del Documento
                        </label>
                        <input 
                          type="text" 
                          maxLength={30} 
                          placeholder="Ej: PRESUPUESTO" 
                          className="w-full px-2.5 py-1.5 border border-slate-600 rounded-lg text-xs outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-500/40 bg-[#07111f] text-slate-100 font-bold uppercase placeholder:normal-case placeholder:font-normal placeholder:text-slate-500" 
                          value={exportConfig.documentTitle} 
                          onChange={(e) => setExportConfig({...exportConfig, documentTitle: e.target.value.toUpperCase()})} 
                        />
                      </div>

                      <div>
                        <label className="block text-[9px] font-bold text-sky-200 mb-1 uppercase tracking-wider">
                          Nombre del Cliente
                        </label>
                        <input 
                          type="text" 
                          maxLength={40} 
                          placeholder="Ej: Sofía" 
                          className="w-full px-2.5 py-1.5 border border-slate-600 rounded-lg text-xs outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-500/40 bg-[#07111f] text-slate-100 placeholder:text-slate-500" 
                          value={exportConfig.clientName} 
                          onChange={(e) => setExportConfig({...exportConfig, clientName: e.target.value})} 
                        />
                      </div>
                    </div>
                    
                    <div className="bg-[#0f1e33] border border-slate-700 rounded-xl p-3 space-y-3">
                      <div>
                        <label className="block text-[9px] font-bold text-slate-300 mb-1 uppercase tracking-wider">Detalle del Evento</label>
                        <input 
                          type="text" 
                          maxLength={40} 
                          placeholder="Ej: 15 Años" 
                          className="w-full px-2.5 py-1.5 border border-slate-600 rounded-lg text-xs outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-500/40 bg-[#07111f] text-slate-100 placeholder:text-slate-500" 
                          value={exportConfig.clientEvent} 
                          onChange={(e) => setExportConfig({...exportConfig, clientEvent: e.target.value})} 
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-slate-300 mb-1 uppercase tracking-wider">Teléfono</label>
                        <input 
                          type="text" 
                          maxLength={10} 
                          placeholder="Ej: 1112345678" 
                          className="w-full px-2.5 py-1.5 border border-slate-600 rounded-lg text-xs outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-500/40 bg-[#07111f] text-slate-100 placeholder:text-slate-500" 
                          value={exportConfig.clientPhone} 
                          onChange={(e) => setExportConfig({...exportConfig, clientPhone: e.target.value})} 
                        />
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-700">
                      <label className="block text-[9px] font-bold text-slate-300 mb-2 uppercase tracking-wider">Mostrar en PDF:</label>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="flex items-center gap-1.5 p-1.5 border border-slate-700 rounded-lg cursor-pointer hover:bg-slate-800 bg-[#0f1e33] transition-colors">
                          <input type="checkbox" className="accent-indigo-600 w-3.5 h-3.5" checked={exportConfig.clientColumns.showQty} onChange={(e) => setExportConfig({...exportConfig, clientColumns: {...exportConfig.clientColumns, showQty: e.target.checked}})} />
                          <span className="text-[10px] font-bold text-slate-200">Cantidades</span>
                        </label>
                        <label className="flex items-center gap-1.5 p-1.5 border border-slate-700 rounded-lg cursor-pointer hover:bg-slate-800 bg-[#0f1e33] transition-colors">
                          <input type="checkbox" className="accent-indigo-600 w-3.5 h-3.5" checked={exportConfig.clientColumns.showUnitPrice} onChange={(e) => setExportConfig({...exportConfig, clientColumns: {...exportConfig.clientColumns, showUnitPrice: e.target.checked}})} />
                          <span className="text-[10px] font-bold text-slate-200">Precio Unitario</span>
                        </label>
                        <label className="flex items-center gap-1.5 p-1.5 border border-slate-700 rounded-lg cursor-pointer hover:bg-slate-800 bg-[#0f1e33] transition-colors">
                          <input type="checkbox" className="accent-indigo-600 w-3.5 h-3.5" checked={exportConfig.clientColumns.showSubtotal} onChange={(e) => setExportConfig({...exportConfig, clientColumns: {...exportConfig.clientColumns, showSubtotal: e.target.checked}})} />
                          <span className="text-[10px] font-bold text-slate-200">Subtotales</span>
                        </label>
                        <label className="flex items-center gap-1.5 p-1.5 border border-slate-700 rounded-lg cursor-pointer hover:bg-slate-800 bg-[#0f1e33] transition-colors">
                          <input type="checkbox" className="accent-indigo-600 w-3.5 h-3.5" checked={exportConfig.clientColumns.showTotal} onChange={(e) => setExportConfig({...exportConfig, clientColumns: {...exportConfig.clientColumns, showTotal: e.target.checked}})} />
                          <span className="text-[10px] font-bold text-slate-200">Total Final</span>
                        </label>
                      </div>
                    </div>

                  </div>
                ) : (
                  <div className="space-y-3 animate-in fade-in duration-300">
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">
                      <p className="text-amber-800 text-[10px] font-medium">Estás exportando un <strong>Reporte Interno</strong>.</p>
                    </div>
                    <label className="block text-[9px] font-bold text-slate-300 mb-2 uppercase tracking-wider">Columnas Visibles:</label>
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-2 p-2 border border-slate-700 rounded-lg cursor-pointer hover:bg-slate-800 transition-colors bg-[#0f1e33]">
                        <input type="checkbox" className="accent-indigo-600 w-3.5 h-3.5" checked={exportConfig.columns.cost} onChange={(e) => setExportConfig({...exportConfig, columns: {...exportConfig.columns, cost: e.target.checked}})} />
                        <span className="text-xs font-bold text-slate-200">Costo Original</span>
                      </label>
                      <label className="flex items-center gap-2 p-2 border border-slate-700 rounded-lg cursor-pointer hover:bg-slate-800 transition-colors bg-[#0f1e33]">
                        <input type="checkbox" className="accent-indigo-600 w-3.5 h-3.5" checked={exportConfig.columns.price} onChange={(e) => setExportConfig({...exportConfig, columns: {...exportConfig.columns, price: e.target.checked}})} />
                        <span className="text-xs font-bold text-slate-200">Precio Original</span>
                      </label>
                      <label className="flex items-center gap-2 p-2 border border-sky-400/25 rounded-lg cursor-pointer hover:bg-sky-500/10 transition-colors bg-sky-500/10">
                        <input type="checkbox" className="accent-indigo-600 w-3.5 h-3.5" checked={exportConfig.columns.newPrice} onChange={(e) => setExportConfig({...exportConfig, columns: {...exportConfig.columns, newPrice: e.target.checked}})} />
                        <span className="text-xs font-bold text-sky-100">Precio Editado (Rec.)</span>
                      </label>
                      <label className="flex items-center gap-2 p-2 border border-slate-700 rounded-lg cursor-pointer hover:bg-slate-800 transition-colors bg-[#0f1e33]">
                        <input type="checkbox" className="accent-indigo-600 w-3.5 h-3.5" checked={exportConfig.columns.stock} onChange={(e) => setExportConfig({...exportConfig, columns: {...exportConfig.columns, stock: e.target.checked}})} />
                        <span className="text-xs font-bold text-slate-200">Stock Actual</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* COLUMNA DERECHA: Vista Previa */}
              <div className="w-2/3 bg-[#07111f] flex flex-col p-4 overflow-hidden">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-black text-slate-100 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <Edit3 size={14} className="text-sky-300"/> 
                    {exportConfig.isForClient ? 'Ajustar Cantidades del Presupuesto' : 'Resumen de Productos a Exportar'}
                  </h4>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={handleClearPreview}
                      className="bg-[#0f1e33] hover:bg-red-500/10 text-slate-300 hover:text-red-200 font-bold text-[9px] px-2 py-1 rounded flex items-center gap-1 transition-colors uppercase tracking-wider border border-slate-700 hover:border-red-400/40"
                      title="Limpiar todo el presupuesto"
                    >
                      <Trash2 size={10} strokeWidth={3} /> Limpiar
                    </button>
                    
                    {exportConfig.isForClient && (
                      <button 
                        onClick={handleAddTemporaryItem}
                        className="bg-sky-500/15 hover:bg-sky-500/25 text-sky-100 font-bold text-[9px] px-2 py-1 rounded flex items-center gap-1 transition-colors uppercase tracking-wider border border-sky-400/30"
                      >
                        <Plus size={10} strokeWidth={3} /> Producto Extra
                      </button>
                    )}
                  </div>
                </div>

                <div className="bg-[#0f1e33] border border-slate-700 rounded-xl flex-1 overflow-hidden flex flex-col">
                  {/* SCROLL CONTAINER (Tabla Ajustada) */}
                  <div className="overflow-y-auto custom-scrollbar flex-1 relative" onScroll={handlePreviewScroll}>
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-950 text-slate-100 sticky top-0 z-[70]">
                        <tr>
                          <th className="py-2 px-3 font-bold text-[9px] uppercase tracking-wider">Producto</th>
                          {exportConfig.isForClient ? (
                            <>
                              {exportConfig.clientColumns.showUnitPrice && <th className="py-2 px-3 font-bold text-[9px] uppercase tracking-wider text-right w-24">Precio Ud.</th>}
                              {exportConfig.clientColumns.showQty && <th className="py-2 px-3 font-bold text-[9px] uppercase tracking-wider text-center w-20">Cantidad</th>}
                              {exportConfig.clientColumns.showSubtotal && <th className="py-2 px-3 font-bold text-[9px] uppercase tracking-wider text-right w-28">Subtotal Visual</th>}
                              <th className="w-8"></th>
                            </>
                          ) : (
                            <>
                              <th className="py-2 px-3 font-bold text-[9px] uppercase tracking-wider text-right w-24">Precio Ud.</th>
                              <th className="w-8"></th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-700 pb-20 text-slate-100">
                        {exportItems.slice(0, previewLimit).map((item, idx) => {
                          const isWeight = item.product_type === 'weight';
                          const subtotal = isWeight ? item.newPrice * (item.qty / 1000) : item.newPrice * item.qty;
                          
                          const rowColorClass = idx % 2 !== 0 ? 'bg-slate-900/28' : 'bg-transparent';

                          return (
                            <tr key={item.id} className={`hover:bg-slate-800/50 transition-colors ${rowColorClass}`}>
                              <td className="py-1.5 px-3 relative">
                                <div className="flex flex-col gap-0.5">
                                  {/* SI ES TEMPORAL Y NO ESTÁ BLOQUEADO */}
                                  {item.isTemporary && !item.isTitleLocked ? (
                                    <div className="relative">
                                      <input 
                                        type="text"
                                        className="w-full px-1.5 py-1 text-[11px] font-bold border border-slate-600 rounded focus:border-sky-400 outline-none bg-[#07111f] text-slate-100 placeholder:text-slate-500"
                                        value={item.title}
                                        onChange={(e) => {
                                          updateExportItemField(item.id, 'title', e.target.value);
                                          setFocusedTempId(item.id);
                                        }}
                                        onFocus={() => setFocusedTempId(item.id)}
                                        onBlur={() => setTimeout(() => setFocusedTempId(null), 250)}
                                        placeholder="Nombre del producto o servicio..."
                                        autoFocus
                                      />
                                      {focusedTempId === item.id && item.title.length >= 2 && (
                                        <ul className="absolute top-full left-0 w-full min-w-[250px] bg-[#0f1e33] border border-sky-400/30 shadow-2xl rounded-lg mt-1 z-[80] max-h-[160px] overflow-y-auto custom-scrollbar divide-y divide-slate-700">
                                          {/* ✨ BÚSQUEDA TOKENIZADA */}
                                          {sandboxInventory
                                            .filter(p => {
                                              const searchStr = (item.title || '').toLowerCase().trim();
                                              if (!searchStr) return true;
                                              const words = searchStr.split(/\s+/);
                                              const targetTitle = (p.title || '').toLowerCase();
                                              const targetBarcode = (p.barcode || '').toLowerCase();
                                              return words.every(w => targetTitle.includes(w) || targetBarcode.includes(w));
                                            })
                                            .slice(0, 15)
                                            .map(p => {
                                              const previewPrice = Number(edits[p.id]?.price) || getOriginalVal(p, 'price');
                                              return (
                                                <li
                                                  key={p.id}
                                                  className="p-1.5 hover:bg-sky-500/10 cursor-pointer flex justify-between items-center transition-colors"
                                                  onMouseDown={(e) => {
                                                    e.preventDefault();
                                                    handleSelectProductForTemp(item.id, p);
                                                  }}
                                                >
                                                  <div className="truncate flex-1 pr-2">
                                                    <span className="font-bold text-[11px] text-slate-100 block truncate">{p.title}</span>
                                                    <span className="text-[8px] text-slate-400 uppercase">{p.category}</span>
                                                  </div>
                                                    <span className="text-[11px] font-bold text-sky-200 shrink-0">
                                                    $<FancyPrice amount={previewPrice} />
                                                  </span>
                                                </li>
                                              )
                                            })}
                                          {sandboxInventory.filter(p => {
                                              const searchStr = (item.title || '').toLowerCase().trim();
                                              if (!searchStr) return true;
                                              const words = searchStr.split(/\s+/);
                                              const targetTitle = (p.title || '').toLowerCase();
                                              const targetBarcode = (p.barcode || '').toLowerCase();
                                              return words.every(w => targetTitle.includes(w) || targetBarcode.includes(w));
                                            }).length === 0 && (
                                            <li 
                                              className="p-1.5 text-[10px] font-bold text-sky-200 hover:bg-sky-500/10 cursor-pointer text-center transition-colors flex items-center justify-center gap-1"
                                              onMouseDown={(e) => {
                                                e.preventDefault();
                                                handleSetAsCustomProduct(item.id);
                                              }}
                                            >
                                              <Plus size={12} /> Fijar en base de datos
                                            </li>
                                          )}
                                        </ul>
                                      )}
                                    </div>
                                  ) : (
                                    /* SI YA SE BLOQUEÓ, SE MUESTRA COMO TEXTO NORMAL */
                                    <div className="flex items-center gap-1.5">
                                      <p className="font-bold text-slate-100 text-[11px]">{item.title}</p>
                                      {isWeight && <span className="bg-amber-100 text-amber-700 text-[8px] px-1 rounded font-bold uppercase tracking-widest border border-amber-200 whitespace-nowrap">Por Peso</span>}
                                    </div>
                                  )}
                                  
                                  {item.isTemporary && !item.isTitleLocked ? (
                                    <input 
                                      type="text"
                                      className="w-full max-w-[120px] px-1 py-0.5 text-[8px] font-bold border border-slate-600 rounded outline-none text-slate-300 bg-[#07111f] uppercase"
                                      value={item.category}
                                      onChange={(e) => updateExportItemField(item.id, 'category', e.target.value)}
                                      placeholder="Categoría..."
                                    />
                                  ) : (
                                    <p className="text-[8px] text-slate-500 font-bold uppercase">{item.category}</p>
                                  )}
                                </div>
                              </td>

                              {exportConfig.isForClient ? (
                                <>
                                  {exportConfig.clientColumns.showUnitPrice && (
                                    <td className="py-1.5 px-3 text-right">
                                      {/* ✨ PRECIO EDITABLE PARA TODOS LOS PRODUCTOS */}
                                      <div className="relative inline-block w-24">
                                        <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400 text-[11px] font-bold">$</span>
                                        <input 
                                          type="number"
                                          className="no-spinners w-full pl-4 pr-1.5 py-1 text-[11px] font-bold border border-slate-600 rounded bg-[#07111f] text-slate-100 hover:border-slate-500 focus:border-sky-400 outline-none text-right transition-colors"
                                          value={item.newPrice}
                                          onChange={(e) => updateExportItemField(item.id, 'newPrice', Number(e.target.value) || 0)}
                                        />
                                      </div>
                                      {isWeight && <span className="block text-[8px] text-slate-400 mt-0.5">por Kg</span>}
                                    </td>
                                  )}
                                  {exportConfig.clientColumns.showQty && (
                                    <td className="py-1.5 px-3">
                                      <div className="flex justify-center items-center">
                                        <input 
                                          type="number"
                                          min="1"
                                          className="no-spinners w-12 p-1 text-center text-[11px] font-bold border border-slate-600 bg-[#07111f] text-slate-100 hover:border-slate-500 focus:border-sky-400 focus:ring-1 focus:ring-sky-500/40 outline-none transition-colors"
                                          value={item.qty}
                                          onChange={(e) => updateExportItemQty(item.id, e.target.value)}
                                        />
                                        {isWeight && <span className="ml-1 text-[9px] font-bold text-amber-600">g</span>}
                                      </div>
                                    </td>
                                  )}
                                  {exportConfig.clientColumns.showSubtotal && (
                                    <td className="py-1.5 px-3 text-right">
                                      <span className="font-black text-indigo-700 text-xs"><FancyPrice amount={subtotal} /></span>
                                    </td>
                                  )}
                                </>
                              ) : (
                                <td className="py-1.5 px-3 text-right">
                                  {/* ✨ PRECIO EDITABLE PARA TODOS LOS PRODUCTOS (REPORTE INTERNO) */}
                                  <div className="relative inline-block w-24">
                                    <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400 text-[11px] font-bold">$</span>
                                    <input 
                                      type="number"
                                      className="no-spinners w-full pl-4 pr-1.5 py-1 text-[11px] font-bold border border-slate-600 rounded bg-[#07111f] text-slate-100 hover:border-slate-500 focus:border-sky-400 outline-none text-right transition-colors"
                                      value={item.newPrice}
                                      onChange={(e) => updateExportItemField(item.id, 'newPrice', Number(e.target.value) || 0)}
                                    />
                                  </div>
                                  {isWeight && <span className="block text-[8px] text-slate-400 mt-0.5">por Kg</span>}
                                </td>
                              )}
                              
                              <td className="py-1.5 px-1.5 text-center">
                                <button 
                                  onClick={() => removeExportItem(item.id)} 
                                  className="p-1 rounded-md text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                                  title="Quitar de este PDF"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        
                        {previewLimit < exportItems.length && (
                          <tr>
                            <td colSpan="5" className="p-2 text-center text-slate-400 text-[9px] font-bold bg-slate-900/50 flex items-center justify-center gap-1.5">
                              <ChevronDown size={12} className="animate-bounce" /> Mostrando {previewLimit} de {exportItems.length}
                            </td>
                          </tr>
                        )}
                        
                        {/* Espaciador al final para que el dropdown del último elemento no se corte tanto */}
                        {exportItems.length > 0 && exportItems[exportItems.length - 1].isTemporary && !exportItems[exportItems.length - 1].isTitleLocked && (
                          <tr className="h-16 bg-transparent pointer-events-none"><td colSpan="5"></td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Fila de Total */}
                  {exportConfig.isForClient && exportConfig.clientColumns.showTotal && (
                    <div className="bg-[#0b1728] border-t border-slate-700 p-3 flex justify-between items-center shrink-0 z-20">
                      <span className="font-black text-slate-400 uppercase tracking-widest text-[10px]">Total del Presupuesto:</span>
                      <span className="text-xl font-black text-emerald-300">
                        <FancyPrice amount={exportItems.reduce((acc, item) => acc + (item.product_type === 'weight' ? item.newPrice * (item.qty / 1000) : item.newPrice * item.qty), 0)} />
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-[#0f1e33] border-t border-slate-700 p-3 flex justify-between items-center shrink-0 z-20">
              <span className="text-[11px] font-bold text-slate-300 bg-[#07111f] px-2.5 py-1.5 rounded-md border border-slate-700">
                {exportItems.length} ítems listos
              </span>
              <div className="flex gap-2.5">
                <button 
                  onClick={() => setIsExportModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-bold text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors"
                >
                  Cerrar Vista Previa
                </button>
                <button 
                  onClick={handleConfirmExport}
                  disabled={exportItems.length === 0 || isExportingPdf}
                  className="px-5 py-2 rounded-lg text-xs font-black bg-sky-600 text-white hover:bg-sky-500 disabled:opacity-50 transition-all flex items-center gap-1.5 transform hover:-translate-y-0.5"
                >
                  <FileText size={16} /> {isExportingPdf ? 'GENERANDO...' : 'GUARDAR COMO PDF'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isImageImportModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-4">
          <div className="flex h-full max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-300 bg-slate-100 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
              <div className="min-w-0">
                <h3 className="flex items-center gap-2 text-sm font-black text-slate-900">
                  <Camera size={17} className="text-emerald-600" />
                  Fotos de productos
                </h3>
                <p className="mt-0.5 text-[11px] font-bold text-slate-500">
                  1. Confirmar sesion · 2. Probar 10 · 3. Aplicar aprobadas
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">
                  {imageImportRows.length} en lote
                </span>
                <button
                  type="button"
                  onClick={() => setIsImageImportModalOpen(false)}
                  className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                  title={isSearchingImages || isApplyingImages ? 'Cerrar; la tarea continuara en segundo plano' : 'Cerrar'}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)] overflow-hidden">
              <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain border-r border-slate-200 bg-white p-3 custom-scrollbar">
                {renderSupplierSessionControl()}
                <section className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-2.5">
                  <p className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700">Buscar fotos</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleSearchSupplierImages(imageImportSearchLimit === 'all' ? null : Number(imageImportSearchLimit))}
                      disabled={isSearchingImages || isApplyingImages}
                      className="flex items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-xs font-black text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {isSearchingImages ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                      Buscar
                    </button>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setIsImageImportLimitMenuOpen((prev) => !prev)}
                        disabled={isSearchingImages || isApplyingImages}
                        className="flex h-full w-full items-center justify-between gap-2 rounded-md border border-emerald-200 bg-white px-3 py-2 text-xs font-black text-emerald-800 transition-colors hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-45"
                        aria-haspopup="listbox"
                        aria-expanded={isImageImportLimitMenuOpen}
                      >
                        <span>{IMAGE_IMPORT_LIMIT_OPTIONS.find((option) => option.value === imageImportSearchLimit)?.label || '10 fotos'}</span>
                        <ChevronDown size={14} className={`text-emerald-700 transition-transform ${isImageImportLimitMenuOpen ? 'rotate-180' : ''}`} />
                      </button>

                      {isImageImportLimitMenuOpen && !isSearchingImages && !isApplyingImages && (
                        <div
                          role="listbox"
                          className="absolute right-0 top-full z-40 mt-1.5 w-full overflow-hidden rounded-lg border border-emerald-200 bg-white p-1 shadow-xl shadow-slate-900/10"
                        >
                          {IMAGE_IMPORT_LIMIT_OPTIONS.map((option) => {
                            const selected = imageImportSearchLimit === option.value;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                role="option"
                                aria-selected={selected}
                                onClick={() => {
                                  setImageImportSearchLimit(option.value);
                                  setIsImageImportLimitMenuOpen(false);
                                }}
                                className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-[11px] font-black transition-colors ${
                                  selected
                                    ? 'bg-emerald-600 text-white'
                                    : 'text-slate-700 hover:bg-emerald-50 hover:text-emerald-800'
                                }`}
                              >
                                {option.label}
                                {selected && <CheckCircle size={13} />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                  {isSearchingImages && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={handleToggleImageImportPause}
                        disabled={isApplyingImages}
                        className="flex items-center justify-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-800 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {isImageImportPaused ? <Play size={14} /> : <Pause size={14} />}
                        {isImageImportPaused ? 'Reanudar' : 'Pausar'}
                      </button>
                      <button
                        type="button"
                        onClick={handleStopImageImportSearch}
                        disabled={isApplyingImages}
                        className="flex items-center justify-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <StopCircle size={14} />
                        Detener
                      </button>
                    </div>
                  )}
                  <p className="mt-2 text-[10px] font-bold leading-snug text-emerald-800/80">
                    Elegi una cantidad y busca la proxima tanda pendiente. Pausar o detener se aplica al terminar la consulta actual.
                  </p>
                </section>

                <section className="grid grid-cols-2 gap-2">
                  {[
                    ['Pendientes', imageImportStats.pending],
                    ['Encontradas', imageImportStats.found],
                    ['Por codigo', imageImportStats.foundByCode],
                    ['Por nombre', imageImportStats.foundByName],
                    ['Sin foto', imageImportStats.not_found],
                    ['Aprobadas', imageImportStats.approved],
                    ['Aplicadas', imageImportStats.applied],
                    ['Problemas', imageImportStats.error + imageImportStats.apply_error + imageImportStats.login_required],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-slate-200 bg-white p-2">
                      <p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">{label}</p>
                      <p className="mt-1 text-lg font-black text-slate-900">{value}</p>
                    </div>
                  ))}
                </section>

                <div className="mt-auto rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                  <p className="flex items-start gap-1.5 text-[10px] font-bold leading-snug text-amber-800">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                    Si la sesion vence, usa Iniciar sesion. Los datos de Casa Alberto se guardan cifrados en este equipo.
                  </p>
                </div>
              </aside>

              <section className="flex min-h-0 flex-col bg-slate-100">
                <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Revision del lote</p>
                      <p className="mt-0.5 text-[11px] font-bold text-slate-400">
                        {hasImageImportSearchStarted
                          ? `${imageImportProcessedCount} procesados · ${imageImportVisibleRows.length} filas visibles`
                          : 'El lote esta preparado. Empeza con una tanda corta para validar la sesion.'}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <label className="relative block w-56">
                        <span className="sr-only">Buscar en revision del lote</span>
                        <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="search"
                          value={imageImportReviewSearchTerm}
                          onChange={(event) => setImageImportReviewSearchTerm(event.target.value)}
                          placeholder="Buscar producto..."
                          className="h-9 w-full rounded-md border border-slate-200 bg-white py-2 pl-8 pr-2.5 text-xs font-bold text-slate-800 outline-none transition-colors placeholder:text-slate-400 hover:bg-slate-50 focus:border-emerald-300 focus:bg-white"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowImageImportPendingRows((prev) => !prev)}
                        className={`rounded-md border px-3 py-2 text-xs font-black transition-colors ${
                          showImageImportPendingRows
                            ? 'border-slate-300 bg-slate-100 text-slate-800'
                            : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        {showImageImportPendingRows ? 'Ocultar pendientes' : 'Ver pendientes'}
                      </button>
                      <button
                        type="button"
                        onClick={handleApplyImageImports}
                        disabled={imageImportStats.approved === 0 || isSearchingImages || isApplyingImages}
                        className="flex items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-xs font-black text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {isApplyingImages ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                        Aplicar {imageImportStats.approved}
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                      style={{ width: `${imageImportProgressPercent}%` }}
                    />
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-auto overscroll-contain px-3 py-1.5 custom-scrollbar">
                  {!hasImageImportSearchStarted && !showImageImportPendingRows && !normalizedImageImportSearchTerm ? (
                    <div className="flex h-full min-h-[360px] items-center justify-center rounded-lg bg-white">
                      <div className="max-w-sm text-center">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700">
                          <Camera size={22} />
                        </div>
                        <h4 className="mt-3 text-sm font-black text-slate-900">Lote preparado</h4>
                        <p className="mt-1 text-xs font-bold leading-relaxed text-slate-500">
                          Hay {imageImportRows.length} productos sin foto. Los que no tienen codigo se buscaran por nombre. Usa <span className="font-black text-slate-800">Probar 10</span> para validar la sesion.
                        </p>
                      </div>
                    </div>
                  ) : imageImportVisibleRows.length === 0 ? (
                    <div className="flex h-full min-h-[280px] items-center justify-center rounded-lg border border-slate-200 bg-white">
                      <p className="text-xs font-black text-slate-400">No hay filas para mostrar con el filtro actual.</p>
                    </div>
                  ) : (
                  <div className="min-w-full overflow-x-auto">
                    <table className="w-full min-w-[760px] table-fixed text-left">
                      <thead className="sticky top-0 z-10 bg-slate-800 text-white">
                        <tr>
                          <th className="w-10 px-2 py-2 text-center text-[9px] font-black uppercase tracking-wider">OK</th>
                          <th className="w-16 px-2 py-2 text-[9px] font-black uppercase tracking-wider">Foto</th>
                          <th className="px-2 py-2 text-[9px] font-black uppercase tracking-wider">Producto</th>
                          <th className="w-36 px-2 py-2 text-[9px] font-black uppercase tracking-wider">Codigo</th>
                          <th className="w-28 px-2 py-2 text-[9px] font-black uppercase tracking-wider">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {imageImportVisibleRows.map((row) => {
                          const statusMeta = getImageImportStatusMeta(row.status);
                          return (
                            <tr key={row.rowId} className="h-[68px] transition-colors hover:bg-slate-50">
                              <td className="px-2 py-1.5 text-center align-middle">
                                <button
                                  type="button"
                                  onClick={() => toggleImageImportApproval(row.rowId)}
                                  disabled={!['found', 'apply_error'].includes(row.status) || isApplyingImages}
                                  className={`mx-auto flex h-6 w-6 items-center justify-center rounded-md border transition-colors ${
                                    row.approved
                                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                      : 'border-slate-200 bg-white text-slate-300 hover:text-slate-500'
                                  } disabled:cursor-not-allowed disabled:opacity-45`}
                                >
                                  {row.approved ? <CheckSquare size={14} /> : <Square size={14} />}
                                </button>
                              </td>
                              <td className="px-2 py-1.5 align-middle">
                                {row.status === 'searching' ? (
                                  <span className="flex h-12 w-12 items-center justify-center rounded-md border border-amber-200 bg-amber-50 text-amber-700">
                                    <Loader2 size={14} className="animate-spin" />
                                  </span>
                                ) : row.imageDataUrl ? (
                                  <button
                                    type="button"
                                    onClick={() => setImageCandidatePickerRowId(row.rowId)}
                                    className={`relative h-12 w-12 overflow-hidden rounded-md border bg-white transition-colors ${
                                      row.approved ? 'border-emerald-300 ring-2 ring-emerald-200' : 'border-slate-200 hover:border-emerald-300'
                                    }`}
                                    title="Ver fotos encontradas"
                                  >
                                    <img src={row.imageDataUrl} alt="" className="h-full w-full object-cover" />
                                    {row.candidates?.length > 1 && (
                                      <span className="absolute bottom-0 right-0 rounded-tl bg-slate-900/80 px-1 text-[8px] font-black text-white">
                                        {row.candidates.length}
                                      </span>
                                    )}
                                  </button>
                                ) : (
                                  <span className="flex h-12 w-12 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-400">
                                    <ImageIcon size={14} />
                                  </span>
                                )}
                              </td>
                              <td className="min-w-0 overflow-hidden px-2 py-1.5 align-middle">
                                <div className="flex h-12 min-w-0 flex-col justify-center">
                                  <div className="min-w-0">
                                    <p className="block max-w-full truncate text-xs font-black leading-tight text-slate-800" title={row.title}>{row.title}</p>
                                    <p className="mt-0.5 block max-w-full truncate text-[9px] font-bold uppercase leading-tight tracking-wide text-slate-400">{row.category || 'Sin categoria'}</p>
                                  </div>
                                  {row.status === 'found' && (
                                    <p className="mt-0.5 block max-w-full truncate text-[9px] font-bold leading-tight text-emerald-500">
                                      {row.approved ? 'Foto elegida' : `${row.candidates?.length || 1} opcion(es), toca la foto`}
                                    </p>
                                  )}
                                  {row.status !== 'found' && row.message && (
                                    <p className="mt-0.5 block max-w-full truncate text-[9px] font-bold leading-tight text-slate-400" title={row.message}>{row.message}</p>
                                  )}
                                </div>
                              </td>
                              <td className="px-2 py-1.5 align-middle">
                                <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-black text-slate-700">
                                  {row.barcode || 'Sin codigo'}
                                </span>
                              </td>
                              <td className="px-2 py-1.5 align-middle">
                                <span className={`inline-flex rounded-md border px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] ${statusMeta.className}`}>
                                  {statusMeta.label}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  )}
                </div>
              </section>
            </div>

            {imageCandidatePickerRow && (
              <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
                <div className="flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-2xl">
                  <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                    <div className="min-w-0">
                      <h4 className="truncate text-sm font-black text-slate-900">{imageCandidatePickerRow.title}</h4>
                      <p className="mt-0.5 text-[11px] font-bold text-slate-500">
                        {imageCandidatePickerRow.barcode
                          ? `Elegi la foto correcta para codigo ${imageCandidatePickerRow.barcode}`
                          : 'Elegi la coincidencia correcta encontrada por nombre'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setImageCandidatePickerRowId(null)}
                      className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-4 custom-scrollbar">
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                      {(imageCandidatePickerRow.candidates?.length ? imageCandidatePickerRow.candidates : [{
                        imageDataUrl: imageCandidatePickerRow.imageDataUrl,
                        imageUrl: imageCandidatePickerRow.imageUrl,
                        productUrl: imageCandidatePickerRow.productUrl || imageCandidatePickerRow.sourceUrl,
                        foundTitle: imageCandidatePickerRow.foundTitle,
                      }]).map((candidate, candidateIndex) => {
                        const isChosen = Number(imageCandidatePickerRow.selectedCandidateIndex || 0) === candidateIndex && imageCandidatePickerRow.approved;
                        const candidateProductUrl = candidate.productUrl || imageCandidatePickerRow.productUrl || '';
                        const candidateImageUrl = candidate.imageUrl || imageCandidatePickerRow.imageUrl || '';
                        return (
                          <div
                            key={`${imageCandidatePickerRow.rowId}-picker-${candidateIndex}`}
                            className={`overflow-hidden rounded-lg border bg-white ${
                              isChosen ? 'border-emerald-300 ring-2 ring-emerald-100' : 'border-slate-200'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => handleSelectImageCandidate(imageCandidatePickerRow.rowId, candidateIndex)}
                              className="block w-full bg-slate-100"
                            >
                              <img src={candidate.imageDataUrl} alt="" className="h-44 w-full object-contain" />
                            </button>
                            <div className="space-y-2 p-2.5">
                              <p className="line-clamp-2 min-h-[28px] text-[11px] font-black leading-snug text-slate-800" title={candidate.foundTitle}>
                                {candidate.foundTitle || 'Foto encontrada'}
                              </p>
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  {candidateProductUrl ? (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenImageSource(candidateProductUrl)}
                                      className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-700"
                                    >
                                      <ExternalLink size={11} />
                                      Fuente
                                    </button>
                                  ) : null}
                                  {candidateImageUrl ? (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenImageSource(candidateImageUrl)}
                                      className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-slate-800"
                                    >
                                      <ImageIcon size={11} />
                                      Imagen
                                    </button>
                                  ) : null}
                                  {candidate.imageDataUrl ? (
                                    <button
                                      type="button"
                                      onClick={() => handleCenterImageCandidate(imageCandidatePickerRow.rowId, candidateIndex)}
                                      className={`inline-flex items-center gap-1 text-[10px] font-bold ${
                                        candidate.centered
                                          ? 'text-slate-600 hover:text-slate-900'
                                          : 'text-amber-600 hover:text-amber-700'
                                      }`}
                                    >
                                      {candidate.centered ? <RotateCcw size={11} /> : <Crosshair size={11} />}
                                      {candidate.centered ? 'Volver a original' : 'Centrar'}
                                    </button>
                                  ) : null}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleSelectImageCandidate(imageCandidatePickerRow.rowId, candidateIndex);
                                    setImageCandidatePickerRowId(null);
                                  }}
                                  className={`rounded-md px-3 py-1.5 text-[10px] font-black transition-colors ${
                                    isChosen
                                      ? 'bg-emerald-600 text-white'
                                      : 'bg-slate-900 text-white hover:bg-slate-800'
                                  }`}
                                >
                                  {isChosen ? 'Elegida' : 'Elegir'}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      <ImageModal
        isOpen={Boolean(productImagePreview)}
        image={productImagePreview}
        onClose={() => setProductImagePreview('')}
      />
    </div>
  );

  const modeButtonClass = (mode) =>
    `px-3 py-2 rounded-lg text-xs font-black border transition-colors flex items-center gap-2 ${
      activeToolMode === mode
        ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
    }`;

  return (
    <div className="bulk-editor-view flex flex-col h-full gap-3 overflow-hidden">
      <div className="shrink-0 bg-white border border-slate-200 rounded-xl shadow-sm p-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => setActiveToolMode('bulk')}
            className={modeButtonClass('bulk')}
          >
            <Edit3 size={14} />
            Editor masivo
          </button>
          <button
            type="button"
            onClick={() => setActiveToolMode('excel')}
            className={modeButtonClass('excel')}
          >
            <FileText size={14} />
            Importar Excel
          </button>
          <button
            type="button"
            onClick={openSupplierPriceMode}
            className={modeButtonClass('supplier')}
          >
            <Link2 size={14} />
            <span>Casa Alberto</span>
            {supplierPriceBadgeCount > 0 ? (
              <span className="ml-1 rounded-md bg-amber-400 px-1.5 py-0.5 text-[9px] font-black text-slate-950">
                {supplierPriceBadgeCount}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => setActiveToolMode('whatsapp-catalog')}
            className={modeButtonClass('whatsapp-catalog')}
          >
            <Tags size={14} />
            Catalogo WhatsApp
          </button>
          <button
            type="button"
            onClick={() => setActiveToolMode('image-cleanup')}
            className={modeButtonClass('image-cleanup')}
          >
            <Wand2 size={14} />
            Limpieza IA
          </button>
        </div>
        <p className="hidden lg:block text-[11px] font-bold text-slate-400 truncate">
          {activeToolMode === 'excel'
            ? 'Revisa cada campo antes de aplicar cambios al inventario.'
            : activeToolMode === 'supplier'
              ? 'Chequea costos de Casa Alberto y aproba cambios manualmente.'
              : activeToolMode === 'whatsapp-catalog'
                ? 'Selecciona productos y exporta CSV para catalogo de WhatsApp Business.'
              : activeToolMode === 'image-cleanup'
                ? 'Limpia fotos existentes con prompt, revision y restauracion.'
                : 'Herramientas clasicas de porcentaje, seleccion y PDF.'}
        </p>
      </div>

      {activeToolMode === 'excel' && (
        <div className="flex min-h-0 flex-1">
          <BulkExcelImportView
            inventory={sandboxInventory}
            categories={categories}
            cacheScope={currentUser?.id ? `user:${currentUser.id}` : ''}
            marginPercent={pricingPreferences.marginPercent}
            onMarginChange={updatePricingMargin}
            canCreateInventory={canCreateInventory}
            canEditInventory={canEditInventory}
            onApplyImport={onApplyExcelImport}
            onUndoImport={onUndoExcelImport}
            onCreateProducts={onCreateExcelProducts}
          />
        </div>
      )}
      {activeToolMode === 'bulk' && (
        <div className="flex min-h-0 flex-1">
          {renderEditorMasivo()}
        </div>
      )}
      {activeToolMode === 'supplier' && (
        <div className="flex min-h-0 flex-1">
          {renderCasaAlbertoPanel()}
        </div>
      )}
      {activeToolMode === 'whatsapp-catalog' && (
        <div className="flex min-h-0 flex-1">
          <Suspense fallback={<ToolLoadingFallback />}>
            <WhatsAppCatalogExportView
              inventory={sandboxInventory}
              categories={categories}
            />
          </Suspense>
        </div>
      )}
      {activeToolMode === 'image-cleanup' && (
        <div className="flex min-h-0 flex-1">
          <Suspense fallback={<ToolLoadingFallback />}>
            <ImageCleanupWorkspace
              inventory={sandboxInventory}
              selectedIds={selectedIds}
              onApplyProductImageImports={onApplyProductImageImports}
              onRestoreProductImage={onRestoreProductImage}
              onProductsApplied={(products = []) => {
                const updatedById = new Map(products.map((product) => [String(product.id), product]));
                setSandboxInventory((prev) => prev.map((product) => updatedById.get(String(product.id)) || product));
              }}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
}
