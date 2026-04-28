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
  const [assignedSet, setAssignedSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [hasTransfers, setHasTransfers] = useState(false);

  const [dateTransfert, setDateTransfert] = useState(todayStr());
  const [note, setNote] = useState('');
  const [refFacture, setRefFacture] = useState('');
  const [qtys, setQtys] = useState<TransferQtys>({});
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Filters
  const [filterCategorie, setFilterCategorie] = useState('');
  const [filterNom, setFilterNom] = useState('');
  const [filterIngredientId, setFilterIngredientId] = useState<number | ''>('');
  // Collapsible categories (open = expanded)
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const toggleCat = (cat: string) => setOpenCats((prev) => { const n = new Set(prev); if (n.has(cat)) n.delete(cat); else n.add(cat); return n; });

  const load = useCallback(async () => {
    if (!laboId) return;
    setLoading(true);
    try {
      const [laboRes, stockRes, assignRes, transfersRes] = await Promise.all([
        api.get(`/api/labo/${laboId}`),
        api.get(`/api/labo/${laboId}/stock?assignedOnly=true`),
        api.get(`/api/labo/${laboId}/activity-assignments`),
        api.get(`/api/labo/${laboId}/transfers`),
      ]);
      setLabo(laboRes.data);
      setStock(stockRes.data);
      setHasTransfers(Array.isArray(transfersRes.data) && transfersRes.data.length > 0);
      // Build assigned set: "ingId-actId"
      const assigned = new Set<string>();
      for (const ing of (assignRes.data.ingredients || []) as { ingredientId: number; activities: { activiteId: number; assigned: boolean }[] }[]) {
        for (const act of ing.activities) {
          if (act.assigned) assigned.add(`${ing.ingredientId}-${act.activiteId}`);
        }
      }
      setAssignedSet(assigned);
      // Init qtys to '0'
      const init: TransferQtys = {};
      for (const r of stockRes.data as LaboStockRow[]) {
        init[r.ingredientId] = {};
        for (const act of (laboRes.data.activites || []) as Activite[]) {
          init[r.ingredientId][act.id] = '0';
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
    if (!refFacture.trim()) { setErrorMsg('Le N° de BL (Réf. Facture) est obligatoire.'); return; }
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
      await api.post(`/api/labo/${laboId}/transfer`, { dateTransfert, note: note || undefined, refFacture: refFacture.trim() || undefined, transfers });
      setSuccessMsg(t('client.labo.transfer_success'));
      setHasTransfers(true);
      setTimeout(() => setSuccessMsg(''), 3000);
      // Reset qtys to '0'
      setQtys((prev) => {
        const next = { ...prev };
        for (const ingId of Object.keys(next)) {
          next[Number(ingId)] = Object.fromEntries(Object.keys(next[Number(ingId)]).map((a) => [a, '0']));
        }
        return next;
      });
      setNote('');
      setRefFacture('');
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
          {hasTransfers ? (
            <Link to={`/client/labo/historique-transferts?laboId=${laboId}`} className="btn btn-secondary btn-sm">📋 {t('client.labo.transfers_history')}</Link>
          ) : (
            <span className="btn btn-secondary btn-sm" style={{ opacity: 0.4, cursor: 'not-allowed', pointerEvents: 'none' }} title="Aucun transfert enregistré">📋 {t('client.labo.transfers_history')}</span>
          )}
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
        <div style={{ flex: 1, minWidth: 160 }}>
          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>
            Réf. Facture / BL <span style={{ color: 'var(--danger, #ef4444)' }}>*</span>
          </label>
          <input
            type="text"
            className="input"
            value={refFacture}
            onChange={(e) => setRefFacture(e.target.value)}
            placeholder="N° bon de livraison…"
            style={{ borderColor: !refFacture.trim() ? 'var(--danger, #ef4444)' : undefined }}
          />
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ingrédient</span>
            <select
              className="input"
              style={{ minWidth: 160, maxWidth: 260 }}
              value={filterIngredientId}
              disabled={!filterCategorie}
              onChange={(e) => setFilterIngredientId(e.target.value === '' ? '' : Number(e.target.value))}
            >
              <option value="">— Tous —</option>
              {ingredientsInCategory.map((r) => (
                <option key={r.ingredientId} value={r.ingredientId}>{r.nom}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: '1 1 auto', maxWidth: 200 }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nom</span>
            <input
              type="text"
              className="input"
              style={{ minWidth: 120 }}
              placeholder="Rechercher…"
              value={filterNom}
              onChange={(e) => setFilterNom(e.target.value)}
            />
          </div>
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
          ) : Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([cat, rows]) => {
            const isOpen = openCats.has(cat);
            return (
            <div key={cat} style={{ marginBottom: 8 }}>
              <button onClick={() => toggleCat(cat)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', width: '100%', textAlign: 'left', borderBottom: '2px solid var(--border)', marginBottom: isOpen ? 10 : 0 }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>🏷️ {cat}</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>({rows.length})</span>
                <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{isOpen ? '▼' : '▶'}</span>
              </button>
              {isOpen && (
              <div className="table-responsive card" style={{ marginBottom: 0 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ minWidth: 140, textAlign: 'center' }}>{t('client.stock.ingredient')}</th>
                      <th style={{ textAlign: 'right', minWidth: 100 }}>{t('client.labo.labo_stock')}</th>
                      {activites.map((act) => (
                        <th key={act.id} style={{ textAlign: 'center', minWidth: 120, color: 'var(--text-muted)', fontStyle: 'italic', opacity: 0.7 }}>
                          {act.nom}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.ingredientId}>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{r.nom}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.unite}</div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <span style={{ fontWeight: 700, color: qtyColor(r.quantite), fontSize: '1rem' }}>
                            {r.quantite !== null ? r.quantite : '—'}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 3 }}>{r.unite}</span>
                          {r.prixUnitaire !== null && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              {r.prixUnitaire.toFixed(3)} DT
                            </div>
                          )}
                        </td>
                        {activites.map((act) => {
                          const isAssigned = assignedSet.has(`${r.ingredientId}-${act.id}`);
                          return (
                            <td key={act.id} style={{ textAlign: 'center' }}>
                              {isAssigned ? (
                                <input
                                  type="number"
                                  min="0"
                                  step="0.001"
                                  className="input"
                                  style={{ width: 100, textAlign: 'right' }}
                                  value={qtys[r.ingredientId]?.[act.id] ?? '0'}
                                  onChange={(e) => setQty(r.ingredientId, act.id, e.target.value)}
                                />
                              ) : (
                                <span style={{ color: 'var(--danger, #ef4444)', fontWeight: 700, fontSize: '1.1rem' }}>—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )}
            </div>
            );
          })}

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
