import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';

const PAGE_SIZE = 10;
const currentYear = new Date().getFullYear();
const fmtDate = (iso: string | null | undefined) => {
  if (!iso || iso.length < 10) return iso ?? '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

interface HistEntry {
  id: string;
  dateInventaire: string;
  quantiteReelle: number;
  note: string | null;
  ingredientId: number;
  isPT?: boolean;
  ingredientNom: string;
  unite: string;
  categorie: string;
  laboNom?: string;
  activiteNom?: string;
  createdBy?: number | null;
  createdByNom?: string | null;
}

interface IngOption { ingredientId: number; nom: string; categorie: string }
interface Activite { id: number; nom: string }

const labelStyle: React.CSSProperties = {
  fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5,
};

export default function HistoriqueInventairePage() {
  const { user, canWrite } = useAuth();
  const { clearByEventType } = useNotifications();
  const isGerant = user?.role === 'gerant';
  const [searchParams] = useSearchParams();
  const laboId = searchParams.get('laboId');
  const activiteId = searchParams.get('activiteId');
  const section = searchParams.get('section');

  const [histRows, setHistRows] = useState<HistEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [applied, setApplied] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [contextNom, setContextNom] = useState('');

  const [activites, setActivites] = useState<Activite[]>([]);
  const [selectedActiviteId, setSelectedActiviteId] = useState<number | null>(null);
  const effectiveActiviteId = activiteId ? Number(activiteId) : selectedActiviteId;

  const [startDate, setStartDate] = useState(`${currentYear}-01-01`);
  const [endDate, setEndDate] = useState(`${currentYear}-12-31`);
  const [filterIngredientId, setFilterIngredientId] = useState('');
  const [filterCategorie, setFilterCategorie] = useState('');

  const [ingOptions, setIngOptions] = useState<IngOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exportingPdf, setExportingPdf] = useState(false);

  const [page, setPage] = useState(1);

  const [editEntry, setEditEntry] = useState<HistEntry | null>(null);
  const [editQty, setEditQty] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const isClientMode = !laboId && !section && !activiteId;

  useEffect(() => {
    if (!isGerant) clearByEventType('new_inventaire');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  useEffect(() => {
    if (!laboId && !effectiveActiviteId && !isClientMode) return;
    const url = laboId
      ? `/api/labo/${laboId}/inventaire`
      : isClientMode
      ? '/api/stock/client/inventaire'
      : `/api/stock/entreprise/${effectiveActiviteId}/inventaire`;
    api.get(url).then(({ data }) => {
      setIngOptions(data.map((r: { ingredientId: number; nom: string; categorie: string }) => ({ ingredientId: r.ingredientId, nom: r.nom, categorie: r.categorie })));
      if (laboId) {
        api.get(`/api/labo/${laboId}`).then(({ data: l }) => setContextNom(l?.nom || 'Labo')).catch(() => {});
      }
    }).catch(() => {});
  }, [laboId, effectiveActiviteId, isClientMode]);

  const categories = [...new Set(ingOptions.map((i) => i.categorie))];
  const filteredIngOptions = filterCategorie
    ? ingOptions.filter((i) => i.categorie === filterCategorie)
    : ingOptions;

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (filterIngredientId) params.set('ingredientId', filterIngredientId);
    return params;
  }, [startDate, endDate, filterIngredientId]);

  const getUrl = useCallback((suffix: string) => laboId
    ? `/api/labo/${laboId}/inventaire/historique${suffix}`
    : isClientMode
    ? `/api/stock/client/inventaire/historique${suffix}`
    : `/api/stock/entreprise/${effectiveActiviteId}/inventaire/historique${suffix}`,
  [laboId, isClientMode, effectiveActiviteId]);

  const search = useCallback(async () => {
    if (!laboId && !effectiveActiviteId && !isClientMode) return;
    setLoading(true);
    setApplied(true);
    setErrorMsg('');
    try {
      const { data } = await api.get(`${getUrl('')}?${buildParams()}`);
      const filtered = filterCategorie
        ? (data as HistEntry[]).filter((r) => r.categorie === filterCategorie)
        : data;
      setHistRows(filtered);
      setSelectedIds(new Set());
      setPage(1);
    } catch { setErrorMsg('Erreur lors de la recherche.'); }
    setLoading(false);
  }, [laboId, effectiveActiviteId, buildParams, filterCategorie, getUrl, isClientMode]);

  const handleExport = async () => {
    const params = buildParams();
    if (selectedIds.size > 0) params.set('selectedIds', [...selectedIds].join(','));
    try {
      const { data, headers } = await api.get(`${getUrl('/export-excel')}?${params}`, { responseType: 'blob' });
      const disposition = headers['content-disposition'] || '';
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : 'Inventaire.xlsx';
      const blobUrl = URL.createObjectURL(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch { setErrorMsg("Erreur lors de l'export Excel."); }
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      const params = buildParams();
      if (selectedIds.size > 0) params.set('selectedIds', [...selectedIds].join(','));
      const { data } = await api.get(`${getUrl('/export-pdf')}?${params}`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `historique-inventaire-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { setErrorMsg("Erreur lors de l'export PDF."); }
    setExportingPdf(false);
  };

  const toggleSelect = (id: string) => setSelectedIds((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const handleEditSave = async () => {
    if (!editEntry) return;
    setEditSaving(true);
    try {
      const { data } = await api.put(`/api/stock/inventaire/${editEntry.id}`, {
        quantiteReelle: parseFloat(editQty),
        note: editNote.trim() || null,
      });
      setHistRows((prev) => prev.map((r) =>
        r.id === editEntry.id ? { ...r, quantiteReelle: data.quantiteReelle, note: data.note } : r
      ));
      setEditEntry(null);
    } catch { setErrorMsg('Erreur modification.'); }
    setEditSaving(false);
  };

  const contextTitle = laboId
    ? `Labo — ${contextNom}`
    : section
    ? `Activités${contextNom ? ` — ${contextNom}` : ''}`
    : contextNom || '';

  const showActiviteSelector = !!section && !activiteId && activites.length > 1;
  const canSearch = !!laboId || !!effectiveActiviteId || isClientMode;
  const canExport = canWrite && applied && histRows.length > 0;
  const greenBtn: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6,
    background: 'linear-gradient(135deg, #064e3b 0%, #065f46 100%)',
    boxShadow: '0 4px 14px rgba(6,95,70,0.35)',
    borderRadius: 9, border: 'none', color: '#fff', fontWeight: 800,
    padding: '8px 18px', cursor: 'pointer', transition: 'all 0.15s',
  };
  const greenBtnDisabled: React.CSSProperties = {
    ...greenBtn,
    background: '#e5e7eb', boxShadow: 'none',
    color: 'var(--text-muted)', cursor: 'not-allowed', opacity: 0.55,
  };

  return (
    <div className="page">
      {/* ── Hero header ── */}
      <div style={{
        background: 'linear-gradient(135deg, #064e3b 0%, #065f46 55%, #10b981 100%)',
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(6,95,70,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem', lineHeight: 1 }}>📊</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>Historique Inventaire</h1>
          </div>
          {contextTitle && <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>{contextTitle}</p>}
        </div>
        {applied && histRows.length > 0 && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', borderRadius: 12, padding: '10px 18px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', lineHeight: 1 }}>{histRows.length}</div>
              <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Entrées</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Activite selector ── */}
      {showActiviteSelector && (
        <div style={{ marginBottom: 20, background: 'var(--surface)', borderRadius: 12, padding: '14px 18px', border: '1px solid var(--border)' }}>
          <label style={labelStyle}>Activité</label>
          <select value={selectedActiviteId ?? ''} onChange={(e) => { setSelectedActiviteId(Number(e.target.value) || null); setApplied(false); setHistRows([]); }}
            style={{ padding: '9px 13px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: '0.9rem', minWidth: 240, fontWeight: 600, background: 'var(--background)' }}>
            <option value="">— Choisir une activité —</option>
            {activites.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
          </select>
        </div>
      )}

      {canSearch && (
        <>
          {/* ── Filters ── */}
          <div style={{
            background: 'var(--surface)', borderRadius: 14, padding: '14px 18px', marginBottom: 20,
            border: '1px solid var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
          }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end', marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: '0.65rem', fontWeight: 800, color: '#065f46', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 3 }}>📅 Du</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid #065f46', fontSize: '0.83rem', background: '#f0fdf4', minWidth: 130, fontWeight: 600 }} />
              </div>
              <div>
                <label style={{ fontSize: '0.65rem', fontWeight: 800, color: '#065f46', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 3 }}>📅 Au</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid #065f46', fontSize: '0.83rem', background: '#f0fdf4', minWidth: 130, fontWeight: 600 }} />
              </div>
              <div>
                <label style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 3 }}>🏷️ Catégorie</label>
                <select value={filterCategorie} onChange={(e) => setFilterCategorie(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: '0.83rem', background: 'var(--bg)', minWidth: 140 }}>
                  <option value="">Toutes</option>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 3 }}>🧂 Ingrédient</label>
                <select value={filterIngredientId} onChange={(e) => setFilterIngredientId(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: '0.83rem', background: 'var(--bg)', minWidth: 140 }}>
                  <option value="">Tous</option>
                  {filteredIngOptions.map((i) => <option key={i.ingredientId} value={i.ingredientId}>{i.nom}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={search} disabled={loading} style={{ ...greenBtn, opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}>
                🔍 {loading ? 'Recherche…' : 'Rechercher'}
              </button>
              <button onClick={handleExport} disabled={!canExport} style={canExport ? greenBtn : greenBtnDisabled}>
                <span>📊</span> {selectedIds.size > 0 ? `Exporter (${selectedIds.size})` : 'Exporter'}
              </button>
              <button onClick={handleExportPdf} disabled={exportingPdf || !canExport} style={(canExport && !exportingPdf) ? greenBtn : greenBtnDisabled}>
                <span>🔴</span> {exportingPdf ? '…' : 'PDF'}
              </button>
            </div>
          </div>

          {errorMsg && (
            <div style={{ background: '#fef2f2', border: '1.5px solid #fca5a5', borderRadius: 10, padding: '11px 16px', marginBottom: 14, fontSize: '0.85rem', color: '#991b1b', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🚫</span> {errorMsg}
            </div>
          )}

          {loading && (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <div style={{ fontSize: '2rem', marginBottom: 12 }}>⚙️</div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Chargement de l'historique…</p>
            </div>
          )}

          {!loading && applied && histRows.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 0', background: 'var(--surface)', borderRadius: 14, border: '1px dashed var(--border)' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>📭</div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 500 }}>Aucun inventaire trouvé pour ces critères.</p>
            </div>
          )}

          {!loading && histRows.length > 0 && (() => {
            const totalPages = Math.max(1, Math.ceil(histRows.length / PAGE_SIZE));
            const pagedRows = histRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
            return (
            <div style={{ borderRadius: 14, overflow: 'hidden', border: '1.5px solid var(--border)', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.87rem' }}>
                <thead>
                  <tr style={{ background: 'linear-gradient(135deg, #064e3b, #065f46)' }}>
                    <th style={{ padding: '12px 14px', textAlign: 'center', width: 40, color: '#fff', background: 'transparent', borderBottom: 'none' }} />
                    {['Ingrédient', 'Date', 'Qté réelle', 'Note', 'Par'].map((h) => (
                      <th key={h} style={{ padding: '12px 14px', textAlign: h === 'Qté réelle' ? 'right' : 'left', fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: '#fff', background: 'transparent', borderBottom: 'none' }}>{h}</th>
                    ))}
                    <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 800, fontSize: '0.78rem', textTransform: 'uppercase', color: '#fff', background: 'transparent', borderBottom: 'none' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((r, i) => {
                    const sel = selectedIds.has(r.id);
                    return (
                      <tr key={r.id} style={{
                        background: sel ? 'linear-gradient(90deg, #fef3c7, #fffbeb)' : i % 2 === 0 ? 'var(--surface)' : 'var(--background)',
                        transition: 'background 0.1s',
                        borderLeft: sel ? '3px solid #f59e0b' : undefined,
                      }}>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <input type="checkbox" checked={sel} onChange={() => toggleSelect(r.id)}
                            style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#065f46' }} />
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontWeight: 700, fontSize: '0.86rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.isPT && <span style={{ background: '#ede9fe', border: '1px solid #a78bfa', borderRadius: 5, padding: '1px 6px', fontSize: '0.68rem', fontWeight: 800, color: '#7c3aed', marginRight: 6 }}>PT</span>}
                            {r.ingredientNom}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.unite} · {r.categorie}</div>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 7, padding: '3px 10px', fontWeight: 700, fontSize: '0.82rem', color: '#0f766e', whiteSpace: 'nowrap' }}>
                            {fmtDate(r.dateInventaire)}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          <span style={{ fontWeight: 800, color: '#0f766e', fontSize: '0.93rem' }}>{r.quantiteReelle.toFixed(3)}</span>
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: '0.82rem', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.note
                            ? <span style={{ background: '#fefce8', border: '1px solid #fde68a', borderRadius: 5, padding: '1px 8px', color: '#854d0e', fontSize: '0.78rem' }}>{r.note}</span>
                            : <span style={{ color: '#cbd5e1' }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: '0.72rem', color: '#7c3aed', fontWeight: 600 }}>
                          {r.createdByNom ? `👤 ${r.createdByNom}` : <span style={{ color: '#cbd5e1' }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          {canWrite && (!isGerant || r.createdBy === user?.id) && (
                            <button onClick={() => { setEditEntry(r); setEditQty(String(r.quantiteReelle)); setEditNote(r.note || ''); }}
                              style={{ padding: '5px 14px', borderRadius: 8, border: '1.5px solid #0f766e', background: '#f0fdfa', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, color: '#0f766e', transition: 'all 0.15s' }}>
                              ✏️ Modifier
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#f0fdf4', borderTop: '2px solid #065f46' }}>
                    <td colSpan={2} style={{ padding: '10px 14px', fontWeight: 800, fontSize: '0.78rem', color: '#064e3b', textTransform: 'uppercase' }}>
                      Total — {histRows.length} entrée{histRows.length > 1 ? 's' : ''}
                    </td>
                    <td colSpan={5}></td>
                  </tr>
                </tfoot>
              </table>
              <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border)', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)' }}>
                  <strong style={{ color: '#0f766e' }}>{histRows.length}</strong> enregistrement{histRows.length > 1 ? 's' : ''}
                  {selectedIds.size > 0 && <span style={{ marginLeft: 8, color: '#065f46', fontWeight: 700 }}>· {selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}</span>}
                </span>
                {totalPages > 1 && (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)} style={{ padding: '3px 10px' }}>‹</button>
                    <span style={{ fontWeight: 600 }}>{page} / {totalPages}</span>
                    <button className="btn btn-ghost btn-sm" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)} style={{ padding: '3px 10px' }}>›</button>
                  </div>
                )}
              </div>
            </div>
            );
          })()}
        </>
      )}

      {/* ── Edit modal ── */}
      {editEntry && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 18, padding: 0, maxWidth: 430, width: '90%', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}>
            <div style={{ background: 'linear-gradient(135deg, #134e4a, #0f766e)', padding: '20px 26px' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 900, color: '#fff', margin: 0, marginBottom: 4 }}>✏️ Modifier l'inventaire</h3>
              <p style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.78)', margin: 0 }}>
                {editEntry.ingredientNom} · {fmtDate(editEntry.dateInventaire)}
              </p>
            </div>
            <div style={{ padding: '22px 26px' }}>
              <div style={{ background: '#fef3c7', border: '1.5px solid #fde68a', borderRadius: 9, padding: '10px 14px', marginBottom: 18, fontSize: '0.81rem', color: '#92400e' }}>
                ⚠️ La date ne peut pas être modifiée.
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Quantité réelle ({editEntry.unite})</label>
                <input type="number" min="0" step="0.001" value={editQty} onChange={(e) => setEditQty(e.target.value)}
                  style={{ width: '100%', padding: '10px 13px', borderRadius: 9, border: '1.5px solid #0f766e', fontSize: '0.93rem', fontWeight: 700, background: '#f0fdfa', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: 22 }}>
                <label style={labelStyle}>Note</label>
                <input type="text" value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="Observation..."
                  style={{ width: '100%', padding: '10px 13px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: '0.88rem', background: 'var(--background)', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => setEditEntry(null)} style={{ padding: '10px 22px', borderRadius: 9, border: '1.5px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600 }}>
                  Annuler
                </button>
                <button onClick={handleEditSave} disabled={editSaving} style={{ padding: '10px 26px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg, #0f766e, #0d9488)', color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: '0.9rem', opacity: editSaving ? 0.6 : 1, boxShadow: '0 4px 14px rgba(15,118,110,0.35)' }}>
                  {editSaving ? '...' : '✓ Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
