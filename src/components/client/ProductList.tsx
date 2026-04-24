import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Product, Activite, ActiviteTypesSummary } from '../../types';
import FicheTechniqueTab from './FicheTechniqueTab';

interface ProductDetail {
  ingredients: { ingredientName: string; portion: number; unitName: string; unitPrice: number }[];
  subProducts: { subProductName: string; portion: number; unitCost: number; totalLineCost: number }[];
}

type PopupType = 'ingredients' | 'subProducts' | null;
type TabType = 'vendable' | 'utilisable' | 'fiche-technique';

export default function ProductList() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isEntreprise = user?.compteType === 'entreprise';

  const [searchParams] = useSearchParams();
  const tab = (searchParams.get('tab') as TabType) || 'vendable';

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState<number | null>(null);
  const [popup, setPopup] = useState<{ type: PopupType; productId: number; productName: string } | null>(null);
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Entreprise activity state
  const [typesSummary, setTypesSummary] = useState<ActiviteTypesSummary | null>(null);
  const [_franchiseActivities, setFranchiseActivities] = useState<Activite[]>([]);
  const [distinctActivities, setDistinctActivities] = useState<Activite[]>([]);
  const [activitesLoading, setActivitesLoading] = useState(false);
  // selectedActCtx: 'franchise' | `distinct-${id}`
  const [selectedActCtx, setSelectedActCtx] = useState<string>('');

  useEffect(() => {
    if (!isEntreprise) return;
    setActivitesLoading(true);
    Promise.all([
      api.get('/api/entreprise/activites/types-summary'),
      api.get('/api/entreprise/activites'),
    ]).then(([summaryRes, actsRes]) => {
      const summary = summaryRes.data as ActiviteTypesSummary;
      setTypesSummary(summary);
      const all = actsRes.data as Activite[];
      const franchise = all.filter((a) => a.type === 'franchise');
      const distinct = all.filter((a) => a.type === 'distincte' || a.type == null);
      setFranchiseActivities(franchise);
      setDistinctActivities(distinct);
      // Set default context
      if (summary.hasFranchise && franchise.length > 0) setSelectedActCtx('franchise');
      else if (summary.hasDistinct && distinct.length > 0) setSelectedActCtx(`distinct-${distinct[0].id}`);
    }).finally(() => setActivitesLoading(false));
  }, [isEntreprise]);

  // Derive query params from activity context
  const getActivityQuery = (): { activiteType?: string; activiteId?: string } => {
    if (!selectedActCtx) return {};
    if (selectedActCtx === 'franchise') return { activiteType: 'franchise' };
    const id = selectedActCtx.replace('distinct-', '');
    return { activiteId: id };
  };

  const loadProducts = () => {
    setLoading(true);
    const query = isEntreprise ? getActivityQuery() : {};
    const params = new URLSearchParams(query as Record<string, string>).toString();
    api.get(`/products${params ? `?${params}` : ''}`)
      .then(({ data }) => setProducts(data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isEntreprise && !selectedActCtx) return; // wait for activity context
    loadProducts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEntreprise, selectedActCtx]);

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

  const handleExport = async (id: number, name: string) => {
    setExporting(id);
    try {
      const response = await api.get(`/products/${id}/export`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `fiche-technique-${name}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } finally {
      setExporting(null);
    }
  };

  // Build the URL for add/edit that includes activity context
  const actCtxParam = selectedActCtx
    ? `&actCtx=${encodeURIComponent(selectedActCtx)}`
    : '';

  const byTab = products.filter((p) => p.type === tab);
  const filtered = byTab.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  const isVendable = tab === 'vendable';
  const emptyKey = isVendable ? 'client.products.no_vendable_products' : 'client.products.no_utilisable_products_tab';
  const addKey = isVendable ? 'client.products.add_vendable' : 'client.products.add_utilisable';
  const addPath = isVendable
    ? `/client/products/new?type=vendable${actCtxParam}`
    : `/client/products/new?type=utilisable${actCtxParam}`;

  // Activity selector label
  const getSelectedLabel = () => {
    if (selectedActCtx === 'franchise') return t('client.products.all_franchise');
    const id = parseInt(selectedActCtx.replace('distinct-', ''));
    const found = distinctActivities.find((a) => a.id === id);
    return found ? `D · ${found.nom}` : '';
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
        {tab !== 'fiche-technique' && (!isEntreprise || selectedActCtx) && (
          <Link to={addPath} className="btn btn-primary">
            + {t(addKey)}
          </Link>
        )}
      </div>

      {/* Entreprise: activity context selector */}
      {isEntreprise && (
        activitesLoading ? (
          <p className="text-muted">{t('common.loading')}</p>
        ) : (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: '2px solid var(--border)', marginBottom: 20 }}>
            {typesSummary?.hasFranchise && (
              <button
                onClick={() => setSelectedActCtx('franchise')}
                style={{
                  padding: '8px 16px', fontWeight: 600, fontSize: '0.85rem',
                  border: 'none', borderRadius: '6px 6px 0 0', cursor: 'pointer',
                  background: selectedActCtx === 'franchise' ? 'var(--primary)' : 'var(--surface)',
                  color: selectedActCtx === 'franchise' ? '#fff' : 'var(--text)',
                  borderBottom: selectedActCtx === 'franchise' ? '2px solid var(--primary)' : '2px solid transparent',
                  marginBottom: -2,
                }}
              >
                F · {t('client.products.all_franchise')}
              </button>
            )}
            {typesSummary?.hasDistinct && distinctActivities.map((a) => {
              const ctx = `distinct-${a.id}`;
              return (
                <button
                  key={a.id}
                  onClick={() => setSelectedActCtx(ctx)}
                  style={{
                    padding: '8px 16px', fontWeight: 600, fontSize: '0.85rem',
                    border: 'none', borderRadius: '6px 6px 0 0', cursor: 'pointer',
                    background: selectedActCtx === ctx ? 'var(--primary)' : 'var(--surface)',
                    color: selectedActCtx === ctx ? '#fff' : 'var(--text)',
                    borderBottom: selectedActCtx === ctx ? '2px solid var(--primary)' : '2px solid transparent',
                    marginBottom: -2,
                  }}
                >
                  D · {a.nom}
                </button>
              );
            })}
          </div>
        )
      )}

      {isEntreprise && selectedActCtx && (
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 12 }}>
          {selectedActCtx === 'franchise'
            ? t('client.products.franchise_scope_hint')
            : t('client.products.distinct_scope_hint', { name: getSelectedLabel() })}
        </p>
      )}

      {tab === 'fiche-technique' ? (
        <FicheTechniqueTab
          isEntreprise={isEntreprise}
          franchiseActivities={_franchiseActivities}
          distinctActivities={distinctActivities}
          typesSummary={typesSummary}
        />
      ) : (<>
      <div className="search-bar">
        <input
          type="text"
          placeholder={t('common.search') + '...'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input"
        />
      </div>

      {loading ? (
        <div className="loading-text">{t('common.loading')}</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">{isVendable ? '🍔' : '🧪'}</span>
          <p>{byTab.length === 0 ? t(emptyKey) : t('common.no_result')}</p>
          {byTab.length === 0 && (!isEntreprise || selectedActCtx) && (
            <Link to={addPath} className="btn btn-primary">{t(addKey)}</Link>
          )}
        </div>
      ) : (
        <div className="table-responsive card">
          <table className="table">
            <thead>
              <tr>
                <th>{t('common.name')}</th>
                <th style={{ textAlign: 'center' }}>{t('nav.ingredients')}</th>
                {isVendable && (
                  <th style={{ textAlign: 'center' }}>{t('client.products.usable_products_col')}</th>
                )}
                <th style={{ textAlign: 'right' }}>{t('common.total_cost')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
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
                  <td style={{ textAlign: 'right' }}>
                    <span className="cost-badge">{(p.totalCost || 0).toFixed(3)} {t('currency')}</span>
                  </td>
                  <td className="actions-cell">
                    <Link to={`/client/products/${p.id}/edit?${actCtxParam}`} className="btn btn-ghost btn-sm">{t('common.edit')}</Link>
                    <button
                      className="btn btn-success btn-sm"
                      onClick={() => handleExport(p.id, p.name)}
                      disabled={exporting === p.id}
                    >
                      📥 {exporting === p.id ? t('common.loading') : 'Excel'}
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p.id)}>
                      {t('common.delete')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
                        <th style={{ textAlign: 'right' }}>{t('client.products.popup_col_unit_price')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.ingredients.map((ing, i) => (
                        <tr key={i}>
                          <td>{ing.ingredientName}</td>
                          <td style={{ textAlign: 'right' }}>{ing.portion}</td>
                          <td>{ing.unitName}</td>
                          <td style={{ textAlign: 'right' }}>{ing.unitPrice?.toFixed(3)} {t('currency')}</td>
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
                        <th style={{ textAlign: 'right' }}>{t('client.products.popup_col_unit_cost')}</th>
                        <th style={{ textAlign: 'right' }}>{t('client.products.popup_col_line_total')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.subProducts.map((sp, i) => (
                        <tr key={i}>
                          <td>{sp.subProductName}</td>
                          <td style={{ textAlign: 'right' }}>{sp.portion}</td>
                          <td style={{ textAlign: 'right' }}>{sp.unitCost?.toFixed(3)} {t('currency')}</td>
                          <td style={{ textAlign: 'right' }}><strong>{sp.totalLineCost?.toFixed(3)} {t('currency')}</strong></td>
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
      </>)}
    </div>
  );
}
