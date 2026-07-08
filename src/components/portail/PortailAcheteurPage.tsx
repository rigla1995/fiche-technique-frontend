import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import PortailShell from './PortailShell';

// Portail acheteur — catalogue de commande. L'acheteur ne voit jamais les
// quantités de stock : uniquement un badge disponible / rupture.
const C = '#6d28d9';
const CD = '#4c1d95';
const CB = '#c4b5fd';

interface OffreCatalogue {
  articleType: 'ingredient' | 'produit';
  articleId: number;
  nom: string;
  unite: string;
  categorie: string;
  prixUnitaireTtc: number;
  tailleLot: number | null;
  prixLotTtc: number | null;
  disponible: boolean;
}
interface Panier { mode: 'unite' | 'lot'; quantite: string }

const keyOf = (o: { articleType: string; articleId: number }) => `${o.articleType}:${o.articleId}`;
const parseNum = (v: string) => Number(String(v).replace(',', '.'));
const fmt = (n: number) => `${n.toFixed(3)} DT`;

export default function PortailAcheteurPage() {
  const navigate = useNavigate();
  const [vendeur, setVendeur] = useState('');
  const [remisePct, setRemisePct] = useState(0);
  const [offres, setOffres] = useState<OffreCatalogue[]>([]);
  const [loading, setLoading] = useState(true);
  const [moduleOff, setModuleOff] = useState(false);
  const [search, setSearch] = useState('');
  const [panier, setPanier] = useState<Record<string, Panier>>({});
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    api.get('/api/portail/catalogue')
      .then(({ data }) => { setVendeur(data.vendeur); setRemisePct(data.remisePct || 0); setOffres(data.offres); })
      .catch((e) => {
        if (e?.response?.data?.code === 'MODULE_ACHETEURS_INACTIVE') setModuleOff(true);
        else setError('Erreur de chargement du catalogue');
      })
      .finally(() => setLoading(false));
  }, []);

  const getP = (k: string): Panier => panier[k] || { mode: 'unite', quantite: '' };
  const setP = (k: string, patch: Partial<Panier>) => setPanier(prev => ({ ...prev, [k]: { ...getP(k), ...patch } }));

  const lignesPanier = useMemo(() =>
    offres.map(o => ({ o, p: getP(keyOf(o)) })).filter(({ p }) => parseNum(p.quantite) > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [offres, panier]);

  const totalBrut = lignesPanier.reduce((s, { o, p }) => {
    const prix = p.mode === 'lot' ? (o.prixLotTtc ?? 0) : o.prixUnitaireTtc;
    return s + prix * parseNum(p.quantite);
  }, 0);
  const totalNet = totalBrut * (1 - remisePct / 100);

  const commander = async () => {
    if (lignesPanier.length === 0) return;
    setSaving(true); setError('');
    try {
      await api.post('/api/portail/commandes', {
        notes: notes.trim() || undefined,
        lignes: lignesPanier.map(({ o, p }) => ({
          articleType: o.articleType, articleId: o.articleId, mode: p.mode, quantite: parseNum(p.quantite),
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

  const filtered = offres.filter(o => !search.trim() || o.nom.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <PortailShell>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: '1.35rem', fontWeight: 900, color: '#0f172a', margin: '0 0 4px' }}>Catalogue — {vendeur}</h1>
        <p style={{ color: '#64748b', fontSize: '0.86rem', margin: 0 }}>
          Choisissez vos quantités puis envoyez votre commande : votre fournisseur la validera.
          {remisePct > 0 && <> Votre remise : <strong style={{ color: C }}>{remisePct}%</strong>.</>}
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Rechercher un article…"
            style={{ padding: '9px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.86rem', fontFamily: 'inherit', width: 280, marginBottom: 14 }} />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 14 }}>
            {filtered.map(o => {
              const k = keyOf(o);
              const p = getP(k);
              const prix = p.mode === 'lot' ? (o.prixLotTtc ?? 0) : o.prixUnitaireTtc;
              const qte = parseNum(p.quantite) || 0;
              return (
                <div key={k} style={{ background: '#fff', border: `1.5px solid ${qte > 0 ? CB : '#e2e8f0'}`, borderRadius: 14, padding: '16px 16px 14px', opacity: o.disponible ? 1 : 0.65 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                    <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.92rem' }}>{o.nom}</div>
                    <span style={{ flexShrink: 0, padding: '2px 9px', borderRadius: 20, fontSize: '0.68rem', fontWeight: 700, background: o.disponible ? '#dcfce7' : '#fee2e2', color: o.disponible ? '#166534' : '#991b1b', height: 'fit-content' }}>
                      {o.disponible ? 'Disponible' : 'Rupture'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginBottom: 10 }}>{o.unite} · {o.categorie}</div>
                  <div style={{ fontSize: '0.86rem', color: CD, fontWeight: 700, marginBottom: 10 }}>
                    {fmt(o.prixUnitaireTtc)} / {o.unite}
                    {o.tailleLot && <span style={{ display: 'block', fontSize: '0.76rem', color: C, fontWeight: 600 }}>Lot de {o.tailleLot} : {fmt(o.prixLotTtc ?? 0)}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {o.tailleLot ? (
                      <select value={p.mode} onChange={e => setP(k, { mode: e.target.value as 'unite' | 'lot' })}
                        disabled={!o.disponible}
                        style={{ padding: '7px 8px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.78rem', fontFamily: 'inherit', flex: 1 }}>
                        <option value="unite">Unité</option>
                        <option value="lot">Lot de {o.tailleLot}</option>
                      </select>
                    ) : <div style={{ flex: 1, fontSize: '0.78rem', color: '#94a3b8', alignSelf: 'center' }}>À l'unité</div>}
                    <input value={p.quantite} onChange={e => setP(k, { quantite: e.target.value })} placeholder="Qté"
                      disabled={!o.disponible}
                      style={{ width: 68, padding: '7px 8px', borderRadius: 8, border: `1px solid ${qte > 0 ? C : '#e2e8f0'}`, fontSize: '0.82rem', fontFamily: 'inherit', textAlign: 'right' }} />
                  </div>
                  {qte > 0 && (
                    <div style={{ marginTop: 8, fontSize: '0.8rem', fontWeight: 800, color: CD, textAlign: 'right' }}>= {fmt(prix * qte)}</div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Panier flottant */}
          {lignesPanier.length > 0 && (
            <div style={{ position: 'fixed', bottom: 18, right: 24, zIndex: 90, background: '#fff', border: `1.5px solid ${CB}`, borderRadius: 14, boxShadow: '0 12px 36px rgba(76,29,149,0.22)', padding: '14px 18px', minWidth: 290 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: '#475569', marginBottom: 4 }}>
                <span>🧺 {lignesPanier.length} article{lignesPanier.length > 1 ? 's' : ''}</span><strong>{fmt(totalBrut)}</strong>
              </div>
              {remisePct > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#166534', marginBottom: 4 }}>
                  <span>Après remise {remisePct}%</span><strong>≈ {fmt(totalNet)}</strong>
                </div>
              )}
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Note pour le fournisseur (optionnel)"
                style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.78rem', fontFamily: 'inherit', margin: '6px 0 10px' }} />
              <button onClick={commander} disabled={saving}
                style={{ width: '100%', padding: '11px 0', borderRadius: 10, border: 'none', background: `linear-gradient(135deg, ${CD}, ${C})`, color: '#fff', fontWeight: 800, fontSize: '0.9rem', cursor: saving ? 'default' : 'pointer' }}>
                {saving ? 'Envoi…' : '📨 Envoyer la commande'}
              </button>
              <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: 6, textAlign: 'center' }}>
                Le montant final (remise, timbre) sera confirmé sur la facture.
              </div>
            </div>
          )}
        </>
      )}
    </PortailShell>
  );
}
