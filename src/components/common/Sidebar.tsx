import React, { useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSelection } from '../../context/SelectionContext';
import api from '../../api/client';
import type { Activite, ActiviteTypesSummary, Labo, User } from '../../types';

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

interface GerantSidebarProps {
  user: User;
  isEntreprise: boolean;
  labos: Labo[];
  gerantActivites: Activite[];
  location: ReturnType<typeof useLocation>;
  openSections: Set<string>;
  toggleSection: (key: string) => void;
  onClose: () => void;
  isHistoriquePage: boolean;
  isHistoriquepertesPage: boolean;
  isProductsPage: boolean;
  currentSection: string | null;
  currentHistType: string | null;
  currentProductTab: string | null;
  currentActCtx: string | null;
}

function GerantSidebarContent({
  user, isEntreprise, labos, gerantActivites, location, openSections, toggleSection, onClose,
  isHistoriquePage, isHistoriquepertesPage, isProductsPage,
  currentSection, currentHistType, currentProductTab, currentActCtx,
}: GerantSidebarProps) {
  const gerantActiviteId = user.gerantActiviteId;
  const isLaboGerant = user.gerantActiviteType === 'labo';

  // Independent gérant: show simplified indep stock section
  if (!isEntreprise) {
    return (
      <>
        <CollapsibleHeader label="Espace Activité" icon="📍" isOpen={openSections.has('gerant-indep')} locked={false} onToggle={() => toggleSection('gerant-indep')} />
        {openSections.has('gerant-indep') && (
          <>
            <li><NavLink to="/client/ingredients?readonly=true" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}><span className="link-icon">🧂</span><span className="link-label">Activité Ingrédients</span></NavLink></li>
            <li><NavLink to="/client/stock" end className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}><span className="link-icon">📦</span><span className="link-label">Stock Activité</span></NavLink></li>
            <li><NavLink to="/client/stock/historique" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}><span className="link-icon">📋</span><span className="link-label">Historique Appro</span></NavLink></li>
            <li><NavLink to="/client/stock/historique-pertes" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}><span className="link-icon">📉</span><span className="link-label">Historique Pertes</span></NavLink></li>
            <li><NavLink to="/client/inventaire" end className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}><span className="link-icon">🔢</span><span className="link-label">Inventaire</span></NavLink></li>
            <li><NavLink to="/client/inventaire/historique" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}><span className="link-icon">📊</span><span className="link-label">Historique Inventaire</span></NavLink></li>
          </>
        )}
        <Divider />
        <CollapsibleHeader label="Produits" icon="🍔" isOpen={openSections.has('gerant-produits')} locked={false} onToggle={() => toggleSection('gerant-produits')} />
        {openSections.has('gerant-produits') && (
          <>
            <SubNavLink to="/client/products?tab=vendable" icon="🍔" label="Produits Vendables" isActive={isProductsPage && currentProductTab === 'vendable' && !currentActCtx} onClick={onClose} />
            <SubNavLink to="/client/products?tab=utilisable" icon="🧪" label="Produits Utilisables" isActive={isProductsPage && currentProductTab === 'utilisable' && !currentActCtx} onClick={onClose} />
          </>
        )}
      </>
    );
  }

  if (isLaboGerant) {
    const laboId = gerantActiviteId!;
    const assignedLabo = labos.find(l => l.id === laboId);
    const laboActivites = gerantActivites.filter(a => a.laboId === laboId);
    const laboParam = `laboId=${laboId}`;
    const curTab = new URLSearchParams(location.search).get('tab');
    const isLaboIngredients = location.pathname === '/client/labo/stock' && location.search.includes(laboParam) && curTab === 'ingredients';
    const isLaboStock = location.pathname === '/client/labo/stock' && location.search.includes(laboParam) && curTab !== 'ingredients';
    const isLaboTransfer = location.pathname === '/client/labo/transfer' && location.search.includes(laboParam);
    const isLaboHistoriqueAppro = location.pathname === '/client/labo/historique-appro' && location.search.includes(laboParam);
    const isLaboHistorique = location.pathname === '/client/labo/historique-transferts' && location.search.includes(laboParam);
    const isLaboInventaire = location.pathname === '/client/labo/inventaire' && location.search.includes(laboParam);
    const laboLabel = assignedLabo?.nom || 'Labo';

    return (
      <>
        <CollapsibleHeader label={`Espace ${laboLabel}`} icon="🏭" isOpen={openSections.has('gerant-labo')} locked={false} onToggle={() => toggleSection('gerant-labo')} />
        {openSections.has('gerant-labo') && (
          <>
            <li><Link to={`/client/labo/stock?laboId=${laboId}&tab=ingredients`} className={`sidebar-link ${isLaboIngredients ? 'active' : ''}`} onClick={onClose}><span className="link-icon">🧂</span><span className="link-label">Ingrédients Stock</span></Link></li>
            <li><Link to={`/client/labo/stock?laboId=${laboId}`} className={`sidebar-link ${isLaboStock ? 'active' : ''}`} onClick={onClose}><span className="link-icon">📦</span><span className="link-label">Stock {laboLabel}</span></Link></li>
            <li><Link to={`/client/labo/transfer?laboId=${laboId}`} className={`sidebar-link ${isLaboTransfer ? 'active' : ''}`} onClick={onClose}><span className="link-icon">↗</span><span className="link-label">Transferts {laboLabel}</span></Link></li>
            <li><Link to={`/client/labo/historique-appro?laboId=${laboId}`} className={`sidebar-link ${isLaboHistoriqueAppro ? 'active' : ''}`} onClick={onClose}><span className="link-icon">📋</span><span className="link-label">Historique Appro</span></Link></li>
            <li><Link to={`/client/labo/historique-transferts?laboId=${laboId}`} className={`sidebar-link ${isLaboHistorique ? 'active' : ''}`} onClick={onClose}><span className="link-icon">📋</span><span className="link-label">Historiques Transferts</span></Link></li>
            <li><Link to={`/client/labo/inventaire?laboId=${laboId}`} className={`sidebar-link ${isLaboInventaire ? 'active' : ''}`} onClick={onClose}><span className="link-icon">🔢</span><span className="link-label">Inventaire</span></Link></li>
            <li><Link to={`/client/labo/inventaire/historique?laboId=${laboId}`} className={`sidebar-link ${location.pathname === '/client/labo/inventaire/historique' && location.search.includes(laboParam) ? 'active' : ''}`} onClick={onClose}><span className="link-icon">📊</span><span className="link-label">Historique Inventaire</span></Link></li>
          </>
        )}

        <Divider />
        <CollapsibleHeader label="Approvisionnements Activités" icon="📋" isOpen={openSections.has('gerant-appros')} locked={false} onToggle={() => toggleSection('gerant-appros')} />
        {openSections.has('gerant-appros') && (
          <>
            <li>
              <Link to={`/client/stock/historique?type=franchise&laboId=${laboId}`} className={`sidebar-link ${isHistoriquePage && currentHistType === 'franchise' ? 'active' : ''}`} onClick={onClose}>
                <span className="link-icon">🔗</span>
                <span className="link-label">Franchises</span>
              </Link>
            </li>
            <li>
              <Link to={`/client/stock/historique?type=distinct&laboId=${laboId}`} className={`sidebar-link ${isHistoriquePage && currentHistType === 'distinct' ? 'active' : ''}`} onClick={onClose}>
                <span className="link-icon">📍</span>
                <span className="link-label">Distinctes</span>
              </Link>
            </li>
          </>
        )}

        <Divider />
        <CollapsibleHeader label="Produits" icon="🍔" isOpen={openSections.has('gerant-produits')} locked={false} onToggle={() => toggleSection('gerant-produits')} />
        {openSections.has('gerant-produits') && (
          <>
            <SubNavLink to={`/client/products?tab=utilisable&actCtx=franchise&laboId=${laboId}`} icon="🧪" label="Utilisables Franchises" isActive={isProductsPage && currentProductTab === 'utilisable' && currentActCtx === 'franchise'} onClick={onClose} />
            <SubNavLink to={`/client/products?tab=utilisable&actCtx=distinct&laboId=${laboId}`} icon="🧪" label="Utilisables Distinctes" isActive={isProductsPage && currentProductTab === 'utilisable' && currentActCtx === 'distinct'} onClick={onClose} />
          </>
        )}
      </>
    );
  }

  // Activité gérant (franchise or activite_distincte)
  const activiteId = gerantActiviteId!;
  const assignedActivite = gerantActivites.find(a => a.id === activiteId);
  const activiteNom = assignedActivite?.nom || 'Activité';
  const section = user.gerantActiviteType === 'franchise' ? 'franchise' : 'distinct';
  const ingredientsPath = section === 'franchise' ? '/client/catalogue-franchise' : '/client/catalogue-distinct';
  const actCtx = section;

  return (
    <>
      <CollapsibleHeader label={`Espace ${activiteNom}`} icon="📍" isOpen={openSections.has('gerant-activite')} locked={false} onToggle={() => toggleSection('gerant-activite')} />
      {openSections.has('gerant-activite') && (
        <>
          <li><NavLink to={`${ingredientsPath}?activiteId=${activiteId}`} className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}><span className="link-icon">🧂</span><span className="link-label">Ingrédients</span></NavLink></li>
          <li><Link to={`/client/stock?section=${section}&activiteId=${activiteId}`} className={`sidebar-link ${location.pathname === '/client/stock' && currentSection === section ? 'active' : ''}`} onClick={onClose}><span className="link-icon">📦</span><span className="link-label">Stock Activité</span></Link></li>
          <li><Link to={`/client/stock/historique?type=${section}&activiteId=${activiteId}`} className={`sidebar-link ${isHistoriquePage && currentHistType === section ? 'active' : ''}`} onClick={onClose}><span className="link-icon">📋</span><span className="link-label">Historique Appro</span></Link></li>
          <li><Link to={`/client/stock/historique-pertes?type=${section}&activiteId=${activiteId}`} className={`sidebar-link ${isHistoriquepertesPage && currentHistType === section ? 'active' : ''}`} onClick={onClose}><span className="link-icon">📉</span><span className="link-label">Historique Pertes</span></Link></li>
          <li><Link to={`/client/inventaire?section=${section}&activiteId=${activiteId}`} className={`sidebar-link ${location.pathname === '/client/inventaire' && new URLSearchParams(location.search).get('section') === section ? 'active' : ''}`} onClick={onClose}><span className="link-icon">🔢</span><span className="link-label">Inventaire</span></Link></li>
          <li><Link to={`/client/inventaire/historique?section=${section}&activiteId=${activiteId}`} className={`sidebar-link ${location.pathname === '/client/inventaire/historique' && new URLSearchParams(location.search).get('section') === section ? 'active' : ''}`} onClick={onClose}><span className="link-icon">📊</span><span className="link-label">Historique Inventaire</span></Link></li>
        </>
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

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { hasSelections } = useSelection();
  const [typesSummary, setTypesSummary] = useState<ActiviteTypesSummary | null>(null);
  const [labos, setLabos] = useState<Labo[]>([]);
  const [indepHasFournisseurs, setIndepHasFournisseurs] = useState(true);
  const [indepHasAppros, setIndepHasAppros] = useState(true);
  const isAdmin = user?.role === 'super_admin';
  const isGerant = user?.role === 'gerant';
  const [openSections, setOpenSections] = useState<Set<string>>(
    isAdmin ? new Set(['admin-ref']) : new Set()
  );
  const [gerantActivites, setGerantActivites] = useState<Activite[]>([]);

  const location = useLocation();
  const step = user?.onboardingStep ?? 0;
  const isEntreprise = user?.compteType === 'entreprise';
  const isOnboarding = isEntreprise && step > 0;
  const effectiveHasSelections = isEntreprise ? (step === 0) : hasSelections;

  const currentSearch = new URLSearchParams(location.search);
  const currentSection = currentSearch.get('section');
  const currentHistType = currentSearch.get('type');
  const currentProductTab = currentSearch.get('tab');
  const currentActCtx = currentSearch.get('actCtx');
  const isHistoriquePage = location.pathname === '/client/stock/historique';
  const isHistoriquepertesPage = location.pathname === '/client/stock/historique-pertes';
  const isProductsPage = location.pathname === '/client/products';
  const isProductActive = (tab: string, actCtx: string) =>
    isProductsPage && currentProductTab === tab && currentActCtx === actCtx;

  const hasFranchise = typesSummary === null ? true : typesSummary.hasFranchise;
  const hasDistinct = typesSummary === null ? true : typesSummary.hasDistinct;
  const hasFranchiseSelections = typesSummary === null ? true : typesSummary.hasFranchiseSelections;
  const hasDistinctSelections = typesSummary === null ? true : typesSummary.hasDistinctSelections;
  const hasFranchiseAppro = typesSummary === null ? true : typesSummary.hasFranchiseAppro;
  const hasDistinctAppro = typesSummary === null ? true : typesSummary.hasDistinctAppro;
  const hasFranchiseFournisseurs = typesSummary === null ? true : typesSummary.hasFranchiseFournisseurs;
  const hasDistinctFournisseurs = typesSummary === null ? true : typesSummary.hasDistinctFournisseurs;

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
    if (isEntreprise && (step === 0 || step === 3)) {
      api.get('/api/entreprise/activites/types-summary')
        .then(({ data }) => setTypesSummary(data))
        .catch(() => setTypesSummary(null));
      api.get('/api/labo')
        .then(({ data }) => setLabos(data))
        .catch(() => setLabos([]));
    }
    if (!isEntreprise && user?.role === 'client') {
      api.get('/api/stock/client/summary')
        .then(({ data }) => {
          setIndepHasFournisseurs(data.hasFournisseurs);
          setIndepHasAppros(data.hasAppros);
        })
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

  useEffect(() => {
    if (isEntreprise || user?.role !== 'client') return;
    const handler = () => {
      api.get('/api/stock/client/summary')
        .then(({ data }) => {
          setIndepHasFournisseurs(data.hasFournisseurs);
          setIndepHasAppros(data.hasAppros);
        })
        .catch(() => {});
    };
    window.addEventListener('fournisseur-created', handler);
    return () => window.removeEventListener('fournisseur-created', handler);
  }, [isEntreprise, user?.role]);

  const adminLinks = [
    { to: '/admin', label: t('nav.dashboard'), icon: '📊', end: true },
    { to: '/admin/clients', label: t('nav.clients'), icon: '👥' },
    { to: '/admin/units', label: t('nav.units'), icon: '📏' },
    { to: '/admin/categories', label: t('nav.categories'), icon: '🏷️' },
    { to: '/admin/domaines', label: t('nav.domaines'), icon: '🗂️' },
    { to: '/admin/ingredients', label: t('nav.ingredients'), icon: '🧂' },
  ];

  const sidebarTitle = isGerant
    ? (isEntreprise && user?.entrepriseName ? `Espace ${user.entrepriseName}` : 'Espace Gérant')
    : (isEntreprise && user?.entrepriseName ? `Espace ${user.entrepriseName}` : t('client.title'));

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
                  <SubNavLink to="/admin/tarifs" icon="⚙️" label="Tarifs" isActive={location.pathname === '/admin/tarifs'} onClick={onClose} />
                  <SubNavLink to="/admin/demandes" icon="📨" label="Demandes" isActive={location.pathname === '/admin/demandes'} onClick={onClose} />
                  <SubNavLink to="/admin/support" icon="💬" label="Support" isActive={location.pathname === '/admin/support'} onClick={onClose} />
                </>
              )}
            </>
          ) : isGerant ? (
            <GerantSidebarContent
              user={user!}
              isEntreprise={isEntreprise}
              labos={labos}
              gerantActivites={gerantActivites}
              location={location}
              openSections={openSections}
              toggleSection={toggleSection}
              onClose={onClose}
              isHistoriquePage={isHistoriquePage}
              isHistoriquepertesPage={isHistoriquepertesPage}
              isProductsPage={isProductsPage}
              currentSection={currentSection}
              currentHistType={currentHistType}
              currentProductTab={currentProductTab}
              currentActCtx={currentActCtx}
            />
          ) : (
            <>
              {/* Rapports */}
              <li>
                {isOnboarding ? (
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

              {/* Independent: Espace sections — same structure as entreprise "distinct" */}
              {!isEntreprise && (
                <>
                  {/* ══ ESPACE ACTIVITÉ ══ */}
                  <CollapsibleHeader label="Espace Activité" icon="📍" isOpen={openSections.has('indep-activite')} locked={!effectiveHasSelections} onToggle={() => toggleSection('indep-activite')} />
                  {openSections.has('indep-activite') && (
                    <>
                      {effectiveHasSelections ? (
                        <SubNavLink to="/client/ingredients" icon="🧂" label="Ingrédients Activité" isActive={location.pathname === '/client/ingredients'} onClick={onClose} />
                      ) : (
                        <LockedLink label="Ingrédients Activité" reason="Sélectionnez d'abord des ingrédients dans le Catalogue Global" />
                      )}
                      {effectiveHasSelections ? (
                        <SubNavLink to="/client/stock" icon="📦" label="Stock Activité" isActive={location.pathname === '/client/stock' && !currentSection} onClick={onClose} />
                      ) : (
                        <LockedLink label="Stock Activité" reason="Sélectionnez d'abord des ingrédients dans le Catalogue Global" />
                      )}
                      {effectiveHasSelections && indepHasAppros ? (
                        <SubNavLink
                          to="/client/stock/historique"
                          icon="📋"
                          label={t('nav.historique_appro')}
                          isActive={isHistoriquePage && !currentHistType}
                          onClick={onClose}
                        />
                      ) : (
                        <LockedLink label={t('nav.historique_appro')} reason={!effectiveHasSelections ? 'Sélectionnez d\'abord des ingrédients' : 'Aucun approvisionnement enregistré'} />
                      )}
                      {effectiveHasSelections ? (
                        <SubNavLink
                          to="/client/stock/historique-pertes"
                          icon="📉"
                          label="Historique Pertes"
                          isActive={isHistoriquepertesPage && !currentHistType}
                          onClick={onClose}
                        />
                      ) : (
                        <LockedLink label="Historique Pertes" reason="Sélectionnez d'abord des ingrédients" />
                      )}
                      {effectiveHasSelections ? (
                        <SubNavLink to="/client/inventaire" icon="🔢" label="Inventaire"
                          isActive={location.pathname === '/client/inventaire' && !currentSearch.get('section')} onClick={onClose} />
                      ) : (
                        <LockedLink label="Inventaire" reason="Sélectionnez d'abord des ingrédients" />
                      )}
                      {effectiveHasSelections ? (
                        <SubNavLink to="/client/inventaire/historique" icon="📊" label="Historique Inventaire"
                          isActive={location.pathname === '/client/inventaire/historique' && !currentSearch.get('section')} onClick={onClose} />
                      ) : (
                        <LockedLink label="Historique Inventaire" reason="Sélectionnez d'abord des ingrédients" />
                      )}
                    </>
                  )}

                  <Divider />

                  {/* ══ ESPACE PRODUITS ══ */}
                  <CollapsibleHeader
                    label="Espace Produits"
                    icon="🍔"
                    isOpen={openSections.has('indep-produits')}
                    locked={!effectiveHasSelections}
                    onToggle={() => toggleSection('indep-produits')}
                  />
                  {openSections.has('indep-produits') && (
                    <>
                      {effectiveHasSelections ? (
                        <>
                          <SubNavLink to="/client/products?tab=vendable" icon="🍔" label="Produits Vendables" isActive={isProductsPage && currentProductTab === 'vendable'} onClick={onClose} />
                          <SubNavLink to="/client/products?tab=utilisable" icon="🧪" label="Produits Utilisables" isActive={isProductsPage && currentProductTab === 'utilisable'} onClick={onClose} />
                        </>
                      ) : (
                        <>
                          <LockedLink label="Produits Vendables" />
                          <LockedLink label="Produits Utilisables" />
                        </>
                      )}
                    </>
                  )}

                  <Divider />

                  {/* ══ ESPACE FOURNISSEURS ══ */}
                  <CollapsibleHeader label="Espace Fournisseurs" icon="🚚" isOpen={openSections.has('indep-fournisseurs')} locked={!effectiveHasSelections} onToggle={() => toggleSection('indep-fournisseurs')} />
                  {openSections.has('indep-fournisseurs') && (
                    <>
                      {effectiveHasSelections ? (
                        <SubNavLink to="/client/fournisseurs" icon="🚚" label="Fournisseurs Activité" isActive={location.pathname === '/client/fournisseurs'} onClick={onClose} />
                      ) : (
                        <LockedLink label="Fournisseurs Activité" reason="Sélectionnez d'abord des ingrédients dans le Catalogue Global" />
                      )}
                    </>
                  )}

                  <Divider />

                  {/* ══ CATALOGUE GLOBAL ══ */}
                  <li>
                    <NavLink to="/client/catalogue-global" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                      <span className="link-icon">🌐</span>
                      <span className="link-label">Catalogue Global</span>
                    </NavLink>
                  </li>
                  <li>
                    <span style={{ display: 'block', padding: '2px 18px 8px', fontSize: '0.71rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                      Sélectionnez vos ingrédients pour débloquer les fonctionnalités
                    </span>
                  </li>
                </>
              )}

              {/* Entreprise layout */}
              {isEntreprise && (
                <>
                  <Divider />

                  {/* ══ ESPACE FRANCHISE ══ */}
                  <CollapsibleHeader label="Espace Franchise" icon="🔗" isOpen={openSections.has('franchise')} locked={isOnboarding || !hasFranchise} onToggle={() => toggleSection('franchise')} />
                  {openSections.has('franchise') && (
                    <>
                      <li>
                        {(isOnboarding && step < 3) || !hasFranchise || !hasFranchiseSelections ? (
                          <LockedLink label="Ingrédients Franchises" />
                        ) : (
                          <NavLink to="/client/catalogue-franchise" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                            <span className="link-icon">🧂</span>
                            <span className="link-label">Ingrédients Franchises</span>
                          </NavLink>
                        )}
                      </li>
                      <li>
                        {isOnboarding || !hasFranchise || !hasFranchiseSelections || !hasFranchiseFournisseurs ? (
                          <LockedLink label="Stocks Franchises" reason={(!hasFranchiseFournisseurs && hasFranchiseSelections) ? 'Ajoutez d\'abord un fournisseur à cette activité' : undefined} />
                        ) : (
                          <NavLink
                            to="/client/stock?section=franchise"
                            className={({ isActive }) => `sidebar-link ${isActive && currentSection === 'franchise' ? 'active' : ''}`}
                            onClick={onClose}
                          >
                            <span className="link-icon">📦</span>
                            <span className="link-label">Stocks Franchises</span>
                          </NavLink>
                        )}
                      </li>
                      <li>
                        {isOnboarding || !hasFranchise || !hasFranchiseAppro ? (
                          <LockedLink label="Historique Appro" />
                        ) : (
                          <Link
                            to="/client/stock/historique?type=franchise"
                            className={`sidebar-link ${isHistoriquePage && currentHistType === 'franchise' ? 'active' : ''}`}
                            onClick={onClose}
                          >
                            <span className="link-icon">📋</span>
                            <span className="link-label">Historique Appro</span>
                          </Link>
                        )}
                      </li>
                      <li>
                        {isOnboarding || !hasFranchise ? (
                          <LockedLink label="Historique Pertes" />
                        ) : (
                          <Link
                            to="/client/stock/historique-pertes?type=franchise"
                            className={`sidebar-link ${isHistoriquepertesPage && currentHistType === 'franchise' ? 'active' : ''}`}
                            onClick={onClose}
                          >
                            <span className="link-icon">📉</span>
                            <span className="link-label">Historique Pertes</span>
                          </Link>
                        )}
                      </li>
                      <li>
                        {isOnboarding || !hasFranchise || !hasFranchiseSelections ? (
                          <LockedLink label="Inventaire" />
                        ) : (
                          <Link to="/client/inventaire?section=franchise" className={`sidebar-link ${location.pathname === '/client/inventaire' && currentSearch.get('section') === 'franchise' ? 'active' : ''}`} onClick={onClose}>
                            <span className="link-icon">🔢</span><span className="link-label">Inventaire</span>
                          </Link>
                        )}
                      </li>
                      <li>
                        {isOnboarding || !hasFranchise || !hasFranchiseSelections ? (
                          <LockedLink label="Historique Inventaire" />
                        ) : (
                          <Link to="/client/inventaire/historique?section=franchise" className={`sidebar-link ${location.pathname === '/client/inventaire/historique' && currentSearch.get('section') === 'franchise' ? 'active' : ''}`} onClick={onClose}>
                            <span className="link-icon">📊</span><span className="link-label">Historique Inventaire</span>
                          </Link>
                        )}
                      </li>
                    </>
                  )}

                  <Divider />

                  {/* ══ ESPACE DISTINCT ══ */}
                  <CollapsibleHeader label="Espace Distinct" icon="📍" isOpen={openSections.has('distinct')} locked={isOnboarding || !hasDistinct} onToggle={() => toggleSection('distinct')} />
                  {openSections.has('distinct') && (
                    <>
                      <li>
                        {(isOnboarding && step < 3) || !hasDistinct || !hasDistinctSelections ? (
                          <LockedLink label="Ingrédients Distinct" />
                        ) : (
                          <NavLink to="/client/catalogue-distinct" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                            <span className="link-icon">🧂</span>
                            <span className="link-label">Ingrédients Distinct</span>
                          </NavLink>
                        )}
                      </li>
                      <li>
                        {isOnboarding || !hasDistinct || !hasDistinctSelections || !hasDistinctFournisseurs ? (
                          <LockedLink label="Stocks Distinct" reason={(!hasDistinctFournisseurs && hasDistinctSelections) ? 'Ajoutez d\'abord un fournisseur à cette activité' : undefined} />
                        ) : (
                          <NavLink
                            to="/client/stock?section=distinct"
                            className={({ isActive }) => `sidebar-link ${isActive && currentSection === 'distinct' ? 'active' : ''}`}
                            onClick={onClose}
                          >
                            <span className="link-icon">📦</span>
                            <span className="link-label">Stocks Distinct</span>
                          </NavLink>
                        )}
                      </li>
                      <li>
                        {isOnboarding || !hasDistinct || !hasDistinctAppro ? (
                          <LockedLink label="Historique Appro" />
                        ) : (
                          <Link
                            to="/client/stock/historique?type=distinct"
                            className={`sidebar-link ${isHistoriquePage && currentHistType === 'distinct' ? 'active' : ''}`}
                            onClick={onClose}
                          >
                            <span className="link-icon">📋</span>
                            <span className="link-label">Historique Appro</span>
                          </Link>
                        )}
                      </li>
                      <li>
                        {isOnboarding || !hasDistinct ? (
                          <LockedLink label="Historique Pertes" />
                        ) : (
                          <Link
                            to="/client/stock/historique-pertes?type=distinct"
                            className={`sidebar-link ${isHistoriquepertesPage && currentHistType === 'distinct' ? 'active' : ''}`}
                            onClick={onClose}
                          >
                            <span className="link-icon">📉</span>
                            <span className="link-label">Historique Pertes</span>
                          </Link>
                        )}
                      </li>
                      <li>
                        {isOnboarding || !hasDistinct || !hasDistinctSelections ? (
                          <LockedLink label="Inventaire" />
                        ) : (
                          <Link to="/client/inventaire?section=distinct" className={`sidebar-link ${location.pathname === '/client/inventaire' && currentSearch.get('section') === 'distinct' ? 'active' : ''}`} onClick={onClose}>
                            <span className="link-icon">🔢</span><span className="link-label">Inventaire</span>
                          </Link>
                        )}
                      </li>
                      <li>
                        {isOnboarding || !hasDistinct || !hasDistinctSelections ? (
                          <LockedLink label="Historique Inventaire" />
                        ) : (
                          <Link to="/client/inventaire/historique?section=distinct" className={`sidebar-link ${location.pathname === '/client/inventaire/historique' && currentSearch.get('section') === 'distinct' ? 'active' : ''}`} onClick={onClose}>
                            <span className="link-icon">📊</span><span className="link-label">Historique Inventaire</span>
                          </Link>
                        )}
                      </li>
                    </>
                  )}

                  {/* ══ ESPACE LABO(S) ══ — hidden if no labos */}
                  {!isOnboarding && labos.length > 0 && (
                    <>
                      <Divider />
                      {labos.map((labo) => {
                        const laboParam = `laboId=${labo.id}`;
                        const currentTab = new URLSearchParams(location.search).get('tab');
                        const isLaboIngredients = location.pathname === '/client/labo/stock' && location.search.includes(laboParam) && currentTab === 'ingredients';
                        const isLaboStock = location.pathname === '/client/labo/stock' && location.search.includes(laboParam) && currentTab !== 'ingredients';
                        const isLaboTransfer = location.pathname === '/client/labo/transfer' && location.search.includes(laboParam);
                        const isLaboHistorique = location.pathname === '/client/labo/historique-transferts' && location.search.includes(laboParam);
                        const isLaboHistoriqueAppro = location.pathname === '/client/labo/historique-appro' && location.search.includes(laboParam);
                        const isLaboInventaire = location.pathname === '/client/labo/inventaire' && location.search.includes(laboParam);
                        const stockLocked = (labo.fournisseurCount ?? 0) === 0;
                        return (
                          <React.Fragment key={labo.id}>
                            <CollapsibleHeader label={`Espace ${labo.nom}`} icon="🏭" isOpen={openSections.has(`labo-${labo.id}`)} locked={false} onToggle={() => toggleSection(`labo-${labo.id}`)} />
                            {openSections.has(`labo-${labo.id}`) && (
                              <>
                                <li>
                                  <Link
                                    to={`/client/labo/stock?laboId=${labo.id}&tab=ingredients`}
                                    className={`sidebar-link ${isLaboIngredients ? 'active' : ''}`}
                                    onClick={onClose}
                                  >
                                    <span className="link-icon">🧂</span>
                                    <span className="link-label">Ingrédients Stock</span>
                                  </Link>
                                </li>
                                <li>
                                  {stockLocked ? (
                                    <LockedLink label={`Stock ${labo.nom}`} reason="Assignez d'abord un fournisseur à ce labo" />
                                  ) : (
                                    <Link
                                      to={`/client/labo/stock?laboId=${labo.id}`}
                                      className={`sidebar-link ${isLaboStock ? 'active' : ''}`}
                                      onClick={onClose}
                                    >
                                      <span className="link-icon">📦</span>
                                      <span className="link-label">Stock {labo.nom}</span>
                                    </Link>
                                  )}
                                </li>
                                <li>
                                  {stockLocked ? (
                                    <LockedLink label={`Transferts ${labo.nom}`} reason="Assignez d'abord un fournisseur" />
                                  ) : (
                                    <Link
                                      to={`/client/labo/transfer?laboId=${labo.id}`}
                                      className={`sidebar-link ${isLaboTransfer ? 'active' : ''}`}
                                      onClick={onClose}
                                    >
                                      <span className="link-icon">↗</span>
                                      <span className="link-label">Transferts {labo.nom}</span>
                                    </Link>
                                  )}
                                </li>
                                <li>
                                  {stockLocked ? (
                                    <LockedLink label="Historique Appro" reason="Assignez d'abord un fournisseur" />
                                  ) : (
                                    <Link
                                      to={`/client/labo/historique-appro?laboId=${labo.id}`}
                                      className={`sidebar-link ${isLaboHistoriqueAppro ? 'active' : ''}`}
                                      onClick={onClose}
                                    >
                                      <span className="link-icon">📋</span>
                                      <span className="link-label">Historique Appro</span>
                                    </Link>
                                  )}
                                </li>
                                <li>
                                  {stockLocked ? (
                                    <LockedLink label="Historiques Transferts" reason="Assignez d'abord un fournisseur" />
                                  ) : (
                                    <Link
                                      to={`/client/labo/historique-transferts?laboId=${labo.id}`}
                                      className={`sidebar-link ${isLaboHistorique ? 'active' : ''}`}
                                      onClick={onClose}
                                    >
                                      <span className="link-icon">📋</span>
                                      <span className="link-label">Historiques Transferts</span>
                                    </Link>
                                  )}
                                </li>
                                <li>
                                  {stockLocked ? (
                                    <LockedLink label="Inventaire" reason="Assignez d'abord un fournisseur" />
                                  ) : (
                                    <Link to={`/client/labo/inventaire?laboId=${labo.id}`} className={`sidebar-link ${isLaboInventaire ? 'active' : ''}`} onClick={onClose}>
                                      <span className="link-icon">🔢</span><span className="link-label">Inventaire</span>
                                    </Link>
                                  )}
                                </li>
                                <li>
                                  {stockLocked ? (
                                    <LockedLink label="Historique Inventaire" reason="Assignez d'abord un fournisseur" />
                                  ) : (
                                    <Link to={`/client/labo/inventaire/historique?laboId=${labo.id}`} className={`sidebar-link ${location.pathname === '/client/labo/inventaire/historique' && location.search.includes(`laboId=${labo.id}`) ? 'active' : ''}`} onClick={onClose}>
                                      <span className="link-icon">📊</span><span className="link-label">Historique Inventaire</span>
                                    </Link>
                                  )}
                                </li>
                              </>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </>
                  )}

                  <Divider />

                  {/* ══ ESPACE PRODUITS ══ */}
                  <CollapsibleHeader label="Espace Produits" icon="🍔" isOpen={openSections.has('produits')} locked={isOnboarding || (!hasFranchiseSelections && !hasDistinctSelections)} onToggle={() => toggleSection('produits')} />
                  {openSections.has('produits') && (
                    <>
                      <li>
                        {isOnboarding || !hasFranchiseSelections ? (
                          <LockedLink label="Produits Vendables (F)" />
                        ) : (
                          <Link
                            to="/client/products?tab=vendable&actCtx=franchise"
                            className={`sidebar-link ${isProductActive('vendable', 'franchise') ? 'active' : ''}`}
                            onClick={onClose}
                          >
                            <span className="link-icon">🍔</span>
                            <span className="link-label">Produits Vendables (F)</span>
                          </Link>
                        )}
                      </li>
                      <li>
                        {isOnboarding || !hasFranchiseSelections ? (
                          <LockedLink label="Produits Utilisables (F)" />
                        ) : (
                          <Link
                            to="/client/products?tab=utilisable&actCtx=franchise"
                            className={`sidebar-link ${isProductActive('utilisable', 'franchise') ? 'active' : ''}`}
                            onClick={onClose}
                          >
                            <span className="link-icon">🧪</span>
                            <span className="link-label">Produits Utilisables (F)</span>
                          </Link>
                        )}
                      </li>
                      <li>
                        {isOnboarding || !hasDistinctSelections ? (
                          <LockedLink label="Produits Vendables (D)" />
                        ) : (
                          <Link
                            to="/client/products?tab=vendable&actCtx=distinct"
                            className={`sidebar-link ${isProductActive('vendable', 'distinct') ? 'active' : ''}`}
                            onClick={onClose}
                          >
                            <span className="link-icon">🍔</span>
                            <span className="link-label">Produits Vendables (D)</span>
                          </Link>
                        )}
                      </li>
                      <li>
                        {isOnboarding || !hasDistinctSelections ? (
                          <LockedLink label="Produits Utilisables (D)" />
                        ) : (
                          <Link
                            to="/client/products?tab=utilisable&actCtx=distinct"
                            className={`sidebar-link ${isProductActive('utilisable', 'distinct') ? 'active' : ''}`}
                            onClick={onClose}
                          >
                            <span className="link-icon">🧪</span>
                            <span className="link-label">Produits Utilisables (D)</span>
                          </Link>
                        )}
                      </li>
                    </>
                  )}

                  <Divider />

                  {/* ══ ESPACE FOURNISSEURS ══ */}
                  <CollapsibleHeader label="Espace Fournisseurs" icon="🚚" isOpen={openSections.has('fournisseurs')} locked={isOnboarding || (!hasFranchise && !hasDistinct)} onToggle={() => toggleSection('fournisseurs')} />
                  {openSections.has('fournisseurs') && !isOnboarding && (
                    <>
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
                      <li>
                        {labos.length === 0 ? (
                          <LockedLink label="Fournisseurs Labos" reason="Aucun labo configuré" />
                        ) : (
                          <NavLink to="/client/fournisseurs-labo" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                            <span className="link-icon">🏭</span>
                            <span className="link-label">Fournisseurs Labos</span>
                          </NavLink>
                        )}
                      </li>
                    </>
                  )}

                  <Divider />

                  {/* ══ CATALOGUE GLOBAL ══ */}
                  <li>
                    {isOnboarding && step < 3 ? (
                      <LockedLink label="Catalogue Global" />
                    ) : (
                      <NavLink to="/client/catalogue-global" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                        <span className="link-icon">🌐</span>
                        <span className="link-label">Catalogue Global</span>
                      </NavLink>
                    )}
                  </li>
                  <li>
                    <span style={{ display: 'block', padding: '2px 18px 8px', fontSize: '0.71rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                      Sélection des ingrédients pour les labos et les activités de type gestion séparée
                    </span>
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
                  <NavLink to="/client/gerants" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                    <span className="link-icon">👥</span>
                    <span className="link-label">Gérants</span>
                  </NavLink>
                </li>
              </>
            )}
            <li>
              <NavLink to="/client/support" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                <span className="link-icon">💬</span>
                <span className="link-label">Support</span>
              </NavLink>
            </li>
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
