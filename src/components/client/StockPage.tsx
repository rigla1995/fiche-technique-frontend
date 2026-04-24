import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import type { Activite, StockEntry, ActiviteTypesSummary } from '../../types';

const todayStr = () => new Date().toISOString().split('T')[0];

interface StockRowState {
  quantite: string;
  saving: boolean;
  saved: boolean;
  error: string;
}

function buildInitialRowState(entries: StockEntry[]): Record<number, StockRowState> {
  const state: Record<number, StockRowState> = {};
  for (const e of entries) {
    state[e.ingredientId] = {
      quantite: e.quantite !== null ? String(e.quantite) : '',
      saving: false,
      saved: false,
      error: '',
    };
  }
  return state;
}

interface StockMatrixProps {
  entries: StockEntry[];
  dateStock: string;
  onSave: (ingredientId: number, quantite: string, dateStock: string) => Promise<void>;
}

function StockMatrix({ entries, dateStock, onSave }: StockMatrixProps) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Record<number, StockRowState>>(() => buildInitialRowState(entries));

  useEffect(() => {
    setRows(buildInitialRowState(entries));
  }, [entries]);

  const updateRow = (id: number, value: string) => {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], quantite: value, saved: false, error: '' } }));
  };

  const saveRow = async (id: number) => {
    const row = rows[id];
    if (!row) return;
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], saving: true, error: '' } }));
    try {
      await onSave(id, row.quantite, dateStock);
      setRows((prev) => ({ ...prev, [id]: { ...prev[id], saving: false, saved: true } }));
      setTimeout(() => setRows((prev) => ({ ...prev, [id]: { ...prev[id], saved: false } })), 2000);
    } catch {
      setRows((prev) => ({ ...prev, [id]: { ...prev[id], saving: false, error: t('common.error') } }));
    }
  };

  if (entries.length === 0) return <p className="text-muted">{t('client.stock.empty_stock')}</p>;

  const groups: Record<string, StockEntry[]> = {};
  for (const entry of entries) {
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
              const row = rows[entry.ingredientId] ?? { quantite: '', saving: false, saved: false, error: '' };
              return (
                <div key={entry.ingredientId} className="stock-card">
                  <div className="stock-card-header">
                    <span className="stock-ingredient-name">{entry.nom}</span>
                    <span className="stock-unit-badge">{entry.unite}</span>
                  </div>
                  {entry.prixUnitaire !== null && (
                    <div className="stock-price">
                      {t('client.stock.unit_price')}: <strong>{entry.prixUnitaire.toFixed(3)} {t('currency')}</strong>
                    </div>
                  )}
                  <div className="stock-fields">
                    <div className="stock-field">
                      <label>{t('client.stock.quantity')}</label>
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        placeholder="0"
                        value={row.quantite}
                        onChange={(e) => updateRow(entry.ingredientId, e.target.value)}
                      />
                    </div>
                  </div>
                  {row.error && <p className="form-error" style={{ fontSize: '0.75rem', marginTop: 4 }}>{row.error}</p>}
                  <div className="stock-card-footer">
                    {row.saved ? (
                      <span className="stock-saved-badge">✓ {t('client.stock.saved')}</span>
                    ) : (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => saveRow(entry.ingredientId)}
                        disabled={row.saving}
                      >
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
  prefix: string; // 'F' | 'D'
  onSave: (activiteId: number, ingredientId: number, quantite: string, dateStock: string) => Promise<void>;
}

function ActivityStockSection({ label, activities, dateStock, prefix, onSave }: ActivityStockSectionProps) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<number>(activities[0]?.id ?? 0);
  const [entries, setEntries] = useState<StockEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const loadStock = useCallback(async (actId: number, date: string) => {
    setLoading(true);
    setEntries([]);
    try {
      const { data } = await api.get(`/api/stock/entreprise/${actId}?date=${date}`);
      setEntries(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (selectedId) loadStock(selectedId, dateStock);
  }, [selectedId, dateStock, loadStock]);

  const handleSave = async (ingredientId: number, quantite: string, ds: string) => {
    await onSave(selectedId, ingredientId, quantite, ds);
  };

  return (
    <div style={{ marginBottom: 36 }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--primary)', marginBottom: 12 }}>{label}</h2>
      <div style={{ marginBottom: 16 }}>
        <select
          className="input"
          style={{ maxWidth: 320 }}
          value={selectedId}
          onChange={(e) => setSelectedId(Number(e.target.value))}
        >
          {activities.map((a) => (
            <option key={a.id} value={a.id}>{prefix} · {a.nom}</option>
          ))}
        </select>
      </div>
      {loading ? (
        <p className="text-muted">{t('common.loading')}</p>
      ) : entries.length === 0 ? (
        <p className="text-muted">{t('client.stock.empty_stock')}</p>
      ) : (
        <StockMatrix key={`${selectedId}-${dateStock}`} entries={entries} dateStock={dateStock} onSave={handleSave} />
      )}
    </div>
  );
}

export default function StockPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isEntreprise = user?.compteType === 'entreprise';

  const today = todayStr();
  const [dateStock, setDateStock] = useState(today);

  // Independant
  const [clientEntries, setClientEntries] = useState<StockEntry[]>([]);
  const [clientLoading, setClientLoading] = useState(false);

  // Entreprise
  const [typesSummary, setTypesSummary] = useState<ActiviteTypesSummary | null>(null);
  const [franchiseActivities, setFranchiseActivities] = useState<Activite[]>([]);
  const [distinctActivities, setDistinctActivities] = useState<Activite[]>([]);
  const [activitesLoading, setActivitesLoading] = useState(false);

  const loadClientStock = useCallback(async (date: string) => {
    setClientLoading(true);
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
    }).catch(() => { /* ignore */ }).finally(() => setActivitesLoading(false));
  }, [isEntreprise]);

  const saveClientStock = async (ingredientId: number, quantite: string, ds: string) => {
    await api.put(`/api/stock/client/${ingredientId}`, {
      quantite: quantite ? parseFloat(quantite) : null,
      dateStock: ds,
    });
  };

  const saveEntrepriseStock = async (activiteId: number, ingredientId: number, quantite: string, ds: string) => {
    await api.put(`/api/stock/entreprise/${activiteId}/${ingredientId}`, {
      quantite: quantite ? parseFloat(quantite) : null,
      dateStock: ds,
    });
  };

  return (
    <div className="page-content">
      <h1>{t('client.stock.title')}</h1>

      {/* Global date picker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <label style={{ fontWeight: 600, fontSize: '0.875rem' }}>{t('client.stock.date_label')}</label>
        <input
          type="date"
          className="input"
          style={{ maxWidth: 180 }}
          max={today}
          value={dateStock}
          onChange={(e) => setDateStock(e.target.value)}
        />
      </div>

      {/* Independant client */}
      {!isEntreprise && (
        clientLoading ? (
          <p className="text-muted">{t('common.loading')}</p>
        ) : (
          <StockMatrix key={dateStock} entries={clientEntries} dateStock={dateStock} onSave={saveClientStock} />
        )
      )}

      {/* Entreprise */}
      {isEntreprise && (
        activitesLoading ? (
          <p className="text-muted">{t('common.loading')}</p>
        ) : (
          <>
            {typesSummary?.hasFranchise && franchiseActivities.length > 0 && (
              <ActivityStockSection
                label={t('client.stock.franchise_section')}
                activities={franchiseActivities}
                dateStock={dateStock}
                prefix="F"
                onSave={saveEntrepriseStock}
              />
            )}
            {typesSummary?.hasDistinct && distinctActivities.length > 0 && (
              <ActivityStockSection
                label={t('client.stock.distinct_section')}
                activities={distinctActivities}
                dateStock={dateStock}
                prefix="D"
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
