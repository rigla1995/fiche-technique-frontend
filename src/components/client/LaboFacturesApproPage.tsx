import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../../api/client';
import HelpButton from '../common/HelpButton';
import HistoryFilterBar, { FilterField, FilterInput, FilterSelect } from '../common/HistoryFilterBar';
import GuideButton from './GuideButton';

const currentYear = new Date().getFullYear();
const yearStart = `${currentYear}-01-01`;
const yearEnd = `${currentYear}-12-31`;
const PAGE_SIZE = 10;

const fmtDate = (iso: string | null | undefined) => {
  if (!iso || iso.length < 10) return iso ?? '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

interface Fournisseur { id: number; nom: string }
interface Labo { id: number; nom: string }
interface Activite { id: number; nom: string }

interface FactureRow {
  id: number;
  refFacture: string | null;
  dateFacture: string;
  fournisseurId: number | null;
  fournisseurNom: string | null;
  activiteId: number | null;
  activiteNom: string | null;
  laboId: number | null;
  laboNom: string | null;
  typeSource: string;
  montantHT: number;
  montantTva: number;
  montantTTC: number;
}

interface LigneFact {
  id: number;
  dateAppro: string;
  quantite: number | null;
  prixUnitaire: number | null;
  tauxTva: number | null;
  prixUnitaireTva: number | null;
  typeAppro: string;
  ingredientId: number;
  ingredientNom: string;
  uniteNom: string;
  categorieNom: string;
  fournisseurId: number | null;
  fournisseurNom: string | null;
  activiteId: number | null;
  activiteNom: string | null;
}

export default function LaboFacturesApproPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const laboId = searchParams.get('laboId') || '';

  const [allLabos, setAllLabos] = useState<Labo[]>([]);
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [activites, setActivites] = useState<Activite[]>([]);
  const [selectedFournisseurId, setSelectedFournisseurId] = useState('');
  const [selectedActiviteId, setSelectedActiviteId] = useState('');
  const [refFactureFilter, setRefFactureFilter] = useState('');
  const [startDate, setStartDate] = useState(yearStart);
  const [endDate, setEndDate] = useState(yearEnd);

  const [factures, setFactures] = useState<FactureRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [lignesMap, setLignesMap] = useState<Record<number, LigneFact[]>>({});
  const [loadingLignes, setLoadingLignes] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(1);

  useEffect(() => {
    api.get('/api/labo').then(({ data }) => setAllLabos(data as Labo[])).catch(() => {});
    if (laboId) {
      api.get(`/api/labo/${laboId}/fournisseurs`).then(({ data }) => setFournisseurs(data as Fournisseur[])).catch(() => {});
      api.get(`/api/labo/${laboId}`).then(({ data }) => setActivites(((data as any).activites ?? []) as Activite[])).catch(() => {});
    }
  }, [laboId]);

  const latestFilters = useRef({ laboId, startDate, endDate, selectedFournisseurId, selectedActiviteId, refFactureFilter });
  latestFilters.current = { laboId, startDate, endDate, selectedFournisseurId, selectedActiviteId, refFactureFilter };

  const fetchBatch = (offset: number, append: boolean) => {
    const { laboId: lId, startDate: sd, endDate: ed, selectedFournisseurId: fId, selectedActiviteId: aId, refFactureFilter: ref } = latestFilters.current;
    if (!lId) return;
    if (append) setLoadingMore(true); else { setLoading(true); setPage(1); setExpandedIds(new Set()); setLignesMap({}); }
    const params = new URLSearchParams();
    params.set('laboId', lId);
    if (sd) params.set('startDate', sd);
    if (ed) params.set('endDate', ed);
    if (fId) params.set('fournisseurId', fId);
    if (aId) params.set('activiteId', aId);
    if (ref.trim()) params.set('ref', ref.trim());
    params.set('limit', '50');
    params.set('offset', String(offset));
    api.get(`/api/factures?${params}`)
      .then(({ data }) => {
        const rows = data as FactureRow[];
        if (append) setFactures((prev) => [...prev, ...rows]);
        else setFactures(rows);
        setHasMore(rows.length === 50);
        setNextOffset(offset + rows.length);
      })
      .catch(() => { if (!append) setFactures([]); })
      .finally(() => { if (append) setLoadingMore(false); else setLoading(false); });
  };

  const isFirst = useRef(true);
  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; fetchBatch(0, false); return; }
    const timer = setTimeout(() => fetchBatch(0, false), 400);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laboId, startDate, endDate, selectedFournisseurId, selectedActiviteId, refFactureFilter]);

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        if (!lignesMap[id]) {
          setLoadingLignes((pl) => new Set(pl).add(id));
          api.get(`/api/factures/${id}/lignes`)
            .then(({ data }) => setLignesMap((pm) => ({ ...pm, [id]: data as LigneFact[] })))
            .catch(() => setLignesMap((pm) => ({ ...pm, [id]: [] })))
            .finally(() => setLoadingLignes((pl) => { const s = new Set(pl); s.delete(id); return s; }));
        }
      }
      return next;
    });
  };

  // Facture PDF (charte des factures acheteurs : émetteur = fournisseur)
  const ouvrirPdf = async (id: number) => {
    try {
      const res = await api.get(`/api/factures/${id}/pdf`, { responseType: 'blob' });
      window.open(URL.createObjectURL(res.data), '_blank');
    } catch { /* facture indisponible : rien à ouvrir */ }
  };

  const totalPages = Math.max(1, Math.ceil(factures.length / PAGE_SIZE));
  const pagedFactures = factures.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const expandAll = () => {
    const ids = pagedFactures.map((f) => f.id);
    setExpandedIds(new Set(ids));
    ids.forEach((id) => {
      if (!lignesMap[id]) {
        setLoadingLignes((pl) => new Set(pl).add(id));
        api.get(`/api/factures/${id}/lignes`)
          .then(({ data }) => setLignesMap((pm) => ({ ...pm, [id]: data as LigneFact[] })))
          .catch(() => setLignesMap((pm) => ({ ...pm, [id]: [] })))
          .finally(() => setLoadingLignes((pl) => { const s = new Set(pl); s.delete(id); return s; }));
      }
    });
  };
  const collapseAll = () => setExpandedIds(new Set());

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
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Factures Appro — Labo <HelpButton section="factures" variant="solid" size={18} tip="Aide" /></h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>Consultation des approvisionnements sous forme de factures</p>
        </div>
        <GuideButton section="factures" />
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

      {/* Barre de filtres (composant partagé, mode direct) */}
      <HistoryFilterBar
        accent="#7c3aed" accentDark="#6d28d9"
        subtitle={loading ? 'Chargement…' : undefined}
        onReset={() => { setSelectedFournisseurId(''); setSelectedActiviteId(''); setRefFactureFilter(''); setStartDate(yearStart); setEndDate(yearEnd); }}
        showReset={!!(selectedFournisseurId || selectedActiviteId || refFactureFilter || startDate !== yearStart || endDate !== yearEnd)}
      >
        <FilterField label="📅 Du"><FilterInput type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></FilterField>
        <FilterField label="📅 Au"><FilterInput type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></FilterField>
        {activites.length > 0 && (
          <FilterField label="🏪 Activité">
            <FilterSelect value={selectedActiviteId} onChange={(e) => setSelectedActiviteId(e.target.value)}>
              <option value="">— Toutes —</option>
              {activites.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
            </FilterSelect>
          </FilterField>
        )}
        {fournisseurs.length > 0 && (
          <FilterField label="🚚 Fournisseur">
            <FilterSelect value={selectedFournisseurId} onChange={(e) => setSelectedFournisseurId(e.target.value)}>
              <option value="">— Tous —</option>
              {fournisseurs.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
            </FilterSelect>
          </FilterField>
        )}
        <FilterField label="🧾 Réf. Facture">
          <FilterInput type="text" placeholder="Réf…" value={refFactureFilter} onChange={(e) => setRefFactureFilter(e.target.value)} />
        </FilterField>
      </HistoryFilterBar>

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
            const isExpanded = expandedIds.has(f.id);
            const lignes = lignesMap[f.id] ?? [];
            const hasTva = f.montantTva > 0;
            return (
              <div key={f.id} style={{ marginBottom: 12, border: '1.5px solid #c4b5fd', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(124,58,237,0.08)' }}>
                <button onClick={() => toggleExpand(f.id)} style={{ width: '100%', background: 'linear-gradient(90deg, #faf5ff, #ede9fe)', border: 'none', cursor: 'pointer', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '1.1rem' }}>🧾</span>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#4c1d95' }}>
                        {f.fournisseurNom ?? 'Sans fournisseur'}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#7c3aed', marginTop: 2 }}>
                        {f.refFacture ? `Réf: ${f.refFacture}` : 'Sans réf.'} · {fmtDate(f.dateFacture)}
                        {f.activiteNom && <> · 🏪 <strong>{f.activiteNom}</strong></>}
                        <span style={{ marginLeft: 8, background: f.typeSource === 'transfert' ? '#6d28d9' : '#0369a1', color: '#fff', borderRadius: 4, padding: '1px 6px', fontSize: '0.65rem', fontWeight: 700 }}>
                          {f.typeSource === 'transfert' ? '↗ Transfert' : 'Manuel'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.68rem', color: '#7c3aed', fontWeight: 600, textTransform: 'uppercase' }}>Total HT</div>
                      <div style={{ fontWeight: 800, color: '#6d28d9', fontSize: '0.92rem' }}>{f.montantHT.toFixed(3)} DT</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.68rem', color: '#059669', fontWeight: 600, textTransform: 'uppercase' }}>Total TTC</div>
                      <div style={{ fontWeight: 800, color: '#059669', fontSize: '0.92rem' }}>{f.montantTTC.toFixed(3)} DT</div>
                    </div>
                    {/* span cliquable (l'en-tête entier est déjà un <button>) */}
                    <span role="button" tabIndex={0} title="Ouvrir la facture PDF"
                      onClick={(e) => { e.stopPropagation(); ouvrirPdf(f.id); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); ouvrirPdf(f.id); } }}
                      style={{ background: '#fff', border: '1px solid #c4b5fd', color: '#6d28d9', borderRadius: 8, padding: '5px 10px', fontWeight: 700, fontSize: '0.76rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      📄 PDF
                    </span>
                    <span style={{ color: '#7c3aed', fontSize: '1rem' }}>{isExpanded ? '▼' : '▶'}</span>
                  </div>
                </button>

                {isExpanded && (
                  <div style={{ overflowX: 'auto' }}>
                    {loadingLignes.has(f.id) ? (
                      <p style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '0.82rem', fontStyle: 'italic' }}>Chargement des lignes…</p>
                    ) : lignes.length === 0 ? (
                      <p style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>Aucune ligne trouvée.</p>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                        <thead>
                          <tr style={{ background: '#faf5ff', borderBottom: '2px solid #c4b5fd' }}>
                            {(['Article', 'Catégorie', 'Qté', 'Prix HT/u', hasTva ? 'TVA %' : null, hasTva ? 'Prix TTC/u' : null, 'Total HT', hasTva ? 'Total TTC' : null] as (string | null)[])
                              .filter(Boolean)
                              .map((h) => (
                                <th key={h!} style={{ padding: '8px 12px', fontWeight: 700, textAlign: h === 'Article' || h === 'Catégorie' ? 'left' : 'right', color: '#6d28d9', textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: '0.05em' }}>
                                  {h}
                                </th>
                              ))}
                          </tr>
                        </thead>
                        <tbody>
                          {lignes.map((l, i) => {
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
                                {hasTva && <td style={{ padding: '8px 12px', textAlign: 'right', color: '#0369a1' }}>{l.tauxTva != null ? `${l.tauxTva}%` : '—'}</td>}
                                {hasTva && <td style={{ padding: '8px 12px', textAlign: 'right' }}>{l.prixUnitaireTva != null ? l.prixUnitaireTva.toFixed(3) : '—'}</td>}
                                <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>{ht.toFixed(3)}</td>
                                {hasTva && <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#059669' }}>{ttc.toFixed(3)}</td>}
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr style={{ background: '#faf5ff', borderTop: '2px solid #c4b5fd' }}>
                            <td colSpan={hasTva ? 6 : 4} style={{ padding: '8px 12px', fontWeight: 800, fontSize: '0.72rem', color: '#6d28d9', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              Sous-total — {lignes.length} article{lignes.length > 1 ? 's' : ''}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 900, color: '#6d28d9', fontSize: '0.88rem' }}>{f.montantHT.toFixed(3)} DT</td>
                            {hasTva && <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 900, color: '#059669', fontSize: '0.88rem' }}>{f.montantTTC.toFixed(3)} DT</td>}
                          </tr>
                        </tfoot>
                      </table>
                    )}
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
                  {factures.reduce((s, f) => s + f.montantHT, 0).toFixed(3)} DT
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.7)', fontWeight: 600, textTransform: 'uppercase' }}>Total général TTC</div>
                <div style={{ fontWeight: 900, color: '#86efac', fontSize: '1rem' }}>
                  {factures.reduce((s, f) => s + f.montantTTC, 0).toFixed(3)} DT
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
