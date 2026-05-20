import { useState, useEffect, useCallback } from 'react';
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

const fmtMoney = (n: number) =>
  n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' DT';

const C = '#b45309';
const CD = '#78350f';
const CL = '#fffbeb';
const CB = '#fcd34d';

interface ArticleVendable {
  id: string;
  activite_id: number;
  article_type: 'produit' | 'ingredient';
  article_id: number;
  prix_vente: number;
  actif: boolean;
  nom: string;
  unite_nom?: string | null;
}

interface Prestataire {
  id: string;
  nom: string;
  taux_commission: number;
  activite_prestataire_id: string;
}

interface VenteLigne {
  article_type: 'produit' | 'ingredient';
  article_id: number;
  article_nom: string;
  unite_nom?: string | null;
  quantite: number;
  prix_unitaire: number;
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

interface Stats {
  ca_jour: number;
  ca_semaine: number;
  ca_mois: number;
  marge_mois: number;
  top_articles: { nom: string; total_ca: number; total_qte: number }[];
  repartition: { type: string; total: number }[];
}

export default function VentesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activites, setActivites] = useState<Activite[]>([]);
  const [selectedActiviteId, setSelectedActiviteId] = useState<number | null>(null);
  const [ventes, setVentes] = useState<Vente[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [articles, setArticles] = useState<ArticleVendable[]>([]);
  const [prestataires, setPrestataires] = useState<Prestataire[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'ventes' | 'stats'>('ventes');
  const [showNouvelleVente, setShowNouvelleVente] = useState(false);

  const [typeVente, setTypeVente] = useState<'directe' | 'prestataire'>('directe');
  const [prestataireId, setPrestataireId] = useState('');
  const [dateVente, setDateVente] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [lignes, setLignes] = useState<VenteLigne[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    api.get('/api/entreprise/activites').then(({ data }) => {
      const acts: Activite[] = (data as Activite[]).filter(a => !a.laboId);
      setActivites(acts);
      const paramId = searchParams.get('activiteId');
      const found = acts.find(a => String(a.id) === paramId);
      setSelectedActiviteId(found ? found.id : acts[0]?.id ?? null);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedActiviteId) return;
    api.get(`/api/prestataires?activiteId=${selectedActiviteId}`)
      .then(({ data }) => setPrestataires(data))
      .catch(() => {});
  }, [selectedActiviteId]);

  const loadData = useCallback(() => {
    if (!selectedActiviteId) return;
    setLoading(true);
    Promise.all([
      api.get(`/api/ventes?activiteId=${selectedActiviteId}`),
      api.get(`/api/ventes/stats?activiteId=${selectedActiviteId}`),
      api.get(`/api/articles-vendables?activiteId=${selectedActiviteId}`),
    ]).then(([v, s, a]) => {
      setVentes(v.data);
      setStats(s.data);
      setArticles(a.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [selectedActiviteId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAddLigne = (article: ArticleVendable) => {
    if (lignes.find(l => l.article_type === article.article_type && l.article_id === article.article_id)) return;
    setLignes(prev => [...prev, {
      article_type: article.article_type,
      article_id: article.article_id,
      article_nom: article.nom,
      unite_nom: article.unite_nom,
      quantite: 1,
      prix_unitaire: article.prix_vente,
    }]);
  };

  const handleSubmitVente = async () => {
    if (!selectedActiviteId || lignes.length === 0) return;
    setSaving(true); setSaveError('');
    try {
      await api.post('/api/ventes', {
        activite_id: selectedActiviteId,
        date_vente: dateVente,
        type_vente: typeVente,
        prestataire_id: typeVente === 'prestataire' ? prestataireId || null : null,
        notes: notes || null,
        lignes: lignes.map(l => ({
          article_type: l.article_type,
          article_id: l.article_id,
          quantite: l.quantite,
          prix_unitaire: l.prix_unitaire,
        })),
      });
      setShowNouvelleVente(false);
      setLignes([]); setTypeVente('directe'); setPrestataireId(''); setNotes('');
      setDateVente(new Date().toISOString().slice(0, 10));
      loadData();
    } catch (e: unknown) {
      setSaveError(apiMsg(e, 'Erreur lors de la sauvegarde'));
    } finally {
      setSaving(false);
    }
  };

  const handleAnnuler = async (id: string) => {
    if (!confirm('Annuler cette vente et réintégrer le stock ?')) return;
    try {
      await api.delete(`/api/ventes/${id}`);
      loadData();
    } catch (e: unknown) {
      alert(apiMsg(e));
    }
  };

  const selectedActivite = activites.find(a => a.id === selectedActiviteId);
  const totalCA = lignes.reduce((s, l) => s + l.quantite * l.prix_unitaire, 0);

  return (
    <div className="page-content">
      {/* Hero */}
      <div style={{
        background: `linear-gradient(135deg, ${CD} 0%, ${C} 55%, #d97706 100%)`,
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: `0 8px 32px rgba(180,83,9,0.28)`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>💰</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>
              Ventes{selectedActivite ? ` — ${selectedActivite.nom}` : ''}
            </h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.82)', margin: 0, fontSize: '0.85rem' }}>
            Enregistrez et suivez vos ventes par activité
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link to={`/client/ventes/catalogue${selectedActiviteId ? `?activiteId=${selectedActiviteId}` : ''}`}
            style={{ background: 'rgba(255,255,255,0.18)', color: '#fff', borderRadius: 20, padding: '5px 14px', fontSize: '0.82rem', fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.3)' }}>
            🧾 Catalogue
          </Link>
          <Link to={`/client/ventes/configuration${selectedActiviteId ? `?activiteId=${selectedActiviteId}` : ''}`}
            style={{ background: 'rgba(255,255,255,0.18)', color: '#fff', borderRadius: 20, padding: '5px 14px', fontSize: '0.82rem', fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.3)' }}>
            ⚙️ Configuration
          </Link>
        </div>
      </div>

      {/* Activité selector */}
      {activites.length > 1 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20, background: 'var(--card-bg)', borderRadius: 10, border: '1px solid var(--border)', padding: '10px 14px' }}>
          {activites.map(a => (
            <button key={a.id} onClick={() => { setSelectedActiviteId(a.id); setSearchParams({ activiteId: String(a.id) }); }}
              style={{
                padding: '4px 14px', borderRadius: 20, cursor: 'pointer', fontSize: '0.82rem',
                border: selectedActiviteId === a.id ? `1.5px solid ${C}` : '1.5px solid var(--border)',
                background: selectedActiviteId === a.id ? C : 'var(--bg)',
                color: selectedActiviteId === a.id ? '#fff' : 'var(--text)',
                fontWeight: selectedActiviteId === a.id ? 700 : 400,
              }}>
              {a.nom}
            </button>
          ))}
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', alignSelf: 'center', marginLeft: 4 }}>← sélectionner l'activité</span>
        </div>
      )}

      {!selectedActiviteId ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 0' }}>
          Aucune activité disponible
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, borderBottom: `2px solid ${CB}`, marginBottom: 20 }}>
            {(['ventes', 'stats'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                style={{
                  padding: '8px 18px', background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: '0.9rem', fontWeight: activeTab === tab ? 700 : 400,
                  color: activeTab === tab ? C : 'var(--text)',
                  borderBottom: activeTab === tab ? `3px solid ${C}` : '3px solid transparent',
                  marginBottom: -2,
                }}>
                {tab === 'ventes' ? '💸 Ventes' : '📊 Statistiques'}
              </button>
            ))}
          </div>

          {/* ── VENTES TAB ── */}
          {activeTab === 'ventes' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                <button onClick={() => setShowNouvelleVente(true)}
                  style={{
                    background: `linear-gradient(135deg, ${CD} 0%, ${C} 100%)`,
                    color: '#fff', border: 'none', borderRadius: 9,
                    padding: '9px 20px', cursor: 'pointer', fontWeight: 700,
                    boxShadow: `0 4px 14px rgba(180,83,9,0.35)`,
                  }}>
                  + Nouvelle vente
                </button>
              </div>

              {loading ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Chargement…</div>
              ) : ventes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>💸</div>
                  Aucune vente enregistrée
                </div>
              ) : (
                <div style={{ background: 'var(--card-bg)', borderRadius: 12, border: `1.5px solid ${CB}`, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: CL, borderBottom: `1.5px solid ${CB}` }}>
                        {['Date', 'Type', 'CA', 'Marge', 'Statut', 'Actions'].map(h => (
                          <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.82rem', fontWeight: 700, color: C }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ventes.map(v => (
                        <tr key={v.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 14px', fontSize: '0.9rem', fontWeight: 600 }}>{fmtDate(v.date_vente)}</td>
                          <td style={{ padding: '10px 14px', fontSize: '0.9rem' }}>
                            {v.type_vente === 'directe' ? '🏪 Directe' : `🛵 ${v.prestataire_nom || 'Prestataire'}`}
                          </td>
                          <td style={{ padding: '10px 14px', fontWeight: 700, color: C }}>{fmtMoney(v.total_ca)}</td>
                          <td style={{ padding: '10px 14px', color: v.total_marge >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                            {fmtMoney(v.total_marge)}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{
                              padding: '2px 8px', borderRadius: 12, fontSize: '0.78rem',
                              background: v.statut === 'confirmee' ? '#dcfce7' : '#fef9c3',
                              color: v.statut === 'confirmee' ? '#166534' : '#854d0e',
                            }}>
                              {v.statut === 'confirmee' ? '✓ Confirmée' : v.statut}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <button onClick={() => handleAnnuler(v.id)}
                              style={{ background: 'none', border: '1px solid #dc2626', color: '#dc2626', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontSize: '0.78rem' }}>
                              Annuler
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ── STATS TAB ── */}
          {activeTab === 'stats' && stats && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
                {[
                  { label: "CA aujourd'hui", value: stats.ca_jour, icon: '📅' },
                  { label: 'CA semaine', value: stats.ca_semaine, icon: '📆' },
                  { label: 'CA mois', value: stats.ca_mois, icon: '📊' },
                  { label: 'Marge mois', value: stats.marge_mois, icon: '💰' },
                ].map(s => (
                  <div key={s.label} style={{ background: 'var(--card-bg)', borderRadius: 12, border: `1.5px solid ${CB}`, padding: '16px 20px' }}>
                    <div style={{ fontSize: '1.4rem', marginBottom: 4 }}>{s.icon}</div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 700, color: C }}>{fmtMoney(s.value)}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {stats.top_articles.length > 0 && (
                <div style={{ background: 'var(--card-bg)', borderRadius: 12, border: `1.5px solid ${CB}`, padding: 20, marginBottom: 16 }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, color: C, marginBottom: 12 }}>Top articles ce mois</h3>
                  {stats.top_articles.map((a, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '0.88rem' }}>
                      <span>{i + 1}. {a.nom}</span>
                      <span style={{ fontWeight: 700, color: C }}>{fmtMoney(a.total_ca)}</span>
                    </div>
                  ))}
                </div>
              )}

              {stats.repartition.length > 0 && (
                <div style={{ background: 'var(--card-bg)', borderRadius: 12, border: `1.5px solid ${CB}`, padding: 20 }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, color: C, marginBottom: 12 }}>Répartition directe / prestataires</h3>
                  {stats.repartition.map(r => {
                    const total = stats.repartition.reduce((s, x) => s + x.total, 0);
                    const pct = total > 0 ? Math.round((r.total / total) * 100) : 0;
                    return (
                      <div key={r.type} style={{ marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.88rem' }}>
                          <span>{r.type === 'directe' ? '🏪 Vente directe' : '🛵 Via prestataire'}</span>
                          <span style={{ fontWeight: 600 }}>{fmtMoney(r.total)} ({pct}%)</span>
                        </div>
                        <div style={{ height: 8, background: 'var(--border)', borderRadius: 4 }}>
                          <div style={{ height: 8, background: C, borderRadius: 4, width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── Modal Nouvelle Vente ── */}
      {showNouvelleVente && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 600 }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: C, marginBottom: 20 }}>
              💸 Nouvelle vente — {selectedActivite?.nom}
            </h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Date</label>
                <input type="date" value={dateVente} onChange={e => setDateVente(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1.5px solid ${CB}`, background: CL, color: CD }} />
              </div>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Type</label>
                <select value={typeVente} onChange={e => setTypeVente(e.target.value as 'directe' | 'prestataire')}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1.5px solid ${CB}`, background: CL, color: CD }}>
                  <option value="directe">🏪 Vente directe</option>
                  <option value="prestataire">🛵 Via prestataire</option>
                </select>
              </div>
            </div>

            {typeVente === 'prestataire' && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Prestataire</label>
                <select value={prestataireId} onChange={e => setPrestataireId(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1.5px solid ${CB}`, background: CL, color: CD }}>
                  <option value="">-- Sélectionner --</option>
                  {prestataires.map(p => (
                    <option key={p.id} value={p.id}>{p.nom} ({p.taux_commission}%)</option>
                  ))}
                </select>
                {prestataires.length === 0 && (
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    Aucun prestataire configuré pour cette activité.{' '}
                    <Link to={`/client/ventes/configuration?activiteId=${selectedActiviteId}`} style={{ color: C }}>Configurer</Link>
                  </p>
                )}
              </div>
            )}

            {/* Articles */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Articles ({lignes.length})</label>
              </div>
              <div style={{ maxHeight: 200, overflowY: 'auto', border: `1.5px solid ${CB}`, borderRadius: 8, marginBottom: 8, background: CL }}>
                {articles.filter(a => a.actif).map(a => {
                  const isInLignes = lignes.some(l => l.article_type === a.article_type && l.article_id === a.article_id);
                  return (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--border)', gap: 8 }}>
                      <span style={{ flex: 1, fontSize: '0.88rem' }}>
                        {a.nom}
                        {a.unite_nom && <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}> ({a.unite_nom})</span>}
                      </span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, minWidth: 70, textAlign: 'right', color: C }}>{fmtMoney(a.prix_vente)}</span>
                      <button
                        onClick={() => isInLignes
                          ? setLignes(prev => prev.filter(l => !(l.article_type === a.article_type && l.article_id === a.article_id)))
                          : handleAddLigne(a)
                        }
                        style={{
                          padding: '3px 10px', borderRadius: 6, cursor: 'pointer', fontSize: '0.78rem',
                          border: isInLignes ? '1px solid #dc2626' : `1px solid ${C}`,
                          color: isInLignes ? '#dc2626' : C,
                          background: 'none',
                        }}>
                        {isInLignes ? 'Retirer' : 'Ajouter'}
                      </button>
                    </div>
                  );
                })}
                {articles.filter(a => a.actif).length === 0 && (
                  <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    Aucun article vendable.{' '}
                    <Link to={`/client/ventes/catalogue?activiteId=${selectedActiviteId}`} style={{ color: C }}>Configurer le catalogue</Link>
                  </div>
                )}
              </div>

              {lignes.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Quantités & prix</div>
                  {lignes.map((l, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ flex: 1, fontSize: '0.87rem' }}>{l.article_nom}</span>
                      <input type="number" min="0.001" step="0.001" value={l.quantite}
                        onChange={e => setLignes(prev => prev.map((x, j) => j === i ? { ...x, quantite: parseFloat(e.target.value) || 1 } : x))}
                        style={{ width: 80, padding: '5px 8px', borderRadius: 6, border: `1px solid ${CB}`, background: CL, textAlign: 'center' }} />
                      <input type="number" min="0" step="0.01" value={l.prix_unitaire}
                        onChange={e => setLignes(prev => prev.map((x, j) => j === i ? { ...x, prix_unitaire: parseFloat(e.target.value) || 0 } : x))}
                        style={{ width: 90, padding: '5px 8px', borderRadius: 6, border: `1px solid ${CB}`, background: CL, textAlign: 'right' }} />
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>DT</span>
                    </div>
                  ))}
                  <div style={{ textAlign: 'right', fontWeight: 700, fontSize: '1rem', marginTop: 8, color: C }}>
                    Total : {fmtMoney(totalCA)}
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Notes (optionnel)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1.5px solid ${CB}`, background: CL, resize: 'vertical' }} />
            </div>

            {saveError && <div style={{ color: '#dc2626', fontSize: '0.85rem', marginBottom: 12 }}>{saveError}</div>}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowNouvelleVente(false); setLignes([]); setSaveError(''); }}
                style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', cursor: 'pointer' }}>
                Annuler
              </button>
              <button onClick={handleSubmitVente} disabled={saving || lignes.length === 0}
                style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: `linear-gradient(135deg, ${CD} 0%, ${C} 100%)`, color: '#fff', cursor: 'pointer', fontWeight: 700, opacity: saving || lignes.length === 0 ? 0.6 : 1 }}>
                {saving ? 'Enregistrement…' : 'Confirmer la vente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
