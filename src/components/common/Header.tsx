import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';

interface HeaderProps {
  onMenuToggle: () => void;
}

export default function Header({ onMenuToggle }: HeaderProps) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { notifications, unreadCount, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

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

  const typeLabel = (type: string) => {
    if (type === 'ingredient_manquant') return 'Ingrédient manquant';
    if (type === 'supplement') return 'Ajout de capacité';
    return 'Aide';
  };

  return (
    <header className="header">
      <div className="header-left">
        <button className="menu-toggle" onClick={onMenuToggle} aria-label="Menu">
          <span></span><span></span><span></span>
        </button>
        <div className="header-brand">
          <span className="brand-icon">🍽️</span>
          <span className="brand-name">FicheTech</span>
        </div>
      </div>
      <div className="header-right">
        <div className="user-info">
          <span className="user-name">{user?.name}</span>
          <span className={`role-badge role-${user?.role}`}>
            {user?.role === 'super_admin' ? 'Admin' : 'Client'}
          </span>
        </div>

        {/* Notification bell */}
        <div ref={ref} style={{ position: 'relative' }}>
          <button
            onClick={handleBell}
            title="Notifications"
            style={{
              position: 'relative', background: 'none', border: 'none',
              cursor: 'pointer', padding: '4px 6px', borderRadius: 8,
              fontSize: '1.15rem', lineHeight: 1, color: 'var(--text)',
              animation: unreadCount > 0 ? 'bell-ring 0.5s ease infinite alternate' : 'none',
            }}
          >
            🔔
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: 0, right: 0,
                background: '#ef4444', color: '#fff',
                borderRadius: '50%', minWidth: 16, height: 16,
                fontSize: '0.62rem', fontWeight: 900,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 3px', boxShadow: '0 0 0 2px #fff',
              }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {open && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 8px)', right: 0,
              width: 300, maxHeight: 360, overflowY: 'auto',
              background: 'var(--surface)', borderRadius: 12,
              border: '1px solid var(--border)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.16)',
              zIndex: 9999,
            }}>
              <div style={{
                padding: '10px 14px 8px', fontWeight: 800, fontSize: '0.72rem',
                textTransform: 'uppercase', letterSpacing: '0.07em',
                color: 'var(--text-muted)', borderBottom: '1px solid var(--border)',
              }}>
                Notifications
              </div>
              {notifications.length === 0 ? (
                <div style={{ padding: '24px 14px', fontSize: '0.83rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                  Aucune notification
                </div>
              ) : (
                notifications.map((n) => (
                  <div key={n.id} style={{
                    padding: '10px 14px',
                    borderBottom: '1px solid var(--border)',
                    background: n.readAt ? 'transparent' : 'rgba(239,68,68,0.05)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>
                        {n.eventType === 'new_demande' ? '📥' : n.statut === 'validée' ? '✅' : '❌'}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text)', lineHeight: 1.3 }}>
                          {n.eventType === 'new_demande'
                            ? `Nouvelle demande — ${typeLabel(n.type)}`
                            : `Demande ${n.statut === 'validée' ? 'validée ✓' : 'refusée ✗'} — ${typeLabel(n.type)}`}
                        </div>
                        {n.clientNom && (
                          <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: 2 }}>
                            Client : {n.clientNom}
                          </div>
                        )}
                        {n.notesAdmin && (
                          <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: 2, fontStyle: 'italic' }}>
                            {n.notesAdmin}
                          </div>
                        )}
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 4 }}>
                          {new Date(n.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
          {t('auth.logout')}
        </button>
      </div>
    </header>
  );
}
