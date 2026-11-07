import { useEffect, useRef, useState } from 'react';
import Camera from 'lucide-react/dist/esm/icons/camera.js';
import X from 'lucide-react/dist/esm/icons/x.js';

export default function Scanner({ onScan, onClose }) {
  const videoRef = useRef(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(true);
  useEffect(() => {
    let cancelled = false;
    let controls;
    let delivered = false;
    let stream;
    const video = videoRef.current;
    const stop = () => {
      controls?.stop();
      stream?.getTracks().forEach((track) => track.stop());
      video?.srcObject?.getTracks().forEach((track) => track.stop());
      if (video) video.srcObject = null;
    };
    async function start() {
      try {
        if (!window.isSecureContext) throw new Error('Para usar la cámara abrí Rebu desde su dirección HTTPS.');
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador no permite acceder a la cámara. Podés escribir el código en el buscador.');
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (cancelled) return;
        const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 160, delayBetweenScanSuccess: 500 });
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) { stop(); return; }
        controls = await reader.decodeFromStream(stream, video, (result, _error, scannerControls) => {
          if (result && !cancelled && !delivered) {
            const code = result.getText().trim();
            if (!code || code.length > 120 || [...code].some((character) => character.charCodeAt(0) < 32)) {
              setError('Ese código no corresponde a un producto. Probá con el código de barras de la etiqueta.');
              return;
            }
            delivered = true;
            scannerControls.stop();
            stop();
            navigator.vibrate?.(70);
            onScan(code);
          }
        });
        if (cancelled || delivered) stop();
        else setStarting(false);
      } catch (cause) {
        stop();
        if (cancelled) return;
        setStarting(false);
        setError(cause.name === 'NotAllowedError'
          ? 'El acceso a la cámara está bloqueado. Habilitalo en los permisos del navegador o escribí el código.'
          : cause.name === 'NotFoundError'
            ? 'No encontramos una cámara disponible. Podés escribir el código en el buscador.'
            : cause.name === 'NotReadableError'
              ? 'La cámara está siendo usada por otra aplicación. Cerrala y volvé a intentar.'
              : cause.message || 'No pudimos abrir la cámara. Podés escribir el código.');
      }
    }
    start();
    const visibility = () => { if (document.hidden) { stop(); onClose(); } };
    document.addEventListener('visibilitychange', visibility);
    return () => { cancelled = true; stop(); document.removeEventListener('visibilitychange', visibility); };
  }, [onClose, onScan]);
  const dialogRef = useRef(null);
  useEffect(() => { dialogRef.current.showModal(); }, []);
  return <dialog className="scanner-dialog" ref={dialogRef} onCancel={(event) => { event.preventDefault(); onClose(); }} aria-labelledby="scanner-title">
    <div className="scanner-top"><div><span className="eyebrow">LECTOR DE PRODUCTOS</span><h2 id="scanner-title">Escanear código</h2></div><button className="icon-button" aria-label="Cerrar cámara" onClick={onClose}><X /></button></div>
    <div className="camera-frame"><video ref={videoRef} muted playsInline autoPlay aria-label="Vista de la cámara" /><div className="scan-guide" aria-hidden="true" />{starting ? <p className="camera-message">Abriendo cámara…</p> : null}</div>
    <div className="scanner-help">{error ? <p role="alert" className="notice danger">{error}</p> : <><Camera size={20} /><p>Apuntá al código de barras.<br /><span>Buscá buena luz y mantené el celular quieto.</span></p></>}
      <button className="button secondary" onClick={onClose}>Escribir código manualmente</button></div>
  </dialog>;
}
