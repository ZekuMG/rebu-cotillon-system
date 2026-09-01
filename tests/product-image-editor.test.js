import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateAdjustedImageLayout } from '../src/utils/productImageEditor.js';

test('foto completa conserva una imagen horizontal dentro del marco cuadrado', () => {
  const layout = calculateAdjustedImageLayout({
    imageWidth: 1600,
    imageHeight: 900,
    outputSize: 1200,
    fitMode: 'contain',
  });

  assert.equal(layout.drawWidth, 1200);
  assert.equal(layout.drawHeight, 675);
  assert.equal(layout.x, 0);
  assert.equal(layout.y, 262.5);
});

test('llenar marco cubre el cuadrado y mantiene centrada una imagen vertical', () => {
  const layout = calculateAdjustedImageLayout({
    imageWidth: 900,
    imageHeight: 1600,
    outputSize: 1200,
    fitMode: 'cover',
  });

  assert.equal(layout.drawWidth, 1200);
  assert.ok(Math.abs(layout.drawHeight - (1600 / 0.75)) < 0.000001);
  assert.equal(layout.x, 0);
  assert.ok(layout.y < 0);
});

test('el desplazamiento queda limitado para no sacar la foto del marco', () => {
  const layout = calculateAdjustedImageLayout({
    imageWidth: 1600,
    imageHeight: 900,
    outputSize: 1200,
    fitMode: 'cover',
    offsetX: 999,
    offsetY: -999,
  });

  assert.ok(Math.abs(layout.offsetY) === 0);
  assert.equal(layout.offsetX, layout.maxOffsetX);
  assert.ok(Math.abs(layout.x) < 0.000001);
});
