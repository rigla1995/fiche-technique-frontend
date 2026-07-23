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

type TabKey = 'overview' | 'ventes' | 'achats' | 'pertes' | 'labo' | 'acheteurs';

const TABS: { key: TabKey; icon: string; label: string }[] = [
  { key: 'overview', icon: '📊', label: "Vue d'ensemble" },
  { key: 'ventes', icon: '💰', label: 'Ventes & marges' },
  { key: 'achats', icon: '📦', label: 'Achats & stock' },
  { key: 'pertes', icon: '🗑️', label: 'Pertes' },
  { key: 'labo', icon: '🧪', label: 'Labo' },
  { key: 'acheteurs', icon: '🤝', label: 'Acheteurs (B2B)' },
];

// Onglets visibles selon la CONFIG RÉELLE du compte (activités/labos existants,
// modules actifs) — le tableau de bord suit l'abonnement et s'adapte à chaque
// ajout de capacité. Tant que les options ne sont pas chargées, on garde le
// comportement historique (tout sauf labo/acheteurs) pour éviter le flash.
const computeTabsVisibles = (options: FiltresOptions | null) => {
  if (!options) return TABS.filter((t) => t.key !== 'labo' && t.key !== 'acheteurs');
  const hasAct = options.activites.length > 0;
  const hasLabo = options.labos.length > 0;
  // `modules` absent (backend pas encore à jour pendant un déploiement) :
  // vente ⇒ permissif (comportement historique — ne JAMAIS masquer Vue d'ensemble
  // et Ventes par défaut) ; acheteurs ⇒ restrictif (l'ancien backend ne connaît
  // pas l'onglet et répondrait 400).
  const vente = options.modules?.vente ?? true;
  const acheteurs = options.modules?.acheteurs ?? false;
  return TABS.filter((t) => {
    switch (t.key) {
      case 'overview': return hasAct && vente;   // vue centrée ventes/marges
      case 'ventes': return hasAct && vente;
      case 'achats': return hasAct;
      case 'pertes': return hasAct || hasLabo;
      case 'labo': return hasLabo;
      case 'acheteurs': return acheteurs;
      default: return true;
    }
  });
};

// Onglet d'atterrissage selon la config (ex. compte dépôt → Labo).
const TAB_PRIORITE: TabKey[] = ['overview', 'achats', 'labo', 'acheteurs', 'ventes', 'pertes'];
const pickDefaultTab = (visibles: { key: TabKey }[]): TabKey => {
  const keys = new Set(visibles.map((t) => t.key));
  return TAB_PRIORITE.find((k) => keys.has(k)) ?? visibles[0]?.key ?? 'overview';
};

const fmtIso = (d: Date) => d.toISOString().slice(0, 10);
const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

// Période par défaut : du 1er du mois courant à aujourd'hui.
const defaultRange = (): { from: string; to: string } => {
  const now = new Date();
  return { from: fmtIso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))), to: fmtIso(now) };
};

interface FiltresOptions {
  activites: { id: number; nom: string }[];
  labos: { id: number; nom: string }[];
  prestataires: { id: string; nom: string }[];
  categories_produit: { id: number; nom: string; type_produit?: 'vendable' | 'supplement' | 'valorise' | null }[];
  categories_articles: { id: number; nom: string }[];
  familles: { id: number; nom: string }[];
  fournisseurs: { id: number; nom: string }[];
  role: string;
  /** Métadonnées de config (backend tab=filtres) — pilotent les onglets visibles. */
  modules?: { vente: boolean; acheteurs: boolean };
  formule_activites?: 'basique' | 'premium' | null;
}

interface FiltresState {
  activites: string[]; labos: string[]; canaux: string[]; prestataires: string[];
  catProduits: string[]; typesProduit: string[]; catArticles: string[];
  familles: string[]; fournisseurs: string[]; typesPerte: string[]; sources: string[];
}

const FILTRE_KEYS: (keyof FiltresState)[] = ['activites', 'labos', 'canaux', 'prestataires', 'catProduits', 'typesProduit', 'catArticles', 'familles', 'fournisseurs', 'typesPerte', 'sources'];
const emptyFiltres = (): FiltresState => ({ activites: [], labos: [], canaux: [], prestataires: [], catProduits: [], typesProduit: [], catArticles: [], familles: [], fournisseurs: [], typesPerte: [], sources: [] });

// Filtres pertinents par onglet (les autres ne s'affichent pas).
const FILTRES_PAR_TAB: Record<TabKey, (keyof FiltresState)[]> = {
  overview: ['activites', 'canaux', 'prestataires', 'catProduits', 'typesProduit'],
  ventes: ['activites', 'canaux', 'prestataires', 'catProduits', 'typesProduit'],
  achats: ['activites', 'catArticles', 'familles', 'fournisseurs'],
  pertes: ['activites', 'labos', 'catArticles', 'familles', 'typesPerte'],
  labo: ['labos'],
  acheteurs: ['labos', 'sources'],
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
// Type de vente de l'onglet Acheteurs (B2B) : manuelle (saisie vendeur) ou portail.
const SOURCES_B2B_OPTS: MultiSelectOption[] = [
  { value: 'client', label: 'Vente manuelle' },
  { value: 'portail', label: 'Portail acheteur' },
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
    // Dates : URL uniquement (une visite fraîche repart toujours du défaut
    // « 1er du mois → aujourd'hui » — on ne restaure pas une période périmée).
    const def = defaultRange();
    const urlFrom = searchParams.get('from') ?? '';
    const urlTo = searchParams.get('to') ?? '';
    const range = isIsoDate(urlFrom) && isIsoDate(urlTo) ? { from: urlFrom, to: urlTo } : def;
    const filtres = emptyFiltres();
    for (const k of FILTRE_KEYS) filtres[k] = String(get(k) || '').split(',').filter(Boolean);
    const tab = (TABS.some((t) => t.key === get('tab')) ? get('tab') : 'overview') as TabKey;
    return { tab, ...range, filtres };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [tab, setTab] = useState<TabKey>(init.tab);
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [filtres, setFiltres] = useState<FiltresState>(init.filtres);
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Options des filtres + config (au montage, puis à chaque ajout de capacité —
  // création d'activité ou de labo — signalé par les événements globaux).
  const fetchOptions = useCallback(() => {
    api.get('/api/dashboard/v2?tab=filtres').then(({ data: d }) => setOptions(d)).catch(() => setOptions(null));
  }, []);
  useEffect(() => {
    fetchOptions();
    window.addEventListener('activites-changed', fetchOptions);
    window.addEventListener('labos-changed', fetchOptions);
    return () => {
      window.removeEventListener('activites-changed', fetchOptions);
      window.removeEventListener('labos-changed', fetchOptions);
    };
  }, [fetchOptions]);

  // Persistance URL + localStorage (les dates ne vivent que dans l'URL, et seulement
  // si l'utilisateur a quitté le défaut du jour — sinon un F5/marque-page figerait
  // la période sur des dates périmées au lieu de re-résoudre « 1er du mois → aujourd'hui »).
  useEffect(() => {
    const def = defaultRange();
    const params: Record<string, string> = { tab };
    if (from !== def.from || to !== def.to) { params.from = from; params.to = to; }
    for (const k of FILTRE_KEYS) if (filtres[k].length) params[k] = filtres[k].join(',');
    setSearchParams(params, { replace: true });
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...params, from: undefined, to: undefined })); } catch { /* stockage indisponible : tant pis */ }
    // setSearchParams volontairement hors deps : son identité peut changer à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, from, to, filtres]);

  // Chargement des données de l'onglet courant.
  const load = useCallback(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setErreur(false);
    // Bornes remises dans l'ordre si l'utilisateur les inverse.
    const [f, t] = from <= to ? [from, to] : [to, from];
    const qs = new URLSearchParams({ tab, from: f, to: t });
    for (const k of FILTRE_KEYS) if (filtres[k].length) qs.set(k, filtres[k].join(','));
    api.get(`/api/dashboard/v2?${qs.toString()}`, { signal: ctrl.signal })
      .then(({ data: d }) => { setData(d); setLoading(false); })
      .catch((e) => { if (e?.code !== 'ERR_CANCELED') { setErreur(true); setLoading(false); } });
  }, [tab, from, to, filtres]);
  useEffect(() => { load(); }, [load]);

  const setFiltre = (k: keyof FiltresState) => (values: string[]) => setFiltres((f) => ({ ...f, [k]: values }));
  const filtresActifs = FILTRE_KEYS.reduce((n, k) => n + (filtres[k].length ? 1 : 0), 0);
  const visibles = FILTRES_PAR_TAB[tab];
  // Filtres posés sur un autre onglet, invisibles ici (ils n'affectent pas ces données).
  const filtresCaches = FILTRE_KEYS.reduce((n, k) => n + (filtres[k].length && !visibles.includes(k) ? 1 : 0), 0);
  const tabsVisibles = computeTabsVisibles(options);

  // Onglet courant devenu invisible (config chargée, capacité retirée, vieux lien
  // ?tab= ou localStorage) → bascule vers l'onglet d'atterrissage de la config.
  useEffect(() => {
    if (!options) return;
    const vis = computeTabsVisibles(options);
    if (!vis.some((t) => t.key === tab)) setTab(pickDefaultTab(vis));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  const toOpts = (rows: { id: number | string; nom: string }[]): MultiSelectOption[] =>
    rows.map((r) => ({ value: String(r.id), label: r.nom }));

  // Catégories produits : le type préfixe le nom (« P. Vendable / Burger » vs
  // « P. Valorisé / Burger ») — deux catégories homonymes restent différenciables.
  const TYPE_PRODUIT_PREFIX: Record<string, string> = {
    vendable: 'P. Vendable', supplement: 'Supplément', valorise: 'P. Valorisé',
  };
  const toCatProduitOpts = (rows: FiltresOptions['categories_produit']): MultiSelectOption[] =>
    rows.map((r) => ({
      value: String(r.id),
      label: r.type_produit && TYPE_PRODUIT_PREFIX[r.type_produit]
        ? `${TYPE_PRODUIT_PREFIX[r.type_produit]} / ${r.nom}`
        : r.nom,
    }));

  // ── Export Excel de l'onglet courant ──
  const [exporting, setExporting] = useState(false);
  const exportExcel = async () => {
    if (!data || exporting) return;
    setExporting(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const { brandHeader, headerRow, dataRowStyle, brandFooter, finalize, BRAND, FMT_DT } =
        await import('../../services/excelBrand');
      const tabDef = TABS.find((t) => t.key === tab)!;

      // Auto-détection des sections (inchangée) : KPIs scalaires, puis chaque
      // liste (tableau d'objets) renvoyée par l'onglet courant.
      const kpis = (data.kpis ?? {}) as Record<string, unknown>;
      const kpiEntries = Object.entries(kpis).filter(([, v]) => typeof v !== 'object' || v === null);
      const listes = (Object.entries(data) as [string, unknown][]).filter(
        ([, v]) => Array.isArray(v) && v.length > 0 && typeof v[0] === 'object' && v[0] !== null,
      ) as [string, Record<string, unknown>[]][];

      const human = (s: string) => s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
      // Montants en DT — heuristique sur les clés (jamais les compteurs/pourcentages).
      const isMoney = (k: string) =>
        !/(^|_)(nb|pct|pts|qte|quantite|seuil|jours|part)(_|$)/.test(k)
        && /(^|_)(ca|marge|valeur|montant|total|pertes?|achats?|commissions?|panier|couts?|prix|appros?|transferts?|production|ventes?|ht|tva|timbre|charges?)(_|$)/.test(k);
      const cellValue = (v: unknown) =>
        typeof v === 'number' || typeof v === 'string' ? v : v == null ? '' : String(v);

      const colCount = Math.max(2, ...listes.map(([, rows]) => Object.keys(rows[0]).length));
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(tabDef.label);
      let r = await brandHeader(wb, ws, {
        titre: `Tableau de bord — ${tabDef.label}`,
        sousTitre: 'Montants en TTC · filtres du tableau de bord appliqués',
        meta: `Exporté le ${new Date().toLocaleDateString('fr-FR')} · Onglet ${tabDef.label} · Période ${from} → ${to}`,
        colCount,
      });

      const sectionTitle = (titre: string) => {
        ws.mergeCells(r, 1, r, colCount);
        const cell = ws.getCell(r, 1);
        cell.value = titre;
        cell.font = { name: 'Calibri', size: 11.5, bold: true, color: { argb: BRAND.indigoInk } };
        ws.getRow(r).height = 20;
        r += 1;
      };

      // Section KPIs — liste « Indicateur / Valeur », lisible quel que soit l'onglet.
      if (kpiEntries.length) {
        sectionTitle('Indicateurs');
        headerRow(ws, r, ['Indicateur', 'Valeur']);
        r += 1;
        kpiEntries.forEach(([k, v], i) => {
          const row = ws.getRow(r);
          row.getCell(1).value = human(k);
          row.getCell(2).value = cellValue(v);
          if (typeof v === 'number' && isMoney(k)) row.getCell(2).numFmt = FMT_DT;
          dataRowStyle(row, { index: i, colCount: 2 });
          r += 1;
        });
        r += 1; // respiration entre sections
      }

      // Sections listes — en-têtes charte + zébrage.
      for (const [key, rows] of listes) {
        const keys = Object.keys(rows[0]);
        sectionTitle(human(key));
        headerRow(ws, r, keys.map(human));
        r += 1;
        rows.forEach((rec, i) => {
          const row = ws.getRow(r);
          keys.forEach((k, ci) => {
            const v = rec[k];
            row.getCell(ci + 1).value = cellValue(v);
            if (typeof v === 'number' && isMoney(k)) row.getCell(ci + 1).numFmt = FMT_DT;
          });
          dataRowStyle(row, { index: i, colCount: keys.length });
          r += 1;
        });
        r += 1;
      }

      ws.getColumn(1).width = 30;
      for (let c = 2; c <= colCount; c++) ws.getColumn(c).width = 17;
      brandFooter(ws, colCount);
      // Bandeau + filet + méta figés au défilement ; pas d'auto-filtre (multi-sections).
      finalize(ws, { headerRowIdx: 5, colCount, lastDataRow: r - 1, autoFilter: false });
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
              {(() => {
                // Sous-titre fidèle à la config : on n'annonce que ce que le compte couvre.
                const keys = new Set(tabsVisibles.map((t) => t.key));
                const parts: string[] = [];
                if (keys.has('ventes') || keys.has('overview')) parts.push('ventes, marges');
                if (keys.has('achats')) parts.push('achats, stocks');
                if (keys.has('pertes')) parts.push('pertes');
                if (keys.has('labo')) parts.push('labo');
                if (keys.has('acheteurs')) parts.push('ventes B2B');
                return `Pilotage complet : ${parts.join(', ') || 'votre activité'} — tout en TTC.`;
              })()}
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
        {/* Période — même gabarit que les autres champs de filtre. */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '4px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff' }}>
          <span>📅</span>
          <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Période</span>
          <input type="date" value={from} max={to || undefined} onChange={(e) => e.target.value && setFrom(e.target.value)} style={dateInp} aria-label="Date début" />
          <span style={{ color: '#94a3b8' }}>→</span>
          <input type="date" value={to} min={from || undefined} onChange={(e) => e.target.value && setTo(e.target.value)} style={dateInp} aria-label="Date fin" />
        </div>
        <div style={{ width: 1, alignSelf: 'stretch', background: '#e2e8f0', margin: '0 4px' }} />
        {options && (
          <>
            {visibles.includes('activites') && <MultiSelectFilter label="Activités" icon="🏪" options={toOpts(options.activites)} selected={filtres.activites} onChange={setFiltre('activites')} />}
            {visibles.includes('labos') && <MultiSelectFilter label="Labos" icon="🧪" options={toOpts(options.labos)} selected={filtres.labos} onChange={setFiltre('labos')} />}
            {visibles.includes('sources') && <MultiSelectFilter label="Type de vente" icon="🛒" options={SOURCES_B2B_OPTS} selected={filtres.sources} onChange={setFiltre('sources')} alwaysShow />}
            {visibles.includes('canaux') && <MultiSelectFilter label="Type de vente" icon="🛒" options={CANAUX_OPTS} selected={filtres.canaux} onChange={setFiltre('canaux')} />}
            {visibles.includes('prestataires') && <MultiSelectFilter label="Prestataires" icon="🚚" options={toOpts(options.prestataires)} selected={filtres.prestataires} onChange={setFiltre('prestataires')} />}
            {visibles.includes('catProduits') && <MultiSelectFilter label="Catégories produits" icon="🍽️" options={toCatProduitOpts(options.categories_produit)} selected={filtres.catProduits} onChange={setFiltre('catProduits')} alwaysShow />}
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

      {/* Contenu — on ne rend un onglet QUE si les données chargées lui appartiennent
          (au changement d'onglet, `data` contient encore la réponse de l'onglet précédent
          pendant un rendu, avant que le chargement ne démarre). */}
      {erreur ? (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 12, padding: '16px 20px', fontSize: '0.88rem' }}>
          Impossible de charger le tableau de bord.{' '}
          <button onClick={load} style={{ border: 'none', background: 'none', color: '#b91c1c', fontWeight: 800, cursor: 'pointer', textDecoration: 'underline' }}>Réessayer</button>
        </div>
      ) : loading || !data || data.tab !== tab ? (
        <div className="loading-text" style={{ padding: 40 }}>Chargement…</div>
      ) : (
        <>
          {tab === 'overview' && <OverviewTab data={data} />}
          {tab === 'ventes' && <VentesTab data={data} />}
          {tab === 'achats' && <AchatsTab data={data} />}
          {tab === 'pertes' && <PertesTab data={data} />}
          {tab === 'labo' && <LaboTab data={data} moduleAcheteurs={!!options?.modules?.acheteurs} />}
          {tab === 'acheteurs' && <AcheteursTab data={data} />}
        </>
      )}
    </div>
  );
}

const dateInp: React.CSSProperties = { padding: '5px 6px', borderRadius: 8, border: 'none', background: '#f8fafc', fontSize: '0.78rem', fontWeight: 600, color: '#475569', fontFamily: 'inherit', outline: 'none' };
const kpiGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(195px, 1fr))', gap: 10, marginBottom: 16 };
const twoCols: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 14, marginBottom: 14 };

// ─────────────────────────────────────────────────────────────────────────────
// Onglets
// ─────────────────────────────────────────────────────────────────────────────
/* eslint-disable @typescript-eslint/no-explicit-any */

function OverviewTab({ data }: { data: any }) {
  if (data.vide || !data.kpis) return <EmptyHint text="Aucune donnée dans le périmètre." />;
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
        {/* Présent seulement si le module Acheteurs est actif (champ omis sinon) */}
        {(k as any).ventes_acheteurs != null && (
          <KpiCard icon="🤝" label="Ventes acheteurs (B2B)" value={fmtDT((k as any).ventes_acheteurs)} accent="#6d28d9"
            sub={`${(k as any).nb_ventes_acheteurs ?? 0} facture${((k as any).nb_ventes_acheteurs ?? 0) > 1 ? 's' : ''} — hors CA activités`} />
        )}
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
  if (data.vide) return <EmptyHint text="Aucune donnée dans le périmètre." />;
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

function LaboTab({ data, moduleAcheteurs = false }: { data: any; moduleAcheteurs?: boolean }) {
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
        {/* Module actif : la carte reste visible même à 0 (le compte suit son option) */}
        {(moduleAcheteurs || k.ventes_acheteurs > 0 || k.nb_ventes_acheteurs > 0) && (
          <KpiCard icon="🤝" label="Ventes acheteurs" value={fmtDT(k.ventes_acheteurs)} accent="#6d28d9"
            sub={`${k.nb_ventes_acheteurs} facture${k.nb_ventes_acheteurs > 1 ? 's' : ''} (TTC)`} />
        )}
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

// Onglet Acheteurs (B2B) — CA facturé, fiscalité, commandes et carnet.
// Conventions module : flux = commandes expédiées/livrées, montants TTC facturés.
function AcheteursTab({ data }: { data: any }) {
  if (data.vide) return <EmptyHint text="Le module Acheteurs n'est pas actif sur ce compte." />;
  const k = data.kpis ?? {};
  const STATUT_LABELS: Record<string, string> = {
    en_attente: 'En attente', expediee: 'Expédiées', livree: 'Livrées', annulee: 'Annulées',
  };
  const achCols: ColonneDef<any>[] = [
    { key: 'acheteur', label: 'Acheteur', align: 'left', fmt: (v) => <strong>{String(v)}</strong> },
    { key: 'nb', label: 'Factures', fmt: (v) => fmtNum(Number(v)) },
    { key: 'valeur', label: 'CA TTC', fmt: (v) => <strong>{fmtDT(Number(v))}</strong> },
  ];
  return (
    <>
      <div style={kpiGrid}>
        <KpiCard icon="💵" label="CA acheteurs (TTC)" value={fmtDT(k.ca)} delta={k.deltas?.ca} accent="#6d28d9"
          sub={`${k.nb_factures} facture${k.nb_factures > 1 ? 's' : ''}`} />
        <KpiCard icon="🧾" label="Total HT" value={fmtDT(k.total_ht)} sub={`TVA ${fmtDT(k.total_tva)}${k.total_timbre > 0 ? ` · timbre ${fmtDT(k.total_timbre)}` : ''}`} />
        <KpiCard icon="⏳" label="Commandes en attente" value={String(k.commandes_en_attente ?? 0)}
          accent={k.commandes_en_attente > 0 ? '#d97706' : '#16a34a'} sub="à traiter (tous labos)" />
        <KpiCard icon="🤝" label="Acheteurs servis" value={String(k.acheteurs_factures ?? 0)} accent="#2563eb"
          sub={`carnet : ${k.carnet_actifs ?? 0} actif${(k.carnet_actifs ?? 0) > 1 ? 's' : ''} / ${k.carnet_total ?? 0}`} />
      </div>
      <ChartCard title={`Évolution du CA acheteurs (par ${data.grain === 'day' ? 'jour' : data.grain === 'week' ? 'semaine' : 'mois'})`} height={240}>
        <TimeBarChart data={data.evolution ?? []} grain={data.grain} color="#6d28d9" />
      </ChartCard>
      <div style={{ height: 14 }} />
      <div style={twoCols}>
        <ChartCard title="🏆 Meilleurs acheteurs (CA TTC)" height="auto">
          <SortableTable rows={data.top_acheteurs ?? []} colonnes={achCols} defaultSort="valeur" maxHeight={300} />
        </ChartCard>
        <ChartCard title="Commandes de la période par état" height={260}>
          <DonutChart data={(data.par_statut ?? []).map((s: any) => ({ ...s, label: STATUT_LABELS[s.statut] ?? s.statut }))}
            nameKey="label" valueKey="nb"
            formatter={(v) => `${fmtNum(v)} commande${v > 1 ? 's' : ''}`} />
        </ChartCard>
      </div>
      <ChartCard title="Articles les plus vendus aux acheteurs (TTC)" height="auto">
        <HBarList rows={data.top_articles ?? []} labelKey="nom" valueKey="valeur" color="#6d28d9" max={10} />
      </ChartCard>
    </>
  );
}

const alertPill = (bg: string, color: string): React.CSSProperties => ({
  background: bg, color, borderRadius: 20, padding: '7px 14px', fontSize: '0.78rem', fontWeight: 700,
});
