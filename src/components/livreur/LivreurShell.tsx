import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import LabFlowLogo from '../common/LabFlowLogo';

// Module Livreurs (L1) — espace du livreur, fait pour le téléphone : en-tête compact, colonne étroite, gros boutons.
// Plein écran, hors Layout client (modèle : PortailShell).
const C = '#059669';
const CD = '#064e3b';

export default function LivreurShell({ children, titre }: { children: React.ReactNode; titre?: string }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
      <header style={{ background: `linear-gradient(135deg, ${CD} 0%, ${C} 100%)`, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <Link to="/livreur" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <LabFlowLogo height={28} />
          <span style={{ background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', fontSize: '0.68rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>Espace livreur</span>
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>{user?.name}</span>
          <button onClick={() => { logout(); navigate('/login'); }}
            style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', borderRadius: 8, padding: '6px 11px', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Quitter
          </button>
        </div>
      </header>
      <main style={{ flex: 1, padding: '18px 16px 100px', maxWidth: 560, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        {titre && <h1 style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0f172a', margin: '4px 0 14px' }}>{titre}</h1>}
        {children}
      </main>
    </div>
  );
}
