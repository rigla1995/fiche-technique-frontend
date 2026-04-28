import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';

const currentYear = new Date().getFullYear();
const yearStart = `${currentYear}-01-01`;
const yearEnd = `${currentYear}-12-31`;
const todayStr = () => new Date().toISOString().split('T')[0];

const qtyColor = (q: number | null) => {
  if (q === null || q === 0) return 'var(--danger, #ef4444)';
  if (q < 5) return 'var(--warning, #f59e0b)';
  return 'var(--success, #10b981)';
};

interface LaboStockRow {
  ingredientId: number;
  nom: string;
  unite: string;
  categorie: string;
  quantite: number | null;
  prixUnitaire: number | null;
}

interface Activite {
  id: number;
  nom: string;
}

// transferQtys[ingredientId][activiteId] = string value
type TransferQtys = Record<number, Record<number, string>>;

export default function TransferPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const laboId = searchParams.get('laboId') || '';

  const [labo, setLabo] = useState<{ nom: string; franchiseGroup: string; activites: Activite[] } | null>(null);
  const [stock, setStock] = useState<LaboStockRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [dateTransfert, setDateTransfert] = useState(todayStr());
  const [note, setNote] = useState('');
  const [qtys, setQtys] = useState<TransferQtys>({});
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Filters
  const [filterCategorie, setFilterCategorie] = useState('');
  const [filterNom, setFilterNom] = useState('');
  const [filterIngredientId, setFilterIngredientId] = useState<number | ''>('');

  const load = useCallback(async () => {
    if (!laboId) return;
    setLoading(true);
    try {
      const [laboRes, stockRes] = await Promise.all([
        api.get(`/api/labo/${laboId}`),
        api.get(`/api/labo/${laboId}/stock?assignedOnly=true`),
      ]);
      setLabo(laboRes.data);
      setStock(stockRes.data);
      // Init qtys
      const init: TransferQtys = {};
      for (const r of stockRes.data as LaboStockRow[]) {
        init[r.ingredientId] = {};
        for (const act of (laboRes.data.activites || []) as Activite[]) {
          init[r.ingredientId][act.id] = '';
        }
      }
      setQtys(init);
    } catch { /* ignore */ }
    setLoading(false);
  }, [laboId]);

  useEffect(() => { load(); }, [load]);

  const setQty = (ingredientId: number, activiteId: number, value: string) => {
    setQtys((prev) => ({
      ...prev,
      [ingredientId]: { ...prev[ingredientId], [activiteId]: value },
    }));
  };

  const handleTransfer = async () => {
    setErrorMsg('');
    // Build transfer list
    const transfers: { activiteId: number; ingredientId: number; quantite: number }[] = [];
    for (const [ingId, actMap] of Object.entries(qtys)) {
      for (const [actId, val] of Object.entries(actMap)) {
        const q = parseFloat(val);
        if (q > 0) transfers.push({ activiteId: Number(actId), ingredientId: Number(ingId), quantite: q });
      }
    }
    if (transfers.length === 0) { setErrorMsg(t('client.labo.transfer_empty')); return; }

    // Check no over-transfer per ingredient
    for (const r of stock) {
      const totalForIng = transfers
        .filter((t) => t.ingredientId === r.ingredientId)
        .reduce((s, t) => s + t.quantite, 0);
      if (r.quantite !== null && totalForIng > r.quantite) {
        setErrorMsg(t('client.labo.transfer_overstock', { nom: r.nom, disponible: r.quantite }));
        return;
      }
    }

    setSaving(true);
    try {
      await api.post(`/api/labo/${laboId}/transfer`, { dateTransfert, note: note || undefined, transfers });
      setSuccessMsg(t('client.labo.transfer_success'));
      setTimeout(() => setSuccessMsg(''), 3000);
      // Reset qtys
      setQtys((prev) => {
        const next = { ...prev };
        for (const ingId of Object.keys(next)) {
          next[Number(ingId)] = Object.fromEntries(Object.keys(next[Number(ingId)]).map((a) => [a, '']));
        }
        return next;
      });
      setNote('');
      // Reload stock
      const { data } = await api.get(`/api/labo/${laboId}/stock?assignedOnly=true`);
      setStock(data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setErrorMsg(msg || t('common.error'));
    }
    setSaving(false);
  };

  const activites: Activite[] = labo?.activites || [];

  // Filter + group by category
  const allCategories = Array.from(new Set(stock.map((r) => r.categorie))).sort();
  const ingredientsInCategory = filterCategorie
    ? stock.filter((r) => r.categorie === filterCategorie)
    : stock;
  const filtered = stock.filter((r) => {
    const catOk = !filterCategorie || r.categorie === filterCategorie;
    const ingOk = !filterIngredientId || r.ingredientId === filterIngredientId;
    const nomOk = !filterNom || r.nom.toLowerCase().includes(filterNom.toLowerCase());
    return catOk && ingOk && nomOk;
  });
  const groups: Record<string, LaboStockRow[]> = {};
  for (const r of filtered) {
    if (!groups[r.categorie]) groups[r.categorie] = [];
    groups[r.categorie].push(r);
  }

  if (!laboId) return <div className="page"><p className="text-muted">Labo introuvable.</p></div>;

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1>↗ {labo ? labo.nom : t('common.loading')} — {t('client.labo.transfer_title')}</h1>
          {labo && <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 2 }}>{labo.franchiseGroup}</p>}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to={`/client/labo/stock?laboId=${laboId}`} className="btn btn-ghost btn-sm">← {t('client.labo.stock_title')}</Link>
          <Link to={`/client/labo/historique-transferts?laboId=${laboId}`} className="btn btn-secondary btn-sm">📋 {t('client.labo.transfers_history')}</Link>
        </div>
      </div>

      {/* Date + note */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 20px', marginBottom: 20, display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>
            {t('client.labo.transfer_date')} *
          </label>
          <input
            type="date"
            className="input"
            style={{ maxWidth: 170 }}
            min={yearStart}
            max={yearEnd}
            value={dateTransfert}
            onChange={(e) => setDateTransfert(e.target.value)}
          />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>
            {t('client.labo.transfer_note')}
          </label>
          <input
            type="text"
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('client.labo.transfer_note_placeholder')}
          />
        </div>
      </div>

      {successMsg && <div style={{ background: 'var(--success, #10b981)', color: '#fff', borderRadius: 10, padding: '10px 18px', marginBottom: 16, fontWeight: 600 }}>✓ {successMsg}</div>}
      {errorMsg && <div style={{ background: 'var(--danger, #ef4444)', color: '#fff', borderRadius: 10, padding: '10px 18px', marginBottom: 16, fontWeight: 600 }}>{errorMsg}</div>}

      {/* Filters */}
      {!loading && stock.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Catégorie</span>
            <select className="input" style={{ maxWidth: 200 }} value={filterCategorie} onChange={(e) => { setFilterCategorie(e.target.value); setFilterIngredientId(''); }}>
              <option value="">{t('client.catalogue_franchise.all_categories')}</option>
              {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {filterCategorie && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('client.stock.ingredient')}</span>
              <select
                className="input"
                style={{ minWidth: 160, maxWidth: 260 }}
                value={filterIngredientId}
                onChange={(e) => setFilterIngredientId(e.target.value === '' ? '' : Number(e.target.value))}
              >
                <option value="">— {t('common.all', 'Tous')} —</option>
                {ingredientsInCategory.map((r) => (
                  <option key={r.ingredientId} value={r.ingredientId}>{r.nom}</option>
                ))}
              </select>
            </div>
          )}
          {(filterCategorie || filterIngredientId !== '' || filterNom) && (
            <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-end' }} onClick={() => { setFilterCategorie(''); setFilterIngredientId(''); setFilterNom(''); }}>✕</button>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-muted">{t('common.loading')}</p>
      ) : stock.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">🏭</span>
          <p>{t('client.labo.empty_stock')}</p>
        </div>
      ) : activites.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">🏪</span>
          <p>{t('client.labo.no_activites')}</p>
        </div>
      ) : (
        <>
          {Object.keys(groups).length === 0 ? (
            <p className="text-muted">{t('common.no_result')}</p>
          ) : Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([cat, rows]) => (
            <div key={cat} style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, marginTop: 0 }}>
                🏷️ {cat}
              </h2>
              <div className="table-responsive card" style={{ marginBottom: 0 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ minWidth: 140 }}>{t('client.stock.ingredient')}</th>
                      <th style={{ textAlign: 'right', minWidth: 100 }}>{t('client.labo.labo_stock')}</th>
                      {activites.map((act) => (
                        <th key={act.id} style={{ textAlign: 'center', minWidth: 120, color: 'var(--primary)' }}>
                          ↗ {act.nom}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.ingredientId}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{r.nom}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.unite}</div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <span style={{ fontWeight: 700, color: qtyColor(r.quantite), fontSize: '1rem' }}>
                            {r.quantite !== null ? r.quantite : '—'}
                          </span>
                          {r.prixUnitaire !== null && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              {r.prixUnitaire.toFixed(3)} DT
                            </div>
                          )}
                        </td>
                        {activites.map((act) => (
                          <td key={act.id} style={{ textAlign: 'center' }}>
                            <input
                              type="number"
                              min="0"
                              step="0.001"
                              className="input"
                              style={{ width: 100, textAlign: 'right' }}
                              value={qtys[r.ingredientId]?.[act.id] ?? ''}
                              onChange={(e) => setQty(r.ingredientId, act.id, e.target.value)}
                              placeholder="0"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button
              className="btn btn-primary"
              onClick={handleTransfer}
              disabled={saving}
              style={{ minWidth: 160, fontWeight: 700 }}
            >
              {saving ? t('common.loading') : `↗ ${t('client.labo.btn_confirm_transfer')}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
