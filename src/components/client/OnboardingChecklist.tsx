import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';

interface Summary {
  hasActivites?: boolean;
  hasArticles?: boolean;
  hasSelections?: boolean;
  hasLaboIngredients?: boolean;
}

interface Step {
  done: boolean;
  titre: string;
  detail: string;
  to: string | null;
}

/**
 * Checklist dynamique de mise en route, affichée en tête de la fiche
 * « Suivi de votre mise en route » du manuel. L'état est lu en direct
 * (mêmes sources que le déverrouillage progressif du menu).
 */
export default function OnboardingChecklist() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [nbLabos, setNbLabos] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/api/entreprise/activites/types-summary').then(({ data }) => data as Summary).catch(() => null),
      api.get('/api/labo').then(({ data }) => (Array.isArray(data) ? data.length : 0)).catch(() => 0),
    ]).then(([s, n]) => { setSummary(s); setNbLabos(n); }).finally(() => setLoading(false));
  }, []);

  if (loading || summary === null) return null;

  const hasStructure = !!summary.hasActivites || nbLabos > 0;
  const hasArticles = !!summary.hasArticles;
  const hasAffectations = !!summary.hasSelections || !!summary.hasLaboIngredients;

  const steps: Step[] = [
    { done: true, titre: 'Compte activé & contrat signé', detail: 'Votre accès LabFlow est ouvert.', to: null },
    { done: hasStructure, titre: 'Créer vos activités (et labo)', detail: 'Déclarez vos points de vente, et votre labo central si vous en avez un.', to: '/client/activites' },
    { done: hasArticles, titre: 'Constituer le référentiel', detail: 'Créez vos unités, familles et catégories, puis vos articles.', to: '/client/referentiel/articles' },
    { done: hasAffectations, titre: 'Affecter les articles', detail: 'Indiquez quels articles sont utilisés par chaque activité ou labo.', to: '/client/activites' },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;
  const currentIdx = steps.findIndex((s) => !s.done);

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
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', borderRadius: 10, background: isCurrent ? '#eff6ff' : 'transparent', border: `1px solid ${isCurrent ? '#bfdbfe' : 'transparent'}` }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: s.done ? '#16a34a' : isCurrent ? '#2563eb' : '#e2e8f0',
                color: s.done || isCurrent ? '#fff' : '#94a3b8',
                fontSize: '0.72rem', fontWeight: 800,
              }}>
                {s.done ? '✓' : i + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.84rem', fontWeight: s.done ? 600 : 700, color: s.done ? '#64748b' : '#1e293b', textDecoration: s.done ? 'line-through' : 'none' }}>{s.titre}</div>
                {!s.done && <div style={{ fontSize: '0.76rem', color: '#64748b', marginTop: 1 }}>{s.detail}</div>}
              </div>
              {isCurrent && s.to && (
                <Link to={s.to} style={{ flexShrink: 0, background: '#2563eb', color: '#fff', borderRadius: 8, padding: '7px 13px', fontSize: '0.76rem', fontWeight: 700, textDecoration: 'none' }}>
                  Y aller →
                </Link>
              )}
            </div>
          );
        })}
      </div>

      {allDone && (
        <div style={{ marginTop: 12, fontSize: '0.8rem', color: '#15803d', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px' }}>
          Prochaines étapes : saisissez vos <Link to="/client/stock" style={{ color: '#15803d', fontWeight: 700 }}>approvisionnements</Link> puis composez vos <Link to="/client/products" style={{ color: '#15803d', fontWeight: 700 }}>produits et fiches techniques</Link>.
        </div>
      )}
    </div>
  );
}
