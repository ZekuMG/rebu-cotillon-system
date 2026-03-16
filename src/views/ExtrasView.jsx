import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { OfferWizardModal } from '../components/OfferWizardModal';
import { formatNumber, isTestRecord } from '../utils/helpers';
import {
  buildLegacyOfferPayload,
  defaultCanonicalOfferForm,
  getCanonicalOfferAccent,
  getCanonicalOfferFilterOptions,
  getCanonicalOfferModeLabel,
  getCanonicalOfferOptions,
  getCanonicalOfferSubtypeLabel,
  getCanonicalOfferTypeLabel,
  getOfferWizardGuide,
  normalizeLegacyOffer,
  validateOfferWizardForm,
} from '../utils/offerHelpers';

const RECENT_CATEGORY_DURATION_MS = 60 * 60 * 1000;
const OFFER_WIZARD_STEPS = [
  'Beneficio',
  'Alcance',
  'Condicion',
  'Seleccion',
  'Resumen',
];
const OFFER_FREE_MODES = ['2x1', '3x2', '4x3'];

function useIncrementalList(items, options = {}) {
  const { initialCount = 16, step = 16, threshold = 120 } = options;
  const totalItems = items.length;
  const [visibleCount, setVisibleCount] = useState(() => Math.min(initialCount, totalItems));

  useEffect(() => {
    setVisibleCount(Math.min(initialCount, totalItems));
  }, [initialCount, totalItems, items]);

  const handleScroll = useCallback(
    (event) => {
      const element = event.currentTarget;
      const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;

      if (remaining > threshold) return;

      setVisibleCount((current) => {
        if (current >= totalItems) return current;
        return Math.min(current + step, totalItems);
      });
    },
    [step, threshold, totalItems]
  );

  return {
    visibleItems: items.slice(0, visibleCount),
    visibleCount,
    totalItems,
    hasMore: visibleCount < totalItems,
    handleScroll,
  };
}

function ProductPreviewGrid({ items = [], fallbackIcon: FallbackIcon = Package, accent = 'slate' }) {
  const previewItems = items.filter((item) => item?.image).slice(0, 4);
  const count = previewItems.length;
  const fallbackAccentClass =
    {
      orange: 'bg-orange-50 text-orange-400',
      green: 'bg-green-50 text-green-300',
      amber: 'bg-amber-50 text-amber-300',
      fuchsia: 'bg-fuchsia-50 text-fuchsia-300',
      violet: 'bg-violet-50 text-violet-300',
      emerald: 'bg-emerald-50 text-emerald-300',
      blue: 'bg-blue-50 text-blue-300',
      slate: 'bg-slate-50 text-slate-300',
    }[accent] || 'bg-slate-50 text-slate-300';

  const wrapperClass =
    count <= 1
      ? 'grid-cols-1'
      : count === 2
      ? 'grid-cols-2'
      : count === 3
      ? 'grid-cols-3'
      : 'grid-cols-2';

  return (
    <div className="mb-3 overflow-hidden rounded-[16px] border border-slate-200 bg-slate-100">
      {count > 0 ? (
        <div className={`grid h-24 gap-px bg-slate-200 ${wrapperClass} ${count === 4 ? 'grid-rows-2' : 'grid-rows-1'}`}>
          {previewItems.map((item) => (
            <div key={item.id || item.title} className="overflow-hidden bg-white">
              <img
                src={item.image}
                alt={item.title || 'Preview'}
                className="h-full w-full object-cover"
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className={`flex h-24 items-center justify-center ${fallbackAccentClass}`}>
          <FallbackIcon size={22} />
        </div>
      )}
    </div>
  );
}

function CategoryEditorModal({
  isOpen,
  selectedCategory,
  editedName,
  setEditedName,
  showAddProducts,
  setShowAddProducts,
  productSearch,
  setProductSearch,
  productsByCategory,
  filteredAvailableProducts,
  pendingChanges,
  hasUnsavedCategoryChanges,
  handleAddProductToCategory,
  handleRemoveProductFromCategory,
  handleCloseCategoryModal,
  handleSaveCategoryEdit,
}) {
  const assignedProducts = selectedCategory ? productsByCategory[selectedCategory] || [] : [];
  const assignedProductsFeed = useIncrementalList(assignedProducts, {
    initialCount: 30,
    step: 30,
    resetKey: `${selectedCategory || ''}-${assignedProducts.length}`,
  });
  const categoryEditorAvailableFeed = useIncrementalList(filteredAvailableProducts, {
    initialCount: 30,
    step: 30,
    resetKey: `${selectedCategory || ''}-${productSearch}-${filteredAvailableProducts.length}`,
  });

  if (!isOpen || !selectedCategory) return null;

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[70] p-4 backdrop-blur-sm"
      onClick={handleCloseCategoryModal}
    >
      <div
        className={`bg-white rounded-2xl shadow-2xl w-full h-[92vh] max-h-[92vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 ${
          showAddProducts ? 'max-w-6xl' : 'max-w-4xl'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 bg-orange-50 border-b border-orange-200 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-orange-100 rounded-xl text-orange-600 shadow-sm shadow-orange-200/60">
              <Tag size={22} />
            </div>
            <div>
              <h3 className="font-black text-slate-800 text-base">
                {showAddProducts ? 'Editando Categoria y Catalogo' : 'Editando Categoria'}
              </h3>
              <p className="text-[10px] font-black text-orange-700/80 uppercase tracking-[0.2em]">
                {selectedCategory}
              </p>
            </div>
          </div>
          <button
            onClick={handleCloseCategoryModal}
            className="text-orange-400 hover:text-orange-700 bg-orange-100/50 hover:bg-orange-100 p-2 rounded-lg transition-colors"
          >
            <X size={18} strokeWidth={3} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden p-4 bg-slate-50">
          <div className="grid h-full min-h-0 gap-4 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-rows-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            <div className="min-h-0 rounded-2xl border border-orange-200 bg-white shadow-sm flex flex-col overflow-hidden">
              <div className="p-4 border-b border-orange-100 bg-gradient-to-r from-orange-50 to-white shrink-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider block mb-2">
                      Nombre de la Categoria
                    </label>
                    <input
                      type="text"
                      className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:ring-4 focus:ring-orange-500/25 focus:border-orange-500 outline-none text-base font-bold text-slate-800 transition-all"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <button
                    onClick={() => setShowAddProducts(!showAddProducts)}
                    className={`shrink-0 text-[10px] font-black px-3 py-2 rounded-xl flex items-center gap-1.5 transition-all uppercase tracking-wider ${
                      showAddProducts
                        ? 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        : 'bg-orange-500 text-white hover:bg-orange-600 shadow-lg shadow-orange-200'
                    }`}
                  >
                    {showAddProducts ? (
                      <><X size={12} strokeWidth={3} /> Cerrar catalogo</>
                    ) : (
                      <><Plus size={12} strokeWidth={3} /> Agregar productos</>
                    )}
                  </button>
                </div>
              </div>

              <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3 shrink-0">
                <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Package size={14} className="text-orange-500" />
                  Inventario asignado
                </label>
                <span className="bg-orange-100 text-orange-700 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                  {assignedProducts.length} productos
                </span>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4" onScroll={assignedProductsFeed.handleScroll}>
                <div className="space-y-2">
                  {assignedProducts.length > 0 ? (
                    assignedProductsFeed.visibleItems.map((product) => {
                      const isPendingAdd = pendingChanges.some(
                        (change) =>
                          change.productId === product.id &&
                          change.categoryName === selectedCategory &&
                          change.action === 'add'
                      );

                      return (
                        <div
                          key={product.id}
                          className={`flex items-center justify-between gap-3 rounded-xl border p-3 transition-colors ${
                            isPendingAdd
                              ? 'border-emerald-200 bg-emerald-50'
                              : 'border-slate-200 bg-white hover:border-orange-300 hover:bg-orange-50/40'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {product.image ? (
                              <img
                                src={product.image}
                                alt={product.title}
                                className="w-11 h-11 rounded-lg object-cover border border-slate-200 shadow-sm"
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className="w-11 h-11 bg-slate-100 border border-slate-200 rounded-lg flex items-center justify-center shrink-0">
                                <Package size={16} className="text-slate-400" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-black text-slate-800 truncate">{product.title}</p>
                              <p className="text-[11px] font-medium text-slate-500">
                                Stock fisico: <span className="font-bold">{product.stock}</span>
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 pl-2">
                            {isPendingAdd && (
                              <span className="text-[9px] font-black uppercase tracking-wider text-emerald-600 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded">
                                Anadido
                              </span>
                            )}
                            <button
                              onClick={() => handleRemoveProductFromCategory(product)}
                              className="text-slate-400 hover:text-red-600 bg-white hover:bg-red-50 border border-slate-200 hover:border-red-200 p-1.5 rounded-lg transition-all shadow-sm"
                              title="Quitar de la categoria"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="h-full min-h-[220px] rounded-2xl border border-dashed border-orange-200 bg-orange-50/50 flex items-center justify-center text-center p-8">
                      <div>
                        <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-white border border-orange-200 flex items-center justify-center">
                          <Package size={24} className="text-orange-400" />
                        </div>
                        <p className="text-sm font-black text-slate-700">Categoria vacia</p>
                        <p className="text-xs font-medium text-slate-500 mt-1">
                          Usa el catalogo lateral para sumar productos.
                        </p>
                      </div>
                    </div>
                  )}
                  {assignedProductsFeed.hasMore && (
                    <p className="pt-2 text-center text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                      Mostrando {assignedProductsFeed.visibleCount} de {assignedProductsFeed.totalItems}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="min-h-0 rounded-2xl border border-orange-200 bg-white shadow-sm flex flex-col overflow-hidden">
              <div className="p-4 border-b border-orange-100 bg-gradient-to-r from-white to-orange-50 shrink-0">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
                      Catalogo de productos
                    </p>
                    <p className="text-xs font-medium text-slate-500 mt-1">
                      {showAddProducts
                        ? 'Selecciona productos para agregarlos a esta categoria.'
                        : 'Abre el catalogo para ver y sumar productos desde esta misma ventana.'}
                    </p>
                  </div>
                  <span className="shrink-0 bg-orange-100 text-orange-700 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                    {filteredAvailableProducts.length} disponibles
                  </span>
                </div>
              </div>

              {showAddProducts ? (
                <>
                  <div className="p-4 border-b border-slate-100 shrink-0">
                    <div className="relative">
                      <Search
                        size={16}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-400"
                      />
                      <input
                        type="text"
                        placeholder="Buscar producto en el catalogo..."
                        className="w-full pl-10 pr-3 py-2.5 text-sm font-medium border border-orange-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4" onScroll={categoryEditorAvailableFeed.handleScroll}>
                    <div className="space-y-2">
                      {filteredAvailableProducts.length > 0 ? (
                        categoryEditorAvailableFeed.visibleItems.map((product) => (
                          <div
                            key={product.id}
                            className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-all hover:border-orange-300 hover:bg-orange-50/40"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {product.image ? (
                                <img
                                  src={product.image}
                                  alt={product.title}
                                  className="w-12 h-12 rounded-lg object-cover border border-slate-200"
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                  }}
                                />
                              ) : (
                                <div className="w-12 h-12 rounded-lg border border-slate-200 bg-slate-100 flex items-center justify-center shrink-0">
                                  <Package size={16} className="text-slate-400" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="text-sm font-black text-slate-800 truncate">{product.title}</p>
                                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">
                                  <span className="bg-slate-100 px-2 py-0.5 rounded-full">
                                    {Array.isArray(product.categories)
                                      ? product.categories[0]
                                      : product.category || 'Sin cat.'}
                                  </span>
                                  <span>Stock {product.stock}</span>
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={() => handleAddProductToCategory(product)}
                              className="shrink-0 text-white bg-orange-500 hover:bg-orange-600 px-3 py-2 rounded-xl transition-colors font-black text-[11px] uppercase tracking-wider shadow-lg shadow-orange-200"
                              title="Agregar a esta categoria"
                            >
                              Agregar
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="h-full min-h-[260px] rounded-2xl border border-dashed border-orange-200 bg-orange-50/50 flex items-center justify-center text-center p-8">
                          <div>
                            <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-white border border-orange-200 flex items-center justify-center">
                              <Search size={24} className="text-orange-400" />
                            </div>
                            <p className="text-sm font-black text-slate-700">
                              {productSearch ? 'No se encontraron productos' : 'No quedan productos disponibles'}
                            </p>
                            <p className="text-xs font-medium text-slate-500 mt-1">
                              {productSearch
                                ? 'Prueba con otro termino de busqueda.'
                                : 'Todos los productos ya forman parte de esta categoria.'}
                            </p>
                          </div>
                        </div>
                      )}
                      {categoryEditorAvailableFeed.hasMore && (
                        <p className="pt-2 text-center text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                          Mostrando {categoryEditorAvailableFeed.visibleCount} de {categoryEditorAvailableFeed.totalItems}
                        </p>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 min-h-0 p-4">
                  <div className="h-full rounded-2xl border border-dashed border-orange-200 bg-orange-50/40 flex items-center justify-center text-center p-8">
                    <div className="max-w-sm">
                      <div className="mx-auto mb-4 w-16 h-16 rounded-2xl bg-white border border-orange-200 flex items-center justify-center shadow-sm">
                        <Plus size={26} className="text-orange-500" />
                      </div>
                      <p className="text-base font-black text-slate-800">Abre el catalogo lateral</p>
                      <p className="text-sm font-medium text-slate-500 mt-2">
                        Vas a poder buscar, previsualizar y agregar productos sin salir del editor de categoria.
                      </p>
                      <button
                        onClick={() => setShowAddProducts(true)}
                        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-orange-200 transition-colors hover:bg-orange-600"
                      >
                        <Plus size={14} strokeWidth={3} />
                        Mostrar catalogo
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {hasUnsavedCategoryChanges && (
            <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg text-xs font-bold text-orange-700 flex items-center gap-2 animate-pulse">
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
            disabled={!hasUnsavedCategoryChanges}
            className="px-6 py-2.5 rounded-xl font-black text-xs bg-orange-500 text-white hover:bg-orange-600 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-orange-200 transition-all"
          >
            <Save size={16} strokeWidth={3} />
            Guardar Cambios
          </button>
        </div>
      </div>
    </div>
  );
}

function CategoryCreateModal({
  isOpen,
  newCategory,
  setNewCategory,
  createCategoryProductSearch,
  setCreateCategoryProductSearch,
  selectedProductsForNewCategory,
  filteredProductsForNewCategory,
  handleAddProductToNewCategory,
  handleRemoveProductFromNewCategory,
  handleCloseCreateCategoryModal,
  handleSubmitCategory,
}) {
  const selectedProductsFeed = useIncrementalList(selectedProductsForNewCategory, {
    initialCount: 30,
    step: 30,
    resetKey: `${selectedProductsForNewCategory.length}-${newCategory}`,
  });
  const createCategoryAvailableFeed = useIncrementalList(filteredProductsForNewCategory, {
    initialCount: 30,
    step: 30,
    resetKey: `${createCategoryProductSearch}-${filteredProductsForNewCategory.length}-${newCategory}`,
  });

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
      onClick={handleCloseCreateCategoryModal}
    >
      <div
        className="flex h-[92vh] max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 bg-orange-50 border-b border-orange-200 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-orange-100 rounded-xl text-orange-600 shadow-sm shadow-orange-200/60">
              <Tag size={22} />
            </div>
            <div>
              <h3 className="font-black text-slate-800 text-base">Nueva Categoria</h3>
              <p className="text-[10px] font-black text-orange-700/80 uppercase tracking-[0.2em]">
                Organiza los productos de esta categoria
              </p>
            </div>
          </div>
          <button
            onClick={handleCloseCreateCategoryModal}
            className="text-orange-400 hover:text-orange-700 bg-orange-100/50 hover:bg-orange-100 p-2 rounded-lg transition-colors"
          >
            <X size={18} strokeWidth={3} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden p-4 bg-slate-50">
          <div className="grid h-full min-h-0 gap-4 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-rows-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            <form
              onSubmit={handleSubmitCategory}
              className="min-h-0 rounded-2xl border border-orange-200 bg-white shadow-sm flex flex-col overflow-hidden"
            >
              <div className="p-4 border-b border-orange-100 bg-gradient-to-r from-orange-50 to-white shrink-0">
                <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider block mb-2">
                  Nombre de la Categoria
                </label>
                <input
                  type="text"
                  placeholder="Ej: Cumpleanos, Globos, Decoracion..."
                  className="w-full rounded-xl border-2 border-slate-200 px-4 py-2.5 text-base font-bold text-slate-800 outline-none transition-all focus:border-orange-400 focus:ring-4 focus:ring-orange-500/20"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3 shrink-0">
                <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Package size={14} className="text-orange-500" />
                  Productos seleccionados
                </label>
                <span className="bg-orange-100 text-orange-700 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                  {selectedProductsForNewCategory.length} productos
                </span>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4" onScroll={selectedProductsFeed.handleScroll}>
                <div className="space-y-2">
                  {selectedProductsForNewCategory.length > 0 ? (
                    selectedProductsFeed.visibleItems.map((product) => (
                      <div
                        key={product.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-colors hover:border-orange-300 hover:bg-orange-50/40"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {product.image ? (
                            <img
                              src={product.image}
                              alt={product.title}
                              className="w-11 h-11 rounded-lg object-cover border border-slate-200 shadow-sm"
                              onError={(e) => {
                                e.target.style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className="w-11 h-11 bg-slate-100 border border-slate-200 rounded-lg flex items-center justify-center shrink-0">
                              <Package size={16} className="text-slate-400" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-black text-slate-800 truncate">{product.title}</p>
                            <p className="text-[11px] font-medium text-slate-500">
                              Stock fisico: <span className="font-bold">{product.stock}</span>
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveProductFromNewCategory(product.id)}
                          className="text-slate-400 hover:text-red-600 bg-white hover:bg-red-50 border border-slate-200 hover:border-red-200 p-1.5 rounded-lg transition-all shadow-sm"
                          title="Quitar de la nueva categoria"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="h-full min-h-[220px] rounded-2xl border border-dashed border-orange-200 bg-orange-50/40 flex items-center justify-center text-center p-8">
                      <div className="max-w-sm">
                        <div className="mx-auto mb-4 w-16 h-16 rounded-2xl bg-white border border-orange-200 flex items-center justify-center shadow-sm">
                          <Tag size={26} className="text-orange-500" />
                        </div>
                        <p className="text-base font-black text-slate-800">Prepara la nueva categoria</p>
                        <p className="text-sm font-medium text-slate-500 mt-2">
                          Defini el nombre y agrega productos desde el catalogo lateral antes de crearla.
                        </p>
                      </div>
                    </div>
                  )}
                  {selectedProductsFeed.hasMore && (
                    <p className="pt-2 text-center text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                      Mostrando {selectedProductsFeed.visibleCount} de {selectedProductsFeed.totalItems}
                    </p>
                  )}
                </div>
              </div>

              <div className="p-5 border-t border-slate-200 bg-slate-50 flex gap-3 justify-end shrink-0">
                <button
                  type="button"
                  onClick={handleCloseCreateCategoryModal}
                  className="rounded-xl px-5 py-2.5 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!newCategory.trim()}
                  className="flex items-center gap-2 rounded-xl bg-orange-500 px-6 py-2.5 text-xs font-black text-white shadow-lg shadow-orange-200 transition-all hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
                >
                  <Plus size={16} strokeWidth={3} />
                  Crear Categoria
                </button>
              </div>
            </form>

            <div className="min-h-0 rounded-2xl border border-orange-200 bg-white shadow-sm flex flex-col overflow-hidden">
              <div className="p-4 border-b border-orange-100 bg-gradient-to-r from-white to-orange-50 shrink-0">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
                      Catalogo de productos
                    </p>
                    <p className="text-xs font-medium text-slate-500 mt-1">
                      Selecciona productos para incluirlos desde la creacion.
                    </p>
                  </div>
                  <span className="shrink-0 bg-orange-100 text-orange-700 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                    {filteredProductsForNewCategory.length} disponibles
                  </span>
                </div>
              </div>

              <div className="p-4 border-b border-slate-100 shrink-0">
                <div className="relative">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-400"
                  />
                  <input
                    type="text"
                    placeholder="Buscar producto en el catalogo..."
                    className="w-full pl-10 pr-3 py-2.5 text-sm font-medium border border-orange-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                    value={createCategoryProductSearch}
                    onChange={(e) => setCreateCategoryProductSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4" onScroll={createCategoryAvailableFeed.handleScroll}>
                <div className="space-y-2">
                  {filteredProductsForNewCategory.length > 0 ? (
                    createCategoryAvailableFeed.visibleItems.map((product) => (
                      <div
                        key={product.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-all hover:border-orange-300 hover:bg-orange-50/40"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {product.image ? (
                            <img
                              src={product.image}
                              alt={product.title}
                              className="w-12 h-12 rounded-lg object-cover border border-slate-200"
                              onError={(e) => {
                                e.target.style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-lg border border-slate-200 bg-slate-100 flex items-center justify-center shrink-0">
                              <Package size={16} className="text-slate-400" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-black text-slate-800 truncate">{product.title}</p>
                            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">
                              <span className="bg-slate-100 px-2 py-0.5 rounded-full">
                                {Array.isArray(product.categories)
                                  ? product.categories[0]
                                  : product.category || 'Sin cat.'}
                              </span>
                              <span>Stock {product.stock}</span>
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAddProductToNewCategory(product)}
                          className="shrink-0 text-white bg-orange-500 hover:bg-orange-600 px-3 py-2 rounded-xl transition-colors font-black text-[11px] uppercase tracking-wider shadow-lg shadow-orange-200"
                          title="Agregar a la nueva categoria"
                        >
                          Agregar
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="h-full min-h-[260px] rounded-2xl border border-dashed border-orange-200 bg-orange-50/50 flex items-center justify-center text-center p-8">
                      <div>
                        <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-white border border-orange-200 flex items-center justify-center">
                          <Search size={24} className="text-orange-400" />
                        </div>
                        <p className="text-sm font-black text-slate-700">
                          {createCategoryProductSearch ? 'No se encontraron productos' : 'No quedan productos disponibles'}
                        </p>
                        <p className="text-xs font-medium text-slate-500 mt-1">
                          {createCategoryProductSearch
                            ? 'Prueba con otro termino de busqueda.'
                            : 'Todos los productos ya fueron seleccionados para esta categoria.'}
                        </p>
                      </div>
                    </div>
                  )}
                  {createCategoryAvailableFeed.hasMore && (
                    <p className="pt-2 text-center text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                      Mostrando {createCategoryAvailableFeed.visibleCount} de {createCategoryAvailableFeed.totalItems}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ExtrasView({
  categories = [],
  inventory = [],
  offers = [],
  rewards = [],
  onAddCategory,
  currentUser,
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
  const isReadOnly = currentUser?.role !== 'admin';
  // --- SISTEMA DE PESTAÑAS PRINCIPAL ---
  const [activeTab, setActiveTab] = useState('categories'); // 'categories' | 'offers' | 'rewards'

  // ==========================================
  // 1. ESTADOS DE CATEGORÍAS
  // ==========================================
  const [newCategory, setNewCategory] = useState('');
  const [isCreateCategoryModalOpen, setIsCreateCategoryModalOpen] = useState(false);
  const [createCategoryProductSearch, setCreateCategoryProductSearch] = useState('');
  const [newCategoryProductIds, setNewCategoryProductIds] = useState([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [isCategoryEditorOpen, setIsCategoryEditorOpen] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [showAddProducts, setShowAddProducts] = useState(false);
  const [pendingChanges, setPendingChanges] = useState([]);
  const [batchReport, setBatchReport] = useState(null);
  const [recentCategoryMeta, setRecentCategoryMeta] = useState(null);
  const [categorySearch, setCategorySearch] = useState('');
  const recentCategoryName = recentCategoryMeta?.name ?? null;

  const markCategoryAsRecent = useCallback((categoryName) => {
    setRecentCategoryMeta({
      name: categoryName,
      expiresAt: Date.now() + RECENT_CATEGORY_DURATION_MS,
    });
  }, []);

  useEffect(() => {
    if (!recentCategoryMeta?.expiresAt) return undefined;

    const remainingMs = recentCategoryMeta.expiresAt - Date.now();
    if (remainingMs <= 0) {
      setRecentCategoryMeta(null);
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setRecentCategoryMeta((current) =>
        current?.expiresAt === recentCategoryMeta.expiresAt ? null : current
      );
    }, remainingMs);

    return () => window.clearTimeout(timeoutId);
  }, [recentCategoryMeta]);

  // ==========================================
  // 2. ESTADOS DE OFERTAS
  // ==========================================
  const [offersSearch, setOffersSearch] = useState('');
  const [offersTypeFilter, setOffersTypeFilter] = useState('all');
  const [isOfferTypeMenuOpen, setIsOfferTypeMenuOpen] = useState(false);
  const [isOfferModalOpen, setIsOfferModalOpen] = useState(false);
  const [editingOfferId, setEditingOfferId] = useState(null);
  const [selectedOfferId, setSelectedOfferId] = useState(null);
  const [offerWizardStep, setOfferWizardStep] = useState(1);
  const [offerForm, setOfferForm] = useState({ ...defaultCanonicalOfferForm, productsIncluded: [] });
  const [offerProductSearch, setOfferProductSearch] = useState('');

  // ==========================================
  // 3. ESTADOS DE PREMIOS
  // ==========================================
  const [rewardsSearch, setRewardsSearch] = useState('');
  const [rewardsTypeFilter, setRewardsTypeFilter] = useState('all');
  const [isRewardTypeMenuOpen, setIsRewardTypeMenuOpen] = useState(false);
  const [isRewardModalOpen, setIsRewardModalOpen] = useState(false);
  const [selectedRewardId, setSelectedRewardId] = useState(null);
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
    setIsCategoryEditorOpen(false);
    setEditedName('');
    setShowAddProducts(false);
    setProductSearch('');
    setPendingChanges([]);
  };

  const handleCloseCreateCategoryModal = () => {
    setIsCreateCategoryModalOpen(false);
    setNewCategory('');
    setCreateCategoryProductSearch('');
    setNewCategoryProductIds([]);
  };

  const productHasCategory = useCallback((product, catName) => {
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
  }, [pendingChanges]);

  const productsByCategory = useMemo(() => {
    const result = {};
    categories.forEach((cat) => {
      result[cat] = inventory ? inventory.filter((p) => productHasCategory(p, cat)) : [];
    });
    return result;
  }, [categories, inventory, productHasCategory]);

  const handleSubmitCategory = (e) => {
    e.preventDefault();
    if (newCategory.trim()) {
      const categoryName = newCategory.trim();
      onAddCategory(categoryName);
      if (newCategoryProductIds.length > 0 && onBatchUpdateProductCategory) {
        onBatchUpdateProductCategory(
          newCategoryProductIds.map((productId) => ({
            productId,
            categoryName,
            action: 'add',
          }))
        );
      }
      markCategoryAsRecent(categoryName);
      setSelectedCategory(categoryName);
      setActiveTab('categories');
      handleCloseCreateCategoryModal();
    }
  };

  const selectedProductsForNewCategory = useMemo(() => {
    if (!inventory?.length || newCategoryProductIds.length === 0) return [];
    return newCategoryProductIds
      .map((productId) => inventory.find((product) => product.id === productId))
      .filter(Boolean);
  }, [inventory, newCategoryProductIds]);

  const filteredProductsForNewCategory = useMemo(() => {
    if (!inventory?.length) return [];

    const selectedIds = new Set(newCategoryProductIds);
    const availableProductsForNewCategory = inventory.filter((product) => !selectedIds.has(product.id));
    const normalizedSearch = createCategoryProductSearch.trim().toLowerCase();

    if (!normalizedSearch) return availableProductsForNewCategory;

    return availableProductsForNewCategory.filter((product) =>
      product.title?.toLowerCase().includes(normalizedSearch)
    );
  }, [createCategoryProductSearch, inventory, newCategoryProductIds]);

  const handleAddProductToNewCategory = useCallback((product) => {
    setNewCategoryProductIds((current) =>
      current.includes(product.id) ? current : [...current, product.id]
    );
  }, []);

  const handleRemoveProductFromNewCategory = useCallback((productId) => {
    setNewCategoryProductIds((current) => current.filter((id) => id !== productId));
  }, []);

  const handleSelectCategory = (cat) => {
    setSelectedCategory(cat);
  };

  const openCategoryEditor = (cat, options = {}) => {
    if (isReadOnly) return;
    if (!cat) return;
    setSelectedCategory(cat);
    setEditedName(cat);
    setShowAddProducts(Boolean(options.openAddProducts));
    setProductSearch('');
    setPendingChanges([]);
    setIsCategoryEditorOpen(true);
  };
  const handleSaveCategoryEdit = () => {
    if (isReadOnly) return;
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
        markCategoryAsRecent(editedName.trim());
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
    if (isReadOnly) return;
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
    if (isReadOnly) return;
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

  const orderedCategories = useMemo(() => {
    if (!recentCategoryName) return categories;

    const recentMatch = categories.find((cat) => cat === recentCategoryName);
    if (!recentMatch) return categories;

    return [recentMatch, ...categories.filter((cat) => cat !== recentCategoryName)];
  }, [categories, recentCategoryName]);

  const filteredOrderedCategories = useMemo(() => {
    const normalizedSearch = categorySearch.trim().toLowerCase();
    if (!normalizedSearch) return orderedCategories;

    return orderedCategories.filter((cat) => {
      const productCount = productsByCategory[cat]?.length || 0;
      return (
        cat.toLowerCase().includes(normalizedSearch) ||
        String(productCount).includes(normalizedSearch)
      );
    });
  }, [categorySearch, orderedCategories, productsByCategory]);

  const activeCategoryName = useMemo(() => {
    if (selectedCategory && orderedCategories.includes(selectedCategory)) return selectedCategory;
    return orderedCategories[0] || null;
  }, [orderedCategories, selectedCategory]);

  const availableProducts = useMemo(() => {
    if (!activeCategoryName || !inventory) return [];
    return inventory.filter((p) => !productHasCategory(p, activeCategoryName));
  }, [activeCategoryName, inventory, productHasCategory]);

  const filteredAvailableProducts = useMemo(() => {
    if (!productSearch.trim()) return availableProducts;
    return availableProducts.filter((p) =>
      p.title.toLowerCase().includes(productSearch.toLowerCase())
    );
  }, [availableProducts, productSearch]);
  const activeCategoryProducts = useMemo(
    () => (activeCategoryName ? productsByCategory[activeCategoryName] || [] : []),
    [activeCategoryName, productsByCategory]
  );

  // ============================================================================
  // LÓGICA DE OFERTAS
  // ============================================================================
  const canonicalOfferOptions = useMemo(() => getCanonicalOfferOptions(), []);
  const canonicalOfferFilterOptions = useMemo(() => getCanonicalOfferFilterOptions(), []);
  const normalizedOffers = useMemo(
    () =>
      offers.map((offer) => {
        const canonical = normalizeLegacyOffer(offer, productsByCategory, inventory);
        const resolvedProducts =
          canonical.scopeMode === 'category' && canonical.categoryName
            ? productsByCategory[canonical.categoryName] || canonical.productsIncluded
            : canonical.productsIncluded;

        return {
          ...offer,
          canonical,
          canonicalType: canonical.benefitType,
          canonicalTypeLabel: getCanonicalOfferTypeLabel(canonical.benefitType),
          canonicalSubtypeLabel: getCanonicalOfferSubtypeLabel(canonical),
          canonicalModeLabel: getCanonicalOfferModeLabel(canonical),
          resolvedProductsIncluded: resolvedProducts,
          scopeSummary:
            canonical.scopeMode === 'all_products'
              ? 'Todos los productos'
              : canonical.scopeMode === 'category' && canonical.categoryName
              ? `Categoria: ${canonical.categoryName}`
              : 'Productos',
        };
      }),
    [inventory, offers, productsByCategory]
  );

  const filteredOffers = useMemo(() => {
    const normalizedSearch = offersSearch.trim().toLowerCase();

    return normalizedOffers.filter((offer) => {
      const matchesType = offersTypeFilter === 'all' || offer.canonicalType === offersTypeFilter;
      const matchesSearch =
        !normalizedSearch ||
        offer.name.toLowerCase().includes(normalizedSearch) ||
        offer.canonicalTypeLabel.toLowerCase().includes(normalizedSearch) ||
        offer.canonicalSubtypeLabel.toLowerCase().includes(normalizedSearch);

      return matchesType && matchesSearch;
    });
  }, [normalizedOffers, offersSearch, offersTypeFilter]);

  const currentOfferTypeFilterLabel =
    offersTypeFilter === 'all'
      ? 'Todos'
      : canonicalOfferOptions.find((option) => option.value === offersTypeFilter)?.label || 'Todos';

  const offerResolvedProducts = useMemo(
    () =>
      offerForm.scopeMode === 'all_products'
        ? inventory || []
        : offerForm.scopeMode === 'category' && offerForm.categoryName
        ? productsByCategory[offerForm.categoryName] || []
        : offerForm.productsIncluded,
    [inventory, offerForm.categoryName, offerForm.productsIncluded, offerForm.scopeMode, productsByCategory]
  );

  const availableProductsForOffer = useMemo(() => {
    if (!inventory) return [];
    const currentIds = offerForm.productsIncluded.map((product) => product.id);
    let available = inventory.filter((product) => !currentIds.includes(product.id));

    if (offerProductSearch.trim()) {
      available = available.filter((product) =>
        product.title.toLowerCase().includes(offerProductSearch.toLowerCase())
      );
    }
    return available;
  }, [inventory, offerForm.productsIncluded, offerProductSearch]);
  const openNewOfferModal = () => {
    if (isReadOnly) return;
    setOfferForm({ ...defaultCanonicalOfferForm, productsIncluded: [] });
    setEditingOfferId(null);
    setOfferWizardStep(1);
    setOfferProductSearch('');
    setIsOfferModalOpen(true);
  };
  const openEditOfferModal = (offer) => {
    if (isReadOnly) return;
    setOfferForm(normalizeLegacyOffer(offer, productsByCategory, inventory));
    setEditingOfferId(offer.id);
    setOfferWizardStep(5);
    setOfferProductSearch('');
    setIsOfferModalOpen(true);
  };

  const closeOfferModal = () => {
    setIsOfferModalOpen(false);
    setOfferForm({ ...defaultCanonicalOfferForm, productsIncluded: [] });
    setEditingOfferId(null);
    setOfferWizardStep(1);
    setOfferProductSearch('');
  };
  const handleAddProductToOffer = (product) => {
    if (isReadOnly) return;
    setOfferForm((prev) => ({
      ...prev,
      productsIncluded: [
        ...prev.productsIncluded,
        {
          id: product.id,
          title: product.title,
          price: product.price,
          image: product.image,
        },
      ],
    }));
  };
  const handleRemoveProductFromOffer = (productId) => {
    if (isReadOnly) return;
    setOfferForm((prev) => ({
      ...prev,
      productsIncluded: prev.productsIncluded.filter((product) => product.id !== productId),
    }));
  };
  const handleOfferBenefitTypeChange = (benefitType) => {
    if (isReadOnly) return;
    setOfferForm((prev) => {
      const nextForm = {
        ...prev,
        benefitType,
      };

      if (benefitType === 'free') {
        nextForm.freeMode = prev.freeMode || '2x1';
      }

      if (benefitType === 'discount') {
        nextForm.discountMode = prev.discountMode || 'unit';
      }

      if (benefitType === 'coupon') {
        nextForm.discountMode = prev.discountMode === 'percentage' ? 'percentage' : 'total';
        nextForm.scopeMode = 'all_products';
        nextForm.categoryName = '';
        nextForm.productsIncluded = [];
      }

      if (benefitType === 'combo' || benefitType === 'fixed_price') {
        nextForm.scopeMode = 'products';
        nextForm.categoryName = '';
      }

      return nextForm;
    });
  };
  const handleOfferScopeChange = (scopeMode) => {
    if (isReadOnly) return;
    setOfferForm((prev) => {
      if (prev.benefitType === 'combo' || prev.benefitType === 'fixed_price') {
        return {
          ...prev,
          scopeMode: 'products',
          categoryName: '',
        };
      }

      if (prev.benefitType === 'coupon') {
        return {
          ...prev,
          scopeMode: 'all_products',
          categoryName: '',
          productsIncluded: [],
        };
      }

      return {
        ...prev,
        scopeMode,
        categoryName: scopeMode === 'category' ? prev.categoryName : '',
      };
    });
  };

  const getOfferWizardStepError = useCallback(
    (step = offerWizardStep) => {
      if (step === 1 && !offerForm.name.trim()) {
        return 'Debe ingresar un nombre visible para continuar.';
      }

      if (step === 2) {
        if (offerForm.benefitType === 'coupon') {
          return null;
        }
        if (
          (offerForm.benefitType === 'combo' || offerForm.benefitType === 'fixed_price') &&
          !['products', 'all_products'].includes(offerForm.scopeMode)
        ) {
          return 'Este tipo solo puede trabajar con productos seleccionados.';
        }
      }

      if (step === 3) {
        if (offerForm.benefitType === 'fixed_price' && !Number(offerForm.offerPrice)) {
          return 'Debe indicar el precio final.';
        }
        if (offerForm.benefitType === 'discount' && !Number(offerForm.discountValue)) {
          return 'Debe indicar el monto del descuento.';
        }
        if (offerForm.benefitType === 'coupon') {
          if (!String(offerForm.couponCode || '').trim()) return 'Debe indicar el codigo del cupon.';
          if (!Number(offerForm.discountValue)) {
            return offerForm.discountMode === 'percentage'
              ? 'Debe indicar el porcentaje del cupon.'
              : 'Debe indicar el monto del cupon.';
          }
        }
        if (offerForm.benefitType === 'wholesale') {
          if (!Number(offerForm.itemsCount)) return 'Debe indicar la cantidad minima.';
          if (!Number(offerForm.offerPrice)) return 'Debe indicar el precio unitario mayorista.';
        }
        if (offerForm.benefitType === 'combo' && !Number(offerForm.offerPrice)) {
          return 'Debe indicar el precio final del combo.';
        }
      }

      if (step === 4) {
        if (offerForm.benefitType === 'coupon') {
          return null;
        }
        if (offerForm.scopeMode === 'all_products') {
          if ((inventory || []).length === 0) {
            return 'No hay productos cargados en inventario.';
          }
        } else if (offerForm.scopeMode === 'category') {
          if (!offerForm.categoryName) return 'Debe seleccionar una categoria.';
          if ((productsByCategory[offerForm.categoryName] || []).length === 0) {
            return 'La categoria elegida no tiene productos cargados.';
          }
        } else if (offerForm.productsIncluded.length === 0) {
          return 'Debe incluir al menos un producto.';
        }
      }

      return null;
    },
    [inventory, offerForm, offerWizardStep, productsByCategory]
  );
  const handleAdvanceOfferWizard = () => {
    if (isReadOnly) return;
    const errorMessage = getOfferWizardStepError();
    if (errorMessage) {
      alert(errorMessage);
      return;
    }

    setOfferWizardStep((current) => Math.min(current + 1, OFFER_WIZARD_STEPS.length));
  };
  const handleSaveOffer = () => {
    if (isReadOnly) return;
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
  const handleSaveOfferWizard = () => {
    if (isReadOnly) return;
    const validationError = validateOfferWizardForm(offerForm, productsByCategory, inventory);
    if (validationError) return alert(validationError);

    const payload = buildLegacyOfferPayload(offerForm, productsByCategory, inventory);

    if (editingOfferId) {
      if (onUpdateOffer) onUpdateOffer(editingOfferId, payload);
    } else {
      if (onAddOffer) onAddOffer(payload);
    }
    closeOfferModal();
  };

  const handleDeleteOfferClick = (id, name, e) => {
    if (isReadOnly) return;
    e?.stopPropagation(); 
    if (window.confirm(`¿Estás seguro de eliminar la oferta "${name}"?\nSe quitará de todos los productos aplicados.`)) {
      if (onDeleteOffer) onDeleteOffer(id);
    }
  };

  const offerWizardIsManualMode =
    offerForm.benefitType === 'combo' || offerForm.benefitType === 'fixed_price';
  const offerWizardSuggestedOriginalPrice = offerResolvedProducts.reduce(
    (acc, product) => acc + Number(product.price || 0),
    0
  );
  const offerWizardGuide = getOfferWizardGuide(offerForm);
  const isComboOrPack = offerWizardIsManualMode;
  const suggestedOriginalPrice = offerWizardSuggestedOriginalPrice;
  const offerTypeGuide = offerWizardGuide;
  const offerCategoryProducts = offerForm.categoryName ? productsByCategory[offerForm.categoryName] || [] : [];


  // ============================================================================
  // LÓGICA DE PREMIOS
  // ============================================================================
  const isSearchTest = rewardsSearch.toLowerCase().includes('test');

  const filteredRewards = useMemo(() => {
    const normalizedSearch = rewardsSearch.trim().toLowerCase();

    return rewards.filter((reward) => {
      if (isTestRecord(reward) && !isSearchTest) return false;

      const matchesType = rewardsTypeFilter === 'all' || reward.type === rewardsTypeFilter;
      const matchesSearch =
        !normalizedSearch ||
        reward.title?.toLowerCase().includes(normalizedSearch) ||
        reward.description?.toLowerCase().includes(normalizedSearch);

      return matchesType && matchesSearch;
    });
  }, [isSearchTest, rewards, rewardsSearch, rewardsTypeFilter]);

  const rewardTypeOptions = useMemo(() => {
    const uniqueTypes = [...new Set(rewards.map((reward) => reward.type).filter(Boolean))];
    return ['all', ...uniqueTypes];
  }, [rewards]);
  const currentRewardTypeFilterLabel = rewardsTypeFilter === 'all' ? 'Todos' : rewardsTypeFilter === 'product' ? 'Producto' : 'Descuento';

  const selectedOffer = useMemo(
    () => filteredOffers.find((offer) => offer.id === selectedOfferId) || filteredOffers[0] || null,
    [filteredOffers, selectedOfferId]
  );

  const selectedReward = useMemo(
    () => filteredRewards.find((reward) => reward.id === selectedRewardId) || filteredRewards[0] || null,
    [filteredRewards, selectedRewardId]
  );

  const categoriesFeed = useIncrementalList(filteredOrderedCategories, {
    initialCount: 30,
    step: 30,
    resetKey: `${categorySearch}-${filteredOrderedCategories.length}-${recentCategoryName || ''}`,
  });
  const activeCategoryProductsFeed = useIncrementalList(activeCategoryProducts, {
    initialCount: 30,
    step: 30,
    resetKey: `${activeCategoryName || ''}-${activeCategoryProducts.length}`,
  });
  const offersFeed = useIncrementalList(filteredOffers, {
    initialCount: 30,
    step: 30,
    resetKey: `${offersSearch}-${offersTypeFilter}-${filteredOffers.length}`,
  });
  const selectedOfferProductsFeed = useIncrementalList(selectedOffer?.resolvedProductsIncluded || [], {
    initialCount: 30,
    step: 30,
    resetKey: `${selectedOffer?.id || ''}-${selectedOffer?.resolvedProductsIncluded?.length || 0}`,
  });
  const rewardsFeed = useIncrementalList(filteredRewards, {
    initialCount: 30,
    step: 30,
    resetKey: `${rewardsSearch}-${rewardsTypeFilter}-${filteredRewards.length}`,
  });
  const offerModalAvailableFeed = useIncrementalList(availableProductsForOffer, {
    initialCount: 30,
    step: 30,
    resetKey: `${offerProductSearch}-${availableProductsForOffer.length}-${editingOfferId || 'new'}-${offerForm.scopeMode}`,
  });
  const offerModalIncludedFeed = useIncrementalList(offerResolvedProducts, {
    initialCount: 30,
    step: 30,
    resetKey: `${editingOfferId || 'new'}-${offerResolvedProducts.length}-${offerForm.scopeMode}-${offerForm.categoryName}`,
  });

  const openCreateRewardModal = () => {
    if (isReadOnly) return;
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
    if (isReadOnly) return;
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
    if (isReadOnly) return;
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
    if (isReadOnly) return;
    setRewardToDelete(reward);
    setIsDeleteRewardModalOpen(true);
  };

  const confirmDeleteReward = () => {
    if (isReadOnly) return;
    if (rewardToDelete) {
      onDeleteReward(rewardToDelete.id);
      setIsDeleteRewardModalOpen(false);
      setRewardToDelete(null);
    }
  };

  const totalCategoryAssignments = useMemo(
    () => categories.reduce((acc, cat) => acc + (productsByCategory[cat]?.length || 0), 0),
    [categories, productsByCategory]
  );

  const posButtonOffersCount = useMemo(
    () => offers.filter((offer) => offer.applyTo === 'Seleccion').length,
    [offers]
  );

  const automaticOffersCount = offers.length - posButtonOffersCount;

  const rewardProductCount = useMemo(
    () => rewards.filter((reward) => reward.type === 'product').length,
    [rewards]
  );

  const rewardDiscountCount = rewards.length - rewardProductCount;

  const extrasTabClass = (tab) =>
    `${activeTab === tab ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'hidden'}`
      .trim();

  const extrasTabButtonClass = (tab, activeStyles) =>
    [
      'px-3 sm:px-3.5 py-1.5 text-[11px] sm:text-xs font-black whitespace-nowrap rounded-t-lg border-x border-t transition-all',
      activeTab === tab
        ? `${activeStyles} bg-white -mb-[2px] border-slate-200`
        : 'text-slate-500 border-transparent hover:bg-slate-100/80 hover:text-slate-700',
    ].join(' ');

  const getOfferAccent = (offerType) => {
    if (['Combo', 'Kit', 'Pack'].includes(offerType)) {
      return {
        badge: 'bg-amber-100 text-amber-700 border-amber-200',
        chip: 'bg-amber-50 text-amber-700 border-amber-200',
      };
    }

    if (offerType === 'Mayorista') {
      return {
        badge: 'bg-sky-100 text-sky-700 border-sky-200',
        chip: 'bg-sky-50 text-sky-700 border-sky-200',
      };
    }

    return {
      badge: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      chip: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    };
  };

  const extrasHeaderCopy = {
    categories: 'Organiza categorías y ajusta la asignación de productos sin salir del módulo.',
    offers: 'Configura promociones, descuentos, combos y cupones que impactan directo en caja.',
    rewards: 'Administra el catálogo de premios y descuentos disponibles para canjes.',
  };

  const activeSectionMeta = {
    categories: {
      title: 'Categorias',
      description: 'Gestion del catalogo y de los productos agrupados.',
      icon: Tag,
      accent: 'orange',
    },
    offers: {
      title: 'Ofertas y Descuentos',
      description: 'Promociones activas, descuentos manuales y cupones del punto de venta.',
      icon: TicketPercent,
      accent: 'emerald',
    },
    rewards: {
      title: 'Premios',
      description: 'Canjes disponibles y configuracion del programa.',
      icon: Gift,
      accent: 'amber',
    },
  };

  const ActiveHeaderIcon = activeSectionMeta[activeTab].icon;
  const activeHeaderTone =
    {
      categories: 'border-orange-200 bg-orange-50 text-orange-700',
      offers: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      rewards: 'border-amber-300 bg-amber-50 text-amber-800',
    }[activeTab] || 'border-slate-200 bg-slate-50 text-slate-700';
  const activeHeaderSurface =
    {
      categories: 'border-orange-200 bg-[radial-gradient(circle_at_top_left,_rgba(249,115,22,0.18),_transparent_34%),linear-gradient(180deg,_#ffedd5_0%,_#ffffff_100%)]',
      offers: 'border-emerald-200 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.2),_transparent_34%),linear-gradient(180deg,_#ecfdf5_0%,_#ffffff_100%)]',
      rewards: 'border-amber-300 bg-[radial-gradient(circle_at_top_left,_rgba(180,83,9,0.1),_transparent_34%),linear-gradient(180deg,_#fff7d6_0%,_#ffffff_100%)]',
    }[activeTab] || 'border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)]';
  const activeHeaderDivider =
    {
      categories: 'border-orange-200/80',
      offers: 'border-emerald-200/80',
      rewards: 'border-amber-300/80',
    }[activeTab] || 'border-slate-200';

// ============================================================================
  // RENDERIZADO PRINCIPAL
  // ============================================================================
  return (
    <div className="extras-view-scrollless flex h-full min-h-0 flex-col overflow-hidden animate-in fade-in duration-300">
      <style>{`
        .extras-view-scrollless * {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }

        .extras-view-scrollless *::-webkit-scrollbar {
          display: none;
          width: 0;
          height: 0;
        }
      `}</style>
      
      {/* ========================================= */}
      {/* HEADER Y TABS ESTILO CARPETA (AFUERA) */}
      {/* ========================================= */}
      <div className={`shrink-0 rounded-t-[22px] border border-b-0 px-3 pt-1.5 sm:px-3.5 sm:pt-2 lg:px-4 ${activeHeaderSurface}`}>
        <div className="hidden grid grid-cols-3 gap-2 border-b border-slate-200 pb-3">
          {[
            { id: 'categories', label: 'Categorias', count: categories.length, icon: Tag, active: 'text-fuchsia-700 border-fuchsia-200 bg-fuchsia-50' },
            { id: 'offers', label: 'Ofertas', count: offers.length, icon: TicketPercent, active: 'text-violet-700 border-violet-200 bg-violet-50' },
            { id: 'rewards', label: 'Premios', count: rewards.length, icon: Gift, active: 'text-emerald-700 border-emerald-200 bg-emerald-50' },
          ].map(({ id, label, count, icon: BlockIcon, active }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`rounded-xl border px-3 py-2 text-left transition-all ${
                activeTab === id ? active : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <BlockIcon size={15} />
                <span className="text-[10px] font-black">{formatNumber(count)}</span>
              </div>
              <div className="mt-2 text-xs font-black uppercase tracking-[0.18em]">{label}</div>
            </button>
          ))}
        </div>

        <div className="flex items-stretch gap-2.5 px-1 py-1.5">
          <div className={`flex min-h-[54px] w-11 shrink-0 items-center justify-center rounded-lg border ${activeHeaderTone}`}>
            <ActiveHeaderIcon size={19} />
          </div>
          <div className="min-w-0 flex-1">
            <div
              className={`mb-0.5 flex items-end gap-1 overflow-x-auto border-b-2 [&::-webkit-scrollbar]:hidden ${activeHeaderDivider}`}
              style={{ scrollbarWidth: 'none' }}
            >
              <button
                onClick={() => setActiveTab('categories')}
                className={extrasTabButtonClass('categories', 'text-orange-700')}
              >
                Categorias
              </button>
              <button
                onClick={() => setActiveTab('offers')}
                className={extrasTabButtonClass('offers', 'text-emerald-700')}
              >
                Ofertas y Descuentos
              </button>
              <button
                onClick={() => setActiveTab('rewards')}
                className={extrasTabButtonClass('rewards', 'text-amber-700')}
              >
                Premios
              </button>
            </div>
            <p className="text-[10px] leading-tight text-slate-500 sm:text-[11px]">{activeSectionMeta[activeTab].description}</p>
          </div>
        </div>

        {/* Título (Izquierda) */}
        <div className="hidden flex items-center gap-2 px-1 pb-2">
          <div className="rounded-lg border border-slate-200 bg-white p-2 text-slate-700 shadow-sm">
            <Settings2 size={16} />
          </div>
          <div className="hidden">
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-800">Gestión de Extras</h2>
            <p className="text-sm font-medium text-slate-500">Gestiona catálogos, promociones y el sistema de premios.</p>
          </div>
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-black tracking-tight text-slate-800">Gestion de Extras</h2>
            <p className="truncate text-xs font-medium text-slate-500">{extrasHeaderCopy[activeTab]}</p>
          </div>
        </div>

        <div className="hidden px-1 pb-3">
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-800">Gestión de Extras</h2>
          <p className="text-sm font-medium text-slate-500">{extrasHeaderCopy[activeTab]}</p>
        </div>

        <div className="hidden">
          <div className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-3 py-2">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-fuchsia-500">Categorías</p>
            <p className="mt-1 text-lg font-black text-slate-900">{formatNumber(categories.length)}</p>
          </div>
          <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-500">Ofertas</p>
            <p className="mt-1 text-lg font-black text-slate-900">{formatNumber(offers.length)}</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-500">Premios</p>
            <p className="mt-1 text-lg font-black text-slate-900">{formatNumber(rewards.length)}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Vínculos</p>
            <p className="mt-1 text-lg font-black text-slate-900">{formatNumber(totalCategoryAssignments)}</p>
          </div>
        </div>

        {/* Tabs Estilo Carpeta (Derecha) */}
        <div className="hidden flex items-end gap-1 overflow-x-auto border-b-2 border-slate-200 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
          <button 
            onClick={() => setActiveTab('categories')}
            className={extrasTabButtonClass('categories', 'text-fuchsia-600')}
          >
            Categorías
          </button>
          <button 
            onClick={() => setActiveTab('offers')}
            className={extrasTabButtonClass('offers', 'text-violet-600')}
          >
            Ofertas y Descuentos
          </button>
          <button 
            onClick={() => setActiveTab('rewards')}
            className={extrasTabButtonClass('rewards', 'text-emerald-600')}
          >
            Sistema de Premios
          </button>
        </div>
      </div>

      {/* ========================================= */}
      {/* CONTENEDOR BLANCO PRINCIPAL (LA CARPETA) */}
      {/* ========================================= */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-b-[22px] border border-slate-200 border-t-0 bg-white shadow-sm">

        <div className={extrasTabClass('categories')}>
          <div className="h-full overflow-hidden p-2 sm:p-2.5 lg:p-3">
            <div className="grid h-full min-h-0 gap-2 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
              <div className="flex min-h-0 flex-col rounded-[22px] border border-orange-200 bg-orange-50/60 p-2 sm:p-2.5">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <div className="flex shrink-0 items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em]">
                      <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-1 text-orange-700">
                        {formatNumber(categories.length)} categorias
                      </span>
                      {recentCategoryName && (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700">
                          Nueva: {recentCategoryName}
                        </span>
                      )}
                    </div>
                    <p className="min-w-0 text-xs font-semibold normal-case tracking-normal text-slate-600">
                      Selecciona una categoria para ver sus productos.
                    </p>
                  </div>

                  <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:flex-nowrap">
                    <div className="relative w-full sm:w-[175px]">
                      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                      <input
                        type="text"
                        placeholder="Buscar categoria..."
                        className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs font-medium outline-none transition-all focus:ring-2 focus:ring-orange-500"
                        value={categorySearch}
                        onChange={(e) => setCategorySearch(e.target.value)}
                      />
                    </div>
                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={() => setIsCreateCategoryModalOpen(true)}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-3 py-2 text-xs font-black text-white transition-colors hover:bg-orange-600"
                      >
                        <Plus size={16} strokeWidth={3} />
                        Agregar
                      </button>
                    )}
                  </div>
                </div>

                {categories.length === 0 ? (
                  <div className="flex h-[320px] flex-col items-center justify-center rounded-[20px] border border-dashed border-slate-200 bg-white text-center">
                    <div className="mb-4 rounded-full border border-slate-200 bg-slate-50 p-4">
                      <Tag size={28} className="text-slate-300" />
                    </div>
                    <p className="text-base font-black text-slate-500">No hay categorias registradas.</p>
                    <p className="mt-1 text-sm text-slate-400">Crea una para empezar a organizar el inventario.</p>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }} onScroll={categoriesFeed.handleScroll}>
                    <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
                    {categoriesFeed.visibleItems.map((cat) => {
                      const productCount = productsByCategory[cat]?.length || 0;
                      const isActive = activeCategoryName === cat;
                      const isRecent = recentCategoryName === cat;

                      return (
                        <div
                          key={cat}
                          onClick={() => handleSelectCategory(cat)}
                          className={`group relative flex min-h-[128px] cursor-pointer flex-col rounded-[18px] border px-3 py-3 transition-all ${
                            isActive
                              ? 'border-orange-300 bg-white shadow-sm'
                              : 'border-orange-100 bg-white/85 hover:border-orange-200 hover:bg-white'
                          }`}
                        >
                          {isRecent && (
                            <span className="absolute right-2 top-2 z-10 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-emerald-700 shadow-sm">
                              Nueva
                            </span>
                          )}
                          <ProductPreviewGrid
                            items={productsByCategory[cat] || []}
                            fallbackIcon={Tag}
                            accent="orange"
                          />
                          <div className="-mt-1 min-w-0">
                            <p className="truncate text-[13px] font-black text-slate-800">{cat}</p>
                          </div>
                          <div className="mt-3">
                            <p className="text-xs font-medium text-slate-500">{formatNumber(productCount)} productos vinculados</p>
                          </div>
                        </div>
                      );
                    })}
                    </div>
                    {categoriesFeed.hasMore && (
                      <p className="pt-3 text-center text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                        Mostrando {categoriesFeed.visibleCount} de {categoriesFeed.totalItems}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex min-h-0 flex-col rounded-[22px] border border-orange-200 bg-orange-50/40 p-2 sm:p-2.5">
                {activeCategoryName ? (
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="mb-2 flex items-center justify-between gap-2 border-b border-orange-100 pb-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="rounded-lg border border-orange-200 bg-orange-50 p-1.5 text-orange-700">
                            <Tag size={14} />
                          </div>
                          <div>
                            <h3 className="text-base font-black text-slate-900">{activeCategoryName}</h3>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <p className="whitespace-nowrap text-[16px] text-slate-500">
                          {formatNumber(productsByCategory[activeCategoryName]?.length || 0)} productos dentro de esta categoria.
                        </p>
                        {!isReadOnly && (
                          <>
                            <button
                              onClick={() => openCategoryEditor(activeCategoryName)}
                              className="inline-flex items-center gap-1 rounded-xl border border-orange-200 bg-orange-50 px-2 py-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-orange-700 transition-colors hover:bg-orange-100"
                            >
                              <Pencil size={12} />
                              Editar
                            </button>
                            <button
                              onClick={() => onDeleteCategory(activeCategoryName)}
                              className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-2 py-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-red-700 transition-colors hover:bg-red-100"
                            >
                              <Trash2 size={12} />
                              Eliminar
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }} onScroll={activeCategoryProductsFeed.handleScroll}>
                      {activeCategoryProducts.length > 0 ? (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {activeCategoryProductsFeed.visibleItems.map((product) => (
                            <div
                              key={product.id}
                              className="flex items-center justify-between gap-2 rounded-[16px] border border-orange-100 bg-white/85 px-2.5 py-2"
                            >
                              <div className="flex min-w-0 items-center gap-2.5">
                                {product.image ? (
                                  <img
                                    src={product.image}
                                    alt={product.title}
                                    className="h-10 w-10 rounded-lg border border-slate-200 object-cover"
                                    onError={(e) => {
                                      e.target.style.display = 'none';
                                    }}
                                  />
                                ) : (
                                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white">
                                    <Package size={16} className="text-slate-300" />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-black text-slate-800">{product.title}</p>
                                  <p className="text-[11px] text-slate-500">
                                    Stock: <span className="font-bold text-slate-700">{formatNumber(product.stock || 0)}</span>
                                  </p>
                                </div>
                              </div>
                              <button
                                onClick={() => {
                                  openCategoryEditor(activeCategoryName);
                                  handleRemoveProductFromCategory(product);
                                }}
                                className="rounded-lg border border-transparent p-1.5 text-slate-300 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                                title="Quitar de la categoria"
                              >
                                <MinusCircle size={16} />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex h-full min-h-[220px] flex-col items-center justify-center rounded-[20px] border border-dashed border-slate-200 bg-slate-50 text-center">
                          <div className="mb-4 rounded-full border border-slate-200 bg-white p-4">
                            <Package size={28} className="text-slate-300" />
                          </div>
                          <p className="text-base font-black text-slate-500">La categoria esta vacia.</p>
                          <p className="mt-1 text-sm text-slate-400">Agrega productos desde el boton superior.</p>
                        </div>
                      )}
                      {activeCategoryProductsFeed.hasMore && (
                        <p className="pt-3 text-center text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                          Mostrando {activeCategoryProductsFeed.visibleCount} de {activeCategoryProductsFeed.totalItems}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full min-h-0 flex-col items-center justify-center rounded-[20px] border border-dashed border-orange-200 bg-orange-50/30 text-center">
                    <div className="mb-4 rounded-full border border-slate-200 bg-white p-4">
                      <Tag size={28} className="text-slate-300" />
                    </div>
                    <p className="text-base font-black text-slate-500">No hay una categoria seleccionada.</p>
                    <p className="mt-1 text-sm text-slate-400">El panel derecho mostrara aqui el detalle y los productos.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {/* VISTA DE CATEGORÍAS */}
        <div className={extrasTabClass('offers')}>
          <div className="h-full overflow-hidden p-2 sm:p-2.5 lg:p-3">
            <div className="grid h-full min-h-0 gap-2 xl:grid-cols-[minmax(0,0.95fr)_minmax(340px,1.05fr)]">
              <div className="flex min-h-0 flex-col rounded-[22px] border border-emerald-200 bg-emerald-50/60 p-2 sm:p-2.5">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <div className="flex shrink-0 items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em]">
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700">
                        Total: {formatNumber(offers.length)}
                      </span>
                    </div>
                    <p className="min-w-0 text-xs font-semibold normal-case tracking-normal text-slate-600">
                      Selecciona una oferta para ver sus productos.
                    </p>
                  </div>

                  <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:flex-nowrap">
                    <div className="relative w-full sm:w-[155px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                      <input
                        type="text"
                        placeholder="Buscar oferta..."
                        className="w-full rounded-xl border border-emerald-200 bg-white py-1.5 pl-8 pr-2.5 text-xs font-medium outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25"
                        value={offersSearch}
                        onChange={(e) => setOffersSearch(e.target.value)}
                      />
                    </div>
                    <div
                      className="relative w-full sm:w-[170px]"
                      onBlur={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget)) {
                          setIsOfferTypeMenuOpen(false);
                        }
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setIsOfferTypeMenuOpen((current) => !current)}
                        className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${
                          isOfferTypeMenuOpen
                            ? 'border-emerald-400 bg-emerald-50 text-emerald-900 shadow-sm'
                            : 'border-emerald-200 bg-white/95 text-slate-700 hover:border-emerald-300'
                        }`}
                      >
                        <span>{currentOfferTypeFilterLabel}</span>
                        <ChevronDown
                          size={14}
                          className={`transition-transform ${isOfferTypeMenuOpen ? 'rotate-180 text-emerald-700' : 'text-emerald-500'}`}
                        />
                      </button>
                      {isOfferTypeMenuOpen && (
                        <div className="absolute right-0 top-[calc(100%+6px)] z-20 w-full overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-xl shadow-emerald-900/10">
                          <div className="border-b border-emerald-100 bg-emerald-50/80 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">
                            Filtrar por tipo
                          </div>
                          <div className="p-1.5">
                            {canonicalOfferFilterOptions.map((typeOption) => {
                              const isActive = offersTypeFilter === typeOption;
                              const optionLabel =
                                typeOption === 'all'
                                  ? 'Todos'
                                  : canonicalOfferOptions.find((option) => option.value === typeOption)?.label || typeOption;

                              return (
                                <button
                                  key={typeOption}
                                  type="button"
                                  onClick={() => {
                                    setOffersTypeFilter(typeOption);
                                    setIsOfferTypeMenuOpen(false);
                                  }}
                                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold transition-colors ${
                                    isActive
                                      ? 'bg-emerald-600 text-white shadow-sm'
                                      : 'text-slate-600 hover:bg-emerald-50 hover:text-emerald-800'
                                  }`}
                                >
                                  <span>{optionLabel}</span>
                                  {isActive && <Check size={14} strokeWidth={3} />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                    {!isReadOnly && (
                      <button
                        onClick={openNewOfferModal}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white transition-colors hover:bg-emerald-700"
                      >
                        <Plus size={16} strokeWidth={3} />
                        Nueva
                      </button>
                    )}
                  </div>
                </div>

                {filteredOffers.length === 0 ? (
                  <div className="flex h-[320px] flex-col items-center justify-center rounded-[20px] border border-dashed border-slate-200 bg-white text-center">
                    <div className="mb-4 rounded-full border border-slate-200 bg-slate-50 p-4">
                      <TicketPercent size={28} className="text-slate-300" />
                    </div>
                    <p className="text-base font-black text-slate-500">No hay ofertas configuradas.</p>
                    <p className="mt-1 text-sm text-slate-400">Crea una nueva regla para verla en detalle aqui.</p>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }} onScroll={offersFeed.handleScroll}>
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-4">
                    {offersFeed.visibleItems.map((offer) => {
                      const accent = getCanonicalOfferAccent(offer.canonicalType);
                      const isActive = selectedOffer?.id === offer.id;

                      return (
                        <div
                          key={offer.id}
                          onClick={() => setSelectedOfferId(offer.id)}
                          className={`flex min-h-[148px] cursor-pointer flex-col rounded-[20px] border px-3.5 py-3.5 transition-all ${
                            isActive
                              ? 'border-emerald-400 bg-white shadow-sm'
                              : 'border-emerald-200 bg-white/90 hover:border-emerald-300 hover:bg-white'
                          }`}
                        >
                          <ProductPreviewGrid
                            items={offer.resolvedProductsIncluded || []}
                            fallbackIcon={TicketPercent}
                            accent="emerald"
                          />
                          <div className="-mt-0.5 min-w-0">
                              <p className="truncate text-[14px] font-black text-slate-800">{offer.name}</p>
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.18em] ${accent.badge}`}>
                                  {offer.canonicalTypeLabel}
                                </span>
                                {offer.canonicalSubtypeLabel && (
                                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.18em] ${accent.chip}`}>
                                    {offer.canonicalSubtypeLabel}
                                  </span>
                                )}
                              </div>
                          </div>
                          <p className="mt-3 text-xs text-slate-500">{formatNumber(offer.resolvedProductsIncluded.length)} productos vinculados</p>
                        </div>
                      );
                    })}
                    </div>
                    {offersFeed.hasMore && (
                      <p className="pt-3 text-center text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                        Mostrando {offersFeed.visibleCount} de {offersFeed.totalItems}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex min-h-0 flex-col rounded-[22px] border border-emerald-200 bg-emerald-50/35 p-2 sm:p-2.5">
                {selectedOffer ? (
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-emerald-100 pb-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-1.5 text-emerald-700">
                            <TicketPercent size={14} />
                          </div>
                          <div>
                            <h3 className="text-base font-black text-slate-900">{selectedOffer.name}</h3>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[16px] text-slate-500">
                          {selectedOffer.canonicalModeLabel}
                          {selectedOffer.canonicalSubtypeLabel ? ` · ${selectedOffer.canonicalSubtypeLabel}` : ''}
                          {' · '}
                          {formatNumber(selectedOffer.resolvedProductsIncluded.length)} productos
                        </p>
                        {!isReadOnly && (
                          <>
                            <button
                              onClick={() => openEditOfferModal(selectedOffer)}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700 transition-colors hover:bg-emerald-100"
                            >
                              <Pencil size={12} />
                              Editar
                            </button>
                            <button
                              onClick={() => handleDeleteOfferClick(selectedOffer.id, selectedOffer.name)}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-red-700 transition-colors hover:bg-red-100"
                            >
                              <Trash2 size={12} />
                              Eliminar
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="mb-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-500">Tipo</p>
                        <p className="mt-1 text-sm font-black text-slate-900">{selectedOffer.canonicalTypeLabel}</p>
                      </div>
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-500">Alcance</p>
                        <p className="mt-1 text-sm font-black text-slate-900">{selectedOffer.scopeSummary}</p>
                      </div>
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-500">
                          {selectedOffer.canonicalType === 'discount'
                            ? 'Descuento'
                            : selectedOffer.canonicalType === 'coupon'
                            ? 'Cupon'
                            : selectedOffer.canonicalType === 'wholesale'
                            ? 'Precio unitario'
                            : 'Precio final'}
                        </p>
                        <p className="mt-1 text-sm font-black text-slate-900">
                          {selectedOffer.canonicalType === 'discount' || selectedOffer.canonicalType === 'coupon'
                            ? Number(selectedOffer.canonical?.discountValue || selectedOffer.discountValue || 0) > 0
                              ? selectedOffer.canonicalSubtypeLabel === 'Porcentaje'
                                ? `${Number(selectedOffer.canonical?.discountValue || selectedOffer.discountValue || 0)}%`
                                : <FancyPrice amount={Number(selectedOffer.canonical?.discountValue || selectedOffer.discountValue || 0)} />
                              : 'Auto'
                            : Number(selectedOffer.offerPrice || 0) > 0
                            ? <FancyPrice amount={Number(selectedOffer.offerPrice)} />
                            : 'Auto'}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-500">
                          {selectedOffer.canonicalType === 'coupon' ? 'Codigo' : 'Productos'}
                        </p>
                        <p className="mt-1 text-sm font-black text-slate-900">
                          {selectedOffer.canonicalType === 'coupon'
                            ? selectedOffer.canonicalSubtypeLabel || 'Sin codigo'
                            : formatNumber(selectedOffer.resolvedProductsIncluded.length)}
                        </p>
                      </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }} onScroll={selectedOfferProductsFeed.handleScroll}>
                      {selectedOffer.resolvedProductsIncluded.length > 0 ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                          {selectedOfferProductsFeed.visibleItems.map((product) => (
                            <div
                              key={product.id}
                              className="flex items-center gap-2.5 rounded-[16px] border border-emerald-200 bg-white/90 px-2.5 py-2"
                            >
                              {product.image ? (
                                <img
                                  src={product.image}
                                  alt={product.title}
                                  className="h-10 w-10 rounded-lg border border-slate-200 object-cover"
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                  }}
                                />
                              ) : (
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white">
                                  <Package size={16} className="text-slate-300" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="truncate text-xs font-black text-slate-800">{product.title}</p>
                                <p className="text-[11px] text-slate-500">
                                  Precio: <span className="font-bold text-slate-700"><FancyPrice amount={Number(product.price || 0)} /></span>
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex h-full min-h-[220px] flex-col items-center justify-center rounded-[20px] border border-dashed border-slate-200 bg-slate-50 text-center">
                          <div className="mb-4 rounded-full border border-slate-200 bg-white p-4">
                            <Package size={28} className="text-slate-300" />
                          </div>
                          <p className="text-base font-black text-slate-500">No hay productos vinculados.</p>
                          <p className="mt-1 text-sm text-slate-400">Edita la oferta para completar esta configuracion.</p>
                        </div>
                      )}
                      {selectedOfferProductsFeed.hasMore && (
                        <p className="pt-3 text-center text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                          Mostrando {selectedOfferProductsFeed.visibleCount} de {selectedOfferProductsFeed.totalItems}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full min-h-0 flex-col items-center justify-center rounded-[20px] border border-dashed border-green-200 bg-green-50/30 text-center">
                    <div className="mb-4 rounded-full border border-slate-200 bg-white p-4">
                      <TicketPercent size={28} className="text-slate-300" />
                    </div>
                    <p className="text-base font-black text-slate-500">No hay una oferta seleccionada.</p>
                    <p className="mt-1 text-sm text-slate-400">El detalle y los productos vinculados apareceran aqui.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className={extrasTabClass('rewards')}>
          <div className="h-full overflow-hidden p-2 sm:p-2.5 lg:p-3">
            <div className="grid h-full min-h-0 gap-2 xl:grid-cols-[minmax(0,0.95fr)_minmax(340px,1.05fr)]">
              <div className="flex min-h-0 flex-col rounded-[22px] border border-amber-300 bg-amber-50/60 p-2 sm:p-2.5">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <div className="flex shrink-0 items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em]">
                      <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-1 text-amber-800">
                        Total: {formatNumber(rewards.length)}
                      </span>
                    </div>
                    <p className="min-w-0 text-xs font-semibold normal-case tracking-normal text-slate-600">
                      Selecciona un premio para ver su detalle.
                    </p>
                  </div>

                  <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:flex-nowrap">
                    <div className="relative w-full sm:w-[160px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                      <input
                        type="text"
                        placeholder="Buscar premio..."
                        className="w-full rounded-xl border border-amber-200 bg-white py-2 pl-9 pr-3 text-xs font-medium outline-none transition-all focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                        value={rewardsSearch}
                        onChange={(e) => setRewardsSearch(e.target.value)}
                      />
                    </div>
                    <div
                      className="relative w-full sm:w-[150px]"
                      onBlur={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget)) {
                          setIsRewardTypeMenuOpen(false);
                        }
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setIsRewardTypeMenuOpen((current) => !current)}
                        className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${
                          isRewardTypeMenuOpen
                            ? 'border-amber-400 bg-amber-50 text-amber-900 shadow-sm'
                            : 'border-amber-200 bg-white/95 text-slate-700 hover:border-amber-300'
                        }`}
                      >
                        <span>{currentRewardTypeFilterLabel}</span>
                        <ChevronDown
                          size={14}
                          className={`transition-transform ${isRewardTypeMenuOpen ? 'rotate-180 text-amber-700' : 'text-amber-600'}`}
                        />
                      </button>
                      {isRewardTypeMenuOpen && (
                        <div className="absolute right-0 top-[calc(100%+6px)] z-20 w-full overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-xl shadow-amber-900/10">
                          <div className="border-b border-amber-100 bg-amber-50/80 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-amber-700">
                            Filtrar por tipo
                          </div>
                          <div className="p-1.5">
                            {rewardTypeOptions.map((typeOption) => {
                              const isActive = rewardsTypeFilter === typeOption;
                              const optionLabel =
                                typeOption === 'all' ? 'Todos' : typeOption === 'product' ? 'Producto' : 'Descuento';

                              return (
                                <button
                                  key={typeOption}
                                  type="button"
                                  onClick={() => {
                                    setRewardsTypeFilter(typeOption);
                                    setIsRewardTypeMenuOpen(false);
                                  }}
                                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold transition-colors ${
                                    isActive
                                      ? 'bg-amber-700 text-white shadow-sm'
                                      : 'text-slate-600 hover:bg-amber-50 hover:text-amber-900'
                                  }`}
                                >
                                  <span>{optionLabel}</span>
                                  {isActive && <Check size={14} strokeWidth={3} />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                    {!isReadOnly && (
                      <button
                        onClick={openCreateRewardModal}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-700 px-3 py-2 text-xs font-black text-white transition-colors hover:bg-amber-800"
                      >
                        <Plus size={16} strokeWidth={3} />
                        Nuevo
                      </button>
                    )}
                  </div>
                </div>

                {filteredRewards.length === 0 ? (
                  <div className="flex h-[320px] flex-col items-center justify-center rounded-[20px] border border-dashed border-slate-200 bg-white text-center">
                    <div className="mb-4 rounded-full border border-slate-200 bg-slate-50 p-4">
                      <Gift size={28} className="text-slate-300" />
                    </div>
                    <p className="text-base font-black text-slate-500">No hay premios configurados.</p>
                    <p className="mt-1 text-sm text-slate-400">Crea uno nuevo para ver su detalle aqui.</p>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }} onScroll={rewardsFeed.handleScroll}>
                    <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
                    {rewardsFeed.visibleItems.map((reward) => {
                      const isActive = selectedReward?.id === reward.id;

                      return (
                        <div
                          key={reward.id}
                          onClick={() => setSelectedRewardId(reward.id)}
                          className={`flex min-h-[128px] cursor-pointer flex-col rounded-[18px] border px-3 py-3 transition-all ${
                            isActive
                              ? 'border-amber-400 bg-white shadow-sm'
                              : 'border-amber-200 bg-white/85 hover:border-amber-300 hover:bg-white'
                          }`}
                        >
                          <ProductPreviewGrid
                            items={reward.image ? [reward] : []}
                            fallbackIcon={reward.type === 'product' ? Package : Gift}
                            accent={reward.type === 'product' ? 'blue' : 'amber'}
                          />
                          <div className="-mt-1 min-w-0">
                              <p className="truncate text-[13px] font-black text-slate-800">{reward.title}</p>
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.18em] ${
                                  reward.type === 'product'
                                    ? 'border-amber-200 bg-amber-50 text-amber-800'
                                    : 'border-amber-300 bg-amber-100 text-amber-800'
                                }`}>
                                  {reward.type === 'product' ? 'Producto' : 'Descuento'}
                                </span>
                              </div>
                          </div>
                          <p className="mt-3 text-xs text-slate-500">{formatNumber(reward.pointsCost)} puntos</p>
                        </div>
                      );
                    })}
                    </div>
                    {rewardsFeed.hasMore && (
                      <p className="pt-3 text-center text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                        Mostrando {rewardsFeed.visibleCount} de {rewardsFeed.totalItems}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex min-h-0 flex-col rounded-[22px] border border-amber-300 bg-amber-50/45 p-2 sm:p-2.5">
                {selectedReward ? (
                  <div className="flex h-full min-h-0 flex-col">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 pb-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="rounded-lg border border-amber-300 bg-amber-50 p-1.5 text-amber-800">
                            <Gift size={14} />
                          </div>
                          <div>
                            <h3 className="text-base font-black text-slate-900">{selectedReward.title}</h3>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[16px] text-slate-500">
                          {formatNumber(selectedReward.pointsCost)} pts · {selectedReward.type === 'product' ? 'Producto' : 'Descuento'}
                        </p>
                        {!isReadOnly && (
                          <>
                            <button
                              onClick={() => openEditRewardModal(selectedReward)}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-amber-800 transition-colors hover:bg-amber-100"
                            >
                              <Pencil size={12} />
                              Editar
                            </button>
                            <button
                              onClick={() => handleDeleteRewardRequest(selectedReward)}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-red-700 transition-colors hover:bg-red-100"
                            >
                              <Trash2 size={12} />
                              Eliminar
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="mb-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
                      <div className="rounded-2xl border border-amber-300 bg-amber-50 px-3 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">Costo</p>
                        <p className="mt-1 text-sm font-black text-slate-900">{formatNumber(selectedReward.pointsCost)} pts</p>
                      </div>
                      <div className={`rounded-2xl border px-3 py-3 ${
                        selectedReward.type === 'product' ? 'border-amber-200 bg-amber-50' : 'border-amber-300 bg-amber-50'
                      }`}>
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Tipo</p>
                        <p className="mt-1 text-sm font-black text-slate-900">
                          {selectedReward.type === 'product' ? 'Producto' : 'Descuento'}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-amber-200 bg-white/80 px-3 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">Stock</p>
                        <p className="mt-1 text-sm font-black text-slate-900">
                          {selectedReward.type === 'product' ? formatNumber(selectedReward.stock || 0) : 'No aplica'}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-amber-300 bg-amber-50 px-3 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">Valor</p>
                        <p className="mt-1 text-sm font-black text-slate-900">
                          {selectedReward.type === 'discount'
                            ? <FancyPrice amount={Number(selectedReward.discountAmount || 0)} />
                            : 'Canje fisico'}
                        </p>
                      </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto rounded-[20px] border border-amber-200 bg-amber-50/50 p-3 pr-2.5 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="rounded-2xl border border-amber-200 bg-white p-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Estado del premio</p>
                          <p className="mt-2 text-xs font-semibold text-slate-600">
                            {selectedReward.type === 'product'
                              ? 'Premio fisico con control de stock.'
                              : 'Premio financiero para descontar en la compra.'}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-amber-200 bg-white p-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Uso esperado</p>
                          <p className="mt-2 text-xs font-semibold text-slate-600">
                            Disponible para el canje de puntos desde el POS.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full min-h-0 flex-col items-center justify-center rounded-[20px] border border-dashed border-amber-300 bg-amber-50/40 text-center">
                    <div className="mb-4 rounded-full border border-slate-200 bg-white p-4">
                      <Gift size={28} className="text-slate-300" />
                    </div>
                    <p className="text-base font-black text-slate-500">No hay un premio seleccionado.</p>
                    <p className="mt-1 text-sm text-slate-400">El detalle del premio activo aparecera aqui.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div data-test="categories-old" className="hidden">
          <div className="h-full overflow-y-auto p-3 sm:p-4 lg:p-5 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
            <div className="mb-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Categorías activas</p>
                <p className="mt-1 text-lg font-black text-slate-900">{formatNumber(categories.length)}</p>
              </div>
              <div className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-fuchsia-500">Asignaciones</p>
                <p className="mt-1 text-lg font-black text-slate-900">{formatNumber(totalCategoryAssignments)}</p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-500">Modo</p>
                <p className="mt-2 text-lg font-black text-slate-900">{isEditMode ? 'Edición masiva' : 'Gestión rápida'}</p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-500">Última creada</p>
                <p className="mt-2 truncate text-lg font-black text-slate-900">{recentCategoryName || 'Sin novedades'}</p>
              </div>
            </div>

            <div className="mb-4 flex flex-col gap-2 xl:flex-row">
              <form onSubmit={handleSubmitCategory} className="flex-1 flex gap-2">
                <input
                  type="text"
                  placeholder="Nombre de la nueva categoría..."
                  className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium outline-none transition-all focus:bg-white focus:ring-2 focus:ring-fuchsia-500"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                />
                <button
                  type="submit"
                  className="flex items-center gap-2 rounded-lg bg-fuchsia-600 px-4 py-2 font-bold text-white shadow-sm transition-colors hover:bg-fuchsia-700"
                >
                  <Plus size={18} strokeWidth={3} /> Agregar
                </button>
              </form>
              <button
                onClick={() => setIsEditMode(!isEditMode)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 font-bold transition-colors shadow-sm ${
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
              <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-sm font-medium text-amber-700">
                <Pencil size={16} className="shrink-0" />
                <span>
                  Modo edición activo. Haz clic en una categoría para renombrarla o ajustar sus productos.
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-4">
              {orderedCategories.map((cat) => {
                const productCount = productsByCategory[cat]?.length || 0;
                const isRecent = recentCategoryName === cat;

                return (
                  <div
                    key={cat}
                    onClick={() => handleSelectCategory(cat)}
                    className={`group flex justify-between items-center rounded-xl border p-3 transition-all ${
                      isEditMode
                        ? 'bg-amber-50/50 border-amber-200 cursor-pointer hover:bg-amber-100 hover:shadow-sm'
                        : 'bg-slate-50 hover:bg-white hover:shadow-sm border-slate-200'
                    } ${isRecent ? 'ring-2 ring-fuchsia-300 ring-offset-2 ring-offset-white' : ''}`}
                  >
                    <div className="flex flex-col gap-0.5 min-w-0 pr-2">
                      <span className="truncate text-sm font-bold text-slate-800 sm:text-[15px]">{cat}</span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        {productCount} productos
                      </span>
                      {isRecent && (
                        <span className="mt-2 inline-flex w-fit rounded-full border border-fuchsia-200 bg-fuchsia-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-fuchsia-700">
                          Nueva
                        </span>
                      )}
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
        </div>

        {/* VISTA DE OFERTAS Y COMBOS */}
        <div data-test="offers-old" className="hidden">
          <div className="h-full overflow-y-auto p-3 sm:p-4 lg:p-5 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-500">Reglas activas</p>
                <p className="mt-1 text-lg font-black text-slate-900">{formatNumber(offers.length)}</p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-500">Botones POS</p>
                <p className="mt-1 text-lg font-black text-slate-900">{formatNumber(posButtonOffersCount)}</p>
              </div>
              <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-500">Automáticas</p>
                <p className="mt-1 text-lg font-black text-slate-900">{formatNumber(automaticOffersCount)}</p>
              </div>
            </div>

            <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 w-full">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input
                    type="text"
                    placeholder="Buscar oferta, descuento o cupon..."
                    className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm font-medium outline-none shadow-sm transition-all focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                    value={offersSearch}
                    onChange={(e) => setOffersSearch(e.target.value)}
                  />
                </div>
                <button
                  onClick={openNewOfferModal}
                  className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-white flex items-center gap-2 font-bold shadow-sm transition-all active:scale-95 hover:bg-emerald-700"
                >
                  <Plus size={20} strokeWidth={3} />
                  <span className="hidden sm:inline">Nueva Oferta / Descuento</span>
                </button>
              </div>
            </div>

            {filteredOffers.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
                {filteredOffers.map((offer) => (
                  <div 
                    key={offer.id} 
                    className="group flex flex-col overflow-hidden rounded-[18px] border border-gray-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="relative flex h-16 items-center justify-center border-b border-gray-100 bg-slate-50">
                      <TicketPercent size={24} className="text-violet-400" />
                      <div className="absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide bg-violet-100 text-violet-700 border border-violet-200">
                        {offer.type}
                      </div>
                      {offer.applyTo === 'Seleccion' && (
                        <div className="absolute top-2 left-2 text-[9px] font-black px-1.5 py-0.5 rounded uppercase bg-amber-100 text-amber-700 border border-amber-200 shadow-sm">
                          Botón POS
                        </div>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col p-3">
                      <h3 className="mb-1 truncate text-sm font-bold text-gray-800" title={offer.name}>{offer.name}</h3>
                      <div className="mb-2 flex items-center gap-1.5 text-[11px] text-gray-500">
                        <Package size={14} className="text-slate-400" />
                        {offer.productsIncluded.length} productos vinculados
                      </div>
                      {offer.productsIncluded.length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-1">
                          {offer.productsIncluded.slice(0, 3).map((product) => {
                            const accent = getOfferAccent(offer.type);
                            return (
                              <span
                                key={product.id}
                                className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${accent.chip}`}
                                title={product.title}
                              >
                                {product.title}
                              </span>
                            );
                          })}
                          {offer.productsIncluded.length > 3 && (
                            <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-500">
                              +{offer.productsIncluded.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="mt-auto space-y-1.5">
                        {offer.offerPrice > 0 && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-400 font-medium">Precio Final:</span>
                            <span className="font-bold text-emerald-600">${Number(offer.offerPrice).toLocaleString('es-AR')}</span>
                          </div>
                        )}
                        {(offer.canonical?.discountValue || offer.discountValue) > 0 && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-400 font-medium">Descuento:</span>
                            <span className="font-bold text-emerald-600">
                              {offer.canonicalSubtypeLabel === 'Porcentaje'
                                ? `${Number(offer.canonical?.discountValue || offer.discountValue || 0)}%`
                                : `-$${Number(offer.canonical?.discountValue || offer.discountValue || 0).toLocaleString('es-AR')}`}
                            </span>
                          </div>
                        )}
                        {(!offer.offerPrice && !(offer.canonical?.discountValue || offer.discountValue)) && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-400 font-medium">Beneficio:</span>
                            <span className="font-bold text-violet-600">Promo Automática</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-gray-100 bg-gray-50 px-3 py-2">
                      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                        {offer.applyTo === 'Seleccion' ? 'Uso manual en POS' : 'Detección automática'}
                      </span>
                      <div className="flex gap-2">
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
        </div>

        {/* VISTA DE PREMIOS */}
        <div data-test="rewards-old" className="hidden">
          <div className="relative h-full overflow-y-auto p-3 sm:p-4 lg:p-5 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-500">Premios</p>
                <p className="mt-1 text-lg font-black text-slate-900">{formatNumber(rewards.length)}</p>
              </div>
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-500">Productos</p>
                <p className="mt-1 text-lg font-black text-slate-900">{formatNumber(rewardProductCount)}</p>
              </div>
              <div className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-fuchsia-500">Descuentos</p>
                <p className="mt-1 text-lg font-black text-slate-900">{formatNumber(rewardDiscountCount)}</p>
              </div>
            </div>

            <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 w-full">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                  <input
                    type="text"
                    placeholder="Buscar premio..."
                    className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm font-medium outline-none shadow-sm transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    value={rewardsSearch}
                    onChange={(e) => setRewardsSearch(e.target.value)}
                  />
                </div>
                <button
                  onClick={openCreateRewardModal}
                  className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-white flex items-center gap-2 font-bold shadow-sm transition-all active:scale-95 hover:bg-emerald-700"
                >
                  <Plus size={20} strokeWidth={3} />
                  <span className="hidden sm:inline">Nuevo Premio</span>
                </button>
              </div>
            </div>

            {filteredRewards.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
                {filteredRewards.map((reward) => (
                  <div key={reward.id} className="group flex flex-col overflow-hidden rounded-[18px] border border-gray-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                    <div className="relative flex h-16 items-center justify-center border-b border-gray-100 bg-slate-50">
                      {reward.type === 'product' ? (
                        <Package size={24} className="text-blue-400" />
                      ) : (
                        <Tag size={24} className="text-emerald-400" />
                      )}
                      <div className={`absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide border ${
                        reward.type === 'product' ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200'
                      }`}>
                        {reward.type === 'product' ? 'Producto' : 'Descuento'}
                      </div>
                    </div>
                    <div className="flex flex-1 flex-col p-3">
                      <h3 className="mb-1 truncate text-sm font-bold text-gray-800" title={reward.title}>{reward.title}</h3>
                      <p className="mb-2 flex-1 line-clamp-2 text-[11px] text-gray-500" title={reward.description}>
                        {reward.description || 'Sin descripción'}
                      </p>
                      <div className="mt-auto space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-400 font-medium">Costo:</span>
                          <span className="font-bold text-emerald-600">{formatNumber(reward.pointsCost)} pts</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
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
                    <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50 px-3 py-2">
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
        </div>

      </div>

      {/* ==================================================================================== */}
      {/* MODALES FLOTANTES GLOBALES */}
      {/* ==================================================================================== */}
      
      {/* 1. Modal Categoría (Edit) */}
      <CategoryCreateModal
        isOpen={isCreateCategoryModalOpen}
        newCategory={newCategory}
        setNewCategory={setNewCategory}
        createCategoryProductSearch={createCategoryProductSearch}
        setCreateCategoryProductSearch={setCreateCategoryProductSearch}
        selectedProductsForNewCategory={selectedProductsForNewCategory}
        filteredProductsForNewCategory={filteredProductsForNewCategory}
        handleAddProductToNewCategory={handleAddProductToNewCategory}
        handleRemoveProductFromNewCategory={handleRemoveProductFromNewCategory}
        handleCloseCreateCategoryModal={handleCloseCreateCategoryModal}
        handleSubmitCategory={handleSubmitCategory}
      />

      <CategoryEditorModal
        isOpen={isCategoryEditorOpen}
        selectedCategory={selectedCategory}
        editedName={editedName}
        setEditedName={setEditedName}
        showAddProducts={showAddProducts}
        setShowAddProducts={setShowAddProducts}
        productSearch={productSearch}
        setProductSearch={setProductSearch}
        productsByCategory={productsByCategory}
        filteredAvailableProducts={filteredAvailableProducts}
        pendingChanges={pendingChanges}
        hasUnsavedCategoryChanges={hasUnsavedCategoryChanges}
        handleAddProductToCategory={handleAddProductToCategory}
        handleRemoveProductFromCategory={handleRemoveProductFromCategory}
        handleCloseCategoryModal={handleCloseCategoryModal}
        handleSaveCategoryEdit={handleSaveCategoryEdit}
      />

      {selectedCategory === '__legacy__' && isCategoryEditorOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[70] p-4 backdrop-blur-sm"
          onClick={handleCloseCategoryModal}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 bg-orange-50 border-b border-orange-200 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-lg text-orange-600">
                  <Tag size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Editando Categoría</h3>
                  <p className="text-[10px] font-medium text-orange-700/70 uppercase tracking-wider">{selectedCategory}</p>
                </div>
              </div>
              <button
                onClick={handleCloseCategoryModal}
                className="text-orange-400 hover:text-orange-700 bg-orange-100/50 hover:bg-orange-100 p-2 rounded-lg transition-colors"
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
                  className="w-full px-4 py-2.5 border-2 border-slate-200 rounded-xl focus:ring-4 focus:ring-orange-500/25 focus:border-orange-500 outline-none text-base font-bold text-slate-800 transition-all"
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
                        : 'bg-orange-50 text-orange-600 hover:bg-orange-100 border border-orange-200 shadow-sm'
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
                  <div className="mb-4 p-4 bg-orange-50/50 border border-orange-100 rounded-xl animate-in fade-in slide-in-from-top-2">
                    <div className="relative mb-3">
                      <Search
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-orange-400"
                      />
                      <input
                        type="text"
                        placeholder="Buscar producto en el catálogo..."
                        className="w-full pl-9 pr-3 py-2 text-xs font-medium border border-orange-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none"
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
                              className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-slate-100 shadow-sm hover:border-orange-300 hover:shadow transition-all group"
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
                                className="text-orange-600 bg-orange-50 hover:bg-orange-600 hover:text-white p-1.5 rounded-md shrink-0 transition-colors"
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

              {hasUnsavedCategoryChanges && (
                <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-xs font-bold text-orange-700 flex items-center gap-2 animate-pulse">
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
                disabled={!hasUnsavedCategoryChanges}
                className="px-6 py-2.5 rounded-xl font-black text-xs bg-orange-500 text-white hover:bg-orange-600 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-orange-200 transition-all"
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

      <OfferWizardModal
        isOpen={isOfferModalOpen}
        editingOfferId={editingOfferId}
        offerForm={offerForm}
        setOfferForm={setOfferForm}
        offerWizardStep={offerWizardStep}
        steps={OFFER_WIZARD_STEPS}
        canonicalOfferOptions={canonicalOfferOptions}
        offerResolvedProducts={offerResolvedProducts}
        offerCategoryProducts={offerCategoryProducts}
        offerProductSearch={offerProductSearch}
        setOfferProductSearch={setOfferProductSearch}
        availableProductsForOffer={availableProductsForOffer}
        offerModalAvailableFeed={offerModalAvailableFeed}
        offerModalIncludedFeed={offerModalIncludedFeed}
        handleAddProductToOffer={handleAddProductToOffer}
        handleRemoveProductFromOffer={handleRemoveProductFromOffer}
        handleOfferBenefitTypeChange={handleOfferBenefitTypeChange}
        handleOfferScopeChange={handleOfferScopeChange}
        handleAdvanceOfferWizard={handleAdvanceOfferWizard}
        handleSaveOfferWizard={handleSaveOfferWizard}
        closeOfferModal={closeOfferModal}
        setOfferWizardStep={setOfferWizardStep}
        offerWizardGuide={offerWizardGuide}
        offerWizardIsManualMode={offerWizardIsManualMode}
        offerWizardSuggestedOriginalPrice={offerWizardSuggestedOriginalPrice}
        categories={categories}
        productsByCategory={productsByCategory}
      />

      {isOfferModalOpen && editingOfferId === '__legacy_disabled__' && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/70 p-3 backdrop-blur-sm animate-in fade-in">
          <div className="flex h-[90vh] w-full max-w-[1160px] flex-col overflow-hidden rounded-[24px] border border-emerald-300 bg-white shadow-2xl shadow-emerald-950/20 animate-in zoom-in-95 duration-200">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-emerald-300 bg-gradient-to-r from-emerald-700 via-emerald-700 to-emerald-600 px-4 py-3 text-white">
              <div className="flex min-w-0 items-start gap-2.5">
                <div className="rounded-xl border border-white/15 bg-white/10 p-2.5 shadow-inner shadow-black/10">
                  <TicketPercent size={19} />
                </div>
                <div className="min-w-0">
                  <div className="mb-0.5 flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-black tracking-tight">
                      {editingOfferId ? 'Editar Oferta' : 'Nueva Oferta'}
                    </h3>
                    <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-50">
                      {isComboOrPack ? 'Boton POS' : 'Regla automatica'}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-emerald-50/90">
                    Define la regla, configura el beneficio y elige los productos incluidos sin salir del mismo modal.
                  </p>
                </div>
              </div>
              <button
                onClick={closeOfferModal}
                className="rounded-lg border border-white/10 bg-emerald-800/50 p-1.5 text-emerald-100 transition-colors hover:bg-emerald-900/60 hover:text-white"
              >
                <X size={16} strokeWidth={3} />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 gap-2.5 overflow-hidden bg-emerald-50/40 p-2.5 lg:grid-cols-[minmax(280px,0.86fr)_minmax(0,1.14fr)]">
              <div className="min-h-0 overflow-y-auto pr-1 custom-scrollbar">
                <div className="space-y-2">
                  <div className="rounded-[20px] border border-emerald-200 bg-white p-3 shadow-sm">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.17em] text-emerald-700">
                          Identidad de la oferta
                        </p>
                        <p className="text-[11px] font-medium leading-4 text-slate-500">
                          Lo primero es nombrar la regla y definir como va a trabajar.
                        </p>
                      </div>
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-emerald-700">
                        {offerForm.productsIncluded.length} productos
                      </span>
                    </div>

                    <div className="space-y-2">
                      <div>
                        <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                          Nombre visible
                        </label>
                        <input
                          type="text"
                          placeholder="Ej: Promo finde, Combo cumple, 3x2 caramelos..."
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[13px] font-bold text-slate-800 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                          value={offerForm.name}
                          onChange={(e) => setOfferForm({ ...offerForm, name: e.target.value })}
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                          Tipo de regla
                        </label>
                        <select
                          className="w-full cursor-pointer rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[13px] font-bold text-slate-800 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                          value={offerForm.type}
                          onChange={(e) =>
                            setOfferForm({
                              ...offerForm,
                              type: e.target.value,
                              applyTo: ['Combo', 'Kit', 'Pack'].includes(e.target.value) ? 'Seleccion' : 'Items',
                            })
                          }
                        >
                          <optgroup label="Promociones Automaticas">
                            <option value="2x1">2x1 (Lleva 2 paga 1)</option>
                            <option value="3x2">3x2 (Lleva 3 paga 2)</option>
                            <option value="4x3">4x3 (Lleva 4 paga 3)</option>
                          </optgroup>
                          <optgroup label="Armados Especiales (Boton POS)">
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
                  </div>

                  <div className="rounded-[20px] border border-emerald-200 bg-white p-3 shadow-sm">
                    <div className="mb-2 flex items-start gap-2.5">
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-2 text-emerald-700">
                        <AlertCircle size={16} strokeWidth={2.5} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[0.17em] text-emerald-700">
                          Como funciona esta regla
                        </p>
                        <p className="mt-0.5 text-[13px] font-semibold text-slate-800">{offerForm.type}</p>
                        <p className="mt-0.5 text-[13px] leading-[1.3] text-slate-600">{offerTypeGuide}</p>
                      </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2">
                        <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Modo</p>
                        <p className="mt-0.5 text-[13px] font-bold text-slate-800">
                          {isComboOrPack ? 'Seleccion manual en el POS' : 'Aplicacion automatica'}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2">
                        <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Alcance</p>
                        <p className="mt-0.5 text-[13px] font-bold text-slate-800">
                          {offerForm.productsIncluded.length > 0
                            ? `${offerForm.productsIncluded.length} productos seleccionados`
                            : 'Todavia sin productos'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[20px] border border-emerald-200 bg-white p-3 shadow-sm">
                    <div className="mb-2">
                      <p className="text-[10px] font-black uppercase tracking-[0.17em] text-emerald-700">
                        Beneficio y condiciones
                      </p>
                      <p className="text-[11px] font-medium leading-4 text-slate-500">
                        Completa solo los datos que correspondan al tipo de oferta elegido.
                      </p>
                    </div>

                    {isComboOrPack ? (
                      <div className="space-y-2 rounded-[18px] border border-amber-200 bg-amber-50 p-3">
                        <div>
                          <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-amber-800">
                            Precio final del combo
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-amber-600">$</span>
                            <input
                              type="number"
                              placeholder="Ej: 1500"
                              className="w-full rounded-xl border border-amber-300 bg-white py-2 pl-8 pr-3 text-[13px] font-black text-amber-900 outline-none transition-all focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                              value={offerForm.offerPrice}
                              onChange={(e) => setOfferForm({ ...offerForm, offerPrice: e.target.value })}
                            />
                          </div>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="rounded-xl border border-amber-200 bg-white/70 px-2.5 py-2">
                            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-amber-700">Precio regular</p>
                            <p className="mt-0.5 text-base font-black text-amber-900 line-through decoration-red-500/50 decoration-2">
                              ${suggestedOriginalPrice.toLocaleString('es-AR')}
                            </p>
                          </div>
                          <div className="rounded-xl border border-amber-200 bg-white/70 px-2.5 py-2">
                            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-amber-700">Ahorro estimado</p>
                            <p className="mt-0.5 text-base font-black text-emerald-700">
                              {offerForm.offerPrice && Number(offerForm.offerPrice) < suggestedOriginalPrice
                                ? `$${(suggestedOriginalPrice - Number(offerForm.offerPrice)).toLocaleString('es-AR')}`
                                : '$0'}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : offerForm.type === 'Mayorista' ? (
                      <div className="grid gap-2 rounded-[18px] border border-blue-200 bg-blue-50 p-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-blue-800">
                            Cantidad minima
                          </label>
                          <input
                            type="number"
                            placeholder="Ej: 10"
                            className="w-full rounded-xl border border-blue-300 bg-white px-3 py-2 text-[13px] font-black text-blue-900 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                            value={offerForm.itemsCount}
                            onChange={(e) => setOfferForm({ ...offerForm, itemsCount: e.target.value })}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-blue-800">
                            Precio unitario mayorista
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-blue-600">$</span>
                            <input
                              type="number"
                              placeholder="Ej: 800"
                              className="w-full rounded-xl border border-blue-300 bg-white py-2 pl-8 pr-3 text-[13px] font-black text-blue-900 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                              value={offerForm.offerPrice}
                              onChange={(e) => setOfferForm({ ...offerForm, offerPrice: e.target.value })}
                            />
                          </div>
                        </div>
                      </div>
                    ) : offerForm.type === 'Descuento Unidad' || offerForm.type === 'Descuento Total' ? (
                      <div className="rounded-[18px] border border-emerald-200 bg-emerald-50 p-3">
                        <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-emerald-800">
                          Monto a descontar
                        </label>
                        <div className="relative max-w-[220px]">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-emerald-600">$</span>
                          <input
                            type="number"
                            placeholder="Ej: 500"
                            className="w-full rounded-xl border border-emerald-300 bg-white py-2 pl-8 pr-3 text-[13px] font-black text-emerald-900 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                            value={offerForm.discountValue}
                            onChange={(e) => setOfferForm({ ...offerForm, discountValue: e.target.value })}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-[18px] border border-emerald-200 bg-emerald-50/70 p-3">
                        <p className="text-[13px] font-bold text-emerald-900">No necesita configuracion extra.</p>
                        <p className="mt-1 text-[11px] leading-4 text-emerald-800/80">
                          Esta promocion se activa por la cantidad detectada y usa automaticamente los productos que agregues a la derecha.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex min-h-0 flex-col overflow-hidden rounded-[20px] border border-emerald-200 bg-white shadow-sm">
                <div className="shrink-0 border-b border-emerald-200 bg-emerald-50/80 px-3 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.17em] text-emerald-700">
                        Productos de la regla
                      </p>
                      <p className="text-[11px] font-medium leading-4 text-slate-500">
                        {isComboOrPack
                          ? 'Define exactamente que productos forman parte del combo o pack.'
                          : 'Selecciona los productos a los que se les aplicara esta oferta.'}
                      </p>
                    </div>
                    <span className="rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-emerald-700">
                      {offerForm.productsIncluded.length} seleccionados
                    </span>
                  </div>
                </div>

                <div className="grid min-h-0 flex-1 gap-2 p-2 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                  <div className="flex min-h-0 flex-col overflow-hidden rounded-[16px] border border-slate-200 bg-slate-50/70">
                    <div className="shrink-0 border-b border-slate-200 bg-white px-2.5 py-2">
                      <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Buscar en el catalogo..."
                          className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-8 pr-2.5 text-[11px] font-medium outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                          value={offerProductSearch}
                          onChange={(e) => setOfferProductSearch(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto p-2 custom-scrollbar" onScroll={offerModalAvailableFeed.handleScroll}>
                      <div className="space-y-1">
                        {availableProductsForOffer.length > 0 ? (
                          offerModalAvailableFeed.visibleItems.map((product) => (
                            <button
                              key={product.id}
                              type="button"
                              onClick={() => handleAddProductToOffer(product)}
                            className="flex w-full items-center justify-between gap-2 rounded-xl border border-transparent bg-white px-2.5 py-1.5 text-left transition-all hover:border-emerald-200 hover:bg-emerald-50"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              {product.image ? (
                                <img
                                  src={product.image}
                                  alt={product.title}
                                  className="h-9 w-9 rounded-lg object-cover ring-1 ring-slate-200"
                                />
                              ) : (
                                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-400 ring-1 ring-slate-200">
                                    <Package size={15} />
                                  </div>
                              )}
                              <div className="min-w-0">
                                  <p className="truncate text-[12px] font-bold text-slate-800">{product.title}</p>
                                  <p className="text-[10px] font-semibold leading-4 text-slate-400">${formatNumber(Number(product.price || 0))}</p>
                                </div>
                              </div>
                              <PlusCircle size={16} className="shrink-0 text-emerald-500" />
                            </button>
                          ))
                        ) : (
                          <div className="flex h-full min-h-[220px] items-center justify-center px-6 text-center text-sm font-medium text-slate-400">
                            {offerProductSearch ? 'No hay resultados para esa busqueda.' : 'No quedan productos disponibles para agregar.'}
                          </div>
                        )}
                      </div>

                      {offerModalAvailableFeed.hasMore && (
                        <p className="pt-3 text-center text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                          Mostrando {offerModalAvailableFeed.visibleCount} de {offerModalAvailableFeed.totalItems}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex min-h-0 flex-col overflow-hidden rounded-[16px] border border-emerald-200 bg-emerald-50/40">
                    <div className="shrink-0 border-b border-emerald-200 bg-white/70 px-2.5 py-2">
                      <div className="mb-0.5 flex items-center justify-between gap-2">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">Incluidos en la oferta</p>
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-emerald-700">
                          {offerForm.productsIncluded.length}
                        </span>
                      </div>
                      <p className="text-[11px] font-medium leading-4 text-emerald-800/80">
                        {isComboOrPack
                          ? 'Este sera el armado exacto que vera el cajero.'
                          : 'Estos productos activaran la regla cuando se cumpla la condicion.'}
                      </p>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto p-2 custom-scrollbar" onScroll={offerModalIncludedFeed.handleScroll}>
                      <div className="space-y-1">
                        {offerForm.productsIncluded.length > 0 ? (
                          offerModalIncludedFeed.visibleItems.map((product) => (
                            <div
                              key={product.id}
                              className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-white px-2.5 py-1.5 shadow-sm"
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                {product.image ? (
                                  <img
                                    src={product.image}
                                    alt={product.title}
                                    className="h-9 w-9 rounded-lg object-cover ring-1 ring-emerald-100"
                                  />
                                ) : (
                                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100/70 text-emerald-500 ring-1 ring-emerald-200">
                                    <Package size={15} />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className="truncate text-[12px] font-bold text-slate-800">{product.title}</p>
                                  <p className="text-[10px] font-semibold leading-4 text-slate-400">
                                    {isComboOrPack
                                      ? `$${formatNumber(Number(product.price || 0))} precio base`
                                      : 'Producto incluido en la regla'}
                                  </p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveProductFromOffer(product.id)}
                                className="rounded-lg border border-transparent bg-slate-50 p-1.5 text-slate-300 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-500"
                              >
                                <MinusCircle size={14} />
                              </button>
                            </div>
                          ))
                        ) : (
                          <div className="flex h-full min-h-[220px] flex-col items-center justify-center px-6 text-center">
                            <div className="mb-2.5 rounded-full border border-emerald-200 bg-white p-3 text-emerald-400">
                              <List size={20} />
                            </div>
                            <p className="text-[13px] font-bold text-emerald-900">Todavia no hay productos incluidos.</p>
                            <p className="mt-1 max-w-xs text-[11px] leading-4 text-emerald-800/75">
                              Haz clic en los productos del catalogo para sumarlos a esta oferta.
                            </p>
                          </div>
                        )}
                      </div>

                      {offerModalIncludedFeed.hasMore && (
                        <p className="pt-3 text-center text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                          Mostrando {offerModalIncludedFeed.visibleCount} de {offerModalIncludedFeed.totalItems}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-4">
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                {editingOfferId ? 'Editando registro existente' : 'Creando nuevo registro'}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={closeOfferModal}
                  className="rounded-xl px-5 py-2.5 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveOffer}
                  className="flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-black text-white shadow-lg shadow-emerald-200 transition-all hover:bg-emerald-700"
                >
                  <Save size={16} strokeWidth={3} />
                  Guardar Oferta
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Modal de Crear/Editar Ofertas */}
      {isOfferModalOpen && offerForm.type === '__legacy_disabled__' && (
        <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center z-[70] p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[95vh] flex flex-col animate-in zoom-in-95 duration-200">
            
            {/* Header Modal Oferta */}
            <div className="p-5 bg-green-700 border-b border-green-800 flex justify-between items-center shrink-0 text-white">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-600 rounded-lg shadow-inner">
                  <TicketPercent size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-base">{editingOfferId ? 'Editar Oferta/Combo' : 'Nueva Oferta Especial'}</h3>
                  <p className="text-[11px] font-medium text-emerald-200">Configura reglas automáticas para el Punto de Venta.</p>
                </div>
              </div>
              <button
                onClick={closeOfferModal}
                className="text-green-200 hover:text-white bg-green-800/50 hover:bg-green-800 p-2 rounded-lg transition-colors"
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
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-green-500 outline-none text-sm font-bold text-slate-800 bg-white"
                    value={offerForm.name}
                    onChange={(e) => setOfferForm({...offerForm, name: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-black text-slate-500 uppercase tracking-wider block mb-1.5">Tipo de Regla</label>
                  <select
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-green-500 outline-none text-sm font-bold text-slate-800 bg-white cursor-pointer"
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
                      <List size={14} className="text-emerald-500" />
                      Productos Aplicables a la Regla
                    </label>
                    <p className="text-[10px] font-medium text-slate-500 mt-0.5">
                      {isComboOrPack ? 'Agrega los productos que componen este paquete exacto.' : 'Agrega los productos a los que se les aplicará esta promoción.'}
                    </p>
                  </div>
                  <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg text-xs font-black self-start sm:self-auto shrink-0">
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
                          className="w-full pl-8 pr-2 py-1.5 text-xs font-medium border border-slate-200 rounded-lg focus:border-emerald-500 outline-none"
                          value={offerProductSearch}
                          onChange={(e) => setOfferProductSearch(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1" onScroll={offerModalAvailableFeed.handleScroll}>
                      {availableProductsForOffer.length > 0 ? (
                        offerModalAvailableFeed.visibleItems.map(p => (
                          <div key={p.id} className="flex justify-between items-center p-2 rounded-lg hover:bg-emerald-50 border border-transparent hover:border-emerald-100 transition-colors group cursor-pointer" onClick={() => handleAddProductToOffer(p)}>
                            <div className="min-w-0 pr-2">
                              <p className="text-xs font-bold text-slate-700 truncate">{p.title}</p>
                              <p className="text-[9px] text-slate-400 font-medium">${p.price}</p>
                            </div>
                            <PlusCircle size={16} className="text-emerald-400 group-hover:text-emerald-600 shrink-0" />
                          </div>
                        ))
                      ) : (
                        <div className="h-full flex items-center justify-center text-xs text-slate-400 font-medium">Sin resultados</div>
                      )}
                      {offerModalAvailableFeed.hasMore && (
                        <p className="pt-2 text-center text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                          Mostrando {offerModalAvailableFeed.visibleCount} de {offerModalAvailableFeed.totalItems}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Lista de Seleccionados */}
                  <div className="flex flex-col border-2 border-dashed border-emerald-200 rounded-xl bg-emerald-50/30 overflow-hidden">
                    <div className="p-2 border-b border-emerald-100 bg-emerald-50 flex items-center justify-center">
                      <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Incluidos en la Oferta</span>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1.5" onScroll={offerModalIncludedFeed.handleScroll}>
                      {offerForm.productsIncluded.length > 0 ? (
                        offerModalIncludedFeed.visibleItems.map(p => (
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
                        <div className="h-full flex flex-col items-center justify-center text-xs text-emerald-400/60 font-medium p-4 text-center">
                          <Package size={24} className="mb-2 opacity-50" />
                          Haz clic en los productos de la izquierda para agregarlos a esta regla.
                        </div>
                      )}
                      {offerModalIncludedFeed.hasMore && (
                        <p className="pt-2 text-center text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                          Mostrando {offerModalIncludedFeed.visibleCount} de {offerModalIncludedFeed.totalItems}
                        </p>
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
                  className="px-6 py-2.5 rounded-xl font-black text-xs bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-2 shadow-lg shadow-emerald-200 transition-all"
                >
                  <Save size={16} strokeWidth={3} />
                  Guardar Oferta
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isRewardModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3">
          <div className="flex h-[90vh] w-full max-w-[1180px] flex-col overflow-hidden rounded-[24px] border border-amber-300 bg-white shadow-2xl shadow-amber-950/10 animate-in fade-in zoom-in duration-200">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-amber-300 bg-gradient-to-r from-amber-700 via-amber-700 to-amber-600 px-4 py-3 text-white">
              <div className="flex min-w-0 items-start gap-3">
                <div className="rounded-xl border border-white/15 bg-white/10 p-2.5 shadow-inner shadow-black/10">
                  <Gift size={20} />
                </div>
                <div className="min-w-0">
                  <div className="mb-0.5 flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-black tracking-tight">
                      {rewardModalMode === 'create' ? 'Nuevo Premio' : 'Editar Premio'}
                    </h3>
                    <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-amber-50">
                      {rewardForm.type === 'product' ? 'Canje fisico' : 'Descuento'}
                    </span>
                  </div>
                  <p className="text-xs font-medium leading-4 text-amber-50/90">
                    Configura el premio, define su costo en puntos y deja clara la recompensa que recibira el cliente.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRewardModalOpen(false)}
                className="rounded-lg border border-white/10 bg-amber-800/50 p-1.5 text-amber-100 transition-colors hover:bg-amber-900/60 hover:text-white"
              >
                <X size={16} strokeWidth={3} />
              </button>
            </div>

            <form onSubmit={handleSaveReward} className="grid min-h-0 flex-1 gap-2 overflow-hidden bg-amber-50/40 p-2.5 lg:grid-cols-[minmax(300px,0.9fr)_minmax(0,1.1fr)]">
              <div className="min-h-0 overflow-y-auto pr-1 custom-scrollbar">
                <div className="space-y-2.5">
                  <div className="rounded-[20px] border border-amber-200 bg-white p-3 shadow-sm">
                    <div className="mb-2">
                      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">
                        Identidad del premio
                      </p>
                      <p className="text-[11px] font-medium leading-4 text-slate-500">
                        Nombre claro y descripcion breve para que el canje se entienda rapido en caja.
                      </p>
                    </div>

                    <div className="space-y-2.5">
                      <div>
                        <label className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500">
                          Nombre del premio
                        </label>
                        <input
                          type="text"
                          required
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[13px] font-bold text-slate-800 outline-none transition-all focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                          placeholder="Ej: Voucher $500, Coca Cola, etc."
                          value={rewardForm.title}
                          onChange={(e) => setRewardForm({ ...rewardForm, title: e.target.value })}
                          autoFocus
                        />
                      </div>

                      <div>
                        <label className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500">
                          Descripcion / notas
                        </label>
                        <textarea
                          rows="3"
                          className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[13px] font-medium leading-5 text-slate-700 outline-none transition-all focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                          placeholder="Ej: Valido para compras mayores a $10.000 o detalles del producto fisico..."
                          value={rewardForm.description}
                          onChange={(e) => setRewardForm({ ...rewardForm, description: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[20px] border border-amber-200 bg-white p-3 shadow-sm">
                    <div className="mb-2">
                      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">
                        Tipo de recompensa
                      </p>
                      <p className="text-[11px] font-medium leading-4 text-slate-500">
                        Elige si el premio entrega un producto fisico o un descuento financiero.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setRewardForm({ ...rewardForm, type: 'product' })}
                        className={`rounded-xl border px-3 py-2.5 text-left transition-all ${
                          rewardForm.type === 'product'
                            ? 'border-amber-300 bg-amber-50 text-amber-900 shadow-sm'
                            : 'border-slate-200 bg-white text-slate-500 hover:border-amber-200 hover:bg-amber-50/50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Package size={18} />
                          <span className="text-[13px] font-black">Producto</span>
                        </div>
                        <p className="mt-1.5 text-[10px] font-medium leading-4">
                          Descuenta stock y entrega un articulo canjeable.
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setRewardForm({ ...rewardForm, type: 'discount' })}
                        className={`rounded-xl border px-3 py-2.5 text-left transition-all ${
                          rewardForm.type === 'discount'
                            ? 'border-amber-300 bg-amber-50 text-amber-900 shadow-sm'
                            : 'border-slate-200 bg-white text-slate-500 hover:border-amber-200 hover:bg-amber-50/50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Tag size={18} />
                          <span className="text-[13px] font-black">Descuento</span>
                        </div>
                        <p className="mt-1.5 text-[10px] font-medium leading-4">
                          Aplica un monto fijo al total de la venta.
                        </p>
                      </button>
                    </div>
                  </div>

                  <div className="rounded-[20px] border border-amber-200 bg-white p-3 shadow-sm">
                    <div className="mb-2">
                      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">
                        Valor del canje
                      </p>
                      <p className="text-[11px] font-medium leading-4 text-slate-500">
                        Define cuantos puntos cuesta y que obtiene el cliente al canjearlo.
                      </p>
                    </div>

                    <div className="grid gap-2.5 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500">
                          Costo en puntos
                        </label>
                        <input
                          type="number"
                          min="1"
                          required
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[13px] font-black text-amber-700 outline-none transition-all focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                          placeholder="0"
                          value={rewardForm.pointsCost}
                          onChange={(e) => setRewardForm({ ...rewardForm, pointsCost: e.target.value })}
                        />
                      </div>

                      {rewardForm.type === 'product' ? (
                        <div>
                          <label className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500">
                            Stock disponible
                          </label>
                          <input
                            type="number"
                            min="0"
                            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[13px] font-black text-slate-800 outline-none transition-all focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                            placeholder="Cantidad"
                            value={rewardForm.stock}
                            onChange={(e) => setRewardForm({ ...rewardForm, stock: e.target.value })}
                          />
                        </div>
                      ) : (
                        <div>
                          <label className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-slate-500">
                            Monto del descuento
                          </label>
                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-amber-700">$</span>
                            <input
                              type="number"
                              min="1"
                              className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-8 pr-4 text-[13px] font-black text-amber-700 outline-none transition-all focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                              placeholder="0"
                              value={rewardForm.discountAmount}
                              onChange={(e) => setRewardForm({ ...rewardForm, discountAmount: e.target.value })}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex min-h-0 flex-col overflow-hidden rounded-[20px] border border-amber-200 bg-white shadow-sm">
                <div className="shrink-0 border-b border-amber-200 bg-amber-50/80 px-3 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">
                        Vista previa del canje
                      </p>
                      <p className="text-[11px] font-medium leading-4 text-slate-500">
                        Asi se interpreta este premio dentro del sistema de puntos.
                      </p>
                    </div>
                    <span className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-amber-700">
                      {rewardForm.type === 'product' ? 'Fisico' : 'Financiero'}
                    </span>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-2.5 custom-scrollbar">
                  <div className="space-y-2.5">
                    <div className="rounded-[20px] border border-amber-200 bg-amber-50/70 p-3">
                      <div className="flex items-start gap-2.5">
                        <div className="rounded-xl border border-amber-200 bg-white p-2.5 text-amber-700">
                          {rewardForm.type === 'product' ? <Package size={20} /> : <Gift size={20} />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[15px] font-black text-slate-900">
                            {rewardForm.title?.trim() || 'Nombre del premio'}
                          </p>
                          <p className="mt-1 text-[13px] leading-4 text-slate-600">
                            {rewardForm.description?.trim() || 'La descripcion aparecera aqui para ayudarte a validar el canje antes de guardarlo.'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="rounded-xl border border-amber-200 bg-white p-2.5">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">Costo</p>
                        <p className="mt-0.5 text-base font-black text-slate-900">
                          {formatNumber(Number(rewardForm.pointsCost || 0))} pts
                        </p>
                      </div>
                      <div className="rounded-xl border border-amber-200 bg-white p-2.5">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">Tipo</p>
                        <p className="mt-0.5 text-base font-black text-slate-900">
                          {rewardForm.type === 'product' ? 'Producto' : 'Descuento'}
                        </p>
                      </div>
                    </div>

                    {rewardForm.type === 'product' ? (
                      <div className="rounded-xl border border-amber-200 bg-white p-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">Entrega estimada</p>
                        <p className="mt-1.5 text-[13px] font-semibold leading-4 text-slate-700">
                          El POS entregara un producto fisico y controlara el stock disponible.
                        </p>
                        <div className="mt-2.5 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2">
                          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-700">Stock actual</p>
                          <p className="mt-0.5 text-[13px] font-black text-slate-900">
                            {formatNumber(Number(rewardForm.stock || 0))} unidades
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-amber-200 bg-white p-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700">Descuento aplicado</p>
                        <p className="mt-1.5 text-[13px] font-semibold leading-4 text-slate-700">
                          El premio ingresara al POS como un descuento financiero listo para descontar del total.
                        </p>
                        <div className="mt-2.5 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2">
                          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-700">Valor del descuento</p>
                          <p className="mt-0.5 text-[13px] font-black text-slate-900">
                            <FancyPrice amount={Number(rewardForm.discountAmount || 0)} />
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="rounded-xl border border-dashed border-amber-200 bg-white/80 p-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Lectura operativa</p>
                      <p className="mt-1.5 text-[13px] leading-5 text-slate-600">
                        {rewardForm.type === 'product'
                          ? 'Ideal para productos concretos, regalos o consumibles con stock controlado.'
                          : 'Ideal para vouchers, bonificaciones o descuentos fijos en el cierre de venta.'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-2.5">
                  <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                    {rewardModalMode === 'create' ? 'Creando nuevo premio' : 'Editando premio existente'}
                  </span>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setIsRewardModalOpen(false)}
                      className="rounded-xl px-5 py-2.5 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-100"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="flex items-center gap-2 rounded-xl bg-amber-700 px-6 py-2.5 text-xs font-black text-white shadow-lg shadow-amber-200 transition-all hover:bg-amber-800"
                    >
                      <Save size={16} strokeWidth={3} />
                      {rewardModalMode === 'create' ? 'Crear Premio' : 'Guardar Cambios'}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Modal de Crear/Editar Premio */}
      {isRewardModalOpen && rewardModalMode === '__legacy_disabled__' && (
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



