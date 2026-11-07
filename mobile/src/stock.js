export const MAX_STOCK = 2147483647;
export function previewStock(product, mode, value) {
  const raw = String(value).trim();
  if (!/^\d+$/.test(raw)) throw new Error('Ingresá una cantidad entera válida.');
  const quantity = Number(raw);
  if (!Number.isSafeInteger(quantity) || quantity > MAX_STOCK || (mode === 'add' && quantity === 0)) {
    throw new Error(mode === 'add' ? 'Ingresá una cantidad mayor a cero.' : 'La cantidad está fuera de rango.');
  }
  if (!['add', 'set'].includes(mode)) throw new Error('Elegí el tipo de movimiento.');
  const before = product?.stock === null || product?.stock === undefined || product?.stock === '' ? NaN : Number(product.stock);
  if (!Number.isSafeInteger(before)) throw new Error('Actualizá el producto para verificar su stock.');
  const after = mode === 'add' ? before + quantity : quantity;
  if (after < 0 || after > MAX_STOCK) throw new Error('El stock resultante está fuera de rango.');
  if (after === before) throw new Error('La cantidad coincide con el stock actual.');
  return { quantity, before, after, delta: after - before };
}
export const stockUnit = (product) => product.product_type === 'weight' ? 'g' : 'un.';
export const stockLabel = (product) => product.stock === null || product.stock === undefined || !Number.isFinite(Number(product.stock)) ? 'Sin dato' : `${Number(product.stock).toLocaleString('es-AR')} ${stockUnit(product)}`;
export const priceLabel = (product) => product.price === null || product.price === undefined || product.price === '' ? 'Sin precio' : Number.isFinite(Number(product.price)) ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(Number(product.price) * (product.product_type === 'weight' ? 1000 : 1)) : 'Precio no válido';
