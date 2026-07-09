import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import PortailShell from './PortailShell';

// Portail acheteur — catalogue de commande. L'acheteur ne voit jamais les
// quantités de stock : uniquement un badge disponible / rupture.
const C = '#6d28d9';
const CD = '#4c1d95';
const CB = '#c4b5fd';

const PAGE_SIZE = 10;

interface OffreCatalogue {
  articleType: 'ingredient' | 'produit';
  articleId: number;
  nom: string;
  unite: string;
  categorie: string;
  prixUnitaireTtc: number;
  disponible: boolean;
}
interface Panier { quantite: string }

const keyOf = (o: { articleType: string; articleId: number }) => `${o.articleType}:${o.articleId}`;
const parseNum = (v: string) => Number(String(v).replace(',', '.'));
const fmt = (n: number) => `${n.toFixed(3)} DT`;

export default function PortailAcheteurPage() {
  const navigate = useNavigate();
  const [vendeur, setVendeur] = useState('');
  const [offres, setOffres] = useState<OffreCatalogue[]>([]);
  const [loading, setLoading] = useState(true);
  const [moduleOff, setModuleOff] = useState(false);
  const [search, setSearch] = useState('');
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

  const lignesPanier = useMemo(() =>
    offres.map(o => ({ o, p: getP(keyOf(o)) })).filter(({ p }) => parseNum(p.quantite) > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [offres, panier]);

  const totalBrut = lignesPanier.reduce((s, { o, p }) => s + o.prixUnitaireTtc * parseNum(p.quantite), 0);

  const commander = async () => {
    if (lignesPanier.length === 0) return;
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

  // Filtre + pagination (10 articles par page), l'ordre par catégorie vient du serveur
  const filtered = offres.filter(o => !search.trim() || o.nom.toLowerCase().includes(search.trim().toLowerCase()));
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

  return (
    <PortailShell>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: '1.35rem', fontWeight: 900, color: '#0f172a', margin: '0 0 4px' }}>Catalogue — {vendeur}</h1>
        <p style={{ color: '#64748b', fontSize: '0.86rem', margin: 0 }}>
          Choisissez vos quantités puis envoyez votre commande : votre fournisseur la validera.
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
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="🔍 Rechercher un article…"
            style={{ padding: '9px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.86rem', fontFamily: 'inherit', width: 280, marginBottom: 14 }} />

          {filtered.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: '#64748b' }}>Aucun article ne correspond à votre recherche.</div>
          ) : (
            <>
              {groupes.map(([cat, items]) => (
                <div key={cat} style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 10px' }}>
                    <span style={{ fontWeight: 800, color: CD, fontSize: '0.95rem' }}>{cat}</span>
                    <span style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 14 }}>
                    {items.map(o => {
                      const k = keyOf(o);
                      const p = getP(k);
                      const qte = parseNum(p.quantite) || 0;
                      return (
                        <div key={k} style={{ background: '#fff', border: `1.5px solid ${qte > 0 ? CB : '#e2e8f0'}`, borderRadius: 14, padding: '16px 16px 14px', opacity: o.disponible ? 1 : 0.65 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.92rem' }}>{o.nom}</div>
                            <span style={{ flexShrink: 0, padding: '2px 9px', borderRadius: 20, fontSize: '0.68rem', fontWeight: 700, background: o.disponible ? '#dcfce7' : '#fee2e2', color: o.disponible ? '#166534' : '#991b1b', height: 'fit-content' }}>
                              {o.disponible ? 'Disponible' : 'Rupture'}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginBottom: 10 }}>{o.unite}</div>
                          <div style={{ fontSize: '0.86rem', color: CD, fontWeight: 700, marginBottom: 10 }}>
                            {fmt(o.prixUnitaireTtc)} / {o.unite}
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <div style={{ flex: 1, fontSize: '0.78rem', color: '#94a3b8' }}>Quantité</div>
                            <input value={p.quantite} onChange={e => setP(k, { quantite: e.target.value })} placeholder="Qté"
                              disabled={!o.disponible}
                              style={{ width: 68, padding: '7px 8px', borderRadius: 8, border: `1px solid ${qte > 0 ? C : '#e2e8f0'}`, fontSize: '0.82rem', fontFamily: 'inherit', textAlign: 'right' }} />
                          </div>
                          {qte > 0 && (
                            <div style={{ marginTop: 8, fontSize: '0.8rem', fontWeight: 800, color: CD, textAlign: 'right' }}>= {fmt(o.prixUnitaireTtc * qte)}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

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

          {/* Panier flottant */}
          {lignesPanier.length > 0 && (
            <div style={{ position: 'fixed', bottom: 18, right: 24, zIndex: 90, background: '#fff', border: `1.5px solid ${CB}`, borderRadius: 14, boxShadow: '0 12px 36px rgba(76,29,149,0.22)', padding: '14px 18px', minWidth: 290 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: '#475569', marginBottom: 4 }}>
                <span>🧺 {lignesPanier.length} article{lignesPanier.length > 1 ? 's' : ''}</span><strong>{fmt(totalBrut)}</strong>
              </div>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Note pour le fournisseur (optionnel)"
                style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.78rem', fontFamily: 'inherit', margin: '6px 0 10px' }} />
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
