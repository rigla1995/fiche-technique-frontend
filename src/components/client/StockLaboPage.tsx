import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import PortionsModal from './PortionsModal';

const currentYear = new Date().getFullYear();
const yearStart = `${currentYear}-01-01`;
const todayStr = () => new Date().toISOString().split('T')[0];

const fmtDate = (iso: string | null | undefined) => {
  if (!iso || iso.length < 10) return iso ?? '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

const seuilLabelClass = (restante: number | null, seuil: number | null): string => {
  if (restante === null) return '';
  if (!seuil || seuil <= 0) return restante <= 0 ? 'stock-alert' : 'stock-ok';
  if (restante <= 0) return 'stock-alert';
  if (restante <= seuil) return 'stock-alert';
  if (restante <= seuil * 1.1) return 'stock-warn';
  return 'stock-ok';
};

const LABEL: React.CSSProperties = {
  fontSize: '0.68rem', fontWeight: 800, color: '#2563eb',
  textTransform: 'uppercase', letterSpacing: '0.07em',
};

interface LaboActivite { id: number; nom: string }

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
  coutTotalTTC?: number | null;
  totalTransfere: number;
  lastFournisseurId: number | null;
  lastRefFacture: string | null;
  recentDates?: string[];
  lastInvDate?: string | null;
  lastInvQty?: number | null;
  pertesDepuisInv?: number | null;
  ptUsageDepuisInv?: number | null;
  transfertsDepuisInv?: number | null;
}

interface RowState {
  quantite: string;
  prixUnitaire: string;
  dateAppro: string;
  fournisseurId: string;
  refFacture: string;
  tauxTva: string;
  hasExisting: boolean;
  saving: boolean;
  saved: boolean;
  historyOpen: boolean;
  history: { dateAppro: string; quantite: number | null; prixUnitaire: number | null; fournisseurNom: string | null; refFacture: string | null; typeAppro?: string | null }[];
}

interface AssignIngredient {
  ingredientId: number; nom: string; unite: string; categorie: string;
  activities: { activiteId: number; nom: string; assigned: boolean }[];
}

interface Fournisseur { id: number; nom: string }


export default function StockLaboPage() {
  const { t } = useTranslation();
  const { canWrite, user } = useAuth();
  const isGerantLabo = user?.role === 'gerant';
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const laboId = searchParams.get('laboId') || '';
  const tab = searchParams.get('tab') === 'ingredients' ? 'ingredients' : 'stock';
  const [allLabos, setAllLabos] = useState<{ id: number; nom: string }[]>([]);

  const [labo, setLabo] = useState<{ nom: string; referentTel: string; adresse?: string; activites?: LaboActivite[] } | null>(null);
  const [stock, setStock] = useState<LaboStockRow[]>([]);
  const [rowState, setRowState] = useState<Record<number, RowState>>({});
  const [seuilMinEdits, setSeuilMinEdits] = useState<Record<number, string>>({});
  const [, setSeuilMinSaving] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [perteModal, setPerteModal] = useState<{ ingredientId: number; nom: string; quantite: number | null } | null>(null);
  const [perteErrMsg, setPerteErrMsg] = useState('');
  const [ptConfirm, setPtConfirm] = useState<{ ingredientId: number; nom: string; dateAppro: string; existingQty: number; newQty: number } | null>(null);
  const [perteQty, setPerteQty] = useState('');
  const [perteType, setPerteType] = useState<'avarie' | 'dechet'>('avarie');
  const [perteDate, setPerteDate] = useState(todayStr());
  const [perteSaving, setPerteSaving] = useState(false);
  const [pertePrix, setPertePrix] = useState<number | null>(null);
  const [pertePrixLoading, setPertePrixLoading] = useState(false);
  const [perteLoadingRange, setPerteLoadingRange] = useState(false);
  const [perteDateMin, setPerteDateMin] = useState<string | null>(null);
  const [, setPerteDateMax] = useState<string | null>(null);

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

  // ── Bulk appro
  const [bulkDate, setBulkDate] = useState(todayStr());
  const [bulkFournisseurId, setBulkFournisseurId] = useState('');
  const [bulkRefFacture, setBulkRefFacture] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [seuilModal, setSeuilModal] = useState<{ ingredientId: number; nom: string } | null>(null);

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
          fournisseurId: '', refFacture: '', tauxTva: '',
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

  useEffect(() => {
    api.get('/api/labo').then(({ data }) => setAllLabos(data)).catch(() => {});
  }, []);

  const setField = (ingredientId: number, field: keyof RowState, value: unknown) => {
    setRowState((prev) => ({ ...prev, [ingredientId]: { ...prev[ingredientId], [field]: value } }));
  };

  const canSaveRow = (rs: RowState | undefined, isPT = false): boolean => {
    if (!rs || rs.saving) return false;
    if (!rs.quantite.trim() || parseFloat(rs.quantite) <= 0) return false;
    if (!isPT && (!rs.prixUnitaire.trim() || parseFloat(rs.prixUnitaire) <= 0)) return false;
    if (!bulkDate.trim()) return false;
    if (!isPT && !bulkRefFacture.trim()) return false;
    if (!isPT && fournisseurs.length > 0 && !bulkFournisseurId.trim()) return false;
    return true;
  };

  const saveRow = async (ingredientId: number, confirmed = false) => {
    const rs = rowState[ingredientId];
    const row = stock.find((r) => r.ingredientId === ingredientId);
    const isPT = row?.isPT ?? false;
    if (!rs || !canSaveRow(rs, isPT)) return;

    // Check for existing appro on the chosen date before accumulating
    if (!confirmed) {
      let history = rs.history;
      if (history.length === 0) {
        try {
          const { data } = await api.get(`/api/labo/${laboId}/stock/${ingredientId}/history`);
          history = data;
          setField(ingredientId, 'history', data);
        } catch { /* ignore */ }
      }
      const existingOnDate = history.filter((h) => h.dateAppro === bulkDate && (h.quantite ?? 0) > 0);
      if (existingOnDate.length > 0) {
        const existingTotal = existingOnDate.reduce((sum, h) => sum + (h.quantite ?? 0), 0);
        setPtConfirm({
          ingredientId,
          nom: row?.nom ?? '',
          dateAppro: bulkDate,
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
        dateAppro: bulkDate || today,
        fournisseurId: bulkFournisseurId ? Number(bulkFournisseurId) : null,
        refFacture: bulkRefFacture.trim() || null,
        tauxTva: rs.tauxTva?.trim() ? parseFloat(rs.tauxTva) : null,
      });
      setRowState((prev) => ({
        ...prev,
        [ingredientId]: {
          ...prev[ingredientId],
          saving: false, saved: true, hasExisting: true,
          quantite: '0', prixUnitaire: '0', dateAppro: today,
          fournisseurId: '', refFacture: '', tauxTva: '',
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
    setPerteLoadingRange(true);
    try {
      const r = await api.get(`/api/labo/${laboId}/pertes/date-range`, { params: { ingredientId } });
      const { minDate, maxDate } = r.data;
      setPerteDateMin(minDate ?? null);
      setPerteDateMax(maxDate ?? null);
      if (minDate) {
        const today = todayStr();
        if (today < minDate) setPerteDate(minDate);
      }
    } catch { setPerteDateMin(null); setPerteDateMax(null); }
    setPerteLoadingRange(false);
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
    setPerteErrMsg('');
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
    } catch (err: unknown) {
      const d = (err as { response?: { data?: { message?: string; disponible?: number; demande?: number } } })?.response?.data;
      if (d?.disponible !== undefined) {
        setPerteErrMsg(`Stock insuffisant — disponible : ${d.disponible} | demandé : ${d.demande}`);
      } else {
        setPerteErrMsg(d?.message || 'Erreur lors de l\'enregistrement');
      }
    }
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

  const saveBulk = async () => {
    if (!bulkDate) return;
    setBulkSaving(true);
    try {
      const readyEntries = Object.entries(rowState).filter(([idStr, rs]) => {
        const id = Number(idStr);
        const stockRow = stock.find((r) => r.ingredientId === id);
        if (stockRow?.isPT) return false;
        const qty = parseFloat(rs.quantite);
        const prix = parseFloat(rs.prixUnitaire);
        return !isNaN(qty) && qty > 0 && !isNaN(prix) && prix > 0;
      });
      for (const [idStr, rs] of readyEntries) {
        await api.put(`/api/labo/${laboId}/stock/${Number(idStr)}`, {
          quantite: parseFloat(rs.quantite),
          prixUnitaire: parseFloat(rs.prixUnitaire),
          dateAppro: bulkDate,
          fournisseurId: bulkFournisseurId ? Number(bulkFournisseurId) : null,
          refFacture: bulkRefFacture.trim() || null,
          tauxTva: rs.tauxTva?.trim() ? parseFloat(rs.tauxTva) : null,
        });
      }
      setBulkDate(todayStr());
      setBulkFournisseurId('');
      setBulkRefFacture('');
      setRowState((prev) => {
        const next = { ...prev };
        for (const id of Object.keys(next)) next[Number(id)] = { ...next[Number(id)], tauxTva: '' };
        return next;
      });
      loadStock();
    } catch { /* ignore */ }
    setBulkSaving(false);
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

  const readyCount = Object.entries(rowState).filter(([idStr, rs]) => {
    const id = Number(idStr);
    const stockRow = stock.find((r) => r.ingredientId === id);
    if (stockRow?.isPT) return false;
    const qty = parseFloat(rs.quantite);
    const prix = parseFloat(rs.prixUnitaire);
    return !isNaN(qty) && qty > 0 && !isNaN(prix) && prix > 0;
  }).length;
  const hasFournisseurs = fournisseurs.length > 0;
  const canSaveBulk = readyCount > 0 && !!bulkDate.trim()
    && (!hasFournisseurs || !!bulkFournisseurId) && !!bulkRefFacture.trim();

  if (!laboId) return <div className="page"><p className="text-muted">Labo introuvable.</p></div>;

  return (
    <div className="page">
      {/* Hero header */}
      <div style={{
        background: 'linear-gradient(135deg, #3b0764 0%, #7e22ce 55%, #a855f7 100%)',
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(126,34,206,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🏭</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>
              Stock Labo{labo ? ` — ${labo.nom}` : ''}
            </h1>
          </div>
          <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.82rem' }}>
            Gérez les stocks et approvisionnements de vos laboratoires
          </span>
        </div>
        {tab === 'stock' && (
          <Link
            to={`/client/labo/transfer?laboId=${laboId}`}
            style={{ background: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.6)', color: '#fff', borderRadius: 9, padding: '8px 16px', fontWeight: 700, textDecoration: 'none' }}
          >
            ↗ {t('client.labo.btn_transfer')}
          </Link>
        )}
      </div>

      {/* Labo selector row — always visible */}
      {allLabos.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, padding: '10px 14px', background: 'var(--card-bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
          {allLabos.map((l) => (
            <button
              key={l.id}
              onClick={() => navigate(`/client/labo/stock?laboId=${l.id}`)}
              style={{
                padding: '4px 14px', borderRadius: 20, cursor: 'pointer', fontSize: '0.82rem',
                border: laboId === String(l.id) ? '1.5px solid #7e22ce' : '1.5px solid var(--border)',
                background: laboId === String(l.id) ? '#7e22ce' : 'var(--bg)',
                color: laboId === String(l.id) ? '#fff' : 'var(--text)',
                fontWeight: laboId === String(l.id) ? 700 : 400,
              }}
            >
              🏭 {l.nom}
            </button>
          ))}
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', alignSelf: 'center', marginLeft: 4 }}>← sélectionner le labo</span>
        </div>
      )}

      {/* ══ STOCK TAB ══ */}
      {tab === 'stock' && (
        <>


          {/* Filter panel — compact single-row layout */}
          <div style={{
            background: 'var(--surface)', borderRadius: 10, padding: '10px 14px', marginBottom: 20,
            border: '1px solid var(--border)', boxShadow: '0 1px 6px rgba(0,0,0,0.04)',
          }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
              {/* Catégorie */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <label style={{ fontSize: '0.62rem', fontWeight: 800, color: '#7e22ce', textTransform: 'uppercase', letterSpacing: '0.07em' }}>🏷️ Catégorie</label>
                <select style={{ padding: '6px 10px', borderRadius: 7, border: '1.5px solid #7e22ce', fontSize: '0.82rem', background: '#faf5ff', minWidth: 140 }} value={sFilterCat} onChange={(e) => { setSFilterCat(e.target.value); setSFilterIngId(''); }}>
                  <option value="">{t('client.catalogue_franchise.all_categories')}</option>
                  {allStockCats.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {/* Ingrédient */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <label style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>🧂 Article</label>
                <select style={{ padding: '6px 10px', borderRadius: 7, border: '1.5px solid var(--border)', fontSize: '0.82rem', background: 'var(--background)', minWidth: 140 }} value={sFilterIngId} disabled={!sFilterCat} onChange={(e) => setSFilterIngId(e.target.value)}>
                  <option value="">— Tous —</option>
                  {stockInCat.map((r) => <option key={r.ingredientId} value={String(r.ingredientId)}>{r.nom}</option>)}
                </select>
              </div>
              {/* Nom */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <label style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>🔍 Nom</label>
                <input type="text" style={{ padding: '6px 10px', borderRadius: 7, border: '1.5px solid var(--border)', fontSize: '0.82rem', background: 'var(--background)', minWidth: 130 }} placeholder="Rechercher…" value={sFilterNom} onChange={(e) => setSFilterNom(e.target.value)} />
              </div>
              {/* Fournisseur — always visible */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <label style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>🚚 Fournisseur</label>
                {hasFournisseurs ? (
                  <select style={{ padding: '6px 10px', borderRadius: 7, border: '1.5px solid var(--border)', fontSize: '0.82rem', background: 'var(--background)', minWidth: 140 }} value={sFilterFournisseur} onChange={(e) => setSFilterFournisseur(e.target.value)}>
                    <option value="">— Tous —</option>
                    {fournisseurs.map((f) => <option key={f.id} value={String(f.id)}>{f.nom}</option>)}
                  </select>
                ) : (
                  <select style={{ padding: '6px 10px', borderRadius: 7, border: '2px solid #f97316', fontSize: '0.82rem', background: '#fff7ed', minWidth: 140, color: '#9a3412', fontStyle: 'italic' }} disabled>
                    <option>⚠ Aucun fournisseur</option>
                  </select>
                )}
              </div>
              {/* Réf. Facture */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <label style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>🧾 Réf. Facture</label>
                <input type="text" style={{ padding: '6px 10px', borderRadius: 7, border: '1.5px solid var(--border)', fontSize: '0.82rem', background: 'var(--background)', minWidth: 130 }} placeholder="Réf. facture…" value={sFilterRefFacture} onChange={(e) => setSFilterRefFacture(e.target.value)} />
              </div>
              {/* Reset */}
              {(sFilterCat || sFilterIngId || sFilterNom || sFilterFournisseur || sFilterRefFacture) && (
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 2 }}>
                  <label style={{ fontSize: '0.62rem', opacity: 0 }}>x</label>
                  <button onClick={() => { setSFilterCat(''); setSFilterIngId(''); setSFilterNom(''); setSFilterFournisseur(''); setSFilterRefFacture(''); }} style={{ alignSelf: 'flex-end', background: 'transparent', border: '1.5px solid var(--border)', borderRadius: 7, padding: '5px 9px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1, fontWeight: 700 }} title="Réinitialiser">✕</button>
                </div>
              )}
            </div>
          </div>

          {/* Seuil min modal */}
          {seuilModal && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setSeuilModal(null)}>
              <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '24px 28px', minWidth: 300, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', border: '1.5px solid var(--border)' }} onClick={(e) => e.stopPropagation()}>
                <div style={{ fontWeight: 800, fontSize: '0.9rem', marginBottom: 14, color: '#1e3a5f' }}>⚙ Seuil min — {seuilModal.nom}</div>
                <input
                  type="number" min="0" step="0.001" placeholder="Seuil minimum…"
                  value={seuilMinEdits[seuilModal.ingredientId] ?? ''}
                  onChange={(e) => setSeuilMinEdits((p) => ({ ...p, [seuilModal!.ingredientId]: e.target.value }))}
                  className="input" style={{ width: '100%', marginBottom: 10 }}
                  autoFocus
                />
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 14 }}>🔴 ≤ seuil &nbsp;·&nbsp; 🟠 seuil + 10% &nbsp;·&nbsp; 🟢 au-dessus</div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setSeuilModal(null)}>Annuler</button>
                  <button className="btn btn-primary btn-sm" onClick={async () => { await saveSeuilMin(seuilModal!.ingredientId); setSeuilModal(null); }}>Enregistrer</button>
                </div>
              </div>
            </div>
          )}

          {/* Approvisionnement bloc */}
          <div style={{
            background: 'var(--surface)', borderRadius: 12, padding: '18px 20px', marginBottom: 20,
            border: '1.5px solid #7e22ce', boxShadow: '0 2px 10px rgba(126,34,206,0.10)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid #d8b4fe' }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#7e22ce' }}>Approvisionnement</span>
              {readyCount > 0 && (
                <span style={{ background: '#7e22ce', color: '#fff', borderRadius: 20, padding: '1px 9px', fontSize: '0.72rem', fontWeight: 700 }}>{readyCount}</span>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
              <div>
                <label style={{ fontSize: '0.62rem', fontWeight: 700, color: '#7e22ce', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 3 }}>Date d'appro <span style={{ color: '#ef4444' }}>*</span></label>
                <input type="date" className="input" style={{ padding: '6px 10px', borderRadius: 7, fontSize: '0.82rem', border: '1.5px solid #7e22ce', background: '#fff', fontWeight: 600, maxWidth: 150 }} min={yearStart} max={todayStr()} value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: '0.62rem', fontWeight: 700, color: '#7e22ce', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 3 }}>Fournisseur</label>
                {hasFournisseurs ? (
                  <select className="input" style={{ padding: '6px 10px', borderRadius: 7, fontSize: '0.82rem', border: '1.5px solid #7e22ce', background: '#fff', fontWeight: 600, maxWidth: 200 }} value={bulkFournisseurId} onChange={(e) => setBulkFournisseurId(e.target.value)}>
                    <option value="">— Sélectionner —</option>
                    {fournisseurs.map((f) => <option key={f.id} value={String(f.id)}>{f.nom}</option>)}
                  </select>
                ) : (
                  <select className="input" style={{ padding: '6px 10px', borderRadius: 7, fontSize: '0.82rem', maxWidth: 240, color: '#9a3412', fontStyle: 'italic', border: '2px solid #f97316', background: '#fff7ed' }} disabled>
                    <option>⚠ Aucun fournisseur</option>
                  </select>
                )}
              </div>
              <div>
                <label style={{ fontSize: '0.62rem', fontWeight: 700, color: '#7e22ce', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 3 }}>Réf Facture <span style={{ color: '#ef4444' }}>*</span></label>
                <input type="text" className="input" style={{ padding: '6px 10px', borderRadius: 7, fontSize: '0.82rem', border: '1.5px solid #7e22ce', background: '#fff', fontWeight: 600, maxWidth: 160 }} placeholder="N° facture…" value={bulkRefFacture} onChange={(e) => setBulkRefFacture(e.target.value)} />
              </div>
              <div style={{ flex: 1 }} />
              <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-end' }}>
                <button className="btn btn-primary btn-sm" onClick={saveBulk} disabled={!canSaveBulk || bulkSaving || !canWrite}
                  style={{ background: canSaveBulk ? 'linear-gradient(135deg, #7e22ce, #a855f7)' : undefined, border: 'none', boxShadow: canSaveBulk ? '0 3px 10px rgba(126,34,206,0.3)' : undefined }}>
                  {bulkSaving ? '…' : `Enregistrer (${readyCount})`}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => { setBulkDate(todayStr()); setBulkFournisseurId(''); setBulkRefFacture(''); }}>
                  Réinitialiser
                </button>
              </div>
            </div>
          </div>

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
                          <table className="table" style={{ width: '100%' }}>
                            <thead style={{ background: '#f5f3ff', color: '#3b0764' }}>
                              <tr style={{ borderBottom: '1px solid #d8b4fe' }}>
                                {[
                                  { label: t('client.stock.ingredient'), minWidth: 180 },
                                  { label: 'Stock Actuel', minWidth: 110 },
                                  { label: 'Coût Total', minWidth: 100 },
                                  { label: 'Quantité', minWidth: 90 },
                                  { label: 'Prix', minWidth: 100 },
                                  { label: 'TVA (%)', minWidth: 80 },
                                  { label: 'Actions', minWidth: 150 },
                                ].map(({ label, minWidth }) => (
                                  <th key={label} style={{ fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.06em', textTransform: 'uppercase', padding: '10px 14px 4px', minWidth, textAlign: 'center' }}>
                                    {label}
                                  </th>
                                ))}
                              </tr>
                              <tr style={{ borderBottom: '2px solid #7e22ce' }}>
                                {[
                                  { sub: 'Hist.Appro · Unité' },
                                  { sub: 'Pertes · PT · Transfert' },
                                  { sub: 'HT · TTC' },
                                  { sub: 'Nouvelle' },
                                  { sub: 'HT / Unité' },
                                  { sub: 'Optionnel' },
                                  { sub: '' },
                                ].map(({ sub }, i) => (
                                  <th key={i} style={{ fontWeight: 400, fontSize: '0.62rem', color: '#a855f7', letterSpacing: '0.04em', padding: '2px 14px 8px', textAlign: 'center', opacity: 0.85 }}>
                                    {sub}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((r) => {
                                const rs = rowState[r.ingredientId];
                                if (!rs) return null;
                                const cls = seuilLabelClass(r.quantite, r.seuilMin);
                                const histDates = new Set<string>((rs.history || []).map((h) => h.dateAppro).filter(Boolean) as string[]);
                                const hasDateConflict = (r.quantite !== null && bulkDate === r.dateAppro) || histDates.has(bulkDate);
                                const warnStyle = hasDateConflict ? { borderColor: '#f59e0b', boxShadow: '0 0 0 2px #fef3c7' } : {};
                                return (
                                  <React.Fragment key={r.ingredientId}>
                                    <tr style={{ borderBottom: '1px solid #f1f5f9', ...(r.isPT ? { background: '#f5f3ff' } : {}) }}>
                                      <td style={{ padding: '10px 14px', verticalAlign: 'middle', textAlign: 'center' }}>
                                        <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>
                                          {r.isPT && <span style={{ fontSize: '0.68rem', background: '#7c3aed', color: '#fff', borderRadius: 4, padding: '1px 5px', marginRight: 5, fontWeight: 700 }}>PT</span>}
                                          {r.nom}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, justifyContent: 'center' }}>
                                          <span style={{ fontSize: '0.7rem', background: '#f5f3ff', color: '#7e22ce', borderRadius: 4, padding: '1px 7px', fontWeight: 600 }}>{r.unite}</span>
                                          <button className="btn btn-ghost btn-sm" onClick={() => toggleHistory(r.ingredientId)} title="5 derniers appros"
                                            style={{ fontSize: '0.7rem', color: '#0891b2', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 3 }}>
                                            {rs.historyOpen ? '📋 ▲' : '📋 Historique'}
                                          </button>
                                        </div>
                                        {r.isPT && r.activite && (
                                          <div style={{ fontSize: '0.70rem', color: '#7c3aed', fontWeight: 500, marginTop: 3 }}>📍 {r.activite}</div>
                                        )}
                                        {r.lastInvDate && (
                                          <div style={{ fontSize: '0.68rem', color: '#b45309', fontWeight: 600, marginTop: 3 }}>📦 {r.lastInvDate.split('-').reverse().join('/')} · {r.lastInvQty?.toFixed(3) ?? '—'}</div>
                                        )}
                                      </td>
                                      <td style={{ textAlign: 'center', padding: '10px 14px', verticalAlign: 'middle' }}>
                                        <span className={cls} style={{ fontSize: '1rem', fontWeight: 800 }}>
                                          {r.quantite !== null ? r.quantite.toFixed(3) : '—'}
                                        </span>
                                        {r.pertesDepuisInv != null && r.pertesDepuisInv > 0 && (
                                          <div style={{ fontSize: '0.68rem', color: '#dc2626', fontWeight: 500, marginTop: 2 }}>↘ Pertes: {r.pertesDepuisInv.toFixed(3)}</div>
                                        )}
                                        {r.ptUsageDepuisInv != null && r.ptUsageDepuisInv > 0 && (
                                          <div style={{ fontSize: '0.68rem', color: '#7c3aed', fontWeight: 500, marginTop: 1 }}>↘ PT: {r.ptUsageDepuisInv.toFixed(3)}</div>
                                        )}
                                        {r.transfertsDepuisInv != null && r.transfertsDepuisInv > 0 && (
                                          <div style={{ fontSize: '0.68rem', color: '#0369a1', fontWeight: 500, marginTop: 1 }}>↘ Transfert: {r.transfertsDepuisInv.toFixed(3)}</div>
                                        )}
                                      </td>
                                      <td style={{ textAlign: 'center', padding: '10px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                                        {r.coutTotal != null && r.coutTotal > 0 ? (
                                          <>
                                            <div>
                                              <span style={{ fontSize: '0.88rem', color: '#1d4ed8', fontWeight: 700 }}>{r.coutTotal.toFixed(3)}</span>
                                              <span style={{ fontSize: '0.72rem', color: '#64748b', marginLeft: 2 }}>DT</span>
                                            </div>
                                            {r.coutTotalTTC != null && r.coutTotalTTC > 0 && r.coutTotalTTC !== r.coutTotal && (
                                              <div style={{ fontSize: '0.72rem', color: '#7c3aed', marginTop: 2 }}>
                                                {r.coutTotalTTC.toFixed(3)} <span style={{ fontSize: '0.65rem', color: '#a78bfa' }}>TTC</span>
                                              </div>
                                            )}
                                          </>
                                        ) : <span style={{ color: '#cbd5e1', fontSize: '0.8rem' }}>—</span>}
                                      </td>
                                      <td style={{ textAlign: 'center', padding: '10px 14px', verticalAlign: 'middle' }}>
                                        <input type="number" min="0" step="0.001" value={rs.quantite} onChange={(e) => setField(r.ingredientId, 'quantite', e.target.value)} style={{ width: 76, textAlign: 'right', padding: '5px 8px', borderRadius: 7, fontSize: '0.85rem', ...warnStyle }} className="input" />
                                      </td>
                                      <td style={{ textAlign: 'center', padding: '10px 14px', verticalAlign: 'middle' }}>
                                        {r.isPT ? (
                                          <span title="Calculé automatiquement depuis les prix des articles du labo">
                                            {r.prixCalcule != null && r.prixCalcule > 0 ? (
                                              <span style={{ fontSize: '0.88rem', color: '#7c3aed', fontWeight: 600 }}>{r.prixCalcule.toFixed(3)}</span>
                                            ) : r.prixUnitaire != null ? (
                                              <span style={{ fontSize: '0.88rem', color: '#6b7280', fontWeight: 500 }}>{r.prixUnitaire.toFixed(3)}</span>
                                            ) : (
                                              <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>—</span>
                                            )}
                                          </span>
                                        ) : (
                                          <input type="number" min="0" step="0.001" value={rs.prixUnitaire} onChange={(e) => setField(r.ingredientId, 'prixUnitaire', e.target.value)} style={{ width: 84, textAlign: 'right', padding: '5px 8px', borderRadius: 7, fontSize: '0.85rem', ...warnStyle }} className="input" />
                                        )}
                                      </td>
                                      <td style={{ textAlign: 'center', padding: '10px 14px', verticalAlign: 'middle' }}>
                                        {!r.isPT && (
                                          <input type="number" min="0" max="100" step="0.1" placeholder="—"
                                            value={rs.tauxTva}
                                            onChange={(e) => setField(r.ingredientId, 'tauxTva', e.target.value)}
                                            style={{ width: 62, textAlign: 'right', padding: '5px 8px', borderRadius: 7, fontSize: '0.85rem' }}
                                            className="input"
                                            disabled={!canWrite}
                                          />
                                        )}
                                      </td>
                                      <td style={{ padding: '10px 14px', verticalAlign: 'middle', textAlign: 'center' }}>
                                        <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
                                          {canWrite && (
                                            <button title="Configurer seuil min" onClick={() => { setSeuilMinEdits((p) => ({ ...p, [r.ingredientId]: r.seuilMin != null ? String(r.seuilMin) : '' })); setSeuilModal({ ingredientId: r.ingredientId, nom: r.nom }); }}
                                              style={{ fontSize: '0.75rem', fontWeight: 700, padding: '3px 8px', borderRadius: 6, border: '1px solid #f97316', background: '#fff7ed', color: '#ea580c', cursor: 'pointer' }}>
                                              🔧 Seuil
                                            </button>
                                          )}
                                          {r.isPT && r.produitId && (
                                            <>
                                              <button className="btn btn-ghost btn-sm" title="Stock des articles relatifs" onClick={() => { fetchPtRecipe(r.produitId!); setPtStockModal({ produitId: r.produitId!, nom: r.nom }); }}>📊</button>
                                              {canWrite && (
                                                <button className="btn btn-ghost btn-sm" title="Portions personnalisées pour cette appro" onClick={() => setPortionsModal({ produitId: r.produitId!, nom: r.nom })}>⚙️</button>
                                              )}
                                            </>
                                          )}
                                          <button
                                            className="perte-btn"
                                            onClick={() => { setPerteModal({ ingredientId: r.ingredientId, nom: r.nom, quantite: r.quantite ?? null }); setPerteQty(''); setPerteType('avarie'); setPerteErrMsg(''); const d = todayStr(); setPerteDate(d); setPerteDateMin(null); setPerteDateMax(null); fetchPerteDateRange(r.ingredientId).then(() => fetchPertePrix(r.ingredientId, d)); }}
                                            title="Enregistrer une perte"
                                            disabled={!canWrite}
                                          >📉 Perte</button>
                                        </div>
                                      </td>
                                    </tr>

                                    {/* Appro history collapse */}
                                    {rs.historyOpen && (
                                      <tr>
                                        <td colSpan={7} style={{ background: 'var(--surface)', padding: '8px 16px' }}>
                                          {rs.history.length === 0 ? (
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('client.stock.no_history')}</span>
                                          ) : (
                                            <table style={{ fontSize: '0.8rem', width: '100%' }}>
                                              <thead>
                                                <tr>
                                                  <th style={{ textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, paddingBottom: 4 }}>{t('client.stock.date_appro')}</th>
                                                  <th style={{ textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, paddingBottom: 4 }}>Type</th>
                                                  <th style={{ textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600, paddingBottom: 4 }}>{t('client.stock.quantity')}</th>
                                                  <th style={{ textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600, paddingBottom: 4 }}>Prix HT</th>
                                                  <th style={{ textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600, paddingBottom: 4 }}>TVA%</th>
                                                  <th style={{ textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600, paddingBottom: 4 }}>Prix TTC</th>
                                                  <th style={{ textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, paddingBottom: 4 }}>Fournisseur</th>
                                                  <th style={{ textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, paddingBottom: 4 }}>Réf Facture</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {rs.history.slice(0, 5).map((h, i) => (
                                                  <tr key={i}>
                                                    <td style={{ color: 'var(--primary)', fontWeight: 600 }}>{fmtDate(h.dateAppro)}</td>
                                                    <td>
                                                      {h.typeAppro === 'manuel' && <span style={{ background: '#dcfce7', color: '#15803d', borderRadius: 5, padding: '1px 7px', fontSize: '0.7rem', fontWeight: 700 }}>Appro</span>}
                                                      {h.typeAppro === 'transfert' && <span style={{ background: '#e0f2fe', color: '#0369a1', borderRadius: 5, padding: '1px 7px', fontSize: '0.7rem', fontWeight: 700 }}>Transfert</span>}
                                                      {h.typeAppro && h.typeAppro !== 'manuel' && h.typeAppro !== 'transfert' && <span style={{ background: '#f3e8ff', color: '#7c3aed', borderRadius: 5, padding: '1px 7px', fontSize: '0.7rem', fontWeight: 700 }}>PT</span>}
                                                      {!h.typeAppro && '—'}
                                                    </td>
                                                    <td style={{ textAlign: 'right' }}>{h.quantite ?? '—'}</td>
                                                    <td style={{ textAlign: 'right' }}>{h.prixUnitaire !== null ? h.prixUnitaire.toFixed(3) : '—'}</td>
                                                    <td style={{ textAlign: 'right' }}>{(h as any).tauxTva != null ? `${(h as any).tauxTva}%` : '—'}</td>
                                                    <td style={{ textAlign: 'right' }}>{(h as any).prixUnitaireTva != null ? (h as any).prixUnitaireTva.toFixed(3) : '—'}</td>
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
          <div style={{
            background: 'var(--surface)', borderRadius: 14, padding: '16px 20px', marginBottom: 24,
            border: '1px solid var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
          }}>
            {/* Panel header */}
            <div style={{ width: '100%', marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#7e22ce' }}>Filtres</span>
              {(iFilterCat || iFilterIngId || iFilterNom) && (
                <button onClick={() => { setIFilterCat(''); setIFilterIngId(''); setIFilterNom(''); }} style={{ background: 'transparent', border: '1.5px solid var(--border)', borderRadius: 7, padding: '5px 9px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1, fontWeight: 700 }} title="Réinitialiser">✕</button>
              )}
            </div>
            {/* Section: Produit */}
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 16, height: 2, background: '#7e22ce', display: 'inline-block', borderRadius: 2 }} />
                Produit
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
                <div>
                  <label style={{ fontSize: '0.68rem', fontWeight: 800, color: '#7e22ce', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>🏷️ Catégorie</label>
                  <select style={{ padding: '9px 13px', borderRadius: 9, border: '1.5px solid #7e22ce', fontSize: '0.88rem', background: '#faf5ff', minWidth: 160 }} value={iFilterCat} onChange={(e) => { setIFilterCat(e.target.value); setIFilterIngId(''); }}>
                    <option value="">{t('client.catalogue_franchise.all_categories')}</option>
                    {allIngCats.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>🧂 Article</label>
                  <select style={{ padding: '9px 13px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: '0.88rem', background: 'var(--background)', minWidth: 160 }} value={iFilterIngId} disabled={!iFilterCat} onChange={(e) => setIFilterIngId(e.target.value)}>
                    <option value="">— Tous —</option>
                    {ingInCat.map((i) => <option key={i.ingredientId} value={String(i.ingredientId)}>{i.nom}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>🔍 Nom article</label>
                  <input type="text" style={{ padding: '9px 13px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: '0.88rem', background: 'var(--background)', minWidth: 160 }} placeholder="Rechercher…" value={iFilterNom} onChange={(e) => setIFilterNom(e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          {assignLoading ? (
            <p className="text-muted">{t('common.loading')}</p>
          ) : (assignments?.ingredients ?? []).length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">🧂</span>
              <p style={{ color: 'var(--text-muted)' }}>Aucun article assigné à ce labo.</p>
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
                                          disabled={isGerantLabo}
                                          onChange={() => !isGerantLabo && toggleAssignment(ing.ingredientId, act.id)}
                                          style={{ width: 18, height: 18, accentColor: 'var(--primary)', cursor: isGerantLabo ? 'not-allowed' : 'pointer' }}
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
        <div className="modal-overlay">
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ background: 'linear-gradient(135deg, #dc2626, #b91c1c)', borderBottom: 'none' }}>
              <h2 style={{ color: '#fff', margin: 0 }}>📉 Déclarer une perte — {perteModal.nom}</h2>
              <button className="modal-close" onClick={() => setPerteModal(null)} style={{ color: '#fff' }}>✕</button>
            </div>
            <div className="modal-body">
              {perteLoadingRange ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>…</p>
              ) : !perteDateMin ? (
                <>
                  <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '14px 16px', textAlign: 'center', marginBottom: 16 }}>
                    <p style={{ margin: 0, color: '#92400e', fontWeight: 600, fontSize: '0.9rem' }}>
                      Aucun approvisionnement enregistré pour cet article cette année.
                    </p>
                    <p style={{ margin: '6px 0 0', color: '#b45309', fontSize: '0.8rem' }}>
                      Enregistrez d'abord un appro avant de déclarer une perte.
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost" onClick={() => setPerteModal(null)}>Fermer</button>
                  </div>
                </>
              ) : (
                <>
                  {perteModal?.quantite !== null && perteModal?.quantite !== undefined && (
                    <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6, padding: '6px 12px', display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ fontSize: '0.8rem', color: '#14532d', fontWeight: 600 }}>Stock disponible</span>
                      <span style={{ fontWeight: 700, color: perteModal.quantite <= 0 ? '#dc2626' : perteModal.quantite < 5 ? '#d97706' : '#15803d' }}>
                        {perteModal.quantite.toFixed(3)}
                      </span>
                    </div>
                  )}
                  <label style={{ ...LABEL, display: 'block', marginBottom: 6 }}>Quantité perdue</label>
                  <input
                    className="input" type="number" min="0.001" step="0.001"
                    max={perteModal?.quantite ?? undefined}
                    style={{ width: '100%', fontSize: '0.9rem', marginBottom: 4 }}
                    value={perteQty} onChange={(e) => { setPerteQty(e.target.value); setPerteErrMsg(''); }}
                    placeholder="Ex: 2.5"
                    autoFocus
                  />
                  {perteModal?.quantite !== null && perteModal?.quantite !== undefined && perteQty && parseFloat(perteQty) > perteModal.quantite && (
                    <p style={{ color: '#dc2626', fontSize: '0.78rem', margin: '0 0 10px', fontWeight: 600 }}>
                      ⚠ Dépasse le stock disponible ({perteModal.quantite.toFixed(3)})
                    </p>
                  )}
                  {!perteQty || parseFloat(perteQty) <= (perteModal?.quantite ?? Infinity) ? <div style={{ marginBottom: 12 }} /> : null}
                  <label style={{ ...LABEL, display: 'block', marginBottom: 6 }}>Type de perte</label>
                  <select className="input" style={{ width: '100%', fontSize: '0.9rem', marginBottom: 16 }} value={perteType} onChange={(e) => setPerteType(e.target.value as 'avarie' | 'dechet')}>
                    <option value="avarie">Avarie</option>
                    <option value="dechet">Déchet</option>
                  </select>
                  <label style={{ ...LABEL, display: 'block', marginBottom: 6 }}>Date de perte</label>
                  <input className="input" type="date" style={{ width: '100%', fontSize: '0.9rem' }}
                    min={perteDateMin} max={todayStr()} value={perteDate}
                    onChange={(e) => { setPerteDate(e.target.value); if (perteModal) fetchPertePrix(perteModal.ingredientId, e.target.value); }} />
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 3, marginBottom: 12 }}>
                    Premier appro : {perteDateMin.split('-').reverse().join('/')}
                  </p>
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
                  {perteErrMsg && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', marginBottom: 10 }}>
                      <p style={{ color: '#dc2626', fontSize: '0.82rem', margin: 0, fontWeight: 600 }}>⚠ {perteErrMsg}</p>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost" onClick={() => setPerteModal(null)}>Annuler</button>
                    <button
                      className="btn btn-danger"
                      onClick={savePerte}
                      disabled={
                        !perteQty.trim() || parseFloat(perteQty) <= 0 || perteSaving ||
                        (perteModal?.quantite !== null && perteModal?.quantite !== undefined && parseFloat(perteQty) > perteModal.quantite)
                      }
                    >
                      {perteSaving ? '…' : 'Enregistrer la perte'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PT accumulation confirmation modal */}
      {ptConfirm && (
        <div className="modal-overlay">
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
          <div className="modal-overlay">
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
                          <th>Article</th>
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
