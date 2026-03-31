import React from 'react';
import ReactDOM from 'react-dom/client';
import DebugAppShell from './components/DebugAppShell.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <DebugAppShell />
  </React.StrictMode>,
);
