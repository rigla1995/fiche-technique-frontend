import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

interface HeaderProps {
  onMenuToggle: () => void;
}

export default function Header({ onMenuToggle }: HeaderProps) {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === 'fr' ? 'en' : 'fr');
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
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
        <button className="lang-toggle" onClick={toggleLanguage} title="Switch language">
          {i18n.language === 'fr' ? '🇬🇧 EN' : '🇫🇷 FR'}
        </button>
        <div className="user-info">
          <span className="user-name">{user?.name}</span>
          <span className={`role-badge role-${user?.role}`}>
            {user?.role === 'super_admin' ? 'Admin' : 'Client'}
          </span>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
          {t('auth.logout')}
        </button>
      </div>
    </header>
  );
}
