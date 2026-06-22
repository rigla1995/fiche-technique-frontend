import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import api from '../../api/client';
import HelpButton from '../common/HelpButton';
import type { Labo } from '../../types';

interface LaboDash {
  periode: { from: string; to: string };
  kpis: { valeur_stock: number; appros: number; nb_appros: number; pertes: number; transferts: number; nb_transferts: number };
  top_transferts: { nom: string; qte: number; valeur: number }[];
  transferts_par_activite: { activite: string; valeur: number }[];
}

const fmtDT = (n: number) => `${(n ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} DT`;
const PALETTE = ['#7c3aed', '#0d9488', '#d97706', '#db2777', '#0891b2', '#65a30d'];
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
  info: { c: '#7c3aed', bg: '#f5f3ff', bd: '#ddd6fe' },
  neutral: { c: '#475569', bg: 'var(--surface)', bd: 'var(--border)' },
};
function Kpi({ label, value, sub, status = 'neutral', help }: { label: string; value: string; sub?: string; status?: Status; help?: string }) {
  const s = STATUS[status];
  return (
    <div style={{ background: s.bg, border: `1px solid ${s.bd}`, borderLeft: `4px solid ${s.c}`, borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>{label}{help && <HelpButton section={help} size={14} tip="Comprendre cet indicateur" />}</span>
        {(status === 'warn' || status === 'bad' || status === 'good') && <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.c }} />}
      </div>
      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: status === 'neutral' ? 'var(--text)' : s.c, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function RapportLaboPage() {
  const [searchParams] = useSearchParams();
  const [labos, setLabos] = useState<Labo[]>([]);
  const [laboId, setLaboId] = useState<string>(searchParams.get('laboId') || '');
  const [preset, setPreset] = useState<Preset>('mois');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [data, setData] = useState<LaboDash | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/labo').then(({ data }) => {
      const ls = data as Labo[];
      setLabos(ls);
      if (!laboId && ls.length > 0) setLaboId(String(ls[0].id));
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(() => {
    if (!laboId) return;
    setLoading(true);
    const range = preset === 'perso' && customFrom && customTo ? { from: customFrom, to: customTo } : periodForPreset(preset);
    const params = new URLSearchParams({ laboId, from: range.from, to: range.to });
    api.get(`/api/dashboard/labo?${params}`).then(({ data }) => setData(data as LaboDash)).catch(() => setData(null)).finally(() => setLoading(false));
  }, [laboId, preset, customFrom, customTo]);
  useEffect(() => { load(); }, [load]);

  const presets: { key: Preset; label: string }[] = [
    { key: 'mois', label: 'Mois en cours' }, { key: '30j', label: '30 jours' },
    { key: 'trimestre', label: 'Trimestre' }, { key: 'perso', label: 'Personnalisé' },
  ];
  const parActivite = (data?.transferts_par_activite || []).map(t => ({ name: t.activite, value: t.valeur }));

  return (
    <div className="page">
      <div style={{ background: 'linear-gradient(135deg, #3b0764 0%, #6b21a8 55%, #7e22ce 100%)', borderRadius: 18, padding: '22px 26px', marginBottom: 20, boxShadow: '0 8px 28px rgba(107,33,168,0.3)' }}>
        <h1 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: 9 }}>🏭 Rapport labo<HelpButton section="stock-labo" variant="solid" size={20} tip="Comment lire ce rapport ?" /></h1>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.82rem', margin: '4px 0 0' }}>Stock, approvisionnements, pertes et transferts du labo</p>
      </div>

      <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', padding: '10px 14px', marginBottom: 20, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        {labos.length > 1 && (
          <select value={laboId} onChange={e => setLaboId(e.target.value)} style={{ fontSize: '0.78rem', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)' }}>
            {labos.map(l => <option key={l.id} value={l.id}>{l.nom}</option>)}
          </select>
        )}
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Période</span>
        {presets.map(p => (
          <button key={p.key} onClick={() => setPreset(p.key)}
            style={{ fontSize: '0.78rem', padding: '5px 11px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, border: `1px solid ${preset === p.key ? '#7e22ce' : 'var(--border)'}`, background: preset === p.key ? '#f5f3ff' : 'var(--bg)', color: preset === p.key ? '#6b21a8' : 'var(--text)' }}>{p.label}</button>
        ))}
        {preset === 'perso' && (
          <>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ fontSize: '0.78rem', padding: '5px 8px', borderRadius: 8, border: '1px solid var(--border)' }} />
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ fontSize: '0.78rem', padding: '5px 8px', borderRadius: 8, border: '1px solid var(--border)' }} />
          </>
        )}
      </div>

      {loading ? <div className="loading-text">Chargement…</div> : !data ? (
        <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-muted)' }}>Aucune donnée pour ce labo / cette période.</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
            <Kpi label="Valeur du stock" help="stock-labo" value={fmtDT(data.kpis.valeur_stock)} status="info" />
            <Kpi label="Approvisionnements" help="factures" value={fmtDT(data.kpis.appros)} status="neutral" sub={`${data.kpis.nb_appros} entrée${data.kpis.nb_appros > 1 ? 's' : ''}`} />
            <Kpi label="Pertes" help="pertes" value={fmtDT(data.kpis.pertes)} status={data.kpis.pertes > 0 ? 'bad' : 'good'} />
            <Kpi label="Transferts émis" help="transferts" value={fmtDT(data.kpis.transferts)} status="info" sub={`${data.kpis.nb_transferts} transfert${data.kpis.nb_transferts > 1 ? 's' : ''}`} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 18px' }}>
              <div style={{ fontSize: '0.92rem', fontWeight: 700, marginBottom: 12 }}>Top articles transférés</div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.top_transferts.slice(0, 6).map(t => ({ name: t.nom, Valeur: t.valeur }))} layout="vertical" margin={{ left: 10, right: 10 }}>
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
                  <Tooltip formatter={(value) => fmtDT(Number(value))} />
                  <Bar dataKey="Valeur" fill="#7c3aed" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 18px' }}>
              <div style={{ fontSize: '0.92rem', fontWeight: 700, marginBottom: 12 }}>Transferts par activité</div>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={parActivite} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={80} paddingAngle={2}>
                    {parActivite.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  </Pie>
                  <Tooltip formatter={(value) => fmtDT(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
