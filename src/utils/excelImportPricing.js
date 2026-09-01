import {
  calculateGrossMarginPricing,
  DEFAULT_GROSS_MARGIN_PERCENT,
} from './grossMarginPricing.js';
import { normalizeFinalPurchaseCost } from './finalPurchaseCost.js';

const divideLotValue = (value, multiplier) => {
  const safeMultiplier = Number(multiplier || 0);
  if (!Number.isFinite(safeMultiplier) || safeMultiplier <= 0) return 0;
  return Math.ceil(Number(value || 0) / safeMultiplier);
};

export const calculateExcelImportUnitPricing = ({
  lotCost,
  lotSalePrice,
  multiplier = 1,
  marginPercent = DEFAULT_GROSS_MARGIN_PERCENT,
} = {}) => {
  const safeMultiplier = Number(multiplier || 0);
  const baseCost = Number.isFinite(safeMultiplier) && safeMultiplier > 0
    ? Number(lotCost || 0) / safeMultiplier
    : 0;
  const pricing = calculateGrossMarginPricing({
    cost: baseCost,
    costIncludesVat: false,
    marginPercent,
  });

  return {
    ...pricing,
    baseCost,
    excelSalePrice: divideLotValue(lotSalePrice, safeMultiplier),
  };
};

export const repriceExcelImportEntryForMargin = (
  entry = {},
  marginPercent = DEFAULT_GROSS_MARGIN_PERCENT,
) => {
  if (entry.salePriceEdited || Number(entry.cost || 0) <= 0) return entry;
  const pricing = calculateGrossMarginPricing({
    cost: entry.cost,
    costIncludesVat: true,
    marginPercent,
  });
  if (!pricing.isValid) return entry;
  return {
    ...entry,
    salePrice: pricing.salePrice,
    salePriceInput: String(pricing.salePrice),
  };
};

export const repriceExcelImportEntryForRealCost = (
  entry = {},
  realCost = 0,
  marginPercent = DEFAULT_GROSS_MARGIN_PERCENT,
) => {
  const normalizedRealCost = normalizeFinalPurchaseCost(realCost);
  const pricing = calculateGrossMarginPricing({
    cost: normalizedRealCost,
    costIncludesVat: true,
    marginPercent,
  });
  return {
    ...entry,
    cost: normalizedRealCost,
    baseCost: pricing.baseCost,
    costEdited: true,
    ...(!entry.salePriceEdited
      ? {
          salePrice: pricing.salePrice,
          salePriceInput: pricing.salePrice ? String(pricing.salePrice) : '',
        }
      : {}),
  };
};

export const repriceExcelImportEntryForMultiplier = (
  entry = {},
  multiplier = 1,
  marginPercent = DEFAULT_GROSS_MARGIN_PERCENT,
) => {
  const pricing = calculateExcelImportUnitPricing({
    lotCost: entry.lotCost ?? entry.cost,
    lotSalePrice: entry.lotSalePrice ?? entry.excelSalePrice,
    multiplier,
    marginPercent,
  });
  return {
    ...entry,
    multiplier: Number(multiplier || 0),
    baseCost: pricing.baseCost,
    excelSalePrice: pricing.excelSalePrice,
    cost: pricing.realCost,
    costInput: pricing.realCost ? String(pricing.realCost) : '',
    salePrice: pricing.salePrice,
    salePriceInput: pricing.salePrice ? String(pricing.salePrice) : '',
    costEdited: false,
    salePriceEdited: false,
  };
};
