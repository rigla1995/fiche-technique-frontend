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

const labelStyle: React.CSSProperties = {
  fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4,
};

export default function LaboHistoriquepertesPage() {
  const [searchParams] = useSearchParams();
  const laboId = searchParams.get('laboId') || '';

  const [labo, setLabo] = useState<Labo | null>(null);
  const [entries, setEntries] = useState<LaboPerteEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [laboIngredients, setLaboIngredients] = useState<LaboIngredient[]>([]);
  const [page, setPage] = useState(1);

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

  useEffect(() => { loadPertes(); }, [loadPertes]);

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
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '16px 20px', border: '1px solid var(--border)', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#dc2626', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Filtres</span>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.78rem' }} onClick={resetFilters}>✕ Réinitialiser</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px 20px' }}>
          <div>
            <label style={labelStyle}>Du</label>
            <input type="date" className="input" style={{ width: '100%' }} value={fDateDebut} onChange={(e) => setFDateDebut(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Au</label>
            <input type="date" className="input" style={{ width: '100%' }} value={fDateFin} onChange={(e) => setFDateFin(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Type</label>
            <select className="input" style={{ width: '100%' }} value={fType} onChange={(e) => setFType(e.target.value)}>
              <option value="">— Tous —</option>
              <option value="avarie">Avarie</option>
              <option value="dechet">Déchet</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Catégorie</label>
            <select className="input" style={{ width: '100%' }} value={fCategorie} onChange={(e) => { setFCategorie(e.target.value); setFIngredient(''); }}>
              <option value="">— Toutes —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Ingrédient</label>
            <select className="input" style={{ width: '100%' }} value={fIngredient} disabled={!fCategorie} onChange={(e) => setFIngredient(e.target.value)}>
              <option value="">— Tous —</option>
              {ingredientsInCat.map((i) => <option key={i.id} value={i.id}>{i.nom}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Nom</label>
            <input type="text" className="input" style={{ width: '100%' }} placeholder="Rechercher…" value={fNom} onChange={(e) => setFNom(e.target.value)} />
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-muted">Chargement…</p>
      ) : entries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>📉</div>
          <p>Aucune perte enregistrée pour cette période.</p>
        </div>
      ) : (
        <>
          <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginBottom: 16 }}>
            <table className="table" style={{ margin: 0 }}>
              <thead>
                <tr style={{ background: 'linear-gradient(135deg, #7f1d1d, #dc2626)' }}>
                  {['Date', 'Ingrédient', 'Catégorie', 'Type', 'Quantité', ...(hasCout ? ['Coût'] : [])].map((h) => (
                    <th key={h} style={{ fontWeight: 800, fontSize: '0.78rem', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '12px 14px', color: '#fff' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((e, idx) => (
                  <tr key={e.id} style={{ background: idx % 2 === 0 ? 'var(--surface)' : 'rgba(220,38,38,0.03)' }}>
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
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--surface-alt, #f9fafb)', borderTop: '2px solid var(--border)' }}>
                  <td colSpan={3} style={{ padding: '10px 14px', fontWeight: 800, fontSize: '0.82rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total</td>
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
