import { useState } from 'react';
import AssistantChat from './AssistantChat';

/**
 * Widget flottant de l'assistant IA — bulle 🤖 en bas à droite de TOUTES les
 * interfaces client/gérant : le chat s'ouvre en panneau sans quitter la page.
 * La bulle est TOUJOURS visible ; si l'assistant n'est pas activé pour le
 * compte, le panneau l'explique (AssistantChat). Le panneau reste monté après
 * la première ouverture : la conversation et le défilement survivent aux
 * fermetures et aux changements de page.
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
      {/* Panneau de chat (monté à la 1ʳᵉ ouverture, masqué ensuite — pas démonté) */}
      {mounted && (
        <div style={{
          position: 'fixed', bottom: 88, right: 22, zIndex: 300,
          width: 'min(400px, calc(100vw - 32px))', height: 'min(600px, calc(100vh - 130px))',
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(30,27,75,0.28)',
          display: open ? 'flex' : 'none', flexDirection: 'column',
        }}>
          <AssistantChat onClose={() => setOpen(false)} />
        </div>
      )}

      {/* Bulle flottante */}
      <button
        onClick={toggle}
        title={open ? 'Fermer l\'assistant' : 'Assistant IA — posez votre question'}
        aria-label={open ? 'Fermer l\'assistant IA' : 'Ouvrir l\'assistant IA'}
        style={{
          position: 'fixed', bottom: 20, right: 22, zIndex: 300,
          width: 54, height: 54, borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: 'linear-gradient(135deg,#4f46e5,#8b5cf6)', color: '#fff',
          fontSize: open ? 20 : 26, fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 10px 28px rgba(79,70,229,0.45)',
          transition: 'transform 0.15s ease, box-shadow 0.15s ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = '0 14px 34px rgba(79,70,229,0.55)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 10px 28px rgba(79,70,229,0.45)'; }}
      >
        {open ? '✕' : '🤖'}
      </button>
    </>
  );
}
