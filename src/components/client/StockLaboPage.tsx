import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';

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

const LABEL: React.CSSProperties = {
  fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.05em',
};

interface LaboActivite { id: number; nom: string; type: string | null; franchiseGroup: string | null }

interface LaboStockRow {
  ingredientId: number;
  produitId?: number;
  isPT?: boolean;
  nom: string;
  unite: string;
  categorie: string;
  quantite: number | null;        // net stock = total appros - total transféré
  prixUnitaire: number | null;
  dateAppro: string | null;
  seuilMin: number | null;
  coutTotal: number | null;
  totalTransfere: number;
  lastFournisseurId: number | null;
  lastRefFacture: string | null;
}

interface RowState {
  quantite: string;
  prixUnitaire: string;
  dateAppro: string;
  fournisseurId: string;
  refFacture: string;
  hasExisting: boolean;
  saving: boolean;
  saved: boolean;
  historyOpen: boolean;
  history: { dateAppro: string; quantite: number | null; prixUnitaire: number | null; fournisseurNom: string | null; refFacture: string | null }[];
}

interface AssignIngredient {
  ingredientId: number; nom: string; unite: string; categorie: string;
  activities: { activiteId: number; nom: string; type: string | null; franchiseGroup: string | null; assigned: boolean }[];
}

interface Fournisseur { id: number; nom: string }


export default function StockLaboPage() {
  const { t } = useTranslation();
  const { canWrite } = useAuth();
  const [searchParams] = useSearchParams();
  const laboId = searchParams.get('laboId') || '';
  const tab = searchParams.get('tab') === 'ingredients' ? 'ingredients' : 'stock';

  const [labo, setLabo] = useState<{ nom: string; franchiseGroup: string; referentTel: string; adresse?: string; activites?: LaboActivite[] } | null>(null);
  const [stock, setStock] = useState<LaboStockRow[]>([]);
  const [rowState, setRowState] = useState<Record<number, RowState>>({});
  const [seuilMinEdits, setSeuilMinEdits] = useState<Record<number, string>>({});
  const [seuilMinSaving, setSeuilMinSaving] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [fournisseurModal, setFournisseurModal] = useState<{ ingredientId: number; nom: string } | null>(null);
  const [perteModal, setPerteModal] = useState<{ ingredientId: number; nom: string } | null>(null);
  const [perteQty, setPerteQty] = useState('');
  const [perteType, setPerteType] = useState<'avarie' | 'dechet'>('avarie');
  const [perteDate, setPerteDate] = useState(todayStr());
  const [perteSaving, setPerteSaving] = useState(false);

  // Assignment data
  const [assignments, setAssignments] = useState<{ activites: LaboActivite[]; ingredients: AssignIngredient[] } | null>(null);
  const [assignLoading, setAssignLoading] = useState(true);

  // Collapsible categories
  const [openStockCats, setOpenStockCats] = useState<Set<string>>(new Set());
  const [openIngCats, setOpenIngCats] = useState<Set<string>>(new Set());

  // Pagination
  const [stockCatPage, setStockCatPage] = useState(1);
  const STOCK_CAT_PAGE_SIZE = 10;
  const [ingCatPage, setIngCatPage] = useState(1);
  const ING_CAT_PAGE_SIZE = 10;

  // ── Stock tab filters
  const [sFilterCat, setSFilterCat] = useState('');
  const [sFilterIngId, setSFilterIngId] = useState('');
  const [sFilterNom, setSFilterNom] = useState('');
  const [sFilterFournisseur, setSFilterFournisseur] = useState('');
  const [sFilterRefFacture, setSFilterRefFacture] = useState('');

  // ── Ingredients tab filters
  const [iFilterCat, setIFilterCat] = useState('');
  const [iFilterIngId, setIFilterIngId] = useState('');
  const [iFilterNom, setIFilterNom] = useState('');

  // ── Activity popup (Stock tab)
  const [activityPopup, setActivityPopup] = useState<{
    activite: LaboActivite;
    unitTotals: { unite: string; qty: number; value: number }[];
    anchor: { x: number; y: number };
  } | null>(null);

  // ── Bulk appro selection
  const [selectedIngIds, setSelectedIngIds] = useState<Set<number>>(new Set());
  const [bulkDate, setBulkDate] = useState(todayStr());
  const [bulkFournisseurId, setBulkFournisseurId] = useState('');
  const [bulkRefFacture, setBulkRefFacture] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);

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
        init[r.ingredientId] = {
          quantite: '0', prixUnitaire: '0', dateAppro: today,
          fournisseurId: '', refFacture: '',
          hasExisting: r.quantite !== null,
          saving: false, saved: false, historyOpen: false, history: [],
        };
        seuilInit[r.ingredientId] = r.seuilMin !== null ? String(r.seuilMin) : '';
      }
      setRowState(init);
      setSeuilMinEdits(seuilInit);
    } catch { /* ignore */ }
    setLoading(false);
  }, [laboId, today]);

  const loadAssignments = useCallback(async () => {
    if (!laboId) return;
    setAssignLoading(true);
    try {
      const { data } = await api.get(`/api/labo/${laboId}/activity-assignments`);
      setAssignments(data);
    } catch { /* ignore */ }
    setAssignLoading(false);
  }, [laboId]);

  useEffect(() => {
    loadLabo();
    loadStock();
    loadAssignments();
    if (laboId) {
      api.get(`/api/labo/${laboId}/fournisseurs`).then(({ data }) => setFournisseurs(data)).catch(() => {});
    }
  }, [loadLabo, loadStock, loadAssignments, laboId]);

  const setField = (ingredientId: number, field: keyof RowState, value: unknown) => {
    setRowState((prev) => ({ ...prev, [ingredientId]: { ...prev[ingredientId], [field]: value } }));
  };

  const setDateApproField = (ingredientId: number, newDate: string) => {
    const r = stock.find((s) => s.ingredientId === ingredientId);
    const rs = rowState[ingredientId];
    if (!r || !rs) return;
    const histDates = new Set<string>((rs.history || []).map((h) => h.dateAppro).filter(Boolean) as string[]);
    const hasConflict = (r.quantite !== null && newDate === r.dateAppro) || histDates.has(newDate);
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

  const canSaveRow = (rs: RowState | undefined, isPT = false): boolean => {
    if (!rs || rs.saving) return false;
    if (!rs.quantite.trim() || !rs.prixUnitaire.trim() || !rs.dateAppro.trim()) return false;
    if (!isPT && hasFournisseurs && (!rs.fournisseurId.trim() || !rs.refFacture.trim())) return false;
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
          historyOpen: false, history: [],
        },
      }));
      setTimeout(() => setField(ingredientId, 'saved', false), 2000);
      loadStock();
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

  const savePerte = async () => {
    if (!perteModal || !perteQty.trim() || parseFloat(perteQty) <= 0) return;
    setPerteSaving(true);
    try {
      await api.post(`/api/labo/${laboId}/stock/${perteModal.ingredientId}/perte`, {
        quantite: parseFloat(perteQty),
        typePerte: perteType,
        datePerte: perteDate,
      });
      setPerteModal(null);
      setPerteQty('');
      setPerteType('avarie');
      setPerteDate(todayStr());
      loadStock();
    } catch { /* ignore */ }
    setPerteSaving(false);
  };

  const toggleAssignment = async (ingredientId: number, activiteId: number) => {
    try {
      const { data } = await api.post(`/api/labo/${laboId}/ingredients/${ingredientId}/assign-to-activity`, { activiteId });
      setAssignments((prev) => prev ? {
        ...prev,
        ingredients: prev.ingredients.map((ing) =>
          ing.ingredientId === ingredientId
            ? { ...ing, activities: ing.activities.map((a) => a.activiteId === activiteId ? { ...a, assigned: data.assigned } : a) }
            : ing
        ),
      } : prev);
    } catch { /* ignore */ }
  };

  const toggleBulkSelect = (ingredientId: number) => {
    if (selectedIngIds.has(ingredientId)) {
      setSelectedIngIds((prev) => { const n = new Set(prev); n.delete(ingredientId); return n; });
      return;
    }
    // Guard: all currently selected must have qty > 0 AND prix > 0
    const allValid = [...selectedIngIds].every((id) => {
      const rs = rowState[id];
      if (!rs) return false;
      const qty = parseFloat(rs.quantite);
      const prix = parseFloat(rs.prixUnitaire);
      return !isNaN(qty) && qty > 0 && !isNaN(prix) && prix > 0;
    });
    if (selectedIngIds.size > 0 && !allValid) return;
    setSelectedIngIds((prev) => new Set([...prev, ingredientId]));
  };

  const saveBulk = async () => {
    if (selectedIngIds.size === 0 || !bulkDate) return;
    setBulkSaving(true);
    try {
      for (const ingId of selectedIngIds) {
        const rs = rowState[ingId];
        if (!rs) continue;
        await api.put(`/api/labo/${laboId}/stock/${ingId}`, {
          quantite: parseFloat(rs.quantite),
          prixUnitaire: parseFloat(rs.prixUnitaire),
          dateAppro: bulkDate,
          fournisseurId: bulkFournisseurId ? Number(bulkFournisseurId) : null,
          refFacture: bulkRefFacture.trim() || null,
        });
      }
      setSelectedIngIds(new Set());
      setBulkDate(todayStr());
      setBulkFournisseurId('');
      setBulkRefFacture('');
      loadStock();
    } catch { /* ignore */ }
    setBulkSaving(false);
  };

  // Activity popup: compute unit totals for an activity
  const openActivityPopup = (e: React.MouseEvent, act: LaboActivite) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const assignedIngIds = new Set(
      (assignments?.ingredients ?? [])
        .filter((ing) => ing.activities.some((a) => a.activiteId === act.id && a.assigned))
        .map((ing) => ing.ingredientId)
    );
    // Aggregate by unit from stock data
    const unitMap = new Map<string, { qty: number; value: number }>();
    for (const row of stock) {
      if (!assignedIngIds.has(row.ingredientId)) continue;
      if (row.quantite === null || row.quantite <= 0) continue;
      const key = row.unite;
      const existing = unitMap.get(key) ?? { qty: 0, value: 0 };
      existing.qty += row.quantite;
      existing.value += row.quantite * (row.prixUnitaire ?? 0);
      unitMap.set(key, existing);
    }
    const unitTotals = Array.from(unitMap.entries()).map(([unite, v]) => ({ unite, qty: v.qty, value: v.value }));
    setActivityPopup({ activite: act, unitTotals, anchor: { x: rect.left + rect.width / 2, y: rect.bottom + window.scrollY + 8 } });
  };

  const activites: LaboActivite[] = assignments?.activites ?? [];

  // ── Stock tab filters
  const allStockCats = Array.from(new Set(stock.map((r) => r.categorie))).sort();
  const stockInCat = sFilterCat ? stock.filter((r) => r.categorie === sFilterCat) : stock;
  const filteredStock = stock.filter((r) => {
    if (sFilterCat && r.categorie !== sFilterCat) return false;
    if (sFilterIngId && String(r.ingredientId) !== sFilterIngId) return false;
    if (sFilterNom && !r.nom.toLowerCase().includes(sFilterNom.toLowerCase())) return false;
    if (sFilterFournisseur && String(r.lastFournisseurId ?? '') !== sFilterFournisseur) return false;
    if (sFilterRefFacture && !(r.lastRefFacture ?? '').toLowerCase().includes(sFilterRefFacture.toLowerCase())) return false;
    return true;
  });
  const stockGroups: Record<string, LaboStockRow[]> = {};
  for (const r of filteredStock) {
    if (!stockGroups[r.categorie]) stockGroups[r.categorie] = [];
    stockGroups[r.categorie].push(r);
  }

  // ── Ingredients tab filters
  const allIngCats = Array.from(new Set((assignments?.ingredients ?? []).map((i) => i.categorie))).sort();
  const ingInCat = iFilterCat ? (assignments?.ingredients ?? []).filter((i) => i.categorie === iFilterCat) : (assignments?.ingredients ?? []);
  const filteredIngredients = (assignments?.ingredients ?? []).filter((ing) => {
    if (iFilterCat && ing.categorie !== iFilterCat) return false;
    if (iFilterIngId && String(ing.ingredientId) !== iFilterIngId) return false;
    if (iFilterNom && !ing.nom.toLowerCase().includes(iFilterNom.toLowerCase())) return false;
    return true;
  });
  const ingGroups: Record<string, AssignIngredient[]> = {};
  for (const ing of filteredIngredients) {
    if (!ingGroups[ing.categorie]) ingGroups[ing.categorie] = [];
    ingGroups[ing.categorie].push(ing);
  }

  const bulkAllValid = [...selectedIngIds].every((id) => {
    const rs = rowState[id];
    if (!rs) return false;
    const qty = parseFloat(rs.quantite);
    const prix = parseFloat(rs.prixUnitaire);
    return !isNaN(qty) && qty > 0 && !isNaN(prix) && prix > 0;
  });
  const canSaveBulk = selectedIngIds.size > 0 && !!bulkDate.trim() && bulkAllValid
    && (!hasFournisseurs || (!!bulkFournisseurId && !!bulkRefFacture.trim()));

  if (!laboId) return <div className="page"><p className="text-muted">Labo introuvable.</p></div>;

  return (
    <div className="page" onClick={() => activityPopup && setActivityPopup(null)}>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1>🏭 {labo ? labo.nom : t('common.loading')} — {tab === 'stock' ? t('client.labo.stock_title') : 'Ingrédients Stock'}</h1>
          {labo && (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 2 }}>
              {labo.franchiseGroup} · ☎ {labo.referentTel}{labo.adresse ? ` · 📍 ${labo.adresse}` : ''}
            </p>
          )}
        </div>
        {tab === 'stock' && (
          <Link to={`/client/labo/transfer?laboId=${laboId}`} className="btn btn-primary btn-sm">
            ↗ {t('client.labo.btn_transfer')}
          </Link>
        )}
      </div>

      {/* ══ STOCK TAB ══ */}
      {tab === 'stock' && (
        <>
          {/* Activity pills row */}
          {activites.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, padding: '10px 14px', background: 'var(--primary-light, #eef2ff)', borderRadius: 10, border: '1px solid #c7d2fe' }}>
              {activites.map((act) => (
                <button
                  key={act.id}
                  onClick={(e) => { e.stopPropagation(); openActivityPopup(e, act); }}
                  style={{
                    padding: '4px 12px', borderRadius: 20, border: '1px solid var(--primary)',
                    background: 'white', color: 'var(--primary)', fontWeight: 600,
                    fontSize: '0.82rem', cursor: 'pointer',
                  }}
                >
                  {act.nom}
                  {act.type && <span style={{ fontSize: '0.65rem', marginLeft: 4, opacity: 0.7 }}>{act.type === 'franchise' ? 'F' : 'D'}</span>}
                </button>
              ))}
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', alignSelf: 'center', marginLeft: 4 }}>← cliquer pour les détails</span>
            </div>
          )}

          {/* Activity popup */}
          {activityPopup && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'fixed',
                top: Math.min(activityPopup.anchor.y - window.scrollY, window.innerHeight - 200),
                left: Math.min(activityPopup.anchor.x, window.innerWidth - 200),
                transform: 'translateX(-50%)',
                background: 'white', border: '1px solid var(--border)',
                borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                padding: '14px 18px', zIndex: 1000, minWidth: 180,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                {activityPopup.activite.nom}
              </div>
              {activityPopup.unitTotals.length === 0 ? (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Aucun stock disponible</p>
              ) : (
                activityPopup.unitTotals.map(({ unite, qty, value }) => (
                  <div key={unite} style={{ marginBottom: 8, padding: '6px 10px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{unite}</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--primary)' }}>{qty.toFixed(3)} {unite}</div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{value.toFixed(3)} DT</div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Filter panel */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, marginBottom: 24, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary, #f8fafc)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--text-muted)' }}>Filtres</span>
              {(sFilterCat || sFilterIngId || sFilterNom || sFilterFournisseur || sFilterRefFacture) && (
                <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.78rem' }} onClick={() => { setSFilterCat(''); setSFilterIngId(''); setSFilterNom(''); setSFilterFournisseur(''); setSFilterRefFacture(''); }}>✕ Réinitialiser</button>
              )}
            </div>
            <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px 20px' }}>
              <div>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>Catégorie</span>
                <select className="input" style={{ width: '100%' }} value={sFilterCat} onChange={(e) => { setSFilterCat(e.target.value); setSFilterIngId(''); }}>
                  <option value="">{t('client.catalogue_franchise.all_categories')}</option>
                  {allStockCats.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>Ingrédient</span>
                <select className="input" style={{ width: '100%' }} value={sFilterIngId} disabled={!sFilterCat} onChange={(e) => setSFilterIngId(e.target.value)}>
                  <option value="">— Tous —</option>
                  {stockInCat.map((r) => <option key={r.ingredientId} value={String(r.ingredientId)}>{r.nom}</option>)}
                </select>
              </div>
              <div>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>Nom ingrédient</span>
                <input type="text" className="input" style={{ width: '100%' }} placeholder="Rechercher…" value={sFilterNom} onChange={(e) => setSFilterNom(e.target.value)} />
              </div>
              {fournisseurs.length > 0 && (
                <div>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>Fournisseur</span>
                  <select className="input" style={{ width: '100%' }} value={sFilterFournisseur} onChange={(e) => setSFilterFournisseur(e.target.value)}>
                    <option value="">— Tous —</option>
                    {fournisseurs.map((f) => <option key={f.id} value={String(f.id)}>{f.nom}</option>)}
                  </select>
                </div>
              )}
              <div>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>Réf Facture</span>
                <input type="text" className="input" style={{ width: '100%' }} placeholder="N° facture…" value={sFilterRefFacture} onChange={(e) => setSFilterRefFacture(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Bulk appro form */}
          {selectedIngIds.size > 0 && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16, padding: '12px 16px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.05em', alignSelf: 'center', marginRight: 4 }}>
                ✓ {selectedIngIds.size} sélectionné{selectedIngIds.size > 1 ? 's' : ''}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={LABEL}>Date d'appro</span>
                <input type="date" className="input" style={{ maxWidth: 150 }} min={yearStart} max={yearEnd} value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} />
              </div>
              {hasFournisseurs && (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={LABEL}>Fournisseur</span>
                    <select className="input" style={{ maxWidth: 200 }} value={bulkFournisseurId} onChange={(e) => setBulkFournisseurId(e.target.value)}>
                      <option value="">— Sélectionner —</option>
                      {fournisseurs.map((f) => <option key={f.id} value={String(f.id)}>{f.nom}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={LABEL}>Réf Facture</span>
                    <input type="text" className="input" style={{ maxWidth: 160 }} placeholder="N° facture…" value={bulkRefFacture} onChange={(e) => setBulkRefFacture(e.target.value)} />
                  </div>
                </>
              )}
              <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-end' }}>
                <button className="btn btn-primary btn-sm" onClick={saveBulk} disabled={!canSaveBulk || bulkSaving || !canWrite}>
                  {bulkSaving ? '…' : `Enregistrer (${selectedIngIds.size})`}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedIngIds(new Set()); setBulkDate(todayStr()); setBulkFournisseurId(''); setBulkRefFacture(''); }}>
                  Annuler
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <p className="text-muted">{t('common.loading')}</p>
          ) : stock.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">🏭</span>
              <p>{t('client.labo.empty_stock')}</p>
            </div>
          ) : Object.keys(stockGroups).length === 0 ? (
            <p className="text-muted">{t('common.no_result')}</p>
          ) : (() => {
            const sorted = Object.entries(stockGroups).sort(([a], [b]) => a.localeCompare(b));
            const totalPages = Math.max(1, Math.ceil(sorted.length / STOCK_CAT_PAGE_SIZE));
            const paged = sorted.slice((stockCatPage - 1) * STOCK_CAT_PAGE_SIZE, stockCatPage * STOCK_CAT_PAGE_SIZE);
            return (
              <>
                {paged.map(([cat, rows]) => {
                  const isOpen = openStockCats.has(cat);
                  const toggle = () => setOpenStockCats((prev) => { const n = new Set(prev); if (n.has(cat)) n.delete(cat); else n.add(cat); return n; });
                  return (
                    <div key={cat} style={{ marginBottom: 12 }}>
                      <button onClick={toggle} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', width: '100%', textAlign: 'left', borderBottom: '2px solid var(--border)', marginBottom: isOpen ? 10 : 0 }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>🏷️ {cat}</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>({rows.length})</span>
                        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{isOpen ? '▼' : '▶'}</span>
                      </button>
                      {isOpen && (
                        <div className="table-responsive card th-indigo" style={{ marginBottom: 0 }}>
                          <table className="table">
                            <thead>
                              <tr>
                                <th style={{ width: 32 }}></th>
                                <th>{t('client.stock.ingredient')}</th>
                                <th style={{ textAlign: 'right' }}>Stock actuel<br /><span style={{ fontSize: '0.65rem', fontWeight: 400, color: 'var(--text-muted)' }}>cout · transféré</span></th>
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
                                const isSelected = selectedIngIds.has(r.ingredientId);
                                const canSelect = isSelected || bulkAllValid || selectedIngIds.size === 0;
                                return (
                                  <React.Fragment key={r.ingredientId}>
                                    <tr style={isSelected ? { background: '#f0fdf4' } : r.isPT ? { background: '#f5f3ff' } : undefined}>
                                      <td style={{ textAlign: 'center' }}>
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          disabled={!canSelect || !!r.isPT}
                                          onChange={() => !r.isPT && toggleBulkSelect(r.ingredientId)}
                                          style={{ width: 16, height: 16, cursor: (canSelect && !r.isPT) ? 'pointer' : 'not-allowed', accentColor: 'var(--primary)' }}
                                          title={r.isPT ? 'Produit Transformé — appro individuelle' : !canSelect ? 'Remplissez la qté et prix des ingrédients sélectionnés avant d\'en ajouter un autre' : undefined}
                                        />
                                      </td>
                                      <td>
                                        <div style={{ fontWeight: 600 }}>
                                          {r.isPT && <span style={{ fontSize: '0.68rem', background: '#7c3aed', color: '#fff', borderRadius: 4, padding: '1px 5px', marginRight: 5, fontWeight: 700 }}>PT</span>}
                                          {r.nom}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.unite}</div>
                                      </td>
                                      <td style={{ textAlign: 'right' }}>
                                        <span className={cls} style={{ fontSize: '1rem', fontWeight: 700 }}>
                                          {r.quantite !== null ? r.quantite.toFixed(3) : '—'}
                                        </span>
                                        {r.coutTotal != null && r.coutTotal > 0 && (
                                          <div style={{ fontSize: '0.72rem', color: '#1d4ed8', fontWeight: 500 }}>{r.coutTotal.toFixed(3)} DT</div>
                                        )}
                                        {r.totalTransfere > 0 && (
                                          <div style={{ fontSize: '0.72rem', color: '#7c3aed', fontWeight: 600 }}>↗ {r.totalTransfere.toFixed(3)}</div>
                                        )}
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
                                        <input type="number" min="0" step="0.001" value={rs.quantite} onChange={(e) => setField(r.ingredientId, 'quantite', e.target.value)} style={{ width: 76, textAlign: 'right', ...warnStyle }} className="input" />
                                      </td>
                                      <td style={{ textAlign: 'right' }}>
                                        <input type="number" min="0" step="0.001" value={rs.prixUnitaire} onChange={(e) => setField(r.ingredientId, 'prixUnitaire', e.target.value)} style={{ width: 84, textAlign: 'right', ...warnStyle }} className="input" />
                                      </td>
                                      <td>
                                        <input type="date" className="input" style={{ maxWidth: 138, ...warnStyle }} min={yearStart} max={yearEnd} value={rs.dateAppro} onChange={(e) => setDateApproField(r.ingredientId, e.target.value)} disabled={isSelected} title={isSelected ? 'Date définie par le formulaire ci-dessus' : undefined} />
                                      </td>
                                      <td>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'stretch' }}>
                                          {fournisseurs.length > 0 && !r.isPT && (() => {
                                            const assignedF = rs.fournisseurId ? fournisseurs.find((f) => String(f.id) === rs.fournisseurId) : null;
                                            const validated = !!assignedF && rs.refFacture.trim() !== '';
                                            return (
                                              <button
                                                className="btn btn-sm"
                                                onClick={() => !isSelected && setFournisseurModal({ ingredientId: r.ingredientId, nom: r.nom })}
                                                disabled={isSelected}
                                                title={isSelected ? 'Fournisseur défini par le formulaire ci-dessus' : undefined}
                                                style={{
                                                  width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                  background: isSelected ? '#e5e7eb' : validated ? '#dcfce7' : assignedF ? '#fef9c3' : '#eff6ff',
                                                  color: isSelected ? '#9ca3af' : validated ? '#15803d' : assignedF ? '#92400e' : '#2563eb',
                                                  border: `1px solid ${isSelected ? '#d1d5db' : validated ? '#86efac' : assignedF ? '#fde68a' : '#bfdbfe'}`,
                                                }}
                                              >
                                                {isSelected ? 'Fournisseur (bulk)' : validated ? `✓ ${assignedF!.nom}` : assignedF ? `${assignedF.nom}…` : 'Fournisseur'}
                                              </button>
                                            );
                                          })()}
                                          <div style={{ display: 'flex', gap: 4 }}>
                                            {!r.isPT && (
                                              <button
                                                className="perte-btn"
                                                onClick={() => { setPerteModal({ ingredientId: r.ingredientId, nom: r.nom }); setPerteQty(''); setPerteType('avarie'); setPerteDate(todayStr()); }}
                                                title="Enregistrer une perte"
                                                disabled={!canWrite}
                                              >
                                                📉
                                              </button>
                                            )}
                                            <button className={`btn btn-sm ${rs.saved ? 'btn-success' : 'btn-primary'}`} onClick={() => saveRow(r.ingredientId)} disabled={!canSaveRow(rs, r.isPT) || !canWrite} style={{ flex: 1 }}>
                                              {rs.saving ? '…' : rs.saved ? '✓' : t('common.save')}
                                            </button>
                                            <button className="btn btn-ghost btn-sm" onClick={() => toggleHistory(r.ingredientId)} title="5 derniers appros">
                                              {rs.historyOpen ? '📋▲' : '📋'}
                                            </button>
                                          </div>
                                        </div>
                                      </td>
                                    </tr>

                                    {/* Appro history collapse */}
                                    {rs.historyOpen && (
                                      <tr>
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
                                                {rs.history.slice(0, 5).map((h, i) => (
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

                                  </React.Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
                {totalPages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 8, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    <button className="btn btn-ghost btn-sm" disabled={stockCatPage === 1} onClick={() => setStockCatPage((p) => Math.max(1, p - 1))} style={{ padding: '3px 10px', fontWeight: 700 }}>‹</button>
                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>{stockCatPage} / {totalPages}</span>
                    <button className="btn btn-ghost btn-sm" disabled={stockCatPage === totalPages} onClick={() => setStockCatPage((p) => Math.min(totalPages, p + 1))} style={{ padding: '3px 10px', fontWeight: 700 }}>›</button>
                  </div>
                )}
              </>
            );
          })()}
        </>
      )}

      {/* ══ INGREDIENTS TAB ══ */}
      {tab === 'ingredients' && (
        <>
          {/* Filter panel */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, marginBottom: 24, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary, #f8fafc)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--text-muted)' }}>Filtres</span>
              {(iFilterCat || iFilterIngId || iFilterNom) && (
                <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.78rem' }} onClick={() => { setIFilterCat(''); setIFilterIngId(''); setIFilterNom(''); }}>✕ Réinitialiser</button>
              )}
            </div>
            <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px 20px' }}>
              <div>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>Catégorie</span>
                <select className="input" style={{ width: '100%' }} value={iFilterCat} onChange={(e) => { setIFilterCat(e.target.value); setIFilterIngId(''); }}>
                  <option value="">{t('client.catalogue_franchise.all_categories')}</option>
                  {allIngCats.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>Ingrédient</span>
                <select className="input" style={{ width: '100%' }} value={iFilterIngId} disabled={!iFilterCat} onChange={(e) => setIFilterIngId(e.target.value)}>
                  <option value="">— Tous —</option>
                  {ingInCat.map((i) => <option key={i.ingredientId} value={String(i.ingredientId)}>{i.nom}</option>)}
                </select>
              </div>
              <div>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>Nom ingrédient</span>
                <input type="text" className="input" style={{ width: '100%' }} placeholder="Rechercher…" value={iFilterNom} onChange={(e) => setIFilterNom(e.target.value)} />
              </div>
            </div>
          </div>

          {assignLoading ? (
            <p className="text-muted">{t('common.loading')}</p>
          ) : (assignments?.ingredients ?? []).length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">🧂</span>
              <p>Aucun ingrédient assigné à ce labo. Utilisez le Catalogue Global pour en ajouter.</p>
            </div>
          ) : activites.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">🔗</span>
              <p>Aucune activité liée à ce labo.</p>
            </div>
          ) : (() => {
            const sorted = Object.entries(ingGroups).sort(([a], [b]) => a.localeCompare(b));
            const totalPages = Math.max(1, Math.ceil(sorted.length / ING_CAT_PAGE_SIZE));
            const paged = sorted.slice((ingCatPage - 1) * ING_CAT_PAGE_SIZE, ingCatPage * ING_CAT_PAGE_SIZE);
            return (
              <>
                {paged.map(([cat, items]) => {
                  const isOpen = openIngCats.has(cat);
                  const toggle = () => setOpenIngCats((prev) => { const n = new Set(prev); if (n.has(cat)) n.delete(cat); else n.add(cat); return n; });
                  return (
                    <div key={cat} style={{ marginBottom: 16 }}>
                      <button onClick={toggle} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', width: '100%', textAlign: 'left', borderBottom: '2px solid var(--border)', marginBottom: isOpen ? 10 : 0 }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>🏷️ {cat}</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>({items.length})</span>
                        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{isOpen ? '▼' : '▶'}</span>
                      </button>
                      {isOpen && (
                        <div className="table-responsive card" style={{ overflowX: 'auto', marginBottom: 0 }}>
                          <table className="table" style={{ minWidth: 400 }}>
                            <thead>
                              <tr>
                                <th style={{ minWidth: 160 }}>{t('client.stock.ingredient')}</th>
                                {activites.map((act) => (
                                  <th key={act.id} style={{ textAlign: 'center', minWidth: 100, color: 'var(--primary)' }}>
                                    <div>{act.nom}</div>
                                    {act.type && <div style={{ fontSize: '0.65rem', fontWeight: 400, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{act.type === 'franchise' ? 'F' : 'D'}</div>}
                                  </th>
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
                                  {activites.map((act) => {
                                    const a = ing.activities.find((x) => x.activiteId === act.id);
                                    return (
                                      <td key={act.id} style={{ textAlign: 'center' }}>
                                        <input
                                          type="checkbox"
                                          checked={a?.assigned ?? false}
                                          onChange={() => toggleAssignment(ing.ingredientId, act.id)}
                                          style={{ width: 18, height: 18, accentColor: 'var(--primary)', cursor: 'pointer' }}
                                        />
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
                {totalPages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 8, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    <button className="btn btn-ghost btn-sm" disabled={ingCatPage === 1} onClick={() => setIngCatPage((p) => Math.max(1, p - 1))} style={{ padding: '3px 10px', fontWeight: 700 }}>‹</button>
                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>{ingCatPage} / {totalPages}</span>
                    <button className="btn btn-ghost btn-sm" disabled={ingCatPage === totalPages} onClick={() => setIngCatPage((p) => Math.min(totalPages, p + 1))} style={{ padding: '3px 10px', fontWeight: 700 }}>›</button>
                  </div>
                )}
              </>
            );
          })()}
        </>
      )}

      {/* Perte modal */}
      {perteModal && (
        <div className="modal-overlay" onClick={() => setPerteModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header modal-header--danger">
              <h2>📉 Déclarer une perte — {perteModal.nom}</h2>
              <button className="modal-close" onClick={() => setPerteModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <label style={{ ...LABEL, display: 'block', marginBottom: 6 }}>Quantité perdue</label>
              <input
                className="input" type="number" min="0.001" step="0.001"
                style={{ width: '100%', fontSize: '0.9rem', marginBottom: 16 }}
                value={perteQty} onChange={(e) => setPerteQty(e.target.value)}
                placeholder="Ex: 2.5"
                autoFocus
              />
              <label style={{ ...LABEL, display: 'block', marginBottom: 6 }}>Type de perte</label>
              <select className="input" style={{ width: '100%', fontSize: '0.9rem', marginBottom: 16 }} value={perteType} onChange={(e) => setPerteType(e.target.value as 'avarie' | 'dechet')}>
                <option value="avarie">Avarie</option>
                <option value="dechet">Déchet</option>
              </select>
              <label style={{ ...LABEL, display: 'block', marginBottom: 6 }}>Date de perte</label>
              <input className="input" type="date" style={{ width: '100%', fontSize: '0.9rem', marginBottom: 16 }} value={perteDate} onChange={(e) => setPerteDate(e.target.value)} />
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setPerteModal(null)}>Annuler</button>
                <button
                  className="btn btn-danger"
                  onClick={savePerte}
                  disabled={!perteQty.trim() || parseFloat(perteQty) <= 0 || perteSaving}
                >
                  {perteSaving ? '…' : 'Enregistrer la perte'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fournisseur modal */}
      {fournisseurModal && (
        <div className="modal-overlay" onClick={() => setFournisseurModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header modal-header--primary">
              <h2>Fournisseur — {fournisseurModal.nom}</h2>
              <button className="modal-close" onClick={() => setFournisseurModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <label style={{ ...LABEL, display: 'block', marginBottom: 6 }}>Fournisseur</label>
              <select className="input" style={{ width: '100%', fontSize: '0.9rem', marginBottom: 16 }} value={rowState[fournisseurModal.ingredientId]?.fournisseurId ?? ''} onChange={(e) => setField(fournisseurModal.ingredientId, 'fournisseurId', e.target.value)}>
                <option value="">— Aucun fournisseur —</option>
                {fournisseurs.map((f) => <option key={f.id} value={String(f.id)}>{f.nom}</option>)}
              </select>
              <label style={{ ...LABEL, display: 'block', marginBottom: 6 }}>Réf. Facture / BL</label>
              <input className="input" style={{ width: '100%', fontSize: '0.9rem', marginBottom: 16 }} type="text" value={rowState[fournisseurModal.ingredientId]?.refFacture ?? ''} onChange={(e) => setField(fournisseurModal.ingredientId, 'refFacture', e.target.value)} placeholder="N° facture ou BL" />
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setFournisseurModal(null)}>Annuler</button>
                <button className="btn btn-primary" onClick={() => setFournisseurModal(null)}>Valider</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
