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
  if (!row.hasExisting) {
    return row.quantite.trim() !== '' && row.prixUnitaire.trim() !== '' && row.dateAppro.trim() !== '';
  }
  return row.quantite !== row.origQuantite || row.prixUnitaire !== row.origPrixUnitaire || row.dateAppro !== row.origDateAppro;
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
  activiteId?: number;
  isEntreprise: boolean;
  fournisseurs?: Fournisseur[];
  onSave: (ingredientId: number, quantite: string, prixUnitaire: string, dateAppro: string, fournisseurId?: number | null, refFacture?: string | null) => Promise<void>;
  onSaveSeuilMin?: (ingredientId: number, seuilMin: number | null) => Promise<void>;
  onSavePerte?: (ingredientId: number, quantite: number, typePerte: string, datePerte: string) => Promise<void>;
}

function StockMatrix({ entries, categoryFilter, ingredientFilter, nameFilter, activiteId, isEntreprise, fournisseurs = [], onSave, onSaveSeuilMin }: StockMatrixProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Record<number, StockRowState>>(() => buildInitialRowState(entries));
  const [historyOpen, setHistoryOpen] = useState<Record<number, boolean>>({});
  const [historyData, setHistoryData] = useState<Record<number, StockHistoryEntry[]>>({});
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const [pertesModal, setPertesModal] = useState<{ ingredientId: number; nom: string } | null>(null);
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

  const updateRow = (id: number, field: keyof StockRowState, value: string) =>
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value, saved: false, error: '' } }));

  const saveRow = async (id: number) => {
    const row = rows[id];
    if (!row || !canSaveStockRow(row)) return;
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], saving: true, error: '' } }));
    try {
      const fId = row.fournisseurId ? Number(row.fournisseurId) : null;
      const ref = row.refFacture.trim() || null;
      await onSave(id, row.quantite, row.prixUnitaire, row.dateAppro, fId, ref);
      setRows((prev) => ({
        ...prev,
        [id]: {
          ...prev[id],
          saving: false, saved: true, hasExisting: true,
          origQuantite: row.quantite, origPrixUnitaire: row.prixUnitaire, origDateAppro: row.dateAppro,
        },
      }));
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
                      {hasFournisseurs && <th>Fournisseur</th>}
                      {hasFournisseurs && <th>Réf Facture</th>}
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
                      const colSpan = 6 + (hasFournisseurs ? 2 : 0) + 1;
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
                                style={{ width: 90, textAlign: 'right' }}
                                className="input"
                              />
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <input
                                type="number" min="0" step="0.001" placeholder="0.000"
                                value={row.prixUnitaire}
                                onChange={(e) => updateRow(entry.ingredientId, 'prixUnitaire', e.target.value)}
                                style={{ width: 100, textAlign: 'right' }}
                                className="input"
                              />
                            </td>
                            <td>
                              <input
                                type="date" className="input" style={{ maxWidth: 150 }}
                                min={yearStart} max={yearEnd}
                                value={row.dateAppro}
                                onChange={(e) => updateRow(entry.ingredientId, 'dateAppro', e.target.value)}
                              />
                            </td>
                            {hasFournisseurs && (
                              <td>
                                <select
                                  className="input" style={{ maxWidth: 160, fontSize: '0.82rem' }}
                                  value={row.fournisseurId}
                                  onChange={(e) => updateRow(entry.ingredientId, 'fournisseurId', e.target.value)}
                                >
                                  <option value="">— Fournisseur —</option>
                                  {fournisseurs.map((f) => (
                                    <option key={f.id} value={f.id}>{f.nom}</option>
                                  ))}
                                </select>
                              </td>
                            )}
                            {hasFournisseurs && (
                              <td>
                                <input
                                  type="text" className="input" style={{ maxWidth: 120, fontSize: '0.82rem' }}
                                  placeholder="Réf facture"
                                  value={row.refFacture}
                                  onChange={(e) => updateRow(entry.ingredientId, 'refFacture', e.target.value)}
                                />
                              </td>
                            )}
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {row.error && <span style={{ color: 'var(--danger)', fontSize: '0.75rem', marginRight: 4 }}>!</span>}
                              <button
                                className={`btn btn-sm ${row.saved ? 'btn-success' : 'btn-primary'}`}
                                onClick={() => saveRow(entry.ingredientId)}
                                disabled={!canSaveStockRow(row)}
                                style={{ marginRight: 4 }}
                              >
                                {row.saving ? '…' : row.saved ? '✓' : t('client.stock.save')}
                              </button>
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
                              <td colSpan={colSpan} style={{ background: '#f8faff', padding: '8px 16px' }}>
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
        {(categoryFilter || ingredientFilter !== '' || nameFilter) && (
          <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-end' }} onClick={() => { setCategoryFilter(''); setIngredientFilter(''); setNameFilter(''); }}>✕</button>
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
