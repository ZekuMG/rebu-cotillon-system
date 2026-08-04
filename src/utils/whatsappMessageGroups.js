const imageAttachments = (row) => (row?.attachments || []).filter(
  (attachment) => String(attachment?.media_kind || '').toLowerCase() === 'image'
    || String(attachment?.mime_type || '').toLowerCase().startsWith('image/'),
);

const catalogOperationGroup = (row) => {
  const operationKey = String(row?.operation_key || '');
  const match = operationKey.match(/^(operator:.+):photo:\d+$/);
  return match?.[1] || '';
};

const timestamp = (row) => {
  const parsed = Date.parse(String(row?.created_at || ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

export const WHATSAPP_TIME_ZONE = 'America/Argentina/Buenos_Aires';

const calendarParts = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: WHATSAPP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
  };
};

export const messageDayKey = (value) => {
  const parts = calendarParts(value);
  if (!parts) return '';
  return [parts.year, String(parts.month).padStart(2, '0'), String(parts.day).padStart(2, '0')].join('-');
};

const calendarSerial = (parts) => Date.UTC(parts.year, parts.month - 1, parts.day);

export const messageDayLabel = (value, now = Date.now()) => {
  const date = new Date(value);
  const day = calendarParts(date);
  const today = calendarParts(now);
  if (!day || !today) return 'Fecha desconocida';
  const distance = Math.round((calendarSerial(today) - calendarSerial(day)) / 86_400_000);
  if (distance === 0) return 'Hoy';
  if (distance === 1) return 'Ayer';
  const formatted = new Intl.DateTimeFormat('es-AR', {
    timeZone: WHATSAPP_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(day.year === today.year ? {} : { year: 'numeric' }),
  }).format(date);
  return formatted.charAt(0).toLocaleUpperCase('es-AR') + formatted.slice(1);
};

export const withDaySeparators = (blocks = [], now = Date.now()) => {
  const items = [];
  let previousDay = null;
  for (const block of blocks) {
    const createdAt = block?.rows?.[0]?.created_at;
    const dayKey = messageDayKey(createdAt) || 'unknown';
    if (dayKey !== previousDay) {
      items.push({
        type: 'day-separator',
        key: `day:${dayKey}:${block?.key || items.length}`,
        dayKey,
        label: messageDayLabel(createdAt, now),
      });
      previousDay = dayKey;
    }
    items.push(block);
  }
  return items;
};

export const groupMessagesForDisplay = (messages = []) => {
  const blocks = [];
  for (const row of messages) {
    const images = imageAttachments(row);
    if (images.length === 0) {
      blocks.push({ type: 'message', rows: [row], key: `message:${row.id}` });
      continue;
    }

    const previous = blocks.at(-1);
    const previousRow = previous?.rows?.at(-1);
    const operationGroup = catalogOperationGroup(row);
    const currentDay = messageDayKey(row?.created_at);
    const previousDay = messageDayKey(previousRow?.created_at);
    const sameCalendarDay = Boolean(currentDay && currentDay === previousDay);
    const sameCatalogBatch = Boolean(
      sameCalendarDay && operationGroup
      && operationGroup === catalogOperationGroup(previousRow),
    );
    const sameIncomingBurst = Boolean(
      sameCalendarDay && !operationGroup
      && row.direction === 'inbound'
      && previousRow?.direction === 'inbound'
      && imageAttachments(previousRow).length > 0
      && timestamp(row) - timestamp(previousRow) >= 0
      && timestamp(row) - timestamp(previousRow) <= 60_000,
    );

    if (previous?.type === 'image-group' && (sameCatalogBatch || sameIncomingBurst)) {
      previous.rows.push(row);
      continue;
    }
    blocks.push({
      type: 'image-group',
      rows: [row],
      key: `images:${operationGroup || row.id}`,
    });
  }
  return blocks;
};
