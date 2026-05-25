import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import type { Activite, Labo } from '../../types';

const fmtMoney = (n: number | null | undefined) => {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' DT';
};

const C = '#b45309';
const CD = '#78350f';
const CL = '#fffbeb';
const CB = '#fcd34d';

interface EntityStats {
  ca_jour: number;
  ca_semaine: number;
  ca_mois: number;
  marge_mois: number;
  top_articles: { nom: string; total_ca: number; total_qte: number }[];
  repartition: { type: string; total: number }[];
}

interface ChargesFixes {
  mode: 'global' | 'detail';
  montant_global?: number | null;
  loyer?: number | null;
  charges_personnel?: number | null;
  electricite_gaz?: number | null;
  eau?: number | null;
}

type TabId = 'global' | string; // 'global' | 'act-{id}' | 'lab-{id}'

export default function RapportVentePage() {
  const [activites, setActivites] = useState<Activite[]>([]);
  const [labos, setLabos] = useState<Labo[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>('global');
  const [loading, setLoading] = useState(false);

  // Stats cache per tab
  const [statsCache, setStatsCache] = useState<Record<string, EntityStats | null>>({});
  const [chargesCache, setChargesCache] = useState<Record<string, ChargesFixes | null>>({});

  useEffect(() => {
    Promise.all([
      api.get('/api/entreprise/activites').catch(() => ({ data: [] })),
      api.get('/api/labo').catch(() => ({ data: [] })),
    ]).then(([a, l]) => {
      setActivites(a.data as Activite[]);
      setLabos(l.data as Labo[]);
    }).catch(() => {});
  }, []);

  const loadTabData = useCallback(async (tab: TabId) => {
    if (statsCache[tab] !== undefined) return;
    setLoading(true);
    try {
      if (tab === 'global') {
        // Load aggregate from all activités
        const acts = activites;
        if (acts.length === 0) { setStatsCache(p => ({ ...p, global: null })); return; }
        const results = await Promise.all(acts.map(a => api.get(`/api/ventes/stats?activiteId=${a.id}`).catch(() => ({ data: null }))));
        const charges = await Promise.all(acts.map(a => api.get(`/api/charges-fixes?activiteId=${a.id}`).catch(() => ({ data: null }))));

        const agg: EntityStats = { ca_jour: 0, ca_semaine: 0, ca_mois: 0, marge_mois: 0, top_articles: [], repartition: [] };
        const repMap: Record<string, number> = {};
        const topMap: Record<string, { total_ca: number; total_qte: number }> = {};

        for (const r of results) {
          const s = r.data as EntityStats | null;
          if (!s) continue;
          agg.ca_jour += s.ca_jour;
          agg.ca_semaine += s.ca_semaine;
          agg.ca_mois += s.ca_mois;
          agg.marge_mois += s.marge_mois;
          for (const rep of s.repartition) repMap[rep.type] = (repMap[rep.type] || 0) + rep.total;
          for (const art of s.top_articles) {
            if (!topMap[art.nom]) topMap[art.nom] = { total_ca: 0, total_qte: 0 };
            topMap[art.nom].total_ca += art.total_ca;
            topMap[art.nom].total_qte += art.total_qte;
          }
        }
        agg.repartition = Object.entries(repMap).map(([type, total]) => ({ type, total }));
        agg.top_articles = Object.entries(topMap).map(([nom, v]) => ({ nom, ...v })).sort((a, b) => b.total_ca - a.total_ca).slice(0, 5);

        let totalCharges = 0;
        for (const ch of charges) {
          const c = ch.data as ChargesFixes | null;
          if (!c) continue;
          totalCharges += c.mode === 'global'
            ? (c.montant_global ?? 0)
            : (c.loyer ?? 0) + (c.charges_personnel ?? 0) + (c.electricite_gaz ?? 0) + (c.eau ?? 0);
        }
        setStatsCache(p => ({ ...p, global: agg }));
        setChargesCache(p => ({ ...p, global: totalCharges > 0 ? { mode: 'global', montant_global: totalCharges } : null }));
      } else if (tab.startsWith('act-')) {
        const id = tab.replace('act-', '');
        const [s, ch] = await Promise.all([
          api.get(`/api/ventes/stats?activiteId=${id}`).catch(() => ({ data: null })),
          api.get(`/api/charges-fixes?activiteId=${id}`).catch(() => ({ data: null })),
        ]);
        setStatsCache(p => ({ ...p, [tab]: s.data as EntityStats | null }));
        setChargesCache(p => ({ ...p, [tab]: ch.data as ChargesFixes | null }));
      } else if (tab.startsWith('lab-')) {
        const id = tab.replace('lab-', '');
        const s = await api.get(`/api/labo-ventes/stats?laboId=${id}`).catch(() => ({ data: null }));
        // Adapt labo stats to EntityStats shape
        const raw = s.data as { valeur_mois?: number; valeur_semaine?: number; top_articles?: { nom: string; total_valeur: number }[] } | null;
        const adapted: EntityStats | null = raw ? {
          ca_jour: 0,
          ca_semaine: raw.valeur_semaine ?? 0,
          ca_mois: raw.valeur_mois ?? 0,
          marge_mois: raw.valeur_mois ?? 0,
          top_articles: (raw.top_articles ?? []).map(a => ({ nom: a.nom, total_ca: a.total_valeur, total_qte: 0 })),
          repartition: [],
        } : null;
        setStatsCache(p => ({ ...p, [tab]: adapted }));
        setChargesCache(p => ({ ...p, [tab]: null }));
      }
    } finally {
      setLoading(false);
    }
  }, [activites, labos, statsCache]);

  useEffect(() => {
    if (activites.length > 0 || labos.length > 0) loadTabData(activeTab);
  }, [activeTab, activites.length, labos.length]);

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
  };

  const stats = statsCache[activeTab] ?? null;
  const charges = chargesCache[activeTab] ?? null;

  const chargesAnnuelles = charges == null ? null : charges.mode === 'global'
    ? (charges.montant_global ?? 0)
    : (charges.loyer ?? 0) + (charges.charges_personnel ?? 0) + (charges.electricite_gaz ?? 0) + (charges.eau ?? 0);
  const chargesMensuelles = chargesAnnuelles != null ? chargesAnnuelles / 12 : null;
  const resultatMois = stats && chargesMensuelles != null ? stats.marge_mois - chargesMensuelles : null;

  const isLaboTab = activeTab.startsWith('lab-');

  const activeTabLabel = (() => {
    if (activeTab === 'global') return 'Vue globale';
    if (activeTab.startsWith('act-')) {
      const id = parseInt(activeTab.replace('act-', ''));
      return activites.find(a => a.id === id)?.nom ?? 'Activité';
    }
    if (activeTab.startsWith('lab-')) {
      const id = parseInt(activeTab.replace('lab-', ''));
      return labos.find(l => l.id === id)?.nom ?? 'Labo';
    }
    return '';
  })();

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: 'global', label: 'Vue Globale', icon: '🌐' },
    ...activites.map(a => ({ id: `act-${a.id}` as TabId, label: a.nom, icon: '🏪' })),
    ...labos.map(l => ({ id: `lab-${l.id}` as TabId, label: l.nom, icon: '🏭' })),
  ];

  return (
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
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>📊</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>
              Rapport Vente — {activeTabLabel}
            </h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.82)', margin: 0, fontSize: '0.85rem' }}>
            Performance commerciale, rentabilité et analyse du mois en cours
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 12, padding: '10px 18px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff' }}>{activites.length + labos.length}</div>
            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.8)' }}>entités</div>
          </div>
        </div>
      </div>

      {/* Tab navigation */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 24, padding: '12px 16px', background: '#fff', borderRadius: 12, border: `1.5px solid ${CB}`, boxShadow: '0 2px 8px rgba(180,83,9,0.06)' }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => handleTabChange(tab.id)}
            style={{
              padding: '8px 16px', borderRadius: 10, cursor: 'pointer', fontSize: '0.85rem',
              fontWeight: activeTab === tab.id ? 700 : 500,
              background: activeTab === tab.id ? C : 'var(--bg)',
              color: activeTab === tab.id ? '#fff' : CD,
              border: activeTab === tab.id ? `1.5px solid ${C}` : `1.5px solid ${CB}`,
              boxShadow: activeTab === tab.id ? `0 2px 8px ${C}44` : 'none',
              transition: 'all 0.15s', whiteSpace: 'nowrap',
            }}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {tabs.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 0' }}>Aucune activité ni labo disponible</div>
      ) : loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Chargement…</div>
      ) : !stats ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📊</div>
          Aucune donnée pour {activeTabLabel} ce mois
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
            {[
              { label: 'CA mois', value: fmtMoney(stats.ca_mois), icon: '📊', sub: null },
              { label: 'Marge brute mois', value: fmtMoney(stats.marge_mois), icon: '💰', sub: stats.ca_mois > 0 ? `${Math.round((stats.marge_mois / stats.ca_mois) * 100)}%` : null },
              { label: 'CA semaine', value: fmtMoney(stats.ca_semaine), icon: '📆', sub: null },
              ...(!isLaboTab ? [{ label: "CA aujourd'hui", value: fmtMoney(stats.ca_jour), icon: '📅', sub: null }] : []),
            ].map(k => (
              <div key={k.label} style={{ background: 'var(--card-bg)', borderRadius: 14, border: `1.5px solid ${CB}`, padding: '18px 20px', boxShadow: '0 2px 8px rgba(180,83,9,0.06)' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: 6 }}>{k.icon}</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: C }}>{k.value}</div>
                {k.sub && <div style={{ fontSize: '0.78rem', color: '#16a34a', fontWeight: 600, marginTop: 2 }}>{k.sub} du CA</div>}
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>{k.label}</div>
              </div>
            ))}
          </div>

          {/* Rentabilité */}
          {!isLaboTab && chargesMensuelles != null && (
            <div style={{ background: 'var(--card-bg)', borderRadius: 14, border: `1.5px solid ${CB}`, padding: '20px 24px', marginBottom: 24, boxShadow: '0 2px 8px rgba(180,83,9,0.06)' }}>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: C, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
                🏗️ Rentabilité du mois
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                <div style={{ padding: '14px 18px', background: CL, borderRadius: 10, border: `1px solid ${CB}` }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4 }}>Charges mensuelles (1/12)</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 700, color: CD }}>{fmtMoney(chargesMensuelles)}</div>
                </div>
                <div style={{ padding: '14px 18px', background: CL, borderRadius: 10, border: `1px solid ${CB}` }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4 }}>Marge brute mois</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 700, color: C }}>{fmtMoney(stats.marge_mois)}</div>
                </div>
                {resultatMois != null && (
                  <div style={{ padding: '14px 18px', background: resultatMois >= 0 ? '#dcfce7' : '#fee2e2', borderRadius: 10, border: `1px solid ${resultatMois >= 0 ? '#86efac' : '#fca5a5'}` }}>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4 }}>Résultat net mois</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: resultatMois >= 0 ? '#166534' : '#dc2626' }}>
                      {resultatMois >= 0 ? '+' : ''}{fmtMoney(resultatMois)}
                    </div>
                  </div>
                )}
                {stats.marge_mois > 0 && chargesMensuelles > 0 && (
                  <div style={{ padding: '14px 18px', background: CL, borderRadius: 10, border: `1px solid ${CB}` }}>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 4 }}>Seuil de rentabilité</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: CD }}>{fmtMoney(chargesMensuelles / (stats.marge_mois / stats.ca_mois))}</div>
                  </div>
                )}
              </div>

              {stats.ca_mois > 0 && stats.marge_mois > 0 && chargesMensuelles > 0 && (
                <div style={{ marginTop: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                    <span>Couverture des charges</span>
                    <span style={{ fontWeight: 600, color: C }}>{Math.min(100, Math.round((stats.marge_mois / chargesMensuelles) * 100))}%</span>
                  </div>
                  <div style={{ height: 10, background: 'var(--border)', borderRadius: 5, overflow: 'hidden' }}>
                    <div style={{ height: 10, borderRadius: 5, width: `${Math.min(100, Math.round((stats.marge_mois / chargesMensuelles) * 100))}%`, background: stats.marge_mois >= chargesMensuelles ? '#16a34a' : C }} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Top articles + répartition */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {stats.top_articles.length > 0 && (
              <div style={{ background: 'var(--card-bg)', borderRadius: 14, border: `1.5px solid ${CB}`, padding: '20px', boxShadow: '0 2px 8px rgba(180,83,9,0.06)' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 800, color: C, marginBottom: 14 }}>🏆 Top articles ce mois</h3>
                {stats.top_articles.map((a, i) => {
                  const pct = stats.top_articles[0].total_ca > 0 ? Math.round((a.total_ca / stats.ca_mois) * 100) : 0;
                  return (
                    <div key={i} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.88rem' }}>
                        <span style={{ fontWeight: i === 0 ? 700 : 400, color: i === 0 ? C : 'var(--text)' }}>
                          {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`} {a.nom}
                        </span>
                        <span style={{ fontWeight: 700, color: C }}>{fmtMoney(a.total_ca)}</span>
                      </div>
                      <div style={{ height: 5, background: 'var(--border)', borderRadius: 3 }}>
                        <div style={{ height: 5, background: C, borderRadius: 3, width: `${pct}%`, opacity: 1 - i * 0.15 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {stats.repartition.length > 0 && (
              <div style={{ background: 'var(--card-bg)', borderRadius: 14, border: `1.5px solid ${CB}`, padding: '20px', boxShadow: '0 2px 8px rgba(180,83,9,0.06)' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 800, color: C, marginBottom: 14 }}>📊 Répartition des ventes</h3>
                {stats.repartition.map(r => {
                  const total = stats.repartition.reduce((s, x) => s + x.total, 0);
                  const pct = total > 0 ? Math.round((r.total / total) * 100) : 0;
                  return (
                    <div key={r.type} style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: '0.88rem' }}>
                        <span>{r.type === 'directe' ? '🏪 Vente directe' : '🛵 Via prestataire'}</span>
                        <span style={{ fontWeight: 700 }}>{pct}%</span>
                      </div>
                      <div style={{ height: 9, background: 'var(--border)', borderRadius: 5, overflow: 'hidden' }}>
                        <div style={{ height: 9, background: C, borderRadius: 5, width: `${pct}%` }} />
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 3 }}>{fmtMoney(r.total)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {!isLaboTab && !charges && (
            <div style={{ background: '#fef9c3', borderRadius: 10, padding: '12px 16px', marginTop: 16, fontSize: '0.82rem', color: '#854d0e', border: `1px solid ${CB}` }}>
              💡 Configurez les charges fixes dans <strong>Config Charges</strong> pour afficher l'analyse de rentabilité.
            </div>
          )}
        </>
      )}
    </div>
  );
}
