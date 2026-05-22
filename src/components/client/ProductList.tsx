import { useEffect, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Product, Activite, ActiviteIngredient } from '../../types';
import FicheTechniqueTab from './FicheTechniqueTab';
import FicheTechniqueModal from './FicheTechniqueModal';

interface ProductDetail {
  ingredients: { ingredientName: string; portion: number; unitName: string; unitPrice: number; categorieName?: string | null }[];
  subProducts: { subProductName: string; portion: number; unitCost: number; totalLineCost: number }[];
}

type PopupType = 'ingredients' | 'subProducts' | null;
type TabType = 'vendable' | 'utilisable' | 'fiche-technique';

const PAGE_SIZE = 10;

export default function ProductList() {
  const { t } = useTranslation();
  const { canWrite, user } = useAuth();
  const isEntreprise = true;

  const [searchParams] = useSearchParams();
  const tab = (searchParams.get('tab') as TabType) || 'vendable';
  const laboId = searchParams.get('laboId') || '';

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [togglingPT, setTogglingPT] = useState<number | null>(null);
  const [ptDeselectModal, setPtDeselectModal] = useState<{ id: number; nom: string; historyCount: number } | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ product: Product; historyCount?: number } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [ftPopup, setFtPopup] = useState<{ productId: number; productName: string; hasIngredients: boolean; resolvedActId: number; contextLabel: string; activityName: string; activities: Activite[] } | null>(null);

  const [popup, setPopup] = useState<{ type: PopupType; productId: number; productName: string } | null>(null);
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [allActivities, setAllActivities] = useState<Activite[]>([]);
  const [selectedActiviteId, setSelectedActiviteId] = useState<number | null>(null);

  // Add product modal state
  type AddStep = 1 | 2 | 3 | 4 | 5;
  interface IngLine { ingredientId: string; portion: string; }
  const [addModal, setAddModal] = useState<AddStep | null>(null);
  const [addName, setAddName] = useState('');
  const [addRef, setAddRef] = useState('');
  const [addIsSupplement, setAddIsSupplement] = useState(false);
  const [addIngLines, setAddIngLines] = useState<IngLine[]>([]);
  const [addIngredients, setAddIngredients] = useState<ActiviteIngredient[]>([]);
  const [addIngSearch, setAddIngSearch] = useState('');
  const [addFamilleFilter, setAddFamilleFilter] = useState('');
  const [addCatFilter, setAddCatFilter] = useState('');
  const [addIngVisible, setAddIngVisible] = useState(20);
  const [addSaving, setAddSaving] = useState(false);
  const [addSavedName, setAddSavedName] = useState('');
  const [addAffectationActiviteIds, setAddAffectationActiviteIds] = useState<number[]>([]);

  // Load activities — for gerant users use their assigned activité directly
  useEffect(() => {
    if (user?.role === 'gerant' && user.gerantActiviteType === 'activite' && user.gerantActiviteId) {
      const act = { id: user.gerantActiviteId, nom: user.gerantActiviteNom ?? 'Activité', entrepriseId: 0 } as Activite;
      setAllActivities([act]);
      setSelectedActiviteId(act.id);
      return;
    }
    api.get('/api/entreprise/activites')
      .then(({ data }) => {
        const all = data as Activite[];
        const scoped = laboId ? all.filter((a) => String((a as any).laboId) === laboId) : all;
        setAllActivities(scoped);
        if (scoped.length > 0) setSelectedActiviteId(scoped[0].id);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role, user?.gerantActiviteId, laboId]);

  // Load products
  useEffect(() => {
    setLoading(true);
    setPage(1);
    const params = new URLSearchParams();
    if (laboId) params.set('laboId', laboId);
    const qs = params.toString();
    api.get(`/api/products${qs ? `?${qs}` : ''}`)
      .then(({ data }) => setProducts(data as Product[]))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEntreprise, laboId]);

  const openAddModal = useCallback(() => {
    setAddName(''); setAddRef(''); setAddIsSupplement(false);
    setAddIngLines([]); setAddIngSearch('');
    setAddSavedName(''); setAddFamilleFilter(''); setAddCatFilter(''); setAddIngVisible(20);
    setAddAffectationActiviteIds(selectedActiviteId ? [selectedActiviteId] : []);
    setAddModal(1);
    if (selectedActiviteId) {
      api.get(`/api/entreprise/activites/${selectedActiviteId}/ingredients`)
        .then(({ data }) => setAddIngredients(data as ActiviteIngredient[]))
        .catch(() => setAddIngredients([]));
    }
  }, [selectedActiviteId]);

  const openPopup = async (type: PopupType, product: Product) => {
    setPopup({ type, productId: product.id, productName: product.name });
    setDetail(null);
    setLoadingDetail(true);
    try {
      const { data } = await api.get(`/api/products/${product.id}`);
      setDetail(data);
    } finally {
      setLoadingDetail(false);
    }
  };

  const closePopup = () => { setPopup(null); setDetail(null); };

  const handleDelete = async (product: Product) => {
    if (product.type === 'utilisable' && product.isStockIngredient) {
      setTogglingPT(product.id);
      let histCount = 0;
      try {
        const { data: hist } = await api.get(`/api/stock/pt/${product.id}/history`);
        histCount = Array.isArray(hist) ? hist.length : 0;
      } catch { /* ignore */ }
      setTogglingPT(null);
      setDeleteModal({ product, historyCount: histCount });
    } else {
      setDeleteModal({ product });
    }
  };

  const doDelete = async () => {
    if (!deleteModal) return;
    const { product } = deleteModal;
    setDeleting(true);
    try {
      if (product.type === 'utilisable' && product.isStockIngredient) {
        await api.delete(`/api/produits/${product.id}/stock-pt-history`);
      }
      await api.delete(`/api/products/${product.id}`);
      setProducts((p) => p.filter((x) => x.id !== product.id));
      setDeleteModal(null);
    } catch { /* ignore */ }
    setDeleting(false);
  };

  const togglePT = async (p: Product) => {
    if (p.isStockIngredient) {
      setTogglingPT(p.id);
      let histCount = 0;
      try {
        const { data: hist } = await api.get(`/api/stock/pt/${p.id}/history`);
        histCount = Array.isArray(hist) ? hist.length : 0;
      } catch { /* ignore */ }
      setTogglingPT(null);
      if (histCount > 0) {
        setPtDeselectModal({ id: p.id, nom: p.name, historyCount: histCount });
        return;
      }
    }
    await doTogglePT(p.id);
  };

  const doTogglePT = async (id: number, deleteHistory = false) => {
    setTogglingPT(id);
    try {
      await api.post(`/api/produits/${id}/toggle-stock-ingredient`);
      if (deleteHistory) await api.delete(`/api/produits/${id}/stock-pt-history`);
      setProducts((prev) => prev.map((p) => p.id === id ? { ...p, isStockIngredient: !p.isStockIngredient } : p));
    } finally {
      setTogglingPT(null);
    }
  };

  const byTab = products.filter((p) => p.type === tab && (!selectedActiviteId || p.activiteId === selectedActiviteId));
  const searched = byTab.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(searched.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = searched.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const isVendable = tab === 'vendable';
  const getProductResolvedActId = (p: Product): number => {
    if (!isEntreprise) return 0;
    return p.activiteId || 0;
  };

  const getProductFtContext = (p: Product): { contextLabel: string; activityName: string } => {
    if (!isEntreprise) return { contextLabel: '', activityName: '' };
    const act = allActivities.find((a) => a.id === p.activiteId);
    return act ? { contextLabel: `Activité : ${act.nom}`, activityName: act.nom } : { contextLabel: '', activityName: '' };
  };

  // Reusable action buttons for a product row
  const disabledStyle = !canWrite ? { opacity: 0.4, cursor: 'not-allowed', pointerEvents: 'none' as const } : {};

  const renderActions = (p: Product) => (
    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', alignItems: 'center' }}>
      <button
        className="btn btn-ghost btn-sm"
        style={{ width: 32, height: 32, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, ...disabledStyle }}
        title="Générer la Fiche Technique"
        disabled={!canWrite}
        onClick={() => {
          const ctx = getProductFtContext(p);
          setFtPopup({ productId: p.id, productName: p.name, hasIngredients: !!(p.ingredientsCount && p.ingredientsCount > 0), resolvedActId: getProductResolvedActId(p), activities: [], ...ctx });
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="24" height="24" rx="3" fill="#217346"/>
          <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" fill="#185C37"/>
          <path d="M14 2V8H20L14 2Z" fill="#107C41"/>
          <text x="7" y="18" fill="white" fontSize="9" fontWeight="bold" fontFamily="Calibri,Arial,sans-serif">XLS</text>
        </svg>
      </button>
      {canWrite
        ? (
          <Link
            to={`/client/products/${p.id}/edit`}
            className="btn btn-ghost btn-sm"
            title={t('common.edit')}
            style={{ width: 32, height: 32, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7 }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </Link>
        ) : (
          <button
            className="btn btn-ghost btn-sm"
            disabled
            title={t('common.edit')}
            style={{ width: 32, height: 32, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, ...disabledStyle }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
        )
      }
      <button
        className="btn btn-danger btn-sm"
        onClick={() => handleDelete(p)}
        disabled={!canWrite}
        title={t('common.delete')}
        style={{ width: 32, height: 32, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, ...disabledStyle }}
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

  return (
    <div className="page">
      {/* ── Hero header ── */}
      <div style={{
        background: 'linear-gradient(135deg, #881337 0%, #9f1239 55%, #f43f5e 100%)',
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(159,18,57,0.28)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>📦</div>
              <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>
                {tab === 'fiche-technique'
                  ? t('client.products.tab_fiche_technique')
                  : tab === 'utilisable'
                    ? t('client.products.tab_utilisable')
                    : t('client.products.tab_vendable')}
              </h1>
              {tab !== 'fiche-technique' && selectedActiviteId && (() => {
                const actNom = allActivities.find(a => a.id === selectedActiviteId)?.nom;
                return actNom ? (
                  <span style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 10, padding: '3px 12px', fontSize: '0.82rem', fontWeight: 700, color: '#fff' }}>
                    📍 {actNom}
                  </span>
                ) : null;
              })()}
            </div>
            <p style={{ color: 'rgba(255,255,255,0.78)', margin: 0, fontSize: '0.85rem' }}>
              {tab === 'fiche-technique'
                ? 'Exportez et consultez vos fiches techniques par produit'
                : tab === 'utilisable'
                  ? 'Produits semi-finis utilisés dans la composition de vos recettes'
                  : 'Produits finis destinés à la vente, définis par leurs fiches techniques'}
            </p>
          </div>
          {tab !== 'fiche-technique' && (
            <div style={{ background: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: 14, padding: '10px 20px', textAlign: 'center', minWidth: 80, flexShrink: 0 }}>
              <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#fff', lineHeight: 1 }}>{byTab.length}</div>
              <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>
                produit{byTab.length !== 1 ? 's' : ''}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Activity selector */}
      {tab !== 'fiche-technique' && !laboId && allActivities.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 16, padding: '10px 14px', background: '#fff', borderRadius: 10, border: '1px solid #fda4af' }}>
          {allActivities.map((a) => (
            <button key={a.id} onClick={() => { setSelectedActiviteId(a.id); setPage(1); }}
              style={{
                padding: '4px 14px', borderRadius: 20, cursor: 'pointer', fontSize: '0.82rem',
                border: selectedActiviteId === a.id ? '1.5px solid #9f1239' : '1.5px solid #fda4af',
                background: selectedActiviteId === a.id ? '#9f1239' : '#fff1f2',
                color: selectedActiviteId === a.id ? '#fff' : '#881337',
                fontWeight: selectedActiviteId === a.id ? 700 : 400,
                transition: 'all 0.15s',
              }}>
              {a.nom}
            </button>
          ))}
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', alignSelf: 'center', marginLeft: 4 }}>← sélectionner l'activité</span>
          {canWrite && (
            <button onClick={openAddModal}
              style={{ marginLeft: 'auto', padding: '5px 16px', borderRadius: 20, cursor: 'pointer', fontSize: '0.82rem', border: 'none', background: 'linear-gradient(135deg, #881337, #9f1239)', color: '#fff', fontWeight: 700, boxShadow: '0 2px 8px rgba(159,18,57,0.25)' }}>
              + {isVendable ? 'Produit vendable' : 'Produit utilisable'}
            </button>
          )}
        </div>
      )}

      {tab === 'fiche-technique' ? (
        <FicheTechniqueTab
          isEntreprise={isEntreprise}
          allActivities={allActivities}
        />
      ) : (
        <>
          {/* Search bar */}
          {byTab.length > 0 && (
            <div style={{
              background: 'var(--surface)', borderRadius: 14, padding: '16px 20px', marginBottom: 24,
              border: '1px solid var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
              display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end',
            }}>
              {search && (
                <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.78rem' }} onClick={() => { setSearch(''); setPage(1); }}>✕ Réinitialiser</button>
                </div>
              )}
              <div>
                <label style={{ fontSize: '0.68rem', fontWeight: 800, color: '#9f1239', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>🔍 Nom</label>
                <input type="text" placeholder={t('common.search') + '...'}
                  value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  style={{ padding: '9px 13px', borderRadius: 9, border: '1.5px solid #9f1239', fontSize: '0.88rem', background: '#fff1f2', minWidth: 160 }} />
              </div>
            </div>
          )}

          {loading ? (
            <div className="loading-text">{t('common.loading')}</div>
          ) : searched.length === 0 ? (
            byTab.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 24px', textAlign: 'center' }}>
                <div style={{ width: 72, height: 72, borderRadius: 20, background: 'linear-gradient(135deg, #4338ca 0%, #6366f1 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', marginBottom: 20, boxShadow: '0 8px 24px rgba(67,56,202,0.28)' }}>
                  {isVendable ? '🍔' : '🧪'}
                </div>
                <h2 style={{ margin: '0 0 8px', fontSize: '1.15rem', fontWeight: 700, color: 'var(--text)' }}>
                  {isVendable ? 'Aucun produit vendable' : 'Aucun produit utilisable'}
                </h2>
                <p style={{ margin: '0 0 4px', fontSize: '0.88rem', color: 'var(--text-muted)', maxWidth: 340 }}>
                  Commencez par créer votre premier produit.
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
              <div className="table-responsive card" style={{ borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
                <table className="table">
                  <thead style={{ background: 'linear-gradient(135deg, #1e1b4b, #4338ca)' }}>
                    <tr>
                      <th style={{ color: '#fff', fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{t('common.name')}</th>
                      <th style={{ textAlign: 'center', color: '#fff', fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>🧂 Articles</th>
                      {isVendable && <th style={{ textAlign: 'center', color: '#fff', fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>📦 P.Utilisables</th>}
                      {!isVendable && <th style={{ width: 60, textAlign: 'center', color: '#fff', fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>📦 Stock</th>}
                      <th style={{ textAlign: 'right', color: '#fff', fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{t('common.actions')}</th>
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
                        {!isVendable && (
                          <td style={{ textAlign: 'center' }}>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => togglePT(p)}
                              disabled={togglingPT === p.id}
                              title={p.isStockIngredient ? 'Retirer du stock' : 'Ajouter au stock'}
                              style={{ fontSize: '1rem', color: p.isStockIngredient ? 'var(--success)' : 'var(--text-muted)' }}
                            >
                              {togglingPT === p.id ? '…' : p.isStockIngredient ? '✓' : '○'}
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
              onClose={() => setFtPopup(null)}
            />
          )}

          {popup && (
            <div className="modal-overlay">
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header" style={{ background: 'linear-gradient(135deg, #1e1b4b, #4338ca)', borderBottom: 'none' }}>
                  <h2 style={{ color: '#fff', margin: 0 }}>
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
                      <table className="table" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                        <thead style={{ background: 'linear-gradient(135deg, #1e1b4b, #4338ca)' }}>
                          <tr>
                            <th style={{ color: '#fff', fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{t('client.products.popup_col_ingredient')}</th>
                            <th style={{ color: '#fff', fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Catégorie</th>
                            <th style={{ textAlign: 'right', color: '#fff', fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{t('client.products.popup_col_portion')}</th>
                            <th style={{ color: '#fff', fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{t('client.products.popup_col_unit')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.ingredients.map((ing, i) => (
                            <tr key={i} style={{ background: i % 2 === 0 ? '#f8fafc' : '#fff', transition: 'background 0.12s' }}
                              onMouseEnter={e => (e.currentTarget.style.background = '#eef2ff')}
                              onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? '#f8fafc' : '#fff')}>
                              <td style={{ fontWeight: 600, color: '#1e1b4b' }}>{ing.ingredientName}</td>
                              <td>
                                {ing.categorieName ? (
                                  <span style={{ background: '#ede9fe', color: '#5b21b6', borderRadius: 6, padding: '2px 8px', fontSize: '0.75rem', fontWeight: 600 }}>
                                    {ing.categorieName}
                                  </span>
                                ) : (
                                  <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>—</span>
                                )}
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 700, color: '#374151' }}>{ing.portion}</td>
                              <td style={{ color: '#64748b', fontSize: '0.85rem' }}>{ing.unitName}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 0' }}>
                        <span style={{ fontSize: '2rem', marginBottom: 8 }}>🧂</span>
                        <p style={{ color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>{t('client.products.popup_no_ingredients')}</p>
                      </div>
                    )
                  ) : (
                    detail?.subProducts && detail.subProducts.length > 0 ? (
                      <table className="table">
                        <thead style={{ background: 'linear-gradient(135deg, #1e1b4b, #4338ca)' }}>
                          <tr>
                            <th style={{ color: '#fff', fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{t('client.products.popup_col_subproduct')}</th>
                            <th style={{ textAlign: 'right', color: '#fff', fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{t('client.products.popup_col_portion')}</th>
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
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 0' }}>
                        <span style={{ fontSize: '2rem', marginBottom: 8 }}>📦</span>
                        <p style={{ color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>{t('client.products.popup_no_subproducts')}</p>
                      </div>
                    )
                  )}
                </div>
                <div className="modal-footer">
                  <button className="btn btn-ghost" onClick={closePopup}>{t('common.close')}</button>
                </div>
              </div>
            </div>
          )}

          {deleteModal && (() => {
            const { product, historyCount } = deleteModal;
            const isCascade = product.type === 'utilisable' && product.isStockIngredient;
            return (
              <div className="modal-overlay">
                <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
                  <div className="modal-header" style={{ background: isCascade ? 'linear-gradient(135deg, #7c2d12, #dc2626)' : 'linear-gradient(135deg, #b91c1c, #dc2626)', borderRadius: '12px 12px 0 0', padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h2 style={{ color: '#fff', margin: 0, fontSize: '1rem', fontWeight: 800 }}>
                      {isCascade ? '⚠️ Suppression avec cascade' : '🗑️ Supprimer le produit'}
                    </h2>
                    <button onClick={() => setDeleteModal(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 900, fontSize: '1.1rem', cursor: 'pointer', padding: '2px 9px', lineHeight: 1 }}>×</button>
                  </div>
                  <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ background: '#f8faff', borderRadius: 8, padding: '12px 14px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Produit</div>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{product.name}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        {product.type === 'vendable' ? '🛒 Vendable' : product.isStockIngredient ? '🔄 Utilisable — Produit transformé' : '🧂 Utilisable'}
                      </div>
                    </div>
                    {isCascade ? (
                      <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 8, padding: '12px 14px' }}>
                        <div style={{ fontWeight: 800, color: '#b91c1c', fontSize: '0.88rem', marginBottom: 6 }}>
                          ⚠️ Cette suppression entraîne des effets en cascade :
                        </div>
                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.83rem', color: '#7f1d1d', lineHeight: 1.7 }}>
                          {(historyCount ?? 0) > 0 && (
                            <li><strong>{historyCount}</strong> entrée{(historyCount ?? 0) > 1 ? 's' : ''} d'approvisionnement supprimée{(historyCount ?? 0) > 1 ? 's' : ''}</li>
                          )}
                          <li>Retrait du stock et recalcul des quantités</li>
                          <li>Suppression des inventaires associés</li>
                        </ul>
                      </div>
                    ) : null}
                    <div style={{ background: '#fff7ed', border: '1px solid #fbd38d', borderRadius: 8, padding: '8px 12px', fontSize: '0.82rem', color: '#92400e', fontWeight: 600 }}>
                      🔒 Action irréversible — cette suppression ne peut pas être annulée.
                    </div>
                  </div>
                  <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 22px', borderTop: '1px solid var(--border)' }}>
                    <button className="btn btn-ghost" onClick={() => setDeleteModal(null)} disabled={deleting}>Annuler</button>
                    <button
                      onClick={doDelete}
                      disabled={deleting}
                      style={{ background: 'linear-gradient(135deg, #b91c1c, #dc2626)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 800, padding: '10px 22px', cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.7 : 1 }}
                    >
                      {deleting ? '…' : 'Supprimer définitivement'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {ptDeselectModal && (
            <div className="modal-overlay">
              <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
                <div className="modal-header" style={{ background: '#fff7ed', borderBottom: '1px solid #fbd38d' }}>
                  <h2 style={{ color: '#c05621' }}>⚠️ Retirer du stock</h2>
                  <button className="modal-close" onClick={() => setPtDeselectModal(null)}>×</button>
                </div>
                <div className="modal-body">
                  <p style={{ marginBottom: 12 }}>
                    Vous êtes sur le point de retirer <strong>"{ptDeselectModal.nom}"</strong> du stock.
                  </p>
                  {ptDeselectModal.historyCount > 0 ? (
                    <p style={{ color: 'var(--danger)', fontSize: '0.88rem' }}>
                      Ce produit possède <strong>{ptDeselectModal.historyCount}</strong> entrée{ptDeselectModal.historyCount > 1 ? 's' : ''} d'approvisionnement.
                      En confirmant, <strong>tout l'historique sera supprimé définitivement</strong>.
                    </p>
                  ) : (
                    <p style={{ color: '#92400e', fontSize: '0.88rem' }}>
                      Si vous continuez, le produit ne sera plus visible dans votre stock. Cette action est réversible (vous pourrez le ré-activer).
                    </p>
                  )}
                </div>
                <div className="modal-footer">
                  <button className="btn btn-ghost" onClick={() => setPtDeselectModal(null)}>Annuler</button>
                  <button
                    className="btn btn-danger"
                    style={{ background: 'var(--danger)', color: '#fff', border: 'none' }}
                    onClick={async () => {
                      const m = ptDeselectModal;
                      setPtDeselectModal(null);
                      await doTogglePT(m.id, true);
                    }}
                  >
                    Retirer et supprimer
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Add product modal (4 steps) ── */}
          {addModal && (() => {
            const selectedIngredients = addIngredients.filter((i) => i.selected);
            const selectedIngIds = new Set(addIngLines.map((l) => l.ingredientId).filter(Boolean));

            const toggleIngredient = (ing: ActiviteIngredient) => {
              const sid = String(ing.id);
              if (addIsSupplement) {
                setAddIngLines([{ ingredientId: sid, portion: '' }]);
              } else if (selectedIngIds.has(sid)) {
                setAddIngLines((prev) => prev.filter((l) => l.ingredientId !== sid));
              } else {
                setAddIngLines((prev) => [...prev, { ingredientId: sid, portion: '' }]);
              }
            };

            const updatePortion = (ingId: string, val: string) => {
              setAddIngLines((prev) => prev.map((l) => l.ingredientId === ingId ? { ...l, portion: val } : l));
            };

            const canGoStep2 = addName.trim().length > 0;
            const canGoStep3 = addIngLines.some((l) => l.ingredientId && parseFloat(l.portion) > 0);
            const canGoStep4 = addAffectationActiviteIds.length > 0;

            const handleSave = async () => {
              setAddSaving(true);
              try {
                const baseIngredients = addIngLines
                  .filter((l) => l.ingredientId && parseFloat(l.portion) > 0)
                  .map((l) => ({ ingredientId: parseInt(l.ingredientId), portion: parseFloat(l.portion) }));
                await Promise.all(addAffectationActiviteIds.map((actId) =>
                  api.post('/api/products', {
                    name: addName.trim(),
                    refProduit: addRef.trim() || null,
                    type: tab === 'utilisable' ? 'utilisable' : 'vendable',
                    isSupplement: addIsSupplement,
                    activiteId: actId,
                    ingredients: baseIngredients,
                    subProducts: [],
                  })
                ));
                setAddSavedName(addName.trim());
                setAddModal(5);
                const params = new URLSearchParams();
                if (laboId) params.set('laboId', laboId);
                const qs = params.toString();
                api.get(`/api/products${qs ? `?${qs}` : ''}`).then(({ data }) => setProducts(data as Product[]));
              } catch { /* ignore */ }
              setAddSaving(false);
            };

            const STEPS = [
              { n: 1, label: 'Identité' },
              { n: 2, label: 'Articles' },
              { n: 3, label: 'Affectation' },
              { n: 4, label: 'Récap' },
            ];

            return (
              <div className="modal-overlay">
                <div className="modal" style={{ maxWidth: 560, width: '95vw', maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
                  {/* Header */}
                  <div style={{ background: 'linear-gradient(135deg, #881337 0%, #9f1239 100%)', padding: '18px 22px 14px', borderRadius: '12px 12px 0 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: '#fff', fontWeight: 800, fontSize: '1rem', marginBottom: addModal !== 5 ? 12 : 0 }}>
                        {addModal === 5 ? '✅ Produit créé' : `Nouveau ${isVendable ? 'produit vendable' : 'produit utilisable'}`}
                      </div>
                      {addModal !== 5 && (
                        <div style={{ display: 'flex', gap: 10, width: '100%' }}>
                          {STEPS.map((s) => (
                            <div key={s.n} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <div style={{ height: 4, borderRadius: 4, background: s.n <= addModal ? '#fff' : 'rgba(255,255,255,0.28)', transition: 'background 0.2s' }} />
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <div style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, background: s.n <= addModal ? '#fff' : 'rgba(255,255,255,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.62rem', fontWeight: 800, color: s.n <= addModal ? '#9f1239' : 'rgba(255,255,255,0.55)' }}>
                                  {s.n < addModal ? '✓' : s.n}
                                </div>
                                <span style={{ fontSize: '0.68rem', color: s.n <= addModal ? '#fff' : 'rgba(255,255,255,0.5)', fontWeight: 600 }}>{s.label}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <button onClick={() => setAddModal(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 900, fontSize: '1.1rem', cursor: 'pointer', padding: '2px 9px', lineHeight: 1, flexShrink: 0 }}>×</button>
                  </div>

                  <div style={{ padding: '20px 22px' }}>
                    {/* Step 1 — Identité */}
                    {addModal === 1 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div>
                          <label style={{ display: 'block', fontWeight: 700, fontSize: '0.82rem', color: '#881337', marginBottom: 6 }}>
                            Nom du produit <span style={{ color: '#ef4444' }}>*</span>
                          </label>
                          <input className="input" placeholder="Ex. Burger Classic, Pizza Margherita…" value={addName}
                            onChange={(e) => setAddName(e.target.value)} autoFocus
                            style={{ width: '100%', borderColor: '#fda4af' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontWeight: 700, fontSize: '0.82rem', color: '#881337', marginBottom: 6 }}>
                            Réf. produit <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)' }}>(optionnel)</span>
                          </label>
                          <input className="input" placeholder="Ex. BRG-001" value={addRef}
                            onChange={(e) => setAddRef(e.target.value)}
                            style={{ width: '100%', maxWidth: 280, borderColor: '#fda4af' }} />
                        </div>
                        {isVendable && (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: addIsSupplement ? '#fff1f2' : '#f9fafb', borderRadius: 10, padding: '12px 16px', border: `1.5px solid ${addIsSupplement ? '#fda4af' : 'var(--border)'}` }}>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: '0.88rem', color: addIsSupplement ? '#881337' : 'var(--text)' }}>Supplément</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>Un supplément ne contient qu'un seul ingrédient</div>
                            </div>
                            <button type="button"
                              onClick={() => setAddIsSupplement((v) => !v)}
                              style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: addIsSupplement ? '#9f1239' : '#d1d5db', transition: 'background 0.2s', position: 'relative', flexShrink: 0 }}>
                              <span style={{ position: 'absolute', top: 3, left: addIsSupplement ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                            </button>
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 8 }}>
                          <button className="btn btn-ghost" onClick={() => setAddModal(null)}>Annuler</button>
                          <button disabled={!canGoStep2}
                            onClick={() => setAddModal(2)}
                            style={{ background: canGoStep2 ? 'linear-gradient(135deg, #881337, #9f1239)' : '#e5e7eb', border: 'none', borderRadius: 10, color: canGoStep2 ? '#fff' : '#9ca3af', fontWeight: 700, padding: '9px 22px', cursor: canGoStep2 ? 'pointer' : 'not-allowed' }}>
                            Suivant →
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Step 2 — Articles */}
                    {addModal === 2 && (() => {
                      // Build famille + catégorie option lists from available articles
                      const famOptions: { key: string; label: string }[] = [];
                      const famSeen = new Set<string>();
                      const catOptions: { key: string; label: string; famKey: string }[] = [];
                      const catSeen = new Set<string>();
                      for (const ing of selectedIngredients) {
                        const fk = ing.familleId != null ? String(ing.familleId) : '';
                        const fl = ing.familleNom ?? '';
                        if (fk && !famSeen.has(fk)) { famSeen.add(fk); famOptions.push({ key: fk, label: fl }); }
                        const ck = String(ing.categorieId ?? '');
                        const cl = ing.categorie || 'Sans catégorie';
                        if (!catSeen.has(ck)) { catSeen.add(ck); catOptions.push({ key: ck, label: cl, famKey: fk }); }
                      }
                      const filteredCats = addFamilleFilter ? catOptions.filter(c => c.famKey === addFamilleFilter) : catOptions;

                      const articlesFiltered = selectedIngredients.filter((i) => {
                        if (addIngSearch && !i.nom.toLowerCase().includes(addIngSearch.toLowerCase())) return false;
                        if (addFamilleFilter && String(i.familleId ?? '') !== addFamilleFilter) return false;
                        if (addCatFilter && String(i.categorieId ?? '') !== addCatFilter) return false;
                        return true;
                      });

                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {addIsSupplement && (
                            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: '0.82rem', color: '#475569', fontWeight: 600 }}>
                              Mode supplément — sélectionnez un seul article
                            </div>
                          )}
                          {/* Search */}
                          <input className="input" placeholder="🔍 Rechercher…" value={addIngSearch}
                            onChange={(e) => { setAddIngSearch(e.target.value); setAddIngVisible(20); }}
                            style={{ fontSize: '0.82rem' }} />
                          {/* Filters row */}
                          <div style={{ display: 'flex', gap: 8 }}>
                            <select value={addFamilleFilter}
                              onChange={(e) => { setAddFamilleFilter(e.target.value); setAddCatFilter(''); setAddIngVisible(20); }}
                              style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.8rem', background: addFamilleFilter ? '#f0f9ff' : '#fff', color: '#374151', cursor: 'pointer' }}>
                              <option value="">Toutes les familles</option>
                              {famOptions.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                            </select>
                            <select value={addCatFilter}
                              onChange={(e) => { setAddCatFilter(e.target.value); setAddIngVisible(20); }}
                              style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.8rem', background: addCatFilter ? '#f0f9ff' : '#fff', color: '#374151', cursor: 'pointer' }}>
                              <option value="">Toutes les catégories</option>
                              {filteredCats.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                            </select>
                          </div>
                          {/* Article list — scroll lazy-load, ~5 rows visible */}
                          <div
                            style={{ height: 210, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, border: '1px solid var(--border)', borderRadius: 10, padding: '6px' }}
                            onScroll={(e) => {
                              const el = e.currentTarget;
                              if (el.scrollHeight - el.scrollTop - el.clientHeight < 60) {
                                setAddIngVisible(v => v + 20);
                              }
                            }}
                          >
                            {articlesFiltered.length === 0 && (
                              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0', fontSize: '0.85rem' }}>Aucun article trouvé</div>
                            )}
                            {articlesFiltered.slice(0, addIngVisible).map((ing) => {
                              const sid = String(ing.id);
                              const sel = selectedIngIds.has(sid);
                              const line = addIngLines.find((l) => l.ingredientId === sid);
                              const portionValid = sel && parseFloat(line?.portion || '0') > 0;
                              return (
                                <div key={ing.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 8, background: sel ? (portionValid ? '#fff7ed' : '#fff1f2') : 'transparent', cursor: 'pointer', transition: 'background 0.12s' }}
                                  onClick={() => toggleIngredient(ing)}>
                                  <input type="checkbox" checked={sel} onChange={() => toggleIngredient(ing)}
                                    onClick={e => e.stopPropagation()}
                                    style={{ accentColor: '#9f1239', width: 15, height: 15, flexShrink: 0, cursor: 'pointer' }} />
                                  <span style={{ flex: 1, fontSize: '0.84rem', fontWeight: sel ? 600 : 400, color: sel ? '#881337' : '#374151' }}>{ing.nom}</span>
                                  {ing.categorie && (
                                    <span style={{ fontSize: '0.68rem', color: '#64748b', background: '#f1f5f9', borderRadius: 6, padding: '1px 6px', flexShrink: 0 }}>{ing.categorie}</span>
                                  )}
                                  {sel && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                                      <input type="number" step="0.001" min="0" placeholder="portion"
                                        value={line?.portion || ''}
                                        onChange={(e) => updatePortion(sid, e.target.value)}
                                        style={{ width: 72, padding: '3px 6px', borderRadius: 6, border: `1.5px solid ${portionValid ? '#fda4af' : '#ef4444'}`, fontSize: '0.82rem', textAlign: 'right' }} />
                                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{ing.unite}</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            {articlesFiltered.length > addIngVisible && (
                              <div style={{ textAlign: 'center', padding: '8px 0', fontSize: '0.73rem', color: '#94a3b8' }}>
                                ↓ {articlesFiltered.length - addIngVisible} article{articlesFiltered.length - addIngVisible > 1 ? 's' : ''} de plus — faites défiler
                              </div>
                            )}
                          </div>
                          {addIngLines.some(l => l.ingredientId) && (
                            <div style={{ fontSize: '0.78rem', color: '#9f1239', fontWeight: 600 }}>
                              {addIngLines.filter(l => l.ingredientId && parseFloat(l.portion) > 0).length} article{addIngLines.filter(l => l.ingredientId && parseFloat(l.portion) > 0).length !== 1 ? 's' : ''} valide{addIngLines.filter(l => l.ingredientId && parseFloat(l.portion) > 0).length !== 1 ? 's' : ''} (portion &gt; 0)
                            </div>
                          )}
                          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4 }}>
                            <button className="btn btn-ghost" onClick={() => setAddModal(1)}>← Retour</button>
                            <button disabled={!canGoStep3}
                              onClick={() => setAddModal(3)}
                              style={{ background: canGoStep3 ? 'linear-gradient(135deg, #881337, #9f1239)' : '#e5e7eb', border: 'none', borderRadius: 10, color: canGoStep3 ? '#fff' : '#9ca3af', fontWeight: 700, padding: '9px 22px', cursor: canGoStep3 ? 'pointer' : 'not-allowed' }}>
                              Suivant →
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Step 3 — Affectation (multi-select) */}
                    {addModal === 3 && (() => {
                      const allSel = allActivities.length > 0 && allActivities.every(a => addAffectationActiviteIds.includes(a.id));
                      const toggleAct = (id: number) => setAddAffectationActiviteIds(prev =>
                        prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
                      );
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
                            Sélectionnez une ou plusieurs activités. Le produit sera créé pour chacune d'elles.
                          </div>
                          {allActivities.length === 0 ? (
                            <div style={{ padding: 16, borderRadius: 8, background: '#fff1f2', border: '1px solid #fda4af', fontSize: '0.85rem', color: '#881337', textAlign: 'center' }}>
                              Aucune activité disponible.
                            </div>
                          ) : (
                            <>
                              {/* Select all row */}
                              <button type="button" onClick={() => setAddAffectationActiviteIds(allSel ? [] : allActivities.map(a => a.id))}
                                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 8, cursor: 'pointer', border: '1.5px solid var(--border)', background: allSel ? '#fff1f2' : 'transparent', textAlign: 'left' }}>
                                <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, border: allSel ? 'none' : '1.5px solid #cbd5e1', background: allSel ? '#9f1239' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {allSel && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
                                </div>
                                <span style={{ fontSize: '0.84rem', fontWeight: 600, color: '#374151' }}>Tout sélectionner</span>
                                <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#94a3b8' }}>{addAffectationActiviteIds.length}/{allActivities.length}</span>
                              </button>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
                                {allActivities.map((act) => {
                                  const sel = addAffectationActiviteIds.includes(act.id);
                                  return (
                                    <button key={act.id} type="button" onClick={() => toggleAct(act.id)}
                                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left', border: sel ? '2px solid #9f1239' : '1.5px solid var(--border)', background: sel ? '#fff1f2' : 'var(--surface)', transition: 'all 0.15s' }}>
                                      <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: sel ? '#ffe4e6' : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>📍</div>
                                      <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600, fontSize: '0.88rem', color: sel ? '#881337' : '#0f172a' }}>{act.nom}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Activité</div>
                                      </div>
                                      <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, border: sel ? 'none' : '1.5px solid #cbd5e1', background: sel ? '#9f1239' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {sel && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                              {addAffectationActiviteIds.length === 0 && (
                                <div style={{ fontSize: '0.78rem', color: '#ef4444' }}>Au moins une activité est requise</div>
                              )}
                            </>
                          )}
                          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8 }}>
                            <button className="btn btn-ghost" onClick={() => setAddModal(2)}>← Retour</button>
                            <button disabled={!canGoStep4}
                              onClick={() => setAddModal(4)}
                              style={{ background: canGoStep4 ? 'linear-gradient(135deg, #881337, #9f1239)' : '#e5e7eb', border: 'none', borderRadius: 10, color: canGoStep4 ? '#fff' : '#9ca3af', fontWeight: 700, padding: '9px 22px', cursor: canGoStep4 ? 'pointer' : 'not-allowed' }}>
                              Suivant →
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Step 4 — Récap & Confirmation */}
                    {addModal === 4 && (() => {
                      const ingCount = addIngLines.filter(l => l.ingredientId && parseFloat(l.portion) > 0).length;
                      const selActs = allActivities.filter(a => addAffectationActiviteIds.includes(a.id));
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                          {/* Product identity card */}
                          <div style={{ background: 'linear-gradient(135deg,#fff1f2,#ffe4e6)', border: '1.5px solid #fda4af', borderRadius: 14, padding: '16px 18px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                              <div style={{ width: 42, height: 42, borderRadius: 10, background: '#9f1239', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', flexShrink: 0 }}>📦</div>
                              <div>
                                <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#881337' }}>{addName}</div>
                                {addRef && <div style={{ fontSize: '0.75rem', color: '#9f1239', marginTop: 1 }}>Réf : {addRef}</div>}
                              </div>
                              <div style={{ marginLeft: 'auto', background: '#9f1239', color: '#fff', borderRadius: 20, padding: '3px 10px', fontSize: '0.72rem', fontWeight: 700 }}>
                                {isVendable ? 'Vendable' : 'Utilisable'}{addIsSupplement ? ' · Suppl.' : ''}
                              </div>
                            </div>
                            {/* Stats row */}
                            <div style={{ display: 'flex', gap: 10 }}>
                              <div style={{ flex: 1, background: 'rgba(255,255,255,0.6)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                                <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#881337' }}>{ingCount}</div>
                                <div style={{ fontSize: '0.7rem', color: '#9f1239' }}>article{ingCount !== 1 ? 's' : ''}</div>
                              </div>
                              <div style={{ flex: 1, background: 'rgba(255,255,255,0.6)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                                <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#881337' }}>{selActs.length}</div>
                                <div style={{ fontSize: '0.7rem', color: '#9f1239' }}>activité{selActs.length !== 1 ? 's' : ''}</div>
                              </div>
                            </div>
                          </div>
                          {/* Activités list */}
                          <div>
                            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Activités cibles</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {selActs.map(a => (
                                <span key={a.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#fff1f2', border: '1.5px solid #fda4af', borderRadius: 20, padding: '4px 12px', fontSize: '0.8rem', fontWeight: 600, color: '#881337' }}>
                                  📍 {a.nom}
                                </span>
                              ))}
                            </div>
                          </div>
                          {/* Articles list preview */}
                          <div>
                            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Articles sélectionnés</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 140, overflowY: 'auto' }}>
                              {addIngLines.filter(l => l.ingredientId && parseFloat(l.portion) > 0).map(l => {
                                const ing = addIngredients.find(i => String(i.id) === l.ingredientId);
                                return (
                                  <div key={l.ingredientId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 10px', borderRadius: 7, background: '#f8fafc', fontSize: '0.82rem' }}>
                                    <span style={{ color: '#374151', fontWeight: 500 }}>{ing?.nom ?? l.ingredientId}</span>
                                    <span style={{ color: '#64748b', fontWeight: 600 }}>{l.portion} {ing?.unite}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4, borderTop: '1px solid var(--border)' }}>
                            <button className="btn btn-ghost" onClick={() => setAddModal(3)}>← Retour</button>
                            <button disabled={addSaving}
                              onClick={handleSave}
                              style={{ background: 'linear-gradient(135deg, #881337, #9f1239)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, padding: '10px 28px', cursor: addSaving ? 'not-allowed' : 'pointer', opacity: addSaving ? 0.7 : 1, fontSize: '0.9rem' }}>
                              {addSaving ? 'Création…' : `Créer ${selActs.length > 1 ? `${selActs.length}×` : ''} le produit ✓`}
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Step 5 — Succès */}
                    {addModal === 5 && (
                      <div style={{ textAlign: 'center', padding: '16px 0 8px' }}>
                        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg, #22c55e, #16a34a)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem', margin: '0 auto 14px' }}>✓</div>
                        <div style={{ fontWeight: 700, fontSize: '1rem', color: '#166534', marginBottom: 6 }}>Produit créé avec succès</div>
                        <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: 22 }}>
                          <strong>{addSavedName}</strong> a été ajouté à votre liste.
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                          <button className="btn btn-ghost" onClick={() => setAddModal(null)}>Fermer</button>
                          <button onClick={openAddModal}
                            style={{ background: 'linear-gradient(135deg, #881337, #9f1239)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, padding: '9px 22px', cursor: 'pointer' }}>
                            + Ajouter un autre
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
