import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Eraser,
  FileSpreadsheet,
  Link2,
  Loader2,
  Package,
  Search,
  ShieldAlert,
  Upload,
  X,
} from 'lucide-react';
import AsyncActionButton from './AsyncActionButton';
import { FancyPrice } from './FancyPrice';

const REQUIRED_COLUMNS = ['codigo', 'descripcion', 'cantidad', 'precio', 'descuento', 'costo', 'venta'];
const FIELD_KEYS = ['stock', 'cost', 'price'];

const normalizeHeader = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

const normalizeCode = (value) => String(value ?? '').trim();

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

const ceilMoney = (value) => Math.ceil(Number(value || 0));

const divideLotValue = (value, multiplier) => {
  const safeMultiplier = Number(multiplier || 0);
  if (!safeMultiplier || safeMultiplier <= 0) return 0;
  return ceilMoney(Number(value || 0) / safeMultiplier);
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

const buildImportEntry = (row, rowNumber) => {
  const code = normalizeCode(getFirstValue(row, 'Codigo'));
  const description = String(getFirstValue(row, 'Descripcion') ?? '').trim();
  const quantity = parseNumber(getFirstValue(row, 'Cantidad'));
  const providerPrice = parseNumber(getFirstValue(row, 'Precio'));
  const discount = parseNumber(getFirstValue(row, 'Descuento'));
  const lotCost = parseNumber(getFirstValue(row, 'Costo'));
  const lotSalePrice = parseNumber(getFirstValue(row, 'Venta'));
  const multiplier = 1;
  const cost = divideLotValue(lotCost, multiplier);
  const salePrice = divideLotValue(lotSalePrice, multiplier);

  return {
    rowNumber,
    code,
    description,
    quantity,
    originalQuantity: quantity,
    quantityInput: quantity ? String(quantity) : '',
    multiplier,
    multiplierInput: String(multiplier),
    providerPrice,
    discount,
    lotCost,
    lotSalePrice,
    cost,
    costInput: cost ? String(cost) : '',
    salePrice,
    salePriceInput: salePrice ? String(salePrice) : '',
  };
};

const areDuplicatePricesEqual = (entries) => {
  if (!entries || entries.length <= 1) return true;
  const first = entries[0];
  return entries.every((entry) => entry.cost === first.cost && entry.salePrice === first.salePrice);
};

const mergeDuplicateEntries = (entries) => ({
  ...entries[0],
  rowNumber: entries.map((entry) => entry.rowNumber).join(', '),
  quantity: entries.reduce((sum, entry) => sum + Number(entry.quantity || 0), 0),
  lotCost: entries.reduce((sum, entry) => sum + Number(entry.lotCost || entry.cost || 0), 0),
  lotSalePrice: entries.reduce((sum, entry) => sum + Number(entry.lotSalePrice || entry.salePrice || 0), 0),
  cost: divideLotValue(
    entries.reduce((sum, entry) => sum + Number(entry.lotCost || entry.cost || 0), 0),
    entries[0]?.multiplier || 1,
  ),
  salePrice: divideLotValue(
    entries.reduce((sum, entry) => sum + Number(entry.lotSalePrice || entry.salePrice || 0), 0),
    entries[0]?.multiplier || 1,
  ),
  costInput: String(divideLotValue(
    entries.reduce((sum, entry) => sum + Number(entry.lotCost || entry.cost || 0), 0),
    entries[0]?.multiplier || 1,
  ) || ''),
  salePriceInput: String(divideLotValue(
    entries.reduce((sum, entry) => sum + Number(entry.lotSalePrice || entry.salePrice || 0), 0),
    entries[0]?.multiplier || 1,
  ) || ''),
  duplicateMerged: true,
});

const getEntryInputKey = (field) => {
  if (field === 'salePrice') return 'salePriceInput';
  if (field === 'cost') return 'costInput';
  if (field === 'multiplier') return 'multiplierInput';
  return `${field}Input`;
};

const getRowBaseErrors = (entry, _product) => {
  const errors = [];
  if (!entry.code) errors.push('Sin codigo');
  if (!entry.quantity || entry.quantity <= 0) errors.push('Cantidad vacia o cero');
  if (!entry.multiplier || entry.multiplier <= 0) errors.push('Multiplicador invalido');
  if (!entry.cost || entry.cost <= 0) errors.push('Costo vacio o cero');
  if (!entry.salePrice || entry.salePrice <= 0) errors.push('Venta vacia o cero');
  if (entry.salePrice > 0 && entry.cost > 0 && entry.salePrice < entry.cost) {
    errors.push('Venta menor al costo');
  }
  return errors;
};

const getStockUnit = (product) => (product?.product_type === 'weight' ? 'g' : 'u.');
const getStockDelta = (entry) => Number(entry.quantity || 0) * Number(entry.multiplier || 1);

const buildReviewRow = ({ entry, product = null, duplicateOptions = null, duplicateResolved = false }, index) => {
  const errors = getRowBaseErrors(entry, product);
  if (duplicateOptions && !duplicateResolved) errors.push('Duplicado sin resolver');
  const hasProduct = Boolean(product);
  const hasChanges = hasProduct
    ? Number(product.stock || 0) + getStockDelta(entry) !== Number(product.stock || 0) ||
      Number(product.purchasePrice || 0) !== Number(entry.cost || 0) ||
      Number(product.price || 0) !== Number(entry.salePrice || 0)
    : false;

  return {
    id: `${entry.code || 'sin-codigo'}-${index}-${Date.now()}`,
    entry,
    product,
    manualAssigned: false,
    isAssociated: false,
    sourceRowId: null,
    duplicateOptions,
    duplicateResolved,
    assignmentQuery: '',
    changeProductMode: false,
    approvals: { stock: false, cost: false, price: false },
    applied: false,
    errors,
    hasChanges,
  };
};

const getRowStatus = (row) => {
  if (!row.product) return { label: 'Sin asignar', tone: 'amber' };
  if (row.errors.length > 0) return { label: 'Bloqueado', tone: 'red' };
  const selectedCount = FIELD_KEYS.filter((field) => row.approvals[field]).length;
  if (selectedCount === 0 && row.applied) return { label: 'Aplicado', tone: 'green' };
  if (selectedCount === 0 && !row.hasChanges) return { label: 'Sin cambios', tone: 'slate' };
  if (selectedCount === 0) return { label: 'Con cambios', tone: 'blue' };
  if (selectedCount < FIELD_KEYS.length) return { label: 'Parcial', tone: 'violet' };
  return { label: 'Aprobado', tone: 'green' };
};

const isFieldEligible = (row, field) => {
  if (!row.product || row.errors.length > 0) return false;
  if (field === 'stock') return getStockDelta(row.entry) > 0;
  if (field === 'cost') return Number(row.product.purchasePrice || 0) !== Number(row.entry.cost || 0);
  if (field === 'price') return Number(row.product.price || 0) !== Number(row.entry.salePrice || 0);
  return false;
};

const hasSelectedFieldChange = (row) => FIELD_KEYS.some((field) => row.approvals[field] && isFieldEligible(row, field));

const hasBarcodeAssignmentChange = (row) =>
  Boolean(
    row.product &&
      row.errors.length === 0 &&
      row.manualAssigned &&
      !row.isAssociated &&
      normalizeCode(row.entry.code) &&
      !normalizeCode(row.product.barcode) &&
      normalizeCode(row.product.barcode) !== normalizeCode(row.entry.code),
  );

const isRowApplicable = (row) =>
  Boolean(row.product && row.errors.length === 0 && (hasSelectedFieldChange(row) || hasBarcodeAssignmentChange(row)));

const statusClass = {
  amber: 'bg-sky-50 text-sky-800 border-sky-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  violet: 'bg-violet-50 text-violet-700 border-violet-200',
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
};

const statusAccentClass = {
  amber: 'border-l-sky-400',
  red: 'border-l-red-400',
  blue: 'border-l-blue-400',
  violet: 'border-l-violet-400',
  green: 'border-l-emerald-400',
  slate: 'border-l-slate-300',
};

export default function BulkExcelImportView({ inventory = [], onApplyImport }) {
  const fileInputRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState('');
  const [rows, setRows] = useState([]);
  const [activeTargetBySource, setActiveTargetBySource] = useState({});
  const [activeSourceRowId, setActiveSourceRowId] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  const barcodeLookup = useMemo(() => {
    const map = new Map();
    (inventory || []).forEach((product) => {
      const barcode = normalizeCode(product?.barcode);
      if (barcode) map.set(barcode, product);
    });
    return map;
  }, [inventory]);

  const summary = useMemo(() => {
    const blocked = rows.filter((row) => row.errors.length > 0).length;
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

  const parseWorkbookRows = (sheetRows) => {
    const headers = Object.keys(sheetRows[0] || {}).map(normalizeHeader);
    const missing = REQUIRED_COLUMNS.filter((column) => !headers.includes(column));
    if (missing.length > 0) {
      throw new Error(`Faltan columnas: ${missing.join(', ')}`);
    }

    const entries = sheetRows
      .map((row, index) => buildImportEntry(row, index + 2))
      .filter((entry) => entry.code || entry.description || entry.quantity || entry.cost || entry.salePrice);

    const groupedByCode = entries.reduce((acc, entry) => {
      const key = entry.code || `sin-codigo-${entry.rowNumber}`;
      acc[key] = acc[key] || [];
      acc[key].push(entry);
      return acc;
    }, {});

    return Object.values(groupedByCode).map((group, index) => {
      const isDuplicate = group.length > 1;
      const entry = group[0];
      const product = entry.code ? barcodeLookup.get(entry.code) || null : null;
      return buildReviewRow(
        {
          entry,
          product,
          duplicateOptions: isDuplicate ? group : null,
          duplicateResolved: !isDuplicate,
        },
        index,
      );
    });
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsParsing(true);
    setFileError('');
    setFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) throw new Error('El archivo no tiene hojas.');

      const sheet = workbook.Sheets[firstSheetName];
      const sheetRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      if (sheetRows.length === 0) throw new Error('La primera hoja esta vacia.');

      setRows(parseWorkbookRows(sheetRows));
      setActiveTargetBySource({});
    } catch (error) {
      setRows([]);
      setFileError(error?.message || 'No se pudo leer el archivo.');
    } finally {
      setIsParsing(false);
      event.target.value = '';
    }
  };

  const replaceRowEntry = (rowId, entry, duplicateResolved = true) => {
    setRows((prev) =>
      prev.map((row, index) => {
        if (row.id !== rowId) return row;
        const product = row.productCleared ? null : entry.code ? barcodeLookup.get(entry.code) || row.product : row.product;
        return {
          ...buildReviewRow(
            {
              entry,
              product,
              duplicateOptions: row.duplicateOptions,
              duplicateResolved,
            },
            index,
          ),
          id: row.id,
          assignmentQuery: row.assignmentQuery,
          changeProductMode: row.changeProductMode,
          manualAssigned: row.manualAssigned,
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
      const nextRow = {
        ...buildReviewRow(
          {
            entry: { ...sourceRow.entry, quantity: 0, quantityInput: '0' },
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
    const numericValue = parseNumber(value);
    const inputKey = getEntryInputKey(field);
    setRows((prev) =>
      prev.map((row, index) => {
        if (row.id !== rowId) return row;
        const nextEntry = { ...row.entry, [field]: numericValue, [inputKey]: value };
        if (field === 'multiplier') {
          nextEntry.cost = divideLotValue(row.entry.lotCost ?? row.entry.cost, numericValue);
          nextEntry.salePrice = divideLotValue(row.entry.lotSalePrice ?? row.entry.salePrice, numericValue);
          nextEntry.costInput = nextEntry.cost ? String(nextEntry.cost) : '';
          nextEntry.salePriceInput = nextEntry.salePrice ? String(nextEntry.salePrice) : '';
        }
        const nextRow = {
          ...buildReviewRow(
            {
              entry: nextEntry,
              product: row.product,
              duplicateOptions: row.duplicateOptions,
              duplicateResolved: row.duplicateResolved,
            },
            index,
          ),
          id: row.id,
          assignmentQuery: row.assignmentQuery,
          changeProductMode: row.changeProductMode,
          manualAssigned: row.manualAssigned,
          productCleared: row.productCleared,
          isAssociated: row.isAssociated,
          sourceRowId: row.sourceRowId,
          applied: row.applied,
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
        if (row.id !== rowId || !isFieldEligible(row, field)) return row;
        return { ...row, approvals: { ...row.approvals, [field]: !row.approvals[field] } };
      }),
    );
  };

  const setFieldForEligibleRows = (field, value) => {
    setRows((prev) =>
      prev.map((row) => {
        if (!isFieldEligible(row, field)) return row;
        return { ...row, approvals: { ...row.approvals, [field]: value } };
      }),
    );
  };

  const clearApprovals = () => {
    setRows((prev) => prev.map((row) => ({ ...row, approvals: { stock: false, cost: false, price: false } })));
  };

  const clearImport = () => {
    setRows([]);
    setActiveTargetBySource({});
    setActiveSourceRowId('');
    setFileName('');
    setFileError('');
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
        const haystack = `${product.id} ${product.title || ''} ${product.barcode || ''} ${product.category || ''}`.toLowerCase();
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
        approvals: row.approvals,
        quantity: getStockDelta(row.entry),
        importedQuantity: Number(row.entry.quantity || 0),
        multiplier: Number(row.entry.multiplier || 1),
        before,
        after,
      };
    });

  const handleApplyRows = async (targetRows = applicableRows) => {
    const rowsToApply = targetRows.filter((row) => isRowApplicable(row));
    if (rowsToApply.length === 0 || !onApplyImport) return;
    const productIds = rowsToApply.map((row) => String(row.product.id));
    const duplicatedProduct = productIds.find((id, index) => productIds.indexOf(id) !== index);
    if (duplicatedProduct) {
      setFileError('Hay mas de una fila aprobada para el mismo producto. Resolve esa repeticion antes de aplicar.');
      return;
    }

    setIsApplying(true);
    try {
      setFileError('');
      const payload = buildApplyPayload(rowsToApply);
      const result = await onApplyImport(payload);
      const appliedIds = new Set(result?.appliedRowIds || payload.map((row) => row.rowId));

      setRows((prev) =>
        prev.map((row) => {
          if (!appliedIds.has(row.id)) return row;
          const payloadRow = payload.find((item) => item.rowId === row.id);
          return {
            ...row,
            product: {
              ...row.product,
              stock: payloadRow.after.stock,
              purchasePrice: payloadRow.after.cost,
              price: payloadRow.after.price,
              barcode: payloadRow.after.barcode,
            },
            approvals: { stock: false, cost: false, price: false },
            applied: true,
            manualAssigned: false,
            changeProductMode: false,
            isAssociated: row.isAssociated,
            sourceRowId: row.sourceRowId,
          };
        }),
      );
    } finally {
      setIsApplying(false);
    }
  };

  const handleApply = async () => handleApplyRows(applicableRows);

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
                className="h-8 w-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-white hover:text-red-500 flex items-center justify-center transition-colors"
                title="Limpiar importacion"
              >
                <X size={15} />
              </button>
            )}
          </div>

          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileChange} className="hidden" />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-4 w-full rounded-xl border-2 border-dashed border-emerald-200 bg-emerald-50/70 px-4 py-5 text-emerald-800 hover:bg-emerald-50 hover:border-emerald-300 transition-colors flex flex-col items-center gap-2"
          >
            {isParsing ? <Loader2 size={24} className="animate-spin" /> : <Upload size={24} />}
            <span className="text-xs font-black">{fileName || 'Seleccionar archivo .xlsx o .xls'}</span>
            <span className="text-[10px] font-bold text-emerald-600">Codigo, Descripcion, Cantidad, Precio, Descuento, Costo, Venta</span>
          </button>

          {fileError && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-[11px] font-bold text-red-700 flex gap-2">
              <AlertTriangle size={15} className="shrink-0" />
              {fileError}
            </div>
          )}
        </div>

        <div className="border-b border-slate-200 bg-white px-3 py-2.5">
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
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {[
              ['Filas', summary.total, 'text-slate-700'],
              ['Sin asignar', summary.unassigned, summary.unassigned > 0 ? 'text-sky-600' : 'text-slate-700'],
              ['Bloq.', summary.blocked, summary.blocked > 0 ? 'text-red-600' : 'text-slate-700'],
              ['Aplicar', applicableRows.length, applicableRows.length > 0 ? 'text-emerald-600' : 'text-slate-700'],
            ].map(([label, value, tone]) => (
              <div key={label} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
                <p className="text-[8px] uppercase tracking-wider text-slate-400 font-black leading-none">{label}</p>
                <p className={`mt-1 text-[15px] font-black leading-none ${tone}`}>{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="p-3 space-y-2 border-b border-slate-200">
          <p className="text-[10px] uppercase tracking-wider font-black text-slate-500">Seleccion rapida</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setFieldForEligibleRows('stock', true)} className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-2 text-[11px] font-black text-blue-700 hover:bg-blue-100">Stock</button>
            <button type="button" onClick={() => setFieldForEligibleRows('cost', true)} className="rounded-lg border border-violet-200 bg-violet-50 px-2 py-2 text-[11px] font-black text-violet-700 hover:bg-violet-100">Costo</button>
            <button type="button" onClick={() => setFieldForEligibleRows('price', true)} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-2 text-[11px] font-black text-emerald-700 hover:bg-emerald-100">Venta</button>
            <button type="button" onClick={clearApprovals} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-[11px] font-black text-slate-600 hover:bg-slate-50 flex items-center justify-center gap-1">
              <Eraser size={13} /> Limpiar
            </button>
          </div>
        </div>

        <div className="p-3 mt-auto">
          <AsyncActionButton
            onAction={handleApply}
            pending={isApplying}
            disabled={applicableRows.length === 0 || isApplying}
            loadingLabel="Aplicando..."
            className="w-full rounded-xl bg-slate-900 px-4 py-3 text-xs font-black text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {isApplying ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            Aplicar seleccionados ({applicableRows.length})
          </AsyncActionButton>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col min-h-0">
        <div className="excel-review-header px-4 py-3 border-b border-slate-200 bg-slate-800 text-white flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-black">Revision del lote</h3>
            <p className="text-[10px] text-slate-300 font-bold">Primero asigna productos. Despues marca Stock, Costo o Venta.</p>
          </div>
          <div className="hidden xl:flex items-center gap-2 text-[10px] font-black">
            <span className="rounded-full border border-sky-300/40 bg-sky-400/15 px-2 py-1 text-sky-100">Celeste = asignar</span>
            <span className="rounded-full border border-violet-300/40 bg-violet-400/15 px-2 py-1 text-violet-100">Violeta = costo</span>
            <span className="rounded-full border border-emerald-300/40 bg-emerald-400/15 px-2 py-1 text-emerald-100">Verde = seleccionado</span>
          </div>
          {summary.duplicates > 0 && (
            <span className="rounded-full border border-sky-300/40 bg-sky-400/15 px-3 py-1 text-[10px] font-black text-sky-100">
              {summary.duplicates} duplicado(s)
            </span>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
          {rows.length === 0 ? (
            <div className="h-full min-h-[360px] flex flex-col items-center justify-center text-center p-8 text-slate-400">
              <FileSpreadsheet size={42} className="mb-3 text-slate-300" />
              <p className="font-black text-slate-600">Carga un Excel para revisar productos.</p>
              <p className="text-xs font-bold mt-1 max-w-md">El cruce se hace solo por codigo de barras. Si no existe, vas a elegir el producto manualmente.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {rows.filter((row) => !row.isAssociated).map((row) => {
                const status = getRowStatus(row);
                const associatedRows = rows.filter((candidate) => candidate.sourceRowId === row.id);
                const productRows = [row, ...associatedRows];
                const activeTargetId = activeTargetBySource[row.id] || 'article';
                const activeReviewRow = activeTargetId === 'article'
                  ? null
                  : productRows.find((targetRow) => targetRow.id === activeTargetId) || row;
                const canSumDuplicates = row.duplicateOptions ? areDuplicatePricesEqual(row.duplicateOptions) : false;
                const stockDelta = getStockDelta(row.entry);
                const stockUnit = getStockUnit(row.product);
                const stockAfter = row.product ? Number(row.product.stock || 0) + stockDelta : stockDelta;
                const canApplyRow = isRowApplicable(row);
                const activeCandidates = activeReviewRow ? getProductCandidates(activeReviewRow) : [];
                const activeStockDelta = activeReviewRow ? getStockDelta(activeReviewRow.entry) : 0;
                const activeStockUnit = activeReviewRow ? getStockUnit(activeReviewRow.product) : 'u.';
                const activeStockAfter = activeReviewRow?.product
                  ? Number(activeReviewRow.product.stock || 0) + activeStockDelta
                  : activeStockDelta;
                const activeShowAssignmentSearch = activeReviewRow && (!activeReviewRow.product || activeReviewRow.changeProductMode);
                const isActiveSource = activeSourceRowId === row.id;

                return (
                  <article
                    key={row.id}
                    onClickCapture={() => setActiveSourceRowId(row.id)}
                    className={`excel-review-row ${isActiveSource ? 'excel-review-row-active' : ''} ${status.tone === 'amber' ? 'excel-review-row-attention' : ''} border-l-4 p-2 transition-colors ${statusAccentClass[status.tone] || 'border-l-slate-200'}`}
                  >
                    <div className="grid grid-cols-1 2xl:grid-cols-[minmax(360px,0.9fr)_minmax(640px,1.1fr)] gap-3">
                      <div className="min-w-0">
                        <div className="flex items-start gap-2">
                          <div className={`h-7 w-7 rounded-lg border flex items-center justify-center shrink-0 ${
                            row.product ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-sky-50 border-sky-200 text-sky-700'
                          }`}>
                            {row.product ? <Package size={14} /> : <Search size={14} />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <p className="font-black text-slate-900 text-[13px] truncate" title={row.entry.description || row.entry.code || row.product?.title}>
                                {row.entry.description || row.entry.code || 'Fila del Excel'}
                              </p>
                              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${statusClass[status.tone]}`}>
                                {row.isAssociated ? 'Asociado' : status.label}
                              </span>
                              {row.isAssociated && (
                                <span className="shrink-0 rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2 py-0.5 text-[9px] font-black uppercase text-fuchsia-700">
                                  sin codigo
                                </span>
                              )}
                            </div>
                            <p className="text-[9px] font-bold text-slate-400 font-mono">
                              {row.isAssociated ? 'Vinculado al codigo Excel' : 'Codigo Excel'}: {row.entry.code || '--'} / Fila {row.entry.rowNumber}
                            </p>
                            <div className="mt-1 flex items-center gap-1.5 min-w-0">
                              <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-black uppercase ${
                                row.product
                                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                                  : 'border-sky-200 bg-sky-50 text-sky-700'
                              }`}>
                                Rebu
                              </span>
                              <p className="min-w-0 truncate text-[10px] font-bold text-slate-500" title={row.product?.title || 'Sin producto asignado'}>
                                {row.product?.title || 'Sin producto asignado'}
                              </p>
                              {row.product && (
                                <button
                                  type="button"
                                  onClick={() => toggleChangeProductMode(row.id)}
                                  className="shrink-0 rounded-md border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-sky-700 hover:bg-sky-100"
                                >
                                  {row.changeProductMode ? 'Cancelar' : 'Cambiar producto'}
                                </button>
                              )}
                              {row.product && (
                                <button
                                  type="button"
                                  onClick={() => clearProductFromRow(row.id)}
                                  className="shrink-0 inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-red-700 hover:bg-red-100"
                                  title="Quitar el producto enlazado a este articulo del Excel"
                                >
                                  <X size={10} />
                                  Quitar producto
                                </button>
                              )}
                              {row.product && (
                                <button
                                  type="button"
                                  onClick={() => handleApplyRows([row])}
                                  disabled={!canApplyRow || isApplying}
                                  className="shrink-0 inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
                                  title={canApplyRow ? 'Aplicar solo esta fila' : 'Marca campos o cambia el producto asignado'}
                                >
                                  <CheckCircle2 size={10} />
                                  Aplicar
                                </button>
                              )}
                            </div>
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

                        <div className="mt-2 grid grid-cols-1 gap-1.5">
                          <ReviewTargetButton
                            active={activeTargetId === 'article'}
                            label="Menu 1"
                            title="Articulo del Excel"
                            subtitle={`${Number(row.entry.quantity || 0).toLocaleString('es-AR')} de ${Number(row.entry.originalQuantity || row.entry.quantity || 0).toLocaleString('es-AR')} compra`}
                            tone="slate"
                            onClick={() => setActiveTarget(row.id, 'article')}
                          />
                          {productRows.map((targetRow, targetIndex) => (
                            <ReviewTargetButton
                              key={targetRow.id}
                              active={activeTargetId === targetRow.id}
                              label={targetRow.isAssociated ? `Asociado ${targetIndex}` : 'Principal'}
                              title={targetRow.product?.title || (targetRow.isAssociated ? 'Elegir producto asociado' : 'Producto principal')}
                              subtitle={`${Number(targetRow.entry.quantity || 0).toLocaleString('es-AR')} x ${Number(targetRow.entry.multiplier || 0).toLocaleString('es-AR')} = ${getStockDelta(targetRow).toLocaleString('es-AR')} ${getStockUnit(targetRow.product)}`}
                              tone={targetRow.isAssociated ? 'fuchsia' : 'blue'}
                              onClick={() => setActiveTarget(row.id, targetRow.id)}
                              onRemove={targetRow.isAssociated ? () => removeAssociatedProductRow(targetRow.id) : undefined}
                            />
                          ))}
                        </div>

                        {!row.isAssociated && (
                          <button
                            type="button"
                            onClick={() => addAssociatedProductRow(row)}
                            className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg border border-fuchsia-200 bg-fuchsia-50 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-fuchsia-700 hover:bg-fuchsia-100"
                          >
                            <Link2 size={12} />
                            {associatedRows.length > 0 ? `Asociar otro producto (${associatedRows.length})` : 'Asociar otro producto'}
                          </button>
                        )}

                        {row.errors.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {row.errors.map((error) => (
                              <span key={error} className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-black text-red-700">
                                <ShieldAlert size={12} /> {error}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {activeTargetId === 'article' ? (
                        <ArticleBreakdownPanel
                          sourceRow={row}
                          productRows={productRows}
                          onQuantityChange={(targetRowId, value) => updateRowEntryValue(targetRowId, 'quantity', value)}
                          onSelectTarget={(targetRowId) => setActiveTarget(row.id, targetRowId)}
                          onRemoveAssociated={removeAssociatedProductRow}
                        />
                      ) : !activeReviewRow?.product ? (
                        <div className="rounded-xl border border-sky-200 bg-sky-50 p-2">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[9px] font-black uppercase tracking-wider text-sky-700">Accion necesaria</p>
                              <p className="mt-0.5 truncate text-[12px] font-black text-sky-950">Asignar producto Rebu</p>
                              <p className="text-[10px] font-bold text-sky-800">Este menu queda conectado al articulo del Excel.</p>
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
                                className="w-full rounded-lg border border-sky-300 bg-white pl-8 pr-3 py-1.5 text-[11px] font-black text-sky-950 outline-none focus:ring-2 focus:ring-sky-300"
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
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-[repeat(3,minmax(150px,220px))] gap-1.5 md:justify-end">
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
                            delta={`${formatDiffPercent(activeReviewRow.product?.price, activeReviewRow.entry.salePrice)} vs actual / Lote $${Number(activeReviewRow.entry.lotSalePrice || activeReviewRow.entry.salePrice || 0).toLocaleString('es-AR')}`}
                          />
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
                            <ImportChip label="Venta Excel" tone="price" value={<FancyPrice amount={row.entry.salePrice} />} />
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
                          delta={`${formatDiffPercent(row.product?.price, row.entry.salePrice)} vs actual / Lote $${Number(row.entry.lotSalePrice || row.entry.salePrice || 0).toLocaleString('es-AR')}`}
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
                                            disabled={!canApplyAssociatedRow || isApplying}
                                            className="shrink-0 inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-white px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-white disabled:text-slate-400"
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
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function ReviewTargetButton({ active, label, title, subtitle, tone = 'slate', onClick, onRemove }) {
  const toneClass = {
    slate: active ? 'border-slate-400 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
    blue: active ? 'border-blue-500 bg-blue-600 text-white' : 'border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100',
    fuchsia: active ? 'border-fuchsia-500 bg-fuchsia-600 text-white' : 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800 hover:bg-fuchsia-100',
  }[tone] || 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50';

  return (
    <div className={`grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors ${toneClass}`}>
      <button type="button" onClick={onClick} className="contents text-left">
        <span className={`rounded-md px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide ${active ? 'bg-white/15 text-white' : 'bg-white/70 text-current'}`}>
          {label}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[11px] font-black">{title}</span>
          <span className={`block truncate text-[9px] font-bold ${active ? 'text-white/75' : 'text-slate-400'}`}>{subtitle}</span>
        </span>
      </button>
      {onRemove ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          className={`h-6 w-6 rounded-md border flex items-center justify-center transition-colors ${
            active
              ? 'border-white/25 bg-white/10 text-white hover:bg-white/20'
              : 'border-red-200 bg-white/80 text-red-500 hover:bg-red-50'
          }`}
          title="Quitar producto asociado"
        >
          <X size={12} />
        </button>
      ) : (
        <span aria-hidden="true" className="h-6 w-0" />
      )}
    </div>
  );
}

function ArticleBreakdownPanel({ sourceRow, productRows, onQuantityChange, onSelectTarget, onRemoveAssociated }) {
  const originalQuantity = Number(sourceRow.entry.originalQuantity || sourceRow.entry.quantity || 0);
  const assignedQuantity = productRows.reduce((sum, row) => sum + Number(row.entry.quantity || 0), 0);
  const remainingQuantity = originalQuantity - assignedQuantity;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">Articulo del Excel</p>
          <p className="mt-0.5 truncate text-[12px] font-black text-slate-900" title={sourceRow.entry.description}>
            {sourceRow.entry.description || 'Sin descripcion'}
          </p>
          <p className="text-[9px] font-bold text-slate-400 font-mono">Codigo: {sourceRow.entry.code || '--'} / Fila {sourceRow.entry.rowNumber}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black ${remainingQuantity === 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-sky-200 bg-sky-50 text-sky-700'}`}>
          Resta {remainingQuantity.toLocaleString('es-AR')}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
        <ImportChip label="Cantidad" value={originalQuantity.toLocaleString('es-AR')} />
        <ImportChip label="Asignado" tone="stock" value={assignedQuantity.toLocaleString('es-AR')} />
        <ImportChip label="Costo" tone="cost" value={<FancyPrice amount={sourceRow.entry.lotCost || sourceRow.entry.cost} />} />
        <ImportChip label="Venta" tone="price" value={<FancyPrice amount={sourceRow.entry.lotSalePrice || sourceRow.entry.salePrice} />} />
      </div>

      <div className="mt-2 space-y-1.5">
        {productRows.map((row, index) => {
          const unit = getStockUnit(row.product);
          const stockDelta = getStockDelta(row.entry);
          return (
            <div key={row.id} className="grid grid-cols-[1fr_86px_auto_auto] items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
              <button type="button" onClick={() => onSelectTarget(row.id)} className="min-w-0 text-left">
                <span className="block truncate text-[11px] font-black text-slate-800">
                  {row.isAssociated ? `Asociado ${index}: ` : 'Principal: '}
                  {row.product?.title || (row.isAssociated ? 'Producto asociado' : 'Producto principal')}
                </span>
                <span className="block truncate text-[9px] font-bold text-slate-400">
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
  return (
    <div className={`rounded-lg border border-sky-200 bg-sky-50 ${compact ? 'mt-1 px-1.5 py-1' : 'mt-1.5 px-2 py-1'}`}>
      <div className="flex items-center justify-between gap-1.5">
        <span className="text-[8px] font-black uppercase tracking-wider text-sky-600">Equiv.</span>
        <span className={`${compact ? 'text-[9px]' : 'text-[10px]'} font-black text-sky-800`}>
          {Number(quantity || 0).toLocaleString('es-AR')} x {Number(multiplier || 0).toLocaleString('es-AR')} = {Number(stockDelta || 0).toLocaleString('es-AR')} {unit}
        </span>
      </div>
      <div className={`${compact ? 'mt-0.5' : 'mt-1'} flex items-center gap-1.5`}>
        <span className={`${compact ? 'text-[8px]' : 'text-[9px]'} font-bold text-sky-600`}>
          {compact ? '1 compra =' : 'Cada 1 un. de compra equivale a'}
        </span>
        <input
          type="text"
          inputMode="decimal"
          min="0"
          value={multiplier ?? ''}
          onChange={(event) => onChange(event.target.value)}
          className={`min-w-0 flex-1 rounded-md border border-sky-200 bg-white px-1.5 text-right font-black tabular-nums text-sky-900 outline-none focus:ring-2 focus:ring-sky-200 ${compact ? 'py-0.5 text-[10px]' : 'py-0.5 text-[11px]'}`}
        />
        <span className="text-[9px] font-black uppercase text-sky-600">{unit}</span>
      </div>
    </div>
  );
}

function CompareField({ label, before, after, delta, checked, disabled, onToggle, tone, editableValue, onAfterChange, multiplierControl, compact = false }) {
  const toneClass = {
    blue: checked ? 'border-blue-300 bg-blue-50 shadow-sm' : 'border-slate-200 bg-white',
    amber: checked ? 'border-violet-300 bg-violet-50 shadow-sm' : 'border-slate-200 bg-white',
    violet: checked ? 'border-violet-300 bg-violet-50 shadow-sm' : 'border-slate-200 bg-white',
    emerald: checked ? 'border-emerald-300 bg-emerald-50 shadow-sm' : 'border-slate-200 bg-white',
  }[tone];

  return (
    <div className={`rounded-lg border min-w-0 transition-colors ${compact ? 'p-1.5' : 'p-1.5'} ${toneClass}`}>
      <div className={`flex items-center justify-between gap-1.5 ${compact ? 'mb-1' : 'mb-1.5'}`}>
        <span className={`${compact ? 'text-[9px]' : 'text-[10px]'} font-black uppercase tracking-wider text-slate-600`}>{label}</span>
        <button
          type="button"
          disabled={disabled}
          onClick={onToggle}
          className={`rounded-full border font-black uppercase transition-colors ${compact ? 'px-1.5 py-0.5 text-[8px]' : 'px-1.5 py-0.5 text-[8px]'} ${
            checked
              ? 'border-emerald-500 bg-emerald-600 text-white'
              : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-white'
          } disabled:opacity-40 disabled:hover:bg-slate-50`}
          title={`Aplicar ${label}`}
        >
          {checked ? 'Aplicar' : disabled ? 'Sin cambio' : 'Marcar'}
        </button>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-1">
        <div className={`min-w-0 rounded-md border border-slate-200 bg-slate-50 px-1.5 ${compact ? 'py-0.5' : 'py-0.5'}`}>
          <p className="text-[8px] font-black uppercase tracking-wider text-slate-400">Actual</p>
          <div className={`truncate font-black text-slate-600 ${compact ? 'text-[10px]' : 'text-[11px]'}`}>{before}</div>
        </div>
        <div className="flex items-center text-slate-300">
          <ArrowRight size={compact ? 11 : 12} />
        </div>
        <div className={`min-w-0 rounded-md border border-slate-200 bg-white px-1.5 ${compact ? 'py-0.5' : 'py-0.5'}`}>
          <p className="text-[8px] font-black uppercase tracking-wider text-slate-400">Final</p>
          {onAfterChange ? (
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-black text-slate-400">$</span>
              <input
                type="text"
                inputMode="decimal"
                value={editableValue ?? ''}
                onChange={(event) => onAfterChange(event.target.value)}
                className={`no-spinners min-w-0 flex-1 bg-transparent text-right font-black tabular-nums text-slate-900 outline-none ${compact ? 'text-[10px]' : 'text-[11px]'}`}
                title={`Editar ${label} final`}
              />
            </div>
          ) : (
            <div className={`truncate text-right font-black text-slate-900 ${compact ? 'text-[10px]' : 'text-[11px]'}`}>{after}</div>
          )}
        </div>
      </div>
      <p className={`${compact ? 'mt-0.5 text-[8px]' : 'mt-1 text-[9px]'} font-bold text-slate-400 truncate`}>{delta}</p>
      {multiplierControl}
    </div>
  );
}
