/**
 * Aviso de "el costo de Rebu ya no coincide con el del proveedor".
 *
 * Desde que la revision se reabre SOLO cuando Casa Alberto cambia su precio, una
 * fila aprobada se queda en "Aprobado" aunque alguien deje el costo de Rebu en
 * $10 o en $9.999. Eso saca ruido, pero tambien apaga la unica alarma que habia
 * para un costo mal cargado. Este aviso no cambia el estado: solo lo marca.
 */

/** Estados donde el propio estado ya NO cuenta la diferencia de costo. */
const SETTLED_STATUSES = new Set(['reviewed', 'approved', 'ignored']);

/** Menos de un peso es redondeo comercial, no un desvio. */
const DEFAULT_EPSILON = 1;

export const describeSupplierCostDrift = ({
  estimatedCost,
  currentCost,
  status,
  epsilon = DEFAULT_EPSILON,
} = {}) => {
  if (!SETTLED_STATUSES.has(String(status || ''))) return null;

  const estimated = Number(estimatedCost);
  const current = Number(currentCost);
  if (!Number.isFinite(estimated) || estimated <= 0) return null;
  if (!Number.isFinite(current) || current <= 0) return null;

  const delta = Number((current - estimated).toFixed(2));
  if (Math.abs(delta) < Number(epsilon || DEFAULT_EPSILON)) return null;

  return {
    direction: delta > 0 ? 'up' : 'down',
    delta,
    percent: Number(((delta / estimated) * 100).toFixed(2)),
    estimatedCost: estimated,
    currentCost: current,
  };
};
