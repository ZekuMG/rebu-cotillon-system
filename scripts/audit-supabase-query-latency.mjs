import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createClient } from '@supabase/supabase-js';
import { parse } from 'dotenv';

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
});

const checks = [
  {
    name: 'sales_recent',
    run: () => supabase.from('sales').select('id,created_at').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(51),
  },
  {
    name: 'logs_recent',
    run: () => supabase.from('logs').select('id,created_at').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(101),
  },
  {
    name: 'expenses_recent',
    run: () => supabase.from('expenses').select('id,created_at').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(101),
  },
  {
    name: 'cash_closures_recent',
    run: () => supabase.from('cash_closures').select('id,created_at').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(101),
  },
];

const samples = [];
for (let iteration = 1; iteration <= 3; iteration += 1) {
  for (const check of checks) {
    const startedAt = performance.now();
    const { data, error } = await check.run();
    samples.push({
      name: check.name,
      iteration,
      elapsedMs: Math.round((performance.now() - startedAt) * 10) / 10,
      rows: Array.isArray(data) ? data.length : 0,
      ok: !error,
      code: error?.code || null,
      message: error?.message || null,
    });
  }
}

const summary = checks.map(({ name }) => {
  const timings = samples
    .filter((sample) => sample.name === name && sample.ok)
    .map((sample) => sample.elapsedMs)
    .sort((left, right) => left - right);
  return {
    name,
    successfulSamples: timings.length,
    minMs: timings[0] ?? null,
    medianMs: timings[Math.floor(timings.length / 2)] ?? null,
    maxMs: timings[timings.length - 1] ?? null,
  };
});

console.log(JSON.stringify({ summary, samples }, null, 2));
if (samples.some((sample) => !sample.ok)) process.exitCode = 1;

