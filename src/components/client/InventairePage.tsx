import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/client';
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

const catColor = (_cat: string) => '#2563eb';

export default function InventairePage() {
  const { canWrite } = useAuth();
  const [searchParams] = useSearchParams();
  const laboId = searchParams.get('laboId');
  const activiteId = searchParams.get('activiteId');
  const section = searchParams.get('section');

  const [rows, setRows] = useState<InventaireRow[]>([]);
  const [qtys, setQtys] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
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
  const [searchName, setSearchName] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  interface ConfirmEntry { ingredientId: number; nom: string; qty: number; isReplacement: boolean; oldQty: number | null }
  const [confirmPopup, setConfirmPopup] = useState<{ entries: ConfirmEntry[] } | null>(null);

  useEffect(() => {
    if (!section) return;
    api.get('/api/entreprise/activites')
      .then(({ data }) => {
        const filtered = data as Activite[];
        setActivites(filtered);
        if (filtered.length === 1) setSelectedActiviteId(filtered[0].id);
      })
      .catch(() => {});
  }, [section]);

  const isClientMode = !laboId && !section && !activiteId;

  const loadStock = useCallback(async () => {
    if (!laboId && !effectiveActiviteId && !isClientMode) return;
    setLoading(true);
    setErrorMsg('');
    try {
      let url = '';
      if (laboId) {
        url = `/api/labo/${laboId}/inventaire`;
        const laboRes = await api.get(`/api/labo/${laboId}`);
        setContextNom(laboRes.data?.nom || 'Labo');
      } else if (isClientMode) {
        url = '/api/stock/client/inventaire';
      } else {
        url = `/api/stock/entreprise/${effectiveActiviteId}/inventaire`;
        const act = activites.find((a) => a.id === effectiveActiviteId);
        if (act) setContextNom(act.nom);
      }
      const { data } = await api.get(url);
      setRows(data);
      const initQtys: Record<number, string> = {};
      const initNotes: Record<number, string> = {};
      for (const r of data as InventaireRow[]) {
        initQtys[r.ingredientId] = '';
        initNotes[r.ingredientId] = '';
      }
      setQtys(initQtys);
      setNotes(initNotes);
    } catch { setErrorMsg('Erreur lors du chargement.'); }
    setLoading(false);
  }, [laboId, effectiveActiviteId, activites, isClientMode]);

  useEffect(() => { loadStock(); }, [loadStock]);

  const isAlarm = (r: InventaireRow) => r.inventaireDates.includes(date);

  const categories = useMemo(() => [...new Set(rows.map((r) => r.categorie))], [rows]);

  const filteredRows = useMemo(() => rows.filter((r) => {
    if (filterCategory && r.categorie !== filterCategory) return false;
    if (searchName && !r.nom.toLowerCase().includes(searchName.toLowerCase())) return false;
    return true;
  }), [rows, filterCategory, searchName]);

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
        note: notes[e.ingredientId]?.trim() || null,
      }));
      const url = laboId
        ? `/api/labo/${laboId}/inventaire`
        : isClientMode
        ? '/api/stock/client/inventaire'
        : `/api/stock/entreprise/${effectiveActiviteId}/inventaire`;
      await api.post(url, { dateInventaire: date, entries });
      setSuccessMsg('Inventaire sauvegardé avec succès.');
      setTimeout(() => setSuccessMsg(''), 4000);
      loadStock();
    } catch { setErrorMsg('Erreur lors de la sauvegarde.'); }
    setSaving(false);
  };

  const filledCount = rows.filter((r) => qtys[r.ingredientId] !== '').length;
  const alarmTotal = rows.filter((r) => isAlarm(r)).length;
  const hasAnyQty = filledCount > 0;
  const needsActiviteSelector = !isClientMode && !!section && !activiteId && activites.length > 1 && !selectedActiviteId;

  const contextLabel = laboId
    ? `Labo — ${contextNom}`
    : section
    ? `Activités${contextNom ? ` — ${contextNom}` : ''}`
    : contextNom || 'Inventaire';

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 16px' }}>

      {/* ── Hero header ── */}
      <div style={{
        background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 60%, #0ea5e9 100%)',
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(37,99,235,0.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem', lineHeight: 1 }}>🔢</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>Inventaire</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>{contextLabel}</p>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {rows.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', borderRadius: 12, padding: '10px 18px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', lineHeight: 1 }}>{rows.length}</div>
              <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Ingrédients</div>
            </div>
          )}
          {alarmTotal > 0 && (
            <div style={{ background: 'rgba(245,158,11,0.25)', backdropFilter: 'blur(8px)', border: '1px solid rgba(245,158,11,0.5)', borderRadius: 12, padding: '10px 18px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fbbf24', lineHeight: 1 }}>{alarmTotal}</div>
              <div style={{ fontSize: '0.7rem', color: '#fcd34d', textTransform: 'uppercase', letterSpacing: '0.06em' }}>⚠ Date existante</div>
            </div>
          )}
          {filledCount > 0 && (
            <div style={{ background: 'rgba(16,185,129,0.2)', backdropFilter: 'blur(8px)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: 12, padding: '10px 18px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#34d399', lineHeight: 1 }}>{filledCount}</div>
              <div style={{ fontSize: '0.7rem', color: '#6ee7b7', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Saisis</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Activite selector ── */}
      {section && !activiteId && activites.length > 1 && (
        <div style={{ marginBottom: 20, background: 'var(--surface)', borderRadius: 12, padding: '14px 18px', border: '1px solid var(--border)' }}>
          <label style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Activité</label>
          <select value={selectedActiviteId ?? ''} onChange={(e) => setSelectedActiviteId(Number(e.target.value) || null)}
            style={{ padding: '9px 13px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: '0.9rem', minWidth: 240, fontWeight: 600, background: 'var(--background)' }}>
            <option value="">— Choisir une activité —</option>
            {activites.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
          </select>
        </div>
      )}

      {!needsActiviteSelector && (
        <>
          {/* ── Filter bar ── */}
          <div style={{
            background: 'var(--surface)', borderRadius: 14, padding: '16px 20px', marginBottom: 20,
            border: '1px solid var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
            display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end',
          }}>
            <div>
              <label style={{ fontSize: '0.68rem', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>📅 Date inventaire</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                max={todayStr()}
                style={{ padding: '9px 13px', borderRadius: 9, border: '1.5px solid #2563eb', fontSize: '0.92rem', fontWeight: 700, color: '#1e3a5f', background: '#eff6ff' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>🔍 Rechercher</label>
              <input type="text" value={searchName} onChange={(e) => setSearchName(e.target.value)} placeholder="Nom ingrédient..."
                style={{ padding: '9px 13px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: '0.88rem', minWidth: 190, background: 'var(--background)' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>🏷 Catégorie</label>
              <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
                style={{ padding: '9px 13px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: '0.88rem', minWidth: 160, background: 'var(--background)' }}>
                <option value="">Toutes les catégories</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <button onClick={handleSave} disabled={saving || !hasAnyQty || !canWrite} style={{
                padding: '10px 28px', borderRadius: 10, border: 'none',
                background: hasAnyQty && canWrite ? 'linear-gradient(135deg, #2563eb 0%, #0ea5e9 100%)' : '#e5e7eb',
                color: hasAnyQty && canWrite ? '#fff' : '#9ca3af', fontWeight: 800, fontSize: '0.95rem',
                cursor: hasAnyQty && canWrite ? 'pointer' : 'not-allowed',
                boxShadow: hasAnyQty ? '0 4px 14px rgba(37,99,235,0.35)' : 'none',
                transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 7,
              }}>
                <span style={{ fontSize: '1rem' }}>💾</span>
                {saving ? 'Sauvegarde...' : `Sauvegarder${filledCount > 0 ? ` (${filledCount})` : ''}`}
              </button>
            </div>
          </div>

          {/* ── Messages ── */}
          {errorMsg && (
            <div style={{ background: 'linear-gradient(90deg, #fef2f2, #fff)', border: '1.5px solid #fca5a5', borderRadius: 10, padding: '11px 16px', marginBottom: 14, fontSize: '0.85rem', color: '#991b1b', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🚫</span> {errorMsg}
            </div>
          )}
          {successMsg && (
            <div style={{ background: 'linear-gradient(90deg, #f0fdf4, #fff)', border: '1.5px solid #86efac', borderRadius: 10, padding: '11px 16px', marginBottom: 14, fontSize: '0.85rem', color: '#166534', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>✅</span> {successMsg}
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <div style={{ fontSize: '2rem', marginBottom: 12, animation: 'spin 1s linear infinite' }}>⚙️</div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Chargement des ingrédients...</p>
            </div>
          ) : filteredRows.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', background: 'var(--surface)', borderRadius: 14, border: '1px dashed var(--border)' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>📦</div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 500 }}>Aucun ingrédient trouvé.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filteredCategories.map((cat) => {
                const catRows = filteredRows.filter((r) => r.categorie === cat);
                const isOpen = openCategories.has(cat);
                const alarmCount = catRows.filter((r) => isAlarm(r)).length;
                const filledInCat = catRows.filter((r) => qtys[r.ingredientId] !== '').length;
                const color = catColor(cat);
                return (
                  <div key={cat} style={{
                    borderRadius: 14, overflow: 'hidden',
                    boxShadow: isOpen ? `0 4px 20px ${color}22` : '0 1px 6px rgba(0,0,0,0.07)',
                    border: `1.5px solid ${isOpen ? color : 'var(--border)'}`,
                    transition: 'box-shadow 0.2s, border-color 0.2s',
                  }}>
                    {/* Category header */}
                    <button onClick={() => toggleCategory(cat)} style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                      padding: '13px 18px',
                      background: isOpen
                        ? `linear-gradient(135deg, ${color}ee 0%, ${color}bb 100%)`
                        : 'var(--surface)',
                      border: 'none', cursor: 'pointer', textAlign: 'left',
                      borderLeft: `5px solid ${color}`,
                      transition: 'background 0.15s',
                    }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: 8,
                        background: isOpen ? 'rgba(255,255,255,0.25)' : `${color}18`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '1rem', flexShrink: 0,
                      }}>🏷</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: '0.92rem', letterSpacing: '0.02em', color: isOpen ? '#fff' : 'var(--text)', textTransform: 'uppercase' }}>
                          {cat}
                        </div>
                        <div style={{ fontSize: '0.73rem', color: isOpen ? 'rgba(255,255,255,0.75)' : 'var(--text-muted)', marginTop: 1 }}>
                          {catRows.length} ingrédient{catRows.length > 1 ? 's' : ''}
                          {filledInCat > 0 && <span style={{ marginLeft: 6, color: isOpen ? '#bbf7d0' : '#16a34a', fontWeight: 700 }}>· {filledInCat} saisi{filledInCat > 1 ? 's' : ''}</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {alarmCount > 0 && (
                          <span style={{ background: '#f59e0b', color: '#fff', fontSize: '0.68rem', fontWeight: 800, padding: '3px 9px', borderRadius: 20, letterSpacing: '0.03em' }}>
                            ⚠ {alarmCount}
                          </span>
                        )}
                        <span style={{
                          width: 28, height: 28, borderRadius: 7,
                          background: isOpen ? 'rgba(255,255,255,0.2)' : `${color}15`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: isOpen ? '#fff' : color, fontSize: '0.8rem', fontWeight: 700,
                        }}>
                          {isOpen ? '▲' : '▼'}
                        </span>
                      </div>
                    </button>

                    {/* Ingredient rows */}
                    {isOpen && (
                      <div>
                        {catRows.map((r, idx) => {
                          const alarm = isAlarm(r);
                          const histOpen = openHistory.has(r.ingredientId);
                          const filled = qtys[r.ingredientId] !== '';
                          const inputStyle: React.CSSProperties = {
                            width: '100%', padding: '9px 12px', borderRadius: 9, fontSize: '0.92rem',
                            border: alarm ? '2px solid #f59e0b' : filled ? '2px solid #10b981' : '1.5px solid var(--border)',
                            background: alarm ? '#fffbeb' : filled ? '#f0fdf4' : 'var(--background)',
                            boxShadow: alarm ? '0 0 0 3px #fef3c7' : filled ? '0 0 0 3px #dcfce7' : 'none',
                            outline: 'none', transition: 'all 0.15s', fontWeight: 700,
                          };
                          return (
                            <div key={r.ingredientId} style={{
                              borderTop: idx > 0 ? '1px solid var(--border)' : undefined,
                              padding: '14px 18px',
                              background: alarm
                                ? 'linear-gradient(90deg, #fffbeb 0%, #fffdf7 100%)'
                                : filled
                                ? 'linear-gradient(90deg, #f0fdf4 0%, #fff 80%)'
                                : idx % 2 === 0 ? 'var(--background)' : 'var(--surface)',
                              borderLeft: `4px solid ${alarm ? '#f59e0b' : filled ? '#10b981' : 'transparent'}`,
                              transition: 'background 0.1s',
                            }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 150px 1fr auto', gap: 12, alignItems: 'center' }}>
                                {/* Name */}
                                <div>
                                  <div style={{ fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 7, color: alarm ? '#92400e' : 'var(--text)' }}>
                                    {alarm && <span style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 6, padding: '1px 6px', fontSize: '0.7rem', fontWeight: 800, color: '#d97706' }}>⚠ DATE</span>}
                                    {r.isPT && <span style={{ background: '#ede9fe', border: '1px solid #a78bfa', borderRadius: 6, padding: '1px 6px', fontSize: '0.68rem', fontWeight: 800, color: '#7c3aed' }}>PT</span>}
                                    {r.nom}
                                  </div>
                                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <span style={{ background: `${color}18`, color, borderRadius: 5, padding: '1px 7px', fontWeight: 700, fontSize: '0.68rem' }}>{r.unite}</span>
                                  </div>
                                </div>

                                {/* Total Stock */}
                                <div>
                                  <div style={{ fontSize: '0.67rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                                    Total Stock
                                  </div>
                                  <div style={{
                                    padding: '8px 10px', borderRadius: 9, fontSize: '0.9rem', fontWeight: 800, textAlign: 'right',
                                    background: r.totalStock !== null && r.totalStock > 0 ? '#f0fdf4' : '#f8fafc',
                                    border: r.totalStock !== null && r.totalStock > 0 ? '1.5px solid #86efac' : '1.5px solid #e2e8f0',
                                    color: r.totalStock !== null && r.totalStock > 0 ? '#15803d' : '#9ca3af',
                                  }}>
                                    {r.totalStock !== null ? r.totalStock.toFixed(3) : '—'}
                                  </div>
                                </div>

                                {/* Qty input */}
                                <div>
                                  <div style={{ fontSize: '0.67rem', fontWeight: 800, color: alarm ? '#d97706' : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                                    Qté réelle
                                  </div>
                                  <input
                                    type="number" min="0" step="0.001"
                                    value={qtys[r.ingredientId] ?? ''}
                                    onChange={(e) => setQtys((prev) => ({ ...prev, [r.ingredientId]: e.target.value }))}
                                    placeholder="0.000"
                                    style={inputStyle}
                                  />
                                </div>

                                {/* Note */}
                                <div>
                                  <div style={{ fontSize: '0.67rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Note</div>
                                  <input type="text" value={notes[r.ingredientId] ?? ''} onChange={(e) => setNotes((prev) => ({ ...prev, [r.ingredientId]: e.target.value }))}
                                    placeholder="Observation..."
                                    style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: '0.85rem', background: 'var(--background)' }} />
                                </div>

                                {/* History toggle */}
                                <button onClick={() => toggleHistory(r.ingredientId)} style={{
                                  padding: '7px 11px', borderRadius: 8,
                                  border: `1.5px solid ${histOpen ? color : 'var(--border)'}`,
                                  background: histOpen ? `${color}15` : 'var(--background)',
                                  cursor: 'pointer', fontSize: '0.75rem',
                                  color: histOpen ? color : 'var(--text-muted)',
                                  fontWeight: 700, whiteSpace: 'nowrap', transition: 'all 0.15s',
                                }}>
                                  📋 {histOpen ? '▲' : '▼'}
                                </button>
                              </div>

                              {/* Collapsible last 5 inventaires */}
                              {histOpen && (
                                <div style={{ marginTop: 12, padding: '12px 14px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                                  {r.recentInventaires.length === 0 ? (
                                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0, fontStyle: 'italic' }}>Aucun inventaire enregistré pour cet ingrédient</p>
                                  ) : (
                                    <div>
                                      <div style={{ fontSize: '0.67rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.07em' }}>
                                        5 derniers inventaires
                                      </div>
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                                        {r.recentInventaires.map((inv) => {
                                          const isCurrent = inv.date === date;
                                          return (
                                            <div key={inv.id} style={{
                                              padding: '6px 14px', borderRadius: 20,
                                              background: isCurrent ? '#fef3c7' : '#fff',
                                              border: isCurrent ? '1.5px solid #f59e0b' : '1px solid #e2e8f0',
                                              fontSize: '0.8rem', fontWeight: 600,
                                              color: isCurrent ? '#92400e' : 'var(--text)',
                                              boxShadow: isCurrent ? '0 2px 8px rgba(245,158,11,0.2)' : '0 1px 3px rgba(0,0,0,0.06)',
                                            }}>
                                              {isCurrent && <span style={{ marginRight: 5 }}>⚠</span>}
                                              {fmtDate(inv.date)} — <strong>{inv.qty.toFixed(3)}</strong> {r.unite}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

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
                  : 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 60%, #0ea5e9 100%)',
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
                      <div style={{ fontSize: '0.67rem', fontWeight: 800, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 7 }}>✨ Nouveaux</div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
                      {newEntries.map((e) => (
                        <div key={e.ingredientId} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '8px 12px', borderRadius: 8,
                          background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: '0.87rem',
                        }}>
                          <span style={{ fontWeight: 600 }}>{e.nom}</span>
                          <span style={{ fontWeight: 800, color: '#2563eb' }}>{e.qty.toFixed(3)}</span>
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
                      : 'linear-gradient(135deg, #2563eb, #0ea5e9)',
                    color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: '0.9rem',
                    boxShadow: hasReplacements ? '0 4px 14px rgba(220,38,38,0.4)' : '0 4px 14px rgba(37,99,235,0.4)',
                  }}>
                    {hasReplacements ? '🔄 Remplacer' : '✓ Confirmer'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
