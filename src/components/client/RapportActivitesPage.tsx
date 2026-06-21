import { useEffect, useState, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import api from '../../api/client';
import type { Activite, Category } from '../../types';

interface ActDash {
  periode: { from: string; to: string };
  vide?: boolean;
  kpis: { valeur_stock: number; achats: number; nb_appros: number; pertes: number; stock_bas: number };
  stock_par_categorie: { categorie: string; valeur: number }[];
  achats_par_categorie: { categorie: string; valeur: number }[];
  pertes_par_type: { type: string; valeur: number }[];
  pertes_par_categorie: { categorie: string; valeur: number }[];
  top_pertes: { article: string; valeur: number }[];
  alertes_stock: { article: string; categorie: string; quantite: number; seuil: number }[];
}

const fmtDT = (n: number) => `${(n ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} DT`;
const PALETTE = ['#16a34a', '#0d9488', '#4f46e5', '#d97706', '#db2777', '#0891b2', '#dc2626', '#7c3aed'];
const TYPE_LABEL: Record<string, string> = { avarie: 'Avarie', dechet: 'Déchet' };
type Preset = 'mois' | '30j' | 'trimestre' | 'perso';
const periodForPreset = (preset: Preset): { from: string; to: string } => {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (preset === '30j') { const f = new Date(now); f.setDate(f.getDate() - 29); return { from: iso(f), to: iso(now) }; }
  if (preset === 'trimestre') { const f = new Date(now); f.setMonth(f.getMonth() - 2); f.setDate(1); return { from: iso(f), to: iso(now) }; }
  return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
};

type Status = 'good' | 'warn' | 'bad' | 'info' | 'neutral';
const STATUS: Record<Status, { c: string; bg: string; bd: string }> = {
  good: { c: '#059669', bg: '#ecfdf5', bd: '#a7f3d0' },
  warn: { c: '#d97706', bg: '#fffbeb', bd: '#fcd34d' },
  bad: { c: '#dc2626', bg: '#fef2f2', bd: '#fecaca' },
  info: { c: '#4f46e5', bg: '#eef2ff', bd: '#c7d2fe' },
  neutral: { c: '#475569', bg: 'var(--surface)', bd: 'var(--border)' },
};
function Kpi({ label, value, sub, status = 'neutral' }: { label: string; value: string; sub?: string; status?: Status }) {
  const s = STATUS[status];
  return (
    <div style={{ background: s.bg, border: `1px solid ${s.bd}`, borderLeft: `4px solid ${s.c}`, borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>{label}</span>
        {(status === 'warn' || status === 'bad' || status === 'good') && <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.c }} />}
      </div>
      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: status === 'neutral' ? 'var(--text)' : s.c, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}
function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 18px' }}>
      <div style={{ fontSize: '0.92rem', fontWeight: 700, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

export default function RapportActivitesPage() {
  const [activites, setActivites] = useState<Activite[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activiteId, setActiviteId] = useState('');
  const [categorieId, setCategorieId] = useState('');
  const [preset, setPreset] = useState<Preset>('mois');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [data, setData] = useState<ActDash | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/entreprise/activites').then(({ data }) => setActivites(data as Activite[])).catch(() => {});
    api.get('/api/categories').then(({ data }) => setCategories(data as Category[])).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const range = preset === 'perso' && customFrom && customTo ? { from: customFrom, to: customTo } : periodForPreset(preset);
    const params = new URLSearchParams({ from: range.from, to: range.to });
    if (activiteId) params.set('activiteId', activiteId);
    if (categorieId) params.set('categorieId', categorieId);
    api.get(`/api/dashboard/activites?${params}`).then(({ data }) => setData(data as ActDash)).catch(() => setData(null)).finally(() => setLoading(false));
  }, [preset, customFrom, customTo, activiteId, categorieId]);
  useEffect(() => { load(); }, [load]);

  const presets: { key: Preset; label: string }[] = [
    { key: 'mois', label: 'Mois en cours' }, { key: '30j', label: '30 jours' }, { key: 'trimestre', label: 'Trimestre' }, { key: 'perso', label: 'Personnalisé' },
  ];
  const stockCat = (data?.stock_par_categorie || []).map(c => ({ name: c.categorie, value: c.valeur }));
  const pertesType = (data?.pertes_par_type || []).map(t => ({ name: TYPE_LABEL[t.type] || t.type, value: t.valeur }));

  return (
    <div className="page">
      <div style={{ background: 'linear-gradient(135deg, #064e3b 0%, #047857 55%, #10b981 100%)', borderRadius: 18, padding: '22px 26px', marginBottom: 20, boxShadow: '0 8px 28px rgba(4,120,87,0.3)' }}>
        <h1 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#fff', margin: 0 }}>📍 Rapport activités</h1>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.82rem', margin: '4px 0 0' }}>Stock, achats et pertes de vos activités</p>
      </div>

      <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', padding: '10px 14px', marginBottom: 20, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Période</span>
        {presets.map(p => (
          <button key={p.key} onClick={() => setPreset(p.key)} style={{ fontSize: '0.78rem', padding: '5px 11px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, border: `1px solid ${preset === p.key ? '#047857' : 'var(--border)'}`, background: preset === p.key ? '#ecfdf5' : 'var(--bg)', color: preset === p.key ? '#065f46' : 'var(--text)' }}>{p.label}</button>
        ))}
        {preset === 'perso' && (<>
          <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ fontSize: '0.78rem', padding: '5px 8px', borderRadius: 8, border: '1px solid var(--border)' }} />
          <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ fontSize: '0.78rem', padding: '5px 8px', borderRadius: 8, border: '1px solid var(--border)' }} />
        </>)}
        <span style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />
        {activites.length > 1 && (
          <select value={activiteId} onChange={e => setActiviteId(e.target.value)} style={{ fontSize: '0.78rem', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)' }}>
            <option value="">Toutes activités</option>{activites.map(a => <option key={a.id} value={a.id}>{a.nom}</option>)}
          </select>
        )}
        {categories.length > 0 && (
          <select value={categorieId} onChange={e => setCategorieId(e.target.value)} style={{ fontSize: '0.78rem', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)' }}>
            <option value="">Toutes catégories</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>

      {loading ? <div className="loading-text">Chargement…</div> : !data || data.vide ? (
        <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-muted)' }}>Aucune donnée pour cette période.</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
            <Kpi label="Valeur du stock" value={fmtDT(data.kpis.valeur_stock)} status="info" />
            <Kpi label="Achats (appros)" value={fmtDT(data.kpis.achats)} status="neutral" sub={`${data.kpis.nb_appros} entrée${data.kpis.nb_appros > 1 ? 's' : ''}`} />
            <Kpi label="Pertes" value={fmtDT(data.kpis.pertes)} status={data.kpis.pertes > 0 ? 'bad' : 'good'} />
            <Kpi label="Articles en alerte" value={String(data.kpis.stock_bas)} status={data.kpis.stock_bas > 5 ? 'bad' : data.kpis.stock_bas > 0 ? 'warn' : 'good'} sub="sous le seuil min" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, marginBottom: 20 }}>
            <ChartCard title="Stock par catégorie">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={stockCat} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={80} paddingAngle={2}>
                    {stockCat.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  </Pie>
                  <Tooltip formatter={(value) => fmtDT(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Pertes par catégorie">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={(data.pertes_par_categorie || []).slice(0, 7).map(c => ({ name: c.categorie, Pertes: c.valeur }))} layout="vertical" margin={{ left: 10, right: 10 }}>
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip formatter={(value) => fmtDT(Number(value))} />
                  <Bar dataKey="Pertes" fill="#dc2626" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Achats par catégorie">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={(data.achats_par_categorie || []).slice(0, 7).map(c => ({ name: c.categorie, Achats: c.valeur }))} layout="vertical" margin={{ left: 10, right: 10 }}>
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip formatter={(value) => fmtDT(Number(value))} />
                  <Bar dataKey="Achats" fill="#16a34a" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Pertes par type">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={pertesType} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={80} paddingAngle={2}>
                    {pertesType.map((_, i) => <Cell key={i} fill={i === 0 ? '#dc2626' : '#d97706'} />)}
                  </Pie>
                  <Tooltip formatter={(value) => fmtDT(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 18px' }}>
            <div style={{ fontSize: '0.92rem', fontWeight: 700, marginBottom: 10 }}>⚠️ Articles sous le seuil minimum</div>
            {(data.alertes_stock || []).length === 0 ? (
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Aucun article en alerte. 👍</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                  <thead>
                    <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                      <th style={{ padding: '8px 6px' }}>Article</th><th style={{ padding: '8px 6px' }}>Catégorie</th>
                      <th style={{ padding: '8px 6px', textAlign: 'right' }}>Stock</th><th style={{ padding: '8px 6px', textAlign: 'right' }}>Seuil</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.alertes_stock.map((a, i) => (
                      <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 6px', fontWeight: 600 }}>{a.article}</td>
                        <td style={{ padding: '8px 6px', color: 'var(--text-muted)' }}>{a.categorie}</td>
                        <td style={{ padding: '8px 6px', textAlign: 'right', color: '#dc2626', fontWeight: 700 }}>{a.quantite % 1 === 0 ? a.quantite : a.quantite.toFixed(2)}</td>
                        <td style={{ padding: '8px 6px', textAlign: 'right' }}>{a.seuil % 1 === 0 ? a.seuil : a.seuil.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
