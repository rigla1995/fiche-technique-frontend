import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import HelpButton from '../common/HelpButton';
import HistoryFilterBar, { FilterField, FilterInput, FilterSelect } from '../common/HistoryFilterBar';
import type { Destination, Transfert } from '../../types';
import { useVocabulaire } from '../../hooks/useVocabulaire';
import type { Vocab } from '../../vocab/vocab';

const currentYear = new Date().getFullYear();
const yearStart = `${currentYear}-01-01`;
const yearEnd = `${currentYear}-12-31`;
const PAGE_SIZE = 10;

const fmtDate = (iso: string | null | undefined) => {
  if (!iso || iso.length < 10) return iso ?? '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

type TransferEntry = Transfert;

interface Activite { id: number; nom: string }

// Destination affichée : destNom (lot 1b) avec repli activiteNom (flux historique).
const destNomOf = (r: Pick<Transfert, 'activiteNom' | 'destNom'>): string => r.destNom ?? r.activiteNom ?? '—';
const isLaboDest = (r: Pick<Transfert, 'destType' | 'laboDestId'>): boolean => r.destType === 'labo' || (r.destType == null && r.laboDestId != null);
const destCell = (voc: Vocab, r: Transfert): string => (isLaboDest(r) ? `${voc.icon('labo')} ${destNomOf(r)}` : destNomOf(r));
// Destinations = GET /api/labo/:id.destinations ; repli sur `activites` (rendu identique à avant le lot 1b).
const destinationsOf = (labo: { activites?: Activite[]; destinations?: Destination[] } | null): Destination[] => {
  if (!labo) return [];
  if (Array.isArray(labo.destinations)) return labo.destinations;
  return (labo.activites ?? []).map((a) => ({ destKey: `a-${a.id}`, type: 'activite' as const, id: a.id, nom: a.nom }));
};
// Filtre serveur : 'a-<id>' → activiteId, 'l-<id>' → laboDestId.
const applyDestParam = (params: URLSearchParams, destKey: string) => {
  if (!destKey) return;
  const id = destKey.slice(2);
  if (destKey.startsWith('l-')) params.set('laboDestId', id);
  else params.set('activiteId', id);
};
const apiMsg = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

export default function TransferHistoriquePage() {
  const { t } = useTranslation();
  const voc = useVocabulaire();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const laboId = searchParams.get('laboId') || '';

  const [allLabos, setAllLabos] = useState<{ id: number; nom: string }[]>([]);
  const [labo, setLabo] = useState<{ nom: string; activites: Activite[]; destinations?: Destination[] } | null>(null);
  const [results, setResults] = useState<TransferEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [exporting, setExporting] = useState(false);

  // Server-side filters
  const [startDate, setStartDate] = useState(yearStart);
  const [endDate, setEndDate] = useState(yearEnd);
  const [filterDestKey, setFilterDestKey] = useState('');

  // Client-side filters
  const [filterCategorie, setFilterCategorie] = useState('');

  // Detail popup
  const [detailPopup, setDetailPopup] = useState<TransferEntry | null>(null);

  // Edit modal
  const [editTarget, setEditTarget] = useState<TransferEntry | null>(null);
  const [editQty, setEditQty] = useState('');
  const [editPrix, setEditPrix] = useState<number | null>(null);
  // Référence de prix : PMP HT à la date du transfert (lot 1b) ; repli « dernier appro » (ancienne réponse).
  const [editPrixSource, setEditPrixSource] = useState<'pmp' | 'dernier'>('dernier');
  const [editPrixLoading, setEditPrixLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState<TransferEntry | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    api.get('/api/labo').then(({ data }) => setAllLabos(data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!laboId) return;
    api.get(`/api/labo/${laboId}`).then(({ data }) => setLabo(data)).catch(() => {});
  }, [laboId]);

  const buildParams = () => {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    applyDestParam(params, filterDestKey);
    return params;
  };

  const exportExcel = async () => {
    if (!laboId) return;
    setExporting(true);
    try {
      const params = buildParams();
      if (selectedIds.size > 0) params.set('selectedIds', [...selectedIds].join(','));
      const { data } = await api.get(`/api/labo/${laboId}/transfers/export-excel?${params}`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `historique-transferts-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
    setExporting(false);
  };

  const toggleSelect = (id: number) => setSelectedIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const fetchResults = useCallback(async () => {
    if (!laboId) return;
    setLoading(true);
    setSearched(true);
    setPage(1);
    setSelectedIds(new Set());
    setFilterCategorie('');
    try {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      applyDestParam(params, filterDestKey);
      const { data } = await api.get(`/api/labo/${laboId}/transfers?${params}`);
      setResults(data as TransferEntry[]);
    } catch {
      setResults([]);
    }
    setLoading(false);
  }, [laboId, startDate, endDate, filterDestKey]);

  const openEdit = async (r: TransferEntry) => {
    setEditTarget(r);
    setEditQty(String(r.quantite));
    setEditPrix(null);
    setEditError('');
    setEditPrixSource('dernier');
    setEditPrixLoading(true);
    try {
      const { data } = await api.get(`/api/labo/${laboId}/transfers/${r.id}/prix`);
      const d = data as { pmpHT?: number | null; dernierAchatHT?: number | null; prixUnitaire?: number | null };
      if (d.pmpHT != null) { setEditPrix(d.pmpHT); setEditPrixSource('pmp'); }
      else setEditPrix(d.prixUnitaire ?? d.dernierAchatHT ?? null);
    } catch { /* ignore */ }
    setEditPrixLoading(false);
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    const qty = parseFloat(editQty);
    if (!qty || qty <= 0) return;
    setEditSaving(true);
    setEditError('');
    try {
      await api.patch(`/api/labo/${laboId}/transfers/${editTarget.id}`, { quantite: qty });
      setResults((prev) => prev.map((r) => r.id === editTarget.id ? { ...r, quantite: qty } : r));
      setEditTarget(null);
    } catch (e: unknown) {
      setEditError(apiMsg(e, 'Modification impossible'));
    }
    setEditSaving(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteSaving(true);
    setDeleteError('');
    try {
      await api.delete(`/api/labo/${laboId}/transfers/${deleteTarget.id}`);
      setResults((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(deleteTarget.id); return n; });
      setDeleteTarget(null);
    } catch (e: unknown) {
      setDeleteError(apiMsg(e, 'Suppression impossible'));
    }
    setDeleteSaving(false);
  };

  const destinations: Destination[] = destinationsOf(labo);
  // Libellés inchangés tant que toutes les destinations sont des activités (comptes restauration).
  const hasLaboDest = destinations.some((d) => d.type === 'labo') || results.some(isLaboDest);
  const colDestLabel = hasLaboDest ? 'Destination' : t('client.labo.col_activite');
  const rowDestLabel = (r: Transfert) => (isLaboDest(r) ? `${voc.Court('labo')} destinataire` : voc.Nom('activite'));

  // Client-side filtering
  const allCategories = Array.from(new Set(results.map((r) => r.categorieNom))).sort();
  const filteredResults = results.filter((r) => !filterCategorie || r.categorieNom === filterCategorie);

  const totalPages = Math.max(1, Math.ceil(filteredResults.length / PAGE_SIZE));
  const pagedResults = filteredResults.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totalHT = filteredResults.reduce((s, r) => s + r.quantite * (r.prixUnitaire ?? 0), 0);
  const totalTTC = filteredResults.reduce((s, r) => s + r.quantite * (r.prixUnitaireTva ?? 0), 0);

  if (!laboId) return <div className="page"><p className="text-muted">{voc.Nom('labo')} introuvable.</p></div>;

  return (
    <div className="page">
      {/* Hero header */}
      <div style={{
        background: 'linear-gradient(135deg, #3b0764 0%, #7e22ce 55%, #a855f7 100%)',
        borderRadius: 18, padding: '24px 28px', marginBottom: 16,
        boxShadow: '0 8px 32px rgba(126,34,206,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>📋</div>
            <div>
              <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>
                Historique {voc.Court('transfert')}{labo ? ` — ${labo.nom}` : ''}
              <HelpButton section="transferts" variant="solid" size={18} tip="Aide" /></h1>
              <p style={{ color: 'rgba(255,255,255,0.72)', fontSize: '0.82rem', margin: '4px 0 0' }}>
                {hasLaboDest ? `Consultez et exportez l'historique ${voc.du('transfert', true)} vers ${voc.le('activite', true)} et ${voc.pl('labo')} ${voc.acc('labo', 'rattachés', 'rattachées')}` : `Consultez et exportez l'historique ${voc.du('transfert', true)} vers ${voc.le('activite', true)}`}
              </p>
            </div>
          </div>
        </div>
        <Link to={`/client/labo/transfer?laboId=${laboId}`}
          style={{ background: 'linear-gradient(135deg, #7e22ce 0%, #a855f7 100%)', boxShadow: '0 4px 14px rgba(126,34,206,0.35)', borderRadius: 10, border: 'none', color: '#fff', fontWeight: 800, padding: '10px 24px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          🔄 {t('client.labo.btn_transfer')}
        </Link>
      </div>

      {/* Labo selector */}
      {allLabos.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, padding: '10px 14px', background: 'var(--card-bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
          {allLabos.map((l) => (
            <button key={l.id} onClick={() => navigate(`/client/labo/historique-transferts?laboId=${l.id}`)}
              style={{ padding: '4px 14px', borderRadius: 20, cursor: 'pointer', fontSize: '0.82rem', border: laboId === String(l.id) ? '1.5px solid #7e22ce' : '1.5px solid var(--border)', background: laboId === String(l.id) ? '#7e22ce' : 'var(--bg)', color: laboId === String(l.id) ? '#fff' : 'var(--text)', fontWeight: laboId === String(l.id) ? 700 : 400 }}>
              {voc.icon('labo')} {l.nom}
            </button>
          ))}
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', alignSelf: 'center', marginLeft: 4 }}>← sélectionner {voc.le('labo')}</span>
        </div>
      )}

      {/* Barre de filtres (composant partagé) */}
      <HistoryFilterBar
        accent="#7e22ce" accentDark="#6d28d9"
        onSearch={fetchResults} searching={loading}
        onReset={() => { setStartDate(yearStart); setEndDate(yearEnd); setFilterDestKey(''); setFilterCategorie(''); setPage(1); }}
        showReset={!!(startDate !== yearStart || endDate !== yearEnd || filterDestKey || filterCategorie)}
        onExportExcel={exportExcel} excelDisabled={exporting || !searched || results.length === 0} excelLabel={`Exporter${selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}`}
      >
        <FilterField label="📅 Du"><FilterInput type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></FilterField>
        <FilterField label="📅 Au"><FilterInput type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></FilterField>
        {destinations.length > 0 && (
          <FilterField label={hasLaboDest ? '🎯 Destination' : `${voc.icon('activite')} ${t('client.labo.filter_activite')}`}>
            <FilterSelect value={filterDestKey} onChange={(e) => setFilterDestKey(e.target.value)}>
              <option value="">{hasLaboDest ? 'Toutes les destinations' : t('client.labo.all_activites')}</option>
              {destinations.map((d) => <option key={d.destKey} value={d.destKey}>{d.type === 'labo' ? `${voc.icon('labo')} ${d.nom}` : d.nom}</option>)}
            </FilterSelect>
          </FilterField>
        )}
        <FilterField label="🏷️ Catégorie">
          <FilterSelect value={filterCategorie} onChange={(e) => { setFilterCategorie(e.target.value); setPage(1); }}>
            <option value="">{t('client.catalogue_franchise.all_categories')}</option>
            {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
          </FilterSelect>
        </FilterField>
      </HistoryFilterBar>

      {/* Results */}
      {!searched ? null : loading ? (
        <p className="text-muted">{t('common.loading')}</p>
      ) : results.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📦</div>
          <p style={{ fontSize: '0.95rem', fontWeight: 500 }}>{t('client.historique_appro.no_results')}</p>
        </div>
      ) : (
        <>
          {filteredResults.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 24px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>🔍</div>
              <p style={{ fontSize: '0.9rem', fontWeight: 500 }}>{t('common.no_result')}</p>
            </div>
          ) : (
            <>
            {selectedIds.size > 0 && (
              <div style={{ marginBottom: 8, fontSize: '0.82rem', color: '#7e22ce', fontWeight: 700 }}>
                {selectedIds.size} {voc.acc('transfert', 'sélectionné', 'sélectionnée', selectedIds.size)}
              </div>
            )}
            <div className="card" style={{ overflowX: 'auto' }}>
              <table className="table" style={{ tableLayout: 'fixed', width: '100%', minWidth: 860 }}>
                <colgroup>
                  <col style={{ width: '28px' }} />
                  <col style={{ width: '175px' }} />
                  <col style={{ width: '95px' }} />
                  <col style={{ width: '115px' }} />
                  <col style={{ width: '80px' }} />
                  <col style={{ width: '88px' }} />
                  <col style={{ width: '52px' }} />
                  <col style={{ width: '88px' }} />
                  <col style={{ width: '78px' }} />
                  <col style={{ width: '62px' }} />
                </colgroup>
                <thead>
                  <tr style={{ background: 'linear-gradient(135deg, #3b0764, #7e22ce)' }}>
                    <th style={{ width: 28, padding: '10px 4px', color: '#fff', background: 'transparent', borderBottom: 'none' }} />
                    {([voc.Nom('ingredient'), 'Date', colDestLabel] as const).map((label) => (
                      <th key={label} style={{ fontWeight: 800, fontSize: '0.75rem', letterSpacing: '0.04em', textTransform: 'uppercase', padding: '10px 10px', color: '#fff', background: 'transparent', borderBottom: 'none' }}>{label}</th>
                    ))}
                    {([t('client.historique_appro.col_qty'), 'Prix U. HT', 'TVA %', 'Prix U. TTC'] as const).map((label) => (
                      <th key={label} style={{ textAlign: 'right', fontWeight: 800, fontSize: '0.75rem', letterSpacing: '0.04em', textTransform: 'uppercase', padding: '10px 10px', color: '#fff', background: 'transparent', borderBottom: 'none' }}>{label}</th>
                    ))}
                    <th style={{ fontWeight: 800, fontSize: '0.75rem', letterSpacing: '0.04em', textTransform: 'uppercase', padding: '10px 10px', color: '#fff', background: 'transparent', borderBottom: 'none' }}>Créé par</th>
                    <th style={{ padding: '10px 6px', color: '#fff', background: 'transparent', borderBottom: 'none' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {pagedResults.map((r) => {
                    const isSelected = selectedIds.has(r.id);
                    return (
                    <tr key={r.id} style={{ background: isSelected ? '#f5f3ff' : undefined, cursor: 'pointer' }} onClick={() => toggleSelect(r.id)}>
                      <td style={{ textAlign: 'center', padding: '8px 4px' }} onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(r.id)} style={{ cursor: 'pointer', accentColor: '#7e22ce' }} />
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.86rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.ingredientNom}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.uniteNom} · {r.categorieNom}</div>
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{ background: '#faf5ff', border: '1px solid #d8b4fe', borderRadius: 6, padding: '2px 8px', fontWeight: 700, fontSize: '0.8rem', color: '#7e22ce', whiteSpace: 'nowrap' }}>
                          {fmtDate(r.dateTransfert)}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600, padding: '8px 10px', fontSize: '0.86rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={isLaboDest(r) ? `Cession interne vers ${voc.un('labo')} ${voc.acc('labo', 'rattaché', 'rattachée')}` : undefined}>{destCell(voc, r)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: '#10b981', padding: '8px 10px', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                        {r.quantite % 1 === 0 ? r.quantite.toFixed(0) : r.quantite}
                      </td>
                      <td style={{ textAlign: 'right', padding: '8px 10px', fontSize: '0.85rem', color: '#374151', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {r.prixUnitaire != null ? `${r.prixUnitaire.toFixed(3)} DT` : '—'}
                      </td>
                      <td style={{ textAlign: 'right', padding: '8px 10px', fontSize: '0.82rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
                        {r.tauxTva != null ? `${r.tauxTva}%` : '—'}
                      </td>
                      <td style={{ textAlign: 'right', padding: '8px 10px', fontSize: '0.85rem', color: '#059669', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {r.prixUnitaireTva != null ? `${r.prixUnitaireTva.toFixed(3)} DT` : '—'}
                      </td>
                      <td style={{ fontSize: '0.73rem', color: r.createdByNom ? '#7c3aed' : 'var(--text-muted)', fontWeight: r.createdByNom ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '8px 10px' }}>
                        {r.createdByNom ? `👤 ${r.createdByNom}` : '—'}
                      </td>
                      <td style={{ textAlign: 'center', padding: '8px 6px' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'center', alignItems: 'center' }}>
                          {r.note && (
                            <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.76rem', padding: '2px 6px', borderRadius: 20, border: '1px solid #d8b4fe', color: '#7e22ce' }} onClick={() => setDetailPopup(r)}>📝</button>
                          )}
                          <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.76rem', padding: '2px 6px', borderRadius: 20, border: '1px solid #bfdbfe', color: '#1d4ed8' }} onClick={() => openEdit(r)}>✏️</button>
                          <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.76rem', padding: '2px 6px', borderRadius: 20, border: '1px solid #fecaca', color: '#dc2626' }} onClick={() => setDeleteTarget(r)}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#f5f3ff', borderTop: '2px solid #7e22ce' }}>
                    <td colSpan={4} style={{ padding: '9px 10px', fontSize: '0.76rem', fontWeight: 800, color: '#3b0764', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Total — {voc.n('transfert', filteredResults.length)}
                    </td>
                    <td></td>
                    <td style={{ textAlign: 'right', padding: '9px 10px', fontWeight: 800, color: '#1d4ed8', fontSize: '0.84rem', whiteSpace: 'nowrap' }}>
                      {totalHT.toFixed(3)} DT
                    </td>
                    <td></td>
                    <td style={{ textAlign: 'right', padding: '9px 10px', fontWeight: 900, color: '#059669', fontSize: '0.86rem', whiteSpace: 'nowrap' }}>
                      {totalTTC.toFixed(3)} DT
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
              {/* Pagination */}
              <div style={{ padding: '8px 14px', fontSize: '0.78rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>{voc.n('transfert', filteredResults.length)}</span>
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
        </>
      )}

      {/* Edit modal */}
      {editTarget && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ background: 'linear-gradient(135deg, #1e3a8a, #2563eb)', color: '#fff' }}>
              <h2 style={{ color: '#fff', margin: 0 }}>✏️ Modifier {voc.le('transfert')}</h2>
              <button className="modal-close" style={{ color: '#fff' }} onClick={() => setEditTarget(null)}>✕</button>
            </div>
            <div className="modal-body">
              <table style={{ width: '100%', fontSize: '0.9rem', borderCollapse: 'collapse', marginBottom: 20 }}>
                <tbody>
                  {[
                    ['Date', fmtDate(editTarget.dateTransfert)],
                    [rowDestLabel(editTarget), destCell(voc, editTarget)],
                    [voc.Nom('ingredient'), editTarget.ingredientNom],
                    ['Catégorie', editTarget.categorieNom],
                    ['Ancienne quantité', `${editTarget.quantite % 1 === 0 ? editTarget.quantite.toFixed(0) : editTarget.quantite} ${editTarget.uniteNom}`],
                  ].map(([label, value]) => (
                    <tr key={label} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '9px 0', fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', width: 130 }}>{label}</td>
                      <td style={{ padding: '9px 0', fontWeight: 600 }}>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#1d4ed8', display: 'block', marginBottom: 6 }}>
                  Nouvelle quantité ({editTarget.uniteNom})
                </label>
                <input
                  type="number" min="0.001" step="0.001" className="input"
                  style={{ width: '100%', fontWeight: 700, fontSize: '1.05rem', border: '2px solid #2563eb' }}
                  value={editQty}
                  onChange={(e) => setEditQty(e.target.value)}
                />
              </div>
              <div style={{ background: '#eff6ff', borderRadius: 10, padding: '12px 16px', borderLeft: '4px solid #2563eb' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: '0.78rem', color: '#1d4ed8', fontWeight: 700 }}>{editPrixSource === 'pmp' ? `Prix de référence (PMP HT à la date ${voc.du('transfert')})` : `Prix unitaire (${voc.acc('appro', 'dernier', 'dernière')} ${voc.court('appro')})`}</span>
                  <span style={{ fontWeight: 800, color: '#1d4ed8' }}>
                    {editPrixLoading ? '…' : editPrix !== null ? `${editPrix.toFixed(3)} DT` : '—'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.78rem', color: '#1e3a8a', fontWeight: 700 }}>Coût total estimé</span>
                  <span style={{ fontWeight: 800, color: '#1e3a8a', fontSize: '1.05rem' }}>
                    {editPrix !== null && parseFloat(editQty) > 0
                      ? `${(editPrix * parseFloat(editQty)).toFixed(3)} DT`
                      : '—'}
                  </span>
                </div>
              </div>
              {editError && <p style={{ color: '#dc2626', fontSize: '0.85rem', fontWeight: 600, margin: '12px 0 0' }}>⚠ {editError}</p>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setEditTarget(null)} disabled={editSaving}>{t('common.cancel')}</button>
              <button
                className="btn btn-primary"
                style={{ background: '#2563eb' }}
                onClick={saveEdit}
                disabled={editSaving || !parseFloat(editQty) || parseFloat(editQty) <= 0}
              >
                {editSaving ? 'Enregistrement…' : '✔ Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete modal */}
      {deleteTarget && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ background: 'linear-gradient(135deg, #7f1d1d, #dc2626)', color: '#fff' }}>
              <h2 style={{ color: '#fff', margin: 0 }}>🗑️ Supprimer {voc.le('transfert')}</h2>
              <button className="modal-close" style={{ color: '#fff' }} onClick={() => setDeleteTarget(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ background: '#fef2f2', borderRadius: 10, padding: '14px 16px', borderLeft: '4px solid #dc2626', marginBottom: 18 }}>
                <p style={{ fontWeight: 800, color: '#991b1b', fontSize: '0.88rem', margin: '0 0 6px' }}>⚠️ Attention — impact sur {voc.le('stock', true)}</p>
                <p style={{ fontSize: '0.85rem', color: '#7f1d1d', margin: 0, lineHeight: 1.5 }}>
                  Cette suppression va recalculer {voc.det('stock', 'le')}<strong>{voc.nom('stock')} {voc.du('labo')}</strong> (la quantité sera restituée) et {voc.det('stock', 'le')}<strong>{voc.nom('stock')} {voc.du(isLaboDest(deleteTarget) ? 'labo' : 'activite')} «{destNomOf(deleteTarget)}»</strong> (la quantité transférée sera retirée). Cette action est irréversible.
                </p>
              </div>
              <table style={{ width: '100%', fontSize: '0.9rem', borderCollapse: 'collapse' }}>
                <tbody>
                  {[
                    ['Date', fmtDate(deleteTarget.dateTransfert)],
                    [rowDestLabel(deleteTarget), destCell(voc, deleteTarget)],
                    [voc.Nom('ingredient'), deleteTarget.ingredientNom],
                    ['Quantité', `${deleteTarget.quantite % 1 === 0 ? deleteTarget.quantite.toFixed(0) : deleteTarget.quantite} ${deleteTarget.uniteNom}`],
                  ].map(([label, value]) => (
                    <tr key={label} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 0', fontWeight: 700, color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', width: 110 }}>{label}</td>
                      <td style={{ padding: '8px 0', fontWeight: 600 }}>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {deleteError && <p style={{ color: '#dc2626', fontSize: '0.85rem', fontWeight: 600, margin: '12px 0 0' }}>⚠ {deleteError}</p>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setDeleteTarget(null)} disabled={deleteSaving}>{t('common.cancel')}</button>
              <button
                className="btn"
                style={{ background: '#dc2626', color: '#fff', fontWeight: 700 }}
                onClick={confirmDelete}
                disabled={deleteSaving}
              >
                {deleteSaving ? 'Suppression…' : '🗑️ Confirmer la suppression'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail popup */}
      {detailPopup && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header modal-header--primary">
              <h2>📋 Détail {voc.du('transfert')}</h2>
              <button className="modal-close" onClick={() => setDetailPopup(null)}>✕</button>
            </div>
            <div className="modal-body">
              <table style={{ width: '100%', fontSize: '0.9rem', borderCollapse: 'collapse' }}>
                <tbody>
                  {[
                    ['Date', fmtDate(detailPopup.dateTransfert)],
                    [rowDestLabel(detailPopup), destCell(voc, detailPopup)],
                    [voc.Nom('ingredient'), detailPopup.ingredientNom],
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
