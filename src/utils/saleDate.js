// Cambiar la fecha y hora de una venta desde "Editar venta".
// El campo usa <input type="datetime-local">, que trabaja en hora local y sin
// segundos: 'YYYY-MM-DDTHH:mm'.

const pad = (value) => String(value).padStart(2, '0');

export const toDateTimeLocalValue = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const parseDateTimeLocalValue = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  const [, year, month, day, hours, minutes] = match.map(Number);
  const date = new Date(year, month - 1, day, hours, minutes, 0, 0);
  // Descarta fechas que el Date "acomoda" solo, como el 31 de febrero.
  if (date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
};

// Compara a nivel de minuto: el campo no muestra segundos, así que abrir y
// guardar sin tocar la fecha no tiene que contar como cambio.
export const getSaleDateChange = (originalDate, inputValue, now = new Date()) => {
  const originalValue = toDateTimeLocalValue(originalDate);
  if (!inputValue || inputValue === originalValue) return { changed: false };

  const nextDate = parseDateTimeLocalValue(inputValue);
  if (!nextDate) return { changed: false, error: 'La fecha de la venta no es válida.' };
  if (nextDate.getTime() > now.getTime()) {
    return { changed: false, error: 'La fecha de la venta no puede ser futura.' };
  }

  return {
    changed: true,
    nextDate,
    previousDate: originalDate instanceof Date && !Number.isNaN(originalDate.getTime()) ? originalDate : null,
  };
};
