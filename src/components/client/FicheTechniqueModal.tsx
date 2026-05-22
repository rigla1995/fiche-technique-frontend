import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';

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

interface StockCheckResult {
  complete: boolean;
  missing: { ingredientId: number; nom: string; unite: string; categorie: string | null; lastQty: number | null; lastPrice: number | null; lastDate: string | null }[];
  groups: { label: string; depth: number; ingredients: { ingredientId: number; nom: string; unite: string }[] }[];
}

interface ActivityInfo {
  id: number;
  nom: string;
  adresse?: string;
}

interface Props {
  productId: number;
  productName: string;
  hasIngredients: boolean;
  resolvedActId: number;
  contextLabel: string;
  activityName: string;
  activities?: ActivityInfo[];
  onClose: () => void;
}

export default function FicheTechniqueModal({ productId, productName, hasIngredients, resolvedActId, contextLabel, activityName, activities, onClose }: Props) {
  const { t } = useTranslation();

  const [mode, setMode] = useState<'stock' | 'manual' | null>(null);

  // FP Stock
  const [stockActId, setStockActId] = useState<number | null>(null);
  const [stockCheckResult, setStockCheckResult] = useState<StockCheckResult | null>(null);
  const [stockCheckLoading, setStockCheckLoading] = useState(false);

  // FP Manuel
  const [manualPrices, setManualPrices] = useState<ManualPriceEntry[]>([]);
  const [manualPriceGroups, setManualPriceGroups] = useState<ManualPriceGroup[]>([]);
  const [manualLoading, setManualLoading] = useState(false);
  const [manualUpdatedAt, setManualUpdatedAt] = useState<string | null>(null);
  const [showManualPopup, setShowManualPopup] = useState(false);
  const [manualSearch, setManualSearch] = useState('');
  const [savingManual, setSavingManual] = useState(false);
  const [showZeroWarning, setShowZeroWarning] = useState(false);
  const [zeroWarningPrices, setZeroWarningPrices] = useState<ManualPriceEntry[]>([]);

  // Cost + generate
  const [realtimeCost, setRealtimeCost] = useState<number | null>(null);
  const [costLoading, setCostLoading] = useState(false);
  const [costRefreshKey, setCostRefreshKey] = useState(0);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (mode !== 'stock') { setStockCheckResult(null); return; }
    const effectiveActId = resolvedActId || stockActId;
    if (!resolvedActId && !stockActId) { setStockCheckResult(null); return; }
    setStockCheckLoading(true);
    const params = new URLSearchParams();
    if (effectiveActId) params.set('activiteId', String(effectiveActId));
    api.get(`/api/products/${productId}/stock-check?${params}`)
      .then(({ data }) => {
        const result = data as StockCheckResult;
        setStockCheckResult(result);
      })
      .catch(() => setStockCheckResult(null))
      .finally(() => setStockCheckLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, stockActId]);

  useEffect(() => {
    if (mode !== 'manual') return;
    loadManualPrices();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (!mode) { setRealtimeCost(null); return; }
    setCostLoading(true);
    const params = new URLSearchParams({ mode });
    if (resolvedActId) params.set('activiteId', String(resolvedActId));
    api.get(`/api/products/${productId}/cout?${params}`)
      .then(({ data }) => setRealtimeCost((data as { totalCost: number }).totalCost ?? null))
      .catch(() => setRealtimeCost(null))
      .finally(() => setCostLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, costRefreshKey]);

  const loadManualPrices = async () => {
    setManualLoading(true);
    try {
      const qs = resolvedActId ? `?activiteId=${resolvedActId}` : '';
      const { data } = await api.get(`/api/products/${productId}/manual-prices${qs}`);
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
      await api.post(`/api/products/${productId}/manual-prices`, payload);
      setShowManualPopup(false);
      setShowZeroWarning(false);
      setManualUpdatedAt(new Date().toISOString().slice(0, 10));
      setCostRefreshKey((k) => k + 1);
      await loadManualPrices();
    } finally {
      setSavingManual(false);
    }
  };

  const saveManualPrices = async () => {
    const zeros = manualPrices.filter((p) => { const v = parseFloat(p.prixUnitaire); return isNaN(v) || v <= 0; });
    if (zeros.length > 0) {
      setZeroWarningPrices(zeros.map((p) => ({ ...p })));
      setShowZeroWarning(true);
      return;
    }
    await doSaveManualPrices();
  };

  const generateExcel = async () => {
    if (!mode) return;
    setGenerating(true);
    try {
      const params = new URLSearchParams({ mode });
      const effectiveActId = resolvedActId || (mode === 'stock' ? stockActId : null);
      if (effectiveActId) params.set('activiteId', String(effectiveActId));
      const response = await api.get(`/api/products/${productId}/export?${params}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const dlName = activityName ? `FT-${activityName}-${productName}.xlsx` : `FT-${productName}.xlsx`;
      link.setAttribute('download', dlName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } finally {
      setGenerating(false);
    }
  };

  const allManualPricesFilled = manualPrices.length > 0 && manualPrices.every((p) => { const v = parseFloat(p.prixUnitaire); return !isNaN(v) && v > 0; });
  const canGenerateStock = mode === 'stock' && stockCheckResult?.complete === true;
  const canGenerateManual = mode === 'manual' && allManualPricesFilled;
  const canGenerate = canGenerateStock || canGenerateManual;

  const chipBtn = (active: boolean, disabled = false): React.CSSProperties => ({
    flex: 1, minWidth: 200, padding: 16, borderRadius: 10,
    border: '2px solid', borderColor: active ? 'var(--primary)' : 'var(--border)',
    background: active ? '#eef2ff' : 'var(--bg)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    transition: 'all 0.15s',
    textAlign: 'left' as const,
  });

  return (
    <>
      <div className="modal-overlay">
        <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
          <div style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)', padding: '18px 22px', borderRadius: '12px 12px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: '1rem', marginBottom: 2 }}>📄 Fiche Technique</div>
              <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.82rem', fontWeight: 600 }}>{productName}</div>
            </div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 900, fontSize: '1.1rem', cursor: 'pointer', padding: '2px 9px', lineHeight: 1, flexShrink: 0 }}>×</button>
          </div>

          <div className="modal-body" style={{ padding: '20px 24px' }}>
            {/* Context info */}
            {contextLabel && (() => {
              const parts = contextLabel.split(' / ').map((s) => {
                const idx = s.indexOf(' : ');
                return idx !== -1 ? { key: s.slice(0, idx), value: s.slice(idx + 3) } : { key: s, value: '' };
              });
              const iconFor = (key: string) => key === 'Franchise' ? '🏢' : '🏪';
              const hasActs = activities && activities.length > 0;
              return (
                <div style={{ marginBottom: 18, borderRadius: 12, overflow: 'hidden', border: '1px solid #dbeafe', background: 'linear-gradient(135deg, #eff6ff 0%, #f8faff 100%)' }}>
                  <div style={{ padding: '12px 16px', display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center', borderBottom: hasActs ? '1px solid #dbeafe' : 'none' }}>
                    {parts.map(({ key, value }) => (
                      <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 34, height: 34, borderRadius: 9, background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 }}>
                          {iconFor(key)}
                        </div>
                        <div>
                          <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 1 }}>{key}</div>
                          <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#1e40af' }}>{value}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {hasActs && (
                    <div style={{ padding: '10px 16px 12px' }}>
                      <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 7 }}>
                        Activités ({activities!.length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {activities!.map((a) => (
                          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: '#fff', borderRadius: 8, border: '1px solid #dbeafe' }}>
                            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#3b82f6', flexShrink: 0 }} />
                            <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#1e3a8a' }}>{a.nom}</span>
                            {a.adresse && (
                              <span style={{ color: '#6b7280', fontSize: '0.78rem', marginLeft: 'auto' }}>📍 {a.adresse}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Mode selection */}
            <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>
              {t('client.fiche_technique.choose_mode')}
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>

              {/* FP Stock */}
              {(() => {
                const stockNoAppro = stockCheckResult !== null && !stockCheckResult.complete;
                const stockDisabled = !hasIngredients || stockNoAppro;
                const stockTitle = stockNoAppro ? "Aucune approvisionnement enregistrée pour les articles de ce produit" : undefined;
                return (
              <div
                style={chipBtn(mode === 'stock', stockDisabled)}
                title={stockTitle}
                onClick={() => { if (!stockDisabled) { setMode('stock'); setStockActId(null); setStockCheckResult(null); } }}>
                <div style={{ fontWeight: 700, marginBottom: 4, color: mode === 'stock' ? 'var(--primary)' : 'var(--text)' }}>
                  📦 FP Stock
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: mode === 'stock' ? 8 : 0 }}>
                  {!hasIngredients ? 'Aucun article' : 'Utilise les derniers prix d\'appro'}
                </div>
                {mode === 'stock' && (
                  <div style={{ marginTop: 4 }} onClick={(e) => e.stopPropagation()}>
                    {/* Franchise-wide: show activity picker first */}
                    {!resolvedActId && activities && activities.length > 0 && !stockActId ? (
                      <div>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                          Choisissez l'activité :
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {activities.map((act) => (
                            <button key={act.id} className="btn btn-ghost btn-sm"
                              style={{ textAlign: 'left', justifyContent: 'flex-start', fontSize: '0.82rem', padding: '5px 10px' }}
                              onClick={() => setStockActId(act.id)}>
                              🏪 {act.nom}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div>
                        {!resolvedActId && stockActId && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1e40af' }}>
                              🏪 {activities?.find((a) => a.id === stockActId)?.nom}
                            </span>
                            <button
                              style={{ fontSize: '0.68rem', color: '#6b7280', background: 'none', border: '1px solid #d1d5db', borderRadius: 4, padding: '1px 6px', cursor: 'pointer' }}
                              onClick={() => { setStockActId(null); setStockCheckResult(null); }}
                            >
                              changer
                            </button>
                          </div>
                        )}
                        {/* Stock check status */}
                        {stockCheckLoading ? (
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{t('common.loading')}</span>
                        ) : stockCheckResult?.complete ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', fontWeight: 600, color: '#16a34a', background: '#dcfce7', borderRadius: 20, padding: '3px 10px' }}>
                            ✓ {t('client.stock.stock_complete')}
                          </span>
                        ) : stockCheckResult && !stockCheckResult.complete ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', fontWeight: 600, color: '#b45309', background: '#fef3c7', borderRadius: 20, padding: '3px 10px' }}>
                            ⚠ {stockCheckResult.missing.length} article(s) sans appro
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>
                )}
              </div>
                ); })()}

              {/* FP Manuel */}
              <div style={chipBtn(mode === 'manual', !hasIngredients)} onClick={() => { if (hasIngredients) setMode('manual'); }}>
                <div style={{ fontWeight: 700, marginBottom: 4, color: mode === 'manual' ? 'var(--primary)' : 'var(--text)' }}>
                  ✏️ FP Manuel
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: mode === 'manual' ? 10 : 0 }}>
                  {!hasIngredients ? 'Aucun article' : 'Saisissez vos prix manuellement'}
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

            {/* Cost + Generate */}
            {mode && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 0, background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 22px', flex: 1 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>💰</div>
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
                <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)', flexShrink: 0 }} />
                <div style={{ padding: '14px 20px', flexShrink: 0 }}>
                  <button
                    className="btn btn-primary"
                    style={{ paddingLeft: 22, paddingRight: 22, height: 40, fontSize: '0.9rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 7 }}
                    disabled={!canGenerate || generating}
                    onClick={generateExcel}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><rect width="24" height="24" rx="3" fill="#fff"/><path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" fill="#185C37"/><path d="M14 2V8H20L14 2Z" fill="#107C41"/><text x="7" y="18" fill="white" fontSize="8" fontWeight="bold" fontFamily="Arial,sans-serif">XLS</text></svg>
                    {generating ? t('common.loading') : t('client.fiche_technique.generate')}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={onClose}>{t('common.close')}</button>
          </div>
        </div>
      </div>

      {/* Manual prices popup */}
      {showManualPopup && (() => {
        // Build a flat ordered list of items with optional group labels
        type ManualItem = { type: 'group'; label: string; depth: number } | { type: 'item'; idx: number; groupDepth: number; groupLabel: string };
        const items: ManualItem[] = [];
        const groups = manualPriceGroups.length > 0
          ? manualPriceGroups
          : [{ label: '', depth: 0, ingredients: manualPrices.map((p) => ({ ingredientId: p.ingredientId, nom: p.nom, unite: p.unite })) }];
        const hasMultiGroups = manualPriceGroups.length > 1;
        for (const group of groups) {
          if (hasMultiGroups && group.depth > 0) items.push({ type: 'group', label: group.label, depth: group.depth });
          for (const ing of group.ingredients) {
            const idx = manualPrices.findIndex((p) => p.ingredientId === ing.ingredientId);
            if (idx !== -1) items.push({ type: 'item', idx, groupDepth: group.depth, groupLabel: group.label });
          }
        }
        const searchLow = manualSearch.toLowerCase();
        const filteredItems = manualSearch
          ? items.filter((it) => it.type === 'item' && manualPrices[it.idx].nom.toLowerCase().includes(searchLow))
          : items;
        const visibleCount = filteredItems.filter((it) => it.type === 'item').length;

        return (
          <div className="modal-overlay" style={{ zIndex: 1050 }}>
            <div className="modal" style={{ maxWidth: 520, borderRadius: 14, overflow: 'hidden', padding: 0 }} onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ color: '#fff', fontWeight: 800, fontSize: '0.95rem', marginBottom: 2 }}>✏️ Prix Articles</div>
                  <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.78rem', fontWeight: 600 }}>{productName}</div>
                </div>
                <button onClick={() => { setShowManualPopup(false); setManualSearch(''); }} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 900, fontSize: '1.1rem', cursor: 'pointer', padding: '2px 9px', lineHeight: 1, flexShrink: 0 }}>×</button>
              </div>

              <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Search */}
                <input
                  className="input"
                  placeholder="🔍 Rechercher un article…"
                  value={manualSearch}
                  onChange={(e) => setManualSearch(e.target.value)}
                  style={{ fontSize: '0.82rem' }}
                  autoFocus
                />

                {/* Article count */}
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  {visibleCount} article{visibleCount !== 1 ? 's' : ''}
                  {manualSearch && ` — filtrés sur "${manualSearch}"`}
                </div>

                {/* Scrollable list */}
                <div style={{ height: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, border: '1px solid var(--border)', borderRadius: 10, padding: '6px' }}>
                  {manualLoading && (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0', fontSize: '0.85rem' }}>⏳ {t('common.loading')}</div>
                  )}
                  {!manualLoading && visibleCount === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0', fontSize: '0.85rem' }}>Aucun article trouvé</div>
                  )}
                  {!manualLoading && filteredItems.map((it, i) => {
                    if (it.type === 'group') {
                      return (
                        <div key={`g-${i}`} style={{ paddingLeft: 8 + it.depth * 12, paddingTop: i === 0 ? 2 : 8, paddingBottom: 2, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#6b7280', borderTop: i === 0 ? undefined : '1px solid var(--border)', marginTop: i === 0 ? 0 : 4 }}>
                          ↳ {it.label}
                        </div>
                      );
                    }
                    const p = manualPrices[it.idx];
                    const priceVal = parseFloat(p.prixUnitaire);
                    const priceValid = !isNaN(priceVal) && priceVal > 0;
                    return (
                      <div key={p.ingredientId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', paddingLeft: 10 + it.groupDepth * 12, borderRadius: 8, background: priceValid ? '#f0fdf4' : 'transparent', transition: 'background 0.12s' }}>
                        <span style={{ flex: 1, fontSize: '0.84rem', fontWeight: 500, color: '#374151' }}>{p.nom}</span>
                        <span style={{ fontSize: '0.68rem', color: '#64748b', background: '#f1f5f9', borderRadius: 6, padding: '1px 6px', flexShrink: 0 }}>{p.unite}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                          <input
                            type="number"
                            step="0.001" min="0" placeholder="0.000"
                            value={p.prixUnitaire}
                            onChange={(e) => {
                              const updated = [...manualPrices];
                              updated[it.idx] = { ...updated[it.idx], prixUnitaire: e.target.value };
                              setManualPrices(updated);
                            }}
                            style={{ width: 90, padding: '3px 7px', borderRadius: 6, border: `1.5px solid ${priceValid ? '#86efac' : '#e2e8f0'}`, fontSize: '0.82rem', textAlign: 'right', outline: 'none' }}
                          />
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', flexShrink: 0 }}>DT</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="modal-footer" style={{ borderTop: '1px solid var(--border)', padding: '12px 16px' }}>
                <button className="btn btn-ghost" onClick={() => { setShowManualPopup(false); setManualSearch(''); }}>{t('common.cancel')}</button>
                <button className="btn btn-primary" onClick={saveManualPrices} disabled={savingManual || manualLoading}>
                  {savingManual ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Zero-price warning popup */}
      {showZeroWarning && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal" style={{ maxWidth: 500, borderRadius: 16, overflow: 'hidden', padding: 0 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', padding: '20px 24px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>⚠️</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: '#fff' }}>Prix incomplets</div>
                  <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>Ces articles ont un prix à 0 — corrigez-les avant d'enregistrer.</div>
                </div>
              </div>
              <button onClick={() => setShowZeroWarning(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: '1rem', padding: '2px 8px', cursor: 'pointer', lineHeight: 1.4 }}>×</button>
            </div>
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
                  {zeroWarningPrices.map((p, wi) => (
                    <tr key={p.ingredientId}>
                      <td style={{ fontWeight: 500 }}>{p.nom}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{p.unite}</td>
                      <td style={{ textAlign: 'right' }}>
                        <input
                          type="number" className="input"
                          style={{ textAlign: 'right', width: 110, display: 'block', marginLeft: 'auto', borderColor: '#f59e0b' }}
                          step="0.001" min="0.001" placeholder="0.000" autoFocus={wi === 0}
                          value={p.prixUnitaire}
                          onChange={(e) => {
                            const val = e.target.value;
                            setZeroWarningPrices((prev) => prev.map((x, j) => j === wi ? { ...x, prixUnitaire: val } : x));
                            setManualPrices((prev) => prev.map((x) => x.ingredientId === p.ingredientId ? { ...x, prixUnitaire: val } : x));
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
    </>
  );
}
