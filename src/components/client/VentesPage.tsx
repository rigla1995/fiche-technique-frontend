import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  commission_pct: number;
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
  const [activeTab, setActiveTab] = useState<'ventes' | 'catalogue' | 'stats'>('ventes');
  const [showNouvelleVente, setShowNouvelleVente] = useState(false);

  // Nouvelle vente form state
  const [typeVente, setTypeVente] = useState<'directe' | 'prestataire'>('directe');
  const [prestataireId, setPrestataireId] = useState('');
  const [dateVente, setDateVente] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [lignes, setLignes] = useState<VenteLigne[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Catalogue form state
  const [showAddArticle, setShowAddArticle] = useState(false);
  const [allProduits, setAllProduits] = useState<{ id: number; nom: string }[]>([]);
  const [allIngredients, setAllIngredients] = useState<{ id: number; nom: string; unite_nom: string }[]>([]);
  const [newArticleType, setNewArticleType] = useState<'produit' | 'ingredient'>('produit');
  const [newArticleId, setNewArticleId] = useState('');
  const [newPrixVente, setNewPrixVente] = useState('');
  const [catalogueSaving, setCatalogueSaving] = useState(false);

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
    api.get('/api/prestataires').then(({ data }) => setPrestataires(data)).catch(() => {});
  }, []);

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

  useEffect(() => {
    if (!showAddArticle || !selectedActiviteId) return;
    api.get('/api/produits').then(({ data }) => setAllProduits((data as { id: number; name: string }[]).map(p => ({ id: p.id, nom: p.name })))).catch(() => {});
    api.get(`/api/stock/entreprise/${selectedActiviteId}`)
      .then(({ data }) => setAllIngredients((data as { ingredientId: number; nom: string; unite: string }[]).map(i => ({ id: i.ingredientId, nom: i.nom, unite_nom: i.unite }))))
      .catch(() => {});
  }, [showAddArticle, selectedActiviteId]);

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

  const handleAddArticleVendable = async () => {
    if (!selectedActiviteId || !newArticleId || !newPrixVente) return;
    setCatalogueSaving(true);
    try {
      await api.post('/api/articles-vendables', {
        activite_id: selectedActiviteId,
        article_type: newArticleType,
        article_id: parseInt(newArticleId),
        prix_vente: parseFloat(newPrixVente),
      });
      setShowAddArticle(false);
      setNewArticleId(''); setNewPrixVente('');
      loadData();
    } catch (e: unknown) {
      alert(apiMsg(e));
    } finally {
      setCatalogueSaving(false);
    }
  };

  const handleDeleteArticle = async (id: string) => {
    if (!confirm('Retirer cet article du catalogue vendable ?')) return;
    try {
      await api.delete(`/api/articles-vendables/${id}`);
      loadData();
    } catch {}
  };

  const selectedActivite = activites.find(a => a.id === selectedActiviteId);
  const totalCA = lignes.reduce((s, l) => s + l.quantite * l.prix_unitaire, 0);

  return (
    <div style={{ padding: '24px', maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>Ventes</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: 20 }}>
        Saisie des ventes directes et via prestataires de livraison
      </p>

      {/* Activité selector */}
      {activites.length > 1 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          {activites.map(a => (
            <button
              key={a.id}
              onClick={() => { setSelectedActiviteId(a.id); setSearchParams({ activiteId: String(a.id) }); }}
              style={{
                padding: '6px 14px', borderRadius: 20, fontSize: '0.85rem', cursor: 'pointer',
                border: '1.5px solid var(--border)',
                background: selectedActiviteId === a.id ? 'var(--primary)' : 'var(--card-bg)',
                color: selectedActiviteId === a.id ? '#fff' : 'var(--text)',
                fontWeight: selectedActiviteId === a.id ? 600 : 400,
              }}
            >
              {a.nom}
            </button>
          ))}
        </div>
      )}

      {!selectedActiviteId ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 0' }}>
          Aucune activité disponible
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
            {(['ventes', 'catalogue', 'stats'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: '0.9rem', fontWeight: activeTab === tab ? 700 : 400,
                  color: activeTab === tab ? 'var(--primary)' : 'var(--text)',
                  borderBottom: activeTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
                  marginBottom: -1,
                }}
              >
                {tab === 'ventes' ? 'Ventes' : tab === 'catalogue' ? 'Catalogue Vendable' : 'Statistiques'}
              </button>
            ))}
          </div>

          {/* ── VENTES TAB ── */}
          {activeTab === 'ventes' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                <button
                  onClick={() => setShowNouvelleVente(true)}
                  style={{
                    background: 'var(--primary)', color: '#fff', border: 'none',
                    borderRadius: 8, padding: '8px 18px', cursor: 'pointer', fontWeight: 600,
                  }}
                >
                  + Nouvelle vente
                </button>
              </div>

              {loading ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Chargement…</div>
              ) : ventes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                  Aucune vente enregistrée
                </div>
              ) : (
                <div style={{ background: 'var(--card-bg)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                        {['Date', 'Type', 'CA', 'Marge', 'Statut', 'Actions'].map(h => (
                          <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ventes.map(v => (
                        <tr key={v.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 14px', fontSize: '0.9rem' }}>{fmtDate(v.date_vente)}</td>
                          <td style={{ padding: '10px 14px', fontSize: '0.9rem' }}>
                            {v.type_vente === 'directe' ? '🏪 Directe' : `🛵 ${v.prestataire_nom || 'Prestataire'}`}
                          </td>
                          <td style={{ padding: '10px 14px', fontWeight: 600 }}>{fmtMoney(v.total_ca)}</td>
                          <td style={{ padding: '10px 14px', color: v.total_marge >= 0 ? 'var(--success, #16a34a)' : '#dc2626' }}>
                            {fmtMoney(v.total_marge)}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{
                              padding: '2px 8px', borderRadius: 12, fontSize: '0.78rem',
                              background: v.statut === 'confirmee' ? '#dcfce7' : '#fef9c3',
                              color: v.statut === 'confirmee' ? '#166534' : '#854d0e',
                            }}>
                              {v.statut}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <button
                              onClick={() => handleAnnuler(v.id)}
                              style={{ background: 'none', border: '1px solid #dc2626', color: '#dc2626', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontSize: '0.78rem' }}
                            >
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

          {/* ── CATALOGUE TAB ── */}
          {activeTab === 'catalogue' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                <button
                  onClick={() => setShowAddArticle(true)}
                  style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', fontWeight: 600 }}
                >
                  + Ajouter un article
                </button>
              </div>

              {articles.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                  Aucun article vendable configuré
                </div>
              ) : (
                <div style={{ background: 'var(--card-bg)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                        {['Article', 'Type', 'Prix vente', 'Actions'].map(h => (
                          <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {articles.map(a => (
                        <tr key={a.id} style={{ borderBottom: '1px solid var(--border)', opacity: a.actif ? 1 : 0.5 }}>
                          <td style={{ padding: '10px 14px' }}>
                            {a.nom}
                            {a.unite_nom && <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}> ({a.unite_nom})</span>}
                          </td>
                          <td style={{ padding: '10px 14px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            {a.article_type === 'produit' ? '🍔 Produit' : '🧂 Ingrédient'}
                          </td>
                          <td style={{ padding: '10px 14px', fontWeight: 600 }}>{fmtMoney(a.prix_vente)}</td>
                          <td style={{ padding: '10px 14px' }}>
                            <button
                              onClick={() => handleDeleteArticle(a.id)}
                              style={{ background: 'none', border: '1px solid #dc2626', color: '#dc2626', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontSize: '0.78rem' }}
                            >
                              Retirer
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
                {[
                  { label: "CA aujourd'hui", value: stats.ca_jour, icon: '📅' },
                  { label: 'CA semaine', value: stats.ca_semaine, icon: '📆' },
                  { label: 'CA mois', value: stats.ca_mois, icon: '📊' },
                  { label: 'Marge mois', value: stats.marge_mois, icon: '💰' },
                ].map(s => (
                  <div key={s.label} style={{ background: 'var(--card-bg)', borderRadius: 12, border: '1px solid var(--border)', padding: '16px 20px' }}>
                    <div style={{ fontSize: '1.4rem', marginBottom: 4 }}>{s.icon}</div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 700 }}>{fmtMoney(s.value)}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {stats.top_articles.length > 0 && (
                <div style={{ background: 'var(--card-bg)', borderRadius: 12, border: '1px solid var(--border)', padding: 20, marginBottom: 16 }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 12 }}>Top articles ce mois</h3>
                  {stats.top_articles.map((a, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '0.88rem' }}>
                      <span>{i + 1}. {a.nom}</span>
                      <span style={{ fontWeight: 600 }}>{fmtMoney(a.total_ca)}</span>
                    </div>
                  ))}
                </div>
              )}

              {stats.repartition.length > 0 && (
                <div style={{ background: 'var(--card-bg)', borderRadius: 12, border: '1px solid var(--border)', padding: 20 }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 12 }}>Répartition directe / prestataires</h3>
                  {stats.repartition.map(r => {
                    const total = stats.repartition.reduce((s, x) => s + x.total, 0);
                    const pct = total > 0 ? Math.round((r.total / total) * 100) : 0;
                    return (
                      <div key={r.type} style={{ marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.88rem' }}>
                          <span>{r.type === 'directe' ? '🏪 Vente directe' : '🛵 Via prestataire'}</span>
                          <span>{fmtMoney(r.total)} ({pct}%)</span>
                        </div>
                        <div style={{ height: 8, background: 'var(--border)', borderRadius: 4 }}>
                          <div style={{ height: 8, background: 'var(--primary)', borderRadius: 4, width: `${pct}%` }} />
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
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: 20 }}>
              Nouvelle vente — {selectedActivite?.nom}
            </h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Date</label>
                <input type="date" value={dateVente} onChange={e => setDateVente(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Type</label>
                <select value={typeVente} onChange={e => setTypeVente(e.target.value as 'directe' | 'prestataire')}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)' }}>
                  <option value="directe">Vente directe</option>
                  <option value="prestataire">Via prestataire</option>
                </select>
              </div>
            </div>

            {typeVente === 'prestataire' && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Prestataire</label>
                <select value={prestataireId} onChange={e => setPrestataireId(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)' }}>
                  <option value="">-- Sélectionner --</option>
                  {prestataires.map(p => (
                    <option key={p.id} value={p.id}>{p.nom} ({p.commission_pct}%)</option>
                  ))}
                </select>
              </div>
            )}

            {/* Articles */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Articles ({lignes.length})</label>
              </div>
              <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 8 }}>
                {articles.filter(a => a.actif).map(a => {
                  const isInLignes = lignes.some(l => l.article_type === a.article_type && l.article_id === a.article_id);
                  return (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--border)', gap: 8 }}>
                      <span style={{ flex: 1, fontSize: '0.88rem' }}>
                        {a.nom}
                        {a.unite_nom && <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}> ({a.unite_nom})</span>}
                      </span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, minWidth: 70, textAlign: 'right' }}>{fmtMoney(a.prix_vente)}</span>
                      <button
                        onClick={() => isInLignes
                          ? setLignes(prev => prev.filter(l => !(l.article_type === a.article_type && l.article_id === a.article_id)))
                          : handleAddLigne(a)
                        }
                        style={{
                          padding: '3px 10px', borderRadius: 6, cursor: 'pointer', fontSize: '0.78rem',
                          border: isInLignes ? '1px solid #dc2626' : '1px solid var(--primary)',
                          color: isInLignes ? '#dc2626' : 'var(--primary)',
                          background: 'none',
                        }}
                      >
                        {isInLignes ? 'Retirer' : 'Ajouter'}
                      </button>
                    </div>
                  );
                })}
                {articles.filter(a => a.actif).length === 0 && (
                  <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    Aucun article vendable. Configurez le catalogue vendable d'abord.
                  </div>
                )}
              </div>

              {lignes.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Quantités</div>
                  {lignes.map((l, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ flex: 1, fontSize: '0.87rem' }}>{l.article_nom}</span>
                      <input
                        type="number" min="0.001" step="0.001" value={l.quantite}
                        onChange={e => setLignes(prev => prev.map((x, j) => j === i ? { ...x, quantite: parseFloat(e.target.value) || 1 } : x))}
                        style={{ width: 80, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', textAlign: 'center' }}
                      />
                      <input
                        type="number" min="0" step="0.01" value={l.prix_unitaire}
                        onChange={e => setLignes(prev => prev.map((x, j) => j === i ? { ...x, prix_unitaire: parseFloat(e.target.value) || 0 } : x))}
                        style={{ width: 90, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', textAlign: 'right' }}
                      />
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>DT</span>
                    </div>
                  ))}
                  <div style={{ textAlign: 'right', fontWeight: 700, fontSize: '1rem', marginTop: 8 }}>
                    Total : {fmtMoney(totalCA)}
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Notes (optionnel)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', resize: 'vertical' }} />
            </div>

            {saveError && <div style={{ color: '#dc2626', fontSize: '0.85rem', marginBottom: 12 }}>{saveError}</div>}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowNouvelleVente(false); setLignes([]); setSaveError(''); }}
                style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', cursor: 'pointer' }}>
                Annuler
              </button>
              <button onClick={handleSubmitVente} disabled={saving || lignes.length === 0}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontWeight: 600, opacity: saving || lignes.length === 0 ? 0.6 : 1 }}>
                {saving ? 'Enregistrement…' : 'Confirmer la vente'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Ajout Article Vendable ── */}
      {showAddArticle && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 420 }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 20 }}>Ajouter au catalogue vendable</h2>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Type d'article</label>
              <select value={newArticleType} onChange={e => { setNewArticleType(e.target.value as 'produit' | 'ingredient'); setNewArticleId(''); }}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)' }}>
                <option value="produit">Produit (fiche technique)</option>
                <option value="ingredient">Ingrédient</option>
              </select>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Article</label>
              <select value={newArticleId} onChange={e => setNewArticleId(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)' }}>
                <option value="">-- Sélectionner --</option>
                {newArticleType === 'produit'
                  ? allProduits.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)
                  : allIngredients.map(i => <option key={i.id} value={i.id}>{i.nom}{i.unite_nom ? ` (${i.unite_nom})` : ''}</option>)
                }
              </select>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Prix de vente (DT)</label>
              <input type="number" min="0" step="0.01" value={newPrixVente} onChange={e => setNewPrixVente(e.target.value)}
                placeholder="0.00"
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)' }} />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAddArticle(false)}
                style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', cursor: 'pointer' }}>
                Annuler
              </button>
              <button onClick={handleAddArticleVendable} disabled={catalogueSaving || !newArticleId || !newPrixVente}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontWeight: 600, opacity: catalogueSaving || !newArticleId || !newPrixVente ? 0.6 : 1 }}>
                {catalogueSaving ? 'Enregistrement…' : 'Ajouter'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
