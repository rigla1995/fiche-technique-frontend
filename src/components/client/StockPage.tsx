import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/client';
import { useSelection } from '../../context/SelectionContext';
import type { Activite, StockEntry } from '../../types';

type Tab = 'client' | 'entreprise';

interface StockRowState {
  quantite: string;
  dateAchat: string;
  saving: boolean;
  saved: boolean;
  error: string;
}

function buildInitialRowState(entries: StockEntry[]): Record<number, StockRowState> {
  const state: Record<number, StockRowState> = {};
  for (const e of entries) {
    state[e.ingredientId] = {
      quantite: e.quantite !== null ? String(e.quantite) : '',
      dateAchat: e.dateAchat ? e.dateAchat.substring(0, 10) : '',
      saving: false,
      saved: false,
      error: '',
    };
  }
  return state;
}

interface StockMatrixProps {
  entries: StockEntry[];
  onSave: (ingredientId: number, quantite: string, dateAchat: string) => Promise<void>;
}

function StockMatrix({ entries, onSave }: StockMatrixProps) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Record<number, StockRowState>>(() => buildInitialRowState(entries));

  useEffect(() => {
    setRows(buildInitialRowState(entries));
  }, [entries]);

  const updateRow = (id: number, field: 'quantite' | 'dateAchat', value: string) => {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value, saved: false, error: '' } }));
  };

  const saveRow = async (id: number) => {
    const row = rows[id];
    if (!row) return;
    if (row.quantite && !row.dateAchat) {
      setRows((prev) => ({ ...prev, [id]: { ...prev[id], error: t('client.stock.date_required_if_qty') } }));
      return;
    }
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], saving: true, error: '' } }));
    try {
      await onSave(id, row.quantite, row.dateAchat);
      setRows((prev) => ({ ...prev, [id]: { ...prev[id], saving: false, saved: true } }));
      setTimeout(() => setRows((prev) => ({ ...prev, [id]: { ...prev[id], saved: false } })), 2000);
    } catch {
      setRows((prev) => ({ ...prev, [id]: { ...prev[id], saving: false, error: t('common.error') } }));
    }
  };

  if (entries.length === 0) return <p className="text-muted">{t('client.stock.empty_stock')}</p>;

  return (
    <div className="stock-grid">
      {entries.map((entry) => {
        const row = rows[entry.ingredientId] ?? { quantite: '', dateAchat: '', saving: false, saved: false, error: '' };
        return (
          <div key={entry.ingredientId} className="stock-card">
            <div className="stock-card-header">
              <span className="stock-ingredient-name">{entry.nom}</span>
              <span className="stock-unit-badge">{entry.unite}</span>
            </div>
            {entry.prixUnitaire !== null && (
              <div className="stock-price">
                {t('client.stock.unit_price')}: <strong>{entry.prixUnitaire.toFixed(3)} DT</strong>
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
                  onChange={(e) => updateRow(entry.ingredientId, 'quantite', e.target.value)}
                />
              </div>
              <div className="stock-field">
                <label>{t('client.stock.date_achat')}</label>
                <input
                  type="date"
                  value={row.dateAchat}
                  onChange={(e) => updateRow(entry.ingredientId, 'dateAchat', e.target.value)}
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
  );
}

export default function StockPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { hasSelections } = useSelection();
  const tab = (searchParams.get('tab') as Tab) || 'client';

  const [clientEntries, setClientEntries] = useState<StockEntry[]>([]);
  const [clientLoading, setClientLoading] = useState(false);
  const [activites, setActivites] = useState<Activite[]>([]);
  const [activitesLoading, setActivitesLoading] = useState(false);
  const [activeActiviteId, setActiveActiviteId] = useState<number | null>(null);
  const [entrepriseEntries, setEntrepriseEntries] = useState<StockEntry[]>([]);
  const [entrepriseLoading, setEntrepriseLoading] = useState(false);

  const loadClientStock = useCallback(async () => {
    setClientLoading(true);
    try {
      const { data } = await api.get('/api/stock/client');
      setClientEntries(data);
    } catch { /* ignore */ }
    setClientLoading(false);
  }, []);

  const loadActivites = useCallback(async () => {
    setActivitesLoading(true);
    try {
      const { data } = await api.get('/api/entreprise/activites');
      setActivites(data);
      if (data.length > 0 && activeActiviteId === null) setActiveActiviteId(data[0].id);
    } catch { /* ignore */ }
    setActivitesLoading(false);
  }, [activeActiviteId]);

  const loadEntrepriseStock = useCallback(async (activiteId: number) => {
    setEntrepriseLoading(true);
    try {
      const { data } = await api.get(`/api/stock/entreprise/${activiteId}`);
      setEntrepriseEntries(data);
    } catch { /* ignore */ }
    setEntrepriseLoading(false);
  }, []);

  useEffect(() => {
    if (tab === 'client' && hasSelections) loadClientStock();
  }, [tab, hasSelections, loadClientStock]);

  useEffect(() => {
    if (tab === 'entreprise') loadActivites();
  }, [tab, loadActivites]);

  useEffect(() => {
    if (tab === 'entreprise' && activeActiviteId !== null) loadEntrepriseStock(activeActiviteId);
  }, [tab, activeActiviteId, loadEntrepriseStock]);

  const saveClientStock = async (ingredientId: number, quantite: string, dateAchat: string) => {
    await api.put(`/api/stock/client/${ingredientId}`, {
      quantite: quantite ? parseFloat(quantite) : null,
      dateAchat: dateAchat || null,
    });
  };

  const saveEntrepriseStock = async (ingredientId: number, quantite: string, dateAchat: string) => {
    if (activeActiviteId === null) return;
    await api.put(`/api/stock/entreprise/${activeActiviteId}/${ingredientId}`, {
      quantite: quantite ? parseFloat(quantite) : null,
      dateAchat: dateAchat || null,
    });
  };

  const setTab = (t: Tab) => setSearchParams({ tab: t });

  return (
    <div className="page-content">
      <h1>{t('client.stock.title')}</h1>

      <div className="tabs" style={{ marginTop: 20, marginBottom: 24 }}>
        <button className={`tab-btn ${tab === 'client' ? 'active' : ''}`} onClick={() => setTab('client')}>
          {t('client.stock.tab_client')}
        </button>
        <button className={`tab-btn ${tab === 'entreprise' ? 'active' : ''}`} onClick={() => setTab('entreprise')}>
          {t('client.stock.tab_entreprise')}
        </button>
      </div>

      {tab === 'client' && (
        <>
          {!hasSelections ? (
            <div className="alert alert-warning">{t('client.stock.no_selections')}</div>
          ) : clientLoading ? (
            <p className="text-muted">{t('common.loading')}</p>
          ) : (
            <StockMatrix entries={clientEntries} onSave={saveClientStock} />
          )}
        </>
      )}

      {tab === 'entreprise' && (
        <>
          {activitesLoading ? (
            <p className="text-muted">{t('common.loading')}</p>
          ) : activites.length === 0 ? (
            <div className="alert alert-warning">{t('client.stock.no_activities')}</div>
          ) : (
            <>
              <div className="activite-tabs">
                {activites.map((act) => (
                  <button
                    key={act.id}
                    className={`activite-tab-btn ${act.id === activeActiviteId ? 'active' : ''}`}
                    onClick={() => setActiveActiviteId(act.id)}
                  >
                    {act.nom}
                  </button>
                ))}
              </div>
              {entrepriseLoading ? (
                <p className="text-muted">{t('common.loading')}</p>
              ) : (
                <StockMatrix key={activeActiviteId} entries={entrepriseEntries} onSave={saveEntrepriseStock} />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
