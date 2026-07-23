import { useState, useEffect } from 'react';
import { Outlet, Link } from 'react-router-dom';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';

// Thème violet de l'Espace Acheteurs
const C = '#6d28d9';
const CD = '#4c1d95';
const CL = '#f5f3ff';
const CB = '#c4b5fd';

export default function AcheteursGuard() {
  const { user } = useAuth();
  // Un gérant n'accède à l'Espace Acheteurs que si le compte client le lui a
  // accordé ET qu'au moins un labo lui est affecté (même règle que le backend).
  const gerantBlocked = user?.role === 'gerant'
    && !(user.gerantAccesAcheteurs && (user.gerantLaboIds?.length ?? 0) > 0);
  const [status, setStatus] = useState<'loading' | 'active' | 'inactive'>('loading');
  const [hasPending, setHasPending] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (gerantBlocked) { setStatus('inactive'); return; }
    Promise.all([
      api.get('/api/entreprise'),
      api.get('/api/abonnements/demandes'),
    ]).then(([pe, dem]) => {
      const actif = !!pe.data?.module_acheteurs_actif;
      const pending = (dem.data as { typeDemande: string; statut: string }[])
        .some(d => d.typeDemande === 'activer_module_acheteurs' && d.statut === 'en_attente');
      setStatus(actif ? 'active' : 'inactive');
      setHasPending(pending);
    }).catch(() => setStatus('inactive'));
  }, [gerantBlocked]);

  // Panneau dédié gérant : pas de demande d'activation ici, l'accès se règle
  // depuis la page Gérants du compte client.
  if (gerantBlocked) {
    return (
      <div className="page-content">
        <div style={{ maxWidth: 520, margin: '48px auto 0', background: 'var(--card-bg)', borderRadius: 16, border: `1.5px solid ${CB}`, padding: 32, textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: CL, border: `2px solid ${CB}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', margin: '0 auto 20px' }}>
            🔒
          </div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: C, marginBottom: 10 }}>
            Espace Acheteurs non autorisé
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', lineHeight: 1.6, margin: 0 }}>
            Cet espace n'est pas activé pour votre compte gérant. Demandez au titulaire
            du compte de vous accorder l'accès à la base acheteurs (un labo affecté est
            également requis).
          </p>
        </div>
      </div>
    );
  }

  const handleRequest = async () => {
    setRequesting(true); setError('');
    try {
      await api.post('/api/abonnements/demandes', { typeDemande: 'activer_module_acheteurs' });
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

  return (
    <div className="page-content">
      <div style={{
        background: `linear-gradient(135deg, ${CD} 0%, ${C} 55%, #8b5cf6 100%)`,
        borderRadius: 18, padding: '32px 32px', marginBottom: 28,
        boxShadow: '0 8px 32px rgba(109,40,217,0.28)', textAlign: 'center',
      }}>
        <div style={{ fontSize: '3rem', marginBottom: 12 }}>🤝</div>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 900, color: '#fff', margin: '0 0 8px' }}>Module Acheteurs</h1>
        <p style={{ color: 'rgba(255,255,255,0.82)', margin: 0, fontSize: '0.92rem' }}>
          Gérez votre carnet d'acheteurs B2B et vendez les articles et produits composés de votre stock labo.
        </p>
      </div>

      <div style={{ maxWidth: 520, margin: '0 auto', background: 'var(--card-bg)', borderRadius: 16, border: `1.5px solid ${CB}`, padding: 32, textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: CL, border: `2px solid ${CB}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', margin: '0 auto 20px' }}>
          🔒
        </div>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: C, marginBottom: 10 }}>
          Module Acheteurs non activé
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', lineHeight: 1.6, marginBottom: 24 }}>
          Ce module est disponible en option. Envoyez une demande d'activation à l'administrateur et votre espace acheteurs sera activé sous 24h.
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
                boxShadow: '0 4px 14px rgba(109,40,217,0.35)',
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
