import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
  LineChart, Line, CartesianGrid, Legend,
} from 'recharts';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';

// ── Types ────────────────────────────────────────────────────────────────────

interface FilterOptions {
  categories: { id: number; nom: string }[];
  fournisseurs: { id: number; nom: string }[];
  activites: { id: number; nom: string }[];
}

const CHART_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#84cc16'];

const fmt = (n: number | string | null | undefined, d = 2) =>
  n == null || n === '' ? '—' : parseFloat(String(n)).toFixed(d).replace(/\.?0+$/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';
const fmtMois = (m: unknown) => {
  const s = String(m ?? '');
  const [y, mo] = s.split('-');
  return new Date(parseInt(y), parseInt(mo) - 1, 1).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
};

// ── Shared components ────────────────────────────────────────────────────────

const KpiCard = ({ label, value, sub, color = '#6366f1' }: { label: string; value: string; sub?: string; color?: string }) => (
  <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', padding: '16px 20px', flex: 1, minWidth: 140 }}>
    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
  </div>
);

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h3 style={{ fontSize: 13, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '24px 0 12px' }}>{children}</h3>
);

const EmptyState = ({ label }: { label: string }) => (
  <div style={{ padding: '48px 0', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>{label}</div>
);

const FilterRow = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20, padding: '16px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e5e7eb' }}>
    {children}
  </div>
);

const FilterLabel = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140 }}>
    <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
    {children}
  </div>
);

const inputStyle: React.CSSProperties = { padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, background: '#fff', color: '#111827' };

async function downloadExcel(rows: Record<string, unknown>[], sheetName: string, filename: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  if (rows.length > 0) {
    ws.addRow(Object.keys(rows[0]));
    rows.forEach(r => ws.addRow(Object.values(r)));
    ws.getRow(1).font = { bold: true };
  }
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const ExportButtons = ({ onExcel, onPdf, loading }: { onExcel: () => void; onPdf: () => void; loading?: boolean }) => (
  <div style={{ display: 'flex', gap: 8 }}>
    <button onClick={onExcel} disabled={loading}
      style={{ padding: '7px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
      📊 Excel
    </button>
    <button onClick={onPdf} disabled={loading}
      style={{ padding: '7px 14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
      📄 PDF
    </button>
  </div>
);

const ChartBox = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 20px' }}>
    <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 14 }}>{title}</div>
    {children}
  </div>
);

// ── RAPPORT PERTES ───────────────────────────────────────────────────────────

function RapportPertes({ filters }: { filters: FilterOptions }) {
  const { user } = useAuth();
  const isEntreprise = true;
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10); });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [categorieId, setCategorieId] = useState('');
  const [activiteId, setActiviteId] = useState('');
  const [data, setData] = useState<{ rows: Record<string, unknown>[]; byCategorie: { categorie: string; valeur: number }[]; byType: { type: string; valeur: number }[]; byMois: { mois: string; valeur: number }[] } | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (categorieId) params.set('categorieId', categorieId);
      if (activiteId) params.set('activiteId', activiteId);
      const res = await api.get(`/api/rapports/pertes?${params}`);
      setData(res.data);
    } finally { setLoading(false); }
  }, [dateFrom, dateTo, categorieId, activiteId]);

  useEffect(() => { load(); }, [load]);

  const rows = data?.rows ?? [];
  const totalValeur = rows.reduce((s, r) => s + parseFloat(String(r.valeur ?? 0)), 0);
  const totalQte = rows.length;

  const exportExcel = () => {
    downloadExcel(rows.map((r) => ({
      'Ingrédient': r.ingredient_nom, 'Catégorie': r.categorie, 'Unité': r.unite,
      'Activité': r.activite_nom || '—', 'Type': r.type_perte, 'Date': fmtDate(r.date_perte as string),
      'Quantité': r.quantite, 'Prix unit. (DT)': r.prix_unitaire, 'Valeur (DT)': fmt(r.valeur as number),
    })), 'Pertes', `rapport-pertes-${dateFrom}-${dateTo}.xlsx`);
  };

  const exportPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(16); doc.text('Rapport Pertes', 14, 18);
    doc.setFontSize(10); doc.setTextColor(100); doc.text(`Période : ${fmtDate(dateFrom)} — ${fmtDate(dateTo)}`, 14, 26);
    autoTable(doc, {
      startY: 32,
      head: [['Ingrédient', 'Catégorie', 'Unité', 'Type', 'Date', 'Qté', 'Valeur (DT)']],
      body: rows.map((r) => [r.ingredient_nom, r.categorie, r.unite, r.type_perte, fmtDate(r.date_perte as string), fmt(r.quantite as number), fmt(r.valeur as number)]) as RowInput[],
      styles: { fontSize: 9 }, headStyles: { fillColor: [99, 102, 241] },
      foot: [['', '', '', '', 'TOTAL', totalQte + ' lignes', fmt(totalValeur) + ' DT']],
    });
    doc.save(`rapport-pertes-${dateFrom}-${dateTo}.pdf`);
  };

  return (
    <div>
      <FilterRow>
        <FilterLabel label="Du"><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inputStyle} /></FilterLabel>
        <FilterLabel label="Au"><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inputStyle} /></FilterLabel>
        <FilterLabel label="Catégorie">
          <select value={categorieId} onChange={(e) => setCategorieId(e.target.value)} style={inputStyle}>
            <option value="">Toutes</option>
            {filters.categories.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </FilterLabel>
        {isEntreprise && (
          <FilterLabel label="Activité">
            <select value={activiteId} onChange={(e) => setActiviteId(e.target.value)} style={inputStyle}>
              <option value="">Toutes</option>
              {filters.activites.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
            </select>
          </FilterLabel>
        )}
        <div style={{ alignSelf: 'flex-end', marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <ExportButtons onExcel={exportExcel} onPdf={exportPdf} loading={rows.length === 0} />
        </div>
      </FilterRow>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <KpiCard label="Valeur totale pertes" value={`${fmt(totalValeur)} DT`} color="#ef4444" />
        <KpiCard label="Nb de lignes" value={String(rows.length)} color="#f59e0b" />
        <KpiCard label="Types distincts" value={String(new Set(rows.map((r) => r.type_perte)).size)} />
        {data?.byCategorie?.[0] && <KpiCard label="Catégorie #1" value={data.byCategorie[0].categorie} sub={`${fmt(data.byCategorie[0].valeur)} DT`} color="#8b5cf6" />}
      </div>

      {loading && <div style={{ textAlign: 'center', color: '#9ca3af', padding: 24 }}>Chargement...</div>}
      {!loading && rows.length === 0 && <EmptyState label="Aucune perte sur cette période." />}

      {!loading && rows.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 20 }}>
            {data?.byType && data.byType.length > 0 && (
              <ChartBox title="Répartition par type">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={data.byType} dataKey="valeur" nameKey="type" cx="50%" cy="50%" outerRadius={70} label={((props: {type?: unknown; pct?: unknown}) => `${props.type} ${props.pct ? props.pct + '%' : ''}`) as unknown as boolean}>
                      {data.byType.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: unknown) => [`${fmt(v as number)} DT`, 'Valeur']} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </ChartBox>
            )}
            {data?.byCategorie && data.byCategorie.length > 0 && (
              <ChartBox title="Valeur par catégorie">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.byCategorie.slice(0, 8)} layout="vertical" margin={{ left: 20, right: 10 }}>
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v} DT`} />
                    <YAxis type="category" dataKey="categorie" tick={{ fontSize: 10 }} width={90} />
                    <Tooltip formatter={(v: unknown) => [`${fmt(v as number)} DT`, 'Valeur']} />
                    <Bar dataKey="valeur" fill="#ef4444" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartBox>
            )}
            {data?.byMois && data.byMois.length > 1 && (
              <ChartBox title="Évolution mensuelle">
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={data.byMois}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="mois" tick={{ fontSize: 10 }} tickFormatter={fmtMois} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v} DT`} />
                    <Tooltip formatter={(v: unknown) => [`${fmt(v as number)} DT`, 'Valeur']} labelFormatter={fmtMois} />
                    <Line type="monotone" dataKey="valeur" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartBox>
            )}
          </div>

          <SectionTitle>Détail ({rows.length} lignes)</SectionTitle>
          <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['Ingrédient', 'Catégorie', 'Unité', isEntreprise ? 'Activité' : null, 'Type', 'Date', 'Quantité', 'Prix unit. (DT)', 'Valeur (DT)']
                    .filter(Boolean).map((h) => (
                      <th key={h!} style={{ padding: '9px 12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb', fontWeight: 600, color: '#374151', fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px 12px', color: '#111827', fontWeight: 500 }}>{r.ingredient_nom as string}</td>
                    <td style={{ padding: '8px 12px', color: '#6b7280' }}>{r.categorie as string}</td>
                    <td style={{ padding: '8px 12px', color: '#6b7280' }}>{r.unite as string}</td>
                    {isEntreprise && <td style={{ padding: '8px 12px', color: '#6b7280' }}>{r.activite_nom as string || '—'}</td>}
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: r.type_perte === 'avarie' ? '#fee2e2' : '#fef9c3', color: r.type_perte === 'avarie' ? '#991b1b' : '#854d0e' }}>{r.type_perte as string}</span>
                    </td>
                    <td style={{ padding: '8px 12px', color: '#374151', whiteSpace: 'nowrap' }}>{fmtDate(r.date_perte as string)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#374151' }}>{fmt(r.quantite as number)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#374151' }}>{fmt(r.prix_unitaire as number)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#ef4444' }}>{fmt(r.valeur as number)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f9fafb', fontWeight: 700 }}>
                  <td colSpan={isEntreprise ? 6 : 5} style={{ padding: '9px 12px', fontSize: 12, color: '#374151' }}>TOTAL</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontSize: 12 }}>{rows.length} lignes</td>
                  <td />
                  <td style={{ padding: '9px 12px', textAlign: 'right', color: '#ef4444' }}>{fmt(totalValeur)} DT</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── RAPPORT COÛT MATIÈRE ─────────────────────────────────────────────────────

function RapportCoutMatiere({ filters }: { filters: FilterOptions }) {
  const { user } = useAuth();
  const isEntreprise = true;
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10); });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [categorieId, setCategorieId] = useState('');
  const [activiteId, setActiviteId] = useState('');
  const [data, setData] = useState<{ rows: Record<string, unknown>[]; byCategorie: { categorie: string; cout_total: number }[]; byMois: { mois: string; cout: number }[]; total: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (categorieId) params.set('categorieId', categorieId);
      if (activiteId) params.set('activiteId', activiteId);
      const res = await api.get(`/api/rapports/cout-matiere?${params}`);
      setData(res.data);
    } finally { setLoading(false); }
  }, [dateFrom, dateTo, categorieId, activiteId]);

  useEffect(() => { load(); }, [load]);

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  const exportExcel = () => {
    downloadExcel(rows.map((r) => ({
      'Ingrédient': r.ingredient_nom, 'Catégorie': r.categorie, 'Unité': r.unite,
      'Qté totale': fmt(r.quantite_totale as number), 'Prix moyen (DT)': fmt(r.prix_moyen as number),
      'Coût total (DT)': fmt(r.cout_total as number), '% du total': `${r.pct}%`,
    })), 'Coût Matière', `rapport-cout-matiere-${dateFrom}-${dateTo}.xlsx`);
  };

  const exportPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(16); doc.text('Rapport Coût Matière', 14, 18);
    doc.setFontSize(10); doc.setTextColor(100); doc.text(`Période : ${fmtDate(dateFrom)} — ${fmtDate(dateTo)}`, 14, 26);
    autoTable(doc, {
      startY: 32,
      head: [['Ingrédient', 'Catégorie', 'Unité', 'Qté', 'Prix moy.', 'Coût (DT)', '%']],
      body: rows.map((r) => [r.ingredient_nom, r.categorie, r.unite, fmt(r.quantite_totale as number), fmt(r.prix_moyen as number), fmt(r.cout_total as number), `${r.pct}%`]) as RowInput[],
      styles: { fontSize: 9 }, headStyles: { fillColor: [99, 102, 241] },
      foot: [['', '', '', '', '', fmt(total) + ' DT', '100%']],
    });
    doc.save(`rapport-cout-matiere-${dateFrom}-${dateTo}.pdf`);
  };

  return (
    <div>
      <FilterRow>
        <FilterLabel label="Du"><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inputStyle} /></FilterLabel>
        <FilterLabel label="Au"><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inputStyle} /></FilterLabel>
        <FilterLabel label="Catégorie">
          <select value={categorieId} onChange={(e) => setCategorieId(e.target.value)} style={inputStyle}>
            <option value="">Toutes</option>
            {filters.categories.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </FilterLabel>
        {isEntreprise && (
          <FilterLabel label="Activité">
            <select value={activiteId} onChange={(e) => setActiviteId(e.target.value)} style={inputStyle}>
              <option value="">Toutes</option>
              {filters.activites.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
            </select>
          </FilterLabel>
        )}
        <div style={{ alignSelf: 'flex-end', marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <ExportButtons onExcel={exportExcel} onPdf={exportPdf} loading={rows.length === 0} />
        </div>
      </FilterRow>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <KpiCard label="Coût total matière" value={`${fmt(total)} DT`} color="#6366f1" />
        <KpiCard label="Nb ingrédients" value={String(rows.length)} color="#f59e0b" />
        {rows[0] && <KpiCard label="Top ingrédient" value={rows[0].ingredient_nom as string} sub={`${fmt(rows[0].cout_total as number)} DT — ${rows[0].pct as number}%`} color="#8b5cf6" />}
        {data?.byCategorie?.[0] && <KpiCard label="Top catégorie" value={data.byCategorie[0].categorie} sub={`${fmt(data.byCategorie[0].cout_total)} DT`} color="#10b981" />}
      </div>

      {loading && <div style={{ textAlign: 'center', color: '#9ca3af', padding: 24 }}>Chargement...</div>}
      {!loading && rows.length === 0 && <EmptyState label="Aucun achat sur cette période." />}

      {!loading && rows.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 20 }}>
            {data?.byCategorie && data.byCategorie.length > 0 && (
              <ChartBox title="Coût par catégorie">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={data.byCategorie} dataKey="cout_total" nameKey="categorie" cx="50%" cy="50%" outerRadius={70}>
                      {data.byCategorie.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: unknown) => [`${fmt(v as number)} DT`, 'Coût']} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </ChartBox>
            )}
            <ChartBox title="Top 10 ingrédients par coût">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={rows.slice(0, 10)} layout="vertical" margin={{ left: 10, right: 10 }}>
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v} DT`} />
                  <YAxis type="category" dataKey="ingredient_nom" tick={{ fontSize: 9 }} width={90} />
                  <Tooltip formatter={(v: unknown) => [`${fmt(v as number)} DT`, 'Coût']} />
                  <Bar dataKey="cout_total" fill="#6366f1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartBox>
            {data?.byMois && data.byMois.length > 1 && (
              <ChartBox title="Évolution mensuelle">
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={data.byMois}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="mois" tick={{ fontSize: 10 }} tickFormatter={fmtMois} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v} DT`} />
                    <Tooltip formatter={(v: unknown) => [`${fmt(v as number)} DT`, 'Coût']} labelFormatter={fmtMois} />
                    <Line type="monotone" dataKey="cout" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartBox>
            )}
          </div>

          <SectionTitle>Détail ({rows.length} ingrédients)</SectionTitle>
          <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['Ingrédient', 'Catégorie', 'Unité', 'Qté totale', 'Prix moyen (DT)', 'Coût total (DT)', '% du total'].map((h) => (
                    <th key={h} style={{ padding: '9px 12px', textAlign: h.startsWith('%') || h.startsWith('Qté') || h.startsWith('Prix') || h.startsWith('Coût') ? 'right' : 'left', borderBottom: '1px solid #e5e7eb', fontWeight: 600, color: '#374151', fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px 12px', color: '#111827', fontWeight: 500 }}>{r.ingredient_nom as string}</td>
                    <td style={{ padding: '8px 12px', color: '#6b7280' }}>{r.categorie as string}</td>
                    <td style={{ padding: '8px 12px', color: '#6b7280' }}>{r.unite as string}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{fmt(r.quantite_totale as number)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{fmt(r.prix_moyen as number)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#6366f1' }}>{fmt(r.cout_total as number)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                        <div style={{ width: 50, height: 6, borderRadius: 3, background: '#e5e7eb', overflow: 'hidden' }}>
                          <div style={{ width: `${r.pct as number}%`, height: '100%', background: '#6366f1', borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 12 }}>{r.pct as number}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f9fafb', fontWeight: 700 }}>
                  <td colSpan={5} style={{ padding: '9px 12px', fontSize: 12, color: '#374151' }}>TOTAL</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', color: '#6366f1' }}>{fmt(total)} DT</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right' }}>100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── RAPPORT APPROS ────────────────────────────────────────────────────────────

function RapportAppros({ filters }: { filters: FilterOptions }) {
  const { user } = useAuth();
  const isEntreprise = true;
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10); });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [fournisseurId, setFournisseurId] = useState('');
  const [activiteId, setActiviteId] = useState('');
  const [typeAppro, setTypeAppro] = useState('');
  const [data, setData] = useState<{ rows: Record<string, unknown>[]; byFournisseur: { fournisseur: string; total: number }[]; byMois: { mois: string; total: number }[] } | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (fournisseurId) params.set('fournisseurId', fournisseurId);
      if (activiteId) params.set('activiteId', activiteId);
      if (typeAppro) params.set('typeAppro', typeAppro);
      const res = await api.get(`/api/rapports/appros?${params}`);
      setData(res.data);
    } finally { setLoading(false); }
  }, [dateFrom, dateTo, fournisseurId, activiteId, typeAppro]);

  useEffect(() => { load(); }, [load]);

  const rows = data?.rows ?? [];
  const totalDT = rows.reduce((s, r) => s + parseFloat(String(r.total ?? 0)), 0);

  const exportExcel = () => {
    downloadExcel(rows.map((r) => ({
      'Date': fmtDate(r.date_appro as string), 'Ingrédient': r.ingredient_nom,
      'Catégorie': r.categorie, 'Unité': r.unite, 'Fournisseur': r.fournisseur_nom || '—',
      'Réf. facture': r.ref_facture || '—', 'Type': r.type_appro,
      'Activité': r.activite_nom || '—', 'Quantité': fmt(r.quantite as number),
      'Prix unit. (DT)': fmt(r.prix_unitaire as number), 'Total (DT)': fmt(r.total as number),
    })), 'Appros', `rapport-appros-${dateFrom}-${dateTo}.xlsx`);
  };

  const exportPdf = () => {
    const doc = new jsPDF('l');
    doc.setFontSize(16); doc.text("Rapport Approvisionnements", 14, 18);
    doc.setFontSize(10); doc.setTextColor(100); doc.text(`Période : ${fmtDate(dateFrom)} — ${fmtDate(dateTo)}`, 14, 26);
    autoTable(doc, {
      startY: 32,
      head: [['Date', 'Ingrédient', 'Catégorie', 'Fournisseur', 'Réf.', 'Qté', 'Prix unit.', 'Total (DT)']],
      body: rows.map((r) => [fmtDate(r.date_appro as string), r.ingredient_nom, r.categorie, r.fournisseur_nom || '—', r.ref_facture || '—', fmt(r.quantite as number), fmt(r.prix_unitaire as number), fmt(r.total as number)]) as RowInput[],
      styles: { fontSize: 8 }, headStyles: { fillColor: [16, 185, 129] },
      foot: [['', '', '', '', '', '', 'TOTAL', fmt(totalDT) + ' DT']],
    });
    doc.save(`rapport-appros-${dateFrom}-${dateTo}.pdf`);
  };

  return (
    <div>
      <FilterRow>
        <FilterLabel label="Du"><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inputStyle} /></FilterLabel>
        <FilterLabel label="Au"><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inputStyle} /></FilterLabel>
        <FilterLabel label="Fournisseur">
          <select value={fournisseurId} onChange={(e) => setFournisseurId(e.target.value)} style={inputStyle}>
            <option value="">Tous</option>
            {filters.fournisseurs.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
          </select>
        </FilterLabel>
        {isEntreprise && (
          <FilterLabel label="Activité">
            <select value={activiteId} onChange={(e) => setActiviteId(e.target.value)} style={inputStyle}>
              <option value="">Toutes</option>
              {filters.activites.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
            </select>
          </FilterLabel>
        )}
        <FilterLabel label="Type">
          <select value={typeAppro} onChange={(e) => setTypeAppro(e.target.value)} style={inputStyle}>
            <option value="">Tous</option>
            <option value="manuel">Manuel (achat)</option>
            <option value="transfert">Transfert labo</option>
          </select>
        </FilterLabel>
        <div style={{ alignSelf: 'flex-end', marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <ExportButtons onExcel={exportExcel} onPdf={exportPdf} loading={rows.length === 0} />
        </div>
      </FilterRow>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <KpiCard label="Total achats" value={`${fmt(totalDT)} DT`} color="#10b981" />
        <KpiCard label="Nb d'entrées" value={String(rows.length)} color="#f59e0b" />
        {data?.byFournisseur?.[0] && <KpiCard label="Top fournisseur" value={data.byFournisseur[0].fournisseur} sub={`${fmt(data.byFournisseur[0].total)} DT`} color="#6366f1" />}
      </div>

      {loading && <div style={{ textAlign: 'center', color: '#9ca3af', padding: 24 }}>Chargement...</div>}
      {!loading && rows.length === 0 && <EmptyState label="Aucun approvisionnement sur cette période." />}

      {!loading && rows.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 20 }}>
            {data?.byFournisseur && data.byFournisseur.length > 0 && (
              <ChartBox title="Achats par fournisseur">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.byFournisseur.slice(0, 8)} layout="vertical" margin={{ left: 10 }}>
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v} DT`} />
                    <YAxis type="category" dataKey="fournisseur" tick={{ fontSize: 9 }} width={100} />
                    <Tooltip formatter={(v: unknown) => [`${fmt(v as number)} DT`, 'Total']} />
                    <Bar dataKey="total" fill="#10b981" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartBox>
            )}
            {data?.byMois && data.byMois.length > 1 && (
              <ChartBox title="Dépenses mensuelles">
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={data.byMois}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="mois" tick={{ fontSize: 10 }} tickFormatter={fmtMois} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v} DT`} />
                    <Tooltip formatter={(v: unknown) => [`${fmt(v as number)} DT`, 'Total']} labelFormatter={fmtMois} />
                    <Line type="monotone" dataKey="total" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartBox>
            )}
          </div>

          <SectionTitle>Détail ({rows.length} entrées)</SectionTitle>
          <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['Date', 'Ingrédient', 'Catégorie', 'Unité', 'Fournisseur', 'Réf. facture', 'Type', isEntreprise ? 'Activité' : null, 'Quantité', 'Prix unit.', 'Total (DT)']
                    .filter(Boolean).map((h) => (
                      <th key={h!} style={{ padding: '9px 12px', textAlign: ['Quantité', 'Prix unit.', 'Total (DT)'].includes(h!) ? 'right' : 'left', borderBottom: '1px solid #e5e7eb', fontWeight: 600, color: '#374151', fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{fmtDate(r.date_appro as string)}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 500 }}>{r.ingredient_nom as string}</td>
                    <td style={{ padding: '8px 12px', color: '#6b7280' }}>{r.categorie as string}</td>
                    <td style={{ padding: '8px 12px', color: '#6b7280' }}>{r.unite as string}</td>
                    <td style={{ padding: '8px 12px', color: '#374151' }}>{r.fournisseur_nom as string || '—'}</td>
                    <td style={{ padding: '8px 12px', color: '#6b7280', fontFamily: 'monospace', fontSize: 12 }}>{r.ref_facture as string || '—'}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: '#f0fdf4', color: '#166534' }}>{r.type_appro as string}</span>
                    </td>
                    {isEntreprise && <td style={{ padding: '8px 12px', color: '#6b7280' }}>{r.activite_nom as string || '—'}</td>}
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{fmt(r.quantite as number)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{fmt(r.prix_unitaire as number)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#10b981' }}>{fmt(r.total as number)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f9fafb', fontWeight: 700 }}>
                  <td colSpan={isEntreprise ? 9 : 8} style={{ padding: '9px 12px', fontSize: 12 }}>TOTAL</td>
                  <td />
                  <td style={{ padding: '9px 12px', textAlign: 'right', color: '#10b981' }}>{fmt(totalDT)} DT</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── RAPPORT STOCK ─────────────────────────────────────────────────────────────

function RapportStock({ filters }: { filters: FilterOptions }) {
  const { user } = useAuth();
  const isEntreprise = true;
  const [activiteId, setActiviteId] = useState('');
  const [alerteFilter, setAlerteFilter] = useState('');
  const [data, setData] = useState<{ rows: Record<string, unknown>[]; byCategorie: { categorie: string; valeur: number }[]; totalValeur: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activiteId) params.set('activiteId', activiteId);
      const res = await api.get(`/api/rapports/stock?${params}`);
      setData(res.data);
    } finally { setLoading(false); }
  }, [activiteId]);

  useEffect(() => { load(); }, [load]);

  const rows = (data?.rows ?? []).filter((r) => !alerteFilter || r.alerte === alerteFilter);
  const critiques = (data?.rows ?? []).filter((r) => r.alerte === 'critique').length;
  const attentions = (data?.rows ?? []).filter((r) => r.alerte === 'attention').length;

  const exportExcel = () => {
    downloadExcel(rows.map((r) => ({
      'Ingrédient': r.ingredient_nom, 'Catégorie': r.categorie, 'Unité': r.unite,
      'Activité': r.activite_nom || '—', 'Quantité': fmt(r.quantite as number),
      'Prix unit. (DT)': fmt(r.prix_unitaire as number), 'Valeur stock (DT)': fmt(r.valeur as number),
      'Seuil min': r.seuil_min ?? '—', 'Alerte': r.alerte,
    })), 'Stock', `rapport-stock-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(16); doc.text('Rapport Stock', 14, 18);
    doc.setFontSize(10); doc.setTextColor(100); doc.text(`Généré le ${fmtDate(new Date().toISOString())}`, 14, 26);
    autoTable(doc, {
      startY: 32,
      head: [['Ingrédient', 'Catégorie', 'Unité', 'Quantité', 'Prix unit.', 'Valeur (DT)', 'Alerte']],
      body: rows.map((r) => [r.ingredient_nom, r.categorie, r.unite, fmt(r.quantite as number), fmt(r.prix_unitaire as number), fmt(r.valeur as number), r.alerte]) as RowInput[],
      styles: { fontSize: 9 }, headStyles: { fillColor: [245, 158, 11] },
      foot: [['', '', '', '', '', fmt(data?.totalValeur ?? 0) + ' DT', '']],
      didParseCell: (d) => {
        if (d.column.index === 6 && d.cell.raw === 'critique') d.cell.styles.textColor = [220, 38, 38];
        if (d.column.index === 6 && d.cell.raw === 'attention') d.cell.styles.textColor = [217, 119, 6];
      },
    });
    doc.save(`rapport-stock-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div>
      <FilterRow>
        {isEntreprise && (
          <FilterLabel label="Activité">
            <select value={activiteId} onChange={(e) => setActiviteId(e.target.value)} style={inputStyle}>
              <option value="">Toutes</option>
              {filters.activites.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
            </select>
          </FilterLabel>
        )}
        <FilterLabel label="Alerte">
          <select value={alerteFilter} onChange={(e) => setAlerteFilter(e.target.value)} style={inputStyle}>
            <option value="">Tous</option>
            <option value="critique">⛔ Critique (stock ≤ 0)</option>
            <option value="attention">⚠️ Attention (sous seuil)</option>
            <option value="ok">✅ OK</option>
          </select>
        </FilterLabel>
        <div style={{ alignSelf: 'flex-end', marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={load} style={{ padding: '7px 14px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>🔄 Actualiser</button>
          <ExportButtons onExcel={exportExcel} onPdf={exportPdf} loading={rows.length === 0} />
        </div>
      </FilterRow>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <KpiCard label="Valeur totale stock" value={`${fmt(data?.totalValeur ?? 0)} DT`} color="#f59e0b" />
        <KpiCard label="Nb ingrédients" value={String(data?.rows?.length ?? 0)} />
        <KpiCard label="⛔ Critiques" value={String(critiques)} color="#ef4444" />
        <KpiCard label="⚠️ Attentions" value={String(attentions)} color="#d97706" />
      </div>

      {loading && <div style={{ textAlign: 'center', color: '#9ca3af', padding: 24 }}>Chargement...</div>}
      {!loading && rows.length === 0 && <EmptyState label="Aucune donnée de stock." />}

      {!loading && rows.length > 0 && (
        <>
          {data?.byCategorie && data.byCategorie.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <ChartBox title="Valorisation du stock par catégorie">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.byCategorie} margin={{ left: 10, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="categorie" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v} DT`} />
                    <Tooltip formatter={(v: unknown) => [`${fmt(v as number)} DT`, 'Valeur']} />
                    <Bar dataKey="valeur" fill="#f59e0b" radius={[4, 4, 0, 0]}>
                      {data.byCategorie.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartBox>
            </div>
          )}

          <SectionTitle>Stock actuel ({rows.length} ingrédients)</SectionTitle>
          <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  {['Ingrédient', 'Catégorie', 'Unité', isEntreprise ? 'Activité' : null, 'Quantité', 'Prix unit. (DT)', 'Valeur (DT)', 'Seuil min', 'Statut']
                    .filter(Boolean).map((h) => (
                      <th key={h!} style={{ padding: '9px 12px', textAlign: ['Quantité', 'Prix unit. (DT)', 'Valeur (DT)', 'Seuil min'].includes(h!) ? 'right' : 'left', borderBottom: '1px solid #e5e7eb', fontWeight: 600, color: '#374151', fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6', background: r.alerte === 'critique' ? '#fff5f5' : r.alerte === 'attention' ? '#fffbeb' : 'transparent' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 500 }}>{r.ingredient_nom as string}</td>
                    <td style={{ padding: '8px 12px', color: '#6b7280' }}>{r.categorie as string}</td>
                    <td style={{ padding: '8px 12px', color: '#6b7280' }}>{r.unite as string}</td>
                    {isEntreprise && <td style={{ padding: '8px 12px', color: '#6b7280' }}>{r.activite_nom as string || '—'}</td>}
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{fmt(r.quantite as number)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{fmt(r.prix_unitaire as number)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: '#f59e0b' }}>{fmt(r.valeur as number)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#6b7280' }}>{r.seuil_min != null ? fmt(r.seuil_min as number) : '—'}</td>
                    <td style={{ padding: '8px 12px' }}>
                      {r.alerte === 'critique' && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: '#fee2e2', color: '#991b1b', fontWeight: 600 }}>⛔ Critique</span>}
                      {r.alerte === 'attention' && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: '#fef9c3', color: '#854d0e', fontWeight: 600 }}>⚠️ Attention</span>}
                      {r.alerte === 'ok' && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: '#dcfce7', color: '#166534', fontWeight: 600 }}>✅ OK</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f9fafb', fontWeight: 700 }}>
                  <td colSpan={isEntreprise ? 6 : 5} style={{ padding: '9px 12px', fontSize: 12 }}>TOTAL VALORISATION</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', color: '#f59e0b' }}>{fmt(rows.reduce((s, r) => s + (r.valeur as number), 0))} DT</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── RAPPORT ACTIVITÉS (entreprise) ───────────────────────────────────────────

function RapportActivites() {
  const [data, setData] = useState<{ rows: Record<string, unknown>[] } | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/rapports/activites');
      setData(res.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rows = data?.rows ?? [];

  const exportExcel = () => {
    downloadExcel(rows.map((r) => ({
      'Activité': r.activite_nom, 'Coût appros (DT)': fmt(r.cout_appros as number),
      'Valeur pertes (DT)': fmt(r.valeur_pertes as number), 'Valeur stock (DT)': fmt(r.valeur_stock as number),
    })), 'Activités', `rapport-activites-${new Date().getFullYear()}.xlsx`);
  };

  const exportPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(16); doc.text("Rapport Comparatif Activités", 14, 18);
    doc.setFontSize(10); doc.setTextColor(100); doc.text(`Année ${new Date().getFullYear()}`, 14, 26);
    autoTable(doc, {
      startY: 32,
      head: [['Activité', 'Coût appros (DT)', 'Valeur pertes (DT)', 'Valeur stock (DT)']],
      body: rows.map((r) => [r.activite_nom, fmt(r.cout_appros as number), fmt(r.valeur_pertes as number), fmt(r.valeur_stock as number)]) as RowInput[],
      styles: { fontSize: 9 }, headStyles: { fillColor: [139, 92, 246] },
    });
    doc.save(`rapport-activites-${new Date().getFullYear()}.pdf`);
  };

  if (loading) return <div style={{ textAlign: 'center', color: '#9ca3af', padding: 48 }}>Chargement...</div>;
  if (rows.length === 0) return <EmptyState label="Aucune activité trouvée." />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <ExportButtons onExcel={exportExcel} onPdf={exportPdf} />
      </div>

      <ChartBox title="Comparatif activités — année en cours">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={rows} margin={{ left: 10, right: 10, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="activite_nom" tick={{ fontSize: 10 }} angle={-15} textAnchor="end" />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v} DT`} />
            <Tooltip formatter={(v: unknown) => [`${fmt(v as number)} DT`]} />
            <Legend />
            <Bar dataKey="cout_appros" name="Coût appros" fill="#6366f1" radius={[4, 4, 0, 0]} />
            <Bar dataKey="valeur_pertes" name="Valeur pertes" fill="#ef4444" radius={[4, 4, 0, 0]} />
            <Bar dataKey="valeur_stock" name="Valeur stock" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartBox>

      <SectionTitle>Tableau comparatif</SectionTitle>
      <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', marginTop: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              {['Activité', 'Coût appros (DT)', 'Valeur pertes (DT)', 'Valeur stock (DT)'].map((h) => (
                <th key={h} style={{ padding: '9px 16px', textAlign: h === 'Activité' ? 'left' : 'right', borderBottom: '1px solid #e5e7eb', fontWeight: 600, color: '#374151', fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '10px 16px', fontWeight: 600 }}>{r.activite_nom as string}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: '#6366f1', fontWeight: 600 }}>{fmt(r.cout_appros as number)} DT</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: '#ef4444', fontWeight: 600 }}>{fmt(r.valeur_pertes as number)} DT</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', color: '#10b981', fontWeight: 600 }}>{fmt(r.valeur_stock as number)} DT</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'pertes', label: '📉 Pertes' },
  { id: 'cout', label: '💰 Coût Matière' },
  { id: 'appros', label: '🚚 Appros' },
  { id: 'stock', label: '📦 Stock' },
] as const;

type TabId = typeof TABS[number]['id'] | 'activites';

export default function RapportsPage() {
  const { user } = useAuth();
  const isEntreprise = true;
  const [tab, setTab] = useState<TabId>('pertes');
  const [filters, setFilters] = useState<FilterOptions>({ categories: [], fournisseurs: [], activites: [] });

  useEffect(() => {
    api.get('/api/rapports/filters').then((r) => setFilters(r.data)).catch(() => {});
  }, []);

  const allTabs = isEntreprise
    ? [...TABS, { id: 'activites' as const, label: '🏪 Activités' }]
    : TABS;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 55%, #6366f1 100%)',
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(49,46,129,0.28)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>📊</div>
        <div>
          <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Rapports</h1>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: '2px 0 0' }}>Analyse détaillée, graphiques et exports professionnels</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #e5e7eb', marginBottom: 28, overflowX: 'auto' }}>
        {allTabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id as TabId)}
            style={{
              padding: '10px 18px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
              color: tab === t.id ? '#312e81' : '#6b7280',
              borderBottom: tab === t.id ? '2px solid #312e81' : '2px solid transparent',
              marginBottom: -2, whiteSpace: 'nowrap', transition: 'color 0.15s',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'pertes'    && <RapportPertes filters={filters} />}
      {tab === 'cout'      && <RapportCoutMatiere filters={filters} />}
      {tab === 'appros'    && <RapportAppros filters={filters} />}
      {tab === 'stock'     && <RapportStock filters={filters} />}
      {tab === 'activites' && isEntreprise && <RapportActivites />}
    </div>
  );
}
