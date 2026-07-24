import { useState } from 'react';
import AssistantChat from './AssistantChat';

/**
 * Assistant IA — bouton 🤖 de la BARRE DU HAUT (à côté de la cloche de
 * notifications, rendu par Header pour les rôles client/gérant) : présent sur
 * toutes les pages, il n'entre jamais en conflit avec les panneaux flottants
 * de saisie (aperçu d'appro, aperçu de vente…). Le chat s'ouvre en panneau
 * sous le header, à droite, par-dessus la page en cours.
 * Si l'assistant n'est pas activé pour le compte, le panneau l'explique.
 * Le panneau reste monté après la première ouverture : la conversation
 * survit aux fermetures et aux changements de page.
 */
export default function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const toggle = () => {
    if (!open) setMounted(true);
    setOpen((v) => !v);
  };

  return (
    <>
      {/* Bouton du header — même gabarit que la cloche de notifications */}
      <button
        onClick={toggle}
        title={open ? 'Fermer l\'assistant' : 'Assistant IA — posez votre question'}
        aria-label={open ? 'Fermer l\'assistant IA' : 'Ouvrir l\'assistant IA'}
        style={{
          position: 'relative', background: open ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.18)',
          border: '1px solid rgba(255,255,255,0.3)',
          cursor: 'pointer', padding: '7px 9px', borderRadius: 8,
          fontSize: '1.1rem', lineHeight: 1, color: '#fff',
          transition: 'background 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.32)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = open ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.18)'; }}
      >
        🤖
      </button>

      {/* Panneau de chat sous le header (monté à la 1ʳᵉ ouverture, masqué ensuite) */}
      {mounted && (
        <div style={{
          position: 'fixed', top: 74, right: 16, zIndex: 950,
          width: 'min(400px, calc(100vw - 32px))', height: 'min(600px, calc(100vh - 96px))',
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(30,27,75,0.28)',
          display: open ? 'flex' : 'none', flexDirection: 'column',
        }}>
          <AssistantChat onClose={() => setOpen(false)} />
        </div>
      )}
    </>
  );
}
