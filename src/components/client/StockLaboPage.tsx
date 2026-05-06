import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import PortionsModal from './PortionsModal';

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
  fontSize: '0.68rem', fontWeight: 800, color: '#2563eb',
  textTransform: 'uppercase', letterSpacing: '0.07em',
};

interface LaboActivite { id: number; nom: string; type: string | null; franchiseGroup: string | null }

interface LaboStockRow {
  ingredientId: number;
  produitId?: number;
  isPT?: boolean;
  nom: string;
  unite: string;
  categorie: string;
  activite?: string | null;
  quantite: number | null;
  prixUnitaire: number | null;
  prixCalcule?: number | null;
  dateAppro: string | null;
  seuilMin: number | null;
  coutTotal: number | null;
  totalTransfere: number;
  lastFournisseurId: number | null;
  lastRefFacture: string | null;
  recentDates?: string[];
  lastInvDate?: string | null;
  lastInvQty?: number | null;
  pertesDepuisInv?: number | null;
  ptUsageDepuisInv?: number | null;
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
  const [ptConfirm, setPtConfirm] = useState<{ ingredientId: number; nom: string; dateAppro: string; existingQty: number; newQty: number } | null>(null);
  const [perteQty, setPerteQty] = useState('');
  const [perteType, setPerteType] = useState<'avarie' | 'dechet'>('avarie');
  const [perteDate, setPerteDate] = useState(todayStr());
  const [perteSaving, setPerteSaving] = useState(false);
  const [pertePrix, setPertePrix] = useState<number | null>(null);
  const [pertePrixLoading, setPertePrixLoading] = useState(false);
  const [perteDateMin, setPerteDateMin] = useState<string | null>(null);
  const [perteDateMax, setPerteDateMax] = useState<string | null>(null);

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

  // ── PT recipe / stock popup
  const [ptRecipes, setPtRecipes] = useState<Record<number, Array<{ ingredientId: number; nom: string; portion: number; unite: string }>>>({});
  const [ptStockModal, setPtStockModal] = useState<{ produitId: number; nom: string } | null>(null);
  const [portionsModal, setPortionsModal] = useState<{ produitId: number; nom: string } | null>(null);

  const fetchPtRecipe = async (produitId: number) => {
    if (ptRecipes[produitId]) return;
    try {
      const { data } = await api.get(`/api/produits/${produitId}`);
      setPtRecipes((prev) => ({
        ...prev,
        [produitId]: (data.ingredients || []).map((r: { ingredientId: number; ingredientName?: string; nom?: string; portion: number | string; unitName?: string; unite?: string }) => ({
          ingredientId: r.ingredientId,
          nom: r.ingredientName || r.nom || '',
          portion: parseFloat(String(r.portion)) || 0,
          unite: r.unitName || r.unite || '',
        })),
      }));
    } catch { /* ignore */ }
  };

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
          saving: false, saved: false, historyOpen: false,
          history: (r.recentDates || []).map((d) => ({ dateAppro: d, quantite: null, prixUnitaire: null, fournisseurNom: null, refFacture: null })),
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
    if (!rs.quantite.trim() || parseFloat(rs.quantite) <= 0) return false;
    if (!isPT && (!rs.prixUnitaire.trim() || !rs.dateAppro.trim())) return false;
    if (!rs.dateAppro.trim()) return false;
    if (!isPT && hasFournisseurs && (!rs.fournisseurId.trim() || !rs.refFacture.trim())) return false;
    return true;
  };

  const saveRow = async (ingredientId: number, confirmed = false) => {
    const rs = rowState[ingredientId];
    const row = stock.find((r) => r.ingredientId === ingredientId);
    const isPT = row?.isPT ?? false;
    if (!rs || !canSaveRow(rs, isPT)) return;

    // For PT rows, check for existing appro on the chosen date before accumulating
    if (isPT && !confirmed) {
      let history = rs.history;
      if (history.length === 0) {
        try {
          const { data } = await api.get(`/api/labo/${laboId}/stock/${ingredientId}/history`);
          history = data;
          setField(ingredientId, 'history', data);
        } catch { /* ignore */ }
      }
      const existingOnDate = history.filter((h) => h.dateAppro === rs.dateAppro && (h.quantite ?? 0) > 0);
      if (existingOnDate.length > 0) {
        const existingTotal = existingOnDate.reduce((sum, h) => sum + (h.quantite ?? 0), 0);
        setPtConfirm({
          ingredientId,
          nom: row?.nom ?? '',
          dateAppro: rs.dateAppro,
          existingQty: existingTotal,
          newQty: parseFloat(rs.quantite),
        });
        return;
      }
    }

    // For ingredient rows, also check for existing appro on chosen date
    if (!isPT && !confirmed) {
      let history = rs.history;
      if (history.length === 0) {
        try {
          const { data } = await api.get(`/api/labo/${laboId}/stock/${ingredientId}/history`);
          history = data;
          setField(ingredientId, 'history', data);
        } catch { /* ignore */ }
      }
      const existingOnDate = history.filter((h) => h.dateAppro === rs.dateAppro && (h.quantite ?? 0) > 0);
      if (existingOnDate.length > 0) {
        const existingTotal = existingOnDate.reduce((sum, h) => sum + (h.quantite ?? 0), 0);
        setPtConfirm({
          ingredientId,
          nom: stock.find((r) => r.ingredientId === ingredientId)?.nom ?? '',
          dateAppro: rs.dateAppro,
          existingQty: existingTotal,
          newQty: parseFloat(rs.quantite),
        });
        return;
      }
    }

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

  const fetchPerteDateRange = async (ingredientId: number) => {
    if (ingredientId < 0) { setPerteDateMin(null); setPerteDateMax(null); return; }
    try {
      const r = await api.get(`/api/labo/${laboId}/pertes/date-range`, { params: { ingredientId } });
      const { minDate, maxDate } = r.data;
      setPerteDateMin(minDate ?? null);
      setPerteDateMax(maxDate ?? null);
      const today = new Date().toISOString().split('T')[0];
      if (maxDate && today > maxDate) setPerteDate(maxDate);
      else if (minDate && today < minDate) setPerteDate(minDate);
    } catch { setPerteDateMin(null); setPerteDateMax(null); }
  };

  const fetchPertePrix = async (ingredientId: number, date: string) => {
    if (ingredientId < 0) { setPertePrix(null); return; } // PT — no price
    setPertePrixLoading(true);
    try {
      const r = await api.get(`/api/labo/${laboId}/pertes/prix`, { params: { ingredientId, date } });
      setPertePrix(r.data.prixUnitaire ?? null);
    } catch { setPertePrix(null); }
    setPertePrixLoading(false);
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
      setPertePrix(null);
      setPerteDateMin(null);
      setPerteDateMax(null);
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

  const subtitle = labo
    ? `${labo.franchiseGroup} · ☎ ${labo.referentTel}${labo.adresse ? ` · ${labo.adresse}` : ''}`
    : t('common.loading');

  return (
    <div className="page" onClick={() => activityPopup && setActivityPopup(null)}>
      {/* Hero header */}
      <div style={{
        background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 60%, #0ea5e9 100%)',
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(37,99,235,0.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🏭</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>
              Stock Labo{labo ? ` — ${labo.nom}` : ''}
            </h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>{subtitle}</p>
        </div>
        {tab === 'stock' && (
          <Link
            to={`/client/labo/transfer?laboId=${laboId}`}
            style={{ background: 'rgba(37,99,235,0.1)', border: '1.5px solid #2563eb', color: '#2563eb', borderRadius: 9, padding: '8px 16px', fontWeight: 700, textDecoration: 'none', background: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.6)', color: '#fff' }}
          >
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
          <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '16px 20px', border: '1px solid var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Filtres</span>
              {(sFilterCat || sFilterIngId || sFilterNom || sFilterFournisseur || sFilterRefFacture) && (
                <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.78rem' }} onClick={() => { setSFilterCat(''); setSFilterIngId(''); setSFilterNom(''); setSFilterFournisseur(''); setSFilterRefFacture(''); }}>✕ Réinitialiser</button>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px 20px' }}>
              <div>
                <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>Catégorie</span>
                <select className="input" style={{ width: '100%' }} value={sFilterCat} onChange={(e) => { setSFilterCat(e.target.value); setSFilterIngId(''); }}>
                  <option value="">{t('client.catalogue_franchise.all_categories')}</option>
                  {allStockCats.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>Ingrédient</span>
                <select className="input" style={{ width: '100%' }} value={sFilterIngId} disabled={!sFilterCat} onChange={(e) => setSFilterIngId(e.target.value)}>
                  <option value="">— Tous —</option>
                  {stockInCat.map((r) => <option key={r.ingredientId} value={String(r.ingredientId)}>{r.nom}</option>)}
                </select>
              </div>
              <div>
                <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>Nom ingrédient</span>
                <input type="text" className="input" style={{ width: '100%' }} placeholder="Rechercher…" value={sFilterNom} onChange={(e) => setSFilterNom(e.target.value)} />
              </div>
              {fournisseurs.length > 0 && (
                <div>
                  <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>Fournisseur</span>
                  <select className="input" style={{ width: '100%' }} value={sFilterFournisseur} onChange={(e) => setSFilterFournisseur(e.target.value)}>
                    <option value="">— Tous —</option>
                    {fournisseurs.map((f) => <option key={f.id} value={String(f.id)}>{f.nom}</option>)}
                  </select>
                </div>
              )}
              <div>
                <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>Réf Facture</span>
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
                <input type="date" className="input" style={{ maxWidth: 150 }} min={yearStart} max={todayStr()} value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} />
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
              <p style={{ color: 'var(--text-muted)' }}>{t('client.labo.empty_stock')}</p>
            </div>
          ) : Object.keys(stockGroups).length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>🔍</div>
              <p>{t('common.no_result')}</p>
            </div>
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
                      <button onClick={toggle} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', width: '100%', textAlign: 'left', borderLeft: '4px solid #2563eb', borderBottom: '1px solid var(--border)', marginBottom: isOpen ? 10 : 0, borderRadius: isOpen ? '4px 4px 0 0' : 4 }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.06em' }}>🏷️ {cat}</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>({rows.length})</span>
                        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{isOpen ? '▼' : '▶'}</span>
                      </button>
                      {isOpen && (
                        <div className="table-responsive card th-indigo" style={{ marginBottom: 0 }}>
                          <table className="table">
                            <thead style={{ background: '#eff6ff', borderBottom: '2px solid #2563eb', color: '#1e3a5f' }}>
                              <tr>
                                <th style={{ width: 32, fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '12px 14px' }}></th>
                                <th style={{ fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '12px 14px' }}>{t('client.stock.ingredient')}</th>
                                <th style={{ textAlign: 'right', fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '12px 14px' }}>Stock actuel<br /><span style={{ fontSize: '0.65rem', fontWeight: 400, opacity: 0.75 }}>cout · pertes · PT</span></th>
                                <th style={{ textAlign: 'right', fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '12px 14px', minWidth: 90 }}>Inventaire<br /><span style={{ fontSize: '0.65rem', fontWeight: 400, opacity: 0.75 }}>DATE · QTÉ</span></th>
                                <th style={{ textAlign: 'center', fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '12px 14px' }}>Seuil min</th>
                                <th style={{ textAlign: 'right', fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '12px 14px' }}>Nouvelle Qté</th>
                                <th style={{ textAlign: 'right', fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '12px 14px' }}>Prix (DT/U)</th>
                                <th style={{ fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '12px 14px' }}>{t('client.stock.date_appro')}</th>
                                <th style={{ fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '12px 14px' }}></th>
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
                                        {r.isPT && r.activite && (
                                          <div style={{ fontSize: '0.70rem', color: '#7c3aed', fontWeight: 500, marginTop: 1 }}>📍 {r.activite}</div>
                                        )}
                                      </td>
                                      <td style={{ textAlign: 'right' }}>
                                        <span className={cls} style={{ fontSize: '1rem', fontWeight: 800, color: cls === 'stock-ok' ? '#2563eb' : undefined }}>
                                          {r.quantite !== null ? r.quantite.toFixed(3) : '—'}
                                        </span>
                                        {r.coutTotal != null && r.coutTotal > 0 && (
                                          <div style={{ fontSize: '0.72rem', color: '#1d4ed8', fontWeight: 500 }}>{r.coutTotal.toFixed(3)} DT</div>
                                        )}
                                        {r.totalTransfere > 0 && (
                                          <div style={{ fontSize: '0.72rem', color: '#7c3aed', fontWeight: 600 }}>↗ {r.totalTransfere.toFixed(3)}</div>
                                        )}
                                        {r.pertesDepuisInv != null && r.pertesDepuisInv > 0 && (
                                          <div style={{ fontSize: '0.68rem', color: '#dc2626', fontWeight: 500 }}>Pertes: {r.pertesDepuisInv.toFixed(3)}</div>
                                        )}
                                        {r.ptUsageDepuisInv != null && r.ptUsageDepuisInv > 0 && (
                                          <div style={{ fontSize: '0.68rem', color: '#7c3aed', fontWeight: 500 }}>PT: {r.ptUsageDepuisInv.toFixed(3)}</div>
                                        )}
                                      </td>
                                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                        {r.lastInvDate ? (
                                          <>
                                            <div style={{ fontSize: '0.72rem', color: '#1e3a5f', fontWeight: 700 }}>{r.lastInvDate.split('-').reverse().join('/')}</div>
                                            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{r.lastInvQty?.toFixed(3) ?? '—'}</div>
                                          </>
                                        ) : <span style={{ fontSize: '0.72rem', color: '#cbd5e1' }}>—</span>}
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
                                        {r.isPT ? (
                                          <div style={{ textAlign: 'right', padding: '4px 0' }} title="Calculé automatiquement depuis les prix des ingrédients du labo">
                                            {r.prixCalcule != null && r.prixCalcule > 0 ? (
                                              <span style={{ fontSize: '0.88rem', color: '#7c3aed', fontWeight: 600 }}>{r.prixCalcule.toFixed(3)}</span>
                                            ) : r.prixUnitaire != null ? (
                                              <span style={{ fontSize: '0.88rem', color: '#6b7280', fontWeight: 500 }}>{r.prixUnitaire.toFixed(3)}</span>
                                            ) : (
                                              <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>—</span>
                                            )}
                                          </div>
                                        ) : (
                                          <input type="number" min="0" step="0.001" value={rs.prixUnitaire} onChange={(e) => setField(r.ingredientId, 'prixUnitaire', e.target.value)} style={{ width: 84, textAlign: 'right', ...warnStyle }} className="input" />
                                        )}
                                      </td>
                                      <td>
                                        <input type="date" className="input" style={{ maxWidth: 138, ...warnStyle }} min={yearStart} max={todayStr()} value={rs.dateAppro} onChange={(e) => setDateApproField(r.ingredientId, e.target.value)} disabled={isSelected} title={isSelected ? 'Date définie par le formulaire ci-dessus' : undefined} />
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
                                            <button
                                              className="perte-btn"
                                              onClick={() => { setPerteModal({ ingredientId: r.ingredientId, nom: r.nom }); setPerteQty(''); setPerteType('avarie'); const d = todayStr(); setPerteDate(d); setPerteDateMin(null); setPerteDateMax(null); fetchPerteDateRange(r.ingredientId).then(() => fetchPertePrix(r.ingredientId, d)); }}
                                              title="Enregistrer une perte"
                                              disabled={!canWrite}
                                            >
                                              📉
                                            </button>
                                            {r.isPT && r.produitId && (
                                              <>
                                                <button
                                                  className="btn btn-ghost btn-sm"
                                                  title="Stock des ingrédients relatifs"
                                                  onClick={() => { fetchPtRecipe(r.produitId!); setPtStockModal({ produitId: r.produitId!, nom: r.nom }); }}
                                                >
                                                  📊
                                                </button>
                                                {canWrite && (
                                                  <button
                                                    className="btn btn-ghost btn-sm"
                                                    title="Portions personnalisées pour cette appro"
                                                    onClick={() => setPortionsModal({ produitId: r.produitId!, nom: r.nom })}
                                                  >
                                                    ⚙️
                                                  </button>
                                                )}
                                              </>
                                            )}
                                            {(() => {
                                              const ptMaxQty = r.isPT && r.produitId && ptRecipes[r.produitId] && ptRecipes[r.produitId].length > 0
                                                ? Math.min(...ptRecipes[r.produitId].map((rec) => {
                                                    const st = stock.find((s) => s.ingredientId === rec.ingredientId)?.quantite ?? 0;
                                                    return rec.portion > 0 ? (st ?? 0) / rec.portion : Infinity;
                                                  }))
                                                : null;
                                              const ptQtyExceeds = ptMaxQty !== null && isFinite(ptMaxQty)
                                                && rs.quantite.trim() !== '' && parseFloat(rs.quantite) > ptMaxQty;
                                              return (
                                                <>
                                                  {ptQtyExceeds && (
                                                    <span style={{ fontSize: '0.7rem', color: '#b91c1c', fontWeight: 700, alignSelf: 'center' }} title={`Max: ${ptMaxQty!.toFixed(3)}`}>
                                                      Max: {ptMaxQty!.toFixed(3)}
                                                    </span>
                                                  )}
                                                  <button
                                                    className={`btn btn-sm ${rs.saved ? 'btn-success' : 'btn-primary'}`}
                                                    onClick={() => saveRow(r.ingredientId)}
                                                    disabled={!canSaveRow(rs, r.isPT) || !canWrite || !!ptQtyExceeds}
                                                    style={!rs.saved ? { background: 'linear-gradient(135deg, #2563eb, #0ea5e9)', boxShadow: '0 3px 10px rgba(37,99,235,0.3)', borderRadius: 8, border: 'none', color: '#fff', fontWeight: 700, flex: 1 } : { flex: 1 }}
                                                  >
                                                    {rs.saving ? '…' : rs.saved ? '✓' : t('common.save')}
                                                  </button>
                                                </>
                                              );
                                            })()}
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
                                        <td colSpan={9} style={{ background: 'var(--surface)', padding: '8px 16px' }}>
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
          <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '16px 20px', border: '1px solid var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Filtres</span>
              {(iFilterCat || iFilterIngId || iFilterNom) && (
                <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.78rem' }} onClick={() => { setIFilterCat(''); setIFilterIngId(''); setIFilterNom(''); }}>✕ Réinitialiser</button>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px 20px' }}>
              <div>
                <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>Catégorie</span>
                <select className="input" style={{ width: '100%' }} value={iFilterCat} onChange={(e) => { setIFilterCat(e.target.value); setIFilterIngId(''); }}>
                  <option value="">{t('client.catalogue_franchise.all_categories')}</option>
                  {allIngCats.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>Ingrédient</span>
                <select className="input" style={{ width: '100%' }} value={iFilterIngId} disabled={!iFilterCat} onChange={(e) => setIFilterIngId(e.target.value)}>
                  <option value="">— Tous —</option>
                  {ingInCat.map((i) => <option key={i.ingredientId} value={String(i.ingredientId)}>{i.nom}</option>)}
                </select>
              </div>
              <div>
                <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>Nom ingrédient</span>
                <input type="text" className="input" style={{ width: '100%' }} placeholder="Rechercher…" value={iFilterNom} onChange={(e) => setIFilterNom(e.target.value)} />
              </div>
            </div>
          </div>

          {assignLoading ? (
            <p className="text-muted">{t('common.loading')}</p>
          ) : (assignments?.ingredients ?? []).length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">🧂</span>
              <p style={{ color: 'var(--text-muted)' }}>Aucun ingrédient assigné à ce labo. Utilisez le Catalogue Global pour en ajouter.</p>
            </div>
          ) : activites.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">🔗</span>
              <p style={{ color: 'var(--text-muted)' }}>Aucune activité liée à ce labo.</p>
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
                      <button onClick={toggle} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', width: '100%', textAlign: 'left', borderLeft: '4px solid #2563eb', borderBottom: '1px solid var(--border)', marginBottom: isOpen ? 10 : 0, borderRadius: isOpen ? '4px 4px 0 0' : 4 }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.06em' }}>🏷️ {cat}</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>({items.length})</span>
                        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{isOpen ? '▼' : '▶'}</span>
                      </button>
                      {isOpen && (
                        <div className="table-responsive card" style={{ overflowX: 'auto', marginBottom: 0 }}>
                          <table className="table" style={{ minWidth: 400 }}>
                            <thead style={{ background: '#eff6ff', borderBottom: '2px solid #2563eb', color: '#1e3a5f' }}>
                              <tr>
                                <th style={{ minWidth: 160, fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '12px 14px' }}>{t('client.stock.ingredient')}</th>
                                {activites.map((act) => (
                                  <th key={act.id} style={{ textAlign: 'center', minWidth: 100, fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '12px 14px' }}>
                                    <div>{act.nom}</div>
                                    {act.type && <div style={{ fontSize: '0.65rem', fontWeight: 400, opacity: 0.75, textTransform: 'uppercase' }}>{act.type === 'franchise' ? 'F' : 'D'}</div>}
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
            <div className="modal-header" style={{ background: 'linear-gradient(135deg, #dc2626, #b91c1c)', borderBottom: 'none' }}>
              <h2 style={{ color: '#fff', margin: 0 }}>📉 Déclarer une perte — {perteModal.nom}</h2>
              <button className="modal-close" onClick={() => setPerteModal(null)} style={{ color: '#fff' }}>✕</button>
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
              <input className="input" type="date" style={{ width: '100%', fontSize: '0.9rem' }}
                min={perteDateMin ?? undefined} max={perteDateMax ?? todayStr()} value={perteDate}
                onChange={(e) => { setPerteDate(e.target.value); if (perteModal) fetchPertePrix(perteModal.ingredientId, e.target.value); }} />
              {perteDateMin && perteDateMax && (
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 3, marginBottom: 12 }}>
                  Appros : {perteDateMin.split('-').reverse().join('/')} → {perteDateMax.split('-').reverse().join('/')}
                </p>
              )}
              {perteModal && perteModal.ingredientId >= 0 && (
                <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '7px 12px', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.8rem', color: '#7f1d1d', fontWeight: 600 }}>Prix unitaire appro</span>
                    <span style={{ fontWeight: 700, color: '#991b1b' }}>
                      {pertePrixLoading ? '…' : pertePrix != null ? `${pertePrix.toFixed(3)} DT` : '—'}
                    </span>
                  </div>
                  {pertePrix != null && perteQty && parseFloat(perteQty) > 0 && (
                    <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6, padding: '7px 12px', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.8rem', color: '#7c2d12', fontWeight: 600 }}>Coût total</span>
                      <span style={{ fontWeight: 700, color: '#c2410c' }}>{(pertePrix * parseFloat(perteQty)).toFixed(3)} DT</span>
                    </div>
                  )}
                </div>
              )}
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
      {/* PT accumulation confirmation modal */}
      {ptConfirm && (
        <div className="modal-overlay" onClick={() => setPtConfirm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header" style={{ background: '#7c3aed', color: '#fff' }}>
              <h2 style={{ margin: 0, fontSize: '1rem' }}>⚠️ Appro existante — {ptConfirm.nom}</h2>
              <button className="modal-close" onClick={() => setPtConfirm(null)} style={{ color: '#fff' }}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 12 }}>
                Tu as déjà un appro à cette date (<strong>{fmtDate(ptConfirm.dateAppro)}</strong>) avec la quantité{' '}
                <strong>{ptConfirm.existingQty.toFixed(3)}</strong>.
              </p>
              <p style={{ marginBottom: 20 }}>
                Es-tu sûr d'ajouter <strong>{ptConfirm.newQty.toFixed(3)}</strong> ?{' '}
                Car ça te fait un total d'appro de{' '}
                <strong style={{ color: '#7c3aed', fontSize: '1.05rem' }}>
                  {ptConfirm.existingQty.toFixed(3)} + {ptConfirm.newQty.toFixed(3)} = {(ptConfirm.existingQty + ptConfirm.newQty).toFixed(3)}
                </strong>
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setPtConfirm(null)}>Annuler</button>
                <button
                  className="btn btn-primary"
                  style={{ background: '#7c3aed', borderColor: '#7c3aed' }}
                  onClick={() => { const id = ptConfirm.ingredientId; setPtConfirm(null); saveRow(id, true); }}
                >
                  Confirmer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {ptStockModal && (() => {
        const recipe = ptRecipes[ptStockModal.produitId] ?? [];
        const recipeRows = recipe.map((r) => {
          const st = stock.find((s) => s.ingredientId === r.ingredientId)?.quantite ?? 0;
          const maxUnits = r.portion > 0 ? (st ?? 0) / r.portion : Infinity;
          return { ...r, stock: st ?? 0, maxUnits };
        });
        const overallMax = recipeRows.length > 0 ? Math.min(...recipeRows.map((r) => r.maxUnits)) : null;
        return (
          <div className="modal-overlay" onClick={() => setPtStockModal(null)}>
            <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header" style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)', borderBottom: 'none' }}>
                <h2 style={{ color: '#fff', margin: 0, fontSize: '1rem' }}>📊 Stock — {ptStockModal.nom}</h2>
                <button className="modal-close" onClick={() => setPtStockModal(null)} style={{ color: '#fff' }}>×</button>
              </div>
              <div className="modal-body">
                {recipe.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>Recette non chargée ou vide.</p>
                ) : (
                  <div className="table-responsive">
                    <table className="table" style={{ fontSize: '0.85rem' }}>
                      <thead>
                        <tr>
                          <th>Ingrédient</th>
                          <th style={{ textAlign: 'right' }}>Portion</th>
                          <th style={{ textAlign: 'right' }}>Stock actuel</th>
                          <th style={{ textAlign: 'right' }}>Max PT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recipeRows.map((r) => (
                          <tr key={r.ingredientId}>
                            <td>{r.nom}</td>
                            <td style={{ textAlign: 'right' }}>{r.portion} {r.unite}</td>
                            <td style={{ textAlign: 'right', fontWeight: 600, color: r.stock <= 0 ? 'var(--danger)' : 'var(--success)' }}>{r.stock.toFixed(3)}</td>
                            <td style={{ textAlign: 'right', color: '#7c3aed', fontWeight: 700 }}>{isFinite(r.maxUnits) ? r.maxUnits.toFixed(3) : '∞'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {overallMax !== null && (
                  <div style={{ marginTop: 12, padding: '8px 14px', background: '#f5f3ff', borderRadius: 8, border: '1px solid #ddd6fe', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, color: '#7c3aed', fontSize: '0.85rem' }}>Quantité max réalisable</span>
                    <span style={{ fontWeight: 900, color: '#7c3aed', fontSize: '1.1rem' }}>{isFinite(overallMax) ? overallMax.toFixed(3) : '∞'}</span>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-primary" onClick={() => setPtStockModal(null)}>Fermer</button>
              </div>
            </div>
          </div>
        );
      })()}

      {portionsModal && (
        <PortionsModal
          produitNom={portionsModal.nom}
          recipeUrl={`/api/labo/${laboId}/pt/${portionsModal.produitId}/recipe`}
          stockMap={Object.fromEntries(stock.filter((s) => !s.isPT).map((s) => [s.ingredientId, s.quantite ?? 0]))}
          onSave={async (qty, dateAppro, customPortions) => {
            await api.put(`/api/labo/${laboId}/stock/-${portionsModal.produitId}`, {
              quantite: qty,
              dateAppro,
              customPortions: customPortions.length > 0 ? customPortions : undefined,
            });
          }}
          onClose={() => setPortionsModal(null)}
          onSaved={() => { loadStock(); }}
        />
      )}
    </div>
  );
}
