import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Activite, StockEntry, StockHistoryEntry, ActiviteTypesSummary } from '../../types';

const currentYear = new Date().getFullYear();
const yearStart = `${currentYear}-01-01`;
const yearEnd = `${currentYear}-12-31`;
const todayStr = () => new Date().toISOString().split('T')[0];

interface StockRowState {
  quantite: string;
  prixUnitaire: string;
  dateAppro: string;
  saving: boolean;
  saved: boolean;
  error: string;
}

function buildInitialRowState(entries: StockEntry[]): Record<number, StockRowState> {
  const state: Record<number, StockRowState> = {};
  const today = todayStr();
  for (const e of entries) {
    const hasValues = (e.quantite !== null && e.quantite > 0) || (e.prixUnitaire !== null && e.prixUnitaire > 0);
    state[e.ingredientId] = {
      quantite: e.quantite !== null ? String(e.quantite) : '',
      prixUnitaire: e.prixUnitaire !== null ? String(e.prixUnitaire) : '',
      dateAppro: hasValues && e.dateAppro ? e.dateAppro : today,
      saving: false, saved: false, error: '',
    };
  }
  return state;
}

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
      <div className="modal" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
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
            <table className="table">
              <thead>
                <tr>
                  <th>{t('client.stock.date_appro')}</th>
                  <th style={{ textAlign: 'right' }}>{t('client.stock.quantity')}</th>
                  <th style={{ textAlign: 'right' }}>{t('client.stock.unit_price')}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={i}>
                    <td>{e.dateAppro}</td>
                    <td style={{ textAlign: 'right' }}>{e.quantite ?? '—'}</td>
                    <td style={{ textAlign: 'right' }}>{e.prixUnitaire !== null ? e.prixUnitaire.toFixed(3) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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

interface StockMatrixProps {
  entries: StockEntry[];
  categoryFilter: string;
  nameFilter: string;
  activiteId?: number;
  isEntreprise: boolean;
  onSave: (ingredientId: number, quantite: string, prixUnitaire: string, dateAppro: string) => Promise<void>;
}

function StockMatrix({ entries, categoryFilter, nameFilter, activiteId, isEntreprise, onSave }: StockMatrixProps) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Record<number, StockRowState>>(() => buildInitialRowState(entries));
  const [historyFor, setHistoryFor] = useState<{ id: number; nom: string } | null>(null);

  useEffect(() => { setRows(buildInitialRowState(entries)); }, [entries]);

  const updateRow = (id: number, field: 'quantite' | 'prixUnitaire' | 'dateAppro', value: string) =>
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value, saved: false, error: '' } }));

  const saveRow = async (id: number) => {
    const row = rows[id];
    if (!row) return;
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], saving: true, error: '' } }));
    try {
      await onSave(id, row.quantite, row.prixUnitaire, row.dateAppro);
      setRows((prev) => ({ ...prev, [id]: { ...prev[id], saving: false, saved: true } }));
      setTimeout(() => setRows((prev) => ({ ...prev, [id]: { ...prev[id], saved: false } })), 2500);
    } catch {
      setRows((prev) => ({ ...prev, [id]: { ...prev[id], saving: false, error: t('common.error') } }));
    }
  };

  let filtered = entries;
  if (categoryFilter) filtered = filtered.filter((e) => (e.categorie || t('client.ingredients_catalog.no_category')) === categoryFilter);
  if (nameFilter) filtered = filtered.filter((e) => e.nom.toLowerCase().includes(nameFilter.toLowerCase()));

  if (filtered.length === 0) return <p className="text-muted">{t('common.no_result')}</p>;

  const groups: Record<string, StockEntry[]> = {};
  for (const entry of filtered) {
    const cat = entry.categorie || t('client.ingredients_catalog.no_category');
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(entry);
  }

  return (
    <div>
      {Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([cat, items]) => (
        <div key={cat} style={{ marginBottom: 28 }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--primary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            🏷️ {cat} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)' }}>({items.length})</span>
          </h3>
          <div className="stock-grid">
            {items.map((entry) => {
              const row = rows[entry.ingredientId] ?? { quantite: '', prixUnitaire: '', dateAppro: todayStr(), saving: false, saved: false, error: '' };
              return (
                <div key={entry.ingredientId} className="stock-card">
                  <div className="stock-card-header">
                    <span className="stock-ingredient-name">{entry.nom}</span>
                    <span className="stock-unit-badge">{entry.unite}</span>
                  </div>
                  <div className="stock-fields">
                    <div className="stock-field">
                      <label>{t('client.stock.date_appro')}</label>
                      <input
                        type="date"
                        min={yearStart}
                        max={yearEnd}
                        value={row.dateAppro}
                        onChange={(e) => updateRow(entry.ingredientId, 'dateAppro', e.target.value)}
                      />
                    </div>
                    <div className="stock-field">
                      <label>{t('client.stock.quantity')}</label>
                      <input
                        type="number" min="0" step="0.001" placeholder="0"
                        value={row.quantite}
                        onChange={(e) => updateRow(entry.ingredientId, 'quantite', e.target.value)}
                      />
                    </div>
                    <div className="stock-field">
                      <label>{t('client.stock.unit_price')} ({t('currency')})</label>
                      <input
                        type="number" min="0" step="0.001" placeholder="0.000"
                        value={row.prixUnitaire}
                        onChange={(e) => updateRow(entry.ingredientId, 'prixUnitaire', e.target.value)}
                      />
                    </div>
                  </div>
                  {row.error && <p className="form-error" style={{ fontSize: '0.75rem', margin: '4px 14px 0' }}>{row.error}</p>}
                  <div className="stock-card-footer">
                    {row.saved ? (
                      <span className="stock-saved-badge">{t('client.stock.saved')}</span>
                    ) : (
                      <button className="btn btn-primary btn-sm" onClick={() => saveRow(entry.ingredientId)} disabled={row.saving}>
                        {row.saving ? '...' : t('client.stock.save')}
                      </button>
                    )}
                  </div>
                  {/* History + Alert buttons */}
                  <div style={{ display: 'flex', gap: 6, padding: '0 14px 14px', borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 2 }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ flex: 1, fontSize: '0.75rem' }}
                      onClick={() => setHistoryFor({ id: entry.ingredientId, nom: entry.nom })}
                    >
                      📋 {t('client.stock.history')}
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ flex: 1, fontSize: '0.75rem', opacity: 0.45, cursor: 'not-allowed' }}
                      disabled
                      title="Fonctionnalité à venir"
                    >
                      🔔 {t('client.stock.alert')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {historyFor && (
        <HistoryPopup
          ingredientId={historyFor.id}
          nom={historyFor.nom}
          activiteId={activiteId}
          isEntreprise={isEntreprise}
          onClose={() => setHistoryFor(null)}
        />
      )}
    </div>
  );
}

interface ActivityStockSectionProps {
  label: string;
  activities: Activite[];
  isFranchise?: boolean;
  onSave: (activiteId: number, ingredientId: number, quantite: string, prixUnitaire: string, dateAppro: string) => Promise<void>;
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
  const [categoryFilter, setCategoryFilter] = useState('');
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
      const { data } = await api.get(`/api/stock/entreprise/${actId}`);
      setEntries(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (selectedId) loadStock(selectedId);
  }, [selectedId, loadStock]);

  const handleSave = async (ingredientId: number, quantite: string, prixUnitaire: string, dateAppro: string) => {
    await onSave(selectedId, ingredientId, quantite, prixUnitaire, dateAppro);
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

  const canDuplicate = isFranchise && groupActivities.length > 1;

  return (
    <div style={{ marginBottom: 36 }}>
      {/* Section header */}
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

      {/* Filter row */}
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
          <select className="input" style={{ maxWidth: 200 }} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">{t('client.catalogue_franchise.all_categories')}</option>
            {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <input
          type="text" className="input"
          style={{ minWidth: 140, flex: '1 1 auto', maxWidth: 220, alignSelf: 'flex-end' }}
          placeholder={t('client.stock.search_ingredient')}
          value={nameFilter}
          onChange={(e) => setNameFilter(e.target.value)}
        />
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
          nameFilter={nameFilter}
          activiteId={selectedId}
          isEntreprise={true}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

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

  const saveEntrepriseStock = async (activiteId: number, ingredientId: number, quantite: string, prixUnitaire: string, dateAppro: string) => {
    await api.put(`/api/stock/entreprise/${activiteId}/${ingredientId}`, {
      quantite: quantite ? parseFloat(quantite) : null,
      prixUnitaire: prixUnitaire ? parseFloat(prixUnitaire) : null,
      dateAppro,
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

      {/* Client independant */}
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

      {/* Entreprise */}
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
