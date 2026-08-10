const POINT_EXPIRATION_MONTHS = 6;
const DEFAULT_UPCOMING_DAYS = 30;

export const normalizeMemberName = (value = '') =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('es-AR');

const parseDateParts = (dateValue) => {
  if (!dateValue) return null;
  const raw = String(dateValue).trim();
  if (!raw || raw === '--/--/--' || raw === '--/--/----') return null;

  if (raw.includes('/')) {
    const [day, month, year] = raw.split('/');
    const fullYear = String(year || '').length === 2 ? `20${year}` : year;
    return `${fullYear}-${month}-${day}`;
  }

  return raw.split('T')[0] || raw;
};

const parseTransactionDate = (tx = {}) => {
  const directDate = tx.createdAt || tx.created_at || tx.date;
  const datePart = parseDateParts(directDate);
  if (!datePart) return null;

  const rawTime = String(tx.time || tx.timestamp || '00:00:00')
    .replace(/hs/gi, '')
    .trim()
    .split(' ')[0] || '00:00:00';
  const safeTime = rawTime.includes(':') ? rawTime : '00:00:00';
  const parsed = new Date(`${datePart}T${safeTime}`);

  if (!Number.isNaN(parsed.getTime())) return parsed;

  const fallback = new Date(directDate);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
};

const parseMemberDate = (member = {}) => {
  const rawDate = member.createdAt || member.created_at || member.created || null;
  if (!rawDate) return null;

  const parsed = new Date(rawDate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const addMonths = (date, months) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
};

const formatDateKey = (date) => {
  if (!date || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDisplayDate = (date) => {
  if (!date || Number.isNaN(date.getTime())) return '--/--/--';
  return date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
};

const getClientIdentity = (client = {}) => ({
  id: client.id ?? client.clientId ?? client.memberId ?? null,
  memberNumber: client.memberNumber ?? client.member_number ?? client.number ?? null,
  name: client.name ?? client.clientName ?? client.memberName ?? null,
});

const reconcileLotsToCurrentBalance = (lots, currentPoints, fallbackEarnedAt, now) => {
  const safeCurrentPoints = Math.max(0, Number(currentPoints || 0));
  let totalFromLots = lots.reduce((acc, lot) => acc + Number(lot.remaining || 0), 0);

  if (totalFromLots <= safeCurrentPoints) {
    const manualPoints = safeCurrentPoints - totalFromLots;
    if (manualPoints <= 0) return lots;

    const safeFallbackEarnedAt =
      fallbackEarnedAt && !Number.isNaN(fallbackEarnedAt.getTime())
        ? fallbackEarnedAt
        : now;

    return [
      ...lots,
      {
        earnedAt: safeFallbackEarnedAt,
        expiresAt: addMonths(safeFallbackEarnedAt, POINT_EXPIRATION_MONTHS),
        remaining: manualPoints,
        sourceId: 'manual-balance',
      },
    ];
  }

  let excess = totalFromLots - safeCurrentPoints;
  return lots
    .map((lot) => {
      if (excess <= 0) return lot;
      const remaining = Number(lot.remaining || 0);
      const consumed = Math.min(remaining, excess);
      excess -= consumed;
      return { ...lot, remaining: remaining - consumed };
    })
    .filter((lot) => Number(lot.remaining || 0) > 0);
};

export const buildPointExpirationReport = (members = [], transactions = [], options = {}) => {
  const now = options.now instanceof Date ? options.now : new Date();
  const upcomingDays = Number(options.upcomingDays || DEFAULT_UPCOMING_DAYS);
  const upcomingLimit = new Date(now);
  upcomingLimit.setDate(upcomingLimit.getDate() + upcomingDays);
  const safeMembers = Array.isArray(members) ? members : [];
  const memberReportsSeed = safeMembers.map((member) => ({
    member,
    memberId: member.id,
    memberNumber: member.memberNumber ?? member.member_number ?? null,
    name: member.name || 'Socio sin nombre',
    currentPoints: Number(member.points || 0),
    createdAt: parseMemberDate(member),
  }));
  const reportsById = new Map();
  const reportsByNumber = new Map();
  const nameCounts = new Map();
  const reportsByName = new Map();

  memberReportsSeed.forEach((report) => {
    if (report.memberId !== undefined && report.memberId !== null) {
      reportsById.set(String(report.memberId), report);
    }
    if (report.memberNumber !== undefined && report.memberNumber !== null) {
      reportsByNumber.set(String(report.memberNumber), report);
    }

    const normalizedName = normalizeMemberName(report.name);
    if (normalizedName) {
      nameCounts.set(normalizedName, (nameCounts.get(normalizedName) || 0) + 1);
      reportsByName.set(normalizedName, report);
    }
  });

  nameCounts.forEach((count, name) => {
    if (count > 1) reportsByName.delete(name);
  });

  const transactionsByMember = new Map();
  const pointEntriesByMember = new Map();
  const pushTransactionForReport = (report, tx, date) => {
    if (!transactionsByMember.has(report)) transactionsByMember.set(report, []);
    transactionsByMember.get(report).push({ tx, date });
  };

  (Array.isArray(transactions) ? transactions : []).forEach((tx) => {
    if (!tx || tx.status === 'voided' || tx.status === 'deleted') return;

    const date = parseTransactionDate(tx);
    if (!date) return;

    const txClient = getClientIdentity(tx.client || {});
    const txMemberId = tx.memberId ?? tx.member_id ?? tx.clientId ?? txClient.id;
    const txMemberNumber = tx.memberNumber ?? tx.member_number ?? txClient.memberNumber;
    const txMemberName = tx.memberName ?? tx.clientName ?? txClient.name;
    const report =
      (txMemberId !== undefined && txMemberId !== null ? reportsById.get(String(txMemberId)) : null) ||
      (txMemberNumber !== undefined && txMemberNumber !== null ? reportsByNumber.get(String(txMemberNumber)) : null) ||
      reportsByName.get(normalizeMemberName(txMemberName));

    if (report) pushTransactionForReport(report, tx, date);
  });

  (Array.isArray(options.pointEntries) ? options.pointEntries : []).forEach((entry) => {
    const memberId = entry?.clientId ?? entry?.client_id ?? null;
    const report = memberId !== null && memberId !== undefined
      ? reportsById.get(String(memberId))
      : null;
    const rawDate = entry?.earnedAt ?? entry?.earned_at ?? entry?.createdAt ?? entry?.created_at;
    const date = rawDate ? new Date(rawDate) : null;
    if (!report || !date || Number.isNaN(date.getTime())) return;
    if (!pointEntriesByMember.has(report)) pointEntriesByMember.set(report, []);
    pointEntriesByMember.get(report).push({ entry, date });
  });

  const memberReports = memberReportsSeed.map((seed) => {
    const member = seed.member;
    const lots = [];
    const pointEvents = [
      ...(transactionsByMember.get(seed) || []).map(({ tx, date }) => ({ type: 'sale', tx, date })),
      ...(pointEntriesByMember.get(seed) || []).map(({ entry, date }) => ({ type: 'ledger', entry, date })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    const consumeOldestLots = (points) => {
      let pointsToSpend = Math.max(0, Number(points || 0));
      if (pointsToSpend <= 0) return;
      lots.sort((a, b) => (a.expiresAt?.getTime() || 0) - (b.expiresAt?.getTime() || 0));
      lots.forEach((lot) => {
        if (pointsToSpend <= 0) return;
        const remaining = Number(lot.remaining || 0);
        const consumed = Math.min(remaining, pointsToSpend);
        lot.remaining = remaining - consumed;
        pointsToSpend -= consumed;
      });
    };

    pointEvents.forEach((event) => {
      if (event.type === 'ledger') {
        const delta = Number(event.entry?.delta || 0);
        if (delta > 0) {
          lots.push({
            earnedAt: event.date,
            expiresAt: addMonths(event.date, POINT_EXPIRATION_MONTHS),
            remaining: delta,
            sourceId: event.entry.id || event.entry.operation_key,
            sourceType: event.entry.entry_type || 'ledger',
          });
        } else if (delta < 0) {
          consumeOldestLots(Math.abs(delta));
        }
        return;
      }

      const { tx, date } = event;
      const saleOwnsPoints = (tx.pointsSource ?? tx.points_source ?? 'sale') !== 'order';
      const pointsEarned = saleOwnsPoints
        ? Math.max(0, Number(tx.pointsEarned ?? tx.points_earned ?? 0))
        : 0;
      const pointsSpent = Math.max(0, Number(tx.pointsSpent ?? tx.points_spent ?? 0));

      if (pointsEarned > 0) {
        lots.push({
          earnedAt: date,
          expiresAt: addMonths(date, POINT_EXPIRATION_MONTHS),
          remaining: pointsEarned,
          sourceId: tx.id,
        });
      }

      consumeOldestLots(pointsSpent);
    });

    const reconciledLots = reconcileLotsToCurrentBalance(
      lots.filter((lot) => Number(lot.remaining || 0) > 0),
      member.points,
      null,
      now,
    );

    const expiredLots = reconciledLots.filter((lot) => lot.expiresAt && lot.expiresAt <= now);
    const upcomingLots = reconciledLots.filter((lot) => lot.expiresAt && lot.expiresAt > now && lot.expiresAt <= upcomingLimit);
    const expiredPoints = expiredLots.reduce((acc, lot) => acc + Number(lot.remaining || 0), 0);
    const upcomingPoints = upcomingLots.reduce((acc, lot) => acc + Number(lot.remaining || 0), 0);

    return {
      memberId: seed.memberId,
      memberNumber: seed.memberNumber,
      name: seed.name,
      currentPoints: seed.currentPoints,
      expiredPoints,
      upcomingPoints,
      expiredLots,
      upcomingLots,
    };
  });

  const expiredMembers = memberReports
    .filter((report) => report.expiredPoints > 0)
    .sort((a, b) => b.expiredPoints - a.expiredPoints || a.name.localeCompare(b.name));

  const upcomingMembers = memberReports
    .filter((report) => report.upcomingPoints > 0)
    .sort((a, b) => b.upcomingPoints - a.upcomingPoints || a.name.localeCompare(b.name));

  const upcomingGroupsMap = new Map();
  upcomingMembers.forEach((memberReport) => {
    memberReport.upcomingLots.forEach((lot) => {
      const key = formatDateKey(lot.expiresAt);
      const current = upcomingGroupsMap.get(key) || {
        dateKey: key,
        displayDate: formatDisplayDate(lot.expiresAt),
        points: 0,
        memberIds: new Set(),
      };

      current.points += Number(lot.remaining || 0);
      current.memberIds.add(String(memberReport.memberId));
      upcomingGroupsMap.set(key, current);
    });
  });

  const upcomingGroups = Array.from(upcomingGroupsMap.values())
    .map((group) => ({
      ...group,
      memberCount: group.memberIds.size,
      memberIds: undefined,
    }))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  return {
    generatedAt: now.toISOString(),
    upcomingDays,
    expiredMembers,
    upcomingMembers,
    upcomingGroups,
    totals: {
      expiredMembers: expiredMembers.length,
      expiredPoints: expiredMembers.reduce((acc, member) => acc + member.expiredPoints, 0),
      upcomingMembers: upcomingMembers.length,
      upcomingPoints: upcomingMembers.reduce((acc, member) => acc + member.upcomingPoints, 0),
    },
  };
};
