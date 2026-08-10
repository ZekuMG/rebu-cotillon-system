export const ORDER_POINT_AMOUNT = 500;

const safeAmount = (value) => Math.max(0, Number(value) || 0);

export const calculateOrderPoints = ({
  paidTotal = 0,
  totalAmount = 0,
  memberId = null,
  status = '',
  isActive = true,
} = {}) => {
  if (!memberId || isActive === false || String(status).toLowerCase() === 'cancelado') return 0;
  const eligiblePaidTotal = Math.min(safeAmount(paidTotal), safeAmount(totalAmount));
  return Math.floor(eligiblePaidTotal / ORDER_POINT_AMOUNT);
};

export const isIncrementalOrderPoints = (order = {}) =>
  order.pointsAccountingMode === 'incremental' || order.points_accounting_mode === 'incremental';

export const getFinalizationPointsToCredit = (order = {}, pointsEarned = 0) => (
  isIncrementalOrderPoints(order)
    ? 0
    : Math.max(0, Math.floor(Number(pointsEarned) || 0))
);

const sanitizeOperationKeyPart = (value) =>
  String(value ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9_.:-]+/g, '-')
    .slice(0, 80);

export const buildOrderOperationKey = (action, orderId, version = 0, fingerprint = '') =>
  [
    'order',
    sanitizeOperationKeyPart(action || 'change'),
    sanitizeOperationKeyPart(orderId || 'new'),
    `v${Math.max(0, Number(version) || 0)}`,
    sanitizeOperationKeyPart(fingerprint || 'once'),
  ].join(':').slice(0, 180);

export const getOrderPointsDelta = (previousOrder = null, nextOrder = null) => {
  const previousPoints = previousOrder
    ? calculateOrderPoints(previousOrder)
    : 0;
  const nextPoints = nextOrder
    ? calculateOrderPoints(nextOrder)
    : 0;

  return {
    previousPoints,
    nextPoints,
    delta: nextPoints - previousPoints,
  };
};
