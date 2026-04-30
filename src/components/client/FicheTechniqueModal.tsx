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
  missing: { ingredientId: number; nom: string; unite: string; lastQty: number | null; lastPrice: number | null; lastDate: string | null }[];
  groups: { label: string; depth: number; ingredients: { ingredientId: number; nom: string; unite: string }[] }[];
}

interface Fournisseur {
  id: number;
  nom: string;
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
  franchiseGroup?: string;
  onClose: () => void;
}

export default function FicheTechniqueModal({ productId, productName, hasIngredients, resolvedActId, contextLabel, activityName, activities, franchiseGroup, onClose }: Props) {
  const { t } = useTranslation();

  const [mode, setMode] = useState<'stock' | 'manual' | null>(null);

  // Fournisseurs (for missing stock form)
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [missingFournisseurId, setMissingFournisseurId] = useState('');
  const [missingRefFacture, setMissingRefFacture] = useState('');

  // FP Stock
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
  const [showManualPopup, setShowManualPopup] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const [showZeroWarning, setShowZeroWarning] = useState(false);
  const [zeroWarningPrices, setZeroWarningPrices] = useState<ManualPriceEntry[]>([]);

  // Cost + generate
  const [realtimeCost, setRealtimeCost] = useState<number | null>(null);
  const [costLoading, setCostLoading] = useState(false);
  const [costRefreshKey, setCostRefreshKey] = useState(0);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (mode !== 'stock' || !resolvedActId) return;
    api.get(`/api/entreprise/activites/${resolvedActId}/fournisseurs`)
      .then(({ data }) => setFournisseurs(data as Fournisseur[]))
      .catch(() => { /* no fournisseurs */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (mode !== 'stock') { setStockCheckResult(null); return; }
    setStockCheckLoading(true);
    const params = new URLSearchParams();
    if (resolvedActId) params.set('activiteId', String(resolvedActId));
    api.get(`/products/${productId}/stock-check?${params}`)
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
  }, [mode]);

  useEffect(() => {
    if (mode !== 'manual') return;
    loadManualPrices();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (!mode) { setRealtimeCost(null); return; }
    setCostLoading(true);
    const params = new URLSearchParams({ mode });
    if (mode === 'manual' && resolvedActId) params.set('activiteId', String(resolvedActId));
    api.get(`/products/${productId}/cout?${params}`)
      .then(({ data }) => setRealtimeCost((data as { totalCost: number }).totalCost ?? null))
      .catch(() => setRealtimeCost(null))
      .finally(() => setCostLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, costRefreshKey]);

  const loadManualPrices = async () => {
    setManualLoading(true);
    try {
      const qs = resolvedActId ? `?activiteId=${resolvedActId}` : '';
      const { data } = await api.get(`/products/${productId}/manual-prices${qs}`);
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
      await api.post(`/products/${productId}/manual-prices`, payload);
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

  const saveMissingStock = async () => {
    if (!stockCheckResult) return;
    setSavingMissing(true);
    const today = new Date().toISOString().slice(0, 10);
    try {
      for (const ing of stockCheckResult.missing) {
        const fill = missingFillData[ing.ingredientId];
        if (!fill || !fill.qty || !fill.price) continue;
        const payload: Record<string, unknown> = {
          quantite: parseFloat(fill.qty),
          prixUnitaire: parseFloat(fill.price),
          dateAppro: fill.date || today,
        };
        if (missingFournisseurId) payload.fournisseurId = parseInt(missingFournisseurId);
        if (missingRefFacture.trim()) payload.refFacture = missingRefFacture.trim();
        if (resolvedActId) {
          await api.put(`/api/stock/entreprise/${resolvedActId}/${ing.ingredientId}`, payload);
        } else {
          await api.put(`/api/stock/client/${ing.ingredientId}`, payload);
        }
      }
      const params = new URLSearchParams();
      if (resolvedActId) params.set('activiteId', String(resolvedActId));
      const { data } = await api.get(`/products/${productId}/stock-check?${params}`);
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

  const generateExcel = async () => {
    if (!mode) return;
    setGenerating(true);
    try {
      const params = new URLSearchParams({ mode });
      if (resolvedActId) params.set('activiteId', String(resolvedActId));
      if (!resolvedActId && franchiseGroup) params.set('fg', franchiseGroup);
      const response = await api.get(`/products/${productId}/export?${params}`, { responseType: 'blob' });
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
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
          <div className="modal-header modal-header--primary">
            <h2 style={{ margin: 0 }}>📄 Fiche Technique — {productName}</h2>
            <button className="modal-close" onClick={onClose}>×</button>
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
              <div style={chipBtn(mode === 'stock', !hasIngredients)} onClick={() => { if (hasIngredients) setMode('stock'); }}>
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
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', fontWeight: 600, color: '#16a34a', background: '#dcfce7', borderRadius: 20, padding: '3px 10px' }}>
                        ✓ {t('client.stock.stock_complete')}
                      </span>
                    ) : stockCheckResult && !stockCheckResult.complete ? (
                      <div>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', fontWeight: 600, color: '#b45309', background: '#fef3c7', borderRadius: 20, padding: '3px 10px', marginBottom: 6 }}>
                          ⚠ {stockCheckResult.missing.length} ingrédient(s) manquant(s)
                        </span>
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

              {/* FP Manuel */}
              <div style={chipBtn(mode === 'manual', !hasIngredients)} onClick={() => { if (hasIngredients) setMode('manual'); }}>
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
                    style={{ paddingLeft: 22, paddingRight: 22, height: 40, fontSize: '0.9rem', fontWeight: 600 }}
                    disabled={!canGenerate || generating}
                    onClick={generateExcel}
                  >
                    📥 {generating ? t('common.loading') : t('client.fiche_technique.generate')}
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
      {showManualPopup && (
        <div className="modal-overlay" style={{ zIndex: 1050 }} onClick={() => setShowManualPopup(false)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header modal-header--primary">
              <h2>Prix Ingrédients — {productName}</h2>
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
                    {(manualPriceGroups.length > 0 ? manualPriceGroups : [{ label: '', depth: 0, ingredients: manualPrices.map((p) => ({ ingredientId: p.ingredientId, nom: p.nom, unite: p.unite })) }]).map((group, gi) => (
                      <>
                        {manualPriceGroups.length > 1 && group.depth > 0 && (
                          <tr key={`gh-${gi}`}>
                            <td colSpan={3} style={{ paddingLeft: 8 + group.depth * 16, paddingTop: gi === 0 ? 4 : 10, paddingBottom: 2, fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)', borderTop: gi === 0 ? undefined : '1px solid var(--border)' }}>
                              ↳ {group.label}
                            </td>
                          </tr>
                        )}
                        {group.ingredients.map((ing) => {
                          const idx = manualPrices.findIndex((p) => p.ingredientId === ing.ingredientId);
                          if (idx === -1) return null;
                          const p = manualPrices[idx];
                          return (
                            <tr key={p.ingredientId}>
                              <td style={{ paddingLeft: manualPriceGroups.length > 1 ? 8 + group.depth * 16 + 8 : undefined }}>{p.nom}</td>
                              <td>{p.unite}</td>
                              <td style={{ textAlign: 'right' }}>
                                <input
                                  type="number" className="input"
                                  style={{ textAlign: 'right', width: 110, display: 'block', marginLeft: 'auto' }}
                                  step="0.001" min="0" placeholder="0.000"
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
        <div className="modal-overlay" style={{ zIndex: 1050 }} onClick={() => setShowMissingPopup(false)}>
          <div className="modal" style={{ maxWidth: 580 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', padding: '20px 24px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>⚠️</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: '#fff' }}>{t('client.stock.missing_stock_title')}</div>
                  <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>{t('client.stock.missing_stock_msg')}</div>
                </div>
              </div>
              <button onClick={() => setShowMissingPopup(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: '1rem', padding: '2px 8px', cursor: 'pointer', lineHeight: 1.4 }}>×</button>
            </div>
            <div style={{ padding: '16px 24px', maxHeight: '60vh', overflowY: 'auto' }}>
              {/* Fournisseur + Réf. Facture shared fields */}
              {fournisseurs.length > 0 && (
                <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>
                      🚚 Fournisseur
                    </label>
                    <select
                      className="input"
                      value={missingFournisseurId}
                      onChange={(e) => setMissingFournisseurId(e.target.value)}
                    >
                      <option value="">— Aucun —</option>
                      {fournisseurs.map((f) => (
                        <option key={f.id} value={f.id}>{f.nom}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>
                      Réf. Facture / BL
                    </label>
                    <input
                      type="text"
                      className="input"
                      value={missingRefFacture}
                      onChange={(e) => setMissingRefFacture(e.target.value)}
                      placeholder="N° bon de livraison…"
                    />
                  </div>
                </div>
              )}
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
                  {(stockCheckResult.groups.length > 0 ? stockCheckResult.groups : [{ label: '', depth: 0, ingredients: stockCheckResult.missing.map((m) => ({ ingredientId: m.ingredientId, nom: m.nom, unite: m.unite })) }]).map((group, gi) => {
                    const missingIds = new Set(stockCheckResult.missing.map((m) => m.ingredientId));
                    const visible = group.ingredients.filter((ing) => missingIds.has(ing.ingredientId));
                    if (visible.length === 0) return null;
                    return (
                      <>
                        {stockCheckResult.groups.length > 1 && group.depth > 0 && (
                          <tr key={`mg-${gi}`}>
                            <td colSpan={5} style={{ paddingLeft: 8 + group.depth * 16, paddingTop: gi === 0 ? 4 : 10, paddingBottom: 2, fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', borderTop: gi === 0 ? undefined : '1px solid var(--border)' }}>↳ {group.label}</td>
                          </tr>
                        )}
                        {visible.map((ing) => {
                          const fill = missingFillData[ing.ingredientId] || { qty: '', price: '', date: new Date().toISOString().slice(0, 10) };
                          return (
                            <tr key={ing.ingredientId}>
                              <td style={{ fontWeight: 500 }}>{ing.nom}</td>
                              <td style={{ color: 'var(--text-muted)' }}>{ing.unite}</td>
                              <td style={{ textAlign: 'right' }}>
                                <input type="number" className="input" style={{ width: 90, textAlign: 'right', display: 'block', marginLeft: 'auto' }} step="0.001" min="0" placeholder="0" value={fill.qty} onChange={(e) => setMissingFillData((prev) => ({ ...prev, [ing.ingredientId]: { ...fill, qty: e.target.value } }))} />
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <input type="number" className="input" style={{ width: 90, textAlign: 'right', display: 'block', marginLeft: 'auto', borderColor: !fill.price ? '#f59e0b' : undefined }} step="0.001" min="0.001" placeholder="0.000" value={fill.price} onChange={(e) => setMissingFillData((prev) => ({ ...prev, [ing.ingredientId]: { ...fill, price: e.target.value } }))} />
                              </td>
                              <td>
                                <input type="date" className="input" style={{ width: 130 }} value={fill.date} onChange={(e) => setMissingFillData((prev) => ({ ...prev, [ing.ingredientId]: { ...fill, date: e.target.value } }))} />
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
              <button className="btn btn-primary" style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', borderColor: 'transparent' }} disabled={savingMissing} onClick={saveMissingStock}>
                {savingMissing ? t('common.loading') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Zero-price warning popup */}
      {showZeroWarning && (
        <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={() => setShowZeroWarning(false)}>
          <div className="modal" style={{ maxWidth: 500, borderRadius: 16, overflow: 'hidden', padding: 0 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', padding: '20px 24px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>⚠️</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: '#fff' }}>Prix incomplets</div>
                  <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>Ces ingrédients ont un prix à 0 — corrigez-les avant d'enregistrer.</div>
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
