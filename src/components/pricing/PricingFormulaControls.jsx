import React from 'react';
import { ArrowRight, Calculator, Percent } from 'lucide-react';
import { FancyPrice } from '../FancyPrice';
import {
  DEFAULT_VAT_PERCENT,
  GROSS_MARGIN_PRESETS,
  getGrossMarginSaleMultiplier,
} from '../../utils/grossMarginPricing';

const formatMultiplier = (value) => Number(value || 0).toLocaleString('es-AR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export const PricingFormulaControls = ({
  marginPercent,
  onMarginChange,
  costIncludesVat = true,
  onCostIncludesVatChange,
  showVatMode = false,
  dark = false,
  compact = false,
  flat = false,
  explainMultiplier = false,
}) => {
  const shellClass = dark
    ? 'border-slate-700/80 bg-slate-950/25 text-slate-100'
    : 'border-slate-200 bg-white text-slate-800';
  const mutedClass = dark ? 'text-slate-400' : 'text-slate-500';
  const controlClass = dark
    ? 'border-slate-700 bg-[#07111f] text-white'
    : 'border-slate-200 bg-slate-50 text-slate-900';
  const activeMarginClass = dark
    ? 'border-emerald-400/70 bg-emerald-400/15 text-emerald-100'
    : 'border-emerald-400 bg-emerald-50 text-emerald-800';
  const inactiveMarginClass = dark
    ? 'border-slate-700 bg-slate-900/70 text-slate-300 hover:border-emerald-400/60 hover:text-emerald-100'
    : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700';
  const currentMultiplier = getGrossMarginSaleMultiplier(marginPercent);

  return (
    <div className={flat ? '' : `rounded-lg border ${compact ? 'p-2' : 'p-2.5'} ${shellClass}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.12em] ${mutedClass}`}>
          <Calculator size={12} /> Margen real sobre la venta
        </span>
        {explainMultiplier && currentMultiplier > 0 ? (
          <span className={`text-[9px] font-black tabular-nums ${dark ? 'text-emerald-200' : 'text-emerald-700'}`}>
            Venta ×{formatMultiplier(currentMultiplier)}
          </span>
        ) : (
          <span className={`text-[9px] font-bold tabular-nums ${mutedClass}`}>IVA {String(DEFAULT_VAT_PERCENT).replace('.', ',')}%</span>
        )}
      </div>

      <div className={`mt-2 grid gap-2 ${explainMultiplier ? 'grid-cols-2' : 'grid-cols-[1fr_72px]'}`}>
        <div className={`grid gap-1 ${explainMultiplier ? 'col-span-2 grid-cols-2' : 'grid-cols-4'}`}>
          {GROSS_MARGIN_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => onMarginChange?.(preset)}
              aria-pressed={Number(marginPercent) === preset}
              aria-label={explainMultiplier ? `${preset}% de margen real, venta por ${formatMultiplier(getGrossMarginSaleMultiplier(preset))}` : undefined}
              className={`${explainMultiplier ? 'flex h-12 flex-col items-start justify-center px-2.5 text-left' : 'h-8'} rounded-md border text-[10px] font-black tabular-nums transition-colors ${
                Number(marginPercent) === preset
                  ? activeMarginClass
                  : inactiveMarginClass
              }`}
            >
              {explainMultiplier ? (
                <>
                  <span className="whitespace-nowrap text-[11px]">Venta ×{formatMultiplier(getGrossMarginSaleMultiplier(preset))}</span>
                  <span className={`mt-0.5 whitespace-nowrap text-[8px] ${Number(marginPercent) === preset ? 'opacity-80' : mutedClass}`}>{preset}% margen real</span>
                </>
              ) : `${preset}%`}
            </button>
          ))}
        </div>
        <label className={`${explainMultiplier ? 'col-span-2' : ''} flex h-8 overflow-hidden rounded-md border ${controlClass}`}>
          {explainMultiplier ? (
            <span className={`flex items-center px-2 text-[9px] font-black uppercase tracking-wide ${mutedClass}`}>Otro margen</span>
          ) : null}
          <input
            type="text"
            inputMode="decimal"
            aria-label="Margen real manual"
            value={marginPercent}
            onChange={(event) => onMarginChange?.(event.target.value)}
            className="min-w-0 flex-1 bg-transparent px-2 text-right text-xs font-black tabular-nums outline-none"
          />
          <span className={`flex w-6 items-center justify-center border-l ${dark ? 'border-slate-700' : 'border-slate-200'} ${mutedClass}`}>
            <Percent size={11} />
          </span>
          {explainMultiplier && currentMultiplier > 0 ? (
            <span className={`flex min-w-[76px] items-center justify-center gap-1 border-l px-2 text-[9px] font-black tabular-nums ${dark ? 'border-slate-700 text-emerald-200' : 'border-slate-200 text-emerald-700'}`}>
              <ArrowRight size={10} /> venta ×{formatMultiplier(currentMultiplier)}
            </span>
          ) : null}
        </label>
      </div>

      {showVatMode ? (
        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className={`text-[9px] font-black uppercase tracking-[0.12em] ${mutedClass}`}>El costo cargado</span>
            <span className={`text-[9px] font-bold tabular-nums ${mutedClass}`}>IVA {String(DEFAULT_VAT_PERCENT).replace('.', ',')}%</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { value: true, label: 'Ya incluye IVA' },
              { value: false, label: 'No incluye IVA' },
            ].map((option) => (
              <button
                key={String(option.value)}
                type="button"
                onClick={() => onCostIncludesVatChange?.(option.value)}
                aria-pressed={costIncludesVat === option.value}
                className={`h-8 rounded-md border text-[9px] font-black transition-colors ${
                  costIncludesVat === option.value
                    ? dark
                      ? 'border-sky-400/35 bg-sky-400/15 text-sky-100'
                      : 'border-sky-300 bg-sky-50 text-sky-800'
                    : dark
                      ? 'border-slate-700 text-slate-400 hover:text-slate-200'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <p className={`mt-2 text-[9px] font-bold leading-snug ${mutedClass}`}>
        {showVatMode && costIncludesVat
          ? `${marginPercent}% de margen significa que el costo ocupa ${100 - Number(marginPercent || 0)}% del precio final.`
          : `Primero suma IVA al costo; después reserva ${marginPercent}% del precio final como margen real.`}
      </p>
    </div>
  );
};

export const PricingFormulaTrace = ({
  baseCost,
  realCost,
  salePrice,
  marginPercent,
  excelSalePrice = null,
  dark = false,
  flat = false,
}) => {
  const labelClass = dark ? 'text-slate-500' : 'text-slate-400';
  const separatorClass = dark ? 'text-slate-600' : 'text-slate-300';

  return (
    <div className={`flex flex-wrap items-center gap-1.5 text-[9px] font-black tabular-nums ${
      flat
        ? `border-t pt-2 ${dark ? 'border-slate-700/70' : 'border-slate-200'}`
        : `rounded-md border px-2 py-1.5 ${dark ? 'border-slate-700/70 bg-slate-950/25' : 'border-slate-200 bg-slate-50/80'}`
    }`}>
      <span className={labelClass}>Base</span>
      <span className={dark ? 'text-violet-200' : 'text-violet-700'}><FancyPrice amount={baseCost} /></span>
      <span className={separatorClass}>→</span>
      <span className={dark ? 'text-amber-200' : 'text-amber-700'}>+ IVA {String(DEFAULT_VAT_PERCENT).replace('.', ',')}%</span>
      <span className={separatorClass}>→</span>
      <span className={labelClass}>Costo real</span>
      <span className={dark ? 'text-sky-200' : 'text-sky-700'}><FancyPrice amount={realCost} /></span>
      <span className={separatorClass}>→</span>
      <span className={dark ? 'text-emerald-200' : 'text-emerald-700'}>
        {marginPercent}% margen · venta ×{formatMultiplier(getGrossMarginSaleMultiplier(marginPercent))}
      </span>
      <span className={separatorClass}>→</span>
      <span className={dark ? 'text-emerald-100' : 'text-emerald-800'}>Venta <FancyPrice amount={salePrice} /></span>
      {Number(excelSalePrice) > 0 ? (
        <span className={`ml-auto ${labelClass}`}>Excel <FancyPrice amount={excelSalePrice} /></span>
      ) : null}
    </div>
  );
};
