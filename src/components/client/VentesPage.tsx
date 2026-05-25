import { useState, useEffect, useCallback, useContext, createContext } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../../api/client';
import type { Activite } from '../../types';

const apiMsg = (e: unknown, fallback = 'Erreur serveur') =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

const fmtDate = (iso: string | null | undefined) => {
  if (!iso || iso.length < 10) return iso ?? '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

const fmtMoney = (n: number | null | undefined) => {
  if (n == null) return '—';
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' DT';
};

const C = '#b45309';
const CD = '#78350f';
const CL = '#fffbeb';
const CB = '#fcd34d';
const PAGE = 5;

const ExcelIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
    <rect width="24" height="24" rx="3" fill="#1D6F42"/>
    <path d="M7 7l3.5 5L7 17h2.5l2.5-3.5L14.5 17H17l-3.5-5L17 7h-2.5L12 10.5 9.5 7H7z" fill="white"/>
  </svg>
);

// ── Interfaces ────────────────────────────────────────────────────────────────

interface ArticleVendable {
  id: string;
  activite_id: number;
  article_type: 'produit';
  article_id: number;
  prix_vente: number;
  actif: boolean;
  nom: string;
  unite_nom?: string | null;
  is_supplement?: boolean;
}

interface ActivitePrestataire {
  id: string;
  prestataire_id: string;
  prestataire_nom: string;
  taux_commission: number;
  actif: boolean;
}

interface ArticlePrixPrestataire {
  article_vendable_id: string;
  activite_prestataire_id: string;
  prix_vente: number | null;
}

interface Vente {
  id: string;
  date_vente: string;
  type_vente: 'directe' | 'prestataire';
  statut: string;
  prestataire_nom?: string | null;
  total_ca: number;
  total_marge: number;
  notes?: string | null;
}

type Tab = 'saisie_produits' | 'saisie_supplements' | 'historique';

// ── Context ───────────────────────────────────────────────────────────────────

interface VPCtxType {
  activePrests: ActivitePrestataire[];
  prixPrestataires: ArticlePrixPrestataire[];
  allArticles: ArticleVendable[];
  qtes: Record<string, Record<string, string>>;
  setQtes: React.Dispatch<React.SetStateAction<Record<string, Record<string, string>>>>;
  dateVente: string;
  setDateVente: React.Dispatch<React.SetStateAction<string>>;
  saving: boolean;
  saveError: string;
  saveSuccess: boolean;
  handleSubmit: () => void;
  selectedVenteIds: Set<string>;
  toggleSelectVente: (id: string) => void;
}

const VPCtx = createContext<VPCtxType>(null!);

// ── Module-level helpers ──────────────────────────────────────────────────────

function calcPrixPrestataire(
  articleId: string,
  apId: string,
  allArticles: ArticleVendable[],
  prixPrestataires: ArticlePrixPrestataire[],
  activePrests: ActivitePrestataire[]
): number {
  const av = allArticles.find(a => a.id === articleId);
  if (!av) return 0;
  const override = prixPrestataires.find(p => p.article_vendable_id === articleId && p.activite_prestataire_id === apId);
  if (override?.prix_vente != null) return override.prix_vente;
  const ap = activePrests.find(p => p.id === apId);
  return ap ? av.prix_vente * (1 - ap.taux_commission / 100) : av.prix_vente;
}

// ── Module-level sub-components ───────────────────────────────────────────────

function PaginationBar({ total, page, setPage }: { total: number; page: number; setPage: (p: number) => void }) {
  const totalPages = Math.ceil(total / PAGE);
  if (totalPages <= 1) return null;
  return (
    <div style={{ display: 'flex', gap: 4, padding: '10px 16px', alignItems: 'center', borderTop: `1px solid ${CB}`, justifyContent: 'center' }}>
      <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
        style={{ padding: '3px 10px', borderRadius: 6, border: `1px solid ${CB}`, background: page === 0 ? '#f3f4f6' : '#fff', color: page === 0 ? '#9ca3af' : C, cursor: page === 0 ? 'default' : 'pointer', fontWeight: 600, fontSize: '0.8rem' }}>‹</button>
      {Array.from({ length: totalPages }, (_, i) => (
        <button key={i} onClick={() => setPage(i)}
          style={{ padding: '3px 9px', borderRadius: 6, border: `1.5px solid ${i === page ? C : CB}`, background: i === page ? C : '#fff', color: i === page ? '#fff' : CD, cursor: 'pointer', fontWeight: i === page ? 700 : 400, fontSize: '0.8rem' }}>
          {i + 1}
        </button>
      ))}
      <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
        style={{ padding: '3px 10px', borderRadius: 6, border: `1px solid ${CB}`, background: page >= totalPages - 1 ? '#f3f4f6' : '#fff', color: page >= totalPages - 1 ? '#9ca3af' : C, cursor: page >= totalPages - 1 ? 'default' : 'pointer', fontWeight: 600, fontSize: '0.8rem' }}>›</button>
    </div>
  );
}

function DateBar() {
  const { dateVente, setDateVente, saving, saveError, saveSuccess, handleSubmit } = useContext(VPCtx);
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: `1.5px solid ${CB}`, padding: '16px 20px', marginBottom: 20, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
      <div>
        <label style={{ fontSize: '0.78rem', fontWeight: 700, display: 'block', marginBottom: 5, color: C, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date de vente</label>
        <input type="date" value={dateVente} onChange={e => setDateVente(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 9, border: `1.5px solid ${CB}`, background: CL, color: CD, fontWeight: 600, outline: 'none' }} />
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
        {saveError && <div style={{ color: '#dc2626', fontSize: '0.82rem' }}>{saveError}</div>}
        {saveSuccess && <div style={{ color: '#166534', fontSize: '0.82rem', fontWeight: 600 }}>✓ Ventes enregistrées !</div>}
        <button onClick={handleSubmit} disabled={saving}
          style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: saving ? '#d1d5db' : `linear-gradient(135deg, ${CD} 0%, ${C} 100%)`, color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.92rem', boxShadow: saving ? 'none' : `0 4px 14px ${C}44`, whiteSpace: 'nowrap' }}>
          {saving ? 'Enregistrement…' : '✓ Confirmer les ventes'}
        </button>
      </div>
    </div>
  );
}

function ArticleRow({ av }: { av: ArticleVendable }) {
  const { activePrests, prixPrestataires, allArticles, qtes, setQtes } = useContext(VPCtx);
  const getQte = (channel: string) => qtes[av.id]?.[channel] ?? '';
  const setQte = (channel: string, val: string) =>
    setQtes(prev => ({ ...prev, [av.id]: { ...prev[av.id], [channel]: val } }));

  return (
    <tr style={{ borderBottom: `1px solid ${CB}` }}>
      <td style={{ padding: '11px 16px' }}>
        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: CD }}>{av.nom}</div>
        {av.unite_nom && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{av.unite_nom}</div>}
      </td>
      <td style={{ padding: '8px 16px', textAlign: 'center' }}>
        <span style={{ fontWeight: 700, color: C, fontSize: '0.9rem' }}>{fmtMoney(av.prix_vente)}</span>
      </td>
      <td style={{ padding: '8px 16px', textAlign: 'center' }}>
        <input type="number" min="0" step="0.001" value={getQte('direct')} placeholder="0"
          onChange={e => setQte('direct', e.target.value)}
          style={{ width: 78, padding: '7px 8px', borderRadius: 8, border: `1.5px solid ${getQte('direct') ? C : CB}`, background: getQte('direct') ? CL : '#fafafa', textAlign: 'center', fontSize: '0.88rem', fontWeight: 600, outline: 'none' }} />
      </td>
      {activePrests.map(ap => {
        const prix = calcPrixPrestataire(av.id, ap.id, allArticles, prixPrestataires, activePrests);
        return (
          <td key={ap.id} style={{ padding: '8px 16px', textAlign: 'center' }}>
            <input type="number" min="0" step="0.001" value={getQte(ap.id)} placeholder="0"
              onChange={e => setQte(ap.id, e.target.value)}
              style={{ width: 78, padding: '7px 8px', borderRadius: 8, border: `1.5px solid ${getQte(ap.id) ? C : CB}`, background: getQte(ap.id) ? CL : '#fafafa', textAlign: 'center', fontSize: '0.88rem', fontWeight: 600, outline: 'none' }} />
            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 2 }}>{fmtMoney(prix)}</div>
          </td>
        );
      })}
    </tr>
  );
}

function SaisieTable({ subset, page, setPage, label }: {
  subset: ArticleVendable[];
  page: number;
  setPage: (p: number) => void;
  label: string;
}) {
  const { activePrests, prixPrestataires, allArticles, qtes } = useContext(VPCtx);
  const slice = subset.slice(page * PAGE, page * PAGE + PAGE);

  const caTotal = subset.reduce((acc, av) => {
    const direct = (parseFloat(qtes[av.id]?.['direct'] ?? '') || 0) * av.prix_vente;
    const presta = activePrests.reduce((s, ap) => {
      const prix = calcPrixPrestataire(av.id, ap.id, allArticles, prixPrestataires, activePrests);
      return s + (parseFloat(qtes[av.id]?.[ap.id] ?? '') || 0) * prix;
    }, 0);
    return acc + direct + presta;
  }, 0);

  return (
    <div style={{ background: '#fff', borderRadius: 14, border: `1.5px solid ${CB}`, overflow: 'hidden', boxShadow: '0 2px 12px rgba(180,83,9,0.08)' }}>
      <div style={{ padding: '10px 16px', background: `${CD}10`, borderBottom: `1px solid ${CB}`, fontSize: '0.75rem', fontWeight: 800, color: CD, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        {label}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
          <thead>
            <tr style={{ background: CL, borderBottom: `2px solid ${CB}` }}>
              <th style={{ padding: '11px 16px', textAlign: 'left', fontSize: '0.78rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Article</th>
              <th style={{ padding: '11px 16px', textAlign: 'center', fontSize: '0.78rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>Prix vente</th>
              <th style={{ padding: '11px 16px', textAlign: 'center', fontSize: '0.78rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>🏪 Qté directe</th>
              {activePrests.map(ap => (
                <th key={ap.id} style={{ padding: '11px 16px', textAlign: 'center', fontSize: '0.78rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                  🛵 {ap.prestataire_nom}
                  <div style={{ fontSize: '0.68rem', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'none' }}>−{ap.taux_commission}%</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map(av => <ArticleRow key={av.id} av={av} />)}
          </tbody>
        </table>
      </div>
      <PaginationBar total={subset.length} page={page} setPage={setPage} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 16px', borderTop: `1px solid ${CB}`, background: '#fafafa' }}>
        <div style={{ background: CL, borderRadius: 10, border: `1.5px solid ${C}`, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: CD, whiteSpace: 'nowrap' }}>CA total :</span>
          <span style={{ fontSize: '1.05rem', fontWeight: 800, color: C, whiteSpace: 'nowrap' }}>{fmtMoney(caTotal)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function VentesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activites, setActivites] = useState<Activite[]>([]);
  const [selectedActiviteId, setSelectedActiviteId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('saisie_produits');

  const [articles, setArticles] = useState<ArticleVendable[]>([]);
  const [prestataires, setPrestataires] = useState<ActivitePrestataire[]>([]);
  const [prixPrestataires, setPrixPrestataires] = useState<ArticlePrixPrestataire[]>([]);
  const [ventes, setVentes] = useState<Vente[]>([]);
  const [loading, setLoading] = useState(false);

  const [dateVente, setDateVente] = useState(new Date().toISOString().slice(0, 10));
  const [qtes, setQtes] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [prodPage, setProdPage] = useState(0);
  const [suppPage, setSuppPage] = useState(0);

  const [histDateFrom, setHistDateFrom] = useState('');
  const [histDateTo, setHistDateTo] = useState('');
  const [histType, setHistType] = useState<'all' | 'directe' | 'prestataire'>('all');
  const [histPrestaId, setHistPrestaId] = useState('');
  const [exportingXls, setExportingXls] = useState(false);
  const [selectedVenteIds, setSelectedVenteIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.get('/api/entreprise/activites').then(({ data }) => {
      const acts: Activite[] = data as Activite[];
      setActivites(acts);
      const paramId = searchParams.get('activiteId');
      const found = acts.find(a => String(a.id) === paramId);
      setSelectedActiviteId(found ? found.id : acts[0]?.id ?? null);
    }).catch(() => {});
  }, []);

  const loadData = useCallback(() => {
    if (!selectedActiviteId) return;
    setLoading(true);
    Promise.all([
      api.get(`/api/articles-vendables?activiteId=${selectedActiviteId}`),
      api.get(`/api/activite-prestataires?activiteId=${selectedActiviteId}`),
      api.get(`/api/article-prix-prestataire?activiteId=${selectedActiviteId}`),
      api.get(`/api/ventes?activiteId=${selectedActiviteId}`),
    ]).then(([av, ap, pp, v]) => {
      setArticles((av.data as ArticleVendable[]).filter(a => a.actif));
      setPrestataires((ap.data as ActivitePrestataire[]).filter(p => p.actif));
      setPrixPrestataires(pp.data as ArticlePrixPrestataire[]);
      setVentes(v.data as Vente[]);
      setQtes({});
      setProdPage(0);
      setSuppPage(0);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [selectedActiviteId]);

  useEffect(() => { loadData(); }, [loadData]);

  const activePrests = prestataires;
  const produits = articles.filter(a => !a.is_supplement);
  const supplements = articles.filter(a => a.is_supplement);

  const handleSubmit = async () => {
    if (!selectedActiviteId) return;
    setSaving(true); setSaveError(''); setSaveSuccess(false);

    const ventesToCreate: Array<{
      type_vente: 'directe' | 'prestataire';
      prestataire_id?: string;
      lignes: Array<{ article_type: string; article_id: number; quantite: number; prix_unitaire: number }>;
    }> = [];

    const directLignes = articles.flatMap(av => {
      const qte = parseFloat(qtes[av.id]?.['direct'] ?? '') || 0;
      if (qte <= 0) return [];
      return [{ article_type: av.article_type, article_id: av.article_id, quantite: qte, prix_unitaire: av.prix_vente }];
    });
    if (directLignes.length > 0) ventesToCreate.push({ type_vente: 'directe', lignes: directLignes });

    for (const ap of activePrests) {
      const lignes = articles.flatMap(av => {
        const qte = parseFloat(qtes[av.id]?.[ap.id] ?? '') || 0;
        if (qte <= 0) return [];
        const prix = calcPrixPrestataire(av.id, ap.id, articles, prixPrestataires, activePrests);
        return [{ article_type: av.article_type, article_id: av.article_id, quantite: qte, prix_unitaire: prix }];
      });
      if (lignes.length > 0) ventesToCreate.push({ type_vente: 'prestataire', prestataire_id: ap.prestataire_id, lignes });
    }

    if (ventesToCreate.length === 0) {
      setSaveError('Saisissez au moins une quantité > 0');
      setSaving(false);
      return;
    }

    try {
      for (const v of ventesToCreate) {
        await api.post('/api/ventes', {
          activite_id: selectedActiviteId,
          date_vente: dateVente,
          type_vente: v.type_vente,
          prestataire_id: v.prestataire_id || null,
          notes: null,
          lignes: v.lignes,
        });
      }
      setSaveSuccess(true);
      setQtes({});
      setDateVente(new Date().toISOString().slice(0, 10));
      loadData();
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e: unknown) {
      setSaveError(apiMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const toggleSelectVente = (id: string) => {
    setSelectedVenteIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleAnnuler = async (id: string) => {
    if (!confirm('Annuler cette vente et réintégrer le stock ?')) return;
    try { await api.delete(`/api/ventes/${id}`); loadData(); }
    catch (e: unknown) { alert(apiMsg(e)); }
  };

  const handleExportXls = async () => {
    if (!selectedActiviteId) return;
    setExportingXls(true);
    try {
      const params = new URLSearchParams({ activiteId: String(selectedActiviteId) });
      if (histDateFrom) params.set('from', histDateFrom);
      if (histDateTo) params.set('to', histDateTo);
      if (histType !== 'all') params.set('type', histType);
      if (histPrestaId) params.set('prestataireId', histPrestaId);
      if (selectedVenteIds.size > 0) params.set('selectedIds', [...selectedVenteIds].join(','));
      const resp = await api.get(`/api/ventes/export-excel?${params}`, { responseType: 'blob' });
      const url = URL.createObjectURL(resp.data as Blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'historique-ventes.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) { alert(apiMsg(e)); }
    finally { setExportingXls(false); }
  };

  const filteredVentes = ventes.filter(v => {
    if (histDateFrom && v.date_vente < histDateFrom) return false;
    if (histDateTo && v.date_vente > histDateTo) return false;
    if (histType !== 'all' && v.type_vente !== histType) return false;
    if (histPrestaId && v.prestataire_nom !== activePrests.find(p => p.id === histPrestaId)?.prestataire_nom) return false;
    return true;
  });

  const selectedActivite = activites.find(a => a.id === selectedActiviteId);

  const ctxValue: VPCtxType = {
    activePrests, prixPrestataires, allArticles: articles,
    qtes, setQtes,
    dateVente, setDateVente,
    saving, saveError, saveSuccess, handleSubmit,
    selectedVenteIds, toggleSelectVente,
  };

  return (
    <VPCtx.Provider value={ctxValue}>
      <div className="page-content">
        {/* Hero */}
        <div style={{
          background: `linear-gradient(135deg, ${CD} 0%, ${C} 55%, #d97706 100%)`,
          borderRadius: 18, padding: '24px 28px', marginBottom: 24,
          boxShadow: '0 8px 32px rgba(180,83,9,0.28)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>💰</div>
              <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>
                Ventes Activités{selectedActivite ? ` — ${selectedActivite.nom}` : ''}
              </h1>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.82)', margin: 0, fontSize: '0.85rem' }}>
              Saisissez vos ventes directes et via prestataires
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link to="/client/ventes/configuration" style={{ background: 'rgba(255,255,255,0.18)', color: '#fff', borderRadius: 20, padding: '5px 14px', fontSize: '0.82rem', fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.3)' }}>
              ⚙️ Configuration
            </Link>
            <Link to="/client/ventes/rapport" style={{ background: 'rgba(255,255,255,0.18)', color: '#fff', borderRadius: 20, padding: '5px 14px', fontSize: '0.82rem', fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.3)' }}>
              📊 Rapport
            </Link>
          </div>
        </div>

        {/* Activité selector */}
        {activites.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 20, padding: '10px 14px', background: '#fff', borderRadius: 10, border: `1px solid ${CB}` }}>
            {activites.map(a => (
              <button key={a.id} onClick={() => { setSelectedActiviteId(a.id); setSearchParams({ activiteId: String(a.id) }); }}
                style={{
                  padding: '4px 14px', borderRadius: 20, cursor: 'pointer', fontSize: '0.82rem',
                  border: selectedActiviteId === a.id ? `1.5px solid ${C}` : `1.5px solid ${CB}`,
                  background: selectedActiviteId === a.id ? C : CL,
                  color: selectedActiviteId === a.id ? '#fff' : CD,
                  fontWeight: selectedActiviteId === a.id ? 700 : 400,
                }}>
                {a.nom}
              </button>
            ))}
          </div>
        )}

        {!selectedActiviteId ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 0' }}>Aucune activité disponible</div>
        ) : (
          <>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, borderBottom: `2px solid ${CB}`, marginBottom: 24, overflowX: 'auto' }}>
              {([
                ['saisie_produits', '📝 Saisie des ventes produits'],
                ['saisie_supplements', '🧂 Saisie des ventes suppléments'],
                ['historique', '📋 Historique'],
              ] as const).map(([tab, label]) => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  style={{
                    padding: '9px 20px', background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: '0.92rem', fontWeight: activeTab === tab ? 700 : 400,
                    color: activeTab === tab ? C : 'var(--text)',
                    borderBottom: activeTab === tab ? `3px solid ${C}` : '3px solid transparent',
                    marginBottom: -2, whiteSpace: 'nowrap',
                  }}>
                  {label}
                </button>
              ))}
            </div>

            {/* ── SAISIE PRODUITS TAB ── */}
            {activeTab === 'saisie_produits' && (
              loading ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Chargement…</div>
              ) : produits.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0', background: '#fff', borderRadius: 14, border: `1.5px solid ${CB}` }}>
                  <div style={{ fontSize: '3rem', marginBottom: 12 }}>🛍️</div>
                  <div style={{ color: 'var(--text-muted)', marginBottom: 12 }}>Aucun produit vendable configuré pour cette activité</div>
                  <Link to="/client/ventes/configuration" style={{ color: C, fontWeight: 700, fontSize: '0.9rem' }}>
                    ⚙️ Configurer les prix de vente →
                  </Link>
                </div>
              ) : (
                <>
                  <DateBar />
                  <SaisieTable subset={produits} page={prodPage} setPage={setProdPage} label="🛍️ Produits vendables" />
                </>
              )
            )}

            {/* ── SAISIE SUPPLEMENTS TAB ── */}
            {activeTab === 'saisie_supplements' && (
              loading ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Chargement…</div>
              ) : supplements.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0', background: '#fff', borderRadius: 14, border: `1.5px solid ${CB}` }}>
                  <div style={{ fontSize: '3rem', marginBottom: 12 }}>🧂</div>
                  <div style={{ color: 'var(--text-muted)', marginBottom: 12 }}>Aucun supplément vendable configuré pour cette activité</div>
                  <Link to="/client/ventes/configuration" style={{ color: C, fontWeight: 700, fontSize: '0.9rem' }}>
                    ⚙️ Configurer les suppléments →
                  </Link>
                </div>
              ) : (
                <>
                  <DateBar />
                  <SaisieTable subset={supplements} page={suppPage} setPage={setSuppPage} label="🧂 Suppléments vendables" />
                </>
              )
            )}

            {/* ── HISTORIQUE TAB ── */}
            {activeTab === 'historique' && (
              loading ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Chargement…</div>
              ) : (
                <div style={{ background: '#fff', borderRadius: 14, border: `1.5px solid ${CB}`, overflow: 'hidden', boxShadow: '0 2px 12px rgba(180,83,9,0.08)' }}>
                  <div style={{ display: 'flex', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${CB}`, flexWrap: 'wrap', alignItems: 'center', background: '#fafafa' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Du</span>
                      <input type="date" value={histDateFrom} onChange={e => setHistDateFrom(e.target.value)}
                        style={{ padding: '6px 8px', borderRadius: 8, border: `1.5px solid ${histDateFrom ? C : CB}`, background: histDateFrom ? CL : '#fff', fontSize: '0.8rem', color: CD, outline: 'none' }} />
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Au</span>
                      <input type="date" value={histDateTo} onChange={e => setHistDateTo(e.target.value)}
                        style={{ padding: '6px 8px', borderRadius: 8, border: `1.5px solid ${histDateTo ? C : CB}`, background: histDateTo ? CL : '#fff', fontSize: '0.8rem', color: CD, outline: 'none' }} />
                    </div>
                    <select value={histType} onChange={e => setHistType(e.target.value as typeof histType)}
                      style={{ flex: '0 0 150px', padding: '7px 10px', borderRadius: 8, border: `1.5px solid ${histType !== 'all' ? C : CB}`, background: histType !== 'all' ? CL : '#fff', fontSize: '0.83rem', color: CD, outline: 'none', cursor: 'pointer' }}>
                      <option value="all">Tous types</option>
                      <option value="directe">Directe</option>
                      <option value="prestataire">Prestataire</option>
                    </select>
                    {activePrests.length > 0 && (
                      <select value={histPrestaId} onChange={e => setHistPrestaId(e.target.value)}
                        style={{ flex: '0 0 170px', padding: '7px 10px', borderRadius: 8, border: `1.5px solid ${histPrestaId ? C : CB}`, background: histPrestaId ? CL : '#fff', fontSize: '0.83rem', color: CD, outline: 'none', cursor: 'pointer' }}>
                        <option value="">Tous prestataires</option>
                        {activePrests.map(ap => <option key={ap.id} value={ap.id}>{ap.prestataire_nom}</option>)}
                      </select>
                    )}
                    {(histDateFrom || histDateTo || histType !== 'all' || histPrestaId) && (
                      <button onClick={() => { setHistDateFrom(''); setHistDateTo(''); setHistType('all'); setHistPrestaId(''); }}
                        style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${CB}`, background: '#fff', color: C, fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        ✕ Réinitialiser
                      </button>
                    )}
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {filteredVentes.length} vente{filteredVentes.length > 1 ? 's' : ''}
                      {selectedVenteIds.size > 0 && (
                        <span style={{ marginLeft: 6, color: '#FF6B00', fontWeight: 700 }}>· {selectedVenteIds.size} sélectionnée{selectedVenteIds.size > 1 ? 's' : ''}</span>
                      )}
                    </div>
                    <button onClick={handleExportXls} disabled={exportingXls}
                      style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: '1.5px solid #1D6F42', background: exportingXls ? '#f3f4f6' : '#f0fdf4', color: '#1D6F42', cursor: exportingXls ? 'default' : 'pointer', fontWeight: 700, fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                      <ExcelIcon /> {exportingXls ? 'Export…' : 'Exporter XLS'}
                    </button>
                  </div>

                  {filteredVentes.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
                      <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>💸</div>
                      {ventes.length === 0 ? 'Aucune vente enregistrée' : 'Aucun résultat pour ces filtres'}
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: CL, borderBottom: `2px solid ${CB}` }}>
                          <th style={{ padding: '8px 12px', width: 36 }}></th>
                          {['Date', 'Type', 'CA', 'Marge', 'Statut', ''].map(h => (
                            <th key={h} style={{ padding: '11px 16px', textAlign: 'left', fontSize: '0.78rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredVentes.map((v, idx) => {
                          const isSel = selectedVenteIds.has(v.id);
                          const rowBg = isSel ? '#FF6B00' : (idx % 2 === 0 ? '#fff' : '#fffdf7');
                          const rowColor = isSel ? '#fff' : undefined;
                          return (
                            <tr key={v.id} style={{ borderBottom: `1px solid ${CB}`, background: rowBg, color: rowColor }} onClick={() => toggleSelectVente(v.id)} role="button" tabIndex={0} onKeyDown={e => e.key === ' ' && toggleSelectVente(v.id)}>
                              <td style={{ padding: '8px 12px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                                <input type="checkbox" checked={isSel} onChange={() => toggleSelectVente(v.id)}
                                  style={{ accentColor: '#FF6B00', width: 15, height: 15, cursor: 'pointer' }} />
                              </td>
                              <td style={{ padding: '11px 16px', fontWeight: 600, fontSize: '0.9rem', color: isSel ? '#fff' : undefined }}>{fmtDate(v.date_vente)}</td>
                              <td style={{ padding: '11px 16px', fontSize: '0.88rem', color: isSel ? '#fff' : undefined }}>
                                {v.type_vente === 'directe' ? '🏪 Directe' : `🛵 ${v.prestataire_nom || 'Prestataire'}`}
                              </td>
                              <td style={{ padding: '11px 16px', fontWeight: 700, color: isSel ? '#fff' : C }}>{fmtMoney(v.total_ca)}</td>
                              <td style={{ padding: '11px 16px', fontWeight: 600, color: isSel ? '#fff' : (v.total_marge >= 0 ? '#16a34a' : '#dc2626') }}>
                                {fmtMoney(v.total_marge)}
                              </td>
                              <td style={{ padding: '11px 16px' }}>
                                <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: '0.78rem', fontWeight: 600, background: isSel ? 'rgba(255,255,255,0.25)' : (v.statut === 'confirmee' ? '#dcfce7' : '#fef9c3'), color: isSel ? '#fff' : (v.statut === 'confirmee' ? '#166534' : '#854d0e') }}>
                                  {v.statut === 'confirmee' ? '✓ Confirmée' : v.statut}
                                </span>
                              </td>
                              <td style={{ padding: '8px 16px' }} onClick={e => e.stopPropagation()}>
                                <button onClick={() => handleAnnuler(v.id)}
                                  style={{ border: `1.5px solid ${isSel ? '#fff' : '#dc2626'}`, color: isSel ? '#fff' : '#dc2626', background: 'none', borderRadius: 7, padding: '4px 12px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}>
                                  Annuler
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )
            )}
          </>
        )}
      </div>
    </VPCtx.Provider>
  );
}
