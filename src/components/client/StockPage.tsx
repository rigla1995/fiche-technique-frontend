import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import PortionsModal from './PortionsModal';
import type { Activite, StockEntry, StockHistoryEntry, ActiviteTypesSummary, Fournisseur } from '../../types';

const currentYear = new Date().getFullYear();
const yearStart = `${currentYear}-01-01`;
const yearEnd = `${currentYear}-12-31`;
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

function canSaveStockRow(row: StockRowState, requireFournisseur = false): boolean {
  if (row.saving) return false;
  if (!row.quantite.trim() || !row.prixUnitaire.trim() || parseFloat(row.prixUnitaire) <= 0 || !row.dateAppro.trim()) return false;
  if (requireFournisseur && (!row.fournisseurId.trim() || !row.refFacture.trim())) return false;
  return true;
}

// ────────────────────────────────────────────────────────────────────────────

interface PerteModalProps {
  ingredientId: number;
  nom: string;
  activiteId?: number;
  onSaveOverride?: (ingredientId: number, quantite: number, typePerte: string, datePerte: string) => Promise<void>;
  onAfterSave?: () => void;
  onClose: () => void;
}

function PerteModal({ ingredientId, nom, activiteId, onSaveOverride, onAfterSave, onClose }: PerteModalProps) {
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
  const [dateMax, setDateMax] = useState<string | null>(null);

  // Fetch allowed date range (current-year appros only) on open
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
        // Clamp initial date to the allowed range
        if (minDate && maxDate) {
          const today = todayStr();
          if (today > maxDate) setDatePerte(maxDate);
          else if (today < minDate) setDatePerte(minDate);
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
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? 'Erreur serveur');
    }
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
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
          ) : !dateMin || !dateMax ? (
            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '14px 16px', textAlign: 'center' }}>
              <p style={{ margin: 0, color: '#92400e', fontWeight: 600, fontSize: '0.9rem' }}>
                Aucun approvisionnement enregistré pour cet ingrédient cette année.
              </p>
              <p style={{ margin: '6px 0 0', color: '#b45309', fontSize: '0.8rem' }}>
                Enregistrez d'abord un appro avant de déclarer une perte.
              </p>
            </div>
          ) : (
            <>
              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Quantité perdue</label>
                <input type="number" min="0.001" step="0.001" className="input" style={{ width: '100%' }}
                  value={quantite} onChange={(e) => setQuantite(e.target.value)} placeholder="0.000" />
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
                  min={dateMin} max={dateMax} value={datePerte} onChange={(e) => setDatePerte(e.target.value)} />
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 3 }}>
                  Appros {new Date().getFullYear()} : {dateMin.split('-').reverse().join('/')} → {dateMax.split('-').reverse().join('/')}
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
            {!loadingRange && dateMin && dateMax && (
              <button className="btn btn-danger btn-sm" style={{ background: '#be123c', color: '#fff', borderColor: '#be123c' }} onClick={submit} disabled={saving}>
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

interface HistoryPopupProps {
  ingredientId: number;
  nom: string;
  activiteId?: number;
  isEntreprise: boolean;
  onClose: () => void;
}

function HistoryPopup({ ingredientId, nom, activiteId, isEntreprise, onClose }: HistoryPopupProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<StockHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const url = isEntreprise && activiteId
      ? `/api/stock/entreprise/${activiteId}/${ingredientId}/history`
      : `/api/stock/client/${ingredientId}/history`;
    api.get(url)
      .then(({ data }) => setEntries(data as StockHistoryEntry[]))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [ingredientId, activiteId, isEntreprise]);

  const goFullHistory = () => {
    const params = new URLSearchParams({ ingredientId: String(ingredientId) });
    if (isEntreprise && activiteId) params.set('activiteId', String(activiteId));
    navigate(`/client/stock/historique?${params}`);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header modal-header--info">
          <h2>{t('client.stock.history_title', { nom })}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {loading ? (
            <p className="text-muted">{t('common.loading')}</p>
          ) : entries.length === 0 ? (
            <p className="text-muted">{t('client.stock.no_history')}</p>
          ) : (
            <div className="table-responsive th-blue" style={{ marginBottom: 0 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('client.stock.date_appro')}</th>
                    <th>Type</th>
                    <th style={{ textAlign: 'right' }}>{t('client.stock.quantity')}</th>
                    <th style={{ textAlign: 'right' }}>Prix (U/DT)</th>
                    <th>Fournisseur</th>
                    <th>Réf Facture</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600, color: 'var(--primary)' }}>{fmtDate(e.dateAppro)}</td>
                      <td>
                        <span className={`badge-appro ${e.typeAppro ?? 'manuel'}`}>
                          {e.typeAppro === 'transfert' ? 'Transfert' : 'Manuel'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>{e.quantite ?? '—'}</td>
                      <td style={{ textAlign: 'right' }}>{e.prixUnitaire != null ? e.prixUnitaire.toFixed(3) : '—'}</td>
                      <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{e.fournisseurNom ?? '—'}</td>
                      <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{e.refFacture ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={goFullHistory}>{t('client.stock.see_all_history')}</button>
          <button className="btn btn-primary" onClick={onClose}>{t('common.close')}</button>
        </div>
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
    <div className="modal-overlay" onClick={onClose}>
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
    <div className="modal-overlay" onClick={onClose}>
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
    <div className="modal-overlay" onClick={onCancel}>
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
  if (seuil === null) return total === 0 ? 'stock-alert' : 'stock-ok';
  if (total <= 0) return 'stock-alert';
  if (total <= seuil) return 'stock-warn';
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
  onSave: (ingredientId: number, quantite: string, prixUnitaire: string, dateAppro: string, fournisseurId?: number | null, refFacture?: string | null) => Promise<void>;
  onSavePT?: (produitId: number, quantite: string, dateAppro: string) => Promise<{ prixCalcule: number | null; dateAppro: string; totalQuantite: number }>;
  onSaveSeuilMin?: (ingredientId: number, seuilMin: number | null) => Promise<void>;
  onSavePerte?: (ingredientId: number, quantite: number, typePerte: string, datePerte: string) => Promise<void>;
  onRefresh?: () => void;
}

function StockMatrix({ entries, categoryFilter, ingredientFilter, nameFilter, fournisseurFilter, refFactureFilter, activiteId, isEntreprise, fournisseurs = [], onSave, onSavePT, onSaveSeuilMin, onSavePerte, onRefresh }: StockMatrixProps) {
  const { t } = useTranslation();
  const { canWrite } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Record<number, StockRowState>>(() => buildInitialRowState(entries));
  const [historyOpen, setHistoryOpen] = useState<Record<number, boolean>>({});
  const [historyData, setHistoryData] = useState<Record<number, StockHistoryEntry[]>>({});
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const [pertesModal, setPertesModal] = useState<{ ingredientId: number; nom: string } | null>(null);
  const [affectationModal, setAffectationModal] = useState<{ ingredientId: number; nom: string } | null>(null);
  const [transfertInfoModal, setTransfertInfoModal] = useState<{ ingredientId: number; nom: string } | null>(null);
  const [seuilEdits, setSeuilEdits] = useState<Record<number, string>>({});
  const [seuilSaving, setSeuilSaving] = useState<Record<number, boolean>>({});
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

  // ── Bulk appro selection
  const [selectedIngIds, setSelectedIngIds] = useState<Set<number>>(new Set());
  const [bulkDate, setBulkDate] = useState(todayStr());
  const [bulkFournisseurId, setBulkFournisseurId] = useState('');
  const [bulkRefFacture, setBulkRefFacture] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);

  // ── Conflict confirmation modal
  const [conflictModal, setConflictModal] = useState<{
    date: string;
    conflicts: ApproConflictEntry[];
    newQuantite: number;
    onConfirm: () => void;
  } | null>(null);

  const toggleCat = (cat: string) => setOpenCats((prev) => { const n = new Set(prev); if (n.has(cat)) n.delete(cat); else n.add(cat); return n; });

  useEffect(() => {
    setRows(buildInitialRowState(entries));
    setSelectedIngIds(new Set());
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

  const doSaveRow = async (id: number, row: StockRowState) => {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], saving: true, error: '' } }));
    try {
      let ptResponse: { prixCalcule: number | null; dateAppro: string; totalQuantite: number } | null = null;
      if (id < 0 && onSavePT) {
        ptResponse = await onSavePT(-id, row.quantite, row.dateAppro);
      } else {
        const fId = row.fournisseurId ? Number(row.fournisseurId) : null;
        const ref = row.refFacture.trim() || null;
        await onSave(id, row.quantite, row.prixUnitaire, row.dateAppro, fId, ref);
      }
      const today = todayStr();
      if (isCurrentMonth(row.dateAppro)) {
        const added = parseFloat(row.quantite) || 0;
        setTotalOverrides((prev) => {
          const base = prev[id] ?? (entries.find((e) => e.ingredientId === id)?.totalQuantite ?? 0);
          return { ...prev, [id]: (base as number) + added };
        });
      }
      setRows((prev) => ({
        ...prev,
        [id]: {
          ...prev[id],
          saving: false, saved: true, hasExisting: true,
          quantite: '0', prixUnitaire: '0', dateAppro: today,
          fournisseurId: '', refFacture: '',
          origQuantite: '0', origPrixUnitaire: '0', origDateAppro: today,
        },
      }));
      // Keep history cache and add saved entry so date-conflict alarm fires next time
      setHistoryData((prev) => {
        const savedPrix = ptResponse ? (ptResponse.prixCalcule ?? 0) : (parseFloat(row.prixUnitaire) || 0);
        const saved = {
          dateAppro: ptResponse ? ptResponse.dateAppro : row.dateAppro,
          quantite: parseFloat(row.quantite) || 0,
          prixUnitaire: savedPrix,
          typeAppro: 'manuel',
          fournisseurNom: null,
          refFacture: row.refFacture || null,
          updatedAt: new Date().toISOString(),
        };
        return { ...prev, [id]: [saved, ...(prev[id] || [])] };
      });
      setHistoryOpen((prev) => ({ ...prev, [id]: false }));
      setTimeout(() => setRows((prev) => ({ ...prev, [id]: { ...prev[id], saved: false } })), 2500);
      onRefresh?.();
    } catch {
      setRows((prev) => ({ ...prev, [id]: { ...prev[id], saving: false, error: t('common.error') } }));
    }
  };

  const saveRow = async (id: number) => {
    const row = rows[id];
    const entry = entries.find((e) => e.ingredientId === id);
    if (!row) return;
    if (entry?.isPT) {
      if (!row.quantite.trim() || parseFloat(row.quantite) <= 0 || !row.dateAppro.trim() || row.saving) return;
    } else {
      if (!canSaveStockRow(row, true)) return;
    }

    // Ensure history is loaded for conflict detection
    const hist = await fetchHistory(id);
    const conflictEntries = hist.filter((h) => h.dateAppro === row.dateAppro);
    const hasConflict = conflictEntries.length > 0 ||
      (entry?.quantite !== null && row.dateAppro === entry?.dateAppro);

    if (hasConflict) {
      const displayEntries = conflictEntries.length > 0 ? conflictEntries : [{
        dateAppro: entry!.dateAppro!, quantite: entry!.quantite,
        prixUnitaire: entry!.prixUnitaire, typeAppro: 'manuel',
        fournisseurNom: null, refFacture: null, updatedAt: null,
      }];
      setConflictModal({
        date: row.dateAppro,
        conflicts: [{ ingredientNom: entry?.nom ?? '', entries: displayEntries as StockHistoryEntry[] }],
        newQuantite: parseFloat(row.quantite) || 0,
        onConfirm: () => { setConflictModal(null); doSaveRow(id, row); },
      });
      return;
    }
    await doSaveRow(id, row);
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

  const toggleBulkSelect = (ingredientId: number) => {
    if (selectedIngIds.has(ingredientId)) {
      setSelectedIngIds((prev) => { const n = new Set(prev); n.delete(ingredientId); return n; });
      return;
    }
    const allValid = [...selectedIngIds].every((id) => {
      const rs = rows[id];
      if (!rs) return false;
      const qty = parseFloat(rs.quantite);
      const prix = parseFloat(rs.prixUnitaire);
      return !isNaN(qty) && qty > 0 && !isNaN(prix) && prix > 0;
    });
    if (selectedIngIds.size > 0 && !allValid) return;
    setSelectedIngIds((prev) => new Set([...prev, ingredientId]));
  };

  const doBulkSave = async () => {
    setBulkSaving(true);
    try {
      for (const ingId of selectedIngIds) {
        const row = rows[ingId];
        if (!row) continue;
        await onSave(ingId, row.quantite, row.prixUnitaire, bulkDate,
          bulkFournisseurId ? Number(bulkFournisseurId) : null,
          bulkRefFacture.trim() || null);
        if (isCurrentMonth(bulkDate)) {
          const added = parseFloat(row.quantite) || 0;
          setTotalOverrides((prev) => {
            const base = prev[ingId] ?? (entries.find((e) => e.ingredientId === ingId)?.totalQuantite ?? 0);
            return { ...prev, [ingId]: (base as number) + added };
          });
        }
      }
      setSelectedIngIds(new Set());
      setBulkDate(todayStr());
      setBulkFournisseurId('');
      setBulkRefFacture('');
    } catch { /* ignore */ }
    setBulkSaving(false);
  };

  const saveBulkMatrix = async () => {
    if (selectedIngIds.size === 0 || !bulkDate) return;

    // Pre-load history for all selected ingredients to detect conflicts
    const histMap: Record<number, StockHistoryEntry[]> = {};
    await Promise.all([...selectedIngIds].map(async (id) => {
      histMap[id] = await fetchHistory(id);
    }));

    const conflicts: ApproConflictEntry[] = [];
    for (const ingId of selectedIngIds) {
      const hist = histMap[ingId] || [];
      const conflictEntries = hist.filter((h) => h.dateAppro === bulkDate);
      const entry = entries.find((e) => e.ingredientId === ingId);
      const hasConflict = conflictEntries.length > 0 ||
        (entry?.quantite !== null && bulkDate === entry?.dateAppro);
      if (hasConflict) {
        const displayEntries = conflictEntries.length > 0 ? conflictEntries : [{
          dateAppro: bulkDate, quantite: entry!.quantite, prixUnitaire: entry!.prixUnitaire,
          typeAppro: 'manuel', fournisseurNom: null, refFacture: null, updatedAt: null,
        }];
        conflicts.push({ ingredientNom: entry?.nom ?? `#${ingId}`, entries: displayEntries as StockHistoryEntry[] });
      }
    }

    if (conflicts.length > 0) {
      setConflictModal({
        date: bulkDate,
        conflicts,
        onConfirm: () => { setConflictModal(null); doBulkSave(); },
      });
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

  const bulkAllValid = [...selectedIngIds].every((id) => {
    const rs = rows[id];
    if (!rs) return false;
    const qty = parseFloat(rs.quantite);
    const prix = parseFloat(rs.prixUnitaire);
    return !isNaN(qty) && qty > 0 && !isNaN(prix) && prix > 0;
  });
  const canSaveBulk = selectedIngIds.size > 0 && !!bulkDate.trim() && bulkAllValid
    && (!!bulkFournisseurId && !!bulkRefFacture.trim());

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
          <div className="modal-overlay" onClick={() => setPtStockModal(null)}>
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

      {/* Bulk appro form */}
      {selectedIngIds.size > 0 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16, padding: '12px 16px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10 }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.05em', alignSelf: 'center', marginRight: 4 }}>
            ✓ {selectedIngIds.size} sélectionné{selectedIngIds.size > 1 ? 's' : ''}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Date d'appro</span>
            <input type="date" className="input" style={{ maxWidth: 150 }} min={yearStart} max={todayStr()} value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} />
          </div>
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Fournisseur</span>
              <select className="input" style={{ maxWidth: 200 }} value={bulkFournisseurId} onChange={(e) => setBulkFournisseurId(e.target.value)}>
                <option value="">— Sélectionner —</option>
                {nonLaboFournisseurs.map((f) => <option key={f.id} value={String(f.id)}>{f.nom}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Réf Facture</span>
              <input type="text" className="input" style={{ maxWidth: 160 }} placeholder="N° facture…" value={bulkRefFacture} onChange={(e) => setBulkRefFacture(e.target.value)} />
            </div>
          </>
          <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-end' }}>
            <button className="btn btn-primary btn-sm" onClick={saveBulkMatrix} disabled={!canSaveBulk || bulkSaving || !canWrite}>
              {bulkSaving ? '…' : `Enregistrer (${selectedIngIds.size})`}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedIngIds(new Set()); setBulkDate(todayStr()); setBulkFournisseurId(''); setBulkRefFacture(''); }}>
              Annuler
            </button>
          </div>
        </div>
      )}

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
                      <th style={{ width: 32, fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '12px 14px' }}></th>
                      <th style={{ fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '12px 14px' }}>{t('client.stock.ingredient')}</th>
                      <th style={{ textAlign: 'right', fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '12px 14px' }}>Stock Actuel<br /><span style={{ fontSize: '0.65rem', fontWeight: 400, opacity: 0.75 }}>COUT · PERTES · PT</span></th>
                      <th style={{ textAlign: 'right', fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '12px 14px', minWidth: 90 }}>Inventaire<br /><span style={{ fontSize: '0.65rem', fontWeight: 400, opacity: 0.75 }}>DATE · QTÉ</span></th>
                      <th style={{ textAlign: 'center', fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '12px 14px' }}>Seuil min</th>
                      <th style={{ textAlign: 'right', fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '12px 14px' }}>Nouvelle Qté</th>
                      <th style={{ textAlign: 'right', fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '12px 14px' }}>Prix (U/DT)</th>
                      <th style={{ fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '12px 14px' }}>{t('client.stock.date_appro')}</th>
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
                      const assignedFournisseur = hasFournisseurs && row.fournisseurId
                        ? fournisseurs.find((f) => String(f.id) === row.fournisseurId)
                        : null;
                      const fournisseurValidated = !!assignedFournisseur && row.refFacture.trim() !== '';
                      // Date conflict warning
                      const histDatesSet = new Set<string>((hist || []).map((h) => h.dateAppro).filter(Boolean) as string[]);
                      const hasExisting = entry.quantite !== null;
                      const hasDateConflict = (hasExisting && row.dateAppro === entry.dateAppro) || histDatesSet.has(row.dateAppro);
                      const warnStyle = hasDateConflict ? { borderColor: '#f59e0b', boxShadow: '0 0 0 2px #fef3c7' } : {};
                      // Show green read-only button only when user picked a labo fournisseur in this session
                      const laboFournisseur = row.fournisseurId
                        ? (fournisseurs.find((f) => String(f.id) === row.fournisseurId && f.isLabo) ?? null)
                        : null;
                      const isSelected = selectedIngIds.has(entry.ingredientId);
                      const canSelect = isSelected || bulkAllValid || selectedIngIds.size === 0;
                      return (
                        <React.Fragment key={entry.ingredientId}>
                          <tr style={isSelected ? { background: '#f0fdf4' } : undefined}>
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={!canSelect}
                                onChange={() => toggleBulkSelect(entry.ingredientId)}
                                style={{ width: 16, height: 16, cursor: canSelect ? 'pointer' : 'not-allowed', accentColor: 'var(--primary)' }}
                                title={!canSelect ? 'Remplissez la qté et prix des ingrédients sélectionnés avant d\'en ajouter un autre' : undefined}
                              />
                            </td>
                            <td>
                              <div style={{ fontWeight: 600 }}>{entry.nom}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{entry.unite}</div>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <span className={cls} style={{ fontSize: '1rem', fontWeight: 800, color: cls === 'stock-ok' ? '#2563eb' : undefined }}>{totalDisplay}</span>
                              {entry.coutTotal != null && entry.coutTotal > 0 && (
                                <div style={{ fontSize: '0.72rem', color: '#1d4ed8', fontWeight: 500 }}>{entry.coutTotal.toFixed(3)} DT</div>
                              )}
                              {entry.pertesDepuisInv != null && entry.pertesDepuisInv > 0 && (
                                <div style={{ fontSize: '0.68rem', color: '#dc2626', fontWeight: 500 }}>Pertes: {entry.pertesDepuisInv.toFixed(3)}</div>
                              )}
                              {entry.ptUsageDepuisInv != null && entry.ptUsageDepuisInv > 0 && (
                                <div style={{ fontSize: '0.68rem', color: '#7c3aed', fontWeight: 500 }}>PT: {entry.ptUsageDepuisInv.toFixed(3)}</div>
                              )}
                            </td>
                            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                              {entry.lastInvDate ? (
                                <>
                                  <div style={{ fontSize: '0.72rem', color: '#1e3a5f', fontWeight: 700 }}>{entry.lastInvDate.split('-').reverse().join('/')}</div>
                                  <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{entry.lastInvQty?.toFixed(3) ?? '—'}</div>
                                </>
                              ) : <span style={{ fontSize: '0.72rem', color: '#cbd5e1' }}>—</span>}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="number" min="0" step="0.001" placeholder="—"
                                value={seuilEdits[entry.ingredientId] ?? ''}
                                onChange={(e) => setSeuilEdits((p) => ({ ...p, [entry.ingredientId]: e.target.value }))}
                                onBlur={() => saveSeuilMin(entry.ingredientId)}
                                style={{ width: 72, textAlign: 'right', fontSize: '0.82rem' }}
                                className="input"
                                disabled={!canWrite}
                                title={seuilSaving[entry.ingredientId] ? 'Enregistrement…' : 'Seuil minimum — auto-save'}
                              />
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
                              <input
                                type="date" className="input" style={{ maxWidth: 138, ...warnStyle }}
                                min={yearStart} max={todayStr()}
                                value={row.dateAppro}
                                onChange={(e) => updateRow(entry.ingredientId, 'dateAppro', e.target.value)}
                                onFocus={() => fetchHistory(entry.ingredientId)}
                                disabled={isSelected || !canWrite}
                                title={isSelected ? 'Date définie par le formulaire ci-dessus' : undefined}
                              />
                            </td>
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'stretch' }}>
                                {row.error && <span style={{ color: 'var(--danger)', fontSize: '0.75rem' }}>!</span>}
                                {!entry.isPT && (
                                  isSelected ? (
                                    <button className="btn btn-sm" disabled style={{ width: '100%', background: '#e5e7eb', color: '#9ca3af', border: '1px solid #d1d5db', fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      Fournisseur (bulk)
                                    </button>
                                  ) : laboFournisseur ? (
                                    <button className="btn btn-sm" onClick={() => setAffectationModal({ ingredientId: entry.ingredientId, nom: entry.nom })} style={{ width: '100%', background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      ✓ {laboFournisseur.nom}
                                    </button>
                                  ) : nonLaboFournisseurs.length === 0 ? (
                                    <button className="btn btn-sm" disabled title="Ajoutez d'abord un fournisseur dans la section Fournisseurs" style={{ width: '100%', background: '#fff7ed', color: '#92400e', border: '1px solid #fed7aa', fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'not-allowed' }}>
                                      ⚠️ Aucun fournisseur
                                    </button>
                                  ) : (
                                    <button className="btn btn-sm" onClick={() => setAffectationModal({ ingredientId: entry.ingredientId, nom: entry.nom })} disabled={!canWrite} style={{ width: '100%', background: fournisseurValidated ? '#dcfce7' : assignedFournisseur ? '#fef9c3' : '#eff6ff', color: fournisseurValidated ? '#15803d' : assignedFournisseur ? '#92400e' : '#2563eb', border: `1px solid ${fournisseurValidated ? '#86efac' : assignedFournisseur ? '#fde68a' : '#bfdbfe'}`, fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {fournisseurValidated ? `✓ ${assignedFournisseur!.nom}` : assignedFournisseur ? `${assignedFournisseur.nom}…` : '🚚 Fournisseur'}
                                    </button>
                                  )
                                )}
                                {entry.isPT && entry.produitId && (
                                  <div style={{ display: 'flex', gap: 4 }}>
                                    <button
                                      className="btn btn-ghost btn-sm"
                                      title="Stock des ingrédients relatifs"
                                      onClick={() => { fetchPtRecipe(entry.produitId!); setPtStockModal({ produitId: entry.produitId!, nom: entry.nom }); }}
                                    >
                                      📊
                                    </button>
                                    {canWrite && (
                                      <button
                                        className="btn btn-ghost btn-sm"
                                        title="Portions personnalisées pour cette appro"
                                        onClick={() => setPortionsModal({ produitId: entry.produitId!, nom: entry.nom })}
                                      >
                                        ⚙️
                                      </button>
                                    )}
                                  </div>
                                )}
                                <div style={{ display: 'flex', gap: 4 }}>
                                  {canWrite && ((isEntreprise && activiteId) || (!isEntreprise && onSavePerte)) && (
                                    <button className="perte-btn" onClick={() => setPertesModal({ ingredientId: entry.ingredientId, nom: entry.nom })} title="Enregistrer une perte">
                                      📉
                                    </button>
                                  )}
                                  {(() => {
                                    const ptMaxQty = entry.isPT && entry.produitId && ptRecipes[entry.produitId] && ptRecipes[entry.produitId].length > 0
                                      ? Math.min(...ptRecipes[entry.produitId].map((r) => {
                                          const stock = entries.find((e) => e.ingredientId === r.ingredientId)?.totalQuantite ?? 0;
                                          return r.portion > 0 ? stock / r.portion : Infinity;
                                        }))
                                      : null;
                                    const ptQtyExceeds = ptMaxQty !== null && isFinite(ptMaxQty)
                                      && row.quantite.trim() !== '' && parseFloat(row.quantite) > ptMaxQty;
                                    return (
                                      <>
                                        {ptQtyExceeds && (
                                          <span style={{ fontSize: '0.7rem', color: '#b91c1c', fontWeight: 700, alignSelf: 'center' }} title={`Max: ${ptMaxQty!.toFixed(3)}`}>
                                            Max: {ptMaxQty!.toFixed(3)}
                                          </span>
                                        )}
                                        <button
                                          className={`btn btn-sm ${row.saved ? 'btn-success' : 'btn-primary'}`}
                                          onClick={() => saveRow(entry.ingredientId)}
                                          disabled={entry.isPT
                                            ? (!row.quantite.trim() || parseFloat(row.quantite) <= 0 || !row.dateAppro.trim() || row.saving || !canWrite || !!ptQtyExceeds)
                                            : (!canSaveStockRow(row, true) || !canWrite)}
                                          style={!row.saved ? { background: 'linear-gradient(135deg, #2563eb, #0ea5e9)', boxShadow: '0 3px 10px rgba(37,99,235,0.3)', borderRadius: 8, border: 'none', color: '#fff', fontWeight: 700, flex: 1 } : { flex: 1 }}
                                        >
                                          {row.saving ? '…' : row.saved ? '✓' : t('client.stock.save')}
                                        </button>
                                      </>
                                    );
                                  })()}
                                  <button className="btn btn-ghost btn-sm" onClick={() => toggleHistory(entry.ingredientId)} title={t('client.stock.history')}>
                                    {isHistOpen ? '▲' : '▼'}
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                          {isHistOpen && (
                            <tr key={`${entry.ingredientId}-hist`}>
                              <td colSpan={9} style={{ background: '#f8faff', padding: '8px 16px' }}>
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
                                          <th style={{ textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600, paddingBottom: 4 }}>Prix (U/DT)</th>
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
  isFranchise?: boolean;
  initialActiviteId?: number;
  onSave: (activiteId: number, ingredientId: number, quantite: string, prixUnitaire: string, dateAppro: string, fournisseurId?: number | null, refFacture?: string | null) => Promise<void>;
}

function ActivityStockSection({ label, activities, isFranchise, initialActiviteId, onSave }: ActivityStockSectionProps) {
  const { t } = useTranslation();
  const { canWrite } = useAuth();

  const groups = useMemo(() => {
    const map: Record<string, Activite[]> = {};
    for (const a of activities) {
      const g = a.franchiseGroup || a.nom;
      if (!map[g]) map[g] = [];
      map[g].push(a);
    }
    return map;
  }, [activities]);

  const groupNames = useMemo(() => Object.keys(groups).sort(), [groups]);
  const hasMultipleGroups = groupNames.length > 1;

  const [selectedGroup, setSelectedGroup] = useState<string>(() => {
    if (initialActiviteId) {
      const act = activities.find((a) => a.id === initialActiviteId);
      if (act) return act.franchiseGroup || act.nom;
    }
    return groupNames[0] ?? '';
  });
  const groupActivities = useMemo(() => (selectedGroup ? (groups[selectedGroup] ?? activities) : activities), [groups, selectedGroup, activities]);

  const [selectedId, setSelectedId] = useState<number>(initialActiviteId ?? groupActivities[0]?.id ?? 0);
  const [entries, setEntries] = useState<StockEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [ingredientFilter, setIngredientFilter] = useState<number | ''>('');
  const [nameFilter, setNameFilter] = useState('');
  const [fournisseurFilter, setFournisseurFilter] = useState('');
  const [refFactureFilter, setRefFactureFilter] = useState('');
  const [duplicating, setDuplicating] = useState(false);
  const [dupMsg, setDupMsg] = useState('');

  useEffect(() => {
    if (initialActiviteId) return; // locked by gérant — don't override
    const first = groupActivities[0]?.id ?? 0;
    setSelectedId(first);
  }, [selectedGroup, initialActiviteId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleSave = async (ingredientId: number, quantite: string, prixUnitaire: string, dateAppro: string, fournisseurId?: number | null, refFacture?: string | null) => {
    await onSave(selectedId, ingredientId, quantite, prixUnitaire, dateAppro, fournisseurId, refFacture);
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

  const handleDuplicate = async () => {
    if (!window.confirm(t('client.stock.duplicate_confirm'))) return;
    setDuplicating(true);
    setDupMsg('');
    try {
      const { data } = await api.post(`/api/stock/entreprise/${selectedId}/duplicate-franchise`);
      setDupMsg(t('client.stock.duplicate_done', { count: data.duplicatedTo }));
      setTimeout(() => setDupMsg(''), 4000);
    } catch {
      setDupMsg(t('common.error'));
    }
    setDuplicating(false);
  };

  const allCategories = Array.from(new Set(
    entries.map((e) => e.categorie || t('client.ingredients_catalog.no_category'))
  )).sort();

  const groupHasLabo = groupActivities.some((a) => !!a.laboId);
  const canDuplicate = isFranchise && groupActivities.length > 1 && !groupHasLabo;

  return (
    <div style={{ marginBottom: 36 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, paddingBottom: 10, borderBottom: '2px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 4, height: 22, borderRadius: 4, background: 'linear-gradient(180deg, #2563eb 0%, #0ea5e9 100%)', display: 'inline-block', flexShrink: 0 }} />
          <h2 style={{ fontSize: '0.9rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text)', margin: 0 }}>{label}</h2>
        </div>
        {canDuplicate && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {dupMsg && <span style={{ fontSize: '0.8rem', color: 'var(--success)' }}>{dupMsg}</span>}
            <button className="btn btn-primary btn-sm" onClick={handleDuplicate} disabled={duplicating || !canWrite}>
              {duplicating ? '...' : `📋 ${t('client.stock.duplicate_franchise')}`}
            </button>
          </div>
        )}
      </div>

      {/* Filter panel */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '16px 20px', border: '1px solid var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Filtres</span>
          {(categoryFilter || ingredientFilter !== '' || nameFilter || fournisseurFilter || refFactureFilter) && (
            <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.78rem' }} onClick={() => { setCategoryFilter(''); setIngredientFilter(''); setNameFilter(''); setFournisseurFilter(''); setRefFactureFilter(''); }}>✕ Réinitialiser</button>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px 20px' }}>
          {isFranchise && hasMultipleGroups && !initialActiviteId && (
            <div>
              <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>Groupe</span>
              <select className="input" style={{ width: '100%' }} value={selectedGroup} onChange={(e) => setSelectedGroup(e.target.value)}>
                {groupNames.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          )}
          {!initialActiviteId && (
            <div>
              <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>Activité</span>
              <select className="input" style={{ width: '100%' }} value={selectedId} onChange={(e) => setSelectedId(Number(e.target.value))}>
                {(isFranchise ? groupActivities : activities).map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
              </select>
            </div>
          )}
          <div>
            <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>Catégorie</span>
            <select className="input" style={{ width: '100%' }} value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setIngredientFilter(''); }}>
              <option value="">{t('client.catalogue_franchise.all_categories')}</option>
              {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>Ingrédient</span>
            <select
              className="input" style={{ width: '100%' }} value={ingredientFilter} disabled={!categoryFilter}
              onChange={(e) => setIngredientFilter(e.target.value === '' ? '' : Number(e.target.value))}
            >
              <option value="">— Tous —</option>
              {entries.filter((e) => e.categorie === categoryFilter).map((e) => (
                <option key={e.ingredientId} value={e.ingredientId}>{e.nom}</option>
              ))}
            </select>
          </div>
          <div>
            <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>Nom</span>
            <input
              type="text" className="input" style={{ width: '100%' }}
              placeholder={t('client.stock.search_ingredient')}
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
            />
          </div>
          {fournisseurs.length > 0 && (
            <div>
              <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>Fournisseur</span>
              <select className="input" style={{ width: '100%' }} value={fournisseurFilter} onChange={(e) => setFournisseurFilter(e.target.value)}>
                <option value="">— Tous —</option>
                {fournisseurs.map((f) => (
                  <option key={f.id} value={f.id}>{f.isLabo ? '🏭 ' : '🚚 '}{f.nom}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>Réf. Facture</span>
            <input
              type="text" className="input" style={{ width: '100%' }}
              placeholder="Réf. facture…"
              value={refFactureFilter}
              onChange={(e) => setRefFactureFilter(e.target.value)}
            />
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
  const { user, canWrite } = useAuth();
  const [searchParams] = useSearchParams();
  const isEntreprise = user?.compteType === 'entreprise';
  const section = searchParams.get('section') as 'franchise' | 'distinct' | null;
  const urlActiviteId = searchParams.get('activiteId') ? Number(searchParams.get('activiteId')) : undefined;

  const [clientEntries, setClientEntries] = useState<StockEntry[]>([]);
  const [clientLoading, setClientLoading] = useState(false);
  const [clientCategoryFilter, setClientCategoryFilter] = useState('');
  const [clientIngredientFilter, setClientIngredientFilter] = useState<number | ''>('');
  const [clientNameFilter, setClientNameFilter] = useState('');
  const [clientFournisseurFilter, setClientFournisseurFilter] = useState('');
  const [clientRefFactureFilter, setClientRefFactureFilter] = useState('');

  const [typesSummary, setTypesSummary] = useState<ActiviteTypesSummary | null>(null);
  const [franchiseActivities, setFranchiseActivities] = useState<Activite[]>([]);
  const [distinctActivities, setDistinctActivities] = useState<Activite[]>([]);
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
    if (!isEntreprise) {
      loadClientStock();
      api.get('/api/fournisseurs').then(({ data }) => setIndepFournisseurs(data)).catch(() => setIndepFournisseurs([]));
    }
  }, [isEntreprise, loadClientStock]);

  useEffect(() => {
    if (!isEntreprise) return;
    setActivitesLoading(true);
    Promise.all([
      api.get('/api/entreprise/activites/types-summary'),
      api.get('/api/entreprise/activites'),
    ]).then(([summaryRes, activitesRes]) => {
      setTypesSummary(summaryRes.data as ActiviteTypesSummary);
      const all = activitesRes.data as Activite[];
      setFranchiseActivities(all.filter((a) => a.type === 'franchise'));
      setDistinctActivities(all.filter((a) => a.type === 'distincte' || a.type == null));
    }).catch(() => {}).finally(() => setActivitesLoading(false));
  }, [isEntreprise]);

  const saveClientStock = async (ingredientId: number, quantite: string, prixUnitaire: string, dateAppro: string, fournisseurId?: number | null, refFacture?: string | null) => {
    await api.put(`/api/stock/client/${ingredientId}`, {
      quantite: quantite ? parseFloat(quantite) : null,
      prixUnitaire: prixUnitaire ? parseFloat(prixUnitaire) : null,
      dateAppro,
      fournisseurId: fournisseurId ?? null,
      refFacture: refFacture ?? null,
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

  const saveEntrepriseStock = async (activiteId: number, ingredientId: number, quantite: string, prixUnitaire: string, dateAppro: string, fournisseurId?: number | null, refFacture?: string | null) => {
    await api.put(`/api/stock/entreprise/${activiteId}/${ingredientId}`, {
      quantite: quantite ? parseFloat(quantite) : null,
      prixUnitaire: prixUnitaire ? parseFloat(prixUnitaire) : null,
      dateAppro,
      fournisseurId: fournisseurId ?? null,
      refFacture: refFacture ?? null,
    });
  };

  const clientCategories = Array.from(new Set(
    clientEntries.map((e) => e.categorie || t('client.ingredients_catalog.no_category'))
  )).sort((a, b) => {
    if (a === 'Produits Transformés') return 1;
    if (b === 'Produits Transformés') return -1;
    return a.localeCompare(b);
  });

  const pageTitle = isEntreprise && section === 'franchise'
    ? t('nav.stock_franchise')
    : isEntreprise && section === 'distinct'
    ? t('nav.stock_distinct')
    : t('client.stock.title');

  const subtitle = isEntreprise && section === 'franchise'
    ? 'Gestion des approvisionnements franchise'
    : isEntreprise && section === 'distinct'
    ? 'Gestion des approvisionnements activités distinctes'
    : 'Gestion des approvisionnements et niveaux de stock';

  return (
    <div className="page-content">
      {/* Hero header */}
      <div style={{
        background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 60%, #0ea5e9 100%)',
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(37,99,235,0.25)',
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

      {!isEntreprise && (
        clientLoading ? (
          <p className="text-muted">{t('common.loading')}</p>
        ) : clientEntries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>📦</div>
            <p>{t('client.stock.empty_stock')}</p>
          </div>
        ) : (
          <>
            {/* Filter panel */}
            <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '16px 20px', border: '1px solid var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Filtres</span>
                {(clientCategoryFilter || clientIngredientFilter !== '' || clientNameFilter || clientFournisseurFilter || clientRefFactureFilter) && (
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.78rem' }} onClick={() => { setClientCategoryFilter(''); setClientIngredientFilter(''); setClientNameFilter(''); setClientFournisseurFilter(''); setClientRefFactureFilter(''); }}>✕ Réinitialiser</button>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px 20px' }}>
                <div>
                  <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>Catégorie</span>
                  <select className="input" style={{ width: '100%' }} value={clientCategoryFilter} onChange={(e) => { setClientCategoryFilter(e.target.value); setClientIngredientFilter(''); }}>
                    <option value="">{t('client.catalogue_franchise.all_categories')}</option>
                    {clientCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>Ingrédient</span>
                  <select
                    className="input" style={{ width: '100%' }} value={clientIngredientFilter} disabled={!clientCategoryFilter}
                    onChange={(e) => setClientIngredientFilter(e.target.value === '' ? '' : Number(e.target.value))}
                  >
                    <option value="">— Tous —</option>
                    {clientEntries.filter((e) => e.categorie === clientCategoryFilter).map((e) => (
                      <option key={e.ingredientId} value={e.ingredientId}>{e.nom}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>Nom</span>
                  <input
                    type="text" className="input" style={{ width: '100%' }}
                    placeholder={t('client.stock.search_ingredient')}
                    value={clientNameFilter}
                    onChange={(e) => setClientNameFilter(e.target.value)}
                  />
                </div>
                {indepFournisseurs.length > 0 && (
                  <div>
                    <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>Fournisseur</span>
                    <select className="input" style={{ width: '100%' }} value={clientFournisseurFilter} onChange={(e) => setClientFournisseurFilter(e.target.value)}>
                      <option value="">— Tous —</option>
                      {indepFournisseurs.map((f) => <option key={f.id} value={String(f.id)}>{f.nom}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>Réf. Facture</span>
                  <input
                    type="text" className="input" style={{ width: '100%' }}
                    placeholder="Réf. facture…"
                    value={clientRefFactureFilter}
                    onChange={(e) => setClientRefFactureFilter(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <StockMatrix
              entries={clientEntries}
              categoryFilter={clientCategoryFilter}
              ingredientFilter={clientIngredientFilter}
              nameFilter={clientNameFilter}
              fournisseurFilter={clientFournisseurFilter}
              refFactureFilter={clientRefFactureFilter}
              isEntreprise={false}
              fournisseurs={indepFournisseurs}
              onSave={saveClientStock}
              onSavePT={saveClientStockPT}
              onSaveSeuilMin={saveClientSeuilMin}
              onSavePerte={saveClientPerte}
              onRefresh={loadClientStock}
            />
          </>
        )
      )}

      {isEntreprise && (
        activitesLoading ? (
          <p className="text-muted">{t('common.loading')}</p>
        ) : (
          <>
            {(!section || section === 'franchise') && typesSummary?.hasFranchise && franchiseActivities.length > 0 && (
              <ActivityStockSection
                label={t('client.stock.franchise_section')}
                activities={franchiseActivities}
                isFranchise={true}
                initialActiviteId={urlActiviteId}
                onSave={saveEntrepriseStock}
              />
            )}
            {(!section || section === 'distinct') && typesSummary?.hasDistinct && distinctActivities.length > 0 && (
              <ActivityStockSection
                label={t('client.stock.distinct_section')}
                activities={distinctActivities}
                initialActiviteId={urlActiviteId}
                onSave={saveEntrepriseStock}
              />
            )}
            {!typesSummary?.hasFranchise && !typesSummary?.hasDistinct && (
              <div className="alert alert-warning">{t('client.stock.no_activities')}</div>
            )}
          </>
        )
      )}
    </div>
  );
}
