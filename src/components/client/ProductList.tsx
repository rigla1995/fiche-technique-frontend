import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Product, Activite } from '../../types';
import FicheTechniqueTab from './FicheTechniqueTab';

interface ProductDetail {
  ingredients: { ingredientName: string; portion: number; unitName: string; unitPrice: number }[];
  subProducts: { subProductName: string; portion: number; unitCost: number; totalLineCost: number }[];
}

type PopupType = 'ingredients' | 'subProducts' | null;
type TabType = 'vendable' | 'utilisable' | 'fiche-technique';

const PAGE_SIZE = 10;

export default function ProductList() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isEntreprise = user?.compteType === 'entreprise';

  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get('tab') as TabType) || 'vendable';
  const actCtx = searchParams.get('actCtx') || '';

  const isFranchiseCtx = actCtx === 'franchise';
  const isDistinctCtx = actCtx === 'distinct' || actCtx.startsWith('distinct-');
  const preSelectedDistinctId = actCtx.startsWith('distinct-') ? actCtx.replace('distinct-', '') : '';

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

  const [popup, setPopup] = useState<{ type: PopupType; productId: number; productName: string } | null>(null);
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [franchiseActivities, setFranchiseActivities] = useState<Activite[]>([]);
  const [distinctActivities, setDistinctActivities] = useState<Activite[]>([]);
  const [activitesLoading, setActivitesLoading] = useState(false);

  // Selected distinct activity ID (only relevant for distinct context)
  const [selectedActivityId, setSelectedActivityId] = useState<string>(preSelectedDistinctId);

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

  // Auto-select first distinct activity when none pre-selected
  useEffect(() => {
    if (isDistinctCtx && !preSelectedDistinctId && distinctActivities.length > 0 && !selectedActivityId) {
      setSelectedActivityId(String(distinctActivities[0].id));
    }
  }, [isDistinctCtx, distinctActivities, preSelectedDistinctId, selectedActivityId]);

  // Load products
  useEffect(() => {
    if (isEntreprise && isDistinctCtx && !selectedActivityId) return;
    setLoading(true);
    setPage(1);
    const params = new URLSearchParams();
    if (isFranchiseCtx) {
      params.set('activiteType', 'franchise');
      if (filterFranchiseGroup) params.set('franchiseGroup', filterFranchiseGroup);
    } else if (selectedActivityId) {
      params.set('activiteId', selectedActivityId);
    }
    const qs = params.toString();
    api.get(`/products${qs ? `?${qs}` : ''}`)
      .then(({ data }) => setProducts(data as Product[]))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEntreprise, isFranchiseCtx, isDistinctCtx, selectedActivityId, filterFranchiseGroup, filterFranchiseActId]);

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
  const linkActCtx = isFranchiseCtx ? 'franchise'
    : selectedActivityId ? `distinct-${selectedActivityId}`
    : '';
  const actCtxQs = linkActCtx ? `&actCtx=${encodeURIComponent(linkActCtx)}` : '';
  const actCtxParam = linkActCtx ? `?actCtx=${encodeURIComponent(linkActCtx)}` : '';

  const getActivityName = (activiteId: number | null | undefined): string => {
    if (!activiteId) return '—';
    const found = distinctActivities.find((a) => a.id === activiteId);
    return found ? found.nom : '—';
  };

  // Franchise groups derived from franchise activities
  const franchiseGroups = Array.from(
    new Set(franchiseActivities.map((a) => a.franchiseGroup || a.nom))
  ).sort();

  const byTab = products.filter((p) => p.type === tab);
  // Client-side filter by franchise activity: franchise-wide products (activiteId=null) always shown
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

  // Preserve current filters in add-product link so coming back from cancel restores them
  const filterQs = [
    actCtxQs ? actCtxQs.slice(1) : '',  // strip leading '&' from actCtxQs
    filterFranchiseGroup ? `fg=${encodeURIComponent(filterFranchiseGroup)}` : '',
    filterFranchiseActId ? `fact=${encodeURIComponent(filterFranchiseActId)}` : '',
  ].filter(Boolean).join('&');
  const addPath = isVendable
    ? `/client/products/new?type=vendable${filterQs ? `&${filterQs}` : ''}`
    : `/client/products/new?type=utilisable${filterQs ? `&${filterQs}` : ''}`;

  const showActivityCol = isEntreprise && isDistinctCtx && !!selectedActivityId;
  const showFranchiseActCol = isEntreprise && isFranchiseCtx && franchiseActivities.length > 1;

  const labelStyle: React.CSSProperties = {
    fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 3,
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>
          {tab === 'fiche-technique'
            ? t('client.products.tab_fiche_technique')
            : tab === 'utilisable'
              ? t('client.products.tab_utilisable')
              : t('client.products.tab_vendable')}
        </h1>
        {tab !== 'fiche-technique' && (!isEntreprise || isFranchiseCtx || selectedActivityId) && (
          <Link to={addPath} className="btn btn-primary">
            + {t(addKey)}
          </Link>
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
          {/* Franchise filters: group + activity + search */}
          {isEntreprise && isFranchiseCtx && tab !== 'fiche-technique' && (
            <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              {activitesLoading ? (
                <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{t('common.loading')}</span>
              ) : (
                <>
                  {franchiseGroups.length > 1 && (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={labelStyle}>Franchise</span>
                      <select
                        className="input"
                        style={{ maxWidth: 220 }}
                        value={filterFranchiseGroup}
                        onChange={(e) => { setFilterFranchiseGroup(e.target.value); setPage(1); }}
                      >
                        <option value="">Toutes les franchises</option>
                        {franchiseGroups.map((g) => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {franchiseActivities.length > 1 && (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={labelStyle}>Activité</span>
                      <select
                        className="input"
                        style={{ maxWidth: 220 }}
                        value={filterFranchiseActId}
                        onChange={(e) => { setFilterFranchiseActId(e.target.value); setPage(1); }}
                      >
                        <option value="">Toutes les activités</option>
                        {franchiseActivities
                          .filter((a) => !filterFranchiseGroup || (a.franchiseGroup || a.nom) === filterFranchiseGroup)
                          .map((a) => (
                            <option key={a.id} value={a.id}>{a.nom}</option>
                          ))}
                      </select>
                    </div>
                  )}
                </>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                <span style={labelStyle}>{t('common.search')}</span>
                <input
                  type="text"
                  placeholder={t('common.search') + '...'}
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="input"
                  style={{ maxWidth: 300 }}
                />
              </div>
            </div>
          )}

          {/* Distinct filters: activity + name */}
          {isEntreprise && isDistinctCtx && tab !== 'fiche-technique' && (
            <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              {activitesLoading ? (
                <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{t('common.loading')}</span>
              ) : distinctActivities.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={labelStyle}>Activité</span>
                  <select
                    className="input"
                    style={{ maxWidth: 260 }}
                    value={selectedActivityId}
                    onChange={(e) => { setSelectedActivityId(e.target.value); setPage(1); }}
                  >
                    {distinctActivities.map((a) => (
                      <option key={a.id} value={a.id}>{a.nom}</option>
                    ))}
                  </select>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                <span style={labelStyle}>{t('common.search')}</span>
                <input
                  type="text"
                  placeholder={t('common.search') + '...'}
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="input"
                  style={{ maxWidth: 300 }}
                />
              </div>
            </div>
          )}

          {/* Search bar for non-enterprise */}
          {!isEntreprise && (
            <div className="search-bar">
              <input
                type="text"
                placeholder={t('common.search') + '...'}
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="input"
              />
            </div>
          )}

          {loading ? (
            <div className="loading-text">{t('common.loading')}</div>
          ) : searched.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">{isVendable ? '🍔' : '🧪'}</span>
              <p>{byTab.length === 0 ? t(emptyKey) : t('common.no_result')}</p>
              {byTab.length === 0 && (!isEntreprise || isFranchiseCtx || selectedActivityId) && (
                <Link to={addPath} className="btn btn-primary">{t(addKey)}</Link>
              )}
            </div>
          ) : (
            <>
              <div className="table-responsive card">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('common.name')}</th>
                      {showActivityCol && <th>Activité</th>}
                      {showFranchiseActCol && <th>Activité</th>}
                      <th style={{ textAlign: 'center' }}>{t('nav.ingredients')}</th>
                      {isVendable && (
                        <th style={{ textAlign: 'center' }}>{t('client.products.usable_products_col')}</th>
                      )}
                      <th>{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((p) => (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        {showActivityCol && (
                          <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            {getActivityName(p.activiteId)}
                          </td>
                        )}
                        {showFranchiseActCol && (
                          <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            {p.activiteId
                              ? (franchiseActivities.find((a) => a.id === p.activiteId)?.nom ?? '—')
                              : <span style={{ fontStyle: 'italic' }}>Toutes</span>}
                          </td>
                        )}
                        <td style={{ textAlign: 'center' }}>
                          <button className="btn btn-ghost btn-sm" style={{ minWidth: 36 }} onClick={() => openPopup('ingredients', p)}>
                            {p.ingredientsCount ?? 0}
                          </button>
                        </td>
                        {isVendable && (
                          <td style={{ textAlign: 'center' }}>
                            <button className="btn btn-ghost btn-sm" style={{ minWidth: 36 }} onClick={() => openPopup('subProducts', p)}>
                              {p.subProductsCount ?? 0}
                            </button>
                          </td>
                        )}
                        <td className="actions-cell">
                          <Link to={`/client/products/${p.id}/edit${actCtxParam}`} className="btn btn-ghost btn-sm">{t('common.edit')}</Link>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p.id)}>
                            {t('common.delete')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, flexWrap: 'wrap', gap: 8 }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, searched.length)} / {searched.length}
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={safePage <= 1}
                      onClick={() => setPage(safePage - 1)}
                    >
                      ← Préc.
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                      <button
                        key={p}
                        className={`btn btn-sm ${p === safePage ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => setPage(p)}
                        style={{ minWidth: 32 }}
                      >
                        {p}
                      </button>
                    ))}
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={safePage >= totalPages}
                      onClick={() => setPage(safePage + 1)}
                    >
                      Suiv. →
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {popup && (
            <div className="modal-overlay" onClick={closePopup}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
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
