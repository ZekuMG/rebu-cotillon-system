import React from 'react';
import { Calculator, Percent } from 'lucide-react';
import { FancyPrice } from '../FancyPrice';
import {
  DEFAULT_VAT_PERCENT,
  GROSS_MARGIN_PRESETS,
} from '../../utils/grossMarginPricing';

export const PricingFormulaControls = ({
  marginPercent,
  onMarginChange,
  costIncludesVat = true,
  onCostIncludesVatChange,
  showVatMode = false,
  dark = false,
  compact = false,
}) => {
  const shellClass = dark
    ? 'border-slate-700/80 bg-slate-950/25 text-slate-100'
    : 'border-slate-200 bg-white text-slate-800';
  const mutedClass = dark ? 'text-slate-400' : 'text-slate-500';
  const controlClass = dark
    ? 'border-slate-700 bg-[#07111f] text-white'
    : 'border-slate-200 bg-slate-50 text-slate-900';

  return (
    <div className={`rounded-lg border ${compact ? 'p-2' : 'p-2.5'} ${shellClass}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.12em] ${mutedClass}`}>
          <Calculator size={12} /> Margen bruto real
        </span>
        <span className={`text-[9px] font-bold tabular-nums ${mutedClass}`}>IVA {String(DEFAULT_VAT_PERCENT).replace('.', ',')}%</span>
      </div>

      <div className="mt-2 grid grid-cols-[1fr_72px] gap-2">
        <div className="grid grid-cols-4 gap-1">
          {GROSS_MARGIN_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => onMarginChange?.(preset)}
              aria-pressed={Number(marginPercent) === preset}
              className={`h-8 rounded-md border text-[10px] font-black tabular-nums transition-colors ${
                Number(marginPercent) === preset
                  ? 'border-emerald-500 bg-emerald-500 text-white'
                  : dark
                    ? 'border-slate-700 bg-slate-900/70 text-slate-300 hover:border-emerald-400/60 hover:text-emerald-100'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-emerald-300 hover:text-emerald-700'
              }`}
            >
              {preset}%
            </button>
          ))}
        </div>
        <label className={`flex h-8 overflow-hidden rounded-md border ${controlClass}`}>
          <input
            type="text"
            inputMode="decimal"
            aria-label="Margen bruto manual"
            value={marginPercent}
            onChange={(event) => onMarginChange?.(event.target.value)}
            className="min-w-0 flex-1 bg-transparent px-2 text-right text-xs font-black tabular-nums outline-none"
          />
          <span className={`flex w-6 items-center justify-center border-l ${dark ? 'border-slate-700' : 'border-slate-200'} ${mutedClass}`}>
            <Percent size={11} />
          </span>
        </label>
      </div>

      {showVatMode ? (
        <div className="mt-2 grid grid-cols-2 gap-1 rounded-md border border-current/10 p-1">
          {[
            { value: true, label: 'IVA ya incluido' },
            { value: false, label: 'Costo sin IVA' },
          ].map((option) => (
            <button
              key={String(option.value)}
              type="button"
              onClick={() => onCostIncludesVatChange?.(option.value)}
              aria-pressed={costIncludesVat === option.value}
              className={`h-7 rounded text-[9px] font-black transition-colors ${
                costIncludesVat === option.value
                  ? dark
                    ? 'bg-sky-400/18 text-sky-100 ring-1 ring-sky-400/35'
                    : 'bg-sky-50 text-sky-800 ring-1 ring-sky-200'
                  : mutedClass
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}

      <p className={`mt-2 text-[9px] font-bold leading-snug ${mutedClass}`}>
        {showVatMode && costIncludesVat
          ? 'Costo real ÷ (1 − margen) = venta sugerida.'
          : 'Costo base × 1,105 → costo real ÷ (1 − margen) = venta sugerida.'}
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
}) => {
  const labelClass = dark ? 'text-slate-500' : 'text-slate-400';
  const separatorClass = dark ? 'text-slate-600' : 'text-slate-300';

  return (
    <div className={`flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5 text-[9px] font-black tabular-nums ${
      dark ? 'border-slate-700/70 bg-slate-950/25' : 'border-slate-200 bg-slate-50/80'
    }`}>
      <span className={labelClass}>Base</span>
      <span className={dark ? 'text-violet-200' : 'text-violet-700'}><FancyPrice amount={baseCost} /></span>
      <span className={separatorClass}>→</span>
      <span className={dark ? 'text-amber-200' : 'text-amber-700'}>+ IVA {String(DEFAULT_VAT_PERCENT).replace('.', ',')}%</span>
      <span className={separatorClass}>→</span>
      <span className={labelClass}>Costo real</span>
      <span className={dark ? 'text-sky-200' : 'text-sky-700'}><FancyPrice amount={realCost} /></span>
      <span className={separatorClass}>→</span>
      <span className={dark ? 'text-emerald-200' : 'text-emerald-700'}>{marginPercent}% margen</span>
      <span className={separatorClass}>→</span>
      <span className={dark ? 'text-emerald-100' : 'text-emerald-800'}>Venta <FancyPrice amount={salePrice} /></span>
      {Number(excelSalePrice) > 0 ? (
        <span className={`ml-auto ${labelClass}`}>Excel <FancyPrice amount={excelSalePrice} /></span>
      ) : null}
    </div>
  );
};
