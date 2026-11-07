import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import './styles.css';

// Sites does not currently send a frame-ancestors header for static output.
// Do not expose stock controls inside an iframe controlled by another page.
const framed = window.top !== window.self;
createRoot(document.getElementById('root')).render(framed
  ? <main className="login-page"><section className="login-panel"><h1>Abrí Rebu en su propia pestaña</h1><p className="notice">Para ingresar y trabajar con el inventario, abrí la aplicación directamente.</p><a className="button primary full" href={window.location.href} target="_top" rel="noopener">Abrir Rebu Stock</a></section></main>
  : <React.StrictMode><ErrorBoundary><App /></ErrorBoundary></React.StrictMode>);
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch((error) => console.warn('No se pudo preparar la instalación de Rebu Stock.', error)));
}
