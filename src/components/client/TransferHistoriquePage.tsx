import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';

const currentYear = new Date().getFullYear();
const yearStart = `${currentYear}-01-01`;
const yearEnd = `${currentYear}-12-31`;
const PAGE_SIZE = 10;

const fmtDate = (iso: string | null | undefined) => {
  if (!iso || iso.length < 10) return iso ?? '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

interface TransferEntry {
  id: number;
  quantite: number;
  dateTransfert: string;
  note: string | null;
  ingredientId: number;
  ingredientNom: string;
  uniteNom: string;
  categorieNom: string;
  activiteId: number;
  activiteNom: string;
}

interface Activite { id: number; nom: string }

export default function TransferHistoriquePage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const laboId = searchParams.get('laboId') || '';

  const [labo, setLabo] = useState<{ nom: string; franchiseGroup: string; activites: Activite[] } | null>(null);
  const [results, setResults] = useState<TransferEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [page, setPage] = useState(1);

  // Server-side filters
  const [startDate, setStartDate] = useState(yearStart);
  const [endDate, setEndDate] = useState(yearEnd);
  const [filterActiviteId, setFilterActiviteId] = useState('');

  // Client-side filters
  const [filterCategorie, setFilterCategorie] = useState('');
  const [filterNom, setFilterNom] = useState('');

  // Detail popup
  const [detailPopup, setDetailPopup] = useState<TransferEntry | null>(null);

  useEffect(() => {
    if (!laboId) return;
    api.get(`/api/labo/${laboId}`).then(({ data }) => setLabo(data)).catch(() => {});
  }, [laboId]);

  const fetchResults = useCallback(async () => {
    if (!laboId) return;
    setLoading(true);
    setSearched(true);
    setPage(1);
    setFilterCategorie('');
    setFilterNom('');
    try {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (filterActiviteId) params.set('activiteId', filterActiviteId);
      const { data } = await api.get(`/api/labo/${laboId}/transfers?${params}`);
      setResults(data as TransferEntry[]);
    } catch {
      setResults([]);
    }
    setLoading(false);
  }, [laboId, startDate, endDate, filterActiviteId]);

  const activites: Activite[] = labo?.activites || [];

  // Client-side filtering
  const allCategories = Array.from(new Set(results.map((r) => r.categorieNom))).sort();
  const filteredResults = results.filter((r) => {
    const catOk = !filterCategorie || r.categorieNom === filterCategorie;
    const nomOk = !filterNom || r.ingredientNom.toLowerCase().includes(filterNom.toLowerCase());
    return catOk && nomOk;
  });

  // Totals
  const totalPages = Math.max(1, Math.ceil(filteredResults.length / PAGE_SIZE));
  const pagedResults = filteredResults.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Qty by unit for summary
  const qtyByUnit: Record<string, number> = {};
  for (const r of filteredResults) {
    qtyByUnit[r.uniteNom] = (qtyByUnit[r.uniteNom] || 0) + r.quantite;
  }
  const unitEntries = Object.entries(qtyByUnit).sort(([a], [b]) => a.localeCompare(b));

  if (!laboId) return <div className="page"><p className="text-muted">Labo introuvable.</p></div>;

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1>📋 {labo ? labo.nom : t('common.loading')} — {t('client.labo.transfers_history')} {currentYear}</h1>
          {labo && <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 2 }}>{labo.franchiseGroup}</p>}
        </div>
        <Link to={`/client/labo/transfer?laboId=${laboId}`} className="btn btn-primary btn-sm">
          ↗ {t('client.labo.btn_transfer')}
        </Link>
      </div>

      {/* ── Modern filter panel ─────────────────────────────────────────── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary, #f8fafc)' }}>
          <span style={{ fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--text-muted)' }}>Filtres</span>
        </div>
        <div style={{ padding: '18px 24px 0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '12px 20px' }}>
            {activites.length > 0 && (
              <div>
                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>
                  {t('client.labo.filter_activite')}
                </label>
                <select className="input" style={{ width: '100%' }} value={filterActiviteId} onChange={(e) => setFilterActiviteId(e.target.value)}>
                  <option value="">{t('client.labo.all_activites')}</option>
                  {activites.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
                </select>
              </div>
            )}
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>
                {t('client.historique_appro.start_date')}
              </label>
              <input type="date" className="input" style={{ width: '100%' }} min={yearStart} max={yearEnd} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>
                {t('client.historique_appro.end_date')}
              </label>
              <input type="date" className="input" style={{ width: '100%' }} min={yearStart} max={yearEnd} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
        </div>
        <div style={{ padding: '16px 24px', marginTop: 16, borderTop: '1px solid var(--border)', background: 'var(--bg-secondary, #f8fafc)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn btn-primary" onClick={fetchResults} disabled={loading}>
            {loading ? t('common.loading') : '🔍 Rechercher'}
          </button>
        </div>
      </div>

      {/* Results */}
      {!searched ? null : loading ? (
        <p className="text-muted">{t('common.loading')}</p>
      ) : results.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">📦</span>
          <p>{t('client.historique_appro.no_results')}</p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap', alignItems: 'stretch' }}>
            {/* Total transfers */}
            <div style={{
              background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
              color: '#fff', borderRadius: 14, padding: '18px 24px',
              minWidth: 160, display: 'flex', flexDirection: 'column', gap: 6,
              boxShadow: '0 4px 16px rgba(37,99,235,0.25)',
            }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.8 }}>
                {t('client.labo.total_transferts')}
              </span>
              <span style={{ fontSize: '2rem', fontWeight: 800, lineHeight: 1 }}>{filteredResults.length}</span>
              <span style={{ fontSize: '0.72rem', opacity: 0.7 }}>lignes</span>
            </div>

            {/* Per-unit totals */}
            {unitEntries.map(([unit, qty], i) => {
              const gradients = [
                'linear-gradient(135deg, #0369a1 0%, #0ea5e9 100%)',
                'linear-gradient(135deg, #065f46 0%, #10b981 100%)',
                'linear-gradient(135deg, #7c2d12 0%, #f59e0b 100%)',
                'linear-gradient(135deg, #4c1d95 0%, #8b5cf6 100%)',
                'linear-gradient(135deg, #831843 0%, #ec4899 100%)',
              ];
              const shadows = [
                '0 4px 16px rgba(14,165,233,0.25)',
                '0 4px 16px rgba(16,185,129,0.25)',
                '0 4px 16px rgba(245,158,11,0.25)',
                '0 4px 16px rgba(139,92,246,0.25)',
                '0 4px 16px rgba(236,72,153,0.25)',
              ];
              return (
                <div key={unit} style={{
                  background: gradients[i % gradients.length],
                  color: '#fff', borderRadius: 14, padding: '18px 24px',
                  minWidth: 160, display: 'flex', flexDirection: 'column', gap: 6,
                  boxShadow: shadows[i % shadows.length],
                }}>
                  <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.8 }}>
                    Total {unit}
                  </span>
                  <span style={{ fontSize: '2rem', fontWeight: 800, lineHeight: 1 }}>{qty % 1 === 0 ? qty.toFixed(0) : qty.toFixed(3)}</span>
                  <span style={{ fontSize: '0.72rem', opacity: 0.7 }}>{unit}</span>
                </div>
              );
            })}
          </div>

          {/* Client-side filters (compact card) */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, marginBottom: 16, overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
            <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary, #f8fafc)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>Affiner les résultats</span>
              {(filterCategorie || filterNom) && (
                <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.75rem' }}
                  onClick={() => { setFilterCategorie(''); setFilterNom(''); setPage(1); }}>✕ Réinitialiser</button>
              )}
            </div>
            <div style={{ padding: '14px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px 18px' }}>
              <div>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>Catégorie</span>
                <select className="input" style={{ width: '100%' }} value={filterCategorie}
                  onChange={(e) => { setFilterCategorie(e.target.value); setPage(1); }}>
                  <option value="">{t('client.catalogue_franchise.all_categories')}</option>
                  {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 5 }}>{t('client.stock.ingredient')}</span>
                <input
                  type="text" className="input" style={{ width: '100%' }}
                  placeholder={t('client.stock.search_ingredient')}
                  value={filterNom}
                  onChange={(e) => { setFilterNom(e.target.value); setPage(1); }}
                />
              </div>
            </div>
          </div>

          {filteredResults.length === 0 ? (
            <p className="text-muted">{t('common.no_result')}</p>
          ) : (
            <div className="table-responsive card">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('client.labo.col_date')}</th>
                    <th>{t('client.labo.col_activite')}</th>
                    <th>{t('client.historique_appro.col_ingredient')}</th>
                    <th>{t('client.historique_appro.col_category')}</th>
                    <th style={{ textAlign: 'right' }}>{t('client.historique_appro.col_qty')}</th>
                    <th style={{ textAlign: 'center', width: 60 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {pagedResults.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600, color: 'var(--primary)' }}>{fmtDate(r.dateTransfert)}</td>
                      <td style={{ fontWeight: 600 }}>{r.activiteNom}</td>
                      <td>{r.ingredientNom}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{r.categorieNom}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--success, #10b981)' }}>
                        {r.quantite % 1 === 0 ? r.quantite.toFixed(0) : r.quantite} <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 400 }}>{r.uniteNom}</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {r.note ? (
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ fontSize: '0.78rem', padding: '3px 10px', borderRadius: 20, border: '1px solid var(--border)', color: 'var(--primary)' }}
                            onClick={() => setDetailPopup(r)}
                          >
                            📝
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Pagination */}
              <div style={{ padding: '8px 14px', fontSize: '0.78rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>{filteredResults.length} transfert{filteredResults.length > 1 ? 's' : ''}</span>
                {totalPages > 1 && (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))} style={{ padding: '3px 10px', fontWeight: 700 }}>‹</button>
                    <span style={{ fontWeight: 600, color: 'var(--text)' }}>{page} / {totalPages}</span>
                    <button className="btn btn-ghost btn-sm" disabled={page === totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} style={{ padding: '3px 10px', fontWeight: 700 }}>›</button>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Detail popup */}
      {detailPopup && (
        <div className="modal-overlay" onClick={() => setDetailPopup(null)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header modal-header--primary">
              <h2>📋 Détail du transfert</h2>
              <button className="modal-close" onClick={() => setDetailPopup(null)}>✕</button>
            </div>
            <div className="modal-body">
              <table style={{ width: '100%', fontSize: '0.9rem', borderCollapse: 'collapse' }}>
                <tbody>
                  {[
                    ['Date', fmtDate(detailPopup.dateTransfert)],
                    ['Activité', detailPopup.activiteNom],
                    ['Ingrédient', detailPopup.ingredientNom],
                    ['Catégorie', detailPopup.categorieNom],
                    ['Quantité', `${detailPopup.quantite % 1 === 0 ? detailPopup.quantite.toFixed(0) : detailPopup.quantite} ${detailPopup.uniteNom}`],
                  ].map(([label, value]) => (
                    <tr key={label} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 0', fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', width: 110 }}>{label}</td>
                      <td style={{ padding: '10px 0', fontWeight: 600 }}>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {detailPopup.note && (
                <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--primary-light, #eef2ff)', borderRadius: 10, borderLeft: '4px solid var(--primary)' }}>
                  <p style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--primary)', marginBottom: 6 }}>Remarque</p>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text)', lineHeight: 1.5, margin: 0 }}>{detailPopup.note}</p>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setDetailPopup(null)}>{t('common.close')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
