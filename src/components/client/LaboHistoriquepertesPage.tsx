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
}

interface LaboIngredient { id: number; nom: string; unite: string; categorie: string; categorieId: number | null }


export default function LaboHistoriquepertesPage() {
  const [searchParams] = useSearchParams();
  const laboId = searchParams.get('laboId') || '';

  const [labo, setLabo] = useState<Labo | null>(null);
  const [entries, setEntries] = useState<LaboPerteEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [laboIngredients, setLaboIngredients] = useState<LaboIngredient[]>([]);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [exporting, setExporting] = useState(false);

  const [fCategorie, setFCategorie] = useState('');
  const [fIngredient, setFIngredient] = useState('');
  const [fNom, setFNom] = useState('');
  const [fDateDebut, setFDateDebut] = useState(yearStart);
  const [fDateFin, setFDateFin] = useState(yearEnd);
  const [fType, setFType] = useState('');

  const categories = Array.from(
    new Map(laboIngredients.filter((i) => i.categorieId !== null).map((i) => [i.categorieId, { id: i.categorieId as number, nom: i.categorie }])).values()
  );
  const ingredientsInCat = fCategorie ? laboIngredients.filter((i) => String(i.categorieId) === fCategorie) : [];

  useEffect(() => {
    if (!laboId) return;
    api.get(`/api/labo/${laboId}`).then(({ data }) => setLabo(data)).catch(() => {});
    api.get(`/api/labo/${laboId}/ingredients`)
      .then(({ data }) => setLaboIngredients((data as LaboIngredient[]).filter((i) => (i as any).selected !== false)))
      .catch(() => {});
  }, [laboId]);

  const loadPertes = useCallback(async () => {
    if (!laboId) return;
    setLoading(true);
    setSearched(true);
    setSelected(new Set());
    try {
      const params = new URLSearchParams();
      if (fDateDebut) params.set('dateDebut', fDateDebut);
      if (fDateFin) params.set('dateFin', fDateFin);
      if (fType) params.set('typePerte', fType);
      if (fCategorie) params.set('categorieId', fCategorie);
      if (fIngredient) params.set('ingredientId', fIngredient);
      if (fNom.trim()) params.set('search', fNom.trim());
      const { data } = await api.get(`/api/labo/${laboId}/pertes/historique?${params}`);
      setEntries(data as LaboPerteEntry[]);
      setPage(1);
    } catch { /* ignore */ }
    setLoading(false);
  }, [laboId, fDateDebut, fDateFin, fType, fCategorie, fIngredient, fNom]);

  const handleExport = async () => {
    if (!laboId) return;
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (fDateDebut) params.set('dateDebut', fDateDebut);
      if (fDateFin) params.set('dateFin', fDateFin);
      if (fType) params.set('typePerte', fType);
      if (fCategorie) params.set('categorieId', fCategorie);
      if (fIngredient) params.set('ingredientId', fIngredient);
      if (fNom.trim()) params.set('search', fNom.trim());
      if (selected.size > 0) params.set('selectedIds', [...selected].join(','));
      const { data } = await api.get(`/api/labo/${laboId}/pertes/historique/export-excel?${params}`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `historique-pertes-labo-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
    setExporting(false);
  };

  const toggleSelect = (id: number) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleSelectAll = () => { if (selected.size === entries.length) setSelected(new Set()); else setSelected(new Set(entries.map((e) => e.id))); };

  const resetFilters = () => {
    setFCategorie(''); setFIngredient('');
    setFNom(''); setFDateDebut(yearStart); setFDateFin(yearEnd); setFType('');
  };

  const totalQty = entries.reduce((s, e) => s + e.quantite, 0);
  const totalCout = entries.reduce((s, e) => s + (e.prixUnitaire != null ? e.quantite * e.prixUnitaire : 0), 0);
  const hasCout = entries.some((e) => e.prixUnitaire != null);

  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const paged = entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const laboLabel = labo?.nom || `Labo #${laboId}`;

  return (
    <div className="page-content">
      <div style={{
        background: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 55%, #ef4444 100%)',
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(153,27,27,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>📉</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Historique Pertes — {laboLabel}</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>Avaries et déchets enregistrés</p>
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

      {/* Filters */}
      <div style={{
        background: 'var(--surface)', borderRadius: 14, padding: '16px 20px', marginBottom: 24,
        border: '1px solid var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
      }}>
        {/* Panel header */}
        <div style={{ width: '100%', marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#7e22ce' }}>Filtres</span>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.78rem' }} onClick={resetFilters}>✕ Réinitialiser</button>
        </div>
        {/* Section 1: Produit */}
        <div style={{ marginBottom: 16, marginTop: 14 }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 16, height: 2, background: '#7e22ce', display: 'inline-block', borderRadius: 2 }} />
            Produit
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
            <div>
              <label style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>🏷️ Catégorie</label>
              <select style={{ padding: '9px 13px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: '0.88rem', background: 'var(--background)', minWidth: 160 }} value={fCategorie} onChange={(e) => { setFCategorie(e.target.value); setFIngredient(''); }}>
                <option value="">— Toutes —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>🧂 Ingrédient</label>
              <select style={{ padding: '9px 13px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: '0.88rem', background: 'var(--background)', minWidth: 160 }} value={fIngredient} disabled={!fCategorie} onChange={(e) => setFIngredient(e.target.value)}>
                <option value="">— Tous —</option>
                {ingredientsInCat.map((i) => <option key={i.id} value={i.id}>{i.nom}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>🔍 Nom</label>
              <input type="text" style={{ padding: '9px 13px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: '0.88rem', background: 'var(--background)', minWidth: 160 }} placeholder="Rechercher…" value={fNom} onChange={(e) => setFNom(e.target.value)} />
            </div>
          </div>
        </div>
        {/* Divider */}
        <div style={{ marginBottom: 16, borderTop: '1px dashed var(--border)' }} />
        {/* Section 2: Période & Type */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 16, height: 2, background: '#dc2626', display: 'inline-block', borderRadius: 2 }} />
            Période &amp; Type
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
            <div>
              <label style={{ fontSize: '0.68rem', fontWeight: 800, color: '#7e22ce', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>📅 Du</label>
              <input type="date" style={{ padding: '9px 13px', borderRadius: 9, border: '1.5px solid #7e22ce', fontSize: '0.88rem', background: '#faf5ff', minWidth: 160, fontWeight: 600 }} value={fDateDebut} onChange={(e) => setFDateDebut(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: '0.68rem', fontWeight: 800, color: '#7e22ce', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>📅 Au</label>
              <input type="date" style={{ padding: '9px 13px', borderRadius: 9, border: '1.5px solid #7e22ce', fontSize: '0.88rem', background: '#faf5ff', minWidth: 160, fontWeight: 600 }} value={fDateFin} onChange={(e) => setFDateFin(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>📋 Type</label>
              <select style={{ padding: '9px 13px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: '0.88rem', background: 'var(--background)', minWidth: 160 }} value={fType} onChange={(e) => setFType(e.target.value)}>
                <option value="">— Tous —</option>
                <option value="avarie">Avarie</option>
                <option value="dechet">Déchet</option>
              </select>
            </div>
          </div>
        </div>
        {/* Actions footer */}
        <div style={{ paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <button
            onClick={loadPertes}
            disabled={loading || !laboId}
            style={{ background: 'linear-gradient(135deg, #991b1b 0%, #dc2626 100%)', boxShadow: '0 4px 14px rgba(185,28,28,0.35)', borderRadius: 10, border: 'none', color: '#fff', fontWeight: 800, padding: '10px 26px', minWidth: 140, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}
          >
            {loading ? 'Chargement…' : '🔍 Rechercher'}
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || !searched || entries.length === 0}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, minWidth: 180,
              background: (searched && entries.length > 0) ? 'linear-gradient(135deg, #16a34a, #22c55e)' : '#e5e7eb',
              boxShadow: (searched && entries.length > 0) ? '0 4px 14px rgba(22,163,74,0.35)' : 'none',
              borderRadius: 10, border: 'none',
              color: (searched && entries.length > 0) ? '#fff' : 'var(--text-muted)',
              fontWeight: 800, padding: '10px 20px',
              cursor: (!searched || entries.length === 0) ? 'not-allowed' : 'pointer',
              opacity: (!searched || entries.length === 0) ? 0.55 : 1, transition: 'all 0.15s',
            }}
          >
            <span>📊</span>
            {selected.size > 0 ? `Générer Excel (${selected.size} sél.)` : 'Générer Hist. Pertes'}
          </button>
        </div>
      </div>

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
            <div style={{ marginBottom: 8, fontSize: '0.82rem', color: '#b91c1c', fontWeight: 700 }}>
              {selected.size} sélectionné{selected.size > 1 ? 's' : ''}
            </div>
          )}
          <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginBottom: 16 }}>
            <table className="table" style={{ margin: 0 }}>
              <thead>
                <tr style={{ background: 'linear-gradient(135deg, #7f1d1d, #dc2626)' }}>
                  <th style={{ width: 40, textAlign: 'center', fontWeight: 800, fontSize: '0.78rem', padding: '12px 14px', color: '#fff', background: 'transparent', borderBottom: 'none' }}>
                    <input type="checkbox" checked={selected.size === entries.length && entries.length > 0} onChange={toggleSelectAll} style={{ cursor: 'pointer' }} />
                  </th>
                  {['Date', 'Ingrédient', 'Catégorie', 'Type', 'Quantité', ...(hasCout ? ['Coût'] : [])].map((h) => (
                    <th key={h} style={{ fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '12px 14px', color: '#fff', background: 'transparent', borderBottom: 'none' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((e, idx) => {
                  const isSelected = selected.has(e.id);
                  return (
                  <tr key={e.id} style={{ background: isSelected ? '#fee2e2' : idx % 2 === 0 ? 'var(--surface)' : 'rgba(220,38,38,0.03)', cursor: 'pointer' }} onClick={() => toggleSelect(e.id)}>
                    <td style={{ textAlign: 'center', padding: '10px 14px' }} onClick={(ev) => ev.stopPropagation()}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(e.id)} style={{ cursor: 'pointer' }} />
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: '0.85rem' }}>{fmtDate(e.datePerte)}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                      {e.ingredientNom}
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 4 }}>{e.uniteNom}</span>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>{e.categorieNom ?? '—'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                        background: e.typePerte === 'avarie' ? '#fee2e2' : '#fef9c3',
                        color: e.typePerte === 'avarie' ? '#991b1b' : '#854d0e' }}>
                        {e.typePerte === 'avarie' ? 'Avarie' : 'Déchet'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#dc2626' }}>{e.quantite.toFixed(3)}</td>
                    {hasCout && (
                      <td style={{ padding: '10px 14px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {e.prixUnitaire != null ? `${(e.quantite * e.prixUnitaire).toFixed(3)} DT` : '—'}
                      </td>
                    )}
                  </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--surface-alt, #f9fafb)', borderTop: '2px solid var(--border)' }}>
                  <td colSpan={4} style={{ padding: '10px 14px', fontWeight: 800, fontSize: '0.82rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total</td>
                  <td style={{ padding: '10px 14px' }} />
                  <td style={{ padding: '10px 14px', fontWeight: 800, color: '#dc2626' }}>{totalQty.toFixed(3)}</td>
                  {hasCout && <td style={{ padding: '10px 14px', fontWeight: 800, color: '#dc2626' }}>{totalCout.toFixed(3)} DT</td>}
                </tr>
              </tfoot>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 8 }}>
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
