import React, { useRef, useState } from 'react';
import {
  ChevronDown,
  Filter,
  Hash,
  Info,
  Image as ImageIcon,
  Layers3,
  MinusCircle,
  Package,
  PlusCircle,
  Save,
  Search,
  ShieldCheck,
  TicketPercent,
  X,
} from 'lucide-react';
import { FancyPrice } from './FancyPrice';
import { getCanonicalOfferSubtypeLabel, getCanonicalOfferTypeLabel, getComboProductLineDisplay } from '../utils/offerHelpers';
import { getProductImageUrl } from '../utils/productImages';
import { normalizeFinalSalePrice } from '../utils/finalSalePrice';

const compactInputClass =
  'h-8 w-full rounded-md border border-slate-300 bg-white px-2.5 text-[12px] font-bold text-slate-800 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20';

function ChipButton({ active, disabled = false, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-8 rounded-md border px-2.5 text-[11px] font-black transition-all ${
        active
          ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
          : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700'
      } ${disabled ? 'cursor-not-allowed opacity-45 hover:border-slate-200 hover:bg-white hover:text-slate-600' : ''}`}
    >
      {children}
    </button>
  );
}

function RuleSwitch({ checked, disabled = false, onChange, label, description }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange?.(!checked)}
      disabled={disabled}
      className={`flex min-h-[36px] items-center justify-between gap-3 rounded-md border px-2.5 py-1.5 text-left transition-all ${
        checked
          ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
      } ${disabled ? 'cursor-not-allowed opacity-65' : ''}`}
    >
      <span className="min-w-0">
        <span className="block text-[11px] font-black leading-tight">{label}</span>
        {description ? <span className="sr-only">{description}</span> : null}
      </span>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${
          checked ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300 bg-slate-200'
        }`}
      >
        <span
          className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-[18px]' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}

function BuilderSection({ step, icon: Icon, title, status = 'ready', children }) {
  const tone =
    status === 'warning'
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : status === 'danger'
      ? 'border-red-200 bg-red-50 text-red-700'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700';
  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex min-h-[42px] items-center justify-between gap-2 border-b border-slate-100 px-2.5 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[10px] font-black ${tone}`}>
            {Icon ? <Icon size={13} strokeWidth={3} /> : step}
          </span>
          <h4 className="truncate text-[11px] font-black uppercase tracking-[0.08em] text-slate-800">{title}</h4>
        </div>
      </div>
      <div className="p-2.5">{children}</div>
    </section>
  );
}

function formatProductStock(product) {
  const stock = Number(product?.stock);
  if (!Number.isFinite(stock)) return 'Stock s/d';
  if (product?.product_type === 'weight') {
    if (stock >= 1000) return `Stock ${(stock / 1000).toLocaleString('es-AR', { maximumFractionDigits: 2 })} kg`;
    return `Stock ${stock.toLocaleString('es-AR')} g`;
  }
  return `Stock ${stock.toLocaleString('es-AR')} u.`;
}

function getProductStatus(product) {
  const stock = Number(product?.stock);
  const isWeight = product?.product_type === 'weight';

  if (!Number.isFinite(stock)) {
    return {
      label: 'Stock sin dato',
      bar: 'bg-slate-300',
      dot: 'bg-slate-300',
      chip: 'border-slate-200 bg-slate-50 text-slate-500',
    };
  }

  if (stock <= 0) {
    return {
      label: 'Sin stock',
      bar: 'bg-red-500',
      dot: 'bg-red-500',
      chip: 'border-red-200 bg-red-50 text-red-700',
    };
  }

  const lowLimit = isWeight ? 500 : 5;
  if (stock <= lowLimit) {
    return {
      label: 'Stock bajo',
      bar: 'bg-amber-500',
      dot: 'bg-amber-500',
      chip: 'border-amber-200 bg-amber-50 text-amber-700',
    };
  }

  return {
    label: 'Disponible',
    bar: 'bg-emerald-500',
    dot: 'bg-emerald-500',
    chip: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  };
}

function ProductRow({
  product,
  subtitle,
  onAdd,
  onRemove,
  removable = true,
  onQuantityChange,
  showQuantityControls = false,
  showComboPricing = false,
  selected = false,
  showStock = true,
  onPreviewEnter,
  onPreviewLeave,
}) {
  const isWeight = product.product_type === 'weight';
  const quantityValue = Number(product.quantity ?? product.qty ?? (isWeight ? 1000 : 1)) || (isWeight ? 1000 : 1);
  const lineDisplay = getComboProductLineDisplay(product);
  const stockLabel = formatProductStock(product);
  const productStatus = getProductStatus(product);
  const titleBlockClass = showStock
    ? 'grid min-w-0 gap-1 md:grid-cols-[minmax(0,1fr)_auto] md:items-center'
    : 'grid min-w-0 gap-1 md:grid-cols-[minmax(0,1fr)_auto] md:items-center';
  const compactLineValue = showComboPricing ? (
    <span>Total: <FancyPrice amount={lineDisplay.totalAmount} /></span>
  ) : subtitle ? (
    <span>{subtitle}</span>
  ) : null;

  return (
    <div
      onMouseEnter={(event) => onPreviewEnter?.(product, event.currentTarget.getBoundingClientRect())}
      onMouseLeave={onPreviewLeave}
      className={`group relative grid min-h-[40px] grid-cols-[3px_minmax(0,1fr)_auto] items-center gap-2 border-b py-1.5 pl-0 pr-2 transition-all duration-150 ease-out animate-in fade-in slide-in-from-bottom-1 last:border-b-0 hover:bg-slate-50 ${
        selected
          ? 'border-slate-100 bg-white'
          : 'border-slate-100 bg-white'
      }`}
    >
      <span className={`h-full min-h-[28px] w-[3px] rounded-r-full ${productStatus.bar}`} title={productStatus.label} />
      <div className={titleBlockClass}>
        <div className="relative min-w-0">
          <p className="truncate text-[12px] font-bold leading-tight text-slate-800">{product.title}</p>
          <div className="pointer-events-none absolute left-0 top-[calc(100%+7px)] z-50 hidden max-w-[360px] rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-black text-slate-800 shadow-lg shadow-slate-950/10 group-hover:block">
            {product.title}
          </div>
        </div>
        {showQuantityControls ? (
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[9px] font-bold text-slate-500 md:justify-end">
            <label className="flex h-6 max-w-[112px] items-center gap-1 rounded-md border border-emerald-200 bg-white px-1.5">
              <span className="text-[8px] font-black uppercase tracking-[0.08em] text-emerald-700">
                {isWeight ? 'g' : 'u.'}
              </span>
              <input
                type="number"
                min="1"
                step="1"
                value={quantityValue}
                onChange={(event) => onQuantityChange?.(product.id, event.target.value)}
                className="w-full min-w-0 bg-transparent text-[11px] font-black text-emerald-900 outline-none"
              />
            </label>
            <span className="rounded border border-emerald-100 bg-white px-1.5 py-0.5 text-emerald-700">{lineDisplay.quantityLabel}</span>
            {showStock ? <span className={`rounded border px-1.5 py-0.5 ${productStatus.chip}`}>{stockLabel}</span> : null}
            <span><FancyPrice amount={lineDisplay.totalAmount} /></span>
          </div>
        ) : !showStock ? (
          compactLineValue ? (
            <div className="min-w-0 text-right text-[10px] font-black leading-4 text-slate-600">
              {compactLineValue}
            </div>
          ) : null
        ) : showComboPricing ? (
          <div className="flex min-w-0 flex-wrap items-center gap-1 text-[9px] font-bold text-slate-500 md:justify-end">
            <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-slate-700">{lineDisplay.quantityLabel}</span>
            {showStock ? <span className={`rounded border px-1.5 py-0.5 ${productStatus.chip}`}>{stockLabel}</span> : null}
            <span>Total: <FancyPrice amount={lineDisplay.totalAmount} /></span>
          </div>
        ) : (
          <div className={`flex min-w-0 flex-wrap items-center gap-1 text-[10px] font-semibold leading-4 text-slate-400 ${showStock ? 'md:justify-end' : ''}`}>
            <span className="truncate">{subtitle}</span>
            {showStock ? (
              <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-bold ${productStatus.chip}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${productStatus.dot}`} />
                {stockLabel}
              </span>
            ) : null}
          </div>
        )}
      </div>

      {onAdd ? (
        <button
          type="button"
          onClick={() => onAdd(product)}
          className="rounded-md border border-transparent bg-slate-50 p-1.5 text-emerald-500 transition-all hover:scale-105 hover:border-emerald-200 hover:bg-emerald-50 active:scale-95"
          title="Agregar"
        >
          <PlusCircle size={15} />
        </button>
      ) : null}

      {onRemove && removable ? (
        <button
          type="button"
          onClick={() => onRemove(product.id)}
          className="rounded-md border border-transparent bg-white/70 p-1.5 text-slate-300 transition-all hover:scale-105 hover:border-red-200 hover:bg-red-50 hover:text-red-500 active:scale-95"
          title="Quitar"
        >
          <MinusCircle size={14} />
        </button>
      ) : null}
    </div>
  );
}

export function OfferWizardModal({
  isOpen,
  editingOfferId,
  offerForm,
  setOfferForm,
  canonicalOfferOptions,
  offerResolvedProducts,
  offerProductSearch,
  setOfferProductSearch,
  offerProductCategoryFilter = 'all',
  setOfferProductCategoryFilter,
  availableProductsForOffer,
  offerModalAvailableFeed,
  offerModalIncludedFeed,
  handleAddProductToOffer,
  handleRemoveProductFromOffer,
  handleUpdateProductQuantityInOffer,
  handleOfferBenefitTypeChange,
  handleSaveOfferWizard,
  closeOfferModal,
  offerWizardSuggestedOriginalPrice,
  categories,
}) {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const [categoryMenuSearch, setCategoryMenuSearch] = useState('');
  const [productImagePreview, setProductImagePreview] = useState(null);
  const [productImageLightbox, setProductImageLightbox] = useState(null);
  const previewHideTimeoutRef = useRef(null);

  if (!isOpen) return null;

  const subtypeLabel = getCanonicalOfferSubtypeLabel(offerForm);
  const isCoupon = offerForm.benefitType === 'coupon';
  const isDiscount = offerForm.benefitType === 'discount';
  const isWholesale = offerForm.benefitType === 'wholesale';
  const isCombo = offerForm.benefitType === 'combo' || offerForm.benefitType === 'fixed_price';
  const isFree = offerForm.benefitType === 'free';
  const manualSelection = offerForm.scopeMode === 'products' || isCombo;
  const canRemoveItems = offerForm.scopeMode === 'products';
  const expiresAfter =
    offerForm.receivedCodeExpiresAfter && typeof offerForm.receivedCodeExpiresAfter === 'object'
      ? offerForm.receivedCodeExpiresAfter
      : { value: '', unit: 'days' };
  const maxUsesPerClient = Number(offerForm.maxUsesPerClient || 0);
  const globalUsageLimit = Number(offerForm.globalUsageLimit || 0);
  const requiresClient = Boolean(offerForm.requiresClient || maxUsesPerClient > 0);
  const hasFutureRules = maxUsesPerClient > 0 || Number(expiresAfter.value || 0) > 0 || globalUsageLimit > 0 || offerForm.stackable === false || requiresClient;

  const missingRuleParts = [
    !offerForm.name.trim() ? 'Nombre' : null,
    isCoupon && !String(offerForm.couponCode || '').trim() ? 'Codigo' : null,
    (isCoupon || isDiscount) && !Number(offerForm.discountValue) ? 'Valor' : null,
    (isCombo || isWholesale) && !Number(offerForm.offerPrice) ? 'Precio' : null,
    !isCoupon && offerForm.scopeMode === 'products' && offerResolvedProducts.length === 0 ? 'Productos' : null,
  ].filter(Boolean);
  const isReady = missingRuleParts.length === 0;
  const statusTone = isReady ? 'success' : 'warning';
  const statusLabel = isReady ? 'Lista para guardar' : `Falta ${missingRuleParts.join(', ')}`;

  const benefitValue = (() => {
    if (isFree) return offerForm.freeMode || '2x1';
    if (isCoupon || isDiscount) {
      return offerForm.discountMode === 'percentage'
        ? `${Number(offerForm.discountValue || 0)}%`
        : <FancyPrice amount={Number(offerForm.discountValue || 0)} />;
    }
    if (isWholesale) return <FancyPrice amount={Number(offerForm.offerPrice || 0)} />;
    if (isCombo) return <FancyPrice amount={Number(offerForm.offerPrice || 0)} />;
    return 'Sin beneficio';
  })();

  const scopeLabel = isCoupon
    ? 'Codigo manual'
    : offerForm.scopeMode === 'all_products'
    ? 'Todo el inventario'
    : offerForm.scopeMode === 'category'
    ? offerForm.categoryName || 'Categoria pendiente'
    : `${offerResolvedProducts.length} productos`;
  const includedCountLabel = offerResolvedProducts.length === 1 ? '1 producto' : `${offerResolvedProducts.length} productos`;
  const productModeLabel = isCoupon
    ? 'Sin productos'
    : manualSelection
    ? 'Seleccion manual'
    : offerForm.scopeMode === 'category'
    ? 'Por categoria'
    : 'Todo inventario';
  const productHelpText = isCoupon
    ? 'El cupon se aplica por codigo.'
    : manualSelection
    ? 'Busca por nombre o categoria y agrega desde el catalogo.'
    : 'El alcance se calcula solo desde la oferta elegida.';
  const currentCategoryLabel = offerProductCategoryFilter === 'all' ? 'Todas las categorias' : offerProductCategoryFilter;
  const visibleCategoryOptions = categories.filter((categoryName) =>
    String(categoryName || '').toLowerCase().includes(categoryMenuSearch.trim().toLowerCase())
  );

  const clearPreviewHide = () => {
    if (previewHideTimeoutRef.current) {
      clearTimeout(previewHideTimeoutRef.current);
      previewHideTimeoutRef.current = null;
    }
  };

  const schedulePreviewHide = () => {
    clearPreviewHide();
    previewHideTimeoutRef.current = setTimeout(() => setProductImagePreview(null), 120);
  };

  const showProductImagePreview = (product, rect) => {
    const image = getProductImageUrl(product, { preferOriginal: true }) || getProductImageUrl(product);
    clearPreviewHide();
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 720;
    const previewWidth = 180;
    const previewHeight = 176;
    const preferredLeft = rect.right + 12;
    const left = Math.min(Math.max(12, preferredLeft), viewportWidth - previewWidth - 12);
    const top = Math.min(Math.max(12, rect.top - 18), viewportHeight - previewHeight - 12);

    setProductImagePreview({
      product,
      image,
      left,
      top,
      width: previewWidth,
    });
  };

  const updateExpiry = (patch) =>
    setOfferForm({
      ...offerForm,
      receivedCodeExpiresAfter: {
        value: expiresAfter.value || '',
        unit: expiresAfter.unit || 'days',
        ...patch,
      },
    });

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/72 p-3 backdrop-blur-sm">
      <div className="flex h-[88vh] w-full max-w-[1220px] flex-col overflow-hidden rounded-[14px] border border-slate-300 bg-white shadow-2xl shadow-slate-950/20">
        <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700">
              <TicketPercent size={15} />
            </div>
            <div className="min-w-0">
              <div className="flex min-h-[32px] flex-col justify-center">
                <h3 className="truncate text-[14px] font-black leading-4 text-slate-900">
                  {editingOfferId ? 'Editar oferta comercial' : 'Nueva oferta comercial'}
                </h3>
                <p className="mt-0.5 truncate text-[11px] font-semibold leading-4 text-slate-500">
                  Beneficio, alcance y limites de uso.
                </p>
              </div>
            </div>
          </div>

          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700 md:inline-flex">
              {getCanonicalOfferTypeLabel(offerForm.benefitType)}
            </span>
            {subtypeLabel ? (
              <span className="hidden max-w-[180px] truncate rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 lg:inline-flex">
                {subtypeLabel}
              </span>
            ) : null}
            <span
              className={`hidden rounded-md border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] md:inline-flex ${
                statusTone === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-amber-200 bg-amber-50 text-amber-700'
              }`}
            >
              {statusLabel}
            </span>
            <button
              type="button"
              onClick={closeOfferModal}
              className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
            >
              <X size={16} strokeWidth={3} />
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-2 overflow-hidden bg-slate-100 p-2 xl:grid-cols-[300px_minmax(0,1fr)]">
          <div className="min-h-0 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
            <div className="space-y-2">
              <BuilderSection icon={Hash} title="Basico" status={offerForm.name.trim() ? 'ready' : 'warning'}>
                <div className="space-y-2.5">
                  <input
                    type="text"
                    placeholder="Ej: Promo finde, Cupon Instagram, Combo cumple..."
                    className={compactInputClass}
                    value={offerForm.name}
                    onChange={(e) => setOfferForm({ ...offerForm, name: e.target.value })}
                  />

                  <div className="grid gap-1.5 sm:grid-cols-3">
                    {canonicalOfferOptions.map((option) => {
                      const active = offerForm.benefitType === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => handleOfferBenefitTypeChange(option.value)}
                          className={`h-8 rounded-md border px-2 text-left transition-all ${
                            active
                              ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-200 hover:bg-emerald-50/50'
                          }`}
                        >
                          <p className="truncate text-[11px] font-black leading-tight">{option.label}</p>
                        </button>
                      );
                    })}
                  </div>

                  {isFree ? (
                    <div className="grid grid-cols-3 gap-1.5">
                      {['2x1', '3x2', '4x3'].map((mode) => (
                        <ChipButton key={mode} active={offerForm.freeMode === mode} onClick={() => setOfferForm({ ...offerForm, freeMode: mode })}>
                          {mode}
                        </ChipButton>
                      ))}
                    </div>
                  ) : null}

                  {isCombo ? (
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      <label className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] font-black text-emerald-600">$</span>
                        <input
                          type="number"
                          placeholder="Precio final"
                          className={`${compactInputClass} pl-7`}
                          value={offerForm.offerPrice}
                          onChange={(e) => setOfferForm({ ...offerForm, offerPrice: e.target.value })}
                          onBlur={(e) => setOfferForm({ ...offerForm, offerPrice: String(normalizeFinalSalePrice(e.target.value)) })}
                        />
                      </label>
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2">
                        <p className="text-[9px] font-black uppercase tracking-[0.12em] text-emerald-700">Base actual</p>
                        <p className="mt-0.5 text-[13px] font-black text-emerald-900"><FancyPrice amount={offerWizardSuggestedOriginalPrice} /></p>
                      </div>
                    </div>
                  ) : null}

                  {isDiscount ? (
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-3 gap-1.5">
                        <ChipButton active={offerForm.discountMode === 'unit'} onClick={() => setOfferForm({ ...offerForm, discountMode: 'unit' })}>Unidad</ChipButton>
                        <ChipButton active={offerForm.discountMode === 'total'} onClick={() => setOfferForm({ ...offerForm, discountMode: 'total' })}>Total</ChipButton>
                        <ChipButton active={offerForm.discountMode === 'percentage'} onClick={() => setOfferForm({ ...offerForm, discountMode: 'percentage' })}>%</ChipButton>
                      </div>
                      <label className="relative block max-w-[220px]">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] font-black text-emerald-600">
                          {offerForm.discountMode === 'percentage' ? '%' : '$'}
                        </span>
                        <input
                          type="number"
                          className={`${compactInputClass} pl-7`}
                          value={offerForm.discountValue}
                          onChange={(e) => setOfferForm({ ...offerForm, discountValue: e.target.value })}
                        />
                      </label>
                    </div>
                  ) : null}

                  {isCoupon ? (
                    <div className="space-y-1.5">
                      <input
                        type="text"
                        placeholder="Codigo del cupon"
                        className={`${compactInputClass} font-black uppercase tracking-[0.08em]`}
                        value={offerForm.couponCode}
                        onChange={(e) => setOfferForm({ ...offerForm, couponCode: e.target.value.toUpperCase() })}
                      />
                      <div className="grid grid-cols-2 gap-1.5">
                        <ChipButton active={offerForm.discountMode === 'total'} onClick={() => setOfferForm({ ...offerForm, discountMode: 'total' })}>Monto fijo</ChipButton>
                        <ChipButton active={offerForm.discountMode === 'percentage'} onClick={() => setOfferForm({ ...offerForm, discountMode: 'percentage' })}>Porcentaje</ChipButton>
                      </div>
                      <label className="relative block max-w-[220px]">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] font-black text-emerald-600">
                          {offerForm.discountMode === 'percentage' ? '%' : '$'}
                        </span>
                        <input
                          type="number"
                          className={`${compactInputClass} pl-7`}
                          value={offerForm.discountValue}
                          onChange={(e) => setOfferForm({ ...offerForm, discountValue: e.target.value })}
                        />
                      </label>
                    </div>
                  ) : null}

                  {isWholesale ? (
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      <input
                        type="number"
                        placeholder="Cantidad minima"
                        className={compactInputClass}
                        value={offerForm.itemsCount}
                        onChange={(e) => setOfferForm({ ...offerForm, itemsCount: e.target.value })}
                      />
                      <input
                        type="number"
                        placeholder="Precio unitario"
                        className={compactInputClass}
                        value={offerForm.offerPrice}
                        onChange={(e) => setOfferForm({ ...offerForm, offerPrice: e.target.value })}
                        onBlur={(e) => setOfferForm({ ...offerForm, offerPrice: String(normalizeFinalSalePrice(e.target.value)) })}
                      />
                    </div>
                  ) : null}
                </div>
              </BuilderSection>

              <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <button
                  type="button"
                  onClick={() => setIsAdvancedOpen((current) => !current)}
                  className="flex min-h-[42px] w-full items-center justify-between gap-2 px-2.5 py-2 text-left transition-colors hover:bg-slate-50"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[10px] font-black ${hasFutureRules ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                      <ShieldCheck size={13} strokeWidth={3} />
                    </span>
                    <span className="truncate text-[11px] font-black uppercase tracking-[0.08em] text-slate-800">Avanzado</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={`rounded-md border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] ${hasFutureRules ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                      {hasFutureRules ? 'Con limites' : 'Opcional'}
                    </span>
                    <ChevronDown size={14} className={`text-slate-400 transition-transform duration-150 ${isAdvancedOpen ? 'rotate-180' : ''}`} />
                  </span>
                </button>

                {isAdvancedOpen ? (
                  <div className="space-y-2 border-t border-slate-100 p-2.5 animate-in fade-in slide-in-from-top-1 duration-150">
                    <div className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[10px] font-bold leading-4 text-amber-800">
                      <Info size={12} className="mt-0.5 shrink-0" />
                      <span>Preparado para etapa 2; no modifica caja todavia.</span>
                    </div>

                    <div className="grid gap-1.5 sm:grid-cols-3">
                      <ChipButton active={!maxUsesPerClient} onClick={() => setOfferForm({ ...offerForm, maxUsesPerClient: '', requiresClient: false })}>
                        Sin limite
                      </ChipButton>
                      <ChipButton active={maxUsesPerClient === 1} onClick={() => setOfferForm({ ...offerForm, maxUsesPerClient: 1, requiresClient: true })}>
                        1 uso
                      </ChipButton>
                      <input
                        type="number"
                        min="1"
                        placeholder="N usos"
                        className={compactInputClass}
                        value={offerForm.maxUsesPerClient || ''}
                        onChange={(e) => setOfferForm({ ...offerForm, maxUsesPerClient: e.target.value, requiresClient: Number(e.target.value || 0) > 0 || offerForm.requiresClient })}
                      />
                    </div>

                    <div className="grid gap-1.5 sm:grid-cols-[1fr_auto_auto]">
                      <input
                        type="number"
                        min="1"
                        placeholder="Vence despues de..."
                        className={compactInputClass}
                        value={expiresAfter.value || ''}
                        onChange={(e) => updateExpiry({ value: e.target.value })}
                      />
                      <ChipButton active={expiresAfter.unit === 'hours'} onClick={() => updateExpiry({ unit: 'hours' })}>
                        Horas
                      </ChipButton>
                      <ChipButton active={expiresAfter.unit !== 'hours'} onClick={() => updateExpiry({ unit: 'days' })}>
                        Dias
                      </ChipButton>
                    </div>

                    <div className="grid gap-1.5">
                      <RuleSwitch checked={requiresClient} disabled={maxUsesPerClient > 0} onChange={(checked) => setOfferForm({ ...offerForm, requiresClient: checked })} label="Requiere socio" />
                      <RuleSwitch checked={offerForm.stackable !== false} onChange={(checked) => setOfferForm({ ...offerForm, stackable: checked })} label="Acumulable" />
                    </div>

                    <input
                      type="number"
                      min="1"
                      placeholder="Limite global de usos"
                      className={compactInputClass}
                      value={offerForm.globalUsageLimit || ''}
                      onChange={(e) => setOfferForm({ ...offerForm, globalUsageLimit: e.target.value })}
                    />
                  </div>
                ) : null}
              </section>
            </div>
          </div>

          <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="flex min-h-[50px] shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700">
                  <Layers3 size={13} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-black uppercase tracking-[0.08em] text-slate-800">
                    {isCoupon ? 'Codigo comercial' : 'Productos'}
                  </p>
                  <p className="truncate text-[10px] font-semibold text-slate-400">{productHelpText}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">
                  {productModeLabel}
                </span>
                {!isCoupon ? (
                  <span className={`rounded-md border px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${offerResolvedProducts.length ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                    {includedCountLabel}
                  </span>
                ) : null}
              </div>
            </div>

            {isCoupon ? (
              <div className="min-h-0 flex-1 overflow-y-auto p-3 animate-in fade-in slide-in-from-bottom-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px]">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Codigo</p>
                      <p className="mt-1 break-all text-xl font-black tracking-tight text-emerald-700">{offerForm.couponCode || 'SIN-CODIGO'}</p>
                    </div>
                    <div className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Beneficio</p>
                      <p className="mt-1 text-[15px] font-black text-slate-900">{benefitValue}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2 text-[10px] font-bold text-slate-500">
                    <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-emerald-700">POS</span>
                    <span>Bloquea reutilizacion por socio cuando hay usos previos registrados.</span>
                  </div>
                </div>
              </div>
            ) : manualSelection ? (
              <div className="grid min-h-0 flex-1 overflow-hidden animate-in fade-in slide-in-from-bottom-1 lg:grid-cols-[minmax(0,1.35fr)_280px]">
                <section className="flex min-h-0 flex-col overflow-hidden">
                  <div className="flex min-h-[50px] shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-2.5 py-2.5">
                    <div className="relative min-w-[220px] flex-1">
                      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Buscar producto..."
                        className="h-8 w-full rounded-md border border-slate-200 bg-white pl-8 pr-2.5 text-[12px] font-medium outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                        value={offerProductSearch}
                        onChange={(e) => setOfferProductSearch(e.target.value)}
                      />
                    </div>
                    <div className="relative w-full sm:w-[236px]">
                      <button
                        type="button"
                        onClick={() => setIsCategoryMenuOpen((current) => !current)}
                        className={`flex h-8 w-full items-center gap-1.5 rounded-lg border px-2 text-left text-[12px] font-bold transition-all ${
                          isCategoryMenuOpen || offerProductCategoryFilter !== 'all'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800 shadow-sm'
                            : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
                        }`}
                      >
                        <Filter size={14} className={offerProductCategoryFilter !== 'all' ? 'text-emerald-500' : 'text-slate-400'} />
                        <span className="min-w-0 flex-1 truncate">{currentCategoryLabel}</span>
                        <ChevronDown size={13} className={`shrink-0 text-slate-400 transition-transform ${isCategoryMenuOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {isCategoryMenuOpen ? (
                        <>
                          <div className="fixed inset-0 z-[100]" onClick={() => setIsCategoryMenuOpen(false)} />
                          <div className="absolute left-0 top-[calc(100%+6px)] z-[110] w-full rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                            <div className="relative mb-2">
                              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                              <input
                                value={categoryMenuSearch}
                                onChange={(event) => setCategoryMenuSearch(event.target.value)}
                                placeholder="Buscar categoria..."
                                className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-2 text-xs font-semibold text-slate-700 outline-none transition focus:border-emerald-300 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                                autoFocus
                              />
                            </div>
                            <div className="custom-scrollbar max-h-64 overflow-y-auto pr-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setOfferProductCategoryFilter?.('all');
                                  setIsCategoryMenuOpen(false);
                                  setCategoryMenuSearch('');
                                }}
                                className={`mb-1 flex h-8 w-full items-center rounded-lg px-2 text-left text-xs font-bold transition ${
                                  offerProductCategoryFilter === 'all'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'text-slate-600 hover:bg-slate-50'
                                }`}
                              >
                                Todas las categorias
                              </button>
                              {visibleCategoryOptions.map((categoryName) => (
                                <button
                                  key={categoryName}
                                  type="button"
                                  onClick={() => {
                                    setOfferProductCategoryFilter?.(categoryName);
                                    setIsCategoryMenuOpen(false);
                                    setCategoryMenuSearch('');
                                  }}
                                  className={`flex h-8 w-full items-center rounded-lg px-2 text-left text-xs font-bold transition ${
                                    offerProductCategoryFilter === categoryName
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : 'text-slate-600 hover:bg-slate-50'
                                  }`}
                                >
                                  <span className="truncate">{categoryName}</span>
                                </button>
                              ))}
                              {visibleCategoryOptions.length === 0 ? (
                                <p className="px-2 py-3 text-center text-xs font-semibold text-slate-400">Sin categorias</p>
                              ) : null}
                            </div>
                          </div>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto p-2 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }} onScroll={offerModalAvailableFeed.handleScroll}>
                    {availableProductsForOffer.length > 0 ? (
                      <div className="rounded-md border border-slate-200 bg-white">
                        {offerModalAvailableFeed.visibleItems.map((product) => (
                          <ProductRow
                            key={product.id}
                            product={product}
                            subtitle={<FancyPrice amount={Number(product.price || 0)} />}
                            onAdd={handleAddProductToOffer}
                            showComboPricing={isCombo}
                            showStock={false}
                            onPreviewEnter={showProductImagePreview}
                            onPreviewLeave={schedulePreviewHide}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="flex h-full min-h-[170px] items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50 px-5 text-center animate-in fade-in">
                        <div>
                          <p className="text-sm font-black text-slate-600">{offerProductSearch ? 'Sin resultados.' : 'Catalogo completo.'}</p>
                          <p className="mt-1 text-[11px] font-semibold text-slate-400">{offerProductSearch ? 'Proba con otro nombre.' : 'Ya sumaste los productos disponibles.'}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                <section className="flex min-h-0 flex-col overflow-hidden border-t border-slate-200 bg-slate-50/40 lg:border-l lg:border-t-0">
                  <div className="flex min-h-[50px] shrink-0 items-center justify-between gap-2 border-b border-slate-100 bg-white px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-black uppercase tracking-[0.08em] text-emerald-700">Incluidos</p>
                      <p className="truncate text-[10px] font-semibold text-slate-400">{isCombo ? 'Cantidades del combo' : 'Lo que entra en caja'}</p>
                    </div>
                    <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700">
                      {includedCountLabel}
                    </span>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto p-2 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }} onScroll={offerModalIncludedFeed.handleScroll}>
                    {offerResolvedProducts.length > 0 ? (
                      <div className="rounded-md border border-slate-200 bg-white">
                        {offerModalIncludedFeed.visibleItems.map((product) => (
                          <ProductRow
                            key={product.id}
                            product={product}
                            subtitle={null}
                            onRemove={handleRemoveProductFromOffer}
                            removable={canRemoveItems}
                            onQuantityChange={handleUpdateProductQuantityInOffer}
                            showQuantityControls={isCombo}
                            showComboPricing={isCombo}
                            selected
                            showStock={false}
                            onPreviewEnter={showProductImagePreview}
                            onPreviewLeave={schedulePreviewHide}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="flex h-full min-h-[170px] items-center justify-center rounded-md border border-dashed border-emerald-200 bg-white px-5 text-center animate-in fade-in">
                        <div>
                          <p className="text-sm font-black text-slate-600">Sin seleccion.</p>
                          <p className="mt-1 text-[11px] font-semibold text-slate-400">Usa el + del catalogo.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-1">
                <div className="flex min-h-[50px] shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500">
                      <Package size={13} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-black uppercase tracking-[0.08em] text-slate-800">Alcance automatico</p>
                      <p className="truncate text-[10px] font-semibold text-slate-400">{scopeLabel}</p>
                    </div>
                  </div>
                  <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-black text-slate-500">
                    Solo vista previa
                  </span>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-2 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }} onScroll={offerModalIncludedFeed.handleScroll}>
                  {offerResolvedProducts.length > 0 ? (
                    <div className="rounded-md border border-slate-200 bg-white">
                      {offerModalIncludedFeed.visibleItems.map((product) => (
                        <ProductRow
                          key={product.id}
                          product={product}
                          subtitle={offerForm.scopeMode === 'category' ? offerForm.categoryName || 'Categoria pendiente' : 'Alcance automatico'}
                          onRemove={handleRemoveProductFromOffer}
                          removable={false}
                          selected
                          showStock={false}
                          onPreviewEnter={showProductImagePreview}
                          onPreviewLeave={schedulePreviewHide}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="flex h-full min-h-[190px] items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50 px-5 text-center animate-in fade-in">
                      <div>
                        <p className="text-sm font-black text-slate-600">
                          {offerForm.scopeMode === 'category' ? 'Elegir categoria para ver productos.' : 'No hay productos alcanzados.'}
                        </p>
                        <p className="mt-1 text-[11px] font-semibold text-slate-400">La lista se actualiza sola cuando cambia el alcance.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

        </div>

        <div className="flex h-[54px] shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-4">
          <p className="text-[11px] font-semibold text-slate-400">
            {editingOfferId ? 'Editando oferta existente.' : 'Se guardara una oferta nueva en el catalogo actual.'}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={closeOfferModal} className="rounded-lg px-4 py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-100">
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSaveOfferWizard}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-black text-white shadow-sm transition-all hover:bg-emerald-700"
            >
              <Save size={15} strokeWidth={3} />
              Guardar oferta
            </button>
          </div>
        </div>
      </div>
      {productImagePreview ? (
        <button
          type="button"
          onMouseEnter={clearPreviewHide}
          onMouseLeave={schedulePreviewHide}
          onClick={() => productImagePreview.image && setProductImageLightbox(productImagePreview)}
          disabled={!productImagePreview.image}
          className="fixed z-[130] rounded-xl border border-slate-200 bg-white p-1.5 text-left shadow-2xl shadow-slate-950/25 transition-transform hover:scale-[1.01] disabled:cursor-default"
          style={{ left: productImagePreview.left, top: productImagePreview.top, width: productImagePreview.width }}
          title={productImagePreview.image ? 'Ver imagen completa' : undefined}
        >
          {productImagePreview.image ? (
            <img
              src={productImagePreview.image}
              alt={productImagePreview.product.title}
              loading="lazy"
              decoding="async"
              fetchpriority="low"
              className="h-36 w-full rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-36 w-full flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-slate-400">
              <ImageIcon size={20} />
              <span className="mt-1 text-[10px] font-bold">Sin imagen</span>
            </div>
          )}
          <p className="mt-1 truncate px-1 text-[10px] font-black text-slate-700">
            {productImagePreview.image ? 'Click para ampliar' : productImagePreview.product.title}
          </p>
        </button>
      ) : null}
      {productImageLightbox ? (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/82 p-5 backdrop-blur-sm" onClick={() => setProductImageLightbox(null)}>
          <div className="max-h-full max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-2">
              <p className="truncate text-sm font-black text-slate-900">{productImageLightbox.product.title}</p>
              <button
                type="button"
                onClick={() => setProductImageLightbox(null)}
                className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
              >
                <X size={16} strokeWidth={3} />
              </button>
            </div>
            <img
              src={productImageLightbox.image}
              alt={productImageLightbox.product.title}
              className="max-h-[78vh] max-w-full bg-slate-100 object-contain"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
