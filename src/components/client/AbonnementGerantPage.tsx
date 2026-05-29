import { useEffect, useState } from 'react';
import api from '../../api/client';

interface AbonnementResume {
  modeCompte: string;
  dateDebut: string | null;
  prolongationJours: number;
  nbActivites: number | null;
  nbLabos: number | null;
  nbGerants: number | null;
  clientNom: string;
}

const MODE_INFO: Record<string, { label: string; icon: string; bg: string; color: string; desc: string }> = {
  actif:      { label: 'Actif',        icon: '✅', bg: '#f0fdf4', color: '#16a34a', desc: 'Compte opérationnel' },
  read_only:  { label: 'Lecture seule', icon: '🔒', bg: '#fffbeb', color: '#d97706', desc: 'Accès restreint en lecture' },
  bloque:     { label: 'Bloqué',        icon: '🚫', bg: '#fff1f2', color: '#dc2626', desc: 'Accès suspendu' },
  archive:    { label: 'Archivé',       icon: '📦', bg: '#f9fafb', color: '#6b7280', desc: 'Compte archivé' },
  onboarding: { label: 'Onboarding',    icon: '🚀', bg: '#eff6ff', color: '#2563eb', desc: 'Mise en place en cours' },
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default function AbonnementGerantPage() {
  const [data, setData] = useState<AbonnementResume | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/gerant/abonnement')
      .then((res) => setData(res.data))
      .catch(() => setError("Impossible de charger les informations d'abonnement."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="page">
        <div style={{ padding: '48px 0', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
          Chargement…
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="page">
        <div style={{
          background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 12,
          padding: '16px 20px', color: '#dc2626', fontSize: '0.875rem',
        }}>
          {error || 'Données introuvables.'}
        </div>
      </div>
    );
  }

  const mode = MODE_INFO[data.modeCompte] ?? { label: data.modeCompte, icon: '❓', bg: '#f9fafb', color: '#6b7280', desc: '' };
  const quotas = [
    { label: 'Activités', nb: data.nbActivites, icon: '📍' },
    { label: 'Labos',     nb: data.nbLabos,     icon: '🏭' },
    { label: 'Gérants',   nb: data.nbGerants,   icon: '👤' },
  ].filter(q => q.nb !== null);

  return (
    <div className="page">
      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, #3b0764 0%, #6d28d9 55%, #8b5cf6 100%)',
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(109,40,217,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>📄</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Mon abonnement</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>
            Compte de <strong style={{ color: '#fff' }}>{data.clientNom}</strong> — depuis {formatDate(data.dateDebut)}
          </p>
        </div>
        <div style={{ background: mode.bg, borderRadius: 12, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '1.3rem' }}>{mode.icon}</span>
          <div>
            <div style={{ fontSize: '0.78rem', color: '#374151', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{mode.label}</div>
            <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>{mode.desc}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
        {/* Statut */}
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ background: 'linear-gradient(135deg, #f5f3ff, #ede9fe)', padding: '16px 20px', borderBottom: '1px solid #ddd6fe' }}>
            <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#4c1d95', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>📊</span> Statut du compte
            </div>
          </div>
          <div style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>Statut actuel</span>
              <span style={{
                background: mode.bg, color: mode.color,
                borderRadius: 20, padding: '3px 12px', fontSize: '0.78rem', fontWeight: 700,
              }}>
                {mode.icon} {mode.label}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#374151' }}>Date de début</span>
              <span style={{ fontSize: '0.875rem', color: '#111827' }}>{formatDate(data.dateDebut)}</span>
            </div>
            {data.prolongationJours > 0 && (
              <div style={{ marginTop: 12, background: '#ede9fe', borderRadius: 8, padding: '8px 12px', fontSize: '0.8rem', color: '#6d28d9', fontWeight: 600 }}>
                ✚ Prolongation accordée : {data.prolongationJours} jour{data.prolongationJours > 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>

        {/* Quotas */}
        {quotas.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <div style={{ background: 'linear-gradient(135deg, #eff6ff, #dbeafe)', padding: '16px 20px', borderBottom: '1px solid #bfdbfe' }}>
              <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#1e40af', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>⚙️</span> Configuration incluse
              </div>
            </div>
            <div style={{ padding: '16px 20px' }}>
              {quotas.map(({ label, nb, icon }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: '1.1rem' }}>{icon}</span>
                    <span style={{ fontWeight: 600, fontSize: '0.88rem', color: '#374151' }}>{label}</span>
                  </div>
                  {(nb ?? 0) > 0
                    ? <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#1e40af' }}>{nb}</span>
                    : <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontStyle: 'italic' }}>Non inclus</span>
                  }
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <p style={{ fontSize: '0.75rem', color: '#9ca3af', textAlign: 'center', marginTop: 24 }}>
        Page en lecture seule — pour toute modification, contactez l'administrateur.
      </p>
    </div>
  );
}
