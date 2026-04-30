import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import type { Activite, Product } from '../../types';

interface ManualPriceEntry {
  ingredientId: number;
  nom: string;
  unite: string;
  prixUnitaire: string;
}

interface ManualPriceGroup {
  label: string;
  depth: number;
  ingredients: { ingredientId: number; nom: string; unite: string }[];
}

interface Props {
  isEntreprise: boolean;
  franchiseActivities: Activite[];
  distinctActivities: Activite[];
}

export default function FicheTechniqueTab({ isEntreprise, franchiseActivities, distinctActivities }: Props) {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const actCtx = searchParams.get('actCtx') || '';
  const isFranchiseCtx = actCtx === 'franchise';
  const isDistinctCtx = actCtx === 'distinct' || actCtx.startsWith('distinct-');
  const specificDistinctId = actCtx.startsWith('distinct-') ? actCtx.replace('distinct-', '') : '';

  // Step 1a: franchise group picker
  const franchiseGroups = Array.from(new Set(franchiseActivities.map((a) => a.franchiseGroup || a.nom))).sort();
  const [selectedFranchiseGroup, setSelectedFranchiseGroup] = useState<string>('');
  // Step 2: only activities with ingredients assigned
  const allActivitiesInGroup = franchiseActivities.filter((a) => (a.franchiseGroup || a.nom) === selectedFranchiseGroup);
  const activitiesInGroup = allActivitiesInGroup.filter((a) => (a.ingredientCount ?? 0) > 0);

  // Step 1b: franchise activity picker within selected group
  const [selectedFranchiseActId, setSelectedFranchiseActId] = useState<string>('');
  // Step 1b: distinct activity picker (when actCtx='distinct' without specific ID)
  const [selectedDistinctActId, setSelectedDistinctActId] = useState<string>(specificDistinctId);

  // Product type availability (pre-fetched when activity step is done)
  const [vendableCount, setVendableCount] = useState<number | null>(null);
  const [utilisableCount, setUtilisableCount] = useState<number | null>(null);

  // Step 2: product type
  const [productType, setProductType] = useState<'vendable' | 'utilisable' | ''>('');

  // Step 3: products
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string>('');

  // Step 4: mode
  const [mode, setMode] = useState<'stock' | 'manual' | null>(null);

  // FP Stock check (replaces date selection)
  interface StockCheckResult {
    complete: boolean;
    missing: { ingredientId: number; nom: string; unite: string; lastQty: number | null; lastPrice: number | null; lastDate: string | null }[];
    groups: { label: string; depth: number; ingredients: { ingredientId: number; nom: string; unite: string }[] }[];
  }
  const [stockCheckResult, setStockCheckResult] = useState<StockCheckResult | null>(null);
  const [stockCheckLoading, setStockCheckLoading] = useState(false);
  const [showMissingPopup, setShowMissingPopup] = useState(false);
  const [missingFillData, setMissingFillData] = useState<Record<number, { qty: string; price: string; date: string }>>({});
  const [savingMissing, setSavingMissing] = useState(false);

  // FP Manuel
  const [manualPrices, setManualPrices] = useState<ManualPriceEntry[]>([]);
  const [manualPriceGroups, setManualPriceGroups] = useState<ManualPriceGroup[]>([]);
  const [manualLoading, setManualLoading] = useState(false);
  const [manualUpdatedAt, setManualUpdatedAt] = useState<string | null>(null);
  const [costRefreshKey, setCostRefreshKey] = useState(0);
  const [showManualPopup, setShowManualPopup] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  // Zero-price warning popup
  const [showZeroWarning, setShowZeroWarning] = useState(false);
  const [zeroWarningPrices, setZeroWarningPrices] = useState<ManualPriceEntry[]>([]);

  // Cost after mode selection
  const [realtimeCost, setRealtimeCost] = useState<number | null>(null);
  const [costLoading, setCostLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Resolved activity ID for API calls
  const resolvedActId = (() => {
    if (!isEntreprise) return 0;
    if (isFranchiseCtx && selectedFranchiseActId) return parseInt(selectedFranchiseActId);
    if (isDistinctCtx) {
      const id = specificDistinctId || selectedDistinctActId;
      return id ? parseInt(id) : 0;
    }
    return 0;
  })();

  // Whether the activity step is complete
  const actStepDone = (() => {
    if (!isEntreprise) return true;
    if (isFranchiseCtx) {
      if (!selectedFranchiseGroup) return false;
      return activitiesInGroup.length <= 1 || !!selectedFranchiseActId;
    }
    if (isDistinctCtx) return !!(specificDistinctId || selectedDistinctActId);
    return false;
  })();

  // Auto-select franchise group if only one
  useEffect(() => {
    if (isFranchiseCtx && franchiseGroups.length === 1 && !selectedFranchiseGroup) {
      setSelectedFranchiseGroup(franchiseGroups[0]);
    }
  }, [isFranchiseCtx, franchiseGroups.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-select activity if only one in the selected group
  useEffect(() => {
    if (activitiesInGroup.length === 1) {
      setSelectedFranchiseActId(String(activitiesInGroup[0].id));
    } else {
      setSelectedFranchiseActId('');
    }
    setMode(null);
    setSelectedProductId('');
  }, [selectedFranchiseGroup]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-fetch product type counts when activity step is done
  useEffect(() => {
    if (!actStepDone) { setVendableCount(null); setUtilisableCount(null); return; }
    api.get('/products?type=vendable').then(({ data }) => setVendableCount((data as unknown[]).length)).catch(() => setVendableCount(0));
    api.get('/products?type=utilisable').then(({ data }) => setUtilisableCount((data as unknown[]).length)).catch(() => setUtilisableCount(0));
  }, [actStepDone, resolvedActId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load products when productType + activity are ready
  useEffect(() => {
    if (!productType || !actStepDone) { setProducts([]); setSelectedProductId(''); return; }
    setProductsLoading(true);
    // Only filter by product type (vendable/utilisable); the activity context only
    // matters for ingredient/price lookups, not which products are selectable here.
    const params = new URLSearchParams({ type: productType });
    api.get(`/products?${params}`)
      .then(({ data }) => setProducts(data as Product[]))
      .finally(() => setProductsLoading(false));
    setSelectedProductId('');
    setMode(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productType, resolvedActId, actStepDone, isFranchiseCtx]);

  // Load stock check when mode='stock' and product selected
  useEffect(() => {
    if (mode !== 'stock' || !selectedProductId) { setStockCheckResult(null); return; }
    setStockCheckLoading(true);
    const params = new URLSearchParams();
    if (resolvedActId) params.set('activiteId', String(resolvedActId));
    api.get(`/products/${selectedProductId}/stock-check?${params}`)
      .then(({ data }) => {
        const result = data as StockCheckResult;
        setStockCheckResult(result);
        const fillData: Record<number, { qty: string; price: string; date: string }> = {};
        const today = new Date().toISOString().slice(0, 10);
        for (const ing of result.missing) {
          fillData[ing.ingredientId] = {
            qty: ing.lastQty !== null ? String(ing.lastQty) : '',
            price: ing.lastPrice !== null ? String(ing.lastPrice) : '',
            date: ing.lastDate || today,
          };
        }
        setMissingFillData(fillData);
      })
      .catch(() => setStockCheckResult(null))
      .finally(() => setStockCheckLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedProductId, resolvedActId]);

  // Auto-load manual prices when FP Manuel is selected
  useEffect(() => {
    if (mode !== 'manual' || !selectedProductId) return;
    loadManualPrices();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedProductId]);

  // Load real-time cost after mode is selected.
  // FP Manuel uses saved manual prices; FP Stock uses stock/catalogue prices.
  useEffect(() => {
    if (!selectedProductId || !mode) { setRealtimeCost(null); return; }
    setCostLoading(true);
    const params = new URLSearchParams({ mode });
    if (resolvedActId) params.set('activiteId', String(resolvedActId));
    api.get(`/products/${selectedProductId}/cout?${params}`)
      .then(({ data }) => setRealtimeCost((data as { totalCost: number }).totalCost ?? null))
      .catch(() => setRealtimeCost(null))
      .finally(() => setCostLoading(false));
  // costRefreshKey increments on every save so the effect always re-runs even when the date is unchanged
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProductId, mode, costRefreshKey, resolvedActId]);

  const loadManualPrices = async () => {
    if (!selectedProductId) return;
    setManualLoading(true);
    try {
      const qs = resolvedActId ? `?activiteId=${resolvedActId}` : '';
      const { data } = await api.get(`/products/${selectedProductId}/manual-prices${qs}`);
      const { prices, groups, updatedAt } = data as {
        prices: { ingredientId: number; nom: string; unite: string; prixUnitaire: number | null }[];
        groups: ManualPriceGroup[];
        updatedAt: string | null;
      };
      setManualPrices(prices.map((r) => ({
        ingredientId: r.ingredientId,
        nom: r.nom,
        unite: r.unite,
        prixUnitaire: r.prixUnitaire !== null ? String(r.prixUnitaire) : '',
      })));
      setManualPriceGroups(groups || []);
      setManualUpdatedAt(updatedAt ? updatedAt.slice(0, 10) : null);
    } finally {
      setManualLoading(false);
    }
  };

  const doSaveManualPrices = async () => {
    setSavingManual(true);
    try {
      const payload = {
        activiteId: resolvedActId,
        prices: manualPrices
          .filter((p) => p.prixUnitaire !== '' && !isNaN(parseFloat(p.prixUnitaire)))
          .map((p) => ({ ingredientId: p.ingredientId, prixUnitaire: parseFloat(p.prixUnitaire) })),
      };
      const { data } = await api.post(`/products/${selectedProductId}/manual-prices`, payload);
      setShowManualPopup(false);
      setShowZeroWarning(false);
      const savedAt = (data as { updatedAt: string | null }).updatedAt;
      setManualUpdatedAt(savedAt ? savedAt.slice(0, 10) : new Date().toISOString().slice(0, 10));
      setCostRefreshKey((k) => k + 1);
      await loadManualPrices();
    } finally {
      setSavingManual(false);
    }
  };

  const saveMissingStock = async () => {
    if (!stockCheckResult) return;
    setSavingMissing(true);
    const today = new Date().toISOString().slice(0, 10);
    try {
      for (const ing of stockCheckResult.missing) {
        const fill = missingFillData[ing.ingredientId];
        if (!fill || !fill.qty || !fill.price) continue;
        const payload = {
          quantite: parseFloat(fill.qty),
          prixUnitaire: parseFloat(fill.price),
          dateAppro: fill.date || today,
        };
        if (resolvedActId) {
          await api.put(`/api/stock/entreprise/${resolvedActId}/${ing.ingredientId}`, payload);
        } else {
          await api.put(`/api/stock/client/${ing.ingredientId}`, payload);
        }
      }
      // Re-check stock
      const params = new URLSearchParams();
      if (resolvedActId) params.set('activiteId', String(resolvedActId));
      const { data } = await api.get(`/products/${selectedProductId}/stock-check?${params}`);
      const result = data as StockCheckResult;
      setStockCheckResult(result);
      if (result.complete) {
        setShowMissingPopup(false);
        setCostRefreshKey((k) => k + 1);
      } else {
        const fillData: Record<number, { qty: string; price: string; date: string }> = {};
        for (const ing of result.missing) {
          fillData[ing.ingredientId] = missingFillData[ing.ingredientId] || {
            qty: ing.lastQty !== null ? String(ing.lastQty) : '',
            price: ing.lastPrice !== null ? String(ing.lastPrice) : '',
            date: ing.lastDate || today,
          };
        }
        setMissingFillData(fillData);
      }
    } finally {
      setSavingMissing(false);
    }
  };

  const saveManualPrices = async () => {
    const zeros = manualPrices.filter((p) => {
      const v = parseFloat(p.prixUnitaire);
      return isNaN(v) || v <= 0;
    });
    if (zeros.length > 0) {
      setZeroWarningPrices(zeros.map((p) => ({ ...p })));
      setShowZeroWarning(true);
      return;
    }
    await doSaveManualPrices();
  };

  const generateExcel = async () => {
    if (!selectedProductId || !mode) return;
    setGenerating(true);
    try {
      const params = new URLSearchParams({ mode });
      if (resolvedActId) params.set('activiteId', String(resolvedActId));
      // FP Stock: always uses latest appro — no date param needed
      const response = await api.get(`/products/${selectedProductId}/export?${params}`, { responseType: 'blob' });
      const selectedProduct = products.find((p) => String(p.id) === selectedProductId);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `fiche-technique-${selectedProduct?.name ?? selectedProductId}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } finally {
      setGenerating(false);
    }
  };

  const selectedProduct = products.find((p) => String(p.id) === selectedProductId) ?? null;
  const hasIngredients = (selectedProduct?.ingredientsCount ?? 0) > 0;

  const allManualPricesFilled =
    manualPrices.length > 0 &&
    manualPrices.every((p) => {
      const v = parseFloat(p.prixUnitaire);
      return !isNaN(v) && v > 0;
    });

  const canGenerateStock = mode === 'stock' && stockCheckResult?.complete === true;
  const canGenerateManual = mode === 'manual' && allManualPricesFilled;
  const canGenerate = canGenerateStock || canGenerateManual;

  const distinctActivity = specificDistinctId
    ? distinctActivities.find((a) => String(a.id) === specificDistinctId)
    : distinctActivities.find((a) => String(a.id) === selectedDistinctActId);

  const cardStyle: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '16px 20px',
    marginBottom: 14,
  };

  const stepLabel: React.CSSProperties = {
    display: 'block',
    fontSize: '0.7rem',
    fontWeight: 700,
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    marginBottom: 10,
  };

  const chipBtn = (active: boolean, disabled = false): React.CSSProperties => ({
    padding: '7px 14px',
    borderRadius: 6,
    border: '2px solid',
    borderColor: active ? 'var(--primary)' : 'var(--border)',
    background: active ? 'var(--primary)' : 'transparent',
    color: active ? '#fff' : disabled ? 'var(--text-muted)' : 'var(--text)',
    fontWeight: active ? 700 : 400,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    fontSize: '0.875rem',
    transition: 'all 0.12s',
  });

  return (
    <div style={{ maxWidth: 700 }}>

      {/* Step 1a: Franchise group picker — always shown */}
      {isEntreprise && isFranchiseCtx && franchiseGroups.length >= 1 && (
        <div style={{ ...cardStyle, borderLeft: '4px solid var(--primary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 800, flexShrink: 0 }}>1</span>
            <span style={stepLabel}>Franchise</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {franchiseGroups.map((g) => (
              <button
                key={g}
                style={chipBtn(selectedFranchiseGroup === g)}
                onClick={() => setSelectedFranchiseGroup(g)}
              >
                🏢 {g}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 1b: Block message when group has no activities with ingredients */}
      {isEntreprise && isFranchiseCtx && selectedFranchiseGroup && allActivitiesInGroup.length > 0 && activitiesInGroup.length === 0 && (
        <div style={{ ...cardStyle, borderLeft: '4px solid var(--primary)', background: '#fff7ed' }}>
          <p style={{ margin: 0, color: '#c05621', fontSize: '0.88rem' }}>
            ⚠️ Aucune activité de ce groupe n'a encore d'ingrédients assignés. Rendez-vous dans le <strong>Catalogue Global</strong> pour en assigner.
          </p>
        </div>
      )}

      {/* Step 1b: Activity within the selected franchise group */}
      {isEntreprise && isFranchiseCtx && selectedFranchiseGroup && activitiesInGroup.length > 1 && (
        <div style={{ ...cardStyle, borderLeft: '4px solid var(--primary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 800, flexShrink: 0 }}>{franchiseGroups.length > 1 ? '2' : '1'}</span>
            <span style={stepLabel}>Activité — {selectedFranchiseGroup}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {activitiesInGroup.map((a) => (
              <button
                key={a.id}
                style={chipBtn(selectedFranchiseActId === String(a.id))}
                onClick={() => { setSelectedFranchiseActId(String(a.id)); setMode(null); setSelectedProductId(''); }}
              >
                {a.nom}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 1: Activity selection for generic distinct (no specific ID in URL) */}
      {isEntreprise && actCtx === 'distinct' && (
        <div style={cardStyle}>
          <span style={stepLabel}>Activité distincte</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {distinctActivities.map((a) => (
              <button
                key={a.id}
                style={chipBtn(selectedDistinctActId === String(a.id))}
                onClick={() => { setSelectedDistinctActId(String(a.id)); setMode(null); setSelectedProductId(''); }}
              >
                {a.nom}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Activity badge (when specific distinct ID in URL) */}
      {isEntreprise && specificDistinctId && distinctActivity && (
        <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px' }}>
          <span style={{ ...stepLabel, margin: 0 }}>Activité</span>
          <span style={{ fontWeight: 700, color: 'var(--primary)' }}>D · {distinctActivity.nom}</span>
        </div>
      )}

      {/* Step 2: Product type */}
      {actStepDone && (
        <div style={{ ...cardStyle, borderLeft: '4px solid #10b981' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#10b981', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 800, flexShrink: 0 }}>
              {isFranchiseCtx ? (franchiseGroups.length > 1 ? (activitiesInGroup.length > 1 ? '3' : '2') : activitiesInGroup.length > 1 ? '2' : '1') : isDistinctCtx && !specificDistinctId ? '2' : '1'}
            </span>
            <span style={stepLabel}>Type de produit</span>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {([
              { key: 'vendable', icon: '🍔', label: t('client.products.tab_vendable'), count: vendableCount },
              { key: 'utilisable', icon: '🧪', label: t('client.products.tab_utilisable'), count: utilisableCount },
            ] as { key: string; icon: string; label: string; count: number | null }[])
              .filter(({ count }) => count === null || count > 0)
              .map(({ key, icon, label }) => (
                <button
                  key={key}
                  style={{
                    flex: 1,
                    padding: '11px 16px',
                    borderRadius: 8,
                    border: '2px solid',
                    borderColor: productType === key ? 'var(--primary)' : 'var(--border)',
                    background: productType === key ? 'var(--primary)' : 'transparent',
                    color: productType === key ? '#fff' : 'var(--text)',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    transition: 'all 0.12s',
                  }}
                  onClick={() => { setProductType(key as 'vendable' | 'utilisable'); setMode(null); setSelectedProductId(''); }}
                >
                  {icon} {label}
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Step 3: Product */}
      {productType && actStepDone && (
        <div style={{ ...cardStyle, borderLeft: '4px solid #f59e0b' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#f59e0b', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 800, flexShrink: 0 }}>
              {isFranchiseCtx ? (franchiseGroups.length > 1 ? (activitiesInGroup.length > 1 ? '4' : '3') : activitiesInGroup.length > 1 ? '3' : '2') : isDistinctCtx && !specificDistinctId ? '3' : '2'}
            </span>
            <span style={stepLabel}>Produit</span>
          </div>
          {productsLoading ? (
            <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{t('common.loading')}</span>
          ) : products.length === 0 ? (
            <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Aucun produit trouvé</span>
          ) : (
            <select
              className="input"
              style={{ maxWidth: 420 }}
              value={selectedProductId}
              onChange={(e) => { setSelectedProductId(e.target.value); setMode(null); setStockCheckResult(null); }}
            >
              <option value="">— {t('client.fiche_technique.choose_product')} —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Step 4: Mode */}
      {selectedProductId && (
        <div style={{ ...cardStyle, borderLeft: '4px solid #8b5cf6' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#8b5cf6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 800, flexShrink: 0 }}>
              {isFranchiseCtx ? (franchiseGroups.length > 1 ? (activitiesInGroup.length > 1 ? '5' : '4') : activitiesInGroup.length > 1 ? '4' : '3') : isDistinctCtx && !specificDistinctId ? '4' : '3'}
            </span>
            <span style={stepLabel}>{t('client.fiche_technique.choose_mode')}</span>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>

            {/* FP Stock card */}
            <div
              style={{
                flex: 1, minWidth: 220, padding: 16, borderRadius: 10,
                border: '2px solid',
                borderColor: mode === 'stock' ? 'var(--primary)' : 'var(--border)',
                background: mode === 'stock' ? '#eef2ff' : 'var(--bg)',
                cursor: hasIngredients ? 'pointer' : 'not-allowed',
                opacity: !hasIngredients ? 0.45 : 1,
                transition: 'all 0.15s',
              }}
              onClick={() => { if (hasIngredients) setMode('stock'); }}
            >
              <div style={{ fontWeight: 700, marginBottom: 4, color: mode === 'stock' ? 'var(--primary)' : 'var(--text)' }}>
                📦 FP Stock
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: mode === 'stock' ? 8 : 0 }}>
                {!hasIngredients ? 'Aucun ingrédient' : 'Utilise les derniers prix d\'appro'}
              </div>
              {mode === 'stock' && (
                <div style={{ marginTop: 4 }}>
                  {stockCheckLoading ? (
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{t('common.loading')}</span>
                  ) : stockCheckResult?.complete ? (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      fontSize: '0.78rem', fontWeight: 600, color: '#16a34a',
                      background: '#dcfce7', borderRadius: 20, padding: '3px 10px',
                    }}>✓ {t('client.stock.stock_complete')}</span>
                  ) : stockCheckResult && !stockCheckResult.complete ? (
                    <div>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        fontSize: '0.78rem', fontWeight: 600, color: '#b45309',
                        background: '#fef3c7', borderRadius: 20, padding: '3px 10px', marginBottom: 6,
                      }}>⚠ {stockCheckResult.missing.length} ingrédient(s) manquant(s)</span>
                      <button
                        className="btn btn-sm"
                        style={{ display: 'block', fontSize: '0.78rem', background: '#f59e0b', color: '#fff', borderColor: 'transparent', marginTop: 4 }}
                        onClick={(e) => { e.stopPropagation(); setShowMissingPopup(true); }}
                      >
                        {t('client.stock.complete_stock')}
                      </button>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {/* FP Manuel card */}
            <div
              style={{
                flex: 1, minWidth: 220, padding: 16, borderRadius: 10,
                border: '2px solid',
                borderColor: mode === 'manual' ? 'var(--primary)' : 'var(--border)',
                background: mode === 'manual' ? '#eef2ff' : 'var(--bg)',
                cursor: hasIngredients ? 'pointer' : 'not-allowed',
                opacity: !hasIngredients ? 0.45 : 1,
                transition: 'all 0.15s',
              }}
              onClick={() => { if (hasIngredients) setMode('manual'); }}
            >
              <div style={{ fontWeight: 700, marginBottom: 4, color: mode === 'manual' ? 'var(--primary)' : 'var(--text)' }}>
                ✏️ FP Manuel
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: mode === 'manual' ? 10 : 0 }}>
                {!hasIngredients ? 'Aucun ingrédient' : 'Saisissez vos prix manuellement'}
              </div>
              {mode === 'manual' && (
                <div>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: '0.8rem' }}
                    onClick={(e) => { e.stopPropagation(); setShowManualPopup(true); }}
                  >
                    ✏️ {t('client.fiche_technique.edit_manual_prices')}
                  </button>
                  {manualUpdatedAt && (
                    <div style={{ fontSize: '0.75rem', marginTop: 6, color: 'var(--text-muted)' }}>
                      {t('client.fiche_technique.last_updated')} :{' '}
                      <span style={{ fontWeight: 700, color: '#d97706', background: '#fef3c7', borderRadius: 4, padding: '1px 6px' }}>{manualUpdatedAt}</span>
                    </div>
                  )}
                  {!allManualPricesFilled && manualPrices.length > 0 && !manualLoading && (
                    <div style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: 6 }}>
                      ⚠ Saisissez tous les prix pour générer la Fiche technique
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cost + Generate */}
      {mode && selectedProductId && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 0, flexWrap: 'wrap',
          background: 'var(--surface)', borderRadius: 14,
          border: '1px solid var(--border)', boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
          marginTop: 8, overflow: 'hidden',
        }}>
          {/* Cost section */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 22px', flex: 1, minWidth: 200 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem',
            }}>💰</div>
            <div>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 2 }}>
                {t('client.products.real_time_cost')}
              </div>
              {costLoading ? (
                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>…</div>
              ) : mode === 'stock' && !stockCheckLoading && stockCheckResult && !stockCheckResult.complete ? (
                <div style={{ fontSize: '0.8rem', color: '#b45309', fontWeight: 600 }}>
                  ⚠ {t('client.stock.missing_stock_msg').split('.')[0]}
                </div>
              ) : realtimeCost !== null ? (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                  <span style={{ fontWeight: 800, fontSize: '1.5rem', color: 'var(--primary)', letterSpacing: '-0.02em', lineHeight: 1 }}>
                    {realtimeCost.toFixed(3)}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('currency')}</span>
                </div>
              ) : (
                <div style={{ fontSize: '1.1rem', color: 'var(--text-muted)' }}>—</div>
              )}
            </div>
          </div>

          {/* Separator */}
          <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)', flexShrink: 0 }} />

          {/* Generate button */}
          <div style={{ padding: '14px 20px', flexShrink: 0 }}>
            <button
              className="btn btn-primary"
              style={{ paddingLeft: 22, paddingRight: 22, height: 40, fontSize: '0.9rem', fontWeight: 600, gap: 8 }}
              disabled={!canGenerate || generating}
              onClick={generateExcel}
              title={
                mode === 'manual' && !canGenerateManual
                  ? 'Saisissez tous les prix manuels d\'abord'
                  : mode === 'stock' && !canGenerateStock
                    ? 'Complétez le stock pour tous les ingrédients d\'abord'
                    : ''
              }
            >
              📥 {generating ? t('common.loading') : t('client.fiche_technique.generate')}
            </button>
          </div>
        </div>
      )}

      {/* Manual prices popup */}
      {showManualPopup && (
        <div className="modal-overlay" onClick={() => setShowManualPopup(false)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header modal-header--primary">
              <h2>Prix Ingrédients — {products.find((p) => p.id === parseInt(selectedProductId))?.nom ?? ''}</h2>
              <button className="modal-close" onClick={() => setShowManualPopup(false)}>×</button>
            </div>
            <div className="modal-body">
              {manualLoading ? (
                <div className="loading-text">{t('common.loading')}</div>
              ) : manualPrices.length === 0 ? (
                <p style={{ color: '#888', textAlign: 'center' }}>{t('client.products.popup_no_ingredients')}</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('client.products.popup_col_ingredient')}</th>
                      <th style={{ width: 80 }}>{t('client.products.popup_col_unit')}</th>
                      <th style={{ textAlign: 'right', whiteSpace: 'nowrap', width: 130 }}>{t('client.products.popup_col_unit_price')} (DT)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(manualPriceGroups.length > 0 ? manualPriceGroups : [{ label: '', depth: 0, ingredients: manualPrices.map(p => ({ ingredientId: p.ingredientId, nom: p.nom, unite: p.unite })) }]).map((group, gi) => (
                      <>
                        {/* Group header — only for sub-product levels (depth > 0); depth 0 name is in the popup title */}
                        {manualPriceGroups.length > 1 && group.depth > 0 && (
                          <tr key={`gh-${gi}`}>
                            <td colSpan={3} style={{
                              paddingLeft: 8 + group.depth * 16,
                              paddingTop: gi === 0 ? 4 : 10,
                              paddingBottom: 2,
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              letterSpacing: '0.04em',
                              textTransform: 'uppercase',
                              color: group.depth === 0 ? 'var(--primary)' : 'var(--text-muted)',
                              borderTop: gi === 0 ? undefined : '1px solid var(--border)',
                            }}>
                              {group.depth > 0 ? '↳ ' : ''}{group.label}
                            </td>
                          </tr>
                        )}
                        {group.ingredients.map((ing) => {
                          const idx = manualPrices.findIndex((p) => p.ingredientId === ing.ingredientId);
                          if (idx === -1) return null;
                          const p = manualPrices[idx];
                          return (
                            <tr key={p.ingredientId}>
                              <td style={{ paddingLeft: manualPriceGroups.length > 1 ? 8 + group.depth * 16 + 8 : undefined }}>
                                {p.nom}
                              </td>
                              <td>{p.unite}</td>
                              <td style={{ textAlign: 'right' }}>
                                <input
                                  type="number"
                                  className="input"
                                  style={{ textAlign: 'right', width: 110, display: 'block', marginLeft: 'auto' }}
                                  step="0.001"
                                  min="0"
                                  placeholder="0.000"
                                  value={p.prixUnitaire}
                                  onChange={(e) => {
                                    const updated = [...manualPrices];
                                    updated[idx] = { ...updated[idx], prixUnitaire: e.target.value };
                                    setManualPrices(updated);
                                  }}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowManualPopup(false)}>{t('common.cancel')}</button>
              <button className="btn btn-primary" onClick={saveManualPrices} disabled={savingManual || manualLoading}>
                {savingManual ? t('common.loading') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Missing stock popup */}
      {showMissingPopup && stockCheckResult && (
        <div className="modal-overlay" onClick={() => setShowMissingPopup(false)}>
          <div className="modal" style={{ maxWidth: 580 }} onClick={(e) => e.stopPropagation()}>
            <div style={{
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              padding: '20px 24px 16px',
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>⚠️</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: '#fff' }}>{t('client.stock.missing_stock_title')}</div>
                  <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>
                    {t('client.stock.missing_stock_msg')}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowMissingPopup(false)}
                style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: '1rem', padding: '2px 8px', cursor: 'pointer', lineHeight: 1.4 }}
              >×</button>
            </div>
            <div style={{ padding: '16px 24px', maxHeight: '60vh', overflowY: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('client.historique_appro.ingredient')}</th>
                    <th style={{ width: 60 }}>{t('common.unit')}</th>
                    <th style={{ width: 110, textAlign: 'right' }}>Qté</th>
                    <th style={{ width: 110, textAlign: 'right' }}>{t('common.price')} (DT)</th>
                    <th style={{ width: 140 }}>{t('client.stock.date_appro')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(stockCheckResult.groups.length > 0 ? stockCheckResult.groups : [{ label: '', depth: 0, ingredients: stockCheckResult.missing.map(m => ({ ingredientId: m.ingredientId, nom: m.nom, unite: m.unite })) }]).map((group, gi) => {
                    const missingIds = new Set(stockCheckResult.missing.map(m => m.ingredientId));
                    const visibleIngs = group.ingredients.filter(ing => missingIds.has(ing.ingredientId));
                    if (visibleIngs.length === 0) return null;
                    return (
                      <>
                        {stockCheckResult.groups.length > 1 && group.depth > 0 && (
                          <tr key={`mg-${gi}`}>
                            <td colSpan={5} style={{
                              paddingLeft: 8 + group.depth * 16,
                              paddingTop: gi === 0 ? 4 : 10,
                              paddingBottom: 2,
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              color: 'var(--text-muted)',
                              borderTop: gi === 0 ? undefined : '1px solid var(--border)',
                            }}>↳ {group.label}</td>
                          </tr>
                        )}
                        {visibleIngs.map((ing) => {
                          const fill = missingFillData[ing.ingredientId] || { qty: '', price: '', date: new Date().toISOString().slice(0, 10) };
                          return (
                            <tr key={ing.ingredientId}>
                              <td style={{ fontWeight: 500 }}>{ing.nom}</td>
                              <td style={{ color: 'var(--text-muted)' }}>{ing.unite}</td>
                              <td style={{ textAlign: 'right' }}>
                                <input
                                  type="number" className="input"
                                  style={{ width: 90, textAlign: 'right', display: 'block', marginLeft: 'auto' }}
                                  step="0.001" min="0" placeholder="0"
                                  value={fill.qty}
                                  onChange={(e) => setMissingFillData(prev => ({ ...prev, [ing.ingredientId]: { ...fill, qty: e.target.value } }))}
                                />
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <input
                                  type="number" className="input"
                                  style={{ width: 90, textAlign: 'right', display: 'block', marginLeft: 'auto', borderColor: !fill.price ? '#f59e0b' : undefined }}
                                  step="0.001" min="0.001" placeholder="0.000"
                                  value={fill.price}
                                  onChange={(e) => setMissingFillData(prev => ({ ...prev, [ing.ingredientId]: { ...fill, price: e.target.value } }))}
                                />
                              </td>
                              <td>
                                <input
                                  type="date" className="input"
                                  style={{ width: 130 }}
                                  value={fill.date}
                                  onChange={(e) => setMissingFillData(prev => ({ ...prev, [ing.ingredientId]: { ...fill, date: e.target.value } }))}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '12px 24px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-ghost" onClick={() => setShowMissingPopup(false)}>{t('common.cancel')}</button>
              <button
                className="btn btn-primary"
                style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', borderColor: 'transparent' }}
                disabled={savingMissing}
                onClick={saveMissingStock}
              >
                {savingMissing ? t('common.loading') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Zero-price warning popup — rendered after main popup so it stacks on top */}
      {showZeroWarning && (
        <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={() => setShowZeroWarning(false)}>
          <div className="modal" style={{ maxWidth: 500, borderRadius: 16, overflow: 'hidden', padding: 0 }} onClick={(e) => e.stopPropagation()}>
            {/* Coloured header band */}
            <div style={{
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              padding: '20px 24px 16px',
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>⚠️</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: '#fff' }}>Prix incomplets</div>
                  <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>
                    Ces ingrédients ont un prix à 0 — corrigez-les avant d'enregistrer.
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowZeroWarning(false)}
                style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: '1rem', padding: '2px 8px', cursor: 'pointer', lineHeight: 1.4 }}
              >×</button>
            </div>

            {/* Body */}
            <div style={{ padding: '16px 24px' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('client.products.popup_col_ingredient')}</th>
                    <th style={{ width: 80 }}>{t('client.products.popup_col_unit')}</th>
                    <th style={{ textAlign: 'right', whiteSpace: 'nowrap', width: 130 }}>{t('client.products.popup_col_unit_price')} (DT)</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const zeroIds = new Set(zeroWarningPrices.map((p) => p.ingredientId));
                    // Build cascade: groups that have at least one zero-price ingredient
                    const warningGroups = manualPriceGroups
                      .map((g) => ({ ...g, ingredients: g.ingredients.filter((ing) => zeroIds.has(ing.ingredientId)) }))
                      .filter((g) => g.ingredients.length > 0);
                    const hasGroups = warningGroups.length > 1 || (warningGroups.length === 1 && warningGroups[0].depth > 0);
                    let firstInput = true;
                    return warningGroups.map((group, gi) => (
                      <>
                        {hasGroups && group.depth > 0 && (
                          <tr key={`wgh-${gi}`}>
                            <td colSpan={3} style={{
                              paddingLeft: 8 + group.depth * 16,
                              paddingTop: gi === 0 ? 4 : 10,
                              paddingBottom: 2,
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              letterSpacing: '0.04em',
                              textTransform: 'uppercase',
                              color: 'var(--text-muted)',
                              borderTop: gi === 0 ? undefined : '1px solid var(--border)',
                            }}>
                              ↳ {group.label}
                            </td>
                          </tr>
                        )}
                        {group.ingredients.map((ing) => {
                          const wi = zeroWarningPrices.findIndex((x) => x.ingredientId === ing.ingredientId);
                          if (wi === -1) return null;
                          const p = zeroWarningPrices[wi];
                          const isFirst = firstInput;
                          if (firstInput) firstInput = false;
                          return (
                            <tr key={p.ingredientId}>
                              <td style={{ fontWeight: 500, paddingLeft: hasGroups ? 8 + group.depth * 16 + 8 : undefined }}>{p.nom}</td>
                              <td style={{ color: 'var(--text-muted)' }}>{p.unite}</td>
                              <td style={{ textAlign: 'right' }}>
                                <input
                                  type="number"
                                  className="input"
                                  style={{ textAlign: 'right', width: 110, display: 'block', marginLeft: 'auto', borderColor: '#f59e0b' }}
                                  step="0.001"
                                  min="0.001"
                                  placeholder="0.000"
                                  autoFocus={isFirst}
                                  value={p.prixUnitaire}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setZeroWarningPrices((prev) => prev.map((x, j) => j === wi ? { ...x, prixUnitaire: val } : x));
                                    setManualPrices((prev) => prev.map((x) => x.ingredientId === p.ingredientId ? { ...x, prixUnitaire: val } : x));
                                  }}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </>
                    ));
                  })()}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div style={{ padding: '12px 24px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-ghost" onClick={() => setShowZeroWarning(false)}>{t('common.cancel')}</button>
              <button
                className="btn btn-primary"
                style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', borderColor: 'transparent' }}
                disabled={savingManual || zeroWarningPrices.some((p) => { const v = parseFloat(p.prixUnitaire); return isNaN(v) || v <= 0; })}
                onClick={doSaveManualPrices}
              >
                {savingManual ? t('common.loading') : 'Confirmer et enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
