const DAY_MS = 24 * 60 * 60 * 1000;
export const OUT_OF_STOCK_INACTIVE_DAYS = 90;

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

export const getProductActiveState = (product = {}) =>
  product?.isActive !== false && product?.is_active !== false;

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
