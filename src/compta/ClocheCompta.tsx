import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications, type AppNotification } from '../context/NotificationContext';
import { estTitulaireCabinet, useAccesCompta } from './accesCompta';

// Cloche de LabFlow Compta (étape S3c, demande du client du 07/10) : celle de la barre du haut de LabFlow
// (src/components/common/Header.tsx), en vocabulaire comptable fixe. Le fournisseur (NotificationProvider
// produit="compta", LayoutCompta) ne lui sert que les notifications de LabFlow Compta. Lesquelles l'alimenteront se
// décidera avec le client, le module fini ; aujourd'hui : la réponse de l'équipe LabFlow à une demande de gérants.
const libelle = (n: AppNotification) => {
  if (n.eventType === 'demande_traitee') return `Demande de gérants ${n.statut === 'validée' ? 'validée ✓' : 'refusée ✗'}`;
  return 'Notification';
};
const icone = (n: AppNotification) => (n.eventType === 'demande_traitee' ? (n.statut === 'validée' ? '✅' : '❌') : '🔔');

export default function ClocheCompta() {
  const { notifications, unreadCount, markSeen } = useNotifications();
  const { acces } = useAccesCompta();
  const navigate = useNavigate();
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ouvert) return;
    const clic = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOuvert(false); };
    const touche = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false); };
    document.addEventListener('mousedown', clic);
    document.addEventListener('keydown', touche);
    return () => { document.removeEventListener('mousedown', clic); document.removeEventListener('keydown', touche); };
  }, [ouvert]);

  const basculer = () => {
    // À l'ouverture : tout est marqué lu et le serveur efface les notifications informatives (règle de LabFlow).
    if (!ouvert) markSeen();
    setOuvert((v) => !v);
  };

  // Une demande de gérants traitée mène à « Mes gérants » (titulaire du cabinet).
  const ouvrir = (n: AppNotification) => {
    setOuvert(false);
    if (n.eventType === 'demande_traitee' && estTitulaireCabinet(acces)) navigate('/gerants');
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={basculer} title="Notifications" aria-label={unreadCount > 0 ? `Notifications (${unreadCount} nouvelle${unreadCount > 1 ? 's' : ''})` : 'Notifications'}
        aria-expanded={ouvert} aria-haspopup="true"
        style={{
          position: 'relative', background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)',
          cursor: 'pointer', padding: '7px 9px', borderRadius: 8, fontSize: '1.05rem', lineHeight: 1, color: '#fff',
          animation: unreadCount > 0 ? 'bell-ring 0.45s ease infinite alternate' : 'none',
        }}>
        🔔
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: -3, right: -3, background: '#ef4444', color: '#fff', borderRadius: '50%',
            minWidth: 18, height: 18, fontSize: '0.6rem', fontWeight: 900, display: 'flex', alignItems: 'center',
            justifyContent: 'center', padding: '0 3px', boxShadow: '0 0 0 2px #fff',
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {ouvert && (
        <div role="dialog" aria-label="Notifications" style={{
          position: 'absolute', top: 'calc(100% + 10px)', right: 0, width: 'min(320px, calc(100vw - 32px))', maxHeight: 400,
          overflowY: 'auto', background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0',
          boxShadow: '0 12px 40px rgba(0,0,0,0.18)', zIndex: 9999,
        }}>
          <div style={{
            padding: '12px 16px 10px', fontWeight: 900, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em',
            color: '#64748b', borderBottom: '1px solid #f1f5f9',
          }}>
            Notifications
          </div>
          {notifications.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>🔕</div>
              <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Aucune notification</div>
            </div>
          ) : (
            notifications.map((n) => (
              <button key={n.id} type="button" onClick={() => ouvrir(n)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', textAlign: 'left', padding: '11px 16px',
                  border: 'none', borderBottom: '1px solid #f8fafc', background: n.readAt ? '#fff' : '#f5f3ff', cursor: 'pointer',
                  fontFamily: 'inherit',
                }}>
                <span aria-hidden="true" style={{
                  width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1rem', background: 'linear-gradient(135deg,#eef2ff,#e0e7ff)',
                }}>{icone(n)}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', lineHeight: 1.35 }}>{libelle(n)}</span>
                  {n.notesAdmin && <span style={{ display: 'block', fontSize: '0.73rem', color: '#64748b', marginTop: 2, fontStyle: 'italic', overflowWrap: 'anywhere' }}>{n.notesAdmin}</span>}
                  <span style={{ display: 'block', fontSize: '0.66rem', color: '#94a3b8', marginTop: 4 }}>
                    {new Date(n.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
