import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { AuthShell, authErrorBox } from '../../components/auth/AuthShell';
import { PRODUIT } from '../produit';
import { allerVers, type Destination } from '../passage';

// Écran de choix après la connexion (étape S3a, SPEC-SOCLE D11bis) : la personne qui a les deux espaces — Stock / Vente
// et au moins une comptabilité — choisit où aller, quelle que soit l'adresse où elle s'est connectée. L'espace de
// l'adresse courante s'ouvre directement ; l'autre, par un passage sans ressaisie du mot de passe.
const ESPACES: { destination: Destination; icone: string; titre: string; texte: string }[] = [
  { destination: 'app', icone: '📦', titre: 'Stock / Vente', texte: 'Votre espace LabFlow : stock, production, ventes.' },
  { destination: 'compta', icone: '📒', titre: 'Comptabilité', texte: 'LabFlow Compta : vos comptabilités.' },
];

export default function ChoixEspace() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const [enCours, setEnCours] = useState<Destination | null>(null);
  const [erreur, setErreur] = useState('');

  if (isLoading) return <div className="page-loading"><div className="spinner" /></div>;
  if (!user) return <Navigate to="/login" replace />;

  const ici: Destination = PRODUIT === 'compta' ? 'compta' : 'app';
  const choisir = async (destination: Destination) => {
    if (enCours) return;
    if (destination === ici) { navigate('/', { replace: true }); return; }
    setEnCours(destination);
    setErreur('');
    try {
      await allerVers(destination);
    } catch {
      setErreur('Passage impossible pour le moment. Réessayez, ou connectez-vous directement à l\'autre adresse.');
      setEnCours(null);
    }
  };

  const prenom = (user.name || '').split(' ')[0];
  return (
    <AuthShell>
      <h1 style={{ color: '#fff', fontSize: '1.2rem', fontWeight: 800, margin: '0 0 6px', textAlign: 'center' }}>
        Bonjour{prenom ? ` ${prenom}` : ''}, où allez-vous ?
      </h1>
      <p style={{ color: '#A6ACC4', fontSize: '0.84rem', margin: '0 0 22px', textAlign: 'center' }}>
        Vous passerez ensuite de l'un à l'autre depuis la barre du haut.
      </p>
      {erreur && <div style={authErrorBox}>{erreur}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {ESPACES.map((e) => (
          <button key={e.destination} type="button" onClick={() => choisir(e.destination)} disabled={!!enCours}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left', cursor: enCours ? 'default' : 'pointer',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 14, padding: '16px 18px',
              color: '#fff', opacity: enCours && enCours !== e.destination ? 0.5 : 1,
            }}>
            <span style={{ fontSize: '1.6rem' }}>{e.icone}</span>
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontWeight: 800, fontSize: '1rem' }}>{e.titre}</span>
              <span style={{ display: 'block', fontSize: '0.8rem', color: '#A6ACC4', marginTop: 2 }}>{e.texte}</span>
            </span>
            <span style={{ color: '#A5B4FC', fontWeight: 700 }}>{enCours === e.destination ? '…' : '→'}</span>
          </button>
        ))}
      </div>
    </AuthShell>
  );
}
