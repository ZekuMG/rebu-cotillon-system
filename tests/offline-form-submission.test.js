import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '@babel/parser';

const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
const app = ast.program.body.find((node) => node.type === 'ExportDefaultDeclaration').declaration;

// Execute the real callbacks up to their offline boundary. Native form defaults
// happen before an awaited guard resolves, even when that guard returns early.
for (const name of ['handleAddItem', 'saveEditProduct', 'confirmDeleteProduct', 'handleConfirmRefund', 'handleSaveEditedTransaction']) {
  test(`${name} cancela el formulario antes de esperar el guardado local`, async () => {
    const declaration = app.body.body.flatMap((node) => node.declarations || []).find((node) => node.id.name === name);
    assert.ok(declaration, `Missing callback ${name}`);
    const callback = source.slice(declaration.init.start, declaration.init.end);
    const create = new Function('blockIfOfflineReadonly', `return (${callback});`);
    const handler = create(async () => true);
    const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    const result = handler(event, { id: 8, categories: ['Fiesta'] }, 'Prueba');
    assert.equal(event.defaultPrevented, true, 'El formulario podría navegar o recargar antes de persistir el pendiente');
    await result;
  });
}
