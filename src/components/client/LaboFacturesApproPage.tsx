import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../../api/client';

const currentYear = new Date().getFullYear();
const yearStart = `${currentYear}-01-01`;
const yearEnd = `${currentYear}-12-31`;
const PAGE_SIZE = 10;
const BATCH = 200;

const fmtDate = (iso: string | null | undefined) => {
  if (!iso || iso.length < 10) return iso ?? '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

interface Fournisseur { id: number; nom: string }
interface Labo { id: number; nom: string }

interface HistEntry {
  id: number;
  dateAppro: string;
  quantite: number | null;
  prixUnitaire: number | null;
  tauxTva?: number | null;
  prixUnitaireTva?: number | null;
  ingredientNom: string;
  uniteNom: string;
  categorieNom: string;
  fournisseurId?: number | null;
  fournisseurNom: string | null;
  refFacture: string | null;
  typeAppro?: string;
}

interface FactureGroup {
  key: string;
  refFacture: string | null;
  dateAppro: string;
  fournisseurNom: string | null;
  lines: HistEntry[];
  totalHT: number;
  totalTTC: number;
  hasTva: boolean;
}

function groupIntoFactures(entries: HistEntry[]): FactureGroup[] {
  const map = new Map<string, FactureGroup>();

  for (const e of entries) {
    if (e.typeAppro === 'vente' || e.typeAppro === 'annulation_vente') continue;
    if ((e.quantite ?? 0) <= 0) continue;
    const key = `${e.refFacture ?? `__no-ref-${e.id}`}__${e.dateAppro}__${e.fournisseurId ?? ''}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        refFacture: e.refFacture,
        dateAppro: e.dateAppro,
        fournisseurNom: e.fournisseurNom,
        lines: [],
        totalHT: 0,
        totalTTC: 0,
        hasTva: false,
      });
    }
    const group = map.get(key)!;
    group.lines.push(e);
    const ht = (e.quantite ?? 0) * (e.prixUnitaire ?? 0);
    const ttc = (e.quantite ?? 0) * (e.prixUnitaireTva ?? e.prixUnitaire ?? 0);
    group.totalHT += ht;
    group.totalTTC += ttc;
    if (e.tauxTva != null && e.tauxTva > 0) group.hasTva = true;
  }

  return Array.from(map.values()).sort((a, b) => b.dateAppro.localeCompare(a.dateAppro));
}

export default function LaboFacturesApproPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const laboId = searchParams.get('laboId') || '';

  const [allLabos, setAllLabos] = useState<Labo[]>([]);
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [selectedFournisseurId, setSelectedFournisseurId] = useState('');
  const [refFactureFilter, setRefFactureFilter] = useState('');
  const [startDate, setStartDate] = useState(yearStart);
  const [endDate, setEndDate] = useState(yearEnd);

  const [allEntries, setAllEntries] = useState<HistEntry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);

  useEffect(() => {
    api.get('/api/labo').then(({ data }) => setAllLabos(data as Labo[])).catch(() => {});
    if (laboId) {
      api.get(`/api/labo/${laboId}/fournisseurs`).then(({ data }) => setFournisseurs(data as Fournisseur[])).catch(() => {});
    }
  }, [laboId]);

  const latestFilters = useRef({ laboId, startDate, endDate, selectedFournisseurId, refFactureFilter });
  latestFilters.current = { laboId, startDate, endDate, selectedFournisseurId, refFactureFilter };

  const fetchBatch = (offset: number, append: boolean) => {
    const { laboId: lId, startDate: sd, endDate: ed, selectedFournisseurId: fId, refFactureFilter: ref } = latestFilters.current;
    if (!lId) return;
    if (append) setLoadingMore(true); else { setLoading(true); setPage(1); setExpandedKeys(new Set()); }
    const params = new URLSearchParams();
    if (sd) params.set('startDate', sd);
    if (ed) params.set('endDate', ed);
    if (fId) params.set('fournisseurId', fId);
    if (ref.trim()) params.set('refFacture', ref.trim());
    params.set('limit', String(BATCH));
    params.set('offset', String(offset));
    api.get(`/api/labo/${lId}/historique?${params}`)
      .then(({ data }) => {
        const rows = data as HistEntry[];
        if (append) setAllEntries((prev) => [...prev, ...rows]);
        else setAllEntries(rows);
        setHasMore(rows.length === BATCH);
        setNextOffset(offset + rows.length);
      })
      .catch(() => { if (!append) setAllEntries([]); })
      .finally(() => { if (append) setLoadingMore(false); else setLoading(false); });
  };

  const isFirst = useRef(true);
  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; fetchBatch(0, false); return; }
    const timer = setTimeout(() => fetchBatch(0, false), 400);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laboId, startDate, endDate, selectedFournisseurId, refFactureFilter]);

  const factures = groupIntoFactures(allEntries);
  const totalPages = Math.max(1, Math.ceil(factures.length / PAGE_SIZE));
  const pagedFactures = factures.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const expandAll = () => setExpandedKeys(new Set(pagedFactures.map((f) => f.key)));
  const collapseAll = () => setExpandedKeys(new Set());

  if (!laboId) return <div className="page"><p className="text-muted">Labo introuvable.</p></div>;

  return (
    <div className="page">
      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, #3b0764 0%, #7e22ce 55%, #a855f7 100%)',
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(126,34,206,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🧾</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Factures Appro — Labo</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>Consultation des approvisionnements sous forme de factures</p>
        </div>
        {allLabos.length > 1 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {allLabos.map((l) => (
              <button key={l.id}
                onClick={() => navigate(`/client/labo/factures?laboId=${l.id}`)}
                style={{ padding: '5px 14px', borderRadius: 20, border: String(l.id) === laboId ? '2px solid #fff' : '1.5px solid rgba(255,255,255,0.4)', background: String(l.id) === laboId ? '#fff' : 'rgba(255,255,255,0.12)', color: String(l.id) === laboId ? '#7e22ce' : '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}
              >{l.nom}</button>
            ))}
          </div>
        )}
      </div>

      {/* Filters */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '12px 16px', border: '1px solid var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', marginBottom: 24 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end', justifyContent: 'center' }}>
          <div>
            <label style={{ fontSize: '0.62rem', fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>📅 Du</label>
            <input type="date" style={{ padding: '6px 10px', borderRadius: 7, border: '1.5px solid #7c3aed', fontSize: '0.82rem', background: '#faf5ff', fontWeight: 600 }}
              value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: '0.62rem', fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>📅 Au</label>
            <input type="date" style={{ padding: '6px 10px', borderRadius: 7, border: '1.5px solid #7c3aed', fontSize: '0.82rem', background: '#faf5ff', fontWeight: 600 }}
              value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          {fournisseurs.length > 0 && (
            <div>
              <label style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>🚚 Fournisseur</label>
              <select style={{ padding: '6px 10px', borderRadius: 7, border: '1.5px solid #c4b5fd', fontSize: '0.82rem', background: '#faf5ff', minWidth: 130 }}
                value={selectedFournisseurId} onChange={(e) => setSelectedFournisseurId(e.target.value)}>
                <option value="">— Tous —</option>
                {fournisseurs.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
              </select>
            </div>
          )}
          <div>
            <label style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 }}>🧾 Réf. Facture</label>
            <input type="text" style={{ padding: '6px 10px', borderRadius: 7, border: '1.5px solid #c4b5fd', fontSize: '0.82rem', background: '#faf5ff', minWidth: 120 }}
              placeholder="Réf…" value={refFactureFilter} onChange={(e) => setRefFactureFilter(e.target.value)} />
          </div>
          {(selectedFournisseurId || refFactureFilter || startDate !== yearStart || endDate !== yearEnd) && (
            <button onClick={() => { setSelectedFournisseurId(''); setRefFactureFilter(''); setStartDate(yearStart); setEndDate(yearEnd); }}
              style={{ alignSelf: 'flex-end', background: 'transparent', border: '1.5px solid var(--border)', borderRadius: 7, padding: '5px 9px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 700 }}
              title="Réinitialiser">✕</button>
          )}
          {loading && <span style={{ alignSelf: 'flex-end', fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic', paddingBottom: 6 }}>Chargement…</span>}
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <p className="text-muted" style={{ textAlign: 'center', padding: 32 }}>Chargement…</p>
      ) : factures.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🧾</div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>Aucune facture trouvée pour ces critères.</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              {factures.length}{hasMore ? '+' : ''} facture{factures.length > 1 ? 's' : ''}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={expandAll} className="btn btn-ghost btn-sm">Tout ouvrir</button>
              <button onClick={collapseAll} className="btn btn-ghost btn-sm">Tout fermer</button>
            </div>
          </div>

          {pagedFactures.map((f) => {
            const isExpanded = expandedKeys.has(f.key);
            return (
              <div key={f.key} style={{ marginBottom: 12, border: '1.5px solid #c4b5fd', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(124,58,237,0.08)' }}>
                <button onClick={() => toggleExpand(f.key)} style={{ width: '100%', background: 'linear-gradient(90deg, #faf5ff, #ede9fe)', border: 'none', cursor: 'pointer', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '1.1rem' }}>🧾</span>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#4c1d95' }}>
                        {f.refFacture ? `Réf: ${f.refFacture}` : 'Sans référence'}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#7c3aed', marginTop: 2 }}>
                        {fmtDate(f.dateAppro)}
                        {f.fournisseurNom && <> · {f.fournisseurNom}</>}
                        <span style={{ marginLeft: 8, background: '#7c3aed', color: '#fff', borderRadius: 4, padding: '1px 6px', fontSize: '0.65rem' }}>
                          {f.lines.length} article{f.lines.length > 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.68rem', color: '#7c3aed', fontWeight: 600, textTransform: 'uppercase' }}>Total HT</div>
                      <div style={{ fontWeight: 800, color: '#6d28d9', fontSize: '0.92rem' }}>{f.totalHT.toFixed(3)} DT</div>
                    </div>
                    {f.hasTva && (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.68rem', color: '#059669', fontWeight: 600, textTransform: 'uppercase' }}>Total TTC</div>
                        <div style={{ fontWeight: 800, color: '#059669', fontSize: '0.92rem' }}>{f.totalTTC.toFixed(3)} DT</div>
                      </div>
                    )}
                    <span style={{ color: '#7c3aed', fontSize: '1rem' }}>{isExpanded ? '▼' : '▶'}</span>
                  </div>
                </button>

                {isExpanded && (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                      <thead>
                        <tr style={{ background: '#faf5ff', borderBottom: '2px solid #c4b5fd' }}>
                          {(['Article', 'Catégorie', 'Qté', 'Prix HT/u', f.hasTva ? 'TVA %' : null, f.hasTva ? 'Prix TTC/u' : null, 'Total HT', f.hasTva ? 'Total TTC' : null] as (string | null)[])
                            .filter(Boolean)
                            .map((h) => (
                              <th key={h!} style={{ padding: '8px 12px', fontWeight: 700, textAlign: h === 'Article' || h === 'Catégorie' ? 'left' : 'right', color: '#6d28d9', textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.05em' }}>
                                {h}
                              </th>
                            ))}
                        </tr>
                      </thead>
                      <tbody>
                        {f.lines.map((l, i) => {
                          const ht = (l.quantite ?? 0) * (l.prixUnitaire ?? 0);
                          const ttc = (l.quantite ?? 0) * (l.prixUnitaireTva ?? l.prixUnitaire ?? 0);
                          return (
                            <tr key={l.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? '#fff' : '#fdfaff' }}>
                              <td style={{ padding: '8px 12px' }}>
                                <div style={{ fontWeight: 600 }}>{l.ingredientNom}</div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{l.uniteNom}</div>
                              </td>
                              <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '0.78rem' }}>{l.categorieNom}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#0f766e' }}>{l.quantite ?? '—'}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'right' }}>{l.prixUnitaire != null ? l.prixUnitaire.toFixed(3) : '—'}</td>
                              {f.hasTva && <td style={{ padding: '8px 12px', textAlign: 'right', color: '#0369a1' }}>{l.tauxTva != null ? `${l.tauxTva}%` : '—'}</td>}
                              {f.hasTva && <td style={{ padding: '8px 12px', textAlign: 'right' }}>{l.prixUnitaireTva != null ? l.prixUnitaireTva.toFixed(3) : '—'}</td>}
                              <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>{ht.toFixed(3)}</td>
                              {f.hasTva && <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#059669' }}>{ttc.toFixed(3)}</td>}
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: '#faf5ff', borderTop: '2px solid #c4b5fd' }}>
                          <td colSpan={f.hasTva ? 6 : 4} style={{ padding: '8px 12px', fontWeight: 800, fontSize: '0.72rem', color: '#6d28d9', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Sous-total — {f.lines.length} article{f.lines.length > 1 ? 's' : ''}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 900, color: '#6d28d9', fontSize: '0.88rem' }}>{f.totalHT.toFixed(3)} DT</td>
                          {f.hasTva && <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 900, color: '#059669', fontSize: '0.88rem' }}>{f.totalTTC.toFixed(3)} DT</td>}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            );
          })}

          {/* Pagination */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 4px', marginTop: 4 }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {factures.length}{hasMore ? '+' : ''} facture{factures.length > 1 ? 's' : ''} · page {page}/{totalPages}
            </span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {totalPages > 1 && (
                <>
                  <button className="btn btn-ghost btn-sm" disabled={page === 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))} style={{ padding: '3px 10px', fontWeight: 700 }}>‹</button>
                  <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.82rem' }}>{page} / {totalPages}</span>
                  <button className="btn btn-ghost btn-sm" disabled={page === totalPages && !hasMore}
                    onClick={() => {
                      if (page < totalPages) setPage((p) => p + 1);
                      else if (hasMore) fetchBatch(nextOffset, true);
                    }} style={{ padding: '3px 10px', fontWeight: 700 }}>›</button>
                </>
              )}
              {hasMore && page === totalPages && !loadingMore && factures.length > 0 && (
                <button onClick={() => fetchBatch(nextOffset, true)}
                  className="btn btn-ghost btn-sm" style={{ padding: '3px 12px', fontWeight: 700, color: '#7c3aed' }}>
                  Charger plus
                </button>
              )}
              {loadingMore && <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Chargement…</span>}
            </div>
          </div>

          {/* Grand total (all loaded) */}
          {factures.length > 1 && (
            <div style={{ background: 'linear-gradient(90deg, #6d28d9, #7c3aed)', borderRadius: 10, padding: '14px 20px', display: 'flex', justifyContent: 'flex-end', gap: 24, flexWrap: 'wrap', marginTop: 8 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.7)', fontWeight: 600, textTransform: 'uppercase' }}>Total général HT</div>
                <div style={{ fontWeight: 900, color: '#fff', fontSize: '1rem' }}>
                  {factures.reduce((s, f) => s + f.totalHT, 0).toFixed(3)} DT
                </div>
              </div>
              {factures.some((f) => f.hasTva) && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.7)', fontWeight: 600, textTransform: 'uppercase' }}>Total général TTC</div>
                  <div style={{ fontWeight: 900, color: '#86efac', fontSize: '1rem' }}>
                    {factures.reduce((s, f) => s + f.totalTTC, 0).toFixed(3)} DT
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
