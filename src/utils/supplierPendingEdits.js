/**
 * Casa Alberto: que hacer con una fila que estas editando y todavia no aplicaste.
 *
 * El estado de cada fila se recalcula en vivo mientras editas (si el costo
 * estimado queda igual al costo actual, pasa a "revisado"), y la lista se filtra
 * y se ordena por ese estado. Resultado: al corregir las unidades o el peso la
 * fila cambiaba de estado y **desaparecia de la vista sin haberse aplicado**,
 * asi que parecia que se habia perdido el trabajo.
 *
 * Aca vive la regla: lo que tenes editado sin aplicar se queda a la vista,
 * arriba de todo, con lo ultimo que tocaste primero.
 */

/** El orden de siempre: lo que pide atencion arriba, lo resuelto abajo. */
export const SUPPLIER_STATUS_WEIGHT = Object.freeze({
  changed: 0,
  login_required: 1,
  error: 2,
  review_required: 3,
  dubious_link: 4,
  price_down: 5,
  unchecked: 6,
  reviewed: 7,
  approved: 8,
  ignored: 9,
});

const hasRealValue = (value) => {
  if (value === null || value === undefined || value === '') return false;
  if (typeof value === 'object') return Object.values(value).some(hasRealValue);
  return true;
};

/** ¿Esta fila tiene algo editado y sin aplicar? */
export const hasPendingSupplierEdit = (overrides = {}, groupKey = '') => {
  const override = (overrides || {})[String(groupKey)];
  if (!override || typeof override !== 'object') return false;
  return Object.values(override).some(hasRealValue);
};

/** Las claves de las filas con edicion pendiente, de la mas reciente a la mas vieja. */
export const getPendingSupplierEditKeys = (overrides = {}, editedAt = {}) =>
  Object.keys(overrides || {})
    .filter((key) => hasPendingSupplierEdit(overrides, key))
    .sort((left, right) => Number(editedAt?.[right] || 0) - Number(editedAt?.[left] || 0));

const statusWeightOf = (status) => (
  Object.prototype.hasOwnProperty.call(SUPPLIER_STATUS_WEIGHT, status)
    ? SUPPLIER_STATUS_WEIGHT[status]
    : SUPPLIER_STATUS_WEIGHT.ignored
);

/**
 * Ordena los grupos: primero lo editado sin aplicar (lo ultimo tocado arriba) y
 * despues el orden de siempre por estado. No modifica la lista recibida.
 */
export const sortSupplierGroupsForReview = (groups = [], { overrides = {}, editedAt = {} } = {}) =>
  [...(Array.isArray(groups) ? groups : [])].sort((left, right) => {
    const leftEdited = hasPendingSupplierEdit(overrides, left.key);
    const rightEdited = hasPendingSupplierEdit(overrides, right.key);
    if (leftEdited !== rightEdited) return leftEdited ? -1 : 1;
    if (leftEdited && rightEdited) {
      const diff = Number(editedAt?.[right.key] || 0) - Number(editedAt?.[left.key] || 0);
      if (diff !== 0) return diff;
    }
    return statusWeightOf(left.status) - statusWeightOf(right.status)
      || String(left.supplierTitle || '').localeCompare(String(right.supplierTitle || ''));
  });
