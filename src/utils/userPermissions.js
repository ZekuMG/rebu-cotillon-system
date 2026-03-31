const normalizeRole = (value) => {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

  if (['system', 'sistema', 'admin'].includes(normalized)) return 'system';
  if (['owner', 'dueno', 'duenio'].includes(normalized)) return 'owner';
  if (['seller', 'vendedor', 'caja'].includes(normalized)) return 'seller';
  return 'seller';
};

export const APP_PERMISSION_GROUPS = [
  {
    id: 'dashboard',
    label: 'Control de Caja',
    viewKey: 'dashboard.view',
    actions: [
      { key: 'register.manage', label: 'Abrir / cerrar caja' },
      { key: 'dashboard.filter.day', label: 'Ver filtro diario' },
      { key: 'dashboard.filter.week', label: 'Ver filtro semanal' },
      { key: 'dashboard.filter.month', label: 'Ver filtro mensual' },
      { key: 'dashboard.filter.year', label: 'Ver filtro anual' },
    ],
  },
  {
    id: 'inventory',
    label: 'Inventario',
    viewKey: 'inventory.view',
    actions: [
      { key: 'inventory.create', label: 'Crear productos' },
      { key: 'inventory.edit', label: 'Editar productos' },
      { key: 'inventory.delete', label: 'Eliminar productos' },
    ],
  },
  {
    id: 'pos',
    label: 'Punto de Venta',
    viewKey: 'pos.view',
    actions: [],
  },
  {
    id: 'clients',
    label: 'Socios',
    viewKey: 'clients.view',
    actions: [
      { key: 'clients.create', label: 'Crear socios' },
      { key: 'clients.edit', label: 'Editar socios' },
      { key: 'clients.delete', label: 'Eliminar socios' },
    ],
  },
  {
    id: 'agenda',
    label: 'Agenda',
    viewKey: 'agenda.view',
    actions: [
      { key: 'agenda.create', label: 'Crear contactos' },
      { key: 'agenda.edit', label: 'Editar contactos' },
      { key: 'agenda.delete', label: 'Desactivar contactos' },
    ],
  },
  {
    id: 'orders',
    label: 'Pedidos',
    viewKey: 'orders.view',
    actions: [
      { key: 'orders.createBudget', label: 'Crear presupuestos' },
      { key: 'orders.editBudget', label: 'Editar presupuestos' },
      { key: 'orders.deleteBudget', label: 'Eliminar presupuestos' },
      { key: 'orders.createOrder', label: 'Convertir a pedido' },
      { key: 'orders.editOrder', label: 'Editar pedidos' },
      { key: 'orders.cancelOrder', label: 'Cancelar pedidos' },
      { key: 'orders.deleteOrder', label: 'Eliminar pedidos' },
      { key: 'orders.markRetired', label: 'Marcar retirado' },
      { key: 'orders.registerPayment', label: 'Registrar pagos' },
    ],
  },
  {
    id: 'history',
    label: 'Historial de Ventas',
    viewKey: 'history.view',
    actions: [
      { key: 'history.editSale', label: 'Editar ventas' },
      { key: 'history.voidSale', label: 'Anular ventas' },
      { key: 'history.restoreSale', label: 'Restaurar ventas' },
      { key: 'history.deleteSale', label: 'Eliminar ventas' },
    ],
  },
  {
    id: 'reports',
    label: 'Reportes de Caja',
    viewKey: 'reports.view',
    actions: [],
  },
  {
    id: 'logs',
    label: 'Registro de Acciones',
    viewKey: 'logs.view',
    actions: [
      { key: 'logs.reprintPdf', label: 'Reimprimir PDF' },
      { key: 'logs.editNotes', label: 'Editar notas' },
    ],
  },
  {
    id: 'sessions',
    label: 'Gestor de Sesiones',
    viewKey: 'sessions.view',
    actions: [],
  },
  {
    id: 'extras',
    label: 'Extras',
    viewKey: 'extras.view',
    actions: [
      { key: 'extras.categories.manage', label: 'Gestionar categorías' },
      { key: 'extras.offers.manage', label: 'Gestionar ofertas' },
      { key: 'extras.rewards.manage', label: 'Gestionar premios' },
      { key: 'extras.expenses.manage', label: 'Gestionar gastos' },
    ],
  },
  {
    id: 'bulk-editor',
    label: 'Productos (Avanzado)',
    viewKey: 'bulkEditor.view',
    actions: [],
  },
  {
    id: 'user-management',
    label: 'Gestión de usuarios',
    viewKey: 'userManagement.view',
    actions: [
      { key: 'userManagement.createUsers', label: 'Crear usuarios' },
      { key: 'userManagement.editProfiles', label: 'Editar perfiles' },
      { key: 'userManagement.toggleActive', label: 'Activar / desactivar' },
      { key: 'userManagement.permissions.editSeller', label: 'Editar permisos de caja' },
      { key: 'userManagement.permissions.editOwner', label: 'Editar permisos de dueños' },
    ],
  },
];

export const APP_TAB_PERMISSION_MAP = {
  dashboard: 'dashboard.view',
  inventory: 'inventory.view',
  pos: 'pos.view',
  clients: 'clients.view',
  agenda: 'agenda.view',
  orders: 'orders.view',
  history: 'history.view',
  reports: 'reports.view',
  logs: 'logs.view',
  sessions: 'sessions.view',
  extras: 'extras.view',
  'bulk-editor': 'bulkEditor.view',
  'user-management': 'userManagement.view',
};

export const APP_PERMISSION_KEYS = APP_PERMISSION_GROUPS.flatMap((group) => [
  group.viewKey,
  ...group.actions.map((action) => action.key),
]);

export const DASHBOARD_FILTER_PERMISSION_KEYS = [
  'dashboard.filter.day',
  'dashboard.filter.week',
  'dashboard.filter.month',
  'dashboard.filter.year',
];

const buildAllFalsePermissions = () =>
  Object.fromEntries(APP_PERMISSION_KEYS.map((key) => [key, false]));

const buildAllTruePermissions = () =>
  Object.fromEntries(APP_PERMISSION_KEYS.map((key) => [key, true]));

const SELLER_PRESET = {
  ...buildAllFalsePermissions(),
  'dashboard.view': true,
  'dashboard.filter.day': true,
  'dashboard.filter.week': true,
  'dashboard.filter.month': true,
  'dashboard.filter.year': true,
  'inventory.view': true,
  'clients.view': true,
  'clients.create': true,
  'clients.edit': true,
  'clients.delete': true,
  'agenda.view': true,
  'orders.view': true,
  'orders.createBudget': true,
  'orders.editBudget': true,
  'orders.deleteBudget': true,
  'orders.createOrder': true,
  'orders.editOrder': true,
  'orders.cancelOrder': true,
  'orders.deleteOrder': true,
  'orders.markRetired': true,
  'orders.registerPayment': true,
  'history.view': true,
  'pos.view': true,
  'extras.view': true,
};

const OWNER_PRESET = {
  ...buildAllFalsePermissions(),
  'dashboard.view': true,
  'register.manage': true,
  'dashboard.filter.day': true,
  'dashboard.filter.week': true,
  'dashboard.filter.month': true,
  'dashboard.filter.year': true,
  'inventory.view': true,
  'inventory.create': true,
  'inventory.edit': true,
  'inventory.delete': true,
  'clients.view': true,
  'clients.create': true,
  'clients.edit': true,
  'clients.delete': true,
  'agenda.view': true,
  'agenda.create': true,
  'agenda.edit': true,
  'agenda.delete': true,
  'orders.view': true,
  'orders.createBudget': true,
  'orders.editBudget': true,
  'orders.deleteBudget': true,
  'orders.createOrder': true,
  'orders.editOrder': true,
  'orders.cancelOrder': true,
  'orders.deleteOrder': true,
  'orders.markRetired': true,
  'orders.registerPayment': true,
  'history.view': true,
  'history.editSale': true,
  'history.voidSale': true,
  'history.restoreSale': true,
  'history.deleteSale': true,
  'reports.view': true,
  'logs.view': true,
  'logs.reprintPdf': true,
  'logs.editNotes': true,
  'sessions.view': true,
  'extras.view': true,
  'extras.categories.manage': true,
  'extras.offers.manage': true,
  'extras.rewards.manage': true,
  'extras.expenses.manage': true,
  'bulkEditor.view': true,
  'pos.view': true,
  'userManagement.view': true,
  'userManagement.permissions.editSeller': true,
};

const SYSTEM_PRESET = buildAllTruePermissions();

export const sanitizePermissionSet = (permissions = {}) => {
  const next = Object.fromEntries(
    APP_PERMISSION_KEYS.map((key) => [key, Boolean(permissions[key])]),
  );

  if (!next['dashboard.view']) {
    DASHBOARD_FILTER_PERMISSION_KEYS.forEach((key) => {
      next[key] = false;
    });
    return next;
  }

  if (!DASHBOARD_FILTER_PERMISSION_KEYS.some((key) => next[key])) {
    next['dashboard.filter.day'] = true;
  }

  return next;
};

export const getRolePresetPermissions = (role) => {
  const normalizedRole = normalizeRole(role);
  if (normalizedRole === 'system') return sanitizePermissionSet({ ...SYSTEM_PRESET });
  if (normalizedRole === 'owner') return sanitizePermissionSet({ ...OWNER_PRESET });
  return sanitizePermissionSet({ ...SELLER_PRESET });
};

export const normalizePermissionsOverride = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const next = {};
  APP_PERMISSION_KEYS.forEach((key) => {
    if (key in value) {
      next[key] = Boolean(value[key]);
    }
  });
  return next;
};

export const buildPermissionsOverride = (role, effectivePermissions = {}) => {
  const preset = getRolePresetPermissions(role);
  const sanitizedEffectivePermissions = sanitizePermissionSet(effectivePermissions);
  const next = {};

  APP_PERMISSION_KEYS.forEach((key) => {
    const effectiveValue = Boolean(sanitizedEffectivePermissions[key]);
    const presetValue = Boolean(preset[key]);
    if (effectiveValue !== presetValue) {
      next[key] = effectiveValue;
    }
  });

  return next;
};

export const getEffectivePermissions = (userOrRole, overrideArg = null) => {
  const role =
    typeof userOrRole === 'string'
      ? normalizeRole(userOrRole)
      : normalizeRole(userOrRole?.role);
  const override =
    overrideArg && typeof overrideArg === 'object'
      ? normalizePermissionsOverride(overrideArg)
      : normalizePermissionsOverride(userOrRole?.permissionsOverride || userOrRole?.permissions_override);

  return sanitizePermissionSet({
    ...getRolePresetPermissions(role),
    ...override,
  });
};

export const hasPermission = (user, permissionKey) => {
  if (!permissionKey) return true;
  const effectivePermissions = user?.effectivePermissions || getEffectivePermissions(user);
  return Boolean(effectivePermissions?.[permissionKey]);
};

export const canAccessTab = (user, tabKey) => {
  if (tabKey === 'settings') return true;
  const permissionKey = APP_TAB_PERMISSION_MAP[tabKey];
  if (!permissionKey) return true;
  return hasPermission(user, permissionKey);
};

export const getDefaultTabForUser = (user) => {
  const priority = ['dashboard', 'pos', 'inventory', 'clients', 'agenda', 'orders', 'history', 'extras', 'reports', 'logs', 'sessions', 'bulk-editor', 'user-management'];
  return priority.find((tabKey) => canAccessTab(user, tabKey)) || 'settings';
};

export const getPermissionSummary = (permissions = {}) => {
  const visibleTabs = APP_PERMISSION_GROUPS.filter((group) => permissions[group.viewKey]).map((group) => group.label);
  const enabledActions = APP_PERMISSION_GROUPS.flatMap((group) =>
    group.actions.filter((action) => permissions[action.key]).map((action) => action.label),
  );

  return {
    visibleTabs,
    enabledActions,
  };
};

export const DASHBOARD_FILTER_OPTIONS = [
  { id: 'day', permissionKey: 'dashboard.filter.day', label: 'Diario' },
  { id: 'week', permissionKey: 'dashboard.filter.week', label: 'Semanal' },
  { id: 'month', permissionKey: 'dashboard.filter.month', label: 'Mensual' },
  { id: 'year', permissionKey: 'dashboard.filter.year', label: 'Anual' },
];

export const getAllowedDashboardFilters = (user) =>
  DASHBOARD_FILTER_OPTIONS.filter((option) => hasPermission(user, option.permissionKey)).map((option) => option.id);

export const canManageUserPermissions = (actorUser, targetUser) => {
  const actorRole = normalizeRole(actorUser?.role);
  const targetRole = normalizeRole(targetUser?.role);

  if (!actorUser || !targetUser || targetRole === 'system') return false;
  if (actorRole === 'system') return targetRole === 'owner' || targetRole === 'seller';
  if (actorRole === 'owner') return targetRole === 'seller' && hasPermission(actorUser, 'userManagement.permissions.editSeller');
  return false;
};

export const canEditUserProfile = (actorUser, targetUser) =>
  normalizeRole(actorUser?.role) === 'system' &&
  normalizeRole(targetUser?.role) !== 'system' &&
  hasPermission(actorUser, 'userManagement.editProfiles');

export const canToggleUserActiveState = (actorUser, targetUser) =>
  normalizeRole(actorUser?.role) === 'system' &&
  normalizeRole(targetUser?.role) !== 'system' &&
  hasPermission(actorUser, 'userManagement.toggleActive');
