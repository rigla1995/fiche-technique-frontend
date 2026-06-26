import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import api from '../../api/client';
import HelpButton from '../common/HelpButton';
import HistoryFilterBar, { FilterField, FilterInput, FilterSelect } from '../common/HistoryFilterBar';
import { useAuth } from '../../context/AuthContext';

const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtDate = (iso: string | null | undefined) => {
  if (!iso || iso.length < 10) return iso ?? '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

interface RecentInv { id: string; qty: number; date: string }
interface InventaireRow {
  ingredientId: number;
  produitId?: number;
  isPT?: boolean;
  nom: string;
  unite: string;
  categorie: string;
  seuilMin: number | null;
  totalStock: number | null;
  recentInventaires: RecentInv[];
  inventaireDates: string[];
}
interface Activite { id: number; nom: string }

export default function InventairePage() {
  const { canWrite } = useAuth();
  // Multi-affectations : sélecteur d'activité affiché (périmètre filtré côté backend).
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const laboId = searchParams.get('laboId');
  const activiteId = searchParams.get('activiteId');
  const section = searchParams.get('section');

  const [allLabos, setAllLabos] = useState<{ id: number; nom: string }[]>([]);
  const [rows, setRows] = useState<InventaireRow[]>([]);
  const [qtys, setQtys] = useState<Record<number, string>>({});
  const [date, setDate] = useState(todayStr());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [contextNom, setContextNom] = useState('');

  const [activites, setActivites] = useState<Activite[]>([]);
  const [selectedActiviteId, setSelectedActiviteId] = useState<number | null>(null);
  const effectiveActiviteId = activiteId ? Number(activiteId) : selectedActiviteId;

  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());
  const [openHistory, setOpenHistory] = useState<Set<number>>(new Set());
  const [filterCategory, setFilterCategory] = useState('');
  const [filterIngredient, setFilterIngredient] = useState('');

  interface ConfirmEntry { ingredientId: number; nom: string; qty: number; isReplacement: boolean; oldQty: number | null }
  const [confirmPopup, setConfirmPopup] = useState<{ entries: ConfirmEntry[] } | null>(null);

  useEffect(() => {
    api.get('/api/labo').then(({ data }) => {
      const labs = data as { id: number; nom: string }[];
      setAllLabos(labs);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!section) return;
    api.get('/api/entreprise/activites')
      .then(({ data }) => {
        const acts = data as Activite[];
        setActivites(acts);
        if (acts.length >= 1) setSelectedActiviteId(acts[0].id);
      })
      .catch(() => {});
  }, [section]);

  const isLaboMode = !!laboId;
  const themeColor = isLaboMode ? '#7e22ce' : '#1e40af';
  const themeDark = isLaboMode ? '#3b0764' : '#1e3a8a';
  const themeLight = isLaboMode ? '#faf5ff' : '#eff6ff';
  const themeBorder = isLaboMode ? '#7e22ce' : '#93c5fd';
  const heroGradient = isLaboMode
    ? 'linear-gradient(135deg, #3b0764 0%, #7e22ce 55%, #a855f7 100%)'
    : 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 55%, #3b82f6 100%)';
  const heroShadow = isLaboMode ? '0 8px 32px rgba(126,34,206,0.28)' : '0 8px 32px rgba(30,64,175,0.28)';

  const loadStock = useCallback(async () => {
    if (!laboId && !effectiveActiviteId) return;
    setLoading(true);
    setErrorMsg('');
    try {
      let url = '';
      if (laboId) {
        url = `/api/labo/${laboId}/inventaire`;
        const laboRes = await api.get(`/api/labo/${laboId}`);
        setContextNom(laboRes.data?.nom || 'Labo');
      } else {
        url = `/api/stock/entreprise/${effectiveActiviteId}/inventaire`;
        const act = activites.find((a) => a.id === effectiveActiviteId);
        if (act) setContextNom(act.nom);
      }
      const { data } = await api.get(url);
      setRows(data);
      const initQtys: Record<number, string> = {};
      for (const r of data as InventaireRow[]) {
        initQtys[r.ingredientId] = '';
      }
      setQtys(initQtys);
      setOpenCategories(new Set());
    } catch { setErrorMsg('Erreur lors du chargement.'); }
    setLoading(false);
  }, [laboId, effectiveActiviteId, activites]);

  useEffect(() => { loadStock(); }, [loadStock]);

  const isAlarm = (r: InventaireRow) => r.inventaireDates.includes(date);

  const categories = useMemo(() => [...new Set(rows.map((r) => r.categorie))], [rows]);

  const ingredientsInCat = useMemo(() =>
    filterCategory ? rows.filter((r) => r.categorie === filterCategory) : [],
    [rows, filterCategory]
  );

  const filteredRows = useMemo(() => rows.filter((r) => {
    if (filterCategory && r.categorie !== filterCategory) return false;
    if (filterIngredient && String(r.ingredientId) !== filterIngredient) return false;
    return true;
  }), [rows, filterCategory, filterIngredient]);

  const filteredCategories = useMemo(() =>
    [...new Set(filteredRows.map((r) => r.categorie))],
    [filteredRows]
  );

  const toggleCategory = (cat: string) => setOpenCategories((prev) => {
    const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n;
  });
  const toggleHistory = (id: number) => setOpenHistory((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const handleSave = () => {
    const entries = rows
      .filter((r) => qtys[r.ingredientId] !== '' && parseFloat(qtys[r.ingredientId] || '0') >= 0)
      .map((r) => {
        const isReplacement = r.inventaireDates.includes(date);
        const oldQty = isReplacement
          ? (r.recentInventaires.find((inv) => inv.date === date)?.qty ?? null)
          : null;
        return { ingredientId: r.ingredientId, nom: r.nom, qty: parseFloat(qtys[r.ingredientId]), isReplacement, oldQty };
      });
    if (entries.length === 0) { setErrorMsg('Aucune quantité saisie.'); return; }
    setErrorMsg('');
    setConfirmPopup({ entries });
  };

  const handleConfirmSave = async () => {
    if (!confirmPopup) return;
    setSaving(true);
    setConfirmPopup(null);
    try {
      const entries = confirmPopup.entries.map((e) => ({
        ingredientId: e.ingredientId,
        quantiteReelle: e.qty,
        note: null,
      }));
      const url = laboId
        ? `/api/labo/${laboId}/inventaire`
        : `/api/stock/entreprise/${effectiveActiviteId}/inventaire`;
      await api.post(url, { dateInventaire: date, entries });
      setSuccessMsg('Inventaire enregistré avec succès.');
      setTimeout(() => setSuccessMsg(''), 4000);
      loadStock();
    } catch { setErrorMsg('Erreur lors de la sauvegarde.'); }
    setSaving(false);
  };

  const filledCount = rows.filter((r) => qtys[r.ingredientId] !== '').length;
  const alarmTotal = rows.filter((r) => isAlarm(r)).length;
  const hasAnyQty = filledCount > 0;
  const [invPreviewMinimized, setInvPreviewMinimized] = useState(false);

  const invPreviewLines = rows
    .filter((r) => qtys[r.ingredientId] !== '' && parseFloat(qtys[r.ingredientId] || '0') >= 0)
    .map((r) => ({ nom: r.nom, unite: r.unite, qty: parseFloat(qtys[r.ingredientId] || '0'), stock: r.totalStock }));

  const resetFilters = () => { setFilterCategory(''); setFilterIngredient(''); };

  return (
    <div className="page">

      {/* ── Hero header ── */}
      <div style={{
        background: heroGradient,
        borderRadius: 18, padding: '24px 28px', marginBottom: 16,
        boxShadow: heroShadow,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem', lineHeight: 1 }}>🔢</div>
            <div>
              <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>
                Inventaire{contextNom ? ` — ${contextNom}` : ''}
              <HelpButton section="inventaire" variant="solid" size={18} tip="Aide" /></h1>
              <p style={{ color: 'rgba(255,255,255,0.72)', fontSize: '0.82rem', margin: '4px 0 0' }}>
                Saisissez les quantités réelles pour mettre à jour les stocks
              </p>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {isLaboMode && laboId ? (
            <Link to={`/client/labo/inventaire/historique?laboId=${laboId}`}
              style={{ background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)', border: '1.5px solid rgba(255,255,255,0.4)', borderRadius: 10, padding: '8px 18px', color: '#fff', fontWeight: 700, fontSize: '0.85rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              📋 Historique Inventaires
            </Link>
          ) : rows.length > 0 ? (
            <div style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', borderRadius: 12, padding: '10px 18px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', lineHeight: 1 }}>{rows.length}</div>
              <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Ingrédients</div>
            </div>
          ) : null}
          {alarmTotal > 0 && (
            <div style={{ background: 'rgba(245,158,11,0.25)', backdropFilter: 'blur(8px)', border: '1px solid rgba(245,158,11,0.5)', borderRadius: 12, padding: '10px 18px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fbbf24', lineHeight: 1 }}>{alarmTotal}</div>
              <div style={{ fontSize: '0.7rem', color: '#fcd34d', textTransform: 'uppercase', letterSpacing: '0.06em' }}>⚠ Date existante</div>
            </div>
          )}
          {filledCount > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 12, padding: '10px 18px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', lineHeight: 1 }}>{filledCount}</div>
              <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Saisis</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Labo selector ── */}
      {isLaboMode && allLabos.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, padding: '10px 14px', background: 'var(--card-bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
          {allLabos.map((l) => (
            <button key={l.id} onClick={() => navigate(`/client/labo/inventaire?laboId=${l.id}`)}
              style={{ padding: '4px 14px', borderRadius: 20, cursor: 'pointer', fontSize: '0.82rem', border: laboId === String(l.id) ? '1.5px solid #7e22ce' : '1.5px solid var(--border)', background: laboId === String(l.id) ? '#7e22ce' : 'var(--bg)', color: laboId === String(l.id) ? '#fff' : 'var(--text)', fontWeight: laboId === String(l.id) ? 700 : 400 }}>
              🏭 {l.nom}
            </button>
          ))}
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', alignSelf: 'center', marginLeft: 4 }}>← sélectionner le labo</span>
        </div>
      )}

      {/* ── Activite selector ── */}
      {section && !activiteId && activites.length >= 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, padding: '10px 14px', background: 'var(--card-bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
          {activites.map((a) => (
            <button key={a.id} onClick={() => setSelectedActiviteId(a.id)}
              style={{ padding: '4px 14px', borderRadius: 20, cursor: 'pointer', fontSize: '0.82rem', border: selectedActiviteId === a.id ? '1.5px solid #1e40af' : '1.5px solid var(--border)', background: selectedActiviteId === a.id ? '#1e40af' : 'var(--bg)', color: selectedActiviteId === a.id ? '#fff' : 'var(--text)', fontWeight: selectedActiviteId === a.id ? 700 : 400 }}>
              🏪 {a.nom}
            </button>
          ))}
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', alignSelf: 'center', marginLeft: 4 }}>← sélectionner l'activité</span>
        </div>
      )}

      <>
        {/* Barre de filtres (composant partagé) — filtres + date d'inventaire + Enregistrer */}
          <HistoryFilterBar
            accent={themeColor} accentDark={themeDark}
            onReset={resetFilters} showReset={!!(filterCategory || filterIngredient)}
            actions={
              <button onClick={handleSave} disabled={saving || !hasAnyQty || !canWrite} style={{
                height: 36, background: hasAnyQty && canWrite ? `linear-gradient(135deg, ${themeDark} 0%, ${themeColor} 100%)` : '#e5e7eb',
                borderRadius: 8, border: 'none', color: hasAnyQty && canWrite ? '#fff' : '#9ca3af',
                fontWeight: 800, padding: '0 22px', cursor: hasAnyQty && canWrite ? 'pointer' : 'not-allowed',
                opacity: saving ? 0.7 : 1, fontSize: '0.88rem', whiteSpace: 'nowrap',
              }}>
                {saving ? 'Enregistrement...' : `Enregistrer${filledCount > 0 ? ` (${filledCount})` : ''}`}
              </button>
            }
          >
            <FilterField label="🏷️ Catégorie">
              <FilterSelect value={filterCategory} onChange={(e) => { setFilterCategory(e.target.value); setFilterIngredient(''); }}>
                <option value="">— Toutes —</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </FilterSelect>
            </FilterField>
            <FilterField label="🧂 Ingrédient">
              <FilterSelect value={filterIngredient} disabled={!filterCategory} onChange={(e) => setFilterIngredient(e.target.value)}>
                <option value="">— Tous —</option>
                {ingredientsInCat.map((r) => <option key={r.ingredientId} value={String(r.ingredientId)}>{r.nom}</option>)}
              </FilterSelect>
            </FilterField>
            <FilterField label="📅 Date inventaire">
              <FilterInput type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} />
            </FilterField>
          </HistoryFilterBar>

          {/* ── Messages ── */}
          {errorMsg && (
            <div style={{ background: 'linear-gradient(90deg, #fef2f2, #fff)', border: '1.5px solid #fca5a5', borderRadius: 10, padding: '11px 16px', marginBottom: 14, fontSize: '0.85rem', color: '#991b1b', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🚫</span> {errorMsg}
            </div>
          )}
          {successMsg && (
            <div style={{ background: `linear-gradient(90deg, ${themeLight}, #fff)`, border: `1.5px solid ${themeBorder}`, borderRadius: 10, padding: '11px 16px', marginBottom: 14, fontSize: '0.85rem', color: themeColor, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>✅</span> {successMsg}
            </div>
          )}

          {/* ── Table inventaire ── */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <div style={{ fontSize: '2rem', marginBottom: 12 }}>⚙️</div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Chargement des ingrédients...</p>
            </div>
          ) : filteredRows.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', background: 'var(--surface)', borderRadius: 14, border: '1px dashed var(--border)' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>📦</div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 500 }}>Aucun ingrédient trouvé.</p>
            </div>
          ) : (
            <div style={{ background: 'var(--surface)', borderRadius: 14, overflow: 'hidden', border: '1.5px solid var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: isLaboMode ? 'linear-gradient(90deg, #faf5ff, #ede9fe)' : 'linear-gradient(90deg, #eff6ff, #dbeafe)', borderBottom: `2px solid ${themeBorder}` }}>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.68rem', fontWeight: 800, color: themeColor, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Ingrédient</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '0.68rem', fontWeight: 800, color: themeColor, textTransform: 'uppercase', letterSpacing: '0.07em', width: 120 }}>Stock actuel</th>
                    <th style={{ padding: '10px 16px', textAlign: 'center', fontSize: '0.68rem', fontWeight: 800, color: themeColor, textTransform: 'uppercase', letterSpacing: '0.07em', width: 160 }}>Qté réelle</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCategories.map((cat) => {
                    const catRows = filteredRows.filter((r) => r.categorie === cat);
                    const isOpen = openCategories.has(cat);
                    const filledInCat = catRows.filter((r) => qtys[r.ingredientId] !== '').length;
                    const alarmInCat = catRows.filter((r) => isAlarm(r)).length;
                    return (
                      <>
                        {/* Collapsible category header row */}
                        <tr key={`cat-${cat}`} onClick={() => toggleCategory(cat)} style={{ cursor: 'pointer', background: isOpen ? (isLaboMode ? 'linear-gradient(90deg, #faf5ff, #ede9fe)' : 'linear-gradient(90deg, #eff6ff, #dbeafe)') : '#f8fafc', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
                          <td colSpan={3} style={{ padding: '9px 16px' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: themeColor, textTransform: 'uppercase', letterSpacing: '0.07em', marginRight: 6 }}>
                              {isOpen ? '▼' : '▶'}
                            </span>
                            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: themeColor, textTransform: 'uppercase', letterSpacing: '0.07em' }}>🏷 {cat}</span>
                            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 500, marginLeft: 8 }}>
                              {catRows.length} ingrédient{catRows.length > 1 ? 's' : ''}
                              {filledInCat > 0 && <span style={{ color: themeColor, fontWeight: 700 }}> · {filledInCat} saisi{filledInCat > 1 ? 's' : ''}</span>}
                              {alarmInCat > 0 && <span style={{ color: '#d97706', fontWeight: 700 }}> · ⚠ {alarmInCat}</span>}
                            </span>
                          </td>
                        </tr>
                        {/* Ingredient rows (only when open) */}
                        {isOpen && catRows.map((r, idx) => {
                          const alarm = isAlarm(r);
                          const filled = qtys[r.ingredientId] !== '';
                          const histOpen = openHistory.has(r.ingredientId);
                          return (
                            <>
                              <tr key={r.ingredientId} style={{
                                background: alarm
                                  ? 'linear-gradient(90deg, #fffbeb 0%, #fffdf7 100%)'
                                  : filled
                                  ? `linear-gradient(90deg, ${themeLight} 0%, #fff 80%)`
                                  : idx % 2 === 0 ? 'var(--background)' : 'var(--surface)',
                                borderBottom: histOpen ? 'none' : '1px solid var(--border)',
                                borderLeft: `4px solid ${alarm ? '#f59e0b' : filled ? themeColor : 'transparent'}`,
                                transition: 'background 0.1s',
                              }}>
                                {/* Ingredient + history link */}
                                <td style={{ padding: '11px 16px' }}>
                                  <div style={{ fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 6, color: alarm ? '#92400e' : 'var(--text)' }}>
                                    {alarm && <span style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 5, padding: '1px 5px', fontSize: '0.67rem', fontWeight: 800, color: '#d97706' }}>⚠ DATE</span>}
                                    {r.isPT && <span style={{ background: '#ede9fe', border: '1px solid #a78bfa', borderRadius: 5, padding: '1px 5px', fontSize: '0.67rem', fontWeight: 800, color: '#7c3aed' }}>PT</span>}
                                    {r.nom}
                                  </div>
                                  <div style={{ fontSize: '0.71rem', marginTop: 4, display: 'flex', gap: 7, alignItems: 'center' }}>
                                    <span style={{ background: isLaboMode ? '#ede9fe' : '#dbeafe', color: themeColor, borderRadius: 5, padding: '1px 6px', fontWeight: 700, fontSize: '0.67rem' }}>{r.unite}</span>
                                    <button onClick={(e) => { e.stopPropagation(); toggleHistory(r.ingredientId); }} style={{ fontSize: '0.7rem', color: histOpen ? themeColor : 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600, textDecoration: histOpen ? 'none' : 'underline', textDecorationStyle: 'dotted' }}>
                                      📋 {histOpen ? 'masquer' : '5 derniers inv.'}
                                    </button>
                                  </div>
                                </td>
                                {/* Stock */}
                                <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                                  <div style={{
                                    padding: '5px 10px', borderRadius: 8, fontSize: '0.88rem', fontWeight: 800, textAlign: 'right', display: 'inline-block', minWidth: 80,
                                    background: r.totalStock !== null && r.totalStock > 0 ? themeLight : '#f8fafc',
                                    border: r.totalStock !== null && r.totalStock > 0 ? `1.5px solid ${themeBorder}` : '1.5px solid #e2e8f0',
                                    color: r.totalStock !== null && r.totalStock > 0 ? themeColor : '#9ca3af',
                                  }}>
                                    {r.totalStock !== null ? r.totalStock.toFixed(3) : '—'}
                                  </div>
                                </td>
                                {/* Qty input */}
                                <td style={{ padding: '11px 16px' }}>
                                  <input
                                    type="number" min="0" step="0.001"
                                    value={qtys[r.ingredientId] ?? ''}
                                    onChange={(e) => setQtys((prev) => ({ ...prev, [r.ingredientId]: e.target.value }))}
                                    placeholder="0.000"
                                    style={{
                                      width: '100%', padding: '7px 11px', borderRadius: 8, fontSize: '0.9rem',
                                      border: alarm ? '2px solid #f59e0b' : filled ? `2px solid ${themeColor}` : '1.5px solid var(--border)',
                                      background: alarm ? '#fffbeb' : filled ? themeLight : 'var(--background)',
                                      boxShadow: alarm ? '0 0 0 3px #fef3c7' : filled ? `0 0 0 3px ${isLaboMode ? '#ede9fe' : '#dbeafe'}` : 'none',
                                      outline: 'none', transition: 'all 0.15s', fontWeight: 700,
                                    }}
                                  />
                                </td>
                              </tr>
                              {/* History row */}
                              {histOpen && (
                                <tr key={`${r.ingredientId}-hist`}>
                                  <td colSpan={3} style={{ padding: '0 16px 12px 32px', background: '#f8fafc', borderBottom: '1px solid var(--border)' }}>
                                    {r.recentInventaires.length === 0 ? (
                                      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic', margin: '8px 0' }}>Aucun inventaire enregistré</p>
                                    ) : (
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingTop: 10 }}>
                                        {r.recentInventaires.map((inv) => {
                                          const isCurrent = inv.date === date;
                                          return (
                                            <div key={inv.id} style={{
                                              padding: '5px 12px', borderRadius: 18,
                                              background: isCurrent ? '#fef3c7' : '#fff',
                                              border: isCurrent ? '1.5px solid #f59e0b' : '1px solid #e2e8f0',
                                              fontSize: '0.79rem', fontWeight: 600,
                                              color: isCurrent ? '#92400e' : 'var(--text)',
                                            }}>
                                              {isCurrent && <span style={{ marginRight: 4 }}>⚠</span>}
                                              {fmtDate(inv.date)} — <strong>{inv.qty.toFixed(3)}</strong> {r.unite}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              )}
                            </>
                          );
                        })}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
      </>

      {/* ── Confirmation popup ── */}
      {confirmPopup && (() => {
        const replacements = confirmPopup.entries.filter((e) => e.isReplacement);
        const newEntries = confirmPopup.entries.filter((e) => !e.isReplacement);
        const hasReplacements = replacements.length > 0;
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', borderRadius: 20, padding: 0, maxWidth: 530, width: '92%', overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.45)' }}>
              <div style={{
                background: hasReplacements
                  ? 'linear-gradient(135deg, #991b1b 0%, #dc2626 60%, #ef4444 100%)'
                  : 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 60%, #3b82f6 100%)',
                padding: '22px 28px',
              }}>
                <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#fff', letterSpacing: '-0.01em' }}>
                  {hasReplacements ? '🚨 Remplacement détecté' : '📋 Confirmer l\'inventaire'}
                </div>
                <div style={{ fontSize: '0.84rem', color: 'rgba(255,255,255,0.82)', marginTop: 5 }}>
                  Date : <strong>{fmtDate(date)}</strong> · {confirmPopup.entries.length} ingrédient(s)
                  {hasReplacements && <> · <strong style={{ color: '#fca5a5' }}>{replacements.length} remplacement(s)</strong></>}
                </div>
              </div>
              <div style={{ padding: '22px 28px' }}>
                <div style={{ background: '#fef3c7', border: '1.5px solid #fde68a', borderRadius: 11, padding: '12px 16px', marginBottom: 18, fontSize: '0.84rem', color: '#92400e', lineHeight: 1.6 }}>
                  ⚠️ <strong>Important :</strong> Cet inventaire <strong>ne peut pas être supprimé</strong>, seulement modifié. Il recalcule le stock à partir du <strong>{fmtDate(date)}</strong>.
                </div>

                {hasReplacements && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: '0.67rem', fontWeight: 800, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 7 }}>🔄 Valeurs remplacées</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {replacements.map((e) => (
                        <div key={e.ingredientId} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '10px 14px', borderRadius: 9,
                          background: 'linear-gradient(90deg, #fef2f2 0%, #fff5f5 100%)',
                          border: '1.5px solid #fca5a5', fontSize: '0.87rem',
                        }}>
                          <span style={{ fontWeight: 700, color: '#991b1b' }}>{e.nom}</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                            <span style={{ color: '#9ca3af', textDecoration: 'line-through', fontSize: '0.82rem', fontWeight: 600 }}>
                              {e.oldQty !== null ? e.oldQty.toFixed(3) : '—'}
                            </span>
                            <span style={{ color: '#dc2626', fontWeight: 900, fontSize: '0.9rem' }}>→</span>
                            <span style={{ color: '#dc2626', fontWeight: 900, fontSize: '0.95rem' }}>{e.qty.toFixed(3)}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {newEntries.length > 0 && (
                  <div style={{ marginBottom: 18 }}>
                    {hasReplacements && (
                      <div style={{ fontSize: '0.67rem', fontWeight: 800, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 7 }}>✨ Nouveaux</div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
                      {newEntries.map((e) => (
                        <div key={e.ingredientId} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '8px 12px', borderRadius: 8,
                          background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: '0.87rem',
                        }}>
                          <span style={{ fontWeight: 600 }}>{e.nom}</span>
                          <span style={{ fontWeight: 800, color: '#1e40af' }}>{e.qty.toFixed(3)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button onClick={() => setConfirmPopup(null)} style={{ padding: '10px 22px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600 }}>
                    Annuler
                  </button>
                  <button onClick={handleConfirmSave} style={{
                    padding: '10px 28px', borderRadius: 10, border: 'none',
                    background: hasReplacements
                      ? 'linear-gradient(135deg, #dc2626, #b91c1c)'
                      : 'linear-gradient(135deg, #1e3a8a, #1e40af)',
                    color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: '0.9rem',
                    boxShadow: hasReplacements ? '0 4px 14px rgba(220,38,38,0.4)' : '0 4px 14px rgba(30,64,175,0.4)',
                  }}>
                    {hasReplacements ? '🔄 Remplacer' : '✓ Enregistrer'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Aperçu saisie inventaire */}
      {invPreviewLines.length > 0 && (
        <div style={{ position: 'fixed', bottom: 14, right: 14, zIndex: 1100, width: 320, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          {invPreviewMinimized ? (
            <button onClick={() => setInvPreviewMinimized(false)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: 'linear-gradient(135deg,#1e40af,#2563eb)', border: 'none', borderRadius: 30, cursor: 'pointer', boxShadow: '0 4px 16px rgba(37,99,235,0.35)', color: '#fff' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>
              <span style={{ fontSize: '0.72rem', fontWeight: 700 }}>{invPreviewLines.length} article{invPreviewLines.length > 1 ? 's' : ''}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
            </button>
          ) : (
            <div style={{ background: '#fff', boxShadow: '0 8px 32px rgba(0,0,0,0.12)', borderRadius: 12, width: '100%', overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px 8px', background: 'linear-gradient(135deg,#1e40af,#2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '12px 12px 0 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>
                  <span style={{ fontSize: '0.70rem', fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Aperçu saisie</span>
                  <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.75)', background: 'rgba(255,255,255,0.15)', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>{invPreviewLines.length} article{invPreviewLines.length > 1 ? 's' : ''}</span>
                </div>
                <button onClick={() => setInvPreviewMinimized(true)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, padding: 0, color: '#fff' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
              </div>
              <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={{ padding: '7px 14px', fontSize: '0.62rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Article</th>
                      <th style={{ padding: '7px 10px', fontSize: '0.62rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>Stock</th>
                      <th style={{ padding: '7px 14px', fontSize: '0.62rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right', borderBottom: '1px solid #e2e8f0' }}>Qté réelle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invPreviewLines.map((line, i) => {
                      const delta = line.stock != null ? line.qty - line.stock : null;
                      return (
                        <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafbfc' }}>
                          <td style={{ padding: '7px 14px', borderBottom: '1px solid #f1f5f9' }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{line.nom}</div>
                            <div style={{ fontSize: '0.62rem', color: '#94a3b8' }}>{line.unite}</div>
                          </td>
                          <td style={{ padding: '7px 10px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', fontSize: '0.74rem', color: '#475569' }}>
                            {line.stock != null ? line.stock.toFixed(3).replace(/\.?0+$/, '') : '—'}
                          </td>
                          <td style={{ padding: '7px 14px', borderBottom: '1px solid #f1f5f9', textAlign: 'right' }}>
                            <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#1e293b' }}>{line.qty.toFixed(3).replace(/\.?0+$/, '')}</div>
                            {delta != null && <div style={{ fontSize: '0.60rem', color: delta >= 0 ? '#10b981' : '#ef4444', fontWeight: 700 }}>{delta >= 0 ? '+' : ''}{delta.toFixed(3).replace(/\.?0+$/, '')}</div>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '8px 14px', background: '#f1f5f9', borderTop: '2px solid #e2e8f0', fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {invPreviewLines.length} article{invPreviewLines.length > 1 ? 's' : ''} inventoriés
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
