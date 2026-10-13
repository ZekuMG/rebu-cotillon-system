// Tipos de gasto para leer el resultado del negocio. La compra de mercadería se carga como
// gasto, así que restarla junto con el costo de lo vendido la contaría dos veces; y los
// retiros/préstamos salen del negocio pero no son un costo de operar.

// Valores que se guardan en expenses.category (texto libre en la base).
export const EXPENSE_CATEGORY_OPTIONS = [
  'Proveedores',
  'Sueldos',
  'Servicios/Operativos',
  'Retiros de Socios',
  'Otros',
];

export const EXPENSE_TYPE_META = {
  merchandise: { label: 'Mercadería', hint: 'Compras a proveedores. No se resta: en su lugar se resta el costo de lo vendido.' },
  salaries: { label: 'Sueldos', hint: 'Sueldos y adelantos del personal.' },
  fixed: { label: 'Gastos fijos', hint: 'Alquiler, servicios, contador, internet y similares.' },
  other: { label: 'Otros gastos', hint: 'Gastos cargados como "Otros". Conviene pasarlos a su tipo.' },
  withdrawals: { label: 'Retiros y préstamos', hint: 'Plata que sale del negocio: retiros de socios y préstamos.' },
};

const toNumber = (value) => Number(value) || 0;

const normalize = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();

export const classifyExpenseCategory = (category) => {
  const normalized = normalize(category);
  if (normalized === 'proveedores' || normalized === 'mercaderia') return 'merchandise';
  if (normalized === 'sueldos' || normalized === 'sueldo') return 'salaries';
  if (normalized === 'servicios/operativos' || normalized === 'servicios') return 'fixed';
  if (normalized === 'retiros de socios' || normalized.startsWith('retiro') || normalized.startsWith('prestamo')) return 'withdrawals';
  return 'other';
};

export const buildBusinessResult = ({ revenue = 0, cost = 0, discountImpact = 0, expenses = [] } = {}) => {
  const byType = { merchandise: 0, salaries: 0, fixed: 0, other: 0, withdrawals: 0 };
  const countByType = { merchandise: 0, salaries: 0, fixed: 0, other: 0, withdrawals: 0 };
  (expenses || []).forEach((expense) => {
    const type = classifyExpenseCategory(expense?.category);
    byType[type] += toNumber(expense?.amount);
    countByType[type] += 1;
  });

  const collected = toNumber(revenue) - toNumber(discountImpact);
  const grossMargin = collected - toNumber(cost);
  const operatingExpenses = byType.salaries + byType.fixed + byType.other;
  const businessProfit = grossMargin - operatingExpenses;
  const withdrawals = byType.withdrawals;
  const afterWithdrawals = businessProfit - withdrawals;
  const merchandisePurchased = byType.merchandise;
  // Positivo: se compró más mercadería de la que se vendió (queda en stock).
  const stockGap = merchandisePurchased - toNumber(cost);
  const totalExpenses = operatingExpenses + withdrawals + merchandisePurchased;
  const cashResult = collected - totalExpenses;

  return {
    byType,
    countByType,
    collected,
    grossMargin,
    operatingExpenses,
    businessProfit,
    withdrawals,
    afterWithdrawals,
    merchandisePurchased,
    stockGap,
    totalExpenses,
    cashResult,
  };
};
