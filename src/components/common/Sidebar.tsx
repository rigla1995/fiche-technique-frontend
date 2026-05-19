import React, { useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/client';
import type { Activite, ActiviteTypesSummary, Labo, User, AbonnementConfig } from '../../types';

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

interface GerantSidebarProps {
  user: User;
  labos: Labo[];
  gerantActivites: Activite[];
  location: ReturnType<typeof useLocation>;
  openSections: Set<string>;
  toggleSection: (key: string) => void;
  onClose: () => void;
  isHistoriquePage: boolean;
  isHistoriquepertesPage: boolean;
  isProductsPage: boolean;
  currentHistType: string | null;
  currentProductTab: string | null;
  currentActCtx: string | null;
}

function GerantSidebarContent({
  user, labos, gerantActivites, location, openSections, toggleSection, onClose,
  isHistoriquePage, isHistoriquepertesPage, isProductsPage,
  currentHistType: _currentHistType, currentProductTab, currentActCtx: _currentActCtx,
}: GerantSidebarProps) {
  const gerantActiviteId = user.gerantActiviteId;
  const gerantActiviteType = user.gerantActiviteType;

  // ── Gérant Labo ──────────────────────────────────────────────────────────────
  if (gerantActiviteType === 'labo' && gerantActiviteId) {
    const laboId = gerantActiviteId;
    const assignedLabo = labos.find(l => l.id === laboId);
    const laboParam = `laboId=${laboId}`;
    const curTab = new URLSearchParams(location.search).get('tab');
    const isLaboStock = location.pathname === '/client/labo/stock' && location.search.includes(laboParam) && curTab !== 'ingredients';
    const isLaboTransfer = location.pathname === '/client/labo/transfer' && location.search.includes(laboParam);
    const isLaboHistoriqueAppro = location.pathname === '/client/labo/historique-appro' && location.search.includes(laboParam);
    const isLaboHistorique = location.pathname === '/client/labo/historique-transferts' && location.search.includes(laboParam);
    const isLaboHistoriquePertes = location.pathname === '/client/labo/historique-pertes' && location.search.includes(laboParam);
    const isLaboInventaire = location.pathname === '/client/labo/inventaire' && location.search.includes(laboParam);
    const laboLabel = assignedLabo?.nom || 'Labo';

    return (
      <>
        <CollapsibleHeader label={`Espace ${laboLabel}`} icon="🏭" isOpen={openSections.has('gerant-labo')} locked={false} onToggle={() => toggleSection('gerant-labo')} />
        {openSections.has('gerant-labo') && (
          <>
            <li><Link to={`/client/labo/stock?laboId=${laboId}`} className={`sidebar-link ${isLaboStock ? 'active' : ''}`} onClick={onClose}><span className="link-icon">📦</span><span className="link-label">Stock {laboLabel}</span></Link></li>
            <li><Link to={`/client/labo/historique-appro?laboId=${laboId}`} className={`sidebar-link ${isLaboHistoriqueAppro ? 'active' : ''}`} onClick={onClose}><span className="link-icon">📋</span><span className="link-label">Historique Appro</span></Link></li>
            <li><Link to={`/client/labo/historique-pertes?laboId=${laboId}`} className={`sidebar-link ${isLaboHistoriquePertes ? 'active' : ''}`} onClick={onClose}><span className="link-icon">📉</span><span className="link-label">Historique Pertes</span></Link></li>
            <li><Link to={`/client/labo/transfer?laboId=${laboId}`} className={`sidebar-link ${isLaboTransfer ? 'active' : ''}`} onClick={onClose}><span className="link-icon">↗</span><span className="link-label">Transferts {laboLabel}</span></Link></li>
            <li><Link to={`/client/labo/historique-transferts?laboId=${laboId}`} className={`sidebar-link ${isLaboHistorique ? 'active' : ''}`} onClick={onClose}><span className="link-icon">📋</span><span className="link-label">Historiques Transferts</span></Link></li>
            <li><Link to={`/client/labo/inventaire?laboId=${laboId}`} className={`sidebar-link ${isLaboInventaire ? 'active' : ''}`} onClick={onClose}><span className="link-icon">🔢</span><span className="link-label">Inventaire</span></Link></li>
            <li><Link to={`/client/labo/inventaire/historique?laboId=${laboId}`} className={`sidebar-link ${location.pathname === '/client/labo/inventaire/historique' && location.search.includes(laboParam) ? 'active' : ''}`} onClick={onClose}><span className="link-icon">📊</span><span className="link-label">Historique Inventaire</span></Link></li>
          </>
        )}
        <Divider />
        <CollapsibleHeader label="Fournisseurs" icon="🚚" isOpen={openSections.has('gerant-labo-fournisseurs')} locked={false} onToggle={() => toggleSection('gerant-labo-fournisseurs')} />
        {openSections.has('gerant-labo-fournisseurs') && (
          <li><NavLink to="/client/fournisseurs-labo" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}><span className="link-icon">🚚</span><span className="link-label">Fournisseurs Labo</span></NavLink></li>
        )}
        <Divider />
        <CollapsibleHeader label="Approvisionnements Activités" icon="📋" isOpen={openSections.has('gerant-appros')} locked={false} onToggle={() => toggleSection('gerant-appros')} />
        {openSections.has('gerant-appros') && (
          <li><Link to={`/client/stock/historique?entType=activite&laboId=${laboId}`} className={`sidebar-link ${isHistoriquePage ? 'active' : ''}`} onClick={onClose}><span className="link-icon">📋</span><span className="link-label">Toutes les activités</span></Link></li>
        )}
      </>
    );
  }

  // ── Gérant Activité ─────────────────────────────────────────────────────────
  if (gerantActiviteType === 'activite' && gerantActiviteId) {
    const activiteId = gerantActiviteId;
    const assignedActivite = gerantActivites.find(a => a.id === activiteId);
    const activiteNom = assignedActivite?.nom || user.gerantActiviteNom || 'Activité';
    const currentSection = new URLSearchParams(location.search).get('section');

    return (
      <>
        <CollapsibleHeader label={`Espace ${activiteNom}`} icon="📍" isOpen={openSections.has('gerant-activite')} locked={false} onToggle={() => toggleSection('gerant-activite')} />
        {openSections.has('gerant-activite') && (
          <>
            <li><NavLink to={`/client/catalogue-global?activiteId=${activiteId}`} className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}><span className="link-icon">🧂</span><span className="link-label">Ingrédients</span></NavLink></li>
            <li><Link to={`/client/stock?section=activite&activiteId=${activiteId}`} className={`sidebar-link ${location.pathname === '/client/stock' && currentSection === 'activite' ? 'active' : ''}`} onClick={onClose}><span className="link-icon">📦</span><span className="link-label">Stock Activité</span></Link></li>
            <li><Link to={`/client/stock/historique?activiteId=${activiteId}`} className={`sidebar-link ${isHistoriquePage ? 'active' : ''}`} onClick={onClose}><span className="link-icon">📋</span><span className="link-label">Historique Appro</span></Link></li>
            <li><Link to={`/client/stock/historique-pertes?activiteId=${activiteId}`} className={`sidebar-link ${isHistoriquepertesPage ? 'active' : ''}`} onClick={onClose}><span className="link-icon">📉</span><span className="link-label">Historique Pertes</span></Link></li>
            <li><Link to={`/client/inventaire?section=activite&activiteId=${activiteId}`} className={`sidebar-link ${location.pathname === '/client/inventaire' && new URLSearchParams(location.search).get('section') === 'activite' ? 'active' : ''}`} onClick={onClose}><span className="link-icon">🔢</span><span className="link-label">Inventaire</span></Link></li>
            <li><Link to={`/client/inventaire/historique?section=activite&activiteId=${activiteId}`} className={`sidebar-link ${location.pathname === '/client/inventaire/historique' && new URLSearchParams(location.search).get('section') === 'activite' ? 'active' : ''}`} onClick={onClose}><span className="link-icon">📊</span><span className="link-label">Historique Inventaire</span></Link></li>
          </>
        )}
        <Divider />
        <CollapsibleHeader label="Fournisseurs" icon="🚚" isOpen={openSections.has('gerant-act-fournisseurs')} locked={false} onToggle={() => toggleSection('gerant-act-fournisseurs')} />
        {openSections.has('gerant-act-fournisseurs') && (
          <li><NavLink to="/client/fournisseurs" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}><span className="link-icon">🚚</span><span className="link-label">Fournisseurs</span></NavLink></li>
        )}
        <Divider />
        <CollapsibleHeader label="Produits" icon="🍔" isOpen={openSections.has('gerant-produits')} locked={false} onToggle={() => toggleSection('gerant-produits')} />
        {openSections.has('gerant-produits') && (
          <>
            <SubNavLink to="/client/products?tab=vendable" icon="🍔" label="Produits Vendables" isActive={isProductsPage && currentProductTab === 'vendable'} onClick={onClose} />
            <SubNavLink to="/client/products?tab=utilisable" icon="🧪" label="Produits Utilisables" isActive={isProductsPage && currentProductTab === 'utilisable'} onClick={onClose} />
          </>
        )}
      </>
    );
  }

  return null;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [typesSummary, setTypesSummary] = useState<ActiviteTypesSummary | null>(null);
  const [labos, setLabos] = useState<Labo[]>([]);
  const [aboConfig, setAboConfig] = useState<AbonnementConfig | null>(null);
  const isAdmin = user?.role === 'super_admin';
  const isGerant = user?.role === 'gerant';
  const [openSections, setOpenSections] = useState<Set<string>>(
    isAdmin ? new Set(['admin-ref']) : new Set()
  );
  const [gerantActivites, setGerantActivites] = useState<Activite[]>([]);

  const location = useLocation();
  const step = user?.onboardingStep ?? 0;
  const isEntreprise = user?.role === 'client' || user?.role === 'gerant';
  const isOnboarding = isEntreprise && step > 0;

  const currentSearch = new URLSearchParams(location.search);
  const currentSection = currentSearch.get('section');
  const currentHistType = currentSearch.get('type');
  const currentProductTab = currentSearch.get('tab');
  const currentActCtx = currentSearch.get('actCtx');
  const isHistoriquePage = location.pathname === '/client/stock/historique';
  const isHistoriquepertesPage = location.pathname === '/client/stock/historique-pertes';
  const isProductsPage = location.pathname === '/client/products';
  const hasActivites = typesSummary === null ? true : typesSummary.hasActivites;
  const hasSelections = typesSummary === null ? true : typesSummary.hasSelections;
  const hasLaboIngredients = typesSummary === null ? true : (typesSummary.hasLaboIngredients ?? false);

  // New progressive-unlock flags (entreprise only, post-onboarding)
  const hasActivitesOrLabos = hasActivites || labos.length > 0;
  const noActivitesOrLabos = typesSummary !== null && !hasActivites && labos.length === 0;
  const hasActiviteIngredients = hasSelections;
  const hasIngredientsAnywhere = hasActiviteIngredients || hasLaboIngredients;
  const showGerants = !aboConfig || (aboConfig.nbGerants ?? 0) > 0;

  const toggleSection = (key: string) => setOpenSections((prev) => {
    const n = new Set(prev);
    n.has(key) ? n.delete(key) : n.add(key);
    return n;
  });

  useEffect(() => {
    if (isGerant && isEntreprise) {
      api.get('/api/entreprise/activites')
        .then(({ data }) => setGerantActivites(data))
        .catch(() => {});
    }
  }, [isGerant, isEntreprise]);

  useEffect(() => {
    if (isGerant && isEntreprise) {
      api.get('/api/labo').then(({ data }) => setLabos(data)).catch(() => setLabos([]));
      return;
    }
    if (isEntreprise) {
      api.get('/api/labo')
        .then(({ data }) => setLabos(data))
        .catch(() => setLabos([]));
    }
    if (isEntreprise && (step === 0 || step === 3)) {
      api.get('/api/entreprise/activites/types-summary')
        .then(({ data }) => setTypesSummary(data))
        .catch(() => setTypesSummary(null));
      api.get('/api/abonnements/mon-abonnement')
        .then(({ data }) => { if (data?.config) setAboConfig(data.config); })
        .catch(() => {});
    }
  }, [isEntreprise, step, location.pathname, user?.role]);

  useEffect(() => {
    if (!isEntreprise) return;
    const handler = () => {
      api.get('/api/labo').then(({ data }) => setLabos(data)).catch(() => setLabos([]));
    };
    window.addEventListener('labos-changed', handler);
    return () => window.removeEventListener('labos-changed', handler);
  }, [isEntreprise]);


  const sidebarBanner = isOnboarding ? (
    <div style={{ background: '#fef9c3', borderRadius: 8, padding: '10px 12px', margin: '8px 12px', fontSize: '0.78rem', color: '#854d0e', lineHeight: 1.5 }}>
      {step === 1 && '🔒 Changez votre mot de passe pour continuer.'}
      {step === 2 && '🏢 Créez votre première activité pour continuer.'}
      {step === 3 && '🧂 Assignez des ingrédients à vos activités dans le Catalogue pour débloquer les produits et le stock.'}
    </div>
  ) : isEntreprise && noActivitesOrLabos ? (
    <div style={{ background: '#fef9c3', borderRadius: 8, padding: '10px 12px', margin: '8px 12px', fontSize: '0.78rem', color: '#854d0e', lineHeight: 1.5 }}>
      🏢 Créez vos activités ou votre labo pour débloquer les fonctionnalités.
    </div>
  ) : isEntreprise && hasActivitesOrLabos && !hasIngredientsAnywhere ? (
    <div style={{ background: '#e0f2fe', borderRadius: 8, padding: '10px 12px', margin: '8px 12px', fontSize: '0.78rem', color: '#0369a1', lineHeight: 1.5 }}>
      🌐 Assignez vos ingrédients via le <strong>Catalogue Global</strong> pour débloquer les fonctionnalités.
    </div>
  ) : null;

  return (
    <>
      {isOpen && <div className="sidebar-overlay" onClick={onClose} />}
      <nav className={`sidebar ${isOpen ? 'sidebar-open' : ''}`}>
        {sidebarBanner}

        <ul className="sidebar-nav" style={{ flex: 1 }}>
          {user?.role === 'super_admin' ? (
            <>
              {/* ── Liens directs ── */}
              <li>
                <NavLink to="/admin/rapports" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                  <span className="link-icon">📊</span>
                  <span className="link-label">Rapports</span>
                </NavLink>
              </li>
              <li>
                <NavLink to="/admin/clients" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                  <span className="link-icon">👥</span>
                  <span className="link-label">{t('nav.clients')}</span>
                </NavLink>
              </li>

              <Divider />

              {/* ══ RÉFÉRENTIELS ══ */}
              <CollapsibleHeader label="Référentiels" icon="🗂️" isOpen={openSections.has('admin-ref')} locked={false} onToggle={() => toggleSection('admin-ref')} />
              {openSections.has('admin-ref') && (
                <>
                  <SubNavLink to="/admin/units" icon="📏" label={t('nav.units')} isActive={location.pathname === '/admin/units'} onClick={onClose} />
                  <SubNavLink to="/admin/categories" icon="🏷️" label={t('nav.categories')} isActive={location.pathname === '/admin/categories'} onClick={onClose} />
                  <SubNavLink to="/admin/domaines" icon="🗂️" label={t('nav.domaines')} isActive={location.pathname === '/admin/domaines'} onClick={onClose} />
                  <SubNavLink to="/admin/ingredients" icon="🧂" label={t('nav.ingredients')} isActive={location.pathname === '/admin/ingredients'} onClick={onClose} />
                </>
              )}

              <Divider />

              {/* ══ ABONNEMENTS ══ */}
              <CollapsibleHeader label="Abonnements" icon="💳" isOpen={openSections.has('admin-abo')} locked={false} onToggle={() => toggleSection('admin-abo')} />
              {openSections.has('admin-abo') && (
                <>
                  <SubNavLink to="/admin/abonnements" icon="💳" label="Abonnements" isActive={location.pathname === '/admin/abonnements'} onClick={onClose} />
                  <SubNavLink to="/admin/abonnements/paiements" icon="💰" label="Hist. paiements" isActive={location.pathname === '/admin/abonnements/paiements'} onClick={onClose} />
                  <SubNavLink to="/admin/abonnements/promotions" icon="🎁" label="Hist. promotions" isActive={location.pathname === '/admin/abonnements/promotions'} onClick={onClose} />
                </>
              )}

              <Divider />

              {/* ══ AGENTS IA ══ */}
              <li>
                <NavLink to="/admin/active-agents" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                  <span className="link-icon">🤖</span>
                  <span className="link-label">Agents Actifs</span>
                </NavLink>
              </li>

              <Divider />

              {/* ══ TARIFS ══ */}
              <li>
                <NavLink to="/admin/tarifs" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                  <span className="link-icon">⚙️</span>
                  <span className="link-label">Tarifs</span>
                </NavLink>
              </li>

              <Divider />

              {/* ══ SUPPORT ══ */}
              <li>
                <NavLink to="/admin/support" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                  <span className="link-icon">💬</span>
                  <span className="link-label">Demandes</span>
                </NavLink>
              </li>

              <Divider />

              {/* ══ PRESTATAIRES ══ */}
              <li>
                <NavLink to="/admin/prestataires" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                  <span className="link-icon">🛵</span>
                  <span className="link-label">Prestataires</span>
                </NavLink>
              </li>
            </>
          ) : isGerant ? (
            <GerantSidebarContent
              user={user!}
              labos={labos}
              gerantActivites={gerantActivites}
              location={location}
              openSections={openSections}
              toggleSection={toggleSection}
              onClose={onClose}
              isHistoriquePage={isHistoriquePage}
              isHistoriquepertesPage={isHistoriquepertesPage}
              isProductsPage={isProductsPage}
              currentHistType={currentHistType}
              currentProductTab={currentProductTab}
              currentActCtx={currentActCtx}
            />
          ) : (
            <>
              {/* Rapports */}
              <li>
                {isOnboarding || !hasIngredientsAnywhere ? (
                  <LockedLink label={t('nav.rapports', 'Rapports')} />
                ) : (
                  <NavLink
                    to="/client/rapports"
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

              {/* Gérants — visible only if subscription allows; active only when activités or labos exist */}
              {isEntreprise && user?.role === 'client' && showGerants && (
                <>
                <Divider />
                <li>
                  {hasActivitesOrLabos ? (
                    <NavLink to="/client/gerants" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                      <span className="link-icon">👥</span>
                      <span className="link-label">Gérants</span>
                    </NavLink>
                  ) : (
                    <LockedLink label="Gérants" reason="Créez d'abord une activité ou un labo" />
                  )}
                </li>
                </>
              )}

              {/* Entreprise layout */}
              {isEntreprise && (
                <>
                  {/* ══ ESPACE ACTIVITÉS ══ — shown when activités exist */}
                  {(hasActivites || typesSummary === null) && (
                  <>
                  <Divider />
                  <CollapsibleHeader label="Espace Activités" icon="📍" isOpen={openSections.has('activites')} locked={isOnboarding || !hasActiviteIngredients} onToggle={() => toggleSection('activites')} />
                  {openSections.has('activites') && (
                    <>
                      <li>
                        <NavLink to="/client/stock?section=activite" className={({ isActive }) => `sidebar-link ${isActive && currentSection === 'activite' ? 'active' : ''}`} onClick={onClose}>
                          <span className="link-icon">📦</span><span className="link-label">Stock Activités</span>
                        </NavLink>
                      </li>
                      <li>
                        <Link to="/client/stock/historique?entType=activite" className={`sidebar-link ${isHistoriquePage ? 'active' : ''}`} onClick={onClose}>
                          <span className="link-icon">📋</span><span className="link-label">Historique Appro</span>
                        </Link>
                      </li>
                      <li>
                        <Link to="/client/stock/historique-pertes?entType=activite" className={`sidebar-link ${isHistoriquepertesPage ? 'active' : ''}`} onClick={onClose}>
                          <span className="link-icon">📉</span><span className="link-label">Historique Pertes</span>
                        </Link>
                      </li>
                      <li>
                        <Link to="/client/inventaire?section=activite" className={`sidebar-link ${location.pathname === '/client/inventaire' && currentSearch.get('section') === 'activite' ? 'active' : ''}`} onClick={onClose}>
                          <span className="link-icon">🔢</span><span className="link-label">Inventaire</span>
                        </Link>
                      </li>
                      <li>
                        <Link to="/client/inventaire/historique?section=activite" className={`sidebar-link ${location.pathname === '/client/inventaire/historique' && currentSearch.get('section') === 'activite' ? 'active' : ''}`} onClick={onClose}>
                          <span className="link-icon">📊</span><span className="link-label">Historique Inventaire</span>
                        </Link>
                      </li>
                    </>
                  )}
                  </>
                  )}

                  {/* ══ ESPACE LABO ══ — shown when labos exist */}
                  {!isOnboarding && labos.length > 0 && (
                    <>
                      <Divider />
                      <CollapsibleHeader label="Espace Labo" icon="🏭" isOpen={openSections.has('labo')} locked={!hasLaboIngredients} onToggle={() => toggleSection('labo')} />
                      {openSections.has('labo') && (
                        <>
                          <li><NavLink to="/client/labo/stock" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}><span className="link-icon">📦</span><span className="link-label">Stock Labo</span></NavLink></li>
                          <li><NavLink to="/client/labo/historique-appro" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}><span className="link-icon">📋</span><span className="link-label">Historique Appro</span></NavLink></li>
                          <li><NavLink to="/client/labo/historique-pertes" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}><span className="link-icon">📉</span><span className="link-label">Historique Pertes</span></NavLink></li>
                          <li><NavLink to="/client/labo/transfer" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}><span className="link-icon">↗</span><span className="link-label">Transferts</span></NavLink></li>
                          <li><NavLink to="/client/labo/historique-transferts" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}><span className="link-icon">📋</span><span className="link-label">Historique Transferts</span></NavLink></li>
                          <li><NavLink to="/client/labo/inventaire" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}><span className="link-icon">🔢</span><span className="link-label">Inventaire</span></NavLink></li>
                          <li><NavLink to="/client/labo/inventaire/historique" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}><span className="link-icon">📊</span><span className="link-label">Historique Inventaire</span></NavLink></li>
                        </>
                      )}
                    </>
                  )}

                  {/* ══ ESPACE VENTE ══ */}
                  {!isOnboarding && hasActiviteIngredients && (
                    <>
                      <Divider />
                      <CollapsibleHeader label="Espace Vente" icon="🛒" isOpen={openSections.has('vente')} locked={false} onToggle={() => toggleSection('vente')} />
                      {openSections.has('vente') && (
                        <>
                          <li><NavLink to="/client/ingredients-activite" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}><span className="link-icon">🏷️</span><span className="link-label">Catalogue Vente</span></NavLink></li>
                          <li><NavLink to="/client/ventes" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}><span className="link-icon">💰</span><span className="link-label">Ventes Activités</span></NavLink></li>
                          {labos.length > 0 && (
                            <li><NavLink to="/client/labo/ventes" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}><span className="link-icon">📤</span><span className="link-label">Ventes Labo</span></NavLink></li>
                          )}
                        </>
                      )}
                    </>
                  )}

                  <Divider />

                  {/* ══ ESPACE PRODUITS ══ — unlocks when activité has ingredients */}
                  <CollapsibleHeader label="Espace Produits" icon="🍔" isOpen={openSections.has('produits')} locked={isOnboarding || !hasActiviteIngredients} onToggle={() => toggleSection('produits')} />
                  {openSections.has('produits') && (
                    <>
                      <li>
                        <Link to="/client/products?tab=vendable" className={`sidebar-link ${isProductsPage && currentProductTab === 'vendable' ? 'active' : ''}`} onClick={onClose}>
                          <span className="link-icon">🍔</span><span className="link-label">Produits Vendables</span>
                        </Link>
                      </li>
                      <li>
                        <Link to="/client/products?tab=utilisable" className={`sidebar-link ${isProductsPage && currentProductTab === 'utilisable' ? 'active' : ''}`} onClick={onClose}>
                          <span className="link-icon">🧪</span><span className="link-label">Produits Utilisables</span>
                        </Link>
                      </li>
                    </>
                  )}

                  <Divider />

                  {/* ══ ESPACE FOURNISSEURS ══ — unlocks when activités or labos exist */}
                  <CollapsibleHeader label="Espace Fournisseurs" icon="🚚" isOpen={openSections.has('fournisseurs')} locked={isOnboarding || !hasActivitesOrLabos} onToggle={() => toggleSection('fournisseurs')} />
                  {openSections.has('fournisseurs') && (
                    <>
                      <li>
                        <NavLink to="/client/fournisseurs" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                          <span className="link-icon">🚚</span><span className="link-label">Fournisseurs</span>
                        </NavLink>
                      </li>
                      {(labos.length > 0 || (aboConfig?.nbLabos ?? 0) > 0) && (
                        <li>
                          {labos.length === 0 ? (
                            <LockedLink label="Fournisseurs Labos" reason="Créez d'abord un labo depuis Mes Activités" />
                          ) : (
                            <NavLink to="/client/fournisseurs-labo" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                              <span className="link-icon">🏭</span><span className="link-label">Fournisseurs Labos</span>
                            </NavLink>
                          )}
                        </li>
                      )}
                    </>
                  )}

                  <Divider />

                  {/* ══ CATALOGUE GLOBAL ══ — unlocks when activités or labos exist */}
                  <li>
                    {!hasActivitesOrLabos ? (
                      <LockedLink label="Catalogue Global" reason="Créez d'abord une activité ou un labo" />
                    ) : (
                      <NavLink to="/client/catalogue-global" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                        <span className="link-icon">🌐</span><span className="link-label">Catalogue Global</span>
                      </NavLink>
                    )}
                  </li>
                  {hasActivitesOrLabos && (
                    <li>
                      <span style={{ display: 'block', padding: '2px 18px 8px', fontSize: '0.71rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                        Assignez les ingrédients à vos activités et labos
                      </span>
                    </li>
                  )}

                  {/* Demandes — toujours actif */}
                  <Divider />
                  <li>
                    <NavLink to="/client/support" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                      <span className="link-icon">💬</span><span className="link-label">Demandes</span>
                    </NavLink>
                  </li>
                </>
              )}

            </>
          )}
        </ul>

        {(user?.role === 'client' || user?.role === 'gerant') && (
          <ul className="sidebar-nav" style={{ borderTop: '1px solid var(--border)', paddingTop: 4 }}>
            {user?.role === 'client' && (
              <>
                <li>
                  <NavLink to="/client/abonnement" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                    <span className="link-icon">💳</span>
                    <span className="link-label">Mon abonnement</span>
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/client/historique-paiement" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                    <span className="link-icon">🧾</span>
                    <span className="link-label">Historique paiements</span>
                  </NavLink>
                </li>
              </>
            )}
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
