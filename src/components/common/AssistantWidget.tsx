import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import AssistantChat from './AssistantChat';
import type { OnboardingEtat } from './AssistantChat';

/**
 * Guide de mise en route — bouton 🤖 de la BARRE DU HAUT (rendu par Header,
 * rôle client uniquement). Le bot n'existe que tant que la configuration
 * souscrite n'est pas entièrement mise en place : il disparaît de lui-même
 * quand tout est fait, et RÉAPPARAÎT automatiquement après un avenant
 * (nouvelle activité, labo, module…) puisque l'état est recalculé en direct
 * côté serveur (données réelles vs souscription).
 */
export default function AssistantWidget() {
  const [etat, setEtat] = useState<OnboardingEtat | null>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const refreshEtat = useCallback(async () => {
    try {
      const { data } = await api.get('/api/ai-assistant/onboarding');
      setEtat(data);
      return data as OnboardingEtat;
    } catch {
      setEtat(null);
      return null;
    }
  }, []);

  useEffect(() => { refreshEtat(); }, [refreshEtat]);

  // Mise en route terminée (ou état inconnu) : pas de bot.
  if (!etat || (etat.complet && !open)) return null;

  const toggle = () => {
    if (!open) { setMounted(true); refreshEtat(); }
    setOpen((v) => !v);
  };

  return (
    <>
      {/* Bouton du header — même gabarit que la cloche de notifications */}
      <button
        onClick={toggle}
        title={open ? 'Fermer le guide' : 'Guide de mise en route — posez vos questions'}
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
        {/* Pastille : nombre d'étapes restantes */}
        {!etat.complet && (
          <span style={{
            position: 'absolute', top: -3, right: -3,
            background: '#f59e0b', color: '#fff',
            borderRadius: '50%', minWidth: 18, height: 18,
            fontSize: '0.6rem', fontWeight: 900,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 3px', boxShadow: '0 0 0 2px #fff',
          }}>
            {etat.etapes.filter((e) => !e.fait).length}
          </span>
        )}
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
          <AssistantChat etat={etat} onEtatRefresh={refreshEtat} onClose={() => setOpen(false)} />
        </div>
      )}
    </>
  );
}
