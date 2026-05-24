import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  const canWriteProducts = canWrite && user?.role !== 'gerant';

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
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [ftPopup, setFtPopup] = useState<{ productId: number; productName: string; hasIngredients: boolean; resolvedActId: number; contextLabel: string; activityName: string; activities: Activite[] } | null>(null);

  const [popup, setPopup] = useState<{ type: PopupType; productId: number; productName: string } | null>(null);
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [allActivities, setAllActivities] = useState<Activite[]>([]);
  const [selectedActiviteId, setSelectedActiviteId] = useState<number | null>(null);

  // Add product modal state
  type AddStep = 1 | 2 | 3 | 4 | 5 | 6;
  interface IngLine { ingredientId: string; portion: string; }
  const [utilisableForWizard, setUtilisableForWizard] = useState<{ id: number; name: string }[]>([]);
  const [addModal, setAddModal] = useState<AddStep | null>(null);
  const [addName, setAddName] = useState('');
  const [addRef, setAddRef] = useState('');
  const [addIsSupplement, setAddIsSupplement] = useState(false);
  const [addIngLines, setAddIngLines] = useState<IngLine[]>([]);
  const [addSubLines, setAddSubLines] = useState<IngLine[]>([]);
  const [addSubSearch, setAddSubSearch] = useState('');
  const [addIngredients, setAddIngredients] = useState<ActiviteIngredient[]>([]);
  const [addIngSearch, setAddIngSearch] = useState('');
  const [addFamilleFilter, setAddFamilleFilter] = useState('');
  const [addCatFilter, setAddCatFilter] = useState('');
  const [addIngVisible, setAddIngVisible] = useState(20);
  const [addSaving, setAddSaving] = useState(false);
  const [addSavedName, setAddSavedName] = useState('');
  const [addSaveError, setAddSaveError] = useState<string | null>(null);

  // Edit product modal state — steps: 2=Articles, 3=Récap, 4=Succès (step 1 is skipped)
  type EditStep = 1 | 2 | 3 | 4 | 5;
  const [editModal, setEditModal] = useState<EditStep | null>(null);
  const [editProductId, setEditProductId] = useState<number | null>(null);
  const [editProductType, setEditProductType] = useState<'vendable' | 'utilisable'>('vendable');
  const [editName, setEditName] = useState('');
  const [editRef, setEditRef] = useState('');
  const [editIsSupplement, setEditIsSupplement] = useState(false);
  const [editIngLines, setEditIngLines] = useState<IngLine[]>([]);
  const [editSubLines, setEditSubLines] = useState<IngLine[]>([]);
  const [editOriginalSubLines, setEditOriginalSubLines] = useState<IngLine[]>([]);
  const [editSubSearch, setEditSubSearch] = useState('');
  const [editIngredients, setEditIngredients] = useState<ActiviteIngredient[]>([]);
  const [editIngSearch, setEditIngSearch] = useState('');
  const [editFamilleFilter, setEditFamilleFilter] = useState('');
  const [editCatFilter, setEditCatFilter] = useState('');
  const [editIngVisible, setEditIngVisible] = useState(20);
  const [editSaving, setEditSaving] = useState(false);
  const [editLoadingData, setEditLoadingData] = useState(false);
  const [editActiviteNom, setEditActiviteNom] = useState('');
  const [editOriginalIngLines, setEditOriginalIngLines] = useState<IngLine[]>([]);

  const [addAffectationIds, setAddAffectationIds] = useState<number[]>([]);
  const [editAffectationIds, setEditAffectationIds] = useState<number[]>([]);
  const [editOriginalAffectationIds, setEditOriginalAffectationIds] = useState<number[]>([]);

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

  // Load products — reload when activité changes so OR EXISTS per-activité affectations are reflected
  useEffect(() => {
    if (!selectedActiviteId && allActivities.length > 0) return; // wait until activité is known
    setLoading(true);
    setPage(1);
    const params = new URLSearchParams();
    if (laboId) params.set('laboId', laboId);
    if (selectedActiviteId) params.set('activiteId', String(selectedActiviteId));
    const qs = params.toString();
    api.get(`/api/products${qs ? `?${qs}` : ''}`)
      .then(({ data }) => setProducts(data as Product[]))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEntreprise, laboId, selectedActiviteId]);

  const openEditModal = useCallback(async (p: Product) => {
    setEditProductId(p.id);
    setEditProductType(p.type);
    setEditName(''); setEditRef(''); setEditIsSupplement(false);
    setEditIngLines([]); setEditSubLines([]); setEditOriginalSubLines([]); setEditSubSearch('');
    setEditIngredients([]); setEditIngSearch('');
    setEditFamilleFilter(''); setEditCatFilter(''); setEditIngVisible(20);
    const contextActId = selectedActiviteId ?? p.activiteId;
    setEditActiviteNom(allActivities.find((a) => a.id === contextActId)?.nom || '');
    setEditLoadingData(true);
    setEditModal(2);
    // Load current stock affectations for this product
    api.get(`/api/produits/${p.id}/stock-activites`)
      .then(({ data }) => {
        const ids = data as number[];
        setEditAffectationIds(ids);
        setEditOriginalAffectationIds(ids);
      })
      .catch(() => {
        setEditAffectationIds([]);
        setEditOriginalAffectationIds([]);
      });
    if (contextActId) {
      api.get(`/api/products?type=utilisable&activiteId=${contextActId}`)
        .then(({ data }) => setUtilisableForWizard((data as Product[]).filter(u => u.id !== p.id).map(u => ({ id: u.id, name: u.name }))))
        .catch(() => {});
    }
    try {
      const actId = contextActId;
      const [productRes, ingRes] = await Promise.all([
        api.get(`/api/products/${p.id}`),
        actId ? api.get(`/api/entreprise/activites/${actId}/ingredients`) : Promise.resolve({ data: [] }),
      ]);
      const pdata = productRes.data as {
        name: string; refProduit?: string; isSupplement?: boolean;
        ingredients: { ingredientId: number; portion: number; ingredientName?: string; unitName?: string }[];
        subProducts: { subProductId: number; portion: number; subProductName?: string }[];
      };
      const ings = ingRes.data as ActiviteIngredient[];
      const ingMerged = [...ings];
      for (const pi of pdata.ingredients) {
        if (!ingMerged.find((x) => x.id === pi.ingredientId)) {
          ingMerged.push({ id: pi.ingredientId, nom: pi.ingredientName || String(pi.ingredientId), unite: pi.unitName || '', categorie: '', categorieId: null, familleId: null, familleNom: null, prixUnitaire: null, selected: true });
        }
      }
      setEditIngredients(ingMerged);
      setEditName(pdata.name);
      setEditRef(pdata.refProduit || '');
      setEditIsSupplement(pdata.isSupplement ?? false);
      const loadedLines = pdata.ingredients.map((i) => ({ ingredientId: String(i.ingredientId), portion: String(i.portion) }));
      setEditIngLines(loadedLines);
      setEditOriginalIngLines(loadedLines);
      const loadedSubLines = (pdata.subProducts || []).map((sp) => ({ ingredientId: String(sp.subProductId), portion: String(sp.portion) }));
      setEditSubLines(loadedSubLines);
      setEditOriginalSubLines(loadedSubLines);
    } finally {
      setEditLoadingData(false);
    }
  }, [allActivities, selectedActiviteId]);

  const openAddModal = useCallback(() => {
    setAddName(''); setAddRef(''); setAddIsSupplement(false);
    setAddIngLines([]); setAddSubLines([]); setAddSubSearch(''); setAddIngSearch('');
    setAddSavedName(''); setAddFamilleFilter(''); setAddCatFilter(''); setAddIngVisible(20);
    setAddAffectationIds([]);
    setAddModal(1);
    api.get('/api/products?type=utilisable')
      .then(({ data }) => setUtilisableForWizard((data as Product[]).map(u => ({ id: u.id, name: u.name }))))
      .catch(() => {});
    const actId = selectedActiviteId ?? allActivities[0]?.id;
    if (actId) {
      api.get(`/api/entreprise/activites/${actId}/ingredients`)
        .then(({ data }) => setAddIngredients(data as ActiviteIngredient[]))
        .catch(() => setAddIngredients([]));
    }
  }, [selectedActiviteId, allActivities]);

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
    if (product.type === 'utilisable') {
      // Check PT history count for the selected activité
      setTogglingPT(product.id);
      let histCount = 0;
      try {
        const histUrl = selectedActiviteId
          ? `/api/stock/pt/${product.id}/history?activiteId=${selectedActiviteId}`
          : `/api/stock/pt/${product.id}/history`;
        const { data: hist } = await api.get(histUrl);
        histCount = Array.isArray(hist) ? hist.length : 0;
      } catch { /* ignore */ }
      setTogglingPT(null);
      setDeleteError(null);
      setDeleteModal({ product, historyCount: histCount });
    } else {
      setDeleteError(null);
      setDeleteModal({ product });
    }
  };

  const doDelete = async () => {
    if (!deleteModal) return;
    const { product } = deleteModal;
    setDeleting(true);
    setDeleteError(null);
    try {
      if (product.type === 'utilisable') {
        // Clean up PT stock history for the selected activité before deleting the product
        const historyUrl = selectedActiviteId
          ? `/api/produits/${product.id}/stock-pt-history?activiteId=${selectedActiviteId}`
          : `/api/produits/${product.id}/stock-pt-history`;
        await api.delete(historyUrl);
      }
      await api.delete(`/api/products/${product.id}`);
      setProducts((p) => p.filter((x) => x.id !== product.id));
      setDeleteModal(null);
      setDeleteError(null);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setDeleteError(msg || 'Erreur lors de la suppression.');
    }
    setDeleting(false);
  };

  const togglePT = async (p: Product) => {
    if (p.isStockIngredient) {
      setTogglingPT(p.id);
      let histCount = 0;
      try {
        const histUrl = selectedActiviteId
          ? `/api/stock/pt/${p.id}/history?activiteId=${selectedActiviteId}`
          : `/api/stock/pt/${p.id}/history`;
        const { data: hist } = await api.get(histUrl);
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
      await api.post(`/api/produits/${id}/toggle-stock-ingredient`, selectedActiviteId ? { activiteId: selectedActiviteId } : {});
      if (deleteHistory) await api.delete(`/api/produits/${id}/stock-pt-history`);
      setProducts((prev) => prev.map((p) => p.id === id ? { ...p, isStockIngredient: !p.isStockIngredient } : p));
    } finally {
      setTogglingPT(null);
    }
  };

  const byTab = products.filter((p) => p.type === tab);
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
  const disabledStyle = !canWriteProducts ? { opacity: 0.4, cursor: 'not-allowed', pointerEvents: 'none' as const } : {};

  const renderActions = (p: Product) => (
    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', alignItems: 'center' }}>
      <button
        className="btn btn-ghost btn-sm"
        style={{ width: 32, height: 32, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, ...disabledStyle }}
        title="Générer la Fiche Technique"
        disabled={!canWriteProducts}
        onClick={() => {
          const ctx = getProductFtContext(p);
          setFtPopup({ productId: p.id, productName: p.name, hasIngredients: !!(p.ingredientsCount && p.ingredientsCount > 0), resolvedActId: getProductResolvedActId(p), activities: [], ...ctx });
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="3" fill="#217346"/><path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" fill="#185C37"/><path d="M14 2V8H20L14 2Z" fill="#107C41"/><text x="7" y="18" fill="white" fontSize="8" fontWeight="bold" fontFamily="Arial,sans-serif">XLS</text></svg>
      </button>
      <button
        className="btn btn-ghost btn-sm"
        title={t('common.edit')}
        disabled={!canWriteProducts}
        onClick={() => openEditModal(p)}
        style={{ width: 32, height: 32, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, ...(!canWriteProducts ? disabledStyle : {}) }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
      <button
        className="btn btn-danger btn-sm"
        onClick={() => handleDelete(p)}
        disabled={!canWriteProducts}
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
        background: 'linear-gradient(135deg, #0a1628 0%, #0f2847 55%, #0d3b2e 100%)',
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(10,22,40,0.35)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{ background: 'rgba(16,185,129,0.18)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem', lineHeight: 1 }}>
                {tab === 'fiche-technique' ? '📋' : tab === 'utilisable' ? '🧪' : '🍽️'}
              </div>
              <h1 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.01em' }}>
                {tab === 'fiche-technique'
                  ? t('client.products.tab_fiche_technique')
                  : tab === 'utilisable'
                    ? t('client.products.tab_utilisable')
                    : t('client.products.tab_vendable')}
              </h1>
              {tab !== 'fiche-technique' && selectedActiviteId && (() => {
                const actNom = allActivities.find(a => a.id === selectedActiviteId)?.nom;
                return actNom ? (
                  <span style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 8, padding: '3px 10px', fontSize: '0.78rem', fontWeight: 600, color: '#6ee7b7' }}>
                    {actNom}
                  </span>
                ) : null;
              })()}
            </div>
            <p style={{ color: 'rgba(255,255,255,0.55)', margin: 0, fontSize: '0.83rem', letterSpacing: '0.01em' }}>
              {tab === 'fiche-technique'
                ? 'Exportez et consultez vos fiches techniques par produit'
                : tab === 'utilisable'
                  ? 'Produits semi-finis utilisés dans la composition de vos recettes'
                  : 'Produits finis destinés à la vente, définis par leurs fiches techniques'}
            </p>
          </div>
          {tab !== 'fiche-technique' && (
            <div style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.22)', borderRadius: 14, padding: '10px 20px', textAlign: 'center', minWidth: 80, flexShrink: 0 }}>
              <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#10b981', lineHeight: 1 }}>{byTab.length}</div>
              <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                produit{byTab.length !== 1 ? 's' : ''}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Activity selector */}
      {tab !== 'fiche-technique' && !laboId && allActivities.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 16, padding: '10px 14px', background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          {allActivities.map((a) => (
            <button key={a.id} onClick={() => { setSelectedActiviteId(a.id); setPage(1); }}
              style={{
                padding: '4px 14px', borderRadius: 20, cursor: 'pointer', fontSize: '0.82rem',
                border: selectedActiviteId === a.id ? '1.5px solid #0f2847' : '1.5px solid #e2e8f0',
                background: selectedActiviteId === a.id ? '#0f2847' : '#f8fafc',
                color: selectedActiviteId === a.id ? '#fff' : '#64748b',
                fontWeight: selectedActiviteId === a.id ? 700 : 400,
                transition: 'all 0.15s',
              }}>
              {a.nom}
            </button>
          ))}
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', alignSelf: 'center', marginLeft: 4 }}>← sélectionner l'activité</span>
        </div>
      )}

      {tab === 'fiche-technique' ? (
        <FicheTechniqueTab
          isEntreprise={isEntreprise}
          allActivities={allActivities}
        />
      ) : (
        <>
          {/* Search bar + create button */}
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
            {byTab.length > 0 && (
              <div>
                <label style={{ fontSize: '0.68rem', fontWeight: 800, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>🔍 Nom</label>
                <input type="text" placeholder={t('common.search') + '...'}
                  value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  style={{ padding: '9px 13px', borderRadius: 9, border: '1.5px solid #6ee7b7', fontSize: '0.88rem', background: '#f0fdf4', minWidth: 160 }} />
              </div>
            )}
            {canWriteProducts && (
              <button onClick={openAddModal}
                style={{ marginLeft: 'auto', padding: '9px 20px', borderRadius: 10, cursor: 'pointer', fontSize: '0.85rem', border: 'none', background: 'linear-gradient(135deg, #059669, #10b981)', color: '#fff', fontWeight: 700, boxShadow: '0 2px 8px rgba(16,185,129,0.25)', whiteSpace: 'nowrap' }}>
                + {isVendable ? 'Produit vendable' : 'Produit utilisable'}
              </button>
            )}
          </div>

          {loading ? (
            <div className="loading-text">{t('common.loading')}</div>
          ) : searched.length === 0 ? (
            byTab.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 24px', textAlign: 'center' }}>
                <div style={{ width: 72, height: 72, borderRadius: 20, background: 'linear-gradient(135deg, #0a1628 0%, #0f2847 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', marginBottom: 20, boxShadow: '0 8px 24px rgba(10,22,40,0.22)' }}>
                  {isVendable ? '🍽️' : '🧪'}
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
              {(() => {
                const supplements = isVendable ? paginated.filter((p) => p.isSupplement) : [];
                const regulars = isVendable ? paginated.filter((p) => !p.isSupplement) : paginated;
                const hasGroups = isVendable && supplements.length > 0 && regulars.length > 0;

                const renderProductCard = (p: Product) => {
                  const isSup = !!p.isSupplement;
                  const accentColor = isSup ? '#d97706' : '#059669';
                  const accentDark = isSup ? '#b45309' : '#047857';
                  const accentLight = isSup ? '#fffbeb' : '#f0fdf4';
                  const accentShadow = isSup ? 'rgba(217,119,6,0.18)' : 'rgba(5,150,105,0.15)';
                  const act = (isEntreprise && !selectedActiviteId) ? allActivities.find((a) => a.id === p.activiteId) : null;
                  return (
                    <div key={p.id} style={{
                      background: '#fff', borderRadius: 14,
                      border: '1px solid #e2e8f0',
                      borderLeft: `4px solid ${accentColor}`,
                      boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
                      display: 'flex', flexDirection: 'column', overflow: 'hidden',
                      transition: 'box-shadow 0.15s, transform 0.15s',
                    }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = `0 6px 24px ${accentShadow}`; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 10px rgba(0,0,0,0.05)'; (e.currentTarget as HTMLDivElement).style.transform = 'none'; }}
                    >
                      {/* Card header */}
                      <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'flex-start', gap: 12, background: accentLight }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: `linear-gradient(135deg, ${accentColor} 0%, ${accentDark} 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', boxShadow: `0 4px 10px ${accentShadow}` }}>
                          {isSup ? '➕' : (isVendable ? '🍽️' : '🧪')}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.92rem', color: '#0f172a', lineHeight: 1.3 }}>{p.name}</span>
                            {isSup && (
                              <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', borderRadius: 20, padding: '2px 8px', flexShrink: 0 }}>Supplément</span>
                            )}
                          </div>
                          {act && (
                            <div style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: 500, marginTop: 3 }}>
                              📍 {act.nom}
                            </div>
                          )}
                          {p.refProduit && (
                            <div style={{ fontSize: '0.68rem', color: '#9ca3af', fontWeight: 500, marginTop: 2 }}>Réf : {p.refProduit}</div>
                          )}
                        </div>
                      </div>

                      {/* Metrics row */}
                      <div style={{ padding: '10px 16px', display: 'flex', gap: 8, borderBottom: '1px solid #f1f5f9' }}>
                        <button
                          onClick={() => openPopup('ingredients', p)}
                          disabled={!p.ingredientsCount}
                          title={p.ingredientsCount ? 'Voir les articles' : 'Aucun article'}
                          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '8px 4px', borderRadius: 10, border: `1px solid ${p.ingredientsCount ? '#a7f3d0' : '#f1f5f9'}`, background: p.ingredientsCount ? '#ecfdf5' : '#f8fafc', cursor: p.ingredientsCount ? 'pointer' : 'default', opacity: p.ingredientsCount ? 1 : 0.5, transition: 'background 0.12s' }}
                        >
                          <span style={{ fontSize: '1rem', lineHeight: 1 }}>🧂</span>
                          <span style={{ fontWeight: 800, fontSize: '1rem', color: p.ingredientsCount ? '#059669' : '#9ca3af', lineHeight: 1 }}>{p.ingredientsCount ?? 0}</span>
                          <span style={{ fontSize: '0.6rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>articles</span>
                        </button>
                        {isVendable && (
                          <button
                            onClick={() => openPopup('subProducts', p)}
                            disabled={!p.subProductsCount}
                            title={p.subProductsCount ? 'Voir les produits utilisables' : 'Aucun produit utilisable'}
                            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '8px 4px', borderRadius: 10, border: `1px solid ${p.subProductsCount ? '#bfdbfe' : '#f1f5f9'}`, background: p.subProductsCount ? '#eff6ff' : '#f8fafc', cursor: p.subProductsCount ? 'pointer' : 'default', opacity: p.subProductsCount ? 1 : 0.5, transition: 'background 0.12s' }}
                          >
                            <span style={{ fontSize: '1rem', lineHeight: 1 }}>📦</span>
                            <span style={{ fontWeight: 800, fontSize: '1rem', color: p.subProductsCount ? '#2563eb' : '#9ca3af', lineHeight: 1 }}>{p.subProductsCount ?? 0}</span>
                            <span style={{ fontSize: '0.6rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>util.</span>
                          </button>
                        )}
                        {!isVendable && (
                          <button
                            disabled={!(p.parentProductsCount && p.parentProductsCount > 0)}
                            title={p.parentProductsCount ? `Utilisé dans ${p.parentProductsCount} produit(s)` : 'Non utilisé dans un produit'}
                            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '8px 4px', borderRadius: 10, border: `1px solid ${p.parentProductsCount ? '#bfdbfe' : '#f1f5f9'}`, background: p.parentProductsCount ? '#eff6ff' : '#f8fafc', cursor: p.parentProductsCount ? 'pointer' : 'default', opacity: p.parentProductsCount ? 1 : 0.5, transition: 'background 0.12s' }}
                          >
                            <span style={{ fontSize: '1rem', lineHeight: 1 }}>🍽️</span>
                            <span style={{ fontWeight: 800, fontSize: '1rem', color: p.parentProductsCount ? '#2563eb' : '#9ca3af', lineHeight: 1 }}>{p.parentProductsCount ?? 0}</span>
                            <span style={{ fontSize: '0.6rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>utilisé</span>
                          </button>
                        )}
                      </div>

                      {/* Actions footer */}
                      <div style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        {!isVendable ? (
                          <button
                            onClick={() => togglePT(p)}
                            disabled={togglingPT === p.id || !canWriteProducts}
                            title={p.isStockIngredient ? 'Désactiver le stock' : 'Activer le stock'}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', padding: 0, cursor: canWriteProducts ? 'pointer' : 'default', opacity: togglingPT === p.id ? 0.5 : 1 }}
                          >
                            {/* Toggle track */}
                            <div style={{
                              width: 36, height: 20, borderRadius: 10, position: 'relative', flexShrink: 0,
                              background: p.isStockIngredient ? '#059669' : '#cbd5e1',
                              transition: 'background 0.2s',
                            }}>
                              {/* Toggle thumb */}
                              <div style={{
                                position: 'absolute', top: 2, left: p.isStockIngredient ? 18 : 2,
                                width: 16, height: 16, borderRadius: '50%', background: '#fff',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                                transition: 'left 0.2s',
                              }} />
                            </div>
                            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: p.isStockIngredient ? '#065f46' : '#94a3b8', whiteSpace: 'nowrap' }}>
                              {togglingPT === p.id ? '…' : p.isStockIngredient ? 'Activé dans le stock' : 'Inactif'}
                            </span>
                          </button>
                        ) : <div />}
                        <div style={{ display: 'flex', gap: 4 }}>{renderActions(p)}</div>
                      </div>
                    </div>
                  );
                };

                const renderGroup = (label: string, icon: string, items: Product[], accent: string) => (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                      <div style={{ width: 6, height: 28, borderRadius: 3, background: accent, flexShrink: 0 }} />
                      <span style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: accent }}>{icon} {label}</span>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#fff', background: accent, borderRadius: 20, padding: '1px 9px' }}>{items.length}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
                      {items.map((p) => renderProductCard(p))}
                    </div>
                  </div>
                );

                return (
                  <div>
                    {hasGroups ? (
                      <>
                        {regulars.length > 0 && renderGroup('Produits', '🍽️', regulars, '#059669')}
                        {supplements.length > 0 && renderGroup('Suppléments', '➕', supplements, '#d97706')}
                      </>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
                        {paginated.map((p) => renderProductCard(p))}
                      </div>
                    )}
                  </div>
                );
              })()}
              {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, flexWrap: 'wrap', gap: 8 }}>
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
                            <th style={{ textAlign: 'right', color: '#fff', fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{t('client.products.popup_col_portion')}</th>
                            <th style={{ color: '#fff', fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{t('client.products.popup_col_unit')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.ingredients.map((ing, i) => (
                            <tr key={i} style={{ background: i % 2 === 0 ? '#f8fafc' : '#fff', transition: 'background 0.12s' }}
                              onMouseEnter={e => (e.currentTarget.style.background = '#eef2ff')}
                              onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? '#f8fafc' : '#fff')}>
                              <td>
                                <div style={{ fontWeight: 600, color: '#1e1b4b' }}>{ing.ingredientName}</div>
                                {ing.categorieName && (
                                  <span style={{ background: '#ede9fe', color: '#5b21b6', borderRadius: 6, padding: '1px 7px', fontSize: '0.72rem', fontWeight: 600, marginTop: 2, display: 'inline-block' }}>
                                    {ing.categorieName}
                                  </span>
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
            const isUtilisable = product.type === 'utilisable';
            const hasPtHistory = isUtilisable && (historyCount ?? 0) > 0;
            return (
              <div className="modal-overlay">
                <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
                  <div className="modal-header" style={{ background: hasPtHistory ? 'linear-gradient(135deg, #7c2d12, #dc2626)' : 'linear-gradient(135deg, #b91c1c, #dc2626)', borderRadius: '12px 12px 0 0', padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h2 style={{ color: '#fff', margin: 0, fontSize: '1rem', fontWeight: 800 }}>
                      {hasPtHistory ? '⚠️ Suppression avec cascade' : '🗑️ Supprimer le produit'}
                    </h2>
                    <button onClick={() => { setDeleteModal(null); setDeleteError(null); }} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 900, fontSize: '1.1rem', cursor: 'pointer', padding: '2px 9px', lineHeight: 1 }}>×</button>
                  </div>
                  <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ background: '#f8faff', borderRadius: 8, padding: '12px 14px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Produit</div>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{product.name}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        {product.type === 'vendable' ? '🛒 Vendable' : '🧪 Utilisable'}
                      </div>
                    </div>
                    {isUtilisable && (
                      <div style={{ background: hasPtHistory ? '#fff1f2' : '#f0fdf4', border: `1px solid ${hasPtHistory ? '#fecdd3' : '#a7f3d0'}`, borderRadius: 8, padding: '12px 14px' }}>
                        {hasPtHistory ? (
                          <>
                            <div style={{ fontWeight: 800, color: '#b91c1c', fontSize: '0.88rem', marginBottom: 6 }}>
                              ⚠️ Cette suppression entraîne des effets en cascade pour l'activité sélectionnée :
                            </div>
                            <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.83rem', color: '#7f1d1d', lineHeight: 1.7 }}>
                              <li><strong>{historyCount}</strong> appro{(historyCount ?? 0) > 1 ? 's' : ''} supprimé{(historyCount ?? 0) > 1 ? 's' : ''}</li>
                              <li>Stock PT, inventaires et pertes de cette activité supprimés</li>
                            </ul>
                          </>
                        ) : (
                          <div style={{ fontSize: '0.83rem', color: '#065f46' }}>
                            Aucun historique PT — les données de stock seront nettoyées proprement.
                          </div>
                        )}
                      </div>
                    )}
                    <div style={{ background: '#fff7ed', border: '1px solid #fbd38d', borderRadius: 8, padding: '8px 12px', fontSize: '0.82rem', color: '#92400e', fontWeight: 600 }}>
                      🔒 Action irréversible — cette suppression ne peut pas être annulée.
                    </div>
                  </div>
                  {deleteError && (
                    <div style={{ margin: '0 22px', background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 8, padding: '10px 14px', color: '#b91c1c', fontWeight: 700, fontSize: '0.85rem' }}>
                      ⛔ {deleteError}
                    </div>
                  )}
                  <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 22px', borderTop: '1px solid var(--border)' }}>
                    <button className="btn btn-ghost" onClick={() => { setDeleteModal(null); setDeleteError(null); }} disabled={deleting}>Annuler</button>
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

          {/* ── Edit product modal (3 steps) ── */}
          {editModal && (() => {
            const editIngIds = new Set(editIngLines.map((l) => l.ingredientId).filter(Boolean));
            const availableEditIngs = editIngredients.filter((i) => i.selected || editIngIds.has(String(i.id)));

            const editToggleIng = (ing: ActiviteIngredient) => {
              const sid = String(ing.id);
              if (editIsSupplement) {
                setEditIngLines([{ ingredientId: sid, portion: '' }]);
              } else if (editIngIds.has(sid)) {
                setEditIngLines((prev) => prev.filter((l) => l.ingredientId !== sid));
              } else {
                setEditIngLines((prev) => [...prev, { ingredientId: sid, portion: '' }]);
              }
            };

            const editUpdatePortion = (ingId: string, val: string) => {
              setEditIngLines((prev) => prev.map((l) => l.ingredientId === ingId ? { ...l, portion: val } : l));
            };

            const hasValidIngLines = editIngLines.some((l) => l.ingredientId && parseFloat(l.portion) > 0) || editSubLines.some((l) => l.ingredientId && parseFloat(l.portion) > 0);
            const normalizeLines = (lines: IngLine[]) =>
              lines
                .filter((l) => l.ingredientId && parseFloat(l.portion) > 0)
                .map((l) => ({ id: l.ingredientId, p: parseFloat(l.portion).toFixed(3) }))
                .sort((a, b) => a.id.localeCompare(b.id));
            const isEditDirty =
              JSON.stringify(normalizeLines(editIngLines)) !== JSON.stringify(normalizeLines(editOriginalIngLines)) ||
              JSON.stringify(normalizeLines(editSubLines)) !== JSON.stringify(normalizeLines(editOriginalSubLines));
            const canGoEditStep3 = hasValidIngLines && isEditDirty;

            const editSubIds = new Set(editSubLines.map((l) => l.ingredientId).filter(Boolean));
            const editToggleSub = (id: number) => {
              const sid = String(id);
              if (editSubIds.has(sid)) setEditSubLines((prev) => prev.filter((l) => l.ingredientId !== sid));
              else setEditSubLines((prev) => [...prev, { ingredientId: sid, portion: '' }]);
            };
            const editUpdateSubPortion = (id: string, val: string) =>
              setEditSubLines((prev) => prev.map((l) => l.ingredientId === id ? { ...l, portion: val } : l));

            const handleEditSave = async () => {
              if (!editProductId) return;
              setEditSaving(true);
              try {
                await api.put(`/api/products/${editProductId}`, {
                  name: editName.trim(),
                  refProduit: editRef.trim() || null,
                  isSupplement: editIsSupplement,
                  ingredients: editIngLines
                    .filter((l) => l.ingredientId && parseFloat(l.portion) > 0)
                    .map((l) => ({ ingredientId: parseInt(l.ingredientId), portion: parseFloat(l.portion) })),
                  subProducts: editSubLines
                    .filter((l) => l.ingredientId && parseFloat(l.portion) > 0)
                    .map((l) => ({ subProductId: parseInt(l.ingredientId), portion: parseFloat(l.portion) })),
                });
                const added = editAffectationIds.filter(id => !editOriginalAffectationIds.includes(id));
                const removed = editOriginalAffectationIds.filter(id => !editAffectationIds.includes(id));
                await Promise.all([
                  ...added.map(actId => api.post(`/api/produits/${editProductId}/toggle-stock-ingredient`, { activiteId: actId })),
                  ...removed.map(actId => api.post(`/api/produits/${editProductId}/toggle-stock-ingredient`, { activiteId: actId })),
                ]);
                setEditModal(null);
                const reloadParams = new URLSearchParams();
                if (laboId) reloadParams.set('laboId', laboId);
                if (selectedActiviteId) reloadParams.set('activiteId', String(selectedActiviteId));
                const reloadQs = reloadParams.toString();
                api.get(`/api/products${reloadQs ? `?${reloadQs}` : ''}`).then(({ data }) => setProducts(data as Product[]));
              } catch { /* ignore */ }
              setEditSaving(false);
            };

            const isEditVendable = editProductType === 'vendable';

            const EDIT_STEPS = [{ n: 2, display: 1, label: 'Articles' }, { n: 3, display: 2, label: 'Produits Utilisables' }, { n: 5, display: 3, label: 'Récap' }];

            // Compute filter options for step 2
            const eFamOptions: { key: string; label: string }[] = [];
            const eFamSeen = new Set<string>();
            const eCatOptions: { key: string; label: string; famKey: string }[] = [];
            const eCatSeen = new Set<string>();
            for (const ing of availableEditIngs) {
              const fk = ing.familleId != null ? String(ing.familleId) : '';
              const fl = ing.familleNom ?? '';
              if (fk && !eFamSeen.has(fk)) { eFamSeen.add(fk); eFamOptions.push({ key: fk, label: fl }); }
              const ck = String(ing.categorieId ?? '');
              const cl = ing.categorie || 'Sans catégorie';
              if (!eCatSeen.has(ck)) { eCatSeen.add(ck); eCatOptions.push({ key: ck, label: cl, famKey: fk }); }
            }
            const eFilteredCats = editFamilleFilter ? eCatOptions.filter((c) => c.famKey === editFamilleFilter) : eCatOptions;
            const eArticlesFiltered = availableEditIngs.filter((i) => {
              if (editIngSearch && !i.nom.toLowerCase().includes(editIngSearch.toLowerCase())) return false;
              if (editFamilleFilter && String(i.familleId ?? '') !== editFamilleFilter) return false;
              if (editCatFilter && String(i.categorieId ?? '') !== editCatFilter) return false;
              return true;
            });

            return (
              <div className="modal-overlay">
                <div className="modal" style={{ maxWidth: 560, width: '95vw', maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
                  {/* Header */}
                  <div style={{ background: 'linear-gradient(135deg, #0a1628 0%, #0f2847 100%)', padding: '18px 22px 14px', borderRadius: '12px 12px 0 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: '#fff', fontWeight: 800, fontSize: '1rem', marginBottom: 2 }}>
                        ✏️ Modifier — {editName || '…'}
                      </div>
                      {editActiviteNom && (
                        <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.78rem', fontWeight: 600, marginBottom: 12 }}>
                          📍 {editActiviteNom}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 10, width: '100%' }}>
                        {EDIT_STEPS.map((s) => (
                          <div key={s.n} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ height: 4, borderRadius: 4, background: s.n <= editModal ? '#fff' : 'rgba(255,255,255,0.28)', transition: 'background 0.2s' }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <div style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, background: s.n <= editModal ? '#fff' : 'rgba(255,255,255,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.62rem', fontWeight: 800, color: s.n <= editModal ? '#059669' : 'rgba(255,255,255,0.55)' }}>
                                {s.n < editModal ? '✓' : s.display}
                              </div>
                              <span style={{ fontSize: '0.68rem', color: s.n <= editModal ? '#fff' : 'rgba(255,255,255,0.5)', fontWeight: 600 }}>{s.label}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <button onClick={() => setEditModal(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 900, fontSize: '1.1rem', cursor: 'pointer', padding: '2px 9px', lineHeight: 1, flexShrink: 0 }}>×</button>
                  </div>

                  <div style={{ padding: '20px 22px' }}>
                    {/* Step 2 — Articles */}
                    {editModal === 2 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e1b4b', marginBottom: 2 }}>
                          {editName || '…'}
                          {editRef && <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#64748b', marginLeft: 6 }}>— {editRef}</span>}
                        </div>
                        {editIsSupplement && (
                          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: '0.82rem', color: '#475569', fontWeight: 600 }}>
                            Mode supplément — sélectionnez un seul article
                          </div>
                        )}
                        <input className="input" placeholder="🔍 Rechercher…" value={editIngSearch}
                          onChange={(e) => { setEditIngSearch(e.target.value); setEditIngVisible(20); }}
                          style={{ fontSize: '0.82rem' }} />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <select value={editFamilleFilter}
                            onChange={(e) => { setEditFamilleFilter(e.target.value); setEditCatFilter(''); setEditIngVisible(20); }}
                            style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.8rem', background: editFamilleFilter ? '#eff6ff' : '#fff', color: '#374151', cursor: 'pointer' }}>
                            <option value="">Toutes les familles</option>
                            {eFamOptions.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                          </select>
                          <select value={editCatFilter}
                            onChange={(e) => { setEditCatFilter(e.target.value); setEditIngVisible(20); }}
                            style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.8rem', background: editCatFilter ? '#eff6ff' : '#fff', color: '#374151', cursor: 'pointer' }}>
                            <option value="">Toutes les catégories</option>
                            {eFilteredCats.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                          </select>
                        </div>
                        <div
                          style={{ height: 210, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, border: '1px solid var(--border)', borderRadius: 10, padding: '6px' }}
                          onScroll={(e) => {
                            const el = e.currentTarget;
                            if (el.scrollHeight - el.scrollTop - el.clientHeight < 60) setEditIngVisible((v) => v + 20);
                          }}
                        >
                          {editLoadingData && (
                            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0', fontSize: '0.85rem' }}>⏳ Chargement des articles…</div>
                          )}
                          {!editLoadingData && eArticlesFiltered.length === 0 && (
                            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0', fontSize: '0.85rem' }}>Aucun article trouvé</div>
                          )}
                          {!editLoadingData && eArticlesFiltered.slice(0, editIngVisible).map((ing) => {
                            const sid = String(ing.id);
                            const sel = editIngIds.has(sid);
                            const line = editIngLines.find((l) => l.ingredientId === sid);
                            const portionValid = sel && parseFloat(line?.portion || '0') > 0;
                            return (
                              <div key={ing.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 8, background: sel ? (portionValid ? '#eff6ff' : '#fef3c7') : 'transparent', cursor: 'pointer', transition: 'background 0.12s' }}
                                onClick={() => editToggleIng(ing)}>
                                <input type="checkbox" checked={sel} onChange={() => editToggleIng(ing)}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ accentColor: '#3b82f6', width: 15, height: 15, flexShrink: 0, cursor: 'pointer' }} />
                                <span style={{ flex: 1, fontSize: '0.84rem', fontWeight: sel ? 600 : 400, color: sel ? '#1e40af' : '#374151' }}>{ing.nom}</span>
                                {ing.categorie && (
                                  <span style={{ fontSize: '0.68rem', color: '#64748b', background: '#f1f5f9', borderRadius: 6, padding: '1px 6px', flexShrink: 0 }}>{ing.categorie}</span>
                                )}
                                {sel && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                                    <input type="number" step="0.001" min="0" placeholder="portion"
                                      value={line?.portion || ''}
                                      onChange={(e) => editUpdatePortion(sid, e.target.value)}
                                      style={{ width: 72, padding: '3px 6px', borderRadius: 6, border: `1.5px solid ${portionValid ? '#93c5fd' : '#ef4444'}`, fontSize: '0.82rem', textAlign: 'right' }} />
                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{ing.unite}</span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {eArticlesFiltered.length > editIngVisible && (
                            <div style={{ textAlign: 'center', padding: '8px 0', fontSize: '0.73rem', color: '#94a3b8' }}>
                              ↓ {eArticlesFiltered.length - editIngVisible} article{eArticlesFiltered.length - editIngVisible > 1 ? 's' : ''} de plus — faites défiler
                            </div>
                          )}
                        </div>
                        {editIngLines.some((l) => l.ingredientId) && (
                          <div style={{ fontSize: '0.78rem', color: '#3b82f6', fontWeight: 600 }}>
                            {editIngLines.filter((l) => l.ingredientId && parseFloat(l.portion) > 0).length} article{editIngLines.filter((l) => l.ingredientId && parseFloat(l.portion) > 0).length !== 1 ? 's' : ''} valide{editIngLines.filter((l) => l.ingredientId && parseFloat(l.portion) > 0).length !== 1 ? 's' : ''} (portion &gt; 0)
                          </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4 }}>
                          <button className="btn btn-ghost" onClick={() => setEditModal(null)}>Annuler</button>
                          <button disabled={editLoadingData}
                            onClick={() => setEditModal(3)}
                            style={{ background: !editLoadingData ? 'linear-gradient(135deg, #1e40af, #3b82f6)' : '#e5e7eb', border: 'none', borderRadius: 10, color: !editLoadingData ? '#fff' : '#9ca3af', fontWeight: 700, padding: '9px 22px', cursor: !editLoadingData ? 'pointer' : 'not-allowed' }}>
                            Suivant →
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Step 3 — Produits Utilisables */}
                    {editModal === 3 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
                          Ajoutez des produits utilisables de <strong>{editActiviteNom || 'cette activité'}</strong> comme sous-composants. Au moins 1 article ou produit utilisable requis.
                        </div>
                        {utilisableForWizard.length === 0 ? (
                          <div style={{ padding: 16, borderRadius: 8, background: '#faf5ff', border: '1px solid #ede9fe', fontSize: '0.85rem', color: '#5b21b6', textAlign: 'center' }}>
                            Aucun produit utilisable disponible pour cette activité.
                          </div>
                        ) : (
                          <>
                            <input className="input" placeholder="🔍 Rechercher un produit transformé…" value={editSubSearch}
                              onChange={(e) => setEditSubSearch(e.target.value)}
                              style={{ fontSize: '0.82rem' }} />
                            <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, border: '1px solid #ede9fe', borderRadius: 10, padding: '6px', background: '#faf5ff' }}>
                              {utilisableForWizard
                                .filter(u => !editSubSearch || u.name.toLowerCase().includes(editSubSearch.toLowerCase()))
                                .map((u) => {
                                  const sid = String(u.id);
                                  const sel = editSubIds.has(sid);
                                  const line = editSubLines.find(l => l.ingredientId === sid);
                                  const portionValid = sel && parseFloat(line?.portion || '0') > 0;
                                  return (
                                    <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 8, background: sel ? (portionValid ? '#f3e8ff' : '#fef3c7') : 'transparent', cursor: 'pointer', transition: 'background 0.12s' }}
                                      onClick={() => editToggleSub(u.id)}>
                                      <input type="checkbox" checked={sel} onChange={() => editToggleSub(u.id)}
                                        onClick={(e) => e.stopPropagation()}
                                        style={{ accentColor: '#7c3aed', width: 15, height: 15, flexShrink: 0, cursor: 'pointer' }} />
                                      <span style={{ flex: 1, fontSize: '0.84rem', fontWeight: sel ? 600 : 400, color: sel ? '#5b21b6' : '#374151' }}>{u.name}</span>
                                      {sel && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                                          <input type="number" step="0.001" min="0" placeholder="portion"
                                            value={line?.portion || ''}
                                            onChange={(e) => editUpdateSubPortion(sid, e.target.value)}
                                            style={{ width: 72, padding: '3px 6px', borderRadius: 6, border: `1.5px solid ${portionValid ? '#c4b5fd' : '#ef4444'}`, fontSize: '0.82rem', textAlign: 'right' }} />
                                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>unité</span>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                            </div>
                            {editSubLines.some(l => l.ingredientId && parseFloat(l.portion) > 0) && (
                              <div style={{ fontSize: '0.78rem', color: '#7c3aed', fontWeight: 600 }}>
                                {editSubLines.filter(l => l.ingredientId && parseFloat(l.portion) > 0).length} produit(s) utilisable(s) sélectionné(s)
                              </div>
                            )}
                          </>
                        )}
                        {(() => {
                          const editTotalValid = editIngLines.filter(l => l.ingredientId && parseFloat(l.portion) > 0).length + editSubLines.filter(l => l.ingredientId && parseFloat(l.portion) > 0).length;
                          const canNext = editTotalValid > 0;
                          return (
                            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8 }}>
                              <button className="btn btn-ghost" onClick={() => setEditModal(2)}>← Retour</button>
                              <button disabled={!canNext} onClick={() => setEditModal(5)}
                                style={{ background: canNext ? 'linear-gradient(135deg, #1e40af, #3b82f6)' : '#e5e7eb', border: 'none', borderRadius: 10, color: canNext ? '#fff' : '#9ca3af', fontWeight: 700, padding: '9px 22px', cursor: canNext ? 'pointer' : 'not-allowed' }}
                                title={!canNext ? 'Ajoutez au moins 1 article ou produit utilisable' : undefined}>
                                Suivant →
                              </button>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {/* Step 4 — Affectation aux stocks (utilisable only) */}
                    {editModal === 4 && !isEditVendable && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
                          Gérez les activités où ce produit est disponible en stock.
                        </div>
                        {allActivities.length === 0 ? (
                          <div style={{ padding: 16, background: '#f8fafc', borderRadius: 8, fontSize: '0.85rem', color: '#64748b', textAlign: 'center' }}>
                            Aucune activité disponible.
                          </div>
                        ) : (
                          <>
                            <button type="button"
                              onClick={() => setEditAffectationIds(editAffectationIds.length === allActivities.length ? [] : allActivities.map(a => a.id))}
                              style={{ alignSelf: 'flex-start', background: 'transparent', border: '1.5px solid #3b82f6', borderRadius: 8, color: '#3b82f6', fontWeight: 700, padding: '5px 14px', cursor: 'pointer', fontSize: '0.8rem' }}>
                              {editAffectationIds.length === allActivities.length ? '☐ Tout désélectionner' : '☑ Tout sélectionner'}
                            </button>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                              {allActivities.map(a => {
                                const checked = editAffectationIds.includes(a.id);
                                return (
                                  <div key={a.id}
                                    onClick={() => setEditAffectationIds(prev => checked ? prev.filter(id => id !== a.id) : [...prev, a.id])}
                                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, cursor: 'pointer', background: checked ? '#eff6ff' : '#f8fafc', border: `1.5px solid ${checked ? '#93c5fd' : '#e2e8f0'}`, transition: 'all 0.12s' }}>
                                    <input type="checkbox" checked={checked} readOnly
                                      style={{ accentColor: '#3b82f6', width: 16, height: 16, flexShrink: 0, cursor: 'pointer' }} />
                                    <div style={{ flex: 1 }}>
                                      <div style={{ fontWeight: 600, fontSize: '0.88rem', color: checked ? '#1e40af' : '#374151' }}>{a.nom}</div>
                                      {(a as any).laboNom && <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 1 }}>🏭 Labo : {(a as any).laboNom}</div>}
                                    </div>
                                    {checked && <span style={{ color: '#3b82f6', fontSize: '0.9rem' }}>✓</span>}
                                  </div>
                                );
                              })}
                            </div>
                            {editAffectationIds.length > 0 && (
                              <div style={{ fontSize: '0.78rem', color: '#3b82f6', fontWeight: 600 }}>
                                {editAffectationIds.length} activité{editAffectationIds.length > 1 ? 's' : ''} sélectionnée{editAffectationIds.length > 1 ? 's' : ''}
                              </div>
                            )}
                          </>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8 }}>
                          <button className="btn btn-ghost" onClick={() => setEditModal(3)}>← Retour</button>
                          <button onClick={() => setEditModal(5)}
                            style={{ background: 'linear-gradient(135deg, #1e40af, #3b82f6)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, padding: '9px 22px', cursor: 'pointer' }}>
                            Suivant →
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Step 5 — Récap & Confirmation */}
                    {editModal === 5 && (() => {
                      const ingCount = editIngLines.filter((l) => l.ingredientId && parseFloat(l.portion) > 0).length;
                      const subCount = editSubLines.filter((l) => l.ingredientId && parseFloat(l.portion) > 0).length;
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                          <div style={{ background: 'linear-gradient(135deg,#eff6ff,#dbeafe)', border: '1.5px solid #93c5fd', borderRadius: 14, padding: '16px 18px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                              <div style={{ width: 42, height: 42, borderRadius: 10, background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', flexShrink: 0 }}>📦</div>
                              <div>
                                <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#1e40af' }}>{editName}</div>
                                {editRef && <div style={{ fontSize: '0.75rem', color: '#3b82f6', marginTop: 1 }}>Réf : {editRef}</div>}
                              </div>
                              <div style={{ marginLeft: 'auto', background: '#3b82f6', color: '#fff', borderRadius: 20, padding: '3px 10px', fontSize: '0.72rem', fontWeight: 700 }}>
                                {isEditVendable ? 'Vendable' : 'Utilisable'}{editIsSupplement ? ' · Suppl.' : ''}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <div style={{ background: 'rgba(255,255,255,0.6)', borderRadius: 8, padding: '8px 10px', textAlign: 'center', minWidth: 70 }}>
                                <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#1e40af' }}>{ingCount}</div>
                                <div style={{ fontSize: '0.7rem', color: '#3b82f6' }}>article{ingCount !== 1 ? 's' : ''}</div>
                              </div>
                              {subCount > 0 && (
                                <div style={{ background: 'rgba(255,255,255,0.6)', borderRadius: 8, padding: '8px 10px', textAlign: 'center', minWidth: 70 }}>
                                  <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#5b21b6' }}>{subCount}</div>
                                  <div style={{ fontSize: '0.7rem', color: '#7c3aed' }}>transformé{subCount !== 1 ? 's' : ''}</div>
                                </div>
                              )}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Articles sélectionnés</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
                              {editIngLines.filter((l) => l.ingredientId && parseFloat(l.portion) > 0).map((l) => {
                                const ing = editIngredients.find((i) => String(i.id) === l.ingredientId);
                                return (
                                  <div key={l.ingredientId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 10px', borderRadius: 7, background: '#f8fafc', fontSize: '0.82rem' }}>
                                    <span style={{ color: '#374151', fontWeight: 500 }}>{ing?.nom ?? l.ingredientId}</span>
                                    <span style={{ color: '#64748b', fontWeight: 600 }}>{l.portion} {ing?.unite}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          {subCount > 0 && (
                            <div>
                              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#7c3aed', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>🔄 Produits transformés</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 120, overflowY: 'auto' }}>
                                {editSubLines.filter((l) => l.ingredientId && parseFloat(l.portion) > 0).map((l) => {
                                  const sp = utilisableForWizard.find((u) => String(u.id) === l.ingredientId);
                                  return (
                                    <div key={l.ingredientId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 10px', borderRadius: 7, background: '#faf5ff', fontSize: '0.82rem', border: '1px solid #ede9fe' }}>
                                      <span style={{ color: '#5b21b6', fontWeight: 500 }}>🔄 {sp?.name ?? l.ingredientId}</span>
                                      <span style={{ color: '#7c3aed', fontWeight: 600 }}>{l.portion} unité</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4, borderTop: '1px solid var(--border)' }}>
                            <button className="btn btn-ghost" onClick={() => setEditModal(3)}>← Retour</button>
                            <button disabled={editSaving}
                              onClick={handleEditSave}
                              style={{ background: 'linear-gradient(135deg, #1e40af, #3b82f6)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, padding: '10px 28px', cursor: editSaving ? 'not-allowed' : 'pointer', opacity: editSaving ? 0.7 : 1, fontSize: '0.9rem' }}>
                              {editSaving ? 'Enregistrement…' : 'Enregistrer les modifications ✓'}
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                  </div>
                </div>
              </div>
            );
          })()}

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

            const addSubIds = new Set(addSubLines.map((l) => l.ingredientId).filter(Boolean));
            const toggleSub = (id: number) => {
              const sid = String(id);
              if (addSubIds.has(sid)) setAddSubLines((prev) => prev.filter((l) => l.ingredientId !== sid));
              else setAddSubLines((prev) => [...prev, { ingredientId: sid, portion: '' }]);
            };
            const updateSubPortion = (id: string, val: string) =>
              setAddSubLines((prev) => prev.map((l) => l.ingredientId === id ? { ...l, portion: val } : l));

            const canGoStep2 = addName.trim().length > 0;
            const canGoStep3 = addIngLines.some((l) => l.ingredientId && parseFloat(l.portion) > 0) || addSubLines.some((l) => l.ingredientId && parseFloat(l.portion) > 0);
            const handleSave = async () => {
              setAddSaving(true);
              setAddSaveError(null);
              try {
                const baseIngredients = addIngLines
                  .filter((l) => l.ingredientId && parseFloat(l.portion) > 0)
                  .map((l) => ({ ingredientId: parseInt(l.ingredientId), portion: parseFloat(l.portion) }));
                const baseSubProducts = addSubLines
                  .filter((l) => l.ingredientId && parseFloat(l.portion) > 0)
                  .map((l) => ({ subProductId: parseInt(l.ingredientId), portion: parseFloat(l.portion) }));
                const { data: newProd } = await api.post('/api/products', {
                  name: addName.trim(),
                  refProduit: addRef.trim() || null,
                  type: tab === 'utilisable' ? 'utilisable' : 'vendable',
                  isSupplement: addIsSupplement,
                  activiteId: isVendable ? (selectedActiviteId ?? null) : (addAffectationIds[0] ?? null),
                  ingredients: baseIngredients,
                  subProducts: baseSubProducts,
                });
                // Assign utilisable product to selected activités' stocks
                if (!isVendable) {
                  for (const actId of addAffectationIds) {
                    await api.post(`/api/produits/${(newProd as { id: number }).id}/toggle-stock-ingredient`, { activiteId: actId });
                  }
                }
                setAddSavedName(addName.trim());
                setAddModal(6);
                // Reload with current activiteId so the new product appears immediately
                const reloadParams = new URLSearchParams();
                if (laboId) reloadParams.set('laboId', laboId);
                if (selectedActiviteId) reloadParams.set('activiteId', String(selectedActiviteId));
                const reloadQs = reloadParams.toString();
                api.get(`/api/products${reloadQs ? `?${reloadQs}` : ''}`).then(({ data }) => setProducts(data as Product[]));
              } catch (err: unknown) {
                const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
                setAddSaveError(msg || 'Erreur lors de la création du produit.');
              }
              setAddSaving(false);
            };

            const STEPS = isVendable
              ? [{ n: 1, d: 1, label: 'Identité' }, { n: 2, d: 2, label: 'Articles' }, { n: 3, d: 3, label: 'Produits Utilisables' }, { n: 5, d: 4, label: 'Récap' }]
              : [{ n: 1, d: 1, label: 'Identité' }, { n: 2, d: 2, label: 'Articles' }, { n: 3, d: 3, label: 'Produits Utilisables' }, { n: 4, d: 4, label: 'Affectation' }, { n: 5, d: 5, label: 'Récap' }];

            return (
              <div className="modal-overlay">
                <div className="modal" style={{ maxWidth: 560, width: '95vw', maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
                  {/* Header */}
                  <div style={{ background: 'linear-gradient(135deg, #0a1628 0%, #0f2847 100%)', padding: '18px 22px 14px', borderRadius: '12px 12px 0 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: '#fff', fontWeight: 800, fontSize: '1rem', marginBottom: addModal !== 6 ? 12 : 0 }}>
                        {addModal === 6 ? '✅ Produit créé' : `Nouveau ${isVendable ? 'produit vendable' : 'produit utilisable'}`}
                      </div>
                      {addModal !== 6 && (
                        <div style={{ display: 'flex', gap: 10, width: '100%' }}>
                          {STEPS.map((s) => (
                            <div key={s.n} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <div style={{ height: 4, borderRadius: 4, background: s.n <= addModal ? '#fff' : 'rgba(255,255,255,0.28)', transition: 'background 0.2s' }} />
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <div style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, background: s.n <= addModal ? '#fff' : 'rgba(255,255,255,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.62rem', fontWeight: 800, color: s.n <= addModal ? '#059669' : 'rgba(255,255,255,0.55)' }}>
                                  {s.n < addModal ? '✓' : s.d}
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
                          <label style={{ display: 'block', fontWeight: 700, fontSize: '0.82rem', color: '#065f46', marginBottom: 6 }}>
                            Nom du produit <span style={{ color: '#ef4444' }}>*</span>
                          </label>
                          <input className="input" placeholder="Ex. Burger Classic, Pizza Margherita…" value={addName}
                            onChange={(e) => setAddName(e.target.value)} autoFocus
                            style={{ width: '100%', borderColor: '#6ee7b7' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontWeight: 700, fontSize: '0.82rem', color: '#065f46', marginBottom: 6 }}>
                            Réf. produit <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)' }}>(optionnel)</span>
                          </label>
                          <input className="input" placeholder="Ex. BRG-001" value={addRef}
                            onChange={(e) => setAddRef(e.target.value)}
                            style={{ width: '100%', maxWidth: 280, borderColor: '#6ee7b7' }} />
                        </div>
                        {isVendable && (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: addIsSupplement ? '#fffbeb' : '#f9fafb', borderRadius: 10, padding: '12px 16px', border: `1.5px solid ${addIsSupplement ? '#fcd34d' : 'var(--border)'}` }}>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: '0.88rem', color: addIsSupplement ? '#92400e' : 'var(--text)' }}>Supplément</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>Un supplément ne contient qu'un seul ingrédient</div>
                            </div>
                            <button type="button"
                              onClick={() => setAddIsSupplement((v) => !v)}
                              style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: addIsSupplement ? '#d97706' : '#d1d5db', transition: 'background 0.2s', position: 'relative', flexShrink: 0 }}>
                              <span style={{ position: 'absolute', top: 3, left: addIsSupplement ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                            </button>
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 8 }}>
                          <button className="btn btn-ghost" onClick={() => setAddModal(null)}>Annuler</button>
                          <button disabled={!canGoStep2}
                            onClick={() => setAddModal(2)}
                            style={{ background: canGoStep2 ? 'linear-gradient(135deg, #047857, #059669)' : '#e5e7eb', border: 'none', borderRadius: 10, color: canGoStep2 ? '#fff' : '#9ca3af', fontWeight: 700, padding: '9px 22px', cursor: canGoStep2 ? 'pointer' : 'not-allowed' }}>
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
                                <div key={ing.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 8, background: sel ? (portionValid ? '#ecfdf5' : '#fef3c7') : 'transparent', cursor: 'pointer', transition: 'background 0.12s' }}
                                  onClick={() => toggleIngredient(ing)}>
                                  <input type="checkbox" checked={sel} onChange={() => toggleIngredient(ing)}
                                    onClick={e => e.stopPropagation()}
                                    style={{ accentColor: '#059669', width: 15, height: 15, flexShrink: 0, cursor: 'pointer' }} />
                                  <span style={{ flex: 1, fontSize: '0.84rem', fontWeight: sel ? 600 : 400, color: sel ? '#065f46' : '#374151' }}>{ing.nom}</span>
                                  {ing.categorie && (
                                    <span style={{ fontSize: '0.68rem', color: '#64748b', background: '#f1f5f9', borderRadius: 6, padding: '1px 6px', flexShrink: 0 }}>{ing.categorie}</span>
                                  )}
                                  {sel && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                                      <input type="number" step="0.001" min="0" placeholder="portion"
                                        value={line?.portion || ''}
                                        onChange={(e) => updatePortion(sid, e.target.value)}
                                        style={{ width: 72, padding: '3px 6px', borderRadius: 6, border: `1.5px solid ${portionValid ? '#6ee7b7' : '#ef4444'}`, fontSize: '0.82rem', textAlign: 'right' }} />
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
                            <div style={{ fontSize: '0.78rem', color: '#059669', fontWeight: 600 }}>
                              {addIngLines.filter(l => l.ingredientId && parseFloat(l.portion) > 0).length} article{addIngLines.filter(l => l.ingredientId && parseFloat(l.portion) > 0).length !== 1 ? 's' : ''} valide{addIngLines.filter(l => l.ingredientId && parseFloat(l.portion) > 0).length !== 1 ? 's' : ''} (portion &gt; 0)
                            </div>
                          )}

                          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4 }}>
                            <button className="btn btn-ghost" onClick={() => setAddModal(1)}>← Retour</button>
                            <button onClick={() => setAddModal(3)}
                              style={{ background: 'linear-gradient(135deg, #047857, #059669)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, padding: '9px 22px', cursor: 'pointer' }}>
                              Suivant →
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Step 3 — Produits Utilisables */}
                    {addModal === 3 && (() => {
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
                            Ajoutez des produits utilisables comme sous-composants de ce produit. Au moins 1 article ou produit utilisable requis.
                          </div>
                          {utilisableForWizard.length === 0 ? (
                            <div style={{ padding: 16, borderRadius: 8, background: '#faf5ff', border: '1px solid #ede9fe', fontSize: '0.85rem', color: '#5b21b6', textAlign: 'center' }}>
                              Aucun produit utilisable disponible.
                            </div>
                          ) : (
                            <>
                              <input className="input" placeholder="🔍 Rechercher un produit transformé…" value={addSubSearch}
                                onChange={(e) => setAddSubSearch(e.target.value)}
                                style={{ fontSize: '0.82rem' }} />
                              <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, border: '1px solid #ede9fe', borderRadius: 10, padding: '6px', background: '#faf5ff' }}>
                                {utilisableForWizard
                                  .filter(u => !addSubSearch || u.name.toLowerCase().includes(addSubSearch.toLowerCase()))
                                  .map((u) => {
                                    const sid = String(u.id);
                                    const sel = addSubIds.has(sid);
                                    const line = addSubLines.find(l => l.ingredientId === sid);
                                    const portionValid = sel && parseFloat(line?.portion || '0') > 0;
                                    return (
                                      <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 8, background: sel ? (portionValid ? '#f3e8ff' : '#fef3c7') : 'transparent', cursor: 'pointer', transition: 'background 0.12s' }}
                                        onClick={() => toggleSub(u.id)}>
                                        <input type="checkbox" checked={sel} onChange={() => toggleSub(u.id)}
                                          onClick={e => e.stopPropagation()}
                                          style={{ accentColor: '#7c3aed', width: 15, height: 15, flexShrink: 0, cursor: 'pointer' }} />
                                        <span style={{ flex: 1, fontSize: '0.84rem', fontWeight: sel ? 600 : 400, color: sel ? '#5b21b6' : '#374151' }}>{u.name}</span>
                                        {sel && (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                                            <input type="number" step="0.001" min="0" placeholder="portion"
                                              value={line?.portion || ''}
                                              onChange={(e) => updateSubPortion(sid, e.target.value)}
                                              style={{ width: 72, padding: '3px 6px', borderRadius: 6, border: `1.5px solid ${portionValid ? '#c4b5fd' : '#ef4444'}`, fontSize: '0.82rem', textAlign: 'right' }} />
                                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>unité</span>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                              </div>
                              {addSubLines.some(l => l.ingredientId && parseFloat(l.portion) > 0) && (
                                <div style={{ fontSize: '0.78rem', color: '#7c3aed', fontWeight: 600 }}>
                                  {addSubLines.filter(l => l.ingredientId && parseFloat(l.portion) > 0).length} produit(s) utilisable(s) sélectionné(s)
                                </div>
                              )}
                            </>
                          )}
                          {(() => {
                            const addTotalValid = addIngLines.filter(l => l.ingredientId && parseFloat(l.portion) > 0).length + addSubLines.filter(l => l.ingredientId && parseFloat(l.portion) > 0).length;
                            const canNext = addTotalValid > 0;
                            return (
                              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8 }}>
                                <button className="btn btn-ghost" onClick={() => setAddModal(2)}>← Retour</button>
                                <button disabled={!canNext} onClick={() => setAddModal(isVendable ? 5 : 4)}
                                  style={{ background: canNext ? 'linear-gradient(135deg, #047857, #059669)' : '#e5e7eb', border: 'none', borderRadius: 10, color: canNext ? '#fff' : '#9ca3af', fontWeight: 700, padding: '9px 22px', cursor: canNext ? 'pointer' : 'not-allowed' }}
                                  title={!canNext ? 'Ajoutez au moins 1 article ou produit utilisable' : undefined}>
                                  Suivant →
                                </button>
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })()}

                    {/* Step 4 — Affectation aux stocks (utilisable only) */}
                    {addModal === 4 && !isVendable && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
                          Sélectionnez les activités où ce produit sera disponible en stock. <strong style={{ color: '#ef4444' }}>Au moins 1 activité requise.</strong>
                        </div>
                        {allActivities.length === 0 ? (
                          <div style={{ padding: 16, background: '#f8fafc', borderRadius: 8, fontSize: '0.85rem', color: '#64748b', textAlign: 'center' }}>
                            Aucune activité disponible.
                          </div>
                        ) : (
                          <>
                            <button type="button"
                              onClick={() => setAddAffectationIds(addAffectationIds.length === allActivities.length ? [] : allActivities.map(a => a.id))}
                              style={{ alignSelf: 'flex-start', background: 'transparent', border: '1.5px solid #059669', borderRadius: 8, color: '#059669', fontWeight: 700, padding: '5px 14px', cursor: 'pointer', fontSize: '0.8rem' }}>
                              {addAffectationIds.length === allActivities.length ? '☐ Tout désélectionner' : '☑ Tout sélectionner'}
                            </button>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                              {allActivities.map(a => {
                                const checked = addAffectationIds.includes(a.id);
                                return (
                                  <div key={a.id}
                                    onClick={() => setAddAffectationIds(prev => checked ? prev.filter(id => id !== a.id) : [...prev, a.id])}
                                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, cursor: 'pointer', background: checked ? '#f0fdf4' : '#f8fafc', border: `1.5px solid ${checked ? '#6ee7b7' : '#e2e8f0'}`, transition: 'all 0.12s' }}>
                                    <input type="checkbox" checked={checked} readOnly
                                      style={{ accentColor: '#059669', width: 16, height: 16, flexShrink: 0, cursor: 'pointer' }} />
                                    <div style={{ flex: 1 }}>
                                      <div style={{ fontWeight: 600, fontSize: '0.88rem', color: checked ? '#065f46' : '#374151' }}>{a.nom}</div>
                                      {(a as any).laboNom && <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 1 }}>🏭 Labo : {(a as any).laboNom}</div>}
                                    </div>
                                    {checked && <span style={{ color: '#059669', fontSize: '0.9rem' }}>✓</span>}
                                  </div>
                                );
                              })}
                            </div>
                            {addAffectationIds.length > 0 && (
                              <div style={{ fontSize: '0.78rem', color: '#059669', fontWeight: 600 }}>
                                {addAffectationIds.length} activité{addAffectationIds.length > 1 ? 's' : ''} sélectionnée{addAffectationIds.length > 1 ? 's' : ''}
                              </div>
                            )}
                          </>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8 }}>
                          <button className="btn btn-ghost" onClick={() => setAddModal(3)}>← Retour</button>
                          <button disabled={addAffectationIds.length === 0} onClick={() => setAddModal(5)}
                            style={{ background: addAffectationIds.length > 0 ? 'linear-gradient(135deg, #047857, #059669)' : '#e5e7eb', border: 'none', borderRadius: 10, color: addAffectationIds.length > 0 ? '#fff' : '#9ca3af', fontWeight: 700, padding: '9px 22px', cursor: addAffectationIds.length > 0 ? 'pointer' : 'not-allowed' }}>
                            Suivant →
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Step 5 — Récap & Confirmation */}
                    {addModal === 5 && (() => {
                      const ingCount = addIngLines.filter(l => l.ingredientId && parseFloat(l.portion) > 0).length;
                      const subCount = addSubLines.filter(l => l.ingredientId && parseFloat(l.portion) > 0).length;
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                          {/* Product identity card */}
                          <div style={{ background: 'linear-gradient(135deg,#f0fdf4,#d1fae5)', border: '1.5px solid #a7f3d0', borderRadius: 14, padding: '16px 18px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                              <div style={{ width: 42, height: 42, borderRadius: 10, background: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', flexShrink: 0 }}>📦</div>
                              <div>
                                <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#065f46' }}>{addName}</div>
                                {addRef && <div style={{ fontSize: '0.75rem', color: '#059669', marginTop: 1 }}>Réf : {addRef}</div>}
                              </div>
                              <div style={{ marginLeft: 'auto', background: '#059669', color: '#fff', borderRadius: 20, padding: '3px 10px', fontSize: '0.72rem', fontWeight: 700 }}>
                                {isVendable ? 'Vendable' : 'Utilisable'}{addIsSupplement ? ' · Suppl.' : ''}
                              </div>
                            </div>
                            {/* Stats row */}
                            <div style={{ display: 'flex', gap: 10 }}>
                              <div style={{ flex: 1, background: 'rgba(255,255,255,0.6)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                                <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#065f46' }}>{ingCount}</div>
                                <div style={{ fontSize: '0.7rem', color: '#059669' }}>article{ingCount !== 1 ? 's' : ''}</div>
                              </div>
                              {subCount > 0 && (
                                <div style={{ flex: 1, background: 'rgba(255,255,255,0.6)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                                  <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#5b21b6' }}>{subCount}</div>
                                  <div style={{ fontSize: '0.7rem', color: '#7c3aed' }}>transformé{subCount !== 1 ? 's' : ''}</div>
                                </div>
                              )}
                            </div>
                          </div>
                          {/* Articles list preview */}
                          <div>
                            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Articles sélectionnés</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 110, overflowY: 'auto' }}>
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
                          {/* Sub-products list preview */}
                          {subCount > 0 && (
                            <div>
                              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#7c3aed', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>🔄 Produits transformés</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 110, overflowY: 'auto' }}>
                                {addSubLines.filter(l => l.ingredientId && parseFloat(l.portion) > 0).map(l => {
                                  const sp = utilisableForWizard.find(u => String(u.id) === l.ingredientId);
                                  return (
                                    <div key={l.ingredientId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 10px', borderRadius: 7, background: '#faf5ff', border: '1px solid #ede9fe', fontSize: '0.82rem' }}>
                                      <span style={{ color: '#5b21b6', fontWeight: 500 }}>🔄 {sp?.name ?? l.ingredientId}</span>
                                      <span style={{ color: '#7c3aed', fontWeight: 600 }}>{l.portion} unité</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          {!isVendable && addAffectationIds.length > 0 && (
                            <div>
                              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>📍 Stocks activés</div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {addAffectationIds.map(id => {
                                  const act = allActivities.find(a => a.id === id);
                                  return act ? (
                                    <span key={id} style={{ background: '#f0fdf4', border: '1px solid #a7f3d0', borderRadius: 20, padding: '3px 10px', fontSize: '0.78rem', color: '#065f46', fontWeight: 600 }}>{act.nom}</span>
                                  ) : null;
                                })}
                              </div>
                            </div>
                          )}
                          {addSaveError && (
                            <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 8, padding: '10px 14px', color: '#b91c1c', fontWeight: 700, fontSize: '0.85rem' }}>
                              ⛔ {addSaveError}
                            </div>
                          )}
                          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4, borderTop: '1px solid var(--border)' }}>
                            <button className="btn btn-ghost" onClick={() => setAddModal(isVendable ? 3 : 4)}>← Retour</button>
                            <button disabled={addSaving}
                              onClick={handleSave}
                              style={{ background: 'linear-gradient(135deg, #047857, #059669)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, padding: '10px 28px', cursor: addSaving ? 'not-allowed' : 'pointer', opacity: addSaving ? 0.7 : 1, fontSize: '0.9rem' }}>
                              {addSaving ? 'Création…' : 'Créer le produit ✓'}
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Step 6 — Succès */}
                    {addModal === 6 && (
                      <div style={{ textAlign: 'center', padding: '16px 0 8px' }}>
                        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg, #22c55e, #16a34a)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem', margin: '0 auto 14px' }}>✓</div>
                        <div style={{ fontWeight: 700, fontSize: '1rem', color: '#166534', marginBottom: 6 }}>Produit créé avec succès</div>
                        <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: 22 }}>
                          <strong>{addSavedName}</strong> a été ajouté à votre liste.
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                          <button className="btn btn-ghost" onClick={() => setAddModal(null)}>Fermer</button>
                          <button onClick={openAddModal}
                            style={{ background: 'linear-gradient(135deg, #047857, #059669)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, padding: '9px 22px', cursor: 'pointer' }}>
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
