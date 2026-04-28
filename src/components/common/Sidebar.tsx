import React, { useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useEffect } from 'react';
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

function SectionHeader({ label, locked }: { label: string; locked?: boolean }) {
  return (
    <li>
      <span style={{
        display: 'block',
        padding: '10px 19px 4px',
        fontSize: '0.65rem',
        fontWeight: 800,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
        userSelect: 'none',
        opacity: locked ? 0.4 : 1,
      }}>
        {locked ? '🔒 ' : ''}{label}
      </span>
    </li>
  );
}

function Divider() {
  return <li style={{ borderTop: '1px solid var(--border)', margin: '8px 16px 4px' }} />;
}

function CollapsibleHeader({
  label,
  icon,
  isOpen,
  locked,
  onToggle,
}: {
  label: string;
  icon: string;
  isOpen: boolean;
  locked: boolean;
  onToggle: () => void;
}) {
  if (locked) {
    return (
      <li>
        <span className="sidebar-link" style={{ opacity: 0.35, cursor: 'not-allowed', userSelect: 'none' }}>
          <span className="link-icon">{icon}</span>
          <span className="link-label">{label}</span>
          <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-muted)' }}>▶</span>
        </span>
      </li>
    );
  }
  return (
    <li>
      <button
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          padding: '10px 16px', borderRadius: 8, margin: '1px 0',
          color: 'var(--text)', fontSize: '0.9rem', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: '1rem', width: 20, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
        <span style={{ flex: 1, fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{isOpen ? '▼' : '▶'}</span>
      </button>
    </li>
  );
}

function SubNavLink({ to, icon, label, isActive, onClick }: {
  to: string; icon: string; label: string; isActive: boolean; onClick: () => void;
}) {
  return (
    <li>
      <Link
        to={to}
        onClick={onClick}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 12px 6px 36px',
          fontSize: '0.83rem', borderRadius: 6, margin: '1px 8px',
          textDecoration: 'none',
          color: isActive ? 'var(--primary)' : 'var(--text)',
          background: isActive ? 'var(--primary-light, #e8f0fe)' : undefined,
          fontWeight: isActive ? 600 : undefined,
        }}
      >
        <span style={{ fontSize: '0.85rem' }}>{icon}</span>
        <span>{label}</span>
      </Link>
    </li>
  );
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
    padding: '5px 12px 5px 36px',
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

  const items = [
    { tab: 'vendable', icon: '🍔', label: t('client.products.tab_vendable') },
    { tab: 'utilisable', icon: '🧪', label: t('client.products.tab_utilisable') },
    { tab: 'fiche-technique', icon: '📋', label: t('client.products.tab_fiche_technique') },
  ];

  if (locked) {
    return (
      <>
        {items.map(({ tab, icon, label }) => (
          <li key={tab}>
            <span style={subStyle}>
              <span style={{ fontSize: '0.85rem' }}>{icon}</span>
              <span>{label}</span>
            </span>
          </li>
        ))}
      </>
    );
  }

  return (
    <>
      {items.map(({ tab, icon, label }) => (
        <li key={tab}>
          <Link to={mkHref(tab)} style={isTabActive(tab) ? activeSubStyle : subStyle} onClick={onClick}>
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
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());

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
  const hasFranchiseAppro = typesSummary === null ? true : typesSummary.hasFranchiseAppro;
  const hasDistinctAppro = typesSummary === null ? true : typesSummary.hasDistinctAppro;

  const toggleSection = (key: string) => setOpenSections((prev) => {
    const n = new Set(prev);
    n.has(key) ? n.delete(key) : n.add(key);
    return n;
  });

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

  useEffect(() => {
    if (!isEntreprise) return;
    const handler = () => {
      api.get('/api/labo').then(({ data }) => setLabos(data)).catch(() => setLabos([]));
    };
    window.addEventListener('labos-changed', handler);
    return () => window.removeEventListener('labos-changed', handler);
  }, [isEntreprise]);

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
              {/* Rapports */}
              <li>
                {isOnboarding ? (
                  <LockedLink label={t('nav.rapports', 'Rapports')} />
                ) : (
                  <NavLink
                    to="/client"
                    end
                    className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                    onClick={onClose}
                  >
                    <span className="link-icon">📊</span>
                    <span className="link-label">{t('nav.rapports', 'Rapports')}</span>
                  </NavLink>
                )}
              </li>

              <Divider />

              {/* Mes Activités */}
              {isEntreprise && (
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
              )}

              {/* Independent: catalogue, stock, historique, produits */}
              {!isEntreprise && (
                <>
                  <li>
                    {!effectiveHasSelections ? (
                      <LockedLink label={t('nav.ingredients_catalog')} reason={t('nav.stock_locked')} />
                    ) : (
                      <NavLink to="/client/ingredients" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                        <span className="link-icon">🧂</span>
                        <span className="link-label">{t('nav.ingredients_catalog')}</span>
                      </NavLink>
                    )}
                  </li>
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
                  <CollapsibleHeader
                    label={t('nav.products')}
                    icon="🍔"
                    isOpen={openSections.has('produits-indep')}
                    locked={!effectiveHasSelections}
                    onToggle={() => toggleSection('produits-indep')}
                  />
                  {openSections.has('produits-indep') && effectiveHasSelections && (
                    <ProductSubLinks locked={false} onClick={onClose} />
                  )}
                  {!effectiveHasSelections && (
                    <ProductSubLinks locked={true} onClick={onClose} />
                  )}
                </>
              )}

              {/* Entreprise layout */}
              {isEntreprise && (
                <>
                  <Divider />

                  {/* Espace Franchise */}
                  <SectionHeader label={t('nav.espace_franchise')} locked={isOnboarding || !hasFranchise} />

                  {/* F Catalogue */}
                  <li>
                    {(isOnboarding && step < 3) || !hasFranchise || !hasFranchiseSelections ? (
                      <LockedLink label={t('nav.ingredients_catalog')} />
                    ) : (
                      <NavLink to="/client/catalogue-franchise" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                        <span className="link-icon">🧂</span>
                        <span className="link-label">{t('nav.ingredients_catalog')}</span>
                      </NavLink>
                    )}
                  </li>

                  {/* F Stock */}
                  <li>
                    {isOnboarding || !hasFranchise || !hasFranchiseSelections ? (
                      <LockedLink label={t('nav.stock')} />
                    ) : (
                      <NavLink
                        to="/client/stock?section=franchise"
                        className={({ isActive }) => `sidebar-link ${isActive && currentSection === 'franchise' ? 'active' : ''}`}
                        onClick={onClose}
                      >
                        <span className="link-icon">📦</span>
                        <span className="link-label">{t('nav.stock')}</span>
                      </NavLink>
                    )}
                  </li>

                  {/* F Historique Appro */}
                  <li>
                    {isOnboarding || !hasFranchise || !hasFranchiseAppro ? (
                      <LockedLink label={t('nav.historique_appro')} />
                    ) : (
                      <Link
                        to="/client/stock/historique?type=franchise"
                        className={`sidebar-link ${isHistoriquePage && currentHistType === 'franchise' ? 'active' : ''}`}
                        onClick={onClose}
                      >
                        <span className="link-icon">📋</span>
                        <span className="link-label">{t('nav.historique_appro')}</span>
                      </Link>
                    )}
                  </li>

                  {/* Labo sections — collapsible per labo */}
                  {!isOnboarding && labos.length === 0 && (
                    <CollapsibleHeader
                      label="Labo"
                      icon="🏭"
                      isOpen={false}
                      locked={true}
                      onToggle={() => {}}
                    />
                  )}
                  {!isOnboarding && labos.map((labo) => {
                    const key = `labo-${labo.id}`;
                    const isLaboOpen = openSections.has(key);
                    const laboParam = `laboId=${labo.id}`;
                    const isLaboStock = location.pathname === '/client/labo/stock' && location.search.includes(laboParam);
                    const isLaboTransfer = location.pathname === '/client/labo/transfer' && location.search.includes(laboParam);
                    const isLaboHistorique = location.pathname === '/client/labo/historique-transferts' && location.search.includes(laboParam);
                    return (
                      <React.Fragment key={labo.id}>
                        <CollapsibleHeader
                          label={labo.nom}
                          icon="🏭"
                          isOpen={isLaboOpen}
                          locked={false}
                          onToggle={() => toggleSection(key)}
                        />
                        {isLaboOpen && (
                          <>
                            <SubNavLink to={`/client/labo/stock?laboId=${labo.id}`} icon="📦" label={t('nav.labo_stock')} isActive={isLaboStock} onClick={onClose} />
                            <SubNavLink to={`/client/labo/transfer?laboId=${labo.id}`} icon="↗" label={t('nav.labo_transfer')} isActive={isLaboTransfer} onClick={onClose} />
                            <SubNavLink to={`/client/labo/historique-transferts?laboId=${labo.id}`} icon="📋" label={t('nav.labo_historique')} isActive={isLaboHistorique} onClick={onClose} />
                          </>
                        )}
                      </React.Fragment>
                    );
                  })}

                  {/* F Produits — collapsible */}
                  <CollapsibleHeader
                    label={t('nav.products')}
                    icon="🍔"
                    isOpen={openSections.has('produits-franchise')}
                    locked={isOnboarding || !hasFranchise || !hasFranchiseSelections}
                    onToggle={() => toggleSection('produits-franchise')}
                  />
                  {openSections.has('produits-franchise') && !isOnboarding && hasFranchise && hasFranchiseSelections && (
                    <ProductSubLinks locked={false} actCtx="franchise" ftActCtx="franchise" onClick={onClose} />
                  )}

                  <Divider />

                  {/* Espace Distinct */}
                  <SectionHeader label={t('nav.espace_distinct')} locked={isOnboarding || !hasDistinct} />

                  {/* D Catalogue */}
                  <li>
                    {(isOnboarding && step < 3) || !hasDistinct || !hasDistinctSelections ? (
                      <LockedLink label={t('nav.ingredients_catalog')} />
                    ) : (
                      <NavLink to="/client/catalogue-distinct" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                        <span className="link-icon">🧂</span>
                        <span className="link-label">{t('nav.ingredients_catalog')}</span>
                      </NavLink>
                    )}
                  </li>

                  {/* D Stock */}
                  <li>
                    {isOnboarding || !hasDistinct || !hasDistinctSelections ? (
                      <LockedLink label={t('nav.stock')} />
                    ) : (
                      <NavLink
                        to="/client/stock?section=distinct"
                        className={({ isActive }) => `sidebar-link ${isActive && currentSection === 'distinct' ? 'active' : ''}`}
                        onClick={onClose}
                      >
                        <span className="link-icon">📦</span>
                        <span className="link-label">{t('nav.stock')}</span>
                      </NavLink>
                    )}
                  </li>

                  {/* D Historique Appro */}
                  <li>
                    {isOnboarding || !hasDistinct || !hasDistinctAppro ? (
                      <LockedLink label={t('nav.historique_appro')} />
                    ) : (
                      <Link
                        to="/client/stock/historique?type=distinct"
                        className={`sidebar-link ${isHistoriquePage && currentHistType === 'distinct' ? 'active' : ''}`}
                        onClick={onClose}
                      >
                        <span className="link-icon">📋</span>
                        <span className="link-label">{t('nav.historique_appro')}</span>
                      </Link>
                    )}
                  </li>

                  {/* D Produits — collapsible */}
                  <CollapsibleHeader
                    label={t('nav.products')}
                    icon="🍔"
                    isOpen={openSections.has('produits-distinct')}
                    locked={isOnboarding || !hasDistinct || !hasDistinctSelections}
                    onToggle={() => toggleSection('produits-distinct')}
                  />
                  {openSections.has('produits-distinct') && !isOnboarding && hasDistinct && hasDistinctSelections && (
                    <ProductSubLinks locked={false} actCtx="distinct" ftActCtx="distinct" onClick={onClose} />
                  )}

                  {/* Fournisseurs — locked if no activities yet */}
                  {!isOnboarding && (
                    <li>
                      {!hasFranchise && !hasDistinct ? (
                        <LockedLink label="Fournisseurs" reason="Créez d'abord une activité" />
                      ) : (
                        <NavLink to="/client/fournisseurs" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                          <span className="link-icon">🚚</span>
                          <span className="link-label">Fournisseurs</span>
                        </NavLink>
                      )}
                    </li>
                  )}

                  <Divider />

                  {/* Catalogue Global */}
                  <li>
                    {isOnboarding && step < 3 ? (
                      <LockedLink label={t('nav.catalogue_global', 'Catalogue Global')} />
                    ) : (
                      <NavLink to="/client/catalogue-global" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                        <span className="link-icon">🌐</span>
                        <span className="link-label">{t('nav.catalogue_global', 'Catalogue Global')}</span>
                      </NavLink>
                    )}
                  </li>
                </>
              )}

              {/* Catalogue Global for independent */}
              {!isEntreprise && (
                <>
                  <Divider />
                  <li>
                    <NavLink to="/client/catalogue-global" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                      <span className="link-icon">🌐</span>
                      <span className="link-label">{t('nav.catalogue_global', 'Catalogue Global')}</span>
                    </NavLink>
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
