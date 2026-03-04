// src/components/FancyPrice.jsx
import React from 'react';
import { formatCurrency } from '../utils/helpers';

/**
 * Componente visual para renderizar precios con los centavos más pequeños.
 * Ideal para Dashboards y Punto de Venta.
 *
 * @param {number|string} amount - El monto a formatear
 * @param {string} className - Clases de Tailwind extra (color, tamaño, font-weight)
 */
export const FancyPrice = ({ amount, className = "" }) => {
  const formatted = formatCurrency(amount);
  
  // Dividimos por la coma de los decimales (formato es-AR)
  const parts = formatted.split(',');
  
  // Si por alguna razón el formateador no devolvió coma, lo mostramos entero
  if (parts.length === 1) {
    return <span className={className}>{formatted}</span>;
  }
  
  // parts[0] es la parte entera (ej: "$ 1.500")
  // parts[1] son los centavos (ej: "00")
  return (
    <span className={className}>
      {parts[0]}
      <span className="text-[0.65em] font-semibold opacity-75">,{parts[1]}</span>
    </span>
  );
};