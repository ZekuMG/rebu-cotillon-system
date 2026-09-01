import {
  calculateGrossMarginPricing,
  DEFAULT_GROSS_MARGIN_PERCENT,
  DEFAULT_VAT_PERCENT,
  roundUpToCommercialTen,
} from './grossMarginPricing.js';
import { normalizeStoredProductPurchaseCost } from './finalPurchaseCost.js';

const DAY_MS = 24 * 60 * 60 * 1000;
export const OUT_OF_STOCK_INACTIVE_DAYS = 90;
export const CASA_ALBERTO_PROVIDER_NAME = 'Cotillon Casa Alberto';
export const CASA_ALBERTO_COST_EXTRA_RATE = DEFAULT_VAT_PERCENT / 100;
export const CASA_ALBERTO_SALE_MARKUP_RATE = DEFAULT_GROSS_MARGIN_PERCENT / 100;

export const normalizeProductPurchasePrice = (value = 0, productType = 'quantity') =>
  normalizeStoredProductPurchaseCost(value, productType);

export const normalizeProductLinkText = (value = '') =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(x|x1|unidad|unidades|un|u)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const normalizeProductLinkCode = (value = '') =>
  String(value ?? '').trim().replace(/\s+/g, '');

export const getProductSupplierLinks = (product = {}) => {
  const links = product?.supplierLinks || product?.supplier_links;
  return links && typeof links === 'object' && !Array.isArray(links) ? links : {};
};

export const hasHydratedSupplierLinks = (product = {}) =>
  Object.prototype.hasOwnProperty.call(product || {}, 'supplier_links');

export const getCasaAlbertoLink = (product = {}) => {
  const link = getProductSupplierLinks(product).casa_alberto;
  return link && typeof link === 'object' && !Array.isArray(link) ? link : {};
};

export const getCasaAlbertoPriceTracking = (product = {}) => {
  const tracking = getCasaAlbertoLink(product).price_tracking;
  return tracking && typeof tracking === 'object' && !Array.isArray(tracking) ? tracking : {};
};

export const productHasCasaAlbertoLink = (product = {}) => {
  const link = getCasaAlbertoLink(product);
  return Boolean(
    String(link.casaAlbertoId || '').trim() ||
    String(link.productUrl || '').trim() ||
    String(link.providerCode || '').trim()
  );
};

export const buildCasaAlbertoGroupKey = (product = {}) => {
  const link = getCasaAlbertoLink(product);
  const id = String(link.casaAlbertoId || '').trim();
  if (id) return `id:${id}`;
  const url = String(link.productUrl || '').trim();
  if (url) return `url:${url}`;
  const code = String(link.providerCode || '').trim();
  if (code) return `code:${code}`;
  return `product:${product?.id || Math.random()}`;
};

const normalizeSupplierTrackingPrice = (value) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const hasOwn = (source, key) => Object.prototype.hasOwnProperty.call(source, key);

const pickLinkString = (link = {}, keys = [], fallback = '') => {
  const key = keys.find((entry) => hasOwn(link, entry) && link[entry] !== undefined && link[entry] !== null);
  const value = key ? link[key] : fallback;
  return String(value ?? '').trim();
};

export const buildCasaAlbertoEstimatedCost = (supplierPrice = 0, options = {}) => {
  const vatPercent = Number.isFinite(Number(options.vatPercent))
    ? Number(options.vatPercent)
    : Number.isFinite(Number(options.vatRate))
      ? Number(options.vatRate) * 100
      : Number.isFinite(Number(options.costExtraRate))
        ? Number(options.costExtraRate) * 100
        : DEFAULT_VAT_PERCENT;
  const pricing = calculateGrossMarginPricing({
    cost: supplierPrice,
    costIncludesVat: false,
    marginPercent: DEFAULT_GROSS_MARGIN_PERCENT,
    vatPercent,
  });
  return pricing.isValid ? normalizeProductPurchasePrice(pricing.realCost) : 0;
};

export const roundUpToNextTen = (value = 0) => {
  return roundUpToCommercialTen(value);
};

export const buildSuggestedSalePriceFromMargin = (product = {}, supplierPrice = 0, options = {}) => {
  const marginPercent = Number.isFinite(Number(options.grossMarginPercent))
    ? Number(options.grossMarginPercent)
    : Number.isFinite(Number(options.grossMarginRate))
      ? Number(options.grossMarginRate) * 100
      : Number.isFinite(Number(options.saleMarkupRate))
        ? Number(options.saleMarkupRate) * 100
        : DEFAULT_GROSS_MARGIN_PERCENT;
  const vatPercent = Number.isFinite(Number(options.vatPercent))
    ? Number(options.vatPercent)
    : Number.isFinite(Number(options.vatRate))
      ? Number(options.vatRate) * 100
      : Number.isFinite(Number(options.costExtraRate))
        ? Number(options.costExtraRate) * 100
        : DEFAULT_VAT_PERCENT;
  const pricing = calculateGrossMarginPricing({
    cost: supplierPrice,
    costIncludesVat: false,
    marginPercent,
    vatPercent,
  });
  return pricing.isValid ? pricing.salePrice : Number(product.price || 0) || 0;
};

export const upsertCasaAlbertoLink = (
  supplierLinks = {},
  link = {},
  now = new Date().toISOString(),
) => {
  const safeLinks = supplierLinks && typeof supplierLinks === 'object' && !Array.isArray(supplierLinks)
    ? supplierLinks
    : {};
  const previousCasaAlberto = safeLinks.casa_alberto && typeof safeLinks.casa_alberto === 'object'
    ? safeLinks.casa_alberto
    : {};

  const casaAlbertoId = pickLinkString(link, ['casaAlbertoId', 'externalProductId'], previousCasaAlberto.casaAlbertoId);
  const providerCode = pickLinkString(link, ['providerCode', 'supplierCode'], previousCasaAlberto.providerCode);
  const productUrl = pickLinkString(link, ['productUrl'], previousCasaAlberto.productUrl);
  const foundTitle = pickLinkString(link, ['foundTitle', 'supplierTitle'], previousCasaAlberto.foundTitle);

  return {
    ...safeLinks,
    casa_alberto: {
      ...previousCasaAlberto,
      provider: CASA_ALBERTO_PROVIDER_NAME,
      providerCode,
      casaAlbertoId,
      productUrl,
      imageUrl: link.imageUrl ?? previousCasaAlberto.imageUrl ?? '',
      foundTitle,
      matchedBy: link.matchedBy || previousCasaAlberto.matchedBy || 'manual',
      inventoryBarcode: link.inventoryBarcode ?? previousCasaAlberto.inventoryBarcode ?? '',
      searchedQuery: link.searchedQuery ?? previousCasaAlberto.searchedQuery ?? '',
      titleSimilarity: Number(link.titleSimilarity ?? previousCasaAlberto.titleSimilarity ?? 0) || 0,
      verifiedAt: link.verifiedAt || previousCasaAlberto.verifiedAt || now,
      updatedAt: now,
    },
  };
};

export const removeCasaAlbertoLink = (supplierLinks = {}) => {
  const safeLinks = supplierLinks && typeof supplierLinks === 'object' && !Array.isArray(supplierLinks)
    ? { ...supplierLinks }
    : {};
  delete safeLinks.casa_alberto;
  return safeLinks;
};

export const upsertCasaAlbertoPriceTracking = (
  supplierLinks = {},
  trackingPatch = {},
  now = new Date().toISOString(),
) => {
  const nextLinks = upsertCasaAlbertoLink(supplierLinks, trackingPatch, now);
  const previousCasaAlberto = nextLinks.casa_alberto || {};
  const previousTracking = previousCasaAlberto.price_tracking && typeof previousCasaAlberto.price_tracking === 'object'
    ? previousCasaAlberto.price_tracking
    : {};

  const lastSupplierPrice = normalizeSupplierTrackingPrice(
    hasOwn(trackingPatch, 'lastSupplierPrice')
      ? trackingPatch.lastSupplierPrice
      : hasOwn(trackingPatch, 'supplierPrice')
        ? trackingPatch.supplierPrice
        : previousTracking.lastSupplierPrice,
  );
  const previousSupplierPrice = normalizeSupplierTrackingPrice(
    hasOwn(trackingPatch, 'previousSupplierPrice')
      ? trackingPatch.previousSupplierPrice
      : previousTracking.previousSupplierPrice ?? previousTracking.lastSupplierPrice,
  );
  const previousPurchasePrice = normalizeSupplierTrackingPrice(
    hasOwn(trackingPatch, 'previousPurchasePrice')
      ? trackingPatch.previousPurchasePrice
      : previousTracking.previousPurchasePrice,
  );
  const suggestedSalePrice = normalizeSupplierTrackingPrice(
    hasOwn(trackingPatch, 'suggestedSalePrice')
      ? trackingPatch.suggestedSalePrice
      : previousTracking.suggestedSalePrice,
  );
  const rawSupplierPrice = normalizeSupplierTrackingPrice(
    hasOwn(trackingPatch, 'rawSupplierPrice')
      ? trackingPatch.rawSupplierPrice
      : previousTracking.rawSupplierPrice ?? lastSupplierPrice,
  );
  const unitDivisorValue = Number(
    hasOwn(trackingPatch, 'unitDivisor')
      ? trackingPatch.unitDivisor
      : previousTracking.unitDivisor ?? 1,
  );
  const unitDivisor = Number.isFinite(unitDivisorValue) && unitDivisorValue > 0
    ? Math.max(1, Math.round(unitDivisorValue))
    : 1;
  const unitSupplierPrice = normalizeSupplierTrackingPrice(
    hasOwn(trackingPatch, 'unitSupplierPrice')
      ? trackingPatch.unitSupplierPrice
      : previousTracking.unitSupplierPrice ?? (rawSupplierPrice ? rawSupplierPrice / unitDivisor : rawSupplierPrice),
  );

  return {
    ...nextLinks,
    casa_alberto: {
      ...previousCasaAlberto,
      price_tracking: {
        ...previousTracking,
        ...trackingPatch,
        lastSupplierPrice,
        previousSupplierPrice,
        previousPurchasePrice,
        suggestedSalePrice,
        rawSupplierPrice,
        unitSupplierPrice,
        unitDivisor,
        reviewStatus: trackingPatch.reviewStatus || previousTracking.reviewStatus || 'unchecked',
        lastCheckedAt: trackingPatch.lastCheckedAt || previousTracking.lastCheckedAt || now,
        lastChangedAt: trackingPatch.lastChangedAt || previousTracking.lastChangedAt || null,
        approvedAt: Object.prototype.hasOwnProperty.call(trackingPatch, 'approvedAt')
          ? trackingPatch.approvedAt
          : previousTracking.approvedAt || null,
        sourceUrl: trackingPatch.sourceUrl || previousTracking.sourceUrl || previousCasaAlberto.productUrl || '',
        priceText: trackingPatch.priceText || previousTracking.priceText || '',
      },
    },
  };
};

export const getProductActiveState = (product = {}) =>
  product?.isActive !== false && product?.is_active !== false;

export const getDeletedItemInfo = (product = {}) => {
  const deletedItem = getProductSupplierLinks(product).deleted_item;
  return deletedItem && typeof deletedItem === 'object' && !Array.isArray(deletedItem)
    ? deletedItem
    : {};
};

export const isDeletedProductRecord = (product = {}) => {
  const deletedItem = getDeletedItemInfo(product);
  return Boolean(
    deletedItem.deletedAt ||
    deletedItem.reason ||
    String(product?.title || '').trim().toLowerCase().startsWith('item eliminado')
  );
};

const normalizeAlias = (alias = {}) => {
  const code = normalizeProductLinkCode(alias.code || alias.excelCode || alias.importedCode);
  const description = String(alias.description || alias.excelDescription || alias.importedDescription || '').trim();
  const normalizedCode = normalizeProductLinkCode(alias.normalizedCode || code);
  const normalizedDescription = normalizeProductLinkText(alias.normalizedDescription || description);

  return {
    ...alias,
    code,
    description,
    normalizedCode,
    normalizedDescription,
  };
};

export const getExcelImportAliases = (product = {}) => {
  const excelImport = getProductSupplierLinks(product).excel_import || {};
  const aliases = Array.isArray(excelImport.aliases) ? excelImport.aliases : [];
  const codeAliases = Array.isArray(excelImport.codes)
    ? excelImport.codes.map((code) => ({ code }))
    : [];
  const descriptionAliases = Array.isArray(excelImport.descriptions)
    ? excelImport.descriptions.map((description) => ({ description }))
    : [];

  return [...aliases, ...codeAliases, ...descriptionAliases]
    .map(normalizeAlias)
    .filter((alias) => alias.normalizedCode || alias.normalizedDescription);
};

export const productMatchesExcelAlias = (product = {}, entry = {}) => {
  const entryCode = normalizeProductLinkCode(entry.code);
  const entryDescription = normalizeProductLinkText(entry.description);
  if (!entryCode && !entryDescription) return false;

  return getExcelImportAliases(product).some((alias) => (
    (entryCode && alias.normalizedCode && alias.normalizedCode === entryCode) ||
    (entryDescription && alias.normalizedDescription && alias.normalizedDescription === entryDescription)
  ));
};

export const shouldSaveExcelImportAlias = ({
  product = null,
  entry = {},
  isNewAssociation = false,
} = {}) => Boolean(
  product
  && isNewAssociation
  && (normalizeProductLinkCode(entry.code) || normalizeProductLinkText(entry.description))
  && !productMatchesExcelAlias(product, entry)
);

export const getExcelImportApplications = (product = {}) => {
  const excelImport = getProductSupplierLinks(product).excel_import;
  if (!excelImport || typeof excelImport !== 'object' || Array.isArray(excelImport)) return [];
  const applications = Array.isArray(excelImport.applications) ? excelImport.applications : [];
  return applications.filter((application) => (
    application
    && typeof application === 'object'
    && !Array.isArray(application)
    && String(application.signature || '').trim()
  ));
};

export const productHasExcelImportApplication = (product = {}, signature = '') => {
  const safeSignature = String(signature || '').trim();
  if (!safeSignature) return false;
  return getExcelImportApplications(product).some(
    (application) => String(application.signature || '').trim() === safeSignature,
  );
};

export const recordExcelImportApplication = (
  supplierLinks = {},
  application = {},
  now = new Date().toISOString(),
) => {
  const signature = String(application.signature || '').trim().slice(0, 180);
  if (!signature) return supplierLinks || {};

  const safeLinks = supplierLinks && typeof supplierLinks === 'object' && !Array.isArray(supplierLinks)
    ? supplierLinks
    : {};
  const excelImport = safeLinks.excel_import && typeof safeLinks.excel_import === 'object' && !Array.isArray(safeLinks.excel_import)
    ? safeLinks.excel_import
    : {};
  const currentApplications = getExcelImportApplications({ supplierLinks: safeLinks });
  const nextApplication = {
    signature,
    fileFingerprint: String(application.fileFingerprint || '').trim().slice(0, 128),
    rowNumber: String(application.rowNumber ?? '').trim().slice(0, 80),
    code: normalizeProductLinkCode(application.code).slice(0, 120),
    description: String(application.description || '').trim().slice(0, 220),
    appliedAt: now,
  };
  const nextApplications = [
    nextApplication,
    ...currentApplications.filter((item) => String(item.signature || '').trim() !== signature),
  ].slice(0, 80);

  return {
    ...safeLinks,
    excel_import: {
      ...excelImport,
      applications: nextApplications,
    },
  };
};

export const upsertExcelImportAlias = (supplierLinks = {}, link = {}, now = new Date().toISOString()) => {
  const code = normalizeProductLinkCode(link.code);
  const description = String(link.description || '').trim();
  const normalizedCode = normalizeProductLinkCode(code);
  const normalizedDescription = normalizeProductLinkText(description);
  if (!normalizedCode && !normalizedDescription) return supplierLinks || {};

  const safeLinks = supplierLinks && typeof supplierLinks === 'object' && !Array.isArray(supplierLinks)
    ? supplierLinks
    : {};
  const excelImport = safeLinks.excel_import && typeof safeLinks.excel_import === 'object'
    ? safeLinks.excel_import
    : {};
  const aliases = getExcelImportAliases({ supplierLinks: safeLinks });
  const key = `${normalizedCode || '-'}|${normalizedDescription || '-'}`;
  const existingIndex = aliases.findIndex((alias) =>
    `${alias.normalizedCode || '-'}|${alias.normalizedDescription || '-'}` === key
  );
  const nextAlias = {
    ...(existingIndex >= 0 ? aliases[existingIndex] : {}),
    code,
    description,
    normalizedCode,
    normalizedDescription,
    rowNumber: link.rowNumber || null,
    firstSeenAt: existingIndex >= 0 ? aliases[existingIndex].firstSeenAt || now : now,
    lastSeenAt: now,
    lastAppliedAt: now,
  };
  const nextAliases = existingIndex >= 0
    ? aliases.map((alias, index) => (index === existingIndex ? nextAlias : alias))
    : [nextAlias, ...aliases];

  return {
    ...safeLinks,
    excel_import: {
      ...excelImport,
      aliases: nextAliases.slice(0, 30),
    },
  };
};

export const updateStockLifecycleLinks = (
  supplierLinks = {},
  { stockBefore = 0, stockAfter = 0, delta = 0, trackDepletion = false, now = new Date().toISOString() } = {},
) => {
  const safeLinks = supplierLinks && typeof supplierLinks === 'object' && !Array.isArray(supplierLinks)
    ? supplierLinks
    : {};
  const previousLifecycle = safeLinks.stock_lifecycle && typeof safeLinks.stock_lifecycle === 'object'
    ? safeLinks.stock_lifecycle
    : {};
  const numericBefore = Number(stockBefore || 0);
  const numericAfter = Number(stockAfter || 0);
  const numericDelta = Number(delta || 0);
  const nextLifecycle = { ...previousLifecycle };

  if (numericDelta > 0 || numericAfter > 0) {
    delete nextLifecycle.outOfStockSince;
    nextLifecycle.lastRestockedAt = now;
  } else if (trackDepletion && numericDelta < 0 && numericBefore > 0 && numericAfter <= 0) {
    nextLifecycle.outOfStockSince = previousLifecycle.outOfStockSince || now;
  }

  return {
    ...safeLinks,
    stock_lifecycle: nextLifecycle,
  };
};

export const getOutOfStockSince = (product = {}) => {
  const value = getProductSupplierLinks(product).stock_lifecycle?.outOfStockSince;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const shouldAutoDisableOutOfStockProduct = (
  product = {},
  now = new Date(),
  inactiveDays = OUT_OF_STOCK_INACTIVE_DAYS,
) => {
  if (!getProductActiveState(product)) return false;
  if (Number(product.stock || 0) > 0) return false;
  const outOfStockSince = getOutOfStockSince(product);
  if (!outOfStockSince) return false;
  return now.getTime() - outOfStockSince.getTime() >= inactiveDays * DAY_MS;
};
