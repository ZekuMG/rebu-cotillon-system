import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Lock,
  Clock,
  ChevronRight,
  ArrowLeft,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';
import Swal from 'sweetalert2';
import logoRebuImg from './assets/logo-rebu.jpg';

// --- CONEXIÓN A LA NUBE ---
import { supabase } from './supabase/client';
import { uploadProductImage, deleteProductImage, uploadProductThumbFromSource } from './utils/storage';
import { formatDateAR, formatNumber, formatTimeAR, formatTimeFullAR, isTestRecord } from './utils/helpers';
import {
  mapAgendaContactRecord,
  mapAgendaContactRecords,
  mapBudgetRecords,
  mapCashClosureRecord,
  mapCashClosureRecords,
  mapCategoryRecords,
  mapExpenseRecords,
  mapInventoryRecords,
  mapLogRecords,
  mapMemberRecords,
  mapOfferRecords,
  mapOrderRecords,
  mapRegisterState,
  mapRewardRecords,
  mapSaleRecords,
  safeCloudData,
} from './utils/cloudMappers';
import {
  CLOUD_SELECTS,
  DASHBOARD_LOG_LIMIT,
  HISTORY_LOG_ACTIONS,
} from './utils/cloudSelects';
import {
  extractSchemaMissingColumn,
  fetchAllCloudRowsWithSelectFallback,
  removeColumnFromSelect,
  runSelectWithSchemaFallback,
} from './utils/supabaseSchemaFallback';
import { buildBudgetExportConfig, buildExportItemsFromSnapshot, deriveOrderStatus, hydrateBudgetSnapshot } from './utils/budgetHelpers';
import { buildLegacyOfferPayload } from './utils/offerHelpers';
import {
  bootstrapAppUsers,
  buildLegacyBootstrapSeed,
  buildLegacyUsers,
  buildUserCatalog,
  createAppUser,
  fetchAppUsersPublic,
  getRoleLabel,
  hasOwnerAccess,
  setAppUserActive,
  updateAppUserPassword,
  updateAppUserPermissions,
  updateAppUserProfile,
  verifyAppUserLogin,
} from './utils/appUsers';
import {
  canAccessTab,
  canEditUserProfile,
  canManageUserPermissions,
  canToggleUserActiveState,
  getDefaultTabForUser,
  hasPermission,
} from './utils/userPermissions';
import { resolveUserPresentation } from './utils/userPresentation';
import {
  createOrderPaymentEntry,
  createOrderPaymentLine,
  flattenOrderPaymentHistory,
  getPaymentBreakdownTotals,
  getPaymentMethodTotals,
  getOrderPaymentHistorySummary,
  getPaymentSummary,
  getPrimaryPaymentInfo,
  normalizePaymentBreakdown,
  normalizeOrderPaymentHistory,
} from './utils/paymentBreakdown';

import { USERS } from './data';
import Sidebar from './components/Sidebar';

// Vistas
import DashboardView from './views/DashboardView';
import InventoryView from './views/InventoryView';
import POSView from './views/POSView';
import ClientsView from './views/ClientsView';
import AgendaView from './views/AgendaView';
import HistoryView from './views/HistoryView';
import LogsView from './views/LogsView';
import ExtrasView from './views/ExtrasView';
import ReportsHistoryView from './views/ReportsHistoryView';
import BulkEditorView from './views/BulkEditorView';
import OrdersView from './views/OrdersView';
import SessionsView from './views/SessionsView';
import UserSettingsView from './views/UserSettingsView';
import UserManagementView from './views/UserManagementView';
import UserAvatar from './components/UserAvatar';

// Modales y Componentes de Impresión
import {
  OpeningBalanceModal,
  ClosingTimeModal,
  AddProductModal,
  EditProductModal,
  EditTransactionModal,
  ImageModal,
  RefundModal,
  CloseCashModal,
  SaleSuccessModal,
  AutoCloseAlertModal,
  DeleteProductModal,
  NotificationModal,
  TicketModal,
  BarcodeNotFoundModal,
  BarcodeDuplicateModal,
} from './components/AppModals';

import { ExpenseModal } from './components/modals/ExpenseModal';
import { MemberIdentityPanel } from './components/modals/MemberIdentityPanel';
import { TicketPrintLayout } from './components/TicketPrintLayout';
import { TransactionDetailModal } from './components/modals/HistoryModals'; 
import { ExportPdfLayout } from './components/ExportPdfLayout';

// Código de barras
import { useBarcodeScanner } from './hooks/useBarcodeScanner';

const OFFLINE_CORE_CACHE_KEY = 'party_cloud_snapshot_core_v2';
const OFFLINE_TRANSACTIONS_CACHE_KEY = 'party_cloud_snapshot_transactions_v1';
const OFFLINE_DASHBOARD_CACHE_KEY = 'party_cloud_snapshot_dashboard_v2';
const OFFLINE_HISTORY_CACHE_KEY = 'party_cloud_snapshot_history_v1';
const OFFLINE_ORDERS_CACHE_KEY = 'party_cloud_snapshot_orders_v2';
const OFFLINE_REPORTS_CACHE_KEY = 'party_cloud_snapshot_reports_v1';
const OFFLINE_SHARED_USERS_CACHE_KEY = 'party_shared_users_snapshot_v1';
const OFFLINE_POS_CACHE_KEY = 'party_pos_snapshot_v1';
const OFFLINE_LOGIN_CACHE_KEY = 'party_offline_login_verifiers_v1';
const LEGACY_OFFLINE_CACHE_KEY = 'party_cloud_snapshot_v1';
const USER_SETTINGS_KEY = 'party_user_settings_v1';
const APP_TEXT_ENCODING_VERSION = 'utf8-clean';
const CLOUD_FETCH_BATCH_SIZE = 200;
const CLOUD_RECENT_SYNC_LIMIT = 250;
const HISTORY_LOG_INITIAL_LIMIT = 50;
const HISTORY_LOG_RECENT_SYNC_LIMIT = 50;
const SESSION_ABSENT_MS = 10 * 60 * 1000;
const SESSION_EXPIRED_MS = 60 * 60 * 1000;
const SESSION_ACTIVITY_UPDATE_THROTTLE_MS = 5000;
const APP_USERS_FRESHNESS_MS = 15 * 1000;
const OFFLINE_BOOT_TIMEOUT_MS = 5500;
const OFFLINE_LOGIN_TIMEOUT_MS = 6500;
const REPORT_LOG_ACTIONS = ['Cierre de Caja', 'Cierre Automático'];

const isBrowserOffline = () =>
  typeof navigator !== 'undefined' && navigator.onLine === false;

const withTimeout = (promise, timeoutMs, label = 'Operacion') =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => {
        reject(new Error(`${label} excedio el tiempo de espera offline.`));
      }, timeoutMs);
    }),
  ]);

const verifyCloudConnection = async () => {
  if (isBrowserOffline()) return false;

  const { error } = await withTimeout(
    supabase.from('register_state').select('id').eq('id', 1).limit(1),
    OFFLINE_LOGIN_TIMEOUT_MS,
    'Reconexión'
  );

  if (error) throw error;
  return true;
};

const isRecoverableCloudError = (error) => {
  const errorText = [
    error?.message,
    error?.details,
    error?.hint,
    error?.code,
    error?.name,
  ].filter(Boolean).join(' ');

  return (
    isBrowserOffline() ||
    /timeout|tiempo de espera|failed to fetch|network|load failed|abort|402|egress|quota|restricted/i.test(errorText)
  );
};

const shouldIgnoreNestedTestDetectionForLog = (action) => {
  const normalizedAction = String(action || '').toLowerCase();
  return normalizedAction.includes('cierre de caja') || normalizedAction.includes('cierre autom');
};

const MODULE_LOAD_DEFAULT_STATE = {
  core: { status: 'idle', lastLoadedAt: 0, dirty: false },
  transactions: { status: 'idle', lastLoadedAt: 0, dirty: false },
  dashboard: { status: 'idle', lastLoadedAt: 0, dirty: false },
  history: { status: 'idle', lastLoadedAt: 0, dirty: false },
  orders: { status: 'idle', lastLoadedAt: 0, dirty: false },
  reports: { status: 'idle', lastLoadedAt: 0, dirty: false },
};

const MODULE_FRESHNESS_MS = {
  core: 10 * 60 * 1000,
  transactions: 15 * 60 * 1000,
  dashboard: 10 * 60 * 1000,
  history: 15 * 60 * 1000,
  orders: 15 * 60 * 1000,
  reports: 20 * 60 * 1000,
};

const TAB_TO_DATA_MODULE = {
  dashboard: 'dashboard',
  clients: 'transactions',
  history: 'history',
  reports: 'reports',
  orders: 'orders',
};

const sharedUsersCache = {
  promise: null,
  users: null,
  scope: 'active',
  authMode: 'legacy',
  loadedAt: 0,
};

let initialBootstrapPromise = null;

const canServeSharedUsersScope = (cachedScope, requestedScope) =>
  cachedScope === 'all' || cachedScope === requestedScope;

const isModuleStateFresh = (state, maxAgeMs) => {
  if (!state || state.status !== 'loaded' || state.dirty) return false;
  const lastLoadedAt = Number(state.lastLoadedAt || 0);
  if (lastLoadedAt <= 0) return false;
  return Date.now() - lastLoadedAt < maxAgeMs;
};

const fetchAllCloudRows = async (buildQuery, batchSize = CLOUD_FETCH_BATCH_SIZE) => {
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await buildQuery().range(from, from + batchSize - 1);
    if (error) return { data: null, error };

    const page = Array.isArray(data) ? data : [];
    rows.push(...page);

    if (page.length < batchSize) break;
    from += page.length;
  }

  return { data: rows, error: null };
};

const fetchRecentRowsWithSelectFallback = async (
  buildQuery,
  selectColumns,
  limit = CLOUD_RECENT_SYNC_LIMIT
) =>
  runSelectWithSchemaFallback(
    (safeSelect) => buildQuery(safeSelect).limit(limit),
    selectColumns
  );

const fetchRecentRowsWithOptionalActiveFilter = async ({
  table,
  selectColumns,
  orderBy,
  orderDirection = 'desc',
  additionalOrders = [],
  limit = CLOUD_RECENT_SYNC_LIMIT,
}) => {
  let useActiveFilter = true;

  while (true) {
    const result = await runSelectWithSchemaFallback(
      (safeSelect) => {
        let query = supabase.from(table).select(safeSelect);
        if (useActiveFilter) {
          query = query.eq('is_active', true);
        }

        query = query.order(orderBy, { ascending: orderDirection === 'asc' });
        additionalOrders.forEach((entry) => {
          query = query.order(entry.column, { ascending: entry.ascending !== false });
        });
        return query.limit(limit);
      },
      selectColumns
    );

    if (!result.error) return result;

    const missingColumn = extractSchemaMissingColumn(result.error);
    if (missingColumn === 'is_active' && useActiveFilter) {
      useActiveFilter = false;
      continue;
    }

    return result;
  }
};

const getLatestCreatedAt = (records = []) =>
  (Array.isArray(records) ? records : []).reduce((latest, record) => {
    const candidate = record?.createdAt || record?.created_at || null;
    if (!candidate) return latest;
    if (!latest) return candidate;
    return new Date(candidate).getTime() > new Date(latest).getTime() ? candidate : latest;
  }, null);

const fetchRowsCreatedAfterWithSelectFallback = async (
  buildQuery,
  selectColumns,
  createdAfter
) =>
  runSelectWithSchemaFallback(
    (safeSelect) => buildQuery(safeSelect).gt('created_at', createdAfter),
    selectColumns
  );

const fetchRowsCreatedAfterWithOptionalActiveFilter = async ({
  table,
  selectColumns,
  createdAfter,
  orderBy = 'created_at',
  orderDirection = 'desc',
  additionalOrders = [],
}) => {
  let useActiveFilter = true;

  while (true) {
    const result = await runSelectWithSchemaFallback(
      (safeSelect) => {
        let query = supabase.from(table).select(safeSelect).gt('created_at', createdAfter);
        if (useActiveFilter) {
          query = query.eq('is_active', true);
        }

        query = query.order(orderBy, { ascending: orderDirection === 'asc' });
        additionalOrders.forEach((entry) => {
          query = query.order(entry.column, { ascending: entry.ascending !== false });
        });
        return query;
      },
      selectColumns
    );

    if (!result.error) return result;

    const missingColumn = extractSchemaMissingColumn(result.error);
    if (missingColumn === 'is_active' && useActiveFilter) {
      useActiveFilter = false;
      continue;
    }

    return result;
  }
};

const mergeLatestRecords = (existingRecords, incomingRecords) => {
  const existing = Array.isArray(existingRecords) ? existingRecords : [];
  const incoming = Array.isArray(incomingRecords) ? incomingRecords : [];
  if (incoming.length === 0) return existing;

  const incomingIds = new Set(
    incoming.map((record) => String(record?.id ?? '')).filter(Boolean)
  );

  return [
    ...incoming,
    ...existing.filter((record) => {
      const key = String(record?.id ?? '');
      return !key || !incomingIds.has(key);
    }),
  ];
};

const mapCashClosureReportFromLog = (log) => {
  const details = log?.details && typeof log.details === 'object' ? log.details : {};

  return {
    id: details.id || `log:${log?.id || Date.now()}`,
    logId: log?.id || null,
    date: details.date || log?.date || '--/--/--',
    openTime: details.openTime || '--:--',
    closeTime: details.closeTime || details.closingTime || log?.timestamp || '--:--',
    user: details.user || log?.user || 'Sistema',
    userId: log?.userId || details.userId || null,
    userRole: log?.userRole || details.userRole || null,
    type:
      details.type ||
      (String(log?.action || '').includes('Autom') ? 'Automático' : 'Manual'),
    openingBalance: Number(details.openingBalance || 0),
    totalSales: Number(details.totalSales || 0),
    finalBalance: Number(details.finalBalance || 0),
    totalCost: Number(details.totalCost || 0),
    totalExpenses: Number(details.totalExpenses || 0),
    netProfit: Number(details.netProfit || 0),
    salesCount: Number(details.salesCount || 0),
    averageTicket: Number(details.averageTicket || 0),
    paymentMethods: details.paymentMethods || {},
    itemsSold: Array.isArray(details.itemsSold) ? details.itemsSold : [],
    newClients: Array.isArray(details.newClients) ? details.newClients : [],
    expensesSnapshot: Array.isArray(details.expensesSnapshot) ? details.expensesSnapshot : [],
    transactionsSnapshot: Array.isArray(details.transactionsSnapshot) ? details.transactionsSnapshot : [],
    hasDetail: true,
    source: 'log',
    createdAt: log?.created_at || null,
  };
};

const hasUsableCloudResult = (result) => result.status === 'fulfilled' && !result.value?.error;

const fetchRowsWithOptionalActiveFilter = async ({
  table,
  selectColumns,
  orderBy,
  orderDirection = 'asc',
  additionalOrders = [],
}) => {
  let useActiveFilter = true;

  while (true) {
    const result = await fetchAllCloudRowsWithSelectFallback(
      (safeSelect) => {
        let query = supabase.from(table).select(safeSelect);
        if (useActiveFilter) {
          query = query.eq('is_active', true);
        }

        query = query.order(orderBy, { ascending: orderDirection === 'asc' });
        additionalOrders.forEach((entry) => {
          query = query.order(entry.column, { ascending: entry.ascending !== false });
        });
        return query;
      },
      selectColumns,
      CLOUD_FETCH_BATCH_SIZE
    );

    if (!result.error) return result;

    const missingColumn = extractSchemaMissingColumn(result.error);
    if (missingColumn === 'is_active' && useActiveFilter) {
      useActiveFilter = false;
      continue;
    }

    return result;
  }
};

const fetchCoreCloudPayload = async () => {
  const [
    prodResult,
    clientResult,
    agendaResult,
    catResult,
    rewardsResult,
    registerResult,
    offersResult,
  ] = await Promise.allSettled([
    fetchRowsWithOptionalActiveFilter({
      table: 'products',
      selectColumns: CLOUD_SELECTS.products,
      orderBy: 'title',
      additionalOrders: [{ column: 'id', ascending: true }],
    }),
    fetchRowsWithOptionalActiveFilter({
      table: 'clients',
      selectColumns: CLOUD_SELECTS.clients,
      orderBy: 'name',
      additionalOrders: [{ column: 'id', ascending: true }],
    }),
    fetchAllCloudRows(() =>
      supabase
        .from('agenda_contacts')
        .select(CLOUD_SELECTS.agendaContacts)
        .order('name')
        .order('id')
    ),
    fetchAllCloudRows(() =>
      supabase
        .from('categories')
        .select(CLOUD_SELECTS.categories)
        .order('name')
        .order('id')
    ),
    fetchAllCloudRows(() =>
      supabase
        .from('rewards')
        .select(CLOUD_SELECTS.rewards)
        .order('points_cost', { ascending: true })
        .order('id', { ascending: true })
    ),
    supabase.from('register_state').select(CLOUD_SELECTS.registerState).eq('id', 1).maybeSingle(),
    fetchAllCloudRows(() =>
      supabase
        .from('offers')
        .select(CLOUD_SELECTS.offers)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
    ),
  ]);

  const hasCloudConnection = [
    prodResult,
    clientResult,
    agendaResult,
    catResult,
    rewardsResult,
    registerResult,
    offersResult,
  ].some(hasUsableCloudResult);

  const prodData = safeCloudData(prodResult, 'productos');
  const clientData = safeCloudData(clientResult, 'clientes');
  const agendaData = safeCloudData(agendaResult, 'agenda');
  const catData = safeCloudData(catResult, 'categorias');
  const rewardsData = safeCloudData(rewardsResult, 'premios');
  const offersData = safeCloudData(offersResult, 'ofertas');

  let registerState = null;
  if (registerResult.status === 'fulfilled' && !registerResult.value.error) {
    registerState = registerResult.value.data;
  }

  if (!registerState && hasCloudConnection) {
    const { data: newState, error: upsertErr } = await supabase
      .from('register_state')
      .upsert([{ id: 1, is_open: false, opening_balance: 0, closing_time: '21:00' }], { onConflict: 'id' })
      .select(CLOUD_SELECTS.registerState)
      .maybeSingle();

    if (!upsertErr && newState) registerState = newState;
  }

  return {
    hasCloudConnection,
    inventory: prodData ? mapInventoryRecords(prodData) : null,
    members: clientData ? mapMemberRecords(clientData) : null,
    agendaContacts: agendaData ? mapAgendaContactRecords(agendaData) : null,
    categories: catData ? mapCategoryRecords(catData) : null,
    rewards: rewardsData ? mapRewardRecords(rewardsData) : null,
    offers: offersData ? mapOfferRecords(offersData) : null,
    registerState,
  };
};

const fetchTransactionsCloudPayload = async () => {
  const salesResult = await fetchAllCloudRowsWithSelectFallback(
    (selectColumns) =>
      supabase
        .from('sales')
        .select(selectColumns)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false }),
    CLOUD_SELECTS.sales,
    CLOUD_FETCH_BATCH_SIZE
  );

  const hasCloudConnection = !salesResult.error;
  const salesData = salesResult.error ? null : salesResult.data || [];

  if (salesResult.error) {
    console.error('Error en tabla [ventas]:', salesResult.error);
  }

  return {
    hasCloudConnection,
    transactions: salesData ? mapSaleRecords(salesData, []) : null,
  };
};

const fetchRecentTransactionsCloudPayload = async () => {
  const salesResult = await fetchRecentRowsWithSelectFallback(
    (selectColumns) =>
      supabase
        .from('sales')
        .select(selectColumns)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false }),
    CLOUD_SELECTS.sales,
    CLOUD_RECENT_SYNC_LIMIT
  );

  const hasCloudConnection = !salesResult.error;
  const salesData = salesResult.error ? null : salesResult.data || [];

  if (salesResult.error) {
    console.error('Error en tabla [ventas recientes]:', salesResult.error);
  }

  return {
    hasCloudConnection,
    transactions: salesData ? mapSaleRecords(salesData, []) : null,
  };
};

const fetchTransactionsCloudPayloadSince = async (createdAfter) => {
  const salesResult = await fetchRowsCreatedAfterWithSelectFallback(
    (selectColumns) =>
      supabase
        .from('sales')
        .select(selectColumns)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false }),
    CLOUD_SELECTS.sales,
    createdAfter
  );

  const hasCloudConnection = !salesResult.error;
  const salesData = salesResult.error ? null : salesResult.data || [];

  if (salesResult.error) {
    console.error('Error en tabla [ventas incrementales]:', salesResult.error);
  }

  return {
    hasCloudConnection,
    transactions: salesData ? mapSaleRecords(salesData, []) : null,
  };
};

const fetchDashboardCloudPayload = async () => {
  const [logsResult, expResult, closuresResult] = await Promise.allSettled([
    runSelectWithSchemaFallback(
      (selectColumns) =>
        supabase
          .from('logs')
          .select(selectColumns)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(DASHBOARD_LOG_LIMIT),
      CLOUD_SELECTS.logsSummary
    ),
    fetchAllCloudRowsWithSelectFallback(
      (selectColumns) =>
        supabase
          .from('expenses')
          .select(selectColumns)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false }),
      CLOUD_SELECTS.expenses,
      CLOUD_FETCH_BATCH_SIZE
    ),
    fetchAllCloudRowsWithSelectFallback(
      (selectColumns) =>
        supabase
          .from('cash_closures')
          .select(selectColumns)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false }),
      CLOUD_SELECTS.cashClosuresSummary,
      CLOUD_FETCH_BATCH_SIZE
    ),
  ]);

  const hasCloudConnection = [logsResult, expResult, closuresResult].some(hasUsableCloudResult);

  const logsData = safeCloudData(logsResult, 'logs');
  const expData = safeCloudData(expResult, 'gastos');
  const closuresData = safeCloudData(closuresResult, 'cash_closures');

  return {
    hasCloudConnection,
    dailyLogs: logsData ? mapLogRecords(logsData) : null,
    expenses: expData ? mapExpenseRecords(expData) : null,
    pastClosures: closuresData ? mapCashClosureRecords(closuresData) : null,
  };
};

const fetchRecentDashboardCloudPayload = async () => {
  const [logsResult, expResult, closuresResult] = await Promise.allSettled([
    runSelectWithSchemaFallback(
      (selectColumns) =>
        supabase
          .from('logs')
          .select(selectColumns)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(DASHBOARD_LOG_LIMIT),
      CLOUD_SELECTS.logsSummary
    ),
    fetchRecentRowsWithSelectFallback(
      (selectColumns) =>
        supabase
          .from('expenses')
          .select(selectColumns)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false }),
      CLOUD_SELECTS.expenses,
      CLOUD_RECENT_SYNC_LIMIT
    ),
    fetchRecentRowsWithSelectFallback(
      (selectColumns) =>
        supabase
          .from('cash_closures')
          .select(selectColumns)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false }),
      CLOUD_SELECTS.cashClosuresSummary,
      CLOUD_RECENT_SYNC_LIMIT
    ),
  ]);

  const hasCloudConnection = [logsResult, expResult, closuresResult].some(hasUsableCloudResult);
  const logsData = safeCloudData(logsResult, 'logs recientes');
  const expData = safeCloudData(expResult, 'gastos recientes');
  const closuresData = safeCloudData(closuresResult, 'cash_closures recientes');

  return {
    hasCloudConnection,
    dailyLogs: logsData ? mapLogRecords(logsData) : null,
    expenses: expData ? mapExpenseRecords(expData) : null,
    pastClosures: closuresData ? mapCashClosureRecords(closuresData) : null,
  };
};

const fetchDashboardCloudPayloadSince = async ({ logsAfter, expensesAfter, closuresAfter }) => {
  const [logsResult, expResult, closuresResult] = await Promise.allSettled([
    logsAfter
      ? fetchRowsCreatedAfterWithSelectFallback(
          (selectColumns) =>
            supabase
              .from('logs')
              .select(selectColumns)
              .order('created_at', { ascending: false })
              .order('id', { ascending: false }),
          CLOUD_SELECTS.logsSummary,
          logsAfter
        )
      : Promise.resolve({ data: [], error: null }),
    expensesAfter
      ? fetchRowsCreatedAfterWithSelectFallback(
          (selectColumns) =>
            supabase
              .from('expenses')
              .select(selectColumns)
              .order('created_at', { ascending: false })
              .order('id', { ascending: false }),
          CLOUD_SELECTS.expenses,
          expensesAfter
        )
      : fetchAllCloudRowsWithSelectFallback(
          (selectColumns) =>
            supabase
              .from('expenses')
              .select(selectColumns)
              .order('created_at', { ascending: false })
              .order('id', { ascending: false }),
          CLOUD_SELECTS.expenses,
          CLOUD_FETCH_BATCH_SIZE
        ),
    closuresAfter
      ? fetchRowsCreatedAfterWithSelectFallback(
          (selectColumns) =>
            supabase
              .from('cash_closures')
              .select(selectColumns)
              .order('created_at', { ascending: false })
              .order('id', { ascending: false }),
          CLOUD_SELECTS.cashClosuresSummary,
          closuresAfter
        )
      : Promise.resolve({ data: [], error: null }),
  ]);

  const hasCloudConnection = [logsResult, expResult, closuresResult].some(hasUsableCloudResult);
  const logsData = safeCloudData(logsResult, 'logs incrementales');
  const expData = safeCloudData(expResult, 'gastos incrementales');
  const closuresData = safeCloudData(closuresResult, 'cash_closures incrementales');

  return {
    hasCloudConnection,
    dailyLogs: logsData ? mapLogRecords(logsData) : null,
    expenses: expData ? mapExpenseRecords(expData) : null,
    pastClosures: closuresData ? mapCashClosureRecords(closuresData) : null,
  };
};

const fetchHistoryCloudPayload = async () => {
  const historyLogsResult = await fetchRecentRowsWithSelectFallback(
    (selectColumns) =>
      supabase
        .from('logs')
        .select(selectColumns)
        .in('action', HISTORY_LOG_ACTIONS)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false }),
    CLOUD_SELECTS.logs,
    HISTORY_LOG_INITIAL_LIMIT
  );

  const hasCloudConnection = !historyLogsResult.error;
  const historyLogsData = historyLogsResult.error ? null : historyLogsResult.data || [];

  return {
    hasCloudConnection,
    historyLogs: historyLogsData ? mapLogRecords(historyLogsData) : null,
  };
};

const fetchRecentHistoryCloudPayload = async () => {
  const historyLogsResult = await fetchRecentRowsWithSelectFallback(
    (selectColumns) =>
      supabase
        .from('logs')
        .select(selectColumns)
        .in('action', HISTORY_LOG_ACTIONS)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false }),
    CLOUD_SELECTS.logs,
    HISTORY_LOG_RECENT_SYNC_LIMIT
  );

  const hasCloudConnection = !historyLogsResult.error;
  const historyLogsData = historyLogsResult.error ? null : historyLogsResult.data || [];

  return {
    hasCloudConnection,
    historyLogs: historyLogsData ? mapLogRecords(historyLogsData) : null,
  };
};

const fetchHistoryCloudPayloadSince = async (createdAfter) => {
  const historyLogsResult = await fetchRowsCreatedAfterWithSelectFallback(
    (selectColumns) =>
      supabase
        .from('logs')
        .select(selectColumns)
        .in('action', HISTORY_LOG_ACTIONS)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false }),
    CLOUD_SELECTS.logs,
    createdAfter
  );

  const hasCloudConnection = !historyLogsResult.error;
  const historyLogsData = historyLogsResult.error ? null : historyLogsResult.data || [];

  return {
    hasCloudConnection,
    historyLogs: historyLogsData ? mapLogRecords(historyLogsData) : null,
  };
};

const fetchReportsCloudPayload = async () => {
  const closuresResult = await fetchAllCloudRowsWithSelectFallback(
    (selectColumns) =>
      supabase
        .from('cash_closures')
        .select(selectColumns)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false }),
    CLOUD_SELECTS.cashClosuresSummary,
    CLOUD_FETCH_BATCH_SIZE
  );

  const hasCloudConnection = !closuresResult.error;
  const closureData = closuresResult.error ? null : closuresResult.data || [];

  return {
    hasCloudConnection,
    pastClosures: closureData ? mapCashClosureRecords(closureData) : null,
  };
};

const fetchRecentReportsCloudPayload = async () => {
  const closuresResult = await fetchRecentRowsWithSelectFallback(
    (selectColumns) =>
      supabase
        .from('cash_closures')
        .select(selectColumns)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false }),
    CLOUD_SELECTS.cashClosuresSummary,
    CLOUD_RECENT_SYNC_LIMIT
  );

  const hasCloudConnection = !closuresResult.error;
  const closureData = closuresResult.error ? null : closuresResult.data || [];

  return {
    hasCloudConnection,
    pastClosures: closureData ? mapCashClosureRecords(closureData) : null,
  };
};

const fetchReportsCloudPayloadSince = async (createdAfter) => {
  const closuresResult = await fetchRowsCreatedAfterWithSelectFallback(
    (selectColumns) =>
      supabase
        .from('cash_closures')
        .select(selectColumns)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false }),
    CLOUD_SELECTS.cashClosuresSummary,
    createdAfter
  );

  const hasCloudConnection = !closuresResult.error;
  const closureData = closuresResult.error ? null : closuresResult.data || [];

  return {
    hasCloudConnection,
    pastClosures: closureData ? mapCashClosureRecords(closureData) : null,
  };
};

const fetchCashClosureDetailById = async (closureId) => {
  if (!closureId) return null;

  try {
    const { data: logData, error: logError } = await runSelectWithSchemaFallback(
      (selectColumns) =>
        supabase
          .from('logs')
          .select(selectColumns)
          .in('action', REPORT_LOG_ACTIONS)
          .contains('details', { id: closureId })
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle(),
      CLOUD_SELECTS.logs
    );

    if (!logError && logData) {
      const mappedLog = mapLogRecords([logData])[0];
      if (mappedLog?.details && typeof mappedLog.details === 'object') {
        return mapCashClosureReportFromLog(mappedLog);
      }
    }
  } catch (error) {
    console.warn('No se pudo leer el reporte desde el log de acciones. Seguimos con cash_closures.', error);
  }

  const { data, error } = await runSelectWithSchemaFallback(
    (selectColumns) =>
      supabase
        .from('cash_closures')
        .select(selectColumns)
        .eq('id', closureId)
        .maybeSingle(),
    CLOUD_SELECTS.cashClosuresDetail,
  );

  if (error) throw error;
  return data ? mapCashClosureRecord(data) : null;
};

const fetchOrdersCloudPayload = async () => {
  const [budgetsResult, ordersResult] = await Promise.allSettled([
    fetchRowsWithOptionalActiveFilter({
      table: 'budgets',
      selectColumns: CLOUD_SELECTS.budgets,
      orderBy: 'created_at',
      orderDirection: 'desc',
      additionalOrders: [{ column: 'id', ascending: false }],
    }),
    fetchRowsWithOptionalActiveFilter({
      table: 'orders',
      selectColumns: CLOUD_SELECTS.orders,
      orderBy: 'created_at',
      orderDirection: 'desc',
      additionalOrders: [{ column: 'id', ascending: false }],
    }),
  ]);

  const hasCloudConnection = [budgetsResult, ordersResult].some(hasUsableCloudResult);
  const budgetsData = safeCloudData(budgetsResult, 'presupuestos');
  const ordersData = safeCloudData(ordersResult, 'pedidos');

  return {
    hasCloudConnection,
    budgets: budgetsData ? mapBudgetRecords(budgetsData) : null,
    orders: ordersData ? mapOrderRecords(ordersData) : null,
  };
};

const fetchRecentOrdersCloudPayload = async () => {
  const [budgetsResult, ordersResult] = await Promise.allSettled([
    fetchRecentRowsWithOptionalActiveFilter({
      table: 'budgets',
      selectColumns: CLOUD_SELECTS.budgets,
      orderBy: 'created_at',
      orderDirection: 'desc',
      additionalOrders: [{ column: 'id', ascending: false }],
      limit: CLOUD_RECENT_SYNC_LIMIT,
    }),
    fetchRecentRowsWithOptionalActiveFilter({
      table: 'orders',
      selectColumns: CLOUD_SELECTS.orders,
      orderBy: 'created_at',
      orderDirection: 'desc',
      additionalOrders: [{ column: 'id', ascending: false }],
      limit: CLOUD_RECENT_SYNC_LIMIT,
    }),
  ]);

  const hasCloudConnection = [budgetsResult, ordersResult].some(hasUsableCloudResult);
  const budgetsData = safeCloudData(budgetsResult, 'presupuestos recientes');
  const ordersData = safeCloudData(ordersResult, 'pedidos recientes');

  return {
    hasCloudConnection,
    budgets: budgetsData ? mapBudgetRecords(budgetsData) : null,
    orders: ordersData ? mapOrderRecords(ordersData) : null,
  };
};

const fetchOrdersCloudPayloadSince = async ({ budgetsAfter, ordersAfter }) => {
  const [budgetsResult, ordersResult] = await Promise.allSettled([
    budgetsAfter
      ? fetchRowsCreatedAfterWithOptionalActiveFilter({
          table: 'budgets',
          selectColumns: CLOUD_SELECTS.budgets,
          createdAfter: budgetsAfter,
          orderBy: 'created_at',
          orderDirection: 'desc',
          additionalOrders: [{ column: 'id', ascending: false }],
        })
      : Promise.resolve({ data: [], error: null }),
    ordersAfter
      ? fetchRowsCreatedAfterWithOptionalActiveFilter({
          table: 'orders',
          selectColumns: CLOUD_SELECTS.orders,
          createdAfter: ordersAfter,
          orderBy: 'created_at',
          orderDirection: 'desc',
          additionalOrders: [{ column: 'id', ascending: false }],
        })
      : Promise.resolve({ data: [], error: null }),
  ]);

  const hasCloudConnection = [budgetsResult, ordersResult].some(hasUsableCloudResult);
  const budgetsData = safeCloudData(budgetsResult, 'presupuestos incrementales');
  const ordersData = safeCloudData(ordersResult, 'pedidos incrementales');

  return {
    hasCloudConnection,
    budgets: budgetsData ? mapBudgetRecords(budgetsData) : null,
    orders: ordersData ? mapOrderRecords(ordersData) : null,
  };
};

const getElectronRequire = () =>
  window.require ||
  window['require'] ||
  globalThis.require ||
  globalThis['require'] ||
  null;

const buildGuestPosClient = () => ({
  id: 'guest',
  name: 'No asociado',
  memberNumber: '---',
  points: 0,
  usedCoupons: [],
});

const getPrimaryLocalIp = (networkInterfaces = {}) => {
  try {
    for (const interfaces of Object.values(networkInterfaces)) {
      for (const net of interfaces || []) {
        const family = net?.family;
        const isIPv4 = family === 'IPv4' || family === 4;
        if (isIPv4 && !net.internal && net.address) {
          return net.address;
        }
      }
    }
  } catch (error) {
    console.error('No se pudo resolver la IP local:', error);
  }
  return null;
};

const getSessionDeviceInfo = () => {
  const fallbackInfo = {
    deviceName: 'Equipo desconocido',
    ipAddress: window.location.hostname || 'No disponible',
    platform: navigator.platform || 'Web',
    runtime: 'Web',
  };

  try {
    const electronReq = getElectronRequire();
    if (!electronReq) return fallbackInfo;

    const os = electronReq('os');
    const deviceName = os.hostname?.() || fallbackInfo.deviceName;
    const ipAddress = getPrimaryLocalIp(os.networkInterfaces?.()) || fallbackInfo.ipAddress;
    const platform = `${os.platform?.() || 'desktop'} ${os.release?.() || ''}`.trim();

    return {
      deviceName,
      ipAddress,
      platform,
      runtime: 'Electron',
    };
  } catch (error) {
    console.error('No se pudo obtener la info del equipo:', error);
    return fallbackInfo;
  }
};

const loadSnapshotFromStorage = (storageKey) => {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    console.error('No se pudo leer el snapshot offline:', error);
    return null;
  }
};

const saveSnapshotToStorage = (storageKey, snapshot) => {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
  } catch (error) {
    console.error('No se pudo guardar el snapshot offline:', error);
  }
};

const loadOfflineSnapshot = () =>
  loadSnapshotFromStorage(OFFLINE_CORE_CACHE_KEY) || loadSnapshotFromStorage(LEGACY_OFFLINE_CACHE_KEY);

const saveOfflineSnapshot = (snapshot) => saveSnapshotToStorage(OFFLINE_CORE_CACHE_KEY, snapshot);

const loadOfflineTransactionsSnapshot = () => loadSnapshotFromStorage(OFFLINE_TRANSACTIONS_CACHE_KEY);
const saveOfflineTransactionsSnapshot = (snapshot) =>
  saveSnapshotToStorage(OFFLINE_TRANSACTIONS_CACHE_KEY, snapshot);

const loadOfflineDashboardSnapshot = () => loadSnapshotFromStorage(OFFLINE_DASHBOARD_CACHE_KEY);
const saveOfflineDashboardSnapshot = (snapshot) => saveSnapshotToStorage(OFFLINE_DASHBOARD_CACHE_KEY, snapshot);
const loadOfflineHistorySnapshot = () => loadSnapshotFromStorage(OFFLINE_HISTORY_CACHE_KEY);
const saveOfflineHistorySnapshot = (snapshot) => saveSnapshotToStorage(OFFLINE_HISTORY_CACHE_KEY, snapshot);

const loadOfflineOrdersSnapshot = () => loadSnapshotFromStorage(OFFLINE_ORDERS_CACHE_KEY);
const saveOfflineOrdersSnapshot = (snapshot) => saveSnapshotToStorage(OFFLINE_ORDERS_CACHE_KEY, snapshot);
const loadOfflineReportsSnapshot = () => loadSnapshotFromStorage(OFFLINE_REPORTS_CACHE_KEY);
const saveOfflineReportsSnapshot = (snapshot) => saveSnapshotToStorage(OFFLINE_REPORTS_CACHE_KEY, snapshot);
const loadOfflineSharedUsersSnapshot = () => loadSnapshotFromStorage(OFFLINE_SHARED_USERS_CACHE_KEY);
const saveOfflineSharedUsersSnapshot = (snapshot) =>
  saveSnapshotToStorage(OFFLINE_SHARED_USERS_CACHE_KEY, snapshot);
const loadOfflinePosSnapshot = () => loadSnapshotFromStorage(OFFLINE_POS_CACHE_KEY);
const saveOfflinePosSnapshot = (snapshot) => saveSnapshotToStorage(OFFLINE_POS_CACHE_KEY, snapshot);

const loadOfflineLoginSnapshot = () => loadSnapshotFromStorage(OFFLINE_LOGIN_CACHE_KEY);
const saveOfflineLoginSnapshot = (snapshot) =>
  saveSnapshotToStorage(OFFLINE_LOGIN_CACHE_KEY, snapshot);

const fallbackHashString = (value) => {
  let hash = 2166136261;
  const input = String(value || '');
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fallback:${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

const createOfflineLoginDigest = async (userId, password) => {
  const source = `rebu-offline-login-v1:${String(userId || '')}:${String(password || '')}`;
  const subtle = window.crypto?.subtle;
  if (!subtle || typeof TextEncoder === 'undefined') {
    return fallbackHashString(source);
  }

  const bytes = new TextEncoder().encode(source);
  const digest = await subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const saveOfflineLoginVerifier = async (user, password) => {
  if (!user?.id || !password) return;
  try {
    const currentSnapshot = loadOfflineLoginSnapshot() || {};
    const verifiers =
      currentSnapshot.verifiers && typeof currentSnapshot.verifiers === 'object'
        ? currentSnapshot.verifiers
        : {};
    const userId = String(user.id);
    verifiers[userId] = {
      userId,
      displayName: user.displayName || user.name || 'Usuario',
      digest: await createOfflineLoginDigest(userId, password),
      updatedAt: new Date().toISOString(),
    };

    saveOfflineLoginSnapshot({
      savedAt: new Date().toISOString(),
      verifiers,
    });
  } catch (error) {
    console.warn('No se pudo guardar el acceso offline del usuario:', error);
  }
};

const verifyOfflineLoginVerifier = async (user, password) => {
  if (!user?.id || !password) return false;
  try {
    const snapshot = loadOfflineLoginSnapshot();
    const verifier = snapshot?.verifiers?.[String(user.id)];
    if (!verifier?.digest) return false;
    const candidateDigest = await createOfflineLoginDigest(user.id, password);
    return candidateDigest === verifier.digest;
  } catch (error) {
    console.warn('No se pudo validar el acceso offline del usuario:', error);
    return false;
  }
};

const loadUserSettings = () => {
  try {
    const raw = window.localStorage.getItem(USER_SETTINGS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.error('No se pudieron leer los ajustes de usuario:', error);
    return {};
  }
};

const saveUserSettings = (settings) => {
  try {
    window.localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('No se pudieron guardar los ajustes de usuario:', error);
  }
};

function PersistentTabPanel({ tab, activeTab, className = '', children }) {
  const cachedChildrenRef = useRef(children);
  const hasMountedRef = useRef(activeTab === tab);

  if (activeTab === tab) {
    hasMountedRef.current = true;
    cachedChildrenRef.current = children;
  }

  if (!hasMountedRef.current) {
    return null;
  }

  return (
    <div className={`${activeTab === tab ? 'block' : 'hidden'} ${className}`.trim()}>
      {cachedChildrenRef.current}
    </div>
  );
}

const getCloudErrorMessage = (error, fallback = 'Error de sincronizacion con la nube.') => {
  const errorText = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ');

  if (/Could not find the table 'public\.budgets' in the schema cache/i.test(errorText)) {
    return 'Falta crear la tabla budgets en Supabase. Ejecuta el schema de pedidos y presupuestos.';
  }

  if (/Could not find the table 'public\.orders' in the schema cache/i.test(errorText)) {
    return 'Falta crear la tabla orders en Supabase. Ejecuta el schema de pedidos y presupuestos.';
  }

  return error?.message || error?.details || error?.hint || fallback;
};

const insertWithSchemaFallback = async (table, payload, selectColumns = '*') => {
  let safePayload = { ...payload };
  let safeSelect = selectColumns;

  while (true) {
    const { data, error } = await supabase.from(table).insert([safePayload]).select(safeSelect).single();
    if (!error) return { data, payload: safePayload };

    const missingColumn = extractSchemaMissingColumn(error);
    if (missingColumn && missingColumn in safePayload) {
      const nextPayload = { ...safePayload };
      delete nextPayload[missingColumn];
      safePayload = nextPayload;
      continue;
    }

    const nextSelect = missingColumn ? removeColumnFromSelect(safeSelect, missingColumn) : '';
    if (missingColumn && nextSelect && nextSelect !== safeSelect) {
      safeSelect = nextSelect;
      continue;
    }

    if (!missingColumn) {
      throw error;
    }
    throw error;
  }
};

const insertRowsWithSchemaFallback = async (table, rows) => {
  let safeRows = (Array.isArray(rows) ? rows : [rows]).map((row) => ({ ...row }));

  while (true) {
    const { data, error } = await supabase.from(table).insert(safeRows);
    if (!error) return { data, payload: safeRows };

    const missingColumn = extractSchemaMissingColumn(error);
    const canDropMissingColumn = missingColumn && safeRows.some((row) => missingColumn in row);
    if (canDropMissingColumn) {
      safeRows = safeRows.map((row) => {
        const { [missingColumn]: _removed, ...rest } = row;
        return rest;
      });
      continue;
    }

    throw error;
  }
};

const updateWithSchemaFallback = async (table, id, payload, selectColumns = '*') => {
  let safePayload = { ...payload };
  let safeSelect = selectColumns;

  while (true) {
    const { data, error } = await supabase.from(table).update(safePayload).eq('id', id).select(safeSelect).single();
    if (!error) return { data, payload: safePayload };

    const missingColumn = extractSchemaMissingColumn(error);
    if (missingColumn && missingColumn in safePayload) {
      const nextPayload = { ...safePayload };
      delete nextPayload[missingColumn];
      safePayload = nextPayload;
      continue;
    }

    const nextSelect = missingColumn ? removeColumnFromSelect(safeSelect, missingColumn) : '';
    if (missingColumn && nextSelect && nextSelect !== safeSelect) {
      safeSelect = nextSelect;
      continue;
    }

    if (!missingColumn) {
      throw error;
    }
    throw error;
  }
};

export default function PartySupplyApp() {
  window.__REBU_APP_READY__ = true;

  useEffect(() => {
    window.__REBU_APP_READY__ = true;

    return () => {
      window.__REBU_APP_READY__ = false;
    };
  }, []);
  
  const [isCloudLoading, setIsCloudLoading] = useState(false);
  const [isAuthBootLoading, setIsAuthBootLoading] = useState(true);
  const [isOfflineReadOnly, setIsOfflineReadOnly] = useState(false);
  const [isReconnectAttempting, setIsReconnectAttempting] = useState(false);
  const [offlineSnapshotAt, setOfflineSnapshotAt] = useState(null);

  // ==========================================
  // 1. ESTADOS DE DATOS
  // ==========================================
  const [inventory, setInventory] = useState([]);
  const [categories, setCategories] = useState([]);
  const [rewards, setRewards] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [dailyLogs, setDailyLogs] = useState([]);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [members, setMembers] = useState([]);
  const [agendaContacts, setAgendaContacts] = useState([]);
  const [pastClosures, setPastClosures] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [orders, setOrders] = useState([]);
  const [offers, setOffers] = useState([]); // ? NUEVO ESTADO: Ofertas
  const [moduleLoadState, setModuleLoadState] = useState(MODULE_LOAD_DEFAULT_STATE);
  const moduleLoadStateRef = useRef(MODULE_LOAD_DEFAULT_STATE);
  const moduleLoadPromisesRef = useRef({
    core: null,
    transactions: null,
    dashboard: null,
    history: null,
    orders: null,
    reports: null,
  });
  const activeTabRef = useRef('pos');
  const dataStateRef = useRef({});
  const registerStateSnapshotRef = useRef(null);

  const [openingBalance, setOpeningBalance] = useState(0);
  const [isRegisterClosed, setIsRegisterClosed] = useState(true); 
  const [closingTime, setClosingTime] = useState('21:00');
  const [registerOpenedAt, setRegisterOpenedAt] = useState(null);

  const isAutoClosing = useRef(false);

  const syncRegisterState = (registerState) => {
    registerStateSnapshotRef.current = registerState || null;
    const mappedRegisterState = mapRegisterState(registerState);
    if (!mappedRegisterState) return;

    setIsRegisterClosed(mappedRegisterState.isRegisterClosed);
    setOpeningBalance(mappedRegisterState.openingBalance);
    setClosingTime(mappedRegisterState.closingTime);
    setRegisterOpenedAt(mappedRegisterState.registerOpenedAt);
  };

  const setModuleState = (moduleKey, patch) => {
    const currentState = moduleLoadStateRef.current[moduleKey] || MODULE_LOAD_DEFAULT_STATE[moduleKey];
    const nextPartial = typeof patch === 'function' ? patch(currentState) : patch;
    const nextState = {
      ...currentState,
      ...(nextPartial || {}),
    };

    moduleLoadStateRef.current = {
      ...moduleLoadStateRef.current,
      [moduleKey]: nextState,
    };
    setModuleLoadState(moduleLoadStateRef.current);
  };

  const applyCoreSnapshot = (snapshot) => {
    const hasCoreData =
      snapshot &&
      (
        'inventory' in snapshot ||
        'categories' in snapshot ||
        'rewards' in snapshot ||
        'members' in snapshot ||
        'agendaContacts' in snapshot ||
        'offers' in snapshot ||
        'registerState' in snapshot
      );
    if (!hasCoreData) return false;
    setInventory(Array.isArray(snapshot.inventory) ? snapshot.inventory : []);
    setCategories(Array.isArray(snapshot.categories) ? snapshot.categories : []);
    setRewards(Array.isArray(snapshot.rewards) ? snapshot.rewards : []);
    setMembers(Array.isArray(snapshot.members) ? snapshot.members : []);
    setAgendaContacts(Array.isArray(snapshot.agendaContacts) ? snapshot.agendaContacts : []);
    setOffers(Array.isArray(snapshot.offers) ? snapshot.offers : []);
    syncRegisterState(snapshot.registerState || null);
    if (snapshot.savedAt) setOfflineSnapshotAt(snapshot.savedAt);
    return true;
  };

  const applyDashboardSnapshot = (snapshot) => {
    const hasDashboardData =
      snapshot &&
      (
        'dailyLogs' in snapshot ||
        'expenses' in snapshot ||
        'pastClosures' in snapshot
      );
    if (!hasDashboardData) return false;
    setDailyLogs(Array.isArray(snapshot.dailyLogs) ? snapshot.dailyLogs : []);
    setExpenses(Array.isArray(snapshot.expenses) ? snapshot.expenses : []);
    setPastClosures(Array.isArray(snapshot.pastClosures) ? snapshot.pastClosures : []);
    return true;
  };

  const applyTransactionsSnapshot = (snapshot) => {
    const hasTransactionsData = snapshot && 'transactions' in snapshot;
    if (!hasTransactionsData) return false;
    setTransactions(Array.isArray(snapshot.transactions) ? snapshot.transactions : []);
    return true;
  };

  const applyHistorySnapshot = (snapshot) => {
    const hasHistoryData = snapshot && 'historyLogs' in snapshot;
    if (!hasHistoryData) return false;
    setHistoryLogs(Array.isArray(snapshot.historyLogs) ? snapshot.historyLogs : []);
    return true;
  };

  const applyReportsSnapshot = (snapshot) => {
    const hasReportsData = snapshot && 'pastClosures' in snapshot;
    if (!hasReportsData) return false;
    setPastClosures(Array.isArray(snapshot.pastClosures) ? snapshot.pastClosures : []);
    return true;
  };

  const applyOrdersSnapshot = (snapshot) => {
    const hasOrdersData = snapshot && ('budgets' in snapshot || 'orders' in snapshot);
    if (!hasOrdersData) return false;
    setBudgets(Array.isArray(snapshot.budgets) ? snapshot.budgets : []);
    setOrders(Array.isArray(snapshot.orders) ? snapshot.orders : []);
    return true;
  };

  const applyOfflineSnapshot = (snapshot) => {
    if (!snapshot) return false;
    applyCoreSnapshot(snapshot);
    applyTransactionsSnapshot(snapshot);
    applyHistorySnapshot(snapshot);
    applyDashboardSnapshot(snapshot);
    applyOrdersSnapshot(snapshot);
    applyReportsSnapshot(snapshot);
    if (snapshot.savedAt) setOfflineSnapshotAt(snapshot.savedAt);
    return true;
  };

  const loadAppUsers = async ({ force = false, includeInactive = false } = {}) => {
    const requestedScope = includeInactive ? 'all' : 'active';
    const offlineSharedUsersSnapshot = loadOfflineSharedUsersSnapshot();

    if (
      isBrowserOffline() &&
      offlineSharedUsersSnapshot &&
      Array.isArray(offlineSharedUsersSnapshot.users) &&
      canServeSharedUsersScope(offlineSharedUsersSnapshot.scope || 'active', requestedScope)
    ) {
      setAuthMode(offlineSharedUsersSnapshot.authMode || 'supabase');
      setAppUsers(offlineSharedUsersSnapshot.users);
      return offlineSharedUsersSnapshot.users;
    }

    if (isBrowserOffline()) {
      const legacyUsers = buildLegacyUsers(USERS, userSettings);
      setAuthMode('legacy');
      setAppUsers(legacyUsers);
      return legacyUsers;
    }

    if (sharedUsersCache.promise) {
      const cachedResult = await sharedUsersCache.promise;
      if (canServeSharedUsersScope(cachedResult.scope || 'active', requestedScope)) {
        setAuthMode(cachedResult.authMode);
        setAppUsers(cachedResult.users);
        return cachedResult.users;
      }
    }

    const cacheAge = Date.now() - Number(sharedUsersCache.loadedAt || 0);
    if (
      !force &&
      Array.isArray(sharedUsersCache.users) &&
      canServeSharedUsersScope(sharedUsersCache.scope || 'active', requestedScope) &&
      cacheAge < APP_USERS_FRESHNESS_MS
    ) {
      setAuthMode(sharedUsersCache.authMode || 'legacy');
      setAppUsers(sharedUsersCache.users);
      return sharedUsersCache.users;
    }

    sharedUsersCache.promise = (async () => {
      try {
        let users = await withTimeout(
          fetchAppUsersPublic({
            includeInactive,
            includeAuditFields: includeInactive,
          }),
          OFFLINE_BOOT_TIMEOUT_MS,
          'Carga de usuarios',
        );

        if (users.length === 0) {
          const seed = buildLegacyBootstrapSeed(USERS, userSettings);
          await withTimeout(bootstrapAppUsers(seed), OFFLINE_BOOT_TIMEOUT_MS, 'Inicializacion de usuarios');
          users = await withTimeout(
            fetchAppUsersPublic({
              includeInactive,
              includeAuditFields: includeInactive,
            }),
            OFFLINE_BOOT_TIMEOUT_MS,
            'Recarga de usuarios',
          );
        }

        if (users.length > 0) {
          return { users, authMode: 'supabase', scope: requestedScope };
        }

        throw new Error('No se encontraron usuarios activos.');
      } catch (error) {
        const cachedSnapshot = loadOfflineSharedUsersSnapshot();
        const cachedUsers =
          cachedSnapshot &&
          Array.isArray(cachedSnapshot.users) &&
          canServeSharedUsersScope(cachedSnapshot.scope || 'active', requestedScope)
            ? cachedSnapshot.users
            : null;
        const inMemorySharedUsers =
          Array.isArray(sharedUsersCache.users) &&
          sharedUsersCache.authMode === 'supabase' &&
          sharedUsersCache.users.length > 0
            ? sharedUsersCache.users
            : null;
        const inMemoryRequestedScope = sharedUsersCache.scope || 'active';

        if (cachedUsers && cachedUsers.length > 0) {
          console.warn('No se pudo refrescar app_users desde Supabase. Seguimos con el cache local compartido.', error);
          return {
            users: cachedUsers,
            authMode: 'supabase',
            scope: cachedSnapshot.scope || requestedScope,
          };
        }

        if (inMemorySharedUsers && inMemorySharedUsers.length > 0) {
          console.warn(
            'No se pudo refrescar app_users desde Supabase. Seguimos con los usuarios compartidos ya cargados en memoria.',
            error,
          );
          return {
            users: inMemorySharedUsers,
            authMode: 'supabase',
            scope: canServeSharedUsersScope(inMemoryRequestedScope, requestedScope)
              ? inMemoryRequestedScope
              : 'active',
          };
        }

        const isMissingSharedUsersSchema =
          error?.code === 'PGRST205' &&
          /app_users_public|app_users/i.test(String(error?.message || ''));

        if (isMissingSharedUsersSchema) {
          console.warn('No existe todavía el schema compartido de usuarios. Seguimos con el login legacy.');
        } else {
          console.error('No se pudieron cargar los usuarios compartidos:', error);
        }

        return {
          users: buildLegacyUsers(USERS, userSettings),
          authMode: 'legacy',
          scope: 'active',
        };
      }
    })();

    try {
      const result = await sharedUsersCache.promise;
      sharedUsersCache.users = result.users;
      sharedUsersCache.authMode = result.authMode;
      sharedUsersCache.scope = result.scope || requestedScope;
      sharedUsersCache.loadedAt = Date.now();

      if (result.authMode === 'supabase' && Array.isArray(result.users) && result.users.length > 0) {
        saveOfflineSharedUsersSnapshot({
          savedAt: new Date().toISOString(),
          authMode: result.authMode,
          scope: result.scope || requestedScope,
          users: result.users,
        });
      }

      setAuthMode(result.authMode);
      setAppUsers(result.users);
      return result.users;
    } finally {
      sharedUsersCache.promise = null;
    }
  };

  const applyCorePayload = (payload) => {
    if (payload.inventory !== null) setInventory(payload.inventory);
    if (payload.members !== null) setMembers(payload.members);
    if (payload.agendaContacts !== null) setAgendaContacts(payload.agendaContacts);
    if (payload.categories !== null) setCategories(payload.categories);
    if (payload.rewards !== null) setRewards(payload.rewards);
    if (payload.offers !== null) setOffers(payload.offers);
    if (payload.registerState) syncRegisterState(payload.registerState);
  };

  const applyDashboardPayload = (payload, { merge = false } = {}) => {
    if (payload.dailyLogs !== null) {
      setDailyLogs((prev) => (merge ? mergeLatestRecords(prev, payload.dailyLogs) : payload.dailyLogs));
    }
    if (payload.expenses !== null) {
      setExpenses((prev) => (merge ? mergeLatestRecords(prev, payload.expenses) : payload.expenses));
    }
    if (payload.pastClosures !== null) {
      setPastClosures((prev) => (merge ? mergeLatestRecords(prev, payload.pastClosures) : payload.pastClosures));
    }
  };

  const applyTransactionsPayload = (payload, { merge = false } = {}) => {
    if (payload.transactions !== null) {
      setTransactions((prev) => (merge ? mergeLatestRecords(prev, payload.transactions) : payload.transactions));
    }
  };

  const applyHistoryPayload = (payload, { merge = false } = {}) => {
    if (payload.historyLogs !== null) {
      setHistoryLogs((prev) => (merge ? mergeLatestRecords(prev, payload.historyLogs) : payload.historyLogs));
    }
  };

  const applyOrdersPayload = (payload, { merge = false } = {}) => {
    if (payload.budgets !== null) {
      setBudgets((prev) => (merge ? mergeLatestRecords(prev, payload.budgets) : payload.budgets));
    }
    if (payload.orders !== null) {
      setOrders((prev) => (merge ? mergeLatestRecords(prev, payload.orders) : payload.orders));
    }
  };

  const applyReportsPayload = (payload, { merge = false } = {}) => {
    if (payload.pastClosures !== null) {
      setPastClosures((prev) => (merge ? mergeLatestRecords(prev, payload.pastClosures) : payload.pastClosures));
    }
  };

  const loadCoreCloudData = async ({ showSpinner = false, force = false } = {}) => {
    if (isBrowserOffline()) {
      const cachedSnapshot = loadOfflineSnapshot();
      if (applyCoreSnapshot(cachedSnapshot)) {
        setIsOfflineReadOnly(true);
        setModuleState('core', { status: 'loaded', dirty: false, lastLoadedAt: Date.now() });
        return true;
      }

      setIsOfflineReadOnly(true);
      setModuleState('core', { status: 'error', dirty: true });
      return false;
    }

    if (moduleLoadPromisesRef.current.core) {
      return moduleLoadPromisesRef.current.core;
    }

    const currentState = moduleLoadStateRef.current.core;
    if (!force && isModuleStateFresh(currentState, MODULE_FRESHNESS_MS.core)) {
      return true;
    }

    const run = async () => {
      if (showSpinner) setIsCloudLoading(true);
      setModuleState('core', { status: 'loading', dirty: false });

      try {
        const fetchCorePayloadWithTimeout = () =>
          withTimeout(fetchCoreCloudPayload(), OFFLINE_BOOT_TIMEOUT_MS, 'Carga inicial');
        const payload =
          !force && currentState.status === 'idle'
            ? await (initialBootstrapPromise ||= fetchCorePayloadWithTimeout())
            : await fetchCorePayloadWithTimeout();

        if (!payload?.hasCloudConnection) {
          const cachedSnapshot = loadOfflineSnapshot();
          if (applyCoreSnapshot(cachedSnapshot)) {
            setIsOfflineReadOnly(true);
            setModuleState('core', { status: 'loaded', dirty: false, lastLoadedAt: Date.now() });
            return true;
          }

          setModuleState('core', { status: 'error', dirty: true });
          return false;
        }

        applyCorePayload(payload);
        setIsOfflineReadOnly(false);

        const nextSnapshot = {
          savedAt: new Date().toISOString(),
          inventory: payload.inventory ?? dataStateRef.current.inventory ?? [],
          categories: payload.categories ?? dataStateRef.current.categories ?? [],
          rewards: payload.rewards ?? dataStateRef.current.rewards ?? [],
          members: payload.members ?? dataStateRef.current.members ?? [],
          agendaContacts: payload.agendaContacts ?? dataStateRef.current.agendaContacts ?? [],
          offers: payload.offers ?? dataStateRef.current.offers ?? [],
          registerState: payload.registerState ?? registerStateSnapshotRef.current ?? null,
        };
        saveOfflineSnapshot(nextSnapshot);
        setOfflineSnapshotAt(nextSnapshot.savedAt);
        setModuleState('core', { status: 'loaded', dirty: false, lastLoadedAt: Date.now() });
        return true;
      } catch (error) {
        console.error('Error general de conexión (core):', error);
        initialBootstrapPromise = null;
        const cachedSnapshot = loadOfflineSnapshot();
        if (applyCoreSnapshot(cachedSnapshot)) {
          setIsOfflineReadOnly(true);
          setModuleState('core', { status: 'loaded', dirty: false, lastLoadedAt: Date.now() });
          return true;
        }

        setModuleState('core', { status: 'error', dirty: true });
        return false;
      } finally {
        moduleLoadPromisesRef.current.core = null;
        if (showSpinner) setIsCloudLoading(false);
      }
    };

    const promise = run();
    moduleLoadPromisesRef.current.core = promise;
    return promise;
  };

  const loadTransactionsCloudData = async ({ force = false } = {}) => {
    if (moduleLoadPromisesRef.current.transactions) {
      return moduleLoadPromisesRef.current.transactions;
    }

    const currentState = moduleLoadStateRef.current.transactions;
    if (!force && isModuleStateFresh(currentState, MODULE_FRESHNESS_MS.transactions)) {
      return true;
    }

    const run = async () => {
      setModuleState('transactions', { status: 'loading', dirty: false });
      const latestTransactionCreatedAt = getLatestCreatedAt(dataStateRef.current.transactions);
      const useRecentSync =
        !force &&
        currentState.status === 'loaded' &&
        Array.isArray(dataStateRef.current.transactions) &&
        dataStateRef.current.transactions.length > 0;

      try {
        const payload = useRecentSync
          ? latestTransactionCreatedAt
            ? await fetchTransactionsCloudPayloadSince(latestTransactionCreatedAt)
            : await fetchRecentTransactionsCloudPayload()
          : await fetchTransactionsCloudPayload();

        if (!payload?.hasCloudConnection) {
          const cachedSnapshot =
            loadOfflineTransactionsSnapshot() || loadOfflineDashboardSnapshot() || loadOfflineSnapshot();
          if (applyTransactionsSnapshot(cachedSnapshot)) {
            setModuleState('transactions', { status: 'loaded', dirty: false, lastLoadedAt: Date.now() });
            return true;
          }

          setModuleState('transactions', { status: 'error', dirty: true });
          return false;
        }

        applyTransactionsPayload(payload, { merge: useRecentSync });
        setIsOfflineReadOnly(false);
        const nextTransactions =
          payload.transactions === null
            ? dataStateRef.current.transactions ?? []
            : useRecentSync
              ? mergeLatestRecords(dataStateRef.current.transactions, payload.transactions)
              : payload.transactions;

        const nextSnapshot = {
          savedAt: new Date().toISOString(),
          transactions: nextTransactions,
        };
        saveOfflineTransactionsSnapshot(nextSnapshot);
        setModuleState('transactions', { status: 'loaded', dirty: false, lastLoadedAt: Date.now() });
        return true;
      } catch (error) {
        console.error('Error general de conexión (transactions):', error);
        const cachedSnapshot =
          loadOfflineTransactionsSnapshot() || loadOfflineDashboardSnapshot() || loadOfflineSnapshot();
        if (applyTransactionsSnapshot(cachedSnapshot)) {
          setModuleState('transactions', { status: 'loaded', dirty: false, lastLoadedAt: Date.now() });
          return true;
        }

        setModuleState('transactions', { status: 'error', dirty: true });
        return false;
      } finally {
        moduleLoadPromisesRef.current.transactions = null;
      }
    };

    const promise = run();
    moduleLoadPromisesRef.current.transactions = promise;
    return promise;
  };

  const loadDashboardCloudData = async ({ force = false } = {}) => {
    if (moduleLoadPromisesRef.current.dashboard) {
      return moduleLoadPromisesRef.current.dashboard;
    }

    const currentState = moduleLoadStateRef.current.dashboard;
    if (!force && isModuleStateFresh(currentState, MODULE_FRESHNESS_MS.dashboard)) {
      return true;
    }

    const run = async () => {
      setModuleState('dashboard', { status: 'loading', dirty: false });
      const latestDashboardLogCreatedAt = getLatestCreatedAt(dataStateRef.current.dailyLogs);
      const latestExpenseCreatedAt = getLatestCreatedAt(dataStateRef.current.expenses);
      const latestClosureCreatedAt = getLatestCreatedAt(dataStateRef.current.pastClosures);
      const useRecentSync =
        !force &&
        currentState.status === 'loaded' &&
        (
          (Array.isArray(dataStateRef.current.dailyLogs) && dataStateRef.current.dailyLogs.length > 0) ||
          (Array.isArray(dataStateRef.current.expenses) && dataStateRef.current.expenses.length > 0) ||
          (Array.isArray(dataStateRef.current.pastClosures) && dataStateRef.current.pastClosures.length > 0)
        );

      try {
        await loadTransactionsCloudData({ force });
        const payload = useRecentSync
          ? latestDashboardLogCreatedAt || latestExpenseCreatedAt || latestClosureCreatedAt
            ? await fetchDashboardCloudPayloadSince({
                logsAfter: latestDashboardLogCreatedAt,
                expensesAfter: latestExpenseCreatedAt,
                closuresAfter: latestClosureCreatedAt,
              })
            : await fetchRecentDashboardCloudPayload()
          : await fetchDashboardCloudPayload();

        if (!payload?.hasCloudConnection) {
          const cachedSnapshot = loadOfflineDashboardSnapshot() || loadOfflineSnapshot();
          if (applyDashboardSnapshot(cachedSnapshot)) {
            setModuleState('dashboard', { status: 'loaded', dirty: false, lastLoadedAt: Date.now() });
            return true;
          }

          setModuleState('dashboard', { status: 'error', dirty: true });
          return false;
        }

        applyDashboardPayload(payload, { merge: useRecentSync });
        setIsOfflineReadOnly(false);
        const nextDailyLogs =
          payload.dailyLogs === null
            ? dataStateRef.current.dailyLogs ?? []
            : useRecentSync
              ? mergeLatestRecords(dataStateRef.current.dailyLogs, payload.dailyLogs)
              : payload.dailyLogs;
        const nextExpenses =
          payload.expenses === null
            ? dataStateRef.current.expenses ?? []
            : useRecentSync
              ? mergeLatestRecords(dataStateRef.current.expenses, payload.expenses)
              : payload.expenses;
        const nextClosures =
          payload.pastClosures === null
            ? dataStateRef.current.pastClosures ?? []
            : useRecentSync
              ? mergeLatestRecords(dataStateRef.current.pastClosures, payload.pastClosures)
              : payload.pastClosures;

        const nextSnapshot = {
          savedAt: new Date().toISOString(),
          dailyLogs: nextDailyLogs,
          expenses: nextExpenses,
          pastClosures: nextClosures,
        };
        saveOfflineDashboardSnapshot(nextSnapshot);
        setModuleState('dashboard', { status: 'loaded', dirty: false, lastLoadedAt: Date.now() });
        return true;
      } catch (error) {
        console.error('Error general de conexión (dashboard):', error);
        const cachedSnapshot = loadOfflineDashboardSnapshot() || loadOfflineSnapshot();
        if (applyDashboardSnapshot(cachedSnapshot)) {
          setModuleState('dashboard', { status: 'loaded', dirty: false, lastLoadedAt: Date.now() });
          return true;
        }

        setModuleState('dashboard', { status: 'error', dirty: true });
        return false;
      } finally {
        moduleLoadPromisesRef.current.dashboard = null;
      }
    };

    const promise = run();
    moduleLoadPromisesRef.current.dashboard = promise;
    return promise;
  };

  const loadHistoryCloudData = async ({ force = false } = {}) => {
    if (moduleLoadPromisesRef.current.history) {
      return moduleLoadPromisesRef.current.history;
    }

    const currentState = moduleLoadStateRef.current.history;
    if (!force && isModuleStateFresh(currentState, MODULE_FRESHNESS_MS.history)) {
      return true;
    }

    const run = async () => {
      setModuleState('history', { status: 'loading', dirty: false });
      const latestHistoryLogCreatedAt = getLatestCreatedAt(dataStateRef.current.historyLogs);
      const useRecentSync =
        !force &&
        currentState.status === 'loaded' &&
        Array.isArray(dataStateRef.current.historyLogs) &&
        dataStateRef.current.historyLogs.length > 0;

      try {
        const payload = useRecentSync
          ? latestHistoryLogCreatedAt
            ? await fetchHistoryCloudPayloadSince(latestHistoryLogCreatedAt)
            : await fetchRecentHistoryCloudPayload()
          : await fetchHistoryCloudPayload();

        if (!payload?.hasCloudConnection) {
          const cachedSnapshot = loadOfflineHistorySnapshot() || loadOfflineSnapshot();
          if (applyHistorySnapshot(cachedSnapshot)) {
            setModuleState('history', { status: 'loaded', dirty: false, lastLoadedAt: Date.now() });
            return true;
          }
          setModuleState('history', { status: 'error', dirty: true });
          return false;
        }

        applyHistoryPayload(payload, { merge: useRecentSync });
        const nextHistoryLogs =
          payload.historyLogs === null
            ? dataStateRef.current.historyLogs ?? []
            : useRecentSync
              ? mergeLatestRecords(dataStateRef.current.historyLogs, payload.historyLogs)
              : payload.historyLogs;
        saveOfflineHistorySnapshot({
          savedAt: new Date().toISOString(),
          historyLogs: nextHistoryLogs,
        });
        setModuleState('history', { status: 'loaded', dirty: false, lastLoadedAt: Date.now() });
        return true;
      } catch (error) {
        console.error('Error general de conexión (history):', error);
        const cachedSnapshot = loadOfflineHistorySnapshot() || loadOfflineSnapshot();
        if (applyHistorySnapshot(cachedSnapshot)) {
          setModuleState('history', { status: 'loaded', dirty: false, lastLoadedAt: Date.now() });
          return true;
        }
        setModuleState('history', { status: 'error', dirty: true });
        return false;
      } finally {
        moduleLoadPromisesRef.current.history = null;
      }
    };

    const promise = run();
    moduleLoadPromisesRef.current.history = promise;
    return promise;
  };

  const loadOrdersCloudData = async ({ force = false } = {}) => {
    if (moduleLoadPromisesRef.current.orders) {
      return moduleLoadPromisesRef.current.orders;
    }

    const currentState = moduleLoadStateRef.current.orders;
    if (!force && isModuleStateFresh(currentState, MODULE_FRESHNESS_MS.orders)) {
      return true;
    }

    const run = async () => {
      setModuleState('orders', { status: 'loading', dirty: false });
      const latestBudgetCreatedAt = getLatestCreatedAt(dataStateRef.current.budgets);
      const latestOrderCreatedAt = getLatestCreatedAt(dataStateRef.current.orders);
      const useRecentSync =
        !force &&
        currentState.status === 'loaded' &&
        (
          (Array.isArray(dataStateRef.current.budgets) && dataStateRef.current.budgets.length > 0) ||
          (Array.isArray(dataStateRef.current.orders) && dataStateRef.current.orders.length > 0)
        );

      try {
        const payload = useRecentSync
          ? latestBudgetCreatedAt || latestOrderCreatedAt
            ? await fetchOrdersCloudPayloadSince({
                budgetsAfter: latestBudgetCreatedAt,
                ordersAfter: latestOrderCreatedAt,
              })
            : await fetchRecentOrdersCloudPayload()
          : await fetchOrdersCloudPayload();

        if (!payload?.hasCloudConnection) {
          const cachedSnapshot = loadOfflineOrdersSnapshot() || loadOfflineSnapshot();
          if (applyOrdersSnapshot(cachedSnapshot)) {
            setModuleState('orders', { status: 'loaded', dirty: false, lastLoadedAt: Date.now() });
            return true;
          }

          setModuleState('orders', { status: 'error', dirty: true });
          return false;
        }

        applyOrdersPayload(payload, { merge: useRecentSync });
        setIsOfflineReadOnly(false);
        const nextBudgets =
          payload.budgets === null
            ? dataStateRef.current.budgets ?? []
            : useRecentSync
              ? mergeLatestRecords(dataStateRef.current.budgets, payload.budgets)
              : payload.budgets;
        const nextOrders =
          payload.orders === null
            ? dataStateRef.current.orders ?? []
            : useRecentSync
              ? mergeLatestRecords(dataStateRef.current.orders, payload.orders)
              : payload.orders;

        const nextSnapshot = {
          savedAt: new Date().toISOString(),
          budgets: nextBudgets,
          orders: nextOrders,
        };
        saveOfflineOrdersSnapshot(nextSnapshot);
        setModuleState('orders', { status: 'loaded', dirty: false, lastLoadedAt: Date.now() });
        return true;
      } catch (error) {
        console.error('Error general de conexión (orders):', error);
        const cachedSnapshot = loadOfflineOrdersSnapshot() || loadOfflineSnapshot();
        if (applyOrdersSnapshot(cachedSnapshot)) {
          setModuleState('orders', { status: 'loaded', dirty: false, lastLoadedAt: Date.now() });
          return true;
        }

        setModuleState('orders', { status: 'error', dirty: true });
        return false;
      } finally {
        moduleLoadPromisesRef.current.orders = null;
      }
    };

    const promise = run();
    moduleLoadPromisesRef.current.orders = promise;
    return promise;
  };

  const loadReportsCloudData = async ({ force = false } = {}) => {
    if (moduleLoadPromisesRef.current.reports) {
      return moduleLoadPromisesRef.current.reports;
    }

    const currentState = moduleLoadStateRef.current.reports;
    if (!force && isModuleStateFresh(currentState, MODULE_FRESHNESS_MS.reports)) {
      return true;
    }

    const run = async () => {
      setModuleState('reports', { status: 'loading', dirty: false });
      const latestReportClosureCreatedAt = getLatestCreatedAt(dataStateRef.current.pastClosures);
      const useRecentSync =
        !force &&
        currentState.status === 'loaded' &&
        Array.isArray(dataStateRef.current.pastClosures) &&
        dataStateRef.current.pastClosures.length > 0;

      try {
        const payload = useRecentSync
          ? latestReportClosureCreatedAt
            ? await fetchReportsCloudPayloadSince(latestReportClosureCreatedAt)
            : await fetchRecentReportsCloudPayload()
          : await fetchReportsCloudPayload();

        if (!payload?.hasCloudConnection) {
          const cachedSnapshot = loadOfflineReportsSnapshot() || loadOfflineSnapshot();
          if (applyReportsSnapshot(cachedSnapshot)) {
            setModuleState('reports', { status: 'loaded', dirty: false, lastLoadedAt: Date.now() });
            return true;
          }

          setModuleState('reports', { status: 'error', dirty: true });
          return false;
        }

        applyReportsPayload(payload, { merge: useRecentSync });
        setIsOfflineReadOnly(false);
        const nextClosures =
          payload.pastClosures === null
            ? dataStateRef.current.pastClosures ?? []
            : useRecentSync
              ? mergeLatestRecords(dataStateRef.current.pastClosures, payload.pastClosures)
              : payload.pastClosures;

        const nextSnapshot = {
          savedAt: new Date().toISOString(),
          pastClosures: nextClosures,
        };
        saveOfflineReportsSnapshot(nextSnapshot);
        setModuleState('reports', { status: 'loaded', dirty: false, lastLoadedAt: Date.now() });
        return true;
      } catch (error) {
        console.error('Error general de conexión (reports):', error);
        const cachedSnapshot = loadOfflineReportsSnapshot() || loadOfflineSnapshot();
        if (applyReportsSnapshot(cachedSnapshot)) {
          setModuleState('reports', { status: 'loaded', dirty: false, lastLoadedAt: Date.now() });
          return true;
        }

        setModuleState('reports', { status: 'error', dirty: true });
        return false;
      } finally {
        moduleLoadPromisesRef.current.reports = null;
      }
    };

    const promise = run();
    moduleLoadPromisesRef.current.reports = promise;
    return promise;
  };

  const loadModuleForTab = async (tab, { force = false } = {}) => {
    switch (TAB_TO_DATA_MODULE[tab]) {
      case 'transactions':
        return loadTransactionsCloudData({ force });
      case 'dashboard':
        return loadDashboardCloudData({ force });
      case 'history':
        return loadHistoryCloudData({ force });
      case 'orders':
        return loadOrdersCloudData({ force });
      case 'reports':
        return loadReportsCloudData({ force });
      default:
        return true;
    }
  };

  // ==========================================
  // 1.5 CONEXIÓN SUPABASE
  // ==========================================
  const fetchCloudData = async (showSpinner = true, { force = true, includeActiveModule = true, moduleKeys = null } = {}) => {
    try {
      if (showSpinner) setIsCloudLoading(true);
      await loadAppUsers({ force });
      await loadCoreCloudData({ showSpinner: false, force });

      const explicitModuleKeys = Array.isArray(moduleKeys) ? moduleKeys.filter(Boolean) : [];
      const nextModuleKeys = explicitModuleKeys.length
        ? explicitModuleKeys
        : includeActiveModule && currentUserRef.current
          ? [TAB_TO_DATA_MODULE[activeTabRef.current]].filter(Boolean)
          : [];

      for (const moduleKey of new Set(nextModuleKeys)) {
        if (moduleKey === 'transactions') {
          await loadTransactionsCloudData({ force });
        } else if (moduleKey === 'dashboard') {
          await loadDashboardCloudData({ force });
        } else if (moduleKey === 'history') {
          await loadHistoryCloudData({ force });
        } else if (moduleKey === 'orders') {
          await loadOrdersCloudData({ force });
        } else if (moduleKey === 'reports') {
          await loadReportsCloudData({ force });
        }
      }
    } catch (error) {
      console.error('Error general de conexión:', error);
      Swal.fire('Error de Conexión', 'Fallo total de red o configuración.', 'error');
    } finally {
      if (showSpinner) setIsCloudLoading(false);
    }
  };

  useEffect(() => {
    let disposed = false;
    setIsAuthBootLoading(true);

    const hydrateOfflineSnapshots = () => {
      const cachedCoreSnapshot = loadOfflineSnapshot();
      const cachedSharedUsersSnapshot = loadOfflineSharedUsersSnapshot();
      const cachedTransactionsSnapshot = loadOfflineTransactionsSnapshot();
      const cachedHistorySnapshot = loadOfflineHistorySnapshot();
      const cachedDashboardSnapshot = loadOfflineDashboardSnapshot();
      const cachedOrdersSnapshot = loadOfflineOrdersSnapshot();
      const cachedReportsSnapshot = loadOfflineReportsSnapshot();
      const cachedPosSnapshot = loadOfflinePosSnapshot();
      const hasCoreSnapshot = cachedCoreSnapshot
        ? ('transactions' in cachedCoreSnapshot || 'budgets' in cachedCoreSnapshot)
          ? applyOfflineSnapshot(cachedCoreSnapshot)
          : applyCoreSnapshot(cachedCoreSnapshot)
        : false;
      const hasTransactionsSnapshot = cachedTransactionsSnapshot ? applyTransactionsSnapshot(cachedTransactionsSnapshot) : false;
      const hasHistorySnapshot = cachedHistorySnapshot ? applyHistorySnapshot(cachedHistorySnapshot) : false;
      const hasDashboardSnapshot = cachedDashboardSnapshot ? applyDashboardSnapshot(cachedDashboardSnapshot) : false;
      const hasOrdersSnapshot = cachedOrdersSnapshot ? applyOrdersSnapshot(cachedOrdersSnapshot) : false;
      const hasReportsSnapshot = cachedReportsSnapshot ? applyReportsSnapshot(cachedReportsSnapshot) : false;
      const hasPosSnapshot = cachedPosSnapshot ? applyPosSnapshot(cachedPosSnapshot) : false;
      const hasSharedUsersSnapshot =
        cachedSharedUsersSnapshot?.authMode === 'supabase' &&
        Array.isArray(cachedSharedUsersSnapshot.users) &&
        cachedSharedUsersSnapshot.users.length > 0;

      if (hasSharedUsersSnapshot) {
        setAuthMode('supabase');
        setAppUsers(cachedSharedUsersSnapshot.users);
      }

      return Boolean(
        hasCoreSnapshot ||
          hasTransactionsSnapshot ||
          hasHistorySnapshot ||
          hasDashboardSnapshot ||
          hasOrdersSnapshot ||
          hasReportsSnapshot ||
          hasPosSnapshot ||
          hasSharedUsersSnapshot
      );
    };

    const hydratedFromCache = hydrateOfflineSnapshots();
    if (hydratedFromCache || isBrowserOffline()) {
      setIsOfflineReadOnly(true);
    }

    if (isBrowserOffline()) {
      setIsAuthBootLoading(false);
    } else {
      void loadCoreCloudData({ showSpinner: false });
      void withTimeout(loadAppUsers(), OFFLINE_BOOT_TIMEOUT_MS, 'Carga inicial de usuarios')
        .catch((error) => {
          if (!isRecoverableCloudError(error)) {
            console.error('No se pudieron cargar los usuarios compartidos:', error);
          }
          const recoveredFromCache = hydrateOfflineSnapshots();
          if (recoveredFromCache) setIsOfflineReadOnly(true);
        })
        .finally(() => {
          if (!disposed) {
            setIsAuthBootLoading(false);
          }
        });
    }

    const channel = supabase
      .channel('app_realtime_updates')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'register_state', filter: 'id=eq.1' },
        (payload) => {
          const newState = payload.new;
          syncRegisterState(newState);
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'cash_closures' },
        (payload) => {
          const c = payload.new;
          if (c) {
             const newReport = mapCashClosureRecord(c);
             if (moduleLoadStateRef.current.reports.status === 'loaded') {
               setPastClosures((prev) => [newReport, ...prev]);
             } else {
               setModuleState('reports', (prev) => ({ ...prev, dirty: true }));
             }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_users' },
        () => {
          void loadAppUsers({
            force: true,
            includeInactive: activeTabRef.current === 'user-management',
          });
        }
      )
      .subscribe();

    let lastFetchTime = Date.now();
    let lastVisibilityState = document.visibilityState;
    const MIN_RESYNC_INTERVAL = 10 * 60 * 1000;

    const handleReSync = () => {
      const nextVisibilityState = document.visibilityState;
      const becameVisible = lastVisibilityState !== 'visible' && nextVisibilityState === 'visible';
      lastVisibilityState = nextVisibilityState;
      if (!becameVisible) return;

      const elapsed = Date.now() - lastFetchTime;
      if (elapsed < MIN_RESYNC_INTERVAL) return;

      lastFetchTime = Date.now();
      void fetchCloudData(false, { force: false });
    };

    const handleBrowserOffline = () => {
      const recoveredFromCache = hydrateOfflineSnapshots();
      if (recoveredFromCache || isBrowserOffline()) {
        setIsOfflineReadOnly(true);
      }
    };

    const handleBrowserOnline = () => {
      lastFetchTime = Date.now();
      void fetchCloudData(false, { force: false });
    };

    window.addEventListener('visibilitychange', handleReSync);
    window.addEventListener('offline', handleBrowserOffline);
    window.addEventListener('online', handleBrowserOnline);

    return () => {
      disposed = true;
      supabase.removeChannel(channel);
      window.removeEventListener('visibilitychange', handleReSync);
      window.removeEventListener('offline', handleBrowserOffline);
      window.removeEventListener('online', handleBrowserOnline);
    };
  }, []);

  const [currentTime, setCurrentTime] = useState(new Date());
  const [currentUser, setCurrentUser] = useState(null);
  const [currentSessionMeta, setCurrentSessionMeta] = useState(null);
  const [activeTab, setActiveTab] = useState('pos');
  const [userSettings, setUserSettings] = useState(() => loadUserSettings());
  const [authMode, setAuthMode] = useState(() =>
    loadOfflineSharedUsersSnapshot()?.authMode === 'supabase' ? 'supabase' : 'legacy'
  );
  const [appUsers, setAppUsers] = useState(() => {
    const cachedSharedUsersSnapshot = loadOfflineSharedUsersSnapshot();
    if (cachedSharedUsersSnapshot?.authMode === 'supabase' && Array.isArray(cachedSharedUsersSnapshot.users)) {
      return cachedSharedUsersSnapshot.users;
    }
    return buildLegacyUsers(USERS, loadUserSettings());
  });
  const currentUserRef = useRef(null);
  const currentSessionMetaRef = useRef(null);
  const forcedDisabledUserLogoutRef = useRef(null);
  const forcedPermissionsLogoutRef = useRef(null);
  const writeLogEntryRef = useRef(null);
  const showNotificationRef = useRef(null);
  const productThumbBackfillInFlightRef = useRef(false);
  const productThumbBackfillDisabledRef = useRef(false);
  const productThumbBackfillFailedIdsRef = useRef(new Set());
  activeTabRef.current = activeTab;
  dataStateRef.current = {
    inventory,
    categories,
    rewards,
    transactions,
    dailyLogs,
    historyLogs,
    members,
    agendaContacts,
    pastClosures,
    expenses,
    budgets,
    orders,
    offers,
  };

  useEffect(() => {
    if (activeTab === 'rewards') {
      setActiveTab('extras');
    }
  }, [activeTab]);

  useEffect(() => {
    saveUserSettings(userSettings);
  }, [userSettings]);
  const [cart, setCart] = useState([]);

  const [loginStep, setLoginStep] = useState('select');
  const [selectedUserIdForLogin, setSelectedUserIdForLogin] = useState(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const [systemLogoTapCount, setSystemLogoTapCount] = useState(0);
  const systemLogoTapTimeoutRef = useRef(null);

  useEffect(() => () => {
    if (systemLogoTapTimeoutRef.current) {
      clearTimeout(systemLogoTapTimeoutRef.current);
    }
  }, []);

  const userCatalog = useMemo(() => buildUserCatalog(appUsers), [appUsers]);
  const activeLoginUsers = useMemo(
    () => userCatalog.all.filter((user) => user.isActive),
    [userCatalog],
  );
  const selectedLoginUser = useMemo(
    () => userCatalog.byId[String(selectedUserIdForLogin || '')] || null,
    [selectedUserIdForLogin, userCatalog],
  );
  const currentUserPresentation = useMemo(
    () => resolveUserPresentation(currentUser, userCatalog),
    [currentUser, userCatalog],
  );
  const canUseAdminArea = hasOwnerAccess(currentUser);
  const canManageRegister = hasPermission(currentUser, 'register.manage');
  const canViewDashboard = canAccessTab(currentUser, 'dashboard');
  const canViewReports = canAccessTab(currentUser, 'reports');
  const canViewLogs = canAccessTab(currentUser, 'logs');
  const canViewSessions = canAccessTab(currentUser, 'sessions');
  const canViewUserManagement = canAccessTab(currentUser, 'user-management');
  const canViewBulkEditor = canAccessTab(currentUser, 'bulk-editor');
  const canViewAgenda = canAccessTab(currentUser, 'agenda');
  const canCreateInventory = hasPermission(currentUser, 'inventory.create');

  useEffect(() => {
    if (!currentUser) return;
    if (!canAccessTab(currentUser, activeTab)) {
      setActiveTab(getDefaultTabForUser(currentUser));
    }
  }, [activeTab, currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    void loadModuleForTab(activeTab);
  }, [activeTab, currentUser]);

  useEffect(() => {
    if (activeTab !== 'user-management' || !canViewUserManagement) return;
    void loadAppUsers({ force: true, includeInactive: true });
  }, [activeTab, canViewUserManagement]);

  useEffect(() => {
    if (authMode !== 'supabase' || !currentUser?.id) {
      forcedDisabledUserLogoutRef.current = null;
      forcedPermissionsLogoutRef.current = null;
      return;
    }

    const latestCurrentUser = userCatalog.byId[String(currentUser.id)] || null;
    if (!latestCurrentUser) return;

    if (latestCurrentUser.isActive !== false) {
      forcedDisabledUserLogoutRef.current = null;
      if (
        latestCurrentUser.displayName !== currentUser.displayName ||
        latestCurrentUser.nameColor !== currentUser.nameColor ||
        latestCurrentUser.avatar !== currentUser.avatar ||
        latestCurrentUser.theme !== currentUser.theme
      ) {
        setCurrentUser((prev) =>
          prev
            ? {
                ...prev,
                displayName: latestCurrentUser.displayName,
                name: latestCurrentUser.displayName,
                nameColor: latestCurrentUser.nameColor,
                avatar: latestCurrentUser.avatar,
                theme: latestCurrentUser.theme,
                isActive: latestCurrentUser.isActive,
                updatedAt: latestCurrentUser.updatedAt,
              }
            : prev,
        );
      }
      const activeSession = currentSessionMetaRef.current;
      const sessionPermissionsVersion = Number(activeSession?.permissionsVersion || currentUser.permissionsVersion || 1);
      const latestPermissionsVersion = Number(latestCurrentUser.permissionsVersion || 1);
      const latestForceReauthVersion = Number(latestCurrentUser.forceReauthPermissionsVersion || 0);

      if (
        latestPermissionsVersion > sessionPermissionsVersion &&
        latestForceReauthVersion >= latestPermissionsVersion
      ) {
        if (forcedPermissionsLogoutRef.current === String(latestCurrentUser.id)) return;
        forcedPermissionsLogoutRef.current = String(latestCurrentUser.id);

        const now = new Date();

        void (async () => {
          if (activeSession) {
            await (writeLogEntryRef.current || writeLogEntry)({
              action: 'Sesion Cerrada',
              details: {
                ...activeSession,
                closedAt: now.toISOString(),
                closedDate: formatDateAR(now),
                closedTime: formatTimeFullAR(now),
                forcedByPermissions: true,
                updatedPermissionsVersion: latestPermissionsVersion,
              },
              reason: 'Permisos actualizados por Sistema',
              userName: activeSession.userName || latestCurrentUser.displayName || latestCurrentUser.name || 'Usuario',
            });
          }

          clearAuthenticatedState();

          (showNotificationRef.current || showNotification)(
            'warning',
            'Permisos actualizados',
            'Tus permisos cambiaron y se reinicio la sesion para aplicar el nuevo acceso.',
          );
        })();
        return;
      }

      forcedPermissionsLogoutRef.current = null;
      return;
    }

    if (forcedDisabledUserLogoutRef.current === String(latestCurrentUser.id)) return;
    forcedDisabledUserLogoutRef.current = String(latestCurrentUser.id);

    const now = new Date();
    const activeSession = currentSessionMetaRef.current;

    void (async () => {
      if (activeSession) {
        await (writeLogEntryRef.current || writeLogEntry)({
          action: 'Sesion Cerrada',
          details: {
            ...activeSession,
            closedAt: now.toISOString(),
            closedDate: formatDateAR(now),
            closedTime: formatTimeFullAR(now),
            forcedByDeactivation: true,
          },
          reason: 'Usuario desactivado por Sistema',
          userName: activeSession.userName || latestCurrentUser.displayName || latestCurrentUser.name || 'Usuario',
        });
      }

      clearAuthenticatedState();

      (showNotificationRef.current || showNotification)(
        'warning',
        'Usuario desactivado',
        'Tu usuario fue desactivado por Sistema. Se cerró la sesión automáticamente.',
      );
    })();
  }, [authMode, currentUser, userCatalog]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isOpeningBalanceModalOpen, setIsOpeningBalanceModalOpen] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [isClosingTimeModalOpen, setIsClosingTimeModalOpen] = useState(false);
  const [isClosingCashModalOpen, setIsClosingCashModalOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState('');
  const [saleSuccessModal, setSaleSuccessModal] = useState(null);
  const [isAutoCloseAlertOpen, setIsAutoCloseAlertOpen] = useState(false);
  
  const [ticketToView, setTicketToView] = useState(null);
  const [exportPdfData, setExportPdfData] = useState(null);

  // ? ESTADOS PARA PERSISTENCIA DE PRESUPUESTO EN BULK EDITOR
  const [bulkExportItems, setBulkExportItems] = useState([]);

  useEffect(() => {
    setCart((prevCart) => {
      if (!Array.isArray(prevCart) || prevCart.length === 0) return prevCart;

      const baseTotal = prevCart.reduce((total, item) => {
        if (item?.isDiscount) return total;
        return total + (Number(item?.price) || 0) * (Number(item?.quantity) || 0);
      }, 0);

      let hasChanges = false;

      const nextCart = prevCart.map((item) => {
        if (!item?.isDiscount || String(item?.discountMode || '').toLowerCase() !== 'percentage') {
          return item;
        }

        const percentage = Number(item?.discountPercent) || 0;
        const nextDiscountAmount =
          percentage > 0 && baseTotal > 0 ? Math.min(baseTotal, Math.round((baseTotal * percentage) / 100)) : 0;
        const nextPrice = -nextDiscountAmount;

        if ((Number(item?.price) || 0) === nextPrice) {
          return item;
        }

        hasChanges = true;
        return {
          ...item,
          price: nextPrice,
        };
      });

      return hasChanges ? nextCart : prevCart;
    });
  }, [cart]);
  const [bulkExportConfig, setBulkExportConfig] = useState({
    isForClient: true,
    documentTitle: '', 
    clientName: '',
    clientPhone: '',
    clientEvent: '',
    columns: { cost: false, price: true, newPrice: false, stock: false },
    clientColumns: { showQty: true, showUnitPrice: true, showSubtotal: false, showTotal: true }
  });

  const [productToDelete, setProductToDelete] = useState(null);
  const [deleteProductReason, setDeleteProductReason] = useState('');

  const [editingProduct, setEditingProduct] = useState(null);
  const [inventoryPanelCloseToken, setInventoryPanelCloseToken] = useState(0);
  const [editReason, setEditReason] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const [editingTransaction, setEditingTransaction] = useState(null);
  const [transactionSearch, setTransactionSearch] = useState('');
  const [transactionToRefund, setTransactionToRefund] = useState(null);
  const [refundReason, setRefundReason] = useState('');

  const [barcodeNotFoundModal, setBarcodeNotFoundModal] = useState({ isOpen: false, code: '' });
  const [barcodeDuplicateModal, setBarcodeDuplicateModal] = useState({ isOpen: false, existingProduct: null, newBarcode: '' });
  const [posSelectedClient, setPosSelectedClient] = useState(null);
  const [memberIdentityPanelState, setMemberIdentityPanelState] = useState({
    isOpen: false,
    initialMode: 'member',
    initialFocus: 'select',
  });
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);

  const [detailsModalTx, setDetailsModalTx] = useState(null);

  const [newItem, setNewItem] = useState({
    title: '', brand: '', price: '', purchasePrice: '', stock: '',
    categories: [], image: '', image_thumb: '', barcode: '',
    product_type: 'quantity',
    expiration_date: '' 
  });

  const [tempOpeningBalance, setTempOpeningBalance] = useState('');
  const [tempClosingTime, setTempClosingTime] = useState('21:00');

  const [selectedPayment, setSelectedPayment] = useState('Efectivo');
  const [installments, setInstallments] = useState(1);
  const [inventoryViewMode, setInventoryViewMode] = useState('grid');
  const [inventoryCategoryFilter, setInventoryCategoryFilter] = useState('Todas');
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryNavigationRequest, setInventoryNavigationRequest] = useState(null);
  const [historyNavigationRequest, setHistoryNavigationRequest] = useState(null);
  const [posSearch, setPosSearch] = useState('');
  
  const [posSelectedCategory, setPosSelectedCategory] = useState('Todas');
  const [posViewMode, setPosViewMode] = useState('grid');
  const [posGridColumns, setPosGridColumns] = useState(4);
  const [inventoryGridColumns, setInventoryGridColumns] = useState(5);

  const applyPosSnapshot = (snapshot) => {
    const hasPosData =
      snapshot &&
      (
        'cart' in snapshot ||
        'selectedClient' in snapshot ||
        'selectedPayment' in snapshot ||
        'installments' in snapshot ||
        'posSearch' in snapshot ||
        'selectedCategory' in snapshot ||
        'posViewMode' in snapshot
      );

    if (!hasPosData) return false;

    setCart(Array.isArray(snapshot.cart) ? snapshot.cart : []);
    setPosSelectedClient(snapshot.selectedClient || null);
    setSelectedPayment(snapshot.selectedPayment || 'Efectivo');
    setInstallments(Number(snapshot.installments || 1) || 1);
    setPosSearch(snapshot.posSearch || '');
    setPosSelectedCategory(snapshot.selectedCategory || 'Todas');
    setPosViewMode(snapshot.posViewMode || 'grid');
    if (snapshot.savedAt) setOfflineSnapshotAt(snapshot.savedAt);
    return true;
  };

  const [notification, setNotification] = useState({ isOpen: false, type: 'info', title: '', message: '' });

  useEffect(() => {
    const nextPosSnapshot = {
      savedAt: new Date().toISOString(),
      cart: Array.isArray(cart) ? cart : [],
      selectedClient: posSelectedClient || null,
      selectedPayment: selectedPayment || 'Efectivo',
      installments: Number(installments || 1) || 1,
      posSearch: posSearch || '',
      selectedCategory: posSelectedCategory || 'Todas',
      posViewMode: posViewMode || 'grid',
    };

    saveOfflinePosSnapshot(nextPosSnapshot);
  }, [cart, posSelectedClient, selectedPayment, installments, posSearch, posSelectedCategory, posViewMode]);

  const showNotification = (type, title, message) => {
    setNotification({ isOpen: true, type, title, message });
  };

  const closeNotification = () => {
    setNotification(prev => ({ ...prev, isOpen: false }));
  };

  const openMemberIdentityPanel = ({ initialMode = 'member', initialFocus = 'select' } = {}) => {
    setMemberIdentityPanelState({
      isOpen: true,
      initialMode,
      initialFocus,
    });
  };

  const closeMemberIdentityPanel = () => {
    setMemberIdentityPanelState((prev) => ({ ...prev, isOpen: false }));
  };

  const setIsClientModalOpen = (isOpen) => {
    if (isOpen) {
      openMemberIdentityPanel({ initialMode: 'member', initialFocus: 'select' });
      return;
    }
    closeMemberIdentityPanel();
  };

  const setIsRedemptionModalOpen = (isOpen) => {
    if (isOpen) {
      openMemberIdentityPanel({ initialMode: 'member', initialFocus: 'redeem' });
      return;
    }
    closeMemberIdentityPanel();
  };

  currentUserRef.current = currentUser;
  currentSessionMetaRef.current = currentSessionMeta;
  showNotificationRef.current = showNotification;

  const getActorContext = (preferredName = null) => {
    const activeUser = currentUserRef.current;
    if (activeUser) {
      return {
        userId: activeUser.id || null,
        userRole: activeUser.role || 'seller',
        userName: preferredName || activeUser.displayName || activeUser.name || 'Sistema',
      };
    }

    return {
      userId: null,
      userRole: 'system',
      userName: preferredName || 'Sistema',
    };
  };

  const getSessionInactivityMs = (sessionMeta, nowMs = Date.now()) => {
    if (!sessionMeta) return 0;
    const lastActivitySource = sessionMeta.lastActivityAt || sessionMeta.startedAt;
    const lastActivityMs = lastActivitySource ? new Date(lastActivitySource).getTime() : nowMs;
    if (!Number.isFinite(lastActivityMs)) return 0;
    return Math.max(0, nowMs - lastActivityMs);
  };

  const deriveSessionStatus = (sessionMeta, nowMs = Date.now()) => {
    if (!sessionMeta) return 'Activa';
    if (sessionMeta.closedAt) return 'Cerrada';
    if (sessionMeta.expiredAt || sessionMeta.status === 'Expirada') return 'Expirada';

    const inactivityMs = getSessionInactivityMs(sessionMeta, nowMs);
    if (inactivityMs >= SESSION_EXPIRED_MS) return 'Expirada';
    if (sessionMeta.status === 'Ausente' || sessionMeta.absentAt || inactivityMs >= SESSION_ABSENT_MS) return 'Ausente';
    return 'Activa';
  };

  const blockIfOfflineReadonly = (actionLabel = 'realizar cambios') => {
    if (!isOfflineReadOnly) return false;
    showNotification(
      'info',
      'Modo sin conexión',
      `Sin internet podés seguir consultando datos, pero no ${actionLabel}.`
    );
    return true;
  };

  const handleReconnectCloud = async () => {
    if (isReconnectAttempting) return;

    setIsReconnectAttempting(true);
    try {
      const isReachable = await verifyCloudConnection();
      if (!isReachable) {
        setIsOfflineReadOnly(true);
        showNotification('info', 'Seguis sin conexion', 'Todavia no hay internet disponible para sincronizar.');
        return;
      }

      await fetchCloudData(false, { force: true, includeActiveModule: true });
      setIsOfflineReadOnly(false);
      showNotification('success', 'Reconectado', 'La conexion con Supabase se restablecio correctamente.');
    } catch (error) {
      console.error('No se pudo reconectar:', error);
      setIsOfflineReadOnly(true);
      showNotification(
        'warning',
        'No se pudo reconectar',
        error?.message || 'La nube todavia no responde. Podes volver a intentarlo en unos segundos.'
      );
    } finally {
      setIsReconnectAttempting(false);
    }
  };

  const handleSoftReload = () => {
    fetchCloudData(false, { force: false });
    showNotification('info', 'Recarga suave', 'Revalidamos el modulo visible y los datos vencidos sin rehacer toda la nube.');
  };
  const handleForceReload = () => {
    window.location.reload();
  };

  useEffect(() => {
    const handleAppReloadShortcut = (event) => {
      if (event.key !== 'F5') return;

      event.preventDefault();

      if (event.ctrlKey) {
        handleForceReload();
        return;
      }

      handleSoftReload();
    };

    window.addEventListener('keydown', handleAppReloadShortcut);
    return () => window.removeEventListener('keydown', handleAppReloadShortcut);
  }, []);

  const isTestActive = useMemo(() => {
    return isTestRecord(cart) || 
           isTestRecord(posSelectedClient) || 
           isTestRecord(posSearch) ||
           isTestRecord(newItem) ||
           isTestRecord(editingProduct) ||
           isTestRecord(editingTransaction) ||
           isTestRecord(transactionSearch);
  }, [cart, posSelectedClient, posSearch, newItem, editingProduct, editingTransaction, transactionSearch]);

  const writeLogEntry = async ({ action, details, reason = '', userName, skipCloud = false }) => {
    const now = new Date();
    const actor = getActorContext(userName);
    const normalizedDetails =
      details && typeof details === 'object'
        ? {
            userId: actor.userId,
            userRole: actor.userRole,
            userName: actor.userName,
            ...details,
          }
        : details;

    const newLog = {
      id: Date.now(),
      timestamp: formatTimeFullAR(now),
      date: formatDateAR(now),
      action,
      user: actor.userName,
      details: normalizedDetails,
      reason,
      created_at: new Date().toISOString()
    };
    
    newLog.isTest = shouldIgnoreNestedTestDetectionForLog(action)
      ? Boolean(normalizedDetails?.isTest || normalizedDetails?.testMarker === 'test')
      : isTestRecord({ action, details, reason });
    setDailyLogs((prev) => [newLog, ...prev].slice(0, DASHBOARD_LOG_LIMIT));
    if (HISTORY_LOG_ACTIONS.includes(action)) {
      setHistoryLogs((prev) => [newLog, ...prev]);
    }

    if (skipCloud || isBrowserOffline()) {
      setIsOfflineReadOnly(true);
      return;
    }

    try {
      await withTimeout(
        insertWithSchemaFallback('logs', {
          action,
          details: normalizedDetails,
          user: actor.userName,
          reason,
          created_at: new Date().toISOString()
        }, 'id'),
        OFFLINE_BOOT_TIMEOUT_MS,
        'Guardado de log',
      );
    } catch (e) {
      console.error("Error guardando log en nube", e);
    }
  };

  writeLogEntryRef.current = writeLogEntry;

  const addLog = async (action, details, defaultReason = '') => {
    let finalReason = defaultReason;
    if (details && typeof details === 'object') {
        const userNote = details.description || details.note || details.extraInfo;
        if (userNote && userNote.trim() !== '' && userNote !== details.category) {
            finalReason = userNote.trim();
        }
    }

    await writeLogEntry({
      action,
      details,
      reason: finalReason,
    });
  };

  const buildSessionMeta = (user) => {
    const now = new Date();
    const deviceInfo = getSessionDeviceInfo();

    return {
      sessionId: `SES-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      userId: user?.id || null,
      userName: user?.displayName || user?.name || 'Sistema',
      role: user?.role || 'unknown',
      avatar: user?.avatar || '--',
      deviceName: deviceInfo.deviceName,
      ipAddress: deviceInfo.ipAddress,
      platform: deviceInfo.platform,
      runtime: deviceInfo.runtime,
      startedAt: now.toISOString(),
      startedDate: formatDateAR(now),
      startedTime: formatTimeFullAR(now),
      lastActivityAt: now.toISOString(),
      permissionsVersion: Number(user?.permissionsVersion || 1),
      status: 'Activa',
      absentAt: null,
      expiredAt: null,
    };
  };

  const clearAuthenticatedState = () => {
    currentSessionMetaRef.current = null;
    currentUserRef.current = null;
    setCurrentSessionMeta(null);
    setCurrentUser(null);
    setCart([]);
    setPosSelectedClient(null);
    setLoginStep('select');
    setSelectedUserIdForLogin(null);
    setPasswordInput('');
    setLoginError('');
  };

  const writeSessionTransitionLog = async (action, sessionMeta, reason) => {
    if (!sessionMeta) return;
    await (writeLogEntryRef.current || writeLogEntry)({
      action,
      details: sessionMeta,
      reason,
      userName: sessionMeta.userName || currentUserRef.current?.displayName || currentUserRef.current?.name || 'Sistema',
    });
  };

  const updateSessionStatus = async (nextStatus, reason, extraFields = {}) => {
    const sessionMeta = currentSessionMetaRef.current;
    if (!sessionMeta) return;

    const now = new Date();
    const statusFieldMap = {
      Ausente: { absentAt: now.toISOString(), expiredAt: null },
      Activa: { absentAt: null, expiredAt: null },
      Expirada: { expiredAt: now.toISOString() },
    };

    const nextSession = {
      ...sessionMeta,
      ...statusFieldMap[nextStatus],
      ...extraFields,
      status: nextStatus,
    };

    currentSessionMetaRef.current = nextSession;
    setCurrentSessionMeta(nextSession);

    const actionMap = {
      Ausente: 'Sesion Ausente',
      Activa: 'Sesion Reanudada',
      Expirada: 'Sesion Expirada',
    };

    await writeSessionTransitionLog(actionMap[nextStatus], nextSession, reason);
    return nextSession;
  };

  const expireCurrentSession = async () => {
    const sessionMeta = currentSessionMetaRef.current;
    if (!sessionMeta) return;

    const expiredSession = await updateSessionStatus(
      'Expirada',
      '1 hora sin actividad'
    );

    clearAuthenticatedState();
    showNotificationRef.current?.(
      'warning',
      'Sesión expirada',
      'La sesión expiró por inactividad. Volvé a ingresar para continuar.'
    );

    return expiredSession;
  };

  useEffect(() => {
    const handleSessionActivity = () => {
      const sessionMeta = currentSessionMetaRef.current;
      if (!sessionMeta) return;

      const now = new Date();
      const nowIso = now.toISOString();
      const statusNow = deriveSessionStatus(sessionMeta, now.getTime());

      if (statusNow === 'Expirada') {
        void expireCurrentSession();
        return;
      }

      if (statusNow === 'Ausente' && (sessionMeta.status === 'Ausente' || sessionMeta.absentAt)) {
        const resumedSession = {
          ...sessionMeta,
          lastActivityAt: nowIso,
          status: 'Activa',
          absentAt: null,
        };

        currentSessionMetaRef.current = resumedSession;
        setCurrentSessionMeta(resumedSession);
        void writeSessionTransitionLog('Sesion Reanudada', resumedSession, 'Actividad detectada nuevamente');
        return;
      }

      const lastActivityMs = sessionMeta.lastActivityAt ? new Date(sessionMeta.lastActivityAt).getTime() : 0;
      if (Number.isFinite(lastActivityMs) && now.getTime() - lastActivityMs < SESSION_ACTIVITY_UPDATE_THROTTLE_MS) {
        return;
      }

      const nextSession = {
        ...sessionMeta,
        lastActivityAt: nowIso,
        status: 'Activa',
      };

      currentSessionMetaRef.current = nextSession;
      setCurrentSessionMeta(nextSession);
    };

    const activityEvents = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'focus'];

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, handleSessionActivity, { passive: true });
    });

    return () => {
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, handleSessionActivity);
      });
    };
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const sessionMeta = currentSessionMetaRef.current;
      if (!sessionMeta) return;

      const derivedStatus = deriveSessionStatus(sessionMeta);

      if (derivedStatus === 'Expirada' && sessionMeta.status !== 'Expirada') {
        void expireCurrentSession();
        return;
      }

      if (derivedStatus === 'Ausente' && sessionMeta.status === 'Activa') {
        void updateSessionStatus('Ausente', '10 minutos sin actividad');
      }
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, []);

  const handleUpdateLogNote = async (logId, newNote) => {
    try {
      const { error } = await supabase.from('logs').update({ reason: newNote }).eq('id', logId);
      if (error) throw error;
      
      setDailyLogs(prev => prev.map(log => {
        if (log.id === logId) {
            const updatedLog = { ...log, reason: newNote };
            updatedLog.isTest = isTestRecord({ action: updatedLog.action, details: updatedLog.details, reason: updatedLog.reason });
            return updatedLog;
        }
        return log;
      }));
      setHistoryLogs((prev) =>
        prev.map((log) => {
          if (log.id !== logId) return log;
          const updatedLog = { ...log, reason: newNote };
          updatedLog.isTest = isTestRecord({ action: updatedLog.action, details: updatedLog.details, reason: updatedLog.reason });
          return updatedLog;
        })
      );
      
      showNotification('success', 'Nota Actualizada', 'La nota ha sido guardada correctamente.');
    } catch (err) {
      console.error("Error actualizando nota del log:", err);
      showNotification('error', 'Error', 'No se pudo actualizar la nota en la nube.');
    }
  };

  const handleExportProducts = (config, items) => {
    const dateStr = formatDateAR(new Date());
    const dataToExport = { config, items, date: dateStr };
    
    setExportPdfData(dataToExport);

    const logDetails = {
      type: config.isForClient ? 'Presupuesto' : 'Reporte Interno',
      clientName: config.clientName || null,
      itemCount: items.length,
      snapshot: dataToExport
    };

    addLog('Exportación PDF', logDetails, 'Exportación de catálogo');

    const defaultTitle = config.documentTitle 
      ? `${config.documentTitle} - ${config.clientName || 'Cliente'}` 
      : 'Reporte Interno';

    const safeName = defaultTitle.replace(/[^a-zA-Z0-9 _-]/g, '');

    setTimeout(async () => {
      try {
        const electronReq =
          window.require ||
          window['require'] ||
          globalThis.require ||
          globalThis['require'];

        if (electronReq) {
          const ipc = electronReq('electron').ipcRenderer;
          const result = await ipc.invoke('save-as-pdf', `${safeName}.pdf`);

          if (result.success) {
            showNotification('success', 'PDF Guardado', `Guardado en: ${result.filePath}`);
          } else if (!result.canceled) {
            Swal.fire('Error', 'No se pudo guardar el PDF: ' + result.error, 'error');
          }
        } else {
          window.print();
          showNotification('info', 'Vista de impresión abierta', 'No se detectó Electron; usá "Guardar como PDF" desde el diálogo del navegador');
        }
      } catch (e) {
        console.error('Error IPC:', e);
        window.print();
        showNotification('info', 'Vista de impresión abierta', 'Falló la conexión con Windows; usá "Guardar como PDF" desde el diálogo del navegador');
      }
      
      setTimeout(() => setExportPdfData(null), 500);
    }, 500);
  };
  
  const handleReprintPdf = (logDetails) => {
    if (!logDetails || !logDetails.snapshot) {
      showNotification('error', 'Error', 'No hay datos guardados para recrear este PDF.');
      return;
    }
    
    setExportPdfData(logDetails.snapshot);
    const config = logDetails.snapshot.config || {};
    const defaultTitle = config.documentTitle 
      ? `${config.documentTitle} - ${config.clientName || 'Cliente'} (Copia)` 
      : 'Reporte_Historico';
    const safeName = defaultTitle.replace(/[^a-zA-Z0-9 _-]/g, '');

    setTimeout(async () => {
      try {
        const electronReq =
          window.require ||
          window['require'] ||
          globalThis.require ||
          globalThis['require'];

        if (electronReq) {
          const ipc = electronReq('electron').ipcRenderer;
          const result = await ipc.invoke('save-as-pdf', `${safeName}.pdf`);
          
          if (result.success) {
            showNotification('success', 'PDF Guardado', `Guardado en: ${result.filePath}`);
          } else if (!result.canceled) {
            Swal.fire('Error', 'No se pudo guardar el PDF: ' + result.error, 'error');
          }
        } else {
          window.print();
          showNotification('info', 'Vista de impresión abierta', 'No se detectó Electron; usá "Guardar como PDF" desde el diálogo del navegador.');
        }
      } catch (e) {
        console.error('Error IPC:', e);
        window.print();
        showNotification('info', 'Vista de impresión abierta', 'Falló la conexión con Windows; usá "Guardar como PDF" desde el diálogo del navegador.');
      }
      
      setTimeout(() => setExportPdfData(null), 500);
    }, 500);
  };
  

    // ? NUEVO: HANDLER PARA FIJAR PRODUCTO PERSONALIZADO DESDE EL PRESUPUESTO
  const handleCreateFixedProduct = async (title, price) => {
    if (blockIfOfflineReadonly('crear productos')) return;
    try {
      const payload = {
        title: title,
        brand: '',
        price: Number(price) || 0,
        purchasePrice: 0,
        stock: 0,
        category: 'Depósito', 
        barcode: null,
        image: '',
        product_type: 'quantity',
        expiration_date: null
      };
      
      const { data, error } = await supabase
        .from('products')
        .insert([payload])
        .select(CLOUD_SELECTS.products)
        .single();
      if (error) throw error;
      
      const itemFormatted = { 
          ...data, 
          categories: ['Depósito'] 
      };
      setInventory(prev => [...prev, itemFormatted]);
      
      addLog('Alta de Producto', { id: data.id, title: data.title, price: data.price, category: data.category }, 'Fijado desde Presupuesto');
      showNotification('success', 'Producto Fijado', `Se guardó en Depósito con stock 0.`);
      
      return itemFormatted;
    } catch (err) {
      console.error('Error fijando producto:', err);
      showNotification('error', 'Error', 'No se pudo fijar el producto.');
      return null;
    }
  };

  const handleCreateBudget = async (budgetData) => {
    if (blockIfOfflineReadonly('crear presupuestos')) return;
    try {
      const payload = {
        member_id: budgetData.memberId || null,
        customer_name: budgetData.customerName || '',
        customer_phone: budgetData.customerPhone || '',
        customer_note: budgetData.customerNote || '',
        document_title: budgetData.documentTitle || 'PRESUPUESTO',
        event_label: budgetData.eventLabel || '',
        payment_method: budgetData.paymentMethod || 'Efectivo',
        payment_breakdown: budgetData.paymentBreakdown || null,
        installments: Number(budgetData.installments || 0),
        items_snapshot: budgetData.itemsSnapshot || [],
        total_amount: Number(budgetData.totalAmount || 0),
        is_active: true,
      };

      const { data } = await insertWithSchemaFallback('budgets', payload, CLOUD_SELECTS.budgets);

      const newBudget = mapBudgetRecords([data])[0];
      setBudgets((prev) => [newBudget, ...prev]);
      addLog(
        'Presupuesto Creado',
        {
          id: newBudget.id,
          sharedRecordId: newBudget.id,
          customerName: newBudget.customerName,
          memberId: newBudget.memberId,
          customerPhone: newBudget.customerPhone || '',
          customerNote: newBudget.customerNote || '',
          eventLabel: newBudget.eventLabel || '',
          documentTitle: newBudget.documentTitle || 'PRESUPUESTO',
          totalAmount: newBudget.totalAmount,
          itemCount: newBudget.itemsSnapshot.length,
          itemsSnapshot: buildOrderLogItems(newBudget.itemsSnapshot || []),
        },
        newBudget.eventLabel || 'Gestion de pedidos'
      );
      showNotification('success', 'Presupuesto Creado', 'Se guardó correctamente en Pedidos.');
      return newBudget;
    } catch (error) {
      console.error('Error creando presupuesto:', error);
      showNotification('error', 'Error', `No se pudo guardar el presupuesto. ${getCloudErrorMessage(error)}`);
      throw error;
    }
  };

  const handleUpdateBudget = async (id, budgetData) => {
    if (blockIfOfflineReadonly('editar presupuestos')) return;
    try {
      const previousBudget = budgets.find((budget) => String(budget.id) === String(id)) || null;
      const payload = {
        member_id: budgetData.memberId || null,
        customer_name: budgetData.customerName || '',
        customer_phone: budgetData.customerPhone || '',
        customer_note: budgetData.customerNote || '',
        document_title: budgetData.documentTitle || 'PRESUPUESTO',
        event_label: budgetData.eventLabel || '',
        payment_method: budgetData.paymentMethod || 'Efectivo',
        payment_breakdown: budgetData.paymentBreakdown || null,
        installments: Number(budgetData.installments || 0),
        items_snapshot: budgetData.itemsSnapshot || [],
        total_amount: Number(budgetData.totalAmount || 0),
      };

      const { data } = await updateWithSchemaFallback('budgets', id, payload, CLOUD_SELECTS.budgets);
      const updatedBudget = mapBudgetRecords([data])[0];

      setBudgets((prev) =>
        prev.map((budget) => (budget.id === id ? updatedBudget : budget))
      );

      addLog(
        'Presupuesto Editado',
        {
          id,
          sharedRecordId: id,
          customerName: updatedBudget.customerName,
          memberId: updatedBudget.memberId,
          customerPhone: updatedBudget.customerPhone || '',
          customerNote: updatedBudget.customerNote || '',
          eventLabel: updatedBudget.eventLabel || '',
          documentTitle: updatedBudget.documentTitle || 'PRESUPUESTO',
          totalAmount: Number(updatedBudget.totalAmount || 0),
          itemCount: (updatedBudget.itemsSnapshot || []).length,
          itemsSnapshot: buildOrderLogItems(updatedBudget.itemsSnapshot || []),
          previousItemsSnapshot: buildOrderLogItems(previousBudget?.itemsSnapshot || []),
          changes: buildBudgetChanges(previousBudget, updatedBudget),
        },
        budgetData.eventLabel || 'Gestion de pedidos'
      );
      showNotification('success', 'Presupuesto Actualizado', 'Los cambios se guardaron.');
    } catch (error) {
      console.error('Error actualizando presupuesto:', error);
      showNotification('error', 'Error', `No se pudo actualizar el presupuesto. ${getCloudErrorMessage(error)}`);
      throw error;
    }
  };

  const handleUpdateOrder = async (id, orderData) => {
    if (blockIfOfflineReadonly('editar pedidos')) return;
    try {
      const previousOrder = orders.find((order) => String(order.id) === String(id)) || null;
      if (!previousOrder) {
        throw new Error('No se encontró el pedido a actualizar.');
      }

      const nextTotalAmount = Number(orderData.totalAmount || 0);
      if (nextTotalAmount < Number(previousOrder.paidTotal || 0)) {
        showNotification('warning', 'Total inválido', 'El total del pedido no puede quedar por debajo del dinero ya registrado.');
        return;
      }
      const nextPaidTotal = Math.min(Number(previousOrder.paidTotal || 0), nextTotalAmount);
      const nextDepositAmount = Math.min(Number(previousOrder.depositAmount || 0), nextPaidTotal);
      const nextRemainingAmount = Math.max(nextTotalAmount - nextPaidTotal, 0);
      const nextStatus = deriveOrderStatus({
        paidTotal: nextPaidTotal,
        totalAmount: nextTotalAmount,
        currentStatus: previousOrder.status,
      });

      const orderPreview = {
        ...previousOrder,
        memberId: orderData.memberId || null,
        customerName: orderData.customerName || '',
        customerPhone: orderData.customerPhone || '',
        customerNote: orderData.customerNote || '',
        documentTitle: orderData.documentTitle || 'PEDIDO',
        eventLabel: orderData.eventLabel || '',
        itemsSnapshot: orderData.itemsSnapshot || [],
        totalAmount: nextTotalAmount,
        depositAmount: nextDepositAmount,
        paidTotal: nextPaidTotal,
        remainingAmount: nextRemainingAmount,
        status: nextStatus,
      };

      const isCrossingToFullyPaid =
        Number(previousOrder.paidTotal || 0) < Number(previousOrder.totalAmount || 0) &&
        nextPaidTotal >= nextTotalAmount &&
        nextTotalAmount > 0;
      const wasStockReserved = isOrderStockReserved(previousOrder);

      if (isCrossingToFullyPaid) {
        const { stockIssues } = getOrderStockIssues(orderPreview);
        if (stockIssues.length > 0) {
          showNotification('error', 'Stock Insuficiente', `No se puede guardar el pedido: ${stockIssues.join(', ')}`);
          return;
        }
      }

      let reservationChanges = [];
      if (wasStockReserved) {
        const { stockIssues, stockChanges } = await syncReservedOrderStock(previousOrder, orderPreview);
        if (stockIssues.length > 0) {
          showNotification('error', 'Stock Insuficiente', `No se puede guardar el pedido: ${stockIssues.join(', ')}`);
          return;
        }
        reservationChanges = stockChanges;
      }

      const payload = {
        member_id: orderPreview.memberId || null,
        customer_name: orderPreview.customerName || '',
        customer_phone: orderPreview.customerPhone || '',
        customer_note: orderPreview.customerNote || '',
        document_title: orderPreview.documentTitle || 'PEDIDO',
        event_label: orderPreview.eventLabel || '',
        items_snapshot: orderPreview.itemsSnapshot || [],
        total_amount: nextTotalAmount,
        deposit_amount: nextDepositAmount,
        paid_total: nextPaidTotal,
        remaining_amount: nextRemainingAmount,
        pickup_date: previousOrder.pickupDate || null,
        status: nextStatus,
      };

      const { data } = await updateWithSchemaFallback('orders', id, payload, CLOUD_SELECTS.orders);
      const updatedOrder = mapOrderRecords([data])[0];

      setOrders((prev) =>
        prev.map((order) => (String(order.id) === String(id) ? updatedOrder : order))
      );

      let finalizedSale = null;
      if (isCrossingToFullyPaid && Number(updatedOrder.totalAmount || 0) > 0) {
        finalizedSale = await handleFinalizePaidOrder(updatedOrder, {
          skipStockDeduction: wasStockReserved,
        });
      }

      addLog(
        'Pedido Editado',
        {
          id,
          budgetId: updatedOrder.budgetId || null,
          sharedRecordId: updatedOrder.budgetId || id,
          saleId: finalizedSale?.id || null,
          transactionId: finalizedSale?.id || null,
          customerName: updatedOrder.customerName,
          memberId: updatedOrder.memberId,
          customerPhone: updatedOrder.customerPhone || '',
          customerNote: updatedOrder.customerNote || '',
          eventLabel: updatedOrder.eventLabel || '',
          documentTitle: updatedOrder.documentTitle || 'PEDIDO',
          totalAmount: Number(updatedOrder.totalAmount || 0),
          depositAmount: Number(updatedOrder.depositAmount || 0),
          paidTotal: Number(updatedOrder.paidTotal || 0),
          remainingAmount: Number(updatedOrder.remainingAmount || 0),
          pickupDate: updatedOrder.pickupDate || null,
          itemCount: (updatedOrder.itemsSnapshot || []).length,
          itemsSnapshot: buildOrderLogItems(updatedOrder.itemsSnapshot || []),
          previousItemsSnapshot: buildOrderLogItems(previousOrder.itemsSnapshot || []),
          changes: buildBudgetChanges(previousOrder, updatedOrder),
          stockChanges: finalizedSale?.stockChanges || reservationChanges,
        },
        orderData.eventLabel || 'Gestion de pedidos'
      );
      showNotification('success', 'Pedido Actualizado', 'Los cambios del pedido se guardaron.');
    } catch (error) {
      console.error('Error actualizando pedido:', error);
      showNotification('error', 'Error', `No se pudo actualizar el pedido. ${getCloudErrorMessage(error)}`);
      throw error;
    }
  };

  const handleDeleteBudget = async (budgetRecord) => {
    if (blockIfOfflineReadonly('eliminar presupuestos')) return;
    try {
      const { data } = await updateWithSchemaFallback(
        'budgets',
        budgetRecord.id,
        { is_active: false },
        CLOUD_SELECTS.budgets,
      );

      const deletedBudget = mapBudgetRecords([data])[0];
      setBudgets((prev) => prev.filter((budget) => budget.id !== budgetRecord.id));

      addLog(
        'Presupuesto Eliminado',
        {
          id: budgetRecord.id,
          sharedRecordId: budgetRecord.id,
          customerName: deletedBudget?.customerName || budgetRecord.customerName,
          customerPhone: deletedBudget?.customerPhone || budgetRecord.customerPhone || '',
          customerNote: deletedBudget?.customerNote || budgetRecord.customerNote || '',
          memberId: deletedBudget?.memberId ?? budgetRecord.memberId ?? null,
          documentTitle: deletedBudget?.documentTitle || budgetRecord.documentTitle || 'PRESUPUESTO',
          eventLabel: deletedBudget?.eventLabel || budgetRecord.eventLabel || '',
          totalAmount: Number(deletedBudget?.totalAmount ?? budgetRecord.totalAmount ?? 0),
          itemCount: (deletedBudget?.itemsSnapshot || budgetRecord.itemsSnapshot || []).length,
          itemsSnapshot: buildOrderLogItems(deletedBudget?.itemsSnapshot || budgetRecord.itemsSnapshot || []),
        },
        deletedBudget?.eventLabel || budgetRecord.eventLabel || 'Gestion de pedidos'
      );
      showNotification('success', 'Presupuesto Eliminado', 'El presupuesto fue eliminado de Pedidos.');
    } catch (error) {
      console.error('Error eliminando presupuesto:', error);
      showNotification('error', 'Error', `No se pudo eliminar el presupuesto. ${getCloudErrorMessage(error)}`);
      throw error;
    }
  };

  const getOrderCheckoutItems = (orderRecord) =>
    hydrateBudgetSnapshot(orderRecord.itemsSnapshot || []).map((item) => ({
      ...item,
      productId: item.productId ?? null,
      qty: Number(item.qty || item.quantity || 0) || 0,
      newPrice: Number(item.newPrice || item.unit_price || item.price || 0) || 0,
      isTemporary: Boolean(item.isTemporary || item.is_custom || !item.productId),
      product_type: item.product_type || 'quantity',
    }));

  const buildOrderRequiredStock = (items = []) =>
    items.reduce((acc, item) => {
      if (!item.productId || item.isTemporary) return acc;
      const nextQty = Number(item.qty || item.quantity || 0) || 0;
      if (nextQty <= 0) return acc;
      acc[String(item.productId)] = (acc[String(item.productId)] || 0) + nextQty;
      return acc;
    }, {});

  const getOrderStockIssues = (orderRecord) => {
    const items = getOrderCheckoutItems(orderRecord);
    const requiredStock = buildOrderRequiredStock(items);
    const stockIssues = Object.entries(requiredStock)
      .map(([id, requiredQty]) => {
        const product = inventory.find((entry) => String(entry.id) === String(id));
        if (!product) return `Producto #${id} (ya no existe en inventario)`;
        if (Number(product.stock || 0) < Number(requiredQty || 0)) {
          return `${product.title} (faltan ${Number(requiredQty || 0) - Number(product.stock || 0)})`;
        }
        return null;
      })
      .filter(Boolean);

    return {
      items,
      requiredStock,
      stockIssues,
    };
  };

  const isOrderStockReserved = (orderRecord) =>
    Boolean(orderRecord) &&
    Number(orderRecord.paidTotal || 0) > 0 &&
    Number(orderRecord.remainingAmount || 0) > 0 &&
    !['Retirado', 'Cancelado'].includes(String(orderRecord.status || ''));

  const applyOrderStockDelta = async (deltaByProduct = {}) => {
    const entries = Object.entries(deltaByProduct).filter(([, delta]) => Number(delta || 0) !== 0);
    if (entries.length === 0) return { stockChanges: [], stockIssues: [] };

    const stockIssues = entries
      .map(([id, delta]) => {
        const product = inventory.find((entry) => String(entry.id) === String(id));
        if (!product) return `Producto #${id} (ya no existe en inventario)`;
        const stockBefore = Number(product.stock || 0);
        const nextStock = stockBefore + Number(delta || 0);
        if (nextStock < 0) {
          return `${product.title} (faltan ${Math.abs(nextStock)})`;
        }
        return null;
      })
      .filter(Boolean);

    if (stockIssues.length > 0) {
      return { stockChanges: [], stockIssues };
    }

    const stockChanges = entries
      .map(([id, delta]) => {
        const product = inventory.find((entry) => String(entry.id) === String(id));
        if (!product) return null;
        const stockBefore = Number(product.stock || 0);
        const quantityChanged = Math.abs(Number(delta || 0));
        return {
          productId: product.id,
          title: product.title,
          product_type: product.product_type || 'quantity',
          quantityChanged,
          quantityReserved: Number(delta || 0) < 0 ? quantityChanged : 0,
          quantityRestored: Number(delta || 0) > 0 ? quantityChanged : 0,
          stockBefore,
          stockAfter: stockBefore + Number(delta || 0),
        };
      })
      .filter(Boolean);

    for (const [id, delta] of entries) {
      const product = inventory.find((entry) => String(entry.id) === String(id));
      if (!product) continue;
      await supabase
        .from('products')
        .update({ stock: Number(product.stock || 0) + Number(delta || 0) })
        .eq('id', id);
    }

    setInventory((prev) =>
      prev.map((product) => {
        const delta = deltaByProduct[String(product.id)];
        return delta ? { ...product, stock: Number(product.stock || 0) + Number(delta || 0) } : product;
      })
    );

    return { stockChanges, stockIssues: [] };
  };

  const reserveOrderStock = async (orderRecord) => {
    const { requiredStock } = getOrderStockIssues(orderRecord);
    const deltaByProduct = Object.fromEntries(
      Object.entries(requiredStock).map(([id, qty]) => [id, -Number(qty || 0)])
    );
    return applyOrderStockDelta(deltaByProduct);
  };

  const restoreOrderStock = async (orderRecord) => {
    const { requiredStock } = getOrderStockIssues(orderRecord);
    const deltaByProduct = Object.fromEntries(
      Object.entries(requiredStock).map(([id, qty]) => [id, Number(qty || 0)])
    );
    return applyOrderStockDelta(deltaByProduct);
  };

  const syncReservedOrderStock = async (previousOrder, nextOrder) => {
    const previousRequired = buildOrderRequiredStock(getOrderCheckoutItems(previousOrder));
    const nextRequired = buildOrderRequiredStock(getOrderCheckoutItems(nextOrder));
    const allIds = new Set([...Object.keys(previousRequired), ...Object.keys(nextRequired)]);
    const deltaByProduct = {};

    allIds.forEach((id) => {
      const previousQty = Number(previousRequired[id] || 0);
      const nextQty = Number(nextRequired[id] || 0);
      const delta = previousQty - nextQty;
      if (delta !== 0) {
        deltaByProduct[id] = delta;
      }
    });

    return applyOrderStockDelta(deltaByProduct);
  };

  const buildOrderLogItems = (itemsSnapshot = []) =>
    hydrateBudgetSnapshot(itemsSnapshot).map((item) => ({
      id: item.productId || item.id || null,
      productId: item.productId || null,
      title: item.title,
      category: item.category || null,
      quantity: Number(item.qty || 0),
      qty: Number(item.qty || 0),
      unitPrice: Number(item.newPrice || 0),
      price: Number(item.newPrice || 0),
      subtotal: Number(item.newPrice || 0) * (item.product_type === 'weight' ? Number(item.qty || 0) / 1000 : Number(item.qty || 0)),
      product_type: item.product_type || 'quantity',
      isCustom: Boolean(item.isTemporary),
    }));

  const buildBudgetChanges = (previousRecord, nextRecord) => {
    if (!previousRecord) return [];

    const prevItems = previousRecord.itemsSnapshot || [];
    const nextItems = nextRecord.itemsSnapshot || [];
    const changes = [];

    const pushChange = (field, oldValue, newValue, extra = {}) => {
      if (oldValue === newValue) return;
      changes.push({ field, old: oldValue, new: newValue, ...extra });
    };

    pushChange('Cliente', previousRecord.customerName || '', nextRecord.customerName || '');
    pushChange('Teléfono', previousRecord.customerPhone || '', nextRecord.customerPhone || '');
    pushChange('Nota', previousRecord.customerNote || '', nextRecord.customerNote || '');
    pushChange('Evento', previousRecord.eventLabel || '', nextRecord.eventLabel || '');
    pushChange('Documento', previousRecord.documentTitle || '', nextRecord.documentTitle || '');
    pushChange('Total', Number(previousRecord.totalAmount || 0), Number(nextRecord.totalAmount || 0), { isPrice: true });
    pushChange('Items', prevItems.length, nextItems.length);

    return changes;
  };

  const roundOrderPaymentValue = (value) => Math.round((Number(value) || 0) * 100) / 100;

  const buildOrderPaymentRecord = (paymentPayload = {}, fallbackAmount = 0) => {
    const amount = roundOrderPaymentValue(paymentPayload.amount ?? fallbackAmount);
    const rawLines = Array.isArray(paymentPayload.paymentBreakdown) && paymentPayload.paymentBreakdown.length > 0
      ? paymentPayload.paymentBreakdown
      : [{
          method: paymentPayload.paymentMethod || 'Efectivo',
          amount,
          installments: paymentPayload.installments || 0,
          cashReceived: paymentPayload.cashReceived || 0,
          cashChange: paymentPayload.cashChange || 0,
        }];

    const lines = rawLines
      .map((line) => createOrderPaymentLine(line))
      .filter((line) => Number(line.amount || 0) > 0);
    const computedAmount = roundOrderPaymentValue(
      amount > 0 ? amount : lines.reduce((sum, line) => sum + Number(line.amount || 0), 0)
    );
    const summary = getPrimaryPaymentInfo(
      lines,
      paymentPayload.paymentMethod || 'Efectivo',
      paymentPayload.installments || 0,
      paymentPayload.cashReceived || 0,
      paymentPayload.cashChange || 0,
      computedAmount,
    );

    return {
      amount: computedAmount,
      paymentMethod: summary.payment,
      primaryMethod: summary.primaryMethod,
      installments: summary.installments,
      cashReceived: summary.cashReceived,
      cashChange: summary.cashChange,
      paymentBreakdown: lines,
    };
  };

  const getOrderPaymentState = (orderLike = {}) =>
    getOrderPaymentHistorySummary(
      orderLike.paymentHistory || orderLike.paymentBreakdown,
      orderLike.paymentMethod || 'Pedido',
      orderLike.installments || 0,
      Number(orderLike.paidTotal || 0),
      Number(orderLike.cashReceived || 0),
      Number(orderLike.cashChange || 0),
    );

  const handleFinalizePaidOrder = async (orderRecord, { skipStockDeduction = false } = {}) => {
    const alreadyLogged = transactions.some((tx) => String(tx.orderId || '') === String(orderRecord.id));
    if (alreadyLogged) return null;

    const { items, requiredStock, stockIssues } = getOrderStockIssues(orderRecord);
    if (!skipStockDeduction && stockIssues.length > 0) {
      throw new Error(`No hay stock suficiente para completar el pedido: ${stockIssues.join(', ')}`);
    }

    const totalAmount = Number(orderRecord.totalAmount || 0);
    const clientId = orderRecord.memberId || null;
    const pointsEarned = clientId ? Math.floor(totalAmount / 500) : 0;
    const pointsSpent = 0;
    const actor = getActorContext();
    const paymentState = getOrderPaymentState(orderRecord);
    const inheritedPaymentBreakdown = paymentState.paymentBreakdown;
    const paymentInfo = getPrimaryPaymentInfo(
      inheritedPaymentBreakdown,
      orderRecord.paymentMethod || 'Pedido',
      orderRecord.installments || 0,
      paymentState.cashReceived || 0,
      paymentState.cashChange || 0,
      totalAmount,
    );

    const { data: sale, error: saleErr } = await insertWithSchemaFallback('sales', {
      total: totalAmount,
      payment_method: paymentInfo.payment,
      payment_breakdown: inheritedPaymentBreakdown,
      installments: paymentInfo.installments || 0,
      cash_received: Number(paymentInfo.cashReceived || 0),
      cash_change: Number(paymentInfo.cashChange || 0),
      client_id: clientId,
      points_earned: clientId ? pointsEarned : 0,
      points_spent: 0,
      user_id: actor.userId,
      user_role: actor.userRole,
      user_name: actor.userName,
    }, 'id');

    if (saleErr) throw saleErr;

    const itemsPayload = items.map((item) => ({
      sale_id: sale.id,
      product_id: item.isTemporary ? null : item.productId,
      product_title: item.title,
      quantity: item.qty,
      price: item.newPrice,
      is_reward: false,
    }));

    await insertRowsWithSchemaFallback('sale_items', itemsPayload);

    let stockChanges = [];
    if (!skipStockDeduction) {
      stockChanges = Object.entries(requiredStock)
        .map(([id, qtyToDeduct]) => {
          const product = inventory.find((entry) => String(entry.id) === String(id));
          if (!product) return null;
          const stockBefore = Number(product.stock || 0);
          return {
            productId: product.id,
            title: product.title,
            product_type: product.product_type || 'quantity',
            quantitySold: Number(qtyToDeduct || 0),
            stockBefore,
            stockAfter: stockBefore - Number(qtyToDeduct || 0),
          };
        })
        .filter(Boolean);

      for (const [id, qtyToDeduct] of Object.entries(requiredStock)) {
        const product = inventory.find((entry) => String(entry.id) === String(id));
        if (product) {
          await supabase
            .from('products')
            .update({ stock: Number(product.stock || 0) - Number(qtyToDeduct || 0) })
            .eq('id', id);
        }
      }
    }

    let updatedClientForHistory = null;
    let pointsChange = null;
    if (clientId) {
      const linkedMember = members.find((member) => String(member.id) === String(clientId));
      if (linkedMember) {
        const previousPoints = Number(linkedMember.points || 0);
        const newPoints = previousPoints + pointsEarned;
        pointsChange = { previous: previousPoints, new: newPoints, diff: newPoints - previousPoints };
        await supabase.from('clients').update({ points: newPoints }).eq('id', clientId);
        updatedClientForHistory = { ...linkedMember, points: newPoints, currentPoints: newPoints };
        setMembers((prev) =>
          prev.map((member) =>
            String(member.id) === String(clientId) ? { ...member, points: newPoints, currentPoints: newPoints } : member
          )
        );
      }
    }

    if (!skipStockDeduction) {
      setInventory((prev) =>
        prev.map((product) => {
          const qtyToDeduct = requiredStock[String(product.id)];
          return qtyToDeduct ? { ...product, stock: Number(product.stock || 0) - Number(qtyToDeduct || 0) } : product;
        })
      );
    }

    const now = new Date();
    const historyItems = items.map((item) => ({
      id: item.productId || item.id,
      productId: item.productId || null,
      title: item.title,
      quantity: item.qty,
      qty: item.qty,
      price: item.newPrice,
      isReward: false,
      product_type: item.product_type || 'quantity',
      isCustom: Boolean(item.isTemporary),
      isCombo: false,
      category: item.category || null,
    }));

    const fallbackClientName = orderRecord.customerName || 'Cliente';
    const fallbackPhone = orderRecord.customerPhone || '';
    const txClient = clientId
      ? updatedClientForHistory || members.find((member) => String(member.id) === String(clientId)) || null
      : fallbackClientName
        ? { id: 'guest', name: fallbackClientName, phone: fallbackPhone }
        : null;

    const tx = {
      id: sale.id,
      date: formatDateAR(now),
      time: formatTimeFullAR(now),
      user: currentUser.displayName || currentUser.name,
      userId: currentUser.id || null,
      userRole: currentUser.role || null,
      total: totalAmount,
      payment: paymentInfo.payment,
      paymentBreakdown: inheritedPaymentBreakdown,
      installments: paymentInfo.installments || 0,
      cashReceived: Number(paymentInfo.cashReceived || 0),
      cashChange: Number(paymentInfo.cashChange || 0),
      items: historyItems,
      status: 'completed',
      client: txClient,
      pointsEarned: clientId ? pointsEarned : 0,
      pointsSpent,
      orderId: orderRecord.id,
      budgetId: orderRecord.budgetId || null,
    };
    tx.stockChanges = stockChanges;

    tx.isTest = isTestRecord(tx);
    setTransactions((prev) => [tx, ...prev]);

      const logItems = historyItems.map((item) => ({
        id: item.id,
        title: item.title,
        quantity: item.quantity,
        price: item.price,
        subtotal:
          (Number(item.price) || 0) *
          ((item.product_type || 'quantity') === 'weight'
            ? Number(item.quantity || 0) / 1000
            : Number(item.quantity || 0)),
        isReward: false,
        product_type: item.product_type || 'quantity',
        isCustom: Boolean(item.isCustom),
      isCombo: false,
      isDiscount: false,
      productsIncluded: [],
    }));

    await addLog(
      'Venta Realizada',
      {
        transactionId: tx.id,
        orderId: orderRecord.id,
        budgetId: orderRecord.budgetId || null,
        sharedRecordId: orderRecord.budgetId || orderRecord.id,
        documentTitle: orderRecord.documentTitle || 'PEDIDO',
        eventLabel: orderRecord.eventLabel || '',
        customerName: orderRecord.customerName || fallbackClientName || '',
        customerPhone: orderRecord.customerPhone || fallbackPhone || '',
        customerNote: orderRecord.customerNote || '',
        memberId: clientId || null,
        total: totalAmount,
        items: logItems,
        payment: paymentInfo.payment,
        paymentBreakdown: inheritedPaymentBreakdown,
        paymentHistory: paymentState.paymentHistory,
        installments: paymentInfo.installments || 0,
        cashReceived: Number(paymentInfo.cashReceived || 0),
        cashChange: Number(paymentInfo.cashChange || 0),
        client: clientId ? (txClient?.name || fallbackClientName || null) : null,
        memberNumber: clientId ? (txClient?.memberNumber || null) : null,
        pointsEarned: clientId ? pointsEarned : 0,
        pointsSpent,
        pointsChange,
        stockChanges,
      },
      'Cobro total desde Pedidos'
    );

    return tx;
  };

  const handleConvertBudgetToOrder = async (budgetRecord, { pickupDate, depositPayment }) => {
    if (blockIfOfflineReadonly('convertir presupuestos a pedidos')) return;
    try {
      const existingLinkedOrder = orders.find(
        (order) => String(order.budgetId) === String(budgetRecord.id) && order.isActive !== false
      );
      if (existingLinkedOrder) {
        showNotification('warning', 'Pedido Existente', 'Ese presupuesto ya tiene un pedido vinculado.');
        return existingLinkedOrder;
      }

      const totalAmount = Number(budgetRecord.totalAmount || 0);
      const normalizedDepositPayment = buildOrderPaymentRecord(depositPayment, depositPayment?.amount || 0);
      const initialPayment = Math.min(Math.max(Number(normalizedDepositPayment.amount || 0), 0), totalAmount);
      const remainingAmount = Math.max(totalAmount - initialPayment, 0);
      const status = deriveOrderStatus({ paidTotal: initialPayment, totalAmount });
      const paymentHistory = initialPayment > 0
        ? [createOrderPaymentEntry({
            entryType: 'deposit',
            amount: initialPayment,
            lines: normalizedDepositPayment.paymentBreakdown,
          })]
        : [];
      const paymentHistoryState = getOrderPaymentHistorySummary(
        paymentHistory,
        normalizedDepositPayment.primaryMethod || 'Efectivo',
        normalizedDepositPayment.installments || 0,
        initialPayment,
        normalizedDepositPayment.cashReceived || 0,
        normalizedDepositPayment.cashChange || 0,
      );

      if (initialPayment > 0) {
        const { stockIssues } = getOrderStockIssues(budgetRecord);
        if (stockIssues.length > 0) {
          showNotification('error', 'Stock Insuficiente', `No se puede señar el pedido: ${stockIssues.join(', ')}`);
          return null;
        }
      }

      const payload = {
        budget_id: budgetRecord.id,
        member_id: budgetRecord.memberId || null,
        customer_name: budgetRecord.customerName || '',
        customer_phone: budgetRecord.customerPhone || '',
        customer_note: budgetRecord.customerNote || '',
        document_title: budgetRecord.documentTitle || 'PEDIDO',
        event_label: budgetRecord.eventLabel || '',
        payment_method: paymentHistoryState.paymentMethod || null,
        payment_breakdown: paymentHistory,
        installments: paymentHistoryState.installments || 0,
        items_snapshot: budgetRecord.itemsSnapshot || [],
        total_amount: totalAmount,
        deposit_amount: initialPayment,
        paid_total: initialPayment,
        remaining_amount: remainingAmount,
        pickup_date: pickupDate,
        status,
        is_active: true,
      };

      const { data } = await insertWithSchemaFallback('orders', payload, CLOUD_SELECTS.orders);

      const newOrder = mapOrderRecords([data])[0];
      setOrders((prev) => [newOrder, ...prev]);
      let finalizedSale = null;
      let reservationChanges = [];

      if (initialPayment > 0) {
        const { stockIssues, stockChanges } = await reserveOrderStock(newOrder);
        if (stockIssues.length > 0) {
          showNotification('error', 'Stock Insuficiente', `No se pudo reservar stock para el pedido: ${stockIssues.join(', ')}`);
          return null;
        }
        reservationChanges = stockChanges;
      }

      if (initialPayment >= totalAmount && totalAmount > 0) {
        finalizedSale = await handleFinalizePaidOrder(newOrder, {
          skipStockDeduction: initialPayment > 0,
        });
      }

      addLog(
        'Pedido Creado',
        {
          id: newOrder.id,
          budgetId: budgetRecord.id,
          sharedRecordId: budgetRecord.id || newOrder.id,
          saleId: finalizedSale?.id || null,
          transactionId: finalizedSale?.id || null,
          memberId: newOrder.memberId || null,
          customerName: newOrder.customerName,
          customerPhone: newOrder.customerPhone || '',
          customerNote: newOrder.customerNote || '',
          eventLabel: newOrder.eventLabel || '',
          documentTitle: newOrder.documentTitle || 'PEDIDO',
          itemsSnapshot: buildOrderLogItems(newOrder.itemsSnapshot || []),
          itemCount: (newOrder.itemsSnapshot || []).length,
          totalAmount: newOrder.totalAmount,
          depositAmount: newOrder.depositAmount,
          paidTotal: newOrder.paidTotal,
          remainingAmount: newOrder.remainingAmount,
          paymentMethod: newOrder.paymentMethod || null,
          paymentBreakdown: newOrder.paymentBreakdown || null,
          paymentHistory: newOrder.paymentHistory || [],
          pickupDate: newOrder.pickupDate,
          stockChanges: finalizedSale?.stockChanges || reservationChanges,
        },
        budgetRecord.eventLabel || 'Conversión desde presupuesto'
      );
      showNotification('success', 'Pedido Creado', 'El presupuesto se convirtió en pedido.');
      return newOrder;
    } catch (error) {
      console.error('Error convirtiendo presupuesto:', error);
      showNotification('error', 'Error', `No se pudo convertir el presupuesto en pedido. ${getCloudErrorMessage(error)}`);
      throw error;
    }
  };

  const handleRegisterOrderPayment = async (orderRecord, paymentPayload) => {
    if (blockIfOfflineReadonly('registrar pagos de pedidos')) return;
    try {
      const normalizedPayment = buildOrderPaymentRecord(paymentPayload, paymentPayload?.amount || 0);
      const paymentAmount = Number(normalizedPayment.amount || 0);
      const isFirstPayment =
        Number(orderRecord.paidTotal || 0) <= 0 &&
        paymentAmount > 0;
      const wasStockReserved = isOrderStockReserved(orderRecord);
      const isCrossingToFullyPaid =
        Number(orderRecord.paidTotal || 0) < Number(orderRecord.totalAmount || 0) &&
        Number(orderRecord.paidTotal || 0) + paymentAmount >= Number(orderRecord.totalAmount || 0);

      if (isFirstPayment || isCrossingToFullyPaid) {
        const { stockIssues } = getOrderStockIssues(orderRecord);
        if (stockIssues.length > 0) {
          showNotification('error', 'Stock Insuficiente', `No se puede registrar el pago del pedido: ${stockIssues.join(', ')}`);
          return;
        }
      }

      const nextPaidTotal = Math.min(
        Number(orderRecord.totalAmount || 0),
        Number(orderRecord.paidTotal || 0) + paymentAmount
      );
      const nextRemaining = Math.max(Number(orderRecord.totalAmount || 0) - nextPaidTotal, 0);
      const status = deriveOrderStatus({
        paidTotal: nextPaidTotal,
        totalAmount: Number(orderRecord.totalAmount || 0),
        currentStatus: orderRecord.status,
      });
      const previousPaymentHistory = normalizeOrderPaymentHistory(
        orderRecord.paymentHistory || orderRecord.paymentBreakdown,
        orderRecord.paymentMethod || 'Pedido',
        orderRecord.installments || 0,
        Number(orderRecord.paidTotal || 0),
        Number(orderRecord.cashReceived || 0),
        Number(orderRecord.cashChange || 0),
      );
      const paymentEntry = createOrderPaymentEntry({
        entryType: 'payment',
        amount: paymentAmount,
        lines: normalizedPayment.paymentBreakdown,
      });
      const nextPaymentHistory = [...previousPaymentHistory, paymentEntry];
      const nextPaymentState = getOrderPaymentHistorySummary(
        nextPaymentHistory,
        normalizedPayment.primaryMethod || orderRecord.paymentMethod || 'Efectivo',
        normalizedPayment.installments || orderRecord.installments || 0,
        nextPaidTotal,
      );

      const payload = {
        payment_method: nextPaymentState.paymentMethod || orderRecord.paymentMethod || 'Pedido',
        payment_breakdown: nextPaymentHistory,
        installments: nextPaymentState.installments || 0,
        paid_total: nextPaidTotal,
        remaining_amount: nextRemaining,
        status,
      };

      const { data } = await updateWithSchemaFallback(
        'orders',
        orderRecord.id,
        payload,
        CLOUD_SELECTS.orders,
      );

      setOrders((prev) =>
        prev.map((order) => (order.id === orderRecord.id ? mapOrderRecords([data])[0] : order))
      );

      const updatedOrder = mapOrderRecords([data])[0];
      let finalizedSale = null;
      let reservationChanges = [];

      if (isFirstPayment) {
        const { stockIssues, stockChanges } = await reserveOrderStock(updatedOrder);
        if (stockIssues.length > 0) {
          showNotification('error', 'Stock Insuficiente', `No se pudo reservar stock para el pedido: ${stockIssues.join(', ')}`);
          return;
        }
        reservationChanges = stockChanges;
      }

      if (isCrossingToFullyPaid && Number(updatedOrder.totalAmount || 0) > 0) {
        finalizedSale = await handleFinalizePaidOrder(updatedOrder, {
          skipStockDeduction: wasStockReserved || isFirstPayment,
        });
      }

      addLog(
        'Pago Pedido',
        {
          id: orderRecord.id,
          budgetId: updatedOrder.budgetId || null,
          sharedRecordId: updatedOrder.budgetId || orderRecord.id,
          saleId: finalizedSale?.id || null,
          transactionId: finalizedSale?.id || null,
          customerName: updatedOrder.customerName,
          customerPhone: updatedOrder.customerPhone || '',
          customerNote: updatedOrder.customerNote || '',
          eventLabel: updatedOrder.eventLabel || '',
          documentTitle: updatedOrder.documentTitle || 'PEDIDO',
          totalAmount: Number(updatedOrder.totalAmount || 0),
          amount: paymentAmount,
          paymentMethod: normalizedPayment.paymentMethod,
          paymentBreakdown: normalizedPayment.paymentBreakdown,
          paymentHistory: updatedOrder.paymentHistory || nextPaymentHistory,
          paidTotal: nextPaidTotal,
          remainingAmount: nextRemaining,
          pickupDate: updatedOrder.pickupDate || null,
          itemsSnapshot: buildOrderLogItems(updatedOrder.itemsSnapshot || []),
          stockChanges: finalizedSale?.stockChanges || reservationChanges,
        },
        'Cobro manual en Pedidos'
      );
      showNotification('success', 'Pago Registrado', 'El pedido fue actualizado.');
    } catch (error) {
      console.error('Error registrando pago de pedido:', error);
      showNotification('error', 'Error', `No se pudo registrar el pago. ${getCloudErrorMessage(error)}`);
      throw error;
    }
  };

  const handleMarkOrderRetired = async (orderRecord) => {
    if (blockIfOfflineReadonly('marcar pedidos como retirados')) return;
    try {
      const { data } = await updateWithSchemaFallback(
        'orders',
        orderRecord.id,
        { status: 'Retirado' },
        CLOUD_SELECTS.orders,
      );
      const retiredOrder = mapOrderRecords([data])[0];

      setOrders((prev) =>
        prev.map((order) => (order.id === orderRecord.id ? retiredOrder : order))
      );

      addLog(
        'Pedido Retirado',
        {
          id: orderRecord.id,
          budgetId: retiredOrder.budgetId || null,
          sharedRecordId: retiredOrder.budgetId || orderRecord.id,
          customerName: retiredOrder.customerName,
          customerPhone: retiredOrder.customerPhone || '',
          customerNote: retiredOrder.customerNote || '',
          eventLabel: retiredOrder.eventLabel || '',
          documentTitle: retiredOrder.documentTitle || 'PEDIDO',
          totalAmount: retiredOrder.totalAmount,
          paidTotal: retiredOrder.paidTotal,
          remainingAmount: retiredOrder.remainingAmount,
          pickupDate: retiredOrder.pickupDate || null,
          itemsSnapshot: buildOrderLogItems(retiredOrder.itemsSnapshot || []),
        },
        'Entrega finalizada'
      );
      showNotification('success', 'Pedido Retirado', 'El pedido quedó marcado como entregado.');
    } catch (error) {
      console.error('Error marcando pedido retirado:', error);
      showNotification('error', 'Error', `No se pudo marcar el pedido como retirado. ${getCloudErrorMessage(error)}`);
      throw error;
    }
  };

  const handleCancelOrder = async (orderRecord, { keepDeposit }) => {
    if (blockIfOfflineReadonly('cancelar pedidos')) return;
    try {
      let restoredStockChanges = [];
      if (isOrderStockReserved(orderRecord)) {
        const { stockIssues, stockChanges } = await restoreOrderStock(orderRecord);
        if (stockIssues.length > 0) {
          showNotification('error', 'Stock', `No se pudo restaurar el stock del pedido: ${stockIssues.join(', ')}`);
          return;
        }
        restoredStockChanges = stockChanges;
      }

      const currentDeposit = Number(orderRecord.depositAmount || 0);
      const currentPaid = Number(orderRecord.paidTotal || 0);
      const retainedDeposit = keepDeposit ? Math.min(currentDeposit, currentPaid || currentDeposit) : 0;
      const refundedAmount = Math.max(currentPaid - retainedDeposit, 0);
      const currentPaymentHistory = normalizeOrderPaymentHistory(
        orderRecord.paymentHistory || orderRecord.paymentBreakdown,
        orderRecord.paymentMethod || 'Pedido',
        orderRecord.installments || 0,
        currentPaid,
      );
      const firstEntryAmount = Number(currentPaymentHistory[0]?.amount || 0);
      const retainedPaymentHistory = keepDeposit && retainedDeposit > 0 && currentPaymentHistory[0]
        ? [createOrderPaymentEntry({
            ...currentPaymentHistory[0],
            amount: retainedDeposit,
            lines: (currentPaymentHistory[0].lines || []).map((line) => ({
              ...line,
              amount: firstEntryAmount > 0
                ? roundOrderPaymentValue((Number(line.amount || 0) / firstEntryAmount) * retainedDeposit)
                : 0,
              chargedAmount: firstEntryAmount > 0
                ? roundOrderPaymentValue((Number(line.chargedAmount || line.amount || 0) / firstEntryAmount) * retainedDeposit)
                : 0,
              cashReceived: line.method === 'Efectivo'
                ? (firstEntryAmount > 0
                    ? roundOrderPaymentValue((Number(line.cashReceived || line.amount || 0) / firstEntryAmount) * retainedDeposit)
                    : retainedDeposit)
                : 0,
              cashChange: 0,
            })),
          })]
        : [];
      const retainedPaymentState = getOrderPaymentHistorySummary(
        retainedPaymentHistory,
        orderRecord.paymentMethod || 'Pedido',
        orderRecord.installments || 0,
        retainedDeposit,
      );

      const { data } = await updateWithSchemaFallback(
        'orders',
        orderRecord.id,
        {
          status: 'Cancelado',
          payment_method: retainedPaymentState.paymentMethod || null,
          payment_breakdown: retainedPaymentHistory,
          installments: retainedPaymentState.installments || 0,
          deposit_amount: retainedDeposit,
          paid_total: retainedDeposit,
          remaining_amount: 0,
        },
        CLOUD_SELECTS.orders,
      );

      setOrders((prev) =>
        prev.map((order) => (order.id === orderRecord.id ? mapOrderRecords([data])[0] : order))
      );

      addLog(
        'Pedido Cancelado',
        {
          id: orderRecord.id,
          budgetId: orderRecord.budgetId || null,
          sharedRecordId: orderRecord.budgetId || orderRecord.id,
          customerName: orderRecord.customerName,
          customerPhone: orderRecord.customerPhone || '',
          customerNote: orderRecord.customerNote || '',
          memberId: orderRecord.memberId || null,
          documentTitle: orderRecord.documentTitle || 'PEDIDO',
          eventLabel: orderRecord.eventLabel || '',
          keepDeposit: Boolean(keepDeposit),
          retainedDeposit,
          refundedAmount,
          totalAmount: Number(orderRecord.totalAmount || 0),
          paidTotal: Number(orderRecord.paidTotal || 0),
          pickupDate: orderRecord.pickupDate || null,
          itemsSnapshot: buildOrderLogItems(orderRecord.itemsSnapshot || []),
          stockChanges: restoredStockChanges,
        },
        keepDeposit ? 'Se retuvo la seña' : 'Se devolvió la seña'
      );
      showNotification(
        'success',
        'Pedido Cancelado',
        keepDeposit ? 'El pedido fue cancelado y la seña quedó retenida.' : 'El pedido fue cancelado y la seña fue devuelta.'
      );
    } catch (error) {
      console.error('Error cancelando pedido:', error);
      showNotification('error', 'Error', `No se pudo cancelar el pedido. ${getCloudErrorMessage(error)}`);
      throw error;
    }
  };

  const handleDeleteOrder = async (orderRecord) => {
    if (blockIfOfflineReadonly('eliminar pedidos')) return;
    try {
      let restoredStockChanges = [];
      if (isOrderStockReserved(orderRecord)) {
        const { stockIssues, stockChanges } = await restoreOrderStock(orderRecord);
        if (stockIssues.length > 0) {
          showNotification('error', 'Stock', `No se pudo restaurar el stock del pedido: ${stockIssues.join(', ')}`);
          return;
        }
        restoredStockChanges = stockChanges;
      }

      const { data } = await updateWithSchemaFallback(
        'orders',
        orderRecord.id,
        { is_active: false },
        CLOUD_SELECTS.orders,
      );

      const deletedOrder = mapOrderRecords([data])[0];
      setOrders((prev) => prev.filter((order) => order.id !== orderRecord.id));

      addLog(
        'Pedido Eliminado',
        {
          id: orderRecord.id,
          budgetId: deletedOrder?.budgetId ?? orderRecord.budgetId ?? null,
          sharedRecordId: deletedOrder?.budgetId ?? orderRecord.budgetId ?? orderRecord.id,
          customerName: deletedOrder?.customerName || orderRecord.customerName,
          customerPhone: deletedOrder?.customerPhone || orderRecord.customerPhone || '',
          customerNote: deletedOrder?.customerNote || orderRecord.customerNote || '',
          memberId: deletedOrder?.memberId ?? orderRecord.memberId ?? null,
          documentTitle: deletedOrder?.documentTitle || orderRecord.documentTitle || 'PEDIDO',
          eventLabel: deletedOrder?.eventLabel || orderRecord.eventLabel || '',
          totalAmount: Number(deletedOrder?.totalAmount ?? orderRecord.totalAmount ?? 0),
          depositAmount: Number(deletedOrder?.depositAmount ?? orderRecord.depositAmount ?? 0),
          paidTotal: Number(deletedOrder?.paidTotal ?? orderRecord.paidTotal ?? 0),
          remainingAmount: Number(deletedOrder?.remainingAmount ?? orderRecord.remainingAmount ?? 0),
          pickupDate: deletedOrder?.pickupDate || orderRecord.pickupDate || null,
          status: deletedOrder?.status || orderRecord.status,
          itemsSnapshot: buildOrderLogItems(deletedOrder?.itemsSnapshot || orderRecord.itemsSnapshot || []),
          stockChanges: restoredStockChanges,
        },
        deletedOrder?.eventLabel || orderRecord.eventLabel || 'Gestion de pedidos'
      );

      showNotification('success', 'Pedido Eliminado', 'El pedido fue eliminado de Pedidos.');
    } catch (error) {
      console.error('Error eliminando pedido:', error);
      showNotification('error', 'Error', `No se pudo eliminar el pedido. ${getCloudErrorMessage(error)}`);
      throw error;
    }
  };

  const handlePrintOrderRecord = (record) => {
    handleExportProducts(
      buildBudgetExportConfig(record),
      buildExportItemsFromSnapshot(record.itemsSnapshot || [])
    );
  };

  // ==========================================
  // ? HANDLERS DE OFERTAS
  // ==========================================
  const normalizeOfferProfitMargin = (value) => {
    if (typeof value === 'string' && value.startsWith('PERCENTAGE:')) {
      const parsedPercentage = Number(value.slice('PERCENTAGE:'.length));
      return Number.isFinite(parsedPercentage) ? parsedPercentage : 0;
    }

    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : 0;
  };

  const getLoggedOfferDiscountMode = (offerLike = {}) => {
    const rawProfitMargin = String(offerLike.profitMargin || '');
    if (rawProfitMargin.startsWith('PERCENTAGE:')) {
      return 'percentage';
    }

    const rawMode = String(offerLike.discountMode || '').toLowerCase();
    if (rawMode === 'percentage' || rawMode === 'total' || rawMode === 'unit') {
      return rawMode;
    }

    if (String(offerLike.type || '').toLowerCase() === 'cupon') {
      return Number(offerLike.itemsCount || 0) === 2 ? 'percentage' : 'total';
    }

    if (
      (offerLike.type === 'Descuento Total' || offerLike.type === 'Descuento Unidad') &&
      Number(offerLike.itemsCount || 0) === -1
    ) {
      return 'percentage';
    }

    if (offerLike.type === 'Descuento Total') return 'total';
    if (offerLike.type === 'Descuento Unidad') return 'unit';

    return '';
  };

  const normalizeOfferForPersistence = (offerLike = {}) => {
    if (offerLike && offerLike.benefitType) {
      const productsByCategory = (categories || []).reduce((acc, categoryName) => {
        acc[categoryName] = (inventory || []).filter((product) => product.category === categoryName);
        return acc;
      }, {});

      return buildLegacyOfferPayload(offerLike, productsByCategory, inventory || []);
    }

    return {
      name: String(offerLike.name || '').trim(),
      type: offerLike.type || '',
      applyTo: offerLike.applyTo || '',
      productsIncluded: Array.isArray(offerLike.productsIncluded) ? offerLike.productsIncluded : [],
      itemsCount: Number(offerLike.itemsCount) || 0,
      discountValue: Number(offerLike.discountValue) || 0,
      offerPrice: Number(offerLike.offerPrice) || 0,
      profitMargin: normalizeOfferProfitMargin(offerLike.profitMargin),
    };
  };

  const handleAddOffer = async (offerData) => {
    if (blockIfOfflineReadonly('crear ofertas o descuentos')) return;
    try {
      const payload = {
        name: offerData.name,
        type: offerData.type,
        apply_to: offerData.applyTo,
        products_included: offerData.productsIncluded || [],
        items_count: Number(offerData.itemsCount) || 0,
        discount_value: Number(offerData.discountValue) || 0,
        offer_price: Number(offerData.offerPrice) || 0,
        profit_margin: normalizeOfferProfitMargin(offerData.profitMargin),
        created_by: currentUser?.name || 'Sistema'
      };

      const { data, error } = await supabase
        .from('offers')
        .insert([payload])
        .select(CLOUD_SELECTS.offers)
        .single();
      if (error) throw error;

      const newOffer = {
        id: data.id,
        name: data.name,
        type: data.type,
        applyTo: data.apply_to,
        productsIncluded: data.products_included,
        itemsCount: data.items_count,
        discountValue: data.discount_value,
        offerPrice: data.offer_price,
        profitMargin: data.profit_margin,
        createdBy: data.created_by
      };

      setOffers([newOffer, ...offers]);
      
      addLog('Oferta Creada', {
        name: newOffer.name,
        type: newOffer.type,
        applyTo: newOffer.applyTo,
        productsIncluded: newOffer.productsIncluded.map(p => p.title),
        itemsCount: newOffer.itemsCount,
        discountValue: newOffer.discountValue,
        offerPrice: newOffer.offerPrice,
        profitMargin: newOffer.profitMargin,
        discountMode: getLoggedOfferDiscountMode(newOffer)
      });
      
      showNotification('success', 'Oferta Creada', 'La oferta se guardó en el catálogo.');
    } catch (e) {
      console.error(e);
      showNotification('error', 'Error', 'No se pudo crear la oferta en la nube.');
    }
  };

  const handleUpdateOffer = async (id, updatedData) => {
    if (blockIfOfflineReadonly('editar ofertas o descuentos')) return;
    try {
      const oldOffer = offers.find(o => o.id === id) || {};
      const normalizedUpdatedData = normalizeOfferForPersistence(updatedData);
      const safeProductsIncluded = Array.isArray(normalizedUpdatedData.productsIncluded)
        ? normalizedUpdatedData.productsIncluded
        : [];

      const payload = {
        name: normalizedUpdatedData.name,
        type: normalizedUpdatedData.type,
        apply_to: normalizedUpdatedData.applyTo,
        products_included: safeProductsIncluded,
        items_count: Number(normalizedUpdatedData.itemsCount) || 0,
        discount_value: Number(normalizedUpdatedData.discountValue) || 0,
        offer_price: Number(normalizedUpdatedData.offerPrice) || 0,
        profit_margin: normalizeOfferProfitMargin(normalizedUpdatedData.profitMargin)
      };

      const { error } = await supabase.from('offers').update(payload).eq('id', id);
      if (error) throw error;

      setOffers(offers.map(o => o.id === id ? { ...o, ...normalizedUpdatedData } : o));
      
      addLog('Oferta Editada', {
        id,
        name: normalizedUpdatedData.name,
        type: normalizedUpdatedData.type,
        applyTo: normalizedUpdatedData.applyTo,
        productsIncluded: safeProductsIncluded.map((product) =>
          typeof product === 'string'
            ? product
            : product?.title || product?.name || String(product?.id || 'Producto')
        ),
        itemsCount: normalizedUpdatedData.itemsCount,
        discountValue: normalizedUpdatedData.discountValue,
        offerPrice: normalizedUpdatedData.offerPrice,
        profitMargin: normalizedUpdatedData.profitMargin,
        discountMode: getLoggedOfferDiscountMode(normalizedUpdatedData),
        // Comparativas para el Log
        changedCount: safeProductsIncluded.length !== (oldOffer.productsIncluded || []).length,
        oldPrice: oldOffer.offerPrice,
        newPrice: normalizedUpdatedData.offerPrice
      });

      showNotification('success', 'Oferta Actualizada', 'Los cambios se guardaron.');
    } catch (e) {
      console.error(e);
      showNotification('error', 'Error', `No se pudo actualizar la oferta.${e?.message ? ` ${e.message}` : ''}`);
    }
  };

  const handleDeleteOffer = async (id) => {
    if (blockIfOfflineReadonly('eliminar ofertas o descuentos')) return;
    try {
      const offerToDelete = offers.find(o => o.id === id);
      if (!offerToDelete) return;

      const { error } = await supabase.from('offers').update({ is_active: false }).eq('id', id);
      if (error) throw error;

      // 1. Quitar la oferta del estado de React
      setOffers(offers.filter(o => o.id !== id));

      // 2. Eliminar la oferta de los productos en el inventario (Para cuando el POS las busque por producto)
      // (Esta lógica se disparará localmente, luego se sincronizará con la nube si es necesario).
      const affectedProducts = inventory.filter(p => p.activeOffers && p.activeOffers.includes(id));
      if (affectedProducts.length > 0) {
          const promises = affectedProducts.map(p => {
              const newActiveOffers = p.activeOffers.filter(oid => oid !== id);
              return supabase.from('products').update({ active_offers: newActiveOffers }).eq('id', p.id);
          });
          await Promise.allSettled(promises);
          
          setInventory(inventory.map(p => {
              if (p.activeOffers && p.activeOffers.includes(id)) {
                  return { ...p, activeOffers: p.activeOffers.filter(oid => oid !== id) };
              }
              return p;
          }));
      }

      addLog('Oferta Eliminada', {
        id,
        name: offerToDelete.name,
        type: offerToDelete.type,
        applyTo: offerToDelete.applyTo,
        itemsCount: offerToDelete.itemsCount,
        discountValue: offerToDelete.discountValue,
        offerPrice: offerToDelete.offerPrice,
        profitMargin: offerToDelete.profitMargin,
        discountMode: getLoggedOfferDiscountMode(offerToDelete),
        affectedProductsCount: affectedProducts.length
      }, 'Eliminación permanente');

      showNotification('success', 'Oferta Eliminada', 'Se retiró del sistema y de los productos aplicados.');
    } catch (e) {
      console.error(e);
      showNotification('error', 'Error al Eliminar', 'No se pudo eliminar la oferta.');
    }
  };


  const handleAddExpense = async (expenseData) => {
    if (blockIfOfflineReadonly('registrar gastos')) return;
    try {
      const userTypedNote = expenseData.note || ''; 
      const safeDescription = userTypedNote || expenseData.description || 'Gasto General';
      const safeAmount = Number(expenseData.amount) || 0;
      const actor = getActorContext();

      const payload = {
        description: safeDescription,
        amount: safeAmount,
        category: expenseData.category || 'Varios',
        payment_method: expenseData.paymentMethod || 'Efectivo',
        user_id: actor.userId,
        user_role: actor.userRole,
        user_name: actor.userName,
      };

      const { data } = await insertWithSchemaFallback('expenses', payload, CLOUD_SELECTS.expenses);
      if (!data?.id) throw new Error('Supabase no devolvió el gasto creado.');

      const createdAt = data.created_at || new Date().toISOString();
      const newExpense = {
        id: data.id,
        createdAt,
        description: data.description || safeDescription,
        amount: Number(data.amount ?? safeAmount) || 0,
        category: data.category || payload.category,
        paymentMethod: data.payment_method || payload.payment_method,
        date: formatDateAR(createdAt),
        time: formatTimeFullAR(createdAt),
        user: data.user_name || actor.userName,
        userId: data.user_id || actor.userId || null,
        userRole: data.user_role || actor.userRole || 'seller'
      };

      newExpense.isTest = isTestRecord(newExpense);
      setExpenses((prev) => [newExpense, ...prev]);
      
      await addLog(
        'Nuevo Gasto', 
        { description: newExpense.description, amount: newExpense.amount, category: newExpense.category, paymentMethod: newExpense.paymentMethod }, 
        userTypedNote || 'Salida de dinero'
      );
      
      showNotification('success', 'Gasto Registrado', 'Se guardó correctamente en la nube.');
      return newExpense;
    } catch (e) {
      console.error(e);
      showNotification('error', 'Error', getCloudErrorMessage(e, 'No se pudo guardar el gasto. Verifique los datos.'));
      return null;
    }
  };

  const handleAddMemberWithLog = async (data) => {
    if (blockIfOfflineReadonly('crear socios')) return;
    try {
       const memberNum = Math.floor(10000 + Math.random() * 90000);
       const normalizedData = {
         ...data,
         name: String(data?.name || '').trim(),
         dni: data?.dni?.trim() || null,
         phone: data?.phone?.trim() || null,
         email: data?.email?.trim() || null,
         extraInfo: data?.extraInfo?.trim() || '',
         points: Number(data?.points) || 0,
       };

       if (!normalizedData.name) {
         showNotification('error', 'Nombre requerido', 'El nombre del socio no puede quedar vacío.');
         return null;
       }
       
       const payload = { 
         name: normalizedData.name, 
         dni: normalizedData.dni, 
         phone: normalizedData.phone, 
         email: normalizedData.email, 
         points: normalizedData.points, 
         member_number: memberNum 
       };

       const { data: newClient } = await insertWithSchemaFallback('clients', payload, CLOUD_SELECTS.clients);
       
       const clientFormatted = {
         ...newClient,
         memberNumber: newClient.member_number,
         createdAt: newClient.created_at || newClient.createdAt || null,
       };
       setMembers((prev) => {
         const nextMembers = Array.isArray(prev) ? prev : [];
         const existingIndex = nextMembers.findIndex((member) => String(member.id) === String(clientFormatted.id));
         if (existingIndex === -1) {
           return [...nextMembers, clientFormatted];
         }

         return nextMembers.map((member, index) => (
           index === existingIndex
             ? {
                 ...member,
                 ...clientFormatted,
                 memberNumber: clientFormatted.memberNumber || member.memberNumber || member.member_number,
                 created_at: clientFormatted.created_at || member.created_at || member.createdAt || null,
                 createdAt: clientFormatted.createdAt || member.createdAt || member.created_at || null,
               }
             : member
         ));
       });
       
       addLog('Nuevo Socio', { name: clientFormatted.name, number: clientFormatted.memberNumber }, normalizedData.extraInfo || 'Registro manual');
       
       showNotification('success', 'Socio Creado', `#${memberNum}`);
       return clientFormatted;
    } catch (e) { 
       console.error(e);
       const constraint = String(e?.message || e?.details || e?.hint || '').toLowerCase();
       if (constraint.includes('clients_dni_key')) {
         showNotification('error', 'DNI Duplicado', 'Ese DNI ya pertenece a otro socio.');
       } else if (constraint.includes('clients_phone_key')) {
         showNotification('error', 'Teléfono Duplicado', 'Ese teléfono ya pertenece a otro socio.');
       } else if (constraint.includes('clients_email_key')) {
         showNotification('error', 'Email Duplicado', 'Ese email ya pertenece a otro socio.');
       } else if (e.code === '23505') {
         showNotification('error', 'Dato Duplicado', 'Uno de los datos únicos del socio ya existe. Revisa DNI, teléfono y email.');
       } else {
         showNotification('error', 'Error', `No se pudo crear el socio. ${getCloudErrorMessage(e)}`); 
       }
    }
  };

  const handleUpdateMemberWithLog = async (id, updates) => {
    if (blockIfOfflineReadonly('editar socios')) return;
    try {
      const normalizedInput = {
        ...updates,
        name: updates.name !== undefined ? String(updates.name || '').trim() : updates.name,
        dni: updates.dni !== undefined ? updates.dni?.trim() || null : updates.dni,
        phone: updates.phone !== undefined ? updates.phone?.trim() || null : updates.phone,
        email: updates.email !== undefined ? updates.email?.trim() || null : updates.email,
        extraInfo: updates.extraInfo !== undefined ? updates.extraInfo?.trim() || '' : updates.extraInfo,
        points: updates.points !== undefined ? Number(updates.points) || 0 : updates.points,
      };

      if (normalizedInput.name !== undefined && !normalizedInput.name) {
        showNotification('error', 'Nombre requerido', 'El nombre del socio no puede quedar vacío.');
        return null;
      }

      // Buscar miembro anterior para comparar cambios
      const oldMember = members.find(m => m.id === id) || {};
      
      const dbUpdates = {};
      if (normalizedInput.name !== undefined) dbUpdates.name = normalizedInput.name;
      
      if (normalizedInput.dni !== undefined) dbUpdates.dni = normalizedInput.dni;
      if (normalizedInput.phone !== undefined) dbUpdates.phone = normalizedInput.phone;
      if (normalizedInput.email !== undefined) dbUpdates.email = normalizedInput.email;
      
      if (normalizedInput.points !== undefined) dbUpdates.points = normalizedInput.points;
      if (normalizedInput.memberNumber !== undefined) dbUpdates.member_number = normalizedInput.memberNumber;
      
      await updateWithSchemaFallback('clients', id, dbUpdates, CLOUD_SELECTS.clients);
      
      // ?? Normalizar updates: convertir points a número antes de actualizar estado
      const normalizedUpdates = normalizedInput;
      setMembers((prev) =>
        prev.map((member) => {
          if (member.id !== id) return member;

          return {
            ...member,
            ...normalizedUpdates,
            memberNumber:
              normalizedUpdates.memberNumber !== undefined
                ? normalizedUpdates.memberNumber
                : member.memberNumber || member.member_number,
            created_at: member.created_at || member.createdAt || null,
            createdAt: member.createdAt || member.created_at || null,
          };
        }),
      );
      
      // ?? MEJORADO: Detectar cambios específicos para el log
      const pointsDelta = normalizedUpdates.points !== undefined ? Number(normalizedUpdates.points) - Number(oldMember.points || 0) : 0;
      const changes = [];
      
      if (normalizedUpdates.name && normalizedUpdates.name !== oldMember.name) {
        changes.push({ field: 'Nombre', old: oldMember.name, new: normalizedUpdates.name });
      }
      if (normalizedUpdates.dni !== undefined && normalizedUpdates.dni !== oldMember.dni) {
        changes.push({ field: 'DNI', old: oldMember.dni || '--', new: normalizedUpdates.dni || '--' });
      }
      if (normalizedUpdates.phone !== undefined && normalizedUpdates.phone !== oldMember.phone) {
        changes.push({ field: 'Teléfono', old: oldMember.phone || '--', new: normalizedUpdates.phone || '--' });
      }
      if (normalizedUpdates.email !== undefined && normalizedUpdates.email !== oldMember.email) {
        changes.push({ field: 'Email', old: oldMember.email || '--', new: normalizedUpdates.email || '--' });
      }
      if (pointsDelta !== 0) {
        changes.push({ field: 'Puntos', old: Number(oldMember.points || 0), new: Number(normalizedUpdates.points || 0), isPrice: false });
      }
      
      const logReason = pointsDelta !== 0 
        ? `Ajuste de puntos: ${Number(oldMember.points || 0)} ? ${Number(normalizedUpdates.points || 0)}`
        : (normalizedUpdates.extraInfo || (changes.length > 0 ? changes.map(c => c.field).join(', ') : 'Actualización de datos'));
      
      addLog('Edición de Socio', { 
        name: oldMember.name,
        number: oldMember.memberNumber,
        id: oldMember.id,
        oldPoints: Number(oldMember.points || 0),
        newPoints: Number(normalizedUpdates.points || 0),
        pointsDelta,
        changes: changes.length > 0 ? changes : undefined 
      }, logReason);
      
      showNotification('success', 'Socio Actualizado', 'Cambios guardados.');
    } catch (e) { 
      console.error(e);
      const constraint = String(e?.message || e?.details || e?.hint || '').toLowerCase();
      if (constraint.includes('clients_dni_key')) {
        showNotification('error', 'DNI Duplicado', 'Ese DNI ya pertenece a otro socio.');
      } else if (constraint.includes('clients_phone_key')) {
        showNotification('error', 'Teléfono Duplicado', 'Ese teléfono ya pertenece a otro socio.');
      } else if (constraint.includes('clients_email_key')) {
        showNotification('error', 'Email Duplicado', 'Ese email ya pertenece a otro socio.');
      } else if (e.code === '23505') {
        showNotification('error', 'Dato Duplicado', 'Uno de los datos únicos del socio ya existe. Revisa DNI, teléfono y email.');
      } else {
        showNotification('error', 'Error', `Fallo al actualizar el socio. ${getCloudErrorMessage(e)}`); 
      }
    }
  };

  const handleDeleteMemberWithLog = async (id) => {
    if (blockIfOfflineReadonly('eliminar socios')) return;
    try {
      const memberToDelete = members.find(m => m.id === id);

      const { error } = await supabase.from('clients').delete().eq('id', id);

      if (error) {
        if (error.message?.includes('foreign key') || error.code === '23503') {
          const { error: softErr } = await supabase
            .from('clients')
            .update({ is_active: false })
            .eq('id', id);
          if (softErr) throw softErr;
        } else {
          throw error;
        }
      }

      setMembers(members.filter(m => m.id !== id));
      addLog('Baja de Socio', { id, name: memberToDelete?.name || 'Desconocido' });
      showNotification('success', 'Socio Eliminado', 'Se quitó correctamente.');
    } catch (e) {
      console.error('Error eliminando socio:', e);
      showNotification('error', 'Error al Eliminar', `No se pudo borrar: ${e.message}`);
    }
  };

  const buildAgendaPayload = (data = {}) => ({
    name: String(data.name || '').trim(),
    contact_type: data.contactType === 'wholesaler' ? 'wholesaler' : 'supplier',
    phone: data.phone?.trim() || null,
    email: data.email?.trim() || null,
    address: data.address?.trim() || null,
    website: data.website?.trim() || null,
    tax_id: data.taxId?.trim() || null,
    contact_person: data.contactPerson?.trim() || null,
    notes: data.notes?.trim() || null,
    is_active: data.isActive !== false,
  });

  const handleCreateAgendaContact = async (data) => {
    if (blockIfOfflineReadonly('crear contactos de agenda')) return null;
    try {
      const payload = buildAgendaPayload(data);
      if (!payload.name) {
        showNotification('error', 'Nombre requerido', 'Completá el nombre o empresa antes de guardar.');
        return null;
      }

      const { data: createdContact, error } = await supabase
        .from('agenda_contacts')
        .insert([payload])
        .select(CLOUD_SELECTS.agendaContacts)
        .single();

      if (error) throw error;

      const mappedContact = mapAgendaContactRecord(createdContact);
      setAgendaContacts((prev) => [mappedContact, ...prev]);
      addLog(
        'Nuevo Contacto Agenda',
        {
          id: mappedContact.id,
          name: mappedContact.name,
          contactType: mappedContact.contactType,
          contactPerson: mappedContact.contactPerson || null,
          phone: mappedContact.phone || null,
        },
        `Alta de ${(mappedContact.contactType === 'wholesaler' ? 'mayorista' : 'proveedor')}`,
      );
      showNotification('success', 'Contacto creado', `${mappedContact.name} ya quedó en Agenda.`);
      return mappedContact;
    } catch (error) {
      console.error('Error creando contacto de agenda:', error);
      const errorMessage = error?.message || 'Ha ocurrido un error desconocido. Revisa la consola.';
      showNotification('error', 'No se pudo crear el contacto', errorMessage);
      return null;
    }
  };

  const handleUpdateAgendaContact = async (id, updates) => {
    if (blockIfOfflineReadonly('editar contactos de agenda')) return null;
    try {
      const currentContact = agendaContacts.find((contact) => String(contact.id) === String(id));
      const payload = buildAgendaPayload(updates);
      if (!payload.name) {
        showNotification('error', 'Nombre requerido', 'Completá el nombre o empresa antes de guardar.');
        return null;
      }

      const { data: updatedContact, error } = await supabase
        .from('agenda_contacts')
        .update(payload)
        .eq('id', id)
        .select(CLOUD_SELECTS.agendaContacts)
        .single();

      if (error) throw error;

      const mappedContact = mapAgendaContactRecord(updatedContact);
      setAgendaContacts((prev) =>
        prev.map((contact) => (String(contact.id) === String(id) ? mappedContact : contact)),
      );

      addLog(
        'Edicion Agenda',
        {
          id: mappedContact.id,
          name: mappedContact.name,
          previousName: currentContact?.name || null,
          contactType: mappedContact.contactType,
          previousType: currentContact?.contactType || null,
          contactPerson: mappedContact.contactPerson || null,
        },
        updates.notes?.trim() || 'Actualización manual de Agenda',
      );
      showNotification('success', 'Agenda actualizada', 'Los cambios quedaron guardados.');
      return mappedContact;
    } catch (error) {
      console.error('Error editando contacto de agenda:', error);
      showNotification('error', 'Error', 'No se pudo actualizar el contacto.');
      return null;
    }
  };

  const handleDeleteAgendaContact = async (id) => {
    if (blockIfOfflineReadonly('desactivar contactos de agenda')) return false;
    try {
      const currentContact = agendaContacts.find((contact) => String(contact.id) === String(id));
      const { data: updatedContact, error } = await supabase
        .from('agenda_contacts')
        .update({ is_active: false })
        .eq('id', id)
        .select(CLOUD_SELECTS.agendaContacts)
        .single();

      if (error) throw error;

      const mappedContact = mapAgendaContactRecord(updatedContact);
      setAgendaContacts((prev) =>
        prev.map((contact) => (String(contact.id) === String(id) ? mappedContact : contact)),
      );

      addLog(
        'Baja Agenda',
        {
          id: mappedContact.id,
          name: currentContact?.name || mappedContact.name,
          contactType: currentContact?.contactType || mappedContact.contactType,
        },
        'Desactivación lógica desde Agenda',
      );
      showNotification('success', 'Contacto desactivado', 'El registro quedó oculto de los activos.');
      return true;
    } catch (error) {
      console.error('Error desactivando contacto de agenda:', error);
      showNotification('error', 'Error', 'No se pudo desactivar el contacto.');
      return false;
    }
  };
  
  const playBeep = (success = true) => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = success ? 1200 : 400;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.1);
    } catch {
      console.log('Audio not supported');
    }
  };

  const calculateTotal = (paymentLines = null) => {
    const subtotal = cart.reduce(
      (t, i) => t + (Number(i.price) || 0) * (Number(i.quantity) || 0),
      0
    );
    if (Array.isArray(paymentLines) && paymentLines.length > 0) {
      const totals = getPaymentBreakdownTotals(paymentLines);
      return totals.baseTotal > 0 ? totals.chargedTotal : subtotal;
    }
    if (selectedPayment === 'Credito') {
      return subtotal * 1.1;
    }
    return subtotal;
  };

  const safeTransactions = Array.isArray(transactions) ? transactions : [];
  
  const validTransactions = safeTransactions.filter(
    (t) => t && t.status !== 'voided' && !t.isTest
  );

  const totalSales = validTransactions.reduce(
    (acc, tx) => acc + (Number(tx.total) || 0),
    0
  );
  const salesCount = validTransactions.length;

  const parseTxDate = (tx) => {
    try {
      if (tx.date && tx.time) {
        const [day, month, year] = tx.date.split('/');
        let fullYear = parseInt(year, 10);
        if (fullYear < 100) fullYear += 2000;
        const timeClean = tx.time.split(' ')[0];
        return new Date(fullYear, parseInt(month, 10) - 1, parseInt(day, 10),
          ...timeClean.split(':').map(Number));
      }
      return null;
    } catch { return null; }
  };

  const parseExpDate = (exp) => {
    try {
      if (exp.date && exp.time) {
        const [day, month, year] = exp.date.split('/');
        let fullYear = parseInt(year, 10);
        if (fullYear < 100) fullYear += 2000;
        const timeClean = exp.time.split(' ')[0];
        return new Date(fullYear, parseInt(month, 10) - 1, parseInt(day, 10),
          ...timeClean.split(':').map(Number));
      }
      const rawDate = exp.createdAt || exp.created_at || null;
      if (rawDate) {
        const parsedDate = new Date(rawDate);
        return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
      }
      return null;
    } catch { return null; }
  };

  const cycleTransactions = useMemo(() => {
    if (!registerOpenedAt) return validTransactions;
    const cycleStart = new Date(registerOpenedAt);
    return validTransactions.filter(tx => {
      const txDate = parseTxDate(tx);
      return txDate && txDate >= cycleStart;
    });
  }, [validTransactions, registerOpenedAt]);

  const cycleExpenses = useMemo(() => {
    const realExpenses = expenses.filter(e => !e.isTest);
    if (!registerOpenedAt) return realExpenses;
    const cycleStart = new Date(registerOpenedAt);
    return realExpenses.filter(exp => {
      const expDate = parseExpDate(exp);
      return expDate && expDate >= cycleStart;
    });
  }, [expenses, registerOpenedAt]);

  const cycleTotalSales = cycleTransactions.reduce(
    (acc, tx) => acc + (Number(tx.total) || 0), 0
  );
  const cycleSalesCount = cycleTransactions.length;
  const cycleTotalExpenses = cycleExpenses.reduce(
    (acc, exp) => acc + (Number(exp.amount) || 0), 0
  );
  const cycleCashExpenses = cycleExpenses
    .filter(e => e.paymentMethod === 'Efectivo')
    .reduce((acc, exp) => acc + (Number(exp.amount) || 0), 0);
  const cycleCashSales = cycleTransactions
    .filter(t => t.payment === 'Efectivo')
    .reduce((acc, t) => acc + (Number(t.total) || 0), 0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isRegisterClosed && closingTime) {
      const nowStr = currentTime.toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      if (nowStr === closingTime && !isAutoClosing.current) {
        isAutoClosing.current = true;
        executeRegisterClose(true).finally(() => {
          setTimeout(() => { isAutoClosing.current = false; }, 65000);
        });
      }
    }
  }, [currentTime, closingTime, isRegisterClosed]);

  const navigateToInventoryFromDashboard = ({
    searchQuery = '',
    category = 'Todas',
    mode = 'default',
    productId = null,
  } = {}) => {
    setInventoryCategoryFilter(category || 'Todas');

    if (mode === 'out_of_stock') {
      setInventorySearch('AGOTADOS');
    } else if (mode === 'expirations') {
      setInventorySearch('VENCIMIENTOS');
    } else {
      setInventorySearch(searchQuery || '');
    }

    setInventoryNavigationRequest({
      token: Date.now(),
      searchQuery: searchQuery || '',
      category: category || 'Todas',
      mode,
      productId,
    });
    setActiveTab('inventory');
  };

  const navigateToHistoryFromDashboard = ({
    searchQuery = '',
    category = '',
  } = {}) => {
    setHistoryNavigationRequest({
      token: Date.now(),
      searchQuery: searchQuery || '',
      category: category || '',
    });
    setActiveTab('history');
  };

  const handleDashboardAlertClick = (alertPayload) => {
    if (typeof alertPayload === 'string') {
      navigateToInventoryFromDashboard({
        mode: alertPayload === 'out_of_stock' ? 'out_of_stock' : 'expirations',
      });
      return;
    }

    if (alertPayload?.type === 'product') {
      navigateToInventoryFromDashboard({
        searchQuery: alertPayload.product?.title || '',
        productId: alertPayload.product?.id ?? null,
        mode: alertPayload.alertType === 'expirations' ? 'expirations' : 'out_of_stock',
      });
    }
  };

  const addToCart = (item, initialQty = null) => {
    // Definimos la cantidad inicial a agregar (por defecto 1, o los gramos/cantidad pasada)
    const qtyToAdd = Number(initialQty) || 1;

    // Si es un producto regular y su stock es 0, bloqueamos
    if (item.stock === 0 && !item.isCustom && !item.isCombo && !item.isDiscount) return;
    
    if (item.product_type === 'weight' && initialQty && !item.isCustom) {
      const existing = cart.find((c) => c.id === item.id && !c.isReward);
      if (existing) {
        const newTotal = existing.quantity + qtyToAdd;
        if (newTotal > item.stock) {
          showNotification('error', 'Stock Insuficiente', `Solo quedan ${item.stock}g disponibles.`);
          return;
        }
        setCart(cart.map((c) => (c.id === item.id && !c.isReward ? { ...c, quantity: newTotal } : c)));
      } else {
        if (qtyToAdd > item.stock) {
          showNotification('error', 'Stock Insuficiente', `Solo quedan ${item.stock}g disponibles.`);
          return;
        }
        setCart([...cart, { ...item, quantity: qtyToAdd }]);
      }
      return;
    }
    
    const existing = cart.find((c) => c.id === item.id && !c.isReward);
    if (existing) {
      // Validamos stock solo si NO es un item especial
      if (!item.isCustom && !item.isCombo && !item.isDiscount && existing.quantity + qtyToAdd > item.stock) {
        showNotification('error', 'Stock Insuficiente', 'No quedan más unidades de este producto.');
        return;
      }
      setCart(cart.map((c) => (c.id === item.id && !c.isReward ? { ...c, quantity: c.quantity + qtyToAdd } : c)));
    } else {
      setCart([...cart, { ...item, quantity: qtyToAdd }]); // Añadimos la cantidad exacta que nos pasan
    }
  };

  const updateCartItemQty = (id, newQty) => {
    const qty = parseInt(newQty);
    if (isNaN(qty) || qty < 1) return;
    
    const itemInCart = cart.find(c => c.id === id);
    if (!itemInCart) return;

    // Si es libre (Custom), Combo o Descuento, no validamos contra el inventario
    if (itemInCart.isCustom || itemInCart.isCombo || itemInCart.isDiscount || itemInCart.isReward) {
      setCart(cart.map((c) => (c.id === id ? { ...c, quantity: qty } : c)));
      return;
    }

    const itemInStock = inventory.find((i) => i.id === id);
    if (!itemInStock) return;

    const maxAvailableQty = Math.max(1, Number(itemInStock.stock) || 0);
    const finalQty = Math.min(qty, maxAvailableQty);

    if (qty > maxAvailableQty) {
      showNotification('warning', 'Stock ajustado', `Se aplicó el máximo disponible: ${maxAvailableQty}`);
      return;
    }
    
    setCart(cart.map((c) => (c.id === id ? { ...c, quantity: finalQty } : c)));
  };
  
  const removeFromCart = (id) => setCart(cart.filter((c) => c.id !== id));

  const handleBarcodeScan = (scannedCode) => {
    const product = inventory.find(
      (p) => String(p.barcode) === scannedCode
    );

    if (activeTab === 'pos' && !isRegisterClosed) {
      if (product) {
        if (product.stock === 0) {
          playBeep(false);
          showNotification('error', 'Sin Stock', `"${product.title}" está agotado.`);
          return;
        }
        const inCart = cart.find(c => c.id === product.id);
        if (inCart && inCart.quantity >= product.stock) {
          playBeep(false);
          showNotification('error', 'Stock Insuficiente', `No quedan más unidades de "${product.title}".`);
          return;
        }
        playBeep(true);
        addToCart(product);
        showNotification('success', 'Producto Escaneado', `${product.title} agregado al carrito.`);
      } else {
        playBeep(false);
        if (!canCreateInventory) {
          showNotification('error', 'Producto No Habilitado', 'Contactarse con Sistema o un Dueño.');
          return; 
        }
        setBarcodeNotFoundModal({ isOpen: true, code: scannedCode });
      }
    } else if (activeTab === 'inventory') {
      playBeep(true);
      setInventorySearch(scannedCode);
      if (!product) {
        setTimeout(() => {
          if (!canCreateInventory) {
             showNotification('error', 'Producto No Habilitado', 'Contactarse con Sistema o un Dueño.');
             return; 
          }
          setBarcodeNotFoundModal({ isOpen: true, code: scannedCode });
        }, 300);
      }
    }
  };

  const handleInputScan = () => {
    if (activeTab === 'pos') {
      setPosSearch(''); 
    }
  };

  const handleInventoryEditBarcodeScan = (scannedCode, matchedProduct) => {
    const belongsToAnotherProduct =
      matchedProduct && String(matchedProduct.id) !== String(editingProduct?.id);

    if (belongsToAnotherProduct) {
      playBeep(false);
      handleDuplicateBarcodeDetected(matchedProduct, scannedCode);
      return true;
    }

    playBeep(true);
    setBarcodeNotFoundModal({ isOpen: false, code: '' });
    setEditingProduct((prev) => (prev ? { ...prev, barcode: scannedCode } : prev));
    showNotification('success', 'Código asignado', 'El código se cargó en el producto en edición.');
    return true;
  };

  const handleInventoryCreateBarcodeScan = (scannedCode, matchedProduct) => {
    if (matchedProduct) {
      playBeep(false);
      handleDuplicateBarcodeDetected(matchedProduct, scannedCode);
      return true;
    }

    playBeep(true);
    setBarcodeNotFoundModal({ isOpen: false, code: '' });
    setNewItem((prev) => ({ ...prev, barcode: scannedCode }));
    showNotification('success', 'Código asignado', 'El código se cargó en el nuevo producto.');
    return true;
  };

  const handleBarcodeScanWithInventoryEdit = (scannedCode, wasInInput = false) => {
    if (activeTab === 'inventory' && wasInInput) {
      const matchedProduct = inventory.find(
        (p) => String(p.barcode) === scannedCode
      );

      if (editingProduct) {
        if (handleInventoryEditBarcodeScan(scannedCode, matchedProduct)) {
          return;
        }
      }

      if (isModalOpen) {
        if (handleInventoryCreateBarcodeScan(scannedCode, matchedProduct)) {
          return;
        }
      }
    }

    handleBarcodeScan(scannedCode);
  };

  useBarcodeScanner({
    isEnabled: (activeTab === 'pos' && !isRegisterClosed) || activeTab === 'inventory',
    onScan: handleBarcodeScanWithInventoryEdit,
    onInputScan: handleInputScan
  });

  const handleAddProductFromBarcode = (barcode) => {
    setBarcodeNotFoundModal({ isOpen: false, code: '' });
    setNewItem({
      title: '', brand: '', price: '', purchasePrice: '', stock: '',
      categories: [], image: '', image_thumb: '', barcode: barcode,
      product_type: 'quantity',
      expiration_date: ''
    });
    setIsModalOpen(true);
  };

  const handleDuplicateBarcodeDetected = (existingProduct, newBarcode) => {
    setBarcodeDuplicateModal({
      isOpen: true,
      existingProduct,
      newBarcode
    });
  };

  const handleReplaceDuplicateBarcode = () => {
    const { existingProduct } = barcodeDuplicateModal;
    setInventory(inventory.map(p => 
      p.id === existingProduct.id ? { ...p, barcode: '' } : p
    ));
    setBarcodeDuplicateModal({ isOpen: false, existingProduct: null, newBarcode: '' });
    showNotification('info', 'Código reemplazado', `Se quitó el código de "${existingProduct.title}".`);
  };

  const handleSelectLoginUser = (userId) => {
    setSelectedUserIdForLogin(userId);
    setLoginStep('password');
    setPasswordInput('');
    setLoginError('');
  };

  const finalizeLogin = async (verifiedUser, { offline = false } = {}) => {
    const nextSession = buildSessionMeta(verifiedUser);
    setCurrentUser(verifiedUser);
    setCurrentSessionMeta(nextSession);
    setActiveTab(getDefaultTabForUser(verifiedUser));
    setLoginStep('select');
    setSelectedUserIdForLogin(null);
    setPasswordInput('');
    setLoginError('');
    await writeLogEntry({
      action: 'Sesion Iniciada',
      details: nextSession,
      reason: 'Ingreso al sistema',
      userName: verifiedUser.displayName || verifiedUser.name,
      skipCloud: offline,
    });
  };

  const handleSystemLogoAccess = () => {
    if (!systemLoginUser) return;

    const nextTapCount = systemLogoTapCount + 1;
    setSystemLogoTapCount(nextTapCount);

    if (systemLogoTapTimeoutRef.current) {
      clearTimeout(systemLogoTapTimeoutRef.current);
    }

    if (nextTapCount >= 3) {
      setSystemLogoTapCount(0);
      systemLogoTapTimeoutRef.current = null;
      handleSelectLoginUser(systemLoginUser.id);
      return;
    }

    systemLogoTapTimeoutRef.current = setTimeout(() => {
      setSystemLogoTapCount(0);
      systemLogoTapTimeoutRef.current = null;
    }, 1200);
  };

  const handleSystemCornerBypass = async () => {
    if (!selectedLoginUser || selectedLoginUser.role !== 'system') return;
    await finalizeLogin(selectedLoginUser, { offline: isBrowserOffline() || isOfflineReadOnly });
  };

  const handleSubmitLogin = async (e) => {
    e.preventDefault();
    const loginUser = selectedLoginUser;
    if (!loginUser) {
      setLoginError('Selecciona un usuario válido.');
      return;
    }

    try {
      let verifiedUser = null;
      let shouldSkipCloudLoginLog = isBrowserOffline() || isOfflineReadOnly;

      if (authMode === 'supabase') {
        try {
          verifiedUser = await withTimeout(
            verifyAppUserLogin({
              userId: loginUser.id,
              password: passwordInput,
            }),
            OFFLINE_LOGIN_TIMEOUT_MS,
            'Verificacion de usuario',
          );
          if (verifiedUser) {
            await saveOfflineLoginVerifier(verifiedUser, passwordInput);
          }
        } catch (error) {
          if (!isRecoverableCloudError(error)) throw error;
          const canLoginOffline = await verifyOfflineLoginVerifier(loginUser, passwordInput);
          if (canLoginOffline) {
            verifiedUser = loginUser;
            shouldSkipCloudLoginLog = true;
            setIsOfflineReadOnly(true);
          } else {
            setLoginError('Sin conexion: inicia una vez con internet para habilitar este usuario offline.');
            return;
          }
        }
      } else {
        const legacySeed = buildLegacyBootstrapSeed(USERS, userSettings);
        const legacyPassword =
          loginUser.role === 'system'
            ? legacySeed.systemUser.password
            : legacySeed.sellerUser.password;
        if (passwordInput === legacyPassword) {
          verifiedUser = loginUser;
        }
      }

      if (!verifiedUser) {
        setLoginError('Contraseña incorrecta');
        return;
      }

      await finalizeLogin(verifiedUser, { offline: shouldSkipCloudLoginLog });
    } catch (error) {
      console.error('No se pudo iniciar sesión:', error);
      setLoginError(error?.message || 'No se pudo iniciar sesión.');
    }
  };

  const handleRetrySharedUsersSetup = async () => {
    try {
      const users = await loadAppUsers({ force: true, includeInactive: true });
      const isSharedEnabled = Array.isArray(users) && users.some((user) => user?.source === 'supabase');

      if (isSharedEnabled) {
        showNotification('success', 'Usuarios habilitados', 'La gestión de subusuarios ya quedó conectada con Supabase.');
      } else {
        showNotification('info', 'Seguimos en modo legacy', 'Todavía no encontramos app_users_public o los usuarios compartidos activos.');
      }
    } catch (error) {
      console.error('No se pudo revalidar el schema de usuarios:', error);
      showNotification('error', 'No se pudo reconectar', error?.message || 'Falló la verificación del schema app_users.');
    }
  };

  const handleSaveUserSettings = async (updates) => {
    const role = currentUser?.role;
    if (!role) return;

    try {
      let nextUser = {
        ...currentUser,
        displayName: updates.displayName || updates.name || currentUser.displayName || currentUser.name,
        name: updates.displayName || updates.name || currentUser.displayName || currentUser.name,
        avatar: updates.avatar || currentUser.avatar,
        nameColor: updates.nameColor || currentUser.nameColor || '#0f172a',
        theme: updates.theme || currentUser.theme || 'light',
      };

      if (authMode === 'supabase' && currentUser.id) {
        const updatedProfile = await updateAppUserProfile({
          actorId: currentUser.id,
          targetId: currentUser.id,
          displayName: nextUser.displayName,
          role: currentUser.role,
          avatar: nextUser.avatar,
          nameColor: nextUser.nameColor,
          theme: nextUser.theme,
        });

        if (updates.password?.trim()) {
          await updateAppUserPassword({
            actorId: currentUser.id,
            targetId: currentUser.id,
            password: updates.password.trim(),
          });
        }

        nextUser = updatedProfile || nextUser;
        const refreshedUsers = await loadAppUsers({ force: true });
        nextUser =
          refreshedUsers.find((user) => String(user.id) === String(currentUser.id)) ||
          nextUser;
      } else {
        const settingsKey = role === 'system' ? 'admin' : 'seller';
        const nextUserSettings = {
          ...userSettings,
          [settingsKey]: {
            ...(userSettings[settingsKey] || {}),
            ...updates,
          },
        };

        setUserSettings(nextUserSettings);
        setAppUsers(buildLegacyUsers(USERS, nextUserSettings));
      }

      setCurrentUser(nextUser);
      setCurrentSessionMeta((prev) =>
        prev
          ? {
              ...prev,
              userId: nextUser.id || prev.userId,
              userName: nextUser.displayName || nextUser.name,
              role: nextUser.role,
              avatar: nextUser.avatar,
            }
          : prev,
      );

      await writeLogEntry({
        action: 'Ajustes de Usuario',
        details: {
          userId: nextUser.id || null,
          role: nextUser.role,
          name: nextUser.displayName || nextUser.name,
          avatar: nextUser.avatar,
          nameColor: nextUser.nameColor || '#0f172a',
          theme: nextUser.theme || 'light',
        },
        reason: 'Actualización de perfil',
        userName: nextUser.displayName || nextUser.name,
      });

      showNotification('success', 'Ajustes guardados', 'Tu perfil se actualizó correctamente.');
    } catch (error) {
      console.error('No se pudieron guardar los ajustes del usuario:', error);
      showNotification('error', 'No se pudo guardar', error?.message || 'Falló la actualización del perfil.');
    }
  };

  const handleCreateManagedUser = async (payload) => {
    if (!currentUser?.id || !hasPermission(currentUser, 'userManagement.createUsers')) return null;
    if (authMode !== 'supabase') {
      showNotification('info', 'Gestión de usuarios no disponible', 'Primero ejecuta el schema app_users en Supabase para habilitar subusuarios reales.');
      return;
    }

    const createdUser = await createAppUser({
      actorId: currentUser.id,
      displayName: payload.displayName,
      role: payload.role,
      password: payload.password,
      avatar: payload.avatar,
      nameColor: payload.nameColor,
      theme: payload.theme,
    });

    await loadAppUsers({ force: true, includeInactive: true });
    setAuthMode('supabase');

    await writeLogEntry({
      action: 'Usuario Creado',
      details: {
        targetUserId: createdUser?.id || null,
        displayName: createdUser?.displayName || payload.displayName,
        role: createdUser?.role || payload.role,
        avatar: createdUser?.avatar || payload.avatar,
        nameColor: createdUser?.nameColor || payload.nameColor,
      },
      reason: 'Alta desde Gestión de usuarios',
      userName: currentUser.displayName || currentUser.name,
    });

    showNotification('success', 'Usuario creado', 'El subusuario se creó correctamente.');
    return createdUser;
  };

  const handleUpdateManagedUser = async (targetUser, payload) => {
    if (!currentUser?.id || !targetUser?.id || !canEditUserProfile(currentUser, targetUser)) return null;
    if (authMode !== 'supabase') {
      showNotification('info', 'Gestión de usuarios no disponible', 'Primero ejecuta el schema app_users en Supabase para habilitar la edición de subusuarios.');
      return;
    }

    const updatedProfile = await updateAppUserProfile({
      actorId: currentUser.id,
      targetId: targetUser.id,
      displayName: payload.displayName,
      role: payload.role,
      avatar: payload.avatar,
      nameColor: payload.nameColor,
      theme: payload.theme,
    });

    if (payload.password?.trim()) {
      await updateAppUserPassword({
        actorId: currentUser.id,
        targetId: targetUser.id,
        password: payload.password.trim(),
      });
    }

    await loadAppUsers({ force: true, includeInactive: true });

    await writeLogEntry({
      action: 'Usuario Editado',
      details: {
        targetUserId: targetUser.id,
        displayName: updatedProfile?.displayName || payload.displayName,
        role: updatedProfile?.role || payload.role,
        avatar: updatedProfile?.avatar || payload.avatar,
        nameColor: updatedProfile?.nameColor || payload.nameColor,
        theme: updatedProfile?.theme || payload.theme,
      },
      reason: 'Edición desde Gestión de usuarios',
      userName: currentUser.displayName || currentUser.name,
    });

    showNotification('success', 'Usuario actualizado', 'Los cambios del subusuario se guardaron correctamente.');
    return updatedProfile;
  };

  const handleToggleManagedUserActive = async (targetUser) => {
    if (!currentUser?.id || !targetUser?.id || !canToggleUserActiveState(currentUser, targetUser)) return;
    if (authMode !== 'supabase') {
      showNotification('info', 'Gestión de usuarios no disponible', 'Primero ejecuta el schema app_users en Supabase para habilitar el cambio de estado.');
      return;
    }

    const nextActive = !targetUser.isActive;
    const updatedUser = await setAppUserActive({
      actorId: currentUser.id,
      targetId: targetUser.id,
      isActive: nextActive,
    });

    await loadAppUsers({ force: true, includeInactive: true });

    await writeLogEntry({
      action: nextActive ? 'Usuario Reactivado' : 'Usuario Desactivado',
      details: {
        targetUserId: targetUser.id,
        displayName: updatedUser?.displayName || targetUser.displayName || targetUser.name,
        role: updatedUser?.role || targetUser.role,
        isActive: updatedUser?.isActive ?? nextActive,
      },
      reason: 'Cambio de estado desde Gestión de usuarios',
      userName: currentUser.displayName || currentUser.name,
    });

    showNotification(
      'success',
      nextActive ? 'Usuario reactivado' : 'Usuario desactivado',
      `El usuario ${updatedUser?.displayName || targetUser.displayName || targetUser.name} quedó ${nextActive ? 'activo' : 'inactivo'}.`,
    );
  };

  const handleUpdateManagedUserPermissions = async (targetUser, permissionsOverride, applyNow) => {
    if (!currentUser?.id || !targetUser?.id || !canManageUserPermissions(currentUser, targetUser)) return null;
    if (authMode !== 'supabase') {
      showNotification('info', 'Gestión de usuarios no disponible', 'Primero ejecuta el schema app_users en Supabase para habilitar permisos reales.');
      return null;
    }

    const updatedUser = await updateAppUserPermissions({
      actorId: currentUser.id,
      targetId: targetUser.id,
      permissionsOverride,
      applyNow,
    });

    const refreshedUsers = await loadAppUsers({ force: true, includeInactive: true });
    setAuthMode('supabase');

    const refreshedTargetUser =
      refreshedUsers.find((user) => String(user.id) === String(targetUser.id)) ||
      updatedUser ||
      targetUser;

    await writeLogEntry({
      action: 'Permisos de Usuario Actualizados',
      details: {
        targetUserId: targetUser.id,
        displayName: refreshedTargetUser?.displayName || targetUser.displayName || targetUser.name,
        role: refreshedTargetUser?.role || targetUser.role,
        permissionsOverride,
        applyNow: Boolean(applyNow),
        permissionsVersion: refreshedTargetUser?.permissionsVersion || null,
      },
      reason: applyNow ? 'Permisos aplicados de inmediato' : 'Permisos guardados para próxima sesión',
      userName: currentUser.displayName || currentUser.name,
    });

    if (applyNow && String(targetUser.id) === String(currentUser.id)) {
      const now = new Date();
      const activeSession = currentSessionMetaRef.current;

      if (activeSession) {
        await writeLogEntry({
          action: 'Sesion Cerrada',
          details: {
            ...activeSession,
            closedAt: now.toISOString(),
            closedDate: formatDateAR(now),
            closedTime: formatTimeFullAR(now),
            forcedByPermissions: true,
            updatedPermissionsVersion: refreshedTargetUser?.permissionsVersion || null,
          },
          reason: 'Permisos actualizados por Sistema',
          userName:
            activeSession.userName ||
            refreshedTargetUser?.displayName ||
            refreshedTargetUser?.name ||
            'Usuario',
        });
      }

      clearAuthenticatedState();

      showNotification(
        'warning',
        'Permisos actualizados',
        'Tus permisos cambiaron y se reinicio la sesion para aplicar el nuevo acceso.',
      );
      return null;
    }

    showNotification(
      'success',
      'Permisos actualizados',
      applyNow
        ? 'Los nuevos permisos se aplicarán cuando el usuario vuelva a iniciar sesión.'
        : 'Los permisos quedaron guardados para la próxima sesión.',
    );
  };

  const handleLogout = async () => {
    if (currentSessionMeta) {
      const now = new Date();
      await writeLogEntry({
        action: 'Sesion Cerrada',
        details: {
          ...currentSessionMeta,
          closedAt: now.toISOString(),
          closedDate: formatDateAR(now),
          closedTime: formatTimeFullAR(now),
        },
        reason: 'Cierre manual de sesión',
        userName: currentSessionMeta.userName || currentUser?.displayName || currentUser?.name || 'Sistema',
      });
    }

    setCurrentSessionMeta(null);
    setCurrentUser(null);
    setCart([]);
    setPosSelectedClient(null);
  };

  const handleImageUpload = async (file, isEditing = false) => {
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showNotification('error', 'Imagen muy pesada', 'El máximo permitido es 5MB.');
      return;
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      showNotification('error', 'Formato no válido', 'Solo JPG, PNG, WebP o GIF.');
      return;
    }

    try {
      setIsUploadingImage(true);
      const uploadedImage = await uploadProductImage(file);

      if (isEditing) {
        setEditingProduct((prev) => prev ? { ...prev, image: uploadedImage.image, image_thumb: uploadedImage.imageThumb, imageThumb: uploadedImage.imageThumb } : prev);
      } else {
        setNewItem((prev) => ({ ...prev, image: uploadedImage.image, image_thumb: uploadedImage.imageThumb, imageThumb: uploadedImage.imageThumb }));
      }
      showNotification('success', 'Imagen subida', 'Se cargó correctamente a la nube.');
    } catch (err) {
      console.error('Error subiendo imagen:', err);
      showNotification('error', 'Error al subir', 'No se pudo subir la imagen. Intentá de nuevo.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  useEffect(() => {
    if (!canUseAdminArea) return;
    if (isOfflineReadOnly) return;
    if (moduleLoadState.core.status !== 'loaded') return;
    if (productThumbBackfillDisabledRef.current) return;
    if (productThumbBackfillInFlightRef.current) return;

    const candidates = inventory
      .filter((product) => {
        const productId = String(product?.id || '');
        if (!productId) return false;
        if (!product?.image) return false;
        if (product.imageThumb || product.image_thumb) return false;
        if (productThumbBackfillFailedIdsRef.current.has(productId)) return false;
        return true;
      })
      .slice(0, 6);

    if (candidates.length === 0) return;

    let cancelled = false;
    productThumbBackfillInFlightRef.current = true;

    const run = async () => {
      try {
        for (const product of candidates) {
          if (cancelled) break;

          try {
            const thumbUrl = await uploadProductThumbFromSource(product.image);
            const result = await updateWithSchemaFallback(
              'products',
              product.id,
              { image_thumb: thumbUrl },
              CLOUD_SELECTS.products
            );

            if (!('image_thumb' in (result?.payload || {}))) {
              productThumbBackfillDisabledRef.current = true;
              break;
            }

            if (result?.data) {
              const formattedProduct = mapInventoryRecords([result.data])[0];
              setInventory((prev) =>
                prev.map((currentProduct) =>
                  String(currentProduct.id) === String(product.id) ? formattedProduct : currentProduct
                )
              );
            }
          } catch (error) {
            console.warn('No se pudo generar image_thumb para un producto existente:', product?.id, error);
            productThumbBackfillFailedIdsRef.current.add(String(product.id));
          }
        }
      } finally {
        productThumbBackfillInFlightRef.current = false;
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [canUseAdminArea, inventory, isOfflineReadOnly, moduleLoadState.core.status]);

  const handleEditTransactionRequest = (tx) => {
    const safeTx = JSON.parse(JSON.stringify(tx));
    safeTx.items = safeTx.items.map((i) => ({
      ...i,
      qty: Number(i.qty || i.quantity) || 0,
      price: Number(i.price) || 0,
    }));
    const safeTotal = Number(safeTx.total || 0);
    const existingCashReceived = Number(safeTx.cashReceived ?? safeTx.cash_received);
    const normalizedCashReceived = Number.isFinite(existingCashReceived) && existingCashReceived > 0
      ? existingCashReceived
      : safeTotal;
    const paymentInfo = getPrimaryPaymentInfo(
      safeTx.paymentBreakdown ?? safeTx.payment_breakdown,
      safeTx.payment,
      safeTx.installments,
      normalizedCashReceived,
      safeTx.cashChange ?? safeTx.cash_change,
      safeTotal,
    );
    safeTx.paymentBreakdown = paymentInfo.paymentBreakdown;
    safeTx.payment = paymentInfo.payment;
    safeTx.cashReceived = paymentInfo.cashReceived;
    safeTx.cashChange = paymentInfo.cashChange;
    safeTx.installments = paymentInfo.installments;
    setEditingTransaction(safeTx);
    setTransactionSearch('');
    setEditReason('');
  };

  const handleViewTicket = (tx) => {
    setTicketToView(tx);
  };

  const handlePrintTicket = () => {
    if (window.electronAPI && window.electronAPI.printSilent) {
      window.electronAPI.printSilent();
      showNotification('success', 'Imprimiendo...', 'El ticket se envió a la impresora.');
    } else {
      window.print();
    }
  };

  const toggleRegisterStatus = async () => {
    if (blockIfOfflineReadonly('cambiar el estado de la caja')) return;
    if (!canManageRegister) {
      showNotification('error', 'Acceso Denegado', 'Solo Sistema o un Dueño pueden gestionar la caja.');
      return;
    }

    if (isRegisterClosed) {
      setTempOpeningBalance('');
      setTempClosingTime('21:00');
      setIsOpeningBalanceModalOpen(true);
    } else {
      Swal.fire({ 
        title: 'Sincronizando Caja...', 
        text: 'Obteniendo ventas y modificaciones del Usuario de Caja...', 
        allowOutsideClick: false, 
        didOpen: () => Swal.showLoading() 
      });
      
      await fetchCloudData(false, { force: true, moduleKeys: ['dashboard'] });
      Swal.close();
      
      setIsClosingCashModalOpen(true);
    }
  };

  const executeRegisterClose = async (isAuto = false) => {
    if (blockIfOfflineReadonly('cerrar la caja')) return;
    const closeDate = new Date();
    const cycleStart = registerOpenedAt ? new Date(registerOpenedAt) : null;
    
    const cycleTransactions = cycleStart
      ? safeTransactions.filter(tx => {
          if (!tx || tx.status === 'voided') return false;
          const txDate = parseTxDate(tx);
          return txDate && txDate >= cycleStart;
        })
      : validTransactions;

    const cycleExpenses = cycleStart
      ? expenses.filter(exp => {
          const expDate = parseExpDate(exp);
          return expDate && expDate >= cycleStart;
        })
      : expenses;

    const cycleTotalSales = cycleTransactions.reduce((acc, tx) => acc + (Number(tx.total) || 0), 0);
    const cycleSalesCount = cycleTransactions.length;

    const itemsSoldMap = {};
    let totalCost = 0; 
    cycleTransactions.forEach(tx => {
      tx.items.forEach(item => {
        const inventoryItem = inventory.find(p => String(p.id) === String(item.productId || item.id));
        const cost = Number(inventoryItem?.purchasePrice || 0);
        if (!itemsSoldMap[item.id]) itemsSoldMap[item.id] = { id: item.id, title: item.title, qty: 0, revenue: 0, cost: 0 };
        const qty = Number(item.qty || item.quantity || 0);
        const price = Number(item.price || 0);
        itemsSoldMap[item.id].qty += qty;
        itemsSoldMap[item.id].revenue += (price * qty); 
        itemsSoldMap[item.id].cost += (cost * qty);
        totalCost += (cost * qty);
      });
    });
    const itemsSoldList = Object.values(itemsSoldMap);

    const paymentMethodsSummary = {};
    cycleTransactions.forEach(tx => {
      const perMethodTotals = getPaymentMethodTotals(
        tx.paymentBreakdown,
        tx.primaryPaymentMethod || tx.payment,
        tx.installments,
        tx.cashReceived,
        tx.cashChange,
        tx.total,
      );
      Object.entries(perMethodTotals).forEach(([method, amount]) => {
        if (!paymentMethodsSummary[method]) paymentMethodsSummary[method] = 0;
        paymentMethodsSummary[method] += Number(amount || 0);
      });
    });

    const totalExpenses = cycleExpenses.reduce((acc, curr) => acc + Number(curr.amount), 0);
    const cashExpenses = cycleExpenses.filter(e => e.paymentMethod === 'Efectivo').reduce((acc, curr) => acc + Number(curr.amount), 0);
    const averageTicket = cycleSalesCount > 0 ? (cycleTotalSales / cycleSalesCount) : 0;
    const netProfit = cycleTotalSales - totalCost - totalExpenses;
    const cashSales = cycleTransactions.reduce((acc, tx) => {
      const perMethodTotals = getPaymentMethodTotals(
        tx.paymentBreakdown,
        tx.primaryPaymentMethod || tx.payment,
        tx.installments,
        tx.cashReceived,
        tx.cashChange,
        tx.total,
      );
      return acc + Number(perMethodTotals.Efectivo || 0);
    }, 0);
    const finalPhysicalBalance = openingBalance + cashSales - cashExpenses;

    const cycleNewClients = (members || [])
      .filter((member) => {
        const createdAt = member?.createdAt || member?.created_at;
        if (!createdAt) return false;
        const createdDate = new Date(createdAt);
        if (Number.isNaN(createdDate.getTime())) return false;

        if (cycleStart) {
          return createdDate >= cycleStart && createdDate <= closeDate;
        }

        return formatDateAR(createdDate) === formatDateAR(closeDate);
      })
      .map((member) => ({
        name: member.name || 'Socio',
        number: member.memberNumber || member.member_number || '---',
        time: formatTimeFullAR(member.createdAt || member.created_at),
      }));

    let shouldSaveReport = true;
    
    if (!isAuto) {
        setIsClosingCashModalOpen(false);
        const result = await Swal.fire({
            title: '¿Generar informe de caja?',
            text: 'Si estás haciendo pruebas, podés elegir "Solo cerrar caja" para vaciarla sin guardar el reporte en tu historial.',
            icon: 'question',
            showCancelButton: true,
            showDenyButton: true,
            confirmButtonColor: '#10b981', 
            denyButtonColor: '#64748b',   
            cancelButtonColor: '#ef4444',  
            confirmButtonText: 'Sí, generar reporte',
            denyButtonText: 'No, solo cerrar caja',
            cancelButtonText: 'Cancelar cierre'
        });

        if (result.isDismissed) {
            return;
        }
        if (result.isDenied) {
            shouldSaveReport = false;
        }

        Swal.fire({ title: 'Procesando cierre...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    }

    try {
        const { data: lockData, error: lockError } = await supabase
            .from('register_state')
            .update({
                is_open: false,
                opening_balance: 0,
                opened_at: null,
                last_updated_by: currentUser?.name || 'Sistema (Auto)'
            })
            .eq('id', 1)
            .eq('is_open', true)
            .select(CLOUD_SELECTS.registerState);

        if (lockError) throw lockError;

        if (!lockData || lockData.length === 0) {
            console.log("Cierre cancelado: OTRO dispositivo ya ejecutó el cierre exitosamente.");
            setIsRegisterClosed(true);
            setRegisterOpenedAt(null);
            setIsClosingCashModalOpen(false);
            setTransactions([]);
            setExpenses([]);
            if (isAuto) setIsAutoCloseAlertOpen(true);
            return;
        }

        const openTime = registerOpenedAt
          ? formatTimeFullAR(new Date(registerOpenedAt))
          : '--:--';
        const closeTime = formatTimeFullAR(closeDate);
        const actor = getActorContext(isAuto ? 'Automático' : null);
        const user = actor.userName;
        const type = isAuto ? 'Automático' : 'Manual';

        const closurePayload = {
            date: formatDateAR(closeDate),
            open_time: openTime,
            close_time: closeTime,
            user_id: actor.userId,
            user_role: actor.userRole,
            user_name: user,
            type: type,
            opening_balance: openingBalance,
            total_sales: cycleTotalSales,
            final_balance: finalPhysicalBalance,
            total_cost: totalCost,
            total_expenses: totalExpenses,
            net_profit: netProfit,
            sales_count: cycleSalesCount,
            average_ticket: averageTicket,
            payment_methods_summary: paymentMethodsSummary,
            items_sold_list: itemsSoldList,
            new_clients_list: cycleNewClients,
            expenses_snapshot: cycleExpenses,
            transactions_snapshot: cycleTransactions
        };

        const closureLogDetails = {
          date: closurePayload.date,
          openTime,
          closeTime,
          user,
          type,
          openingBalance,
          totalSales: cycleTotalSales,
          finalBalance: finalPhysicalBalance,
          totalCost,
          totalExpenses,
          netProfit,
          salesCount: cycleSalesCount,
          averageTicket,
          paymentMethods: paymentMethodsSummary,
          itemsSold: itemsSoldList,
          newClients: cycleNewClients,
          expensesSnapshot: cycleExpenses,
          transactionsSnapshot: cycleTransactions,
          isTestMode: !shouldSaveReport
        };

        if (shouldSaveReport) {
            const { data: savedReport, error } = await insertWithSchemaFallback(
              'cash_closures',
              closurePayload,
              CLOUD_SELECTS.cashClosuresDetail,
            );
            if (error) throw error;

            const adaptedReport = mapCashClosureRecord(savedReport);
            setPastClosures((prev) => [adaptedReport, ...prev]);
            closureLogDetails.id = savedReport.id;
          }
        
        setIsRegisterClosed(true);
        setRegisterOpenedAt(null);
        
        const logMsg = isAuto ? 'Cierre Automático' : shouldSaveReport ? 'Cierre de Caja' : 'Cierre de Caja (Silencioso)';
        addLog(logMsg, closureLogDetails, isAuto ? 'Automático' : shouldSaveReport ? 'Manual' : 'Cierre silencioso');
        
        setTransactions([]);
        setExpenses([]); 
        
        if (isAuto) setIsAutoCloseAlertOpen(true);
        Swal.close();
        
        if (shouldSaveReport) {
            showNotification('success', 'Reporte Generado', 'Se ha guardado el reporte del día en la nube.');
        } else {
            showNotification('info', 'Caja Vaciada', 'Se cerró la caja sin dejar reportes (Silencioso).');
        }

    } catch (e) {
        console.error("Error guardando cierre:", e);
        showNotification('error', 'Error al Cerrar', 'Ocurrió un problema en la nube.');
        setIsClosingCashModalOpen(false);
    }
  };

  const handleConfirmCloseCash = () => executeRegisterClose(false);

  const handleSaveOpeningBalance = async () => {
    if (blockIfOfflineReadonly('abrir la caja')) return;
    const value = Number(tempOpeningBalance);
    if (!isNaN(value) && value >= 0 && tempClosingTime) {
      
      const now = new Date().toISOString();
      setOpeningBalance(value);
      setClosingTime(tempClosingTime);
      setIsRegisterClosed(false);
      setIsOpeningBalanceModalOpen(false);
      setRegisterOpenedAt(now);

      try {
          await supabase.from('register_state').update({
              is_open: true,
              opening_balance: value,
              closing_time: tempClosingTime,
              opened_at: now,
              last_updated_by: currentUser?.name
          }).eq('id', 1);

          addLog('Apertura de Caja', { amount: value, scheduledClosingTime: tempClosingTime }, 'Inicio de operaciones');
      } catch(e) {
          console.error("Error abriendo caja en nube:", e);
          showNotification('error', 'Error de Sincronización', 'La caja se abrió localmente pero falló la nube.');
      }
    }
  };

  const handleSaveClosingTime = async () => {
    if (blockIfOfflineReadonly('editar el horario de cierre')) return;
    addLog('Horario Modificado', `Nueva hora de cierre: ${closingTime}`, 'Ajuste de horario');
    setIsClosingTimeModalOpen(false);
    
    try {
        await supabase.from('register_state').update({ closing_time: closingTime }).eq('id', 1);
        showNotification('success', 'Horario Guardado', 'La hora de cierre se ha actualizado.');
    } catch(e) {
        console.error(e);
    }
  };

  const handleAddCategoryFromView = async (name) => {
    if (blockIfOfflineReadonly('crear categorías')) return;
    if (name && !categories.includes(name)) {
      try {
        const { error } = await supabase.from('categories').insert([{ name }]);
        if (error) throw error;
        setCategories([...categories, name]);
        addLog('Categoría', { name, type: 'create' });
        showNotification('success', 'Categoría Creada', `Se agregó "${name}" correctamente.`);
      } catch (e) {
        console.error(e);
        showNotification('error', 'Error', 'No se pudo crear la categoría en la nube.');
      }
    } else {
      showNotification('warning', 'Atención', 'La categoría ya existe o es inválida.');
    }
  };

  const handleDeleteCategoryFromView = async (name) => {
    if (blockIfOfflineReadonly('eliminar categorías')) return;
    const inUse = inventory.some((p) =>
      Array.isArray(p.categories) ? p.categories.includes(name) : p.category === name
    );

    if (inUse) {
      showNotification('error', 'No se puede eliminar', 'Hay productos que utilizan esta categoría.');
      return;
    }
    if (window.confirm(`¿Eliminar categoría "${name}"?`)) {
      try {
        await supabase.from('categories').delete().eq('name', name);
        setCategories(categories.filter((c) => c !== name));
        addLog('Categoría', { name, type: 'delete' });
      } catch (e) {
        console.error(e);
        showNotification('error', 'Error', 'No se pudo eliminar de la nube.');
      }
    }
  };

  const handleEditCategory = async (oldName, newName) => {
    if (blockIfOfflineReadonly('editar categorías')) return;
    try {
      const { error: catError } = await supabase
        .from('categories')
        .update({ name: newName })
        .eq('name', oldName);
      if (catError) throw catError;

      const productsToUpdate = inventory.filter(p => p.categories.includes(oldName));
      
      const promises = productsToUpdate.map(p => {
        const newCats = p.categories.map(c => c === oldName ? newName : c);
        return supabase.from('products').update({ category: newCats.join(', ') }).eq('id', p.id);
      });
      await Promise.all(promises);

      setCategories(categories.map(c => c === oldName ? newName : c));
      setInventory(inventory.map(p => {
        if (p.categories.includes(oldName)) {
          const updatedCats = p.categories.map(c => c === oldName ? newName : c);
          return { ...p, category: updatedCats.join(', '), categories: updatedCats };
        }
        return p;
      }));
      
      addLog('Editar Categoría', { old: oldName, new: newName });
      showNotification('success', 'Categoría Actualizada', 'Nombre y productos actualizados.');
    } catch (e) {
      console.error(e);
      showNotification('error', 'Error', 'No se pudo renombrar la categoría.');
    }
  };

  const handleBatchUpdateProductCategory = async (changes) => {
    if (blockIfOfflineReadonly('editar categorías de productos')) return;
    try {
      const promises = changes.map(async (change) => {
        const { productId, categoryName, action } = change;
        const product = inventory.find(p => p.id === productId);
        if (!product) return null;

        let newCats = [...(product.categories || [])];
        if (action === 'add' && !newCats.includes(categoryName)) newCats.push(categoryName);
        if (action === 'remove') newCats = newCats.filter(c => c !== categoryName);
        
        const newCategoryString = newCats.join(', ');

        const { error } = await supabase.from('products').update({ category: newCategoryString }).eq('id', productId);
        if (error) throw error;
        return { productId, newCats, newCategoryString };
      });

      const results = (await Promise.all(promises)).filter(Boolean);

      setInventory(prevInventory => prevInventory.map(p => {
        const update = results.find(r => r.productId === p.id);
        if (update) {
          return { 
            ...p, 
            category: update.newCategoryString, 
            categories: update.newCats
          };
        }
        return p;
      }));

      addLog('Actualización Masiva', { count: changes.length, category: changes[0]?.categoryName }, 'Gestor de Categorías');
      showNotification('success', 'Productos Actualizados', `${changes.length} productos modificados.`);

    } catch (e) {
      console.error(e);
      showNotification('error', 'Error', 'Falló la actualización masiva.');
    }
  };

  const handleAddItem = async (e, overrideData = null) => {
    if (blockIfOfflineReadonly('agregar productos al inventario')) return;
    e?.preventDefault?.();
    const itemData = overrideData || newItem;
    
    if (itemData.categories.length === 0) {
      showNotification('warning', 'Faltan datos', 'Por favor selecciona al menos una categoría.');
      return;
    }
    
    try {
      const payload = {
        title: itemData.title,
        brand: itemData.brand,
        price: Number(itemData.price) || 0,
        purchasePrice: Number(itemData.purchasePrice) || 0,
        stock: Number(itemData.stock) || 0,
        category: itemData.categories.join(', '), 
        barcode: itemData.barcode || null,
        image: itemData.image || '',
        image_thumb: itemData.image_thumb || itemData.imageThumb || '',
        product_type: itemData.product_type || 'quantity',
        expiration_date: itemData.expiration_date || null
      };
      
      const { data } = await insertWithSchemaFallback('products', payload, CLOUD_SELECTS.products);
      const itemFormatted = mapInventoryRecords([data])[0];
      setInventory([...inventory, itemFormatted]);
      
      const logDetails = {
        id: data.id, title: data.title, price: data.price,
        stock: data.stock, category: data.category,
        product_type: data.product_type,
        hasImage: !!data.image
      };
      addLog('Alta de Producto', logDetails, 'Producto Nuevo');
      
      setNewItem({
        title: '', brand: '', price: '', purchasePrice: '', stock: '',
        categories: [], image: '', image_thumb: '', barcode: '',
        product_type: 'quantity', expiration_date: '' 
      });
      setIsModalOpen(false);
      showNotification('success', 'Producto Agregado', 'Guardado en la nube.');
    } catch (err) {
      console.error('Error agregando producto:', err);
      showNotification('error', 'Error', 'No se pudo guardar el producto.');
    }
  };

  const saveEditProduct = async (e, overrideData = null) => {
    if (blockIfOfflineReadonly('editar productos')) return;
    e?.preventDefault?.();
    const productData = overrideData || editingProduct;
    if (!productData) return;
    
    try {
      const originalProduct = inventory.find(p => p.id === productData.id);
      if (originalProduct && originalProduct.image !== productData.image) {
        await deleteProductImage(originalProduct.image).catch(() => {});
        await deleteProductImage(originalProduct.image_thumb || originalProduct.imageThumb).catch(() => {});
      }

      const payload = {
        title: productData.title,
        price: Number(productData.price),
        purchasePrice: Number(productData.purchasePrice) || 0,
        stock: Number(productData.stock),
        category: Array.isArray(productData.categories) ? productData.categories.join(', ') : productData.category,
        barcode: productData.barcode || null,
        image: productData.image || '',
        image_thumb: productData.image_thumb || productData.imageThumb || '',
        product_type: productData.product_type || 'quantity',
        expiration_date: productData.expiration_date || null
      };

      const { data } = await updateWithSchemaFallback('products', productData.id, payload, CLOUD_SELECTS.products);
      const formattedProduct = mapInventoryRecords([data])[0];
      setInventory(inventory.map(p => p.id === productData.id ? formattedProduct : p));

      const getCategoryLabel = (product) => {
        if (Array.isArray(product?.categories) && product.categories.length > 0) {
          return product.categories.join(', ');
        }
        return product?.category || '';
      };

      const getProductTypeLabel = (productType) => (
        productType === 'weight' ? 'Por peso (kg/g)' : 'Por unidad'
      );

      const formatStockValue = (stockValue, productType) => (
        `${formatNumber(Number(stockValue || 0))} ${productType === 'weight' ? 'g' : 'uds'}`
      );

      const normalizeTextValue = (value, fallback = '--') => {
        if (value === null || value === undefined) return fallback;
        const text = String(value).trim();
        return text === '' ? fallback : text;
      };

      const originalSnapshot = {
        title: originalProduct?.title || '',
        category: getCategoryLabel(originalProduct),
        price: Number(originalProduct?.price || 0),
        purchasePrice: Number(originalProduct?.purchasePrice || 0),
        stock: Number(originalProduct?.stock || 0),
        stockLabel: formatStockValue(originalProduct?.stock, originalProduct?.product_type),
        product_type: originalProduct?.product_type || 'quantity',
        productTypeLabel: getProductTypeLabel(originalProduct?.product_type || 'quantity'),
        barcode: normalizeTextValue(originalProduct?.barcode),
        expiration_date: normalizeTextValue(originalProduct?.expiration_date),
        imageState: originalProduct?.image ? 'Cargada' : 'Sin imagen',
      };

      const updatedSnapshot = {
        title: productData.title || '',
        category: getCategoryLabel(productData),
        price: Number(productData.price || 0),
        purchasePrice: Number(productData.purchasePrice || 0),
        stock: Number(productData.stock || 0),
        stockLabel: formatStockValue(productData.stock, productData.product_type),
        product_type: productData.product_type || 'quantity',
        productTypeLabel: getProductTypeLabel(productData.product_type || 'quantity'),
        barcode: normalizeTextValue(productData.barcode),
        expiration_date: normalizeTextValue(productData.expiration_date),
        imageState: productData.image ? 'Cargada' : 'Sin imagen',
      };

      const productChanges = [];
      const pushProductChange = (field, oldValue, newValue, extra = {}) => {
        if (oldValue === newValue) return;
        productChanges.push({ field, old: oldValue, new: newValue, ...extra });
      };

      pushProductChange('Nombre', normalizeTextValue(originalSnapshot.title), normalizeTextValue(updatedSnapshot.title));
      pushProductChange('Categoría', normalizeTextValue(originalSnapshot.category), normalizeTextValue(updatedSnapshot.category));
      pushProductChange('Precio Venta', originalSnapshot.price, updatedSnapshot.price, { isPrice: true });
      pushProductChange('Precio Costo', originalSnapshot.purchasePrice, updatedSnapshot.purchasePrice, { isPrice: true });
      pushProductChange('Stock', originalSnapshot.stockLabel, updatedSnapshot.stockLabel);
      pushProductChange('Tipo', originalSnapshot.productTypeLabel, updatedSnapshot.productTypeLabel);
      pushProductChange('Código', originalSnapshot.barcode, updatedSnapshot.barcode);
      pushProductChange('Vencimiento', originalSnapshot.expiration_date, updatedSnapshot.expiration_date);
      pushProductChange('Imagen', originalSnapshot.imageState, updatedSnapshot.imageState);

      addLog('Edición Producto', {
        id: productData.id,
        product: productData.title,
        title: productData.title,
        price: productData.price,
        stock: productData.stock,
        category: getCategoryLabel(productData),
        purchasePrice: Number(productData.purchasePrice || 0),
        product_type: productData.product_type,
        imageChanged: originalProduct?.image !== productData.image ? 'Sí' : 'No',
        before: originalSnapshot,
        after: updatedSnapshot,
        changes: productChanges,
      }, editReason);
      
      setEditingProduct(null);
      setInventoryPanelCloseToken((prev) => prev + 1);
      setEditReason('');
      showNotification('success', 'Producto Editado', 'Cambios guardados en la nube.');
    } catch (err) {
      console.error('Error editando producto:', err);
      showNotification('error', 'Error', 'Fallo al guardar los cambios.');
    }
  };

  const handleDeleteProductRequest = (id) => {
    const product = inventory.find(p => p.id === id);
    if (product) {
      setProductToDelete(product);
      setDeleteProductReason('');
    }
  };

  const handleBulkSaveSingle = async (product, editData) => {
    if (blockIfOfflineReadonly('guardar cambios de productos')) return;
    try {
      const isWeight = product.product_type === 'weight';
      const finalPrice = isWeight ? Number(editData.price) / 1000 : Number(editData.price);
      const finalCost = isWeight ? Number(editData.purchasePrice) / 1000 : Number(editData.purchasePrice);
      const finalStock = isWeight ? Number(editData.stock) : Number(editData.stock);

      const payload = { price: finalPrice, purchasePrice: finalCost, stock: finalStock };

      const { error } = await supabase.from('products').update(payload).eq('id', product.id);
      if (error) throw error;

      setInventory(inventory.map(p => p.id === product.id ? { ...p, price: finalPrice, purchasePrice: finalCost, stock: finalStock } : p));
      
      addLog('Edición Rápida', { id: product.id, title: product.title, changes: payload }, 'Editor Masivo');
      showNotification('success', 'Guardado', 'Producto actualizado.');
    } catch (e) {
      console.error(e);
      showNotification('error', 'Error', 'No se pudo actualizar el producto.');
    }
  };

  const handleBulkSaveMasive = async (bulkData) => {
    if (blockIfOfflineReadonly('guardar cambios masivos')) return;
    try {
      Swal.fire({ title: 'Guardando masivamente...', text: `Actualizando ${bulkData.length} productos. Por favor espera.`, allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      
      const promises = bulkData.map(item => {
        const { product, edits } = item;
        const isWeight = product.product_type === 'weight';
        const finalPrice = isWeight ? Number(edits.price) / 1000 : Number(edits.price);
        const finalCost = isWeight ? Number(edits.purchasePrice) / 1000 : Number(edits.purchasePrice);
        const finalStock = isWeight ? Number(edits.stock) : Number(edits.stock);

        return supabase.from('products').update({ price: finalPrice, purchasePrice: finalCost, stock: finalStock })
          .eq('id', product.id)
          .then(({error}) => {
             if(error) throw error;
             return { id: product.id, finalPrice, finalCost, finalStock };
          });
      });

      const results = await Promise.all(promises);

      setInventory(prev => prev.map(p => {
        const updated = results.find(r => r.id === p.id);
        if (updated) {
          return { ...p, price: updated.finalPrice, purchasePrice: updated.finalCost, stock: updated.finalStock };
        }
        return p;
      }));

      addLog('Edición Masiva', { count: bulkData.length, items: bulkData.map(b => b.product.title) }, 'Editor Masivo');
      
      Swal.close();
      showNotification('success', 'Actualización Masiva', `Se actualizaron ${bulkData.length} productos correctamente.`);
    } catch (e) {
      console.error(e);
      Swal.fire('Error', 'Fallo la actualización masiva. Revisa tu conexión.', 'error');
    }
  };

  const confirmDeleteProduct = async (e) => {
    if (blockIfOfflineReadonly('eliminar productos')) return;
    e?.preventDefault?.();
    if (productToDelete) {
      try {
        const { error } = await supabase
          .from('products')
          .update({ is_active: false })
          .eq('id', productToDelete.id);
        if (error) throw error;

        if (productToDelete.image) {
          await deleteProductImage(productToDelete.image).catch(() => {});
          await deleteProductImage(productToDelete.image_thumb || productToDelete.imageThumb).catch(() => {});
        }

        setInventory(inventory.filter((x) => x.id !== productToDelete.id));
        addLog('Baja Producto', { id: productToDelete.id, title: productToDelete.title }, deleteProductReason || 'Sin motivo');
        setProductToDelete(null);
        showNotification('success', 'Producto Eliminado', 'Se quitó del inventario.');
      } catch (err) {
        console.error('Error eliminando producto:', err);
        showNotification('error', 'Error al Eliminar', `No se pudo borrar: ${err.message}`);
      }
    }
  };

  const handleDuplicateProduct = async (originalProduct) => {
    if (blockIfOfflineReadonly('duplicar productos')) return;
    try {
      const payload = {
        title: `${originalProduct.title} (copia)`,
        brand: originalProduct.brand || '',
        price: Number(originalProduct.price) || 0,
        purchasePrice: Number(originalProduct.purchasePrice) || 0,
        stock: Number(originalProduct.stock) || 0,
        category: Array.isArray(originalProduct.categories) 
          ? originalProduct.categories.join(', ') 
          : originalProduct.category || '',
        barcode: null,       
        image: '',
        image_thumb: '',
        product_type: originalProduct.product_type || 'quantity'
      };

      const { data } = await insertWithSchemaFallback('products', payload, CLOUD_SELECTS.products);
      const newProduct = mapInventoryRecords([data])[0];

      setInventory(prev => [...prev, newProduct]);

      addLog('Producto Duplicado', {
        originalId: originalProduct.id,
        originalTitle: originalProduct.title,
        newId: data.id,
        newTitle: data.title
      }, 'Duplicado desde editor');

      setEditingProduct(newProduct);
      setEditReason('');

      showNotification('success', 'Producto Duplicado', `Se creó "${data.title}" como copia.`);
    } catch (err) {
      console.error('Error duplicando producto:', err);
      showNotification('error', 'Error al Duplicar', 'No se pudo crear la copia del producto.');
    }
  };

  const handleRedeemReward = (reward) => {
    if (!posSelectedClient || posSelectedClient.id === 'guest' || posSelectedClient.id === 0) {
      showNotification('error', 'Error', 'No hay cliente seleccionado para el canje.');
      return;
    }
    const isDiscountReward = reward.type === 'discount';
    const rewardItem = {
      id: reward.id, 
      title: `CANJE: ${reward.title}`,
      price: -Number(reward.discountAmount), 
      quantity: 1,
      isReward: true, 
      isDiscount: isDiscountReward,
      type: isDiscountReward ? 'discount' : 'reward',
      pointsCost: Number(reward.pointsCost), 
      image: 'reward' 
    };
    setCart((prev) => [...prev, rewardItem]);
    showNotification('success', 'Premio Aplicado', 'El descuento se ha agregado al carrito.');
  };

  const extractCouponCodeFromSaleItem = (item) => {
    const title = String(item?.title || '');
    const description = String(item?.description || '');
    const couponMatch =
      title.match(/cup[oó]n\s+([a-z0-9_-]+)/i) ||
      description.match(/cup[oó]n\s+([a-z0-9_-]+)/i);

    return couponMatch ? String(couponMatch[1]).trim().toUpperCase() : '';
  };

  const enrichClientWithCouponUsage = (client) => {
    if (!client || client.id === 'guest') return client;

    const memberId = String(client.id || '');
    const memberNumber = String(client.memberNumber || '');

    const usedCoupons = (transactions || []).flatMap((tx) => {
      if (tx.status === 'voided' || !tx.client) return [];

      const sameClient =
        String(tx.client?.id || '') === memberId ||
        String(tx.client?.memberNumber || '') === memberNumber;

      if (!sameClient) return [];

      return (tx.items || [])
        .map((item) => extractCouponCodeFromSaleItem(item))
        .filter(Boolean);
    });

    return {
      ...client,
      usedCoupons: Array.from(new Set(usedCoupons)),
    };
  };

  const handleSelectPosClient = (client) => {
    const enrichedClient = enrichClientWithCouponUsage(client);
    setPosSelectedClient(enrichedClient);
    return enrichedClient;
  };

  const handleCreatePosClient = async (data) => {
    const createdClient = await handleAddMemberWithLog(data);
    if (!createdClient?.id) return null;
    return handleSelectPosClient(createdClient);
  };

  const handleCheckout = async (checkoutOptions = {}) => {
    if (blockIfOfflineReadonly('registrar ventas')) return;
    const subtotal = cart.reduce(
      (sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0),
      0,
    );
    const normalizedPaymentBreakdown = normalizePaymentBreakdown(
      checkoutOptions.paymentLines,
      selectedPayment,
      installments,
      checkoutOptions.cashReceived,
      checkoutOptions.cashChange,
      calculateTotal(),
    );
    const paymentTotals = getPaymentBreakdownTotals(normalizedPaymentBreakdown);
    const paymentInfo = getPrimaryPaymentInfo(
      normalizedPaymentBreakdown,
      selectedPayment,
      installments,
      checkoutOptions.cashReceived,
      checkoutOptions.cashChange,
      paymentTotals.chargedTotal,
    );
    const total = paymentTotals.chargedTotal || calculateTotal();
    const cashReceived = paymentInfo.cashReceived || null;
    const cashChange = paymentInfo.cashChange || 0;
    const paymentSummary = paymentInfo.payment;
    const primaryPaymentMethod = paymentInfo.primaryMethod;
    const primaryInstallments = paymentInfo.installments;
    
    // ? MAGIA: Agrupamos todo el stock requerido (productos sueltos + los que están adentro de combos)
    const requiredStock = {};
    cart.forEach(c => {
      if (c.isReward || c.isCustom || c.isDiscount) return; // IGNORAMOS REWARDS, CUSTOM Y DESCUENTOS PUROS
      
      if (c.isCombo && c.productsIncluded) {
        c.productsIncluded.forEach(includedItem => {
          const includedQuantity = Number(
            includedItem.quantity ??
            includedItem.qty ??
            (includedItem.product_type === 'weight' ? 1000 : 1)
          ) || (includedItem.product_type === 'weight' ? 1000 : 1);
          requiredStock[includedItem.id] = (requiredStock[includedItem.id] || 0) + (includedQuantity * Number(c.quantity || 1));
        });
      } else if (!c.isCombo) {
        requiredStock[c.id] = (requiredStock[c.id] || 0) + c.quantity;
      }
    });

    const stockIssues = [];
    Object.keys(requiredStock).forEach(id => {
      // Ignoramos IDs generados manualmente que se hayan colado
      if (String(id).startsWith('custom_') || String(id).startsWith('desc_') || String(id).startsWith('combo_')) return;
      
      // CAST A STRING PARA EVITAR ERROR DE TIPADO AL BUSCAR EN INVENTORY
      const p = inventory.find(x => String(x.id) === String(id));
      if (!p || p.stock < requiredStock[id]) {
        stockIssues.push(p ? p.title : 'Desconocido');
      }
    });

    if (stockIssues.length > 0) { 
      showNotification('error', 'Falta Stock', `Revisar: ${stockIssues.join(', ')}`); 
      return; 
    }

    try {
      Swal.fire({ title: 'Procesando...', didOpen: () => Swal.showLoading() });

      const pointsEarned = Math.floor(total / 500)
      const pointsSpent = cart.reduce((acc, i) => acc + (i.isReward ? i.pointsCost : 0), 0);
      const clientId = posSelectedClient?.id && posSelectedClient.id !== 'guest' ? posSelectedClient.id : null;
      const actor = getActorContext();

      const salePayload = {
        total,
        payment_method: paymentSummary,
        payment_breakdown: normalizedPaymentBreakdown,
        installments: primaryInstallments,
        client_id: clientId,
        points_earned: clientId ? pointsEarned : 0,
        points_spent: pointsSpent,
        user_id: actor.userId,
        user_role: actor.userRole,
        user_name: actor.userName,
        cash_received: cashReceived,
        cash_change: cashChange,
      };
      const { data: sale, error: saleErr } = await insertWithSchemaFallback('sales', salePayload, 'id');
      if (saleErr) throw saleErr;

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const itemsPayload = cart.map(i => {
        let productId = i.productId || i.id;
        if (i.isCustom || i.isCombo || i.isDiscount || i.isReward || !uuidRegex.test(String(productId || ''))) {
          productId = null;
        }

        return {
          sale_id: sale.id,
          product_id: productId,
          product_title: i.title,
          quantity: i.quantity,
          price: i.price,
          is_reward: !!i.isReward,
          product_type: i.product_type || 'quantity',
        };
      });
      try {
        await insertRowsWithSchemaFallback('sale_items', itemsPayload);
      } catch (saleItemsErr) {
        throw new Error(`Supabase rechaz\u00f3 los productos de la venta: ${saleItemsErr.message}`);
      }

      const stockChanges = Object.entries(requiredStock)
        .map(([id, qtyToDeduct]) => {
          const product = inventory.find((p) => String(p.id) === String(id));
          if (!product) return null;

          const beforeStock = Number(product.stock || 0);
          return {
            productId: product.id,
            title: product.title,
            product_type: product.product_type || 'quantity',
            quantitySold: Number(qtyToDeduct || 0),
            stockBefore: beforeStock,
            stockAfter: beforeStock - Number(qtyToDeduct || 0),
          };
        })
        .filter(Boolean);

      // ? Descontamos stock usando el mapa que agrupamos al principio
      for (const [id, qtyToDeduct] of Object.entries(requiredStock)) {
         // CAST A STRING PARA EVITAR ERROR DE TIPADO
         const prod = inventory.find(p => String(p.id) === String(id));
         if (prod) {
             await supabase.from('products').update({ stock: prod.stock - qtyToDeduct }).eq('id', id);
         }
      }

      let updatedClientForTicket = null;
      let pointsChange = null; 
      if (clientId) {
          const previousPoints = posSelectedClient.points;
          const newPoints = previousPoints - pointsSpent + pointsEarned;
          pointsChange = { previous: previousPoints, new: newPoints, diff: newPoints - previousPoints };

          await supabase.from('clients').update({ points: newPoints }).eq('id', clientId);
          
          updatedClientForTicket = {
            ...posSelectedClient,
            points: newPoints,
            currentPoints: newPoints,
            memberNumber: posSelectedClient?.memberNumber || posSelectedClient?.member_number || null,
            created_at: posSelectedClient?.created_at || posSelectedClient?.createdAt || null,
            createdAt: posSelectedClient?.createdAt || posSelectedClient?.created_at || null,
          };
          setMembers((prev) =>
            prev.map((member) =>
              member.id === clientId
                ? {
                    ...member,
                    ...updatedClientForTicket,
                    memberNumber:
                      updatedClientForTicket.memberNumber || member.memberNumber || member.member_number,
                    created_at:
                      updatedClientForTicket.created_at || member.created_at || member.createdAt || null,
                    createdAt:
                      updatedClientForTicket.createdAt || member.createdAt || member.created_at || null,
                  }
                : member,
            ),
          );
      }

      // ? Actualizamos el inventario local en React
      setInventory(inventory.map(p => {
        const qtyToDeduct = requiredStock[p.id];
        return qtyToDeduct ? { ...p, stock: p.stock - qtyToDeduct } : p;
      }));

      const tx = {
        id: sale.id,
        date: formatDateAR(new Date()),
        time: formatTimeFullAR(new Date()),
        user: currentUser.displayName || currentUser.name,
        userId: currentUser.id || null,
        userRole: currentUser.role || null,
        total,
        payment: paymentSummary,
        primaryPaymentMethod,
        paymentBreakdown: normalizedPaymentBreakdown,
        installments: primaryInstallments,
        cashReceived,
        cashChange,
        items: cart,
        status: 'completed',
        client: updatedClientForTicket || posSelectedClient, 
        pointsEarned: clientId ? pointsEarned : 0,
        pointsSpent: pointsSpent,
      };

      tx.isTest = isTestRecord(tx);
      setTransactions([tx, ...transactions]);

      const logItems = cart.map(item => ({
        id: item.id,
        title: item.title,
        quantity: item.quantity,
        price: item.price,
        subtotal:
          (Number(item.price) || 0) *
          ((item.product_type || 'quantity') === 'weight'
            ? Number(item.quantity || 0) / 1000
            : Number(item.quantity || 0)),
        isReward: item.isReward || false,
        isDiscount: item.isDiscount || false,
        type: item.type || (item.isDiscount ? 'discount' : undefined),
        product_type: item.product_type || 'quantity',
        isCustom: item.isCustom || false,
        isCombo: item.isCombo || false,
        productsIncluded: (item.productsIncluded || []).map((includedItem) => ({
          id: includedItem.id,
          title: includedItem.title,
          quantity: Number(
            includedItem.quantity ??
            includedItem.qty ??
            (includedItem.product_type === 'weight' ? 1000 : 1)
          ) || (includedItem.product_type === 'weight' ? 1000 : 1),
          product_type: includedItem.product_type || 'quantity',
        })),
      }));

      const isGuest = !posSelectedClient || posSelectedClient.id === 'guest';
      
      addLog('Venta Realizada', { 
        transactionId: tx.id, total: total, items: logItems,
        subtotal,
        payment: paymentSummary,
        primaryPaymentMethod,
        paymentBreakdown: normalizedPaymentBreakdown,
        installments: primaryInstallments,
        cashReceived,
        cashChange,
        client: isGuest ? null : posSelectedClient.name,
        memberNumber: isGuest ? null : posSelectedClient.memberNumber,
        pointsEarned: clientId ? pointsEarned : 0,
        pointsSpent: pointsSpent,
        pointsChange: pointsChange,
        stockChanges,
      }, 'Venta regular');
      
      setSaleSuccessModal(tx);
      setCart([]); setInstallments(1); setPosSearch(''); setPosSelectedClient(null);
      Swal.close();

    } catch (e) {
      console.error(e);
      Swal.fire('Error', 'Fallo al guardar la venta', 'error');
    }
  };

  const handleDeleteTransaction = (tx) => {
    setTransactionToRefund(tx);
    setRefundReason('');
  };
  
  const handleConfirmRefund = async (e) => {
    if (blockIfOfflineReadonly('anular o eliminar ventas')) return;
    e?.preventDefault?.();
    const tx = transactionToRefund;
    if (!tx) return;
    
    try {
      // ==========================================
      // 1. FLUJO DE BORRADO PERMANENTE (PURGA)
      // ==========================================
      if (tx.status === 'voided') {
        Swal.fire({ title: 'Borrando...', text: 'Eliminando registro permanentemente...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        
        // Limpiamos la vista local de transacciones para que desaparezca el registro operativo,
        // pero mantenemos intacta la trazabilidad del Registro de Acciones.
        setTransactions(prev => prev.filter(t => String(t.id) !== String(tx.id)));
        
        const clientName = tx.client?.name || (typeof tx.client === 'string' ? tx.client : null);
        const clientNum = tx.client?.memberNumber || tx.memberNumber || null;

        // CREAMOS EL LOG DE "VENTA ELIMINADA" (Antes llamado Borrado Permanente)
        addLog('Venta Eliminada', {
            transactionId: tx.id,
            total: tx.total,
            payment: tx.payment,
            paymentBreakdown: tx.paymentBreakdown || null,
            installments: tx.installments || 0,
            isTest: tx.isTest || false,
            testMarker: tx.isTest ? 'test' : 'normal',
            items: tx.items || [],
            itemsReturned: (tx.items || []).map((item) => ({
              title: item.title || item.name || 'Producto',
              quantity: item.quantity || item.qty || 0,
            })),
            stockAlreadyRestored: true,
            client: clientName === 'No asociado' ? null : clientName,
            memberNumber: clientNum,
            pointsEarned: tx.pointsEarned || 0,
            pointsSpent: tx.pointsSpent || 0
        }, refundReason || 'Eliminación permanente');

        setTransactionToRefund(null);
        setRefundReason('');
        Swal.close();
        showNotification('success', 'Registro Borrado', 'La transacción fue eliminada del historial operativo y su trazabilidad quedó registrada.');
        return; 
      }

      // ==========================================
      // 2. FLUJO DE ANULACIÓN NORMAL
      // ==========================================
      Swal.fire({ title: 'Anulando...', text: 'Paso 1: Devolviendo stock...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      const updatedInventory = [...inventory];
      const restoredStockChanges = [];
      for (const item of tx.items) {
        if (!item.isReward && !item.isCustom) { 
          const prodIndex = updatedInventory.findIndex(p => 
               (item.productId && String(p.id) === String(item.productId)) || 
               (item.id && String(p.id) === String(item.id)) ||
               p.title === item.title
          );
          if (prodIndex !== -1) {
            const prodId = updatedInventory[prodIndex].id;
            const qtyToReturn = Number(item.quantity || item.qty || 0);
            const beforeStock = Number(updatedInventory[prodIndex].stock || 0);
            const newStock = beforeStock + qtyToReturn;
            restoredStockChanges.push({
              productId: prodId,
              title: updatedInventory[prodIndex].title,
              product_type: updatedInventory[prodIndex].product_type || 'quantity',
              quantityRestored: qtyToReturn,
              stockBefore: beforeStock,
              stockAfter: newStock,
            });
            updatedInventory[prodIndex] = { ...updatedInventory[prodIndex], stock: newStock };
            
            const { error: stockErr } = await supabase.from('products').update({ stock: newStock }).eq('id', prodId);
            if (stockErr) throw new Error(`Fallo actualizando stock: ${stockErr.message}`);
          }
        }
      }
      setInventory(updatedInventory);

      Swal.fire({ title: 'Anulando...', text: 'Paso 2: Ajustando puntos del socio...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      const clientMemberNumber = tx.client?.memberNumber || tx.client?.number || tx.memberNumber;
      let updatedMembers = [...members];
      let pointsChange = null; 
      
      if (clientMemberNumber && clientMemberNumber !== '---') {
        const clientIndex = updatedMembers.findIndex(m => String(m.memberNumber) === String(clientMemberNumber));
        if (clientIndex !== -1) {
          const dbClient = updatedMembers[clientIndex];
          const previousPoints = dbClient.points;
          const newPoints = Math.max(0, dbClient.points - (tx.pointsEarned || 0) + (tx.pointsSpent || 0));
          
          updatedMembers[clientIndex] = { ...dbClient, points: newPoints };
          pointsChange = { previous: previousPoints, new: newPoints, diff: newPoints - previousPoints };
          
          const { error: clientErr } = await supabase.from('clients').update({ points: newPoints }).eq('id', dbClient.id);
          if (clientErr) throw new Error(`Fallo actualizando puntos: ${clientErr.message}`);
        }
      }
      setMembers(updatedMembers);

      Swal.fire({ title: 'Anulando...', text: 'Paso 3: Borrando la venta de la nube...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      
      const { error: itemsErr } = await supabase.from('sale_items').delete().eq('sale_id', tx.id);
      if (itemsErr) throw new Error(`Fallo borrando items de la venta: ${itemsErr.message}`);

      const { error: saleErr } = await supabase.from('sales').delete().eq('id', tx.id);
      if (saleErr) throw new Error(`Fallo borrando la venta: ${saleErr.message}`);

      Swal.fire({ title: 'Anulando...', text: 'Paso 4: Creando el registro final...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      
      let clientName = null;
      if (tx.client && typeof tx.client === 'object') clientName = tx.client.name;
      else if (typeof tx.client === 'string') clientName = tx.client;
      else if (tx.memberName) clientName = tx.memberName;

      const logDetails = {
        id: tx.id,
        originalDate: tx.date || null,
        originalTimestamp: tx.timestamp || tx.time || null,
        originalFullDate: tx.fullDate || null,
        originalCreatedAt: tx.createdAt || tx.created_at || null,
        total: tx.total,
        payment: tx.payment,
        paymentBreakdown: tx.paymentBreakdown || null,
        installments: tx.installments || 0,
        client: clientName === 'No asociado' ? null : clientName,
        memberNumber: clientMemberNumber,
        pointsEarned: tx.pointsEarned || 0,
        pointsSpent: tx.pointsSpent || 0,
        pointsChange: pointsChange,
        cashReceived: tx.cashReceived || 0,
        cashChange: tx.cashChange || 0,
        items: (tx.items || []).map((i) => ({
          id: i.id,
          productId: i.productId || i.id,
          title: i.title,
          qty: i.qty || i.quantity,
          quantity: i.qty || i.quantity,
          price: i.price,
          isReward: !!i.isReward,
          isCustom: !!i.isCustom,
          isCombo: !!i.isCombo,
          product_type: i.product_type || 'quantity',
          category: i.category || null,
          categories: Array.isArray(i.categories) ? i.categories : null,
          productsIncluded: Array.isArray(i.productsIncluded) ? i.productsIncluded : undefined,
        })),
        itemsReturned: tx.items.map(i => ({
          title: i.title,
          quantity: i.quantity || i.qty
        })),
        stockChanges: restoredStockChanges,
      };
      
      addLog('Venta Anulada', logDetails, refundReason || 'Anulación manual');

      const exists = transactions.some(t => String(t.id) === String(tx.id));
      if (exists) {
        setTransactions(transactions.map((t) => String(t.id) === String(tx.id) ? { ...t, status: 'voided' } : t));
      } else {
        setTransactions([{ ...tx, status: 'voided' }, ...transactions]);
      }
      
      setTransactionToRefund(null);
      setRefundReason('');
      
      Swal.close();
      showNotification('success', 'Venta Anulada', 'El stock y los puntos han sido restaurados.');

    } catch (error) {
      console.error("? ERROR CRÍTICO EN ANULACIÓN:", error);
      Swal.fire({
        icon: 'error',
        title: 'Error de Anulación',
        text: error.message || 'Ocurrió un error desconocido. Revisa la consola (F12).',
        confirmButtonColor: '#d33',
        confirmButtonText: 'Entendido'
      });
    }
  };
  
  const handleRestoreTransaction = async (tx) => {
    if (blockIfOfflineReadonly('restaurar ventas')) return;
    const result = await Swal.fire({
      title: '¿Restaurar Venta?',
      text: 'Se volverá a registrar la venta en el sistema, ocupará su fecha original, se descontará el stock nuevamente y se le devolverán los puntos al socio. ¿Estás seguro?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Sí, restaurar venta',
      cancelButtonText: 'Cancelar'
    });

    if (!result.isConfirmed) return;

    const stockIssues = [];
    for (const item of tx.items) {
      if (!item.isReward && !item.isCustom) {
        const prod = inventory.find(p => 
           (item.productId && String(p.id) === String(item.productId)) || 
           (item.id && String(p.id) === String(item.id)) ||
           (item.title && p.title === item.title)
        );
        
        const qtyNeeded = Number(item.qty || item.quantity || 0);
        
        if (!prod) {
            stockIssues.push(`"${item.title}" (Producto ya no existe en inventario)`);
        } else {
            const currentStock = Number(prod.stock || 0);
            if (currentStock < qtyNeeded) {
                stockIssues.push(`"${item.title}" (Faltan ${qtyNeeded - currentStock})`);
            }
        }
      }
    }
    
    if (stockIssues.length > 0) {
      Swal.fire('Stock Insuficiente', `No hay stock suficiente actualmente para restaurar esta venta:\n\n${stockIssues.join('\n')}`, 'error');
      return;
    }

    Swal.fire({ title: 'Restaurando...', text: 'Ajustando base de datos...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
      let clientId = null;
      let clientDb = null;
      let pointsChange = null; 
      
      const clientNumForRestore = tx.client?.memberNumber || tx.memberNumber || null;
      if (clientNumForRestore && clientNumForRestore !== '---') {
          clientDb = members.find(m => String(m.memberNumber) === String(clientNumForRestore));
          if (clientDb) clientId = clientDb.id;
      }

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      
      let origCreatedAt = undefined;
      try {
          const [day, month, year] = tx.date.split('/');
          let fullYear = parseInt(year, 10);
          if (fullYear < 100) fullYear += 2000;
          const timeParts = (tx.time || tx.timestamp || '00:00').split(':');
          const origDate = new Date(fullYear, parseInt(month, 10) - 1, parseInt(day, 10), parseInt(timeParts[0], 10), parseInt(timeParts[1] || 0, 10), parseInt(timeParts[2] || 0, 10));
          origCreatedAt = origDate.toISOString();
      } catch(e) { console.error("Error parsing date", e); }

      const salePayload = {
          total: tx.total,
          payment_method: (tx.payment && tx.payment !== 'N/A') ? tx.payment : 'Efectivo',
          payment_breakdown: tx.paymentBreakdown || null,
          installments: tx.installments || 0,
          client_id: clientId,
          points_earned: tx.pointsEarned || 0,
          points_spent: tx.pointsSpent || 0,
          user_name: tx.user || currentUser.name
      };

      if (origCreatedAt) salePayload.created_at = origCreatedAt;
      if (uuidRegex.test(tx.id)) salePayload.id = tx.id;

      const { data: newSale } = await insertWithSchemaFallback('sales', salePayload, 'id');

      const itemsPayload = tx.items.map(i => {
          const prod = inventory.find(p => 
               (i.productId && String(p.id) === String(i.productId)) || 
               (i.id && String(p.id) === String(i.id)) ||
               p.title === i.title
          );
          
          let prodId = prod ? prod.id : (i.productId || i.id);
          if (!uuidRegex.test(prodId)) prodId = null; 
          
          return {
              sale_id: newSale.id, 
              product_id: prodId, 
              product_title: i.title, 
              quantity: i.qty || i.quantity, 
              price: i.price, 
              is_reward: !!i.isReward
          };
      });
      
      if (itemsPayload.length > 0) {
          await insertRowsWithSchemaFallback('sale_items', itemsPayload);
      }

      const updatedInventory = [...inventory];
      for (const item of tx.items) {
         if (!item.isReward && !item.isCustom) {
            const prodIndex = updatedInventory.findIndex(p => 
               (item.productId && String(p.id) === String(item.productId)) || 
               (item.id && String(p.id) === String(item.id)) ||
               p.title === item.title
            );
            if (prodIndex !== -1) {
               const prodId = updatedInventory[prodIndex].id;
               const qtyToDeduct = Number(item.qty || item.quantity || 0);
               const newStock = updatedInventory[prodIndex].stock - qtyToDeduct;
               updatedInventory[prodIndex] = { ...updatedInventory[prodIndex], stock: newStock };
               await supabase.from('products').update({ stock: newStock }).eq('id', prodId);
            }
         }
      }
      setInventory(updatedInventory);

      if (clientDb) {
          const previousPoints = clientDb.points;
          const newPoints = clientDb.points + (tx.pointsEarned || 0) - (tx.pointsSpent || 0);
          
          pointsChange = { previous: previousPoints, new: newPoints, diff: newPoints - previousPoints };
          
          await supabase.from('clients').update({ points: newPoints }).eq('id', clientDb.id);
          setMembers((prev) =>
            prev.map((member) =>
              member.id === clientDb.id
                ? {
                    ...member,
                    points: newPoints,
                    created_at: member.created_at || member.createdAt || null,
                    createdAt: member.createdAt || member.created_at || null,
                  }
                : member,
            ),
          );
      }

      let clientName = null;
      if (tx.client && typeof tx.client === 'object') clientName = tx.client.name;
      else if (typeof tx.client === 'string') clientName = tx.client;
      else if (tx.memberName) clientName = tx.memberName;
      
      const clientNum = tx.client?.memberNumber || tx.memberNumber || null;

      const logDetails = {
         transactionId: newSale.id, 
         oldTransactionId: tx.id,
         total: tx.total, 
         payment: salePayload.payment_method,
         paymentBreakdown: tx.paymentBreakdown || null,
         installments: salePayload.installments,
         client: clientName === 'No asociado' ? null : clientName,
         memberNumber: clientNum,
         pointsEarned: tx.pointsEarned || 0,
         pointsSpent: tx.pointsSpent || 0,
         pointsChange: pointsChange,
         itemsRestored: tx.items.map(i => ({ title: i.title, quantity: i.qty || i.quantity })),
         itemsSnapshot: tx.items.map(i => ({
           id: i.id,
           productId: i.productId || i.id,
           title: i.title,
           quantity: i.qty || i.quantity,
           price: i.price,
           isReward: !!i.isReward,
           product_type: i.product_type || 'quantity',
           isCustom: !!i.isCustom,
           isCombo: !!i.isCombo,
           category: i.category || null,
           categories: Array.isArray(i.categories) ? i.categories : null
         }))
      };
      
      addLog('Venta Restaurada', logDetails, 'Restauración manual desde el historial');

      const now = new Date();
      const restoredTx = {
         ...tx,
         id: newSale.id,
         status: 'completed',
         isHistoric: false,
         isRestored: true,
         payment: salePayload.payment_method,
         paymentBreakdown: tx.paymentBreakdown || null,
         installments: salePayload.installments,
         restoredAt: `${formatDateAR(now)} ${formatTimeFullAR(now)}`
      };
      restoredTx.isTest = isTestRecord(restoredTx);
      
      setTransactions([restoredTx, ...transactions.filter(t => String(t.id) !== String(tx.id))]);
      
      Swal.close();
      showNotification('success', 'Venta Restaurada', 'La venta vuelve a estar activa con su fecha original.');

    } catch (err) {
      console.error(err);
      Swal.fire('Error', 'No se pudo restaurar la venta. Verifique su conexión y la consola.', 'error');
    }
  };

  const addTxItem = (product) => {
    if (!editingTransaction) return;
    const existingItemIndex = editingTransaction.items.findIndex(
      (i) => i.productId === product.id || (i.id === product.id && !i.productId)
    );
    let updatedItems;
    if (existingItemIndex !== -1) {
      updatedItems = editingTransaction.items.map((i, idx) =>
        idx === existingItemIndex ? { ...i, qty: (Number(i.qty) || 0) + 1 } : i
      );
    } else {
      const maxUniqueId = Math.max(0, ...editingTransaction.items.map((i) => i.uniqueId || 0));
      updatedItems = [
        ...editingTransaction.items,
        {
          uniqueId: maxUniqueId + 1,
          productId: product.id,
          id: product.id,
          title: product.title,
          price: Number(product.price) || 0,
          qty: 1,
        },
      ];
    }
    const subtotal = updatedItems.reduce(
      (acc, item) => acc + (Number(item.price) || 0) * (Number(item.qty) || 0),
      0
    );
    const newTotal = editingTransaction.payment === 'Credito' ? subtotal * 1.1 : subtotal;
    setEditingTransaction({ ...editingTransaction, items: updatedItems, total: newTotal });
    setTransactionSearch('');
  };

  const removeTxItem = (itemIndex) => {
    if (!editingTransaction) return;
    const updatedItems = editingTransaction.items.filter((item, idx) => idx !== itemIndex);
    if (updatedItems.length === 0) {
      showNotification('warning', 'Operación Inválida', 'No puedes dejar la orden vacía.');
      return;
    }
    const subtotal = updatedItems.reduce((acc, item) => acc + (Number(item.price) || 0) * (Number(item.qty) || 0), 0);
    const newTotal = editingTransaction.payment === 'Credito' ? subtotal * 1.1 : subtotal;
    setEditingTransaction({ ...editingTransaction, items: updatedItems, total: newTotal });
  };

  const setTxItemQty = (itemIndex, val) => {
    if (!editingTransaction) return;
    const qty = parseInt(val);
    if (isNaN(qty) || qty < 1) return;
    const updatedItems = editingTransaction.items.map((item, idx) => {
      if (idx === itemIndex) {
        return { ...item, qty: qty };
      }
      return item;
    });
    const subtotal = updatedItems.reduce((acc, item) => acc + (Number(item.price) || 0) * (Number(item.qty) || 0), 0);
    const newTotal = editingTransaction.payment === 'Credito' ? subtotal * 1.1 : subtotal;
    setEditingTransaction({ ...editingTransaction, items: updatedItems, total: newTotal });
  };

  const handleEditTxPaymentChange = (newPayment) => {
    if (!editingTransaction) return;
    const subtotal = editingTransaction.items.reduce((acc, item) => acc + (Number(item.price) || 0) * (Number(item.qty) || 0), 0);
    const newTotal = newPayment === 'Credito' ? subtotal * 1.1 : subtotal;
    const nextCashReceived = newPayment === 'Efectivo'
      ? Number(editingTransaction.cashReceived || newTotal)
      : 0;
    setEditingTransaction({
      ...editingTransaction,
      payment: newPayment,
      total: newTotal,
      installments: newPayment === 'Credito' ? 1 : 0,
      cashReceived: nextCashReceived,
      cashChange: newPayment === 'Efectivo' ? Math.max(0, nextCashReceived - newTotal) : 0,
    });
  };

  const handleSaveEditedTransaction = async (e) => {
    if (blockIfOfflineReadonly('editar ventas')) return;
    e?.preventDefault?.();
    if (!editingTransaction) return;

    const originalTx =
      transactions.find((t) => String(t.id) === String(editingTransaction.id)) ||
      editingTransaction;

    const safeCashReceived = editingTransaction.payment === 'Efectivo'
      ? Number(editingTransaction.cashReceived ?? editingTransaction.total ?? 0)
      : 0;
    const safeCashChange = editingTransaction.payment === 'Efectivo'
      ? Math.max(0, safeCashReceived - Number(editingTransaction.total || 0))
      : 0;

    if (editingTransaction.payment === 'Efectivo' && safeCashReceived < Number(editingTransaction.total || 0)) {
      showNotification('warning', 'Monto insuficiente', 'El monto recibido en efectivo debe cubrir el total luego de la modificación.');
      return;
    }

    try {
      Swal.fire({ title: 'Guardando cambios...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

      // 1. Detección de cambios básicos
      const changes = {};
      if (originalTx.total !== editingTransaction.total) changes.total = { old: originalTx.total, new: editingTransaction.total };
      if (originalTx.payment !== editingTransaction.payment) changes.payment = { old: originalTx.payment, new: editingTransaction.payment };
      if (Number(originalTx.installments || 0) !== Number(editingTransaction.installments || 0)) {
        changes.installments = { old: Number(originalTx.installments || 0), new: Number(editingTransaction.installments || 0) };
      }
      if (Number(originalTx.cashReceived || 0) !== safeCashReceived) {
        changes.cashReceived = { old: Number(originalTx.cashReceived || 0), new: safeCashReceived };
      }
      if (Number(originalTx.cashChange || 0) !== safeCashChange) {
        changes.cashChange = { old: Number(originalTx.cashChange || 0), new: safeCashChange };
      }

      // 2. Normalización absoluta de items
      const finalItems = editingTransaction.items.map(i => ({
          ...i,
          qty: Number(i.qty || i.quantity || 0),
          price: Number(i.price || 0),
          title: i.title || i.product_title || i.name || 'Producto'
      }));

      // [Cálculo de diferencias para stock]
      const productChanges = [];
      const oldMap = {};
      originalTx.items.forEach(i => { oldMap[i.id || i.productId] = Number(i.qty || i.quantity || 0); });
      
      const newMap = {};
      finalItems.forEach(i => { if (i.id || i.productId) newMap[i.id || i.productId] = i.qty; });

      const allIds = new Set([...Object.keys(oldMap), ...Object.keys(newMap)]);
      allIds.forEach(id => {
         if (id && id !== 'null' && id !== 'undefined') {
             const oldQty = oldMap[id] || 0;
             const newQty = newMap[id] || 0;
             if (oldQty !== newQty) {
                const itemDef = finalItems.find(x => String(x.id || x.productId) === String(id)) || originalTx.items.find(x => String(x.id || x.productId) === String(id));
                productChanges.push({ id, title: itemDef?.title || 'Producto', oldQty, newQty, diff: newQty - oldQty });
             }
         }
      });

      // [Cálculo de puntos]
      let pointsChange = null;
      let clientObj = editingTransaction.client || originalTx.client;
      let cName = null; let cNum = null;

      if (clientObj && typeof clientObj === 'object' && clientObj.name !== 'No asociado') {
         cName = clientObj.name; cNum = clientObj.memberNumber;
         const oldPts = Number(originalTx.pointsEarned || 0);
         const newPts = Math.floor(editingTransaction.total / 500); 
         if (oldPts !== newPts) pointsChange = { previous: oldPts, new: newPts, diff: newPts - oldPts };
      } else if (typeof clientObj === 'string' && clientObj !== 'No asociado') {
         cName = clientObj;
      }

      // ==========================================
      // INICIO TRANSACCIÓN A LA NUBE (BLINDADA)
      // ==========================================
      
      // A. Actualizar Venta
      await updateWithSchemaFallback(
        'sales',
        editingTransaction.id,
        {
          total: editingTransaction.total,
          payment_method: editingTransaction.payment,
          installments: editingTransaction.installments || 0,
          points_earned: pointsChange ? pointsChange.new : originalTx.pointsEarned,
          cash_received: safeCashReceived,
          cash_change: safeCashChange
        },
        'id',
      );

      // B. Borrar items viejos
      const { error: delErr } = await supabase.from('sale_items').delete().eq('sale_id', editingTransaction.id);
      if (delErr) throw new Error("Fallo limpiando base: " + delErr.message);
      
      // C. Insertar items nuevos con UUID Validator
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const newItemsPayload = finalItems.map(i => {
        let prodId = i.productId || i.id;
        if (!uuidRegex.test(prodId)) prodId = null; 

        return {
          sale_id: editingTransaction.id,
          product_id: prodId,
          product_title: i.title,
          quantity: i.qty,
          price: i.price,
          is_reward: !!i.isReward
        };
      });
      
      try {
        await insertRowsWithSchemaFallback('sale_items', newItemsPayload);
      } catch (insertErr) {
        throw new Error("Supabase rechazó los productos: " + insertErr.message);
      }

      // D. Actualizar Stock
      for (const change of productChanges) {
        if (change.diff !== 0) {
          const prod = inventory.find(p => String(p.id) === String(change.id));
          if (prod) {
            await supabase.from('products').update({ stock: prod.stock - change.diff }).eq('id', change.id);
          }
        }
      }

      // E. Actualizar Puntos Cliente
      if (pointsChange && clientObj && clientObj.id) {
         const clientDb = members.find(m => m.id === clientObj.id);
         if (clientDb) {
            const finalPoints = clientDb.points + pointsChange.diff;
            await supabase.from('clients').update({ points: finalPoints }).eq('id', clientDb.id);
            setMembers((prev) =>
              prev.map((member) =>
                member.id === clientDb.id
                  ? {
                      ...member,
                      points: finalPoints,
                      created_at: member.created_at || member.createdAt || null,
                      createdAt: member.createdAt || member.created_at || null,
                    }
                  : member,
              ),
            );
         }
      }

      // F. Sincronizar UI Inmediatamente
      const finalTx = {
         ...editingTransaction,
         items: finalItems, 
         pointsEarned: pointsChange ? pointsChange.new : originalTx.pointsEarned,
         cashReceived: safeCashReceived,
         cashChange: safeCashChange
      };
      
      finalTx.isTest = isTestRecord(finalTx);
      
      setTransactions((prev) => {
        const exists = prev.some((t) => String(t.id) === String(editingTransaction.id));
        return exists
          ? prev.map((t) => (String(t.id) === String(editingTransaction.id) ? finalTx : t))
          : [finalTx, ...prev];
      });

      setInventory(inventory.map(p => {
         const change = productChanges.find(c => String(c.id) === String(p.id));
         if (change) return { ...p, stock: p.stock - change.diff };
         return p;
      }));

      // G. Log
      const logDetails = {
         transactionId: editingTransaction.id, client: cName, memberNumber: cNum,
         payment: editingTransaction.payment,
         installments: editingTransaction.installments || 0,
         cashReceived: safeCashReceived,
         cashChange: safeCashChange,
         changes, productChanges, itemsSnapshot: finalItems, pointsChange
      };
      addLog('Modificación Pedido', logDetails, editReason || 'Ajuste manual');

      setEditingTransaction(null);
      setEditReason('');
      Swal.close();
      showNotification('success', 'Pedido Actualizado', 'Modificación exitosa.');

    } catch (error) {
      console.error("Error crítico al actualizar:", error);
      Swal.fire({
        icon: 'error',
        title: 'Error de Sincronización',
        text: error.message || 'Error desconocido guardando en la nube.',
        confirmButtonText: 'Entendido'
      });
    }
  };

  // ==========================================
  // ? HANDLERS DE PREMIOS (Restaurados)
  // ==========================================
  const handleAddReward = async (rewardData) => {
    if (blockIfOfflineReadonly('crear premios')) return;
    try {
      const payload = {
        title: rewardData.title,
        description: rewardData.description,
        points_cost: Number(rewardData.pointsCost),
        type: rewardData.type,
        discount_amount: Number(rewardData.discountAmount) || 0,
        stock: Number(rewardData.stock) || 0
      };

      const { data, error } = await supabase
        .from('rewards')
        .insert([payload])
        .select(CLOUD_SELECTS.rewards)
        .single();
      if (error) throw error;

      const newReward = {
        id: data.id,
        title: data.title,
        description: data.description,
        pointsCost: data.points_cost,
        type: data.type,
        discountAmount: data.discount_amount,
        stock: data.stock
      };

      setRewards([...rewards, newReward]);
      addLog('Nuevo Premio', { title: newReward.title, description: newReward.description, pointsCost: newReward.pointsCost, type: newReward.type, stock: newReward.stock }, 'Gestión Catálogo');
      showNotification('success', 'Premio Creado', 'Se ha añadido al catálogo.');
    } catch (e) {
      console.error(e);
      showNotification('error', 'Error', 'No se pudo crear el premio.');
    }
  };

  const handleUpdateReward = async (id, updatedData) => {
    if (blockIfOfflineReadonly('editar premios')) return;
    try {
      const payload = {
        title: updatedData.title,
        description: updatedData.description,
        points_cost: Number(updatedData.pointsCost),
        type: updatedData.type,
        discount_amount: Number(updatedData.discountAmount) || 0,
        stock: Number(updatedData.stock) || 0
      };

      const { error } = await supabase.from('rewards').update(payload).eq('id', id);
      if (error) throw error;

      setRewards(rewards.map(r => r.id === id ? { ...r, ...updatedData } : r));
      addLog('Editar Premio', { title: updatedData.title, pointsCost: updatedData.pointsCost, type: updatedData.type, stock: updatedData.stock });
      showNotification('success', 'Premio Actualizado', 'Cambios guardados.');
    } catch (e) {
      console.error(e);
      showNotification('error', 'Error', 'No se pudo actualizar el premio.');
    }
  };

  const handleDeleteReward = async (id) => {
    if (blockIfOfflineReadonly('eliminar premios')) return;
    try {
      const { error } = await supabase.from('rewards').delete().eq('id', id);
      if (error) throw error;

      const deletedReward = rewards.find(r => r.id === id);
      setRewards(rewards.filter(r => r.id !== id));
      addLog('Eliminar Premio', { id, title: deletedReward?.title || 'Premio eliminado' });
      showNotification('success', 'Premio Eliminado', 'Se quitó del catálogo.');
    } catch (e) {
      console.error(e);
      showNotification('error', 'Error', 'No se pudo eliminar el premio.');
    }
  };

  const mainContentClass = [
    'flex-1',
    'min-h-0',
    'p-4',
    'bg-slate-100',
    'relative',
  ].join(' ');
  const fallbackLoginUsers = useMemo(
    () => buildLegacyUsers(USERS, userSettings),
    [userSettings],
  );

  const loginUsers = activeLoginUsers.length > 0 ? activeLoginUsers : fallbackLoginUsers;
  const systemLoginUser = useMemo(
    () => loginUsers.find((user) => user.role === 'system') || null,
    [loginUsers],
  );
  const visibleLoginUsers = useMemo(
    () => loginUsers.filter((user) => user.role !== 'system'),
    [loginUsers],
  );

  const hasLoginUsers = visibleLoginUsers.length > 0;
  const isCoreHydratingForSession =
    Boolean(currentUser) &&
    moduleLoadState.core.status === 'loading' &&
    inventory.length === 0 &&
    categories.length === 0 &&
    members.length === 0 &&
    rewards.length === 0 &&
    offers.length === 0;
  const isDashboardModuleLoading = moduleLoadState.dashboard.status === 'loading';
  const isHistoryModuleLoading = moduleLoadState.history.status === 'loading';
  const isOrdersModuleLoading = moduleLoadState.orders.status === 'loading';
  const isReportsModuleLoading = moduleLoadState.reports.status === 'loading';
  const dashboardOfflineEmptyMessage =
    isOfflineReadOnly &&
    moduleLoadState.dashboard.status !== 'loaded' &&
    transactions.length === 0 &&
    dailyLogs.length === 0 &&
    expenses.length === 0
      ? 'Sin conexión y sin snapshot local para este módulo. Volvé a intentarlo con internet.'
      : '';
  const historyOfflineEmptyMessage =
    isOfflineReadOnly &&
    moduleLoadState.history.status !== 'loaded' &&
    transactions.length === 0 &&
    historyLogs.length === 0
      ? 'Sin conexión y sin snapshot local del historial. Volvé a intentarlo con internet.'
      : '';
  const ordersOfflineEmptyMessage =
    isOfflineReadOnly &&
    moduleLoadState.orders.status !== 'loaded' &&
    budgets.length === 0 &&
    orders.length === 0
      ? 'Sin conexión y sin snapshot local de pedidos. Volvé a intentarlo con internet.'
      : '';
  const reportsOfflineEmptyMessage =
    isOfflineReadOnly &&
    moduleLoadState.reports.status !== 'loaded' &&
    pastClosures.length === 0
      ? 'Sin conexión y sin snapshot local de reportes. Volvé a intentarlo con internet.'
      : '';
  const cloudStatusMeta = (() => {
    const isAnyModuleLoading =
      moduleLoadState.core.status === 'loading' ||
      moduleLoadState.transactions.status === 'loading' ||
      moduleLoadState.dashboard.status === 'loading' ||
      moduleLoadState.history.status === 'loading' ||
      moduleLoadState.orders.status === 'loading' ||
      moduleLoadState.reports.status === 'loading';

    if (isAuthBootLoading || isCloudLoading || isAnyModuleLoading || isReconnectAttempting) {
      return {
        dotClass: 'bg-amber-500 shadow-[0_0_0_4px_rgba(245,158,11,0.15)]',
        badgeClass: 'border-amber-200 bg-amber-50 text-amber-700',
        title: 'Cargando',
        detail: isReconnectAttempting ? 'Reconectando...' : 'Sincronizando...',
      };
    }

    if (isOfflineReadOnly) {
      return {
        dotClass: 'bg-rose-500 shadow-[0_0_0_4px_rgba(244,63,94,0.14)]',
        badgeClass: 'border-rose-200 bg-rose-50 text-rose-700',
        title: 'Sin conexión',
        detail: offlineSnapshotAt
          ? `Snapshot: ${formatDateAR(offlineSnapshotAt)}`
          : 'Datos locales.',
      };
    }

    return {
      dotClass: 'bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.15)]',
      badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      title: 'Conectada',
      detail: 'Sincronizada',
    };
  })();

  const activeTabTitles = {
    pos: 'Punto de Venta',
    dashboard: 'Control de Caja',
    inventory: 'Inventario',
    clients: 'Socios',
    agenda: 'Agenda',
    orders: 'Pedidos',
    history: 'Historial de Ventas',
    reports: 'Reportes de Caja',
    logs: 'Registro de Acciones',
    sessions: 'Gestor de Sesiones',
    extras: 'Gestión de Extras',
    'bulk-editor': 'Productos',
    settings: 'Ajustes',
    'user-management': 'Gestión de usuarios',
  };

  const currentRoleLabel = getRoleLabel(currentUser?.role);
  const currentRoleTone =
    currentUser?.role === 'system'
      ? 'bg-fuchsia-100 text-fuchsia-700'
      : currentUser?.role === 'owner'
        ? 'bg-blue-100 text-blue-700'
        : 'bg-green-100 text-green-700';

  if (!currentUser && (isAuthBootLoading || isCloudLoading)) return <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-100"><RefreshCw className="animate-spin text-fuchsia-600 mb-4" size={48} /><h2 className="text-xl font-bold">Cargando Nube...</h2></div>;

  if (!currentUser) {
    if (loginStep === 'password') {
      const user = selectedLoginUser;
      return (
        <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,rgba(244,114,182,0.14)_0%,rgba(255,255,255,0.94)_28%,rgba(241,245,249,1)_72%)] px-6 py-10">
          <div className="relative w-full max-w-md rounded-[34px] border border-slate-200/80 bg-white/95 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.16)] backdrop-blur">
            {user?.role === 'system' && (
              <button
                type="button"
                onClick={handleSystemCornerBypass}
                className="absolute left-0 top-0 h-14 w-14 rounded-tl-[34px] opacity-0"
                aria-label="Acceso directo a sistema"
              />
            )}
            <div className="mb-5 flex items-center justify-between">
              <button
                onClick={() => setLoginStep('select')}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition hover:border-slate-300 hover:text-slate-600"
              >
                <ArrowLeft size={18} />
              </button>
              <div className="text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Ingreso</p>
                <h1 className="text-lg font-black text-slate-800">Bienvenido</h1>
              </div>
              <div className="h-10 w-10" />
            </div>

            <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.98)_0%,rgba(255,255,255,0.98)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
              <div className="flex flex-col items-center px-6 pb-5 pt-6 text-center">
                <UserAvatar
                  avatar={user?.avatar}
                  name={user?.displayName || user?.name}
                  color={user?.nameColor || '#334155'}
                  sizeClass="h-24 w-24 shadow-[0_12px_24px_rgba(15,23,42,0.14)]"
                  textClass="text-2xl"
                />
                <p className="mt-4 text-lg font-black text-slate-800">{user?.displayName || user?.name}</p>
              </div>

              <form onSubmit={handleSubmitLogin} className="border-t border-slate-200 bg-white px-6 pb-6 pt-5">
                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
                    Contraseña
                  </span>
                  <input
                    autoFocus
                    type="password"
                    placeholder="Ingresar contraseña"
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-base font-bold tracking-[0.2em] text-slate-800 outline-none placeholder:text-slate-400 focus:border-fuchsia-300 focus:bg-white focus:ring-2 focus:ring-fuchsia-200"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                  />
                </label>
                {loginError && <p className="mt-2 text-center text-xs font-semibold text-red-500">{loginError}</p>}
                <button
                  type="submit"
                  className="mt-4 w-full rounded-2xl bg-slate-900 py-3 text-sm font-black text-white transition-colors hover:bg-slate-800"
                >
                  Ingresar
                </button>
              </form>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,rgba(244,114,182,0.14)_0%,rgba(255,255,255,0.94)_28%,rgba(241,245,249,1)_72%)] px-6 py-10">
        <div className="w-full max-w-5xl rounded-[34px] border border-slate-200/80 bg-white/95 p-8 text-center shadow-[0_30px_80px_rgba(15,23,42,0.16)] backdrop-blur">
          <div className="mb-5 flex justify-center">
            <button
              type="button"
              onClick={handleSystemLogoAccess}
              className="rounded-[20px] bg-white p-2 shadow-[0_12px_28px_rgba(15,23,42,0.12)] ring-1 ring-slate-200 transition hover:scale-[1.01]"
              aria-label="Logo de Rebu"
            >
              <img src={logoRebuImg} alt="Rebu" className="h-24 w-24 object-contain" />
            </button>
          </div>
          <h1 className="mb-1 text-2xl font-black text-slate-800">Rebu Cotillón</h1>
          <p className="mb-8 text-sm font-medium text-slate-500">Seleccioná tu usuario para continuar</p>

          <div className="text-left">
            {hasLoginUsers ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {visibleLoginUsers.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => handleSelectLoginUser(user.id)}
                    className="group overflow-hidden rounded-[26px] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.96)_0%,rgba(255,255,255,0.98)_100%)] text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition duration-200 hover:-translate-y-0.5 hover:border-fuchsia-200 hover:shadow-[0_18px_30px_rgba(15,23,42,0.1)]"
                  >
                    <div className="flex flex-col items-center px-5 pb-5 pt-6">
                      <UserAvatar
                        avatar={user.avatar}
                        name={user.displayName || user.name}
                        color={user.nameColor}
                        sizeClass="h-24 w-24 shadow-[0_12px_24px_rgba(15,23,42,0.14)]"
                        textClass="text-2xl"
                      />
                      <p className="mt-4 line-clamp-2 text-base font-black text-slate-800">{user.displayName}</p>
                    </div>
                    <div className="flex items-center justify-center gap-2 border-t border-slate-200 bg-white px-4 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500 transition group-hover:text-fuchsia-700">
                      Ingresar
                      <ChevronRight size={15} />
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-center">
                <p className="text-sm font-black text-slate-700">No hay usuarios activos para ingresar</p>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  Reintentá cargar usuarios o verificá la configuración de Supabase.
                </p>
                <button
                  type="button"
                  onClick={() => fetchCloudData(true)}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-100"
                >
                  <RefreshCw size={13} />
                  Reintentar carga
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
// --- MAIN LAYOUT ---
  return (
    <>
      <div className="print:hidden flex h-screen bg-slate-100 font-sans text-slate-900 text-sm overflow-hidden">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} currentUser={currentUser} onLogout={handleLogout} />
        <div className="flex-1 flex flex-col h-full overflow-hidden relative">
          
          {isTestActive && (
            <div className="bg-orange-500 text-white text-xs font-bold px-4 py-2.5 flex items-center justify-center gap-2 z-50 shadow-md w-full animate-in slide-in-from-top">
              <AlertTriangle size={16} />
              <span>Estás usando la palabra "test". Esta acción no se contabilizará en el sistema y será usada solo como prueba.</span>
            </div>
          )}

          <header className="relative bg-white border-b h-12 flex items-center justify-between px-5 shadow-sm z-10 shrink-0">
            <div className="flex items-center gap-3">
              <div className="pl-1">
                <h2 className="text-base font-bold text-slate-800 uppercase tracking-wide">
                  {activeTabTitles[activeTab] || activeTab}
                </h2>
                <div className="-mt-2 flex items-center gap-2 text-[12px] font-bold text-slate-500">
                  <div className="flex items-center gap-1">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${cloudStatusMeta.dotClass}`} />
                    <span className={`inline-flex items-center rounded-full border px-1 py-0 text-[7px] font-bold uppercase tracking-[0.08em] ${cloudStatusMeta.badgeClass}`}>
                      {cloudStatusMeta.title}
                    </span>
                  </div>
                  <span>{formatDateAR(currentTime)} {formatTimeAR(currentTime)}hrs</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={canManageRegister ? toggleRegisterStatus : undefined}
                  className={`flex items-center gap-2 rounded border px-3 py-1.5 transition-colors ${isRegisterClosed ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'} ${canManageRegister ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                  title={canUseAdminArea ? '' : 'Solo Sistema o un Dueño pueden cambiar el estado de la caja'}
                >
                  <Lock size={14} />
                  <span className="text-xs font-bold">{isRegisterClosed ? 'CAJA CERRADA' : 'CAJA ABIERTA'}</span>
                </button>
                {!isRegisterClosed && closingTime && (<div className="flex items-center gap-1 px-2 py-1 bg-amber-50 border border-amber-200 rounded text-amber-700"><Clock size={12} /><span className="text-[10px] font-bold">Cierre: {closingTime}</span></div>)}
                <button
                  type="button"
                  onClick={handleSoftReload}
                  className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                  title="Recarga datos vencidos y el modulo visible sin reiniciar"
                >
                  <RefreshCw size={12} />
                  Soft Reload
                </button>
                <button
                  type="button"
                  onClick={handleForceReload}
                  className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                  title="Recarga completa de la aplicacion"
                >
                  <RefreshCw size={12} />
                  Force Reload
                </button>
              </div>
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold" style={currentUserPresentation?.textStyle}>
                  {currentUserPresentation?.displayName || currentUser?.displayName || currentUser?.name}
                </p>
                <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${currentRoleTone}`}>
                  {currentRoleLabel}
                </span>
              </div>
            </div>
          </header>
          {isOfflineReadOnly && (
            <div className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-[linear-gradient(180deg,#fffbeb_0%,#fef3c7_100%)] px-5 py-2 text-[11px] font-semibold text-amber-900 shadow-sm">
              <span className="font-black uppercase tracking-[0.08em]">Modo sin conexión</span>
              <button
                type="button"
                onClick={handleReconnectCloud}
                disabled={isReconnectAttempting}
                className="inline-flex h-6 items-center gap-1.5 rounded-full border border-amber-300 bg-white/80 px-2.5 text-[10px] font-black uppercase tracking-[0.08em] text-amber-800 shadow-sm transition hover:border-amber-400 hover:bg-white disabled:cursor-wait disabled:opacity-70"
              >
                <RefreshCw size={12} className={isReconnectAttempting ? 'animate-spin' : ''} />
                {isReconnectAttempting ? 'Reconectando' : 'Reconectar'}
              </button>
              <span className="text-amber-700">•</span>
              <span>Podés seguir consultando datos, pero no hacer cambios.</span>
              {offlineSnapshotAt && (
                <>
                  <span className="text-amber-700">•</span>
                  <span>Último snapshot: {formatDateAR(offlineSnapshotAt)} {formatTimeAR(offlineSnapshotAt)}</span>
                </>
              )}
            </div>
          )}
          
          <main className={mainContentClass}>
            {isCoreHydratingForSession ? (
              <div className="flex h-full items-center justify-center rounded-[28px] border border-slate-200 bg-white shadow-sm">
                <div className="text-center">
                  <RefreshCw className="mx-auto mb-4 animate-spin text-fuchsia-600" size={34} />
                  <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">Sincronizando nube</p>
                  <p className="mt-2 text-sm font-medium text-slate-500">Estamos trayendo productos, socios y configuraciones base de Supabase.</p>
                </div>
              </div>
            ) : (
              <>
            {canViewDashboard && (
              <PersistentTabPanel tab="dashboard" activeTab={activeTab} className="h-full min-h-0">
                <DashboardView 
                  openingBalance={openingBalance} 
                  totalSales={totalSales} 
                  salesCount={salesCount} 
                  currentUser={currentUser} 
                  setTempOpeningBalance={setTempOpeningBalance} 
                  setIsOpeningBalanceModalOpen={setIsOpeningBalanceModalOpen} 
                  transactions={validTransactions} 
                  dailyLogs={dailyLogs} 
                  inventory={inventory}
                  expenses={expenses}
                  isLoading={isDashboardModuleLoading && transactions.length === 0 && dailyLogs.length === 0}
                  emptyStateMessage={dashboardOfflineEmptyMessage}
                  onOpenExpenseModal={() => setIsExpenseModalOpen(true)}
                  onAlertClick={handleDashboardAlertClick} 
                  onNavigate={(tab, payload = {}) => {
                    if (tab === 'inventory') {
                      navigateToInventoryFromDashboard(payload);
                      return;
                    }
                    if (tab === 'history') {
                      navigateToHistoryFromDashboard(payload);
                      return;
                    }
                    setActiveTab(tab);
                  }}
                  onViewTransaction={(tx) => setDetailsModalTx(tx)}
                />
              </PersistentTabPanel>
            )}
            {canAccessTab(currentUser, 'inventory') && <PersistentTabPanel tab="inventory" activeTab={activeTab} className="h-full min-h-0"><InventoryView inventory={inventory} categories={categories} currentUser={currentUser} inventoryViewMode={inventoryViewMode} setInventoryViewMode={setInventoryViewMode} gridColumns={inventoryGridColumns} setGridColumns={setInventoryGridColumns} inventorySearch={inventorySearch} setInventorySearch={setInventorySearch} inventoryCategoryFilter={inventoryCategoryFilter} setInventoryCategoryFilter={setInventoryCategoryFilter} setIsModalOpen={setIsModalOpen} setEditingProduct={(prod) => { setEditingProduct(prod); setEditReason(''); }} handleDeleteProduct={handleDeleteProductRequest} setSelectedImage={setSelectedImage} setIsImageModalOpen={setIsImageModalOpen} closeDetailsToken={inventoryPanelCloseToken} navigationRequest={inventoryNavigationRequest} /></PersistentTabPanel>}
            <PersistentTabPanel tab="pos" activeTab={activeTab} className="h-full min-h-0">{isRegisterClosed ? (<div className="h-full flex flex-col items-center justify-center text-slate-400"><Lock size={64} className="mb-4 text-slate-300" /><h3 className="text-xl font-bold text-slate-600">Caja Cerrada</h3>{canUseAdminArea ? (<><p className="mb-6">Debes abrir la caja para realizar ventas.</p><button onClick={toggleRegisterStatus} className="bg-green-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-green-700">Abrir Caja</button></>) : (<p className="mb-6 text-center">Sistema o un Dueño deben abrir la caja para realizar ventas.</p>)}</div>) : (<POSView inventory={inventory} categories={categories} addToCart={addToCart} cart={cart} removeFromCart={removeFromCart} updateCartItemQty={updateCartItemQty} selectedPayment={selectedPayment} setSelectedPayment={setSelectedPayment} installments={installments} setInstallments={setInstallments} calculateTotal={calculateTotal} handleCheckout={handleCheckout} posSearch={posSearch} setPosSearch={setPosSearch} selectedCategory={posSelectedCategory} setSelectedCategory={setPosSelectedCategory} posViewMode={posViewMode} setPosViewMode={setPosViewMode} gridColumns={posGridColumns} setGridColumns={setPosGridColumns} selectedClient={posSelectedClient} setSelectedClient={setPosSelectedClient} onOpenClientModal={() => setIsClientModalOpen(true)} onOpenRedemptionModal={() => setIsRedemptionModalOpen(true)} offers={offers} currentUser={currentUser} userCatalog={userCatalog} />)}</PersistentTabPanel>
            <PersistentTabPanel tab="clients" activeTab={activeTab} className="h-full min-h-0"><ClientsView members={members} addMember={handleAddMemberWithLog} updateMember={handleUpdateMemberWithLog} deleteMember={handleDeleteMemberWithLog} currentUser={currentUser} onViewTicket={handleViewTicket} onEditTransaction={handleEditTransactionRequest} onDeleteTransaction={handleDeleteTransaction} transactions={transactions} checkExpirations={() => {}} /></PersistentTabPanel>
            {canViewAgenda && (
              <PersistentTabPanel tab="agenda" activeTab={activeTab} className="h-full min-h-0">
                <AgendaView
                  contacts={agendaContacts}
                  currentUser={currentUser}
                  isOfflineReadOnly={isOfflineReadOnly}
                  onCreateContact={handleCreateAgendaContact}
                  onUpdateContact={handleUpdateAgendaContact}
                  onDeleteContact={handleDeleteAgendaContact}
                />
              </PersistentTabPanel>
            )}
            <PersistentTabPanel tab="orders" activeTab={activeTab} className="h-full min-h-0"><OrdersView budgets={budgets} orders={orders} members={members} inventory={inventory} categories={categories} offers={offers} currentUser={currentUser} userCatalog={userCatalog} isLoading={isOrdersModuleLoading && budgets.length === 0 && orders.length === 0} emptyStateMessage={ordersOfflineEmptyMessage} onCreateBudget={handleCreateBudget} onUpdateBudget={handleUpdateBudget} onUpdateOrder={handleUpdateOrder} onDeleteBudget={handleDeleteBudget} onDeleteOrder={handleDeleteOrder} onConvertBudgetToOrder={handleConvertBudgetToOrder} onRegisterOrderPayment={handleRegisterOrderPayment} onCancelOrder={handleCancelOrder} onMarkOrderRetired={handleMarkOrderRetired} onPrintRecord={handlePrintOrderRecord} /></PersistentTabPanel>
            <PersistentTabPanel tab="history" activeTab={activeTab} className="h-full min-h-0"><HistoryView transactions={transactions} dailyLogs={historyLogs} inventory={inventory} currentUser={currentUser} userCatalog={userCatalog} members={members} isLoading={isHistoryModuleLoading && transactions.length === 0 && historyLogs.length === 0} emptyStateMessage={historyOfflineEmptyMessage} showNotification={showNotification} onViewTicket={handleViewTicket} onDeleteTransaction={handleDeleteTransaction} onEditTransaction={handleEditTransactionRequest} onRestoreTransaction={handleRestoreTransaction} setTransactions={setTransactions} setDailyLogs={setHistoryLogs} navigationRequest={historyNavigationRequest} onSoftReload={() => Promise.all([loadHistoryCloudData({ force: true }), loadTransactionsCloudData({ force: true })])} isActive={activeTab === 'history'} /></PersistentTabPanel>
            {canViewReports && (<PersistentTabPanel tab="reports" activeTab={activeTab} className="h-full min-h-0"><ReportsHistoryView pastClosures={pastClosures} members={members} isLoading={isReportsModuleLoading && pastClosures.length === 0} emptyStateMessage={reportsOfflineEmptyMessage} onLoadReportDetail={fetchCashClosureDetailById} /></PersistentTabPanel>)}
            {canViewLogs && (<PersistentTabPanel tab="logs" activeTab={activeTab} className="h-full min-h-0"><LogsView initialLogs={dailyLogs} onUpdateLogNote={handleUpdateLogNote} onReprintPdf={handleReprintPdf} userCatalog={userCatalog} isActive={activeTab === 'logs'} /></PersistentTabPanel>)}
            {canViewSessions && (<PersistentTabPanel tab="sessions" activeTab={activeTab} className="h-full min-h-0"><SessionsView initialLogs={dailyLogs} currentSessionMeta={currentSessionMeta} userCatalog={userCatalog} /></PersistentTabPanel>)}
            {canViewUserManagement && (
              <PersistentTabPanel tab="user-management" activeTab={activeTab} className="h-full min-h-0">
                <UserManagementView
                  users={appUsers}
                  userCatalog={userCatalog}
                  currentUser={currentUser}
                  isSharedUsersEnabled={authMode === 'supabase' || appUsers.some((user) => user?.source === 'supabase')}
                  onRetryEnableSharedUsers={handleRetrySharedUsersSetup}
                  onCreateUser={handleCreateManagedUser}
                  onUpdateUser={handleUpdateManagedUser}
                  onToggleUserActive={handleToggleManagedUserActive}
                  onUpdatePermissions={handleUpdateManagedUserPermissions}
                  showNotification={showNotification}
                />
              </PersistentTabPanel>
            )}
            <PersistentTabPanel tab="settings" activeTab={activeTab} className="h-full min-h-0">
              <UserSettingsView
                currentUser={currentUser}
                onSaveSettings={handleSaveUserSettings}
                showNotification={showNotification}
              />
            </PersistentTabPanel>
            <PersistentTabPanel tab="extras" activeTab={activeTab} className="h-full min-h-0">
              <ExtrasView 
              categories={categories} 
              inventory={inventory} 
              offers={offers} 
              rewards={rewards}
              currentUser={currentUser}
              onAddCategory={handleAddCategoryFromView} 
              onDeleteCategory={handleDeleteCategoryFromView} 
              onEditCategory={handleEditCategory} 
              onBatchUpdateProductCategory={handleBatchUpdateProductCategory}
              onAddOffer={handleAddOffer} 
              onUpdateOffer={handleUpdateOffer}
              onDeleteOffer={handleDeleteOffer}
              onAddReward={handleAddReward}
              onUpdateReward={handleUpdateReward}
              onDeleteReward={handleDeleteReward}
              />
            </PersistentTabPanel>
            {canViewBulkEditor && (
              <PersistentTabPanel tab="bulk-editor" activeTab={activeTab} className="h-full min-h-0">
                <BulkEditorView 
                inventory={inventory} 
                categories={categories} 
                onSaveSingle={handleBulkSaveSingle} 
                onSaveBulk={handleBulkSaveMasive} 
                onExportProducts={handleExportProducts}
                // ? NUEVAS PROPS PARA PDF PERSISTENTE
                exportItems={bulkExportItems}
                setExportItems={setBulkExportItems}
                exportConfig={bulkExportConfig}
                setExportConfig={setBulkExportConfig}
                onCreateFixedProduct={handleCreateFixedProduct}
                />
              </PersistentTabPanel>
            )}
              </>
            )}
          </main>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ? ZONA DE IMPRESIÓN (SIN LÍMITES DE TAMAÑO, SOLO SE VE AL IMPRIMIR) */}
      {/* ========================================================================= */}
      <div className="hidden print:block w-full h-auto bg-white">
        {exportPdfData ? (
          <ExportPdfLayout data={exportPdfData} />
        ) : (
          <TicketPrintLayout transaction={ticketToView || saleSuccessModal} />
        )}
      </div>

      {/* --- MODALES NORMALES DE LA APP (NO SE IMPRIMEN) --- */}
      <div className="print:hidden">
        <NotificationModal isOpen={notification.isOpen} onClose={closeNotification} type={notification.type} title={notification.title} message={notification.message} />
        <OpeningBalanceModal isOpen={isOpeningBalanceModalOpen} onClose={() => setIsOpeningBalanceModalOpen(false)} tempOpeningBalance={tempOpeningBalance} setTempOpeningBalance={setTempOpeningBalance} tempClosingTime={tempClosingTime} setTempClosingTime={setTempClosingTime} onSave={handleSaveOpeningBalance} />
        <ClosingTimeModal isOpen={isClosingTimeModalOpen} onClose={() => setIsClosingTimeModalOpen(false)} closingTime={closingTime} setClosingTime={setClosingTime} onSave={handleSaveClosingTime} />
        <AddProductModal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); }} newItem={newItem} setNewItem={setNewItem} categories={categories} onImageUpload={handleImageUpload} onAdd={handleAddItem} inventory={inventory} onDuplicateBarcode={handleDuplicateBarcodeDetected} isUploadingImage={isUploadingImage} />
        <EditProductModal product={editingProduct} onClose={() => setEditingProduct(null)} setEditingProduct={setEditingProduct} categories={categories} onImageUpload={handleImageUpload} editReason={editReason} setEditReason={setEditReason} onSave={saveEditProduct} inventory={inventory} onDuplicateBarcode={handleDuplicateBarcodeDetected} isUploadingImage={isUploadingImage} onDuplicate={handleDuplicateProduct} currentUser={currentUser} />
        <EditTransactionModal transaction={editingTransaction} onClose={() => setEditingTransaction(null)} inventory={inventory} setEditingTransaction={setEditingTransaction} transactionSearch={transactionSearch} setTransactionSearch={setTransactionSearch} addTxItem={addTxItem} removeTxItem={removeTxItem} setTxItemQty={setTxItemQty} handlePaymentChange={handleEditTxPaymentChange} editReason={editReason} setEditReason={setEditReason} onSave={handleSaveEditedTransaction} />
        <ImageModal isOpen={isImageModalOpen} image={selectedImage} onClose={() => setIsImageModalOpen(false)} />
        <RefundModal  transaction={transactionToRefund}  onClose={() => {   setTransactionToRefund(null);   setRefundReason('');  }}   refundReason={refundReason}  setRefundReason={setRefundReason} onConfirm={handleConfirmRefund} />
        <CloseCashModal isOpen={isClosingCashModalOpen} onClose={() => setIsClosingCashModalOpen(false)} salesCount={cycleSalesCount} totalSales={cycleTotalSales} totalExpenses={cycleTotalExpenses} cashExpenses={cycleCashExpenses} cashSales={cycleCashSales} openingBalance={openingBalance} onConfirm={handleConfirmCloseCash} />
        <SaleSuccessModal transaction={saleSuccessModal} onClose={() => setSaleSuccessModal(null)} onPrint={handlePrintTicket} />
        <TicketModal transaction={ticketToView} onClose={() => setTicketToView(null)} onPrint={handlePrintTicket} />
        <AutoCloseAlertModal isOpen={isAutoCloseAlertOpen} onClose={() => setIsAutoCloseAlertOpen(false)} closingTime={closingTime} />
        <DeleteProductModal product={productToDelete} onClose={() => { setProductToDelete(null); setDeleteProductReason(''); }} reason={deleteProductReason} setReason={setDeleteProductReason} onConfirm={confirmDeleteProduct} />
        <BarcodeNotFoundModal isOpen={barcodeNotFoundModal.isOpen} scannedCode={barcodeNotFoundModal.code} onClose={() => setBarcodeNotFoundModal({ isOpen: false, code: '' })} onAddProduct={handleAddProductFromBarcode} />
        <BarcodeDuplicateModal isOpen={barcodeDuplicateModal.isOpen} existingProduct={barcodeDuplicateModal.existingProduct} onClose={() => setBarcodeDuplicateModal({ isOpen: false, existingProduct: null, newBarcode: '' })} onKeepExisting={() => setBarcodeDuplicateModal({ isOpen: false, existingProduct: null, newBarcode: '' })} onReplaceBarcode={handleReplaceDuplicateBarcode} />
        <MemberIdentityPanel
          isOpen={memberIdentityPanelState.isOpen}
          onClose={closeMemberIdentityPanel}
          initialMode={memberIdentityPanelState.initialMode}
          initialFocus={memberIdentityPanelState.initialFocus}
          selectedClient={posSelectedClient}
          clients={members}
          rewards={rewards}
          onSelectClient={handleSelectPosClient}
          onCreateClient={handleCreatePosClient}
          onRedeem={handleRedeemReward}
          onChooseGuest={() => {
            setPosSelectedClient(buildGuestPosClient());
            closeMemberIdentityPanel();
          }}
        />
        <ExpenseModal isOpen={isExpenseModalOpen} onClose={() => setIsExpenseModalOpen(false)} onSave={handleAddExpense} />
        
        <TransactionDetailModal
          transaction={detailsModalTx}
          onClose={() => setDetailsModalTx(null)}
          currentUser={currentUser}
          userCatalog={userCatalog}
          members={members}
          onEditTransaction={(tx) => {
            setDetailsModalTx(null); 
            handleEditTransactionRequest(tx); 
          }}
          onDeleteTransaction={(tx) => {
            setDetailsModalTx(null);
            handleDeleteTransaction(tx);
          }}
          onViewTicket={handleViewTicket}
        />
      </div>
    </>
  );
}










