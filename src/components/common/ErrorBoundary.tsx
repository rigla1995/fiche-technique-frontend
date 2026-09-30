import { Component, type ErrorInfo, type ReactNode } from 'react';
import { estErreurDeChunk, rechargerUneFois } from '../../utils/chunkReload';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  /** L'erreur vient du chargement d'un fichier de page (déploiement pendant que l'onglet était ouvert). */
  chunk: boolean;
  /** Rechargement automatique en cours → écran « Mise à jour » au lieu de l'écran d'erreur. */
  miseAJour: boolean;
}

/**
 * Root error boundary. Catches render-time exceptions anywhere in the tree and shows
 * a recoverable fallback instead of a blank white screen. Sits above the router so a
 * crash in any page degrades gracefully rather than taking the whole app down.
 */
class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, chunk: false, miseAJour: false };

  static getDerivedStateFromError(error: unknown): State {
    const chunk = estErreurDeChunk(error);
    return { hasError: true, chunk, miseAJour: chunk };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep a trace; hook an error tracker (Sentry) here when one is configured.
    console.error('[ErrorBoundary]', error, info.componentStack);
    // Après un déploiement, un onglet resté ouvert demande un ancien fichier de page qui
    // n'existe plus : on recharge UNE fois pour prendre la nouvelle version. Si on vient
    // déjà de recharger (garde anti-boucle), on retombe sur l'écran d'erreur classique.
    if (estErreurDeChunk(error) && !rechargerUneFois()) this.setState({ miseAJour: false });
  }

  private handleReload = () => {
    // Fichier de page introuvable : recharger la page COURANTE suffit (nouvelle version).
    if (this.state.chunk) { window.location.reload(); return; }
    this.setState({ hasError: false, chunk: false, miseAJour: false });
    window.location.href = '/';
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.state.miseAJour) {
      return (
        <div
          role="status"
          style={{
            minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#f8fafc', color: '#64748b', fontSize: 15,
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          Mise à jour de LabFlow…
        </div>
      );
    }

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f8fafc',
          padding: 24,
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div
          style={{
            maxWidth: 440,
            width: '100%',
            textAlign: 'center',
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 16,
            padding: '40px 32px',
            boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              margin: '0 auto 20px',
              borderRadius: 14,
              background: 'linear-gradient(135deg, #6366f1, #f59e0b)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
            }}
          >
            ⚠️
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
            Une erreur est survenue
          </h1>
          <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, margin: '0 0 24px' }}>
            Quelque chose s'est mal passé sur cette page. Vos données sont en sécurité.
            Vous pouvez recharger l'application pour continuer.
          </p>
          <button
            onClick={this.handleReload}
            style={{
              background: '#4f46e5',
              color: '#ffffff',
              border: 'none',
              borderRadius: 10,
              padding: '12px 28px',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Recharger LabFlow
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
