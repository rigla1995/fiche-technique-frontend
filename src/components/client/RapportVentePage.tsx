import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import api from '../../api/client';
import HelpButton from '../common/HelpButton';
import HistoryFilterBar, { FilterField, FilterInput, FilterSelect, FilterSegmented } from '../common/HistoryFilterBar';
import type { Activite, CategorieProduit } from '../../types';

interface RVProduit { nom: string; type: 'produit' | 'supplement' | 'valorise'; qte: number; ca: number; marge: number; food_cost_pct: number | null }
interface RVData {
  periode: { from: string; to: string };
  vide?: boolean;
  kpis: { ca: number; cout_matiere: number; marge: number; food_cost_pct: number | null; taux_marge_pct: number | null; nb_ventes: number; panier_moyen: number };
  produits: RVProduit[];
  ca_par_canal: { canal: string; total: number }[];
}

const fmtDT = (n: number) => `${(n ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} DT`;
const PALETTE = ['#b45309', '#0d9488', '#4f46e5', '#db2777', '#0891b2', '#65a30d'];
const fcColor = (p: number | null) => p == null ? '#64748b' : p < 30 ? '#059669' : p <= 40 ? '#d97706' : '#dc2626';
const fcBg = (p: number | null) => p == null ? '#f1f5f9' : p < 30 ? '#dcfce7' : p <= 40 ? '#fef3c7' : '#fee2e2';

type Status = 'good' | 'warn' | 'bad' | 'info' | 'neutral';
const STATUS: Record<Status, { c: string; bg: string; bd: string }> = {
  good: { c: '#059669', bg: '#ecfdf5', bd: '#a7f3d0' },
  warn: { c: '#d97706', bg: '#fffbeb', bd: '#fcd34d' },
  bad: { c: '#dc2626', bg: '#fef2f2', bd: '#fecaca' },
  info: { c: '#4f46e5', bg: '#eef2ff', bd: '#c7d2fe' },
  neutral: { c: '#475569', bg: 'var(--surface)', bd: 'var(--border)' },
};
const fcStatus = (p: number | null): Status => p == null ? 'neutral' : p < 30 ? 'good' : p <= 40 ? 'warn' : 'bad';
type Preset = 'mois' | '30j' | 'trimestre' | 'perso';
const periodForPreset = (preset: Preset): { from: string; to: string } => {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (preset === '30j') { const f = new Date(now); f.setDate(f.getDate() - 29); return { from: iso(f), to: iso(now) }; }
  if (preset === 'trimestre') { const f = new Date(now); f.setMonth(f.getMonth() - 2); f.setDate(1); return { from: iso(f), to: iso(now) }; }
  return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
};

function Kpi({ label, value, sub, status = 'neutral', help }: { label: string; value: string; sub?: string; status?: Status; help?: string }) {
  const s = STATUS[status];
  return (
    <div style={{ background: s.bg, border: `1px solid ${s.bd}`, borderLeft: `4px solid ${s.c}`, borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>{label}{help && <HelpButton section={help} size={14} tip="Comprendre cet indicateur" />}</span>
        {(status === 'warn' || status === 'bad' || status === 'good') && <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.c }} />}
      </div>
      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: status === 'neutral' ? 'var(--text)' : s.c, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

type SortKey = 'ca' | 'marge' | 'food' | 'qte';

export default function RapportVentePage() {
  const [activites, setActivites] = useState<Activite[]>([]);
  const [categories, setCategories] = useState<CategorieProduit[]>([]);
  const [activiteId, setActiviteId] = useState('');
  const [categorieId, setCategorieId] = useState('');
  const [canal, setCanal] = useState('');
  const [preset, setPreset] = useState<Preset>('mois');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [data, setData] = useState<RVData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortKey>('ca');
  const [filterType, setFilterType] = useState('');

  useEffect(() => {
    api.get('/api/entreprise/activites').then(({ data }) => setActivites(data as Activite[])).catch(() => {});
    api.get('/api/categories-produit').then(({ data }) => setCategories((data as CategorieProduit[]).filter(c => c.typeProduit === 'vendable' || c.typeProduit === 'supplement'))).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const range = preset === 'perso' && customFrom && customTo ? { from: customFrom, to: customTo } : periodForPreset(preset);
    const params = new URLSearchParams({ from: range.from, to: range.to });
    if (activiteId) params.set('activiteId', activiteId);
    if (categorieId) params.set('categorieId', categorieId);
    if (canal) params.set('canal', canal);
    api.get(`/api/dashboard/rapport-ventes?${params}`).then(({ data }) => setData(data as RVData)).catch(() => setData(null)).finally(() => setLoading(false));
  }, [preset, customFrom, customTo, activiteId, categorieId, canal]);
  useEffect(() => { load(); }, [load]);

  const presets: { key: Preset; label: string }[] = [
    { key: 'mois', label: 'Mois en cours' }, { key: '30j', label: '30 jours' }, { key: 'trimestre', label: 'Trimestre' }, { key: 'perso', label: 'Personnalisé' },
  ];
  const k = data?.kpis;
  const canalData = (data?.ca_par_canal || []).map(c => ({ name: c.canal, value: c.total }));
  let produits = (data?.produits || []).filter(p => !filterType || p.type === filterType);
  produits = [...produits].sort((a, b) => sort === 'food' ? (b.food_cost_pct ?? 0) - (a.food_cost_pct ?? 0) : sort === 'marge' ? b.marge - a.marge : sort === 'qte' ? b.qte - a.qte : b.ca - a.ca);

  const exportExcel = async () => {
    const range = preset === 'perso' && customFrom && customTo ? { from: customFrom, to: customTo } : periodForPreset(preset);
    const params = new URLSearchParams({ activiteId: activiteId || '', from: range.from, to: range.to });
    try {
      const resp = await api.get(`/api/ventes/export-excel?${params}`, { responseType: 'blob' });
      const url = URL.createObjectURL(resp.data as Blob); const a = document.createElement('a');
      a.href = url; a.download = `rapport-ventes.xlsx`; a.click(); URL.revokeObjectURL(url);
    } catch { /* ignore */ }
  };

  return (
    <div className="page">
      <div style={{ background: 'linear-gradient(135deg, #78350f 0%, #b45309 55%, #f59e0b 100%)', borderRadius: 18, padding: '22px 26px', marginBottom: 20, boxShadow: '0 8px 28px rgba(180,83,9,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: 9 }}>🛒 Rapport ventes<HelpButton section="rapports-vente" variant="solid" size={20} tip="Comment lire ce rapport ?" /></h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.82rem', margin: '4px 0 0' }}>CA, marges, food cost et performances produits</p>
        </div>
        <button onClick={exportExcel} style={{ fontSize: '0.82rem', padding: '8px 14px', borderRadius: 9, border: '1.5px solid rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>📊 Export Excel</button>
      </div>

      <HistoryFilterBar accent="#b45309" accentDark="#92400e">
        <FilterField label="📅 Période" span>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <FilterSegmented options={presets.map(p => ({ value: p.key, label: p.label }))} value={preset} onChange={(v) => setPreset(v as Preset)} accent="#b45309" />
            {preset === 'perso' && (<>
              <FilterInput type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ width: 'auto', flex: '0 0 auto' }} />
              <FilterInput type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ width: 'auto', flex: '0 0 auto' }} />
            </>)}
          </div>
        </FilterField>
        {activites.length > 1 && (
          <FilterField label="🏪 Activité">
            <FilterSelect value={activiteId} onChange={e => setActiviteId(e.target.value)}>
              <option value="">Toutes activités</option>
              {activites.map(a => <option key={a.id} value={a.id}>{a.nom}</option>)}
            </FilterSelect>
          </FilterField>
        )}
        {categories.length > 0 && (
          <FilterField label="🏷️ Catégorie">
            <FilterSelect value={categorieId} onChange={e => setCategorieId(e.target.value)}>
              <option value="">Toutes catégories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </FilterSelect>
          </FilterField>
        )}
        <FilterField label="🛒 Canal">
          <FilterSelect value={canal} onChange={e => setCanal(e.target.value)}>
            <option value="">Tous canaux</option>
            <option value="directe">Direct</option>
            <option value="prestataire">Prestataires</option>
          </FilterSelect>
        </FilterField>
      </HistoryFilterBar>

      {loading ? <div className="loading-text">Chargement…</div> : !data || data.vide ? (
        <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-muted)' }}>Aucune vente sur cette période.</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
            <Kpi label="CA total" help="saisie-ventes" value={fmtDT(k!.ca)} status="info" />
            <Kpi label="Marge brute" help="fiches-techniques" value={fmtDT(k!.marge)} status={(k!.taux_marge_pct ?? 0) >= 50 ? 'good' : 'neutral'} sub={k!.taux_marge_pct != null ? `${k!.taux_marge_pct}%` : undefined} />
            <Kpi label="Food cost moyen" help="fiches-techniques" value={k!.food_cost_pct != null ? `${k!.food_cost_pct}%` : '—'} status={fcStatus(k!.food_cost_pct)} sub="cible <30%" />
            <Kpi label="Panier moyen" value={`${k!.panier_moyen.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} DT`} sub={`${k!.nb_ventes} vente${k!.nb_ventes > 1 ? 's' : ''}`} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginBottom: 20 }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 18px' }}>
              <div style={{ fontSize: '0.92rem', fontWeight: 700, marginBottom: 12 }}>Top produits (CA)</div>
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={produits.slice(0, 6).map(p => ({ name: p.nom, CA: p.ca }))} layout="vertical" margin={{ left: 10, right: 10 }}>
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
                  <Tooltip formatter={(value) => fmtDT(Number(value))} />
                  <Bar dataKey="CA" fill="#b45309" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 18px' }}>
              <div style={{ fontSize: '0.92rem', fontWeight: 700, marginBottom: 12 }}>CA par canal</div>
              <ResponsiveContainer width="100%" height={230}>
                <PieChart>
                  <Pie data={canalData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={80} paddingAngle={2}>
                    {canalData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  </Pie>
                  <Tooltip formatter={(value) => fmtDT(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              <div style={{ fontSize: '0.92rem', fontWeight: 700 }}>Détail par produit</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ fontSize: '0.76rem', padding: '5px 8px', borderRadius: 7, border: '1px solid var(--border)' }}>
                  <option value="">Tous types</option><option value="produit">Produits</option><option value="supplement">Suppléments</option><option value="valorise">Valorisés</option>
                </select>
                <select value={sort} onChange={e => setSort(e.target.value as SortKey)} style={{ fontSize: '0.76rem', padding: '5px 8px', borderRadius: 7, border: '1px solid var(--border)' }}>
                  <option value="ca">Tri : CA</option><option value="marge">Tri : Marge</option><option value="food">Tri : Food cost</option><option value="qte">Tri : Quantité</option>
                </select>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                <thead>
                  <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                    <th style={{ padding: '8px 6px' }}>Produit</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>Qté</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>CA</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>Marge</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>Food cost</th>
                  </tr>
                </thead>
                <tbody>
                  {produits.map((p, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 6px', fontWeight: 600 }}>{p.nom}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right' }}>{p.qte % 1 === 0 ? p.qte : p.qte.toFixed(2)}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 600 }}>{fmtDT(p.ca)}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right' }}>{fmtDT(p.marge)}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                        <span style={{ background: fcBg(p.food_cost_pct), color: fcColor(p.food_cost_pct), borderRadius: 8, padding: '2px 9px', fontWeight: 700 }}>{p.food_cost_pct != null ? `${p.food_cost_pct}%` : '—'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 10 }}>ℹ️ Food cost : vert &lt;30% · orange 30–40% · rouge &gt;40%.</div>
          </div>
        </>
      )}
    </div>
  );
}
