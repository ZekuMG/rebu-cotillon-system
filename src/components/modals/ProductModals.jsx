// src/components/modals/ProductModals.jsx
// ✅ v6: Duplicar producto desde modal de edición y Vencimiento

import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Upload,
  Image as ImageIcon,
  FileText,
  Trash2,
  AlertTriangle,
  ScanBarcode,
  Loader2,
  Scale,
  Package,
  PackageX,
  Copy,
  CalendarX,
  Crop,
  Maximize2,
  Minus,
  Move,
  Plus as PlusIcon,
} from 'lucide-react';
import AsyncActionButton from '../AsyncActionButton';

// ♻️ FIX: Importamos formatNumber
import { formatNumber } from '../../utils/helpers';
import usePendingAction from '../../hooks/usePendingAction';
import { hasPermission } from '../../utils/userPermissions';
import {
  buildAdjustedProductImageFile,
  calculateAdjustedImageLayout,
  readImageFileAsDataUrl,
} from '../../utils/productImageEditor';
import { normalizeProductPurchasePrice } from '../../utils/productLifecycle';
import {
  getStoredProductSalePrice,
  getVisibleProductSalePrice,
  normalizeFinalSalePrice,
} from '../../utils/finalSalePrice';
import {
  getStoredProductPurchaseCost,
  getVisibleProductPurchaseCost,
} from '../../utils/finalPurchaseCost';

// ==========================================
// COMPONENTE: Selector multi-categoría
// ==========================================

export const CategoryMultiSelect = ({ allCategories, selectedCategories, onChange }) => {
  const safeSelected = Array.isArray(selectedCategories) ? selectedCategories : [];
  const handleAdd = (e) => {
    const val = e.target.value;
    if (val && !safeSelected.includes(val)) onChange([...safeSelected, val]);
    e.target.value = '';
  };
  const handleRemove = (catToRemove) => onChange(safeSelected.filter((c) => c !== catToRemove));
  const availableToAdd = allCategories.filter((c) => !safeSelected.includes(c));

  return (
    <div className="w-full">
      <div className="min-h-[42px] px-3 py-2 border rounded-lg bg-white focus-within:ring-2 focus-within:ring-fuchsia-500 focus-within:border-fuchsia-500">
        <div className="flex flex-wrap gap-2 mb-1">
          {safeSelected.map((cat) => (
            <span key={cat} className="inline-flex items-center gap-1 bg-fuchsia-100 text-fuchsia-700 text-xs font-bold px-2 py-1 rounded-md">
              {cat}
              <button type="button" onClick={() => handleRemove(cat)} className="hover:text-fuchsia-900 focus:outline-none"><X size={12} /></button>
            </span>
          ))}
        </div>
        <select className="w-full text-xs bg-transparent outline-none text-slate-500 cursor-pointer" onChange={handleAdd} value="">
          <option value="" disabled>{safeSelected.length === 0 ? 'Seleccionar categorías...' : '+ Agregar otra categoría'}</option>
          {availableToAdd.map((c) => (<option key={c} value={c} className="text-slate-800">{c}</option>))}
        </select>
      </div>
      {safeSelected.length === 0 && <p className="text-[10px] text-red-400 mt-1 ml-1">* Debe seleccionar al menos una</p>}
    </div>
  );
};

// ==========================================
// COMPONENTE: Selector de Tipo de Producto
// ==========================================

const ProductTypeSelector = ({ value, onChange }) => {
  return (
    <div className="w-full">
      <label className="text-xs font-bold text-slate-500 uppercase block mb-2">Tipo de Producto</label>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange('quantity')}
          className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 font-bold text-sm transition-all ${
            value === 'quantity'
              ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm'
              : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300'
          }`}
        >
          <Package size={18} />
          Cantidad
        </button>
        <button
          type="button"
          onClick={() => onChange('weight')}
          className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 font-bold text-sm transition-all ${
            value === 'weight'
              ? 'border-amber-500 bg-amber-50 text-amber-700 shadow-sm'
              : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300'
          }`}
        >
          <Scale size={18} />
          Peso
        </button>
      </div>
    </div>
  );
};

// ==========================================
// COMPONENTE: Input de Stock para PESO
// ✅ FIX: Full-width, toggle g/kg estilizado
// ==========================================

const WeightStockInput = ({ stock, stockUnit, onStockChange, onUnitChange }) => {
  return (
    <div className="w-full">
      <label className="text-xs font-bold text-slate-500 uppercase block mb-2 flex items-center gap-1">
        <Scale size={12} /> Stock disponible
      </label>
      <div className="flex gap-2 items-center">
        <input
          required
          type="number"
          min="0"
          step="1"
          className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-amber-500 outline-none text-lg font-bold"
          value={stock}
          onChange={(e) => onStockChange(e.target.value)}
          placeholder="Ej: 1000"
        />
        {/* Toggle g/kg estilizado */}
        <div className="flex bg-slate-100 p-1 rounded-lg border h-[42px] items-center shrink-0">
          <button
            type="button"
            onClick={() => onUnitChange('g')}
            className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${
              stockUnit === 'g'
                ? 'bg-amber-500 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            g
          </button>
          <button
            type="button"
            onClick={() => onUnitChange('kg')}
            className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${
              stockUnit === 'kg'
                ? 'bg-amber-500 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            kg
          </button>
        </div>
      </div>
      <p className="text-[10px] text-amber-600 mt-1.5 ml-1 font-medium">
        {/* ♻️ FIX: formatNumber para la equivalencia de stock */}
        {stockUnit === 'kg'
          ? `= ${formatNumber((Number(stock) || 0) * 1000)} gramos en inventario`
          : `= ${formatNumber((Number(stock) || 0) / 1000, 2)} kg`
        }
      </p>
    </div>
  );
};

// ==========================================
const ImageAdjusterModal = ({
  isOpen,
  source,
  fitMode,
  zoom,
  offsetX,
  offsetY,
  onFitModeChange,
  onZoomChange,
  onOffsetXChange,
  onOffsetYChange,
  onReset,
  onCancel,
  onApply,
  isApplying,
}) => {
  const previewRef = useRef(null);
  const dragStateRef = useRef(null);
  const [previewSize, setPreviewSize] = useState(360);
  const [measuredImage, setMeasuredImage] = useState({ source: '', width: 0, height: 0 });

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !isApplying) onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isApplying, isOpen, onCancel]);

  useEffect(() => {
    if (!isOpen || !previewRef.current || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => {
      setPreviewSize(Math.max(1, entry.contentRect.width));
    });
    observer.observe(previewRef.current);
    return () => observer.disconnect();
  }, [isOpen]);

  if (!isOpen || !source) return null;

  // La medida vale solo si es de ESTA imagen. Antes se limpiaba con un efecto
  // aparte que corria despues del onLoad y borraba la medida recien tomada: con
  // una foto nueva (data: URL, carga instantanea) la vista previa quedaba vacia.
  const imageSize = measuredImage.source === source
    ? { width: measuredImage.width, height: measuredImage.height }
    : { width: 0, height: 0 };
  const measureImage = (node) => {
    if (!node || !node.naturalWidth || !node.naturalHeight) return;
    setMeasuredImage((previous) => (
      previous.source === source
        && previous.width === node.naturalWidth
        && previous.height === node.naturalHeight
        ? previous
        : { source, width: node.naturalWidth, height: node.naturalHeight }
    ));
  };

  const previewLayout = imageSize.width && imageSize.height
    ? calculateAdjustedImageLayout({
        imageWidth: imageSize.width,
        imageHeight: imageSize.height,
        outputSize: previewSize,
        zoom,
        offsetX,
        offsetY,
        fitMode,
      })
    : null;

  const clampOffset = (value, max) => Math.min(Math.max(value, -max), max);
  const handlePointerDown = (event) => {
    if (!previewLayout || isApplying) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragStateRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      offsetX: previewLayout.offsetX,
      offsetY: previewLayout.offsetY,
    };
  };
  const handlePointerMove = (event) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId || !previewLayout) return;
    const offsetScale = previewSize / 2;
    onOffsetXChange(clampOffset(
      dragState.offsetX + ((event.clientX - dragState.clientX) / offsetScale) * 100,
      previewLayout.maxOffsetX,
    ));
    onOffsetYChange(clampOffset(
      dragState.offsetY + ((event.clientY - dragState.clientY) / offsetScale) * 100,
      previewLayout.maxOffsetY,
    ));
  };
  const stopDragging = (event) => {
    if (dragStateRef.current?.pointerId === event.pointerId) dragStateRef.current = null;
  };
  const selectFitMode = (nextMode) => {
    onFitModeChange(nextMode);
    onReset();
  };
  const updateZoom = (nextZoom) => onZoomChange(Math.min(3.4, Math.max(1, nextZoom)));

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/75 p-4" role="dialog" aria-modal="true" aria-labelledby="image-adjuster-title">
      <div className="w-full max-w-4xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div>
            <h4 id="image-adjuster-title" className="font-bold text-slate-800">Ajustar imagen del producto</h4>
            <p className="text-xs text-slate-500">Elegí si querés conservar la foto completa o llenar la miniatura.</p>
          </div>
          <button type="button" onClick={onCancel} disabled={isApplying} aria-label="Cerrar ajuste de imagen" className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 disabled:cursor-wait disabled:opacity-50">
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_292px]">
          <div className="border-b border-slate-200 bg-slate-100/70 p-5 md:border-b-0 md:border-r">
            <div
              ref={previewRef}
              className={`relative mx-auto aspect-square w-full max-w-[360px] touch-none overflow-hidden rounded-xl border border-slate-300 bg-slate-50 select-none ${isApplying ? 'cursor-wait' : 'cursor-grab active:cursor-grabbing'}`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={stopDragging}
              onPointerCancel={stopDragging}
            >
              {previewLayout && (
                <img
                  src={source}
                  alt="Vista previa del ajuste"
                  draggable="false"
                  ref={measureImage}
                  onLoad={(event) => measureImage(event.currentTarget)}
                  className="pointer-events-none absolute max-w-none select-none"
                  style={{
                    left: previewLayout.x,
                    top: previewLayout.y,
                    width: previewLayout.drawWidth,
                    height: previewLayout.drawHeight,
                  }}
                />
              )}
              {!previewLayout && (
                <img
                  src={source}
                  alt="Preparando vista previa"
                  draggable="false"
                  ref={measureImage}
                  onLoad={(event) => measureImage(event.currentTarget)}
                  className="h-full w-full object-contain opacity-0"
                />
              )}
              <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/60" />
              <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1 rounded-md border border-white/60 bg-slate-950/70 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                <Move size={11} /> Arrastrá para mover
              </div>
            </div>
            <div className="mx-auto mt-3 flex max-w-[360px] items-start justify-between gap-3 text-[11px] text-slate-500">
              <p>El marco cuadrado replica la foto que se guardará en el catálogo.</p>
              <span className="shrink-0 font-semibold text-slate-600">{Math.round(zoom * 100)}%</span>
            </div>
          </div>

          <div className="space-y-5 p-5">
            <div>
              <label className="mb-2 block text-xs font-bold uppercase text-slate-500">Encuadre</label>
              <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => selectFitMode('contain')}
                  className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-md border px-2 text-xs font-bold transition ${fitMode === 'contain' ? 'border-fuchsia-200 bg-white text-fuchsia-700 shadow-sm' : 'border-transparent text-slate-500 hover:bg-white/70'}`}
                >
                  <Maximize2 size={16} />
                  Foto completa
                </button>
                <button
                  type="button"
                  onClick={() => selectFitMode('cover')}
                  className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-md border px-2 text-xs font-bold transition ${fitMode === 'cover' ? 'border-fuchsia-200 bg-white text-fuchsia-700 shadow-sm' : 'border-transparent text-slate-500 hover:bg-white/70'}`}
                >
                  <Crop size={16} />
                  Llenar marco
                </button>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                {fitMode === 'contain'
                  ? 'Conserva todos los bordes de la foto y completa el espacio libre con un fondo claro.'
                  : 'Ocupa todo el cuadrado; podés mover la foto para elegir qué parte queda visible.'}
              </p>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-bold text-slate-500 uppercase">Zoom</label>
                <span className="text-xs font-semibold text-slate-600">{zoom.toFixed(2)}x</span>
              </div>
              <div className="grid grid-cols-[34px_minmax(0,1fr)_34px] items-center gap-2">
                <button type="button" onClick={() => updateZoom(zoom - 0.1)} disabled={zoom <= 1 || isApplying} aria-label="Alejar imagen" className="flex h-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-35">
                  <Minus size={14} />
                </button>
                <input type="range" min="1" max="3.4" step="0.01" value={zoom} onChange={(e) => updateZoom(Number(e.target.value))} disabled={isApplying} aria-label="Zoom de imagen" className="w-full accent-fuchsia-600" />
                <button type="button" onClick={() => updateZoom(zoom + 0.1)} disabled={zoom >= 3.4 || isApplying} aria-label="Acercar imagen" className="flex h-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-35">
                  <PlusIcon size={14} />
                </button>
              </div>
            </div>

            <button type="button" onClick={onReset} disabled={isApplying} className="w-full rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-50">
              Centrar y restaurar zoom
            </button>

            <div className="space-y-2 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={onApply}
                disabled={isApplying}
                className={`w-full rounded-lg py-3 font-bold transition ${isApplying ? 'cursor-wait bg-slate-300 text-slate-500' : 'bg-fuchsia-600 text-white hover:bg-fuchsia-700'}`}
              >
                {isApplying ? 'Guardando imagen...' : 'Usar esta imagen'}
              </button>
              <button type="button" onClick={onCancel} disabled={isApplying} className="w-full rounded-lg py-2.5 font-semibold text-slate-500 transition hover:bg-slate-100 disabled:cursor-wait disabled:opacity-50">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// COMPONENTE: Sección de Imagen
// ==========================================

const ImageSection = ({ image, onFileUpload, onUrlChange, onDelete, isUploading }) => {
  const [editorSource, setEditorSource] = useState('');
  const [editorFileName, setEditorFileName] = useState('product-image');
  const [fitMode, setFitMode] = useState('contain');
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [isAdjusting, setIsAdjusting] = useState(false);

  const resetEditor = () => {
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
  };

  const closeEditor = () => {
    setEditorSource('');
    setEditorFileName('product-image');
    setFitMode('contain');
    resetEditor();
    setIsAdjusting(false);
  };

  const handleLocalFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const previewSource = await readImageFileAsDataUrl(file);
      setEditorSource(previewSource);
      setEditorFileName((file.name || 'product-image').replace(/\.[^.]+$/, '') || 'product-image');
      setFitMode('contain');
      resetEditor();
    } catch (error) {
      console.error('Error preparando imagen:', error);
      window.alert('No se pudo preparar la imagen seleccionada.');
    }
  };

  const handleApplyAdjustedImage = async () => {
    if (!editorSource) return;

    try {
      setIsAdjusting(true);
      const adjustedFile = await buildAdjustedProductImageFile(editorSource, {
        zoom,
        offsetX,
        offsetY,
        fitMode,
        fileName: `${editorFileName}.webp`,
      });
      await onFileUpload(adjustedFile);
      closeEditor();
    } catch (error) {
      console.error('Error ajustando imagen:', error);
      window.alert('No se pudo guardar la imagen ajustada.');
    } finally {
      setIsAdjusting(false);
    }
  };

  return (
    <div className="p-3 bg-slate-50 rounded-lg border border-dashed border-slate-300">
      <label className="text-xs font-bold text-slate-500 uppercase block mb-2 flex items-center gap-1"><ImageIcon size={12} /> Imagen del producto</label>
      {isUploading && (
        <div className="mb-3 flex flex-col items-center gap-2 py-4">
          <Loader2 size={28} className="text-fuchsia-500 animate-spin" />
          <p className="text-xs text-fuchsia-600 font-medium">Subiendo imagen a la nube...</p>
        </div>
      )}
      {!isUploading && image && (
        <div className="mb-3 flex flex-col items-center gap-2">
          <div className="relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
            <img src={image} alt="Vista completa del producto" className="h-full w-full object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setEditorSource(image);
                setEditorFileName('product-image');
                setFitMode('contain');
                resetEditor();
              }}
              className="flex h-8 items-center gap-1.5 rounded-md border border-fuchsia-200 bg-fuchsia-50 px-3 text-xs font-bold text-fuchsia-700 transition hover:bg-fuchsia-100"
            >
              <Crop size={13} /> Ajustar actual
            </button>
            <button type="button" onClick={onDelete} className="flex h-8 items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 text-xs font-bold text-red-600 transition hover:bg-red-50" title="Eliminar imagen">
              <Trash2 size={13} /> Quitar
            </button>
          </div>
          <p className="text-[10px] font-medium text-green-600">Imagen cargada y lista para el catálogo</p>
        </div>
      )}
      {!isUploading && (
        <>
          <div className="mb-3">
            <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-slate-300 border-dashed rounded-lg cursor-pointer bg-white hover:bg-slate-50 transition-colors">
              <div className="flex flex-col items-center justify-center pt-2 pb-2">
                <Upload size={20} className="text-slate-400 mb-1" />
                <p className="text-[10px] text-slate-500">{image ? 'Click para cambiar imagen' : 'Click para subir imagen'}</p>
                <p className="text-[9px] text-slate-400">Después vas a poder moverla y ajustar el zoom.</p>
              </div>
              <input type="file" className="hidden" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleLocalFileChange} />
            </label>
          </div>
          <div><input type="text" placeholder="O pega una URL de imagen aquí..." className="w-full px-3 py-2 border rounded-lg text-xs" value={image || ''} onChange={onUrlChange} /></div>
        </>
      )}
      <ImageAdjusterModal
        isOpen={Boolean(editorSource)}
        source={editorSource}
        fitMode={fitMode}
        zoom={zoom}
        offsetX={offsetX}
        offsetY={offsetY}
        onFitModeChange={setFitMode}
        onZoomChange={setZoom}
        onOffsetXChange={setOffsetX}
        onOffsetYChange={setOffsetY}
        onReset={resetEditor}
        onCancel={closeEditor}
        onApply={handleApplyAdjustedImage}
        isApplying={isAdjusting || isUploading}
      />
    </div>
  );
};

// ==========================================
// MODAL: AGREGAR PRODUCTO
// ==========================================

export const AddProductModal = ({ isOpen, onClose, newItem, setNewItem, categories, onImageUpload, onAdd, inventory, onDuplicateBarcode, isUploadingImage }) => {
  const [stockUnit, setStockUnit] = useState('g');
  const { isPending, runAction } = usePendingAction();
  if (!isOpen) return null;

  const productType = newItem.product_type || 'quantity';

  const handleTypeChange = (type) => {
    setNewItem({ ...newItem, product_type: type, stock: '', price: '', purchasePrice: '' });
    setStockUnit('g');
  };

  const handleBarcodeChange = (value) => {
    setNewItem({ ...newItem, barcode: value });
    if (value && value.length >= 3) {
      const existing = inventory?.find(p => p.barcode === value);
      if (existing && onDuplicateBarcode) onDuplicateBarcode(existing, value);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    let finalData = { ...newItem };

    if (productType === 'weight') {
      // Convertir stock kg → gramos si corresponde
      if (stockUnit === 'kg') {
        finalData.stock = Math.round(Number(newItem.stock) * 1000);
      }
      // ✅ Convertir precio/costo de $/kg a $/g para almacenamiento interno
      finalData.price = getStoredProductSalePrice(newItem.price, productType);
      finalData.purchasePrice = getStoredProductPurchaseCost(newItem.purchasePrice, productType);
    } else {
      finalData.price = getStoredProductSalePrice(newItem.price, productType);
      finalData.purchasePrice = getStoredProductPurchaseCost(newItem.purchasePrice, productType);
    }

    await runAction('add-product-submit', async () => {
      await onAdd(e, finalData);
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b flex justify-between items-center sticky top-0 bg-white z-10">
          <h3 className="font-bold text-slate-800">Nuevo Producto</h3>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Tipo */}
          <ProductTypeSelector value={productType} onChange={handleTypeChange} />

          {productType === 'weight' && (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
              <Scale size={14} className="text-amber-600" />
              <span className="text-xs text-amber-700 font-medium">Producto por peso — Precio y costo se definen <strong>por kilo</strong></span>
            </div>
          )}

          {/* Nombre */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Nombre</label>
            <input required type="text" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-fuchsia-500 outline-none" value={newItem.title} onChange={(e) => setNewItem({ ...newItem, title: e.target.value })} />
          </div>

          {/* Barcode */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1 flex items-center gap-1"><ScanBarcode size={12} /> Código de Barras (Opcional)</label>
            <input type="text" placeholder="Escanear o escribir código..." className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-fuchsia-500 outline-none font-mono" value={newItem.barcode || ''} onChange={(e) => handleBarcodeChange(e.target.value)} />
          </div>

          {/* Precio y Costo */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                {productType === 'weight' ? 'Costo ($/kg)' : 'Costo ($)'}
              </label>
              <input required type="number" step="1" min="0" className="w-full px-3 py-2 border rounded-lg" value={newItem.purchasePrice} onChange={(e) => setNewItem({ ...newItem, purchasePrice: e.target.value })} />
              {productType === 'weight' && newItem.purchasePrice && (
                <p className="text-[10px] text-slate-400 mt-1">= ${(Number(newItem.purchasePrice) / 1000).toFixed(2)}/g</p>
              )}
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                {productType === 'weight' ? 'Precio ($/kg)' : 'Precio ($)'}
              </label>
              <input required type="number" step="1" min="0" className="w-full px-3 py-2 border rounded-lg font-bold text-slate-800" value={newItem.price} onChange={(e) => setNewItem({ ...newItem, price: e.target.value })} onBlur={(e) => setNewItem({ ...newItem, price: String(normalizeFinalSalePrice(e.target.value)) })} />
              {productType === 'weight' && newItem.price && (
                <p className="text-[10px] text-slate-400 mt-1">= ${(Number(newItem.price) / 1000).toFixed(2)}/g</p>
              )}
            </div>
          </div>

          {/* ✅ FIX: Layout diferente para peso vs cantidad */}
          {productType === 'weight' ? (
            <>
              {/* Categoría: fila completa */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Categoría(s)</label>
                <CategoryMultiSelect allCategories={categories} selectedCategories={newItem.categories} onChange={(newCats) => setNewItem({ ...newItem, categories: newCats })} />
              </div>
              {/* Stock con toggle g/kg: fila completa, visible */}
              <WeightStockInput
                stock={newItem.stock}
                stockUnit={stockUnit}
                onStockChange={(val) => setNewItem({ ...newItem, stock: val })}
                onUnitChange={setStockUnit}
              />
            </>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Stock</label>
                <input required type="number" min="0" className="w-full px-3 py-2 border rounded-lg" value={newItem.stock} onChange={(e) => setNewItem({ ...newItem, stock: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Categoría(s)</label>
                <CategoryMultiSelect allCategories={categories} selectedCategories={newItem.categories} onChange={(newCats) => setNewItem({ ...newItem, categories: newCats })} />
              </div>
            </div>
          )}

          {/* ✨ VENCIMIENTO OPCIONAL */}
          <div>
            <label className="text-xs font-bold text-orange-600 uppercase block mb-1 flex items-center gap-1">
              <CalendarX size={12} /> Vencimiento (Opcional)
            </label>
            <input 
              type="date" 
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none text-sm text-slate-700 bg-orange-50 border-orange-200" 
              value={newItem.expiration_date || ''} 
              onChange={(e) => setNewItem({ ...newItem, expiration_date: e.target.value || null })} 
            />
          </div>

          {/* Imagen */}
          <ImageSection image={newItem.image} isUploading={isUploadingImage} onFileUpload={(file) => onImageUpload(file, false)} onUrlChange={(e) => setNewItem({ ...newItem, image: e.target.value, image_thumb: '', imageThumb: '' })} onDelete={() => setNewItem({ ...newItem, image: '', image_thumb: '', imageThumb: '' })} />

          <AsyncActionButton type="submit" pending={isPending('add-product-submit')} disabled={isUploadingImage || isPending('add-product-submit')} loadingLabel="Guardando..." className={`w-full py-3 rounded-lg font-bold transition-colors ${isUploadingImage ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-slate-900 text-white hover:bg-slate-800'} disabled:opacity-60 disabled:cursor-wait`}>Agregar</AsyncActionButton>
        </form>
      </div>
    </div>
  );
};

// ==========================================
// MODAL: EDITAR PRODUCTO
// v6: Agregado boton "Duplicar" segun permiso inventory.create
// ==========================================

export const EditProductModal = ({ product, onClose, setEditingProduct, categories, onImageUpload, editReason, setEditReason, onSave, inventory, onDuplicateBarcode, isUploadingImage, onDuplicate, onDeleteProduct, onRetireDeletedProduct, currentUser }) => {
  const [stockUnit, setStockUnit] = useState('g');
  const [deletedReason, setDeletedReason] = useState('');
  const { isPending, runAction } = usePendingAction();
  if (!product) return null;
  const productType = product.product_type || 'quantity';
  const canDuplicateProduct = hasPermission(currentUser, 'inventory.create');
  const canDeleteProduct = hasPermission(currentUser, 'inventory.delete');
  const isProductActive = product.is_active !== false && product.isActive !== false;

  // ✅ Precio guardado en /g → lo mostramos en /kg
  const displayPrice = getVisibleProductSalePrice(product.price, productType);
  const normalizedPurchasePrice = normalizeProductPurchasePrice(product.purchasePrice, productType);
  const displayCost = getVisibleProductPurchaseCost(normalizedPurchasePrice, productType);

  const handlePriceChange = (val) => {
    if (productType === 'weight') {
      setEditingProduct({ ...product, price: getStoredProductSalePrice(val, productType) });
    } else {
      setEditingProduct({ ...product, price: getStoredProductSalePrice(val, productType) });
    }
  };

  const handleCostChange = (val) => {
    if (productType === 'weight') {
      setEditingProduct({ ...product, purchasePrice: getStoredProductPurchaseCost(val, productType) });
    } else {
      setEditingProduct({ ...product, purchasePrice: getStoredProductPurchaseCost(val, productType) });
    }
  };

  const handleBarcodeChange = (value) => {
    setEditingProduct({ ...product, barcode: value });
    if (value && value.length >= 3) {
      const existing = inventory?.find(p => p.barcode === value && p.id !== product.id);
      if (existing && onDuplicateBarcode) onDuplicateBarcode(existing, value);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await runAction(`edit-product-submit:${product.id}`, async () => {
      const normalizedProduct = {
        ...product,
        purchasePrice: normalizeProductPurchasePrice(product.purchasePrice, productType),
      };
      if (productType === 'weight' && stockUnit === 'kg') {
        await onSave(e, { ...normalizedProduct, stock: Math.round(Number(product.stock) * 1000) });
      } else {
        await onSave(e, normalizedProduct);
      }
    });
  };

  const handleDuplicate = () => {
    if (onDuplicate) onDuplicate(product);
  };

  const toggleProductActive = () => {
    const nextActive = !isProductActive;
    setEditingProduct({ ...product, is_active: nextActive, isActive: nextActive });
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b flex justify-between items-center sticky top-0 bg-white z-10">
          <h3 className="font-bold text-slate-800">Editar Producto</h3>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Tipo (solo lectura) */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-slate-50">
            {productType === 'weight' ? <Scale size={16} className="text-amber-600" /> : <Package size={16} className="text-blue-600" />}
            <span className="text-xs font-bold text-slate-600">
              Tipo: {productType === 'weight' ? 'Producto por PESO — Precio por kilo' : 'Producto por CANTIDAD — Precio por unidad'}
            </span>
          </div>

          <div className={`rounded-lg border px-3 py-2.5 ${isProductActive ? 'border-emerald-200 bg-emerald-50' : 'border-slate-300 bg-slate-100'}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className={`text-xs font-black uppercase tracking-wide ${isProductActive ? 'text-emerald-700' : 'text-slate-700'}`}>
                  {isProductActive ? 'Producto habilitado' : 'Producto deshabilitado'}
                </p>
                <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                  {isProductActive ? 'Visible en inventario normal y punto de venta.' : 'Oculto del catalogo normal. Puede verse desde Inhabilitados.'}
                </p>
              </div>
              <button
                type="button"
                onClick={toggleProductActive}
                className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-black transition ${
                  isProductActive
                    ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    : 'border-emerald-200 bg-emerald-600 text-white hover:bg-emerald-700'
                }`}
              >
                {isProductActive ? 'Deshabilitar' : 'Habilitar'}
              </button>
            </div>
          </div>

          {/* Nombre */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Nombre</label>
            <input required type="text" className="w-full px-3 py-2 border rounded-lg" value={product.title} onChange={(e) => setEditingProduct({ ...product, title: e.target.value })} />
          </div>

          {/* Barcode */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1 flex items-center gap-1"><ScanBarcode size={12} /> Código de Barras (Opcional)</label>
            <input type="text" placeholder="Escanear o escribir código..." className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-fuchsia-500 outline-none font-mono" value={product.barcode || ''} onChange={(e) => handleBarcodeChange(e.target.value)} />
          </div>

          {/* Precio y Costo */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                {productType === 'weight' ? 'Costo ($/kg)' : 'Costo ($)'}
              </label>
              <input required type="number" step="1" min="0" className="w-full px-3 py-2 border rounded-lg" value={displayCost} onChange={(e) => handleCostChange(e.target.value)} />
              {productType === 'weight' && displayCost > 0 && (
                <p className="text-[10px] text-slate-400 mt-1">= ${(Number(displayCost) / 1000).toFixed(2)}/g</p>
              )}
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                {productType === 'weight' ? 'Precio ($/kg)' : 'Precio ($)'}
              </label>
              <input required type="number" step="1" min="0" className="w-full px-3 py-2 border rounded-lg font-bold" value={displayPrice} onChange={(e) => handlePriceChange(e.target.value)} />
              {productType === 'weight' && displayPrice > 0 && (
                <p className="text-[10px] text-slate-400 mt-1">= ${(Number(displayPrice) / 1000).toFixed(2)}/g</p>
              )}
            </div>
          </div>

          {/* ✅ FIX: Layout diferente para peso vs cantidad */}
          {productType === 'weight' ? (
            <>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Categoría(s)</label>
                <CategoryMultiSelect allCategories={categories} selectedCategories={product.categories || []} onChange={(newCats) => setEditingProduct({ ...product, categories: newCats })} />
              </div>
              <WeightStockInput
                stock={product.stock}
                stockUnit={stockUnit}
                onStockChange={(val) => setEditingProduct({ ...product, stock: val })}
                onUnitChange={setStockUnit}
              />
            </>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Stock</label>
                <input required type="number" min="0" className="w-full px-3 py-2 border rounded-lg" value={product.stock} onChange={(e) => setEditingProduct({ ...product, stock: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Categoría(s)</label>
                <CategoryMultiSelect allCategories={categories} selectedCategories={product.categories || []} onChange={(newCats) => setEditingProduct({ ...product, categories: newCats })} />
              </div>
            </div>
          )}

          {/* ✨ VENCIMIENTO OPCIONAL */}
          <div>
            <label className="text-xs font-bold text-orange-600 uppercase block mb-1 flex items-center gap-1">
              <CalendarX size={12} /> Vencimiento (Opcional)
            </label>
            <input 
              type="date" 
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 outline-none text-sm text-slate-700 bg-orange-50 border-orange-200" 
              value={product.expiration_date || ''} 
              onChange={(e) => setEditingProduct({ ...product, expiration_date: e.target.value || null })} 
            />
          </div>

          {/* Imagen */}
          <ImageSection image={product.image} isUploading={isUploadingImage} onFileUpload={(file) => onImageUpload(file, true)} onUrlChange={(e) => setEditingProduct({ ...product, image: e.target.value, image_thumb: '', imageThumb: '' })} onDelete={() => setEditingProduct({ ...product, image: '', image_thumb: '', imageThumb: '' })} />

          {/* Motivo */}
          <div>
            <label className="text-xs font-bold text-amber-600 uppercase block mb-1 flex items-center gap-1"><FileText size={12} /> Motivo del cambio (Opcional)</label>
            <textarea className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm bg-amber-50 focus:ring-2 focus:ring-amber-500 outline-none" rows="2" placeholder="¿Por qué realizas este cambio?" value={editReason} onChange={(e) => setEditReason(e.target.value)}></textarea>
          </div>

          {!isProductActive && onRetireDeletedProduct && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <div className="mb-2 flex items-start gap-2">
                <PackageX size={16} className="mt-0.5 shrink-0 text-red-600" />
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-red-700">Eliminar ficha operativa</p>
                  <p className="text-[11px] font-semibold text-red-600/80">Deja solo una referencia como Item Eliminado con motivo. Usalo para productos que no deben volver al catalogo.</p>
                </div>
              </div>
              <input
                type="text"
                value={deletedReason}
                onChange={(event) => setDeletedReason(event.target.value)}
                placeholder="Razon: discontinuado, error de carga, duplicado..."
                className="mb-2 w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100"
              />
              <AsyncActionButton
                onAction={() => runAction(`retire-product:${product.id}`, async () => {
                  await onRetireDeletedProduct(product, deletedReason);
                })}
                pending={isPending(`retire-product:${product.id}`)}
                disabled={!deletedReason.trim() || isPending(`retire-product:${product.id}`)}
                loadingLabel="Eliminando..."
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-2.5 text-xs font-black text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-200"
              >
                <Trash2 size={14} />
                Compactar como Item Eliminado
              </AsyncActionButton>
            </div>
          )}

          {/* Botones: Duplicar segun permiso + Guardar */}
          <div className="flex flex-wrap gap-3">
            {canDeleteProduct && onDeleteProduct && (
              <button
                type="button"
                onClick={() => onDeleteProduct(product)}
                className="flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-3 text-sm font-bold text-red-600 transition-colors hover:bg-red-50"
                title="Eliminar este producto del catalogo normal"
              >
                <Trash2 size={16} />
                Eliminar
              </button>
            )}
            {canDuplicateProduct && onDuplicate && (
              <button
                type="button"
                onClick={handleDuplicate}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-bold border-2 border-violet-300 text-violet-600 bg-violet-50 hover:bg-violet-100 hover:border-violet-400 transition-colors"
                title="Duplicar este producto"
              >
                <Copy size={16} />
                Duplicar
              </button>
            )}
            <AsyncActionButton type="submit" pending={isPending(`edit-product-submit:${product.id}`)} disabled={isUploadingImage || isPending(`edit-product-submit:${product.id}`)} loadingLabel="Guardando..." className={`flex-1 py-3 rounded-lg font-bold transition-colors ${isUploadingImage ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'} disabled:opacity-60 disabled:cursor-wait`}>Guardar Cambios</AsyncActionButton>
          </div>
        </form>
      </div>
    </div>
  );
};

// ==========================================
// MODAL: ELIMINAR PRODUCTO (sin cambios)
// ==========================================

export const DeleteProductModal = ({ product, onClose, reason, setReason, onConfirm }) => {
  const { isPending, runAction } = usePendingAction();
  if (!product) return null;
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-4 bg-red-50 border-b border-red-100 flex justify-between items-center">
          <h3 className="font-bold text-red-800 flex items-center gap-2"><Trash2 size={18} /> Eliminar Producto</h3>
          <button onClick={onClose}><X size={18} className="text-red-400 hover:text-red-600" /></button>
        </div>
        <div className="p-6">
          <div className="flex gap-4 items-start mb-4">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center shrink-0"><AlertTriangle size={24} className="text-red-600" /></div>
            <div><p className="text-slate-700 font-bold text-lg leading-tight mb-1">¿Estás seguro?</p><p className="text-slate-500 text-sm">Vas a eliminar <span className="font-bold text-slate-800">"{product.title}"</span> del inventario.</p></div>
          </div>
          <div className="mb-4">
             <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Motivo (Opcional)</label>
             <input type="text" placeholder="Ej: Producto discontinuado" className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-red-500" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-lg font-bold border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors">Cancelar</button>
            <AsyncActionButton onAction={() => runAction(`delete-product-modal:${product.id}`, onConfirm)} pending={isPending(`delete-product-modal:${product.id}`)} loadingLabel="Eliminando..." className="flex-1 py-2.5 rounded-lg font-bold bg-red-600 text-white hover:bg-red-700 shadow-md transition-colors disabled:opacity-60 disabled:cursor-wait">Sí, Eliminar</AsyncActionButton>
          </div>
        </div>
      </div>
    </div>
  );
};
