import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { User } from '../../types';
import { AuthShell, authSubmit } from '../../components/auth/AuthShell';
import { PRODUIT, adresseApp, adresseCompta } from '../produit';

// Arrivée d'un passage entre LabFlow et LabFlow Compta (étape S3a, SPEC-SOCLE D12), sur les deux adresses : le code de
// la partie « # » est retiré aussitôt de l'adresse (ni historique ni favori ne le gardent), puis échangé une seule fois
// contre une session ; ensuite, l'accueil de l'espace. Un code expiré ou déjà servi renvoie à la connexion.
// Connexion forcée (un lien de passage fabriqué par un tiers ouvrirait SA session) : la session n'est ouverte d'office
// que si l'on vient de l'autre adresse LabFlow et qu'aucune autre personne n'est connectée ici ; sinon, on demande.
type Session = { token: string; user: User };

const origine = (adresse: string) => { try { return new URL(adresse).origin; } catch { return ''; } };
// Personne déjà connectée sur cette adresse (session gardée par le navigateur), lue telle quelle au chargement.
const connecteIci = (): number | null => {
  try { return (JSON.parse(localStorage.getItem('user') || 'null') as User | null)?.id ?? null; } catch { return null; }
};
const vientDeLautreAdresse = () =>
  !!document.referrer && origine(document.referrer) === origine(PRODUIT === 'compta' ? adresseApp() : adresseCompta());

export default function PassagePage() {
  const { ouvrirSession } = useAuth();
  const navigate = useNavigate();
  const [code] = useState(() => window.location.hash.slice(1));
  const [erreur, setErreur] = useState(() => !window.location.hash.slice(1));
  const [aConfirmer, setAConfirmer] = useState<Session | null>(null);
  const fait = useRef(false);
  const dejaConnecte = useRef(connecteIci());

  useEffect(() => {
    if (fait.current) return;
    fait.current = true;
    window.history.replaceState(null, '', window.location.pathname);
    if (!code) return;
    api.post('/auth/passage', { code, produit: PRODUIT })
      .then(({ data }) => {
        const session = data as Session;
        const autrePersonne = dejaConnecte.current != null && dejaConnecte.current !== session.user.id;
        if (vientDeLautreAdresse() && !autrePersonne) {
          ouvrirSession(session);
          navigate('/', { replace: true });
        } else {
          setAConfirmer(session);
        }
      })
      .catch(() => setErreur(true));
  }, [code, ouvrirSession, navigate]);

  const ouvrir = () => {
    if (!aConfirmer) return;
    ouvrirSession(aConfirmer);
    navigate('/', { replace: true });
  };

  return (
    <AuthShell>
      {erreur ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.6rem', marginBottom: 10 }}>⏱️</div>
          <h1 style={{ color: '#fff', fontSize: '1.15rem', fontWeight: 800, margin: '0 0 8px' }}>Lien de passage expiré</h1>
          <p style={{ color: '#A6ACC4', fontSize: '0.88rem', lineHeight: 1.55, margin: '0 0 22px' }}>
            Ce lien ne sert qu'une fois, pendant une minute. Connectez-vous pour continuer.
          </p>
          <button type="button" onClick={() => navigate('/login', { replace: true })} style={authSubmit(false)}>Se connecter</button>
        </div>
      ) : aConfirmer ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.6rem', marginBottom: 10 }}>🔐</div>
          <h1 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 800, margin: '0 0 8px' }}>Ouvrir cette session ?</h1>
          <p style={{ color: '#A6ACC4', fontSize: '0.88rem', lineHeight: 1.55, margin: '0 0 6px' }}>Vous allez être connecté en tant que :</p>
          <p style={{ color: '#fff', fontSize: '0.95rem', fontWeight: 700, margin: '0 0 4px', overflowWrap: 'anywhere' }}>{aConfirmer.user.name}</p>
          <p style={{ color: '#C7CBE0', fontSize: '0.85rem', margin: '0 0 20px', overflowWrap: 'anywhere' }}>{aConfirmer.user.email}</p>
          <button type="button" onClick={ouvrir} style={authSubmit(false)}>Ouvrir cette session</button>
          <button type="button" onClick={() => navigate(dejaConnecte.current != null ? '/' : '/login', { replace: true })}
            style={{ marginTop: 12, width: '100%', background: 'none', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 10, padding: '11px 14px', color: '#C7CBE0', fontWeight: 600, cursor: 'pointer' }}>
            Ce n'est pas moi : ne pas ouvrir
          </button>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '10px 0' }}>
          <div className="spinner" style={{ margin: '0 auto 16px' }} />
          <p style={{ color: '#C7CBE0', fontSize: '0.92rem', margin: 0 }}>Ouverture de votre espace…</p>
        </div>
      )}
    </AuthShell>
  );
}
