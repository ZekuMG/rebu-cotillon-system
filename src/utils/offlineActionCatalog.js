// Only explicit business commands may enter the journal. Session credentials,
// external messages and background jobs are deliberately outside this boundary.
const action = (label, permission, table = null, ids = () => []) => ({ label, permission, table, ids });
const firstId = (args) => [args[0]?.id ?? args[0]];
const secondId = (args) => [args[1]?.id];
const rowIds = (args) => (args[0] || []).map((row) => row.productId ?? row.product_id ?? row.product?.id ?? row.id);

export const OFFLINE_ACTION_CATALOG = {
  handleCreateFixedProduct: action('Crear producto fijo', 'inventory.create'),
  handleAddItem: action('Crear producto', 'inventory.create'),
  saveEditProduct: action('Editar producto', 'inventory.edit', 'products', secondId),
  handleRetireDeletedProduct: action('Retirar ficha de producto', 'inventory.delete', 'products', firstId),
  confirmDeleteProduct: action('Dar de baja producto', 'inventory.delete', 'products', secondId),
  handleDuplicateProduct: action('Duplicar producto', 'inventory.create', 'products', firstId),
  handleBulkSaveSingle: action('Editar producto', 'inventory.edit', 'products', firstId),
  handleBulkSaveMasive: action('Editar varios productos', 'inventory.edit', 'products', rowIds),
  handleBatchUpdateProductCategory: action('Cambiar categorías de productos', 'inventory.edit', 'products', rowIds),
  handleCreateExcelProducts: action('Crear productos de Excel', 'inventory.create'),
  handleExcelProductImport: action('Aplicar importación de Excel', 'inventory.edit', 'products', rowIds),
  handleUndoExcelProductImport: action('Deshacer importación de Excel', 'inventory.edit', 'products', rowIds),
  handleApplyProductImageImports: action('Aplicar fotos a productos', 'inventory.edit', 'products', rowIds),
  handleRestoreProductImageVersion: action('Restaurar foto de producto', 'inventory.edit', 'products', (args) => [args[0]?.productId]),
  handleSaveSupplierPriceChecks: action('Guardar revisión de proveedor', 'inventory.edit', 'products', rowIds),
  handleApplySupplierPriceUpdates: action('Actualizar costos de proveedor', 'inventory.edit', 'products', rowIds),
  handleUndoSupplierPriceUpdates: action('Deshacer costos de proveedor', 'inventory.edit', 'products', rowIds),
  handleUpdateCasaAlbertoLinks: action('Cambiar enlaces de proveedor', 'inventory.edit', 'products', (args) => args[0]?.productIds || []),
  handleCreateBudget: action('Crear presupuesto', 'orders.createBudget'),
  handleUpdateBudget: action('Editar presupuesto', 'orders.editBudget', 'budgets', firstId),
  handleDeleteBudget: action('Eliminar presupuesto', 'orders.deleteBudget', 'budgets', firstId),
  handleConvertBudgetToOrder: action('Convertir presupuesto en pedido', 'orders.createOrder', 'budgets', firstId),
  handleUpdateOrder: action('Editar pedido', 'orders.editOrder', 'orders', firstId),
  handleUpdateOrderDeposit: action('Corregir seña', 'orders.editOrder', 'orders', firstId),
  handleRegisterOrderPayment: action('Registrar pago de pedido', 'orders.registerPayment', 'orders', firstId),
  handleMarkOrderRetired: action('Marcar pedido retirado', 'orders.markRetired', 'orders', firstId),
  handleCancelOrder: action('Cancelar pedido', 'orders.cancelOrder', 'orders', firstId),
  handleDeleteOrder: action('Eliminar pedido', 'orders.deleteOrder', 'orders', firstId),
  handleAddExpense: action('Registrar gasto', 'extras.expenses.manage'),
  handleUpdateExpense: action('Editar gasto', 'extras.expenses.manage', 'expenses', firstId),
  handleAddMemberWithLog: action('Crear socio', 'clients.create'),
  handleUpdateMemberWithLog: action('Editar socio', 'clients.edit', 'clients', firstId),
  handleDeleteMemberWithLog: action('Eliminar socio', 'clients.delete', 'clients', firstId),
  handleCreateAgendaContact: action('Crear contacto', 'agenda.create'),
  handleUpdateAgendaContact: action('Editar contacto', 'agenda.edit', 'agenda_contacts', firstId),
  handleDeleteAgendaContact: action('Desactivar contacto', 'agenda.delete', 'agenda_contacts', firstId),
  handleAddOffer: action('Crear oferta', 'extras.offers.manage'),
  handleUpdateOffer: action('Editar oferta', 'extras.offers.manage', 'offers', firstId),
  handleDeleteOffer: action('Eliminar oferta', 'extras.offers.manage', 'offers', firstId),
  handleAddReward: action('Crear premio', 'extras.rewards.manage'),
  handleUpdateReward: action('Editar premio', 'extras.rewards.manage', 'rewards', firstId),
  handleDeleteReward: action('Eliminar premio', 'extras.rewards.manage', 'rewards', firstId),
  handleAddCategoryFromView: action('Crear categoría', 'extras.categories.manage'),
  handleDeleteCategoryFromView: action('Eliminar categoría', 'extras.categories.manage'),
  handleEditCategory: action('Renombrar categoría', 'extras.categories.manage'),
  handleSaveOpeningBalance: action('Abrir caja', 'register.manage', 'register_state', () => [1]),
  handleSaveClosingTime: action('Cambiar horario de cierre', 'register.manage', 'register_state', () => [1]),
  executeRegisterClose: action('Cerrar caja', 'register.manage', 'register_state', () => [1]),
  handleConfirmRefund: action('Anular venta', 'history.voidSale', 'sales', (args) => [args[1]?.id]),
  handleRestoreTransaction: action('Restaurar venta', 'history.restoreSale', 'sales', firstId),
  handleSaveEditedTransaction: action('Editar venta', 'history.editSale', 'sales', secondId),
  handleUpdateLogNote: action('Editar nota del registro', 'logs.editNotes', 'logs', firstId),
  offlineSale: action('Registrar venta', 'pos.view'),
};

const fields = {
  products: ['id', 'title', 'price', 'purchasePrice', 'stock', 'category', 'barcode', 'image', 'imageThumb', 'product_type', 'expiration_date', 'isActive', 'supplierLinks', 'updated_at'],
  clients: ['id', 'name', 'memberNumber', 'dni', 'phone', 'email', 'extraInfo', 'socialConnections', 'points', 'is_active'],
  agenda_contacts: ['id', 'name', 'phone', 'email', 'address', 'notes', 'contactType', 'taxId', 'contactPerson', 'isActive', 'updatedAt'],
  expenses: ['id', 'description', 'amount', 'category', 'paymentMethod', 'paymentBreakdown', 'expenseDate'],
  offers: ['id', 'name', 'type', 'applyTo', 'productsIncluded', 'itemsCount', 'discountValue', 'offerPrice', 'profitMargin'],
  rewards: ['id', 'title', 'description', 'pointsCost', 'type', 'discountAmount', 'stock', 'isActive'],
  budgets: ['id', 'status', 'isActive', 'itemsSnapshot', 'totalAmount', 'memberId', 'customerName', 'customerPhone', 'customerNote', 'documentTitle', 'eventLabel', 'paymentBreakdown', 'createdAt'],
  orders: ['id', 'version', 'status', 'isActive', 'itemsSnapshot', 'totalAmount', 'paidTotal', 'depositAmount', 'remainingAmount', 'paymentHistory', 'memberId', 'customerName', 'customerPhone', 'customerNote', 'pickupDate'],
  sales: ['id', 'total', 'status', 'items', 'paymentBreakdown', 'payment', 'clientId', 'createdAt', 'voidedAt'],
  register_state: ['isRegisterClosed', 'openingBalance', 'closingTime', 'registerOpenedAt'],
  logs: ['id', 'reason'],
};

export const projectOfflineTarget = (table, record) => record == null ? null
  : Object.fromEntries((fields[table] || Object.keys(record)).map((key) => [key, record[key] ?? null]));

export const getOfflineActionSummary = (type, args) => {
  if (type === 'offlineSale') {
    const attempt = args[0];
    return `${attempt.logDetails.items.map((item) => `${item.quantity ?? item.qty ?? 1} × ${item.title}`).join(', ')} · $${Number(attempt.request.salePayload.total).toLocaleString('es-AR')}`;
  }
  const strings = [];
  const visit = (item, depth = 0) => {
    if (depth > 2 || strings.length >= 5 || item == null) return;
    if (typeof item === 'string' || typeof item === 'number') { strings.push(String(item)); return; }
    if (Array.isArray(item)) { item.slice(0, 3).forEach((value) => visit(value, depth + 1)); return; }
    const keys = ['title', 'name', 'description', 'amount', 'totalAmount', 'price', 'stock', 'reason', 'note'];
    keys.filter((key) => item[key] !== undefined && item[key] !== '').forEach((key) => visit(item[key], depth + 1));
  };
  args.forEach((arg) => visit(arg));
  return strings.join(' · ').slice(0, 500) || 'Acción guardada para confirmar';
};
