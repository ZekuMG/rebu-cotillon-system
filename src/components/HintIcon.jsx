import React, { useState } from 'react';
import { HelpCircle } from 'lucide-react';

/**
 * Componente HintIcon - Icono de ayuda/información reutilizable
 * 
 * Muestra un icono gris oscuro que, al pasar el mouse, despliega un tooltip 
 * flotante centrado sobre toda la interfaz.
 * 
 * @param {string} hint - Texto del tooltip (mensaje de ayuda)
 * @param {number} size - Tamaño del icono en píxeles (default: 16)
 * @param {string} className - Clases Tailwind adicionales para el contenedor
 * 
 * @example
 * <HintIcon hint="Esta es una instrucción de ayuda" />
 * <HintIcon hint="Campo opcional" size={14} />
 */
export const HintIcon = ({ 
  hint, 
  size = 16,
  className = ''
}) => {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div 
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Icono */}
      <HelpCircle 
        size={size} 
        className="text-slate-400 hover:text-slate-500 cursor-help transition-colors"
        strokeWidth={2}
      />
      
      {/* Tooltip Flotante - Centrado en pantalla */}
      {showTooltip && hint && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999] pointer-events-none">
          {/* Contenedor del mensaje - con sombra y animación */}
          <div className="bg-slate-600 text-slate-100 text-xs px-3 py-1.5 rounded-lg shadow-xl border border-slate-500 animate-in fade-in duration-150">
            {hint}
          </div>
        </div>
      )}
    </div>
  );
};

export default HintIcon;
