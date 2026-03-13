import React from 'react';
import {
  Check,
  List,
  MinusCircle,
  Package,
  PlusCircle,
  Save,
  Search,
  Tag,
  TicketPercent,
  X,
} from 'lucide-react';
import { FancyPrice } from './FancyPrice';
import { formatNumber } from '../utils/helpers';
import {
  getCanonicalOfferSubtypeLabel,
  getCanonicalOfferTypeLabel,
} from '../utils/offerHelpers';

function ProductMiniCard({ product, subtitle, onRemove }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-white px-2.5 py-1.5 shadow-sm">
      <div className="flex min-w-0 items-center gap-3">
        {product.image ? (
          <img src={product.image} alt={product.title} className="h-9 w-9 rounded-lg object-cover ring-1 ring-emerald-100" />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100/70 text-emerald-500 ring-1 ring-emerald-200">
            <Package size={15} />
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-[12px] font-bold text-slate-800">{product.title}</p>
          <p className="text-[10px] font-semibold leading-4 text-slate-400">{subtitle}</p>
        </div>
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={() => onRemove(product.id)}
          className="rounded-lg border border-transparent bg-slate-50 p-1.5 text-slate-300 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-500"
        >
          <MinusCircle size={14} />
        </button>
      )}
    </div>
  );
}

function OfferStepCards({ steps, offerWizardStep }) {
  return (
    <div className="grid gap-2 md:grid-cols-5">
      {steps.map((label, index) => {
        const stepNumber = index + 1;
        const isActive = offerWizardStep === stepNumber;
        const isCompleted = offerWizardStep > stepNumber;

        return (
          <div
            key={label}
            className={`rounded-2xl border px-3 py-2 transition-all ${
              isActive
                ? 'border-emerald-300 bg-emerald-50 shadow-sm'
                : isCompleted
                ? 'border-emerald-200 bg-white'
                : 'border-slate-200 bg-slate-50/70'
            }`}
          >
            <div className="flex items-center gap-2">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black ${
                  isActive || isCompleted ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'
                }`}
              >
                {isCompleted ? <Check size={12} strokeWidth={3} /> : stepNumber}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Paso {stepNumber}</p>
                <p className="truncate text-xs font-black text-slate-800">{label}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function OfferWizardModal({
  isOpen,
  editingOfferId,
  offerForm,
  setOfferForm,
  offerWizardStep,
  steps,
  canonicalOfferOptions,
  offerResolvedProducts,
  offerCategoryProducts,
  offerProductSearch,
  setOfferProductSearch,
  availableProductsForOffer,
  offerModalAvailableFeed,
  offerModalIncludedFeed,
  handleAddProductToOffer,
  handleRemoveProductFromOffer,
  handleOfferBenefitTypeChange,
  handleOfferScopeChange,
  handleAdvanceOfferWizard,
  handleSaveOfferWizard,
  closeOfferModal,
  setOfferWizardStep,
  offerWizardGuide,
  offerWizardIsManualMode,
  offerWizardSuggestedOriginalPrice,
  categories,
  productsByCategory,
}) {
  if (!isOpen) return null;

  const activeCanonicalOfferOption =
    canonicalOfferOptions.find((option) => option.value === offerForm.benefitType) || canonicalOfferOptions[0];
  const offerSubtypeLabel = getCanonicalOfferSubtypeLabel(offerForm);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/70 p-3 backdrop-blur-sm">
      <div className="flex h-[90vh] w-full max-w-[1180px] flex-col overflow-hidden rounded-[24px] border border-emerald-300 bg-white shadow-2xl shadow-emerald-950/20">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-emerald-300 bg-gradient-to-r from-emerald-700 via-emerald-700 to-emerald-600 px-4 py-3 text-white">
          <div className="flex min-w-0 items-start gap-2.5">
            <div className="rounded-xl border border-white/15 bg-white/10 p-2.5 shadow-inner shadow-black/10">
              <TicketPercent size={19} />
            </div>
            <div className="min-w-0">
              <div className="mb-0.5 flex flex-wrap items-center gap-2">
                <h3 className="text-base font-black tracking-tight">{editingOfferId ? 'Editar Oferta' : 'Nueva Oferta'}</h3>
                <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-50">
                  {getCanonicalOfferTypeLabel(offerForm.benefitType)}
                </span>
              </div>
              <p className="text-xs font-medium text-emerald-50/90">
                Wizard por pasos para definir beneficio, alcance, condicion y seleccion final.
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

        <div className="shrink-0 border-b border-emerald-200 bg-white px-4 py-2.5">
          <OfferStepCards steps={steps} offerWizardStep={offerWizardStep} />
        </div>

        <div className="grid min-h-0 flex-1 gap-2.5 overflow-hidden bg-emerald-50/40 p-2.5 lg:grid-cols-[minmax(300px,0.88fr)_minmax(0,1.12fr)]">
          <div className="min-h-0 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
            <div className="space-y-2">
              <div className="rounded-[20px] border border-emerald-200 bg-white p-3 shadow-sm">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.17em] text-emerald-700">Paso {offerWizardStep}</p>
                    <p className="text-sm font-black text-slate-900">{steps[offerWizardStep - 1]}</p>
                    <p className="text-[11px] font-medium leading-4 text-slate-500">{offerWizardGuide}</p>
                  </div>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-emerald-700">
                    {offerResolvedProducts.length} productos
                  </span>
                </div>

                {offerWizardStep === 1 && (
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Nombre visible</label>
                      <input
                        type="text"
                        placeholder="Ej: Promo finde, Combo cumple, 3x2 caramelos..."
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[13px] font-bold text-slate-800 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                        value={offerForm.name}
                        onChange={(e) => setOfferForm({ ...offerForm, name: e.target.value })}
                      />
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      {canonicalOfferOptions.map((option) => {
                        const isActive = offerForm.benefitType === option.value;

                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => handleOfferBenefitTypeChange(option.value)}
                            className={`rounded-[18px] border px-3 py-3 text-left transition-all ${
                              isActive
                                ? 'border-emerald-400 bg-emerald-50 shadow-sm'
                                : 'border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/40'
                            }`}
                          >
                            <p className="text-sm font-black text-slate-900">{option.label}</p>
                            <p className="mt-1 text-[11px] leading-4 text-slate-500">{option.description}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {offerWizardStep === 2 && (
                  offerForm.benefitType === 'coupon' ? (
                    <div className="rounded-[18px] border border-emerald-200 bg-emerald-50 px-3 py-3">
                      <p className="text-sm font-black text-emerald-900">Aplicacion global sobre el carrito.</p>
                      <p className="mt-1 text-[11px] leading-4 text-emerald-800/80">
                        Los cupones se aplican manualmente en caja y no necesitan productos vinculados.
                      </p>
                    </div>
                  ) : (
                  <div className="grid gap-2 sm:grid-cols-3">
                    <button
                      type="button"
                      onClick={() => handleOfferScopeChange('products')}
                      className={`rounded-[18px] border px-3 py-3 text-left transition-all ${
                        offerForm.scopeMode === 'products'
                          ? 'border-emerald-400 bg-emerald-50 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/40'
                      }`}
                    >
                      <p className="text-sm font-black text-slate-900">Productos</p>
                      <p className="mt-1 text-[11px] leading-4 text-slate-500">Seleccion manual del catalogo.</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOfferScopeChange('category')}
                      disabled={offerWizardIsManualMode}
                      className={`rounded-[18px] border px-3 py-3 text-left transition-all ${
                        offerForm.scopeMode === 'category'
                          ? 'border-emerald-400 bg-emerald-50 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/40'
                      } ${offerWizardIsManualMode ? 'cursor-not-allowed opacity-50' : ''}`}
                    >
                      <p className="text-sm font-black text-slate-900">Categoria</p>
                      <p className="mt-1 text-[11px] leading-4 text-slate-500">Expande todos los productos al guardar.</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOfferScopeChange('all_products')}
                      disabled={offerWizardIsManualMode}
                      className={`rounded-[18px] border px-3 py-3 text-left transition-all ${
                        offerForm.scopeMode === 'all_products'
                          ? 'border-emerald-400 bg-emerald-50 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/40'
                      } ${offerWizardIsManualMode ? 'cursor-not-allowed opacity-50' : ''}`}
                    >
                      <p className="text-sm font-black text-slate-900">Todos los productos</p>
                      <p className="mt-1 text-[11px] leading-4 text-slate-500">Aplica la regla a todo el inventario cargado.</p>
                    </button>
                  </div>
                  )
                )}

                {offerWizardStep === 3 && (
                  <div className="space-y-2">
                    {(offerForm.benefitType === 'combo' || offerForm.benefitType === 'fixed_price') && (
                      <div className="space-y-2 rounded-[18px] border border-emerald-200 bg-emerald-50 px-3 py-3">
                        <label className="block text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">Precio final</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-emerald-600">$</span>
                          <input
                            type="number"
                            className="w-full rounded-xl border border-emerald-300 bg-white py-2 pl-8 pr-3 text-[13px] font-black text-emerald-900 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                            value={offerForm.offerPrice}
                            onChange={(e) => setOfferForm({ ...offerForm, offerPrice: e.target.value })}
                          />
                        </div>
                        <p className="text-[11px] leading-4 text-emerald-800/80">
                          Base actual: <FancyPrice amount={offerWizardSuggestedOriginalPrice} />
                        </p>
                      </div>
                    )}

                    {offerForm.benefitType === 'discount' && (
                      <div className="space-y-2 rounded-[18px] border border-emerald-200 bg-emerald-50 px-3 py-3">
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { value: 'unit', label: 'Por unidad' },
                            { value: 'total', label: 'Sobre total' },
                            { value: 'percentage', label: 'Porcentaje' },
                          ].map((mode) => (
                            <button
                              key={mode.value}
                              type="button"
                              onClick={() => setOfferForm({ ...offerForm, discountMode: mode.value })}
                              className={`rounded-xl border px-3 py-2 text-xs font-black transition-all ${
                                offerForm.discountMode === mode.value
                                  ? 'border-emerald-400 bg-emerald-600 text-white'
                                  : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:text-emerald-700'
                              }`}
                            >
                              {mode.label}
                            </button>
                          ))}
                        </div>
                        <div className="relative max-w-[240px]">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-emerald-600">
                            {offerForm.discountMode === 'percentage' ? '%' : '$'}
                          </span>
                          <input
                            type="number"
                            className="w-full rounded-xl border border-emerald-300 bg-white py-2 pl-8 pr-3 text-[13px] font-black text-emerald-900 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                            value={offerForm.discountValue}
                            onChange={(e) => setOfferForm({ ...offerForm, discountValue: e.target.value })}
                          />
                        </div>
                        {offerForm.discountMode === 'percentage' && (
                          <p className="text-[11px] leading-4 text-emerald-800/80">
                            Se convertira a un descuento compatible con el motor legacy al guardar.
                          </p>
                        )}
                      </div>
                    )}

                    {offerForm.benefitType === 'coupon' && (
                      <div className="space-y-2 rounded-[18px] border border-emerald-200 bg-emerald-50 px-3 py-3">
                        <div>
                          <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">Codigo del cupon</label>
                          <input
                            type="text"
                            placeholder="Ej: REBU10"
                            className="w-full rounded-xl border border-emerald-300 bg-white px-3 py-2 text-[13px] font-black uppercase text-emerald-900 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                            value={offerForm.couponCode}
                            onChange={(e) => setOfferForm({ ...offerForm, couponCode: e.target.value.toUpperCase() })}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { value: 'total', label: 'Monto fijo' },
                            { value: 'percentage', label: 'Porcentaje' },
                          ].map((mode) => (
                            <button
                              key={mode.value}
                              type="button"
                              onClick={() => setOfferForm({ ...offerForm, discountMode: mode.value })}
                              className={`rounded-xl border px-3 py-2 text-xs font-black transition-all ${
                                offerForm.discountMode === mode.value
                                  ? 'border-emerald-400 bg-emerald-600 text-white'
                                  : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:text-emerald-700'
                              }`}
                            >
                              {mode.label}
                            </button>
                          ))}
                        </div>
                        <div className="relative max-w-[240px]">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-emerald-600">
                            {offerForm.discountMode === 'percentage' ? '%' : '$'}
                          </span>
                          <input
                            type="number"
                            className="w-full rounded-xl border border-emerald-300 bg-white py-2 pl-8 pr-3 text-[13px] font-black text-emerald-900 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                            value={offerForm.discountValue}
                            onChange={(e) => setOfferForm({ ...offerForm, discountValue: e.target.value })}
                          />
                        </div>
                        <p className="text-[11px] leading-4 text-emerald-800/80">
                          Este cupon aparecera en los descuentos del POS y tambien al buscar su codigo.
                        </p>
                      </div>
                    )}

                    {offerForm.benefitType === 'wholesale' && (
                      <div className="grid gap-2 rounded-[18px] border border-emerald-200 bg-emerald-50 px-3 py-3 sm:grid-cols-2">
                        <input
                          type="number"
                          placeholder="Cantidad minima"
                          className="w-full rounded-xl border border-emerald-300 bg-white px-3 py-2 text-[13px] font-black text-emerald-900 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                          value={offerForm.itemsCount}
                          onChange={(e) => setOfferForm({ ...offerForm, itemsCount: e.target.value })}
                        />
                        <input
                          type="number"
                          placeholder="Precio unitario"
                          className="w-full rounded-xl border border-emerald-300 bg-white px-3 py-2 text-[13px] font-black text-emerald-900 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                          value={offerForm.offerPrice}
                          onChange={(e) => setOfferForm({ ...offerForm, offerPrice: e.target.value })}
                        />
                      </div>
                    )}

                    {offerForm.benefitType === 'free' && (
                      <div className="rounded-[18px] border border-emerald-200 bg-emerald-50 px-3 py-3">
                        <p className="text-sm font-black text-emerald-900">Promo {offerForm.freeMode} con activacion automatica.</p>
                      </div>
                    )}
                  </div>
                )}

                {offerWizardStep === 5 && (
                  <div className="space-y-2">
                    <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Resumen</p>
                      <p className="mt-1 text-sm font-black text-slate-900">
                        {offerForm.name || 'Sin nombre'} · {getCanonicalOfferTypeLabel(offerForm.benefitType)}
                        {offerSubtypeLabel ? ` · ${offerSubtypeLabel}` : ''}
                      </p>
                    </div>
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
                    {offerWizardStep === 4 ? 'Seleccion operativa' : 'Resumen rapido'}
                  </p>
                  <p className="text-[11px] font-medium leading-4 text-slate-500">{activeCanonicalOfferOption?.description}</p>
                </div>
                <span className="rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-emerald-700">
                  {offerResolvedProducts.length} items
                </span>
              </div>
            </div>

            {offerWizardStep === 4 ? (
              offerForm.benefitType === 'coupon' ? (
                <div className="min-h-0 flex-1 overflow-y-auto p-2.5 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
                  <div className="space-y-2">
                    <div className="rounded-[18px] border border-emerald-200 bg-emerald-50 px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">Codigo activo</p>
                      <p className="mt-1 text-lg font-black text-emerald-900">{offerForm.couponCode || 'SIN CODIGO'}</p>
                    </div>
                    <div className="rounded-[18px] border border-slate-200 bg-white px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Aplicacion</p>
                      <p className="mt-1 text-sm font-black text-slate-900">
                        {offerForm.discountMode === 'percentage'
                          ? `${offerForm.discountValue || 0}% sobre el total del pedido`
                          : `$${offerForm.discountValue || 0} de descuento fijo sobre el total`}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        El vendedor podra usarlo desde el panel de descuentos o escribiendo el codigo en la busqueda del POS.
                      </p>
                    </div>
                  </div>
                </div>
              ) : offerForm.scopeMode === 'category' ? (
                <div className="grid min-h-0 flex-1 gap-2 p-2 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                  <div className="min-h-0 overflow-y-auto rounded-[16px] border border-slate-200 bg-slate-50/70 p-2 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {categories.map((categoryName) => {
                        const isActive = offerForm.categoryName === categoryName;
                        const categoryItems = productsByCategory[categoryName] || [];
                        return (
                          <button
                            key={categoryName}
                            type="button"
                            onClick={() => setOfferForm({ ...offerForm, categoryName })}
                            className={`rounded-[18px] border px-3 py-3 text-left transition-all ${
                              isActive
                                ? 'border-emerald-400 bg-emerald-50 shadow-sm'
                                : 'border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/40'
                            }`}
                          >
                            <p className="truncate text-sm font-black text-slate-900">{categoryName}</p>
                            <p className="mt-1 text-[11px] text-slate-500">{formatNumber(categoryItems.length)} productos</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="min-h-0 overflow-y-auto rounded-[16px] border border-emerald-200 bg-emerald-50/40 p-2 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
                    {offerCategoryProducts.length > 0 ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {offerCategoryProducts.map((product) => (
                          <ProductMiniCard key={product.id} product={product} subtitle="Incluido por categoria" />
                        ))}
                      </div>
                    ) : (
                      <div className="flex h-full min-h-[220px] flex-col items-center justify-center px-6 text-center">
                        <div className="mb-2.5 rounded-full border border-emerald-200 bg-white p-3 text-emerald-400">
                          <Tag size={20} />
                        </div>
                        <p className="text-[13px] font-bold text-emerald-900">Todavia no hay categoria elegida.</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : offerForm.scopeMode === 'all_products' ? (
                <div className="min-h-0 flex-1 overflow-y-auto p-2.5 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
                  <div className="space-y-2">
                    <div className="rounded-[18px] border border-emerald-200 bg-emerald-50 px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">Cobertura total</p>
                      <p className="mt-1 text-sm font-black text-emerald-900">
                        La oferta se aplicara a {formatNumber(offerResolvedProducts.length)} productos del inventario.
                      </p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {offerResolvedProducts.map((product) => (
                        <ProductMiniCard
                          key={product.id}
                          product={product}
                          subtitle={`$${formatNumber(Number(product.price || 0))}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
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

                    <div className="min-h-0 flex-1 overflow-y-auto p-2 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }} onScroll={offerModalAvailableFeed.handleScroll}>
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
                                  <img src={product.image} alt={product.title} className="h-9 w-9 rounded-lg object-cover ring-1 ring-slate-200" />
                                ) : (
                                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-400 ring-1 ring-slate-200">
                                    <Package size={15} />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className="truncate text-[12px] font-bold text-slate-800">{product.title}</p>
                                  <p className="text-[10px] font-semibold leading-4 text-slate-400">
                                    ${formatNumber(Number(product.price || 0))}
                                  </p>
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
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto p-2 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }} onScroll={offerModalIncludedFeed.handleScroll}>
                      <div className="space-y-1">
                        {offerForm.productsIncluded.length > 0 ? (
                          offerModalIncludedFeed.visibleItems.map((product) => (
                            <ProductMiniCard
                              key={product.id}
                              product={product}
                              subtitle={
                                offerWizardIsManualMode
                                  ? `$${formatNumber(Number(product.price || 0))} precio base`
                                  : 'Producto incluido en la regla'
                              }
                              onRemove={handleRemoveProductFromOffer}
                            />
                          ))
                        ) : (
                          <div className="flex h-full min-h-[220px] flex-col items-center justify-center px-6 text-center">
                            <div className="mb-2.5 rounded-full border border-emerald-200 bg-white p-3 text-emerald-400">
                              <List size={20} />
                            </div>
                            <p className="text-[13px] font-bold text-emerald-900">Todavia no hay productos incluidos.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto p-2.5 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
                <div className="space-y-2">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-[18px] border border-emerald-200 bg-emerald-50 px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">Tipo canonico</p>
                      <p className="mt-1 text-sm font-black text-emerald-900">
                        {getCanonicalOfferTypeLabel(offerForm.benefitType)}
                        {offerSubtypeLabel ? ` · ${offerSubtypeLabel}` : ''}
                      </p>
                    </div>
                    <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Alcance</p>
                      <p className="mt-1 text-sm font-black text-slate-900">
                        {offerForm.benefitType === 'coupon'
                          ? 'Codigo manual sobre el carrito'
                          : offerForm.scopeMode === 'category'
                          ? offerForm.categoryName || 'Categoria'
                          : offerForm.scopeMode === 'all_products'
                          ? 'Todos los productos'
                          : `${offerResolvedProducts.length} productos`}
                      </p>
                    </div>
                  </div>

                  {offerForm.benefitType === 'coupon' && (
                    <div className="rounded-[18px] border border-emerald-200 bg-white px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">Cupon</p>
                      <p className="mt-1 text-sm font-black text-emerald-900">{offerForm.couponCode || 'SIN CODIGO'}</p>
                    </div>
                  )}

                  {offerForm.benefitType !== 'coupon' && (
                  <div className="rounded-[18px] border border-emerald-200 bg-white px-3 py-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">Productos resueltos</p>
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-emerald-700">
                        {offerResolvedProducts.length}
                      </span>
                    </div>
                    {offerResolvedProducts.length > 0 ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {offerResolvedProducts.map((product) => (
                          <ProductMiniCard
                            key={product.id}
                            product={product}
                            subtitle={`$${formatNumber(Number(product.price || 0))}`}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="flex min-h-[220px] flex-col items-center justify-center rounded-[18px] border border-dashed border-slate-200 bg-slate-50 text-center">
                        <div className="mb-3 rounded-full border border-slate-200 bg-white p-3">
                          <Package size={20} className="text-slate-300" />
                        </div>
                        <p className="text-sm font-black text-slate-500">Todavia no hay productos vinculados.</p>
                      </div>
                    )}
                  </div>
                  )}
                </div>
              </div>
            )}
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
            {offerWizardStep > 1 && (
              <button
                onClick={() => setOfferWizardStep((current) => Math.max(1, current - 1))}
                className="rounded-xl border border-slate-200 px-5 py-2.5 text-xs font-black text-slate-600 transition-colors hover:bg-slate-50"
              >
                Volver
              </button>
            )}
            {offerWizardStep < steps.length ? (
              <button
                onClick={handleAdvanceOfferWizard}
                className="rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-black text-white shadow-lg shadow-emerald-200 transition-all hover:bg-emerald-700"
              >
                Siguiente
              </button>
            ) : (
              <button
                onClick={handleSaveOfferWizard}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-black text-white shadow-lg shadow-emerald-200 transition-all hover:bg-emerald-700"
              >
                <Save size={16} strokeWidth={3} />
                Guardar Oferta
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
