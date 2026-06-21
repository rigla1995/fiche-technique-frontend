import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Labo } from '../../types';

const currentYear = new Date().getFullYear();
const yearStart = `${currentYear}-01-01`;
const yearEnd = `${currentYear}-12-31`;

const PAGE_SIZE = 10;

const fmtDate = (iso: string | null | undefined) => {
  if (!iso || iso.length < 10) return iso ?? '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

interface HistEntry {
  id: number;
  ingredientId: number;
  ingredientNom: string;
  uniteNom: string;
  categorieNom: string;
  dateAppro: string;
  quantite: number | null;
  prixUnitaire: number | null;
  tauxTva: number | null;
  prixUnitaireTva: number | null;
  refFacture: string | null;
  typeAppro: string | null;
  fournisseurId: number | null;
  fournisseurNom: string | null;
  createdBy?: number | null;
  createdByNom?: string | null;
}

interface LaboFournisseur { id: number; nom: string; telephone: string | null }
interface LaboIngredient { id: number; nom: string; unite: string; categorie: string; categorieId: number | null; selected?: boolean }

const labelStyle: React.CSSProperties = {
  fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4,
};


const warningBanner = (
  <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: '0.82rem', color: '#92400e', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
    <span>⚠️</span>
    <span>Cette action modifiera les valeurs du <strong>stock labo</strong>. Assurez-vous que les données sont correctes avant de confirmer.</span>
  </div>
);

// ── Edit modal ─────────────────────────────────────────────────────────────────
function EditModal({
  entry,
  fournisseurs,
  laboId,
  onSaved,
  onClose,
}: {
  entry: HistEntry;
  fournisseurs: LaboFournisseur[];
  laboId: string;
  onSaved: (updated: Partial<HistEntry>) => void;
  onClose: () => void;
}) {
  const [qty, setQty] = useState(entry.quantite !== null ? String(entry.quantite) : '');
  const [prix, setPrix] = useState(entry.prixUnitaire !== null ? String(entry.prixUnitaire) : '');
  const [fId, setFId] = useState(entry.fournisseurId ? String(entry.fournisseurId) : '');
  const [ref, setRef] = useState(entry.refFacture ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const { data } = await api.put(`/api/labo/${laboId}/historique/${entry.id}`, {
        quantite: qty ? parseFloat(qty) : null,
        prixUnitaire: prix ? parseFloat(prix) : null,
        fournisseurId: fId ? Number(fId) : null,
        refFacture: ref.trim() || null,
      });
      onSaved({
        quantite: data.quantite,
        prixUnitaire: data.prixUnitaire,
        fournisseurId: data.fournisseurId,
        fournisseurNom: fournisseurs.find((f) => f.id === data.fournisseurId)?.nom ?? null,
        refFacture: data.refFacture,
      });
      onClose();
    } catch {
      setError('Erreur lors de la sauvegarde');
    }
    setSaving(false);
  };

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header" style={{ background: 'linear-gradient(135deg, #134e4a, #0f766e)', borderBottom: 'none' }}>
          <h2 style={{ color: '#fff', margin: 0 }}>Modifier — {entry.ingredientNom}</h2>
          <button className="modal-close" onClick={onClose} style={{ color: '#fff' }}>✕</button>
        </div>
        <div className="modal-body">
          {warningBanner}
          <div style={{ marginBottom: 10, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Date : <strong>{fmtDate(entry.dateAppro)}</strong> — {entry.uniteNom}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Quantité ({entry.uniteNom})</label>
              <input className="input" type="number" min="0" step="0.001" value={qty}
                onChange={(e) => setQty(e.target.value)} style={{ width: '100%' }} />
            </div>
            <div>
              <label style={labelStyle}>Prix unitaire (DT)</label>
              <input className="input" type="number" min="0" step="0.001" value={prix}
                onChange={(e) => setPrix(e.target.value)} style={{ width: '100%' }} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Fournisseur</label>
            <select className="input" style={{ width: '100%' }} value={fId} onChange={(e) => setFId(e.target.value)}>
              <option value="">— Aucun —</option>
              {fournisseurs.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Réf. Facture / BL</label>
            <input className="input" type="text" value={ref} onChange={(e) => setRef(e.target.value)}
              placeholder="N° facture ou BL" style={{ width: '100%' }} />
          </div>
          {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: 8 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Annuler</button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ background: 'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)', boxShadow: '0 4px 14px rgba(15,118,110,0.35)', borderRadius: 10, border: 'none', color: '#fff', fontWeight: 800, padding: '10px 26px', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
            >
              {saving ? '…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Delete modal ───────────────────────────────────────────────────────────────
function DeleteModal({
  entry,
  laboId,
  onDeleted,
  onClose,
}: {
  entry: HistEntry;
  laboId: string;
  onDeleted: (id: number) => void;
  onClose: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    setDeleting(true);
    setError('');
    try {
      await api.delete(`/api/labo/${laboId}/historique/${entry.id}`);
      onDeleted(entry.id);
      onClose();
    } catch {
      setError('Erreur lors de la suppression');
    }
    setDeleting(false);
  };

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header" style={{ background: '#fee2e2', borderBottom: '1px solid #fecaca' }}>
          <h2 style={{ color: '#991b1b' }}>Supprimer l'appro</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {warningBanner}
          <p style={{ marginBottom: 12 }}>
            Supprimer l'appro du <strong>{fmtDate(entry.dateAppro)}</strong> pour <strong>{entry.ingredientNom}</strong>{' '}
            ({entry.quantite} {entry.uniteNom}) ?
          </p>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 16 }}>
            Cette entrée sera définitivement supprimée et le stock labo sera recalculé en conséquence.
          </p>
          {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: 8 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={onClose} disabled={deleting}>Annuler</button>
            <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}
              style={{ background: '#dc2626', color: '#fff', border: 'none' }}>
              {deleting ? '…' : 'Supprimer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function LaboHistoriqueApproPage() {
  const { canWrite, user } = useAuth();
  const isGerant = user?.role === 'gerant';
  const [searchParams] = useSearchParams();
  const laboId = searchParams.get('laboId');
  const navigate = useNavigate();

  const [labo, setLabo] = useState<Labo | null>(null);
  const [allLabos, setAllLabos] = useState<Labo[]>([]);
  const [fournisseurs, setFournisseurs] = useState<LaboFournisseur[]>([]);
  const [laboIngredients, setLaboIngredients] = useState<LaboIngredient[]>([]);

  const [results, setResults] = useState<HistEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Filters
  const [startDate, setStartDate] = useState(yearStart);
  const [endDate, setEndDate] = useState(yearEnd);
  const [filterCategorieId, setFilterCategorieId] = useState('');
  const [filterIngredientId, setFilterIngredientId] = useState('');
  const [filterFournisseurId, setFilterFournisseurId] = useState('');
  const [filterRefFacture, setFilterRefFacture] = useState('');

  const [editEntry, setEditEntry] = useState<HistEntry | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<HistEntry | null>(null);

  const toggleSelect = (id: number) => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  useEffect(() => {
    api.get('/api/labo').then(({ data }) => setAllLabos(data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!laboId) return;
    api.get(`/api/labo/${laboId}`).then(({ data }) => setLabo(data)).catch(() => {});
    api.get(`/api/labo/${laboId}/fournisseurs`).then(({ data }) => setFournisseurs(data)).catch(() => {});
    api.get(`/api/labo/${laboId}/ingredients`).then(({ data }) => setLaboIngredients(
      (data as LaboIngredient[]).filter((i) => i.selected !== false)
    )).catch(() => {});
  }, [laboId]);

  // Derived: unique categories from labo ingredients
  const categories = Array.from(
    new Map(
      laboIngredients
        .filter((i) => i.categorieId !== null)
        .map((i) => [i.categorieId, { id: i.categorieId as number, nom: i.categorie }])
    ).values()
  ).sort((a, b) => a.nom.localeCompare(b.nom));

  // Ingredients filtered by selected category
  const ingredientsInCat = filterCategorieId
    ? laboIngredients.filter((i) => String(i.categorieId) === filterCategorieId)
    : laboIngredients;

  const fetchResults = useCallback(async () => {
    if (!laboId) return;
    setLoading(true);
    setSearched(true);
    setPage(1);
    setSelectedIds(new Set());
    try {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (filterIngredientId) params.set('ingredientId', filterIngredientId);
      else if (filterCategorieId) params.set('categorieId', filterCategorieId);
      if (filterFournisseurId) params.set('fournisseurId', filterFournisseurId);
      if (filterRefFacture.trim()) params.set('refFacture', filterRefFacture.trim());
      const { data } = await api.get(`/api/labo/${laboId}/historique?${params}`);
      setResults(data as HistEntry[]);
    } catch {
      setResults([]);
    }
    setLoading(false);
  }, [laboId, startDate, endDate, filterIngredientId, filterCategorieId, filterFournisseurId, filterRefFacture]);

  const buildLaboApproParams = () => {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (filterIngredientId) params.set('ingredientId', filterIngredientId);
    else if (filterCategorieId) params.set('categorieId', filterCategorieId);
    if (filterFournisseurId) params.set('fournisseurId', filterFournisseurId);
    if (filterRefFacture.trim()) params.set('refFacture', filterRefFacture.trim());
    if (selectedIds.size > 0) params.set('selectedIds', [...selectedIds].join(','));
    return params;
  };

  const exportExcel = async () => {
    if (!laboId) return;
    const params = buildLaboApproParams();
    const { data } = await api.get(`/api/labo/${laboId}/historique/export-excel?${params}`, { responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a'); a.href = url;
    a.download = `historique-labo-${labo?.nom ?? 'appro'}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click(); URL.revokeObjectURL(url);
  };

  const [exportingPdf, setExportingPdf] = useState(false);
  const exportPdf = async () => {
    if (!laboId) return;
    setExportingPdf(true);
    try {
      const params = buildLaboApproParams();
      const { data } = await api.get(`/api/labo/${laboId}/historique/export-pdf?${params}`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
      const a = document.createElement('a'); a.href = url;
      a.download = `historique-labo-${labo?.nom ?? 'appro'}-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click(); URL.revokeObjectURL(url);
    } catch { /* ignore */ }
    setExportingPdf(false);
  };

  const handleSaved = (id: number, updated: Partial<HistEntry>) => {
    setResults((prev) => prev.map((r) => r.id === id ? { ...r, ...updated } : r));
  };

  const handleDeleted = (id: number) => {
    setResults((prev) => prev.filter((r) => r.id !== id));
  };

  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const pagedResults = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totalHT = results.reduce((s, r) => s + (r.quantite ?? 0) * (r.prixUnitaire ?? 0), 0);
  const totalTTC = results.reduce((s, r) => s + (r.quantite ?? 0) * (r.prixUnitaireTva ?? r.prixUnitaire ?? 0), 0);
  const unitQtyMap: Record<string, number> = {};
  for (const r of results) { unitQtyMap[r.uniteNom] = (unitQtyMap[r.uniteNom] || 0) + (r.quantite ?? 0); }
  if (!laboId) return <div className="page"><p className="text-muted">Labo non spécifié.</p></div>;

  return (
    <div className="page">
      {/* ── Hero header ───────────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #3b0764 0%, #7e22ce 55%, #a855f7 100%)',
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(126,34,206,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>📋</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>
              Historique Approvisionnement — {labo?.nom ?? '…'}
            </h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>
            Labo — consultation et export des approvisionnements
          </p>
        </div>
      </div>

      {/* ── Labo selector ─────────────────────────────────────────────────── */}
      {allLabos.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, padding: '10px 14px', background: 'var(--card-bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
          {allLabos.map((l) => (
            <button key={l.id} onClick={() => navigate(`/client/labo/historique-appro?laboId=${l.id}`)}
              style={{ padding: '4px 14px', borderRadius: 20, cursor: 'pointer', fontSize: '0.82rem',
                border: laboId === String(l.id) ? '1.5px solid #7e22ce' : '1.5px solid var(--border)',
                background: laboId === String(l.id) ? '#7e22ce' : 'var(--bg)',
                color: laboId === String(l.id) ? '#fff' : 'var(--text)',
                fontWeight: laboId === String(l.id) ? 700 : 400 }}>
              🏭 {l.nom}
            </button>
          ))}
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', alignSelf: 'center', marginLeft: 4 }}>← sélectionner le labo</span>
        </div>
      )}

      {/* ── Filter/toolbar bar ─────────────────────────────────────────────── */}
      <div style={{
        background: 'var(--surface)', borderRadius: 14, padding: '14px 18px',
        border: '1px solid var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
        marginBottom: 24,
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end', marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: '0.65rem', fontWeight: 800, color: '#7e22ce', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 3 }}>📅 Du</label>
            <input type="date" style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid #7e22ce', fontSize: '0.83rem', background: '#faf5ff', minWidth: 130, fontWeight: 600 }}
              value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: '0.65rem', fontWeight: 800, color: '#7e22ce', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 3 }}>📅 Au</label>
            <input type="date" style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid #7e22ce', fontSize: '0.83rem', background: '#faf5ff', minWidth: 130, fontWeight: 600 }}
              value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 3 }}>🏷️ Catégorie</label>
            <select style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: '0.83rem', background: 'var(--bg)', minWidth: 130 }} value={filterCategorieId}
              onChange={(e) => { setFilterCategorieId(e.target.value); setFilterIngredientId(''); }}>
              <option value="">— Toutes —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 3 }}>🧂 Article</label>
            <select style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: '0.83rem', background: 'var(--bg)', minWidth: 130 }} value={filterIngredientId}
              disabled={!filterCategorieId} onChange={(e) => setFilterIngredientId(e.target.value)}>
              <option value="">— Tous —</option>
              {ingredientsInCat.map((i) => <option key={i.id} value={i.id}>{i.nom}</option>)}
            </select>
          </div>
          {fournisseurs.length > 0 && (
            <div>
              <label style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 3 }}>🚚 Fourn.</label>
              <select style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: '0.83rem', background: 'var(--bg)', minWidth: 120 }} value={filterFournisseurId}
                onChange={(e) => setFilterFournisseurId(e.target.value)}>
                <option value="">— Tous —</option>
                {fournisseurs.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
              </select>
            </div>
          )}
          <div>
            <label style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 3 }}>🧾 Réf.</label>
            <input type="text" style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: '0.83rem', background: 'var(--bg)', minWidth: 110 }}
              placeholder="Rechercher réf…" value={filterRefFacture} onChange={(e) => setFilterRefFacture(e.target.value)} />
          </div>
          {(filterCategorieId || filterIngredientId || filterFournisseurId || filterRefFacture) && (
            <button onClick={() => { setFilterCategorieId(''); setFilterIngredientId(''); setFilterFournisseurId(''); setFilterRefFacture(''); }}
              style={{ alignSelf: 'flex-end', marginLeft: 'auto', background: 'transparent', border: '1.5px solid var(--border)', borderRadius: 7, padding: '5px 9px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1, fontWeight: 700 }}
              title="Réinitialiser">✕</button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={fetchResults} disabled={loading}
            style={{ background: 'linear-gradient(135deg, #3b0764 0%, #7e22ce 100%)', boxShadow: '0 4px 14px rgba(126,34,206,0.35)', borderRadius: 9, border: 'none', color: '#fff', fontWeight: 800, padding: '8px 20px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            🔍 {loading ? 'Chargement…' : 'Rechercher'}
          </button>
          <button onClick={exportExcel} disabled={results.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: results.length > 0 ? 'linear-gradient(135deg, #3b0764 0%, #7e22ce 100%)' : '#e5e7eb', boxShadow: results.length > 0 ? '0 4px 14px rgba(126,34,206,0.3)' : 'none', borderRadius: 9, border: 'none', color: results.length > 0 ? '#fff' : 'var(--text-muted)', fontWeight: 800, padding: '8px 18px', cursor: results.length === 0 ? 'not-allowed' : 'pointer', opacity: results.length === 0 ? 0.55 : 1, transition: 'all 0.15s' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><rect width="24" height="24" rx="3" fill="#217346"/><path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" fill="#185C37"/><path d="M14 2V8H20L14 2Z" fill="#107C41"/><text x="7" y="18" fill="white" fontSize="8" fontWeight="bold" fontFamily="Arial,sans-serif">XLS</text></svg>
            Exporter{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
          </button>
          <button onClick={exportPdf} disabled={exportingPdf || results.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: results.length > 0 ? 'linear-gradient(135deg, #3b0764 0%, #7e22ce 100%)' : '#e5e7eb', boxShadow: results.length > 0 ? '0 4px 14px rgba(126,34,206,0.3)' : 'none', borderRadius: 9, border: 'none', color: results.length > 0 ? '#fff' : 'var(--text-muted)', fontWeight: 800, padding: '8px 18px', cursor: (exportingPdf || results.length === 0) ? 'not-allowed' : 'pointer', opacity: (exportingPdf || results.length === 0) ? 0.55 : 1, transition: 'all 0.15s' }}>
            <span>🔴</span> {exportingPdf ? '…' : 'PDF'}
          </button>
        </div>
      </div>

      {/* Results */}
      {!searched ? (
        <div style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: '2rem', marginBottom: 10 }}>🔍</div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>Cliquez sur Rechercher pour afficher les approvisionnements.</p>
        </div>
      ) : loading ? (
        <p className="text-muted">Chargement…</p>
      ) : results.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📦</div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>Aucun approvisionnement trouvé pour cette période.</p>
        </div>
      ) : (
        <>
          <div className="card" style={{ overflowX: 'auto' }}>
            <table className="table" style={{ tableLayout: 'fixed', width: '100%', minWidth: 820 }}>
              <colgroup>
                <col style={{ width: '28px' }} />
                <col style={{ width: '175px' }} />
                <col style={{ width: '95px' }} />
                <col style={{ width: '72px' }} />
                <col style={{ width: '80px' }} />
                <col style={{ width: '88px' }} />
                <col style={{ width: '56px' }} />
                <col style={{ width: '88px' }} />
                <col style={{ width: '110px' }} />
                <col style={{ width: '54px' }} />
              </colgroup>
              <thead>
                <tr style={{ background: 'linear-gradient(135deg, #3b0764, #7e22ce)' }}>
                  <th style={{ width: 28, padding: '10px 4px', color: '#fff', background: 'transparent', borderBottom: 'none' }} />
                  {(['Article', 'Date', 'Type'] as const).map((label) => (
                    <th key={label} style={{ fontWeight: 800, fontSize: '0.75rem', letterSpacing: '0.04em', textTransform: 'uppercase', padding: '10px 10px', color: '#fff', background: 'transparent', borderBottom: 'none' }}>{label}</th>
                  ))}
                  {(['Quantité', 'Prix U. HT', 'TVA %', 'Prix U. TTC'] as const).map((label) => (
                    <th key={label} style={{ textAlign: 'right', fontWeight: 800, fontSize: '0.75rem', letterSpacing: '0.04em', textTransform: 'uppercase', padding: '10px 10px', color: '#fff', background: 'transparent', borderBottom: 'none' }}>{label}</th>
                  ))}
                  <th style={{ fontWeight: 800, fontSize: '0.75rem', letterSpacing: '0.04em', textTransform: 'uppercase', padding: '10px 10px', color: '#fff', background: 'transparent', borderBottom: 'none' }}>Fourn. / Réf</th>
                  <th style={{ fontWeight: 800, fontSize: '0.75rem', letterSpacing: '0.04em', textTransform: 'uppercase', padding: '10px 10px', color: '#fff', background: 'transparent', borderBottom: 'none' }}>Créé par</th>
                  <th style={{ padding: '10px 6px', color: '#fff', background: 'transparent', borderBottom: 'none' }}></th>
                </tr>
              </thead>
              <tbody>
                {pagedResults.map((r) => {
                  const isSelected = selectedIds.has(r.id);
                  return (
                  <tr key={r.id} style={{ background: isSelected ? 'linear-gradient(90deg, #fef3c7, #fffbeb)' : undefined, borderLeft: isSelected ? '3px solid #f59e0b' : undefined }}>
                    <td style={{ textAlign: 'center', padding: '8px 4px' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(r.id)}
                        style={{ cursor: 'pointer', accentColor: '#ea580c' }}
                      />
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.86rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.ingredientNom}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.uniteNom} · {r.categorieNom}</div>
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{ background: '#faf5ff', border: '1px solid #d8b4fe', borderRadius: 6, padding: '2px 8px', fontWeight: 700, fontSize: '0.8rem', color: '#7e22ce', display: 'inline-block', whiteSpace: 'nowrap' }}>
                        {fmtDate(r.dateAppro)}
                      </span>
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      {r.typeAppro === 'manuel' && (
                        <span style={{ background: '#dcfce7', color: '#15803d', borderRadius: 6, padding: '2px 6px', fontSize: '0.7rem', fontWeight: 700 }}>Manuel</span>
                      )}
                      {r.typeAppro === 'transfert' && (
                        <span style={{ background: '#e0f2fe', color: '#0369a1', borderRadius: 6, padding: '2px 6px', fontSize: '0.7rem', fontWeight: 700 }}>Transf.</span>
                      )}
                      {r.typeAppro && r.typeAppro !== 'manuel' && r.typeAppro !== 'transfert' && (
                        <span style={{ background: '#f3e8ff', color: '#7c3aed', borderRadius: 6, padding: '2px 6px', fontSize: '0.7rem', fontWeight: 700 }}>PT</span>
                      )}
                      {!r.typeAppro && <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: '#0f766e', padding: '8px 10px', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                      {r.quantite ?? '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: r.prixUnitaire ? '#1d4ed8' : 'var(--text-muted)', fontSize: '0.85rem', padding: '8px 10px', whiteSpace: 'nowrap' }}>
                      {r.prixUnitaire !== null ? `${r.prixUnitaire.toFixed(3)} DT` : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: '0.82rem', color: r.tauxTva != null ? '#6b7280' : 'var(--text-muted)', padding: '8px 10px', whiteSpace: 'nowrap' }}>
                      {r.tauxTva != null ? `${r.tauxTva}%` : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: r.prixUnitaireTva != null ? '#059669' : 'var(--text-muted)', fontSize: '0.85rem', padding: '8px 10px', whiteSpace: 'nowrap' }}>
                      {r.prixUnitaireTva != null ? `${r.prixUnitaireTva.toFixed(3)} DT` : '—'}
                    </td>
                    <td style={{ fontSize: '0.76rem', padding: '8px 10px' }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.fournisseurNom ?? '—'}</div>
                      <div style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.refFacture ?? '—'}</div>
                    </td>
                    <td style={{ fontSize: '0.73rem', color: r.createdByNom ? '#7c3aed' : 'var(--text-muted)', fontWeight: r.createdByNom ? 600 : 400, whiteSpace: 'nowrap', padding: '8px 10px' }}>
                      {r.createdByNom ? `👤 ${r.createdByNom}` : '—'}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right', padding: '8px 6px' }}>
                      {(!isGerant || r.createdBy === user?.id) && (<>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setEditEntry(r)}
                          title="Modifier"
                          disabled={!canWrite}
                          style={{ marginRight: 2, fontSize: '0.78rem', padding: '2px 5px', opacity: canWrite ? 1 : 0.4 }}
                        >✏️</button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setDeleteEntry(r)}
                          title="Supprimer"
                          disabled={!canWrite}
                          style={{ fontSize: '0.78rem', color: '#dc2626', padding: '2px 5px', opacity: canWrite ? 1 : 0.4 }}
                        >🗑️</button>
                      </>)}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f5f3ff', borderTop: '2px solid #7e22ce' }}>
                  <td colSpan={5} style={{ padding: '9px 10px', fontSize: '0.76rem', fontWeight: 800, color: '#3b0764', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Total — {results.length} enregistrement{results.length > 1 ? 's' : ''}
                  </td>
                  <td style={{ textAlign: 'right', padding: '9px 10px', fontWeight: 800, color: '#1d4ed8', fontSize: '0.84rem', whiteSpace: 'nowrap' }}>
                    {totalHT.toFixed(3)} DT
                  </td>
                  <td></td>
                  <td style={{ textAlign: 'right', padding: '9px 10px', fontWeight: 900, color: '#059669', fontSize: '0.86rem', whiteSpace: 'nowrap' }}>
                    {totalTTC.toFixed(3)} DT
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>

            <div style={{ padding: '8px 14px', fontSize: '0.78rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>
                {results.length} enregistrement{results.length > 1 ? 's' : ''}
                {selectedIds.size > 0 && (
                  <span style={{ marginLeft: 8, color: '#ea580c', fontWeight: 700 }}>
                    · {selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}
                  </span>
                )}
              </span>
              {totalPages > 1 && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button className="btn btn-ghost btn-sm" disabled={page === 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))} style={{ padding: '3px 10px', fontWeight: 700 }}>‹</button>
                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>{page} / {totalPages}</span>
                  <button className="btn btn-ghost btn-sm" disabled={page === totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))} style={{ padding: '3px 10px', fontWeight: 700 }}>›</button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Modals */}
      {editEntry && laboId && (
        <EditModal
          entry={editEntry}
          fournisseurs={fournisseurs}
          laboId={laboId}
          onSaved={(updated) => handleSaved(editEntry.id, updated)}
          onClose={() => setEditEntry(null)}
        />
      )}
      {deleteEntry && laboId && (
        <DeleteModal
          entry={deleteEntry}
          laboId={laboId}
          onDeleted={handleDeleted}
          onClose={() => setDeleteEntry(null)}
        />
      )}
    </div>
  );
}
