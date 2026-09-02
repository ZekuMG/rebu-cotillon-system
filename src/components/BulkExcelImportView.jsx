import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Eraser,
  FileSpreadsheet,
  Filter,
  Link2,
  Loader2,
  MoreVertical,
  Package,
  PackagePlus,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  Upload,
  X,
} from 'lucide-react';
import AsyncActionButton from './AsyncActionButton';
import { FancyPrice } from './FancyPrice';
import {
  PricingFormulaControls,
  PricingFormulaTrace,
} from './pricing/PricingFormulaControls';
import usePendingAction from '../hooks/usePendingAction';
import { areDuplicatePricesEqual, mergeDuplicateEntries } from '../utils/excelImportDuplicates';
import {
  calculateExcelImportStockDelta,
  isSafeExcelImportNumber,
  parseExcelMoney,
} from '../utils/excelImportNumbers';
import {
  canApplyExcelImportRow,
  mergeExcelImportProductResult,
} from '../utils/excelImportOperations';
import {
  getExcelImportAliases,
  normalizeProductLinkCode,
  normalizeProductLinkText,
  productHasExcelImportApplication,
  shouldSaveExcelImportAlias,
} from '../utils/productLifecycle';
import {
  buildExcelImportRowSignature,
  fingerprintExcelImportBuffer,
} from '../utils/excelImportIdentity';
import {
  clearExcelImportDraft,
  loadExcelImportDraft,
  saveExcelImportDraft,
} from '../utils/excelImportDraftCache';
import {
  DEFAULT_GROSS_MARGIN_PERCENT,
} from '../utils/grossMarginPricing';
import {
  calculateExcelImportUnitPricing,
  repriceExcelImportEntryForMargin,
  repriceExcelImportEntryForMultiplier,
  repriceExcelImportEntryForRealCost,
} from '../utils/excelImportPricing';
import { normalizeFinalSalePrice } from '../utils/finalSalePrice';
import { normalizeFinalPurchaseCost } from '../utils/finalPurchaseCost';

const REQUIRED_COLUMNS = ['codigo', 'descripcion', 'cantidad', 'precio', 'descuento', 'costo', 'venta'];
const FIELD_KEYS = ['stock', 'cost', 'price'];
const MAX_EXCEL_IMPORT_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_EXCEL_IMPORT_ROWS = 5000;
const MAX_EXCEL_IMPORT_COLUMNS = 80;
const EXCEL_IMPORT_VISIBLE_CHUNK = 75;
const EXCEL_IMPORT_EXTENSIONS = new Set(['xlsx', 'xls']);
const EXCEL_IMPORT_RESULT_FILTERS = new Set([
  'all',
  'applicable',
  'unassigned',
  'blocked',
  'changes',
  'unchanged',
  'applied',
]);

const normalizeHeader = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

const normalizeCode = (value) => String(value ?? '').trim();

const normalizeSearchText = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const getFileExtension = (fileName = '') => {
  const parts = String(fileName).toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() : '';
};

const validateExcelImportFile = (file) => {
  const extension = getFileExtension(file?.name);
  if (!EXCEL_IMPORT_EXTENSIONS.has(extension)) {
    throw new Error('Solo se permiten archivos .xlsx o .xls.');
  }

  if (Number(file?.size || 0) > MAX_EXCEL_IMPORT_FILE_SIZE_BYTES) {
    throw new Error('El archivo es demasiado grande. El limite es 5 MB.');
  }
};

const normalizeProductName = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(x|x1|unidad|unidades|un|u)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const getNameSimilarity = (left, right) => {
  const a = normalizeProductName(left);
  const b = normalizeProductName(right);
  if (!a || !b) return 0;
  if (a === b) return 1;

  const aWords = new Set(a.split(' ').filter((word) => word.length > 1));
  const bWords = new Set(b.split(' ').filter((word) => word.length > 1));
  if (aWords.size === 0 || bWords.size === 0) return 0;

  let intersection = 0;
  aWords.forEach((word) => {
    if (bWords.has(word)) intersection += 1;
  });
  return (2 * intersection) / (aWords.size + bWords.size);
};

const parseNumber = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  const cleaned = raw.replace(/\$/g, '').replace(/\s/g, '');
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized = cleaned;

  if (lastComma > lastDot) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    normalized = cleaned.replace(/,/g, '');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatDiffPercent = (oldValue, newValue) => {
  const oldNumber = Number(oldValue || 0);
  const newNumber = Number(newValue || 0);
  if (!oldNumber && !newNumber) return '0,0%';
  if (!oldNumber) return '+100,0%';
  const diff = ((newNumber - oldNumber) / oldNumber) * 100;
  const sign = diff > 0 ? '+' : '';
  return `${sign}${diff.toFixed(1).replace('.', ',')}%`;
};

const getFirstValue = (row, key) => {
  const target = normalizeHeader(key);
  const foundKey = Object.keys(row || {}).find((candidate) => normalizeHeader(candidate) === target);
  return foundKey ? row[foundKey] : '';
};

const buildImportEntry = (
  row,
  rowNumber,
  fileFingerprint = '',
  marginPercent = DEFAULT_GROSS_MARGIN_PERCENT,
) => {
  const code = normalizeCode(getFirstValue(row, 'Codigo'));
  const description = String(getFirstValue(row, 'Descripcion') ?? '').trim();
  const category = String(getFirstValue(row, 'Categoria') ?? '').trim();
  const quantity = parseNumber(getFirstValue(row, 'Cantidad'));
  const providerPrice = parseExcelMoney(getFirstValue(row, 'Precio'));
  const discount = parseExcelMoney(getFirstValue(row, 'Descuento'));
  const lotCost = parseExcelMoney(getFirstValue(row, 'Costo'));
  const lotSalePrice = parseExcelMoney(getFirstValue(row, 'Venta'));
  const multiplier = 1;
  const pricing = calculateExcelImportUnitPricing({
    lotCost,
    lotSalePrice,
    multiplier,
    marginPercent,
  });
  const { baseCost } = pricing;
  const cost = pricing.realCost;
  const salePrice = pricing.salePrice;
  const { excelSalePrice } = pricing;

  return {
    rowNumber,
    fileFingerprint,
    code,
    description,
    category,
    quantity,
    originalQuantity: quantity,
    quantityInput: quantity ? String(quantity) : '',
    multiplier,
    multiplierInput: String(multiplier),
    providerPrice,
    discount,
    lotCost,
    lotSalePrice,
    baseCost,
    excelSalePrice,
    cost,
    costInput: cost ? String(cost) : '',
    originalCost: cost,
    costEdited: false,
    salePrice,
    salePriceInput: salePrice ? String(salePrice) : '',
    originalSalePrice: salePrice,
    salePriceEdited: false,
  };
};

const getEntryInputKey = (field) => {
  if (field === 'salePrice') return 'salePriceInput';
  if (field === 'cost') return 'costInput';
  if (field === 'multiplier') return 'multiplierInput';
  return `${field}Input`;
};

const getRowBaseErrors = (entry, _product) => {
  const errors = [];
  if (!isSafeExcelImportNumber(entry.quantity, { min: Number.MIN_VALUE }) || Number(entry.quantity) <= 0) {
    errors.push('Cantidad vacia o cero');
  }
  if (
    entry.multiplier === ''
    || entry.multiplier === null
    || entry.multiplier === undefined
    || !isSafeExcelImportNumber(entry.multiplier, { min: 0 })
  ) {
    errors.push('Multiplicador invalido');
  }
  if (!isSafeExcelImportNumber(calculateExcelImportStockDelta(entry))) {
    errors.push('Variacion de stock invalida');
  }
  if (!isSafeExcelImportNumber(entry.cost, { min: Number.MIN_VALUE }) || Number(entry.cost) <= 0) {
    errors.push('Costo vacio o cero');
  }
  if (!isSafeExcelImportNumber(entry.salePrice, { min: Number.MIN_VALUE }) || Number(entry.salePrice) <= 0) {
    errors.push('Venta vacia o cero');
  }
  if (entry.salePrice > 0 && entry.cost > 0 && entry.salePrice < entry.cost) {
    errors.push('Venta menor al costo');
  }
  return errors;
};

const getStockUnit = (product) => (product?.product_type === 'weight' ? 'g' : 'u.');
const getStockDelta = calculateExcelImportStockDelta;
const getRowImportSignature = (row) => buildExcelImportRowSignature({
  fileFingerprint: row?.entry?.fileFingerprint,
  rowNumber: row?.entry?.rowNumber,
});

const getProductReviewState = (product) => product ? {
  id: String(product.id ?? ''),
  stock: Number(product.stock || 0),
  purchasePrice: Number(product.purchasePrice || 0),
  price: Number(product.price || 0),
  barcode: normalizeCode(product.barcode),
} : null;

const areProductReviewStatesEqual = (left, right) => (
  Boolean(left)
  && Boolean(right)
  && left.id === right.id
  && left.stock === right.stock
  && left.purchasePrice === right.purchasePrice
  && left.price === right.price
  && left.barcode === right.barcode
);

const getQuantityBalance = (sourceRow, productRows) => {
  const originalQuantity = Number(sourceRow.entry.originalQuantity || sourceRow.entry.quantity || 0);
  const assignedQuantity = productRows.reduce((sum, row) => sum + Number(row.entry.quantity || 0), 0);
  return {
    originalQuantity,
    assignedQuantity,
    remainingQuantity: originalQuantity - assignedQuantity,
  };
};

const getQuantityBalanceMeta = (remainingQuantity) => {
  if (remainingQuantity === 0) {
    return { label: 'Completo', tone: 'green' };
  }
  if (remainingQuantity < 0) {
    return { label: `Sobran ${Math.abs(remainingQuantity).toLocaleString('es-AR')}`, tone: 'red' };
  }
  return { label: `Faltan ${remainingQuantity.toLocaleString('es-AR')}`, tone: 'amber' };
};

const buildReviewRow = ({
  entry,
  product = null,
  duplicateOptions = null,
  duplicateResolved = false,
  linkedByExcelAlias = false,
}, index) => {
  const errors = getRowBaseErrors(entry, product);
  if (duplicateOptions && !duplicateResolved) errors.push('Duplicado sin resolver');
  const hasProduct = Boolean(product);
  const hasChanges = hasProduct
    ? Number(product.stock || 0) + getStockDelta(entry) !== Number(product.stock || 0) ||
      Number(product.purchasePrice || 0) !== Number(entry.cost || 0) ||
      Number(product.price || 0) !== Number(entry.salePrice || 0)
    : false;
  const importSignature = buildExcelImportRowSignature({
    fileFingerprint: entry.fileFingerprint,
    rowNumber: entry.rowNumber,
  });

  return {
    id: `${entry.code || 'sin-codigo'}-${index}-${Date.now()}`,
    entry,
    product,
    manualAssigned: false,
    linkedByExcelAlias,
    createdFromExcel: false,
    isAssociated: false,
    sourceRowId: null,
    duplicateOptions,
    duplicateResolved,
    assignmentQuery: '',
    changeProductMode: false,
    approvals: { stock: false, cost: false, price: false },
    reviewedProductState: getProductReviewState(product),
    reviewInvalidated: false,
    applied: Boolean(product && productHasExcelImportApplication(product, importSignature)),
    errors,
    hasChanges,
  };
};

const getRowStatus = (row) => {
  if (!row.product) return { label: 'Sin asignar', tone: 'amber' };
  if (row.reviewInvalidated) return { label: 'Revisar de nuevo', tone: 'amber' };
  const selectedCount = FIELD_KEYS.filter((field) => row.approvals[field]).length;
  if (hasBlockingErrorsForApply(row)) return { label: 'Revisar', tone: 'red' };
  if (selectedCount === 0 && row.applied) return { label: 'Aplicado', tone: 'green' };
  if (selectedCount === 0 && shouldSaveExcelLinkForRow(row)) return { label: 'Vincular', tone: 'blue' };
  if (row.errors.length > 0 && selectedCount === 0) return { label: 'Con avisos', tone: 'amber' };
  if (selectedCount === 0 && !row.hasChanges) return { label: 'Sin cambios', tone: 'slate' };
  if (selectedCount === 0) return { label: 'Con cambios', tone: 'blue' };
  if (selectedCount < FIELD_KEYS.length) return { label: 'Parcial', tone: 'violet' };
  return { label: 'Aprobado', tone: 'green' };
};

const isFieldEligible = (row, field) => {
  if (!row.product || row.applied) return false;
  if (field === 'stock') {
    const stockDelta = getStockDelta(row.entry);
    return Number(row.entry.quantity || 0) > 0
      && Number(row.entry.multiplier ?? 1) >= 0
      && stockDelta !== 0
      && isSafeExcelImportNumber(stockDelta);
  }
  if (field === 'cost') return Number(row.entry.cost || 0) > 0 && Number(row.product.purchasePrice || 0) !== Number(row.entry.cost || 0);
  if (field === 'price') return Number(row.entry.salePrice || 0) > 0 && Number(row.product.price || 0) !== Number(row.entry.salePrice || 0);
  return false;
};

const hasSelectedFieldChange = (row) => FIELD_KEYS.some((field) => row.approvals[field] && isFieldEligible(row, field));

const isFieldInvalidForRow = (row, field) => {
  const errors = row?.errors || [];
  if (field === 'stock') {
    return errors.includes('Cantidad vacia o cero')
      || errors.includes('Multiplicador invalido')
      || errors.includes('Variacion de stock invalida');
  }
  if (field === 'cost') {
    return errors.includes('Costo vacio o cero') || errors.includes('Venta menor al costo');
  }
  if (field === 'price') {
    return errors.includes('Venta vacia o cero') || errors.includes('Venta menor al costo');
  }
  return false;
};

const hasBlockingErrorsForApply = (row) => {
  if (!row) return true;
  if (row.duplicateOptions && !row.duplicateResolved) return true;
  return FIELD_KEYS.some((field) => row.approvals[field] && isFieldInvalidForRow(row, field));
};

const hasExcelLinkData = (row) =>
  Boolean(normalizeCode(row?.entry?.code) || String(row?.entry?.description || '').trim());

const shouldSaveExcelLinkForRow = (row) =>
  Boolean(hasExcelLinkData(row) && shouldSaveExcelImportAlias({
    product: row?.product,
    entry: row?.entry,
    isNewAssociation: Boolean(row?.manualAssigned || row?.createdFromExcel),
  }));

const hasBarcodeAssignmentChange = (row) =>
  Boolean(
    row.product &&
      !hasBlockingErrorsForApply(row) &&
      row.manualAssigned &&
      !row.isAssociated &&
      normalizeCode(row.entry.code) &&
      !normalizeCode(row.product.barcode) &&
      normalizeCode(row.product.barcode) !== normalizeCode(row.entry.code),
  );

const isRowApplicable = (row) => canApplyExcelImportRow({
  applied: row?.applied,
  hasProduct: Boolean(row?.product),
  hasBlockingErrors: hasBlockingErrorsForApply(row),
  hasApplicableChanges: Boolean(
    hasSelectedFieldChange(row)
    || hasBarcodeAssignmentChange(row)
    || shouldSaveExcelLinkForRow(row)
  ),
});

const getRowErrorHints = (errors = []) =>
  errors.map((error) => {
    if (error === 'Cantidad vacia o cero') {
      return {
        title: 'Cantidad sin valor',
        detail: 'Revisa la cantidad del Excel. Tiene que ser mayor a 0 para poder sumar stock.',
      };
    }
    if (error === 'Multiplicador invalido') {
      return {
        title: 'Equivalencia sin valor',
        detail: 'Edita Stock y coloca cuantas unidades reales suma cada unidad comprada. Puede ser 0 si no queres sumar stock.',
      };
    }
    if (error === 'Variacion de stock invalida') {
      return {
        title: 'Variacion de stock fuera de rango',
        detail: 'Reduce la cantidad o la equivalencia antes de aplicar el lote.',
      };
    }
    if (error === 'Costo vacio o cero') {
      return {
        title: 'Costo sin valor',
        detail: 'Completa el costo final por unidad en el bloque Costo.',
      };
    }
    if (error === 'Venta vacia o cero') {
      return {
        title: 'Venta sin valor',
        detail: 'Completa el precio de venta final por unidad en el bloque Venta.',
      };
    }
    if (error === 'Venta menor al costo') {
      return {
        title: 'Venta menor al costo',
        detail: 'Sube la venta o corrige el costo antes de aplicar cambios.',
      };
    }
    if (error === 'Duplicado sin resolver') {
      return {
        title: 'Codigo repetido en el Excel',
        detail: 'Elegí una fila o suma las cantidades antes de aplicar.',
      };
    }
    return {
      title: error,
      detail: 'Revisa los datos recibidos del Excel y vuelve a intentar.',
    };
  });

const statusClass = {
  amber: 'bg-amber-50 text-amber-800 border-amber-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  violet: 'bg-violet-50 text-violet-700 border-violet-200',
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
};

const statusAccentClass = {
  amber: 'border-l-amber-400',
  red: 'border-l-red-400',
  blue: 'border-l-blue-400',
  violet: 'border-l-violet-400',
  green: 'border-l-emerald-400',
  slate: 'border-l-slate-300',
};

export default function BulkExcelImportView({
  inventory = [],
  categories = [],
  cacheScope = '',
  marginPercent = DEFAULT_GROSS_MARGIN_PERCENT,
  onMarginChange,
  canCreateInventory = false,
  canEditInventory = false,
  onApplyImport,
  onUndoImport,
  onCreateProducts,
}) {
  const fileInputRef = useRef(null);
  const parseRequestRef = useRef(0);
  const mountedRef = useRef(true);
  const saveRequestRef = useRef(0);
  const createDialogRef = useRef(null);
  const createDialogCloseRef = useRef(null);
  const previousFocusedElementRef = useRef(null);
  const isCreatingProductsRef = useRef(false);
  const isDraftHydratedRef = useRef(false);
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState('');
  const [rows, setRows] = useState([]);
  const [activeTargetBySource, setActiveTargetBySource] = useState({});
  const [activeSourceRowId, setActiveSourceRowId] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [resultFilter, setResultFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [visibleRowLimit, setVisibleRowLimit] = useState(EXCEL_IMPORT_VISIBLE_CHUNK);
  const [selectedCreateRowIds, setSelectedCreateRowIds] = useState([]);
  // el panel de crear pendientes arranca abierto: antes venia plegado y el
  // "0/4" parecia un error en vez de "ninguno tildado".
  const [isCreateSectionOpen, setIsCreateSectionOpen] = useState(true);
  const [createDrafts, setCreateDrafts] = useState([]);
  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);
  const [isCreatingProducts, setIsCreatingProducts] = useState(false);
  const [lastApplyBatch, setLastApplyBatch] = useState(null);
  const [isUndoingImport, setIsUndoingImport] = useState(false);
  const [isDraftHydrated, setIsDraftHydrated] = useState(false);
  const [cacheStatus, setCacheStatus] = useState('loading');
  const draftStateRef = useRef(null);
  const { runAction: runImportAction } = usePendingAction();
  const isOperationBusy = !isDraftHydrated || isParsing || isApplying || isCreatingProducts || isUndoingImport;
  isCreatingProductsRef.current = isCreatingProducts;
  isDraftHydratedRef.current = isDraftHydrated;

  const barcodeLookup = useMemo(() => {
    const map = new Map();
    (inventory || []).forEach((product) => {
      const barcode = normalizeCode(product?.barcode);
      if (barcode) map.set(barcode, product);
    });
    return map;
  }, [inventory]);

  const inventoryById = useMemo(() => {
    const map = new Map();
    (inventory || []).forEach((product) => {
      if (product?.id !== undefined && product?.id !== null) map.set(String(product.id), product);
    });
    return map;
  }, [inventory]);

  const excelAliasLookup = useMemo(() => {
    const byCode = new Map();
    const byDescription = new Map();
    (inventory || []).forEach((product) => {
      getExcelImportAliases(product).forEach((alias) => {
        if (alias.normalizedCode && !byCode.has(alias.normalizedCode)) {
          byCode.set(alias.normalizedCode, product);
        }
        if (alias.normalizedDescription && !byDescription.has(alias.normalizedDescription)) {
          byDescription.set(alias.normalizedDescription, product);
        }
      });
    });
    return { byCode, byDescription };
  }, [inventory]);

  const findProductForEntry = useCallback((entry) => {
    const code = normalizeCode(entry?.code);
    if (code && barcodeLookup.has(code)) {
      return { product: barcodeLookup.get(code), linkedByExcelAlias: false };
    }

    const aliasCode = normalizeProductLinkCode(entry?.code);
    const aliasDescription = normalizeProductLinkText(entry?.description);
    const linkedProduct = (
      (aliasCode && excelAliasLookup.byCode.get(aliasCode))
      || (aliasDescription && excelAliasLookup.byDescription.get(aliasDescription))
    );
    return linkedProduct
      ? { product: linkedProduct, linkedByExcelAlias: true }
      : { product: null, linkedByExcelAlias: false };
  }, [barcodeLookup, excelAliasLookup]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsDraftHydrated(false);
    setCacheStatus('loading');

    if (typeof window === 'undefined' || !cacheScope) {
      setIsDraftHydrated(true);
      setCacheStatus(cacheScope ? 'ready' : 'disabled');
      return () => { cancelled = true; };
    }

    loadExcelImportDraft({
      storage: window.localStorage,
      indexedDB: window.indexedDB,
      scope: cacheScope,
    }).then((draft) => {
      if (cancelled) return;
      if (draft) {
        setFileName(draft.fileName || '');
        setRows(draft.rows || []);
        setActiveTargetBySource(draft.activeTargetBySource || {});
        setActiveSourceRowId(draft.activeSourceRowId || '');
        setResultFilter(EXCEL_IMPORT_RESULT_FILTERS.has(draft.resultFilter) ? draft.resultFilter : 'all');
        setSearchTerm(draft.searchTerm || '');
        setLastApplyBatch(draft.lastApplyBatch || null);
      }
      setIsDraftHydrated(true);
      setCacheStatus(draft ? 'restored' : 'ready');
    }).catch(() => {
      if (cancelled) return;
      setIsDraftHydrated(true);
      setCacheStatus('error');
    });

    return () => { cancelled = true; };
  }, [cacheScope]);

  useEffect(() => {
    if ((inventory || []).length === 0) return;
    setRows((currentRows) => {
      let changed = false;
      const nextRows = currentRows.map((row, index) => {
        let product = row.product?.id !== undefined && row.product?.id !== null
          ? inventoryById.get(String(row.product.id)) || row.product
          : null;
        let linkedByExcelAlias = row.linkedByExcelAlias;

        if (!product && !row.productCleared) {
          const found = findProductForEntry(row.entry);
          product = found.product;
          linkedByExcelAlias = found.linkedByExcelAlias;
        }
        if (!product) return row;

        const rebuilt = buildReviewRow({
          entry: row.entry,
          product,
          duplicateOptions: row.duplicateOptions,
          duplicateResolved: row.duplicateResolved,
          linkedByExcelAlias,
        }, index);
        const nextReviewState = getProductReviewState(product);
        const hadApprovals = FIELD_KEYS.some((field) => Boolean(row.approvals?.[field]));
        const reviewChanged = Boolean(
          row.reviewedProductState
          && !areProductReviewStatesEqual(row.reviewedProductState, nextReviewState),
        );
        const invalidateReview = hadApprovals && reviewChanged && !row.applied;
        const productChanged = product !== row.product;
        if (!productChanged && !invalidateReview && areProductReviewStatesEqual(row.reviewedProductState, nextReviewState)) {
          return row;
        }
        changed = true;
        const hasDurableSignature = Boolean(getRowImportSignature(rebuilt));
        return {
          ...rebuilt,
          ...row,
          product,
          linkedByExcelAlias,
          errors: rebuilt.errors,
          hasChanges: rebuilt.hasChanges,
          approvals: invalidateReview
            ? { stock: false, cost: false, price: false }
            : row.approvals,
          reviewedProductState: nextReviewState,
          reviewInvalidated: Boolean(row.reviewInvalidated || invalidateReview),
          applied: hasDurableSignature ? rebuilt.applied : Boolean(row.applied),
        };
      });
      return changed ? nextRows : currentRows;
    });
  }, [findProductForEntry, inventory, inventoryById, isDraftHydrated]);

  useEffect(() => {
    if (!isDraftHydrated) return;
    setRows((currentRows) => currentRows.map((row, index) => {
      if (row.entry.salePriceEdited || Number(row.entry.cost || 0) <= 0) return row;
      const nextEntry = repriceExcelImportEntryForMargin(row.entry, marginPercent);
      if (nextEntry === row.entry || nextEntry.salePrice === row.entry.salePrice) return row;
      const rebuilt = buildReviewRow({
        entry: nextEntry,
        product: row.product,
        duplicateOptions: row.duplicateOptions,
        duplicateResolved: row.duplicateResolved,
        linkedByExcelAlias: row.linkedByExcelAlias,
      }, index);
      const nextRow = {
        ...rebuilt,
        ...row,
        entry: nextEntry,
        errors: rebuilt.errors,
        hasChanges: rebuilt.hasChanges,
      };
      return {
        ...nextRow,
        approvals: FIELD_KEYS.reduce((acc, approvalKey) => {
          acc[approvalKey] = Boolean(row.approvals[approvalKey] && isFieldEligible(nextRow, approvalKey));
          return acc;
        }, {}),
      };
    }));
  }, [isDraftHydrated, marginPercent]);

  draftStateRef.current = {
    fileName,
    rows,
    activeTargetBySource,
    activeSourceRowId,
    resultFilter,
    searchTerm,
    lastApplyBatch,
  };

  useEffect(() => {
    if (typeof window === 'undefined' || !isDraftHydrated || !cacheScope) return undefined;
    const timeoutId = window.setTimeout(() => {
      const requestId = saveRequestRef.current + 1;
      saveRequestRef.current = requestId;
      setCacheStatus('saving');
      saveExcelImportDraft({
        storage: window.localStorage,
        indexedDB: window.indexedDB,
        scope: cacheScope,
      }, draftStateRef.current).then((result) => {
        if (!mountedRef.current || saveRequestRef.current !== requestId) return;
        setCacheStatus(result.success ? 'saved' : 'error');
      });
    }, 250);
    return () => window.clearTimeout(timeoutId);
  }, [
    activeSourceRowId,
    activeTargetBySource,
    fileName,
    lastApplyBatch,
    resultFilter,
    rows,
    searchTerm,
    cacheScope,
    isDraftHydrated,
  ]);

  useEffect(() => () => {
    if (
      typeof window !== 'undefined'
      && cacheScope
      && isDraftHydratedRef.current
      && draftStateRef.current
    ) {
      void saveExcelImportDraft({
        storage: window.localStorage,
        indexedDB: window.indexedDB,
        scope: cacheScope,
      }, draftStateRef.current);
    }
  }, [cacheScope]);

  useEffect(() => {
    if (!isCreatePanelOpen) return undefined;
    previousFocusedElementRef.current = document.activeElement;
    const focusTimer = window.setTimeout(() => createDialogCloseRef.current?.focus(), 0);
    const handleDialogKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (!isCreatingProductsRef.current) setIsCreatePanelOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...(createDialogRef.current?.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) || [])];
      if (focusable.length === 0) {
        event.preventDefault();
        createDialogRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleDialogKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleDialogKeyDown);
      previousFocusedElementRef.current?.focus?.();
    };
  }, [isCreatePanelOpen]);

  const availableCategories = useMemo(
    () => [...new Set((categories || []).map((category) => String(category || '').trim()).filter(Boolean))],
    [categories],
  );

  const getDuplicateCandidate = (entry) => {
    const barcode = normalizeCode(entry?.code);
    if (barcode) {
      const barcodeOwner = barcodeLookup.get(barcode);
      if (barcodeOwner) {
        return {
          product: barcodeOwner,
          reason: 'Mismo codigo de barras',
          matchType: 'barcode',
          blocking: true,
        };
      }
    }

    const title = String(entry?.description || '').trim();
    if (!title) return null;
    let bestMatch = null;
    (inventory || []).forEach((product) => {
      const similarity = getNameSimilarity(title, product?.title);
      if (similarity >= 0.78 && (!bestMatch || similarity > bestMatch.similarity)) {
        bestMatch = { product, similarity };
      }
    });
    return bestMatch
      ? {
          product: bestMatch.product,
          reason: `Nombre similar (${Math.round(bestMatch.similarity * 100)}%)`,
          matchType: 'name',
          blocking: false,
        }
      : null;
  };

  const buildCreateDraft = (row) => {
    const importedCategory = String(row.entry.category || '').trim();
    const matchedCategory = availableCategories.find(
      (category) => category.toLowerCase() === importedCategory.toLowerCase(),
    );
    const searchedTitle = String(row.assignmentQuery || '').trim();
    const draftBarcode = row.isAssociated ? '' : normalizeCode(row.entry.code);
    const draftTitle = searchedTitle || String(row.entry.description || '').trim();
    return {
      rowId: row.id,
      title: draftTitle,
      barcode: draftBarcode,
      category: matchedCategory || '',
      stock: 0,
      purchasePrice: Number(row.entry.cost || 0),
      price: Number(row.entry.salePrice || 0),
      duplicate: getDuplicateCandidate({
        code: draftBarcode,
        description: draftTitle,
      }),
      sourceCode: normalizeCode(row.entry.code),
      sourceDescription: String(row.entry.description || '').trim(),
      sourceRowNumber: row.entry.rowNumber,
      error: '',
    };
  };

  const getCreateDraftErrors = (draft) => {
    const errors = [];
    const purchasePrice = parseExcelMoney(draft.purchasePrice);
    const price = parseExcelMoney(draft.price);
    if (!String(draft.title || '').trim()) errors.push('Falta nombre');
    if (!String(draft.category || '').trim()) errors.push('Falta categoria');
    if (!purchasePrice || purchasePrice <= 0) errors.push('Falta costo');
    if (!price || price <= 0) errors.push('Falta precio');
    if (price > 0 && purchasePrice > price) {
      errors.push('Precio menor al costo');
    }
    if (draft.duplicate?.blocking) errors.push('Codigo ya existente');
    return errors;
  };

  const summary = useMemo(() => {
    const blocked = rows.filter((row) => hasBlockingErrorsForApply(row)).length;
    const unassigned = rows.filter((row) => !row.product).length;
    const approved = rows.filter((row) => isRowApplicable(row)).length;
    const duplicates = rows.filter((row) => row.duplicateOptions && !row.duplicateResolved).length;
    return { total: rows.length, blocked, unassigned, approved, duplicates };
  }, [rows]);

  const currentStep = useMemo(() => {
    if (summary.total === 0) return 1;
    if (summary.duplicates > 0 || summary.unassigned > 0) return 2;
    if (summary.blocked > 0) return 2;
    if (summary.approved === 0) return 3;
    return 4;
  }, [summary]);

  const applicableRows = useMemo(
    () =>
      rows.filter((row) => isRowApplicable(row)),
    [rows],
  );

  const creatableRows = useMemo(
    () => rows.filter((row) => !row.isAssociated && !row.product && row.duplicateResolved),
    [rows],
  );

  const validCreateDrafts = createDrafts.filter((draft) => getCreateDraftErrors(draft).length === 0);

  // Sin nada tildado, "Crear" toma todos los pendientes en vez de quedarse
  // deshabilitado sin explicar por que.
  const rowIdsParaCrear = selectedCreateRowIds.length > 0
    ? selectedCreateRowIds
    : creatableRows.map((row) => row.id);

  const primaryRows = useMemo(
    () => rows.filter((row) => !row.isAssociated),
    [rows],
  );

  const rowGroups = useMemo(() => {
    const groupBySourceId = new Map();
    primaryRows.forEach((primaryRow) => {
      groupBySourceId.set(String(primaryRow.id), {
        primaryRow,
        associatedRows: [],
        productRows: [primaryRow],
      });
    });
    rows.forEach((row) => {
      if (!row.isAssociated) return;
      const group = groupBySourceId.get(String(row.sourceRowId));
      if (!group) return;
      group.associatedRows.push(row);
      group.productRows.push(row);
    });
    return [...groupBySourceId.values()];
  }, [primaryRows, rows]);

  const getGroupFlags = useCallback((group) => {
    const productRows = group?.productRows || [];
    const assignedRows = productRows.filter((row) => row.product);
    return {
      applicable: productRows.some((row) => isRowApplicable(row)),
      unassigned: productRows.some((row) => !row.product),
      blocked: productRows.some((row) => row.product && hasBlockingErrorsForApply(row)),
      changes: productRows.some((row) => row.product && !row.applied && row.hasChanges),
      unchanged: assignedRows.length > 0
        && assignedRows.every((row) => !row.applied && !row.hasChanges)
        && assignedRows.length === productRows.length,
      applied: productRows.some((row) => row.applied),
    };
  }, []);

  const resultFilterCounts = useMemo(() => ({
    all: rowGroups.length,
    applicable: rowGroups.filter((group) => getGroupFlags(group).applicable).length,
    unassigned: rowGroups.filter((group) => getGroupFlags(group).unassigned).length,
    blocked: rowGroups.filter((group) => getGroupFlags(group).blocked).length,
    changes: rowGroups.filter((group) => getGroupFlags(group).changes).length,
    unchanged: rowGroups.filter((group) => getGroupFlags(group).unchanged).length,
    applied: rowGroups.filter((group) => getGroupFlags(group).applied).length,
  }), [getGroupFlags, rowGroups]);

  const primaryRowSearchText = useMemo(() => {
    const textBySource = new Map(primaryRows.map((row) => [String(row.id), '']));
    rows.forEach((row) => {
      const sourceId = String(row.sourceRowId || row.id);
      if (!textBySource.has(sourceId)) return;
      const aliasText = getExcelImportAliases(row.product)
        .map((alias) => `${alias.code || ''} ${alias.description || ''}`)
        .join(' ');
      const rowText = [
        row.entry?.code,
        row.entry?.description,
        row.entry?.category,
        row.entry?.rowNumber,
        row.product?.id,
        row.product?.title,
        row.product?.barcode,
        row.product?.category,
        aliasText,
      ].filter(Boolean).join(' ');
      textBySource.set(sourceId, `${textBySource.get(sourceId)} ${normalizeSearchText(rowText)}`);
    });
    return textBySource;
  }, [primaryRows, rows]);

  const visibleRowGroups = useMemo(() => {
    const searchWords = normalizeSearchText(searchTerm).split(/\s+/).filter(Boolean);
    return rowGroups.filter((group) => {
      const row = group.primaryRow;
      const flags = getGroupFlags(group);
      const matchesFilter = (
        resultFilter === 'all'
        || (resultFilter === 'applicable' && flags.applicable)
        || (resultFilter === 'unassigned' && flags.unassigned)
        || (resultFilter === 'blocked' && flags.blocked)
        || (resultFilter === 'changes' && flags.changes)
        || (resultFilter === 'unchanged' && flags.unchanged)
        || (resultFilter === 'applied' && flags.applied)
      );
      if (!matchesFilter || searchWords.length === 0) return matchesFilter;
      const haystack = primaryRowSearchText.get(String(row.id)) || '';
      return searchWords.every((word) => haystack.includes(word));
    });
  }, [getGroupFlags, primaryRowSearchText, resultFilter, rowGroups, searchTerm]);

  const renderedRowGroups = useMemo(
    () => visibleRowGroups.slice(0, visibleRowLimit),
    [visibleRowGroups, visibleRowLimit],
  );

  useEffect(() => {
    setVisibleRowLimit(EXCEL_IMPORT_VISIBLE_CHUNK);
  }, [resultFilter, searchTerm, rows.length]);

  const parseWorkbookRows = (sheetRows, fileFingerprint) => {
    const headers = Object.keys(sheetRows[0] || {}).map(normalizeHeader);
    const missing = REQUIRED_COLUMNS.filter((column) => !headers.includes(column));
    if (missing.length > 0) {
      throw new Error(`Faltan columnas: ${missing.join(', ')}`);
    }

    const entries = sheetRows
      .map((row, index) => buildImportEntry(row, index + 2, fileFingerprint, marginPercent))
      .filter((entry) => entry.code || entry.description || entry.quantity || entry.cost || entry.salePrice);

    const groupedByCode = entries.reduce((groups, entry) => {
      const key = entry.code || `sin-codigo-${entry.rowNumber}`;
      const currentGroup = groups.get(key) || [];
      currentGroup.push(entry);
      groups.set(key, currentGroup);
      return groups;
    }, new Map());

    return [...groupedByCode.values()].map((group, index) => {
      const isDuplicate = group.length > 1;
      const entry = group[0];
      const { product, linkedByExcelAlias } = findProductForEntry(entry);
      return buildReviewRow(
        {
          entry,
          product,
          duplicateOptions: isDuplicate ? group : null,
          duplicateResolved: !isDuplicate,
          linkedByExcelAlias,
        },
        index,
      );
    });
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (isOperationBusy) {
      event.target.value = '';
      return;
    }
    if (rows.length > 0 && !window.confirm('Esto reemplazara el borrador actual. Queres continuar?')) {
      event.target.value = '';
      return;
    }
    const requestId = parseRequestRef.current + 1;
    parseRequestRef.current = requestId;
    setIsParsing(true);
    setFileError('');

    try {
      validateExcelImportFile(file);
      const buffer = await file.arrayBuffer();
      const fileFingerprint = await fingerprintExcelImportBuffer(buffer);
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(buffer, {
        type: 'array',
        cellFormula: false,
        cellHTML: false,
        cellNF: false,
        cellStyles: false,
        sheetRows: MAX_EXCEL_IMPORT_ROWS + 1,
        WTF: false,
      });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) throw new Error('El archivo no tiene hojas.');

      const sheet = workbook.Sheets[firstSheetName];
      const range = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : null;
      if (!range) throw new Error('La primera hoja esta vacia.');

      const columnCount = range.e.c - range.s.c + 1;
      if (columnCount > MAX_EXCEL_IMPORT_COLUMNS) {
        throw new Error(`El archivo tiene demasiadas columnas. El limite es ${MAX_EXCEL_IMPORT_COLUMNS}.`);
      }

      const sheetRows = XLSX.utils.sheet_to_json(sheet, {
        blankrows: false,
        defval: '',
        raw: false,
      });
      if (sheetRows.length === 0) throw new Error('La primera hoja esta vacia.');
      if (sheetRows.length > MAX_EXCEL_IMPORT_ROWS) {
        throw new Error(`El archivo tiene demasiadas filas. El limite es ${MAX_EXCEL_IMPORT_ROWS}.`);
      }

      const parsedRows = parseWorkbookRows(sheetRows, fileFingerprint);
      if (parseRequestRef.current !== requestId) return;
      setRows(parsedRows);
      setFileName(file.name);
      setActiveTargetBySource({});
      setActiveSourceRowId(parsedRows[0]?.id || '');
      setSelectedCreateRowIds([]);
      setCreateDrafts([]);
      setIsCreatePanelOpen(false);
      setResultFilter('all');
      setSearchTerm('');
      setLastApplyBatch(null);
    } catch (error) {
      if (parseRequestRef.current === requestId) {
        setFileError(error?.message || 'No se pudo leer el archivo. El borrador anterior se mantuvo.');
      }
    } finally {
      if (parseRequestRef.current === requestId) setIsParsing(false);
      event.target.value = '';
    }
  };

  const replaceRowEntry = (rowId, entry, duplicateResolved = true) => {
    setRows((prev) =>
      prev.map((row, index) => {
        if (row.id !== rowId) return row;
        const found = row.productCleared ? { product: null, linkedByExcelAlias: false } : findProductForEntry(entry);
        const product = found.product || row.product;
        return {
          ...buildReviewRow(
            {
              entry,
              product,
              duplicateOptions: row.duplicateOptions,
              duplicateResolved,
              linkedByExcelAlias: found.linkedByExcelAlias || row.linkedByExcelAlias,
            },
            index,
          ),
          id: row.id,
          assignmentQuery: row.assignmentQuery,
          changeProductMode: row.changeProductMode,
          manualAssigned: row.manualAssigned,
          linkedByExcelAlias: found.linkedByExcelAlias || row.linkedByExcelAlias,
          createdFromExcel: row.createdFromExcel,
          productCleared: row.productCleared,
        };
      }),
    );
  };

  const assignProductToRow = (rowId, product) => {
    setRows((prev) =>
      prev.map((row, index) => {
        if (row.id !== rowId) return row;
        return {
          ...buildReviewRow({ entry: row.entry, product, duplicateOptions: row.duplicateOptions, duplicateResolved: row.duplicateResolved }, index),
          id: row.id,
          assignmentQuery: '',
          changeProductMode: false,
          manualAssigned: true,
          linkedByExcelAlias: false,
          createdFromExcel: row.createdFromExcel,
          productCleared: false,
          isAssociated: row.isAssociated,
          sourceRowId: row.sourceRowId,
          duplicateOptions: row.duplicateOptions,
        };
      }),
    );
  };

  const clearProductFromRow = (rowId) => {
    const targetRow = rows.find((row) => row.id === rowId);
    const sourceId = targetRow?.sourceRowId || targetRow?.id;

    setRows((prev) =>
      prev.map((row, index) => {
        if (row.id !== rowId) return row;
        return {
          ...buildReviewRow(
            {
              entry: row.entry,
              product: null,
              duplicateOptions: row.duplicateOptions,
              duplicateResolved: row.duplicateResolved,
            },
            index,
          ),
          id: row.id,
          assignmentQuery: '',
          changeProductMode: true,
          manualAssigned: false,
          linkedByExcelAlias: false,
          createdFromExcel: false,
          productCleared: true,
          isAssociated: row.isAssociated,
          sourceRowId: row.sourceRowId,
          duplicateOptions: row.duplicateOptions,
          applied: false,
        };
      }),
    );

    if (sourceId) setActiveTarget(sourceId, rowId);
  };

  const addAssociatedProductRow = (sourceRow) => {
    const associatedId = `${sourceRow.id}-assoc-${Date.now()}`;
    setRows((prev) => {
      const sourceIndex = prev.findIndex((row) => row.id === sourceRow.id);
      const safeMultiplier = Number(sourceRow.entry.multiplier || 0) > 0 ? Number(sourceRow.entry.multiplier) : 1;
      const pricing = calculateExcelImportUnitPricing({
        lotCost: sourceRow.entry.lotCost ?? sourceRow.entry.cost,
        lotSalePrice: sourceRow.entry.lotSalePrice ?? sourceRow.entry.excelSalePrice,
        multiplier: safeMultiplier,
        marginPercent,
      });
      const { baseCost } = pricing;
      const safeCost = pricing.realCost;
      const safeSalePrice = pricing.salePrice;
      const { excelSalePrice } = pricing;
      const nextRow = {
        ...buildReviewRow(
          {
            entry: {
              ...sourceRow.entry,
              originalQuantity: sourceRow.entry.originalQuantity || sourceRow.entry.quantity || 0,
              quantity: 0,
              quantityInput: '0',
              multiplier: safeMultiplier,
              multiplierInput: String(safeMultiplier),
              baseCost,
              excelSalePrice,
              cost: safeCost,
              costInput: safeCost ? String(safeCost) : '',
              originalCost: sourceRow.entry.originalCost ?? safeCost,
              costEdited: false,
              salePrice: safeSalePrice,
              salePriceInput: safeSalePrice ? String(safeSalePrice) : '',
              originalSalePrice: sourceRow.entry.originalSalePrice ?? safeSalePrice,
              salePriceEdited: false,
            },
            product: null,
            duplicateOptions: null,
            duplicateResolved: true,
          },
          sourceIndex + 1,
        ),
        id: associatedId,
        isAssociated: true,
        sourceRowId: sourceRow.id,
        changeProductMode: true,
        assignmentQuery: '',
      };

      const nextRows = [...prev];
      nextRows.splice(sourceIndex + 1, 0, nextRow);
      return nextRows;
    });
    setActiveTarget(sourceRow.id, associatedId);
  };

  const removeAssociatedProductRow = (rowId) => {
    setRows((prev) => prev.filter((row) => row.id !== rowId));
    setActiveTargetBySource((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((sourceId) => {
        if (next[sourceId] === rowId) next[sourceId] = 'article';
      });
      return next;
    });
  };

  const setAssignmentQuery = (rowId, value) => {
    setRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, assignmentQuery: value } : row)));
  };

  const toggleChangeProductMode = (rowId) => {
    setRows((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? { ...row, changeProductMode: !row.changeProductMode, assignmentQuery: row.changeProductMode ? '' : row.assignmentQuery }
          : row,
      ),
    );
  };

  const updateRowEntryValue = (rowId, field, value) => {
    const parsedNumericValue = field === 'cost' || field === 'salePrice'
      ? parseExcelMoney(value)
      : parseNumber(value);
    const numericValue = field === 'salePrice'
      ? normalizeFinalSalePrice(parsedNumericValue)
      : parsedNumericValue;
    const inputKey = getEntryInputKey(field);
    setRows((prev) =>
      prev.map((row, index) => {
        if (row.id !== rowId) return row;
        const nextEntry = { ...row.entry, [field]: numericValue, [inputKey]: value };
        if (field === 'quantity' && row.entry.originalQuantity == null) {
          nextEntry.originalQuantity = Number(row.entry.quantity || 0);
        }
        if (field === 'cost') {
          Object.assign(nextEntry, repriceExcelImportEntryForRealCost(row.entry, numericValue, marginPercent));
          nextEntry.costInput = String(value ?? '').trim() === '' ? '' : String(nextEntry.cost);
        }
        if (field === 'salePrice') {
          nextEntry.salePriceEdited = true;
        }
        if (field === 'multiplier') {
          if (numericValue > 0) {
            Object.assign(nextEntry, repriceExcelImportEntryForMultiplier(row.entry, numericValue, marginPercent));
            nextEntry.multiplierInput = value;
          }
        }
        const nextRow = {
          ...buildReviewRow(
            {
              entry: nextEntry,
              product: row.product,
              duplicateOptions: row.duplicateOptions,
              duplicateResolved: row.duplicateResolved,
              linkedByExcelAlias: row.linkedByExcelAlias,
            },
            index,
          ),
          id: row.id,
          assignmentQuery: row.assignmentQuery,
          changeProductMode: row.changeProductMode,
          manualAssigned: row.manualAssigned,
          linkedByExcelAlias: row.linkedByExcelAlias,
          createdFromExcel: row.createdFromExcel,
          productCleared: row.productCleared,
          isAssociated: row.isAssociated,
          sourceRowId: row.sourceRowId,
          applied: row.applied,
          reviewedProductState: getProductReviewState(row.product),
          reviewInvalidated: row.reviewInvalidated,
        };
        return {
          ...nextRow,
          approvals: FIELD_KEYS.reduce((acc, approvalKey) => {
            acc[approvalKey] = Boolean(row.approvals[approvalKey] && isFieldEligible(nextRow, approvalKey));
            return acc;
          }, {}),
        };
      }),
    );
  };

  const toggleApproval = (rowId, field) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId || !isFieldEligible(row, field) || isFieldInvalidForRow(row, field)) return row;
        return {
          ...row,
          approvals: { ...row.approvals, [field]: !row.approvals[field] },
          reviewedProductState: getProductReviewState(row.product),
          reviewInvalidated: false,
        };
      }),
    );
  };

  const setFieldForEligibleRows = (field, value) => {
    setRows((prev) =>
      prev.map((row) => {
        if (!isFieldEligible(row, field) || isFieldInvalidForRow(row, field)) return row;
        return {
          ...row,
          approvals: { ...row.approvals, [field]: value },
          reviewedProductState: getProductReviewState(row.product),
          reviewInvalidated: value ? false : row.reviewInvalidated,
        };
      }),
    );
  };

  const clearApprovals = () => {
    setRows((prev) => prev.map((row) => ({ ...row, approvals: { stock: false, cost: false, price: false } })));
  };

  const clearImport = () => {
    if (isOperationBusy) return;
    if (rows.length > 0 && !window.confirm('Se eliminara el borrador de esta importacion. Queres continuar?')) return;
    parseRequestRef.current += 1;
    setRows([]);
    setActiveTargetBySource({});
    setActiveSourceRowId('');
    setFileName('');
    setFileError('');
    setSelectedCreateRowIds([]);
    setCreateDrafts([]);
    setIsCreatePanelOpen(false);
    setResultFilter('all');
    setSearchTerm('');
    setLastApplyBatch(null);
    if (typeof window !== 'undefined') {
      void clearExcelImportDraft({
        storage: window.localStorage,
        indexedDB: window.indexedDB,
        scope: cacheScope,
      });
    }
  };

  const openCreatePanel = (rowIds) => {
    if (isOperationBusy || !canCreateInventory) return;
    const requestedIds = new Set((rowIds || []).map(String));
    const targetRows = rows.filter(
      (row) => requestedIds.has(String(row.id)) && !row.product && row.duplicateResolved,
    );
    if (targetRows.length === 0) return;
    setCreateDrafts(targetRows.map(buildCreateDraft));
    setIsCreatePanelOpen(true);
    setFileError('');
  };

  const updateCreateDraft = (rowId, field, value) => {
    setCreateDrafts((prev) =>
      prev.map((draft) => {
        if (draft.rowId !== rowId) return draft;
        const nextValue = field === 'purchasePrice' && String(value ?? '').trim() !== ''
          ? String(normalizeFinalPurchaseCost(parseExcelMoney(value)))
          : value;
        const nextDraft = { ...draft, [field]: nextValue, error: '' };
        if (field === 'title' || field === 'barcode') {
          nextDraft.duplicate = getDuplicateCandidate({
            code: nextDraft.barcode,
            description: nextDraft.title,
          });
        }
        return nextDraft;
      }),
    );
  };

  const linkDuplicateDraft = (draft) => {
    if (!draft?.duplicate?.product) return;
    assignProductToRow(draft.rowId, draft.duplicate.product);
    setCreateDrafts((prev) => prev.filter((item) => item.rowId !== draft.rowId));
    setSelectedCreateRowIds((prev) => prev.filter((id) => id !== draft.rowId));
  };

  const handleCreateProducts = async () => {
    if (isOperationBusy || !canCreateInventory || !onCreateProducts || validCreateDrafts.length === 0) return;
    return runImportAction('excel-create-products', async () => {
      const submittedDraftByRowId = new Map(
        validCreateDrafts.map((draft) => [String(draft.rowId), draft]),
      );
      setIsCreatingProducts(true);
      setFileError('');
      try {
      const result = await onCreateProducts(validCreateDrafts.map((draft) => ({
        rowId: draft.rowId,
        title: String(draft.title || '').trim(),
        barcode: normalizeCode(draft.barcode) || null,
        category: draft.category,
        stock: 0,
        purchasePrice: parseExcelMoney(draft.purchasePrice),
        price: parseExcelMoney(draft.price),
        sourceCode: draft.sourceCode,
        sourceDescription: draft.sourceDescription,
        sourceRowNumber: draft.sourceRowNumber,
      })));
      const createdByRowId = new Map(
        (result?.created || []).map((item) => [String(item.rowId), item.product]),
      );
      const failedByRowId = new Map(
        (result?.failed || []).map((item) => [String(item.rowId), item.error || 'No se pudo crear']),
      );

      setRows((prev) =>
        prev.map((row, index) => {
          const product = createdByRowId.get(String(row.id));
          if (!product) return row;
          const submittedDraft = submittedDraftByRowId.get(String(row.id));
          const draftCost = parseExcelMoney(submittedDraft?.purchasePrice ?? row.entry.cost);
          const draftPrice = parseExcelMoney(submittedDraft?.price ?? row.entry.salePrice);
          const syncedEntry = {
            ...row.entry,
            cost: draftCost,
            costInput: draftCost ? String(draftCost) : '',
            originalCost: row.entry.originalCost ?? draftCost,
            salePrice: draftPrice,
            salePriceInput: draftPrice ? String(draftPrice) : '',
            originalSalePrice: row.entry.originalSalePrice ?? draftPrice,
          };
          return {
            ...buildReviewRow({
              entry: syncedEntry,
              product,
              duplicateOptions: row.duplicateOptions,
              duplicateResolved: row.duplicateResolved,
            }, index),
            id: row.id,
            entry: syncedEntry,
            product,
            approvals: {
              stock: getStockDelta(row.entry) > 0,
              cost: false,
              price: false,
            },
            applied: false,
            manualAssigned: false,
            linkedByExcelAlias: false,
            createdFromExcel: true,
            changeProductMode: false,
            productCleared: false,
            isAssociated: row.isAssociated,
            sourceRowId: row.sourceRowId,
          };
        }),
      );

      setCreateDrafts((prev) =>
        prev
          .filter((draft) => !createdByRowId.has(String(draft.rowId)))
          .map((draft) => ({
            ...draft,
            error: failedByRowId.get(String(draft.rowId)) || draft.error,
          })),
      );
      setSelectedCreateRowIds((prev) =>
        prev.filter((rowId) => !createdByRowId.has(String(rowId))),
      );

      if (failedByRowId.size === 0) {
        setIsCreatePanelOpen(false);
      }
      } catch (error) {
        setFileError(error?.message || 'No se pudieron crear los productos seleccionados.');
      } finally {
        setIsCreatingProducts(false);
      }
    });
  };

  const setActiveTarget = (sourceRowId, targetId) => {
    setActiveSourceRowId(sourceRowId);
    setActiveTargetBySource((prev) => ({ ...prev, [sourceRowId]: targetId }));
  };

  const getProductCandidates = (row) => {
    const query = row.assignmentQuery.trim().toLowerCase();
    if (!query) return [];
    const words = query.split(/\s+/);
    return (inventory || [])
      .filter((product) => {
        const aliasText = getExcelImportAliases(product)
          .map((alias) => `${alias.code || ''} ${alias.description || ''}`)
          .join(' ');
        const haystack = `${product.id} ${product.title || ''} ${product.barcode || ''} ${product.category || ''} ${aliasText}`.toLowerCase();
        return words.every((word) => haystack.includes(word));
      })
      .slice(0, 8);
  };

  const buildApplyPayload = (targetRows = applicableRows) =>
    targetRows.map((row) => {
      const before = {
        stock: Number(row.product.stock || 0),
        cost: Number(row.product.purchasePrice || 0),
        price: Number(row.product.price || 0),
        barcode: row.product.barcode || '',
      };
      const after = {
        stock: row.approvals.stock ? before.stock + getStockDelta(row.entry) : before.stock,
        cost: row.approvals.cost ? Number(row.entry.cost || 0) : before.cost,
        price: row.approvals.price ? Number(row.entry.salePrice || 0) : before.price,
        barcode: hasBarcodeAssignmentChange(row) ? row.entry.code : before.barcode,
      };

      return {
        rowId: row.id,
        productId: row.product.id,
        productTitle: row.product.title,
        importedCode: row.entry.code,
        importedDescription: row.entry.description,
        manualAssigned: row.manualAssigned,
        isAssociated: row.isAssociated,
        shouldAssignBarcode: hasBarcodeAssignmentChange(row),
        shouldSaveExcelLink: shouldSaveExcelLinkForRow(row),
        excelLink: {
          code: row.entry.code,
          description: row.entry.description,
          rowNumber: row.entry.rowNumber,
        },
        importApplication: {
          signature: getRowImportSignature(row),
          fileFingerprint: row.entry.fileFingerprint,
          rowNumber: row.entry.rowNumber,
          code: row.entry.code,
          description: row.entry.description,
        },
        approvals: row.approvals,
        quantity: getStockDelta(row.entry),
        importedQuantity: Number(row.entry.quantity || 0),
        multiplier: Number(row.entry.multiplier ?? 1),
        before,
        after,
      };
    });

  const normalizeUndoItems = (items = []) =>
    (items || []).map((item) => ({
      rowId: item.rowId,
      productId: item.productId,
      productTitle: item.productTitle,
      approvals: item.approvals || { stock: false, cost: false, price: false },
      before: {
        stock: Number(item.before?.stock || 0),
        purchasePrice: Number(item.before?.purchasePrice ?? item.before?.cost ?? 0),
        price: Number(item.before?.price || 0),
        barcode: item.before?.barcode || '',
        supplierLinks: item.before?.supplierLinks || {},
        isActive: item.before?.isActive !== false,
      },
      after: {
        stock: Number(item.after?.stock || 0),
        purchasePrice: Number(item.after?.purchasePrice ?? item.after?.cost ?? 0),
        price: Number(item.after?.price || 0),
        barcode: item.after?.barcode || '',
        supplierLinks: item.after?.supplierLinks || {},
        isActive: item.after?.isActive !== false,
      },
      clearedBarcodeOwner: item.clearedBarcodeOwner || null,
    }));

  const handleApplyRows = async (targetRows = applicableRows) => {
    if (isOperationBusy || !canEditInventory) return;
    const rowsToApply = targetRows.filter((row) => isRowApplicable(row));
    if (rowsToApply.length === 0 || !onApplyImport) return;
    const productIds = rowsToApply.map((row) => String(row.product.id));
    const duplicatedProduct = productIds.find((id, index) => productIds.indexOf(id) !== index);
    if (duplicatedProduct) {
      setFileError('Hay mas de una fila aprobada para el mismo producto. Resolve esa repeticion antes de aplicar.');
      return;
    }

    return runImportAction('excel-apply', async () => {
      setIsApplying(true);
      try {
        setFileError('');
        const payload = buildApplyPayload(rowsToApply);
      const result = await onApplyImport(payload);
      const appliedIds = new Set(result?.appliedRowIds || payload.map((row) => row.rowId));
      const undoItems = normalizeUndoItems(result?.undoItems || payload).filter((item) => appliedIds.has(item.rowId));
      const appliedResultByRowId = new Map(undoItems.map((item) => [item.rowId, item]));

      setRows((prev) =>
        prev.map((row) => {
          if (!appliedIds.has(row.id)) return row;
          const payloadRow = payload.find((item) => item.rowId === row.id);
          const appliedResult = appliedResultByRowId.get(row.id);
          const actualAfter = appliedResult?.after;
          const mergedProduct = mergeExcelImportProductResult(row.product, payloadRow.after, actualAfter);
          return {
            ...row,
            product: mergedProduct,
            approvals: { stock: false, cost: false, price: false },
            reviewedProductState: getProductReviewState(mergedProduct),
            reviewInvalidated: false,
            applied: true,
            manualAssigned: false,
            linkedByExcelAlias: false,
            createdFromExcel: false,
            changeProductMode: false,
            isAssociated: row.isAssociated,
            sourceRowId: row.sourceRowId,
          };
        }),
      );
      if (undoItems.length > 0) {
        setLastApplyBatch({
          id: `${Date.now()}`,
          items: undoItems,
          count: undoItems.length,
        });
      }
      if (result?.failed?.length > 0) {
        setFileError(result.failed
          .map((failure) => `${failure.productTitle || 'Producto'}: ${failure.error}`)
          .join(' '));
      }
      } finally {
        setIsApplying(false);
      }
    });
  };

  const handleApply = async () => handleApplyRows(applicableRows);

  const handleUndoLastApply = async () => {
    if (isOperationBusy || !canEditInventory || !lastApplyBatch?.items?.length || !onUndoImport) return;
    return runImportAction('excel-undo', async () => {
      setIsUndoingImport(true);
      try {
        setFileError('');
      const result = await onUndoImport(lastApplyBatch.items);
      if (result?.cancelled) return;

      const undoneIds = new Set(result?.undoneRowIds || lastApplyBatch.items.map((item) => item.rowId));
      const itemByRowId = new Map(lastApplyBatch.items.map((item) => [item.rowId, item]));
      const remainingItems = lastApplyBatch.items.filter((item) => !undoneIds.has(item.rowId));

      setRows((prev) =>
        prev.map((row) => {
          if (!undoneIds.has(row.id)) return row;
          const undoItem = itemByRowId.get(row.id);
          if (!undoItem) return row;
          const restoredProduct = row.product
            ? {
                ...row.product,
                stock: undoItem.before.stock,
                purchasePrice: undoItem.before.purchasePrice,
                price: undoItem.before.price,
                barcode: undoItem.before.barcode,
                supplierLinks: undoItem.before.supplierLinks,
                supplier_links: undoItem.before.supplierLinks,
                isActive: undoItem.before.isActive,
                is_active: undoItem.before.isActive,
              }
            : row.product;
          return {
            ...row,
            product: restoredProduct,
            approvals: {
              stock: Boolean(undoItem.approvals?.stock),
              cost: Boolean(undoItem.approvals?.cost),
              price: Boolean(undoItem.approvals?.price),
            },
            reviewedProductState: getProductReviewState(restoredProduct),
            reviewInvalidated: false,
            applied: false,
          };
        }),
      );
      setLastApplyBatch(remainingItems.length > 0
        ? {
            ...lastApplyBatch,
            items: remainingItems,
            count: remainingItems.length,
          }
        : null);
      if (result?.failed?.length > 0) {
        setFileError(result.failed
          .map((failure) => `${failure.productTitle || 'Producto'}: ${failure.error}`)
          .join(' '));
      }
      } catch (error) {
        setFileError(error?.message || 'No se pudo deshacer la ultima aplicacion.');
      } finally {
        setIsUndoingImport(false);
      }
    });
  };

  return (
    <div className="bulk-excel-import flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)] gap-3 overflow-hidden">
      <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col min-h-0">
        <div className="p-4 border-b border-slate-200 bg-slate-50/80">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <FileSpreadsheet size={18} className="text-emerald-600" />
                Importar Excel
              </h2>
              <p className="text-[11px] text-slate-500 font-bold mt-1">1) Carga archivo  2) Asigna productos  3) Marca cambios.</p>
            </div>
            {rows.length > 0 && (
              <button
                type="button"
                onClick={clearImport}
                disabled={isOperationBusy}
                className="h-8 w-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-white hover:text-red-500 flex items-center justify-center transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                title="Limpiar importacion"
                aria-label="Limpiar importacion"
              >
                <X size={15} />
              </button>
            )}
          </div>

          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileChange} disabled={isOperationBusy} className="hidden" />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isOperationBusy}
            className="excel-upload-button mt-4 w-full rounded-xl border border-dashed border-emerald-300 bg-emerald-50/70 px-4 py-5 text-emerald-800 hover:bg-emerald-50 hover:border-emerald-400 transition-colors flex flex-col items-center gap-2 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {isParsing || !isDraftHydrated ? <Loader2 size={24} className="animate-spin" /> : <Upload size={24} />}
            <span className="excel-upload-title text-xs font-black">{fileName || 'Seleccionar archivo .xlsx o .xls'}</span>
            <span className="excel-upload-fields text-[10px] font-bold text-emerald-600">Codigo, Descripcion, Cantidad, Precio, Descuento, Costo, Venta</span>
          </button>

          <div className="mt-3">
            <PricingFormulaControls
              marginPercent={marginPercent}
              onMarginChange={onMarginChange}
              compact
            />
            <p className="mt-1.5 text-[9px] font-bold leading-snug text-slate-500">
              Costo se interpreta sin IVA. Venta del Excel queda como referencia; la sugerencia usa el margen elegido.
            </p>
          </div>

          <p className={`mt-2 text-[9px] font-black ${cacheStatus === 'error' ? 'text-red-600' : 'text-slate-400'}`} aria-live="polite">
            {cacheStatus === 'loading' && 'Recuperando borrador...'}
            {cacheStatus === 'saving' && 'Guardando borrador...'}
            {cacheStatus === 'saved' && 'Borrador guardado'}
            {cacheStatus === 'restored' && 'Borrador recuperado'}
            {cacheStatus === 'error' && 'No se pudo guardar el borrador en este equipo'}
            {cacheStatus === 'disabled' && 'Borrador desactivado: falta identificar al usuario'}
          </p>

          {fileError && (
            <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-[11px] font-bold text-red-700 flex gap-2">
              <AlertTriangle size={15} className="shrink-0" />
              {fileError}
            </div>
          )}
        </div>

        <div className="border-b border-slate-200 bg-white px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider font-black text-slate-500">Estado del lote</p>
              <p className="mt-0.5 truncate text-[11px] font-bold text-slate-400">
                {summary.total === 0
                  ? 'Esperando archivo'
                  : summary.unassigned > 0
                    ? 'Asignar productos pendientes'
                    : summary.approved > 0
                      ? 'Listo para aplicar seleccion'
                      : 'Revisar y marcar campos'}
              </p>
            </div>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-black text-slate-600">
              Paso {currentStep}/4
            </span>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-1">
            {[1, 2, 3, 4].map((step) => (
              <span
                key={step}
                className={`h-1.5 rounded-full ${
                  step < currentStep
                    ? 'bg-emerald-500'
                    : step === currentStep
                      ? 'bg-sky-500'
                      : 'bg-slate-200'
                }`}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] font-black">
            <span className="text-slate-500"><strong className="text-slate-800">{summary.total}</strong> filas</span>
            <span className="text-sky-600"><strong>{summary.unassigned}</strong> sin asignar</span>
            <span className={summary.blocked > 0 ? 'text-red-600' : 'text-slate-400'}><strong>{summary.blocked}</strong> bloqueadas</span>
            <span className={applicableRows.length > 0 ? 'text-emerald-600' : 'text-slate-400'}><strong>{applicableRows.length}</strong> para aplicar</span>
          </div>
        </div>

        {creatableRows.length > 0 && (
          <details
            className="excel-create-batch border-b border-slate-200 bg-white"
            open={isCreateSectionOpen}
            onToggle={(event) => setIsCreateSectionOpen(event.currentTarget.open)}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5">
              <span className="flex items-center gap-2 text-[10px] font-black text-slate-600">
                <PackagePlus size={13} className="text-amber-600" />
                Crear productos nuevos
              </span>
              <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[9px] font-black text-amber-700">
                {selectedCreateRowIds.length}/{creatableRows.length}
              </span>
            </summary>
            <div className="border-t border-slate-100 px-3 pb-3 pt-2">
              <p className="text-[9px] font-bold text-slate-500">
                Selecciona pendientes para crearlos juntos. También puedes crearlos desde cada búsqueda.
              </p>
              <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const allIds = creatableRows.map((row) => row.id);
                    setSelectedCreateRowIds(
                      selectedCreateRowIds.length === allIds.length ? [] : allIds,
                    );
                  }}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[9px] font-black text-slate-600 hover:bg-slate-50"
                >
                  {selectedCreateRowIds.length === creatableRows.length ? 'Limpiar selección' : 'Seleccionar pendientes'}
                </button>
                <button
                  type="button"
                  disabled={rowIdsParaCrear.length === 0 || isOperationBusy || !canCreateInventory}
                  onClick={() => openCreatePanel(rowIdsParaCrear)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-[9px] font-black text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <PackagePlus size={12} />
                  Crear {rowIdsParaCrear.length}
                </button>
              </div>
            </div>
          </details>
        )}

        <div className="p-3 space-y-2 border-b border-slate-200">
          <p className="text-[10px] uppercase tracking-wider font-black text-slate-500">Seleccion rapida</p>
          <div className="grid grid-cols-4 gap-1.5">
            <button type="button" onClick={() => setFieldForEligibleRows('stock', true)} className="excel-quick-action rounded-md border border-slate-200 bg-white px-2 py-2 text-[10px] font-black text-slate-700 hover:bg-slate-50"><span className="mr-1 text-sky-500">●</span>Stock</button>
            <button type="button" onClick={() => setFieldForEligibleRows('cost', true)} className="excel-quick-action rounded-md border border-slate-200 bg-white px-2 py-2 text-[10px] font-black text-slate-700 hover:bg-slate-50"><span className="mr-1 text-violet-500">●</span>Costo</button>
            <button type="button" onClick={() => setFieldForEligibleRows('price', true)} className="excel-quick-action rounded-md border border-slate-200 bg-white px-2 py-2 text-[10px] font-black text-slate-700 hover:bg-slate-50"><span className="mr-1 text-emerald-500">●</span>Venta</button>
            <button type="button" onClick={clearApprovals} className="excel-quick-action rounded-md border border-slate-200 bg-white px-2 py-2 text-[10px] font-black text-slate-500 hover:bg-slate-50 flex items-center justify-center gap-1">
              <Eraser size={11} /> Limpiar
            </button>
          </div>
        </div>
      </section>

      <section
        className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col min-h-0"
        aria-busy={isOperationBusy}
        inert={isOperationBusy ? '' : undefined}
      >
        <div className="excel-review-header px-4 py-3 border-b border-slate-200 bg-slate-800 text-white flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-black">Revision del lote</h3>
            <p className="text-[10px] text-slate-300 font-bold">Asigna el producto y confirma solo los valores que cambian.</p>
          </div>
          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
            <label className="excel-result-search relative flex h-8 min-w-[190px] max-w-[260px] flex-1 items-center rounded-md border border-white/10 bg-black/10">
              <Search size={13} className="pointer-events-none absolute left-2.5 text-slate-400" />
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                name="excel-import-search"
                autoComplete="off"
                placeholder="Buscar codigo o producto…"
                aria-label="Buscar en el lote importado"
                className="h-full w-full bg-transparent pl-8 pr-8 text-[10px] font-bold text-white outline-none placeholder:text-slate-400 focus:ring-1 focus:ring-inset focus:ring-sky-400/70"
              />
              {searchTerm ? (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-1.5 flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-white/10 hover:text-white"
                  title="Limpiar busqueda"
                  aria-label="Limpiar busqueda"
                >
                  <X size={11} />
                </button>
              ) : null}
            </label>
            <label className="excel-result-select relative flex h-8 items-center gap-2 rounded-md border border-white/10 bg-black/10 pl-2 pr-1">
              <Filter size={12} className="text-slate-400" />
              <span className="text-[8px] font-black uppercase tracking-wider text-slate-400">Mostrar</span>
              <select
                value={resultFilter}
                onChange={(event) => setResultFilter(event.target.value)}
                aria-label="Filtrar resultados del lote"
                className="h-full min-w-[126px] cursor-pointer appearance-none bg-transparent pl-1 pr-6 text-[10px] font-black text-white outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              >
                <option value="all">Todos ({resultFilterCounts.all})</option>
                <option value="applicable">Por aplicar ({resultFilterCounts.applicable})</option>
                <option value="unassigned">Sin asignar ({resultFilterCounts.unassigned})</option>
                <option value="blocked">Bloqueados ({resultFilterCounts.blocked})</option>
                <option value="changes">Con cambios ({resultFilterCounts.changes})</option>
                <option value="unchanged">Sin cambios ({resultFilterCounts.unchanged})</option>
                <option value="applied">Aplicados ({resultFilterCounts.applied})</option>
              </select>
              <span className="pointer-events-none absolute right-2 text-[9px] text-slate-400">▼</span>
            </label>
            {lastApplyBatch?.items?.length > 0 && (
              <AsyncActionButton
                onAction={handleUndoLastApply}
                pending={isUndoingImport}
                disabled={isOperationBusy || !canEditInventory}
                loadingLabel="Deshaciendo..."
                className="excel-undo-apply inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-amber-300/60 bg-amber-400/15 px-3 text-[9px] font-black uppercase tracking-wide text-amber-50 transition-colors hover:bg-amber-400/25 disabled:cursor-not-allowed disabled:opacity-35"
                title={`Deshacer ${lastApplyBatch.count || lastApplyBatch.items.length} producto(s) aplicados`}
              >
                {isUndoingImport ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                Deshacer {lastApplyBatch.count || lastApplyBatch.items.length}
              </AsyncActionButton>
            )}
            <AsyncActionButton
              onAction={handleApply}
              pending={isApplying}
              disabled={applicableRows.length === 0 || isOperationBusy || !canEditInventory}
              loadingLabel="Aplicando..."
              className="excel-apply-all inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-emerald-300/40 bg-emerald-500 px-3 text-[9px] font-black uppercase tracking-wide text-white shadow-sm shadow-emerald-950/20 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-35"
            >
              {isApplying ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
              Aplicar {applicableRows.length}
            </AsyncActionButton>
            {summary.duplicates > 0 && (
              <span className="rounded-md border border-amber-300/30 bg-amber-400/10 px-2.5 py-1 text-[10px] font-black text-amber-100">
                {summary.duplicates} duplicado(s)
              </span>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
          {rows.length === 0 ? (
            <div className="h-full min-h-[360px] flex flex-col items-center justify-center text-center p-8 text-slate-400">
              <FileSpreadsheet size={42} className="mb-3 text-slate-300" />
              <p className="font-black text-slate-600">Carga un Excel para revisar productos.</p>
              <p className="text-xs font-bold mt-1 max-w-md">El cruce se hace solo por codigo de barras. Si no existe, vas a elegir el producto manualmente.</p>
            </div>
          ) : visibleRowGroups.length === 0 ? (
            <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center p-8 text-slate-400">
              <Filter size={32} className="mb-3 text-slate-500" />
              <p className="font-black text-slate-600">No hay articulos para esta busqueda y filtro.</p>
              <button
                type="button"
                onClick={() => {
                  setResultFilter('all');
                  setSearchTerm('');
                }}
                className="mt-2 text-[10px] font-black text-sky-600 hover:text-sky-500"
              >
                Limpiar busqueda y filtros
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {renderedRowGroups.map((rowGroup, rowIndex) => {
                const row = rowGroup.primaryRow;
                const status = getRowStatus(row);
                const associatedRows = rowGroup.associatedRows;
                const productRows = rowGroup.productRows;
                const activeTargetId = activeTargetBySource[row.id] || 'article';
                const activeReviewRow = activeTargetId === 'article'
                  ? null
                  : productRows.find((targetRow) => targetRow.id === activeTargetId) || row;
                const canSumDuplicates = row.duplicateOptions ? areDuplicatePricesEqual(row.duplicateOptions) : false;
                const stockDelta = getStockDelta(row.entry);
                const stockUnit = getStockUnit(row.product);
                const stockAfter = row.product ? Number(row.product.stock || 0) + stockDelta : stockDelta;
                const activeCandidates = activeReviewRow ? getProductCandidates(activeReviewRow) : [];
                const activeStockDelta = activeReviewRow ? getStockDelta(activeReviewRow.entry) : 0;
                const activeStockUnit = activeReviewRow ? getStockUnit(activeReviewRow.product) : 'u.';
                const activeStockAfter = activeReviewRow?.product
                  ? Number(activeReviewRow.product.stock || 0) + activeStockDelta
                  : activeStockDelta;
                const activeShowAssignmentSearch = activeReviewRow && (!activeReviewRow.product || activeReviewRow.changeProductMode);
                const activeChangeFields = activeReviewRow?.product
                  ? [
                      { key: 'stock', label: 'Stock', tone: 'blue' },
                      { key: 'cost', label: 'Costo', tone: 'violet' },
                      { key: 'price', label: 'Venta', tone: 'emerald' },
                    ].filter(({ key }) => isFieldEligible(activeReviewRow, key))
                  : [];
                const activeApprovedCount = activeChangeFields.filter(({ key }) => activeReviewRow.approvals[key]).length;
                const isActiveSource = activeSourceRowId === row.id;

                return (
                  <article
                    key={row.id}
                    aria-current={isActiveSource ? 'true' : undefined}
                    onClick={() => {
                      setActiveSourceRowId(row.id);
                    }}
                    className={`excel-review-row excel-review-row-${status.tone} excel-review-row-collapsed ${rowIndex % 2 === 1 ? 'excel-review-row-alternate' : ''} ${isActiveSource ? 'excel-review-row-active' : ''} ${status.tone === 'amber' ? 'excel-review-row-attention' : ''} border-l-2 px-3 py-2 transition-colors ${statusAccentClass[status.tone] || 'border-l-slate-200'}`}
                  >
                    <div className="excel-review-content grid grid-cols-1 2xl:grid-cols-[minmax(390px,0.92fr)_minmax(560px,1.08fr)] gap-3">
                      <div className="excel-review-left min-w-0">
                        <div className="excel-row-heading grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2">
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={(event) => {
                              event.stopPropagation();
                              setActiveSourceRowId(row.id);
                              setActiveTarget(row.id, 'article');
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                event.stopPropagation();
                                setActiveSourceRowId(row.id);
                                setActiveTarget(row.id, 'article');
                              }
                            }}
                            className="excel-row-title-trigger contents text-left"
                            title="Ver datos del Excel"
                          >
                            <span className={`excel-row-icon h-7 w-7 rounded-lg border flex items-center justify-center shrink-0 ${
                              row.product ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-sky-50 border-sky-200 text-sky-700'
                            }`}>
                              {row.product ? <Package size={14} /> : <Search size={14} />}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 min-w-0">
                                <p className="font-black text-slate-900 text-[13px] truncate" title={row.entry.description || row.entry.code || row.product?.title}>
                                  {row.entry.description || row.entry.code || 'Fila del Excel'}
                                </p>
                                {row.isAssociated && (
                                  <span className="shrink-0 rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2 py-0.5 text-[9px] font-black uppercase text-fuchsia-700">
                                    sin codigo
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] font-bold text-slate-400 font-mono">
                                {row.isAssociated ? 'Vinculado al codigo Excel' : 'Codigo Excel'}: {row.entry.code || '--'} / Fila {row.entry.rowNumber}
                              </p>
                            </div>
                          </div>
                          <div className="excel-row-status flex min-w-[78px] flex-col items-end gap-1.5">
                            <span className={`rounded-md border px-2 py-0.5 text-[9px] font-black uppercase ${statusClass[status.tone]}`}>
                              {row.isAssociated ? 'Asociado' : status.label}
                            </span>
                          </div>
                        </div>

                        {row.duplicateOptions && !row.duplicateResolved && (
                          <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-2">
                            <p className="text-[10px] font-black uppercase tracking-wider text-sky-700 mb-2">Codigo duplicado en Excel</p>
                            <div className="flex flex-wrap gap-1.5">
                              {row.duplicateOptions.map((entry, optionIndex) => (
                                <button
                                  key={`${entry.rowNumber}-${optionIndex}`}
                                  type="button"
                                  onClick={() => replaceRowEntry(row.id, entry)}
                                  className="rounded-md border border-sky-200 bg-white px-2 py-1 text-[10px] font-black text-sky-800 hover:bg-sky-100"
                                >
                                  Usar fila {entry.rowNumber}
                                </button>
                              ))}
                              <button
                                type="button"
                                disabled={!canSumDuplicates}
                                onClick={() => replaceRowEntry(row.id, mergeDuplicateEntries(row.duplicateOptions))}
                                className="rounded-md border border-sky-200 bg-sky-100 px-2 py-1 text-[10px] font-black text-sky-900 hover:bg-sky-200 disabled:opacity-50"
                                title={!canSumDuplicates ? 'No se puede sumar si costo o venta difieren' : 'Sumar cantidades'}
                              >
                                Sumar filas
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="excel-target-list mt-2 divide-y divide-slate-200/70 border-y border-slate-200/70">
                          {productRows.map((targetRow, targetIndex) => {
                            const hasSplitControls = productRows.length > 1;
                            const targetQuantity = Number(targetRow.entry.quantity || 0);
                            const targetMultiplier = Number(targetRow.entry.multiplier || 0);
                            const targetStockDelta = getStockDelta(targetRow.entry);
                            const targetUnit = getStockUnit(targetRow.product);
                            const targetLabel = targetRow.isAssociated
                              ? `Rebu ${targetIndex + 1} asociado`
                              : 'Rebu 1 principal';
                            const targetSubtitle = targetRow.product
                              ? `${targetQuantity.toLocaleString('es-AR')} compra x ${targetMultiplier.toLocaleString('es-AR')} equiv. = ${targetStockDelta.toLocaleString('es-AR')} ${targetUnit}`
                              : targetRow.isAssociated
                                ? 'Elegí producto y cantidad para repartir'
                                : 'Elegí producto del inventario';

                            return (
                              <ReviewTargetButton
                                key={targetRow.id}
                                active={activeTargetId === targetRow.id}
                                label={targetLabel}
                                title={targetRow.product?.title || (targetRow.isAssociated ? 'Elegir producto asociado' : 'Buscar producto Rebu')}
                                subtitle={targetSubtitle}
                                tone={targetRow.isAssociated ? 'teal' : 'blue'}
                                onClick={() => setActiveTarget(row.id, targetRow.id)}
                                onRemove={targetRow.isAssociated ? () => removeAssociatedProductRow(targetRow.id) : undefined}
                                quantitySlot={hasSplitControls ? (
                                  <SplitQuantityControl
                                    value={targetRow.entry.quantityInput ?? targetRow.entry.quantity ?? ''}
                                    warning={targetQuantity <= 0}
                                    onChange={(value) => updateRowEntryValue(targetRow.id, 'quantity', value)}
                                  />
                                ) : null}
                                actionSlot={targetRow.product ? (
                                  <div className="excel-target-actions flex items-center gap-1">
                                    <ProductRowActions
                                      changeMode={targetRow.changeProductMode}
                                      onChange={() => toggleChangeProductMode(targetRow.id)}
                                      onRemove={() => clearProductFromRow(targetRow.id)}
                                    />
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        handleApplyRows([targetRow]);
                                      }}
                                      disabled={!isRowApplicable(targetRow) || isOperationBusy || !canEditInventory}
                                      className="excel-target-apply inline-flex h-7 items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 text-[8px] font-black uppercase tracking-wide text-emerald-800 shadow-sm shadow-emerald-950/5 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
                                      title={isRowApplicable(targetRow) ? 'Aplicar solo esta fila' : 'Marca campos o cambia el producto asignado'}
                                    >
                                      <CheckCircle2 size={10} />
                                      Aplicar
                                    </button>
                                  </div>
                                ) : null}
                              />
                            );
                          })}
                        </div>

                        {!row.isAssociated && (
                          <button
                            type="button"
                            onClick={() => addAssociatedProductRow(row)}
                            className="excel-associate-action mt-1 inline-flex items-center gap-1.5 px-1 py-1 text-[9px] font-black uppercase tracking-wide text-slate-400 hover:text-fuchsia-700"
                          >
                            <Link2 size={12} />
                            {associatedRows.length > 0 ? `Asociar otro producto (${associatedRows.length})` : 'Asociar otro producto'}
                          </button>
                        )}

                        {row.errors.length > 0 && (
                          <RowIssueNotice errors={row.errors} />
                        )}
                      </div>

                      {!isActiveSource ? (
                        <CompactReviewSummary
                          sourceRow={row}
                          productRows={productRows}
                          status={status}
                          marginPercent={marginPercent}
                        />
                      ) : activeTargetId === 'article' ? (
                        <CompactReviewSummary
                          sourceRow={row}
                          productRows={productRows}
                          status={status}
                          mode="article"
                          marginPercent={marginPercent}
                        />
                      ) : activeShowAssignmentSearch ? (
                        <div className="excel-assignment-panel min-h-[112px] border-l border-slate-200 pl-4 pt-1">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Producto Rebu</p>
                              <p className="mt-0.5 truncate text-[12px] font-black text-slate-900">Falta elegir producto Rebu</p>
                              <p className="text-[10px] font-bold text-slate-500">Selecciona una coincidencia o crea un artículo nuevo.</p>
                            </div>
                            <ArrowRight size={16} className="text-sky-500 shrink-0" />
                          </div>
                          {activeShowAssignmentSearch && (
                            <div className="relative mt-2">
                              <Search className="absolute left-2.5 top-2 text-slate-400" size={13} />
                              <input
                                value={activeReviewRow.assignmentQuery}
                                onChange={(event) => setAssignmentQuery(activeReviewRow.id, event.target.value)}
                                placeholder={activeReviewRow.isAssociated ? 'Buscar producto asociado...' : 'Buscar producto principal...'}
                                className="w-full rounded-md border border-slate-300 bg-white pl-8 pr-3 py-2 text-[11px] font-black text-slate-900 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200"
                              />
                              {activeCandidates.length > 0 && (
                                <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
                                  {activeCandidates.map((product) => (
                                    <button
                                      key={product.id}
                                      type="button"
                                      onClick={() => assignProductToRow(activeReviewRow.id, product)}
                                      className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center justify-between gap-3"
                                    >
                                      <span className="min-w-0">
                                        <span className="block text-xs font-black text-slate-800 truncate">{product.title}</span>
                                        <span className="block text-[10px] font-bold text-slate-400">ID {product.id} / Codigo {product.barcode || 'sin codigo'}</span>
                                      </span>
                                      <Link2 size={14} className="text-emerald-600 shrink-0" />
                                    </button>
                                  ))}
                                </div>
                              )}
                              {/* Siempre visible: antes solo aparecia si la busqueda no traia
                                  NINGUNA coincidencia, asi que con un parecido malo no se podia
                                  ni asignar ni crear. */}
                              {(
                                <button
                                  type="button"
                                  onClick={() => openCreatePanel([activeReviewRow.id])}
                                  disabled={isOperationBusy || !canCreateInventory}
                                  className="excel-create-inline mt-1.5 flex w-full items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50/60 px-2 py-1.5 text-left transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-45"
                                >
                                  <span className="min-w-0">
                                    <span className="block text-[9px] font-black uppercase tracking-wider text-emerald-700">
                                      Crear producto nuevo
                                    </span>
                                    <span className="block truncate text-[11px] font-black text-emerald-950">
                                      Crear “{activeReviewRow.assignmentQuery.trim()
                                        || String(activeReviewRow.entry?.description || '').trim()}”
                                    </span>
                                  </span>
                                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-white">
                                    <Plus size={14} />
                                  </span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ) : activeReviewRow?.product ? (
                        <CompactReviewSummary
                          sourceRow={row}
                          productRows={productRows}
                          status={status}
                          activeRow={activeReviewRow}
                          marginPercent={marginPercent}
                          onToggleApproval={toggleApproval}
                          onUpdateEntryValue={updateRowEntryValue}
                        />
                      ) : (
                        <div className="excel-comparison-panel border-l border-slate-200 pl-4 pt-1">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">Cambios del producto Rebu</p>
                              <p className="truncate text-[10px] font-bold text-slate-400">{activeReviewRow.product.title}</p>
                            </div>
                            <span className="shrink-0 text-[9px] font-black uppercase text-slate-400">Actual → Final</span>
                          </div>
                          <div className="excel-change-strip mt-2 flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                              {activeApprovedCount} de {activeChangeFields.length || 3} marcados
                            </span>
                            <div className="flex flex-wrap items-center gap-1">
                              {activeChangeFields.map((field) => {
                                const selected = Boolean(activeReviewRow.approvals[field.key]);
                                return (
                                  <button
                                    key={field.key}
                                    type="button"
                                    onClick={() => toggleApproval(activeReviewRow.id, field.key)}
                                    className={`excel-change-chip excel-change-chip-${field.tone} ${selected ? 'excel-change-chip-on' : ''}`}
                                    aria-pressed={selected}
                                  >
                                    {field.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          <div className="excel-comparison-list mt-2 divide-y divide-slate-200">
                          <CompareField
                            label="Stock"
                            tone="blue"
                            checked={activeReviewRow.approvals.stock}
                            disabled={!isFieldEligible(activeReviewRow, 'stock')}
                            onToggle={() => toggleApproval(activeReviewRow.id, 'stock')}
                            before={`${Number(activeReviewRow.product.stock || 0).toLocaleString('es-AR')} ${activeStockUnit}`}
                            after={`${activeStockAfter.toLocaleString('es-AR')} ${activeStockUnit}`}
                            delta={`+${activeStockDelta.toLocaleString('es-AR')} ${activeStockUnit}`}
                            multiplierControl={
                              <QuantityMultiplierControl
                                quantity={activeReviewRow.entry.quantity}
                                multiplier={activeReviewRow.entry.multiplierInput ?? activeReviewRow.entry.multiplier}
                                unit={activeStockUnit}
                                stockDelta={activeStockDelta}
                                compact
                                onChange={(value) => updateRowEntryValue(activeReviewRow.id, 'multiplier', value)}
                              />
                            }
                          />
                          <CompareField
                            label="Costo"
                            tone="violet"
                            checked={activeReviewRow.approvals.cost}
                            disabled={!isFieldEligible(activeReviewRow, 'cost')}
                            onToggle={() => toggleApproval(activeReviewRow.id, 'cost')}
                            before={<FancyPrice amount={activeReviewRow.product.purchasePrice} />}
                            after={<FancyPrice amount={activeReviewRow.entry.cost} />}
                            editableValue={activeReviewRow.entry.costInput ?? activeReviewRow.entry.cost}
                            onAfterChange={(value) => updateRowEntryValue(activeReviewRow.id, 'cost', value)}
                            delta={`${formatDiffPercent(activeReviewRow.product?.purchasePrice, activeReviewRow.entry.cost)} vs actual / Lote $${Number(activeReviewRow.entry.lotCost || activeReviewRow.entry.cost || 0).toLocaleString('es-AR')}`}
                          />
                          <CompareField
                            label="Venta"
                            tone="emerald"
                            checked={activeReviewRow.approvals.price}
                            disabled={!isFieldEligible(activeReviewRow, 'price')}
                            onToggle={() => toggleApproval(activeReviewRow.id, 'price')}
                            before={<FancyPrice amount={activeReviewRow.product.price} />}
                            after={<FancyPrice amount={activeReviewRow.entry.salePrice} />}
                            editableValue={activeReviewRow.entry.salePriceInput ?? activeReviewRow.entry.salePrice}
                            onAfterChange={(value) => updateRowEntryValue(activeReviewRow.id, 'salePrice', value)}
                            delta={`${formatDiffPercent(activeReviewRow.product?.price, activeReviewRow.entry.salePrice)} vs actual / Excel $${Number(activeReviewRow.entry.excelSalePrice || 0).toLocaleString('es-AR')}`}
                          />
                          </div>
                          <div className="mt-2">
                            <PricingFormulaTrace
                              baseCost={activeReviewRow.entry.baseCost}
                              realCost={activeReviewRow.entry.cost}
                              salePrice={activeReviewRow.entry.salePrice}
                              marginPercent={marginPercent}
                              excelSalePrice={activeReviewRow.entry.excelSalePrice}
                            />
                          </div>
                        </div>
                      )}

                      <div className="hidden">
                      {!row.product ? (
                        <div className="rounded-xl border border-sky-200 bg-sky-50 p-2">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[9px] font-black uppercase tracking-wider text-sky-700">Accion necesaria</p>
                              <p className="mt-0.5 truncate text-[12px] font-black text-sky-950">Asignar codigo a un producto</p>
                              <p className="text-[10px] font-bold text-amber-800">Elegí producto y marcá campos.</p>
                            </div>
                            <ArrowRight size={16} className="text-sky-500 shrink-0" />
                          </div>
                          <div className="mt-2 grid grid-cols-3 gap-1.5">
                            <ImportChip
                              label="Stock Excel"
                              tone="stock"
                              value={
                                <>
                                  <span className="text-sky-700">+{Number(row.entry.quantity || 0).toLocaleString('es-AR')}</span>
                                  <span className="ml-1 text-[10px] font-black uppercase text-sky-500">u.</span>
                                </>
                              }
                            />
                            <ImportChip label="Costo Excel" tone="cost" value={<FancyPrice amount={row.entry.cost} />} />
                            <ImportChip label="Venta sugerida" tone="price" value={<FancyPrice amount={row.entry.salePrice} />} />
                          </div>
                          <QuantityMultiplierControl
                            quantity={row.entry.quantity}
                            multiplier={row.entry.multiplierInput ?? row.entry.multiplier}
                            unit="u./g"
                            stockDelta={stockDelta}
                            onChange={(value) => updateRowEntryValue(row.id, 'multiplier', value)}
                          />
                        </div>
                      ) : (
                      <div className="grid grid-cols-1 md:grid-cols-[repeat(3,minmax(150px,220px))] gap-1.5 md:justify-end">
                        <CompareField
                          label="Stock"
                          tone="blue"
                          checked={row.approvals.stock}
                          disabled={!isFieldEligible(row, 'stock')}
                          onToggle={() => toggleApproval(row.id, 'stock')}
                          before={row.product ? `${Number(row.product.stock || 0).toLocaleString('es-AR')} ${stockUnit}` : '--'}
                          after={`${stockAfter.toLocaleString('es-AR')} ${stockUnit}`}
                          delta={`+${stockDelta.toLocaleString('es-AR')} ${stockUnit}`}
                          multiplierControl={
                            <QuantityMultiplierControl
                              quantity={row.entry.quantity}
                              multiplier={row.entry.multiplierInput ?? row.entry.multiplier}
                              unit={stockUnit}
                              stockDelta={stockDelta}
                              compact
                              onChange={(value) => updateRowEntryValue(row.id, 'multiplier', value)}
                            />
                          }
                        />
                        <CompareField
                          label="Costo"
                          tone="violet"
                          checked={row.approvals.cost}
                          disabled={!isFieldEligible(row, 'cost')}
                          onToggle={() => toggleApproval(row.id, 'cost')}
                          before={row.product ? <FancyPrice amount={row.product.purchasePrice} /> : '--'}
                          after={<FancyPrice amount={row.entry.cost} />}
                          editableValue={row.entry.costInput ?? row.entry.cost}
                          onAfterChange={(value) => updateRowEntryValue(row.id, 'cost', value)}
                          delta={`${formatDiffPercent(row.product?.purchasePrice, row.entry.cost)} vs actual / Lote $${Number(row.entry.lotCost || row.entry.cost || 0).toLocaleString('es-AR')}`}
                        />
                        <CompareField
                          label="Venta"
                          tone="emerald"
                          checked={row.approvals.price}
                          disabled={!isFieldEligible(row, 'price')}
                          onToggle={() => toggleApproval(row.id, 'price')}
                          before={row.product ? <FancyPrice amount={row.product.price} /> : '--'}
                          after={<FancyPrice amount={row.entry.salePrice} />}
                          editableValue={row.entry.salePriceInput ?? row.entry.salePrice}
                          onAfterChange={(value) => updateRowEntryValue(row.id, 'salePrice', value)}
                          delta={`${formatDiffPercent(row.product?.price, row.entry.salePrice)} vs actual / Excel $${Number(row.entry.excelSalePrice || 0).toLocaleString('es-AR')}`}
                        />
                      </div>
                      )}
                      </div>
                    </div>

                    {import.meta.env.VITE_SHOW_ASSOCIATED_EXCEL_ROWS === 'true' && associatedRows.length > 0 && (
                      <div className="mt-1.5 space-y-1.5 border-l border-fuchsia-200 pl-2">
                        {associatedRows.map((associatedRow) => {
                          const associatedCandidates = getProductCandidates(associatedRow);
                          const associatedStatus = getRowStatus(associatedRow);
                          const associatedStockDelta = getStockDelta(associatedRow.entry);
                          const associatedStockUnit = getStockUnit(associatedRow.product);
                          const associatedStockAfter = associatedRow.product
                            ? Number(associatedRow.product.stock || 0) + associatedStockDelta
                            : associatedStockDelta;
                          const associatedShowSearch = !associatedRow.product || associatedRow.changeProductMode;
                          const canApplyAssociatedRow = isRowApplicable(associatedRow);

                          return (
                            <div key={associatedRow.id} className="rounded-lg border border-fuchsia-200 bg-fuchsia-50/45 p-1.5">
                              <div className="grid grid-cols-1 2xl:grid-cols-[minmax(420px,1fr)_minmax(640px,max-content)] gap-1.5">
                                <div className="min-w-0">
                                  <div className="flex items-start gap-2">
                                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-fuchsia-200 bg-white text-fuchsia-600">
                                      <Link2 size={12} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <p className="truncate text-[12px] font-black text-slate-900" title={associatedRow.entry.description || associatedRow.entry.code || associatedRow.product?.title}>
                                          {associatedRow.entry.description || associatedRow.entry.code || 'Fila del Excel'}
                                        </p>
                                        <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[8px] font-black uppercase ${statusClass[associatedStatus.tone]}`}>
                                          Asociado
                                        </span>
                                        <span className="shrink-0 rounded-full border border-fuchsia-200 bg-white px-1.5 py-0.5 text-[8px] font-black uppercase text-fuchsia-700">
                                          sin codigo
                                        </span>
                                      </div>
                                      <p className="text-[9px] font-bold text-slate-400 font-mono">Codigo Excel: {associatedRow.entry.code || '--'} / Fila {associatedRow.entry.rowNumber}</p>
                                      <div className="mt-0.5 flex items-center gap-1.5 min-w-0">
                                        <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[8px] font-black uppercase ${
                                          associatedRow.product
                                            ? 'border-blue-200 bg-white text-blue-700'
                                            : 'border-fuchsia-200 bg-white text-fuchsia-700'
                                        }`}>
                                          Rebu
                                        </span>
                                        <p className="min-w-0 truncate text-[10px] font-bold text-slate-500" title={associatedRow.product?.title || 'Sin producto asociado'}>
                                          {associatedRow.product?.title || 'Sin producto asociado'}
                                        </p>
                                        {associatedRow.product && (
                                          <button
                                            type="button"
                                            onClick={() => toggleChangeProductMode(associatedRow.id)}
                                            className="shrink-0 rounded-md border border-sky-200 bg-white px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-sky-700 hover:bg-sky-50"
                                          >
                                            {associatedRow.changeProductMode ? 'Cancelar' : 'Cambiar'}
                                          </button>
                                        )}
                                        {associatedRow.product && (
                                          <button
                                            type="button"
                                            onClick={() => clearProductFromRow(associatedRow.id)}
                                            className="shrink-0 inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-red-600 hover:bg-red-50"
                                            title="Quitar solo el producto enlazado"
                                          >
                                            <X size={10} />
                                            Quitar producto
                                          </button>
                                        )}
                                        {associatedRow.product && (
                                          <button
                                            type="button"
                                            onClick={() => handleApplyRows([associatedRow])}
                                            disabled={!canApplyAssociatedRow || isOperationBusy || !canEditInventory}
                                            className="excel-target-apply shrink-0 inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-white disabled:text-slate-400"
                                            title={canApplyAssociatedRow ? 'Aplicar solo este asociado' : 'Marca Stock, Costo o Venta para aplicar'}
                                          >
                                            <CheckCircle2 size={10} />
                                            Aplicar
                                          </button>
                                        )}
                                      </div>
                                      <div className="mt-0.5 flex flex-wrap gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => removeAssociatedProductRow(associatedRow.id)}
                                          className="rounded-md border border-red-200 bg-white px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-red-600 hover:bg-red-50"
                                        >
                                          Quitar
                                        </button>
                                      </div>

                                      {associatedShowSearch && (
                                        <div className="relative mt-1">
                                          <Search className="absolute left-2 top-1.5 text-slate-400" size={12} />
                                          <input
                                            value={associatedRow.assignmentQuery}
                                            onChange={(event) => setAssignmentQuery(associatedRow.id, event.target.value)}
                                            placeholder="Buscar producto asociado..."
                                            className="w-full rounded-lg border border-fuchsia-200 bg-white pl-7 pr-2 py-1 text-[10px] font-black text-slate-900 outline-none focus:ring-2 focus:ring-fuchsia-200"
                                          />
                                          {associatedCandidates.length > 0 && (
                                            <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
                                              {associatedCandidates.map((product) => (
                                                <button
                                                  key={product.id}
                                                  type="button"
                                                  onClick={() => assignProductToRow(associatedRow.id, product)}
                                                  className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center justify-between gap-3"
                                                >
                                                  <span className="min-w-0">
                                                    <span className="block text-xs font-black text-slate-800 truncate">{product.title}</span>
                                                    <span className="block text-[10px] font-bold text-slate-400">ID {product.id} / Codigo {product.barcode || 'sin codigo'}</span>
                                                  </span>
                                                  <Link2 size={14} className="text-emerald-600 shrink-0" />
                                                </button>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      )}

                                      {associatedRow.errors.length > 0 && (
                                        <div className="mt-1.5 flex flex-wrap gap-1">
                                          {associatedRow.errors.map((error) => (
                                            <span key={error} className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-1.5 py-0.5 text-[9px] font-black text-red-700">
                                              <ShieldAlert size={10} /> {error}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {!associatedRow.product ? (
                                  <div className="flex items-center justify-between gap-2 rounded-lg border border-fuchsia-200 bg-white px-2 py-1.5">
                                    <p className="text-[10px] font-black uppercase tracking-wider text-fuchsia-700">Asignar asociado</p>
                                    <p className="truncate text-[10px] font-bold text-slate-500">No copia codigo de barras.</p>
                                  </div>
                                ) : (
                                  <div className="grid grid-cols-1 md:grid-cols-[repeat(3,minmax(145px,210px))] gap-1.5 md:justify-end">
                                    <CompareField
                                      label="Stock"
                                      tone="blue"
                                      checked={associatedRow.approvals.stock}
                                      disabled={!isFieldEligible(associatedRow, 'stock')}
                                      onToggle={() => toggleApproval(associatedRow.id, 'stock')}
                                      before={`${Number(associatedRow.product.stock || 0).toLocaleString('es-AR')} ${associatedStockUnit}`}
                                      after={`${associatedStockAfter.toLocaleString('es-AR')} ${associatedStockUnit}`}
                                      delta={`+${associatedStockDelta.toLocaleString('es-AR')} ${associatedStockUnit}`}
                                      compact
                                      multiplierControl={
                                        <QuantityMultiplierControl
                                          quantity={associatedRow.entry.quantity}
                                          multiplier={associatedRow.entry.multiplierInput ?? associatedRow.entry.multiplier}
                                          unit={associatedStockUnit}
                                          stockDelta={associatedStockDelta}
                                          compact
                                          onChange={(value) => updateRowEntryValue(associatedRow.id, 'multiplier', value)}
                                        />
                                      }
                                    />
                                    <CompareField
                                      label="Costo"
                                      tone="violet"
                                      checked={associatedRow.approvals.cost}
                                      disabled={!isFieldEligible(associatedRow, 'cost')}
                                      onToggle={() => toggleApproval(associatedRow.id, 'cost')}
                                      before={<FancyPrice amount={associatedRow.product.purchasePrice} />}
                                      after={<FancyPrice amount={associatedRow.entry.cost} />}
                                      editableValue={associatedRow.entry.costInput ?? associatedRow.entry.cost}
                                      onAfterChange={(value) => updateRowEntryValue(associatedRow.id, 'cost', value)}
                                      delta={`${formatDiffPercent(associatedRow.product?.purchasePrice, associatedRow.entry.cost)} vs actual`}
                                      compact
                                    />
                                    <CompareField
                                      label="Venta"
                                      tone="emerald"
                                      checked={associatedRow.approvals.price}
                                      disabled={!isFieldEligible(associatedRow, 'price')}
                                      onToggle={() => toggleApproval(associatedRow.id, 'price')}
                                      before={<FancyPrice amount={associatedRow.product.price} />}
                                      after={<FancyPrice amount={associatedRow.entry.salePrice} />}
                                      editableValue={associatedRow.entry.salePriceInput ?? associatedRow.entry.salePrice}
                                      onAfterChange={(value) => updateRowEntryValue(associatedRow.id, 'salePrice', value)}
                                      delta={`${formatDiffPercent(associatedRow.product?.price, associatedRow.entry.salePrice)} vs actual`}
                                      compact
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </article>
                );
              })}
              {renderedRowGroups.length < visibleRowGroups.length && (
                <div className="flex justify-center bg-slate-50/70 px-4 py-4">
                  <button
                    type="button"
                    onClick={() => setVisibleRowLimit((limit) => limit + EXCEL_IMPORT_VISIBLE_CHUNK)}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-[10px] font-black text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                  >
                    Mostrar {Math.min(EXCEL_IMPORT_VISIBLE_CHUNK, visibleRowGroups.length - renderedRowGroups.length)} mas
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {isCreatePanelOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[2px]">
          <div
            ref={createDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="excel-create-dialog-title"
            aria-busy={isCreatingProducts}
            tabIndex={-1}
            className="flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden overscroll-contain rounded-xl border border-slate-600/70 bg-[#0f1e33] shadow-2xl"
          >
            <header className="flex items-center justify-between gap-4 border-b border-slate-600/60 bg-[#102139] px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-300/30 bg-amber-400/10 text-amber-200">
                    <PackagePlus size={17} />
                  </span>
                  <div>
                    <h3 id="excel-create-dialog-title" className="text-sm font-black text-slate-50">Crear productos nuevos</h3>
                    <p className="text-[10px] font-bold text-slate-300">
                      Completa solo lo necesario antes de agregarlos al inventario.
                    </p>
                  </div>
                </div>
              </div>
              <button
                ref={createDialogCloseRef}
                type="button"
                onClick={() => setIsCreatePanelOpen(false)}
                disabled={isCreatingProducts}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-500/70 bg-slate-900/20 text-slate-300 transition hover:bg-slate-700/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                title="Cerrar"
                aria-label="Cerrar panel de creacion"
              >
                <X size={16} />
              </button>
            </header>

            <div className="flex items-center justify-between gap-3 border-b border-slate-600/60 bg-[#0b1728] px-4 py-2.5">
              <p className="text-[11px] font-bold text-slate-200">
                {createDrafts.length === 1
                  ? 'Vas a crear 1 producto.'
                  : `Vas a crear ${createDrafts.length} productos.`}
              </p>
              <span className={`rounded-md border px-2 py-1 text-[9px] font-black uppercase ${
                validCreateDrafts.length === createDrafts.length
                  ? 'border-emerald-300/25 bg-emerald-400/12 text-emerald-200'
                  : 'border-amber-300/25 bg-amber-400/12 text-amber-200'
              }`}>
                {validCreateDrafts.length === createDrafts.length
                  ? 'Todo completo'
                  : `${createDrafts.length - validCreateDrafts.length} por completar`}
              </span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3 custom-scrollbar">
              <div className="space-y-2">
                {createDrafts.map((draft) => {
                  const errors = getCreateDraftErrors(draft);
                  const needsTitle = !String(draft.title || '').trim();
                  const needsCategory = !String(draft.category || '').trim();
                  const needsCost = !parseExcelMoney(draft.purchasePrice) || parseExcelMoney(draft.purchasePrice) <= 0;
                  const needsPrice = !parseExcelMoney(draft.price) || parseExcelMoney(draft.price) <= 0;
                  const duplicateBlocksCreation = Boolean(draft.duplicate?.blocking);
                  const hasSimilarNameSuggestion = Boolean(draft.duplicate && !duplicateBlocksCreation);
                  const isComplete = errors.length === 0;

                  return (
                    <article
                      key={draft.rowId}
                      className={`rounded-lg border border-slate-600/60 border-l-2 bg-[#102139] px-3 py-3 ${
                        duplicateBlocksCreation || draft.error
                          ? 'border-l-red-400/90'
                          : errors.length > 0 || hasSimilarNameSuggestion
                            ? 'border-l-amber-300/90'
                            : 'border-l-emerald-300/90'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          {needsTitle ? (
                            <CreateField
                              label="Nombre"
                              value={draft.title}
                              onChange={(value) => updateCreateDraft(draft.rowId, 'title', value)}
                              placeholder="Nombre del producto"
                              required
                            />
                          ) : (
                            <div className="flex min-w-0 items-center gap-2">
                              <p className="truncate text-[12px] font-black text-slate-50" title={draft.title}>
                                {draft.title}
                              </p>
                              {isComplete && (
                                hasSimilarNameSuggestion
                                  ? <AlertTriangle size={13} className="shrink-0 text-amber-300" />
                                  : <CheckCircle2 size={13} className="shrink-0 text-emerald-300" />
                              )}
                            </div>
                          )}
                          <p className="mt-0.5 text-[9px] font-bold text-slate-400">
                            Codigo: {draft.barcode || 'Sin codigo de barras'}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-md border px-2 py-1 text-[9px] font-black uppercase ${
                          duplicateBlocksCreation
                            ? 'border-red-300/25 bg-red-400/12 text-red-200'
                            : hasSimilarNameSuggestion
                              ? 'border-amber-300/25 bg-amber-400/12 text-amber-200'
                              : isComplete
                            ? 'border-emerald-300/25 bg-emerald-400/12 text-emerald-200'
                            : 'border-amber-300/25 bg-amber-400/12 text-amber-200'
                        }`}>
                          {duplicateBlocksCreation
                            ? 'Ya existe'
                            : hasSimilarNameSuggestion
                              ? 'Listo con aviso'
                              : isComplete
                                ? 'Listo'
                                : `${errors.length} pendiente${errors.length > 1 ? 's' : ''}`}
                        </span>
                      </div>

                      {draft.duplicate && (
                        <div className={`mt-2 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${
                          duplicateBlocksCreation
                            ? 'border-red-300/30 bg-red-400/10'
                            : 'border-amber-300/30 bg-amber-400/10'
                        }`}>
                          <div className="min-w-0">
                            <p className={`text-[9px] font-black uppercase tracking-wider ${
                              duplicateBlocksCreation ? 'text-red-200' : 'text-amber-200'
                            }`}>{draft.duplicate.reason}</p>
                            <p className={`truncate text-[11px] font-black ${
                              duplicateBlocksCreation ? 'text-red-50' : 'text-amber-50'
                            }`}>{draft.duplicate.product.title}</p>
                            <p className={`text-[9px] font-bold ${
                              duplicateBlocksCreation ? 'text-red-200/80' : 'text-amber-200/80'
                            }`}>
                              {duplicateBlocksCreation
                                ? `Codigo ${draft.duplicate.product.barcode || 'sin codigo'}`
                                : 'Podes vincularlo o crear este producto como uno nuevo.'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => linkDuplicateDraft(draft)}
                            className={`shrink-0 rounded-lg border bg-slate-950/25 px-3 py-2 text-[10px] font-black transition ${
                              duplicateBlocksCreation
                                ? 'border-red-300/40 text-red-100 hover:bg-red-400/15'
                                : 'border-amber-300/40 text-amber-100 hover:bg-amber-400/15'
                            }`}
                          >
                            Vincular existente
                          </button>
                        </div>
                      )}

                      {!duplicateBlocksCreation && (
                        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(220px,1.45fr)_84px_minmax(112px,0.75fr)_minmax(112px,0.75fr)]">
                          <CreateSelect
                            label="Categoria"
                            value={draft.category}
                            onChange={(value) => updateCreateDraft(draft.rowId, 'category', value)}
                            options={availableCategories}
                            placeholder="Elegir categoria..."
                            required={needsCategory}
                          />
                          <CreateValue
                            label="Stock"
                            value="0"
                          />
                          <CreateField
                            label="Costo"
                            value={draft.purchasePrice}
                            onChange={(value) => updateCreateDraft(draft.rowId, 'purchasePrice', value)}
                            required={needsCost}
                            prefix="$"
                          />
                          <CreateField
                            label="Venta"
                            value={draft.price}
                            onChange={(value) => updateCreateDraft(draft.rowId, 'price', value)}
                            required={needsPrice}
                            prefix="$"
                          />
                        </div>
                      )}

                      {(draft.error || (!duplicateBlocksCreation && errors.includes('Precio menor al costo'))) && (
                        <p className="mt-2 rounded-md border border-red-300/25 bg-red-400/10 px-2 py-1.5 text-[10px] font-bold text-red-100">
                          {draft.error || 'El precio de venta no puede ser menor al costo.'}
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>

            <footer className="flex items-center justify-between gap-3 border-t border-slate-600/60 bg-[#102139] px-4 py-3">
              <p className="text-[10px] font-bold text-slate-300">
                Se crean con stock 0. La cantidad del Excel se suma cuando apliques el lote.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreatePanelOpen(false)}
                  disabled={isCreatingProducts}
                  className="rounded-lg border border-slate-500/70 bg-slate-900/20 px-4 py-2 text-[11px] font-black text-slate-200 transition hover:bg-slate-700/50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Cancelar
                </button>
                <AsyncActionButton
                  onAction={handleCreateProducts}
                  pending={isCreatingProducts}
                  disabled={validCreateDrafts.length === 0 || isOperationBusy || !canCreateInventory}
                  loadingLabel="Creando..."
                  className="inline-flex items-center gap-2 rounded-lg border border-emerald-300/25 bg-emerald-500/80 px-4 py-2 text-[11px] font-black text-white transition hover:bg-emerald-400 disabled:border-slate-600/40 disabled:bg-slate-700/45 disabled:text-slate-400"
                >
                  <PackagePlus size={15} />
                  {validCreateDrafts.length === 0
                    ? 'Completa los datos'
                    : validCreateDrafts.length === 1
                      ? 'Crear producto'
                      : `Crear ${validCreateDrafts.length} productos`}
                </AsyncActionButton>
              </div>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateValue({ label, value, className = '' }) {
  return (
    <label className={className}>
      <span className="mb-1 block text-[9px] font-black uppercase tracking-wider text-slate-300">{label}</span>
      <span className="flex h-9 w-full items-center rounded-lg border border-slate-500/45 bg-slate-950/20 px-2">
        <span className="truncate text-[11px] font-black text-slate-100">{value}</span>
      </span>
    </label>
  );
}

function CreateSelect({ label, value, onChange, options = [], placeholder = '', required = false }) {
  return (
    <label>
      <span className={`mb-1 block text-[9px] font-black uppercase tracking-wider ${required ? 'text-amber-200' : 'text-slate-300'}`}>
        {label}{required ? ' requerida' : ''}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`h-9 w-full rounded-lg border px-2 text-[11px] font-black text-slate-50 outline-none transition [&>option]:bg-[#0f1e33] [&>option]:text-slate-50 ${
          required
            ? 'border-amber-300/35 bg-amber-400/10 focus:border-amber-200 focus:ring-2 focus:ring-amber-300/15'
            : 'border-slate-500/45 bg-slate-950/20 focus:border-sky-300/70 focus:ring-2 focus:ring-sky-300/15'
        }`}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function CreateField({ label, value, onChange, type = 'text', placeholder = '', required = false, prefix = '' }) {
  return (
    <label>
      <span className={`mb-1 block text-[9px] font-black uppercase tracking-wider ${required ? 'text-amber-200' : 'text-slate-300'}`}>
        {label}{required ? ' requerido' : ''}
      </span>
      <span className={`flex h-9 w-full items-center rounded-lg border px-2 ${
        required
          ? 'border-amber-300/35 bg-amber-400/10 focus-within:border-amber-200 focus-within:ring-2 focus-within:ring-amber-300/15'
          : 'border-slate-500/45 bg-slate-950/20 focus-within:border-sky-300/70 focus-within:ring-2 focus-within:ring-sky-300/15'
      }`}>
        {prefix && <span className="mr-1 text-[10px] font-black text-slate-400">{prefix}</span>}
        <input
          type={type}
          inputMode={prefix ? 'decimal' : undefined}
          min={type === 'number' ? 0 : undefined}
          step={type === 'number' ? 'any' : undefined}
          value={value ?? ''}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-[11px] font-black tabular-nums text-slate-50 outline-none placeholder:text-slate-500"
        />
      </span>
    </label>
  );
}

function ProductRowActions({ changeMode, onChange, onRemove }) {
  return (
    <details className="excel-row-actions relative shrink-0">
      <summary
        className="flex h-6 w-6 cursor-pointer list-none items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
        title="Más acciones"
      >
        <MoreVertical size={14} />
      </summary>
      <div className="absolute right-0 top-full z-40 mt-1 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white p-1 shadow-xl">
        <button
          type="button"
          onClick={(event) => {
            event.currentTarget.closest('details')?.removeAttribute('open');
            onChange();
          }}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[10px] font-black text-slate-700 hover:bg-slate-50"
        >
          <Search size={12} />
          {changeMode ? 'Cancelar cambio' : 'Cambiar producto'}
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.currentTarget.closest('details')?.removeAttribute('open');
            onRemove();
          }}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[10px] font-black text-red-600 hover:bg-red-50"
        >
          <X size={12} />
          Quitar vínculo
        </button>
      </div>
    </details>
  );
}

function SplitQuantityControl({ value, onChange, warning = false }) {
  return (
    <label
      className={`excel-split-quantity ${warning ? 'excel-split-quantity-warning' : ''}`}
      onClick={(event) => event.stopPropagation()}
      title="Cantidad de compras del Excel para este producto Rebu"
    >
      <span>Compra</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function ReviewTargetButton({ active, label, title, subtitle, tone = 'slate', onClick, onRemove, actionSlot = null, quantitySlot = null }) {
  const toneClass = {
    slate: active ? 'text-slate-950' : 'text-slate-600 hover:text-slate-900',
    blue: active ? 'text-blue-800' : 'text-slate-600 hover:text-blue-700',
    fuchsia: active ? 'text-fuchsia-800' : 'text-slate-600 hover:text-fuchsia-700',
    teal: active ? 'text-teal-800' : 'text-slate-600 hover:text-teal-700',
    amber: active ? 'text-amber-800' : 'text-slate-600 hover:text-amber-700',
  }[tone] || 'text-slate-600 hover:text-slate-900';
  const markerClass = {
    slate: active ? 'bg-slate-700' : 'bg-slate-300',
    blue: active ? 'bg-blue-500' : 'bg-slate-300',
    fuchsia: active ? 'bg-fuchsia-500' : 'bg-slate-300',
    teal: active ? 'bg-teal-500' : 'bg-slate-300',
    amber: active ? 'bg-amber-500' : 'bg-slate-300',
  }[tone] || 'bg-slate-300';
  const gridClass = quantitySlot
    ? 'grid-cols-[3px_104px_minmax(0,1fr)_88px_auto]'
    : 'grid-cols-[3px_104px_minmax(0,1fr)_auto]';

  return (
    <div className={`excel-target-row excel-target-${tone} ${active ? 'excel-target-active' : ''} grid ${gridClass} items-center gap-2 px-1 py-1.5 text-left transition-colors ${toneClass}`}>
      <span className={`h-7 w-1 rounded-full ${markerClass}`} />
      <button type="button" onClick={onClick} className="contents text-left">
        <span className="px-1 text-[9px] font-black uppercase tracking-wide text-slate-400">
          {label}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[12px] font-black">{title}</span>
          <span className="block truncate text-[10px] font-bold text-slate-400">{subtitle}</span>
        </span>
      </button>
      {quantitySlot && <span className="excel-target-quantity-cell">{quantitySlot}</span>}
      {actionSlot || (onRemove ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          className="h-6 w-6 rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 flex items-center justify-center transition-colors"
          title="Quitar producto asociado"
        >
          <X size={12} />
        </button>
      ) : (
        <span aria-hidden="true" className="h-6 w-0" />
      ))}
    </div>
  );
}

function ArticleBreakdownPanel({ sourceRow, productRows, onQuantityChange, onSelectTarget, onRemoveAssociated }) {
  const { originalQuantity, assignedQuantity, remainingQuantity } = getQuantityBalance(sourceRow, productRows);
  const balanceMeta = getQuantityBalanceMeta(remainingQuantity);

  return (
    <div className="excel-article-panel border-l border-slate-200 pl-4 pt-1">
      <div className="excel-panel-titlebar flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">Resumen del Excel</p>
          <p className="truncate text-[10px] font-bold text-slate-400">Cantidad y valores recibidos para este articulo.</p>
        </div>
        <span className={`excel-balance-pill excel-balance-${balanceMeta.tone}`}>
          {balanceMeta.label}
        </span>
      </div>

      <div className="excel-summary-strip mt-2 flex flex-wrap items-center gap-x-6 gap-y-1 border-y border-slate-200 py-1.5">
        <InlineMetric label="Cantidad" value={originalQuantity.toLocaleString('es-AR')} />
        <InlineMetric label="Asignado" value={assignedQuantity.toLocaleString('es-AR')} tone="blue" />
        <InlineMetric label="Costo base Excel" value={<FancyPrice amount={sourceRow.entry.lotCost || sourceRow.entry.baseCost} />} tone="violet" />
        <InlineMetric label="Venta Excel" value={<FancyPrice amount={sourceRow.entry.lotSalePrice || sourceRow.entry.excelSalePrice} />} tone="green" />
      </div>

      <div className="excel-product-split mt-1 divide-y divide-slate-200">
        {productRows.map((row, index) => {
          const unit = getStockUnit(row.product);
          const stockDelta = getStockDelta(row.entry);
          return (
            <div key={row.id} className="grid grid-cols-[1fr_78px_auto_auto] items-center gap-2 px-1 py-1.5">
              <button type="button" onClick={() => onSelectTarget(row.id)} className="min-w-0 text-left">
                <span className="block truncate text-[11px] font-black text-slate-800">
                  {row.isAssociated ? `Producto ${index + 1}: ` : ''}
                  {row.product?.title || (row.isAssociated ? 'Producto asociado' : 'Producto Rebu')}
                </span>
                <span className="block truncate text-[10px] font-bold text-slate-400">
                  {Number(row.entry.quantity || 0).toLocaleString('es-AR')} x {Number(row.entry.multiplier || 0).toLocaleString('es-AR')} = {stockDelta.toLocaleString('es-AR')} {unit}
                </span>
              </button>
              <input
                type="text"
                inputMode="decimal"
                value={row.entry.quantityInput ?? row.entry.quantity ?? ''}
                onChange={(event) => onQuantityChange(row.id, event.target.value)}
                className="no-spinners rounded-md border border-slate-200 bg-white px-2 py-1 text-right text-[11px] font-black tabular-nums text-slate-900 outline-none focus:ring-2 focus:ring-blue-200"
                title="Cantidad del Excel para este producto"
              />
              <span className="text-[9px] font-black uppercase text-slate-400">compra</span>
              {row.isAssociated ? (
                <button
                  type="button"
                  onClick={() => onRemoveAssociated(row.id)}
                  className="h-7 w-7 rounded-md border border-red-200 bg-white text-red-500 hover:bg-red-50 flex items-center justify-center"
                  title="Quitar producto asociado"
                >
                  <X size={12} />
                </button>
              ) : (
                <span aria-hidden="true" className="h-7 w-0" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CompactReviewSummary({
  sourceRow,
  productRows,
  status,
  mode = 'product',
  activeRow = null,
  marginPercent = DEFAULT_GROSS_MARGIN_PERCENT,
  onToggleApproval,
  onUpdateEntryValue,
}) {
  const rowsWithProduct = productRows.filter((row) => row.product);
  const missingCount = productRows.length - rowsWithProduct.length;
  const editable = Boolean(activeRow?.product && onToggleApproval && onUpdateEntryValue);
  const rowsForSummary = activeRow?.product ? [activeRow] : rowsWithProduct;
  const summaries = rowsForSummary.flatMap((row) => buildCompactChangeSummaries(row));
  const approvedCount = summaries.filter((item) => item.checked).length;
  const { originalQuantity, assignedQuantity, remainingQuantity } = getQuantityBalance(sourceRow, productRows);
  const balanceMeta = getQuantityBalanceMeta(remainingQuantity);
  const productTitle = activeRow?.product?.title || rowsWithProduct[0]?.product?.title || 'Producto Rebu';
  const extraProducts = activeRow?.product ? 0 : Math.max(rowsWithProduct.length - 1, 0);

  if (mode === 'article') {
    return (
      <div className="excel-compact-panel excel-article-quick-panel border-l border-slate-200 pl-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Articulo del Excel</p>
            <p className="truncate text-[12px] font-black text-slate-900" title={sourceRow.entry.description || sourceRow.entry.code}>
              {sourceRow.entry.description || 'Fila del Excel'}
            </p>
            <p className="truncate text-[10px] font-bold text-slate-500">
              Codigo {sourceRow.entry.code || 'sin codigo'} / Fila {sourceRow.entry.rowNumber}
            </p>
          </div>
          <span className={`excel-balance-pill excel-balance-${balanceMeta.tone}`}>
            {balanceMeta.label}
          </span>
        </div>
        <div className="excel-article-quick-grid mt-2 grid grid-cols-2 gap-1.5 lg:grid-cols-4">
          <InlineMetric label="Cantidad" value={originalQuantity.toLocaleString('es-AR')} />
          <InlineMetric label="Asignado" value={assignedQuantity.toLocaleString('es-AR')} tone="blue" />
          <InlineMetric label="Costo base Excel" value={<FancyPrice amount={sourceRow.entry.lotCost || sourceRow.entry.baseCost} />} tone="violet" />
          <InlineMetric label="Venta Excel" value={<FancyPrice amount={sourceRow.entry.lotSalePrice || sourceRow.entry.excelSalePrice} />} tone="green" />
        </div>
        <div className="mt-2">
          <PricingFormulaTrace
            baseCost={sourceRow.entry.baseCost}
            realCost={sourceRow.entry.cost}
            salePrice={sourceRow.entry.salePrice}
            marginPercent={marginPercent}
            excelSalePrice={sourceRow.entry.excelSalePrice}
          />
        </div>
      </div>
    );
  }

  if (rowsWithProduct.length === 0) {
    return (
      <div className="excel-compact-panel excel-compact-panel-empty border-l border-slate-200 pl-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Producto Rebu</p>
            <p className="truncate text-[12px] font-black text-slate-900">Falta elegir producto</p>
            <p className="truncate text-[10px] font-bold text-slate-500">Toca la fila para buscar o crear el articulo.</p>
          </div>
          <span className={`shrink-0 rounded-md border px-2 py-1 text-[9px] font-black uppercase ${statusClass[status.tone]}`}>
            {status.label}
          </span>
        </div>
        <div className="mt-2">
          <PricingFormulaTrace
            baseCost={sourceRow.entry.baseCost}
            realCost={sourceRow.entry.cost}
            salePrice={sourceRow.entry.salePrice}
            marginPercent={marginPercent}
            excelSalePrice={sourceRow.entry.excelSalePrice}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="excel-compact-panel border-l border-slate-200 pl-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Cambios del producto Rebu</p>
          <p className="truncate text-[12px] font-black text-slate-900" title={productTitle}>
            {productTitle}{extraProducts > 0 ? ` + ${extraProducts} mas` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="rounded-md border border-slate-200 bg-white/70 px-2 py-0.5 text-[9px] font-black uppercase text-slate-500">
            {approvedCount}/{summaries.length || 3} marcados
          </span>
          <span className={`excel-balance-pill excel-balance-${balanceMeta.tone}`}>
            {balanceMeta.label}
          </span>
        </div>
      </div>

      {summaries.length > 0 ? (
        <div className="excel-compact-changes mt-2 flex flex-wrap gap-1.5">
          {summaries.map((item) => (
            <CompactChangeItem
              key={`${item.rowId}-${item.key}`}
              item={item}
              editable={editable}
              onToggle={() => onToggleApproval?.(item.rowId, item.key)}
              onUpdate={(field, value) => onUpdateEntryValue?.(item.rowId, field, value)}
            />
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[10px] font-bold text-slate-500">Sin diferencias marcables para este producto.</p>
      )}

      {activeRow ? (
        <div className="mt-2">
          <PricingFormulaTrace
            baseCost={activeRow.entry.baseCost}
            realCost={activeRow.entry.cost}
            salePrice={activeRow.entry.salePrice}
            marginPercent={marginPercent}
            excelSalePrice={activeRow.entry.excelSalePrice}
          />
        </div>
      ) : null}

      {activeRow?.errors?.length > 0 && (
        <CompactErrorHelp errors={activeRow.errors} />
      )}

      {activeRow?.reviewInvalidated && (
        <p role="status" className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] font-bold text-amber-800">
          Este producto cambio desde la ultima revision. Volve a marcar los campos que quieras aplicar.
        </p>
      )}

      {missingCount > 0 && (
        <p className="mt-1.5 text-[9px] font-black uppercase tracking-wide text-amber-600">
          {missingCount} producto{missingCount > 1 ? 's' : ''} sin asignar
        </p>
      )}
    </div>
  );
}

function buildCompactChangeSummaries(row) {
  if (!row.product) return [];
  const summaries = [];
  const unit = getStockUnit(row.product);
  const stockDelta = getStockDelta(row.entry);
  const hasError = (error) => row.errors.includes(error);
  const hasQuantityError = hasError('Cantidad vacia o cero');
  const hasMultiplierError = hasError('Multiplicador invalido');
  const hasCostError = hasError('Costo vacio o cero');
  const hasPriceError = hasError('Venta vacia o cero');
  const hasProfitError = hasError('Venta menor al costo');
  const stockEligible = isFieldEligible(row, 'stock');
  const costEligible = isFieldEligible(row, 'cost');
  const priceEligible = isFieldEligible(row, 'price');
  const showStock = stockEligible || hasQuantityError || hasMultiplierError || Number(row.entry.originalQuantity || row.entry.quantity || 0) > 0;
  const showCost = costEligible || hasCostError || hasProfitError || row.entry.costEdited || Number(row.entry.originalCost ?? row.entry.cost ?? 0) > 0;
  const showPrice = priceEligible || hasPriceError || hasProfitError || row.entry.salePriceEdited || Number(row.entry.originalSalePrice ?? row.entry.salePrice ?? 0) > 0;

  if (showStock) {
    summaries.push({
      rowId: row.id,
      row,
      key: 'stock',
      editField: 'multiplier',
      label: 'Stock',
      tone: 'blue',
      checked: Boolean(row.approvals.stock),
      eligible: stockEligible,
      invalid: hasQuantityError || hasMultiplierError,
      quantity: row.entry.quantity,
      multiplier: row.entry.multiplierInput ?? row.entry.multiplier,
      unit,
      stockDelta,
      before: `${Number(row.product.stock || 0).toLocaleString('es-AR')} ${unit}`,
      after: `${(Number(row.product.stock || 0) + stockDelta).toLocaleString('es-AR')} ${unit}`,
      delta: stockEligible
        ? stockDelta === 0
          ? `0 ${unit} (sin sumar)`
          : `+${stockDelta.toLocaleString('es-AR')} ${unit}`
        : 'Sin cambio',
    });
  }

  if (showCost) {
    summaries.push({
      rowId: row.id,
      row,
      key: 'cost',
      editField: 'cost',
      label: 'Costo',
      tone: 'violet',
      checked: Boolean(row.approvals.cost),
      eligible: costEligible,
      invalid: hasCostError || hasProfitError,
      editValue: row.entry.costInput ?? row.entry.cost,
      before: `$${Number(row.product.purchasePrice || 0).toLocaleString('es-AR')}`,
      after: `$${Number(row.entry.cost || 0).toLocaleString('es-AR')}`,
      delta: costEligible ? formatDiffPercent(row.product?.purchasePrice, row.entry.cost) : 'Sin cambio',
    });
  }

  if (showPrice) {
    summaries.push({
      rowId: row.id,
      row,
      key: 'price',
      editField: 'salePrice',
      label: 'Venta',
      tone: 'emerald',
      checked: Boolean(row.approvals.price),
      eligible: priceEligible,
      invalid: hasPriceError || hasProfitError,
      editValue: row.entry.salePriceInput ?? row.entry.salePrice,
      before: `$${Number(row.product.price || 0).toLocaleString('es-AR')}`,
      after: `$${Number(row.entry.salePrice || 0).toLocaleString('es-AR')}`,
      delta: priceEligible ? formatDiffPercent(row.product?.price, row.entry.salePrice) : 'Sin cambio',
    });
  }

  return summaries;
}

function RowIssueNotice({ errors }) {
  const hints = getRowErrorHints(errors);
  const firstHint = hints[0];

  return (
    <div className="excel-row-issue mt-2 rounded-lg border border-amber-300/70 bg-amber-50/70 px-2.5 py-2">
      <div className="flex items-start gap-2">
        <ShieldAlert size={13} className="mt-0.5 shrink-0 text-amber-600" />
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-wide text-amber-800">
            {firstHint?.title || 'Datos a revisar'}
          </p>
          <p className="mt-0.5 text-[10px] font-bold leading-snug text-amber-900/80">
            {firstHint?.detail || 'Corregi los datos marcados y vuelve a aplicar.'}
          </p>
          {hints.length > 1 && (
            <p className="mt-1 text-[9px] font-black uppercase tracking-wide text-amber-700">
              Tambien revisar: {hints.slice(1).map((hint) => hint.title).join(', ')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function CompactErrorHelp({ errors }) {
  const hints = getRowErrorHints(errors);
  if (hints.length === 0) return null;

  return (
    <div className="excel-compact-error-help mt-2 rounded-lg border border-amber-300/70 bg-amber-50/70 px-2.5 py-2">
      <div className="flex items-start gap-2">
        <ShieldAlert size={13} className="mt-0.5 shrink-0 text-amber-600" />
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-wide text-amber-800">
            {hints[0].title}
          </p>
          <p className="mt-0.5 text-[10px] font-bold leading-snug text-amber-900/80">
            {hints[0].detail}
          </p>
        </div>
      </div>
    </div>
  );
}

function CompactChangeItem({ item, editable, onToggle, onUpdate }) {
  const canToggle = Boolean(editable && onToggle && item.eligible !== false && !item.invalid);
  const confirmLabel = item.invalid
    ? 'Revisar'
    : item.eligible === false
      ? 'Sin cambio'
      : item.checked
        ? 'Confirmado'
        : 'Confirmar';

  const handleToggle = () => {
    if (!canToggle) return;
    onToggle();
  };

  const handleInputClick = (event) => {
    event.stopPropagation();
  };

  const handleInputKeyDown = (event) => {
    event.stopPropagation();
  };

  const renderFinalValue = () => {
    if (!editable) {
      return <span className="excel-compact-change-value">{item.after}</span>;
    }

    if (item.key === 'stock') {
      return (
        <span className="excel-compact-stock-editor">
          <span className="text-[8px] font-black text-sky-500">{Number(item.quantity || 0).toLocaleString('es-AR')}x</span>
          <input
            type="text"
            inputMode="decimal"
            value={item.multiplier ?? ''}
            onClick={handleInputClick}
            onKeyDown={handleInputKeyDown}
            onChange={(event) => onUpdate(item.editField, event.target.value)}
            className="excel-compact-input excel-compact-input-stock"
            title="Editar equivalencia de stock"
          />
          <span className="text-[8px] font-black text-sky-500">= {Number(item.stockDelta || 0).toLocaleString('es-AR')} {item.unit}</span>
        </span>
      );
    }

    return (
      <span className="excel-compact-price-editor">
        <span className="text-[9px] font-black text-slate-400">$</span>
        <input
          type="text"
          inputMode="decimal"
          value={item.editValue ?? ''}
          onClick={handleInputClick}
          onKeyDown={handleInputKeyDown}
          onChange={(event) => onUpdate(item.editField, event.target.value)}
          className="excel-compact-input"
          title={`Editar ${item.label}`}
        />
      </span>
    );
  };

  return (
    <span
      title={canToggle ? `${item.checked ? 'Quitar confirmacion de' : 'Confirmar'} ${item.label}` : `${item.label}: ${confirmLabel}`}
      className={`excel-compact-change excel-compact-change-${item.tone} ${item.checked ? 'excel-compact-change-on' : ''} ${editable ? 'excel-compact-change-editable' : ''} ${canToggle ? 'excel-compact-change-toggleable' : ''} ${item.invalid ? 'excel-compact-change-invalid' : ''} ${item.eligible === false ? 'excel-compact-change-noop' : ''}`}
    >
      <span className="excel-compact-change-head">
        <span className="excel-compact-mark">
          <span className="excel-compact-change-label">{item.label}</span>
          {editable && (
            <button
              type="button"
              disabled={!canToggle}
              aria-pressed={canToggle ? item.checked : undefined}
              onClick={(event) => {
                event.stopPropagation();
                handleToggle();
              }}
              className="excel-compact-confirm-badge"
            >
              {confirmLabel}
            </button>
          )}
        </span>
        <span className="excel-compact-change-delta">{item.delta}</span>
      </span>
      <span className="excel-compact-change-flow">
        <span className="excel-compact-change-pair">
          <span className="excel-compact-change-meta">Actual</span>
          <span className="excel-compact-change-value">{item.before}</span>
        </span>
        <ArrowRight size={10} />
        <span className="excel-compact-change-pair excel-compact-change-final">
          <span className="excel-compact-change-meta">Final</span>
          {renderFinalValue()}
        </span>
      </span>
    </span>
  );
}

function InlineMetric({ label, value, tone = 'slate' }) {
  const valueClass = {
    blue: 'text-sky-700',
    violet: 'text-violet-700',
    green: 'text-emerald-700',
    slate: 'text-slate-900',
  }[tone] || 'text-slate-900';

  return (
    <div className="min-w-[72px]">
      <p className="text-[8px] font-black uppercase tracking-wider text-slate-400">{label}</p>
      <div className={`mt-0.5 text-[12px] font-black tabular-nums ${valueClass}`}>{value}</div>
    </div>
  );
}

function ImportChip({ label, value, tone = 'default' }) {
  const toneClass = {
    stock: {
      shell: 'border-sky-200 bg-sky-50',
      label: 'text-sky-600',
      value: 'text-sky-800',
    },
    cost: {
      shell: 'border-violet-200 bg-violet-50',
      label: 'text-violet-600',
      value: 'text-violet-800',
    },
    price: {
      shell: 'border-emerald-200 bg-emerald-50',
      label: 'text-emerald-600',
      value: 'text-emerald-800',
    },
    default: {
      shell: 'border-slate-200 bg-white/70',
      label: 'text-slate-500',
      value: 'text-slate-900',
    },
  }[tone] || {
    shell: 'border-slate-200 bg-white/70',
    label: 'text-slate-500',
    value: 'text-slate-900',
  };

  return (
    <div className={`rounded-lg border px-2 py-1.5 ${toneClass.shell}`}>
      <p className={`text-[9px] font-black uppercase tracking-wider ${toneClass.label}`}>{label}</p>
      <div className={`mt-0.5 truncate text-[12px] font-black tabular-nums ${toneClass.value}`}>{value}</div>
    </div>
  );
}

function QuantityMultiplierControl({ quantity, multiplier, unit, stockDelta, onChange, compact = false }) {
  if (compact) {
    return (
      <div className="excel-multiplier-compact flex min-w-0 items-center gap-2">
        <span className="shrink-0 text-[9px] font-black uppercase tracking-wide text-sky-600">Equiv.</span>
        <span className="min-w-0 truncate text-[9px] font-bold text-sky-700">
          {Number(quantity || 0).toLocaleString('es-AR')} x
        </span>
        <input
          type="text"
          inputMode="decimal"
          min="0"
          value={multiplier ?? ''}
          onChange={(event) => onChange(event.target.value)}
          className="w-16 rounded-md border border-sky-200 bg-white px-1.5 py-0.5 text-right text-[10px] font-black tabular-nums text-sky-900 outline-none focus:ring-2 focus:ring-sky-200"
        />
        <span className="shrink-0 text-[9px] font-bold text-sky-700">
          = {Number(stockDelta || 0).toLocaleString('es-AR')} {unit}
        </span>
      </div>
    );
  }

  return (
    <div className="mt-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1">
      <div className="flex items-center justify-between gap-1.5">
        <span className="text-[8px] font-black uppercase tracking-wider text-sky-600">Equiv.</span>
        <span className="text-[10px] font-black text-sky-800">
          {Number(quantity || 0).toLocaleString('es-AR')} x {Number(multiplier || 0).toLocaleString('es-AR')} = {Number(stockDelta || 0).toLocaleString('es-AR')} {unit}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        <span className="text-[9px] font-bold text-sky-600">
          Cada 1 un. de compra equivale a
        </span>
        <input
          type="text"
          inputMode="decimal"
          min="0"
          value={multiplier ?? ''}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 rounded-md border border-sky-200 bg-white px-1.5 py-0.5 text-right text-[11px] font-black tabular-nums text-sky-900 outline-none focus:ring-2 focus:ring-sky-200"
        />
        <span className="text-[9px] font-black uppercase text-sky-600">{unit}</span>
      </div>
    </div>
  );
}

function CompareField({ label, before, after, delta, checked, disabled, onToggle, tone, editableValue, onAfterChange, multiplierControl }) {
  const toneClass = {
    blue: checked ? 'excel-compare-blue' : '',
    amber: checked ? 'excel-compare-violet' : '',
    violet: checked ? 'excel-compare-violet' : '',
    emerald: checked ? 'excel-compare-emerald' : '',
  }[tone];

  return (
    <div className={`excel-compare-row min-w-0 px-1.5 py-2 transition-colors ${toneClass}`}>
      <div className="grid grid-cols-[74px_minmax(92px,0.7fr)_18px_minmax(108px,0.8fr)_70px] items-center gap-2">
        <span className={`excel-compare-label excel-compare-label-${tone}`}>{label}</span>
        <div className="excel-value-box min-w-0">
          <p className="text-[8px] font-black uppercase tracking-wider text-slate-400">Actual</p>
          <div className="truncate text-[11px] font-black text-slate-600">{before}</div>
        </div>
        <ArrowRight size={12} className="text-slate-300" />
        <div className="excel-value-box excel-value-final min-w-0">
          <p className="text-[8px] font-black uppercase tracking-wider text-slate-400">Final</p>
          {onAfterChange ? (
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-black text-slate-400">$</span>
              <input
                type="text"
                inputMode={label === 'Venta' ? 'numeric' : 'decimal'}
                value={editableValue ?? ''}
                onChange={(event) => onAfterChange(event.target.value)}
                onBlur={(event) => {
                  if (label === 'Venta') {
                    onAfterChange(String(normalizeFinalSalePrice(parseExcelMoney(event.target.value))));
                  }
                }}
                className="no-spinners min-w-0 flex-1 bg-transparent text-right text-[11px] font-black tabular-nums text-slate-900 outline-none"
                title={`Editar ${label} final`}
              />
            </div>
          ) : (
            <div className="truncate text-right text-[11px] font-black text-slate-900">{after}</div>
          )}
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={onToggle}
          className={`min-w-[58px] rounded-md border px-1.5 py-1 text-[8px] font-black uppercase transition-colors ${
            checked
              ? 'border-emerald-500 bg-emerald-600 text-white'
              : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-white'
          } disabled:opacity-40 disabled:hover:bg-slate-50`}
          title={`Aplicar ${label}`}
        >
          {checked ? 'Aplicar' : disabled ? 'Sin cambio' : 'Marcar'}
        </button>
      </div>
      <div className="mt-1 flex min-w-0 items-center justify-between gap-3 pl-[82px]">
        <p className="min-w-0 truncate text-[9px] font-bold text-slate-400">{delta}</p>
        {multiplierControl}
      </div>
    </div>
  );
}
