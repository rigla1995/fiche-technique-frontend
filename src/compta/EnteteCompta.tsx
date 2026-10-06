import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LabFlowLogo from '../components/common/LabFlowLogo';
import PastilleCompta from './PastilleCompta';

// En-tête commun des pages de LabFlow Compta (étape S2a) : logo, pastille, personne connectée, bouton « ? » et
// déconnexion. `aide` = slug de la fiche du manuel de LabFlow Compta propre à la page (règle du projet : un seul « ? »
// par page, ouvert dans un NOUVEL onglet) ; absent sur la page du manuel elle-même.
export default function EnteteCompta({ aide }: { aide?: string }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const seDeconnecter = () => { logout(); navigate('/login', { replace: true }); };

  return (
    <header style={{ background: 'linear-gradient(120deg, #04050B 0%, #111436 100%)', borderBottom: '3px solid transparent', borderImage: 'linear-gradient(120deg, #0EA5E9 0%, #6366F1 52%, #A855F7 100%) 1' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <LabFlowLogo height={28} variant="light" />
        <PastilleCompta taille="petite" />
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ color: '#D4D9EC', fontSize: '0.85rem', fontWeight: 600 }}>{user?.name}</span>
          {aide && (
            <a href={`/manuel#${aide}`} target="_blank" rel="noopener" title="Voir le manuel (nouvel onglet)" aria-label="Voir le manuel (nouvel onglet)"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(165,180,252,0.55)', color: '#E0E7FF', fontWeight: 800, fontSize: '0.9rem', textDecoration: 'none', flexShrink: 0 }}>
              ?
            </a>
          )}
          <button type="button" onClick={seDeconnecter}
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', color: '#F2F4FF', borderRadius: 10, padding: '7px 14px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
            Se déconnecter
          </button>
        </div>
      </div>
    </header>
  );
}
