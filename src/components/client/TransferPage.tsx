import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';

const fmtDate = (iso: string | null | undefined) => {
  if (!iso || iso.length < 10) return iso ?? '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

interface TransferRecord {
  id: number;
  quantite: number;
  dateTransfert: string;
  activiteId: number;
  activiteNom: string;
  note: string | null;
}

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

  const [fournisseurs, setFournisseurs] = useState<{ id: number; nom: string }[]>([]);
  const [dateTransfert, setDateTransfert] = useState(todayStr());
  const [note, setNote] = useState('');
  const [refFacture, setRefFacture] = useState('');
  const [fournisseurId, setFournisseurId] = useState('');
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

  // ── Transfer history collapse per ingredient
  const [openTransfers, setOpenTransfers] = useState<Set<number>>(new Set());
  const [transferHistory, setTransferHistory] = useState<Record<number, TransferRecord[]>>({});
  const [transferLoading, setTransferLoading] = useState<Set<number>>(new Set());

  const toggleTransfers = async (ingredientId: number) => {
    if (openTransfers.has(ingredientId)) {
      setOpenTransfers((prev) => { const n = new Set(prev); n.delete(ingredientId); return n; });
      return;
    }
    setOpenTransfers((prev) => new Set([...prev, ingredientId]));
    if (transferHistory[ingredientId]) return;
    setTransferLoading((prev) => new Set([...prev, ingredientId]));
    try {
      const { data } = await api.get(`/api/labo/${laboId}/transfers?ingredientId=${ingredientId}&limit=5`);
      setTransferHistory((prev) => ({ ...prev, [ingredientId]: data }));
    } catch { /* ignore */ }
    setTransferLoading((prev) => { const n = new Set(prev); n.delete(ingredientId); return n; });
  };

  const load = useCallback(async () => {
    if (!laboId) return;
    setLoading(true);
    try {
      const [laboRes, stockRes, assignRes, transfersRes, foRes] = await Promise.all([
        api.get(`/api/labo/${laboId}`),
        api.get(`/api/labo/${laboId}/stock?assignedOnly=true`),
        api.get(`/api/labo/${laboId}/activity-assignments`),
        api.get(`/api/labo/${laboId}/transfers`),
        api.get(`/api/labo/${laboId}/fournisseurs`),
      ]);
      setLabo(laboRes.data);
      setStock(stockRes.data);
      setFournisseurs(foRes.data as { id: number; nom: string }[]);
      setHasTransfers(Array.isArray(transfersRes.data) && transfersRes.data.length > 0);
      // Build assigned set: "ingId-actId"
      const assigned = new Set<string>();
      for (const ing of (assignRes.data.ingredients || []) as { ingredientId: number; activities: { activiteId: number; assigned: boolean }[] }[]) {
        for (const act of ing.activities) {
          if (act.assigned) assigned.add(`${ing.ingredientId}-${act.activiteId}`);
        }
      }
      setAssignedSet(assigned);
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
      await api.post(`/api/labo/${laboId}/transfer`, { dateTransfert, note: note || undefined, refFacture: refFacture.trim() || undefined, fournisseurId: fournisseurId ? Number(fournisseurId) : undefined, transfers });
      setSuccessMsg(t('client.labo.transfer_success'));
      setHasTransfers(true);
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
      setRefFacture('');
      setFournisseurId('');
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
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 20px', marginBottom: 20, display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
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
            onChange={(e) => { setRefFacture(e.target.value); if (errorMsg) setErrorMsg(''); }}
            placeholder="N° bon de livraison…"
          />
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>
            Fournisseur
          </label>
          <select
            className="input"
            value={fournisseurId}
            onChange={(e) => setFournisseurId(e.target.value)}
            style={{ width: '100%' }}
          >
            <option value="">— Aucun —</option>
            {fournisseurs.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
          </select>
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

      {/* Compact filter card */}
      {!loading && stock.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, marginBottom: 20, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary, #f8fafc)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--text-muted)' }}>Filtres</span>
            {(filterCategorie || filterIngredientId !== '' || filterNom) && (
              <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.78rem' }} onClick={() => { setFilterCategorie(''); setFilterIngredientId(''); setFilterNom(''); }}>✕ Réinitialiser</button>
            )}
          </div>
          <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '12px 20px' }}>
            <div>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>Catégorie</span>
              <select className="input" style={{ width: '100%' }} value={filterCategorie} onChange={(e) => { setFilterCategorie(e.target.value); setFilterIngredientId(''); }}>
                <option value="">{t('client.catalogue_franchise.all_categories')}</option>
                {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>Ingrédient</span>
              <select className="input" style={{ width: '100%' }} value={filterIngredientId}
                disabled={!filterCategorie}
                onChange={(e) => setFilterIngredientId(e.target.value === '' ? '' : Number(e.target.value))}>
                <option value="">— Tous —</option>
                {ingredientsInCategory.map((r) => <option key={r.ingredientId} value={r.ingredientId}>{r.nom}</option>)}
              </select>
            </div>
            <div>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>Nom</span>
              <input type="text" className="input" style={{ width: '100%' }} placeholder="Rechercher…"
                value={filterNom} onChange={(e) => setFilterNom(e.target.value)} />
            </div>
          </div>
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
              <div className="table-responsive card th-orange" style={{ marginBottom: 0 }}>
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
                    {rows.map((r) => {
                      const isTransferOpen = openTransfers.has(r.ingredientId);
                      const isTransferLoading = transferLoading.has(r.ingredientId);
                      const transfers = transferHistory[r.ingredientId] ?? [];
                      return (
                      <React.Fragment key={r.ingredientId}>
                        <tr>
                          <td>
                            <div style={{ fontWeight: 600 }}>{r.nom}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.unite}</div>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => toggleTransfers(r.ingredientId)}
                              title="5 derniers transferts"
                              style={{ fontSize: '0.72rem', color: '#7c3aed', marginTop: 4, padding: '2px 6px' }}
                            >
                              {isTransferOpen ? '↗▲' : '↗ historique'}
                            </button>
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
                                    value={qtys[r.ingredientId]?.[act.id] ?? ''}
                                    onChange={(e) => setQty(r.ingredientId, act.id, e.target.value)}
                                    placeholder="0"
                                  />
                                ) : (
                                  <span style={{ color: 'var(--danger, #ef4444)', fontWeight: 700, fontSize: '1.1rem' }}>—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                        {isTransferOpen && (
                          <tr>
                            <td colSpan={2 + activites.length} style={{ background: '#faf5ff', padding: '8px 16px', borderTop: '1px solid #e9d5ff' }}>
                              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                                ↗ 5 derniers transferts — {r.nom}
                              </div>
                              {isTransferLoading ? (
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Chargement…</span>
                              ) : transfers.length === 0 ? (
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Aucun transfert enregistré</span>
                              ) : (() => {
                                const actNames = Array.from(new Set(transfers.map((t) => t.activiteNom))).sort();
                                const actTotals: Record<string, number> = {};
                                for (const t of transfers) actTotals[t.activiteNom] = (actTotals[t.activiteNom] ?? 0) + t.quantite;
                                return (
                                  <div style={{ overflowX: 'auto' }}>
                                    <table style={{ fontSize: '0.8rem', width: '100%', minWidth: 400 }}>
                                      <thead>
                                        <tr style={{ background: '#ede9fe' }}>
                                          <th style={{ textAlign: 'left', color: '#7c3aed', fontWeight: 700, padding: '4px 8px' }}>Date</th>
                                          {actNames.map((an) => (
                                            <th key={an} style={{ textAlign: 'right', color: '#7c3aed', fontWeight: 700, padding: '4px 8px' }}>↗ {an}</th>
                                          ))}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        <tr style={{ fontWeight: 700, background: '#f5f3ff' }}>
                                          <td style={{ padding: '4px 8px', color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase' }}>Total</td>
                                          {actNames.map((an) => (
                                            <td key={an} style={{ textAlign: 'right', padding: '4px 8px', color: '#7c3aed' }}>
                                              {actTotals[an]?.toFixed(3) ?? '0.000'}
                                            </td>
                                          ))}
                                        </tr>
                                        {transfers.map((tr, i) => (
                                          <tr key={i} style={{ borderTop: '1px solid #f3e8ff', fontSize: '0.75rem' }}>
                                            <td style={{ color: 'var(--text-muted)', padding: '2px 8px' }}>{fmtDate(tr.dateTransfert)}</td>
                                            {actNames.map((an) => (
                                              <td key={an} style={{ textAlign: 'right', padding: '2px 8px', color: tr.activiteNom === an ? '#7c3aed' : 'var(--text-muted)' }}>
                                                {tr.activiteNom === an ? tr.quantite.toFixed(3) : '—'}
                                              </td>
                                            ))}
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                );
                              })()}
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
