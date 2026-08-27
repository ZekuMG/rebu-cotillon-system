# Dashboard Context

Last reviewed: 2026-08-09.

This document is a working map for future Codex/AI changes to the Rebu dashboard. Use it before modifying dashboard UI, data flows, filters, permissions, or Supabase-backed dashboard behavior.

## Entry Points

- `src/App.jsx`: owns Supabase/offline loading, global app state, tab navigation, modal state, and passes data/handlers into the dashboard.
- `src/views/DashboardView.jsx`: orchestrates the dashboard screen, filters test records, manages local widget layout, permissions, and renders active widgets.
- `src/hooks/useDashboardData.js`: computes the dashboard data model from transactions, logs, inventory, expenses, ranking options, and the selected time filter.
- `src/components/dashboard/index.js`: barrel export for dashboard components.

## Data Flow

1. `App.jsx` loads cloud/offline data.
2. `DashboardView` receives `transactions`, `dailyLogs`, `inventory`, `expenses`, `currentUser`, and handlers from `App.jsx`.
3. `DashboardView` removes test records with `isTestRecord` before metrics are calculated.
4. `useDashboardData` derives KPIs, payment totals, rankings, alert lists, filtered sales, and filtered expenses.
5. `DashboardView` renders top KPI cards and lower widgets.
6. Widget interactions call handlers from `App.jsx` to navigate, open global modals, or show transaction details.

## Supabase And Offline Loading

Dashboard cloud loading is handled in `App.jsx` by `loadDashboardCloudData`.

Important functions:

- `fetchDashboardCloudPayload`: loads `logs`, `expenses`, and `cash_closures`.
- `fetchRecentDashboardCloudPayload`: loads recent dashboard records for lighter refreshes.
- `fetchDashboardCloudPayloadSince`: incremental sync based on latest `created_at`.
- `applyDashboardPayload`: applies daily logs, expenses, and cash closures to React state.
- `loadOfflineDashboardSnapshot` / `saveOfflineDashboardSnapshot`: read/write local dashboard snapshots.

`loadDashboardCloudData` calls `loadTransactionsCloudData` by default because profit and activity metrics need both sources. It accepts `includeTransactions: false` for expense-only widget refreshes; do not couple an expense refresh back to the complete sales history.

Transaction snapshots include `transactionsScope: 'full'` only after a successful paginated load of the complete sales table. Legacy snapshots or snapshots without that marker are treated as partial and must be backfilled once before incremental synchronization is allowed. Never infer completeness from the presence or number of locally cached transactions; doing so can leave older gaps permanently hidden from week, month, and year metrics.

Complete chronological reads for `sales`, sale-history `logs`, `expenses`, and `cash_closures` paginate by the numeric primary-key cursor instead of deep `range` offsets. After every complete read, `sortCloudRowsNewestFirst` restores the established `created_at desc, id desc` order before records are mapped or persisted. Keep the empty-page termination rule because the Data API may return fewer rows than requested, and never mark a snapshot as complete if cursor pagination cannot advance.

Transaction and dashboard cloud requests run inside a 30-second abortable attempt. A fast recoverable network failure may retry once; a timeout aborts the whole attempt and falls back to the existing local snapshot instead of leaving the module promise locked. Every Supabase page and schema-fallback retry must receive the same `AbortSignal`.

Complete replacement loads also capture per-source mutation versions before paging. Realtime events and local writes increment the corresponding version (`sales`, `logs`, `expenses`, or `closures`). If a source changes while the snapshot is being assembled, the complete read is repeated once; if it changes again, keep the current local state, leave the module dirty, and never persist or label that result as a complete snapshot.

Sale-history logs are conditionally critical. Current sale rows that already contain all payment, user, status, voiding, item subtotal/cost, and item-type fields can load without logs. Legacy or incomplete sale rows require logs for reconstruction; if that log query fails, the transaction/metrics payload is incomplete and must retain the cached data rather than mapping partial sales.

Realtime updates are coordinated in `App.jsx` through one Supabase channel:

- Sales notifications are batched by sale ID and reloaded with their items/history context before updating transactions.
- Expenses, products, clients, closures, logs, and register state are reconciled directly by record ID for INSERT, UPDATE, and DELETE events.
- Categories, offers, rewards, and agenda contacts use a debounced core reload as a compatibility fallback.
- Channel and heartbeat failures mark cloud-backed modules dirty. A successful reconnect forces a catch-up of the visible module.
- Updated state is also debounced into the corresponding offline snapshot.

`DashboardView` receives `sourceState` and `periodCoverage` from `App.jsx`. `getDashboardWidgetDataState` maps only the six top KPI cards to their required sources (`transactions` or `expenses`). Top KPIs always retain their normal card and current figure: loading animates only the result, while a stale idle KPI exposes a small refresh control in its header. A failed cloud refresh keeps the cached value visible, marks the source stale, and leaves the retry control available. Lower operational widgets remain visible and do not receive this state treatment.

The `day` filter may use a verified recent/partial snapshot: it does not require complete historical scope. Its automatic progressive load must not hydrate the complete transaction history from IndexedDB. Hydrate that heavier cache only for a non-progressive consumer such as Clients/History, or when a full transaction range is explicitly requested. The `week`, `month`, and `year` filters require full coverage only for the sources used by each widget. For example, an expenses widget does not wait for transaction history, while net profit requires both sources.

Do not automatically backfill the complete dashboard when entering the view or switching periods. A stale top KPI exposes a compact refresh button and calls `onRefreshWidget(widgetKey, { filter })`. `App.jsx` then refreshes only the needed module: transaction-backed cards load transactions, expenses load dashboard records without transactions, and net profit loads both. Concurrent requests reuse an in-flight load when it already covers the requested scope; widgets backed by the same source cannot start duplicate targeted refreshes. Only the explicitly refreshed KPI receives the targeted loading animation, while unrelated Realtime/module activity remains visible on its own KPI.

If offline mode has no dashboard snapshot and no local dashboard data, `dashboardOfflineEmptyMessage` is passed to `DashboardView`.

## Active Dashboard State

`DashboardView` manages:

- `globalFilter`: `day`, `week`, `month`, or `year`, constrained by `getAllowedDashboardFilters(currentUser)`.
- `rankingMode`: `products`, `weight`, or `categories`.
- `rankingCriteria`: `revenue` or `qty`.
- `widgetOrder`: bottom widget order, stored in `localStorage` as `party_dashboard_order_bottom`.
- `topWidgetOrder`: top KPI order, stored in `localStorage` as `party_dashboard_order_top`.
- `hasUnsavedChanges`: whether drag-and-drop layout differs from saved layout.
- `visibleActivityCount` / `visibleLogsCount`: batch counts for scroll feeds.
- `showActivityExpenses`: whether expenses are included in the financial activity feed.
- `isActivityDateMenuOpen`: compact date jump menu for week/month/year activity sections.

Default top order:

- `sales`
- `revenue`
- `net`
- `opening`
- `average`
- `expenses`

Default bottom order:

- `payments`
- `topProducts`
- `lowStock`
- `financialActivity`

Retired bottom widgets are normalized away:

- `chart`
- `expirations`
- `systemLogs`

There is also a legacy migration from `activityPanel` to `financialActivity`.

## Data Model From `useDashboardData`

Main outputs:

- `kpiStats`: gross revenue, net profit, cost, expenses, and sale count.
- `averageTicket`: gross revenue divided by sale count.
- `paymentStats`: total per configured payment method.
- `rankingStats`: top products, weighted products, or categories.
- `lowStockProducts`: products with `stock < 10`.
- `expiringProducts`: products with `expiration_date` within 14 days, including already expired.
- `filteredData`: filtered transactions for the selected time period.
- `filteredExpenses`: filtered expenses for the selected time period.

Profit handling:

- Transaction cost is rebuilt from sale items and stock changes using inventory lookups.
- Net profit is revenue minus product cost minus expenses.
- `DashboardView` flags profit as pending or unverified when sales exist but costs are missing.

## Active Components

### `KpiCard`

File: `src/components/dashboard/KpiCards.jsx`.

Renders top metric cards based on `widgetKey`:

- `sales`: sale count for the selected period.
- `revenue`: gross revenue.
- `net`: net profit, with pending/unverified states.
- `opening`: initial cash/register balance.
- `average`: average ticket.
- `expenses`: total expenses in the selected period.

Actions:

- `opening` opens the opening balance modal if the user has `register.manage`.
- `expenses` opens the expense modal if the user has `extras.expenses.manage`.

### `PaymentBreakdown`

File: `src/components/dashboard/PaymentBreakdown.jsx`.

Shows payment method totals and percentage bars for the selected period. Receives `paymentStats`, `totalGross`, and `globalFilter`.

### `TopRanking`

File: `src/components/dashboard/TopRanking.jsx`.

Shows top sales by:

- unit products
- weight products
- categories

Ranking can be sorted by:

- quantity
- revenue

Click flow:

- For categories, tries to navigate to History with category filter if allowed.
- Otherwise falls back to Inventory category search if allowed.
- For product entries, tries History search first, then Inventory search when allowed.

### `LowStockAlert`

File: `src/components/dashboard/LowStockAlert.jsx`.

Shows two tabs:

- `Agotados`: products filtered locally to `stock <= 0`.
- `Vencidos`: products expired or about to expire.

Important nuance:

- `useDashboardData` passes products with `stock < 10`, but `LowStockAlert` only displays `stock <= 0` in the stock tab.

Uses `useIncrementalFeed` for batched scrolling.

Click flow:

- Summary badges call `onAlertClick('out_of_stock')` or `onAlertClick('expirations')`.
- Product rows call `onAlertClick({ type: 'product', product, alertType })`.
- `App.jsx` handles this through `handleDashboardAlertClick` and navigates to Inventory.

### `GlobalTimeSwitch`

File: `src/components/dashboard/DashboardControls.jsx`.

Displays allowed filters only:

- day
- week
- month
- year

Allowed filters come from dashboard permissions:

- `dashboard.filter.day`
- `dashboard.filter.week`
- `dashboard.filter.month`
- `dashboard.filter.year`

### `LayoutManagerControls`

File: `src/components/dashboard/DashboardControls.jsx`.

Visible only when:

- current user has owner/admin access, and
- dashboard layout has unsaved changes.

Actions:

- save layout to `localStorage`
- restore default layout

### `financialActivity`

Defined inline inside `DashboardView.renderWidget`.

Combines:

- filtered sales from `filteredData`
- filtered expenses from `filteredExpenses`

It sorts all entries by time descending. Sales are clickable and open the transaction detail modal through `onViewTransaction`.

Expenses are controlled by a compact `Gastos` switch in the widget header. Expense rows are clickable and open `ExpenseModal` in edit/read-only mode through `onViewExpense`.

Expense dates must be resolved from robust sources such as `metricDate`, `createdAt`, `created_at`, or `parseMetricDate`. Do not rebuild dates by manually interpolating `DD/MM/YY` strings into `new Date(...)`.

For `week`, `month`, and `year`, the period badge opens a date menu based on dates present in the activity feed. Selecting a date scrolls only the widget's internal activity container to that section. If the section has not been rendered yet by batching, `visibleActivityCount` is increased before scrolling.

The widget has an internal infinite scroll with batch size `DASHBOARD_FEED_BATCH = 50`.

## Existing But Not Active

These components exist but are not mounted in the current dashboard layout:

- `src/components/dashboard/SalesChart.jsx`
- `src/components/dashboard/ExpirationAlert.jsx`

`SalesChart` no longer receives support data from `useDashboardData`; `chart` is in the retired widget set and is normalized out of saved layouts.

`ExpirationAlert` was effectively superseded by `LowStockAlert`.

## Navigation And Interaction Flows

### Dashboard To Inventory

Defined in `App.jsx` as `navigateToInventoryFromDashboard`.

It sets:

- `inventoryCategoryFilter`
- `inventorySearch`
- `inventoryNavigationRequest`
- active tab: `inventory`

Used by:

- alert badges and alert product rows
- ranking fallback navigation

### Dashboard To History

Defined in `App.jsx` as `navigateToHistoryFromDashboard`.

It sets:

- `historyNavigationRequest`
- active tab: `history`

Used by:

- top ranking product/category clicks when History permission is available.

### Transaction Detail

`financialActivity` calls `onViewTransaction(tx)`. In `App.jsx`, this sets `detailsModalTx`, which opens `TransactionDetailModal`.

### Expense Creation

`KpiCard` with `widgetKey='expenses'` calls `onOpenExpenseModal`. In `App.jsx`, this opens `ExpenseModal`.

### Expense Editing

`financialActivity` expense rows call `onViewExpense(expense)`. In `App.jsx`, this sets `expenseToEdit` and opens `ExpenseModal`.

`ExpenseModal` supports:

- `create` mode for new expenses.
- `edit` mode for existing expenses.
- read-only edit mode when the current user lacks `extras.expenses.manage`.

Expense updates are handled by `handleUpdateExpense`, which uses `updateWithSchemaFallback('expenses', id, payload, CLOUD_SELECTS.expenses)`, updates local `expenses`, updates `dataStateRef.current.expenses`, and logs `Gasto Editado`.

### Opening Balance

`KpiCard` with `widgetKey='opening'` calls:

- `setTempOpeningBalance(String(openingBalance))`
- `setIsOpeningBalanceModalOpen(true)`

The actual modal is owned by `App.jsx`.

## Permissions To Check Before Modifying

Dashboard access:

- `dashboard.view`

Dashboard filters:

- `dashboard.filter.day`
- `dashboard.filter.week`
- `dashboard.filter.month`
- `dashboard.filter.year`

Related dashboard actions:

- `register.manage`: edit opening balance / manage register.
- `extras.expenses.manage`: create dashboard expenses.
- `history.view`: allow ranking/history navigation.
- `inventory.view`: allow ranking/alert inventory navigation.

Owner/admin layout controls use `hasOwnerAccess(currentUser)`.

## Design Context

Before changing dashboard UI, read `.interface-design/system.md`.

Current design intent:

- operative counter
- compact and readable
- cash/register work first
- subtle borders and surface shifts
- cold paper/light mode surfaces
- blue-night/dark mode surfaces
- Rebu fuchsia as identity accent

Avoid turning dashboard widgets into generic oversized marketing cards. Keep density and scanability.

## Modification Notes For Future AI

- Do not assume `SalesChart` is active just because it is exported.
- Do not reintroduce retired widget keys without checking saved-layout migration.
- Keep `localStorage` layout keys backward-compatible when changing widget identifiers.
- When changing metrics, inspect `useDashboardData` and `src/utils/salesMetricsCore.js`.
- When changing Supabase dashboard data, inspect `CLOUD_SELECTS`, mapper functions, offline snapshots, and schema fallback utilities.
- Keep Realtime reconciliation ID-based. Do not depend on `created_at` to detect UPDATE or DELETE events.
- Preserve targeted sale refreshes and the trailing-batch behavior in `createRealtimeIdBatcher`; they prevent dropped events during bursts.
- Treat Realtime as an invalidation/update signal, not as the only source of truth. Recovery must retain a forced REST catch-up path.
- Preserve the annual full-transaction reload path from dashboard `year` filter unless another complete-data strategy replaces it.
- Preserve test-record filtering before calculations.
- If adding a new widget, update default order, normalization, layout persistence, and `renderWidget`.
- If adding a new KPI, update `DEFAULT_TOP_ORDER`, `KpiCard`, and saved-layout migration behavior.
