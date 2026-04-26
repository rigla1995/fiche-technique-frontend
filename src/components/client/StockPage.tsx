import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Activite, StockEntry, ActiviteTypesSummary } from '../../types';

const todayStr = () => new Date().toISOString().split('T')[0];

interface StockRowState {
  quantite: string;
  prixUnitaire: string;
  saving: boolean;
  saved: boolean;
  error: string;
}

function buildInitialRowState(entries: StockEntry[]): Record<number, StockRowState> {
  const state: Record<number, StockRowState> = {};
  for (const e of entries) {
    state[e.ingredientId] = {
      quantite: e.quantite !== null ? String(e.quantite) : '',
      prixUnitaire: e.prixUnitaire !== null ? String(e.prixUnitaire) : '',
      saving: false, saved: false, error: '',
    };
  }
  return state;
}

interface StockMatrixProps {
  entries: StockEntry[];
  dateStock: string;
  categoryFilter: string;
  nameFilter: string;
  onSave: (ingredientId: number, quantite: string, prixUnitaire: string, dateStock: string) => Promise<void>;
}

function StockMatrix({ entries, dateStock, categoryFilter, nameFilter, onSave }: StockMatrixProps) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Record<number, StockRowState>>(() => buildInitialRowState(entries));

  useEffect(() => { setRows(buildInitialRowState(entries)); }, [entries]);

  const updateRow = (id: number, field: 'quantite' | 'prixUnitaire', value: string) =>
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value, saved: false, error: '' } }));

  const saveRow = async (id: number) => {
    const row = rows[id];
    if (!row) return;
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], saving: true, error: '' } }));
    try {
      await onSave(id, row.quantite, row.prixUnitaire, dateStock);
      setRows((prev) => ({ ...prev, [id]: { ...prev[id], saving: false, saved: true } }));
      setTimeout(() => setRows((prev) => ({ ...prev, [id]: { ...prev[id], saved: false } })), 2000);
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
              const row = rows[entry.ingredientId] ?? { quantite: '', prixUnitaire: '', saving: false, saved: false, error: '' };
              return (
                <div key={entry.ingredientId} className="stock-card">
                  <div className="stock-card-header">
                    <span className="stock-ingredient-name">{entry.nom}</span>
                    <span className="stock-unit-badge">{entry.unite}</span>
                  </div>
                  <div className="stock-fields">
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
                  {row.error && <p className="form-error" style={{ fontSize: '0.75rem', marginTop: 4 }}>{row.error}</p>}
                  <div className="stock-card-footer">
                    {row.saved ? (
                      <span className="stock-saved-badge">✓ {t('client.stock.saved')}</span>
                    ) : (
                      <button className="btn btn-primary btn-sm" onClick={() => saveRow(entry.ingredientId)} disabled={row.saving}>
                        {row.saving ? '...' : t('client.stock.save')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

interface ActivityStockSectionProps {
  label: string;
  activities: Activite[];
  dateStock: string;
  isFranchise?: boolean;
  onSave: (activiteId: number, ingredientId: number, quantite: string, prixUnitaire: string, dateStock: string) => Promise<void>;
}

function ActivityStockSection({ label, activities, dateStock, isFranchise, onSave }: ActivityStockSectionProps) {
  const { t } = useTranslation();

  // Derive franchise groups for the group selector
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

  // When group changes, reset selected activity
  useEffect(() => {
    const first = groupActivities[0]?.id ?? 0;
    setSelectedId(first);
  }, [selectedGroup]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadStock = useCallback(async (actId: number, date: string) => {
    setLoading(true);
    setEntries([]);
    setCategoryFilter('');
    setNameFilter('');
    try {
      const { data } = await api.get(`/api/stock/entreprise/${actId}?date=${date}`);
      setEntries(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (selectedId) loadStock(selectedId, dateStock);
  }, [selectedId, dateStock, loadStock]);

  const handleSave = async (ingredientId: number, quantite: string, prixUnitaire: string, ds: string) => {
    await onSave(selectedId, ingredientId, quantite, prixUnitaire, ds);
  };

  const handleDuplicate = async () => {
    if (!window.confirm(t('client.stock.duplicate_confirm'))) return;
    setDuplicating(true);
    setDupMsg('');
    try {
      const { data } = await api.post(`/api/stock/entreprise/${selectedId}/duplicate-franchise?date=${dateStock}`);
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
      {/* Header row: label + duplicate button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, paddingBottom: 10, borderBottom: '2px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 4, height: 22, borderRadius: 4, background: 'linear-gradient(180deg, #2563eb 0%, #0ea5e9 100%)', display: 'inline-block', flexShrink: 0 }} />
          <h2 style={{ fontSize: '0.9rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text)', margin: 0 }}>{label}</h2>
        </div>
        {canDuplicate && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {dupMsg && <span style={{ fontSize: '0.8rem', color: 'var(--success)' }}>{dupMsg}</span>}
            <button
              className="btn btn-primary btn-sm"
              onClick={handleDuplicate}
              disabled={duplicating}
            >
              {duplicating ? '...' : `📋 ${t('client.stock.duplicate_franchise')}`}
            </button>
          </div>
        )}
      </div>

      {/* Filter row: [group?] [activity] [category] [search] */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {isFranchise && hasMultipleGroups && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Groupe</span>
            <select
              className="input"
              style={{ maxWidth: 200 }}
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
            >
              {groupNames.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Activité</span>
          <select
            className="input"
            style={{ maxWidth: 220 }}
            value={selectedId}
            onChange={(e) => setSelectedId(Number(e.target.value))}
          >
            {groupActivities.map((a) => (
              <option key={a.id} value={a.id}>{a.nom}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Catégorie</span>
          <select
            className="input"
            style={{ maxWidth: 200 }}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">{t('client.catalogue_franchise.all_categories')}</option>
            {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <input
          type="text"
          className="input"
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
          key={`${selectedId}-${dateStock}`}
          entries={entries}
          dateStock={dateStock}
          categoryFilter={categoryFilter}
          nameFilter={nameFilter}
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

  const today = todayStr();
  const [dateStock, setDateStock] = useState(today);

  const [clientEntries, setClientEntries] = useState<StockEntry[]>([]);
  const [clientLoading, setClientLoading] = useState(false);
  const [clientCategoryFilter, setClientCategoryFilter] = useState('');
  const [clientNameFilter, setClientNameFilter] = useState('');

  const [typesSummary, setTypesSummary] = useState<ActiviteTypesSummary | null>(null);
  const [franchiseActivities, setFranchiseActivities] = useState<Activite[]>([]);
  const [distinctActivities, setDistinctActivities] = useState<Activite[]>([]);
  const [activitesLoading, setActivitesLoading] = useState(false);

  const loadClientStock = useCallback(async (date: string) => {
    setClientLoading(true);
    setClientCategoryFilter('');
    setClientNameFilter('');
    try {
      const { data } = await api.get(`/api/stock/client?date=${date}`);
      setClientEntries(data);
    } catch { /* ignore */ }
    setClientLoading(false);
  }, []);

  useEffect(() => {
    if (!isEntreprise) loadClientStock(dateStock);
  }, [isEntreprise, dateStock, loadClientStock]);

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

  const saveClientStock = async (ingredientId: number, quantite: string, prixUnitaire: string, ds: string) => {
    await api.put(`/api/stock/client/${ingredientId}`, {
      quantite: quantite ? parseFloat(quantite) : null,
      prixUnitaire: prixUnitaire ? parseFloat(prixUnitaire) : null,
      dateStock: ds,
    });
  };

  const saveEntrepriseStock = async (activiteId: number, ingredientId: number, quantite: string, prixUnitaire: string, ds: string) => {
    await api.put(`/api/stock/entreprise/${activiteId}/${ingredientId}`, {
      quantite: quantite ? parseFloat(quantite) : null,
      prixUnitaire: prixUnitaire ? parseFloat(prixUnitaire) : null,
      dateStock: ds,
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

      {/* Global date picker */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, marginBottom: 28, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <span style={{ fontSize: '1rem' }}>📅</span>
        <label style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{t('client.stock.date_label')}</label>
        <input
          type="date"
          className="input"
          style={{ maxWidth: 180, border: 'none', background: 'transparent', padding: '0', fontWeight: 700, fontSize: '0.95rem', color: 'var(--primary)' }}
          max={today}
          value={dateStock}
          onChange={(e) => setDateStock(e.target.value)}
        />
      </div>

      {/* Independant client */}
      {!isEntreprise && (
        clientLoading ? (
          <p className="text-muted">{t('common.loading')}</p>
        ) : clientEntries.length === 0 ? (
          <p className="text-muted">{t('client.stock.empty_stock')}</p>
        ) : (
          <>
            {/* Client filter row */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                className="input"
                style={{ maxWidth: 220 }}
                value={clientCategoryFilter}
                onChange={(e) => setClientCategoryFilter(e.target.value)}
              >
                <option value="">{t('client.catalogue_franchise.all_categories')}</option>
                {clientCategories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <input
                type="text"
                className="input"
                style={{ minWidth: 140, flex: '1 1 auto', maxWidth: 220 }}
                placeholder={t('client.stock.search_ingredient')}
                value={clientNameFilter}
                onChange={(e) => setClientNameFilter(e.target.value)}
              />
            </div>
            <StockMatrix
              key={dateStock}
              entries={clientEntries}
              dateStock={dateStock}
              categoryFilter={clientCategoryFilter}
              nameFilter={clientNameFilter}
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
                dateStock={dateStock}
                isFranchise={true}
                onSave={saveEntrepriseStock}
              />
            )}
            {(!section || section === 'distinct') && typesSummary?.hasDistinct && distinctActivities.length > 0 && (
              <ActivityStockSection
                label={t('client.stock.distinct_section')}
                activities={distinctActivities}
                dateStock={dateStock}
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
