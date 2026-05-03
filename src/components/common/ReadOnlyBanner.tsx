import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function ReadOnlyBanner() {
  const { user } = useAuth();
  const navigate = useNavigate();

  if (!user || user.role === 'super_admin') return null;

  if (user.modeCompte === 'read_only') {
    return (
      <div style={{
        background: 'linear-gradient(90deg, #f59e0b, #d97706)',
        color: '#fff',
        padding: '10px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 13,
        fontWeight: 600,
        zIndex: 100,
        flexShrink: 0,
      }}>
        <span>
          ⚠️ Votre abonnement est impayé — compte en lecture seule. La création et la modification sont bloquées.
        </span>
        <button
          onClick={() => navigate('/client/abonnement')}
          style={{ padding: '4px 12px', background: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.5)', borderRadius: 6, color: '#fff', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
          Voir mon abonnement
        </button>
      </div>
    );
  }

  if (user.modeCompte === 'desactive' || user.modeCompte === 'archive') {
    return (
      <div style={{
        background: 'linear-gradient(90deg, #dc2626, #b91c1c)',
        color: '#fff',
        padding: '10px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 13,
        fontWeight: 600,
        zIndex: 100,
        flexShrink: 0,
      }}>
        <span>🚫 Votre compte est suspendu. Contactez l'administrateur.</span>
        <button
          onClick={() => navigate('/client/abonnement')}
          style={{ padding: '4px 12px', background: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.5)', borderRadius: 6, color: '#fff', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
          Détails
        </button>
      </div>
    );
  }

  return null;
}
