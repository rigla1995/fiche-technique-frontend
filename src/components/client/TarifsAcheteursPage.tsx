import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import GuideButton from './GuideButton';

// Thème violet de l'Espace Acheteurs
const C = '#6d28d9';
const CD = '#4c1d95';
const CL = '#f5f3ff';
const CB = '#c4b5fd';

interface OffreRow {
  articleType: 'ingredient' | 'produit';
  articleId: number;
  nom: string;
  unite: string;
  categorie: string;
  famille: string | null;
  categorieProduit?: string | null; // catégorie produit (onglet produits)
  offreId: number | null;
  prixUnitaireHt: number;
  tauxTva: number;
  prixUnitaireTtc: number;
  actif: boolean;
}

interface EditState { prixU: string; tva: string; actif: boolean }

const keyOf = (r: { articleType: string; articleId: number }) => `${r.articleType}:${r.articleId}`;
const toEdit = (r: OffreRow): EditState => ({
  prixU: r.prixUnitaireHt ? String(r.prixUnitaireHt) : '',
  tva: String(r.tauxTva ?? 0),
  actif: r.actif,
});
const sameEdit = (a: EditState, b: EditState) => a.prixU === b.prixU && a.tva === b.tva && a.actif === b.actif;

const numOf = (v: string) => Number(String(v).replace(',', '.')) || 0;
const ttcOf = (e: EditState) => Math.round(numOf(e.prixU) * (1 + numOf(e.tva) / 100) * 1000) / 1000;

const cellInp: React.CSSProperties = { width: 76, padding: '6px 8px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.82rem', fontFamily: 'inherit', textAlign: 'right' };

export default function TarifsAcheteursPage() {
  const [articles, setArticles] = useState<OffreRow[]>([]);
  const [produits, setProduits] = useState<OffreRow[]>([]);
  const [tab, setTab] = useState<'articles' | 'produits'>('articles');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [etatFilter, setEtatFilter] = useState<'tous' | 'proposes' | 'non'>('tous');
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [baseline, setBaseline] = useState<Record<string, EditState>>({});
  const [flash, setFlash] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.get('/api/acheteurs/offres')
      .then(({ data }) => {
        setArticles(data.articles);
        setProduits(data.produits);
        const all = [...data.articles, ...data.produits] as OffreRow[];
        const e: Record<string, EditState> = {};
        for (const r of all) e[keyOf(r)] = toEdit(r);
        setEdits(e);
        setBaseline(JSON.parse(JSON.stringify(e)));
      })
      .catch(() => setError('Erreur de chargement des tarifs'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows = tab === 'articles' ? articles : produits;
  const filtreActif = !!search.trim() || !!catFilter || etatFilter !== 'tous';
  const filtered = rows.filter(r => {
    if (search.trim() && !r.nom.toLowerCase().includes(search.trim().toLowerCase())) return false;
    if (catFilter && r.categorie !== catFilter) return false;
    // Filtre d'état évalué sur l'état ENREGISTRÉ : une ligne en cours d'édition
    // ne disparaît pas de l'écran quand on bascule son toggle.
    const b = baseline[keyOf(r)];
    if (etatFilter === 'proposes' && !b?.actif) return false;
    if (etatFilter === 'non' && b?.actif) return false;
    return true;
  });

  // Groupement par catégorie (sections repliées par défaut ; ouvertes quand un filtre est actif)
  const groupes = useMemo(() => {
    const map = new Map<string, OffreRow[]>();
    for (const r of filtered) {
      const g = map.get(r.categorie) || [];
      g.push(r);
      map.set(r.categorie, g);
    }
    return [...map.entries()];
  }, [filtered]);
  const categoriesDuTab = useMemo(() => [...new Set(rows.map(r => r.categorie))], [rows]);

  const dirtyKeys = useMemo(
    () => Object.keys(edits).filter(k => baseline[k] && !sameEdit(edits[k], baseline[k])),
    [edits, baseline]
  );
  const dirtyInCat = (items: OffreRow[]) => items.filter(r => {
    const k = keyOf(r);
    return baseline[k] && edits[k] && !sameEdit(edits[k], baseline[k]);
  }).length;

  const setField = (k: string, field: keyof EditState, v: string | boolean) =>
    setEdits(prev => ({ ...prev, [k]: { ...prev[k], [field]: v } }));

  const saveAll = async () => {
    if (dirtyKeys.length === 0) return;
    setSaving(true); setError(''); setFlash('');
    const all = [...articles, ...produits];
    const errors: string[] = [];
    for (const k of dirtyKeys) {
      const r = all.find(x => keyOf(x) === k)!;
      const e = edits[k];
      try {
        await api.post('/api/acheteurs/offres', {
          articleType: r.articleType,
          articleId: r.articleId,
          prixUnitaireHt: e.prixU === '' ? 0 : numOf(e.prixU),
          tauxTva: e.tva === '' ? 0 : numOf(e.tva),
          actif: e.actif,
        });
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erreur';
        errors.push(`${r.nom} : ${msg}`);
      }
    }
    setSaving(false);
    if (errors.length) {
      // Ne PAS recharger : les saisies non enregistrées resteraient sinon écrasées
      setError(errors.join(' — '));
    } else {
      setFlash(`${dirtyKeys.length} tarif${dirtyKeys.length > 1 ? 's' : ''} enregistré${dirtyKeys.length > 1 ? 's' : ''}`);
      load();
    }
  };

  const nbActifs = [...articles, ...produits].filter(r => edits[keyOf(r)]?.actif).length;

  return (
    <div className="page-content">
      {/* Hero */}
      <div style={{ background: `linear-gradient(135deg, ${CD} 0%, ${C} 55%, #8b5cf6 100%)`, borderRadius: 18, padding: '24px 28px', marginBottom: 20, boxShadow: '0 8px 32px rgba(109,40,217,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>💲</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Tarifs Acheteurs</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>
            Prix unitaires HT (+ TVA) des articles et produits proposés à vos acheteurs — le TTC se calcule tout seul
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 14, padding: '10px 20px', textAlign: 'center', minWidth: 90 }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff' }}>{nbActifs}</div>
            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.75)', fontWeight: 600 }}>proposé{nbActifs !== 1 ? 's' : ''}</div>
          </div>
          <GuideButton section="acheteurs-tarifs" />
        </div>
      </div>

      {flash && <div style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#166534', borderRadius: 10, padding: '10px 16px', marginBottom: 14, fontSize: '0.85rem', fontWeight: 600 }}>{flash}</div>}
      {error && <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 10, padding: '10px 16px', marginBottom: 14, fontSize: '0.85rem', fontWeight: 600 }}>{error}</div>}

      {/* Onglets + filtres + save */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {(['articles', 'produits'] as const).map(t => (
          <button key={t} onClick={() => { setTab(t); setCatFilter(''); }}
            style={{ padding: '9px 18px', borderRadius: 10, border: `1.5px solid ${tab === t ? C : '#e2e8f0'}`, background: tab === t ? CL : '#fff', color: tab === t ? CD : '#475569', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
            {t === 'articles' ? `🧂 Articles (${articles.length})` : `🍱 Produits (${produits.length})`}
          </button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Rechercher…"
          style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.84rem', fontFamily: 'inherit', width: 190 }} />
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
          style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.84rem', fontFamily: 'inherit', maxWidth: 200 }}>
          <option value="">Toutes les catégories</option>
          {categoriesDuTab.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={etatFilter} onChange={e => setEtatFilter(e.target.value as typeof etatFilter)}
          style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.84rem', fontFamily: 'inherit' }}>
          <option value="tous">Tous les états</option>
          <option value="proposes">Proposés</option>
          <option value="non">Non proposés</option>
        </select>
        <button onClick={saveAll} disabled={saving || dirtyKeys.length === 0}
          style={{ marginLeft: 'auto', padding: '10px 22px', borderRadius: 10, border: 'none', background: dirtyKeys.length ? `linear-gradient(135deg, ${CD}, ${C})` : '#cbd5e1', color: '#fff', fontWeight: 700, fontSize: '0.86rem', cursor: dirtyKeys.length ? 'pointer' : 'default', boxShadow: dirtyKeys.length ? '0 4px 14px rgba(109,40,217,0.3)' : 'none' }}>
          {saving ? 'Enregistrement…' : `💾 Enregistrer${dirtyKeys.length ? ` (${dirtyKeys.length})` : ''}`}
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Chargement…</div>
      ) : rows.length === 0 ? (
        <div style={{ background: CL, border: `2px dashed ${CB}`, borderRadius: 16, padding: '40px 28px', textAlign: 'center' }}>
          <div style={{ fontSize: '2.4rem', marginBottom: 10 }}>{tab === 'articles' ? '🧂' : '🍱'}</div>
          <div style={{ fontWeight: 800, color: CD, marginBottom: 8 }}>
            {tab === 'articles' ? 'Aucun article commandable' : 'Aucun produit proposable'}
          </div>
          <div style={{ fontSize: '0.86rem', color: '#5b21b6', maxWidth: 460, margin: '0 auto', lineHeight: 1.6 }}>
            {tab === 'articles'
              ? <>Activez le toggle <strong>Commandable</strong> sur les articles concernés dans <Link to="/client/referentiel/articles" style={{ color: C, fontWeight: 700 }}>Référentiel → Articles</Link> : ils apparaîtront ici.</>
              : <>Créez des produits composés d'origine labo, ou rattachez vos produits utilisables à un labo : ils apparaîtront ici.</>}
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Aucun résultat avec ces filtres.</div>
      ) : (
        groupes.map(([cat, items]) => {
          const open = filtreActif || openCats[cat] === true;
          const nbProposes = items.filter(r => edits[keyOf(r)]?.actif).length;
          const nbDirty = dirtyInCat(items);
          return (
            <div key={cat} className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
              {/* En-tête de section (repliée par défaut) */}
              <button onClick={() => setOpenCats(prev => ({ ...prev, [cat]: !open }))}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: CL, border: 'none', borderBottom: open ? `2px solid ${CB}` : 'none', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ color: CD, fontSize: '0.8rem', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block' }}>▶</span>
                <span style={{ fontWeight: 800, color: CD, fontSize: '0.92rem' }}>{cat}</span>
                <span style={{ fontSize: '0.76rem', color: '#7c3aed', fontWeight: 600 }}>
                  {items.length} article{items.length > 1 ? 's' : ''} · {nbProposes} proposé{nbProposes !== 1 ? 's' : ''}
                </span>
                {nbDirty > 0 && (
                  <span style={{ marginLeft: 'auto', fontSize: '0.72rem', fontWeight: 700, background: '#fef3c7', color: '#92400e', borderRadius: 20, padding: '2px 10px' }}>
                    {nbDirty} non enregistré{nbDirty > 1 ? 's' : ''}
                  </span>
                )}
              </button>
              {open && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                    <thead>
                      <tr style={{ background: '#faf9ff', borderBottom: `1px solid ${CB}` }}>
                        {[tab === 'articles' ? 'Article' : 'Produit', 'Prix unité HT', 'TVA %', 'Prix TTC', 'Proposé'].map(h => (
                          <th key={h} style={{ textAlign: h === 'Article' || h === 'Produit' ? 'left' : 'center', padding: '8px 14px', color: CD, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(r => {
                        const k = keyOf(r);
                        const e = edits[k];
                        if (!e) return null;
                        const dirty = baseline[k] && !sameEdit(e, baseline[k]);
                        const prixValide = numOf(e.prixU) > 0;
                        return (
                          <tr key={k} style={{ borderBottom: '1px solid #f1f5f9', background: dirty ? '#fffbeb' : 'transparent' }}>
                            <td style={{ padding: '9px 14px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 700, color: '#1e293b' }}>{r.nom}</span>
                                {r.categorieProduit && (
                                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: CD, background: CL, border: `1px solid ${CB}`, borderRadius: 20, padding: '2px 9px', whiteSpace: 'nowrap' }}>
                                    🏷️ {r.categorieProduit}
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                {r.unite}{r.famille ? ` · ${r.famille}` : ''}
                              </div>
                            </td>
                            <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                              <input value={e.prixU} onChange={ev => setField(k, 'prixU', ev.target.value)} placeholder="0.000" style={{ ...cellInp, borderColor: dirty ? '#f59e0b' : '#e2e8f0' }} />
                            </td>
                            <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                              <input value={e.tva} onChange={ev => setField(k, 'tva', ev.target.value)} placeholder="0" style={{ ...cellInp, width: 52 }} />
                            </td>
                            <td style={{ padding: '9px 14px', textAlign: 'center', fontWeight: 700, color: prixValide ? CD : '#cbd5e1', whiteSpace: 'nowrap' }}>
                              {prixValide ? `${ttcOf(e).toFixed(3)} DT` : '—'}
                            </td>
                            <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                              <button onClick={() => prixValide || e.actif ? setField(k, 'actif', !e.actif) : undefined}
                                title={!prixValide && !e.actif ? 'Renseignez un prix unitaire HT > 0 pour proposer cet article' : undefined}
                                style={{ background: 'none', border: 'none', cursor: prixValide || e.actif ? 'pointer' : 'not-allowed', padding: 0, opacity: prixValide || e.actif ? 1 : 0.45 }}>
                                <div style={{ width: 36, height: 20, borderRadius: 10, position: 'relative', background: e.actif ? C : '#cbd5e1', transition: 'background 0.2s', margin: '0 auto' }}>
                                  <div style={{ position: 'absolute', top: 2, left: e.actif ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.18)', transition: 'left 0.2s' }} />
                                </div>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
