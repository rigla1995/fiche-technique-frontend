import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/client';
import HelpButton from '../common/HelpButton';
import HistoryFilterBar, { FilterField, FilterInput, FilterSelect } from '../common/HistoryFilterBar';
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
  const type = searchParams.get('type');
  const urlActiviteId = searchParams.get('activiteId') || '';
  const isGerant = user?.role === 'gerant';
  // Multi-affectations : sélecteur d'activité affiché pour le gérant.
  const isActiviteGerant = false;

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
  }, [type]);

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
  }, [fActiviteId, type]);

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
      if (fActiviteId) params.set('activiteId', fActiviteId);

      const url = `/api/entreprise/pertes?${params}`;
      const { data } = await api.get(url);
      setEntries(data as HistoriquePerteEntry[]);
    } catch { /* ignore */ }
    setLoading(false);
  }, [fActiviteId, fDateDebut, fDateFin, fType, fCategorie, fIngredient]);


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
    if (fActiviteId) params.set('activiteId', fActiviteId);
    if (selected.size > 0) params.set('selectedIds', [...selected].join(','));
    return params;
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = buildPertesParams();
      const url = `/api/entreprise/pertes/export-excel?${params}`;
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
      const url = `/api/entreprise/pertes/export-pdf?${params}`;
      const { data } = await api.get(url, { responseType: 'blob' });
      const blobUrl = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
      const a = document.createElement('a'); a.href = blobUrl;
      a.download = `historique-pertes-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click(); URL.revokeObjectURL(blobUrl);
    } catch { /* ignore */ }
    setExportingPdf(false);
  };

  const handleUpdate = async (id: number, quantite: number, typePerte: 'avarie' | 'dechet') => {
    const url = `/api/entreprise/pertes/${id}`;
    await api.put(url, { quantite, typePerte });
    await loadPertes();
  };

  const handleDelete = async (id: number) => {
    const url = `/api/entreprise/pertes/${id}`;
    await api.delete(url);
    await loadPertes();
  };

  const pageTitle = 'Historique Pertes';

  return (
    <div className="page-content">
      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 55%, #3b82f6 100%)',
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(30,64,175,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>📉</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>{pageTitle} <HelpButton section="pertes" variant="solid" size={18} tip="Aide" /></h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>Historique complet des pertes et avaries</p>
        </div>
      </div>

      {/* Activité selector pills */}
      {activites.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, padding: '10px 14px', background: 'var(--card-bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
          {!isActiviteGerant && <button onClick={() => setFActiviteId('')} style={{ padding: '4px 14px', borderRadius: 20, cursor: 'pointer', fontSize: '0.82rem', border: !fActiviteId ? '1.5px solid #1e40af' : '1.5px solid var(--border)', background: !fActiviteId ? '#1e40af' : 'var(--bg)', color: !fActiviteId ? '#fff' : 'var(--text)', fontWeight: !fActiviteId ? 700 : 400 }}>Toutes</button>}
          {activites.map((a) => (
            <button key={a.id} onClick={() => setFActiviteId(String(a.id))} style={{ padding: '4px 14px', borderRadius: 20, cursor: 'pointer', fontSize: '0.82rem', border: fActiviteId === String(a.id) ? '1.5px solid #1e40af' : '1.5px solid var(--border)', background: fActiviteId === String(a.id) ? '#1e40af' : 'var(--bg)', color: fActiviteId === String(a.id) ? '#fff' : 'var(--text)', fontWeight: fActiviteId === String(a.id) ? 700 : 400 }}>🏪 {a.nom}</button>
          ))}
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', alignSelf: 'center', marginLeft: 4 }}>← sélectionner l'activité</span>
        </div>
      )}

      {/* Barre de filtres (composant partagé) */}
      <HistoryFilterBar
        accent="#1e40af" accentDark="#1e3a8a"
        onSearch={loadPertes} searching={loading}
        onReset={resetFilters}
        showReset={!!(fActiviteId || fCategorie || fIngredient || fDateDebut !== yearStart || fDateFin !== yearEnd || fType)}
        onExportExcel={handleExport} excelDisabled={exporting || !searched || entries.length === 0} excelLabel={`Exporter${selected.size > 0 ? ` (${selected.size})` : ''}`}
        onExportPdf={handleExportPdf} pdfDisabled={!searched || entries.length === 0} exportingPdf={exportingPdf}
      >
        <FilterField label="📅 Du"><FilterInput type="date" value={fDateDebut} onChange={(e) => setFDateDebut(e.target.value)} /></FilterField>
        <FilterField label="📅 Au"><FilterInput type="date" value={fDateFin} onChange={(e) => setFDateFin(e.target.value)} /></FilterField>
        <FilterField label="🏷️ Catégorie">
          <FilterSelect value={fCategorie} onChange={(e) => { setFCategorie(e.target.value); setFIngredient(''); }}>
            <option value="">— Toutes —</option>
            {categories.map((c) => <option key={c.id} value={String(c.id)}>{c.nom}</option>)}
          </FilterSelect>
        </FilterField>
        <FilterField label="🧂 Article">
          <FilterSelect value={fIngredient} disabled={!fCategorie} onChange={(e) => setFIngredient(e.target.value)}>
            <option value="">— Tous —</option>
            {ingredientsInCat.map((i) => <option key={i.id} value={String(i.id)}>{i.nom}</option>)}
          </FilterSelect>
        </FilterField>
        <FilterField label="📋 Type">
          <FilterSelect value={fType} onChange={(e) => setFType(e.target.value)}>
            <option value="">— Tous —</option>
            <option value="avarie">Avarie</option>
            <option value="dechet">Déchet</option>
          </FilterSelect>
        </FilterField>
      </HistoryFilterBar>

      {/* Table & results — only after search */}
      {!searched ? null : <>
      {/* Action bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {selected.size > 0 && (
            <span style={{ fontSize: '0.82rem', color: '#1e40af', fontWeight: 700 }}>
              {selected.size} sélectionné{selected.size > 1 ? 's' : ''}
            </span>
          )}
          <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            {entries.length} résultat{entries.length !== 1 ? 's' : ''}
          </span>
        </div>
        {entries.length > 0 && (
          <div style={{ background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 10, padding: '6px 16px', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: '0.78rem', color: '#1e3a8a', fontWeight: 700 }}>Total quantité</span>
              <span style={{ fontSize: '0.85rem', fontWeight: 900, color: '#1e40af' }}>{totalQty.toFixed(3)}</span>
            </div>
            {hasCout && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: '0.78rem', color: '#1e3a8a', fontWeight: 700 }}>Coût total</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 900, color: '#2563eb' }}>{totalCout.toFixed(3)} DT</span>
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
              <tr style={{ background: 'linear-gradient(135deg, #1e3a8a, #1e40af)' }}>
                <th style={{ width: 32, textAlign: 'center' }} />
                <th>Activité</th>
                <th>Article</th>
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
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(entry.id)} style={{ cursor: 'pointer', accentColor: '#1e40af' }} />
                    </td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{entry.activiteNom ?? '—'}</td>
                    <td>
                      <div style={{ fontWeight: 700, fontSize: '0.86rem' }}>{entry.ingredientNom}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{entry.uniteNom} · {entry.categorieNom ?? '—'}</div>
                    </td>
                    <td style={{ fontWeight: 600, color: '#1e40af', whiteSpace: 'nowrap', fontSize: '0.85rem' }}>{fmtDate(entry.datePerte)}</td>
                    <td>
                      <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700, background: isAvarie ? '#fee2e2' : '#ffedd5', color: isAvarie ? '#991b1b' : '#c2410c', border: `1px solid ${isAvarie ? '#fca5a5' : '#fed7aa'}` }}>
                        {isAvarie ? 'Avarie' : 'Déchet'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#1e40af' }}>
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
              <tr style={{ background: '#eff6ff', borderTop: '2px solid #93c5fd' }}>
                <td colSpan={canWrite ? 5 : 4} />
                <td style={{ textAlign: 'right', fontWeight: 900, color: '#1e40af', fontSize: '0.95rem' }}>{totalQty.toFixed(3)}</td>
                <td style={{ fontWeight: 700, fontSize: '0.75rem', color: '#1e3a8a', textTransform: 'uppercase' }}>Total</td>
                <td />
                <td style={{ textAlign: 'right', fontWeight: 900, color: '#2563eb', fontSize: '0.95rem' }}>
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
