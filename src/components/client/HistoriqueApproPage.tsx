import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Activite, HistoriqueApproEntry } from '../../types';

const currentYear = new Date().getFullYear();
const yearStart = `${currentYear}-01-01`;
const yearEnd = `${currentYear}-12-31`;

const PAGE_SIZE = 20;

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
          {isEntreprise && nonLaboFournisseurs.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
                Fournisseur
              </label>
              <select className="input" style={{ width: '100%' }} value={fId} onChange={(e) => setFId(e.target.value)}>
                <option value="">— Aucun —</option>
                {nonLaboFournisseurs.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
              </select>
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

  // Modals
  const [editEntry, setEditEntry] = useState<HistoriqueApproEntry | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<HistoriqueApproEntry | null>(null);
  const [unitPopup, setUnitPopup] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const pagedResults = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Totals per unit
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

  // Activities for activity dropdown
  const activitiesForDropdown = isEntreprise
    ? entType === 'franchise'
      ? franchiseActivities.filter((a) => !selectedFranchiseGroup || (a.franchiseGroup || a.nom) === selectedFranchiseGroup)
      : distinctActivities
    : [];

  const fetchResults = useCallback(async () => {
    setLoading(true);
    setSearched(true);
    setPage(1);
    try {
      const params = new URLSearchParams();
      if (isEntreprise) {
        if (selectedActiviteId) params.set('activiteId', selectedActiviteId);
        else if (selectedFranchiseGroup && entType === 'franchise') params.set('franchiseGroup', selectedFranchiseGroup);
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

  const labelStyle: React.CSSProperties = {
    fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4,
  };

  const showTypeToggle = isEntreprise && !lockedType;

  const pageTitle = lockedType === 'franchise'
    ? `${t('nav.historique_franchise')} — ${currentYear}`
    : lockedType === 'distinct'
      ? `${t('nav.historique_distinct')} — ${currentYear}`
      : `${t('client.historique_appro.title')} — ${currentYear}`;

  // Color coding helpers
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

      {/* Filter panel */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 24px', marginBottom: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        {showTypeToggle && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {(['franchise', 'distinct'] as const).map((tp) => (
              <button key={tp}
                className={`btn btn-sm ${entType === tp ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => { setEntType(tp); setSelectedActiviteId(''); setResults([]); setSearched(false); }}
              >
                {tp === 'franchise' ? t('client.historique_appro.franchise') : t('client.historique_appro.distinct')}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {/* Franchise group — with "Tous" option */}
          {isEntreprise && entType === 'franchise' && franchiseGroups.length > 0 && (
            <div>
              <label style={labelStyle}>{t('client.historique_appro.franchise_group')}</label>
              <select className="input" style={{ maxWidth: 200 }}
                value={selectedFranchiseGroup}
                onChange={(e) => { setSelectedFranchiseGroup(e.target.value); setSelectedActiviteId(''); }}>
                <option value="">— Tous les groupes —</option>
                {franchiseGroups.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          )}

          {/* Activité — with "Toutes" option */}
          {isEntreprise && activitesLoading ? (
            <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', alignSelf: 'center' }}>{t('common.loading')}</span>
          ) : isEntreprise && activitiesForDropdown.length > 0 && (
            <div>
              <label style={labelStyle}>{t('client.historique_appro.activity')}</label>
              <select className="input" style={{ maxWidth: 240 }}
                value={selectedActiviteId}
                onChange={(e) => setSelectedActiviteId(e.target.value)}>
                <option value="">— Toutes les activités —</option>
                {activitiesForDropdown.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
              </select>
            </div>
          )}

          {/* Category */}
          <div>
            <label style={labelStyle}>{t('client.historique_appro.category')}</label>
            <select className="input" style={{ maxWidth: 220 }}
              value={selectedCategoryId}
              onChange={(e) => { setSelectedCategoryId(e.target.value); setSelectedIngredientId(''); }}>
              <option value="">{t('client.historique_appro.all_categories')}</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Ingredient */}
          <div>
            <label style={labelStyle}>{t('client.historique_appro.ingredient')}</label>
            <select className="input" style={{ maxWidth: 240 }}
              value={selectedIngredientId}
              onChange={(e) => setSelectedIngredientId(e.target.value)}
              disabled={ingredientsLoading || !selectedCategoryId}>
              <option value="">{t('client.historique_appro.all_ingredients')}</option>
              {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>

          {/* Dates */}
          <div>
            <label style={labelStyle}>{t('client.historique_appro.start_date')}</label>
            <input type="date" className="input" style={{ maxWidth: 160 }} min={yearStart} max={yearEnd}
              value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>{t('client.historique_appro.end_date')}</label>
            <input type="date" className="input" style={{ maxWidth: 160 }} min={yearStart} max={yearEnd}
              value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>

          {/* Fournisseur */}
          {isEntreprise && fournisseurs.length > 0 && (
            <div>
              <label style={labelStyle}>Fournisseur</label>
              <select className="input" style={{ maxWidth: 200 }}
                value={selectedFournisseurId} onChange={(e) => setSelectedFournisseurId(e.target.value)}>
                <option value="">— Tous —</option>
                {fournisseurs.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
              </select>
            </div>
          )}

          {/* Réf Facture */}
          {isEntreprise && (
            <div>
              <label style={labelStyle}>Réf Facture</label>
              <input type="text" className="input" style={{ maxWidth: 160 }}
                placeholder="Rechercher réf…"
                value={refFactureFilter} onChange={(e) => setRefFactureFilter(e.target.value)} />
            </div>
          )}

          <button className="btn btn-primary" style={{ alignSelf: 'flex-end' }} onClick={fetchResults} disabled={loading}>
            {loading ? t('common.loading') : '🔍 Rechercher'}
          </button>
        </div>
      </div>

      {/* Results */}
      {!searched ? null : loading ? (
        <p className="text-muted">{t('common.loading')}</p>
      ) : results.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">📦</span>
          <p>{t('client.historique_appro.no_results')}</p>
        </div>
      ) : (
        <>
          {/* Totals per unit — clickable */}
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

          <div className="table-responsive card th-teal">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('client.historique_appro.col_date')}</th>
                  {isEntreprise && <th>Type</th>}
                  <th>{t('client.historique_appro.col_ingredient')}</th>
                  <th>{t('client.historique_appro.col_category')}</th>
                  <th style={{ textAlign: 'right' }}>{t('client.historique_appro.col_qty')}</th>
                  <th style={{ textAlign: 'right' }}>Prix (U/DT)</th>
                  {isEntreprise && <th>Fournisseur</th>}
                  {isEntreprise && <th>Réf Facture</th>}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pagedResults.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600, color: 'var(--primary)' }}>{fmtDate(r.dateAppro)}</td>
                    {isEntreprise && (
                      <td>
                        <span className={`badge-appro ${r.typeAppro ?? 'manuel'}`}>
                          {r.typeAppro === 'transfert' ? 'Transfert' : 'Manuel'}
                        </span>
                      </td>
                    )}
                    <td>{r.ingredientNom}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{r.categorieNom}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: qtyColor(r.quantite) }}>
                      {r.quantite ?? '—'} <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 400 }}>{r.uniteNom}</span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: prixColor(r.prixUnitaire) }}>
                      {r.prixUnitaire !== null ? r.prixUnitaire.toFixed(3) : '—'}
                    </td>
                    {isEntreprise && <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{r.fournisseurNom ?? '—'}</td>}
                    {isEntreprise && <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{r.refFacture ?? '—'}</td>}
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setEditEntry(r)}
                        title="Modifier"
                        style={{ marginRight: 4, fontSize: '0.8rem' }}
                      >✏️</button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setDeleteEntry(r)}
                        title="Supprimer"
                        style={{ fontSize: '0.8rem', color: '#dc2626' }}
                      >🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ padding: '8px 14px', fontSize: '0.78rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>{results.length} enregistrement{results.length > 1 ? 's' : ''}</span>
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
