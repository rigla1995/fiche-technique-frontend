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

interface ScopedIngredient { id: number; nom: string; unite: string; categorie: string; categorieId: number | null }
interface Fournisseur { id: number; nom: string; isLabo?: boolean }

// ── Edit modal ────────────────────────────────────────────────────────────────
interface EditModalProps {
  entry: HistoriqueApproEntry;
  fournisseurs: Fournisseur[];
  isEntreprise: boolean;
  onSave: (id: number, data: { quantite: number | null; prixUnitaire: number | null; fournisseurId: number | null; refFacture: string | null }) => Promise<void>;
  onClose: () => void;
}
function EditModal({ entry, fournisseurs, isEntreprise: _isEntreprise, onSave, onClose }: EditModalProps) {
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
    <div className="modal-overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header" style={{ background: 'linear-gradient(135deg, #134e4a, #0f766e)', borderBottom: 'none' }}>
          <h2 style={{ color: '#fff', margin: 0 }}>Modifier — {entry.ingredientNom}</h2>
          <button className="modal-close" onClick={onClose} style={{ color: '#fff' }}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
              Date d'appro
            </label>
            <input
              className="input"
              type="date"
              value={entry.dateAppro ? entry.dateAppro.substring(0, 10) : ''}
              disabled
              style={{ width: '100%', opacity: 0.7, background: 'var(--bg-secondary, #f8fafc)', cursor: 'default' }}
            />
          </div>
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
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>
              Réf. Facture / BL
            </label>
            <input className="input" type="text" value={ref} onChange={(e) => setRef(e.target.value)}
              placeholder="N° facture ou BL" style={{ width: '100%' }} />
          </div>
          {entry.typeAppro === 'transfert' && (
            <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: '0.82rem', color: '#92400e' }}>
              ⚠️ Type Transfert — la modification de la quantité ajustera le stock du labo.
            </div>
          )}
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
    <div className="modal-overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header" style={{ background: '#fee2e2', borderBottom: '1px solid #fecaca' }}>
          <h2 style={{ color: '#991b1b' }}>Supprimer l'appro</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ background: '#f8faff', borderRadius: 8, padding: '12px 14px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', fontSize: '0.83rem' }}>
              <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Ingrédient</span>
              <span style={{ fontWeight: 700 }}>{entry.ingredientNom}</span>
              <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Date</span>
              <span style={{ fontWeight: 700 }}>{fmtDate(entry.dateAppro)}</span>
              <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Quantité</span>
              <span style={{ fontWeight: 700 }}>{entry.quantite} {entry.uniteNom}</span>
            </div>
          </div>
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '8px 12px', fontSize: '0.82rem', color: '#1e40af', fontWeight: 600 }}>
            📊 Impact stock : le stock de cet ingrédient sera recalculé après suppression.
          </div>
          {entry.typeAppro === 'transfert' && (
            <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', fontSize: '0.82rem', color: '#92400e' }}>
              ⚠️ Type Transfert — la quantité sera restituée dans le stock du labo source.
            </div>
          )}
          <div style={{ background: '#fff7ed', border: '1px solid #fbd38d', borderRadius: 8, padding: '8px 12px', fontSize: '0.82rem', color: '#92400e', fontWeight: 600 }}>
            🔒 Action irréversible — cette suppression ne peut pas être annulée.
          </div>
          {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', margin: 0 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button className="btn btn-ghost" onClick={onClose} disabled={deleting}>Annuler</button>
            <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}
              style={{ background: '#dc2626', color: '#fff', border: 'none' }}>
              {deleting ? '…' : 'Supprimer définitivement'}
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
    <div className="modal-overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="modal-header" style={{ background: 'linear-gradient(135deg, #134e4a, #0f766e)', borderBottom: 'none' }}>
          <h2 style={{ color: '#fff', margin: 0 }}>Détail — {unitNom}</h2>
          <button className="modal-close" onClick={onClose} style={{ color: '#fff' }}>✕</button>
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
  const { user, canWrite } = useAuth();
  const [searchParams] = useSearchParams();
  const isEntreprise = user?.compteType === 'entreprise' || !user?.compteType;

  const initIngredientId = searchParams.get('ingredientId') || '';
  const initActiviteId = searchParams.get('activiteId') || '';
  const laboId = searchParams.get('laboId') || '';
  const isGerant = user?.role === 'gerant';
  const isReadOnly = isGerant && !!laboId;
  const isActiviteGerant = isGerant && !!initActiviteId && !laboId;

  const [allActivities, setAllActivities] = useState<Activite[]>([]);
  const [activitesLoading, setActivitesLoading] = useState(false);

  const [selectedActiviteId, setSelectedActiviteId] = useState(initActiviteId);

  const [scopedIngredients, setScopedIngredients] = useState<ScopedIngredient[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedIngredientId, setSelectedIngredientId] = useState(initIngredientId);

  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [selectedFournisseurId, setSelectedFournisseurId] = useState('');
  const [refFactureFilter, setRefFactureFilter] = useState('');

  const [startDate, setStartDate] = useState(yearStart);
  const [endDate, setEndDate] = useState(yearEnd);

  const categories = Array.from(
    new Map(scopedIngredients.filter((i) => i.categorieId !== null).map((i) => [i.categorieId, { id: i.categorieId as number, nom: i.categorie }])).values()
  );
  const ingredientsInCat = selectedCategoryId
    ? scopedIngredients.filter((i) => String(i.categorieId) === selectedCategoryId)
    : [];

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

  const [ptProducts, setPtProducts] = useState<Array<{ id: number; nom: string }>>([]);

  useEffect(() => {
    setSelectedCategoryId('');
    setSelectedIngredientId('');
    if (!isEntreprise) {
      api.get('/api/stock/client/ingredient-selections')
        .then(({ data }) => setScopedIngredients(data as ScopedIngredient[])).catch(() => {});
      return;
    }
    if (laboId) {
      api.get(`/api/labo/${laboId}/ingredients`)
        .then(({ data }) => setScopedIngredients((data as any[]).filter((i) => i.selected !== false)))
        .catch(() => {});
    } else if (selectedActiviteId) {
      api.get(`/api/entreprise/activites/${selectedActiviteId}/selected-ingredients`)
        .then(({ data }) => setScopedIngredients(data as ScopedIngredient[])).catch(() => {});
    } else {
      api.get('/api/entreprise/activites/selected-ingredients')
        .then(({ data }) => setScopedIngredients(data as ScopedIngredient[])).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEntreprise, laboId, selectedActiviteId]);

  useEffect(() => {
    if (selectedCategoryId !== 'pt') { setPtProducts([]); return; }
    const ptUrl = selectedActiviteId ? `/api/stock/pt?activiteId=${selectedActiviteId}` : '/api/stock/pt';
    api.get(ptUrl)
      .then(({ data }) => setPtProducts((data as Array<{ produitId: number; nom: string }>).map((p) => ({ id: -(p.produitId), nom: p.nom }))))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategoryId, selectedActiviteId]);

  useEffect(() => {
    if (isEntreprise) {
      api.get('/api/entreprise/fournisseurs').then(({ data }) => setFournisseurs(data as Fournisseur[])).catch(() => {});
    } else {
      api.get('/api/fournisseurs').then(({ data }) => setFournisseurs(data as Fournisseur[])).catch(() => {});
    }
  }, [isEntreprise]);

  useEffect(() => {
    if (!isEntreprise) return;
    setActivitesLoading(true);
    api.get('/api/entreprise/activites')
      .then(({ data }) => {
        const all = data as Activite[];
        const filtered = laboId ? all.filter((a) => String((a as any).laboId) === laboId) : all;
        setAllActivities(filtered);
      })
      .finally(() => setActivitesLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEntreprise]);


  useEffect(() => {
    if (initIngredientId && (selectedActiviteId || !isEntreprise)) fetchResults();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activitiesForDropdown = isEntreprise ? allActivities : [];

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
        } else {
          params.set('entType', 'activite');
        }
        if (laboId) params.set('laboId', laboId);
      }
      if (selectedCategoryId === 'pt') {
        params.set('ptOnly', 'true');
        if (selectedIngredientId) params.set('ptProduitId', String(-Number(selectedIngredientId)));
      } else {
        if (selectedIngredientId) params.set('ingredientId', selectedIngredientId);
        else if (selectedCategoryId) params.set('categorieId', selectedCategoryId);
      }
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (selectedFournisseurId) params.set('fournisseurId', selectedFournisseurId);
      if (refFactureFilter.trim()) params.set('refFacture', refFactureFilter.trim());
      const { data } = await api.get(`/api/stock/historique?${params}`);
      setResults(data as HistoriqueApproEntry[]);
    } catch {
      setResults([]);
    }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEntreprise, selectedActiviteId, selectedIngredientId, selectedCategoryId, startDate, endDate, selectedFournisseurId, refFactureFilter]);

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
      else params.set('entType', 'activite');
    }
    if (selectedCategoryId === 'pt') {
      params.set('ptOnly', 'true');
      if (selectedIngredientId) params.set('ptProduitId', String(-Number(selectedIngredientId)));
    } else {
      if (selectedIngredientId) params.set('ingredientId', selectedIngredientId);
      else if (selectedCategoryId) params.set('categorieId', selectedCategoryId);
    }
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (selectedFournisseurId) params.set('fournisseurId', selectedFournisseurId);
    if (refFactureFilter.trim()) params.set('refFacture', refFactureFilter.trim());
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

  const dateLabelStyle: React.CSSProperties = {
    fontSize: '0.68rem', fontWeight: 800, color: '#0f766e',
    textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5,
  };

  const sectionLabelStyle: React.CSSProperties = {
    fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.1em',
    marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
  };

  const pageTitle = `${t('client.historique_appro.title')} — ${currentYear}`;
  const contextSubtitle = 'Consultation et export de l\'historique des approvisionnements';

  const prixColor = (prix: number | null) => {
    if (prix === null) return 'var(--text-muted)';
    if (prix === 0) return '#dc2626';
    return '#1d4ed8';
  };

  return (
    <div className="page">
      {/* ── Hero header ───────────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 55%, #3b82f6 100%)',
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(30,64,175,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>📋</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>{pageTitle}</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>{contextSubtitle}</p>
        </div>
      </div>

      {/* ── Filter/toolbar bar ─────────────────────────────────────────────── */}
      <div style={{
        background: 'var(--surface)', borderRadius: 14, padding: '16px 20px',
        border: '1px solid var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
        marginBottom: 24,
      }}>
        {/* Panel header */}
        <div style={{ width: '100%', marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#1e40af' }}>
            Filtres
          </span>
        </div>

        {/* Section 1: Entity + Product */}
        <div style={{ marginBottom: 16 }}>
          <div style={sectionLabelStyle}>
            <span style={{ width: 16, height: 2, background: 'var(--primary)', display: 'inline-block', borderRadius: 2 }} />
            Entité &amp; Produit
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
            {isEntreprise && activitesLoading ? (
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 8 }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{t('common.loading')}</span>
              </div>
            ) : isEntreprise && !isActiviteGerant && activitiesForDropdown.length > 0 ? (
              <div>
                <label style={{ fontSize: '0.68rem', fontWeight: 800, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>🏪 {t('client.historique_appro.activity')}</label>
                <select
                  style={{ padding: '9px 13px', borderRadius: 9, border: '1.5px solid #1e40af', fontSize: '0.88rem', background: '#eff6ff', minWidth: 160 }}
                  value={selectedActiviteId}
                  onChange={(e) => setSelectedActiviteId(e.target.value)}
                >
                  <option value="">— Toutes les activités —</option>
                  {activitiesForDropdown.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
                </select>
              </div>
            ) : null}

            <div>
              <label style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>🏷️ {t('client.historique_appro.category')}</label>
              <select
                style={{ padding: '9px 13px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: '0.88rem', background: 'var(--background)', minWidth: 160 }}
                value={selectedCategoryId}
                onChange={(e) => { setSelectedCategoryId(e.target.value); setSelectedIngredientId(''); }}
              >
                <option value="">{t('client.historique_appro.all_categories')}</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                {(!isEntreprise || selectedActiviteId) && <option value="pt">Produits Transformés</option>}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>🧂 {t('client.historique_appro.ingredient')}</label>
              <select
                style={{ padding: '9px 13px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: '0.88rem', background: 'var(--background)', minWidth: 160 }}
                value={selectedIngredientId}
                onChange={(e) => setSelectedIngredientId(e.target.value)}
                disabled={!selectedCategoryId}
              >
                <option value="">{t('client.historique_appro.all_ingredients')}</option>
                {selectedCategoryId === 'pt'
                  ? ptProducts.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)
                  : ingredientsInCat.map((i) => <option key={i.id} value={i.id}>{i.nom}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ marginBottom: 16, borderTop: '1px dashed var(--border)' }} />

        {/* Section 2: Period + Supplier */}
        <div style={{ marginBottom: 16 }}>
          <div style={sectionLabelStyle}>
            <span style={{ width: 16, height: 2, background: '#7c3aed', display: 'inline-block', borderRadius: 2 }} />
            Période &amp; Fournisseur
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
            <div>
              <label style={{ fontSize: '0.68rem', fontWeight: 800, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>📅 {t('client.historique_appro.start_date')}</label>
              <input
                type="date"
                style={{ padding: '9px 13px', borderRadius: 9, border: '1.5px solid #1e40af', fontSize: '0.88rem', background: '#eff6ff', minWidth: 160, fontWeight: 600 }}
                min={yearStart}
                max={yearEnd}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.68rem', fontWeight: 800, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>📅 {t('client.historique_appro.end_date')}</label>
              <input
                type="date"
                style={{ padding: '9px 13px', borderRadius: 9, border: '1.5px solid #1e40af', fontSize: '0.88rem', background: '#eff6ff', minWidth: 160, fontWeight: 600 }}
                min={yearStart}
                max={yearEnd}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            {fournisseurs.length > 0 && (
              <div>
                <label style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>🚚 Fournisseur</label>
                <select
                  style={{ padding: '9px 13px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: '0.88rem', background: 'var(--background)', minWidth: 160 }}
                  value={selectedFournisseurId}
                  onChange={(e) => setSelectedFournisseurId(e.target.value)}
                >
                  <option value="">— Tous —</option>
                  {fournisseurs.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
                </select>
              </div>
            )}
            <div>
              <label style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>🧾 Réf. Facture</label>
              <input
                type="text"
                style={{ padding: '9px 13px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: '0.88rem', background: 'var(--background)', minWidth: 160 }}
                placeholder="Rechercher réf…"
                value={refFactureFilter}
                onChange={(e) => setRefFactureFilter(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Actions footer */}
        <div style={{
          paddingTop: 16,
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
        }}>
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
            {loading ? t('common.loading') : '🔍 Rechercher'}
          </button>
          <button
            onClick={exportExcel}
            disabled={results.length === 0 || !canWrite}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: (results.length > 0 && canWrite) ? 'linear-gradient(135deg, #16a34a, #22c55e)' : 'var(--bg-secondary, #e5e7eb)',
              boxShadow: (results.length > 0 && canWrite) ? '0 4px 14px rgba(22,163,74,0.35)' : 'none',
              borderRadius: 10, border: 'none',
              color: (results.length > 0 && canWrite) ? '#fff' : 'var(--text-muted)',
              fontWeight: 800, padding: '10px 20px',
              cursor: (results.length === 0 || !canWrite) ? 'not-allowed' : 'pointer',
              opacity: (results.length === 0 || !canWrite) ? 0.55 : 1,
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
        <div style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📦</div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>{t('client.historique_appro.no_results')}</p>
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

          <div className="card" style={{ overflowX: 'hidden' }}>
            <table className="table" style={{ tableLayout: 'fixed', width: '100%' }}>
              <colgroup>
                <col style={{ width: '36px' }} />
                <col style={{ width: isEntreprise ? '115px' : '105px' }} />
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
                  <th style={{ fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '12px 14px' }}>{t('client.historique_appro.col_date')}</th>
                  <th style={{ fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '12px 14px' }}>{t('client.historique_appro.col_ingredient')}</th>
                  <th style={{ textAlign: 'right', fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '12px 14px' }}>{t('client.historique_appro.col_qty')}</th>
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
                      {isEntreprise && (
                        <span className={`badge-appro ${r.typeAppro ?? 'manuel'}`} style={{ fontSize: '0.68rem', display: 'block', marginTop: 4 }}>
                          {r.typeAppro === 'transfert' ? 'Transfert' : 'Manuel'}
                        </span>
                      )}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.ingredientNom}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.categorieNom}</div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: '#0f766e' }}>
                      <div>{r.quantite ?? '—'}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 400 }}>{r.uniteNom}</div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: prixColor(r.prixUnitaire), fontSize: '0.88rem' }}>
                      {r.prixUnitaire !== null ? r.prixUnitaire.toFixed(3) : '—'}
                    </td>
                    <td style={{ fontSize: '0.78rem' }}>
                      <div style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.fournisseurNom ?? '—'}</div>
                      <div style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.refFacture ?? '—'}</div>
                      {r.createdByNom && <div style={{ fontSize: '0.68rem', color: '#7c3aed', fontWeight: 600, marginTop: 2 }}>👤 {r.createdByNom}</div>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {!isReadOnly && (!isGerant || r.createdBy === user?.id) && (<>
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
                      </>)}
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
