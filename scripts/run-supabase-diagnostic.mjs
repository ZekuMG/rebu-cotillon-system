import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import process from 'node:process';
import { Client } from 'pg';
import { parse } from 'dotenv';

const requestedPath = process.argv[2];
if (!requestedPath) {
  throw new Error('Uso: node scripts/run-supabase-diagnostic.mjs supabase/diagnostics/<archivo.sql>');
}

const workspaceRoot = resolve('.');
const diagnosticsRoot = resolve('supabase', 'diagnostics');
const sqlPath = resolve(requestedPath);
if (sqlPath !== diagnosticsRoot && !sqlPath.startsWith(`${diagnosticsRoot}${sep}`)) {
  throw new Error('Solo se pueden ejecutar archivos dentro de supabase/diagnostics.');
}

const env = parse(readFileSync(resolve(workspaceRoot, '.env')));
const host = String(env.SUPABASE_DB_HOST || '').trim();
const port = Number(env.SUPABASE_DB_PORT || 5432);
const database = String(env.SUPABASE_DB_NAME || 'postgres').trim();
const user = String(env.SUPABASE_DB_USER || '').trim();
const password = String(env.SUPABASE_DB_PASSWORD || '').trim();

if (!host || !user || !password) {
  throw new Error('Faltan credenciales SUPABASE_DB_* en .env.');
}

const client = new Client({ host, port, database, user, password, ssl: { rejectUnauthorized: false } });
client.on('notice', (notice) => {
  if (notice?.message) console.log(`NOTICE: ${notice.message}`);
});
try {
  await client.connect();
  const result = await client.query(readFileSync(sqlPath, 'utf8'));
  const results = Array.isArray(result) ? result : [result];
  for (const entry of results) {
    if (entry?.rows?.length) console.log(JSON.stringify(entry.rows, null, 2));
  }
} finally {
  await client.end();
}
