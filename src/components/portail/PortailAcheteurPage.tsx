import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import PortailShell from './PortailShell';

// Portail acheteur — catalogue de commande. Tout article proposé est
// commandable (aucune notion de disponibilité côté acheteur) : le vendeur
// ajuste les quantités, voire retire des lignes, au moment de l'expédition.
const C = '#6d28d9';
const CD = '#4c1d95';
const CB = '#c4b5fd';
const CL = '#f5f3ff';

const PAGE_SIZE = 10;

interface OffreCatalogue {
  articleType: 'ingredient' | 'produit';
  articleId: number;
  nom: string;
  unite: string;
  categorie: string;
  categorieProduit: string | null; // catégorie produit du vendeur (produits uniquement)
  prixUnitaireTtc: number;
}
interface Panier { quantite: string }

const keyOf = (o: { articleType: string; articleId: number }) => `${o.articleType}:${o.articleId}`;
const parseNum = (v: string) => Number(String(v).replace(',', '.'));
const fmt = (n: number) => `${n.toFixed(3)} DT`;

// Accent visuel des cartes : dégradé stable par catégorie (hash du nom)
const PALETTES: [string, string][] = [
  ['#7c3aed', '#a78bfa'], ['#0ea5e9', '#38bdf8'], ['#f59e0b', '#fbbf24'],
  ['#10b981', '#34d399'], ['#ec4899', '#f472b6'], ['#6366f1', '#818cf8'],
  ['#14b8a6', '#2dd4bf'], ['#f43f5e', '#fb7185'],
];
const paletteOf = (categorie: string): [string, string] => {
  let h = 7;
  for (const ch of categorie) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return PALETTES[h % PALETTES.length];
};
const initialeOf = (nom: string) => (nom.trim()[0] || '?').toUpperCase();

export default function PortailAcheteurPage() {
  const navigate = useNavigate();
  const [vendeur, setVendeur] = useState('');
  const [offres, setOffres] = useState<OffreCatalogue[]>([]);
  const [loading, setLoading] = useState(true);
  const [moduleOff, setModuleOff] = useState(false);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [page, setPage] = useState(1);
  const [panier, setPanier] = useState<Record<string, Panier>>({});
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    api.get('/api/portail/catalogue')
      .then(({ data }) => { setVendeur(data.vendeur); setOffres(data.offres); })
      .catch((e) => {
        if (e?.response?.data?.code === 'MODULE_ACHETEURS_INACTIVE') setModuleOff(true);
        else setError('Erreur de chargement du catalogue');
      })
      .finally(() => setLoading(false));
  }, []);

  const getP = (k: string): Panier => panier[k] || { quantite: '' };
  const setP = (k: string, patch: Partial<Panier>) => setPanier(prev => ({ ...prev, [k]: { ...getP(k), ...patch } }));
  const stepP = (k: string, delta: number) => {
    // setState fonctionnel : les clics rapprochés s'accumulent correctement
    setPanier(prev => {
      const cur = parseNum(prev[k]?.quantite || '') || 0;
      const next = Math.max(0, Math.round((cur + delta) * 1000) / 1000);
      return { ...prev, [k]: { quantite: next > 0 ? String(next) : '' } };
    });
  };

  const lignesPanier = useMemo(() =>
    offres.map(o => ({ o, p: getP(keyOf(o)) })).filter(({ p }) => parseNum(p.quantite) > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [offres, panier]);

  const totalBrut = lignesPanier.reduce((s, { o, p }) => s + o.prixUnitaireTtc * parseNum(p.quantite), 0);

  const commander = async () => {
    if (lignesPanier.length === 0) return;
    const invalide = lignesPanier.find(({ p }) => Math.round(parseNum(p.quantite) * 1000) / 1000 <= 0);
    if (invalide) { setError(`Quantité invalide pour « ${invalide.o.nom} » (minimum 0.001)`); return; }
    setSaving(true); setError('');
    try {
      await api.post('/api/portail/commandes', {
        notes: notes.trim() || undefined,
        lignes: lignesPanier.map(({ o, p }) => ({
          articleType: o.articleType, articleId: o.articleId, quantite: parseNum(p.quantite),
        })),
      });
      setPanier({}); setNotes(''); setSuccess(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: unknown) {
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erreur lors de l\'envoi de la commande');
    } finally {
      setSaving(false);
    }
  };

  const categories = useMemo(() => [...new Set(offres.map(o => o.categorie))], [offres]);

  // Filtres + pagination (10 articles par page), l'ordre par catégorie vient du serveur
  const filtered = offres.filter(o => {
    if (search.trim() && !o.nom.toLowerCase().includes(search.trim().toLowerCase())) return false;
    if (catFilter && o.categorie !== catFilter) return false;
    return true;
  });
  const nbPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageCourante = Math.min(page, nbPages);
  const pageItems = filtered.slice((pageCourante - 1) * PAGE_SIZE, pageCourante * PAGE_SIZE);

  // Regroupement de la page courante par catégorie (sections)
  const groupes = useMemo(() => {
    const map = new Map<string, OffreCatalogue[]>();
    for (const o of pageItems) {
      const g = map.get(o.categorie) || [];
      g.push(o);
      map.set(o.categorie, g);
    }
    return [...map.entries()];
  }, [pageItems]);

  const resetPage = () => setPage(1);

  return (
    <PortailShell>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: '1.35rem', fontWeight: 900, color: '#0f172a', margin: '0 0 4px' }}>Catalogue — {vendeur}</h1>
        <p style={{ color: '#64748b', fontSize: '0.86rem', margin: 0 }}>
          Choisissez vos quantités puis envoyez votre commande : votre fournisseur la prépare et l'expédie.
        </p>
      </div>

      {success && (
        <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 12, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '1.3rem' }}>✅</span>
          <div style={{ flex: 1, color: '#166534', fontWeight: 600, fontSize: '0.9rem' }}>
            Commande envoyée ! Votre fournisseur va la traiter — suivez son statut dans « Mes commandes ».
          </div>
          <button onClick={() => navigate('/portail/commandes')}
            style={{ background: '#166534', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
            📦 Mes commandes
          </button>
        </div>
      )}
      {error && <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 10, padding: '10px 16px', marginBottom: 14, fontSize: '0.85rem', fontWeight: 600 }}>⚠️ {error}</div>}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Chargement…</div>
      ) : moduleOff ? (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '40px 28px', textAlign: 'center' }}>
          <div style={{ fontSize: '2.4rem', marginBottom: 10 }}>🔒</div>
          <div style={{ fontWeight: 800, color: '#334155' }}>Le portail de commande n'est pas actif</div>
          <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 6 }}>Contactez votre fournisseur.</div>
        </div>
      ) : offres.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '40px 28px', textAlign: 'center' }}>
          <div style={{ fontSize: '2.4rem', marginBottom: 10 }}>🛍️</div>
          <div style={{ fontWeight: 800, color: '#334155' }}>Aucun article proposé pour le moment</div>
          <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 6 }}>Votre fournisseur n'a pas encore publié son catalogue.</div>
        </div>
      ) : (
        <>
          {/* Barre de filtres */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px', marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={search} onChange={e => { setSearch(e.target.value); resetPage(); }} placeholder="🔍 Rechercher un article…"
              style={{ padding: '9px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.86rem', fontFamily: 'inherit', flex: 1, minWidth: 180 }} />
            <select value={catFilter} onChange={e => { setCatFilter(e.target.value); resetPage(); }}
              style={{ padding: '9px 10px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.84rem', fontFamily: 'inherit', maxWidth: 220 }}>
              <option value="">Toutes les catégories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <span style={{ fontSize: '0.78rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
              {filtered.length} article{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>

          {filtered.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: '#64748b' }}>Aucun article ne correspond à vos filtres.</div>
          ) : (
            <>
              <style>{`
                .pcat-card { transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease; }
                .pcat-card:hover { transform: translateY(-3px); box-shadow: 0 12px 28px rgba(76,29,149,0.13); border-color: ${CB}; }
                .pcat-qbtn { transition: background .15s ease; }
                .pcat-qbtn:hover:not(:disabled) { background: #ede9fe !important; }
              `}</style>
              {groupes.map(([cat, items]) => {
                const [pc1, pc2] = paletteOf(cat);
                return (
                  <div key={cat} style={{ marginBottom: 22 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, margin: '0 0 12px' }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: `linear-gradient(135deg, ${pc1}, ${pc2})`, flexShrink: 0 }} />
                      <span style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.98rem' }}>{cat}</span>
                      <span style={{ fontSize: '0.7rem', color: pc1, fontWeight: 800, background: `${pc1}14`, borderRadius: 20, padding: '2px 9px' }}>
                        {items.length} article{items.length > 1 ? 's' : ''}
                      </span>
                      <span style={{ flex: 1, height: 1, background: '#eceaf5' }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 14 }}>
                      {items.map(o => {
                        const k = keyOf(o);
                        const p = getP(k);
                        const qte = parseNum(p.quantite) || 0;
                        return (
                          <div key={k} className="pcat-card"
                            style={{ background: '#fff', border: `1.5px solid ${qte > 0 ? CB : '#eceaf5'}`, borderRadius: 16, padding: '16px 16px 14px', boxShadow: qte > 0 ? '0 6px 18px rgba(109,40,217,0.12)' : '0 1px 3px rgba(15,23,42,0.04)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                              <span style={{ width: 42, height: 42, borderRadius: 13, flexShrink: 0, background: `linear-gradient(135deg, ${pc1}, ${pc2})`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '1.1rem', boxShadow: `0 4px 10px ${pc1}33` }}>
                                {initialeOf(o.nom)}
                              </span>
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={o.nom}>{o.nom}</div>
                                <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {o.categorieProduit || o.categorie}
                                </div>
                              </div>
                              {qte > 0 && (
                                <span style={{ flexShrink: 0, fontSize: '0.66rem', fontWeight: 800, color: CD, background: CL, border: `1px solid ${CB}`, borderRadius: 20, padding: '3px 8px', whiteSpace: 'nowrap' }}>
                                  🧺 ×{qte}
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                              <span style={{ fontSize: '1.25rem', color: CD, fontWeight: 900, letterSpacing: '-0.01em' }}>{fmt(o.prixUnitaireTtc)}</span>
                              <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600 }}>TTC / {o.unite}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 'auto' }}>
                              <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${qte > 0 ? CB : '#e2e8f0'}`, borderRadius: 11, overflow: 'hidden', background: '#fff' }}>
                                <button className="pcat-qbtn" onClick={() => stepP(k, -1)} disabled={qte === 0}
                                  style={{ width: 34, height: 36, border: 'none', background: '#f8fafc', color: qte > 0 ? CD : '#cbd5e1', fontWeight: 800, cursor: qte > 0 ? 'pointer' : 'default', fontSize: '1rem' }}>−</button>
                                <input value={p.quantite} onChange={e => setP(k, { quantite: e.target.value })} placeholder="0"
                                  style={{ width: 56, height: 34, padding: 0, border: 'none', borderLeft: '1px solid #eceaf5', borderRight: '1px solid #eceaf5', fontSize: '0.9rem', fontFamily: 'inherit', textAlign: 'center', outline: 'none', color: '#0f172a', fontWeight: 800 }} />
                                <button className="pcat-qbtn" onClick={() => stepP(k, 1)}
                                  style={{ width: 34, height: 36, border: 'none', background: '#f8fafc', color: CD, fontWeight: 800, cursor: 'pointer', fontSize: '1rem' }}>+</button>
                              </div>
                              <span style={{ marginLeft: 'auto', fontSize: '0.84rem', fontWeight: 800, color: qte > 0 ? CD : '#cbd5e1', whiteSpace: 'nowrap' }}>
                                {qte > 0 ? `= ${fmt(o.prixUnitaireTtc * qte)}` : ''}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Pagination (10 articles par page) */}
              {nbPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 }}>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={pageCourante === 1}
                    style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: pageCourante === 1 ? '#cbd5e1' : CD, fontWeight: 700, fontSize: '0.82rem', cursor: pageCourante === 1 ? 'default' : 'pointer' }}>
                    ← Précédent
                  </button>
                  {Array.from({ length: nbPages }, (_, i) => i + 1).map(n => (
                    <button key={n} onClick={() => setPage(n)}
                      style={{ minWidth: 34, padding: '7px 0', borderRadius: 8, border: `1px solid ${n === pageCourante ? C : '#e2e8f0'}`, background: n === pageCourante ? C : '#fff', color: n === pageCourante ? '#fff' : '#475569', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
                      {n}
                    </button>
                  ))}
                  <button onClick={() => setPage(p => Math.min(nbPages, p + 1))} disabled={pageCourante === nbPages}
                    style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: pageCourante === nbPages ? '#cbd5e1' : CD, fontWeight: 700, fontSize: '0.82rem', cursor: pageCourante === nbPages ? 'default' : 'pointer' }}>
                    Suivant →
                  </button>
                </div>
              )}
            </>
          )}

          {/* Panier flottant détaillé */}
          {lignesPanier.length > 0 && (
            <div style={{ position: 'fixed', bottom: 18, right: 24, zIndex: 90, background: '#fff', border: `1.5px solid ${CB}`, borderRadius: 14, boxShadow: '0 12px 36px rgba(76,29,149,0.22)', padding: '14px 18px', width: 330, maxHeight: '60vh', display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontWeight: 800, color: CD, fontSize: '0.9rem', marginBottom: 8 }}>
                🧺 Mon panier <span style={{ fontWeight: 600, color: '#94a3b8', fontSize: '0.76rem' }}>({lignesPanier.length} article{lignesPanier.length > 1 ? 's' : ''})</span>
              </div>
              <div style={{ overflowY: 'auto', marginBottom: 8, flex: 1 }}>
                {lignesPanier.map(({ o, p }) => (
                  <div key={keyOf(o)} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ flex: 1, fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.nom}</span>
                    <span style={{ color: '#64748b', whiteSpace: 'nowrap' }}>× {parseNum(p.quantite)}</span>
                    <span style={{ fontWeight: 700, color: CD, whiteSpace: 'nowrap' }}>{fmt(o.prixUnitaireTtc * parseNum(p.quantite))}</span>
                    <button onClick={() => setP(keyOf(o), { quantite: '' })} title="Retirer"
                      style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontWeight: 800, padding: '0 2px' }}>✕</button>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', color: CD, marginBottom: 8, background: CL, borderRadius: 8, padding: '8px 10px' }}>
                <strong>Total TTC</strong><strong>{fmt(totalBrut)}</strong>
              </div>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Note pour le fournisseur (optionnel)"
                style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.78rem', fontFamily: 'inherit', marginBottom: 10 }} />
              <button onClick={commander} disabled={saving}
                style={{ width: '100%', padding: '11px 0', borderRadius: 10, border: 'none', background: `linear-gradient(135deg, ${CD}, ${C})`, color: '#fff', fontWeight: 800, fontSize: '0.9rem', cursor: saving ? 'default' : 'pointer' }}>
                {saving ? 'Envoi…' : '📨 Envoyer la commande'}
              </button>
              <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: 6, textAlign: 'center' }}>
                Le montant final (remise éventuelle, timbre) sera confirmé sur la facture.
              </div>
            </div>
          )}
        </>
      )}
    </PortailShell>
  );
}
