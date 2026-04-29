import React, { useEffect, useState, useCallback } from 'react';
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

const LABEL_STYLE: React.CSSProperties = {
  fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.05em',
};

interface LaboActivite { id: number; nom: string; type: string | null; franchiseGroup: string | null }

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

// ─── Shared filter bar ────────────────────────────────────────────────────────
function FilterBar({
  activites, fournisseurs, showFournisseur,
  stockRows,
  assignIngredients,
  filterActType, setFilterActType,
  filterGroupe, setFilterGroupe,
  filterActiviteId, setFilterActiviteId,
  filterCat, setFilterCat,
  filterIngId, setFilterIngId,
  filterNom, setFilterNom,
  filterFournisseur, setFilterFournisseur,
  filterRefFacture, setFilterRefFacture,
}: {
  activites: LaboActivite[];
  fournisseurs: Fournisseur[];
  showFournisseur: boolean;
  stockRows: LaboStockRow[];
  assignIngredients: AssignIngredient[];
  filterActType: string; setFilterActType: (v: string) => void;
  filterGroupe: string; setFilterGroupe: (v: string) => void;
  filterActiviteId: string; setFilterActiviteId: (v: string) => void;
  filterCat: string; setFilterCat: (v: string) => void;
  filterIngId: string; setFilterIngId: (v: string) => void;
  filterNom: string; setFilterNom: (v: string) => void;
  filterFournisseur: string; setFilterFournisseur: (v: string) => void;
  filterRefFacture: string; setFilterRefFacture: (v: string) => void;
}) {
  const typeActivites = filterActType ? activites.filter((a) => a.type === filterActType || (filterActType === 'distincte' && a.type !== 'franchise')) : activites;
  const franchiseGroups = Array.from(new Set(activites.filter((a) => a.type === 'franchise' && a.franchiseGroup).map((a) => a.franchiseGroup!))).sort();
  const filteredActivites = filterActType === 'franchise'
    ? (filterGroupe ? typeActivites.filter((a) => a.franchiseGroup === filterGroupe) : typeActivites)
    : typeActivites;

  // Ingredient IDs that are assigned to the filtered activités
  const filteredActIds = new Set(filteredActivites.map((a) => a.id));
  const filteredActIdSelected = filterActiviteId ? new Set([Number(filterActiviteId)]) : filteredActIds;

  // Categories/ingredients available after act filter
  const availableCats = Array.from(new Set(
    assignIngredients
      .filter((ing) => !filterActType || ing.activities.some((a) => filteredActIdSelected.has(a.activiteId) && a.assigned))
      .map((ing) => ing.categorie)
  )).sort();
  const availableIngs = assignIngredients.filter((ing) => {
    if (filterActType && !ing.activities.some((a) => filteredActIdSelected.has(a.activiteId) && a.assigned)) return false;
    if (filterCat && ing.categorie !== filterCat) return false;
    return true;
  });

  const hasAny = filterActType || filterGroupe || filterActiviteId || filterCat || filterIngId || filterNom || filterFournisseur || filterRefFacture;

  const reset = () => {
    setFilterActType(''); setFilterGroupe(''); setFilterActiviteId('');
    setFilterCat(''); setFilterIngId(''); setFilterNom('');
    setFilterFournisseur(''); setFilterRefFacture('');
  };

  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end', background: 'var(--surface)', borderRadius: 10, padding: '12px 14px', border: '1px solid var(--border)' }}>
      {/* Type activité */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={LABEL_STYLE}>Type Activité</span>
        <select className="input" style={{ maxWidth: 170 }} value={filterActType} onChange={(e) => {
          setFilterActType(e.target.value);
          setFilterGroupe(''); setFilterActiviteId(''); setFilterCat(''); setFilterIngId('');
        }}>
          <option value="">— Tous —</option>
          <option value="franchise">F - Franchise</option>
          <option value="distincte">D - Distinct</option>
        </select>
      </div>

      {filterActType && (
        <>
          {/* Groupe (franchise only) */}
          {filterActType === 'franchise' && franchiseGroups.length > 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={LABEL_STYLE}>Groupe</span>
              <select className="input" style={{ maxWidth: 180 }} value={filterGroupe} onChange={(e) => {
                setFilterGroupe(e.target.value); setFilterActiviteId(''); setFilterCat(''); setFilterIngId('');
              }}>
                <option value="">— Tous —</option>
                {franchiseGroups.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          )}

          {/* Activité */}
          {filteredActivites.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={LABEL_STYLE}>Activité</span>
              <select className="input" style={{ maxWidth: 200 }} value={filterActiviteId} onChange={(e) => {
                setFilterActiviteId(e.target.value); setFilterCat(''); setFilterIngId('');
              }}>
                <option value="">— Toutes —</option>
                {filteredActivites.map((a) => <option key={a.id} value={String(a.id)}>{a.nom}</option>)}
              </select>
            </div>
          )}

          {/* Catégorie */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={LABEL_STYLE}>Catégorie</span>
            <select className="input" style={{ maxWidth: 190 }} value={filterCat} onChange={(e) => {
              setFilterCat(e.target.value); setFilterIngId('');
            }}>
              <option value="">— Toutes —</option>
              {availableCats.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Ingrédient */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={LABEL_STYLE}>Ingrédient</span>
            <select className="input" style={{ maxWidth: 200 }} value={filterIngId} disabled={!filterCat} onChange={(e) => setFilterIngId(e.target.value)}>
              <option value="">— Tous —</option>
              {availableIngs.map((i) => <option key={i.ingredientId} value={String(i.ingredientId)}>{i.nom}</option>)}
            </select>
          </div>

          {/* Nom (text search) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={LABEL_STYLE}>Nom Ingrédient</span>
            <input type="text" className="input" style={{ maxWidth: 180 }} placeholder="Rechercher…" value={filterNom} onChange={(e) => setFilterNom(e.target.value)} />
          </div>

          {/* Fournisseur (stock tab only) */}
          {showFournisseur && fournisseurs.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={LABEL_STYLE}>Fournisseur</span>
              <select className="input" style={{ maxWidth: 200 }} value={filterFournisseur} onChange={(e) => setFilterFournisseur(e.target.value)}>
                <option value="">— Tous —</option>
                {fournisseurs.map((f) => <option key={f.id} value={String(f.id)}>{f.nom}</option>)}
              </select>
            </div>
          )}

          {/* Réf Facture (stock tab only) */}
          {showFournisseur && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={LABEL_STYLE}>Réf Facture</span>
              <input type="text" className="input" style={{ maxWidth: 160 }} placeholder="N° facture…" value={filterRefFacture} onChange={(e) => setFilterRefFacture(e.target.value)} />
            </div>
          )}
        </>
      )}

      {hasAny && (
        <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-end' }} onClick={reset}>✕ Effacer</button>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function StockLaboPage() {
  const { t } = useTranslation();
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

  // Assignment data (ingredients + activités with type info)
  const [assignments, setAssignments] = useState<{ activites: LaboActivite[]; ingredients: AssignIngredient[] } | null>(null);
  const [assignLoading, setAssignLoading] = useState(true);

  // Collapsible categories in main stock view
  const [openStockCats, setOpenStockCats] = useState<Set<string>>(new Set());
  const [openIngCats, setOpenIngCats] = useState<Set<string>>(new Set());

  // Pagination
  const [stockCatPage, setStockCatPage] = useState(1);
  const STOCK_CAT_PAGE_SIZE = 10;
  const [ingCatPage, setIngCatPage] = useState(1);
  const ING_CAT_PAGE_SIZE = 10;

  // ── Stock tab filters
  const [sFilterActType, setSFilterActType] = useState('');
  const [sFilterGroupe, setSFilterGroupe] = useState('');
  const [sFilterActiviteId, setSFilterActiviteId] = useState('');
  const [sFilterCat, setSFilterCat] = useState('');
  const [sFilterIngId, setSFilterIngId] = useState('');
  const [sFilterNom, setSFilterNom] = useState('');
  const [sFilterFournisseur, setSFilterFournisseur] = useState('');
  const [sFilterRefFacture, setSFilterRefFacture] = useState('');

  // ── Ingredients tab filters
  const [iFilterActType, setIFilterActType] = useState('');
  const [iFilterGroupe, setIFilterGroupe] = useState('');
  const [iFilterActiviteId, setIFilterActiviteId] = useState('');
  const [iFilterCat, setIFilterCat] = useState('');
  const [iFilterIngId, setIFilterIngId] = useState('');
  const [iFilterNom, setIFilterNom] = useState('');

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
          historyOpen: false, history: [],
        },
      }));
      setTimeout(() => setField(ingredientId, 'saved', false), 2000);
      // refresh stock so lastFournisseurId/lastRefFacture update
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

  const activites: LaboActivite[] = assignments?.activites ?? [];

  // ── Stock tab: apply filters ────────────────────────────────────────────────
  // Build map: ingredientId → Set of assigned activité IDs
  const ingActMap = new Map<number, Set<number>>();
  for (const ing of assignments?.ingredients ?? []) {
    const assignedIds = new Set(ing.activities.filter((a) => a.assigned).map((a) => a.activiteId));
    ingActMap.set(ing.ingredientId, assignedIds);
  }

  const getFilteredActIds = (actType: string, groupe: string, activiteId: string): Set<number> | null => {
    if (!actType) return null; // no filter
    let acts = activites.filter((a) => a.type === actType || (actType === 'distincte' && a.type !== 'franchise'));
    if (actType === 'franchise' && groupe) acts = acts.filter((a) => a.franchiseGroup === groupe);
    if (activiteId) acts = acts.filter((a) => String(a.id) === activiteId);
    return new Set(acts.map((a) => a.id));
  };

  const stockFilteredActIds = getFilteredActIds(sFilterActType, sFilterGroupe, sFilterActiviteId);

  const filteredStock = stock.filter((r) => {
    if (stockFilteredActIds !== null) {
      const ingActs = ingActMap.get(r.ingredientId) ?? new Set();
      const hasMatch = [...ingActs].some((id) => stockFilteredActIds.has(id));
      if (!hasMatch) return false;
    }
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

  // ── Ingredients tab: apply filters ─────────────────────────────────────────
  const ingFilteredActIds = getFilteredActIds(iFilterActType, iFilterGroupe, iFilterActiviteId);

  const filteredIngredients = (assignments?.ingredients ?? []).filter((ing) => {
    if (ingFilteredActIds !== null) {
      const hasMatch = ing.activities.some((a) => ingFilteredActIds.has(a.activiteId) && a.assigned);
      if (!hasMatch) return false;
    }
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

  if (!laboId) return <div className="page"><p className="text-muted">Labo introuvable.</p></div>;

  // ── Tab nav ─────────────────────────────────────────────────────────────────
  const tabNav = (
    <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid var(--border)' }}>
      <Link
        to={`/client/labo/stock?laboId=${laboId}`}
        style={{
          padding: '8px 18px', fontWeight: 600, fontSize: '0.88rem',
          borderBottom: tab === 'stock' ? '2px solid var(--primary)' : '2px solid transparent',
          color: tab === 'stock' ? 'var(--primary)' : 'var(--text-muted)',
          textDecoration: 'none', marginBottom: -2,
        }}
      >
        📦 Stock {labo?.nom ?? ''}
      </Link>
      <Link
        to={`/client/labo/stock?laboId=${laboId}&tab=ingredients`}
        style={{
          padding: '8px 18px', fontWeight: 600, fontSize: '0.88rem',
          borderBottom: tab === 'ingredients' ? '2px solid var(--primary)' : '2px solid transparent',
          color: tab === 'ingredients' ? 'var(--primary)' : 'var(--text-muted)',
          textDecoration: 'none', marginBottom: -2,
        }}
      >
        🧂 Ingrédients Stock
      </Link>
    </div>
  );

  return (
    <div className="page">
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

      {tabNav}

      {/* ══ STOCK TAB ══ */}
      {tab === 'stock' && (
        <>
          <FilterBar
            activites={activites}
            fournisseurs={fournisseurs}
            showFournisseur={true}
            stockRows={stock}
            assignIngredients={assignments?.ingredients ?? []}
            filterActType={sFilterActType} setFilterActType={setSFilterActType}
            filterGroupe={sFilterGroupe} setFilterGroupe={setSFilterGroupe}
            filterActiviteId={sFilterActiviteId} setFilterActiviteId={setSFilterActiviteId}
            filterCat={sFilterCat} setFilterCat={setSFilterCat}
            filterIngId={sFilterIngId} setFilterIngId={setSFilterIngId}
            filterNom={sFilterNom} setFilterNom={setSFilterNom}
            filterFournisseur={sFilterFournisseur} setFilterFournisseur={setSFilterFournisseur}
            filterRefFacture={sFilterRefFacture} setFilterRefFacture={setSFilterRefFacture}
          />

          {loading ? (
            <p className="text-muted">{t('common.loading')}</p>
          ) : stock.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">🏭</span>
              <p>{t('client.labo.empty_stock')}</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('client.labo.use_catalogue_global', 'Assignez des ingrédients via le Catalogue Global.')}</p>
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
                                  <React.Fragment key={r.ingredientId}>
                                    <tr>
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
                                        {r.totalTransfere > 0 ? <span style={{ color: '#7c3aed', fontWeight: 600 }}>↗ {r.totalTransfere.toFixed(3)}</span> : '—'}
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
                                        <input type="date" className="input" style={{ maxWidth: 138, ...warnStyle }} min={yearStart} max={yearEnd} value={rs.dateAppro} onChange={(e) => setDateApproField(r.ingredientId, e.target.value)} />
                                      </td>
                                      <td>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'stretch' }}>
                                          {fournisseurs.length > 0 && (() => {
                                            const assignedF = rs.fournisseurId ? fournisseurs.find((f) => String(f.id) === rs.fournisseurId) : null;
                                            const validated = !!assignedF && rs.refFacture.trim() !== '';
                                            return (
                                              <button
                                                className="btn btn-sm"
                                                onClick={() => setFournisseurModal({ ingredientId: r.ingredientId, nom: r.nom })}
                                                style={{
                                                  width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
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
                                          <div style={{ display: 'flex', gap: 4 }}>
                                            <button
                                              className={`btn btn-sm ${rs.saved ? 'btn-success' : 'btn-primary'}`}
                                              onClick={() => saveRow(r.ingredientId)}
                                              disabled={!canSaveRow(rs)}
                                              style={{ flex: 1 }}
                                            >
                                              {rs.saving ? '…' : rs.saved ? '✓' : t('common.save')}
                                            </button>
                                            <button className="btn btn-ghost btn-sm" onClick={() => toggleHistory(r.ingredientId)} title={t('client.stock.history')}>
                                              {rs.historyOpen ? '▲' : '▼'}
                                            </button>
                                          </div>
                                        </div>
                                      </td>
                                    </tr>
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
          <FilterBar
            activites={activites}
            fournisseurs={fournisseurs}
            showFournisseur={false}
            stockRows={stock}
            assignIngredients={assignments?.ingredients ?? []}
            filterActType={iFilterActType} setFilterActType={setIFilterActType}
            filterGroupe={iFilterGroupe} setFilterGroupe={setIFilterGroupe}
            filterActiviteId={iFilterActiviteId} setFilterActiviteId={setIFilterActiviteId}
            filterCat={iFilterCat} setFilterCat={setIFilterCat}
            filterIngId={iFilterIngId} setFilterIngId={setIFilterIngId}
            filterNom={iFilterNom} setFilterNom={setIFilterNom}
            filterFournisseur="" setFilterFournisseur={() => {}}
            filterRefFacture="" setFilterRefFacture={() => {}}
          />

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
              <p>Aucune activité liée à ce labo. Configurez les activités dans les paramètres de l'entreprise.</p>
            </div>
          ) : (() => {
            // Filter activites to show in columns based on filters
            const colActivites = (() => {
              if (!iFilterActType) return activites;
              let acts = activites.filter((a) => a.type === iFilterActType || (iFilterActType === 'distincte' && a.type !== 'franchise'));
              if (iFilterActType === 'franchise' && iFilterGroupe) acts = acts.filter((a) => a.franchiseGroup === iFilterGroupe);
              if (iFilterActiviteId) acts = acts.filter((a) => String(a.id) === iFilterActiviteId);
              return acts;
            })();

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
                                {colActivites.map((act) => (
                                  <th key={act.id} style={{ textAlign: 'center', minWidth: 110, color: 'var(--primary)' }}>
                                    <div>{act.nom}</div>
                                    {act.type && <div style={{ fontSize: '0.65rem', fontWeight: 400, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{act.type === 'franchise' ? 'F' : 'D'}{act.franchiseGroup ? ` · ${act.franchiseGroup}` : ''}</div>}
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
                                  {colActivites.map((act) => {
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

      {/* Fournisseur modal */}
      {fournisseurModal && (
        <div className="modal-overlay" onClick={() => setFournisseurModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header modal-header--primary">
              <h2>Fournisseur — {fournisseurModal.nom}</h2>
              <button className="modal-close" onClick={() => setFournisseurModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <label style={{ ...LABEL_STYLE, display: 'block', marginBottom: 6 }}>Fournisseur</label>
              <select className="input" style={{ width: '100%', fontSize: '0.9rem', marginBottom: 16 }} value={rowState[fournisseurModal.ingredientId]?.fournisseurId ?? ''} onChange={(e) => setField(fournisseurModal.ingredientId, 'fournisseurId', e.target.value)}>
                <option value="">— Aucun fournisseur —</option>
                {fournisseurs.map((f) => <option key={f.id} value={String(f.id)}>{f.nom}</option>)}
              </select>
              <label style={{ ...LABEL_STYLE, display: 'block', marginBottom: 6 }}>Réf. Facture / BL</label>
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
