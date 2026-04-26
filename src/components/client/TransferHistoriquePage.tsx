import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';

const currentYear = new Date().getFullYear();
const yearStart = `${currentYear}-01-01`;
const yearEnd = `${currentYear}-12-31`;
const PAGE_SIZE = 15;

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

  const [startDate, setStartDate] = useState(yearStart);
  const [endDate, setEndDate] = useState(yearEnd);
  const [filterActiviteId, setFilterActiviteId] = useState('');

  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const pagedResults = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalQty = results.reduce((s, r) => s + r.quantite, 0);

  useEffect(() => {
    if (!laboId) return;
    api.get(`/api/labo/${laboId}`).then(({ data }) => setLabo(data)).catch(() => {});
  }, [laboId]);

  const fetchResults = useCallback(async () => {
    if (!laboId) return;
    setLoading(true);
    setSearched(true);
    setPage(1);
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

      {/* Filters */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {activites.length > 0 && (
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>
                {t('client.labo.filter_activite')}
              </label>
              <select className="input" style={{ maxWidth: 200 }} value={filterActiviteId} onChange={(e) => setFilterActiviteId(e.target.value)}>
                <option value="">{t('client.labo.all_activites')}</option>
                {activites.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
              </select>
            </div>
          )}
          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>
              {t('client.historique_appro.start_date')}
            </label>
            <input type="date" className="input" style={{ maxWidth: 160 }} min={yearStart} max={yearEnd} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>
              {t('client.historique_appro.end_date')}
            </label>
            <input type="date" className="input" style={{ maxWidth: 160 }} min={yearStart} max={yearEnd} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
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
          {/* Totals */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 18px', minWidth: 160 }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>{t('client.labo.total_transferts')}</span>
              <span style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text)' }}>{results.length}</span>
            </div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 18px', minWidth: 160 }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>{t('client.historique_appro.total_qty')}</span>
              <span style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--primary)' }}>{totalQty.toFixed(3)}</span>
            </div>
          </div>

          <div className="table-responsive card">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('client.labo.col_date')}</th>
                  <th>{t('client.labo.col_activite')}</th>
                  <th>{t('client.historique_appro.col_ingredient')}</th>
                  <th>{t('client.historique_appro.col_category')}</th>
                  <th style={{ textAlign: 'right' }}>{t('client.historique_appro.col_qty')}</th>
                  <th>{t('client.labo.col_note')}</th>
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
                      {r.quantite} <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 400 }}>{r.uniteNom}</span>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{r.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Pagination */}
            <div style={{ padding: '8px 14px', fontSize: '0.78rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>{results.length} transfert{results.length > 1 ? 's' : ''}</span>
              {totalPages > 1 && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))} style={{ padding: '3px 10px', fontWeight: 700 }}>‹</button>
                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>{page} / {totalPages}</span>
                  <button className="btn btn-ghost btn-sm" disabled={page === totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} style={{ padding: '3px 10px', fontWeight: 700 }}>›</button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
