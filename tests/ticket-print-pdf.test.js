import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = process.cwd();

test('El estilo de impresión del ticket no esconde los PDF exportados', async () => {
  const ticket = await readFile(resolve(root, 'src/components/TicketPrintLayout.jsx'), 'utf8');
  const app = await readFile(resolve(root, 'src/App.jsx'), 'utf8');

  // "Prueba de tickets" queda montada en segundo plano: si su CSS oculta "body *"
  // sin condición, la lista de precios y los presupuestos salen en blanco.
  assert.doesNotMatch(ticket, /^\s*body \* \{/m);
  assert.match(ticket, /body:not\(\[data-pdf-capture='true'\]\) \*/);
  assert.match(ticket, /body:not\(\[data-pdf-capture='true'\]\) #printable-area \*/);

  // La exportación marca el body con esa bandera antes de imprimir.
  assert.match(app, /document\.body\.dataset\.pdfCapture = 'true'/);
});
