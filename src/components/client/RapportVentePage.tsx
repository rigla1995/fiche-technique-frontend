import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/client';
import type { Activite } from '../../types';

const fmtMoney = (n: number) =>
  n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' DT';

const C = '#b45309';
const CD = '#78350f';
const CL = '#fffbeb';
const CB = '#fcd34d';

interface Stats {
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

export default function RapportVentePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activites, setActivites] = useState<Activite[]>([]);
  const [selectedActiviteId, setSelectedActiviteId] = useState<number | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [charges, setCharges] = useState<ChargesFixes | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/api/entreprise/activites').then(({ data }) => {
      const acts: Activite[] = (data as Activite[]).filter(a => !a.laboId);
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
      api.get(`/api/ventes/stats?activiteId=${selectedActiviteId}`),
      api.get(`/api/charges-fixes?activiteId=${selectedActiviteId}`),
    ]).then(([s, ch]) => {
      setStats(s.data);
      setCharges(ch.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [selectedActiviteId]);

  useEffect(() => { loadData(); }, [loadData]);

  const chargesAnnuelles = charges == null ? null : charges.mode === 'global'
    ? (charges.montant_global ?? 0)
    : (charges.loyer ?? 0) + (charges.charges_personnel ?? 0) + (charges.electricite_gaz ?? 0) + (charges.eau ?? 0);

  const chargesMensuelles = chargesAnnuelles != null ? chargesAnnuelles / 12 : null;
  const resultatMois = stats && chargesMensuelles != null
    ? stats.marge_mois - chargesMensuelles
    : null;
  const caMensuelSeuil = stats && chargesMensuelles != null && stats.ca_mois > 0
    ? (chargesMensuelles / stats.ca_mois) * stats.ca_mois
    : null;

  const selectedActivite = activites.find(a => a.id === selectedActiviteId);

  return (
    <div className="page-content">
      {/* Hero */}
      <div style={{
        background: `linear-gradient(135deg, ${CD} 0%, ${C} 55%, #d97706 100%)`,
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(180,83,9,0.28)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>📊</div>
          <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>
            Rapport Vente{selectedActivite ? ` — ${selectedActivite.nom}` : ''}
          </h1>
        </div>
        <p style={{ color: 'rgba(255,255,255,0.82)', margin: 0, fontSize: '0.85rem' }}>
          Performance commerciale, rentabilité et analyse du mois en cours
        </p>
      </div>

      {/* Activité selector */}
      {activites.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 16, padding: '10px 14px', background: '#fff', borderRadius: 10, border: `1px solid ${CB}` }}>
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
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', alignSelf: 'center', marginLeft: 4 }}>← sélectionner l'activité</span>
        </div>
      )}

      {!selectedActiviteId ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 0' }}>Aucune activité disponible</div>
      ) : loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Chargement…</div>
      ) : (
        <>
          {/* KPIs mois */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
            {stats && [
              { label: 'CA mois', value: fmtMoney(stats.ca_mois), icon: '📊', sub: null },
              { label: 'Marge brute mois', value: fmtMoney(stats.marge_mois), icon: '💰', sub: stats.ca_mois > 0 ? `${Math.round((stats.marge_mois / stats.ca_mois) * 100)}%` : null },
              { label: 'CA semaine', value: fmtMoney(stats.ca_semaine), icon: '📆', sub: null },
              { label: "CA aujourd'hui", value: fmtMoney(stats.ca_jour), icon: '📅', sub: null },
            ].map(k => (
              <div key={k.label} style={{ background: 'var(--card-bg)', borderRadius: 12, border: `1.5px solid ${CB}`, padding: '16px 20px' }}>
                <div style={{ fontSize: '1.4rem', marginBottom: 4 }}>{k.icon}</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: C }}>{k.value}</div>
                {k.sub && <div style={{ fontSize: '0.78rem', color: '#16a34a', fontWeight: 600 }}>{k.sub} du CA</div>}
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{k.label}</div>
              </div>
            ))}
          </div>

          {/* Charges & rentabilité */}
          {chargesMensuelles != null && stats && (
            <div style={{ background: 'var(--card-bg)', borderRadius: 14, border: `1.5px solid ${CB}`, padding: 24, marginBottom: 24 }}>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: C, marginBottom: 16 }}>🏗️ Rentabilité du mois</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                <div style={{ padding: '14px 18px', background: CL, borderRadius: 10, border: `1px solid ${CB}` }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 4 }}>Charges mensuelles (1/12)</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 700, color: CD }}>{fmtMoney(chargesMensuelles)}</div>
                </div>
                <div style={{ padding: '14px 18px', background: CL, borderRadius: 10, border: `1px solid ${CB}` }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 4 }}>Marge brute mois</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 700, color: C }}>{fmtMoney(stats.marge_mois)}</div>
                </div>
                {resultatMois != null && (
                  <div style={{ padding: '14px 18px', background: resultatMois >= 0 ? '#dcfce7' : '#fee2e2', borderRadius: 10, border: `1px solid ${resultatMois >= 0 ? '#86efac' : '#fca5a5'}` }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 4 }}>Résultat net mois</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: resultatMois >= 0 ? '#166534' : '#dc2626' }}>
                      {resultatMois >= 0 ? '+' : ''}{fmtMoney(resultatMois)}
                    </div>
                  </div>
                )}
                {caMensuelSeuil != null && stats.ca_mois > 0 && (
                  <div style={{ padding: '14px 18px', background: CL, borderRadius: 10, border: `1px solid ${CB}` }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 4 }}>Seuil de rentabilité (CA)</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: CD }}>{fmtMoney(chargesMensuelles / (stats.marge_mois > 0 ? stats.marge_mois / stats.ca_mois : 1))}</div>
                  </div>
                )}
              </div>

              {/* Progress bar */}
              {stats.ca_mois > 0 && chargesMensuelles != null && stats.marge_mois > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                    <span>Couverture des charges</span>
                    <span style={{ fontWeight: 600, color: C }}>
                      {Math.min(100, Math.round((stats.marge_mois / chargesMensuelles) * 100))}%
                    </span>
                  </div>
                  <div style={{ height: 10, background: 'var(--border)', borderRadius: 5, overflow: 'hidden' }}>
                    <div style={{
                      height: 10, borderRadius: 5,
                      width: `${Math.min(100, Math.round((stats.marge_mois / chargesMensuelles) * 100))}%`,
                      background: stats.marge_mois >= chargesMensuelles ? '#16a34a' : C,
                    }} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Répartition & top articles */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {stats && stats.top_articles.length > 0 && (
              <div style={{ background: 'var(--card-bg)', borderRadius: 12, border: `1.5px solid ${CB}`, padding: 20 }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: C, marginBottom: 12 }}>🏆 Top articles ce mois</h3>
                {stats.top_articles.map((a, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: '0.88rem' }}>
                    <span style={{ color: i === 0 ? C : 'var(--text)' }}>{i + 1}. {a.nom}</span>
                    <span style={{ fontWeight: 700, color: C }}>{fmtMoney(a.total_ca)}</span>
                  </div>
                ))}
              </div>
            )}

            {stats && stats.repartition.length > 0 && (
              <div style={{ background: 'var(--card-bg)', borderRadius: 12, border: `1.5px solid ${CB}`, padding: 20 }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: C, marginBottom: 12 }}>📊 Répartition des ventes</h3>
                {stats.repartition.map(r => {
                  const total = stats.repartition.reduce((s, x) => s + x.total, 0);
                  const pct = total > 0 ? Math.round((r.total / total) * 100) : 0;
                  return (
                    <div key={r.type} style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.88rem' }}>
                        <span>{r.type === 'directe' ? '🏪 Vente directe' : '🛵 Via prestataire'}</span>
                        <span style={{ fontWeight: 600 }}>{pct}%</span>
                      </div>
                      <div style={{ height: 8, background: 'var(--border)', borderRadius: 4 }}>
                        <div style={{ height: 8, background: C, borderRadius: 4, width: `${pct}%` }} />
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>{fmtMoney(r.total)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {!charges && (
            <div style={{ background: '#fef9c3', borderRadius: 10, padding: '12px 16px', marginTop: 16, fontSize: '0.82rem', color: '#854d0e' }}>
              💡 Configurez vos charges fixes dans <strong>Configuration Vente</strong> pour afficher l'analyse de rentabilité.
            </div>
          )}
        </>
      )}
    </div>
  );
}
