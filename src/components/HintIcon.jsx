import React, { useState } from 'react';
import { HelpCircle } from 'lucide-react';

/**
 * HintIcon
 *
 * Muestra un icono de ayuda que despliega un tooltip cerca del cursor.
 * El texto soporta saltos de linea usando "\n".
 */
export const HintIcon = ({ hint, size = 16, className = '' }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });

  const handlePointerMove = (event) => {
    setCursorPosition({
      x: event.clientX + 14,
      y: event.clientY - 12,
    });
  };

  return (
    <div
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onMouseMove={handlePointerMove}
    >
      <HelpCircle
        size={size}
        className="cursor-help text-slate-400 transition-colors hover:text-slate-500"
        strokeWidth={2}
      />

      {showTooltip && hint && (
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{
            left: cursorPosition.x,
            top: cursorPosition.y,
          }}
        >
          <div className="max-w-[260px] whitespace-pre-line rounded-lg border border-slate-500 bg-slate-600 px-3 py-1.5 text-xs text-slate-100 shadow-xl">
            {hint}
          </div>
        </div>
      )}
    </div>
  );
};

export default HintIcon;
