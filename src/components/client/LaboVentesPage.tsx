import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../../api/client';
import type { Labo } from '../../types';

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

interface LaboVenteLigne {
  id: string;
  date_transfert: string;
  article_nom: string;
  article_type: 'produit' | 'ingredient';
  unite_nom?: string | null;
  activite_nom: string;
  quantite: number;
  prix_unitaire: number | null;
  valeur: number;
  note?: string | null;
  ref_facture?: string | null;
}

interface LaboVentesStats {
  valeur_mois: number;
  valeur_semaine: number;
  nb_transferts_mois: number;
  top_articles: { nom: string; total_valeur: number }[];
}

export default function LaboVentesPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [labos, setLabos] = useState<Labo[]>([]);
  const [selectedLaboId, setSelectedLaboId] = useState<number | null>(null);
  const [lignes, setLignes] = useState<LaboVenteLigne[]>([]);
  const [stats, setStats] = useState<LaboVentesStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'historique' | 'stats'>('historique');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    api.get('/api/labo').then(({ data }) => {
      setLabos(data);
      const paramId = searchParams.get('laboId');
      const found = (data as Labo[]).find(l => String(l.id) === paramId);
      setSelectedLaboId(found ? found.id : data[0]?.id ?? null);
    }).catch(() => {});
  }, []);

  const loadData = useCallback(() => {
    if (!selectedLaboId) return;
    setLoading(true);
    const params = new URLSearchParams({ laboId: String(selectedLaboId) });
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    Promise.all([
      api.get(`/api/labo-ventes?${params}`),
      api.get(`/api/labo-ventes/stats?laboId=${selectedLaboId}`),
    ]).then(([v, s]) => {
      setLignes(v.data);
      setStats(s.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [selectedLaboId, from, to]);

  useEffect(() => { loadData(); }, [loadData]);

  const selectedLabo = labos.find(l => l.id === selectedLaboId);

  return (
    <div className="page-content">
      {/* Hero */}
      <div style={{
        background: `linear-gradient(135deg, ${CD} 0%, ${C} 55%, #d97706 100%)`,
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(180,83,9,0.28)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>📤</div>
          <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>
            Ventes Labo{selectedLabo ? ` — ${selectedLabo.nom}` : ''}
          </h1>
        </div>
        <p style={{ color: 'rgba(255,255,255,0.82)', margin: 0, fontSize: '0.85rem' }}>
          Transferts valorisés vers les activités
        </p>
      </div>

      {/* Labo selector */}
      {labos.length > 1 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20, background: 'var(--card-bg)', borderRadius: 10, border: '1px solid var(--border)', padding: '10px 14px' }}>
          {labos.map(l => (
            <button key={l.id}
              onClick={() => { setSelectedLaboId(l.id); navigate(`/client/labo/ventes?laboId=${l.id}`); }}
              style={{
                padding: '4px 14px', borderRadius: 20, cursor: 'pointer', fontSize: '0.82rem',
                border: selectedLaboId === l.id ? `1.5px solid ${C}` : '1.5px solid var(--border)',
                background: selectedLaboId === l.id ? C : 'var(--bg)',
                color: selectedLaboId === l.id ? '#fff' : 'var(--text)',
                fontWeight: selectedLaboId === l.id ? 700 : 400,
              }}>
              🏭 {l.nom}
            </button>
          ))}
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', alignSelf: 'center', marginLeft: 4 }}>← sélectionner le labo</span>
        </div>
      )}

      {!selectedLaboId ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 0' }}>Aucun labo disponible</div>
      ) : (
        <>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, borderBottom: `2px solid ${CB}`, marginBottom: 20 }}>
            {(['historique', 'stats'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                style={{
                  padding: '8px 18px', background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: '0.9rem', fontWeight: activeTab === tab ? 700 : 400,
                  color: activeTab === tab ? C : 'var(--text)',
                  borderBottom: activeTab === tab ? `3px solid ${C}` : '3px solid transparent',
                  marginBottom: -2,
                }}>
                {tab === 'historique' ? '📋 Historique' : '📊 Statistiques'}
              </button>
            ))}
          </div>

          {activeTab === 'historique' && (
            <>
              {/* Filtres */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end', background: 'var(--card-bg)', borderRadius: 10, border: `1.5px solid ${CB}`, padding: '12px 16px' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', display: 'block', marginBottom: 4, fontWeight: 600, color: C }}>Du</label>
                  <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                    style={{ padding: '7px 10px', borderRadius: 8, border: `1.5px solid ${CB}`, background: CL, color: CD }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', display: 'block', marginBottom: 4, fontWeight: 600, color: C }}>Au</label>
                  <input type="date" value={to} onChange={e => setTo(e.target.value)}
                    style={{ padding: '7px 10px', borderRadius: 8, border: `1.5px solid ${CB}`, background: CL, color: CD }} />
                </div>
                <button onClick={loadData}
                  style={{ padding: '8px 18px', borderRadius: 8, border: `1.5px solid ${C}`, color: '#fff', background: C, cursor: 'pointer', fontWeight: 700 }}>
                  Filtrer
                </button>
                {(from || to) && (
                  <button onClick={() => { setFrom(''); setTo(''); }}
                    style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', cursor: 'pointer' }}>
                    Réinitialiser
                  </button>
                )}
              </div>

              {loading ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Chargement…</div>
              ) : lignes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📤</div>
                  Aucun transfert valorisé trouvé
                  {!from && !to && (
                    <p style={{ fontSize: '0.82rem', marginTop: 8 }}>
                      Les transferts apparaissent ici lorsqu'ils ont un prix unitaire renseigné.
                    </p>
                  )}
                </div>
              ) : (
                <div style={{ background: 'var(--card-bg)', borderRadius: 12, border: `1.5px solid ${CB}`, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: CL, borderBottom: `1.5px solid ${CB}` }}>
                        {['Date', 'Article', 'Activité', 'Qté', 'Prix unit.', 'Valeur'].map(h => (
                          <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.82rem', fontWeight: 700, color: C }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {lignes.map(l => (
                        <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 14px', fontSize: '0.88rem', fontWeight: 600 }}>{fmtDate(l.date_transfert)}</td>
                          <td style={{ padding: '10px 14px', fontSize: '0.88rem' }}>
                            {l.article_nom}
                            {l.unite_nom && <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}> ({l.unite_nom})</span>}
                          </td>
                          <td style={{ padding: '10px 14px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{l.activite_nom}</td>
                          <td style={{ padding: '10px 14px', fontSize: '0.88rem' }}>{l.quantite}</td>
                          <td style={{ padding: '10px 14px', fontSize: '0.88rem' }}>{fmtMoney(l.prix_unitaire)}</td>
                          <td style={{ padding: '10px 14px', fontWeight: 700, color: C }}>{fmtMoney(l.valeur)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: CL, borderTop: `2px solid ${CB}` }}>
                        <td colSpan={5} style={{ padding: '10px 14px', fontWeight: 700, fontSize: '0.9rem', color: CD }}>Total</td>
                        <td style={{ padding: '10px 14px', fontWeight: 800, fontSize: '1rem', color: C }}>
                          {fmtMoney(lignes.reduce((s, l) => s + l.valeur, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </>
          )}

          {activeTab === 'stats' && stats && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
                {[
                  { label: 'Valeur mois', value: fmtMoney(stats.valeur_mois), icon: '📦' },
                  { label: 'Valeur semaine', value: fmtMoney(stats.valeur_semaine), icon: '📆' },
                  { label: 'Transferts ce mois', value: String(stats.nb_transferts_mois), icon: '🔢' },
                ].map(s => (
                  <div key={s.label} style={{ background: 'var(--card-bg)', borderRadius: 12, border: `1.5px solid ${CB}`, padding: '16px 20px' }}>
                    <div style={{ fontSize: '1.4rem', marginBottom: 4 }}>{s.icon}</div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 700, color: C }}>{s.value}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {stats.top_articles.length > 0 && (
                <div style={{ background: 'var(--card-bg)', borderRadius: 12, border: `1.5px solid ${CB}`, padding: 20 }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, color: C, marginBottom: 12 }}>🏆 Top articles transférés ce mois</h3>
                  {stats.top_articles.map((a, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: '0.88rem' }}>
                      <span style={{ color: i === 0 ? C : 'var(--text)' }}>{i + 1}. {a.nom}</span>
                      <span style={{ fontWeight: 700, color: C }}>{fmtMoney(a.total_valeur)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
