import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import type { Activite, ActiviteTypesSummary, Product } from '../../types';

interface Props {
  isEntreprise: boolean;
  franchiseActivities: Activite[];
  distinctActivities: Activite[];
  typesSummary: ActiviteTypesSummary | null;
}

interface ManualPriceEntry {
  ingredientId: number;
  nom: string;
  unite: string;
  prixUnitaire: string;
}

export default function FicheTechniqueTab({
  isEntreprise,
  franchiseActivities,
  distinctActivities,
  typesSummary,
}: Props) {
  const { t } = useTranslation();

  // Product selection
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('');

  // Enterprise activity drill-down
  const [actType, setActType] = useState<'franchise' | 'distincte' | ''>('');
  const [franchiseGroup, setFranchiseGroup] = useState<string>('');
  const [selectedActId, setSelectedActId] = useState<string>('');

  // Mode
  const [mode, setMode] = useState<'stock' | 'manual' | null>(null);

  // FP Stock
  const [stockDates, setStockDates] = useState<string[]>([]);
  const [stockDatesLoading, setStockDatesLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

  // FP Manuel
  const [manualPrices, setManualPrices] = useState<ManualPriceEntry[]>([]);
  const [manualLoading, setManualLoading] = useState(false);
  const [manualUpdatedAt, setManualUpdatedAt] = useState<string | null>(null);
  const [showManualPopup, setShowManualPopup] = useState(false);
  const [savingManual, setSavingManual] = useState(false);

  // Generation
  const [generating, setGenerating] = useState(false);

  // Load all products (vendable + utilisable)
  useEffect(() => {
    api.get('/products').then(({ data }) => setProducts(data as Product[]));
  }, []);

  const selectedProduct = products.find((p) => String(p.id) === selectedProductId) ?? null;

  // Derived: franchise groups from franchiseActivities
  const franchiseGroups = Array.from(
    new Set(franchiseActivities.map((a) => a.franchiseGroup || a.nom).filter(Boolean))
  );

  // Resolved activiteId for API calls
  const resolvedActId = (() => {
    if (!isEntreprise) return 0;
    if (actType === 'distincte' && selectedActId) return parseInt(selectedActId);
    if (actType === 'franchise' && selectedActId) return parseInt(selectedActId);
    return 0;
  })();

  // Activity context is complete
  const actCtxDone = (() => {
    if (!isEntreprise) return true;
    if (!actType) return false;
    if (actType === 'distincte') return !!selectedActId;
    if (actType === 'franchise') {
      if (franchiseGroups.length > 1 && !franchiseGroup) return false;
      return !!selectedActId;
    }
    return false;
  })();

  // Load stock dates when product + activity are set
  useEffect(() => {
    if (!selectedProductId || !actCtxDone) {
      setStockDates([]);
      setSelectedDate('');
      return;
    }
    setStockDatesLoading(true);
    const params = new URLSearchParams({ month: currentMonth });
    if (resolvedActId) params.set('activiteId', String(resolvedActId));
    api.get(`/products/${selectedProductId}/stock-dates?${params}`)
      .then(({ data }) => {
        setStockDates(data as string[]);
        setSelectedDate('');
      })
      .catch(() => setStockDates([]))
      .finally(() => setStockDatesLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProductId, resolvedActId, actCtxDone]);

  // Load manual prices when product + activity are set and popup opens
  const loadManualPrices = async () => {
    if (!selectedProductId || !actCtxDone) return;
    setManualLoading(true);
    try {
      const params = resolvedActId ? `?activiteId=${resolvedActId}` : '';
      const { data } = await api.get(`/products/${selectedProductId}/manual-prices${params}`);
      const rows = data as { ingredientId: number; nom: string; unite: string; prixUnitaire: number | null; updatedAt: string | null }[];
      setManualPrices(rows.map((r) => ({
        ingredientId: r.ingredientId,
        nom: r.nom,
        unite: r.unite,
        prixUnitaire: r.prixUnitaire !== null ? String(r.prixUnitaire) : '',
      })));
      const latest = rows.find((r) => r.updatedAt)?.updatedAt ?? null;
      setManualUpdatedAt(latest ? latest.slice(0, 10) : null);
    } finally {
      setManualLoading(false);
    }
  };

  const openManualPopup = async () => {
    await loadManualPrices();
    setShowManualPopup(true);
  };

  const saveManualPrices = async () => {
    setSavingManual(true);
    try {
      const payload = {
        activiteId: resolvedActId,
        prices: manualPrices
          .filter((p) => p.prixUnitaire !== '' && !isNaN(parseFloat(p.prixUnitaire)))
          .map((p) => ({ ingredientId: p.ingredientId, prixUnitaire: parseFloat(p.prixUnitaire) })),
      };
      await api.post(`/products/${selectedProductId}/manual-prices`, payload);
      setShowManualPopup(false);
      setManualUpdatedAt(new Date().toISOString().slice(0, 10));
    } finally {
      setSavingManual(false);
    }
  };

  const generateExcel = async () => {
    if (!selectedProductId || !mode) return;
    setGenerating(true);
    try {
      const params = new URLSearchParams({ mode });
      if (resolvedActId) params.set('activiteId', String(resolvedActId));
      if (mode === 'stock' && selectedDate) params.set('date', selectedDate);
      const response = await api.get(`/products/${selectedProductId}/export?${params}`, { responseType: 'blob' });
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

  const hasIngredients = (selectedProduct?.ingredientsCount ?? 0) > 0;
  const hasStockDates = stockDates.length > 0;
  const canGenerateStock = mode === 'stock' && !!selectedDate;
  const canGenerateManual = mode === 'manual';

  return (
    <div style={{ padding: '24px 0' }}>
      {/* Product selector */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>
          {t('client.fiche_technique.select_product')}
        </label>
        <select
          className="input"
          style={{ maxWidth: 360 }}
          value={selectedProductId}
          onChange={(e) => {
            setSelectedProductId(e.target.value);
            setMode(null);
            setSelectedDate('');
          }}
        >
          <option value="">— {t('client.fiche_technique.choose_product')} —</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.type})</option>
          ))}
        </select>
      </div>

      {/* Entreprise: activity drill-down */}
      {isEntreprise && selectedProductId && (
        <div style={{ marginBottom: 24, padding: 16, background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <p style={{ fontWeight: 600, marginBottom: 12 }}>{t('client.fiche_technique.select_activity')}</p>

          {/* Type */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {typesSummary?.hasFranchise && (
              <button
                className={`btn btn-sm ${actType === 'franchise' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => { setActType('franchise'); setFranchiseGroup(''); setSelectedActId(''); }}
              >
                Franchise
              </button>
            )}
            {typesSummary?.hasDistinct && (
              <button
                className={`btn btn-sm ${actType === 'distincte' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => { setActType('distincte'); setFranchiseGroup(''); setSelectedActId(''); }}
              >
                Distinct
              </button>
            )}
          </div>

          {/* Franchise: group then activity */}
          {actType === 'franchise' && (
            <>
              {franchiseGroups.length > 1 && (
                <div style={{ marginBottom: 10 }}>
                  <select
                    className="input"
                    style={{ maxWidth: 260 }}
                    value={franchiseGroup}
                    onChange={(e) => { setFranchiseGroup(e.target.value); setSelectedActId(''); }}
                  >
                    <option value="">— {t('client.fiche_technique.choose_franchise_group')} —</option>
                    {franchiseGroups.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
              )}
              {(franchiseGroups.length <= 1 || franchiseGroup) && (
                <div>
                  <select
                    className="input"
                    style={{ maxWidth: 260 }}
                    value={selectedActId}
                    onChange={(e) => setSelectedActId(e.target.value)}
                  >
                    <option value="">— {t('client.fiche_technique.choose_activity')} —</option>
                    {franchiseActivities
                      .filter((a) => !franchiseGroup || (a.franchiseGroup || a.nom) === franchiseGroup)
                      .map((a) => (
                        <option key={a.id} value={a.id}>{a.nom}</option>
                      ))}
                  </select>
                </div>
              )}
            </>
          )}

          {/* Distinct: activity */}
          {actType === 'distincte' && (
            <select
              className="input"
              style={{ maxWidth: 260 }}
              value={selectedActId}
              onChange={(e) => setSelectedActId(e.target.value)}
            >
              <option value="">— {t('client.fiche_technique.choose_activity')} —</option>
              {distinctActivities.map((a) => (
                <option key={a.id} value={a.id}>{a.nom}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Mode buttons */}
      {selectedProductId && actCtxDone && (
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontWeight: 600, marginBottom: 12 }}>{t('client.fiche_technique.choose_mode')}</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              className={`btn btn-sm ${mode === 'stock' ? 'btn-primary' : 'btn-ghost'}`}
              disabled={stockDatesLoading || !hasStockDates}
              onClick={() => setMode('stock')}
              title={!hasStockDates ? t('client.fiche_technique.no_stock_dates') : ''}
            >
              FP Stock
              {stockDatesLoading && ' ...'}
              {!stockDatesLoading && !hasStockDates && ' (—)'}
            </button>
            <button
              className={`btn btn-sm ${mode === 'manual' ? 'btn-primary' : 'btn-ghost'}`}
              disabled={!hasIngredients}
              onClick={() => setMode('manual')}
              title={!hasIngredients ? t('client.fiche_technique.no_ingredients') : ''}
            >
              FP Manuel
              {!hasIngredients && ' (—)'}
            </button>
          </div>
        </div>
      )}

      {/* FP Stock: date chips */}
      {mode === 'stock' && stockDates.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontWeight: 600, marginBottom: 10 }}>{t('client.fiche_technique.select_date')}</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {stockDates.map((d) => (
              <button
                key={d}
                onClick={() => setSelectedDate(d)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 20,
                  border: selectedDate === d ? '2px solid var(--primary)' : '1px solid var(--border)',
                  background: selectedDate === d ? 'var(--primary)' : 'var(--surface)',
                  color: selectedDate === d ? '#fff' : 'var(--text)',
                  cursor: 'pointer',
                  fontWeight: selectedDate === d ? 700 : 400,
                  fontSize: '0.85rem',
                }}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* FP Manuel: open price popup */}
      {mode === 'manual' && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn btn-ghost btn-sm" onClick={openManualPopup}>
              ✏️ {t('client.fiche_technique.edit_manual_prices')}
            </button>
            {manualUpdatedAt && (
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {t('client.fiche_technique.last_updated')} : {manualUpdatedAt}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Générer FT button */}
      {(canGenerateStock || canGenerateManual) && (
        <button
          className="btn btn-primary"
          disabled={generating}
          onClick={generateExcel}
        >
          📥 {generating ? t('common.loading') : t('client.fiche_technique.generate')}
        </button>
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
                      <th>{t('client.products.popup_col_unit')}</th>
                      <th style={{ textAlign: 'right' }}>{t('client.products.popup_col_unit_price')} (DT)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {manualPrices.map((p, i) => (
                      <tr key={p.ingredientId}>
                        <td>{p.nom}</td>
                        <td>{p.unite}</td>
                        <td>
                          <input
                            type="number"
                            className="input"
                            style={{ textAlign: 'right', width: 110 }}
                            step="0.001"
                            min="0"
                            placeholder="0.000"
                            value={p.prixUnitaire}
                            onChange={(e) => {
                              const updated = [...manualPrices];
                              updated[i] = { ...updated[i], prixUnitaire: e.target.value };
                              setManualPrices(updated);
                            }}
                          />
                        </td>
                      </tr>
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
