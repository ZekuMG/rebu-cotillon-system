import React, { lazy, Suspense, useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
  Bell,
  Loader2,
  CheckCircle2,
  X
} from 'lucide-react';
import Swal from 'sweetalert2';
import logoRebuImg from './assets/logo-rebu.jpg';
import appPackage from '../package.json';

// --- CONEXIÓN A LA NUBE ---
import { supabase, subscribeToRealtimeHeartbeat } from './supabase/client';
import {
  deleteProductImage,
  deleteUserAvatar,
  uploadProductImage,
  uploadProductThumbFromSource,
  uploadUserAvatar,
} from './utils/storage';
import { hasProductImage } from './utils/productImages';
import { formatCurrency, formatDateAR, formatNumber, formatTimeAR, formatTimeFullAR, isTestRecord } from './utils/helpers';
import { isFutureExpenseDate, normalizeExpenseDateValue } from './utils/expenseDates';
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
  isHistoryLogAction,
} from './utils/cloudSelects';
import {
  doesCloudLoadCoverRequest,
  fetchCloudPayloadWithMutationGuard,
  fetchCloudPayloadWithRetries,
  getIncrementalSyncCutoff,
  getLatestCloudRecordTimestamp,
  getProductSnapshotScope,
  mergeCloudRecordsById,
  PRODUCT_SNAPSHOT_SCOPE_FULL,
  PRODUCT_SNAPSHOT_SCOPE_PARTIAL,
  recordCloudSourceMutations,
  resolveCoveredCloudLoadResult,
  shouldUseIncrementalProductSync,
  summarizeCloudResults,
} from './utils/cloudLoadControl';
import {
  createRealtimeIdBatcher,
  createSingleFlightTask,
  getRealtimeRecordId,
  reconcileRealtimeHeartbeatState,
  reconcileRealtimePayload,
} from './utils/realtimeSync';
import {
  getTransactionSnapshotScope,
  saleRowsRequireHistoryLogs,
  shouldHydrateFullTransactionHistory,
  shouldUseIncrementalMetricsSync,
  shouldUseIncrementalTransactionSync,
  TRANSACTION_SNAPSHOT_SCOPE_FULL,
  TRANSACTION_SNAPSHOT_SCOPE_PARTIAL,
} from './utils/transactionSync';
import {
  DASHBOARD_SNAPSHOT_SCOPE_FULL,
  DASHBOARD_SNAPSHOT_SCOPE_PARTIAL,
  getDashboardSnapshotScope,
  shouldUseIncrementalDashboardSync,
} from './utils/dashboardSync';
import { isDashboardSourceStale } from './utils/dashboardPeriodAvailability';
import {
  createTransactionSnapshotPersistence,
  isTransactionHistorySnapshotFresh,
  loadTransactionHistorySnapshot,
  saveTransactionHistorySnapshot,
} from './utils/transactionHistoryCache';
import {
  buildSharedUserAvatarCache,
  compactSharedUsersSnapshot,
  hydrateSharedUsersSnapshotAvatars,
} from './utils/offlineSnapshots';
import {
  isEmbeddedUserAvatar,
  isUserAvatarStorageUrl,
} from './utils/userAvatarStorage';
import {
  extractSchemaMissingColumn,
  fetchAllCloudRowsByIdCursorWithSelectFallback,
  fetchAllCloudRowsWithSelectFallback,
  getSchemaMissingColumnName,
  isOptionalSchemaColumn,
  removeColumnFromSelect,
  runSelectWithSchemaFallback,
  sortCloudRowsNewestFirst,
} from './utils/supabaseSchemaFallback';
import { buildBudgetPdfPayload, deriveOrderStatus, hydrateBudgetSnapshot } from './utils/budgetHelpers';
import {
  buildSupplierPriceChangeReport,
  getSupplierPriceReportCutoff,
  getSupplierPriceReportPeriod,
  SUPPLIER_PRICE_REPORT_ACTIONS,
} from './utils/supplierPriceReport';
import {
  buildOrderOperationKey,
  getFinalizationPointsToCredit,
  isIncrementalOrderPoints,
} from './utils/orderPoints';
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
  hasUnsafeLegacyBootstrapPasswords,
  hasOwnerAccess,
  isUnsafeLegacyPassword,
  normalizeMetricsViewMode,
  setAppUserActive,
  signInSupabaseAuthForAppUser,
  updateAppUserPassword,
  updateAppUserPermissions,
  updateAppUserProfile,
  verifyAppUserLogin,
} from './utils/appUsers';
import {
  getAppUserDirectoryLoadErrorMessage,
  isMissingSharedUsersSchemaError,
  mergeAppUserDirectories,
  resolveLoginUsers,
  shouldLoadPrivateAppUserDirectory,
} from './utils/appUserLoadControl';
import { isPersistedSupabaseJwtError, retryOnSupabaseClockSkew } from './utils/supabaseAuthRecovery';
import { recordDiagnosticError } from './utils/diagnosticsLog';
import {
  assessSecureSession,
  getExpectedAuthUserId,
  SECURE_SESSION_STATUS,
} from './utils/secureSession';
import { getSupabaseDiagnosticMessage } from './utils/supabaseErrorDiagnostics';
import {
  canAccessTab,
  canEditUserProfile,
  canManageUserPermissions,
  canToggleUserActiveState,
  getDefaultTabForUser,
  getEffectivePermissions,
  hasPermission,
} from './utils/userPermissions';
import { isSafeExcelImportNumber } from './utils/excelImportNumbers';
import {
  createOrderPaymentEntry,
  createOrderPaymentLine,
  getPaymentBreakdownTotals,
  getPaymentMethodTotals,
  getOrderPaymentHistorySummary,
  getPrimaryPaymentInfo,
  normalizePaymentBreakdown,
  normalizeOrderPaymentHistory,
  replaceOrderDepositPaymentHistory,
} from './utils/paymentBreakdown';
import {
  hasDeferredOrderStockPolicy,
  isOrderStockReserved,
  markOrderItemsForDeferredStock,
} from './utils/orderStockPolicy';
import {
  createPosBagSaleItem,
  isPosBagItem,
} from './utils/posSaleExtras';
import {
  addPosCartTab,
  closePosCartTab,
  createPosCartWorkspace,
  getActivePosCart,
  normalizePosCartWorkspace,
  selectPosCartTab,
  updateActivePosCartField,
  updatePosCartTab,
} from './utils/posCartTabs';
import {
  buildCasaAlbertoEstimatedCost,
  buildSuggestedSalePriceFromMargin,
  getCasaAlbertoLink,
  getProductActiveState,
  getProductSupplierLinks,
  hasHydratedSupplierLinks,
  recordExcelImportApplication,
  removeCasaAlbertoLink,
  shouldAutoDisableOutOfStockProduct,
  updateStockLifecycleLinks,
  upsertCasaAlbertoLink,
  upsertCasaAlbertoPriceTracking,
  upsertExcelImportAlias,
} from './utils/productLifecycle';
import {
  buildSupplierAttentionSummary,
  loadSupplierNoticeDismissal,
  saveSupplierNoticeDismissal,
} from './utils/supplierPriceReview';
import {
  getExcelImportUndoConflicts,
  runExcelImportBatch,
} from './utils/excelImportOperations';
import {
  getStoredProductSalePrice,
  normalizeFinalSalePrice,
  normalizeStoredProductSalePrice,
} from './utils/finalSalePrice';
import {
  getStoredProductPurchaseCost,
  normalizeFinalPurchaseCost,
  normalizeStoredProductPurchaseCost,
} from './utils/finalPurchaseCost';

import {
  INITIAL_CATEGORIES,
  INITIAL_INVENTORY,
  INITIAL_MEMBERS,
  INITIAL_TRANSACTIONS,
  USERS,
} from './data';
import Sidebar from './components/Sidebar';

import UserAvatar from './components/UserAvatar';

const lazyNamedComponent = (importer, exportName) =>
  lazy(() => importer().then((module) => ({ default: module[exportName] })));

// Vistas: se cargan bajo demanda para que Electron no parse/ejecute toda la app al abrir.
const DashboardView = lazy(() => import('./views/DashboardView'));
const InventoryView = lazy(() => import('./views/InventoryView'));
const POSView = lazy(() => import('./views/POSView'));
const ClientsView = lazy(() => import('./views/ClientsView'));
const AgendaView = lazy(() => import('./views/AgendaView'));
const HistoryView = lazy(() => import('./views/HistoryView'));
const LogsView = lazy(() => import('./views/LogsView'));
const ExtrasView = lazy(() => import('./views/ExtrasView'));
const ReportsHistoryView = lazy(() => import('./views/ReportsHistoryView'));
const MetricsView = lazy(() => import('./views/MetricsView'));
const BulkEditorView = lazy(() => import('./views/BulkEditorView'));
const AiImageStudioView = lazy(() => import('./views/AiImageStudioView'));
const OrdersView = lazy(() => import('./views/OrdersView'));
const WhatsAppInboxView = lazy(() => import('./views/WhatsAppInboxView'));
const SessionsView = lazy(() => import('./views/SessionsView'));
const TicketTestView = lazy(() => import('./views/TicketTestView'));
const UserSettingsView = lazy(() => import('./views/UserSettingsView'));
const UserManagementView = lazy(() => import('./views/UserManagementView'));

// Los modales se descargan solo cuando su estado los vuelve visibles.
const OpeningBalanceModal = lazyNamedComponent(() => import('./components/modals/CashModals'), 'OpeningBalanceModal');
const ClosingTimeModal = lazyNamedComponent(() => import('./components/modals/CashModals'), 'ClosingTimeModal');
const CloseCashModal = lazyNamedComponent(() => import('./components/modals/CashModals'), 'CloseCashModal');
const AutoCloseAlertModal = lazyNamedComponent(() => import('./components/modals/CashModals'), 'AutoCloseAlertModal');
const AddProductModal = lazyNamedComponent(() => import('./components/modals/ProductModals'), 'AddProductModal');
const EditProductModal = lazyNamedComponent(() => import('./components/modals/ProductModals'), 'EditProductModal');
const DeleteProductModal = lazyNamedComponent(() => import('./components/modals/ProductModals'), 'DeleteProductModal');
const EditTransactionModal = lazyNamedComponent(() => import('./components/modals/TransactionModals'), 'EditTransactionModal');
const RefundModal = lazyNamedComponent(() => import('./components/modals/TransactionModals'), 'RefundModal');
const ImageModal = lazyNamedComponent(() => import('./components/modals/SaleModals'), 'ImageModal');
const SaleSuccessModal = lazyNamedComponent(() => import('./components/modals/SaleModals'), 'SaleSuccessModal');
const TicketModal = lazyNamedComponent(() => import('./components/modals/SaleModals'), 'TicketModal');
const NotificationModal = lazyNamedComponent(() => import('./components/modals/NotificationModal'), 'NotificationModal');
const BarcodeNotFoundModal = lazyNamedComponent(() => import('./components/modals/BarcodeModals'), 'BarcodeNotFoundModal');
const BarcodeDuplicateModal = lazyNamedComponent(() => import('./components/modals/BarcodeModals'), 'BarcodeDuplicateModal');
const ExpenseModal = lazyNamedComponent(() => import('./components/modals/ExpenseModal'), 'ExpenseModal');
const MemberIdentityPanel = lazyNamedComponent(() => import('./components/modals/MemberIdentityPanel'), 'MemberIdentityPanel');
const TransactionDetailModal = lazyNamedComponent(() => import('./components/modals/HistoryModals'), 'TransactionDetailModal');

import { TicketPrintLayout } from './components/TicketPrintLayout';
import { ExportPdfLayout } from './components/ExportPdfLayout';

// Código de barras
import { useBarcodeScanner } from './hooks/useBarcodeScanner';

const OFFLINE_CORE_CACHE_KEY = 'party_cloud_snapshot_core_v2';
const APP_VERSION = appPackage?.version || '1.0.0';
const DEFAULT_APP_UPDATE_STATUS = Object.freeze({
  phase: 'idle',
  currentVersion: APP_VERSION,
  latestVersion: null,
  progress: null,
  error: null,
  revision: 0,
});
const OFFLINE_TRANSACTIONS_CACHE_KEY = 'party_cloud_snapshot_transactions_v1';
const OFFLINE_DASHBOARD_CACHE_KEY = 'party_cloud_snapshot_dashboard_v2';
const OFFLINE_HISTORY_CACHE_KEY = 'party_cloud_snapshot_history_v1';
const OFFLINE_ORDERS_CACHE_KEY = 'party_cloud_snapshot_orders_v2';
const OFFLINE_REPORTS_CACHE_KEY = 'party_cloud_snapshot_reports_v1';
const OFFLINE_METRICS_CACHE_KEY = 'party_cloud_snapshot_metrics_v1';
const OFFLINE_SHARED_USERS_CACHE_KEY = 'party_shared_users_snapshot_v1';
const OFFLINE_SHARED_USER_AVATARS_CACHE_KEY = 'party_shared_user_avatar_thumbnails_v1';
const OFFLINE_POS_CACHE_KEY = 'party_pos_snapshot_v1';
const OFFLINE_LOGIN_CACHE_KEY = 'party_offline_login_verifiers_v1';
const LEGACY_OFFLINE_CACHE_KEY = 'party_cloud_snapshot_v1';
const EMPTY_POS_CART = Object.freeze([]);
const USER_SETTINGS_KEY = 'party_user_settings_v1';
const LOGIN_THEME_KEY = 'party_login_theme_v1';
const LOCAL_DEMO_MODE_KEY = 'rebu_local_demo_mode';
const METRICS_VIEW_MODE_STORAGE_KEY = 'rebu_metrics_view_mode_v1';
const REMEMBERED_SESSION_KEY = 'party_remembered_session_v1';
const LOGIN_STAGE_LABELS = {
  verificando: 'Verificando clave...',
  sesion: 'Abriendo sesion segura...',
  datos: 'Cargando datos del negocio...',
};
const APP_TEXT_ENCODING_VERSION = 'utf8-clean';
const CLOUD_FETCH_BATCH_SIZE = 200;
const CLOUD_CORE_FETCH_BATCH_SIZE = 1000;
const CLOUD_RECENT_SYNC_LIMIT = 250;
const CLOUD_RECENT_TRANSACTION_OVERLAP_LIMIT = 80;
const ENABLE_TRANSACTION_RPCS =
  import.meta.env.VITE_REBU_ENABLE_TRANSACTION_RPC === '1'
  || (
    import.meta.env.VITE_REBU_ENABLE_TRANSACTION_RPC === undefined
    && import.meta.env.VITE_REBU_ENABLE_AUTH_RPC === '1'
  );

// Abrir sesion de Supabase Auth al ingresar dejo de ser gratis: medido, la
// misma consulta responde 200 como anon y 401 con sesion. Y desde que anon
// tiene acceso completo, la sesion no habilita nada mas: la unica que la
// necesita es la bandeja de WhatsApp, para que el bot valide al operador.
const ENABLE_LOGIN_AUTH_SESSION =
  import.meta.env.VITE_REBU_WHATSAPP_AUTH_SESSION === '1';

const createTransactionRpcRequiredError = (operationLabel, error = null) => {
  const details = [
    error?.message,
    error?.details,
    error?.hint,
    error?.code,
  ].filter(Boolean).join(' ');
  const configHint = ENABLE_TRANSACTION_RPCS
    ? 'Verifica que el rol anon tenga permiso EXECUTE sobre las RPC transaccionales de la version sin JWT.'
    : 'Activa VITE_REBU_ENABLE_TRANSACTION_RPC=1 y aplica las migraciones de venta sin JWT.';
  const message = [
    `Operacion bloqueada: ${operationLabel} requiere RPC transaccional.`,
    'No se uso el fallback anterior porque podia dejar ventas, items, stock o puntos guardados a medias.',
    configHint,
    details ? `Detalle tecnico: ${details}` : '',
  ].filter(Boolean).join(' ');
  return new Error(message);
};

const prepareUserAvatarForCloud = async (avatar, userId) => {
  const normalizedAvatar = String(avatar || '').trim();
  if (!isEmbeddedUserAvatar(normalizedAvatar)) {
    return { avatar: normalizedAvatar, uploadedAvatarUrl: null };
  }

  const uploadedAvatar = await uploadUserAvatar(normalizedAvatar, { userId });
  return {
    avatar: uploadedAvatar.avatar,
    uploadedAvatarUrl: uploadedAvatar.avatar,
  };
};

const getSupabaseAuthLoginRequiredMessage = (authMeta = {}) => {
  if (authMeta.reason === 'missing-auth-email') {
    return 'Este usuario no esta vinculado a Supabase Auth. Vinculalo con auth_email/auth_user_id o mantene VITE_REBU_WHATSAPP_AUTH_SESSION=0 mientras se usa el modo sin JWT.';
  }

  if (authMeta.reason === 'auth-login-failed') {
    const diagnosticMessage = getSupabaseDiagnosticMessage(authMeta.error);
    const details = diagnosticMessage
      ? ` ${diagnosticMessage}`
      : authMeta.error?.message
        ? ` Detalle: ${authMeta.error.message}`
        : '';
    return `No se pudo abrir la sesion segura de Supabase Auth para este usuario.${details}`;
  }

  return 'La sesion segura de Supabase Auth no esta activa. Ingresa nuevamente con la clave del usuario antes de cobrar.';
};

// Las RPC transaccionales tienen permiso para `anon` desde la migracion
// 20260826220000_venta_sin_sesion_auth.sql: ninguna usa auth.uid() ni exige
// sesion adentro. Cobrar dejo de depender de que la sesion de Supabase Auth
// este viva, que era lo que trababa la caja y obligaba a pedir la clave.
const canUseTransactionRpcs = async () => ENABLE_TRANSACTION_RPCS;
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
  expenses: 120,
  pastClosures: 120,
  budgets: 120,
  orders: 120,
};
const HISTORY_LOG_INITIAL_LIMIT = 50;
const HISTORY_LOG_RECENT_SYNC_LIMIT = 50;
const LOCAL_TRANSACTION_OVERRIDE_TTL_MS = 45 * 1000;
const APP_USERS_FRESHNESS_MS = 15 * 1000;
const OFFLINE_BOOT_TIMEOUT_MS = 10000;
const CLOUD_BOOT_RETRY_COUNT = 1;
const CLOUD_BOOT_RETRY_DELAY_MS = 750;
const MODULE_CLOUD_LOAD_TIMEOUT_MS = 30000;
const APP_USERS_BOOT_TIMEOUT_MS = 20000;
const OFFLINE_LOGIN_TIMEOUT_MS = 6500;
const CLOUD_RECONNECT_TIMEOUT_MS = 15000;
const FORCE_RELOAD_TIMEOUT_MS = 45000;
const REPORT_LOG_ACTIONS = ['Cierre de Caja', 'Cierre Automático'];
const CORE_SOURCE_NAMES = ['productos', 'clientes', 'agenda', 'categorias', 'premios', 'caja', 'ofertas'];
const CORE_OPTIONAL_SOURCE_NAMES = ['agenda', 'categorias'];

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

const AppVersionBadge = ({
  theme = 'light',
  updateStatus = DEFAULT_APP_UPDATE_STATUS,
  onCheckForUpdates,
  onDownloadUpdate,
  onInstallUpdate,
}) => {
  const isDarkTheme = theme === 'dark';
  const phase = updateStatus?.phase || 'idle';
  const currentVersion = updateStatus?.currentVersion || APP_VERSION;
  const latestVersion = updateStatus?.latestVersion || '';
  const progress = Number(updateStatus?.progress);
  const hasProgress = Number.isFinite(progress);

  const renderUpdateAction = () => {
    if (phase === 'checking') {
      return (
        <span className="app-update-status is-neutral inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5">
          <Loader2 size={12} className="animate-spin" />
          Buscando actualización
        </span>
      );
    }

    if (phase === 'available') {
      return (
        <button
          type="button"
          onClick={onDownloadUpdate}
          className="app-update-status is-available pointer-events-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
          title={`Descargar manualmente la versión ${latestVersion}`}
        >
          <AlertTriangle size={12} />
          Nueva versión{latestVersion ? ` v${latestVersion}` : ''}
        </button>
      );
    }

    if (phase === 'downloading') {
      return (
        <span className="app-update-status is-available inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5">
          <Loader2 size={12} className="animate-spin" />
          Descargando{hasProgress ? ` ${Math.round(progress)}%` : ''}
        </span>
      );
    }

    if (phase === 'downloaded') {
      return (
        <button
          type="button"
          onClick={onInstallUpdate}
          className="app-update-status is-ready pointer-events-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
        >
          <CheckCircle2 size={12} />
          Reiniciar y actualizar
        </button>
      );
    }

    if (phase === 'installing') {
      return (
        <span className="app-update-status is-ready inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5">
          <Loader2 size={12} className="animate-spin" />
          Reiniciando
        </span>
      );
    }

    if (phase === 'error') {
      return (
        <button
          type="button"
          onClick={onCheckForUpdates}
          className="app-update-status is-error pointer-events-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-red-400/50"
          title={updateStatus?.error || 'No se pudo comprobar la actualización'}
        >
          <RefreshCw size={12} />
          Reintentar actualización
        </button>
      );
    }

    return null;
  };

  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute bottom-3 right-3 z-20 flex max-w-[calc(100vw-24px)] flex-wrap items-center justify-end gap-2 text-[10px] font-black uppercase tracking-[0.14em] sm:bottom-4 sm:right-4"
    >
      {renderUpdateAction()}
      <div
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 shadow-sm backdrop-blur ${
          isDarkTheme
            ? 'border-slate-600/80 bg-slate-950/85 text-slate-300 shadow-black/20'
            : 'border-slate-200/80 bg-white/70 text-slate-400'
        }`}
        title={phase === 'up-to-date' ? 'Tenés la última versión instalada' : undefined}
      >
        <span>Versión</span>
        <span className={isDarkTheme ? 'text-amber-100' : 'text-slate-500'}>v{currentVersion}</span>
      </div>
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

  const supabaseDiagnostic = getSupabaseDiagnosticMessage(error);
  if (supabaseDiagnostic) return supabaseDiagnostic;

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
  core: { status: 'idle', lastLoadedAt: 0, dirty: false, failedSources: [] },
  transactions: { status: 'idle', lastLoadedAt: 0, dirty: false, cloudRefreshFailed: false },
  dashboard: { status: 'idle', lastLoadedAt: 0, dirty: false, cloudRefreshFailed: false },
  history: { status: 'idle', lastLoadedAt: 0, dirty: false },
  orders: { status: 'idle', lastLoadedAt: 0, dirty: false },
  reports: { status: 'idle', lastLoadedAt: 0, dirty: false },
  metrics: { status: 'idle', lastLoadedAt: 0, dirty: false },
};

const REALTIME_SOURCE_DEFAULT_STATE = {
  sales: 'idle',
  expenses: 'idle',
  products: 'idle',
  closures: 'idle',
};

const REALTIME_DEGRADED_STATUSES = new Set([
  'CHANNEL_ERROR',
  'TIMED_OUT',
  'CLOSED',
  'HEARTBEAT_TIMEOUT',
  'DISCONNECTED',
  'ERROR',
]);

const MODULE_FRESHNESS_MS = {
  core: 2 * 60 * 1000,
  transactions: 30 * 1000,
  dashboard: 30 * 1000,
  history: 30 * 1000,
  orders: 60 * 1000,
  reports: 60 * 1000,
  metrics: 30 * 1000,
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
  loadError: '',
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

const applyQueryAbortSignal = (query, signal) => {
  if (!signal || typeof query?.abortSignal !== 'function') return query;
  return query.abortSignal(signal);
};

const fetchAllCloudRows = async (
  buildQuery,
  batchSize = CLOUD_FETCH_BATCH_SIZE,
  { signal = null } = {},
) => {
  const rows = [];
  let from = 0;

  while (true) {
    const query = applyQueryAbortSignal(buildQuery(), signal);
    const { data, error } = await query.range(from, from + batchSize - 1);
    if (error) return { data: null, error };

    const page = Array.isArray(data) ? data : [];
    rows.push(...page);

    // The Data API may enforce a lower maximum than the requested range.
    // Only an empty page proves that the complete result set was consumed.
    if (page.length === 0) break;
    from += page.length;
  }

  return { data: rows, error: null };
};

const fetchRecentRowsWithSelectFallback = async (
  buildQuery,
  selectColumns,
  limit = CLOUD_RECENT_SYNC_LIMIT,
  { signal = null } = {},
) =>
  runSelectWithSchemaFallback(
    (safeSelect) => buildQuery(safeSelect).limit(limit),
    selectColumns,
    { signal },
  );

const fetchAllChronologicalRowsWithSelectFallback = async (
  buildQuery,
  selectColumns,
  batchSize = CLOUD_FETCH_BATCH_SIZE,
  options = {},
) => {
  const result = await fetchAllCloudRowsByIdCursorWithSelectFallback(
    buildQuery,
    selectColumns,
    batchSize,
    options,
  );

  return result.error || !Array.isArray(result.data)
    ? result
    : { ...result, data: sortCloudRowsNewestFirst(result.data) };
};

const fetchRecentRowsWithOptionalActiveFilter = async ({
  table,
  selectColumns,
  orderBy,
  orderDirection = 'desc',
  additionalOrders = [],
  limit = CLOUD_RECENT_SYNC_LIMIT,
  signal = null,
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
      selectColumns,
      { signal },
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
  createdAfter,
  { signal = null } = {},
) =>
  runSelectWithSchemaFallback(
    (safeSelect) => buildQuery(safeSelect).gt('created_at', createdAfter),
    selectColumns,
    { signal },
  );

const buildSaleHistoryLogsQuery = (selectColumns) =>
  supabase
    .from('logs')
    .select(selectColumns)
    .in('action', HISTORY_LOG_ACTIONS)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

const fetchSaleHistoryLogsForTransactions = async ({
  createdAfter = null,
  limit = null,
  signal = null,
} = {}) => {
  const logsResult = createdAfter
    ? await fetchRowsCreatedAfterWithSelectFallback(
        buildSaleHistoryLogsQuery,
        CLOUD_SELECTS.logs,
        createdAfter,
        { signal },
      )
    : limit
      ? await fetchRecentRowsWithSelectFallback(
          buildSaleHistoryLogsQuery,
          CLOUD_SELECTS.logs,
          limit,
          { signal },
        )
      : await fetchAllChronologicalRowsWithSelectFallback(
          (selectColumns) =>
            supabase
              .from('logs')
              .select(selectColumns)
              .in('action', HISTORY_LOG_ACTIONS),
          CLOUD_SELECTS.logs,
          CLOUD_FETCH_BATCH_SIZE,
          { signal },
        );

  if (logsResult.error) {
    console.warn('No se pudieron cargar logs para enriquecer ventas:', logsResult.error);
    return { logs: [], error: logsResult.error };
  }

  return { logs: mapLogRecords(logsResult.data || []), error: null };
};

const fetchRowsCreatedAfterWithOptionalActiveFilter = async ({
  table,
  selectColumns,
  createdAfter,
  orderBy = 'created_at',
  orderDirection = 'desc',
  additionalOrders = [],
  signal = null,
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
      selectColumns,
      { signal },
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

const mergeCloudRowsById = (...recordGroups) => {
  const byId = new Map();

  recordGroups.flat().forEach((record) => {
    if (!record || record.id === undefined || record.id === null) return;
    byId.set(String(record.id), record);
  });

  return Array.from(byId.values()).sort((left, right) => {
    const rightTime = new Date(right?.created_at || right?.createdAt || 0).getTime() || 0;
    const leftTime = new Date(left?.created_at || left?.createdAt || 0).getTime() || 0;
    if (rightTime !== leftTime) return rightTime - leftTime;
    return String(right?.id ?? '').localeCompare(String(left?.id ?? ''));
  });
};

const getSaleTransactionIdsFromLogs = (logs = []) => {
  const ids = new Set();

  (Array.isArray(logs) ? logs : []).forEach((log) => {
    const details = log?.details && typeof log.details === 'object' ? log.details : {};
    [
      details.transactionId,
      details.id,
      details.saleId,
      details.sale_id,
      details.orderId,
    ].forEach((candidate) => {
      if (candidate !== undefined && candidate !== null && String(candidate).trim()) {
        ids.add(String(candidate));
      }
    });
  });

  return ids;
};

const fetchSaleRowsByIds = async (saleIds = [], { signal = null } = {}) => {
  const ids = Array.from(new Set((saleIds || []).map((id) => String(id)).filter(Boolean)));
  if (ids.length === 0) return { data: [], error: null };

  return runSelectWithSchemaFallback(
    (selectColumns) =>
      supabase
        .from('sales')
        .select(selectColumns)
        .in('id', ids)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false }),
    CLOUD_SELECTS.sales,
    { signal },
  );
};

const fetchModuleCloudPayloadWithRetries = ({ fetchPayload, label }) =>
  fetchCloudPayloadWithRetries({
    fetchPayload,
    label,
    timeoutMs: MODULE_CLOUD_LOAD_TIMEOUT_MS,
    retryCount: CLOUD_BOOT_RETRY_COUNT,
    retryDelayMs: CLOUD_BOOT_RETRY_DELAY_MS,
    shouldRetryPayload: (payload) => payload?.shouldRetry === true,
    isRecoverableError: isRecoverableCloudError,
    isOffline: isBrowserOffline,
  });

const fetchTransactionsCloudPayloadByIds = async (saleIds = [], { signal = null } = {}) => {
  const salesResult = await fetchSaleRowsByIds(saleIds, { signal });

  if (salesResult.error) {
    console.error('Error en tabla [ventas por Realtime]:', salesResult.error);
    return { hasCloudConnection: false, transactions: null, error: salesResult.error };
  }

  const salesData = salesResult.data || [];
  const needsSaleLogs = saleRowsRequireHistoryLogs(salesData);
  const logsResult = needsSaleLogs
    ? await fetchSaleHistoryLogsForTransactions({ limit: CLOUD_RECENT_SYNC_LIMIT, signal })
    : { logs: [], error: null };

  if (logsResult.error) {
    return {
      hasCloudConnection: false,
      transactions: null,
      error: logsResult.error,
      shouldRetry: isRecoverableCloudError(logsResult.error),
    };
  }

  return {
    hasCloudConnection: true,
    transactions: mapSaleRecords(salesData, logsResult.logs),
  };
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

const fetchRowsWithOptionalActiveFilter = async ({
  table,
  selectColumns,
  orderBy,
  orderDirection = 'asc',
  additionalOrders = [],
  batchSize = CLOUD_FETCH_BATCH_SIZE,
  signal = null,
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
      batchSize,
      { signal },
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

const fetchProductsUpdatedAfter = async (updatedAfter, { signal = null } = {}) => {
  const incrementalResult = await fetchAllCloudRowsWithSelectFallback(
    (safeSelect) =>
      supabase
        .from('products')
        .select(safeSelect)
        .gte('updated_at', updatedAfter)
        .order('updated_at', { ascending: true })
        .order('id', { ascending: true }),
    CLOUD_SELECTS.productsList,
    CLOUD_CORE_FETCH_BATCH_SIZE,
    { signal },
  );

  if (!incrementalResult.error) {
    return { ...incrementalResult, syncMode: 'incremental' };
  }

  const missingColumn = getSchemaMissingColumnName(extractSchemaMissingColumn(incrementalResult.error));
  if (missingColumn !== 'updated_at') {
    return { ...incrementalResult, syncMode: 'incremental' };
  }

  const fullResult = await fetchRowsWithOptionalActiveFilter({
    table: 'products',
    selectColumns: CLOUD_SELECTS.productsList,
    orderBy: 'title',
    additionalOrders: [{ column: 'id', ascending: true }],
    batchSize: CLOUD_CORE_FETCH_BATCH_SIZE,
    signal,
  });
  return { ...fullResult, syncMode: 'full' };
};

const fetchCoreCloudPayload = async ({ signal = null, productUpdatedAfter = null } = {}) => {
  const [
    prodResult,
    clientResult,
    agendaResult,
    catResult,
    rewardsResult,
    registerResult,
    offersResult,
  ] = await Promise.allSettled([
    productUpdatedAfter
      ? fetchProductsUpdatedAfter(productUpdatedAfter, { signal })
      : fetchRowsWithOptionalActiveFilter({
          table: 'products',
          selectColumns: CLOUD_SELECTS.productsList,
          orderBy: 'title',
          additionalOrders: [{ column: 'id', ascending: true }],
          batchSize: CLOUD_CORE_FETCH_BATCH_SIZE,
          signal,
        }).then((result) => ({ ...result, syncMode: 'full' })),
    fetchRowsWithOptionalActiveFilter({
      table: 'clients',
      selectColumns: CLOUD_SELECTS.clients,
      orderBy: 'name',
      additionalOrders: [{ column: 'id', ascending: true }],
      batchSize: CLOUD_CORE_FETCH_BATCH_SIZE,
      signal,
    }),
    fetchAllCloudRows(
      () =>
        supabase
          .from('agenda_contacts')
          .select(CLOUD_SELECTS.agendaContacts)
          .order('name')
          .order('id'),
      CLOUD_CORE_FETCH_BATCH_SIZE,
      { signal },
    ),
    fetchAllCloudRows(
      () =>
        supabase
          .from('categories')
          .select(CLOUD_SELECTS.categories)
          .order('name')
          .order('id'),
      CLOUD_CORE_FETCH_BATCH_SIZE,
      { signal },
    ),
    fetchRowsWithOptionalActiveFilter({
      table: 'rewards',
      selectColumns: CLOUD_SELECTS.rewards,
      orderBy: 'points_cost',
      orderDirection: 'asc',
      additionalOrders: [{ column: 'id', ascending: true }],
      batchSize: CLOUD_CORE_FETCH_BATCH_SIZE,
      signal,
    }),
    applyQueryAbortSignal(
      supabase.from('register_state').select(CLOUD_SELECTS.registerState).eq('id', 1).maybeSingle(),
      signal,
    ),
    fetchAllCloudRows(
      () =>
        supabase
          .from('offers')
          .select(CLOUD_SELECTS.offers)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false }),
      CLOUD_CORE_FETCH_BATCH_SIZE,
      { signal },
    ),
  ]);

  const coreResults = [
    ['productos', prodResult],
    ['clientes', clientResult],
    ['agenda', agendaResult],
    ['categorias', catResult],
    ['premios', rewardsResult],
    ['caja', registerResult],
    ['ofertas', offersResult],
  ];
  const {
    failedSources,
    optionalFailedSources,
    criticalFailedSources,
    hasCloudConnection,
    isComplete,
  } = summarizeCloudResults(coreResults, { optionalSources: CORE_OPTIONAL_SOURCE_NAMES });
  const shouldRetry = coreResults.some(([source, result]) => {
    if (!criticalFailedSources.includes(source)) return false;
    const error = result.status === 'rejected' ? result.reason : result.value?.error;
    return isRecoverableCloudError(error);
  });

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
    const { data: newState, error: upsertErr } = await applyQueryAbortSignal(
      supabase
        .from('register_state')
        .upsert([{ id: 1, is_open: false, opening_balance: 0, closing_time: '21:00' }], { onConflict: 'id' })
        .select(CLOUD_SELECTS.registerState)
        .maybeSingle(),
      signal,
    );

    if (!upsertErr && newState) registerState = newState;
  }

  return {
    hasCloudConnection,
    failedSources,
    optionalFailedSources,
    criticalFailedSources,
    isComplete,
    shouldRetry,
    productSyncMode:
      prodResult.status === 'fulfilled' ? prodResult.value?.syncMode || 'full' : 'full',
    inventory: prodData ? mapInventoryRecords(prodData) : null,
    members: clientData ? mapMemberRecords(clientData) : null,
    agendaContacts: agendaData ? mapAgendaContactRecords(agendaData) : null,
    categories: catData ? mapCategoryRecords(catData) : null,
    rewards: rewardsData ? mapRewardRecords(rewardsData) : null,
    offers: offersData ? mapOfferRecords(offersData) : null,
    registerState,
  };
};

const fetchTransactionsCloudPayload = async ({ signal = null } = {}) => {
  const [salesResult, logsResult] = await Promise.all([
    fetchAllChronologicalRowsWithSelectFallback(
      (selectColumns) =>
        supabase
          .from('sales')
          .select(selectColumns),
      CLOUD_SELECTS.sales,
      CLOUD_FETCH_BATCH_SIZE,
      { signal },
    ),
    fetchSaleHistoryLogsForTransactions({ signal }),
  ]);

  const salesData = salesResult.error ? null : salesResult.data || [];
  const saleLogsAreRequired = Boolean(salesData && saleRowsRequireHistoryLogs(salesData));
  const criticalLogsError = saleLogsAreRequired ? logsResult.error : null;
  const failedSources = [
    salesResult.error ? 'ventas' : null,
    criticalLogsError ? 'logs de ventas' : null,
  ].filter(Boolean);
  const hasCloudConnection = failedSources.length === 0;
  const retryableErrors = [salesResult.error, criticalLogsError].filter(Boolean);

  if (salesResult.error) {
    console.error('Error en tabla [ventas]:', salesResult.error);
  }

  return {
    hasCloudConnection,
    failedSources,
    isComplete: hasCloudConnection,
    shouldRetry: retryableErrors.some(isRecoverableCloudError),
    transactions: hasCloudConnection && salesData
      ? mapSaleRecords(salesData, logsResult.logs)
      : null,
  };
};

const fetchRecentTransactionsCloudPayload = async ({ signal = null } = {}) => {
  const [salesResult, logsResult] = await Promise.all([
    fetchRecentRowsWithSelectFallback(
      (selectColumns) =>
        supabase
          .from('sales')
          .select(selectColumns)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false }),
      CLOUD_SELECTS.sales,
      CLOUD_RECENT_SYNC_LIMIT,
      { signal },
    ),
    fetchSaleHistoryLogsForTransactions({ limit: CLOUD_RECENT_SYNC_LIMIT, signal }),
  ]);

  const salesData = salesResult.error ? null : salesResult.data || [];
  const saleLogsAreRequired = Boolean(salesData && saleRowsRequireHistoryLogs(salesData));
  const criticalLogsError = saleLogsAreRequired ? logsResult.error : null;
  const failedSources = [
    salesResult.error ? 'ventas recientes' : null,
    criticalLogsError ? 'logs de ventas recientes' : null,
  ].filter(Boolean);
  const hasCloudConnection = failedSources.length === 0;
  const retryableErrors = [salesResult.error, criticalLogsError].filter(Boolean);

  if (salesResult.error) {
    console.error('Error en tabla [ventas recientes]:', salesResult.error);
  }

  return {
    hasCloudConnection,
    failedSources,
    isComplete: hasCloudConnection,
    shouldRetry: retryableErrors.some(isRecoverableCloudError),
    transactions: hasCloudConnection && salesData
      ? mapSaleRecords(salesData, logsResult.logs)
      : null,
  };
};

const fetchTransactionsCloudPayloadSince = async (createdAfter, { signal = null } = {}) => {
  const [salesResult, recentSalesResult, logsResult] = await Promise.all([
    fetchRowsCreatedAfterWithSelectFallback(
      (selectColumns) =>
        supabase
          .from('sales')
          .select(selectColumns)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false }),
      CLOUD_SELECTS.sales,
      createdAfter,
      { signal },
    ),
    fetchRecentRowsWithSelectFallback(
      (selectColumns) =>
        supabase
          .from('sales')
          .select(selectColumns)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false }),
      CLOUD_SELECTS.sales,
      CLOUD_RECENT_TRANSACTION_OVERLAP_LIMIT,
      { signal },
    ),
    fetchSaleHistoryLogsForTransactions({ createdAfter, signal }),
  ]);

  const parsedLogs = logsResult.logs;
  const changedSaleIds = getSaleTransactionIdsFromLogs(parsedLogs);
  const knownSaleIds = new Set(
    [...(salesResult.data || []), ...(recentSalesResult.data || [])]
      .map((sale) => String(sale?.id ?? ''))
      .filter(Boolean)
  );
  const missingChangedSaleIds = Array.from(changedSaleIds).filter((id) => !knownSaleIds.has(String(id)));
  const changedSalesWasRequested = missingChangedSaleIds.length > 0;
  const changedSalesResult = await fetchSaleRowsByIds(missingChangedSaleIds, { signal });

  const usableSalesGroups = [
    salesResult.error ? [] : salesResult.data || [],
    recentSalesResult.error ? [] : recentSalesResult.data || [],
    changedSalesResult.error ? [] : changedSalesResult.data || [],
  ];
  const salesData = mergeCloudRowsById(...usableSalesGroups);
  const failedSources = [
    salesResult.error ? 'ventas nuevas' : null,
    recentSalesResult.error ? 'solape de ventas' : null,
    logsResult.error ? 'logs incrementales de ventas' : null,
    changedSalesWasRequested && changedSalesResult.error ? 'ventas modificadas' : null,
  ].filter(Boolean);
  const hasCloudConnection = failedSources.length === 0;
  const retryableErrors = [
    salesResult.error,
    recentSalesResult.error,
    logsResult.error,
    changedSalesWasRequested ? changedSalesResult.error : null,
  ].filter(Boolean);

  if (salesResult.error) {
    console.error('Error en tabla [ventas incrementales]:', salesResult.error);
  }
  if (recentSalesResult.error) {
    console.error('Error en tabla [ventas recientes para solape]:', recentSalesResult.error);
  }
  if (changedSalesResult.error) {
    console.error('Error en tabla [ventas modificadas por log]:', changedSalesResult.error);
  }

  return {
    hasCloudConnection,
    failedSources,
    isComplete: hasCloudConnection,
    shouldRetry: retryableErrors.some(isRecoverableCloudError),
    transactions: hasCloudConnection ? mapSaleRecords(salesData, parsedLogs) : null,
  };
};

const getSettledCloudError = (result) => (
  result?.status === 'rejected' ? result.reason : result?.value?.error || null
);

const fetchDashboardCloudPayload = async ({ signal = null } = {}) => {
  const [logsResult, expResult, closuresResult] = await Promise.allSettled([
    runSelectWithSchemaFallback(
      (selectColumns) =>
        supabase
          .from('logs')
          .select(selectColumns)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(DASHBOARD_LOG_LIMIT),
      CLOUD_SELECTS.logsSummary,
      { signal },
    ),
    fetchAllChronologicalRowsWithSelectFallback(
      (selectColumns) =>
        supabase
          .from('expenses')
          .select(selectColumns),
      CLOUD_SELECTS.expenses,
      CLOUD_FETCH_BATCH_SIZE,
      { signal },
    ),
    fetchAllChronologicalRowsWithSelectFallback(
      (selectColumns) =>
        supabase
          .from('cash_closures')
          .select(selectColumns),
      CLOUD_SELECTS.cashClosuresSummary,
      CLOUD_FETCH_BATCH_SIZE,
      { signal },
    ),
  ]);

  const {
    failedSources,
    hasCloudConnection,
    isComplete,
  } = summarizeCloudResults([
    ['logs', logsResult],
    ['gastos', expResult],
    ['cierres', closuresResult],
  ]);

  const logsData = safeCloudData(logsResult, 'logs');
  const expData = safeCloudData(expResult, 'gastos');
  const closuresData = safeCloudData(closuresResult, 'cash_closures');
  const shouldRetry = [logsResult, expResult, closuresResult]
    .map(getSettledCloudError)
    .filter(Boolean)
    .some(isRecoverableCloudError);

  return {
    hasCloudConnection,
    failedSources,
    isComplete,
    shouldRetry,
    dailyLogs: logsData ? mapLogRecords(logsData) : null,
    expenses: expData ? mapExpenseRecords(expData) : null,
    pastClosures: closuresData ? mapCashClosureRecords(closuresData) : null,
  };
};

const fetchRecentDashboardCloudPayload = async ({ signal = null } = {}) => {
  const [logsResult, expResult, closuresResult] = await Promise.allSettled([
    runSelectWithSchemaFallback(
      (selectColumns) =>
        supabase
          .from('logs')
          .select(selectColumns)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(DASHBOARD_LOG_LIMIT),
      CLOUD_SELECTS.logsSummary,
      { signal },
    ),
    fetchRecentRowsWithSelectFallback(
      (selectColumns) =>
        supabase
          .from('expenses')
          .select(selectColumns)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false }),
      CLOUD_SELECTS.expenses,
      CLOUD_RECENT_SYNC_LIMIT,
      { signal },
    ),
    fetchRecentRowsWithSelectFallback(
      (selectColumns) =>
        supabase
          .from('cash_closures')
          .select(selectColumns)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false }),
      CLOUD_SELECTS.cashClosuresSummary,
      CLOUD_RECENT_SYNC_LIMIT,
      { signal },
    ),
  ]);

  const {
    failedSources,
    hasCloudConnection,
    isComplete,
  } = summarizeCloudResults([
    ['logs', logsResult],
    ['gastos', expResult],
    ['cierres', closuresResult],
  ]);
  const logsData = safeCloudData(logsResult, 'logs recientes');
  const expData = safeCloudData(expResult, 'gastos recientes');
  const closuresData = safeCloudData(closuresResult, 'cash_closures recientes');
  const shouldRetry = [logsResult, expResult, closuresResult]
    .map(getSettledCloudError)
    .filter(Boolean)
    .some(isRecoverableCloudError);

  return {
    hasCloudConnection,
    failedSources,
    isComplete,
    shouldRetry,
    dailyLogs: logsData ? mapLogRecords(logsData) : null,
    expenses: expData ? mapExpenseRecords(expData) : null,
    pastClosures: closuresData ? mapCashClosureRecords(closuresData) : null,
  };
};

const fetchDashboardCloudPayloadSince = async ({
  logsAfter,
  expensesAfter,
  closuresAfter,
  signal = null,
}) => {
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
          logsAfter,
          { signal },
        )
      : runSelectWithSchemaFallback(
          (selectColumns) =>
            supabase
              .from('logs')
              .select(selectColumns)
              .order('created_at', { ascending: false })
              .order('id', { ascending: false })
              .limit(DASHBOARD_LOG_LIMIT),
          CLOUD_SELECTS.logsSummary,
          { signal },
        ),
    expensesAfter
      ? fetchRowsCreatedAfterWithSelectFallback(
          (selectColumns) =>
            supabase
              .from('expenses')
              .select(selectColumns)
              .order('created_at', { ascending: false })
              .order('id', { ascending: false }),
          CLOUD_SELECTS.expenses,
          expensesAfter,
          { signal },
        )
      : fetchRecentRowsWithSelectFallback(
          (selectColumns) =>
            supabase
              .from('expenses')
              .select(selectColumns)
              .order('created_at', { ascending: false })
              .order('id', { ascending: false }),
          CLOUD_SELECTS.expenses,
          CLOUD_RECENT_SYNC_LIMIT,
          { signal },
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
          closuresAfter,
          { signal },
        )
      : fetchRecentRowsWithSelectFallback(
          (selectColumns) =>
            supabase
              .from('cash_closures')
              .select(selectColumns)
              .order('created_at', { ascending: false })
              .order('id', { ascending: false }),
          CLOUD_SELECTS.cashClosuresSummary,
          CLOUD_RECENT_SYNC_LIMIT,
          { signal },
        ),
  ]);

  const {
    failedSources,
    hasCloudConnection,
    isComplete,
  } = summarizeCloudResults([
    ['logs', logsResult],
    ['gastos', expResult],
    ['cierres', closuresResult],
  ]);
  const logsData = safeCloudData(logsResult, 'logs incrementales');
  const expData = safeCloudData(expResult, 'gastos incrementales');
  const closuresData = safeCloudData(closuresResult, 'cash_closures incrementales');
  const shouldRetry = [logsResult, expResult, closuresResult]
    .map(getSettledCloudError)
    .filter(Boolean)
    .some(isRecoverableCloudError);

  return {
    hasCloudConnection,
    failedSources,
    isComplete,
    shouldRetry,
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
  const closuresResult = await fetchAllChronologicalRowsWithSelectFallback(
    (selectColumns) =>
      supabase
        .from('cash_closures')
        .select(selectColumns),
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

const fetchMetricsCloudPayload = async ({ includeTransactions = true, signal = null } = {}) => {
  const [salesResult, expResult, closuresResult, budgetsResult, ordersResult] = await Promise.allSettled([
    includeTransactions
      ? fetchAllChronologicalRowsWithSelectFallback(
          (selectColumns) =>
            supabase
              .from('sales')
              .select(selectColumns),
          CLOUD_SELECTS.sales,
          CLOUD_FETCH_BATCH_SIZE,
          { signal },
        )
      : Promise.resolve({ data: null, error: null, skipped: true }),
    fetchAllChronologicalRowsWithSelectFallback(
      (selectColumns) =>
        supabase
          .from('expenses')
          .select(selectColumns),
      CLOUD_SELECTS.expenses,
      CLOUD_FETCH_BATCH_SIZE,
      { signal },
    ),
    fetchAllChronologicalRowsWithSelectFallback(
      (selectColumns) =>
        supabase
          .from('cash_closures')
          .select(selectColumns),
      CLOUD_SELECTS.cashClosuresSummary,
      CLOUD_FETCH_BATCH_SIZE,
      { signal },
    ),
    fetchRowsWithOptionalActiveFilter({
      table: 'budgets',
      selectColumns: CLOUD_SELECTS.budgets,
      orderBy: 'created_at',
      orderDirection: 'desc',
      additionalOrders: [{ column: 'id', ascending: false }],
      signal,
    }),
    fetchRowsWithOptionalActiveFilter({
      table: 'orders',
      selectColumns: CLOUD_SELECTS.orders,
      orderBy: 'created_at',
      orderDirection: 'desc',
      additionalOrders: [{ column: 'id', ascending: false }],
      signal,
    }),
  ]);

  const summary = summarizeCloudResults([
    ...(includeTransactions ? [['ventas', salesResult]] : []),
    ['gastos', expResult],
    ['cierres', closuresResult],
    ['presupuestos', budgetsResult],
    ['pedidos', ordersResult],
  ]);
  const salesData = includeTransactions ? safeCloudData(salesResult, 'ventas para metricas') : null;
  const expData = safeCloudData(expResult, 'gastos para métricas');
  const closuresData = safeCloudData(closuresResult, 'cierres para métricas');
  const budgetsData = safeCloudData(budgetsResult, 'presupuestos para métricas');
  const ordersData = safeCloudData(ordersResult, 'pedidos para métricas');
  const saleLogsAreRequired = Boolean(
    includeTransactions && salesData && saleRowsRequireHistoryLogs(salesData),
  );
  const logsResult = saleLogsAreRequired
    ? await fetchSaleHistoryLogsForTransactions({ signal })
    : { logs: [], error: null };
  const failedSources = [
    ...summary.failedSources,
    ...(logsResult.error ? ['logs de ventas'] : []),
  ];
  const hasCloudConnection = summary.hasCloudConnection && !logsResult.error;
  const isComplete = summary.isComplete && !logsResult.error;
  const shouldRetry = [salesResult, expResult, closuresResult, budgetsResult, ordersResult]
    .map(getSettledCloudError)
    .concat(logsResult.error)
    .filter(Boolean)
    .some(isRecoverableCloudError);

  return {
    hasCloudConnection,
    failedSources,
    isComplete,
    shouldRetry,
    transactions: salesData && !logsResult.error ? mapSaleRecords(salesData, logsResult.logs) : null,
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

  const {
    failedSources,
    hasCloudConnection,
    isComplete,
  } = summarizeCloudResults([
    ['presupuestos', budgetsResult],
    ['pedidos', ordersResult],
  ]);
  const budgetsData = safeCloudData(budgetsResult, 'presupuestos');
  const ordersData = safeCloudData(ordersResult, 'pedidos');

  return {
    hasCloudConnection,
    failedSources,
    isComplete,
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

  const {
    failedSources,
    hasCloudConnection,
    isComplete,
  } = summarizeCloudResults([
    ['presupuestos', budgetsResult],
    ['pedidos', ordersResult],
  ]);
  const budgetsData = safeCloudData(budgetsResult, 'presupuestos recientes');
  const ordersData = safeCloudData(ordersResult, 'pedidos recientes');

  return {
    hasCloudConnection,
    failedSources,
    isComplete,
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
      : fetchRecentRowsWithOptionalActiveFilter({
          table: 'budgets',
          selectColumns: CLOUD_SELECTS.budgets,
          orderBy: 'created_at',
          orderDirection: 'desc',
          additionalOrders: [{ column: 'id', ascending: false }],
          limit: CLOUD_RECENT_SYNC_LIMIT,
        }),
    ordersAfter
      ? fetchRowsCreatedAfterWithOptionalActiveFilter({
          table: 'orders',
          selectColumns: CLOUD_SELECTS.orders,
          createdAfter: ordersAfter,
          orderBy: 'created_at',
          orderDirection: 'desc',
          additionalOrders: [{ column: 'id', ascending: false }],
        })
      : fetchRecentRowsWithOptionalActiveFilter({
          table: 'orders',
          selectColumns: CLOUD_SELECTS.orders,
          orderBy: 'created_at',
          orderDirection: 'desc',
          additionalOrders: [{ column: 'id', ascending: false }],
          limit: CLOUD_RECENT_SYNC_LIMIT,
        }),
  ]);

  const {
    failedSources,
    hasCloudConnection,
    isComplete,
  } = summarizeCloudResults([
    ['presupuestos', budgetsResult],
    ['pedidos', ordersResult],
  ]);
  const budgetsData = safeCloudData(budgetsResult, 'presupuestos incrementales');
  const ordersData = safeCloudData(ordersResult, 'pedidos incrementales');

  return {
    hasCloudConnection,
    failedSources,
    isComplete,
    budgets: budgetsData ? mapBudgetRecords(budgetsData) : null,
    orders: ordersData ? mapOrderRecords(ordersData) : null,
  };
};

const normalizeSettledPayload = (result) =>
  result.status === 'fulfilled' ? result.value : { hasCloudConnection: false };

const fetchMetricsCloudPayloadSince = async ({
  includeTransactions = true,
  transactionsAfter,
  logsAfter,
  expensesAfter,
  closuresAfter,
  budgetsAfter,
  ordersAfter,
} = {}) => {
  const [transactionsResult, dashboardResult, ordersResult] = await Promise.allSettled([
    includeTransactions && transactionsAfter
      ? fetchTransactionsCloudPayloadSince(transactionsAfter)
      : includeTransactions
        ? fetchRecentTransactionsCloudPayload()
        : Promise.resolve({ hasCloudConnection: false, transactions: null }),
    fetchDashboardCloudPayloadSince({ logsAfter, expensesAfter, closuresAfter }),
    fetchOrdersCloudPayloadSince({ budgetsAfter, ordersAfter }),
  ]);

  const transactionsPayload = normalizeSettledPayload(transactionsResult);
  const dashboardPayload = normalizeSettledPayload(dashboardResult);
  const ordersPayload = normalizeSettledPayload(ordersResult);
  const failedSources = [
    includeTransactions && !transactionsPayload.hasCloudConnection
      ? transactionsPayload.failedSources?.join(', ') || 'ventas'
      : null,
    !dashboardPayload.hasCloudConnection
      ? dashboardPayload.failedSources?.join(', ') || 'dashboard'
      : null,
    !ordersPayload.hasCloudConnection
      ? ordersPayload.failedSources?.join(', ') || 'pedidos'
      : null,
  ].filter(Boolean);
  const hasCloudConnection = failedSources.length === 0;

  return {
    hasCloudConnection,
    failedSources,
    isComplete: hasCloudConnection,
    transactions: includeTransactions ? transactionsPayload.transactions ?? null : null,
    dailyLogs: dashboardPayload.dailyLogs ?? null,
    expenses: dashboardPayload.expenses ?? null,
    pastClosures: dashboardPayload.pastClosures ?? null,
    budgets: ordersPayload.budgets ?? null,
    orders: ordersPayload.orders ?? null,
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

const normalizeMemberDisplayName = (value = '') =>
  String(value || '').trim().replace(/\s+/g, ' ');

const normalizeMemberDigits = (value = '') =>
  String(value || '').replace(/\D+/g, '');

const normalizeMeaningfulMemberDigits = (value = '', minLength = 5) => {
  const digits = normalizeMemberDigits(value);
  return digits.length >= minLength ? digits : '';
};

const normalizeMemberEmail = (value = '') =>
  String(value || '').trim().toLocaleLowerCase('es-AR');

const sanitizeMemberDniValue = (value = '') => {
  const rawValue = String(value || '').trim();
  return normalizeMeaningfulMemberDigits(rawValue) ? rawValue : null;
};

const sanitizeMemberPhoneValue = (value = '') => {
  const rawValue = String(value || '').trim();
  return normalizeMeaningfulMemberDigits(rawValue, 6) ? rawValue : null;
};

const sanitizeMemberEmailValue = (value = '') => {
  const rawValue = String(value || '').trim();
  return rawValue ? rawValue : null;
};

const buildMemberCreationRequestKey = (data = {}) => {
  const nameKey = normalizeMemberName(data.name);
  const dniKey = normalizeMeaningfulMemberDigits(data.dni);
  const phoneKey = normalizeMeaningfulMemberDigits(data.phone, 6);
  const emailKey = normalizeMemberEmail(data.email);
  const identityKey =
    dniKey ? `dni:${dniKey}` :
    phoneKey ? `phone:${phoneKey}` :
    emailKey ? `email:${emailKey}` :
    'name-only';

  return `${nameKey}|${identityKey}`;
};

const hasMatchingMemberIdentity = (member = {}, data = {}) => {
  if (normalizeMemberName(member.name) !== normalizeMemberName(data.name)) return false;

  const requestedDni = normalizeMeaningfulMemberDigits(data.dni);
  const requestedPhone = normalizeMeaningfulMemberDigits(data.phone, 6);
  const requestedEmail = normalizeMemberEmail(data.email);
  const hasRequestedIdentity = Boolean(requestedDni || requestedPhone || requestedEmail);

  if (!hasRequestedIdentity) return true;

  return (
    (requestedDni && normalizeMeaningfulMemberDigits(member.dni) === requestedDni) ||
    (requestedPhone && normalizeMeaningfulMemberDigits(member.phone, 6) === requestedPhone) ||
    (requestedEmail && normalizeMemberEmail(member.email) === requestedEmail)
  );
};

const formatClientRecordAsMember = (client = {}, fallback = {}) => ({
  ...client,
  memberNumber: client.member_number ?? client.memberNumber ?? fallback.memberNumber,
  extraInfo: client.extraInfo ?? client.extrainfo ?? fallback.extraInfo ?? '',
  socialConnections: client.social_connections ?? client.socialConnections ?? fallback.socialConnections ?? {},
  createdAt: client.created_at ?? client.createdAt ?? fallback.createdAt ?? null,
});

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

  let transactionsWereTrimmed = false;
  const compactedSnapshot = Object.entries(snapshot).reduce((nextSnapshot, [key, value]) => {
    const limit = limits[key];
    if (key === 'transactions' && Number.isFinite(limit) && Array.isArray(value) && value.length > limit) {
      transactionsWereTrimmed = true;
    }
    nextSnapshot[key] = Number.isFinite(limit) ? trimSnapshotArray(value, limit) : value;
    return nextSnapshot;
  }, {});

  if (transactionsWereTrimmed) {
    compactedSnapshot.transactionsScope = TRANSACTION_SNAPSHOT_SCOPE_PARTIAL;
  }

  return compactedSnapshot;
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

const transactionSnapshotPersistence = createTransactionSnapshotPersistence({
  saveFullSnapshot: saveTransactionHistorySnapshot,
  saveRecentSnapshot: (snapshot) => saveSnapshotToStorage(OFFLINE_TRANSACTIONS_CACHE_KEY, snapshot),
  // IndexedDB puede no estar disponible en algunos entornos; en ese caso conservamos el fallback previo.
  saveFallbackSnapshot: (snapshot) => saveSnapshotToStorage(OFFLINE_TRANSACTIONS_CACHE_KEY, snapshot),
});
const loadOfflineTransactionsSnapshot = () => {
  const snapshot = loadSnapshotFromStorage(OFFLINE_TRANSACTIONS_CACHE_KEY);
  // Migra en segundo plano las copias completas creadas por versiones anteriores.
  if (snapshot?.transactionsScope === TRANSACTION_SNAPSHOT_SCOPE_FULL) {
    transactionSnapshotPersistence.schedule(snapshot);
  }
  return snapshot;
};
const saveOfflineTransactionsSnapshot = (snapshot) => {
  transactionSnapshotPersistence.schedule(snapshot);
};

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
let sharedUserAvatarCacheSaveSequence = 0;
const loadOfflineSharedUsersSnapshot = () =>
  hydrateSharedUsersSnapshotAvatars(
    loadSnapshotFromStorage(OFFLINE_SHARED_USERS_CACHE_KEY),
    loadSnapshotFromStorage(OFFLINE_SHARED_USER_AVATARS_CACHE_KEY),
  );
const saveOfflineSharedUsersSnapshot = (snapshot) => {
  saveSnapshotToStorage(OFFLINE_SHARED_USERS_CACHE_KEY, compactSharedUsersSnapshot(snapshot));

  const saveSequence = ++sharedUserAvatarCacheSaveSequence;
  const previousCache = loadSnapshotFromStorage(OFFLINE_SHARED_USER_AVATARS_CACHE_KEY);
  void buildSharedUserAvatarCache(snapshot?.users, { previousCache })
    .then((avatarCache) => {
      if (saveSequence !== sharedUserAvatarCacheSaveSequence) return;
      saveSnapshotToStorage(OFFLINE_SHARED_USER_AVATARS_CACHE_KEY, avatarCache);
    })
    .catch((error) => {
      console.warn('No se pudieron guardar las miniaturas locales de usuarios:', error);
    });
};
const loadOfflinePosSnapshot = () => loadSnapshotFromStorage(OFFLINE_POS_CACHE_KEY);
const saveOfflinePosSnapshot = (snapshot) => saveSnapshotToStorage(OFFLINE_POS_CACHE_KEY, snapshot);

const loadOfflineLoginSnapshot = () => loadSnapshotFromStorage(OFFLINE_LOGIN_CACHE_KEY);
const saveOfflineLoginSnapshot = (snapshot) =>
  saveSnapshotToStorage(OFFLINE_LOGIN_CACHE_KEY, snapshot);

const OFFLINE_LOGIN_KDF_ITERATIONS = 150_000;

const bytesToHex = (bytes) =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

const hexToBytes = (hex) => {
  const normalized = String(hex || '').trim();
  if (!/^[0-9a-f]+$/i.test(normalized) || normalized.length % 2 !== 0) return null;
  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = parseInt(normalized.slice(index, index + 2), 16);
  }
  return bytes;
};

const createOfflineLoginSalt = () => {
  const cryptoApi = window.crypto;
  if (!cryptoApi?.getRandomValues) {
    throw new Error('WebCrypto no esta disponible para preparar el login offline.');
  }
  const salt = new Uint8Array(16);
  cryptoApi.getRandomValues(salt);
  return bytesToHex(salt);
};

const createOfflineLoginDigest = async (userId, password, saltHex) => {
  const source = `rebu-offline-login-v2:${String(userId || '')}:${String(password || '')}`;
  const subtle = window.crypto?.subtle;
  if (!subtle || typeof TextEncoder === 'undefined') {
    throw new Error('WebCrypto no esta disponible para preparar el login offline.');
  }

  const salt = hexToBytes(saltHex);
  if (!salt) throw new Error('El verificador offline no tiene una sal valida.');

  const keyMaterial = await subtle.importKey(
    'raw',
    new TextEncoder().encode(source),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations: OFFLINE_LOGIN_KDF_ITERATIONS,
    },
    keyMaterial,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
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
    const salt = createOfflineLoginSalt();
    verifiers[userId] = {
      userId,
      displayName: user.displayName || user.name || 'Usuario',
      algorithm: 'PBKDF2-SHA256',
      iterations: OFFLINE_LOGIN_KDF_ITERATIONS,
      salt,
      digest: await createOfflineLoginDigest(userId, password, salt),
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
    if (verifier.algorithm !== 'PBKDF2-SHA256' || !verifier.salt) {
      console.warn('Verificador offline antiguo detectado. Requiere iniciar sesion online para actualizar seguridad.');
      return false;
    }
    const candidateDigest = await createOfflineLoginDigest(user.id, password, verifier.salt);
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

const formatOfflineElapsed = (startedAt, now = new Date()) => {
  const startTime = startedAt instanceof Date ? startedAt.getTime() : new Date(startedAt || Date.now()).getTime();
  const nowTime = now instanceof Date ? now.getTime() : new Date(now || Date.now()).getTime();
  if (!Number.isFinite(startTime) || !Number.isFinite(nowTime)) return '0s';

  const totalSeconds = Math.max(0, Math.floor((nowTime - startTime) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
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

function TabLoadingFallback() {
  return (
    <div className="flex h-full min-h-0 items-center justify-center rounded-[28px] border border-slate-200 bg-white shadow-sm">
      <div className="text-center">
        <RefreshCw className="mx-auto mb-3 animate-spin text-fuchsia-600" size={30} />
        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Cargando modulo</p>
      </div>
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

  const supabaseDiagnostic = getSupabaseDiagnosticMessage(error);
  if (supabaseDiagnostic) return supabaseDiagnostic;

  return error?.message || error?.details || error?.hint || fallback;
};

const getCheckoutErrorMessage = (error) => {
  const message = getCloudErrorMessage(error, 'Fallo al guardar la venta.');
  const errorText = [message, error?.details, error?.hint, error?.code, error?.status].filter(Boolean).join(' ');

  if (/web service down|web server is down|521|503|502|504|gateway timeout|bad gateway|service unavailable|failed to fetch|networkerror/i.test(errorText)) {
    return 'El servidor en la nube no responde temporalmente (corte de conexión o mantenimiento de Supabase). Verifica tu conexión a internet o reintenta en unos segundos.';
  }

  if (/Operacion bloqueada: registrar ventas requiere RPC transaccional|sesion de Supabase Auth/i.test(errorText)) {
    return 'La nube rechazo el registro de la venta. El carrito queda guardado: reintenta en unos segundos.';
  }

  if (/permission denied for function register_sale_transaction|42501/i.test(errorText)) {
    return 'Supabase rechazo el cobro por permisos de register_sale_transaction. Avisa a soporte: falta el permiso de esa funcion.';
  }

  return message;
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
  // OJO: el flag NO puede marcarse en el cuerpo del render. El cuerpo corre en el
  // primer render, antes de que el árbol esté montado y pintado, así que avisaba
  // "ya está lista" cuando todavía no había nada usable en pantalla y desactivaba
  // el detector de pantalla blanca de DebugAppShell. Va solo en el useEffect, que
  // recién corre después de que React montó y el navegador pudo pintar.
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
  const [offlineDetectedAt, setOfflineDetectedAt] = useState(null);
  const [appUpdateStatus, setAppUpdateStatus] = useState(DEFAULT_APP_UPDATE_STATUS);

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
  const [realtimeConnectionState, setRealtimeConnectionState] = useState({
    status: 'CONNECTING',
    channelStatus: 'CONNECTING',
    degradedSource: null,
    heartbeatStatus: 'idle',
    lastConnectedAt: 0,
    lastEventAt: 0,
    lastError: '',
  });
  const [realtimeSourceState, setRealtimeSourceState] = useState(REALTIME_SOURCE_DEFAULT_STATE);
  const moduleLoadStateRef = useRef(MODULE_LOAD_DEFAULT_STATE);
  const realtimeConnectionStateRef = useRef({
    status: 'CONNECTING',
    channelStatus: 'CONNECTING',
    degradedSource: null,
    heartbeatStatus: 'idle',
    lastConnectedAt: 0,
    lastEventAt: 0,
    lastError: '',
  });
  const moduleLoadPromisesRef = useRef({
    core: null,
    transactions: null,
    dashboard: null,
    history: null,
    orders: null,
    reports: null,
    metrics: null,
  });
  const moduleLoadRequestOptionsRef = useRef({
    transactions: null,
    dashboard: null,
  });
  const moduleLoadRequestSeqRef = useRef({
    core: 0,
    transactions: 0,
    dashboard: 0,
    history: 0,
    orders: 0,
    reports: 0,
    metrics: 0,
  });
  const cloudSourceMutationVersionsRef = useRef({
    sales: 0,
    logs: 0,
    expenses: 0,
    closures: 0,
  });
  const activeTabRef = useRef('pos');
  const dataStateRef = useRef({});
  const registerStateSnapshotRef = useRef(null);
  const transactionSnapshotScopeRef = useRef(TRANSACTION_SNAPSHOT_SCOPE_PARTIAL);
  const dashboardSnapshotScopeRef = useRef(DASHBOARD_SNAPSHOT_SCOPE_PARTIAL);
  const indexedTransactionHydrationPromiseRef = useRef(null);
  const inventorySnapshotScopeRef = useRef(PRODUCT_SNAPSHOT_SCOPE_PARTIAL);
  const productsSyncedThroughRef = useRef(null);
  const productsFullSyncedAtRef = useRef(null);

  const markCloudSourceMutation = (...sources) => {
    recordCloudSourceMutations(cloudSourceMutationVersionsRef.current, sources);
  };

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

  const setRealtimeConnection = (patch) => {
    const nextPartial = typeof patch === 'function'
      ? patch(realtimeConnectionStateRef.current)
      : patch;
    realtimeConnectionStateRef.current = {
      ...realtimeConnectionStateRef.current,
      ...(nextPartial || {}),
    };
    setRealtimeConnectionState(realtimeConnectionStateRef.current);
  };

  const setRealtimeSourceStatus = (source, status) => {
    if (!Object.prototype.hasOwnProperty.call(REALTIME_SOURCE_DEFAULT_STATE, source)) return;
    setRealtimeSourceState((prev) => (
      prev[source] === status ? prev : { ...prev, [source]: status }
    ));
  };

  const beginModuleLoadRequest = (moduleKey) => {
    const nextRequestId = Number(moduleLoadRequestSeqRef.current[moduleKey] || 0) + 1;
    moduleLoadRequestSeqRef.current = {
      ...moduleLoadRequestSeqRef.current,
      [moduleKey]: nextRequestId,
    };
    return nextRequestId;
  };

  const isCurrentModuleLoadRequest = (moduleKey, requestId) =>
    Number(moduleLoadRequestSeqRef.current[moduleKey] || 0) === Number(requestId);

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
    const nextCoreState = {
      inventory: Array.isArray(snapshot.inventory)
        ? snapshot.inventory.filter((product) => getProductActiveState(product))
        : [],
      categories: Array.isArray(snapshot.categories) ? snapshot.categories : [],
      rewards: Array.isArray(snapshot.rewards) ? snapshot.rewards : [],
      members: Array.isArray(snapshot.members) ? snapshot.members : [],
      agendaContacts: Array.isArray(snapshot.agendaContacts) ? snapshot.agendaContacts : [],
      offers: Array.isArray(snapshot.offers) ? snapshot.offers : [],
    };
    dataStateRef.current = { ...dataStateRef.current, ...nextCoreState };
    setInventory(nextCoreState.inventory);
    setCategories(nextCoreState.categories);
    setRewards(nextCoreState.rewards);
    setMembers(nextCoreState.members);
    setAgendaContacts(nextCoreState.agendaContacts);
    setOffers(nextCoreState.offers);
    syncRegisterState(snapshot.registerState || null);
    inventorySnapshotScopeRef.current = getProductSnapshotScope(snapshot);
    productsSyncedThroughRef.current = inventorySnapshotScopeRef.current === PRODUCT_SNAPSHOT_SCOPE_FULL
      ? snapshot.productsSyncedThrough || null
      : null;
    productsFullSyncedAtRef.current = inventorySnapshotScopeRef.current === PRODUCT_SNAPSHOT_SCOPE_FULL
      ? snapshot.productsFullSyncedAt || null
      : null;
    if (snapshot.savedAt) {
      setOfflineSnapshotAt(snapshot.savedAt);
    }
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
    dashboardSnapshotScopeRef.current = getDashboardSnapshotScope(snapshot);
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
    transactionSnapshotScopeRef.current = getTransactionSnapshotScope(snapshot);
    dataStateRef.current = { ...dataStateRef.current, transactions: nextTransactions };
    setTransactions(nextTransactions);
    return true;
  };

  const applyHistorySnapshot = (snapshot) => {
    const hasHistoryData = snapshot && 'historyLogs' in snapshot;
    if (!hasHistoryData) return false;
    const nextHistoryLogs = Array.isArray(snapshot.historyLogs) ? snapshot.historyLogs : [];
    dataStateRef.current = { ...dataStateRef.current, historyLogs: nextHistoryLogs };
    setHistoryLogs(nextHistoryLogs);
    return true;
  };

  const applyReportsSnapshot = (snapshot) => {
    const hasReportsData = snapshot && 'pastClosures' in snapshot;
    if (!hasReportsData) return false;
    const nextPastClosures = Array.isArray(snapshot.pastClosures) ? snapshot.pastClosures : [];
    dataStateRef.current = { ...dataStateRef.current, pastClosures: nextPastClosures };
    setPastClosures(nextPastClosures);
    return true;
  };

  const applyMetricsSnapshot = (
    snapshot,
    {
      includeTransactions = true,
      includeDailyLogs = true,
      includeExpenses = true,
      includePastClosures = true,
      includeBudgets = true,
      includeOrders = true,
    } = {},
  ) => {
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
    const nextDataState = { ...dataStateRef.current };
    let didApply = false;

    if (includeTransactions && 'transactions' in snapshot) {
      const nextTransactions = Array.isArray(snapshot.transactions) ? snapshot.transactions : [];
      transactionSnapshotScopeRef.current = getTransactionSnapshotScope(snapshot);
      nextDataState.transactions = nextTransactions;
      setTransactions(nextTransactions);
      didApply = true;
    }
    if (includeDailyLogs && 'dailyLogs' in snapshot) {
      nextDataState.dailyLogs = Array.isArray(snapshot.dailyLogs) ? snapshot.dailyLogs : [];
      setDailyLogs(nextDataState.dailyLogs);
      didApply = true;
    }
    if (includeExpenses && 'expenses' in snapshot) {
      nextDataState.expenses = Array.isArray(snapshot.expenses) ? snapshot.expenses : [];
      setExpenses(nextDataState.expenses);
      didApply = true;
    }
    if (includePastClosures && 'pastClosures' in snapshot) {
      nextDataState.pastClosures = Array.isArray(snapshot.pastClosures) ? snapshot.pastClosures : [];
      setPastClosures(nextDataState.pastClosures);
      didApply = true;
    }
    if (includeBudgets && 'budgets' in snapshot) {
      nextDataState.budgets = Array.isArray(snapshot.budgets) ? snapshot.budgets : [];
      setBudgets(nextDataState.budgets);
      didApply = true;
    }
    if (includeOrders && 'orders' in snapshot) {
      nextDataState.orders = Array.isArray(snapshot.orders) ? snapshot.orders : [];
      setOrders(nextDataState.orders);
      didApply = true;
    }

    dataStateRef.current = nextDataState;
    return didApply;
  };

  const applyOrdersSnapshot = (snapshot) => {
    const hasOrdersData = snapshot && ('budgets' in snapshot || 'orders' in snapshot);
    if (!hasOrdersData) return false;
    const nextBudgets = Array.isArray(snapshot.budgets) ? snapshot.budgets : [];
    const nextOrders = Array.isArray(snapshot.orders) ? snapshot.orders : [];
    dataStateRef.current = {
      ...dataStateRef.current,
      budgets: nextBudgets,
      orders: nextOrders,
    };
    setBudgets(nextBudgets);
    setOrders(nextOrders);
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
    transactionSnapshotScopeRef.current = TRANSACTION_SNAPSHOT_SCOPE_FULL;
    setDailyLogs([]);
    setHistoryLogs([]);
    setExpenses([]);
    setPastClosures([]);
    dashboardSnapshotScopeRef.current = DASHBOARD_SNAPSHOT_SCOPE_FULL;
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

  const hydrateTransactionsFromIndexedDb = () => {
    if (indexedTransactionHydrationPromiseRef.current) {
      return indexedTransactionHydrationPromiseRef.current;
    }

    indexedTransactionHydrationPromiseRef.current = loadTransactionHistorySnapshot()
      .then((snapshot) => {
        if (!snapshot) return false;

        const nextTransactions = applyLocalTransactionOverrides(
          mergeTransactionsPreservingCostContext(
            snapshot.transactions,
            dataStateRef.current.transactions,
            { replace: false },
          ),
        );
        const isFresh = isTransactionHistorySnapshotFresh(snapshot);
        transactionSnapshotScopeRef.current = isFresh
          ? TRANSACTION_SNAPSHOT_SCOPE_FULL
          : TRANSACTION_SNAPSHOT_SCOPE_PARTIAL;
        dataStateRef.current = { ...dataStateRef.current, transactions: nextTransactions };
        setTransactions(nextTransactions);
        setModuleState('transactions', {
          status: 'loaded',
          dirty: !isFresh,
          cloudRefreshFailed: false,
          lastLoadedAt: Date.parse(snapshot.savedAt),
        });
        setOfflineSnapshotAt((current) => {
          if (!current || Date.parse(snapshot.savedAt) > Date.parse(current)) return snapshot.savedAt;
          return current;
        });
        return true;
      })
      .catch((error) => {
        console.warn('No se pudo recuperar el historial completo desde IndexedDB:', error);
        return false;
      });

    return indexedTransactionHydrationPromiseRef.current;
  };

  const completeLocalDemoModuleLoad = (moduleKey) => {
    setIsOfflineReadOnly(false);
    setModuleState(moduleKey, {
      status: 'loaded',
      dirty: false,
      ...(['transactions', 'dashboard'].includes(moduleKey)
        ? { cloudRefreshFailed: false }
        : {}),
      lastLoadedAt: Date.now(),
      ...(moduleKey === 'core' ? { failedSources: [] } : {}),
    });
    return true;
  };

  const loadAppUsers = async ({ force = false, includeInactive = false } = {}) => {
    if (isLocalDemoMode()) {
      const legacyUsers = buildLegacyUsers(USERS, userSettings);
      setAuthMode('legacy');
      setAppUsers(legacyUsers);
      setAppUsersLoadError('');
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
      setAppUsersLoadError('');
      return offlineSharedUsersSnapshot.users;
    }

    if (isBrowserOffline()) {
      setAuthMode('supabase');
      setAppUsers([]);
      setAppUsersLoadError(getAppUserDirectoryLoadErrorMessage({ offline: true }));
      return [];
    }

    while (sharedUsersCache.promise) {
      const pendingPromise = sharedUsersCache.promise;
      const cachedResult = await pendingPromise;
      if (canServeSharedUsersScope(cachedResult.scope || 'active', requestedScope)) {
        setAuthMode(cachedResult.authMode);
        setAppUsers(cachedResult.users);
        setAppUsersLoadError(cachedResult.loadError || '');
        return cachedResult.users;
      }

      if (sharedUsersCache.promise === pendingPromise) break;
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
      setAppUsersLoadError(sharedUsersCache.loadError || '');
      return sharedUsersCache.users;
    }

    const currentPromise = (async () => {
      try {
        const actorIdForPrivateUsers = currentUserRef.current?.id || null;
        const readUsers = async () => {
          if (
            !shouldLoadPrivateAppUserDirectory({
              actorId: actorIdForPrivateUsers,
              includeInactive,
            })
          ) {
            return fetchAppUsersPublic({
              includeInactive,
              includeAuditFields: includeInactive,
            });
          }

          const [publicUsers, privateUsers] = await Promise.all([
            fetchAppUsersPublic({ includeInactive: false, includeAuditFields: false }),
            fetchAppUsersPrivate({
              actorId: actorIdForPrivateUsers,
              includeInactive: true,
            }),
          ]);

          // The private RPC is intentionally scoped to users the actor can manage.
          // Keep the complete active login directory and enrich manageable users
          // with private fields instead of replacing the login list with that subset.
          return mergeAppUserDirectories(publicUsers, privateUsers);
        };

        let users = await withTimeout(
          readUsers(),
          APP_USERS_BOOT_TIMEOUT_MS,
          'Carga de usuarios',
        );

        if (users.length === 0) {
          const seed = buildLegacyBootstrapSeed(USERS, userSettings);
          if (hasUnsafeLegacyBootstrapPasswords(seed)) {
            throw new Error('Bootstrap de usuarios bloqueado: las claves legacy por defecto 1234/4321 no se permiten en nube.');
          }
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
          return { users, authMode: 'supabase', scope: requestedScope, loadError: '' };
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
            loadError: '',
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
            loadError: '',
          };
        }

        const isMissingSharedUsersSchema = isMissingSharedUsersSchemaError(error);

        if (isMissingSharedUsersSchema) {
          console.warn('No existe todavía el schema compartido de usuarios. Seguimos con el login legacy.');
          return {
            users: buildLegacyUsers(USERS, userSettings),
            authMode: 'legacy',
            scope: 'active',
            loadError: '',
          };
        }

        console.error('No se pudieron cargar los usuarios compartidos:', error);
        return {
          users: [],
          authMode: 'supabase',
          scope: requestedScope,
          loadError: getAppUserDirectoryLoadErrorMessage({ error }),
          recoverableFallback: isRecoverableCloudError(error),
        };
      }
    })();

    sharedUsersCache.promise = currentPromise;

    try {
      const result = await currentPromise;
      sharedUsersCache.users = result.users;
      sharedUsersCache.authMode = result.authMode;
      sharedUsersCache.scope = result.scope || requestedScope;
      sharedUsersCache.loadError = result.loadError || '';
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
      setAppUsersLoadError(result.loadError || '');

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
      if (sharedUsersCache.promise === currentPromise) {
        sharedUsersCache.promise = null;
      }
    }
  };

  const applyCorePayload = (payload) => {
    const nextCoreState = { ...dataStateRef.current };
    if (payload.inventory !== null) {
      const nextInventory = payload.productSyncMode === 'incremental'
        ? mergeCloudRecordsById(nextCoreState.inventory, payload.inventory, {
            keepRecord: getProductActiveState,
            compareRecords: (left, right) =>
              String(left?.title || '').localeCompare(String(right?.title || ''), 'es', { sensitivity: 'base' }) ||
              String(left?.id || '').localeCompare(String(right?.id || '')),
          })
        : (payload.inventory || []).filter((product) => getProductActiveState(product));
      nextCoreState.inventory = nextInventory;
      setInventory(nextInventory);
      void deactivateStaleOutOfStockProducts(payload.inventory || []);
    }
    if (payload.members !== null) {
      nextCoreState.members = payload.members;
      setMembers(payload.members);
    }
    if (payload.agendaContacts !== null) {
      nextCoreState.agendaContacts = payload.agendaContacts;
      setAgendaContacts(payload.agendaContacts);
    }
    if (payload.categories !== null) {
      nextCoreState.categories = payload.categories;
      setCategories(payload.categories);
    }
    if (payload.rewards !== null) {
      nextCoreState.rewards = payload.rewards;
      setRewards(payload.rewards);
    }
    if (payload.offers !== null) {
      nextCoreState.offers = payload.offers;
      setOffers(payload.offers);
    }
    if (payload.registerState) syncRegisterState(payload.registerState);
    dataStateRef.current = nextCoreState;
    return nextCoreState;
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
    markCloudSourceMutation('sales');
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

  const applyMetricsPayload = (payload, { merge = false } = {}) => {
    applyTransactionsPayload(payload, { merge });
    applyDashboardPayload(payload, { merge });
    applyOrdersPayload(payload, { merge });
  };

  const loadCoreCloudData = async ({ showSpinner = false, force = false, requireCloud = false } = {}) => {
    if (isLocalDemoMode()) {
      return completeLocalDemoModuleLoad('core');
    }

    if (isBrowserOffline()) {
      const cachedSnapshot = loadOfflineSnapshot();
      if (applyCoreSnapshot(cachedSnapshot)) {
        setIsOfflineReadOnly(true);
        setModuleState('core', {
          status: 'loaded',
          dirty: false,
          lastLoadedAt: Date.now(),
          failedSources: CORE_SOURCE_NAMES,
        });
        return !requireCloud;
      }

      setIsOfflineReadOnly(true);
      setModuleState('core', { status: 'error', dirty: true, failedSources: CORE_SOURCE_NAMES });
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
      const requestId = beginModuleLoadRequest('core');
      if (showSpinner) setIsCloudLoading(true);
      setModuleState('core', { status: 'loading', dirty: false });

      const applyCachedCoreFallback = (notify = false) => {
        if (!isCurrentModuleLoadRequest('core', requestId)) return false;
        const cachedSnapshot = loadOfflineSnapshot();
        if (applyCoreSnapshot(cachedSnapshot)) {
          setIsOfflineReadOnly(true);
          if (notify) {
            notifyCloudFallback(
              'Trabajando con datos locales',
              'No se pudo confirmar conexion con Supabase despues de varios intentos. Reconecta la nube antes de hacer cambios importantes.'
            );
          }
          setModuleState('core', {
            status: 'loaded',
            dirty: false,
            lastLoadedAt: Date.now(),
            failedSources: CORE_SOURCE_NAMES,
          });
          return !requireCloud;
        }

        setModuleState('core', { status: 'error', dirty: true, failedSources: CORE_SOURCE_NAMES });
        return false;
      };

      try {
        const useIncrementalProducts = shouldUseIncrementalProductSync({
          force,
          inventoryScope: inventorySnapshotScopeRef.current,
          inventoryCount: dataStateRef.current.inventory?.length || 0,
          productsSyncedThrough: productsSyncedThroughRef.current,
          productsFullSyncedAt: productsFullSyncedAtRef.current,
        });
        const productUpdatedAfter = useIncrementalProducts
          ? getIncrementalSyncCutoff(productsSyncedThroughRef.current, {
              maxAgeMs: Number.POSITIVE_INFINITY,
            })
          : null;
        const fetchCorePayloadWithTimeout = () =>
          fetchCloudPayloadWithRetries({
            fetchPayload: ({ signal }) => fetchCoreCloudPayload({ signal, productUpdatedAfter }),
            label: 'Carga inicial',
            timeoutMs: OFFLINE_BOOT_TIMEOUT_MS,
            retryCount: CLOUD_BOOT_RETRY_COUNT,
            retryDelayMs: CLOUD_BOOT_RETRY_DELAY_MS,
            isRecoverableError: isRecoverableCloudError,
            isOffline: isBrowserOffline,
            shouldRetryPayload: (payload) =>
              !payload?.hasCloudConnection && payload?.shouldRetry !== false,
          });
        const payload =
          !force && currentState.status === 'idle'
            ? await (initialBootstrapPromise ||= fetchCorePayloadWithTimeout())
            : await fetchCorePayloadWithTimeout();

        if (!isCurrentModuleLoadRequest('core', requestId)) return false;

        if (!payload?.hasCloudConnection) {
          initialBootstrapPromise = null;
          return applyCachedCoreFallback(true);
        }

        const nextCoreState = applyCorePayload(payload);
        setIsOfflineReadOnly(false);
        if (payload.optionalFailedSources?.length > 0) {
          console.warn('Carga base parcial. Se conservaron datos previos para:', payload.optionalFailedSources.join(', '));
        }

        const savedAt = new Date().toISOString();
        const nextProductsSyncedThrough = getLatestCloudRecordTimestamp(payload.inventory, {
          fallback: payload.productSyncMode === 'incremental'
            ? productsSyncedThroughRef.current
            : null,
        });
        const nextProductsFullSyncedAt = payload.productSyncMode === 'full'
          ? savedAt
          : productsFullSyncedAtRef.current;
        inventorySnapshotScopeRef.current = PRODUCT_SNAPSHOT_SCOPE_FULL;
        productsSyncedThroughRef.current = nextProductsSyncedThrough;
        productsFullSyncedAtRef.current = nextProductsFullSyncedAt;

        const nextSnapshot = {
          savedAt,
          inventory: nextCoreState.inventory ?? [],
          inventoryScope: PRODUCT_SNAPSHOT_SCOPE_FULL,
          productsSyncedThrough: nextProductsSyncedThrough,
          productsFullSyncedAt: nextProductsFullSyncedAt,
          categories: nextCoreState.categories ?? [],
          rewards: nextCoreState.rewards ?? [],
          members: nextCoreState.members ?? [],
          agendaContacts: nextCoreState.agendaContacts ?? [],
          offers: nextCoreState.offers ?? [],
          registerState: payload.registerState ?? registerStateSnapshotRef.current ?? null,
        };
        saveOfflineSnapshot(nextSnapshot);
        setOfflineSnapshotAt(nextSnapshot.savedAt);
        setModuleState('core', {
          status: 'loaded',
          dirty: false,
          lastLoadedAt: Date.now(),
          failedSources: payload.failedSources || [],
        });
        return true;
      } catch (error) {
        if (!isCurrentModuleLoadRequest('core', requestId)) return false;
        console.error('Error general de conexion (core):', error);
        initialBootstrapPromise = null;
        return applyCachedCoreFallback(true);
      } finally {
        moduleLoadPromisesRef.current.core = null;
        if (showSpinner) setIsCloudLoading(false);
      }
    };

    const promise = run();
    moduleLoadPromisesRef.current.core = promise;
    return promise;
  };

  const loadTransactionsCloudData = async ({
    force = false,
    requireCloud = false,
    full = false,
    progressive = false,
  } = {}) => {
    if (isLocalDemoMode()) return completeLocalDemoModuleLoad('transactions');

    if (shouldHydrateFullTransactionHistory({ fullRequested: full, progressive })) {
      await hydrateTransactionsFromIndexedDb();
    }

    const requestedLoad = {
      full: Boolean(full),
      nonProgressive: !progressive,
    };

    if (moduleLoadPromisesRef.current.transactions) {
      if (doesCloudLoadCoverRequest(
        moduleLoadRequestOptionsRef.current.transactions,
        requestedLoad,
        ['full', 'nonProgressive'],
      )) {
        const loaded = await moduleLoadPromisesRef.current.transactions;
        return resolveCoveredCloudLoadResult({
          loaded,
          requireCloud,
          cloudRefreshFailed: moduleLoadStateRef.current.transactions.cloudRefreshFailed,
        });
      }
      await withTimeout(
        moduleLoadPromisesRef.current.transactions,
        FORCE_RELOAD_TIMEOUT_MS,
        'Espera de transacciones anterior',
      );
    }

    const currentState = moduleLoadStateRef.current.transactions;
    const hasCompleteTransactionSnapshot =
      transactionSnapshotScopeRef.current === TRANSACTION_SNAPSHOT_SCOPE_FULL;
    if (
      !force &&
      hasCompleteTransactionSnapshot &&
      isModuleStateFresh(currentState, MODULE_FRESHNESS_MS.transactions)
    ) {
      return true;
    }

    let currentPromise = null;
    const run = async () => {
      const requestId = beginModuleLoadRequest('transactions');
      const requestStartedAt = Date.now();
      setModuleState('transactions', {
        status: 'loading',
        dirty: false,
        cloudRefreshFailed: false,
      });
      const latestTransactionCreatedAt = getLatestCreatedAt(dataStateRef.current.transactions);
      const hasExistingTransactions =
        Array.isArray(dataStateRef.current.transactions) &&
        dataStateRef.current.transactions.length > 0;
      const useRecentSync = shouldUseIncrementalTransactionSync({
        fullRequested: full,
        hasExistingTransactions,
        snapshotScope: transactionSnapshotScopeRef.current,
      });
      const useProgressiveBootstrap = progressive && !full && !useRecentSync;
      const shouldMergeTransactions = useRecentSync || useProgressiveBootstrap;

      try {
        const fetchPayload = ({ signal }) => (
          useRecentSync
            ? latestTransactionCreatedAt
              ? fetchTransactionsCloudPayloadSince(latestTransactionCreatedAt, { signal })
              : fetchRecentTransactionsCloudPayload({ signal })
            : useProgressiveBootstrap
              ? fetchRecentTransactionsCloudPayload({ signal })
              : fetchTransactionsCloudPayload({ signal })
        );
        const fetchReliablePayload = () => fetchModuleCloudPayloadWithRetries({
          fetchPayload,
          label: 'Carga de transacciones',
        });
        const payload = shouldMergeTransactions
          ? await fetchReliablePayload()
          : await fetchCloudPayloadWithMutationGuard({
              fetchPayload: fetchReliablePayload,
              getMutationVersions: () => cloudSourceMutationVersionsRef.current,
              sources: ['sales', 'logs'],
              retryCount: 1,
            });

        if (!isCurrentModuleLoadRequest('transactions', requestId)) return true;

        if (payload?.mutationConsistent === false) {
          setModuleState('transactions', {
            status: 'loaded',
            dirty: true,
            cloudRefreshFailed: payload?.hasCloudConnection === false,
            lastLoadedAt: Date.now(),
          });
          return false;
        }

        if (!payload?.hasCloudConnection) {
          if (Number(localDataMutationRef.current.transactions || 0) > requestStartedAt) {
            setModuleState('transactions', {
              status: 'loaded',
              dirty: true,
              cloudRefreshFailed: true,
              lastLoadedAt: Date.now(),
            });
            return !requireCloud;
          }

          const cachedSnapshot =
            loadOfflineTransactionsSnapshot() || loadOfflineDashboardSnapshot() || loadOfflineSnapshot();
          if (applyTransactionsSnapshot(cachedSnapshot)) {
            setModuleState('transactions', {
              status: 'loaded',
              dirty: transactionSnapshotScopeRef.current !== TRANSACTION_SNAPSHOT_SCOPE_FULL,
              cloudRefreshFailed: true,
              lastLoadedAt: Date.now(),
            });
            return !requireCloud;
          }

          setModuleState('transactions', {
            status: 'error',
            dirty: true,
            cloudRefreshFailed: true,
          });
          return false;
        }

        if (Number(localDataMutationRef.current.transactions || 0) > requestStartedAt) {
          setModuleState('transactions', {
            status: 'loaded',
            dirty: true,
            cloudRefreshFailed: false,
            lastLoadedAt: Date.now(),
          });
          return true;
        }

        applyTransactionsPayload(payload, { merge: shouldMergeTransactions });
        if (!shouldMergeTransactions) {
          transactionSnapshotScopeRef.current = TRANSACTION_SNAPSHOT_SCOPE_FULL;
        }
        setIsOfflineReadOnly(false);
        const rawNextTransactions =
          payload.transactions === null
            ? dataStateRef.current.transactions ?? []
            : mergeTransactionsPreservingCostContext(dataStateRef.current.transactions, payload.transactions, {
                replace: !shouldMergeTransactions,
              });
        const nextTransactions = applyLocalTransactionOverrides(rawNextTransactions);
        dataStateRef.current = { ...dataStateRef.current, transactions: nextTransactions };

        const nextSnapshot = {
          savedAt: new Date().toISOString(),
          transactions: nextTransactions,
          transactionsScope: transactionSnapshotScopeRef.current,
        };
        saveOfflineTransactionsSnapshot(nextSnapshot);
        setModuleState('transactions', {
          status: 'loaded',
          dirty: transactionSnapshotScopeRef.current !== TRANSACTION_SNAPSHOT_SCOPE_FULL,
          cloudRefreshFailed: false,
          lastLoadedAt: Date.now(),
        });
        return true;
      } catch (error) {
        if (!isCurrentModuleLoadRequest('transactions', requestId)) return true;
        console.error('Error general de conexión (metrics):', error);
        if (Number(localDataMutationRef.current.transactions || 0) > requestStartedAt) {
          setModuleState('transactions', {
            status: 'loaded',
            dirty: true,
            cloudRefreshFailed: true,
            lastLoadedAt: Date.now(),
          });
          return !requireCloud;
        }

        const cachedSnapshot =
          loadOfflineTransactionsSnapshot() || loadOfflineDashboardSnapshot() || loadOfflineSnapshot();
        if (applyTransactionsSnapshot(cachedSnapshot)) {
          setModuleState('transactions', {
            status: 'loaded',
            dirty: transactionSnapshotScopeRef.current !== TRANSACTION_SNAPSHOT_SCOPE_FULL,
            cloudRefreshFailed: true,
            lastLoadedAt: Date.now(),
          });
          return !requireCloud;
        }

        setModuleState('transactions', {
          status: 'error',
          dirty: true,
          cloudRefreshFailed: true,
        });
        return false;
      } finally {
        if (moduleLoadPromisesRef.current.transactions === currentPromise) {
          moduleLoadPromisesRef.current.transactions = null;
          moduleLoadRequestOptionsRef.current.transactions = null;
        }
      }
    };

    moduleLoadRequestOptionsRef.current.transactions = requestedLoad;
    currentPromise = run();
    moduleLoadPromisesRef.current.transactions = currentPromise;
    return currentPromise;
  };

  const loadDashboardCloudData = async ({
    force = false,
    requireCloud = false,
    full = false,
    background = false,
    includeTransactions = true,
  } = {}) => {
    if (isLocalDemoMode()) return completeLocalDemoModuleLoad('dashboard');

    const requestedLoad = {
      full: Boolean(full),
      includeTransactions: Boolean(includeTransactions),
    };

    if (moduleLoadPromisesRef.current.dashboard) {
      if (doesCloudLoadCoverRequest(
        moduleLoadRequestOptionsRef.current.dashboard,
        requestedLoad,
        ['full', 'includeTransactions'],
      )) {
        const loaded = await moduleLoadPromisesRef.current.dashboard;
        return resolveCoveredCloudLoadResult({
          loaded,
          requireCloud,
          cloudRefreshFailed:
            moduleLoadStateRef.current.dashboard.cloudRefreshFailed ||
            (
              includeTransactions &&
              moduleLoadStateRef.current.transactions.cloudRefreshFailed
            ),
        });
      }
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

    let currentPromise = null;
    const run = async () => {
      const requestId = beginModuleLoadRequest('dashboard');
      setModuleState('dashboard', background
        ? { status: 'loaded', dirty: true }
        : { status: 'loading', dirty: false, cloudRefreshFailed: false });
      const latestDashboardLogCreatedAt = getLatestCreatedAt(dataStateRef.current.dailyLogs);
      const latestExpenseCreatedAt = getLatestCreatedAt(dataStateRef.current.expenses);
      const latestClosureCreatedAt = getLatestCreatedAt(dataStateRef.current.pastClosures);
      const hasExistingDashboardData =
        (Array.isArray(dataStateRef.current.dailyLogs) && dataStateRef.current.dailyLogs.length > 0) ||
        (Array.isArray(dataStateRef.current.expenses) && dataStateRef.current.expenses.length > 0) ||
        (Array.isArray(dataStateRef.current.pastClosures) && dataStateRef.current.pastClosures.length > 0);
      const useRecentSync = shouldUseIncrementalDashboardSync({
        fullRequested: full,
        hasExistingDashboardData,
        snapshotScope: dashboardSnapshotScopeRef.current,
      });
      const useProgressiveBootstrap = !full && !useRecentSync;
      const shouldMergeDashboard = useRecentSync || useProgressiveBootstrap;

      try {
        const transactionsPromise = includeTransactions
          ? loadTransactionsCloudData({
              force,
              requireCloud,
              full,
              progressive: !full,
            })
          : Promise.resolve(true);
        const fetchPayload = ({ signal }) => (
          useRecentSync
            ? latestDashboardLogCreatedAt || latestExpenseCreatedAt || latestClosureCreatedAt
              ? fetchDashboardCloudPayloadSince({
                  logsAfter: latestDashboardLogCreatedAt,
                  expensesAfter: latestExpenseCreatedAt,
                  closuresAfter: latestClosureCreatedAt,
                  signal,
                })
              : fetchRecentDashboardCloudPayload({ signal })
            : useProgressiveBootstrap
              ? fetchRecentDashboardCloudPayload({ signal })
              : fetchDashboardCloudPayload({ signal })
        );
        const fetchReliablePayload = () => fetchModuleCloudPayloadWithRetries({
          fetchPayload,
          label: 'Carga de Dashboard',
        });
        const dashboardPayloadPromise = shouldMergeDashboard
          ? fetchReliablePayload()
          : fetchCloudPayloadWithMutationGuard({
              fetchPayload: fetchReliablePayload,
              getMutationVersions: () => cloudSourceMutationVersionsRef.current,
              sources: ['logs', 'expenses', 'closures'],
              retryCount: 1,
            });
        const [transactionsLoaded, payload] = await Promise.all([
          transactionsPromise,
          dashboardPayloadPromise,
        ]);
        if (!isCurrentModuleLoadRequest('dashboard', requestId)) return true;
        if (includeTransactions && !transactionsLoaded) {
          setModuleState('dashboard', {
            status: 'error',
            dirty: true,
            cloudRefreshFailed: true,
          });
          return false;
        }

        if (!isCurrentModuleLoadRequest('dashboard', requestId)) return true;

        if (payload?.mutationConsistent === false) {
          setModuleState('dashboard', {
            status: 'loaded',
            dirty: true,
            cloudRefreshFailed: payload?.hasCloudConnection === false,
            lastLoadedAt: Date.now(),
          });
          return false;
        }

        if (!payload?.hasCloudConnection) {
          const cachedSnapshot = loadOfflineDashboardSnapshot() || loadOfflineSnapshot();
          if (applyDashboardSnapshot(cachedSnapshot)) {
            setModuleState('dashboard', {
              status: 'loaded',
              dirty: true,
              cloudRefreshFailed: true,
              lastLoadedAt: Date.now(),
            });
            return !requireCloud;
          }

          setModuleState('dashboard', {
            status: 'error',
            dirty: true,
            cloudRefreshFailed: true,
          });
          return false;
        }

        applyDashboardPayload(payload, { merge: shouldMergeDashboard });
        if (!shouldMergeDashboard) {
          dashboardSnapshotScopeRef.current = DASHBOARD_SNAPSHOT_SCOPE_FULL;
        }
        setIsOfflineReadOnly(false);
        const nextDailyLogs =
          payload.dailyLogs === null
            ? dataStateRef.current.dailyLogs ?? []
            : shouldMergeDashboard
              ? mergeLatestRecords(dataStateRef.current.dailyLogs, payload.dailyLogs)
              : payload.dailyLogs;
        const nextExpenses =
          payload.expenses === null
            ? dataStateRef.current.expenses ?? []
            : shouldMergeDashboard
              ? mergeLatestRecords(dataStateRef.current.expenses, payload.expenses)
              : payload.expenses;
        const nextClosures =
          payload.pastClosures === null
            ? dataStateRef.current.pastClosures ?? []
            : shouldMergeDashboard
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
          dashboardScope: dashboardSnapshotScopeRef.current,
          dailyLogs: nextDailyLogs,
          expenses: nextExpenses,
          pastClosures: nextClosures,
        };
        saveOfflineDashboardSnapshot(nextSnapshot);
        setModuleState('dashboard', {
          status: 'loaded',
          dirty: dashboardSnapshotScopeRef.current !== DASHBOARD_SNAPSHOT_SCOPE_FULL,
          cloudRefreshFailed: false,
          lastLoadedAt: Date.now(),
        });
        return true;
      } catch (error) {
        if (!isCurrentModuleLoadRequest('dashboard', requestId)) return true;
        console.error('Error general de conexión (metrics):', error);
        const cachedSnapshot = loadOfflineDashboardSnapshot() || loadOfflineSnapshot();
        if (applyDashboardSnapshot(cachedSnapshot)) {
          setModuleState('dashboard', {
            status: 'loaded',
            dirty: true,
            cloudRefreshFailed: true,
            lastLoadedAt: Date.now(),
          });
          return !requireCloud;
        }

        setModuleState('dashboard', {
          status: 'error',
          dirty: true,
          cloudRefreshFailed: true,
        });
        return false;
      } finally {
        if (moduleLoadPromisesRef.current.dashboard === currentPromise) {
          moduleLoadPromisesRef.current.dashboard = null;
          moduleLoadRequestOptionsRef.current.dashboard = null;
        }
      }
    };

    moduleLoadRequestOptionsRef.current.dashboard = requestedLoad;
    currentPromise = run();
    moduleLoadPromisesRef.current.dashboard = currentPromise;
    return currentPromise;
  };

  const loadHistoryCloudData = async ({ force = false, requireCloud = false } = {}) => {
    if (isLocalDemoMode()) return completeLocalDemoModuleLoad('history');

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
    if (isLocalDemoMode()) return completeLocalDemoModuleLoad('orders');

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
    if (isLocalDemoMode()) return completeLocalDemoModuleLoad('reports');

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

  const loadMetricsCloudData = async ({ force = false, includeTransactions = true, requireCloud = false, full = false } = {}) => {
    if (isLocalDemoMode()) return completeLocalDemoModuleLoad('metrics');

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

    let currentPromise = null;
    const run = async () => {
      const requestId = beginModuleLoadRequest('metrics');
      setModuleState('metrics', { status: 'loading', dirty: false });
      const latestTransactionCreatedAt = getLatestCreatedAt(dataStateRef.current.transactions);
      const latestDashboardLogCreatedAt = getLatestCreatedAt(dataStateRef.current.dailyLogs);
      const latestExpenseCreatedAt = getLatestCreatedAt(dataStateRef.current.expenses);
      const latestClosureCreatedAt = getLatestCreatedAt(dataStateRef.current.pastClosures);
      const latestBudgetCreatedAt = getLatestCreatedAt(dataStateRef.current.budgets);
      const latestOrderCreatedAt = getLatestCreatedAt(dataStateRef.current.orders);
      const hasExistingTransactions =
        Array.isArray(dataStateRef.current.transactions) && dataStateRef.current.transactions.length > 0;
      const hasExistingMetricsData =
        (!includeTransactions || hasExistingTransactions) &&
        (
          hasExistingTransactions ||
          (Array.isArray(dataStateRef.current.expenses) && dataStateRef.current.expenses.length > 0) ||
          (Array.isArray(dataStateRef.current.pastClosures) && dataStateRef.current.pastClosures.length > 0) ||
          (Array.isArray(dataStateRef.current.budgets) && dataStateRef.current.budgets.length > 0) ||
          (Array.isArray(dataStateRef.current.orders) && dataStateRef.current.orders.length > 0)
        );
      const useRecentSync = shouldUseIncrementalMetricsSync({
        fullRequested: full,
        includeTransactions,
        hasExistingMetricsData:
          hasExistingMetricsData &&
          currentState.status === 'loaded' &&
          !currentState.dirty,
        hasExistingTransactions,
        transactionSnapshotScope: transactionSnapshotScopeRef.current,
      });

      try {
        const payload = useRecentSync
          ? await fetchMetricsCloudPayloadSince({
              includeTransactions,
              transactionsAfter: latestTransactionCreatedAt,
              logsAfter: latestDashboardLogCreatedAt,
              expensesAfter: latestExpenseCreatedAt,
              closuresAfter: latestClosureCreatedAt,
              budgetsAfter: latestBudgetCreatedAt,
              ordersAfter: latestOrderCreatedAt,
            })
          : await fetchMetricsCloudPayload({ includeTransactions });

        if (!isCurrentModuleLoadRequest('metrics', requestId)) return true;

        if (!payload?.hasCloudConnection) {
          if (payload?.failedSources?.length > 0) {
            console.error('Carga de metricas incompleta. Fallaron:', payload.failedSources.join(', '));
          }
          const cachedSnapshot =
            loadOfflineMetricsSnapshot() ||
            loadOfflineTransactionsSnapshot() ||
            loadOfflineDashboardSnapshot() ||
            loadOfflineOrdersSnapshot() ||
            loadOfflineReportsSnapshot() ||
            loadOfflineSnapshot();

          if (applyMetricsSnapshot(cachedSnapshot, {
            includeTransactions:
              transactionSnapshotScopeRef.current !== TRANSACTION_SNAPSHOT_SCOPE_FULL,
          })) {
            setModuleState('metrics', { status: 'loaded', dirty: true, lastLoadedAt: Date.now() });
            return !requireCloud;
          }

          setModuleState('metrics', { status: 'error', dirty: true });
          return false;
        }

        if (includeTransactions && payload.transactions !== null && !useRecentSync) {
          transactionSnapshotScopeRef.current = TRANSACTION_SNAPSHOT_SCOPE_FULL;
        }
        if (!useRecentSync) {
          dashboardSnapshotScopeRef.current = DASHBOARD_SNAPSHOT_SCOPE_FULL;
        }

        const snapshotPayload = useRecentSync
          ? {
              ...payload,
              transactions:
                payload.transactions === null
                  ? dataStateRef.current.transactions ?? []
                  : applyLocalTransactionOverrides(
                      mergeTransactionsPreservingCostContext(dataStateRef.current.transactions, payload.transactions, {
                        replace: false,
                      }),
                    ),
              expenses:
                payload.expenses === null
                  ? dataStateRef.current.expenses ?? []
                  : mergeLatestRecords(dataStateRef.current.expenses, payload.expenses),
              pastClosures:
                payload.pastClosures === null
                  ? dataStateRef.current.pastClosures ?? []
                  : mergeLatestRecords(dataStateRef.current.pastClosures, payload.pastClosures),
              budgets:
                payload.budgets === null
                  ? dataStateRef.current.budgets ?? []
                  : mergeLatestRecords(dataStateRef.current.budgets, payload.budgets),
              orders:
                payload.orders === null
                  ? dataStateRef.current.orders ?? []
                  : mergeLatestRecords(dataStateRef.current.orders, payload.orders),
            }
          : payload;

        applyMetricsPayload(payload, { merge: useRecentSync });
        setIsOfflineReadOnly(false);

        const nextSnapshot = buildMetricsOfflineSnapshot(snapshotPayload, dataStateRef.current);
        saveOfflineMetricsSnapshot(nextSnapshot);
        saveOfflineDashboardSnapshot({
          savedAt: nextSnapshot.savedAt,
          dashboardScope: dashboardSnapshotScopeRef.current,
          dailyLogs: snapshotPayload.dailyLogs ?? dataStateRef.current.dailyLogs ?? [],
          expenses: snapshotPayload.expenses ?? dataStateRef.current.expenses ?? [],
          pastClosures: snapshotPayload.pastClosures ?? dataStateRef.current.pastClosures ?? [],
        });
        saveOfflineOrdersSnapshot({
          savedAt: nextSnapshot.savedAt,
          budgets: snapshotPayload.budgets ?? dataStateRef.current.budgets ?? [],
          orders: snapshotPayload.orders ?? dataStateRef.current.orders ?? [],
        });
        saveOfflineReportsSnapshot({
          savedAt: nextSnapshot.savedAt,
          pastClosures: snapshotPayload.pastClosures ?? dataStateRef.current.pastClosures ?? [],
        });
        if (
          includeTransactions &&
          transactionSnapshotScopeRef.current === TRANSACTION_SNAPSHOT_SCOPE_FULL &&
          Array.isArray(snapshotPayload.transactions)
        ) {
          saveOfflineTransactionsSnapshot({
            savedAt: nextSnapshot.savedAt,
            transactions: snapshotPayload.transactions,
            transactionsScope: TRANSACTION_SNAPSHOT_SCOPE_FULL,
          });
          setModuleState('transactions', {
            status: 'loaded',
            dirty: false,
            lastLoadedAt: Date.now(),
          });
        }
        setModuleState('metrics', { status: 'loaded', dirty: false, lastLoadedAt: Date.now() });
        return true;
      } catch (error) {
        if (!isCurrentModuleLoadRequest('metrics', requestId)) return true;
        console.error('Error general de conexión (metrics):', error);
        const cachedSnapshot =
          loadOfflineMetricsSnapshot() ||
          loadOfflineTransactionsSnapshot() ||
          loadOfflineDashboardSnapshot() ||
          loadOfflineOrdersSnapshot() ||
          loadOfflineReportsSnapshot() ||
          loadOfflineSnapshot();

        if (applyMetricsSnapshot(cachedSnapshot, {
          includeTransactions:
            transactionSnapshotScopeRef.current !== TRANSACTION_SNAPSHOT_SCOPE_FULL,
        })) {
          setModuleState('metrics', { status: 'loaded', dirty: true, lastLoadedAt: Date.now() });
          return !requireCloud;
        }

        setModuleState('metrics', { status: 'error', dirty: true });
        return false;
      } finally {
        if (moduleLoadPromisesRef.current.metrics === currentPromise) {
          moduleLoadPromisesRef.current.metrics = null;
        }
      }
    };

    currentPromise = run();
    moduleLoadPromisesRef.current.metrics = currentPromise;
    return currentPromise;
  };

  const hydrateDeferredModuleSnapshot = (moduleKey) => {
    if (moduleLoadStateRef.current[moduleKey]?.status !== 'idle') return false;

    const snapshot = moduleKey === 'history'
      ? loadOfflineHistorySnapshot()
      : moduleKey === 'orders'
        ? loadOfflineOrdersSnapshot()
        : null;
    const applied = moduleKey === 'history'
      ? applyHistorySnapshot(snapshot)
      : moduleKey === 'orders'
        ? applyOrdersSnapshot(snapshot)
        : false;

    if (!applied) return false;
    const parsedSavedAt = Date.parse(snapshot?.savedAt);
    setModuleState(moduleKey, {
      status: 'loaded',
      dirty: true,
      lastLoadedAt: Number.isFinite(parsedSavedAt) ? parsedSavedAt : 0,
    });
    return true;
  };

  const loadModuleForTab = async (tab, { force = false, requireCloud = false, full = false } = {}) => {
    const moduleKey = TAB_TO_DATA_MODULE[tab];
    hydrateDeferredModuleSnapshot(moduleKey);

    switch (moduleKey) {
      case 'transactions':
        return loadTransactionsCloudData({ force, requireCloud, full });
      case 'dashboard':
        return Promise.all([
          loadCoreCloudData({ force: false }),
          loadDashboardCloudData({ force, requireCloud, full }),
        ]).then(([, dashboardLoaded]) => dashboardLoaded);
      case 'history':
        return loadHistoryCloudData({ force, requireCloud });
      case 'orders':
        return loadOrdersCloudData({ force, requireCloud });
      case 'reports':
        return loadReportsCloudData({ force, requireCloud });
      case 'metrics':
        return Promise.all([
          loadCoreCloudData({ force: false }),
          loadMetricsCloudData({
            force,
            requireCloud,
            full,
            includeTransactions:
              full ||
              force ||
              transactionSnapshotScopeRef.current !== TRANSACTION_SNAPSHOT_SCOPE_FULL ||
              !isModuleStateFresh(moduleLoadStateRef.current.transactions, MODULE_FRESHNESS_MS.transactions) ||
              !Array.isArray(dataStateRef.current.transactions) ||
              dataStateRef.current.transactions.length === 0,
          }),
        ]).then(([, metricsLoaded]) => metricsLoaded);
      default:
        return true;
    }
  };

  // ==========================================
  // 1.5 CONEXIÓN SUPABASE
  // ==========================================
  const fetchCloudData = async (showSpinner = true, { force = true, includeActiveModule = true, moduleKeys = null, full = false } = {}) => {
    if (isLocalDemoMode()) {
      await loadAppUsers({ force });
      applyLocalDemoSnapshot();
      setIsOfflineReadOnly(false);
      return;
    }

    try {
      if (showSpinner) setIsCloudLoading(true);
      const [coreLoaded] = await Promise.all([
        loadCoreCloudData({ showSpinner: false, force: full ? force : false }),
        loadAppUsers({ force }),
      ]);
      if (!coreLoaded) {
        notifyCloudFallback(
          'No se pudo completar la carga',
          'La nube no devolvio los datos base. Rebu sigue con lo que tenga cargado localmente.'
        );
        return;
      }

      const explicitModuleKeys = Array.isArray(moduleKeys) ? moduleKeys.filter(Boolean) : [];
      const nextModuleKeys = explicitModuleKeys.length
        ? explicitModuleKeys
        : includeActiveModule && currentUserRef.current
          ? [TAB_TO_DATA_MODULE[activeTabRef.current]].filter(Boolean)
          : [];

      for (const moduleKey of new Set(nextModuleKeys)) {
        if (moduleKey === 'transactions') {
          await loadTransactionsCloudData({ force, full });
        } else if (moduleKey === 'dashboard') {
          await loadDashboardCloudData({ force, full });
        } else if (moduleKey === 'history') {
          await loadHistoryCloudData({ force });
        } else if (moduleKey === 'orders') {
          await loadOrdersCloudData({ force });
        } else if (moduleKey === 'reports') {
          await loadReportsCloudData({ force });
        } else if (moduleKey === 'metrics') {
          await loadMetricsCloudData({
            force,
            full,
            includeTransactions:
              full ||
              force ||
              transactionSnapshotScopeRef.current !== TRANSACTION_SNAPSHOT_SCOPE_FULL ||
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
      const cachedDashboardSnapshot = loadOfflineDashboardSnapshot();
      const cachedPosSnapshot = loadOfflinePosSnapshot();
      const hasCoreSnapshot = cachedCoreSnapshot ? applyCoreSnapshot(cachedCoreSnapshot) : false;
      const transactionBootSnapshot = cachedTransactionsSnapshot || cachedCoreSnapshot;
      const dashboardBootSnapshot = cachedDashboardSnapshot || cachedCoreSnapshot;
      const hasTransactionsSnapshot = transactionBootSnapshot
        ? applyTransactionsSnapshot(transactionBootSnapshot)
        : false;
      const hasDashboardSnapshot = dashboardBootSnapshot
        ? applyDashboardSnapshot(dashboardBootSnapshot)
        : false;
      const hasPosSnapshot = cachedPosSnapshot ? applyPosSnapshot(cachedPosSnapshot) : false;
      setIsPosSnapshotHydrated(true);
      const hasSharedUsersSnapshot =
        cachedSharedUsersSnapshot?.authMode === 'supabase' &&
        Array.isArray(cachedSharedUsersSnapshot.users) &&
        cachedSharedUsersSnapshot.users.length > 0;

      if (hasSharedUsersSnapshot) {
        setAuthMode('supabase');
        setAppUsers(cachedSharedUsersSnapshot.users);
      }

      const snapshotLoadedAt = (snapshot) => {
        const parsed = Date.parse(snapshot?.savedAt);
        return Number.isFinite(parsed) ? parsed : 0;
      };
      if (hasCoreSnapshot) {
        setModuleState('core', {
          status: 'loaded',
          dirty: true,
          lastLoadedAt: snapshotLoadedAt(cachedCoreSnapshot),
        });
      }
      if (hasTransactionsSnapshot) {
        setModuleState('transactions', {
          status: 'loaded',
          dirty: transactionSnapshotScopeRef.current !== TRANSACTION_SNAPSHOT_SCOPE_FULL,
          lastLoadedAt: snapshotLoadedAt(transactionBootSnapshot),
        });
      }
      if (hasDashboardSnapshot) {
        setModuleState('dashboard', {
          status: 'loaded',
          dirty: dashboardSnapshotScopeRef.current !== DASHBOARD_SNAPSHOT_SCOPE_FULL,
          lastLoadedAt: snapshotLoadedAt(dashboardBootSnapshot),
        });
      }

      return Boolean(
        hasCoreSnapshot ||
          hasTransactionsSnapshot ||
          hasDashboardSnapshot ||
          hasPosSnapshot ||
          hasSharedUsersSnapshot
      );
    };

    if (isLocalDemoMode()) {
      applyLocalDemoSnapshot();
      setIsPosSnapshotHydrated(true);
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
      void loadAppUsers().finally(() => {
        if (!disposed) setIsAuthBootLoading(false);
      });
    } else {
      if (hasBootSharedUsersSnapshot) {
        setIsAuthBootLoading(false);
      }

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

    let realtimeFallbackSyncTimer = null;
    let realtimeCoreSyncTimer = null;
    let realtimeCategorySyncTimer = null;
    let realtimeUsersSyncTimer = null;
    let realtimeSnapshotTimer = null;
    let lastFetchTime = Date.now();
    let shouldReconcileAfterSubscribe = false;
    let hasSubscribedOnce = false;
    const pendingSnapshotScopes = new Set();
    const reconcileCloudData = createSingleFlightTask(() =>
      fetchCloudData(false, { force: true })
    );
    const requestCloudReconciliation = (errorMessage) => {
      if (disposed) return;
      lastFetchTime = Date.now();
      void reconcileCloudData().catch((error) => {
        console.error(errorMessage, error);
      });
    };
    const markModulesDirty = (moduleKeys = []) => {
      moduleKeys.forEach((moduleKey) => {
        setModuleState(moduleKey, (prev) => ({ ...prev, dirty: true }));
      });
    };

    const scheduleRealtimeSnapshotSave = (scope) => {
      if (scope) pendingSnapshotScopes.add(scope);
      if (realtimeSnapshotTimer) window.clearTimeout(realtimeSnapshotTimer);
      realtimeSnapshotTimer = window.setTimeout(() => {
        realtimeSnapshotTimer = null;
        const snapshotState = dataStateRef.current;
        const savedAt = new Date().toISOString();

        if (pendingSnapshotScopes.has('core')) {
          saveOfflineSnapshot({
            savedAt,
            inventory: snapshotState.inventory || [],
            inventoryScope: inventorySnapshotScopeRef.current,
            productsSyncedThrough: productsSyncedThroughRef.current,
            productsFullSyncedAt: productsFullSyncedAtRef.current,
            categories: snapshotState.categories || [],
            rewards: snapshotState.rewards || [],
            members: snapshotState.members || [],
            agendaContacts: snapshotState.agendaContacts || [],
            offers: snapshotState.offers || [],
            registerState: registerStateSnapshotRef.current || null,
          });
        }
        if (pendingSnapshotScopes.has('transactions')) {
          saveOfflineTransactionsSnapshot({
            savedAt,
            transactions: snapshotState.transactions || [],
            transactionsScope: transactionSnapshotScopeRef.current,
          });
        }
        if (pendingSnapshotScopes.has('dashboard')) {
          saveOfflineDashboardSnapshot({
            savedAt,
            dashboardScope: dashboardSnapshotScopeRef.current,
            dailyLogs: snapshotState.dailyLogs || [],
            expenses: snapshotState.expenses || [],
            pastClosures: snapshotState.pastClosures || [],
          });
        }
        if (pendingSnapshotScopes.has('history')) {
          saveOfflineHistorySnapshot({
            savedAt,
            historyLogs: snapshotState.historyLogs || [],
          });
        }
        if (pendingSnapshotScopes.has('reports')) {
          saveOfflineReportsSnapshot({
            savedAt,
            pastClosures: snapshotState.pastClosures || [],
          });
        }
        pendingSnapshotScopes.clear();
      }, 500);
    };

    const noteRealtimeEvent = () => {
      setRealtimeConnection((prev) => ({
        ...prev,
        lastEventAt: Date.now(),
      }));
    };

    const scheduleAffectedModuleSync = (moduleKeys = []) => {
      const affectedModules = Array.from(new Set(moduleKeys.filter(Boolean)));
      markModulesDirty(affectedModules);
      if (!currentUserRef.current) return;
      const activeModule = TAB_TO_DATA_MODULE[activeTabRef.current];
      if (!activeModule || !affectedModules.includes(activeModule)) return;
      if (realtimeFallbackSyncTimer) window.clearTimeout(realtimeFallbackSyncTimer);
      realtimeFallbackSyncTimer = window.setTimeout(() => {
        realtimeFallbackSyncTimer = null;
        const tabToSync = activeTabRef.current;
        const moduleToSync = TAB_TO_DATA_MODULE[tabToSync];
        if (!moduleToSync || !affectedModules.includes(moduleToSync)) return;

        const syncTasks = [loadModuleForTab(tabToSync, { force: true })];
        if (tabToSync === 'history' && affectedModules.includes('transactions')) {
          syncTasks.push(loadTransactionsCloudData({ force: true }));
        }
        void Promise.all(syncTasks).catch((error) => {
          console.error('No se pudo reconciliar el modulo despues de Realtime:', error);
        });
      }, 650);
    };

    const scheduleCoreSync = () => {
      setModuleState('core', (prev) => ({ ...prev, dirty: true }));
      if (!currentUserRef.current) return;
      if (realtimeCoreSyncTimer) window.clearTimeout(realtimeCoreSyncTimer);
      realtimeCoreSyncTimer = window.setTimeout(() => {
        realtimeCoreSyncTimer = null;
        void loadCoreCloudData({ showSpinner: false, force: true }).catch((error) => {
          console.error('No se pudo reconciliar la base despues de Realtime:', error);
        });
      }, 650);
    };

    const scheduleCategoriesSync = () => {
      setModuleState('core', (prev) => ({ ...prev, dirty: true }));
      if (realtimeCategorySyncTimer) window.clearTimeout(realtimeCategorySyncTimer);
      realtimeCategorySyncTimer = window.setTimeout(() => {
        realtimeCategorySyncTimer = null;
        void fetchRowsWithOptionalActiveFilter({
          table: 'categories',
          selectColumns: CLOUD_SELECTS.categories,
          orderBy: 'name',
          orderDirection: 'asc',
        }).then((result) => {
          if (disposed) return;
          if (result.error) {
            scheduleCoreSync();
            return;
          }
          const next = mapCategoryRecords(result.data || []);
          dataStateRef.current = { ...dataStateRef.current, categories: next };
          setCategories(next);
          setModuleState('core', (prev) => ({
            ...prev,
            status: 'loaded',
            dirty: false,
            lastLoadedAt: Date.now(),
          }));
          scheduleRealtimeSnapshotSave('core');
        }).catch((error) => {
          console.error('No se pudieron sincronizar las categorias notificadas por Realtime:', error);
          scheduleCoreSync();
        });
      }, 350);
    };

    const scheduleUsersSync = () => {
      if (realtimeUsersSyncTimer) window.clearTimeout(realtimeUsersSyncTimer);
      realtimeUsersSyncTimer = window.setTimeout(() => {
        realtimeUsersSyncTimer = null;
        void loadAppUsers({
          force: true,
          includeInactive: activeTabRef.current === 'user-management',
        }).catch((error) => {
          console.error('No se pudieron sincronizar los usuarios notificados por Realtime:', error);
        });
      }, 250);
    };

    const markRealtimeChannelDegraded = (status, error = null) => {
      shouldReconcileAfterSubscribe = true;
      setRealtimeConnection({
        status,
        channelStatus: status,
        degradedSource: 'channel',
        lastError: error?.message || String(error || ''),
      });
      markModulesDirty(['core', 'transactions', 'dashboard', 'history', 'orders', 'reports', 'metrics']);
    };

    const syncSaleIds = async (saleIds) => {
      if (disposed || saleIds.length === 0) return;
      setRealtimeSourceStatus('sales', 'syncing');
      const payload = await fetchTransactionsCloudPayloadByIds(saleIds);
      if (!payload?.hasCloudConnection || payload.transactions === null) {
        throw payload?.error || new Error('No se pudieron consultar las ventas notificadas por Realtime.');
      }

      if (disposed) return;

      setTransactions((prev) => {
        const next = applyLocalTransactionOverrides(
          mergeTransactionsPreservingCostContext(prev, payload.transactions, { replace: false }),
        );
        dataStateRef.current = { ...dataStateRef.current, transactions: next };
        return next;
      });
      setModuleState('transactions', {
        status: 'loaded',
        dirty: false,
        lastLoadedAt: Date.now(),
      });
      setRealtimeSourceStatus('sales', 'idle');
      scheduleRealtimeSnapshotSave('transactions');
    };

    const saleSyncBatcher = createRealtimeIdBatcher({
      delayMs: 275,
      onFlush: syncSaleIds,
      onError: (error) => {
        if (disposed) return;
        console.error('No se pudo aplicar el evento Realtime de ventas:', error);
        setRealtimeSourceStatus('sales', 'error');
        scheduleAffectedModuleSync(['transactions', 'dashboard', 'history', 'metrics']);
      },
    });

    const handleRealtimeSale = (payload) => {
      noteRealtimeEvent();
      markCloudSourceMutation('sales');
      const saleId = getRealtimeRecordId(payload);
      if (!saleId) {
        scheduleAffectedModuleSync(['transactions', 'dashboard', 'history', 'metrics']);
        return;
      }

      if (String(payload.eventType || '').toUpperCase() === 'DELETE') {
        localTransactionOverridesRef.current.delete(saleId);
        setTransactions((prev) => {
          const next = (prev || []).filter((transaction) => String(transaction?.id) !== saleId);
          dataStateRef.current = { ...dataStateRef.current, transactions: next };
          return next;
        });
        setRealtimeSourceStatus('sales', 'idle');
        scheduleRealtimeSnapshotSave('transactions');
        return;
      }

      setRealtimeSourceStatus('sales', 'pending');
      saleSyncBatcher.enqueue(saleId);
    };

    const handleRealtimeExpense = (payload) => {
      noteRealtimeEvent();
      markCloudSourceMutation('expenses');
      if (!getRealtimeRecordId(payload)) {
        scheduleAffectedModuleSync(['dashboard', 'metrics']);
        return;
      }
      setRealtimeSourceStatus('expenses', 'syncing');
      setExpenses((prev) => {
        const result = reconcileRealtimePayload(prev, payload, {
          mapRecord: (record) => mapExpenseRecords([record])[0] || null,
        });
        const next = result.records;
        dataStateRef.current = { ...dataStateRef.current, expenses: next };
        return next;
      });
      setRealtimeSourceStatus('expenses', 'idle');
      scheduleRealtimeSnapshotSave('dashboard');
    };

    const handleRealtimeClosure = (payload) => {
      noteRealtimeEvent();
      markCloudSourceMutation('closures');
      if (!getRealtimeRecordId(payload)) {
        scheduleAffectedModuleSync(['dashboard', 'reports', 'metrics']);
        return;
      }
      setRealtimeSourceStatus('closures', 'syncing');
      setPastClosures((prev) => {
        const result = reconcileRealtimePayload(prev, payload, {
          mapRecord: mapCashClosureRecord,
        });
        const next = result.records;
        dataStateRef.current = { ...dataStateRef.current, pastClosures: next };
        return next;
      });
      setRealtimeSourceStatus('closures', 'idle');
      scheduleRealtimeSnapshotSave('dashboard');
      scheduleRealtimeSnapshotSave('reports');
    };

    const handleRealtimeProduct = (payload) => {
      noteRealtimeEvent();
      if (!getRealtimeRecordId(payload)) {
        scheduleCoreSync();
        return;
      }
      setRealtimeSourceStatus('products', 'syncing');
      setInventory((prev) => {
        const result = reconcileRealtimePayload(prev, payload, {
          mapRecord: (record) => mapInventoryRecords([record])[0] || null,
          keepRecord: (record) => getProductActiveState(record),
        });
        const next = result.records;
        dataStateRef.current = { ...dataStateRef.current, inventory: next };
        return next;
      });
      setRealtimeSourceStatus('products', 'idle');
      scheduleRealtimeSnapshotSave('core');
    };

    const handleRealtimeClient = (payload) => {
      noteRealtimeEvent();
      if (!getRealtimeRecordId(payload)) {
        scheduleCoreSync();
        return;
      }
      setMembers((prev) => {
        const result = reconcileRealtimePayload(prev, payload, {
          mapRecord: (record) => mapMemberRecords([record])[0] || null,
          keepRecord: (record) => record.is_active !== false,
        });
        const next = result.records;
        dataStateRef.current = { ...dataStateRef.current, members: next };
        return next;
      });
      scheduleRealtimeSnapshotSave('core');
    };

    const createRealtimeCoreCollectionHandler = ({ setter, stateKey, mapRecord, keepRecord }) =>
      (payload) => {
        noteRealtimeEvent();
        if (!getRealtimeRecordId(payload)) {
          scheduleCoreSync();
          return;
        }
        setter((prev) => {
          const result = reconcileRealtimePayload(prev, payload, { mapRecord, keepRecord });
          dataStateRef.current = { ...dataStateRef.current, [stateKey]: result.records };
          return result.records;
        });
        scheduleRealtimeSnapshotSave('core');
      };

    const handleRealtimeReward = createRealtimeCoreCollectionHandler({
      setter: setRewards,
      stateKey: 'rewards',
      mapRecord: (record) => mapRewardRecords([record])[0] || null,
      keepRecord: (record) => record.isActive !== false,
    });
    const handleRealtimeOffer = createRealtimeCoreCollectionHandler({
      setter: setOffers,
      stateKey: 'offers',
      mapRecord: (record) => {
        const mapped = mapOfferRecords([record])[0] || null;
        return mapped ? { ...mapped, isActive: record.is_active !== false } : null;
      },
      keepRecord: (record) => record.isActive !== false,
    });
    const handleRealtimeAgendaContact = createRealtimeCoreCollectionHandler({
      setter: setAgendaContacts,
      stateKey: 'agendaContacts',
      mapRecord: mapAgendaContactRecord,
      keepRecord: (record) => record.isActive !== false,
    });

    const handleRealtimeLog = (payload) => {
      noteRealtimeEvent();
      markCloudSourceMutation('logs');
      const mappedLog = mapLogRecords([payload.new])[0] || null;
      if (!mappedLog?.id) {
        scheduleAffectedModuleSync(['transactions', 'dashboard', 'history', 'metrics']);
        return;
      }

      setDailyLogs((prev) => {
        const result = reconcileRealtimePayload(prev, payload, {
          mapRecord: () => mappedLog,
          maxItems: DASHBOARD_LOG_LIMIT,
        });
        const next = result.records;
        dataStateRef.current = { ...dataStateRef.current, dailyLogs: next };
        return next;
      });
      scheduleRealtimeSnapshotSave('dashboard');

      if (!isHistoryLogAction(mappedLog.action)) return;
      setHistoryLogs((prev) => {
        const result = reconcileRealtimePayload(prev, payload, {
          mapRecord: () => mappedLog,
        });
        const next = result.records;
        dataStateRef.current = { ...dataStateRef.current, historyLogs: next };
        return next;
      });
      scheduleRealtimeSnapshotSave('history');

      const saleIds = Array.from(getSaleTransactionIdsFromLogs([mappedLog]));
      if (saleIds.length > 0) {
        setRealtimeSourceStatus('sales', 'pending');
        saleSyncBatcher.enqueue(saleIds);
      } else {
        scheduleAffectedModuleSync(['transactions', 'dashboard', 'history', 'metrics']);
      }
    };

    const channel = supabase
      .channel('app_realtime_updates')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'register_state', filter: 'id=eq.1' },
        (payload) => {
          const newState = payload.new;
          syncRegisterState(newState);
          noteRealtimeEvent();
          scheduleRealtimeSnapshotSave('core');
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cash_closures' },
        handleRealtimeClosure
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sales' },
        handleRealtimeSale
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'expenses' },
        handleRealtimeExpense
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'logs' },
        handleRealtimeLog
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_users' },
        () => {
          noteRealtimeEvent();
          scheduleUsersSync();
        }
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, handleRealtimeProduct)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, handleRealtimeClient)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, (payload) => {
        noteRealtimeEvent();
        scheduleCategoriesSync(payload);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'offers' }, handleRealtimeOffer)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rewards' }, handleRealtimeReward)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agenda_contacts' }, handleRealtimeAgendaContact)
      .subscribe((status, error) => {
        if (disposed) return;
        if (status === 'SUBSCRIBED') {
          const shouldReconcile = hasSubscribedOnce && shouldReconcileAfterSubscribe;
          hasSubscribedOnce = true;
          shouldReconcileAfterSubscribe = false;
          setRealtimeConnection({
            status,
            channelStatus: status,
            degradedSource: null,
            lastConnectedAt: Date.now(),
            lastError: '',
          });
          if (shouldReconcile && currentUserRef.current) {
            requestCloudReconciliation('No se pudo reconciliar despues de reconectar Realtime:');
          }
          return;
        }

        if (REALTIME_DEGRADED_STATUSES.has(status)) {
          markRealtimeChannelDegraded(status, error);
        }
      });

    const unsubscribeHeartbeat = subscribeToRealtimeHeartbeat((heartbeat) => {
      if (disposed) return;
      if (heartbeat.status === 'ok') {
        const previousState = realtimeConnectionStateRef.current;
        const recoveredFromHeartbeat = (
          previousState.degradedSource === 'heartbeat'
          && previousState.channelStatus === 'SUBSCRIBED'
        );
        setRealtimeConnection((prev) => reconcileRealtimeHeartbeatState(prev, heartbeat));
        if (recoveredFromHeartbeat && currentUserRef.current) {
          shouldReconcileAfterSubscribe = false;
          requestCloudReconciliation('No se pudo reconciliar al recuperar Realtime:');
        }
        return;
      }
      if (heartbeat.status === 'timeout' || heartbeat.status === 'disconnected' || heartbeat.status === 'error') {
        shouldReconcileAfterSubscribe = true;
        setRealtimeConnection((prev) => reconcileRealtimeHeartbeatState(prev, heartbeat));
        markModulesDirty(['core', 'transactions', 'dashboard', 'history', 'orders', 'reports', 'metrics']);
        if (heartbeat.status === 'disconnected') supabase.realtime.connect();
      }
    });

    let lastVisibilityState = document.visibilityState;
    const MIN_RESYNC_INTERVAL = 60 * 1000;

    const handleReSync = () => {
      const nextVisibilityState = document.visibilityState;
      const becameVisible = lastVisibilityState !== 'visible' && nextVisibilityState === 'visible';
      lastVisibilityState = nextVisibilityState;
      if (!becameVisible) return;

      const elapsed = Date.now() - lastFetchTime;
      const realtimeIsDegraded = REALTIME_DEGRADED_STATUSES.has(
        realtimeConnectionStateRef.current.status,
      );
      if (elapsed < MIN_RESYNC_INTERVAL && !realtimeIsDegraded) return;

      lastFetchTime = Date.now();
      if (realtimeIsDegraded) supabase.realtime.connect();
      requestCloudReconciliation('No se pudo reconciliar al volver a Rebu:');
    };

    const handleBrowserOffline = () => {
      const recoveredFromCache = hydrateOfflineSnapshots();
      if (recoveredFromCache || isBrowserOffline()) {
        setIsOfflineReadOnly(true);
      }
    };

    const handleBrowserOnline = () => {
      supabase.realtime.connect();
      requestCloudReconciliation('No se pudo reconciliar al recuperar internet:');
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
      saleSyncBatcher.dispose();
      unsubscribeHeartbeat();
      if (realtimeFallbackSyncTimer) {
        window.clearTimeout(realtimeFallbackSyncTimer);
      }
      if (realtimeCoreSyncTimer) {
        window.clearTimeout(realtimeCoreSyncTimer);
      }
      if (realtimeCategorySyncTimer) {
        window.clearTimeout(realtimeCategorySyncTimer);
      }
      if (realtimeUsersSyncTimer) {
        window.clearTimeout(realtimeUsersSyncTimer);
      }
      if (realtimeSnapshotTimer) {
        window.clearTimeout(realtimeSnapshotTimer);
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
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [imageImportOpenRequest, setImageImportOpenRequest] = useState(0);
  const [supplierOpenRequest, setSupplierOpenRequest] = useState(0);

  useEffect(() => {
    document.body.dataset.activeWorkspace = activeTab;
    return () => {
      if (document.body.dataset.activeWorkspace === activeTab) {
        delete document.body.dataset.activeWorkspace;
      }
    };
  }, [activeTab]);
  const [dismissedSupplierNoticeKey, setDismissedSupplierNoticeKey] = useState('');
  const [supplierNoticeDismissalScope, setSupplierNoticeDismissalScope] = useState('');
  const supplierNoticeUserScope = String(
    currentUser?.id ||
    currentUser?.authUserId ||
    currentUser?.auth_user_id ||
    currentUser?.username ||
    currentUser?.name ||
    ''
  );
  useEffect(() => {
    setDismissedSupplierNoticeKey(loadSupplierNoticeDismissal(supplierNoticeUserScope));
    setSupplierNoticeDismissalScope(supplierNoticeUserScope);
  }, [supplierNoticeUserScope]);
  const [userSettings, setUserSettings] = useState(() => loadUserSettings());
  const [loginTheme, setLoginTheme] = useState(() => loadLoginThemePreference());
  const [isThemeSaving, setIsThemeSaving] = useState(false);
  const [authMode, setAuthMode] = useState(() => {
    const cachedSharedUsersSnapshot = loadOfflineSharedUsersSnapshot();
    if (cachedSharedUsersSnapshot?.authMode === 'supabase') return 'supabase';
    return isLocalDemoMode() ? 'legacy' : 'supabase';
  });
  const [appUsers, setAppUsers] = useState(() => {
    const cachedSharedUsersSnapshot = loadOfflineSharedUsersSnapshot();
    if (cachedSharedUsersSnapshot?.authMode === 'supabase' && Array.isArray(cachedSharedUsersSnapshot.users)) {
      return cachedSharedUsersSnapshot.users;
    }
    return isLocalDemoMode() ? buildLegacyUsers(USERS, loadUserSettings()) : [];
  });
  const [appUsersLoadError, setAppUsersLoadError] = useState('');
  const [isRetryingLoginUsers, setIsRetryingLoginUsers] = useState(false);
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
  const memberCreationRequestsRef = useRef(new Set());
  const lastCloudFallbackNoticeRef = useRef(0);
  const isCheckoutInProgressRef = useRef(false);
  // Clave de cobro por carrito. Se genera en el primer intento y se conserva
  // hasta que la venta entra de verdad: asi un reintento del MISMO carrito
  // llega con la misma clave y la base lo reconoce como repetido.
  const checkoutOperationKeysRef = useRef(new Map());
  const secureSessionHealthRef = useRef(assessSecureSession());
  const secureSessionCheckPromiseRef = useRef(null);
  const secureSessionRefreshPromiseRef = useRef(null);
  const notificationsPanelRef = useRef(null);
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

  useEffect(() => {
    const electronApi = window.electronAPI;
    if (!electronApi?.getUpdateStatus) return undefined;

    let active = true;
    const applyUpdateStatus = (nextStatus) => {
      if (!active || !nextStatus || typeof nextStatus !== 'object') return;
      setAppUpdateStatus((currentStatus) => {
        const currentRevision = Number(currentStatus?.revision || 0);
        const nextRevision = Number(nextStatus?.revision || 0);
        return nextRevision >= currentRevision ? { ...currentStatus, ...nextStatus } : currentStatus;
      });
    };

    const unsubscribe = electronApi.onUpdateStatus?.(applyUpdateStatus);
    Promise.resolve(electronApi.getUpdateStatus())
      .then(applyUpdateStatus)
      .catch(() => {});

    return () => {
      active = false;
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  const handleCheckForUpdates = useCallback(() => {
    void window.electronAPI?.checkForUpdates?.();
  }, []);

  const handleDownloadUpdate = useCallback(() => {
    void window.electronAPI?.downloadUpdate?.();
  }, []);

  const handleInstallUpdate = useCallback(() => {
    void window.electronAPI?.installUpdate?.();
  }, []);

  const [posCartWorkspace, setPosCartWorkspace] = useState(() => createPosCartWorkspace());
  const [isPosSnapshotHydrated, setIsPosSnapshotHydrated] = useState(false);
  const posCartTabs = posCartWorkspace.tabs;
  const activePosCartId = posCartWorkspace.activeId;
  const activePosCart = useMemo(() => getActivePosCart(posCartWorkspace), [posCartWorkspace]);
  const cart = useMemo(() => activePosCart?.cart || EMPTY_POS_CART, [activePosCart]);
  const posSelectedClient = activePosCart?.selectedClient || null;
  const selectedPayment = activePosCart?.selectedPayment || 'Efectivo';
  const installments = Number(activePosCart?.installments || 1) || 1;

  const setActivePosCartField = useCallback((field, valueOrUpdater) => {
    setPosCartWorkspace((current) => updateActivePosCartField(current, field, valueOrUpdater));
  }, []);
  const setCart = useCallback((valueOrUpdater) => {
    setActivePosCartField('cart', valueOrUpdater);
  }, [setActivePosCartField]);
  const setPosSelectedClient = useCallback((valueOrUpdater) => {
    setActivePosCartField('selectedClient', valueOrUpdater);
  }, [setActivePosCartField]);
  const setSelectedPayment = useCallback((valueOrUpdater) => {
    setActivePosCartField('selectedPayment', valueOrUpdater);
  }, [setActivePosCartField]);
  const setInstallments = useCallback((valueOrUpdater) => {
    setActivePosCartField('installments', valueOrUpdater);
  }, [setActivePosCartField]);
  const resetPosCartWorkspace = useCallback(() => {
    setPosCartWorkspace(createPosCartWorkspace());
  }, []);
  const handleAddPosCart = useCallback(() => {
    setPosCartWorkspace((current) => addPosCartTab(current));
  }, []);
  const handleSelectPosCart = useCallback((tabId) => {
    setPosCartWorkspace((current) => selectPosCartTab(current, tabId));
  }, []);
  const closePosCartAfterCheckout = useCallback((tabId) => {
    setPosCartWorkspace((current) => closePosCartTab(current, tabId));
  }, []);

  const handleClosePosCart = useCallback(async (tabId) => {
    const targetTab = posCartTabs.find((tab) => String(tab.id) === String(tabId));
    if (!targetTab) return;

    const hasDraft = targetTab.cart.length > 0 || Boolean(targetTab.selectedClient);
    if (hasDraft) {
      const result = await Swal.fire({
        title: `Cerrar Pedido ${targetTab.sequence}`,
        text: 'Los productos y el cliente guardados en esta pestaña se descartarán.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Cerrar pedido',
        cancelButtonText: 'Conservar',
        confirmButtonColor: '#dc2626',
      });
      if (!result.isConfirmed) return;
    }

    setPosCartWorkspace((current) => closePosCartTab(current, tabId));
  }, [posCartTabs]);

  const [loginStep, setLoginStep] = useState('select');
  const [selectedUserIdForLogin, setSelectedUserIdForLogin] = useState(null);
  const [passwordInput, setPasswordInput] = useState('');
  // null = nadie esta ingresando. El resto son las etapas visibles del boton.
  const [loginSubmitStage, setLoginSubmitStage] = useState(null);
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
  const canViewWhatsApp = canAccessTab(currentUser, 'whatsapp');
  const canViewReports = canAccessTab(currentUser, 'reports');
  const canViewMetrics = canAccessTab(currentUser, 'metrics');
  const canViewLogs = canAccessTab(currentUser, 'logs');
  const canViewSessions = canAccessTab(currentUser, 'sessions');
  const canViewUserManagement = canAccessTab(currentUser, 'user-management');
  const canViewBulkEditor = canAccessTab(currentUser, 'bulk-editor');
  const canViewAiImages = canAccessTab(currentUser, 'ai-images');
  const canViewAgenda = canAccessTab(currentUser, 'agenda');
  const canCreateInventory = hasPermission(currentUser, 'inventory.create');
  const canEditInventory = hasPermission(currentUser, 'inventory.edit');

  useEffect(() => {
    if (!currentUser) return;
    if (activeTab !== 'ticket-test' && !canAccessTab(currentUser, activeTab)) {
      setActiveTab(getDefaultTabForUser(currentUser));
    }
  }, [activeTab, currentUser]);

  useEffect(() => {
    if (currentUser || isAuthBootLoading || appUsers.length === 0) return;

    const restoreRememberedSession = async () => {
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
    };

    void restoreRememberedSession();

  }, [appUsers, authMode, currentUser, isAuthBootLoading]);

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
  const [ticketTestPrintData, setTicketTestPrintData] = useState(null);
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
  }, [cart, setCart]);
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
  const [memberIdentityPanelState, setMemberIdentityPanelState] = useState({
    isOpen: false,
    initialMode: 'member',
    initialFocus: 'select',
  });
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [expenseToEdit, setExpenseToEdit] = useState(null);

  const [detailsModalTx, setDetailsModalTx] = useState(null);

  const [newItem, setNewItem] = useState({
    title: '', brand: '', price: '', purchasePrice: '', stock: '',
    categories: [], image: '', image_thumb: '', barcode: '',
    product_type: 'quantity',
    expiration_date: '' 
  });

  const [tempOpeningBalance, setTempOpeningBalance] = useState('');
  const [tempClosingTime, setTempClosingTime] = useState('21:00');

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
        'posCarts' in snapshot ||
        'posCartWorkspace' in snapshot ||
        'cart' in snapshot ||
        'selectedClient' in snapshot ||
        'selectedPayment' in snapshot ||
        'installments' in snapshot ||
        'posSearch' in snapshot ||
        'selectedCategory' in snapshot ||
        'posViewMode' in snapshot
      );

    if (!hasPosData) return false;

    setPosCartWorkspace(normalizePosCartWorkspace(snapshot));
    setIsPosSnapshotHydrated(true);
    setPosSearch(snapshot.posSearch || '');
    setPosSelectedCategory(snapshot.selectedCategory || 'Todas');
    setPosViewMode(snapshot.posViewMode || 'grid');
    if (snapshot.savedAt) setOfflineSnapshotAt(snapshot.savedAt);
    return true;
  };

  const [notification, setNotification] = useState({ isOpen: false, type: 'info', title: '', message: '' });

  useEffect(() => {
    if (!isPosSnapshotHydrated) return;

    const nextPosSnapshot = {
      savedAt: new Date().toISOString(),
      posCarts: posCartTabs,
      activePosCartId,
      posCartWorkspace: {
        activeId: activePosCartId,
        nextSequence: posCartWorkspace.nextSequence,
      },
      cart: Array.isArray(cart) ? cart : [],
      selectedClient: posSelectedClient || null,
      selectedPayment: selectedPayment || 'Efectivo',
      installments: Number(installments || 1) || 1,
      posSearch: posSearch || '',
      selectedCategory: posSelectedCategory || 'Todas',
      posViewMode: posViewMode || 'grid',
    };

    saveOfflinePosSnapshot(nextPosSnapshot);
  }, [
    activePosCartId,
    cart,
    installments,
    isPosSnapshotHydrated,
    posCartTabs,
    posCartWorkspace.nextSequence,
    posSearch,
    posSelectedCategory,
    posSelectedClient,
    posViewMode,
    selectedPayment,
  ]);

  const showNotification = (type, title, message) => {
    setNotification({ isOpen: true, type, title, message });
  };

  function notifyCloudFallback(title, message, type = 'warning') {
    const now = Date.now();
    if (now - Number(lastCloudFallbackNoticeRef.current || 0) < 15000) return;
    lastCloudFallbackNoticeRef.current = now;
    showNotificationRef.current?.(type, title, message);
  }

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

  const checkSecureSession = useCallback(async ({ source = 'manual' } = {}) => {
    if (!ENABLE_LOGIN_AUTH_SESSION || isLocalDemoMode()) {
      return { status: 'disabled', isUsable: true, source };
    }

    if (secureSessionCheckPromiseRef.current) {
      return secureSessionCheckPromiseRef.current;
    }

    const checkPromise = (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        const assessment = assessSecureSession({
          session: data?.session || null,
          expectedAuthUserId: getExpectedAuthUserId(
            currentUserRef.current,
            currentSessionMetaRef.current,
          ),
          error,
        });
        secureSessionHealthRef.current = { ...assessment, source, checkedAt: Date.now() };
        return secureSessionHealthRef.current;
      } catch (error) {
        const assessment = assessSecureSession({ error });
        secureSessionHealthRef.current = { ...assessment, source, checkedAt: Date.now() };
        return secureSessionHealthRef.current;
      }
    })();

    secureSessionCheckPromiseRef.current = checkPromise;
    try {
      return await checkPromise;
    } finally {
      if (secureSessionCheckPromiseRef.current === checkPromise) {
        secureSessionCheckPromiseRef.current = null;
      }
    }
  }, []);

  const recoverSecureSessionForCheckout = useCallback(async () => {
    const currentAssessment = await checkSecureSession({ source: 'checkout' });
    if (
      currentAssessment.isUsable
      || currentAssessment.status === SECURE_SESSION_STATUS.MISSING
      || currentAssessment.status === SECURE_SESSION_STATUS.MISMATCH
      || isBrowserOffline()
    ) {
      return currentAssessment;
    }

    if (secureSessionRefreshPromiseRef.current) {
      return secureSessionRefreshPromiseRef.current;
    }

    const refreshPromise = (async () => {
      try {
        const { data, error } = await supabase.auth.refreshSession();

        // Un JWT guardado invalido no se puede renovar: no hay reintento posible
        // porque el refresh token viaja en el mismo paquete. Lo unico util es
        // descartarlo para que el proximo ingreso arranque limpio.
        if (error) {
          console.error(
            '[REBU][auth] se descarta la sesion: no se pudo renovar',
            recordDiagnosticError('auth:refresh', error, {
              tokenPersistidoInvalido: isPersistedSupabaseJwtError(error),
            }),
          );
          // Se descarta SIEMPRE, no solo ante errores de JWT. Un token que no
          // se puede renovar viaja igual en el header de cada pedido y hace que
          // Supabase conteste 401 a TODO, incluso a las lecturas que el rol
          // anonimo tiene permitidas. Sin sesion la app funciona; con una
          // sesion rota, no.
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        }

        const assessment = assessSecureSession({
          session: data?.session || null,
          expectedAuthUserId: getExpectedAuthUserId(
            currentUserRef.current,
            currentSessionMetaRef.current,
          ),
          error,
        });
        secureSessionHealthRef.current = {
          ...assessment,
          source: 'checkout:auto-refresh',
          checkedAt: Date.now(),
        };
        return secureSessionHealthRef.current;
      } catch (error) {
        const assessment = assessSecureSession({ error });
        secureSessionHealthRef.current = {
          ...assessment,
          source: 'checkout:auto-refresh',
          checkedAt: Date.now(),
        };
        return secureSessionHealthRef.current;
      }
    })();

    secureSessionRefreshPromiseRef.current = refreshPromise;
    try {
      return await refreshPromise;
    } finally {
      if (secureSessionRefreshPromiseRef.current === refreshPromise) {
        secureSessionRefreshPromiseRef.current = null;
      }
    }
  }, [checkSecureSession]);

  useEffect(() => {
    if (!ENABLE_LOGIN_AUTH_SESSION || isLocalDemoMode()) return undefined;

    const updateFromAuthEvent = (event, session) => {
      const assessment = assessSecureSession({
        session,
        expectedAuthUserId: getExpectedAuthUserId(
          currentUserRef.current,
          currentSessionMetaRef.current,
        ),
      });
      secureSessionHealthRef.current = {
        ...assessment,
        source: `auth:${String(event || 'unknown').toLowerCase()}`,
        checkedAt: Date.now(),
      };
    };

    const { data: authListener } = supabase.auth.onAuthStateChange(updateFromAuthEvent);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && currentUserRef.current) {
        void checkSecureSession({ source: 'visibility' });
      }
    };
    const handleOnline = () => {
      if (currentUserRef.current) {
        void checkSecureSession({ source: 'online' });
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleOnline);
    if (currentUserRef.current) void checkSecureSession({ source: 'mount' });

    return () => {
      authListener?.subscription?.unsubscribe?.();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
    };
  }, [checkSecureSession]);

  useEffect(() => {
    if (!currentUser || isAuthBootLoading) return;
    void checkSecureSession({ source: 'rebu-user' });
  }, [checkSecureSession, currentUser, isAuthBootLoading]);

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
      'Modo sin conexion',
      `Estas viendo datos locales. Reconecta la nube antes de ${actionLabel}.`
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
        getCloudReconnectErrorMessage(error),
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

      const [refreshedUsers, coreLoaded] = await Promise.all([
        withTimeout(
          loadAppUsers({ force: true, includeInactive: activeTabRef.current === 'user-management' }),
          FORCE_RELOAD_TIMEOUT_MS,
          'Recarga de usuarios',
        ),
        withTimeout(
          loadCoreCloudData({ showSpinner: false, force: true, requireCloud: true }),
          FORCE_RELOAD_TIMEOUT_MS,
          'Recarga de datos base',
        ),
      ]);
      if (!Array.isArray(refreshedUsers) || refreshedUsers.length === 0) {
        throw new Error('No se pudo recuperar el directorio de usuarios.');
      }
      if (!coreLoaded) {
        throw new Error('No se pudieron actualizar los datos base desde la nube.');
      }

      const moduleLoaded = await withTimeout(
        loadModuleForTab(activeTabRef.current, { force: true, requireCloud: true, full: true }),
        FORCE_RELOAD_TIMEOUT_MS,
        'Recarga del modulo visible',
      );
      if (!moduleLoaded) {
        throw new Error('Los datos base se actualizaron, pero fallo el modulo visible.');
      }

      setIsOfflineReadOnly(false);
      showNotification('success', 'Base actualizada', 'Se recargaron los usuarios, los datos base y el modulo visible.');
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
    return isTestRecord(posCartTabs) ||
           isTestRecord(posSearch) ||
           isTestRecord(newItem) ||
           isTestRecord(editingProduct) ||
           isTestRecord(editingTransaction) ||
           isTestRecord(transactionSearch);
  }, [posCartTabs, posSearch, newItem, editingProduct, editingTransaction, transactionSearch]);

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
    markCloudSourceMutation(
      'logs',
      ...(isHistoryLogAction(action) ? ['sales'] : []),
    );
    setDailyLogs((prev) => [newLog, ...prev].slice(0, DASHBOARD_LOG_LIMIT));
    if (isHistoryLogAction(action)) {
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
    const signOutPromise = supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    clearRememberedSession();
    secureSessionHealthRef.current = assessSecureSession();
    currentSessionMetaRef.current = null;
    currentUserRef.current = null;
    setCurrentSessionMeta(null);
    setCurrentUser(null);
    resetPosCartWorkspace();
    setLoginStep('select');
    setSelectedUserIdForLogin(null);
    setPasswordInput('');
    setRememberLoginSession(false);
    setLoginError('');
    void signOutPromise.finally(() => {
      void loadAppUsers({ force: true, includeInactive: false }).catch((error) => {
        console.warn('No se pudo refrescar el directorio de usuarios despues de cerrar sesion.', error);
      });
    });
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

  const forceLightThemeForPdfExport = () => {
    if (typeof document === 'undefined') return () => {};

    const root = document.documentElement;
    const body = document.body;
    const previous = {
      rootTheme: root.dataset.theme,
      bodyTheme: body.dataset.theme,
      rootPdfTheme: root.dataset.pdfTheme,
      bodyPdfTheme: body.dataset.pdfTheme,
      bodyPdfCapture: body.dataset.pdfCapture,
      rootColorScheme: root.style.colorScheme,
      bodyColorScheme: body.style.colorScheme,
    };

    root.dataset.theme = 'light';
    body.dataset.theme = 'light';
    root.dataset.pdfTheme = 'light';
    body.dataset.pdfTheme = 'light';
    root.style.colorScheme = 'light';
    body.style.colorScheme = 'light';

    return () => {
      if (previous.rootTheme === undefined) delete root.dataset.theme;
      else root.dataset.theme = previous.rootTheme;
      if (previous.bodyTheme === undefined) delete body.dataset.theme;
      else body.dataset.theme = previous.bodyTheme;
      if (previous.rootPdfTheme === undefined) delete root.dataset.pdfTheme;
      else root.dataset.pdfTheme = previous.rootPdfTheme;
      if (previous.bodyPdfTheme === undefined) delete body.dataset.pdfTheme;
      else body.dataset.pdfTheme = previous.bodyPdfTheme;
      if (previous.bodyPdfCapture === undefined) delete body.dataset.pdfCapture;
      else body.dataset.pdfCapture = previous.bodyPdfCapture;
      root.style.colorScheme = previous.rootColorScheme;
      body.style.colorScheme = previous.bodyColorScheme;
    };
  };

  const waitForPdfExportReady = async () => {
    if (typeof document === 'undefined') return;

    document.body.dataset.pdfCapture = 'true';

    const deadline = Date.now() + 5000;
    let exportRoot = document.querySelector('[data-pdf-export]');
    while ((!exportRoot || !String(exportRoot.textContent || '').trim()) && Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 50));
      exportRoot = document.querySelector('[data-pdf-export]');
    }

    if (!exportRoot || !String(exportRoot.textContent || '').trim()) {
      throw new Error('El contenido del PDF no lleg\u00f3 a renderizarse.');
    }

    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    const images = Array.from(exportRoot.querySelectorAll('img'));
    await Promise.all(images.map(async (image) => {
      if (!image.complete) {
        await Promise.race([
          new Promise((resolve) => {
            image.addEventListener('load', resolve, { once: true });
            image.addEventListener('error', resolve, { once: true });
          }),
          new Promise((resolve) => window.setTimeout(resolve, 2000)),
        ]);
      }
      if (typeof image.decode === 'function') {
        await image.decode().catch(() => {});
      }
    }));

    await new Promise((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
    });
  };

  const savePreparedPdf = async (safeName, restorePdfTheme, pdfData = null) => {
    try {
      if (window.electronAPI?.saveExportPdf && pdfData) {
        const result = await window.electronAPI.saveExportPdf({
          defaultName: `${safeName}.pdf`,
          data: pdfData,
        });

        if (result.success) {
          showNotification('success', 'PDF Guardado', `Guardado en: ${result.filePath}`);
          return true;
        } else if (!result.canceled) {
          Swal.fire('Error', 'No se pudo guardar el PDF: ' + result.error, 'error');
        }
        return false;
      } else if (window.electronAPI?.saveAsPdf) {
        await waitForPdfExportReady();
        const result = await window.electronAPI.saveAsPdf(`${safeName}.pdf`);

        if (result.success) {
          showNotification('success', 'PDF Guardado', `Guardado en: ${result.filePath}`);
          return true;
        } else if (!result.canceled) {
          Swal.fire('Error', 'No se pudo guardar el PDF: ' + result.error, 'error');
        }
        return false;
      } else {
        await waitForPdfExportReady();
        window.print();
        showNotification('info', 'Vista de impresi\u00f3n abierta', 'No se detect\u00f3 Electron; us\u00e1 "Guardar como PDF" desde el di\u00e1logo del navegador');
        return true;
      }
    } catch (error) {
      console.error('Error preparando el PDF:', error);
      Swal.fire(
        'No se pudo generar el PDF',
        error?.message || 'El documento no termin\u00f3 de renderizarse. Volv\u00e9 a intentarlo.',
        'error',
      );
      return false;
    } finally {
      setExportPdfData(null);
      restorePdfTheme();
    }
  };

  const handleWhatsAppBudgetPdf = async ({ budget, items }) => {
    if (!window.electronAPI?.captureExportPdf) {
      throw new Error('Abrí Rebu como aplicación de escritorio para generar el PDF.');
    }
    const restorePdfTheme = forceLightThemeForPdfExport();
    try {
      setExportPdfData({
        config: {
          isForClient: true,
          documentTitle: 'PRESUPUESTO',
          clientName: budget?.customerName || 'Cliente',
          clientPhone: budget?.customerPhone || '',
          clientColumns: { showQty: true, showUnitPrice: true, showSubtotal: false, showTotal: true },
        },
        items: (items || []).map((item) => ({
          id: item.product_id || item.title,
          title: item.title,
          category: item.category || 'WhatsApp',
          qty: Number(item.quantity) || 0,
          newPrice: Number(item.unit_price) || 0,
          product_type: item.product_type || 'quantity',
        })),
        date: formatDateAR(new Date()),
      });
      await waitForPdfExportReady();
      const result = await window.electronAPI.captureExportPdf();
      if (!result?.success || !result.base64) {
        throw new Error(result?.error || 'No se pudo generar el PDF.');
      }
      return result;
    } finally {
      setExportPdfData(null);
      restorePdfTheme();
    }
  };

  const handleExportProducts = (config, items, { standalone = false } = {}) => {
    const dateStr = formatDateAR(new Date());
    const dataToExport = { config, items, date: dateStr };
    const restorePdfTheme = forceLightThemeForPdfExport();
    
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

    const defaultTitle = config.documentTitle 
      ? `${config.documentTitle} - ${config.clientName || 'Cliente'}` 
      : 'Reporte Interno';

    const safeName = defaultTitle.replace(/[^a-zA-Z0-9 _-]/g, '');

    return new Promise((resolve) => {
      window.setTimeout(async () => {
        const wasExported = await savePreparedPdf(
          safeName,
          restorePdfTheme,
          standalone ? dataToExport : null,
        );
        if (wasExported) {
          addLog('Exportación PDF', logDetails, 'Exportación de catálogo');
        }
        resolve(wasExported);
      }, 0);
    });
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
    
    const restorePdfTheme = forceLightThemeForPdfExport();
    setExportPdfData(logDetails.snapshot);
    const config = logDetails.snapshot.config || {};
    const defaultTitle = config.documentTitle 
      ? `${config.documentTitle} - ${config.clientName || 'Cliente'} (Copia)` 
      : 'Reporte_Historico';
    const safeName = defaultTitle.replace(/[^a-zA-Z0-9 _-]/g, '');

    window.setTimeout(() => {
      void savePreparedPdf(safeName, restorePdfTheme);
    }, 0);
  };
  

    // ? NUEVO: HANDLER PARA FIJAR PRODUCTO PERSONALIZADO DESDE EL PRESUPUESTO
  const handleCreateFixedProduct = async (title, price) => {
    if (blockIfOfflineReadonly('crear productos')) return;
    try {
      const payload = {
        title: title,
        brand: '',
        price: normalizeFinalSalePrice(price),
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
      
      const itemFormatted = mapInventoryRecords([{ ...data, categories: ['Depósito'] }])[0];
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

      let data;
      if (budgetData.operationKey) {
        const { data: rpcData, error: rpcError } = await supabase.rpc(
          'create_whatsapp_budget_once',
          {
            p_operation_key: String(budgetData.operationKey).slice(0, 180),
            p_budget: payload,
          },
        );
        if (rpcError) throw rpcError;
        data = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      } else {
        const result = await insertWithSchemaFallback('budgets', payload, CLOUD_SELECTS.budgets);
        data = result.data;
      }

      const newBudget = mapBudgetRecords([data])[0];
      setBudgets((prev) => (
        prev.some((entry) => String(entry.id) === String(newBudget.id))
          ? prev
          : [newBudget, ...prev]
      ));
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
      return updatedBudget;
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

      if (transactions.some((tx) => String(tx.orderId || '') === String(id))) {
        showNotification(
          'warning',
          'Pedido ya facturado',
          'Cancelá este pedido y generá uno nuevo para cambiar productos, importe o socio.',
        );
        return;
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

      const wasStockReserved = isOrderStockReserved(previousOrder);
      const orderPreview = {
        ...previousOrder,
        memberId: orderData.memberId || null,
        customerName: orderData.customerName || '',
        customerPhone: orderData.customerPhone || '',
        customerNote: orderData.customerNote || '',
        documentTitle: orderData.documentTitle || 'PEDIDO',
        eventLabel: orderData.eventLabel || '',
        itemsSnapshot: wasStockReserved
          ? (orderData.itemsSnapshot || [])
          : markOrderItemsForDeferredStock(orderData.itemsSnapshot || []),
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
      if (isCrossingToFullyPaid && !wasStockReserved) {
        const { stockIssues } = getOrderStockIssues(orderPreview);
        if (stockIssues.length > 0) {
          showNotification('error', 'Stock Insuficiente', `No se puede completar el pedido: ${stockIssues.join(', ')}`);
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

      const rpcOrder = await saveOrderWithPointsCloud({
        operationKey: buildOrderOperationKey('edit', id, previousOrder.version || 1),
        action: 'edit',
        orderId: id,
        orderPayload: payload,
        expectedVersion: previousOrder.version || 1,
      });
      const data = rpcOrder || (
        await updateWithSchemaFallback('orders', id, payload, CLOUD_SELECTS.orders)
      ).data;
      const updatedOrder = mapOrderRecords([data])[0];

      if (rpcOrder) {
        await syncMemberPointBalancesCloud(previousOrder.memberId, updatedOrder.memberId);
      }

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
      markCloudSourceMutation('sales');
      setModuleState('transactions', (prev) => ({ ...prev, dirty: true }));
      if (orderLog) upsertLocalHistoryLog(orderLog);
      showNotification('success', 'Pedido Actualizado', 'Los cambios del pedido se guardaron.');
      return updatedOrder;
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

  const buildStockLifecyclePayload = (product, delta, { trackDepletion = false, now = new Date().toISOString() } = {}) => {
    const numericDelta = Number(delta || 0);
    const stockBefore = Number(product?.stock || 0);
    const stockAfter = stockBefore + numericDelta;
    const supplierLinksAreHydrated = hasHydratedSupplierLinks(product);
    const supplierLinks = supplierLinksAreHydrated
      ? updateStockLifecycleLinks(
          getProductSupplierLinks(product),
          { stockBefore, stockAfter, delta: numericDelta, trackDepletion, now },
        )
      : null;
    const payload = supplierLinksAreHydrated ? { supplier_links: supplierLinks } : {};
    const lifecycleProduct = supplierLinksAreHydrated
      ? { ...product, stock: stockAfter, supplierLinks, supplier_links: supplierLinks }
      : { ...product, stock: stockAfter };

    if (numericDelta > 0 || stockAfter > 0) {
      payload.is_active = true;
    }

    if (shouldAutoDisableOutOfStockProduct(lifecycleProduct, new Date(now))) {
      payload.is_active = false;
    }

    return { payload, supplierLinks, stockAfter };
  };

  const syncStockLifecycleForDeltas = async (deltaByProduct = {}, { trackDepletion = false } = {}) => {
    const entries = Object.entries(deltaByProduct).filter(([, delta]) => Number(delta || 0) !== 0);
    if (entries.length === 0) return [];

    const now = new Date().toISOString();
    const updatedProducts = [];

    for (const [id, delta] of entries) {
      const product = inventory.find((entry) => String(entry.id) === String(id));
      if (!product) continue;

      const { payload, stockAfter } = buildStockLifecyclePayload(product, delta, { trackDepletion, now });

      try {
        if (Object.keys(payload).length === 0) continue;
        if (isLocalDemoMode()) {
          const localProduct = localDemoUpdateRow('products', product.id, payload);
          updatedProducts.push(mapInventoryRecords([{ ...(localProduct || product), stock: stockAfter }])[0]);
        } else {
          const { data } = await updateWithSchemaFallback('products', product.id, payload, CLOUD_SELECTS.products);
          updatedProducts.push(mapInventoryRecords([data || { ...product, ...payload, stock: stockAfter }])[0]);
        }
      } catch (error) {
        console.warn('No se pudo actualizar el ciclo de stock del producto:', product?.title || id, error);
      }
    }

    const safeProducts = updatedProducts.filter(Boolean);
    if (safeProducts.length > 0) {
      const updatedById = new Map(safeProducts.map((product) => [String(product.id), product]));
      setInventory((prev) =>
        prev
          .map((product) => updatedById.get(String(product.id)) || product)
          .filter((product) => getProductActiveState(product))
      );
    }

    return safeProducts;
  };

  const deactivateStaleOutOfStockProducts = async (productsToCheck = []) => {
    const staleProducts = (productsToCheck || []).filter((product) => shouldAutoDisableOutOfStockProduct(product));
    if (staleProducts.length === 0 || isLocalDemoMode()) return;

    for (const product of staleProducts) {
      try {
        await updateWithSchemaFallback('products', product.id, { is_active: false }, CLOUD_SELECTS.products);
      } catch (error) {
        console.warn('No se pudo inhabilitar producto agotado antiguo:', product?.title || product?.id, error);
      }
    }

    setInventory((prev) =>
      prev.filter((product) => !staleProducts.some((stale) => String(stale.id) === String(product.id)))
    );
  };

  const applyProductStockDeltaCloud = async (product, delta) => {
    const numericDelta = Number(delta || 0);
    if (!product || !numericDelta) return Number(product?.stock || 0);

    if (await canUseTransactionRpcs()) {
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

    const currentStock = Number(product.stock || 0);
    const fallbackStock = currentStock + numericDelta;
    const { data: updatedProduct, error: stockErr } = await supabase
      .from('products')
      .update({ stock: fallbackStock })
      .eq('id', product.id)
      .eq('stock', currentStock)
      .select('stock')
      .maybeSingle();
    if (stockErr) throw stockErr;
    if (!updatedProduct) {
      throw new Error('El stock cambio en otra caja. Recarga los datos e intenta nuevamente.');
    }
    return Number(updatedProduct.stock ?? fallbackStock);
  };

  const applyStockEntriesCloudWithRollback = async (entries = []) => {
    if (isLocalDemoMode()) return;
    const appliedEntries = [];

    try {
      for (const [id, delta] of entries) {
        const product = inventory.find((entry) => String(entry.id) === String(id));
        if (!product) continue;
        await applyProductStockDeltaCloud(product, delta);
        appliedEntries.push({ product, delta: Number(delta || 0) });
      }
    } catch (stockError) {
      const rollbackErrors = [];
      for (const { product, delta } of [...appliedEntries].reverse()) {
        try {
          await applyProductStockDeltaCloud(
            { ...product, stock: Number(product.stock || 0) + delta },
            -delta,
          );
        } catch (rollbackError) {
          rollbackErrors.push(`${product.title}: ${rollbackError.message}`);
        }
      }

      const rollbackDetail = rollbackErrors.length
        ? ` No se pudo revertir: ${rollbackErrors.join(', ')}.`
        : '';
      throw new Error(`${stockError.message}${rollbackDetail}`);
    }
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

  const isIncrementalPointsRpcMissing = (error, functionName) => {
    const errorText = [error?.message, error?.details, error?.hint, error?.code]
      .filter(Boolean)
      .join(' ');
    const requestedName = String(functionName || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(
      `PGRST202|42883|42P01|schema cache|could not find[^.]*${requestedName}|${requestedName}[^.]*does not exist`,
      'i',
    ).test(errorText);
  };

  const saveOrderWithPointsCloud = async ({
    operationKey,
    action,
    orderId = null,
    orderPayload = {},
    expectedVersion = null,
    stockDeltaByProduct = {},
  }) => {
    if (isLocalDemoMode() || !ENABLE_TRANSACTION_RPCS) return null;
    if (!(await canUseTransactionRpcs())) {
      throw createTransactionRpcRequiredError('guardar pedidos y puntos');
    }

    const { data, error } = await supabase.rpc('save_order_with_points_once', {
      p_operation_key: operationKey,
      p_action: action,
      p_order_id: orderId,
      p_order: orderPayload,
      p_expected_version: expectedVersion,
      p_stock_deltas: stockDeltaByProduct || {},
    });
    if (error) {
      if (isIncrementalPointsRpcMissing(error, 'save_order_with_points_once')) return null;
      throw error;
    }
    return Array.isArray(data) ? data[0] : data;
  };

  const registerOrderSaleCloud = async ({
    operationKey,
    orderId,
    salePayload,
    itemsPayload,
    stockDeltaByProduct,
  }) => {
    if (isLocalDemoMode()) return null;
    if (!ENABLE_TRANSACTION_RPCS || !(await canUseTransactionRpcs())) {
      throw createTransactionRpcRequiredError('finalizar la venta de un pedido');
    }

    const { data, error } = await supabase.rpc('register_order_sale_once', {
      p_operation_key: operationKey,
      p_order_id: orderId,
      p_sale: salePayload,
      p_items: itemsPayload,
      p_stock_deltas: stockDeltaByProduct || {},
    });
    if (error) {
      if (isIncrementalPointsRpcMissing(error, 'register_order_sale_once')) {
        throw createTransactionRpcRequiredError('finalizar la venta incremental del pedido', error);
      }
      throw error;
    }
    const saleId = data?.id || data?.sale_id || (Array.isArray(data) ? data[0]?.id : null);
    if (!saleId) throw new Error('La RPC register_order_sale_once no devolvió la venta.');
    return { id: saleId, orderId, pointsSource: 'order' };
  };

  const adjustMemberPointsCloud = async ({
    operationKey,
    clientId,
    delta,
    reason,
    entryType = 'manual_adjustment',
    earnedAt = new Date().toISOString(),
  }) => {
    if (!delta || isLocalDemoMode() || !ENABLE_TRANSACTION_RPCS) return null;
    if (!(await canUseTransactionRpcs())) {
      throw createTransactionRpcRequiredError('ajustar puntos del socio');
    }

    const { data, error } = await supabase.rpc('adjust_member_points_once', {
      p_operation_key: operationKey,
      p_client_id: clientId,
      p_delta: Math.trunc(Number(delta) || 0),
      p_reason: reason || '',
      p_entry_type: entryType,
      p_earned_at: earnedAt,
    });
    if (error) {
      if (isIncrementalPointsRpcMissing(error, 'adjust_member_points_once')) return null;
      throw error;
    }
    return Array.isArray(data) ? data[0] : data;
  };

  const syncMemberPointBalancesCloud = async (...memberIds) => {
    const ids = [...new Set(memberIds.filter((id) => id !== null && id !== undefined).map(String))];
    if (ids.length === 0 || isLocalDemoMode()) return;
    const { data, error } = await supabase.from('clients').select('id,points').in('id', ids);
    if (error) throw error;
    const balances = new Map((data || []).map((client) => [String(client.id), Number(client.points || 0)]));
    setMembers((prev) => prev.map((member) => (
      balances.has(String(member.id))
        ? { ...member, points: balances.get(String(member.id)), currentPoints: balances.get(String(member.id)) }
        : member
    )));
  };

  const registerSaleTransactionCloud = async ({
    salePayload,
    itemsPayload,
    stockDeltaByProduct,
    clientPointUpdates = [],
    operationKey = null,
  }) => {
    if (isLocalDemoMode()) return null;
    if (!ENABLE_TRANSACTION_RPCS) return null;
    if (!(await canUseTransactionRpcs())) {
      console.warn('Venta sin RPC autenticada: se usara el guardado compatible para no bloquear la caja.');
      return null;
    }

    const { data, error } = await retryOnSupabaseClockSkew(() => supabase.rpc(
      'register_sale_transaction',
      {
        p_sale: { ...salePayload, status: salePayload.status || 'completed' },
        p_items: itemsPayload,
        p_stock_deltas: stockDeltaByProduct || {},
        p_client_points: clientPointUpdates,
        // Con clave, repetir este cobro devuelve la MISMA venta en vez de crear
        // otra. Cubre el doble clic, el reintento y el "parecio fallar pero
        // habia entrado" despues de un corte de red.
        p_operation_key: operationKey,
      },
    ));

    if (error) {
      if (isTransactionalSaleRpcUnavailable(error)) {
        throw createTransactionRpcRequiredError('registrar ventas', error);
      }
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
    if (!ENABLE_TRANSACTION_RPCS) return null;
    if (!(await canUseTransactionRpcs())) {
      throw createTransactionRpcRequiredError('editar ventas');
    }

    const { data, error } = await supabase.rpc('edit_sale_transaction', {
      p_sale_id: String(saleId),
      p_sale_patch: salePatch,
      p_items: itemsPayload,
      p_stock_deltas: stockDeltaByProduct || {},
      p_client_points: clientPointUpdates,
    });

    if (error) {
      if (isTransactionalSaleRpcUnavailable(error)) {
        throw createTransactionRpcRequiredError('editar ventas', error);
      }
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
    if (!ENABLE_TRANSACTION_RPCS) return null;
    if (!(await canUseTransactionRpcs())) {
      throw createTransactionRpcRequiredError('anular ventas');
    }

    const { data, error } = await supabase.rpc('void_sale_transaction', {
      p_sale_id: String(saleId),
      p_voided_at: voidedAt,
      p_stock_deltas: stockDeltaByProduct || {},
      p_client_points: clientPointUpdates,
    });

    if (error) {
      if (isTransactionalSaleRpcUnavailable(error)) {
        throw createTransactionRpcRequiredError('anular ventas', error);
      }
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

    try {
      await applyStockEntriesCloudWithRollback(entries);
    } catch (stockErr) {
      throw new Error(`Fallo actualizando stock del pedido: ${stockErr.message}`);
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

    const localProductIds = new Set(
      (Array.isArray(inventory) ? inventory : [])
        .map((product) => product?.id)
        .filter((id) => id !== null && id !== undefined)
        .map(String)
    );

    const missingIds = candidateIds.filter((id) => !localProductIds.has(id));
    let validIds = new Set(localProductIds);

    if (missingIds.length > 0 && !isLocalDemoMode() && !isBrowserOffline()) {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('id')
          .in('id', missingIds);

        if (!error && Array.isArray(data)) {
          data.forEach((product) => validIds.add(String(product.id)));
        }
      } catch (validationErr) {
        console.warn('No se pudo verificar productos faltantes en la nube:', validationErr);
      }
    }

    return safeItems.map((item) => {
      const normalizedId = toOptionalDbId(item?.product_id);
      if (normalizedId === null || normalizedId === undefined) return item;
      return validIds.has(String(normalizedId))
        ? item
        : { ...item, product_id: null };
    });
  };

  const getInventoryProductForSaleItem = (item = {}) => {
    const productId = item.productId || item.product_id || item.id || null;
    if (productId !== null && productId !== undefined) {
      const product = inventory.find((entry) => String(entry.id) === String(productId));
      if (product) return product;
    }
    const title = String(item.title || item.product_title || item.name || '').trim().toLowerCase();
    return title
      ? inventory.find((entry) => String(entry.title || '').trim().toLowerCase() === title) || null
      : null;
  };

  const getSaleItemUnitCostInfo = (item = {}) => {
    const explicitCost = Number(
      item.purchasePriceAtSale ??
        item.purchase_price_at_sale ??
        item.unitCostAtSale ??
        item.unit_cost_at_sale ??
        item.costAtSale ??
        item.cost_at_sale ??
        item.cost ??
        item.unitCost ??
        item.unit_cost ??
        item.purchasePrice ??
        item.purchase_price ??
        item.costPrice ??
        item.cost_price
    );
    if (Number.isFinite(explicitCost) && explicitCost > 0) {
      return {
        unitCost: explicitCost,
        source: item.costSource || item.cost_source || 'sale_snapshot',
      };
    }

    const product = getInventoryProductForSaleItem(item);
    const inventoryCost = Number(
      product?.purchasePrice ??
        product?.purchase_price ??
        product?.cost ??
        product?.unitCost ??
        product?.unit_cost ??
        0
    );

    return {
      unitCost: Number.isFinite(inventoryCost) && inventoryCost > 0 ? inventoryCost : 0,
      source: Number.isFinite(inventoryCost) && inventoryCost > 0 ? 'inventory_at_sale' : null,
    };
  };

  const getSaleItemUnitCost = (item = {}) => getSaleItemUnitCostInfo(item).unitCost;

  const getSaleItemUnitPrice = (item = {}) =>
    Number(
      item.priceAtSale ??
        item.price_at_sale ??
        item.price ??
        item.unitPrice ??
        item.unit_price ??
        item.newPrice ??
        0
    ) || 0;

  const getSaleSnapshotQuantity = (item = {}, fallback = 0) => {
    const quantity = Number(item.qty ?? item.quantity ?? fallback);
    return Number.isFinite(quantity) && quantity > 0 ? quantity : Number(fallback || 0);
  };

  const getSaleItemSnapshotSubtotal = (item = {}) => {
    const explicitSubtotal = Number(item.subtotal ?? item.lineSubtotal ?? item.line_subtotal ?? item.lineTotal ?? item.line_total);
    if (Number.isFinite(explicitSubtotal) && explicitSubtotal !== 0) return explicitSubtotal;
    const unitPrice = getSaleItemUnitPrice(item);
    const quantity = getSaleSnapshotQuantity(item, 0);
    return (item.product_type || 'quantity') === 'weight' && unitPrice >= 100
      ? unitPrice * (quantity / 1000)
      : unitPrice * quantity;
  };

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
    const { unitCost, source } = getSaleItemUnitCostInfo(item);
    const unitPrice = getSaleItemUnitPrice(item);
    const lineSubtotal = getSaleItemSnapshotSubtotal(item);
    return {
      cost: unitCost,
      unitCost,
      purchasePrice: unitCost,
      costAtSale: unitCost,
      unitCostAtSale: unitCost,
      purchasePriceAtSale: unitCost,
      priceAtSale: unitPrice,
      lineSubtotal,
      costSource: item.costSource || item.cost_source || source,
    };
  };

  const getSaleIncludedProductsSnapshot = (item = {}) =>
    (Array.isArray(item.productsIncluded) ? item.productsIncluded : []).map((includedItem) => {
      const productType = includedItem.product_type || 'quantity';
      const quantity = getSaleSnapshotQuantity(includedItem, productType === 'weight' ? 1000 : 1);
      const baseIncludedItem = {
        ...includedItem,
        id: includedItem.id ?? includedItem.productId ?? includedItem.product_id ?? null,
        productId: includedItem.productId ?? includedItem.product_id ?? includedItem.id ?? null,
        title: includedItem.title || includedItem.name || 'Producto',
        quantity,
        qty: quantity,
        price: getSaleItemUnitPrice(includedItem),
        product_type: productType,
      };
      return {
        ...baseIncludedItem,
        ...getSaleItemSnapshotCost(baseIncludedItem),
      };
    });

  const buildSaleItemSnapshot = (item = {}) => {
    const quantity = getSaleSnapshotQuantity(item, 0);
    const baseItem = {
      ...item,
      id: item.id ?? item.productId ?? item.product_id ?? null,
      productId: item.productId ?? item.product_id ?? item.id ?? null,
      title: item.title || item.product_title || item.name || 'Producto',
      quantity,
      qty: quantity,
      price: getSaleItemUnitPrice(item),
      subtotal: getSaleItemSnapshotSubtotal(item),
      isReward: Boolean(item.isReward || item.is_reward),
      isDiscount: Boolean(item.isDiscount || item.is_discount),
      couponCode: item.couponCode || item.coupon_code || undefined,
      type: item.type || (item.isDiscount || item.is_discount ? 'discount' : undefined),
      product_type: item.product_type || 'quantity',
      isCustom: Boolean(item.isCustom || item.is_custom || item.isTemporary),
      isCombo: Boolean(item.isCombo || item.is_combo),
      category: item.category || null,
      categories: Array.isArray(item.categories) ? item.categories : null,
    };
    return {
      ...baseItem,
      ...getSaleItemSnapshotCost(baseItem),
      productsIncluded: getSaleIncludedProductsSnapshot(baseItem),
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

  const applySaleStockDelta = async (deltaByProduct = {}, { trackDepletion = false } = {}) => {
    const entries = Object.entries(deltaByProduct).filter(([, delta]) => Number(delta || 0) !== 0);
    if (entries.length === 0) return { stockChanges: [], stockIssues: [] };

    const preview = getSaleStockDeltaPreview(deltaByProduct);
    if (preview.stockIssues.length > 0) {
      return preview;
    }

    try {
      await applyStockEntriesCloudWithRollback(entries);
    } catch (stockErr) {
      throw new Error(`Fallo actualizando stock de la venta: ${stockErr.message}`);
    }

    setInventory((prev) =>
      prev.map((product) => {
        const delta = deltaByProduct[String(product.id)];
        return delta ? { ...product, stock: Number(product.stock || 0) + Number(delta || 0) } : product;
      })
    );

    void syncStockLifecycleForDeltas(deltaByProduct, { trackDepletion });

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
    const orderOwnsPoints = isIncrementalOrderPoints(orderRecord);
    const pointsToCreditAtFinalization = getFinalizationPointsToCredit(orderRecord, pointsEarned);
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
    const orderItemsSnapshot = items.map((item) => buildSaleItemSnapshot(item));
    const salePayload = {
      total: totalAmount,
      payment_method: paymentInfo.payment,
      payment_breakdown: inheritedPaymentBreakdown,
      installments: paymentInfo.installments || 0,
      cash_received: Number(paymentInfo.cashReceived || 0),
      cash_change: Number(paymentInfo.cashChange || 0),
      client_id: clientId,
      points_earned: clientId && !orderOwnsPoints ? pointsEarned : 0,
      points_spent: 0,
      user_id: toOptionalDbId(actor.userId),
      user_role: actor.userRole,
      user_name: actor.userName,
    };

    const itemsPayload = await sanitizeSaleItemProductIds(orderItemsSnapshot.map((item) => ({
      product_id: getSaleItemDatabaseProductId(item),
      product_title: item.title,
      quantity: item.qty || item.quantity,
      price: item.price,
      subtotal: Number(item.subtotal ?? item.lineSubtotal ?? 0) || 0,
      is_reward: false,
      product_type: item.product_type || 'quantity',
      ...getSaleItemCostPayload(item),
    })));

    const deltaByProduct = skipStockDeduction
      ? {}
      : Object.fromEntries(
        Object.entries(requiredStock).map(([id, qty]) => [id, -Number(qty || 0)])
      );
    let updatedClientForHistory = null;
    let pointsChange = null;
    const clientPointUpdates = [];
    if (clientId && pointsToCreditAtFinalization > 0) {
      const linkedMember = members.find((member) => String(member.id) === String(clientId));
      if (linkedMember) {
        const previousPoints = Number(linkedMember.points || 0);
        const newPoints = previousPoints + pointsToCreditAtFinalization;
        pointsChange = { previous: previousPoints, new: newPoints, diff: newPoints - previousPoints };
        clientPointUpdates.push({
          client_id: String(clientId),
          points: newPoints,
          expected_points: previousPoints,
        });
        updatedClientForHistory = { ...linkedMember, points: newPoints, currentPoints: newPoints };
      }
    }

    let sale = orderOwnsPoints
      ? await registerOrderSaleCloud({
          operationKey: buildOrderOperationKey('sale', orderRecord.id, orderRecord.version || 1, 'final'),
          orderId: orderRecord.id,
          salePayload,
          itemsPayload,
          stockDeltaByProduct: deltaByProduct,
        })
      : await registerSaleTransactionCloud({
          salePayload,
          itemsPayload,
          stockDeltaByProduct: deltaByProduct,
          clientPointUpdates,
        });
    let stockChanges = [];

    if (sale) {
      stockChanges = getSaleStockDeltaPreview(deltaByProduct).stockChanges;
      if (!skipStockDeduction) {
        setInventory((prev) =>
          prev.map((product) => {
            const delta = deltaByProduct[String(product.id)];
            return delta ? { ...product, stock: Number(product.stock || 0) + Number(delta || 0) } : product;
          })
        );
        void syncStockLifecycleForDeltas(deltaByProduct, { trackDepletion: true });
      }
    } else {
      const { data: insertedSale, error: saleErr } = await insertWithSchemaFallback('sales', salePayload, 'id');
      if (saleErr) throw saleErr;
      sale = insertedSale;

      await insertRowsWithSchemaFallback(
        'sale_items',
        itemsPayload.map((item) => ({ ...item, sale_id: sale.id })),
      );

      if (!skipStockDeduction) {
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

      for (const update of clientPointUpdates) {
        if (isLocalDemoMode()) continue;
        const { error: pointsError } = await supabase
          .from('clients')
          .update({ points: update.points })
          .eq('id', update.client_id);
        if (pointsError) throw new Error(`Fallo actualizando puntos: ${pointsError.message}`);
      }
    }

    if (updatedClientForHistory) {
      setMembers((prev) =>
        prev.map((member) =>
          String(member.id) === String(clientId)
            ? { ...member, points: updatedClientForHistory.points, currentPoints: updatedClientForHistory.points }
            : member
        )
      );
    }

    const now = new Date();
    const historyItems = orderItemsSnapshot;

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
      pointsEarned: clientId && !orderOwnsPoints ? pointsEarned : 0,
      pointsSource: orderOwnsPoints ? 'order' : 'sale',
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
        subtotal: Number(item.subtotal ?? item.lineSubtotal ?? 0) || 0,
        isReward: false,
        isDiscount: Boolean(item.isDiscount),
        type: item.isDiscount ? 'discount' : undefined,
        product_type: item.product_type || 'quantity',
        isCustom: Boolean(item.isCustom),
        isCombo: Boolean(item.isCombo),
        originalOfferId: item.originalOfferId || null,
        productsIncluded: Array.isArray(item.productsIncluded) ? item.productsIncluded : [],
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
        pointsEarned: clientId && !orderOwnsPoints ? pointsEarned : 0,
        orderPointsCredited: clientId && orderOwnsPoints ? Number(orderRecord.pointsCredited || 0) : 0,
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

      const { stockIssues: initialStockIssues } = getOrderStockIssues(budgetRecord);
      const isInitiallyFullyPaid = initialPayment >= totalAmount && totalAmount > 0;
      if (isInitiallyFullyPaid && initialStockIssues.length > 0) {
        showNotification('error', 'Stock Insuficiente', `No se puede completar el pedido: ${initialStockIssues.join(', ')}`);
        return null;
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
        items_snapshot: markOrderItemsForDeferredStock(budgetRecord.itemsSnapshot || []),
        total_amount: totalAmount,
        deposit_amount: initialPayment,
        paid_total: initialPayment,
        remaining_amount: remainingAmount,
        pickup_date: pickupDate,
        status,
        is_active: true,
      };

      const rpcOrder = await saveOrderWithPointsCloud({
        operationKey: buildOrderOperationKey('create', budgetRecord.id, 0, 'conversion'),
        action: 'create',
        orderPayload: payload,
      });
      const data = rpcOrder || (
        await insertWithSchemaFallback('orders', payload, CLOUD_SELECTS.orders)
      ).data;

      const newOrder = mapOrderRecords([data])[0];
      if (rpcOrder) await syncMemberPointBalancesCloud(newOrder.memberId);
      setOrders((prev) => [newOrder, ...prev]);
      let finalizedSale = null;
      if (initialPayment >= totalAmount && totalAmount > 0) {
        finalizedSale = await handleFinalizePaidOrder(newOrder, {
          skipStockDeduction: false,
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
          pointsCredited: Number(newOrder.pointsCredited || 0),
          pickupDate: newOrder.pickupDate,
          stockChanges: finalizedSale?.stockChanges || [],
          stockPending: initialPayment > 0 && !isInitiallyFullyPaid,
        },
        budgetRecord.eventLabel || 'Conversión desde presupuesto'
      );
      showNotification(
        initialPayment > 0 && !isInitiallyFullyPaid ? 'warning' : 'success',
        initialPayment > 0 && !isInitiallyFullyPaid ? 'Pedido Señado' : 'Pedido Creado',
        initialPayment > 0 && !isInitiallyFullyPaid
          ? 'La seña se registró. El stock se controlará al completar o entregar el pedido.'
          : 'El presupuesto se convirtió en pedido.',
      );
      return newOrder;
    } catch (error) {
      console.error('Error convirtiendo presupuesto:', error);
      showNotification('error', 'Error', `No se pudo convertir el presupuesto en pedido. ${getCloudErrorMessage(error)}`);
      throw error;
    }
  };

  const handleUpdateOrderDeposit = async (orderRecord, depositPayment) => {
    if (blockIfOfflineReadonly('corregir se\u00f1as de pedidos')) return;
    try {
      if (!orderRecord?.id) throw new Error('No se encontró el pedido a actualizar.');
      if (['Pagado', 'Retirado', 'Cancelado'].includes(String(orderRecord.status || ''))) {
        showNotification('warning', 'Se\u00f1a bloqueada', 'No se puede corregir la se\u00f1a de un pedido cerrado.');
        return null;
      }
      if (transactions.some((tx) => String(tx.orderId || '') === String(orderRecord.id))) {
        showNotification('warning', 'Pedido facturado', 'La se\u00f1a no se puede corregir porque el pedido ya gener\u00f3 una venta.');
        return null;
      }

      const totalAmount = roundOrderPaymentValue(orderRecord.totalAmount || 0);
      const currentDeposit = Math.min(
        roundOrderPaymentValue(orderRecord.depositAmount || 0),
        roundOrderPaymentValue(orderRecord.paidTotal || 0),
      );
      const additionalPaid = Math.max(
        roundOrderPaymentValue(orderRecord.paidTotal || 0) - currentDeposit,
        0,
      );
      const maxDeposit = Math.max(totalAmount - additionalPaid, 0);
      const normalizedDepositPayment = buildOrderPaymentRecord(
        depositPayment,
        depositPayment?.amount || 0,
      );
      const nextDeposit = Math.max(roundOrderPaymentValue(normalizedDepositPayment.amount || 0), 0);

      if (nextDeposit > maxDeposit) {
        showNotification(
          'warning',
          'Se\u00f1a inv\u00e1lida',
          `La se\u00f1a no puede superar ${formatCurrency(maxDeposit)} porque hay otros pagos registrados.`,
        );
        return null;
      }

      const nextDepositEntry = nextDeposit > 0
        ? createOrderPaymentEntry({
            id: `order_deposit_${orderRecord.id}`,
            entryType: 'deposit',
            createdAt: orderRecord.createdAt || new Date().toISOString(),
            amount: nextDeposit,
            lines: normalizedDepositPayment.paymentBreakdown,
          })
        : null;
      const nextPaymentHistory = replaceOrderDepositPaymentHistory(
        orderRecord.paymentHistory || orderRecord.paymentBreakdown,
        {
          currentDepositAmount: currentDeposit,
          nextDepositEntry,
          fallbackPayment: orderRecord.paymentMethod || 'Pedido',
          fallbackInstallments: orderRecord.installments || 0,
          fallbackPaidTotal: orderRecord.paidTotal || 0,
          fallbackCashReceived: orderRecord.cashReceived || 0,
          fallbackCashChange: orderRecord.cashChange || 0,
        },
      );
      const nextPaidTotal = Math.min(roundOrderPaymentValue(additionalPaid + nextDeposit), totalAmount);
      const nextRemaining = Math.max(roundOrderPaymentValue(totalAmount - nextPaidTotal), 0);
      const nextStatus = deriveOrderStatus({
        paidTotal: nextPaidTotal,
        totalAmount,
        currentStatus: orderRecord.status,
      });
      const nextPaymentState = getOrderPaymentHistorySummary(
        nextPaymentHistory,
        normalizedDepositPayment.primaryMethod || orderRecord.paymentMethod || 'Efectivo',
        normalizedDepositPayment.installments || orderRecord.installments || 0,
        nextPaidTotal,
      );
      const wasStockReserved = isOrderStockReserved(orderRecord);
      const shouldCommitStock = nextPaidTotal > 0;
      const isCrossingToFullyPaid =
        Number(orderRecord.paidTotal || 0) < totalAmount &&
        nextPaidTotal >= totalAmount &&
        totalAmount > 0;
      let stockTransition = null;
      let stockChanges = [];

      if (isCrossingToFullyPaid && !wasStockReserved) {
        const { stockIssues } = getOrderStockIssues(orderRecord);
        if (stockIssues.length > 0) {
          showNotification('error', 'Stock Insuficiente', `No se puede completar el pedido: ${stockIssues.join(', ')}`);
          return null;
        }
      }

      if (wasStockReserved && !shouldCommitStock) {
        const restorationResult = await restoreOrderStock(orderRecord);
        if (restorationResult.stockIssues.length > 0) {
          showNotification('error', 'Stock', `No se pudo liberar el stock: ${restorationResult.stockIssues.join(', ')}`);
          return null;
        }
        stockTransition = 'restored';
        stockChanges = restorationResult.stockChanges;
      }

      let data;
      let rpcOrder = null;
      try {
        const orderPatch = {
          payment_method: nextPaymentState.paymentMethod || null,
          payment_breakdown: nextPaymentHistory,
          installments: nextPaymentState.installments || 0,
          deposit_amount: nextDeposit,
          paid_total: nextPaidTotal,
          remaining_amount: nextRemaining,
          status: nextStatus,
          items_snapshot:
            wasStockReserved && stockTransition !== 'restored'
              ? (orderRecord.itemsSnapshot || [])
              : markOrderItemsForDeferredStock(orderRecord.itemsSnapshot || []),
        };
        rpcOrder = await saveOrderWithPointsCloud({
          operationKey: buildOrderOperationKey(
            'deposit',
            orderRecord.id,
            orderRecord.version || 1,
            nextDeposit,
          ),
          action: 'deposit',
          orderId: orderRecord.id,
          orderPayload: orderPatch,
          expectedVersion: orderRecord.version || 1,
        });
        data = rpcOrder || (
          await updateWithSchemaFallback('orders', orderRecord.id, orderPatch, CLOUD_SELECTS.orders)
        ).data;
      } catch (updateError) {
        try {
          if (stockTransition === 'restored') await reserveOrderStock(orderRecord);
        } catch (rollbackError) {
          console.error('No se pudo revertir el stock tras fallar la correcci\u00f3n de se\u00f1a:', rollbackError);
        }
        throw updateError;
      }

      const updatedOrder = mapOrderRecords([data])[0];
      if (rpcOrder) await syncMemberPointBalancesCloud(orderRecord.memberId, updatedOrder.memberId);
      setOrders((prev) =>
        prev.map((order) => (String(order.id) === String(orderRecord.id) ? updatedOrder : order))
      );

      const finalizedSale = isCrossingToFullyPaid
        ? await handleFinalizePaidOrder(updatedOrder, {
            skipStockDeduction: wasStockReserved,
          })
        : null;

      await addLog(
        'Pedido Editado',
        {
          id: orderRecord.id,
          budgetId: updatedOrder.budgetId || null,
          sharedRecordId: updatedOrder.budgetId || orderRecord.id,
          saleId: finalizedSale?.id || null,
          transactionId: finalizedSale?.id || null,
          customerName: updatedOrder.customerName,
          customerPhone: updatedOrder.customerPhone || '',
          eventLabel: updatedOrder.eventLabel || '',
          documentTitle: updatedOrder.documentTitle || 'PEDIDO',
          totalAmount,
          previousDepositAmount: currentDeposit,
          depositAmount: nextDeposit,
          paidTotal: nextPaidTotal,
          remainingAmount: nextRemaining,
          paymentMethod: nextPaymentState.paymentMethod || null,
          paymentHistory: nextPaymentHistory,
          previousPointsCredited: Number(orderRecord.pointsCredited || 0),
          pointsCredited: Number(updatedOrder.pointsCredited || 0),
          pointsDelta:
            Number(updatedOrder.pointsCredited || 0) - Number(orderRecord.pointsCredited || 0),
          pickupDate: updatedOrder.pickupDate || null,
          itemsSnapshot: buildOrderLogItems(updatedOrder.itemsSnapshot || []),
          changes: [
            { field: 'Se\u00f1a', old: currentDeposit, new: nextDeposit, isPrice: true },
            { field: 'Abonado', old: Number(orderRecord.paidTotal || 0), new: nextPaidTotal, isPrice: true },
            { field: 'Restante', old: Number(orderRecord.remainingAmount || 0), new: nextRemaining, isPrice: true },
          ],
          stockChanges: finalizedSale?.stockChanges || stockChanges,
        },
        'Correcci\u00f3n de se\u00f1a inicial',
      );
      showNotification('success', 'Se\u00f1a Actualizada', 'Se recalcularon el abonado y el saldo restante.');
      return updatedOrder;
    } catch (error) {
      console.error('Error corrigiendo se\u00f1a de pedido:', error);
      showNotification('error', 'Error', `No se pudo corregir la se\u00f1a. ${getCloudErrorMessage(error)}`);
      throw error;
    }
  };

  const handleRegisterOrderPayment = async (orderRecord, paymentPayload) => {
    if (blockIfOfflineReadonly('registrar pagos de pedidos')) return;
    try {
      const normalizedPayment = buildOrderPaymentRecord(paymentPayload, paymentPayload?.amount || 0);
      const paymentAmount = Number(normalizedPayment.amount || 0);
      const wasStockReserved = isOrderStockReserved(orderRecord);
      const isCrossingToFullyPaid =
        Number(orderRecord.paidTotal || 0) < Number(orderRecord.totalAmount || 0) &&
        Number(orderRecord.paidTotal || 0) + paymentAmount >= Number(orderRecord.totalAmount || 0);

      if (isCrossingToFullyPaid && !wasStockReserved) {
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
        items_snapshot: wasStockReserved
          ? (orderRecord.itemsSnapshot || [])
          : markOrderItemsForDeferredStock(orderRecord.itemsSnapshot || []),
      };

      const rpcOrder = await saveOrderWithPointsCloud({
        operationKey: buildOrderOperationKey(
          'payment',
          orderRecord.id,
          orderRecord.version || 1,
          paymentEntry.id,
        ),
        action: 'payment',
        orderId: orderRecord.id,
        orderPayload: payload,
        expectedVersion: orderRecord.version || 1,
      });
      const data = rpcOrder || (
        await updateWithSchemaFallback('orders', orderRecord.id, payload, CLOUD_SELECTS.orders)
      ).data;

      const updatedOrder = mapOrderRecords([data])[0];
      if (rpcOrder) await syncMemberPointBalancesCloud(orderRecord.memberId, updatedOrder.memberId);
      setOrders((prev) =>
        prev.map((order) => (order.id === orderRecord.id ? updatedOrder : order))
      );

      let finalizedSale = null;

      if (isCrossingToFullyPaid && Number(updatedOrder.totalAmount || 0) > 0) {
        finalizedSale = await handleFinalizePaidOrder(updatedOrder, {
          skipStockDeduction: wasStockReserved,
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
          previousPointsCredited: Number(orderRecord.pointsCredited || 0),
          pointsCredited: Number(updatedOrder.pointsCredited || 0),
          pointsDelta:
            Number(updatedOrder.pointsCredited || 0) - Number(orderRecord.pointsCredited || 0),
          pickupDate: updatedOrder.pickupDate || null,
          itemsSnapshot: buildOrderLogItems(updatedOrder.itemsSnapshot || []),
          stockChanges: finalizedSale?.stockChanges || [],
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
      const totalAmount = Number(orderRecord.totalAmount || 0);
      const paidTotal = Number(orderRecord.paidTotal || 0);
      if (totalAmount <= 0 || paidTotal < totalAmount) {
        showNotification('warning', 'Pago Pendiente', 'Completá el pago antes de entregar el pedido.');
        return null;
      }

      const hasLinkedSale = transactions.some(
        (tx) => String(tx.orderId || '') === String(orderRecord.id) && tx.status === 'completed',
      );
      if (!hasLinkedSale) {
        if (!hasDeferredOrderStockPolicy(orderRecord)) {
          showNotification(
            'warning',
            'Pedido Anterior',
            'Este pedido no permite confirmar automáticamente si el stock ya fue descontado. Revisalo antes de entregarlo.',
          );
          return null;
        }

        const { stockIssues } = getOrderStockIssues(orderRecord);
        if (stockIssues.length > 0) {
          showNotification('error', 'Stock Insuficiente', `No se puede entregar el pedido: ${stockIssues.join(', ')}`);
          return null;
        }

        await handleFinalizePaidOrder(orderRecord, { skipStockDeduction: false });
      }

      const retirePatch = { status: 'Retirado' };
      const rpcOrder = await saveOrderWithPointsCloud({
        operationKey: buildOrderOperationKey('retire', orderRecord.id, orderRecord.version || 1),
        action: 'retire',
        orderId: orderRecord.id,
        orderPayload: retirePatch,
        expectedVersion: orderRecord.version || 1,
      });
      const data = rpcOrder || (
        await updateWithSchemaFallback('orders', orderRecord.id, retirePatch, CLOUD_SELECTS.orders)
      ).data;
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
      const linkedOrderSale = transactions.find((tx) =>
        String(tx.orderId || '') === String(orderRecord.id) &&
        tx.status === 'completed'
      );
      const linkedSaleStockDelta = linkedOrderSale
        ? buildSaleStockDelta(buildSaleRequiredStock(linkedOrderSale.items || []), 1)
        : {};
      if (linkedOrderSale) {
        const stockPreview = getSaleStockDeltaPreview(linkedSaleStockDelta);
        if (stockPreview.stockIssues.length > 0) {
          showNotification('error', 'Stock', `No se pudo preparar la devolución: ${stockPreview.stockIssues.join(', ')}`);
          return;
        }
        restoredStockChanges = stockPreview.stockChanges;
      } else if (isOrderStockReserved(orderRecord)) {
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

      const cancelPatch = {
        status: 'Cancelado',
        payment_method: retainedPaymentState.paymentMethod || null,
        payment_breakdown: retainedPaymentHistory,
        installments: retainedPaymentState.installments || 0,
        deposit_amount: retainedDeposit,
        paid_total: retainedDeposit,
        remaining_amount: 0,
      };
      let data;
      let rpcOrder = null;
      try {
        rpcOrder = await saveOrderWithPointsCloud({
          operationKey: buildOrderOperationKey(
            keepDeposit ? 'cancel-keep' : 'cancel-refund',
            orderRecord.id,
            orderRecord.version || 1,
          ),
          action: keepDeposit ? 'cancel_keep_deposit' : 'cancel_refund',
          orderId: orderRecord.id,
          orderPayload: cancelPatch,
          expectedVersion: orderRecord.version || 1,
          stockDeltaByProduct: linkedSaleStockDelta,
        });
        if (!rpcOrder && linkedOrderSale) {
          throw createTransactionRpcRequiredError('cancelar un pedido ya facturado');
        }
        data = rpcOrder || (
          await updateWithSchemaFallback('orders', orderRecord.id, cancelPatch, CLOUD_SELECTS.orders)
        ).data;
      } catch (updateError) {
        if (!linkedOrderSale && restoredStockChanges.length > 0) {
          try {
            await reserveOrderStock(orderRecord);
          } catch (rollbackError) {
            console.error('No se pudo volver a reservar el stock tras fallar la cancelación:', rollbackError);
          }
        }
        throw updateError;
      }

      const cancelledOrder = mapOrderRecords([data])[0];
      if (rpcOrder) await syncMemberPointBalancesCloud(orderRecord.memberId, cancelledOrder.memberId);
      if (rpcOrder && linkedOrderSale) {
        setInventory((prev) => prev.map((product) => {
          const delta = linkedSaleStockDelta[String(product.id)];
          return delta ? { ...product, stock: Number(product.stock || 0) + Number(delta || 0) } : product;
        }));
        setTransactions((prev) => prev.map((tx) => (
          String(tx.id) === String(linkedOrderSale.id) ? { ...tx, status: 'voided' } : tx
        )));
        void syncStockLifecycleForDeltas(linkedSaleStockDelta);
      }
      setOrders((prev) =>
        prev.map((order) => (order.id === orderRecord.id ? cancelledOrder : order))
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
          previousPointsCredited: Number(orderRecord.pointsCredited || 0),
          pointsCredited: Number(cancelledOrder.pointsCredited || 0),
          pointsDelta:
            Number(cancelledOrder.pointsCredited || 0) - Number(orderRecord.pointsCredited || 0),
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
      const linkedOrderSale = transactions.find((tx) =>
        String(tx.orderId || '') === String(orderRecord.id) &&
        tx.status === 'completed'
      );
      const linkedSaleStockDelta = linkedOrderSale
        ? buildSaleStockDelta(buildSaleRequiredStock(linkedOrderSale.items || []), 1)
        : {};
      if (linkedOrderSale) {
        const stockPreview = getSaleStockDeltaPreview(linkedSaleStockDelta);
        if (stockPreview.stockIssues.length > 0) {
          showNotification('error', 'Stock', `No se pudo preparar la devolución: ${stockPreview.stockIssues.join(', ')}`);
          return;
        }
        restoredStockChanges = stockPreview.stockChanges;
      } else if (isOrderStockReserved(orderRecord)) {
        const { stockIssues, stockChanges } = await restoreOrderStock(orderRecord);
        if (stockIssues.length > 0) {
          showNotification('error', 'Stock', `No se pudo restaurar el stock del pedido: ${stockIssues.join(', ')}`);
          return;
        }
        restoredStockChanges = stockChanges;
      }

      const deletePatch = { is_active: false };
      let data;
      let rpcOrder = null;
      try {
        rpcOrder = await saveOrderWithPointsCloud({
          operationKey: buildOrderOperationKey('delete', orderRecord.id, orderRecord.version || 1),
          action: 'delete',
          orderId: orderRecord.id,
          orderPayload: deletePatch,
          expectedVersion: orderRecord.version || 1,
          stockDeltaByProduct: linkedSaleStockDelta,
        });
        if (!rpcOrder && linkedOrderSale) {
          throw createTransactionRpcRequiredError('eliminar un pedido ya facturado');
        }
        data = rpcOrder || (
          await updateWithSchemaFallback('orders', orderRecord.id, deletePatch, CLOUD_SELECTS.orders)
        ).data;
      } catch (updateError) {
        if (!linkedOrderSale && restoredStockChanges.length > 0) {
          try {
            await reserveOrderStock(orderRecord);
          } catch (rollbackError) {
            console.error('No se pudo volver a reservar el stock tras fallar la baja:', rollbackError);
          }
        }
        throw updateError;
      }

      const deletedOrder = mapOrderRecords([data])[0];
      if (rpcOrder) await syncMemberPointBalancesCloud(orderRecord.memberId, deletedOrder.memberId);
      if (rpcOrder && linkedOrderSale) {
        setInventory((prev) => prev.map((product) => {
          const delta = linkedSaleStockDelta[String(product.id)];
          return delta ? { ...product, stock: Number(product.stock || 0) + Number(delta || 0) } : product;
        }));
        setTransactions((prev) => prev.map((tx) => (
          String(tx.id) === String(linkedOrderSale.id) ? { ...tx, status: 'voided' } : tx
        )));
        void syncStockLifecycleForDeltas(linkedSaleStockDelta);
      }
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
          previousPointsCredited: Number(orderRecord.pointsCredited || 0),
          pointsCredited: Number(deletedOrder?.pointsCredited || 0),
          pointsDelta: Number(deletedOrder?.pointsCredited || 0) - Number(orderRecord.pointsCredited || 0),
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
    const { config, items } = buildBudgetPdfPayload(record);
    handleExportProducts(config, items, { standalone: true });
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
      offerPrice: normalizeFinalSalePrice(offerLike.offerPrice),
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
        offer_price: normalizeFinalSalePrice(offerData.offerPrice),
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
        offer_price: normalizeFinalSalePrice(normalizedUpdatedData.offerPrice),
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

      const { data: disabledOffer, error } = await supabase
        .from('offers')
        .update({ is_active: false })
        .eq('id', id)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!disabledOffer) throw new Error('La oferta ya no existe o cambió en otra caja.');

      const affectedProducts = inventory.filter(p => p.activeOffers && p.activeOffers.includes(id));
      let failedCleanupCount = 0;
      if (affectedProducts.length > 0) {
        const cleanupResults = await Promise.allSettled(affectedProducts.map(async (product) => {
          const nextActiveOffers = product.activeOffers.filter((offerId) => offerId !== id);
          const { data, error: cleanupError } = await supabase
            .from('products')
            .update({ active_offers: nextActiveOffers })
            .eq('id', product.id)
            .select('id')
            .maybeSingle();
          if (cleanupError) throw cleanupError;
          if (!data) throw new Error(`No se actualizó el producto ${product.id}.`);
          return { productId: product.id, nextActiveOffers };
        }));
        const cleanedProducts = new Map(
          cleanupResults
            .filter((result) => result.status === 'fulfilled')
            .map((result) => [String(result.value.productId), result.value.nextActiveOffers]),
        );
        failedCleanupCount = cleanupResults.length - cleanedProducts.size;

        setInventory((prev) => prev.map((product) => {
          const nextActiveOffers = cleanedProducts.get(String(product.id));
          return nextActiveOffers ? { ...product, activeOffers: nextActiveOffers } : product;
        }));
      }

      setOffers((prev) => prev.filter((offer) => offer.id !== id));

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
        affectedProductsCount: affectedProducts.length,
        failedProductCleanupCount: failedCleanupCount,
      }, 'Eliminación permanente');

      if (failedCleanupCount > 0) {
        showNotification(
          'warning',
          'Oferta desactivada',
          `${failedCleanupCount} producto(s) conservaron una referencia anterior. La oferta ya no se aplicará.`,
        );
      } else {
        showNotification('success', 'Oferta Eliminada', 'Se retiró del sistema y de los productos aplicados.');
      }
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
      const safeExpenseDate = normalizeExpenseDateValue(expenseData.expenseDate, new Date());
      const actor = getActorContext();

      if (!safeExpenseDate || isFutureExpenseDate(safeExpenseDate)) {
        showNotification('warning', 'Fecha no valida', 'Elegí una fecha de hoy o anterior.');
        return null;
      }

      const payload = {
        description: safeDescription,
        amount: safeAmount,
        category: expenseData.category || 'Varios',
        payment_method: expenseData.paymentMethod || 'Efectivo',
        expense_date: safeExpenseDate,
        user_id: toOptionalDbId(actor.userId),
        user_role: actor.userRole,
        user_name: actor.userName,
      };

      const { data } = await insertWithSchemaFallback('expenses', payload, CLOUD_SELECTS.expenses);
      if (!data?.id) throw new Error('Supabase no devolvió el gasto creado.');

      const [newExpense] = mapExpenseRecords([{
        ...data,
        description: data.description || safeDescription,
        amount: data.amount ?? safeAmount,
        category: data.category || payload.category,
        payment_method: data.payment_method || payload.payment_method,
        expense_date: data.expense_date || payload.expense_date,
        created_at: data.created_at || new Date().toISOString(),
        user_name: data.user_name || actor.userName,
        user_id: data.user_id || actor.userId || null,
        user_role: data.user_role || actor.userRole || 'seller',
      }]);
      markCloudSourceMutation('expenses');
      setExpenses((prev) => {
        const next = [newExpense, ...(prev || [])];
        dataStateRef.current = { ...dataStateRef.current, expenses: next };
        return next;
      });
      
      await addLog(
        'Nuevo Gasto', 
        {
          description: newExpense.description,
          amount: newExpense.amount,
          category: newExpense.category,
          paymentMethod: newExpense.paymentMethod,
          expenseDate: newExpense.expenseDate,
        },
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
      const safeExpenseDate = normalizeExpenseDateValue(
        expenseData.expenseDate,
        currentExpense.expenseDate || currentExpense.expense_date || currentExpense.createdAt || new Date(),
      );

      if (!expenseId || safeAmount <= 0) return null;
      if (!safeExpenseDate || isFutureExpenseDate(safeExpenseDate)) {
        showNotification('warning', 'Fecha no valida', 'Elegí una fecha de hoy o anterior.');
        return null;
      }

      const payload = {
        description: safeDescription,
        amount: safeAmount,
        category: expenseData.category || currentExpense.category || 'Varios',
        payment_method: expenseData.paymentMethod || currentExpense.paymentMethod || 'Efectivo',
        expense_date: safeExpenseDate,
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
        expense_date: data.expense_date || payload.expense_date,
        created_at: data.created_at || currentExpense.created_at || currentExpense.createdAt || new Date().toISOString(),
        user_name: data.user_name || currentExpense.user,
        user_id: data.user_id || currentExpense.userId || null,
        user_role: data.user_role || currentExpense.userRole || null,
      }]);

      markCloudSourceMutation('expenses');
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
            expenseDate: currentExpense.expenseDate || currentExpense.expense_date,
          },
          next: {
            description: updatedExpense.description,
            amount: updatedExpense.amount,
            category: updatedExpense.category,
            paymentMethod: updatedExpense.paymentMethod,
            expenseDate: updatedExpense.expenseDate,
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

  const handleAddMemberWithLog = async (data, options = {}) => {
    if (blockIfOfflineReadonly('crear socios')) return;
    let creationRequestKey = '';

    try {
       const normalizedData = {
         ...data,
         name: normalizeMemberDisplayName(data?.name),
         dni: sanitizeMemberDniValue(data?.dni),
         phone: sanitizeMemberPhoneValue(data?.phone),
         email: sanitizeMemberEmailValue(data?.email),
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

       creationRequestKey = buildMemberCreationRequestKey(normalizedData);
       if (memberCreationRequestsRef.current.has(creationRequestKey)) return null;
       memberCreationRequestsRef.current.add(creationRequestKey);

       const getHighestKnownMemberNumber = (memberList = []) =>
         (Array.isArray(memberList) ? memberList : []).reduce((maxNumber, member) => {
           const memberNumber = Number(member?.memberNumber ?? member?.member_number ?? 0);
           return Number.isFinite(memberNumber) ? Math.max(maxNumber, memberNumber) : maxNumber;
         }, 0);

       const mergeMemberIntoState = (memberRecord) => {
         if (!memberRecord?.id) return;

         setMembers((prev) => {
           const nextMembers = Array.isArray(prev) ? prev : [];
           const existingIndex = nextMembers.findIndex((member) => String(member.id) === String(memberRecord.id));
           if (existingIndex === -1) return [...nextMembers, memberRecord];

           return nextMembers.map((member, index) => (
             index === existingIndex
               ? {
                   ...member,
                   ...memberRecord,
                   memberNumber: memberRecord.memberNumber || member.memberNumber || member.member_number,
                   created_at: memberRecord.created_at || member.created_at || member.createdAt || null,
                   createdAt: memberRecord.createdAt || member.createdAt || member.created_at || null,
                 }
               : member
           ));
         });
       };

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

       const findExistingCloudMember = async () => {
         if (isLocalDemoMode()) return null;

         try {
           let result = await supabase
             .from('clients')
             .select(CLOUD_SELECTS.clients)
             .ilike('name', normalizedData.name)
             .eq('is_active', true)
             .limit(20);

           const missingColumn = getSchemaMissingColumnName(extractSchemaMissingColumn(result.error));
           if (missingColumn === 'is_active') {
             result = await supabase
               .from('clients')
               .select(CLOUD_SELECTS.clients)
               .ilike('name', normalizedData.name)
               .limit(20);
           }

           if (result.error) throw result.error;

           return mapMemberRecords(result.data || []).find((member) =>
             hasMatchingMemberIdentity(member, normalizedData)
           ) || null;
         } catch (error) {
           console.warn('No se pudo validar duplicado de socio en nube antes del alta.', error);
           return null;
         }
       };

       const existingLocalMember = (Array.isArray(members) ? members : []).find((member) =>
         hasMatchingMemberIdentity(member, normalizedData)
       );
       if (existingLocalMember?.id) {
         if (options.reuseExisting) {
           showNotification('info', 'Socio ya existente', `Se selecciono #${existingLocalMember.memberNumber || existingLocalMember.member_number || existingLocalMember.id}.`);
           return existingLocalMember;
         }

         showNotification('error', 'Socio duplicado', 'Socio duplicado, elegir otro nombre o introducir DNI.');
         return null;
       }

       const duplicatedName = members.some((member) =>
         normalizeMemberName(member?.name) === normalizeMemberName(normalizedData.name)
       );

       if (duplicatedName && !normalizedData.dni) {
         showNotification('error', 'Socio duplicado', 'Socio duplicado, elegir otro nombre o introducir DNI.');
         return null;
       }

       const existingCloudMember = await findExistingCloudMember();
       if (existingCloudMember?.id) {
         mergeMemberIntoState(existingCloudMember);
         if (options.reuseExisting) {
           showNotification('info', 'Socio ya existente', `Se selecciono #${existingCloudMember.memberNumber || existingCloudMember.member_number || existingCloudMember.id}.`);
           return existingCloudMember;
         }

         showNotification('error', 'Socio duplicado', 'Ese socio ya existe. Buscalo en la lista antes de crear uno nuevo.');
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
           points: 0,
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

       const initialPoints = Math.max(0, Math.trunc(Number(normalizedData.points) || 0));
       if (initialPoints > 0) {
         const pointResult = await adjustMemberPointsCloud({
           operationKey: `member:initial:${String(newClient.id).slice(0, 120)}`,
           clientId: newClient.id,
           delta: initialPoints,
           reason: 'Saldo inicial al crear el socio',
           entryType: 'initial_balance',
           earnedAt: new Date().toISOString(),
         });
         if (pointResult) {
           newClient = { ...newClient, points: Number(pointResult.points || 0) };
         } else {
           const { data: clientWithInitialPoints } = await updateWithSchemaFallback(
             'clients',
             newClient.id,
             { points: initialPoints },
             CLOUD_SELECTS.clients,
           );
           newClient = clientWithInitialPoints;
         }
       }
       
       const clientFormatted = formatClientRecordAsMember(newClient, {
         extraInfo: normalizedData.extraInfo,
         socialConnections,
       });
       mergeMemberIntoState(clientFormatted);
       
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
       } else if (
         constraint.includes('clients_active_name_phone_unique') ||
         constraint.includes('clients_active_name_dni_unique') ||
         constraint.includes('clients_active_name_email_unique')
       ) {
         showNotification('error', 'Socio duplicado', 'Ese socio ya existe con los mismos datos de contacto.');
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
       return null;
    } finally {
       if (creationRequestKey) {
         memberCreationRequestsRef.current.delete(creationRequestKey);
       }
    }
  };

  const handleUpdateMemberWithLog = async (id, updates) => {
    if (blockIfOfflineReadonly('editar socios')) return;
    try {
      const normalizedInput = {
        ...updates,
        name: updates.name !== undefined ? String(updates.name || '').trim() : updates.name,
        dni: updates.dni !== undefined ? sanitizeMemberDniValue(updates.dni) : updates.dni,
        phone: updates.phone !== undefined ? sanitizeMemberPhoneValue(updates.phone) : updates.phone,
        email: updates.email !== undefined ? sanitizeMemberEmailValue(updates.email) : updates.email,
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
      
      if (Object.keys(dbUpdates).length > 0) {
        await updateWithSchemaFallback('clients', id, dbUpdates, CLOUD_SELECTS.clients);
      }

      const requestedPointsDelta = normalizedInput.points !== undefined
        ? Number(normalizedInput.points) - Number(oldMember.points || 0)
        : 0;
      if (requestedPointsDelta !== 0) {
        const pointResult = await adjustMemberPointsCloud({
          operationKey: `member:adjust:${String(id).slice(0, 80)}:${Number(oldMember.points || 0)}-${Number(normalizedInput.points || 0)}`,
          clientId: id,
          delta: requestedPointsDelta,
          reason: `Ajuste manual: ${Number(oldMember.points || 0)} a ${Number(normalizedInput.points || 0)}`,
          entryType: 'manual_adjustment',
          earnedAt: new Date().toISOString(),
        });
        if (pointResult) {
          normalizedInput.points = Number(pointResult.points || 0);
        } else {
          await updateWithSchemaFallback(
            'clients',
            id,
            { points: Number(normalizedInput.points || 0) },
            CLOUD_SELECTS.clients,
          );
        }
      }
      
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

    let pointEntries = [];
    if (!isLocalDemoMode() && ENABLE_TRANSACTION_RPCS) {
      const ledgerResult = await supabase
        .from('member_point_entries')
        .select(CLOUD_SELECTS.memberPointEntries)
        .order('earned_at', { ascending: true });
      if (!ledgerResult.error) {
        pointEntries = ledgerResult.data || [];
      } else if (!isIncrementalPointsRpcMissing(ledgerResult.error, 'member_point_entries')) {
        console.warn('No se pudo cargar el libro mayor de puntos:', ledgerResult.error);
      }
    }

    const report = buildPointExpirationReport(members, transactions, {
      upcomingDays: 30,
      pointEntries,
    });
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

        const pointResult = await adjustMemberPointsCloud({
          operationKey: `member:expiration:${String(currentMember.id).slice(0, 80)}:${report.generatedAt.slice(0, 10)}:${expiredPoints}`,
          clientId: currentMember.id,
          delta: -expiredPoints,
          reason: `Vencimiento automático de ${expiredPoints} puntos`,
          entryType: 'expiration',
          earnedAt: new Date().toISOString(),
        });
        if (pointResult) {
          updates.push({
            id: currentMember.id,
            name: currentMember.name || expiredMember.name,
            memberNumber: currentMember.memberNumber || currentMember.member_number || expiredMember.memberNumber,
            previousPoints,
            expiredPoints,
            newPoints: Number(pointResult.points || nextPoints),
          });
          continue;
        }

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
    (t) => t && !['voided', 'deleted'].includes(t.status) && !t.isTest
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
  const buildReportUnitCostByProduct = (tx = {}) =>
    (Array.isArray(tx.items) ? tx.items : []).reduce((acc, item) => {
      if (item?.isReward || item?.isDiscount || item?.isCustom) return acc;

      if (item?.isCombo && Array.isArray(item.productsIncluded) && item.productsIncluded.length > 0) {
        item.productsIncluded.forEach((includedItem) => {
          const includedId = getOrderStockProductId(includedItem);
          if (shouldSkipOrderStockProductId(includedId)) return;
          const includedCost = getSaleItemUnitCost(includedItem);
          if (includedCost > 0) acc[String(includedId)] = includedCost;
        });
        return acc;
      }

      const productId = item.productId || item.id || item.product_id || null;
      if (shouldSkipOrderStockProductId(productId)) return acc;
      const unitCost = getSaleItemUnitCost(item);
      if (unitCost > 0) acc[String(productId)] = unitCost;
      return acc;
    }, {});
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
    const unitCostByProduct = buildReportUnitCostByProduct(tx);
    return (Array.isArray(tx.stockChanges) ? tx.stockChanges : [])
      .map((change) => {
        const productId = getReportStockChangeId(change);
        const qty = getReportStockChangeQty(change);
        if (!productId || qty <= 0) return null;
        const inventoryItem = inventory.find((product) => String(product.id) === String(productId));
        const cost = Number(
          unitCostByProduct[String(productId)] ??
            change.purchasePriceAtSale ??
            change.purchase_price_at_sale ??
            change.unitCostAtSale ??
            change.unit_cost_at_sale ??
            change.costAtSale ??
            change.cost_at_sale ??
            change.purchasePrice ??
            change.purchase_price ??
            change.cost ??
            inventoryItem?.purchasePrice ??
            inventoryItem?.purchase_price ??
            0
        ) || 0;
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
          : Number(
              item.purchasePriceAtSale ??
                item.purchase_price_at_sale ??
                item.unitCostAtSale ??
                item.unit_cost_at_sale ??
                item.costAtSale ??
                item.cost_at_sale ??
                item.purchasePrice ??
                item.purchase_price ??
                item.cost ??
                inventoryItem?.purchasePrice ??
                inventoryItem?.purchase_price ??
                0
            ) || 0;
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
    if (isOfflineReadOnly) {
      setOfflineDetectedAt((current) => current || new Date().toISOString());
      return;
    }
    setOfflineDetectedAt(null);
  }, [isOfflineReadOnly]);

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

  const handleRetryLoginUsers = async () => {
    if (isRetryingLoginUsers) return;

    setIsRetryingLoginUsers(true);
    setAppUsersLoadError('');
    try {
      await loadAppUsers({ force: true, includeInactive: false });
    } catch (error) {
      console.error('No se pudo reintentar la carga de usuarios:', error);
      setAppUsersLoadError(getAppUserDirectoryLoadErrorMessage({
        error,
        offline: isBrowserOffline(),
      }));
    } finally {
      setIsRetryingLoginUsers(false);
    }
  };

  const handleSelectLoginUser = (userId) => {
    setSelectedUserIdForLogin(userId);
    setLoginStep('password');
    setPasswordInput('');
    setRememberLoginSession(false);
    setLoginError('');
  };

  const finalizeLogin = async (verifiedUser, { offline = false, rememberSession = false, password = '', onStage = () => {} } = {}) => {
    let supabaseAuthMeta = { signedIn: false, reason: offline ? 'offline' : 'not-attempted' };

    if (!offline && authMode === 'supabase' && ENABLE_LOGIN_AUTH_SESSION) {
      onStage('sesion');
      supabaseAuthMeta = await signInSupabaseAuthForAppUser({
        user: verifiedUser,
        password,
      });

      if (supabaseAuthMeta.error) {
        console.warn('No se pudo abrir sesion en Supabase Auth:', supabaseAuthMeta.error?.message || supabaseAuthMeta.error);
      }
    }

    if (!offline && ENABLE_LOGIN_AUTH_SESSION && !supabaseAuthMeta.signedIn) {
      // No es un error: cobrar ya no depende de esto. Solo se pierde el token
      // que usa la bandeja de WhatsApp para hablar con el bot.
      console.warn(
        '[REBU][auth] se entro sin sesion de Supabase Auth:',
        getSupabaseAuthLoginRequiredMessage(supabaseAuthMeta),
      );
    }

    if (!offline && !isLocalDemoMode()) {
      try {
        onStage('datos');
        await loadCoreCloudData({ showSpinner: false, force: true, requireCloud: true });
        setIsOfflineReadOnly(false);
      } catch (error) {
        if (!isRecoverableCloudError(error)) throw error;
        setIsOfflineReadOnly(true);
        console.warn('No se pudieron actualizar los datos base después de autenticar; se conservan los snapshots offline.', error);
      }
    }

    const nextSession = {
      ...(await buildSessionMeta(verifiedUser)),
      rememberedSession: Boolean(rememberSession),
      supabaseAuth: {
        signedIn: Boolean(supabaseAuthMeta.signedIn),
        reason: supabaseAuthMeta.reason || null,
        authUserId: supabaseAuthMeta.authUser?.id || null,
        authEmail: verifiedUser.authEmail || verifiedUser.auth_email || null,
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
    if (loginSubmitStage) return;
    const loginUser = selectedLoginUser;
    if (!loginUser) {
      setLoginError('Selecciona un usuario válido.');
      return;
    }

    setLoginError('');
    setLoginSubmitStage('verificando');

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
        if (!isLocalDemoMode() && isUnsafeLegacyPassword(loginUser.role, legacyPassword)) {
          setLoginError('Clave legacy insegura bloqueada. Configura usuarios compartidos o cambia la clave por defecto.');
          return;
        }
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
        onStage: setLoginSubmitStage,
      });
    } catch (error) {
      console.error('No se pudo iniciar sesión:', error);
      setLoginError(
        getSupabaseDiagnosticMessage(error)
        || error?.message
        || 'No se pudo iniciar sesión.',
      );
    } finally {
      setLoginSubmitStage(null);
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

    let uploadedAvatarUrl = null;
    let avatarCommitted = false;

    try {
      const previousAvatar = String(currentUser.avatar || '').trim();
      const hasExplicitAvatarUpdate = Object.prototype.hasOwnProperty.call(updates, 'avatar');
      let resolvedUpdates = updates;
      if (authMode === 'supabase' && currentUser.id && hasExplicitAvatarUpdate) {
        const preparedAvatar = await prepareUserAvatarForCloud(updates.avatar, currentUser.id);
        uploadedAvatarUrl = preparedAvatar.uploadedAvatarUrl;
        resolvedUpdates = { ...updates, avatar: preparedAvatar.avatar };
      }

      let nextUser = {
        ...currentUser,
        displayName: resolvedUpdates.displayName || resolvedUpdates.name || currentUser.displayName || currentUser.name,
        name: resolvedUpdates.displayName || resolvedUpdates.name || currentUser.displayName || currentUser.name,
        avatar: resolvedUpdates.avatar || currentUser.avatar,
        nameColor: resolvedUpdates.nameColor || currentUser.nameColor || '#0f172a',
        theme: resolvedUpdates.theme || currentUser.theme || 'light',
        metricsViewMode: normalizeMetricsViewMode(resolvedUpdates.metricsViewMode || currentUser.metricsViewMode || loadMetricsViewModePreference()),
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

        avatarCommitted = Boolean(uploadedAvatarUrl);
        if (previousAvatar && previousAvatar !== nextUser.avatar && isUserAvatarStorageUrl(previousAvatar)) {
          await deleteUserAvatar(previousAvatar).catch((cleanupError) => {
            console.warn('No se pudo limpiar el avatar anterior del usuario:', cleanupError);
          });
        }

        if (resolvedUpdates.password?.trim()) {
          await updateAppUserPassword({
            actorId: currentUser.id,
            targetId: currentUser.id,
            password: resolvedUpdates.password.trim(),
          });
        }

        nextUser = {
          ...nextUser,
          ...(updatedProfile || {}),
          metricsViewMode: normalizeMetricsViewMode(resolvedUpdates.metricsViewMode || updatedProfile?.metricsViewMode || nextUser.metricsViewMode),
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
            metricsViewMode: normalizeMetricsViewMode(resolvedUpdates.metricsViewMode || nextUser.metricsViewMode),
          };
        }
      } else {
        const settingsKey = role === 'system' ? 'admin' : 'seller';
        const nextUserSettings = {
          ...userSettings,
          [settingsKey]: {
            ...(userSettings[settingsKey] || {}),
            ...resolvedUpdates,
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
      if (uploadedAvatarUrl && !avatarCommitted) {
        await deleteUserAvatar(uploadedAvatarUrl).catch(() => {});
      }
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

    let createdUser = null;
    let uploadedAvatarUrl = null;
    let avatarCommitted = false;
    let resolvedAvatar = payload.avatar;

    try {
      const preparedAvatar = await prepareUserAvatarForCloud(payload.avatar, `new-${currentUser.id}`);
      resolvedAvatar = preparedAvatar.avatar;
      uploadedAvatarUrl = preparedAvatar.uploadedAvatarUrl;

      createdUser = await createAppUser({
        actorId: currentUser.id,
        displayName: payload.displayName,
        role: payload.role,
        password: payload.password,
        avatar: resolvedAvatar,
        nameColor: payload.nameColor,
        theme: payload.theme,
        metricsViewMode: 'modern',
      });
      avatarCommitted = Boolean(uploadedAvatarUrl);
    } catch (error) {
      if (uploadedAvatarUrl && !avatarCommitted) {
        await deleteUserAvatar(uploadedAvatarUrl).catch(() => {});
      }
      throw error;
    }

    await loadAppUsers({ force: true, includeInactive: true });
    setAuthMode('supabase');

    await writeLogEntry({
      action: 'Usuario Creado',
      details: {
        targetUserId: createdUser?.id || null,
        displayName: createdUser?.displayName || payload.displayName,
        role: createdUser?.role || payload.role,
        avatar: createdUser?.avatar || resolvedAvatar,
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

    const previousAvatar = String(targetUser.avatar || '').trim();
    let uploadedAvatarUrl = null;
    let avatarCommitted = false;
    let resolvedAvatar = payload.avatar;
    let updatedProfile = null;

    try {
      const preparedAvatar = await prepareUserAvatarForCloud(payload.avatar, targetUser.id);
      resolvedAvatar = preparedAvatar.avatar;
      uploadedAvatarUrl = preparedAvatar.uploadedAvatarUrl;

      updatedProfile = await updateAppUserProfile({
        actorId: currentUser.id,
        targetId: targetUser.id,
        displayName: payload.displayName,
        role: payload.role,
        avatar: resolvedAvatar,
        nameColor: payload.nameColor,
        theme: payload.theme,
        metricsViewMode: targetUser.metricsViewMode || 'modern',
      });
      avatarCommitted = Boolean(uploadedAvatarUrl);

      if (previousAvatar && previousAvatar !== resolvedAvatar && isUserAvatarStorageUrl(previousAvatar)) {
        await deleteUserAvatar(previousAvatar).catch((cleanupError) => {
          console.warn('No se pudo limpiar el avatar anterior del usuario administrado:', cleanupError);
        });
      }
    } catch (error) {
      if (uploadedAvatarUrl && !avatarCommitted) {
        await deleteUserAvatar(uploadedAvatarUrl).catch(() => {});
      }
      throw error;
    }

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
        avatar: updatedProfile?.avatar || resolvedAvatar,
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
    setTicketTestPrintData(null);
    if (window.electronAPI && window.electronAPI.printSilent) {
      window.electronAPI.printSilent();
      showNotification('success', 'Imprimiendo...', 'El ticket se envio a la impresora.');
    } else {
      window.print();
    }
  };

  const handlePrintTicketTest = (transaction, profile) => {
    setExportPdfData(null);
    setTicketTestPrintData({ transaction, profile });
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        window.print();
      }, 60);
    });
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
      
      await fetchCloudData(false, { force: true, moduleKeys: ['dashboard'], full: true });
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
      await loadDashboardCloudData({ force: true, full: true });
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
          if (!tx || ['voided', 'deleted'].includes(tx.status) || tx.isTest) return false;
          const txDate = parseTxDate(tx);
          return txDate && txDate >= cycleStart && txDate <= closeDate;
        })
      : sourceTransactions.filter(tx => tx && !['voided', 'deleted'].includes(tx.status) && !tx.isTest);

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
            markCloudSourceMutation('closures');
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
            const { error } = await supabase.from('register_state').update({
              is_open: true,
              opening_balance: value,
              closing_time: tempClosingTime,
              opened_at: now,
              last_updated_by: currentUser?.name
            }).eq('id', 1);
            if (error) throw error;
          }

          setOpeningBalance(value);
          setClosingTime(tempClosingTime);
          setIsRegisterClosed(false);
          setIsOpeningBalanceModalOpen(false);
          setRegisterOpenedAt(now);
          addLog('Apertura de Caja', { amount: value, scheduledClosingTime: tempClosingTime }, 'Inicio de operaciones');
      } catch(e) {
          console.error("Error abriendo caja en nube:", e);
          showNotification('error', 'Error de Sincronizacion', 'No se pudo abrir la caja en la nube. Reintenta antes de vender.');
      }
    } else {
      showNotification('warning', 'Datos incompletos', 'Ingresa un monto inicial valido y un horario de cierre.');
    }
  };

  const handleSaveClosingTime = async () => {
    if (blockIfOfflineReadonly('editar el horario de cierre')) return;
    if (!canManageRegister) {
      showNotification('error', 'Acceso Denegado', 'No tenes permiso para editar el horario de cierre.');
      setIsClosingTimeModalOpen(false);
      return;
    }

    try {
        if (isLocalDemoMode()) {
          localDemoUpdateRow('register_state', 1, { closing_time: closingTime });
        } else {
          const { error } = await supabase.from('register_state').update({ closing_time: closingTime }).eq('id', 1);
          if (error) throw error;
        }
        addLog('Horario Modificado', `Nueva hora de cierre: ${closingTime}`, 'Ajuste de horario');
        setIsClosingTimeModalOpen(false);
        showNotification('success', 'Horario Guardado', 'La hora de cierre se ha actualizado.');
    } catch(e) {
        console.error(e);
        showNotification('error', 'Error de Sincronizacion', 'No se pudo actualizar el horario de cierre.');
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
          const { error } = await supabase.from('categories').delete().eq('name', name);
          if (error) throw error;
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
      const productChanges = inventory.flatMap((product) => {
        const previousCategories = Array.isArray(product.categories)
          ? product.categories
          : String(product.category || '').split(',').map((category) => category.trim()).filter(Boolean);
        if (!previousCategories.includes(oldName)) return [];
        const nextCategories = previousCategories.map((category) => category === oldName ? newName : category);
        return [{ product, previousCategories, nextCategories }];
      });

      const rollbackProductChanges = async (changes) => {
        const rollbackResults = await Promise.allSettled(changes.map(async ({ product, previousCategories }) => {
          const { data, error } = await supabase
            .from('products')
            .update({ category: previousCategories.join(', ') })
            .eq('id', product.id)
            .select('id')
            .maybeSingle();
          if (error) throw error;
          if (!data) throw new Error(`No se pudo restaurar el producto ${product.id}.`);
        }));
        return rollbackResults.filter((result) => result.status === 'rejected').length;
      };

      if (isLocalDemoMode()) {
        const demoCategory = getLocalDemoStore().categories.find((category) => category.name === oldName);
        if (demoCategory) localDemoUpdateRow('categories', demoCategory.id, { name: newName });
        productChanges.forEach(({ product, nextCategories }) => {
          localDemoUpdateRow('products', product.id, { category: nextCategories.join(', ') });
        });
      } else {
        const productUpdateResults = await Promise.allSettled(productChanges.map(async (change) => {
          const { data, error } = await supabase
            .from('products')
            .update({ category: change.nextCategories.join(', ') })
            .eq('id', change.product.id)
            .select('id')
            .maybeSingle();
          if (error) throw error;
          if (!data) throw new Error(`No se actualizó el producto ${change.product.id}.`);
          return change;
        }));
        const successfulChanges = productUpdateResults
          .filter((result) => result.status === 'fulfilled')
          .map((result) => result.value);
        const failedProductUpdates = productUpdateResults.length - successfulChanges.length;
        if (failedProductUpdates > 0) {
          const rollbackFailures = await rollbackProductChanges(successfulChanges);
          throw new Error(rollbackFailures > 0
            ? 'Algunos productos no pudieron actualizarse ni restaurarse. Recargá los datos antes de continuar.'
            : 'No se pudo actualizar la categoría en todos los productos. No se aplicaron cambios.');
        }

        const { data: updatedCategory, error: categoryError } = await supabase
          .from('categories')
          .update({ name: newName })
          .eq('name', oldName)
          .select('name')
          .maybeSingle();
        if (categoryError || !updatedCategory) {
          const rollbackFailures = await rollbackProductChanges(productChanges);
          if (rollbackFailures > 0) {
            throw new Error('La categoría no se renombró y algunos productos no pudieron restaurarse. Recargá los datos.');
          }
          throw categoryError || new Error('La categoría ya no existe o cambió en otra caja.');
        }
      }

      const changesByProductId = new Map(
        productChanges.map(({ product, nextCategories }) => [String(product.id), nextCategories]),
      );
      setCategories((prev) => prev.map((category) => category === oldName ? newName : category));
      setInventory((prev) => prev.map((product) => {
        const nextCategories = changesByProductId.get(String(product.id));
        return nextCategories
          ? { ...product, category: nextCategories.join(', '), categories: nextCategories }
          : product;
      }));

      
      addLog('Editar Categoría', { old: oldName, new: newName });
      showNotification('success', 'Categoría Actualizada', 'Nombre y productos actualizados.');
    } catch (e) {
      console.error(e);
      showNotification('error', 'No se pudo renombrar', e?.message || 'No se pudo renombrar la categoría.');
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
        price: normalizeStoredProductSalePrice(itemData.price, itemData.product_type),
        purchasePrice: normalizeStoredProductPurchaseCost(
          itemData.purchasePrice,
          itemData.product_type,
        ),
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
      const requestedActive = productData.is_active !== undefined
        ? productData.is_active !== false
        : productData.isActive !== false;
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

      let nextSupplierLinks = getProductSupplierLinks(originalProduct || productData);
      if (requestedActive) {
        const previousLifecycle = nextSupplierLinks.stock_lifecycle && typeof nextSupplierLinks.stock_lifecycle === 'object'
          ? nextSupplierLinks.stock_lifecycle
          : {};
        const nextLifecycle = { ...previousLifecycle };
        delete nextLifecycle.outOfStockSince;
        nextSupplierLinks = {
          ...nextSupplierLinks,
          stock_lifecycle: {
            ...nextLifecycle,
            lastManualEnabledAt: new Date().toISOString(),
          },
        };
      }

      const payload = {
        title: productData.title,
        price: normalizeStoredProductSalePrice(productData.price, productData.product_type),
        purchasePrice: normalizeStoredProductPurchaseCost(
          productData.purchasePrice,
          productData.product_type,
        ),
        category: Array.isArray(productData.categories) ? productData.categories.join(', ') : productData.category,
        barcode: productData.barcode || null,
        image: nextImage,
        image_thumb: nextImageThumb,
        product_type: productData.product_type || 'quantity',
        expiration_date: productData.expiration_date || null,
        is_active: requestedActive,
        supplier_links: nextSupplierLinks,
      };

      if (!originalProduct) {
        payload.stock = requestedStock;
      }

      const { data } = await updateWithSchemaFallback('products', productData.id, payload, CLOUD_SELECTS.products);
      let formattedProduct = mapInventoryRecords([data || { ...productData, ...payload }])[0] || { ...productData, ...payload };
      if (originalProduct && stockDelta !== 0) {
        const nextStock = isLocalDemoMode()
          ? Number(localDemoUpdateRow('products', productData.id, { stock: originalStock + stockDelta })?.stock || originalStock + stockDelta)
          : await applyProductStockDeltaCloud(originalProduct, stockDelta);
        formattedProduct = { ...formattedProduct, stock: nextStock };
        void syncStockLifecycleForDeltas({ [productData.id]: stockDelta });
      }
      const effectiveProductData = {
        ...productData,
        price: formattedProduct.price,
        purchasePrice: formattedProduct.purchasePrice,
        stock: formattedProduct.stock,
        image: nextImage,
        image_thumb: nextImageThumb,
        imageThumb: nextImageThumb,
      };
      setInventory((prev) => {
        const nextProduct = {
          ...formattedProduct,
          image: nextImage,
          image_thumb: nextImageThumb,
          imageThumb: nextImageThumb,
        };
        const exists = prev.some((product) => String(product.id) === String(productData.id));
        const nextList = prev.map((product) => (
          String(product.id) === String(productData.id) ? nextProduct : product
        ));
        if (!exists && getProductActiveState(nextProduct)) {
          return [...nextList, nextProduct];
        }
        return nextList;
      });
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
        isActive: getProductActiveState(originalProduct),
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
        isActive: requestedActive,
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
      pushProductChange('Estado', originalSnapshot.isActive ? 'Habilitado' : 'Deshabilitado', updatedSnapshot.isActive ? 'Habilitado' : 'Deshabilitado');

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

  const handleDeleteProductRequest = async (productOrId) => {
    const id = productOrId && typeof productOrId === 'object' ? productOrId.id : productOrId;
    const product = (productOrId && typeof productOrId === 'object')
      ? productOrId
      : inventory.find(p => String(p.id) === String(id));
    if (product) {
      const hydratedProduct = await hydrateProductCloudDetail(product);
      setProductToDelete(hydratedProduct);
      setDeleteProductReason('');
    }
  };

  const handleRetireDeletedProduct = async (product, reason = '') => {
    if (blockIfOfflineReadonly('eliminar ficha de producto')) return;
    const safeReason = String(reason || '').trim();
    if (!product?.id || !safeReason) {
      showNotification('error', 'Motivo requerido', 'Escribi una razon para dejar el item eliminado.');
      return;
    }

    const hydratedProduct = await hydrateProductCloudDetail(product).catch(() => product) || product;
    const isMarkedInactiveInEditor = product?.is_active === false || product?.isActive === false;
    if (!isMarkedInactiveInEditor && getProductActiveState(hydratedProduct)) {
      showNotification('warning', 'Primero deshabilitalo', 'Para compactar un producto como Item Eliminado, primero debe estar deshabilitado.');
      return;
    }

    const previousSupplierLinks = getProductSupplierLinks(hydratedProduct);
    const now = new Date().toISOString();
    const payload = {
      title: `Item Eliminado - ${safeReason}`.slice(0, 120),
      brand: '',
      price: 0,
      purchasePrice: 0,
      stock: 0,
      category: 'Eliminados',
      barcode: null,
      image: '',
      image_thumb: '',
      product_type: 'quantity',
      expiration_date: null,
      is_active: false,
      supplier_links: {
        ...previousSupplierLinks,
        deleted_item: {
          reason: safeReason,
          deletedAt: now,
          deletedBy: currentUserRef.current?.name || currentUserRef.current?.username || 'Sistema',
        },
      },
    };

    try {
      const { data } = await updateWithSchemaFallback('products', hydratedProduct.id, payload, CLOUD_SELECTS.products);
      const formattedProduct = mapInventoryRecords([data || { ...hydratedProduct, ...payload }])[0] || { ...hydratedProduct, ...payload };

      if (hydratedProduct.image) {
        await deleteProductImage(hydratedProduct.image).catch(() => {});
      }
      if (hydratedProduct.image_thumb || hydratedProduct.imageThumb) {
        await deleteProductImage(hydratedProduct.image_thumb || hydratedProduct.imageThumb).catch(() => {});
      }

      setInventory((prev) => prev.map((entry) =>
        String(entry.id) === String(hydratedProduct.id) ? formattedProduct : entry
      ));
      productDetailRequestsRef.current.delete(String(hydratedProduct.id));
      addLog('Baja Producto', {
        id: hydratedProduct.id,
        title: hydratedProduct.title,
        finalTitle: `Item Eliminado - ${safeReason}`.slice(0, 120),
        reason: safeReason,
      }, safeReason);
      setEditingProduct(null);
      setInventoryPanelCloseToken((prev) => prev + 1);
      showNotification('success', 'Item eliminado', 'Quedo solo la referencia con motivo.');
    } catch (error) {
      console.error('Error compactando producto eliminado:', error);
      showNotification('error', 'No se pudo eliminar', error?.message || 'Fallo la baja del producto.');
    }
  };

  const handleCreateExcelProducts = async (draftsToCreate = []) => {
    if (!hasPermission(currentUserRef.current, 'inventory.create')) {
      showNotification('error', 'Permiso requerido', 'Necesitas permiso para crear productos desde Excel.');
      return { created: [], failed: [] };
    }
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
        const sourceCode = String(draft.sourceCode || barcode || '').trim();
        const sourceDescription = String(draft.sourceDescription || title || '').trim();
        const stockDelta = Number(draft.stock || 0);
        const purchasePrice = normalizeFinalPurchaseCost(draft.purchasePrice);
        const price = normalizeFinalSalePrice(draft.price);

        if (!title) throw new Error('Falta el nombre del producto.');
        if (!category) throw new Error('Falta seleccionar una categoria.');
        if (!isSafeExcelImportNumber(stockDelta, { min: 0 })) throw new Error('La cantidad asignada no es valida.');
        if (!isSafeExcelImportNumber(purchasePrice, { min: Number.MIN_VALUE }) || purchasePrice <= 0) throw new Error('El costo debe ser mayor a cero.');
        if (!isSafeExcelImportNumber(price, { min: Number.MIN_VALUE }) || price <= 0) throw new Error('El precio debe ser mayor a cero.');
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
          supplier_links: upsertExcelImportAlias(
            {},
            {
              code: sourceCode,
              description: sourceDescription,
              rowNumber: draft.sourceRowNumber || null,
            },
          ),
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
    if (!hasPermission(currentUserRef.current, 'inventory.edit')) {
      showNotification('error', 'Permiso requerido', 'Necesitas permiso para modificar inventario desde Excel.');
      return { appliedRowIds: [] };
    }
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

      const batchResult = await runExcelImportBatch(safeRows, async (row) => {
        const product = inventory.find((entry) => String(entry.id) === String(row.productId));
        if (!product) {
          throw new Error(`No se encontro el producto ${row.productTitle || row.productId}.`);
        }

        const payload = {};
        const currentStock = Number(product.stock || 0);
        const currentCost = Number(product.purchasePrice || 0);
        const currentPrice = Number(product.price || 0);
        const stockDelta = row.approvals?.stock ? Number(row.quantity ?? 0) : 0;
        const currentSupplierLinks = getProductSupplierLinks(product);
        let nextSupplierLinks = currentSupplierLinks;

        if (!isSafeExcelImportNumber(currentStock)) throw new Error('El stock actual del producto no es valido.');
        if (!isSafeExcelImportNumber(currentCost, { min: 0 })) throw new Error('El costo actual del producto no es valido.');
        if (!isSafeExcelImportNumber(currentPrice, { min: 0 })) throw new Error('El precio actual del producto no es valido.');
        if (row.approvals?.stock && (!isSafeExcelImportNumber(stockDelta, { min: Number.MIN_VALUE }) || stockDelta <= 0)) {
          throw new Error('La variacion de stock no es valida.');
        }
        if (row.approvals?.stock && !isSafeExcelImportNumber(currentStock + stockDelta, { min: 0 })) {
          throw new Error('El stock resultante queda fuera de rango.');
        }
        if (row.approvals?.cost && !isSafeExcelImportNumber(row.after?.cost, { min: Number.MIN_VALUE })) {
          throw new Error('El costo importado no es valido.');
        }
        if (row.approvals?.price && !isSafeExcelImportNumber(row.after?.price, { min: Number.MIN_VALUE })) {
          throw new Error('El precio importado no es valido.');
        }
        if (row.approvals?.stock && currentStock !== Number(row.before?.stock)) {
          throw new Error('El stock cambio despues de revisar el Excel. Volve a confirmar la fila.');
        }
        if (row.approvals?.cost && currentCost !== Number(row.before?.cost ?? row.before?.purchasePrice)) {
          throw new Error('El costo cambio despues de revisar el Excel. Volve a confirmar la fila.');
        }
        if (row.approvals?.price && currentPrice !== Number(row.before?.price)) {
          throw new Error('El precio cambio despues de revisar el Excel. Volve a confirmar la fila.');
        }
        if (
          row.shouldAssignBarcode
          && String(product.barcode || '').trim() !== String(row.before?.barcode || '').trim()
        ) {
          throw new Error('El codigo de barras cambio despues de revisar el Excel. Volve a confirmar la fila.');
        }

        if (row.approvals?.cost) {
          payload.purchasePrice = normalizeStoredProductPurchaseCost(
            row.after?.cost || currentCost,
            product.product_type,
          );
        }
        if (row.approvals?.price) {
          payload.price = normalizeStoredProductSalePrice(
            row.after?.price || currentPrice,
            product.product_type,
          );
        }
        if (row.shouldAssignBarcode && row.importedCode) payload.barcode = String(row.importedCode);

        if (row.shouldSaveExcelLink && row.excelLink) {
          nextSupplierLinks = upsertExcelImportAlias(nextSupplierLinks, row.excelLink);
          payload.supplier_links = nextSupplierLinks;
        }

        if (row.importApplication?.signature) {
          nextSupplierLinks = recordExcelImportApplication(
            nextSupplierLinks,
            row.importApplication,
          );
          payload.supplier_links = nextSupplierLinks;
        }

        if (stockDelta !== 0) {
          const lifecycle = buildStockLifecyclePayload(
            { ...product, supplierLinks: nextSupplierLinks, supplier_links: nextSupplierLinks },
            stockDelta,
          );
          nextSupplierLinks = lifecycle.supplierLinks;
          payload.supplier_links = nextSupplierLinks;
          if (lifecycle.payload.is_active !== undefined) {
            payload.is_active = lifecycle.payload.is_active;
          }
        }

        let clearedProduct = null;
        let clearedProductBefore = null;
        let targetUpdated = false;
        let stockApplied = false;
        let updatedProduct = product;
        try {
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
              clearedProduct = mapInventoryRecords([clearedData || { ...currentBarcodeOwner, barcode: null }])[0] || null;
            }
          }

          if (Object.keys(payload).length === 0 && stockDelta === 0) {
            return { rowId: row.rowId, product, clearedProduct, clearedProductBefore };
          }

          if (Object.keys(payload).length > 0) {
            const { data } = await updateWithSchemaFallback('products', product.id, payload, CLOUD_SELECTS.products);
            targetUpdated = true;
            updatedProduct = mapInventoryRecords([data || { ...product, ...payload }])[0] || { ...product, ...payload };
          }

          if (stockDelta !== 0) {
            const nextStock = isLocalDemoMode()
              ? Number(localDemoUpdateRow('products', product.id, { stock: currentStock + stockDelta })?.stock || currentStock + stockDelta)
              : await applyProductStockDeltaCloud(product, stockDelta);
            stockApplied = true;
            updatedProduct = { ...updatedProduct, stock: nextStock };
          }

          return {
            rowId: row.rowId,
            product: updatedProduct,
            clearedProduct,
            clearedProductBefore,
            payload: {
              ...payload,
              ...(stockDelta !== 0 ? { stock: updatedProduct.stock } : {}),
            },
            before: {
              stock: currentStock,
              purchasePrice: currentCost,
              price: currentPrice,
              barcode: product.barcode || '',
              supplierLinks: currentSupplierLinks,
              isActive: getProductActiveState(product),
            },
            source: row,
          };
        } catch (error) {
          const rollbackErrors = [];

          if (stockApplied) {
            try {
              if (isLocalDemoMode()) {
                localDemoUpdateRow('products', product.id, { stock: currentStock });
              } else {
                await applyProductStockDeltaCloud(
                  { ...product, stock: currentStock + stockDelta },
                  -stockDelta,
                );
              }
            } catch (rollbackError) {
              rollbackErrors.push(`stock: ${rollbackError.message}`);
            }
          }

          if (targetUpdated) {
            const rollbackPayload = {};
            if (payload.purchasePrice !== undefined) rollbackPayload.purchasePrice = currentCost;
            if (payload.price !== undefined) rollbackPayload.price = currentPrice;
            if (payload.barcode !== undefined) rollbackPayload.barcode = product.barcode || null;
            if (payload.supplier_links !== undefined) rollbackPayload.supplier_links = currentSupplierLinks;
            if (payload.is_active !== undefined) rollbackPayload.is_active = getProductActiveState(product);

            try {
              await updateWithSchemaFallback('products', product.id, rollbackPayload, CLOUD_SELECTS.products);
            } catch (rollbackError) {
              rollbackErrors.push(`producto: ${rollbackError.message}`);
            }
          }

          if (clearedProductBefore) {
            try {
              await updateWithSchemaFallback(
                'products',
                clearedProductBefore.id,
                { barcode: clearedProductBefore.barcode || null },
                CLOUD_SELECTS.products,
              );
            } catch (rollbackError) {
              rollbackErrors.push(`codigo anterior: ${rollbackError.message}`);
            }
          }

          if (rollbackErrors.length > 0) {
            throw new Error(`${error?.message || 'Fallo la fila.'} No se pudo revertir: ${rollbackErrors.join('; ')}`);
          }
          throw error;
        }
      }, { concurrency: 4 });
      const updates = batchResult.succeeded;
      const failedRows = batchResult.failed.map(({ item, error }) => ({
        rowId: item.rowId,
        productTitle: item.productTitle,
        error: getCloudErrorMessage(error, 'No se pudo aplicar esta fila.'),
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
          excelLinkSaved: Boolean(update.source.shouldSaveExcelLink),
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
            supplierLinks: getProductSupplierLinks(update.product),
            isActive: getProductActiveState(update.product),
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
            update.source.shouldSaveExcelLink && {
              field: 'Vinculo Excel',
              old: 'Sin referencia',
              new: update.source.importedCode || update.source.importedDescription || 'Referencia guardada',
            },
          ].filter(Boolean),
        })),
      }, 'Productos Avanzado');

      Swal.close();
      if (failedRows.length > 0) {
        showNotification(
          appliedUpdates.length > 0 ? 'warning' : 'error',
          appliedUpdates.length > 0 ? 'Importacion parcial' : 'No se aplicaron cambios',
          `${appliedUpdates.length} producto(s) actualizado(s) y ${failedRows.length} fila(s) pendiente(s).`,
        );
      } else {
        showNotification('success', 'Importacion aplicada', `Se actualizaron ${appliedUpdates.length} producto(s).`);
      }
      return {
        appliedRowIds: updates.map((update) => update.rowId),
        failed: failedRows,
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
            supplierLinks: getProductSupplierLinks(update.product),
            isActive: getProductActiveState(update.product),
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
      return {
        appliedRowIds: [],
        failed: safeRows.map((row) => ({
          rowId: row.rowId,
          productTitle: row.productTitle,
          error: getCloudErrorMessage(error, 'No se pudo aplicar esta fila.'),
        })),
      };
    }
  };

  const handleUndoExcelProductImport = async (itemsToUndo = []) => {
    if (!hasPermission(currentUserRef.current, 'inventory.edit')) {
      showNotification('error', 'Permiso requerido', 'Necesitas permiso para deshacer cambios de inventario.');
      return { undoneRowIds: [] };
    }
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

      const batchResult = await runExcelImportBatch(safeItems, async (item) => {
        const product = inventory.find((entry) => String(entry.id) === String(item.productId));
        if (!product) {
          throw new Error(`No se encontro el producto ${item.productTitle || item.productId}.`);
        }

        const before = item.before || {};
        const after = item.after || {};
        const conflicts = getExcelImportUndoConflicts({
          before,
          after,
          current: {
            stock: Number(product.stock || 0),
            purchasePrice: Number(product.purchasePrice || 0),
            price: Number(product.price || 0),
            barcode: product.barcode || '',
            supplierLinks: getProductSupplierLinks(product),
            isActive: getProductActiveState(product),
          },
        });
        if (conflicts.length > 0) {
          throw new Error(`El producto cambio despues de aplicar el Excel (${conflicts.join(', ')}).`);
        }

        const restorePayload = {
          stock: Number(before.stock || 0),
          purchasePrice: normalizeStoredProductPurchaseCost(
            before.purchasePrice ?? before.cost ?? 0,
            product.product_type,
          ),
          price: Number(before.price || 0),
          barcode: before.barcode || null,
        };
        if (before.supplierLinks) restorePayload.supplier_links = before.supplierLinks;
        if (before.isActive !== undefined) restorePayload.is_active = before.isActive !== false;

        const { data } = await updateWithSchemaFallback('products', product.id, restorePayload, CLOUD_SELECTS.products);
        const restoredProduct = mapInventoryRecords([data || { ...product, ...restorePayload }])[0];
        let restoredBarcodeOwner = null;

        if (item.clearedBarcodeOwner?.id) {
          const owner = inventory.find((entry) => String(entry.id) === String(item.clearedBarcodeOwner.id));
          const ownerPayload = { barcode: item.clearedBarcodeOwner.barcode || null };
          try {
            const { data: ownerData } = await updateWithSchemaFallback(
              'products',
              item.clearedBarcodeOwner.id,
              ownerPayload,
              CLOUD_SELECTS.products,
            );
            restoredBarcodeOwner = mapInventoryRecords([ownerData || { ...(owner || {}), id: item.clearedBarcodeOwner.id, ...ownerPayload }])[0];
          } catch (ownerError) {
            const appliedPayload = {
              stock: Number(after.stock || 0),
              purchasePrice: normalizeStoredProductPurchaseCost(
                after.purchasePrice ?? after.cost ?? 0,
                product.product_type,
              ),
              price: Number(after.price || 0),
              barcode: after.barcode || null,
            };
            if (after.supplierLinks) appliedPayload.supplier_links = after.supplierLinks;
            if (after.isActive !== undefined) appliedPayload.is_active = after.isActive !== false;

            try {
              await updateWithSchemaFallback('products', product.id, appliedPayload, CLOUD_SELECTS.products);
            } catch (rollbackError) {
              throw new Error(`${ownerError.message} No se pudo restaurar el producto aplicado: ${rollbackError.message}`);
            }
            throw ownerError;
          }
        }

        return { item, restoredProduct, restoredBarcodeOwner };
      }, { concurrency: 4 });
      const restoredRows = batchResult.succeeded;
      const failedRows = batchResult.failed.map(({ item, error }) => ({
        rowId: item.rowId,
        productTitle: item.productTitle,
        error: getCloudErrorMessage(error, 'No se pudo deshacer esta fila.'),
      }));

      const restoredById = new Map();
      restoredRows.flatMap(({ restoredProduct, restoredBarcodeOwner }) => (
        [restoredProduct, restoredBarcodeOwner]
      )).filter(Boolean).forEach((product) => {
        restoredById.set(String(product.id), product);
      });
      setInventory((prev) => prev.map((product) => restoredById.get(String(product.id)) || product));

      addLog('Deshacer Importacion Excel', {
        count: restoredRows.length,
        undoneRowIds: restoredRows.map(({ item }) => item.rowId),
        items: restoredRows.map(({ item }) => ({
          id: item.productId,
          title: item.productTitle,
          beforeUndo: item.after,
          restored: item.before,
          restoredBarcodeOwner: item.clearedBarcodeOwner || null,
        })),
      }, 'Productos Avanzado');

      Swal.close();
      if (failedRows.length > 0) {
        showNotification(
          restoredRows.length > 0 ? 'warning' : 'error',
          restoredRows.length > 0 ? 'Restauracion parcial' : 'No se pudo deshacer',
          `${restoredRows.length} producto(s) restaurado(s) y ${failedRows.length} pendiente(s).`,
        );
      } else {
        showNotification('success', 'Importacion deshecha', `Se restauraron ${restoredRows.length} producto(s).`);
      }
      return {
        undoneRowIds: restoredRows.map(({ item }) => item.rowId),
        failed: failedRows,
      };
    } catch (error) {
      console.error('Error deshaciendo importacion desde Excel:', error);
      Swal.fire('Error', error?.message || 'No se pudo deshacer la importacion.', 'error');
      return { undoneRowIds: [] };
    }
  };

  const handleSearchInactiveInventoryProducts = async (query = '') => {
    const search = String(query || '').trim().toLowerCase();
    const words = search.split(/\s+/).filter(Boolean);
    if (isLocalDemoMode()) return [];

    try {
      const result = await fetchAllCloudRowsWithSelectFallback(
        (selectColumns) =>
          supabase
            .from('products')
            .select(selectColumns)
            .eq('is_active', false)
            .order('title'),
        CLOUD_SELECTS.products,
        CLOUD_FETCH_BATCH_SIZE,
      );

      if (result.error) {
        const missingColumn = getSchemaMissingColumnName(extractSchemaMissingColumn(result.error));
        if (missingColumn === 'is_active') return [];
        throw result.error;
      }

      return mapInventoryRecords(result.data || []).filter((product) => {
        if (words.length === 0) return true;
        const haystack = `${product.id} ${product.title || ''} ${product.barcode || ''} ${product.category || ''}`.toLowerCase();
        return words.every((word) => haystack.includes(word));
      });
    } catch (error) {
      const missingColumn = getSchemaMissingColumnName(extractSchemaMissingColumn(error));
      if (missingColumn === 'is_active') return [];
      console.warn('No se pudieron buscar productos inhabilitados:', error);
      return [];
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
          const isAiCleanup = row.matchQuality === 'ai_cleanup' || row.sourceUrl === 'openai-image-edit';
          const nextSupplierLinks = isAiCleanup
            ? {
                ...safeSupplierLinks,
                rebu_image_cleanup: {
                  provider: 'OpenAI',
                  promptApplied: true,
                  watermarked: Boolean(row.watermarked),
                  watermarkPlacement: row.watermarkPlacement || '',
                  previousImageUrl: row.previousImageUrl || '',
                  previousImageThumbUrl: row.previousImageThumbUrl || '',
                  verifiedAt,
                },
              }
            : {
                ...safeSupplierLinks,
                casa_alberto: casaAlbertoLink,
              };

          const { data, payload: savedPayload } = await updateWithSchemaFallback(
            'products',
            currentProduct.id,
            {
              image: uploadedImage.image,
              image_thumb: uploadedImage.imageThumb,
              supplier_links: nextSupplierLinks,
            },
            CLOUD_SELECTS.products
          );
          if (!isLocalDemoMode() && row.replaceExistingImage && !row.preservePreviousImage) {
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
              provider: isAiCleanup ? 'OpenAI / Limpieza IA' : 'Cotillon Casa Alberto',
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

  const handleRestoreProductImageVersion = async ({ productId, image, image_thumb: imageThumb, reason = '' } = {}) => {
    if (blockIfOfflineReadonly('restaurar foto de producto')) {
      return { success: false, error: 'Modo solo lectura.' };
    }

    const product = inventory.find((entry) => String(entry.id) === String(productId));
    if (!product) return { success: false, error: 'Producto no encontrado.' };

    const nextImage = String(image || '').trim();
    if (!nextImage) return { success: false, error: 'No hay foto original para restaurar.' };

    try {
      const currentProductDetail = isLocalDemoMode()
        ? product
        : await fetchProductCloudDetail(product.id).catch(() => product);
      const existingSupplierLinks = (
        currentProductDetail?.supplierLinks ||
        currentProductDetail?.supplier_links ||
        product?.supplierLinks ||
        product?.supplier_links
      );
      const safeSupplierLinks = existingSupplierLinks && typeof existingSupplierLinks === 'object'
        ? existingSupplierLinks
        : {};
      const restoredAt = new Date().toISOString();

      const payload = {
        image: nextImage,
        image_thumb: String(imageThumb || nextImage).trim(),
        supplier_links: {
          ...safeSupplierLinks,
          rebu_image_cleanup: {
            ...(safeSupplierLinks.rebu_image_cleanup || {}),
            restoredAt,
            restoredReason: reason || 'Restauracion manual desde limpieza IA',
          },
        },
      };

      let updatedProduct;
      if (isLocalDemoMode()) {
        updatedProduct = mapInventoryRecords([{ ...product, ...payload }])[0];
      } else {
        const { data } = await updateWithSchemaFallback('products', product.id, payload, CLOUD_SELECTS.products);
        updatedProduct = mapInventoryRecords([data || { ...product, ...payload }])[0];
      }

      setInventory((prev) => prev.map((entry) => (
        String(entry.id) === String(product.id) ? updatedProduct : entry
      )));
      productDetailRequestsRef.current.delete(String(product.id));

      addLog('Restauracion Imagen Producto', {
        id: updatedProduct.id,
        title: updatedProduct.title,
        barcode: updatedProduct.barcode || '',
        imageStateBefore: product.image ? 'Cargada' : 'Sin imagen',
        imageStateAfter: updatedProduct.image ? 'Cargada' : 'Sin imagen',
        restoredAt,
      }, reason || 'Limpieza IA / volver al original');

      return { success: true, product: updatedProduct };
    } catch (error) {
      console.error('Error restaurando imagen de producto:', error);
      showNotification('error', 'No se pudo restaurar', error?.message || 'La foto original no pudo volver al producto.');
      return { success: false, error: error?.message || 'No se pudo restaurar la foto.' };
    }
  };

  const runSupplierProductUpdatesBatch = async (action, mutations = []) => {
    const safeMutations = (Array.isArray(mutations) ? mutations.filter(Boolean) : []).map((mutation) => {
      if (!mutation.apply_purchase_price) return mutation;
      const currentProduct = inventory.find((product) => String(product.id) === String(mutation.product_id));
      return {
        ...mutation,
        purchase_price: normalizeStoredProductPurchaseCost(
          mutation.purchase_price,
          currentProduct?.product_type,
        ),
      };
    });
    if (safeMutations.length === 0) return [];

    if (isLocalDemoMode()) {
      return safeMutations.map((mutation) => {
        const currentProduct = inventory.find((product) => String(product.id) === String(mutation.product_id));
        const payload = { supplier_links: mutation.supplier_links };
        if (mutation.apply_purchase_price) payload.purchasePrice = mutation.purchase_price;
        if (mutation.apply_sale_price) {
          payload.price = normalizeStoredProductSalePrice(
            mutation.sale_price,
            currentProduct?.product_type,
          );
        }
        return mapInventoryRecords([
          localDemoUpdateRow('products', mutation.product_id, payload),
        ])[0];
      }).filter(Boolean);
    }

    const { data, error } = await supabase.rpc('apply_supplier_product_updates_batch', {
      p_action: action,
      p_updates: safeMutations,
    });
    if (error) {
      const errorText = [error.message, error.details, error.hint, error.code].filter(Boolean).join(' ');
      if (/Sesion Supabase Auth requerida|Usuario autenticado no vinculado|invalid refresh token|jwt|auth|42501/i.test(errorText)) {
        throw new Error('Tu sesión de usuario expiró o no está autenticada. Cerrá sesión y volvé a ingresar.');
      }
      if (/apply_supplier_product_updates_batch|function .* does not exist|schema cache|PGRST202/i.test(errorText)) {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) {
          throw new Error('Tu sesión expiró. Cerrá sesión en Rebu y volvé a iniciar sesión para continuar.');
        }
        throw new Error('La base necesita la migracion de lote de costos antes de continuar.');
      }
      throw error;
    }

    const updatedProducts = mapInventoryRecords(Array.isArray(data?.products) ? data.products : []);
    if (updatedProducts.length !== safeMutations.length) {
      throw new Error('La base no devolvio todos los productos del lote.');
    }
    return updatedProducts;
  };

  const mergeSupplierProductsIntoInventory = (updatedProducts = []) => {
    const updatedById = new Map(
      (Array.isArray(updatedProducts) ? updatedProducts : [])
        .filter(Boolean)
        .map((product) => [String(product.id), product]),
    );
    if (updatedById.size > 0) {
      setInventory((prev) => prev.map((product) => updatedById.get(String(product.id)) || product));
    }
    return Array.from(updatedById.values());
  };

  const handleSaveSupplierPriceChecks = async (checksToSave = []) => {
    if (blockIfOfflineReadonly('guardar chequeo de Casa Alberto')) return { products: [] };
    const safeChecks = Array.isArray(checksToSave) ? checksToSave : [];
    if (safeChecks.length === 0) return { products: [] };

    const inventoryById = new Map(inventory.map((product) => [String(product.id), product]));
    const mutations = [];
    const now = new Date().toISOString();

    for (const check of safeChecks) {
      const product = inventoryById.get(String(check.productId));
      if (!product) continue;

      const existingTracking = getCasaAlbertoLink(product).price_tracking || {};
      const supplierPrice = Number(check.supplierPrice || 0);
      const rawSupplierPrice = Number(check.rawSupplierPrice ?? check.supplierPrice ?? 0) || supplierPrice;
      const unitDivisor = Number(check.unitDivisor || 1) > 0 ? Number(check.unitDivisor || 1) : 1;
      const unitSupplierPrice = Number(check.unitSupplierPrice || 0) || (rawSupplierPrice > 0 ? rawSupplierPrice / unitDivisor : supplierPrice);
      const previousSupplierPrice = Number(
        check.previousSupplierPrice ??
        existingTracking.lastSupplierPrice ??
        product.purchasePrice ??
        0
      ) || null;
      const suggestedSalePrice = Number(check.suggestedSalePrice || 0) ||
        buildSuggestedSalePriceFromMargin(product, unitSupplierPrice, {
          vatPercent: check.vatPercent,
          vatRate: check.vatRate,
          grossMarginPercent: check.grossMarginPercent,
          grossMarginRate: check.grossMarginRate,
          costExtraRate: check.costExtraRate,
          saleMarkupRate: check.saleMarkupRate,
        });
      const estimatedCost = Number(check.estimatedCost || check.approvedCost || 0) ||
        buildCasaAlbertoEstimatedCost(unitSupplierPrice, {
          vatPercent: check.vatPercent,
          vatRate: check.vatRate,
          costExtraRate: check.costExtraRate,
        });
      const nextSupplierLinks = upsertCasaAlbertoPriceTracking(
        getProductSupplierLinks(product),
        {
          providerCode: check.supplierCode,
          casaAlbertoId: check.casaAlbertoId,
          productUrl: check.productUrl,
          foundTitle: check.foundTitle,
          matchedBy: check.matchedBy,
          inventoryBarcode: check.inventoryBarcode,
          searchedQuery: check.searchedQuery,
          titleSimilarity: check.titleSimilarity,
          sourceUrl: check.sourceUrl,
          imageUrl: check.imageUrl || existingTracking.imageUrl || '',
          priceText: check.priceText,
          supplierPrice,
          rawSupplierPrice,
          unitSupplierPrice,
          unitDivisor,
          approvedCost: estimatedCost,
          estimatedCost,
          vatPercent: check.vatPercent,
          vatRate: check.vatRate,
          grossMarginPercent: check.grossMarginPercent,
          grossMarginRate: check.grossMarginRate,
          formulaVersion: check.formulaVersion,
          lastSupplierPrice: supplierPrice,
          previousSupplierPrice,
          suggestedSalePrice,
          reviewStatus: check.reviewStatus || 'reviewed',
          brokenReason: check.brokenReason || null,
          lastCheckedAt: check.lastCheckedAt || now,
          lastChangedAt: check.lastChangedAt || existingTracking.lastChangedAt || null,
          message: check.message || '',
        },
        now,
      );

      mutations.push({
        product_id: product.id,
        expected_updated_at: product.updated_at || null,
        purchase_price: null,
        sale_price: null,
        apply_purchase_price: false,
        apply_sale_price: false,
        supplier_links: nextSupplierLinks,
      });
    }

    const action = safeChecks.every((check) => check?.reviewStatus === 'ignored') ? 'ignore' : 'review';
    const updatedProducts = await runSupplierProductUpdatesBatch(action, mutations);
    return { products: mergeSupplierProductsIntoInventory(updatedProducts) };
  };

  const handleExportSupplierPriceReport = async (days = 1) => {
    if (blockIfOfflineReadonly('exportar el historial de precios de Casa Alberto')) {
      return { success: false, offline: true };
    }
    if (!window.electronAPI?.saveSupplierPriceReportPdf) {
      await Swal.fire({
        icon: 'info',
        title: 'Electron requerido',
        text: 'El historial PDF se guarda desde la aplicación de escritorio.',
        confirmButtonText: 'Entendido',
      });
      return { success: false, unsupported: true };
    }

    const period = getSupplierPriceReportPeriod(days);
    const now = new Date();
    const cutoff = getSupplierPriceReportCutoff(period.days, now);

    try {
      const logsResult = await fetchAllCloudRowsWithSelectFallback(
        (selectColumns) => supabase
          .from('logs')
          .select(selectColumns)
          .in('action', SUPPLIER_PRICE_REPORT_ACTIONS)
          .gte('created_at', cutoff.toISOString())
          .lte('created_at', now.toISOString())
          .order('created_at', { ascending: false })
          .order('id', { ascending: false }),
        CLOUD_SELECTS.logs,
        CLOUD_FETCH_BATCH_SIZE,
      );
      if (logsResult.error) throw logsResult.error;

      const report = buildSupplierPriceChangeReport(mapLogRecords(logsResult.data || []), {
        days: period.days,
        now,
      });
      if (report.changes.length === 0) {
        await Swal.fire({
          icon: 'info',
          title: 'Sin cambios en el período',
          text: `No hay aprobaciones ni reversiones de Casa Alberto en ${period.label.toLowerCase()}.`,
          confirmButtonText: 'Cerrar',
        });
        return { success: false, empty: true };
      }

      const result = await window.electronAPI.saveSupplierPriceReportPdf({
        report,
        defaultName: `Cambios Casa Alberto - ${period.fileLabel}.pdf`,
      });
      if (result?.canceled) return result;
      if (!result?.success) throw new Error(result?.error || 'No se pudo guardar el PDF.');

      void addLog('Exportacion PDF Casa Alberto', {
        source: 'Productos Avanzado / Casa Alberto',
        periodDays: period.days,
        periodLabel: period.label,
        changeCount: report.summary.changeCount,
        uniqueProducts: report.summary.uniqueProducts,
        fileName: String(result.filePath || '').split(/[\\/]/).pop() || '',
      }, 'Casa Alberto').catch((logError) => {
        console.warn('No se pudo registrar la exportacion PDF de Casa Alberto:', logError);
      });
      showNotification(
        'success',
        'Historial PDF guardado',
        `${report.summary.changeCount} cambio(s) de ${report.summary.uniqueProducts} producto(s).`,
      );
      return result;
    } catch (error) {
      console.error('Error exportando historial de precios de Casa Alberto:', error);
      showNotification('error', 'No se pudo crear el PDF', error?.message || 'Reintentá en unos segundos.');
      return { success: false, error: error?.message || 'No se pudo crear el PDF.' };
    }
  };

  const handleApplySupplierPriceUpdates = async (updatesToApply = []) => {
    if (blockIfOfflineReadonly('aprobar costos de Casa Alberto')) return { products: [] };
    const safeUpdates = Array.isArray(updatesToApply) ? updatesToApply : [];
    if (safeUpdates.length === 0) return { products: [] };

    const inventoryById = new Map(inventory.map((product) => [String(product.id), product]));
    const mutations = [];
    const logItems = [];
    const now = new Date().toISOString();

    try {
      for (const update of safeUpdates) {
        const product = inventoryById.get(String(update.productId));
        if (!product) continue;

        const supplierPrice = Number(update.supplierPrice || 0);
        if (!Number.isFinite(supplierPrice) || supplierPrice <= 0) continue;
        const rawSupplierPrice = Number(update.rawSupplierPrice ?? update.supplierPrice ?? 0) || supplierPrice;
        const unitDivisor = Number(update.unitDivisor || 1) > 0 ? Number(update.unitDivisor || 1) : 1;
        const unitSupplierPrice = Number(update.unitSupplierPrice || 0) || (rawSupplierPrice > 0 ? rawSupplierPrice / unitDivisor : supplierPrice);
        const approvedCost = Number(update.approvedCost || update.estimatedCost || 0) ||
          buildCasaAlbertoEstimatedCost(unitSupplierPrice, {
            vatPercent: update.vatPercent,
            vatRate: update.vatRate,
            costExtraRate: update.costExtraRate,
          });
        if (!Number.isFinite(approvedCost) || approvedCost <= 0) continue;

        const before = {
          purchasePrice: Number(product.purchasePrice || 0),
          price: Number(product.price || 0),
          supplierLinks: getProductSupplierLinks(product),
        };
        const existingTracking = getCasaAlbertoLink(product).price_tracking || {};
        const suggestedSalePrice = Number(update.suggestedSalePrice || 0) ||
          buildSuggestedSalePriceFromMargin(product, unitSupplierPrice, {
            vatPercent: update.vatPercent,
            vatRate: update.vatRate,
            grossMarginPercent: update.grossMarginPercent,
            grossMarginRate: update.grossMarginRate,
            costExtraRate: update.costExtraRate,
            saleMarkupRate: update.saleMarkupRate,
          });
        const finalSalePrice = normalizeStoredProductSalePrice(
          update.finalSalePrice,
          product.product_type,
        );
        const shouldUpdateSalePrice = Number.isFinite(finalSalePrice) && finalSalePrice > 0;
        const nextSupplierLinks = upsertCasaAlbertoPriceTracking(
          before.supplierLinks,
          {
            providerCode: update.supplierCode,
            casaAlbertoId: update.casaAlbertoId,
            productUrl: update.productUrl,
            foundTitle: update.foundTitle,
            sourceUrl: update.sourceUrl,
            imageUrl: update.imageUrl || '',
            priceText: update.priceText,
            supplierPrice,
            rawSupplierPrice,
            unitSupplierPrice,
            unitDivisor,
            approvedCost,
            estimatedCost: approvedCost,
            vatPercent: update.vatPercent,
            vatRate: update.vatRate,
            grossMarginPercent: update.grossMarginPercent,
            grossMarginRate: update.grossMarginRate,
            formulaVersion: update.formulaVersion,
            lastSupplierPrice: supplierPrice,
            previousSupplierPrice: existingTracking.previousSupplierPrice ?? null,
            previousPurchasePrice: before.purchasePrice,
            suggestedSalePrice,
            finalSalePrice: shouldUpdateSalePrice ? finalSalePrice : before.price,
            reviewStatus: 'approved',
            lastCheckedAt: now,
            lastChangedAt: now,
            approvedAt: now,
            message: 'Costo aprobado desde Casa Alberto.',
          },
          now,
        );

        mutations.push({
          product_id: product.id,
          expected_updated_at: product.updated_at || null,
          purchase_price: approvedCost,
          sale_price: shouldUpdateSalePrice ? finalSalePrice : null,
          apply_purchase_price: true,
          apply_sale_price: shouldUpdateSalePrice,
          supplier_links: nextSupplierLinks,
        });
        logItems.push({
          id: product.id,
          title: product.title,
          barcode: product.barcode || '',
          provider: 'Cotillon Casa Alberto',
          supplierCode: update.supplierCode || '',
          casaAlbertoId: update.casaAlbertoId || '',
          productUrl: update.productUrl || '',
          before,
          after: {
            purchasePrice: approvedCost,
            price: shouldUpdateSalePrice ? finalSalePrice : product.price,
            suggestedSalePrice,
            supplierLinks: nextSupplierLinks,
          },
          changes: [
            {
              field: 'Costo',
              old: before.purchasePrice,
              new: approvedCost,
              isPrice: true,
            },
            ...(shouldUpdateSalePrice && Math.abs(finalSalePrice - before.price) >= 0.01
              ? [{
                field: 'Precio de venta',
                old: before.price,
                new: finalSalePrice,
                isPrice: true,
              }]
              : []),
          ],
        });
      }

      const updatedProducts = await runSupplierProductUpdatesBatch('approve', mutations);
      const mergedProducts = mergeSupplierProductsIntoInventory(updatedProducts);

      if (logItems.length > 0) {
        await addLog('Actualizacion Precio Proveedor', {
          source: 'Productos Avanzado / Casa Alberto',
          count: logItems.length,
          items: logItems,
        }, 'Casa Alberto');
        showNotification('success', 'Costos actualizados', `${logItems.length} producto(s) con costo/precio aprobado.`);
      }

      return { products: mergedProducts };
    } catch (error) {
      console.error('Error aprobando precios de Casa Alberto:', error);
      const message = error?.message || 'No se pudieron aprobar los costos.';
      showNotification('error', 'Error', message);
      return { products: [], error: message };
    }
  };

  const handleUndoSupplierPriceUpdates = async (updatesToUndo = []) => {
    if (blockIfOfflineReadonly('deshacer costos de Casa Alberto')) return { products: [] };
    const safeUpdates = Array.isArray(updatesToUndo) ? updatesToUndo : [];
    if (safeUpdates.length === 0) return { products: [] };

    const inventoryById = new Map(inventory.map((product) => [String(product.id), product]));
    const mutations = [];
    const logItems = [];
    const now = new Date().toISOString();

    try {
      for (const update of safeUpdates) {
        const product = inventoryById.get(String(update.productId));
        if (!product) continue;

        const previousPurchasePrice = Number(update.previousPurchasePrice || 0);
        if (!Number.isFinite(previousPurchasePrice) || previousPurchasePrice <= 0) continue;

        const before = {
          purchasePrice: Number(product.purchasePrice || 0),
          price: Number(product.price || 0),
          supplierLinks: getProductSupplierLinks(product),
        };
        const tracking = getCasaAlbertoLink(product).price_tracking || {};
        const supplierPrice = Number(update.supplierPrice || tracking.lastSupplierPrice || 0);
        const rawSupplierPrice = Number(update.rawSupplierPrice ?? tracking.rawSupplierPrice ?? supplierPrice ?? 0) || supplierPrice;
        const unitDivisor = Number(update.unitDivisor || tracking.unitDivisor || 1) > 0 ? Number(update.unitDivisor || tracking.unitDivisor || 1) : 1;
        const unitSupplierPrice = Number(update.unitSupplierPrice || tracking.unitSupplierPrice || 0) || (rawSupplierPrice > 0 ? rawSupplierPrice / unitDivisor : supplierPrice);
        const nextSupplierLinks = upsertCasaAlbertoPriceTracking(
          before.supplierLinks,
          {
            providerCode: update.supplierCode,
            casaAlbertoId: update.casaAlbertoId,
            productUrl: update.productUrl,
            foundTitle: update.foundTitle,
            sourceUrl: update.sourceUrl,
            supplierPrice,
            rawSupplierPrice,
            unitSupplierPrice,
            unitDivisor,
            lastSupplierPrice: supplierPrice,
            previousSupplierPrice: tracking.previousSupplierPrice ?? null,
            previousPurchasePrice: null,
            approvedCost: previousPurchasePrice,
            estimatedCost: buildCasaAlbertoEstimatedCost(unitSupplierPrice),
            suggestedSalePrice: Number(tracking.suggestedSalePrice || 0),
            reviewStatus: 'reviewed',
            lastCheckedAt: now,
            lastChangedAt: now,
            approvedAt: null,
            message: 'Aprobacion deshecha. Costo anterior restaurado.',
          },
          now,
        );

        mutations.push({
          product_id: product.id,
          expected_updated_at: product.updated_at || null,
          purchase_price: previousPurchasePrice,
          sale_price: null,
          apply_purchase_price: true,
          apply_sale_price: false,
          supplier_links: nextSupplierLinks,
        });
        logItems.push({
          id: product.id,
          title: product.title,
          barcode: product.barcode || '',
          provider: 'Cotillon Casa Alberto',
          supplierCode: update.supplierCode || '',
          casaAlbertoId: update.casaAlbertoId || '',
          productUrl: update.productUrl || '',
          before,
          after: {
            purchasePrice: previousPurchasePrice,
            price: product.price,
            supplierLinks: nextSupplierLinks,
          },
          changes: [{
            field: 'Costo',
            old: before.purchasePrice,
            new: previousPurchasePrice,
            isPrice: true,
          }],
        });
      }

      const updatedProducts = await runSupplierProductUpdatesBatch('undo', mutations);
      const mergedProducts = mergeSupplierProductsIntoInventory(updatedProducts);

      if (logItems.length > 0) {
        await addLog('Deshacer Precio Proveedor', {
          source: 'Productos Avanzado / Casa Alberto',
          count: logItems.length,
          items: logItems,
        }, 'Casa Alberto');
        showNotification('success', 'Costo restaurado', `${logItems.length} producto(s) restaurados.`);
      }

      return { products: mergedProducts };
    } catch (error) {
      console.error('Error deshaciendo precios de Casa Alberto:', error);
      const message = error?.message || 'No se pudo deshacer la aprobacion.';
      showNotification('error', 'Error', message);
      return { products: [], error: message };
    }
  };

  const handleUpdateCasaAlbertoLinks = async ({ productIds = [], link = {} } = {}) => {
    if (blockIfOfflineReadonly('actualizar enlace Casa Alberto')) return { products: [] };
    const safeIds = Array.isArray(productIds) ? productIds : [];
    if (safeIds.length === 0) return { products: [] };

    const inventoryById = new Map(inventory.map((product) => [String(product.id), product]));
    const mutations = [];
    const now = new Date().toISOString();

    try {
      for (const productId of safeIds) {
        const product = inventoryById.get(String(productId));
        if (!product) continue;

        const currentSupplierLinks = getProductSupplierLinks(product);
        const nextSupplierLinks = link.unlink
          ? removeCasaAlbertoLink(currentSupplierLinks)
          : upsertCasaAlbertoLink(
              currentSupplierLinks,
              {
                ...link,
                verifiedAt: now,
              },
              now,
            );
        mutations.push({
          product_id: product.id,
          expected_updated_at: product.updated_at || null,
          purchase_price: null,
          sale_price: null,
          apply_purchase_price: false,
          apply_sale_price: false,
          supplier_links: nextSupplierLinks,
        });
      }

      const updatedProducts = await runSupplierProductUpdatesBatch('link', mutations);
      const mergedProducts = mergeSupplierProductsIntoInventory(updatedProducts);
      if (mergedProducts.length > 0) {
        await addLog('Vinculo Casa Alberto Editado', {
          source: 'Productos Avanzado / Casa Alberto',
          count: mergedProducts.length,
          link,
          productIds: safeIds,
        }, 'Casa Alberto');
        showNotification('success', 'Enlace actualizado', `${mergedProducts.length} producto(s) vinculados.`);
      }

      return { products: mergedProducts };
    } catch (error) {
      console.error('Error actualizando enlace Casa Alberto:', error);
      const message = error?.message || 'No se pudo guardar el enlace.';
      showNotification('error', 'Error', message);
      return { products: [], error: message };
    }
  };

  const handleBulkSaveSingle = async (product, editData) => {
    if (blockIfOfflineReadonly('guardar cambios de productos')) return;
    try {
      const finalPrice = getStoredProductSalePrice(editData.price, product.product_type);
      const finalCost = getStoredProductPurchaseCost(editData.purchasePrice, product.product_type);
      const requestedStock = Number(editData.stock);

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
      if (stockDelta !== 0) void syncStockLifecycleForDeltas({ [product.id]: stockDelta });

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
        const finalPrice = getStoredProductSalePrice(edits.price, product.product_type);
        const finalCost = getStoredProductPurchaseCost(edits.purchasePrice, product.product_type);
        const requestedStock = Number(edits.stock);
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
      const lifecycleDeltas = results.reduce((acc, result) => {
        const delta = Number(result.after?.stock || 0) - Number(result.before?.stock || 0);
        if (delta !== 0) acc[String(result.id)] = delta;
        return acc;
      }, {});
      void syncStockLifecycleForDeltas(lifecycleDeltas);

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
        purchasePrice: normalizeStoredProductPurchaseCost(
          originalProduct.purchasePrice,
          originalProduct.product_type,
        ),
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

  const extractCouponCodeFromSaleItem = useCallback((item) => {
    const explicitCode = String(item?.couponCode || item?.coupon_code || '').trim();
    if (explicitCode) return explicitCode.toUpperCase();

    const title = String(item?.title || '');
    const description = String(item?.description || '');
    const couponMatch =
      title.match(/cup[oó]n\s+([a-z0-9_-]+)/i) ||
      description.match(/cup[oó]n\s+([a-z0-9_-]+)/i);

    return couponMatch ? String(couponMatch[1]).trim().toUpperCase() : '';
  }, []);

  const enrichClientWithCouponUsage = useCallback((client) => {
    if (!client || client.id === 'guest') return client;

    const memberId = String(client.id || '');
    const memberNumber = String(client.memberNumber || '');

    const usedCoupons = (transactions || []).flatMap((tx) => {
      if (['voided', 'deleted'].includes(tx.status) || !tx.client) return [];

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
  }, [extractCouponCodeFromSaleItem, transactions]);

  useEffect(() => {
    setPosCartWorkspace((currentWorkspace) => {
      let nextWorkspace = currentWorkspace;

      currentWorkspace.tabs.forEach((tab) => {
        const current = tab.selectedClient;
        if (!current || current.id === 'guest' || current.id === 0) return;

        const latestMember = members.find((member) => String(member.id) === String(current.id));
        if (!latestMember) return;

        const nextClient = enrichClientWithCouponUsage({
          ...current,
          ...latestMember,
          memberNumber: latestMember.memberNumber || latestMember.member_number || current.memberNumber,
          created_at: latestMember.created_at || latestMember.createdAt || current.created_at || null,
          createdAt: latestMember.createdAt || latestMember.created_at || current.createdAt || null,
        });
        nextWorkspace = updatePosCartTab(nextWorkspace, tab.id, { selectedClient: nextClient });
      });

      return nextWorkspace;
    });
  }, [enrichClientWithCouponUsage, members]);

  const handleSelectPosClient = (client) => {
    const enrichedClient = enrichClientWithCouponUsage(client);
    setPosSelectedClient(enrichedClient);
    return enrichedClient;
  };

  const handleCreatePosClient = async (data) => {
    const createdClient = await handleAddMemberWithLog(data, { reuseExisting: true });
    if (!createdClient?.id) return null;
    return handleSelectPosClient(createdClient);
  };

  const handleCheckout = async (checkoutOptions = {}) => {
    if (isCheckoutInProgressRef.current) return;
    isCheckoutInProgressRef.current = true;
    const checkoutPosCartId = activePosCartId;
    if (blockIfOfflineReadonly('registrar ventas')) {
      isCheckoutInProgressRef.current = false;
      return;
    }
    if (ENABLE_LOGIN_AUTH_SESSION) {
      // Sin await a proposito: la venta no espera a la sesion. Se renueva de
      // fondo solo porque la bandeja de WhatsApp necesita un token de usuario.
      void recoverSecureSessionForCheckout().catch(() => {});
    }

    const merchandiseSubtotal = cart.reduce(
      (sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0),
      0,
    );
    const checkoutSaleExtras = (Array.isArray(checkoutOptions.saleExtras)
      ? checkoutOptions.saleExtras
      : []
    )
      .filter(isPosBagItem)
      .slice(0, 1)
      .map(() => createPosBagSaleItem());
    const checkoutItems = [...cart, ...checkoutSaleExtras];
    const extrasSubtotal = checkoutSaleExtras.reduce(
      (sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0),
      0,
    );
    const subtotal = merchandiseSubtotal + extrasSubtotal;
    const fallbackCheckoutTotal = selectedPayment === 'Credito'
      ? subtotal * 1.1
      : subtotal;
    const normalizedPaymentBreakdown = normalizePaymentBreakdown(
      checkoutOptions.paymentLines,
      selectedPayment,
      installments,
      checkoutOptions.cashReceived,
      checkoutOptions.cashChange,
      fallbackCheckoutTotal,
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
    const total = paymentTotals.chargedTotal || fallbackCheckoutTotal;
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
      isCheckoutInProgressRef.current = false;
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
      const checkoutItemsSnapshot = checkoutItems.map((item) => buildSaleItemSnapshot(item));

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

      const buildItemsPayload = (saleId = null) => checkoutItemsSnapshot.map(i => ({
          ...(saleId ? { sale_id: saleId } : {}),
          product_id: getSaleItemDatabaseProductId(i),
          product_title: i.title,
          quantity: i.quantity,
          price: i.price,
          subtotal: Number(i.subtotal ?? i.lineSubtotal ?? 0) || 0,
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
      const previousClientSocialConnections = getSocialConnections(posSelectedClient);
      const nextClientSocialConnections = shouldConsumeCouponOverride
        ? buildSocialConnectionsWithCouponUsageOverrides(
            previousClientSocialConnections,
            { reenabledCodes: nextCouponOverrides },
          )
        : previousClientSocialConnections;

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

      const claveDeCobro = (() => {
        const claves = checkoutOperationKeysRef.current;
        const existente = claves.get(checkoutPosCartId);
        if (existente) return existente;
        const nueva = `pos-${checkoutPosCartId || 'sin-carrito'}-${crypto.randomUUID()}`;
        claves.set(checkoutPosCartId, nueva);
        return nueva;
      })();

      let sale = await registerSaleTransactionCloud({
        operationKey: claveDeCobro,
        salePayload,
        itemsPayload: validatedItemsPayload,
        stockDeltaByProduct: checkoutStockDelta,
        clientPointUpdates: clientId
          ? [{ client_id: String(clientId), points: newPoints, expected_points: previousPoints }]
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
        void syncStockLifecycleForDeltas(checkoutStockDelta, { trackDepletion: true });
      } else {
        const { data: insertedSale, error: saleErr } = await insertWithSchemaFallback('sales', salePayload, 'id');
        if (saleErr) throw saleErr;
        sale = insertedSale;
        const itemsPayload = validatedItemsPayload.map((item) => ({ ...item, sale_id: sale.id }));
        let stockWasApplied = false;
        let clientWasUpdated = false;

        try {
          await insertRowsWithSchemaFallback('sale_items', itemsPayload);

          const stockResult = await applySaleStockDelta(checkoutStockDelta, { trackDepletion: true });
          if (stockResult.stockIssues.length > 0) {
            throw new Error(`Stock insuficiente: ${stockResult.stockIssues.join(', ')}`);
          }
          stockChanges = stockResult.stockChanges;
          stockWasApplied = true;

          if (clientId && !isLocalDemoMode()) {
            const clientUpdates = shouldConsumeCouponOverride
              ? { points: newPoints, social_connections: nextClientSocialConnections }
              : { points: newPoints };
            const { error: clientUpdateError } = await supabase.from('clients').update(clientUpdates).eq('id', clientId);
            if (clientUpdateError) {
              throw new Error(`Fallo actualizando puntos del cliente: ${clientUpdateError.message}`);
            }
            clientWasUpdated = true;
          }
        } catch (legacySaleError) {
          const rollbackErrors = [];

          if (clientWasUpdated && clientId && !isLocalDemoMode()) {
            const rollbackClientPayload = shouldConsumeCouponOverride
              ? { points: previousPoints, social_connections: previousClientSocialConnections }
              : { points: previousPoints };
            const { error: rollbackClientError } = await supabase
              .from('clients')
              .update(rollbackClientPayload)
              .eq('id', clientId);
            if (rollbackClientError) rollbackErrors.push(`puntos: ${rollbackClientError.message}`);
          }

          if (stockWasApplied) {
            const reverseStockDelta = Object.fromEntries(
              Object.entries(checkoutStockDelta).map(([id, delta]) => [id, -Number(delta || 0)]),
            );
            try {
              const rollbackStock = await applySaleStockDelta(reverseStockDelta);
              if (rollbackStock.stockIssues.length > 0) {
                rollbackErrors.push(`stock: ${rollbackStock.stockIssues.join(', ')}`);
              }
            } catch (rollbackStockError) {
              rollbackErrors.push(`stock: ${rollbackStockError.message}`);
            }
          }

          if (!isLocalDemoMode()) {
            const { error: deleteItemsError } = await supabase.from('sale_items').delete().eq('sale_id', sale.id);
            if (deleteItemsError) rollbackErrors.push(`items: ${deleteItemsError.message}`);
            const { error: deleteSaleError } = await supabase.from('sales').delete().eq('id', sale.id);
            if (deleteSaleError) rollbackErrors.push(`venta: ${deleteSaleError.message}`);
          }

          const rollbackDetail = rollbackErrors.length
            ? ` Reversion incompleta: ${rollbackErrors.join(' | ')}.`
            : '';
          throw new Error(`${legacySaleError.message}${rollbackDetail}`);
        }
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
        items: checkoutItemsSnapshot,
        status: 'completed',
        client: updatedClientForTicket || posSelectedClient, 
        pointsEarned: clientId ? pointsEarned : 0,
        pointsSpent: pointsSpent,
        pointsChange,
      };

      tx.isTest = isTestRecord(tx);
      upsertLocalTransaction(tx);

      const logItems = checkoutItemsSnapshot;

      const isGuest = !posSelectedClient || posSelectedClient.id === 'guest';
      
      void addLog('Venta Realizada', {
        transactionId: tx.id, total: total, items: logItems,
        subtotal,
        merchandiseSubtotal,
        saleExtras: checkoutSaleExtras,
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
      }, 'Venta regular').catch((logErr) => {
        console.warn('Error no bloqueante guardando log de venta en nube:', logErr);
      });
      
      setSaleSuccessModal(tx);
      checkoutOperationKeysRef.current.delete(checkoutPosCartId);
      closePosCartAfterCheckout(checkoutPosCartId);
      setPosSearch('');
      Swal.close();

    } catch (e) {
      console.error('[REBU][checkout] fallo el cobro', recordDiagnosticError('checkout', e), e);
      Swal.fire('Error', getCheckoutErrorMessage(e), 'error');
    } finally {
      isCheckoutInProgressRef.current = false;
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
    if (tx.orderId) {
      showNotification(
        'warning',
        'Venta vinculada a un pedido',
        'Cancelá el pedido desde Pedidos para revertir pagos, puntos y stock de forma consistente.',
      );
      return;
    }
    
    try {
      // ==========================================
      // 1. FLUJO DE BORRADO PERMANENTE (PURGA)
      // ==========================================
      if (tx.status === 'voided') {
        Swal.fire({ title: 'Borrando...', text: 'Eliminando registro permanentemente...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        await updateWithSchemaFallback(
          'sales',
          tx.id,
          { status: 'deleted' },
          'id',
        );
        
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
          clientPointUpdates.push({
            client_id: String(dbClient.id),
            points: newPoints,
            expected_points: previousPoints,
          });
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
        void syncStockLifecycleForDeltas(refundStockDelta);
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
    if (tx?.orderId) {
      showNotification(
        'warning',
        'Venta vinculada a un pedido',
        'Las ventas generadas por pedidos deben gestionarse desde el pedido original.',
      );
      return;
    }
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

      const restoredItemsSnapshot = (tx.items || []).map((item) => buildSaleItemSnapshot(item));
      const buildRestoredItemsPayload = (saleId = null) => restoredItemsSnapshot.map(i => {
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
              subtotal: Number(i.subtotal ?? i.lineSubtotal ?? 0) || 0,
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
          clientPointUpdates.push({
            client_id: String(clientDb.id),
            points: newPoints,
            expected_points: previousPoints,
          });
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
        void syncStockLifecycleForDeltas(restoreStockDelta, { trackDepletion: true });
      } else {
        const { data: insertedSale } = await insertWithSchemaFallback('sales', salePayload, 'id');
        newSale = insertedSale;

        const itemsPayload = restoredItemsPayload.map((item) => ({ ...item, sale_id: newSale.id }));
        if (itemsPayload.length > 0) {
            await insertRowsWithSchemaFallback('sale_items', itemsPayload);
        }

        const stockResult = await applySaleStockDelta(restoreStockDelta, { trackDepletion: true });
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
         itemsSnapshot: restoredItemsSnapshot
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
         items: restoredItemsSnapshot,
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
    if (originalTx?.orderId) {
      showNotification(
        'warning',
        'Venta vinculada a un pedido',
        'Editá el pedido original; esta venta no administra puntos de forma independiente.',
      );
      return;
    }
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
        const lineItem = {
          ...normalizedItem,
          subtotal: getSaleLineSubtotal(normalizedItem),
        };
        return buildSaleItemSnapshot(lineItem);
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
          clientPointUpdates.push({
            client_id: String(memberId),
            points: finalPoints,
            expected_points: Number(clientDb.points || 0),
          });
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
        void syncStockLifecycleForDeltas(stockDeltaByProduct, { trackDepletion: true });
      } else {
        await updateWithSchemaFallback('sales', editingTransaction.id, salePatch, 'id');

        const { error: delErr } = await supabase.from('sale_items').delete().eq('sale_id', editingTransaction.id);
        if (delErr) throw new Error("Fallo limpiando base: " + delErr.message);

        try {
          await insertRowsWithSchemaFallback('sale_items', newItemsPayload);
        } catch (insertErr) {
          throw new Error("Supabase rechazó los productos: " + insertErr.message);
        }

        const stockResult = await applySaleStockDelta(stockDeltaByProduct, { trackDepletion: true });
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
      markCloudSourceMutation('sales');
      dataStateRef.current = {
        ...dataStateRef.current,
        transactions: nextTransactionsSnapshot,
      };
      setTransactions(nextTransactionsSnapshot);
      saveOfflineTransactionsSnapshot({
        savedAt: new Date().toISOString(),
        transactions: nextTransactionsSnapshot,
        transactionsScope: transactionSnapshotScopeRef.current,
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
  const offlineNoticeStartedAt = offlineDetectedAt || offlineSnapshotAt || new Date().toISOString();
  const offlineNoticeElapsed = formatOfflineElapsed(offlineNoticeStartedAt, currentTime);
  const supplierGlobalNotice = useMemo(
    () => buildSupplierAttentionSummary(inventory),
    [inventory],
  );
  const hasSupplierGlobalNotice =
    currentUser &&
    supplierNoticeDismissalScope === supplierNoticeUserScope &&
    supplierGlobalNotice.attention > 0 &&
    dismissedSupplierNoticeKey !== supplierGlobalNotice.key;
  const operationalNotificationCount = hasSupplierGlobalNotice ? supplierGlobalNotice.attention : 0;
  const dismissSupplierGlobalNotice = useCallback(() => {
    if (!supplierGlobalNotice.key || supplierGlobalNotice.key === 'clear') return;
    setDismissedSupplierNoticeKey(supplierGlobalNotice.key);
    saveSupplierNoticeDismissal(supplierNoticeUserScope, supplierGlobalNotice.key);
  }, [supplierGlobalNotice.key, supplierNoticeUserScope]);

  useEffect(() => {
    if (!isNotificationsOpen) return undefined;
    const handlePointerDown = (event) => {
      if (!notificationsPanelRef.current?.contains(event.target)) setIsNotificationsOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsNotificationsOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isNotificationsOpen]);
  const fallbackLoginUsers = useMemo(
    () => buildLegacyUsers(USERS, userSettings),
    [userSettings],
  );

  const loginUsers = resolveLoginUsers({
    activeUsers: activeLoginUsers,
    authMode,
    legacyUsers: fallbackLoginUsers,
  });
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
    moduleLoadState.core.failedSources?.includes('productos') ||
    ['idle', 'loading'].includes(moduleLoadState.core.status) ||
    ['idle', 'loading'].includes(moduleLoadState.transactions.status);
  const isRealtimeSourceBusy = (source) =>
    ['pending', 'syncing'].includes(realtimeSourceState[source]);
  const dashboardSourceState = {
    transactions: {
      loading:
        moduleLoadState.transactions.status === 'loading' ||
        isRealtimeSourceBusy('sales'),
      stale: isDashboardSourceStale({
        status: moduleLoadState.transactions.status,
        dirty: moduleLoadState.transactions.dirty,
        cloudRefreshFailed: moduleLoadState.transactions.cloudRefreshFailed,
        snapshotComplete: transactionSnapshotScopeRef.current === TRANSACTION_SNAPSHOT_SCOPE_FULL,
        offline: isOfflineReadOnly,
      }),
    },
    expenses: {
      loading:
        moduleLoadState.dashboard.status === 'loading' ||
        isRealtimeSourceBusy('expenses'),
      stale: isDashboardSourceStale({
        status: moduleLoadState.dashboard.status,
        dirty: moduleLoadState.dashboard.dirty,
        cloudRefreshFailed: moduleLoadState.dashboard.cloudRefreshFailed,
        snapshotComplete: dashboardSnapshotScopeRef.current === DASHBOARD_SNAPSHOT_SCOPE_FULL,
        offline: isOfflineReadOnly,
      }),
    },
    inventory: {
      loading:
        moduleLoadState.core.status === 'loading' ||
        isRealtimeSourceBusy('products'),
      stale:
        ['idle', 'error'].includes(moduleLoadState.core.status) ||
        moduleLoadState.core.dirty ||
        isOfflineReadOnly,
    },
    opening: { loading: false, stale: false },
    closures: {
      loading: isRealtimeSourceBusy('closures'),
      stale: false,
    },
  };
  const isDashboardProfitSyncing =
    dashboardSourceState.transactions.loading || dashboardSourceState.expenses.loading;
  const refreshDashboardWidget = async (widgetKey, { filter = 'day' } = {}) => {
    const full = filter !== 'day';

    if (widgetKey === 'opening') return true;
    if (widgetKey === 'expenses') {
      return loadDashboardCloudData({
        force: true,
        requireCloud: true,
        full,
        includeTransactions: false,
      });
    }
    if (widgetKey === 'net') {
      return loadDashboardCloudData({
        force: true,
        requireCloud: true,
        full,
        includeTransactions: true,
      });
    }

    return loadTransactionsCloudData({
      force: true,
      requireCloud: true,
      full,
      progressive: !full,
    });
  };
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
        title: 'Modo de prueba',
        detail: 'Sin conexión al servidor',
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
        detail: isReconnectAttempting ? 'Recuperando conexión...' : 'Actualizando datos...',
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
          ? `Copia guardada: ${formatDateAR(offlineSnapshotAt)}`
          : 'Mostrando una copia guardada.',
        icon: 'offline',
      };
    }

    if (REALTIME_DEGRADED_STATUSES.has(realtimeConnectionState.status)) {
      return {
        shellClass: 'is-degraded',
        iconClass: '',
        dotClass: '',
        title: 'Datos demorados',
        detail: 'Recuperando datos...',
        icon: 'online',
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
    whatsapp: 'WhatsApp',
    history: 'Historial de Ventas',
    reports: 'Reportes de Caja',
    metrics: 'Métricas',
    logs: 'Registro de Acciones',
    sessions: 'Gestor de Sesiones',
    extras: 'Gestión de Extras',
    'bulk-editor': 'Productos',
    'ai-images': 'Estudio de imágenes IA',
    'ticket-test': 'Prueba Tickets',
    settings: 'Ajustes',
    'user-management': 'Gestión de usuarios',
  };

  if (!currentUser && (isAuthBootLoading || isCloudLoading)) return <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-100"><RefreshCw className="animate-spin text-fuchsia-600 mb-4" size={48} /><h2 className="text-xl font-bold">Cargando Nube...</h2></div>;

  if (!currentUser) {
    if (loginStep === 'password') {
      const user = selectedLoginUser;
      const isLoginSubmitting = Boolean(loginSubmitStage);
      return (
        <div className="relative flex h-screen max-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,rgba(244,114,182,0.14)_0%,rgba(255,255,255,0.94)_28%,rgba(241,245,249,1)_72%)] px-4 py-4 sm:px-6">
          <AppVersionBadge
            theme={loginTheme}
            updateStatus={appUpdateStatus}
            onCheckForUpdates={handleCheckForUpdates}
            onDownloadUpdate={handleDownloadUpdate}
            onInstallUpdate={handleInstallUpdate}
          />
          <div className="relative max-h-[calc(100vh-32px)] w-full max-w-md overflow-y-auto rounded-[28px] border border-slate-200/80 bg-white/95 p-5 shadow-[0_30px_80px_rgba(15,23,42,0.16)] backdrop-blur sm:p-6">
            <div className="mb-5 flex items-center justify-between">
              <button
                onClick={() => setLoginStep('select')}
                disabled={isLoginSubmitting}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition hover:border-slate-300 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
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
                    disabled={isLoginSubmitting}
                  />
                </label>
                {loginError && <p className="mt-2 text-center text-xs font-semibold text-red-500">{loginError}</p>}
                <button
                  type="button"
                  onClick={() => setRememberLoginSession((prev) => !prev)}
                  aria-pressed={rememberLoginSession}
                  disabled={isLoginSubmitting}
                  className={`mt-4 flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
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
                  disabled={isLoginSubmitting}
                  aria-busy={isLoginSubmitting}
                  className={`mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-black text-white transition-colors ${
                    isLoginSubmitting
                      ? 'cursor-wait bg-slate-500'
                      : 'bg-slate-900 hover:bg-slate-800'
                  }`}
                >
                  {isLoginSubmitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>{LOGIN_STAGE_LABELS[loginSubmitStage] || 'Ingresando...'}</span>
                    </>
                  ) : (
                    'Ingresar'
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="relative flex h-screen max-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,rgba(244,114,182,0.14)_0%,rgba(255,255,255,0.94)_28%,rgba(241,245,249,1)_72%)] px-4 py-4 sm:px-6">
        <AppVersionBadge
          theme={loginTheme}
          updateStatus={appUpdateStatus}
          onCheckForUpdates={handleCheckForUpdates}
          onDownloadUpdate={handleDownloadUpdate}
          onInstallUpdate={handleInstallUpdate}
        />
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
                <p className="text-sm font-black text-slate-700">
                  {appUsersLoadError ? 'No se pudieron cargar los usuarios' : 'No hay usuarios activos para ingresar'}
                </p>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  {appUsersLoadError || 'Reintentá cargar usuarios o verificá la configuración de Supabase.'}
                </p>
                <button
                  type="button"
                  onClick={handleRetryLoginUsers}
                  disabled={isRetryingLoginUsers}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-100 disabled:cursor-wait disabled:opacity-60"
                >
                  <RefreshCw size={13} className={isRetryingLoginUsers ? 'animate-spin' : ''} />
                  {isRetryingLoginUsers ? 'Cargando usuarios...' : 'Reintentar carga'}
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
                <div ref={notificationsPanelRef} className="app-notifications relative">
                  <button
                    type="button"
                    onClick={() => setIsNotificationsOpen((open) => !open)}
                    className={`app-topbar-notification ${operationalNotificationCount > 0 ? 'has-pending' : ''}`}
                    aria-label={`Notificaciones, ${operationalNotificationCount} pendiente${operationalNotificationCount === 1 ? '' : 's'}`}
                    aria-expanded={isNotificationsOpen}
                    aria-haspopup="true"
                    title="Notificaciones"
                  >
                    <Bell size={14} />
                    {operationalNotificationCount > 0 && (
                      <span aria-hidden="true" className="app-notification-badge">
                        {operationalNotificationCount}
                      </span>
                    )}
                  </button>

                  {isNotificationsOpen && (
                    <div
                      role="region"
                      aria-label="Bandeja de notificaciones"
                      className="app-notifications-panel absolute right-0 top-full mt-2 w-[372px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-slate-700/80 bg-[#0f1e33] text-slate-100 shadow-xl shadow-slate-950/30"
                    >
                      <div className="flex h-11 items-center justify-between border-b border-slate-700/70 bg-[#102139] px-3.5">
                        <div className="flex items-center gap-2">
                          <Bell size={13} className="text-slate-400" />
                          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-200">Notificaciones</p>
                        </div>
                        <span className="rounded border border-slate-700 bg-slate-950/20 px-1.5 py-1 text-[9px] font-black tabular-nums text-slate-400">
                          {operationalNotificationCount} pendiente{operationalNotificationCount === 1 ? '' : 's'}
                        </span>
                      </div>

                      {hasSupplierGlobalNotice ? (
                        <article className="relative">
                          <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-amber-300" />
                          <div className="px-4 pb-3 pt-3.5">
                            <div className="flex items-start gap-3">
                              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-amber-300/25 bg-amber-300/10 text-amber-200">
                                <AlertTriangle size={14} />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="text-[9px] font-black uppercase tracking-[0.14em] text-amber-200">Casa Alberto</p>
                                <p className="mt-0.5 text-[12px] font-black text-white">Cambios de Casa Alberto por revisar</p>
                              </div>
                              <button
                                type="button"
                                onClick={dismissSupplierGlobalNotice}
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-700 bg-slate-950/30 text-slate-400 transition hover:border-red-400/40 hover:bg-red-400/10 hover:text-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
                                title="Descartar notificación"
                                aria-label="Descartar notificación de Casa Alberto"
                              >
                                <X size={13} />
                              </button>
                            </div>

                            <div className="ml-10 mt-3 flex items-center rounded-md border border-slate-700/70 bg-slate-950/25 py-2">
                              <div className="flex flex-1 items-baseline justify-center gap-1.5 px-2">
                                <strong className="text-base font-black tabular-nums text-amber-200">{supplierGlobalNotice.changes}</strong>
                                <span className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">cambios</span>
                              </div>
                              <span aria-hidden="true" className="h-6 w-px bg-slate-700" />
                              <div className="flex flex-1 items-baseline justify-center gap-1.5 px-2">
                                <strong className={`text-base font-black tabular-nums ${supplierGlobalNotice.errors > 0 ? 'text-red-300' : 'text-emerald-300'}`}>
                                  {supplierGlobalNotice.errors}
                                </strong>
                                <span className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">errores</span>
                              </div>
                            </div>

                            <p className="ml-10 mt-2.5 text-[10px] font-bold leading-relaxed text-slate-400">
                              Hay costos del proveedor que necesitan una revisión manual antes de aplicarse.
                            </p>
                          </div>
                          <div className="flex items-center justify-end gap-2 border-t border-slate-700/70 bg-slate-950/15 px-4 py-2.5">
                            <button
                              type="button"
                              onClick={dismissSupplierGlobalNotice}
                              className="inline-flex h-8 items-center justify-center rounded-md px-3 text-[9px] font-black uppercase tracking-[0.06em] text-slate-400 transition hover:bg-slate-700/40 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                            >
                              Descartar
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveTab('bulk-editor');
                                setSupplierOpenRequest((current) => current + 1);
                                setIsNotificationsOpen(false);
                              }}
                              className="inline-flex h-8 items-center justify-center rounded-md border border-emerald-400/35 bg-emerald-400/10 px-3.5 text-[9px] font-black uppercase tracking-[0.06em] text-emerald-100 transition hover:bg-emerald-400/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                            >
                              Revisar costos
                            </button>
                          </div>
                        </article>
                      ) : (
                        <div className="px-4 py-6 text-center">
                          <CheckCircle2 size={19} className="mx-auto text-emerald-300" />
                          <p className="mt-2 text-[11px] font-black text-slate-200">No hay pendientes</p>
                          <p className="mt-1 text-[10px] font-bold text-slate-500">Los avisos operativos van a aparecer aca.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleSoftReload}
                  disabled={isSoftReloading || isForceReloading || isCloudLoading || isReconnectAttempting}
                  className="app-topbar-action"
                  title="Actualizar la información de esta pantalla"
                >
                  <RefreshCw size={12} className={isSoftReloading ? 'animate-spin' : ''} />
                  {isSoftReloading ? 'Actualizando' : 'Actualizar'}
                </button>
                <button
                  type="button"
                  onClick={handleForceReload}
                  disabled={isSoftReloading || isForceReloading || isCloudLoading || isReconnectAttempting}
                  className="app-topbar-action is-strong"
                  title="Volver a cargar todos los datos sin cerrar la aplicación"
                >
                  <RefreshCw size={12} className={isForceReloading ? 'animate-spin' : ''} />
                  {isForceReloading ? 'Cargando' : 'Cargar todo de nuevo'}
                </button>
              </div>
            </div>
          </header>
          {isOfflineReadOnly && (
            <div className="z-20 border-b border-red-950/20 bg-red-600 px-5 py-3 text-white shadow-lg shadow-red-950/20">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/25 bg-white/15">
                    <WifiOff size={21} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-red-100">
                      Modo local activo - solo lectura
                    </p>
                    <p className="mt-0.5 text-sm font-black leading-snug text-white">
                      Estás viendo datos guardados en esta computadora. No se puede cobrar ni guardar cambios hasta recuperar la conexión.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleReconnectCloud}
                  disabled={isReconnectAttempting}
                  className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-white/30 bg-white px-3 text-[11px] font-black uppercase tracking-[0.08em] text-red-700 shadow-sm transition hover:bg-red-50 disabled:cursor-wait disabled:opacity-75"
                >
                  <RefreshCw size={13} className={isReconnectAttempting ? 'animate-spin' : ''} />
                  {isReconnectAttempting ? 'Reconectando' : 'Reconectar'}
                </button>
              </div>
            </div>
          )}
          {isLocalDemoMode() && (
            <div className="flex flex-wrap items-center gap-2 border-b border-sky-200 bg-sky-50 px-5 py-2 text-[11px] font-semibold text-sky-900 shadow-sm">
              <span className="font-black uppercase tracking-[0.08em]">Modo demo local</span>
              <span className="text-sky-700">-</span>
              <span>No se lee ni se escribe en Supabase. Para salir, abrí la app con <span className="font-mono">?demo=0</span>.</span>
            </div>
          )}
          {isOfflineReadOnly && (
            <div className="pointer-events-none fixed right-5 top-28 z-[80] w-[430px] max-w-[calc(100vw-2rem)]">
              <div className="pointer-events-auto overflow-hidden rounded-xl border border-amber-300/35 bg-[#0f1e33] text-slate-100 shadow-2xl shadow-slate-950/35">
                <div className="h-1.5 bg-amber-300" />
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-amber-300/35 bg-amber-300/12 text-amber-200">
                      <WifiOff size={22} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-200">
                            Datos locales
                          </p>
                          <h3 className="mt-1 text-base font-black text-white">
                            Supabase no esta confirmado
                          </h3>
                        </div>
                      </div>
                      <p className="mt-2 text-xs font-bold leading-relaxed text-slate-300">
                        La app esta usando el ultimo snapshot local. Las ventas y cambios quedan bloqueados para evitar datos desactualizados.
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-700/70 pt-3 text-[11px] font-bold text-slate-400">
                        <span>
                          Desde <span className="text-slate-100">{formatDateAR(offlineNoticeStartedAt)} {formatTimeAR(offlineNoticeStartedAt)}</span>
                        </span>
                        <span className="h-1 w-1 rounded-full bg-slate-600" />
                        <span>
                          En local hace <span className="text-amber-100">{offlineNoticeElapsed}</span>
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={handleReconnectCloud}
                            disabled={isReconnectAttempting}
                            className="inline-flex h-8 items-center gap-2 rounded-md border border-amber-300/35 bg-amber-300/12 px-3 text-[11px] font-black uppercase tracking-[0.08em] text-amber-50 transition hover:bg-amber-300/18 disabled:cursor-wait disabled:opacity-70"
                          >
                            <RefreshCw size={13} className={isReconnectAttempting ? 'animate-spin' : ''} />
                            {isReconnectAttempting ? 'Reconectando' : 'Reconectar ahora'}
                          </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
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
              <Suspense fallback={<TabLoadingFallback />}>
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
                  sourceState={dashboardSourceState}
                  periodCoverage={{
                    transactions: transactionSnapshotScopeRef.current === TRANSACTION_SNAPSHOT_SCOPE_FULL,
                    expenses: dashboardSnapshotScopeRef.current === DASHBOARD_SNAPSHOT_SCOPE_FULL,
                  }}
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
                  onRefreshWidget={refreshDashboardWidget}
                />
              </PersistentTabPanel>
            )}
            {canAccessTab(currentUser, 'inventory') && <PersistentTabPanel tab="inventory" activeTab={activeTab} className="h-full min-h-0"><InventoryView inventory={inventory} categories={categories} currentUser={currentUser} inventoryViewMode={inventoryViewMode} setInventoryViewMode={setInventoryViewMode} gridColumns={inventoryGridColumns} setGridColumns={setInventoryGridColumns} inventorySearch={inventorySearch} setInventorySearch={setInventorySearch} inventoryCategoryFilter={inventoryCategoryFilter} setInventoryCategoryFilter={setInventoryCategoryFilter} setIsModalOpen={setIsModalOpen} setEditingProduct={handleEditProductRequest} handleDeleteProduct={handleDeleteProductRequest} setSelectedImage={setSelectedImage} setIsImageModalOpen={setIsImageModalOpen} closeDetailsToken={inventoryPanelCloseToken} navigationRequest={inventoryNavigationRequest} onProductDetailRequest={handleProductDetailRequest} onSearchInactiveProducts={handleSearchInactiveInventoryProducts} /></PersistentTabPanel>}
            <PersistentTabPanel tab="pos" activeTab={activeTab} className="h-full min-h-0">{isRegisterClosed ? (<div className="h-full flex flex-col items-center justify-center text-slate-400"><Lock size={64} className="mb-4 text-slate-300" /><h3 className="text-xl font-bold text-slate-600">Caja Cerrada</h3>{canManageRegister ? (<><p className="mb-6">Debes abrir la caja para realizar ventas.</p><button onClick={toggleRegisterStatus} className="bg-green-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-green-700">Abrir Caja</button></>) : (<p className="mb-6 text-center">Necesitas permiso para abrir la caja y realizar ventas.</p>)}</div>) : (<POSView key={activePosCartId} inventory={inventory} categories={categories} addToCart={addToCart} cart={cart} cartTabs={posCartTabs} activeCartId={activePosCartId} onAddCart={handleAddPosCart} onSelectCart={handleSelectPosCart} onCloseCart={handleClosePosCart} removeFromCart={removeFromCart} updateCartItemQty={updateCartItemQty} selectedPayment={selectedPayment} setSelectedPayment={setSelectedPayment} installments={installments} setInstallments={setInstallments} calculateTotal={calculateTotal} handleCheckout={handleCheckout} posSearch={posSearch} setPosSearch={setPosSearch} selectedCategory={posSelectedCategory} setSelectedCategory={setPosSelectedCategory} posViewMode={posViewMode} setPosViewMode={setPosViewMode} gridColumns={posGridColumns} setGridColumns={setPosGridColumns} selectedClient={posSelectedClient} setSelectedClient={setPosSelectedClient} onOpenClientModal={() => setIsClientModalOpen(true)} onOpenRedemptionModal={() => setIsRedemptionModalOpen(true)} onUpdateClient={handleUpdateMemberWithLog} offers={offers} currentUser={currentUser} userCatalog={userCatalog} />)}</PersistentTabPanel>
            {canViewWhatsApp && (
              <PersistentTabPanel tab="whatsapp" activeTab={activeTab} className="h-full min-h-0">
                <WhatsAppInboxView
                  isActive={activeTab === 'whatsapp'}
                  currentUser={currentUser}
                  inventory={inventory}
                  members={members}
                  agendaContacts={agendaContacts}
                  transactions={transactions}
                  onCreateBudget={handleCreateBudget}
                  onBudgetPdf={handleWhatsAppBudgetPdf}
                />
              </PersistentTabPanel>
            )}
            <PersistentTabPanel tab="clients" activeTab={activeTab} className="h-full min-h-0"><ClientsView members={members} addMember={handleAddMemberWithLog} updateMember={handleUpdateMemberWithLog} deleteMember={handleDeleteMemberWithLog} currentUser={currentUser} userCatalog={userCatalog} onViewTicket={handleViewTicket} onEditTransaction={handleEditTransactionRequest} onDeleteTransaction={handleDeleteTransaction} transactions={transactions} dailyLogs={dailyLogs} checkExpirations={handleCheckMemberPointExpirations} /></PersistentTabPanel>
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
            <PersistentTabPanel tab="orders" activeTab={activeTab} className="h-full min-h-0"><OrdersView budgets={budgets} orders={orders} members={members} inventory={inventory} categories={categories} offers={offers} currentUser={currentUser} userCatalog={userCatalog} isLoading={isOrdersModuleLoading && budgets.length === 0 && orders.length === 0} emptyStateMessage={ordersOfflineEmptyMessage} onCreateBudget={handleCreateBudget} onUpdateBudget={handleUpdateBudget} onUpdateOrder={handleUpdateOrder} onUpdateOrderDeposit={handleUpdateOrderDeposit} onDeleteBudget={handleDeleteBudget} onDeleteOrder={handleDeleteOrder} onConvertBudgetToOrder={handleConvertBudgetToOrder} onRegisterOrderPayment={handleRegisterOrderPayment} onCancelOrder={handleCancelOrder} onMarkOrderRetired={handleMarkOrderRetired} onPrintRecord={handlePrintOrderRecord} /></PersistentTabPanel>
            <PersistentTabPanel tab="history" activeTab={activeTab} className="h-full min-h-0">
              <HistoryView
                transactions={transactions}
                expenses={expenses}
                dailyLogs={historyLogs}
                inventory={inventory}
                currentUser={currentUser}
                userCatalog={userCatalog}
                members={members}
                isLoading={isHistoryModuleLoading && transactions.length === 0 && historyLogs.length === 0}
                emptyStateMessage={historyOfflineEmptyMessage}
                showNotification={showNotification}
                onViewTicket={handleViewTicket}
                onDeleteTransaction={handleDeleteTransaction}
                onEditTransaction={handleEditTransactionRequest}
                onRestoreTransaction={handleRestoreTransaction}
                onOpenExpenseModal={() => {
                  setExpenseToEdit(null);
                  setIsExpenseModalOpen(true);
                }}
                onViewExpense={(expense) => {
                  setExpenseToEdit(expense);
                  setIsExpenseModalOpen(true);
                }}
                setTransactions={setTransactions}
                setDailyLogs={setHistoryLogs}
                navigationRequest={historyNavigationRequest}
                onSoftReload={() => Promise.all([loadHistoryCloudData({ force: true }), loadTransactionsCloudData({ force: true, full: false })])}
                isActive={activeTab === 'history'}
                enableCloudFeed={!isLocalDemoMode() && !isOfflineReadOnly}
              />
            </PersistentTabPanel>
            {canViewReports && (<PersistentTabPanel tab="reports" activeTab={activeTab} className="h-full min-h-0"><ReportsHistoryView pastClosures={pastClosures} members={members} isLoading={isReportsModuleLoading && pastClosures.length === 0} emptyStateMessage={reportsOfflineEmptyMessage} onLoadReportDetail={fetchCashClosureDetailById} /></PersistentTabPanel>)}
            {canViewMetrics && (<PersistentTabPanel tab="metrics" activeTab={activeTab} className="h-full min-h-0"><MetricsView transactions={transactions} expenses={expenses} pastClosures={pastClosures} inventory={inventory} members={members} budgets={budgets} orders={orders} dailyLogs={dailyLogs} currentUser={currentUser} userCatalog={userCatalog} isLoading={isMetricsModuleLoading && transactions.length === 0 && expenses.length === 0 && pastClosures.length === 0} isProfitSyncing={isMetricsProfitSyncing} emptyStateMessage={metricsOfflineEmptyMessage} onRefresh={async () => { await loadCoreCloudData({ force: false }); return loadMetricsCloudData({ force: true, includeTransactions: true, full: true }); }} isActive={activeTab === 'metrics'} /></PersistentTabPanel>)}
            {canViewLogs && (<PersistentTabPanel tab="logs" activeTab={activeTab} className="h-full min-h-0"><LogsView initialLogs={dailyLogs} onUpdateLogNote={handleUpdateLogNote} onReprintPdf={handleReprintPdf} userCatalog={userCatalog} inventory={inventory} isActive={activeTab === 'logs'} /></PersistentTabPanel>)}
            {canViewSessions && (<PersistentTabPanel tab="sessions" activeTab={activeTab} className="h-full min-h-0"><SessionsView initialLogs={dailyLogs} currentSessionMeta={currentSessionMeta} userCatalog={userCatalog} /></PersistentTabPanel>)}
            <PersistentTabPanel tab="ticket-test" activeTab={activeTab} className="h-full min-h-0">
              <TicketTestView
                transactions={transactions}
                onPrintTestTicket={handlePrintTicketTest}
              />
            </PersistentTabPanel>
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
                currentUser={currentUser}
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
                onRestoreProductImage={handleRestoreProductImageVersion}
                onImageImportTaskChange={setImageImportTask}
                imageImportOpenRequest={imageImportOpenRequest}
                onSaveSupplierPriceChecks={handleSaveSupplierPriceChecks}
                onExportSupplierPriceReport={handleExportSupplierPriceReport}
                onApplySupplierPriceUpdates={handleApplySupplierPriceUpdates}
                onUndoSupplierPriceUpdates={handleUndoSupplierPriceUpdates}
                onUpdateCasaAlbertoLinks={handleUpdateCasaAlbertoLinks}
                isOfflineReadOnly={isOfflineReadOnly}
                canCreateInventory={canCreateInventory}
                canEditInventory={canEditInventory}
                supplierOpenRequest={supplierOpenRequest}
                />
              </PersistentTabPanel>
            )}
            {canViewAiImages && (
              <PersistentTabPanel tab="ai-images" activeTab={activeTab} className="h-full min-h-0">
                <AiImageStudioView currentUser={currentUser} />
              </PersistentTabPanel>
            )}
              </Suspense>
            )}
          </main>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ? ZONA DE IMPRESIÓN (SIN LÍMITES DE TAMAÑO, SOLO SE VE AL IMPRIMIR) */}
      {/* ========================================================================= */}
      <div data-print-paper-host className="hidden print:block w-full h-auto bg-white">
        {exportPdfData ? (
          <ExportPdfLayout data={exportPdfData} />
        ) : activeTab === 'ticket-test' && ticketTestPrintData ? (
          <TicketPrintLayout
            transaction={ticketTestPrintData.transaction}
            profile={ticketTestPrintData.profile}
          />
        ) : (
          <TicketPrintLayout transaction={ticketToView || saleSuccessModal} />
        )}
      </div>

      {/* --- MODALES NORMALES DE LA APP (NO SE IMPRIMEN) --- */}
      <div className="print:hidden">
        <Suspense fallback={null}>
          {notification.isOpen && <NotificationModal isOpen onClose={closeNotification} type={notification.type} title={notification.title} message={notification.message} />}
          {isOpeningBalanceModalOpen && <OpeningBalanceModal isOpen onClose={() => setIsOpeningBalanceModalOpen(false)} tempOpeningBalance={tempOpeningBalance} setTempOpeningBalance={setTempOpeningBalance} tempClosingTime={tempClosingTime} setTempClosingTime={setTempClosingTime} onSave={handleSaveOpeningBalance} />}
          {isClosingTimeModalOpen && <ClosingTimeModal isOpen onClose={() => setIsClosingTimeModalOpen(false)} closingTime={closingTime} setClosingTime={setClosingTime} onSave={handleSaveClosingTime} />}
          {isModalOpen && <AddProductModal isOpen onClose={() => { setIsModalOpen(false); }} newItem={newItem} setNewItem={setNewItem} categories={categories} onImageUpload={handleImageUpload} onAdd={handleAddItem} inventory={inventory} onDuplicateBarcode={handleDuplicateBarcodeDetected} isUploadingImage={isUploadingImage} />}
          {editingProduct && <EditProductModal product={editingProduct} onClose={() => setEditingProduct(null)} setEditingProduct={setEditingProduct} categories={categories} onImageUpload={handleImageUpload} editReason={editReason} setEditReason={setEditReason} onSave={saveEditProduct} inventory={inventory} onDuplicateBarcode={handleDuplicateBarcodeDetected} isUploadingImage={isUploadingImage} onDuplicate={handleDuplicateProduct} onDeleteProduct={(product) => { setEditingProduct(null); handleDeleteProductRequest(product); }} onRetireDeletedProduct={handleRetireDeletedProduct} currentUser={currentUser} />}
          {editingTransaction && <EditTransactionModal transaction={editingTransaction} onClose={() => setEditingTransaction(null)} inventory={inventory} members={members} offers={offers} setEditingTransaction={setEditingTransaction} transactionSearch={transactionSearch} setTransactionSearch={setTransactionSearch} addTxItem={addTxItem} removeTxItem={removeTxItem} setTxItemQty={setTxItemQty} handlePaymentChange={handleEditTxPaymentChange} editReason={editReason} setEditReason={setEditReason} onSave={handleSaveEditedTransaction} />}
          {isImageModalOpen && <ImageModal isOpen image={selectedImage} onClose={() => setIsImageModalOpen(false)} />}
          {transactionToRefund && <RefundModal transaction={transactionToRefund} onClose={() => { setTransactionToRefund(null); setRefundReason(''); }} refundReason={refundReason} setRefundReason={setRefundReason} onConfirm={handleConfirmRefund} />}
          {isClosingCashModalOpen && <CloseCashModal isOpen onClose={() => setIsClosingCashModalOpen(false)} salesCount={cycleSalesCount} totalSales={cycleTotalSales} totalExpenses={cycleTotalExpenses} cashExpenses={cycleCashExpenses} cashSales={cycleCashSales} openingBalance={openingBalance} onConfirm={handleConfirmCloseCash} />}
          {saleSuccessModal && (
            <SaleSuccessModal
              transaction={saleSuccessModal}
              onClose={() => setSaleSuccessModal(null)}
              onPrint={handlePrintTicket}
            />
          )}
          {ticketToView && (
            <TicketModal
              transaction={ticketToView}
              onClose={() => setTicketToView(null)}
              onPrint={handlePrintTicket}
            />
          )}
          {isAutoCloseAlertOpen && <AutoCloseAlertModal isOpen onClose={() => setIsAutoCloseAlertOpen(false)} closingTime={closingTime} />}
          {productToDelete && <DeleteProductModal product={productToDelete} onClose={() => { setProductToDelete(null); setDeleteProductReason(''); }} reason={deleteProductReason} setReason={setDeleteProductReason} onConfirm={confirmDeleteProduct} />}
          {barcodeNotFoundModal.isOpen && <BarcodeNotFoundModal isOpen scannedCode={barcodeNotFoundModal.code} onClose={() => setBarcodeNotFoundModal({ isOpen: false, code: '' })} onAddProduct={handleAddProductFromBarcode} />}
          {barcodeDuplicateModal.isOpen && <BarcodeDuplicateModal isOpen existingProduct={barcodeDuplicateModal.existingProduct} onClose={() => setBarcodeDuplicateModal({ isOpen: false, existingProduct: null, newBarcode: '' })} onKeepExisting={() => setBarcodeDuplicateModal({ isOpen: false, existingProduct: null, newBarcode: '' })} onReplaceBarcode={handleReplaceDuplicateBarcode} />}
          {memberIdentityPanelState.isOpen && (
            <MemberIdentityPanel
              isOpen
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
          )}
          {isExpenseModalOpen && (
            <ExpenseModal
              isOpen
              onClose={() => {
                setIsExpenseModalOpen(false);
                setExpenseToEdit(null);
              }}
              onSave={expenseToEdit ? (expenseData) => handleUpdateExpense(expenseToEdit.id, expenseData) : handleAddExpense}
              initialExpense={expenseToEdit}
              mode={expenseToEdit ? 'edit' : 'create'}
              readOnly={Boolean(expenseToEdit) && !hasPermission(currentUser, 'extras.expenses.manage')}
            />
          )}
          {detailsModalTx && (
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
          )}
        </Suspense>
      </div>
    </>
  );
}
