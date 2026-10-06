import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Menu de gauche de LabFlow Compta : celui de LabFlow (src/components/common/Sidebar.tsx, classes .sidebar et
// .sidebar-link) ; en haut les pages de travail, en bas l'aide (comme « Mon abonnement » et le manuel dans LabFlow).
// Les pages des étapes suivantes (cabinet, abonnement, dossiers) s'y ajoutent. Sur téléphone seulement, il reçoit aussi
// le nom de la personne et la déconnexion, retirés de la barre du haut faute de place (compta.css).
const classeLien = ({ isActive }: { isActive: boolean }) => `sidebar-link ${isActive ? 'active' : ''}`;

export default function MenuCompta({ ouvert, onFermer }: { ouvert: boolean; onFermer: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const seDeconnecter = () => { onFermer(); logout(); navigate('/login', { replace: true }); };

  return (
    <>
      {ouvert && <div className="sidebar-overlay" onClick={onFermer} />}
      <nav className={`sidebar ${ouvert ? 'sidebar-open' : ''}`} aria-label="Menu de LabFlow Compta">
        <ul className="sidebar-nav" style={{ flex: 1 }}>
          <li>
            <NavLink to="/" end className={classeLien} onClick={onFermer}>
              <span className="link-icon">📒</span>
              <span className="link-label">Vos comptabilités</span>
            </NavLink>
          </li>
          {/* Étape S2b : le titulaire d'un cabinet (rôle « comptable ») */}
          {user?.role === 'comptable' && (
            <>
              <li>
                <NavLink to="/cabinet" className={classeLien} onClick={onFermer}>
                  <span className="link-icon">🏢</span>
                  <span className="link-label">Mon cabinet</span>
                </NavLink>
              </li>
              <li>
                <NavLink to="/abonnement" className={classeLien} onClick={onFermer}>
                  <span className="link-icon">💳</span>
                  <span className="link-label">Abonnement et factures</span>
                </NavLink>
              </li>
            </>
          )}
          {/* Étape S2c : un client LabFlow (module Comptabilité) */}
          {user?.role === 'client' && (
            <li>
              <NavLink to="/ma-comptabilite" className={classeLien} onClick={onFermer}>
                <span className="link-icon">🧮</span>
                <span className="link-label">Ma comptabilité</span>
              </NavLink>
            </li>
          )}
        </ul>
        <ul className="sidebar-nav" style={{ borderTop: '1px solid var(--border)', paddingTop: 4 }}>
          <li>
            <NavLink to="/manuel" className={classeLien} onClick={onFermer}>
              <span className="link-icon">📖</span>
              <span className="link-label">Manuel d'utilisation</span>
            </NavLink>
          </li>
          <li className="compta-mobile-seul">
            <div style={{ padding: '10px 12px 4px', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text)' }}>{user?.name}</div>
          </li>
          <li className="compta-mobile-seul">
            <button type="button" className="sidebar-link" onClick={seDeconnecter}
              style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
              <span className="link-icon">🚪</span>
              <span className="link-label">Déconnexion</span>
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
