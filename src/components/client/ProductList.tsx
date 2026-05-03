import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Product, Activite } from '../../types';
import FicheTechniqueTab from './FicheTechniqueTab';
import FicheTechniqueModal from './FicheTechniqueModal';

interface ProductDetail {
  ingredients: { ingredientName: string; portion: number; unitName: string; unitPrice: number }[];
  subProducts: { subProductName: string; portion: number; unitCost: number; totalLineCost: number }[];
}

type PopupType = 'ingredients' | 'subProducts' | null;
type TabType = 'vendable' | 'utilisable' | 'fiche-technique';

const PAGE_SIZE = 10;

export default function ProductList() {
  const { t } = useTranslation();
  const { user, canWrite } = useAuth();
  const isEntreprise = user?.compteType === 'entreprise';

  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get('tab') as TabType) || 'vendable';
  const actCtx = searchParams.get('actCtx') || '';

  const isFranchiseCtx = actCtx === 'franchise';
  const isDistinctCtx = actCtx === 'distinct' || actCtx.startsWith('distinct-');

  // Filters stored in URL params so they survive navigation (add → cancel → back)
  const filterFranchiseGroup = searchParams.get('fg') || '';
  const filterFranchiseActId = searchParams.get('fact') || '';

  const setFilterFranchiseGroup = (val: string) =>
    setSearchParams((prev) => { const next = new URLSearchParams(prev); val ? next.set('fg', val) : next.delete('fg'); next.delete('fact'); return next; }, { replace: true });

  const setFilterFranchiseActId = (val: string) =>
    setSearchParams((prev) => { const next = new URLSearchParams(prev); val ? next.set('fact', val) : next.delete('fact'); return next; }, { replace: true });

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [openProductGroups, setOpenProductGroups] = useState<Set<string>>(new Set());

  const [ftPopup, setFtPopup] = useState<{ productId: number; productName: string; hasIngredients: boolean; resolvedActId: number; contextLabel: string; activityName: string; activities: Activite[]; franchiseGroup: string } | null>(null);
  const [franchiseActsPopup, setFranchiseActsPopup] = useState<{ productName: string; group: string; activities: Activite[] } | null>(null);

  const [popup, setPopup] = useState<{ type: PopupType; productId: number; productName: string } | null>(null);
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [franchiseActivities, setFranchiseActivities] = useState<Activite[]>([]);
  const [distinctActivities, setDistinctActivities] = useState<Activite[]>([]);
  const [activitesLoading, setActivitesLoading] = useState(false);

  // Load all activities for enterprise users
  useEffect(() => {
    if (!isEntreprise) return;
    setActivitesLoading(true);
    api.get('/api/entreprise/activites')
      .then(({ data }) => {
        const all = data as Activite[];
        setFranchiseActivities(all.filter((a) => a.type === 'franchise'));
        setDistinctActivities(all.filter((a) => a.type === 'distincte' || a.type == null));
      })
      .finally(() => setActivitesLoading(false));
  }, [isEntreprise]);

  // Load products
  useEffect(() => {
    setLoading(true);
    setPage(1);
    const params = new URLSearchParams();
    if (isFranchiseCtx) {
      params.set('activiteType', 'franchise');
      if (filterFranchiseGroup) params.set('franchiseGroup', filterFranchiseGroup);
    } else if (isDistinctCtx) {
      params.set('activiteType', 'distincte');
    }
    const qs = params.toString();
    api.get(`/products${qs ? `?${qs}` : ''}`)
      .then(({ data }) => setProducts(data as Product[]))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEntreprise, isFranchiseCtx, isDistinctCtx, filterFranchiseGroup, filterFranchiseActId]);

  // Open all accordion groups when products load
  useEffect(() => {
    if (!products.length) { setOpenProductGroups(new Set()); return; }
    const groups = new Set<string>();
    if (isFranchiseCtx) {
      products.forEach((p) => {
        const act = franchiseActivities.find((a) => a.id === p.activiteId);
        const g = act?.franchiseGroup || act?.nom || p.franchiseGroup || '—';
        groups.add(g);
      });
    } else if (isDistinctCtx) {
      products.forEach((p) => groups.add(String(p.activiteId || 0)));
    }
    setOpenProductGroups(groups);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  const openPopup = async (type: PopupType, product: Product) => {
    setPopup({ type, productId: product.id, productName: product.name });
    setDetail(null);
    setLoadingDetail(true);
    try {
      const { data } = await api.get(`/products/${product.id}`);
      setDetail(data);
    } finally {
      setLoadingDetail(false);
    }
  };

  const closePopup = () => { setPopup(null); setDetail(null); };

  const handleDelete = async (id: number) => {
    if (!window.confirm(t('client.products.delete_confirm'))) return;
    await api.delete(`/products/${id}`);
    setProducts((p) => p.filter((x) => x.id !== id));
  };

  // Build actCtx query string for links
  const linkActCtx = isFranchiseCtx ? 'franchise' : isDistinctCtx ? 'distinct' : '';
  const actCtxQs = linkActCtx ? `&actCtx=${encodeURIComponent(linkActCtx)}` : '';

  // Franchise groups derived from franchise activities
  const franchiseGroups = Array.from(
    new Set(franchiseActivities.map((a) => a.franchiseGroup || a.nom))
  ).sort();

  const byTab = products.filter((p) => p.type === tab);
  const byActivity = (isFranchiseCtx && filterFranchiseActId)
    ? byTab.filter((p) => p.activiteId === parseInt(filterFranchiseActId) || p.activiteId === null)
    : byTab;
  const searched = byActivity.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(searched.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = searched.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const isVendable = tab === 'vendable';
  const emptyKey = isVendable ? 'client.products.no_vendable_products' : 'client.products.no_utilisable_products_tab';
  const addKey = isVendable ? 'client.products.add_vendable' : 'client.products.add_utilisable';

  const filterQs = [
    actCtxQs ? actCtxQs.slice(1) : '',
    filterFranchiseGroup ? `fg=${encodeURIComponent(filterFranchiseGroup)}` : '',
    filterFranchiseActId ? `fact=${encodeURIComponent(filterFranchiseActId)}` : '',
  ].filter(Boolean).join('&');
  const addPath = isVendable
    ? `/client/products/new?type=vendable${filterQs ? `&${filterQs}` : ''}`
    : `/client/products/new?type=utilisable${filterQs ? `&${filterQs}` : ''}`;

  const getProductResolvedActId = (p: Product): number => {
    if (!isEntreprise) return 0;
    return p.activiteId || 0;
  };

  const getProductFtContext = (p: Product): { contextLabel: string; activityName: string } => {
    if (!isEntreprise) return { contextLabel: '', activityName: '' };
    if (isFranchiseCtx) {
      const act = franchiseActivities.find((a) => a.id === p.activiteId);
      const group = act ? (act.franchiseGroup || act.nom) : (p.franchiseGroup || null);
      const parts: string[] = [];
      if (group) parts.push(`Franchise : ${group}`);
      if (act && act.nom !== group) parts.push(`Activité : ${act.nom}`);
      return { contextLabel: parts.join(' / '), activityName: act?.nom || group || '' };
    }
    if (isDistinctCtx) {
      const act = distinctActivities.find((a) => a.id === p.activiteId);
      return act ? { contextLabel: `Activité : ${act.nom}`, activityName: act.nom } : { contextLabel: '', activityName: '' };
    }
    return { contextLabel: '', activityName: '' };
  };

  const getProductFtActivities = (p: Product): Activite[] => {
    if (!isEntreprise || !isFranchiseCtx) return [];
    if (p.activiteId) return [];
    const group = p.franchiseGroup || filterFranchiseGroup || null;
    if (!group) return [];
    return franchiseActivities.filter((a) => (a.franchiseGroup || a.nom) === group);
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 3,
  };

  const ctxBadge = isFranchiseCtx
    ? { label: 'Franchise', bg: '#dbeafe', color: '#1d4ed8', border: '#bfdbfe' }
    : isDistinctCtx
    ? { label: 'Distinct', bg: '#fef3c7', color: '#92400e', border: '#fde68a' }
    : null;

  const toggleGroup = (key: string) => setOpenProductGroups((prev) => {
    const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n;
  });

  // Reusable action buttons for a product row
  const renderActions = (p: Product) => (
    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', alignItems: 'center' }}>
      <button
        className="btn btn-ghost btn-sm"
        style={{ width: 32, height: 32, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7 }}
        title="Générer la Fiche Technique"
        onClick={() => {
          const ctx = getProductFtContext(p);
          const act = franchiseActivities.find((a) => a.id === p.activiteId);
          const fg = isFranchiseCtx
            ? (act?.franchiseGroup || act?.nom || p.franchiseGroup || filterFranchiseGroup || '')
            : '';
          setFtPopup({ productId: p.id, productName: p.name, hasIngredients: !!(p.ingredientsCount && p.ingredientsCount > 0), resolvedActId: getProductResolvedActId(p), activities: getProductFtActivities(p), franchiseGroup: fg, ...ctx });
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="24" height="24" rx="3" fill="#217346"/>
          <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" fill="#185C37"/>
          <path d="M14 2V8H20L14 2Z" fill="#107C41"/>
          <text x="7" y="18" fill="white" fontSize="9" fontWeight="bold" fontFamily="Calibri,Arial,sans-serif">XLS</text>
        </svg>
      </button>
      <Link
        to={`/client/products/${p.id}/edit${filterQs ? `?${filterQs}` : ''}`}
        className="btn btn-ghost btn-sm"
        title={t('common.edit')}
        style={{ width: 32, height: 32, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7 }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </Link>
      <button
        className="btn btn-danger btn-sm"
        onClick={() => handleDelete(p.id)}
        title={t('common.delete')}
        style={{ width: 32, height: 32, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7 }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          <path d="M10 11v6M14 11v6"/>
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
        </svg>
      </button>
    </div>
  );

  // Accordion table for franchise: Nom | Activité | 🧂 | 📦 | Actions
  const renderFranchiseAccordion = (groupProducts: Product[], group: string, groupKey: string) => {
    const isOpen = openProductGroups.has(groupKey);
    const acts = franchiseActivities.filter((a) => (a.franchiseGroup || a.nom) === group);
    return (
      <div key={groupKey} style={{ marginBottom: 10 }}>
        <button onClick={() => toggleGroup(groupKey)}
          style={{ background: 'linear-gradient(135deg, #eff6ff, #dbeafe)', border: '1px solid #bfdbfe', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', width: '100%', textAlign: 'left', borderRadius: isOpen ? '12px 12px 0 0' : 12 }}>
          <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#1d4ed8', letterSpacing: '0.04em' }}>🏢 {group}</span>
          <span style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: 400 }}>({groupProducts.length} produit{groupProducts.length > 1 ? 's' : ''})</span>
          <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#6b7280' }}>{isOpen ? '▼' : '▶'}</span>
        </button>
        {isOpen && (
          <div className="table-responsive card th-blue" style={{ borderRadius: '0 0 12px 12px', overflow: 'hidden', marginTop: 0, border: '1px solid #bfdbfe', borderTop: 'none' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>{t('common.name')}</th>
                  <th>Activité</th>
                  <th style={{ textAlign: 'center' }}>🧂 {t('nav.ingredients')}</th>
                  {isVendable && <th style={{ textAlign: 'center' }}>📦 P.Utilisables</th>}
                  <th style={{ textAlign: 'right' }}>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {groupProducts.map((p) => {
                  const act = franchiseActivities.find((a) => a.id === p.activiteId);
                  const groupActs = !act ? acts : [];
                  return (
                    <tr key={p.id}>
                      <td><span style={{ fontWeight: 600 }}>{p.name}</span></td>
                      <td>
                        {act ? (
                          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', background: 'var(--surface)', padding: '2px 8px', borderRadius: 12, border: '1px solid var(--border)' }}>
                            {act.nom}
                          </span>
                        ) : (
                          <button className="count-badge"
                            onClick={() => setFranchiseActsPopup({ productName: p.name, group, activities: groupActs })}
                            style={{ cursor: 'pointer', fontSize: '0.78rem' }}
                            title="Voir les activités">
                            {groupActs.length} activité{groupActs.length > 1 ? 's' : ''}
                          </button>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button className="count-badge" onClick={() => openPopup('ingredients', p)}
                          title={p.ingredientsCount ? 'Voir les ingrédients' : 'Aucun ingrédient'}
                          disabled={!p.ingredientsCount}
                          style={{ opacity: p.ingredientsCount ? 1 : 0.4, cursor: p.ingredientsCount ? 'pointer' : 'default' }}>
                          {p.ingredientsCount ?? 0}
                        </button>
                      </td>
                      {isVendable && (
                        <td style={{ textAlign: 'center' }}>
                          <button className="count-badge" onClick={() => openPopup('subProducts', p)}
                            title={p.subProductsCount ? 'Voir les produits utilisables' : 'Aucun sous-produit'}
                            disabled={!p.subProductsCount}
                            style={{ opacity: p.subProductsCount ? 1 : 0.4, cursor: p.subProductsCount ? 'pointer' : 'default' }}>
                            {p.subProductsCount ?? 0}
                          </button>
                        </td>
                      )}
                      <td style={{ textAlign: 'right' }}>{renderActions(p)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  // Accordion table for distinct: Nom | 🧂 | 📦 | Actions (no activity col — it's the accordion header)
  const renderDistinctAccordion = (groupProducts: Product[], act: Activite | null, groupKey: string) => {
    const isOpen = openProductGroups.has(groupKey);
    const label = act ? act.nom : 'Sans activité';
    return (
      <div key={groupKey} style={{ marginBottom: 10 }}>
        <button onClick={() => toggleGroup(groupKey)}
          style={{ background: 'linear-gradient(135deg, #fffbeb, #fef3c7)', border: '1px solid #fde68a', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', width: '100%', textAlign: 'left', borderRadius: isOpen ? '12px 12px 0 0' : 12 }}>
          <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#92400e', letterSpacing: '0.04em' }}>🏪 {label}</span>
          {act?.adresse && <span style={{ fontSize: '0.72rem', color: '#78350f' }}>📍 {act.adresse}</span>}
          <span style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: 400 }}>({groupProducts.length} produit{groupProducts.length > 1 ? 's' : ''})</span>
          <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#6b7280' }}>{isOpen ? '▼' : '▶'}</span>
        </button>
        {isOpen && (
          <div className="table-responsive card th-blue" style={{ borderRadius: '0 0 12px 12px', overflow: 'hidden', marginTop: 0, border: '1px solid #fde68a', borderTop: 'none' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>{t('common.name')}</th>
                  <th style={{ textAlign: 'center' }}>🧂 {t('nav.ingredients')}</th>
                  {isVendable && <th style={{ textAlign: 'center' }}>📦 P.Utilisables</th>}
                  <th style={{ textAlign: 'right' }}>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {groupProducts.map((p) => (
                  <tr key={p.id}>
                    <td><span style={{ fontWeight: 600 }}>{p.name}</span></td>
                    <td style={{ textAlign: 'center' }}>
                      <button className="count-badge" onClick={() => openPopup('ingredients', p)}
                        title={p.ingredientsCount ? 'Voir les ingrédients' : 'Aucun ingrédient'}
                        disabled={!p.ingredientsCount}
                        style={{ opacity: p.ingredientsCount ? 1 : 0.4, cursor: p.ingredientsCount ? 'pointer' : 'default' }}>
                        {p.ingredientsCount ?? 0}
                      </button>
                    </td>
                    {isVendable && (
                      <td style={{ textAlign: 'center' }}>
                        <button className="count-badge" onClick={() => openPopup('subProducts', p)}
                          title={p.subProductsCount ? 'Voir les produits utilisables' : 'Aucun sous-produit'}
                          disabled={!p.subProductsCount}
                          style={{ opacity: p.subProductsCount ? 1 : 0.4, cursor: p.subProductsCount ? 'pointer' : 'default' }}>
                          {p.subProductsCount ?? 0}
                        </button>
                      </td>
                    )}
                    <td style={{ textAlign: 'right' }}>{renderActions(p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0 }}>
            {tab === 'fiche-technique'
              ? t('client.products.tab_fiche_technique')
              : tab === 'utilisable'
                ? t('client.products.tab_utilisable')
                : t('client.products.tab_vendable')}
          </h1>
          {ctxBadge && tab !== 'fiche-technique' && (
            <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '4px 12px', borderRadius: 20, background: ctxBadge.bg, color: ctxBadge.color, border: `1px solid ${ctxBadge.border}`, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              {ctxBadge.label}
            </span>
          )}
          {tab !== 'fiche-technique' && byTab.length > 0 && (
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              {byTab.length} produit{byTab.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        {tab !== 'fiche-technique' && (!isEntreprise || isFranchiseCtx || isDistinctCtx) && (
          canWrite
            ? <Link to={addPath} className="btn btn-primary" style={{ whiteSpace: 'nowrap' }}>+ {t(addKey)}</Link>
            : <button className="btn btn-primary" disabled style={{ whiteSpace: 'nowrap', opacity: 0.45, cursor: 'not-allowed' }}>+ {t(addKey)}</button>
        )}
      </div>

      {tab === 'fiche-technique' ? (
        <FicheTechniqueTab
          isEntreprise={isEntreprise}
          franchiseActivities={franchiseActivities}
          distinctActivities={distinctActivities}
        />
      ) : (
        <>
          {/* Franchise filters */}
          {isEntreprise && isFranchiseCtx && tab !== 'fiche-technique' && byTab.length > 0 && (
            <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap', alignItems: 'flex-end', background: 'var(--surface)', padding: '14px 16px', borderRadius: 12, border: '1px solid var(--border)' }}>
              {activitesLoading ? (
                <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{t('common.loading')}</span>
              ) : (
                <>
                  {franchiseGroups.length > 1 && (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={labelStyle}>Franchise</span>
                      <select className="input" style={{ maxWidth: 220 }} value={filterFranchiseGroup}
                        onChange={(e) => { setFilterFranchiseGroup(e.target.value); setPage(1); }}>
                        <option value="">Toutes les franchises</option>
                        {franchiseGroups.map((g) => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>
                  )}
                  {franchiseActivities.length > 1 && (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={labelStyle}>Activité</span>
                      <select className="input" style={{ maxWidth: 220 }} value={filterFranchiseActId}
                        onChange={(e) => { setFilterFranchiseActId(e.target.value); setPage(1); }}>
                        <option value="">Toutes les activités</option>
                        {franchiseActivities
                          .filter((a) => !filterFranchiseGroup || (a.franchiseGroup || a.nom) === filterFranchiseGroup)
                          .map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
                      </select>
                    </div>
                  )}
                </>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                <span style={labelStyle}>🔍 {t('common.search')}</span>
                <input type="text" placeholder={t('common.search') + '...'} value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="input" style={{ maxWidth: 300 }} />
              </div>
            </div>
          )}

          {/* Distinct filters */}
          {isEntreprise && isDistinctCtx && tab !== 'fiche-technique' && byTab.length > 0 && (
            <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap', alignItems: 'flex-end', background: 'var(--surface)', padding: '14px 16px', borderRadius: 12, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                <span style={labelStyle}>🔍 {t('common.search')}</span>
                <input type="text" placeholder={t('common.search') + '...'} value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="input" style={{ maxWidth: 300 }} />
              </div>
            </div>
          )}

          {/* Search bar for non-enterprise */}
          {!isEntreprise && byTab.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <input type="text" placeholder={'🔍 ' + t('common.search') + '...'}
                value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="input" style={{ maxWidth: 320 }} />
            </div>
          )}

          {loading ? (
            <div className="loading-text">{t('common.loading')}</div>
          ) : searched.length === 0 ? (
            byTab.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 24px', textAlign: 'center' }}>
                <div style={{ width: 72, height: 72, borderRadius: 20, background: 'linear-gradient(135deg, var(--primary) 0%, #7c3aed 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', marginBottom: 20, boxShadow: '0 8px 24px rgba(37,99,235,0.18)' }}>
                  {isVendable ? '🍔' : '🧪'}
                </div>
                <h2 style={{ margin: '0 0 8px', fontSize: '1.15rem', fontWeight: 700, color: 'var(--text)' }}>
                  {isVendable ? 'Aucun produit vendable' : 'Aucun produit utilisable'}
                </h2>
                <p style={{ margin: '0 0 4px', fontSize: '0.88rem', color: 'var(--text-muted)', maxWidth: 340 }}>
                  {ctxBadge ? `Contexte : ${ctxBadge.label}` : 'Commencez par créer votre premier produit.'}
                </p>
              </div>
            ) : (
              <div className="empty-state">
                <span className="empty-icon">{isVendable ? '🍔' : '🧪'}</span>
                <p>{t('common.no_result')}</p>
              </div>
            )
          ) : (
            <>
              {/* ── Franchise accordion ── */}
              {isEntreprise && isFranchiseCtx && (() => {
                const grouped: Record<string, Product[]> = {};
                for (const p of searched) {
                  const act = franchiseActivities.find((a) => a.id === p.activiteId);
                  const g = act?.franchiseGroup || act?.nom || p.franchiseGroup || filterFranchiseGroup || '—';
                  if (!grouped[g]) grouped[g] = [];
                  grouped[g].push(p);
                }
                return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([g, gProds]) =>
                  renderFranchiseAccordion(gProds, g, g)
                );
              })()}

              {/* ── Distinct accordion ── */}
              {isEntreprise && isDistinctCtx && (() => {
                const grouped: Record<string, Product[]> = {};
                for (const p of searched) {
                  const key = String(p.activiteId || 0);
                  if (!grouped[key]) grouped[key] = [];
                  grouped[key].push(p);
                }
                return Object.entries(grouped).map(([key, gProds]) => {
                  const act = distinctActivities.find((a) => a.id === parseInt(key)) || null;
                  return renderDistinctAccordion(gProds, act, key);
                });
              })()}

              {/* ── Flat table (non-enterprise or no context) ── */}
              {!isEntreprise && (
                <>
                  <div className="table-responsive card th-blue" style={{ borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th>{t('common.name')}</th>
                          <th style={{ textAlign: 'center' }}>🧂 {t('nav.ingredients')}</th>
                          {isVendable && <th style={{ textAlign: 'center' }}>📦 P.Utilisables</th>}
                          <th style={{ textAlign: 'right' }}>{t('common.actions')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginated.map((p) => (
                          <tr key={p.id}>
                            <td><span style={{ fontWeight: 600 }}>{p.name}</span></td>
                            <td style={{ textAlign: 'center' }}>
                              <button className="count-badge" onClick={() => openPopup('ingredients', p)}
                                title={p.ingredientsCount ? 'Voir les ingrédients' : 'Aucun ingrédient'}
                                disabled={!p.ingredientsCount}
                                style={{ opacity: p.ingredientsCount ? 1 : 0.4, cursor: p.ingredientsCount ? 'pointer' : 'default' }}>
                                {p.ingredientsCount ?? 0}
                              </button>
                            </td>
                            {isVendable && (
                              <td style={{ textAlign: 'center' }}>
                                <button className="count-badge" onClick={() => openPopup('subProducts', p)}
                                  title={p.subProductsCount ? 'Voir les produits utilisables' : 'Aucun sous-produit'}
                                  disabled={!p.subProductsCount}
                                  style={{ opacity: p.subProductsCount ? 1 : 0.4, cursor: p.subProductsCount ? 'pointer' : 'default' }}>
                                  {p.subProductsCount ?? 0}
                                </button>
                              </td>
                            )}
                            <td style={{ textAlign: 'right' }}>{renderActions(p)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {totalPages > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, flexWrap: 'wrap', gap: 8 }}>
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                        {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, searched.length)} sur {searched.length}
                      </span>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <button className="btn btn-ghost btn-sm" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} style={{ padding: '4px 12px', fontWeight: 700 }}>‹</button>
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                          <button key={p} className={`btn btn-sm ${p === safePage ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPage(p)} style={{ minWidth: 34, padding: '4px 8px', fontWeight: p === safePage ? 800 : 500 }}>{p}</button>
                        ))}
                        <button className="btn btn-ghost btn-sm" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)} style={{ padding: '4px 12px', fontWeight: 700 }}>›</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {franchiseActsPopup && (
            <div className="modal-overlay" onClick={() => setFranchiseActsPopup(null)}>
              <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
                <div className="modal-header modal-header--primary">
                  <div>
                    <h2 style={{ margin: 0, fontSize: '1rem' }}>Activités — {franchiseActsPopup.productName}</h2>
                    {franchiseActsPopup.group && (
                      <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>🏢 {franchiseActsPopup.group}</div>
                    )}
                  </div>
                  <button className="modal-close" onClick={() => setFranchiseActsPopup(null)}>×</button>
                </div>
                <div className="modal-body">
                  {franchiseActsPopup.activities.length === 0 ? (
                    <p style={{ color: '#888', textAlign: 'center' }}>Aucune activité trouvée</p>
                  ) : (
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {franchiseActsPopup.activities.map((a) => (
                        <li key={a.id} style={{ padding: '8px 12px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{a.nom}</div>
                          {a.adresse && <div style={{ fontSize: '0.8rem', color: 'var(--text)', marginTop: 3 }}>📍 {a.adresse}</div>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="modal-footer">
                  <button className="btn btn-ghost" onClick={() => setFranchiseActsPopup(null)}>{t('common.close')}</button>
                </div>
              </div>
            </div>
          )}

          {ftPopup && (
            <FicheTechniqueModal
              key={ftPopup.productId}
              productId={ftPopup.productId}
              productName={ftPopup.productName}
              hasIngredients={ftPopup.hasIngredients}
              resolvedActId={ftPopup.resolvedActId}
              contextLabel={ftPopup.contextLabel}
              activityName={ftPopup.activityName}
              activities={ftPopup.activities}
              franchiseGroup={ftPopup.franchiseGroup}
              onClose={() => setFtPopup(null)}
            />
          )}

          {popup && (
            <div className="modal-overlay" onClick={closePopup}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header modal-header--info">
                  <h2>
                    {popup.type === 'ingredients'
                      ? t('client.products.popup_ingredients_title')
                      : t('client.products.popup_subproducts_title')} — {popup.productName}
                  </h2>
                  <button className="modal-close" onClick={closePopup}>×</button>
                </div>
                <div className="modal-body">
                  {loadingDetail ? (
                    <div className="loading-text">{t('common.loading')}</div>
                  ) : popup.type === 'ingredients' ? (
                    detail?.ingredients && detail.ingredients.length > 0 ? (
                      <table className="table">
                        <thead>
                          <tr>
                            <th>{t('client.products.popup_col_ingredient')}</th>
                            <th style={{ textAlign: 'right' }}>{t('client.products.popup_col_portion')}</th>
                            <th>{t('client.products.popup_col_unit')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.ingredients.map((ing, i) => (
                            <tr key={i}>
                              <td>{ing.ingredientName}</td>
                              <td style={{ textAlign: 'right' }}>{ing.portion}</td>
                              <td>{ing.unitName}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p style={{ color: '#888', textAlign: 'center', padding: '16px 0' }}>{t('client.products.popup_no_ingredients')}</p>
                    )
                  ) : (
                    detail?.subProducts && detail.subProducts.length > 0 ? (
                      <table className="table">
                        <thead>
                          <tr>
                            <th>{t('client.products.popup_col_subproduct')}</th>
                            <th style={{ textAlign: 'right' }}>{t('client.products.popup_col_portion')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.subProducts.map((sp, i) => (
                            <tr key={i}>
                              <td>{sp.subProductName}</td>
                              <td style={{ textAlign: 'right' }}>{sp.portion}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p style={{ color: '#888', textAlign: 'center', padding: '16px 0' }}>{t('client.products.popup_no_subproducts')}</p>
                    )
                  )}
                </div>
                <div className="modal-footer">
                  <button className="btn btn-ghost" onClick={closePopup}>{t('common.close')}</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
