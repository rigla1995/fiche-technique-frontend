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

const seuilLabelClass = (restante: number | null, seuil: number | null): string => {
  if (restante === null) return '';
  if (seuil === null) return restante <= 0 ? 'stock-alert' : 'stock-ok';
  if (restante <= 0) return 'stock-alert';
  if (restante <= seuil) return 'stock-warn';
  return 'stock-ok';
};

interface LaboStockRow {
  ingredientId: number;
  nom: string;
  unite: string;
  categorie: string;
  quantite: number | null;
  prixUnitaire: number | null;
  dateAppro: string | null;
  seuilMin: number | null;
  totalTransfere: number;
}

interface RowState {
  quantite: string;
  prixUnitaire: string;
  dateAppro: string;
  fournisseurId: string;
  refFacture: string;
  origQuantite: string;
  origPrixUnitaire: string;
  origDateAppro: string;
  hasExisting: boolean;
  saving: boolean;
  saved: boolean;
  historyOpen: boolean;
  history: { dateAppro: string; quantite: number | null; prixUnitaire: number | null; fournisseurNom: string | null; refFacture: string | null }[];
}

interface LaboIngredient { id: number; nom: string; unite: string; categorie: string; categorieId: number | null; selected: boolean }

export default function StockLaboPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const laboId = searchParams.get('laboId') || '';

  const [labo, setLabo] = useState<{ nom: string; franchiseGroup: string; referentTel: string; adresse?: string; activites?: { id: number; nom: string }[] } | null>(null);
  const [stock, setStock] = useState<LaboStockRow[]>([]);
  const [rowState, setRowState] = useState<Record<number, RowState>>({});
  const [seuilMinEdits, setSeuilMinEdits] = useState<Record<number, string>>({});
  const [seuilMinSaving, setSeuilMinSaving] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterCategorie, setFilterCategorie] = useState('');
  const [filterNom, setFilterNom] = useState('');
  const [filterText, setFilterText] = useState('');

  // Fournisseurs (non-labo fournisseurs assigned to this labo)
  const [fournisseurs, setFournisseurs] = useState<{ id: number; nom: string }[]>([]);
  const [fournisseurModal, setFournisseurModal] = useState<{ ingredientId: number; nom: string } | null>(null);

  // Ingredient selector modal
  const [showIngModal, setShowIngModal] = useState(false);
  const [ingredients, setIngredients] = useState<LaboIngredient[]>([]);
  const [ingLoading, setIngLoading] = useState(false);

  // Activity assignment modal
  interface AssignIngredient {
    ingredientId: number; nom: string; unite: string; categorie: string;
    activities: { activiteId: number; nom: string; assigned: boolean }[];
  }
  interface AssignActivite { id: number; nom: string }
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignIngredients, setAssignIngredients] = useState<AssignIngredient[]>([]);
  const [assignActivites, setAssignActivites] = useState<AssignActivite[]>([]);
  // Modal filters
  const [assignFilterCat, setAssignFilterCat] = useState('');
  const [assignFilterIngId, setAssignFilterIngId] = useState<number | ''>('');
  const [assignFilterNom, setAssignFilterNom] = useState('');
  // Collapsible categories in assign modal (set of OPEN cat names — default empty = all closed)
  const [openAssignCats, setOpenAssignCats] = useState<Set<string>>(new Set());
  // Collapsible categories in main stock view
  const [openStockCats, setOpenStockCats] = useState<Set<string>>(new Set());

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
      const seuilInit: Record<number, string> = {};
      for (const r of rows) {
        const hasExisting = r.quantite !== null;
        init[r.ingredientId] = {
          quantite: '0',
          prixUnitaire: '0',
          dateAppro: today,
          fournisseurId: '',
          refFacture: '',
          origQuantite: '0',
          origPrixUnitaire: '0',
          origDateAppro: today,
          hasExisting,
          saving: false,
          saved: false,
          historyOpen: false,
          history: [],
        };
        seuilInit[r.ingredientId] = r.seuilMin !== null ? String(r.seuilMin) : '';
      }
      setRowState(init);
      setSeuilMinEdits(seuilInit);
    } catch { /* ignore */ }
    setLoading(false);
  }, [laboId, today]);

  useEffect(() => {
    loadLabo();
    loadStock();
    if (laboId) {
      api.get(`/api/labo/${laboId}/fournisseurs`)
        .then(({ data }) => setFournisseurs(data))
        .catch(() => {});
    }
  }, [loadLabo, loadStock, laboId]);

  const setField = (ingredientId: number, field: keyof RowState, value: unknown) => {
    setRowState((prev) => ({ ...prev, [ingredientId]: { ...prev[ingredientId], [field]: value } }));
  };

  const setDateApproField = (ingredientId: number, newDate: string) => {
    const r = stock.find((s) => s.ingredientId === ingredientId);
    const rs = rowState[ingredientId];
    if (!r || !rs) return;
    const histDates = new Set<string>((rs.history || []).map((h) => h.dateAppro).filter(Boolean) as string[]);
    const hasExisting = r.quantite !== null;
    const hasConflict = (hasExisting && newDate === r.dateAppro) || histDates.has(newDate);
    setRowState((prev) => ({
      ...prev,
      [ingredientId]: {
        ...prev[ingredientId],
        dateAppro: newDate,
        quantite: hasConflict ? '0' : prev[ingredientId].quantite,
        prixUnitaire: hasConflict ? '0' : prev[ingredientId].prixUnitaire,
      },
    }));
  };

  const hasFournisseurs = fournisseurs.length > 0;

  const canSaveRow = (rs: RowState | undefined): boolean => {
    if (!rs || rs.saving) return false;
    if (!rs.quantite.trim() || !rs.prixUnitaire.trim() || !rs.dateAppro.trim()) return false;
    if (hasFournisseurs && (!rs.fournisseurId.trim() || !rs.refFacture.trim())) return false;
    return true;
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
        fournisseurId: rs.fournisseurId ? Number(rs.fournisseurId) : null,
        refFacture: rs.refFacture.trim() || null,
      });
      setRowState((prev) => ({
        ...prev,
        [ingredientId]: {
          ...prev[ingredientId],
          saving: false, saved: true, hasExisting: true,
          quantite: '0', prixUnitaire: '0', dateAppro: today,
          fournisseurId: '', refFacture: '',
          origQuantite: '0', origPrixUnitaire: '0', origDateAppro: today,
          historyOpen: false, history: [],
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

  const saveSeuilMin = async (ingredientId: number) => {
    const raw = seuilMinEdits[ingredientId]?.trim();
    const val = raw ? parseFloat(raw) : null;
    setSeuilMinSaving((p) => ({ ...p, [ingredientId]: true }));
    try {
      await api.put(`/api/labo/${laboId}/ingredients/${ingredientId}/seuil-min`, { seuilMin: val });
      setStock((prev) => prev.map((r) => r.ingredientId === ingredientId ? { ...r, seuilMin: val } : r));
    } catch { /* ignore */ }
    setSeuilMinSaving((p) => ({ ...p, [ingredientId]: false }));
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

  const openAssignModal = async () => {
    setShowAssignModal(true);
    setAssignFilterCat('');
    setAssignFilterIngId('');
    setAssignFilterNom('');
    setOpenAssignCats(new Set());
    setAssignLoading(true);
    try {
      const { data } = await api.get(`/api/labo/${laboId}/activity-assignments`);
      setAssignIngredients(data.ingredients);
      setAssignActivites(data.activites);
    } catch { /* ignore */ }
    setAssignLoading(false);
  };

  const toggleAssignment = async (ingredientId: number, activiteId: number) => {
    try {
      const { data } = await api.post(`/api/labo/${laboId}/ingredients/${ingredientId}/assign-to-activity`, { activiteId });
      setAssignIngredients((prev) => prev.map((ing) =>
        ing.ingredientId === ingredientId
          ? { ...ing, activities: ing.activities.map((a) => a.activiteId === activiteId ? { ...a, assigned: data.assigned } : a) }
          : ing
      ));
    } catch { /* ignore */ }
  };

  const closeAssignModal = () => setShowAssignModal(false);

  // Filter + group by category
  const allCategories = Array.from(new Set(stock.map((r) => r.categorie))).sort();
  const stockInCategory = filterCategorie ? stock.filter((r) => r.categorie === filterCategorie) : stock;
  const filtered = stock.filter((r) => {
    const catOk = !filterCategorie || r.categorie === filterCategorie;
    const ingOk = !filterNom || r.nom === filterNom;
    const textOk = !filterText || r.nom.toLowerCase().includes(filterText.toLowerCase());
    return catOk && ingOk && textOk;
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
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {(labo?.activites?.length ?? 0) > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={openAssignModal}>
              🔗 {t('client.labo.assign_to_activities')}
            </button>
          )}
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
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('client.labo.use_catalogue_global', 'Assignez des ingrédients via le Catalogue Global.')}</p>
        </div>
      ) : (
        <>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Catégorie</span>
              <select className="input" style={{ maxWidth: 200 }} value={filterCategorie} onChange={(e) => { setFilterCategorie(e.target.value); setFilterNom(''); }}>
                <option value="">{t('client.catalogue_franchise.all_categories')}</option>
                {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ingrédient</span>
              <select
                className="input"
                style={{ minWidth: 180, maxWidth: 260 }}
                value={filterNom}
                disabled={!filterCategorie}
                onChange={(e) => setFilterNom(e.target.value)}
              >
                <option value="">— Tous —</option>
                {stockInCategory.map((r) => (
                  <option key={r.ingredientId} value={r.nom}>{r.nom}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: '1 1 auto', maxWidth: 200 }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nom</span>
              <input
                type="text"
                className="input"
                style={{ minWidth: 120 }}
                placeholder="Rechercher…"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
              />
            </div>
            {(filterCategorie || filterNom || filterText) && (
              <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-end' }} onClick={() => { setFilterCategorie(''); setFilterNom(''); setFilterText(''); }}>✕</button>
            )}
          </div>

          {Object.keys(groups).length === 0 ? (
            <p className="text-muted">{t('common.no_result')}</p>
          ) : Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([cat, rows]) => {
            const isCatOpen = openStockCats.has(cat);
            const toggleStockCat = () => setOpenStockCats((prev) => { const n = new Set(prev); if (n.has(cat)) n.delete(cat); else n.add(cat); return n; });
            return (
          <div key={cat} style={{ marginBottom: 12 }}>
            <button onClick={toggleStockCat} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', width: '100%', textAlign: 'left', borderBottom: '2px solid var(--border)', marginBottom: isCatOpen ? 10 : 0 }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>🏷️ {cat}</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>({rows.length})</span>
              <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{isCatOpen ? '▼' : '▶'}</span>
            </button>
            {isCatOpen && (
            <div className="table-responsive card th-indigo" style={{ marginBottom: 0 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('client.stock.ingredient')}</th>
                    <th style={{ textAlign: 'right' }}>Stock actuel</th>
                    <th style={{ textAlign: 'right' }}>Qté transférée</th>
                    <th style={{ textAlign: 'center' }}>Seuil min</th>
                    <th style={{ textAlign: 'right' }}>Nouvelle Qté</th>
                    <th style={{ textAlign: 'right' }}>{t('client.stock.prix_unitaire')}</th>
                    <th>{t('client.stock.date_appro')}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const rs = rowState[r.ingredientId];
                    if (!rs) return null;
                    const cls = seuilLabelClass(r.quantite, r.seuilMin);
                    const histDates = new Set<string>((rs.history || []).map((h) => h.dateAppro).filter(Boolean) as string[]);
                    const hasDateConflict = (r.quantite !== null && rs.dateAppro === r.dateAppro) || histDates.has(rs.dateAppro);
                    const warnStyle = hasDateConflict ? { borderColor: '#f59e0b', boxShadow: '0 0 0 2px #fef3c7' } : {};
                    return (
                      <>
                        <tr key={r.ingredientId}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{r.nom}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.unite}</div>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <span className={cls} style={{ fontSize: '1rem', fontWeight: 700 }}>
                              {r.quantite !== null ? r.quantite.toFixed(3) : '—'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            {r.totalTransfere > 0 ? (
                              <span style={{ color: '#7c3aed', fontWeight: 600 }}>↗ {r.totalTransfere.toFixed(3)}</span>
                            ) : '—'}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="number" min="0" step="0.001" placeholder="—"
                              value={seuilMinEdits[r.ingredientId] ?? ''}
                              onChange={(e) => setSeuilMinEdits((p) => ({ ...p, [r.ingredientId]: e.target.value }))}
                              onBlur={() => saveSeuilMin(r.ingredientId)}
                              style={{ width: 72, textAlign: 'right', fontSize: '0.82rem' }}
                              className="input"
                              title={seuilMinSaving[r.ingredientId] ? 'Enregistrement…' : 'Seuil minimum — auto-save'}
                            />
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <input
                              type="number"
                              min="0"
                              step="0.001"
                              value={rs.quantite}
                              onChange={(e) => setField(r.ingredientId, 'quantite', e.target.value)}
                              style={{ width: 90, textAlign: 'right', ...warnStyle }}
                              className="input"
                            />
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <input
                              type="number"
                              min="0"
                              step="0.001"
                              value={rs.prixUnitaire}
                              onChange={(e) => setField(r.ingredientId, 'prixUnitaire', e.target.value)}
                              style={{ width: 100, textAlign: 'right', ...warnStyle }}
                              className="input"
                            />
                          </td>
                          <td>
                            <input
                              type="date"
                              className="input"
                              style={{ maxWidth: 150, ...warnStyle }}
                              min={yearStart}
                              max={yearEnd}
                              value={rs.dateAppro}
                              onChange={(e) => setDateApproField(r.ingredientId, e.target.value)}
                            />
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {fournisseurs.length > 0 && (() => {
                              const assignedF = rs.fournisseurId
                                ? fournisseurs.find((f) => String(f.id) === rs.fournisseurId)
                                : null;
                              const validated = !!assignedF && rs.refFacture.trim() !== '';
                              return (
                                <button
                                  className="btn btn-sm"
                                  onClick={() => setFournisseurModal({ ingredientId: r.ingredientId, nom: r.nom })}
                                  style={{
                                    marginRight: 6, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis',
                                    background: validated ? '#dcfce7' : assignedF ? '#fef9c3' : '#eff6ff',
                                    color: validated ? '#15803d' : assignedF ? '#92400e' : '#2563eb',
                                    border: `1px solid ${validated ? '#86efac' : assignedF ? '#fde68a' : '#bfdbfe'}`,
                                  }}
                                  title={assignedF ? assignedF.nom : 'Assigner fournisseur'}
                                >
                                  {validated ? `✓ ${assignedF!.nom}` : assignedF ? `${assignedF.nom}…` : 'Fournisseur'}
                                </button>
                              );
                            })()}
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
                            <td colSpan={8} style={{ background: 'var(--surface)', padding: '8px 16px' }}>
                              {rs.history.length === 0 ? (
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('client.stock.no_history')}</span>
                              ) : (
                                <table style={{ fontSize: '0.8rem', width: '100%' }}>
                                  <thead>
                                    <tr>
                                      <th style={{ textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, paddingBottom: 4 }}>{t('client.stock.date_appro')}</th>
                                      <th style={{ textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600, paddingBottom: 4 }}>{t('client.stock.quantity')}</th>
                                      <th style={{ textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600, paddingBottom: 4 }}>{t('client.stock.prix_unitaire')}</th>
                                      <th style={{ textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, paddingBottom: 4 }}>Fournisseur</th>
                                      <th style={{ textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, paddingBottom: 4 }}>Réf Facture</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {rs.history.map((h, i) => (
                                      <tr key={i}>
                                        <td style={{ color: 'var(--primary)', fontWeight: 600 }}>{fmtDate(h.dateAppro)}</td>
                                        <td style={{ textAlign: 'right' }}>{h.quantite ?? '—'}</td>
                                        <td style={{ textAlign: 'right' }}>{h.prixUnitaire !== null ? h.prixUnitaire.toFixed(3) : '—'}</td>
                                        <td style={{ color: 'var(--text-muted)' }}>{h.fournisseurNom ?? '—'}</td>
                                        <td style={{ color: 'var(--text-muted)' }}>{h.refFacture ?? '—'}</td>
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
            )}
          </div>
            );
          })}
        </>
      )}

      {/* Fournisseur affectation modal */}
      {fournisseurModal && (
        <div className="modal-overlay" onClick={() => setFournisseurModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header modal-header--primary">
              <h2>Fournisseur — {fournisseurModal.nom}</h2>
              <button className="modal-close" onClick={() => setFournisseurModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Fournisseur</label>
              <select
                className="input" style={{ width: '100%', fontSize: '0.9rem', marginBottom: 16 }}
                value={rowState[fournisseurModal.ingredientId]?.fournisseurId ?? ''}
                onChange={(e) => setField(fournisseurModal.ingredientId, 'fournisseurId', e.target.value)}
              >
                <option value="">— Aucun fournisseur —</option>
                {fournisseurs.map((f) => <option key={f.id} value={String(f.id)}>{f.nom}</option>)}
                {fournisseurs.length === 0 && <option disabled>Aucun fournisseur assigné à ce labo</option>}
              </select>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Réf. Facture / BL</label>
              <input
                className="input" style={{ width: '100%', fontSize: '0.9rem', marginBottom: 16 }}
                type="text"
                value={rowState[fournisseurModal.ingredientId]?.refFacture ?? ''}
                onChange={(e) => setField(fournisseurModal.ingredientId, 'refFacture', e.target.value)}
                placeholder="N° facture ou BL"
              />
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setFournisseurModal(null)}>Annuler</button>
                <button className="btn btn-primary" onClick={() => setFournisseurModal(null)}>Valider</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Activity assignment modal */}
      {showAssignModal && (
        <div className="modal-overlay" onClick={closeAssignModal}>
          <div className="modal modal-lg" style={{ maxWidth: 800 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header modal-header--primary">
              <h2>🔗 {t('client.labo.assign_to_activities')} — {labo?.nom}</h2>
              <button className="modal-close" onClick={closeAssignModal}>✕</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {assignLoading ? (
                <p className="text-muted">{t('common.loading')}</p>
              ) : assignIngredients.length === 0 ? (
                <p className="text-muted">{t('client.labo.empty_stock')}</p>
              ) : assignActivites.length === 0 ? (
                <p className="text-muted">{t('client.labo.no_activites')}</p>
              ) : (() => {
                // Apply filters
                const allAssignCats = Array.from(new Set(assignIngredients.map((i) => i.categorie))).sort();
                const inAssignCat = assignFilterCat ? assignIngredients.filter((i) => i.categorie === assignFilterCat) : assignIngredients;
                const filteredAssign = assignIngredients.filter((i) => {
                  const catOk = !assignFilterCat || i.categorie === assignFilterCat;
                  const ingOk = !assignFilterIngId || i.ingredientId === assignFilterIngId;
                  const nomOk = !assignFilterNom || i.nom.toLowerCase().includes(assignFilterNom.toLowerCase());
                  return catOk && ingOk && nomOk;
                });
                // Group by category
                const cats: Record<string, typeof filteredAssign> = {};
                for (const ing of filteredAssign) {
                  if (!cats[ing.categorie]) cats[ing.categorie] = [];
                  cats[ing.categorie].push(ing);
                }
                return (
                  <>
                    {/* Filter bar */}
                    <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end', position: 'sticky', top: 0, background: 'var(--surface, #fff)', zIndex: 2, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Catégorie</span>
                        <select className="input" style={{ maxWidth: 180 }} value={assignFilterCat} onChange={(e) => { setAssignFilterCat(e.target.value); setAssignFilterIngId(''); }}>
                          <option value="">Toutes</option>
                          {allAssignCats.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ingrédient</span>
                        <select
                          className="input"
                          style={{ maxWidth: 200 }}
                          value={assignFilterIngId}
                          disabled={!assignFilterCat}
                          onChange={(e) => setAssignFilterIngId(e.target.value === '' ? '' : Number(e.target.value))}
                        >
                          <option value="">— Tous —</option>
                          {inAssignCat.map((i) => <option key={i.ingredientId} value={i.ingredientId}>{i.nom}</option>)}
                        </select>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: '1 1 auto', maxWidth: 180 }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nom</span>
                        <input
                          type="text"
                          className="input"
                          style={{ minWidth: 100 }}
                          placeholder="Rechercher…"
                          value={assignFilterNom}
                          onChange={(e) => setAssignFilterNom(e.target.value)}
                        />
                      </div>
                      {(assignFilterCat || assignFilterIngId !== '' || assignFilterNom) && (
                        <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-end' }} onClick={() => { setAssignFilterCat(''); setAssignFilterIngId(''); setAssignFilterNom(''); }}>✕</button>
                      )}
                    </div>

                    {/* Category sections (collapsible) */}
                    {Object.entries(cats).sort(([a], [b]) => a.localeCompare(b)).map(([cat, items]) => {
                      const isOpen = openAssignCats.has(cat);
                      const toggleCat = () => setOpenAssignCats((prev) => {
                        const next = new Set(prev);
                        if (next.has(cat)) next.delete(cat); else next.add(cat);
                        return next;
                      });
                      return (
                        <div key={cat} style={{ marginBottom: 16 }}>
                          <button
                            onClick={toggleCat}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', width: '100%', textAlign: 'left' }}
                          >
                            <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                              🏷️ {cat}
                            </span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>({items.length})</span>
                            <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{isOpen ? '▼' : '▶'}</span>
                          </button>
                          {isOpen && (
                            <div className="table-responsive" style={{ overflowX: 'auto' }}>
                              <table className="table" style={{ minWidth: 400 }}>
                                <thead>
                                  <tr>
                                    <th style={{ minWidth: 160 }}>{t('client.stock.ingredient')}</th>
                                    {assignActivites.map((act) => (
                                      <th key={act.id} style={{ textAlign: 'center', minWidth: 110, color: 'var(--primary)' }}>{act.nom}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {items.map((ing) => (
                                    <tr key={ing.ingredientId}>
                                      <td>
                                        <div style={{ fontWeight: 600 }}>{ing.nom}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{ing.unite}</div>
                                      </td>
                                      {ing.activities.map((a) => (
                                        <td key={a.activiteId} style={{ textAlign: 'center' }}>
                                          <input
                                            type="checkbox"
                                            checked={a.assigned}
                                            onChange={() => toggleAssignment(ing.ingredientId, a.activiteId)}
                                            style={{ width: 18, height: 18, accentColor: 'var(--primary)', cursor: 'pointer' }}
                                          />
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {Object.keys(cats).length === 0 && (
                      <p className="text-muted">{t('common.no_result')}</p>
                    )}
                  </>
                );
              })()}
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={closeAssignModal}>{t('common.close')}</button>
            </div>
          </div>
        </div>
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
