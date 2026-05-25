import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import api from '../../api/client';
import type { Labo } from '../../types';

const fmtDate = (iso: string | null | undefined) => {
  if (!iso || iso.length < 10) return iso ?? '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

const fmtMoney = (n: number | null | undefined) => {
  if (n == null) return '—';
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' DT';
};

const C = '#b45309';
const CD = '#78350f';
const CL = '#fffbeb';
const CB = '#fcd34d';
const PAGE_SIZE = 10;

interface LaboTransfert {
  id: string;
  date_transfert: string;
  article_nom: string;
  article_type: 'produit' | 'ingredient';
  unite_nom?: string | null;
  activite_nom: string;
  quantite: number;
  prix_unitaire: number | null;
  valeur: number;
  prix_moyen_appro: number | null;
  note?: string | null;
}

export default function LaboVentesPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [labos, setLabos] = useState<Labo[]>([]);
  const [selectedLaboId, setSelectedLaboId] = useState<number | null>(null);
  const [transferts, setTransferts] = useState<LaboTransfert[]>([]);

  // Date filters
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // Text / select filters
  const [filterActivite, setFilterActivite] = useState('');
  const [filterArticle, setFilterArticle] = useState('');

  // Pagination
  const [page, setPage] = useState(1);

  useEffect(() => {
    api.get('/api/labo').then(({ data }) => {
      setLabos(data);
      const paramId = searchParams.get('laboId');
      const found = (data as Labo[]).find(l => String(l.id) === paramId);
      setSelectedLaboId(found ? found.id : (data as Labo[])[0]?.id ?? null);
    }).catch(() => {});
  }, []);

  const loadTransferts = useCallback(() => {
    if (!selectedLaboId) return;
    const params = new URLSearchParams({ laboId: String(selectedLaboId) });
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    api.get(`/api/labo-ventes?${params}`)
      .then(({ data }) => { setTransferts(data as LaboTransfert[]); setPage(1); })
      .catch(() => {});
  }, [selectedLaboId, from, to]);

  useEffect(() => { loadTransferts(); }, [loadTransferts]);

  const selectedLabo = labos.find(l => l.id === selectedLaboId);

  // Derive filter options from loaded data
  const activiteOptions = useMemo(
    () => [...new Set(transferts.map(t => t.activite_nom))].sort(),
    [transferts]
  );
  const articleOptions = useMemo(
    () => [...new Set(transferts.map(t => t.article_nom))].sort(),
    [transferts]
  );

  // Apply filters
  const filtered = useMemo(() => {
    let r = transferts;
    if (filterActivite) r = r.filter(t => t.activite_nom === filterActivite);
    if (filterArticle) r = r.filter(t => t.article_nom === filterArticle);
    return r;
  }, [transferts, filterActivite, filterArticle]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totalValeur = filtered.reduce((s, l) => s + l.valeur, 0);
  const totalEcart = filtered.reduce((s, l) => {
    if (l.prix_unitaire == null || l.prix_moyen_appro == null) return s;
    return s + (l.prix_unitaire - l.prix_moyen_appro) * l.quantite;
  }, 0);

  const ecartColor = (prix: number | null, appro: number | null) => {
    if (prix == null || appro == null) return 'var(--text-muted)';
    return prix >= appro ? '#16a34a' : '#dc2626';
  };

  const ecartPct = (prix: number | null, appro: number | null) => {
    if (prix == null || appro == null || appro === 0) return null;
    return ((prix - appro) / appro) * 100;
  };

  const resetFilters = () => { setFilterActivite(''); setFilterArticle(''); setFrom(''); setTo(''); setPage(1); };

  const hasFilters = filterActivite || filterArticle || from || to;

  const selectStyle = {
    padding: '7px 10px', borderRadius: 8, border: `1.5px solid ${CB}`,
    background: CL, color: CD, fontSize: '0.85rem', outline: 'none', cursor: 'pointer',
  };

  const colW = ['10%', '18%', '12%', '7%', '12%', '12%', '12%', '11%'] as const;

  return (
    <div className="page-content">
      {/* Hero */}
      <div style={{
        background: `linear-gradient(135deg, ${CD} 0%, ${C} 55%, #d97706 100%)`,
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(180,83,9,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🏭</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>
              Ventes Labo{selectedLabo ? ` — ${selectedLabo.nom}` : ''}
            </h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.82)', margin: 0, fontSize: '0.85rem' }}>
            Historique des transferts valorisés avec analyse prix / coût
          </p>
        </div>
        <Link to="/client/ventes/rapport" style={{ background: 'rgba(255,255,255,0.18)', color: '#fff', borderRadius: 20, padding: '5px 14px', fontSize: '0.82rem', fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.3)' }}>
          📊 Rapport
        </Link>
      </div>

      {/* Labo selector */}
      {labos.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 20, padding: '10px 14px', background: '#fff', borderRadius: 10, border: `1px solid ${CB}` }}>
          {labos.map(l => (
            <button key={l.id} onClick={() => { setSelectedLaboId(l.id); navigate(`/client/labo/ventes?laboId=${l.id}`); }}
              style={{
                padding: '4px 14px', borderRadius: 20, cursor: 'pointer', fontSize: '0.82rem',
                border: selectedLaboId === l.id ? `1.5px solid ${C}` : `1.5px solid ${CB}`,
                background: selectedLaboId === l.id ? C : CL,
                color: selectedLaboId === l.id ? '#fff' : CD,
                fontWeight: selectedLaboId === l.id ? 700 : 400,
              }}>
              🏭 {l.nom}
            </button>
          ))}
        </div>
      )}

      {!selectedLaboId ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 0' }}>Aucun labo disponible</div>
      ) : (
        <>
          {/* Filters */}
          <div style={{ background: '#fff', borderRadius: 12, border: `1.5px solid ${CB}`, padding: '14px 18px', marginBottom: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {/* Date range */}
            <div>
              <label style={{ fontSize: '0.72rem', display: 'block', marginBottom: 4, fontWeight: 700, color: C, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Du</label>
              <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }}
                style={{ padding: '7px 10px', borderRadius: 8, border: `1.5px solid ${CB}`, background: CL, color: CD, fontSize: '0.85rem' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', display: 'block', marginBottom: 4, fontWeight: 700, color: C, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Au</label>
              <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }}
                style={{ padding: '7px 10px', borderRadius: 8, border: `1.5px solid ${CB}`, background: CL, color: CD, fontSize: '0.85rem' }} />
            </div>
            <button onClick={loadTransferts}
              style={{ padding: '8px 16px', borderRadius: 8, border: `1.5px solid ${C}`, color: '#fff', background: C, cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
              Filtrer dates
            </button>

            {/* Separator */}
            <div style={{ width: 1, background: CB, alignSelf: 'stretch', margin: '0 4px' }} />

            {/* Activité filter */}
            <div>
              <label style={{ fontSize: '0.72rem', display: 'block', marginBottom: 4, fontWeight: 700, color: C, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Activité</label>
              <select value={filterActivite} onChange={e => { setFilterActivite(e.target.value); setPage(1); }} style={selectStyle}>
                <option value="">Toutes</option>
                {activiteOptions.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            {/* Article filter */}
            <div>
              <label style={{ fontSize: '0.72rem', display: 'block', marginBottom: 4, fontWeight: 700, color: C, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Article</label>
              <select value={filterArticle} onChange={e => { setFilterArticle(e.target.value); setPage(1); }} style={selectStyle}>
                <option value="">Tous</option>
                {articleOptions.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            {hasFilters && (
              <button onClick={resetFilters}
                style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: '0.83rem', color: 'var(--text-muted)' }}>
                ✕ Réinitialiser
              </button>
            )}
          </div>

          {/* KPIs */}
          {filtered.length > 0 && (
            <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 160, background: '#fff', borderRadius: 12, border: `1.5px solid ${CB}`, padding: '14px 20px' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Valeur totale</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: C }}>{fmtMoney(totalValeur)}</div>
              </div>
              <div style={{ flex: 1, minWidth: 160, background: '#fff', borderRadius: 12, border: `1.5px solid ${CB}`, padding: '14px 20px' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Écart total (prix − coût)</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: totalEcart >= 0 ? '#16a34a' : '#dc2626' }}>
                  {totalEcart >= 0 ? '+' : ''}{fmtMoney(totalEcart)}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 140, background: '#fff', borderRadius: 12, border: `1.5px solid ${CB}`, padding: '14px 20px' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Résultats</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: CD }}>{filtered.length} <span style={{ fontSize: '0.78rem', fontWeight: 500 }}>lignes</span></div>
              </div>
            </div>
          )}

          {/* Table */}
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)', background: '#fff', borderRadius: 14, border: `1.5px solid ${CB}` }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📤</div>
              Aucun transfert valorisé trouvé
            </div>
          ) : (
            <>
              <div style={{ background: '#fff', borderRadius: 14, border: `1.5px solid ${CB}`, overflow: 'hidden', boxShadow: '0 2px 12px rgba(180,83,9,0.08)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  <colgroup>
                    {colW.map((w, i) => <col key={i} style={{ width: w }} />)}
                  </colgroup>
                  <thead>
                    <tr style={{ background: CL, borderBottom: `2px solid ${CB}` }}>
                      <th style={{ padding: '11px 12px', textAlign: 'left', fontSize: '0.74rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Date</th>
                      <th style={{ padding: '11px 12px', textAlign: 'left', fontSize: '0.74rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Article</th>
                      <th style={{ padding: '11px 12px', textAlign: 'left', fontSize: '0.74rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Activité</th>
                      <th style={{ padding: '11px 12px', textAlign: 'right', fontSize: '0.74rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Qté</th>
                      <th style={{ padding: '11px 12px', textAlign: 'right', fontSize: '0.74rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Prix transfert</th>
                      <th style={{ padding: '11px 12px', textAlign: 'right', fontSize: '0.74rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Px moy. appro</th>
                      <th style={{ padding: '11px 12px', textAlign: 'right', fontSize: '0.74rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Écart / unité</th>
                      <th style={{ padding: '11px 12px', textAlign: 'right', fontSize: '0.74rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Valeur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageData.map((l, idx) => {
                      const ecart = l.prix_unitaire != null && l.prix_moyen_appro != null
                        ? l.prix_unitaire - l.prix_moyen_appro
                        : null;
                      const pct = ecartPct(l.prix_unitaire, l.prix_moyen_appro);
                      const color = ecartColor(l.prix_unitaire, l.prix_moyen_appro);
                      return (
                        <tr key={l.id} style={{ borderBottom: `1px solid ${CB}`, background: idx % 2 === 0 ? '#fff' : '#fffdf7' }}>
                          <td style={{ padding: '11px 12px', fontWeight: 600, fontSize: '0.86rem' }}>{fmtDate(l.date_transfert)}</td>
                          <td style={{ padding: '11px 12px', fontSize: '0.86rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            <div style={{ fontWeight: 600, color: CD, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.article_nom}</div>
                            {l.unite_nom && <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{l.unite_nom}</div>}
                          </td>
                          <td style={{ padding: '11px 12px', fontSize: '0.82rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.activite_nom}</td>
                          <td style={{ padding: '11px 12px', fontSize: '0.86rem', textAlign: 'right' }}>{l.quantite}</td>
                          <td style={{ padding: '11px 12px', fontSize: '0.86rem', textAlign: 'right', fontWeight: 700, color: C }}>{fmtMoney(l.prix_unitaire)}</td>
                          <td style={{ padding: '11px 12px', fontSize: '0.86rem', textAlign: 'right' }}>{fmtMoney(l.prix_moyen_appro)}</td>
                          <td style={{ padding: '11px 12px', textAlign: 'right' }}>
                            {ecart != null ? (
                              <div style={{ color, fontWeight: 700, fontSize: '0.86rem' }}>
                                {ecart >= 0 ? '+' : ''}{fmtMoney(ecart)}
                                {pct != null && (
                                  <div style={{ fontSize: '0.68rem', fontWeight: 500, opacity: 0.8 }}>
                                    {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: '11px 12px', fontWeight: 700, color: C, textAlign: 'right' }}>{fmtMoney(l.valeur)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: CL, borderTop: `2px solid ${CB}` }}>
                      <td colSpan={7} style={{ padding: '11px 12px', fontWeight: 700, fontSize: '0.88rem', color: CD }}>
                        Total ({filtered.length} ligne{filtered.length !== 1 ? 's' : ''})
                      </td>
                      <td style={{ padding: '11px 12px', fontWeight: 800, fontSize: '1rem', color: C, textAlign: 'right' }}>
                        {fmtMoney(totalValeur)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 18 }}>
                  <button onClick={() => setPage(1)} disabled={page === 1}
                    style={{ padding: '6px 10px', borderRadius: 7, border: `1.5px solid ${page === 1 ? CB : C}`, background: page === 1 ? '#f9f9f9' : CL, color: page === 1 ? 'var(--text-muted)' : C, cursor: page === 1 ? 'default' : 'pointer', fontWeight: 700, fontSize: '0.82rem' }}>
                    «
                  </button>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    style={{ padding: '6px 10px', borderRadius: 7, border: `1.5px solid ${page === 1 ? CB : C}`, background: page === 1 ? '#f9f9f9' : CL, color: page === 1 ? 'var(--text-muted)' : C, cursor: page === 1 ? 'default' : 'pointer', fontWeight: 700, fontSize: '0.82rem' }}>
                    ‹
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                    const p = start + i;
                    return p <= totalPages ? (
                      <button key={p} onClick={() => setPage(p)}
                        style={{ padding: '6px 12px', borderRadius: 7, border: `1.5px solid ${p === page ? C : CB}`, background: p === page ? C : '#fff', color: p === page ? '#fff' : CD, cursor: 'pointer', fontWeight: p === page ? 800 : 400, fontSize: '0.85rem', minWidth: 34 }}>
                        {p}
                      </button>
                    ) : null;
                  })}
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                    style={{ padding: '6px 10px', borderRadius: 7, border: `1.5px solid ${page === totalPages ? CB : C}`, background: page === totalPages ? '#f9f9f9' : CL, color: page === totalPages ? 'var(--text-muted)' : C, cursor: page === totalPages ? 'default' : 'pointer', fontWeight: 700, fontSize: '0.82rem' }}>
                    ›
                  </button>
                  <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
                    style={{ padding: '6px 10px', borderRadius: 7, border: `1.5px solid ${page === totalPages ? CB : C}`, background: page === totalPages ? '#f9f9f9' : CL, color: page === totalPages ? 'var(--text-muted)' : C, cursor: page === totalPages ? 'default' : 'pointer', fontWeight: 700, fontSize: '0.82rem' }}>
                    »
                  </button>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginLeft: 8 }}>
                    Page {page} / {totalPages} — {filtered.length} lignes
                  </span>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
