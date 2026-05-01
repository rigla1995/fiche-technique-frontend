import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Activite, HistoriqueApproEntry } from '../../types';

const currentYear = new Date().getFullYear();
const yearStart = `${currentYear}-01-01`;
const yearEnd = `${currentYear}-12-31`;

const PAGE_SIZE = 10;

const fmtDate = (iso: string | null | undefined) => {
  if (!iso || iso.length < 10) return iso ?? '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

interface Ingredient { id: number; name: string; unitName: string; categorieName: string | null }
interface Category { id: number; name: string }
interface Fournisseur { id: number; nom: string; isLabo?: boolean }

// ── Edit modal ────────────────────────────────────────────────────────────────
interface EditModalProps {
  entry: HistoriqueApproEntry;
  fournisseurs: Fournisseur[];
  isEntreprise: boolean;
  onSave: (id: number, data: { quantite: number | null; prixUnitaire: number | null; fournisseurId: number | null; refFacture: string | null }) => Promise<void>;
  onClose: () => void;
}
function EditModal({ entry, fournisseurs, isEntreprise, onSave, onClose }: EditModalProps) {
  const [qty, setQty] = useState(entry.quantite !== null ? String(entry.quantite) : '');
  const [prix, setPrix] = useState(entry.prixUnitaire !== null ? String(entry.prixUnitaire) : '');
  const [fId, setFId] = useState(entry.fournisseurId ? String(entry.fournisseurId) : '');
  const [ref, setRef] = useState(entry.refFacture ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const nonLaboFournisseurs = fournisseurs.filter((f) => !f.isLabo);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await onSave(entry.id, {
        quantite: qty ? parseFloat(qty) : null,
        prixUnitaire: prix ? parseFloat(prix) : null,
        fournisseurId: fId ? Number(fId) : null,
        refFacture: ref.trim() || null,
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
        <div className="modal-header modal-header--primary">
          <h2>Modifier — {entry.ingredientNom}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
                Quantité ({entry.uniteNom})
              </label>
              <input className="input" type="number" min="0" step="0.001" value={qty}
                onChange={(e) => setQty(e.target.value)} style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
                Prix unitaire (DT)
              </label>
              <input className="input" type="number" min="0" step="0.001" value={prix}
                onChange={(e) => setPrix(e.target.value)} style={{ width: '100%' }} />
            </div>
          </div>
          {isEntreprise && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
                Fournisseur
              </label>
              {entry.typeAppro === 'transfert' ? (
                <input
                  className="input"
                  style={{ width: '100%', background: 'var(--bg-secondary, #f3f4f6)', color: 'var(--text-muted)', cursor: 'not-allowed' }}
                  value={entry.fournisseurNom ?? '—'}
                  disabled
                />
              ) : nonLaboFournisseurs.length > 0 ? (
                <select className="input" style={{ width: '100%' }} value={fId} onChange={(e) => setFId(e.target.value)}>
                  <option value="">— Aucun —</option>
                  {nonLaboFournisseurs.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
                </select>
              ) : (
                <input className="input" style={{ width: '100%', color: 'var(--text-muted)' }} value="— Aucun fournisseur disponible —" disabled />
              )}
            </div>
          )}
          {isEntreprise && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
                Réf. Facture / BL
              </label>
              <input className="input" type="text" value={ref} onChange={(e) => setRef(e.target.value)}
                placeholder="N° facture ou BL" style={{ width: '100%' }} />
            </div>
          )}
          {entry.typeAppro === 'transfert' && (
            <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: '0.82rem', color: '#92400e' }}>
              ⚠️ Type Transfert — la modification de la quantité ajustera le stock du labo.
            </div>
          )}
          {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: 8 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Annuler</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? '…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Delete confirm modal ──────────────────────────────────────────────────────
interface DeleteModalProps {
  entry: HistoriqueApproEntry;
  onConfirm: (id: number) => Promise<void>;
  onClose: () => void;
}
function DeleteModal({ entry, onConfirm, onClose }: DeleteModalProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    setDeleting(true);
    setError('');
    try {
      await onConfirm(entry.id);
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
          <p style={{ marginBottom: 12 }}>
            Supprimer l'appro du <strong>{fmtDate(entry.dateAppro)}</strong> pour <strong>{entry.ingredientNom}</strong> ({entry.quantite} {entry.uniteNom}) ?
          </p>
          {entry.typeAppro === 'transfert' && (
            <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: '0.82rem', color: '#92400e' }}>
              ⚠️ Type Transfert — la suppression restaurera la quantité dans le stock du labo.
            </div>
          )}
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

// ── Unit totals popup ─────────────────────────────────────────────────────────
interface UnitTotalsPopupProps {
  unitNom: string;
  entries: HistoriqueApproEntry[];
  onClose: () => void;
}
function UnitTotalsPopup({ unitNom, entries, onClose }: UnitTotalsPopupProps) {
  const byIngredient: Record<string, { nom: string; qty: number; cost: number }> = {};
  for (const e of entries) {
    if (!byIngredient[e.ingredientNom]) byIngredient[e.ingredientNom] = { nom: e.ingredientNom, qty: 0, cost: 0 };
    byIngredient[e.ingredientNom].qty += e.quantite ?? 0;
    byIngredient[e.ingredientNom].cost += (e.quantite ?? 0) * (e.prixUnitaire ?? 0);
  }
  const rows = Object.values(byIngredient).sort((a, b) => b.qty - a.qty);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="modal-header modal-header--primary">
          <h2>Détail — {unitNom}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          <table style={{ width: '100%', fontSize: '0.88rem' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', paddingBottom: 8, color: 'var(--text-muted)', fontWeight: 600 }}>Ingrédient</th>
                <th style={{ textAlign: 'right', paddingBottom: 8, color: 'var(--text-muted)', fontWeight: 600 }}>Total Qté</th>
                <th style={{ textAlign: 'right', paddingBottom: 8, color: 'var(--text-muted)', fontWeight: 600 }}>Coût total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.nom}>
                  <td style={{ paddingBottom: 6, fontWeight: 600 }}>{r.nom}</td>
                  <td style={{ textAlign: 'right', paddingBottom: 6, color: '#2563eb', fontWeight: 700 }}>{r.qty.toFixed(3)} {unitNom}</td>
                  <td style={{ textAlign: 'right', paddingBottom: 6, color: '#15803d', fontWeight: 600 }}>{r.cost.toFixed(3)} DT</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function HistoriqueApproPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const isEntreprise = user?.compteType === 'entreprise';

  const initIngredientId = searchParams.get('ingredientId') || '';
  const initActiviteId = searchParams.get('activiteId') || '';
  const lockedType = searchParams.get('type') as 'franchise' | 'distinct' | null;

  const [entType, setEntType] = useState<'franchise' | 'distinct'>(lockedType ?? 'franchise');

  useEffect(() => {
    if (lockedType) {
      setEntType(lockedType);
      setSelectedActiviteId('');
      setSelectedFranchiseGroup('');
      setResults([]);
      setSearched(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedType]);

  const [franchiseActivities, setFranchiseActivities] = useState<Activite[]>([]);
  const [distinctActivities, setDistinctActivities] = useState<Activite[]>([]);
  const [activitesLoading, setActivitesLoading] = useState(false);

  const [franchiseGroups, setFranchiseGroups] = useState<string[]>([]);
  const [selectedFranchiseGroup, setSelectedFranchiseGroup] = useState('');
  const [selectedActiviteId, setSelectedActiviteId] = useState(initActiviteId);

  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [ingredientsLoading, setIngredientsLoading] = useState(false);
  const [selectedIngredientId, setSelectedIngredientId] = useState(initIngredientId);

  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [selectedFournisseurId, setSelectedFournisseurId] = useState('');
  const [refFactureFilter, setRefFactureFilter] = useState('');

  const [startDate, setStartDate] = useState(yearStart);
  const [endDate, setEndDate] = useState(yearEnd);

  const [results, setResults] = useState<HistoriqueApproEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [page, setPage] = useState(1);

  const [editEntry, setEditEntry] = useState<HistoriqueApproEntry | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<HistoriqueApproEntry | null>(null);
  const [unitPopup, setUnitPopup] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const toggleSelect = (id: number) => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleSelectAll = () => {
    if (selectedIds.size === results.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(results.map((r) => r.id)));
  };

  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const pagedResults = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const unitTotals: Record<string, { qty: number; cost: number; entries: HistoriqueApproEntry[] }> = {};
  for (const r of results) {
    if (!unitTotals[r.uniteNom]) unitTotals[r.uniteNom] = { qty: 0, cost: 0, entries: [] };
    unitTotals[r.uniteNom].qty += r.quantite ?? 0;
    unitTotals[r.uniteNom].cost += (r.quantite ?? 0) * (r.prixUnitaire ?? 0);
    unitTotals[r.uniteNom].entries.push(r);
  }

  useEffect(() => {
    api.get('/categories?onlyWithIngredients=true').then(({ data }) => setCategories(data as Category[])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isEntreprise) return;
    api.get('/api/entreprise/fournisseurs')
      .then(({ data }) => setFournisseurs(data as Fournisseur[]))
      .catch(() => {});
  }, [isEntreprise]);

  useEffect(() => {
    if (!isEntreprise) return;
    setActivitesLoading(true);
    api.get('/api/entreprise/activites')
      .then(({ data }) => {
        const all = data as Activite[];
        const franchise = all.filter((a) => a.type === 'franchise');
        const distinct = all.filter((a) => a.type === 'distincte' || a.type == null);
        setFranchiseActivities(franchise);
        setDistinctActivities(distinct);
        const groups = Array.from(new Set(franchise.map((a) => a.franchiseGroup || a.nom))).sort();
        setFranchiseGroups(groups);
        if (groups.length > 0 && !selectedFranchiseGroup) setSelectedFranchiseGroup(groups[0]);
        if (initActiviteId) {
          const act = all.find((a) => String(a.id) === initActiviteId);
          if (act?.type === 'distincte' || act?.type == null) setEntType('distinct');
        }
      })
      .finally(() => setActivitesLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEntreprise]);

  useEffect(() => {
    setIngredients([]);
    setSelectedIngredientId('');
    if (!selectedCategoryId) return;
    setIngredientsLoading(true);
    api.get(`/ingredients?categorieId=${selectedCategoryId}`)
      .then(({ data }) => setIngredients(data as Ingredient[]))
      .catch(() => {})
      .finally(() => setIngredientsLoading(false));
  }, [selectedCategoryId]);

  useEffect(() => {
    if (initIngredientId && (selectedActiviteId || !isEntreprise)) fetchResults();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activitiesForDropdown = isEntreprise
    ? entType === 'franchise'
      ? franchiseActivities.filter((a) => !selectedFranchiseGroup || (a.franchiseGroup || a.nom) === selectedFranchiseGroup)
      : distinctActivities
    : [];

  const fetchResults = useCallback(async () => {
    setLoading(true);
    setSearched(true);
    setPage(1);
    setSelectedIds(new Set());
    try {
      const params = new URLSearchParams();
      if (isEntreprise) {
        if (selectedActiviteId) {
          params.set('activiteId', selectedActiviteId);
        } else if (selectedFranchiseGroup && entType === 'franchise') {
          params.set('franchiseGroup', selectedFranchiseGroup);
        } else {
          params.set('entType', entType);
        }
      }
      if (selectedIngredientId) params.set('ingredientId', selectedIngredientId);
      else if (selectedCategoryId) params.set('categorieId', selectedCategoryId);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (isEntreprise && selectedFournisseurId) params.set('fournisseurId', selectedFournisseurId);
      if (isEntreprise && refFactureFilter.trim()) params.set('refFacture', refFactureFilter.trim());
      const { data } = await api.get(`/api/stock/historique?${params}`);
      setResults(data as HistoriqueApproEntry[]);
    } catch {
      setResults([]);
    }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEntreprise, selectedActiviteId, selectedFranchiseGroup, entType, selectedIngredientId, selectedCategoryId, startDate, endDate, selectedFournisseurId, refFactureFilter]);

  const handleEdit = async (id: number, data: { quantite: number | null; prixUnitaire: number | null; fournisseurId: number | null; refFacture: string | null }) => {
    await api.put(`/api/stock/historique/${id}`, { ...data, isEntreprise });
    setResults((prev) => prev.map((r) => r.id === id ? {
      ...r,
      quantite: data.quantite,
      prixUnitaire: data.prixUnitaire,
      fournisseurId: data.fournisseurId,
      fournisseurNom: fournisseurs.find((f) => f.id === data.fournisseurId)?.nom ?? null,
      refFacture: data.refFacture,
    } : r));
  };

  const handleDelete = async (id: number) => {
    await api.delete(`/api/stock/historique/${id}?isEntreprise=${isEntreprise}`);
    setResults((prev) => prev.filter((r) => r.id !== id));
  };

  const exportExcel = async () => {
    const params = new URLSearchParams();
    if (isEntreprise) {
      if (selectedActiviteId) params.set('activiteId', selectedActiviteId);
      else if (selectedFranchiseGroup && entType === 'franchise') params.set('franchiseGroup', selectedFranchiseGroup);
      else params.set('entType', entType);
    }
    if (selectedIngredientId) params.set('ingredientId', selectedIngredientId);
    else if (selectedCategoryId) params.set('categorieId', selectedCategoryId);
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (isEntreprise && selectedFournisseurId) params.set('fournisseurId', selectedFournisseurId);
    if (isEntreprise && refFactureFilter.trim()) params.set('refFacture', refFactureFilter.trim());
    if (selectedIds.size > 0) params.set('selectedIds', [...selectedIds].join(','));

    const { data } = await api.get(
      `/api/stock/historique/export-excel?${params}`,
      { responseType: 'blob' },
    );
    const url = URL.createObjectURL(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `historique-appro-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5,
  };

  const sectionLabelStyle: React.CSSProperties = {
    fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.1em',
    marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
  };

  const showTypeToggle = isEntreprise && !lockedType;

  const pageTitle = lockedType === 'franchise'
    ? `Historique Appro Franchise — ${currentYear}`
    : lockedType === 'distinct'
      ? `Historique Appro Distinct — ${currentYear}`
      : `${t('client.historique_appro.title')} — ${currentYear}`;

  const qtyColor = (qty: number | null) => {
    if (qty === null) return 'var(--text-muted)';
    if (qty <= 0) return '#dc2626';
    if (qty < 5) return '#d97706';
    return '#15803d';
  };
  const prixColor = (prix: number | null) => {
    if (prix === null) return 'var(--text-muted)';
    if (prix === 0) return '#dc2626';
    return '#1d4ed8';
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>{pageTitle}</h1>
      </div>

      {/* ── Modern filter panel ─────────────────────────────────────────── */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        marginBottom: 24,
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}>
        {/* Panel header */}
        <div style={{
          padding: '12px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-secondary, #f8fafc)',
        }}>
          <span style={{ fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--text-muted)' }}>
            Filtres
          </span>
          {showTypeToggle && (
            <div style={{ display: 'flex', gap: 6 }}>
              {(['franchise', 'distinct'] as const).map((tp) => (
                <button
                  key={tp}
                  className={`btn btn-sm ${entType === tp ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ padding: '4px 14px', fontSize: '0.8rem' }}
                  onClick={() => { setEntType(tp); setSelectedActiviteId(''); setResults([]); setSearched(false); }}
                >
                  {tp === 'franchise' ? t('client.historique_appro.franchise') : t('client.historique_appro.distinct')}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Section 1: Entity + Product */}
        <div style={{ padding: '18px 24px 0' }}>
          <div style={sectionLabelStyle}>
            <span style={{ width: 16, height: 2, background: 'var(--primary)', display: 'inline-block', borderRadius: 2 }} />
            Entité &amp; Produit
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '12px 20px' }}>
            {isEntreprise && entType === 'franchise' && franchiseGroups.length > 0 && (
              <div>
                <label style={labelStyle}>{t('client.historique_appro.franchise_group')}</label>
                <select
                  className="input"
                  style={{ width: '100%' }}
                  value={selectedFranchiseGroup}
                  onChange={(e) => { setSelectedFranchiseGroup(e.target.value); setSelectedActiviteId(''); }}
                >
                  <option value="">— Tous les groupes —</option>
                  {franchiseGroups.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            )}

            {isEntreprise && activitesLoading ? (
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 8 }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{t('common.loading')}</span>
              </div>
            ) : isEntreprise && activitiesForDropdown.length > 0 ? (
              <div>
                <label style={labelStyle}>{t('client.historique_appro.activity')}</label>
                <select
                  className="input"
                  style={{ width: '100%' }}
                  value={selectedActiviteId}
                  onChange={(e) => setSelectedActiviteId(e.target.value)}
                >
                  <option value="">— Toutes les activités —</option>
                  {activitiesForDropdown.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
                </select>
              </div>
            ) : null}

            <div>
              <label style={labelStyle}>{t('client.historique_appro.category')}</label>
              <select
                className="input"
                style={{ width: '100%' }}
                value={selectedCategoryId}
                onChange={(e) => { setSelectedCategoryId(e.target.value); setSelectedIngredientId(''); }}
              >
                <option value="">{t('client.historique_appro.all_categories')}</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div>
              <label style={labelStyle}>{t('client.historique_appro.ingredient')}</label>
              <select
                className="input"
                style={{ width: '100%' }}
                value={selectedIngredientId}
                onChange={(e) => setSelectedIngredientId(e.target.value)}
                disabled={ingredientsLoading || !selectedCategoryId}
              >
                <option value="">{t('client.historique_appro.all_ingredients')}</option>
                {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ margin: '16px 24px 0', borderTop: '1px dashed var(--border)' }} />

        {/* Section 2: Period + Supplier */}
        <div style={{ padding: '16px 24px 0' }}>
          <div style={sectionLabelStyle}>
            <span style={{ width: 16, height: 2, background: '#7c3aed', display: 'inline-block', borderRadius: 2 }} />
            Période &amp; Fournisseur
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px 20px' }}>
            <div>
              <label style={labelStyle}>{t('client.historique_appro.start_date')}</label>
              <input
                type="date"
                className="input"
                style={{ width: '100%' }}
                min={yearStart}
                max={yearEnd}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>{t('client.historique_appro.end_date')}</label>
              <input
                type="date"
                className="input"
                style={{ width: '100%' }}
                min={yearStart}
                max={yearEnd}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            {isEntreprise && fournisseurs.length > 0 && (
              <div>
                <label style={labelStyle}>Fournisseur</label>
                <select
                  className="input"
                  style={{ width: '100%' }}
                  value={selectedFournisseurId}
                  onChange={(e) => setSelectedFournisseurId(e.target.value)}
                >
                  <option value="">— Tous —</option>
                  {fournisseurs.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
                </select>
              </div>
            )}
            {isEntreprise && (
              <div>
                <label style={labelStyle}>Réf. Facture</label>
                <input
                  type="text"
                  className="input"
                  style={{ width: '100%' }}
                  placeholder="Rechercher réf…"
                  value={refFactureFilter}
                  onChange={(e) => setRefFactureFilter(e.target.value)}
                />
              </div>
            )}
          </div>
        </div>

        {/* Actions footer */}
        <div style={{
          padding: '16px 24px',
          marginTop: 16,
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-secondary, #f8fafc)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
        }}>
          <button className="btn btn-primary" onClick={fetchResults} disabled={loading} style={{ minWidth: 140 }}>
            {loading ? t('common.loading') : '🔍 Rechercher'}
          </button>
          <button
            onClick={exportExcel}
            disabled={results.length === 0}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 20px', borderRadius: 10, border: 'none',
              cursor: results.length === 0 ? 'not-allowed' : 'pointer',
              background: results.length > 0 ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)' : 'var(--bg-secondary, #e5e7eb)',
              color: results.length > 0 ? '#fff' : 'var(--text-muted)',
              fontWeight: 700, fontSize: '0.88rem',
              opacity: results.length === 0 ? 0.55 : 1,
              boxShadow: results.length > 0 ? '0 2px 8px rgba(16,185,129,0.25)' : 'none',
              transition: 'all 0.15s',
              minWidth: 180,
            }}
          >
            <span style={{ fontSize: '1rem' }}>📊</span>
            {selectedIds.size > 0 ? `Générer (${selectedIds.size} sél.)` : 'Générer Hist. Appro'}
          </button>
        </div>
      </div>

      {/* ── Results ────────────────────────────────────────────────────── */}
      {!searched ? null : loading ? (
        <p className="text-muted">{t('common.loading')}</p>
      ) : results.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">📦</span>
          <p>{t('client.historique_appro.no_results')}</p>
        </div>
      ) : (
        <>
          {/* Totals per unit */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            {Object.entries(unitTotals).map(([unit, data]) => (
              <button
                key={unit}
                onClick={() => setUnitPopup(unit)}
                style={{
                  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
                  padding: '10px 18px', cursor: 'pointer', textAlign: 'left',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                  transition: 'box-shadow 0.15s',
                }}
                title="Cliquer pour voir le détail"
              >
                <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 2 }}>
                  {unit} — {data.entries.length} entrée{data.entries.length > 1 ? 's' : ''}
                </div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#2563eb' }}>
                  {data.qty.toFixed(3)} <span style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-muted)' }}>{unit}</span>
                </div>
                <div style={{ fontSize: '0.82rem', color: '#15803d', fontWeight: 600 }}>
                  {data.cost.toFixed(3)} DT
                </div>
              </button>
            ))}
          </div>

          <div className="card th-teal" style={{ overflowX: 'hidden' }}>
            <table className="table" style={{ tableLayout: 'fixed', width: '100%' }}>
              <colgroup>
                <col style={{ width: '36px' }} />
                <col style={{ width: isEntreprise ? '115px' : '105px' }} />
                <col />
                <col style={{ width: '100px' }} />
                <col style={{ width: '85px' }} />
                {isEntreprise && <col style={{ width: '130px' }} />}
                <col style={{ width: '66px' }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={{ textAlign: 'center', padding: '0 4px' }}>
                    <input
                      type="checkbox"
                      checked={results.length > 0 && selectedIds.size === results.length}
                      onChange={toggleSelectAll}
                      title="Tout sélectionner"
                      style={{ cursor: 'pointer', accentColor: 'var(--primary)' }}
                    />
                  </th>
                  <th>{t('client.historique_appro.col_date')}</th>
                  <th>{t('client.historique_appro.col_ingredient')}</th>
                  <th style={{ textAlign: 'right' }}>{t('client.historique_appro.col_qty')}</th>
                  <th style={{ textAlign: 'right' }}>Prix/DT</th>
                  {isEntreprise && <th>Fourn. / Réf</th>}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pagedResults.map((r) => {
                  const isSelected = selectedIds.has(r.id);
                  return (
                  <tr key={r.id} style={isSelected ? { background: 'rgba(234,88,12,0.08)', outline: '1px solid rgba(234,88,12,0.3)' } : undefined}>
                    <td style={{ textAlign: 'center', padding: '0 4px' }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(r.id)}
                        style={{ cursor: 'pointer', accentColor: '#ea580c' }}
                      />
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--primary)', fontSize: '0.85rem' }}>{fmtDate(r.dateAppro)}</div>
                      {isEntreprise && (
                        <span className={`badge-appro ${r.typeAppro ?? 'manuel'}`} style={{ fontSize: '0.68rem' }}>
                          {r.typeAppro === 'transfert' ? 'Transfert' : 'Manuel'}
                        </span>
                      )}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.ingredientNom}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.categorieNom}</div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: qtyColor(r.quantite) }}>
                      <div>{r.quantite ?? '—'}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 400 }}>{r.uniteNom}</div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: prixColor(r.prixUnitaire), fontSize: '0.88rem' }}>
                      {r.prixUnitaire !== null ? r.prixUnitaire.toFixed(3) : '—'}
                    </td>
                    {isEntreprise && (
                      <td style={{ fontSize: '0.78rem' }}>
                        <div style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.fournisseurNom ?? '—'}</div>
                        <div style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.refFacture ?? '—'}</div>
                      </td>
                    )}
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setEditEntry(r)}
                        title="Modifier"
                        style={{ marginRight: 2, fontSize: '0.8rem', padding: '2px 6px' }}
                      >✏️</button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setDeleteEntry(r)}
                        title="Supprimer"
                        style={{ fontSize: '0.8rem', color: '#dc2626', padding: '2px 6px' }}
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
      {editEntry && (
        <EditModal
          entry={editEntry}
          fournisseurs={fournisseurs}
          isEntreprise={isEntreprise}
          onSave={handleEdit}
          onClose={() => setEditEntry(null)}
        />
      )}
      {deleteEntry && (
        <DeleteModal
          entry={deleteEntry}
          onConfirm={handleDelete}
          onClose={() => setDeleteEntry(null)}
        />
      )}
      {unitPopup && unitTotals[unitPopup] && (
        <UnitTotalsPopup
          unitNom={unitPopup}
          entries={unitTotals[unitPopup].entries}
          onClose={() => setUnitPopup(null)}
        />
      )}
    </div>
  );
}
