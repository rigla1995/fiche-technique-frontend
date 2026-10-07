import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LabFlowLogo from '../components/common/LabFlowLogo';
import PastilleCompta from './PastilleCompta';
import { LienStockVente } from './LiensEspace';
import ClocheCompta from './ClocheCompta';
import { estTitulaireCabinet, useAccesCompta } from './accesCompta';

// Barre du haut de LabFlow Compta : celle de LabFlow (src/components/common/Header.tsx, classes .header), logo suivi de
// la pastille « Compta », cloche (S3c), personne connectée et déconnexion. Pas de guide de mise en route. Sur téléphone,
// un bouton ouvre le menu de gauche, qui reçoit aussi le nom et la déconnexion (compta.css : classes
// compta-bureau-seul / compta-mobile-seul).
// S3c : une personne « comptable » est le titulaire d'un cabinet, ou un comptable (collaborateur d'un cabinet, comptable
// d'un client LabFlow).
const libelleRole = (role: string | undefined, titulaireCabinet: boolean) =>
  role === 'boss' ? 'Boss'
    : role === 'super_admin' ? 'Administrateur'
    : role === 'gerant' ? 'Gérant'
    : role === 'acheteur' ? 'Acheteur'
    : role === 'comptable' ? (titulaireCabinet ? 'Cabinet comptable' : 'Comptable')
    : 'Client';

const initiales = (nom?: string) =>
  nom ? nom.split(' ').map((m) => m[0]).join('').toUpperCase().slice(0, 2) : '?';

export default function EnteteCompta({ onMenu }: { onMenu: () => void }) {
  const { user, logout } = useAuth();
  const { acces } = useAccesCompta();
  const navigate = useNavigate();
  const seDeconnecter = () => { logout(); navigate('/login', { replace: true }); };

  return (
    <header className="header compta-entete">
      <div className="header-left">
        <button type="button" className="menu-toggle compta-menu-toggle" onClick={onMenu} aria-label="Ouvrir le menu">
          <span /><span /><span />
        </button>
        <button type="button" className="compta-logo" onClick={() => navigate('/')} title="Accueil"
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
          <LabFlowLogo height={36} />
        </button>
        <PastilleCompta taille="petite" fond="degrade" />
      </div>

      <div className="header-right">
        {/* Étape S3a : retour à l'espace Stock / Vente sans ressaisie (client ou gérant) */}
        <LienStockVente />
        <ClocheCompta />
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{
            width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,0.92)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.78rem', fontWeight: 800, color: '#6366f1', flexShrink: 0,
            boxShadow: '0 0 0 2px rgba(255,255,255,0.35)',
          }}>
            {initiales(user?.name)}
          </div>
          <div className="compta-bureau-seul" style={{ lineHeight: 1.25 }}>
            <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#fff' }}>{user?.name}</div>
            <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.6)', fontWeight: 500, letterSpacing: '0.03em' }}>
              {libelleRole(user?.role, estTitulaireCabinet(acces))}
            </div>
          </div>
        </div>
        <button type="button" className="btn btn-ghost btn-sm compta-bureau-seul" onClick={seDeconnecter} style={{ fontWeight: 600 }}>
          Déconnexion
        </button>
      </div>
    </header>
  );
}
