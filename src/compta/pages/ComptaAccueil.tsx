import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import LabFlowLogo from '../../components/common/LabFlowLogo';
import PastilleCompta from '../PastilleCompta';

// Accueil de LabFlow Compta : les comptabilités de la personne, en trois groupes TOUJOURS distincts (exigence du client,
// CADRAGE §2) — son cabinet, sa comptabilité de client LabFlow, celles que des clients LabFlow lui ont confiées.
// Étape S1 : aucune comptabilité n'existe encore (le serveur renvoie trois listes vides).
type Comptabilite = { id: number; nom: string };
type Acces = { cabinets: Comptabilite[]; maComptabilite: Comptabilite[]; confiees: Comptabilite[] };

const GROUPES: { cle: keyof Acces; titre: string; badge: string; couleur: string }[] = [
  { cle: 'cabinets', titre: 'Mon cabinet', badge: 'Cabinet', couleur: '#4338ca' },
  { cle: 'maComptabilite', titre: 'Ma comptabilité', badge: 'Client LabFlow', couleur: '#0f766e' },
  { cle: 'confiees', titre: 'Comptabilités confiées par des clients LabFlow', badge: 'Confiée', couleur: '#b45309' },
];

export default function ComptaAccueil() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [acces, setAcces] = useState<Acces | null>(null);
  const [erreur, setErreur] = useState(false);

  const charger = useCallback(() => {
    setErreur(false);
    api.get('/api/compta/acces')
      .then(({ data }) => setAcces(data as Acces))
      .catch(() => setErreur(true));
  }, []);
  useEffect(() => { charger(); }, [charger]);

  const seDeconnecter = () => { logout(); navigate('/login', { replace: true }); };
  const vide = acces && GROUPES.every((g) => (acces[g.cle] || []).length === 0);

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <header style={{ background: 'linear-gradient(120deg, #04050B 0%, #111436 100%)', borderBottom: '3px solid transparent', borderImage: 'linear-gradient(120deg, #0EA5E9 0%, #6366F1 52%, #A855F7 100%) 1' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <LabFlowLogo height={28} variant="light" />
          <PastilleCompta taille="petite" />
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ color: '#D4D9EC', fontSize: '0.85rem', fontWeight: 600 }}>{user?.name}</span>
            <button type="button" onClick={seDeconnecter}
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', color: '#F2F4FF', borderRadius: 10, padding: '7px 14px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
              Se déconnecter
            </button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '28px 20px 48px' }}>
        <h1 style={{ margin: '0 0 6px', fontSize: '1.45rem', fontWeight: 900, color: '#0f172a' }}>Vos comptabilités</h1>
        <p style={{ margin: '0 0 24px', color: '#64748b', fontSize: '0.9rem' }}>Choisissez la comptabilité à ouvrir.</p>

        {erreur && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>Impossible de charger vos comptabilités.</span>
            <button type="button" onClick={charger} style={{ background: '#b91c1c', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>Réessayer</button>
          </div>
        )}

        {!erreur && !acces && <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Chargement…</p>}

        {vide && (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '32px 24px', textAlign: 'center', boxShadow: '0 2px 8px rgba(15,23,42,0.04)' }}>
            <div style={{ fontSize: '2rem', marginBottom: 10 }}>📒</div>
            <p style={{ margin: '0 0 6px', fontWeight: 800, color: '#0f172a', fontSize: '1rem' }}>Aucune comptabilité n'est encore ouverte pour ce compte.</p>
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.88rem', lineHeight: 1.6 }}>
              Quand un cabinet ou un client LabFlow vous ouvrira une comptabilité, elle apparaîtra ici.
            </p>
          </div>
        )}

        {acces && !vide && GROUPES.filter((g) => (acces[g.cle] || []).length > 0).map((g) => (
          <section key={g.cle} style={{ marginBottom: 26 }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 12px', fontSize: '1.02rem', fontWeight: 800, color: '#0f172a' }}>
              {g.titre}
              <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#fff', background: g.couleur, borderRadius: 999, padding: '3px 9px' }}>{g.badge}</span>
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
              {acces[g.cle].map((c) => (
                <div key={`${g.cle}-${c.id}`} style={{ background: '#fff', border: '1px solid #e2e8f0', borderLeft: `4px solid ${g.couleur}`, borderRadius: 12, padding: '14px 16px', fontWeight: 700, color: '#0f172a' }}>
                  {c.nom}
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
