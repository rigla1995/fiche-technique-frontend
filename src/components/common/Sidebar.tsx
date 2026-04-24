import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSelection } from '../../context/SelectionContext';
import api from '../../api/client';
import type { ActiviteTypesSummary } from '../../types';

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
  const [typesSummary, setTypesSummary] = useState<ActiviteTypesSummary | null>(null);

  const location = useLocation();
  const step = user?.onboardingStep ?? 0;
  const isEntreprise = user?.compteType === 'entreprise';
  const isOnboarding = isEntreprise && step > 0;
  // Entreprise ingredient selections live in activite_ingredient_selections, not ingredient_prix_client.
  // Once onboarding is done (step=0) for entreprise, treat selections as present.
  const effectiveHasSelections = isEntreprise ? (step === 0) : hasSelections;

  // Current section param for disambiguating stock NavLink active state
  const currentSection = new URLSearchParams(location.search).get('section');

  // While typesSummary is still loading (null), optimistically allow — avoids flash of locked state.
  // Only lock when we know for certain the type is absent (summary loaded, flag is false).
  const hasFranchise = typesSummary === null ? true : typesSummary.hasFranchise;
  const hasDistinct = typesSummary === null ? true : typesSummary.hasDistinct;

  // Fetch activity types for entreprise users at step 0 or 3 (step 3 = ingredient assignment)
  useEffect(() => {
    if (isEntreprise && (step === 0 || step === 3)) {
      api.get('/api/entreprise/activites/types-summary')
        .then(({ data }) => setTypesSummary(data))
        .catch(() => setTypesSummary(null));
    }
  }, [isEntreprise, step, location.pathname]);

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
      {step === 3 && '🧂 Assignez des ingrédients à vos activités dans le Catalogue pour débloquer les produits et le stock.'}
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

              {/* Catalogue ingrédients */}
              {!isEntreprise && (
                <li>
                  <NavLink
                    to="/client/ingredients"
                    className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                    onClick={onClose}
                  >
                    <span className="link-icon">🧂</span>
                    <span className="link-label">{t('nav.ingredients_catalog')}</span>
                  </NavLink>
                </li>
              )}

              {/* Entreprise: F Catalogue + D Catalogue — always shown, locked if no activity of that type */}
              {isEntreprise && (
                <>
                  {isOnboarding && step < 3 ? (
                    // Before step 3, catalogue is fully locked
                    <>
                      <li><LockedLink icon="🧂" label={t('nav.catalogue_franchise')} /></li>
                      <li><LockedLink icon="🧂" label={t('nav.catalogue_distinct')} /></li>
                    </>
                  ) : (
                    <>
                      {/* F Catalogue — active if hasFranchise, locked otherwise */}
                      <li>
                        {hasFranchise ? (
                          <NavLink
                            to="/client/catalogue-franchise"
                            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                            onClick={onClose}
                          >
                            <span className="link-icon">🧂</span>
                            <span className="link-label">{t('nav.catalogue_franchise')}</span>
                          </NavLink>
                        ) : (
                          <LockedLink label={t('nav.catalogue_franchise')} reason={t('nav.no_franchise_activity')} />
                        )}
                      </li>

                      {/* D Catalogue — active if hasDistinct, locked otherwise */}
                      <li>
                        {hasDistinct ? (
                          <NavLink
                            to="/client/catalogue-distinct"
                            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                            onClick={onClose}
                          >
                            <span className="link-icon">🧂</span>
                            <span className="link-label">{t('nav.catalogue_distinct')}</span>
                          </NavLink>
                        ) : (
                          <LockedLink label={t('nav.catalogue_distinct')} reason={t('nav.no_distinct_activity')} />
                        )}
                      </li>
                    </>
                  )}
                </>
              )}

              {/* Produits — locked during onboarding or without selections */}
              <li>
                {isOnboarding || !effectiveHasSelections ? (
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
              {isEntreprise && (
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

              {/* Stock — independant: single link; entreprise: F Stock + D Stock */}
              {!isEntreprise && (
                <li>
                  {!effectiveHasSelections ? (
                    <LockedLink icon="📦" label={t('nav.stock')} reason={t('nav.stock_locked')} />
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

              {isEntreprise && (
                <>
                  {/* F Stock */}
                  <li>
                    {isOnboarding || !effectiveHasSelections || !hasFranchise ? (
                      <LockedLink
                        label={t('nav.stock_franchise')}
                        reason={
                          isOnboarding ? undefined
                          : !effectiveHasSelections ? t('nav.stock_locked')
                          : t('nav.no_franchise_activity')
                        }
                      />
                    ) : (
                      <NavLink
                        to="/client/stock?section=franchise"
                        className={({ isActive }) => `sidebar-link ${isActive && currentSection === 'franchise' ? 'active' : ''}`}
                        onClick={onClose}
                      >
                        <span className="link-icon">📦</span>
                        <span className="link-label">{t('nav.stock_franchise')}</span>
                      </NavLink>
                    )}
                  </li>

                  {/* D Stock */}
                  <li>
                    {isOnboarding || !effectiveHasSelections || !hasDistinct ? (
                      <LockedLink
                        label={t('nav.stock_distinct')}
                        reason={
                          isOnboarding ? undefined
                          : !effectiveHasSelections ? t('nav.stock_locked')
                          : t('nav.no_distinct_activity')
                        }
                      />
                    ) : (
                      <NavLink
                        to="/client/stock?section=distinct"
                        className={({ isActive }) => `sidebar-link ${isActive && currentSection === 'distinct' ? 'active' : ''}`}
                        onClick={onClose}
                      >
                        <span className="link-icon">📦</span>
                        <span className="link-label">{t('nav.stock_distinct')}</span>
                      </NavLink>
                    )}
                  </li>
                </>
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
