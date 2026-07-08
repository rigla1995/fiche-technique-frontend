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
  offreId: number | null;
  prixUnitaireTtc: number;
  tauxTva: number;
  tailleLot: number | null;
  prixLotTtc: number | null;
  actif: boolean;
}

interface EditState { prixU: string; tva: string; tailleLot: string; prixLot: string; actif: boolean }

const keyOf = (r: { articleType: string; articleId: number }) => `${r.articleType}:${r.articleId}`;
const toEdit = (r: OffreRow): EditState => ({
  prixU: r.prixUnitaireTtc ? String(r.prixUnitaireTtc) : '',
  tva: String(r.tauxTva ?? 0),
  tailleLot: r.tailleLot != null ? String(r.tailleLot) : '',
  prixLot: r.prixLotTtc != null ? String(r.prixLotTtc) : '',
  actif: r.actif,
});
const sameEdit = (a: EditState, b: EditState) =>
  a.prixU === b.prixU && a.tva === b.tva && a.tailleLot === b.tailleLot && a.prixLot === b.prixLot && a.actif === b.actif;

const cellInp: React.CSSProperties = { width: 76, padding: '6px 8px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.82rem', fontFamily: 'inherit', textAlign: 'right' };

export default function TarifsAcheteursPage() {
  const [articles, setArticles] = useState<OffreRow[]>([]);
  const [produits, setProduits] = useState<OffreRow[]>([]);
  const [tab, setTab] = useState<'articles' | 'produits'>('articles');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
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
  const filtered = rows.filter(r => !search.trim() || r.nom.toLowerCase().includes(search.trim().toLowerCase()));

  const dirtyKeys = useMemo(
    () => Object.keys(edits).filter(k => baseline[k] && !sameEdit(edits[k], baseline[k])),
    [edits, baseline]
  );

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
          prixUnitaireTtc: e.prixU === '' ? 0 : Number(String(e.prixU).replace(',', '.')),
          tauxTva: e.tva === '' ? 0 : Number(String(e.tva).replace(',', '.')),
          tailleLot: e.tailleLot === '' ? null : Number(String(e.tailleLot).replace(',', '.')),
          prixLotTtc: e.prixLot === '' ? null : Number(String(e.prixLot).replace(',', '.')),
          actif: e.actif,
        });
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erreur';
        errors.push(`${r.nom} : ${msg}`);
      }
    }
    setSaving(false);
    if (errors.length) setError(errors.join(' — '));
    else setFlash(`${dirtyKeys.length} tarif${dirtyKeys.length > 1 ? 's' : ''} enregistré${dirtyKeys.length > 1 ? 's' : ''}`);
    load();
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
            Prix à l'unité et par lot (TTC) des articles et produits composés proposés à vos acheteurs
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

      {/* Onglets + recherche + save */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {(['articles', 'produits'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '9px 18px', borderRadius: 10, border: `1.5px solid ${tab === t ? C : '#e2e8f0'}`, background: tab === t ? CL : '#fff', color: tab === t ? CD : '#475569', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
            {t === 'articles' ? `🧂 Articles (${articles.length})` : `🍱 Produits composés (${produits.length})`}
          </button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Rechercher…"
          style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.84rem', fontFamily: 'inherit', width: 220 }} />
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
            {tab === 'articles' ? 'Aucun article proposable' : 'Aucun produit composé labo'}
          </div>
          <div style={{ fontSize: '0.86rem', color: '#5b21b6', maxWidth: 460, margin: '0 auto', lineHeight: 1.6 }}>
            {tab === 'articles'
              ? <>Activez le toggle <strong>Achetable</strong> sur les familles concernées dans <Link to="/client/referentiel/familles" style={{ color: C, fontWeight: 700 }}>Référentiel → Familles</Link> : leurs articles apparaîtront ici.</>
              : <>Créez des produits composés d'origine labo dans l'Espace Produits : ils apparaîtront ici.</>}
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
              <thead>
                <tr style={{ background: CL, borderBottom: `2px solid ${CB}` }}>
                  {[tab === 'articles' ? 'Article' : 'Produit', 'Prix unité TTC', 'TVA %', 'Taille lot', 'Prix lot TTC', 'Proposé'].map(h => (
                    <th key={h} style={{ textAlign: h === 'Article' || h === 'Produit' ? 'left' : 'center', padding: '10px 14px', color: CD, fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const k = keyOf(r);
                  const e = edits[k];
                  if (!e) return null;
                  const dirty = baseline[k] && !sameEdit(e, baseline[k]);
                  const prixValide = Number(String(e.prixU).replace(',', '.')) > 0;
                  return (
                    <tr key={k} style={{ borderBottom: '1px solid #f1f5f9', background: dirty ? '#fffbeb' : 'transparent' }}>
                      <td style={{ padding: '9px 14px' }}>
                        <div style={{ fontWeight: 700, color: '#1e293b' }}>{r.nom}</div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                          {r.unite} · {r.categorie}{r.famille ? ` · ${r.famille}` : ''}
                        </div>
                      </td>
                      <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                        <input value={e.prixU} onChange={ev => setField(k, 'prixU', ev.target.value)} placeholder="0.000" style={{ ...cellInp, borderColor: dirty ? '#f59e0b' : '#e2e8f0' }} />
                      </td>
                      <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                        <input value={e.tva} onChange={ev => setField(k, 'tva', ev.target.value)} placeholder="0" style={{ ...cellInp, width: 52 }} />
                      </td>
                      <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                        <input value={e.tailleLot} onChange={ev => setField(k, 'tailleLot', ev.target.value)} placeholder="—" title={`Nombre de ${r.unite} par lot`} style={{ ...cellInp, width: 58 }} />
                      </td>
                      <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                        <input value={e.prixLot} onChange={ev => setField(k, 'prixLot', ev.target.value)} placeholder="—" style={{ ...cellInp }} />
                      </td>
                      <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                        <button onClick={() => prixValide || e.actif ? setField(k, 'actif', !e.actif) : undefined}
                          title={!prixValide && !e.actif ? 'Renseignez un prix unitaire > 0 pour proposer cet article' : undefined}
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
        </div>
      )}
    </div>
  );
}
