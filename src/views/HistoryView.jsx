// src/views/HistoryView.jsx
// REFACTOR: Interfaz de Historial consolidada y optimizada (filtros, celdas inline, UI premium)

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  History,
  Trash2,
  Edit2,
  XCircle,
  Eye,
  X,
  Search,
  ArrowUpDown,
  FileText,
  UserX,
  Calendar,
  Filter,
  RotateCcw,
  ChevronDown,
  RefreshCw,
  Gift,
  Plus,
  Download,
  TrendingDown,
  DollarSign,
  Tag,
} from 'lucide-react';
import { PAYMENT_METHODS } from '../data';
import { hasPermission } from '../utils/userPermissions';
import { normalizeDate, isVentaLog, getVentaTotal, isTestRecord } from '../utils/helpers';
import { FancyPrice } from '../components/FancyPrice';
import AsyncActionButton from '../components/AsyncActionButton';
import { TransactionDetailModal } from '../components/modals/HistoryModals';
import UserDisplayBadge from '../components/UserDisplayBadge';
import {
  getPaymentBreakdownDisplayItems,
  getPaymentSummary,
  matchesPaymentFilter,
  normalizePaymentBreakdown,
} from '../utils/paymentBreakdown';
import {
  buildUnifiedUserFilterOptions,
  matchesUnifiedUserFilter,
} from '../utils/userFilters';
import useHistoryTransactionsFeed from '../hooks/useHistoryTransactionsFeed';

// --- HELPER LOCAL PARA FORMATO VISUAL ---
const formatDisplayDate = (dateString) => {
  if (!dateString) return '';
  const parts = dateString.split('/');
  if (parts.length === 3) {
    const [day, month, year] = parts;
    return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
  }
  return dateString;
};

const parseHistoryDateTime = (dateValue, timeValue) => {
  const baseDate = normalizeDate(dateValue);
  if (!baseDate) return null;

  const timeMatch = String(timeValue || '').match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (timeMatch) {
    baseDate.setHours(
      Number(timeMatch[1]) || 0,
      Number(timeMatch[2]) || 0,
      Number(timeMatch[3]) || 0,
      0,
    );
  }

  return baseDate;
};

const getTransactionSortDate = (tx) => {
  if (tx?.sortDate instanceof Date && !Number.isNaN(tx.sortDate.getTime())) return tx.sortDate;

  const createdAtDate = tx?.createdAt || tx?.created_at
    ? new Date(tx.createdAt || tx.created_at)
    : null;
  if (createdAtDate && !Number.isNaN(createdAtDate.getTime())) return createdAtDate;

  return parseHistoryDateTime(tx?.date, tx?.timestamp || tx?.time) || normalizeDate(tx?.date) || null;
};

const getLogSortDate = (log) => {
  const createdAtDate = log?.createdAt || log?.created_at ? new Date(log.createdAt || log.created_at) : null;
  if (createdAtDate && !Number.isNaN(createdAtDate.getTime())) return createdAtDate;
  return parseHistoryDateTime(log?.date, log?.timestamp || log?.time) || normalizeDate(log?.date) || null;
};

const parseExpenseDate = (exp) => {
  if (!exp) return null;
  if (exp instanceof Date) return Number.isNaN(exp.getTime()) ? null : exp;
  if (typeof exp === 'string') {
    const d = new Date(exp);
    if (!Number.isNaN(d.getTime())) return d;
    return normalizeDate(exp);
  }
  if (exp.parsedDate instanceof Date && !Number.isNaN(exp.parsedDate.getTime())) return exp.parsedDate;
  if (exp.sortDate instanceof Date && !Number.isNaN(exp.sortDate.getTime())) return exp.sortDate;

  const createdAtDate = exp.createdAt || exp.created_at ? new Date(exp.createdAt || exp.created_at) : null;
  if (createdAtDate && !Number.isNaN(createdAtDate.getTime())) return createdAtDate;

  return parseHistoryDateTime(exp.date, exp.timestamp || exp.time) || normalizeDate(exp.date) || null;
};

const getExpenseCategoryBadgeStyle = (category = '') => {
  const normalized = String(category || '').trim().toLowerCase();
  if (normalized.includes('proveedor')) {
    return 'bg-amber-50 text-amber-700 border-amber-200';
  }
  if (normalized.includes('servicio') || normalized.includes('operativ')) {
    return 'bg-blue-50 text-blue-700 border-blue-200';
  }
  if (normalized.includes('retiro') || normalized.includes('socio')) {
    return 'bg-purple-50 text-purple-700 border-purple-200';
  }
  return 'bg-slate-50 text-slate-700 border-slate-200';
};

const normalizeHistoryAction = (value = '') =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const isSaleModificationLog = (log = {}) => {
  const action = normalizeHistoryAction(log.action);
  return action === 'venta modificada' || (action.includes('modificaci') && action.includes('pedido'));
};

const getSaleLogTransactionId = (log = {}) =>
  log.details?.transactionId || log.details?.id || log.details?.oldTransactionId || null;

const getFirstFiniteNumber = (...values) => {
  for (const value of values) {
    if (value === undefined || value === null || value === '') continue;
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) return numericValue;
  }
  return 0;
};

const getVoidedSaleOriginalSortDate = (voidLog, creationLog) => {
  const originalCreatedAt = voidLog?.details?.originalCreatedAt || voidLog?.details?.createdAt || null;
  if (originalCreatedAt) {
    const originalCreatedAtDate = new Date(originalCreatedAt);
    if (!Number.isNaN(originalCreatedAtDate.getTime())) return originalCreatedAtDate;
  }

  return (
    parseHistoryDateTime(voidLog?.details?.originalDate, voidLog?.details?.originalTimestamp) ||
    parseHistoryDateTime(creationLog?.date, creationLog?.timestamp) ||
    parseHistoryDateTime(voidLog?.details?.date, voidLog?.details?.timestamp) ||
    parseHistoryDateTime(voidLog?.date, voidLog?.timestamp)
  );
};

const HISTORY_PAGE_SIZE = 50;
const HEADER_CONTROL_CLASS = 'h-8 shrink-0 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-700 shadow-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100';
const HEADER_ICON_CONTROL_CLASS = `${HEADER_CONTROL_CLASS} pl-8 pr-3`;
const HEADER_BUTTON_CLASS = `${HEADER_CONTROL_CLASS} inline-flex items-center justify-center gap-1.5 hover:bg-slate-50`;
const normalizeSearchText = (value = '') =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
const getSearchTokens = (query = '') => normalizeSearchText(query).split(/\s+/).filter(Boolean);
const getClientSearchText = (client) =>
  typeof client === 'string' ? client : [client?.name, client?.memberNumber].filter(Boolean).join(' ');
const getHistorySearchHaystack = (tx) =>
  normalizeSearchText([
    tx.id,
    tx.user,
    tx.payment,
    tx.date,
    tx.total,
    getClientSearchText(tx.client),
    tx.memberName,
    tx.memberNumber,
    ...(tx.items || []).flatMap((item) => [
      item.title,
      item.product_title,
      item.name,
      item.category,
    ]),
  ].filter(Boolean).join(' '));
const matchesHistorySearchQuery = (tx, query) => {
  const tokens = getSearchTokens(query);
  if (tokens.length === 0) return true;
  const haystack = getHistorySearchHaystack(tx);
  return tokens.every((token) => haystack.includes(token));
};
const UNCATEGORIZED_LABEL = 'Sin categoria';
const normalizeCategoryFilterText = (value = '') => normalizeSearchText(value);
const splitCategoryText = (value = '') =>
  String(value || '')
    .split(',')
    .map((category) => category.trim())
    .filter(Boolean);
const getHistoryItemCategoryLabels = (item = {}, product = null) => {
  const fromItemCategories = Array.isArray(item.categories)
    ? item.categories.map((category) => String(category || '').trim()).filter(Boolean)
    : [];
  if (fromItemCategories.length > 0) return fromItemCategories;

  const fromProductCategories = Array.isArray(product?.categories)
    ? product.categories.map((category) => String(category || '').trim()).filter(Boolean)
    : [];
  if (fromProductCategories.length > 0) return fromProductCategories;

  const fromText = splitCategoryText(item.category || product?.category || '');
  return fromText.length > 0 ? fromText : [UNCATEGORIZED_LABEL];
};
const getHistoryInventoryProduct = (item = {}, inventory = []) => {
  const itemProductId = item.productId || item.product_id || item.id;
  const itemTitle = String(item.title || item.product_title || item.name || '').trim();
  return (inventory || []).find(
    (product) =>
      (itemProductId !== undefined && itemProductId !== null && String(product.id) === String(itemProductId)) ||
      (itemTitle && product.title === itemTitle),
  );
};
const matchesHistoryCategoryFilter = (item = {}, inventory = [], filterCategory = '') => {
  const normalizedFilter = normalizeCategoryFilterText(filterCategory);
  if (!normalizedFilter) return true;

  const invProduct = getHistoryInventoryProduct(item, inventory);
  return getHistoryItemCategoryLabels(item, invProduct).some(
    (category) => normalizeCategoryFilterText(category) === normalizedFilter,
  );
};
const isRedemptionItem = (item = {}) =>
  Boolean(item.isReward || item.is_reward || /^canje\s*:/i.test(String(item.title || item.product_title || item.name || '')));
const getHistoryItemTitle = (item = {}) =>
  String(item.title || item.product_title || item.name || 'Producto')
    .replace(/^canje\s*:\s*/i, '')
    .trim() || 'Canje';
const buildUserFilterLabel = (presentation, user, duplicateCount = 1) => {
  if (duplicateCount <= 1) return presentation.displayName;

  const suffixParts = [];
  if (user?.role) suffixParts.push(user.role);
  if (user?.id) suffixParts.push(String(user.id).slice(-4));

  return suffixParts.length
    ? `${presentation.displayName} · ${suffixParts.join(' · ')}`
    : presentation.displayName;
};
void buildUserFilterLabel;

const getHistoryBadgeUser = (tx) => {
  const normalizedRole = String(tx?.userRole || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
  const normalizedName = String(tx?.user || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

  const isLegacyCajaLike =
    !tx?.userId &&
    (
      ['owner', 'seller'].includes(normalizedRole) ||
      ['dueno', 'duenio', 'dueño', 'vendedor', 'caja', 'seller'].includes(normalizedName)
    );

  if (isLegacyCajaLike) {
    return { role: 'seller', name: 'Caja' };
  }

  return { id: tx?.userId, role: tx?.userRole, name: tx?.user };
};

const filterHistoryTransactions = ({
  transactions,
  viewMode,
  filterDateStart,
  filterDateEnd,
  filterPayment,
  filterCategory,
  searchQuery,
  sortOrder,
  inventory,
  selectedUserFilter,
  userCatalog,
}) => {
  let txList = [...transactions];
  const isSearchingTest = searchQuery.toLowerCase().trim() === 'test';

  txList = txList.filter((tx) => {
    if (tx.isTest) return isSearchingTest;
    return !isSearchingTest;
  });

  if (viewMode === 'today') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    txList = txList.filter((tx) => {
      if (!tx.sortDate) return false;
      const txDate = new Date(tx.sortDate);
      txDate.setHours(0, 0, 0, 0);
      return txDate.getTime() === today.getTime();
    });
  } else if (viewMode === 'history') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    txList = txList.filter((tx) => {
      if (!tx.sortDate) return false;
      const txDate = new Date(tx.sortDate);
      txDate.setHours(0, 0, 0, 0);
      return txDate.getTime() < today.getTime();
    });
  }

  if (filterDateStart) {
    const [year, month, day] = filterDateStart.split('-');
    const startDate = new Date(year, month - 1, day, 0, 0, 0);
    txList = txList.filter((tx) => tx.sortDate >= startDate);
  }

  if (filterDateEnd) {
    const [year, month, day] = filterDateEnd.split('-');
    const endDate = new Date(year, month - 1, day, 23, 59, 59);
    txList = txList.filter((tx) => tx.sortDate <= endDate);
  }

  if (filterPayment) {
    txList = txList.filter((tx) =>
      matchesPaymentFilter(
        tx.paymentBreakdown,
        filterPayment,
        tx.payment,
        tx.installments,
        tx.cashReceived,
        tx.cashChange,
        tx.total,
      ),
    );
  }

  if (selectedUserFilter) {
    txList = txList.filter((tx) => matchesUnifiedUserFilter(tx, selectedUserFilter, userCatalog));
  }

  if (filterCategory) {
    txList = txList.filter((tx) =>
      (tx.items || []).some((item) => matchesHistoryCategoryFilter(item, inventory, filterCategory)),
    );
  }

  if (searchQuery.trim() && !isSearchingTest) {
    txList = txList.filter((tx) => matchesHistorySearchQuery(tx, searchQuery));
  }

  txList.sort((a, b) => {
    const dateA = a.sortDate?.getTime() || 0;
    const dateB = b.sortDate?.getTime() || 0;
    if (dateA !== dateB) return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    return sortOrder === 'desc' ? b.id - a.id : a.id - b.id;
  });

  return txList;
};export default function HistoryView({
  transactions,
  expenses = [],
  dailyLogs,
  inventory,
  currentUser,
  userCatalog,
  members,
  isLoading = false,
  emptyStateMessage = '',
  onDeleteTransaction,
  onEditTransaction,
  onRestoreTransaction,
  onOpenExpenseModal,
  onViewExpense,
  setTransactions: _setTransactions,
  setDailyLogs: _setDailyLogs,
  showNotification: _showNotification,
  onViewTicket,
  navigationRequest,
  onSoftReload,
  isActive = false,
  enableCloudFeed = true,
}) {
  const hexToRgba = (hex, alpha) => {
    const normalized = String(hex || '').trim();
    const value = normalized.startsWith('#') ? normalized.slice(1) : normalized;
    if (!/^[0-9a-fA-F]{6}$/.test(value)) return null;
    const int = Number.parseInt(value, 16);
    const r = (int >> 16) & 255;
    const g = (int >> 8) & 255;
    const b = int & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const getUserBadgeProps = (userName) => {
    const normalizedUser = String(userName || '').trim().toLowerCase();
    const adminProfile = userCatalog?.admin || null;
    const sellerProfile = userCatalog?.seller || null;

    if (
      normalizedUser === 'admin' ||
      normalizedUser === 'dueño' ||
      normalizedUser === 'due?o' ||
      normalizedUser === String(adminProfile?.name || '').trim().toLowerCase()
    ) {
      const color = adminProfile?.nameColor || '#4f46e5';
      return {
        label: userName || adminProfile?.name || 'Dueño',
        style: {
          color,
          backgroundColor: hexToRgba(color, 0.1) || '#eef2ff',
          borderColor: hexToRgba(color, 0.18) || '#c7d2fe',
        },
      };
    }

    if (
      normalizedUser === 'seller' ||
      normalizedUser === 'vendedor' ||
      normalizedUser === 'caja' ||
      normalizedUser === String(sellerProfile?.name || '').trim().toLowerCase()
    ) {
      const color = sellerProfile?.nameColor || '#059669';
      return {
        label: userName || sellerProfile?.name || 'Caja',
        style: {
          color,
          backgroundColor: hexToRgba(color, 0.1) || '#ecfdf5',
          borderColor: hexToRgba(color, 0.18) || '#a7f3d0',
        },
      };
    }

    return {
      label: userName || 'Desconocido',
      style: {
        color: '#64748b',
        backgroundColor: '#f1f5f9',
        borderColor: '#e2e8f0',
      },
    };
  };
  void getUserBadgeProps;

  const getComboIncludedItems = (item) => {
    if (!item?.isCombo || !Array.isArray(item.productsIncluded) || item.productsIncluded.length === 0) return [];
    const comboQty = Number(item.quantity || item.qty || 1);
    return item.productsIncluded.map((includedItem) => ({
      ...includedItem,
      appliedQuantity: Number(includedItem.quantity || includedItem.qty || 1) * comboQty,
    }));
  };

  // Sección activa: Ventas vs Gastos
  const [historySection, setHistorySection] = useState('sales'); // 'sales' | 'expenses'
  const canManageExpenses = hasPermission(currentUser, 'extras.expenses.manage');

  // Estados de filtros para Ventas
  const [viewMode, setViewMode] = useState('all');
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [filterPayment, setFilterPayment] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [historyFetchPage, setHistoryFetchPage] = useState(1);
  const [isUserFilterOpen, setIsUserFilterOpen] = useState(false);
  const userFilterRef = useRef(null);
  const canEditSale = hasPermission(currentUser, 'history.editSale');
  const canVoidSale = hasPermission(currentUser, 'history.voidSale');
  const canRestoreSale = hasPermission(currentUser, 'history.restoreSale');
  const canDeleteSale = hasPermission(currentUser, 'history.deleteSale');
  const hasHistoryActions = true;

  // Estados de filtros para Gastos
  const [expenseSearchQuery, setExpenseSearchQuery] = useState('');
  const [expenseViewMode, setExpenseViewMode] = useState('all');
  const [expenseDateStart, setExpenseDateStart] = useState('');
  const [expenseDateEnd, setExpenseDateEnd] = useState('');
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState('');
  const [expensePaymentFilter, setExpensePaymentFilter] = useState('');
  const [expenseUserFilter, setExpenseUserFilter] = useState('');
  const [expenseSortOrder, setExpenseSortOrder] = useState('date_desc');
  const [isExpenseUserFilterOpen, setIsExpenseUserFilterOpen] = useState(false);
  const expenseUserFilterRef = useRef(null);
  const [expenseCurrentPage, setExpenseCurrentPage] = useState(1);

  // Modal de detalle
  const [selectedTx, setSelectedTx] = useState(null);
  const [isSoftReloading, setIsSoftReloading] = useState(false);
  const [historyReloadKey, setHistoryReloadKey] = useState(0);

  const {
    transactions: remoteTransactions,
    logs: remoteHistoryLogs,
    isLoading: isRemoteTransactionsLoading,
    hasMore: remoteTransactionsHasMore,
  } = useHistoryTransactionsFeed({
    enabled: isActive && enableCloudFeed,
    page: historyFetchPage,
    pageSize: HISTORY_PAGE_SIZE,
    sortDirection: sortOrder,
    filters: {
      dateStart: filterDateStart,
      dateEnd: filterDateEnd,
      hasWideScan: Boolean(filterPayment || filterUser || filterCategory || searchQuery),
    },
    reloadKey: historyReloadKey,
  });

  const combinedHistoryLogs = useMemo(() => {
    const byId = new Map();
    [...(dailyLogs || []), ...(remoteHistoryLogs || [])].forEach((log) => {
      const key = String(log?.id ?? `${log?.action || 'log'}:${log?.created_at || log?.date || ''}:${log?.timestamp || ''}`);
      if (!byId.has(key)) byId.set(key, log);
    });
    return Array.from(byId.values());
  }, [dailyLogs, remoteHistoryLogs]);

  const latestSaleModificationLogsById = useMemo(() => {
    const byId = new Map();
    (combinedHistoryLogs || []).forEach((log) => {
      if (!isSaleModificationLog(log) || !log.details) return;
      const txId = getSaleLogTransactionId(log);
      if (!txId) return;

      const sortDate = getLogSortDate(log) || new Date(0);
      const currentEntry = byId.get(String(txId));
      if (!currentEntry || sortDate.getTime() >= currentEntry.sortDate.getTime()) {
        byId.set(String(txId), { log, sortDate });
      }
    });
    return byId;
  }, [combinedHistoryLogs]);

  const logVoidedTransactionIds = useMemo(() => {
    const ids = new Set();
    (combinedHistoryLogs || []).forEach((log) => {
      if (log.action !== 'Venta Anulada') return;
      const txId = log.details?.id || log.details?.transactionId;
      if (txId) ids.add(String(txId));
    });
    return ids;
  }, [combinedHistoryLogs]);

  const logDeletedTransactionIds = useMemo(() => {
    const ids = new Set();
    (combinedHistoryLogs || []).forEach((log) => {
      if (!['Borrado Permanente', 'Venta Eliminada'].includes(log.action)) return;
      const txId = log.details?.transactionId || log.details?.id;
      if (txId) ids.add(String(txId));
    });
    return ids;
  }, [combinedHistoryLogs]);

  // =====================================================
  // TRANSACCIONES HIST?RICAS (desde logs)
  // =====================================================
  const historicTransactions = useMemo(() => {
    const txList = [];
    const activeIds = new Set([
      ...(transactions || []).map(t => String(t.id)),
      ...(remoteTransactions || []).map(t => String(t.id)),
    ]);
    const voidedIds = new Set();
    const restoredSourceIds = new Set();
    const permanentlyDeletedIds = new Set();
    const permanentlyDeletedLogs = new Map();
    const saleCreationLogsById = new Map();
    
    (combinedHistoryLogs || []).forEach(log => {
      if (isVentaLog(log) && log.details) {
        const creationTxId = String(log.details.transactionId || log.details.id || log.id);
        if (creationTxId && !saleCreationLogsById.has(creationTxId)) {
          saleCreationLogsById.set(creationTxId, log);
        }
      }
      if (log.action === 'Venta Anulada' && log.details?.id) {
        voidedIds.add(String(log.details.id));
      }
      if (log.action === 'Venta Restaurada' && log.details?.oldTransactionId) {
        restoredSourceIds.add(String(log.details.oldTransactionId));
      }
      //  FIX: Actualizamos el nombre a "Venta Eliminada"
      const deletedTxId = log.details?.transactionId || log.details?.id;
      if ((log.action === 'Borrado Permanente' || log.action === 'Venta Eliminada') && deletedTxId) {
        const normalizedDeletedTxId = String(deletedTxId);
        permanentlyDeletedIds.add(normalizedDeletedTxId);
        permanentlyDeletedLogs.set(normalizedDeletedTxId, log);
      }
    });

    permanentlyDeletedLogs.forEach((log, txId) => {
      const logDate = normalizeDate(log.date);
      if (!logDate) return;

      const safeTotal = Number(log.details?.total) || getVentaTotal(log.details) || 0;

      txList.push({
        id: txId,
        date: log.date,
        timestamp: log.timestamp,
        fullDate: `${log.date}, ${log.timestamp || '00:00'}:00`,
        user: log.user,
        userId: log.userId || null,
        userRole: log.userRole || null,
        items: log.details?.items || [],
        payment: log.details?.payment || 'N/A',
        paymentBreakdown: normalizePaymentBreakdown(
          log.details?.paymentBreakdown,
          log.details?.payment,
          log.details?.installments,
          log.details?.cashReceived,
          log.details?.cashChange,
          safeTotal,
        ),
        cashReceived: Number(log.details?.cashReceived || 0),
        cashChange: Number(log.details?.cashChange || 0),
        installments: log.details?.installments || 0,
        total: safeTotal,
        client: log.details?.client || log.details?.memberName || null,
        memberNumber: log.details?.memberNumber || log.details?.client?.memberNumber || null,
        pointsEarned: log.details?.pointsEarned || 0,
        pointsSpent: log.details?.pointsSpent || 0,
        status: 'deleted',
        isHistoric: true,
        sortDate: logDate,
        isTest: log.isTest,
        isRestored: false,
      });
    });

    (combinedHistoryLogs || []).forEach((log) => {
      if (isVentaLog(log) && log.details) {
        const txId = String(log.details.transactionId || log.id);
        
        //  FIX: Si est? en la lista de borrados permanentes, NO la dibujamos en el historial
        if (activeIds.has(txId) || permanentlyDeletedIds.has(txId) || restoredSourceIds.has(txId)) return;

        const logDate = normalizeDate(log.date);
        if (logDate) {
            const modificationEntry = latestSaleModificationLogsById.get(txId);
            const modificationDetails = modificationEntry?.log?.details || null;
            const resolvedDetails = modificationDetails || log.details;
            const safeTotal = getFirstFiniteNumber(
              resolvedDetails?.newTotal,
              resolvedDetails?.total,
              resolvedDetails?.changes?.total?.new,
              getVentaTotal(resolvedDetails),
              log.details.total,
              getVentaTotal(log.details),
            );
            const resolvedItems =
              resolvedDetails?.itemsSnapshot ||
              resolvedDetails?.items ||
              log.details.items ||
              [];
            const resolvedCashReceived = getFirstFiniteNumber(
              resolvedDetails?.cashReceived,
              log.details?.cashReceived,
            );
            const resolvedCashChange = getFirstFiniteNumber(
              resolvedDetails?.cashChange,
              log.details?.cashChange,
            );

            txList.push({
                id: txId,
                date: log.date,
                timestamp: log.timestamp,
                fullDate: `${log.date}, ${log.timestamp || '00:00'}:00`,
                user: log.user,
                userId: log.userId || null,
                userRole: log.userRole || null,
                items: resolvedItems,
                payment: resolvedDetails.payment || log.details.payment || 'N/A',
                paymentBreakdown: normalizePaymentBreakdown(
                  resolvedDetails?.paymentBreakdown || log.details?.paymentBreakdown,
                  resolvedDetails?.payment || log.details?.payment,
                  resolvedDetails?.installments ?? log.details?.installments,
                  resolvedCashReceived,
                  resolvedCashChange,
                  safeTotal,
                ),
                cashReceived: resolvedCashReceived,
                cashChange: resolvedCashChange,
                installments: resolvedDetails.installments ?? log.details.installments ?? 0,
                total: safeTotal,
                client: resolvedDetails.client || resolvedDetails.memberName || log.details.client || log.details.memberName || null,
                memberNumber: resolvedDetails.client?.memberNumber || resolvedDetails.memberNumber || log.details.client?.memberNumber || log.details.memberNumber || null,
                
                //  FIX: AHORA S? RESCATAMOS LOS PUNTOS DEL FANTASMA
                pointsEarned: resolvedDetails.pointsEarned ?? log.details.pointsEarned ?? 0,
                pointsSpent: resolvedDetails.pointsSpent ?? log.details.pointsSpent ?? 0,
                
                status: voidedIds.has(txId) ? 'voided' : 'completed',
                isHistoric: true,
                sortDate: logDate, 
                isTest: log.isTest,
                isRestored: false, // Generalmente los anulados hist?ricos no est?n restaurados
                isModified: Boolean(modificationEntry),
                modifiedAt: modificationEntry?.log
                  ? `${modificationEntry.log.date || ''}${modificationEntry.log.timestamp ? ` ${modificationEntry.log.timestamp}` : ''}`.trim()
                  : null,
                modificationDetails,
                modificationLogId: modificationEntry?.log?.id || null,
            });
        }
      }
    });
    latestSaleModificationLogsById.forEach((entry, txId) => {
      const { log, sortDate } = entry;
      const details = log.details || {};
      if (activeIds.has(txId) || permanentlyDeletedIds.has(txId) || restoredSourceIds.has(txId)) return;
      if (txList.some((tx) => String(tx.id) === String(txId))) return;

      const safeTotal = getFirstFiniteNumber(
        details.newTotal,
        details.total,
        details.changes?.total?.new,
        getVentaTotal(details),
      );
      const resolvedCashReceived = getFirstFiniteNumber(details.cashReceived);
      const resolvedCashChange = getFirstFiniteNumber(details.cashChange);

      txList.push({
        id: txId,
        date: details.date || log.date,
        timestamp: details.timestamp || log.timestamp,
        fullDate: `${details.date || log.date}, ${details.timestamp || log.timestamp || '00:00'}:00`,
        user: log.user,
        userId: log.userId || details.userId || null,
        userRole: log.userRole || details.userRole || null,
        items: details.itemsSnapshot || details.items || [],
        payment: details.payment || 'N/A',
        paymentBreakdown: normalizePaymentBreakdown(
          details.paymentBreakdown,
          details.payment,
          details.installments,
          resolvedCashReceived,
          resolvedCashChange,
          safeTotal,
        ),
        cashReceived: resolvedCashReceived,
        cashChange: resolvedCashChange,
        installments: details.installments || 0,
        total: safeTotal,
        client: details.client || details.memberName || null,
        memberNumber: details.client?.memberNumber || details.memberNumber || null,
        pointsEarned: details.pointsEarned || 0,
        pointsSpent: details.pointsSpent || 0,
        status: voidedIds.has(txId) ? 'voided' : 'completed',
        isHistoric: true,
        sortDate,
        isTest: log.isTest,
        isRestored: false,
        isModified: true,
        modifiedAt: `${log.date || ''}${log.timestamp ? ` ${log.timestamp}` : ''}`.trim(),
        modificationDetails: details,
        modificationLogId: log.id || null,
      });
    });
    (combinedHistoryLogs || []).forEach((log) => {
      if (log.action !== 'Venta Anulada' || !log.details) return;
      const txId = String(log.details.transactionId || log.details.id || log.id);
      if (activeIds.has(txId) || permanentlyDeletedIds.has(txId) || restoredSourceIds.has(txId)) return;
      if (txList.some((tx) => String(tx.id) === txId)) return;

      const creationLog = saleCreationLogsById.get(txId);
      const logDate = getVoidedSaleOriginalSortDate(log, creationLog);
      if (!logDate) return;

      const safeTotal = Number(log.details.total) || getVentaTotal(log.details) || 0;
      const items =
        log.details.items ||
        log.details.itemsSnapshot ||
        log.details.itemsReturned ||
        [];

      txList.push({
        id: txId,
        date: log.details?.originalDate || creationLog?.date || log.details?.date || log.date,
        timestamp: log.details?.originalTimestamp || creationLog?.timestamp || log.details?.timestamp || log.timestamp,
        fullDate: `${log.details?.originalDate || creationLog?.date || log.details?.date || log.date}, ${log.details?.originalTimestamp || creationLog?.timestamp || log.details?.timestamp || log.timestamp || '00:00'}:00`,
        user: log.user,
        userId: log.userId || log.details?.userId || null,
        userRole: log.userRole || log.details?.userRole || null,
        items,
        payment: log.details.payment || 'N/A',
        paymentBreakdown: normalizePaymentBreakdown(
          log.details?.paymentBreakdown,
          log.details?.payment,
          log.details?.installments,
          log.details?.cashReceived,
          log.details?.cashChange,
          safeTotal,
        ),
        cashReceived: Number(log.details?.cashReceived || 0),
        cashChange: Number(log.details?.cashChange || 0),
        installments: log.details?.installments || 0,
        total: safeTotal,
        client: log.details?.client || log.details?.memberName || null,
        memberNumber: log.details?.memberNumber || log.details?.client?.memberNumber || null,
        pointsEarned: log.details?.pointsEarned || 0,
        pointsSpent: log.details?.pointsSpent || 0,
        status: 'voided',
        isHistoric: true,
        sortDate: logDate,
        voidedAt: `${log.date}, ${log.timestamp || '00:00'}:00`,
        isTest: log.isTest,
        isRestored: false,
      });
    });

    return txList;
  }, [combinedHistoryLogs, latestSaleModificationLogsById, remoteTransactions, transactions]);

  // =====================================================
  // TRANSACCIONES ACTIVAS
  // =====================================================
  const fallbackActiveTransactions = useMemo(() => {
    return (transactions || []).map((tx) => {
      const logDate = normalizeDate(tx.date);
      let resolvedUser = tx.user;
      let resolvedItems = tx.items;
      const creationLog = (combinedHistoryLogs || []).find(log => 
        (log.action === 'Venta Realizada' && String(log.details?.transactionId) === String(tx.id))
      );
      const modificationEntry = latestSaleModificationLogsById.get(String(tx.id));
      const modificationDetails = modificationEntry?.log?.details || null;
      
      if (!resolvedUser || resolvedUser === 'Desconocido') {
          if (creationLog) resolvedUser = creationLog.user;
      }

      if (modificationDetails?.itemsSnapshot?.length) {
        resolvedItems = modificationDetails.itemsSnapshot;
      } else if ((!resolvedItems || resolvedItems.length === 0) && creationLog?.details?.items?.length) {
        resolvedItems = creationLog.details.items;
      }

      const resolvedTotal = getFirstFiniteNumber(
        modificationDetails?.newTotal,
        modificationDetails?.total,
        modificationDetails?.changes?.total?.new,
        tx.total,
        creationLog?.details?.total,
      );
      const resolvedCashReceived = getFirstFiniteNumber(
        modificationDetails?.cashReceived,
        tx.cashReceived,
        creationLog?.details?.cashReceived,
      );
      const resolvedCashChange = getFirstFiniteNumber(
        modificationDetails?.cashChange,
        tx.cashChange,
        creationLog?.details?.cashChange,
      );
      const resolvedPaymentBreakdown = normalizePaymentBreakdown(
        modificationDetails?.paymentBreakdown || tx.paymentBreakdown || creationLog?.details?.paymentBreakdown,
        modificationDetails?.payment || tx.payment,
        modificationDetails?.installments ?? tx.installments,
        resolvedCashReceived,
        resolvedCashChange,
        resolvedTotal,
      );

      return {
        ...tx,
        status: logVoidedTransactionIds.has(String(tx.id)) ? 'voided' : (tx.status || 'completed'),
        user: resolvedUser || 'Desconocido',
        items: resolvedItems,
        total: resolvedTotal,
        paymentBreakdown: resolvedPaymentBreakdown,
        payment: getPaymentSummary(resolvedPaymentBreakdown, modificationDetails?.payment || tx.payment, modificationDetails?.installments ?? tx.installments),
        cashReceived: resolvedCashReceived,
        cashChange: resolvedCashChange,
        installments: modificationDetails?.installments ?? tx.installments,
        pointsEarned: modificationDetails?.pointsEarned ?? tx.pointsEarned,
        pointsSpent: modificationDetails?.pointsSpent ?? tx.pointsSpent,
        client: modificationDetails?.client || tx.client,
        memberNumber: modificationDetails?.memberNumber || tx.memberNumber,
        isModified: Boolean(modificationEntry),
        modifiedAt: modificationEntry?.log
          ? `${modificationEntry.log.date || ''}${modificationEntry.log.timestamp ? ` ${modificationEntry.log.timestamp}` : ''}`.trim()
          : null,
        modificationDetails,
        modificationLogId: modificationEntry?.log?.id || null,
        isHistoric: false,
        sortDate: getTransactionSortDate(tx) || logDate || new Date(), 
      };
    });
  }, [transactions, combinedHistoryLogs, latestSaleModificationLogsById, logVoidedTransactionIds]);

  const activeTransactions = useMemo(() => {
    const withVoidedStatus = (records = []) =>
      records
        .filter((tx) => tx.status !== 'deleted' && !logDeletedTransactionIds.has(String(tx.id)))
        .map((tx) => ({
          ...tx,
          status: logVoidedTransactionIds.has(String(tx.id)) ? 'voided' : (tx.status || 'completed'),
          sortDate: getTransactionSortDate(tx) || new Date(),
        }));

    if (isActive) {
      const byId = new Map();

      withVoidedStatus(fallbackActiveTransactions).forEach((tx) => {
        byId.set(String(tx.id), tx);
      });

      withVoidedStatus(Array.isArray(remoteTransactions) ? remoteTransactions : []).forEach((tx) => {
        byId.set(String(tx.id), {
          ...(byId.get(String(tx.id)) || {}),
          ...tx,
        });
      });

      return Array.from(byId.values());
    }

    return withVoidedStatus(fallbackActiveTransactions);
  }, [fallbackActiveTransactions, isActive, logDeletedTransactionIds, logVoidedTransactionIds, remoteTransactions]);

  const activeTransactionIds = useMemo(
    () => new Set(activeTransactions.map((tx) => String(tx.id))),
    [activeTransactions],
  );

  const visibleHistoricTransactions = useMemo(
    () =>
      historicTransactions.filter((tx) => {
        if (tx.status !== 'completed') return true;
        return !activeTransactionIds.has(String(tx.id));
      }),
    [activeTransactionIds, historicTransactions],
  );

  const userFilterOptions = useMemo(() => {
    return buildUnifiedUserFilterOptions({
      catalogUsers: userCatalog?.all,
      records: [...activeTransactions, ...visibleHistoricTransactions],
      userCatalog,
    });
  }, [activeTransactions, userCatalog, visibleHistoricTransactions]);

  const selectedUserFilter = useMemo(
    () => userFilterOptions.find((option) => option.key === filterUser) || null,
    [filterUser, userFilterOptions],
  );

  // =====================================================
  // COMBINAR Y FILTRAR
  // =====================================================
  const filteredTransactions = useMemo(() => {
    let txList = [...activeTransactions, ...visibleHistoricTransactions];
    const isSearchingTest = searchQuery.toLowerCase().trim() === 'test';

    // 1. FILTRO DE MODO PRUEBA
    txList = txList.filter(tx => {
      if (tx.isTest) {
        return isSearchingTest;
      } else {
        return !isSearchingTest;
      }
    });

    // 2. L?GICA DE VISTA: HOY vs HISTORIAL
    if (viewMode === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      txList = txList.filter((tx) => {
        if (!tx.sortDate) return false;
        const txDate = new Date(tx.sortDate);
        txDate.setHours(0, 0, 0, 0);
        return txDate.getTime() === today.getTime();
      });
    } else if (viewMode === 'history') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      txList = txList.filter((tx) => {
        if (!tx.sortDate) return false;
        const txDate = new Date(tx.sortDate);
        txDate.setHours(0, 0, 0, 0);
        return txDate.getTime() < today.getTime(); 
      });
    }

    // 3. RANGO DE FECHAS
    if (filterDateStart) {
      const [year, month, day] = filterDateStart.split('-');
      const startDate = new Date(year, month - 1, day, 0, 0, 0);
      txList = txList.filter((tx) => tx.sortDate >= startDate);
    }
    if (filterDateEnd) {
      const [year, month, day] = filterDateEnd.split('-');
      const endDate = new Date(year, month - 1, day, 23, 59, 59);
      txList = txList.filter((tx) => tx.sortDate <= endDate);
    }

    // 4. RESTO DE FILTROS B?SICOS
    if (filterPayment) {
      txList = txList.filter((tx) =>
        matchesPaymentFilter(
          tx.paymentBreakdown,
          filterPayment,
          tx.payment,
          tx.installments,
          tx.cashReceived,
          tx.cashChange,
          tx.total,
        ),
      );
    }
    if (selectedUserFilter) {
      txList = txList.filter((tx) => matchesUnifiedUserFilter(tx, selectedUserFilter, userCatalog));
    }
    
    // 5. FILTRO DE CATEGORÍA
    if (filterCategory) {
      txList = txList.filter((tx) =>
        (tx.items || []).some((item) => matchesHistoryCategoryFilter(item, inventory, filterCategory))
      );
    }

    // 6. B?SQUEDA GENERAL
    if (searchQuery.trim() && !isSearchingTest) {
      txList = txList.filter((tx) => matchesHistorySearchQuery(tx, searchQuery));
    }

    // 7. ORDENAMIENTO
    txList.sort((a, b) => {
      const dateA = a.sortDate?.getTime() || 0;
      const dateB = b.sortDate?.getTime() || 0;
      if (dateA !== dateB) return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
      return sortOrder === 'desc' ? b.id - a.id : a.id - b.id;
    });

    return txList;
  }, [
    viewMode, activeTransactions, visibleHistoricTransactions, 
    filterDateStart, filterDateEnd, filterPayment, 
    filterCategory, searchQuery, sortOrder, inventory, selectedUserFilter, userCatalog
  ]);

  const statsActiveTransactions = useMemo(
    () => (fallbackActiveTransactions.length > 0 ? fallbackActiveTransactions : activeTransactions),
    [activeTransactions, fallbackActiveTransactions],
  );

  const statsActiveTransactionIds = useMemo(
    () => new Set(statsActiveTransactions.map((tx) => String(tx.id))),
    [statsActiveTransactions],
  );

  const statsHistoricTransactions = useMemo(
    () =>
      historicTransactions.filter((tx) => {
        if (tx.status !== 'completed') return true;
        return !statsActiveTransactionIds.has(String(tx.id));
      }),
    [historicTransactions, statsActiveTransactionIds],
  );

  const exactFilteredTransactions = useMemo(
    () =>
      filterHistoryTransactions({
        transactions: [...statsActiveTransactions, ...statsHistoricTransactions],
        viewMode,
        filterDateStart,
        filterDateEnd,
        filterPayment,
        filterCategory,
        searchQuery,
        sortOrder,
        inventory,
        selectedUserFilter,
        userCatalog,
      }),
    [
      filterCategory,
      filterDateEnd,
      filterDateStart,
      filterPayment,
      inventory,
      searchQuery,
      selectedUserFilter,
      sortOrder,
      statsActiveTransactions,
      statsHistoricTransactions,
      userCatalog,
      viewMode,
    ],
  );


  const stats = useMemo(() => {
    const validTx = exactFilteredTransactions.filter((tx) => tx.status !== 'voided' && tx.status !== 'deleted');
    return {
      count: validTx.length,
      total: validTx.reduce((sum, tx) => sum + (Number(tx.total) || 0), 0),
    };
  }, [exactFilteredTransactions]);

  const categoriesList = useMemo(() => {
    const cats = new Set();
    (inventory || []).forEach(p => {
      if (Array.isArray(p.categories)) {
        p.categories.forEach((category) => {
          const trimmed = String(category || '').trim();
          if (trimmed) cats.add(trimmed);
        });
      }
      if (p.category) {
        p.category.split(',').forEach(c => {
          const trimmed = c.trim();
          if (trimmed) cats.add(trimmed);
        });
      }
    });
    cats.add(UNCATEGORIZED_LABEL);
    return Array.from(cats).sort();
  }, [inventory]);

  const clearFilters = () => {
    setFilterDateStart(''); setFilterDateEnd('');
    setFilterPayment(''); setFilterUser(''); setFilterCategory('');
    setSearchQuery('');
  };

  const handleSoftReload = async () => {
    setIsSoftReloading(true);
    try {
      if (onSoftReload) {
        await onSoftReload();
      }
      setHistoryReloadKey((prev) => prev + 1);
    } finally {
      setIsSoftReloading(false);
    }
  };

  const hasActiveFilters = filterDateStart || filterDateEnd || filterPayment || filterUser || filterCategory || searchQuery;
  const totalPages = Math.max(
    1,
    Math.ceil(filteredTransactions.length / HISTORY_PAGE_SIZE) + (remoteTransactionsHasMore ? 1 : 0),
  );
  const pageStart = filteredTransactions.length === 0 ? 0 : (currentPage - 1) * HISTORY_PAGE_SIZE + 1;
  const pageEnd = Math.min(currentPage * HISTORY_PAGE_SIZE, filteredTransactions.length);
  const visiblePageNumbers = useMemo(() => {
    if (totalPages <= 3) return Array.from({ length: totalPages }, (_, index) => index + 1);
    if (currentPage <= 2) return [1, 2, 3];
    if (currentPage >= totalPages - 1) return [totalPages - 2, totalPages - 1, totalPages];
    return [currentPage - 1, currentPage, currentPage + 1];
  }, [currentPage, totalPages]);
  const paginatedTransactions = useMemo(() => {
    const startIndex = (currentPage - 1) * HISTORY_PAGE_SIZE;
    return filteredTransactions.slice(startIndex, startIndex + HISTORY_PAGE_SIZE);
  }, [filteredTransactions, currentPage]);
  const canGoNextPage = currentPage * HISTORY_PAGE_SIZE < filteredTransactions.length || remoteTransactionsHasMore;

  useEffect(() => {
    setHistoryFetchPage((prev) => Math.max(prev, currentPage));
  }, [currentPage]);

  useEffect(() => {
    setHistoryFetchPage(1);
  }, [viewMode, filterDateStart, filterDateEnd, filterPayment, filterUser, filterCategory, searchQuery, sortOrder, historyReloadKey]);

  useEffect(() => {
    if (!isActive || isRemoteTransactionsLoading || !remoteTransactionsHasMore) return;

    const requiredVisibleCount = currentPage * HISTORY_PAGE_SIZE;
    if (filteredTransactions.length >= requiredVisibleCount) return;

    setHistoryFetchPage((prev) => prev + 1);
  }, [
    currentPage,
    filteredTransactions.length,
    isActive,
    isRemoteTransactionsLoading,
    remoteTransactionsHasMore,
  ]);
  useEffect(() => {
    setCurrentPage(1);
  }, [viewMode, filterDateStart, filterDateEnd, filterPayment, filterUser, filterCategory, searchQuery, sortOrder]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (!navigationRequest?.token) return;

    setViewMode('all');
    setFilterDateStart('');
    setFilterDateEnd('');
    setFilterPayment('');
    setFilterUser('');
    setFilterCategory(navigationRequest.category || '');
    setSearchQuery(navigationRequest.searchQuery || '');
    setSortOrder('desc');
    setIsUserFilterOpen(false);
  }, [navigationRequest]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!userFilterRef.current?.contains(event.target)) {
        setIsUserFilterOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // =====================================================
  // GASTOS (COMPUTED & FILTROS)
  // =====================================================
  const cleanExpensesList = useMemo(() => {
    return (expenses || []).filter((e) => !isTestRecord(e));
  }, [expenses]);

  const expenseCategoriesList = useMemo(() => {
    const defaultCats = ['Proveedores', 'Servicios/Operativos', 'Retiros de Socios', 'Otros'];
    const dynamicCats = cleanExpensesList.map((e) => e.category).filter(Boolean);
    return Array.from(new Set([...defaultCats, ...dynamicCats])).sort();
  }, [cleanExpensesList]);

  const expenseUserFilterOptions = useMemo(() => {
    return buildUnifiedUserFilterOptions({
      catalogUsers: userCatalog?.all,
      records: cleanExpensesList,
      userCatalog,
    });
  }, [cleanExpensesList, userCatalog]);

  const selectedExpenseUserFilter = useMemo(
    () => expenseUserFilterOptions.find((option) => option.key === expenseUserFilter) || null,
    [expenseUserFilter, expenseUserFilterOptions],
  );

  const filteredExpensesList = useMemo(() => {
    let list = cleanExpensesList.map((exp) => ({
      ...exp,
      parsedDate: parseExpenseDate(exp) || new Date(0),
    }));

    if (expenseSearchQuery.trim()) {
      const q = normalizeSearchText(expenseSearchQuery);
      list = list.filter((exp) => {
        const noteText = normalizeSearchText(exp.note || exp.description || '');
        const catText = normalizeSearchText(exp.category || '');
        const userText = normalizeSearchText(exp.user || exp.user_name || exp.userName || '');
        const paymentText = normalizeSearchText(exp.paymentMethod || exp.payment_method || '');
        const idText = String(exp.id || '');
        return noteText.includes(q) || catText.includes(q) || userText.includes(q) || paymentText.includes(q) || idText.includes(q);
      });
    }

    if (expenseViewMode === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      list = list.filter((exp) => {
        const d = new Date(exp.parsedDate);
        d.setHours(0, 0, 0, 0);
        return d.getTime() === today.getTime();
      });
    } else if (expenseViewMode === 'yesterday') {
      const yest = new Date();
      yest.setDate(yest.getDate() - 1);
      yest.setHours(0, 0, 0, 0);
      list = list.filter((exp) => {
        const d = new Date(exp.parsedDate);
        d.setHours(0, 0, 0, 0);
        return d.getTime() === yest.getTime();
      });
    } else if (expenseViewMode === '7d') {
      const limit = new Date();
      limit.setDate(limit.getDate() - 7);
      limit.setHours(0, 0, 0, 0);
      list = list.filter((exp) => exp.parsedDate >= limit);
    } else if (expenseViewMode === '30d') {
      const limit = new Date();
      limit.setDate(limit.getDate() - 30);
      limit.setHours(0, 0, 0, 0);
      list = list.filter((exp) => exp.parsedDate >= limit);
    } else if (expenseViewMode === 'month') {
      const now = new Date();
      list = list.filter((exp) => {
        return exp.parsedDate.getMonth() === now.getMonth() && exp.parsedDate.getFullYear() === now.getFullYear();
      });
    }

    if (expenseDateStart) {
      const [year, month, day] = expenseDateStart.split('-');
      const startDate = new Date(year, month - 1, day, 0, 0, 0);
      list = list.filter((exp) => exp.parsedDate >= startDate);
    }
    if (expenseDateEnd) {
      const [year, month, day] = expenseDateEnd.split('-');
      const endDate = new Date(year, month - 1, day, 23, 59, 59);
      list = list.filter((exp) => exp.parsedDate <= endDate);
    }

    if (expenseCategoryFilter) {
      list = list.filter((exp) => String(exp.category || '').toLowerCase() === expenseCategoryFilter.toLowerCase());
    }

    if (expensePaymentFilter) {
      list = list.filter((exp) => {
        const pm = String(exp.paymentMethod || exp.payment_method || '').toLowerCase();
        return pm === expensePaymentFilter.toLowerCase();
      });
    }

    if (selectedExpenseUserFilter) {
      list = list.filter((exp) => matchesUnifiedUserFilter(exp, selectedExpenseUserFilter, userCatalog));
    }

    list.sort((a, b) => {
      if (expenseSortOrder === 'date_asc') {
        return a.parsedDate.getTime() - b.parsedDate.getTime();
      }
      if (expenseSortOrder === 'amount_desc') {
        return Number(b.amount || 0) - Number(a.amount || 0);
      }
      if (expenseSortOrder === 'amount_asc') {
        return Number(a.amount || 0) - Number(b.amount || 0);
      }
      return b.parsedDate.getTime() - a.parsedDate.getTime();
    });

    return list;
  }, [
    cleanExpensesList,
    expenseCategoryFilter,
    expenseDateEnd,
    expenseDateStart,
    expensePaymentFilter,
    expenseSearchQuery,
    expenseSortOrder,
    expenseViewMode,
    selectedExpenseUserFilter,
    userCatalog,
  ]);

  const expenseStats = useMemo(() => {
    const total = filteredExpensesList.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const count = filteredExpensesList.length;
    const avg = count > 0 ? total / count : 0;

    const catMap = new Map();
    filteredExpensesList.forEach((e) => {
      const c = e.category || 'Otros';
      catMap.set(c, (catMap.get(c) || 0) + Number(e.amount || 0));
    });
    let topCat = '--';
    let topCatAmount = 0;
    catMap.forEach((amt, c) => {
      if (amt > topCatAmount) {
        topCatAmount = amt;
        topCat = c;
      }
    });

    return { total, count, avg, topCat, topCatAmount };
  }, [filteredExpensesList]);

  const resetExpenseFilters = () => {
    setExpenseSearchQuery('');
    setExpenseViewMode('all');
    setExpenseDateStart('');
    setExpenseDateEnd('');
    setExpenseCategoryFilter('');
    setExpensePaymentFilter('');
    setExpenseUserFilter('');
    setExpenseSortOrder('date_desc');
    setExpenseCurrentPage(1);
  };

  const handleExportExpensesExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const dataToExport = filteredExpensesList.map((exp) => {
        const expDate = exp.parsedDate instanceof Date && !Number.isNaN(exp.parsedDate.getTime()) ? exp.parsedDate : null;
        return {
          'ID': exp.id || '--',
          'Fecha': expDate ? expDate.toLocaleDateString('es-AR') : (exp.date || '--'),
          'Hora': expDate ? expDate.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : (exp.time || '--'),
          'Concepto / Nota': exp.note || exp.description || 'Sin concepto',
          'Categoría': exp.category || 'Otros',
          'Método de Pago': exp.paymentMethod || exp.payment_method || 'Efectivo',
          'Usuario': exp.user || exp.user_name || exp.userName || 'Sistema',
          'Importe': Number(exp.amount || 0),
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Gastos');
      const nowStr = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `Historial_Gastos_Rebu_${nowStr}.xlsx`);
    } catch (err) {
      console.error('Error exportando gastos a Excel:', err);
    }
  };

  const EXPENSE_PAGE_SIZE = 50;
  const expenseTotalPages = Math.ceil(filteredExpensesList.length / EXPENSE_PAGE_SIZE) || 1;
  const paginatedExpenses = useMemo(() => {
    const start = (expenseCurrentPage - 1) * EXPENSE_PAGE_SIZE;
    return filteredExpensesList.slice(start, start + EXPENSE_PAGE_SIZE);
  }, [filteredExpensesList, expenseCurrentPage]);

  useEffect(() => {
    setExpenseCurrentPage(1);
  }, [
    expenseSearchQuery,
    expenseViewMode,
    expenseDateStart,
    expenseDateEnd,
    expenseCategoryFilter,
    expensePaymentFilter,
    expenseUserFilter,
    expenseSortOrder,
  ]);

  useEffect(() => {
    const handleClickOutsideExpenseUser = (event) => {
      if (!expenseUserFilterRef.current?.contains(event.target)) {
        setIsExpenseUserFilterOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutsideExpenseUser);
    return () => document.removeEventListener('mousedown', handleClickOutsideExpenseUser);
  }, []);

  // =====================================================
  // RENDER
  // =====================================================
  const hasHistorySourceData = (transactions?.length || 0) > 0 || (dailyLogs?.length || 0) > 0;

  if ((isLoading || (isActive && isRemoteTransactionsLoading)) && activeTransactions.length === 0 && visibleHistoricTransactions.length === 0) {
    return (
      <div className="history-view flex h-full items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="text-center">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">Cargando historial</p>
          <p className="mt-2 text-sm font-medium text-slate-500">Estamos trayendo ventas y movimientos sin bloquear el resto del sistema.</p>
        </div>
      </div>
    );
  }

  if (emptyStateMessage && !hasHistorySourceData) {
    return (
      <div className="history-view flex h-full items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="max-w-md text-center">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">Historial no disponible</p>
          <p className="mt-2 text-sm font-medium text-slate-500">{emptyStateMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="history-view bg-white rounded-xl shadow-sm border overflow-hidden h-full min-h-0 flex flex-col">
      {/* SECCIÓN PRINCIPAL: VENTAS / GASTOS */}
      <div className="border-b border-slate-200 bg-slate-100/90 px-3 py-1.5 shrink-0 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setHistorySection('sales')}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
              historySection === 'sales'
                ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/60'
            }`}
          >
            <History size={13} className={historySection === 'sales' ? 'text-sky-600' : 'text-slate-400'} />
            <span>Ventas</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full bg-slate-100 text-[10px] text-slate-600 font-bold border border-slate-200">
              {stats.count}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setHistorySection('expenses')}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
              historySection === 'expenses'
                ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/60'
            }`}
          >
            <TrendingDown size={13} className={historySection === 'expenses' ? 'text-rose-600' : 'text-slate-400'} />
            <span>Gastos</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full bg-rose-50 text-[10px] text-rose-700 font-bold border border-rose-200">
              {expenseStats.count}
            </span>
          </button>
        </div>

        {historySection === 'expenses' && canManageExpenses && onOpenExpenseModal && (
          <button
            type="button"
            onClick={onOpenExpenseModal}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-sm transition active:scale-95 cursor-pointer"
          >
            <Plus size={13} />
            <span>Nuevo Gasto</span>
          </button>
        )}
      </div>

      {historySection === 'sales' ? (
        <>
          {/* HEADER Y FILTROS DE VENTAS */}
          <div className="border-b bg-slate-50 px-3 py-2 shrink-0">
            <div className="history-filter-scroll flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-1 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-transparent" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 transparent' }}>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 text-sky-600 shadow-sm">
                <History size={16} />
              </div>

              <span className={`${HEADER_CONTROL_CLASS} inline-flex items-center gap-1.5`}>
                <span>{stats.count} ventas</span>
                <span className="text-slate-300">{'\u2022'}</span>
                <span className="text-blue-600"><FancyPrice amount={stats.total} /></span>
              </span>

              <div className="relative min-w-[260px] flex-1 shrink-0">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar ID, cliente, producto..."
                  className={`${HEADER_ICON_CONTROL_CLASS} w-full`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <select className={HEADER_CONTROL_CLASS} value={viewMode} onChange={(e) => setViewMode(e.target.value)}>
                <option value="all">Todas las fechas</option>
                <option value="today">Solo Hoy</option>
                <option value="history">Solo Historial</option>
              </select>

              <div className={`${HEADER_CONTROL_CLASS} flex items-center gap-1.5 px-2`}>
                <Calendar size={12} className="text-slate-400" />
                <input type="date" className="h-full bg-transparent text-[11px] font-bold text-slate-700 outline-none cursor-pointer" value={filterDateStart} onChange={(e) => setFilterDateStart(e.target.value)} title="Desde"/>
                <span className="text-[10px] text-slate-300">a</span>
                <input type="date" className="h-full bg-transparent text-[11px] font-bold text-slate-700 outline-none cursor-pointer" value={filterDateEnd} onChange={(e) => setFilterDateEnd(e.target.value)} title="Hasta"/>
              </div>

              <div className="relative shrink-0">
                 <Filter size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                 <select className={`${HEADER_ICON_CONTROL_CLASS} appearance-none cursor-pointer`} value={filterPayment} onChange={(e) => setFilterPayment(e.target.value)}>
                   <option value="">{'M\u00E9todo de Pago'}</option>
                   {PAYMENT_METHODS.map((m) => (<option key={m.id} value={m.id}>{m.label}</option>))}
                 </select>
              </div>

              <select className={`${HEADER_CONTROL_CLASS} cursor-pointer`} value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
                <option value="">{'Todas las Categor\u00EDas'}</option>
                {categoriesList.map((c) => (<option key={c} value={c}>{c}</option>))}
              </select>

              <div className="relative shrink-0" ref={userFilterRef}>
                <button
                  type="button"
                  onClick={() => setIsUserFilterOpen((prev) => !prev)}
                  className={`${HEADER_CONTROL_CLASS} flex min-w-[170px] cursor-pointer items-center justify-between gap-2`}
                >
                  {selectedUserFilter ? (() => {
                    return (
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/80 shadow-sm"
                          style={{ backgroundColor: selectedUserFilter.color }}
                        />
                        <span className="truncate text-slate-700">{selectedUserFilter.displayName}</span>
                      </span>
                    );
                  })() : (
                    <span className="text-slate-700">Todos los Usuarios</span>
                  )}
                  <ChevronDown size={14} className={`text-slate-400 transition-transform ${isUserFilterOpen ? 'rotate-180' : ''}`} />
                </button>

                {isUserFilterOpen && (
                  <div className="absolute right-0 top-full z-20 mt-1.5 w-[260px] rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                    <button
                      type="button"
                      onClick={() => {
                        setFilterUser('');
                        setIsUserFilterOpen(false);
                      }}
                      className={`flex w-full items-center rounded-lg px-2.5 py-2 text-left text-[11px] font-medium transition ${
                        !selectedUserFilter ? 'bg-slate-100 text-slate-800' : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      Todos los Usuarios
                    </button>

                    <div className="mt-1 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                      {userFilterOptions.map((option) => {
                        const isActive = selectedUserFilter?.key === option.key;

                        return (
                          <button
                            key={option.key}
                            type="button"
                            onClick={() => {
                              setFilterUser(option.key);
                              setIsUserFilterOpen(false);
                            }}
                            className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11px] transition ${
                              isActive ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
                            }`}
                            style={{
                              boxShadow: isActive ? `inset 3px 0 0 ${option.color}` : undefined,
                            }}
                          >
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/80 shadow-sm"
                              style={{ backgroundColor: option.color }}
                            />
                            <span className="truncate font-medium">{option.displayName}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <select className={HEADER_CONTROL_CLASS} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
                <option value="desc">M&aacute;s recientes primero</option>
                <option value="asc">M&aacute;s antiguos primero</option>
              </select>

              {onSoftReload && (
                <button
                  type="button"
                  onClick={handleSoftReload}
                  disabled={isSoftReloading}
                  className={`${HEADER_BUTTON_CLASS} text-slate-500 hover:text-slate-800 disabled:opacity-40`}
                  title="Recargar ventas"
                >
                  <RefreshCw size={12} className={isSoftReloading ? 'animate-spin' : ''} />
                </button>
              )}

              <button
                type="button"
                onClick={clearFilters}
                className={`${HEADER_BUTTON_CLASS} text-slate-500 hover:text-slate-800`}
                title="Limpiar filtros"
              >
                <RotateCcw size={12} />
              </button>
            </div>
          </div>

          {/* TABLA DE VENTAS */}
          <div className="flex-1 overflow-auto custom-scrollbar">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200 font-black">
                <tr>
                  <th className="px-3 py-2.5 text-left">ID / Fecha</th>
                  <th className="px-3 py-2.5 text-left">Usuario</th>
                  <th className="px-3 py-2.5 text-left">Socio</th>
                  <th className="px-3 py-2.5 text-left">Detalle</th>
                  <th className="px-3 py-2.5 text-left">Pago</th>
                  <th className="px-3 py-2.5 text-right">Monto</th>
                  {hasHistoryActions && (
                    <th className="px-3 py-2.5 text-center">Acciones</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedTransactions.map((tx, index) => {
                  const isVoided = tx.status === 'voided';
                  const isDeleted = tx.status === 'deleted';
                  const isHistoric = tx.isHistoric;
                  const isRestored = tx.isRestored;
                  const restoredAt = tx.restoredAt;

                  let clientName = null;
                  let memberNum = null;
                  if (tx.client && typeof tx.client === 'object') {
                    clientName = tx.client.name;
                    memberNum = tx.client.memberNumber;
                  } else if (tx.client && typeof tx.client === 'string') {
                    clientName = tx.client;
                    memberNum = tx.memberNumber;
                  } else if (tx.memberName) {
                    clientName = tx.memberName;
                    memberNum = tx.memberNumber;
                  }
                  if (clientName === 'No asociado' || clientName === 'Consumidor Final') {
                    clientName = null;
                  }

                  return (
                    <tr
                      key={`${tx.id}-${index}`}
                      className={`transition-all duration-150 ${
                        isVoided ? 'bg-[#fef2f2] hover:bg-[#fee2e2]'
                                 : isDeleted ? 'bg-[#fff7ed] hover:bg-[#ffedd5]'
                                 : isHistoric ? 'bg-slate-50/30 hover:bg-slate-50'
                                 : 'hover:bg-[#f0f9ff]'
                      }`}
                    >
                      <td className="px-3 py-2 align-middle">
                        <div className="overflow-hidden text-[10px] leading-tight">
                          <div className="flex items-center gap-1.5">
                            <span className={`font-mono font-bold text-[11px] ${isVoided ? 'text-red-800 line-through' : isDeleted ? 'text-orange-800 line-through' : 'text-slate-800'}`}>
                              #{String(tx.id).padStart(6, '0')}
                            </span>
                            {isVoided && (
                              <span className="shrink-0 rounded border border-red-200 bg-red-100 px-1.5 py-[1px] text-[8px] font-black uppercase tracking-wider text-red-600">
                                Anulado
                              </span>
                            )}
                            {isDeleted && (
                              <span className="shrink-0 rounded border border-orange-200 bg-orange-100 px-1.5 py-[1px] text-[8px] font-black uppercase tracking-wider text-orange-700">
                                Eliminado
                              </span>
                            )}
                            {!isVoided && !isDeleted && tx.isModified && (
                              <span className="shrink-0 rounded border border-amber-200 bg-amber-100 px-1.5 py-[1px] text-[8px] font-black uppercase tracking-wider text-amber-700">
                                Modificada
                              </span>
                            )}
                            {!isVoided && !isDeleted && isRestored && (
                              <span className="shrink-0 rounded border border-emerald-200 bg-emerald-100 px-1.5 py-[1px] text-[8px] font-black uppercase tracking-wider text-emerald-600">
                                {restoredAt ? `Restaurado \u00B7 ${restoredAt}` : 'Restaurado'}
                              </span>
                            )}
                          </div>
                          <div className="text-slate-400 font-medium">{formatDisplayDate(tx.date)} {tx.timestamp || tx.time || ''}</div>
                        </div>
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <UserDisplayBadge
                          user={getHistoryBadgeUser(tx)}
                          fallbackText={tx.user}
                          className="text-[11px]"
                        />
                      </td>
                      <td className="px-3 py-2 align-middle">
                        {clientName ? (
                          <div className="text-[10px] leading-tight">
                            <div className="font-bold text-slate-800 text-[11px] truncate max-w-[120px]">{clientName}</div>
                            {memberNum && <div className="text-blue-600 font-medium">#{memberNum}</div>}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[10px] font-medium">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <div className="flex flex-col gap-0.5 max-w-[280px]">
                          {(tx.items || []).slice(0, 2).map((item, i) => {
                            const isReward = isRedemptionItem(item);
                            const comboItems = getComboIncludedItems(item);
                            const itemTitle = getHistoryItemTitle(item);

                            return (
                              <div key={i} className="text-[10px] leading-tight">
                                <div className="flex items-center gap-1">
                                  <span className="font-bold text-slate-700 shrink-0">
                                    {item.quantity || item.qty}x
                                  </span>
                                  <span className="truncate text-slate-600" title={itemTitle}>
                                    {itemTitle}
                                  </span>
                                  {isReward && (
                                    <span className="inline-flex items-center gap-0.5 rounded border border-emerald-200 bg-emerald-50 px-1 py-[1px] text-[8px] font-black text-emerald-700 shrink-0">
                                      <Gift size={9} />
                                      Canje
                                    </span>
                                  )}
                                  {comboItems.length > 0 && (
                                    <span className="inline-flex items-center rounded border border-purple-200 bg-purple-50 px-1 py-[1px] text-[8px] font-black text-purple-700 shrink-0">
                                      Combo ({comboItems.length})
                                    </span>
                                  )}
                                </div>
                                {comboItems.length > 0 && (
                                  <div className="pl-4 text-[9px] text-slate-400 truncate" title={comboItems.map((ci) => `${ci.appliedQuantity}x ${ci.name || ci.title || 'Producto'}`).join(', ')}>
                                    ↳ {comboItems.map((ci) => `${ci.appliedQuantity}x ${ci.name || ci.title || 'Producto'}`).join(', ')}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {(tx.items || []).length > 2 && (
                            <span className="text-[9px] font-bold text-blue-600">
                              +{(tx.items || []).length - 2} productos m&aacute;s...
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <div className="flex flex-col gap-0.5">
                          {getPaymentBreakdownDisplayItems(tx.paymentBreakdown, tx.payment, tx.installments, tx.cashReceived, tx.cashChange, tx.total).map((item, idx) => (
                            <span key={`${item.label}-${idx}`} className="inline-flex items-center text-[10px] font-semibold text-slate-600">
                              {item.label}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2 align-middle text-right font-black text-slate-800 text-xs">
                        <span className={isVoided ? 'line-through text-red-400' : isDeleted ? 'line-through text-orange-400' : ''}>
                          <FancyPrice amount={tx.total} />
                        </span>
                      </td>
                      {hasHistoryActions && (
                        <td className="px-3 py-2 align-middle text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => setSelectedTx(tx)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 shadow-2xs transition"
                              title="Ver detalle"
                            >
                              <Eye size={12} />
                            </button>
                            {!isVoided && !isDeleted && canEditSale && (
                              <button
                                type="button"
                                onClick={() => onEditTransaction?.(tx)}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 shadow-2xs transition"
                                title="Editar venta"
                              >
                                <Edit2 size={12} />
                              </button>
                            )}
                            {!isVoided && !isDeleted && canVoidSale && (
                              <button
                                type="button"
                                onClick={() => onDeleteTransaction?.(tx)}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 shadow-2xs transition"
                                title="Anular venta"
                              >
                                <XCircle size={12} />
                              </button>
                            )}
                            {isVoided && canRestoreSale && (
                              <button
                                type="button"
                                onClick={() => onRestoreTransaction?.(tx)}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 shadow-2xs transition"
                                title="Restaurar venta"
                              >
                                <RotateCcw size={12} />
                              </button>
                            )}
                            {(isVoided || isDeleted) && canDeleteSale && (
                              <button
                                type="button"
                                onClick={() => onDeleteTransaction?.(tx)}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-300 bg-slate-100 text-slate-700 hover:bg-red-600 hover:text-white shadow-2xs transition"
                                title="Eliminar permanentemente"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {filteredTransactions.length === 0 && (
                  <tr>
                    <td colSpan={hasHistoryActions ? 7 : 6} className="text-center py-16">
                      <div className="flex flex-col items-center justify-center text-slate-400">
                        <History size={32} className="mb-2 opacity-50" />
                        <p className="text-sm font-medium">{hasActiveFilters ? 'No se encontraron ventas con estos filtros.' : 'No hay historial de ventas disponible.'}</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {filteredTransactions.length > 0 && (
            <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[10px] font-semibold text-slate-500">
                    Mostrando <span className="font-black text-slate-700">{pageStart}</span> a <span className="font-black text-slate-700">{pageEnd}</span> de <span className="font-black text-slate-700">{filteredTransactions.length}</span> registros
                  </p>
                  <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-black text-slate-700">
                    50 por p&aacute;gina
                  </span>
                  <AsyncActionButton
                    type="button"
                    onAction={() => handleSoftReload()}
                    pending={isSoftReloading}
                    disabled={!onSoftReload || isSoftReloading}
                    loadingLabel="Recargando..."
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
                    title="Actualizar solo el historial de transacciones"
                  >
                    <RefreshCw size={12} className={isSoftReloading ? 'animate-spin' : ''} />
                    Soft reload
                  </AsyncActionButton>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  <div className="flex items-center gap-1">
                    {visiblePageNumbers.map((pageNumber) => (
                      <button
                        key={pageNumber}
                        type="button"
                        onClick={() => setCurrentPage(pageNumber)}
                        className={`min-w-[30px] rounded-lg border px-2 py-1 text-[10px] font-black transition ${
                          pageNumber === currentPage
                            ? 'border-blue-200 bg-blue-50 text-blue-700'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {pageNumber}
                      </button>
                    ))}
                  </div>
                  <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-black text-slate-700">
                    P&aacute;gina {currentPage}{remoteTransactionsHasMore ? '+' : ` de ${totalPages}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => prev + 1)}
                    disabled={!canGoNextPage}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* TOOLBAR Y FILTROS DE GASTOS */}
          <div className="border-b bg-slate-50 px-3 py-2 shrink-0">
            <div className="history-filter-scroll flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-1 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-transparent" style={{ scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 transparent' }}>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600 shadow-sm">
                <TrendingDown size={16} />
              </div>

              <span className={`${HEADER_CONTROL_CLASS} inline-flex items-center gap-1.5`}>
                <span>{expenseStats.count} gastos</span>
                <span className="text-slate-300">•</span>
                <span className="text-rose-600"><FancyPrice amount={expenseStats.total} /></span>
              </span>

              <div className="relative min-w-[240px] flex-1 shrink-0">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar concepto, categoría, usuario..."
                  className={`${HEADER_ICON_CONTROL_CLASS} w-full`}
                  value={expenseSearchQuery}
                  onChange={(e) => setExpenseSearchQuery(e.target.value)}
                />
              </div>

              <select className={HEADER_CONTROL_CLASS} value={expenseViewMode} onChange={(e) => setExpenseViewMode(e.target.value)}>
                <option value="all">Todas las fechas</option>
                <option value="today">Solo Hoy</option>
                <option value="yesterday">Ayer</option>
                <option value="7d">Últimos 7 días</option>
                <option value="30d">Últimos 30 días</option>
                <option value="month">Este mes</option>
              </select>

              <div className={`${HEADER_CONTROL_CLASS} flex items-center gap-1.5 px-2`}>
                <Calendar size={12} className="text-slate-400" />
                <input type="date" className="h-full bg-transparent text-[11px] font-bold text-slate-700 outline-none cursor-pointer" value={expenseDateStart} onChange={(e) => setExpenseDateStart(e.target.value)} title="Desde"/>
                <span className="text-[10px] text-slate-300">a</span>
                <input type="date" className="h-full bg-transparent text-[11px] font-bold text-slate-700 outline-none cursor-pointer" value={expenseDateEnd} onChange={(e) => setExpenseDateEnd(e.target.value)} title="Hasta"/>
              </div>

              <select className={`${HEADER_CONTROL_CLASS} cursor-pointer`} value={expenseCategoryFilter} onChange={(e) => setExpenseCategoryFilter(e.target.value)}>
                <option value="">Todas las Categorías</option>
                {expenseCategoriesList.map((c) => (<option key={c} value={c}>{c}</option>))}
              </select>

              <div className="relative shrink-0">
                 <Filter size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                 <select className={`${HEADER_ICON_CONTROL_CLASS} appearance-none cursor-pointer`} value={expensePaymentFilter} onChange={(e) => setExpensePaymentFilter(e.target.value)}>
                   <option value="">Método de Pago</option>
                   {PAYMENT_METHODS.map((m) => (<option key={m.id} value={m.id}>{m.label}</option>))}
                 </select>
              </div>

              <div className="relative shrink-0" ref={expenseUserFilterRef}>
                <button
                  type="button"
                  onClick={() => setIsExpenseUserFilterOpen((prev) => !prev)}
                  className={`${HEADER_CONTROL_CLASS} flex min-w-[160px] cursor-pointer items-center justify-between gap-2`}
                >
                  {selectedExpenseUserFilter ? (
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/80 shadow-sm"
                        style={{ backgroundColor: selectedExpenseUserFilter.color }}
                      />
                      <span className="truncate text-slate-700">{selectedExpenseUserFilter.displayName}</span>
                    </span>
                  ) : (
                    <span className="text-slate-700">Todos los Usuarios</span>
                  )}
                  <ChevronDown size={14} className={`text-slate-400 transition-transform ${isExpenseUserFilterOpen ? 'rotate-180' : ''}`} />
                </button>

                {isExpenseUserFilterOpen && (
                  <div className="absolute right-0 top-full z-20 mt-1.5 w-[240px] rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                    <button
                      type="button"
                      onClick={() => {
                        setExpenseUserFilter('');
                        setIsExpenseUserFilterOpen(false);
                      }}
                      className={`flex w-full items-center rounded-lg px-2.5 py-2 text-left text-[11px] font-medium transition ${
                        !selectedExpenseUserFilter ? 'bg-slate-100 text-slate-800' : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      Todos los Usuarios
                    </button>

                    <div className="mt-1 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                      {expenseUserFilterOptions.map((option) => {
                        const isActive = selectedExpenseUserFilter?.key === option.key;
                        return (
                          <button
                            key={option.key}
                            type="button"
                            onClick={() => {
                              setExpenseUserFilter(option.key);
                              setIsExpenseUserFilterOpen(false);
                            }}
                            className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11px] transition ${
                              isActive ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
                            }`}
                            style={{
                              boxShadow: isActive ? `inset 3px 0 0 ${option.color}` : undefined,
                            }}
                          >
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/80 shadow-sm"
                              style={{ backgroundColor: option.color }}
                            />
                            <span className="truncate font-medium">{option.displayName}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <select className={HEADER_CONTROL_CLASS} value={expenseSortOrder} onChange={(e) => setExpenseSortOrder(e.target.value)}>
                <option value="date_desc">M&aacute;s recientes primero</option>
                <option value="date_asc">M&aacute;s antiguos primero</option>
                <option value="amount_desc">Mayor importe</option>
                <option value="amount_asc">Menor importe</option>
              </select>

              <button
                type="button"
                onClick={handleExportExpensesExcel}
                className={`${HEADER_BUTTON_CLASS} text-emerald-700 bg-emerald-50/70 border-emerald-200 hover:bg-emerald-100/70 cursor-pointer`}
                title="Exportar a Excel"
              >
                <Download size={13} />
                <span>Excel</span>
              </button>

              <button
                type="button"
                onClick={resetExpenseFilters}
                className={`${HEADER_BUTTON_CLASS} text-slate-500 hover:text-slate-800 cursor-pointer`}
                title="Limpiar filtros"
              >
                <RotateCcw size={12} />
              </button>
            </div>
          </div>

          {/* KPI CARDS RESUMEN DE GASTOS */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 p-3 bg-slate-50/50 border-b border-slate-100 shrink-0">
            <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-xs">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Total Egresos</span>
              <span className="text-sm font-black text-rose-600 block mt-0.5"><FancyPrice amount={expenseStats.total} /></span>
            </div>
            <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-xs">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Movimientos</span>
              <span className="text-sm font-black text-slate-800 block mt-0.5">{expenseStats.count} registros</span>
            </div>
            <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-xs">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Gasto Promedio</span>
              <span className="text-sm font-black text-slate-800 block mt-0.5"><FancyPrice amount={expenseStats.avg} /></span>
            </div>
            <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-xs">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Rubro Mayor</span>
              <span className="text-sm font-black text-purple-700 truncate block mt-0.5" title={expenseStats.topCat}>{expenseStats.topCat}</span>
            </div>
          </div>

          {/* TABLA DE GASTOS */}
          <div className="flex-1 overflow-auto custom-scrollbar">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200 font-black">
                <tr>
                  <th className="px-3 py-2.5 text-left">ID / Fecha</th>
                  <th className="px-3 py-2.5 text-left">Concepto / Detalle</th>
                  <th className="px-3 py-2.5 text-left">Categor&iacute;a</th>
                  <th className="px-3 py-2.5 text-left">Medio de Pago</th>
                  <th className="px-3 py-2.5 text-left">Usuario</th>
                  <th className="px-3 py-2.5 text-right">Importe</th>
                  <th className="px-3 py-2.5 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-12 text-center text-slate-400">
                      <FileText size={32} className="mx-auto mb-2 text-slate-300" />
                      <p className="font-bold text-sm text-slate-600">No se encontraron gastos</p>
                      <p className="text-xs text-slate-400 mt-1">Prueba cambiando los filtros o registra un nuevo gasto.</p>
                    </td>
                  </tr>
                ) : (
                  paginatedExpenses.map((exp, index) => {
                    const expDate = exp.parsedDate instanceof Date && !Number.isNaN(exp.parsedDate.getTime()) ? exp.parsedDate : null;
                    const catStyle = getExpenseCategoryBadgeStyle(exp.category);
                    const userName = exp.user || exp.user_name || exp.userName || 'Sistema';

                    return (
                      <tr
                        key={exp.id || index}
                        className="hover:bg-slate-50/80 transition-colors"
                      >
                        <td className="px-3 py-2 align-middle">
                          <div className="text-[11px] font-mono font-bold text-slate-800">
                            #{String(exp.id || index + 1).padStart(5, '0')}
                          </div>
                          <div className="text-[10px] text-slate-400 font-medium">
                            {expDate ? expDate.toLocaleDateString('es-AR') : exp.date || '--'}{' '}
                            {expDate ? expDate.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : exp.time || ''}
                          </div>
                        </td>
                        <td className="px-3 py-2 align-middle max-w-[280px]">
                          <div className="font-bold text-slate-800 text-[11px] truncate" title={exp.note || exp.description || 'Sin concepto'}>
                            {exp.note || exp.description || 'Sin concepto'}
                          </div>
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black border ${catStyle}`}>
                            {exp.category || 'Otros'}
                          </span>
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600">
                            {exp.paymentMethod || exp.payment_method || 'Efectivo'}
                          </span>
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <UserDisplayBadge
                            user={{ name: userName, role: exp.userRole || exp.user_role }}
                            fallbackText={userName}
                            className="text-[11px]"
                          />
                        </td>
                        <td className="px-3 py-2 align-middle text-right font-black text-rose-600 text-xs">
                          - <FancyPrice amount={exp.amount} />
                        </td>
                        <td className="px-3 py-2 align-middle text-center">
                          <button
                            type="button"
                            onClick={() => onViewExpense?.(exp)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 shadow-2xs transition cursor-pointer"
                            title="Ver / Editar Gasto"
                          >
                            <Edit2 size={12} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* PAGINACIÓN DE GASTOS */}
          {filteredExpensesList.length > 0 && (
            <div className="border-t border-slate-200 bg-white px-3 py-2 shrink-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-slate-500">
                  Mostrando {paginatedExpenses.length} de {filteredExpensesList.length} gastos
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setExpenseCurrentPage((prev) => Math.max(prev - 1, 1))}
                    disabled={expenseCurrentPage <= 1}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                  >
                    Anterior
                  </button>
                  <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-black text-slate-700">
                    P&aacute;gina {expenseCurrentPage} de {expenseTotalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setExpenseCurrentPage((prev) => Math.min(prev + 1, expenseTotalPages))}
                    disabled={expenseCurrentPage >= expenseTotalPages}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal de Detalle */}
      <TransactionDetailModal
        transaction={selectedTx}
        onClose={() => setSelectedTx(null)}
        currentUser={currentUser}
        userCatalog={userCatalog}
        members={members}
        onEditTransaction={onEditTransaction}
        onDeleteTransaction={onDeleteTransaction}
        onViewTicket={onViewTicket}
      />
    </div>
  );
}
