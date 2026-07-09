import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const MAX_AUTO_SPAN_MS = 2000;

const parseEnvFile = (path) => {
  if (!fs.existsSync(path)) return {};

  return Object.fromEntries(
    fs
      .readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const index = line.indexOf('=');
        if (index === -1) return [line, ''];
        const key = line.slice(0, index).trim();
        const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
        return [key, value];
      }),
  );
};

const env = {
  ...parseEnvFile('.env'),
  ...parseEnvFile('.env.local'),
};

if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.');
}

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
  global: { headers: { 'x-client-info': 'rebu-client-duplicate-cleanup' } },
});

const normalizeName = (value = '') =>
  String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-AR');

const digitsOnly = (value = '') =>
  String(value || '').replace(/\D+/g, '');

const meaningfulDigits = (value = '', minLength = 5) => {
  const digits = digitsOnly(value);
  return digits.length >= minLength ? digits : '';
};

const normalizeEmail = (value = '') =>
  String(value || '').trim().toLocaleLowerCase('es-AR');

const getIdentityKey = (client) => {
  const dni = meaningfulDigits(client.dni);
  const phone = meaningfulDigits(client.phone, 6);
  const email = normalizeEmail(client.email);
  if (dni) return `dni:${dni}`;
  if (phone) return `phone:${phone}`;
  if (email) return `email:${email}`;
  return 'name-only';
};

const fetchAll = async (queryFactory, pageSize = 1000) => {
  const rows = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await queryFactory().range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }

  return rows;
};

const clients = await fetchAll(() =>
  supabase
    .from('clients')
    .select('id,name,member_number,dni,phone,email,points,is_active,created_at,social_connections')
    .order('id', { ascending: true }),
);

const activeClients = clients.filter((client) => client.is_active !== false);
const clientsByName = new Map();

activeClients.forEach((client) => {
  const key = normalizeName(client.name);
  if (!key) return;
  if (!clientsByName.has(key)) clientsByName.set(key, []);
  clientsByName.get(key).push(client);
});

const duplicateGroups = Array.from(clientsByName.entries())
  .filter(([, rows]) => rows.length > 1)
  .map(([nameKey, rows]) => {
    const sortedRows = [...rows].sort((left, right) => new Date(left.created_at) - new Date(right.created_at));
    const times = sortedRows.map((row) => new Date(row.created_at).getTime()).filter(Number.isFinite);
    const spanMs = times.length ? Math.max(...times) - Math.min(...times) : null;
    return { nameKey, rows: sortedRows, spanMs };
  });

const duplicateClientIds = duplicateGroups.flatMap((group) => group.rows.map((row) => row.id));

const fetchRowsByClientId = async (table, clientColumn, selectColumns) => {
  if (duplicateClientIds.length === 0) return [];

  const rows = [];
  const batchSize = 200;
  for (let index = 0; index < duplicateClientIds.length; index += batchSize) {
    const batch = duplicateClientIds.slice(index, index + batchSize);
    const { data, error } = await supabase
      .from(table)
      .select(selectColumns)
      .in(clientColumn, batch);
    if (error) throw error;
    rows.push(...(data || []));
  }
  return rows;
};

const [sales, budgets, orders] = await Promise.all([
  fetchRowsByClientId('sales', 'client_id', 'id,client_id,total,points_earned,points_spent,status,created_at'),
  fetchRowsByClientId('budgets', 'member_id', 'id,member_id,total_amount,is_active,created_at'),
  fetchRowsByClientId('orders', 'member_id', 'id,member_id,total_amount,is_active,created_at'),
]);

const countRefsByClientId = (rows, key, filter = () => true) =>
  rows.reduce((counts, row) => {
    if (!filter(row)) return counts;
    const id = String(row[key]);
    counts.set(id, (counts.get(id) || 0) + 1);
    return counts;
  }, new Map());

const salesByClientId = countRefsByClientId(sales, 'client_id', (sale) => sale.status !== 'deleted');
const budgetsByClientId = countRefsByClientId(budgets, 'member_id', (budget) => budget.is_active !== false);
const ordersByClientId = countRefsByClientId(orders, 'member_id', (order) => order.is_active !== false);

const getRefCount = (client) =>
  (salesByClientId.get(String(client.id)) || 0) +
  (budgetsByClientId.get(String(client.id)) || 0) +
  (ordersByClientId.get(String(client.id)) || 0);

const getActivityScore = (client) =>
  getRefCount(client) * 100000 +
  Math.max(0, Number(client.points || 0)) * 100 +
  new Date(client.created_at).getTime() / 1000000000000;

const canAutoCleanGroup = (group) => {
  if (group.rows.length !== 2) return { ok: false, reason: 'group_size_not_two' };
  if (group.spanMs === null || group.spanMs > MAX_AUTO_SPAN_MS) return { ok: false, reason: 'not_instant_duplicate' };

  const identityKeys = new Set(group.rows.map(getIdentityKey));
  if (identityKeys.size !== 1) return { ok: false, reason: 'different_identity_keys' };

  const sortedByActivity = [...group.rows].sort((left, right) => getActivityScore(right) - getActivityScore(left));
  const [keeper, duplicate] = sortedByActivity;
  const duplicateRefCount = getRefCount(duplicate);
  const duplicatePoints = Math.max(0, Number(duplicate.points || 0));

  if (duplicateRefCount > 0) return { ok: false, reason: 'duplicate_has_references' };
  if (duplicatePoints > 0 && Math.max(0, Number(keeper.points || 0)) === 0) {
    return { ok: false, reason: 'duplicate_has_points_keeper_empty' };
  }

  return { ok: true, keeper, duplicate };
};

const safeActions = [];
const manualReview = [];

duplicateGroups.forEach((group) => {
  const decision = canAutoCleanGroup(group);
  const summary = {
    nameKey: group.nameKey,
    spanMs: group.spanMs,
    rows: group.rows.map((client) => ({
      id: client.id,
      member_number: client.member_number,
      name: client.name,
      phone: client.phone,
      dni: client.dni,
      email: client.email,
      points: Number(client.points || 0),
      refCount: getRefCount(client),
      created_at: client.created_at,
    })),
  };

  if (decision.ok) {
    safeActions.push({
      ...summary,
      keepId: decision.keeper.id,
      keepMemberNumber: decision.keeper.member_number,
      deactivateId: decision.duplicate.id,
      deactivateMemberNumber: decision.duplicate.member_number,
    });
  } else {
    manualReview.push({ ...summary, reason: decision.reason });
  }
});

if (APPLY) {
  for (const action of safeActions) {
    const duplicate = activeClients.find((client) => String(client.id) === String(action.deactivateId));
    const existingConnections =
      duplicate?.social_connections && typeof duplicate.social_connections === 'object'
        ? duplicate.social_connections
        : {};

    const { error } = await supabase
      .from('clients')
      .update({
        is_active: false,
        social_connections: {
          ...existingConnections,
          duplicateCleanup: {
            mergedIntoClientId: action.keepId,
            mergedIntoMemberNumber: action.keepMemberNumber,
            deactivatedAt: new Date().toISOString(),
            reason: 'instant_duplicate_without_references',
          },
        },
      })
      .eq('id', action.deactivateId);

    if (error) throw error;
  }
}

const output = {
  mode: APPLY ? 'apply' : 'preview',
  totalClients: clients.length,
  activeClients: APPLY ? activeClients.length - safeActions.length : activeClients.length,
  appliedCount: APPLY ? safeActions.length : 0,
  duplicateNameGroups: duplicateGroups.length,
  safeAutoCleanupCount: safeActions.length,
  manualReviewCount: manualReview.length,
  safeActions,
  manualReview,
};

console.log(JSON.stringify(output, null, 2));
