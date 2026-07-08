import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

// Portail acheteur — lot 1 : accueil minimal (le catalogue de commande arrive au lot portail).
const C = '#6d28d9';
const CD = '#4c1d95';

export default function PortailAcheteurPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{ background: `linear-gradient(135deg, ${CD} 0%, ${C} 100%)`, padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '1.3rem' }}>💠</span>
          <span style={{ color: '#fff', fontWeight: 900, fontSize: '1.1rem', letterSpacing: '0.02em' }}>
            Lab<span style={{ opacity: 0.75 }}>Flow</span>
          </span>
          <span style={{ marginLeft: 8, background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', fontSize: '0.7rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>
            Portail Acheteur
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.85rem', fontWeight: 600 }}>{user?.name}</span>
          <button onClick={() => { logout(); navigate('/login'); }}
            style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', borderRadius: 8, padding: '7px 14px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
            Déconnexion
          </button>
        </div>
      </header>

      {/* Contenu */}
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #e2e8f0', boxShadow: '0 8px 32px rgba(15,23,42,0.06)', padding: '44px 40px', maxWidth: 520, textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: 14 }}>🛍️</div>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 900, color: '#0f172a', margin: '0 0 10px' }}>
            Bienvenue{user?.name ? `, ${user.name}` : ''} !
          </h1>
          <p style={{ color: '#475569', fontSize: '0.92rem', lineHeight: 1.65, margin: '0 0 18px' }}>
            Votre compte acheteur est <strong style={{ color: '#166534' }}>actif</strong>. Le catalogue de
            commande en ligne arrive très bientôt : vous pourrez consulter les articles proposés par votre
            fournisseur et passer vos commandes directement depuis cet espace.
          </p>
          <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 12, padding: '12px 18px', fontSize: '0.82rem', color: CD, fontWeight: 600 }}>
            💡 En attendant, contactez votre fournisseur pour passer vos commandes — il les enregistrera pour vous.
          </div>
        </div>
      </main>
    </div>
  );
}
