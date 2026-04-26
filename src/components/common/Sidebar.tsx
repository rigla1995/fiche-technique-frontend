import React from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSelection } from '../../context/SelectionContext';
import api from '../../api/client';
import type { ActiviteTypesSummary, Labo } from '../../types';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

function LockedLink({ label, reason }: { label: string; reason?: string }) {
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

function SectionHeader({ label }: { label: string }) {
  return (
    <li>
      <span style={{
        display: 'block',
        padding: '8px 16px 2px',
        fontSize: '0.7rem',
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
        userSelect: 'none',
      }}>
        {label}
      </span>
    </li>
  );
}

function Divider() {
  return <li style={{ borderTop: '1px solid var(--border)', margin: '6px 12px' }} />;
}

function ProductSubLinks({
  locked,
  actCtx,
  ftActCtx,
  onClick,
}: {
  locked: boolean;
  actCtx?: string;
  ftActCtx?: string;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const currentTab = new URLSearchParams(location.search).get('tab') || 'vendable';
  const currentActCtx = new URLSearchParams(location.search).get('actCtx') || '';
  const onProducts = location.pathname === '/client/products';

  const subStyle = {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '5px 12px 5px 32px',
    fontSize: '0.82rem',
    borderRadius: 6,
    margin: '1px 8px',
    textDecoration: 'none',
    color: 'var(--text)',
    cursor: locked ? 'not-allowed' : 'pointer',
    opacity: locked ? 0.4 : 1,
  };

  const activeSubStyle = { ...subStyle, background: 'var(--primary-light, #e8f0fe)', color: 'var(--primary)', fontWeight: 600 };

  const resolvedFtCtx = ftActCtx ?? actCtx;

  const mkHref = (tab: string) => {
    const params = new URLSearchParams({ tab });
    const ctx = tab === 'fiche-technique' ? resolvedFtCtx : actCtx;
    if (ctx) params.set('actCtx', ctx);
    return `/client/products?${params}`;
  };

  const ftLabel = resolvedFtCtx === 'franchise'
    ? `F ${t('client.products.tab_fiche_technique')}`
    : resolvedFtCtx === 'distinct'
      ? `D ${t('client.products.tab_fiche_technique')}`
      : t('client.products.tab_fiche_technique');

  const isTabActive = (tab: string) => {
    if (!onProducts) return false;
    if (tab === 'fiche-technique') {
      if (currentTab !== 'fiche-technique') return false;
      if (resolvedFtCtx === 'franchise') return currentActCtx === 'franchise';
      if (resolvedFtCtx === 'distinct') return currentActCtx === 'distinct' || currentActCtx.startsWith('distinct-');
      return !currentActCtx;
    }
    return currentTab === tab && (!actCtx || currentActCtx === actCtx);
  };

  if (locked) {
    return (
      <>
        {['vendable', 'utilisable', 'fiche-technique'].map((tab) => (
          <li key={tab}>
            <span style={subStyle}>
              {tab === 'fiche-technique' ? '📋' : tab === 'vendable' ? '🍔' : '🧪'}
              {' '}
              {tab === 'fiche-technique' ? ftLabel : tab === 'vendable' ? t('client.products.tab_vendable') : t('client.products.tab_utilisable')}
            </span>
          </li>
        ))}
      </>
    );
  }

  return (
    <>
      {[
        { tab: 'vendable', icon: '🍔', label: t('client.products.tab_vendable') },
        { tab: 'utilisable', icon: '🧪', label: t('client.products.tab_utilisable') },
        { tab: 'fiche-technique', icon: '📋', label: ftLabel },
      ].map(({ tab, icon, label }) => (
        <li key={tab}>
          <Link
            to={mkHref(tab)}
            style={isTabActive(tab) ? activeSubStyle : subStyle}
            onClick={onClick}
          >
            <span style={{ fontSize: '0.85rem' }}>{icon}</span>
            <span>{label}</span>
          </Link>
        </li>
      ))}
    </>
  );
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { hasSelections } = useSelection();
  const [typesSummary, setTypesSummary] = useState<ActiviteTypesSummary | null>(null);
  const [labos, setLabos] = useState<Labo[]>([]);

  const location = useLocation();
  const step = user?.onboardingStep ?? 0;
  const isEntreprise = user?.compteType === 'entreprise';
  const isOnboarding = isEntreprise && step > 0;
  const effectiveHasSelections = isEntreprise ? (step === 0) : hasSelections;

  const currentSection = new URLSearchParams(location.search).get('section');
  const currentHistType = new URLSearchParams(location.search).get('type');
  const isHistoriquePage = location.pathname === '/client/stock/historique';

  const hasFranchise = typesSummary === null ? true : typesSummary.hasFranchise;
  const hasDistinct = typesSummary === null ? true : typesSummary.hasDistinct;
  const hasFranchiseSelections = typesSummary === null ? true : typesSummary.hasFranchiseSelections;
  const hasDistinctSelections = typesSummary === null ? true : typesSummary.hasDistinctSelections;

  useEffect(() => {
    if (isEntreprise && (step === 0 || step === 3)) {
      api.get('/api/entreprise/activites/types-summary')
        .then(({ data }) => setTypesSummary(data))
        .catch(() => setTypesSummary(null));
      api.get('/api/labo')
        .then(({ data }) => setLabos(data))
        .catch(() => setLabos([]));
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

  const sidebarTitle = isEntreprise && user?.entrepriseName
    ? `Espace ${user.entrepriseName}`
    : t('client.title');

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
          <span className="sidebar-title">{user?.role === 'super_admin' ? t('admin.title') : sidebarTitle}</span>
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
              {/* Dashboard */}
              <li>
                {isOnboarding ? (
                  <LockedLink label={t('nav.dashboard')} />
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

              {/* Independant: catalogue, products, stock */}
              {!isEntreprise && (
                <>
                  <Divider />
                  <SectionHeader label={t('nav.mon_espace')} />

                  {/* Catalogue */}
                  <li>
                    <NavLink to="/client/ingredients" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                      <span className="link-icon">🧂</span>
                      <span className="link-label">{t('nav.ingredients_catalog')}</span>
                    </NavLink>
                  </li>

                  {/* Stock */}
                  <li>
                    {!effectiveHasSelections ? (
                      <LockedLink label={t('nav.stock')} reason={t('nav.stock_locked')} />
                    ) : (
                      <NavLink to="/client/stock" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                        <span className="link-icon">📦</span>
                        <span className="link-label">{t('nav.stock')}</span>
                      </NavLink>
                    )}
                  </li>

                  {/* Historique Approvisionnement */}
                  <li>
                    {!effectiveHasSelections ? (
                      <LockedLink label={t('nav.historique_appro')} reason={t('nav.stock_locked')} />
                    ) : (
                      <Link
                        to="/client/stock/historique"
                        className={`sidebar-link ${isHistoriquePage && !currentHistType ? 'active' : ''}`}
                        onClick={onClose}
                      >
                        <span className="link-icon">📋</span>
                        <span className="link-label">{t('nav.historique_appro')}</span>
                      </Link>
                    )}
                  </li>

                  {/* Produits */}
                  <li>
                    <span className="sidebar-link" style={{ opacity: !effectiveHasSelections ? 0.35 : 1, cursor: 'default' }} title={!effectiveHasSelections ? t('nav.products_locked') : undefined}>
                      <span className="link-icon">🍔</span>
                      <span className="link-label">{t('nav.products')}</span>
                    </span>
                  </li>
                  <ProductSubLinks locked={!effectiveHasSelections} onClick={onClose} />
                </>
              )}

              {/* Entreprise layout */}
              {isEntreprise && (
                <>
                  <Divider />

                  {/* Mes Activités */}
                  <li>
                    {isOnboarding && step < 2 ? (
                      <LockedLink label={t('nav.activites')} />
                    ) : (
                      <NavLink to="/client/activites" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                        <span className="link-icon">🏢</span>
                        <span className="link-label">{t('nav.activites')}</span>
                      </NavLink>
                    )}
                  </li>

                  {/* Espace Franchise */}
                  {(isOnboarding || hasFranchise) && (
                    <>
                      <Divider />
                      <SectionHeader label={t('nav.espace_franchise')} />

                      {/* F Catalogue */}
                      <li>
                        {(isOnboarding && step < 3) || !hasFranchise ? (
                          <LockedLink label={t('nav.catalogue_franchise')} reason={!isOnboarding ? t('nav.no_franchise_activity') : undefined} />
                        ) : (
                          <NavLink to="/client/catalogue-franchise" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                            <span className="link-icon">🧂</span>
                            <span className="link-label">{t('nav.catalogue_franchise')}</span>
                          </NavLink>
                        )}
                      </li>

                      {/* F Stock */}
                      <li>
                        {isOnboarding || !hasFranchiseSelections || !hasFranchise ? (
                          <LockedLink label={t('nav.stock_franchise')} reason={!isOnboarding && !hasFranchise ? t('nav.no_franchise_activity') : undefined} />
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

                      {/* F Historique Approvisionnement */}
                      <li>
                        {isOnboarding || !hasFranchiseSelections || !hasFranchise ? (
                          <LockedLink label={t('nav.historique_franchise')} reason={!isOnboarding && !hasFranchise ? t('nav.no_franchise_activity') : undefined} />
                        ) : (
                          <Link
                            to="/client/stock/historique?type=franchise"
                            className={`sidebar-link ${isHistoriquePage && currentHistType === 'franchise' ? 'active' : ''}`}
                            onClick={onClose}
                          >
                            <span className="link-icon">📋</span>
                            <span className="link-label">{t('nav.historique_franchise')}</span>
                          </Link>
                        )}
                      </li>

                      {/* F Produits */}
                      <li>
                        <span className="sidebar-link" style={{ opacity: (isOnboarding || !hasFranchiseSelections || !hasFranchise) ? 0.35 : 1, cursor: 'default' }}>
                          <span className="link-icon">🍔</span>
                          <span className="link-label">{t('nav.products_franchise')}</span>
                        </span>
                      </li>
                      <ProductSubLinks locked={isOnboarding || !hasFranchiseSelections || !hasFranchise} actCtx="franchise" ftActCtx="franchise" onClick={onClose} />
                    </>
                  )}

                  {/* Espace Distinct — always visible when Espace Franchise is shown */}
                  {(isOnboarding || hasFranchise || hasDistinct) && (
                    <>
                      <Divider />
                      <SectionHeader label={t('nav.espace_distinct')} />

                      {/* D Catalogue */}
                      <li>
                        {(isOnboarding && step < 3) || !hasDistinct ? (
                          <LockedLink label={t('nav.catalogue_distinct')} reason={!isOnboarding ? t('nav.no_distinct_activity') : undefined} />
                        ) : (
                          <NavLink to="/client/catalogue-distinct" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                            <span className="link-icon">🧂</span>
                            <span className="link-label">{t('nav.catalogue_distinct')}</span>
                          </NavLink>
                        )}
                      </li>

                      {/* D Stock */}
                      <li>
                        {isOnboarding || !hasDistinctSelections || !hasDistinct ? (
                          <LockedLink label={t('nav.stock_distinct')} reason={!isOnboarding && !hasDistinct ? t('nav.no_distinct_activity') : undefined} />
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

                      {/* D Historique Approvisionnement */}
                      <li>
                        {isOnboarding || !hasDistinctSelections || !hasDistinct ? (
                          <LockedLink label={t('nav.historique_distinct')} reason={!isOnboarding && !hasDistinct ? t('nav.no_distinct_activity') : undefined} />
                        ) : (
                          <Link
                            to="/client/stock/historique?type=distinct"
                            className={`sidebar-link ${isHistoriquePage && currentHistType === 'distinct' ? 'active' : ''}`}
                            onClick={onClose}
                          >
                            <span className="link-icon">📋</span>
                            <span className="link-label">{t('nav.historique_distinct')}</span>
                          </Link>
                        )}
                      </li>

                      {/* D Produits */}
                      <li>
                        <span className="sidebar-link" style={{ opacity: (isOnboarding || !hasDistinctSelections || !hasDistinct) ? 0.35 : 1, cursor: 'default' }}>
                          <span className="link-icon">🍔</span>
                          <span className="link-label">{t('nav.products_distinct')}</span>
                        </span>
                      </li>
                      <ProductSubLinks locked={isOnboarding || !hasDistinctSelections || !hasDistinct} actCtx="distinct" ftActCtx="distinct" onClick={onClose} />
                    </>
                  )}

                  {/* Labo sections — one per labo */}
                  {!isOnboarding && labos.map((labo) => {
                    const laboParam = `laboId=${labo.id}`;
                    const isLaboStock = location.pathname === '/client/labo/stock' && location.search.includes(laboParam);
                    const isLaboTransfer = location.pathname === '/client/labo/transfer' && location.search.includes(laboParam);
                    const isLaboHistorique = location.pathname === '/client/labo/historique-transferts' && location.search.includes(laboParam);
                    return (
                      <React.Fragment key={labo.id}>
                        <Divider />
                        <SectionHeader label={`🏭 ${labo.nom}`} />
                        <li>
                          <Link
                            to={`/client/labo/stock?laboId=${labo.id}`}
                            className={`sidebar-link ${isLaboStock ? 'active' : ''}`}
                            onClick={onClose}
                          >
                            <span className="link-icon">📦</span>
                            <span className="link-label">{t('nav.labo_stock')}</span>
                          </Link>
                        </li>
                        <li>
                          <Link
                            to={`/client/labo/transfer?laboId=${labo.id}`}
                            className={`sidebar-link ${isLaboTransfer ? 'active' : ''}`}
                            onClick={onClose}
                          >
                            <span className="link-icon">↗</span>
                            <span className="link-label">{t('nav.labo_transfer')}</span>
                          </Link>
                        </li>
                        <li>
                          <Link
                            to={`/client/labo/historique-transferts?laboId=${labo.id}`}
                            className={`sidebar-link ${isLaboHistorique ? 'active' : ''}`}
                            onClick={onClose}
                          >
                            <span className="link-icon">📋</span>
                            <span className="link-label">{t('nav.labo_historique')}</span>
                          </Link>
                        </li>
                      </React.Fragment>
                    );
                  })}
                </>
              )}
            </>
          )}
        </ul>

        {user?.role === 'client' && (
          <ul className="sidebar-nav" style={{ borderTop: '1px solid var(--border)', paddingTop: 4 }}>
            <li>
              <NavLink
                to="/client/profile"
                className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                onClick={onClose}
              >
                <span className="link-icon">👤</span>
                <span className="link-label">{t('nav.profile')}</span>
              </NavLink>
            </li>
          </ul>
        )}
      </nav>
    </>
  );
}
