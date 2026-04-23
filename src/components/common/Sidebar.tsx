import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { useSelection } from '../../context/SelectionContext';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

function LockedLink({ label, reason }: { icon?: string; label: string; reason?: string }) {
  return (
    <span
      className="sidebar-link"
      style={{ opacity: 0.35, cursor: 'not-allowed', userSelect: 'none' }}
      title={reason}
    >
      <span className="link-icon">🔒</span>
      <span className="link-label">{label}</span>
    </span>
  );
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { hasSelections } = useSelection();

  const step = user?.onboardingStep ?? 0;
  const isOnboarding = user?.compteType === 'entreprise' && step > 0;

  const adminLinks = [
    { to: '/admin', label: t('nav.dashboard'), icon: '📊', end: true },
    { to: '/admin/clients', label: t('nav.clients'), icon: '👥' },
    { to: '/admin/units', label: t('nav.units'), icon: '📏' },
    { to: '/admin/categories', label: t('nav.categories'), icon: '🏷️' },
    { to: '/admin/domaines', label: t('nav.domaines'), icon: '🗂️' },
    { to: '/admin/ingredients', label: t('nav.ingredients'), icon: '🧂' },
  ];

  const profileLink = { to: '/client/profile', label: t('nav.profile'), icon: '👤' };

  // Onboarding banner shown inside sidebar for entreprise users
  const onboardingHint = isOnboarding ? (
    <div style={{ background: '#fef9c3', borderRadius: 8, padding: '10px 12px', margin: '8px 12px', fontSize: '0.78rem', color: '#854d0e', lineHeight: 1.5 }}>
      {step === 1 && '🔒 Changez votre mot de passe pour continuer.'}
      {step === 2 && '🏢 Créez votre première activité pour continuer.'}
      {step === 3 && '🧂 Sélectionnez vos ingrédients pour débloquer le stock.'}
    </div>
  ) : null;

  return (
    <>
      {isOpen && <div className="sidebar-overlay" onClick={onClose} />}
      <nav className={`sidebar ${isOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-header">
          <span className="sidebar-title">
            {user?.role === 'super_admin' ? t('admin.title') : t('client.title')}
          </span>
        </div>

        {onboardingHint}

        <ul className="sidebar-nav" style={{ flex: 1 }}>
          {user?.role === 'super_admin' ? (
            adminLinks.map((link) => (
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
            ))
          ) : (
            <>
              {/* Dashboard — locked during onboarding */}
              <li>
                {isOnboarding ? (
                  <LockedLink icon="📊" label={t('nav.dashboard')} />
                ) : (
                  <NavLink
                    to="/client"
                    end
                    className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                    onClick={onClose}
                  >
                    <span className="link-icon">📊</span>
                    <span className="link-label">{t('nav.dashboard')}</span>
                  </NavLink>
                )}
              </li>

              {/* Catalogue ingrédients — unlocks at step 3+ */}
              <li>
                {isOnboarding && step < 3 ? (
                  <LockedLink icon="🧂" label={t('nav.ingredients_catalog')} />
                ) : (
                  <NavLink
                    to="/client/ingredients"
                    className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                    onClick={onClose}
                  >
                    <span className="link-icon">🧂</span>
                    <span className="link-label">{t('nav.ingredients_catalog')}</span>
                  </NavLink>
                )}
              </li>

              {/* Produits — locked during onboarding or without selections */}
              <li>
                {isOnboarding || !hasSelections ? (
                  <LockedLink
                    icon="🍔"
                    label={t('nav.products')}
                    reason={isOnboarding ? undefined : t('nav.products_locked')}
                  />
                ) : (
                  <NavLink
                    to="/client/products"
                    className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                    onClick={onClose}
                  >
                    <span className="link-icon">🍔</span>
                    <span className="link-label">{t('nav.products')}</span>
                  </NavLink>
                )}
              </li>

              {/* Mes Activités — entreprise only, unlocks at step 2+ */}
              {user?.compteType === 'entreprise' && (
                <li>
                  {isOnboarding && step < 2 ? (
                    <LockedLink icon="🏢" label={t('nav.activites')} />
                  ) : (
                    <NavLink
                      to="/client/activites"
                      className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                      onClick={onClose}
                    >
                      <span className="link-icon">🏢</span>
                      <span className="link-label">{t('nav.activites')}</span>
                    </NavLink>
                  )}
                </li>
              )}

              {/* Stock — entreprise only, locked during onboarding or without selections */}
              {user?.compteType === 'entreprise' && (
                <li>
                  {isOnboarding || !hasSelections ? (
                    <LockedLink
                      icon="📦"
                      label={t('nav.stock')}
                      reason={isOnboarding ? undefined : t('nav.stock_locked')}
                    />
                  ) : (
                    <NavLink
                      to="/client/stock"
                      className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                      onClick={onClose}
                    >
                      <span className="link-icon">📦</span>
                      <span className="link-label">{t('nav.stock')}</span>
                    </NavLink>
                  )}
                </li>
              )}
            </>
          )}
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
