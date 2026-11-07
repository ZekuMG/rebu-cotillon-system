// Los precios por gramo conservan su precision. Solo el importe de cada
// renglon se cierra a centavos, como en la balanza y en sale_items.subtotal.
export const roundPosMoney = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount === 0) return 0;
  const absolute = Math.abs(amount);
  const noise = Number.EPSILON * Math.max(1, absolute);
  return Math.sign(amount) * Math.round((absolute + noise) * 100) / 100;
};

export const getPosLineSubtotal = (item = {}) =>
  roundPosMoney(Number(item.price || 0) * Number(item.quantity ?? item.qty ?? 0));

export const getPosSubtotal = (items = []) =>
  roundPosMoney(items.reduce((sum, item) => sum + getPosLineSubtotal(item), 0));
