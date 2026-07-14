import { useMemo, useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, Line, Bar, BarChart, XAxis, YAxis,
  Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend,
} from 'recharts';

// ─────────────────────────────────────────────────────────────────────────────
// Widgets du Tableau de bord v2 — KPIs à deltas, cascade de marge, graphiques,
// tableaux triables. Tous les montants sont TTC (DT).
// ─────────────────────────────────────────────────────────────────────────────

export const PALETTE = ['#2563eb', '#16a34a', '#f59e0b', '#8b5cf6', '#ef4444', '#0d9488', '#ec4899', '#6366f1', '#84cc16', '#f97316'];

export const fmtDT = (n: number | null | undefined, dec = 0) =>
  n == null ? '—' : `${n.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec })} DT`;
export const fmtNum = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });

// ── Types des réponses API ────────────────────────────────────────────────────
export interface Kpis {
  ca: number; cout_matiere: number; commissions: number; charges: number;
  marge_brute: number; marge_apres_com: number; marge_nette: number;
  food_cost_pct: number | null; taux_marge_pct: number | null; taux_marge_nette_pct: number | null;
  nb_ventes: number; panier_moyen: number; pertes: number; pertes_pct_ca: number | null;
  valeur_stock?: number;
  deltas: Record<string, number | null>;
}
export interface LigneAgg {
  ca: number; cout: number; commissions: number; qte: number;
  marge_brute: number; marge_apres_com: number; food_cost_pct: number | null;
}
export interface ProduitLigne extends LigneAgg { nom: string; type: string; part_ca_pct: number }

// ── Delta (évolution vs période précédente) ──────────────────────────────────
export function Delta({ value, inverse = false, suffix = '%' }: { value: number | null | undefined; inverse?: boolean; suffix?: string }) {
  if (value == null) return <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>—</span>;
  const good = inverse ? value <= 0 : value >= 0;
  return (
    <span style={{
      fontSize: '0.68rem', fontWeight: 800, padding: '2px 7px', borderRadius: 20,
      background: good ? '#dcfce7' : '#fee2e2', color: good ? '#15803d' : '#b91c1c',
    }}>
      {value > 0 ? '▲' : value < 0 ? '▼' : '＝'} {Math.abs(value).toLocaleString('fr-FR')}{suffix}
    </span>
  );
}

export function KpiCard({ icon, label, value, sub, delta, inverse, accent = '#2563eb' }: {
  icon: string; label: string; value: string; sub?: string;
  delta?: number | null; inverse?: boolean; accent?: string;
}) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{icon} {label}</span>
        {delta !== undefined && <Delta value={delta} inverse={inverse} />}
      </div>
      <div style={{ fontSize: '1.35rem', fontWeight: 900, color: accent, marginTop: 6, lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

export function ChartCard({ title, children, height = 270, action }: {
  title: string; children: React.ReactNode; height?: number | 'auto'; action?: React.ReactNode;
}) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1e293b' }}>{title}</div>
        {action}
      </div>
      <div style={height === 'auto' ? undefined : { height }}>{children}</div>
    </div>
  );
}

export function EmptyHint({ text = 'Aucune donnée sur la période et les filtres choisis.' }: { text?: string }) {
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 80, color: '#94a3b8', fontSize: '0.82rem' }}>{text}</div>;
}

// ── Libellés des buckets temporels ───────────────────────────────────────────
export const fmtBucket = (bucket: string, grain: string) => {
  const d = new Date(bucket + 'T00:00:00Z');
  if (grain === 'month') return d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
  if (grain === 'week') return `S. ${d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}`;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
};

// ── Évolution CA / marges ────────────────────────────────────────────────────
export function EvolutionChart({ data, grain }: { data: { bucket: string; ca: number; marge: number; marge_apres_com: number }[]; grain: string }) {
  if (!data.length) return <EmptyHint />;
  const rows = data.map((d) => ({ ...d, label: fmtBucket(d.bucket, grain) }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v) => fmtDT(Number(v))} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="ca" name="CA" fill="#2563eb" radius={[5, 5, 0, 0]} fillOpacity={0.85} />
        <Line dataKey="marge" name="Marge brute" stroke="#16a34a" strokeWidth={2.5} dot={false} />
        <Line dataKey="marge_apres_com" name="Après commissions" stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="6 3" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ── Cascade de la marge (CA → coût → commissions → charges → nette) ─────────
export function WaterfallChart({ data }: { data?: { ca: number; cout_matiere: number; commissions: number; charges: number; marge_nette: number } }) {
  if (!data || !data.ca) return <EmptyHint />;
  let running = data.ca;
  const steps = [{ name: 'CA', base: 0, val: data.ca, color: '#2563eb' }];
  for (const [name, montant, color] of [
    ['Coût matière', data.cout_matiere, '#ef4444'],
    ['Commissions', data.commissions, '#f59e0b'],
    ['Charges fixes', data.charges, '#8b5cf6'],
  ] as [string, number, string][]) {
    steps.push({ name, base: running - montant, val: montant, color });
    running -= montant;
  }
  steps.push({ name: 'Marge nette', base: Math.min(0, running), val: Math.abs(running), color: running >= 0 ? '#16a34a' : '#b91c1c' });
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={steps} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="name" tick={{ fontSize: 10.5 }} interval={0} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v, n) => (String(n) === 'base' ? '' : fmtDT(Number(v)))} />
        <Bar dataKey="base" stackId="w" fill="transparent" />
        <Bar dataKey="val" stackId="w" radius={[5, 5, 0, 0]}>
          {steps.map((s, i) => <Cell key={i} fill={s.color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Histogramme temporel simple (achats, pertes…) ───────────────────────────
export function TimeBarChart({ data, grain, color = '#2563eb' }: { data: { bucket: string; valeur: number }[]; grain: string; color?: string }) {
  if (!data.length) return <EmptyHint />;
  const rows = data.map((d) => ({ ...d, label: fmtBucket(d.bucket, grain) }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v) => fmtDT(Number(v))} />
        <Bar dataKey="valeur" fill={color} radius={[5, 5, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Camembert générique ──────────────────────────────────────────────────────
// formatter : rendu de la valeur au survol — défaut monétaire (DT) ; passer un
// formateur numérique pour des comptes (ex. nombre de commandes).
export function DonutChart({ data, nameKey, valueKey = 'valeur', formatter }: {
  data: Record<string, unknown>[]; nameKey: string; valueKey?: string; formatter?: (v: number) => string;
}) {
  if (!data.length) return <EmptyHint />;
  const fmt = formatter ?? ((v: number) => fmtDT(v));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey={valueKey} nameKey={nameKey} innerRadius="52%" outerRadius="80%" paddingAngle={2}>
          {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
        </Pie>
        <Tooltip formatter={(v) => fmt(Number(v))} />
        <Legend wrapperStyle={{ fontSize: 11.5 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ── Liste à barres horizontales proportionnelles ─────────────────────────────
export function HBarList({ rows, labelKey, valueKey = 'valeur', color = '#2563eb', suffix, max = 10 }: {
  rows: Record<string, unknown>[]; labelKey: string; valueKey?: string; color?: string; suffix?: (r: Record<string, unknown>) => string; max?: number;
}) {
  const list = rows.slice(0, max);
  if (!list.length) return <EmptyHint />;
  const top = Math.max(...list.map((r) => Number(r[valueKey]) || 0), 1);
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {list.map((r, i) => {
        const v = Number(r[valueKey]) || 0;
        return (
          <div key={i}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.78rem', marginBottom: 3 }}>
              <span style={{ color: '#334155', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(r[labelKey])}</span>
              <span style={{ color: '#1e293b', fontWeight: 800, flexShrink: 0 }}>{fmtDT(v)}{suffix ? ` ${suffix(r)}` : ''}</span>
            </div>
            <div style={{ height: 7, borderRadius: 5, background: '#f1f5f9', overflow: 'hidden' }}>
              <div style={{ width: `${(v / top) * 100}%`, height: '100%', borderRadius: 5, background: color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Tableau triable générique ────────────────────────────────────────────────
export interface ColonneDef<T> {
  key: keyof T & string;
  label: string;
  align?: 'left' | 'right';
  fmt?: (v: unknown, row: T) => React.ReactNode;
}

export function SortableTable<T extends Record<string, unknown>>({ rows, colonnes, defaultSort, maxHeight = 420 }: {
  rows: T[]; colonnes: ColonneDef<T>[]; defaultSort: string; maxHeight?: number;
}) {
  const [sortKey, setSortKey] = useState(defaultSort);
  const [dir, setDir] = useState<'desc' | 'asc'>('desc');
  const sorted = useMemo(() => {
    const s = [...rows].sort((a, b) => {
      const va = a[sortKey]; const vb = b[sortKey];
      if (typeof va === 'number' && typeof vb === 'number') return dir === 'desc' ? vb - va : va - vb;
      return dir === 'desc' ? String(vb).localeCompare(String(va)) : String(va).localeCompare(String(vb));
    });
    return s;
  }, [rows, sortKey, dir]);
  if (!rows.length) return <EmptyHint />;
  return (
    <div style={{ overflowX: 'auto', maxHeight, overflowY: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.8rem' }}>
        <thead>
          <tr>
            {colonnes.map((c) => (
              <th
                key={c.key}
                onClick={() => { if (sortKey === c.key) setDir(dir === 'desc' ? 'asc' : 'desc'); else { setSortKey(c.key); setDir('desc'); } }}
                style={{
                  position: 'sticky', top: 0, background: '#f8fafc', cursor: 'pointer', userSelect: 'none',
                  textAlign: c.align ?? 'right', padding: '8px 10px', borderBottom: '2px solid #e2e8f0',
                  color: sortKey === c.key ? '#2563eb' : '#334155', fontWeight: 800, whiteSpace: 'nowrap',
                }}
              >
                {c.label}{sortKey === c.key ? (dir === 'desc' ? ' ↓' : ' ↑') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={i} style={{ background: i % 2 ? '#fcfdfe' : '#fff' }}>
              {colonnes.map((c) => (
                <td key={c.key} style={{ padding: '7px 10px', borderBottom: '1px solid #f1f5f9', textAlign: c.align ?? 'right', color: '#475569', whiteSpace: 'nowrap' }}>
                  {c.fmt ? c.fmt(r[c.key], r) : String(r[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Badges partagés ──────────────────────────────────────────────────────────
export const TYPE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  produit: { label: 'Produit', color: '#2563eb', bg: '#eff6ff' },
  supplement: { label: 'Supplément', color: '#b45309', bg: '#fef3c7' },
  valorise: { label: 'Valorisé', color: '#7c3aed', bg: '#f3e8ff' },
};

export function TypeBadge({ type }: { type: string }) {
  const t = TYPE_LABELS[type] ?? { label: type, color: '#64748b', bg: '#f1f5f9' };
  return <span style={{ fontSize: '0.66rem', fontWeight: 800, color: t.color, background: t.bg, borderRadius: 20, padding: '2px 8px' }}>{t.label}</span>;
}

export function FoodCostBadge({ pct }: { pct: number | null }) {
  if (pct == null) return <span style={{ color: '#94a3b8' }}>—</span>;
  const color = pct < 30 ? '#16a34a' : pct <= 40 ? '#d97706' : '#dc2626';
  return <span style={{ fontWeight: 800, color }}>{pct}%</span>;
}
