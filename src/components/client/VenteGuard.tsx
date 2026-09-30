import { useState, useEffect } from 'react';
import { Outlet, Link } from 'react-router-dom';
import api from '../../api/client';
import { useVocabulaire } from '../../hooks/useVocabulaire';

const C = '#b45309';
const CD = '#78350f';
const CL = '#fffbeb';
const CB = '#fcd34d';

// Règle vente V1 (lot 1b) : types-summary.hasActivitesVente = au moins une activité vente_active.
// Absent (ancien serveur) ou en erreur → considéré vrai (aucun verrou supplémentaire).
type VenteSummary = { hasActivitesVente?: boolean };

export default function VenteGuard() {
  const voc = useVocabulaire();
  const [status, setStatus] = useState<'loading' | 'active' | 'inactive' | 'no_vente'>('loading');
  const [hasPending, setHasPending] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/api/entreprise'),
      api.get('/api/abonnements/demandes'),
      api.get('/api/entreprise/activites/types-summary').then(({ data }) => data as VenteSummary).catch(() => null),
    ]).then(([pe, dem, summary]) => {
      const actif = !!pe.data?.module_vente_actif;
      const pending = (dem.data as { typeDemande: string; statut: string }[])
        .some(d => d.typeDemande === 'activer_module_vente' && d.statut === 'en_attente');
      const hasActivitesVente = summary?.hasActivitesVente !== false;
      setStatus(!actif ? 'inactive' : hasActivitesVente ? 'active' : 'no_vente');
      setHasPending(pending);
    }).catch(() => setStatus('inactive'));
  }, []);

  const handleRequest = async () => {
    setRequesting(true); setError('');
    try {
      await api.post('/api/abonnements/demandes', { typeDemande: 'activer_module_vente' });
      setRequested(true); setHasPending(true);
    } catch (e: unknown) {
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erreur');
    } finally {
      setRequesting(false);
    }
  };

  if (status === 'loading') {
    return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)' }}>Chargement…</div>;
  }

  if (status === 'active') {
    return <Outlet />;
  }

  // Module actif mais aucune activité vendeuse (Housekeeping, Spa…) : écran informatif, SANS demande.
  if (status === 'no_vente') {
    return (
      <div className="page-content">
        <div style={{
          background: `linear-gradient(135deg, ${CD} 0%, ${C} 55%, #d97706 100%)`,
          borderRadius: 18, padding: '32px 32px', marginBottom: 28,
          boxShadow: '0 8px 32px rgba(180,83,9,0.28)', textAlign: 'center',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>🛒</div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 900, color: '#fff', margin: '0 0 8px' }}>Module {voc.Court('vente')}</h1>
          <p style={{ color: 'rgba(255,255,255,0.82)', margin: 0, fontSize: '0.92rem' }}>
            Ce module permet de gérer votre catalogue vendable, {voc.votre('prestataire', true)} de livraison et {voc.votre('vente', true)}.
          </p>
        </div>

        <div style={{ maxWidth: 520, margin: '0 auto', background: 'var(--card-bg)', borderRadius: 16, border: `1.5px solid ${CB}`, padding: 32, textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: CL, border: `2px solid ${CB}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', margin: '0 auto 20px' }}>
            ℹ️
          </div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: C, marginBottom: 10 }}>
            {voc.acc('activite', 'Aucun', 'Aucune')} de {voc.votre('activite', true)} ne vend
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', lineHeight: 1.6, marginBottom: 0 }}>
            Le module {voc.Court('vente')} est actif, mais {voc.acc('activite', 'aucun', 'aucune')} de {voc.votre('activite', true)} n'est {voc.acc('activite', 'configuré', 'configurée')} comme {voc.nom('activite')} {voc.acc('activite', 'vendeur', 'vendeuse')}{' '}
            (Housekeeping, Spa, économat…). {voc.Le('espace_vente', false, 'Nom')} s'ouvrira dès qu'{voc.un('activite')} {voc.acc('activite', 'vendeur', 'vendeuse')} existera
            dans votre compte.
          </p>
          <div style={{ marginTop: 20, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Consultez vos unités dans{' '}
            <Link to="/client/activites" style={{ color: C, fontWeight: 600 }}>{voc.Pl('activite')}</Link>.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div style={{
        background: `linear-gradient(135deg, ${CD} 0%, ${C} 55%, #d97706 100%)`,
        borderRadius: 18, padding: '32px 32px', marginBottom: 28,
        boxShadow: '0 8px 32px rgba(180,83,9,0.28)', textAlign: 'center',
      }}>
        <div style={{ fontSize: '3rem', marginBottom: 12 }}>🛒</div>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 900, color: '#fff', margin: '0 0 8px' }}>Module {voc.Court('vente')}</h1>
        <p style={{ color: 'rgba(255,255,255,0.82)', margin: 0, fontSize: '0.92rem' }}>
          Ce module permet de gérer votre catalogue vendable, {voc.votre('prestataire', true)} de livraison et {voc.votre('vente', true)}.
        </p>
      </div>

      <div style={{ maxWidth: 520, margin: '0 auto', background: 'var(--card-bg)', borderRadius: 16, border: `1.5px solid ${CB}`, padding: 32, textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: CL, border: `2px solid ${CB}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', margin: '0 auto 20px' }}>
          🔒
        </div>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: C, marginBottom: 10 }}>
          Module {voc.Court('vente')} non activé
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', lineHeight: 1.6, marginBottom: 24 }}>
          Ce module est disponible en option. Envoyez une demande d'activation à l'administrateur et {voc.votre('espace_vente')} sera {voc.acc('espace_vente', 'activé', 'activée')} sous 24h.
        </p>

        {(hasPending || requested) ? (
          <div style={{ background: '#dcfce7', borderRadius: 10, padding: '14px 20px', color: '#166534', fontWeight: 600, fontSize: '0.9rem' }}>
            ✅ Demande envoyée — en attente de validation par l'administrateur
          </div>
        ) : (
          <>
            <button onClick={handleRequest} disabled={requesting}
              style={{
                background: `linear-gradient(135deg, ${CD} 0%, ${C} 100%)`,
                color: '#fff', border: 'none', borderRadius: 10, padding: '12px 28px',
                cursor: requesting ? 'default' : 'pointer', fontWeight: 700, fontSize: '0.95rem',
                opacity: requesting ? 0.7 : 1,
                boxShadow: '0 4px 14px rgba(180,83,9,0.35)',
              }}>
              {requesting ? 'Envoi…' : '🚀 Demander l\'activation'}
            </button>
            {error && <div style={{ color: '#dc2626', fontSize: '0.82rem', marginTop: 10 }}>{error}</div>}
          </>
        )}

        <div style={{ marginTop: 20, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Retrouvez le statut de votre demande dans{' '}
          <Link to="/client/abonnement" style={{ color: C, fontWeight: 600 }}>Mon Abonnement</Link>.
        </div>
      </div>
    </div>
  );
}
