import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';

const currentYear = new Date().getFullYear();
const yearStart = `${currentYear}-01-01`;
const yearEnd = `${currentYear}-12-31`;
const todayStr = () => new Date().toISOString().split('T')[0];

const fmtDate = (iso: string | null | undefined) => {
  if (!iso || iso.length < 10) return iso ?? '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

const qtyColor = (q: number | null) => {
  if (q === null || q === 0) return 'var(--danger, #ef4444)';
  if (q < 5) return 'var(--warning, #f59e0b)';
  return 'var(--success, #10b981)';
};

interface LaboStockRow {
  ingredientId: number;
  nom: string;
  unite: string;
  categorie: string;
  quantite: number | null;
  prixUnitaire: number | null;
  dateAppro: string | null;
}

interface RowState {
  quantite: string;
  prixUnitaire: string;
  dateAppro: string;
  origQuantite: string;
  origPrixUnitaire: string;
  origDateAppro: string;
  hasExisting: boolean;
  saving: boolean;
  saved: boolean;
  historyOpen: boolean;
  history: { dateAppro: string; quantite: number | null; prixUnitaire: number | null }[];
}

interface LaboIngredient { id: number; nom: string; unite: string; categorie: string; categorieId: number | null; selected: boolean }

export default function StockLaboPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const laboId = searchParams.get('laboId') || '';

  const [labo, setLabo] = useState<{ nom: string; franchiseGroup: string; referentTel: string; adresse?: string } | null>(null);
  const [stock, setStock] = useState<LaboStockRow[]>([]);
  const [rowState, setRowState] = useState<Record<number, RowState>>({});
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterCategorie, setFilterCategorie] = useState('');
  const [filterNom, setFilterNom] = useState('');

  // Ingredient selector modal
  const [showIngModal, setShowIngModal] = useState(false);
  const [ingredients, setIngredients] = useState<LaboIngredient[]>([]);
  const [ingLoading, setIngLoading] = useState(false);

  const today = todayStr();

  const loadLabo = useCallback(async () => {
    if (!laboId) return;
    try {
      const { data } = await api.get(`/api/labo/${laboId}`);
      setLabo(data);
    } catch { /* ignore */ }
  }, [laboId]);

  const loadStock = useCallback(async () => {
    if (!laboId) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/api/labo/${laboId}/stock`);
      const rows = data as LaboStockRow[];
      setStock(rows);
      const init: Record<number, RowState> = {};
      for (const r of rows) {
        const hasExisting = r.quantite !== null;
        const qStr = r.quantite !== null ? String(r.quantite) : '';
        const pStr = r.prixUnitaire !== null ? String(r.prixUnitaire) : '';
        const dStr = hasExisting && r.dateAppro ? r.dateAppro : today;
        init[r.ingredientId] = {
          quantite: qStr,
          prixUnitaire: pStr,
          dateAppro: dStr,
          origQuantite: qStr,
          origPrixUnitaire: pStr,
          origDateAppro: dStr,
          hasExisting,
          saving: false,
          saved: false,
          historyOpen: false,
          history: [],
        };
      }
      setRowState(init);
    } catch { /* ignore */ }
    setLoading(false);
  }, [laboId, today]);

  useEffect(() => { loadLabo(); loadStock(); }, [loadLabo, loadStock]);

  const setField = (ingredientId: number, field: keyof RowState, value: unknown) => {
    setRowState((prev) => ({ ...prev, [ingredientId]: { ...prev[ingredientId], [field]: value } }));
  };

  const canSaveRow = (rs: RowState | undefined): boolean => {
    if (!rs || rs.saving) return false;
    if (!rs.hasExisting) {
      return rs.quantite.trim() !== '' && rs.prixUnitaire.trim() !== '' && rs.dateAppro.trim() !== '';
    }
    return rs.quantite !== rs.origQuantite || rs.prixUnitaire !== rs.origPrixUnitaire || rs.dateAppro !== rs.origDateAppro;
  };

  const saveRow = async (ingredientId: number) => {
    const rs = rowState[ingredientId];
    if (!rs || !canSaveRow(rs)) return;
    setField(ingredientId, 'saving', true);
    try {
      await api.put(`/api/labo/${laboId}/stock/${ingredientId}`, {
        quantite: rs.quantite !== '' ? parseFloat(rs.quantite) : null,
        prixUnitaire: rs.prixUnitaire !== '' ? parseFloat(rs.prixUnitaire) : null,
        dateAppro: rs.dateAppro || today,
      });
      setRowState((prev) => ({
        ...prev,
        [ingredientId]: {
          ...prev[ingredientId],
          saving: false,
          saved: true,
          hasExisting: true,
          origQuantite: rs.quantite,
          origPrixUnitaire: rs.prixUnitaire,
          origDateAppro: rs.dateAppro,
        },
      }));
      setTimeout(() => setField(ingredientId, 'saved', false), 2000);
    } catch {
      setField(ingredientId, 'saving', false);
    }
  };

  const toggleHistory = async (ingredientId: number) => {
    const rs = rowState[ingredientId];
    if (!rs) return;
    if (rs.historyOpen) { setField(ingredientId, 'historyOpen', false); return; }
    setField(ingredientId, 'historyOpen', true);
    try {
      const { data } = await api.get(`/api/labo/${laboId}/stock/${ingredientId}/history`);
      setField(ingredientId, 'history', data);
    } catch { /* ignore */ }
  };

  const openIngModal = async () => {
    setShowIngModal(true);
    setIngLoading(true);
    try {
      const { data } = await api.get(`/api/labo/${laboId}/ingredients`);
      setIngredients(data);
    } catch { /* ignore */ }
    setIngLoading(false);
  };

  const toggleIngredient = async (ingredientId: number) => {
    try {
      const { data } = await api.post(`/api/labo/${laboId}/ingredients/${ingredientId}/select`);
      setIngredients((prev) => prev.map((i) => i.id === ingredientId ? { ...i, selected: data.selected } : i));
    } catch { /* ignore */ }
  };

  const closeIngModal = () => { setShowIngModal(false); loadStock(); };

  // Filter + group by category
  const allCategories = Array.from(new Set(stock.map((r) => r.categorie))).sort();
  const filtered = stock.filter((r) => {
    const catOk = !filterCategorie || r.categorie === filterCategorie;
    const nomOk = !filterNom || r.nom.toLowerCase().includes(filterNom.toLowerCase());
    return catOk && nomOk;
  });
  const groups: Record<string, LaboStockRow[]> = {};
  for (const r of filtered) {
    if (!groups[r.categorie]) groups[r.categorie] = [];
    groups[r.categorie].push(r);
  }

  const ingGroups: Record<string, LaboIngredient[]> = {};
  for (const i of ingredients) {
    if (!ingGroups[i.categorie]) ingGroups[i.categorie] = [];
    ingGroups[i.categorie].push(i);
  }

  if (!laboId) return <div className="page"><p className="text-muted">Labo introuvable.</p></div>;

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1>🏭 {labo ? labo.nom : t('common.loading')} — {t('client.labo.stock_title')}</h1>
          {labo && (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 2 }}>
              {labo.franchiseGroup} · ☎ {labo.referentTel}{labo.adresse ? ` · 📍 ${labo.adresse}` : ''}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary btn-sm" onClick={openIngModal}>
            ⚙️ {t('client.labo.manage_ingredients')}
          </button>
          <Link to={`/client/labo/transfer?laboId=${laboId}`} className="btn btn-primary btn-sm">
            ↗ {t('client.labo.btn_transfer')}
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="text-muted">{t('common.loading')}</p>
      ) : stock.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">🏭</span>
          <p>{t('client.labo.empty_stock')}</p>
          <button className="btn btn-primary" onClick={openIngModal}>⚙️ {t('client.labo.manage_ingredients')}</button>
        </div>
      ) : (
        <>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('historique_appro.category', 'Catégorie')}</span>
              <select className="input" style={{ maxWidth: 200 }} value={filterCategorie} onChange={(e) => setFilterCategorie(e.target.value)}>
                <option value="">{t('client.catalogue_franchise.all_categories')}</option>
                {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('client.stock.ingredient')}</span>
              <input
                type="text"
                className="input"
                style={{ minWidth: 160, maxWidth: 240 }}
                placeholder={t('client.stock.search_ingredient')}
                value={filterNom}
                onChange={(e) => setFilterNom(e.target.value)}
              />
            </div>
            {(filterCategorie || filterNom) && (
              <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-end' }} onClick={() => { setFilterCategorie(''); setFilterNom(''); }}>✕</button>
            )}
          </div>

          {Object.keys(groups).length === 0 ? (
            <p className="text-muted">{t('common.no_result')}</p>
          ) : Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([cat, rows]) => (
          <div key={cat} style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
              🏷️ {cat}
            </h2>
            <div className="table-responsive card" style={{ marginBottom: 0 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('client.stock.ingredient')}</th>
                    <th style={{ textAlign: 'right' }}>{t('client.stock.quantity')}</th>
                    <th style={{ textAlign: 'right' }}>{t('client.stock.prix_unitaire')}</th>
                    <th>{t('client.stock.date_appro')}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const rs = rowState[r.ingredientId];
                    if (!rs) return null;
                    return (
                      <>
                        <tr key={r.ingredientId}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{r.nom}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.unite}</div>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                              <span style={{ fontWeight: 700, color: qtyColor(r.quantite), fontSize: '0.95rem', minWidth: 48, textAlign: 'right' }}>
                                {r.quantite !== null ? r.quantite : '—'}
                              </span>
                              <input
                                type="number"
                                min="0"
                                step="0.001"
                                value={rs.quantite}
                                onChange={(e) => setField(r.ingredientId, 'quantite', e.target.value)}
                                style={{ width: 90, textAlign: 'right' }}
                                className="input"
                              />
                            </div>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <input
                              type="number"
                              min="0"
                              step="0.001"
                              value={rs.prixUnitaire}
                              onChange={(e) => setField(r.ingredientId, 'prixUnitaire', e.target.value)}
                              style={{ width: 100, textAlign: 'right' }}
                              className="input"
                            />
                          </td>
                          <td>
                            <input
                              type="date"
                              className="input"
                              style={{ maxWidth: 150 }}
                              min={yearStart}
                              max={yearEnd}
                              value={rs.dateAppro}
                              onChange={(e) => setField(r.ingredientId, 'dateAppro', e.target.value)}
                            />
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <button
                              className={`btn btn-sm ${rs.saved ? 'btn-success' : 'btn-primary'}`}
                              onClick={() => saveRow(r.ingredientId)}
                              disabled={!canSaveRow(rs)}
                              style={{ marginRight: 6 }}
                              title={!rs.hasExisting && (!rs.quantite || !rs.prixUnitaire || !rs.dateAppro) ? 'Renseignez quantité, prix et date' : undefined}
                            >
                              {rs.saving ? '…' : rs.saved ? '✓' : t('common.save')}
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => toggleHistory(r.ingredientId)}
                              title={t('client.stock.history')}
                            >
                              {rs.historyOpen ? '▲' : '▼'}
                            </button>
                          </td>
                        </tr>
                        {rs.historyOpen && (
                          <tr key={`${r.ingredientId}-hist`}>
                            <td colSpan={5} style={{ background: 'var(--surface)', padding: '8px 16px' }}>
                              {rs.history.length === 0 ? (
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('client.stock.no_history')}</span>
                              ) : (
                                <table style={{ fontSize: '0.8rem', width: '100%' }}>
                                  <thead>
                                    <tr>
                                      <th style={{ textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, paddingBottom: 4 }}>{t('client.stock.date_appro')}</th>
                                      <th style={{ textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600, paddingBottom: 4 }}>{t('client.stock.quantity')}</th>
                                      <th style={{ textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600, paddingBottom: 4 }}>{t('client.stock.prix_unitaire')}</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {rs.history.map((h, i) => (
                                      <tr key={i}>
                                        <td style={{ color: 'var(--primary)', fontWeight: 600 }}>{fmtDate(h.dateAppro)}</td>
                                        <td style={{ textAlign: 'right' }}>{h.quantite ?? '—'}</td>
                                        <td style={{ textAlign: 'right' }}>{h.prixUnitaire !== null ? h.prixUnitaire.toFixed(3) : '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        </>
      )}

      {/* Ingredient selector modal */}
      {showIngModal && (
        <div className="modal-overlay" onClick={closeIngModal}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header modal-header--info">
              <h2>⚙️ {t('client.labo.manage_ingredients')} — {labo?.nom}</h2>
              <button className="modal-close" onClick={closeIngModal}>✕</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {ingLoading ? (
                <p className="text-muted">{t('common.loading')}</p>
              ) : (
                Object.entries(ingGroups).sort(([a], [b]) => a.localeCompare(b)).map(([cat, items]) => (
                  <div key={cat} style={{ marginBottom: 20 }}>
                    <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary)', marginBottom: 8 }}>
                      🏷️ {cat}
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {items.map((ing) => (
                        <label key={ing.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 6, cursor: 'pointer', background: ing.selected ? 'var(--primary-light, #eef2ff)' : 'transparent' }}>
                          <input type="checkbox" checked={ing.selected} onChange={() => toggleIngredient(ing.id)} />
                          <span style={{ flex: 1 }}>{ing.nom}</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{ing.unite}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={closeIngModal}>{t('common.close')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
