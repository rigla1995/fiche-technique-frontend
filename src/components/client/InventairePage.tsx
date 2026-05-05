import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/client';

const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtDate = (iso: string | null | undefined) => {
  if (!iso || iso.length < 10) return iso ?? '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

interface InventaireRow {
  ingredientId: number;
  nom: string;
  unite: string;
  categorie: string;
  seuilMin: number | null;
  lastInventaire: { id: string; qty: number; date: string; note: string | null } | null;
  hasInventaireToday: boolean;
}

interface HistEntry {
  id: string;
  dateInventaire: string;
  quantiteReelle: number;
  note: string | null;
  ingredientId: number;
  ingredientNom: string;
  unite: string;
  categorie: string;
  laboNom?: string;
  activiteNom?: string;
}

interface Activite { id: number; nom: string; type: string; franchiseGroup: string | null }

const labelStyle: React.CSSProperties = {
  fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4,
};

const warnStyle = { borderColor: '#f59e0b', boxShadow: '0 0 0 2px #fef3c7' };

const currentYear = new Date().getFullYear();

export default function InventairePage() {
  const [searchParams] = useSearchParams();
  const laboId = searchParams.get('laboId');
  const activiteId = searchParams.get('activiteId');
  const section = searchParams.get('section'); // 'franchise' | 'distinct'

  const [tab, setTab] = useState<'saisie' | 'historique'>('saisie');

  // Saisie state
  const [rows, setRows] = useState<InventaireRow[]>([]);
  const [qtys, setQtys] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [date, setDate] = useState(todayStr());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [contextNom, setContextNom] = useState('');
  const [dateAlarmRows, setDateAlarmRows] = useState<Set<number>>(new Set());

  // Activite selector (for section-based context)
  const [activites, setActivites] = useState<Activite[]>([]);
  const [selectedActiviteId, setSelectedActiviteId] = useState<number | null>(null);
  const effectiveActiviteId = activiteId ? Number(activiteId) : selectedActiviteId;

  // Confirmation popup
  const [confirmPopup, setConfirmPopup] = useState<{ entries: { ingredientId: number; nom: string; qty: number }[] } | null>(null);

  // Historique state
  const [histRows, setHistRows] = useState<HistEntry[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [histFilters, setHistFilters] = useState({ startDate: `${currentYear}-01-01`, endDate: `${currentYear}-12-31`, ingredientId: '' });
  const [histApplied, setHistApplied] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editEntry, setEditEntry] = useState<HistEntry | null>(null);
  const [editQty, setEditQty] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Load activites for section-based context
  useEffect(() => {
    if (!section) return;
    api.get('/api/entreprise/activites')
      .then(({ data }) => {
        const filtered = (data as Activite[]).filter((a) =>
          section === 'franchise'
            ? (a.type === 'franchise_avec_labo' || a.type === 'franchise_gestion_separee' || a.franchiseGroup)
            : a.type === 'distinct'
        );
        setActivites(filtered);
        if (filtered.length === 1) setSelectedActiviteId(filtered[0].id);
      })
      .catch(() => {});
  }, [section]);

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
      const initNotes: Record<number, string> = {};
      for (const r of data as InventaireRow[]) {
        initQtys[r.ingredientId] = '';
        initNotes[r.ingredientId] = '';
      }
      setQtys(initQtys);
      setNotes(initNotes);
    } catch { setErrorMsg('Erreur lors du chargement.'); }
    setLoading(false);
  }, [laboId, effectiveActiviteId, activites]);

  useEffect(() => { loadStock(); }, [loadStock]);

  // Check for date alarms (existing inventaires on chosen date)
  useEffect(() => {
    const alarms = new Set<number>();
    for (const r of rows) {
      if (r.hasInventaireToday && date === todayStr()) alarms.add(r.ingredientId);
      if (r.lastInventaire?.date === date) alarms.add(r.ingredientId);
    }
    setDateAlarmRows(alarms);
  }, [rows, date]);

  const handleSave = () => {
    const entries = rows
      .filter((r) => qtys[r.ingredientId] !== '' && parseFloat(qtys[r.ingredientId] || '0') >= 0)
      .map((r) => ({ ingredientId: r.ingredientId, nom: r.nom, qty: parseFloat(qtys[r.ingredientId]) }));
    if (entries.length === 0) { setErrorMsg('Aucune quantité saisie.'); return; }
    setConfirmPopup({ entries });
  };

  const handleConfirmSave = async () => {
    if (!confirmPopup) return;
    setSaving(true);
    setErrorMsg('');
    setConfirmPopup(null);
    try {
      const entries = confirmPopup.entries.map((e) => ({
        ingredientId: e.ingredientId,
        quantiteReelle: e.qty,
        note: notes[e.ingredientId]?.trim() || null,
      }));
      const url = laboId
        ? `/api/labo/${laboId}/inventaire`
        : `/api/stock/entreprise/${effectiveActiviteId}/inventaire`;
      await api.post(url, { dateInventaire: date, entries });
      setSuccessMsg('Inventaire sauvegardé avec succès.');
      setTimeout(() => setSuccessMsg(''), 4000);
      loadStock();
    } catch { setErrorMsg('Erreur lors de la sauvegarde.'); }
    setSaving(false);
  };

  const loadHistorique = async () => {
    if (!laboId && !effectiveActiviteId) return;
    setHistLoading(true);
    setHistApplied(true);
    try {
      const params = new URLSearchParams();
      if (histFilters.startDate) params.set('startDate', histFilters.startDate);
      if (histFilters.endDate) params.set('endDate', histFilters.endDate);
      if (histFilters.ingredientId) params.set('ingredientId', histFilters.ingredientId);
      const url = laboId
        ? `/api/labo/${laboId}/inventaire/historique?${params}`
        : `/api/stock/entreprise/${effectiveActiviteId}/inventaire/historique?${params}`;
      const { data } = await api.get(url);
      setHistRows(data);
      setSelectedIds(new Set());
    } catch { setErrorMsg('Erreur historique.'); }
    setHistLoading(false);
  };

  const handleExportExcel = () => {
    const params = new URLSearchParams();
    if (histFilters.startDate) params.set('startDate', histFilters.startDate);
    if (histFilters.endDate) params.set('endDate', histFilters.endDate);
    if (histFilters.ingredientId) params.set('ingredientId', histFilters.ingredientId);
    if (selectedIds.size > 0) params.set('selectedIds', [...selectedIds].join(','));
    const url = laboId
      ? `/api/labo/${laboId}/inventaire/historique/export-excel?${params}`
      : `/api/stock/entreprise/${effectiveActiviteId}/inventaire/historique/export-excel?${params}`;
    window.open(`${import.meta.env.VITE_API_URL || ''}${url}`, '_blank');
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === histRows.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(histRows.map((r) => r.id)));
  };

  const handleEditSave = async () => {
    if (!editEntry) return;
    setEditSaving(true);
    try {
      const { data } = await api.put(`/api/stock/inventaire/${editEntry.id}`, {
        quantiteReelle: parseFloat(editQty),
        note: editNote.trim() || null,
      });
      setHistRows((prev) => prev.map((r) => r.id === editEntry.id ? { ...r, quantiteReelle: data.quantiteReelle, note: data.note } : r));
      setEditEntry(null);
    } catch { setErrorMsg('Erreur modification.'); }
    setEditSaving(false);
  };

  const categories = [...new Set(rows.map((r) => r.categorie))];

  const contextTitle = laboId
    ? `Stock Labo — ${contextNom}`
    : section
    ? `Stock ${section === 'franchise' ? 'Franchise' : 'Distinct'}${contextNom ? ` — ${contextNom}` : ''}`
    : contextNom || 'Inventaire';

  // Need activite selector
  const needsActiviteSelector = !!section && !activiteId && activites.length > 1 && !selectedActiviteId;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 4 }}>Inventaire</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 20 }}>{contextTitle}</p>

      {/* Activite selector for section context */}
      {section && !activiteId && activites.length > 1 && (
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Sélectionner une activité</label>
          <select
            value={selectedActiviteId ?? ''}
            onChange={(e) => setSelectedActiviteId(Number(e.target.value) || null)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.9rem', minWidth: 200 }}
          >
            <option value="">— Choisir —</option>
            {activites.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
          </select>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '2px solid var(--border)', paddingBottom: 0 }}>
        {(['saisie', 'historique'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 20px', background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '0.9rem', fontWeight: tab === t ? 700 : 400,
            color: tab === t ? 'var(--primary)' : 'var(--text-muted)',
            borderBottom: tab === t ? '2px solid var(--primary)' : '2px solid transparent',
            marginBottom: -2,
          }}>
            {t === 'saisie' ? '📋 Saisie Inventaire' : '📊 Historique Inventaire'}
          </button>
        ))}
      </div>

      {/* Error / Success banners */}
      {errorMsg && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: '0.85rem', color: '#991b1b' }}>
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: '0.85rem', color: '#166534' }}>
          ✅ {successMsg}
        </div>
      )}

      {/* ── SAISIE TAB ────────────────────────────────────────────────────────── */}
      {tab === 'saisie' && (
        <>
          {needsActiviteSelector && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Sélectionnez une activité pour continuer.</p>
          )}
          {!needsActiviteSelector && (
            <>
              {/* Date selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
                <div>
                  <label style={labelStyle}>Date de l'inventaire</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.9rem' }}
                  />
                </div>
              </div>

              {loading ? (
                <p style={{ color: 'var(--text-muted)' }}>Chargement...</p>
              ) : rows.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>Aucun ingrédient trouvé.</p>
              ) : (
                <>
                  {categories.map((cat) => {
                    const catRows = rows.filter((r) => r.categorie === cat);
                    return (
                      <div key={cat} style={{ marginBottom: 28 }}>
                        <h3 style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                          {cat}
                        </h3>
                        <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
                          {catRows.map((r, idx) => {
                            const hasAlarm = dateAlarmRows.has(r.ingredientId);
                            return (
                              <div key={r.ingredientId} style={{
                                display: 'grid', gridTemplateColumns: '1fr 160px 1fr auto',
                                gap: 12, alignItems: 'center', padding: '10px 14px',
                                background: idx % 2 === 0 ? 'var(--surface)' : 'var(--background)',
                                borderBottom: idx < catRows.length - 1 ? '1px solid var(--border)' : 'none',
                              }}>
                                <div>
                                  <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>{r.nom}</div>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    {r.unite}
                                    {r.lastInventaire && (
                                      <> · Dernier inv : <strong>{fmtDate(r.lastInventaire.date)}</strong> — {r.lastInventaire.qty} {r.unite}</>
                                    )}
                                  </div>
                                </div>
                                <div>
                                  <label style={labelStyle}>Qté réelle</label>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.001"
                                    value={qtys[r.ingredientId] ?? ''}
                                    onChange={(e) => setQtys((prev) => ({ ...prev, [r.ingredientId]: e.target.value }))}
                                    placeholder="0.000"
                                    style={{
                                      width: '100%', padding: '6px 10px', borderRadius: 7,
                                      border: '1px solid var(--border)', fontSize: '0.9rem',
                                      ...(hasAlarm ? warnStyle : {}),
                                    }}
                                  />
                                  {hasAlarm && (
                                    <div style={{ fontSize: '0.7rem', color: '#d97706', marginTop: 2 }}>
                                      ⚠ Inventaire déjà existant à cette date
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <label style={labelStyle}>Note (optionnel)</label>
                                  <input
                                    type="text"
                                    value={notes[r.ingredientId] ?? ''}
                                    onChange={(e) => setNotes((prev) => ({ ...prev, [r.ingredientId]: e.target.value }))}
                                    placeholder="Observation..."
                                    style={{ width: '100%', padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: '0.85rem' }}
                                  />
                                </div>
                                <div style={{ width: 24 }} />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                    <button
                      onClick={handleSave}
                      disabled={saving || rows.every((r) => !qtys[r.ingredientId])}
                      style={{
                        padding: '10px 28px', borderRadius: 8, border: 'none',
                        background: 'var(--primary)', color: '#fff', fontWeight: 700,
                        fontSize: '0.95rem', cursor: 'pointer', opacity: saving ? 0.6 : 1,
                      }}
                    >
                      {saving ? 'Sauvegarde...' : 'Sauvegarder l\'inventaire'}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}

      {/* ── HISTORIQUE TAB ────────────────────────────────────────────────────── */}
      {tab === 'historique' && (
        <>
          {/* Filters */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, padding: '14px 16px', background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)' }}>
            <div>
              <label style={labelStyle}>Date début</label>
              <input type="date" value={histFilters.startDate} onChange={(e) => setHistFilters((p) => ({ ...p, startDate: e.target.value }))}
                style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: '0.88rem' }} />
            </div>
            <div>
              <label style={labelStyle}>Date fin</label>
              <input type="date" value={histFilters.endDate} onChange={(e) => setHistFilters((p) => ({ ...p, endDate: e.target.value }))}
                style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: '0.88rem' }} />
            </div>
            <div>
              <label style={labelStyle}>Ingrédient</label>
              <select value={histFilters.ingredientId} onChange={(e) => setHistFilters((p) => ({ ...p, ingredientId: e.target.value }))}
                style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: '0.88rem', minWidth: 160 }}>
                <option value="">Tous</option>
                {rows.map((r) => <option key={r.ingredientId} value={r.ingredientId}>{r.nom}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
              <button onClick={loadHistorique} disabled={histLoading}
                style={{ padding: '7px 18px', borderRadius: 7, border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer' }}>
                {histLoading ? '...' : 'Rechercher'}
              </button>
              {histApplied && (
                <button onClick={handleExportExcel}
                  style={{ padding: '7px 16px', borderRadius: 7, border: '1px solid #16a34a', background: '#f0fdf4', color: '#166534', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer' }}>
                  📥 Excel {selectedIds.size > 0 ? `(${selectedIds.size} sel.)` : ''}
                </button>
              )}
            </div>
          </div>

          {histLoading && <p style={{ color: 'var(--text-muted)' }}>Chargement...</p>}
          {!histLoading && histApplied && histRows.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Aucun inventaire trouvé.</p>}
          {!histLoading && histRows.length > 0 && (
            <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.87rem' }}>
                <thead>
                  <tr style={{ background: 'var(--primary)', color: '#fff' }}>
                    <th style={{ padding: '9px 10px', textAlign: 'center', width: 36 }}>
                      <input type="checkbox" checked={selectedIds.size === histRows.length && histRows.length > 0} onChange={toggleSelectAll} />
                    </th>
                    <th style={{ padding: '9px 10px', textAlign: 'left' }}>Date</th>
                    <th style={{ padding: '9px 10px', textAlign: 'left' }}>Ingrédient</th>
                    <th style={{ padding: '9px 10px', textAlign: 'left' }}>Catégorie</th>
                    <th style={{ padding: '9px 10px', textAlign: 'right' }}>Qté réelle</th>
                    <th style={{ padding: '9px 10px', textAlign: 'left' }}>Note</th>
                    <th style={{ padding: '9px 10px', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {histRows.map((r, i) => {
                    const isSelected = selectedIds.has(r.id);
                    return (
                      <tr key={r.id} style={{ background: isSelected ? '#fef3c7' : (i % 2 === 0 ? 'var(--surface)' : 'var(--background)') }}>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(r.id)} />
                        </td>
                        <td style={{ padding: '8px 10px', fontWeight: 600 }}>{fmtDate(r.dateInventaire)}</td>
                        <td style={{ padding: '8px 10px' }}>{r.ingredientNom}</td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>{r.categorie}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>
                          {r.quantiteReelle.toFixed(3)} {r.unite}
                        </td>
                        <td style={{ padding: '8px 10px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>{r.note || '—'}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          <button
                            onClick={() => { setEditEntry(r); setEditQty(String(r.quantiteReelle)); setEditNote(r.note || ''); }}
                            style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>
                            ✏️ Modifier
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── CONFIRMATION POPUP ────────────────────────────────────────────────── */}
      {confirmPopup && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 0, maxWidth: 480, width: '90%', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', padding: '18px 24px' }}>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>⚠️ Confirmer l'inventaire</div>
              <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.85)', marginTop: 4 }}>
                Date : {fmtDate(date)} · {confirmPopup.entries.length} ingrédient(s)
              </div>
            </div>
            <div style={{ padding: '20px 24px' }}>
              <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '0.83rem', color: '#92400e' }}>
                ⚠️ <strong>Important :</strong> Cet inventaire ne pourra pas être supprimé, seulement modifié. Il recalculera le stock à partir de la date saisie.
              </div>
              <div style={{ maxHeight: 180, overflowY: 'auto', marginBottom: 16 }}>
                {confirmPopup.entries.map((e) => (
                  <div key={e.ingredientId} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f3f4f6', fontSize: '0.87rem' }}>
                    <span>{e.nom}</span>
                    <span style={{ fontWeight: 700 }}>{e.qty.toFixed(3)}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => setConfirmPopup(null)} style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: '0.9rem' }}>
                  Annuler
                </button>
                <button onClick={handleConfirmSave} style={{ padding: '8px 24px', borderRadius: 8, border: 'none', background: '#d97706', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}>
                  Confirmer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT MODAL ────────────────────────────────────────────────────────── */}
      {editEntry && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: '24px', maxWidth: 400, width: '90%', boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 16 }}>Modifier l'inventaire</h3>
            <div style={{ marginBottom: 4, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {editEntry.ingredientNom} · {fmtDate(editEntry.dateInventaire)}
            </div>
            <div style={{ background: '#fef3c7', borderRadius: 8, padding: '8px 12px', marginBottom: 16, fontSize: '0.8rem', color: '#92400e' }}>
              ⚠️ La date ne peut pas être modifiée.
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Quantité réelle ({editEntry.unite})</label>
              <input type="number" min="0" step="0.001" value={editQty} onChange={(e) => setEditQty(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: '0.9rem' }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Note</label>
              <input type="text" value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="Observation..."
                style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: '0.88rem' }} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditEntry(null)} style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid var(--border)', background: 'none', cursor: 'pointer' }}>
                Annuler
              </button>
              <button onClick={handleEditSave} disabled={editSaving}
                style={{ padding: '8px 22px', borderRadius: 7, border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: editSaving ? 0.6 : 1 }}>
                {editSaving ? '...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
