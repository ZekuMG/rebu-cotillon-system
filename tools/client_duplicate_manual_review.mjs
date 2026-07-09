import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

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
  global: { headers: { 'x-client-info': 'rebu-client-duplicate-manual-review' } },
});

const normalizeName = (value = '') =>
  String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-AR');

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
      .in(clientColumn, batch)
      .order('created_at', { ascending: true });
    if (error) throw error;
    rows.push(...(data || []));
  }
  return rows;
};

const [sales, budgets, orders] = await Promise.all([
  fetchRowsByClientId('sales', 'client_id', 'id,client_id,total,points_earned,points_spent,status,created_at,user_name'),
  fetchRowsByClientId('budgets', 'member_id', 'id,member_id,total_amount,is_active,created_at'),
  fetchRowsByClientId('orders', 'member_id', 'id,member_id,total_amount,is_active,status,created_at'),
]);

const rowsFor = (rows, key, clientId) => rows.filter((row) => String(row[key]) === String(clientId));

const summarizeSales = (clientSales) => ({
  count: clientSales.filter((sale) => sale.status !== 'deleted').length,
  total: clientSales
    .filter((sale) => sale.status !== 'deleted')
    .reduce((sum, sale) => sum + Number(sale.total || 0), 0),
  pointsEarned: clientSales
    .filter((sale) => sale.status !== 'deleted')
    .reduce((sum, sale) => sum + Number(sale.points_earned || 0), 0),
  pointsSpent: clientSales
    .filter((sale) => sale.status !== 'deleted')
    .reduce((sum, sale) => sum + Number(sale.points_spent || 0), 0),
});

const output = duplicateGroups.map((group) => ({
  nameKey: group.nameKey,
  spanMs: group.spanMs,
  rows: group.rows.map((client) => {
    const clientSales = rowsFor(sales, 'client_id', client.id);
    const clientBudgets = rowsFor(budgets, 'member_id', client.id).filter((budget) => budget.is_active !== false);
    const clientOrders = rowsFor(orders, 'member_id', client.id).filter((order) => order.is_active !== false);

    return {
      id: client.id,
      memberNumber: client.member_number,
      name: client.name,
      phone: client.phone,
      dni: client.dni,
      email: client.email,
      points: Number(client.points || 0),
      createdAt: client.created_at,
      salesSummary: summarizeSales(clientSales),
      budgets: clientBudgets.map((budget) => ({
        id: budget.id,
        totalAmount: Number(budget.total_amount || 0),
        createdAt: budget.created_at,
      })),
      orders: clientOrders.map((order) => ({
        id: order.id,
        totalAmount: Number(order.total_amount || 0),
        status: order.status,
        createdAt: order.created_at,
      })),
      sales: clientSales
        .filter((sale) => sale.status !== 'deleted')
        .map((sale) => ({
          id: sale.id,
          total: Number(sale.total || 0),
          pointsEarned: Number(sale.points_earned || 0),
          pointsSpent: Number(sale.points_spent || 0),
          status: sale.status,
          createdAt: sale.created_at,
          userName: sale.user_name,
        })),
    };
  }),
}));

console.log(JSON.stringify(output, null, 2));
