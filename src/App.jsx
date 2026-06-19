import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Lock,
  Clock,
  ChevronRight,
  ArrowLeft,
  RefreshCw,
  AlertTriangle,
  Database,
  WifiOff,
  Moon,
  Sun,
  Camera,
  Loader2,
  CheckCircle2,
  X
} from 'lucide-react';
import Swal from 'sweetalert2';
import logoRebuImg from './assets/logo-rebu.jpg';
import appPackage from '../package.json';

// --- CONEXIÓN A LA NUBE ---
import { supabase } from './supabase/client';
import { uploadProductImage, deleteProductImage, uploadProductThumbFromSource } from './utils/storage';
import { hasProductImage } from './utils/productImages';
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
  getSchemaMissingColumnName,
  isOptionalSchemaColumn,
  removeColumnFromSelect,
  runSelectWithSchemaFallback,
} from './utils/supabaseSchemaFallback';
import { buildBudgetExportConfig, buildExportItemsFromSnapshot, deriveOrderStatus, hydrateBudgetSnapshot } from './utils/budgetHelpers';
import { buildLegacyOfferPayload } from './utils/offerHelpers';
import { buildPointExpirationReport, normalizeMemberName } from './utils/memberPointsExpiration';
import {
  buildSocialConnectionsWithCouponUsageOverrides,
  buildSocialConnectionsWithInstagram,
  formatInstagramHandle,
  getCouponUsageOverrides,
  getInstagramConnection,
  getSocialConnections,
  normalizeInstagramHandle,
} from './utils/socialConnections';
import {
  bootstrapAppUsers,
  buildLegacyBootstrapSeed,
  buildLegacyUsers,
  buildUserCatalog,
  fetchAppUsersPrivate,
  createAppUser,
  fetchAppUsersPublic,
  hasOwnerAccess,
  normalizeMetricsViewMode,
  setAppUserActive,
  signInSupabaseAuthForAppUser,
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
  getEffectivePermissions,
  hasPermission,
} from './utils/userPermissions';
import {
  createOrderPaymentEntry,
  createOrderPaymentLine,
  getPaymentBreakdownTotals,
  getPaymentMethodTotals,
  getOrderPaymentHistorySummary,
  getPrimaryPaymentInfo,
  normalizePaymentBreakdown,
  normalizeOrderPaymentHistory,
} from './utils/paymentBreakdown';

import {
  INITIAL_CATEGORIES,
  INITIAL_INVENTORY,
  INITIAL_MEMBERS,
  INITIAL_TRANSACTIONS,
  USERS,
} from './data';
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
import MetricsView from './views/MetricsView';
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
const APP_VERSION = appPackage?.version || '1.0.0';
const OFFLINE_TRANSACTIONS_CACHE_KEY = 'party_cloud_snapshot_transactions_v1';
const OFFLINE_DASHBOARD_CACHE_KEY = 'party_cloud_snapshot_dashboard_v2';
const OFFLINE_HISTORY_CACHE_KEY = 'party_cloud_snapshot_history_v1';
const OFFLINE_ORDERS_CACHE_KEY = 'party_cloud_snapshot_orders_v2';
const OFFLINE_REPORTS_CACHE_KEY = 'party_cloud_snapshot_reports_v1';
const OFFLINE_METRICS_CACHE_KEY = 'party_cloud_snapshot_metrics_v1';
const OFFLINE_SHARED_USERS_CACHE_KEY = 'party_shared_users_snapshot_v1';
const OFFLINE_POS_CACHE_KEY = 'party_pos_snapshot_v1';
const OFFLINE_LOGIN_CACHE_KEY = 'party_offline_login_verifiers_v1';
const LEGACY_OFFLINE_CACHE_KEY = 'party_cloud_snapshot_v1';
const USER_SETTINGS_KEY = 'party_user_settings_v1';
const LOGIN_THEME_KEY = 'party_login_theme_v1';
const LOCAL_DEMO_MODE_KEY = 'rebu_local_demo_mode';
const METRICS_VIEW_MODE_STORAGE_KEY = 'rebu_metrics_view_mode_v1';
const REMEMBERED_SESSION_KEY = 'party_remembered_session_v1';
const APP_TEXT_ENCODING_VERSION = 'utf8-clean';
const CLOUD_FETCH_BATCH_SIZE = 200;
const CLOUD_RECENT_SYNC_LIMIT = 250;
const ENABLE_AUTHENTICATED_TRANSACTION_RPCS =
  import.meta.env.VITE_REBU_ENABLE_AUTH_RPC === '1';
const canUseAuthenticatedTransactionRpcs = async () => {
  if (!ENABLE_AUTHENTICATED_TRANSACTION_RPCS) return false;

  try {
    const { data } = await supabase.auth.getSession();
    return Boolean(data?.session?.access_token);
  } catch {
    return false;
  }
};
const SNAPSHOT_STORAGE_SOFT_LIMIT = 1_500_000;
const SNAPSHOT_COMPACT_LIMITS = {
  transactions: 650,
  dailyLogs: 150,
  historyLogs: 150,
  expenses: 500,
  pastClosures: 500,
  budgets: 500,
  orders: 500,
};
const METRICS_SNAPSHOT_LIMITS = {
  transactions: 200,
  expenses: 120,
  pastClosures: 120,
  budgets: 120,
  orders: 120,
};
const HISTORY_LOG_INITIAL_LIMIT = 50;
const HISTORY_LOG_RECENT_SYNC_LIMIT = 50;
const LOCAL_TRANSACTION_OVERRIDE_TTL_MS = 45 * 1000;
const APP_USERS_FRESHNESS_MS = 15 * 1000;
const OFFLINE_BOOT_TIMEOUT_MS = 5500;
const APP_USERS_BOOT_TIMEOUT_MS = 20000;
const OFFLINE_LOGIN_TIMEOUT_MS = 6500;
const CLOUD_RECONNECT_TIMEOUT_MS = 15000;
const FORCE_RELOAD_TIMEOUT_MS = 45000;
const REPORT_LOG_ACTIONS = ['Cierre de Caja', 'Cierre Automático'];

let localDemoIdCounter = 0;
let localDemoStore = null;

const readLocalDemoModePreference = () => {
  try {
    if (typeof window === 'undefined') {
      return import.meta.env?.VITE_REBU_LOCAL_DEMO === 'true';
    }

    const params = new URLSearchParams(window.location.search || '');
    const requestedMode = params.get('demo') || params.get('localDemo') || params.get('modoDemo');

    if (requestedMode === '1' || requestedMode === 'true') {
      window.localStorage.setItem(LOCAL_DEMO_MODE_KEY, 'true');
      return true;
    }

    if (requestedMode === '0' || requestedMode === 'false') {
      window.localStorage.setItem(LOCAL_DEMO_MODE_KEY, 'false');
      return false;
    }

    return (
      import.meta.env?.VITE_REBU_LOCAL_DEMO === 'true' ||
      window.localStorage.getItem(LOCAL_DEMO_MODE_KEY) === 'true'
    );
  } catch {
    return import.meta.env?.VITE_REBU_LOCAL_DEMO === 'true';
  }
};

const IS_LOCAL_DEMO_MODE = readLocalDemoModePreference();
const isLocalDemoMode = () => IS_LOCAL_DEMO_MODE;

const nextLocalDemoId = (table) => `demo-${table}-${Date.now()}-${++localDemoIdCounter}`;

const buildLocalDemoStore = () => ({
  products: INITIAL_INVENTORY.map((product) => ({
    ...product,
    image: '',
    image_thumb: '',
    is_active: true,
    created_at: new Date().toISOString(),
  })),
  clients: INITIAL_MEMBERS.map((member) => ({
    id: member.id,
    name: member.name,
    member_number: member.memberNumber,
    dni: member.dni || '',
    phone: member.phone || '',
    email: member.email || '',
    social_connections: member.socialConnections || {},
    points: Number(member.points || 0),
    is_active: true,
    created_at: new Date().toISOString(),
  })),
  categories: INITIAL_CATEGORIES.map((name) => ({ name })),
  rewards: [],
  offers: [],
  sales: [],
  sale_items: [],
  logs: [],
  expenses: [],
  budgets: [],
  orders: [],
  cash_closures: [],
  register_state: [{ id: 1, is_open: false, opening_balance: 0, closing_time: '21:00' }],
});

const getLocalDemoStore = () => {
  if (!localDemoStore) localDemoStore = buildLocalDemoStore();
  return localDemoStore;
};

const localDemoInsertRows = (table, rows) => {
  const store = getLocalDemoStore();
  const tableRows = store[table] || (store[table] = []);
  const nextRows = (Array.isArray(rows) ? rows : [rows]).map((row) => ({
    id: row?.id || nextLocalDemoId(table),
    created_at: row?.created_at || new Date().toISOString(),
    ...row,
  }));
  tableRows.unshift(...nextRows);
  return nextRows;
};

const localDemoUpdateRow = (table, id, payload) => {
  const store = getLocalDemoStore();
  const tableRows = store[table] || (store[table] = []);
  const rowIndex = tableRows.findIndex((row) => String(row.id) === String(id));
  if (rowIndex === -1) {
    const [createdRow] = localDemoInsertRows(table, [{ id, ...payload }]);
    return createdRow;
  }

  tableRows[rowIndex] = { ...tableRows[rowIndex], ...payload };
  return tableRows[rowIndex];
};

const AppVersionBadge = ({ theme = 'light' }) => {
  const isDarkTheme = theme === 'dark';

  return (
    <div
      className={`pointer-events-none absolute bottom-4 right-4 hidden items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] shadow-sm backdrop-blur sm:inline-flex ${
        isDarkTheme
          ? 'border-slate-600/80 bg-slate-950/85 text-slate-300 shadow-black/20'
          : 'border-slate-200/80 bg-white/70 text-slate-400'
      }`}
    >
      <span>Version</span>
      <span className={isDarkTheme ? 'text-amber-100' : 'text-slate-500'}>v{APP_VERSION}</span>
    </div>
  );
};

const LoginThemeToggle = ({ theme = 'light', onToggle }) => {
  const isDarkTheme = theme === 'dark';

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isDarkTheme ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      aria-pressed={isDarkTheme}
      title={isDarkTheme ? 'Tema oscuro' : 'Tema claro'}
      className={`absolute right-5 top-5 inline-flex h-9 items-center gap-2 rounded-full border px-3 text-[10px] font-black uppercase tracking-[0.12em] shadow-sm backdrop-blur transition hover:-translate-y-0.5 ${
        isDarkTheme
          ? 'border-slate-700 bg-slate-900/90 text-amber-100'
          : 'border-slate-200 bg-white/80 text-slate-500 hover:text-slate-700'
      }`}
    >
      {isDarkTheme ? <Moon size={14} /> : <Sun size={14} />}
      <span className="hidden sm:inline">{isDarkTheme ? 'Oscuro' : 'Claro'}</span>
    </button>
  );
};

const isBrowserOffline = () =>
  typeof navigator !== 'undefined' && navigator.onLine === false;

const withTimeout = (promise, timeoutMs, label = 'Operacion') =>
  new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      const timeoutError = new Error(`${label} excedio el tiempo de espera.`);
      timeoutError.code = 'REBU_TIMEOUT';
      timeoutError.timeoutMs = timeoutMs;
      timeoutError.operationLabel = label;
      reject(timeoutError);
    }, timeoutMs);

    Promise.resolve(promise).then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      }
    );
  });

const verifyCloudConnection = async () => {
  if (isBrowserOffline()) return false;

  if (window.electronAPI?.clearHostResolverCache) {
    const cacheResult = await window.electronAPI.clearHostResolverCache().catch(() => null);
    if (cacheResult && !cacheResult.success) {
      console.warn('No se pudo limpiar la cache DNS de Electron:', cacheResult.error);
    }
  }

  const { error } = await withTimeout(
    supabase.from('register_state').select('id').eq('id', 1).limit(1),
    CLOUD_RECONNECT_TIMEOUT_MS,
    'Reconexión'
  );

  if (error) throw error;
  return true;
};

const getCloudReconnectErrorMessage = (error) => {
  if (isBrowserOffline()) {
    return 'Windows informa que no hay conexion a internet.';
  }

  const errorText = [
    error?.message,
    error?.details,
    error?.hint,
    error?.code,
    error?.name,
  ].filter(Boolean).join(' ');

  if (error?.code === 'REBU_TIMEOUT' || /timeout|tiempo de espera/i.test(errorText)) {
    const timeoutSeconds = Math.max(1, Math.round(Number(error?.timeoutMs || CLOUD_RECONNECT_TIMEOUT_MS) / 1000));
    return `La operacion "${error?.operationLabel || 'Conexion con Supabase'}" no respondio en ${timeoutSeconds} segundos. Revisa la red y volve a intentar.`;
  }

  if (/failed to fetch|network|load failed|fetch failed|name.*resolve|dns|enotfound/i.test(errorText)) {
    return 'No se pudo resolver o contactar el servidor de Supabase. Revisa la configuracion DNS de Windows y volve a intentar.';
  }

  return error?.message || 'La nube todavia no responde. Podes volver a intentarlo en unos segundos.';
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
  metrics: { status: 'idle', lastLoadedAt: 0, dirty: false },
};

const MODULE_FRESHNESS_MS = {
  core: 10 * 60 * 1000,
  transactions: 15 * 60 * 1000,
  dashboard: 10 * 60 * 1000,
  history: 15 * 60 * 1000,
  orders: 15 * 60 * 1000,
  reports: 20 * 60 * 1000,
  metrics: 30 * 60 * 1000,
};

const TAB_TO_DATA_MODULE = {
  dashboard: 'dashboard',
  clients: 'transactions',
  history: 'history',
  reports: 'reports',
  metrics: 'metrics',
  orders: 'orders',
};

const sharedUsersCache = {
  promise: null,
  users: null,
  scope: 'active',
  authMode: 'legacy',
  loadedAt: 0,
  retryTimer: null,
  recoverableRetryCount: 0,
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

    const missingColumn = getSchemaMissingColumnName(extractSchemaMissingColumn(result.error));
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

const getScheduledRegisterCloseAt = (closingTime, openedAt = null, now = new Date()) => {
  const [hoursPart, minutesPart] = String(closingTime || '').split(':');
  const hours = Number(hoursPart);
  const minutes = Number(minutesPart);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  const baseDate = openedAt ? new Date(openedAt) : new Date(now);
  if (Number.isNaN(baseDate.getTime())) return null;

  const scheduledAt = new Date(baseDate);
  scheduledAt.setHours(hours, minutes, 0, 0);

  if (openedAt && scheduledAt.getTime() <= baseDate.getTime()) {
    scheduledAt.setDate(scheduledAt.getDate() + 1);
  }

  return scheduledAt;
};

const shouldAutoCloseRegister = ({ isRegisterClosed, closingTime, registerOpenedAt, now = new Date() }) => {
  if (isRegisterClosed || !closingTime) return false;
  const scheduledAt = getScheduledRegisterCloseAt(closingTime, registerOpenedAt, now);
  return Boolean(scheduledAt && now.getTime() >= scheduledAt.getTime());
};

const fetchRowsCreatedAfterWithSelectFallback = async (
  buildQuery,
  selectColumns,
  createdAfter
) =>
  runSelectWithSchemaFallback(
    (safeSelect) => buildQuery(safeSelect).gt('created_at', createdAfter),
    selectColumns
  );

const buildSaleHistoryLogsQuery = (selectColumns) =>
  supabase
    .from('logs')
    .select(selectColumns)
    .in('action', HISTORY_LOG_ACTIONS)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

const fetchSaleHistoryLogsForTransactions = async ({ createdAfter = null, limit = null } = {}) => {
  const logsResult = createdAfter
    ? await fetchRowsCreatedAfterWithSelectFallback(
        buildSaleHistoryLogsQuery,
        CLOUD_SELECTS.logs,
        createdAfter
      )
    : limit
      ? await fetchRecentRowsWithSelectFallback(
          buildSaleHistoryLogsQuery,
          CLOUD_SELECTS.logs,
          limit
        )
      : await fetchAllCloudRowsWithSelectFallback(
          buildSaleHistoryLogsQuery,
          CLOUD_SELECTS.logs,
          CLOUD_FETCH_BATCH_SIZE
        );

  if (logsResult.error) {
    console.warn('No se pudieron cargar logs para enriquecer ventas:', logsResult.error);
    return [];
  }

  return mapLogRecords(logsResult.data || []);
};

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

    const missingColumn = getSchemaMissingColumnName(extractSchemaMissingColumn(result.error));
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

const getTransactionCostSignal = (tx = {}) => {
  const hasStockChanges = Array.isArray(tx.stockChanges) && tx.stockChanges.length > 0;
  const hasItemCosts = (Array.isArray(tx.items) ? tx.items : []).some((item) => (
    Number(
      item?.cost ??
        item?.unitCost ??
        item?.unit_cost ??
        item?.purchasePrice ??
        item?.purchase_price ??
        item?.costPrice ??
        item?.cost_price ??
        0
    ) > 0
  ));

  return (hasStockChanges ? 2 : 0) + (hasItemCosts ? 1 : 0);
};

const preserveTransactionCostContext = (incomingTx = {}, existingTx = null) => {
  if (!existingTx) return incomingTx;
  if (getTransactionCostSignal(existingTx) <= getTransactionCostSignal(incomingTx)) return incomingTx;

  return {
    ...incomingTx,
    items: Array.isArray(existingTx.items) && existingTx.items.length ? existingTx.items : incomingTx.items,
    stockChanges: Array.isArray(existingTx.stockChanges) && existingTx.stockChanges.length
      ? existingTx.stockChanges
      : incomingTx.stockChanges,
    pointsChange: incomingTx.pointsChange || existingTx.pointsChange || null,
  };
};

const mergeTransactionsPreservingCostContext = (existingRecords, incomingRecords, { replace = false } = {}) => {
  const existing = Array.isArray(existingRecords) ? existingRecords : [];
  const incoming = Array.isArray(incomingRecords) ? incomingRecords : [];
  if (incoming.length === 0) return replace ? [] : existing;

  const existingById = new Map(
    existing
      .filter((record) => record?.id !== undefined && record?.id !== null)
      .map((record) => [String(record.id), record])
  );
  const enrichedIncoming = incoming.map((record) => {
    const key = record?.id !== undefined && record?.id !== null ? String(record.id) : '';
    return preserveTransactionCostContext(record, key ? existingById.get(key) : null);
  });

  if (replace) return enrichedIncoming;

  const incomingIds = new Set(
    enrichedIncoming.map((record) => String(record?.id ?? '')).filter(Boolean)
  );

  return [
    ...enrichedIncoming,
    ...existing.filter((record) => {
      const key = String(record?.id ?? '');
      return !key || !incomingIds.has(key);
    }),
  ];
};

const mapCashClosureReportFromLog = (log) => {
  const details = log?.details && typeof log.details === 'object' ? log.details : {};
  const expensesSnapshot = Array.isArray(details.expensesSnapshot) ? details.expensesSnapshot : [];
  const transactionsSnapshot = Array.isArray(details.transactionsSnapshot) ? details.transactionsSnapshot : [];

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
    expensesSnapshot,
    transactionsSnapshot,
    hasDetail: expensesSnapshot.length > 0 || transactionsSnapshot.length > 0,
    source: 'log',
    createdAt: log?.created_at || null,
  };
};

const hasCashClosureSnapshotsInLog = (details) =>
  Boolean(
    details &&
      typeof details === 'object' &&
      (Array.isArray(details.expensesSnapshot) || Array.isArray(details.transactionsSnapshot))
  );

const LOG_IMAGE_PLACEHOLDER = '[imagen omitida]';
const LOG_AVATAR_PLACEHOLDER = '[avatar omitido]';
const LOG_STRING_MAX_LENGTH = 4000;
const LOG_IMAGE_KEYS = new Set(['image', 'image_thumb', 'imagethumb', 'thumb', 'thumbnail', 'avatar']);

const compactLogDetailsForStorage = (value, key = '') => {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    const normalizedKey = key.toLowerCase();

    if (LOG_IMAGE_KEYS.has(normalizedKey) && value.trim() !== '') {
      return normalizedKey.includes('avatar') ? LOG_AVATAR_PLACEHOLDER : LOG_IMAGE_PLACEHOLDER;
    }

    if (value.startsWith('data:image/')) {
      return normalizedKey.includes('avatar') ? LOG_AVATAR_PLACEHOLDER : LOG_IMAGE_PLACEHOLDER;
    }

    if (normalizedKey.includes('avatar') && value.length > 120) {
      return LOG_AVATAR_PLACEHOLDER;
    }

    if (value.length > LOG_STRING_MAX_LENGTH) {
      return `${value.slice(0, LOG_STRING_MAX_LENGTH)}... [texto recortado]`;
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => compactLogDetailsForStorage(item, key));
  }

  if (typeof value === 'object') {
    return Object.entries(value).reduce((nextValue, [entryKey, entryValue]) => {
      nextValue[entryKey] = compactLogDetailsForStorage(entryValue, entryKey);
      return nextValue;
    }, {});
  }

  return value;
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

const fetchProductCloudDetail = async (productId) => {
  if (!productId) return null;

  const result = await runSelectWithSchemaFallback(
    (selectColumns) =>
      supabase
        .from('products')
        .select(selectColumns)
        .eq('id', productId)
        .maybeSingle(),
    CLOUD_SELECTS.products
  );

  if (result.error) throw result.error;
  if (!result.data) return null;
  return mapInventoryRecords([result.data])[0] || null;
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
      selectColumns: CLOUD_SELECTS.productsList,
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
    fetchRowsWithOptionalActiveFilter({
      table: 'rewards',
      selectColumns: CLOUD_SELECTS.rewards,
      orderBy: 'points_cost',
      orderDirection: 'asc',
      additionalOrders: [{ column: 'id', ascending: true }],
    }),
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
  const [salesResult, parsedLogs] = await Promise.all([
    fetchAllCloudRowsWithSelectFallback(
      (selectColumns) =>
        supabase
          .from('sales')
          .select(selectColumns)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false }),
      CLOUD_SELECTS.sales,
      CLOUD_FETCH_BATCH_SIZE
    ),
    fetchSaleHistoryLogsForTransactions(),
  ]);

  const hasCloudConnection = !salesResult.error;
  const salesData = salesResult.error ? null : salesResult.data || [];

  if (salesResult.error) {
    console.error('Error en tabla [ventas]:', salesResult.error);
  }

  return {
    hasCloudConnection,
    transactions: salesData ? mapSaleRecords(salesData, parsedLogs) : null,
  };
};

const fetchRecentTransactionsCloudPayload = async () => {
  const [salesResult, parsedLogs] = await Promise.all([
    fetchRecentRowsWithSelectFallback(
      (selectColumns) =>
        supabase
          .from('sales')
          .select(selectColumns)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false }),
      CLOUD_SELECTS.sales,
      CLOUD_RECENT_SYNC_LIMIT
    ),
    fetchSaleHistoryLogsForTransactions({ limit: CLOUD_RECENT_SYNC_LIMIT }),
  ]);

  const hasCloudConnection = !salesResult.error;
  const salesData = salesResult.error ? null : salesResult.data || [];

  if (salesResult.error) {
    console.error('Error en tabla [ventas recientes]:', salesResult.error);
  }

  return {
    hasCloudConnection,
    transactions: salesData ? mapSaleRecords(salesData, parsedLogs) : null,
  };
};

const fetchTransactionsCloudPayloadSince = async (createdAfter) => {
  const [salesResult, parsedLogs] = await Promise.all([
    fetchRowsCreatedAfterWithSelectFallback(
      (selectColumns) =>
        supabase
          .from('sales')
          .select(selectColumns)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false }),
      CLOUD_SELECTS.sales,
      createdAfter
    ),
    fetchSaleHistoryLogsForTransactions({ createdAfter }),
  ]);

  const hasCloudConnection = !salesResult.error;
  const salesData = salesResult.error ? null : salesResult.data || [];

  if (salesResult.error) {
    console.error('Error en tabla [ventas incrementales]:', salesResult.error);
  }

  return {
    hasCloudConnection,
    transactions: salesData ? mapSaleRecords(salesData, parsedLogs) : null,
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

const recordHasOwnColumn = (record, columnName) =>
  Object.prototype.hasOwnProperty.call(record || {}, columnName);

const shouldFetchSaleLogsForMetrics = (sales = []) =>
  (Array.isArray(sales) ? sales : []).some((sale) => {
    const requiredSaleColumns = [
      'payment_breakdown',
      'cash_received',
      'cash_change',
      'user_id',
      'user_role',
      'status',
      'voided_at',
    ];

    if (requiredSaleColumns.some((columnName) => !recordHasOwnColumn(sale, columnName))) return true;

    const items = Array.isArray(sale.sale_items) ? sale.sale_items : [];
    if (Number(sale.total || 0) > 0 && items.length === 0) return true;

    const requiredItemColumns = ['subtotal', 'cost', 'is_custom', 'is_discount', 'is_combo', 'product_type'];
    return items.some((item) =>
      requiredItemColumns.some((columnName) => !recordHasOwnColumn(item, columnName))
    );
  });

const fetchMetricsCloudPayload = async ({ includeTransactions = true } = {}) => {
  const [salesResult, expResult, closuresResult, budgetsResult, ordersResult] = await Promise.allSettled([
    includeTransactions
      ? fetchAllCloudRowsWithSelectFallback(
          (selectColumns) =>
            supabase
              .from('sales')
              .select(selectColumns)
              .order('created_at', { ascending: false })
              .order('id', { ascending: false }),
          CLOUD_SELECTS.sales,
          CLOUD_FETCH_BATCH_SIZE
        )
      : Promise.resolve({ data: null, error: null, skipped: true }),
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

  const hasCloudConnection = [
    includeTransactions ? salesResult : null,
    expResult,
    closuresResult,
    budgetsResult,
    ordersResult,
  ].filter(Boolean).some(hasUsableCloudResult);
  const salesData = includeTransactions ? safeCloudData(salesResult, 'ventas para metricas') : null;
  const expData = safeCloudData(expResult, 'gastos para métricas');
  const closuresData = safeCloudData(closuresResult, 'cierres para métricas');
  const budgetsData = safeCloudData(budgetsResult, 'presupuestos para métricas');
  const ordersData = safeCloudData(ordersResult, 'pedidos para métricas');
  const parsedLogs = includeTransactions && salesData && shouldFetchSaleLogsForMetrics(salesData)
    ? await fetchSaleHistoryLogsForTransactions()
    : [];

  return {
    hasCloudConnection,
    transactions: salesData ? mapSaleRecords(salesData, parsedLogs) : null,
    dailyLogs: null,
    expenses: expData ? mapExpenseRecords(expData) : null,
    pastClosures: closuresData ? mapCashClosureRecords(closuresData) : null,
    budgets: budgetsData ? mapBudgetRecords(budgetsData) : null,
    orders: ordersData ? mapOrderRecords(ordersData) : null,
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
      if (hasCashClosureSnapshotsInLog(mappedLog?.details)) {
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

const buildGuestPosClient = () => ({
  id: 'guest',
  name: 'No asociado',
  memberNumber: '---',
  points: 0,
  usedCoupons: [],
});

const isUuidLike = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));

const isNumericDbId = (value) => {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0;
  return /^[1-9]\d*$/.test(String(value || '').trim());
};

const toOptionalDbId = (value) => {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  if (!normalized || ['guest', 'no asociado', 'consumer-final'].includes(normalized.toLowerCase())) return null;
  if (normalized.startsWith('legacy-')) return null;
  if (isNumericDbId(normalized) || isUuidLike(normalized)) return value;
  return null;
};

const getSessionDeviceInfo = async () => {
  const fallbackInfo = {
    deviceName: 'Equipo desconocido',
    ipAddress: typeof window !== 'undefined' ? window.location.hostname || 'No disponible' : 'No disponible',
    platform: typeof navigator !== 'undefined' ? navigator.platform || 'Web' : 'Web',
    runtime: 'Web',
  };

  try {
    if (typeof window !== 'undefined' && window.electronAPI?.getDeviceInfo) {
      return {
        ...fallbackInfo,
        ...(await window.electronAPI.getDeviceInfo()),
      };
    }
  } catch (error) {
    console.error('No se pudo obtener la info del equipo:', error);
  }

  return fallbackInfo;
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

const trimSnapshotArray = (records, limit) =>
  Array.isArray(records) ? records.slice(0, limit) : records;

const compactSnapshotForStorage = (snapshot, limits = SNAPSHOT_COMPACT_LIMITS) => {
  if (!snapshot || typeof snapshot !== 'object') return snapshot;

  return Object.entries(snapshot).reduce((nextSnapshot, [key, value]) => {
    const limit = limits[key];
    nextSnapshot[key] = Number.isFinite(limit) ? trimSnapshotArray(value, limit) : value;
    return nextSnapshot;
  }, {});
};

const serializeSnapshotForStorage = (snapshot) => {
  const serialized = JSON.stringify(snapshot);
  if (serialized.length <= SNAPSHOT_STORAGE_SOFT_LIMIT) return serialized;
  return JSON.stringify(compactSnapshotForStorage(snapshot));
};

const buildStrictSnapshotLimits = (limits = SNAPSHOT_COMPACT_LIMITS) =>
  Object.entries(limits).reduce((nextLimits, [key, limit]) => {
    nextLimits[key] = Math.min(limit, 200);
    return nextLimits;
  }, {});

const buildTinySnapshotLimits = (limits = SNAPSHOT_COMPACT_LIMITS) =>
  Object.entries(limits).reduce((nextLimits, [key]) => {
    nextLimits[key] = 50;
    return nextLimits;
  }, {});

const saveSnapshotToStorage = (storageKey, snapshot) => {
  try {
    window.localStorage.setItem(storageKey, serializeSnapshotForStorage(snapshot));
  } catch {
    try {
      window.localStorage.removeItem(storageKey);
      const strictSnapshot = compactSnapshotForStorage(snapshot, buildStrictSnapshotLimits());
      window.localStorage.setItem(storageKey, JSON.stringify(strictSnapshot));
      return;
    } catch (strictError) {
      try {
        const tinySnapshot = compactSnapshotForStorage(snapshot, buildTinySnapshotLimits());
        window.localStorage.setItem(storageKey, JSON.stringify(tinySnapshot));
        return;
      } catch {
        console.warn('No se pudo guardar el snapshot offline por falta de espacio local:', strictError);
        return;
      }
    }
  }
};

const buildMetricsOfflineSnapshot = (payload, fallback = {}) => {
  const source = {
    savedAt: new Date().toISOString(),
    transactions: payload.transactions ?? fallback.transactions ?? [],
    expenses: payload.expenses ?? fallback.expenses ?? [],
    pastClosures: payload.pastClosures ?? fallback.pastClosures ?? [],
    budgets: payload.budgets ?? fallback.budgets ?? [],
    orders: payload.orders ?? fallback.orders ?? [],
  };

  return compactSnapshotForStorage(source, METRICS_SNAPSHOT_LIMITS);
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
const loadOfflineMetricsSnapshot = () => loadSnapshotFromStorage(OFFLINE_METRICS_CACHE_KEY);
const saveOfflineMetricsSnapshot = (snapshot) => saveSnapshotToStorage(OFFLINE_METRICS_CACHE_KEY, snapshot);
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

const loadLoginThemePreference = () => {
  try {
    if (typeof window === 'undefined') return 'light';
    return window.localStorage.getItem(LOGIN_THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch (error) {
    console.error('No se pudo leer el tema del ingreso:', error);
    return 'light';
  }
};

const saveLoginThemePreference = (theme) => {
  try {
    window.localStorage.setItem(LOGIN_THEME_KEY, theme === 'dark' ? 'dark' : 'light');
  } catch (error) {
    console.error('No se pudo guardar el tema del ingreso:', error);
  }
};

const saveMetricsViewModePreference = (mode) => {
  try {
    window.localStorage.setItem(METRICS_VIEW_MODE_STORAGE_KEY, normalizeMetricsViewMode(mode));
  } catch (error) {
    console.error('No se pudo guardar la preferencia de métricas:', error);
  }
};

const loadMetricsViewModePreference = () => {
  try {
    return normalizeMetricsViewMode(window.localStorage.getItem(METRICS_VIEW_MODE_STORAGE_KEY));
  } catch {
    return 'modern';
  }
};

const loadRememberedSession = () => {
  try {
    if (typeof window === 'undefined') return null;
    const rawSession = window.sessionStorage.getItem(REMEMBERED_SESSION_KEY);
    if (!rawSession) return null;
    const parsedSession = JSON.parse(rawSession);
    if (!parsedSession?.userId || !parsedSession?.sessionMeta?.sessionId) return null;
    return parsedSession;
  } catch (error) {
    console.error('No se pudo leer la sesion recordada:', error);
    return null;
  }
};

const saveRememberedSession = (user, sessionMeta) => {
  try {
    if (typeof window === 'undefined' || !user?.id || !sessionMeta?.sessionId) return;
    window.sessionStorage.setItem(
      REMEMBERED_SESSION_KEY,
      JSON.stringify({
        userId: user.id,
        savedAt: new Date().toISOString(),
        sessionMeta,
      }),
    );
  } catch (error) {
    console.error('No se pudo recordar la sesion:', error);
  }
};

const clearRememberedSession = () => {
  try {
    if (typeof window === 'undefined') return;
    window.sessionStorage.removeItem(REMEMBERED_SESSION_KEY);
  } catch (error) {
    console.error('No se pudo limpiar la sesion recordada:', error);
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

const getPayloadKeyForMissingColumn = (payload, missingColumn) => {
  const columnName = getSchemaMissingColumnName(missingColumn);
  if (!columnName || !payload || typeof payload !== 'object') return null;
  return Object.keys(payload).find((key) => key.toLowerCase() === columnName.toLowerCase()) || null;
};

const getPayloadKeyForInvalidInput = (payload, error, table) => {
  if (!payload || typeof payload !== 'object') return null;
  const errorText = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ');
  const invalidValue = errorText.match(/invalid input syntax for type \w+:\s*"([^"]+)"/i)?.[1];
  if (!invalidValue) return null;

  return Object.keys(payload).find((key) => {
    if (!isOptionalSchemaColumn(table, key)) return false;
    const value = payload[key];
    return value !== null && value !== undefined && String(value) === invalidValue;
  }) || null;
};

const schemaFallbackDisabledColumnsByTable = new Map();

const normalizeSchemaTableKey = (table) => String(table || '').trim().toLowerCase();
const normalizePayloadColumnKey = (key) => String(key || '').trim().toLowerCase();

const getDisabledSchemaColumns = (table) => {
  const tableKey = normalizeSchemaTableKey(table);
  if (!tableKey) return null;
  if (!schemaFallbackDisabledColumnsByTable.has(tableKey)) {
    schemaFallbackDisabledColumnsByTable.set(tableKey, new Set());
  }
  return schemaFallbackDisabledColumnsByTable.get(tableKey);
};

const rememberDisabledSchemaColumn = (table, missingColumn) => {
  const columnName = getSchemaMissingColumnName(missingColumn);
  if (!columnName || !isOptionalSchemaColumn(table, columnName)) return;
  getDisabledSchemaColumns(table)?.add(normalizePayloadColumnKey(columnName));
};

const omitDisabledSchemaColumnsFromPayload = (table, payload) => {
  const disabledColumns = getDisabledSchemaColumns(table);
  if (!disabledColumns?.size || !payload || typeof payload !== 'object') return { ...payload };

  return Object.entries(payload).reduce((nextPayload, [key, value]) => {
    if (!disabledColumns.has(normalizePayloadColumnKey(key))) {
      nextPayload[key] = value;
    }
    return nextPayload;
  }, {});
};

const removeDisabledSchemaColumnsFromSelect = (table, selectColumns = '*') => {
  const disabledColumns = getDisabledSchemaColumns(table);
  if (!disabledColumns?.size || !selectColumns || selectColumns === '*') return selectColumns;

  let safeSelect = selectColumns;
  disabledColumns.forEach((columnName) => {
    safeSelect = removeColumnFromSelect(safeSelect, columnName);
  });
  return safeSelect || selectColumns;
};

const insertWithSchemaFallback = async (table, payload, selectColumns = '*') => {
  if (isLocalDemoMode()) {
    const [data] = localDemoInsertRows(table, [payload]);
    return { data, payload };
  }

  let safePayload = omitDisabledSchemaColumnsFromPayload(table, payload);
  let safeSelect = removeDisabledSchemaColumnsFromSelect(table, selectColumns);

  while (true) {
    const { data, error } = await supabase.from(table).insert([safePayload]).select(safeSelect).single();
    if (!error) return { data, payload: safePayload };

    const invalidPayloadKey = getPayloadKeyForInvalidInput(safePayload, error, table);
    if (invalidPayloadKey) {
      safePayload = { ...safePayload, [invalidPayloadKey]: null };
      continue;
    }

    const missingColumn = extractSchemaMissingColumn(error);
    const missingPayloadKey = getPayloadKeyForMissingColumn(safePayload, missingColumn);
    if (missingPayloadKey && isOptionalSchemaColumn(table, missingColumn)) {
      rememberDisabledSchemaColumn(table, missingColumn);
      const nextPayload = { ...safePayload };
      delete nextPayload[missingPayloadKey];
      safePayload = nextPayload;
      continue;
    }

    const nextSelect = missingColumn ? removeColumnFromSelect(safeSelect, missingColumn) : '';
    if (missingColumn && nextSelect && nextSelect !== safeSelect) {
      rememberDisabledSchemaColumn(table, missingColumn);
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
  if (isLocalDemoMode()) {
    const payload = Array.isArray(rows) ? rows : [rows];
    const data = localDemoInsertRows(table, payload);
    return { data, payload };
  }

  let safeRows = (Array.isArray(rows) ? rows : [rows]).map((row) =>
    omitDisabledSchemaColumnsFromPayload(table, row)
  );

  while (true) {
    const { data, error } = await supabase.from(table).insert(safeRows);
    if (!error) return { data, payload: safeRows };

    const invalidPayloadKey = safeRows.reduce(
      (foundKey, row) => foundKey || getPayloadKeyForInvalidInput(row, error, table),
      null,
    );
    if (invalidPayloadKey) {
      safeRows = safeRows.map((row) => ({ ...row, [invalidPayloadKey]: null }));
      continue;
    }

    const missingColumn = extractSchemaMissingColumn(error);
    const canDropMissingColumn =
      missingColumn &&
      isOptionalSchemaColumn(table, missingColumn) &&
      safeRows.some((row) => getPayloadKeyForMissingColumn(row, missingColumn));
    if (canDropMissingColumn) {
      rememberDisabledSchemaColumn(table, missingColumn);
      safeRows = safeRows.map((row) => {
        const missingPayloadKey = getPayloadKeyForMissingColumn(row, missingColumn);
        if (!missingPayloadKey) return row;
        const { [missingPayloadKey]: _removed, ...rest } = row;
        return rest;
      });
      continue;
    }

    throw error;
  }
};

const updateWithSchemaFallback = async (table, id, payload, selectColumns = '*') => {
  if (isLocalDemoMode()) {
    const data = localDemoUpdateRow(table, id, payload);
    return { data, payload };
  }

  let safePayload = omitDisabledSchemaColumnsFromPayload(table, payload);
  let safeSelect = removeDisabledSchemaColumnsFromSelect(table, selectColumns);

  while (true) {
    if (!safePayload || Object.keys(safePayload).length === 0) {
      return { data: null, payload: safePayload, skipped: true };
    }

    const { data, error } = await supabase.from(table).update(safePayload).eq('id', id).select(safeSelect).single();
    if (!error) return { data, payload: safePayload };

    const invalidPayloadKey = getPayloadKeyForInvalidInput(safePayload, error, table);
    if (invalidPayloadKey) {
      safePayload = { ...safePayload, [invalidPayloadKey]: null };
      continue;
    }

    const missingColumn = extractSchemaMissingColumn(error);
    const missingPayloadKey = getPayloadKeyForMissingColumn(safePayload, missingColumn);
    if (missingPayloadKey && isOptionalSchemaColumn(table, missingColumn)) {
      rememberDisabledSchemaColumn(table, missingColumn);
      const nextPayload = { ...safePayload };
      delete nextPayload[missingPayloadKey];
      safePayload = nextPayload;
      continue;
    }

    const nextSelect = missingColumn ? removeColumnFromSelect(safeSelect, missingColumn) : '';
    if (missingColumn && nextSelect && nextSelect !== safeSelect) {
      rememberDisabledSchemaColumn(table, missingColumn);
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
  const [isSoftReloading, setIsSoftReloading] = useState(false);
  const [isForceReloading, setIsForceReloading] = useState(false);
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
    metrics: null,
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
    const nextDailyLogs = Array.isArray(snapshot.dailyLogs) ? snapshot.dailyLogs : [];
    const nextExpenses = Array.isArray(snapshot.expenses) ? snapshot.expenses : [];
    const nextPastClosures = Array.isArray(snapshot.pastClosures) ? snapshot.pastClosures : [];
    dataStateRef.current = {
      ...dataStateRef.current,
      dailyLogs: nextDailyLogs,
      expenses: nextExpenses,
      pastClosures: nextPastClosures,
    };
    setDailyLogs(nextDailyLogs);
    setExpenses(nextExpenses);
    setPastClosures(nextPastClosures);
    return true;
  };

  const applyTransactionsSnapshot = (snapshot) => {
    const hasTransactionsData = snapshot && 'transactions' in snapshot;
    if (!hasTransactionsData) return false;
    const nextTransactions = Array.isArray(snapshot.transactions) ? snapshot.transactions : [];
    dataStateRef.current = { ...dataStateRef.current, transactions: nextTransactions };
    setTransactions(nextTransactions);
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

  const applyMetricsSnapshot = (snapshot) => {
    const hasMetricsData =
      snapshot &&
      (
        'transactions' in snapshot ||
        'dailyLogs' in snapshot ||
        'expenses' in snapshot ||
        'pastClosures' in snapshot ||
        'budgets' in snapshot ||
        'orders' in snapshot
      );
    if (!hasMetricsData) return false;
    if ('transactions' in snapshot) setTransactions(Array.isArray(snapshot.transactions) ? snapshot.transactions : []);
    if ('dailyLogs' in snapshot) setDailyLogs(Array.isArray(snapshot.dailyLogs) ? snapshot.dailyLogs : []);
    if ('expenses' in snapshot) setExpenses(Array.isArray(snapshot.expenses) ? snapshot.expenses : []);
    if ('pastClosures' in snapshot) setPastClosures(Array.isArray(snapshot.pastClosures) ? snapshot.pastClosures : []);
    if ('budgets' in snapshot) setBudgets(Array.isArray(snapshot.budgets) ? snapshot.budgets : []);
    if ('orders' in snapshot) setOrders(Array.isArray(snapshot.orders) ? snapshot.orders : []);
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
    applyMetricsSnapshot(snapshot);
    if (snapshot.savedAt) setOfflineSnapshotAt(snapshot.savedAt);
    return true;
  };

  const applyLocalDemoSnapshot = () => {
    const store = getLocalDemoStore();
    const savedAt = new Date().toISOString();

    setInventory(mapInventoryRecords(store.products));
    setCategories(mapCategoryRecords(store.categories));
    setRewards(mapRewardRecords(store.rewards));
    setMembers(mapMemberRecords(store.clients));
    setAgendaContacts([]);
    setOffers(mapOfferRecords(store.offers));
    setTransactions(Array.isArray(INITIAL_TRANSACTIONS) ? INITIAL_TRANSACTIONS : []);
    setDailyLogs([]);
    setHistoryLogs([]);
    setExpenses([]);
    setPastClosures([]);
    setBudgets([]);
    setOrders([]);
    syncRegisterState(store.register_state[0]);
    setOfflineSnapshotAt(savedAt);

    moduleLoadStateRef.current = Object.keys(MODULE_LOAD_DEFAULT_STATE).reduce((nextState, moduleKey) => {
      nextState[moduleKey] = { status: 'loaded', dirty: false, lastLoadedAt: Date.now() };
      return nextState;
    }, {});
    setModuleLoadState(moduleLoadStateRef.current);
    return true;
  };

  const loadAppUsers = async ({ force = false, includeInactive = false } = {}) => {
    if (isLocalDemoMode()) {
      const legacyUsers = buildLegacyUsers(USERS, userSettings);
      setAuthMode('legacy');
      setAppUsers(legacyUsers);
      return legacyUsers;
    }

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
      if (!force && canServeSharedUsersScope(cachedResult.scope || 'active', requestedScope)) {
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
        const actorIdForPrivateUsers = currentUserRef.current?.id || null;
        const readUsers = () =>
          actorIdForPrivateUsers
            ? fetchAppUsersPrivate({
                actorId: actorIdForPrivateUsers,
                includeInactive,
              })
            : fetchAppUsersPublic({
                includeInactive,
                includeAuditFields: includeInactive,
              });

        let users = await withTimeout(
          readUsers(),
          APP_USERS_BOOT_TIMEOUT_MS,
          'Carga de usuarios',
        );

        if (users.length === 0) {
          const seed = buildLegacyBootstrapSeed(USERS, userSettings);
          await withTimeout(bootstrapAppUsers(seed), APP_USERS_BOOT_TIMEOUT_MS, 'Inicializacion de usuarios');
          users = await withTimeout(
            readUsers(),
            APP_USERS_BOOT_TIMEOUT_MS,
            'Recarga de usuarios',
          );
        }

        if (users.length > 0) {
          sharedUsersCache.recoverableRetryCount = 0;
          if (sharedUsersCache.retryTimer) {
            window.clearTimeout(sharedUsersCache.retryTimer);
            sharedUsersCache.retryTimer = null;
          }
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
          recoverableFallback: isRecoverableCloudError(error) && !isMissingSharedUsersSchema,
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

      if (
        result.recoverableFallback &&
        !isBrowserOffline() &&
        sharedUsersCache.recoverableRetryCount < 3 &&
        !sharedUsersCache.retryTimer
      ) {
        sharedUsersCache.recoverableRetryCount += 1;
        sharedUsersCache.retryTimer = window.setTimeout(() => {
          sharedUsersCache.retryTimer = null;
          void loadAppUsers({ force: true, includeInactive });
        }, 2500);
      }

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
      setDailyLogs((prev) => {
        const next = merge ? mergeLatestRecords(prev, payload.dailyLogs) : payload.dailyLogs;
        dataStateRef.current = { ...dataStateRef.current, dailyLogs: next };
        return next;
      });
    }
    if (payload.expenses !== null) {
      setExpenses((prev) => {
        const next = merge ? mergeLatestRecords(prev, payload.expenses) : payload.expenses;
        dataStateRef.current = { ...dataStateRef.current, expenses: next };
        return next;
      });
    }
    if (payload.pastClosures !== null) {
      setPastClosures((prev) => {
        const next = merge ? mergeLatestRecords(prev, payload.pastClosures) : payload.pastClosures;
        dataStateRef.current = { ...dataStateRef.current, pastClosures: next };
        return next;
      });
    }
  };

  const applyTransactionsPayload = (payload, { merge = false } = {}) => {
    if (payload.transactions !== null) {
      setTransactions((prev) => {
        const next = applyLocalTransactionOverrides(
          mergeTransactionsPreservingCostContext(prev, payload.transactions, { replace: !merge }),
        );
        dataStateRef.current = { ...dataStateRef.current, transactions: next };
        return next;
      });
    }
  };

  const upsertLocalTransaction = (transaction) => {
    if (!transaction?.id) return;
    localDataMutationRef.current.transactions = Date.now();
    setModuleState('transactions', (prev) => ({ ...prev, dirty: true }));
    setTransactions((prev) => {
      const next = [transaction, ...(prev || []).filter((item) => String(item.id) !== String(transaction.id))];
      dataStateRef.current = { ...dataStateRef.current, transactions: next };
      return next;
    });
  };

  const upsertLocalHistoryLog = (log) => {
    if (!log?.id) return;
    setModuleState('history', (prev) => ({ ...prev, dirty: true }));
    setHistoryLogs((prev) => {
      const next = [log, ...(prev || []).filter((item) => String(item.id) !== String(log.id))];
      dataStateRef.current = { ...dataStateRef.current, historyLogs: next };
      return next;
    });
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

  const applyMetricsPayload = (payload) => {
    applyTransactionsPayload(payload);
    applyDashboardPayload(payload);
    applyOrdersPayload(payload);
  };

  const loadCoreCloudData = async ({ showSpinner = false, force = false, requireCloud = false } = {}) => {
    if (isLocalDemoMode()) {
      applyLocalDemoSnapshot();
      setIsOfflineReadOnly(false);
      setModuleState('core', { status: 'loaded', dirty: false, lastLoadedAt: Date.now() });
      return true;
    }

    if (isBrowserOffline()) {
      const cachedSnapshot = loadOfflineSnapshot();
      if (applyCoreSnapshot(cachedSnapshot)) {
        setIsOfflineReadOnly(true);
        setModuleState('core', { status: 'loaded', dirty: false, lastLoadedAt: Date.now() });
        return !requireCloud;
      }

      setIsOfflineReadOnly(true);
      setModuleState('core', { status: 'error', dirty: true });
      return false;
    }

    if (moduleLoadPromisesRef.current.core) {
      if (!force) return moduleLoadPromisesRef.current.core;
      await withTimeout(
        moduleLoadPromisesRef.current.core,
        FORCE_RELOAD_TIMEOUT_MS,
        'Espera de carga base anterior',
      );
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
            return !requireCloud;
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
        console.error('Error general de conexión (metrics):', error);
        initialBootstrapPromise = null;
        const cachedSnapshot = loadOfflineSnapshot();
        if (applyCoreSnapshot(cachedSnapshot)) {
          setIsOfflineReadOnly(true);
          setModuleState('core', { status: 'loaded', dirty: false, lastLoadedAt: Date.now() });
          return !requireCloud;
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

  const loadTransactionsCloudData = async ({ force = false, requireCloud = false } = {}) => {
    if (moduleLoadPromisesRef.current.transactions) {
      if (!force) return moduleLoadPromisesRef.current.transactions;
      await withTimeout(
        moduleLoadPromisesRef.current.transactions,
        FORCE_RELOAD_TIMEOUT_MS,
        'Espera de transacciones anterior',
      );
    }

    const currentState = moduleLoadStateRef.current.transactions;
    if (!force && isModuleStateFresh(currentState, MODULE_FRESHNESS_MS.transactions)) {
      return true;
    }

    const run = async () => {
      const requestStartedAt = Date.now();
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
          if (!force && Number(localDataMutationRef.current.transactions || 0) > requestStartedAt) {
            setModuleState('transactions', { status: 'loaded', dirty: true, lastLoadedAt: Date.now() });
            return true;
          }

          const cachedSnapshot =
            loadOfflineTransactionsSnapshot() || loadOfflineDashboardSnapshot() || loadOfflineSnapshot();
          if (applyTransactionsSnapshot(cachedSnapshot)) {
            setModuleState('transactions', { status: 'loaded', dirty: false, lastLoadedAt: Date.now() });
            return !requireCloud;
          }

          setModuleState('transactions', { status: 'error', dirty: true });
          return false;
        }

        if (!force && Number(localDataMutationRef.current.transactions || 0) > requestStartedAt) {
          setModuleState('transactions', { status: 'loaded', dirty: true, lastLoadedAt: Date.now() });
          return true;
        }

        applyTransactionsPayload(payload, { merge: useRecentSync });
        setIsOfflineReadOnly(false);
        const rawNextTransactions =
          payload.transactions === null
            ? dataStateRef.current.transactions ?? []
            : mergeTransactionsPreservingCostContext(dataStateRef.current.transactions, payload.transactions, {
                replace: !useRecentSync,
              });
        const nextTransactions = applyLocalTransactionOverrides(rawNextTransactions);
        dataStateRef.current = { ...dataStateRef.current, transactions: nextTransactions };

        const nextSnapshot = {
          savedAt: new Date().toISOString(),
          transactions: nextTransactions,
        };
        saveOfflineTransactionsSnapshot(nextSnapshot);
        setModuleState('transactions', { status: 'loaded', dirty: false, lastLoadedAt: Date.now() });
        return true;
      } catch (error) {
        console.error('Error general de conexión (metrics):', error);
        if (!force && Number(localDataMutationRef.current.transactions || 0) > requestStartedAt) {
          setModuleState('transactions', { status: 'loaded', dirty: true, lastLoadedAt: Date.now() });
          return true;
        }

        const cachedSnapshot =
          loadOfflineTransactionsSnapshot() || loadOfflineDashboardSnapshot() || loadOfflineSnapshot();
        if (applyTransactionsSnapshot(cachedSnapshot)) {
          setModuleState('transactions', { status: 'loaded', dirty: false, lastLoadedAt: Date.now() });
          return !requireCloud;
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

  const loadDashboardCloudData = async ({ force = false, requireCloud = false } = {}) => {
    if (moduleLoadPromisesRef.current.dashboard) {
      if (!force) return moduleLoadPromisesRef.current.dashboard;
      await withTimeout(
        moduleLoadPromisesRef.current.dashboard,
        FORCE_RELOAD_TIMEOUT_MS,
        'Espera de Dashboard anterior',
      );
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
        const transactionsLoaded = await loadTransactionsCloudData({ force, requireCloud });
        if (!transactionsLoaded) {
          setModuleState('dashboard', { status: 'error', dirty: true });
          return false;
        }
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
            return !requireCloud;
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
        dataStateRef.current = {
          ...dataStateRef.current,
          dailyLogs: nextDailyLogs,
          expenses: nextExpenses,
          pastClosures: nextClosures,
        };

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
        console.error('Error general de conexión (metrics):', error);
        const cachedSnapshot = loadOfflineDashboardSnapshot() || loadOfflineSnapshot();
        if (applyDashboardSnapshot(cachedSnapshot)) {
          setModuleState('dashboard', { status: 'loaded', dirty: false, lastLoadedAt: Date.now() });
          return !requireCloud;
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

  const loadHistoryCloudData = async ({ force = false, requireCloud = false } = {}) => {
    if (moduleLoadPromisesRef.current.history) {
      if (!force) return moduleLoadPromisesRef.current.history;
      await withTimeout(
        moduleLoadPromisesRef.current.history,
        FORCE_RELOAD_TIMEOUT_MS,
        'Espera de Historial anterior',
      );
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
            return !requireCloud;
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
        console.error('Error general de conexión (metrics):', error);
        const cachedSnapshot = loadOfflineHistorySnapshot() || loadOfflineSnapshot();
        if (applyHistorySnapshot(cachedSnapshot)) {
          setModuleState('history', { status: 'loaded', dirty: false, lastLoadedAt: Date.now() });
          return !requireCloud;
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

  const loadOrdersCloudData = async ({ force = false, requireCloud = false } = {}) => {
    if (moduleLoadPromisesRef.current.orders) {
      if (!force) return moduleLoadPromisesRef.current.orders;
      await withTimeout(
        moduleLoadPromisesRef.current.orders,
        FORCE_RELOAD_TIMEOUT_MS,
        'Espera de Pedidos anterior',
      );
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
            return !requireCloud;
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
        console.error('Error general de conexión (metrics):', error);
        const cachedSnapshot = loadOfflineOrdersSnapshot() || loadOfflineSnapshot();
        if (applyOrdersSnapshot(cachedSnapshot)) {
          setModuleState('orders', { status: 'loaded', dirty: false, lastLoadedAt: Date.now() });
          return !requireCloud;
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

  const loadReportsCloudData = async ({ force = false, requireCloud = false } = {}) => {
    if (moduleLoadPromisesRef.current.reports) {
      if (!force) return moduleLoadPromisesRef.current.reports;
      await withTimeout(
        moduleLoadPromisesRef.current.reports,
        FORCE_RELOAD_TIMEOUT_MS,
        'Espera de Reportes anterior',
      );
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
            return !requireCloud;
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
        console.error('Error general de conexión (metrics):', error);
        const cachedSnapshot = loadOfflineReportsSnapshot() || loadOfflineSnapshot();
        if (applyReportsSnapshot(cachedSnapshot)) {
          setModuleState('reports', { status: 'loaded', dirty: false, lastLoadedAt: Date.now() });
          return !requireCloud;
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

  const loadMetricsCloudData = async ({ force = false, includeTransactions = true, requireCloud = false } = {}) => {
    if (moduleLoadPromisesRef.current.metrics) {
      if (!force) return moduleLoadPromisesRef.current.metrics;
      await withTimeout(
        moduleLoadPromisesRef.current.metrics,
        FORCE_RELOAD_TIMEOUT_MS,
        'Espera de Metricas anterior',
      );
    }

    const currentState = moduleLoadStateRef.current.metrics;
    if (!force && isModuleStateFresh(currentState, MODULE_FRESHNESS_MS.metrics)) {
      return true;
    }

    const run = async () => {
      setModuleState('metrics', { status: 'loading', dirty: false });

      try {
        const payload = await fetchMetricsCloudPayload({ includeTransactions });

        if (!payload?.hasCloudConnection) {
          const cachedSnapshot =
            loadOfflineMetricsSnapshot() ||
            loadOfflineTransactionsSnapshot() ||
            loadOfflineDashboardSnapshot() ||
            loadOfflineOrdersSnapshot() ||
            loadOfflineReportsSnapshot() ||
            loadOfflineSnapshot();

          if (applyMetricsSnapshot(cachedSnapshot)) {
            setModuleState('metrics', { status: 'loaded', dirty: false, lastLoadedAt: Date.now() });
            return !requireCloud;
          }

          setModuleState('metrics', { status: 'error', dirty: true });
          return false;
        }

        applyMetricsPayload(payload);
        setIsOfflineReadOnly(false);

        const nextSnapshot = buildMetricsOfflineSnapshot(payload, dataStateRef.current);
        saveOfflineMetricsSnapshot(nextSnapshot);
        setModuleState('metrics', { status: 'loaded', dirty: false, lastLoadedAt: Date.now() });
        return true;
      } catch (error) {
        console.error('Error general de conexión (metrics):', error);
        const cachedSnapshot =
          loadOfflineMetricsSnapshot() ||
          loadOfflineTransactionsSnapshot() ||
          loadOfflineDashboardSnapshot() ||
          loadOfflineOrdersSnapshot() ||
          loadOfflineReportsSnapshot() ||
          loadOfflineSnapshot();

        if (applyMetricsSnapshot(cachedSnapshot)) {
          setModuleState('metrics', { status: 'loaded', dirty: false, lastLoadedAt: Date.now() });
          return !requireCloud;
        }

        setModuleState('metrics', { status: 'error', dirty: true });
        return false;
      } finally {
        moduleLoadPromisesRef.current.metrics = null;
      }
    };

    const promise = run();
    moduleLoadPromisesRef.current.metrics = promise;
    return promise;
  };

  const loadModuleForTab = async (tab, { force = false, requireCloud = false } = {}) => {
    switch (TAB_TO_DATA_MODULE[tab]) {
      case 'transactions':
        return loadTransactionsCloudData({ force, requireCloud });
      case 'dashboard':
        await loadCoreCloudData({ force: false });
        return loadDashboardCloudData({ force, requireCloud });
      case 'history':
        return loadHistoryCloudData({ force, requireCloud });
      case 'orders':
        return loadOrdersCloudData({ force, requireCloud });
      case 'reports':
        return loadReportsCloudData({ force, requireCloud });
      case 'metrics':
        await loadCoreCloudData({ force: false });
        return loadMetricsCloudData({
          force,
          requireCloud,
          includeTransactions:
            force ||
            !isModuleStateFresh(moduleLoadStateRef.current.transactions, MODULE_FRESHNESS_MS.transactions) ||
            !Array.isArray(dataStateRef.current.transactions) ||
            dataStateRef.current.transactions.length === 0,
        });
      default:
        return true;
    }
  };

  // ==========================================
  // 1.5 CONEXIÓN SUPABASE
  // ==========================================
  const fetchCloudData = async (showSpinner = true, { force = true, includeActiveModule = true, moduleKeys = null } = {}) => {
    if (isLocalDemoMode()) {
      await loadAppUsers({ force });
      applyLocalDemoSnapshot();
      setIsOfflineReadOnly(false);
      return;
    }

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
          await loadTransactionsCloudData({ force });
          await loadDashboardCloudData({ force });
        } else if (moduleKey === 'history') {
          await loadHistoryCloudData({ force });
        } else if (moduleKey === 'orders') {
          await loadOrdersCloudData({ force });
        } else if (moduleKey === 'reports') {
          await loadReportsCloudData({ force });
        } else if (moduleKey === 'metrics') {
          await loadMetricsCloudData({
            force,
            includeTransactions:
              force ||
              !isModuleStateFresh(moduleLoadStateRef.current.transactions, MODULE_FRESHNESS_MS.transactions) ||
              !Array.isArray(dataStateRef.current.transactions) ||
              dataStateRef.current.transactions.length === 0,
          });
        }
      }
    } catch (error) {
        console.error('Error general de conexión (metrics):', error);
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
      const cachedMetricsSnapshot = loadOfflineMetricsSnapshot();
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
      const hasMetricsSnapshot = cachedMetricsSnapshot ? applyMetricsSnapshot(cachedMetricsSnapshot) : false;
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
          hasMetricsSnapshot ||
          hasPosSnapshot ||
          hasSharedUsersSnapshot
      );
    };

    if (isLocalDemoMode()) {
      applyLocalDemoSnapshot();
      void loadAppUsers()
        .finally(() => {
          if (!disposed) {
            setIsOfflineReadOnly(false);
            setIsAuthBootLoading(false);
          }
        });

      return () => {
        disposed = true;
      };
    }

    const bootSharedUsersSnapshot = loadOfflineSharedUsersSnapshot();
    const hasBootSharedUsersSnapshot =
      bootSharedUsersSnapshot?.authMode === 'supabase' &&
      Array.isArray(bootSharedUsersSnapshot.users) &&
      bootSharedUsersSnapshot.users.length > 0;
    const hydratedFromCache = hydrateOfflineSnapshots();
    if (hydratedFromCache || isBrowserOffline()) {
      setIsOfflineReadOnly(true);
    }

    if (isBrowserOffline()) {
      setIsAuthBootLoading(false);
    } else {
      if (hasBootSharedUsersSnapshot) {
        setIsAuthBootLoading(false);
      }

      void loadCoreCloudData({ showSpinner: false });
      void loadAppUsers()
        .catch((error) => {
          if (!isRecoverableCloudError(error)) {
            console.error('No se pudieron cargar los usuarios compartidos:', error);
          }
          const recoveredFromCache = hydrateOfflineSnapshots();
          if (recoveredFromCache) setIsOfflineReadOnly(true);
        })
        .finally(() => {
          if (!disposed && !hasBootSharedUsersSnapshot) {
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
      if (sharedUsersCache.retryTimer) {
        window.clearTimeout(sharedUsersCache.retryTimer);
        sharedUsersCache.retryTimer = null;
      }
      supabase.removeChannel(channel);
      window.removeEventListener('visibilitychange', handleReSync);
      window.removeEventListener('offline', handleBrowserOffline);
      window.removeEventListener('online', handleBrowserOnline);
    };
  // Bootstrap and global browser listeners are intentionally mounted once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [currentTime, setCurrentTime] = useState(new Date());
  const [currentUser, setCurrentUser] = useState(null);
  const [currentSessionMeta, setCurrentSessionMeta] = useState(null);
  const [activeTab, setActiveTab] = useState('pos');
  const [imageImportTask, setImageImportTask] = useState(null);
  const [isImageImportTaskOpen, setIsImageImportTaskOpen] = useState(false);
  const [imageImportOpenRequest, setImageImportOpenRequest] = useState(0);
  const [userSettings, setUserSettings] = useState(() => loadUserSettings());
  const [loginTheme, setLoginTheme] = useState(() => loadLoginThemePreference());
  const [isThemeSaving, setIsThemeSaving] = useState(false);
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
  const lastLogWritePromiseRef = useRef(null);
  const localDataMutationRef = useRef({ transactions: 0 });
  const localTransactionOverridesRef = useRef(new Map());
  const pendingThemeSaveRef = useRef(null);
  const showNotificationRef = useRef(null);
  const productThumbBackfillInFlightRef = useRef(false);
  const productThumbBackfillDisabledRef = useRef(false);
  const productThumbBackfillFailedIdsRef = useRef(new Set());
  const productDetailRequestsRef = useRef(new Map());
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

  function pruneLocalTransactionOverrides() {
    const now = Date.now();
    localTransactionOverridesRef.current.forEach((entry, key) => {
      if (!entry?.expiresAt || entry.expiresAt <= now) {
        localTransactionOverridesRef.current.delete(key);
      }
    });
  }

  function applyLocalTransactionOverrides(records = []) {
    pruneLocalTransactionOverrides();

    const overrides = localTransactionOverridesRef.current;
    const sourceRecords = Array.isArray(records) ? records : [];
    if (overrides.size === 0) return sourceRecords;

    const seenIds = new Set();
    const mergedRecords = sourceRecords.map((record) => {
      const key = String(record?.id ?? '');
      if (!key) return record;
      seenIds.add(key);
      return overrides.get(key)?.transaction || record;
    });

    overrides.forEach((entry, key) => {
      if (!seenIds.has(key) && entry?.transaction) {
        mergedRecords.unshift(entry.transaction);
      }
    });

    return mergedRecords;
  }

  function rememberLocalTransactionOverride(transaction) {
    if (!transaction?.id) return;
    pruneLocalTransactionOverrides();
    localTransactionOverridesRef.current.set(String(transaction.id), {
      transaction,
      expiresAt: Date.now() + LOCAL_TRANSACTION_OVERRIDE_TTL_MS,
    });
  }

  useEffect(() => {
    if (activeTab === 'rewards') {
      setActiveTab('extras');
    }
  }, [activeTab]);

  useEffect(() => {
    saveUserSettings(userSettings);
  }, [userSettings]);

  useEffect(() => {
    saveLoginThemePreference(loginTheme);
  }, [loginTheme]);

  const currentTheme = currentUser ? (currentUser.theme === 'dark' ? 'dark' : 'light') : loginTheme;

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;

    root.dataset.theme = currentTheme;
    body.dataset.theme = currentTheme;
    root.style.colorScheme = currentTheme;
    body.style.colorScheme = currentTheme;
  }, [currentTheme]);

  const [cart, setCart] = useState([]);

  const [loginStep, setLoginStep] = useState('select');
  const [selectedUserIdForLogin, setSelectedUserIdForLogin] = useState(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [rememberLoginSession, setRememberLoginSession] = useState(false);
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
  const canUseAdminArea = hasOwnerAccess(currentUser);
  const canManageRegister = hasPermission(currentUser, 'register.manage');
  const canViewDashboard = canAccessTab(currentUser, 'dashboard');
  const canViewReports = canAccessTab(currentUser, 'reports');
  const canViewMetrics = canAccessTab(currentUser, 'metrics');
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
    if (currentUser || isAuthBootLoading || appUsers.length === 0) return;
    const rememberedSession = loadRememberedSession();
    if (!rememberedSession) return;

    const rememberedUser = appUsers.find((user) => String(user.id) === String(rememberedSession.userId));
    if (!rememberedUser || rememberedUser.isActive === false) {
      clearRememberedSession();
      return;
    }

    const restoredSession = {
      ...rememberedSession.sessionMeta,
      userId: rememberedUser.id || rememberedSession.sessionMeta.userId,
      userName: rememberedUser.displayName || rememberedUser.name || rememberedSession.sessionMeta.userName,
      role: rememberedUser.role,
      avatar: rememberedUser.avatar,
      permissionsVersion: Number(rememberedUser.permissionsVersion || rememberedSession.sessionMeta.permissionsVersion || 1),
      status: 'Activa',
      rememberedSession: true,
      expiredAt: null,
      closedAt: null,
      lastActivityAt: new Date().toISOString(),
    };

    currentUserRef.current = rememberedUser;
    currentSessionMetaRef.current = restoredSession;
    setCurrentUser(rememberedUser);
    setCurrentSessionMeta(restoredSession);
    setActiveTab(getDefaultTabForUser(rememberedUser));
    saveRememberedSession(rememberedUser, restoredSession);
  }, [appUsers, currentUser, isAuthBootLoading]);

  useEffect(() => {
    if (!currentUser) return;
    void loadModuleForTab(activeTab);
  // loadModuleForTab is intentionally read from the latest render path for tab changes only.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, currentUser]);

  useEffect(() => {
    if (activeTab !== 'user-management' || !canViewUserManagement) return;
    void loadAppUsers({ force: true, includeInactive: true });
  // User management refresh is scoped to opening that tab.
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const pendingThemeSave = pendingThemeSaveRef.current;
      const shouldSyncTheme =
        !pendingThemeSave && latestCurrentUser.theme !== currentUser.theme;

      if (
        latestCurrentUser.displayName !== currentUser.displayName ||
        latestCurrentUser.nameColor !== currentUser.nameColor ||
        latestCurrentUser.avatar !== currentUser.avatar ||
        shouldSyncTheme
      ) {
        setCurrentUser((prev) =>
          prev
            ? {
                ...prev,
                displayName: latestCurrentUser.displayName,
                name: latestCurrentUser.displayName,
                nameColor: latestCurrentUser.nameColor,
                avatar: latestCurrentUser.avatar,
                theme: shouldSyncTheme ? latestCurrentUser.theme : prev.theme,
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
  // writeLogEntry is routed through a ref inside this forced-logout watcher.
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const [expenseToEdit, setExpenseToEdit] = useState(null);

  const [detailsModalTx, setDetailsModalTx] = useState(null);

  useEffect(() => {
    if (!posSelectedClient || posSelectedClient.id === 'guest' || posSelectedClient.id === 0) return;

    const latestMember = members.find((member) => String(member.id) === String(posSelectedClient.id));
    if (!latestMember) return;

    setPosSelectedClient((current) => {
      if (!current || current.id === 'guest' || current.id === 0) return current;
      if (String(current.id) !== String(latestMember.id)) return current;
      return enrichClientWithCouponUsage({
        ...current,
        ...latestMember,
        memberNumber: latestMember.memberNumber || latestMember.member_number || current.memberNumber,
        created_at: latestMember.created_at || latestMember.createdAt || current.created_at || null,
        createdAt: latestMember.createdAt || latestMember.created_at || current.createdAt || null,
      });
    });
  }, [members]);

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
  const [posGridColumns, setPosGridColumns] = useState(6);
  const [inventoryGridColumns, setInventoryGridColumns] = useState(6);

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

  const blockIfOfflineReadonly = (actionLabel = 'realizar cambios') => {
    if (isLocalDemoMode()) return false;
    if (!isOfflineReadOnly) return false;
    showNotification(
      'info',
      'Modo sin conexión',
      `Sin internet podés seguir consultando datos, pero no ${actionLabel}.`
    );
    return true;
  };

  const handleReconnectCloud = async () => {
    if (isLocalDemoMode()) {
      showNotification('info', 'Modo demo local', 'Este modo no se conecta a Supabase. Salí con ?demo=0 para volver a la nube.');
      return;
    }

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
      showNotification('success', 'Reconectado', 'Se conectó la base de datos correctamente.');
    } catch (error) {
      console.error('No se pudo reconectar:', error);
      setIsOfflineReadOnly(true);
      showNotification(
        'warning',
        'No se pudo reconectar',
        getCloudReconnectErrorMessage(error)
      );
    } finally {
      setIsReconnectAttempting(false);
    }
  };

  const handleSoftReload = async () => {
    if (isSoftReloading) return;

    if (isLocalDemoMode()) {
      applyLocalDemoSnapshot();
      showNotification('info', 'Modo demo local', 'Se reiniciaron los datos demo locales.');
      return;
    }

    if (isOfflineReadOnly) {
      await handleReconnectCloud();
      return;
    }

    setIsSoftReloading(true);
    try {
      const moduleKey = TAB_TO_DATA_MODULE[activeTabRef.current];
      if (moduleKey) {
        await loadModuleForTab(activeTabRef.current, { force: true });
      } else {
        await loadCoreCloudData({ showSpinner: false, force: true });
      }
      showNotification(
        'success',
        'Actualizado',
        moduleKey ? 'Se recargo el modulo visible.' : 'Se recargaron los datos base.'
      );
    } catch (error) {
      console.error('No se pudo actualizar manualmente:', error);
      showNotification(
        'error',
        'No se pudo actualizar',
        error?.message || 'La nube no respondio. Podes intentar una recarga total.'
      );
    } finally {
      setIsSoftReloading(false);
    }
  };
  const handleForceReload = async () => {
    if (isForceReloading || isSoftReloading) return;

    if (isLocalDemoMode()) {
      applyLocalDemoSnapshot();
      showNotification('info', 'Modo demo local', 'Se reiniciaron los datos demo locales.');
      return;
    }

    setIsForceReloading(true);
    try {
      const isReachable = await verifyCloudConnection();
      if (!isReachable) {
        throw new Error('Windows informa que no hay conexion disponible.');
      }

      void loadAppUsers({ force: true, includeInactive: activeTabRef.current === 'user-management' }).catch((error) => {
        console.warn('No se pudieron refrescar usuarios durante la recarga total. Seguimos con cache local.', error);
      });

      const coreLoaded = await withTimeout(
        loadCoreCloudData({ showSpinner: false, force: true, requireCloud: true }),
        FORCE_RELOAD_TIMEOUT_MS,
        'Recarga de datos base',
      );
      if (!coreLoaded) {
        throw new Error('No se pudieron actualizar los datos base desde la nube.');
      }

      const moduleLoaded = await withTimeout(
        loadModuleForTab(activeTabRef.current, { force: true, requireCloud: true }),
        FORCE_RELOAD_TIMEOUT_MS,
        'Recarga del modulo visible',
      );
      if (!moduleLoaded) {
        throw new Error('Los datos base se actualizaron, pero fallo el modulo visible.');
      }

      setIsOfflineReadOnly(false);
      showNotification('success', 'Base actualizada', 'Se recargaron datos base y el modulo visible. Usuarios se actualiza en segundo plano.');
    } catch (error) {
      console.error('No se pudo completar la recarga total:', error);
      if (isRecoverableCloudError(error)) {
        setIsOfflineReadOnly(true);
      }
      showNotification(
        'error',
        'No se pudo recargar la base',
        getCloudReconnectErrorMessage(error),
      );
    } finally {
      setIsForceReloading(false);
    }
  };

  useEffect(() => {
    const handleAppReloadShortcut = (event) => {
      if (event.key !== 'F5') return;

      event.preventDefault();

      if (event.ctrlKey) {
        void handleForceReload();
        return;
      }

      handleSoftReload();
    };

    window.addEventListener('keydown', handleAppReloadShortcut);
    return () => window.removeEventListener('keydown', handleAppReloadShortcut);
  // Keyboard shortcut listener is registered once and calls the current soft reload path.
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const compactedDetails = compactLogDetailsForStorage(normalizedDetails);

    const newLog = {
      id: Date.now(),
      timestamp: formatTimeFullAR(now),
      date: formatDateAR(now),
      action,
      user: actor.userName,
      details: compactedDetails,
      reason,
      created_at: new Date().toISOString()
    };
    
    newLog.isTest = shouldIgnoreNestedTestDetectionForLog(action)
      ? Boolean(compactedDetails?.isTest || compactedDetails?.testMarker === 'test')
      : isTestRecord({ action, details: compactedDetails, reason });
    setDailyLogs((prev) => [newLog, ...prev].slice(0, DASHBOARD_LOG_LIMIT));
    if (HISTORY_LOG_ACTIONS.includes(action)) {
      upsertLocalHistoryLog(newLog);
    }

    if (skipCloud || isLocalDemoMode() || isBrowserOffline()) {
      if (!isLocalDemoMode()) {
        setIsOfflineReadOnly(true);
      }
      return newLog;
    }

    try {
      await withTimeout(
        insertWithSchemaFallback('logs', {
          action,
          details: compactedDetails,
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

    return newLog;
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

    const logWritePromise = writeLogEntry({
      action,
      details,
      reason: finalReason,
    });
    lastLogWritePromiseRef.current = logWritePromise;
    await logWritePromise;
  };

  const buildSessionMeta = async (user) => {
    const now = new Date();
    const deviceInfo = await getSessionDeviceInfo();

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
    supabase.auth.signOut().catch(() => {});
    clearRememberedSession();
    currentSessionMetaRef.current = null;
    currentUserRef.current = null;
    setCurrentSessionMeta(null);
    setCurrentUser(null);
    setCart([]);
    setPosSelectedClient(null);
    setLoginStep('select');
    setSelectedUserIdForLogin(null);
    setPasswordInput('');
    setRememberLoginSession(false);
    setLoginError('');
  };

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
      snapshot: {
        config,
        date: dateStr,
        itemCount: items.length,
        compact: true,
      },
      snapshotStored: false,
      note: 'Snapshot completo omitido para reducir uso de base de datos.',
    };

    addLog('Exportación PDF', logDetails, 'Exportación de catálogo');

    const defaultTitle = config.documentTitle 
      ? `${config.documentTitle} - ${config.clientName || 'Cliente'}` 
      : 'Reporte Interno';

    const safeName = defaultTitle.replace(/[^a-zA-Z0-9 _-]/g, '');

    setTimeout(async () => {
      try {
        if (window.electronAPI?.saveAsPdf) {
          const result = await window.electronAPI.saveAsPdf(`${safeName}.pdf`);

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

    if (!Array.isArray(logDetails.snapshot.items)) {
      showNotification(
        'info',
        'PDF no disponible',
        'Este registro fue guardado en modo liviano para no llenar la base de datos.',
      );
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
        if (window.electronAPI?.saveAsPdf) {
          const result = await window.electronAPI.saveAsPdf(`${safeName}.pdf`);
          
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
        member_id: toOptionalDbId(budgetData.memberId),
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
        member_id: toOptionalDbId(budgetData.memberId),
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

      if (isCrossingToFullyPaid && !wasStockReserved) {
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
        member_id: toOptionalDbId(orderPreview.memberId),
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

      const orderLog = await addLog(
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
      setTransactions((prev) => {
        const next = (prev || []).map((tx) =>
          String(tx.orderId || '') === String(id)
            ? {
                ...tx,
                orderId: id,
                budgetId: updatedOrder.budgetId || tx.budgetId || null,
                total: Number(updatedOrder.totalAmount || tx.total || 0),
                items: buildOrderLogItems(updatedOrder.itemsSnapshot || []),
                stockChanges: finalizedSale?.stockChanges || reservationChanges || tx.stockChanges || [],
              }
            : tx
        );
        dataStateRef.current = { ...dataStateRef.current, transactions: next };
        return next;
      });
      localDataMutationRef.current.transactions = Date.now();
      setModuleState('transactions', (prev) => ({ ...prev, dirty: true }));
      if (orderLog) upsertLocalHistoryLog(orderLog);
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
      isTemporary: Boolean(item.isTemporary || item.is_custom || (!item.productId && !item.isCombo)),
      product_type: item.product_type || 'quantity',
    }));

  const getOrderStockProductId = (item) => item?.productId || item?.product_id || item?.id || null;

  const shouldSkipOrderStockProductId = (id) => {
    if (!id) return true;
    const normalizedId = String(id);
    if (['null', 'undefined'].includes(normalizedId)) return true;
    return ['temp-', 'custom_', 'desc_', 'discount_', 'combo_', 'reward_'].some((prefix) =>
      normalizedId.startsWith(prefix)
    );
  };

  const getOrderStockQuantity = (item, fallback = 0) => {
    const value = Number(item?.qty ?? item?.quantity ?? fallback);
    if (Number.isFinite(value) && value > 0) return value;
    return Number(fallback || 0);
  };

  const buildOrderRequiredStock = (items = []) =>
    items.reduce((acc, item) => {
      if (item?.isDiscount || item?.type === 'discount') return acc;

      if (item?.isCombo) {
        const comboQty = getOrderStockQuantity(item, 1) || 1;
        const includedItems = Array.isArray(item.productsIncluded) ? item.productsIncluded : [];
        includedItems.forEach((includedItem) => {
          const includedId = getOrderStockProductId(includedItem);
          if (shouldSkipOrderStockProductId(includedId)) return;
          const defaultIncludedQty = includedItem?.product_type === 'weight' ? 1000 : 1;
          const includedQty = getOrderStockQuantity(includedItem, defaultIncludedQty) || defaultIncludedQty;
          acc[String(includedId)] = (acc[String(includedId)] || 0) + includedQty * comboQty;
        });
        return acc;
      }

      const productId = getOrderStockProductId(item);
      if (item.isTemporary || shouldSkipOrderStockProductId(productId)) return acc;
      const nextQty = getOrderStockQuantity(item, 0);
      if (nextQty <= 0) return acc;
      acc[String(productId)] = (acc[String(productId)] || 0) + nextQty;
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

  const applyProductStockDeltaCloud = async (product, delta) => {
    const numericDelta = Number(delta || 0);
    if (!product || !numericDelta) return Number(product?.stock || 0);

    if (await canUseAuthenticatedTransactionRpcs()) {
      const rpcResult = await supabase.rpc('apply_product_stock_delta', {
        p_product_id: product.id,
        p_delta: numericDelta,
      });

      if (!rpcResult.error) {
        return Number(rpcResult.data ?? Number(product.stock || 0) + numericDelta);
      }

      const rpcErrorText = [
        rpcResult.error?.message,
        rpcResult.error?.details,
        rpcResult.error?.hint,
        rpcResult.error?.code,
      ].filter(Boolean).join(' ');

      if (!/apply_product_stock_delta|function .* does not exist|schema cache|PGRST202|permission denied|42501/i.test(rpcErrorText)) {
        throw rpcResult.error;
      }
    }

    const fallbackStock = Number(product.stock || 0) + numericDelta;
    const { error: stockErr } = await supabase
      .from('products')
      .update({ stock: fallbackStock })
      .eq('id', product.id);
    if (stockErr) throw stockErr;
    return fallbackStock;
  };

  const isTransactionalSaleRpcUnavailable = (error) => {
    const errorText = [
      error?.message,
      error?.details,
      error?.hint,
      error?.code,
    ].filter(Boolean).join(' ');

    return /register_sale_transaction|edit_sale_transaction|void_sale_transaction|function .* does not exist|schema cache|PGRST202|permission denied|42501/i.test(errorText);
  };

  const registerSaleTransactionCloud = async ({
    salePayload,
    itemsPayload,
    stockDeltaByProduct,
    clientPointUpdates = [],
  }) => {
    if (isLocalDemoMode()) return null;
    if (!(await canUseAuthenticatedTransactionRpcs())) return null;

    const { data, error } = await supabase.rpc('register_sale_transaction', {
      p_sale: { ...salePayload, status: salePayload.status || 'completed' },
      p_items: itemsPayload,
      p_stock_deltas: stockDeltaByProduct || {},
      p_client_points: clientPointUpdates,
    });

    if (error) {
      if (isTransactionalSaleRpcUnavailable(error)) return null;
      throw error;
    }

    const saleId = data?.id || data?.sale_id || (Array.isArray(data) ? data[0]?.id : null);
    if (!saleId) throw new Error('La RPC register_sale_transaction no devolvio el id de la venta.');
    return { id: saleId };
  };

  const editSaleTransactionCloud = async ({
    saleId,
    salePatch,
    itemsPayload,
    stockDeltaByProduct,
    clientPointUpdates = [],
  }) => {
    if (isLocalDemoMode()) return null;
    if (!(await canUseAuthenticatedTransactionRpcs())) return null;

    const { data, error } = await supabase.rpc('edit_sale_transaction', {
      p_sale_id: String(saleId),
      p_sale_patch: salePatch,
      p_items: itemsPayload,
      p_stock_deltas: stockDeltaByProduct || {},
      p_client_points: clientPointUpdates,
    });

    if (error) {
      if (isTransactionalSaleRpcUnavailable(error)) return null;
      throw error;
    }

    const editedSaleId = data?.id || data?.sale_id || (Array.isArray(data) ? data[0]?.id : null);
    if (!editedSaleId) throw new Error('La RPC edit_sale_transaction no devolvio el id de la venta.');
    return { id: editedSaleId };
  };

  const voidSaleTransactionCloud = async ({
    saleId,
    voidedAt,
    stockDeltaByProduct,
    clientPointUpdates = [],
  }) => {
    if (isLocalDemoMode()) return null;
    if (!(await canUseAuthenticatedTransactionRpcs())) return null;

    const { data, error } = await supabase.rpc('void_sale_transaction', {
      p_sale_id: String(saleId),
      p_voided_at: voidedAt,
      p_stock_deltas: stockDeltaByProduct || {},
      p_client_points: clientPointUpdates,
    });

    if (error) {
      if (isTransactionalSaleRpcUnavailable(error)) return null;
      throw error;
    }

    const voidedSaleId = data?.id || data?.sale_id || (Array.isArray(data) ? data[0]?.id : null);
    if (!voidedSaleId) throw new Error('La RPC void_sale_transaction no devolvio el id de la venta.');
    return { id: voidedSaleId };
  };

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

    if (!isLocalDemoMode()) {
      for (const [id, delta] of entries) {
        const product = inventory.find((entry) => String(entry.id) === String(id));
        if (!product) continue;
        try {
          await applyProductStockDeltaCloud(product, delta);
        } catch (stockErr) {
          throw new Error(`Fallo actualizando stock de ${product.title}: ${stockErr.message}`);
        }
      }
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

  const getSaleStockProductId = (item) => item?.productId || item?.product_id || item?.id || null;

  const getSaleItemDatabaseProductId = (item = {}) => {
    if (
      item.isCustom ||
      item.is_custom ||
      item.isTemporary ||
      item.isCombo ||
      item.is_combo ||
      item.isDiscount ||
      item.is_discount ||
      item.isReward ||
      item.is_reward
    ) {
      return null;
    }

    return toOptionalDbId(item.productId || item.product_id || item.id || null);
  };

  const sanitizeSaleItemProductIds = async (itemsPayload = []) => {
    const safeItems = Array.isArray(itemsPayload) ? itemsPayload : [];
    const candidateIds = Array.from(new Set(
      safeItems
        .map((item) => toOptionalDbId(item?.product_id))
        .filter((id) => id !== null && id !== undefined)
        .map(String)
    ));

    if (candidateIds.length === 0) return safeItems;

    let validIds;
    if (isLocalDemoMode()) {
      validIds = new Set(
        inventory
          .map((product) => product?.id)
          .filter((id) => id !== null && id !== undefined)
          .map(String)
      );
    } else {
      const { data, error } = await supabase
        .from('products')
        .select('id')
        .in('id', candidateIds);

      if (error) {
        throw new Error(`No se pudieron validar los productos de la venta: ${error.message}`);
      }

      validIds = new Set((data || []).map((product) => String(product.id)));
    }

    return safeItems.map((item) => {
      const normalizedId = toOptionalDbId(item?.product_id);
      if (normalizedId === null || normalizedId === undefined) return item;
      return validIds.has(String(normalizedId))
        ? item
        : { ...item, product_id: null };
    });
  };

  const getSaleItemUnitCost = (item = {}) =>
    Number(
      item.cost ??
        item.unitCost ??
        item.unit_cost ??
        item.purchasePrice ??
        item.purchase_price ??
        item.costPrice ??
        item.cost_price ??
        0
    ) || 0;

  const getSaleItemCostPayload = (item = {}) => {
    const unitCost = getSaleItemUnitCost(item);
    return {
      cost: unitCost,
      is_custom: Boolean(item.isCustom || item.is_custom || item.isTemporary),
      is_discount: Boolean(item.isDiscount || item.is_discount),
      is_combo: Boolean(item.isCombo || item.is_combo),
    };
  };

  const getSaleItemSnapshotCost = (item = {}) => {
    const unitCost = getSaleItemUnitCost(item);
    return {
      cost: unitCost,
      unitCost,
      purchasePrice: unitCost,
      costSource: item.costSource || item.cost_source || null,
    };
  };

  const shouldSkipSaleStockProductId = (id) => {
    if (!id) return true;
    const normalizedId = String(id);
    if (['null', 'undefined'].includes(normalizedId)) return true;
    return ['custom_', 'desc_', 'discount_', 'combo_', 'reward_'].some((prefix) =>
      normalizedId.startsWith(prefix)
    );
  };

  const isSaleStockIgnoredItem = (item) =>
    Boolean(
      item?.isReward ||
      item?.isDiscount ||
      item?.type === 'discount' ||
      (!item?.isCombo && (item?.isCustom || item?.isTemporary))
    );

  const getSaleStockQuantity = (item, fallback = 0) => {
    const value = Number(item?.quantity ?? item?.qty ?? fallback);
    if (Number.isFinite(value) && value > 0) return value;
    return Number(fallback || 0);
  };

  const buildSaleRequiredStock = (items = []) =>
    (items || []).reduce((acc, item) => {
      if (item?.isCombo) {
        const comboQuantity = getSaleStockQuantity(item, 1) || 1;
        const includedItems = Array.isArray(item.productsIncluded) ? item.productsIncluded : [];
        includedItems.forEach((includedItem) => {
          const includedId = getSaleStockProductId(includedItem);
          if (shouldSkipSaleStockProductId(includedId)) return;
          const defaultIncludedQty = includedItem?.product_type === 'weight' ? 1000 : 1;
          const includedQuantity = getSaleStockQuantity(includedItem, defaultIncludedQty) || defaultIncludedQty;
          acc[String(includedId)] = (acc[String(includedId)] || 0) + includedQuantity * comboQuantity;
        });
        return acc;
      }

      if (isSaleStockIgnoredItem(item)) return acc;

      const productId = getSaleStockProductId(item);
      if (shouldSkipSaleStockProductId(productId)) return acc;
      const quantity = getSaleStockQuantity(item, 0);
      if (quantity <= 0) return acc;
      acc[String(productId)] = (acc[String(productId)] || 0) + quantity;
      return acc;
    }, {});

  const buildSaleStockDelta = (requiredStock = {}, multiplier = -1) =>
    Object.entries(requiredStock).reduce((acc, [id, qty]) => {
      const delta = Number(qty || 0) * Number(multiplier || 0);
      if (delta !== 0 && !shouldSkipSaleStockProductId(id)) {
        acc[String(id)] = (acc[String(id)] || 0) + delta;
      }
      return acc;
    }, {});

  const buildSaleStockDiffDelta = (previousRequired = {}, nextRequired = {}) => {
    const deltaByProduct = {};
    const allIds = new Set([...Object.keys(previousRequired), ...Object.keys(nextRequired)]);
    allIds.forEach((id) => {
      const previousQty = Number(previousRequired[id] || 0);
      const nextQty = Number(nextRequired[id] || 0);
      const delta = previousQty - nextQty;
      if (delta !== 0) {
        deltaByProduct[String(id)] = delta;
      }
    });
    return deltaByProduct;
  };

  const buildSaleProductChanges = (previousRequired = {}, nextRequired = {}) => {
    const allIds = new Set([...Object.keys(previousRequired), ...Object.keys(nextRequired)]);
    return Array.from(allIds)
      .map((id) => {
        const oldQty = Number(previousRequired[id] || 0);
        const newQty = Number(nextRequired[id] || 0);
        if (oldQty === newQty) return null;
        const product = inventory.find((entry) => String(entry.id) === String(id));
        return {
          id,
          productId: product?.id || id,
          title: product?.title || `Producto #${id}`,
          product_type: product?.product_type || 'quantity',
          oldQty,
          newQty,
          diff: newQty - oldQty,
        };
      })
      .filter(Boolean);
  };

  const getSaleStockDeltaPreview = (deltaByProduct = {}) => {
    const entries = Object.entries(deltaByProduct).filter(([, delta]) => Number(delta || 0) !== 0);
    if (entries.length === 0) return { stockChanges: [], stockIssues: [] };

    const stockIssues = entries
      .map(([id, delta]) => {
        const product = inventory.find((entry) => String(entry.id) === String(id));
        if (!product) return `Producto #${id} (ya no existe en inventario)`;
        const stockBefore = Number(product.stock || 0);
        const stockAfter = stockBefore + Number(delta || 0);
        if (stockAfter < 0) {
          return `${product.title} (faltan ${Math.abs(stockAfter)})`;
        }
        return null;
      })
      .filter(Boolean);

    const stockChanges = entries
      .map(([id, delta]) => {
        const product = inventory.find((entry) => String(entry.id) === String(id));
        if (!product) return null;
        const numericDelta = Number(delta || 0);
        const stockBefore = Number(product.stock || 0);
        const quantityChanged = Math.abs(numericDelta);
        return {
          productId: product.id,
          title: product.title,
          product_type: product.product_type || 'quantity',
          quantityChanged,
          quantitySold: numericDelta < 0 ? quantityChanged : 0,
          quantityRestored: numericDelta > 0 ? quantityChanged : 0,
          stockBefore,
          stockAfter: stockBefore + numericDelta,
        };
      })
      .filter(Boolean);

    return { stockChanges, stockIssues };
  };

  const applySaleStockDelta = async (deltaByProduct = {}) => {
    const entries = Object.entries(deltaByProduct).filter(([, delta]) => Number(delta || 0) !== 0);
    if (entries.length === 0) return { stockChanges: [], stockIssues: [] };

    const preview = getSaleStockDeltaPreview(deltaByProduct);
    if (preview.stockIssues.length > 0) {
      return preview;
    }

    if (!isLocalDemoMode()) {
      for (const [id, delta] of entries) {
        const product = inventory.find((entry) => String(entry.id) === String(id));
        if (!product) continue;
        try {
          await applyProductStockDeltaCloud(product, delta);
        } catch (stockErr) {
          throw new Error(`Fallo actualizando stock de ${product.title}: ${stockErr.message}`);
        }
      }
    }

    setInventory((prev) =>
      prev.map((product) => {
        const delta = deltaByProduct[String(product.id)];
        return delta ? { ...product, stock: Number(product.stock || 0) + Number(delta || 0) } : product;
      })
    );

    return { stockChanges: preview.stockChanges, stockIssues: [] };
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
      isCombo: Boolean(item.isCombo),
      isDiscount: Boolean(item.isDiscount),
      isCustom: Boolean(item.isTemporary && !item.isCombo && !item.isDiscount),
      originalOfferId: item.originalOfferId || null,
      productsIncluded: Array.isArray(item.productsIncluded) ? item.productsIncluded : [],
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
    const clientId = toOptionalDbId(orderRecord.memberId);
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
      user_id: toOptionalDbId(actor.userId),
      user_role: actor.userRole,
      user_name: actor.userName,
    }, 'id');

    if (saleErr) throw saleErr;

    const itemsPayload = await sanitizeSaleItemProductIds(items.map((item) => ({
      sale_id: sale.id,
      product_id: getSaleItemDatabaseProductId(item),
      product_title: item.title,
      quantity: item.qty,
      price: item.newPrice,
      subtotal:
        Number(item.newPrice || 0) *
        (item.product_type === 'weight'
          ? Number(item.qty || 0) / 1000
          : Number(item.qty || 0)),
      is_reward: false,
      product_type: item.product_type || 'quantity',
      ...getSaleItemCostPayload(item),
    })));

    await insertRowsWithSchemaFallback('sale_items', itemsPayload);

    let stockChanges = [];
    if (!skipStockDeduction) {
      const deltaByProduct = Object.fromEntries(
        Object.entries(requiredStock).map(([id, qty]) => [id, -Number(qty || 0)])
      );
      const { stockChanges: appliedStockChanges, stockIssues: finalizeStockIssues } =
        await applyOrderStockDelta(deltaByProduct);
      if (finalizeStockIssues.length > 0) {
        throw new Error(`No hay stock suficiente para completar el pedido: ${finalizeStockIssues.join(', ')}`);
      }
      stockChanges = appliedStockChanges.map((change) => ({
        ...change,
        quantitySold: change.quantityReserved || change.quantityChanged || 0,
      }));
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

    const now = new Date();
    const historyItems = items.map((item) => ({
      id: item.productId || item.id,
      productId: item.productId || null,
      title: item.title,
      quantity: item.qty,
      qty: item.qty,
      price: item.newPrice,
      subtotal:
        Number(item.newPrice || 0) *
        (item.product_type === 'weight'
          ? Number(item.qty || 0) / 1000
          : Number(item.qty || 0)),
      isReward: false,
      product_type: item.product_type || 'quantity',
      isCombo: Boolean(item.isCombo),
      isDiscount: Boolean(item.isDiscount),
      isCustom: Boolean(item.isTemporary && !item.isCombo && !item.isDiscount),
      originalOfferId: item.originalOfferId || null,
      productsIncluded: Array.isArray(item.productsIncluded) ? item.productsIncluded : [],
      category: item.category || null,
      ...getSaleItemSnapshotCost(item),
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
    upsertLocalTransaction(tx);

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
        isDiscount: Boolean(item.isDiscount),
        type: item.isDiscount ? 'discount' : undefined,
        product_type: item.product_type || 'quantity',
        isCustom: Boolean(item.isCustom),
        isCombo: Boolean(item.isCombo),
        originalOfferId: item.originalOfferId || null,
        productsIncluded: Array.isArray(item.productsIncluded) ? item.productsIncluded : [],
        ...getSaleItemSnapshotCost(item),
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
        member_id: toOptionalDbId(budgetRecord.memberId),
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

      if (isFirstPayment || (isCrossingToFullyPaid && !wasStockReserved)) {
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
      maxUsesPerClient: offerLike.maxUsesPerClient || '',
      receivedCodeExpiresAfter:
        offerLike.receivedCodeExpiresAfter && typeof offerLike.receivedCodeExpiresAfter === 'object'
          ? offerLike.receivedCodeExpiresAfter
          : { value: '', unit: 'days' },
      requiresClient: Boolean(offerLike.requiresClient || Number(offerLike.maxUsesPerClient || 0) > 0),
      stackable: offerLike.stackable !== false,
      globalUsageLimit: offerLike.globalUsageLimit || '',
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
        createdBy: data.created_by,
        maxUsesPerClient: offerData.maxUsesPerClient || '',
        receivedCodeExpiresAfter:
          offerData.receivedCodeExpiresAfter && typeof offerData.receivedCodeExpiresAfter === 'object'
            ? offerData.receivedCodeExpiresAfter
            : { value: '', unit: 'days' },
        requiresClient: Boolean(offerData.requiresClient || Number(offerData.maxUsesPerClient || 0) > 0),
        stackable: offerData.stackable !== false,
        globalUsageLimit: offerData.globalUsageLimit || '',
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
        user_id: toOptionalDbId(actor.userId),
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
      setExpenses((prev) => {
        const next = [newExpense, ...(prev || [])];
        dataStateRef.current = { ...dataStateRef.current, expenses: next };
        return next;
      });
      
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

  const handleUpdateExpense = async (expenseId, expenseData) => {
    if (!hasPermission(currentUser, 'extras.expenses.manage')) {
      showNotification('error', 'Sin permiso', 'No tenes permiso para editar gastos.');
      return null;
    }
    if (blockIfOfflineReadonly('editar gastos')) return null;

    try {
      const currentExpense = expenses.find((expense) => String(expense.id) === String(expenseId)) || expenseToEdit || {};
      const userTypedNote = expenseData.note || '';
      const safeDescription = userTypedNote || expenseData.description || currentExpense.description || 'Gasto General';
      const safeAmount = Number(expenseData.amount) || 0;

      if (!expenseId || safeAmount <= 0) return null;

      const payload = {
        description: safeDescription,
        amount: safeAmount,
        category: expenseData.category || currentExpense.category || 'Varios',
        payment_method: expenseData.paymentMethod || currentExpense.paymentMethod || 'Efectivo',
      };

      const { data } = await updateWithSchemaFallback('expenses', expenseId, payload, CLOUD_SELECTS.expenses);
      if (!data?.id) throw new Error('Supabase no devolvio el gasto editado.');

      const [updatedExpense] = mapExpenseRecords([{
        ...currentExpense,
        ...data,
        description: data.description || payload.description,
        amount: data.amount ?? payload.amount,
        category: data.category || payload.category,
        payment_method: data.payment_method || payload.payment_method,
        created_at: data.created_at || currentExpense.created_at || currentExpense.createdAt || new Date().toISOString(),
        user_name: data.user_name || currentExpense.user,
        user_id: data.user_id || currentExpense.userId || null,
        user_role: data.user_role || currentExpense.userRole || null,
      }]);

      setExpenses((prev) => {
        const next = (prev || []).map((expense) => (
          String(expense.id) === String(expenseId)
            ? { ...expense, ...updatedExpense }
            : expense
        ));
        dataStateRef.current = { ...dataStateRef.current, expenses: next };
        return next;
      });

      await addLog(
        'Gasto Editado',
        {
          id: updatedExpense.id,
          previous: {
            description: currentExpense.description,
            amount: currentExpense.amount,
            category: currentExpense.category,
            paymentMethod: currentExpense.paymentMethod,
          },
          next: {
            description: updatedExpense.description,
            amount: updatedExpense.amount,
            category: updatedExpense.category,
            paymentMethod: updatedExpense.paymentMethod,
          },
        },
        'Edicion de gasto'
      );

      showNotification('success', 'Gasto Actualizado', 'Los cambios se guardaron correctamente.');
      return updatedExpense;
    } catch (e) {
      console.error(e);
      showNotification('error', 'Error', getCloudErrorMessage(e, 'No se pudo actualizar el gasto.'));
      return null;
    }
  };

  const handleAddMemberWithLog = async (data) => {
    if (blockIfOfflineReadonly('crear socios')) return;
    try {
       const normalizedData = {
         ...data,
         name: String(data?.name || '').trim(),
         dni: data?.dni?.trim() || null,
         phone: data?.phone?.trim() || null,
         email: data?.email?.trim() || null,
         extraInfo: data?.extraInfo?.trim() || '',
         points: Number(data?.points) || 0,
         instagramHandle: normalizeInstagramHandle(data?.instagramHandle || data?.instagram_handle || ''),
         instagramConnected: Boolean(data?.instagramConnected || data?.instagram_connected),
         instagramNotes: String(data?.instagramNotes || data?.instagram_notes || '').trim(),
       };

       if (!normalizedData.name) {
         showNotification('error', 'Nombre requerido', 'El nombre del socio no puede quedar vacío.');
         return null;
       }

       const getHighestKnownMemberNumber = (memberList = []) =>
         (Array.isArray(memberList) ? memberList : []).reduce((maxNumber, member) => {
           const memberNumber = Number(member?.memberNumber ?? member?.member_number ?? 0);
           return Number.isFinite(memberNumber) ? Math.max(maxNumber, memberNumber) : maxNumber;
         }, 0);

       const getNextMemberNumber = async () => {
         const localNextNumber = getHighestKnownMemberNumber(members) + 1;
         if (isLocalDemoMode()) return localNextNumber;

         try {
           const { data: latestClient, error } = await supabase
             .from('clients')
             .select('member_number')
             .not('member_number', 'is', null)
             .order('member_number', { ascending: false })
             .limit(1)
             .maybeSingle();

           if (error) throw error;

           const cloudNextNumber = Number(latestClient?.member_number || 0) + 1;
           return Math.max(localNextNumber, cloudNextNumber || 1);
         } catch (error) {
           console.warn('No se pudo consultar el ultimo numero de socio; usando cache local.', error);
           return localNextNumber;
         }
       };

       const isMemberNumberDuplicateError = (error) => {
         const errorText = [
           error?.message,
           error?.details,
           error?.hint,
           error?.code,
         ].filter(Boolean).join(' ').toLowerCase();

         return error?.code === '23505' && /member[_\s-]?number|clients_member/.test(errorText);
       };

       const duplicatedName = members.some((member) =>
         normalizeMemberName(member?.name) === normalizeMemberName(normalizedData.name)
       );

       if (duplicatedName && !normalizedData.dni) {
         showNotification('error', 'Socio duplicado', 'Socio duplicado, elegir otro nombre o introducir DNI.');
         return null;
       }

       const socialConnections = buildSocialConnectionsWithInstagram(
         getSocialConnections(data),
         {
           handle: normalizedData.instagramHandle,
           isConnected: normalizedData.instagramConnected,
           notes: normalizedData.instagramNotes,
           source: 'manual',
         },
       );

       const firstMemberNumber = await getNextMemberNumber();
       let newClient = null;
       let memberNum = firstMemberNumber;
       const maxMemberNumberAttempts = 5;

       for (let attempt = 0; attempt < maxMemberNumberAttempts; attempt += 1) {
         memberNum = firstMemberNumber + attempt;
         const payload = {
           name: normalizedData.name,
           dni: normalizedData.dni,
           phone: normalizedData.phone,
           email: normalizedData.email,
           extraInfo: normalizedData.extraInfo,
           social_connections: socialConnections,
           points: normalizedData.points,
           member_number: memberNum
         };

         try {
           const insertResult = await insertWithSchemaFallback('clients', payload, CLOUD_SELECTS.clients);
           newClient = insertResult.data;
           break;
         } catch (insertError) {
           if (isMemberNumberDuplicateError(insertError) && attempt < maxMemberNumberAttempts - 1) {
             continue;
           }
           throw insertError;
         }
       }

       if (!newClient?.id) throw new Error('Supabase no devolvio el socio creado.');
       
       const clientFormatted = {
         ...newClient,
         memberNumber: newClient.member_number,
         extraInfo: newClient.extraInfo || normalizedData.extraInfo || '',
         socialConnections: newClient.social_connections || socialConnections,
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
       
       addLog('Nuevo Socio', {
         name: clientFormatted.name,
         number: clientFormatted.memberNumber,
         instagram: formatInstagramHandle(normalizedData.instagramHandle) || undefined,
         instagramConnected: normalizedData.instagramConnected || undefined,
       }, normalizedData.extraInfo || 'Registro manual');
       
       showNotification('success', 'Socio Creado', `#${memberNum}`);
       return clientFormatted;
    } catch (e) { 
       console.error(e);
       const constraint = String(e?.message || e?.details || e?.hint || '').toLowerCase();
       if (constraint.includes('member_number') || constraint.includes('clients_member')) {
         showNotification('error', 'N° Socio duplicado', 'No se pudo reservar un numero de socio libre. Intenta nuevamente.');
       } else if (constraint.includes('clients_dni_key')) {
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
        instagramHandle:
          updates.instagramHandle !== undefined
            ? normalizeInstagramHandle(updates.instagramHandle)
            : updates.instagramHandle,
        instagramConnected:
          updates.instagramConnected !== undefined
            ? Boolean(updates.instagramConnected)
            : updates.instagramConnected,
        instagramNotes:
          updates.instagramNotes !== undefined
            ? String(updates.instagramNotes || '').trim()
            : updates.instagramNotes,
      };

      if (normalizedInput.name !== undefined && !normalizedInput.name) {
        showNotification('error', 'Nombre requerido', 'El nombre del socio no puede quedar vacío.');
        return null;
      }

      const oldMember = members.find(m => m.id === id) || {};
      const effectiveName = normalizedInput.name !== undefined ? normalizedInput.name : oldMember.name;
      const effectiveDni = normalizedInput.dni !== undefined ? normalizedInput.dni : oldMember.dni;
      const duplicatedName = members.some((member) =>
        String(member?.id) !== String(id) &&
        normalizeMemberName(member?.name) === normalizeMemberName(effectiveName)
      );

      if (duplicatedName && !effectiveDni) {
        showNotification('error', 'Socio duplicado', 'Socio duplicado, elegir otro nombre o introducir DNI.');
        return null;
      }
      
      const dbUpdates = {};
      if (normalizedInput.name !== undefined) dbUpdates.name = normalizedInput.name;
      
      if (normalizedInput.dni !== undefined) dbUpdates.dni = normalizedInput.dni;
      if (normalizedInput.phone !== undefined) dbUpdates.phone = normalizedInput.phone;
      if (normalizedInput.email !== undefined) dbUpdates.email = normalizedInput.email;
      if (normalizedInput.extraInfo !== undefined) dbUpdates.extraInfo = normalizedInput.extraInfo;
      
      if (normalizedInput.points !== undefined) dbUpdates.points = normalizedInput.points;
      if (normalizedInput.memberNumber !== undefined) dbUpdates.member_number = normalizedInput.memberNumber;

      const hasInstagramUpdate =
        normalizedInput.instagramHandle !== undefined ||
        normalizedInput.instagramConnected !== undefined ||
        normalizedInput.instagramNotes !== undefined;
      const hasCouponUsageOverrideUpdate = Array.isArray(updates.couponUsageReenabledCodes);
      const oldInstagram = getInstagramConnection(oldMember);
      let nextSocialConnections = getSocialConnections(oldMember);

      if (hasInstagramUpdate) {
        nextSocialConnections = buildSocialConnectionsWithInstagram(
          nextSocialConnections,
          {
            handle:
              normalizedInput.instagramHandle !== undefined
                ? normalizedInput.instagramHandle
                : oldInstagram.handle,
            isConnected:
              normalizedInput.instagramConnected !== undefined
                ? normalizedInput.instagramConnected
                : oldInstagram.isConnected,
            notes:
              normalizedInput.instagramNotes !== undefined
                ? normalizedInput.instagramNotes
                : oldInstagram.notes,
            source: 'manual',
          },
        );
      }

      if (hasCouponUsageOverrideUpdate) {
        nextSocialConnections = buildSocialConnectionsWithCouponUsageOverrides(
          nextSocialConnections,
          { reenabledCodes: updates.couponUsageReenabledCodes },
        );
      }

      if (hasInstagramUpdate || hasCouponUsageOverrideUpdate) dbUpdates.social_connections = nextSocialConnections;
      
      await updateWithSchemaFallback('clients', id, dbUpdates, CLOUD_SELECTS.clients);
      
      // ?? Normalizar updates: convertir points a número antes de actualizar estado
      const normalizedUpdates = normalizedInput;
      let updatedMemberForReturn = null;
      setMembers((prev) =>
        prev.map((member) => {
          if (member.id !== id) return member;

          const updatedMember = {
            ...member,
            ...normalizedUpdates,
            memberNumber:
              normalizedUpdates.memberNumber !== undefined
                ? normalizedUpdates.memberNumber
                : member.memberNumber || member.member_number,
            created_at: member.created_at || member.createdAt || null,
            createdAt: member.createdAt || member.created_at || null,
            ...(hasInstagramUpdate || hasCouponUsageOverrideUpdate ? { socialConnections: nextSocialConnections } : {}),
          };

          updatedMemberForReturn = updatedMember;
          return updatedMember;
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
      if (hasInstagramUpdate) {
        const nextInstagram = getInstagramConnection({ socialConnections: nextSocialConnections });
        const oldInstagramLabel = formatInstagramHandle(oldInstagram.handle) || '--';
        const nextInstagramLabel = formatInstagramHandle(nextInstagram.handle) || '--';
        const oldState = oldInstagram.isConnected ? 'confirmado' : 'sin confirmar';
        const nextState = nextInstagram.isConnected ? 'confirmado' : 'sin confirmar';
        if (
          oldInstagramLabel !== nextInstagramLabel ||
          oldState !== nextState ||
          String(oldInstagram.notes || '') !== String(nextInstagram.notes || '')
        ) {
          changes.push({
            field: 'Instagram',
            old: `${oldInstagramLabel} (${oldState})`,
            new: `${nextInstagramLabel} (${nextState})`,
          });
        }
      }
      if (hasCouponUsageOverrideUpdate) {
        const oldReenabledCodes = getCouponUsageOverrides(oldMember).reenabledCodes;
        const nextReenabledCodes = getCouponUsageOverrides({ socialConnections: nextSocialConnections }).reenabledCodes;
        if (oldReenabledCodes.join(',') !== nextReenabledCodes.join(',')) {
          changes.push({
            field: 'Cupones habilitados',
            old: oldReenabledCodes.length ? oldReenabledCodes.join(', ') : '--',
            new: nextReenabledCodes.length ? nextReenabledCodes.join(', ') : '--',
          });
        }
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
      return updatedMemberForReturn || {
        ...oldMember,
        ...normalizedUpdates,
        ...(hasInstagramUpdate || hasCouponUsageOverrideUpdate ? { socialConnections: nextSocialConnections } : {}),
      };
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

  const handleCheckMemberPointExpirations = async () => {
    if (blockIfOfflineReadonly('auditar puntos de socios')) return null;

    const report = buildPointExpirationReport(members, transactions, { upcomingDays: 30 });
    const expiredMembers = report.expiredMembers.filter((member) => member.expiredPoints > 0);

    if (expiredMembers.length === 0) {
      showNotification('info', 'Auditoria de puntos', 'No hay puntos vencidos para limpiar.');
      return { ...report, applied: false };
    }

    try {
      const updates = [];

      for (const expiredMember of expiredMembers) {
        const currentMember = members.find((member) => String(member.id) === String(expiredMember.memberId));
        if (!currentMember) continue;

        const previousPoints = Number(currentMember.points || 0);
        const expiredPoints = Math.min(previousPoints, Number(expiredMember.expiredPoints || 0));
        const nextPoints = Math.max(0, previousPoints - expiredPoints);

        if (expiredPoints <= 0 || nextPoints === previousPoints) continue;

        await updateWithSchemaFallback('clients', currentMember.id, { points: nextPoints }, CLOUD_SELECTS.clients);

        updates.push({
          id: currentMember.id,
          name: currentMember.name || expiredMember.name,
          memberNumber: currentMember.memberNumber || currentMember.member_number || expiredMember.memberNumber,
          previousPoints,
          expiredPoints,
          newPoints: nextPoints,
        });
      }

      if (updates.length === 0) {
        showNotification('info', 'Auditoria de puntos', 'No hubo saldos para actualizar.');
        return { ...report, applied: false };
      }

      setMembers((prev) =>
        prev.map((member) => {
          const update = updates.find((item) => String(item.id) === String(member.id));
          return update ? { ...member, points: update.newPoints } : member;
        }),
      );

      const totalExpiredPoints = updates.reduce((acc, item) => acc + item.expiredPoints, 0);

      addLog(
        'Auditoria de Puntos',
        {
          totalMembers: updates.length,
          totalExpiredPoints,
          members: updates,
        },
        'Vencimiento de puntos mayor a 6 meses',
      );

      showNotification(
        'success',
        'Auditoria completada',
        `${updates.length} socios perdieron ${formatNumber(totalExpiredPoints)} puntos vencidos.`,
      );

      return {
        ...report,
        applied: true,
        updatedMembers: updates,
        totals: {
          ...report.totals,
          expiredMembers: updates.length,
          expiredPoints: totalExpiredPoints,
        },
      };
    } catch (e) {
      console.error('Error auditando puntos vencidos:', e);
      showNotification('error', 'Error', `No se pudo completar la auditoria. ${getCloudErrorMessage(e)}`);
      throw e;
    }
  };

  const handleDeleteMemberWithLog = async (id) => {
    if (blockIfOfflineReadonly('eliminar socios')) return;
    try {
      const memberToDelete = members.find(m => m.id === id);

      if (isLocalDemoMode()) {
        localDemoUpdateRow('clients', id, { is_active: false });
      } else {
        await updateWithSchemaFallback('clients', id, { is_active: false }, CLOUD_SELECTS.clients);
      }

      setMembers(members.filter(m => m.id !== id));
      addLog('Baja de Socio', {
        id,
        name: memberToDelete?.name || 'Desconocido',
        memberNumber: memberToDelete?.memberNumber || memberToDelete?.member_number || null,
        softDeleted: true,
      });
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
      const rawDate = tx.createdAt || tx.created_at || null;
      if (rawDate) {
        const parsedDate = new Date(rawDate);
        return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
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
  const getTransactionPaymentTotals = (tx) =>
    getPaymentMethodTotals(
      tx?.paymentBreakdown,
      tx?.primaryPaymentMethod || tx?.payment,
      tx?.installments,
      tx?.cashReceived,
      tx?.cashChange,
      tx?.total,
    );
  const getTransactionCashTotal = (tx) => Number(getTransactionPaymentTotals(tx).Efectivo || 0);
  const getReportLineSubtotal = (item = {}) => {
    const explicitSubtotal = Number(item.subtotal ?? item.lineSubtotal ?? item.line_total ?? item.lineTotal);
    if (Number.isFinite(explicitSubtotal) && explicitSubtotal !== 0) return explicitSubtotal;
    return (Number(item.price) || 0) * (Number(item.qty || item.quantity || 0) || 0);
  };
  const clearSaleLineDerivedTotals = (item = {}) => {
    const rest = { ...item };
    delete rest.subtotal;
    delete rest.lineSubtotal;
    delete rest.line_subtotal;
    delete rest.lineTotal;
    delete rest.line_total;
    return rest;
  };

  const getSaleLineSubtotal = (item = {}) => {
    const price = Number(item.price || 0);
    const qty = Number(item.qty ?? item.quantity ?? 0);
    if (Number.isFinite(price) && Number.isFinite(qty) && qty !== 0) {
      if ((item.product_type || 'quantity') !== 'weight') return price * qty;
      return price >= 100 ? price * (qty / 1000) : price * qty;
    }
    const explicitSubtotal = Number(item.subtotal ?? item.lineSubtotal ?? item.line_subtotal);
    return Number.isFinite(explicitSubtotal) ? explicitSubtotal : 0;
  };
  const getSaleItemsSubtotal = (items = []) =>
    (items || []).reduce((acc, item) => acc + getSaleLineSubtotal(item), 0);
  const getEditedTransactionTotal = (items = [], payment = 'Efectivo') => {
    const subtotal = getSaleItemsSubtotal(items);
    return payment === 'Credito' ? subtotal * 1.1 : subtotal;
  };
  const roundSaleCurrency = (value = 0) =>
    Math.round((Number(value) || 0) * 100) / 100;
  const buildEditedPaymentLine = (line = {}, amount = 0) => {
    const method = line.method || line.payment_method || 'Efectivo';
    return {
      id: line.id,
      method,
      amount: roundSaleCurrency(amount),
      installments: method === 'Credito' ? Number(line.installments || 1) || 1 : 0,
      cashReceived: method === 'Efectivo' ? undefined : 0,
      cashChange: 0,
    };
  };
  const buildEditedTransactionPaymentBreakdown = (tx = {}, baseTotal = 0) => {
    const safeBaseTotal = roundSaleCurrency(baseTotal);
    const legacyChargedTotal = getEditedTransactionTotal(tx.items || [], tx.payment);
    const sourceLines = normalizePaymentBreakdown(
      tx.paymentBreakdown,
      tx.payment,
      tx.installments,
      tx.cashReceived,
      tx.cashChange,
      legacyChargedTotal,
    );
    const lineCount = sourceLines.length > 1 ? 2 : 1;
    const primarySource = sourceLines[0] || { method: tx.payment || 'Efectivo' };
    const primaryAmount = lineCount > 1
      ? Math.min(Math.max(roundSaleCurrency(primarySource.amount || 0), 0), safeBaseTotal)
      : safeBaseTotal;

    const baseLines = lineCount > 1
      ? [
          buildEditedPaymentLine(primarySource, primaryAmount),
          buildEditedPaymentLine(
            sourceLines[1] || { method: primarySource.method === 'Efectivo' ? 'Debito' : 'Efectivo' },
            Math.max(roundSaleCurrency(safeBaseTotal - primaryAmount), 0),
          ),
        ]
      : [buildEditedPaymentLine(primarySource, safeBaseTotal)];

    return normalizePaymentBreakdown(
      baseLines,
      primarySource.method || tx.payment || 'Efectivo',
      primarySource.installments || tx.installments || 0,
      0,
      0,
      safeBaseTotal,
    );
  };
  const getReportStockChangeId = (change = {}) => change.productId || change.product_id || change.id || null;
  const getReportStockChangeQty = (change = {}) =>
    Number(change.quantitySold || change.quantityReserved || change.quantityChanged || 0) || 0;
  const buildReportRevenueByProduct = (tx = {}) =>
    (Array.isArray(tx.items) ? tx.items : []).reduce((acc, item) => {
      if (item?.isReward || item?.isDiscount || item?.isCustom) return acc;
      const subtotal = getReportLineSubtotal(item);

      if (item?.isCombo && Array.isArray(item.productsIncluded) && item.productsIncluded.length > 0) {
        const comboQty = Number(item.qty || item.quantity || 1) || 1;
        const includedWeights = item.productsIncluded.map((includedItem) => {
          const includedQty =
            (Number(includedItem.quantity ?? includedItem.qty ?? 0) || 0) * comboQty;
          const includedPrice = Number(includedItem.price || 0) || 0;
          const weight = Math.max(includedQty * includedPrice, includedQty, 1);
          return { includedItem, weight };
        });
        const totalWeight = includedWeights.reduce((sum, entry) => sum + entry.weight, 0) || includedWeights.length || 1;

        includedWeights.forEach(({ includedItem, weight }) => {
          const includedId = getOrderStockProductId(includedItem);
          if (shouldSkipOrderStockProductId(includedId)) return;
          acc[String(includedId)] = (acc[String(includedId)] || 0) + (subtotal * weight) / totalWeight;
        });
        return acc;
      }

      const productId = item.productId || item.id || item.product_id || null;
      if (shouldSkipOrderStockProductId(productId)) return acc;
      acc[String(productId)] = (acc[String(productId)] || 0) + subtotal;
      return acc;
    }, {});
  const buildReportStockLinesFromChanges = (tx = {}) => {
    const revenueByProduct = buildReportRevenueByProduct(tx);
    return (Array.isArray(tx.stockChanges) ? tx.stockChanges : [])
      .map((change) => {
        const productId = getReportStockChangeId(change);
        const qty = getReportStockChangeQty(change);
        if (!productId || qty <= 0) return null;
        const inventoryItem = inventory.find((product) => String(product.id) === String(productId));
        const cost = Number(inventoryItem?.purchasePrice ?? change.purchasePrice ?? change.cost ?? 0) || 0;
        const productType = change.product_type || change.productType || inventoryItem?.product_type || 'quantity';
        return {
          id: productId,
          title: change.title || inventoryItem?.title || `Producto #${productId}`,
          qty,
          product_type: productType,
          revenue: Number(revenueByProduct[String(productId)] || 0),
          cost: cost * qty,
        };
      })
      .filter(Boolean);
  };
  const buildFallbackReportItemLines = (tx = {}) =>
    (Array.isArray(tx.items) ? tx.items : [])
      .filter((item) => !item?.isReward && !item?.isDiscount)
      .map((item) => {
        const productId = item.productId || item.id || item.product_id || item.title;
        const qty = Number(item.qty || item.quantity || 0) || 0;
        if (!productId || qty <= 0) return null;
        const inventoryItem = inventory.find((product) => String(product.id) === String(item.productId || item.id));
        const isCustomLike = Boolean(item?.isCustom || item?.is_custom || item?.isTemporary || String(productId).startsWith('custom_'));
        const cost = isCustomLike
          ? getSaleItemUnitCost(item)
          : Number(inventoryItem?.purchasePrice || item.purchasePrice || item.purchase_price || item.cost || 0) || 0;
        const productType = item.product_type || item.productType || inventoryItem?.product_type || 'quantity';
        return {
          id: productId,
          title: item.title || inventoryItem?.title || 'Producto',
          qty,
          product_type: productType,
          revenue: getReportLineSubtotal(item),
          cost: cost * qty,
          isCustom: isCustomLike,
        };
      })
      .filter(Boolean);
  const cycleCashSales = cycleTransactions.reduce((acc, tx) => acc + getTransactionCashTotal(tx), 0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const shouldClose = shouldAutoCloseRegister({
      isRegisterClosed,
      closingTime,
      registerOpenedAt,
      now: currentTime,
    });

    if (shouldClose && !isAutoClosing.current) {
      isAutoClosing.current = true;
      executeRegisterClose(true).finally(() => {
        setTimeout(() => { isAutoClosing.current = false; }, 65000);
      });
    }
  // Autoclose uses a ref guard; executeRegisterClose is intentionally not a trigger.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime, closingTime, isRegisterClosed, registerOpenedAt]);

  const navigateToInventoryFromDashboard = ({
    searchQuery = '',
    category = 'Todas',
    mode = 'default',
    productId = null,
  } = {}) => {
    setInventoryCategoryFilter(category || 'Todas');

    setInventorySearch(searchQuery || '');

    setInventoryNavigationRequest({
      token: Date.now(),
      searchQuery: searchQuery || '',
      category: category || 'Todas',
      mode,
      productId,
    });
    setActiveTab('inventory');
  };

  const handleMainTabSelect = (tab) => {
    if (tab === 'inventory') {
      setInventorySearch('');
      setInventoryCategoryFilter('Todas');
      setInventoryNavigationRequest({
        token: Date.now(),
        searchQuery: '',
        category: 'Todas',
        mode: 'default',
        productId: null,
      });
    }

    setActiveTab(tab);
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
    setRememberLoginSession(false);
    setLoginError('');
  };

  const finalizeLogin = async (verifiedUser, { offline = false, rememberSession = false, password = '' } = {}) => {
    let supabaseAuthMeta = { signedIn: false, reason: offline ? 'offline' : 'not-attempted' };

    if (!offline && authMode === 'supabase') {
      supabaseAuthMeta = await signInSupabaseAuthForAppUser({
        user: verifiedUser,
        password,
      });

      if (supabaseAuthMeta.error) {
        console.warn('No se pudo abrir sesion en Supabase Auth:', supabaseAuthMeta.error?.message || supabaseAuthMeta.error);
      }
    }

    const nextSession = {
      ...(await buildSessionMeta(verifiedUser)),
      rememberedSession: Boolean(rememberSession),
      supabaseAuth: {
        signedIn: Boolean(supabaseAuthMeta.signedIn),
        reason: supabaseAuthMeta.reason || null,
        authUserId: supabaseAuthMeta.authUser?.id || null,
      },
    };
    setAppUsers((prev) =>
      Array.isArray(prev)
        ? prev.map((user) => (String(user.id) === String(verifiedUser.id) ? { ...user, ...verifiedUser } : user))
        : prev,
    );
    setCurrentUser(verifiedUser);
    setCurrentSessionMeta(nextSession);
    setActiveTab(getDefaultTabForUser(verifiedUser));
    setLoginStep('select');
    setSelectedUserIdForLogin(null);
    setPasswordInput('');
    setRememberLoginSession(false);
    setLoginError('');
    if (rememberSession) {
      saveRememberedSession(verifiedUser, nextSession);
    } else {
      clearRememberedSession();
    }
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

      await finalizeLogin(verifiedUser, {
        offline: shouldSkipCloudLoginLog,
        rememberSession: rememberLoginSession,
        password: passwordInput,
      });
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

  const handleSaveUserSettings = async (updates, options = {}) => {
    const { silent = false, skipReload = false, skipCurrentUserApply = false } = options;
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
        metricsViewMode: normalizeMetricsViewMode(updates.metricsViewMode || currentUser.metricsViewMode || loadMetricsViewModePreference()),
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
          metricsViewMode: nextUser.metricsViewMode,
        });

        if (updates.password?.trim()) {
          await updateAppUserPassword({
            actorId: currentUser.id,
            targetId: currentUser.id,
            password: updates.password.trim(),
          });
        }

        nextUser = {
          ...nextUser,
          ...(updatedProfile || {}),
          metricsViewMode: normalizeMetricsViewMode(updates.metricsViewMode || updatedProfile?.metricsViewMode || nextUser.metricsViewMode),
        };
        if (skipReload) {
          setAppUsers((prev) =>
            prev.map((user) => (String(user.id) === String(currentUser.id) ? { ...user, ...nextUser } : user)),
          );
        } else {
          const refreshedUsers = await loadAppUsers({ force: true });
          nextUser =
            refreshedUsers.find((user) => String(user.id) === String(currentUser.id)) ||
            nextUser;
          nextUser = {
            ...nextUser,
            metricsViewMode: normalizeMetricsViewMode(updates.metricsViewMode || nextUser.metricsViewMode),
          };
        }
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

      saveMetricsViewModePreference(nextUser.metricsViewMode);

      if (!skipCurrentUserApply) {
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
      }

      if (silent) return nextUser;

      await writeLogEntry({
        action: 'Ajustes de Usuario',
        details: {
          userId: nextUser.id || null,
          role: nextUser.role,
          name: nextUser.displayName || nextUser.name,
          avatar: nextUser.avatar,
          nameColor: nextUser.nameColor || '#0f172a',
          theme: nextUser.theme || 'light',
          metricsViewMode: nextUser.metricsViewMode || 'modern',
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

  const handleToggleCurrentTheme = () => {
    if (isThemeSaving) return;

    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    const previousTheme = currentTheme;

    pendingThemeSaveRef.current = nextTheme;
    setIsThemeSaving(true);
    setCurrentUser((prev) => (prev ? { ...prev, theme: nextTheme } : prev));

    void handleSaveUserSettings(
      { theme: nextTheme },
      { silent: true, skipReload: true, skipCurrentUserApply: true },
    )
      .then((savedUser) => {
        if (pendingThemeSaveRef.current !== nextTheme) return;
        if (!savedUser) {
          setCurrentUser((prev) => (prev ? { ...prev, theme: previousTheme } : prev));
        }
      })
      .finally(() => {
        if (pendingThemeSaveRef.current !== nextTheme) return;
        pendingThemeSaveRef.current = null;
        setIsThemeSaving(false);
      });
  };

  const handleToggleLoginTheme = () => {
    setLoginTheme((prevTheme) => (prevTheme === 'dark' ? 'light' : 'dark'));
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
      metricsViewMode: 'modern',
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
      metricsViewMode: targetUser.metricsViewMode || 'modern',
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

    const refreshedTargetUserFromReload =
      refreshedUsers.find((user) => String(user.id) === String(targetUser.id)) ||
      targetUser;
    const refreshedTargetUser = {
      ...refreshedTargetUserFromReload,
      ...(updatedUser || {}),
      permissionsOverride,
      permissionsVersion:
        updatedUser?.permissionsVersion ||
        refreshedTargetUserFromReload?.permissionsVersion ||
        targetUser.permissionsVersion ||
        1,
      forceReauthPermissionsVersion:
        updatedUser?.forceReauthPermissionsVersion ??
        refreshedTargetUserFromReload?.forceReauthPermissionsVersion ??
        targetUser.forceReauthPermissionsVersion ??
        0,
    };
    refreshedTargetUser.effectivePermissions = getEffectivePermissions(refreshedTargetUser);

    const hasTargetInReload = refreshedUsers.some((user) => String(user.id) === String(targetUser.id));
    const mergedRefreshedUsers = [
      ...refreshedUsers.map((user) =>
        String(user.id) === String(targetUser.id)
          ? {
              ...user,
              ...refreshedTargetUser,
            }
          : user,
      ),
      ...(hasTargetInReload ? [] : [refreshedTargetUser]),
    ];

    sharedUsersCache.users = mergedRefreshedUsers;
    sharedUsersCache.authMode = 'supabase';
    sharedUsersCache.scope = 'all';
    sharedUsersCache.loadedAt = Date.now();
    saveOfflineSharedUsersSnapshot({
      savedAt: new Date().toISOString(),
      authMode: 'supabase',
      scope: 'all',
      users: mergedRefreshedUsers,
    });
    setAppUsers(mergedRefreshedUsers);

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

    clearAuthenticatedState();
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
      if (isLocalDemoMode()) {
        const localImageUrl = URL.createObjectURL(file);
        if (isEditing) {
          setEditingProduct((prev) => prev ? { ...prev, image: localImageUrl, image_thumb: localImageUrl, imageThumb: localImageUrl } : prev);
        } else {
          setNewItem((prev) => ({ ...prev, image: localImageUrl, image_thumb: localImageUrl, imageThumb: localImageUrl }));
        }
        showNotification('success', 'Imagen local', 'Se preparó solo para esta sesión demo.');
        return;
      }

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

  const hydrateProductCloudDetail = async (product) => {
    if (!product?.id) return product;
    if (Object.prototype.hasOwnProperty.call(product, 'image')) return product;

    const productId = String(product.id);
    const existingRequest = productDetailRequestsRef.current.get(productId);
    if (existingRequest) return existingRequest;

    const request = fetchProductCloudDetail(product.id)
      .then((cloudProduct) => {
        if (!cloudProduct) return product;

        const hydratedProduct = { ...product, ...cloudProduct };
        setInventory((prev) =>
          prev.map((currentProduct) =>
            String(currentProduct.id) === productId
              ? { ...currentProduct, ...cloudProduct }
              : currentProduct
          )
        );
        return hydratedProduct;
      })
      .catch((error) => {
        console.warn('No se pudo cargar el detalle completo del producto:', product.id, error);
        return product;
      })
      .finally(() => {
        productDetailRequestsRef.current.delete(productId);
      });

    productDetailRequestsRef.current.set(productId, request);
    return request;
  };

  const handleProductDetailRequest = async (product) => hydrateProductCloudDetail(product);

  const handleEditProductRequest = async (product) => {
    setEditReason('');
    const hydratedProduct = await hydrateProductCloudDetail(product);
    setEditingProduct(hydratedProduct);
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
      showNotification('success', 'Imprimiendo...', 'El ticket se envio a la impresora.');
    } else {
      window.print();
    }
  };

  const toggleRegisterStatus = async () => {
    if (blockIfOfflineReadonly('cambiar el estado de la caja')) return;
    if (!canManageRegister) {
      showNotification('error', 'Acceso Denegado', 'No tenes permiso para gestionar la caja.');
      return;
    }

    if (isRegisterClosed) {
      setTempOpeningBalance('0');
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
    if (!isAuto && !canManageRegister) {
      showNotification('error', 'Acceso Denegado', 'No tenes permiso para cerrar la caja.');
      return;
    }

    if (isAuto) {
      await loadDashboardCloudData({ force: true });
    }

    const closeDate = new Date();
    const cycleStart = registerOpenedAt ? new Date(registerOpenedAt) : null;
    const sourceTransactions = Array.isArray(dataStateRef.current.transactions)
      ? dataStateRef.current.transactions
      : safeTransactions;
    const sourceExpenses = Array.isArray(dataStateRef.current.expenses)
      ? dataStateRef.current.expenses
      : expenses;
    
    const cycleTransactions = cycleStart
      ? sourceTransactions.filter(tx => {
          if (!tx || tx.status === 'voided' || tx.isTest) return false;
          const txDate = parseTxDate(tx);
          return txDate && txDate >= cycleStart && txDate <= closeDate;
        })
      : sourceTransactions.filter(tx => tx && tx.status !== 'voided' && !tx.isTest);

    const cycleExpenses = cycleStart
      ? sourceExpenses.filter(exp => {
          if (exp?.isTest) return false;
          const expDate = parseExpDate(exp);
          return expDate && expDate >= cycleStart && expDate <= closeDate;
        })
      : sourceExpenses.filter(exp => !exp?.isTest);

    const cycleTotalSales = cycleTransactions.reduce((acc, tx) => acc + (Number(tx.total) || 0), 0);
    const cycleSalesCount = cycleTransactions.length;

    const itemsSoldMap = {};
    let totalCost = 0; 
    cycleTransactions.forEach(tx => {
      const stockLines = buildReportStockLinesFromChanges(tx);
      const fallbackLines = buildFallbackReportItemLines(tx);
      const customCostLines = fallbackLines.filter((line) => line.isCustom);
      const reportLines = stockLines.length > 0 ? [...stockLines, ...customCostLines] : fallbackLines;
      reportLines.forEach((line) => {
        if (!itemsSoldMap[line.id]) {
          itemsSoldMap[line.id] = {
            id: line.id,
            title: line.title,
            product_type: line.product_type || 'quantity',
            qty: 0,
            unitQty: 0,
            weightQty: 0,
            revenue: 0,
            cost: 0,
          };
        }
        const lineQty = Number(line.qty || 0);
        const isWeightLine = line.product_type === 'weight';
        itemsSoldMap[line.id].qty += lineQty;
        itemsSoldMap[line.id].product_type = isWeightLine ? 'weight' : itemsSoldMap[line.id].product_type;
        if (isWeightLine) itemsSoldMap[line.id].weightQty += lineQty;
        else itemsSoldMap[line.id].unitQty += lineQty;
        itemsSoldMap[line.id].revenue += Number(line.revenue || 0);
        itemsSoldMap[line.id].cost += Number(line.cost || 0);
        totalCost += Number(line.cost || 0);
      });
    });
    const itemsSoldList = Object.values(itemsSoldMap).sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0));

    const paymentMethodsSummary = {};
    cycleTransactions.forEach(tx => {
      const perMethodTotals = getTransactionPaymentTotals(tx);
      Object.entries(perMethodTotals).forEach(([method, amount]) => {
        if (!paymentMethodsSummary[method]) paymentMethodsSummary[method] = 0;
        paymentMethodsSummary[method] += Number(amount || 0);
      });
    });

    const totalExpenses = cycleExpenses.reduce((acc, curr) => acc + Number(curr.amount), 0);
    const cashExpenses = cycleExpenses.filter(e => e.paymentMethod === 'Efectivo').reduce((acc, curr) => acc + Number(curr.amount), 0);
    const averageTicket = cycleSalesCount > 0 ? (cycleTotalSales / cycleSalesCount) : 0;
    const netProfit = cycleTotalSales - totalCost - totalExpenses;
    const cashSales = cycleTransactions.reduce((acc, tx) => acc + getTransactionCashTotal(tx), 0);
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
        phone: member.phone || member.contact || member.contactNumber || '',
        email: member.email || '',
        contact: member.phone || member.email || member.contact || member.contactNumber || '',
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
        const lockResult = isLocalDemoMode()
          ? {
              data: [
                localDemoUpdateRow('register_state', 1, {
                  is_open: false,
                  opening_balance: 0,
                  opened_at: null,
                  last_updated_by: currentUser?.name || 'Sistema (Auto)',
                }),
              ],
              error: null,
            }
          : await supabase
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
        const { data: lockData, error: lockError } = lockResult;

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
            user_id: toOptionalDbId(actor.userId),
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
          expensesCount: cycleExpenses.length,
          transactionsCount: cycleTransactions.length,
          itemsSoldCount: itemsSoldList.length,
          newClientsCount: cycleNewClients.length,
          snapshotsStoredIn: shouldSaveReport ? 'cash_closures' : 'not_saved',
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
    if (!canManageRegister) {
      showNotification('error', 'Acceso Denegado', 'No tenes permiso para abrir la caja.');
      setIsOpeningBalanceModalOpen(false);
      return;
    }

    const value = Number(tempOpeningBalance);
    if (!isNaN(value) && value >= 0 && tempClosingTime) {
      
      const now = new Date().toISOString();
      setOpeningBalance(value);
      setClosingTime(tempClosingTime);
      setIsRegisterClosed(false);
      setIsOpeningBalanceModalOpen(false);
      setRegisterOpenedAt(now);

      try {
          if (isLocalDemoMode()) {
            localDemoUpdateRow('register_state', 1, {
              is_open: true,
              opening_balance: value,
              closing_time: tempClosingTime,
              opened_at: now,
              last_updated_by: currentUser?.name,
            });
          } else {
            await supabase.from('register_state').update({
              is_open: true,
              opening_balance: value,
              closing_time: tempClosingTime,
              opened_at: now,
              last_updated_by: currentUser?.name
            }).eq('id', 1);
          }

          addLog('Apertura de Caja', { amount: value, scheduledClosingTime: tempClosingTime }, 'Inicio de operaciones');
      } catch(e) {
          console.error("Error abriendo caja en nube:", e);
          showNotification('error', 'Error de Sincronización', 'La caja se abrió localmente pero falló la nube.');
      }
    }
  };

  const handleSaveClosingTime = async () => {
    if (blockIfOfflineReadonly('editar el horario de cierre')) return;
    if (!canManageRegister) {
      showNotification('error', 'Acceso Denegado', 'No tenes permiso para editar el horario de cierre.');
      setIsClosingTimeModalOpen(false);
      return;
    }

    addLog('Horario Modificado', `Nueva hora de cierre: ${closingTime}`, 'Ajuste de horario');
    setIsClosingTimeModalOpen(false);
    
    try {
        if (isLocalDemoMode()) {
          localDemoUpdateRow('register_state', 1, { closing_time: closingTime });
        } else {
          await supabase.from('register_state').update({ closing_time: closingTime }).eq('id', 1);
        }
        showNotification('success', 'Horario Guardado', 'La hora de cierre se ha actualizado.');
    } catch(e) {
        console.error(e);
    }
  };

  const handleAddCategoryFromView = async (name) => {
    if (blockIfOfflineReadonly('crear categorías')) return;
    if (name && !categories.includes(name)) {
      try {
        if (isLocalDemoMode()) {
          localDemoInsertRows('categories', [{ name }]);
        } else {
          const { error } = await supabase.from('categories').insert([{ name }]);
          if (error) throw error;
        }
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
        if (!isLocalDemoMode()) {
          await supabase.from('categories').delete().eq('name', name);
        }
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
      const originalStock = Number(originalProduct?.stock ?? productData.stock ?? 0);
      const requestedStock = Number(productData.stock || 0);
      const stockDelta = originalProduct ? requestedStock - originalStock : 0;
      const nextImage = String(productData.image || '').trim();
      const nextImageThumb = nextImage
        ? String(productData.image_thumb || productData.imageThumb || '').trim()
        : '';
      const previousImage = originalProduct?.image || '';
      const previousImageThumb = originalProduct?.image_thumb || originalProduct?.imageThumb || '';
      const imageChanged = Boolean(originalProduct) && (
        previousImage !== nextImage ||
        previousImageThumb !== nextImageThumb
      );

      const payload = {
        title: productData.title,
        price: Number(productData.price),
        purchasePrice: Number(productData.purchasePrice) || 0,
        category: Array.isArray(productData.categories) ? productData.categories.join(', ') : productData.category,
        barcode: productData.barcode || null,
        image: nextImage,
        image_thumb: nextImageThumb,
        product_type: productData.product_type || 'quantity',
        expiration_date: productData.expiration_date || null
      };

      if (!originalProduct) {
        payload.stock = requestedStock;
      }

      const { data } = await updateWithSchemaFallback('products', productData.id, payload, CLOUD_SELECTS.products);
      let formattedProduct = mapInventoryRecords([data])[0];
      if (originalProduct && stockDelta !== 0) {
        const nextStock = isLocalDemoMode()
          ? Number(localDemoUpdateRow('products', productData.id, { stock: originalStock + stockDelta })?.stock || originalStock + stockDelta)
          : await applyProductStockDeltaCloud(originalProduct, stockDelta);
        formattedProduct = { ...formattedProduct, stock: nextStock };
      }
      const effectiveProductData = {
        ...productData,
        stock: formattedProduct.stock,
        image: nextImage,
        image_thumb: nextImageThumb,
        imageThumb: nextImageThumb,
      };
      setInventory((prev) => prev.map((product) => (
        String(product.id) === String(productData.id)
          ? {
              ...formattedProduct,
              image: nextImage,
              image_thumb: nextImageThumb,
              imageThumb: nextImageThumb,
            }
          : product
      )));
      productDetailRequestsRef.current.delete(String(productData.id));

      if (imageChanged) {
        if (previousImage && previousImage !== nextImage) {
          await deleteProductImage(previousImage).catch((error) => {
            console.warn('La foto se quito del producto, pero no se pudo borrar el archivo original:', error);
          });
        }
        if (
          previousImageThumb &&
          previousImageThumb !== nextImageThumb &&
          previousImageThumb !== previousImage
        ) {
          await deleteProductImage(previousImageThumb).catch((error) => {
            console.warn('La foto se quito del producto, pero no se pudo borrar la miniatura:', error);
          });
        }
      }

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
        title: effectiveProductData.title || '',
        category: getCategoryLabel(effectiveProductData),
        price: Number(effectiveProductData.price || 0),
        purchasePrice: Number(effectiveProductData.purchasePrice || 0),
        stock: Number(effectiveProductData.stock || 0),
        stockLabel: formatStockValue(effectiveProductData.stock, effectiveProductData.product_type),
        product_type: effectiveProductData.product_type || 'quantity',
        productTypeLabel: getProductTypeLabel(effectiveProductData.product_type || 'quantity'),
        barcode: normalizeTextValue(effectiveProductData.barcode),
        expiration_date: normalizeTextValue(effectiveProductData.expiration_date),
        imageState: effectiveProductData.image ? 'Cargada' : 'Sin imagen',
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
        id: effectiveProductData.id,
        product: effectiveProductData.title,
        title: effectiveProductData.title,
        price: effectiveProductData.price,
        stock: effectiveProductData.stock,
        category: getCategoryLabel(effectiveProductData),
        purchasePrice: Number(effectiveProductData.purchasePrice || 0),
        product_type: effectiveProductData.product_type,
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

  const handleDeleteProductRequest = async (id) => {
    const product = inventory.find(p => p.id === id);
    if (product) {
      const hydratedProduct = await hydrateProductCloudDetail(product);
      setProductToDelete(hydratedProduct);
      setDeleteProductReason('');
    }
  };

  const handleCreateExcelProducts = async (draftsToCreate = []) => {
    if (blockIfOfflineReadonly('crear productos desde Excel')) {
      return { created: [], failed: [] };
    }

    const safeDrafts = Array.isArray(draftsToCreate) ? draftsToCreate : [];
    if (safeDrafts.length === 0) return { created: [], failed: [] };

    const created = [];
    const failed = [];
    const reservedBarcodes = new Set(
      (inventory || []).map((product) => String(product.barcode || '').trim()).filter(Boolean),
    );

    for (const draft of safeDrafts) {
      try {
        const title = String(draft.title || '').trim();
        const category = String(draft.category || '').trim();
        const barcode = String(draft.barcode || '').trim();
        const stockDelta = Number(draft.stock || 0);
        const purchasePrice = Number(draft.purchasePrice || 0);
        const price = Number(draft.price || 0);

        if (!title) throw new Error('Falta el nombre del producto.');
        if (!category) throw new Error('Falta seleccionar una categoria.');
        if (!Number.isFinite(stockDelta) || stockDelta < 0) throw new Error('La cantidad asignada no es valida.');
        if (!Number.isFinite(purchasePrice) || purchasePrice <= 0) throw new Error('El costo debe ser mayor a cero.');
        if (!Number.isFinite(price) || price <= 0) throw new Error('El precio debe ser mayor a cero.');
        if (price < purchasePrice) throw new Error('El precio no puede ser menor al costo.');
        if (barcode && reservedBarcodes.has(barcode)) {
          throw new Error(`El codigo ${barcode} ya pertenece a otro producto.`);
        }

        const payload = {
          title,
          brand: '',
          price,
          purchasePrice,
          stock: 0,
          category,
          barcode: barcode || null,
          image: '',
          image_thumb: '',
          product_type: 'quantity',
          expiration_date: null,
        };
        const { data } = await insertWithSchemaFallback('products', payload, CLOUD_SELECTS.products);
        const product = mapInventoryRecords([data])[0];
        if (!product) throw new Error('La nube no devolvio el producto creado.');

        if (barcode) reservedBarcodes.add(barcode);
        created.push({ rowId: draft.rowId, product });
      } catch (error) {
        console.error('Error creando producto desde Excel:', error);
        failed.push({
          rowId: draft.rowId,
          error: getCloudErrorMessage(error, 'No se pudo crear el producto.'),
        });
      }
    }

    if (created.length > 0) {
      const createdProducts = created.map((item) => item.product);
      setInventory((prev) => [...prev, ...createdProducts]);
      await Promise.all(createdProducts.map((product) =>
        addLog('Alta de Producto', {
          id: product.id,
          title: product.title,
          price: product.price,
          purchasePrice: product.purchasePrice,
          stock: product.stock,
          category: product.category,
          barcode: product.barcode || '',
          product_type: product.product_type,
          source: 'excel_import',
        }, 'Creado desde importacion Excel')
      ));
      showNotification(
        failed.length > 0 ? 'warning' : 'success',
        failed.length > 0 ? 'Creacion parcial' : 'Productos agregados',
        `${created.length} producto(s) creados${failed.length > 0 ? ` y ${failed.length} pendiente(s)` : ''}.`,
      );
    } else if (failed.length > 0) {
      showNotification('error', 'No se crearon productos', 'Revisa los datos marcados en el importador.');
    }

    return { created, failed };
  };

  const handleExcelProductImport = async (rowsToApply = []) => {
    if (blockIfOfflineReadonly('importar productos desde Excel')) return { appliedRowIds: [] };
    const safeRows = Array.isArray(rowsToApply) ? rowsToApply : [];
    if (safeRows.length === 0) return { appliedRowIds: [] };

    try {
      Swal.fire({
        title: 'Aplicando importacion...',
        text: `Actualizando ${safeRows.length} producto(s).`,
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      });

      const updates = await Promise.all(safeRows.map(async (row) => {
        const product = inventory.find((entry) => String(entry.id) === String(row.productId));
        if (!product) {
          throw new Error(`No se encontro el producto ${row.productTitle || row.productId}.`);
        }

        const payload = {};
        const currentStock = Number(product.stock || 0);
        const currentCost = Number(product.purchasePrice || 0);
        const currentPrice = Number(product.price || 0);
        const stockDelta = row.approvals?.stock ? Number(row.quantity || 0) : 0;

        if (row.approvals?.cost) payload.purchasePrice = Number(row.after?.cost || currentCost);
        if (row.approvals?.price) payload.price = Number(row.after?.price || currentPrice);
        if (row.shouldAssignBarcode && row.importedCode) payload.barcode = String(row.importedCode);

        let clearedProduct = null;
        let clearedProductBefore = null;
        if (row.shouldAssignBarcode && row.importedCode) {
          const currentBarcodeOwner = inventory.find(
            (entry) =>
              String(entry.barcode || '') === String(row.importedCode) &&
              String(entry.id) !== String(row.productId)
          );

          if (currentBarcodeOwner) {
            clearedProductBefore = currentBarcodeOwner;
            const { data: clearedData } = await updateWithSchemaFallback(
              'products',
              currentBarcodeOwner.id,
              { barcode: null },
              CLOUD_SELECTS.products
            );
            clearedProduct = mapInventoryRecords([clearedData])[0];
          }
        }

        if (Object.keys(payload).length === 0 && stockDelta === 0) {
          return { rowId: row.rowId, product, clearedProduct, clearedProductBefore };
        }

        let updatedProduct = product;
        if (Object.keys(payload).length > 0) {
          const { data } = await updateWithSchemaFallback('products', product.id, payload, CLOUD_SELECTS.products);
          updatedProduct = mapInventoryRecords([data])[0];
        }

        if (stockDelta !== 0) {
          const nextStock = isLocalDemoMode()
            ? Number(localDemoUpdateRow('products', product.id, { stock: currentStock + stockDelta })?.stock || currentStock + stockDelta)
            : await applyProductStockDeltaCloud(product, stockDelta);
          updatedProduct = { ...updatedProduct, stock: nextStock };
        }

        return {
          rowId: row.rowId,
          product: updatedProduct,
          clearedProduct,
          clearedProductBefore,
          payload: {
            ...payload,
            ...(stockDelta !== 0 ? { stock: currentStock + stockDelta } : {}),
          },
          before: {
            stock: currentStock,
            purchasePrice: currentCost,
            price: currentPrice,
            barcode: product.barcode || '',
          },
          source: row,
        };
      }));

      const updatedById = new Map();
      updates.forEach((update) => {
        if (update.clearedProduct) updatedById.set(String(update.clearedProduct.id), update.clearedProduct);
        updatedById.set(String(update.product.id), update.product);
      });
      setInventory((prev) => prev.map((product) => updatedById.get(String(product.id)) || product));

      const appliedUpdates = updates.filter((update) => update.payload);
      addLog('Importacion Excel Productos', {
        count: appliedUpdates.length,
        appliedRowIds: appliedUpdates.map((update) => update.rowId),
        items: appliedUpdates.map((update) => ({
          id: update.product.id,
          title: update.product.title,
          importedCode: update.source.importedCode,
          importedDescription: update.source.importedDescription,
          manualAssigned: update.source.manualAssigned,
          isAssociated: update.source.isAssociated,
          shouldAssignBarcode: update.source.shouldAssignBarcode,
          approvals: update.source.approvals,
          importedQuantity: update.source.importedQuantity,
          multiplier: update.source.multiplier,
          clearedBarcodeOwner: update.clearedProductBefore ? {
            id: update.clearedProductBefore.id,
            title: update.clearedProductBefore.title,
            barcode: update.source.importedCode,
          } : null,
          before: update.before,
          after: {
            stock: update.product.stock,
            purchasePrice: update.product.purchasePrice,
            price: update.product.price,
            barcode: update.product.barcode || '',
          },
          changes: [
            update.source.approvals?.stock && {
              field: 'Stock',
              old: update.before.stock,
              new: update.product.stock,
            },
            update.source.approvals?.cost && {
              field: 'Costo',
              old: update.before.purchasePrice,
              new: update.product.purchasePrice,
              isPrice: true,
            },
            update.source.approvals?.price && {
              field: 'Venta',
              old: update.before.price,
              new: update.product.price,
              isPrice: true,
            },
            update.payload?.barcode !== undefined && {
              field: 'Codigo de barras',
              old: update.before.barcode || 'Sin codigo',
              new: update.product.barcode || 'Sin codigo',
            },
          ].filter(Boolean),
        })),
      }, 'Productos Avanzado');

      Swal.close();
      showNotification('success', 'Importacion aplicada', `Se actualizaron ${appliedUpdates.length} producto(s).`);
      return {
        appliedRowIds: updates.map((update) => update.rowId),
        undoItems: appliedUpdates.map((update) => ({
          rowId: update.rowId,
          productId: update.product.id,
          productTitle: update.product.title,
          approvals: update.source.approvals,
          before: update.before,
          after: {
            stock: update.product.stock,
            purchasePrice: update.product.purchasePrice,
            price: update.product.price,
            barcode: update.product.barcode || '',
          },
          clearedBarcodeOwner: update.clearedProductBefore ? {
            id: update.clearedProductBefore.id,
            title: update.clearedProductBefore.title,
            barcode: update.clearedProductBefore.barcode || update.source.importedCode || '',
          } : null,
        })),
      };
    } catch (error) {
      console.error('Error importando productos desde Excel:', error);
      Swal.fire('Error', error?.message || 'No se pudo aplicar la importacion.', 'error');
      return { appliedRowIds: [] };
    }
  };

  const handleUndoExcelProductImport = async (itemsToUndo = []) => {
    if (blockIfOfflineReadonly('deshacer importacion desde Excel')) return { undoneRowIds: [] };
    const safeItems = Array.isArray(itemsToUndo) ? itemsToUndo : [];
    if (safeItems.length === 0) return { undoneRowIds: [] };

    const confirmation = await Swal.fire({
      title: 'Deshacer aplicacion',
      text: `Se restauraran ${safeItems.length} producto(s) al estado anterior.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Deshacer',
      cancelButtonText: 'Cancelar',
      reverseButtons: true,
    });

    if (!confirmation.isConfirmed) return { undoneRowIds: [], cancelled: true };

    try {
      Swal.fire({
        title: 'Deshaciendo cambios...',
        text: `Restaurando ${safeItems.length} producto(s).`,
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      const restoredProducts = [];
      const restoredBarcodeOwners = [];

      for (const item of safeItems) {
        const product = inventory.find((entry) => String(entry.id) === String(item.productId));
        if (!product) {
          throw new Error(`No se encontro el producto ${item.productTitle || item.productId}.`);
        }

        const before = item.before || {};
        const restorePayload = {
          stock: Number(before.stock || 0),
          purchasePrice: Number(before.purchasePrice ?? before.cost ?? 0),
          price: Number(before.price || 0),
          barcode: before.barcode || null,
        };

        const { data } = await updateWithSchemaFallback('products', product.id, restorePayload, CLOUD_SELECTS.products);
        restoredProducts.push(mapInventoryRecords([data || { ...product, ...restorePayload }])[0]);

        if (item.clearedBarcodeOwner?.id) {
          const owner = inventory.find((entry) => String(entry.id) === String(item.clearedBarcodeOwner.id));
          const ownerPayload = { barcode: item.clearedBarcodeOwner.barcode || null };
          const { data: ownerData } = await updateWithSchemaFallback(
            'products',
            item.clearedBarcodeOwner.id,
            ownerPayload,
            CLOUD_SELECTS.products,
          );
          restoredBarcodeOwners.push(mapInventoryRecords([ownerData || { ...(owner || {}), id: item.clearedBarcodeOwner.id, ...ownerPayload }])[0]);
        }
      }

      const restoredById = new Map();
      [...restoredProducts, ...restoredBarcodeOwners].filter(Boolean).forEach((product) => {
        restoredById.set(String(product.id), product);
      });
      setInventory((prev) => prev.map((product) => restoredById.get(String(product.id)) || product));

      addLog('Deshacer Importacion Excel', {
        count: safeItems.length,
        undoneRowIds: safeItems.map((item) => item.rowId),
        items: safeItems.map((item) => ({
          id: item.productId,
          title: item.productTitle,
          beforeUndo: item.after,
          restored: item.before,
          restoredBarcodeOwner: item.clearedBarcodeOwner || null,
        })),
      }, 'Productos Avanzado');

      Swal.close();
      showNotification('success', 'Importacion deshecha', `Se restauraron ${safeItems.length} producto(s).`);
      return { undoneRowIds: safeItems.map((item) => item.rowId) };
    } catch (error) {
      console.error('Error deshaciendo importacion desde Excel:', error);
      Swal.fire('Error', error?.message || 'No se pudo deshacer la importacion.', 'error');
      return { undoneRowIds: [] };
    }
  };

  const dataUrlToProductImageFile = async (dataUrl, barcode) => {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      throw new Error('La imagen recibida no es valida.');
    }

    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const mime = blob.type || 'image/jpeg';
    const extension = mime.includes('png')
      ? 'png'
      : mime.includes('webp')
        ? 'webp'
        : mime.includes('gif')
          ? 'gif'
          : 'jpg';
    const safeBarcode = String(barcode || 'producto').replace(/[^a-z0-9_-]/gi, '').slice(0, 48) || 'producto';

    return new File([blob], `casa-alberto-${safeBarcode}.${extension}`, { type: mime });
  };

  const handleApplyProductImageImports = async (rowsToApply = []) => {
    if (blockIfOfflineReadonly('importar fotos de productos')) return { appliedIds: [], failedRows: [] };

    const safeRows = Array.isArray(rowsToApply)
      ? rowsToApply.filter((row) => row?.productId && row?.imageDataUrl)
      : [];

    if (safeRows.length === 0) {
      showNotification('warning', 'Sin fotos seleccionadas', 'Aprobá al menos una foto encontrada para aplicarla.');
      return { appliedIds: [], failedRows: [] };
    }

    try {
      const applied = [];
      const failedRows = [];
      setImageImportTask((current) => ({
        ...(current || {}),
        phase: 'applying',
        total: safeRows.length,
        processed: 0,
        applied: 0,
        errors: 0,
        updatedAt: Date.now(),
      }));

      for (const [rowIndex, row] of safeRows.entries()) {
        const publishApplyProgress = () => {
          setImageImportTask((current) => ({
            ...(current || {}),
            phase: 'applying',
            total: safeRows.length,
            processed: rowIndex + 1,
            applied: applied.length,
            errors: failedRows.length,
            updatedAt: Date.now(),
          }));
        };
        const currentProduct = inventory.find((product) => String(product.id) === String(row.productId));
        if (!currentProduct) {
          failedRows.push({ ...row, error: 'Producto no encontrado.' });
          publishApplyProgress();
          continue;
        }

        const currentProductDetail = isLocalDemoMode()
          ? currentProduct
          : await fetchProductCloudDetail(currentProduct.id).catch(() => currentProduct);

        if (hasProductImage(currentProductDetail || currentProduct) && !row.replaceExistingImage) {
          failedRows.push({ ...row, error: 'El producto ya tiene imagen.' });
          publishApplyProgress();
          continue;
        }

        try {
          let uploadedImage;
          if (isLocalDemoMode()) {
            uploadedImage = { image: row.imageDataUrl, imageThumb: row.imageDataUrl };
          } else {
            const file = await dataUrlToProductImageFile(
              row.imageDataUrl,
              row.barcode || `producto-${currentProduct.id}`
            );
            uploadedImage = await uploadProductImage(file);
          }

          const verifiedAt = new Date().toISOString();
          const existingSupplierLinks = (
            currentProductDetail?.supplierLinks ||
            currentProductDetail?.supplier_links ||
            currentProduct?.supplierLinks ||
            currentProduct?.supplier_links
          );
          const safeSupplierLinks = existingSupplierLinks && typeof existingSupplierLinks === 'object'
            ? existingSupplierLinks
            : {};
          const casaAlbertoLink = {
            provider: 'Cotillon Casa Alberto',
            providerCode: String(row.supplierCode || '').trim(),
            casaAlbertoId: String(row.casaAlbertoId || row.externalProductId || '').trim(),
            productUrl: row.productUrl || row.sourceUrl || '',
            imageUrl: row.imageUrl || '',
            foundTitle: row.foundTitle || '',
            matchedBy: row.fallbackSearch === 'trimmed_barcode'
              ? 'trimmed_barcode'
              : row.matchQuality || 'barcode_exact',
            inventoryBarcode: String(row.barcode || currentProduct.barcode || '').trim(),
            searchedQuery: row.searchedQuery || '',
            titleSimilarity: Number(row.titleSimilarity || 0),
            verifiedAt,
          };

          const { data, payload: savedPayload } = await updateWithSchemaFallback(
            'products',
            currentProduct.id,
            {
              image: uploadedImage.image,
              image_thumb: uploadedImage.imageThumb,
              supplier_links: {
                ...safeSupplierLinks,
                casa_alberto: casaAlbertoLink,
              },
            },
            CLOUD_SELECTS.products
          );
          if (!isLocalDemoMode() && row.replaceExistingImage) {
            const previousImage = currentProductDetail?.image || currentProduct.image || row.previousImageUrl || '';
            const previousThumb =
              currentProductDetail?.image_thumb ||
              currentProductDetail?.imageThumb ||
              currentProduct.image_thumb ||
              currentProduct.imageThumb ||
              row.previousImageThumbUrl ||
              '';
            if (previousImage && previousImage !== uploadedImage.image) {
              await deleteProductImage(previousImage).catch(() => {});
            }
            if (previousThumb && previousThumb !== uploadedImage.imageThumb && previousThumb !== previousImage) {
              await deleteProductImage(previousThumb).catch(() => {});
            }
          }
          const updatedProduct = mapInventoryRecords([data])[0];
          applied.push({
            product: updatedProduct,
            before: currentProduct,
            source: {
              provider: 'Cotillon Casa Alberto',
              barcode: row.barcode,
              providerCode: casaAlbertoLink.providerCode,
              casaAlbertoId: casaAlbertoLink.casaAlbertoId,
              productUrl: casaAlbertoLink.productUrl,
              matchedBy: casaAlbertoLink.matchedBy,
              supplierLinkSaved: Boolean(savedPayload?.supplier_links),
              foundTitle: row.foundTitle,
              sourceUrl: row.imageUrl || row.sourceUrl || row.url || '',
              searchedAt: verifiedAt,
            },
          });
        } catch (error) {
          failedRows.push({ ...row, error: error?.message || 'No se pudo guardar la foto.' });
        }

        publishApplyProgress();
      }

      if (applied.length > 0) {
        const updatedById = new Map(applied.map((entry) => [String(entry.product.id), entry.product]));
        setInventory((prev) => prev.map((product) => updatedById.get(String(product.id)) || product));

        addLog('Importacion Imagenes Productos', {
          count: applied.length,
          source: 'Productos Avanzado / Cotillon Casa Alberto',
          items: applied.map((entry) => ({
            id: entry.product.id,
            title: entry.product.title,
            barcode: entry.product.barcode || entry.source.barcode || '',
            imageStateBefore: entry.before.image ? 'Cargada' : 'Sin imagen',
            imageStateAfter: entry.product.image ? 'Cargada' : 'Sin imagen',
            photoUrl: entry.product.image || '',
            photoThumbUrl: entry.product.imageThumb || entry.product.image_thumb || entry.product.image || '',
            sourceUrl: entry.source.sourceUrl,
            productUrl: entry.source.productUrl,
            providerCode: entry.source.providerCode,
            casaAlbertoId: entry.source.casaAlbertoId,
            matchedBy: entry.source.matchedBy,
            supplierLinkSaved: entry.source.supplierLinkSaved,
            foundTitle: entry.source.foundTitle,
            searchedAt: entry.source.searchedAt,
          })),
        }, 'Productos Avanzado / Fotos por Codigo');
      }

      setImageImportTask((current) => ({
        ...(current || {}),
        phase: applied.length > 0 ? 'completed' : 'error',
        total: safeRows.length,
        processed: safeRows.length,
        applied: applied.length,
        errors: failedRows.length,
        updatedAt: Date.now(),
      }));

      return {
        appliedIds: applied.map((entry) => entry.product.id),
        products: applied.map((entry) => entry.product),
        failedRows,
      };
    } catch (error) {
      console.error('Error importando imagenes de productos:', error);
      setImageImportTask((current) => ({
        ...(current || {}),
        phase: 'error',
        errors: safeRows.length,
        updatedAt: Date.now(),
      }));
      showNotification('error', 'Error', error?.message || 'No se pudieron importar las fotos.');
      return { appliedIds: [], failedRows: safeRows.map((row) => ({ ...row, error: 'Fallo general.' })) };
    }
  };

  const handleBulkSaveSingle = async (product, editData) => {
    if (blockIfOfflineReadonly('guardar cambios de productos')) return;
    try {
      const isWeight = product.product_type === 'weight';
      const finalPrice = isWeight ? Number(editData.price) / 1000 : Number(editData.price);
      const finalCost = isWeight ? Number(editData.purchasePrice) / 1000 : Number(editData.purchasePrice);
      const requestedStock = isWeight ? Number(editData.stock) : Number(editData.stock);

      const payload = { price: finalPrice, purchasePrice: finalCost };
      const before = {
        price: Number(product.price || 0),
        purchasePrice: Number(product.purchasePrice || 0),
        stock: Number(product.stock || 0),
      };
      const stockDelta = requestedStock - before.stock;
      const changes = [
        before.price !== finalPrice && { field: 'Precio Venta', old: before.price, new: finalPrice, isPrice: true },
        before.purchasePrice !== finalCost && { field: 'Precio Costo', old: before.purchasePrice, new: finalCost, isPrice: true },
        before.stock !== requestedStock && { field: 'Stock', old: before.stock, new: requestedStock },
      ].filter(Boolean);

      const { error } = await supabase.from('products').update(payload).eq('id', product.id);
      if (error) throw error;
      const finalStock = stockDelta !== 0
        ? await applyProductStockDeltaCloud(product, stockDelta)
        : before.stock;

      setInventory(inventory.map(p => p.id === product.id ? { ...p, price: finalPrice, purchasePrice: finalCost, stock: finalStock } : p));
      addLog('Edicion Rapida Productos Avanzado', {
        id: product.id,
        title: product.title,
        source: 'Productos Avanzado',
        before,
        after: { price: finalPrice, purchasePrice: finalCost, stock: finalStock },
        changes,
      }, 'Productos Avanzado / Editor Masivo');
      
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
      
      const promises = bulkData.map(async (item) => {
        const { product, edits } = item;
        const isWeight = product.product_type === 'weight';
        const finalPrice = isWeight ? Number(edits.price) / 1000 : Number(edits.price);
        const finalCost = isWeight ? Number(edits.purchasePrice) / 1000 : Number(edits.purchasePrice);
        const requestedStock = isWeight ? Number(edits.stock) : Number(edits.stock);
        const before = {
          price: Number(product.price || 0),
          purchasePrice: Number(product.purchasePrice || 0),
          stock: Number(product.stock || 0),
        };
        const stockDelta = requestedStock - before.stock;
        const changes = [
          before.price !== finalPrice && { field: 'Precio Venta', old: before.price, new: finalPrice, isPrice: true },
          before.purchasePrice !== finalCost && { field: 'Precio Costo', old: before.purchasePrice, new: finalCost, isPrice: true },
          before.stock !== requestedStock && { field: 'Stock', old: before.stock, new: requestedStock },
        ].filter(Boolean);

        const { error } = await supabase.from('products').update({ price: finalPrice, purchasePrice: finalCost })
          .eq('id', product.id);
        if(error) throw error;

        const finalStock = stockDelta !== 0
          ? await applyProductStockDeltaCloud(product, stockDelta)
          : before.stock;

        return {
          id: product.id,
          title: product.title,
          finalPrice,
          finalCost,
          finalStock,
          before,
          after: { price: finalPrice, purchasePrice: finalCost, stock: finalStock },
          changes,
        };
      });

      const results = await Promise.all(promises);

      setInventory(prev => prev.map(p => {
        const updated = results.find(r => r.id === p.id);
        if (updated) {
          return { ...p, price: updated.finalPrice, purchasePrice: updated.finalCost, stock: updated.finalStock };
        }
        return p;
      }));

      addLog('Edicion Masiva Productos Avanzado', {
        count: results.length,
        source: 'Productos Avanzado',
        items: results.map((result) => ({
          id: result.id,
          title: result.title,
          before: result.before,
          after: result.after,
          changes: result.changes,
        })),
      }, 'Productos Avanzado / Editor Masivo');

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
    if (!hasPermission(currentUserRef.current, 'inventory.create')) {
      showNotification('error', 'Permiso requerido', 'Necesitas permiso para crear productos para duplicarlos.');
      return;
    }
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
    const explicitCode = String(item?.couponCode || item?.coupon_code || '').trim();
    if (explicitCode) return explicitCode.toUpperCase();

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

    const reenabledCodes = new Set(getCouponUsageOverrides(client).reenabledCodes);
    const activeUsedCoupons = Array.from(new Set(usedCoupons))
      .filter((code) => !reenabledCodes.has(String(code || '').trim().toUpperCase()));

    return {
      ...client,
      usedCoupons: activeUsedCoupons,
      couponUsageReenabledCodes: Array.from(reenabledCodes),
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
    const requiredStock = buildSaleRequiredStock(cart);
    const checkoutStockDelta = buildSaleStockDelta(requiredStock, -1);
    const { stockIssues } = getSaleStockDeltaPreview(checkoutStockDelta);

    if (stockIssues.length > 0) { 
      showNotification('error', 'Falta Stock', `Revisar: ${stockIssues.join(', ')}`); 
      return; 
    }

    try {
      Swal.fire({ title: 'Procesando...', didOpen: () => Swal.showLoading() });

      const pointsEarned = Math.floor(total / 500)
      const pointsSpent = cart.reduce((acc, i) => acc + (i.isReward ? i.pointsCost : 0), 0);
      const clientId = toOptionalDbId(posSelectedClient?.id);
      const actor = getActorContext();
      const saleCouponCodes = Array.from(
        new Set(cart.map((item) => extractCouponCodeFromSaleItem(item)).filter(Boolean)),
      );

      const salePayload = {
        total,
        payment_method: paymentSummary,
        payment_breakdown: normalizedPaymentBreakdown,
        installments: primaryInstallments,
        client_id: clientId,
        points_earned: clientId ? pointsEarned : 0,
        points_spent: pointsSpent,
        user_id: toOptionalDbId(actor.userId),
        user_role: actor.userRole,
        user_name: actor.userName,
        cash_received: cashReceived,
        cash_change: cashChange,
      };

      const buildItemsPayload = (saleId = null) => cart.map(i => ({
          ...(saleId ? { sale_id: saleId } : {}),
          product_id: getSaleItemDatabaseProductId(i),
          product_title: i.title,
          quantity: i.quantity,
          price: i.price,
          subtotal: (Number(i.price) || 0) * (Number(i.quantity) || 0),
          is_reward: !!i.isReward,
          product_type: i.product_type || 'quantity',
          ...getSaleItemCostPayload(i),
      }));
      const validatedItemsPayload = await sanitizeSaleItemProductIds(buildItemsPayload());

      let stockChanges = [];
      let updatedClientForTicket = null;
      let pointsChange = null;
      const previousPoints = clientId ? Number(posSelectedClient?.points || 0) : 0;
      const newPoints = clientId ? previousPoints - pointsSpent + pointsEarned : 0;
      const previousCouponOverrides = clientId ? getCouponUsageOverrides(posSelectedClient).reenabledCodes : [];
      const consumedCouponOverrides = new Set(saleCouponCodes);
      const nextCouponOverrides = previousCouponOverrides.filter((code) => !consumedCouponOverrides.has(code));
      const shouldConsumeCouponOverride = clientId && previousCouponOverrides.length !== nextCouponOverrides.length;
      const nextClientSocialConnections = shouldConsumeCouponOverride
        ? buildSocialConnectionsWithCouponUsageOverrides(
            getSocialConnections(posSelectedClient),
            { reenabledCodes: nextCouponOverrides },
          )
        : getSocialConnections(posSelectedClient);

      if (clientId) {
        pointsChange = { previous: previousPoints, new: newPoints, diff: newPoints - previousPoints };
        updatedClientForTicket = {
          ...posSelectedClient,
          points: newPoints,
          currentPoints: newPoints,
          memberNumber: posSelectedClient?.memberNumber || posSelectedClient?.member_number || null,
          created_at: posSelectedClient?.created_at || posSelectedClient?.createdAt || null,
          createdAt: posSelectedClient?.createdAt || posSelectedClient?.created_at || null,
          ...(shouldConsumeCouponOverride ? { socialConnections: nextClientSocialConnections } : {}),
          couponUsageReenabledCodes: nextCouponOverrides,
        };
      }

      let sale = await registerSaleTransactionCloud({
        salePayload,
        itemsPayload: validatedItemsPayload,
        stockDeltaByProduct: checkoutStockDelta,
        clientPointUpdates: clientId
          ? [{ client_id: String(clientId), points: newPoints }]
          : [],
      });

      if (sale && shouldConsumeCouponOverride && clientId && !isLocalDemoMode()) {
        const { error: couponOverrideUpdateError } = await supabase
          .from('clients')
          .update({ social_connections: nextClientSocialConnections })
          .eq('id', clientId);
        if (couponOverrideUpdateError) {
          throw new Error(`Fallo actualizando cupones habilitados del cliente: ${couponOverrideUpdateError.message}`);
        }
      }

      if (sale) {
        stockChanges = getSaleStockDeltaPreview(checkoutStockDelta).stockChanges;
        setInventory((prev) =>
          prev.map((product) => {
            const delta = checkoutStockDelta[String(product.id)];
            return delta ? { ...product, stock: Number(product.stock || 0) + Number(delta || 0) } : product;
          })
        );
      } else {
        const { data: insertedSale, error: saleErr } = await insertWithSchemaFallback('sales', salePayload, 'id');
        if (saleErr) throw saleErr;
        sale = insertedSale;
        const itemsPayload = validatedItemsPayload.map((item) => ({ ...item, sale_id: sale.id }));
        const saleItemsPromise = insertRowsWithSchemaFallback('sale_items', itemsPayload).catch((saleItemsErr) => {
          throw new Error(`Supabase rechaz\u00f3 los productos de la venta: ${saleItemsErr.message}`);
        });

        const stockPromise = applySaleStockDelta(checkoutStockDelta).then(({ stockChanges, stockIssues: stockApplyIssues }) => {
          if (stockApplyIssues.length > 0) {
            throw new Error(`Stock insuficiente: ${stockApplyIssues.join(', ')}`);
          }
          return stockChanges;
        });

        const clientUpdatePromise = (async () => {
          if (!clientId) return;

          if (!isLocalDemoMode()) {
            const clientUpdates = shouldConsumeCouponOverride
              ? { points: newPoints, social_connections: nextClientSocialConnections }
              : { points: newPoints };
            const { error: clientUpdateError } = await supabase.from('clients').update(clientUpdates).eq('id', clientId);
            if (clientUpdateError) {
              throw new Error(`Fallo actualizando puntos del cliente: ${clientUpdateError.message}`);
            }
          }
        })();

        const [appliedStockChanges] = await Promise.all([
          stockPromise,
          saleItemsPromise,
          clientUpdatePromise,
        ]);
        stockChanges = appliedStockChanges;
      }

      if (updatedClientForTicket) {
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
        pointsChange,
      };

      tx.isTest = isTestRecord(tx);
      upsertLocalTransaction(tx);

      const logItems = cart.map(item => ({
        id: item.id,
        title: item.title,
        quantity: item.quantity,
        price: item.price,
        subtotal: (Number(item.price) || 0) * (Number(item.quantity) || 0),
        isReward: item.isReward || false,
        isDiscount: item.isDiscount || false,
        couponCode: item.couponCode || item.coupon_code || undefined,
        type: item.type || (item.isDiscount ? 'discount' : undefined),
        product_type: item.product_type || 'quantity',
        isCustom: item.isCustom || false,
        isCombo: item.isCombo || false,
        ...getSaleItemSnapshotCost(item),
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
      
      await addLog('Venta Realizada', {
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
      Swal.fire({ title: 'Anulando...', text: 'Preparando anulación...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      const refundRequiredStock = buildSaleRequiredStock(tx.items || []);
      const refundStockDelta = buildSaleStockDelta(refundRequiredStock, 1);
      const { stockChanges: restoredStockChangesPreview, stockIssues: refundStockIssues } =
        getSaleStockDeltaPreview(refundStockDelta);
      if (refundStockIssues.length > 0) {
        throw new Error(`No se pudo restaurar stock: ${refundStockIssues.join(', ')}`);
      }

      const clientMemberNumber = tx.client?.memberNumber || tx.client?.number || tx.memberNumber;
      let updatedMembers = [...members];
      let restoredStockChanges = restoredStockChangesPreview;
      let pointsChange = null; 
      const clientPointUpdates = [];
      
      if (clientMemberNumber && clientMemberNumber !== '---') {
        const clientIndex = updatedMembers.findIndex(m => String(m.memberNumber) === String(clientMemberNumber));
        if (clientIndex !== -1) {
          const dbClient = updatedMembers[clientIndex];
          const previousPoints = dbClient.points;
          const newPoints = Math.max(0, dbClient.points - (tx.pointsEarned || 0) + (tx.pointsSpent || 0));
          
          updatedMembers[clientIndex] = { ...dbClient, points: newPoints };
          pointsChange = { previous: previousPoints, new: newPoints, diff: newPoints - previousPoints };
          clientPointUpdates.push({ client_id: String(dbClient.id), points: newPoints });
        }
      }

      Swal.fire({ title: 'Anulando...', text: 'Guardando anulación...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

      const voidedAt = new Date().toISOString();
      const transactionalVoid = await voidSaleTransactionCloud({
        saleId: tx.id,
        voidedAt,
        stockDeltaByProduct: refundStockDelta,
        clientPointUpdates,
      });

      if (transactionalVoid) {
        setInventory((prev) =>
          prev.map((product) => {
            const delta = refundStockDelta[String(product.id)];
            return delta ? { ...product, stock: Number(product.stock || 0) + Number(delta || 0) } : product;
          })
        );
      } else {
        const stockResult = await applySaleStockDelta(refundStockDelta);
        restoredStockChanges = stockResult.stockChanges;
        if (stockResult.stockIssues.length > 0) {
          throw new Error(`No se pudo restaurar stock: ${stockResult.stockIssues.join(', ')}`);
        }

        for (const update of clientPointUpdates) {
          if (!isLocalDemoMode()) {
            const { error: clientErr } = await supabase.from('clients').update({ points: update.points }).eq('id', update.client_id);
            if (clientErr) throw new Error(`Fallo actualizando puntos: ${clientErr.message}`);
          }
        }

        await updateWithSchemaFallback(
          'sales',
          tx.id,
          {
            status: 'voided',
            voided_at: voidedAt,
          },
          'id',
        );
      }
      setMembers(updatedMembers);

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
      const [transactionsReloaded, historyReloaded] = await Promise.all([
        loadTransactionsCloudData({ force: true })
          .then(() => true)
          .catch((error) => {
            console.warn('No se pudo refrescar ventas despues de anular:', error);
            return false;
          }),
        loadHistoryCloudData({ force: true })
          .then(() => true)
          .catch((error) => {
            console.warn('No se pudo refrescar historial despues de anular:', error);
            return false;
          }),
      ]);
      
      Swal.close();
      showNotification('success', 'Venta Anulada', 'El stock y los puntos han sido restaurados.');
      if (!transactionsReloaded || !historyReloaded) {
        showNotification('warning', 'Actualizacion parcial', 'La venta se guardo, pero no se pudo refrescar todo el historial automaticamente.');
      }

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

    const restoreRequiredStock = buildSaleRequiredStock(tx.items || []);
    const restoreStockDelta = buildSaleStockDelta(restoreRequiredStock, -1);
    const { stockIssues } = getSaleStockDeltaPreview(restoreStockDelta);
    
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
          client_id: toOptionalDbId(clientId),
          points_earned: tx.pointsEarned || 0,
          points_spent: tx.pointsSpent || 0,
          user_name: tx.user || currentUser.name
      };

      if (origCreatedAt) salePayload.created_at = origCreatedAt;

      const buildRestoredItemsPayload = (saleId = null) => (tx.items || []).map(i => {
          const prod = inventory.find(p => 
               (i.productId && String(p.id) === String(i.productId)) || 
               (i.id && String(p.id) === String(i.id)) ||
               p.title === i.title
          );
          
          const prodId = getSaleItemDatabaseProductId({
            ...i,
            productId: prod ? prod.id : (i.productId || i.id),
          });
          
          return {
              ...(saleId ? { sale_id: saleId } : {}),
              product_id: prodId, 
              product_title: i.title, 
              quantity: i.qty || i.quantity, 
              price: i.price, 
              is_reward: !!i.isReward,
              product_type: i.product_type || 'quantity',
              ...getSaleItemCostPayload(i),
          };
      });
      const restoredItemsPayload = await sanitizeSaleItemProductIds(buildRestoredItemsPayload());

      const clientPointUpdates = [];
      if (clientDb) {
          const previousPoints = clientDb.points;
          const newPoints = clientDb.points + (tx.pointsEarned || 0) - (tx.pointsSpent || 0);
          
          pointsChange = { previous: previousPoints, new: newPoints, diff: newPoints - previousPoints };
          clientPointUpdates.push({ client_id: String(clientDb.id), points: newPoints });
      }

      let stockChanges = [];
      let newSale = await registerSaleTransactionCloud({
        salePayload,
        itemsPayload: restoredItemsPayload,
        stockDeltaByProduct: restoreStockDelta,
        clientPointUpdates,
      });

      if (newSale) {
        stockChanges = getSaleStockDeltaPreview(restoreStockDelta).stockChanges;
        setInventory((prev) =>
          prev.map((product) => {
            const delta = restoreStockDelta[String(product.id)];
            return delta ? { ...product, stock: Number(product.stock || 0) + Number(delta || 0) } : product;
          })
        );
      } else {
        const { data: insertedSale } = await insertWithSchemaFallback('sales', salePayload, 'id');
        newSale = insertedSale;

        const itemsPayload = restoredItemsPayload.map((item) => ({ ...item, sale_id: newSale.id }));
        if (itemsPayload.length > 0) {
            await insertRowsWithSchemaFallback('sale_items', itemsPayload);
        }

        const stockResult = await applySaleStockDelta(restoreStockDelta);
        stockChanges = stockResult.stockChanges;
        if (stockResult.stockIssues.length > 0) {
          throw new Error(`Stock insuficiente: ${stockResult.stockIssues.join(', ')}`);
        }

        for (const update of clientPointUpdates) {
          if (!isLocalDemoMode()) {
            const { error: pointsError } = await supabase.from('clients').update({ points: update.points }).eq('id', update.client_id);
            if (pointsError) throw new Error(`Fallo actualizando puntos: ${pointsError.message}`);
          }
        }
      }

      if (clientDb && clientPointUpdates.length > 0) {
          const nextPoints = clientPointUpdates[0].points;
          setMembers((prev) =>
            prev.map((member) =>
              member.id === clientDb.id
                ? {
                    ...member,
                    points: nextPoints,
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
         stockChanges,
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
           categories: Array.isArray(i.categories) ? i.categories : null,
           ...getSaleItemSnapshotCost(i),
           productsIncluded: Array.isArray(i.productsIncluded) ? i.productsIncluded : undefined
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
    const qtyToAdd = product.product_type === 'weight' ? 1000 : 1;
    let updatedItems;
    if (existingItemIndex !== -1) {
      updatedItems = editingTransaction.items.map((i, idx) =>
        idx === existingItemIndex
          ? {
              ...clearSaleLineDerivedTotals(i),
              qty: (Number(i.qty ?? i.quantity ?? 0) || 0) + qtyToAdd,
              quantity: (Number(i.qty ?? i.quantity ?? 0) || 0) + qtyToAdd,
            }
          : i
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
          qty: qtyToAdd,
          product_type: product.product_type || 'quantity',
        },
      ];
    }
    const newTotal = getEditedTransactionTotal(updatedItems, editingTransaction.payment);
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
    const newTotal = getEditedTransactionTotal(updatedItems, editingTransaction.payment);
    setEditingTransaction({ ...editingTransaction, items: updatedItems, total: newTotal });
  };

  const setTxItemQty = (itemIndex, val) => {
    if (!editingTransaction) return;
    const qty = parseInt(val);
    if (isNaN(qty) || qty < 1) return;
    const updatedItems = editingTransaction.items.map((item, idx) => {
      if (idx === itemIndex) {
        return { ...clearSaleLineDerivedTotals(item), qty, quantity: qty };
      }
      return item;
    });
    const newTotal = getEditedTransactionTotal(updatedItems, editingTransaction.payment);
    setEditingTransaction({ ...editingTransaction, items: updatedItems, total: newTotal });
  };

  const handleEditTxPaymentChange = (newPayment) => {
    if (!editingTransaction) return;
    const newTotal = getEditedTransactionTotal(editingTransaction.items, newPayment);
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
    const editedBaseTotal = getEditedTransactionTotal(editingTransaction.items, 'Efectivo');
    const editedPaymentBreakdown = buildEditedTransactionPaymentBreakdown(editingTransaction, editedBaseTotal);
    const editedPaymentTotals = getPaymentBreakdownTotals(editedPaymentBreakdown);
    const finalTotal = editedPaymentTotals.baseTotal > 0
      ? editedPaymentTotals.chargedTotal
      : getEditedTransactionTotal(editingTransaction.items, editingTransaction.payment);

    const safeCashReceived = editedPaymentTotals.cashReceivedTotal || 0;
    const safeCashChange = editedPaymentTotals.cashChangeTotal || 0;

    if (editedPaymentTotals.cashMissingTotal > 0) {
      showNotification('warning', 'Monto insuficiente', 'El monto recibido en efectivo debe cubrir el total luego de la modificación.');
      return;
    }

    try {
      Swal.fire({ title: 'Guardando cambios...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

      // 1. Detección de cambios básicos
      const changes = {};
      if (originalTx.total !== finalTotal) changes.total = { old: originalTx.total, new: finalTotal };
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
      const finalItems = editingTransaction.items.map((i) => {
        const normalizedItem = {
          ...clearSaleLineDerivedTotals(i),
          qty: Number(i.qty ?? i.quantity ?? 0),
          price: Number(i.price || 0),
          title: i.title || i.product_title || i.name || 'Producto',
        };
        return {
          ...normalizedItem,
          subtotal: getSaleLineSubtotal(normalizedItem),
        };
      });

      // [Cálculo de diferencias para stock]
      const previousRequiredStock = buildSaleRequiredStock(originalTx.items || []);
      const nextRequiredStock = buildSaleRequiredStock(finalItems);
      const stockDeltaByProduct = buildSaleStockDiffDelta(previousRequiredStock, nextRequiredStock);
      const productChanges = buildSaleProductChanges(previousRequiredStock, nextRequiredStock);
      const { stockIssues: editStockIssues } = getSaleStockDeltaPreview(stockDeltaByProduct);
      if (editStockIssues.length > 0) {
        throw new Error(`Stock insuficiente para guardar la modificacion: ${editStockIssues.join(', ')}`);
      }

      // [Cálculo de puntos]
      let pointsChange = null;
      let clientObj = editingTransaction.client || null;
      let cName = null; let cNum = null;
      const getMemberIdFromTx = (tx) => {
        if (tx?.client && typeof tx.client === 'object' && tx.client.id) return tx.client.id;
        const memberNumber = tx?.client?.memberNumber || tx?.memberNumber || null;
        return memberNumber
          ? members.find((member) => String(member.memberNumber) === String(memberNumber))?.id || null
          : null;
      };
      const originalClientId = getMemberIdFromTx(originalTx);
      const nextClientId = clientObj && typeof clientObj === 'object' && clientObj.id ? clientObj.id : null;
      const nextPointsEarned = nextClientId ? Math.floor(finalTotal / 500) : 0;
      const nextPointsSpent = nextClientId ? Number(editingTransaction.pointsSpent || 0) : 0;
      const previousPointsEarned = Number(originalTx.pointsEarned || 0);
      const previousPointsSpent = Number(originalTx.pointsSpent || 0);

      if (clientObj && typeof clientObj === 'object' && clientObj.name !== 'No asociado') {
         cName = clientObj.name; cNum = clientObj.memberNumber || clientObj.member_number || null;
      } else if (typeof clientObj === 'string' && clientObj !== 'No asociado') {
         cName = clientObj;
      }

      const previousNetPoints = previousPointsEarned - previousPointsSpent;
      const nextNetPoints = nextPointsEarned - nextPointsSpent;
      if (String(originalClientId || '') !== String(nextClientId || '') || previousNetPoints !== nextNetPoints) {
        pointsChange = {
          previous: previousNetPoints,
          new: nextNetPoints,
          diff: nextNetPoints - previousNetPoints,
          previousClientId: originalClientId,
          newClientId: nextClientId,
          pointsEarned: nextPointsEarned,
          pointsSpent: nextPointsSpent,
        };
      }

      // ==========================================
      // INICIO TRANSACCIÓN A LA NUBE (BLINDADA)
      // ==========================================
      
      const salePatch = {
        total: finalTotal,
        payment_method: editingTransaction.payment,
        payment_breakdown: editedPaymentBreakdown || null,
        installments: editingTransaction.installments || 0,
        client_id: toOptionalDbId(nextClientId),
        points_earned: nextPointsEarned,
        points_spent: nextPointsSpent,
        cash_received: safeCashReceived,
        cash_change: safeCashChange
      };

      const newItemsPayload = await sanitizeSaleItemProductIds(finalItems.map(i => ({
          sale_id: editingTransaction.id,
          product_id: getSaleItemDatabaseProductId(i),
          product_title: i.title,
          quantity: i.qty,
          price: i.price,
          subtotal: i.subtotal,
          product_type: i.product_type || 'quantity',
          is_reward: !!i.isReward,
          ...getSaleItemCostPayload(i),
      })));
      
      const clientPointUpdates = [];
      if (pointsChange) {
        const pointDeltas = new Map();
        if (originalClientId) {
          pointDeltas.set(String(originalClientId), (pointDeltas.get(String(originalClientId)) || 0) - previousNetPoints);
        }
        if (nextClientId) {
          pointDeltas.set(String(nextClientId), (pointDeltas.get(String(nextClientId)) || 0) + nextNetPoints);
        }

        for (const [memberId, delta] of pointDeltas.entries()) {
          if (!delta) continue;
          const clientDb = members.find((member) => String(member.id) === String(memberId));
          if (!clientDb) continue;
          const finalPoints = Math.max(0, Number(clientDb.points || 0) + delta);
          clientPointUpdates.push({ client_id: String(memberId), points: finalPoints });
        }
      }

      let stockChanges = [];
      const transactionalEdit = await editSaleTransactionCloud({
        saleId: editingTransaction.id,
        salePatch,
        itemsPayload: newItemsPayload,
        stockDeltaByProduct,
        clientPointUpdates,
      });

      if (transactionalEdit) {
        stockChanges = getSaleStockDeltaPreview(stockDeltaByProduct).stockChanges;
        setInventory((prev) =>
          prev.map((product) => {
            const delta = stockDeltaByProduct[String(product.id)];
            return delta ? { ...product, stock: Number(product.stock || 0) + Number(delta || 0) } : product;
          })
        );
      } else {
        await updateWithSchemaFallback('sales', editingTransaction.id, salePatch, 'id');

        const { error: delErr } = await supabase.from('sale_items').delete().eq('sale_id', editingTransaction.id);
        if (delErr) throw new Error("Fallo limpiando base: " + delErr.message);

        try {
          await insertRowsWithSchemaFallback('sale_items', newItemsPayload);
        } catch (insertErr) {
          throw new Error("Supabase rechazó los productos: " + insertErr.message);
        }

        const stockResult = await applySaleStockDelta(stockDeltaByProduct);
        stockChanges = stockResult.stockChanges;
        if (stockResult.stockIssues.length > 0) {
          throw new Error(`Stock insuficiente para guardar la modificacion: ${stockResult.stockIssues.join(', ')}`);
        }

        for (const update of clientPointUpdates) {
          const { error: pointsError } = await supabase.from('clients').update({ points: update.points }).eq('id', update.client_id);
          if (pointsError) {
            throw new Error(`Fallo actualizando puntos del cliente: ${pointsError.message}`);
          }
        }
      }

      if (clientPointUpdates.length > 0) {
        setMembers((prev) =>
          prev.map((member) => {
            const update = clientPointUpdates.find((entry) => String(entry.client_id) === String(member.id));
            return update
              ? {
                  ...member,
                  points: update.points,
                  created_at: member.created_at || member.createdAt || null,
                  createdAt: member.createdAt || member.created_at || null,
                }
              : member;
          }),
        );
      }

      // F. Sincronizar UI Inmediatamente
      const finalTx = {
         ...editingTransaction,
         total: finalTotal,
         paymentBreakdown: editedPaymentBreakdown,
         items: finalItems, 
         client: nextClientId ? clientObj : null,
         memberNumber: cNum,
         pointsEarned: nextPointsEarned,
         pointsSpent: nextPointsSpent,
         cashReceived: safeCashReceived,
         cashChange: safeCashChange
      };
      
      finalTx.isTest = isTestRecord(finalTx);
      
      const currentTransactionsSnapshot = Array.isArray(dataStateRef.current.transactions)
        ? dataStateRef.current.transactions
        : [];
      const nextTransactionsSnapshot = currentTransactionsSnapshot.some((t) => String(t.id) === String(editingTransaction.id))
        ? currentTransactionsSnapshot.map((t) => (String(t.id) === String(editingTransaction.id) ? finalTx : t))
        : [finalTx, ...currentTransactionsSnapshot];

      rememberLocalTransactionOverride(finalTx);
      localDataMutationRef.current.transactions = Date.now();
      dataStateRef.current = {
        ...dataStateRef.current,
        transactions: nextTransactionsSnapshot,
      };
      setTransactions(nextTransactionsSnapshot);
      saveOfflineTransactionsSnapshot({
        savedAt: new Date().toISOString(),
        transactions: nextTransactionsSnapshot,
      });
      setModuleState('transactions', { status: 'loaded', dirty: true, lastLoadedAt: Date.now() });

      // G. Log
      const logDetails = {
         transactionId: editingTransaction.id, client: cName, memberNumber: cNum,
         total: finalTotal,
         previousTotal: Number(originalTx.total || 0),
         newTotal: finalTotal,
         payment: editingTransaction.payment,
         paymentBreakdown: editedPaymentBreakdown,
         installments: editingTransaction.installments || 0,
         pointsEarned: nextPointsEarned,
         pointsSpent: nextPointsSpent,
         cashReceived: safeCashReceived,
         cashChange: safeCashChange,
         changes, productChanges, stockChanges, itemsSnapshot: finalItems, pointsChange
      };
      addLog('Modificación Pedido', logDetails, editReason || 'Ajuste manual');

      await lastLogWritePromiseRef.current;

      Swal.update?.({
        title: 'Actualizando historial...',
        text: 'Sincronizando la venta modificada y el registro de acciones.',
      });

      await Promise.all([
        loadTransactionsCloudData({ force: true }),
        loadHistoryCloudData({ force: true }),
      ]);

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
        stock: Number(rewardData.stock) || 0,
        is_active: true
      };

      const { data } = await insertWithSchemaFallback('rewards', payload, CLOUD_SELECTS.rewards);
      const newReward = mapRewardRecords([data])[0];

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

      await updateWithSchemaFallback('rewards', id, payload, CLOUD_SELECTS.rewards);

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
      if (isLocalDemoMode()) {
        localDemoUpdateRow('rewards', id, { is_active: false });
      } else {
        await updateWithSchemaFallback('rewards', id, { is_active: false }, CLOUD_SELECTS.rewards);
      }

      const deletedReward = rewards.find(r => r.id === id);
      setRewards(rewards.filter(r => r.id !== id));
      addLog('Eliminar Premio', { id, title: deletedReward?.title || 'Premio eliminado', softDeleted: true });
      showNotification('success', 'Premio Eliminado', 'Se quitó del catálogo.');
    } catch (e) {
      console.error(e);
      showNotification('error', 'Error', 'No se pudo eliminar el premio.');
    }
  };

  const mainContentClass = [
    'flex-1',
    'min-w-0',
    'min-h-0',
    'app-main-content',
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
  const isMetricsModuleLoading = moduleLoadState.metrics.status === 'loading';
  const isProfitBaseDataPending =
    isAuthBootLoading ||
    isCloudLoading ||
    isReconnectAttempting ||
    ['idle', 'loading'].includes(moduleLoadState.core.status) ||
    ['idle', 'loading'].includes(moduleLoadState.transactions.status);
  const isDashboardProfitSyncing =
    isProfitBaseDataPending ||
    moduleLoadState.dashboard.status === 'loading';
  const isMetricsProfitSyncing =
    isProfitBaseDataPending ||
    moduleLoadState.metrics.status === 'loading';
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
  const metricsOfflineEmptyMessage =
    isOfflineReadOnly &&
    moduleLoadState.metrics.status !== 'loaded' &&
    transactions.length === 0 &&
    expenses.length === 0 &&
    pastClosures.length === 0 &&
    budgets.length === 0 &&
    orders.length === 0
      ? 'Sin conexion y sin snapshot local de metricas. Volve a intentarlo con internet.'
      : '';
  const cloudStatusMeta = (() => {
    if (isLocalDemoMode()) {
      return {
        shellClass: 'is-offline',
        iconClass: '',
        dotClass: '',
        title: 'Demo local',
        detail: 'Sin Supabase',
        icon: 'offline',
      };
    }

    const isAnyModuleLoading =
      moduleLoadState.core.status === 'loading' ||
      moduleLoadState.transactions.status === 'loading' ||
      moduleLoadState.dashboard.status === 'loading' ||
      moduleLoadState.history.status === 'loading' ||
      moduleLoadState.orders.status === 'loading' ||
      moduleLoadState.reports.status === 'loading' ||
      moduleLoadState.metrics.status === 'loading';

    if (isAuthBootLoading || isCloudLoading || isAnyModuleLoading || isReconnectAttempting) {
      return {
        shellClass: 'is-loading',
        iconClass: '',
        dotClass: '',
        title: 'Conectando',
        detail: isReconnectAttempting ? 'Reconectando...' : 'Sincronizando...',
        icon: 'loading',
      };
    }

    if (isOfflineReadOnly) {
      return {
        shellClass: 'is-offline',
        iconClass: '',
        dotClass: '',
        title: 'Sin conexión',
        detail: offlineSnapshotAt
          ? `Snapshot: ${formatDateAR(offlineSnapshotAt)}`
          : 'Datos locales.',
        icon: 'offline',
      };
    }

    return {
      shellClass: 'is-online',
      iconClass: '',
      dotClass: '',
      title: 'Conectada',
      detail: 'Sincronizada',
      icon: 'online',
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
    metrics: 'Métricas',
    logs: 'Registro de Acciones',
    sessions: 'Gestor de Sesiones',
    extras: 'Gestión de Extras',
    'bulk-editor': 'Productos',
    settings: 'Ajustes',
    'user-management': 'Gestión de usuarios',
  };

  if (!currentUser && (isAuthBootLoading || isCloudLoading)) return <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-100"><RefreshCw className="animate-spin text-fuchsia-600 mb-4" size={48} /><h2 className="text-xl font-bold">Cargando Nube...</h2></div>;

  if (!currentUser) {
    if (loginStep === 'password') {
      const user = selectedLoginUser;
      return (
        <div className="relative flex h-screen max-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,rgba(244,114,182,0.14)_0%,rgba(255,255,255,0.94)_28%,rgba(241,245,249,1)_72%)] px-4 py-4 sm:px-6">
          <AppVersionBadge theme={loginTheme} />
          <div className="relative max-h-[calc(100vh-32px)] w-full max-w-md overflow-y-auto rounded-[28px] border border-slate-200/80 bg-white/95 p-5 shadow-[0_30px_80px_rgba(15,23,42,0.16)] backdrop-blur sm:p-6">
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
              <div className="flex flex-col items-center px-5 pb-4 pt-5 text-center sm:px-6 sm:pb-5 sm:pt-6">
                <UserAvatar
                  avatar={user?.avatar}
                  name={user?.displayName || user?.name}
                  color={user?.nameColor || '#334155'}
                  sizeClass="h-20 w-20 shadow-[0_12px_24px_rgba(15,23,42,0.14)] sm:h-24 sm:w-24"
                  textClass="text-2xl"
                />
                <p className="mt-3 text-lg font-black text-slate-800 sm:mt-4">{user?.displayName || user?.name}</p>
              </div>

              <form onSubmit={handleSubmitLogin} className="border-t border-slate-200 bg-white px-5 pb-5 pt-4 sm:px-6 sm:pb-6 sm:pt-5">
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
                  type="button"
                  onClick={() => setRememberLoginSession((prev) => !prev)}
                  aria-pressed={rememberLoginSession}
                  className={`mt-4 flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                    rememberLoginSession
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]'
                      : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300 hover:bg-white'
                  }`}
                >
                  <span>
                    <span className="block text-xs font-black">Recordar sesion iniciada</span>
                    <span className="block text-[10px] font-semibold opacity-75">Hasta cerrar la app o cerrar usuario</span>
                  </span>
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-black ${
                      rememberLoginSession
                        ? 'border-emerald-500 bg-emerald-500 text-white'
                        : 'border-slate-300 bg-white text-transparent'
                    }`}
                  />
                </button>
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
      <div className="relative flex h-screen max-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,rgba(244,114,182,0.14)_0%,rgba(255,255,255,0.94)_28%,rgba(241,245,249,1)_72%)] px-4 py-4 sm:px-6">
        <AppVersionBadge theme={loginTheme} />
        <div className="relative flex max-h-[calc(100vh-32px)] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 p-4 text-center shadow-[0_30px_80px_rgba(15,23,42,0.16)] backdrop-blur sm:p-6 lg:p-7">
          <LoginThemeToggle theme={loginTheme} onToggle={handleToggleLoginTheme} />
          <div className="shrink-0 -mb-4 sm:-mb-3 lg:mb-0">
            <div className="mb-3 flex justify-center sm:mb-4">
            <button
              type="button"
              onClick={handleSystemLogoAccess}
              className="rounded-[18px] bg-white p-2 shadow-[0_12px_28px_rgba(15,23,42,0.12)] ring-1 ring-slate-200 transition hover:scale-[1.01]"
              aria-label="Logo de Rebu"
            >
              <img src={logoRebuImg} alt="Rebu" className="h-16 w-16 object-contain sm:h-20 sm:w-20 xl:h-24 xl:w-24" />
            </button>
          </div>
          <h1 className="mb-1 text-2xl font-black text-slate-800">Rebu Cotillón</h1>
          <p className="mb-8 text-sm font-medium text-slate-500">Seleccioná tu usuario para continuar</p>

          </div>

          <div className="min-h-0 text-left">
            {hasLoginUsers ? (
              <div className="grid max-h-[calc(100vh-240px)] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
                {visibleLoginUsers.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => handleSelectLoginUser(user.id)}
                    className="group overflow-hidden rounded-[22px] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.96)_0%,rgba(255,255,255,0.98)_100%)] text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition duration-200 hover:-translate-y-0.5 hover:border-fuchsia-200 hover:shadow-[0_18px_30px_rgba(15,23,42,0.1)]"
                  >
                    <div className="flex flex-col items-center px-4 pb-4 pt-5">
                      <UserAvatar
                        avatar={user.avatar}
                        name={user.displayName || user.name}
                        color={user.nameColor}
                        sizeClass="h-16 w-16 shadow-[0_12px_24px_rgba(15,23,42,0.14)] sm:h-20 sm:w-20 xl:h-24 xl:w-24"
                        textClass="text-xl sm:text-2xl"
                      />
                      <p className="mt-3 line-clamp-2 text-sm font-black text-slate-800 sm:text-base">{user.displayName}</p>
                    </div>
                    <div className="flex h-10 items-center justify-center gap-2 border-t border-slate-200 bg-white px-4 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 transition group-hover:text-fuchsia-700 sm:h-11 sm:text-[11px]">
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
      <div data-theme={currentTheme} className="app-shell print:hidden flex h-screen bg-slate-100 font-sans text-slate-900 text-sm overflow-hidden">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={handleMainTabSelect}
          currentUser={currentUser}
          currentTheme={currentTheme}
          isThemeSaving={isThemeSaving}
          onToggleTheme={handleToggleCurrentTheme}
          onLogout={handleLogout}
        />
        <div className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
          
          {isTestActive && (
            <div className="bg-orange-500 text-white text-xs font-bold px-4 py-2.5 flex items-center justify-center gap-2 z-50 shadow-md w-full animate-in slide-in-from-top">
              <AlertTriangle size={16} />
              <span>Estás usando la palabra "test". Esta acción no se contabilizará en el sistema y será usada solo como prueba.</span>
            </div>
          )}

          <header className="app-topbar relative z-10 flex h-14 shrink-0 items-center justify-between gap-4 border-b bg-white px-5 shadow-sm">
            <div className="app-topbar-main flex min-w-0 items-center gap-3">
              <div className="app-topbar-title">
                <h2 className="app-topbar-heading text-base font-bold text-slate-800 uppercase tracking-wide">
                  {activeTabTitles[activeTab] || activeTab}
                </h2>
                <div className="app-topbar-meta mt-0.5 flex items-center gap-2 text-[12px] font-bold text-slate-500">
                  <div
                    className={`app-cloud-status ${cloudStatusMeta.shellClass}`}
                    title={`${cloudStatusMeta.title} - ${cloudStatusMeta.detail}`}
                  >
                    <span className="app-cloud-status-dot" />
                    <span className="app-cloud-status-icon">
                      {cloudStatusMeta.icon === 'offline' ? (
                        <WifiOff size={12} />
                      ) : (
                        <Database size={12} />
                      )}
                    </span>
                    <span className="truncate">{cloudStatusMeta.title}</span>
                  </div>
                  <span className="app-topbar-clock">{formatDateAR(currentTime)} {formatTimeAR(currentTime)}hrs</span>
                </div>
              </div>
            </div>
            <div className="app-topbar-tools flex shrink-0 items-center gap-3">
              {imageImportTask && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsImageImportTaskOpen((current) => !current)}
                    className={`app-topbar-action ${
                      imageImportTask.phase === 'completed' ? 'text-emerald-700' : ''
                    }`}
                    title="Estado de la importacion de fotos"
                  >
                    {['searching', 'applying'].includes(imageImportTask.phase) ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : imageImportTask.phase === 'completed' ? (
                      <CheckCircle2 size={13} />
                    ) : (
                      <Camera size={13} />
                    )}
                    <span>
                      {imageImportTask.phase === 'applying'
                        ? `Guardando ${imageImportTask.processed || 0}/${imageImportTask.total || 0}`
                        : imageImportTask.phase === 'searching'
                          ? `Buscando ${imageImportTask.processed || 0}/${imageImportTask.total || 0}`
                          : imageImportTask.phase === 'paused'
                            ? 'Fotos pausadas'
                            : imageImportTask.phase === 'error'
                              ? 'Fotos con problemas'
                            : imageImportTask.phase === 'completed'
                              ? `${imageImportTask.applied || 0} fotos aplicadas`
                              : `${imageImportTask.found || 0} fotos encontradas`}
                    </span>
                  </button>

                  {isImageImportTaskOpen && (
                    <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-md border border-slate-200 bg-white p-3 text-left shadow-lg">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">Fotos por codigo</p>
                          <p className="mt-1 text-xs font-bold text-slate-800">
                            {imageImportTask.phase === 'applying'
                              ? 'Guardando fotos en productos'
                              : imageImportTask.phase === 'searching'
                                ? 'Buscando en Casa Alberto'
                                : imageImportTask.phase === 'paused'
                                  ? 'Busqueda pausada'
                                  : imageImportTask.phase === 'error'
                                    ? 'La tarea termino con problemas'
                                  : imageImportTask.phase === 'completed'
                                    ? 'Ultima aplicacion terminada'
                                    : 'Lote listo para revisar'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsImageImportTaskOpen(false)}
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          aria-label="Cerrar estado de fotos"
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full transition-all duration-300 ${
                            imageImportTask.phase === 'completed' ? 'bg-emerald-500' : 'bg-blue-500'
                          }`}
                          style={{
                            width: `${Math.min(
                              100,
                              Math.round(((imageImportTask.processed || 0) / Math.max(1, imageImportTask.total || 1)) * 100)
                            )}%`,
                          }}
                        />
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[10px] font-bold text-slate-500">
                        <span>{imageImportTask.processed || 0} procesadas</span>
                        <span>{imageImportTask.applied || 0} aplicadas</span>
                        <span>{imageImportTask.errors || 0} problemas</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('bulk-editor');
                          setImageImportOpenRequest((current) => current + 1);
                          setIsImageImportTaskOpen(false);
                        }}
                        className="mt-3 flex h-8 w-full items-center justify-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-[11px] font-black text-slate-700 transition-colors hover:bg-slate-100"
                      >
                        <Camera size={13} />
                        Ver lote de fotos
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div className="app-topbar-actions flex items-center gap-2">
                <button
                  onClick={canManageRegister ? toggleRegisterStatus : undefined}
                  className={`app-register-status ${isRegisterClosed ? 'is-closed' : 'is-open'} ${canManageRegister ? 'is-clickable' : 'is-readonly'}`}
                  title={canManageRegister ? '' : 'Necesitas permiso para cambiar el estado de la caja'}
                >
                  <Lock size={14} />
                  <span>{isRegisterClosed ? 'Caja cerrada' : 'Caja abierta'}</span>
                  {!isRegisterClosed && closingTime && (
                    <span className="app-register-status-cutoff">
                      <Clock size={12} />
                      {closingTime}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleSoftReload}
                  disabled={isSoftReloading || isForceReloading || isCloudLoading || isReconnectAttempting}
                  className="app-topbar-action"
                  title="Recargar ahora los datos base y el modulo visible"
                >
                  <RefreshCw size={12} className={isSoftReloading ? 'animate-spin' : ''} />
                  {isSoftReloading ? 'Actualizando' : 'Actualizar'}
                </button>
                <button
                  type="button"
                  onClick={handleForceReload}
                  disabled={isSoftReloading || isForceReloading || isCloudLoading || isReconnectAttempting}
                  className="app-topbar-action is-strong"
                  title="Recarga fuerte de base de datos sin reiniciar la aplicacion"
                >
                  <RefreshCw size={12} className={isForceReloading ? 'animate-spin' : ''} />
                  {isForceReloading ? 'Recargando' : 'Recarga total'}
                </button>
              </div>
            </div>
          </header>
          {isLocalDemoMode() && (
            <div className="flex flex-wrap items-center gap-2 border-b border-sky-200 bg-sky-50 px-5 py-2 text-[11px] font-semibold text-sky-900 shadow-sm">
              <span className="font-black uppercase tracking-[0.08em]">Modo demo local</span>
              <span className="text-sky-700">-</span>
              <span>No se lee ni se escribe en Supabase. Para salir, abrí la app con <span className="font-mono">?demo=0</span>.</span>
            </div>
          )}
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
                  transactions={transactions}
                  dailyLogs={dailyLogs}
                  inventory={inventory}
                  expenses={expenses}
                  isLoading={isDashboardModuleLoading && transactions.length === 0 && dailyLogs.length === 0}
                  isProfitSyncing={isDashboardProfitSyncing}
                  emptyStateMessage={dashboardOfflineEmptyMessage}
                  onOpenExpenseModal={() => {
                    setExpenseToEdit(null);
                    setIsExpenseModalOpen(true);
                  }}
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
                  onViewExpense={(expense) => {
                    setExpenseToEdit(expense);
                    setIsExpenseModalOpen(true);
                  }}
                  onRequireFullTransactions={() => loadTransactionsCloudData({ force: true })}
                />
              </PersistentTabPanel>
            )}
            {canAccessTab(currentUser, 'inventory') && <PersistentTabPanel tab="inventory" activeTab={activeTab} className="h-full min-h-0"><InventoryView inventory={inventory} categories={categories} currentUser={currentUser} inventoryViewMode={inventoryViewMode} setInventoryViewMode={setInventoryViewMode} gridColumns={inventoryGridColumns} setGridColumns={setInventoryGridColumns} inventorySearch={inventorySearch} setInventorySearch={setInventorySearch} inventoryCategoryFilter={inventoryCategoryFilter} setInventoryCategoryFilter={setInventoryCategoryFilter} setIsModalOpen={setIsModalOpen} setEditingProduct={handleEditProductRequest} handleDeleteProduct={handleDeleteProductRequest} setSelectedImage={setSelectedImage} setIsImageModalOpen={setIsImageModalOpen} closeDetailsToken={inventoryPanelCloseToken} navigationRequest={inventoryNavigationRequest} onProductDetailRequest={handleProductDetailRequest} /></PersistentTabPanel>}
            <PersistentTabPanel tab="pos" activeTab={activeTab} className="h-full min-h-0">{isRegisterClosed ? (<div className="h-full flex flex-col items-center justify-center text-slate-400"><Lock size={64} className="mb-4 text-slate-300" /><h3 className="text-xl font-bold text-slate-600">Caja Cerrada</h3>{canManageRegister ? (<><p className="mb-6">Debes abrir la caja para realizar ventas.</p><button onClick={toggleRegisterStatus} className="bg-green-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-green-700">Abrir Caja</button></>) : (<p className="mb-6 text-center">Necesitas permiso para abrir la caja y realizar ventas.</p>)}</div>) : (<POSView inventory={inventory} categories={categories} addToCart={addToCart} cart={cart} removeFromCart={removeFromCart} updateCartItemQty={updateCartItemQty} selectedPayment={selectedPayment} setSelectedPayment={setSelectedPayment} installments={installments} setInstallments={setInstallments} calculateTotal={calculateTotal} handleCheckout={handleCheckout} posSearch={posSearch} setPosSearch={setPosSearch} selectedCategory={posSelectedCategory} setSelectedCategory={setPosSelectedCategory} posViewMode={posViewMode} setPosViewMode={setPosViewMode} gridColumns={posGridColumns} setGridColumns={setPosGridColumns} selectedClient={posSelectedClient} setSelectedClient={setPosSelectedClient} onOpenClientModal={() => setIsClientModalOpen(true)} onOpenRedemptionModal={() => setIsRedemptionModalOpen(true)} onUpdateClient={handleUpdateMemberWithLog} offers={offers} currentUser={currentUser} userCatalog={userCatalog} />)}</PersistentTabPanel>
            <PersistentTabPanel tab="clients" activeTab={activeTab} className="h-full min-h-0"><ClientsView members={members} addMember={handleAddMemberWithLog} updateMember={handleUpdateMemberWithLog} deleteMember={handleDeleteMemberWithLog} currentUser={currentUser} userCatalog={userCatalog} onViewTicket={handleViewTicket} onEditTransaction={handleEditTransactionRequest} onDeleteTransaction={handleDeleteTransaction} transactions={transactions} checkExpirations={handleCheckMemberPointExpirations} /></PersistentTabPanel>
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
            {canViewMetrics && (<PersistentTabPanel tab="metrics" activeTab={activeTab} className="h-full min-h-0"><MetricsView transactions={transactions} expenses={expenses} pastClosures={pastClosures} inventory={inventory} members={members} budgets={budgets} orders={orders} dailyLogs={dailyLogs} currentUser={currentUser} userCatalog={userCatalog} isLoading={isMetricsModuleLoading && transactions.length === 0 && expenses.length === 0 && pastClosures.length === 0} isProfitSyncing={isMetricsProfitSyncing} emptyStateMessage={metricsOfflineEmptyMessage} onRefresh={async () => { await loadCoreCloudData({ force: true }); return loadMetricsCloudData({ force: true, includeTransactions: true }); }} isActive={activeTab === 'metrics'} /></PersistentTabPanel>)}
            {canViewLogs && (<PersistentTabPanel tab="logs" activeTab={activeTab} className="h-full min-h-0"><LogsView initialLogs={dailyLogs} onUpdateLogNote={handleUpdateLogNote} onReprintPdf={handleReprintPdf} userCatalog={userCatalog} inventory={inventory} isActive={activeTab === 'logs'} /></PersistentTabPanel>)}
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
                onApplyExcelImport={handleExcelProductImport}
                onUndoExcelImport={handleUndoExcelProductImport}
                onCreateExcelProducts={handleCreateExcelProducts}
                onApplyProductImageImports={handleApplyProductImageImports}
                onImageImportTaskChange={setImageImportTask}
                imageImportOpenRequest={imageImportOpenRequest}
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
        <EditTransactionModal transaction={editingTransaction} onClose={() => setEditingTransaction(null)} inventory={inventory} members={members} offers={offers} setEditingTransaction={setEditingTransaction} transactionSearch={transactionSearch} setTransactionSearch={setTransactionSearch} addTxItem={addTxItem} removeTxItem={removeTxItem} setTxItemQty={setTxItemQty} handlePaymentChange={handleEditTxPaymentChange} editReason={editReason} setEditReason={setEditReason} onSave={handleSaveEditedTransaction} />
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
        <ExpenseModal
          isOpen={isExpenseModalOpen}
          onClose={() => {
            setIsExpenseModalOpen(false);
            setExpenseToEdit(null);
          }}
          onSave={expenseToEdit ? (expenseData) => handleUpdateExpense(expenseToEdit.id, expenseData) : handleAddExpense}
          initialExpense={expenseToEdit}
          mode={expenseToEdit ? 'edit' : 'create'}
          readOnly={Boolean(expenseToEdit) && !hasPermission(currentUser, 'extras.expenses.manage')}
        />
        
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













