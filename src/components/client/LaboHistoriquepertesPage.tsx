import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../../api/client';
import HelpButton from '../common/HelpButton';
import HistoryFilterBar, { FilterField, FilterInput, FilterSelect } from '../common/HistoryFilterBar';
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

interface LaboPerteEntry {
  id: number;
  laboId: number;
  ingredientId: number;
  ingredientNom: string;
  uniteNom: string;
  categorieNom: string | null;
  quantite: number;
  prixUnitaire: number | null;
  typePerte: 'avarie' | 'dechet';
  datePerte: string;
  createdAt: string;
  createdByNom?: string | null;
}

interface LaboIngredient { id: number; nom: string; unite: string; categorie: string; categorieId: number | null }


export default function LaboHistoriquepertesPage() {
  const [searchParams] = useSearchParams();
  const laboId = searchParams.get('laboId') || '';
  const navigate = useNavigate();

  const [labo, setLabo] = useState<Labo | null>(null);
  const [allLabos, setAllLabos] = useState<Labo[]>([]);
  const [entries, setEntries] = useState<LaboPerteEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [laboIngredients, setLaboIngredients] = useState<LaboIngredient[]>([]);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const [fCategorie, setFCategorie] = useState('');
  const [fIngredient, setFIngredient] = useState('');
  const [fDateDebut, setFDateDebut] = useState(yearStart);
  const [fDateFin, setFDateFin] = useState(yearEnd);
  const [fType, setFType] = useState('');

  const categories = Array.from(
    new Map(laboIngredients.filter((i) => i.categorieId !== null).map((i) => [i.categorieId, { id: i.categorieId as number, nom: i.categorie }])).values()
  );
  const ingredientsInCat = fCategorie ? laboIngredients.filter((i) => String(i.categorieId) === fCategorie) : [];

  useEffect(() => {
    api.get('/api/labo').then(({ data }) => setAllLabos(data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!laboId) return;
    api.get(`/api/labo/${laboId}`).then(({ data }) => setLabo(data)).catch(() => {});
    api.get(`/api/labo/${laboId}/ingredients`)
      .then(({ data }) => setLaboIngredients((data as LaboIngredient[]).filter((i) => (i as any).selected !== false)))
      .catch(() => {});
  }, [laboId]);

  const buildParams = () => {
    const params = new URLSearchParams();
    if (fDateDebut) params.set('dateDebut', fDateDebut);
    if (fDateFin) params.set('dateFin', fDateFin);
    if (fType) params.set('typePerte', fType);
    if (fCategorie) params.set('categorieId', fCategorie);
    if (fIngredient) params.set('ingredientId', fIngredient);
    return params;
  };

  const loadPertes = useCallback(async () => {
    if (!laboId) return;
    setLoading(true);
    setSearched(true);
    setSelected(new Set());
    try {
      const { data } = await api.get(`/api/labo/${laboId}/pertes/historique?${buildParams()}`);
      setEntries(data as LaboPerteEntry[]);
      setPage(1);
    } catch { /* ignore */ }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laboId, fDateDebut, fDateFin, fType, fCategorie, fIngredient]);

  const handleExport = async () => {
    if (!laboId) return;
    setExporting(true);
    try {
      const params = buildParams();
      if (selected.size > 0) params.set('selectedIds', [...selected].join(','));
      const { data } = await api.get(`/api/labo/${laboId}/pertes/historique/export-excel?${params}`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `historique-pertes-labo-${labo?.nom ?? laboId}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
    setExporting(false);
  };

  const handleExportPdf = async () => {
    if (!laboId) return;
    setExportingPdf(true);
    try {
      const params = buildParams();
      if (selected.size > 0) params.set('selectedIds', [...selected].join(','));
      const { data } = await api.get(`/api/labo/${laboId}/pertes/historique/export-pdf?${params}`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `historique-pertes-labo-${labo?.nom ?? laboId}-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
    setExportingPdf(false);
  };

  const toggleSelect = (id: number) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const resetFilters = () => {
    setFCategorie(''); setFIngredient('');
    setFDateDebut(yearStart); setFDateFin(yearEnd); setFType('');
  };

  const totalQty = entries.reduce((s, e) => s + e.quantite, 0);
  const totalCout = entries.reduce((s, e) => s + (e.prixUnitaire != null ? e.quantite * e.prixUnitaire : 0), 0);
  const hasCout = entries.some((e) => e.prixUnitaire != null);

  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const paged = entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const laboLabel = labo?.nom || `Labo #${laboId}`;
  const canExport = searched && entries.length > 0;

  return (
    <div className="page-content">
      <div style={{
        background: 'linear-gradient(135deg, #3b0764 0%, #7e22ce 55%, #a855f7 100%)',
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(126,34,206,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>📉</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Historique Pertes — {laboLabel} <HelpButton section="pertes" variant="solid" size={18} tip="Aide" /></h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>Labo — avaries et déchets enregistrés</p>
        </div>
        {entries.length > 0 && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '8px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#fff' }}>{entries.length}</div>
              <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase' }}>Entrées</div>
            </div>
            {hasCout && (
              <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '8px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#fff' }}>{totalCout.toFixed(3)} DT</div>
                <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase' }}>Coût total</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Labo selector ─────────────────────────────────────────────────── */}
      {allLabos.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, padding: '10px 14px', background: 'var(--card-bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
          {allLabos.map((l) => (
            <button key={l.id} onClick={() => navigate(`/client/labo/historique-pertes?laboId=${l.id}`)}
              style={{ padding: '4px 14px', borderRadius: 20, cursor: 'pointer', fontSize: '0.82rem',
                border: laboId === String(l.id) ? '1.5px solid #7e22ce' : '1.5px solid var(--border)',
                background: laboId === String(l.id) ? '#7e22ce' : 'var(--bg)',
                color: laboId === String(l.id) ? '#fff' : 'var(--text)',
                fontWeight: laboId === String(l.id) ? 700 : 400 }}>
              🏭 {l.nom}
            </button>
          ))}
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', alignSelf: 'center', marginLeft: 4 }}>← sélectionner le labo</span>
        </div>
      )}

      {/* Barre de filtres (composant partagé) */}
      <HistoryFilterBar
        accent="#7e22ce" accentDark="#6d28d9"
        onSearch={loadPertes} searching={loading} searchDisabled={!laboId}
        onReset={resetFilters}
        showReset={!!(fCategorie || fIngredient || fType || fDateDebut !== yearStart || fDateFin !== yearEnd)}
        onExportExcel={handleExport} excelDisabled={exporting || !canExport} excelLabel={`Exporter${selected.size > 0 ? ` (${selected.size})` : ''}`}
        onExportPdf={handleExportPdf} pdfDisabled={!canExport} exportingPdf={exportingPdf}
      >
        <FilterField label="📅 Du"><FilterInput type="date" value={fDateDebut} onChange={(e) => setFDateDebut(e.target.value)} /></FilterField>
        <FilterField label="📅 Au"><FilterInput type="date" value={fDateFin} onChange={(e) => setFDateFin(e.target.value)} /></FilterField>
        <FilterField label="🏷️ Catégorie">
          <FilterSelect value={fCategorie} onChange={(e) => { setFCategorie(e.target.value); setFIngredient(''); }}>
            <option value="">— Toutes —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </FilterSelect>
        </FilterField>
        <FilterField label="🧂 Article">
          <FilterSelect value={fIngredient} disabled={!fCategorie} onChange={(e) => setFIngredient(e.target.value)}>
            <option value="">— Tous —</option>
            {ingredientsInCat.map((i) => <option key={i.id} value={i.id}>{i.nom}</option>)}
          </FilterSelect>
        </FilterField>
        <FilterField label="📋 Type">
          <FilterSelect value={fType} onChange={(e) => setFType(e.target.value)}>
            <option value="">— Tous —</option>
            <option value="avarie">Avarie</option>
            <option value="dechet">Déchet</option>
          </FilterSelect>
        </FilterField>
      </HistoryFilterBar>

      {!searched ? null : loading ? (
        <p className="text-muted">Chargement…</p>
      ) : entries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>📉</div>
          <p>Aucune perte enregistrée pour cette période.</p>
        </div>
      ) : (
        <>
          {selected.size > 0 && (
            <div style={{ marginBottom: 8, fontSize: '0.82rem', color: '#7e22ce', fontWeight: 700 }}>
              {selected.size} sélectionné{selected.size > 1 ? 's' : ''}
            </div>
          )}
          <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginBottom: 16 }}>
            <table className="table" style={{ margin: 0 }}>
              <thead>
                <tr style={{ background: 'linear-gradient(135deg, #3b0764, #7e22ce)' }}>
                  <th style={{ width: 40, textAlign: 'center', padding: '12px 14px', color: '#fff', background: 'transparent', borderBottom: 'none' }} />
                  {['Article', 'Date', 'Type', 'Quantité', ...(hasCout ? ['Coût'] : []), 'Créé par'].map((h) => (
                    <th key={h} style={{ fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '12px 14px', color: '#fff', background: 'transparent', borderBottom: 'none' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((e, idx) => {
                  const isSelected = selected.has(e.id);
                  return (
                  <tr key={e.id} style={{ background: isSelected ? '#f3e8ff' : idx % 2 === 0 ? 'var(--surface)' : 'rgba(126,34,206,0.03)', cursor: 'pointer' }} onClick={() => toggleSelect(e.id)}>
                    <td style={{ textAlign: 'center', padding: '10px 14px' }} onClick={(ev) => ev.stopPropagation()}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(e.id)} style={{ cursor: 'pointer', accentColor: '#7e22ce' }} />
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.86rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.ingredientNom}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.uniteNom}{e.categorieNom ? ` · ${e.categorieNom}` : ''}</div>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: '0.85rem' }}>{fmtDate(e.datePerte)}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                        background: e.typePerte === 'avarie' ? '#fee2e2' : '#fef9c3',
                        color: e.typePerte === 'avarie' ? '#991b1b' : '#854d0e' }}>
                        {e.typePerte === 'avarie' ? 'Avarie' : 'Déchet'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#7e22ce' }}>{e.quantite.toFixed(3)}</td>
                    {hasCout && (
                      <td style={{ padding: '10px 14px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {e.prixUnitaire != null ? `${(e.quantite * e.prixUnitaire).toFixed(3)} DT` : '—'}
                      </td>
                    )}
                    <td style={{ padding: '10px 14px', fontSize: '0.78rem', color: e.createdByNom ? '#7c3aed' : 'var(--text-muted)', fontWeight: e.createdByNom ? 600 : 400, whiteSpace: 'nowrap' }}>
                      {e.createdByNom ? `👤 ${e.createdByNom}` : '—'}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f5f3ff', borderTop: '2px solid #7e22ce' }}>
                  <td colSpan={4} style={{ padding: '10px 14px', fontWeight: 800, fontSize: '0.82rem', color: '#3b0764', textTransform: 'uppercase' }}>
                    Total — {entries.length} entrée{entries.length > 1 ? 's' : ''}
                  </td>
                  <td style={{ padding: '10px 14px', fontWeight: 800, color: '#7e22ce' }}>{totalQty.toFixed(3)}</td>
                  {hasCout && <td style={{ padding: '10px 14px', fontWeight: 800, color: '#7e22ce' }}>{totalCout.toFixed(3)} DT</td>}
                </tr>
              </tfoot>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>‹ Préc.</button>
              <span style={{ alignSelf: 'center', fontSize: '0.82rem', color: 'var(--text-muted)' }}>{page} / {totalPages}</span>
              <button className="btn btn-ghost btn-sm" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>Suiv. ›</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
