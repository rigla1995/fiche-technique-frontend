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

const fmtMoney = (n: number | null | undefined) => {
  if (n == null) return '—';
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' DT';
};

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

interface ActivitePrestataire {
  id: string;
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

type Tab = 'saisie' | 'historique';

export default function VentesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activites, setActivites] = useState<Activite[]>([]);
  const [selectedActiviteId, setSelectedActiviteId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('saisie');

  // Data
  const [articles, setArticles] = useState<ArticleVendable[]>([]);
  const [prestataires, setPrestataires] = useState<ActivitePrestataire[]>([]);
  const [prixPrestataires, setPrixPrestataires] = useState<ArticlePrixPrestataire[]>([]);
  const [ventes, setVentes] = useState<Vente[]>([]);
  const [loading, setLoading] = useState(false);

  // Saisie state: qtés par article+channel
  const [dateVente, setDateVente] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  // qtés[articleId][channelKey] = quantite — channelKey: 'direct' | activitePrestataire.id
  const [qtes, setQtes] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

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
    }).catch(() => {}).finally(() => setLoading(false));
  }, [selectedActiviteId]);

  useEffect(() => { loadData(); }, [loadData]);

  const activePrests = prestataires;
  const produits = articles.filter(a => a.article_type === 'produit');
  const supplements = articles.filter(a => a.article_type === 'ingredient');

  const getQte = (articleId: string, channel: string) => qtes[articleId]?.[channel] ?? '';

  const setQte = (articleId: string, channel: string, val: string) => {
    setQtes(prev => ({ ...prev, [articleId]: { ...prev[articleId], [channel]: val } }));
  };

  const getPrixPrestataire = (articleId: string, apId: string) => {
    const av = articles.find(a => a.id === articleId);
    if (!av) return 0;
    const override = prixPrestataires.find(p => p.article_vendable_id === articleId && p.activite_prestataire_id === apId);
    if (override?.prix_vente != null) return override.prix_vente;
    const ap = activePrests.find(p => p.id === apId);
    return ap ? av.prix_vente * (1 - ap.taux_commission / 100) : av.prix_vente;
  };

  // Compute total CA for current saisie
  const computeTotal = () => {
    let total = 0;
    for (const av of articles) {
      const directQte = parseFloat(getQte(av.id, 'direct')) || 0;
      total += directQte * av.prix_vente;
      for (const ap of activePrests) {
        const pqte = parseFloat(getQte(av.id, ap.id)) || 0;
        total += pqte * getPrixPrestataire(av.id, ap.id);
      }
    }
    return total;
  };

  const handleSubmit = async () => {
    if (!selectedActiviteId) return;
    setSaving(true); setSaveError(''); setSaveSuccess(false);

    const ventesToCreate: Array<{
      type_vente: 'directe' | 'prestataire';
      prestataire_id?: string;
      lignes: Array<{ article_type: string; article_id: number; quantite: number; prix_unitaire: number }>;
    }> = [];

    // Build directe vente
    const directLignes = articles.flatMap(av => {
      const qte = parseFloat(getQte(av.id, 'direct')) || 0;
      if (qte <= 0) return [];
      return [{ article_type: av.article_type, article_id: av.article_id, quantite: qte, prix_unitaire: av.prix_vente }];
    });
    if (directLignes.length > 0) ventesToCreate.push({ type_vente: 'directe', lignes: directLignes });

    // Build prestataire ventes
    for (const ap of activePrests) {
      const lignes = articles.flatMap(av => {
        const qte = parseFloat(getQte(av.id, ap.id)) || 0;
        if (qte <= 0) return [];
        return [{ article_type: av.article_type, article_id: av.article_id, quantite: qte, prix_unitaire: getPrixPrestataire(av.id, ap.id) }];
      });
      if (lignes.length > 0) ventesToCreate.push({ type_vente: 'prestataire', prestataire_id: ap.id, lignes });
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
          notes: notes || null,
          lignes: v.lignes,
        });
      }
      setSaveSuccess(true);
      setQtes({});
      setNotes('');
      setDateVente(new Date().toISOString().slice(0, 10));
      loadData();
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e: unknown) {
      setSaveError(apiMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const handleAnnuler = async (id: string) => {
    if (!confirm('Annuler cette vente et réintégrer le stock ?')) return;
    try { await api.delete(`/api/ventes/${id}`); loadData(); }
    catch (e: unknown) { alert(apiMsg(e)); }
  };

  const selectedActivite = activites.find(a => a.id === selectedActiviteId);

  const ArticleRow = ({ av }: { av: ArticleVendable }) => (
    <tr style={{ borderBottom: `1px solid ${CB}` }}>
      <td style={{ padding: '11px 16px' }}>
        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: CD }}>{av.nom}</div>
        {av.unite_nom && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{av.unite_nom}</div>}
      </td>
      <td style={{ padding: '8px 16px', textAlign: 'center' }}>
        <span style={{ fontWeight: 700, color: C, fontSize: '0.9rem' }}>{fmtMoney(av.prix_vente)}</span>
      </td>
      {/* Directe */}
      <td style={{ padding: '8px 16px', textAlign: 'center' }}>
        <input type="number" min="0" step="0.001" value={getQte(av.id, 'direct')} placeholder="0"
          onChange={e => setQte(av.id, 'direct', e.target.value)}
          style={{ width: 78, padding: '7px 8px', borderRadius: 8, border: `1.5px solid ${getQte(av.id, 'direct') ? C : CB}`, background: getQte(av.id, 'direct') ? CL : '#fafafa', textAlign: 'center', fontSize: '0.88rem', fontWeight: 600, outline: 'none' }} />
      </td>
      {/* Par prestataire */}
      {activePrests.map(ap => (
        <td key={ap.id} style={{ padding: '8px 16px', textAlign: 'center' }}>
          <div>
            <input type="number" min="0" step="0.001" value={getQte(av.id, ap.id)} placeholder="0"
              onChange={e => setQte(av.id, ap.id, e.target.value)}
              style={{ width: 78, padding: '7px 8px', borderRadius: 8, border: `1.5px solid ${getQte(av.id, ap.id) ? C : CB}`, background: getQte(av.id, ap.id) ? CL : '#fafafa', textAlign: 'center', fontSize: '0.88rem', fontWeight: 600, outline: 'none' }} />
            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 2 }}>{fmtMoney(getPrixPrestataire(av.id, ap.id))}</div>
          </div>
        </td>
      ))}
    </tr>
  );

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
          <div style={{ display: 'flex', gap: 4, borderBottom: `2px solid ${CB}`, marginBottom: 24 }}>
            {(['saisie', 'historique'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                style={{
                  padding: '9px 20px', background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: '0.92rem', fontWeight: activeTab === tab ? 700 : 400,
                  color: activeTab === tab ? C : 'var(--text)',
                  borderBottom: activeTab === tab ? `3px solid ${C}` : '3px solid transparent',
                  marginBottom: -2,
                }}>
                {tab === 'saisie' ? '📝 Saisie des ventes' : '📋 Historique'}
              </button>
            ))}
          </div>

          {/* ── SAISIE TAB ── */}
          {activeTab === 'saisie' && (
            <>
              {loading ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Chargement…</div>
              ) : articles.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0', background: '#fff', borderRadius: 14, border: `1.5px solid ${CB}` }}>
                  <div style={{ fontSize: '3rem', marginBottom: 12 }}>🛍️</div>
                  <div style={{ color: 'var(--text-muted)', marginBottom: 12 }}>Aucun article vendable configuré pour cette activité</div>
                  <Link to="/client/ventes/configuration" style={{ color: C, fontWeight: 700, fontSize: '0.9rem' }}>
                    ⚙️ Configurer les prix de vente →
                  </Link>
                </div>
              ) : (
                <>
                  {/* Date + notes */}
                  <div style={{ background: '#fff', borderRadius: 12, border: `1.5px solid ${CB}`, padding: '16px 20px', marginBottom: 20, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div>
                      <label style={{ fontSize: '0.78rem', fontWeight: 700, display: 'block', marginBottom: 5, color: C, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date de vente</label>
                      <input type="date" value={dateVente} onChange={e => setDateVente(e.target.value)}
                        style={{ padding: '8px 12px', borderRadius: 9, border: `1.5px solid ${CB}`, background: CL, color: CD, fontWeight: 600, outline: 'none' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <label style={{ fontSize: '0.78rem', fontWeight: 700, display: 'block', marginBottom: 5, color: C, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notes (optionnel)</label>
                      <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Remarques…"
                        style={{ width: '100%', padding: '8px 12px', borderRadius: 9, border: `1.5px solid ${CB}`, background: '#fafafa', outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                  </div>

                  {/* Grille de saisie */}
                  <div style={{ background: '#fff', borderRadius: 14, border: `1.5px solid ${CB}`, overflow: 'hidden', boxShadow: '0 2px 12px rgba(180,83,9,0.08)', marginBottom: 20 }}>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
                        <thead>
                          <tr style={{ background: CL, borderBottom: `2px solid ${CB}` }}>
                            <th style={{ padding: '11px 16px', textAlign: 'left', fontSize: '0.78rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Article</th>
                            <th style={{ padding: '11px 16px', textAlign: 'center', fontSize: '0.78rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>Prix vente</th>
                            <th style={{ padding: '11px 16px', textAlign: 'center', fontSize: '0.78rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                              🏪 Qté directe
                            </th>
                            {activePrests.map(ap => (
                              <th key={ap.id} style={{ padding: '11px 16px', textAlign: 'center', fontSize: '0.78rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                                🛵 {ap.prestataire_nom}
                                <div style={{ fontSize: '0.68rem', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'none' }}>−{ap.taux_commission}%</div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {produits.length > 0 && (
                            <>
                              <tr>
                                <td colSpan={3 + activePrests.length} style={{ padding: '8px 16px', background: `${CD}10`, fontSize: '0.75rem', fontWeight: 800, color: CD, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                                  🛍️ Produits vendables
                                </td>
                              </tr>
                              {produits.map(av => <ArticleRow key={av.id} av={av} />)}
                            </>
                          )}
                          {supplements.length > 0 && (
                            <>
                              <tr>
                                <td colSpan={3 + activePrests.length} style={{ padding: '8px 16px', background: `${CD}10`, fontSize: '0.75rem', fontWeight: 800, color: CD, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                                  🧂 Suppléments
                                </td>
                              </tr>
                              {supplements.map(av => <ArticleRow key={av.id} av={av} />)}
                            </>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Total + submit */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                    <div style={{ background: CL, borderRadius: 12, border: `1.5px solid ${C}`, padding: '12px 22px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: CD }}>CA total saisi :</span>
                      <span style={{ fontSize: '1.25rem', fontWeight: 800, color: C }}>{fmtMoney(computeTotal())}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                      {saveError && <div style={{ color: '#dc2626', fontSize: '0.85rem' }}>{saveError}</div>}
                      {saveSuccess && <div style={{ color: '#166534', fontSize: '0.85rem', fontWeight: 600 }}>✓ Ventes enregistrées avec succès !</div>}
                      <button onClick={handleSubmit} disabled={saving}
                        style={{ padding: '11px 28px', borderRadius: 10, border: 'none', background: saving ? '#d1d5db' : `linear-gradient(135deg, ${CD} 0%, ${C} 100%)`, color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.95rem', boxShadow: saving ? 'none' : `0 4px 14px ${C}44` }}>
                        {saving ? 'Enregistrement…' : '✓ Confirmer les ventes'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* ── HISTORIQUE TAB ── */}
          {activeTab === 'historique' && (
            <>
              {loading ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Chargement…</div>
              ) : ventes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>💸</div>
                  Aucune vente enregistrée
                </div>
              ) : (
                <div style={{ background: '#fff', borderRadius: 14, border: `1.5px solid ${CB}`, overflow: 'hidden', boxShadow: '0 2px 12px rgba(180,83,9,0.08)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: CL, borderBottom: `2px solid ${CB}` }}>
                        {['Date', 'Type', 'CA', 'Marge', 'Statut', ''].map(h => (
                          <th key={h} style={{ padding: '11px 16px', textAlign: 'left', fontSize: '0.78rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ventes.map((v, idx) => (
                        <tr key={v.id} style={{ borderBottom: `1px solid ${CB}`, background: idx % 2 === 0 ? '#fff' : '#fffdf7' }}>
                          <td style={{ padding: '11px 16px', fontWeight: 600, fontSize: '0.9rem' }}>{fmtDate(v.date_vente)}</td>
                          <td style={{ padding: '11px 16px', fontSize: '0.88rem' }}>
                            {v.type_vente === 'directe' ? '🏪 Directe' : `🛵 ${v.prestataire_nom || 'Prestataire'}`}
                          </td>
                          <td style={{ padding: '11px 16px', fontWeight: 700, color: C }}>{fmtMoney(v.total_ca)}</td>
                          <td style={{ padding: '11px 16px', fontWeight: 600, color: v.total_marge >= 0 ? '#16a34a' : '#dc2626' }}>
                            {fmtMoney(v.total_marge)}
                          </td>
                          <td style={{ padding: '11px 16px' }}>
                            <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: '0.78rem', fontWeight: 600, background: v.statut === 'confirmee' ? '#dcfce7' : '#fef9c3', color: v.statut === 'confirmee' ? '#166534' : '#854d0e' }}>
                              {v.statut === 'confirmee' ? '✓ Confirmée' : v.statut}
                            </span>
                          </td>
                          <td style={{ padding: '8px 16px' }}>
                            <button onClick={() => handleAnnuler(v.id)}
                              style={{ border: '1.5px solid #dc2626', color: '#dc2626', background: 'none', borderRadius: 7, padding: '4px 12px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}>
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
        </>
      )}
    </div>
  );
}
