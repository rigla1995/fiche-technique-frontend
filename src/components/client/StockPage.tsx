import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import PortionsModal from './PortionsModal';
import type { Activite, StockEntry, StockHistoryEntry, ActiviteTypesSummary, Fournisseur } from '../../types';

const currentYear = new Date().getFullYear();
const yearStart = `${currentYear}-01-01`;
const todayStr = () => new Date().toISOString().split('T')[0];
const fmtDate = (iso: string | null | undefined) => {
  if (!iso || iso.length < 10) return iso ?? '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

interface StockRowState {
  quantite: string;
  prixUnitaire: string;
  dateAppro: string;
  fournisseurId: string;
  refFacture: string;
  tauxTva: string;
  origQuantite: string;
  origPrixUnitaire: string;
  origDateAppro: string;
  hasExisting: boolean;
  saving: boolean;
  saved: boolean;
  error: string;
}

function buildInitialRowState(entries: StockEntry[]): Record<number, StockRowState> {
  const state: Record<number, StockRowState> = {};
  const today = todayStr();
  for (const e of entries) {
    const hasExisting = e.quantite !== null;
    state[e.ingredientId] = {
      quantite: '0', prixUnitaire: '0', dateAppro: today,
      fournisseurId: '', refFacture: '', tauxTva: '',
      origQuantite: '0', origPrixUnitaire: '0', origDateAppro: today,
      hasExisting, saving: false, saved: false, error: '',
    };
  }
  return state;
}

// ────────────────────────────────────────────────────────────────────────────

interface PerteModalProps {
  ingredientId: number;
  nom: string;
  activiteId?: number;
  stockDisponible?: number | null;
  onSaveOverride?: (ingredientId: number, quantite: number, typePerte: string, datePerte: string) => Promise<void>;
  onAfterSave?: () => void;
  onClose: () => void;
}

function PerteModal({ ingredientId, nom, activiteId, stockDisponible, onSaveOverride, onAfterSave, onClose }: PerteModalProps) {
  const [quantite, setQuantite] = useState('');
  const [typePerte, setTypePerte] = useState<'avarie' | 'dechet'>('avarie');
  const [datePerte, setDatePerte] = useState(todayStr());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [prixUnitaire, setPrixUnitaire] = useState<number | null>(null);
  const [loadingPrix, setLoadingPrix] = useState(false);
  const [loadingRange, setLoadingRange] = useState(true);
  const [dateMin, setDateMin] = useState<string | null>(null);
  const [, setDateMax] = useState<string | null>(null);

  // Fetch allowed date range (all-time first appro) on open
  useEffect(() => {
    const fetchRange = async () => {
      setLoadingRange(true);
      try {
        let res;
        if (activiteId) {
          res = await api.get(`/api/entreprise/pertes/date-range`, { params: { activiteId, ingredientId } });
        } else {
          res = await api.get(`/api/stock/client/pertes/date-range`, { params: { ingredientId } });
        }
        const { minDate, maxDate } = res.data;
        setDateMin(minDate ?? null);
        setDateMax(maxDate ?? null);
        if (minDate) {
          const today = todayStr();
          if (today < minDate) setDatePerte(minDate);
        }
      } catch { /* keep defaults */ }
      setLoadingRange(false);
    };
    fetchRange();
  }, [ingredientId, activiteId]);

  const fetchPrix = async (date: string) => {
    setLoadingPrix(true);
    try {
      let res;
      if (activiteId) {
        res = await api.get(`/api/entreprise/pertes/prix`, { params: { activiteId, ingredientId, date } });
      } else {
        res = await api.get(`/api/stock/client/pertes/prix`, { params: { ingredientId, date } });
      }
      setPrixUnitaire(res.data.prixUnitaire ?? null);
    } catch {
      setPrixUnitaire(null);
    }
    setLoadingPrix(false);
  };

  useEffect(() => { fetchPrix(datePerte); }, [datePerte]);

  const coutTotal = prixUnitaire != null && quantite && parseFloat(quantite) > 0
    ? prixUnitaire * parseFloat(quantite)
    : null;

  const submit = async () => {
    if (!quantite || parseFloat(quantite) <= 0) { setError('Quantité invalide'); return; }
    setSaving(true);
    setError('');
    try {
      if (onSaveOverride) {
        await onSaveOverride(ingredientId, parseFloat(quantite), typePerte, datePerte);
      } else {
        await api.post(`/api/entreprise/activites/${activiteId}/pertes`, {
          ingredientId,
          quantite: parseFloat(quantite),
          typePerte,
          datePerte,
        });
      }
      setDone(true);
      onAfterSave?.();
      setTimeout(onClose, 1200);
    } catch (e: unknown) {
      const d = (e as { response?: { data?: { message?: string; disponible?: number; demande?: number } } })?.response?.data;
      if (d?.disponible !== undefined) {
        setError(`Stock insuffisant — disponible : ${d.disponible} | demandé : ${d.demande}`);
      } else {
        setError(d?.message ?? 'Erreur serveur');
      }
    }
    setSaving(false);
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header" style={{ background: 'linear-gradient(135deg, #dc2626, #b91c1c)', borderBottom: 'none' }}>
          <h2 style={{ color: '#fff', margin: 0 }}>📉 Enregistrer une perte</h2>
          <button className="modal-close" onClick={onClose} style={{ color: '#fff' }}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontWeight: 600, color: 'var(--text)' }}>{nom}</p>
          {loadingRange ? (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>…</p>
          ) : done ? (
            <p style={{ color: 'var(--success)', fontWeight: 700, textAlign: 'center' }}>✓ Perte enregistrée</p>
          ) : !dateMin ? (
            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '14px 16px', textAlign: 'center' }}>
              <p style={{ margin: 0, color: '#92400e', fontWeight: 600, fontSize: '0.9rem' }}>
                Aucun approvisionnement enregistré pour cet article.
              </p>
              <p style={{ margin: '6px 0 0', color: '#b45309', fontSize: '0.8rem' }}>
                Enregistrez d'abord un appro avant de déclarer une perte.
              </p>
            </div>
          ) : (
            <>
              {stockDisponible !== null && stockDisponible !== undefined && (
                <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6, padding: '6px 12px', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.8rem', color: '#14532d', fontWeight: 600 }}>Stock disponible</span>
                  <span style={{ fontWeight: 700, color: stockDisponible <= 0 ? '#dc2626' : stockDisponible < 5 ? '#d97706' : '#15803d' }}>
                    {stockDisponible.toFixed(3)}
                  </span>
                </div>
              )}
              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Quantité perdue</label>
                <input type="number" min="0.001" step="0.001" className="input" style={{ width: '100%' }}
                  max={stockDisponible ?? undefined}
                  value={quantite} onChange={(e) => { setQuantite(e.target.value); setError(''); }} placeholder="0.000" />
                {stockDisponible !== null && stockDisponible !== undefined && quantite && parseFloat(quantite) > stockDisponible && (
                  <p style={{ color: '#dc2626', fontSize: '0.78rem', margin: '4px 0 0', fontWeight: 600 }}>
                    ⚠ Dépasse le stock disponible ({stockDisponible.toFixed(3)})
                  </p>
                )}
              </div>
              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Type de perte</label>
                <select className="input" style={{ width: '100%' }} value={typePerte} onChange={(e) => setTypePerte(e.target.value as 'avarie' | 'dechet')}>
                  <option value="avarie">Avarie</option>
                  <option value="dechet">Déchet</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Date de la perte</label>
                <input type="date" className="input" style={{ width: '100%' }}
                  min={dateMin} max={todayStr()} value={datePerte} onChange={(e) => setDatePerte(e.target.value)} />
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 3 }}>
                  Premier appro : {dateMin.split('-').reverse().join('/')}
                </p>
              </div>
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: '#7f1d1d', fontWeight: 600 }}>Prix unitaire appro</span>
                <span style={{ fontWeight: 700, color: '#991b1b', fontSize: '0.95rem' }}>
                  {loadingPrix ? '…' : prixUnitaire != null ? `${prixUnitaire.toFixed(3)} DT` : '—'}
                </span>
              </div>
              {coutTotal != null && (
                <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: '#7c2d12', fontWeight: 600 }}>Coût total</span>
                  <span style={{ fontWeight: 700, color: '#c2410c', fontSize: '0.95rem' }}>{coutTotal.toFixed(3)} DT</span>
                </div>
              )}
              {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</p>}
            </>
          )}
        </div>
        {!done && (
          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
            {!loadingRange && dateMin && (
              <button
                className="btn btn-danger btn-sm"
                style={{ background: '#be123c', color: '#fff', borderColor: '#be123c' }}
                onClick={submit}
                disabled={saving || (stockDisponible !== null && stockDisponible !== undefined && !!quantite && parseFloat(quantite) > stockDisponible)}
              >
                {saving ? '…' : 'Enregistrer la perte'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────

interface FournisseurAffectationModalProps {
  ingredientNom: string;
  fournisseurs: Fournisseur[];
  initialFournisseurId: string;
  initialRefFacture: string;
  onValidate: (fournisseurId: string, refFacture: string) => void;
  onClose: () => void;
}

function FournisseurAffectationModal({ ingredientNom, fournisseurs, initialFournisseurId, initialRefFacture, onValidate, onClose }: FournisseurAffectationModalProps) {
  const [fournisseurId, setFournisseurId] = useState(initialFournisseurId);
  const [refFacture, setRefFacture] = useState(initialRefFacture);

  const handleValidate = () => {
    onValidate(fournisseurId, refFacture);
    onClose();
  };

  const selectedFournisseur = fournisseurs.find((f) => String(f.id) === fournisseurId);

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header" style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', borderBottom: '1px solid #bfdbfe' }}>
          <div>
            <h2 style={{ color: '#1e40af', margin: 0 }}>🚚 Affectation Fournisseur</h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#3b82f6' }}>{ingredientNom}</p>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '20px 24px' }}>
          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Fournisseur</label>
            <select
              className="input" style={{ width: '100%', fontSize: '0.9rem' }}
              value={fournisseurId}
              onChange={(e) => setFournisseurId(e.target.value)}
            >
              <option value="">— Aucun fournisseur —</option>
              {fournisseurs.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.isLabo ? '🏭 ' : '🚚 '}{f.nom}
                </option>
              ))}
            </select>
            {selectedFournisseur?.telephone && (
              <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>📞 {selectedFournisseur.telephone}</p>
            )}
          </div>
          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Réf. Facture</label>
            <input
              type="text" className="input" style={{ width: '100%' }}
              placeholder="N° facture ou bon de livraison"
              value={refFacture}
              onChange={(e) => setRefFacture(e.target.value)}
            />
          </div>
        </div>
        <div className="modal-footer" style={{ borderTop: '1px solid var(--border)', padding: '12px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
          <button
            className="btn btn-primary"
            onClick={handleValidate}
            style={{ background: '#2563eb', color: '#fff', minWidth: 120 }}
          >
            ✓ Valider
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────

interface FournisseurInfoModalProps {
  ingredientNom: string;
  fournisseurNom: string;
  refFacture: string | null;
  onClose: () => void;
}

function FournisseurInfoModal({ ingredientNom, fournisseurNom, refFacture, onClose }: FournisseurInfoModalProps) {
  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header" style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', borderBottom: '1px solid #bfdbfe' }}>
          <div>
            <h2 style={{ color: '#1e40af', margin: 0 }}>🏭 Fournisseur Labo</h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#3b82f6' }}>{ingredientNom}</p>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '20px 24px' }}>
          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>Fournisseur</label>
            <p style={{ fontWeight: 600, margin: 0 }}>{fournisseurNom}</p>
          </div>
          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>Réf. Facture</label>
            <p style={{ margin: 0, color: refFacture ? 'var(--text)' : 'var(--text-muted)', fontStyle: refFacture ? 'normal' : 'italic' }}>{refFacture ?? '—'}</p>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0, fontStyle: 'italic' }}>Géré automatiquement par le labo — non modifiable.</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-primary" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────

interface ApproConflictEntry {
  ingredientNom: string;
  entries: StockHistoryEntry[];
}

interface ApproConflictModalProps {
  date: string;
  conflicts: ApproConflictEntry[];
  newQuantite?: number;
  onConfirm: () => void;
  onCancel: () => void;
}

function ApproConflictModal({ date, conflicts, newQuantite, onConfirm, onCancel }: ApproConflictModalProps) {
  const [y, m, d] = date.split('-');
  const dateLabel = `${d}/${m}/${y}`;
  const existingTotal = conflicts.reduce((sum, c) => sum + c.entries.reduce((s, e) => s + (e.quantite ?? 0), 0), 0);
  const newQty = newQuantite ?? 0;
  const nom = conflicts.length === 1 ? conflicts[0].ingredientNom : `${conflicts.length} ingrédient(s)`;
  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header" style={{ background: '#fffbeb', borderBottom: '1px solid #fde68a' }}>
          <h2 style={{ color: '#92400e', margin: 0, fontSize: '1rem' }}>⚠️ Appro existante — {nom}</h2>
          <button className="modal-close" onClick={onCancel}>×</button>
        </div>
        <div className="modal-body">
          <p style={{ marginBottom: 12 }}>
            Tu as déjà un appro à cette date (<strong>{dateLabel}</strong>) avec la quantité{' '}
            <strong>{existingTotal.toFixed(3)}</strong>.
          </p>
          <p style={{ marginBottom: 20 }}>
            Es-tu sûr d'ajouter <strong>{newQty.toFixed(3)}</strong> ?{' '}
            Car ça te fait un total d'appro de{' '}
            <strong style={{ color: '#d97706', fontSize: '1.05rem' }}>
              {existingTotal.toFixed(3)} + {newQty.toFixed(3)} = {(existingTotal + newQty).toFixed(3)}
            </strong>
          </p>
        </div>
        <div className="modal-footer" style={{ borderTop: '1px solid var(--border)', padding: '12px 20px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn btn-ghost" onClick={onCancel}>Annuler</button>
          <button className="btn btn-warning" onClick={onConfirm}
            style={{ background: '#d97706', color: '#fff', border: 'none', padding: '7px 20px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>
            Confirmer
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────

function seuilClass(total: number | null, seuil: number | null): string {
  if (total === null) return '';
  if (!seuil || seuil <= 0) return total === 0 ? 'stock-alert' : 'stock-ok';
  if (total <= 0) return 'stock-alert';
  if (total <= seuil) return 'stock-alert';
  if (total <= seuil * 1.1) return 'stock-warn';
  return 'stock-ok';
}

interface StockMatrixProps {
  entries: StockEntry[];
  categoryFilter: string;
  ingredientFilter?: number | '';
  nameFilter: string;
  fournisseurFilter?: string;
  refFactureFilter?: string;
  activiteId?: number;
  isEntreprise: boolean;
  fournisseurs?: Fournisseur[];
  onSave: (ingredientId: number, quantite: string, prixUnitaire: string, dateAppro: string, fournisseurId?: number | null, refFacture?: string | null, tauxTva?: number | null) => Promise<void>;
  onSavePT?: (produitId: number, quantite: string, dateAppro: string) => Promise<{ prixCalcule: number | null; dateAppro: string; totalQuantite: number }>;
  onSaveSeuilMin?: (ingredientId: number, seuilMin: number | null) => Promise<void>;
  onSavePerte?: (ingredientId: number, quantite: number, typePerte: string, datePerte: string) => Promise<void>;
  onRefresh?: () => void;
}

function StockMatrix({ entries, categoryFilter, ingredientFilter, nameFilter, fournisseurFilter, refFactureFilter, activiteId, isEntreprise, fournisseurs = [], onSave, onSavePT: _onSavePT, onSaveSeuilMin, onSavePerte, onRefresh }: StockMatrixProps) {
  const { t } = useTranslation();
  const { canWrite } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Record<number, StockRowState>>(() => buildInitialRowState(entries));
  const [historyOpen, setHistoryOpen] = useState<Record<number, boolean>>({});
  const [historyData, setHistoryData] = useState<Record<number, StockHistoryEntry[]>>({});
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const [pertesModal, setPertesModal] = useState<{ ingredientId: number; nom: string; stockDisponible?: number | null } | null>(null);
  const [affectationModal, setAffectationModal] = useState<{ ingredientId: number; nom: string } | null>(null);
  const [transfertInfoModal, setTransfertInfoModal] = useState<{ ingredientId: number; nom: string } | null>(null);
  const [seuilEdits, setSeuilEdits] = useState<Record<number, string>>({});
  const [, setSeuilSaving] = useState<Record<number, boolean>>({});
  const [totalOverrides, setTotalOverrides] = useState<Record<number, number>>({});
  const [ptRecipes, setPtRecipes] = useState<Record<number, Array<{ ingredientId: number; nom: string; portion: number; unite: string }>>>({});
  const [ptStockModal, setPtStockModal] = useState<{ produitId: number; nom: string } | null>(null);
  const [portionsModal, setPortionsModal] = useState<{ produitId: number; nom: string } | null>(null);

  const fetchPtRecipe = async (produitId: number) => {
    if (ptRecipes[produitId]) return;
    try {
      const { data } = await api.get(`/api/produits/${produitId}`);
      setPtRecipes((prev) => ({
        ...prev,
        [produitId]: (data.ingredients || []).map((r: { ingredientId: number; ingredientName?: string; nom?: string; portion: number | string; unitName?: string; unite?: string }) => ({
          ingredientId: r.ingredientId,
          nom: r.ingredientName || r.nom || '',
          portion: parseFloat(String(r.portion)) || 0,
          unite: r.unitName || r.unite || '',
        })),
      }));
    } catch {
      setPtRecipes((prev) => ({ ...prev, [produitId]: [] }));
    }
  };

  // ── Bulk appro
  const [bulkDate, setBulkDate] = useState(todayStr());
  const [bulkFournisseurId, setBulkFournisseurId] = useState('');
  const [bulkRefFacture, setBulkRefFacture] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [seuilModal, setSeuilModal] = useState<{ ingredientId: number; nom: string; error?: string } | null>(null);

  // ── Conflict confirmation modal
  const [conflictModal, setConflictModal] = useState<{
    date: string;
    conflicts: ApproConflictEntry[];
    newQuantite?: number;
    onConfirm: () => void;
  } | null>(null);

  const toggleCat = (cat: string) => setOpenCats((prev) => { const n = new Set(prev); if (n.has(cat)) n.delete(cat); else n.add(cat); return n; });

  useEffect(() => {
    setRows(buildInitialRowState(entries));
    setTotalOverrides({});
    const initial: Record<number, string> = {};
    for (const e of entries) {
      initial[e.ingredientId] = e.seuilMin !== null ? String(e.seuilMin) : '';
    }
    setSeuilEdits(initial);
  }, [entries]);

  const updateRow = (id: number, field: keyof StockRowState, value: string) => {
    if (field === 'dateAppro') {
      const entry = entries.find((e) => e.ingredientId === id);
      const hist = historyData[id] || [];
      const histDates = new Set(hist.map((h) => h.dateAppro).filter(Boolean) as string[]);
      const hasExisting = entry ? entry.quantite !== null : false;
      const conflictsLast = hasExisting && value === entry?.dateAppro;
      const conflictsHistory = histDates.has(value);
      const hasConflict = conflictsLast || conflictsHistory;
      setRows((prev) => ({
        ...prev,
        [id]: {
          ...prev[id],
          dateAppro: value,
          quantite: hasConflict ? '0' : prev[id].quantite,
          prixUnitaire: hasConflict ? '0' : prev[id].prixUnitaire,
          saved: false, error: '',
        },
      }));
    } else {
      setRows((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value, saved: false, error: '' } }));
    }
  };

  const isCurrentMonth = (dateStr: string) => {
    if (!dateStr || dateStr.length < 7) return false;
    const now = new Date();
    const [y, m] = dateStr.split('-');
    return parseInt(y) === now.getFullYear() && parseInt(m) === now.getMonth() + 1;
  };

  const saveSeuilMin = async (id: number): Promise<boolean> => {
    if (!onSaveSeuilMin) return false;
    const raw = seuilEdits[id]?.trim();
    const val = raw ? parseFloat(raw) : null;
    setSeuilSaving((p) => ({ ...p, [id]: true }));
    try {
      await onSaveSeuilMin(id, val);
      setSeuilSaving((p) => ({ ...p, [id]: false }));
      return true;
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erreur serveur';
      setSeuilSaving((p) => ({ ...p, [id]: false }));
      setSeuilModal((prev) => prev ? { ...prev, error: msg } : prev);
      return false;
    }
  };

  const fetchHistory = async (id: number): Promise<StockHistoryEntry[]> => {
    if (historyData[id]) return historyData[id];
    const url = id < 0
      ? `/api/stock/pt/${-id}/history${activiteId ? `?activiteId=${activiteId}` : ''}`
      : isEntreprise && activiteId
      ? `/api/stock/entreprise/${activiteId}/${id}/history`
      : `/api/stock/client/${id}/history`;
    try {
      const { data } = await api.get(url);
      const entries: StockHistoryEntry[] = id < 0
        ? (data as any[]).map((e) => ({
            dateAppro: e.dateAppro,
            quantite: e.quantite,
            prixUnitaire: e.prixCalcule != null ? parseFloat(e.prixCalcule) : null,
            updatedAt: e.createdAt ?? null,
            typeAppro: 'manuel',
            fournisseurNom: null,
            refFacture: null,
          }))
        : (data as StockHistoryEntry[]);
      setHistoryData((prev) => ({ ...prev, [id]: entries }));
      return entries;
    } catch {
      setHistoryData((prev) => ({ ...prev, [id]: [] }));
      return [];
    }
  };

  const toggleHistory = async (id: number) => {
    const isOpen = historyOpen[id];
    setHistoryOpen((prev) => ({ ...prev, [id]: !isOpen }));
    if (!isOpen) await fetchHistory(id);
  };

  const doBulkSave = async () => {
    setBulkSaving(true);
    setBulkError('');
    try {
      const readyEntries = Object.entries(rows).filter(([idStr, row]) => {
        const id = Number(idStr);
        const entry = entries.find((e) => e.ingredientId === id);
        if (entry?.isPT) return false;
        const qty = parseFloat(row.quantite);
        const prix = parseFloat(row.prixUnitaire);
        return !isNaN(qty) && qty > 0 && !isNaN(prix) && prix > 0;
      });
      for (const [idStr, row] of readyEntries) {
        const ingId = Number(idStr);
        await onSave(ingId, row.quantite, row.prixUnitaire, bulkDate,
          bulkFournisseurId ? Number(bulkFournisseurId) : null,
          bulkRefFacture.trim() || null,
          row.tauxTva.trim() ? parseFloat(row.tauxTva) : null);
        if (isCurrentMonth(bulkDate)) {
          const added = parseFloat(row.quantite) || 0;
          setTotalOverrides((prev) => {
            const base = prev[ingId] ?? (entries.find((e) => e.ingredientId === ingId)?.totalQuantite ?? 0);
            return { ...prev, [ingId]: (base as number) + added };
          });
        }
      }
      setBulkDate(todayStr());
      setBulkFournisseurId('');
      setBulkRefFacture('');
      setRows((prev) => {
        const next = { ...prev };
        for (const id of Object.keys(next)) {
          next[Number(id)] = { ...next[Number(id)], tauxTva: '' };
        }
        return next;
      });
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erreur lors de l\'enregistrement';
      setBulkError(msg);
    }
    setBulkSaving(false);
  };

  const saveBulkMatrix = async () => {
    if (!bulkDate) return;
    const readyIds = Object.entries(rows)
      .filter(([idStr, row]) => {
        const id = Number(idStr);
        const entry = entries.find((e) => e.ingredientId === id);
        if (entry?.isPT) return false;
        return parseFloat(row.quantite) > 0 && parseFloat(row.prixUnitaire) > 0;
      })
      .map(([idStr]) => Number(idStr));

    if (readyIds.length === 0) return;

    const histMap: Record<number, StockHistoryEntry[]> = {};
    await Promise.all(readyIds.map(async (id) => { histMap[id] = await fetchHistory(id); }));

    const conflicts: ApproConflictEntry[] = [];
    for (const ingId of readyIds) {
      const hist = histMap[ingId] || [];
      const conflictEntries = hist.filter((h) => h.dateAppro === bulkDate);
      const entry = entries.find((e) => e.ingredientId === ingId);
      const hasConflict = conflictEntries.length > 0 || (entry?.quantite !== null && bulkDate === entry?.dateAppro);
      if (hasConflict) {
        const displayEntries = conflictEntries.length > 0 ? conflictEntries : [{
          dateAppro: bulkDate, quantite: entry!.quantite, prixUnitaire: entry!.prixUnitaire,
          typeAppro: 'manuel', fournisseurNom: null, refFacture: null, updatedAt: null,
        }];
        conflicts.push({ ingredientNom: entry?.nom ?? `#${ingId}`, entries: displayEntries as StockHistoryEntry[] });
      }
    }

    if (conflicts.length > 0) {
      setConflictModal({ date: bulkDate, conflicts, onConfirm: () => { setConflictModal(null); doBulkSave(); } });
      return;
    }
    await doBulkSave();
  };

  let filtered = entries;
  if (categoryFilter) filtered = filtered.filter((e) => (e.categorie || t('client.ingredients_catalog.no_category')) === categoryFilter);
  if (ingredientFilter) filtered = filtered.filter((e) => e.ingredientId === ingredientFilter);
  if (nameFilter) filtered = filtered.filter((e) => e.nom.toLowerCase().includes(nameFilter.toLowerCase()));
  if (fournisseurFilter) filtered = filtered.filter((e) => String(e.lastFournisseurId ?? '') === fournisseurFilter);
  if (refFactureFilter) filtered = filtered.filter((e) => (e.lastRefFacture ?? '').toLowerCase().includes(refFactureFilter.toLowerCase()));

  if (filtered.length === 0) return <p className="text-muted" style={{ textAlign: 'center', padding: '32px 0' }}>{t('common.no_result')}</p>;

  const groups: Record<string, StockEntry[]> = {};
  for (const entry of filtered) {
    const cat = entry.categorie || t('client.ingredients_catalog.no_category');
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(entry);
  }

  const nonLaboFournisseurs = fournisseurs.filter((f) => !f.isLabo);
  const hasFournisseurs = nonLaboFournisseurs.length > 0;

  const readyCount = Object.entries(rows).filter(([idStr, row]) => {
    const id = Number(idStr);
    const entry = entries.find((e) => e.ingredientId === id);
    if (entry?.isPT) return false;
    const qty = parseFloat(row.quantite);
    const prix = parseFloat(row.prixUnitaire);
    return !isNaN(qty) && qty > 0 && !isNaN(prix) && prix > 0;
  }).length;
  const canSaveBulk = readyCount > 0 && !!bulkDate.trim()
    && (!hasFournisseurs || !!bulkFournisseurId) && !!bulkRefFacture.trim();

  return (
    <div>
      {conflictModal && (
        <ApproConflictModal
          date={conflictModal.date}
          conflicts={conflictModal.conflicts}
          newQuantite={conflictModal.newQuantite}
          onConfirm={conflictModal.onConfirm}
          onCancel={() => setConflictModal(null)}
        />
      )}

      {pertesModal && (activiteId || onSavePerte) && (
        <PerteModal
          ingredientId={pertesModal.ingredientId}
          nom={pertesModal.nom}
          activiteId={activiteId}
          stockDisponible={pertesModal.stockDisponible}
          onSaveOverride={!activiteId && onSavePerte ? onSavePerte : undefined}
          onAfterSave={onRefresh}
          onClose={() => setPertesModal(null)}
        />
      )}

      {transfertInfoModal && (() => {
        const entry = entries.find((e) => e.ingredientId === transfertInfoModal.ingredientId);
        const f = fournisseurs.find((f) => f.id === entry?.lastFournisseurId);
        return f ? (
          <FournisseurInfoModal
            ingredientNom={transfertInfoModal.nom}
            fournisseurNom={f.nom}
            refFacture={entry?.lastRefFacture ?? null}
            onClose={() => setTransfertInfoModal(null)}
          />
        ) : null;
      })()}

      {affectationModal && hasFournisseurs && (
        <FournisseurAffectationModal
          ingredientNom={affectationModal.nom}
          fournisseurs={nonLaboFournisseurs}
          initialFournisseurId={rows[affectationModal.ingredientId]?.fournisseurId ?? ''}
          initialRefFacture={rows[affectationModal.ingredientId]?.refFacture ?? ''}
          onValidate={(fId, ref) => {
            setRows((prev) => ({
              ...prev,
              [affectationModal.ingredientId]: {
                ...prev[affectationModal.ingredientId],
                fournisseurId: fId,
                refFacture: ref,
                saved: false,
              },
            }));
          }}
          onClose={() => setAffectationModal(null)}
        />
      )}

      {ptStockModal && (() => {
        const recipe = ptRecipes[ptStockModal.produitId] ?? [];
        const rows2 = recipe.map((r) => {
          const stock = entries.find((e) => e.ingredientId === r.ingredientId)?.totalQuantite ?? 0;
          const maxUnits = r.portion > 0 ? stock / r.portion : Infinity;
          return { ...r, stock, maxUnits };
        });
        const overallMax = rows2.length > 0 ? Math.min(...rows2.map((r) => r.maxUnits)) : null;
        return (
          <div className="modal-overlay">
            <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header" style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)', borderBottom: 'none' }}>
                <h2 style={{ color: '#fff', margin: 0, fontSize: '1rem' }}>📊 Stock — {ptStockModal.nom}</h2>
                <button className="modal-close" onClick={() => setPtStockModal(null)} style={{ color: '#fff' }}>×</button>
              </div>
              <div className="modal-body">
                {recipe.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>Recette non chargée ou vide.</p>
                ) : (
                  <div className="table-responsive">
                    <table className="table" style={{ fontSize: '0.85rem' }}>
                      <thead>
                        <tr>
                          <th>Article</th>
                          <th style={{ textAlign: 'right' }}>Portion</th>
                          <th style={{ textAlign: 'right' }}>Stock actuel</th>
                          <th style={{ textAlign: 'right' }}>Max PT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows2.map((r) => (
                          <tr key={r.ingredientId}>
                            <td>{r.nom}</td>
                            <td style={{ textAlign: 'right' }}>{r.portion} {r.unite}</td>
                            <td style={{ textAlign: 'right', fontWeight: 600, color: r.stock <= 0 ? 'var(--danger)' : 'var(--success)' }}>{r.stock.toFixed(3)}</td>
                            <td style={{ textAlign: 'right', color: '#7c3aed', fontWeight: 700 }}>{isFinite(r.maxUnits) ? r.maxUnits.toFixed(3) : '∞'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {overallMax !== null && (
                  <div style={{ marginTop: 12, padding: '8px 14px', background: '#f5f3ff', borderRadius: 8, border: '1px solid #ddd6fe', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, color: '#7c3aed', fontSize: '0.85rem' }}>Quantité max réalisable</span>
                    <span style={{ fontWeight: 900, color: '#7c3aed', fontSize: '1.1rem' }}>{isFinite(overallMax) ? overallMax.toFixed(3) : '∞'}</span>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-primary" onClick={() => setPtStockModal(null)}>Fermer</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Portions custom modal */}
      {portionsModal && (
        <PortionsModal
          produitNom={portionsModal.nom}
          recipeUrl={activiteId
            ? `/api/stock/pt/${portionsModal.produitId}/recipe?activiteId=${activiteId}`
            : `/api/stock/pt/${portionsModal.produitId}/recipe`}
          stockMap={Object.fromEntries(entries.filter((e) => !e.isPT).map((e) => [e.ingredientId, e.quantite ?? 0]))}
          onSave={async (qty, dateAppro, customPortions) => {
            await api.put(`/api/stock/pt/${portionsModal.produitId}`, {
              quantite: qty,
              dateAppro,
              activiteId: activiteId ?? undefined,
              customPortions: customPortions.length > 0 ? customPortions : undefined,
            });
          }}
          onClose={() => setPortionsModal(null)}
          onSaved={() => { onRefresh?.(); }}
        />
      )}

      {/* Seuil min config modal */}
      {seuilModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}
          onClick={() => setSeuilModal(null)}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '24px', maxWidth: 360, width: '90%', boxShadow: '0 16px 48px rgba(0,0,0,0.2)' }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 6 }}>⚙ Seuil min</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 14 }}>{seuilModal.nom}</div>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Valeur minimale (laisser vide = désactivé)</label>
            <input type="number" min="0" step="0.001" className="input" style={{ width: '100%', marginBottom: 18 }}
              placeholder="0.000"
              value={seuilEdits[seuilModal.ingredientId] ?? ''}
              onChange={(e) => setSeuilEdits((p) => ({ ...p, [seuilModal.ingredientId]: e.target.value }))} />
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
              🔴 ≤ seuil &nbsp;·&nbsp; 🟠 seuil&nbsp;+&nbsp;10% &nbsp;·&nbsp; 🟢 au-dessus
            </div>
            {seuilModal.error && <p style={{ color: 'var(--danger)', fontSize: '0.8rem', margin: '0 0 8px' }}>{seuilModal.error}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setSeuilModal(null)}>Annuler</button>
              <button className="btn btn-primary btn-sm" onClick={async () => { const ok = await saveSeuilMin(seuilModal.ingredientId); if (ok) setSeuilModal(null); }}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {/* Approvisionnement bloc */}
      <div style={{
        background: 'var(--surface)', borderRadius: 12, padding: '18px 20px', marginBottom: 20,
        border: '1.5px solid #1e40af', boxShadow: '0 2px 10px rgba(30,64,175,0.10)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid #bfdbfe' }}>
          <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#1e40af' }}>Approvisionnement</span>
          {readyCount > 0 && (
            <span style={{ background: '#1e40af', color: '#fff', borderRadius: 20, padding: '1px 9px', fontSize: '0.72rem', fontWeight: 700 }}>{readyCount}</span>
          )}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: '0.62rem', fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 3 }}>Date d'appro <span style={{ color: '#ef4444' }}>*</span></label>
            <input type="date" className="input" style={{ padding: '6px 10px', borderRadius: 7, fontSize: '0.82rem', border: '1.5px solid #1e40af', background: '#fff', fontWeight: 600, maxWidth: 150 }} min={yearStart} max={todayStr()} value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: '0.62rem', fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 3 }}>Fournisseur</label>
            {hasFournisseurs ? (
              <select className="input" style={{ padding: '6px 10px', borderRadius: 7, fontSize: '0.82rem', border: '1.5px solid #1e40af', background: '#fff', fontWeight: 600, maxWidth: 200 }} value={bulkFournisseurId} onChange={(e) => setBulkFournisseurId(e.target.value)}>
                <option value="">— Sélectionner —</option>
                {nonLaboFournisseurs.map((f) => <option key={f.id} value={String(f.id)}>{f.nom}</option>)}
              </select>
            ) : (
              <select className="input" style={{ padding: '6px 10px', borderRadius: 7, fontSize: '0.82rem', maxWidth: 240, color: '#9a3412', fontStyle: 'italic', border: '2px solid #f97316', background: '#fff7ed' }} disabled>
                <option>⚠ Aucun fournisseur</option>
              </select>
            )}
          </div>
          <div>
            <label style={{ fontSize: '0.62rem', fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 3 }}>Réf Facture <span style={{ color: '#ef4444' }}>*</span></label>
            <input type="text" className="input" style={{ padding: '6px 10px', borderRadius: 7, fontSize: '0.82rem', border: '1.5px solid #1e40af', background: '#fff', fontWeight: 600, maxWidth: 160 }} placeholder="N° facture…" value={bulkRefFacture} onChange={(e) => setBulkRefFacture(e.target.value)} />
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignSelf: 'flex-end' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={saveBulkMatrix} disabled={!canSaveBulk || bulkSaving || !canWrite}
                style={{ background: canSaveBulk ? 'linear-gradient(135deg, #1e40af, #2563eb)' : undefined, border: 'none', boxShadow: canSaveBulk ? '0 3px 10px rgba(30,64,175,0.3)' : undefined }}>
                {bulkSaving ? '…' : `Enregistrer (${readyCount})`}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setBulkDate(todayStr()); setBulkFournisseurId(''); setBulkRefFacture(''); setBulkError(''); }}>
                Réinitialiser
              </button>
            </div>
            {bulkError && <p style={{ color: 'var(--danger)', fontSize: '0.8rem', margin: 0, textAlign: 'right' }}>{bulkError}</p>}
          </div>
        </div>
      </div>

      {Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([cat, items]) => {
        const isOpen = openCats.has(cat);
        return (
          <div key={cat} style={{ marginBottom: 8 }}>
            <button onClick={() => toggleCat(cat)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', width: '100%', textAlign: 'left', borderLeft: '4px solid #2563eb', borderBottom: '1px solid var(--border)', marginBottom: isOpen ? 10 : 0, borderRadius: isOpen ? '4px 4px 0 0' : 4 }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.06em' }}>🏷️ {cat}</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>({items.length})</span>
              <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{isOpen ? '▼' : '▶'}</span>
            </button>
            {isOpen && (
              <div className="table-responsive card th-blue" style={{ marginBottom: 0 }}>
                <table className="table">
                  <thead style={{ background: '#eff6ff', color: '#1e3a5f' }}>
                    <tr style={{ borderBottom: '1px solid #bfdbfe' }}>
                      {[
                        { label: t('client.stock.ingredient'), minWidth: 180 },
                        { label: 'Stock Actuel', minWidth: 110 },
                        { label: 'Coût Total', minWidth: 100 },
                        { label: 'Quantité', minWidth: 90 },
                        { label: 'Prix', minWidth: 100 },
                        { label: 'TVA (%)', minWidth: 80 },
                        { label: 'Actions', minWidth: 150 },
                      ].map(({ label, minWidth }) => (
                        <th key={label} style={{ fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.06em', textTransform: 'uppercase', padding: '10px 14px 4px', minWidth, textAlign: 'center' }}>
                          {label}
                        </th>
                      ))}
                    </tr>
                    <tr style={{ borderBottom: '2px solid #2563eb' }}>
                      {[
                        { sub: 'Hist.Appro · Unité' },
                        { sub: 'Pertes · PT · Transfert' },
                        { sub: 'HT · TTC' },
                        { sub: 'Nouvelle' },
                        { sub: 'HT / Unité' },
                        { sub: 'Optionnel' },
                        { sub: '' },
                      ].map(({ sub }, i) => (
                        <th key={i} style={{ fontWeight: 400, fontSize: '0.62rem', color: '#3b82f6', letterSpacing: '0.04em', padding: '2px 14px 8px', textAlign: 'center', opacity: 0.85 }}>
                          {sub}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((entry) => {
                      const row = rows[entry.ingredientId] ?? { quantite: '', prixUnitaire: '', dateAppro: todayStr(), fournisseurId: '', refFacture: '', saving: false, saved: false, error: '' };
                      const isHistOpen = historyOpen[entry.ingredientId] ?? false;
                      const hist = historyData[entry.ingredientId];
                      const totalQty = totalOverrides[entry.ingredientId] ?? entry.totalQuantite ?? null;
                      const cls = seuilClass(totalQty, entry.seuilMin ?? null);
                      const totalDisplay = totalQty !== null ? (totalQty as number).toFixed(3) : '—';
                      // Date conflict warning (using bloc date)
                      const histDatesSet = new Set<string>((hist || []).map((h) => h.dateAppro).filter(Boolean) as string[]);
                      const hasExisting = entry.quantite !== null;
                      const hasDateConflict = (hasExisting && bulkDate === entry.dateAppro) || histDatesSet.has(bulkDate);
                      const warnStyle = hasDateConflict ? { borderColor: '#f59e0b', boxShadow: '0 0 0 2px #fef3c7' } : {};
                      return (
                        <React.Fragment key={entry.ingredientId}>
                          <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '10px 14px', verticalAlign: 'middle', textAlign: 'center' }}>
                              <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text)' }}>{entry.nom}</div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, justifyContent: 'center' }}>
                                <span style={{ fontSize: '0.7rem', background: '#eff6ff', color: '#1e40af', borderRadius: 4, padding: '1px 7px', fontWeight: 600 }}>{entry.unite}</span>
                                <button onClick={() => toggleHistory(entry.ingredientId)}
                                  style={{ fontSize: '0.7rem', color: '#0891b2', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 3 }}>
                                  {isHistOpen ? '📋 ▲' : '📋 Historique'}
                                </button>
                              </div>
                              {entry.lastInvDate && (
                                <div style={{ fontSize: '0.67rem', color: '#b45309', fontWeight: 600, marginTop: 3 }}>📦 {entry.lastInvDate.split('-').reverse().join('/')} · {entry.lastInvQty?.toFixed(3) ?? '—'}</div>
                              )}
                            </td>
                            <td style={{ textAlign: 'center', padding: '10px 14px', verticalAlign: 'middle' }}>
                              <span className={cls} style={{ fontSize: '1rem', fontWeight: 800 }}>{totalDisplay}</span>
                              {entry.pertesDepuisInv != null && entry.pertesDepuisInv > 0 && (
                                <div style={{ fontSize: '0.67rem', color: '#dc2626', fontWeight: 500, marginTop: 2 }}>↘ {entry.pertesDepuisInv.toFixed(3)}</div>
                              )}
                              {entry.ptUsageDepuisInv != null && entry.ptUsageDepuisInv > 0 && (
                                <div style={{ fontSize: '0.67rem', color: '#7c3aed', fontWeight: 500, marginTop: 1 }}>PT {entry.ptUsageDepuisInv.toFixed(3)}</div>
                              )}
                            </td>
                            <td style={{ textAlign: 'center', padding: '10px 14px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                              {entry.coutTotal != null && entry.coutTotal > 0 ? (
                                <>
                                  <div>
                                    <span style={{ fontSize: '0.88rem', color: '#1d4ed8', fontWeight: 700 }}>{entry.coutTotal.toFixed(3)}</span>
                                    <span style={{ fontSize: '0.72rem', color: '#64748b', marginLeft: 2 }}>DT</span>
                                  </div>
                                  {entry.coutTotalTTC != null && entry.coutTotalTTC > 0 && entry.coutTotalTTC !== entry.coutTotal && (
                                    <div style={{ fontSize: '0.72rem', color: '#7c3aed', marginTop: 2 }}>
                                      {entry.coutTotalTTC.toFixed(3)} <span style={{ fontSize: '0.65rem', color: '#a78bfa' }}>TTC</span>
                                    </div>
                                  )}
                                </>
                              ) : <span style={{ color: '#cbd5e1', fontSize: '0.8rem' }}>—</span>}
                            </td>
                            <td style={{ textAlign: 'center', padding: '10px 14px', verticalAlign: 'middle' }}>
                              <input
                                type="number" min="0" step="0.001" placeholder="0"
                                value={row.quantite}
                                onChange={(e) => updateRow(entry.ingredientId, 'quantite', e.target.value)}
                                style={{ width: 80, textAlign: 'right', padding: '5px 8px', borderRadius: 7, fontSize: '0.85rem', ...warnStyle }}
                                className="input"
                                disabled={!canWrite}
                                title={entry.isPT && entry.prixPartiel ? '⚠️ Prix incomplet pour certains articles — calcul partiel' : undefined}
                              />
                              {entry.isPT && (entry.prixUnitaire ?? 0) > 0 && parseFloat(row.quantite) > 0 && (
                                <div style={{ fontSize: '0.7rem', color: '#2563eb', marginTop: 2 }}>
                                  ≈ {(parseFloat(row.quantite) * (entry.prixUnitaire || 0)).toFixed(3)} DT
                                  {entry.prixPartiel && ' ⚠️'}
                                </div>
                              )}
                            </td>
                            <td style={{ textAlign: 'center', padding: '10px 14px', verticalAlign: 'middle' }}>
                              {entry.isPT ? (
                                <span style={{ fontWeight: 700, color: '#1d4ed8', fontSize: '0.88rem' }}>
                                  {entry.prixUnitaire != null && entry.prixUnitaire > 0 ? entry.prixUnitaire.toFixed(3) : '—'}
                                  {entry.prixPartiel && <span style={{ fontSize: '0.68rem', color: '#d97706', marginLeft: 4 }}>⚠️</span>}
                                </span>
                              ) : (
                                <input
                                  type="number" min="0" step="0.001" placeholder="0.000"
                                  value={row.prixUnitaire}
                                  onChange={(e) => updateRow(entry.ingredientId, 'prixUnitaire', e.target.value)}
                                  style={{ width: 88, textAlign: 'right', padding: '5px 8px', borderRadius: 7, fontSize: '0.85rem', ...warnStyle }}
                                  className="input"
                                  disabled={!canWrite}
                                />
                              )}
                            </td>
                            <td style={{ textAlign: 'center', padding: '10px 14px', verticalAlign: 'middle' }}>
                              {!entry.isPT && (
                                <input
                                  type="number" min="0" max="100" step="0.1" placeholder="—"
                                  value={row.tauxTva}
                                  onChange={(e) => updateRow(entry.ingredientId, 'tauxTva', e.target.value)}
                                  style={{ width: 62, textAlign: 'right', padding: '5px 8px', borderRadius: 7, fontSize: '0.85rem' }}
                                  className="input"
                                  disabled={!canWrite}
                                />
                              )}
                            </td>
                            <td style={{ padding: '10px 14px', verticalAlign: 'middle', textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: 5, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
                                {row.error && <span style={{ color: 'var(--danger)', fontSize: '0.75rem', fontWeight: 700 }}>⚠</span>}
                                {entry.isPT && entry.produitId && (
                                  <>
                                    <button className="btn btn-ghost btn-sm" title="Stock des articles relatifs" style={{ fontSize: '0.78rem', padding: '3px 8px' }} onClick={() => { fetchPtRecipe(entry.produitId!); setPtStockModal({ produitId: entry.produitId!, nom: entry.nom }); }}>📊</button>
                                    {canWrite && (
                                      <button className="btn btn-ghost btn-sm" title="Portions personnalisées" style={{ fontSize: '0.78rem', padding: '3px 8px' }} onClick={() => setPortionsModal({ produitId: entry.produitId!, nom: entry.nom })}>⚙️</button>
                                    )}
                                  </>
                                )}
                                {onSaveSeuilMin && canWrite && (
                                  <button title="Configurer le seuil minimum" onClick={() => { setSeuilEdits((p) => ({ ...p, [entry.ingredientId]: entry.seuilMin !== null ? String(entry.seuilMin) : '' })); setSeuilModal({ ingredientId: entry.ingredientId, nom: entry.nom }); }}
                                    style={{ fontSize: '0.75rem', fontWeight: 700, padding: '4px 10px', borderRadius: 6, border: '1px solid #f97316', background: '#fff7ed', color: '#ea580c', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                    🔧 Seuil
                                  </button>
                                )}
                                {canWrite && ((isEntreprise && activiteId) || (!isEntreprise && onSavePerte)) && (
                                  <button className="perte-btn" style={{ whiteSpace: 'nowrap' }} onClick={() => setPertesModal({ ingredientId: entry.ingredientId, nom: entry.nom, stockDisponible: entry.quantite ?? null })} title="Enregistrer une perte">📉 Perte</button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {isHistOpen && (
                            <tr key={`${entry.ingredientId}-hist`}>
                              <td colSpan={7} style={{ background: '#f8faff', padding: '8px 16px' }}>
                                {!hist ? (
                                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('common.loading')}</span>
                                ) : hist.length === 0 ? (
                                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('client.stock.no_history')}</span>
                                ) : (
                                  <>
                                    <table style={{ fontSize: '0.8rem', width: '100%', marginBottom: 6 }}>
                                      <thead>
                                        <tr>
                                          <th style={{ textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, paddingBottom: 4 }}>{t('client.stock.date_appro')}</th>
                                          <th style={{ textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, paddingBottom: 4 }}>Type</th>
                                          <th style={{ textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600, paddingBottom: 4 }}>{t('client.stock.quantity')}</th>
                                          <th style={{ textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600, paddingBottom: 4 }}>Prix HT</th>
                                          <th style={{ textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600, paddingBottom: 4 }}>TVA%</th>
                                          <th style={{ textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600, paddingBottom: 4 }}>Prix TTC</th>
                                          <th style={{ color: 'var(--text-muted)', fontWeight: 600, paddingBottom: 4 }}>Fournisseur</th>
                                          <th style={{ color: 'var(--text-muted)', fontWeight: 600, paddingBottom: 4 }}>Réf. Facture</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {hist.map((h, i) => (
                                          <tr key={i}>
                                            <td style={{ color: 'var(--primary)', fontWeight: 600 }}>{fmtDate(h.dateAppro)}</td>
                                            <td>
                                              <span className={`badge-appro ${h.typeAppro ?? 'manuel'}`}>
                                                {h.typeAppro === 'transfert' ? 'Transfert' : 'Manuel'}
                                              </span>
                                            </td>
                                            <td style={{ textAlign: 'right' }}>{h.quantite ?? '—'}</td>
                                            <td style={{ textAlign: 'right' }}>{h.prixUnitaire != null ? h.prixUnitaire.toFixed(3) : '—'}</td>
                                            <td style={{ textAlign: 'right', color: (h as any).tauxTva != null ? '#0369a1' : 'var(--text-muted)' }}>{(h as any).tauxTva != null ? `${(h as any).tauxTva}%` : '—'}</td>
                                            <td style={{ textAlign: 'right', color: '#0369a1', fontWeight: 600 }}>{(h as any).prixUnitaireTva != null ? (h as any).prixUnitaireTva.toFixed(3) : '—'}</td>
                                            <td style={{ color: 'var(--text-muted)' }}>{h.fournisseurNom ?? '—'}</td>
                                            <td style={{ color: 'var(--text-muted)' }}>{h.refFacture ?? '—'}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                    <button
                                      className="btn btn-ghost btn-sm"
                                      style={{ fontSize: '0.75rem' }}
                                      onClick={() => {
                                        const params = new URLSearchParams({ ingredientId: String(entry.ingredientId) });
                                        if (isEntreprise && activiteId) params.set('activiteId', String(activiteId));
                                        navigate(`/client/stock/historique?${params}`);
                                      }}
                                    >
                                      📋 {t('client.stock.see_all_history')}
                                    </button>
                                  </>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────

interface ActivityStockSectionProps {
  label: string;
  activities: Activite[];
  initialActiviteId?: number;
  onSave: (activiteId: number, ingredientId: number, quantite: string, prixUnitaire: string, dateAppro: string, fournisseurId?: number | null, refFacture?: string | null, tauxTva?: number | null) => Promise<void>;
  onActiviteChange?: (nom: string) => void;
}

function ActivityStockSection({ label: _label, activities, initialActiviteId, onSave, onActiviteChange }: ActivityStockSectionProps) {
  const { t } = useTranslation();
  const { canWrite: _canWrite } = useAuth();
  void _canWrite;

  const [selectedId, setSelectedId] = useState<number>(initialActiviteId ?? activities[0]?.id ?? 0);
  const [entries, setEntries] = useState<StockEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [ingredientFilter, setIngredientFilter] = useState<number | ''>('');
  const [nameFilter, setNameFilter] = useState('');
  const [fournisseurFilter, setFournisseurFilter] = useState('');
  const [refFactureFilter, setRefFactureFilter] = useState('');

  const loadStock = useCallback(async (actId: number) => {
    setLoading(true);
    setLoadError('');
    setEntries([]);
    setCategoryFilter('');
    setNameFilter('');
    setFournisseurFilter('');
    setRefFactureFilter('');
    try {
      const [stockRes, foRes] = await Promise.all([
        api.get(`/api/stock/entreprise/${actId}`),
        api.get(`/api/entreprise/activites/${actId}/fournisseurs`),
      ]);
      setEntries(stockRes.data);
      setFournisseurs(foRes.data as Fournisseur[]);
    } catch {
      setLoadError('Impossible de charger le stock. Veuillez réessayer.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (selectedId) loadStock(selectedId);
  }, [selectedId, loadStock]);

  const handleSave = async (ingredientId: number, quantite: string, prixUnitaire: string, dateAppro: string, fournisseurId?: number | null, refFacture?: string | null, tauxTva?: number | null) => {
    await onSave(selectedId, ingredientId, quantite, prixUnitaire, dateAppro, fournisseurId, refFacture, tauxTva);
    if (selectedId) loadStock(selectedId);
  };

  const handleSavePT = async (produitId: number, quantite: string, dateAppro: string) => {
    const { data } = await api.put(`/api/stock/pt/${produitId}`, { quantite: parseFloat(quantite), dateAppro, activiteId: selectedId });
    if (selectedId) loadStock(selectedId);
    return data;
  };

  const handleSaveSeuilMin = async (ingredientId: number, seuilMin: number | null) => {
    if (ingredientId < 0) {
      await api.put(`/api/stock/pt/${-ingredientId}/seuil-min`, { seuilMin });
    } else {
      await api.put(`/api/stock/entreprise/${selectedId}/${ingredientId}/seuil-min`, { seuilMin });
    }
  };

  const allCategories = useMemo(() =>
    Array.from(new Set(
      entries.map((e) => e.categorie || t('client.ingredients_catalog.no_category'))
    )).sort()
  , [entries, t]);

  return (
    <div style={{ marginBottom: 36 }}>
      {/* Activité selector pills */}
      {activities.length > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, padding: '10px 14px', background: 'var(--card-bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
          {activities.map((a) => (
            <button
              key={a.id}
              onClick={() => { setSelectedId(a.id); onActiviteChange?.(a.nom); }}
              style={{
                padding: '4px 14px', borderRadius: 20, cursor: 'pointer', fontSize: '0.82rem',
                border: selectedId === a.id ? '1.5px solid #1e40af' : '1.5px solid var(--border)',
                background: selectedId === a.id ? '#1e40af' : 'var(--bg)',
                color: selectedId === a.id ? '#fff' : 'var(--text)',
                fontWeight: selectedId === a.id ? 700 : 400,
              }}
            >
              🏪 {a.nom}
            </button>
          ))}
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', alignSelf: 'center', marginLeft: 4 }}>← sélectionner l'activité</span>
        </div>
      )}

      {/* Filter panel — compact single-row layout */}
      <div style={{
        background: 'var(--surface)', borderRadius: 10, padding: '10px 14px', marginBottom: 20,
        border: '1px solid var(--border)', boxShadow: '0 1px 6px rgba(0,0,0,0.04)',
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          {/* (activité moved to pills above) */}
          {/* Catégorie */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <label style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>🏷️ Catégorie</label>
            <select style={{ padding: '6px 10px', borderRadius: 7, border: '1.5px solid var(--border)', fontSize: '0.82rem', background: 'var(--background)', minWidth: 140 }} value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setIngredientFilter(''); }}>
              <option value="">{t('client.catalogue_franchise.all_categories')}</option>
              {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {/* Ingrédient */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <label style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>🧂 Article</label>
            <select style={{ padding: '6px 10px', borderRadius: 7, border: '1.5px solid var(--border)', fontSize: '0.82rem', background: 'var(--background)', minWidth: 140 }} value={ingredientFilter} disabled={!categoryFilter}
              onChange={(e) => setIngredientFilter(e.target.value === '' ? '' : Number(e.target.value))}>
              <option value="">— Tous —</option>
              {entries.filter((e) => e.categorie === categoryFilter).map((e) => (
                <option key={e.ingredientId} value={e.ingredientId}>{e.nom}</option>
              ))}
            </select>
          </div>
          {/* Nom */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <label style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>🔍 Nom</label>
            <input type="text" style={{ padding: '6px 10px', borderRadius: 7, border: '1.5px solid var(--border)', fontSize: '0.82rem', background: 'var(--background)', minWidth: 130 }}
              placeholder={t('client.stock.search_ingredient')} value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} />
          </div>
          {/* Fournisseur — always visible */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <label style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>🚚 Fournisseur</label>
            {fournisseurs.length > 0 ? (
              <select style={{ padding: '6px 10px', borderRadius: 7, border: '1.5px solid var(--border)', fontSize: '0.82rem', background: 'var(--background)', minWidth: 140 }} value={fournisseurFilter} onChange={(e) => setFournisseurFilter(e.target.value)}>
                <option value="">— Tous —</option>
                {fournisseurs.map((f) => (
                  <option key={f.id} value={f.id}>{f.isLabo ? '🏭 ' : '🚚 '}{f.nom}</option>
                ))}
              </select>
            ) : (
              <select style={{ padding: '6px 10px', borderRadius: 7, border: '2px solid #f97316', fontSize: '0.82rem', background: '#fff7ed', minWidth: 140, color: '#9a3412', fontStyle: 'italic' }} disabled>
                <option>⚠ Aucun fournisseur</option>
              </select>
            )}
          </div>
          {/* Réf. Facture */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <label style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>🧾 Réf. Facture</label>
            <input type="text" style={{ padding: '6px 10px', borderRadius: 7, border: '1.5px solid var(--border)', fontSize: '0.82rem', background: 'var(--background)', minWidth: 130 }}
              placeholder="Réf. facture…" value={refFactureFilter} onChange={(e) => setRefFactureFilter(e.target.value)} />
          </div>
          {/* Reset */}
          {(categoryFilter || ingredientFilter !== '' || nameFilter || fournisseurFilter || refFactureFilter) && (
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 2 }}>
              <label style={{ fontSize: '0.62rem', opacity: 0 }}>x</label>
              <button onClick={() => { setCategoryFilter(''); setIngredientFilter(''); setNameFilter(''); setFournisseurFilter(''); setRefFactureFilter(''); }} style={{ alignSelf: 'flex-end', background: 'transparent', border: '1.5px solid var(--border)', borderRadius: 7, padding: '5px 9px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1, fontWeight: 700 }} title="Réinitialiser">✕</button>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-muted">{t('common.loading')}</p>
      ) : loadError ? (
        <div className="alert alert-danger" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>⚠️ {loadError}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => loadStock(selectedId)}>Réessayer</button>
        </div>
      ) : entries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>📦</div>
          <p>{t('client.stock.empty_stock')}</p>
        </div>
      ) : (
        <StockMatrix
          key={selectedId}
          entries={entries}
          categoryFilter={categoryFilter}
          ingredientFilter={ingredientFilter}
          nameFilter={nameFilter}
          fournisseurFilter={fournisseurFilter}
          refFactureFilter={refFactureFilter}
          activiteId={selectedId}
          isEntreprise={true}
          fournisseurs={fournisseurs}
          onSave={handleSave}
          onSavePT={handleSavePT}
          onSaveSeuilMin={handleSaveSeuilMin}
          onRefresh={() => { if (selectedId) loadStock(selectedId); }}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────

export default function StockPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const urlActiviteId = searchParams.get('activiteId') ? Number(searchParams.get('activiteId')) : undefined;

  const [typesSummary, setTypesSummary] = useState<ActiviteTypesSummary | null>(null);
  const [allActivities, setAllActivities] = useState<Activite[]>([]);
  const [activitesLoading, setActivitesLoading] = useState(false);
  const [activitesError, setActivitesError] = useState('');
  const [selectedActiviteNom, setSelectedActiviteNom] = useState('');

  useEffect(() => {
    setActivitesLoading(true);
    setActivitesError('');
    Promise.all([
      api.get('/api/entreprise/activites/types-summary'),
      api.get('/api/entreprise/activites'),
    ]).then(([summaryRes, activitesRes]) => {
      setTypesSummary(summaryRes.data as ActiviteTypesSummary);
      const acts = activitesRes.data as Activite[];
      setAllActivities(acts);
      const initId = searchParams.get('activiteId') ? Number(searchParams.get('activiteId')) : undefined;
      const initAct = initId ? acts.find((a) => a.id === initId) : acts[0];
      if (initAct) setSelectedActiviteNom(initAct.nom);
    }).catch(() => {
      setActivitesError('Impossible de charger les activités. Veuillez recharger la page.');
    }).finally(() => setActivitesLoading(false));
  }, []);

  const saveEntrepriseStock = async (activiteId: number, ingredientId: number, quantite: string, prixUnitaire: string, dateAppro: string, fournisseurId?: number | null, refFacture?: string | null, tauxTva?: number | null) => {
    await api.put(`/api/stock/entreprise/${activiteId}/${ingredientId}`, {
      quantite: quantite ? parseFloat(quantite) : null,
      prixUnitaire: prixUnitaire ? parseFloat(prixUnitaire) : null,
      dateAppro,
      fournisseurId: fournisseurId ?? null,
      refFacture: refFacture ?? null,
      tauxTva: tauxTva ?? null,
    });
  };

  const pageTitle = t('nav.stock_activite', 'Stock Activités');

  return (
    <div className="page-content">
      {/* Hero header */}
      <div style={{
        background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 55%, #3b82f6 100%)',
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(30,64,175,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>📦</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>
              {pageTitle}{selectedActiviteNom ? ` — ${selectedActiviteNom}` : ''}
            </h1>
          </div>
          <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.82rem' }}>
            Gérez les stocks et approvisionnements de vos activités
          </span>
        </div>
      </div>

      {activitesLoading ? (
        <p className="text-muted">{t('common.loading')}</p>
      ) : activitesError ? (
        <div className="alert alert-danger">⚠️ {activitesError}</div>
      ) : (
        <>
          {typesSummary?.hasActivites && allActivities.length > 0 ? (
            <ActivityStockSection
              label="Stock Activités"
              activities={allActivities}
              initialActiviteId={urlActiviteId}
              onSave={saveEntrepriseStock}
              onActiviteChange={setSelectedActiviteNom}
            />
          ) : (
            <div className="alert alert-warning">{t('client.stock.no_activities')}</div>
          )}
        </>
      )}
    </div>
  );
}
