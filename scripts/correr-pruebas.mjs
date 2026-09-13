// Corre todas las pruebas de tests/.
//
// Antes la lista de archivos estaba escrita a mano adentro de package.json, en una
// sola linea de 2.400 caracteres. El problema no era que fuera fea: era que agregar
// una prueba nueva y olvidarse de anotarla la dejaba muerta, sin que nada avisara.
// Paso: `product-image-editor.test.js` y `expense-date.test.js` existian, pasaban,
// y no las corria nadie. Siete comprobaciones que no protegian nada.
//
// Aca la lista sale de leer la carpeta, asi que no se puede olvidar ninguna.
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const carpeta = join(raiz, "tests");

const archivos = readdirSync(carpeta)
  .filter((n) => n.endsWith(".test.js"))
  .sort()
  .map((n) => join("tests", n));

if (archivos.length === 0) {
  console.error("No hay ni una prueba en tests/. Algo esta mal.");
  process.exit(1);
}

console.log(`Corriendo ${archivos.length} archivos de prueba de tests/\n`);

const { status } = spawnSync(process.execPath, ["--test", ...archivos], {
  cwd: raiz,
  stdio: "inherit",
});

process.exit(status === null ? 1 : status);
