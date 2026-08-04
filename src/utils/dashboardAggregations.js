export const buildDashboardTransactionSummary = ({
  transactions = [],
  paymentMethods = [],
  resolvePaymentTotals = () => ({}),
  resolveRankingItem = () => null,
} = {}) => {
  const methodLabels = paymentMethods
    .map((method) => String(method?.label || method || '').trim())
    .filter(Boolean);
  const paymentTotals = Object.fromEntries(methodLabels.map((label) => [label, 0]));
  const rankingItems = [];

  (Array.isArray(transactions) ? transactions : []).forEach((transaction) => {
    const totalsByMethod = resolvePaymentTotals(transaction) || {};
    methodLabels.forEach((label) => {
      paymentTotals[label] += Number(totalsByMethod[label] || 0);
    });

    const items = transaction?.metricItems || transaction?.items || [];
    (Array.isArray(items) ? items : []).forEach((item) => {
      const summary = resolveRankingItem(item, transaction);
      if (summary) rankingItems.push(summary);
    });
  });

  return { paymentTotals, rankingItems };
};
