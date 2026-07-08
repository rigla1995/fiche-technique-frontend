import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../api/client';

// Thème violet de l'Espace Acheteurs
const C = '#6d28d9';
const CD = '#4c1d95';
const CL = '#f5f3ff';
const CB = '#c4b5fd';

interface Acheteur { id: number; nom: string; entreprise: string | null; remisePct: number; actif: boolean }
interface Labo { id: number; nom: string }
interface Offre {
  articleType: 'ingredient' | 'produit'; articleId: number; nom: string; unite: string; categorie: string;
  prixUnitaireTtc: number; tauxTva: number; tailleLot: number | null; prixLotTtc: number | null; actif: boolean;
}
interface Ligne { mode: 'unite' | 'lot'; quantite: string; prix: string }
interface Manquant { nom: string; unite: string; disponible: number; necessaire: number; manquant: number }

const keyOf = (o: { articleType: string; articleId: number }) => `${o.articleType}:${o.articleId}`;
const inp: React.CSSProperties = { padding: '7px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.84rem', fontFamily: 'inherit' };
const parseNum = (v: string) => Number(String(v).replace(',', '.'));

export default function VenteAcheteurPage() {
  const navigate = useNavigate();
  const [acheteurs, setAcheteurs] = useState<Acheteur[]>([]);
  const [labos, setLabos] = useState<Labo[]>([]);
  const [offres, setOffres] = useState<Offre[]>([]);
  const [loading, setLoading] = useState(true);

  const [acheteurId, setAcheteurId] = useState('');
  const [laboId, setLaboId] = useState('');
  const [dateCommande, setDateCommande] = useState(new Date().toISOString().slice(0, 10));
  const [remise, setRemise] = useState('0');
  const [timbre, setTimbre] = useState(true);
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');

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

  // Remise pré-remplie depuis la fiche acheteur (modifiable)
  useEffect(() => {
    const a = acheteurs.find(x => String(x.id) === acheteurId);
    if (a) setRemise(String(a.remisePct ?? 0));
  }, [acheteurId, acheteurs]);

  const getLigne = (k: string): Ligne => lignes[k] || { mode: 'unite', quantite: '', prix: '' };
  const setLigne = (k: string, patch: Partial<Ligne>) =>
    setLignes(prev => ({ ...prev, [k]: { ...getLigne(k), ...patch } }));

  const prixDefaut = (o: Offre, mode: 'unite' | 'lot') => mode === 'lot' ? (o.prixLotTtc ?? 0) : o.prixUnitaireTtc;

  const lignesActives = useMemo(() =>
    offres.map(o => ({ o, l: getLigne(keyOf(o)) }))
      .filter(({ l }) => parseNum(l.quantite) > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [offres, lignes]);

  const totaux = useMemo(() => {
    let brut = 0;
    for (const { o, l } of lignesActives) {
      const prix = l.prix !== '' ? parseNum(l.prix) : prixDefaut(o, l.mode);
      brut += (Number.isFinite(prix) ? prix : 0) * parseNum(l.quantite);
    }
    const r = Math.min(Math.max(parseNum(remise) || 0, 0), 100);
    const net = brut * (1 - r / 100);
    const timbreVal = timbre ? 1 : 0;
    return { brut, remisePct: r, remiseVal: brut - net, net, timbreVal, total: net + timbreVal };
  }, [lignesActives, remise, timbre]);

  const fmt = (n: number) => `${n.toFixed(3)} DT`;

  const submit = async () => {
    setError(''); setManquants([]); setSuccess(null);
    if (!acheteurId) { setError('Choisissez un acheteur'); return; }
    if (!laboId) { setError('Choisissez un labo'); return; }
    if (lignesActives.length === 0) { setError('Saisissez au moins une quantité'); return; }
    setSaving(true);
    try {
      const { data } = await api.post('/api/acheteurs/ventes', {
        acheteurId: Number(acheteurId),
        laboId: Number(laboId),
        dateCommande,
        remisePct: remise,
        timbreFiscal: timbre,
        notes: notes.trim() || undefined,
        lignes: lignesActives.map(({ o, l }) => ({
          articleType: o.articleType,
          articleId: o.articleId,
          mode: l.mode,
          quantite: parseNum(l.quantite),
          prixTtc: l.prix !== '' ? parseNum(l.prix) : undefined,
        })),
      });
      setSuccess({ numero: data.facture.numero, factureId: data.facture.id, montantTtc: data.facture.montantTtc });
      setLignes({}); setNotes('');
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

  const offresFiltrees = offres.filter(o => !search.trim() || o.nom.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="page-content">
      {/* Hero */}
      <div style={{ background: `linear-gradient(135deg, ${CD} 0%, ${C} 55%, #8b5cf6 100%)`, borderRadius: 18, padding: '24px 28px', marginBottom: 20, boxShadow: '0 8px 32px rgba(109,40,217,0.28)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🧾</div>
          <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Nouvelle Vente Acheteur</h1>
        </div>
        <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>
          Vente depuis le stock labo — le stock est déduit et la facture générée automatiquement
        </p>
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

      {/* En-tête de vente */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: 16, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: CD, marginBottom: 4 }}>Acheteur *</label>
          <select value={acheteurId} onChange={e => setAcheteurId(e.target.value)} style={{ ...inp, minWidth: 200 }}>
            <option value="">— Choisir —</option>
            {acheteurs.map(a => <option key={a.id} value={a.id}>{a.nom}{a.entreprise ? ` (${a.entreprise})` : ''}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: CD, marginBottom: 4 }}>Labo source *</label>
          <select value={laboId} onChange={e => setLaboId(e.target.value)} style={{ ...inp, minWidth: 160 }}>
            <option value="">— Choisir —</option>
            {labos.map(l => <option key={l.id} value={l.id}>{l.nom}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: CD, marginBottom: 4 }}>Date</label>
          <input type="date" value={dateCommande} onChange={e => setDateCommande(e.target.value)} style={inp} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: CD, marginBottom: 4 }}>Remise %</label>
          <input value={remise} onChange={e => setRemise(e.target.value)} style={{ ...inp, width: 70, textAlign: 'right' }} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', fontWeight: 600, color: timbre ? CD : '#64748b', cursor: 'pointer', paddingBottom: 8 }}>
          <input type="checkbox" checked={timbre} onChange={e => setTimbre(e.target.checked)} style={{ accentColor: C }} />
          Timbre fiscal (1.000 DT)
        </label>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: CD, marginBottom: 4 }}>Notes (facture)</label>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optionnel" style={{ ...inp, width: '100%', boxSizing: 'border-box' }} />
        </div>
      </div>

      {/* Catalogue de saisie */}
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Filtrer les articles…"
            style={{ ...inp, width: 260, marginBottom: 12 }} />
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 110 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                <thead>
                  <tr style={{ background: CL, borderBottom: `2px solid ${CB}` }}>
                    {['Article / Produit', 'Vendu par', 'Quantité', 'Prix TTC', 'Total ligne'].map(h => (
                      <th key={h} style={{ textAlign: h === 'Article / Produit' ? 'left' : 'center', padding: '10px 14px', color: CD, fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {offresFiltrees.map(o => {
                    const k = keyOf(o);
                    const l = getLigne(k);
                    const prix = l.prix !== '' ? parseNum(l.prix) : prixDefaut(o, l.mode);
                    const qte = parseNum(l.quantite) || 0;
                    const total = qte > 0 && Number.isFinite(prix) ? prix * qte : 0;
                    return (
                      <tr key={k} style={{ borderBottom: '1px solid #f1f5f9', background: qte > 0 ? '#f5f3ff55' : 'transparent' }}>
                        <td style={{ padding: '9px 14px' }}>
                          <div style={{ fontWeight: 700, color: '#1e293b' }}>{o.nom}</div>
                          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{o.unite} · {o.categorie}</div>
                        </td>
                        <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                          {o.tailleLot ? (
                            <select value={l.mode} onChange={e => setLigne(k, { mode: e.target.value as 'unite' | 'lot', prix: '' })} style={{ ...inp, padding: '6px 8px' }}>
                              <option value="unite">Unité ({o.prixUnitaireTtc.toFixed(3)} DT)</option>
                              <option value="lot">Lot de {o.tailleLot} ({(o.prixLotTtc ?? 0).toFixed(3)} DT)</option>
                            </select>
                          ) : (
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Unité ({o.prixUnitaireTtc.toFixed(3)} DT)</span>
                          )}
                        </td>
                        <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                          <input value={l.quantite} onChange={e => setLigne(k, { quantite: e.target.value })} placeholder="0"
                            style={{ ...inp, width: 74, textAlign: 'right', borderColor: qte > 0 ? C : '#e2e8f0' }} />
                        </td>
                        <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                          <input value={l.prix} onChange={e => setLigne(k, { prix: e.target.value })}
                            placeholder={prixDefaut(o, l.mode).toFixed(3)}
                            title="Prix TTC (modifiable pour cette vente)"
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
            </div>
          </div>

          {/* Récap flottant */}
          <div style={{ position: 'fixed', bottom: 18, right: 24, zIndex: 90, background: '#fff', border: `1.5px solid ${CB}`, borderRadius: 14, boxShadow: '0 12px 36px rgba(76,29,149,0.22)', padding: '14px 18px', minWidth: 280 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#475569', marginBottom: 4 }}>
              <span>Total brut ({lignesActives.length} ligne{lignesActives.length > 1 ? 's' : ''})</span><strong>{fmt(totaux.brut)}</strong>
            </div>
            {totaux.remisePct > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#b91c1c', marginBottom: 4 }}>
                <span>Remise {totaux.remisePct}%</span><strong>− {fmt(totaux.remiseVal)}</strong>
              </div>
            )}
            {timbre && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#475569', marginBottom: 4 }}>
                <span>Timbre fiscal</span><strong>{fmt(totaux.timbreVal)}</strong>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem', color: CD, borderTop: `1px solid ${CB}`, paddingTop: 8, marginTop: 6 }}>
              <strong>NET À PAYER</strong><strong>{fmt(totaux.total)}</strong>
            </div>
            <button onClick={submit} disabled={saving || lignesActives.length === 0 || !acheteurId || !laboId}
              style={{ width: '100%', marginTop: 10, padding: '11px 0', borderRadius: 10, border: 'none', background: lignesActives.length && acheteurId && laboId ? `linear-gradient(135deg, ${CD}, ${C})` : '#cbd5e1', color: '#fff', fontWeight: 800, fontSize: '0.9rem', cursor: saving ? 'default' : 'pointer' }}>
              {saving ? 'Enregistrement…' : '✅ Valider la vente'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
