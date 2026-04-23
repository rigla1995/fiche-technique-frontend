import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { t } = useTranslation();
  const { user } = useAuth();

  const adminLinks = [
    { to: '/admin', label: t('nav.dashboard'), icon: '📊', end: true },
    { to: '/admin/clients', label: t('nav.clients'), icon: '👥' },
    { to: '/admin/units', label: t('nav.units'), icon: '📏' },
    { to: '/admin/categories', label: t('nav.categories'), icon: '🏷️' },
    { to: '/admin/ingredients', label: t('nav.ingredients'), icon: '🧂' },
  ];

  const clientMainLinks = [
    { to: '/client', label: t('nav.dashboard'), icon: '📊', end: true },
    { to: '/client/products', label: t('nav.products'), icon: '🍔' },
    { to: '/client/ingredients', label: t('nav.ingredients_catalog'), icon: '🧂' },
  ];

  const profileLink = { to: '/client/profile', label: t('nav.profile'), icon: '👤' };

  const links = user?.role === 'super_admin' ? adminLinks : clientMainLinks;

  return (
    <>
      {isOpen && <div className="sidebar-overlay" onClick={onClose} />}
      <nav className={`sidebar ${isOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-header">
          <span className="sidebar-title">
            {user?.role === 'super_admin' ? t('admin.title') : t('client.title')}
          </span>
        </div>
        <ul className="sidebar-nav" style={{ flex: 1 }}>
          {links.map((link) => (
            <li key={link.to}>
              <NavLink
                to={link.to}
                end={link.end}
                className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                onClick={onClose}
              >
                <span className="link-icon">{link.icon}</span>
                <span className="link-label">{link.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
        {user?.role === 'client' && (
          <ul className="sidebar-nav" style={{ borderTop: '1px solid var(--border)', paddingTop: 4 }}>
            <li>
              <NavLink
                to={profileLink.to}
                className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                onClick={onClose}
              >
                <span className="link-icon">{profileLink.icon}</span>
                <span className="link-label">{profileLink.label}</span>
              </NavLink>
            </li>
          </ul>
        )}
      </nav>
    </>
  );
}
