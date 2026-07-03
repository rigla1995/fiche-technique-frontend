import { useState, useEffect } from 'react';
import api from '../../api/client';
import type { CategorieProduit, ActiviteIngredient } from '../../types';

interface Labo { id: number; nom: string; }
interface Act { id: number; nom: string; laboId?: number | null; }
interface Line { id: string; portion: string; }

interface Props {
  categories: CategorieProduit[]; // catégories de type 'valorise'
  editProductId?: number;         // si fourni → mode édition
  onClose: () => void;
  onCreated: () => void;
}

// Création / édition d'un PRODUIT VALORISÉ COMPOSÉ — même ergonomie que les Produits Vendables :
// wizard à étapes (Affectation labo → Identité → Articles → Produits Utilisables → Récap).
// Le produit est fabriqué au labo, transféré vers les activités cochées (PT), vendu tel quel (valorisé).
export default function ComposedValoriseModal({ categories, editProductId, onClose, onCreated }: Props) {
  type Step = 1 | 2 | 3 | 4 | 5 | 6;
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState('');
  const [refProduit, setRefProduit] = useState('');
  const [categorieId, setCategorieId] = useState('');
  const [labos, setLabos] = useState<Labo[]>([]);
  const [activites, setActivites] = useState<Act[]>([]);
  const [selectedLabos, setSelectedLabos] = useState<number[]>([]);
  const [checkedActivites, setCheckedActivites] = useState<number[]>([]);
  const [articles, setArticles] = useState<ActiviteIngredient[]>([]);
  const [utilisables, setUtilisables] = useState<{ id: number; name: string }[]>([]);
  const [ingLines, setIngLines] = useState<Line[]>([]);
  const [subLines, setSubLines] = useState<Line[]>([]);
  const [search, setSearch] = useState('');
  const [subSearch, setSubSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get('/api/labo').then(({ data }) => setLabos((data as Labo[]).map((l) => ({ id: l.id, nom: l.nom })))).catch(() => {});
    api.get('/api/entreprise/activites')
      .then(({ data }) => setActivites((data as Act[]).map((a) => ({ id: a.id, nom: a.nom, laboId: (a as any).laboId }))))
      .catch(() => {});
  }, []);

  // Articles consommables ET PU des labos choisis (intersection).
  useEffect(() => {
    if (selectedLabos.length === 0) { setArticles([]); setUtilisables([]); return; }
    const ids = selectedLabos.join(',');
    api.get(`/api/labo/articles-consommables?laboIds=${ids}`).then(({ data }) => setArticles(data as ActiviteIngredient[])).catch(() => setArticles([]));
    api.get(`/api/produits/utilisables-perimetre?origine=labo&ids=${ids}`).then(({ data }) => setUtilisables(data as { id: number; name: string }[])).catch(() => setUtilisables([]));
  }, [selectedLabos]);

  // Mode édition : pré-remplit tout.
  useEffect(() => {
    if (!editProductId) return;
    api.get(`/api/products/${editProductId}`).then(({ data }) => {
      const p = data as { name: string; refProduit?: string | null; categorieProduitId?: number | null; laboIds?: number[]; activiteStockIds?: number[]; ingredients?: { ingredientId: number; portion: number }[]; subProducts?: { subProductId: number; portion: number }[] };
      setName(p.name || '');
      setRefProduit(p.refProduit || '');
      setCategorieId(p.categorieProduitId ? String(p.categorieProduitId) : '');
      setSelectedLabos(p.laboIds || []);
      setCheckedActivites(p.activiteStockIds || []);
      setIngLines((p.ingredients || []).map((i) => ({ id: String(i.ingredientId), portion: String(i.portion) })));
      setSubLines((p.subProducts || []).map((s) => ({ id: String(s.subProductId), portion: String(s.portion) })));
    }).catch(() => {});
  }, [editProductId]);

  const linkedActivites = activites.filter((a) => a.laboId != null && selectedLabos.includes(Number(a.laboId)));
  // Toggle d'un labo : n'ajuste QUE les activités de CE labo (auto-cochées à l'ajout,
  // retirées au retrait) — les décoches manuelles sur les autres labos sont préservées.
  const toggleLabo = (id: number) =>
    setSelectedLabos((prev) => {
      const isOn = prev.includes(id);
      const next = isOn ? prev.filter((x) => x !== id) : [...prev, id];
      const laboActs = activites.filter((a) => Number(a.laboId) === id).map((a) => a.id);
      setCheckedActivites((ca) => isOn
        ? ca.filter((x) => !laboActs.includes(x))
        : [...new Set([...ca, ...laboActs])]);
      return next;
    });

  const ingIds = new Set(ingLines.map((l) => l.id));
  const subIds = new Set(subLines.map((l) => l.id));
  const toggleIng = (id: string) => setIngLines((p) => ingIds.has(id) ? p.filter((l) => l.id !== id) : [...p, { id, portion: '' }]);
  const toggleSub = (id: string) => setSubLines((p) => subIds.has(id) ? p.filter((l) => l.id !== id) : [...p, { id, portion: '' }]);
  const setIngPortion = (id: string, v: string) => setIngLines((p) => p.map((l) => l.id === id ? { ...l, portion: v } : l));
  const setSubPortion = (id: string, v: string) => setSubLines((p) => p.map((l) => l.id === id ? { ...l, portion: v } : l));

  const validIng = ingLines.filter((l) => l.id && parseFloat(l.portion) > 0);
  const validSub = subLines.filter((l) => l.id && parseFloat(l.portion) > 0);
  const canStep2 = selectedLabos.length > 0;
  const canStep3 = !!name.trim() && !!categorieId;
  const canSave = canStep2 && canStep3 && (validIng.length + validSub.length) >= 1;

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const payload = {
        name: name.trim(), refProduit: refProduit.trim() || null, type: 'vendable', origine: 'labo',
        categorieProduitId: parseInt(categorieId), laboIds: selectedLabos, activiteIds: checkedActivites,
        ingredients: validIng.map((l) => ({ ingredientId: parseInt(l.id), portion: parseFloat(l.portion) })),
        subProducts: validSub.map((l) => ({ subProductId: parseInt(l.id), portion: parseFloat(l.portion) })),
      };
      if (editProductId) await api.put(`/api/products/${editProductId}`, payload);
      else await api.post('/api/products', payload);
      onCreated();
    } catch (e: unknown) {
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erreur lors de l\'enregistrement.');
    } finally { setSaving(false); }
  };

  const STEPS = [
    { n: 1, label: 'Affectation' }, { n: 2, label: 'Identité' }, { n: 3, label: 'Articles' },
    { n: 4, label: 'Produits Utilisables' }, { n: 5, label: 'Récap' },
  ];
  const lbl: React.CSSProperties = { display: 'block', fontWeight: 700, fontSize: '0.8rem', color: '#3730a3', marginBottom: 5 };
  const nextBtn = (enabled: boolean, to: Step) => (
    <button disabled={!enabled} onClick={() => setStep(to)}
      style={{ background: enabled ? 'linear-gradient(135deg,#4338ca,#6366f1)' : '#e5e7eb', border: 'none', borderRadius: 10, color: enabled ? '#fff' : '#9ca3af', fontWeight: 700, padding: '9px 22px', cursor: enabled ? 'pointer' : 'not-allowed' }}>Suivant →</button>
  );
  const filteredArticles = articles.filter((a) => !search || a.nom.toLowerCase().includes(search.toLowerCase()));
  const filteredUtil = utilisables.filter((u) => !subSearch || u.name.toLowerCase().includes(subSearch.toLowerCase()));

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 600, width: '95vw', maxHeight: '92vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)', padding: '18px 22px 14px', borderRadius: '12px 12px 0 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: '1rem', marginBottom: 12 }}>💎 {editProductId ? 'Modifier' : 'Nouveau'} produit valorisé composé</div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 900, fontSize: '1.1rem', cursor: 'pointer', padding: '2px 9px', lineHeight: 1 }}>×</button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {STEPS.map((s) => (
              <div key={s.n} style={{ flex: 1 }}>
                <div style={{ height: 4, borderRadius: 4, background: s.n <= step ? '#fff' : 'rgba(255,255,255,0.28)' }} />
                <div style={{ fontSize: '0.66rem', color: s.n <= step ? '#fff' : 'rgba(255,255,255,0.5)', fontWeight: 600, marginTop: 4 }}>{s.n < step ? '✓ ' : ''}{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Step 1 — Affectation (labo + activités liées cochables) */}
          {step === 1 && (
            <>
              <div style={{ fontSize: '0.82rem', color: '#64748b' }}>Fabriqué au labo, transféré vers les activités cochées, vendu tel quel (valorisé).</div>
              <div>
                <label style={lbl}>Labo(s) de fabrication <span style={{ color: '#ef4444' }}>*</span></label>
                {labos.length === 0 ? <div style={{ fontSize: '0.82rem', color: '#b45309' }}>Aucun labo disponible.</div> : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {labos.map((l) => { const on = selectedLabos.includes(l.id); return (
                      <button type="button" key={l.id} onClick={() => toggleLabo(l.id)}
                        style={{ padding: '6px 12px', borderRadius: 8, border: `1.5px solid ${on ? '#6366f1' : '#e2e8f0'}`, background: on ? '#f0fdf4' : '#fff', color: on ? '#3730a3' : '#374151', fontWeight: on ? 700 : 500, fontSize: '0.82rem', cursor: 'pointer' }}>🏭 {l.nom}{on ? ' ✓' : ''}</button>
                    ); })}
                  </div>
                )}
              </div>
              {selectedLabos.length > 0 && (
                <div>
                  <label style={lbl}>Activités qui recevront le produit (transfert) — décochez pour exclure</label>
                  {linkedActivites.length === 0 ? <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Aucune activité rattachée à ce(s) labo(s).</div> : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {linkedActivites.map((a) => { const on = checkedActivites.includes(a.id); return (
                        <button type="button" key={a.id} onClick={() => setCheckedActivites((p) => on ? p.filter((x) => x !== a.id) : [...p, a.id])}
                          style={{ padding: '5px 12px', borderRadius: 20, border: `1.5px solid ${on ? '#6366f1' : '#e2e8f0'}`, background: on ? '#f0fdf4' : '#fff', color: on ? '#3730a3' : '#94a3b8', fontWeight: on ? 700 : 500, fontSize: '0.78rem', cursor: 'pointer' }}>{on ? '✓ ' : ''}{a.nom}</button>
                      ); })}
                    </div>
                  )}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6 }}>
                <button className="btn btn-ghost" onClick={onClose}>Annuler</button>{nextBtn(canStep2, 2)}
              </div>
            </>
          )}

          {/* Step 2 — Identité */}
          {step === 2 && (
            <>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}><label style={lbl}>Nom <span style={{ color: '#ef4444' }}>*</span></label>
                  <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Cookie maison" style={{ width: '100%' }} autoFocus /></div>
                <div style={{ width: 140 }}><label style={lbl}>Réf.</label>
                  <input className="input" value={refProduit} onChange={(e) => setRefProduit(e.target.value)} placeholder="REF-001" style={{ width: '100%' }} /></div>
              </div>
              <div><label style={lbl}>Catégorie (valorisé) <span style={{ color: '#ef4444' }}>*</span></label>
                <select className="input" value={categorieId} onChange={(e) => setCategorieId(e.target.value)} style={{ width: '100%', maxWidth: 320, borderColor: categorieId ? '#c7d2fe' : '#fca5a5' }}>
                  <option value="">— Sélectionner —</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {categories.length === 0 && <div style={{ fontSize: '0.76rem', color: '#b45309', marginTop: 4 }}>Aucune catégorie « valorisé ». Créez-en dans Catégories Produits.</div>}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6 }}>
                <button className="btn btn-ghost" onClick={() => setStep(1)}>← Retour</button>{nextBtn(canStep3, 3)}
              </div>
            </>
          )}

          {/* Step 3 — Articles */}
          {step === 3 && (
            <>
              <label style={lbl}>Recette — articles du labo <span style={{ fontWeight: 400, color: '#94a3b8' }}>({validIng.length} avec portion)</span></label>
              <input className="input" placeholder="🔍 Rechercher un article…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: '100%', fontSize: '0.82rem' }} />
              <div style={{ maxHeight: 230, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 10, padding: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {filteredArticles.length === 0 ? <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px 0', fontSize: '0.85rem' }}>Aucun article consommable commun aux labos.</div> :
                  filteredArticles.map((ing) => { const sid = String(ing.id); const sel = ingIds.has(sid); const line = ingLines.find((l) => l.id === sid); const valid = sel && parseFloat(line?.portion || '0') > 0; return (
                    <div key={ing.id} onClick={() => toggleIng(sid)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 8, background: sel ? (valid ? '#eef2ff' : '#fef3c7') : 'transparent', cursor: 'pointer' }}>
                      <input type="checkbox" checked={sel} readOnly style={{ accentColor: '#6366f1', width: 15, height: 15, flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: '0.84rem', fontWeight: sel ? 600 : 400, color: sel ? '#3730a3' : '#374151' }}>{ing.nom}</span>
                      {sel && <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={(e) => e.stopPropagation()}>
                        <input type="number" step="0.001" min="0" placeholder="portion" value={line?.portion || ''} onChange={(e) => setIngPortion(sid, e.target.value)}
                          style={{ width: 72, padding: '3px 6px', borderRadius: 6, border: `1.5px solid ${valid ? '#c7d2fe' : '#ef4444'}`, fontSize: '0.82rem', textAlign: 'right' }} />
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{ing.unite}</span></div>}
                    </div>
                  ); })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6 }}>
                <button className="btn btn-ghost" onClick={() => setStep(2)}>← Retour</button>{nextBtn(true, 4)}
              </div>
            </>
          )}

          {/* Step 4 — Produits Utilisables (PU des labos choisis) */}
          {step === 4 && (
            <>
              <label style={lbl}>Produits utilisables du/des labo(s) <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optionnel — {validSub.length} sélectionné{validSub.length !== 1 ? 's' : ''})</span></label>
              {utilisables.length === 0 ? (
                <div style={{ padding: 14, borderRadius: 8, background: '#faf5ff', border: '1px solid #ede9fe', fontSize: '0.85rem', color: '#5b21b6', textAlign: 'center' }}>Aucun produit utilisable disponible pour ce(s) labo(s).</div>
              ) : (<>
                <input className="input" placeholder="🔍 Rechercher un PU…" value={subSearch} onChange={(e) => setSubSearch(e.target.value)} style={{ width: '100%', fontSize: '0.82rem' }} />
                <div style={{ maxHeight: 210, overflowY: 'auto', border: '1px solid #ede9fe', borderRadius: 10, padding: 6, background: '#faf5ff', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {filteredUtil.map((u) => { const sid = String(u.id); const sel = subIds.has(sid); const line = subLines.find((l) => l.id === sid); const valid = sel && parseFloat(line?.portion || '0') > 0; return (
                    <div key={u.id} onClick={() => toggleSub(sid)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 8, background: sel ? (valid ? '#f3e8ff' : '#fef3c7') : 'transparent', cursor: 'pointer' }}>
                      <input type="checkbox" checked={sel} readOnly style={{ accentColor: '#7c3aed', width: 15, height: 15, flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: '0.84rem', fontWeight: sel ? 600 : 400, color: sel ? '#5b21b6' : '#374151' }}>🔄 {u.name}</span>
                      {sel && <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={(e) => e.stopPropagation()}>
                        <input type="number" step="0.001" min="0" placeholder="portion" value={line?.portion || ''} onChange={(e) => setSubPortion(sid, e.target.value)}
                          style={{ width: 72, padding: '3px 6px', borderRadius: 6, border: `1.5px solid ${valid ? '#c4b5fd' : '#ef4444'}`, fontSize: '0.82rem', textAlign: 'right' }} />
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>unité</span></div>}
                    </div>
                  ); })}
                </div>
              </>)}
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6 }}>
                <button className="btn btn-ghost" onClick={() => setStep(3)}>← Retour</button>{nextBtn(true, 5)}
              </div>
            </>
          )}

          {/* Step 5 — Récap */}
          {step === 5 && (
            <>
              <div style={{ background: 'linear-gradient(135deg,#f0fdf4,#e0e7ff)', border: '1.5px solid #c7d2fe', borderRadius: 14, padding: '14px 16px' }}>
                <div style={{ fontWeight: 800, color: '#3730a3', fontSize: '1.05rem' }}>💎 {name || '—'}</div>
                <div style={{ fontSize: '0.8rem', color: '#6366f1', marginTop: 2 }}>{categories.find((c) => String(c.id) === categorieId)?.name ?? '—'} · {validIng.length} article(s) · {validSub.length} PU</div>
                <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: 8 }}>🏭 {selectedLabos.map((id) => labos.find((l) => l.id === id)?.nom).filter(Boolean).join(', ')}</div>
                <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: 2 }}>🔄 Reçu par : {checkedActivites.length === 0 ? '— (non distribué)' : checkedActivites.map((id) => activites.find((a) => a.id === id)?.nom).filter(Boolean).join(', ')}</div>
              </div>
              {error && <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 8, padding: '10px 14px', color: '#b91c1c', fontWeight: 700, fontSize: '0.85rem' }}>⛔ {error}</div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6 }}>
                <button className="btn btn-ghost" onClick={() => setStep(4)}>← Retour</button>
                <button className="btn btn-primary" disabled={!canSave || saving} onClick={save}>{saving ? 'Enregistrement…' : (editProductId ? 'Enregistrer ✓' : 'Créer le produit ✓')}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
