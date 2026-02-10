// src/utils/devGenerator.js
// ♻️ REFACTOR: Extraído de HistoryView.jsx — Generador de transacciones aleatorias
// ⚠️ WARNING: Solo para desarrollo/testing. No usar en producción.

/**
 * Genera transacciones y logs aleatorios para testing.
 * @param {object} config - Configuración del generador
 * @param {number} config.count - Cantidad de transacciones a generar
 * @param {string} config.dateStart - Fecha inicio (YYYY-MM-DD)
 * @param {string} config.dateEnd - Fecha fin (YYYY-MM-DD)
 * @param {string} config.timeStart - Hora inicio (HH)
 * @param {string} config.timeEnd - Hora fin (HH)
 * @param {Array} inventory - Lista de productos del inventario
 * @returns {{ transactions: Array, logs: Array }} - Transacciones y logs generados
 */
export const generateRandomTransactions = (config, inventory) => {
  const { count, dateStart, dateEnd, timeStart, timeEnd } = config;
  const products = inventory || [];

  if (products.length === 0) {
    return { transactions: [], logs: [], error: 'Sin productos en inventario' };
  }

  const payments = ['Efectivo', 'MercadoPago', 'Debito', 'Credito'];
  const users = ['Dueño', 'Vendedor'];

  const end = dateEnd ? new Date(dateEnd + 'T23:59:59') : new Date();
  const start = dateStart
    ? new Date(dateStart + 'T00:00:00')
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const startHour = parseInt(timeStart, 10) || 9;
  const endHour = parseInt(timeEnd, 10) || 21;

  const newLogs = [];
  const newTransactions = [];

  for (let i = 0; i < count; i++) {
    const randomTime =
      start.getTime() + Math.random() * (end.getTime() - start.getTime());
    const randomDate = new Date(randomTime);

    // Omitir horario 14-16 hs (siesta)
    let randomHour;
    do {
      randomHour =
        startHour + Math.floor(Math.random() * (endHour - startHour));
    } while (randomHour >= 14 && randomHour < 16);

    const randomMinute = Math.floor(Math.random() * 60);

    const dateStr = randomDate.toLocaleDateString('es-AR');
    const timeStr = `${randomHour.toString().padStart(2, '0')}:${randomMinute
      .toString()
      .padStart(2, '0')}`;

    const numProducts = 1 + Math.floor(Math.random() * 5);
    const selectedProducts = [];
    const usedProducts = new Set();

    for (let j = 0; j < numProducts && j < products.length; j++) {
      let product;
      let attempts = 0;
      do {
        product = products[Math.floor(Math.random() * products.length)];
        attempts++;
      } while (usedProducts.has(product.id) && attempts < 10);

      if (!usedProducts.has(product.id)) {
        usedProducts.add(product.id);
        const qty = 1 + Math.floor(Math.random() * 4);

        selectedProducts.push({
          id: product.id,
          productId: product.id,
          title: product.title,
          price: product.price,
          qty: qty,
          categories: product.categories || [],
          category: product.category || '',
        });
      }
    }

    if (selectedProducts.length === 0) continue;

    const total = selectedProducts.reduce(
      (sum, p) => sum + p.price * p.qty,
      0
    );
    const payment = payments[Math.floor(Math.random() * payments.length)];
    const user = users[Math.floor(Math.random() * users.length)];
    const txId = 1001 + i + Math.floor(Math.random() * 9000);
    const installments = payment === 'Credito' ? Math.floor(Math.random() * 6) + 1 : 0;

    newTransactions.push({
      id: txId,
      date: dateStr,
      time: timeStr,
      user: user,
      total: total,
      subtotal: total,
      payment: payment,
      installments: installments,
      items: selectedProducts,
      status: 'completed',
    });

    newLogs.push({
      id: Date.now() + i + Math.random(),
      timestamp: timeStr,
      date: dateStr,
      action: 'Venta Realizada',
      user: user,
      details: {
        transactionId: txId,
        items: selectedProducts,
        total: total,
        payment: payment,
        installments: installments,
      },
      reason: 'Venta generada para pruebas',
    });
  }

  return { transactions: newTransactions, logs: newLogs, error: null };
};
