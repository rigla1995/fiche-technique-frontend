import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
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
    const qStr = e.quantite !== null ? String(e.quantite) : '';
    const pStr = e.prixUnitaire !== null ? String(e.prixUnitaire) : '';
    const dStr = hasExisting && e.dateAppro ? e.dateAppro : today;
    state[e.ingredientId] = {
      quantite: qStr, prixUnitaire: pStr, dateAppro: dStr,
      fournisseurId: '', refFacture: '',
      origQuantite: qStr, origPrixUnitaire: pStr, origDateAppro: dStr,
      hasExisting, saving: false, saved: false, error: '',
    };
  }
  return state;
}

function canSaveStockRow(row: StockRowState): boolean {
  if (row.saving) return false;
  return row.quantite.trim() !== '' && row.prixUnitaire.trim() !== '' && row.dateAppro.trim() !== '';
}

// ────────────────────────────────────────────────────────────────────────────

interface PerteModalProps {
  ingredientId: number;
  nom: string;
  activiteId: number;
  onClose: () => void;
}

function PerteModal({ ingredientId, nom, activiteId, onClose }: PerteModalProps) {
  const [quantite, setQuantite] = useState('');
  const [typePerte, setTypePerte] = useState<'avarie' | 'dechet'>('avarie');
  const [datePerte, setDatePerte] = useState(todayStr());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!quantite || parseFloat(quantite) <= 0) { setError('Quantité invalide'); return; }
    setSaving(true);
    setError('');
    try {
      await api.post(`/api/entreprise/activites/${activiteId}/pertes`, {
        ingredientId,
        quantite: parseFloat(quantite),
        typePerte,
        datePerte,
      });
      setDone(true);
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
        <div className="modal-header" style={{ background: '#fff1f2', borderBottom: '1px solid #fecdd3' }}>
          <h2 style={{ color: '#9f1239' }}>📉 Enregistrer une perte</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontWeight: 600, color: 'var(--text)' }}>{nom}</p>
          {done ? (
            <p style={{ color: 'var(--success)', fontWeight: 700, textAlign: 'center' }}>✓ Perte enregistrée</p>
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
                  min={yearStart} max={yearEnd} value={datePerte} onChange={(e) => setDatePerte(e.target.value)} />
              </div>
              {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</p>}
            </>
          )}
        </div>
        {!done && (
          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
            <button className="btn btn-danger btn-sm" style={{ background: '#be123c', color: '#fff', borderColor: '#be123c' }} onClick={submit} disabled={saving}>
              {saving ? '…' : 'Enregistrer la perte'}
            </button>
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
                      <td style={{ textAlign: 'right' }}>{e.prixUnitaire !== null ? e.prixUnitaire.toFixed(3) : '—'}</td>
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
  onSaveSeuilMin?: (ingredientId: number, seuilMin: number | null) => Promise<void>;
  onSavePerte?: (ingredientId: number, quantite: number, typePerte: string, datePerte: string) => Promise<void>;
}

function StockMatrix({ entries, categoryFilter, ingredientFilter, nameFilter, fournisseurFilter, refFactureFilter, activiteId, isEntreprise, fournisseurs = [], onSave, onSaveSeuilMin }: StockMatrixProps) {
  const { t } = useTranslation();
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

  const toggleCat = (cat: string) => setOpenCats((prev) => { const n = new Set(prev); if (n.has(cat)) n.delete(cat); else n.add(cat); return n; });

  useEffect(() => {
    setRows(buildInitialRowState(entries));
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

  const saveRow = async (id: number) => {
    const row = rows[id];
    if (!row || !canSaveStockRow(row)) return;
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], saving: true, error: '' } }));
    try {
      const fId = row.fournisseurId ? Number(row.fournisseurId) : null;
      const ref = row.refFacture.trim() || null;
      await onSave(id, row.quantite, row.prixUnitaire, row.dateAppro, fId, ref);
      const today = todayStr();
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
      setHistoryData((prev) => { const n = { ...prev }; delete n[id]; return n; });
      setHistoryOpen((prev) => ({ ...prev, [id]: false }));
      setTimeout(() => setRows((prev) => ({ ...prev, [id]: { ...prev[id], saved: false } })), 2500);
    } catch {
      setRows((prev) => ({ ...prev, [id]: { ...prev[id], saving: false, error: t('common.error') } }));
    }
  };

  const saveSeuilMin = async (id: number) => {
    if (!onSaveSeuilMin) return;
    const raw = seuilEdits[id]?.trim();
    const val = raw ? parseFloat(raw) : null;
    setSeuilSaving((p) => ({ ...p, [id]: true }));
    try { await onSaveSeuilMin(id, val); } catch { /* ignore */ }
    setSeuilSaving((p) => ({ ...p, [id]: false }));
  };

  const toggleHistory = async (id: number) => {
    const isOpen = historyOpen[id];
    setHistoryOpen((prev) => ({ ...prev, [id]: !isOpen }));
    if (!isOpen && !historyData[id]) {
      const url = isEntreprise && activiteId
        ? `/api/stock/entreprise/${activiteId}/${id}/history`
        : `/api/stock/client/${id}/history`;
      try {
        const { data } = await api.get(url);
        setHistoryData((prev) => ({ ...prev, [id]: data as StockHistoryEntry[] }));
      } catch { setHistoryData((prev) => ({ ...prev, [id]: [] })); }
    }
  };

  let filtered = entries;
  if (categoryFilter) filtered = filtered.filter((e) => (e.categorie || t('client.ingredients_catalog.no_category')) === categoryFilter);
  if (ingredientFilter) filtered = filtered.filter((e) => e.ingredientId === ingredientFilter);
  if (nameFilter) filtered = filtered.filter((e) => e.nom.toLowerCase().includes(nameFilter.toLowerCase()));
  if (fournisseurFilter) filtered = filtered.filter((e) => String(e.lastFournisseurId ?? '') === fournisseurFilter);
  if (refFactureFilter) filtered = filtered.filter((e) => (e.lastRefFacture ?? '').toLowerCase().includes(refFactureFilter.toLowerCase()));

  if (filtered.length === 0) return <p className="text-muted">{t('common.no_result')}</p>;

  const groups: Record<string, StockEntry[]> = {};
  for (const entry of filtered) {
    const cat = entry.categorie || t('client.ingredients_catalog.no_category');
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(entry);
  }

  const hasFournisseurs = isEntreprise && fournisseurs.length > 0;

  return (
    <div>
      {pertesModal && activiteId && (
        <PerteModal
          ingredientId={pertesModal.ingredientId}
          nom={pertesModal.nom}
          activiteId={activiteId}
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
          fournisseurs={fournisseurs}
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

      {Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([cat, items]) => {
        const isOpen = openCats.has(cat);
        return (
          <div key={cat} style={{ marginBottom: 8 }}>
            <button onClick={() => toggleCat(cat)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', width: '100%', textAlign: 'left', borderBottom: '2px solid var(--border)', marginBottom: isOpen ? 10 : 0 }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>🏷️ {cat}</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>({items.length})</span>
              <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{isOpen ? '▼' : '▶'}</span>
            </button>
            {isOpen && (
              <div className="table-responsive card th-blue" style={{ marginBottom: 0 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('client.stock.ingredient')}</th>
                      <th style={{ textAlign: 'right' }}>Total Stock</th>
                      <th style={{ textAlign: 'center' }}>Seuil min</th>
                      <th style={{ textAlign: 'right' }}>Nouvelle Qté</th>
                      <th style={{ textAlign: 'right' }}>Stock Prix (U/DT)</th>
                      <th>{t('client.stock.date_appro')}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((entry) => {
                      const row = rows[entry.ingredientId] ?? { quantite: '', prixUnitaire: '', dateAppro: todayStr(), fournisseurId: '', refFacture: '', saving: false, saved: false, error: '' };
                      const isHistOpen = historyOpen[entry.ingredientId] ?? false;
                      const hist = historyData[entry.ingredientId];
                      const cls = seuilClass(entry.totalQuantite ?? null, entry.seuilMin ?? null);
                      const totalDisplay = entry.totalQuantite !== null ? entry.totalQuantite.toFixed(3) : '—';
                      const assignedFournisseur = hasFournisseurs && row.fournisseurId
                        ? fournisseurs.find((f) => String(f.id) === row.fournisseurId)
                        : null;
                      // Date conflict warning
                      const histDatesSet = new Set<string>((hist || []).map((h) => h.dateAppro).filter(Boolean) as string[]);
                      const hasExisting = entry.quantite !== null;
                      const hasDateConflict = (hasExisting && row.dateAppro === entry.dateAppro) || histDatesSet.has(row.dateAppro);
                      const warnStyle = hasDateConflict ? { borderColor: '#f59e0b', boxShadow: '0 0 0 2px #fef3c7' } : {};
                      // Transfert labo fournisseur (read-only)
                      const isLastTransfert = entry.lastTypeAppro === 'transfert' && !row.fournisseurId;
                      const laboFournisseur = isLastTransfert ? fournisseurs.find((f) => f.id === entry.lastFournisseurId) ?? null : null;
                      return (
                        <>
                          <tr key={entry.ingredientId}>
                            <td>
                              <div style={{ fontWeight: 600 }}>{entry.nom}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{entry.unite}</div>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <span className={cls} style={{ fontSize: '1rem' }}>{totalDisplay}</span>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="number" min="0" step="0.001" placeholder="—"
                                value={seuilEdits[entry.ingredientId] ?? ''}
                                onChange={(e) => setSeuilEdits((p) => ({ ...p, [entry.ingredientId]: e.target.value }))}
                                onBlur={() => saveSeuilMin(entry.ingredientId)}
                                style={{ width: 72, textAlign: 'right', fontSize: '0.82rem' }}
                                className="input"
                                title={seuilSaving[entry.ingredientId] ? 'Enregistrement…' : 'Seuil minimum — auto-save'}
                              />
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <input
                                type="number" min="0" step="0.001" placeholder="0"
                                value={row.quantite}
                                onChange={(e) => updateRow(entry.ingredientId, 'quantite', e.target.value)}
                                style={{ width: 90, textAlign: 'right', ...warnStyle }}
                                className="input"
                              />
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <input
                                type="number" min="0" step="0.001" placeholder="0.000"
                                value={row.prixUnitaire}
                                onChange={(e) => updateRow(entry.ingredientId, 'prixUnitaire', e.target.value)}
                                style={{ width: 100, textAlign: 'right', ...warnStyle }}
                                className="input"
                              />
                            </td>
                            <td>
                              <input
                                type="date" className="input" style={{ maxWidth: 150, ...warnStyle }}
                                min={yearStart} max={yearEnd}
                                value={row.dateAppro}
                                onChange={(e) => updateRow(entry.ingredientId, 'dateAppro', e.target.value)}
                              />
                            </td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {row.error && <span style={{ color: 'var(--danger)', fontSize: '0.75rem', marginRight: 4 }}>!</span>}
                              {hasFournisseurs && (
                                laboFournisseur ? (
                                  <button
                                    className="btn btn-sm"
                                    onClick={() => setTransfertInfoModal({ ingredientId: entry.ingredientId, nom: entry.nom })}
                                    title="Voir le fournisseur labo"
                                    style={{
                                      marginRight: 4,
                                      background: '#dcfce7',
                                      color: '#15803d',
                                      border: '1px solid #86efac',
                                      fontSize: '0.78rem',
                                      whiteSpace: 'nowrap',
                                      maxWidth: 130,
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                    }}
                                  >
                                    ✓ {laboFournisseur.nom}
                                  </button>
                                ) : (
                                  <button
                                    className="btn btn-sm"
                                    onClick={() => setAffectationModal({ ingredientId: entry.ingredientId, nom: entry.nom })}
                                    title="Affecter un fournisseur"
                                    style={{
                                      marginRight: 4,
                                      background: assignedFournisseur ? '#dcfce7' : '#eff6ff',
                                      color: assignedFournisseur ? '#15803d' : '#2563eb',
                                      border: `1px solid ${assignedFournisseur ? '#86efac' : '#bfdbfe'}`,
                                      fontSize: '0.78rem',
                                      whiteSpace: 'nowrap',
                                      maxWidth: 130,
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                    }}
                                  >
                                    {assignedFournisseur ? `✓ ${assignedFournisseur.nom}` : '🚚 Fournisseur'}
                                  </button>
                                )
                              )}
                              {isEntreprise && activiteId && (
                                <button
                                  className="perte-btn"
                                  onClick={() => setPertesModal({ ingredientId: entry.ingredientId, nom: entry.nom })}
                                  title="Enregistrer une perte"
                                  style={{ marginRight: 4 }}
                                >
                                  📉
                                </button>
                              )}
                              <button
                                className={`btn btn-sm ${row.saved ? 'btn-success' : 'btn-primary'}`}
                                onClick={() => saveRow(entry.ingredientId)}
                                disabled={!canSaveStockRow(row)}
                                style={{ marginRight: 4 }}
                              >
                                {row.saving ? '…' : row.saved ? '✓' : t('client.stock.save')}
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => toggleHistory(entry.ingredientId)}
                                title={t('client.stock.history')}
                              >
                                {isHistOpen ? '▲' : '▼'}
                              </button>
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
                                            <td style={{ textAlign: 'right' }}>{h.prixUnitaire !== null ? h.prixUnitaire.toFixed(3) : '—'}</td>
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
                        </>
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
  onSave: (activiteId: number, ingredientId: number, quantite: string, prixUnitaire: string, dateAppro: string, fournisseurId?: number | null, refFacture?: string | null) => Promise<void>;
}

function ActivityStockSection({ label, activities, isFranchise, onSave }: ActivityStockSectionProps) {
  const { t } = useTranslation();

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

  const [selectedGroup, setSelectedGroup] = useState<string>(() => groupNames[0] ?? '');
  const groupActivities = useMemo(() => (selectedGroup ? (groups[selectedGroup] ?? activities) : activities), [groups, selectedGroup, activities]);

  const [selectedId, setSelectedId] = useState<number>(groupActivities[0]?.id ?? 0);
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
    const first = groupActivities[0]?.id ?? 0;
    setSelectedId(first);
  }, [selectedGroup]); // eslint-disable-line react-hooks/exhaustive-deps

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
  };

  const handleSaveSeuilMin = async (ingredientId: number, seuilMin: number | null) => {
    await api.put(`/api/stock/entreprise/${selectedId}/${ingredientId}/seuil-min`, { seuilMin });
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
            <button className="btn btn-primary btn-sm" onClick={handleDuplicate} disabled={duplicating}>
              {duplicating ? '...' : `📋 ${t('client.stock.duplicate_franchise')}`}
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {isFranchise && hasMultipleGroups && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Groupe</span>
            <select className="input" style={{ maxWidth: 200 }} value={selectedGroup} onChange={(e) => setSelectedGroup(e.target.value)}>
              {groupNames.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Activité</span>
          <select className="input" style={{ maxWidth: 220 }} value={selectedId} onChange={(e) => setSelectedId(Number(e.target.value))}>
            {groupActivities.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Catégorie</span>
          <select className="input" style={{ maxWidth: 200 }} value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setIngredientFilter(''); }}>
            <option value="">{t('client.catalogue_franchise.all_categories')}</option>
            {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ingrédient</span>
          <select
            className="input" style={{ maxWidth: 220 }} value={ingredientFilter} disabled={!categoryFilter}
            onChange={(e) => setIngredientFilter(e.target.value === '' ? '' : Number(e.target.value))}
          >
            <option value="">— Tous —</option>
            {entries.filter((e) => e.categorie === categoryFilter).map((e) => (
              <option key={e.ingredientId} value={e.ingredientId}>{e.nom}</option>
            ))}
          </select>
        </div>
        <input
          type="text" className="input"
          style={{ minWidth: 120, flex: '1 1 auto', maxWidth: 200, alignSelf: 'flex-end' }}
          placeholder={t('client.stock.search_ingredient')}
          value={nameFilter}
          onChange={(e) => setNameFilter(e.target.value)}
        />
        {fournisseurs.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fournisseur</span>
            <select className="input" style={{ maxWidth: 200 }} value={fournisseurFilter} onChange={(e) => setFournisseurFilter(e.target.value)}>
              <option value="">— Tous —</option>
              {fournisseurs.map((f) => (
                <option key={f.id} value={f.id}>{f.isLabo ? '🏭 ' : '🚚 '}{f.nom}</option>
              ))}
            </select>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Réf. Facture</span>
          <input
            type="text" className="input"
            style={{ minWidth: 120, maxWidth: 180 }}
            placeholder="Réf. facture…"
            value={refFactureFilter}
            onChange={(e) => setRefFactureFilter(e.target.value)}
          />
        </div>
        {(categoryFilter || ingredientFilter !== '' || nameFilter || fournisseurFilter || refFactureFilter) && (
          <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-end' }} onClick={() => { setCategoryFilter(''); setIngredientFilter(''); setNameFilter(''); setFournisseurFilter(''); setRefFactureFilter(''); }}>✕</button>
        )}
      </div>

      {loading ? (
        <p className="text-muted">{t('common.loading')}</p>
      ) : entries.length === 0 ? (
        <p className="text-muted">{t('client.stock.empty_stock')}</p>
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
          onSaveSeuilMin={handleSaveSeuilMin}
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
  const isEntreprise = user?.compteType === 'entreprise';
  const section = searchParams.get('section') as 'franchise' | 'distinct' | null;

  const [clientEntries, setClientEntries] = useState<StockEntry[]>([]);
  const [clientLoading, setClientLoading] = useState(false);
  const [clientCategoryFilter, setClientCategoryFilter] = useState('');
  const [clientNameFilter, setClientNameFilter] = useState('');

  const [typesSummary, setTypesSummary] = useState<ActiviteTypesSummary | null>(null);
  const [franchiseActivities, setFranchiseActivities] = useState<Activite[]>([]);
  const [distinctActivities, setDistinctActivities] = useState<Activite[]>([]);
  const [activitesLoading, setActivitesLoading] = useState(false);

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
    if (!isEntreprise) loadClientStock();
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

  const saveClientStock = async (ingredientId: number, quantite: string, prixUnitaire: string, dateAppro: string) => {
    await api.put(`/api/stock/client/${ingredientId}`, {
      quantite: quantite ? parseFloat(quantite) : null,
      prixUnitaire: prixUnitaire ? parseFloat(prixUnitaire) : null,
      dateAppro,
    });
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
  )).sort();

  const pageTitle = isEntreprise && section === 'franchise'
    ? t('nav.stock_franchise')
    : isEntreprise && section === 'distinct'
    ? t('nav.stock_distinct')
    : t('client.stock.title');

  return (
    <div className="page-content">
      <h1>{pageTitle}</h1>

      {!isEntreprise && (
        clientLoading ? (
          <p className="text-muted">{t('common.loading')}</p>
        ) : clientEntries.length === 0 ? (
          <p className="text-muted">{t('client.stock.empty_stock')}</p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <select className="input" style={{ maxWidth: 220 }} value={clientCategoryFilter} onChange={(e) => setClientCategoryFilter(e.target.value)}>
                <option value="">{t('client.catalogue_franchise.all_categories')}</option>
                {clientCategories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <input
                type="text" className="input"
                style={{ minWidth: 140, flex: '1 1 auto', maxWidth: 220 }}
                placeholder={t('client.stock.search_ingredient')}
                value={clientNameFilter}
                onChange={(e) => setClientNameFilter(e.target.value)}
              />
            </div>
            <StockMatrix
              entries={clientEntries}
              categoryFilter={clientCategoryFilter}
              nameFilter={clientNameFilter}
              isEntreprise={false}
              onSave={saveClientStock}
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
                onSave={saveEntrepriseStock}
              />
            )}
            {(!section || section === 'distinct') && typesSummary?.hasDistinct && distinctActivities.length > 0 && (
              <ActivityStockSection
                label={t('client.stock.distinct_section')}
                activities={distinctActivities}
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
