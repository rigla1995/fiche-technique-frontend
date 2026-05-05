import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/client';

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
  ingredientNom: string;
  unite: string;
  categorie: string;
  laboNom?: string;
  activiteNom?: string;
}

interface IngOption { ingredientId: number; nom: string; categorie: string }
interface Activite { id: number; nom: string; type: string; franchiseGroup: string | null }

const labelStyle: React.CSSProperties = {
  fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4,
};

export default function HistoriqueInventairePage() {
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

  const [filters, setFilters] = useState({
    startDate: `${currentYear}-01-01`,
    endDate: `${currentYear}-12-31`,
    ingredientId: '',
    categorie: '',
  });

  const [ingOptions, setIngOptions] = useState<IngOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [editEntry, setEditEntry] = useState<HistEntry | null>(null);
  const [editQty, setEditQty] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editSaving, setEditSaving] = useState(false);

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

  // Load ingredient options for filters
  useEffect(() => {
    if (!laboId && !effectiveActiviteId) return;
    const url = laboId
      ? `/api/labo/${laboId}/inventaire`
      : `/api/stock/entreprise/${effectiveActiviteId}/inventaire`;
    api.get(url).then(({ data }) => {
      setIngOptions(data.map((r: any) => ({ ingredientId: r.ingredientId, nom: r.nom, categorie: r.categorie })));
      if (laboId) {
        api.get(`/api/labo/${laboId}`).then(({ data: l }) => setContextNom(l?.nom || 'Labo')).catch(() => {});
      }
    }).catch(() => {});
  }, [laboId, effectiveActiviteId]);

  const categories = [...new Set(ingOptions.map((i) => i.categorie))];
  const filteredIngOptions = filters.categorie
    ? ingOptions.filter((i) => i.categorie === filters.categorie)
    : ingOptions;

  const search = useCallback(async () => {
    if (!laboId && !effectiveActiviteId) return;
    setLoading(true);
    setApplied(true);
    setErrorMsg('');
    try {
      const params = new URLSearchParams();
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);
      if (filters.ingredientId) params.set('ingredientId', filters.ingredientId);
      const url = laboId
        ? `/api/labo/${laboId}/inventaire/historique?${params}`
        : `/api/stock/entreprise/${effectiveActiviteId}/inventaire/historique?${params}`;
      const { data } = await api.get(url);
      const filtered = filters.categorie
        ? (data as HistEntry[]).filter((r) => r.categorie === filters.categorie)
        : data;
      setHistRows(filtered);
      setSelectedIds(new Set());
    } catch { setErrorMsg('Erreur lors de la recherche.'); }
    setLoading(false);
  }, [laboId, effectiveActiviteId, filters]);

  const handleExport = async () => {
    const params = new URLSearchParams();
    if (filters.startDate) params.set('startDate', filters.startDate);
    if (filters.endDate) params.set('endDate', filters.endDate);
    if (filters.ingredientId) params.set('ingredientId', filters.ingredientId);
    if (selectedIds.size > 0) params.set('selectedIds', [...selectedIds].join(','));
    const url = laboId
      ? `/api/labo/${laboId}/inventaire/historique/export-excel?${params}`
      : `/api/stock/entreprise/${effectiveActiviteId}/inventaire/historique/export-excel?${params}`;
    try {
      const { data, headers } = await api.get(url, { responseType: 'blob' });
      const disposition = headers['content-disposition'] || '';
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : 'Inventaire.xlsx';
      const blobUrl = URL.createObjectURL(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch { setErrorMsg('Erreur lors de l\'export Excel.'); }
  };

  const toggleSelect = (id: string) => setSelectedIds((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const toggleAll = () => {
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
    ? `${section === 'franchise' ? 'Franchise' : 'Distinct'}${contextNom ? ` — ${contextNom}` : ''}`
    : contextNom || '';

  const showActiviteSelector = !!section && !activiteId && activites.length > 1;
  const canSearch = !!laboId || !!effectiveActiviteId;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: 2, letterSpacing: '-0.01em' }}>
          📊 Historique Inventaire
        </h1>
        {contextTitle && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{contextTitle}</p>}
      </div>

      {showActiviteSelector && (
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Activité</label>
          <select value={selectedActiviteId ?? ''} onChange={(e) => { setSelectedActiviteId(Number(e.target.value) || null); setApplied(false); setHistRows([]); }}
            style={{ padding: '9px 13px', borderRadius: 9, border: '1px solid var(--border)', fontSize: '0.9rem', minWidth: 220 }}>
            <option value="">— Choisir —</option>
            {activites.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
          </select>
        </div>
      )}

      {canSearch && (
        <>
          {/* Filters */}
          <div style={{ background: 'var(--surface)', borderRadius: 12, padding: '14px 18px', marginBottom: 20, border: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
            <div>
              <label style={labelStyle}>Date début</label>
              <input type="date" value={filters.startDate} onChange={(e) => setFilters((p) => ({ ...p, startDate: e.target.value }))}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.88rem' }} />
            </div>
            <div>
              <label style={labelStyle}>Date fin</label>
              <input type="date" value={filters.endDate} onChange={(e) => setFilters((p) => ({ ...p, endDate: e.target.value }))}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.88rem' }} />
            </div>
            <div>
              <label style={labelStyle}>Catégorie</label>
              <select value={filters.categorie} onChange={(e) => setFilters((p) => ({ ...p, categorie: e.target.value, ingredientId: '' }))}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.88rem', minWidth: 140 }}>
                <option value="">Toutes</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Ingrédient</label>
              <select value={filters.ingredientId} onChange={(e) => setFilters((p) => ({ ...p, ingredientId: e.target.value }))}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.88rem', minWidth: 160 }}>
                <option value="">Tous</option>
                {filteredIngOptions.map((i) => <option key={i.ingredientId} value={i.ingredientId}>{i.nom}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={search} disabled={loading}
                style={{ padding: '8px 22px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>
                {loading ? '...' : '🔍 Rechercher'}
              </button>
              {applied && (
                <button onClick={handleExport}
                  style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #16a34a', background: '#f0fdf4', color: '#166534', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer' }}>
                  📥 Excel{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
                </button>
              )}
            </div>
          </div>

          {errorMsg && <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '0.85rem', color: '#991b1b' }}>{errorMsg}</div>}
          {loading && <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>Chargement...</p>}
          {!loading && applied && histRows.length === 0 && <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>Aucun inventaire trouvé pour ces critères.</p>}
          {!loading && histRows.length > 0 && (
            <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.87rem' }}>
                <thead>
                  <tr style={{ background: 'var(--primary)', color: '#fff' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'center', width: 36 }}>
                      <input type="checkbox" checked={selectedIds.size === histRows.length && histRows.length > 0} onChange={toggleAll} />
                    </th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700 }}>Date</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700 }}>Ingrédient</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700 }}>Catégorie</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>Qté réelle</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700 }}>Note</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {histRows.map((r, i) => {
                    const sel = selectedIds.has(r.id);
                    return (
                      <tr key={r.id} style={{ background: sel ? '#fef3c7' : (i % 2 === 0 ? 'var(--surface)' : 'var(--background)'), transition: 'background 0.1s' }}>
                        <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                          <input type="checkbox" checked={sel} onChange={() => toggleSelect(r.id)} />
                        </td>
                        <td style={{ padding: '9px 12px', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtDate(r.dateInventaire)}</td>
                        <td style={{ padding: '9px 12px', fontWeight: 500 }}>{r.ingredientNom}</td>
                        <td style={{ padding: '9px 12px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>{r.categorie}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>
                          {r.quantiteReelle.toFixed(3)} <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.8rem' }}>{r.unite}</span>
                        </td>
                        <td style={{ padding: '9px 12px', color: 'var(--text-muted)', fontSize: '0.82rem', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.note || '—'}
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                          <button onClick={() => { setEditEntry(r); setEditQty(String(r.quantiteReelle)); setEditNote(r.note || ''); }}
                            style={{ padding: '5px 14px', borderRadius: 7, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                            ✏️ Modifier
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ padding: '10px 16px', background: 'var(--surface)', borderTop: '1px solid var(--border)', fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                <span>{histRows.length} enregistrement(s)</span>
                {selectedIds.size > 0 && <span style={{ color: '#d97706', fontWeight: 600 }}>{selectedIds.size} sélectionné(s)</span>}
              </div>
            </div>
          )}
        </>
      )}

      {/* Edit modal */}
      {editEntry && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '26px', maxWidth: 420, width: '90%', boxShadow: '0 16px 48px rgba(0,0,0,0.28)' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: 4 }}>✏️ Modifier l'inventaire</h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 16 }}>
              {editEntry.ingredientNom} · {fmtDate(editEntry.dateInventaire)}
            </p>
            <div style={{ background: '#fef3c7', borderRadius: 8, padding: '9px 13px', marginBottom: 18, fontSize: '0.81rem', color: '#92400e' }}>
              ⚠️ La date ne peut pas être modifiée.
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Quantité réelle ({editEntry.unite})</label>
              <input type="number" min="0" step="0.001" value={editQty} onChange={(e) => setEditQty(e.target.value)}
                style={{ width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.92rem' }} />
            </div>
            <div style={{ marginBottom: 22 }}>
              <label style={labelStyle}>Note</label>
              <input type="text" value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="Observation..."
                style={{ width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.88rem' }} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setEditEntry(null)} style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: '0.9rem' }}>
                Annuler
              </button>
              <button onClick={handleEditSave} disabled={editSaving}
                style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem', opacity: editSaving ? 0.6 : 1 }}>
                {editSaving ? '...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
