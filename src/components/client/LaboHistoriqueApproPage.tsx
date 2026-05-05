import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  refFacture: string | null;
  fournisseurId: number | null;
  fournisseurNom: string | null;
}

interface LaboFournisseur { id: number; nom: string; telephone: string | null }
interface LaboIngredient { id: number; nom: string; unite: string; categorie: string; categorieId: number | null }

const labelStyle: React.CSSProperties = {
  fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4,
};

const dateLabelStyle: React.CSSProperties = {
  fontSize: '0.68rem', fontWeight: 800, color: '#0f766e',
  textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4,
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
    <div className="modal-overlay" onClick={onClose}>
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
    <div className="modal-overlay" onClick={onClose}>
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
  const { canWrite } = useAuth();
  const [searchParams] = useSearchParams();
  const laboId = searchParams.get('laboId');

  const [labo, setLabo] = useState<Labo | null>(null);
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
  const toggleSelectAll = () => {
    if (selectedIds.size === results.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(results.map((r) => r.id)));
  };

  useEffect(() => {
    if (!laboId) return;
    api.get(`/api/labo/${laboId}`).then(({ data }) => setLabo(data)).catch(() => {});
    api.get(`/api/labo/${laboId}/fournisseurs`).then(({ data }) => setFournisseurs(data)).catch(() => {});
    api.get(`/api/labo/${laboId}/ingredients`).then(({ data }) => setLaboIngredients(
      (data as LaboIngredient[]).filter((i) => i.categorie !== undefined)
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

  const exportExcel = async () => {
    if (!laboId) return;
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (filterIngredientId) params.set('ingredientId', filterIngredientId);
    else if (filterCategorieId) params.set('categorieId', filterCategorieId);
    if (filterFournisseurId) params.set('fournisseurId', filterFournisseurId);
    if (filterRefFacture.trim()) params.set('refFacture', filterRefFacture.trim());
    if (selectedIds.size > 0) params.set('selectedIds', [...selectedIds].join(','));

    const { data } = await api.get(
      `/api/labo/${laboId}/historique/export-excel?${params}`,
      { responseType: 'blob' },
    );
    const url = URL.createObjectURL(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `historique-labo-${labo?.nom ?? 'appro'}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaved = (id: number, updated: Partial<HistEntry>) => {
    setResults((prev) => prev.map((r) => r.id === id ? { ...r, ...updated } : r));
  };

  const handleDeleted = (id: number) => {
    setResults((prev) => prev.filter((r) => r.id !== id));
  };

  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const pagedResults = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const unitTotals: Record<string, { qty: number; cost: number }> = {};
  for (const r of results) {
    if (!unitTotals[r.uniteNom]) unitTotals[r.uniteNom] = { qty: 0, cost: 0 };
    unitTotals[r.uniteNom].qty += r.quantite ?? 0;
    unitTotals[r.uniteNom].cost += (r.quantite ?? 0) * (r.prixUnitaire ?? 0);
  }

  const hasFilters = filterCategorieId || filterIngredientId || filterFournisseurId || filterRefFacture;

  if (!laboId) return <div className="page"><p className="text-muted">Labo non spécifié.</p></div>;

  return (
    <div className="page">
      {/* ── Hero header ───────────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #134e4a 0%, #0f766e 55%, #0d9488 100%)',
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(15,118,110,0.28)',
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
            {labo?.franchiseGroup
              ? `Franchise : ${labo.franchiseGroup} · ${currentYear}`
              : `Labo — consultation et export des approvisionnements ${currentYear}`}
          </p>
        </div>
      </div>

      {/* ── Filter/toolbar bar ─────────────────────────────────────────────── */}
      <div style={{
        background: 'var(--surface)', borderRadius: 14, padding: '16px 20px',
        border: '1px solid var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
        marginBottom: 24,
      }}>
        {/* Panel header */}
        <div style={{
          paddingBottom: 12,
          marginBottom: 16,
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{ fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--text-muted)' }}>Filtres</span>
        </div>

        {/* Section 1: Produit */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 16, height: 2, background: 'var(--primary)', display: 'inline-block', borderRadius: 2 }} />
            Produit
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '12px 20px' }}>
            <div>
              <label style={labelStyle}>Catégorie</label>
              <select className="input" style={{ width: '100%' }} value={filterCategorieId}
                onChange={(e) => { setFilterCategorieId(e.target.value); setFilterIngredientId(''); }}>
                <option value="">— Toutes —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Ingrédient</label>
              <select className="input" style={{ width: '100%' }} value={filterIngredientId}
                disabled={!filterCategorieId}
                onChange={(e) => setFilterIngredientId(e.target.value)}>
                <option value="">— Tous —</option>
                {ingredientsInCat.map((i) => <option key={i.id} value={i.id}>{i.nom}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ marginBottom: 16, borderTop: '1px dashed var(--border)' }} />

        {/* Section 2: Période & Fournisseur */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 16, height: 2, background: '#7c3aed', display: 'inline-block', borderRadius: 2 }} />
            Période &amp; Fournisseur
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px 20px' }}>
            <div>
              <label style={dateLabelStyle}>Date début</label>
              <input type="date" className="input" style={{ width: '100%', border: '1.5px solid #0f766e', background: '#f0fdfa', fontWeight: 600 }} min={yearStart} max={yearEnd}
                value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label style={dateLabelStyle}>Date fin</label>
              <input type="date" className="input" style={{ width: '100%', border: '1.5px solid #0f766e', background: '#f0fdfa', fontWeight: 600 }} min={yearStart} max={yearEnd}
                value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            {fournisseurs.length > 0 && (
              <div>
                <label style={labelStyle}>Fournisseur</label>
                <select className="input" style={{ width: '100%' }} value={filterFournisseurId}
                  onChange={(e) => setFilterFournisseurId(e.target.value)}>
                  <option value="">— Tous —</option>
                  {fournisseurs.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
                </select>
              </div>
            )}
            <div>
              <label style={labelStyle}>Réf. Facture</label>
              <input type="text" className="input" style={{ width: '100%' }}
                placeholder="Rechercher réf…"
                value={filterRefFacture} onChange={(e) => setFilterRefFacture(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Actions footer */}
        <div style={{ paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          {hasFilters && (
            <button className="btn btn-ghost btn-sm"
              onClick={() => { setFilterCategorieId(''); setFilterIngredientId(''); setFilterFournisseurId(''); setFilterRefFacture(''); }}>
              ✕ Réinitialiser
            </button>
          )}
          <button
            onClick={fetchResults}
            disabled={loading}
            style={{
              background: 'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)',
              boxShadow: '0 4px 14px rgba(15,118,110,0.35)',
              borderRadius: 10, border: 'none', color: '#fff', fontWeight: 800,
              padding: '10px 26px', minWidth: 140,
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Chargement…' : '🔍 Rechercher'}
          </button>
          <button
            onClick={exportExcel}
            disabled={results.length === 0}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: results.length > 0 ? 'linear-gradient(135deg, #16a34a, #22c55e)' : 'var(--bg-secondary, #e5e7eb)',
              boxShadow: results.length > 0 ? '0 4px 14px rgba(22,163,74,0.35)' : 'none',
              borderRadius: 10, border: 'none',
              color: results.length > 0 ? '#fff' : 'var(--text-muted)',
              fontWeight: 800, padding: '10px 20px',
              cursor: results.length === 0 ? 'not-allowed' : 'pointer',
              opacity: results.length === 0 ? 0.55 : 1,
              transition: 'all 0.15s',
              minWidth: 180,
            }}
          >
            <span style={{ fontSize: '1rem' }}>📊</span>
            {selectedIds.size > 0 ? `Générer (${selectedIds.size} sél.)` : 'Générer Hist. Appro'}
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
          {/* Totals per unit */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            {Object.entries(unitTotals).map(([unit, data]) => (
              <div key={unit} style={{
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
                padding: '10px 18px', textAlign: 'left', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 2 }}>{unit}</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#2563eb' }}>
                  {data.qty.toFixed(3)} <span style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-muted)' }}>{unit}</span>
                </div>
                <div style={{ fontSize: '0.82rem', color: '#15803d', fontWeight: 600 }}>{data.cost.toFixed(3)} DT</div>
              </div>
            ))}
          </div>

          <div className="card" style={{ overflowX: 'hidden' }}>
            <table className="table" style={{ tableLayout: 'fixed', width: '100%' }}>
              <colgroup>
                <col style={{ width: '36px' }} />
                <col style={{ width: '110px' }} />
                <col />
                <col style={{ width: '100px' }} />
                <col style={{ width: '85px' }} />
                <col style={{ width: '130px' }} />
                <col style={{ width: '66px' }} />
              </colgroup>
              <thead>
                <tr style={{ background: '#f0fdfa', borderBottom: '2px solid #0f766e', color: '#134e4a' }}>
                  <th style={{ textAlign: 'center', padding: '0 4px', fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    <input
                      type="checkbox"
                      checked={results.length > 0 && selectedIds.size === results.length}
                      onChange={toggleSelectAll}
                      title="Tout sélectionner"
                      style={{ cursor: 'pointer', accentColor: 'var(--primary)' }}
                    />
                  </th>
                  <th style={{ fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '12px 14px' }}>Date</th>
                  <th style={{ fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '12px 14px' }}>Ingrédient</th>
                  <th style={{ textAlign: 'right', fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '12px 14px' }}>Quantité</th>
                  <th style={{ textAlign: 'right', fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '12px 14px' }}>Prix/DT</th>
                  <th style={{ fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '12px 14px' }}>Fourn. / Réf</th>
                  <th style={{ padding: '12px 14px' }}></th>
                </tr>
              </thead>
              <tbody>
                {pagedResults.map((r) => {
                  const isSelected = selectedIds.has(r.id);
                  return (
                  <tr key={r.id} style={isSelected ? { background: 'linear-gradient(90deg, #fef3c7, #fffbeb)', borderLeft: '3px solid #f59e0b' } : undefined}>
                    <td style={{ textAlign: 'center', padding: '0 4px' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(r.id)}
                        style={{ cursor: 'pointer', accentColor: '#ea580c' }}
                      />
                    </td>
                    <td>
                      <span style={{ background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 7, padding: '3px 10px', fontWeight: 700, fontSize: '0.82rem', color: '#0f766e', display: 'inline-block' }}>
                        {fmtDate(r.dateAppro)}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.ingredientNom}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.categorieNom}</div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: '#0f766e' }}>
                      <div>{r.quantite ?? '—'}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 400 }}>{r.uniteNom}</div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: r.prixUnitaire ? '#1d4ed8' : 'var(--text-muted)', fontSize: '0.88rem' }}>
                      {r.prixUnitaire !== null ? r.prixUnitaire.toFixed(3) : '—'}
                    </td>
                    <td style={{ fontSize: '0.78rem' }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.fournisseurNom ?? '—'}</div>
                      <div style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.refFacture ?? '—'}</div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setEditEntry(r)}
                        title="Modifier"
                        disabled={!canWrite}
                        style={{ marginRight: 2, fontSize: '0.8rem', padding: '2px 6px', opacity: canWrite ? 1 : 0.4 }}
                      >✏️</button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setDeleteEntry(r)}
                        title="Supprimer"
                        disabled={!canWrite}
                        style={{ fontSize: '0.8rem', color: '#dc2626', padding: '2px 6px', opacity: canWrite ? 1 : 0.4 }}
                      >🗑️</button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
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
