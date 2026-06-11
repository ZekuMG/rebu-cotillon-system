import React, { useRef, useState, useEffect } from 'react';
import { 
  Search, Save, CheckSquare, Square, 
  Scale, Package, ArrowRight, Loader2, RotateCcw,
  FileText, X, User, Edit3, ChevronDown, Plus, Trash2, PackageX,
  Camera, Image as ImageIcon, LogIn, CheckCircle, AlertTriangle, ExternalLink,
  Pause, Play, StopCircle, Crosshair
} from 'lucide-react';
import AsyncActionButton from '../components/AsyncActionButton';
import { FancyPrice } from '../components/FancyPrice';
import BulkExcelImportView from '../components/BulkExcelImportView';
import { ImageModal } from '../components/modals/SaleModals';
import Swal from 'sweetalert2';
import usePendingAction from '../hooks/usePendingAction';
import { getProductImageUrl, hasProductImage } from '../utils/productImages';

const BULK_EDITOR_TOOL_MODE_STORAGE_KEY = 'rebu_bulk_editor_tool_mode_v1';
const IMAGE_IMPORT_LIMIT_OPTIONS = [
  { value: '1', label: '1 foto' },
  { value: '5', label: '5 fotos' },
  { value: '10', label: '10 fotos' },
  { value: 'all', label: 'Todas' },
];

const normalizeToolMode = (mode) => (mode === 'bulk' ? 'bulk' : 'excel');

const getInitialToolMode = () => {
  try {
    if (typeof window === 'undefined') return 'excel';
    return normalizeToolMode(window.localStorage.getItem(BULK_EDITOR_TOOL_MODE_STORAGE_KEY));
  } catch {
    return 'excel';
  }
};

export default function BulkEditorView({ 
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
  onApplyProductImageImports,
  onImageImportTaskChange,
  imageImportOpenRequest = 0,
}) {
  const buildEditStateFromInventory = (inventory) => {
    const nextEdits = {};
    (inventory || []).forEach((p) => {
      const isWeight = p.product_type === 'weight';
      nextEdits[p.id] = {
        price: isWeight ? Math.round((Number(p.price) || 0) * 1000) : (Number(p.price) || 0),
        purchasePrice: isWeight ? Math.round((Number(p.purchasePrice) || 0) * 1000) : (Number(p.purchasePrice) || 0),
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
  const [isSaving, setIsSaving] = useState(false);
  const { isPending, runAction } = usePendingAction();

  // --- Estado de Vista Previa de Exportación ---
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
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
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
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
    const percentage = Number(bulkAction.percentage);
    if (isNaN(percentage) || percentage === 0 || selectedIds.length === 0) return;

    const multiplier = 1 + (percentage / 100);
    const newEdits = { ...edits };

    selectedIds.forEach(id => {
      const currentVal = Number(newEdits[id][bulkAction.field]) || 0;
      newEdits[id][bulkAction.field] = Math.round(currentVal * multiplier);
    });

    setEdits(newEdits);
  };

  const handleResetRow = (p) => {
    const isWeight = p.product_type === 'weight';
    setEdits(prev => ({
      ...prev,
      [p.id]: {
        price: isWeight ? Math.round((Number(p.price) || 0) * 1000) : (Number(p.price) || 0),
        purchasePrice: isWeight ? Math.round((Number(p.purchasePrice) || 0) * 1000) : (Number(p.purchasePrice) || 0),
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
        
        const isWeight = product.product_type === 'weight';
        const finalPrice = isWeight ? Number(editData.price) / 1000 : Number(editData.price);
        const finalCost = isWeight ? Number(editData.purchasePrice) / 1000 : Number(editData.purchasePrice);
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
          const isWeight = p.product_type === 'weight';
          return {
            ...p,
            price: isWeight ? Number(editData.price) / 1000 : Number(editData.price),
            purchasePrice: isWeight ? Number(editData.purchasePrice) / 1000 : Number(editData.purchasePrice),
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
           stock: Number(edits[p.id]?.stock) || getOriginalVal(p, 'stock'),
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
           stock: Number(edits[product.id]?.stock) || getOriginalVal(product, 'stock'),
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

  const handleConfirmExport = () => {
    if (onExportProducts) {
      const cleanItems = exportItems.filter(item => item.title && item.title.trim() !== '');
      onExportProducts(exportConfig, cleanItems);
    }
    setExportItems([]);
    setSelectedIds([]);
    setIsExportModalOpen(false);
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

  const handleOpenSupplierLogin = async () => {
    if (!window.electronAPI?.supplierImageOpenLogin) {
      Swal.fire('Electron requerido', 'Esta accion necesita ejecutarse desde la app de escritorio.', 'info');
      return;
    }

    const result = await window.electronAPI.supplierImageOpenLogin();
    if (!result?.success) {
      Swal.fire('No se pudo abrir el proveedor', result?.error || 'Reinicia Electron y volve a intentar.', 'error');
    }
  };

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
      row.rowId === rowId && row.status === 'found'
        ? { ...row, approved: !row.approved }
        : row
    )));
  };

  const handleSelectImageCandidate = (rowId, candidateIndex) => {
    setImageImportRows((prev) => prev.map((row) => {
      if (row.rowId !== rowId || row.status !== 'found') return row;
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
    const rowsToApply = imageImportRows.filter((row) => row.status === 'found' && row.approved && row.imageDataUrl);
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
          return { ...row, status: 'error', approved: false, message: failedById.get(String(row.productId)) };
        }
        return row;
      }));
    } finally {
      setIsApplyingImages(false);
    }
  };

  const handleOpenImageSource = async (url) => {
    if (!url) return;
    if (window.electronAPI?.openExternalUrl) {
      await window.electronAPI.openExternalUrl(url);
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
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
    return isWeight ? Math.round((Number(p[field]) || 0) * 1000) : (Number(p[field]) || 0);
  };

  const hasChanges = (p) => {
    if (!edits[p.id]) return false;
    return Number(edits[p.id].price) !== getOriginalVal(p, 'price') || 
           Number(edits[p.id].purchasePrice) !== getOriginalVal(p, 'purchasePrice') || 
           Number(edits[p.id].stock) !== getOriginalVal(p, 'stock');
  };

  const hasPendingBulkChanges = sandboxInventory.some((p) => hasChanges(p));

  const calculateDiffPercent = (oldVal, newVal) => {
    if (oldVal === 0) return newVal > 0 ? '+100%' : null;
    const diff = ((newVal - oldVal) / oldVal) * 100;
    if (diff === 0) return null;
    return diff > 0 ? `+${diff.toFixed(1)}%` : `${diff.toFixed(1)}%`;
  };

  const imageImportStats = imageImportRows.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    if (row.status === 'found') {
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
        pending: 'Pendiente',
      }[row.status],
    ].some((value) => String(value || '').toLowerCase().includes(normalizedImageImportSearchTerm));
  });
  const nextImageImportBatchLabel = hasImageImportSearchStarted ? 'Otros 10' : 'Probar 10';
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
      errors: imageImportStats.error + imageImportStats.login_required,
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
    if (status === 'error') return { label: 'Error', className: 'border-red-200 bg-red-50 text-red-700' };
    return { label: 'Pendiente', className: 'border-slate-200 bg-white text-slate-500' };
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
          </select>
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
          <button 
            onClick={applyBulkPercentage}
            disabled={selectedIds.length === 0 || !bulkAction.percentage}
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
                            value={editVals.price ?? ''} 
                            onChange={(e) => handleEditChange(p.id, 'price', e.target.value)}
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
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-slate-100 rounded-xl shadow-2xl w-full max-w-6xl h-full max-h-[95vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-300">
            
            {/* Modal Header */}
            <div className="bg-indigo-700 px-4 py-2.5 flex justify-between items-center text-white shrink-0">
              <div>
                <h3 className="font-bold text-base flex items-center gap-2">
                  <FileText size={18} /> Preview de PDF
                </h3>
              </div>
              <button onClick={() => setIsExportModalOpen(false)} className="text-indigo-300 hover:text-white transition-colors bg-indigo-800/50 p-1.5 rounded-lg">
                <X size={18} />
              </button>
            </div>
            
            {/* Modal Body */}
            <div className="flex flex-1 overflow-hidden">
              
              {/* COLUMNA IZQUIERDA: Configuración (Miniaturizada) */}
              <div className="w-1/3 bg-white border-r border-slate-200 p-4 flex flex-col overflow-y-auto custom-scrollbar">
                
                <h4 className="font-black text-slate-800 uppercase tracking-wider text-[11px] mb-3 flex items-center gap-1.5">
                  <User size={14} className="text-indigo-600"/> Tipo de Documento
                </h4>
                
                <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl mb-4">
                  <div>
                    <p className="font-bold text-xs text-slate-800">Presupuesto a Cliente</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={exportConfig.isForClient} onChange={(e) => setExportConfig({...exportConfig, isForClient: e.target.checked})} />
                    <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>

                {exportConfig.isForClient ? (
                  <div className="space-y-3 animate-in fade-in duration-300">
                    <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-3 space-y-3">
                      
                      <div>
                        <label className="block text-[9px] font-bold text-indigo-800 mb-1 uppercase tracking-wider">
                          Título del Documento
                        </label>
                        <input 
                          type="text" 
                          maxLength={30} 
                          placeholder="Ej: PRESUPUESTO" 
                          className="w-full px-2.5 py-1.5 border border-indigo-200 rounded-lg text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white font-bold uppercase placeholder:normal-case placeholder:font-normal" 
                          value={exportConfig.documentTitle} 
                          onChange={(e) => setExportConfig({...exportConfig, documentTitle: e.target.value.toUpperCase()})} 
                        />
                      </div>

                      <div>
                        <label className="block text-[9px] font-bold text-indigo-800 mb-1 uppercase tracking-wider">
                          Nombre del Cliente
                        </label>
                        <input 
                          type="text" 
                          maxLength={40} 
                          placeholder="Ej: Sofía" 
                          className="w-full px-2.5 py-1.5 border border-indigo-200 rounded-lg text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white" 
                          value={exportConfig.clientName} 
                          onChange={(e) => setExportConfig({...exportConfig, clientName: e.target.value})} 
                        />
                      </div>
                    </div>
                    
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3">
                      <div>
                        <label className="block text-[9px] font-bold text-slate-600 mb-1 uppercase tracking-wider">Detalle del Evento</label>
                        <input 
                          type="text" 
                          maxLength={40} 
                          placeholder="Ej: 15 Años" 
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white" 
                          value={exportConfig.clientEvent} 
                          onChange={(e) => setExportConfig({...exportConfig, clientEvent: e.target.value})} 
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold text-slate-600 mb-1 uppercase tracking-wider">Teléfono</label>
                        <input 
                          type="text" 
                          maxLength={10} 
                          placeholder="Ej: 1112345678" 
                          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white" 
                          value={exportConfig.clientPhone} 
                          onChange={(e) => setExportConfig({...exportConfig, clientPhone: e.target.value})} 
                        />
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-200">
                      <label className="block text-[9px] font-bold text-slate-600 mb-2 uppercase tracking-wider">Mostrar en PDF:</label>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="flex items-center gap-1.5 p-1.5 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 bg-white shadow-sm transition-colors">
                          <input type="checkbox" className="accent-indigo-600 w-3.5 h-3.5" checked={exportConfig.clientColumns.showQty} onChange={(e) => setExportConfig({...exportConfig, clientColumns: {...exportConfig.clientColumns, showQty: e.target.checked}})} />
                          <span className="text-[10px] font-bold text-slate-700">Cantidades</span>
                        </label>
                        <label className="flex items-center gap-1.5 p-1.5 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 bg-white shadow-sm transition-colors">
                          <input type="checkbox" className="accent-indigo-600 w-3.5 h-3.5" checked={exportConfig.clientColumns.showUnitPrice} onChange={(e) => setExportConfig({...exportConfig, clientColumns: {...exportConfig.clientColumns, showUnitPrice: e.target.checked}})} />
                          <span className="text-[10px] font-bold text-slate-700">Precio Unitario</span>
                        </label>
                        <label className="flex items-center gap-1.5 p-1.5 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 bg-white shadow-sm transition-colors">
                          <input type="checkbox" className="accent-indigo-600 w-3.5 h-3.5" checked={exportConfig.clientColumns.showSubtotal} onChange={(e) => setExportConfig({...exportConfig, clientColumns: {...exportConfig.clientColumns, showSubtotal: e.target.checked}})} />
                          <span className="text-[10px] font-bold text-slate-700">Subtotales</span>
                        </label>
                        <label className="flex items-center gap-1.5 p-1.5 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 bg-white shadow-sm transition-colors">
                          <input type="checkbox" className="accent-indigo-600 w-3.5 h-3.5" checked={exportConfig.clientColumns.showTotal} onChange={(e) => setExportConfig({...exportConfig, clientColumns: {...exportConfig.clientColumns, showTotal: e.target.checked}})} />
                          <span className="text-[10px] font-bold text-slate-700">Total Final</span>
                        </label>
                      </div>
                    </div>

                  </div>
                ) : (
                  <div className="space-y-3 animate-in fade-in duration-300">
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">
                      <p className="text-amber-800 text-[10px] font-medium">Estás exportando un <strong>Reporte Interno</strong>.</p>
                    </div>
                    <label className="block text-[9px] font-bold text-slate-600 mb-2 uppercase tracking-wider">Columnas Visibles:</label>
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors bg-white shadow-sm">
                        <input type="checkbox" className="accent-indigo-600 w-3.5 h-3.5" checked={exportConfig.columns.cost} onChange={(e) => setExportConfig({...exportConfig, columns: {...exportConfig.columns, cost: e.target.checked}})} />
                        <span className="text-xs font-bold text-slate-700">Costo Original</span>
                      </label>
                      <label className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors bg-white shadow-sm">
                        <input type="checkbox" className="accent-indigo-600 w-3.5 h-3.5" checked={exportConfig.columns.price} onChange={(e) => setExportConfig({...exportConfig, columns: {...exportConfig.columns, price: e.target.checked}})} />
                        <span className="text-xs font-bold text-slate-700">Precio Original</span>
                      </label>
                      <label className="flex items-center gap-2 p-2 border border-indigo-200 rounded-lg cursor-pointer hover:bg-indigo-50 transition-colors bg-indigo-50/30 shadow-sm">
                        <input type="checkbox" className="accent-indigo-600 w-3.5 h-3.5" checked={exportConfig.columns.newPrice} onChange={(e) => setExportConfig({...exportConfig, columns: {...exportConfig.columns, newPrice: e.target.checked}})} />
                        <span className="text-xs font-bold text-indigo-900">Precio Editado (Rec.)</span>
                      </label>
                      <label className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors bg-white shadow-sm">
                        <input type="checkbox" className="accent-indigo-600 w-3.5 h-3.5" checked={exportConfig.columns.stock} onChange={(e) => setExportConfig({...exportConfig, columns: {...exportConfig.columns, stock: e.target.checked}})} />
                        <span className="text-xs font-bold text-slate-700">Stock Actual</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* COLUMNA DERECHA: Vista Previa */}
              <div className="w-2/3 bg-slate-100 flex flex-col p-4 overflow-hidden">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-black text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <Edit3 size={14} className="text-indigo-600"/> 
                    {exportConfig.isForClient ? 'Ajustar Cantidades del Presupuesto' : 'Resumen de Productos a Exportar'}
                  </h4>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={handleClearPreview}
                      className="bg-white hover:bg-red-50 text-slate-500 hover:text-red-600 font-bold text-[9px] px-2 py-1 rounded flex items-center gap-1 transition-colors uppercase tracking-wider border border-slate-200 hover:border-red-200 shadow-sm"
                      title="Limpiar todo el presupuesto"
                    >
                      <Trash2 size={10} strokeWidth={3} /> Limpiar
                    </button>
                    
                    {exportConfig.isForClient && (
                      <button 
                        onClick={handleAddTemporaryItem}
                        className="bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-bold text-[9px] px-2 py-1 rounded flex items-center gap-1 transition-colors uppercase tracking-wider border border-indigo-200 shadow-sm"
                      >
                        <Plus size={10} strokeWidth={3} /> Producto Extra
                      </button>
                    )}
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl flex-1 overflow-hidden flex flex-col shadow-sm">
                  {/* SCROLL CONTAINER (Tabla Ajustada) */}
                  <div className="overflow-y-auto custom-scrollbar flex-1 relative" onScroll={handlePreviewScroll}>
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-800 text-white sticky top-0 z-[70]">
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
                      <tbody className="divide-y divide-slate-100 pb-20">
                        {exportItems.slice(0, previewLimit).map((item, idx) => {
                          const isWeight = item.product_type === 'weight';
                          const subtotal = isWeight ? item.newPrice * (item.qty / 1000) : item.newPrice * item.qty;
                          
                          const rowColorClass = idx % 2 !== 0 ? 'bg-slate-50/80' : 'bg-transparent';

                          return (
                            <tr key={item.id} className={`hover:bg-slate-100 transition-colors ${rowColorClass}`}>
                              <td className="py-1.5 px-3 relative">
                                <div className="flex flex-col gap-0.5">
                                  {/* SI ES TEMPORAL Y NO ESTÁ BLOQUEADO */}
                                  {item.isTemporary && !item.isTitleLocked ? (
                                    <div className="relative">
                                      <input 
                                        type="text"
                                        className="w-full px-1.5 py-1 text-[11px] font-bold border border-slate-300 rounded focus:border-indigo-500 outline-none shadow-sm"
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
                                        <ul className="absolute top-full left-0 w-full min-w-[250px] bg-white border border-indigo-200 shadow-2xl rounded-lg mt-1 z-[80] max-h-[160px] overflow-y-auto custom-scrollbar divide-y divide-slate-100">
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
                                                  className="p-1.5 hover:bg-indigo-50 cursor-pointer flex justify-between items-center transition-colors"
                                                  onMouseDown={(e) => {
                                                    e.preventDefault();
                                                    handleSelectProductForTemp(item.id, p);
                                                  }}
                                                >
                                                  <div className="truncate flex-1 pr-2">
                                                    <span className="font-bold text-[11px] text-slate-800 block truncate">{p.title}</span>
                                                    <span className="text-[8px] text-slate-500 uppercase">{p.category}</span>
                                                  </div>
                                                  <span className="text-[11px] font-bold text-indigo-600 shrink-0">
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
                                              className="p-1.5 text-[10px] font-bold text-indigo-600 hover:bg-indigo-50 cursor-pointer text-center transition-colors flex items-center justify-center gap-1"
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
                                      <p className="font-bold text-slate-800 text-[11px]">{item.title}</p>
                                      {isWeight && <span className="bg-amber-100 text-amber-700 text-[8px] px-1 rounded font-bold uppercase tracking-widest border border-amber-200 whitespace-nowrap">Por Peso</span>}
                                    </div>
                                  )}
                                  
                                  {item.isTemporary && !item.isTitleLocked ? (
                                    <input 
                                      type="text"
                                      className="w-full max-w-[120px] px-1 py-0.5 text-[8px] font-bold border border-slate-200 rounded outline-none text-slate-500 uppercase"
                                      value={item.category}
                                      onChange={(e) => updateExportItemField(item.id, 'category', e.target.value)}
                                      placeholder="Categoría..."
                                    />
                                  ) : (
                                    <p className="text-[8px] text-slate-400 font-bold uppercase">{item.category}</p>
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
                                          className="no-spinners w-full pl-4 pr-1.5 py-1 text-[11px] font-bold border border-slate-300 rounded hover:border-slate-400 focus:border-indigo-500 outline-none text-right transition-colors"
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
                                          className="no-spinners w-12 p-1 text-center text-[11px] font-bold border border-slate-300 hover:border-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors"
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
                                      className="no-spinners w-full pl-4 pr-1.5 py-1 text-[11px] font-bold border border-slate-300 rounded hover:border-slate-400 focus:border-indigo-500 outline-none text-right transition-colors"
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
                            <td colSpan="5" className="p-2 text-center text-slate-400 text-[9px] font-bold bg-slate-50 flex items-center justify-center gap-1.5">
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
                    <div className="bg-slate-50 border-t border-slate-200 p-3 flex justify-between items-center shrink-0 z-20">
                      <span className="font-black text-slate-500 uppercase tracking-widest text-[10px]">Total del Presupuesto:</span>
                      <span className="text-xl font-black text-emerald-600">
                        <FancyPrice amount={exportItems.reduce((acc, item) => acc + (item.product_type === 'weight' ? item.newPrice * (item.qty / 1000) : item.newPrice * item.qty), 0)} />
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-white border-t border-slate-200 p-3 flex justify-between items-center shrink-0 z-20">
              <span className="text-[11px] font-bold text-slate-400 bg-slate-100 px-2.5 py-1.5 rounded-md border border-slate-200">
                {exportItems.length} ítems listos
              </span>
              <div className="flex gap-2.5">
                <button 
                  onClick={() => setIsExportModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cerrar Vista Previa
                </button>
                <button 
                  onClick={handleConfirmExport}
                  disabled={exportItems.length === 0}
                  className="px-5 py-2 rounded-lg text-xs font-black bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center gap-1.5 shadow-lg shadow-indigo-200 hover:shadow-indigo-300 transform hover:-translate-y-0.5"
                >
                  <FileText size={16} /> GUARDAR COMO PDF
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
                  1. Abrir sesion · 2. Probar 10 · 3. Aplicar aprobadas
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
                <section className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                  <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Sesion proveedor</p>
                  <p className="mt-1 text-[11px] font-bold leading-snug text-slate-600">
                    Inicia sesion manualmente. Rebu usa esa sesion para buscar, sin guardar clave.
                  </p>
                  <button
                    type="button"
                    onClick={handleOpenSupplierLogin}
                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    <LogIn size={14} />
                    Abrir login
                  </button>
                </section>
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
                    ['Problemas', imageImportStats.error + imageImportStats.login_required],
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
                    Si aparece login, abri la sesion y volve a buscar. No se intenta saltar bloqueos del proveedor.
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
                                  disabled={row.status !== 'found' || isApplyingImages}
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
            onClick={() => setActiveToolMode('excel')}
            className={modeButtonClass('excel')}
          >
            <FileText size={14} />
            Importar Excel
          </button>
          <button
            type="button"
            onClick={() => setActiveToolMode('bulk')}
            className={modeButtonClass('bulk')}
          >
            <Edit3 size={14} />
            Editor masivo
          </button>
        </div>
        <p className="hidden lg:block text-[11px] font-bold text-slate-400 truncate">
          {activeToolMode === 'excel'
            ? 'Revisa cada campo antes de aplicar cambios al inventario.'
            : 'Herramientas clasicas de porcentaje, seleccion y PDF.'}
        </p>
      </div>

      <div className={`${activeToolMode === 'excel' ? 'flex' : 'hidden'} min-h-0 flex-1`}>
        <BulkExcelImportView inventory={sandboxInventory} onApplyImport={onApplyExcelImport} />
      </div>
      <div className={`${activeToolMode === 'bulk' ? 'flex' : 'hidden'} min-h-0 flex-1`}>
        {renderEditorMasivo()}
      </div>
    </div>
  );
}
