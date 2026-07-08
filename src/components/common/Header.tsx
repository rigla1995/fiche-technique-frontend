import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import LabFlowLogo from './LabFlowLogo';

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { notifications, unreadCount, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const handleLogout = () => { logout(); navigate('/login'); };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleBell = () => {
    setOpen((v) => !v);
    if (!open && unreadCount > 0) markAllRead();
  };

  const handleNotifClick = (eventType: string) => {
    setOpen(false);
    if (eventType === 'new_inventaire') {
      navigate('/client/inventaire/historique?section=activite');
    } else if (eventType === 'nouvelle_commande_acheteur') {
      navigate('/client/acheteurs/commandes?statut=en_attente');
    } else if (eventType === 'demande_capacite_validee') {
      navigate('/client/activites');
    } else if (eventType === 'demande_gerant_validee') {
      navigate('/client/gerants');
    } else {
      navigate(user?.role === 'super_admin' ? '/admin/support' : '/client/support');
    }
  };

  const handleLogoClick = () => {
    if (user?.role === 'super_admin') navigate('/admin');
    // Home « intelligent » : sans activité/labo → Mes activités (pas de saut vers un dashboard verrouillé) ; sinon → tableau de bord.
    else navigate('/client');
  };

  const typeLabel = (type: string) => {
    if (type === 'ingredient_manquant') return 'Ingrédient manquant';
    if (type === 'supplement') return 'Ajout de capacité';
    return 'Aide';
  };

  const initials = (name?: string) =>
    name ? name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : '?';

  return (
    <header className="header">
      {/* Left — logo cliquable */}
      <div className="header-left">
        <button
          onClick={handleLogoClick}
          title="Tableau de bord"
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          <LabFlowLogo height={36} />
        </button>
      </div>

      {/* Right */}
      <div className="header-right">
        {/* User chip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{
            width: 34, height: 34, borderRadius: '50%',
            background: 'rgba(255,255,255,0.92)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.78rem', fontWeight: 800, color: '#6366f1', flexShrink: 0,
            boxShadow: '0 0 0 2px rgba(255,255,255,0.35)',
          }}>
            {initials(user?.name)}
          </div>
          <div style={{ lineHeight: 1.25 }}>
            <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#fff' }}>{user?.name}</div>
            <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.6)', fontWeight: 500, letterSpacing: '0.03em' }}>
              {user?.role === 'super_admin'
                ? 'Administrateur'
                : user?.role === 'gerant'
                ? (user.gerantActiviteNom || 'Gérant')
                : 'Client'}
            </div>
          </div>
        </div>

        {/* Notification bell */}
        <div ref={ref} style={{ position: 'relative' }}>
          <button
            onClick={handleBell}
            title="Notifications"
            style={{
              position: 'relative', background: 'rgba(255,255,255,0.18)',
              border: '1px solid rgba(255,255,255,0.3)',
              cursor: 'pointer', padding: '7px 9px', borderRadius: 8,
              fontSize: '1.1rem', lineHeight: 1, color: '#fff',
              transition: 'background 0.15s',
              animation: unreadCount > 0 ? 'bell-ring 0.45s ease infinite alternate' : 'none',
            }}
          >
            🔔
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: -3, right: -3,
                background: '#ef4444', color: '#fff',
                borderRadius: '50%', minWidth: 18, height: 18,
                fontSize: '0.6rem', fontWeight: 900,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 3px', boxShadow: '0 0 0 2px #fff',
              }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {open && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 10px)', right: 0,
              width: 320, maxHeight: 400, overflowY: 'auto',
              background: '#fff', borderRadius: 14,
              border: '1px solid #e2e8f0',
              boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
              zIndex: 9999,
            }}>
              <div style={{
                padding: '12px 16px 10px', fontWeight: 900, fontSize: '0.7rem',
                textTransform: 'uppercase', letterSpacing: '0.08em',
                color: '#64748b', borderBottom: '1px solid #f1f5f9',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span>Notifications</span>
                {unreadCount > 0 && (
                  <span style={{
                    background: '#ef4444', color: '#fff', borderRadius: 20,
                    fontSize: '0.65rem', fontWeight: 900, padding: '2px 7px',
                  }}>
                    {unreadCount} nouvelle{unreadCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {notifications.length === 0 ? (
                <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem', marginBottom: 8 }}>🔕</div>
                  <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Aucune notification</div>
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => handleNotifClick(n.eventType)}
                    style={{
                      padding: '11px 16px',
                      borderBottom: '1px solid #f8fafc',
                      background: n.readAt ? '#fff' : '#fef9ff',
                      cursor: 'pointer',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={e => (e.currentTarget.style.background = n.readAt ? '#fff' : '#fef9ff')}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '1rem',
                        background: n.eventType === 'new_inventaire'
                          ? 'linear-gradient(135deg,#eff6ff,#dbeafe)'
                          : n.eventType === 'nouvelle_commande_acheteur'
                          ? 'linear-gradient(135deg,#f5f3ff,#ede9fe)'
                          : n.eventType === 'new_demande'
                          ? 'linear-gradient(135deg,#fef3c7,#fde68a)'
                          : n.statut === 'validée'
                          ? 'linear-gradient(135deg,#d1fae5,#a7f3d0)'
                          : 'linear-gradient(135deg,#fee2e2,#fecaca)',
                      }}>
                        {n.eventType === 'new_inventaire' ? '📦'
                          : n.eventType === 'nouvelle_commande_acheteur' ? '🤝'
                          : n.eventType === 'new_demande' ? '📥'
                          : n.statut === 'validée' ? '✅' : '❌'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', lineHeight: 1.35 }}>
                          {n.eventType === 'new_inventaire'
                            ? 'Inventaire ajouté par un gérant'
                            : n.eventType === 'nouvelle_commande_acheteur'
                            ? `Nouvelle commande acheteur${n.notesAdmin ? ` — ${n.notesAdmin}` : ''}`
                            : n.eventType === 'new_demande'
                            ? `Nouvelle demande — ${typeLabel(n.type)}`
                            : `Demande ${n.statut === 'validée' ? 'validée ✓' : 'refusée ✗'} — ${typeLabel(n.type)}`}
                        </div>
                        {n.clientNom && (
                          <div style={{ fontSize: '0.73rem', color: '#64748b', marginTop: 2 }}>
                            👤 {n.clientNom}
                          </div>
                        )}
                        {n.notesAdmin && (
                          <div style={{ fontSize: '0.73rem', color: '#64748b', marginTop: 2, fontStyle: 'italic' }}>
                            {n.notesAdmin}
                          </div>
                        )}
                        <div style={{ fontSize: '0.66rem', color: '#94a3b8', marginTop: 4 }}>
                          {new Date(n.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      {!n.readAt && (
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#2563eb', flexShrink: 0, marginTop: 5 }} />
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Logout */}
        <button className="btn btn-ghost btn-sm" onClick={handleLogout} style={{ fontWeight: 600 }}>
          Déconnexion
        </button>
      </div>
    </header>
  );
}
