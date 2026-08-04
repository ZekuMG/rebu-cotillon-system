import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { parse } from 'dotenv';

const REALTIME_TABLES = [
  'register_state',
  'cash_closures',
  'sales',
  'expenses',
  'logs',
  'app_users',
  'products',
  'clients',
  'categories',
  'offers',
  'rewards',
  'agenda_contacts',
];

const env = parse(readFileSync('.env'));
const supabaseUrl = String(env.VITE_SUPABASE_URL || '').trim();
const supabaseKey = String(env.VITE_SUPABASE_ANON_KEY || '').trim();

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en .env.');
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  realtime: {
    timeout: 12_000,
  },
});

const REST_SOURCES = REALTIME_TABLES.map((table) => ({
  table,
  source: table === 'app_users' ? 'app_users_public' : table,
}));

const restChecks = [];
for (const { table, source } of REST_SOURCES) {
  const { error } = await supabase.from(source).select('*', { head: true }).limit(1);
  restChecks.push({
    table,
    source,
    ok: !error,
    code: error?.code || null,
    message: error?.message || null,
    details: error?.details || null,
    hint: error?.hint || null,
  });
}

const channel = supabase.channel(`rebu-publication-audit-${Date.now()}`);
for (const table of REALTIME_TABLES) {
  channel.on(
    'postgres_changes',
    { event: '*', schema: 'public', table },
    () => {},
  );
}

const realtimeCheck = await new Promise((resolve) => {
  const timeoutId = setTimeout(() => {
    resolve({
      status: 'AUDIT_TIMEOUT',
      error: 'No se confirmo la suscripcion dentro de 15 segundos.',
    });
  }, 15_000);

  channel.subscribe((status, error) => {
    if (!['SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) return;
    clearTimeout(timeoutId);
    resolve({
      status,
      error: error?.message || String(error || ''),
    });
  });
});

await supabase.removeChannel(channel);

console.log(JSON.stringify({ rest: restChecks, realtime: realtimeCheck }, null, 2));

const failedRestChecks = restChecks.filter((check) => !check.ok);
if (failedRestChecks.length > 0 || realtimeCheck.status !== 'SUBSCRIBED') {
  process.exitCode = 1;
}
