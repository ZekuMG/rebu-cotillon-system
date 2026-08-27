import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Image as ImageIcon,
  Images,
  LoaderCircle,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  WandSparkles,
  X,
} from 'lucide-react';
import { hasPermission } from '../utils/userPermissions';
import {
  AI_IMAGE_REFERENCE_LIMIT,
  AI_IMAGE_SIZES,
  buildAiImageRequest,
  createReferenceFromResult,
  prepareAiImageReference,
} from '../utils/aiImageStudio';
import { invokeAiImageStudio } from '../services/aiImageStudio';
import './AiImageStudioView.css';

const PROMPT_STARTERS = [
  'Foto de producto, fondo blanco limpio, luz suave de estudio',
  'Composición festiva para redes, colores vivos y espacio para texto',
  'Mejorar iluminación, conservar el producto y limpiar el fondo',
];

const downloadResult = (result) => {
  const link = document.createElement('a');
  link.href = result.imageDataUrl;
  link.download = `rebu-ia-${result.id}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
};

export default function AiImageStudioView({ currentUser }) {
  const canGenerate = hasPermission(currentUser, 'aiImages.generate');
  const canEdit = hasPermission(currentUser, 'aiImages.edit');
  const initialMode = canGenerate ? 'generate' : 'edit';
  const [mode, setMode] = useState(initialMode);
  const [prompt, setPrompt] = useState('');
  const [sizeId, setSizeId] = useState('square');
  const [references, setReferences] = useState([]);
  const [results, setResults] = useState([]);
  const [activeResultId, setActiveResultId] = useState(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const activeResult = useMemo(
    () => results.find((result) => result.id === activeResultId) || results[0] || null,
    [activeResultId, results],
  );
  const activeSize = AI_IMAGE_SIZES.find((size) => size.id === sizeId) || AI_IMAGE_SIZES[0];
  const isEditMode = mode === 'edit';
  const modeAllowed = isEditMode ? canEdit : canGenerate;

  useEffect(() => {
    if (mode === 'generate' && !canGenerate && canEdit) setMode('edit');
    if (mode === 'edit' && !canEdit && canGenerate) setMode('generate');
  }, [canEdit, canGenerate, mode]);

  const handleReferenceFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0) return;

    const remaining = Math.max(0, AI_IMAGE_REFERENCE_LIMIT - references.length);
    if (remaining === 0) {
      setError(`Podés usar hasta ${AI_IMAGE_REFERENCE_LIMIT} referencias.`);
      return;
    }

    setError('');
    setIsPreparing(true);
    try {
      const prepared = await Promise.all(files.slice(0, remaining).map(prepareAiImageReference));
      setReferences((current) => [...current, ...prepared].slice(0, AI_IMAGE_REFERENCE_LIMIT));
      setMode('edit');
    } catch (nextError) {
      setError(nextError?.message || 'No se pudo preparar la referencia.');
    } finally {
      setIsPreparing(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    try {
      if (!modeAllowed) throw new Error('Tu usuario no tiene permiso para esta operación.');
      const payload = buildAiImageRequest({ mode, prompt, sizeId, references });
      setIsRunning(true);
      const response = await invokeAiImageStudio(payload);
      const result = {
        id: `${Date.now()}`,
        imageDataUrl: response.imageDataUrl,
        prompt: payload.prompt,
        mode: payload.mode,
        width: Number(response.width || payload.width),
        height: Number(response.height || payload.height),
        model: response.model,
        createdAt: new Date(),
      };
      setResults((current) => [result, ...current].slice(0, 8));
      setActiveResultId(result.id);
    } catch (nextError) {
      setError(nextError?.message || 'No se pudo generar la imagen.');
    } finally {
      setIsRunning(false);
    }
  };

  const useAsReference = () => {
    if (!activeResult || !canEdit) return;
    const reference = createReferenceFromResult(activeResult);
    setReferences((current) => [reference, ...current].slice(0, AI_IMAGE_REFERENCE_LIMIT));
    setMode('edit');
    setPrompt('');
    setError('');
  };

  return (
    <section className="ai-studio-view" aria-label="Estudio de imágenes IA">
      <header className="ai-studio-header">
        <div>
          <span className="ai-studio-eyebrow"><WandSparkles size={14} /> Producción visual</span>
          <h1>Estudio de imágenes IA</h1>
          <p>Generá piezas nuevas o corregí imágenes de producto sin salir de Rebu.</p>
        </div>
        <div className="ai-studio-provider" title="La credencial permanece cifrada en Supabase">
          <span className="ai-studio-provider-dot" />
          <div><strong>Cloudflare Workers AI</strong><small>Conexión protegida por Supabase</small></div>
          <ShieldCheck size={18} />
        </div>
      </header>

      <div className="ai-studio-workbench">
        <form className="ai-studio-controls" onSubmit={handleSubmit}>
          <div className="ai-studio-section-heading">
            <span>01</span><div><strong>Tipo de trabajo</strong><small>Elegí cómo empieza la prueba</small></div>
          </div>
          <div className="ai-studio-mode-switch" role="group" aria-label="Tipo de trabajo">
            <button type="button" disabled={!canGenerate || isRunning} className={mode === 'generate' ? 'is-active' : ''} onClick={() => setMode('generate')}>
              <Sparkles size={17} /> Generar
            </button>
            <button type="button" disabled={!canEdit || isRunning} className={mode === 'edit' ? 'is-active' : ''} onClick={() => setMode('edit')}>
              <ImageIcon size={17} /> Editar
            </button>
          </div>

          {isEditMode && (
            <div className="ai-studio-reference-panel">
              <div className="ai-studio-label-row">
                <label>Imágenes de referencia</label><span>{references.length}/{AI_IMAGE_REFERENCE_LIMIT}</span>
              </div>
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={handleReferenceFiles} />
              <div className="ai-studio-reference-grid">
                {references.map((reference) => (
                  <div className="ai-studio-reference" key={reference.id}>
                    <img src={reference.dataUrl} alt={reference.name} />
                    <button type="button" aria-label={`Quitar ${reference.name}`} onClick={() => setReferences((current) => current.filter((item) => item.id !== reference.id))}><X size={13} /></button>
                  </div>
                ))}
                {references.length < AI_IMAGE_REFERENCE_LIMIT && (
                  <button type="button" className="ai-studio-add-reference" onClick={() => fileInputRef.current?.click()} disabled={isPreparing || isRunning}>
                    {isPreparing ? <LoaderCircle className="animate-spin" size={18} /> : <UploadCloud size={18} />}
                    <span>{references.length ? 'Sumar' : 'Cargar'}</span>
                  </button>
                )}
              </div>
              <small className="ai-studio-help">Rebu reduce cada referencia a 512 px para enviarla de forma eficiente.</small>
            </div>
          )}

          <div className="ai-studio-section-heading">
            <span>02</span><div><strong>Instrucción</strong><small>Describí el resultado que necesitás</small></div>
          </div>
          <div className="ai-studio-prompt-wrap">
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={2000} rows={5} placeholder={isEditMode ? 'Ej.: mantené el producto, quitá el fondo y mejorá la luz...' : 'Ej.: foto de un kit de cumpleaños sobre fondo claro...'} disabled={isRunning} />
            <span>{prompt.length}/2000</span>
          </div>
          <div className="ai-studio-starters" aria-label="Sugerencias de instrucciones">
            {PROMPT_STARTERS.map((starter) => <button type="button" key={starter} onClick={() => setPrompt(starter)} disabled={isRunning}>{starter}</button>)}
          </div>

          <div className="ai-studio-section-heading">
            <span>03</span><div><strong>Formato de salida</strong><small>Listo para catálogo o redes</small></div>
          </div>
          <div className="ai-studio-size-grid">
            {AI_IMAGE_SIZES.map((size) => (
              <button type="button" key={size.id} className={sizeId === size.id ? 'is-active' : ''} onClick={() => setSizeId(size.id)} disabled={isRunning}>
                <span className={`ai-studio-ratio ai-studio-ratio--${size.id}`} />
                <span><strong>{size.label}</strong><small>{size.detail}</small></span>
              </button>
            ))}
          </div>

          {error && <div className="ai-studio-error" role="alert">{error}</div>}
          <button className="ai-studio-run" type="submit" disabled={isRunning || isPreparing || !modeAllowed}>
            {isRunning ? <><LoaderCircle className="animate-spin" size={19} /> Produciendo prueba...</> : <><WandSparkles size={19} /> {isEditMode ? 'Crear edición' : 'Generar imagen'}</>}
          </button>
          <p className="ai-studio-usage-note"><ShieldCheck size={14} /> Usa la cuota diaria de Workers AI; no genera un cargo mientras se mantenga dentro del plan disponible.</p>
        </form>

        <div className="ai-studio-proof-area">
          <div className="ai-studio-proof-strip" aria-label="Flujo de producción">
            <span className={isEditMode && references.length ? 'is-ready' : ''}><i>{isEditMode ? references.length || '—' : 'IA'}</i><b>Origen</b><small>{isEditMode ? 'referencias' : 'desde cero'}</small></span>
            <em />
            <span className={prompt.trim() ? 'is-ready' : ''}><i>{prompt.trim() ? <CheckCircle2 size={14} /> : '—'}</i><b>Orden</b><small>{prompt.trim() ? 'definida' : 'pendiente'}</small></span>
            <em />
            <span className={activeResult ? 'is-ready' : ''}><i>{activeResult ? <CheckCircle2 size={14} /> : '—'}</i><b>Prueba</b><small>{activeResult ? 'lista' : 'sin generar'}</small></span>
          </div>

          <div className={`ai-studio-proof ${isRunning ? 'is-running' : ''}`}>
            {activeResult ? (
              <>
                <img src={activeResult.imageDataUrl} alt={`Resultado: ${activeResult.prompt}`} />
                <div className="ai-studio-proof-meta">
                  <span>{activeResult.mode === 'edit' ? 'EDICIÓN' : 'GENERACIÓN'}</span>
                  <span>{activeResult.width} × {activeResult.height}</span>
                  <span>{activeResult.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </>
            ) : (
              <div className="ai-studio-empty">
                <div><Images size={34} /></div>
                <strong>La próxima prueba aparece acá</strong>
                <p>Prepará la orden a la izquierda y Rebu conservará hasta ocho resultados durante esta sesión.</p>
                <span>{activeSize.detail}</span>
              </div>
            )}
            {isRunning && <div className="ai-studio-processing"><LoaderCircle className="animate-spin" size={28} /><strong>Cloudflare está renderizando</strong><span>Puede demorar algunos segundos</span></div>}
          </div>

          {activeResult && (
            <div className="ai-studio-proof-actions">
              <button type="button" onClick={() => downloadResult(activeResult)}><Download size={17} /> Descargar PNG</button>
              <button type="button" onClick={useAsReference} disabled={!canEdit}><RotateCcw size={17} /> Usar como referencia</button>
            </div>
          )}

          <div className="ai-studio-contact-sheet">
            <div className="ai-studio-contact-title"><span><Images size={16} /> Pruebas de esta sesión</span><small>{results.length}/8</small></div>
            {results.length > 0 ? (
              <div className="ai-studio-result-grid">
                {results.map((result) => (
                  <button type="button" key={result.id} className={activeResult?.id === result.id ? 'is-active' : ''} onClick={() => setActiveResultId(result.id)}>
                    <img src={result.imageDataUrl} alt="" /><span>{result.mode === 'edit' ? 'ED' : 'GEN'}</span>
                  </button>
                ))}
                {results.length < 8 && <div className="ai-studio-result-placeholder"><Plus size={16} /></div>}
              </div>
            ) : <p>Todavía no hay pruebas. Los archivos se guardan cuando los descargás.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
