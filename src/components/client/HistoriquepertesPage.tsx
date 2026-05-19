import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Activite, HistoriquePerteEntry } from '../../types';

const currentYear = new Date().getFullYear();
const yearStart = `${currentYear}-01-01`;
const yearEnd = `${currentYear}-12-31`;

const fmtDate = (iso: string | null | undefined) => {
  if (!iso || iso.length < 10) return iso ?? '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

interface ScopedIngredient { id: number; nom: string; unite: string; categorie: string; categorieId: number | null }

// ── Edit modal ────────────────────────────────────────────────────────────────

interface EditPerteModalProps {
  entry: HistoriquePerteEntry;
  onSave: (id: number, quantite: number, typePerte: 'avarie' | 'dechet') => Promise<void>;
  onClose: () => void;
}

function EditPerteModal({ entry, onSave, onClose }: EditPerteModalProps) {
  const [qty, setQty] = useState(String(entry.quantite));
  const [type, setType] = useState<'avarie' | 'dechet'>(entry.typePerte);
  const [warned, setWarned] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const qtyChanged = parseFloat(qty) !== entry.quantite;

  const handleSave = async () => {
    if (!qty || parseFloat(qty) <= 0) { setError('Quantité invalide'); return; }
    if (qtyChanged && !warned) { setWarned(true); return; }
    setSaving(true);
    setError('');
    try {
      await onSave(entry.id, parseFloat(qty), type);
      onClose();
    } catch {
      setError('Erreur lors de la sauvegarde');
    }
    setSaving(false);
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header" style={{ background: 'linear-gradient(135deg, #991b1b, #dc2626)', borderBottom: 'none' }}>
          <h2 style={{ color: '#fff', margin: 0, fontSize: '1rem' }}>✏️ Modifier la perte</h2>
          <button className="modal-close" onClick={onClose} style={{ color: '#fff' }}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.9rem' }}>{entry.ingredientNom}</p>

          {/* Readonly info row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Date de perte</label>
              <input type="date" className="input" style={{ width: '100%', background: 'var(--surface-alt, #f9fafb)', color: 'var(--text-muted)' }}
                value={entry.datePerte} disabled />
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Prix unitaire</label>
              <input type="text" className="input" style={{ width: '100%', background: 'var(--surface-alt, #f9fafb)', color: 'var(--text-muted)' }}
                value={entry.prixUnitaire != null ? `${entry.prixUnitaire.toFixed(3)} DT` : '—'} disabled />
            </div>
          </div>

          {warned && (
            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '10px 14px', fontSize: '0.85rem', color: '#c2410c' }}>
              ⚠️ <strong>Attention :</strong> modifier la quantité impacte le calcul du stock actuel. Confirmer ?
            </div>
          )}

          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Quantité</label>
            <input
              type="number" min="0.001" step="0.001" className="input" style={{ width: '100%' }}
              value={qty} onChange={(e) => { setQty(e.target.value); setWarned(false); }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Type de perte</label>
            <select className="input" style={{ width: '100%' }} value={type} onChange={(e) => setType(e.target.value as 'avarie' | 'dechet')}>
              <option value="avarie">Avarie</option>
              <option value="dechet">Déchet</option>
            </select>
          </div>
          {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</p>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
          <button
            className="btn btn-sm" onClick={handleSave} disabled={saving}
            style={{ background: warned ? '#c2410c' : '#dc2626', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700 }}
          >
            {saving ? '…' : warned ? '⚠️ Confirmer quand même' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete confirm modal ──────────────────────────────────────────────────────

interface DeletePerteModalProps {
  entry: HistoriquePerteEntry;
  onConfirm: (id: number) => Promise<void>;
  onClose: () => void;
}

function DeletePerteModal({ entry, onConfirm, onClose }: DeletePerteModalProps) {
  const [saving, setSaving] = useState(false);

  const handleDelete = async () => {
    setSaving(true);
    try { await onConfirm(entry.id); onClose(); } catch { /* ignore */ }
    setSaving(false);
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header" style={{ background: 'linear-gradient(135deg, #7f1d1d, #b91c1c)', borderBottom: 'none' }}>
          <h2 style={{ color: '#fff', margin: 0, fontSize: '1rem' }}>🗑️ Supprimer la perte</h2>
          <button className="modal-close" onClick={onClose} style={{ color: '#fff' }}>×</button>
        </div>
        <div className="modal-body">
          <p style={{ fontWeight: 600, marginBottom: 10 }}>{entry.ingredientNom} — {fmtDate(entry.datePerte)}</p>
          <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 8, padding: '10px 14px', fontSize: '0.85rem', color: '#9f1239' }}>
            ⚠️ <strong>Attention :</strong> supprimer cette perte recalculera le stock actuel. Cette action est <strong>irréversible</strong>.
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
          <button
            className="btn btn-sm" onClick={handleDelete} disabled={saving}
            style={{ background: '#b91c1c', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700 }}
          >
            {saving ? '…' : 'Supprimer définitivement'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function HistoriquepertesPage() {
  const { user, canWrite } = useAuth();
  const [searchParams] = useSearchParams();
  const isEntreprise = true;
  const type = searchParams.get('type');
  const urlActiviteId = searchParams.get('activiteId') || '';
  const isGerant = user?.role === 'gerant';
  const isActiviteGerant = isGerant && !!urlActiviteId;

  // Data
  const [entries, setEntries] = useState<HistoriquePerteEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [activites, setActivites] = useState<Activite[]>([]);
  const [scopedIngredients, setScopedIngredients] = useState<ScopedIngredient[]>([]);

  // Filters
  const [fActiviteId, setFActiviteId] = useState(urlActiviteId);
  const [fCategorie, setFCategorie] = useState('');
  const [fIngredient, setFIngredient] = useState('');
  const [fDateDebut, setFDateDebut] = useState(yearStart);
  const [fDateFin, setFDateFin] = useState(yearEnd);
  const [fType, setFType] = useState('');

  const categories = Array.from(
    new Map(scopedIngredients.filter((i) => i.categorieId !== null).map((i) => [i.categorieId, { id: i.categorieId as number, nom: i.categorie }])).values()
  );
  const ingredientsInCat = fCategorie ? scopedIngredients.filter((i) => String(i.categorieId) === fCategorie) : [];

  // Selection
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Modals
  const [editModal, setEditModal] = useState<HistoriquePerteEntry | null>(null);
  const [deleteModal, setDeleteModal] = useState<HistoriquePerteEntry | null>(null);

  // Excel export
  const [exporting, setExporting] = useState(false);

  // Load activités for entreprise
  useEffect(() => {
    api.get('/api/entreprise/activites')
      .then(({ data }) => {
        const all = data as Activite[];
        setActivites(all);
      }).catch(() => {});
  }, [isEntreprise, type]);

  // Load scoped ingredients based on context
  useEffect(() => {
    setFCategorie('');
    setFIngredient('');
    if (fActiviteId) {
      api.get(`/api/entreprise/activites/${fActiviteId}/selected-ingredients`)
        .then(({ data }) => setScopedIngredients(data as ScopedIngredient[]))
        .catch(() => {});
    } else {
      const typeParam = type ? `?type=${type}` : '';
      api.get(`/api/entreprise/activites/selected-ingredients${typeParam}`)
        .then(({ data }) => setScopedIngredients(data as ScopedIngredient[]))
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEntreprise, fActiviteId, type]);

  const [searched, setSearched] = useState(false);

  const loadPertes = useCallback(async () => {
    setLoading(true);
    setSearched(true);
    setSelected(new Set());
    try {
      const params = new URLSearchParams();
      if (fDateDebut) params.set('dateDebut', fDateDebut);
      if (fDateFin) params.set('dateFin', fDateFin);
      if (fType) params.set('typePerte', fType);
      if (fCategorie) params.set('categorieId', fCategorie);
      if (fIngredient) params.set('ingredientId', fIngredient);
      if (isEntreprise && fActiviteId) params.set('activiteId', fActiviteId);

      const url = isEntreprise
        ? `/api/entreprise/pertes?${params}`
        : `/api/stock/client/pertes?${params}`;
      const { data } = await api.get(url);
      setEntries(data as HistoriquePerteEntry[]);
    } catch { /* ignore */ }
    setLoading(false);
  }, [isEntreprise, fActiviteId, fDateDebut, fDateFin, fType, fCategorie, fIngredient]);


  const totalQty = entries.reduce((s, e) => s + e.quantite, 0);
  const totalCout = entries.reduce((s, e) => s + (e.prixUnitaire != null ? e.quantite * e.prixUnitaire : 0), 0);
  const hasCout = entries.some((e) => e.prixUnitaire != null);


  const resetFilters = () => {
    setFActiviteId(''); setFCategorie(''); setFIngredient('');
    setFDateDebut(yearStart); setFDateFin(yearEnd); setFType('');
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const buildPertesParams = () => {
    const params = new URLSearchParams();
    if (fDateDebut) params.set('dateDebut', fDateDebut);
    if (fDateFin) params.set('dateFin', fDateFin);
    if (fType) params.set('typePerte', fType);
    if (fCategorie) params.set('categorieId', fCategorie);
    if (fIngredient) params.set('ingredientId', fIngredient);
    if (isEntreprise && fActiviteId) params.set('activiteId', fActiviteId);
    if (selected.size > 0) params.set('selectedIds', [...selected].join(','));
    return params;
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = buildPertesParams();
      const url = isEntreprise
        ? `/api/entreprise/pertes/export-excel?${params}`
        : `/api/stock/client/pertes/export-excel?${params}`;
      const { data } = await api.get(url, { responseType: 'blob' });
      const blobUrl = URL.createObjectURL(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a'); a.href = blobUrl;
      a.download = `historique-pertes-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click(); URL.revokeObjectURL(blobUrl);
    } catch { /* ignore */ }
    setExporting(false);
  };

  const [exportingPdf, setExportingPdf] = useState(false);
  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      const params = buildPertesParams();
      const url = isEntreprise
        ? `/api/entreprise/pertes/export-pdf?${params}`
        : `/api/stock/client/pertes/export-pdf?${params}`;
      const { data } = await api.get(url, { responseType: 'blob' });
      const blobUrl = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
      const a = document.createElement('a'); a.href = blobUrl;
      a.download = `historique-pertes-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click(); URL.revokeObjectURL(blobUrl);
    } catch { /* ignore */ }
    setExportingPdf(false);
  };

  const handleUpdate = async (id: number, quantite: number, typePerte: 'avarie' | 'dechet') => {
    const url = isEntreprise ? `/api/entreprise/pertes/${id}` : `/api/stock/client/pertes/${id}`;
    await api.put(url, { quantite, typePerte });
    await loadPertes();
  };

  const handleDelete = async (id: number) => {
    const url = isEntreprise ? `/api/entreprise/pertes/${id}` : `/api/stock/client/pertes/${id}`;
    await api.delete(url);
    await loadPertes();
  };

  const pageTitle = 'Historique Pertes';

  return (
    <div className="page-content">
      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 55%, #ef4444 100%)',
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(153,27,27,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>📉</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>{pageTitle}</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>Historique complet des pertes et avaries</p>
        </div>
      </div>

      {/* Activité selector pills */}
      {isEntreprise && !isActiviteGerant && activites.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, padding: '10px 14px', background: 'var(--card-bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
          <button onClick={() => setFActiviteId('')} style={{ padding: '4px 14px', borderRadius: 20, cursor: 'pointer', fontSize: '0.82rem', border: !fActiviteId ? '1.5px solid #991b1b' : '1.5px solid var(--border)', background: !fActiviteId ? '#991b1b' : 'var(--bg)', color: !fActiviteId ? '#fff' : 'var(--text)', fontWeight: !fActiviteId ? 700 : 400 }}>Toutes</button>
          {activites.map((a) => (
            <button key={a.id} onClick={() => setFActiviteId(String(a.id))} style={{ padding: '4px 14px', borderRadius: 20, cursor: 'pointer', fontSize: '0.82rem', border: fActiviteId === String(a.id) ? '1.5px solid #991b1b' : '1.5px solid var(--border)', background: fActiviteId === String(a.id) ? '#991b1b' : 'var(--bg)', color: fActiviteId === String(a.id) ? '#fff' : 'var(--text)', fontWeight: fActiviteId === String(a.id) ? 700 : 400 }}>🏪 {a.nom}</button>
          ))}
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', alignSelf: 'center', marginLeft: 4 }}>← sélectionner l'activité</span>
        </div>
      )}

      {/* Filter panel */}
      <div style={{
        background: 'var(--surface)', borderRadius: 14, padding: '12px 16px', marginBottom: 24,
        border: '1px solid var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end', justifyContent: 'center', marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: '0.62rem', fontWeight: 700, color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>📅 Du</label>
            <input type="date" style={{ padding: '6px 10px', borderRadius: 7, border: '1.5px solid #991b1b', fontSize: '0.82rem', background: '#fff5f5', fontWeight: 600 }} value={fDateDebut} onChange={(e) => setFDateDebut(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: '0.62rem', fontWeight: 700, color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>📅 Au</label>
            <input type="date" style={{ padding: '6px 10px', borderRadius: 7, border: '1.5px solid #991b1b', fontSize: '0.82rem', background: '#fff5f5', fontWeight: 600 }} value={fDateFin} onChange={(e) => setFDateFin(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>🏷️ Catégorie</label>
            <select style={{ padding: '6px 10px', borderRadius: 7, border: '1.5px solid var(--border)', fontSize: '0.82rem', background: 'var(--background)', minWidth: 130 }} value={fCategorie} onChange={(e) => { setFCategorie(e.target.value); setFIngredient(''); }}>
              <option value="">— Toutes —</option>
              {categories.map((c) => <option key={c.id} value={String(c.id)}>{c.nom}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>🧂 Ingrédient</label>
            <select style={{ padding: '6px 10px', borderRadius: 7, border: '1.5px solid var(--border)', fontSize: '0.82rem', background: 'var(--background)', minWidth: 130 }} value={fIngredient} onChange={(e) => setFIngredient(e.target.value)} disabled={!fCategorie}>
              <option value="">— Tous —</option>
              {ingredientsInCat.map((i) => <option key={i.id} value={String(i.id)}>{i.nom}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>📋 Type</label>
            <select style={{ padding: '6px 10px', borderRadius: 7, border: '1.5px solid var(--border)', fontSize: '0.82rem', background: 'var(--background)', minWidth: 110 }} value={fType} onChange={(e) => setFType(e.target.value)}>
              <option value="">— Tous —</option>
              <option value="avarie">Avarie</option>
              <option value="dechet">Déchet</option>
            </select>
          </div>
          <button onClick={resetFilters} style={{ alignSelf: 'flex-end', marginLeft: 'auto', background: 'transparent', border: '1.5px solid var(--border)', borderRadius: 7, padding: '5px 9px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1, fontWeight: 700 }} title="Réinitialiser">✕</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={loadPertes} disabled={loading}
            style={{ background: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)', boxShadow: '0 4px 14px rgba(153,27,27,0.35)', borderRadius: 9, border: 'none', color: '#fff', fontWeight: 800, padding: '8px 20px', cursor: 'pointer', opacity: loading ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            🔍 {loading ? 'Chargement…' : 'Rechercher'}
          </button>
          <button onClick={handleExport} disabled={exporting || !searched || entries.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: (searched && entries.length > 0) ? 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)' : '#e5e7eb', boxShadow: (searched && entries.length > 0) ? '0 4px 14px rgba(153,27,27,0.3)' : 'none', borderRadius: 9, border: 'none', color: (searched && entries.length > 0) ? '#fff' : 'var(--text-muted)', fontWeight: 800, padding: '8px 18px', cursor: (!searched || entries.length === 0) ? 'not-allowed' : 'pointer', opacity: (!searched || entries.length === 0) ? 0.55 : 1, transition: 'all 0.15s' }}>
            <span>📊</span> Exporter{selected.size > 0 ? ` (${selected.size})` : ''}
          </button>
          <button onClick={handleExportPdf} disabled={exportingPdf || !searched || entries.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: (searched && entries.length > 0) ? 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)' : '#e5e7eb', boxShadow: (searched && entries.length > 0) ? '0 4px 14px rgba(153,27,27,0.3)' : 'none', borderRadius: 9, border: 'none', color: (searched && entries.length > 0) ? '#fff' : 'var(--text-muted)', fontWeight: 800, padding: '8px 18px', cursor: (!searched || entries.length === 0) ? 'not-allowed' : 'pointer', opacity: (!searched || entries.length === 0) ? 0.55 : 1, transition: 'all 0.15s' }}>
            <span>🔴</span> {exportingPdf ? '…' : 'PDF'}
          </button>
        </div>
      </div>

      {/* Table & results — only after search */}
      {!searched ? null : <>
      {/* Action bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {selected.size > 0 && (
            <span style={{ fontSize: '0.82rem', color: '#b91c1c', fontWeight: 700 }}>
              {selected.size} sélectionné{selected.size > 1 ? 's' : ''}
            </span>
          )}
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            {entries.length} résultat{entries.length !== 1 ? 's' : ''}
          </span>
        </div>
        {entries.length > 0 && (
          <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 10, padding: '6px 16px', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: '0.78rem', color: '#9f1239', fontWeight: 700 }}>Total quantité</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 900, color: '#b91c1c' }}>{totalQty.toFixed(3)}</span>
            </div>
            {hasCout && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: '0.78rem', color: '#9f1239', fontWeight: 700 }}>Coût total</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 900, color: '#c2410c' }}>{totalCout.toFixed(3)} DT</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-muted" style={{ textAlign: 'center', padding: '40px 0' }}>Chargement…</p>
      ) : entries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>📉</div>
          <p>Aucune perte enregistrée pour ces critères.</p>
        </div>
      ) : (
        <div className="table-responsive th-blue" style={{ borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 16px rgba(0,0,0,0.07)' }}>
          <table className="table" style={{ minWidth: 700 }}>
            <thead>
              <tr style={{ background: '#7f1d1d' }}>
                <th style={{ width: 32, textAlign: 'center' }} />
                {isEntreprise && <th>Activité</th>}
                <th>Ingrédient</th>
                <th>Date</th>
                <th>Type</th>
                <th style={{ textAlign: 'right' }}>Quantité</th>
                <th style={{ textAlign: 'right' }}>Prix Unit.</th>
                <th style={{ textAlign: 'right' }}>Coût Total</th>
                <th>Par</th>
                {canWrite && <th style={{ textAlign: 'center' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => {
                const isSelected = selected.has(entry.id);
                const isAvarie = entry.typePerte === 'avarie';
                const rowBg = isSelected
                  ? (isAvarie ? '#fee2e2' : '#ffedd5')
                  : (i % 2 === 0 ? 'var(--surface)' : '#fff5f5');
                return (
                  <tr key={entry.id} style={{ background: rowBg, cursor: 'pointer' }} onClick={() => toggleSelect(entry.id)}>
                    <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(entry.id)} style={{ cursor: 'pointer', accentColor: '#991b1b' }} />
                    </td>
                    {isEntreprise && <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{entry.activiteNom ?? '—'}</td>}
                    <td>
                      <div style={{ fontWeight: 700, fontSize: '0.86rem' }}>{entry.ingredientNom}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{entry.uniteNom} · {entry.categorieNom ?? '—'}</div>
                    </td>
                    <td style={{ fontWeight: 600, color: '#b91c1c', whiteSpace: 'nowrap', fontSize: '0.85rem' }}>{fmtDate(entry.datePerte)}</td>
                    <td>
                      <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700, background: isAvarie ? '#fee2e2' : '#ffedd5', color: isAvarie ? '#991b1b' : '#c2410c', border: `1px solid ${isAvarie ? '#fca5a5' : '#fed7aa'}` }}>
                        {isAvarie ? 'Avarie' : 'Déchet'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#991b1b' }}>
                      {entry.quantite.toFixed(3)}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      {entry.prixUnitaire != null ? entry.prixUnitaire.toFixed(3) : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#c2410c', fontSize: '0.85rem' }}>
                      {entry.prixUnitaire != null ? (entry.quantite * entry.prixUnitaire).toFixed(3) : '—'}
                    </td>
                    <td style={{ fontSize: '0.72rem', color: '#7c3aed', fontWeight: 600 }}>
                      {entry.createdByNom ? `👤 ${entry.createdByNom}` : '—'}
                    </td>
                    {canWrite && (
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                        {(!isGerant || entry.createdBy === user?.id) && (<>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ marginRight: 4, fontSize: '0.85rem' }}
                            onClick={() => setEditModal(entry)}
                            title="Modifier"
                          >✏️</button>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ fontSize: '0.85rem', color: '#b91c1c' }}
                            onClick={() => setDeleteModal(entry)}
                            title="Supprimer"
                          >🗑️</button>
                        </>)}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: '#fef2f2', borderTop: '2px solid #fecaca' }}>
                <td colSpan={isEntreprise ? (canWrite ? 5 : 4) : (canWrite ? 4 : 3)} />
                <td style={{ textAlign: 'right', fontWeight: 900, color: '#b91c1c', fontSize: '0.95rem' }}>{totalQty.toFixed(3)}</td>
                <td style={{ fontWeight: 700, fontSize: '0.75rem', color: '#9f1239', textTransform: 'uppercase' }}>Total</td>
                <td />
                <td style={{ textAlign: 'right', fontWeight: 900, color: '#c2410c', fontSize: '0.95rem' }}>
                  {hasCout ? totalCout.toFixed(3) : '—'}
                </td>
                {canWrite && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      </>}

      {/* Edit modal */}
      {editModal && (
        <EditPerteModal
          entry={editModal}
          onSave={handleUpdate}
          onClose={() => setEditModal(null)}
        />
      )}

      {/* Delete modal */}
      {deleteModal && (
        <DeletePerteModal
          entry={deleteModal}
          onConfirm={handleDelete}
          onClose={() => setDeleteModal(null)}
        />
      )}
    </div>
  );
}
