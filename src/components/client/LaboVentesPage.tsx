import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import api from '../../api/client';
import type { Labo } from '../../types';

const apiMsg = (e: unknown, fallback = 'Erreur') =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

const ExcelIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
    <rect width="24" height="24" rx="3" fill="#1D6F42"/>
    <path d="M7 7l3.5 5L7 17h2.5l2.5-3.5L14.5 17H17l-3.5-5L17 7h-2.5L12 10.5 9.5 7H7z" fill="white"/>
  </svg>
);

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
  article_type: 'produit';
  unite_nom?: string | null;
  activite_nom: string;
  categorie_nom: string;
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

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [filterCategorie, setFilterCategorie] = useState('');
  const [filterActivite, setFilterActivite] = useState('');
  const [filterArticle, setFilterArticle] = useState('');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exportingXls, setExportingXls] = useState(false);

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

  // Derive filter options
  const categorieOptions = useMemo(
    () => [...new Set(transferts.map(t => t.categorie_nom))].sort(),
    [transferts]
  );
  const activiteOptions = useMemo(
    () => [...new Set(transferts.map(t => t.activite_nom))].sort(),
    [transferts]
  );
  const articleOptions = useMemo(() => {
    let src = transferts;
    if (filterCategorie) src = src.filter(t => t.categorie_nom === filterCategorie);
    return [...new Set(src.map(t => t.article_nom))].sort();
  }, [transferts, filterCategorie]);

  // When category changes, reset article filter if it no longer belongs to new category
  const handleCategorieChange = (val: string) => {
    setFilterCategorie(val);
    setFilterArticle('');
    setPage(1);
  };

  // Apply filters
  const filtered = useMemo(() => {
    let r = transferts;
    if (filterCategorie) r = r.filter(t => t.categorie_nom === filterCategorie);
    if (filterActivite) r = r.filter(t => t.activite_nom === filterActivite);
    if (filterArticle) r = r.filter(t => t.article_nom === filterArticle);
    return r;
  }, [transferts, filterCategorie, filterActivite, filterArticle]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // KPI aggregates on filtered data
  const totalTransferts = filtered.reduce((s, l) => s + l.valeur, 0);
  const totalAchat = filtered.reduce((s, l) => {
    if (l.prix_moyen_appro == null) return s;
    return s + l.prix_moyen_appro * l.quantite;
  }, 0);
  const totalEcart = totalTransferts - totalAchat;

  const hasFilters = filterCategorie || filterActivite || filterArticle || from || to;
  const resetFilters = () => { setFilterCategorie(''); setFilterActivite(''); setFilterArticle(''); setFrom(''); setTo(''); setPage(1); };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleExportXls = async () => {
    if (!selectedLaboId) return;
    setExportingXls(true);
    try {
      const params = new URLSearchParams({ laboId: String(selectedLaboId) });
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (filterCategorie) params.set('filterCategorie', filterCategorie);
      if (filterActivite) params.set('filterActivite', filterActivite);
      if (filterArticle) params.set('filterArticle', filterArticle);
      if (selectedIds.size > 0) params.set('selectedIds', [...selectedIds].join(','));
      const resp = await api.get(`/api/labo-ventes/export-excel?${params}`, { responseType: 'blob' });
      const url = URL.createObjectURL(resp.data as Blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'historique-ventes-labo.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) { alert(apiMsg(e)); }
    finally { setExportingXls(false); }
  };

  const selectStyle: React.CSSProperties = {
    padding: '7px 10px', borderRadius: 8, border: `1.5px solid ${CB}`,
    background: CL, color: CD, fontSize: '0.84rem', outline: 'none', cursor: 'pointer',
  };

  // col widths: checkbox, article, activité, qté, prix transfert, prix appro, écart
  const colW = [36, '28%', '17%', '8%', '14%', '14%', '13%'] as const;

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
            <div>
              <label style={{ fontSize: '0.7rem', display: 'block', marginBottom: 4, fontWeight: 700, color: C, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Du</label>
              <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }}
                style={{ padding: '7px 10px', borderRadius: 8, border: `1.5px solid ${CB}`, background: CL, color: CD, fontSize: '0.84rem' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.7rem', display: 'block', marginBottom: 4, fontWeight: 700, color: C, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Au</label>
              <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }}
                style={{ padding: '7px 10px', borderRadius: 8, border: `1.5px solid ${CB}`, background: CL, color: CD, fontSize: '0.84rem' }} />
            </div>
            <button onClick={loadTransferts}
              style={{ padding: '8px 14px', borderRadius: 8, border: `1.5px solid ${C}`, color: '#fff', background: C, cursor: 'pointer', fontWeight: 700, fontSize: '0.84rem' }}>
              Filtrer dates
            </button>

            <div style={{ width: 1, background: CB, alignSelf: 'stretch', margin: '0 2px' }} />

            <div>
              <label style={{ fontSize: '0.7rem', display: 'block', marginBottom: 4, fontWeight: 700, color: C, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Catégorie</label>
              <select value={filterCategorie} onChange={e => handleCategorieChange(e.target.value)} style={selectStyle}>
                <option value="">Toutes</option>
                {categorieOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.7rem', display: 'block', marginBottom: 4, fontWeight: 700, color: C, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Article</label>
              <select value={filterArticle} onChange={e => { setFilterArticle(e.target.value); setPage(1); }} style={selectStyle}>
                <option value="">Tous</option>
                {articleOptions.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.7rem', display: 'block', marginBottom: 4, fontWeight: 700, color: C, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Activité</label>
              <select value={filterActivite} onChange={e => { setFilterActivite(e.target.value); setPage(1); }} style={selectStyle}>
                <option value="">Toutes</option>
                {activiteOptions.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            {hasFilters && (
              <button onClick={resetFilters}
                style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                ✕ Réinitialiser
              </button>
            )}
            {selectedIds.size > 0 && (
              <span style={{ fontSize: '0.78rem', color: '#FF6B00', fontWeight: 700, whiteSpace: 'nowrap' }}>
                {selectedIds.size} sélectionnée{selectedIds.size > 1 ? 's' : ''}
              </span>
            )}
            <button onClick={handleExportXls} disabled={exportingXls}
              style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1.5px solid #1D6F42', background: exportingXls ? '#f3f4f6' : '#f0fdf4', color: '#1D6F42', cursor: exportingXls ? 'default' : 'pointer', fontWeight: 700, fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
              <ExcelIcon /> {exportingXls ? 'Export…' : 'Exporter XLS'}
            </button>
          </div>

          {/* KPIs — order: Valeur totale achat | Valeur totale transferts | Écart total */}
          {filtered.length > 0 && (
            <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 160, background: '#fff', borderRadius: 12, border: `1.5px solid ${CB}`, padding: '14px 20px' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Valeur totale achat</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: CD }}>{fmtMoney(totalAchat)}</div>
              </div>
              <div style={{ flex: 1, minWidth: 160, background: '#fff', borderRadius: 12, border: `1.5px solid ${CB}`, padding: '14px 20px' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Valeur totale transferts</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: C }}>{fmtMoney(totalTransferts)}</div>
              </div>
              <div style={{ flex: 1, minWidth: 160, background: '#fff', borderRadius: 12, border: `1.5px solid ${CB}`, padding: '14px 20px' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Écart total</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: totalEcart >= 0 ? '#16a34a' : '#dc2626' }}>
                  {totalEcart >= 0 ? '+' : ''}{fmtMoney(totalEcart)}
                </div>
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
                      <th style={{ padding: '8px 10px', width: 36 }}></th>
                      <th style={{ padding: '11px 14px', textAlign: 'left', fontSize: '0.74rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Article</th>
                      <th style={{ padding: '11px 14px', textAlign: 'left', fontSize: '0.74rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Activité</th>
                      <th style={{ padding: '11px 14px', textAlign: 'right', fontSize: '0.74rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Qté</th>
                      <th style={{ padding: '11px 14px', textAlign: 'right', fontSize: '0.74rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Prix transfert</th>
                      <th style={{ padding: '11px 14px', textAlign: 'right', fontSize: '0.74rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Prix appro</th>
                      <th style={{ padding: '11px 14px', textAlign: 'right', fontSize: '0.74rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Écart</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageData.map((l, idx) => {
                      const prixTransfertTotal = l.prix_unitaire != null ? l.prix_unitaire * l.quantite : null;
                      const prixApproTotal = l.prix_moyen_appro != null ? l.prix_moyen_appro * l.quantite : null;
                      const ecartTotal = prixTransfertTotal != null && prixApproTotal != null
                        ? prixTransfertTotal - prixApproTotal
                        : null;
                      const ecartPct = prixApproTotal != null && prixApproTotal !== 0 && ecartTotal != null
                        ? (ecartTotal / prixApproTotal) * 100
                        : null;
                      const ecartColor = ecartTotal == null ? 'var(--text-muted)' : ecartTotal >= 0 ? '#16a34a' : '#dc2626';
                      const isSel = selectedIds.has(String(l.id));
                      const rowBg = isSel ? '#FF6B00' : (idx % 2 === 0 ? '#fff' : '#fffdf7');

                      return (
                        <tr key={l.id} style={{ borderBottom: `1px solid ${CB}`, background: rowBg, cursor: 'pointer' }} onClick={() => toggleSelect(String(l.id))}>
                          <td style={{ padding: '8px 10px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                            <input type="checkbox" checked={isSel} onChange={() => toggleSelect(String(l.id))}
                              style={{ accentColor: '#FF6B00', width: 15, height: 15, cursor: 'pointer' }} />
                          </td>
                          {/* Article + date merged */}
                          <td style={{ padding: '11px 14px' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.88rem', color: isSel ? '#fff' : CD, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.article_nom}</div>
                            <div style={{ fontSize: '0.72rem', color: isSel ? 'rgba(255,255,255,0.8)' : 'var(--text-muted)', marginTop: 2 }}>
                              {l.unite_nom && <span>{l.unite_nom} · </span>}
                              {fmtDate(l.date_transfert)}
                            </div>
                          </td>
                          <td style={{ padding: '11px 14px', fontSize: '0.84rem', color: isSel ? 'rgba(255,255,255,0.9)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.activite_nom}</td>
                          <td style={{ padding: '11px 14px', fontSize: '0.88rem', textAlign: 'right', fontWeight: 600, color: isSel ? '#fff' : undefined }}>{l.quantite}</td>
                          {/* Prix transfert = total */}
                          <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.88rem', color: isSel ? '#fff' : C }}>{fmtMoney(prixTransfertTotal)}</div>
                            {l.prix_unitaire != null && (
                              <div style={{ fontSize: '0.68rem', color: isSel ? 'rgba(255,255,255,0.75)' : 'var(--text-muted)' }}>{fmtMoney(l.prix_unitaire)}/u</div>
                            )}
                          </td>
                          {/* Prix appro = total */}
                          <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                            <div style={{ fontSize: '0.88rem', color: isSel ? 'rgba(255,255,255,0.9)' : 'var(--text)' }}>{fmtMoney(prixApproTotal)}</div>
                            {l.prix_moyen_appro != null && (
                              <div style={{ fontSize: '0.68rem', color: isSel ? 'rgba(255,255,255,0.75)' : 'var(--text-muted)' }}>{fmtMoney(l.prix_moyen_appro)}/u</div>
                            )}
                          </td>
                          {/* Écart = total */}
                          <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                            {ecartTotal != null ? (
                              <div>
                                <div style={{ fontWeight: 700, fontSize: '0.88rem', color: isSel ? '#fff' : ecartColor }}>
                                  {ecartTotal >= 0 ? '+' : ''}{fmtMoney(ecartTotal)}
                                </div>
                                {ecartPct != null && (
                                  <div style={{ fontSize: '0.68rem', color: isSel ? 'rgba(255,255,255,0.8)' : ecartColor, opacity: 0.85 }}>
                                    {ecartPct >= 0 ? '+' : ''}{ecartPct.toFixed(1)}%
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span style={{ color: isSel ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: CL, borderTop: `2px solid ${CB}` }}>
                      <td style={{ padding: '11px 10px' }}></td>
                      <td colSpan={3} style={{ padding: '11px 14px', fontWeight: 700, fontSize: '0.88rem', color: CD }}>
                        Total ({filtered.length} ligne{filtered.length !== 1 ? 's' : ''})
                      </td>
                      <td style={{ padding: '11px 14px', fontWeight: 800, fontSize: '0.95rem', color: C, textAlign: 'right' }}>{fmtMoney(totalTransferts)}</td>
                      <td style={{ padding: '11px 14px', fontWeight: 800, fontSize: '0.95rem', color: CD, textAlign: 'right' }}>{fmtMoney(totalAchat)}</td>
                      <td style={{ padding: '11px 14px', fontWeight: 800, fontSize: '0.95rem', color: totalEcart >= 0 ? '#16a34a' : '#dc2626', textAlign: 'right' }}>
                        {totalEcart >= 0 ? '+' : ''}{fmtMoney(totalEcart)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 18 }}>
                  <button onClick={() => setPage(1)} disabled={page === 1}
                    style={{ padding: '6px 10px', borderRadius: 7, border: `1.5px solid ${page === 1 ? CB : C}`, background: page === 1 ? '#f9f9f9' : CL, color: page === 1 ? 'var(--text-muted)' : C, cursor: page === 1 ? 'default' : 'pointer', fontWeight: 700, fontSize: '0.82rem' }}>«</button>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    style={{ padding: '6px 10px', borderRadius: 7, border: `1.5px solid ${page === 1 ? CB : C}`, background: page === 1 ? '#f9f9f9' : CL, color: page === 1 ? 'var(--text-muted)' : C, cursor: page === 1 ? 'default' : 'pointer', fontWeight: 700, fontSize: '0.82rem' }}>‹</button>
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
                    style={{ padding: '6px 10px', borderRadius: 7, border: `1.5px solid ${page === totalPages ? CB : C}`, background: page === totalPages ? '#f9f9f9' : CL, color: page === totalPages ? 'var(--text-muted)' : C, cursor: page === totalPages ? 'default' : 'pointer', fontWeight: 700, fontSize: '0.82rem' }}>›</button>
                  <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
                    style={{ padding: '6px 10px', borderRadius: 7, border: `1.5px solid ${page === totalPages ? CB : C}`, background: page === totalPages ? '#f9f9f9' : CL, color: page === totalPages ? 'var(--text-muted)' : C, cursor: page === totalPages ? 'default' : 'pointer', fontWeight: 700, fontSize: '0.82rem' }}>»</button>
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
