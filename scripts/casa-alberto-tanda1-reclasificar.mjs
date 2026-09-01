// Tanda 1 del plan Casa Alberto: reclasificar lo ya guardado, SIN volver a scrapear.
//   - 74 enlaces que leyeron la pagina del carrito  -> 'dubious_link' ("Enlace dudoso")
//   - 20 divisores de bulto mal detectados          -> divisor corregido + a re-chequear
// No toca los `approved` (validados a mano) ni los casos de cociente ambiguo.
// Uso:  node aplicar-tanda1.mjs <archivo-respaldo.json> [--aplicar]
// Sin --aplicar corre en seco: hace todo, verifica y deshace.

import fs from 'node:fs';
import pg from 'pg';

const RESPALDO = process.argv[2];
const APLICAR = process.argv.includes('--aplicar');
if (!RESPALDO) { console.error('Falta la ruta del respaldo.'); process.exit(1); }

// ---------------- detector (identico al prototipo validado) ----------------
const MEDIDA = /^\s*(?:"|(?:cm|mm|mts|mt|m|kgs|kg|k|grs|gr|g|lts|lt|l|ml|cc)\b\.?)/;
const PAREN_DIMENSION = /\((?:[\d.,\s]|x|×)*(?:cm|mm|mts|mt|m|kgs|kg|grs|gr|g|lts|lt|l|ml|cc)\s*\.?\s*\)/g;
const PACK_KW = 'bulto|pack|packing|display|blister|bolson|bolsón|plancha|tira';
const RE_BULTO_NUM_X = new RegExp('(?:' + PACK_KW + ')\\s*(\\d{1,4})\\s*(?:u|un|uni|unid|unidad|unidades)?\\s*x', 'g');
const RE_BULTO_X_NUM = new RegExp('(?:' + PACK_KW + ')[^0-9a-z]{0,3}x\\s*(\\d{1,4})', 'g');

const detectPackSize = (titulo) => {
  let t = String(titulo || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!t) return { pack: 1, rule: 'sin-titulo' };
  t = t.replace(PAREN_DIMENSION, ' ');
  const cands = [];
  const empujar = (n, rule, peso, resto) => {
    if (!Number.isInteger(n) || n <= 1 || n >= 10000) return;
    if (resto !== undefined && MEDIDA.test(resto)) return;
    cands.push({ n, rule, peso });
  };
  for (const m of t.matchAll(RE_BULTO_NUM_X)) empujar(Number(m[1]), 'bulto', 3);
  for (const m of t.matchAll(RE_BULTO_X_NUM)) empujar(Number(m[1]), 'bulto', 3);
  for (const m of t.matchAll(/x\s*(\d{1,4})\s*(?:u|un|uni|unid|unidad|unidades|pz|pzs)\b\.?/g)) empujar(Number(m[1]), 'xNu', 2);
  for (const m of t.matchAll(/x\s*(\d{1,4})(?![.,]\d)/g)) {
    const resto = t.slice(m.index + m[0].length);
    if (/\d$/.test(t.slice(0, m.index))) continue;
    empujar(Number(m[1]), 'xN', 1, resto);
  }
  if (cands.length === 0) return { pack: 1, rule: 'sin-senal' };
  const maxPeso = Math.max(...cands.map((c) => c.peso));
  const mejores = cands.filter((c) => c.peso === maxPeso);
  const distintos = [...new Set(mejores.map((c) => c.n))];
  if (distintos.length > 1) return { pack: null, rule: 'ambiguo' };
  return { pack: distintos[0], rule: mejores[0].rule };
};

const esFicha = (u) => /pedido\/detalle(?:_mobile)?\.php\?[^#]*\bidp=\d+/i.test(String(u || ''));
const motivoRoto = (titulo, url) => {
  const t = String(titulo || '').trim().toLowerCase();
  if (!t || t === 'mi carrito' || t === 'carrito') return 'titulo_de_carrito';
  if (!esFicha(url)) return 'url_no_es_ficha';
  return null;
};

// ---------------- conexion ----------------
const envPath = 'H:/PERSONAL/Programación/Ramiro Proyecto/Punto de Venta Rebu - Release/.env';
const env = Object.fromEntries(fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
  .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)]; }));
const client = new pg.Client({
  host: env.SUPABASE_DB_HOST, port: Number(env.SUPABASE_DB_PORT || 5432),
  database: env.SUPABASE_DB_NAME, user: env.SUPABASE_DB_USER,
  password: env.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false },
});
await client.connect();

const { rows } = await client.query(`
  select id, title, supplier_links
  from public.products
  where is_active and supplier_links->'casa_alberto' is not null
  order by id`);

// ---------------- respaldo ANTES de tocar nada ----------------
fs.writeFileSync(RESPALDO, JSON.stringify(rows.map((r) => ({ id: r.id, supplier_links: r.supplier_links })), null, 1));
console.log(`Respaldo de ${rows.length} filas -> ${RESPALDO}`);

// ---------------- decidir que hacer con cada fila ----------------
const ahora = new Date().toISOString();
const cambios = [];
for (const r of rows) {
  const ca = r.supplier_links.casa_alberto || {};
  const pt = { ...(ca.price_tracking || {}) };

  const motivo = motivoRoto(ca.foundTitle, ca.productUrl);
  if (motivo) {
    // El precio leido es el total del carrito: no es un dato, es ruido.
    // Se borran los derivados para que la app no calcule un estado sobre mentira.
    delete pt.estimatedCost; delete pt.approvedCost; delete pt.approvedAt;
    delete pt.unitSupplierPrice; delete pt.lastSupplierPrice; delete pt.rawSupplierPrice;
    pt.reviewStatus = 'dubious_link';
    pt.brokenReason = motivo;
    pt.brokenDetectedAt = ahora;
    cambios.push({ id: r.id, title: r.title, tipo: 'roto', pt, ca });
    continue;
  }

  if (pt.reviewStatus === 'approved') continue;           // validado a mano: intocable
  const packCA = detectPackSize(ca.foundTitle);
  const packRebu = detectPackSize(r.title);
  if (packCA.pack === null) continue;                      // ambiguo
  if (packRebu.pack !== 1) continue;                       // cociente ambiguo: decide una persona
  const divisorActual = Number(pt.unitDivisor || 1) || 1;
  if (packCA.pack === divisorActual) continue;

  // Se fija el divisor y se borran los derivados: la app los recalcula con SU formula.
  delete pt.unitSupplierPrice; delete pt.estimatedCost; delete pt.approvedCost; delete pt.approvedAt;
  pt.unitDivisor = packCA.pack;
  pt.unitDivisorRule = packCA.rule;
  pt.unitDivisorFixedAt = ahora;
  pt.reviewStatus = 'unchecked';
  cambios.push({ id: r.id, title: r.title, tipo: 'divisor', de: divisorActual, a: packCA.pack, pt, ca });
}

const rotos = cambios.filter((c) => c.tipo === 'roto');
const divisores = cambios.filter((c) => c.tipo === 'divisor');
console.log(`\nA cambiar: ${cambios.length}   (enlaces rotos: ${rotos.length}, divisores: ${divisores.length})`);

// ---------------- aplicar ----------------
await client.query('begin');
let escritas = 0;
for (const c of cambios) {
  const nuevoCA = { ...c.ca, price_tracking: c.pt };
  const res = await client.query(
    `update public.products
       set supplier_links = jsonb_set(supplier_links, '{casa_alberto}', $2::jsonb, true)
     where id = $1`,
    [c.id, JSON.stringify(nuevoCA)]
  );
  escritas += res.rowCount;
}

// ---------------- verificar DENTRO de la transaccion ----------------
const v = await client.query(`
  select
    count(*) filter (where pt->>'reviewStatus' = 'dubious_link' and pt->>'brokenReason' is not null) as rotos_marcados,
    count(*) filter (where pt->>'unitDivisorFixedAt' is not null)                                    as divisores_corregidos,
    count(*) filter (where pt->>'reviewStatus' = 'approved')                                         as aprobados_intactos,
    count(*) filter (where pt->>'reviewStatus' = 'dubious_link' and pt->>'estimatedCost' is not null) as rotos_con_costo_fantasma
  from (select supplier_links->'casa_alberto'->'price_tracking' as pt
        from public.products
        where is_active and supplier_links->'casa_alberto' is not null) s`);

console.log('\n--- VERIFICACION (dentro de la transaccion) ---');
console.log('  filas escritas             :', escritas);
console.log('  rotos marcados             :', v.rows[0].rotos_marcados, '(esperado', rotos.length + ')');
console.log('  divisores corregidos       :', v.rows[0].divisores_corregidos, '(esperado', divisores.length + ')');
console.log('  aprobados intactos         :', v.rows[0].aprobados_intactos, '(esperado 90)');
console.log('  rotos con costo fantasma   :', v.rows[0].rotos_con_costo_fantasma, '(esperado 0)');

const ok = Number(v.rows[0].rotos_marcados) === rotos.length
  && Number(v.rows[0].divisores_corregidos) === divisores.length
  && Number(v.rows[0].aprobados_intactos) === 90
  && Number(v.rows[0].rotos_con_costo_fantasma) === 0
  && escritas === cambios.length;

if (!ok) {
  await client.query('rollback');
  console.log('\nX LA VERIFICACION NO DIO. Se deshizo todo, la base quedo igual que antes.');
} else if (APLICAR) {
  await client.query('commit');
  console.log('\nOK CONFIRMADO. Los cambios quedaron aplicados.');
} else {
  await client.query('rollback');
  console.log('\nEnsayo en seco: verificacion OK, pero se deshizo. Correr con --aplicar para confirmar.');
}
await client.end();
