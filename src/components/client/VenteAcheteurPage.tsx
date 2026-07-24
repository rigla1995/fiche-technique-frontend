import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../api/client';
import GuideButton from './GuideButton';
import HistoryFilterBar, { FilterField, FilterInput, FilterSelect } from '../common/HistoryFilterBar';
import Pagination from '../common/Pagination';

// Thème violet de l'Espace Acheteurs
const C = '#6d28d9';
const CD = '#4c1d95';
const CL = '#f5f3ff';
const CB = '#c4b5fd';
const PAGE_ACCENT = { border: CB, bg: CL, text: CD };
// Pagination à 2 niveaux (même principe que Tarifs Acheteurs et le portail) :
// 5 catégories par page, 10 lignes par catégorie.
const CATS_PAR_PAGE = 5;
const LIGNES_PAR_CAT = 10;

interface Acheteur { id: number; nom: string; entreprise: string | null; actif: boolean }
interface Labo { id: number; nom: string }
interface Offre {
  articleType: 'ingredient' | 'produit'; articleId: number; nom: string; unite: string; categorie: string;
  prixUnitaireHt: number; tauxTva: number; prixUnitaireTtc: number; actif: boolean;
  // Promotions (migration 174) : prixPromoHt est le prix RÉELLEMENT appliqué par le
  // serveur quand aucun prix n'est saisi sur la ligne — il vaut prixUnitaireHt hors promo.
  promoPct?: number; promoActive?: boolean; prixPromoHt?: number;
}

/** Prix HT par défaut d'une offre = prix promo s'il y en a un (aligné sur le serveur). */
const prixDefautHt = (o: Offre) =>
  o.promoActive && (o.prixPromoHt ?? 0) > 0 ? o.prixPromoHt as number : o.prixUnitaireHt;
interface Ligne { quantite: string; prix: string }
interface Manquant { nom: string; unite: string; disponible: number; necessaire: number; manquant: number }

const keyOf = (o: { articleType: string; articleId: number }) => `${o.articleType}:${o.articleId}`;
const inp: React.CSSProperties = { padding: '7px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.84rem', fontFamily: 'inherit' };
const parseNum = (v: string) => Number(String(v).replace(',', '.'));
const fmtDate = (d: string) => { if (!d) return '—'; const [y, m, j] = d.split('-'); return `${j}/${m}/${y}`; };

export default function VenteAcheteurPage() {
  const navigate = useNavigate();
  const [acheteurs, setAcheteurs] = useState<Acheteur[]>([]);
  const [labos, setLabos] = useState<Labo[]>([]);
  const [offres, setOffres] = useState<Offre[]>([]);
  const [loading, setLoading] = useState(true);

  const [acheteurId, setAcheteurId] = useState('');
  const [laboId, setLaboId] = useState('');
  const [dateCommande, setDateCommande] = useState(new Date().toISOString().slice(0, 10));
  const [statutVente, setStatutVente] = useState<'expediee' | 'livree'>('expediee');
  const [dateLivraison, setDateLivraison] = useState(new Date().toISOString().slice(0, 10));
  const [remise, setRemise] = useState('0');
  const [timbre, setTimbre] = useState(true);

  // Filtres du catalogue + pagination à 2 niveaux
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [catPage, setCatPage] = useState(1);
  const [lignePages, setLignePages] = useState<Record<string, number>>({});

  const [lignes, setLignes] = useState<Record<string, Ligne>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [manquants, setManquants] = useState<Manquant[]>([]);
  const [success, setSuccess] = useState<{ numero: string; factureId: number; montantTtc: number } | null>(null);

  useEffect(() => {
    Promise.all([
      api.get('/api/acheteurs'),
      api.get('/api/labo'),
      api.get('/api/acheteurs/offres'),
    ]).then(([a, l, o]) => {
      setAcheteurs((a.data.acheteurs as Acheteur[]).filter(x => x.actif));
      setLabos(l.data);
      if (l.data.length === 1) setLaboId(String(l.data[0].id));
      const actives = [...o.data.articles, ...o.data.produits].filter((x: Offre) => x.actif);
      setOffres(actives);
    }).catch(() => setError('Erreur de chargement'))
      .finally(() => setLoading(false));
  }, []);

  const getLigne = (k: string): Ligne => lignes[k] || { quantite: '', prix: '' };
  const setLigne = (k: string, patch: Partial<Ligne>) =>
    setLignes(prev => ({ ...prev, [k]: { ...getLigne(k), ...patch } }));

  const lignesActives = useMemo(() =>
    offres.map(o => ({ o, l: getLigne(keyOf(o)) }))
      .filter(({ l }) => parseNum(l.quantite) > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [offres, lignes]);

  // Prix saisis HT : remise sur le HT, TVA ligne à ligne sur le net, TTC dérivé.
  const totaux = useMemo(() => {
    const r = Math.min(Math.max(parseNum(remise) || 0, 0), 100);
    const facteur = 1 - r / 100;
    let brutHt = 0;
    let tva = 0;
    for (const { o, l } of lignesActives) {
      const prixHt = l.prix !== '' ? parseNum(l.prix) : prixDefautHt(o);
      const ht = (Number.isFinite(prixHt) ? prixHt : 0) * parseNum(l.quantite);
      brutHt += ht;
      tva += ht * facteur * (o.tauxTva || 0) / 100;
    }
    const netHt = brutHt * facteur;
    const timbreVal = timbre ? 1 : 0;
    return { brutHt, remisePct: r, remiseVal: brutHt - netHt, netHt, tva, timbreVal, total: netHt + tva + timbreVal };
  }, [lignesActives, remise, timbre]);

  const fmt = (n: number) => `${n.toFixed(3)} DT`;

  // Champs obligatoires : acheteur + labo + au moins une ligne (+ dates cohérentes)
  const champsValides = !!acheteurId && !!laboId && lignesActives.length > 0 && !!dateCommande
    && (statutVente !== 'livree' || !!dateLivraison);

  const submit = async () => {
    setError(''); setManquants([]); setSuccess(null);
    if (!acheteurId) { setError('Choisissez un acheteur'); return; }
    if (!laboId) { setError('Choisissez un labo'); return; }
    if (lignesActives.length === 0) { setError('Saisissez au moins une quantité'); return; }
    if (remise !== '' && !Number.isFinite(parseNum(remise))) { setError('Remise invalide (0 à 100)'); return; }
    const ligneInvalide = lignesActives.find(({ l }) => l.prix !== '' && !(Number.isFinite(parseNum(l.prix)) && parseNum(l.prix) >= 0));
    if (ligneInvalide) { setError(`Prix invalide pour « ${ligneInvalide.o.nom} »`); return; }
    setSaving(true);
    try {
      const { data } = await api.post('/api/acheteurs/ventes', {
        acheteurId: Number(acheteurId),
        laboId: Number(laboId),
        dateCommande,
        statut: statutVente,
        dateExpedition: dateCommande,
        dateLivraison: statutVente === 'livree' ? dateLivraison : undefined,
        remisePct: totaux.remisePct,
        timbreFiscal: timbre,
        lignes: lignesActives.map(({ o, l }) => ({
          articleType: o.articleType,
          articleId: o.articleId,
          quantite: parseNum(l.quantite),
          prixHt: l.prix !== '' ? parseNum(l.prix) : undefined,
        })),
      });
      setSuccess({ numero: data.facture.numero, factureId: data.facture.id, montantTtc: data.facture.montantTtc });
      setLignes({});
    } catch (e: unknown) {
      const resp = (e as { response?: { status?: number; data?: { message?: string; manquants?: Manquant[] } } })?.response;
      if (resp?.status === 422 && resp.data?.manquants) {
        setManquants(resp.data.manquants);
        setError('Stock labo insuffisant pour valider cette vente :');
      } else {
        setError(resp?.data?.message ?? 'Erreur lors de l\'enregistrement');
      }
    } finally {
      setSaving(false);
    }
  };

  const ouvrirFacture = async (factureId: number) => {
    try {
      const res = await api.get(`/api/acheteurs/factures/${factureId}/pdf`, { responseType: 'blob' });
      window.open(URL.createObjectURL(res.data), '_blank');
    } catch { setError('Erreur lors de l\'ouverture de la facture'); }
  };

  // Catalogue filtré puis groupé par catégorie (même principe que Tarifs Acheteurs)
  const offresFiltrees = offres.filter(o => {
    if (search.trim() && !o.nom.toLowerCase().includes(search.trim().toLowerCase())) return false;
    if (catFilter && o.categorie !== catFilter) return false;
    return true;
  });
  const categories = useMemo(() => [...new Set(offres.map(o => o.categorie))], [offres]);
  const groupes = useMemo(() => {
    const map = new Map<string, Offre[]>();
    for (const o of offresFiltrees) {
      const g = map.get(o.categorie) || [];
      g.push(o);
      map.set(o.categorie, g);
    }
    return [...map.entries()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offres, search, catFilter]);

  // Tout changement de filtre remet les 2 niveaux de pagination à zéro
  useEffect(() => { setCatPage(1); setLignePages({}); }, [search, catFilter]);
  const totalCatPages = Math.max(1, Math.ceil(groupes.length / CATS_PAR_PAGE));
  const catPageCourante = Math.min(catPage, totalCatPages);
  const groupesAffiches = groupes.slice((catPageCourante - 1) * CATS_PAR_PAGE, catPageCourante * CATS_PAR_PAGE);
  const lignePageDe = (cat: string, nb: number) =>
    Math.min(lignePages[cat] || 1, Math.max(1, Math.ceil(nb / LIGNES_PAR_CAT)));

  const acheteurChoisi = acheteurs.find(a => String(a.id) === acheteurId);
  const laboChoisi = labos.find(l => String(l.id) === laboId);
  const lblStyle: React.CSSProperties = { display: 'block', fontSize: '0.72rem', fontWeight: 700, color: CD, marginBottom: 4 };

  return (
    <div className="page-content">
      {/* Hero */}
      <div style={{ background: `linear-gradient(135deg, ${CD} 0%, ${C} 55%, #8b5cf6 100%)`, borderRadius: 18, padding: '24px 28px', marginBottom: 20, boxShadow: '0 8px 32px rgba(109,40,217,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ flex: '1 1 300px', minWidth: 240 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🧾</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Nouvelle Vente Acheteur</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>
            Vente depuis le stock labo — le stock est déduit et la facture générée automatiquement
          </p>
        </div>
        <GuideButton section="acheteurs-ventes" />
      </div>

      {success && (
        <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 12, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '1.3rem' }}>✅</span>
          <div style={{ flex: 1, color: '#166534', fontWeight: 600, fontSize: '0.9rem' }}>
            Vente enregistrée — facture <strong>{success.numero}</strong> ({fmt(success.montantTtc)})
          </div>
          <button onClick={() => ouvrirFacture(success.factureId)}
            style={{ background: '#166534', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
            📄 Ouvrir la facture
          </button>
          <button onClick={() => navigate('/client/acheteurs/commandes')}
            style={{ background: 'none', color: '#166534', border: '1px solid #86efac', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
            Voir les ventes
          </button>
        </div>
      )}
      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 10, padding: '12px 16px', marginBottom: 12, fontSize: '0.86rem', fontWeight: 600 }}>
          ⚠️ {error}
          {manquants.length > 0 && (
            <table style={{ width: '100%', marginTop: 10, borderCollapse: 'collapse', fontSize: '0.8rem', background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
              <thead><tr style={{ background: '#fef2f2' }}>
                <th style={{ textAlign: 'left', padding: '6px 10px' }}>Article</th>
                <th style={{ textAlign: 'right', padding: '6px 10px' }}>Disponible</th>
                <th style={{ textAlign: 'right', padding: '6px 10px' }}>Nécessaire</th>
                <th style={{ textAlign: 'right', padding: '6px 10px' }}>Manquant</th>
              </tr></thead>
              <tbody>
                {manquants.map((m, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #fee2e2' }}>
                    <td style={{ padding: '6px 10px', fontWeight: 600 }}>{m.nom}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>{m.disponible} {m.unite}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>{m.necessaire} {m.unite}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 800, color: '#b91c1c' }}>{m.manquant} {m.unite}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Chargement…</div>
      ) : offres.length === 0 ? (
        <div style={{ background: CL, border: `2px dashed ${CB}`, borderRadius: 16, padding: '40px 28px', textAlign: 'center' }}>
          <div style={{ fontSize: '2.4rem', marginBottom: 10 }}>💲</div>
          <div style={{ fontWeight: 800, color: CD, marginBottom: 8 }}>Aucune offre active</div>
          <div style={{ fontSize: '0.86rem', color: '#5b21b6' }}>
            Configurez d'abord vos <Link to="/client/acheteurs/tarifs" style={{ color: C, fontWeight: 700 }}>Tarifs Acheteurs</Link> (prix + toggle « Proposé »).
          </div>
        </div>
      ) : (
        <>
          {/* Bloc filtres du catalogue (composant partagé) */}
          <HistoryFilterBar accent={C} accentDark={CD}
            subtitle={`${offresFiltrees.length} article${offresFiltrees.length > 1 ? 's' : ''} · ${lignesActives.length} ligne${lignesActives.length > 1 ? 's' : ''} saisie${lignesActives.length > 1 ? 's' : ''}`}
            onReset={(search.trim() || catFilter) ? () => { setSearch(''); setCatFilter(''); } : undefined}>
            <FilterField label="🔍 Recherche">
              <FilterInput value={search} onChange={e => setSearch(e.target.value)} placeholder="Nom de l'article ou du produit…" />
            </FilterField>
            <FilterField label="🏷️ Catégorie">
              <FilterSelect value={catFilter} onChange={e => setCatFilter(e.target.value)}>
                <option value="">— Toutes —</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </FilterSelect>
            </FilterField>
          </HistoryFilterBar>

          {/* Bloc de saisie de la vente (sous les filtres) */}
          <div className="card" style={{ padding: '16px 20px', marginBottom: 16 }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 800, color: CD, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>
              🧾 Informations de la vente
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label style={lblStyle}>Acheteur *</label>
                <select value={acheteurId} onChange={e => setAcheteurId(e.target.value)} style={{ ...inp, minWidth: 200 }}>
                  <option value="">— Choisir —</option>
                  {acheteurs.map(a => <option key={a.id} value={a.id}>{a.nom}{a.entreprise ? ` (${a.entreprise})` : ''}</option>)}
                </select>
              </div>
              <div>
                <label style={lblStyle}>Labo source *</label>
                <select value={laboId} onChange={e => setLaboId(e.target.value)} style={{ ...inp, minWidth: 160 }}>
                  <option value="">— Choisir —</option>
                  {labos.map(l => <option key={l.id} value={l.id}>{l.nom}</option>)}
                </select>
              </div>
              <div>
                <label style={lblStyle}>Date (commande & expédition) *</label>
                <input type="date" value={dateCommande} onChange={e => setDateCommande(e.target.value)} style={inp} />
              </div>
              <div>
                <label style={lblStyle}>État *</label>
                <select value={statutVente} onChange={e => setStatutVente(e.target.value as 'expediee' | 'livree')} style={inp}>
                  <option value="expediee">🚚 Expédiée</option>
                  <option value="livree">✅ Livrée</option>
                </select>
              </div>
              {statutVente === 'livree' && (
                <div>
                  <label style={lblStyle}>Date de livraison *</label>
                  <input type="date" value={dateLivraison} onChange={e => setDateLivraison(e.target.value)} style={inp} />
                </div>
              )}
              <div>
                <label style={lblStyle}>Promotion / remise %</label>
                <input value={remise} onChange={e => setRemise(e.target.value)} style={{ ...inp, width: 70, textAlign: 'right' }} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', fontWeight: 600, color: timbre ? CD : '#64748b', cursor: 'pointer', paddingBottom: 8 }}>
                <input type="checkbox" checked={timbre} onChange={e => setTimbre(e.target.checked)} style={{ accentColor: C }} />
                Timbre fiscal (1.000 DT)
              </label>
              <button onClick={submit} disabled={saving || !champsValides}
                title={!champsValides ? 'Renseignez l\'acheteur, le labo et au moins une quantité' : undefined}
                style={{ marginLeft: 'auto', padding: '11px 24px', borderRadius: 10, border: 'none', background: champsValides && !saving ? `linear-gradient(135deg, ${CD}, ${C})` : '#cbd5e1', color: '#fff', fontWeight: 800, fontSize: '0.88rem', cursor: champsValides && !saving ? 'pointer' : 'not-allowed', boxShadow: champsValides && !saving ? '0 4px 14px rgba(109,40,217,0.3)' : 'none' }}>
                {saving ? 'Enregistrement…' : '✅ Valider la vente'}
              </button>
            </div>
          </div>

          {/* Catalogue de saisie par catégorie (paginé 5 catégories / 10 lignes) */}
          {groupes.length === 0 ? (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', marginBottom: 110 }}>Aucun résultat avec ces filtres.</div>
          ) : (
            <div style={{ marginBottom: 110 }}>
              {groupesAffiches.map(([cat, items]) => {
                const lignePage = lignePageDe(cat, items.length);
                const itemsAffiches = items.slice((lignePage - 1) * LIGNES_PAR_CAT, lignePage * LIGNES_PAR_CAT);
                const nbSaisies = items.filter(o => parseNum(getLigne(keyOf(o)).quantite) > 0).length;
                return (
                  <div key={cat} className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: CL, borderBottom: `2px solid ${CB}` }}>
                      <span style={{ fontWeight: 800, color: CD, fontSize: '0.92rem' }}>{cat}</span>
                      <span style={{ fontSize: '0.76rem', color: '#7c3aed', fontWeight: 600 }}>
                        {items.length} article{items.length > 1 ? 's' : ''}
                      </span>
                      {nbSaisies > 0 && (
                        <span style={{ marginLeft: 'auto', fontSize: '0.72rem', fontWeight: 700, background: '#ede9fe', color: CD, borderRadius: 20, padding: '2px 10px' }}>
                          🧺 {nbSaisies} dans la vente
                        </span>
                      )}
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                        <thead>
                          <tr style={{ background: '#faf9ff', borderBottom: `1px solid ${CB}` }}>
                            {['Article / Produit', 'Tarif', 'Quantité', 'Prix HT', 'Total HT'].map(h => (
                              <th key={h} style={{ textAlign: h === 'Article / Produit' ? 'left' : 'center', padding: '9px 14px', color: CD, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {itemsAffiches.map(o => {
                            const k = keyOf(o);
                            const l = getLigne(k);
                            const prixHt = l.prix !== '' ? parseNum(l.prix) : prixDefautHt(o);
                            const enPromo = !!o.promoActive && (o.promoPct ?? 0) > 0;
                            const qte = parseNum(l.quantite) || 0;
                            const total = qte > 0 && Number.isFinite(prixHt) ? prixHt * qte : 0;
                            return (
                              <tr key={k} style={{ borderBottom: '1px solid #f1f5f9', background: qte > 0 ? '#f5f3ff55' : 'transparent' }}>
                                <td style={{ padding: '9px 14px' }}>
                                  <div style={{ fontWeight: 700, color: '#1e293b' }}>{o.nom}</div>
                                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{o.unite}</div>
                                </td>
                                <td style={{ padding: '9px 14px', textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                  {enPromo ? (
                                    <>
                                      <span style={{ textDecoration: 'line-through' }}>{o.prixUnitaireHt.toFixed(3)}</span>{' '}
                                      <strong style={{ color: '#b45309' }}>{prixDefautHt(o).toFixed(3)} DT HT</strong>
                                      <span style={{ marginLeft: 5, fontSize: '0.66rem', fontWeight: 800, background: '#fef3c7', color: '#92400e', borderRadius: 20, padding: '1px 7px' }}>−{o.promoPct}%</span>
                                      <div style={{ fontSize: '0.72rem' }}>TVA {o.tauxTva || 0}%</div>
                                    </>
                                  ) : (
                                    <>{o.prixUnitaireHt.toFixed(3)} DT HT · TVA {o.tauxTva || 0}%</>
                                  )}
                                </td>
                                <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                                  <input value={l.quantite} onChange={e => setLigne(k, { quantite: e.target.value })} placeholder="0"
                                    style={{ ...inp, width: 74, textAlign: 'right', borderColor: qte > 0 ? C : '#e2e8f0' }} />
                                </td>
                                <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                                  <input value={l.prix} onChange={e => setLigne(k, { prix: e.target.value })}
                                    placeholder={prixDefautHt(o).toFixed(3)}
                                    title={enPromo ? `Prix HT promo (−${o.promoPct} %) — modifiable pour cette vente` : 'Prix HT (modifiable pour cette vente)'}
                                    style={{ ...inp, width: 88, textAlign: 'right' }} />
                                </td>
                                <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 800, color: total > 0 ? CD : '#cbd5e1', whiteSpace: 'nowrap' }}>
                                  {total > 0 ? fmt(total) : '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      <Pagination total={items.length} page={lignePage} perPage={LIGNES_PAR_CAT}
                        onChange={p => setLignePages(prev => ({ ...prev, [cat]: p }))} accent={PAGE_ACCENT} />
                    </div>
                  </div>
                );
              })}
              {/* Pagination des catégories (5 par page) */}
              {totalCatPages > 1 && (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <Pagination total={groupes.length} page={catPageCourante} perPage={CATS_PAR_PAGE}
                    onChange={setCatPage} accent={PAGE_ACCENT} />
                </div>
              )}
            </div>
          )}

          {/* Aperçu de la saisie — purement INFORMATIF (la validation se fait dans le
              bloc de saisie) : récapitule l'acheteur, les dates, l'état, la promotion
              et les totaux au fil de la saisie. */}
          <div style={{ position: 'fixed', bottom: 18, right: 24, zIndex: 90, background: '#fff', border: `1.5px solid ${CB}`, borderRadius: 14, boxShadow: '0 12px 36px rgba(76,29,149,0.22)', padding: '14px 18px', minWidth: 300, maxWidth: 340 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: CD, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              👁️ Aperçu de la vente
            </div>
            {/* Date et état ont toujours une valeur : le bloc est rendu sans condition
                (acheteur/labo/promotion s'y ajoutent dès qu'ils sont renseignés) */}
            <div style={{ display: 'grid', gap: 3, fontSize: '0.78rem', color: '#475569', marginBottom: 8, paddingBottom: 8, borderBottom: '1px dashed #e2e8f0' }}>
              {acheteurChoisi && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <span>👤 Acheteur</span>
                    <strong style={{ color: '#1e293b', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acheteurChoisi.nom}</strong>
                  </div>
                )}
                {laboChoisi && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <span>🧪 Labo source</span><strong style={{ color: '#1e293b' }}>{laboChoisi.nom}</strong>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span>📅 Commande / expédition</span><strong style={{ color: '#1e293b' }}>{fmtDate(dateCommande)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span>🚚 État</span>
                  <strong style={{ color: statutVente === 'livree' ? '#166534' : '#1d4ed8' }}>
                    {statutVente === 'livree' ? '✅ Livrée' : '🚚 Expédiée'}
                  </strong>
                </div>
                {statutVente === 'livree' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <span>📦 Livraison</span><strong style={{ color: '#1e293b' }}>{fmtDate(dateLivraison)}</strong>
                  </div>
                )}
                {totaux.remisePct > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <span>🏷️ Promotion</span><strong style={{ color: '#b45309' }}>−{totaux.remisePct}%</strong>
                  </div>
                )}
            </div>
            {/* Lignes de la commande — récap compact, défilement au-delà de ~6 lignes */}
            {lignesActives.length > 0 && (
              <div style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px dashed #e2e8f0' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 800, color: CD, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>
                  🧺 Lignes ({lignesActives.length})
                </div>
                <div style={{ maxHeight: 150, overflowY: 'auto', display: 'grid', gap: 3 }}>
                  {lignesActives.map(({ o, l }) => {
                    const prixHt = l.prix !== '' ? parseNum(l.prix) : prixDefautHt(o);
                    const qte = parseNum(l.quantite) || 0;
                    const total = Number.isFinite(prixHt) ? prixHt * qte : 0;
                    return (
                      <div key={keyOf(o)} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.76rem', color: '#475569' }}>
                        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${o.nom} — ${qte} ${o.unite}`}>
                          {o.nom} <span style={{ color: '#94a3b8', fontWeight: 700 }}>×{qte}</span>
                        </span>
                        <strong style={{ whiteSpace: 'nowrap', color: '#1e293b' }}>{fmt(total)}</strong>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#475569', marginBottom: 4 }}>
              <span>Total brut HT ({lignesActives.length} ligne{lignesActives.length > 1 ? 's' : ''})</span><strong>{fmt(totaux.brutHt)}</strong>
            </div>
            {totaux.remisePct > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#b91c1c', marginBottom: 4 }}>
                <span>Remise {totaux.remisePct}%</span><strong>− {fmt(totaux.remiseVal)}</strong>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#475569', marginBottom: 4 }}>
              <span>TVA</span><strong>{fmt(totaux.tva)}</strong>
            </div>
            {timbre && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#475569', marginBottom: 4 }}>
                <span>Timbre fiscal</span><strong>{fmt(totaux.timbreVal)}</strong>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem', color: CD, borderTop: `1px solid ${CB}`, paddingTop: 8, marginTop: 6 }}>
              <strong>NET À PAYER</strong><strong>{fmt(totaux.total)}</strong>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
