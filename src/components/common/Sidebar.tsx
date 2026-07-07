import { useState, useEffect, useRef, useCallback } from 'react';
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/client';
import type { ActiviteTypesSummary, Labo, AbonnementConfig } from '../../types';

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

// En-tête d'« espace » dans la sidebar admin (libellé de section, non cliquable).
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <li style={{ fontSize: '0.64rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '2px 18px 6px', userSelect: 'none' }}>
      {children}
    </li>
  );
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


export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [typesSummary, setTypesSummary] = useState<ActiviteTypesSummary | null>(null);
  const [labos, setLabos] = useState<Labo[]>([]);
  const [aboConfig, setAboConfig] = useState<AbonnementConfig | null>(null);
  const isAdmin = user?.role === 'super_admin';
  const isGerant = user?.role === 'gerant';
  const [openSections, setOpenSections] = useState<Set<string>>(
    isAdmin ? new Set(['admin-ref']) : new Set()
  );
  const [moduleVenteActif, setModuleVenteActif] = useState(false);

  const location = useLocation();
  const step = user?.onboardingStep ?? 0;
  const isEntreprise = user?.role === 'client' || user?.role === 'gerant';
  const isOnboarding = isEntreprise && step > 0;

  const currentSearch = new URLSearchParams(location.search);
  const currentSection = currentSearch.get('section');
  const currentProductTab = currentSearch.get('tab');
  const isHistoriquePage = location.pathname === '/client/stock/historique';
  const isHistoriquepertesPage = location.pathname === '/client/stock/historique-pertes';
  const isProductsPage = location.pathname === '/client/products';
  const hasActivites = typesSummary === null ? true : typesSummary.hasActivites;

  // Déverrouillage 100% BASÉ SUR LES DONNÉES (indépendant des étapes d'onboarding) :
  // c'est l'existence réelle d'activités/labos/articles qui ouvre les liens.
  const noActivitesOrLabos = typesSummary !== null && !hasActivites && labos.length === 0;
  // Workspace is "ready" if articles exist OR ingredients have been assigned (selections / labo ingredients)
  const hasWorkspaceContent = typesSummary !== null && (
    (typesSummary.hasArticles ?? false)
    || (typesSummary.hasSelections ?? false)
    || (typesSummary.hasLaboIngredients ?? false)
  );
  // Level 0: aucune activité/labo → seul « Mes Activités » est accessible (Référentiel verrouillé)
  const lockLevel0 = noActivitesOrLabos;
  // Level 1: a des activités/labos mais rien d'assigné → Référentiel ouvert, espaces verrouillés
  const lockLevel1 = !noActivitesOrLabos && !hasWorkspaceContent && typesSummary !== null;
  // Déverrouillage PAR ESPACE (raffiné) : chaque espace s'ouvre dès qu'un article y est assigné.
  //  - Espace Activités : un article sélectionné pour une activité (hasSelections)
  //  - Espace Labo      : un article/ingrédient assigné au labo (hasLaboIngredients)
  //  - Espace Produits  : un article existe au référentiel (hasArticles)
  const summaryReady = typesSummary !== null;
  const lockEspaceActivites = lockLevel0 || (summaryReady && !(typesSummary?.hasSelections ?? false));
  const lockEspaceLabo      = lockLevel0 || (summaryReady && !(typesSummary?.hasLaboIngredients ?? false));
  const lockEspaceProduits  = lockLevel0 || (summaryReady && !(typesSummary?.hasArticles ?? false));

  const showGerants = !aboConfig || (aboConfig.nbGerants ?? 0) > 0;

  const toggleSection = (key: string) => setOpenSections((prev) => {
    const n = new Set(prev);
    n.has(key) ? n.delete(key) : n.add(key);
    return n;
  });

  const fetchSummary = useCallback(() => {
    api.get('/api/entreprise/activites/types-summary')
      .then(({ data }) => setTypesSummary(data))
      .catch(() => setTypesSummary(null));
  }, []);

  const fetchLabos = useCallback(() => {
    api.get('/api/labo').then(({ data }) => setLabos(data)).catch(() => setLabos([]));
  }, []);

  useEffect(() => {
    if (!isEntreprise) return;
    fetchLabos();
    api.get('/api/entreprise')
      .then(({ data }) => setModuleVenteActif(!!data?.module_vente_actif))
      .catch(() => {});
    if (!isGerant) {
      fetchSummary();
      api.get('/api/abonnements/mon-abonnement')
        .then(({ data }) => { if (data?.config) setAboConfig(data.config); })
        .catch(() => {});
    }
  }, [isEntreprise, isGerant, location.pathname, user?.role, fetchLabos, fetchSummary]);

  // Auto-redirect to Référentiel when first activité/labo is created (level 0 → level 1 transition)
  const prevNoActivitesOrLabos = useRef<boolean | null>(null);
  useEffect(() => {
    if (!isEntreprise || isOnboarding) return;
    if (prevNoActivitesOrLabos.current === true && !noActivitesOrLabos) {
      navigate('/client/referentiel/unites');
    }
    prevNoActivitesOrLabos.current = noActivitesOrLabos;
  }, [noActivitesOrLabos, isEntreprise, isOnboarding, navigate]);

  // Auto-ouverture de CHAQUE espace au moment précis où il se déverrouille (article assigné).
  const prevLocks = useRef<{ act: boolean | null; labo: boolean | null; prod: boolean | null }>({ act: null, labo: null, prod: null });
  useEffect(() => {
    if (!isEntreprise || isOnboarding) return;
    setOpenSections(prev => {
      const next = new Set(prev);
      let changed = false;
      if (prevLocks.current.act === true && lockEspaceActivites === false) { next.add('activites'); changed = true; }
      if (prevLocks.current.labo === true && lockEspaceLabo === false && labos.length > 0) { next.add('labo'); changed = true; }
      if (prevLocks.current.prod === true && lockEspaceProduits === false) { next.add('produits'); changed = true; }
      return changed ? next : prev;
    });
    prevLocks.current = { act: lockEspaceActivites, labo: lockEspaceLabo, prod: lockEspaceProduits };
  }, [lockEspaceActivites, lockEspaceLabo, lockEspaceProduits, isEntreprise, isOnboarding, labos.length]);

  useEffect(() => {
    if (!isEntreprise) return;
    const onLabosOrActivites = () => { fetchLabos(); fetchSummary(); };
    const onArticles = () => { fetchSummary(); };
    window.addEventListener('labos-changed', onLabosOrActivites);
    window.addEventListener('activites-changed', onLabosOrActivites);
    window.addEventListener('articles-changed', onArticles);
    return () => {
      window.removeEventListener('labos-changed', onLabosOrActivites);
      window.removeEventListener('activites-changed', onLabosOrActivites);
      window.removeEventListener('articles-changed', onArticles);
    };
  }, [isEntreprise, fetchLabos, fetchSummary]);


  // Narrateur data-based : reflète l'état réel (activités / articles), pas l'étape d'onboarding.
  const sidebarBanner = (isEntreprise && step === 1) ? (
    <div style={{ background: '#fef9c3', borderRadius: 8, padding: '10px 12px', margin: '8px 12px', fontSize: '0.78rem', color: '#854d0e', lineHeight: 1.5 }}>
      🔒 Changez votre mot de passe pour continuer.
    </div>
  ) : (isEntreprise && lockLevel0) ? (
    <div style={{ background: '#fef9c3', borderRadius: 8, padding: '10px 12px', margin: '8px 12px', fontSize: '0.78rem', color: '#854d0e', lineHeight: 1.5 }}>
      🏢 Créez vos activités ou votre labo pour débloquer le référentiel et le tableau de bord.
    </div>
  ) : (isEntreprise && lockLevel1) ? (
    <div style={{ background: '#f0fdf4', borderRadius: 8, padding: '10px 12px', margin: '8px 12px', fontSize: '0.78rem', color: '#166534', lineHeight: 1.5 }}>
      📚 Créez vos articles dans le référentiel et assignez-les pour débloquer les espaces.
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
              {/* ── Tableau de bord (accueil) ── */}
              <li>
                <NavLink to="/admin/dashboard" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                  <span className="link-icon">📊</span>
                  <span className="link-label">Tableau de bord</span>
                </NavLink>
              </li>

              <Divider />
              <SectionLabel>Espace Clients</SectionLabel>
              <li>
                <NavLink to="/admin/clients" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                  <span className="link-icon">👥</span>
                  <span className="link-label">{t('nav.clients')}</span>
                </NavLink>
              </li>
              <li>
                <NavLink to="/admin/abonnements" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                  <span className="link-icon">💳</span>
                  <span className="link-label">Abonnements</span>
                </NavLink>
              </li>
              <li>
                <NavLink to="/admin/support" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                  <span className="link-icon">💬</span>
                  <span className="link-label">Demandes</span>
                </NavLink>
              </li>
              <li>
                <NavLink to="/admin/rapports" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                  <span className="link-icon">📈</span>
                  <span className="link-label">Rapports</span>
                </NavLink>
              </li>

              <Divider />
              <SectionLabel>Espace Configuration</SectionLabel>
              <li>
                <NavLink to="/admin/domaines" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                  <span className="link-icon">🗂️</span>
                  <span className="link-label">Domaines d'activités</span>
                </NavLink>
              </li>
              <li>
                <NavLink to="/admin/prestataires" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                  <span className="link-icon">🚚</span>
                  <span className="link-label">Prestataires</span>
                </NavLink>
              </li>
              <li>
                <NavLink to="/admin/tarifs" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                  <span className="link-icon">⚙️</span>
                  <span className="link-label">Tarifs</span>
                </NavLink>
              </li>

              <Divider />
              <SectionLabel>Espace IA</SectionLabel>
              <li>
                <NavLink to="/admin/active-agents" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                  <span className="link-icon">🤖</span>
                  <span className="link-label">Agents IA</span>
                </NavLink>
              </li>
              <li>
                <NavLink to="/admin/knowledge-base" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                  <span className="link-icon">🧠</span>
                  <span className="link-label">Base IA</span>
                </NavLink>
              </li>

              <Divider />
              <SectionLabel>Contenu</SectionLabel>
              <li>
                <NavLink to="/admin/manuel" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                  <span className="link-icon">📖</span>
                  <span className="link-label">Manuel</span>
                </NavLink>
              </li>
            </>
          ) : (
            <>
              {/* Tableau de bord */}
              <li>
                {lockLevel0 ? (
                  <LockedLink label="Tableau de bord" />
                ) : (
                  <NavLink to="/client/dashboard" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                    <span className="link-icon">📊</span>
                    <span className="link-label">Tableau de bord</span>
                  </NavLink>
                )}
              </li>
              <Divider />

              {/* Mes Activités — gestion (CRUD) réservée au client propriétaire */}
              {isEntreprise && user?.role === 'client' && (
                <li>
                  {step === 1 ? (
                    <LockedLink label={t('nav.activites')} />
                  ) : (
                    <NavLink to="/client/activites" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                      <span className="link-icon">🏢</span>
                      <span className="link-label">{t('nav.activites')}</span>
                    </NavLink>
                  )}
                </li>
              )}

              {/* ══ RÉFÉRENTIEL ══ */}
              {isEntreprise && (
                <>
                  <Divider />
                  <CollapsibleHeader label="Référentiel" icon="📚" isOpen={openSections.has('referentiel')} locked={lockLevel0} onToggle={() => toggleSection('referentiel')} />
                  {openSections.has('referentiel') && (
                    <>
                      <SubNavLink to="/client/referentiel/unites" icon="📏" label="Unités" isActive={location.pathname === '/client/referentiel/unites'} onClick={onClose} />
                      <SubNavLink to="/client/referentiel/familles" icon="🗂️" label="Familles" isActive={location.pathname === '/client/referentiel/familles'} onClick={onClose} />
                      <SubNavLink to="/client/referentiel/categories" icon="🏷️" label="Catégories" isActive={location.pathname === '/client/referentiel/categories'} onClick={onClose} />
                      <SubNavLink to="/client/referentiel/articles" icon="🧂" label="Articles" isActive={location.pathname === '/client/referentiel/articles'} onClick={onClose} />
                      <SubNavLink to="/client/referentiel/import" icon="📥" label="Ajout Dynamique" isActive={location.pathname === '/client/referentiel/import'} onClick={onClose} />
                    </>
                  )}
                </>
              )}

              {/* Gérants — visible only if subscription allows; unlocks at level 1 (≥1 activité/labo) */}
              {isEntreprise && user?.role === 'client' && showGerants && (
                <>
                <Divider />
                <li>
                  {!lockLevel0 ? (
                    <NavLink to="/client/gerants" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                      <span className="link-icon">👥</span>
                      <span className="link-label">Gérants</span>
                    </NavLink>
                  ) : (
                    <LockedLink label="Gérants" reason="Créez une activité ou un labo pour débloquer" />
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
                  <CollapsibleHeader label="Espace Activités" icon="📍" isOpen={openSections.has('activites')} locked={lockEspaceActivites} onToggle={() => toggleSection('activites')} />
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
                        <Link to="/client/stock/factures?entType=activite" className={`sidebar-link ${location.pathname === '/client/stock/factures' ? 'active' : ''}`} onClick={onClose}>
                          <span className="link-icon">🧾</span><span className="link-label">Factures</span>
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
                  {labos.length > 0 && (() => {
                    const firstLaboId = labos[0].id;
                    return (
                      <>
                        <Divider />
                        <CollapsibleHeader label="Espace Labo" icon="🏭" isOpen={openSections.has('labo')} locked={lockEspaceLabo} onToggle={() => toggleSection('labo')} />
                        {openSections.has('labo') && (
                          <>
                            <li><Link to={`/client/labo/stock?laboId=${firstLaboId}`} className={`sidebar-link ${location.pathname === '/client/labo/stock' ? 'active' : ''}`} onClick={onClose}><span className="link-icon">📦</span><span className="link-label">Stock Labo</span></Link></li>
                            <li><Link to={`/client/labo/historique-appro?laboId=${firstLaboId}`} className={`sidebar-link ${location.pathname === '/client/labo/historique-appro' ? 'active' : ''}`} onClick={onClose}><span className="link-icon">📋</span><span className="link-label">Historique Appro</span></Link></li>
                            <li><Link to={`/client/labo/factures?laboId=${firstLaboId}`} className={`sidebar-link ${location.pathname === '/client/labo/factures' ? 'active' : ''}`} onClick={onClose}><span className="link-icon">🧾</span><span className="link-label">Factures</span></Link></li>
                            <li><Link to={`/client/labo/historique-pertes?laboId=${firstLaboId}`} className={`sidebar-link ${location.pathname === '/client/labo/historique-pertes' ? 'active' : ''}`} onClick={onClose}><span className="link-icon">📉</span><span className="link-label">Historique Pertes</span></Link></li>
                            <li><Link to={`/client/labo/transfer?laboId=${firstLaboId}`} className={`sidebar-link ${location.pathname === '/client/labo/transfer' ? 'active' : ''}`} onClick={onClose}><span className="link-icon">↗</span><span className="link-label">Transferts</span></Link></li>
                            <li><Link to={`/client/labo/historique-transferts?laboId=${firstLaboId}`} className={`sidebar-link ${location.pathname === '/client/labo/historique-transferts' ? 'active' : ''}`} onClick={onClose}><span className="link-icon">📋</span><span className="link-label">Historique Transferts</span></Link></li>
                            <li><Link to={`/client/labo/inventaire?laboId=${firstLaboId}`} className={`sidebar-link ${location.pathname === '/client/labo/inventaire' ? 'active' : ''}`} onClick={onClose}><span className="link-icon">🔢</span><span className="link-label">Inventaire</span></Link></li>
                            <li><Link to={`/client/labo/inventaire/historique?laboId=${firstLaboId}`} className={`sidebar-link ${location.pathname === '/client/labo/inventaire/historique' ? 'active' : ''}`} onClick={onClose}><span className="link-icon">📊</span><span className="link-label">Historique Inventaire</span></Link></li>
                          </>
                        )}
                      </>
                    );
                  })()}

                  {/* ══ ESPACE VENTE ══ */}
                  {!lockEspaceProduits && moduleVenteActif && (
                    <>
                      <Divider />
                      <CollapsibleHeader label="Espace Vente" icon="🛒" isOpen={openSections.has('vente')} locked={false} onToggle={() => toggleSection('vente')} />
                      {openSections.has('vente') && (
                        <>
                          <li><NavLink to="/client/ventes/prestataires" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}><span className="link-icon">🛵</span><span className="link-label">Config Prestataires</span></NavLink></li>
                          {user?.role === 'client' && <li><NavLink to="/client/ventes/charges" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}><span className="link-icon">🏗️</span><span className="link-label">Config Charges</span></NavLink></li>}
                          <li><NavLink to="/client/ventes/configuration" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}><span className="link-icon">💲</span><span className="link-label">Configuration Vente</span></NavLink></li>
                          <li><NavLink to="/client/ventes" end className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}><span className="link-icon">💰</span><span className="link-label">Ventes Activités</span></NavLink></li>
                          {labos.length > 0 && (
                            <li><Link to={`/client/labo/ventes?laboId=${labos[0].id}`} className={`sidebar-link ${location.pathname === '/client/labo/ventes' ? 'active' : ''}`} onClick={onClose}><span className="link-icon">🏭</span><span className="link-label">Ventes Labo</span></Link></li>
                          )}
                        </>
                      )}
                    </>
                  )}

                  <Divider />

                  {/* ══ ESPACE PRODUITS ══ — unlocks at level 2 */}
                  <CollapsibleHeader label="Espace Produits" icon="🍔" isOpen={openSections.has('produits')} locked={lockEspaceProduits} onToggle={() => toggleSection('produits')} />
                  {openSections.has('produits') && (
                    <>
                      <li>
                        <Link to="/client/products/categories" className={`sidebar-link ${location.pathname === '/client/products/categories' ? 'active' : ''}`} onClick={onClose}>
                          <span className="link-icon">🏷️</span><span className="link-label">Catégories Produits</span>
                        </Link>
                      </li>
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
                      <li>
                        <Link to="/client/products/valorises" className={`sidebar-link ${location.pathname === '/client/products/valorises' ? 'active' : ''}`} onClick={onClose}>
                          <span className="link-icon">💎</span><span className="link-label">Produits Valorisés</span>
                        </Link>
                      </li>
                    </>
                  )}

                  <Divider />

                  {/* ══ FOURNISSEURS ══ — déverrouillé au niveau 1 (≥1 activité/labo) */}
                  <li>
                    {(lockLevel0)
                      ? <LockedLink label="Fournisseurs" reason="Créez une activité ou un labo pour débloquer" />
                      : <NavLink to="/client/fournisseurs" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}><span className="link-icon">🚚</span><span className="link-label">Fournisseurs</span></NavLink>
                    }
                  </li>

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
                {/* Lien Assistant IA masqué temporairement (à finaliser) — la page
                    /client/ai-assistant reste accessible par URL. */}
                <li>
                  <NavLink to="/client/guide" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                    <span className="link-icon">📖</span>
                    <span className="link-label">Manuel d'utilisation</span>
                  </NavLink>
                </li>
              </>
            )}
            {user?.role === 'gerant' && (
              <>
              <li>
                <NavLink to="/client/gerant-abonnement" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                  <span className="link-icon">💳</span>
                  <span className="link-label">Mon abonnement</span>
                </NavLink>
              </li>
              {/* Lien Assistant IA masqué temporairement (à finaliser) — la page
                  /client/ai-assistant reste accessible par URL. */}
              <li>
                <NavLink to="/client/guide" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} onClick={onClose}>
                  <span className="link-icon">📖</span>
                  <span className="link-label">Manuel d'utilisation</span>
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
