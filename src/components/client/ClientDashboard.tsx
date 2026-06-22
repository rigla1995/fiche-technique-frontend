import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar,
} from 'recharts';
import api from '../../api/client';
import HelpButton from '../common/HelpButton';
import type { Activite } from '../../types';

interface DashKpis {
  ca: number; ca_delta_pct: number | null;
  cout_matiere: number; food_cost_pct: number | null;
  marge: number; taux_marge_pct: number | null;
  valeur_stock: number; pertes: number; pertes_pct_ca: number | null;
  nb_ventes: number; panier_moyen: number;
}
interface DashData {
  periode: { from: string; to: string };
  vide?: boolean;
  kpis: DashKpis;
  alertes: { stock_bas: number; food_cost_eleve: number; jours_inventaire: number | null };
  evolution: { semaine: string; ca: number; marge: number }[];
  top_produits: { nom: string; qte: number; ca: number; marge: number }[];
  ca_par_canal: { canal: string; total: number }[];
  ca_par_categorie: { categorie: string; total: number }[];
}

const fmt = (n: number) => (n ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 });
const fmtDT = (n: number) => `${fmt(n)} DT`;

const PALETTE = ['#4f46e5', '#0d9488', '#d97706', '#db2777', '#0891b2', '#65a30d', '#dc2626', '#7c3aed'];

type Status = 'good' | 'warn' | 'bad' | 'info' | 'neutral';
const STATUS: Record<Status, { c: string; bg: string; bd: string }> = {
  good: { c: '#059669', bg: '#ecfdf5', bd: '#a7f3d0' },
  warn: { c: '#d97706', bg: '#fffbeb', bd: '#fcd34d' },
  bad: { c: '#dc2626', bg: '#fef2f2', bd: '#fecaca' },
  info: { c: '#4f46e5', bg: '#eef2ff', bd: '#c7d2fe' },
  neutral: { c: '#475569', bg: 'var(--surface)', bd: 'var(--border)' },
};
const foodCostStatus = (p: number | null): Status => p == null ? 'neutral' : p < 30 ? 'good' : p <= 40 ? 'warn' : 'bad';
const pertesStatus = (pct: number | null): Status => pct == null ? 'neutral' : pct < 3 ? 'good' : pct <= 5 ? 'warn' : 'bad';

type Preset = 'mois' | '30j' | 'trimestre' | 'perso';

const periodForPreset = (preset: Preset): { from: string; to: string } => {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (preset === '30j') { const f = new Date(now); f.setDate(f.getDate() - 29); return { from: iso(f), to: iso(now) }; }
  if (preset === 'trimestre') { const f = new Date(now); f.setMonth(f.getMonth() - 2); f.setDate(1); return { from: iso(f), to: iso(now) }; }
  const f = new Date(now.getFullYear(), now.getMonth(), 1);
  const t = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: iso(f), to: iso(t) };
};

function KpiCard({ label, value, sub, status = 'neutral', subColor, help }: { label: string; value: string; sub?: string; status?: Status; subColor?: string; help?: string }) {
  const s = STATUS[status];
  return (
    <div style={{ background: s.bg, border: `1px solid ${s.bd}`, borderLeft: `4px solid ${s.c}`, borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          {label}
          {help && <HelpButton section={help} size={14} tip="Comprendre cet indicateur" />}
        </span>
        {status !== 'neutral' && status !== 'info' && <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.c }} />}
      </div>
      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: status === 'neutral' ? 'var(--text)' : s.c, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.74rem', color: subColor || 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function AlertRow({ icon, text, action, to, color }: { icon: string; text: string; action: string; to: string; color: 'red' | 'amber' | 'blue' }) {
  const c = color === 'red' ? { bg: '#fef2f2', fg: '#dc2626', bd: '#fecaca' } : color === 'amber' ? { bg: '#fffbeb', fg: '#b45309', bd: '#fcd34d' } : { bg: '#eff6ff', fg: '#1d4ed8', bd: '#bfdbfe' };
  return (
    <Link to={to} style={{ textDecoration: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: c.bg, border: `1px solid ${c.bd}`, borderRadius: 10, padding: '9px 13px' }}>
        <span style={{ fontSize: '0.84rem', color: c.fg, fontWeight: 600 }}>{icon} {text}</span>
        <span style={{ fontSize: '0.78rem', color: c.fg, fontWeight: 700, whiteSpace: 'nowrap' }}>{action} →</span>
      </div>
    </Link>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 18px' }}>
      <div style={{ fontSize: '0.92rem', fontWeight: 700, marginBottom: 12, color: 'var(--text)' }}>{title}</div>
      {children}
    </div>
  );
}

export default function ClientDashboard() {
  const [activites, setActivites] = useState<Activite[]>([]);
  const [activiteId, setActiviteId] = useState<string>('');
  const [preset, setPreset] = useState<Preset>('mois');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/entreprise/activites').then(({ data }) => setActivites(data as Activite[])).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const range = preset === 'perso' && customFrom && customTo ? { from: customFrom, to: customTo } : periodForPreset(preset);
    const params = new URLSearchParams({ from: range.from, to: range.to });
    if (activiteId) params.set('activiteId', activiteId);
    api.get(`/api/dashboard/client?${params}`)
      .then(({ data }) => setData(data as DashData))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [preset, customFrom, customTo, activiteId]);

  useEffect(() => { load(); }, [load]);

  const presets: { key: Preset; label: string }[] = [
    { key: 'mois', label: 'Mois en cours' }, { key: '30j', label: '30 jours' },
    { key: 'trimestre', label: 'Trimestre' }, { key: 'perso', label: 'Personnalisé' },
  ];

  const k = data?.kpis;
  const canalData = (data?.ca_par_canal || []).map(c => ({ name: c.canal, value: c.total }));
  const catData = (data?.ca_par_categorie || []).map(c => ({ name: c.categorie, value: c.total }));

  return (
    <div className="page">
      <div style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 55%, #4338ca 100%)', borderRadius: 18, padding: '22px 26px', marginBottom: 20, boxShadow: '0 8px 28px rgba(49,46,129,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
        <div>
          <h1 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: 9 }}>
            📊 Tableau de bord
            <HelpButton section="rapports" variant="solid" size={20} tip="Comment lire le tableau de bord ?" />
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.82rem', margin: '4px 0 0' }}>Vue d'ensemble de votre activité</p>
        </div>
        {data?.periode && <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.8)', background: 'rgba(255,255,255,0.12)', borderRadius: 10, padding: '8px 14px' }}>{data.periode.from.split('-').reverse().join('/')} → {data.periode.to.split('-').reverse().join('/')}</div>}
      </div>

      <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', padding: '10px 14px', marginBottom: 20, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Période</span>
        {presets.map(p => (
          <button key={p.key} onClick={() => setPreset(p.key)}
            style={{ fontSize: '0.78rem', padding: '5px 11px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, border: `1px solid ${preset === p.key ? '#4338ca' : 'var(--border)'}`, background: preset === p.key ? '#eef2ff' : 'var(--bg)', color: preset === p.key ? '#3730a3' : 'var(--text)' }}>{p.label}</button>
        ))}
        {preset === 'perso' && (
          <>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ fontSize: '0.78rem', padding: '5px 8px', borderRadius: 8, border: '1px solid var(--border)' }} />
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ fontSize: '0.78rem', padding: '5px 8px', borderRadius: 8, border: '1px solid var(--border)' }} />
          </>
        )}
        <span style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />
        {activites.length > 1 && (
          <select value={activiteId} onChange={e => setActiviteId(e.target.value)} style={{ fontSize: '0.78rem', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)' }}>
            <option value="">Toutes activités</option>
            {activites.map(a => <option key={a.id} value={a.id}>{a.nom}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <div className="loading-text">Chargement…</div>
      ) : !data || data.vide ? (
        <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-muted)' }}>Aucune donnée disponible pour cette période.</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
            <KpiCard label="Chiffre d'affaires" help="saisie-ventes" value={fmtDT(k!.ca)} status={k!.ca_delta_pct == null ? 'info' : k!.ca_delta_pct >= 0 ? 'good' : 'bad'} sub={k!.ca_delta_pct != null ? `${k!.ca_delta_pct >= 0 ? '▲' : '▼'} ${Math.abs(k!.ca_delta_pct)}% vs période préc.` : undefined} subColor={k!.ca_delta_pct != null && k!.ca_delta_pct >= 0 ? '#059669' : '#dc2626'} />
            <KpiCard label="Food cost" help="fiches-techniques" value={k!.food_cost_pct != null ? `${k!.food_cost_pct}%` : '—'} status={foodCostStatus(k!.food_cost_pct)} sub={k!.food_cost_pct != null ? (k!.food_cost_pct < 30 ? 'sain' : k!.food_cost_pct <= 40 ? 'à surveiller (cible <30%)' : 'élevé — revoir les prix') : undefined} />
            <KpiCard label="Marge brute" help="fiches-techniques" value={fmtDT(k!.marge)} status={(k!.taux_marge_pct ?? 0) >= 50 ? 'good' : 'neutral'} sub={k!.taux_marge_pct != null ? `taux ${k!.taux_marge_pct}%` : undefined} />
            <KpiCard label="Valeur du stock" help="stock-activites" value={fmtDT(k!.valeur_stock)} status="info" />
            <KpiCard label="Pertes" help="pertes" value={fmtDT(k!.pertes)} status={pertesStatus(k!.pertes_pct_ca)} sub={k!.pertes_pct_ca != null ? `${k!.pertes_pct_ca}% du CA` : undefined} />
            <KpiCard label="Panier moyen" help="rapports-vente" value={`${k!.panier_moyen.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} DT`} sub={`${k!.nb_ventes} vente${k!.nb_ventes > 1 ? 's' : ''}`} />
          </div>

          {(data.alertes.stock_bas > 0 || data.alertes.food_cost_eleve > 0 || (data.alertes.jours_inventaire ?? 99) > 14) && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 18px', marginBottom: 20 }}>
              <div style={{ fontSize: '0.92rem', fontWeight: 700, marginBottom: 10 }}>🔔 Alertes & actions</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.alertes.stock_bas > 0 && <AlertRow icon="📦" text={`${data.alertes.stock_bas} article${data.alertes.stock_bas > 1 ? 's' : ''} sous le seuil minimum`} action="Réapprovisionner" to="/client/stock?section=activite" color="red" />}
                {data.alertes.food_cost_eleve > 0 && <AlertRow icon="📈" text={`${data.alertes.food_cost_eleve} produit${data.alertes.food_cost_eleve > 1 ? 's' : ''} avec food cost > 40%`} action="Voir le rapport" to="/client/rapports" color="amber" />}
                {(data.alertes.jours_inventaire == null || data.alertes.jours_inventaire > 14) && <AlertRow icon="📋" text={data.alertes.jours_inventaire == null ? 'Aucun inventaire enregistré' : `Dernier inventaire il y a ${data.alertes.jours_inventaire} jours`} action="Lancer un inventaire" to="/client/inventaire?section=activite" color="blue" />}
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
            <ChartCard title="CA & marge — évolution">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={data.evolution.map(e => ({ name: e.semaine.slice(5), CA: e.ca, Marge: e.marge }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <Tooltip formatter={(value) => fmtDT(Number(value))} />
                  <Line type="monotone" dataKey="CA" stroke="#4f46e5" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="Marge" stroke="#0d9488" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Répartition du CA par catégorie">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={catData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={80} paddingAngle={2}>
                    {catData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  </Pie>
                  <Tooltip formatter={(value) => fmtDT(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Top produits (CA)">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.top_produits.slice(0, 6).map(p => ({ name: p.nom, CA: p.ca }))} layout="vertical" margin={{ left: 10, right: 10 }}>
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
                  <Tooltip formatter={(value) => fmtDT(Number(value))} />
                  <Bar dataKey="CA" fill="#4f46e5" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="CA par canal">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={canalData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={80} paddingAngle={2}>
                    {canalData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  </Pie>
                  <Tooltip formatter={(value) => fmtDT(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Liens vers les rapports détaillés */}
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Rapports détaillés</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <Link to="/client/rapports?scope=activite" style={{ textDecoration: 'none' }}>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '1.3rem' }}>📍</span>
                  <div><div style={{ fontWeight: 700, color: 'var(--text)' }}>Rapport activités</div><div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Pertes, coût matière, appros, stock</div></div>
                </div>
              </Link>
              <Link to="/client/ventes/rapport" style={{ textDecoration: 'none' }}>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '1.3rem' }}>🛒</span>
                  <div><div style={{ fontWeight: 700, color: 'var(--text)' }}>Rapport ventes</div><div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>CA, food cost, top produits, canaux</div></div>
                </div>
              </Link>
              <Link to="/client/rapports/labo" style={{ textDecoration: 'none' }}>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '1.3rem' }}>🏭</span>
                  <div><div style={{ fontWeight: 700, color: 'var(--text)' }}>Rapport labo</div><div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Stock, appros, pertes, transferts</div></div>
                </div>
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
