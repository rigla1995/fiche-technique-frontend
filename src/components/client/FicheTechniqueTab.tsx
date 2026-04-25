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

  // Step 1: franchise activity picker (when multiple franchise activities exist)
  const [selectedFranchiseActId, setSelectedFranchiseActId] = useState<string>('');
  // Step 1b: distinct activity picker (when actCtx='distinct' without specific ID)
  const [selectedDistinctActId, setSelectedDistinctActId] = useState<string>(specificDistinctId);

  // Step 2: product type
  const [productType, setProductType] = useState<'vendable' | 'utilisable' | ''>('');

  // Step 3: products
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string>('');

  // Step 4: mode
  const [mode, setMode] = useState<'stock' | 'manual' | null>(null);

  // FP Stock
  const [stockDates, setStockDates] = useState<string[]>([]);
  const [stockDatesLoading, setStockDatesLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>('');

  // FP Manuel
  const [manualPrices, setManualPrices] = useState<ManualPriceEntry[]>([]);
  const [manualPriceGroups, setManualPriceGroups] = useState<ManualPriceGroup[]>([]);
  const [manualLoading, setManualLoading] = useState(false);
  const [manualUpdatedAt, setManualUpdatedAt] = useState<string | null>(null);
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
    if (isFranchiseCtx) return franchiseActivities.length <= 1 || !!selectedFranchiseActId;
    if (isDistinctCtx) return !!(specificDistinctId || selectedDistinctActId);
    return false;
  })();

  // Auto-select franchise activity if only one
  useEffect(() => {
    if (isFranchiseCtx && franchiseActivities.length === 1) {
      setSelectedFranchiseActId(String(franchiseActivities[0].id));
    }
  }, [isFranchiseCtx, franchiseActivities]);

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

  // Load stock dates when product selected (all dates, not limited to current month)
  useEffect(() => {
    if (!selectedProductId) { setStockDates([]); setSelectedDate(''); return; }
    setStockDatesLoading(true);
    const params = new URLSearchParams();
    if (resolvedActId) params.set('activiteId', String(resolvedActId));
    api.get(`/products/${selectedProductId}/stock-dates?${params}`)
      .then(({ data }) => {
        const d = data as { dates?: string[] } | string[];
        setStockDates(Array.isArray(d) ? d : (d.dates ?? []));
        setSelectedDate('');
      })
      .catch(() => setStockDates([]))
      .finally(() => setStockDatesLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProductId, resolvedActId]);

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
    if (mode === 'manual' && resolvedActId) params.set('activiteId', String(resolvedActId));
    api.get(`/products/${selectedProductId}/cout?${params}`)
      .then(({ data }) => setRealtimeCost((data as { totalCost: number }).totalCost ?? null))
      .catch(() => setRealtimeCost(null))
      .finally(() => setCostLoading(false));
  // manualUpdatedAt is included so cost refreshes after manual prices are saved
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProductId, mode, manualUpdatedAt, resolvedActId]);

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
      await loadManualPrices();
    } finally {
      setSavingManual(false);
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
      if (mode === 'stock' && selectedDate) params.set('date', selectedDate);
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

  const canGenerateStock = mode === 'stock' && !!selectedDate;
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

      {/* Step 1: Activity selection for franchise (multiple activities) */}
      {isEntreprise && isFranchiseCtx && franchiseActivities.length > 1 && (
        <div style={cardStyle}>
          <span style={stepLabel}>Activité franchise</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {franchiseActivities.map((a) => (
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
        <div style={cardStyle}>
          <span style={stepLabel}>Type de produit</span>
          <div style={{ display: 'flex', gap: 10 }}>
            {[
              { key: 'vendable', icon: '🍔', label: t('client.products.tab_vendable') },
              { key: 'utilisable', icon: '🧪', label: t('client.products.tab_utilisable') },
            ].map(({ key, icon, label }) => (
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
        <div style={cardStyle}>
          <span style={stepLabel}>Produit</span>
          {productsLoading ? (
            <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{t('common.loading')}</span>
          ) : products.length === 0 ? (
            <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Aucun produit trouvé</span>
          ) : (
            <select
              className="input"
              style={{ maxWidth: 420 }}
              value={selectedProductId}
              onChange={(e) => { setSelectedProductId(e.target.value); setMode(null); setSelectedDate(''); }}
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
        <div style={cardStyle}>
          <span style={stepLabel}>{t('client.fiche_technique.choose_mode')}</span>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>

            {/* FP Stock card */}
            <div
              style={{
                flex: 1, minWidth: 220, padding: 16, borderRadius: 10,
                border: '2px solid',
                borderColor: mode === 'stock' ? 'var(--primary)' : 'var(--border)',
                background: mode === 'stock' ? '#eef2ff' : 'var(--bg)',
                cursor: stockDates.length > 0 && !stockDatesLoading ? 'pointer' : 'not-allowed',
                opacity: stockDates.length === 0 && !stockDatesLoading ? 0.45 : 1,
                transition: 'all 0.15s',
              }}
              onClick={() => { if (!stockDatesLoading && stockDates.length > 0) setMode('stock'); }}
            >
              <div style={{ fontWeight: 700, marginBottom: 4, color: mode === 'stock' ? 'var(--primary)' : 'var(--text)' }}>
                📦 FP Stock
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: mode === 'stock' && stockDates.length > 0 ? 10 : 0 }}>
                {stockDatesLoading
                  ? t('common.loading')
                  : stockDates.length === 0
                    ? 'Aucun stock disponible'
                    : `${stockDates.length} date(s) disponible(s)`}
              </div>
              {mode === 'stock' && stockDates.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {stockDates.map((d) => (
                    <button
                      key={d}
                      style={{
                        padding: '4px 10px', borderRadius: 20, border: '1.5px solid',
                        borderColor: selectedDate === d ? 'var(--primary)' : 'var(--border)',
                        background: selectedDate === d ? 'var(--primary)' : '#fff',
                        color: selectedDate === d ? '#fff' : 'var(--text)',
                        cursor: 'pointer', fontWeight: selectedDate === d ? 700 : 400,
                        fontSize: '0.78rem',
                      }}
                      onClick={(e) => { e.stopPropagation(); setSelectedDate(d); }}
                    >
                      {d}
                    </button>
                  ))}
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
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 6 }}>
                      {t('client.fiche_technique.last_updated')} : {manualUpdatedAt}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginTop: 4 }}>
          <div>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('client.products.real_time_cost')} : </span>
            {costLoading ? (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>...</span>
            ) : realtimeCost !== null ? (
              <span className="cost-badge" style={{ fontSize: '1rem' }}>
                {realtimeCost.toFixed(3)} {t('currency')}
              </span>
            ) : (
              <span style={{ color: 'var(--text-muted)' }}>—</span>
            )}
          </div>
          <button
            className="btn btn-primary"
            disabled={!canGenerate || generating}
            onClick={generateExcel}
            title={
              mode === 'manual' && !canGenerateManual
                ? 'Saisissez tous les prix manuels d\'abord'
                : mode === 'stock' && !canGenerateStock
                  ? 'Sélectionnez une date de stock'
                  : ''
            }
          >
            📥 {generating ? t('common.loading') : t('client.fiche_technique.generate')}
          </button>
        </div>
      )}

      {/* Zero-price warning popup */}
      {showZeroWarning && (
        <div className="modal-overlay" onClick={() => setShowZeroWarning(false)}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>⚠ Prix incomplets</h2>
              <button className="modal-close" onClick={() => setShowZeroWarning(false)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 14, fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                Les ingrédients suivants ont un prix à 0. Corrigez-les pour pouvoir enregistrer.
              </p>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('client.products.popup_col_ingredient')}</th>
                    <th>{t('client.products.popup_col_unit')}</th>
                    <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{t('client.products.popup_col_unit_price')} (DT)</th>
                  </tr>
                </thead>
                <tbody>
                  {zeroWarningPrices.map((p, i) => (
                    <tr key={p.ingredientId}>
                      <td>{p.nom}</td>
                      <td>{p.unite}</td>
                      <td style={{ textAlign: 'right' }}>
                        <input
                          type="number"
                          className="input"
                          style={{ textAlign: 'right', width: 110, display: 'block', marginLeft: 'auto' }}
                          step="0.001"
                          min="0.001"
                          placeholder="0.000"
                          value={p.prixUnitaire}
                          onChange={(e) => {
                            const val = e.target.value;
                            setZeroWarningPrices((prev) => prev.map((x, j) => j === i ? { ...x, prixUnitaire: val } : x));
                            setManualPrices((prev) => prev.map((x) => x.ingredientId === p.ingredientId ? { ...x, prixUnitaire: val } : x));
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowZeroWarning(false)}>{t('common.cancel')}</button>
              <button
                className="btn btn-primary"
                disabled={savingManual || zeroWarningPrices.some((p) => { const v = parseFloat(p.prixUnitaire); return isNaN(v) || v <= 0; })}
                onClick={doSaveManualPrices}
              >
                {savingManual ? t('common.loading') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual prices popup */}
      {showManualPopup && (
        <div className="modal-overlay" onClick={() => setShowManualPopup(false)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('client.fiche_technique.manual_prices_title')}</h2>
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
                        {/* Group header — only when multiple groups exist */}
                        {manualPriceGroups.length > 1 && (
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
    </div>
  );
}
