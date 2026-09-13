// ¿Van a poder entrar con sesion TODOS los operadores activos?
//
// No hace falta ninguna contraseña: se comprueba que el vinculo con Supabase Auth
// este completo y sano. Si a alguno le falta algo, su PC entraria SIN sesion aunque
// tenga la version nueva, y cerrar los permisos de `anon` la dejaria sin cobrar.
//
//   npm run audit:vinculos
//
// Devuelve 0 cuando todos los operadores activos pueden abrir sesion.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import process from "node:process";

const require = createRequire(import.meta.url);
const { Client } = require("pg");

const leer = (ruta) => { try { return readFileSync(ruta, "utf8"); } catch { return ""; } };
const env = Object.fromEntries(
  [leer(".env"), leer(".env.local")].join("\n").split(/\r?\n/)
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "").trim()];
    }),
);

if (!env.SUPABASE_DB_HOST) {
  console.error("Faltan las credenciales de la base en .env / .env.local");
  process.exit(1);
}

const c = new Client({
  host: env.SUPABASE_DB_HOST,
  port: Number(env.SUPABASE_DB_PORT || 5432),
  user: env.SUPABASE_DB_USER,
  password: env.SUPABASE_DB_PASSWORD,
  database: env.SUPABASE_DB_NAME || "postgres",
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const { rows } = await c.query(`
  select
    u.display_name                                     as operador,
    u.role                                             as rol,
    (u.auth_user_id is not null)                       as tiene_vinculo,
    (u.auth_email is not null)                         as tiene_mail,
    (a.id is not null)                                 as la_cuenta_existe,
    (a.email_confirmed_at is not null)                 as mail_confirmado,
    (a.encrypted_password is not null
       and a.encrypted_password <> '')                 as tiene_clave,
    (a.banned_until is null or a.banned_until < now()) as no_bloqueada,
    lower(coalesce(a.email, '')) = lower(coalesce(u.auth_email, '')) as mail_coincide,
    (u.password_hash is not null)                      as tiene_clave_en_el_pos,
    a.last_sign_in_at,
    (u.updated_at > coalesce(a.updated_at, to_timestamp(0)))        as perfil_mas_nuevo
  from public.app_users u
  left join auth.users a on a.id = u.auth_user_id
  where u.is_active
  order by u.display_name`);

console.log(`Operadores activos: ${rows.length}\n`);

let todosListos = true;
for (const r of rows) {
  const problemas = [];
  if (!r.tiene_vinculo) problemas.push("no esta vinculado a Supabase Auth");
  if (!r.tiene_mail) problemas.push("no tiene auth_email");
  if (!r.la_cuenta_existe) problemas.push("el vinculo apunta a una cuenta que no existe");
  if (!r.mail_confirmado) problemas.push("el mail de la cuenta no esta confirmado");
  if (!r.tiene_clave) problemas.push("la cuenta de Auth no tiene contraseña");
  if (!r.no_bloqueada) problemas.push("la cuenta esta bloqueada");
  if (!r.mail_coincide) problemas.push("el mail del operador y el de la cuenta no coinciden");
  if (!r.tiene_clave_en_el_pos) problemas.push("no tiene contraseña en el punto de venta");

  const listo = problemas.length === 0;
  if (!listo) todosListos = false;
  const ultimo = r.last_sign_in_at ? new Date(r.last_sign_in_at).toLocaleString("es-AR") : "nunca";
  console.log(`  ${listo ? "LISTO   " : "PROBLEMA"} ${String(r.operador).padEnd(12)} (${r.rol})`);
  console.log(`      su cuenta abrio sesion por ultima vez: ${ultimo}`);
  if (r.perfil_mas_nuevo) {
    console.log("      · el perfil se toco despues que la cuenta: si le cambiaron la");
    console.log("        contraseña en un solo lado, va a entrar pero SIN sesion");
  }
  for (const p of problemas) console.log(`      ⚠ ${p}`);
}

console.log("");
console.log("El programa valida la contraseña contra el punto de venta y despues abre");
console.log("sesion con esa MISMA contraseña en Supabase Auth. Que una cuenta ya haya");
console.log("abierto sesion alguna vez prueba que las dos estaban sincronizadas.");
console.log("");
console.log(todosListos
  ? ">>> Todos pueden abrir sesion. Falta solo que cada PC tenga la version con sesion."
  : ">>> HAY OPERADORES QUE NO VAN A PODER: revisar antes de cerrar los permisos.");

await c.end();
process.exit(todosListos ? 0 : 1);
