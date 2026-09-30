import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { useVocabulaire } from '../../hooks/useVocabulaire';

/** Répartition par composant souscrit de l'étape « capacités » (lot 1b, §3.5). */
interface EtapeComposant {
  code: string;
  libelle: string;
  attendu: number;
  crees: number;
}

/** Étape telle que renvoyée par GET /api/ai-assistant/onboarding (onboardingEtat.js). */
interface Etape {
  key: string;
  titre: string;
  fait: boolean;
  detail: string | null;
  route?: string | null;
  composants?: EtapeComposant[];
}

interface OnboardingEtat {
  complet: boolean;
  etapes: Etape[];
  aFaire: string | null;
}

/**
 * Checklist de mise en route, affichée en tête de la fiche « Suivi de votre
 * mise en route » du manuel (fiche réservée au client : clientSeul).
 * Lot 1b : plus AUCUN calcul local — les étapes (titre, détail, fait, route,
 * répartition par composant) sont celles de l'endpoint d'onboarding, la même
 * source que le guide 🤖 de la barre du haut. L'appel est un GET pur : la purge
 * de la conversation IA est faite par AssistantWidget (POST …/onboarding/purge).
 */
export default function OnboardingChecklist() {
  const voc = useVocabulaire();
  const [etat, setEtat] = useState<OnboardingEtat | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/ai-assistant/onboarding')
      .then(({ data }) => setEtat(data && Array.isArray(data.etapes) ? (data as OnboardingEtat) : null))
      .catch(() => setEtat(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading || etat === null || etat.etapes.length === 0) return null;

  const steps = etat.etapes;
  const doneCount = steps.filter((s) => s.fait).length;
  const allDone = etat.complet || doneCount === steps.length;
  const currentIdx = steps.findIndex((s) => !s.fait);

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '18px 20px', marginBottom: 24, boxShadow: '0 2px 10px rgba(15,23,42,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.95rem' }}>
          {allDone ? '🎉 Mise en route terminée' : '🚀 Votre mise en route'}
        </div>
        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#2563eb' }}>{doneCount} / {steps.length}</div>
      </div>

      {/* Barre de progression */}
      <div style={{ height: 7, borderRadius: 6, background: '#e2e8f0', margin: '10px 0 16px', overflow: 'hidden' }}>
        <div style={{ width: `${(doneCount / steps.length) * 100}%`, height: '100%', borderRadius: 6, background: 'linear-gradient(90deg,#2563eb,#3b82f6)', transition: 'width 0.4s ease' }} />
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        {steps.map((s, i) => {
          const isCurrent = i === currentIdx;
          const composants = (s.composants ?? []).filter((c) => c && c.attendu > 0);
          return (
            <div key={s.key || i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', borderRadius: 10, background: isCurrent ? '#eff6ff' : 'transparent', border: `1px solid ${isCurrent ? '#bfdbfe' : 'transparent'}` }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: s.fait ? '#16a34a' : isCurrent ? '#2563eb' : '#e2e8f0',
                color: s.fait || isCurrent ? '#fff' : '#94a3b8',
                fontSize: '0.72rem', fontWeight: 800,
              }}>
                {s.fait ? '✓' : i + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.84rem', fontWeight: s.fait ? 600 : 700, color: s.fait ? '#64748b' : '#1e293b', textDecoration: s.fait ? 'line-through' : 'none' }}>{s.titre}</div>
                {!s.fait && s.detail && <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: 1 }}>{s.detail}</div>}
                {/* Répartition par composant souscrit (ex. « 1/2 Restaurant · 0/1 Cuisine ») */}
                {!s.fait && composants.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 5 }}>
                    {composants.map((c) => {
                      const ok = c.crees >= c.attendu;
                      return (
                        <span key={c.code} style={{
                          fontSize: '0.7rem', fontWeight: 700, borderRadius: 20, padding: '2px 9px',
                          color: ok ? '#15803d' : '#1e40af',
                          background: ok ? '#f0fdf4' : '#eff6ff',
                          border: `1px solid ${ok ? '#bbf7d0' : '#bfdbfe'}`,
                        }}>
                          {Math.min(c.crees, c.attendu)}/{c.attendu} {c.libelle}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
              {isCurrent && s.route && (
                <Link to={s.route} style={{ flexShrink: 0, background: '#2563eb', color: '#fff', borderRadius: 8, padding: '7px 13px', fontSize: '0.76rem', fontWeight: 700, textDecoration: 'none' }}>
                  Y aller →
                </Link>
              )}
            </div>
          );
        })}
      </div>

      {allDone && (
        <div style={{ marginTop: 12, fontSize: '0.8rem', color: '#15803d', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px' }}>
          Toutes les étapes de votre mise en route sont terminées. Le guide 🤖 réapparaîtra automatiquement si votre configuration évolue ({voc.nouveau('activite')}, {voc.nom('labo')}, module…).
        </div>
      )}
    </div>
  );
}
