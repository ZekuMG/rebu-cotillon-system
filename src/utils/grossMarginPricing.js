export const GROSS_MARGIN_FORMULA_VERSION = 'gross-margin-v1';
export const GROSS_MARGIN_PREFERENCE_STORAGE_KEY = 'rebu_gross_margin_pricing_v1';
export const DEFAULT_VAT_PERCENT = 10.5;
export const DEFAULT_GROSS_MARGIN_PERCENT = 50;
export const GROSS_MARGIN_PRESETS = Object.freeze([40, 50, 60, 70]);

export const DEFAULT_GROSS_MARGIN_PREFERENCES = Object.freeze({
  marginPercent: DEFAULT_GROSS_MARGIN_PERCENT,
  bulkCostIncludesVat: true,
});

const parsePercent = (value) => {
  const normalized = typeof value === 'string' ? value.trim().replace(',', '.') : value;
  const numberValue = Number(normalized);
  return Number.isFinite(numberValue) ? numberValue : null;
};

export const normalizeGrossMarginPercent = (
  value,
  fallback = DEFAULT_GROSS_MARGIN_PERCENT,
) => {
  const numberValue = parsePercent(value);
  if (numberValue === null || numberValue < 0 || numberValue >= 100) return fallback;
  return numberValue;
};

export const getGrossMarginSaleMultiplier = (marginPercent) => {
  const parsedMargin = parsePercent(marginPercent);
  if (parsedMargin === null || parsedMargin < 0 || parsedMargin >= 100) return 0;
  return 1 / (1 - (parsedMargin / 100));
};

export const roundUpToCommercialTen = (value = 0) => {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return 0;
  return Math.ceil(numberValue / 10) * 10;
};

const buildInvalidPricing = ({ marginPercent, vatPercent }) => ({
  isValid: false,
  baseCost: 0,
  vatAmount: 0,
  realCost: 0,
  rawRealCost: 0,
  rawSalePrice: 0,
  salePrice: 0,
  marginPercent: Number.isFinite(marginPercent) ? marginPercent : DEFAULT_GROSS_MARGIN_PERCENT,
  vatPercent: Number.isFinite(vatPercent) ? vatPercent : DEFAULT_VAT_PERCENT,
});

export const calculateGrossMarginPricing = ({
  cost,
  costIncludesVat = false,
  marginPercent = DEFAULT_GROSS_MARGIN_PERCENT,
  vatPercent,
  vatRate: providedVatRate,
} = {}) => {
  const costValue = Number(cost);
  const parsedMargin = parsePercent(marginPercent);
  const parsedVatPercent = parsePercent(vatPercent);
  const parsedVatRate = parsePercent(providedVatRate);
  const parsedVat = parsedVatPercent !== null
    ? parsedVatPercent
    : parsedVatRate !== null
      ? (parsedVatRate <= 1 ? parsedVatRate * 100 : parsedVatRate)
      : DEFAULT_VAT_PERCENT;

  if (
    !Number.isFinite(costValue) ||
    costValue <= 0 ||
    parsedMargin === null ||
    parsedMargin < 0 ||
    parsedMargin >= 100 ||
    parsedVat === null ||
    parsedVat < 0
  ) {
    return buildInvalidPricing({ marginPercent: parsedMargin, vatPercent: parsedVat });
  }

  const vatRate = parsedVat / 100;
  const marginRate = parsedMargin / 100;
  const rawRealCost = costIncludesVat ? costValue : costValue * (1 + vatRate);
  const baseCost = costIncludesVat && vatRate > 0 ? costValue / (1 + vatRate) : costValue;
  const rawSalePrice = rawRealCost / (1 - marginRate);

  return {
    isValid: true,
    baseCost,
    vatAmount: Math.max(0, rawRealCost - baseCost),
    realCost: Math.ceil(rawRealCost),
    rawRealCost,
    rawSalePrice,
    salePrice: roundUpToCommercialTen(rawSalePrice),
    marginPercent: parsedMargin,
    vatPercent: parsedVat,
  };
};

export const loadGrossMarginPreferences = (storage) => {
  try {
    const rawValue = storage?.getItem?.(GROSS_MARGIN_PREFERENCE_STORAGE_KEY);
    if (!rawValue) return { ...DEFAULT_GROSS_MARGIN_PREFERENCES };
    const storedValue = JSON.parse(rawValue);
    return {
      marginPercent: normalizeGrossMarginPercent(
        storedValue?.marginPercent,
        DEFAULT_GROSS_MARGIN_PERCENT,
      ),
      bulkCostIncludesVat: storedValue?.bulkCostIncludesVat !== false,
    };
  } catch {
    return { ...DEFAULT_GROSS_MARGIN_PREFERENCES };
  }
};

export const saveGrossMarginPreferences = (storage, preferences = {}) => {
  const normalizedPreferences = {
    marginPercent: normalizeGrossMarginPercent(
      preferences.marginPercent,
      DEFAULT_GROSS_MARGIN_PERCENT,
    ),
    bulkCostIncludesVat: preferences.bulkCostIncludesVat !== false,
  };

  try {
    storage?.setItem?.(
      GROSS_MARGIN_PREFERENCE_STORAGE_KEY,
      JSON.stringify(normalizedPreferences),
    );
    return true;
  } catch {
    return false;
  }
};
