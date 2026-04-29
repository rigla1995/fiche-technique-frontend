import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/client';
import type { Labo } from '../../types';

const currentYear = new Date().getFullYear();
const yearStart = `${currentYear}-01-01`;
const yearEnd = `${currentYear}-12-31`;

const PAGE_SIZE = 20;

const fmtDate = (iso: string | null | undefined) => {
  if (!iso || iso.length < 10) return iso ?? '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

interface HistEntry {
  id: number;
  ingredientId: number;
  ingredientNom: string;
  uniteNom: string;
  categorieNom: string;
  dateAppro: string;
  quantite: number | null;
  prixUnitaire: number | null;
  refFacture: string | null;
  fournisseurId: number | null;
  fournisseurNom: string | null;
}

const labelStyle: React.CSSProperties = {
  fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4,
};

export default function LaboHistoriqueApproPage() {
  const [searchParams] = useSearchParams();
  const laboId = searchParams.get('laboId');

  const [labo, setLabo] = useState<Labo | null>(null);
  const [results, setResults] = useState<HistEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [page, setPage] = useState(1);

  const [startDate, setStartDate] = useState(yearStart);
  const [endDate, setEndDate] = useState(yearEnd);
  const [filterIngredient, setFilterIngredient] = useState('');

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
      const { data } = await api.get(`/api/labo/${laboId}/historique?${params}`);
      setResults(data as HistEntry[]);
    } catch {
      setResults([]);
    }
    setLoading(false);
  }, [laboId, startDate, endDate]);

  const filtered = filterIngredient
    ? results.filter((r) => r.ingredientNom.toLowerCase().includes(filterIngredient.toLowerCase()))
    : results;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pagedResults = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Unit totals
  const unitTotals: Record<string, { qty: number; cost: number }> = {};
  for (const r of filtered) {
    if (!unitTotals[r.uniteNom]) unitTotals[r.uniteNom] = { qty: 0, cost: 0 };
    unitTotals[r.uniteNom].qty += r.quantite ?? 0;
    unitTotals[r.uniteNom].cost += (r.quantite ?? 0) * (r.prixUnitaire ?? 0);
  }

  if (!laboId) return <div className="page"><p className="text-muted">Labo non spécifié.</p></div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1>📋 Historique Appro — {labo?.nom ?? '…'} ({currentYear})</h1>
      </div>

      {/* Filter panel */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 24px', marginBottom: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={labelStyle}>Date début</label>
            <input type="date" className="input" style={{ maxWidth: 160 }} min={yearStart} max={yearEnd}
              value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Date fin</label>
            <input type="date" className="input" style={{ maxWidth: 160 }} min={yearStart} max={yearEnd}
              value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Recherche ingrédient</label>
            <input type="text" className="input" style={{ maxWidth: 200 }}
              placeholder="Nom ingrédient…"
              value={filterIngredient} onChange={(e) => { setFilterIngredient(e.target.value); setPage(1); }} />
          </div>
          <button className="btn btn-primary" style={{ alignSelf: 'flex-end' }} onClick={fetchResults} disabled={loading}>
            {loading ? 'Chargement…' : '🔍 Rechercher'}
          </button>
        </div>
      </div>

      {/* Results */}
      {!searched ? (
        <p className="text-muted" style={{ textAlign: 'center', marginTop: 40 }}>Cliquez sur Rechercher pour afficher les approvisionnements.</p>
      ) : loading ? (
        <p className="text-muted">Chargement…</p>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">📦</span>
          <p>Aucun approvisionnement trouvé pour cette période.</p>
        </div>
      ) : (
        <>
          {/* Totals per unit */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            {Object.entries(unitTotals).map(([unit, data]) => (
              <div key={unit} style={{
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
                padding: '10px 18px', textAlign: 'left', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 2 }}>{unit}</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#2563eb' }}>
                  {data.qty.toFixed(3)} <span style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-muted)' }}>{unit}</span>
                </div>
                <div style={{ fontSize: '0.82rem', color: '#15803d', fontWeight: 600 }}>{data.cost.toFixed(3)} DT</div>
              </div>
            ))}
          </div>

          <div className="card th-teal" style={{ overflowX: 'hidden' }}>
            <table className="table" style={{ tableLayout: 'fixed', width: '100%' }}>
              <colgroup>
                <col style={{ width: '110px' }} />
                <col />
                <col style={{ width: '100px' }} />
                <col style={{ width: '85px' }} />
                <col style={{ width: '130px' }} />
                <col style={{ width: '50px' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Ingrédient</th>
                  <th style={{ textAlign: 'right' }}>Quantité</th>
                  <th style={{ textAlign: 'right' }}>Prix/DT</th>
                  <th>Fourn. / Réf</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pagedResults.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--primary)', fontSize: '0.85rem' }}>{fmtDate(r.dateAppro)}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.ingredientNom}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.categorieNom}</div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: (r.quantite ?? 0) > 0 ? '#15803d' : '#dc2626' }}>
                      <div>{r.quantite ?? '—'}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 400 }}>{r.uniteNom}</div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: r.prixUnitaire ? '#1d4ed8' : 'var(--text-muted)', fontSize: '0.88rem' }}>
                      {r.prixUnitaire !== null ? r.prixUnitaire.toFixed(3) : '—'}
                    </td>
                    <td style={{ fontSize: '0.78rem' }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.fournisseurNom ?? '—'}</div>
                      <div style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.refFacture ?? '—'}</div>
                    </td>
                    <td></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ padding: '8px 14px', fontSize: '0.78rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>{filtered.length} enregistrement{filtered.length > 1 ? 's' : ''}</span>
              {totalPages > 1 && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button className="btn btn-ghost btn-sm" disabled={page === 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))} style={{ padding: '3px 10px', fontWeight: 700 }}>‹</button>
                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>{page} / {totalPages}</span>
                  <button className="btn btn-ghost btn-sm" disabled={page === totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))} style={{ padding: '3px 10px', fontWeight: 700 }}>›</button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
