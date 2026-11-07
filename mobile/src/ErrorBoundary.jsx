import { Component } from 'react';

export default class ErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <main className="login-page"><section className="login-panel"><h1>No pudimos abrir esta pantalla</h1><p className="notice">Revisá la conexión y volvé a abrir Rebu. Si estabas confirmando un movimiento, conservamos su identificador para comprobarlo sin duplicarlo.</p><button className="button primary full" onClick={() => location.reload()}>Volver a abrir Rebu</button></section></main>;
    return this.props.children;
  }
}
