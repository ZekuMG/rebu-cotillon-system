// ¿Ya entran todas las PCs con sesion, o alguna sigue trabajando como anonima?
//
// Cada inicio de sesion deja en la bitacora un campo `supabaseAuth.signedIn`.
// Con eso se comprueba que una maquina uso Auth en su ultimo ingreso. NO se
// registra la version exacta: hay que confirmar 1.2.54 en cada caja activa
// antes de cerrar los permisos de `anon` sobre las tablas de punto de venta.
//
//   node scripts/audit-pcs-con-sesion.mjs [dias]
//
// Devuelve 0 cuando TODAS las maquinas vistas en el periodo entraron con sesion.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import process from "node:process";

// La version sale del package.json: escrita a mano quedaba vieja apenas se subia
// de version, y el mensaje pasaba a mentir sin que nadie lo notara.
const VERSION = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;

const require = createRequire(import.meta.url);
const { Client } = require("pg");

const leer = (r) => { try { return readFileSync(r, "utf8"); } catch { return ""; } };
const env = Object.fromEntries(
  (leer(".env") + "\n" + leer(".env.local")).split(/\r?\n/)
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "").trim()]; }),
);
const DIAS = Number(process.argv[2] || 7);

const c = new Client({
  host: env.SUPABASE_DB_HOST, port: Number(env.SUPABASE_DB_PORT || 5432), user: env.SUPABASE_DB_USER,
  password: env.SUPABASE_DB_PASSWORD, database: env.SUPABASE_DB_NAME || "postgres", ssl: { rejectUnauthorized: false },
});
await c.connect();

const { rows } = await c.query(`
  select
    coalesce(nullif(details->>'deviceName', ''), 'Equipo sin nombre') as equipo,
    coalesce(details->>'ipAddress', '-')                              as ip,
    coalesce(details->>'runtime', '-')                                as entorno,
    coalesce(details->'supabaseAuth'->>'signedIn', 'false')           as con_sesion,
    coalesce(details->>'userName', '-')                               as quien,
    created_at
  from public.logs
  where action = 'Sesion Iniciada'
    and created_at > now() - ($1 || ' days')::interval
    -- Solo maquinas de verdad: se descartan las pruebas desde el navegador y
    -- desde la propia maquina de desarrollo.
    and coalesce(details->>'runtime', '') = 'Electron'
    and coalesce(details->>'ipAddress', '') not in ('127.0.0.1', '::1', 'localhost')
  order by created_at desc`, [String(DIAS)]);

if (!rows.length) {
  console.log(`No hubo ningun inicio de sesion en los ultimos ${DIAS} dias.`);
  await c.end();
  process.exit(1);
}

// La ultima vez que entro cada equipo confirma la sesion, no la version.
const porEquipo = new Map();
for (const r of rows) {
  const clave = `${r.equipo} · ${r.ip}`;
  if (!porEquipo.has(clave)) porEquipo.set(clave, { ...r, ingresos: 0, conSesion: 0 });
  const e = porEquipo.get(clave);
  e.ingresos += 1;
  if (r.con_sesion === "true") e.conSesion += 1;
}

console.log(`Inicios de sesion en los ultimos ${DIAS} dias: ${rows.length}, en ${porEquipo.size} equipo(s)\n`);
const pendientes = [];
for (const [clave, e] of porEquipo) {
  const ultimoConSesion = e.con_sesion === "true";
  if (!ultimoConSesion) pendientes.push(clave);
  const fecha = new Date(e.created_at).toLocaleString("es-AR");
  console.log(`  ${ultimoConSesion ? "CON SESION " : "sin sesion "} ${clave}`);
  console.log(`      ultimo ingreso: ${fecha} (${e.quien}, ${e.entorno})`);
  console.log(`      ${e.conSesion} de ${e.ingresos} ingresos con sesion`);
}

console.log("");
if (!pendientes.length) {
  console.log(">>> TODAS las maquinas vistas entran con sesion Auth.");
  console.log(`    Esto NO confirma que usen ${VERSION}. Comprobar la version`);
  console.log("    de cada caja activa antes de cerrar `anon` en la base.");
} else {
  console.log(`>>> FALTAN ${pendientes.length} maquina(s) por actualizar a ${VERSION}:`);
  for (const p of pendientes) console.log(`      ${p}`);
  console.log("    NO cerrar los permisos todavia: esas maquinas se quedarian sin cobrar.");
}

await c.end();
process.exit(pendientes.length ? 1 : 0);
