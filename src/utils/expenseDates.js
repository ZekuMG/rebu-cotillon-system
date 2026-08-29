const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const padDatePart = (value) => String(value).padStart(2, '0');

export const formatLocalDateInputValue = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join('-');
};

export const parseExpenseDateValue = (value) => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }

  const rawValue = String(value || '').trim();
  if (!rawValue) return null;

  const dateOnlyMatch = rawValue.match(DATE_ONLY_PATTERN);
  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]);
    const day = Number(dateOnlyMatch[3]);
    const parsedDate = new Date(year, month - 1, day);

    if (
      parsedDate.getFullYear() !== year ||
      parsedDate.getMonth() !== month - 1 ||
      parsedDate.getDate() !== day
    ) {
      return null;
    }

    return parsedDate;
  }

  const parsedDate = new Date(rawValue);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

export const normalizeExpenseDateValue = (value, fallback = new Date()) => {
  const parsedDate = parseExpenseDateValue(value) || parseExpenseDateValue(fallback);
  return parsedDate ? formatLocalDateInputValue(parsedDate) : '';
};

export const isFutureExpenseDate = (value, now = new Date()) => {
  const expenseDate = parseExpenseDateValue(value);
  const currentDate = parseExpenseDateValue(now);
  if (!expenseDate || !currentDate) return true;

  expenseDate.setHours(0, 0, 0, 0);
  currentDate.setHours(0, 0, 0, 0);
  return expenseDate.getTime() > currentDate.getTime();
};
