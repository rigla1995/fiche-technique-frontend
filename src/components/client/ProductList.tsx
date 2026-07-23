import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Product, Activite, ActiviteIngredient, CategorieProduit } from '../../types';
import FicheTechniqueModal from './FicheTechniqueModal';
import RecipeTree from './RecipeTree';
import ProductCard from './ProductCard';
import GuideButton from './GuideButton';
import HistoryFilterBar, { FilterField, FilterInput, FilterSelect } from '../common/HistoryFilterBar';

interface ProductDetail {
  ingredients: { ingredientName: string; portion: number; unitName: string; unitPrice: number; categorieName?: string | null }[];
  subProducts: { subProductName: string; portion: number; unitCost: number; totalLineCost: number }[];
  parentProducts?: { id: number; name: string; portion: number }[];
}

type PopupType = 'ingredients' | 'subProducts' | 'parentProducts' | null;
type TabType = 'vendable' | 'utilisable';

const PAGE_SIZE = 9;

const ExcelIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
    <rect width="24" height="24" rx="3" fill="#1D6F42"/>
    <path d="M7 7l3.5 5L7 17h2.5l2.5-3.5L14.5 17H17l-3.5-5L17 7h-2.5L12 10.5 9.5 7H7z" fill="white"/>
  </svg>
);

export default function ProductList() {
  const { t } = useTranslation();
  const { canWrite, user } = useAuth();
  const canWriteProducts = canWrite && user?.role !== 'gerant';

  const [searchParams] = useSearchParams();
  const tab = (searchParams.get('tab') as TabType) || 'vendable';
  const laboId = searchParams.get('laboId') || '';

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterActiviteId, setFilterActiviteId] = useState<number | null>(null);
  const [filterCategorieId, setFilterCategorieId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [deleteModal, setDeleteModal] = useState<{ product: Product; historyCount?: number } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [ftPopup, setFtPopup] = useState<{ productId: number; productName: string; hasIngredients: boolean; fallbackActId: number } | null>(null);

  const [popup, setPopup] = useState<{ type: PopupType; productId: number; productName: string } | null>(null);
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [allActivities, setAllActivities] = useState<Activite[]>([]);
  const [allLabos, setAllLabos] = useState<{ id: number; nom: string }[]>([]);
  const [exportingXls, setExportingXls] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportIncludeOther, setExportIncludeOther] = useState(false);

  // Add product modal state
  type AddStep = 1 | 2 | 3 | 4 | 5 | 6;
  interface IngLine { ingredientId: string; portion: string; }
  const [utilisableForWizard, setUtilisableForWizard] = useState<{ id: number; name: string }[]>([]);
  const [addModal, setAddModal] = useState<AddStep | null>(null);
  const [addName, setAddName] = useState('');
  const [addRef, setAddRef] = useState('');
  const [addIsSupplement, setAddIsSupplement] = useState(false);
  const [addCategorieId, setAddCategorieId] = useState('');
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

  // ÉDITION = même wizard que l'ajout (5 étapes), pré-rempli — editingId ≠ null.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [categoriesProduit, setCategoriesProduit] = useState<CategorieProduit[]>([]);

  const [addAffectationIds, setAddAffectationIds] = useState<number[]>([]);
  // Affectation au step 1 : mode (labo/activité) + (mode labo) activités liées cochées qui reçoivent le PT.
  const [addOrigine, setAddOrigine] = useState<'labo' | 'activite'>('activite');
  const [addCheckedActivites, setAddCheckedActivites] = useState<number[]>([]);
  // Mode APPROS LIBRES (PU) : labos cochés qui géreront aussi le produit (appro manuel labo).
  const [addCheckedLabos, setAddCheckedLabos] = useState<number[]>([]);
  // Vendable géré en STOCK (option, défaut décoché) : catégorie « Produits Transformés
  // Vendables », logique appros libres complète (manuel/transfert/perte/seuil/inventaire).
  const [addStockActif, setAddStockActif] = useState(false);
  const [vendableSubTab, setVendableSubTab] = useState<'produit' | 'supplement'>('produit');

  // Load activities (filtré au périmètre du gérant côté backend pour les gérants)
  useEffect(() => {
    api.get('/api/entreprise/activites')
      .then(({ data }) => {
        const all = data as Activite[];
        const scoped = laboId ? all.filter((a) => String((a as any).laboId) === laboId) : all;
        setAllActivities(scoped);
      });
    api.get('/api/labo')
      .then(({ data }) => setAllLabos((data as { id: number; nom: string }[]).map((l) => ({ id: l.id, nom: l.nom }))))
      .catch(() => setAllLabos([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role, laboId]);

  // Load product categories (for vendable/supplément mandatory selection)
  useEffect(() => {
    api.get('/api/categories-produit')
      .then(({ data }) => setCategoriesProduit(data as CategorieProduit[]))
      .catch(() => {});
  }, []);

  // Load all products (no activité filter — activités shown on each card)
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
  }, [laboId]);

  // Ouvre le wizard (celui de l'ajout) pré-rempli avec le produit : mêmes 5 étapes,
  // mêmes règles — la sauvegarde bascule en PUT quand editingId est renseigné.
  const openEditModal = useCallback(async (p: Product) => {
    setEditingId(p.id);
    setAddIsSupplement(p.isSupplement ?? false);
    setAddName(p.name); setAddRef(''); setAddCategorieId('');
    setAddIngLines([]); setAddSubLines([]); setAddSubSearch(''); setAddIngSearch('');
    setAddSavedName(''); setAddFamilleFilter(''); setAddCatFilter(''); setAddIngVisible(20);
    setAddIngredients([]); setUtilisableForWizard([]); // chargés réactivement selon le périmètre
    // Affectation ACTUELLE du produit (pas d'auto-sélection : on reflète l'existant)
    const origine: 'labo' | 'activite' = p.origine === 'labo' ? 'labo' : 'activite';
    setAddOrigine(origine);
    if (origine === 'labo') {
      skipAutoCheckRef.current = true; // conserver le sous-ensemble d'activités réellement affectées
      setAddAffectationIds((p.labos ?? []).map((l) => l.id));
      setAddCheckedActivites((p.activites ?? []).map((a) => a.id));
      setAddCheckedLabos([]);
    } else {
      setAddAffectationIds((p.activites ?? []).map((a) => a.id));
      setAddCheckedLabos((p.labos ?? []).map((l) => l.id));
      setAddCheckedActivites([]);
    }
    setAddModal(1);
    try {
      const { data } = await api.get(`/api/products/${p.id}`);
      const pdata = data as {
        name: string; refProduit?: string; isSupplement?: boolean; categorieProduitId?: number | null;
        laboIds?: number[]; activiteStockIds?: number[];
        ingredients: { ingredientId: number; portion: number }[];
        subProducts: { subProductId: number; portion: number }[];
      };
      setAddName(pdata.name);
      setAddRef(pdata.refProduit || '');
      setAddIsSupplement(pdata.isSupplement ?? p.isSupplement ?? false);
      setAddCategorieId(pdata.categorieProduitId ? String(pdata.categorieProduitId) : '');
      setAddIngLines(pdata.ingredients.map((i) => ({ ingredientId: String(i.ingredientId), portion: String(i.portion) })));
      setAddSubLines((pdata.subProducts || []).map((sp) => ({ ingredientId: String(sp.subProductId), portion: String(sp.portion) })));
      // Affectation depuis le détail si disponible (plus fiable que la card)
      if (origine === 'labo') {
        if (Array.isArray(pdata.laboIds) && pdata.laboIds.length > 0) {
          skipAutoCheckRef.current = true;
          setAddAffectationIds(pdata.laboIds);
        }
        if (Array.isArray(pdata.activiteStockIds)) setAddCheckedActivites(pdata.activiteStockIds);
      } else if (p.type === 'utilisable' && Array.isArray(pdata.activiteStockIds) && pdata.activiteStockIds.length > 0) {
        setAddAffectationIds(pdata.activiteStockIds);
      } else if (p.type === 'vendable') {
        // Vendable : géré en stock si des lignes de stock/labo existent (option du wizard)
        const sa = ((pdata.activiteStockIds?.length ?? 0) > 0) || ((pdata.laboIds?.length ?? 0) > 0);
        setAddStockActif(sa);
        if (Array.isArray(pdata.laboIds)) setAddCheckedLabos(pdata.laboIds);
      }
    } catch { /* le wizard reste utilisable avec les données de la card */ }
  }, []);

  const openAddModal = useCallback((isSupplement = false) => {
    setEditingId(null);
    setAddStockActif(false);
    setAddName(''); setAddRef(''); setAddIsSupplement(isSupplement); setAddCategorieId('');
    setAddIngLines([]); setAddSubLines([]); setAddSubSearch(''); setAddIngSearch('');
    setAddSavedName(''); setAddFamilleFilter(''); setAddCatFilter(''); setAddIngVisible(20);
    setAddOrigine('activite'); setAddCheckedActivites([]);
    // PU en mode appros libres : l'ENSEMBLE des activités ET des labos est AUTO-sélectionné
    // à l'ouverture — le client décoche pour exclure. (Vendables : sélection vide, inchangé.)
    if (tab === 'vendable') {
      setAddAffectationIds([]); setAddCheckedLabos([]);
    } else {
      setAddAffectationIds(allActivities.map((a) => a.id));
      setAddCheckedLabos(allLabos.map((l) => l.id));
    }
    setAddIngredients([]); setUtilisableForWizard([]); // chargés réactivement selon le périmètre (step 1)
    setAddModal(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, allActivities, allLabos]);

  // Mode labo : pré-coche toutes les activités rattachées aux labos choisis (décochables au step 1).
  // skipAutoCheckRef : à l'ouverture en ÉDITION, on conserve le sous-ensemble réellement affecté
  // (l'auto-cochage ne rejoue que sur un changement de sélection par l'utilisateur).
  const skipAutoCheckRef = useRef(false);
  useEffect(() => {
    if (addOrigine !== 'labo') return;
    if (skipAutoCheckRef.current) { skipAutoCheckRef.current = false; return; }
    const linked = allActivities
      .filter((a) => a.laboId != null && addAffectationIds.includes(Number(a.laboId)))
      .map((a) => a.id);
    setAddCheckedActivites(linked);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addAffectationIds, addOrigine, allActivities]);

  // Charge articles consommables ET produits utilisables selon le périmètre choisi au step 1.
  // Origine labo → communs aux labos choisis ; origine activité → communs aux activités (+ PU des labos liés).
  useEffect(() => {
    if (addAffectationIds.length === 0) { setAddIngredients([]); setUtilisableForWizard([]); return; }
    const ids = addAffectationIds.join(',');
    const param = addOrigine === 'labo' ? 'laboIds' : 'activiteIds';
    const path = addOrigine === 'labo'
      ? '/api/labo/articles-consommables'
      : '/api/entreprise/activites/articles-consommables';
    api.get(`${path}?${param}=${ids}`)
      .then(({ data }) => setAddIngredients(data as ActiviteIngredient[]))
      .catch(() => setAddIngredients([]));
    api.get(`/api/produits/utilisables-perimetre?origine=${addOrigine}&ids=${ids}`)
      .then(({ data }) => setUtilisableForWizard(data as { id: number; name: string }[]))
      .catch(() => setUtilisableForWizard([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addAffectationIds, addOrigine]);

  const openPopup = async (type: PopupType, product: Product) => {
    setPopup({ type, productId: product.id, productName: product.name });
    setDetail(null);
    // « ingredients » / « subProducts » → la recette décomposée est chargée par <RecipeTree>.
    // Seul « parentProducts » (Utilisé dans) a besoin d'un fetch dédié ici.
    if (type !== 'parentProducts') return;
    setLoadingDetail(true);
    try {
      const { data } = await api.get(`/api/produits/${product.id}/parent-products`);
      setDetail({ ingredients: [], subProducts: [], parentProducts: data });
    } finally {
      setLoadingDetail(false);
    }
  };

  const closePopup = () => { setPopup(null); setDetail(null); };

  const handleDelete = async (product: Product) => {
    if (product.type === 'utilisable') {
      // Check PT history count
      let histCount = 0;
      try {
        const { data: hist } = await api.get(`/api/stock/pt/${product.id}/history`);
        histCount = Array.isArray(hist) ? hist.length : 0;
      } catch { /* ignore */ }
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
        await api.delete(`/api/produits/${product.id}/stock-pt-history`);
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

  const [togglingActivite, setTogglingActivite] = useState<string | null>(null); // "produitId-activiteId"

  const toggleActiviteAssignment = async (p: Product, activiteId: number) => {
    const key = `${p.id}-${activiteId}`;
    setTogglingActivite(key);
    try {
      const endpoint = p.type === 'vendable' ? 'toggle-affectation' : 'toggle-stock-ingredient';
      await api.post(`/api/produits/${p.id}/${endpoint}`, { activiteId });
      const currentlyAssigned = p.activites?.some((a) => a.id === activiteId) ?? false;
      setProducts((prev) => prev.map((prod) => {
        if (prod.id !== p.id) return prod;
        const newActivites = currentlyAssigned
          ? (prod.activites || []).filter((a) => a.id !== activiteId)
          : [...(prod.activites || []), allActivities.find((a) => a.id === activiteId)!].filter(Boolean);
        return { ...prod, activites: newActivites };
      }));
    } catch { /* ignore */ }
    setTogglingActivite(null);
  };

  const [togglingLabo, setTogglingLabo] = useState<string | null>(null); // "produitId-laboId"
  const toggleLaboAssignment = async (p: Product, laboId: number) => {
    setTogglingLabo(`${p.id}-${laboId}`);
    try {
      await api.post(`/api/produits/${p.id}/toggle-labo`, { laboId });
      const currentlyAssigned = p.labos?.some((l) => l.id === laboId) ?? false;
      setProducts((prev) => prev.map((prod) => {
        if (prod.id !== p.id) return prod;
        const newLabos = currentlyAssigned
          ? (prod.labos || []).filter((l) => l.id !== laboId)
          : [...(prod.labos || []), allLabos.find((l) => l.id === laboId)!].filter(Boolean);
        return { ...prod, labos: newLabos };
      }));
    } catch { /* ignore */ }
    setTogglingLabo(null);
  };

  // Onglet Vendables = produits d'activité ; les composés (origine labo) vivent dans Produits Valorisés.
  const byTab = products.filter((p) => p.type === tab && !(tab === 'vendable' && (p.origine ?? 'activite') === 'labo'));
  const byActivite = filterActiviteId
    ? byTab.filter((p) => p.activites?.some((a) => a.id === filterActiviteId) || p.activiteId === filterActiviteId)
    : byTab;
  const searchedAll = byActivite.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  const isVendable = tab === 'vendable';
  const searched = isVendable && filterCategorieId
    ? searchedAll.filter((p) => p.categorieProduitId === filterCategorieId)
    : searchedAll;
  const bySubTab = isVendable
    ? searched.filter((p) => vendableSubTab === 'produit' ? !p.isSupplement : !!p.isSupplement)
    : searched;
  const totalPages = Math.max(1, Math.ceil(bySubTab.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = bySubTab.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const getProductResolvedActId = (p: Product): number => {
    return p.activiteId || 0;
  };

  const handleExportXls = async (withOtherSubTab = false) => {
    setExportingXls(true);
    try {
      const params = new URLSearchParams({ type: tab });
      if (filterActiviteId) params.set('activiteId', String(filterActiviteId));
      if (search) params.set('search', search);
      if (tab === 'vendable') params.set('isSupplement', vendableSubTab === 'supplement' ? 'true' : 'false');
      if (withOtherSubTab) params.set('withOtherSubTab', 'true');
      const resp = await api.get(`/api/produits/export-list?${params}`, { responseType: 'blob' });
      const url = URL.createObjectURL(resp.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `labflow-${tab === 'vendable' ? vendableSubTab === 'supplement' ? 'supplements' : 'produits-vendables' : 'produits-utilisables'}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* silent */ }
    finally { setExportingXls(false); }
  };

  // Reusable action buttons for a product row
  const disabledStyle = !canWriteProducts ? { opacity: 0.4, cursor: 'not-allowed', pointerEvents: 'none' as const } : {};

  const renderActions = (p: Product) => (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center', width: '100%' }}>
      <button
        className="btn btn-ghost btn-sm"
        style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '5px 8px', borderRadius: 7, fontSize: '0.6rem', fontWeight: 600, color: '#374151', minWidth: 54, ...disabledStyle }}
        title="Générer la Fiche Technique"
        disabled={!canWriteProducts}
        onClick={() => {
          setFtPopup({ productId: p.id, productName: p.name, hasIngredients: !!(p.ingredientsCount && p.ingredientsCount > 0), fallbackActId: getProductResolvedActId(p) });
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="3" fill="#217346"/><path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" fill="#185C37"/><path d="M14 2V8H20L14 2Z" fill="#107C41"/><text x="7" y="18" fill="white" fontSize="8" fontWeight="bold" fontFamily="Arial,sans-serif">XLS</text></svg>
        Fiche tech.
      </button>
      <button
        className="btn btn-ghost btn-sm"
        title={t('common.edit')}
        disabled={!canWriteProducts}
        onClick={() => openEditModal(p)}
        style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '5px 8px', borderRadius: 7, fontSize: '0.6rem', fontWeight: 600, color: '#374151', minWidth: 54, ...(!canWriteProducts ? disabledStyle : {}) }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        Modifier
      </button>
      <button
        className="btn btn-danger btn-sm"
        onClick={() => handleDelete(p)}
        disabled={!canWriteProducts}
        title={t('common.delete')}
        style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '5px 8px', borderRadius: 7, fontSize: '0.6rem', fontWeight: 600, minWidth: 54, ...disabledStyle }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          <path d="M10 11v6M14 11v6"/>
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
        </svg>
        Supprimer
      </button>
    </div>
  );

  return (
    <div className="page">
      {/* ── Hero header ── */}
      <div style={{
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 55%, #4338ca 100%)',
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(30,27,75,0.35)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{ background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem', lineHeight: 1 }}>
                {tab === 'utilisable' ? '🧪' : '🍽️'}
              </div>
              <h1 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: 9 }}>
                {tab === 'utilisable'
                  ? t('client.products.tab_utilisable')
                  : t('client.products.tab_vendable')}
              </h1>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.55)', margin: 0, fontSize: '0.83rem', letterSpacing: '0.01em' }}>
              {tab === 'utilisable'
                ? 'Produits semi-finis utilisés dans la composition de vos recettes'
                : 'Produits finis destinés à la vente, définis par leurs fiches techniques'}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <div style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.22)', borderRadius: 14, padding: '10px 20px', textAlign: 'center', minWidth: 80 }}>
              <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#818cf8', lineHeight: 1 }}>{byTab.length}</div>
              <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                produit{byTab.length !== 1 ? 's' : ''}
              </div>
            </div>
            <GuideButton section={tab === 'utilisable' ? 'produits-utilisables' : 'produits-vendables'} />
          </div>
        </div>
      </div>


      <>
          {/* Sub-tabs for vendable tab */}
          {isVendable && (
            <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #e2e8f0', marginBottom: 20 }}>
              {([
                ['produit', '🍽️ Produits vendables'],
                ['supplement', '➕ Suppléments vendables'],
              ] as const).map(([key, label]) => (
                <button key={key} onClick={() => { setVendableSubTab(key); setPage(1); }}
                  style={{
                    padding: '9px 22px', background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: '0.92rem', fontWeight: vendableSubTab === key ? 700 : 400,
                    color: vendableSubTab === key ? '#6366f1' : 'var(--text)',
                    borderBottom: vendableSubTab === key ? '3px solid #6366f1' : '3px solid transparent',
                    marginBottom: -2, whiteSpace: 'nowrap',
                  }}>
                  {label}
                  <span style={{ marginLeft: 7, fontSize: '0.72rem', fontWeight: 700, color: '#fff', background: vendableSubTab === key ? '#6366f1' : '#94a3b8', borderRadius: 20, padding: '1px 8px' }}>
                    {searched.filter(p => key === 'produit' ? !p.isSupplement : !!p.isSupplement).length}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Barre de filtres (composant partagé, mode direct) */}
          <HistoryFilterBar
            accent="#6366f1" accentDark="#4338ca"
            subtitle={`${bySubTab.length} résultat${bySubTab.length !== 1 ? 's' : ''}`}
            onReset={() => { setSearch(''); setFilterActiviteId(null); setPage(1); }}
            showReset={!!(search || filterActiviteId)}
            actions={<>
              <button
                onClick={() => { if (tab !== 'vendable') { handleExportXls(false); } else { setExportIncludeOther(false); setExportModalOpen(true); } }}
                disabled={exportingXls || bySubTab.length === 0}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px', borderRadius: 8, border: '1.5px solid #1D6F42', background: (exportingXls || bySubTab.length === 0) ? '#f3f4f6' : '#f0fdf4', color: '#1D6F42', cursor: (exportingXls || bySubTab.length === 0) ? 'default' : 'pointer', fontWeight: 700, fontSize: '0.82rem', whiteSpace: 'nowrap', opacity: bySubTab.length === 0 ? 0.5 : 1 }}>
                <ExcelIcon /> {exportingXls ? 'Export…' : 'Exporter XLS'}
              </button>
              {canWriteProducts && (
                <button onClick={() => openAddModal(isVendable && vendableSubTab === 'supplement')}
                  style={{ height: 36, padding: '0 20px', borderRadius: 8, cursor: 'pointer', fontSize: '0.85rem', border: 'none', background: 'linear-gradient(135deg, #6366f1, #818cf8)', color: '#fff', fontWeight: 700, whiteSpace: 'nowrap' }}>
                  + {isVendable ? (vendableSubTab === 'supplement' ? 'Supplément vendable' : 'Produit vendable') : 'Produit utilisable'}
                </button>
              )}
            </>}
          >
            {byTab.length > 0 && allActivities.length > 0 && (
              <FilterField label="📍 Activité">
                <FilterSelect value={filterActiviteId ?? ''} onChange={(e) => { setFilterActiviteId(e.target.value ? Number(e.target.value) : null); setPage(1); }}>
                  <option value="">Toutes les activités</option>
                  {allActivities.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
                </FilterSelect>
              </FilterField>
            )}
            {byTab.length > 0 && isVendable && categoriesProduit.length > 0 && (
              <FilterField label="🏷️ Catégorie">
                <FilterSelect value={filterCategorieId ?? ''} onChange={(e) => { setFilterCategorieId(e.target.value ? Number(e.target.value) : null); setPage(1); }}>
                  <option value="">Toutes les catégories</option>
                  {categoriesProduit.filter((c) => c.typeProduit === (vendableSubTab === 'supplement' ? 'supplement' : 'vendable')).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </FilterSelect>
              </FilterField>
            )}
            {byTab.length > 0 && (
              <FilterField label="🔍 Nom">
                <FilterInput type="text" placeholder={t('common.search') + '...'} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
              </FilterField>
            )}
          </HistoryFilterBar>

          {loading ? (
            <div className="loading-text">{t('common.loading')}</div>
          ) : bySubTab.length === 0 ? (
            byTab.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 24px', textAlign: 'center' }}>
                <div style={{ width: 72, height: 72, borderRadius: 20, background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', marginBottom: 20, boxShadow: '0 8px 24px rgba(30,27,75,0.22)' }}>
                  {isVendable ? '🍽️' : '🧪'}
                </div>
                <h2 style={{ margin: '0 0 8px', fontSize: '1.15rem', fontWeight: 700, color: 'var(--text)' }}>
                  {isVendable ? 'Aucun produit vendable' : 'Aucun produit utilisable'}
                </h2>
                <p style={{ margin: '0 0 4px', fontSize: '0.88rem', color: 'var(--text-muted)', maxWidth: 340 }}>
                  Commencez par créer votre premier produit.
                </p>
              </div>
            ) : byActivite.length === 0 && filterActiviteId ? (
              <div className="empty-state">
                <span className="empty-icon">📍</span>
                <p>Aucun produit pour cette activité.</p>
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
                const renderProductCard = (p: Product) => {
                  const isSup = !!p.isSupplement;
                  const icon = isSup ? '➕' : (isVendable ? '🍽️' : '🧪');
                  const iconGradient = isSup ? 'linear-gradient(135deg, #d97706 0%, #b45309 100%)' : 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)';
                  const nbArt = p.ingredientsCount ?? 0;
                  const nbSub = p.subProductsCount ?? 0;
                  const summaryParts: string[] = [];
                  if (nbArt) summaryParts.push(`${nbArt} article${nbArt > 1 ? 's' : ''}`);
                  if (nbSub) summaryParts.push(isVendable ? `${nbSub} PU` : `${nbSub} sous-produit${nbSub > 1 ? 's' : ''}`);
                  const badges = (
                    <>
                      {isVendable && p.categorieProduitName && (
                        <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.04em', background: '#e0e7ff', color: '#3730a3', border: '1px solid #c7d2fe', borderRadius: 20, padding: '2px 8px' }}>🏷️ {p.categorieProduitName}</span>
                      )}
                      {(p.origine ?? 'activite') === 'labo' && (
                        <span title="Fabriqué au labo — reçu uniquement par transfert (pas d'appro manuel en activité)."
                          style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.04em', background: '#ecfeff', color: '#0e7490', border: '1px solid #a5f3fc', borderRadius: 20, padding: '2px 8px', whiteSpace: 'nowrap' }}>⇄ Transfert uniquement</span>
                      )}
                    </>
                  );
                  const togId = (key: string | null) => (key && key.startsWith(`${p.id}-`)) ? Number(key.slice(`${p.id}-`.length)) : null;
                  return (
                    <ProductCard
                      key={p.id}
                      product={p}
                      icon={icon}
                      iconGradient={iconGradient}
                      badges={badges}
                      onVoir={() => openPopup('ingredients', p)}
                      voirSummary={summaryParts.join('  ·  ') || undefined}
                      actions={renderActions(p)}
                      activities={allActivities.map((a) => ({ id: a.id, nom: a.nom }))}
                      assignedActiviteIds={new Set((p.activites ?? []).map((a) => a.id))}
                      togglingActiviteId={togId(togglingActivite)}
                      onToggleActivite={(id) => toggleActiviteAssignment(p, id)}
                      labos={p.type === 'utilisable' ? allLabos : []}
                      assignedLaboIds={new Set((p.labos ?? []).map((l) => l.id))}
                      togglingLaboId={togId(togglingLabo)}
                      onToggleLabo={(id) => toggleLaboAssignment(p, id)}
                      canWrite={canWriteProducts}
                    />
                  );
                };

                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
                    {paginated.map((p) => renderProductCard(p))}
                  </div>
                );
              })()}
              {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, flexWrap: 'wrap', gap: 8 }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                    {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, bySubTab.length)} sur {bySubTab.length}
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

          {exportModalOpen && (
            <div className="modal-overlay" onClick={() => setExportModalOpen(false)}>
              <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
                <div className="modal-header" style={{ background: 'linear-gradient(135deg, #1D6F42, #2d9e5f)', borderBottom: 'none', borderRadius: '12px 12px 0 0', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h2 style={{ color: '#fff', margin: 0, fontSize: '0.97rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ExcelIcon /> Export XLS
                  </h2>
                  <button onClick={() => setExportModalOpen(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 900, fontSize: '1.1rem', cursor: 'pointer', padding: '2px 9px', lineHeight: 1 }}>×</button>
                </div>
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ background: '#f0fdf4', border: '1px solid #c7d2fe', borderRadius: 8, padding: '12px 14px', fontSize: '0.88rem', color: '#064e3b' }}>
                    <strong>{bySubTab.length}</strong> {vendableSubTab === 'supplement' ? 'supplément(s) vendable(s)' : tab === 'vendable' ? 'produit(s) vendable(s)' : 'produit(s) utilisable(s)'} seront exportés avec les filtres actuels.
                  </div>
                  {tab === 'vendable' && (
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '12px 14px' }}>
                      <input
                        type="checkbox"
                        checked={exportIncludeOther}
                        onChange={e => setExportIncludeOther(e.target.checked)}
                        style={{ width: 16, height: 16, marginTop: 1, flexShrink: 0, accentColor: '#1D6F42' }}
                      />
                      <span style={{ fontSize: '0.88rem', color: 'var(--text)', lineHeight: 1.4 }}>
                        Inclure aussi les <strong>{vendableSubTab === 'supplement' ? 'produits vendables' : 'suppléments vendables'}</strong> dans une feuille séparée du même fichier
                      </span>
                    </label>
                  )}
                </div>
                <div className="modal-footer" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn btn-ghost" onClick={() => setExportModalOpen(false)}>Annuler</button>
                  <button
                    disabled={exportingXls}
                    onClick={() => { setExportModalOpen(false); handleExportXls(exportIncludeOther); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 8, border: 'none', background: '#1D6F42', color: '#fff', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer' }}
                  >
                    <ExcelIcon /> Exporter
                  </button>
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
              fallbackActId={ftPopup.fallbackActId}
              onClose={() => setFtPopup(null)}
            />
          )}

          {popup && (
            <div className="modal-overlay">
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header" style={{ background: 'linear-gradient(135deg, #1e1b4b, #4338ca)', borderBottom: 'none' }}>
                  <h2 style={{ color: '#fff', margin: 0 }}>
                    {popup.type === 'parentProducts' ? 'Utilisé dans' : 'Recette'} — {popup.productName}
                  </h2>
                  <button className="modal-close" onClick={closePopup}>×</button>
                </div>
                <div className="modal-body">
                  {popup.type !== 'parentProducts' ? (
                    <RecipeTree productId={popup.productId} />
                  ) : loadingDetail ? (
                    <div className="loading-text">{t('common.loading')}</div>
                  ) : (
                    detail?.parentProducts && detail.parentProducts.length > 0 ? (
                      <table className="table">
                        <thead style={{ background: 'linear-gradient(135deg, #1e1b4b, #4338ca)' }}>
                          <tr>
                            <th style={{ color: '#fff', fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Produit</th>
                            <th style={{ textAlign: 'right', color: '#fff', fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Portion</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.parentProducts.map((pp, i) => (
                            <tr key={i} style={{ background: i % 2 === 0 ? '#f8fafc' : '#fff' }}>
                              <td style={{ fontWeight: 600, color: '#1e1b4b' }}>{pp.name}</td>
                              <td style={{ textAlign: 'right', fontWeight: 700, color: '#374151' }}>{pp.portion}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 0' }}>
                        <span style={{ fontSize: '2rem', marginBottom: 8 }}>🍽️</span>
                        <p style={{ color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>Aucun produit n'utilise ce produit transformé.</p>
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
                      <div style={{ background: hasPtHistory ? '#fff1f2' : '#f0fdf4', border: `1px solid ${hasPtHistory ? '#fecdd3' : '#c7d2fe'}`, borderRadius: 8, padding: '12px 14px' }}>
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
                          <div style={{ fontSize: '0.83rem', color: '#3730a3' }}>
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


          {/* ── Add product modal (4 steps) ── */}
          {addModal && (() => {
            const selectedIngredients = addIngredients.filter((i) => i.selected);
            const selectedIngIds = new Set(addIngLines.map((l) => l.ingredientId).filter(Boolean));

            const toggleIngredient = (ing: ActiviteIngredient) => {
              const sid = String(ing.id);
              if (addIsSupplement) {
                setAddIngLines([{ ingredientId: sid, portion: '' }]);
                setAddSubLines([]);
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
              if (addIsSupplement) {
                if (addSubIds.has(sid)) {
                  setAddSubLines([]);
                } else {
                  setAddSubLines([{ ingredientId: sid, portion: '' }]);
                  setAddIngLines([]);
                }
              } else if (addSubIds.has(sid)) {
                setAddSubLines((prev) => prev.filter((l) => l.ingredientId !== sid));
              } else {
                setAddSubLines((prev) => [...prev, { ingredientId: sid, portion: '' }]);
              }
            };
            const updateSubPortion = (id: string, val: string) =>
              setAddSubLines((prev) => prev.map((l) => l.ingredientId === id ? { ...l, portion: val } : l));

            const canGoStep2 = addName.trim().length > 0 && (!isVendable || !!addCategorieId);
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
                // L'affectation (labo XOR activité) est gérée par le backend selon origine + ids :
                // labo → labo_pt_selections + PT des activités du labo ; activité → affectation/stock.
                const payload = {
                  name: addName.trim(),
                  refProduit: addRef.trim() || null,
                  type: tab === 'utilisable' ? 'utilisable' : 'vendable',
                  isSupplement: addIsSupplement,
                  categorieProduitId: tab === 'utilisable' ? null : (addCategorieId ? parseInt(addCategorieId) : null),
                  origine: addOrigine,
                  // Vendable : gestion de stock optionnelle (appros libres) — défaut décoché.
                  stockActif: isVendable ? (addStockActif && !addIsSupplement) : undefined,
                  // mode libre (PU) : labos COCHÉS qui gèrent aussi le produit (appro manuel labo).
                  laboIds: addOrigine === 'labo' ? addAffectationIds : addCheckedLabos,
                  // mode labo : activités COCHÉES qui reçoivent le PT ; mode activité : les activités choisies.
                  activiteIds: addOrigine === 'labo' ? addCheckedActivites : addAffectationIds,
                  ingredients: baseIngredients,
                  subProducts: baseSubProducts,
                };
                // ÉDITION : même wizard, même payload — le backend recompose l'affectation.
                if (editingId) {
                  const putPayload: Record<string, unknown> = { ...payload };
                  // PU : ne pas envoyer categorieProduitId (le backend le refuse hors vendable)
                  if (tab === 'utilisable') delete putPayload.categorieProduitId;
                  await api.put(`/api/products/${editingId}`, putPayload);
                } else {
                  await api.post('/api/products', payload);
                }
                setAddSavedName(addName.trim());
                setAddModal(6);
                const reloadParams = new URLSearchParams();
                if (laboId) reloadParams.set('laboId', laboId);
                const reloadQs = reloadParams.toString();
                api.get(`/api/products${reloadQs ? `?${reloadQs}` : ''}`).then(({ data }) => setProducts(data as Product[]));
              } catch (err: unknown) {
                const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
                setAddSaveError(msg || (editingId ? 'Erreur lors de la modification du produit.' : 'Erreur lors de la création du produit.'));
              }
              setAddSaving(false);
            };

            const STEPS = [
              { n: 1, d: 1, label: 'Affectation' },
              { n: 2, d: 2, label: 'Identité' },
              { n: 3, d: 3, label: 'Articles' },
              { n: 4, d: 4, label: 'Produits Utilisables' },
              { n: 5, d: 5, label: 'Récap' },
            ];

            return (
              <div className="modal-overlay">
                <div className="modal" style={{ maxWidth: 560, width: '95vw', maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
                  {/* Header */}
                  <div style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)', padding: '18px 22px 14px', borderRadius: '12px 12px 0 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: '#fff', fontWeight: 800, fontSize: '1rem', marginBottom: addModal !== 6 ? 12 : 0 }}>
                        {addModal === 6 ? (editingId ? '✅ Produit modifié' : '✅ Produit créé')
                          : editingId ? (isVendable ? (addIsSupplement ? 'Modifier le supplément vendable' : 'Modifier le produit vendable') : 'Modifier le produit utilisable')
                          : isVendable ? (addIsSupplement ? 'Nouveau supplément vendable' : 'Nouveau produit vendable') : 'Nouveau produit utilisable'}
                      </div>
                      {addModal !== 6 && (
                        <div style={{ display: 'flex', gap: 10, width: '100%' }}>
                          {STEPS.map((s) => (
                            <div key={s.n} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <div style={{ height: 4, borderRadius: 4, background: s.n <= addModal ? '#fff' : 'rgba(255,255,255,0.28)', transition: 'background 0.2s' }} />
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <div style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, background: s.n <= addModal ? '#fff' : 'rgba(255,255,255,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.62rem', fontWeight: 800, color: s.n <= addModal ? '#6366f1' : 'rgba(255,255,255,0.55)' }}>
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
                    {/* Step 2 — Identité */}
                    {addModal === 2 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div>
                          <label style={{ display: 'block', fontWeight: 700, fontSize: '0.82rem', color: '#3730a3', marginBottom: 6 }}>
                            Nom du produit <span style={{ color: '#ef4444' }}>*</span>
                          </label>
                          <input className="input" placeholder="Ex. Burger Classic, Pizza Margherita…" value={addName}
                            onChange={(e) => setAddName(e.target.value)} autoFocus
                            style={{ width: '100%', borderColor: '#c7d2fe' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontWeight: 700, fontSize: '0.82rem', color: '#3730a3', marginBottom: 6 }}>
                            Réf. produit <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)' }}>(optionnel)</span>
                          </label>
                          <input className="input" placeholder="Ex. BRG-001" value={addRef}
                            onChange={(e) => setAddRef(e.target.value)}
                            style={{ width: '100%', maxWidth: 280, borderColor: '#c7d2fe' }} />
                        </div>
                        {isVendable && (
                          <div>
                            <label style={{ display: 'block', fontWeight: 700, fontSize: '0.82rem', color: '#3730a3', marginBottom: 6 }}>
                              Catégorie de produit <span style={{ color: '#ef4444' }}>*</span>
                            </label>
                            <select className="input" value={addCategorieId} onChange={(e) => setAddCategorieId(e.target.value)} style={{ width: '100%', maxWidth: 320, borderColor: addCategorieId ? '#c7d2fe' : '#fca5a5' }}>
                              <option value="">— Sélectionner une catégorie —</option>
                              {categoriesProduit.filter((c) => c.typeProduit === (addIsSupplement ? 'supplement' : 'vendable')).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            {categoriesProduit.length === 0 && (
                              <div style={{ fontSize: '0.76rem', color: '#b45309', marginTop: 4 }}>Aucune catégorie. Créez-en d'abord dans « Configuration Catégorie ».</div>
                            )}
                          </div>
                        )}
                        {isVendable && addIsSupplement && (
                          <div style={{ background: '#fffbeb', borderRadius: 10, padding: '10px 16px', border: '1.5px solid #fcd34d', fontSize: '0.82rem', color: '#92400e', fontWeight: 600 }}>
                            ➕ Ce produit sera créé comme supplément vendable
                          </div>
                        )}
                        {/* Vendable géré en STOCK (option, défaut décoché) — logique appros libres */}
                        {isVendable && !addIsSupplement && (
                          <div style={{ background: '#f0fdfa', borderRadius: 10, padding: '12px 16px', border: '1.5px solid #99f6e4' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', color: '#0f766e' }}>
                              <input type="checkbox" checked={addStockActif} onChange={(e) => setAddStockActif(e.target.checked)}
                                style={{ accentColor: '#0d9488', width: 16, height: 16 }} />
                              📦 Gérer ce produit en stock (appros libres)
                            </label>
                            <div style={{ fontSize: '0.75rem', color: '#115e59', marginTop: 6 }}>
                              Le produit sera suivi dans le stock des activités choisies à l'étape 1 — catégorie
                              « Produits Transformés Vendables » : appros manuels, transferts, pertes, seuil et inventaire.
                            </div>
                            {addStockActif && allLabos.length > 0 && (
                              <div style={{ marginTop: 10 }}>
                                <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#0f766e', marginBottom: 6 }}>
                                  Labos où ce produit sera aussi géré (appro manuel au labo) :
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                  {allLabos.map((l) => {
                                    const on = addCheckedLabos.includes(l.id);
                                    return (
                                      <button type="button" key={l.id}
                                        onClick={() => setAddCheckedLabos(prev => on ? prev.filter(id => id !== l.id) : [...prev, l.id])}
                                        style={{ padding: '5px 12px', borderRadius: 20, border: `1.5px solid ${on ? '#0d9488' : '#e2e8f0'}`, background: on ? '#f0fdfa' : '#fff', color: on ? '#0f766e' : '#94a3b8', fontWeight: on ? 700 : 500, fontSize: '0.78rem', cursor: 'pointer' }}>
                                        {on ? '✓ ' : ''}🏭 {l.nom}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, paddingTop: 8 }}>
                          <button className="btn btn-ghost" onClick={() => setAddModal(1)}>← Retour</button>
                          <button disabled={!canGoStep2}
                            onClick={() => setAddModal(3)}
                            style={{ background: canGoStep2 ? 'linear-gradient(135deg, #4338ca, #6366f1)' : '#e5e7eb', border: 'none', borderRadius: 10, color: canGoStep2 ? '#fff' : '#9ca3af', fontWeight: 700, padding: '9px 22px', cursor: canGoStep2 ? 'pointer' : 'not-allowed' }}>
                            Suivant →
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Step 3 — Articles */}
                    {addModal === 3 && (() => {
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
                                <div key={ing.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 8, background: sel ? (portionValid ? '#eef2ff' : '#fef3c7') : 'transparent', cursor: 'pointer', transition: 'background 0.12s' }}
                                  onClick={() => toggleIngredient(ing)}>
                                  <input type="checkbox" checked={sel} onChange={() => toggleIngredient(ing)}
                                    onClick={e => e.stopPropagation()}
                                    style={{ accentColor: '#6366f1', width: 15, height: 15, flexShrink: 0, cursor: 'pointer' }} />
                                  <span style={{ flex: 1, fontSize: '0.84rem', fontWeight: sel ? 600 : 400, color: sel ? '#3730a3' : '#374151' }}>{ing.nom}</span>
                                  {ing.categorie && (
                                    <span style={{ fontSize: '0.68rem', color: '#64748b', background: '#f1f5f9', borderRadius: 6, padding: '1px 6px', flexShrink: 0 }}>{ing.categorie}</span>
                                  )}
                                  {sel && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                                      <input type="number" step="0.001" min="0" placeholder="portion"
                                        value={line?.portion || ''}
                                        onChange={(e) => updatePortion(sid, e.target.value)}
                                        style={{ width: 72, padding: '3px 6px', borderRadius: 6, border: `1.5px solid ${portionValid ? '#c7d2fe' : '#ef4444'}`, fontSize: '0.82rem', textAlign: 'right' }} />
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
                            <div style={{ fontSize: '0.78rem', color: '#6366f1', fontWeight: 600 }}>
                              {addIngLines.filter(l => l.ingredientId && parseFloat(l.portion) > 0).length} article{addIngLines.filter(l => l.ingredientId && parseFloat(l.portion) > 0).length !== 1 ? 's' : ''} valide{addIngLines.filter(l => l.ingredientId && parseFloat(l.portion) > 0).length !== 1 ? 's' : ''} (portion &gt; 0)
                            </div>
                          )}

                          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4 }}>
                            <button className="btn btn-ghost" onClick={() => setAddModal(2)}>← Retour</button>
                            <button onClick={() => setAddModal(4)}
                              style={{ background: 'linear-gradient(135deg, #4338ca, #6366f1)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, padding: '9px 22px', cursor: 'pointer' }}>
                              Suivant →
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Step 4 — Produits Utilisables */}
                    {addModal === 4 && (() => {
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
                            {addIsSupplement
                              ? 'Mode supplément — sélectionnez exactement 1 produit utilisable (OU utilisez l\'étape Articles).'
                              : 'Ajoutez des produits utilisables comme sous-composants. Au minimum 2 articles/produits utilisables requis au total.'}
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
                            const canNext = addIsSupplement ? addTotalValid === 1 : addTotalValid >= 2;
                            return (
                              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8 }}>
                                <button className="btn btn-ghost" onClick={() => setAddModal(3)}>← Retour</button>
                                <button disabled={!canNext} onClick={() => setAddModal(5)}
                                  style={{ background: canNext ? 'linear-gradient(135deg, #4338ca, #6366f1)' : '#e5e7eb', border: 'none', borderRadius: 10, color: canNext ? '#fff' : '#9ca3af', fontWeight: 700, padding: '9px 22px', cursor: canNext ? 'pointer' : 'not-allowed' }}
                                  title={!canNext ? (addIsSupplement ? 'Sélectionnez exactement 1 article ou produit utilisable' : 'Au minimum 2 articles/produits utilisables requis') : undefined}>
                                  Suivant →
                                </button>
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })()}

                    {/* Step 1 — Affectation */}
                    {addModal === 1 && (() => {
                      const isLaboMode = addOrigine === 'labo';
                      const linkedActivites = isLaboMode
                        ? allActivities.filter((a) => a.laboId != null && addAffectationIds.includes(Number(a.laboId)))
                        : [];
                      const opts = isLaboMode
                        ? allLabos.map((l) => ({ id: l.id, nom: l.nom, laboNom: undefined as string | undefined }))
                        : allActivities.map((a) => ({ id: a.id, nom: a.nom, laboNom: (a as any).laboNom as string | undefined }));
                      const allIds = opts.map((o) => o.id);
                      const canNext = addAffectationIds.length > 0;
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {/* Toggle de mode d'appro — uniquement pour les produits utilisables */}
                          {!isVendable && (
                            <div style={{ display: 'flex', gap: 8 }}>
                              {([
                                ['activite', '🆓 Appros libres', 'Géré dans l’activité, appros manuels possibles'],
                                ['labo', '🔒 Appros limités aux transferts', 'Fabriqué au labo puis transféré ; pas d’appro manuel en activité'],
                              ] as const).map(([key, label, desc]) => {
                                const active = addOrigine === key;
                                const disabled = key === 'labo' && allLabos.length === 0;
                                return (
                                  <button key={key} type="button" disabled={disabled}
                                    onClick={() => {
                                      if (active) return;
                                      setAddOrigine(key); setAddCheckedActivites([]);
                                      // Retour en appros libres → tout ré-auto-sélectionner ; mode labo → choix explicite des labos.
                                      if (key === 'activite') {
                                        setAddAffectationIds(allActivities.map((a) => a.id));
                                        setAddCheckedLabos(allLabos.map((l) => l.id));
                                      } else {
                                        setAddAffectationIds([]); setAddCheckedLabos([]);
                                      }
                                    }}
                                    style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: `2px solid ${active ? '#6366f1' : '#e2e8f0'}`, background: active ? '#f0fdf4' : '#fff', cursor: disabled ? 'not-allowed' : 'pointer', textAlign: 'left', opacity: disabled ? 0.5 : 1 }}>
                                    <div style={{ fontWeight: active ? 800 : 700, fontSize: '0.84rem', color: active ? '#3730a3' : '#374151' }}>{label}</div>
                                    <div style={{ fontSize: '0.68rem', color: active ? '#4338ca' : '#94a3b8', marginTop: 2 }}>{desc}</div>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                          <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
                            {isVendable
                              ? <>Sélectionnez la/les <strong>activité(s)</strong> qui vendront ce produit (recette consommée sur place).</>
                              : isLaboMode
                                ? <>Sélectionnez le/les <strong>labo(s)</strong> de fabrication — les articles proposés seront ceux du périmètre.</>
                                : <>Sélectionnez la/les <strong>activité(s)</strong> où ce produit utilisable sera géré.</>}
                          </div>
                          {opts.length === 0 ? (
                            <div style={{ padding: 16, background: '#f8fafc', borderRadius: 8, fontSize: '0.85rem', color: '#64748b', textAlign: 'center' }}>
                              Aucun {isLaboMode ? 'labo' : 'activité'} disponible.
                            </div>
                          ) : (
                            <>
                              <button type="button"
                                onClick={() => setAddAffectationIds(addAffectationIds.length === allIds.length ? [] : allIds)}
                                style={{ alignSelf: 'flex-start', background: 'transparent', border: '1.5px solid #6366f1', borderRadius: 8, color: '#6366f1', fontWeight: 700, padding: '5px 14px', cursor: 'pointer', fontSize: '0.8rem' }}>
                                {addAffectationIds.length === allIds.length ? '☐ Tout désélectionner' : '☑ Tout sélectionner'}
                              </button>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 190, overflowY: 'auto' }}>
                                {opts.map((o) => {
                                  const checked = addAffectationIds.includes(o.id);
                                  return (
                                    <div key={o.id}
                                      onClick={() => setAddAffectationIds(prev => checked ? prev.filter(id => id !== o.id) : [...prev, o.id])}
                                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, cursor: 'pointer', background: checked ? '#f0fdf4' : '#f8fafc', border: `1.5px solid ${checked ? '#c7d2fe' : '#e2e8f0'}` }}>
                                      <input type="checkbox" checked={checked} readOnly style={{ accentColor: '#6366f1', width: 16, height: 16, flexShrink: 0 }} />
                                      <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600, fontSize: '0.88rem', color: checked ? '#3730a3' : '#374151' }}>{isLaboMode ? '🏭 ' : ''}{o.nom}</div>
                                        {!isLaboMode && o.laboNom && <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 1 }}>🏭 Labo : {o.laboNom}</div>}
                                      </div>
                                      {checked && <span style={{ color: '#6366f1', fontSize: '0.9rem' }}>✓</span>}
                                    </div>
                                  );
                                })}
                              </div>
                              {/* Mode appros libres (PU) : labos cochables (gèrent aussi le produit — appro manuel labo) */}
                              {!isVendable && !isLaboMode && allLabos.length > 0 && (
                                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 10 }}>
                                  <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#3730a3', marginBottom: 6 }}>
                                    Labos où ce produit sera aussi géré (appro manuel au labo) — décochez pour exclure :
                                  </div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {allLabos.map((l) => {
                                      const on = addCheckedLabos.includes(l.id);
                                      return (
                                        <button type="button" key={l.id}
                                          onClick={() => setAddCheckedLabos(prev => on ? prev.filter(id => id !== l.id) : [...prev, l.id])}
                                          style={{ padding: '5px 12px', borderRadius: 20, border: `1.5px solid ${on ? '#6366f1' : '#e2e8f0'}`, background: on ? '#f0fdf4' : '#fff', color: on ? '#3730a3' : '#94a3b8', fontWeight: on ? 700 : 500, fontSize: '0.78rem', cursor: 'pointer' }}>
                                          {on ? '✓ ' : ''}🏭 {l.nom}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                              {/* Mode labo : activités liées cochables (reçoivent le PT par transfert) */}
                              {isLaboMode && addAffectationIds.length > 0 && (
                                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 10 }}>
                                  <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#3730a3', marginBottom: 6 }}>
                                    Activités liées qui recevront le produit (transfert) — décochez pour exclure :
                                  </div>
                                  {linkedActivites.length === 0 ? (
                                    <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Aucune activité rattachée à ce(s) labo(s).</div>
                                  ) : (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                      {linkedActivites.map((a) => {
                                        const on = addCheckedActivites.includes(a.id);
                                        return (
                                          <button type="button" key={a.id}
                                            onClick={() => setAddCheckedActivites(prev => on ? prev.filter(id => id !== a.id) : [...prev, a.id])}
                                            style={{ padding: '5px 12px', borderRadius: 20, border: `1.5px solid ${on ? '#6366f1' : '#e2e8f0'}`, background: on ? '#f0fdf4' : '#fff', color: on ? '#3730a3' : '#94a3b8', fontWeight: on ? 700 : 500, fontSize: '0.78rem', cursor: 'pointer' }}>
                                            {on ? '✓ ' : ''}{a.nom}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}
                            </>
                          )}
                          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8 }}>
                            <button className="btn btn-ghost" onClick={() => setAddModal(null)}>Annuler</button>
                            <button disabled={!canNext} onClick={() => setAddModal(2)}
                              style={{ background: canNext ? 'linear-gradient(135deg, #4338ca, #6366f1)' : '#e5e7eb', border: 'none', borderRadius: 10, color: canNext ? '#fff' : '#9ca3af', fontWeight: 700, padding: '9px 22px', cursor: canNext ? 'pointer' : 'not-allowed' }}>
                              Suivant →
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Step 5 — Récap & Confirmation */}
                    {addModal === 5 && (() => {
                      const ingCount = addIngLines.filter(l => l.ingredientId && parseFloat(l.portion) > 0).length;
                      const subCount = addSubLines.filter(l => l.ingredientId && parseFloat(l.portion) > 0).length;
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                          {/* Product identity card */}
                          <div style={{ background: 'linear-gradient(135deg,#f0fdf4,#e0e7ff)', border: '1.5px solid #c7d2fe', borderRadius: 14, padding: '16px 18px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                              <div style={{ width: 42, height: 42, borderRadius: 10, background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', flexShrink: 0 }}>📦</div>
                              <div>
                                <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#3730a3' }}>{addName}</div>
                                {addRef && <div style={{ fontSize: '0.75rem', color: '#6366f1', marginTop: 1 }}>Réf : {addRef}</div>}
                              </div>
                              <div style={{ marginLeft: 'auto', background: '#6366f1', color: '#fff', borderRadius: 20, padding: '3px 10px', fontSize: '0.72rem', fontWeight: 700 }}>
                                {isVendable ? 'Vendable' : 'Utilisable'}{addIsSupplement ? ' · Suppl.' : ''}
                              </div>
                            </div>
                            {/* Stats row */}
                            <div style={{ display: 'flex', gap: 10 }}>
                              <div style={{ flex: 1, background: 'rgba(255,255,255,0.6)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                                <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#3730a3' }}>{ingCount}</div>
                                <div style={{ fontSize: '0.7rem', color: '#6366f1' }}>article{ingCount !== 1 ? 's' : ''}</div>
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
                          {addAffectationIds.length > 0 && (
                            <div>
                              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                {addOrigine === 'labo' ? '🏭 Labo(s) de fabrication' : (isVendable ? '📍 Activités' : '📍 Stocks activés')}
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {addAffectationIds.map(id => {
                                  const nom = addOrigine === 'labo'
                                    ? allLabos.find(l => l.id === id)?.nom
                                    : allActivities.find(a => a.id === id)?.nom;
                                  return nom ? (
                                    <span key={id} style={{ background: '#f0fdf4', border: '1px solid #c7d2fe', borderRadius: 20, padding: '3px 10px', fontSize: '0.78rem', color: '#3730a3', fontWeight: 600 }}>{addOrigine === 'labo' ? '🏭 ' : ''}{nom}</span>
                                  ) : null;
                                })}
                              </div>
                              {addOrigine === 'labo' && (
                                <>
                                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', margin: '10px 0 6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                    🔄 Activités qui recevront le produit (transfert)
                                  </div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {addCheckedActivites.length === 0
                                      ? <span style={{ fontSize: '0.78rem', color: '#b45309' }}>Aucune — le produit restera au labo (non distribué)</span>
                                      : addCheckedActivites.map(id => {
                                          const nom = allActivities.find(a => a.id === id)?.nom;
                                          return nom ? (
                                            <span key={id} style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 20, padding: '3px 10px', fontSize: '0.78rem', color: '#1e40af', fontWeight: 600 }}>{nom}</span>
                                          ) : null;
                                        })}
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                          {addSaveError && (
                            <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 8, padding: '10px 14px', color: '#b91c1c', fontWeight: 700, fontSize: '0.85rem' }}>
                              ⛔ {addSaveError}
                            </div>
                          )}
                          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4, borderTop: '1px solid var(--border)' }}>
                            <button className="btn btn-ghost" onClick={() => setAddModal(4)}>← Retour</button>
                            <button disabled={addSaving}
                              onClick={handleSave}
                              style={{ background: 'linear-gradient(135deg, #4338ca, #6366f1)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, padding: '10px 28px', cursor: addSaving ? 'not-allowed' : 'pointer', opacity: addSaving ? 0.7 : 1, fontSize: '0.9rem' }}>
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
                        <div style={{ fontWeight: 700, fontSize: '1rem', color: '#166534', marginBottom: 6 }}>
                          {editingId ? 'Produit modifié avec succès' : 'Produit créé avec succès'}
                        </div>
                        <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: 22 }}>
                          <strong>{addSavedName}</strong> {editingId ? 'a été mis à jour.' : 'a été ajouté à votre liste.'}
                        </div>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                          <button className="btn btn-ghost" onClick={() => setAddModal(null)}>Fermer</button>
                          {!editingId && (
                            <button onClick={() => openAddModal(addIsSupplement)}
                              style={{ background: 'linear-gradient(135deg, #4338ca, #6366f1)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, padding: '9px 22px', cursor: 'pointer' }}>
                              + Ajouter un autre
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
      </>
    </div>
  );
}
