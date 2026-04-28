import React from 'react';
import { MinusCircle, Package, PlusCircle, Save, Search, TicketPercent, X } from 'lucide-react';
import { FancyPrice } from './FancyPrice';
import { getCanonicalOfferSubtypeLabel, getCanonicalOfferTypeLabel, getComboProductLineDisplay } from '../utils/offerHelpers';

function ChipButton({ active, disabled = false, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl border px-3 py-2 text-xs font-black transition-all ${
        active
          ? 'border-emerald-400 bg-emerald-600 text-white shadow-sm'
          : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:text-emerald-700'
      } ${disabled ? 'cursor-not-allowed opacity-45 hover:border-slate-200 hover:text-slate-600' : ''}`}
    >
      {children}
    </button>
  );
}

function Section({ eyebrow, title, hint, aside, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">{eyebrow}</p>
          <h4 className="mt-0.5 text-sm font-black text-slate-900">{title}</h4>
          {hint ? <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{hint}</p> : null}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function ProductRow({ product, subtitle, onAdd, onRemove, removable = true, onQuantityChange, showQuantityControls = false, showComboPricing = false }) {
  const isWeight = product.product_type === 'weight';
  const quantityValue = Number(product.quantity ?? product.qty ?? (isWeight ? 1000 : 1)) || (isWeight ? 1000 : 1);
  const lineDisplay = getComboProductLineDisplay(product);
  const media = product.image ? (
    <img src={product.image} alt={product.title} className="h-9 w-9 rounded-lg object-cover ring-1 ring-slate-200" />
  ) : (
    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-400 ring-1 ring-slate-200">
      <Package size={15} />
    </div>
  );

  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2 shadow-sm">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {media}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-bold text-slate-800">{product.title}</p>
          {showQuantityControls ? (
            <div className="mt-1 space-y-1.5">
              <label className="block max-w-[150px] rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1">
                <span className="block text-[8px] font-black uppercase tracking-[0.1em] text-emerald-700">
                  {isWeight ? 'Gramos' : 'Cantidad'}
                </span>
                <input
                  type="number"
                  min={isWeight ? '1' : '1'}
                  step={isWeight ? '1' : '1'}
                  value={quantityValue}
                  onChange={(event) => onQuantityChange?.(product.id, event.target.value)}
                  className="mt-0.5 w-full bg-transparent text-[12px] font-black text-emerald-900 outline-none"
                />
              </label>
              <div className="flex flex-wrap items-center gap-1 text-[9px] font-bold text-slate-500">
                <span className="rounded-full border border-emerald-100 bg-emerald-50 px-1.5 py-0.5 text-emerald-700">{lineDisplay.quantityLabel}</span>
                <span><FancyPrice amount={lineDisplay.referenceAmount} /> {lineDisplay.referenceUnitLabel}</span>
                <span className="text-slate-300">|</span>
                <span>Total: <FancyPrice amount={lineDisplay.totalAmount} /></span>
              </div>
            </div>
          ) : showComboPricing ? (
            <div className="mt-1 flex flex-wrap items-center gap-1 text-[9px] font-bold text-slate-500">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-slate-700">{lineDisplay.quantityLabel}</span>
              <span><FancyPrice amount={lineDisplay.referenceAmount} /> {lineDisplay.referenceUnitLabel}</span>
              <span className="text-slate-300">|</span>
              <span>Total: <FancyPrice amount={lineDisplay.totalAmount} /></span>
            </div>
          ) : (
            <p className="text-[10px] font-semibold leading-4 text-slate-400">{subtitle}</p>
          )}
        </div>
      </div>

      {onAdd ? (
        <button
          type="button"
          onClick={() => onAdd(product)}
          className="rounded-lg border border-transparent bg-slate-50 p-1.5 text-emerald-500 transition-colors hover:border-emerald-200 hover:bg-emerald-50"
        >
          <PlusCircle size={15} />
        </button>
      ) : null}

      {onRemove && removable ? (
        <button
          type="button"
          onClick={() => onRemove(product.id)}
          className="rounded-lg border border-transparent bg-slate-50 p-1.5 text-slate-300 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-500"
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
  availableProductsForOffer,
  offerModalAvailableFeed,
  offerModalIncludedFeed,
  handleAddProductToOffer,
  handleRemoveProductFromOffer,
  handleUpdateProductQuantityInOffer,
  handleOfferBenefitTypeChange,
  handleOfferScopeChange,
  handleSaveOfferWizard,
  closeOfferModal,
  offerWizardSuggestedOriginalPrice,
  categories,
}) {
  if (!isOpen) return null;

  const subtypeLabel = getCanonicalOfferSubtypeLabel(offerForm);
  const activeOption =
    canonicalOfferOptions.find((option) => option.value === offerForm.benefitType) || canonicalOfferOptions[0];
  const isCoupon = offerForm.benefitType === 'coupon';
  const isDiscount = offerForm.benefitType === 'discount';
  const isWholesale = offerForm.benefitType === 'wholesale';
  const isCombo = offerForm.benefitType === 'combo' || offerForm.benefitType === 'fixed_price';
  const isFree = offerForm.benefitType === 'free';
  const manualSelection = offerForm.scopeMode === 'products' || isCombo;
  const canRemoveItems = offerForm.scopeMode === 'products';

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/70 p-3 backdrop-blur-sm">
      <div className="flex h-[88vh] w-full max-w-[1280px] flex-col overflow-hidden rounded-[24px] border border-emerald-200 bg-white shadow-2xl shadow-emerald-950/20">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-emerald-200 bg-[linear-gradient(135deg,#ecfdf5_0%,#ffffff_60%,#f8fafc_100%)] px-4 py-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-emerald-700 shadow-sm">
              <TicketPercent size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-black tracking-tight text-slate-900">
                  {editingOfferId ? 'Editar oferta' : 'Nueva oferta'}
                </h3>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700">
                  {getCanonicalOfferTypeLabel(offerForm.benefitType)}
                </span>
                {subtypeLabel ? (
                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                    {subtypeLabel}
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 text-[12px] font-medium text-slate-500">
                Todo en una sola pantalla, con menos pasos y menos aire vacío.
              </p>
            </div>
          </div>

          <button
            onClick={closeOfferModal}
            className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
          >
            <X size={16} strokeWidth={3} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-3 overflow-hidden bg-slate-50 p-3 lg:grid-cols-[minmax(320px,0.88fr)_minmax(0,1.12fr)]">
          <div className="min-h-0 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
            <div className="space-y-3">
              <Section
                eyebrow="Base"
                title="Nombre y tipo"
                hint="Elegí la clase de oferta y nombrala de forma clara."
                aside={
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                    {offerResolvedProducts.length} productos
                  </span>
                }
              >
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Ej: Promo finde, Cupón Instagram, Combo cumple..."
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[13px] font-bold text-slate-800 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                    value={offerForm.name}
                    onChange={(e) => setOfferForm({ ...offerForm, name: e.target.value })}
                  />

                  <div className="grid gap-2 sm:grid-cols-2">
                    {canonicalOfferOptions.map((option) => {
                      const active = offerForm.benefitType === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => handleOfferBenefitTypeChange(option.value)}
                          className={`rounded-2xl border px-3 py-3 text-left transition-all ${
                            active
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
              </Section>

              <Section eyebrow="Configuración" title="Cómo se aplica" hint={activeOption?.description}>
                <div className="space-y-3">
                  {!isCoupon ? (
                    <div className="space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Alcance</p>
                      <div className="grid gap-2 sm:grid-cols-3">
                        <ChipButton active={offerForm.scopeMode === 'products' || isCombo} onClick={() => handleOfferScopeChange('products')}>
                          Productos
                        </ChipButton>
                        <ChipButton active={offerForm.scopeMode === 'category'} onClick={() => handleOfferScopeChange('category')} disabled={isCombo}>
                          Categoría
                        </ChipButton>
                        <ChipButton active={offerForm.scopeMode === 'all_products'} onClick={() => handleOfferScopeChange('all_products')} disabled={isCombo}>
                          Todo
                        </ChipButton>
                      </div>

                      {offerForm.scopeMode === 'category' && !isCombo ? (
                        <select
                          value={offerForm.categoryName}
                          onChange={(e) => setOfferForm({ ...offerForm, categoryName: e.target.value })}
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[13px] font-bold text-slate-800 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                        >
                          <option value="">Elegí una categoría</option>
                          {categories.map((categoryName) => (
                            <option key={categoryName} value={categoryName}>
                              {categoryName}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </div>
                  ) : null}

                  {isFree ? (
                    <div className="grid grid-cols-3 gap-2">
                      {['2x1', '3x2', '4x3'].map((mode) => (
                        <ChipButton key={mode} active={offerForm.freeMode === mode} onClick={() => setOfferForm({ ...offerForm, freeMode: mode })}>
                          {mode}
                        </ChipButton>
                      ))}
                    </div>
                  ) : null}

                  {isCombo ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-emerald-600">$</span>
                        <input
                          type="number"
                          placeholder="Precio final"
                          className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-8 pr-3 text-[13px] font-black text-slate-800 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                          value={offerForm.offerPrice}
                          onChange={(e) => setOfferForm({ ...offerForm, offerPrice: e.target.value })}
                        />
                      </div>
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700">Base actual</p>
                        <p className="mt-1 text-sm font-black text-emerald-900"><FancyPrice amount={offerWizardSuggestedOriginalPrice} /></p>
                      </div>
                    </div>
                  ) : null}

                  {isDiscount ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-3 gap-2">
                        <ChipButton active={offerForm.discountMode === 'unit'} onClick={() => setOfferForm({ ...offerForm, discountMode: 'unit' })}>Unidad</ChipButton>
                        <ChipButton active={offerForm.discountMode === 'total'} onClick={() => setOfferForm({ ...offerForm, discountMode: 'total' })}>Total</ChipButton>
                        <ChipButton active={offerForm.discountMode === 'percentage'} onClick={() => setOfferForm({ ...offerForm, discountMode: 'percentage' })}>%</ChipButton>
                      </div>
                      <div className="relative max-w-[240px]">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-emerald-600">
                          {offerForm.discountMode === 'percentage' ? '%' : '$'}
                        </span>
                        <input
                          type="number"
                          className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-8 pr-3 text-[13px] font-black text-slate-800 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                          value={offerForm.discountValue}
                          onChange={(e) => setOfferForm({ ...offerForm, discountValue: e.target.value })}
                        />
                      </div>
                    </div>
                  ) : null}

                  {isCoupon ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        placeholder="Código del cupón"
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[13px] font-black uppercase text-slate-800 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                        value={offerForm.couponCode}
                        onChange={(e) => setOfferForm({ ...offerForm, couponCode: e.target.value.toUpperCase() })}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <ChipButton active={offerForm.discountMode === 'total'} onClick={() => setOfferForm({ ...offerForm, discountMode: 'total' })}>Monto fijo</ChipButton>
                        <ChipButton active={offerForm.discountMode === 'percentage'} onClick={() => setOfferForm({ ...offerForm, discountMode: 'percentage' })}>Porcentaje</ChipButton>
                      </div>
                      <div className="relative max-w-[240px]">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-emerald-600">
                          {offerForm.discountMode === 'percentage' ? '%' : '$'}
                        </span>
                        <input
                          type="number"
                          className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-8 pr-3 text-[13px] font-black text-slate-800 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                          value={offerForm.discountValue}
                          onChange={(e) => setOfferForm({ ...offerForm, discountValue: e.target.value })}
                        />
                      </div>
                    </div>
                  ) : null}

                  {isWholesale ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input
                        type="number"
                        placeholder="Cantidad mínima"
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[13px] font-black text-slate-800 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                        value={offerForm.itemsCount}
                        onChange={(e) => setOfferForm({ ...offerForm, itemsCount: e.target.value })}
                      />
                      <input
                        type="number"
                        placeholder="Precio unitario"
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-[13px] font-black text-slate-800 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                        value={offerForm.offerPrice}
                        onChange={(e) => setOfferForm({ ...offerForm, offerPrice: e.target.value })}
                      />
                    </div>
                  ) : null}
                </div>
              </Section>
            </div>
          </div>

          <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">
                    {isCoupon ? 'Vista rápida' : 'Selección de productos'}
                  </p>
                  <p className="text-[11px] leading-4 text-slate-500">
                    {isCoupon
                      ? 'El cupón no necesita productos vinculados.'
                      : manualSelection
                      ? 'Agregá y quitá productos sin cambiar de pantalla.'
                      : offerForm.scopeMode === 'category'
                      ? 'La oferta se resolverá por categoría.'
                      : 'La oferta aplicará a todo el inventario.'}
                  </p>
                </div>
                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                  {offerResolvedProducts.length} items
                </span>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden p-3">
              {isCoupon ? (
                <div className="grid h-full gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">Código</p>
                    <p className="mt-2 text-2xl font-black tracking-tight text-emerald-900">{offerForm.couponCode || 'SIN-CODIGO'}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Beneficio</p>
                    <p className="mt-2 text-xl font-black text-slate-900">
                      {offerForm.discountMode === 'percentage'
                        ? `${Number(offerForm.discountValue || 0)}%`
                        : <FancyPrice amount={Number(offerForm.discountValue || 0)} />}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid h-full gap-3 lg:grid-cols-2">
                  <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                    <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-2.5">
                      <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Buscar producto..."
                          className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-3 text-[12px] font-medium outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                          value={offerProductSearch}
                          onChange={(e) => setOfferProductSearch(e.target.value)}
                          disabled={!manualSelection}
                        />
                      </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto p-2 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }} onScroll={offerModalAvailableFeed.handleScroll}>
                      {manualSelection ? (
                        availableProductsForOffer.length > 0 ? (
                          <div className="space-y-1.5">
                            {offerModalAvailableFeed.visibleItems.map((product) => (
                              <ProductRow
                                key={product.id}
                                product={product}
                                subtitle={<FancyPrice amount={Number(product.price || 0)} />}
                                onAdd={handleAddProductToOffer}
                                showComboPricing={isCombo}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="flex min-h-[220px] items-center justify-center px-6 text-center text-sm font-medium text-slate-400">
                            {offerProductSearch ? 'No encontramos productos para esa búsqueda.' : 'No hay más productos para sumar.'}
                          </div>
                        )
                      ) : (
                        <div className="flex h-full min-h-[220px] items-center justify-center px-6 text-center">
                          <div>
                            <p className="text-sm font-black text-slate-700">
                              {offerForm.scopeMode === 'category' ? 'La categoría define la selección.' : 'Se aplicará a todo el inventario.'}
                            </p>
                            <p className="mt-1 text-[12px] leading-5 text-slate-500">
                              No hace falta elegir productos manualmente en este modo.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50/50">
                    <div className="shrink-0 border-b border-emerald-200 bg-white/70 px-3 py-2.5">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">Incluidos</p>
                      <p className="text-[11px] leading-4 text-emerald-800/80">
                        {manualSelection ? 'Productos elegidos para la oferta.' : 'Vista previa del alcance actual.'}
                      </p>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto p-2 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }} onScroll={offerModalIncludedFeed.handleScroll}>
                      {offerResolvedProducts.length > 0 ? (
                        <div className="space-y-1.5">
                          {offerModalIncludedFeed.visibleItems.map((product) => (
                            <ProductRow
                              key={product.id}
                              product={product}
                              subtitle="Producto alcanzado por la oferta"
                              onRemove={handleRemoveProductFromOffer}
                              removable={canRemoveItems}
                              onQuantityChange={handleUpdateProductQuantityInOffer}
                              showQuantityControls={isCombo}
                              showComboPricing={isCombo}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="flex h-full min-h-[220px] items-center justify-center px-6 text-center">
                          <div>
                            <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full border border-emerald-200 bg-white text-emerald-400">
                              <Package size={18} />
                            </div>
                            <p className="text-sm font-black text-emerald-900">Todavía no hay productos seleccionados.</p>
                            <p className="mt-1 text-[12px] leading-5 text-emerald-800/80">
                              Sumalos desde la columna izquierda o cambiá el alcance de la oferta.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3">
          <p className="text-[11px] font-medium text-slate-400">
            {editingOfferId ? 'Estás editando una oferta existente.' : 'Se guardará una oferta nueva en el catálogo.'}
          </p>
          <div className="flex gap-2">
            <button onClick={closeOfferModal} className="rounded-xl px-4 py-2.5 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-100">
              Cancelar
            </button>
            <button
              onClick={handleSaveOfferWizard}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-black text-white shadow-lg shadow-emerald-200 transition-all hover:bg-emerald-700"
            >
              <Save size={15} strokeWidth={3} />
              Guardar oferta
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
