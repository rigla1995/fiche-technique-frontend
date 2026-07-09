import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import LabFlowLogo from '../common/LabFlowLogo';

// En-tête + navigation du portail acheteur (plein écran, hors Layout client).
const C = '#6d28d9';
const CD = '#4c1d95';

export default function PortailShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const tab = (to: string, label: string, end = false) => (
    <NavLink to={to} end={end}
      style={({ isActive }) => ({
        color: '#fff', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 700,
        padding: '7px 14px', borderRadius: 8,
        background: isActive ? 'rgba(255,255,255,0.18)' : 'transparent',
        border: isActive ? '1px solid rgba(255,255,255,0.3)' : '1px solid transparent',
      })}>
      {label}
    </NavLink>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
      <header style={{ background: `linear-gradient(135deg, ${CD} 0%, ${C} 100%)`, padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LabFlowLogo height={30} />
          <span style={{ background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', fontSize: '0.68rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>
            Portail Acheteur
          </span>
        </div>
        <nav style={{ display: 'flex', gap: 6 }}>
          {tab('/portail', '🛍️ Catalogue', true)}
          {tab('/portail/commandes', '📦 Mes commandes')}
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.82rem', fontWeight: 600 }}>{user?.name}</span>
          <button onClick={() => { logout(); navigate('/login'); }}
            style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', borderRadius: 8, padding: '6px 13px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>
            Déconnexion
          </button>
        </div>
      </header>
      <main style={{ flex: 1, padding: '24px 24px 120px', maxWidth: 1080, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        {children}
      </main>
    </div>
  );
}
