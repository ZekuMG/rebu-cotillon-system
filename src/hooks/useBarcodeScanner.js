import { useEffect, useCallback, useRef } from 'react';

export const useBarcodeScanner = ({ 
  isEnabled = true,
  onScan,
  onInputScan,  // callback cuando se escanea en un input (para limpiar)
}) => {
  const bufferRef = useRef('');
  const lastKeyTimeRef = useRef(0);
  const isInInputRef = useRef(false);
  
  const TIMEOUT_LIMIT = 50; // ms entre teclas (escáner es muy rápido)
  const MIN_LENGTH = 3;     // Mínimo caracteres para considerar código válido

  const handleScan = useCallback((code, wasInInput) => {
    if (onScan && code) {
      onScan(code, wasInInput);
    }
    if (wasInInput && onInputScan) {
      onInputScan(code);
    }
  }, [onScan, onInputScan]);

  useEffect(() => {
    if (!isEnabled) return;

    const handleKeyDown = (e) => {
      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTimeRef.current;
      
      // Detectar si estamos en un input/textarea
      const isInInput = ['INPUT', 'TEXTAREA'].includes(e.target.tagName);
      isInInputRef.current = isInInput;

      // Enter = fin del escaneo
      if (e.key === 'Enter') {
        const buffer = bufferRef.current;
        
        if (buffer.length >= MIN_LENGTH) {
          // Es un código escaneado por máquina (fue muy rápido)
          
          // ✨ AQUÍ ESTÁ LA MAGIA: Secuestramos el evento Enter
          // Para evitar que la barra de búsqueda reaccione a este Enter
          e.preventDefault();
          e.stopPropagation(); 
          
          handleScan(buffer, isInInput);
        }
        
        bufferRef.current = '';
        return;
      }

      // Acumular solo caracteres imprimibles
      if (e.key.length === 1) {
        if (timeDiff > TIMEOUT_LIMIT) {
          // Mucho tiempo desde la última tecla = escritura humana manual (o nueva secuencia)
          bufferRef.current = e.key;
        } else {
          // Tecla rápida (< 50ms) = escritura de máquina (escáner), continuar acumulando
          bufferRef.current += e.key;
        }
      }

      lastKeyTimeRef.current = currentTime;
    };

    // ✨ { capture: true } hace que el escáner intercepte la tecla ANTES que cualquier input de React
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [isEnabled, handleScan]);
};