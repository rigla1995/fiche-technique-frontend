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
      fournisseurId: '', refFacture: '',
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
                Aucun approvisionnement enregistré pour cet ingrédient.
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
    } catch { /* ignore */ }
  };

  // ── Bulk appro
  const [bulkDate, setBulkDate] = useState(todayStr());
  const [bulkFournisseurId, setBulkFournisseurId] = useState('');
  const [bulkRefFacture, setBulkRefFacture] = useState('');
  const [bulkTauxTva, setBulkTauxTva] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [seuilModal, setSeuilModal] = useState<{ ingredientId: number; nom: string } | null>(null);

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

  const saveSeuilMin = async (id: number) => {
    if (!onSaveSeuilMin) return;
    const raw = seuilEdits[id]?.trim();
    const val = raw ? parseFloat(raw) : null;
    setSeuilSaving((p) => ({ ...p, [id]: true }));
    try { await onSaveSeuilMin(id, val); } catch { /* ignore */ }
    setSeuilSaving((p) => ({ ...p, [id]: false }));
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
          bulkTauxTva.trim() ? parseFloat(bulkTauxTva) : null);
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
    } catch { /* ignore */ }
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
    && !!bulkFournisseurId && !!bulkRefFacture.trim();

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
                          <th>Ingrédient</th>
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
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setSeuilModal(null)}>Annuler</button>
              <button className="btn btn-primary btn-sm" onClick={async () => { await saveSeuilMin(seuilModal.ingredientId); setSeuilModal(null); }}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {/* Approvisionnement (TVA) bloc */}
      <div style={{
        background: 'var(--surface)', borderRadius: 12, padding: '14px 18px', marginBottom: 20,
        border: '1.5px solid #1e40af', boxShadow: '0 2px 10px rgba(30,64,175,0.10)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#1e40af' }}>Approvisionnement (TVA)</span>
          {readyCount > 0 && (
            <span style={{ background: '#1e40af', color: '#fff', borderRadius: 20, padding: '1px 9px', fontSize: '0.72rem', fontWeight: 700 }}>{readyCount}</span>
          )}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Date d'appro</span>
            <input type="date" className="input" style={{ maxWidth: 150 }} min={yearStart} max={todayStr()} value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} />
          </div>
          {hasFournisseurs && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Fournisseur</span>
              <select className="input" style={{ maxWidth: 200 }} value={bulkFournisseurId} onChange={(e) => setBulkFournisseurId(e.target.value)}>
                <option value="">— Sélectionner —</option>
                {nonLaboFournisseurs.map((f) => <option key={f.id} value={String(f.id)}>{f.nom}</option>)}
              </select>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Réf Facture</span>
            <input type="text" className="input" style={{ maxWidth: 160 }} placeholder="N° facture…" value={bulkRefFacture} onChange={(e) => setBulkRefFacture(e.target.value)} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Taux TVA % <span style={{ fontWeight: 400, opacity: 0.7 }}>(optionnel)</span></span>
            <input type="number" min="0" max="100" step="0.1" className="input" style={{ maxWidth: 100 }} placeholder="ex: 19" value={bulkTauxTva} onChange={(e) => setBulkTauxTva(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-end', marginLeft: 'auto' }}>
            <button className="btn btn-primary btn-sm" onClick={saveBulkMatrix} disabled={!canSaveBulk || bulkSaving || !canWrite}
              style={{ background: canSaveBulk ? 'linear-gradient(135deg, #1e40af, #2563eb)' : undefined, border: 'none', boxShadow: canSaveBulk ? '0 3px 10px rgba(30,64,175,0.3)' : undefined }}>
              {bulkSaving ? '…' : `Enregistrer (${readyCount})`}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setBulkDate(todayStr()); setBulkFournisseurId(''); setBulkRefFacture(''); setBulkTauxTva(''); }}>
              Réinitialiser
            </button>
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
                  <thead style={{ background: '#eff6ff', borderBottom: '2px solid #2563eb', color: '#1e3a5f' }}>
                    <tr>
                      <th style={{ fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '12px 14px' }}>{t('client.stock.ingredient')}</th>
                      <th style={{ textAlign: 'right', fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '12px 14px' }}>Stock Actuel<br /><span style={{ fontSize: '0.65rem', fontWeight: 400, opacity: 0.75 }}>PERTES · PT</span></th>
                      <th style={{ textAlign: 'right', fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '12px 14px', minWidth: 90 }}>Coût Total</th>
                      <th style={{ textAlign: 'right', fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '12px 14px' }}>Nouvelle Qté</th>
                      <th style={{ textAlign: 'right', fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '12px 14px' }}>Prix (U/DT)</th>
                      <th style={{ fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '12px 14px' }}></th>
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
                          <tr>
                            <td>
                              <div style={{ fontWeight: 600 }}>{entry.nom}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{entry.unite}</div>
                              {entry.lastInvDate && (
                                <div style={{ fontSize: '0.68rem', color: '#b45309', fontWeight: 600, marginTop: 2 }}>📦 {entry.lastInvDate.split('-').reverse().join('/')} · {entry.lastInvQty?.toFixed(3) ?? '—'}</div>
                              )}
                              <button className="btn btn-ghost btn-sm" onClick={() => toggleHistory(entry.ingredientId)} title={t('client.stock.history')}
                                style={{ fontSize: '0.72rem', color: '#0891b2', marginTop: 4, padding: '2px 6px' }}>
                                {isHistOpen ? '📋▲ Historique' : '📋 Historique'}
                              </button>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <span className={cls} style={{ fontSize: '1rem', fontWeight: 800 }}>{totalDisplay}</span>
                              {entry.pertesDepuisInv != null && entry.pertesDepuisInv > 0 && (
                                <div style={{ fontSize: '0.68rem', color: '#dc2626', fontWeight: 500 }}>↘ Pertes: {entry.pertesDepuisInv.toFixed(3)}</div>
                              )}
                              {entry.ptUsageDepuisInv != null && entry.ptUsageDepuisInv > 0 && (
                                <div style={{ fontSize: '0.68rem', color: '#7c3aed', fontWeight: 500 }}>↘ PT: {entry.ptUsageDepuisInv.toFixed(3)}</div>
                              )}
                            </td>
                            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                              {entry.coutTotal != null && entry.coutTotal > 0 ? (
                                <>
                                  <span style={{ fontSize: '0.88rem', color: '#1d4ed8', fontWeight: 700 }}>{entry.coutTotal.toFixed(3)} DT</span>
                                  {entry.prixUnitaire != null && entry.prixUnitaire > 0 && (
                                    <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: 1 }}>{entry.prixUnitaire.toFixed(3)} DT/u</div>
                                  )}
                                </>
                              ) : <span style={{ fontSize: '0.72rem', color: '#cbd5e1' }}>—</span>}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <input
                                type="number" min="0" step="0.001" placeholder="0"
                                value={row.quantite}
                                onChange={(e) => updateRow(entry.ingredientId, 'quantite', e.target.value)}
                                style={{ width: 76, textAlign: 'right', ...warnStyle }}
                                className="input"
                                disabled={!canWrite}
                                title={entry.isPT && entry.prixPartiel ? '⚠️ Prix incomplet pour certains ingrédients — calcul partiel' : undefined}
                              />
                              {entry.isPT && (entry.prixUnitaire ?? 0) > 0 && parseFloat(row.quantite) > 0 && (
                                <div style={{ fontSize: '0.72rem', color: '#2563eb', marginTop: 2 }}>
                                  ≈ {(parseFloat(row.quantite) * (entry.prixUnitaire || 0)).toFixed(3)} DT
                                  {entry.prixPartiel && ' ⚠️'}
                                </div>
                              )}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {entry.isPT ? (
                                <span style={{ fontWeight: 600, color: '#1d4ed8', fontSize: '0.88rem' }}>
                                  {entry.prixUnitaire != null && entry.prixUnitaire > 0 ? `${entry.prixUnitaire.toFixed(3)}` : '—'}
                                  {entry.prixPartiel && <span style={{ fontSize: '0.7rem', color: '#d97706', marginLeft: 4 }}>⚠️ partiel</span>}
                                </span>
                              ) : (
                                <input
                                  type="number" min="0" step="0.001" placeholder="0.000"
                                  value={row.prixUnitaire}
                                  onChange={(e) => updateRow(entry.ingredientId, 'prixUnitaire', e.target.value)}
                                  style={{ width: 84, textAlign: 'right', ...warnStyle }}
                                  className="input"
                                  disabled={!canWrite}
                                />
                              )}
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                                {row.error && <span style={{ color: 'var(--danger)', fontSize: '0.75rem' }}>!</span>}
                                {entry.isPT && entry.produitId && (
                                  <>
                                    <button className="btn btn-ghost btn-sm" title="Stock des ingrédients relatifs" onClick={() => { fetchPtRecipe(entry.produitId!); setPtStockModal({ produitId: entry.produitId!, nom: entry.nom }); }}>📊</button>
                                    {canWrite && (
                                      <button className="btn btn-ghost btn-sm" title="Portions personnalisées" onClick={() => setPortionsModal({ produitId: entry.produitId!, nom: entry.nom })}>⚙️</button>
                                    )}
                                  </>
                                )}
                                {onSaveSeuilMin && canWrite && (
                                  <button title="Configurer le seuil minimum" onClick={() => { setSeuilEdits((p) => ({ ...p, [entry.ingredientId]: entry.seuilMin !== null ? String(entry.seuilMin) : '' })); setSeuilModal({ ingredientId: entry.ingredientId, nom: entry.nom }); }}
                                    style={{ fontSize: '0.75rem', fontWeight: 700, padding: '3px 8px', borderRadius: 6, border: '1px solid #f97316', background: '#fff7ed', color: '#ea580c', cursor: 'pointer' }}>
                                    🔧 Seuil
                                  </button>
                                )}
                                {canWrite && ((isEntreprise && activiteId) || (!isEntreprise && onSavePerte)) && (
                                  <button className="perte-btn" onClick={() => setPertesModal({ ingredientId: entry.ingredientId, nom: entry.nom, stockDisponible: entry.quantite ?? null })} title="Enregistrer une perte">📉 Perte</button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {isHistOpen && (
                            <tr key={`${entry.ingredientId}-hist`}>
                              <td colSpan={6} style={{ background: '#f8faff', padding: '8px 16px' }}>
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
}

function ActivityStockSection({ label, activities, initialActiviteId, onSave }: ActivityStockSectionProps) {
  const { t } = useTranslation();
  const { canWrite: _canWrite } = useAuth();
  void _canWrite;

  const [selectedId, setSelectedId] = useState<number>(initialActiviteId ?? activities[0]?.id ?? 0);
  const [entries, setEntries] = useState<StockEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [ingredientFilter, setIngredientFilter] = useState<number | ''>('');
  const [nameFilter, setNameFilter] = useState('');
  const [fournisseurFilter, setFournisseurFilter] = useState('');
  const [refFactureFilter, setRefFactureFilter] = useState('');

  const loadStock = useCallback(async (actId: number) => {
    setLoading(true);
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
    } catch { /* ignore */ }
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
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14, paddingBottom: 10, borderBottom: '2px solid var(--border)' }}>
        <span style={{ width: 4, height: 22, borderRadius: 4, background: 'linear-gradient(180deg, #2563eb 0%, #0ea5e9 100%)', display: 'inline-block', flexShrink: 0, marginRight: 10 }} />
        <h2 style={{ fontSize: '0.9rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text)', margin: 0 }}>{label}</h2>
      </div>

      {/* Filter panel */}
      <div style={{
        background: 'var(--surface)', borderRadius: 14, padding: '16px 20px', marginBottom: 24,
        border: '1px solid var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
      }}>
        {/* Panel header */}
        <div style={{ width: '100%', marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#1e40af' }}>Filtres</span>
          {(categoryFilter || ingredientFilter !== '' || nameFilter || fournisseurFilter || refFactureFilter) && (
            <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.78rem' }} onClick={() => { setCategoryFilter(''); setIngredientFilter(''); setNameFilter(''); setFournisseurFilter(''); setRefFactureFilter(''); }}>✕ Réinitialiser</button>
          )}
        </div>
        {/* Section 1: Entité & Produit */}
        <div style={{ marginBottom: 16, marginTop: 14 }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 16, height: 2, background: '#1e40af', display: 'inline-block', borderRadius: 2 }} />
            Entité &amp; Produit
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
            {!initialActiviteId && (
              <div>
                <label style={{ fontSize: '0.68rem', fontWeight: 800, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>🏪 Activité</label>
                <select style={{ padding: '9px 13px', borderRadius: 9, border: '1.5px solid #1e40af', fontSize: '0.88rem', background: '#eff6ff', minWidth: 160 }} value={selectedId} onChange={(e) => setSelectedId(Number(e.target.value))}>
                  {activities.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
                </select>
              </div>
            )}
            <div>
              <label style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>🏷️ Catégorie</label>
              <select style={{ padding: '9px 13px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: '0.88rem', background: 'var(--background)', minWidth: 160 }} value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setIngredientFilter(''); }}>
                <option value="">{t('client.catalogue_franchise.all_categories')}</option>
                {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>🧂 Ingrédient</label>
              <select style={{ padding: '9px 13px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: '0.88rem', background: 'var(--background)', minWidth: 160 }} value={ingredientFilter} disabled={!categoryFilter}
                onChange={(e) => setIngredientFilter(e.target.value === '' ? '' : Number(e.target.value))}>
                <option value="">— Tous —</option>
                {entries.filter((e) => e.categorie === categoryFilter).map((e) => (
                  <option key={e.ingredientId} value={e.ingredientId}>{e.nom}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>🔍 Nom</label>
              <input type="text" style={{ padding: '9px 13px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: '0.88rem', background: 'var(--background)', minWidth: 160 }}
                placeholder={t('client.stock.search_ingredient')} value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} />
            </div>
          </div>
        </div>
        {/* Divider */}
        <div style={{ marginBottom: 16, borderTop: '1px dashed var(--border)' }} />
        {/* Section 2: Fournisseur */}
        <div>
          <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 16, height: 2, background: '#3b82f6', display: 'inline-block', borderRadius: 2 }} />
            Fournisseur
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
            {fournisseurs.length > 0 && (
              <div>
                <label style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>🚚 Fournisseur</label>
                <select style={{ padding: '9px 13px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: '0.88rem', background: 'var(--background)', minWidth: 160 }} value={fournisseurFilter} onChange={(e) => setFournisseurFilter(e.target.value)}>
                  <option value="">— Tous —</option>
                  {fournisseurs.map((f) => (
                    <option key={f.id} value={f.id}>{f.isLabo ? '🏭 ' : '🚚 '}{f.nom}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>🧾 Réf. Facture</label>
              <input type="text" style={{ padding: '9px 13px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: '0.88rem', background: 'var(--background)', minWidth: 160 }}
                placeholder="Réf. facture…" value={refFactureFilter} onChange={(e) => setRefFactureFilter(e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-muted">{t('common.loading')}</p>
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
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const isEntreprise = true;
  const urlActiviteId = searchParams.get('activiteId') ? Number(searchParams.get('activiteId')) : undefined;

  const [clientEntries, setClientEntries] = useState<StockEntry[]>([]);
  const [clientLoading, setClientLoading] = useState(false);
  const [clientCategoryFilter, setClientCategoryFilter] = useState('');
  const [clientIngredientFilter, setClientIngredientFilter] = useState<number | ''>('');
  const [clientNameFilter, setClientNameFilter] = useState('');
  const [clientFournisseurFilter, setClientFournisseurFilter] = useState('');
  const [clientRefFactureFilter, setClientRefFactureFilter] = useState('');

  const [typesSummary, setTypesSummary] = useState<ActiviteTypesSummary | null>(null);
  const [allActivities, setAllActivities] = useState<Activite[]>([]);
  const [activitesLoading, setActivitesLoading] = useState(false);
  const [indepFournisseurs, setIndepFournisseurs] = useState<Fournisseur[]>([]);

  const loadClientStock = useCallback(async () => {
    setClientLoading(true);
    setClientCategoryFilter('');
    setClientNameFilter('');
    try {
      const { data } = await api.get('/api/stock/client');
      setClientEntries(data);
    } catch { /* ignore */ }
    setClientLoading(false);
  }, []);

  useEffect(() => {
    setActivitesLoading(true);
    Promise.all([
      api.get('/api/entreprise/activites/types-summary'),
      api.get('/api/entreprise/activites'),
    ]).then(([summaryRes, activitesRes]) => {
      setTypesSummary(summaryRes.data as ActiviteTypesSummary);
      setAllActivities(activitesRes.data as Activite[]);
    }).catch(() => {}).finally(() => setActivitesLoading(false));
  }, [isEntreprise]);

  const saveClientStock = async (ingredientId: number, quantite: string, prixUnitaire: string, dateAppro: string, fournisseurId?: number | null, refFacture?: string | null, tauxTva?: number | null) => {
    await api.put(`/api/stock/client/${ingredientId}`, {
      quantite: quantite ? parseFloat(quantite) : null,
      prixUnitaire: prixUnitaire ? parseFloat(prixUnitaire) : null,
      dateAppro,
      fournisseurId: fournisseurId ?? null,
      refFacture: refFacture ?? null,
      tauxTva: tauxTva ?? null,
    });
  };

  const saveClientStockPT = async (produitId: number, quantite: string, dateAppro: string) => {
    const { data } = await api.put(`/api/stock/pt/${produitId}`, { quantite: parseFloat(quantite), dateAppro });
    loadClientStock();
    return data;
  };

  const saveClientSeuilMin = async (ingredientId: number, seuilMin: number | null) => {
    if (ingredientId < 0) {
      await api.put(`/api/stock/pt/${-ingredientId}/seuil-min`, { seuilMin });
    } else {
      await api.put(`/api/stock/client/${ingredientId}/seuil-min`, { seuilMin });
    }
  };

  const saveClientPerte = async (ingredientId: number, quantite: number, typePerte: string, datePerte: string) => {
    await api.post(`/api/stock/client/pertes`, { ingredientId, quantite, typePerte, datePerte });
  };

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

  const clientCategories = useMemo(() =>
    Array.from(new Set(
      clientEntries.map((e) => e.categorie || t('client.ingredients_catalog.no_category'))
    )).sort((a, b) => {
      if (a === 'Produits Transformés') return 1;
      if (b === 'Produits Transformés') return -1;
      return a.localeCompare(b);
    })
  , [clientEntries, t]);

  const pageTitle = isEntreprise ? t('nav.stock_activite', 'Stock Activités') : t('client.stock.title');
  const subtitle = isEntreprise
    ? 'Gestion des approvisionnements et niveaux de stock'
    : 'Gestion des approvisionnements et niveaux de stock';

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
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>{pageTitle}</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>{subtitle}</p>
        </div>
      </div>

      {activitesLoading ? (
        <p className="text-muted">{t('common.loading')}</p>
      ) : (
        <>
          {typesSummary?.hasActivites && allActivities.length > 0 ? (
            <ActivityStockSection
              label="Stock Activités"
              activities={allActivities}
              initialActiviteId={urlActiviteId}
              onSave={saveEntrepriseStock}
            />
          ) : (
            <div className="alert alert-warning">{t('client.stock.no_activities')}</div>
          )}
        </>
      )}
    </div>
  );
}
