import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/client';
import HelpButton from '../common/HelpButton';
import MultiSelectFilter from '../common/MultiSelectFilter';
import type { MultiSelectOption } from '../common/MultiSelectFilter';
import {
  ChartCard, DonutChart, EmptyHint, EvolutionChart, FoodCostBadge, HBarList,
  KpiCard, SortableTable, TimeBarChart, TypeBadge, WaterfallChart, fmtDT, fmtNum,
} from './dashboardV2Widgets';
import type { ColonneDef, Kpis } from './dashboardV2Widgets';

// ─────────────────────────────────────────────────────────────────────────────
// Tableau de bord v2 — page unique à onglets pilotée par des filtres
// multi-sélection (remplace l'ancien dashboard et les pages Rapports).
// ─────────────────────────────────────────────────────────────────────────────

type TabKey = 'overview' | 'ventes' | 'achats' | 'pertes' | 'labo';

const TABS: { key: TabKey; icon: string; label: string }[] = [
  { key: 'overview', icon: '📊', label: "Vue d'ensemble" },
  { key: 'ventes', icon: '💰', label: 'Ventes & marges' },
  { key: 'achats', icon: '📦', label: 'Achats & stock' },
  { key: 'pertes', icon: '🗑️', label: 'Pertes' },
  { key: 'labo', icon: '🧪', label: 'Labo' },
];

const PRESETS: { key: string; label: string }[] = [
  { key: 'mois', label: 'Mois en cours' },
  { key: '7j', label: '7 jours' },
  { key: '30j', label: '30 jours' },
  { key: 'mois-prec', label: 'Mois dernier' },
  { key: 'trimestre', label: 'Trimestre' },
  { key: 'annee', label: 'Année' },
  { key: 'perso', label: 'Personnalisé' },
];

const fmtIso = (d: Date) => d.toISOString().slice(0, 10);

const presetRange = (preset: string): { from: string; to: string } => {
  const now = new Date();
  const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
  const y = now.getUTCFullYear(); const m = now.getUTCMonth();
  switch (preset) {
    case '7j': { const f = new Date(now); f.setUTCDate(f.getUTCDate() - 6); return { from: fmtIso(f), to: fmtIso(now) }; }
    case '30j': { const f = new Date(now); f.setUTCDate(f.getUTCDate() - 29); return { from: fmtIso(f), to: fmtIso(now) }; }
    case 'mois-prec': return { from: fmtIso(utc(y, m - 1, 1)), to: fmtIso(utc(y, m, 0)) };
    case 'trimestre': { const qm = Math.floor(m / 3) * 3; return { from: fmtIso(utc(y, qm, 1)), to: fmtIso(utc(y, qm + 3, 0)) }; }
    case 'annee': return { from: fmtIso(utc(y, 0, 1)), to: fmtIso(utc(y, 11, 31)) };
    default: return { from: fmtIso(utc(y, m, 1)), to: fmtIso(utc(y, m + 1, 0)) };
  }
};

interface FiltresOptions {
  activites: { id: number; nom: string }[];
  labos: { id: number; nom: string }[];
  prestataires: { id: string; nom: string }[];
  categories_produit: { id: number; nom: string }[];
  categories_articles: { id: number; nom: string }[];
  familles: { id: number; nom: string }[];
  fournisseurs: { id: number; nom: string }[];
  role: string;
}

interface FiltresState {
  activites: string[]; labos: string[]; canaux: string[]; prestataires: string[];
  catProduits: string[]; typesProduit: string[]; catArticles: string[];
  familles: string[]; fournisseurs: string[]; typesPerte: string[];
}

const FILTRE_KEYS: (keyof FiltresState)[] = ['activites', 'labos', 'canaux', 'prestataires', 'catProduits', 'typesProduit', 'catArticles', 'familles', 'fournisseurs', 'typesPerte'];
const emptyFiltres = (): FiltresState => ({ activites: [], labos: [], canaux: [], prestataires: [], catProduits: [], typesProduit: [], catArticles: [], familles: [], fournisseurs: [], typesPerte: [] });

// Filtres pertinents par onglet (les autres ne s'affichent pas).
const FILTRES_PAR_TAB: Record<TabKey, (keyof FiltresState)[]> = {
  overview: ['activites', 'canaux', 'prestataires', 'catProduits', 'typesProduit'],
  ventes: ['activites', 'canaux', 'prestataires', 'catProduits', 'typesProduit'],
  achats: ['activites', 'catArticles', 'familles', 'fournisseurs'],
  pertes: ['activites', 'labos', 'catArticles', 'familles', 'typesPerte'],
  labo: ['labos'],
};

const CANAUX_OPTS: MultiSelectOption[] = [
  { value: 'directe', label: 'Vente directe' },
  { value: 'prestataire', label: 'Via prestataire' },
];
const TYPES_PRODUIT_OPTS: MultiSelectOption[] = [
  { value: 'produit', label: 'Produits' },
  { value: 'supplement', label: 'Suppléments' },
  { value: 'valorise', label: 'Valorisés' },
];
const TYPES_PERTE_OPTS: MultiSelectOption[] = [
  { value: 'avarie', label: 'Avaries' },
  { value: 'dechet', label: 'Déchets' },
];

const STORAGE_KEY = 'dashboardV2State';

export default function ClientDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [options, setOptions] = useState<FiltresOptions | null>(null);

  // État initial : URL > localStorage > défauts.
  const init = useMemo(() => {
    const stored = (() => {
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; }
    })();
    const get = (k: string) => searchParams.get(k) ?? stored?.[k] ?? '';
    const preset = get('preset') || 'mois';
    const range = preset === 'perso' && get('from') && get('to')
      ? { from: get('from'), to: get('to') }
      : presetRange(preset);
    const filtres = emptyFiltres();
    for (const k of FILTRE_KEYS) filtres[k] = String(get(k) || '').split(',').filter(Boolean);
    const tab = (TABS.some((t) => t.key === get('tab')) ? get('tab') : 'overview') as TabKey;
    return { tab, preset, ...range, filtres };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [tab, setTab] = useState<TabKey>(init.tab);
  const [preset, setPreset] = useState(init.preset);
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [filtres, setFiltres] = useState<FiltresState>(init.filtres);
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Options des filtres (une fois).
  useEffect(() => {
    api.get('/api/dashboard/v2?tab=filtres').then(({ data: d }) => setOptions(d)).catch(() => setOptions(null));
  }, []);

  // Persistance URL + localStorage.
  useEffect(() => {
    const params: Record<string, string> = { tab, preset };
    if (preset === 'perso') { params.from = from; params.to = to; }
    for (const k of FILTRE_KEYS) if (filtres[k].length) params[k] = filtres[k].join(',');
    setSearchParams(params, { replace: true });
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(params)); } catch { /* stockage indisponible : tant pis */ }
    // setSearchParams volontairement hors deps : son identité peut changer à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, preset, from, to, filtres]);

  // Chargement des données de l'onglet courant.
  const load = useCallback(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setErreur(false);
    const qs = new URLSearchParams({ tab, from, to });
    for (const k of FILTRE_KEYS) if (filtres[k].length) qs.set(k, filtres[k].join(','));
    api.get(`/api/dashboard/v2?${qs.toString()}`, { signal: ctrl.signal })
      .then(({ data: d }) => { setData(d); setLoading(false); })
      .catch((e) => { if (e?.code !== 'ERR_CANCELED') { setErreur(true); setLoading(false); } });
  }, [tab, from, to, filtres]);
  useEffect(() => { load(); }, [load]);

  const applyPreset = (p: string) => {
    setPreset(p);
    if (p !== 'perso') { const r = presetRange(p); setFrom(r.from); setTo(r.to); }
  };

  const setFiltre = (k: keyof FiltresState) => (values: string[]) => setFiltres((f) => ({ ...f, [k]: values }));
  const filtresActifs = FILTRE_KEYS.reduce((n, k) => n + (filtres[k].length ? 1 : 0), 0);
  const visibles = FILTRES_PAR_TAB[tab];
  // Filtres posés sur un autre onglet, invisibles ici (ils n'affectent pas ces données).
  const filtresCaches = FILTRE_KEYS.reduce((n, k) => n + (filtres[k].length && !visibles.includes(k) ? 1 : 0), 0);
  const tabsVisibles = TABS.filter((t) => t.key !== 'labo' || (options?.labos.length ?? 0) > 0);

  const toOpts = (rows: { id: number | string; nom: string }[]): MultiSelectOption[] =>
    rows.map((r) => ({ value: String(r.id), label: r.nom }));

  // ── Export Excel de l'onglet courant ──
  const [exporting, setExporting] = useState(false);
  const exportExcel = async () => {
    if (!data || exporting) return;
    setExporting(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      const tabDef = TABS.find((t) => t.key === tab)!;
      const ws = wb.addWorksheet('Export');
      ws.addRow([`LabFlow — Tableau de bord · ${tabDef.label}`]).font = { bold: true, size: 14 };
      ws.addRow([`Période : ${from} → ${to}`]);
      ws.addRow([]);
      const addSection = (titre: string, rows: Record<string, unknown>[]) => {
        if (!rows?.length) return;
        ws.addRow([titre]).font = { bold: true, size: 12 };
        const keys = Object.keys(rows[0]);
        ws.addRow(keys).font = { bold: true };
        for (const r of rows) ws.addRow(keys.map((k) => r[k] as string | number));
        ws.addRow([]);
      };
      const kpis = data.kpis as Record<string, unknown> | undefined;
      if (kpis) addSection('Indicateurs', [Object.fromEntries(Object.entries(kpis).filter(([, v]) => typeof v !== 'object' || v === null))]);
      for (const [key, val] of Object.entries(data)) {
        if (Array.isArray(val) && val.length && typeof val[0] === 'object') {
          addSection(key.replace(/_/g, ' '), val as Record<string, unknown>[]);
        }
      }
      ws.columns.forEach((c) => { c.width = 22; });
      const buf = await wb.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `labflow-dashboard-${tab}-${from}_${to}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="page">
      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 60%, #3b82f6 100%)', borderRadius: 18, padding: '20px 24px', marginBottom: 16, boxShadow: '0 8px 28px rgba(37,99,235,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>📊</div>
          <div>
            <h1 style={{ fontSize: '1.45rem', fontWeight: 900, color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              Tableau de bord <HelpButton section="dashboard" variant="solid" tip="Comprendre le tableau de bord" />
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.8rem', margin: '3px 0 0' }}>
              Pilotage complet : ventes, marges, achats, stocks, pertes et labo — tout en TTC.
            </p>
          </div>
        </div>
        <button onClick={exportExcel} disabled={loading || exporting || !data}
          style={{ background: 'rgba(255,255,255,0.16)', color: '#fff', border: '1px solid rgba(255,255,255,0.45)', borderRadius: 10, padding: '9px 16px', fontWeight: 700, fontSize: '0.82rem', cursor: loading || exporting ? 'default' : 'pointer', opacity: loading || exporting ? 0.5 : 1 }}>
          {exporting ? 'Export…' : '📥 Exporter (Excel)'}
        </button>
      </div>

      {/* Onglets */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {tabsVisibles.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              padding: '9px 16px', borderRadius: 12, border: 'none', cursor: 'pointer',
              fontSize: '0.84rem', fontWeight: 800,
              background: tab === t.key ? 'linear-gradient(135deg,#1e40af,#3b82f6)' : '#fff',
              color: tab === t.key ? '#fff' : '#475569',
              boxShadow: tab === t.key ? '0 4px 14px rgba(37,99,235,0.3)' : 'inset 0 0 0 1px #e2e8f0',
            }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Barre de filtres */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '12px 14px', marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          {PRESETS.map((p) => (
            <button key={p.key} onClick={() => applyPreset(p.key)}
              style={{
                padding: '6px 11px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: '0.74rem', fontWeight: 700,
                background: preset === p.key ? '#2563eb' : '#f1f5f9', color: preset === p.key ? '#fff' : '#64748b',
              }}>
              {p.label}
            </button>
          ))}
          {preset === 'perso' && (
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginLeft: 4 }}>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={dateInp} />
              <span style={{ color: '#94a3b8' }}>→</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={dateInp} />
            </span>
          )}
        </div>
        <div style={{ width: 1, alignSelf: 'stretch', background: '#e2e8f0', margin: '0 4px' }} />
        {options && (
          <>
            {visibles.includes('activites') && <MultiSelectFilter label="Activités" icon="🏪" options={toOpts(options.activites)} selected={filtres.activites} onChange={setFiltre('activites')} />}
            {visibles.includes('labos') && <MultiSelectFilter label="Labos" icon="🧪" options={toOpts(options.labos)} selected={filtres.labos} onChange={setFiltre('labos')} />}
            {visibles.includes('canaux') && <MultiSelectFilter label="Type de vente" icon="🛒" options={CANAUX_OPTS} selected={filtres.canaux} onChange={setFiltre('canaux')} />}
            {visibles.includes('prestataires') && <MultiSelectFilter label="Prestataires" icon="🚚" options={toOpts(options.prestataires)} selected={filtres.prestataires} onChange={setFiltre('prestataires')} />}
            {visibles.includes('catProduits') && <MultiSelectFilter label="Catégories produits" icon="🍽️" options={toOpts(options.categories_produit)} selected={filtres.catProduits} onChange={setFiltre('catProduits')} />}
            {visibles.includes('typesProduit') && <MultiSelectFilter label="Types" icon="🏷️" options={TYPES_PRODUIT_OPTS} selected={filtres.typesProduit} onChange={setFiltre('typesProduit')} />}
            {visibles.includes('catArticles') && <MultiSelectFilter label="Catégories articles" icon="🧂" options={toOpts(options.categories_articles)} selected={filtres.catArticles} onChange={setFiltre('catArticles')} />}
            {visibles.includes('familles') && <MultiSelectFilter label="Familles" icon="🗂️" options={toOpts(options.familles)} selected={filtres.familles} onChange={setFiltre('familles')} />}
            {visibles.includes('fournisseurs') && <MultiSelectFilter label="Fournisseurs" icon="📦" options={toOpts(options.fournisseurs)} selected={filtres.fournisseurs} onChange={setFiltre('fournisseurs')} />}
            {visibles.includes('typesPerte') && <MultiSelectFilter label="Type de perte" icon="🗑️" options={TYPES_PERTE_OPTS} selected={filtres.typesPerte} onChange={setFiltre('typesPerte')} />}
          </>
        )}
        {filtresCaches > 0 && (
          <span title="Ces filtres s'appliquent aux autres onglets, pas aux données affichées ici."
            style={{ fontSize: '0.72rem', fontWeight: 700, color: '#92400e', background: '#fef3c7', borderRadius: 20, padding: '4px 10px' }}>
            ⚠ {filtresCaches} filtre{filtresCaches > 1 ? 's' : ''} actif{filtresCaches > 1 ? 's' : ''} sur d'autres onglets
          </span>
        )}
        {filtresActifs > 0 && (
          <button onClick={() => setFiltres(emptyFiltres())}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.76rem', fontWeight: 700, color: '#ef4444' }}>
            ✕ Réinitialiser ({filtresActifs})
          </button>
        )}
      </div>

      {/* Contenu */}
      {loading ? (
        <div className="loading-text" style={{ padding: 40 }}>Chargement…</div>
      ) : erreur ? (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 12, padding: '16px 20px', fontSize: '0.88rem' }}>
          Impossible de charger le tableau de bord.{' '}
          <button onClick={load} style={{ border: 'none', background: 'none', color: '#b91c1c', fontWeight: 800, cursor: 'pointer', textDecoration: 'underline' }}>Réessayer</button>
        </div>
      ) : data ? (
        <>
          {tab === 'overview' && <OverviewTab data={data} />}
          {tab === 'ventes' && <VentesTab data={data} />}
          {tab === 'achats' && <AchatsTab data={data} />}
          {tab === 'pertes' && <PertesTab data={data} />}
          {tab === 'labo' && <LaboTab data={data} />}
        </>
      ) : null}
    </div>
  );
}

const dateInp: React.CSSProperties = { padding: '5px 8px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.76rem', fontFamily: 'inherit' };
const kpiGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(195px, 1fr))', gap: 10, marginBottom: 16 };
const twoCols: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 14, marginBottom: 14 };

// ─────────────────────────────────────────────────────────────────────────────
// Onglets
// ─────────────────────────────────────────────────────────────────────────────
/* eslint-disable @typescript-eslint/no-explicit-any */

function OverviewTab({ data }: { data: any }) {
  const k: Kpis = data.kpis;
  const a = data.alertes ?? {};
  return (
    <>
      <div style={kpiGrid}>
        <KpiCard icon="💵" label="Chiffre d'affaires" value={fmtDT(k.ca)} delta={k.deltas?.ca} sub={`${k.nb_ventes} vente${k.nb_ventes > 1 ? 's' : ''} · panier ${fmtDT(k.panier_moyen, 2)}`} />
        <KpiCard icon="📈" label="Marge brute" value={fmtDT(k.marge_brute)} delta={k.deltas?.marge_brute} accent="#16a34a" sub={k.taux_marge_pct != null ? `${k.taux_marge_pct}% du CA` : undefined} />
        <KpiCard icon="🤝" label="Après commissions" value={fmtDT(k.marge_apres_com)} delta={k.deltas?.marge_apres_com} accent="#d97706" sub={`commissions ${fmtDT(k.commissions)}`} />
        <KpiCard icon="🏁" label="Marge nette estimée" value={fmtDT(k.marge_nette)} delta={k.deltas?.marge_nette} accent={k.marge_nette >= 0 ? '#16a34a' : '#dc2626'} sub={`charges fixes ${fmtDT(k.charges)}`} />
        <KpiCard icon="🍔" label="Food cost" value={k.food_cost_pct != null ? `${k.food_cost_pct}%` : '—'} delta={k.deltas?.food_cost_pts} inverse accent={k.food_cost_pct != null && k.food_cost_pct > 40 ? '#dc2626' : '#2563eb'} sub={`coût matière ${fmtDT(k.cout_matiere)}`} />
        <KpiCard icon="🗑️" label="Pertes" value={fmtDT(k.pertes)} delta={k.deltas?.pertes} inverse accent="#ef4444" sub={k.pertes_pct_ca != null ? `${fmtNum(k.pertes_pct_ca)}% du CA` : undefined} />
        <KpiCard icon="🏬" label="Valeur du stock" value={fmtDT(k.valeur_stock ?? 0)} accent="#8b5cf6" sub="à l'instant (hors période)" />
      </div>

      {(a.stock_bas > 0 || a.food_cost_eleve > 0 || a.jours_inventaire == null || a.jours_inventaire > 30) && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {a.stock_bas > 0 && <span style={alertPill('#fef3c7', '#92400e')}>⚠️ {a.stock_bas} article{a.stock_bas > 1 ? 's' : ''} sous le seuil — voir Achats & stock</span>}
          {a.food_cost_eleve > 0 && <span style={alertPill('#fee2e2', '#b91c1c')}>🍔 {a.food_cost_eleve} produit{a.food_cost_eleve > 1 ? 's' : ''} à food cost &gt; 40%</span>}
          {a.jours_inventaire == null
            ? <span style={alertPill('#e0e7ff', '#3730a3')}>📋 Aucun inventaire enregistré</span>
            : a.jours_inventaire > 30 && <span style={alertPill('#e0e7ff', '#3730a3')}>📋 Dernier inventaire il y a {a.jours_inventaire} j</span>}
        </div>
      )}

      <ChartCard title={`Évolution du CA et des marges (par ${data.grain === 'day' ? 'jour' : data.grain === 'week' ? 'semaine' : 'mois'})`} height={300}>
        <EvolutionChart data={data.evolution ?? []} grain={data.grain} />
      </ChartCard>
    </>
  );
}

function VentesTab({ data }: { data: any }) {
  if (data.vide || !data.kpis) return <EmptyHint text="Aucune activité dans le périmètre." />;
  const k: Kpis = data.kpis;
  const canalCols: ColonneDef<any>[] = [
    { key: 'canal', label: 'Canal', align: 'left', fmt: (v) => <strong>{String(v)}</strong> },
    { key: 'ca', label: 'CA', fmt: (v) => fmtDT(Number(v)) },
    { key: 'marge_brute', label: 'Marge brute', fmt: (v) => fmtDT(Number(v)) },
    { key: 'commissions', label: 'Commissions', fmt: (v) => (Number(v) > 0 ? `− ${fmtDT(Number(v))}` : '—') },
    { key: 'marge_apres_com', label: 'Marge canal', fmt: (v) => <strong style={{ color: Number(v) >= 0 ? '#16a34a' : '#dc2626' }}>{fmtDT(Number(v))}</strong> },
    { key: 'food_cost_pct', label: 'Food cost', fmt: (v) => <FoodCostBadge pct={v as number | null} /> },
  ];
  const prodCols: ColonneDef<any>[] = [
    { key: 'nom', label: 'Produit', align: 'left', fmt: (v) => <strong style={{ color: '#1e293b' }}>{String(v)}</strong> },
    { key: 'type', label: 'Type', align: 'left', fmt: (v) => <TypeBadge type={String(v)} /> },
    { key: 'qte', label: 'Qté', fmt: (v) => fmtNum(Number(v)) },
    { key: 'ca', label: 'CA', fmt: (v) => fmtDT(Number(v)) },
    { key: 'part_ca_pct', label: '% CA', fmt: (v) => `${fmtNum(Number(v))}%` },
    { key: 'marge_brute', label: 'Marge', fmt: (v) => fmtDT(Number(v)) },
    { key: 'food_cost_pct', label: 'Food cost', fmt: (v) => <FoodCostBadge pct={v as number | null} /> },
  ];
  return (
    <>
      <div style={kpiGrid}>
        <KpiCard icon="💵" label="CA" value={fmtDT(k.ca)} delta={k.deltas?.ca} sub={`${k.nb_ventes} ventes · panier ${fmtDT(k.panier_moyen, 2)}`} />
        <KpiCard icon="📈" label="Marge brute" value={fmtDT(k.marge_brute)} delta={k.deltas?.marge_brute} accent="#16a34a" sub={k.taux_marge_pct != null ? `${k.taux_marge_pct}% du CA` : undefined} />
        <KpiCard icon="🤝" label="Après commissions" value={fmtDT(k.marge_apres_com)} delta={k.deltas?.marge_apres_com} accent="#d97706" sub={`commissions ${fmtDT(k.commissions)}`} />
        <KpiCard icon="🏁" label="Marge nette estimée" value={fmtDT(k.marge_nette)} delta={k.deltas?.marge_nette} accent={k.marge_nette >= 0 ? '#16a34a' : '#dc2626'} sub={k.taux_marge_nette_pct != null ? `${k.taux_marge_nette_pct}% du CA` : undefined} />
        <KpiCard icon="🍔" label="Food cost" value={k.food_cost_pct != null ? `${k.food_cost_pct}%` : '—'} delta={k.deltas?.food_cost_pts} inverse />
      </div>
      <div style={twoCols}>
        <ChartCard title="Du CA à la marge nette (cascade)" height={280}>
          <WaterfallChart data={data.waterfall} />
        </ChartCard>
        <ChartCard title="Marges par canal de vente" height="auto">
          <SortableTable rows={data.par_canal ?? []} colonnes={canalCols} defaultSort="ca" maxHeight={280} />
        </ChartCard>
      </div>
      <div style={twoCols}>
        <ChartCard title="CA & marge par catégorie de produits" height="auto">
          <HBarList rows={data.par_categorie ?? []} labelKey="categorie" valueKey="ca" color="#2563eb"
            suffix={(r) => `· marge ${fmtDT(Number((r as any).marge_brute))}`} />
        </ChartCard>
        <ChartCard title="Répartition du CA par type" height={260}>
          <DonutChart data={(data.par_type ?? []).map((t: any) => ({ ...t, typeLabel: t.type === 'produit' ? 'Produits' : t.type === 'supplement' ? 'Suppléments' : 'Valorisés' }))} nameKey="typeLabel" valueKey="ca" />
        </ChartCard>
      </div>
      <div style={twoCols}>
        <ChartCard title="🏆 Meilleures marges" height="auto">
          <HBarList rows={data.top_marge ?? []} labelKey="nom" valueKey="marge_brute" color="#16a34a" max={8} />
        </ChartCard>
        <ChartCard title="⚠️ Marges les plus faibles" height="auto">
          <HBarList rows={data.flop_marge ?? []} labelKey="nom" valueKey="marge_brute" color="#ef4444" max={8} />
        </ChartCard>
      </div>
      <ChartCard title={`Détail par produit (${(data.produits ?? []).length})`} height="auto">
        <SortableTable rows={data.produits ?? []} colonnes={prodCols} defaultSort="ca" />
      </ChartCard>
    </>
  );
}

function AchatsTab({ data }: { data: any }) {
  if (data.vide) return <EmptyHint text="Aucune activité dans le périmètre." />;
  const k = data.kpis ?? {};
  const alerteCols: ColonneDef<any>[] = [
    { key: 'article', label: 'Article', align: 'left', fmt: (v) => <strong>{String(v)}</strong> },
    { key: 'categorie', label: 'Catégorie', align: 'left' },
    { key: 'quantite', label: 'Stock', fmt: (v) => <strong style={{ color: Number(v) <= 0 ? '#dc2626' : '#d97706' }}>{fmtNum(Number(v))}</strong> },
    { key: 'seuil', label: 'Seuil', fmt: (v) => fmtNum(Number(v)) },
  ];
  return (
    <>
      <div style={kpiGrid}>
        <KpiCard icon="🛒" label="Achats (période)" value={fmtDT(k.achats)} sub={`${k.nb_appros} approvisionnement${k.nb_appros > 1 ? 's' : ''}`} />
        <KpiCard icon="🔁" label="Réceptions labo" value={fmtDT(k.receptions_transferts)} accent="#0d9488" sub={`${k.nb_transferts} transfert${k.nb_transferts > 1 ? 's' : ''}`} />
        <KpiCard icon="🏬" label="Valeur du stock" value={fmtDT(k.valeur_stock)} accent="#8b5cf6" sub="à l'instant" />
        <KpiCard icon="⚠️" label="Articles sous seuil" value={String(k.stock_bas ?? 0)} accent={k.stock_bas > 0 ? '#dc2626' : '#16a34a'} />
      </div>
      <ChartCard title="Évolution des achats" height={240}>
        <TimeBarChart data={data.evolution_achats ?? []} grain={data.grain} />
      </ChartCard>
      <div style={{ height: 14 }} />
      <div style={twoCols}>
        <ChartCard title="Achats par catégorie" height="auto">
          <HBarList rows={data.achats_par_categorie ?? []} labelKey="categorie" color="#2563eb" max={12} />
        </ChartCard>
        <ChartCard title="Achats par fournisseur" height="auto">
          <HBarList rows={data.achats_par_fournisseur ?? []} labelKey="fournisseur" color="#0d9488" max={12} />
        </ChartCard>
      </div>
      <div style={twoCols}>
        <ChartCard title="Valeur du stock par catégorie" height={280}>
          <DonutChart data={data.stock_par_categorie ?? []} nameKey="categorie" />
        </ChartCard>
        <ChartCard title={`Alertes de seuil (${(data.alertes_stock ?? []).length})`} height="auto">
          <SortableTable rows={data.alertes_stock ?? []} colonnes={alerteCols} defaultSort="quantite" maxHeight={280} />
        </ChartCard>
      </div>
      <ChartCard title="Derniers inventaires" height="auto">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {(data.inventaires ?? []).map((inv: any, i: number) => (
            <div key={i} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px', fontSize: '0.8rem' }}>
              <div style={{ fontWeight: 800, color: '#1e293b' }}>{inv.activite}</div>
              <div style={{ color: inv.jours == null ? '#dc2626' : inv.jours > 30 ? '#d97706' : '#16a34a', fontWeight: 600, marginTop: 2 }}>
                {inv.jours == null ? 'Jamais inventorié' : `il y a ${inv.jours} j (${new Date(inv.dernier).toLocaleDateString('fr-FR')})`}
              </div>
            </div>
          ))}
        </div>
      </ChartCard>
    </>
  );
}

function PertesTab({ data }: { data: any }) {
  const k = data.kpis ?? {};
  return (
    <>
      <div style={kpiGrid}>
        <KpiCard icon="🗑️" label="Pertes (activités + labos)" value={fmtDT(k.total)} accent="#ef4444" />
        <KpiCard icon="📉" label="Poids vs CA" value={k.pct_ca != null ? `${fmtNum(k.pct_ca)}%` : '—'} accent={k.pct_ca != null && k.pct_ca > 5 ? '#dc2626' : '#2563eb'} sub="pertes / chiffre d'affaires" />
      </div>
      <ChartCard title="Évolution des pertes" height={240}>
        <TimeBarChart data={data.evolution ?? []} grain={data.grain} color="#ef4444" />
      </ChartCard>
      <div style={{ height: 14 }} />
      <div style={twoCols}>
        <ChartCard title="Par type" height={240}>
          <DonutChart data={(data.par_type ?? []).map((t: any) => ({ ...t, label: t.type === 'avarie' ? 'Avaries' : 'Déchets' }))} nameKey="label" />
        </ChartCard>
        <ChartCard title="Par site (activités et labos)" height="auto">
          <HBarList rows={data.par_site ?? []} labelKey="site" color="#8b5cf6" max={10} />
        </ChartCard>
      </div>
      <div style={twoCols}>
        <ChartCard title="Par catégorie" height="auto">
          <HBarList rows={data.par_categorie ?? []} labelKey="categorie" color="#f59e0b" max={10} />
        </ChartCard>
        <ChartCard title="Articles les plus perdus" height="auto">
          <HBarList rows={data.top_articles ?? []} labelKey="article" color="#ef4444" max={10} />
        </ChartCard>
      </div>
    </>
  );
}

function LaboTab({ data }: { data: any }) {
  if (data.vide) return <EmptyHint text="Aucun labo dans le périmètre." />;
  const k = data.kpis ?? {};
  return (
    <>
      <div style={kpiGrid}>
        <KpiCard icon="🏬" label="Valeur du stock labo" value={fmtDT(k.valeur_stock)} accent="#8b5cf6" sub="à l'instant" />
        <KpiCard icon="🛒" label="Achats (période)" value={fmtDT(k.appros)} sub={`${k.nb_appros} appro${k.nb_appros > 1 ? 's' : ''}`} />
        <KpiCard icon="🏭" label="Production PT" value={fmtDT(k.production_pt)} accent="#0d9488" sub={`${k.nb_productions} production${k.nb_productions > 1 ? 's' : ''}`} />
        <KpiCard icon="🔁" label="Transferts émis" value={fmtDT(k.transferts)} accent="#2563eb" sub={`${k.nb_transferts} transfert${k.nb_transferts > 1 ? 's' : ''}`} />
        <KpiCard icon="🗑️" label="Pertes labo" value={fmtDT(k.pertes)} accent="#ef4444" />
        {k.ventes_labo > 0 && <KpiCard icon="💵" label="Ventes labo" value={fmtDT(k.ventes_labo)} sub={`${k.nb_ventes_labo} vente${k.nb_ventes_labo > 1 ? 's' : ''}`} />}
      </div>
      <div style={twoCols}>
        <ChartCard title="Production par produit (valeur)" height="auto">
          <HBarList rows={data.production_par_produit ?? []} labelKey="nom" color="#0d9488" max={8} />
        </ChartCard>
        <ChartCard title="Transferts par activité destinataire" height={260}>
          <DonutChart data={data.transferts_par_activite ?? []} nameKey="activite" />
        </ChartCard>
      </div>
      <div style={twoCols}>
        <ChartCard title="Articles les plus transférés" height="auto">
          <HBarList rows={data.top_transferts ?? []} labelKey="nom" color="#2563eb" max={8} />
        </ChartCard>
        <ChartCard title="Pertes par type" height="auto">
          <HBarList rows={(data.pertes_par_type ?? []).map((t: any) => ({ ...t, label: t.type === 'avarie' ? 'Avaries' : 'Déchets' }))} labelKey="label" color="#ef4444" max={4} />
        </ChartCard>
      </div>
    </>
  );
}

const alertPill = (bg: string, color: string): React.CSSProperties => ({
  background: bg, color, borderRadius: 20, padding: '7px 14px', fontSize: '0.78rem', fontWeight: 700,
});
