const CAMPOS = ['price', 'purchasePrice', 'stock'];

const esIgual = (a, b) => CAMPOS.every((campo) => Number(a?.[campo]) === Number(b?.[campo]));

/**
 * Fusiona la grilla del editor masivo con lo que acaba de llegar del inventario.
 *
 * El editor escucha `products` en vivo, asi que cualquier guardado -- el propio,
 * el de otra PC o el de otro usuario -- vuelve a bajar el inventario. Antes eso
 * reconstruia la grilla entera y **borraba en silencio lo que la persona estaba
 * editando**: despues "Aplicar cambios" guardaba los valores viejos y parecia
 * que el guardado no funcionaba (medido el 1-sep-2026 en la bitacora: los lotes
 * quedaban con `before` igual a `after`).
 *
 * Ahora una fila que la persona toco se respeta; el resto se actualiza con lo
 * que vino de la nube. Un producto que ya no esta en el inventario se descarta.
 */
export const mergePendingEdits = ({ previous = {}, fresh = {}, baseline = {} }) => {
  const resultado = { ...fresh };

  Object.entries(previous).forEach(([id, valores]) => {
    if (!resultado[id]) return;
    const original = baseline[id];
    if (!original) return;
    const loTocoLaPersona = !esIgual(valores, original);
    if (loTocoLaPersona) resultado[id] = valores;
  });

  return resultado;
};
