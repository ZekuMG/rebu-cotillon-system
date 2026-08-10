export const areDuplicatePricesEqual = (entries = []) => {
  if (entries.length <= 1) return true;
  const first = entries[0];
  return entries.every((entry) => (
    Number(entry.cost || 0) === Number(first.cost || 0)
    && Number(entry.salePrice || 0) === Number(first.salePrice || 0)
  ));
};

export const mergeDuplicateEntries = (entries = []) => {
  if (entries.length === 0) return null;

  const totalQuantity = entries.reduce(
    (sum, entry) => sum + Number(entry.quantity || 0),
    0,
  );

  return {
    ...entries[0],
    rowNumber: entries.map((entry) => entry.rowNumber).join(', '),
    quantity: totalQuantity,
    originalQuantity: totalQuantity,
    quantityInput: totalQuantity ? String(totalQuantity) : '',
    duplicateMerged: true,
  };
};
